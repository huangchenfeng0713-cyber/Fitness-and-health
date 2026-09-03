import test from 'node:test';
import assert from 'node:assert/strict';
import { energyRing, lap, lockTrackScale, trackScale } from '../js/core/energy-ring.js';

const TARGET = 2168;
const SCALE = 2200;
const ring = (eaten, burned, extra = {}) => energyRing({
  eaten, burned, target: TARGET, scale: SCALE, ...extra,
});
const seg = (m, key) => m.segments.find((s) => s.key === key);
const legend = (m, key) => m.legend.find((l) => l.key === key);

test('圆周是今日摄入目标取整到百', () => {
  assert.equal(trackScale(2168), 2200);
  assert.equal(trackScale(1856), 1900);
  assert.equal(trackScale(50), 100);
  assert.equal(trackScale(null), 2000, '算不出目标时给中性兜底，不能让圆周变成 0');
});

test('摄入和消耗用同一把尺子换算角度', () => {
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
  assert.equal(c.wrapPct, 100, '最多画满两圈，再多不叠');
  assert.equal(c.laps, 2);
});

test('当天圆周锁死；只有计划本身变了才换尺子', () => {
  const mem = {
    data: null,
    getItem() { return this.data; },
    setItem(_, v) { this.data = v; },
  };
  assert.equal(lockTrackScale('2026-09-03', 2168, mem), 2200);
  // 同一天、同一个目标：加一餐、同步消耗都不许让圆周变
  assert.equal(lockTrackScale('2026-09-03', 2168, mem), 2200);
  assert.equal(lockTrackScale('2026-09-02', 1800, mem), 1800);
  assert.equal(lockTrackScale('2026-09-03', 2168, mem), 2200, '翻到昨天不能改掉今天的尺子');

  // 改了档案，目标变了 —— 从改的这一天起换新尺子
  assert.equal(lockTrackScale('2026-09-03', 1740, mem), 1700);
  // 改回去同理
  assert.equal(lockTrackScale('2026-09-03', 2168, mem), 2200);

  assert.equal(lockTrackScale('2026-09-04', 1800, mem), 1800);
});

test('v1 存的圆周不认：那时候存的是按预计消耗算的，含义不一样', () => {
  const old = {
    data: JSON.stringify({ '2026-09-03': 2600 }),
    getItem() { return this.data; },
    setItem(_, v) { this.data = v; },
  };
  assert.equal(lockTrackScale('2026-09-03', 2168, old), 2200);
});

test('圈心只说还能吃 / 还应吃 / 超出目标 / 接近目标', () => {
  const left = ring(1500, 1200);
  assert.equal(left.center.label, '还能吃');
  assert.equal(left.center.kcal, TARGET - 1500);

  const need = ring(1500, 1200, { dailyDelta: 300 });
  assert.equal(need.center.label, '还应吃', '计划要吃到消耗之上时是义务不是配额');

  const maintain = ring(1500, 1200, { dailyDelta: 0 });
  assert.equal(maintain.center.label, '还能吃', '增肌档速率为 0 时没有要补的量');

  const cut = ring(1500, 1200, { dailyDelta: -500 });
  assert.equal(cut.center.label, '还能吃');

  const over = ring(2400, 1200);
  assert.equal(over.center.label, '超出目标');
  assert.equal(over.center.kcal, 2400 - TARGET);

  const overWhileCutting = ring(2400, 1200, { dailyDelta: -500 });
  assert.equal(overWhileCutting.center.label, '超出目标', '吃超目标不是热量盈余');

  const near = ring(TARGET - 20, 1200);
  assert.equal(near.center.label, '接近目标');
  assert.equal(near.center.kcal, null, '差得很少时不报数');

  for (const m of [left, need, over, near]) {
    assert.doesNotMatch(m.center.label, /领先|平衡|缺口|盈余/,
      '不写「摄入领先 / 热量盈余」，也不把还能吃的额度叫成缺口');
  }
});

test('圈心对着摄入目标算，和消耗无关', () => {
  const a = ring(1500, 300);
  const b = ring(1500, 3000);
  assert.deepEqual(a.center, b.center, '消耗跑到哪儿都不该改圈心那句话');
});

