// POST /functions/v1/delete-account
// Deletes the signed-in user. Profiles, cards, events and redemptions go with it (on delete cascade).
// Required by Google Play: account deletion must be available inside the app.
import { admin, cors, json, requireUser } from '../_shared/server.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const db = admin();
  const user = await requireUser(req, db);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ error: 'delete' }, 500);
  return json({ status: 'deleted' });
});
