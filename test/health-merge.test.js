import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCompleteAppleSnapshot,
  mergeApplePartialRows,
  replaceAppleSnapshotRows,
  stampManualPatch,
} from '../js/core/health-merge.js';

test('只有 fullSnapshot === true 才能触发全量替换，格式名本身不构成授权', () => {
  assert.equal(isCompleteAppleSnapshot({ fullSnapshot: true }), true);
  assert.equal(isCompleteAppleSnapshot({ sourceFormat: 'apple-health-export' }), false);
  assert.equal(isCompleteAppleSnapshot({ fullSnapshot: 'true', sourceFormat: 'apple-health-export' }), false);
});

test('完整 Apple 快照会移除已从下一次导出消失的旧 Apple 字段', () => {
  const existing = [{ date: '2026-08-20', source: 'apple', steps: 8000, weightKg: 72 }];
  const incoming = [{ date: '2026-08-20', source: 'apple', steps: 9000 }];
  const { upserts, deletes } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  assert.equal(upserts[0].steps, 9000);
  assert.equal('weightKg' in upserts[0], false);
  assert.deepEqual(deletes, []);
});

test('完整 Apple 快照保留字段级标记的手动补录', () => {
  const existing = [{
    date: '2026-08-20', source: 'mixed', steps: 8000, weightKg: 71.5,
    _fieldProvenance: { steps: { origin: 'apple' }, weightKg: { origin: 'manual' } },
  }];
  const incoming = [{ date: '2026-08-20', steps: 9000 }];
  const { upserts } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  assert.equal(upserts[0].steps, 9000);
  assert.equal(upserts[0].weightKg, 71.5);
  assert.equal(upserts[0].source, 'mixed');
  assert.equal(upserts[0]._fieldProvenance.weightKg.origin, 'manual');
});

test('完整快照即使带来同名字段，也不能覆盖用户手动补录', () => {
  const existing = [{
    date: '2026-08-20', source: 'mixed', steps: 8000, weightKg: 71.5,
    _fieldProvenance: { steps: { origin: 'apple' }, weightKg: { origin: 'manual' } },
  }];
  const incoming = [{ date: '2026-08-20', steps: 9000, weightKg: 73 }];
  const { upserts } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  assert.equal(upserts[0].steps, 9000);
  assert.equal(upserts[0].weightKg, 71.5);
  assert.equal(upserts[0]._fieldProvenance.weightKg.origin, 'manual');
});

test('完整快照中完全消失的 Apple-only 日期会删除', () => {
  const existing = [{ date: '2026-08-19', source: 'apple', steps: 5000 }];
  const result = replaceAppleSnapshotRows(existing, [], 'import-2');
  assert.deepEqual(result.upserts, []);
  assert.deepEqual(result.deletes, ['2026-08-19']);
});

test('增量 JSON/CSV 导入不会删除本次缺失的旧字段', () => {
  const existing = [{ date: '2026-08-20', source: 'apple', steps: 8000, weightKg: 72 }];
  const merged = mergeApplePartialRows(existing, [{ date: '2026-08-20', steps: 9000 }], 'partial-2');
  assert.equal(merged[0].steps, 9000);
  assert.equal(merged[0].weightKg, 72);
});

test('手动修改只把所改字段标成 manual', () => {
  const existing = {
    date: '2026-08-20', source: 'apple', steps: 8000, weightKg: 72,
    _fieldProvenance: { steps: { origin: 'apple' }, weightKg: { origin: 'apple' } },
  };
  const row = stampManualPatch(existing, { weightKg: 71.8 });
  assert.equal(row._fieldProvenance.steps.origin, 'apple');
  assert.equal(row._fieldProvenance.weightKg.origin, 'manual');
  assert.equal(row.source, 'mixed');
});
