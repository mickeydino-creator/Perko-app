// Loyalty rules shared by the Edge Functions, the app and the tests.
// Plain TypeScript with no imports so it runs unchanged in Deno, Node (type stripping) and Metro.

export type ProgramType = 'stamps' | 'points';
export type CardStatus = 'active' | 'complete' | 'redeemed';

export type ProgramRules = {
  type: ProgramType;
  /** Stamps or points needed for the reward. */
  goal: number;
  /** Stamps (usually 1) or points added per eligible purchase. */
  step: number;
  /** Minimum time between two collections on the same card. */
  cooldownMinutes: number;
};

export type CardState = {
  current: number;
  status: CardStatus;
  /** Last collection on this card, ISO string or null. */
  lastCollectedAt: string | null;
};

export const DEFAULT_COOLDOWN_MINUTES = 120;

/** Per-user limits across all businesses: protects against scripted scanning. */
export const RATE_LIMITS = [
  { windowMinutes: 1, max: 3 },
  { windowMinutes: 60, max: 12 },
] as const;

export type CollectDecision =
  | { kind: 'apply'; current: number; added: number; status: CardStatus; completed: boolean }
  | { kind: 'cooldown'; retryAt: string; remainingMinutes: number }
  | { kind: 'complete' }
  | { kind: 'redeemed' };

/** Decide what one collection does to a card. Pure: the caller persists the result. */
export function decideCollect(rules: ProgramRules, card: CardState, now: Date): CollectDecision {
  if (card.status === 'redeemed') return { kind: 'redeemed' };
  if (card.status === 'complete' || card.current >= rules.goal) return { kind: 'complete' };

  if (card.lastCollectedAt) {
    const cooldownMs = Math.max(0, rules.cooldownMinutes) * 60_000;
    const retry = new Date(card.lastCollectedAt).getTime() + cooldownMs;
    if (retry > now.getTime()) {
      return {
        kind: 'cooldown',
        retryAt: new Date(retry).toISOString(),
        remainingMinutes: Math.ceil((retry - now.getTime()) / 60_000),
      };
    }
  }

  const step = Math.max(1, Math.floor(rules.step));
  const current = Math.min(rules.goal, card.current + step);
  const completed = current >= rules.goal;
  return { kind: 'apply', current, added: current - card.current, status: completed ? 'complete' : 'active', completed };
}

/** True when the user already reached a per-user limit. `recent` holds the times of their latest collections. */
export function isRateLimited(recent: readonly string[], now: Date, limits = RATE_LIMITS): boolean {
  return limits.some(({ windowMinutes, max }) => {
    const from = now.getTime() - windowMinutes * 60_000;
    return recent.filter((t) => new Date(t).getTime() > from).length >= max;
  });
}

/** How many stamps or points are still missing. */
export function remaining(rules: Pick<ProgramRules, 'goal'>, current: number): number {
  return Math.max(0, rules.goal - current);
}

/** Progress between 0 and 1. */
export function progress(rules: Pick<ProgramRules, 'goal'>, current: number): number {
  if (rules.goal <= 0) return 1;
  return Math.min(1, Math.max(0, current / rules.goal));
}

/** Wallet order: ready rewards first, then the card closest to its reward, then the newest. */
export function sortWallet<T extends { current: number; goal: number; status: CardStatus; createdAt: string }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    const ra = a.status === 'complete' ? 0 : 1 - progress(a, a.current);
    const rb = b.status === 'complete' ? 0 : 1 - progress(b, b.current);
    if (ra !== rb) return ra - rb;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Redemption is only possible on a complete card. */
export function canRedeem(card: Pick<CardState, 'status' | 'current'>, rules: Pick<ProgramRules, 'goal'>): boolean {
  return card.status === 'complete' || (card.status === 'active' && card.current >= rules.goal);
}

/** Hebrew copy for the missing amount, e.g. "עוד 3 חותמות להטבה". */
export function remainingLabel(type: ProgramType, missing: number): string {
  if (missing <= 0) return 'ההטבה מוכנה';
  if (type === 'points') return `עוד ${missing} נק׳ להטבה`;
  if (missing === 1) return 'עוד חותמת אחת להטבה';
  return `עוד ${missing} חותמות להטבה`;
}

/** Hebrew duration for the cooldown message, e.g. "שעה ו-20 דקות". */
export function durationLabel(minutes: number): string {
  const m = Math.max(1, Math.ceil(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  const mins = rest === 0 ? '' : rest === 1 ? 'דקה' : `${rest} דקות`;
  if (hours && mins) return `${hours} ו-${mins}`;
  return hours || mins;
}

export function cooldownMessage(remainingMinutes: number): string {
  return `כבר נאספה חותמת, אפשר שוב בעוד ${durationLabel(remainingMinutes)}`;
}

/** Normalise an Israeli mobile number to E.164 (+9725XXXXXXXX). Returns null when it is not a mobile number. */
export function normalizeIsraeliPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+972')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  if (!/^05\d{8}$/.test(digits)) return null;
  return '+972' + digits.slice(1);
}

/** Trim and lower-case an email address. Returns null when it does not look like one. */
export function normalizeEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254 ? v : null;
}

/** Show an E.164 Israeli number the local way: 050-123-4567. */
export function formatIsraeliPhone(e164: string): string {
  const local = e164.startsWith('+972') ? '0' + e164.slice(4) : e164;
  if (!/^05\d{8}$/.test(local)) return e164;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}
