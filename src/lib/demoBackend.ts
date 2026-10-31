// Demo mode: runs the whole app on this device with the sample businesses, no Supabase project needed.
// It uses the same loyalty rules as the server (decideCollect, isRateLimited) so the flows behave the same,
// but nothing here is secure: codes are not signature-checked, any 6-digit SMS code is accepted and the staff PIN
// of every sample business is DEMO_PIN.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decideCollect, isRateLimited, PIN_MAX_FAILURES, RATE_LIMITS } from '../../supabase/functions/_shared/loyalty.ts';
import { parseQrPayload } from '../../supabase/functions/_shared/token.ts';
import { AuthError, type AuthListener, type Backend } from './backend';
import type { Business, Card, CardStatus, CollectResponse, CollectSource, Profile, Program, Redemption } from './types';

const KEY = 'perko.demo.v1';
/** The staff PIN of every sample business in demo mode. */
export const DEMO_PIN = '1234';

const program = (n: number, p: Omit<Program, 'id' | 'redeemRule' | 'cooldownMinutes'>): Program => ({
  id: `b0000000-0000-4000-8000-00000000000${n}`,
  redeemRule: 'בקופה, מול הצוות',
  cooldownMinutes: 120,
  ...p,
});

// Same sample businesses as supabase/seed.sql. None of them is a real participant.
export const SAMPLE_BUSINESSES: Business[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001', name: 'קפה פינה', kind: 'בית קפה שכונתי', category: 'cafe', initial: 'פ', tone: 'lime',
    address: 'כתובת לדוגמה, עמק רפאים', hours: 'שעות לדוגמה: א׳-ה׳ 7:00-19:00, ו׳ 7:00-14:00', website: null, isSample: true, lat: 31.7629, lng: 35.2191,
    program: program(1, { name: 'כרטיס קפה', type: 'stamps', goal: 10, step: 1, reward: 'קפה הפוך עלינו', rule: 'חותמת על כל משקה חם' }),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002', name: 'זעתר', kind: 'מסעדה שכונתית', category: 'food', initial: 'ז', tone: 'ink',
    address: 'כתובת לדוגמה, עמק רפאים', hours: 'שעות לדוגמה: א׳-ה׳ 12:00-23:00', website: null, isSample: true, lat: 31.7612, lng: 35.218,
    program: program(2, { name: 'כרטיס ארוחות', type: 'stamps', goal: 6, step: 1, reward: 'קינוח לשניים', rule: 'חותמת על כל ארוחה במקום' }),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003', name: 'דפדוף', kind: 'חנות ספרים מקומית', category: 'shop', initial: 'ד', tone: 'pale',
    address: 'כתובת לדוגמה, דרך בית לחם', hours: 'שעות לדוגמה: א׳-ה׳ 10:00-20:00, ו׳ 9:00-14:00', website: null, isSample: true, lat: 31.7568, lng: 35.2213,
    program: program(3, { name: 'מועדון קוראים', type: 'points', goal: 200, step: 20, reward: 'שובר 30 ₪ לקנייה הבאה', rule: '20 נקודות על כל קנייה' }),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004', name: 'מאפיית הגפן', kind: 'מאפייה', category: 'food', initial: 'מ', tone: 'lime',
    address: 'כתובת לדוגמה, דרך בית לחם', hours: 'שעות לדוגמה: א׳-ו׳ 6:30-15:00', website: null, isSample: true, lat: 31.755, lng: 35.222,
    program: program(4, { name: 'כרטיס מאפים', type: 'stamps', goal: 8, step: 1, reward: 'מאפה לבחירה', rule: 'חותמת על כל קנייה מעל 20 ₪' }),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005', name: 'פרחי השדרה', kind: 'חנות פרחים', category: 'shop', initial: 'פ', tone: 'pale',
    address: 'כתובת לדוגמה, עמק רפאים', hours: 'שעות לדוגמה: א׳-ה׳ 9:00-19:00, ו׳ 8:00-14:00', website: null, isSample: true, lat: 31.7598, lng: 35.2172,
    program: program(5, { name: 'כרטיס פרחים', type: 'stamps', goal: 5, step: 1, reward: 'זר קטן', rule: 'חותמת על כל זר' }),
  },
];

/** The counter code of each sample business in demo mode (business index + 1 → qr id). */
export const demoQrPayload = (n: number) => `perko://c/v1.c0000000-0000-4000-8000-00000000000${n}.demo-not-signed-000000`;
const qrToBusiness = (qrId: string) => {
  const m = /^c0000000-0000-4000-8000-00000000000(\d)$/.exec(qrId);
  return m ? SAMPLE_BUSINESSES[Number(m[1]) - 1] ?? null : null;
};

