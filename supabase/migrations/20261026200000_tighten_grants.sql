-- Signed-in users only read, and write through the policies in init. TRUNCATE ignores RLS, so it must
-- never be granted to app roles (PostgREST cannot issue it, but a leaked role or a future RPC could).
-- Profiles keep table-level UPDATE: the app upserts { id, name }, which needs UPDATE on id as well;
-- the own-profile policies still limit every write to the caller's row.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke delete on public.profiles from authenticated;
