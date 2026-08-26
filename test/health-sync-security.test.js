import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const [schema, edge, healthView, healthClient, serviceWorker] = await Promise.all([
  readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/health-sync/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/health.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/lib/health-cloud-sync.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

const validationHelpersSource = edge.slice(
  edge.indexOf('const snapshotMetricTimes'),
  edge.indexOf('async function sha256Hex'),
);
const validationHelpers = new Function(`${stripTypeScriptTypes(validationHelpersSource)}
  return { resolveCapturedTimestamp, missingMeasurementTimeField };
`)();

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

test('显式采集时间无效时拒绝请求，只有完全省略时间才使用服务器时间', () => {
  const fallback = '2026-08-26T08:00:00.000Z';
  for (const body of [
    { capturedAt: 'not-a-time' },
    { capturedAt: null },
    { timestamp: '' },
    { timestamp: '2026-08-26' },
    { timestamp: '2026-08-26T12:00:00' },
    { timestamp: '2026-08-26T25:00:00+08:00' },
    { date: '2026-08-26Tnot-a-time' },
    { date: '2026-08-26 25:99' },
  ]) {
    const result = validationHelpers.resolveCapturedTimestamp(body, fallback);
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.code, 'invalid_timestamp');
  }

  const omitted = validationHelpers.resolveCapturedTimestamp({ date: '2026-08-26' }, fallback);
  assert.equal(omitted.ok, true);
  assert.equal(omitted.capturedAt, fallback);
  assert.equal(omitted.capturedProvided, false);

  const alias = validationHelpers.resolveCapturedTimestamp(
    { timestamp: '2026-08-26T07:30:00+08:00', date: '2026-08-26' },
    fallback,
  );
  assert.equal(alias.ok, true);
  assert.equal(alias.capturedAt, '2026-08-26T07:30:00+08:00');
  assert.equal(alias.capturedProvided, true);
  const conflict = validationHelpers.resolveCapturedTimestamp({
    capturedAt: '2026-08-26T07:30:00+08:00',
    timestamp: '2026-08-26T08:30:00+08:00',
  }, fallback);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'timestamp_conflict');
  assert.match(edge, /code:\s*"invalid_timestamp"/);
});

test('四项快照指标分别要求对应测量时间，同时保留别名和跨日期任务', () => {
  const requirements = {
    weightKg: 'weightMeasuredAt',
    bodyFatPct: 'bodyFatMeasuredAt',
    restingHR: 'restingHRMeasuredAt',
    vo2max: 'vo2maxMeasuredAt',
  };
  for (const [metric, measuredAt] of Object.entries(requirements)) {
    assert.equal(
      validationHelpers.missingMeasurementTimeField({ [metric]: 1 }, {}),
      measuredAt,
    );
    assert.equal(
      validationHelpers.missingMeasurementTimeField(
        { [metric]: 1 },
        { [measuredAt]: '2026-08-25T23:55:00-04:00' },
      ),
      null,
    );
  }
  assert.match(edge, /code:\s*"missing_measurement_time"/);
  assert.match(edge, /weightmeasuredat:\s*"weightMeasuredAt"/);
  assert.match(edge, /bodyfatmeasuredat:\s*"bodyFatMeasuredAt"/);
  assert.match(edge, /restinghrmeasuredat:\s*"restingHRMeasuredAt"/);
  assert.match(edge, /vo2maxmeasuredat:\s*"vo2maxMeasuredAt"/);
  assert.match(edge, /if \(measuredDate === date\) continue;[\s\S]+?measurementJobs\.push/);
});

test('每项累计指标使用独立采集游标，部分上传不会推进或重放其它字段', () => {
  const pairs = [
    ['steps', 'steps_captured_at'],
    ['active_energy', 'active_energy_captured_at'],
    ['resting_energy', 'resting_energy_captured_at'],
    ['exercise_minutes', 'exercise_minutes_captured_at'],
    ['stand_minutes', 'stand_minutes_captured_at'],
    ['distance_km', 'distance_km_captured_at'],
    ['sleep_minutes', 'sleep_minutes_captured_at'],
    ['water_ml', 'water_ml_captured_at'],
  ];
  for (const [field, cursor] of pairs) {
    assert.match(schema, new RegExp(`add column if not exists ${cursor} timestamptz`, 'i'));
    assert.match(schema, new RegExp(
      `${field} = case when excluded\\.${cursor} is not null[\\s\\S]+?excluded\\.${cursor} >= h\\.${cursor}`,
      'i',
    ));
  }
  assert.match(schema, /Backfill existing v1\.6\.0-v1\.6\.3 rows once/);
});

test('Pages 先于数据库迁移发布时自动回退旧健康列，不中断账号读取', () => {
  assert.match(healthClient, /CLOUD_HEALTH_LEGACY_SELECT/);
  assert.match(healthClient, /missingIndependentCursorColumn/);
  assert.match(healthClient, /fetchHealthRowsWithSelect\(client, CLOUD_HEALTH_SELECT/);
  assert.match(healthClient, /fetchHealthRowsWithSelect\(client, CLOUD_HEALTH_LEGACY_SELECT/);
  assert.match(healthClient, /error\?\.code === '42703'/);
});
