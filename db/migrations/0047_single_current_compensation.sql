-- 0047_single_current_compensation.sql
-- Guarantee at most one *current* compensation row per staff member. Compensation is
-- effective-dated (effective_to IS NULL means "in effect now"); updateStaffCompensation closes the
-- open row before inserting a new one, but two concurrent edits could otherwise leave two open rows
-- — i.e. two overlapping "current" pay rules, which would make pay estimates ambiguous. This partial
-- unique index makes that state impossible at the database level (defense in depth, like the
-- appointment overlap guard in 0046).
create unique index if not exists uq_staff_comp_current
  on staff_compensation_history (location_staff_id)
  where effective_to is null;