type StoredCard = { id: string; programId: string; current: number; status: CardStatus; createdAt: string; lastCollectedAt: string | null; completedAt: string | null };
type StoredEvent = { id: string; cardId: string; amount: number; createdAt: string };
type State = {
  profile: Profile | null;
  cards: StoredCard[];
  events: StoredEvent[];
  redemptions: { id: string; reward: string; businessName: string; createdAt: string }[];
  /** Consecutive wrong PINs per business, today (local day), as on the server. */
  pinFailures?: Record<string, { day: string; count: number }>;
};

const empty: State = { profile: null, cards: [], events: [], redemptions: [], pinFailures: {} };
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const daysAgo = (d: number, h = 10) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, 15, 0, 0);
  return t.toISOString();
};

/** A demo wallet that mirrors the website mockups: a coffee card close to its reward, a meal card and a points card. */
function starterWallet(): Pick<State, 'cards' | 'events'> {
  const make = (n: number, stamps: number[], amount: number) => {
    const p = SAMPLE_BUSINESSES[n].program!;
    const id = uid();
    const events = stamps.map((d, i) => ({ id: uid(), cardId: id, amount, createdAt: daysAgo(d, 9 + (i % 8)) }));
    const card: StoredCard = {
      id, programId: p.id, current: events.reduce((s, e) => s + e.amount, 0), status: 'active',
      createdAt: daysAgo(Math.max(...stamps) + 1), lastCollectedAt: events[0]?.createdAt ?? null, completedAt: null,
    };
    return { card, events };
  };
  const all = [make(0, [1, 3, 4, 6, 8, 11, 13, 16, 19], 1), make(1, [2, 9, 15, 22], 1), make(2, [5, 12, 20, 27, 33, 40], 20)];
  return { cards: all.map((a) => a.card), events: all.flatMap((a) => a.events) };
}

