-- Business owner dashboard (dashboard/). An owner signs in with an email code and sees and edits only the
-- businesses they are a member of. Reads go through RLS and the RPCs below, each of which checks
-- membership. Anything that needs a secret (PINs, signed QR codes) goes through the business-admin
-- Edge Function, never from the browser.

create table public.business_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')), -- staff: reserved, no dashboard access yet
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index business_members_business on public.business_members (business_id);
alter table public.business_members enable row level security;
revoke all on public.business_members from anon, authenticated;
grant select on public.business_members to authenticated;
create policy "own memberships: read" on public.business_members for select to authenticated using (user_id = auth.uid());

-- True when the signed-in user owns the business. Security definer so policies can call it without
-- business_members being readable row by row.
create function public.is_business_owner(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_members where business_id = p_business and user_id = auth.uid() and role = 'owner'
  )
$$;
revoke all on function public.is_business_owner(uuid) from public, anon;
grant execute on function public.is_business_owner(uuid) to authenticated;

-- Owners see their business and its programs even while paused.
create policy "owner: own business" on public.businesses for select to authenticated using (is_business_owner(id));
create policy "owner: own programs" on public.programs for select to authenticated using (is_business_owner(business_id));

-- Owners edit the running program in place. Cards keep the rules they were opened with (cards snapshot),
-- so a change applies to new cards only; the cooldown applies at once.
create policy "owner: edit own programs" on public.programs for update to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
grant update (name, type, goal, step, reward, rule, redeem_rule, cooldown_minutes) on public.programs to authenticated;

-- Staff PINs: owners see names and dates, never the hash.
grant select (id, business_id, name, active, created_at) on public.staff_pins to authenticated;
create policy "owner: own staff" on public.staff_pins for select to authenticated using (is_business_owner(business_id));

-- Alerts: owners read them and mark them seen.
grant select on public.business_alerts to authenticated;
grant update (seen_at) on public.business_alerts to authenticated;
create policy "owner: own alerts" on public.business_alerts for select to authenticated using (is_business_owner(business_id));
create policy "owner: mark alerts seen" on public.business_alerts for update to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- How a business sees a customer: their name, else the last 4 digits of their phone, else a masked email.
-- Never the full number or address.
create function public.customer_label(p_user uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    nullif(trim(p.name), ''),
    case when u.phone is not null and length(u.phone) >= 4 then '•••' || right(u.phone, 4) end,
    case when u.email like '%@%' then left(u.email, 1) || '•••@' || split_part(u.email, '@', 2) end,
    'לקוח/ה'
  )
  from auth.users u left join profiles p on p.id = u.id
  where u.id = p_user
$$;
revoke all on function public.customer_label(uuid) from public, anon, authenticated;

-- Log: stamps and redemptions, newest first, with the staff member who confirmed.
create function public.business_log(p_business uuid, p_days int default 30, p_limit int default 300)
returns table (kind text, created_at timestamptz, amount int, reward text, staff_name text, customer text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_business_owner(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select l.kind, l.created_at, l.amount, l.reward, coalesce(s.name, 'צוות'), coalesce(customer_label(l.user_id), 'לקוח/ה')
  from (
    select 'stamp'::text as kind, e.created_at, e.amount, null::text as reward, e.staff_pin_id, e.user_id
    from stamp_events e where e.business_id = p_business and e.created_at > now() - make_interval(days => p_days)
    union all
    select 'redeem', r.created_at, null, r.reward, r.staff_pin_id, r.user_id
    from redemptions r where r.business_id = p_business and r.created_at > now() - make_interval(days => p_days)
  ) l
  left join staff_pins s on s.id = l.staff_pin_id
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 1000);
end $$;

-- Insights for the last p_days days. A visit is a collection; days are counted in Israel time.
--   active_customers     customers with at least one visit
--   returning_customers  customers with visits on at least two different days
--   rewards_redeemed     redemptions
--   visits               collections
--   visits_per_customer  visits / active customers
create function public.business_insights(p_business uuid, p_days int)
returns table (active_customers int, returning_customers int, rewards_redeemed int, visits int, visits_per_customer numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_business_owner(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with v as (
    select user_id, count(*) as n, count(distinct (created_at at time zone 'Asia/Jerusalem')::date) as days
    from stamp_events
    where business_id = p_business and created_at > now() - make_interval(days => p_days)
    group by user_id
  )
  select
    (select count(*) from v)::int,
    (select count(*) from v where days >= 2)::int,
    (select count(*) from redemptions where business_id = p_business and created_at > now() - make_interval(days => p_days))::int,
    coalesce((select sum(n) from v), 0)::int,
    coalesce(round((select avg(n) from v), 1), 0);
end $$;

-- Alerts with the customer label (business_alerts itself only holds the user id).
create function public.business_alert_list(p_business uuid, p_limit int default 100)
returns table (id uuid, kind text, created_at timestamptz, seen_at timestamptz, failures int, customer text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_business_owner(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select a.id, a.kind, a.created_at, a.seen_at, a.failures, case when a.user_id is null then null else customer_label(a.user_id) end
  from business_alerts a
  where a.business_id = p_business
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

revoke all on function public.business_log(uuid, int, int) from public, anon;
revoke all on function public.business_insights(uuid, int) from public, anon;
revoke all on function public.business_alert_list(uuid, int) from public, anon;
grant execute on function public.business_log(uuid, int, int) to authenticated;
grant execute on function public.business_insights(uuid, int) to authenticated;
grant execute on function public.business_alert_list(uuid, int) to authenticated;
