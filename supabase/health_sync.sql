-- Health shortcut sync v1
-- Run once in the Supabase SQL editor before deploying functions/health-sync.
-- health_daily is the authoritative cloud source for Apple Health data.

create extension if not exists pgcrypto;

create table if not exists public.health_sync_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null check (char_length(device_name) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_sync_at timestamptz,
  revoked_at timestamptz
);
create index if not exists health_sync_devices_user_idx
  on public.health_sync_devices(user_id, created_at desc);

create table if not exists public.health_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  captured_at timestamptz not null,
  timezone text not null default 'UTC',
  source text not null default 'apple_shortcuts',
  device_id uuid references public.health_sync_devices(id) on delete set null,
  steps bigint,
  active_energy numeric,
  resting_energy numeric,
  exercise_minutes numeric,
  stand_minutes numeric,
  distance_km numeric,
  sleep_minutes numeric,
  water_ml numeric,
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
  check (steps is null or steps between 0 and 200000),
  check (active_energy is null or active_energy between 0 and 20000),
  check (resting_energy is null or resting_energy between 0 and 10000),
  check (exercise_minutes is null or exercise_minutes between 0 and 1440),
  check (stand_minutes is null or stand_minutes between 0 and 1440),
  check (distance_km is null or distance_km between 0 and 500),
  check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  check (water_ml is null or water_ml between 0 and 30000),
  check (weight_kg is null or weight_kg between 20 and 400),
  check (body_fat_pct is null or body_fat_pct between 1 and 80),
  check (resting_hr is null or resting_hr between 25 and 220),
  check (vo2max is null or vo2max between 5 and 100)
);
create index if not exists health_daily_user_date_idx
  on public.health_daily(user_id, date desc);

create table if not exists public.health_sync_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.health_sync_devices(id) on delete cascade,
  sync_id text not null check (char_length(sync_id) between 8 and 128),
  captured_at timestamptz not null,
  date date not null,
  received_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received','applied','stale','duplicate')),
  payload jsonb not null,
  unique(device_id, sync_id)
);
create index if not exists health_sync_events_user_received_idx
  on public.health_sync_events(user_id, received_at desc);

alter table public.health_sync_devices enable row level security;
alter table public.health_daily enable row level security;
alter table public.health_sync_events enable row level security;

revoke all on table public.health_sync_devices from public, anon;
revoke all on table public.health_daily from public, anon;
revoke all on table public.health_sync_events from public, anon;
grant select on table public.health_sync_devices to authenticated;
grant select on table public.health_daily to authenticated;
grant select on table public.health_sync_events to authenticated;

-- Browser users can only read their own rows. Writes come through RPC/Edge Function.
drop policy if exists "read own health sync devices" on public.health_sync_devices;
create policy "read own health sync devices" on public.health_sync_devices
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read own health daily" on public.health_daily;
create policy "read own health daily" on public.health_daily
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read own health sync events" on public.health_sync_events;
create policy "read own health sync events" on public.health_sync_events
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.register_health_sync_device(
  p_device_name text,
  p_token_hash text
)
returns table(device_id uuid, device_name text, created_at timestamptz, last_sync_at timestamptz)
language plpgsql
security definer
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
security definer
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

