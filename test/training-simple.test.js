import test from 'node:test';
import assert from 'node:assert/strict';
import { newTrainingItem, createSetDraft, appendConfirmedSets, recordingDefaultsFor, normalizeSession,
  weeklyTrainingSummary, trainingCoverage, trainingHistoryDays, trainingAreaDetail, lastPerformance, sessionVolume, recommendFor } from '../js/core/training.js';
import { EXERCISE_BY_ID, exerciseForRecord } from '../js/data/exercises.js';
import { validateTrainingRecord } from '../js/core/training-records.js';
import { validateImportPayload } from '../js/lib/db.js';

const date = '2026-09-13';
const record = (id, count = 1) => {
  const item = newTrainingItem(id, [], date);
  return appendConfirmedSets(item, { ...createSetDraft(item, [], date), reps: 12, count }, date);
};

test('统一设置按动作保存，下一次沿用，热身和完成状态不被草稿复制', () => {
  let item = newTrainingItem('lateral_raise_db', [], date);
  item.recordingDefaults = { loadMode: 'external', loadConvention: 'single', measure: 'reps' };
  item = appendConfirmedSets(item, { ...createSetDraft(item), reps: 12, weightKg: 8, setType: 'warmup', count: 2 }, date);
  const sessions = [{ date, items: [item] }];
  const next = newTrainingItem(item.id, sessions, '2026-09-14');
  const draft = createSetDraft(next, sessions, '2026-09-14');
  assert.deepEqual(next.recordingDefaults, item.recordingDefaults);
  assert.equal(draft.weightKg, 8); assert.equal(draft.reps, 12);
  assert.equal(draft.setType, 'work'); assert.equal(draft.completed, undefined);
  assert.equal(next.sets.length, 0);
  assert.equal(recordingDefaultsFor(newTrainingItem('bench_press_bb')).loadConvention, 'total');
});

test('批量确认生成独立组，保留既有差异，非法输入整体拒绝', () => {
  const item = record('bench_press_bb'); item.sets[0].weightKg = 30;
  const draft = { ...createSetDraft(item), weightKg: 40, reps: 8, count: 3 };
  const next = appendConfirmedSets(item, draft, date);
  assert.equal(item.sets.length, 1); assert.equal(next.sets.length, 4);
  assert.equal(next.sets[0].weightKg, 30);
  next.sets[1].reps = 7; assert.equal(next.sets[2].reps, 8);
  for (const bad of [{ count: 20 }, { count: 1.5 }, { reps: 0 }, { weightKg: -1 }]) {
    assert.throws(() => appendConfirmedSets(item, { ...draft, ...bad }, date));
    assert.equal(item.sets.length, 1);
  }
});

test('改变统一设置不覆盖旧组，新口径不沿用旧重量，旧字段完整保留', () => {
  const item = record('bench_press_bb');
  item.sets[0] = { reps: 9, weightKg: 18, rir: 1, legacyField: true };
  item.recordingDefaults = { loadMode: 'external', loadConvention: 'single', measure: 'time' };
  const draft = createSetDraft(item);
  assert.equal(draft.weightKg, null); assert.equal(draft.reps, null);
  const next = appendConfirmedSets(item, { ...draft, durationSeconds: 45 }, date);
  assert.deepEqual(next.sets[0], item.sets[0]);
  assert.equal(next.sets[1].durationSeconds, 45); assert.equal(next.sets[1].reps, null);
  assert.equal(weeklyTrainingSummary([{ date, items: [next] }], date).unknown, 1);
});

