import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progressionTarget, targetText, targetReason, bigJumpNote, stallNote, repRangeFor, defaultRepRange,
  strengthTrend, trendText, trendWord, trackedLifts, setDraftFor, epley,
} from '../js/core/progression.js';
import { EXERCISE_BY_ID } from '../js/data/exercises.js';
import { validateTrainingRecord } from '../js/core/training-records.js';
import { linearFit } from '../js/core/slope.js';

const kg = (weightKg, reps, extra = {}) => ({
  weightKg, reps, completed: true, setType: 'work', loadMode: 'external', loadConvention: 'total', ...extra,
});
const day = (date, id, sets, extra = {}) => ({ date, items: [{ id, sets, ...extra }] });
const fresh = (id) => ({ id, sets: [] });

test('默认次数区间按动作类型给，自定义只认那几档', () => {
  assert.equal(defaultRepRange(EXERCISE_BY_ID.get('bench_press_bb'), 'external'), '8-12');
  assert.equal(defaultRepRange(EXERCISE_BY_ID.get('lateral_raise_db'), 'external'), '10-15');
  assert.equal(defaultRepRange(EXERCISE_BY_ID.get('calf_raise_standing'), 'machine'), '12-20');
  assert.equal(defaultRepRange(EXERCISE_BY_ID.get('crunch'), 'bodyweight'), '12-20');
  // 同样是徒手复合：引体 6–10，俯卧撑 12–20
  assert.equal(defaultRepRange(EXERCISE_BY_ID.get('pushup'), 'bodyweight'), '12-20');
  const pull = [...EXERCISE_BY_ID.values()].find((e) => e.pattern === 'vertical_pull' && e.equipment === 'bodyweight');
  assert.equal(defaultRepRange(pull, 'bodyweight'), '6-10');
  const bench = EXERCISE_BY_ID.get('bench_press_bb');
  assert.deepEqual(repRangeFor(bench, { repRange: '4-6' }), { key: '4-6', lo: 4, hi: 6, custom: true });
  assert.equal(repRangeFor(bench, { repRange: '7-9' }).key, '8-12');
  assert.throws(() => validateTrainingRecord({ date: '2026-09-20', items: [{ id: 'bench_press_bb', sets: [],
    recordingDefaults: { loadMode: 'external', loadConvention: 'total', measure: 'reps', repRange: '7-9' } }] }));
  validateTrainingRecord({ date: '2026-09-20', items: [{ id: 'bench_press_bb', sets: [],
    recordingDefaults: { loadMode: 'external', loadConvention: 'total', measure: 'reps', repRange: '6-10' } }] });
});

test('没到上限：同一重量每组多一次，热身组不算，超过上限的那组不往回改', () => {
  const sessions = [day('2026-09-19', 'bench_press_bb', [kg(40, 12, { setType: 'warmup' }), kg(60, 13), kg(60, 11), kg(60, 10)])];
  const t = progressionTarget(sessions, fresh('bench_press_bb'), '2026-09-26');
  assert.equal(t.kind, 'add-reps');
  assert.equal(t.load, 60);
  assert.deepEqual(t.values, [13, 12, 11]);
  assert.equal(targetText(t), '60kg × 13,12,11');
  assert.equal(targetReason(t), '上次 09-19 · 60kg × 13,11,10，每组争取多做一次；都到 12次后再加重');
});

test('每组都到上限：加一档，从区间下限做起；档差跟着上次那个数走', () => {
  const at = (id, load, reps, extra) => progressionTarget([day('2026-09-19', id, [kg(load, reps, extra), kg(load, reps, extra)])], fresh(id), '2026-09-26');
  const bench = at('bench_press_bb', 62.5, 12);
  assert.equal(bench.kind, 'add-load');
  assert.equal(bench.load, 65);
  assert.deepEqual(bench.values, [8, 8]);
  assert.equal(targetText(bench), '65kg · 每组至少 8次');
  assert.match(targetReason(bench), /都到了 12次（8–12 的上限），加 2.5kg$/);
  assert.equal(bigJumpNote(bench), null);
  // 6kg 的哑铃说明是 2kg 一档：下一只是 8，不是 8.5
  const raise = at('lateral_raise_db', 6, 15, { loadConvention: 'single' });
  assert.equal(raise.load, 8);
  assert.equal(targetText(raise), '每只 8kg · 每组至少 10次');
  assert.match(bigJumpNote(raise), /\+33%/);
  assert.equal(at('bench_press_bb', 61, 12).load, 62);
});

