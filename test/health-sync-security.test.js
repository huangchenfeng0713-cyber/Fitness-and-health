import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [schema, edge, healthView, healthClient, serviceWorker] = await Promise.all([
  readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/health-sync/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/health.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/lib/health-cloud-sync.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('健康同步表强制 RLS，浏览器不能读取令牌哈希或越权写健康表', () => {
  for (const table of ['health_sync_devices', 'health_daily', 'health_sync_events']) {
    assert.match(schema, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
    assert.match(schema, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(schema, /grant\s+select\s*\([^)]*token_hash/i);
  assert.match(schema, /grant insert \(user_id, device_name, token_hash\)[\s\S]+?health_sync_devices to authenticated/i);
  assert.match(schema, /enforce_health_sync_device_mutation[\s\S]+?pg_advisory_xact_lock/i);
  assert.match(schema, /revoked device cannot be reactivated/i);
  assert.match(schema, /register_health_sync_device[\s\S]+?security invoker/i);
  assert.match(schema, /clear_health_sync_data[\s\S]+?security invoker/i);
});

test('设备写入入口只向 service role 开放并有体积、时间和频率保护', () => {
  assert.match(schema, /ingest_health_sync[\s\S]+?security definer/i);
  assert.match(schema, /ingest_health_sync\([\s\S]+?from public, anon, authenticated/i);
  assert.match(schema, /ingest_health_sync\([\s\S]+?to service_role/i);
  assert.match(schema, /v_recent_count >= 180/);
  assert.match(edge, /@supabase\/supabase-js@2\.112\.4/);
  assert.match(edge, /x-health-sync-token/i);
  assert.match(edge, /readLimitedText\(req, 16 \* 1024\)/);
  assert.match(edge, /future_timestamp/);
  assert.match(edge, /future_measurement_time/);
  assert.match(edge, /date_timezone_mismatch/);
  assert.match(edge, /measurementJobs/);
  assert.match(schema, /cumulative_captured_at/);
});

test('自动同步入口集中在数据管理，并进入离线外壳', () => {
  assert.match(healthView, /快捷指令自动上传/);
  assert.match(healthView, /生成连接信息/);
  assert.match(healthView, /立即读取账号最新数据/);
  assert.match(serviceWorker, /\.\/js\/lib\/health-cloud-sync\.js/);
  assert.match(serviceWorker, /\.\/js\/core\/cloud-health\.js/);
});

test('原始设备令牌只留在当前页面内存，账号切换会丢弃旧请求', () => {
  assert.match(healthClient, /crypto\.getRandomValues/);
  assert.match(healthClient, /crypto\.subtle\.digest/);
  assert.doesNotMatch(healthClient, /localStorage|sessionStorage|setSetting|db\.put/);
  assert.match(healthClient, /assertCurrentAccount/);
  assert.match(healthClient, /health_account_changed/);
});
