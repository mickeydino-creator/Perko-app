-- Map in Discover: where each business is. Nullable: a business without a location is listed but not pinned.
alter table public.businesses
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add constraint businesses_lat_lng_together check ((lat is null) = (lng is null));

-- SAMPLE DATA: approximate points along Emek Refaim and Derech Beit Lechem (Jerusalem), matching the sample
-- addresses. They are illustrations, not the location of any real business.
update public.businesses b set lat = v.lat, lng = v.lng
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 31.7629, 35.2191),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 31.7612, 35.2180),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 31.7568, 35.2213),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 31.7550, 35.2220),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 31.7598, 35.2172)
) as v(id, lat, lng)
where b.id = v.id and b.is_sample;
