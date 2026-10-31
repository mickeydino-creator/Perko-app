// Everything the dashboard reads and writes. Reads go through RLS and the owner RPCs
// (supabase/migrations/20261031100200_business_members.sql); PINs and counter codes through business-admin.
import type { BusinessAdminRequest, BusinessAdminResponse, PinMode } from '../../supabase/functions/_shared/api-types.ts';
import { sb } from './supabase';

export type { PinMode };

export type Business = { id: string; name: string; slug: string; pinMode: PinMode; active: boolean };

export type Program = {
  id: string;
  name: string;
  type: 'stamps' | 'points';
  goal: number;
  step: number;
  reward: string;
  rule: string;
  redeemRule: string;
  cooldownMinutes: number;
};

export type Staff = { id: string; name: string; createdAt: string };

export type LogRow = { kind: 'stamp' | 'redeem'; createdAt: string; amount: number | null; reward: string | null; staffName: string; customer: string };

export type Insights = { activeCustomers: number; returningCustomers: number; rewardsRedeemed: number; visits: number; visitsPerCustomer: number };

export type Alert = { id: string; kind: 'pin_lockout' | 'pin_failures'; createdAt: string; seenAt: string | null; failures: number | null; customer: string | null };

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** The businesses the signed-in user owns. */
export async function myBusinesses(): Promise<Business[]> {
  const rows = check(await sb().from('business_members').select('role, business:businesses(id, name, slug, pin_mode, active)').eq('role', 'owner'));
  return (rows as unknown as { business: { id: string; name: string; slug: string; pin_mode: PinMode; active: boolean } | null }[])
    .filter((r) => r.business)
    .map((r) => ({ id: r.business!.id, name: r.business!.name, slug: r.business!.slug, pinMode: r.business!.pin_mode, active: r.business!.active }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export async function getProgram(businessId: string): Promise<Program | null> {
  const p = check(await sb().from('programs').select('*').eq('business_id', businessId).eq('active', true).maybeSingle()) as Record<string, never> | null;
  if (!p) return null;
  return {
    id: p.id, name: p.name, type: p.type, goal: p.goal, step: p.step, reward: p.reward, rule: p.rule,
    redeemRule: p.redeem_rule, cooldownMinutes: p.cooldown_minutes,
  };
}

export async function saveProgram(p: Program): Promise<void> {
  check(await sb().from('programs').update({
    name: p.name, type: p.type, goal: p.goal, step: p.type === 'stamps' ? 1 : p.step, reward: p.reward, rule: p.rule,
    redeem_rule: p.redeemRule, cooldown_minutes: p.cooldownMinutes,
  }).eq('id', p.id));
}

export async function listStaff(businessId: string): Promise<Staff[]> {
  const rows = check(await sb().from('staff_pins').select('id, name, created_at').eq('business_id', businessId).eq('active', true).order('created_at'));
  return (rows as { id: string; name: string; created_at: string }[]).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

/** Calls the business-admin Edge Function as the signed-in owner. */
export async function businessAdmin(body: BusinessAdminRequest): Promise<BusinessAdminResponse> {
  const { data, error } = await sb().functions.invoke('business-admin', { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    const parsed = await res?.json?.().catch(() => null);
    if (parsed?.status) return parsed as BusinessAdminResponse;
    throw new Error(error.message);
  }
  return data as BusinessAdminResponse;
}

export async function getLog(businessId: string, days: number): Promise<LogRow[]> {
  const rows = check(await sb().rpc('business_log', { p_business: businessId, p_days: days, p_limit: 500 })) as Record<string, never>[];
  return rows.map((r) => ({ kind: r.kind, createdAt: r.created_at, amount: r.amount, reward: r.reward, staffName: r.staff_name, customer: r.customer }));
}

export async function getInsights(businessId: string, days: number): Promise<Insights> {
  const rows = check(await sb().rpc('business_insights', { p_business: businessId, p_days: days })) as Record<string, number>[];
  const r = rows[0] ?? {};
  return {
    activeCustomers: r.active_customers ?? 0,
    returningCustomers: r.returning_customers ?? 0,
    rewardsRedeemed: r.rewards_redeemed ?? 0,
    visits: r.visits ?? 0,
    visitsPerCustomer: Number(r.visits_per_customer ?? 0),
  };
}

export async function getAlerts(businessId: string): Promise<Alert[]> {
  const rows = check(await sb().rpc('business_alert_list', { p_business: businessId, p_limit: 200 })) as Record<string, never>[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, createdAt: r.created_at, seenAt: r.seen_at, failures: r.failures, customer: r.customer }));
}

export async function markAlertsSeen(businessId: string): Promise<void> {
  check(await sb().from('business_alerts').update({ seen_at: new Date().toISOString() }).eq('business_id', businessId).is('seen_at', null));
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
/** Dates and times in Israel time, whatever the owner's computer is set to. */
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
