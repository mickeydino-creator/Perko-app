import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, FunctionsFetchError, FunctionsHttpError, type User } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { AuthError, NetworkError, type Backend } from './backend';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { Business, Card, CollectResponse, Profile, Program, Redemption, RedeemResponse, StampEvent } from './types';

const client = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

const toProgram = (p: any): Program => ({
  id: p.id,
  name: p.name,
  type: p.type,
  goal: p.goal,
  step: p.step,
  reward: p.reward,
  rule: p.rule,
  redeemRule: p.redeem_rule,
  cooldownMinutes: p.cooldown_minutes,
});

const toBusiness = (b: any, program: Program | null): Business => ({
  id: b.id,
  name: b.name,
  kind: b.kind,
  category: b.category,
  initial: b.initial,
  tone: b.tone,
  address: b.address,
  hours: b.hours,
  website: b.website,
  isSample: b.is_sample,
  program,
});

const toCard = (c: any): Card => {
  const program = toProgram(c.program);
  return {
    id: c.id,
    current: c.current,
    status: c.status,
    createdAt: c.created_at,
    lastCollectedAt: c.last_collected_at,
    completedAt: c.completed_at,
    program,
    business: toBusiness(c.program.business, program),
  };
};

const CARD_SELECT = '*, program:programs(*, business:businesses(*))';

export function createSupabaseBackend(): Backend {
  const sb = client();

  // Refresh tokens only while the app is in the foreground (Supabase guidance for React Native).
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (s) => (s === 'active' ? sb.auth.startAutoRefresh() : sb.auth.stopAutoRefresh()));
  }

  const profileOf = async (user: User): Promise<Profile> => {
    const { data } = await sb.from('profiles').select('name').eq('id', user.id).maybeSingle();
    return { id: user.id, phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : '', email: user.email ?? null, name: data?.name ?? null };
  };

  const check = <T>(res: { data: T; error: any }): T => {
    if (res.error) {
      if (/fetch|network/i.test(String(res.error.message))) throw new NetworkError(res.error.message);
      throw new Error(res.error.message);
    }
    return res.data;
  };

  async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (!error) return data as T;
    if (error instanceof FunctionsFetchError) throw new NetworkError(error.message);
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      if (res.status === 401) throw new AuthError('unauthorized');
      // 429 carries a normal response body ({ status: 'rate_limited' }).
      try {
        const parsed = await res.json();
        if (parsed?.status) return parsed as T;
      } catch {
        // fall through
      }
    }
    throw new Error(error.message);
  }

  return {
    mode: 'supabase',

    async sendCode(target) {
      // Email: the Magic Link (and Confirm signup) templates must contain {{ .Token }} so a code is sent, not a link.
      const { error } = await sb.auth.signInWithOtp(
        target.kind === 'phone' ? { phone: target.phone } : { email: target.email, options: { shouldCreateUser: true } },
      );
      if (error) {
        if (error.status === 0 || /fetch/i.test(error.message)) throw new NetworkError(error.message);
        throw new Error(error.message);
      }
    },
    async verifyCode(target, token) {
      const { data, error } = await sb.auth.verifyOtp(
        target.kind === 'phone' ? { phone: target.phone, token, type: 'sms' } : { email: target.email, token, type: 'email' },
      );
      if (error || !data.user) throw new AuthError(error?.message ?? 'otp');
      await sb.from('profiles').upsert({ id: data.user.id }, { onConflict: 'id', ignoreDuplicates: true });
      return profileOf(data.user);
    },
    async currentProfile() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ? profileOf(data.session.user) : null;
    },
    onAuthChange(listener) {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) listener(null);
      });
      return () => data.subscription.unsubscribe();
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async deleteAccount() {
      await invoke('delete-account', {});
      await sb.auth.signOut({ scope: 'local' });
    },
    async updateName(name) {
      const { data } = await sb.auth.getUser();
      if (!data.user) throw new AuthError('signed out');
      check(await sb.from('profiles').upsert({ id: data.user.id, name: name.trim() || null }));
    },

    async listBusinesses() {
      const rows = check(await sb.from('businesses').select('*, programs(*)').order('name'));
      return (rows as any[]).map((b) => toBusiness(b, b.programs?.[0] ? toProgram(b.programs[0]) : null));
    },
    async getBusiness(id) {
      const b: any = check(await sb.from('businesses').select('*, programs(*)').eq('id', id).maybeSingle());
      return b ? toBusiness(b, b.programs?.[0] ? toProgram(b.programs[0]) : null) : null;
    },
    async listCards() {
      const rows = check(await sb.from('cards').select(CARD_SELECT).neq('status', 'redeemed'));
      return (rows as any[]).map(toCard);
    },
    async getCard(id) {
      const row = check(await sb.from('cards').select(CARD_SELECT).eq('id', id).maybeSingle());
      if (!row) return null;
      const events = check(
        await sb.from('stamp_events').select('id, amount, source, created_at').eq('card_id', id).order('created_at', { ascending: false }),
      ) as any[];
      return {
        card: toCard(row),
        events: events.map((e): StampEvent => ({ id: e.id, amount: e.amount, source: e.source, createdAt: e.created_at })),
      };
    },
    async listRedemptions() {
      const rows = check(
        await sb.from('redemptions').select('id, reward, created_at, business:businesses(name)').order('created_at', { ascending: false }),
      ) as any[];
      return rows.map((r): Redemption => ({ id: r.id, reward: r.reward, businessName: r.business?.name ?? '', createdAt: r.created_at }));
    },

    async addToWallet(programId) {
      const { data } = await sb.auth.getUser();
      if (!data.user) throw new AuthError('signed out');
      const res = await sb.from('cards').insert({ user_id: data.user.id, program_id: programId });
      // 23505: the card is already in the wallet. That is fine.
      if (res.error && res.error.code !== '23505') check(res);
    },
    collect(payload, source) {
      return invoke<CollectResponse>('collect', { payload, source });
    },
    redeemCode(cardId) {
      return invoke<RedeemResponse>('redeem', { action: 'code', cardId });
    },
    confirmRedeem(cardId, code) {
      return invoke<RedeemResponse>('redeem', { action: 'confirm', cardId, code });
    },
  };
}
