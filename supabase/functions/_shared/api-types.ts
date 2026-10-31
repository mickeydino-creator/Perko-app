// Request and response shapes of the Edge Functions, shared with the app. No imports.

import type { ProgramType } from './loyalty.ts';

/** Where a collection came from. 'nfc' is reserved: v1 only sends 'qr'. */
export type CollectSource = 'qr' | 'nfc';

/**
 * Collecting takes two calls. 'check' (no PIN) runs every test that does not need the staff member: the code,
 * the lockout, the rate limit and the cooldown, so the customer learns "come back later" before anyone types a
 * PIN. 'collect' repeats them with the 4-digit staff PIN and writes the stamp.
 */
export type CollectRequest = { payload: string; source: CollectSource; action: 'check' | 'collect'; pin?: string };

export type CollectedCard = {
  cardId: string;
  businessId: string;
  businessName: string;
  programName: string;
  type: ProgramType;
  goal: number;
  current: number;
  reward: string;
};

/** What the customer will get, shown above the PIN pad. The card may not exist yet (first scan). */
export type PendingCollect = Omit<CollectedCard, 'cardId'> & { cardId: string | null; step: number };

export type CollectResponse =
  | ({ status: 'ok'; added: number; completed: boolean } & CollectedCard)
  | { status: 'cooldown'; retryAt: string; remainingMinutes: number; businessName: string }
  | ({ status: 'complete' } & CollectedCard) // the card is already full: redeem first
  | ({ status: 'pin_required' } & PendingCollect) // check passed: show the PIN pad to the staff member
  | { status: 'wrong_pin'; attemptsLeft: number; businessName: string }
  | { status: 'locked'; until: string; businessName: string } // too many wrong PINs today at this business
  | { status: 'invalid' } // not a Perko code, bad signature, unknown code
  | { status: 'inactive' } // revoked code, or the business or program is paused
  | { status: 'rate_limited' };

/** A reward is used when a staff member types their PIN on the customer's phone. */
export type RedeemRequest = { action: 'confirm'; cardId: string; pin: string };

export type RedeemResponse =
  | { status: 'redeemed'; newCardId: string; reward: string }
  | { status: 'wrong_pin'; attemptsLeft: number }
  | { status: 'locked'; until: string } // too many wrong PINs today at this business
  | { status: 'not_ready' } // the card is not complete (or already redeemed)
  | { status: 'not_found' };

// business-admin: what the owner dashboard (and scripts/admin.ts with the service role key) can do.
export type PinMode = 'shared' | 'per_staff';

export type BusinessAdminRequest =
  | { action: 'pin_mode'; businessId: string; mode: PinMode } // switching to shared creates the team PIN
  | { action: 'team_pin'; businessId: string } // create or replace the team PIN (shared mode)
  | { action: 'staff_add'; businessId: string; name: string } // per_staff mode
  | { action: 'staff_remove'; businessId: string; staffPinId: string }
  | { action: 'pin_reset'; businessId: string; staffPinId: string }
  | { action: 'qr_list'; businessId: string }
  | { action: 'qr_create'; businessId: string; label?: string };

export type CounterCode = { id: string; label: string | null; payload: string; createdAt: string };

export type BusinessAdminResponse =
  | { status: 'ok' }
  | { status: 'pin'; staffPinId: string; name: string; pin: string } // the PIN is shown once, never stored in clear
  | { status: 'qr'; businessName: string; codes: CounterCode[] }
  | { status: 'forbidden' }
  | { status: 'invalid'; message: string };
