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
import fontkit from '@pdf-lib/fontkit';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
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

const LIME = rgb(0xd7 / 255, 0xff / 255, 0x35 / 255);
const INK = rgb(0x11 / 255, 0x13 / 255, 0x0f / 255);
const MUTED = rgb(0x30 / 255, 0x36 / 255, 0x26 / 255);
const WHITE = rgb(1, 1, 1);

async function render(outDir: string, qrId: string, businessName: string, label?: string | null) {
  await renderPayload(outDir, await signQrPayload(qrSecret(), keyVersion, qrId), businessName, label);
}

/** Render an already signed payload (no secret needed), e.g. one produced by supabase/dashboard/sign-test-qr.sql. */
async function renderPayload(outDir: string, payload: string, businessName: string, label?: string | null) {
  const parsed = parseQrPayload(payload);
  if (!parsed) fail(`Not a Perko counter code: ${payload}`);
  const qrId = parsed!.qrId;
  const keyVersion = parsed!.version;
  mkdirSync(outDir, { recursive: true });
  await QRCode.toFile(`${outDir}/${qrId}.png`, payload, { width: 1200, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#11130F', light: '#FFFFFF' } });

  // A6 counter card, 105 x 148 mm.
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontDir = new URL('../node_modules/@expo-google-fonts/heebo/', import.meta.url);
  const heavy = await pdf.embedFont(readFileSync(new URL('800ExtraBold/Heebo_800ExtraBold.ttf', fontDir)), { subset: true });
  const regular = await pdf.embedFont(readFileSync(new URL('400Regular/Heebo_400Regular.ttf', fontDir)), { subset: true });
  const W = 297.6, H = 419.5, M = 24;
  const page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: LIME });

  // Wordmark: "perk" (Heebo 800, tracking -0.055em, letter by letter) + a solid disc as the "o".
  const wm = 30;
  const base = H - M - wm * 0.8;
  let x = M;
  for (const ch of 'perk') {
    page.drawText(ch, { x, y: base, size: wm, font: heavy, color: INK });
    x += heavy.widthOfTextAtSize(ch, wm) - 0.055 * wm;
  }
  page.drawCircle({ x: x + 0.035 * wm + 0.25 * wm, y: base + 0.25 * wm, size: 0.25 * wm, color: INK });

  // fontkit shapes Hebrew right to left itself: pass logical order, align to the right margin.
  const right = (text: string, y: number, size: number, font = heavy, color = INK) =>
    page.drawText(text, { x: W - M - font.widthOfTextAtSize(text, size), y, size, font, color });
  right(businessName, H - 104, 24);
  right('סורקים כאן אחרי רכישה מזכה', H - 126, 13, regular, MUTED);

  // QR on a white rounded tile, drawn as vector modules.
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const tile = 204;
  const tileX = (W - tile) / 2;
  const tileY = 74;
  page.drawRectangle({ x: tileX, y: tileY, width: tile, height: tile, color: WHITE });
  const pad = 14;
  const cell = (tile - 2 * pad) / n;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c)) page.drawRectangle({ x: tileX + pad + c * cell, y: tileY + tile - pad - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: INK });

  right('החותמת נוספת לכרטיס שלכם באפליקציה.', 52, 11, regular, INK);
  right('כללי הצבירה וההטבה נקבעים על ידי העסק.', 39, 9, regular, MUTED);
  page.drawText(`${label ? label + ' · ' : ''}${qrId.slice(0, 8)} · v${keyVersion}`.replace(/[^\x20-\x7E·]/g, ''), { x: M, y: 18, size: 7, font: regular, color: MUTED });

  writeFileSync(`${outDir}/${qrId}.pdf`, await pdf.save());
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
