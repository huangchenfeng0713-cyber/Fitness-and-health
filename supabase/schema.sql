-- Fitness & Health v1.6 account storage and Apple Health device ingest
-- Run in the Supabase SQL editor once. Never expose a service-role/secret key in the web app.

create table if not exists public.user_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null default 1 check (schema_version between 1 and 1000),
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_snapshots_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint user_snapshots_payload_size check (octet_length(payload::text) <= 8388608)
);

comment on table public.user_snapshots is
  'One atomic health/diet/settings snapshot per authenticated account. Access is restricted by RLS.';

create or replace function public.enforce_user_snapshot_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.revision := 1;
  elsif new.revision <> old.revision + 1 then
    raise exception 'snapshot revision must advance exactly by one'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_snapshot_revision() from public, anon, authenticated;
drop trigger if exists enforce_user_snapshot_revision on public.user_snapshots;
create trigger enforce_user_snapshot_revision
  before insert or update on public.user_snapshots
  for each row execute function public.enforce_user_snapshot_revision();

alter table public.user_snapshots enable row level security;
alter table public.user_snapshots force row level security;

-- 安装后请在 Dashboard 的 pg_policies 中确认本表只有下列四条 policy。
-- 本脚本会重建已知名称，但不会擅自删除项目中名称未知的 permissive policy。

-- Anonymous visitors remain entirely local. Authenticated users receive table privileges, while
-- the policies below restrict every operation to the JWT subject (auth.uid()).
revoke all on table public.user_snapshots from anon;
revoke all on table public.user_snapshots from public;
grant select, insert, update, delete on table public.user_snapshots to authenticated;

drop policy if exists "read own snapshot" on public.user_snapshots;
create policy "read own snapshot"
  on public.user_snapshots
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "insert own snapshot" on public.user_snapshots;
create policy "insert own snapshot"
  on public.user_snapshots
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "update own snapshot" on public.user_snapshots;
create policy "update own snapshot"
  on public.user_snapshots
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "delete own snapshot" on public.user_snapshots;
create policy "delete own snapshot"
  on public.user_snapshots
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- iPhone 快捷指令自动同步
-- 原始设备令牌永远不入库；浏览器只写入 SHA-256 哈希，Edge Function 按哈希鉴权。

create extension if not exists pgcrypto;

create table if not exists public.health_sync_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_sync_at timestamptz,
  revoked_at timestamptz,
  constraint health_sync_devices_name_length check (char_length(device_name) between 1 and 80),
  constraint health_sync_devices_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.health_sync_devices is
  'Write-only Apple Health ingest credentials. Only token hashes are stored.';

create index if not exists health_sync_devices_user_idx
  on public.health_sync_devices (user_id, created_at desc);