-- Called only by the Edge Function with the service-role key. It performs token lookup,
-- idempotency, recency protection and daily upsert in one transaction.
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
set search_path = public
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
begin
  select * into v_device
    from public.health_sync_devices
   where token_hash = lower(p_token_hash) and revoked_at is null
   for update;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  insert into public.health_sync_events(
    user_id, device_id, sync_id, captured_at, date, status, payload
  ) values (
    v_device.user_id, v_device.id, p_sync_id, p_captured_at, p_date, 'received', p_payload
  ) on conflict (device_id, sync_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select status into v_existing_status
      from public.health_sync_events
     where device_id = v_device.id and sync_id = p_sync_id;
    select updated_at into v_updated_at
      from public.health_daily
     where user_id = v_device.user_id and date = p_date;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'applied', v_existing_status = 'applied',
      'date', p_date, 'updatedAt', v_updated_at
    );
  end if;

  v_weight_at := case when p_payload ? 'weightKg'
    then coalesce(nullif(p_payload->>'weightMeasuredAt','')::timestamptz, p_captured_at) end;
  v_body_fat_at := case when p_payload ? 'bodyFatPct'
    then coalesce(nullif(p_payload->>'bodyFatMeasuredAt','')::timestamptz, p_captured_at) end;
  v_resting_hr_at := case when p_payload ? 'restingHR'
    then coalesce(nullif(p_payload->>'restingHRMeasuredAt','')::timestamptz, p_captured_at) end;
  v_vo2max_at := case when p_payload ? 'vo2max'
    then coalesce(nullif(p_payload->>'vo2maxMeasuredAt','')::timestamptz, p_captured_at) end;

  insert into public.health_daily as h (
    user_id, date, captured_at, timezone, source, device_id,
    steps, active_energy, resting_energy, exercise_minutes, stand_minutes,
    distance_km, sleep_minutes, water_ml,
    weight_kg, weight_measured_at, body_fat_pct, body_fat_measured_at,
    resting_hr, resting_hr_measured_at, vo2max, vo2max_measured_at, updated_at
  ) values (
    v_device.user_id, p_date, p_captured_at, p_timezone, p_source, v_device.id,
    nullif(p_payload->>'steps','')::bigint,
    nullif(p_payload->>'activeEnergy','')::numeric,
    nullif(p_payload->>'restingEnergy','')::numeric,
    nullif(p_payload->>'exerciseMinutes','')::numeric,
    nullif(p_payload->>'standMinutes','')::numeric,
    nullif(p_payload->>'distanceKm','')::numeric,
    nullif(p_payload->>'sleepMinutes','')::numeric,
    nullif(p_payload->>'waterMl','')::numeric,
    nullif(p_payload->>'weightKg','')::numeric, v_weight_at,
    nullif(p_payload->>'bodyFatPct','')::numeric, v_body_fat_at,
    nullif(p_payload->>'restingHR','')::numeric, v_resting_hr_at,
    nullif(p_payload->>'vo2max','')::numeric, v_vo2max_at,
    now()
  ) on conflict (user_id, date) do update set
    captured_at = excluded.captured_at,
    timezone = excluded.timezone,
    source = excluded.source,
    device_id = excluded.device_id,
    steps = coalesce(excluded.steps, h.steps),
    active_energy = coalesce(excluded.active_energy, h.active_energy),
    resting_energy = coalesce(excluded.resting_energy, h.resting_energy),
    exercise_minutes = coalesce(excluded.exercise_minutes, h.exercise_minutes),
    stand_minutes = coalesce(excluded.stand_minutes, h.stand_minutes),
    distance_km = coalesce(excluded.distance_km, h.distance_km),
    sleep_minutes = coalesce(excluded.sleep_minutes, h.sleep_minutes),
    water_ml = coalesce(excluded.water_ml, h.water_ml),
    weight_kg = case
      when excluded.weight_kg is not null
       and (h.weight_measured_at is null or excluded.weight_measured_at >= h.weight_measured_at)
      then excluded.weight_kg else h.weight_kg end,
    weight_measured_at = case
      when excluded.weight_kg is not null
       and (h.weight_measured_at is null or excluded.weight_measured_at >= h.weight_measured_at)
      then excluded.weight_measured_at else h.weight_measured_at end,
    body_fat_pct = case
      when excluded.body_fat_pct is not null
       and (h.body_fat_measured_at is null or excluded.body_fat_measured_at >= h.body_fat_measured_at)
      then excluded.body_fat_pct else h.body_fat_pct end,
    body_fat_measured_at = case
      when excluded.body_fat_pct is not null
       and (h.body_fat_measured_at is null or excluded.body_fat_measured_at >= h.body_fat_measured_at)
      then excluded.body_fat_measured_at else h.body_fat_measured_at end,
    resting_hr = case
      when excluded.resting_hr is not null
       and (h.resting_hr_measured_at is null or excluded.resting_hr_measured_at >= h.resting_hr_measured_at)
      then excluded.resting_hr else h.resting_hr end,
    resting_hr_measured_at = case
      when excluded.resting_hr is not null
       and (h.resting_hr_measured_at is null or excluded.resting_hr_measured_at >= h.resting_hr_measured_at)
      then excluded.resting_hr_measured_at else h.resting_hr_measured_at end,
    vo2max = case
      when excluded.vo2max is not null
       and (h.vo2max_measured_at is null or excluded.vo2max_measured_at >= h.vo2max_measured_at)
      then excluded.vo2max else h.vo2max end,
    vo2max_measured_at = case
      when excluded.vo2max is not null
       and (h.vo2max_measured_at is null or excluded.vo2max_measured_at >= h.vo2max_measured_at)
      then excluded.vo2max_measured_at else h.vo2max_measured_at end,
    updated_at = now()
  where excluded.captured_at >= h.captured_at
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
   where user_id = v_device.user_id and received_at < now() - interval '30 days';

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'applied', v_applied,
    'date', p_date, 'updatedAt', v_updated_at
  );
end;
$$;

revoke all on function public.ingest_health_sync(text,text,timestamptz,date,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_health_sync(text,text,timestamptz,date,text,text,jsonb)
  to service_role;

-- One-time migration: copy historical health rows from v1.5.1 user_snapshots into health_daily.
-- This preserves existing data before health_daily becomes the authoritative cloud source.
insert into public.health_daily as h (
  user_id, date, captured_at, timezone, source,
  steps, active_energy, resting_energy, exercise_minutes, stand_minutes,
  distance_km, sleep_minutes, water_ml, weight_kg, body_fat_pct, resting_hr, vo2max, updated_at
)
select
  s.user_id,
  (d->>'date')::date,
  coalesce(nullif(d->>'energyObservedAt','')::timestamptz, s.updated_at),
  'UTC',
  'snapshot_migration',
  nullif(d->>'steps','')::bigint,
  nullif(d->>'activeEnergy','')::numeric,
  nullif(d->>'restingEnergy','')::numeric,
  nullif(d->>'exerciseMinutes','')::numeric,
  nullif(d->>'standMinutes','')::numeric,
  nullif(d->>'distanceKm','')::numeric,
  nullif(d->>'sleepMinutes','')::numeric,
  nullif(d->>'waterMl','')::numeric,
  nullif(d->>'weightKg','')::numeric,
  nullif(d->>'bodyFatPct','')::numeric,
  nullif(d->>'restingHR','')::numeric,
  nullif(d->>'vo2max','')::numeric,
  now()
from public.user_snapshots s
cross join lateral jsonb_array_elements(coalesce(s.payload->'health','[]'::jsonb)) d
where d ? 'date'
on conflict (user_id, date) do nothing;

-- Realtime is an optimization; foreground/page-open pulls still work if publication is unavailable.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'health_daily'
     ) then
    execute 'alter publication supabase_realtime add table public.health_daily';
  end if;
end $$;
