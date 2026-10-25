-- Plain-Postgres check of the schema, RLS and the atomic write functions, without the Supabase stack.
-- Run with scripts/test-db.sh (creates a throwaway database with a minimal auth schema).
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');

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
\echo ALL DB CHECKS PASSED