create table if not exists public.health_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  captured_at timestamptz not null,
  cumulative_captured_at timestamptz,
  timezone text not null default 'UTC',
  source text not null default 'apple_shortcuts',
  device_id uuid references public.health_sync_devices (id) on delete set null,
  steps bigint,
  steps_captured_at timestamptz,
  active_energy numeric,
  active_energy_captured_at timestamptz,
  resting_energy numeric,
  resting_energy_captured_at timestamptz,
  exercise_minutes numeric,
  exercise_minutes_captured_at timestamptz,
  stand_minutes numeric,
  stand_minutes_captured_at timestamptz,
  distance_km numeric,
  distance_km_captured_at timestamptz,
  sleep_minutes numeric,
  sleep_minutes_captured_at timestamptz,
  water_ml numeric,
  water_ml_captured_at timestamptz,
  weight_kg numeric,
  weight_measured_at timestamptz,
  body_fat_pct numeric,
  body_fat_measured_at timestamptz,
  resting_hr numeric,
  resting_hr_measured_at timestamptz,
  vo2max numeric,
  vo2max_measured_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, date),
  constraint health_daily_timezone_length check (char_length(timezone) between 1 and 64),
  constraint health_daily_source_length check (char_length(source) between 1 and 40),
  constraint health_daily_steps_check check (steps is null or steps between 0 and 250000),
  constraint health_daily_active_energy_check check (active_energy is null or active_energy between 0 and 30000),
  constraint health_daily_resting_energy_check check (resting_energy is null or resting_energy between 0 and 10000),
  constraint health_daily_exercise_minutes_check check (exercise_minutes is null or exercise_minutes between 0 and 1440),
  constraint health_daily_stand_minutes_check check (stand_minutes is null or stand_minutes between 0 and 1440),
  constraint health_daily_distance_check check (distance_km is null or distance_km between 0 and 1000),
  constraint health_daily_sleep_check check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  constraint health_daily_water_check check (water_ml is null or water_ml between 0 and 100000),
  constraint health_daily_weight_check check (weight_kg is null or weight_kg between 1 and 500),
  constraint health_daily_body_fat_check check (body_fat_pct is null or body_fat_pct between 1 and 75),
  constraint health_daily_resting_hr_check check (resting_hr is null or resting_hr between 20 and 250),
  constraint health_daily_vo2max_check check (vo2max is null or vo2max between 5 and 120)
);

-- 兼容先装过 v1.6.0 早期迁移的项目。
alter table public.health_daily
  add column if not exists cumulative_captured_at timestamptz;

-- v1.6.4: every cumulative metric needs its own cursor. A single day-level
-- timestamp makes a later partial upload replay preserved values for fields
-- that were not part of that upload.
alter table public.health_daily
  add column if not exists steps_captured_at timestamptz,
  add column if not exists active_energy_captured_at timestamptz,
  add column if not exists resting_energy_captured_at timestamptz,
  add column if not exists exercise_minutes_captured_at timestamptz,
  add column if not exists stand_minutes_captured_at timestamptz,
  add column if not exists distance_km_captured_at timestamptz,
  add column if not exists sleep_minutes_captured_at timestamptz,
  add column if not exists water_ml_captured_at timestamptz;

-- Backfill existing v1.6.0-v1.6.3 rows once. The legacy day cursor is the
-- most precise timestamp those rows have, so retaining it is safer than now().
update public.health_daily set
  steps_captured_at = case when steps is not null
    then coalesce(steps_captured_at, cumulative_captured_at, captured_at) end,
  active_energy_captured_at = case when active_energy is not null
    then coalesce(active_energy_captured_at, cumulative_captured_at, captured_at) end,
  resting_energy_captured_at = case when resting_energy is not null
    then coalesce(resting_energy_captured_at, cumulative_captured_at, captured_at) end,
  exercise_minutes_captured_at = case when exercise_minutes is not null
    then coalesce(exercise_minutes_captured_at, cumulative_captured_at, captured_at) end,
  stand_minutes_captured_at = case when stand_minutes is not null
    then coalesce(stand_minutes_captured_at, cumulative_captured_at, captured_at) end,
  distance_km_captured_at = case when distance_km is not null
    then coalesce(distance_km_captured_at, cumulative_captured_at, captured_at) end,
  sleep_minutes_captured_at = case when sleep_minutes is not null
    then coalesce(sleep_minutes_captured_at, cumulative_captured_at, captured_at) end,
  water_ml_captured_at = case when water_ml is not null
    then coalesce(water_ml_captured_at, cumulative_captured_at, captured_at) end
where (steps is not null and steps_captured_at is null)
   or (active_energy is not null and active_energy_captured_at is null)
   or (resting_energy is not null and resting_energy_captured_at is null)
   or (exercise_minutes is not null and exercise_minutes_captured_at is null)
   or (stand_minutes is not null and stand_minutes_captured_at is null)
   or (distance_km is not null and distance_km_captured_at is null)
   or (sleep_minutes is not null and sleep_minutes_captured_at is null)
   or (water_ml is not null and water_ml_captured_at is null);

