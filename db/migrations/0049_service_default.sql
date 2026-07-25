-- 0049_service_default.sql
-- Makes the "default service" an explicit, staff-configurable setting instead of the
-- implicit "a service literally named Haircut" fallback baked into default-service.ts.
-- At most one default per location (partial unique index acts as the single-row guard).

alter table services add column if not exists is_default boolean not null default false;

create unique index if not exists uq_services_default_per_location
  on services (location_id)
  where is_default;

-- Backfill: preserve today's implicit behavior exactly — whichever service is named
-- "Haircut" becomes the explicit default. distinct on guards against the (should-not-
-- happen) case of two same-named services at one location tripping the unique index.
with picks as (
  select distinct on (location_id) id
  from services
  where lower(trim(name)) = 'haircut'
  order by location_id, id
)
update services set is_default = true where id in (select id from picks);
