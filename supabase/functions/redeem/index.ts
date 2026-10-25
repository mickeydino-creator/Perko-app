// POST /functions/v1/redeem
//   { action: 'code', cardId }            -> the 6-digit code to show at the counter (changes every 30 s)
//   { action: 'confirm', cardId, code }   -> marks the reward used and opens a new card
// The code is derived from REDEEM_SECRET, so it cannot be computed on the device or reused from a screenshot.
import { canRedeem } from '../_shared/loyalty.ts';
import { issueRedeemCode, verifyRedeemCode } from '../_shared/token.ts';
import type { RedeemRequest, RedeemResponse } from '../_shared/api-types.ts';
import { admin, cors, json, requireUser, secret } from '../_shared/server.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const db = admin();
  const user = await requireUser(req, db);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: RedeemRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'body' }, 400);
  }
  if (typeof body.cardId !== 'string') return json({ error: 'body' }, 400);

  const { data: card } = await db
    .from('cards')
    .select('id, user_id, current, status, version, program:programs(goal, reward)')
    .eq('id', body.cardId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!card) return json({ status: 'not_found' } satisfies RedeemResponse);
  const program = card.program as unknown as { goal: number; reward: string };
  if (card.status !== 'complete' || !canRedeem(card, program)) return json({ status: 'not_ready' } satisfies RedeemResponse);

  const key = secret('REDEEM_SECRET');
  const now = new Date();

  if (body.action === 'code') {
    const { code, expiresAt } = await issueRedeemCode(key, card.id, now);
    return json({ status: 'code', code, expiresAt } satisfies RedeemResponse);
  }

  if (body.action === 'confirm') {
    if (!(await verifyRedeemCode(key, card.id, String(body.code ?? ''), now))) {
      return json({ status: 'expired' } satisfies RedeemResponse);
    }
    const { data: newCardId, error } = await db.rpc('apply_redeem', { p_card_id: card.id, p_expected_version: card.version });
    if (error) return json({ error: 'write' }, 500);
    if (!newCardId) return json({ status: 'not_ready' } satisfies RedeemResponse);
    return json({ status: 'redeemed', newCardId, reward: program.reward } satisfies RedeemResponse);
  }

  return json({ error: 'action' }, 400);
});