test('山羊挺身不同练法同日分别保存，统计间隔和历史按练法读取', () => {
  const items = [record('back_extension', 2), record('back_extension_hip', 3)];
  const sessions = [{ date, items }];
  assert.equal(normalizeSession(sessions[0]).items.length, 2);
  const model = weeklyTrainingSummary(sessions, date);
  assert.equal(model.recorded, 5);
  assert.equal(model.areas.find(a => a.key === 'back').direct, 2);
  assert.equal(model.areas.find(a => a.key === 'leg').direct, 3);
  assert.equal(trainingCoverage(sessions, date).groups.find(a => a.key === 'leg').count, 1);
  assert.equal(lastPerformance(sessions, 'back_extension_hip').sets.length, 3);
  const detail = trainingAreaDetail(sessions, date, 'leg');
  assert.equal(detail.records.find(r => r.id === 'back_extension_hip').direct, 3);
  assert.equal(detail.muscles.find(m => m.key === 'glute').direct, 3);
  const rec = recommendFor({ mode: 'group', groupKey: 'leg', target: 'glute', equip: 'bodyweight', sessions, endDate: '2026-09-14' });
  assert.ok(rec.items.some(r => r.id === 'back_extension_hip'));
});

test('新记录快照经 JSON 备份保留，动作库修改不追溯覆盖历史归属', () => {
  const item = record('back_extension_hip');
  const payload = JSON.parse(JSON.stringify({ training: [{ date, items: [item] }] }));
  assert.deepEqual(validateImportPayload(payload).training, payload.training);
  const exercise = EXERCISE_BY_ID.get(item.id), original = exercise.primary;
  try {
    exercise.primary = ['erector'];
    assert.deepEqual(exerciseForRecord(item).primary, ['glute', 'ham']);
    assert.equal(weeklyTrainingSummary(payload.training, date).areas.find(a => a.key === 'leg').direct, 1);
  } finally { exercise.primary = original; }
  assert.throws(() => validateTrainingRecord({ date, items: [{ ...item, recordingDefaults: { measure: 'invalid' } }] }));
  assert.throws(() => validateTrainingRecord({ date, items: [{ ...item, exerciseSnapshot: { ...item.exerciseSnapshot, primary: ['invented'] } }] }));
});

test('部位详情按练法细分肌群，保留坐姿提踵协同和锤式弯举标签', () => {
  const sessions = [{ date, items: [record('calf_raise_standing', 2), record('calf_raise_seated', 3), record('hammer_curl')] }];
  const leg = trainingAreaDetail(sessions, date, 'leg');
  assert.deepEqual(leg.muscles.find(m => m.key === 'soleus'), { key: 'soleus', label: '比目鱼肌', direct: 5, secondary: 0 });
  assert.deepEqual(leg.muscles.find(m => m.key === 'gastrocnemius'), { key: 'gastrocnemius', label: '腓肠肌', direct: 2, secondary: 3 });
  assert.equal(leg.muscles.some(m => m.key === 'calf'), false);
  const arm = trainingAreaDetail(sessions, date, 'arm');
  assert.equal(arm.muscles.find(m => m.key === 'brachialis').direct, 1);
  assert.equal(arm.muscles.find(m => m.key === 'brachioradialis').direct, 1);
  assert.equal(arm.muscles.find(m => m.key === 'biceps').secondary, 1);
});

test('七日默认定位最近记录，手动选择空日期保持空态，跨窗口重置', () => {
  const sessions = [{ date: '2026-09-12', items: [record('pushup')] }, { date, items: [{ id: 'pushup', sets: [] }] }];
  assert.equal(trainingHistoryDays(sessions, date).selected, '2026-09-12');
  assert.equal(trainingHistoryDays(sessions, date, date).rows[0].sets.length, 0);
  assert.equal(trainingHistoryDays(sessions, date, '2026-08-01').selected, '2026-09-12');
  assert.equal(trainingHistoryDays([], date).selected, date);
  assert.equal(trainingHistoryDays(sessions, date).days.length, 7);
});

test('刻度、辅助和自重不混入公斤负荷量，旧公斤记录仍兼容', () => {
  const raw = { items: [{ id: 'lat_pulldown', sets: [
    { reps: 10, weightKg: 5, loadConvention: 'scale' },
    { reps: 10, weightKg: 20, loadMode: 'assistance' },
    { reps: 10, weightKg: 70, loadMode: 'bodyweight' },
    { reps: 10, weightKg: 30 },
  ] }] };
  assert.equal(sessionVolume(raw).tonnage, 300);
});
