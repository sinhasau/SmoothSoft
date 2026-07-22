-- Low-weight client continuity control for queue recommendations.
-- 0 favors introducing the client to another eligible professional;
-- 100 favors a professional the client has visited before.
alter table queue_config
  add column if not exists client_continuity_weight int not null default 60;

alter table queue_config
  drop constraint if exists queue_config_client_continuity_weight_check,
  add constraint queue_config_client_continuity_weight_check
    check (client_continuity_weight between 0 and 100);

-- A front-desk override can place a waiting client in Ready to seat even
-- before an eligible professional becomes available.
alter table queue_entries
  add column if not exists ready_override boolean;
