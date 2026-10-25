// POST /functions/v1/collect  { payload, source: 'qr' }
// The only way a stamp or points are added. Verifies the signed counter code, enforces the
// per-card cooldown and the per-user rate limit, then writes atomically via apply_collect().
import { decideCollect, isRateLimited, RATE_LIMITS } from '../_shared/loyalty.ts';
import { verifyQrPayload } from '../_shared/token.ts';
import type { CollectRequest, CollectResponse, CollectedCard } from '../_shared/api-types.ts';
import { admin, cors, json, qrSecrets, requireUser } from '../_shared/server.ts';

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

  // 3. Per-user rate limit across all businesses.
  const longest = Math.max(...RATE_LIMITS.map((l) => l.windowMinutes));
  const { data: recent } = await db
    .from('stamp_events')
    .select('created_at')
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - longest * 60_000).toISOString());
  if (isRateLimited((recent ?? []).map((r) => r.created_at), new Date())) {
    return json({ status: 'rate_limited' } satisfies CollectResponse, 429);
  }

  // 4. The user's open card on this program. The first scan adds the card to the wallet.
  let { data: card } = await db
    .from('cards')
    .select('id, current, status, version, last_collected_at')
    .eq('user_id', user.id)
    .eq('program_id', program.id)
    .neq('status', 'redeemed')
    .maybeSingle();
  if (!card) {
    const ins = await db
      .from('cards')
      .insert({ user_id: user.id, program_id: program.id })
      .select('id, current, status, version, last_collected_at')
      .single();
    // A parallel request may have created it first: read it again.
    card = ins.data ?? (await db.from('cards').select('id, current, status, version, last_collected_at')
      .eq('user_id', user.id).eq('program_id', program.id).neq('status', 'redeemed').single()).data;
  }
  if (!card) return json({ error: 'card' }, 500);

  // The cooldown is per user and business, not per card: a fresh card right after a redemption
  // does not reopen the slot that the completing scan used.
  const { data: lastEvent } = await db
    .from('stamp_events')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastCollectedAt = [card.last_collected_at, lastEvent?.created_at].filter(Boolean).sort().pop() ?? null;

  const rules = { type: program.type, goal: program.goal, step: program.step, cooldownMinutes: program.cooldown_minutes };
  const info: CollectedCard = {
    cardId: card.id,
    businessId: business.id,
    businessName: business.name,
    programName: program.name,
    type: program.type,
    goal: program.goal,
    current: card.current,
    reward: program.reward,
  };

  // 5. Decide (pure, unit-tested) and write with the version check.
  const decision = decideCollect(rules, { current: card.current, status: card.status, lastCollectedAt }, new Date());
  if (decision.kind === 'cooldown') {
    return json({ status: 'cooldown', retryAt: decision.retryAt, remainingMinutes: decision.remainingMinutes, businessName: business.name } satisfies CollectResponse);
  }
  if (decision.kind !== 'apply') return json({ status: 'complete', ...info } satisfies CollectResponse);

  const { data: applied, error } = await db.rpc('apply_collect', {
    p_card_id: card.id,
    p_expected_version: card.version,
    p_current: decision.current,
    p_status: decision.status,
    p_amount: decision.added,
    p_business_id: business.id,
    p_qr_code_id: qr.id,
    p_source: 'qr',
  });
  if (error) return json({ error: 'write' }, 500);
  if (!applied) {
    // Another scan landed between the read and the write: it took the slot, so this one is in cooldown.
    return json({ status: 'cooldown', retryAt: new Date(Date.now() + rules.cooldownMinutes * 60_000).toISOString(), remainingMinutes: rules.cooldownMinutes, businessName: business.name } satisfies CollectResponse);
  }

  return json({ status: 'ok', ...info, current: decision.current, added: decision.added, completed: decision.completed } satisfies CollectResponse);
});
