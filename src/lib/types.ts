import type { CardStatus, ProgramType } from '../../supabase/functions/_shared/loyalty.ts';

export type { CardStatus, ProgramType };
export type {
  CollectResponse,
  CollectSource,
  CollectedCard,
  RedeemResponse,
} from '../../supabase/functions/_shared/api-types.ts';

export type Category = 'cafe' | 'food' | 'shop';
export type Tone = 'lime' | 'ink' | 'pale';

export type Program = {
  id: string;
  name: string;
  type: ProgramType;
  goal: number;
  step: number;
  reward: string;
  rule: string;
  redeemRule: string;
  cooldownMinutes: number;
};

export type Business = {
  id: string;
  name: string;
  kind: string;
  category: Category;
  initial: string;
  tone: Tone;
  address: string | null;
  hours: string | null;
  website: string | null;
  isSample: boolean;
  program: Program | null;
};

export type Card = {
  id: string;
  current: number;
  status: CardStatus;
  createdAt: string;
  lastCollectedAt: string | null;
  completedAt: string | null;
  business: Business;
  program: Program;
};

export type StampEvent = { id: string; amount: number; source: 'qr' | 'nfc'; createdAt: string };

export type Redemption = { id: string; reward: string; businessName: string; createdAt: string };

export type Profile = { id: string; phone: string; email: string | null; name: string | null };

/** How the user signs in: a code by SMS, or (for now, until SMS is set up) a code by email. */
/** Social sign-in providers (browser flow via Supabase). Apple waits for an Apple Developer account. */
export type OAuthProvider = 'google' | 'apple';

export type SignInTarget = { kind: 'phone'; phone: string } | { kind: 'email'; email: string };

export const categoryLabels: Record<Category | 'all', string> = {
  all: 'הכל',
  cafe: 'קפה',
  food: 'אוכל',
  shop: 'חנויות',
};