test('金字塔只看最重的那几组', () => {
  const sessions = [day('2026-09-19', 'squat_bb', [kg(80, 12), kg(90, 10), kg(100, 8)])];
  const t = progressionTarget(sessions, fresh('squat_bb'), '2026-09-26');
  assert.equal(t.kind, 'add-reps');
  assert.equal(t.load, 100);
  assert.deepEqual(t.values, [9]);
});

test('徒手、辅助、刻度、计时各有各的加法', () => {
  const bw = (reps) => ({ reps, completed: true, setType: 'work', loadMode: 'bodyweight' });
  const push = progressionTarget([day('2026-09-19', 'pushup', [bw(14), bw(12)])], fresh('pushup'), '2026-09-26');
  assert.deepEqual([push.kind, targetText(push)], ['add-reps', '自重 × 15,13']);
  const top = progressionTarget([day('2026-09-19', 'pushup', [bw(20), bw(20)])], fresh('pushup'), '2026-09-26');
  assert.equal(top.kind, 'harder');
  assert.equal(targetText(top), '换更难的练法，或改成负重记录');

  const assist = (w) => kg(w, 12, { loadMode: 'assistance' });
  const a = progressionTarget([day('2026-09-19', 'assisted_pullup_machine', [assist(30), assist(30)])], fresh('assisted_pullup_machine'), '2026-09-26');
  assert.equal(a.kind, 'add-load');
  assert.equal(a.load, 27.5);
  assert.equal(targetText(a), '辅助 27.5kg · 每组至少 8次');
  assert.match(targetReason(a), /辅助减 2.5kg$/);
  const last = progressionTarget([day('2026-09-19', 'assisted_pullup_machine', [assist(2.5), assist(5)])], fresh('assisted_pullup_machine'), '2026-09-26');
  assert.equal(last.kind, 'harder');
  assert.equal(targetText(last), '试试不用辅助，改成自重记录');

  const scale = (w, reps) => kg(w, reps, { loadMode: 'machine', loadConvention: 'scale' });
  const s = progressionTarget([day('2026-09-19', 'leg_extension', [scale(8, 15), scale(8, 15)])], fresh('leg_extension'), '2026-09-26');
  assert.equal(s.load, 9);
  assert.equal(targetText(s), '刻度 9 · 每组至少 10次');
  assert.match(targetReason(s), /加 1 档$/);

  const hold = (sec) => ({ durationSeconds: sec, completed: true, setType: 'work', loadMode: 'bodyweight' });
  const plank = progressionTarget([day('2026-09-19', 'plank', [hold(45), hold(58)])], fresh('plank'), '2026-09-26');
  assert.deepEqual([plank.kind, targetText(plank)], ['add-time', '每组 50,60秒']);
  const done = progressionTarget([day('2026-09-19', 'plank', [hold(60), hold(75)])], fresh('plank'), '2026-09-26');
  assert.equal(done.kind, 'harder');
});

test('口径变了不硬比；老记录没写口径照样能用；只有热身时不给目标', () => {
  const sessions = [day('2026-09-19', 'bench_press_db', [kg(40, 10), kg(40, 10)])];
  const item = { id: 'bench_press_db', sets: [], recordingDefaults: { loadMode: 'external', loadConvention: 'single', measure: 'reps' } };
  const t = progressionTarget(sessions, item, '2026-09-26');
  assert.equal(t.kind, 'incomparable');
  assert.equal(targetText(t), null);
  assert.match(targetReason(t), /口径和现在的设置不同/);

  const legacy = progressionTarget([{ date: '2026-09-19', items: [{ id: 'bench_press_bb', sets: [{ weightKg: 50, reps: 12 }, { weightKg: 50, reps: 12 }] }] }],
    fresh('bench_press_bb'), '2026-09-26');
  assert.equal(legacy.kind, 'add-load');
  assert.equal(legacy.load, 52.5);

  assert.equal(progressionTarget([], fresh('bench_press_bb'), '2026-09-26'), null);
  assert.equal(progressionTarget([day('2026-09-19', 'bench_press_bb', [kg(40, 12, { setType: 'warmup' })])], fresh('bench_press_bb'), '2026-09-26'), null);
  // 当天之后的记录不参与
  assert.equal(progressionTarget([day('2026-09-27', 'bench_press_bb', [kg(40, 12)])], fresh('bench_press_bb'), '2026-09-26'), null);
});

