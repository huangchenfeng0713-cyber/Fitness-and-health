/**
 * 图表纵轴刻度的取值逻辑。
 * lineChart 依赖 DOM，这里只测抽出来的刻度规则，保证不再出现
 * 「1 / 1 / 0 / -0」这种重复且带负零的刻度。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** 与 charts.js 中 lineChart 保持一致的刻度计算 */
function axisTicks(values, { target = null, decimals = null } = {}) {
  const ys = [...values];
  if (target != null) ys.push(target);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  const span = max - min || Math.abs(max) * 0.1 || 1;
  min -= span * 0.12;
  max += span * 0.12;
  if (ys.every((v) => v >= 0)) min = Math.max(0, min);
  const range = max - min;
  const dec = decimals != null ? decimals : (range >= 20 ? 0 : range >= 2 ? 1 : 2);
  const fmt = (v) => {
    const t = v.toFixed(dec);
    return t === `-${(0).toFixed(dec)}` ? (0).toFixed(dec) : t;
  };
  return [0, 1, 2, 3].map((i) => fmt(min + ((max - min) * i) / 3));
}

test('小量程不会产生重复刻度', () => {
  // 修复前：活动能量被缩小一千倍后落在 0~1，刻度渲染成 1 / 1 / 0 / -0
  const ticks = axisTicks([0.2, 0.55, 0.9, 1.1, 0.75]);
  assert.equal(new Set(ticks).size, ticks.length, `刻度有重复：${ticks.join(' / ')}`);
});

test('非负指标不会出现负刻度或负零', () => {
  for (const vals of [[0.2, 1.1], [0, 5000, 9000], [6.4, 7.7, 8.4]]) {
    const ticks = axisTicks(vals);
    for (const t of ticks) {
      assert.ok(!t.startsWith('-'), `出现负刻度 ${t}（数据全为非负）：${ticks.join(' / ')}`);
    }
  }
});

test('可以有负刻度的场景仍然保留（热量收支）', () => {
  const ticks = axisTicks([-620, -180, 240], { target: 0 });
  assert.ok(ticks.some((t) => t.startsWith('-')), `收支图应保留负刻度：${ticks.join(' / ')}`);
});

test('大量程用整数刻度，小量程自动加小数位', () => {
  assert.ok(axisTicks([2000, 9000]).every((t) => !t.includes('.')), '步数这类大数不该带小数');
  assert.ok(axisTicks([70.1, 71.8]).some((t) => t.includes('.')), '体重需要小数位才能区分');
  assert.ok(axisTicks([0.2, 1.1]).every((t) => t.split('.')[1]?.length === 2), '小量程应保留两位');
});

test('显式指定小数位时以调用方为准', () => {
  assert.ok(axisTicks([70.1, 71.8], { decimals: 1 }).every((t) => t.split('.')[1]?.length === 1));
});
