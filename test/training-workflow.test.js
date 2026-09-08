import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendFor, restoreTrainingItems } from '../js/core/training.js';
import { EXERCISE_BY_ID } from '../js/data/exercises.js';

test('候选数量是上限；逐个加入只减少未安排模式，全批加入后停止', () => {
  for (const splitKey of ['push', 'pull', 'legs', 'core']) {
    const initial = recommendFor({ mode: 'split', splitKey, seed: 2 }).items;
    const selection = [];
    for (const item of initial) {
      selection.push(item.id);
      const next = recommendFor({ mode: 'split', splitKey, selection, seed: 2 }).items;
      const arranged = new Set(selection.map(id => EXERCISE_BY_ID.get(id).pattern));
      assert.ok(next.every(row => !arranged.has(EXERCISE_BY_ID.get(row.id).pattern)));
      assert.ok(next.length < initial.length);
    }
    assert.equal(recommendFor({ mode: 'split', splitKey, selection, seed: 2 }).items.length, 0);
  }
});

test('器械约束没有可用新模式时不以同模式变式凑数', () => {
  const first = recommendFor({ mode: 'group', groupKey: 'chest', equip: 'bodyweight' }).items;
  assert.equal(recommendFor({ mode: 'group', groupKey: 'chest', equip: 'bodyweight', selection: first.map(row => row.id) }).items.length, 0);
});

test('撤销删除只恢复目标动作，保留后续新增及原组数，不改变输入对象', () => {
  const current = [{ id: 'squat_bb', sets: [{ weightKg: 60, reps: 8 }] }];
  const removed = [{ item: { id: 'bench_press_bb', sets: [{ weightKg: 40, reps: 10 }] }, index: 0 }];
  const before = structuredClone({ current, removed });
  const result = restoreTrainingItems(current, removed);
  assert.deepEqual(result.map(row => row.id), ['bench_press_bb', 'squat_bb']);
  assert.equal(result[1].sets[0].weightKg, 60);
  result[0].sets[0].reps = 1;
  assert.deepEqual({ current, removed }, before);
});

test('同 ID 已有新记录时撤销原子失败；重复撤销不新增重复项', () => {
  const original = { id: 'bench_press_bb', sets: [{ weightKg: 40, reps: 8 }] };
  const removed = [{ item: original, index: 0 }];
  assert.deepEqual(restoreTrainingItems([original], removed), [original]);
  const current = [{ ...original, sets: [{ weightKg: 50, reps: 6 }] }];
  const before = structuredClone(current);
  assert.throws(() => restoreTrainingItems(current, [{ item: { id: 'squat_bb', sets: [] }, index: 0 }, ...removed]), { name: 'TrainingConflictError' });
  assert.deepEqual(current, before);
});