test('停滞：连续三次没超过上一次才算；正常的加重—爬次数不算', () => {
  const flat = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].map((d, i) => day(d, 'bench_press_bb', [kg(60, i === 0 ? 10 : 10), kg(60, 9)]));
  const t = progressionTarget(flat, fresh('bench_press_bb'), '2026-09-26');
  assert.deepEqual(t.stall, { since: '2026-09-01', sessions: 3 });
  assert.match(stallNote(t, 'bulk'), /换个次数区间/);
  assert.match(stallNote(t, 'cut'), /减脂期能保住重量和次数就算达标/);

  const cycle = [
    day('2026-09-01', 'bench_press_bb', [kg(60, 12), kg(60, 12)]),
    day('2026-09-08', 'bench_press_bb', [kg(62.5, 8), kg(62.5, 8)]),
    day('2026-09-15', 'bench_press_bb', [kg(62.5, 9), kg(62.5, 8)]),
    day('2026-09-22', 'bench_press_bb', [kg(62.5, 9), kg(62.5, 9)]),
  ];
  assert.equal(progressionTarget(cycle, fresh('bench_press_bb'), '2026-09-26').stall, null);
  // 超出 56 天的旧记录不拿来凑停滞
  const old = [day('2026-06-01', 'bench_press_bb', [kg(60, 10)]), ...flat.slice(1)];
  assert.equal(progressionTarget(old, fresh('bench_press_bb'), '2026-09-26').stall, null);
});

test('力量趋势：至少 3 次、隔开 14 天；按拟合线报起止，±2% 内算持平', () => {
  const series = (weights) => weights.map(([d, w, r]) => day(d, 'squat_bb', [kg(w, r)]));
  assert.equal(strengthTrend(series([['2026-09-10', 100, 5], ['2026-09-20', 105, 5]]), 'squat_bb', '2026-09-27'), null);
  assert.equal(strengthTrend(series([['2026-09-15', 100, 5], ['2026-09-18', 102.5, 5], ['2026-09-22', 105, 5]]), 'squat_bb', '2026-09-27'), null);
  const up = strengthTrend(series([['2026-09-01', 100, 5], ['2026-09-08', 102.5, 5], ['2026-09-15', 105, 5], ['2026-09-22', 107.5, 5]]), 'squat_bb', '2026-09-27');
  assert.equal(up.metric, 'e1rm');
  assert.equal(up.direction, 'up');
  assert.equal(up.pct, 8);
  assert.equal(up.weeks, 3);
  assert.equal(trendText(up), `估算 1RM ${Math.round(epley(100, 5))} → ${Math.round(epley(107.5, 5))}kg（+8%）`);
  assert.equal(trendWord(up, 'bulk'), '在涨');
  const flat = strengthTrend(series([['2026-09-01', 100, 5], ['2026-09-10', 100, 6], ['2026-09-22', 100, 5]]), 'squat_bb', '2026-09-27');
  assert.equal(flat.direction, 'flat');
  assert.equal(trendWord(flat, 'cut'), '保持住了');
  assert.equal(trendWord(flat, 'bulk'), '基本持平');
  // 次数超过 15 的组不参与估算：这一次整次没有可用的组
  const high = strengthTrend(series([['2026-09-01', 40, 20], ['2026-09-08', 40, 20], ['2026-09-15', 40, 20]]), 'squat_bb', '2026-09-27');
  assert.equal(high, null);
  // 28 天以外的不算
  const stale = strengthTrend(series([['2026-08-01', 90, 5], ['2026-09-08', 100, 5], ['2026-09-15', 100, 5]]), 'squat_bb', '2026-09-27');
  assert.equal(stale, null);
});

