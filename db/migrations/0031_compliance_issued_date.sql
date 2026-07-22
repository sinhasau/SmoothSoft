alter table compliance_documents
  add column if not exists issued_at date;

alter table compliance_documents
  drop constraint if exists compliance_documents_date_order_check,
  add constraint compliance_documents_date_order_check
    check (issued_at is null or expires_at is null or issued_at <= expires_at);
