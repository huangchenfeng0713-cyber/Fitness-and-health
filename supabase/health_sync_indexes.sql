-- Cover the health_daily -> health_sync_devices foreign key used during device revoke/delete paths.
create index if not exists health_daily_device_id_idx
  on public.health_daily(device_id);
