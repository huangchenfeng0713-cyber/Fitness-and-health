import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSession, sessionVolume, weeklyTrainingSummary, trainingCoverage, recommendFor, lastPerformance } from '../js/core/training.js';
import { validateTrainingRecord, isRecordedSet, setCategory } from '../js/core/training-records.js';
import { dietDayQuality, dietRecordSignature } from '../js/core/diet-quality.js';
import { validateImportPayload } from '../js/lib/db.js';

const date = '2026-09-13';
const set = (patch = {}) => ({ reps: 10, weightKg: null, completed: true, setType: 'work', rir: null, ...patch });
/*
 * `rir` 的输入在 v3.21.0 把每组设置并成按动作记一次时就没了，字段却还留着
 * —— 只出不进。契约里那一条已经删掉，于是它在这儿降级成一个普通的旧字段：
 * 这条用例连 `futureField` 一起验的就是「老记录里的它原样躺着，不会被清洗掉」。
 */
test('新组字段清洗和 JSON 恢复保留零、未知、辅助及额外字段（含已退役的 rir）', () => {
  const raw = { date, items: [{ id: 'pushup', done: false, sets: [set({ rir: 0, weightKg: 0, durationSeconds: 30,
    loadMode: 'assistance', loadConvention: 'scale', futureField: 'keep' })] }] };
  validateTrainingRecord(raw);
  assert.deepEqual(normalizeSession(raw), raw);
  assert.deepEqual(validateImportPayload(JSON.parse(JSON.stringify({ training: [raw] }))).training, [raw]);
});
test('新组的负值、非有限数、布尔数字和非法枚举在落库前拒绝', () => {
  for (const patch of [{ reps: true },{ durationSeconds: Infinity },
    { weightKg: -1 },{ completed: 'true' },{ loadMode: 'estimated-kg' },{ setType: 'hard' }]) {
    assert.throws(() => validateTrainingRecord({ date, items: [{ id: 'pushup', sets: [set(patch)] }] }), /pushup 第 1 组/);
  }
});
test('草稿不计组；计时完成可计组；旧未知组不自动变工作组', () => {
  assert.equal(isRecordedSet(set({ completed: false })), false);
  assert.equal(isRecordedSet(set({ reps: null, durationSeconds: 60 })), true);
  assert.equal(setCategory({ reps: 10, weightKg: 0 }), 'unknown');
  const raw = { date, items: [{ id: 'plank', sets: [set({ reps: null, durationSeconds: 60 }), set({ completed: false })] }] };
  assert.equal(sessionVolume(raw).doneSets, 1);
  assert.equal(trainingCoverage([raw], date).trainingDays, 1);
  assert.equal(lastPerformance([raw], 'plank', { before: '2026-09-14' }).sets.length, 1);
});
test('周统计区分直接、协同、肩臂与工作/热身/未知，不重复细分区域', () => {
  const rows = [{ date, items: [
    { id: 'bench_press_bb', sets: [set(), set({ setType: 'warmup' }), { reps: 8, weightKg: 20 }, set({ completed: false })] },
    { id: 'curl_db', sets: [set()] },
    { id: 'ohp_db', sets: [set()] },
  ] }, { date: '2026-09-06', items: [{ id: 'curl_db', sets: [set()] }] },
  { date: '2026-09-14', items: [{ id: 'curl_db', sets: [set()] }] }];
  const model = weeklyTrainingSummary(rows, date);
  assert.equal(model.recorded, 5); assert.equal(model.work, 3); assert.equal(model.warmup, 1); assert.equal(model.unknown, 1);
  const area = key => model.areas.find(a => a.key === key);
  assert.equal(area('chest').direct, 3); assert.equal(area('shoulder').direct, 1);
  assert.equal(area('arm').direct, 1); assert.equal(area('arm').secondary, 4);
  assert.equal(area('biceps').direct, 1); assert.equal(area('triceps').direct, 0);
  assert.equal(area('shoulder').days, 1);
});
/*
 * **「本周还没练过」先于「你最常练」。**
 *
 * 这一栏回答的是「今天练什么」，排序原先只按熟悉度，于是你越常做什么越推什么。
 * 「本周没练过」代码里本来就算出来了，可它只用来排**模式**的先后，
 * 挑具体动作时又退回熟悉度：实测腿那一屏，深蹲这个模式因为两天前练过被排到
 * 后面（对的），可轮到它时第一个仍然是那天练的哈克深蹲本身。
 */
