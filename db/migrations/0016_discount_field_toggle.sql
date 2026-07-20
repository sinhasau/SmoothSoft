-- 0016_discount_field_toggle.sql
-- Owner setting for whether the checkout panel offers a discount-code
-- field at all: shown behind a small "+ Discount code" affordance when
-- enabled (the default), hidden entirely when disabled.

alter table payment_processor_config
  add column show_discount_at_checkout boolean not null default true;
