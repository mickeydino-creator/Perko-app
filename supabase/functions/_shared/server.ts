// Helpers for the Edge Functions (Deno). Not imported by the app.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Service-role client: bypasses RLS, so every query below must filter by the verified user id. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user, from the Authorization header. */
export async function requireUser(req: Request, db: SupabaseClient): Promise<{ id: string } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

/** QR secrets by key version, from QR_SECRET_V1, QR_SECRET_V2, ... */
export function qrSecrets(): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(Deno.env.toObject())) {
    const m = /^QR_SECRET_V(\d+)$/.exec(k);
    if (m && v) out[Number(m[1])] = v;
  }
  return out;
}

export function secret(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
}
