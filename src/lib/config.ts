export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Without a Supabase project the app runs on local sample data. */
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

/** Sign-in by SMS is hidden until an SMS provider is set up; email codes are the only option for now. */
export const PHONE_SIGN_IN = false;

export const PRIVACY_POLICY_URL: string | null = null; // TODO before the pilot: the published privacy policy
export const CONTACT_EMAIL: string | null = null; // TODO before the pilot
