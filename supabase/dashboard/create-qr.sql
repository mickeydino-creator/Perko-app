-- Create a counter QR code for one business, from the Supabase SQL Editor (no computer setup needed).
-- 1. Replace PASTE_QR_SECRET_V1_HERE with the exact value of the QR_SECRET_V1 Edge Function secret.
-- 2. Replace the slug if needed (sample slugs: cafe-pina, zaatar, dafdouf, hagefen-bakery, pirhei-hasdera).
-- 3. Run. The result is the text to put in the QR code (perko://c/v1.<id>.<signature>).
--    Turn it into an image with any QR generator, or with:  npm run admin -- qr:print --business <slug>
-- If the editor says "function hmac does not exist", write extensions.hmac instead of hmac below.
-- The signature is the same HMAC as supabase/functions/_shared/token.ts (first 16 bytes, base64url).
-- Note: the secret stays in this project's SQL history. To avoid that, use scripts/admin.ts instead.
with params as (
  select 'cafe-pina'::text as slug, 'PASTE_QR_SECRET_V1_HERE'::text as secret, 'בדיקה'::text as label
),
created as (
  insert into public.qr_codes (business_id, label, key_version)
  select b.id, p.label, 1 from public.businesses b, params p where b.slug = p.slug
  returning id
)
select
  'perko://c/v1.' || c.id::text || '.' ||
  rtrim(translate(encode(substring(hmac('perko.qr.v1.' || c.id::text, p.secret, 'sha256') from 1 for 16), 'base64'), '+/', '-_'), '=')
  as qr_payload
from created c, params p;
