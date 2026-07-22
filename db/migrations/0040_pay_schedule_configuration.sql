alter table location_payroll_settings
  add column if not exists schedule_name text not null default 'Primary pay schedule',
  add column if not exists frequency text not null default 'biweekly' check (frequency in ('weekly','biweekly','semimonthly','monthly')),
  add column if not exists workweek_starts_on smallint not null default 0 check (workweek_starts_on between 0 and 6),
  add column if not exists payday_offset_business_days integer not null default 5 check (payday_offset_business_days between 0 and 10);

update location_payroll_settings
set frequency = case when period_length_days = 7 then 'weekly' else 'biweekly' end,
    payday_offset_business_days = least(payday_offset_days, 10);
