-- Street address and phone for each shop.
--
-- `locations` held only name and timezone, which meant a shop had no address
-- anywhere in the system. That blocks more than a settings screen: no address
-- on a receipt, nothing to put in a map link or directions for a client, and no
-- jurisdiction anchor for the per-location `tax_config` rate the platform
-- already stores — the rate was configurable while the place it applies to was
-- not recorded.
--
-- Unlike a staff member's home address (0054, restricted), a shop's address is
-- public-facing: it belongs on a booking page and a receipt. No visibility rule
-- governs it, only who may EDIT it — owners, since adding and configuring
-- locations is explicitly outside a manager's scope (ARCHITECTURE Part 2).
--
-- All nullable, so existing rows stay valid and this is safe to apply before
-- the API build that reads it.
alter table locations add column if not exists address_line1 text;
alter table locations add column if not exists address_line2 text;
alter table locations add column if not exists city text;
alter table locations add column if not exists region text;
alter table locations add column if not exists postal_code text;
alter table locations add column if not exists country char(2) default 'US';
-- The shop's public phone, distinct from any staff member's personal number.
alter table locations add column if not exists phone text;

comment on column locations.address_line1 is
  'Public-facing shop address. Unlike users.address_line1 this is not restricted — it belongs on receipts and booking pages. Owner-only to edit.';
