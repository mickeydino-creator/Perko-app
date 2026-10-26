// The data layer the screens talk to. Two implementations: Supabase (real) and demo (local sample data).
import type { Business, Card, CollectResponse, CollectSource, Profile, Redemption, RedeemResponse, SignInTarget, StampEvent } from './types';

export type AuthListener = (profile: Profile | null) => void;

export interface Backend {
  readonly mode: 'supabase' | 'demo';

  // Auth: a one-time code by SMS (phone) or by email
  sendCode(target: SignInTarget): Promise<void>;
  verifyCode(target: SignInTarget, code: string): Promise<Profile>;
  currentProfile(): Promise<Profile | null>;
  onAuthChange(listener: AuthListener): () => void;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  updateName(name: string): Promise<void>;

  // Reading
  listBusinesses(): Promise<Business[]>;
  getBusiness(id: string): Promise<Business | null>;
  listCards(): Promise<Card[]>;
  getCard(id: string): Promise<{ card: Card; events: StampEvent[] } | null>;
  listRedemptions(): Promise<Redemption[]>;

  // Writing. Stamps are never written by the client: collect and redeem go to the server functions.
  addToWallet(programId: string): Promise<void>;
  collect(payload: string, source: CollectSource): Promise<CollectResponse>;
  redeemCode(cardId: string): Promise<RedeemResponse>;
  confirmRedeem(cardId: string, code: string): Promise<RedeemResponse>;
}

/** Thrown when a request could not reach the server. */
export class NetworkError extends Error {}
/** Thrown when the user must sign in again. */
export class AuthError extends Error {}
