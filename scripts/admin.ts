// Perko pilot admin: create businesses and programs, add their owners, issue and revoke counter QR codes, print them.
// Owners then run their business in the dashboard (dashboard/). Runs on your machine with the service role key.
//
//   npm run admin -- list
//   npm run admin -- businesses:upsert --file scripts/pilot.example.json
//   npm run admin -- owners:add --business <slug> --email <email>   (the owner signs in to the dashboard with it)
//   npm run admin -- pins:set --business <slug> [--name "דנה"]      (a new staff PIN, shown once; --name in per_staff mode)
//   npm run admin -- qr:create --business <slug> [--label "קופה ראשית"]
//   npm run admin -- qr:print --business <slug>          (re-renders every active code of the business)
//   npm run admin -- qr:revoke --id <qr uuid>
//   npm run admin -- qr:render --id <uuid> --name "<business name>"   (offline: no database, secret only)
//   npm run admin -- qr:from-payload --payload "perko://c/v1...." --name "<business name>"   (no secret: renders a signed code)
//
// Env (.env, never committed): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QR_SECRET_V1 (QR_KEY_VERSION, default 1).
// pins:set needs no PIN_SECRET: it asks the business-admin Edge Function, so the secret stays in Supabase.
// Output: scripts/out/<slug>/<qr id>.png and .pdf (A6 counter card).
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
import { cardFooter, counterCardPdf, QR_PNG_OPTIONS } from '../dashboard/lib/counterCard.ts';
import { parseQrPayload, signQrPayload } from '../supabase/functions/_shared/token.ts';

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' }, business: { type: 'string' }, label: { type: 'string' }, id: { type: 'string' },
    name: { type: 'string' }, payload: { type: 'string' }, email: { type: 'string' },
  },
});
const command = positionals[0];

const keyVersion = Number(process.env.QR_KEY_VERSION ?? 1);
function qrSecret(): string {
  const s = process.env[`QR_SECRET_V${keyVersion}`];
  if (!s) fail(`Set QR_SECRET_V${keyVersion} (the same value as the Edge Function secret).`);
  return s!;
}
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  return createClient(url!, key!, { auth: { persistSession: false } });
}

type PilotBusiness = {
  slug: string; name: string; kind: string; category: 'cafe' | 'food' | 'shop'; initial: string; tone?: 'lime' | 'ink' | 'pale';
  address?: string; hours?: string; website?: string; is_sample?: boolean;
  /** Map position (WGS84). Both or neither; without them the business is listed but not pinned. */
  lat?: number; lng?: number;
  program: { name: string; type: 'stamps' | 'points'; goal: number; step?: number; reward: string; rule: string; redeem_rule?: string; cooldown_minutes?: number };
};

async function upsertBusinesses(file: string) {
  const list = JSON.parse(readFileSync(file, 'utf8')) as PilotBusiness[];
  const sb = db();
  for (const b of list) {
    const { program, ...business } = b;
    const { data: row, error } = await sb.from('businesses').upsert({ is_sample: false, ...business }, { onConflict: 'slug' }).select('id').single();
    if (error) fail(`${b.slug}: ${error.message}`);
    // One running program per business, edited in place: open cards keep the rules they were opened with
    // (cards snapshot), new cards get the new ones. Same as an owner editing the program in the dashboard.
    const { data: current } = await sb.from('programs').select('*').eq('business_id', row!.id).eq('active', true).maybeSingle();
    const next = { step: 1, redeem_rule: 'בקופה, מול הצוות', cooldown_minutes: 120, ...program };
    const same = current && (Object.keys(next) as (keyof typeof next)[]).every((k) => current[k] === next[k]);
    if (!same) {
      const { error: pe } = current
        ? await sb.from('programs').update(next).eq('id', current.id)
        : await sb.from('programs').insert({ business_id: row!.id, ...next });
      if (pe) fail(`${b.slug} program: ${pe.message}`);
    }
    console.log(`${b.slug}: ${same ? 'unchanged' : 'saved'}`);
  }
}

// --- Printing -------------------------------------------------------------------------------------
// The card itself is drawn by dashboard/lib/counterCard.ts, shared with the owner dashboard.

async function render(outDir: string, qrId: string, businessName: string, label?: string | null) {
  await renderPayload(outDir, await signQrPayload(qrSecret(), keyVersion, qrId), businessName, label);
}

/** Render an already signed payload (no secret needed), e.g. one produced by supabase/dashboard/sign-test-qr.sql. */
async function renderPayload(outDir: string, payload: string, businessName: string, label?: string | null) {
  const parsed = parseQrPayload(payload);
  if (!parsed) fail(`Not a Perko counter code: ${payload}`);
  const qrId = parsed!.qrId;
  mkdirSync(outDir, { recursive: true });
  await QRCode.toFile(`${outDir}/${qrId}.png`, payload, QR_PNG_OPTIONS);

  const fontDir = new URL('../node_modules/@expo-google-fonts/heebo/', import.meta.url);
  const fonts = {
    heavy: readFileSync(new URL('800ExtraBold/Heebo_800ExtraBold.ttf', fontDir)),
    regular: readFileSync(new URL('400Regular/Heebo_400Regular.ttf', fontDir)),
  };
  writeFileSync(`${outDir}/${qrId}.pdf`, await counterCardPdf(payload, businessName, cardFooter(qrId, parsed!.version, label), fonts));
  console.log(`${outDir}/${qrId}.png\n${outDir}/${qrId}.pdf\npayload: ${payload}`);
}

