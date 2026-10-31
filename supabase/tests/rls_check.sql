-- Plain-Postgres check of the schema, RLS and the atomic write functions, without the Supabase stack.
-- Run with scripts/test-db.sh (creates a throwaway database with a minimal auth schema).
\set ON_ERROR_STOP 1
insert into auth.users (id, phone, email) values
  ('11111111-1111-4111-8111-111111111111', '972501234567', null),
  ('22222222-2222-4222-8222-222222222222', null, 'dana@example.com'),
  ('33333333-3333-4333-8333-333333333333', null, 'owner@example.com');

create function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL %: expected an error', label;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  raise notice 'ok   %  (%)', label, sqlerrm;
end $$;
grant execute on function pg_temp.expect_error(text, text) to public;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin assert (select count(*) from businesses) = 5, 'businesses visible'; raise notice 'ok   user sees the 5 sample businesses'; end $$;
select pg_temp.expect_error($q$insert into cards (user_id, program_id, current) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001', 5)$q$, 'client cannot set current');
select pg_temp.expect_error($q$insert into cards (user_id, program_id) values ('22222222-2222-4222-8222-222222222222','b0000000-0000-4000-8000-000000000001')$q$, 'client cannot add a card for someone else');
insert into cards (user_id, program_id) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001');
select pg_temp.expect_error($q$insert into cards (user_id, program_id) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001')$q$, 'one open card per program');
select pg_temp.expect_error($q$update cards set current = 9$q$, 'client cannot update cards');
select pg_temp.expect_error($q$insert into stamp_events (card_id, user_id, business_id, amount) select id, user_id, 'a0000000-0000-4000-8000-000000000001', 1 from cards$q$, 'client cannot write stamp events');
select pg_temp.expect_error($q$select * from qr_codes$q$, 'client cannot read qr codes');
select pg_temp.expect_error($q$select apply_collect(id, 0, 1, 'active', 1, 'a0000000-0000-4000-8000-000000000001', null) from cards$q$, 'client cannot call apply_collect');
reset role;

set role service_role;
do $$
declare c uuid; ok boolean; n uuid;
begin
  select id into c from cards;
  ok := apply_collect(c, 0, 10, 'complete', 1, 'a0000000-0000-4000-8000-000000000001', null);
  assert ok, 'first collect applies';
  ok := apply_collect(c, 0, 10, 'complete', 1, 'a0000000-0000-4000-8000-000000000001', null);
  assert not ok, 'stale version is rejected';
  raise notice 'ok   apply_collect writes once and rejects a stale version';
  n := apply_redeem(c, 1);
  assert n is not null and n <> c, 'redeem opens a new card';
  assert (select status from cards where id = c) = 'redeemed';
  assert (select current from cards where id = n) = 0;
  assert (select count(*) from redemptions) = 1;
  assert apply_redeem(c, 2) is null, 'second redeem is rejected';
  raise notice 'ok   apply_redeem marks the reward used, starts a new card, cannot repeat';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin assert (select count(*) from cards) = 0 and (select count(*) from stamp_events) = 0; raise notice 'ok   another user sees none of it'; end $$;
reset role;
-- Cards keep the rules they were opened with -------------------------------------------------------
set role service_role;
do $$
declare c uuid;
begin
  select id into c from cards where user_id = '11111111-1111-4111-8111-111111111111' and status = 'active';
  assert (select goal from cards where id = c) = 10 and (select reward from cards where id = c) = 'קפה הפוך עלינו', 'snapshot on insert';
  update programs set goal = 12, reward = 'עוגה' where id = 'b0000000-0000-4000-8000-000000000001';
  assert (select goal from cards where id = c) = 10, 'open card keeps its goal';
  insert into cards (user_id, program_id, goal, reward) values ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001', 1, 'הכל');
  assert (select goal from cards where user_id = '22222222-2222-4222-8222-222222222222') = 12, 'new card takes the current rules, not the caller''s';
  assert (select reward from cards where user_id = '22222222-2222-4222-8222-222222222222') = 'עוגה';
  delete from cards where user_id = '22222222-2222-4222-8222-222222222222';
  raise notice 'ok   cards snapshot the program rules; program changes reach new cards only';
end $$;
reset role;

-- Staff PINs and lockout ---------------------------------------------------------------------------
set role service_role;
do $$
declare
  u uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := 'a0000000-0000-4000-8000-000000000001';
  pin uuid; c uuid; n int;
begin
  insert into staff_pins (business_id, name, pin_hash) values (b, 'צוות', repeat('a', 64)) returning id into pin;
  begin
    insert into staff_pins (business_id, name, pin_hash) values (b, 'דנה', repeat('a', 64));
    raise exception 'FAIL duplicate pin';
  exception when unique_violation then null;
  end;
  insert into staff_pins (business_id, name, pin_hash) values ('a0000000-0000-4000-8000-000000000002', 'צוות', repeat('a', 64));
  raise notice 'ok   a PIN is unique within its business only';

  assert register_pin_failure(u, b, 'collect') = 1;
  assert register_pin_failure(u, b, 'collect') = 2;
  assert not exists (select 1 from business_alerts where kind = 'pin_lockout');
  assert register_pin_failure(u, b, 'redeem') = 3;
  assert (select count(*) from business_alerts where kind = 'pin_lockout' and business_id = b and user_id = u) = 1, 'lockout alert';
  assert pin_locked_until(u, b) = israel_day_end(), 'locked until midnight';
  assert pin_locked_until(u, 'a0000000-0000-4000-8000-000000000002') is null;
  assert pin_failures_today(u, 'a0000000-0000-4000-8000-000000000002') = 0, 'lockout is per business';
  assert israel_day_end('2026-07-01 20:30:00+00') = '2026-07-01 21:00:00+00', 'summer: midnight in Israel is 21:00 UTC';
  assert israel_day_end('2026-12-01 21:30:00+00') = '2026-12-01 22:00:00+00', 'winter: midnight in Israel is 22:00 UTC';
  raise notice 'ok   3 wrong PINs lock the customer at that business until midnight in Israel, with an alert';

  -- A successful PIN resets the count: failures are consecutive. (Everything in this block shares one now(),
  -- so move the earlier failures a minute back to put them before the success.)
  update pin_failures set created_at = created_at - interval '1 minute';
  select id into c from cards where user_id = u and status = 'active';
  assert apply_collect(c, (select version from cards where id = c), 1, 'active', 1, b, null, 'qr', pin);
  assert (select staff_pin_id from stamp_events order by created_at desc limit 1) = pin, 'event records the staff PIN';
  assert pin_failures_today(u, b) = 0, 'success resets the count';
end $$;
do $$ begin
  -- A new transaction, so a later now() than the stamp above.
  assert register_pin_failure('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'collect') = 1, 'counting starts again after a success';
  raise notice 'ok   a successful PIN resets the count and is recorded on the stamp';

  for i in 1..10 loop perform register_pin_failure('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000003', 'collect'); end loop;
  assert (select count(*) from business_alerts where kind = 'pin_failures' and business_id = 'a0000000-0000-4000-8000-000000000003') = 1, 'burst alert once an hour';
  raise notice 'ok   many wrong PINs within an hour raise one alert';

  insert into business_members (user_id, business_id, role) values ('33333333-3333-4333-8333-333333333333', 'a0000000-0000-4000-8000-000000000001', 'owner');
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($q$select pin_hash from staff_pins$q$, 'customer cannot read PIN hashes');
select pg_temp.expect_error($q$select * from pin_failures$q$, 'customer cannot read PIN failures');
select pg_temp.expect_error($q$select register_pin_failure('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'collect')$q$, 'customer cannot register failures');
select pg_temp.expect_error($q$select * from business_log('a0000000-0000-4000-8000-000000000001')$q$, 'customer cannot read a business log');
select pg_temp.expect_error($q$select * from business_insights('a0000000-0000-4000-8000-000000000001', 7)$q$, 'customer cannot read insights');
select pg_temp.expect_error($q$select customer_label('22222222-2222-4222-8222-222222222222')$q$, 'customer cannot call customer_label');
do $$ begin
  update programs set goal = 1;
  assert (select goal from programs where id = 'b0000000-0000-4000-8000-000000000001') = 12, 'customer update changes nothing';
  assert (select count(*) from staff_pins) = 0 and (select count(*) from business_alerts) = 0;
  raise notice 'ok   customers see no staff, no alerts and cannot edit programs';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($q$select pin_hash from staff_pins$q$, 'owner cannot read PIN hashes');
select pg_temp.expect_error($q$select * from business_log('a0000000-0000-4000-8000-000000000002')$q$, 'owner cannot read another business''s log');
select pg_temp.expect_error($q$update programs set active = false where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'owner cannot pause or swap a program');
select pg_temp.expect_error($q$update programs set goal = 0 where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'program checks still apply');
do $$
declare r record;
begin
  assert (select count(*) from staff_pins) = 1 and (select name from staff_pins) = 'צוות', 'owner sees own staff only';
  assert (select count(*) from business_members) = 1;
  update programs set goal = 9, reward = 'אספרסו כפול' where business_id = 'a0000000-0000-4000-8000-000000000001';
  update programs set goal = 2 where business_id = 'a0000000-0000-4000-8000-000000000002';
  assert (select goal from programs where id = 'b0000000-0000-4000-8000-000000000001') = 9, 'owner edits own program';
  assert (select goal from programs where id = 'b0000000-0000-4000-8000-000000000002') = 6, 'owner cannot edit another business';

  select * into r from business_log('a0000000-0000-4000-8000-000000000001') where kind = 'stamp' order by created_at desc limit 1;
  assert r.staff_name = 'צוות' and r.customer = '•••4567', format('log row %s', r);
  select * into r from business_insights('a0000000-0000-4000-8000-000000000001', 7);
  assert r.active_customers = 1 and r.visits = 2 and r.rewards_redeemed = 1 and r.returning_customers = 0, format('insights %s', r);
  assert (select count(*) from business_alert_list('a0000000-0000-4000-8000-000000000001')) = 1;
  assert (select customer from business_alert_list('a0000000-0000-4000-8000-000000000001')) = '•••4567';
  update business_alerts set seen_at = now();
  assert (select count(*) from business_alerts where seen_at is not null) = 1;
  raise notice 'ok   owner reads the log (staff name, masked customer), insights and alerts of their own business';
end $$;
reset role;

-- As the table owner: customer_label is callable only from the security-definer RPCs.
do $$ begin
  insert into profiles (id, name) values ('11111111-1111-4111-8111-111111111111', 'נועה') on conflict (id) do update set name = excluded.name;
  assert customer_label('11111111-1111-4111-8111-111111111111') = 'נועה';
  assert customer_label('22222222-2222-4222-8222-222222222222') = 'd•••@example.com';
  raise notice 'ok   customers are shown by name, last 4 phone digits or a masked email';
end $$;
\echo ALL DB CHECKS PASSED