comment on table public.health_daily is
  'Latest accepted Apple Health values per account and local calendar day.';

-- 主键 (user_id, date) 已能正反向扫描日期，不再重复建立同列 DESC 索引。
drop index if exists public.health_daily_user_date_idx;
create index if not exists health_daily_device_id_idx
  on public.health_daily (device_id);
create index if not exists health_daily_user_updated_idx
  on public.health_daily (user_id, updated_at, date);

create table if not exists public.health_sync_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null references public.health_sync_devices (id) on delete cascade,
  sync_id text not null,
  captured_at timestamptz not null,
  date date not null,
  received_at timestamptz not null default now(),
  status text not null default 'received',
  payload jsonb not null,
  constraint health_sync_events_unique unique (device_id, sync_id),
  constraint health_sync_events_sync_id_length check (char_length(sync_id) between 8 and 128),
  constraint health_sync_events_status_check check (status in ('received', 'applied', 'stale')),
  constraint health_sync_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint health_sync_events_payload_size check (octet_length(payload::text) <= 16384)
);

comment on table public.health_sync_events is
  'Idempotency metadata, opportunistically pruned after thirty days on later uploads.';

create index if not exists health_sync_events_user_received_idx
  on public.health_sync_events (user_id, received_at desc);
create index if not exists health_sync_events_device_received_idx
  on public.health_sync_events (device_id, received_at desc);

alter table public.health_sync_devices enable row level security;
alter table public.health_sync_devices force row level security;
alter table public.health_daily enable row level security;
alter table public.health_daily force row level security;
alter table public.health_sync_events enable row level security;
alter table public.health_sync_events force row level security;

revoke all on table public.health_sync_devices from public, anon, authenticated;
revoke all on table public.health_daily from public, anon, authenticated;
revoke all on table public.health_sync_events from public, anon, authenticated;

-- 新项目默认可能不再自动暴露新表，因此这里显式授予最小 Data API 权限。
grant select (id, user_id, device_name, created_at, last_sync_at, revoked_at)
  on public.health_sync_devices to authenticated;
grant insert (user_id, device_name, token_hash)
  on public.health_sync_devices to authenticated;
grant update (revoked_at) on public.health_sync_devices to authenticated;
grant delete on public.health_sync_devices to authenticated;
grant select, delete on public.health_daily to authenticated;
grant select (user_id) on public.health_sync_events to authenticated;
grant delete on public.health_sync_events to authenticated;

drop policy if exists "read own health sync devices" on public.health_sync_devices;
create policy "read own health sync devices"
  on public.health_sync_devices for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "insert own health sync device" on public.health_sync_devices;
create policy "insert own health sync device"
  on public.health_sync_devices for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "update own health sync device" on public.health_sync_devices;
create policy "update own health sync device"
  on public.health_sync_devices for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "delete own health sync device" on public.health_sync_devices;
create policy "delete own health sync device"
  on public.health_sync_devices for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "read own health daily" on public.health_daily;
create policy "read own health daily"
  on public.health_daily for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "delete own health daily" on public.health_daily;
create policy "delete own health daily"
  on public.health_daily for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "delete own health sync events" on public.health_sync_events;
create policy "delete own health sync events"
  on public.health_sync_events for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- 清理早期测试版曾允许读取事件正文的策略；正式版不向浏览器暴露健康上传载荷。
drop policy if exists "read own health sync events" on public.health_sync_events;

