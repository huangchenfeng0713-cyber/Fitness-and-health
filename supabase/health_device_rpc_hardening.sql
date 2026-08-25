-- Harden device-management RPCs: run with caller privileges and let RLS enforce ownership.

revoke insert, update, delete on table public.health_sync_devices from authenticated;
grant insert(user_id, device_name, token_hash) on table public.health_sync_devices to authenticated;
grant update(revoked_at) on table public.health_sync_devices to authenticated;

drop policy if exists "insert own health sync device" on public.health_sync_devices;
create policy "insert own health sync device"
  on public.health_sync_devices
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "update own health sync device" on public.health_sync_devices;
create policy "update own health sync device"
  on public.health_sync_devices
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.register_health_sync_device(
  p_device_name text,
  p_token_hash text
)
returns table(device_id uuid, device_name text, created_at timestamptz, last_sync_at timestamptz)
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_device_name, ''));
  v_hash text := lower(btrim(coalesce(p_token_hash, '')));
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid device name' using errcode = '22023';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  return query
  insert into public.health_sync_devices(user_id, device_name, token_hash)
  values (v_user, v_name, v_hash)
  returning id, health_sync_devices.device_name, health_sync_devices.created_at, health_sync_devices.last_sync_at;
end;
$$;

create or replace function public.revoke_health_sync_device(p_device_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.health_sync_devices
     set revoked_at = coalesce(revoked_at, now())
   where id = p_device_id and user_id = v_user;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.register_health_sync_device(text,text) from public, anon;
revoke all on function public.revoke_health_sync_device(uuid) from public, anon;
grant execute on function public.register_health_sync_device(text,text) to authenticated;
grant execute on function public.revoke_health_sync_device(uuid) to authenticated;
