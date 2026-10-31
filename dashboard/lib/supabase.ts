// The browser's Supabase client: the owner's session (email code), reads under RLS, RPCs that check membership,
// and the business-admin Edge Function for anything that needs a secret. Never the service role key.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const configured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Created on first use in the browser, so the build does not need the env variables. */
export function sb(): SupabaseClient {
  if (!configured) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}