-- RPC 使用调用者自己的 RLS 权限。触发器把“最多 10 台”和“撤销后不可复活”
-- 变成表级不变量，因此直接调用 Data API 也无法绕过这些限制。
create or replace function public.enforce_health_sync_device_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_active_count integer;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.user_id is distinct from auth.uid() then
      raise exception 'device owner mismatch' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.user_id::text, 0)
    );
    select count(id) into v_active_count
      from public.health_sync_devices
     where user_id = new.user_id and revoked_at is null;
    if v_active_count >= 10 then
      raise exception 'too many active devices' using errcode = '54000';
    end if;
  elsif tg_op = 'UPDATE' and new.revoked_at is distinct from old.revoked_at then
    if old.revoked_at is not null then
      raise exception 'revoked device cannot be reactivated' using errcode = '22023';
    end if;
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_health_sync_device_mutation() from public, anon, authenticated;
drop trigger if exists enforce_health_sync_device_mutation on public.health_sync_devices;
create trigger enforce_health_sync_device_mutation
  before insert or update on public.health_sync_devices
  for each row execute function public.enforce_health_sync_device_mutation();

create or replace function public.register_health_sync_device(
  p_device_name text,
  p_token_hash text
)
returns table (
  device_id uuid,
  device_name text,
  created_at timestamptz,
  last_sync_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_device_name, ''));
  v_hash text := lower(btrim(coalesce(p_token_hash, '')));
  v_active_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid device name' using errcode = '22023';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  select count(id) into v_active_count
    from public.health_sync_devices
   where user_id = v_user and revoked_at is null;
  if v_active_count >= 10 then
    raise exception 'too many active devices' using errcode = '54000';
  end if;

  return query
  insert into public.health_sync_devices (user_id, device_name, token_hash)
  values (v_user, v_name, v_hash)
  returning id, health_sync_devices.device_name,
    health_sync_devices.created_at, health_sync_devices.last_sync_at;
end;
$$;

