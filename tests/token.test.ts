import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPin,
  isPinFormat,
  isWeakPin,
  parseQrPayload,
  randomPin,
  signQrPayload,
  verifyQrPayload,
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

test('a PIN hash is keyed, per business and deterministic', async () => {
  const business = 'a0000000-0000-4000-8000-000000000001';
  const h = await hashPin('pin-secret', business, '4821');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await hashPin('pin-secret', business, '4821'), h, 'same input, same hash: the database looks it up');
  assert.equal(await hashPin('pin-secret', business.toUpperCase(), '4821'), h, 'the id is case-insensitive');
  assert.notEqual(await hashPin('pin-secret', business, '4822'), h);
  assert.notEqual(await hashPin('other-secret', business, '4821'), h, 'without the secret the hash cannot be rebuilt');
  assert.notEqual(await hashPin('pin-secret', 'a0000000-0000-4000-8000-000000000002', '4821'), h, 'same PIN, other business');
  await assert.rejects(hashPin('pin-secret', business, '123'));
});

test('PIN format: exactly 4 digits', () => {
  for (const ok of ['0000', '4821', '9999']) assert.equal(isPinFormat(ok), true, ok);
  for (const bad of ['123', '12345', '12a4', ' 1234', '', 1234, null]) assert.equal(isPinFormat(bad), false, String(bad));
});

test('weak PINs are recognised and never generated', () => {
  for (const w of ['0000', '7777', '1234', '6789', '9876', '3210']) assert.equal(isWeakPin(w), true, w);
  for (const ok of ['1235', '4821', '1212', '0918']) assert.equal(isWeakPin(ok), false, ok);
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const p = randomPin();
    assert.equal(isPinFormat(p), true);
    assert.equal(isWeakPin(p), false);
    seen.add(p);
  }
  assert.ok(seen.size > 1500, 'random PINs are spread out');
});
