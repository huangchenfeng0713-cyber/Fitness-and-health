import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSession, sessionVolume, weeklyTrainingSummary, trainingCoverage, recommendFor, lastPerformance } from '../js/core/training.js';
import { validateTrainingRecord, isRecordedSet, setCategory } from '../js/core/training-records.js';
import { dietDayQuality, dietRecordSignature } from '../js/core/diet-quality.js';
import { validateImportPayload } from '../js/lib/db.js';

const date = '2026-09-13';
const set = (patch = {}) => ({ reps: 10, weightKg: null, completed: true, setType: 'work', rir: null, ...patch });
test('新组字段清洗和 JSON 恢复保留零、未知、辅助及额外字段', () => {
  const raw = { date, items: [{ id: 'pushup', done: false, sets: [set({ rir: 0, weightKg: 0, durationSeconds: 30,
    loadMode: 'assistance', loadConvention: 'scale', futureField: 'keep' })] }] };
  validateTrainingRecord(raw);
  assert.deepEqual(normalizeSession(raw), raw);
  assert.deepEqual(validateImportPayload(JSON.parse(JSON.stringify({ training: [raw] }))).training, [raw]);
});
test('新组的负值、非有限数、布尔数字和非法枚举在落库前拒绝', () => {
  for (const patch of [{ rir: -1 },{ rir: 11 },{ rir: 1.5 },{ reps: true },{ durationSeconds: Infinity },
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
test('训练选择优先实际常练动作，排除草稿、未来和超过28日的历史', () => {
  const sessions = [{ date: '2026-09-12', items: [{ id: 'bench_press_db', sets: [set()] }] },
    { date: '2026-09-14', items: [{ id: 'bench_press_smith', sets: [set()] }] },
    { date: '2026-08-01', items: [{ id: 'bench_press_smith', sets: [set()] }] }];
  const rec = recommendFor({ mode: 'split', splitKey: 'push', sessions, endDate: date });
  assert.ok(rec.items.some(i => i.id === 'bench_press_db' && i.reason.includes('2026-09-12')));
  assert.ok(!rec.items.some(i => i.id === 'bench_press_bb'));
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