test('摄入第一圈浅绿，越过 12 点第二圈深绿', () => {
  const one = ring(1500, 0);
  assert.equal(seg(one, 'eaten').tone, 'light');
  assert.equal(seg(one, 'eaten').track, 'intake');
  assert.equal(seg(one, 'eatenWrap'), undefined, '还没跑满一圈不该有第二圈');

  const two = ring(2500, 0);
  assert.equal(seg(two, 'eaten').toPct, 100, '第一圈画满，浅绿留在下面');
  const wrap = seg(two, 'eatenWrap');
  assert.equal(wrap.tone, 'deep');
  assert.equal(wrap.fromPct, 0, '第二圈从 12 点重新起');
  assert.ok(wrap.toPct < 50, '第二圈往右盖，不绕到 12 点左边');
});

test('消耗有自己的轨道，也自己跑圈', () => {
  const m = ring(500, 2600);
  assert.equal(seg(m, 'burned').track, 'burn');
  assert.equal(seg(m, 'burned').tone, 'light');
  assert.equal(seg(m, 'burnedWrap').track, 'burn');
  assert.equal(seg(m, 'burnedWrap').tone, 'deep');
});

test('消耗跑得再远也碰不到绿弧', () => {
  /*
   * 两条轨道，一条不许去动另一条。旧版本会把消耗扫过、摄入还没追上的那段
   * 绿弧擦回灰轨 —— 上午烧的比吃的多本来就是常态，把它画成「什么都没吃」是错的。
   */
  const m = ring(800, 4800);
  const eaten = seg(m, 'eaten');
  assert.ok(eaten, '绿弧被擦掉了');
  assert.ok(Math.abs(eaten.toPct - (800 / SCALE) * 100) < 0.01, '绿弧只表示吃了多少');
  assert.equal(m.center.label, '还能吃', '消耗套了两圈也不改圈心那句话');
});

test('摄入越过 12 点是和目标比，不是和消耗比', () => {
  // 吃得比烧的多，但还没吃满计划 —— 不该出现第二圈
  const m = ring(1500, 900);
  assert.equal(seg(m, 'eatenWrap'), undefined);
  assert.equal(seg(m, 'eaten').tone, 'light');
});

test('没有设备消耗就不画消耗那条轨道', () => {
  const m = energyRing({ eaten: 800, target: TARGET, scale: SCALE });
  assert.equal(m.hasBurn, false);
  assert.equal(m.segments.some((s) => s.track === 'burn'), false);
  assert.equal(m.ticks.some((t) => t.key === 'burned'), false);
  assert.equal(legend(m, 'burned'), undefined, '没有数据就不列这一项');
  assert.equal(legend(m, 'eaten').kcal, 800);
});

test('刻度只留位置，名字和值归图例', () => {
  const m = ring(895, 1191);
  const eat = m.ticks.find((t) => t.key === 'eaten');
  const burn = m.ticks.find((t) => t.key === 'burned');
  assert.equal(eat.track, 'intake');
  assert.equal(burn.track, 'burn');
  for (const t of m.ticks) {
    assert.equal(t.label, undefined, '刻度上不再挂文字');
  }
  assert.deepEqual(m.legend.map((l) => [l.label, l.kcal]), [['摄入', 895], ['消耗', 1191]]);
});

test('图例的深浅跟着轨道跑到第几圈走', () => {
  const one = ring(1500, 900);
  assert.equal(legend(one, 'eaten').deep, false);
  assert.equal(legend(one, 'burned').deep, false);

  const two = ring(2500, 2600);
  assert.equal(legend(two, 'eaten').deep, true, '摄入跑第二圈了，色块该加深');
  assert.equal(legend(two, 'burned').deep, true, '消耗跑第二圈了，色块该加深');

  // 一深一浅：两条轨道各算各的
  const mixed = ring(800, 2600);
  assert.equal(legend(mixed, 'eaten').deep, false);
  assert.equal(legend(mixed, 'burned').deep, true);
});

test('刻度套圈后位置落回第二圈，值仍是总数', () => {
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
    { eaten: 500, burned: 500, target: 0 },
    { eaten: 500, burned: 500, target: -20 },
  ]) {
    const m = energyRing(input);
    assert.ok(m.scale >= 100, `scale 太小：${JSON.stringify(input)}`);
    for (const s of m.segments) {
      assert.ok(s.toPct > s.fromPct, `${s.key} 画反了`);
      assert.ok(s.fromPct >= 0 && s.toPct <= 100, `${s.key} 跑出圆周了`);
      assert.ok(['intake', 'burn'].includes(s.track), `${s.key} 没说自己在哪条轨道`);
    }
    for (const t of m.ticks) assert.ok(t.pct >= 0 && t.pct <= 100, `${t.key} 跑出圆周了`);
    assert.ok(m.center.label, '圈心总要有一句话');
  }
});
