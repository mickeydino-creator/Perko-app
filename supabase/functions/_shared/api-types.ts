// Request and response shapes of the Edge Functions, shared with the app. No imports.

import type { ProgramType } from './loyalty.ts';

/** Where a collection came from. 'nfc' is reserved: v1 only sends 'qr'. */
export type CollectSource = 'qr' | 'nfc';

export type CollectRequest = { payload: string; source: CollectSource };

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

export type CollectResponse =
  | ({ status: 'ok'; added: number; completed: boolean } & CollectedCard)
  | { status: 'cooldown'; retryAt: string; remainingMinutes: number; businessName: string }
  | ({ status: 'complete' } & CollectedCard) // the card is already full: redeem first
  | { status: 'invalid' } // not a Perko code, bad signature, unknown code
  | { status: 'inactive' } // revoked code, or the business or program is paused
  | { status: 'rate_limited' };

export type RedeemRequest =
  | { action: 'code'; cardId: string }
  | { action: 'confirm'; cardId: string; code: string };

export type RedeemResponse =
  | { status: 'code'; code: string; expiresAt: string }
  | { status: 'redeemed'; newCardId: string; reward: string }
  | { status: 'expired' } // the code shown is no longer valid
  | { status: 'not_ready' } // the card is not complete (or already redeemed)
  | { status: 'not_found' };
