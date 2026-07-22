-- Owner-controlled thresholds used by the scheduling grid.
alter table location_scheduling_policy
  add column if not exists overtime_threshold_hours numeric(5,2) not null default 40,
  add column if not exists minimum_coverage integer not null default 2;

alter table location_scheduling_policy
  drop constraint if exists location_scheduling_policy_overtime_threshold_check,
  add constraint location_scheduling_policy_overtime_threshold_check check (overtime_threshold_hours > 0 and overtime_threshold_hours <= 168),
  drop constraint if exists location_scheduling_policy_minimum_coverage_check,
  add constraint location_scheduling_policy_minimum_coverage_check check (minimum_coverage >= 0 and minimum_coverage <= 100);
