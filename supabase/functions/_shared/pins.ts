// Staff PINs on the server (Deno): checking a PIN typed at the counter and issuing new ones.
// The PIN itself is never stored, only hashPin() of it, keyed with PIN_SECRET.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { PIN_MAX_FAILURES } from './loyalty.ts';
import { hashPin, isPinFormat, randomPin } from './token.ts';

export type PinCheck =
  | { kind: 'ok'; staffPinId: string }
  | { kind: 'wrong'; attemptsLeft: number }
  | { kind: 'locked'; until: string };

/** Midnight in Israel when the customer is locked out at this business, else null. */
export async function lockedUntil(db: SupabaseClient, userId: string, businessId: string): Promise<string | null> {
  const { data, error } = await db.rpc('pin_locked_until', { p_user: userId, p_business: businessId });
  if (error) throw new Error(`pin_locked_until: ${error.message}`);
  return (data as string | null) ?? null;
}

/**
 * Checks a PIN typed at the counter against the business's active PINs. A wrong PIN is logged; the last
 * allowed one locks the customer at this business until midnight and alerts the owner (register_pin_failure).
 * Call lockedUntil() first: a locked customer must not get another try.
 */
export async function checkStaffPin(
  db: SupabaseClient, secret: string, userId: string, businessId: string, pin: unknown, context: 'collect' | 'redeem',
): Promise<PinCheck> {
  if (isPinFormat(pin)) {
    const { data } = await db
      .from('staff_pins')
      .select('id')
      .eq('business_id', businessId)
      .eq('pin_hash', await hashPin(secret, businessId, pin))
      .eq('active', true)
      .maybeSingle();
    if (data) return { kind: 'ok', staffPinId: data.id };
  }
  const { data: failures, error } = await db.rpc('register_pin_failure', { p_user: userId, p_business: businessId, p_context: context });
  if (error) throw new Error(`register_pin_failure: ${error.message}`);
  const n = Number(failures);
  if (n >= PIN_MAX_FAILURES) {
    return { kind: 'locked', until: (await lockedUntil(db, userId, businessId)) ?? new Date().toISOString() };
  }
  return { kind: 'wrong', attemptsLeft: PIN_MAX_FAILURES - n };
}

/** Creates an active PIN for a staff member (or "צוות") and returns it. It is shown once and never again. */
export async function issuePin(db: SupabaseClient, secret: string, businessId: string, name: string): Promise<{ id: string; pin: string }> {
  // A PIN must be unique among the business's active PINs; with at most a few dozen staff a clash is rare.
  for (let i = 0; i < 25; i++) {
    const pin = randomPin();
    const { data, error } = await db
      .from('staff_pins')
      .insert({ business_id: businessId, name, pin_hash: await hashPin(secret, businessId, pin) })
      .select('id')
      .single();
    if (data) return { id: data.id, pin };
    if (error?.code !== '23505') throw new Error(`staff_pins: ${error?.message}`);
  }
  throw new Error('could not find a free PIN');
}
