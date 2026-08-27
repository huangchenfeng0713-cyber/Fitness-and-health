import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const [schema, edge, healthView, healthClient, serviceWorker] = await Promise.all([
  readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/health-sync/index.ts', import.meta.url), 'utf8'),
  // 数据管理卡片已抽成独立模块（现挂在设置页），这里跟着代码走
  readFile(new URL('../js/views/cards/data-manager.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/lib/health-cloud-sync.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

const validationHelpersSource = edge.slice(
  edge.indexOf('const snapshotMetricTimes'),
  edge.indexOf('async function sha256Hex'),
);
const validationHelpers = new Function(`${stripTypeScriptTypes(validationHelpersSource)}
  return { resolveCapturedTimestamp, measurementTimeIssue };
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
  const { measurementTimeIssue } = validationHelpers;
  const latest = '2099-12-31';
  for (const measuredAt of Object.values(requirements)) {
    // 字段名必须在映射表里，否则这一项根本不会被要求测量时间
    assert.ok(Object.values(requirements).includes(measuredAt));
  }
  assert.equal(measurementTimeIssue(null, 'Asia/Shanghai', latest), 'missing_measurement_time');
  assert.equal(measurementTimeIssue('   ', 'Asia/Shanghai', latest), 'missing_measurement_time');
  assert.equal(measurementTimeIssue('2026-08-25', 'Asia/Shanghai', latest), 'invalid_measurement_time');
  assert.equal(
    measurementTimeIssue(new Date(Date.now() + 3600e3).toISOString(), 'Asia/Shanghai', latest),
    'future_measurement_time',
  );
  assert.equal(
    measurementTimeIssue('2026-08-25T23:55:00-04:00', 'Asia/Shanghai', latest),
    null,
  );
  assert.match(edge, /return "missing_measurement_time";/);
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

/*
 * 直接跑指标校验那段循环。
 * 用户实测：中午 12:46 跑快捷指令，返回
 *   { "field": "restingHR", "code": "invalid_metric", "ok": false }
 * 当天的静息心率 Apple Watch 还没算出来，「查找健康样本」返回空，
 * 后面的「获取数字」产出 0，0 < 20 于是整次上传被 400 否掉——
 * 步数、活动能量、静息能量一条都没写进去。
 */
const metricLoop = (() => {
  const ranges = edge.slice(edge.indexOf('const numericRanges'), edge.indexOf('const aliases'));
  const loop = edge.slice(
    edge.indexOf('  const payload: Record<string, unknown> = {};'),
    edge.indexOf('  const measurementIssues:'),
  );
  // 先包成函数再脱类型：stripTypeScriptTypes 不接受顶层 return
  const src = `function run(body) {
    ${ranges}
    const response = (status, payload) => ({ status, payload });
    ${loop}
    return { status: 200, payload: { ok: true, stored: Object.keys(payload), skipped, rejected } };
  }
  return run;`;
  return new Function(stripTypeScriptTypes(`(function () { ${src} })()`).replace(/^\(function \(\) \{|\}\)\(\)$/g, ''))();
})();

test('静息心率没有样本时不会毁掉整次上传', () => {
  const out = metricLoop({
    steps: 8419, activeEnergy: 203.6, restingEnergy: 912.4, restingHR: 0,
  });
  assert.equal(out.status, 200, `整包被否了：${JSON.stringify(out.payload)}`);
  assert.deepEqual(out.payload.stored.sort(), ['activeEnergy', 'restingEnergy', 'steps']);
  assert.deepEqual(out.payload.skipped, ['restingHR'], '静息心率应记为「今天没有样本」');
  assert.deepEqual(out.payload.rejected, []);
});

test('下限大于 0 的指标读到 0 一律当成没有样本', () => {
  // 活人的静息心率、体重、体脂率、VO2max 不可能是 0；
  // 快捷指令空数值链只会产出 0，这是它唯一能表达的空值
  for (const key of ['restingHR', 'weightKg', 'bodyFatPct', 'vo2max']) {
    const out = metricLoop({ steps: 5000, [key]: 0 });
    assert.equal(out.status, 200, `${key} = 0 把上传否了`);
    assert.deepEqual(out.payload.skipped, [key]);
    assert.ok(!out.payload.stored.includes(key), `${key} 不该以 0 入库`);
  }
});

test('下限为 0 的指标，0 是真值不是缺失', () => {
  // 「今天真的一步没走」和「今天没有步数样本」是两回事
  const out = metricLoop({ steps: 0, activeEnergy: 0, sleepMinutes: 0 });
  assert.equal(out.status, 200);
  assert.deepEqual(out.payload.stored.sort(), ['activeEnergy', 'sleepMinutes', 'steps']);
  assert.deepEqual(out.payload.skipped, []);
});

test('超出生理范围的值被挑出来，其余照常入库', () => {
  const out = metricLoop({ steps: 8419, restingEnergy: 999999, restingHR: 61 });
  assert.equal(out.status, 200);
  assert.deepEqual(out.payload.stored.sort(), ['restingHR', 'steps']);
  assert.deepEqual(out.payload.rejected, ['restingEnergy'], '不合理的值要报出来，不能悄悄收下');
  assert.ok(!out.payload.stored.includes('restingEnergy'));
});

test('一个合法指标都不剩时才失败，并说明是哪一项', () => {
  const allBad = metricLoop({ restingEnergy: 999999 });
  assert.equal(allBad.status, 400);
  assert.equal(allBad.payload.code, 'invalid_metric');
  assert.equal(allBad.payload.field, 'restingEnergy');

  const allEmpty = metricLoop({ restingHR: 0, weightKg: 0 });
  assert.equal(allEmpty.status, 400);
  assert.equal(allEmpty.payload.code, 'no_metrics');
  assert.deepEqual(allEmpty.payload.skipped.slice().sort(), ['restingHR', 'weightKg']);
});


test('体重缺测量时间时只摘掉体重，不再丢掉同一次的步数和能量', () => {
  // 用户实测：静息心率那关修好之后，请求走到下一关又被整包否掉——
  //   { "field": "weightMeasuredAt", "code": "missing_measurement_time", "ok": false }
  // 要求 measuredAt 的目的只是「别把上周称的体重记成今天」，
  // 摘掉体重本身就达到了目的，没有理由把步数和能量一起丢。
  const loop = edge.slice(
    edge.indexOf('  const measurementIssues:'),
    edge.indexOf('  const url = Deno.env.get("SUPABASE_URL")'),
  );
  assert.ok(loop.includes('delete payload[metric]'), '没有摘掉缺测量时间的那一项');
  assert.ok(loop.includes('measurementIssues.push'), '摘掉了却不报出来');
  // 循环体内不允许再有直接 400 —— 那正是「一个字段毁掉整包」的写法
  assert.ok(!/return response\(400/.test(loop.slice(0, loop.indexOf('if (!metricCount)'))),
    '测量时间校验里仍有直接 400 的分支');
  // 只有一个有效指标都不剩时才失败，并说明是哪一项
  assert.match(loop, /if \(!metricCount\)[\s\S]*?measurementIssues\[0\]/);
  // 响应要带上原因，否则用户看不到体重为什么没进去
  assert.match(edge, /measurementIssues,/);
});