create or replace function public.revoke_health_sync_device(p_device_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.health_sync_devices
     set revoked_at = coalesce(revoked_at, now())
   where id = p_device_id and user_id = v_user;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.clear_health_sync_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_daily integer := 0;
  v_events integer := 0;
  v_devices integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.health_sync_events where user_id = v_user;
  get diagnostics v_events = row_count;
  delete from public.health_daily where user_id = v_user;
  get diagnostics v_daily = row_count;
  delete from public.health_sync_devices where user_id = v_user;
  get diagnostics v_devices = row_count;
  return jsonb_build_object('daily', v_daily, 'events', v_events, 'devices', v_devices);
end;
$$;

revoke all on function public.register_health_sync_device(text, text) from public, anon;
revoke all on function public.revoke_health_sync_device(uuid) from public, anon;
revoke all on function public.clear_health_sync_data() from public, anon;
grant execute on function public.register_health_sync_device(text, text) to authenticated;
grant execute on function public.revoke_health_sync_device(uuid) to authenticated;
grant execute on function public.clear_health_sync_data() to authenticated;

create or replace function public.ingest_health_sync(
  p_token_hash text,
  p_sync_id text,
  p_captured_at timestamptz,
  p_date date,
  p_timezone text,
  p_source text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.health_sync_devices%rowtype;
  v_event_id bigint;
  v_updated_at timestamptz;
  v_existing_status text;
  v_applied boolean := false;
  v_weight_at timestamptz;
  v_body_fat_at timestamptz;
  v_resting_hr_at timestamptz;
  v_vo2max_at timestamptz;
  v_recent_count integer;
  v_event_payload jsonb;
begin
  select * into v_device
    from public.health_sync_devices
   where token_hash = lower(p_token_hash) and revoked_at is null
   for update;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select count(id) into v_recent_count
    from public.health_sync_events
   where device_id = v_device.id and received_at >= now() - interval '1 hour';
  if v_recent_count >= 180 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- 事件表只保留字段名用于排错，不复制保存健康数值；实际最新值只在 health_daily 中保留一份。
  select jsonb_build_object(
    'fields', coalesce(jsonb_agg(field order by field), '[]'::jsonb)
  ) into v_event_payload
  from jsonb_object_keys(p_payload) as fields(field);

  insert into public.health_sync_events (
    user_id, device_id, sync_id, captured_at, date, status, payload
  ) values (
    v_device.user_id, v_device.id, p_sync_id, p_captured_at, p_date, 'received', v_event_payload
  ) on conflict (device_id, sync_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select status into v_existing_status
      from public.health_sync_events
     where device_id = v_device.id and sync_id = p_sync_id;
    select updated_at into v_updated_at
      from public.health_daily
     where user_id = v_device.user_id and date = p_date;
    update public.health_sync_devices set last_sync_at = now() where id = v_device.id;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'applied', v_existing_status = 'applied',
      'date', p_date, 'updatedAt', v_updated_at
    );
  end if;

  v_weight_at := case when p_payload ? 'weightKg'
    then coalesce(nullif(p_payload->>'weightMeasuredAt', '')::timestamptz, p_captured_at) end;
  v_body_fat_at := case when p_payload ? 'bodyFatPct'
    then coalesce(nullif(p_payload->>'bodyFatMeasuredAt', '')::timestamptz, p_captured_at) end;
  v_resting_hr_at := case when p_payload ? 'restingHR'
    then coalesce(nullif(p_payload->>'restingHRMeasuredAt', '')::timestamptz, p_captured_at) end;
  v_vo2max_at := case when p_payload ? 'vo2max'
    then coalesce(nullif(p_payload->>'vo2maxMeasuredAt', '')::timestamptz, p_captured_at) end;

  insert into public.health_daily as h (
    user_id, date, captured_at, cumulative_captured_at, timezone, source, device_id,
    steps, steps_captured_at,
    active_energy, active_energy_captured_at,
    resting_energy, resting_energy_captured_at,
    exercise_minutes, exercise_minutes_captured_at,
    stand_minutes, stand_minutes_captured_at,
    distance_km, distance_km_captured_at,
    sleep_minutes, sleep_minutes_captured_at,
    water_ml, water_ml_captured_at,
    weight_kg, weight_measured_at, body_fat_pct, body_fat_measured_at,
    resting_hr, resting_hr_measured_at, vo2max, vo2max_measured_at, updated_at
  ) values (
    v_device.user_id, p_date, p_captured_at,
    case when p_payload ?| array[
      'steps', 'activeEnergy', 'restingEnergy', 'exerciseMinutes',
      'standMinutes', 'distanceKm', 'sleepMinutes', 'waterMl'
    ] then p_captured_at else null end,
    p_timezone, p_source, v_device.id,
    nullif(p_payload->>'steps', '')::bigint,
      case when p_payload ? 'steps' then p_captured_at end,
    nullif(p_payload->>'activeEnergy', '')::numeric,
      case when p_payload ? 'activeEnergy' then p_captured_at end,
    nullif(p_payload->>'restingEnergy', '')::numeric,
      case when p_payload ? 'restingEnergy' then p_captured_at end,
    nullif(p_payload->>'exerciseMinutes', '')::numeric,
      case when p_payload ? 'exerciseMinutes' then p_captured_at end,
    nullif(p_payload->>'standMinutes', '')::numeric,
      case when p_payload ? 'standMinutes' then p_captured_at end,
    nullif(p_payload->>'distanceKm', '')::numeric,
      case when p_payload ? 'distanceKm' then p_captured_at end,
    nullif(p_payload->>'sleepMinutes', '')::numeric,
      case when p_payload ? 'sleepMinutes' then p_captured_at end,
    nullif(p_payload->>'waterMl', '')::numeric,
      case when p_payload ? 'waterMl' then p_captured_at end,
    nullif(p_payload->>'weightKg', '')::numeric, v_weight_at,
    nullif(p_payload->>'bodyFatPct', '')::numeric, v_body_fat_at,
    nullif(p_payload->>'restingHR', '')::numeric, v_resting_hr_at,
    nullif(p_payload->>'vo2max', '')::numeric, v_vo2max_at,
    now()
  ) on conflict (user_id, date) do update set
    captured_at = greatest(h.captured_at, excluded.captured_at),
    cumulative_captured_at = case
      when excluded.cumulative_captured_at is not null
       and (h.cumulative_captured_at is null
        or excluded.cumulative_captured_at >= h.cumulative_captured_at)
      then excluded.cumulative_captured_at else h.cumulative_captured_at end,
    timezone = case when excluded.captured_at >= h.captured_at then excluded.timezone else h.timezone end,
    source = case when excluded.captured_at >= h.captured_at then excluded.source else h.source end,
    device_id = case when excluded.captured_at >= h.captured_at then excluded.device_id else h.device_id end,
    steps = case when excluded.steps_captured_at is not null
      and (h.steps_captured_at is null or excluded.steps_captured_at >= h.steps_captured_at)
      then excluded.steps else h.steps end,
    steps_captured_at = case when excluded.steps_captured_at is not null
      and (h.steps_captured_at is null or excluded.steps_captured_at >= h.steps_captured_at)
      then excluded.steps_captured_at else h.steps_captured_at end,
    active_energy = case when excluded.active_energy_captured_at is not null
      and (h.active_energy_captured_at is null or excluded.active_energy_captured_at >= h.active_energy_captured_at)
      then excluded.active_energy else h.active_energy end,
    active_energy_captured_at = case when excluded.active_energy_captured_at is not null
      and (h.active_energy_captured_at is null or excluded.active_energy_captured_at >= h.active_energy_captured_at)
      then excluded.active_energy_captured_at else h.active_energy_captured_at end,
    resting_energy = case when excluded.resting_energy_captured_at is not null
      and (h.resting_energy_captured_at is null or excluded.resting_energy_captured_at >= h.resting_energy_captured_at)
      then excluded.resting_energy else h.resting_energy end,
    resting_energy_captured_at = case when excluded.resting_energy_captured_at is not null
      and (h.resting_energy_captured_at is null or excluded.resting_energy_captured_at >= h.resting_energy_captured_at)
      then excluded.resting_energy_captured_at else h.resting_energy_captured_at end,
    exercise_minutes = case when excluded.exercise_minutes_captured_at is not null
      and (h.exercise_minutes_captured_at is null or excluded.exercise_minutes_captured_at >= h.exercise_minutes_captured_at)
      then excluded.exercise_minutes else h.exercise_minutes end,
    exercise_minutes_captured_at = case when excluded.exercise_minutes_captured_at is not null
      and (h.exercise_minutes_captured_at is null or excluded.exercise_minutes_captured_at >= h.exercise_minutes_captured_at)
      then excluded.exercise_minutes_captured_at else h.exercise_minutes_captured_at end,
    stand_minutes = case when excluded.stand_minutes_captured_at is not null
      and (h.stand_minutes_captured_at is null or excluded.stand_minutes_captured_at >= h.stand_minutes_captured_at)
      then excluded.stand_minutes else h.stand_minutes end,
    stand_minutes_captured_at = case when excluded.stand_minutes_captured_at is not null
      and (h.stand_minutes_captured_at is null or excluded.stand_minutes_captured_at >= h.stand_minutes_captured_at)
      then excluded.stand_minutes_captured_at else h.stand_minutes_captured_at end,
    distance_km = case when excluded.distance_km_captured_at is not null
      and (h.distance_km_captured_at is null or excluded.distance_km_captured_at >= h.distance_km_captured_at)
      then excluded.distance_km else h.distance_km end,
    distance_km_captured_at = case when excluded.distance_km_captured_at is not null
      and (h.distance_km_captured_at is null or excluded.distance_km_captured_at >= h.distance_km_captured_at)
      then excluded.distance_km_captured_at else h.distance_km_captured_at end,
    sleep_minutes = case when excluded.sleep_minutes_captured_at is not null
      and (h.sleep_minutes_captured_at is null or excluded.sleep_minutes_captured_at >= h.sleep_minutes_captured_at)
      then excluded.sleep_minutes else h.sleep_minutes end,
    sleep_minutes_captured_at = case when excluded.sleep_minutes_captured_at is not null
      and (h.sleep_minutes_captured_at is null or excluded.sleep_minutes_captured_at >= h.sleep_minutes_captured_at)
      then excluded.sleep_minutes_captured_at else h.sleep_minutes_captured_at end,
    water_ml = case when excluded.water_ml_captured_at is not null
      and (h.water_ml_captured_at is null or excluded.water_ml_captured_at >= h.water_ml_captured_at)
      then excluded.water_ml else h.water_ml end,
    water_ml_captured_at = case when excluded.water_ml_captured_at is not null
      and (h.water_ml_captured_at is null or excluded.water_ml_captured_at >= h.water_ml_captured_at)
      then excluded.water_ml_captured_at else h.water_ml_captured_at end,
    weight_kg = case
      when excluded.weight_kg is not null
       and (h.weight_measured_at is null or excluded.weight_measured_at > h.weight_measured_at
        or (excluded.weight_measured_at = h.weight_measured_at and excluded.weight_kg is distinct from h.weight_kg))
      then excluded.weight_kg else h.weight_kg end,
    weight_measured_at = case
      when excluded.weight_kg is not null
       and (h.weight_measured_at is null or excluded.weight_measured_at > h.weight_measured_at
        or (excluded.weight_measured_at = h.weight_measured_at and excluded.weight_kg is distinct from h.weight_kg))
      then excluded.weight_measured_at else h.weight_measured_at end,
    body_fat_pct = case
      when excluded.body_fat_pct is not null
       and (h.body_fat_measured_at is null or excluded.body_fat_measured_at > h.body_fat_measured_at
        or (excluded.body_fat_measured_at = h.body_fat_measured_at and excluded.body_fat_pct is distinct from h.body_fat_pct))
      then excluded.body_fat_pct else h.body_fat_pct end,
    body_fat_measured_at = case
      when excluded.body_fat_pct is not null
       and (h.body_fat_measured_at is null or excluded.body_fat_measured_at > h.body_fat_measured_at
        or (excluded.body_fat_measured_at = h.body_fat_measured_at and excluded.body_fat_pct is distinct from h.body_fat_pct))
      then excluded.body_fat_measured_at else h.body_fat_measured_at end,
    resting_hr = case
      when excluded.resting_hr is not null
       and (h.resting_hr_measured_at is null or excluded.resting_hr_measured_at > h.resting_hr_measured_at
        or (excluded.resting_hr_measured_at = h.resting_hr_measured_at and excluded.resting_hr is distinct from h.resting_hr))
      then excluded.resting_hr else h.resting_hr end,
    resting_hr_measured_at = case
      when excluded.resting_hr is not null
       and (h.resting_hr_measured_at is null or excluded.resting_hr_measured_at > h.resting_hr_measured_at
        or (excluded.resting_hr_measured_at = h.resting_hr_measured_at and excluded.resting_hr is distinct from h.resting_hr))
      then excluded.resting_hr_measured_at else h.resting_hr_measured_at end,
    vo2max = case
      when excluded.vo2max is not null
       and (h.vo2max_measured_at is null or excluded.vo2max_measured_at > h.vo2max_measured_at
        or (excluded.vo2max_measured_at = h.vo2max_measured_at and excluded.vo2max is distinct from h.vo2max))
      then excluded.vo2max else h.vo2max end,
    vo2max_measured_at = case
      when excluded.vo2max is not null
       and (h.vo2max_measured_at is null or excluded.vo2max_measured_at > h.vo2max_measured_at
        or (excluded.vo2max_measured_at = h.vo2max_measured_at and excluded.vo2max is distinct from h.vo2max))
      then excluded.vo2max_measured_at else h.vo2max_measured_at end,
    updated_at = now()
  where (
    excluded.steps_captured_at is not null
    and (h.steps_captured_at is null or excluded.steps_captured_at >= h.steps_captured_at)
  ) or (
    excluded.active_energy_captured_at is not null
    and (h.active_energy_captured_at is null
      or excluded.active_energy_captured_at >= h.active_energy_captured_at)
  ) or (
    excluded.resting_energy_captured_at is not null
    and (h.resting_energy_captured_at is null
      or excluded.resting_energy_captured_at >= h.resting_energy_captured_at)
  ) or (
    excluded.exercise_minutes_captured_at is not null
    and (h.exercise_minutes_captured_at is null
      or excluded.exercise_minutes_captured_at >= h.exercise_minutes_captured_at)
  ) or (
    excluded.stand_minutes_captured_at is not null
    and (h.stand_minutes_captured_at is null
      or excluded.stand_minutes_captured_at >= h.stand_minutes_captured_at)
  ) or (
    excluded.distance_km_captured_at is not null
    and (h.distance_km_captured_at is null
      or excluded.distance_km_captured_at >= h.distance_km_captured_at)
  ) or (
    excluded.sleep_minutes_captured_at is not null
    and (h.sleep_minutes_captured_at is null
      or excluded.sleep_minutes_captured_at >= h.sleep_minutes_captured_at)
  ) or (
    excluded.water_ml_captured_at is not null
    and (h.water_ml_captured_at is null
      or excluded.water_ml_captured_at >= h.water_ml_captured_at)
  ) or (
    excluded.weight_kg is not null
    and (h.weight_measured_at is null or excluded.weight_measured_at > h.weight_measured_at
      or (excluded.weight_measured_at = h.weight_measured_at and excluded.weight_kg is distinct from h.weight_kg))
  ) or (
    excluded.body_fat_pct is not null
    and (h.body_fat_measured_at is null or excluded.body_fat_measured_at > h.body_fat_measured_at
      or (excluded.body_fat_measured_at = h.body_fat_measured_at and excluded.body_fat_pct is distinct from h.body_fat_pct))
  ) or (
    excluded.resting_hr is not null
    and (h.resting_hr_measured_at is null or excluded.resting_hr_measured_at > h.resting_hr_measured_at
      or (excluded.resting_hr_measured_at = h.resting_hr_measured_at and excluded.resting_hr is distinct from h.resting_hr))
  ) or (
    excluded.vo2max is not null
    and (h.vo2max_measured_at is null or excluded.vo2max_measured_at > h.vo2max_measured_at
      or (excluded.vo2max_measured_at = h.vo2max_measured_at and excluded.vo2max is distinct from h.vo2max))
  )
  returning updated_at into v_updated_at;

  v_applied := v_updated_at is not null;
  if not v_applied then
    select updated_at into v_updated_at
      from public.health_daily
     where user_id = v_device.user_id and date = p_date;
  end if;

  update public.health_sync_events
     set status = case when v_applied then 'applied' else 'stale' end
   where id = v_event_id;
  update public.health_sync_devices set last_sync_at = now() where id = v_device.id;
  delete from public.health_sync_events
   where received_at < now() - interval '30 days';

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'applied', v_applied,
    'date', p_date, 'updatedAt', v_updated_at
  );
end;
$$;

revoke all on function public.ingest_health_sync(
  text, text, timestamptz, date, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ingest_health_sync(
  text, text, timestamptz, date, text, text, jsonb
) to service_role;

-- 早期测试方案曾把健康数组从账号快照里剥离；正式方案保留快照副本，
-- 但 Edge Function 永远只写 health_daily，避免它与饮食快照争抢 revision。
drop trigger if exists aaa_strip_health_from_user_snapshot on public.user_snapshots;
drop function if exists public.strip_health_from_user_snapshot();
