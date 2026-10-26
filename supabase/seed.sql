-- SAMPLE DATA. The five businesses below are illustrations taken from the marketing site
-- (src/data/businesses.ts and the Discover screen). None of them is a real participant.
-- They are flagged is_sample = true and the app labels them "לדוגמה". Their map points are approximate
-- spots on the sample streets, not the location of any real business.
-- Do not add the prospects from research/prospects.json here: none of them has agreed to participate.

insert into public.businesses (id, slug, name, kind, category, initial, tone, address, hours, website, is_sample, lat, lng) values
  ('a0000000-0000-4000-8000-000000000001', 'cafe-pina', 'קפה פינה', 'בית קפה שכונתי', 'cafe', 'פ', 'lime',
   'כתובת לדוגמה, עמק רפאים', 'שעות לדוגמה: א׳-ה׳ 7:00-19:00, ו׳ 7:00-14:00', null, true, 31.7629, 35.2191),
  ('a0000000-0000-4000-8000-000000000002', 'zaatar', 'זעתר', 'מסעדה שכונתית', 'food', 'ז', 'ink',
   'כתובת לדוגמה, עמק רפאים', 'שעות לדוגמה: א׳-ה׳ 12:00-23:00', null, true, 31.7612, 35.218),
  ('a0000000-0000-4000-8000-000000000003', 'dafdouf', 'דפדוף', 'חנות ספרים מקומית', 'shop', 'ד', 'pale',
   'כתובת לדוגמה, דרך בית לחם', 'שעות לדוגמה: א׳-ה׳ 10:00-20:00, ו׳ 9:00-14:00', null, true, 31.7568, 35.2213),
  ('a0000000-0000-4000-8000-000000000004', 'hagefen-bakery', 'מאפיית הגפן', 'מאפייה', 'food', 'מ', 'lime',
   'כתובת לדוגמה, דרך בית לחם', 'שעות לדוגמה: א׳-ו׳ 6:30-15:00', null, true, 31.755, 35.222),
  ('a0000000-0000-4000-8000-000000000005', 'pirhei-hasdera', 'פרחי השדרה', 'חנות פרחים', 'shop', 'פ', 'pale',
   'כתובת לדוגמה, עמק רפאים', 'שעות לדוגמה: א׳-ה׳ 9:00-19:00, ו׳ 8:00-14:00', null, true, 31.7598, 35.2172);

insert into public.programs (id, business_id, name, type, goal, step, reward, rule) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'כרטיס קפה', 'stamps', 10, 1, 'קפה הפוך עלינו', 'חותמת על כל משקה חם'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'כרטיס ארוחות', 'stamps', 6, 1, 'קינוח לשניים', 'חותמת על כל ארוחה במקום'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'מועדון קוראים', 'points', 200, 20, 'שובר 30 ₪ לקנייה הבאה', '20 נקודות על כל קנייה'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'כרטיס מאפים', 'stamps', 8, 1, 'מאפה לבחירה', 'חותמת על כל קנייה מעל 20 ₪'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', 'כרטיס פרחים', 'stamps', 5, 1, 'זר קטן', 'חותמת על כל זר');