test('力量趋势：辅助越少越强，刻度只报百分比，徒手报次数', () => {
  const assist = [['2026-09-01', 35], ['2026-09-10', 30], ['2026-09-20', 27.5]]
    .map(([d, w]) => day(d, 'assisted_pullup_machine', [kg(w, 8, { loadMode: 'assistance' })]));
  const a = strengthTrend(assist, 'assisted_pullup_machine', '2026-09-27');
  assert.equal(a.metric, 'assist');
  assert.equal(a.direction, 'up');
  assert.equal(a.pct, null);
  assert.match(trendText(a), /^辅助 \d+(\.5)? → \d+(\.5)?kg$/);
  const scale = [['2026-09-01', 8], ['2026-09-10', 9], ['2026-09-20', 10]]
    .map(([d, w]) => day(d, 'leg_extension', [kg(w, 12, { loadMode: 'machine', loadConvention: 'scale' })]));
  assert.match(trendText(strengthTrend(scale, 'leg_extension', '2026-09-27')), /^按刻度估算 \+\d+%$/);
  const bw = [['2026-09-01', 10], ['2026-09-10', 12], ['2026-09-20', 14]]
    .map(([d, r]) => day(d, 'pushup', [{ reps: r, completed: true, setType: 'work', loadMode: 'bodyweight' }]));
  assert.equal(trendText(strengthTrend(bw, 'pushup', '2026-09-27')), '最多 10 → 14次');
});

test('近几周练得最勤的动作排在前面，算不出趋势的不列', () => {
  const sessions = [];
  for (const d of ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']) {
    sessions.push({ date: d, items: [
      { id: 'bench_press_bb', sets: [kg(60, 8)] },
      { id: 'lateral_raise_db', sets: [kg(8, 12, { loadConvention: 'single' })] },
    ] });
  }
  sessions.push({ date: '2026-09-02', items: [{ id: 'squat_bb', sets: [kg(100, 5)] }] });
  sessions.push({ date: '2026-09-20', items: [{ id: 'squat_bb', sets: [kg(100, 5)] }] });
  const lifts = trackedLifts(sessions, '2026-09-27');
  assert.deepEqual(lifts.map((l) => l.id), ['bench_press_bb', 'lateral_raise_db']);
  assert.equal(trackedLifts(sessions, '2026-09-27', { limit: 1 }).length, 1);
});

test('草稿：第一组填目标，之后按今天的重量取对应那一组的目标；换了重量就沿用上一组', () => {
  const sessions = [day('2026-09-19', 'bench_press_bb', [kg(60, 12), kg(60, 11), kg(60, 10)])];
  const first = setDraftFor(fresh('bench_press_bb'), sessions, '2026-09-26');
  assert.equal(first.weightKg, 60);
  assert.equal(first.reps, 12);
  assert.equal(first.setType, 'work');
  const second = setDraftFor({ id: 'bench_press_bb', sets: [kg(60, 12)] }, sessions, '2026-09-26');
  assert.deepEqual([second.weightKg, second.reps], [60, 12]);
  const third = setDraftFor({ id: 'bench_press_bb', sets: [kg(60, 12), kg(60, 12)] }, sessions, '2026-09-26');
  assert.equal(third.reps, 11);
  const heavier = setDraftFor({ id: 'bench_press_bb', sets: [kg(65, 7)] }, sessions, '2026-09-26');
  assert.deepEqual([heavier.weightKg, heavier.reps], [65, 7]);
  // 今天只做了热身：下一组仍是第一组正式组
  const warm = setDraftFor({ id: 'bench_press_bb', sets: [kg(40, 10, { setType: 'warmup' })] }, sessions, '2026-09-26');
  assert.deepEqual([warm.weightKg, warm.reps], [60, 12]);
  // 加重那一档：填新重量和区间下限
  const load = setDraftFor(fresh('bench_press_bb'), [day('2026-09-19', 'bench_press_bb', [kg(60, 12), kg(60, 12)])], '2026-09-26');
  assert.deepEqual([load.weightKg, load.reps], [62.5, 8]);
  // 徒手不填重量；口径对不上时照旧（不带目标）
  const bw = setDraftFor(fresh('pushup'), [day('2026-09-19', 'pushup', [{ reps: 14, completed: true, setType: 'work', loadMode: 'bodyweight' }])], '2026-09-26');
  assert.deepEqual([bw.weightKg, bw.reps], [null, 15]);
  const single = { id: 'bench_press_db', sets: [], recordingDefaults: { loadMode: 'external', loadConvention: 'single', measure: 'reps' } };
  assert.equal(setDraftFor(single, [day('2026-09-19', 'bench_press_db', [kg(40, 10)])], '2026-09-26').weightKg, null);
});

test('最小二乘顺带给出截距', () => {
  const fit = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
  assert.equal(fit.intercept, 1);
  assert.equal(fit.perDay, 2);
});
