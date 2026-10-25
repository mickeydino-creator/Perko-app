import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  issueRedeemCode,
  parseQrPayload,
  REDEEM_WINDOW_SECONDS,
  signQrPayload,
  verifyQrPayload,
  verifyRedeemCode,
} from '../supabase/functions/_shared/token.ts';

const qrId = '3f1c2a9e-7b4d-4e21-9a55-0c6d8e2f1b37';
const secrets = { 1: 'test-secret-v1', 2: 'test-secret-v2' };

test('a signed counter code verifies', async () => {
  const payload = await signQrPayload(secrets[1], 1, qrId);
  assert.match(payload, /^perko:\/\/c\/v1\./);
  const v = await verifyQrPayload(payload, secrets);
  assert.equal(v?.qrId, qrId);
});

test('a tampered or foreign code does not verify', async () => {
  const payload = await signQrPayload(secrets[1], 1, qrId);
  const otherId = payload.replace(qrId, '3f1c2a9e-7b4d-4e21-9a55-0c6d8e2f1b38');
  assert.equal(await verifyQrPayload(otherId, secrets), null);
  const flipped = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A');
  assert.equal(await verifyQrPayload(flipped, secrets), null);
  assert.equal(await verifyQrPayload('https://example.com', secrets), null);
  assert.equal(parseQrPayload('perko://c/garbage'), null);
});

test('rotation: a code signed with a removed key version is rejected', async () => {
  const v1 = await signQrPayload(secrets[1], 1, qrId);
  const v2 = await signQrPayload(secrets[2], 2, qrId);
  assert.notEqual(await verifyQrPayload(v2, { 2: secrets[2] }), null);
  assert.equal(await verifyQrPayload(v1, { 2: secrets[2] }), null);
  // The same id signed with the wrong secret for its version fails.
  assert.equal(await verifyQrPayload(v1, { 1: secrets[2] }), null);
});

test('redeem code is 6 digits and accepted in its window and the next one only', async () => {
  const secret = 'redeem-secret';
  const card = 'card-1';
  const t0 = new Date('2026-10-25T10:00:05Z');
  const { code, expiresAt } = await issueRedeemCode(secret, card, t0);
  assert.match(code, /^\d{6}$/);
  assert.equal(expiresAt, '2026-10-25T10:00:30.000Z');
  assert.equal(await verifyRedeemCode(secret, card, code, t0), true);
  const later = (s: number) => new Date(t0.getTime() + s * 1000);
  assert.equal(await verifyRedeemCode(secret, card, code, later(REDEEM_WINDOW_SECONDS)), true);
  assert.equal(await verifyRedeemCode(secret, card, code, later(REDEEM_WINDOW_SECONDS * 2)), false);
  assert.equal(await verifyRedeemCode(secret, 'card-2', code, t0), false);
  assert.equal(await verifyRedeemCode(secret, card, 'abc', t0), false);
});

test('the code changes every window', async () => {
  const a = await issueRedeemCode('s', 'card-1', new Date('2026-10-25T10:00:00Z'));
  const b = await issueRedeemCode('s', 'card-1', new Date('2026-10-25T10:00:30Z'));
  const c = await issueRedeemCode('s', 'card-1', new Date('2026-10-25T10:01:00Z'));
  assert.ok(a.code !== b.code || b.code !== c.code);
});
