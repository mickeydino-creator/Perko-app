import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canRedeem,
  cooldownMessage,
  decideCollect,
  durationLabel,
  formatIsraeliPhone,
  isRateLimited,
  normalizeEmail,
  normalizeIsraeliPhone,
  progress,
  remaining,
  remainingLabel,
  sortWallet,
  type ProgramRules,
} from '../supabase/functions/_shared/loyalty.ts';

const coffee: ProgramRules = { type: 'stamps', goal: 10, step: 1, cooldownMinutes: 120 };
const books: ProgramRules = { type: 'points', goal: 200, step: 20, cooldownMinutes: 120 };
const now = new Date('2026-10-25T10:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

test('a stamp adds one to an active card', () => {
  const d = decideCollect(coffee, { current: 7, status: 'active', lastCollectedAt: null }, now);
  assert.deepEqual(d, { kind: 'apply', current: 8, added: 1, status: 'active', completed: false });
});

test('the last stamp completes the card', () => {
  const d = decideCollect(coffee, { current: 9, status: 'active', lastCollectedAt: minutesAgo(500) }, now);
  assert.deepEqual(d, { kind: 'apply', current: 10, added: 1, status: 'complete', completed: true });
});

test('points add the step and are capped at the goal', () => {
  const a = decideCollect(books, { current: 120, status: 'active', lastCollectedAt: null }, now);
  assert.equal(a.kind === 'apply' && a.current, 140);
  const b = decideCollect({ ...books, step: 50 }, { current: 180, status: 'active', lastCollectedAt: null }, now);
  assert.deepEqual(b, { kind: 'apply', current: 200, added: 20, status: 'complete', completed: true });
});

test('a complete or redeemed card does not collect', () => {
  assert.equal(decideCollect(coffee, { current: 10, status: 'complete', lastCollectedAt: null }, now).kind, 'complete');
  assert.equal(decideCollect(coffee, { current: 10, status: 'active', lastCollectedAt: null }, now).kind, 'complete');
  assert.equal(decideCollect(coffee, { current: 10, status: 'redeemed', lastCollectedAt: null }, now).kind, 'redeemed');
});

test('cooldown blocks a second stamp within the window and reports the time left', () => {
  const d = decideCollect(coffee, { current: 3, status: 'active', lastCollectedAt: minutesAgo(40) }, now);
  assert.equal(d.kind, 'cooldown');
  if (d.kind !== 'cooldown') return;
  assert.equal(d.remainingMinutes, 80);
  assert.equal(d.retryAt, '2026-10-25T11:20:00.000Z');
});

test('cooldown ends exactly at the configured time', () => {
  assert.equal(decideCollect(coffee, { current: 3, status: 'active', lastCollectedAt: minutesAgo(120) }, now).kind, 'apply');
  assert.equal(decideCollect(coffee, { current: 3, status: 'active', lastCollectedAt: minutesAgo(119) }, now).kind, 'cooldown');
});

test('cooldown is configurable per program, zero disables it', () => {
  const quick = { ...coffee, cooldownMinutes: 0 };
  assert.equal(decideCollect(quick, { current: 3, status: 'active', lastCollectedAt: minutesAgo(0) }, now).kind, 'apply');
  const long = { ...coffee, cooldownMinutes: 24 * 60 };
  assert.equal(decideCollect(long, { current: 3, status: 'active', lastCollectedAt: minutesAgo(600) }, now).kind, 'cooldown');
});

test('rate limit: 3 per minute and 12 per hour across businesses', () => {
  assert.equal(isRateLimited([minutesAgo(0.2), minutesAgo(0.5)], now), false);
  assert.equal(isRateLimited([minutesAgo(0.2), minutesAgo(0.5), minutesAgo(0.9)], now), true);
  const hour = Array.from({ length: 12 }, (_, i) => minutesAgo(2 + i * 4));
  assert.equal(isRateLimited(hour, now), true);
  assert.equal(isRateLimited(hour.slice(1), now), false);
  assert.equal(isRateLimited(Array.from({ length: 20 }, () => minutesAgo(61)), now), false);
});

test('remaining, progress and labels', () => {
  assert.equal(remaining(coffee, 7), 3);
  assert.equal(remaining(coffee, 12), 0);
  assert.equal(progress(books, 120), 0.6);
  assert.equal(remainingLabel('stamps', 3), 'עוד 3 חותמות להטבה');
  assert.equal(remainingLabel('stamps', 1), 'עוד חותמת אחת להטבה');
  assert.equal(remainingLabel('points', 80), 'עוד 80 נק׳ להטבה');
  assert.equal(remainingLabel('stamps', 0), 'ההטבה מוכנה');
});

test('durations in Hebrew', () => {
  assert.equal(durationLabel(1), 'דקה');
  assert.equal(durationLabel(45), '45 דקות');
  assert.equal(durationLabel(60), 'שעה');
  assert.equal(durationLabel(80), 'שעה ו-20 דקות');
  assert.equal(durationLabel(120), 'שעתיים');
  assert.equal(durationLabel(185), '3 שעות ו-5 דקות');
  assert.equal(cooldownMessage(80), 'כבר נאספה חותמת, אפשר שוב בעוד שעה ו-20 דקות');
});

test('wallet puts ready rewards first, then the card closest to a reward', () => {
  const cards = [
    { id: 'a', current: 2, goal: 10, status: 'active' as const, createdAt: '2026-10-01' },
    { id: 'b', current: 160, goal: 200, status: 'active' as const, createdAt: '2026-10-02' },
    { id: 'c', current: 6, goal: 6, status: 'complete' as const, createdAt: '2026-10-03' },
    { id: 'd', current: 9, goal: 10, status: 'active' as const, createdAt: '2026-10-04' },
  ];
  assert.deepEqual(sortWallet(cards).map((c) => c.id), ['c', 'd', 'b', 'a']);
});

test('only a complete card can be redeemed', () => {
  assert.equal(canRedeem({ status: 'complete', current: 10 }, coffee), true);
  assert.equal(canRedeem({ status: 'active', current: 9 }, coffee), false);
  assert.equal(canRedeem({ status: 'redeemed', current: 10 }, coffee), false);
});

test('email addresses', () => {
  assert.equal(normalizeEmail('  Noa@Example.co.il '), 'noa@example.co.il');
  assert.equal(normalizeEmail('noa@example'), null);
  assert.equal(normalizeEmail('noa example.com'), null);
  assert.equal(normalizeEmail('@example.com'), null);
});

test('Israeli mobile numbers', () => {
  assert.equal(normalizeIsraeliPhone('050-123-4567'), '+972501234567');
  assert.equal(normalizeIsraeliPhone('+972 50 123 4567'), '+972501234567');
  assert.equal(normalizeIsraeliPhone('972501234567'), '+972501234567');
  assert.equal(normalizeIsraeliPhone('02-6251234'), null);
  assert.equal(normalizeIsraeliPhone('05012'), null);
  assert.equal(formatIsraeliPhone('+972501234567'), '050-123-4567');
});
