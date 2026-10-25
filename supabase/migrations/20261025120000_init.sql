-- Perko v1 schema. Row Level Security is on for every table.
-- The app reads through RLS with the user's JWT. Stamps, points and redemptions are written only by
-- the Edge Functions (service role) through the security-definer functions at the end of this file.

create extension if not exists pgcrypto;

-- Profiles ------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);

-- Businesses and their programs -------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  kind text not null,                     -- shown under the name, e.g. "בית קפה שכונתי"
  category text not null check (category in ('cafe', 'food', 'shop')),
  initial text not null check (char_length(initial) between 1 and 2),
  tone text not null default 'pale' check (tone in ('lime', 'ink', 'pale')),
  address text,
  hours text,
  website text,
  is_sample boolean not null default false, -- illustrative data, labelled in the app
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,                     -- e.g. "כרטיס קפה"
  type text not null check (type in ('stamps', 'points')),
  goal int not null check (goal between 1 and 100000),
  step int not null default 1 check (step between 1 and 100000),
  reward text not null,                   -- e.g. "קפה הפוך עלינו"
  rule text not null,                     -- how collection works, e.g. "חותמת על כל משקה חם"
  redeem_rule text not null default 'בקופה, מול הצוות',
  cooldown_minutes int not null default 120 check (cooldown_minutes between 0 and 10080),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type = 'points' or step = 1)
);
create unique index programs_one_active_per_business on public.programs (business_id) where active;

-- Counter QR codes: one row per printed code. The token is signed with a server secret
-- (see supabase/functions/_shared/token.ts); turning active off revokes a code.
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key_version int not null default 1,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Cards, events, redemptions ----------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  current int not null default 0 check (current >= 0),
  status text not null default 'active' check (status in ('active', 'complete', 'redeemed')),
  version int not null default 0,          -- optimistic lock for collect and redeem
  last_collected_at timestamptz,
  completed_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
-- At most one open card (active or complete) per user and program.
create unique index cards_one_open on public.cards (user_id, program_id) where status <> 'redeemed';
create index cards_user on public.cards (user_id);

create table public.stamp_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount int not null check (amount > 0),
  source text not null default 'qr' check (source in ('qr', 'nfc')), -- nfc reserved for a later version
  qr_code_id uuid references public.qr_codes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stamp_events_card on public.stamp_events (card_id, created_at desc);
create index stamp_events_user on public.stamp_events (user_id, created_at desc);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  reward text not null,
  created_at timestamptz not null default now()
);
create index redemptions_user on public.redemptions (user_id, created_at desc);

-- Row Level Security ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.programs enable row level security;
alter table public.qr_codes enable row level security;
alter table public.cards enable row level security;
alter table public.stamp_events enable row level security;
alter table public.redemptions enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile: create" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile: update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "participating businesses" on public.businesses for select to authenticated using (active);
create policy "active programs" on public.programs for select to authenticated
  using (active and exists (select 1 from public.businesses b where b.id = business_id and b.active));

-- qr_codes: no policies. Only the service role (Edge Functions, admin script) can see them.

create policy "own cards: read" on public.cards for select to authenticated using (user_id = auth.uid());
-- "הוספה לארנק": a user may only open an empty card on an active program. No update policy: the client
-- can never change current, status or version.
create policy "own cards: add empty" on public.cards for insert to authenticated
  with check (
    user_id = auth.uid() and current = 0 and status = 'active' and version = 0
    and last_collected_at is null and completed_at is null and redeemed_at is null
    and exists (select 1 from public.programs p where p.id = program_id and p.active)
  );

create policy "own events: read" on public.stamp_events for select to authenticated using (user_id = auth.uid());
create policy "own redemptions: read" on public.redemptions for select to authenticated using (user_id = auth.uid());

-- Column privileges: belt and braces on top of RLS.
revoke all on public.cards from anon, authenticated;
grant select on public.cards to authenticated;
grant insert (user_id, program_id) on public.cards to authenticated;
revoke all on public.stamp_events, public.redemptions, public.qr_codes from anon, authenticated;
grant select on public.stamp_events, public.redemptions to authenticated;
revoke all on public.businesses, public.programs from anon;
revoke insert, update, delete on public.businesses, public.programs from authenticated;
grant select on public.businesses, public.programs to authenticated;
revoke all on public.profiles from anon;
grant select, insert, update (name) on public.profiles to authenticated;

-- Atomic writes used by the Edge Functions ------------------------------------------------------
-- Both check the card version so two scans at the same moment cannot both pass the cooldown.

create or replace function public.apply_collect(
  p_card_id uuid, p_expected_version int, p_current int, p_status text,
  p_amount int, p_business_id uuid, p_qr_code_id uuid, p_source text default 'qr'
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

  insert into stamp_events (card_id, user_id, business_id, amount, source, qr_code_id)
  values (p_card_id, v_user, p_business_id, p_amount, p_source, p_qr_code_id);
  return true;
end $$;

create or replace function public.apply_redeem(p_card_id uuid, p_expected_version int)
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
  insert into redemptions (card_id, user_id, business_id, reward)
  values (v_card.id, v_card.user_id, v_program.business_id, v_program.reward);

  -- A new, empty card starts on the same program when it is still running.
  if v_program.active then
    insert into cards (user_id, program_id) values (v_card.user_id, v_card.program_id) returning id into v_new;
  end if;
  return coalesce(v_new, v_card.id);
end $$;

revoke all on function public.apply_collect(uuid, int, int, text, int, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.apply_redeem(uuid, int) from public, anon, authenticated;
grant execute on function public.apply_collect(uuid, int, int, text, int, uuid, uuid, text) to service_role;
grant execute on function public.apply_redeem(uuid, int) to service_role;
