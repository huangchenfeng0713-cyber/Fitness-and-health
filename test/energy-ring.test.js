import test from 'node:test';
import assert from 'node:assert/strict';
import { energyRing, ringLegend } from '../js/core/energy-ring.js';

const seg = (m, key) => m.segments.find((s) => s.key === key);
/* 原型里那一天：目标 2186 = 预计全天 1856 + 计划盈余 330 */
const DAY = { target: 2186, projected: 1856 };
const ring = (eaten, burned) => energyRing({ ...DAY, eaten, burned });

/*
 * 五张状态图上的数，逐个对一遍。圈里那个数是「目标 − 已摄入」——
 * 不是「预计全天 − 已摄入」，五张图里只有摄入为 0 的两张碰巧看不出区别。
 */
test('五种状态的圈内数字和缺口 / 溢出都对得上', () => {
  for (const [name, eaten, burned, center, gap, over] of [
    ['图1 吃得比烧的多', 1485, 950, 701, 0, 535],
    ['图2 快吃满', 1970, 1855, 216, 0, 115],
    ['图3 一口没吃', 0, 755, 2186, 755, 0],
    ['图4 还没动', 415, 0, 1771, 0, 415],
    ['图5 什么都没有', 0, 0, 2186, 0, 0],
  ]) {
    const m = ring(eaten, burned);
    assert.equal(m.center.kcal, center, `${name} 的圈内数字`);
    assert.equal(m.center.over, false, `${name} 不该是盈余`);
    assert.equal(m.gap, gap, `${name} 的缺口`);
    assert.equal(m.surplus, over, `${name} 的溢出`);
  }
});

/*
 * 主环那条实心弧**不越过消耗那条刻度线**。
 * 环里那一圈始终是「已经被今天的消耗兜住的那部分」，
 * 越出去的整段画在主环外面 —— 位置本身就在说「你超了」。
 */
test('实心弧只画到消耗，越出去的整段走外圈', () => {
  const m = ring(1485, 950);
  assert.equal(seg(m, 'eaten').kcal, 950, '实心弧不该越过刻度线');
  assert.equal(seg(m, 'gap'), undefined, '吃得比烧的多就没有缺口');
  assert.ok(m.overflow, '超出的部分没有去处');
  assert.equal(m.overflow.kcal, 535);
  // 外圈那条弧接着刻度线起，一直到已摄入 —— 两段合起来才是吃了多少
  const tick = m.ticks.find((t) => t.key === 'burned');
  assert.ok(Math.abs(m.overflow.fromPct - tick.pct) < 0.01, '外圈的弧没有从刻度线起');
  assert.ok(Math.abs(m.overflow.fromPct - seg(m, 'eaten').toPct) < 0.01,
    '实心弧的末端和外圈的起点没有接上');
  assert.equal(seg(m, 'eaten').kcal + m.overflow.kcal, m.eaten, '两段加起来要等于已摄入');
});

test('吃得比烧的少时中间那段是缺口', () => {
  const m = ring(0, 755);
  assert.equal(seg(m, 'eaten'), undefined, '没吃就不画实心弧');
  assert.equal(seg(m, 'gap').kcal, 755, '实心弧到刻度线之间就是缺口');
  assert.equal(seg(m, 'gap').tone, 'mid');
  assert.equal(m.overflow, null);
});

test('四段的密度由实到虚，盈余段用纹理', () => {
  const m = ring(900, 1400);
  assert.equal(seg(m, 'eaten').tone, 'solid');
  assert.equal(seg(m, 'gap').tone, 'mid');
  assert.equal(seg(m, 'ahead').tone, 'faint');
  assert.equal(seg(m, 'plan').tone, 'dashed', '盈余段用纹理，不是第四级明度');
  assert.equal(seg(m, 'ahead').kcal, 456, '未到达 = 预计全天 − 走到的位置');
  assert.equal(seg(m, 'plan').kcal, 330, '盈余段 = 目标 − 预计全天');
});

/*
 * 环上只有一条刻度：当前消耗。
 *
 * 「预计全天消耗」不再单独画线 —— 它标的位置正好是虚线盈余段的起点
 * （目标 = 预计全天消耗 + 计划盈余），纹理已经在说这件事了，
 * 再压一条带数字的刻度上去是同一件事说两遍。
 */
test('环上只有「当前消耗」一条刻度', () => {
  const m = ring(900, 1400);
  assert.deepEqual(m.ticks.map((t) => t.key), ['burned']);
  assert.equal(m.ticks[0].strong, true);
  assert.equal(m.ticks[0].label, '消耗');
  // 数值本身没丢，只是不占环上的位置
  assert.equal(m.projected, 1856);
  // 虚线段的起点就是「预计全天」，那条边界还在
  assert.ok(Math.abs(seg(m, 'plan').fromPct - (1856 / 2186) * 100) < 0.01);
});

test('当前消耗是 0 和没有设备数据是两回事', () => {
  const zero = ring(415, 0);
  assert.equal(zero.hasBurn, true, '设备记到 0 也是记到了');
  assert.equal(zero.ticks[0].kcal, 0, '刻度要落在十二点上');
  assert.equal(zero.overflow.kcal, 415, '消耗 0 时整份摄入都算溢出');

  const none = energyRing({ ...DAY, eaten: 415 });
  assert.equal(none.hasBurn, false);
  assert.equal(none.overflow, null, '没有消耗数据就无从谈起溢出');
  assert.ok(!none.ticks.some((t) => t.key === 'burned'), '不该编造一条消耗刻度');
});

test('吃过头时圈内翻成盈余，不写负的余量', () => {
  const m = ring(2400, 1900);
  assert.equal(m.center.over, true);
  assert.equal(m.center.kcal, 214, '2400 − 2186');
  assert.match(m.center.label, /盈余/);
  assert.equal(m.scale, 2400, '目标装不下时圆周让位，否则实心弧转出圈外');
});

test('减脂计划里目标小于预计全天，那一段是赤字', () => {
  const m = energyRing({ eaten: 800, target: 1800, burned: 1200, projected: 2300 });
  assert.equal(m.scale, 2300, '圆周要装得下预计消耗');
  assert.equal(seg(m, 'deficit').kcal, 500);
  assert.equal(seg(m, 'deficit').tone, 'dashed');
  assert.equal(seg(m, 'plan'), undefined);
});

test('图例只列真的画出来的段', () => {
  assert.deepEqual(ringLegend(ring(0, 0)).map((x) => x.key), ['ahead', 'plan']);
  assert.deepEqual(ringLegend(ring(900, 1400)).map((x) => x.key),
    ['eaten', 'gap', 'ahead', 'plan']);
  assert.ok(ringLegend(ring(1485, 950)).some((x) => x.key === 'over'), '溢出没有图例');
});

test('异常输入不抛，也不画出圈外的弧', () => {
  for (const input of [
    {}, { eaten: -100, target: 0 }, { eaten: NaN, target: null },
    { eaten: 0, target: 0, burned: null }, { eaten: 9999, target: 100, burned: 50 },
  ]) {
    const m = energyRing(input);
    assert.ok(m.scale > 0, `scale 不该是 0：${JSON.stringify(input)}`);
    for (const s of m.segments) {
      assert.ok(s.toPct > s.fromPct, `${s.key} 画反了`);
      assert.ok(s.fromPct >= 0 && s.toPct <= 100, `${s.key} 跑出圆周了`);
    }
    for (const t of m.ticks) assert.ok(t.pct >= 0 && t.pct <= 100, `${t.key} 跑出圆周了`);
  }
});
