/**
 * 「今日健康数据」这张卡。
 *
 * 两条口径：这张卡永远说真正的今天；体重可显示截至今天最近一次有效记录，
 * 体脂与静息心率仍只显示当天值。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthCardState, FIELD_LABEL } from '../js/core/health-card.js';

const TODAY = '2026-08-29';
const isoOn = (day, hour = 9) => new Date(`${day}T0${hour}:30:00`).toISOString();

test('缺的项留在列表里，值是 null —— 不许整格消失', () => {
  const s = healthCardState({
    health: { steps: 8200, activeEnergy: 520, source: 'apple' },
    lastImport: { at: isoOn(TODAY) },
    today: TODAY,
  });
  const keys = s.cells.map((c) => c.key);
  assert.deepEqual(keys, ['steps', 'activeEnergy', 'exerciseMinutes', 'sleepMinutes', 'restingHR', 'weightKg']);
  assert.deepEqual(s.present, ['steps', 'activeEnergy']);
  assert.ok(s.missing.includes('weightKg'), '没有当天或历史体重时就该缺着');
  assert.equal(s.hasAny, true);
});

test('体重沿用截至今天最近一次记录，并保留测量日期', () => {
  const s = healthCardState({
    health: { steps: 8200, bodyFatPct: null, restingHR: null },
    latestWeight: { value: 61.8, date: '2026-08-26' },
    today: TODAY,
    everSeen: ['bodyFatPct'],
  });
  const cells = Object.fromEntries(s.cells.map((cell) => [cell.key, cell]));
  assert.equal(cells.weightKg.value, 61.8);
  assert.equal(cells.weightKg.observedDate, '2026-08-26');
  assert.equal(cells.weightKg.recent, true);
  assert.ok(s.recent.includes('weightKg'));
  assert.ok(!s.presentToday.includes('weightKg'));
  assert.equal(cells.bodyFatPct.value, null, '体脂不能跟着体重一起沿用');
  assert.equal(cells.restingHR.value, null, '静息心率不能跟着体重一起沿用');
  assert.ok(!s.missing.includes('weightKg'));
});

test('今天有体重时优先使用今天，不标成历史记录', () => {
  const s = healthCardState({
    health: { weightKg: 62.1 },
    latestWeight: { value: 61.8, date: '2026-08-26' },
    today: TODAY,
  });
  const weight = s.cells.find((cell) => cell.key === 'weightKg');
  assert.equal(weight.value, 62.1);
  assert.equal(weight.observedDate, TODAY);
  assert.equal(weight.recent, false);
  assert.ok(s.presentToday.includes('weightKg'));
});

test('体脂和饮水只在记到过的时候才占一格', () => {
  const bare = healthCardState({ health: { steps: 1 }, today: TODAY });
  assert.ok(!bare.cells.some((c) => c.key === 'bodyFatPct'), '没有体脂秤的人不该常年挂一道杠');
  assert.ok(!bare.cells.some((c) => c.key === 'waterMl'));

  const owner = healthCardState({
    health: { steps: 1 }, today: TODAY, everSeen: ['bodyFatPct', 'waterMl'],
  });
  const cells = Object.fromEntries(owner.cells.map((c) => [c.key, c]));
  assert.ok(cells.bodyFatPct, '记到过就该占一格');
  assert.equal(cells.bodyFatPct.value, null, '占了格但今天没测，值是空的');
  assert.ok(cells.waterMl, '设备同步来的饮水毫升不能丢');
});

/*
 * 「已同步」问的是同步这个动作，不是某一项有没有值。
 * 手表哪天没戴，静息心率就是空的，可那天照样同步成功了 ——
 * 拿「有没有缺项」判定，会让一张同步正常的卡长期写着「未同步」。
 */
test('同步状态按「今天同步过没有」判定，缺项不影响它', () => {
  const missingLots = healthCardState({
    health: { steps: 900 }, lastImport: { at: isoOn(TODAY) }, today: TODAY,
  });
  assert.equal(missingLots.synced, true, '缺了六项也照样是今天同步过的');
  assert.ok(missingLots.missing.length >= 4);

  const yesterdayOnly = healthCardState({
    health: { steps: 900, activeEnergy: 300, exerciseMinutes: 40 },
    lastImport: { at: isoOn('2026-08-28') },
    today: TODAY,
  });
  assert.equal(yesterdayOnly.synced, false, '昨天同步的不算今天同步过');
  assert.ok(yesterdayOnly.syncedAt, '不算今天同步，也得留着「最近一次」给说明层用');

  assert.equal(healthCardState({ today: TODAY }).synced, false);
  assert.equal(healthCardState({ today: TODAY }).hasAny, false, '一个数都没有是「还没同步过」');
});

test('来源写成人话，缺项原因有统一说法', () => {
  assert.match(healthCardState({ health: { steps: 1, source: 'manual' }, today: TODAY }).sourceNote, /手动补录/);
  assert.match(healthCardState({ health: { steps: 1, source: 'mixed' }, today: TODAY }).sourceNote, /手动补录/);
  assert.equal(healthCardState({ health: { steps: 1 }, today: TODAY }).sourceNote, '');
  assert.equal(FIELD_LABEL.sleepMinutes, '睡眠');
});

test('脏数据不会印成 NaN', () => {
  const s = healthCardState({
    health: { steps: 'x', activeEnergy: null, weightKg: undefined, restingHR: '58' },
    latestWeight: { value: '不是数字', date: '2026-08-26' },
    today: TODAY,
  });
  const by = Object.fromEntries(s.cells.map((c) => [c.key, c.value]));
  assert.equal(by.steps, null);
  assert.equal(by.activeEnergy, null);
  assert.equal(by.weightKg, null);
  assert.equal(by.restingHR, 58, '字符串数字照样能用');
});
