import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCompleteAppleSnapshot,
  mergeApplePartialRows,
  replaceAppleSnapshotRows,
  snapshotAuthority,
  stampManualPatch,
} from '../js/core/health-merge.js';

test('只有 fullSnapshot === true 才能触发全量替换，格式名本身不构成授权', () => {
  assert.equal(isCompleteAppleSnapshot({ fullSnapshot: true }), true);
  assert.equal(isCompleteAppleSnapshot({ sourceFormat: 'apple-health-export' }), false);
  assert.equal(isCompleteAppleSnapshot({ fullSnapshot: 'true', sourceFormat: 'apple-health-export' }), false);
});

test('完整 Apple 快照会移除已从下一次导出消失的旧 Apple 字段', () => {
  /*
   * 「用户在健康 App 里删掉了这天的体重」仍然照样传导过来 —— 前提是这份导出
   * **别处给得出体重**，那才证明解析器认得这一项、这一天是真没有。
   */
  const existing = [
    { date: '2026-08-19', source: 'apple', steps: 7000, weightKg: 72 },
    { date: '2026-08-20', source: 'apple', steps: 8000, weightKg: 72 },
  ];
  const incoming = [
    { date: '2026-08-19', source: 'apple', steps: 7000, weightKg: 72 },
    { date: '2026-08-20', source: 'apple', steps: 9000 },
  ];
  const { upserts, deletes } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  const day20 = upserts.find((r) => r.date === '2026-08-20');
  assert.equal(day20.steps, 9000);
  assert.equal('weightKg' in day20, false, '这一天的体重在导出里没了，应该跟着删');
  assert.deepEqual(deletes, []);
});

/* ---------------- 快照只能删掉它拿得出证据的东西 -------------------------- */

test('导出没覆盖到的日期一行都不许动', () => {
  /*
   * 用户导出苹果健康压缩包同步之后，「之前很多记录丢失了」。
   * 原先的判据是「fullSnapshot 为真 = 这份文件说完了全部事实」，
   * 于是它没提到的日期整行删除 —— 而解析器给不给得出某一天，
   * 取决于文件多大、读没读完、重叠去重丢了哪些桶。
   */
  const existing = [];
  for (let d = 1; d <= 30; d += 1) {
    existing.push({
      date: `2026-08-${String(d).padStart(2, '0')}`,
      source: 'apple', restingEnergy: 1600, activeEnergy: 500, steps: 8000,
    });
  }
  // 导出只解析出最后 10 天
  const incoming = existing.slice(-10).map((r) => ({ ...r }));
  const { upserts, deletes, untouched } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  assert.deepEqual(deletes, [], '导出没覆盖到的 20 天被删了');
  assert.equal(untouched, 20);
  assert.equal(upserts.length, 10);
});

test('整份导出一次都没出现过的字段，不算「用户删了」', () => {
  /*
   * 「这一项我没解析出来」和「用户在健康 App 里删掉了它」在数据上长得一模一样，
   * 按后者处理的代价是整段消耗被抹平，而用户既看不见也找不回。
   */
  const existing = [
    { date: '2026-08-19', source: 'apple', restingEnergy: 1600, activeEnergy: 500 },
    { date: '2026-08-20', source: 'apple', restingEnergy: 1600, activeEnergy: 500 },
  ];
  const incoming = existing.map((r) => ({ date: r.date, activeEnergy: 500 }));
  const { upserts, deletes } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  assert.deepEqual(deletes, []);
  assert.ok(upserts.every((r) => r.restingEnergy === 1600),
    '整份导出都没给静息能量，却把已有的静息能量全抹了');
});

test('一天都没解析出来时，快照什么都不许删', () => {
  const existing = [{ date: '2026-08-19', source: 'apple', steps: 5000 }];
  const result = replaceAppleSnapshotRows(existing, [], 'import-2');
  assert.deepEqual(result.deletes, []);
  assert.deepEqual(result.upserts, []);
  assert.equal(result.untouched, 1);
});

test('覆盖范围之内、导出里彻底消失的那一天仍然删除', () => {
  // 范围两端各有一天撑着，中间那天是真的没了
  const existing = ['2026-08-19', '2026-08-20', '2026-08-21']
    .map((date) => ({ date, source: 'apple', steps: 5000 }));
  const incoming = [
    { date: '2026-08-19', steps: 5000 },
    { date: '2026-08-21', steps: 5000 },
  ];
  const { deletes } = replaceAppleSnapshotRows(existing, incoming, 'import-2');
  assert.deepEqual(deletes, ['2026-08-20']);
});

test('snapshotAuthority 报出这份导出覆盖的日期段和字段', () => {
  const a = snapshotAuthority([
    { date: '2026-08-20', steps: 8000 },
    { date: '2026-08-18', activeEnergy: 500 },
  ]);
  assert.equal(a.from, '2026-08-18');
  assert.equal(a.to, '2026-08-20');
  assert.deepEqual([...a.fields].sort(), ['activeEnergy', 'steps']);
  assert.deepEqual(snapshotAuthority([]), { from: null, to: null, fields: new Set() });
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
