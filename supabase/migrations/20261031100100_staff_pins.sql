-- Staff PIN confirmation at the counter. A stamp or a redemption is written only after a staff member types
-- a 4-digit PIN on the customer's phone; the counter QR alone is no longer enough (it can be photographed).
-- The PIN is checked by the Edge Functions. The database stores HMAC-SHA256(PIN_SECRET, business id + PIN),
-- never the PIN: 4 digits are trivial to brute-force from a plain hash, not from a keyed one.

-- One code for the whole team (default) or a code per staff member.
alter table public.businesses
  add column pin_mode text not null default 'shared' check (pin_mode in ('shared', 'per_staff'));

-- In shared mode the business has a single active row named "צוות". Removing a staff member or resetting a
-- PIN deactivates the row (it stays for the log); a reset inserts a new row.
create table public.staff_pins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  pin_hash text not null check (pin_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- The PIN identifies the staff member, so it is unique among the business's active codes.
create unique index staff_pins_unique_pin on public.staff_pins (business_id, pin_hash) where active;
create index staff_pins_business on public.staff_pins (business_id) where active;

alter table public.stamp_events add column staff_pin_id uuid references public.staff_pins (id) on delete set null;
alter table public.redemptions add column staff_pin_id uuid references public.staff_pins (id) on delete set null;
create index stamp_events_business on public.stamp_events (business_id, created_at desc);
create index redemptions_business on public.redemptions (business_id, created_at desc);

-- Every wrong PIN, for the lockout and for the business owner.
create table public.pin_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  context text not null check (context in ('collect', 'redeem')),
  created_at timestamptz not null default now()
);
create index pin_failures_user on public.pin_failures (user_id, business_id, created_at desc);
create index pin_failures_business on public.pin_failures (business_id, created_at desc);

-- Shown to the business owner in the dashboard.
--   pin_lockout   a customer reached the limit of wrong PINs and is blocked until the end of the day
--   pin_failures  many wrong PINs across customers within an hour (someone may be guessing)
create table public.business_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('pin_lockout', 'pin_failures')),
  user_id uuid references auth.users (id) on delete set null,
  failures int,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index business_alerts_business on public.business_alerts (business_id, created_at desc);

alter table public.staff_pins enable row level security;
alter table public.pin_failures enable row level security;
alter table public.business_alerts enable row level security;
-- No client policies here: owners get read access in the business_members migration. Writes go through the
-- Edge Functions (service role) and the functions below.
revoke all on public.staff_pins, public.pin_failures, public.business_alerts from anon, authenticated;

-- Lockout ---------------------------------------------------------------------------------------------

-- Wrong PINs allowed per customer, business and day before the lockout.
create function public.pin_max_failures() returns int language sql immutable as $$ select 3 $$;

-- The end of the current day in Israel (midnight Asia/Jerusalem), when a lockout ends.
create function public.israel_day_end(p_at timestamptz default now()) returns timestamptz
language sql stable as $$
  select (date_trunc('day', p_at at time zone 'Asia/Jerusalem') + interval '1 day') at time zone 'Asia/Jerusalem'
$$;

-- Consecutive wrong PINs today: counted from the start of the day in Israel or the customer's last
-- successful PIN at this business, whichever is later. A staff typo now and then never adds up to a lockout.
create function public.pin_failures_today(p_user uuid, p_business uuid) returns int
language sql stable security definer set search_path = public as $$
  with since as (
    select greatest(
      israel_day_end() - interval '1 day',
      coalesce((select max(created_at) from stamp_events where user_id = p_user and business_id = p_business and staff_pin_id is not null), '-infinity'),
      coalesce((select max(created_at) from redemptions where user_id = p_user and business_id = p_business and staff_pin_id is not null), '-infinity')
    ) as t
  )
  select count(*)::int from pin_failures f, since
  where f.user_id = p_user and f.business_id = p_business and f.created_at > since.t
$$;

-- When the customer is locked out at the business: midnight in Israel, or null when they are not.
create function public.pin_locked_until(p_user uuid, p_business uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when pin_failures_today(p_user, p_business) >= pin_max_failures() then israel_day_end() end
$$;

-- Records one wrong PIN. Returns how many consecutive wrong PINs the customer has today; at the limit it
-- raises a lockout alert. Many failures across customers within an hour raise one pin_failures alert an hour.
create function public.register_pin_failure(p_user uuid, p_business uuid, p_context text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_hour int;
begin
  insert into pin_failures (user_id, business_id, context) values (p_user, p_business, p_context);
  v_count := pin_failures_today(p_user, p_business);
  if v_count = pin_max_failures() then
    insert into business_alerts (business_id, kind, user_id, failures) values (p_business, 'pin_lockout', p_user, v_count);
  end if;

  select count(*) into v_hour from pin_failures where business_id = p_business and created_at > now() - interval '1 hour';
  if v_hour >= 10 and not exists (
    select 1 from business_alerts where business_id = p_business and kind = 'pin_failures' and created_at > now() - interval '1 hour'
  ) then
    insert into business_alerts (business_id, kind, failures) values (p_business, 'pin_failures', v_hour);
  end if;
  return v_count;
end $$;

-- Atomic writes, now with the staff member who confirmed --------------------------------------------

drop function public.apply_collect(uuid, int, int, text, int, uuid, uuid, text);
create function public.apply_collect(
  p_card_id uuid, p_expected_version int, p_current int, p_status text,
  p_amount int, p_business_id uuid, p_qr_code_id uuid, p_source text default 'qr', p_staff_pin_id uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  update cards set
    current = p_current,
    status = p_status,
    version = version + 1,
    last_collected_at = now(),
    completed_at = case when p_status = 'complete' then now() else completed_at end
  where id = p_card_id and version = p_expected_version and status = 'active'
  returning user_id into v_user;
  if not found then return false; end if;

  insert into stamp_events (card_id, user_id, business_id, amount, source, qr_code_id, staff_pin_id)
  values (p_card_id, v_user, p_business_id, p_amount, p_source, p_qr_code_id, p_staff_pin_id);
  return true;
end $$;

drop function public.apply_redeem(uuid, int);
create function public.apply_redeem(p_card_id uuid, p_expected_version int, p_staff_pin_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_card cards%rowtype;
  v_program programs%rowtype;
  v_new uuid;
begin
  update cards set status = 'redeemed', redeemed_at = now(), version = version + 1
  where id = p_card_id and version = p_expected_version and status = 'complete'
  returning * into v_card;
  if not found then return null; end if;

  select * into v_program from programs where id = v_card.program_id;
  insert into redemptions (card_id, user_id, business_id, reward, staff_pin_id)
  values (v_card.id, v_card.user_id, v_program.business_id, v_card.reward, p_staff_pin_id);

  -- A new, empty card starts on the same program when it is still running, with the program's current rules.
  if v_program.active then
    insert into cards (user_id, program_id) values (v_card.user_id, v_card.program_id) returning id into v_new;
  end if;
  return coalesce(v_new, v_card.id);
end $$;

revoke all on function public.apply_collect(uuid, int, int, text, int, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.apply_redeem(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.pin_failures_today(uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_pin_failure(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pin_locked_until(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_collect(uuid, int, int, text, int, uuid, uuid, text, uuid) to service_role;
grant execute on function public.apply_redeem(uuid, int, uuid) to service_role;
grant execute on function public.pin_failures_today(uuid, uuid) to service_role;
grant execute on function public.register_pin_failure(uuid, uuid, text) to service_role;
grant execute on function public.pin_locked_until(uuid, uuid) to service_role;