test('本周练过的动作让位给没练过的；本周都没练过时才看常练', () => {
  const future = { date: '2026-09-14', items: [{ id: 'bench_press_smith', sets: [set()] }] };
  const tooOld = { date: '2026-08-01', items: [{ id: 'bench_press_smith', sets: [set()] }] };

  // 本周练过 bench_press_db → 水平推那个槽位让给没练过的
  const thisWeek = recommendFor({ mode: 'split', splitKey: 'push', endDate: date,
    sessions: [{ date: '2026-09-12', items: [{ id: 'bench_press_db', sets: [set()] }] }, future, tooOld] });
  assert.ok(!thisWeek.items.some(i => i.id === 'bench_press_db'), '本周刚练过的动作又被推了一遍');
  assert.ok(thisWeek.items.some(i => i.id === 'bench_press_bb'));

  // 同样两次记录但都在 7 日之外 → 熟悉度重新说了算
  const older = recommendFor({ mode: 'split', splitKey: 'push', endDate: date,
    sessions: [{ date: '2026-09-01', items: [{ id: 'bench_press_db', sets: [set()] }] },
      { date: '2026-09-03', items: [{ id: 'bench_press_db', sets: [set()] }] },
      // 草稿组不算练过
      { date: '2026-09-12', items: [{ id: 'pushup', sets: [set({ completed: false })] }] }, future, tooOld] });
  const db = older.items.find(i => i.id === 'bench_press_db');
  assert.ok(db, '本周没练过时，常练的那个应该拿到槽位');
  // 未来日和超过 28 日的记录不进历史：smith 一次都不该被算进来
  assert.equal(db.reason, '近 28 日记录 2 天');
  assert.equal(db.lastDate, '2026-09-03');
  assert.ok(!older.items.some(i => i.id === 'bench_press_smith' && i.lastDate));
});

/*
 * 「上次是哪天」由视图决定印不印，所以 core 把它单独给出来，不黏进 reason ——
 * 动作行自己那条 `上次 09-13 · 60–70kg × 12,12,12,15` 已经说过一遍了。
 */
test('推荐里的「上次」是独立字段，不重复黏进 reason', () => {
  const rec = recommendFor({ mode: 'split', splitKey: 'push', endDate: date,
    sessions: [{ date: '2026-09-01', items: [{ id: 'bench_press_db', sets: [set()] }] }] });
  const db = rec.items.find(i => i.id === 'bench_press_db');
  assert.equal(db.lastDate, '2026-09-01');
  assert.doesNotMatch(db.reason, /上次|2026-/, `reason 里又把日期抄了一遍：${db.reason}`);
});
test('时间、已选动作和待选动作共同扣预算，不为填数生成完成组', () => {
  const opts = { mode: 'split', splitKey: 'push', endDate: date, minutes: 15, setBudget: 12, setsPerExercise: 3 };
  const first = recommendFor(opts);
  assert.equal(first.items.reduce((n, i) => n + i.suggestedSets, 0), 5);
  assert.ok(first.items.every(i => !Object.hasOwn(i, 'sets')));
  const after = recommendFor({ ...opts, selection: first.items.map(i => i.id) });
  assert.equal(after.items.length, 0); assert.match(after.reason, /预算/);
  assert.equal(recommendFor({ ...opts, minutes: 0 }).items.length, 0);
});
test('营养字段齐全不等于日级完整；修改任何条目使确认失效，显式部分不参与校准', () => {
  const entries = [{ id: 1, date, kcal: 100, coverage: { kcal: { complete: true } } }];
  assert.equal(dietDayQuality(entries).status, 'unknown');
  const meta = { status: 'complete', signature: dietRecordSignature(entries), source: 'manual' };
  assert.equal(dietDayQuality(entries, meta).calibrationEligible, true);
  assert.equal(dietDayQuality([{ ...entries[0], kcal: 110 }], meta).status, 'unknown');
  assert.equal(dietDayQuality(entries, { ...meta, status: 'partial' }).calibrationEligible, false);
  assert.equal(dietDayQuality([], meta).label, '没有记录');
  assert.equal(dietRecordSignature(entries), dietRecordSignature([{ coverage: entries[0].coverage, kcal: 100, date, id: 1 }]));
});
