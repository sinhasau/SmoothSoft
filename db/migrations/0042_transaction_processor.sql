-- Preserve the processor used for each card sale. The active location
-- processor can change later, but refunds must always go back through the
-- processor that created the original payment.
alter table transactions
  add column if not exists payment_processor text
  check (payment_processor in ('stripe', 'square', 'external'));

update transactions
set payment_processor = case
  when payment_method = 'external' then 'external'
  when payment_method = 'card' and payment_processor_ref like 'pi_%' then 'stripe'
  else payment_processor
end
where payment_processor is null;

alter table refunds add column if not exists idempotency_key text;
create unique index if not exists idx_refunds_idempotency_key
  on refunds (idempotency_key)
  where idempotency_key is not null;
