import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingCoverage } from '../js/core/training.js';
const end = '2026-09-06';
const session = (date, ids, extra = {}) => ({ date, items: ids.map(id => ({ id, sets: [{ reps: 8, weightKg: 60 }], ...extra })) });
const by = (rows, key) => trainingCoverage(rows, end).groups.find(g => g.key === key);

test('同部位同日去重，近7日含今天和前6天，间隔查全部历史', () => {
  const rows = [session(end, ['bench_press_bb', 'bench_press_db']), session(end, ['bench_press_bb']),
    session('2026-08-31', ['bench_press_bb']), session('2026-08-30', ['bench_press_bb']),
    session('2026-08-29', ['squat_bb']), session('2026-09-02', ['lat_pulldown'])];
  assert.equal(by(rows, 'chest').count, 2);
  assert.equal(by(rows, 'chest').lastLabel, '今天');
  assert.equal(by(rows, 'leg').count, 0);
  assert.equal(by(rows, 'leg').daysSince, 8);
  assert.equal(by(rows, 'shoulder').count, 0, '卧推的协同肩臂不算主练覆盖');
});
test('空计划、无效次数、未知动作和未来/畸形日期不计，自重有效组和完成标记可计', () => {
  const rows = [session(end, ['bench_press_bb'], { sets: [] }), session(end, ['squat_bb'], { sets: [{ reps: 0 }] }),
    session('2026-09-07', ['bench_press_bb']), session('bad', ['bench_press_bb']),
    session('2026-02-30', ['bench_press_bb']), session(end, ['unknown']),
    session('2026-09-05', ['pushup'], { sets: [{ reps: 12, weightKg: 0 }] }),
    session(end, ['plank'], { done: true, sets: [] })];
  assert.equal(by(rows, 'chest').count, 1);
  assert.equal(by(rows, 'chest').lastLabel, '1 天前');
  assert.equal(by(rows, 'leg').lastDate, null);
  assert.equal(by(rows, 'core').count, 1);
});
test('新增、删除和撤销有效组立即更新统计，记录原值不被修改', () => {
  const row = session(end, ['squat_bb']);
  const snapshot = JSON.stringify(row);
  assert.equal(by([row], 'leg').count, 1);
  assert.equal(by([session(end, ['squat_bb'], { sets: [] })], 'leg').count, 0);
  assert.equal(by([row], 'leg').count, 1);
  assert.equal(JSON.stringify(row), snapshot);
});
test('只有一两天数据不判遗漏，多日明显集中才简短提示', () => {
  const rows = ['2026-09-01', '2026-09-03', '2026-09-05'].map(date => session(date, ['bench_press_bb']));
  assert.equal(trainingCoverage(rows.slice(0, 2), end).tips.length, 0);
  const tips = trainingCoverage(rows, end).tips.join('');
  assert.match(tips, /尚未记录.*腿/);
  assert.match(tips, /集中于胸/);
  assert.doesNotMatch(tips, /恢复|过度训练|状态分|%/);
});
test('空记录和跨年日期有明确空态，按日计算不受时区影响', () => {
  assert.ok(trainingCoverage([], end).groups.every(g => g.count === 0 && g.daysSince === null));
  const model = trainingCoverage([session('2025-12-31', ['squat_bb'])], '2026-01-01');
  assert.equal(model.groups.find(g => g.key === 'leg').daysSince, 1);
});
