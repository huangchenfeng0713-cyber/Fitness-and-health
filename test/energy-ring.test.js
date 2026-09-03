import test from 'node:test';
import assert from 'node:assert/strict';
import { energyRing, lap, lockTrackScale, trackScale } from '../js/core/energy-ring.js';

const SCALE = 2200;
const ring = (eaten, burned, extra = {}) => energyRing({
  eaten, burned, projected: 2168, scale: SCALE, ...extra,
});
const seg = (m, key) => m.segments.find((s) => s.key === key);

test('尺子按预计日消耗取整到百', () => {
  assert.equal(trackScale(2168), 2200);
  assert.equal(trackScale(1856), 1900);
  assert.equal(trackScale(50), 100);
  assert.equal(trackScale(null), 2000);
});

test('摄入和消耗用同一把尺子换算', () => {
  const m = ring(1100, 440);
  assert.equal(m.laps.eaten.firstPct, 50);
  assert.equal(m.laps.burned.firstPct, 20);
  assert.equal(m.scale, 2200);
});

test('firstPct / wrapPct / 第二圈封顶', () => {
  const a = lap(1100, 2200);
  assert.equal(a.firstPct, 50);
  assert.equal(a.wrapPct, 0);
  assert.equal(a.laps, 0);

  const b = lap(2500, 2200);
  assert.equal(b.firstPct, 100);
  assert.ok(Math.abs(b.wrapPct - (300 / 2200) * 100) < 1e-9);
  assert.equal(b.laps, 1);

  const c = lap(5000, 2200);
  assert.equal(c.firstPct, 100);
  assert.equal(c.wrapPct, 100);
  assert.equal(c.laps, 2);
});

test('当天尺子锁定后不随预计消耗改圆周', () => {
  const mem = {
    data: null,
    getItem() { return this.data; },
    setItem(_, v) { this.data = v; },
  };
  const first = lockTrackScale('2026-09-03', 2168, mem);
  assert.equal(first, 2200);
  const again = lockTrackScale('2026-09-03', 1800, mem);
  assert.equal(again, 2200, '同一天不许改尺子');
  const other = lockTrackScale('2026-09-02', 1800, mem);
  assert.equal(other, 1800);
  const todayStill = lockTrackScale('2026-09-03', 1600, mem);
  assert.equal(todayStill, 2200, '翻到昨天不能改掉今天的尺子');
  const next = lockTrackScale('2026-09-04', 1800, mem);
  assert.equal(next, 1800);

  const old = {
    data: JSON.stringify({ date: '2026-09-03', scale: 2100 }),
    getItem() { return this.data; },
    setItem(_, v) { this.data = v; },
  };
  assert.equal(lockTrackScale('2026-09-03', 1800, old), 2100, '旧的单日锁要认得出');
});

test('圈心只说谁领先，不写目标', () => {
  const ahead = ring(1500, 1200);
  assert.equal(ahead.center.label, '摄入领先');
  assert.equal(ahead.center.kcal, 300);
  assert.doesNotMatch(ahead.center.label, /目标|盈余|余量/);

  const behind = ring(800, 1100);
  assert.equal(behind.center.label, '消耗领先');
  assert.equal(behind.center.kcal, 300);

  const close = ring(1000, 1020);
  assert.equal(close.center.label, '接近平衡');

  assert.match(ahead.scaleCaption, /≈2200 kcal/);
});

test('摄入越过消耗时那段是深绿领先', () => {
  const m = ring(1500, 1200);
  const lead = seg(m, 'lead');
  assert.ok(lead, '越过黄刻度的那段没有画领先');
  assert.ok(Math.abs(lead.fromPct - (1200 / 2200) * 100) < 0.01);
  assert.ok(Math.abs(lead.toPct - (1500 / 2200) * 100) < 0.01);
});

test('消耗套圈后扫过的绿弧回到灰轨', () => {
  const m = ring(800, 2300);
  assert.equal(m.drawn.firstPct, 0, '第一圈绿弧应被扫掉');
  assert.equal(m.drawn.wrapPct, 0);
  assert.equal(seg(m, 'eaten'), undefined);
  assert.equal(m.center.label, '消耗领先');
});

test('摄入再追上后绿弧回来，越过黄刻度再变深绿', () => {
  const m = ring(2500, 2300);
  assert.equal(m.drawn.firstPct, 0, '消耗已套圈，第一圈仍是灰');
  assert.ok(m.drawn.wrapPct > 0, '第二圈摄入应画出来');
  const lead = seg(m, 'lead');
  assert.ok(lead, '第二圈越过消耗的那段应是领先');
  assert.ok(lead.fromPct < lead.toPct);
});

test('没有设备消耗就不画黄刻度', () => {
  const m = energyRing({ eaten: 800, projected: 2168, scale: SCALE });
  assert.equal(m.hasBurn, false);
  assert.equal(m.ticks.some((t) => t.key === 'burned'), false);
  assert.equal(m.ticks.find((t) => t.key === 'eaten')?.label, '当前摄入');
  assert.equal(m.center.label, '摄入领先');
});

test('绿环白刻度写当前摄入，黄环黄刻度写当前消耗', () => {
  const m = ring(895, 1191);
  const eat = m.ticks.find((t) => t.key === 'eaten');
  const burn = m.ticks.find((t) => t.key === 'burned');
  assert.equal(eat.label, '当前摄入');
  assert.equal(eat.kcal, 895);
  assert.equal(eat.tone, 'intake');
  assert.equal(eat.laps, 0);
  assert.equal(burn.label, '当前消耗');
  assert.equal(burn.kcal, 1191);
  assert.equal(burn.tone, 'burn');
});

test('摄入套圈后刻度带着圈数，位置落在第二圈', () => {
  const m = ring(2758, 1781);
  const eat = m.ticks.find((t) => t.key === 'eaten');
  assert.equal(eat.laps, 1);
  assert.ok(eat.pct < 50, '第二圈应从 12 点重新起，不该还停在第一圈末尾');
  assert.equal(eat.kcal, 2758);
});

test('异常输入不抛，弧不画出圈', () => {
  for (const input of [
    {}, { eaten: -100 }, { eaten: NaN, burned: null },
    { eaten: 9999, burned: 50, scale: 100 },
  ]) {
    const m = energyRing(input);
    assert.ok(m.scale >= 100, `scale 太小：${JSON.stringify(input)}`);
    for (const s of m.segments) {
      assert.ok(s.toPct > s.fromPct, `${s.key} 画反了`);
      assert.ok(s.fromPct >= 0 && s.toPct <= 100, `${s.key} 跑出圆周了`);
    }
    for (const t of m.ticks) assert.ok(t.pct >= 0 && t.pct <= 100, `${t.key} 跑出圆周了`);
  }
});
