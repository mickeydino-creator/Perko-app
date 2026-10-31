// POST /functions/v1/business-admin  { action, businessId, ... }
// Owner actions that need a server secret, called by the owner dashboard (dashboard/) and by scripts/admin.ts
// (with the service role key, for businesses without an owner). The caller must own the business.
//   pin_mode      'shared' (one code for the team) or 'per_staff'. Switching deactivates the other mode's PINs;
//                 switching to shared creates the team PIN and returns it.
//   team_pin      create or replace the team PIN (shared mode)
//   staff_add     a staff member with their own PIN (per_staff mode)
//   staff_remove  deactivate a staff member's PIN (kept for the log)
//   pin_reset     replace a PIN: the old row is deactivated, a new one is created under the same name
//   qr_list       the business's active counter codes, signed, for printing
//   qr_create     a new counter code
// A new PIN is returned once and never stored in clear. Program edits do not come here: owners edit their
// program directly under RLS (migration 20261031100200_business_members.sql).
import { signQrPayload, UUID } from '../_shared/token.ts';
import type { BusinessAdminRequest, BusinessAdminResponse, CounterCode } from '../_shared/api-types.ts';
import { admin, cors, json, qrSecrets, requireCaller, secret } from '../_shared/server.ts';
import { issuePin } from '../_shared/pins.ts';

const TEAM = 'צוות';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const db = admin();
  const caller = await requireCaller(req, db);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  let body: BusinessAdminRequest;
  try {
    body = await req.json();
  } catch {
    return json({ status: 'invalid', message: 'body' } satisfies BusinessAdminResponse, 400);
  }
  if (typeof body.businessId !== 'string' || !UUID.test(body.businessId)) {
    return json({ status: 'invalid', message: 'businessId' } satisfies BusinessAdminResponse, 400);
  }

  if (!caller.service) {
    const { data: member } = await db
      .from('business_members')
      .select('role')
      .eq('user_id', caller.id)
      .eq('business_id', body.businessId)
      .maybeSingle();
    if (member?.role !== 'owner') return json({ status: 'forbidden' } satisfies BusinessAdminResponse, 403);
  }

  const { data: business } = await db.from('businesses').select('id, name, pin_mode').eq('id', body.businessId).maybeSingle();
  if (!business) return json({ status: 'forbidden' } satisfies BusinessAdminResponse, 403);

  const deactivate = (q: { ids?: string[]; name?: string; except?: string } = {}) => {
    let u = db.from('staff_pins').update({ active: false }).eq('business_id', business.id).eq('active', true);
    if (q.ids) u = u.in('id', q.ids);
    if (q.name) u = u.eq('name', q.name);
    if (q.except) u = u.neq('name', q.except);
    return u;
  };
  const newPin = async (name: string): Promise<Response> => {
    const { id, pin } = await issuePin(db, secret('PIN_SECRET'), business.id, name);
    return json({ status: 'pin', staffPinId: id, name, pin } satisfies BusinessAdminResponse);
  };
  const invalid = (message: string) => json({ status: 'invalid', message } satisfies BusinessAdminResponse, 400);

  switch (body.action) {
    case 'pin_mode': {
      if (body.mode !== 'shared' && body.mode !== 'per_staff') return invalid('mode');
      if (body.mode === business.pin_mode) return json({ status: 'ok' } satisfies BusinessAdminResponse);
      await db.from('businesses').update({ pin_mode: body.mode }).eq('id', business.id);
      if (body.mode === 'per_staff') {
        // Staff PINs are added one by one; until then nobody can confirm at the counter.
        await deactivate({ name: TEAM });
        return json({ status: 'ok' } satisfies BusinessAdminResponse);
      }
      await deactivate();
      return newPin(TEAM);
    }

    case 'team_pin':
      if (business.pin_mode !== 'shared') return invalid('mode');
      await deactivate({ name: TEAM });
      return newPin(TEAM);

    case 'staff_add': {
      if (business.pin_mode !== 'per_staff') return invalid('mode');
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 1 || name.length > 40 || name === TEAM) return invalid('name');
      return newPin(name);
    }

    case 'staff_remove':
    case 'pin_reset': {
      if (typeof body.staffPinId !== 'string' || !UUID.test(body.staffPinId)) return invalid('staffPinId');
      const { data: row } = await db
        .from('staff_pins')
        .select('id, name')
        .eq('id', body.staffPinId)
        .eq('business_id', business.id)
        .eq('active', true)
        .maybeSingle();
      if (!row) return invalid('staffPinId');
      await deactivate({ ids: [row.id] });
      return body.action === 'pin_reset' ? newPin(row.name) : json({ status: 'ok' } satisfies BusinessAdminResponse);
    }

    case 'qr_list':
    case 'qr_create': {
      const secrets = qrSecrets();
      const version = Math.max(...Object.keys(secrets).map(Number));
      if (!Number.isFinite(version)) return json({ error: 'qr secret' }, 500);
      if (body.action === 'qr_create') {
        const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) || null : null;
        await db.from('qr_codes').insert({ business_id: business.id, label, key_version: version });
      }
      const { data: rows } = await db
        .from('qr_codes')
        .select('id, label, key_version, created_at')
        .eq('business_id', business.id)
        .eq('active', true)
        .order('created_at');
      const codes: CounterCode[] = [];
      for (const q of rows ?? []) {
        // Codes signed with a removed key version no longer scan: they are left out.
        if (!secrets[q.key_version]) continue;
        codes.push({ id: q.id, label: q.label, payload: await signQrPayload(secrets[q.key_version], q.key_version, q.id), createdAt: q.created_at });
      }
      return json({ status: 'qr', businessName: business.name, codes } satisfies BusinessAdminResponse);
    }
  }
  return invalid('action');
});
