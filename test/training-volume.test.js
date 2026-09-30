import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weeklySetVolume, weeklyVolumeTips, trainingDaysIn, recommendFor, trainingAreaDetail,
  VOLUME_GROUPS, WEEKLY_SET_REFERENCE, setCountText,
} from '../js/core/training.js';
import { EXERCISE_BY_ID } from '../js/data/exercises.js';

const set = (reps = 10, extra = {}) => ({ reps, weightKg: 50, completed: true, setType: 'work', ...extra });
const sets = (n, extra) => Array.from({ length: n }, () => set(10, extra));
const session = (date, items) => ({ date, items: items.map(([id, list]) => ({ id, sets: list })) });

test('肌群清单里每一块肉都来自动作库的肌群键，一组只在一个肌群记一次', () => {
  const known = new Set([...EXERCISE_BY_ID.values()].flatMap((e) => [...e.primary, ...e.secondary]));
  for (const g of VOLUME_GROUPS) for (const m of g.muscles) assert.ok(known.has(m), m);
  assert.deepEqual(WEEKLY_SET_REFERENCE.bulk, { lo: 10, hi: 20 });
  assert.equal(WEEKLY_SET_REFERENCE.cut.lo, 6);
});

test('只数正式组：热身不算、老记录算；主练 1 组、协同半组；7 天以外不算', () => {
  const end = '2026-09-28';
  const v = weeklySetVolume([
    session('2026-09-27', [['bench_press_bb', [...sets(3), set(12, { setType: 'warmup' })]]]),
    // 老记录：没有 completed / setType，照样算（那时候只有这一种写法）
    session('2026-09-25', [['bench_press_bb', [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }]]]),
    session('2026-09-20', [['bench_press_bb', sets(5)]]),
  ], end, { goal: 'bulk' });
  const chest = v.groups.find((g) => g.key === 'chest');
  const triceps = v.groups.find((g) => g.key === 'triceps');
  assert.deepEqual([chest.direct, chest.indirect, chest.sets, chest.status], [5, 0, 5, 'low']);
  // 卧推里三头是协同：5 组记半组
  assert.deepEqual([triceps.direct, triceps.indirect, triceps.sets], [0, 5, 2.5]);
  assert.equal(setCountText(triceps.sets), '2.5');
  assert.equal(v.trainingDays, 2);
  assert.equal(v.days, 7);
});

test('状态按目标对照：增肌 10–20，减脂下限 6', () => {
  const rows = [session('2026-09-27', [['squat_bb', sets(8)]])];
  const bulk = weeklySetVolume(rows, '2026-09-28', { goal: 'bulk' });
  const cut = weeklySetVolume(rows, '2026-09-28', { goal: 'cut' });
  assert.equal(bulk.groups.find((g) => g.key === 'quad').status, 'low');
  assert.equal(cut.groups.find((g) => g.key === 'quad').status, 'ok');
  const heavy = weeklySetVolume([session('2026-09-27', [['squat_bb', sets(12)], ['leg_press', sets(10)]])], '2026-09-28', { goal: 'bulk' });
  assert.equal(heavy.groups.find((g) => g.key === 'quad').status, 'high');
  assert.equal(weeklySetVolume(rows, '2026-09-28', { goal: 'nonsense' }).goal, 'maintain');
});

test('训练建议：最近练得不多时不提；已经安排了的肌群不再劝补；偏多也说', () => {
  const end = '2026-09-28';
  const two = [session('2026-09-26', [['squat_bb', sets(4)]]), session('2026-09-22', [['squat_bb', sets(4)]])];
  assert.equal(trainingDaysIn(two, end, 14), 2);
  assert.deepEqual(weeklyVolumeTips(two, end, { goal: 'bulk' }), []);

  const three = [...two, session('2026-09-16', [['squat_bb', sets(4)]])];
  const tips = weeklyVolumeTips(three, end, { goal: 'bulk' });
  const low = tips.find((t) => t.key === 'volume-low');
  assert.ok(low);
  assert.match(low.text, /增肌常用的参考是每个肌群每周 10–20 组/);
  assert.ok(low.actions.length >= 1 && low.actions.every((a) => a.adds && EXERCISE_BY_ID.has(a.id)));
  // 标题最多点三个肌群，差得最多的先说；其余的交代一句还有几个
  assert.ok(low.title.split('、').length <= 3);
  assert.doesNotMatch(low.title, /腘绳|背/);
  assert.match(low.text, /另有 7 个肌群也低于参考/);
  // 每个肌群各挑一个：不会两个名额都是卧推
  assert.equal(new Set(low.actions.map((a) => EXERCISE_BY_ID.get(a.id).group)).size, low.actions.length);

  // 今天已经安排了卧推：胸不再出现在「可以补」里
  const planned = weeklyVolumeTips(three, end, { goal: 'bulk', selection: ['bench_press_bb'] });
  assert.ok(!/胸/.test(planned.find((t) => t.key === 'volume-low').title));

  const cut = weeklyVolumeTips(three, end, { goal: 'cut' });
  assert.match(cut.find((t) => t.key === 'volume-low').text, /减脂期每个肌群每周至少保留约 6 组/);

  const heavy = [
    session('2026-09-27', [['triceps_pushdown', sets(10)]]),
    session('2026-09-25', [['skull_crusher', sets(8)]]),
    session('2026-09-23', [['overhead_triceps', sets(6)]]),
  ];
  const high = weeklyVolumeTips(heavy, end, { goal: 'bulk' }).find((t) => t.key === 'volume-high');
  assert.match(high.title, /三头这周组数偏多/);
});

test('推荐：最近在练的人，周组数落后的肌群排前面，理由就说这个', () => {
  const end = '2026-09-28';
  // 三次腿：深蹲 + 罗马尼亚硬拉，小腿一组都没有
  const legDays = ['2026-09-22', '2026-09-24', '2026-09-26']
    .map((d) => session(d, [['squat_bb', sets(4)], ['rdl_bb', sets(4)]]));
  const rec = recommendFor({ mode: 'group', groupKey: 'leg', sessions: legDays, endDate: end, goal: 'bulk' });
  const first = EXERCISE_BY_ID.get(rec.items[0].id);
  assert.equal(first.pattern, 'calf_raise');
  assert.equal(rec.items[0].reason, '小腿近 7 日 0 组，参考每周至少 10 组');

  // 只练过两次：不按组数排，回到原来的顺序（本周没做过的模式在前）
  const quiet = recommendFor({ mode: 'group', groupKey: 'leg', sessions: legDays.slice(1), endDate: end, goal: 'bulk' });
  assert.notEqual(EXERCISE_BY_ID.get(quiet.items[0].id).pattern, 'calf_raise');
  assert.doesNotMatch(quiet.items[0].reason, /参考每周/);

  // 在「胸」那一屏，三头落后不会把双杠臂屈伸顶到卧推前面
  const pressDays = ['2026-09-22', '2026-09-24', '2026-09-26'].map((d) => session(d, [['lat_pulldown', sets(4)]]));
  const chest = recommendFor({ mode: 'group', groupKey: 'chest', sessions: pressDays, endDate: end, goal: 'bulk' });
  assert.equal(EXERCISE_BY_ID.get(chest.items[0].id).pattern, 'horizontal_push');
});

test('部位详情认得周组数那张表的肌群键', () => {
  const rows = [session('2026-09-27', [['rdl_bb', sets(3)], ['leg_curl', sets(2)]])];
  const ham = trainingAreaDetail(rows, '2026-09-28', 'ham');
  assert.equal(ham.records.length, 2);
  assert.equal(ham.muscles.find((m) => m.key === 'ham').direct, 5);
});
