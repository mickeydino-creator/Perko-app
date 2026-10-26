-- Sign the existing test counter codes (label 'בדיקה') from the Supabase SQL Editor.
-- 1. Replace PASTE_QR_SECRET_V1_HERE with the exact value of the QR_SECRET_V1 Edge Function secret.
-- 2. Run. Each row is one business and the text of its QR code (perko://c/v1.<id>.<signature>).
-- Same HMAC as supabase/functions/_shared/token.ts. The secret stays in this project's SQL history.
with params as (select 'PASTE_QR_SECRET_V1_HERE'::text as secret)
select
  b.name as business,
  'perko://c/v1.' || q.id::text || '.' ||
  rtrim(translate(encode(substring(extensions.hmac('perko.qr.v1.' || q.id::text, p.secret, 'sha256') from 1 for 16), 'base64'), '+/', '-_'), '=')
  as qr_payload
from public.qr_codes q
join public.businesses b on b.id = q.business_id, params p
where q.active and q.key_version = 1 and q.label = 'בדיקה'
order by b.name;
