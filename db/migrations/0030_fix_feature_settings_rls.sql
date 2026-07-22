drop policy if exists location_isolation on location_feature_settings;
create policy location_isolation on location_feature_settings
  using (location_id = current_setting('app.current_location_id')::uuid)
  with check (location_id = current_setting('app.current_location_id')::uuid);
