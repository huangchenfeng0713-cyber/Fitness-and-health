-- Fitness & Health v1.5 account snapshot storage
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
