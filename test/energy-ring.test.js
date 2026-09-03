import test from 'node:test';
import assert from 'node:assert/strict';
import { energyRing, ringLegend, trackScale } from '../js/core/energy-ring.js';

const DAY = { target: 2186, projected: 1856 };
const ring = (eaten, burned) => energyRing({ ...DAY, eaten, burned });

test('尺子按预计消耗取整到百，不随摄入放大', () => {
  assert.equal(trackScale(2168), 2200);
  assert.equal(trackScale(1856), 1900);
  const m = ring(3000, 800);
  assert.equal(m.scale, 1900);
  assert.ok(m.laps.eaten.wrapPct > 50, '摄入超过尺子应走第二圈');
});

test('圈内只报谁领先多少', () => {
  const behind = ring(400, 900);
  assert.equal(behind.center.label, '消耗领先 kcal');
  assert.equal(behind.center.kcal, 500);

  const ahead = ring(1485, 950);
  assert.equal(ahead.center.label, '摄入领先 kcal');
  assert.equal(ahead.center.kcal, 535);

  const even = ring(900, 910);
  assert.equal(even.center.label, '接近平衡');
});

test('没有设备数据时不画消耗刻度', () => {
  const none = energyRing({ ...DAY, eaten: 415 });
  assert.equal(none.hasBurn, false);
  assert.equal(none.ticks.length, 0);
  assert.equal(none.center.label, '已摄入 kcal');
});

test('消耗超过一圈时刻度落在第二圈位置，绿弧不被擦掉', () => {
  const m = ring(800, 2400);
  assert.equal(m.scale, 1900);
  assert.ok(m.laps.burned.laps >= 1);
  assert.ok(m.laps.eaten.firstPct > 40);
  assert.ok(m.laps.burned.wrapPct > 20);
  assert.equal(m.center.label, '消耗领先 kcal');
});

test('环下数字口径保持：已摄入 / 当前消耗 / 缺口或超出', () => {
  const m = ring(400, 900);
  assert.equal(m.eaten, 400);
  assert.equal(m.burned, 900);
  assert.equal(m.gap, 500);
  assert.equal(m.surplus, 0);
  const over = ring(1485, 950);
  assert.equal(over.surplus, 535);
  assert.equal(over.gap, 0);
});

test('图例只列画出来的段', () => {
  assert.deepEqual(ringLegend(ring(0, 0)).map((x) => x.key), []);
  assert.ok(ringLegend(ring(900, 400)).some((x) => x.key === 'lead'));
});

test('异常输入不抛', () => {
  for (const input of [
    {}, { eaten: -100, target: 0 }, { eaten: NaN, target: null },
    { eaten: 0, target: 0, burned: null }, { eaten: 9999, target: 100, burned: 50 },
  ]) {
    const m = energyRing(input);
    assert.ok(m.scale > 0);
    assert.ok(m.center);
  }
});
