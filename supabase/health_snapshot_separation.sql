-- Keep health data out of user_snapshots. health_daily is the authoritative cloud source.
-- Apply after health_sync.sql has backfilled legacy snapshot health rows.

create or replace function public.strip_health_from_user_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.payload := jsonb_set(new.payload, '{health}', '[]'::jsonb, true);
  return new;
end;
$$;

revoke all on function public.strip_health_from_user_snapshot() from public, anon, authenticated;

drop trigger if exists aaa_strip_health_from_user_snapshot on public.user_snapshots;
create trigger aaa_strip_health_from_user_snapshot
  before insert or update on public.user_snapshots
  for each row execute function public.strip_health_from_user_snapshot();

-- Existing rows may still contain health data. The backfill has already copied them to health_daily,
-- so remove the duplicated payload now without advancing the user-visible snapshot revision.
alter table public.user_snapshots disable trigger enforce_user_snapshot_revision;
update public.user_snapshots
   set payload = jsonb_set(payload, '{health}', '[]'::jsonb, true)
 where jsonb_array_length(coalesce(payload->'health', '[]'::jsonb)) > 0;
alter table public.user_snapshots enable trigger enforce_user_snapshot_revision;