async function businessBySlug(slug: string) {
  const { data, error } = await db().from('businesses').select('id, slug, name, pin_mode').eq('slug', slug).maybeSingle();
  if (error || !data) fail(`No business with slug ${slug}`);
  return data!;
}

/** The auth user for an email, created (confirmed, no password) when it does not exist yet. */
async function userByEmail(email: string): Promise<string> {
  const sb = db();
  const created = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) fail(`Could not create or find ${email}: ${created.error?.message}`);
  }
}

/** Calls the business-admin Edge Function with the service role key, so PIN_SECRET never leaves Supabase. */
async function businessAdmin(body: Record<string, unknown>) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  const res = await fetch(`${url}/functions/v1/business-admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.status === 'invalid' || out.status === 'forbidden') fail(`business-admin: ${res.status} ${JSON.stringify(out)}`);
  return out;
}

switch (command) {
  case 'list': {
    const sb = db();
    const { data: bs } = await sb.from('businesses').select('slug, name, active, is_sample, programs(name, type, goal, reward, active)').order('slug');
    const { data: qrs } = await sb.from('qr_codes').select('id, business_id, label, active, key_version, businesses(slug)');
    for (const b of bs ?? []) console.log(`${b.slug}  ${b.name}${b.is_sample ? '  [sample]' : ''}${b.active ? '' : '  [paused]'}`);
    for (const q of qrs ?? []) console.log(`  qr ${q.id}  ${(q.businesses as unknown as { slug: string })?.slug}  v${q.key_version}  ${q.active ? 'active' : 'revoked'}  ${q.label ?? ''}`);
    break;
  }
  case 'businesses:upsert':
    if (!args.file) fail('--file is required');
    await upsertBusinesses(args.file!);
    break;
  case 'owners:add': {
    if (!args.business || !args.email) fail('--business <slug> and --email <email> are required');
    const email = args.email!.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail(`Not an email address: ${args.email}`);
    const b = await businessBySlug(args.business!);
    const userId = await userByEmail(email);
    const { error } = await db().from('business_members').upsert({ user_id: userId, business_id: b.id, role: 'owner' });
    if (error) fail(error.message);
    console.log(`${email} owns ${b.slug}. They sign in to the dashboard with a code sent to this address.`);
    break;
  }
  case 'pins:set': {
    if (!args.business) fail('--business <slug> is required');
    const b = await businessBySlug(args.business!);
    if (b.pin_mode === 'per_staff' && !args.name) fail(`${b.slug} has a PIN per staff member: add --name "<staff name>"`);
    const out = b.pin_mode === 'per_staff'
      ? await businessAdmin({ action: 'staff_add', businessId: b.id, name: args.name })
      : await businessAdmin({ action: 'team_pin', businessId: b.id });
    console.log(`${b.slug}: PIN for ${out.name}: ${out.pin}\nShown once. Give it to the staff; any earlier team PIN no longer works.`);
    break;
  }
  case 'qr:create': {
    if (!args.business) fail('--business <slug> is required');
    qrSecret();
    const b = await businessBySlug(args.business!);
    const { data, error } = await db().from('qr_codes').insert({ business_id: b.id, label: args.label ?? null, key_version: keyVersion }).select('id').single();
    if (error) fail(error.message);
    await render(`scripts/out/${b.slug}`, data!.id, b.name, args.label);
    break;
  }
  case 'qr:print': {
    if (!args.business) fail('--business <slug> is required');
    const b = await businessBySlug(args.business!);
    const { data } = await db().from('qr_codes').select('id, label, key_version').eq('business_id', b.id).eq('active', true);
    const codes = (data ?? []).filter((q) => q.key_version === keyVersion);
    if (!codes.length) fail(`No active v${keyVersion} codes for ${b.slug}. Create one with qr:create.`);
    for (const q of codes) await render(`scripts/out/${b.slug}`, q.id, b.name, q.label);
    break;
  }
  case 'qr:revoke': {
    if (!args.id) fail('--id is required');
    const { error } = await db().from('qr_codes').update({ active: false, revoked_at: new Date().toISOString() }).eq('id', args.id!);
    if (error) fail(error.message);
    console.log(`revoked ${args.id}. Scans of this code now return "inactive".`);
    break;
  }
  case 'qr:from-payload':
    if (!args.payload || !args.name) fail('--payload and --name are required');
    await renderPayload('scripts/out/payload', args.payload!, args.name!, args.label);
    break;
  case 'qr:render':
    if (!args.id || !args.name) fail('--id and --name are required');
    await render('scripts/out/offline', args.id!, args.name!, args.label);
    break;
  default:
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(0, 17).join('\n'));
}
