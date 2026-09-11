import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingCoverage, emptyPlanBrief, MIN_TRAINING_DAYS_FOR_GAP } from '../js/core/training.js';
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
/*
 * 今天一个动作都没安排时，那一屏不能只剩「今天还没有安排动作。」。
 *
 * 两行都得是记录里有的事实，不替人开处方 —— 这个程序不知道你的计划，
 * 也不知道你没记的那几天，「该练背了」它说不了。
 */
test('空计划时给出上次练了哪儿和近 7 日没记录的部位，不下处方', () => {
  const rows = ['2026-09-01', '2026-09-03', '2026-09-05'].map(date => session(date, ['bench_press_bb']));
  const brief = emptyPlanBrief(rows, end);
  assert.equal(brief.rows[0].label, '上次训练');
  assert.equal(brief.rows[0].value, '1 天前 · 胸');
  assert.equal(brief.rows[1].label, '近 7 日未记录');
  assert.match(brief.rows[1].value, /背/);
  assert.match(brief.rows[1].value, /腿/);
  // 措辞只陈述记录，不评价也不开处方
  const text = brief.rows.map(r => r.label + r.value).join('');
  assert.doesNotMatch(text, /该练|建议|应该|恢复|过度|评分|%/);

  // 同一天练两个部位时，「上次练的哪儿」要都列出来
  assert.equal(emptyPlanBrief([session('2026-09-05', ['bench_press_bb', 'squat_bb'])], end)
    .rows[0].value, '1 天前 · 胸、腿');
  assert.equal(emptyPlanBrief([session('2026-08-30', ['squat_bb'])], end).rows[0].value, '7 天前 · 腿');
  // 「几天前」和覆盖表用同一份措辞，同一个事实不许两种说法
  const far = [session('2026-08-30', ['squat_bb'])];
  assert.equal(emptyPlanBrief(far, end).rows[0].value.split(' · ')[0],
    trainingCoverage(far, end).groups.find(g => g.key === 'leg').lastLabel);
});

test('空计划那两行的门槛和覆盖表共用一个数，样本不够只说上次练了什么', () => {
  const rows = ['2026-09-01', '2026-09-03', '2026-09-05'].map(date => session(date, ['bench_press_bb']));
  assert.equal(rows.length, MIN_TRAINING_DAYS_FOR_GAP);
  // 差一天就不说「哪儿空着」——和 trainingCoverage 的 tips 同一条门槛
  const few = emptyPlanBrief(rows.slice(0, MIN_TRAINING_DAYS_FOR_GAP - 1), end);
  assert.equal(few.rows.length, 1, '一两次训练说明不了哪儿空着');
  assert.equal(trainingCoverage(rows.slice(0, MIN_TRAINING_DAYS_FOR_GAP - 1), end).tips.length, 0);
  assert.equal(emptyPlanBrief(rows, end).rows.length, 2);

  // 一条记录都没有的新用户：什么都不知道，硬凑一句就是噪音
  assert.equal(emptyPlanBrief([], end), null);
  assert.equal(emptyPlanBrief([session(end, ['bench_press_bb'], { sets: [] })], end), null,
    '空计划不算训练记录');
});

test('空记录和跨年日期有明确空态，按日计算不受时区影响', () => {
  assert.ok(trainingCoverage([], end).groups.every(g => g.count === 0 && g.daysSince === null));
  const model = trainingCoverage([session('2025-12-31', ['squat_bb'])], '2026-01-01');
  assert.equal(model.groups.find(g => g.key === 'leg').daysSince, 1);
});
