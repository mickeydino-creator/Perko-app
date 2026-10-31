-- Program changes apply to new cards only. Each card keeps the rules it was opened with: type, goal, step,
-- reward and the two rule texts. collect, redeem and the app read them from the card, not from the program.
-- The cooldown is not part of the snapshot: it is read live from the program, so a change applies at once.

alter table public.cards
  add column type text check (type in ('stamps', 'points')),
  add column goal int check (goal between 1 and 100000),
  add column step int check (step between 1 and 100000),
  add column reward text,
  add column rule text,
  add column redeem_rule text;

-- Existing cards take the rules of their program as it is now.
update public.cards c set
  type = p.type, goal = p.goal, step = p.step, reward = p.reward, rule = p.rule, redeem_rule = p.redeem_rule
from public.programs p
where p.id = c.program_id;

alter table public.cards
  alter column type set not null,
  alter column goal set not null,
  alter column step set not null,
  alter column reward set not null,
  alter column rule set not null,
  alter column redeem_rule set not null;

-- Every new card copies the program's current rules, whoever inserts it ("הוספה לארנק", collect, apply_redeem).
-- Values sent by the caller are overwritten, so the client can never choose its own goal or reward
-- (it has no column grant for them either).
create or replace function public.cards_snapshot_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p programs%rowtype;
begin
  select * into p from programs where id = new.program_id;
  if not found then raise exception 'program % not found', new.program_id; end if;
  new.type := p.type;
  new.goal := p.goal;
  new.step := p.step;
  new.reward := p.reward;
  new.rule := p.rule;
  new.redeem_rule := p.redeem_rule;
  return new;
end $$;
revoke all on function public.cards_snapshot_rules() from public, anon, authenticated;

create trigger cards_snapshot_rules before insert on public.cards
  for each row execute function public.cards_snapshot_rules();

-- The redemption records the reward of the card, not the program's current one.
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
  values (v_card.id, v_card.user_id, v_program.business_id, v_card.reward);

  -- A new, empty card starts on the same program when it is still running, with the program's current rules.
  if v_program.active then
    insert into cards (user_id, program_id) values (v_card.user_id, v_card.program_id) returning id into v_new;
  end if;
  return coalesce(v_new, v_card.id);
end $$;