export function createDemoBackend(): Backend {
  let state: State | null = null;
  const listeners = new Set<AuthListener>();

  const load = async (): Promise<State> => {
    if (state) return state;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      state = raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
    } catch {
      state = { ...empty };
    }
    return state!;
  };
  const save = async () => {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // demo only: keep working in memory
    }
  };
  const signedIn = async () => {
    const s = await load();
    if (!s.profile) throw new AuthError('signed out');
    return s;
  };
  const programById = (id: string) => SAMPLE_BUSINESSES.find((b) => b.program?.id === id)!;
  const toCard = (c: StoredCard): Card => {
    const business = programById(c.programId);
    return { ...c, business, program: business.program! };
  };
  const delay = () => new Promise((r) => setTimeout(r, 250));

  // The PIN lockout, per business and day: PIN_MAX_FAILURES consecutive wrong PINs lock until midnight.
  const today = () => new Date().toDateString();
  const midnight = () => {
    const t = new Date();
    t.setHours(24, 0, 0, 0);
    return t.toISOString();
  };
  const failures = (s: State, businessId: string) => {
    const f = s.pinFailures?.[businessId];
    return f && f.day === today() ? f.count : 0;
  };
  /** Checks a PIN; returns null when it is right, else the answer to send back. */
  const checkPin = async (s: State, businessId: string, pin: string) => {
    if (pin === DEMO_PIN) {
      s.pinFailures = { ...s.pinFailures, [businessId]: { day: today(), count: 0 } };
      return null;
    }
    const count = failures(s, businessId) + 1;
    s.pinFailures = { ...s.pinFailures, [businessId]: { day: today(), count } };
    await save();
    return count >= PIN_MAX_FAILURES ? { status: 'locked' as const, until: midnight() } : { status: 'wrong_pin' as const, attemptsLeft: PIN_MAX_FAILURES - count };
  };

  /** collect with pin === null is the 'check' step: nothing is written. */
  const collectDemo = async (payload: string, _source: CollectSource, pin: string | null): Promise<CollectResponse> => {
    await delay();
    const s = await signedIn();
    const parsed = parseQrPayload(payload);
    const business = parsed && qrToBusiness(parsed.qrId);
    if (!business?.program) return { status: 'invalid' };
    const p = business.program;
    if (failures(s, business.id) >= PIN_MAX_FAILURES) return { status: 'locked', until: midnight(), businessName: business.name };
    const now = new Date();
    const longest = Math.max(...RATE_LIMITS.map((l) => l.windowMinutes));
    const recent = s.events.filter((e) => now.getTime() - new Date(e.createdAt).getTime() < longest * 60_000).map((e) => e.createdAt);
    if (isRateLimited(recent, now)) return { status: 'rate_limited' };

    const existing = s.cards.find((c) => c.programId === p.id && c.status !== 'redeemed');
    const info = {
      businessId: business.id, businessName: business.name, programName: p.name,
      type: p.type, goal: p.goal, current: existing?.current ?? 0, reward: p.reward,
    };
    // Cooldown per user and business, as on the server.
    const cardIds = new Set(s.cards.filter((c) => c.programId === p.id).map((c) => c.id));
    const lastCollectedAt = s.events.filter((e) => cardIds.has(e.cardId)).map((e) => e.createdAt).sort().pop() ?? null;
    const d = decideCollect({ ...p }, { current: existing?.current ?? 0, status: existing?.status ?? 'active', lastCollectedAt }, now);
    if (d.kind === 'cooldown') return { status: 'cooldown', retryAt: d.retryAt, remainingMinutes: d.remainingMinutes, businessName: business.name };
    if (d.kind !== 'apply') return { status: 'complete', ...info, cardId: existing!.id };
    if (pin === null) return { status: 'pin_required', ...info, step: p.step, cardId: existing?.id ?? null };

    const refused = await checkPin(s, business.id, pin);
    if (refused) return { ...refused, businessName: business.name };
    let card = existing;
    if (!card) {
      card = { id: uid(), programId: p.id, current: 0, status: 'active', createdAt: now.toISOString(), lastCollectedAt: null, completedAt: null };
      s.cards.push(card);
    }
    Object.assign(card, { current: d.current, status: d.status, lastCollectedAt: now.toISOString(), completedAt: d.completed ? now.toISOString() : null });
    s.events.push({ id: uid(), cardId: card.id, amount: d.added, createdAt: now.toISOString() });
    await save();
    return { status: 'ok', ...info, cardId: card.id, current: d.current, added: d.added, completed: d.completed };
  };

  return {
    mode: 'demo',

    async sendCode() {
      await delay();
    },
    async verifyCode(target, code) {
      await delay();
      if (!/^\d{6,10}$/.test(code)) throw new AuthError('otp');
      const s = await load();
      const phone = target.kind === 'phone' ? target.phone : '';
      const email = target.kind === 'email' ? target.email : null;
      if (!s.profile || s.profile.phone !== phone || (s.profile.email ?? null) !== email) {
        Object.assign(s, { ...empty, profile: { id: 'demo-user', phone, email, name: null }, ...starterWallet() });
      }
      await save();
      return s.profile!;
    },
    async currentProfile() {
      return (await load()).profile;
    },
    onAuthChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signOut() {
      const s = await load();
      s.profile = null;
      await save();
      listeners.forEach((l) => l(null));
    },
    async deleteAccount() {
      state = { ...empty };
      await AsyncStorage.removeItem(KEY).catch(() => undefined);
      listeners.forEach((l) => l(null));
    },
    async updateName(name) {
      const s = await signedIn();
      s.profile = { ...s.profile!, name: name.trim() || null };
      await save();
    },

    async listBusinesses() {
      return SAMPLE_BUSINESSES;
    },
    async getBusiness(id) {
      return SAMPLE_BUSINESSES.find((b) => b.id === id) ?? null;
    },
    async listCards() {
      const s = await signedIn();
      return s.cards.filter((c) => c.status !== 'redeemed').map(toCard);
    },
    async getCard(id) {
      const s = await signedIn();
      const c = s.cards.find((x) => x.id === id);
      if (!c) return null;
      const events = s.events
        .filter((e) => e.cardId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => ({ id: e.id, amount: e.amount, source: 'qr' as const, createdAt: e.createdAt }));
      return { card: toCard(c), events };
    },
    async listRedemptions(): Promise<Redemption[]> {
      const s = await signedIn();
      return [...s.redemptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async addToWallet(programId) {
      const s = await signedIn();
      if (s.cards.some((c) => c.programId === programId && c.status !== 'redeemed')) return;
      s.cards.push({ id: uid(), programId, current: 0, status: 'active', createdAt: new Date().toISOString(), lastCollectedAt: null, completedAt: null });
      await save();
    },

    checkCollect(payload, source) {
      return collectDemo(payload, source, null);
    },
    collect(payload, source, pin) {
      return collectDemo(payload, source, pin);
    },

    async confirmRedeem(cardId, pin) {
      await delay();
      const s = await signedIn();
      const c = s.cards.find((x) => x.id === cardId);
      if (!c) return { status: 'not_found' };
      if (c.status !== 'complete') return { status: 'not_ready' };
      const business = programById(c.programId);
      if (failures(s, business.id) >= PIN_MAX_FAILURES) return { status: 'locked', until: midnight() };
      const refused = await checkPin(s, business.id, pin);
      if (refused) return refused;
      const now = new Date().toISOString();
      c.status = 'redeemed';
      s.redemptions.push({ id: uid(), reward: business.program!.reward, businessName: business.name, createdAt: now });
      const next: StoredCard = { id: uid(), programId: c.programId, current: 0, status: 'active', createdAt: now, lastCollectedAt: null, completedAt: null };
      s.cards.push(next);
      await save();
      return { status: 'redeemed', newCardId: next.id, reward: business.program!.reward };
    },
  };
}
