export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Without a Supabase project the app runs on local sample data. */
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

/** Sign-in by SMS is hidden until an SMS provider is set up; email codes are the only option for now. */
export const PHONE_SIGN_IN = false;

/** Must match Authentication > Providers > Email > Email OTP Length in the Supabase project. */
export const EMAIL_CODE_LENGTH = 6;

/** Legal pages, published on the marketing site (perko-marketing, src/pages). */
export const PRIVACY_POLICY_URL: string | null = 'https://perko.co.il/privacy';
export const TERMS_URL: string | null = 'https://perko.co.il/terms';
export const ACCESSIBILITY_URL: string | null = 'https://perko.co.il/accessibility';
export const CONTACT_EMAIL: string | null = null; // TODO before the pilot
