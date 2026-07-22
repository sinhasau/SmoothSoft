-- Immutable attachment versions for employee/location compliance records.
create table if not exists compliance_document_files (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  compliance_document_id uuid not null references compliance_documents(id) on delete cascade,
  original_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  content bytea not null,
  uploaded_by_user_id uuid references users(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_compliance_document_files_document on compliance_document_files(compliance_document_id, uploaded_at desc);
alter table compliance_document_files enable row level security;
drop policy if exists location_isolation on compliance_document_files;
create policy location_isolation on compliance_document_files
  using (location_id = current_setting('app.current_location_id')::uuid);
