// POST /functions/v1/collect
//   { payload, source: 'qr', action: 'check' }               -> may the customer collect now? (no PIN, no write)
//   { payload, source: 'qr', action: 'collect', pin: '1234' } -> the staff member confirmed: write the stamp
// The only way a stamp or points are added. Verifies the signed counter code, the customer's PIN lockout at
// the business, the per-user rate limit and the cooldown, then the staff PIN, and writes atomically via
// apply_collect(). The counter QR alone is not enough: it is printed and can be photographed.
import { decideCollect, isRateLimited, RATE_LIMITS } from '../_shared/loyalty.ts';
import { verifyQrPayload } from '../_shared/token.ts';
import type { CollectRequest, CollectResponse, CollectedCard } from '../_shared/api-types.ts';
import { admin, cors, json, qrSecrets, requireUser, secret } from '../_shared/server.ts';
import { checkStaffPin, lockedUntil } from '../_shared/pins.ts';

const CARD_COLUMNS = 'id, current, status, version, last_collected_at, type, goal, step, reward';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const db = admin();
  const user = await requireUser(req, db);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: CollectRequest;
  try {
    body = await req.json();
  } catch {
    return json({ status: 'invalid' } satisfies CollectResponse);
  }
  if (body.source !== 'qr' || typeof body.payload !== 'string' || body.payload.length > 200) {
    return json({ status: 'invalid' } satisfies CollectResponse);
  }
  const writing = body.action !== 'check';

  // 1. Signature. A code that does not verify is "invalid" whatever it contains.
  const parsed = await verifyQrPayload(body.payload, qrSecrets());
  if (!parsed) return json({ status: 'invalid' } satisfies CollectResponse);

  // 2. The code, its business and the business's running program.
  const { data: qr } = await db
    .from('qr_codes')
    .select('id, active, key_version, business:businesses(id, name, active)')
    .eq('id', parsed.qrId)
    .maybeSingle();
  if (!qr || qr.key_version !== parsed.version) return json({ status: 'invalid' } satisfies CollectResponse);
  const business = qr.business as unknown as { id: string; name: string; active: boolean } | null;
  if (!qr.active || !business?.active) return json({ status: 'inactive' } satisfies CollectResponse);

  const { data: program } = await db
    .from('programs')
    .select('id, name, type, goal, step, reward, cooldown_minutes')
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();
  if (!program) return json({ status: 'inactive' } satisfies CollectResponse);

  // 3. Too many wrong PINs today at this business: no more tries until midnight.
  const until = await lockedUntil(db, user.id, business.id);
  if (until) return json({ status: 'locked', until, businessName: business.name } satisfies CollectResponse);

  // 4. Per-user rate limit across all businesses.
  const longest = Math.max(...RATE_LIMITS.map((l) => l.windowMinutes));
  const { data: recent } = await db
    .from('stamp_events')
    .select('created_at')
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - longest * 60_000).toISOString());
  if (isRateLimited((recent ?? []).map((r) => r.created_at), new Date())) {
    return json({ status: 'rate_limited' } satisfies CollectResponse, 429);
  }

  // 5. The user's open card on this program. It keeps the rules it was opened with; before the first stamp
  //    there is no card yet and the program's current rules apply (the card will copy them).
  const { data: card } = await db
    .from('cards')
    .select(CARD_COLUMNS)
    .eq('user_id', user.id)
    .eq('program_id', program.id)
    .neq('status', 'redeemed')
    .maybeSingle();
  const terms = card ?? { type: program.type, goal: program.goal, step: program.step, reward: program.reward };

  // The cooldown is per user and business, not per card: a fresh card right after a redemption
  // does not reopen the slot that the completing scan used. It is read live from the program.
  const { data: lastEvent } = await db
    .from('stamp_events')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastCollectedAt = [card?.last_collected_at, lastEvent?.created_at].filter(Boolean).sort().pop() ?? null;

  const rules = { type: terms.type, goal: terms.goal, step: terms.step, cooldownMinutes: program.cooldown_minutes };
  const pending = {
    businessId: business.id,
    businessName: business.name,
    programName: program.name,
    type: terms.type,
    goal: terms.goal,
    step: terms.step,
    current: card?.current ?? 0,
    reward: terms.reward,
  };

  // 6. Decide (pure, unit-tested). Cooldown and a full card are answered before anyone types a PIN.
  const now = new Date();
  const decision = decideCollect(rules, { current: card?.current ?? 0, status: card?.status ?? 'active', lastCollectedAt }, now);
  if (decision.kind === 'cooldown') {
    return json({ status: 'cooldown', retryAt: decision.retryAt, remainingMinutes: decision.remainingMinutes, businessName: business.name } satisfies CollectResponse);
  }
  if (decision.kind !== 'apply') {
    return json({ status: 'complete', ...pending, cardId: card!.id } satisfies CollectResponse);
  }
  if (!writing) return json({ status: 'pin_required', ...pending, cardId: card?.id ?? null } satisfies CollectResponse);

  // 7. The staff PIN. A wrong one is logged and counts towards the lockout.
  const pin = await checkStaffPin(db, secret('PIN_SECRET'), user.id, business.id, body.pin, 'collect');
  if (pin.kind === 'locked') return json({ status: 'locked', until: pin.until, businessName: business.name } satisfies CollectResponse);
  if (pin.kind === 'wrong') return json({ status: 'wrong_pin', attemptsLeft: pin.attemptsLeft, businessName: business.name } satisfies CollectResponse);

  // 8. The first stamp adds the card to the wallet.
  let open = card;
  if (!open) {
    const ins = await db.from('cards').insert({ user_id: user.id, program_id: program.id }).select(CARD_COLUMNS).single();
    // A parallel request may have created it first: read it again.
    open = ins.data ?? (await db.from('cards').select(CARD_COLUMNS)
      .eq('user_id', user.id).eq('program_id', program.id).neq('status', 'redeemed').single()).data;
  }
  if (!open) return json({ error: 'card' }, 500);
  // A card created in between (another device) may already hold stamps: decide again on the card itself.
  const final = open === card ? decision : decideCollect({ ...rules, type: open.type, goal: open.goal, step: open.step },
    { current: open.current, status: open.status, lastCollectedAt }, now);
  if (final.kind !== 'apply') {
    return json({ status: 'cooldown', retryAt: new Date(Date.now() + rules.cooldownMinutes * 60_000).toISOString(), remainingMinutes: rules.cooldownMinutes, businessName: business.name } satisfies CollectResponse);
  }

  const { data: applied, error } = await db.rpc('apply_collect', {
    p_card_id: open.id,
    p_expected_version: open.version,
    p_current: final.current,
    p_status: final.status,
    p_amount: final.added,
    p_business_id: business.id,
    p_qr_code_id: qr.id,
    p_source: 'qr',
    p_staff_pin_id: pin.staffPinId,
  });
  if (error) return json({ error: 'write' }, 500);
  if (!applied) {
    // Another scan landed between the read and the write: it took the slot, so this one is in cooldown.
    return json({ status: 'cooldown', retryAt: new Date(Date.now() + rules.cooldownMinutes * 60_000).toISOString(), remainingMinutes: rules.cooldownMinutes, businessName: business.name } satisfies CollectResponse);
  }

  const info: CollectedCard = {
    cardId: open.id,
    businessId: business.id,
    businessName: business.name,
    programName: program.name,
    type: open.type,
    goal: open.goal,
    current: final.current,
    reward: open.reward,
  };
  return json({ status: 'ok', ...info, added: final.added, completed: final.completed } satisfies CollectResponse);
});
