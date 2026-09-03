import test from 'node:test';
import assert from 'node:assert/strict';
import { energyRing, ringLegend } from '../js/core/energy-ring.js';

const seg = (m, key) => m.segments.find((s) => s.key === key);

test('三段按语义排在圆周上，密度递减和「已经发生」对齐', () => {
  // 截图里那一版：目标 2186、吃了 1725、当前消耗 1855、预计 1856
  const m = energyRing({ eaten: 1725, target: 2186, burned: 1855, projected: 1856 });
  assert.equal(m.scale, 2186, '圆周该取三个数里最大的');
  assert.equal(seg(m, 'eaten').kcal, 1725);
  assert.equal(seg(m, 'gap').kcal, 130, '实心弧到刻度线之间就是实际缺口');
  assert.equal(m.gap, 130);
  assert.equal(seg(m, 'plan').kcal, 330, '预计消耗到目标之间是计划盈余');
  assert.equal(m.remaining, 461);

  // 顺序必须是 已摄入 → 缺口 → 未到达 → 计划段，越靠前越"实"
  const order = m.segments.map((s) => s.key);
  assert.deepEqual(order.filter((k) => k !== 'ahead'), ['eaten', 'gap', 'plan']);
  assert.equal(seg(m, 'eaten').tone, 'solid');
  assert.equal(seg(m, 'gap').tone, 'mid');
  assert.equal(seg(m, 'plan').tone, 'dashed', '盈余段用纹理，不是第四级明度');

  // 段落首尾相接，不留缝也不叠
  const sorted = [...m.segments].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(Math.abs(sorted[i].from - sorted[i - 1].to) < 1,
      `${sorted[i - 1].key} 和 ${sorted[i].key} 之间断开了`);
  }
});

test('两条刻度线分别是当前消耗和预计全天消耗', () => {
  const m = energyRing({ eaten: 900, target: 2200, burned: 1400, projected: 2100 });
  assert.deepEqual(m.ticks.map((t) => t.key), ['burned', 'projected']);
  assert.equal(m.ticks[0].strong, true, '当前消耗是长实线');
  assert.equal(m.ticks[1].strong, false, '预计消耗是短淡线');
  assert.equal(m.ticks[0].kcal, 1400);
  assert.equal(m.ticks[1].kcal, 2100);
  // 两条线之间就是「今天接下来还会烧掉多少」
  assert.equal(seg(m, 'ahead').kcal, 700);
});

test('两条刻度贴太近时只留长的那条', () => {
  // 1855 和 1856 在 2186 的圆周上差不到 0.05%，并排两根线读不出是两个数
  const m = energyRing({ eaten: 1725, target: 2186, burned: 1855, projected: 1856 });
  assert.deepEqual(m.ticks.map((t) => t.key), ['burned']);
});

test('吃得比烧的多时不画缺口，多出来的溢到外圈', () => {
  const m = energyRing({ eaten: 2000, target: 2200, burned: 1700, projected: 2100 });
  assert.equal(seg(m, 'gap'), undefined, '没有缺口了还画一段是在编');
  assert.ok(m.overflow, '超出的部分没有去处');
  assert.equal(m.overflow.kcal, 300);
  assert.equal(m.surplus, 300);
  // 主环的语义不被占用：实心仍然只是「吃了多少」
  assert.equal(seg(m, 'eaten').kcal, 2000);
});

test('减脂计划里目标小于预计消耗，那一段是赤字不是盈余', () => {
  const m = energyRing({ eaten: 800, target: 1800, burned: 1200, projected: 2300 });
  assert.equal(m.scale, 2300, '圆周要装得下预计消耗，否则刻度线跑到圈外');
  const d = seg(m, 'deficit');
  assert.ok(d, '目标和预计消耗之间那一截没画出来');
  assert.equal(d.kcal, 500);
  assert.equal(d.tone, 'dashed', '计划赤字和计划盈余是同一类，共用纹理');
  assert.equal(seg(m, 'plan'), undefined);
});

test('没有设备数据时退回最朴素的一圈，不编造刻度', () => {
  const m = energyRing({ eaten: 900, target: 2000 });
  assert.equal(m.hasBurn, false);
  assert.deepEqual(m.ticks, [], '没有消耗数据就不该有刻度线');
  assert.equal(m.eaten, 900, '视图要能直接读这几个数，不用翻 ticks');
  assert.equal(m.target, 2000);
  assert.equal(m.overflow, null);
  assert.equal(seg(m, 'gap'), undefined);
  assert.equal(seg(m, 'ahead').kcal, 1100, '「还没吃到」该铺到目标');
  assert.equal(m.remaining, 1100);
});

test('落在圆周尽头的刻度不画', () => {
  // 预计消耗正好是圆周本身时，那条线会压在十二点的起点圆点上
  const m = energyRing({ eaten: 900, target: 2000, burned: 700, projected: 2000 });
  assert.deepEqual(m.ticks.map((t) => t.key), ['burned'],
    '「这一圈到这儿为止」那条线什么也没多说');
  assert.equal(m.projected, 2000, '不画不等于没有，视图仍要拿得到这个数');
});

test('图例只列真的画出来的段', () => {
  const bare = ringLegend(energyRing({ eaten: 900, target: 2000 }));
  assert.deepEqual(bare.map((x) => x.key), ['eaten', 'ahead'],
    '没有设备数据的人不该看到两条永远不出现的图例');

  const full = ringLegend(energyRing({ eaten: 1725, target: 2186, burned: 1855, projected: 2000 }));
  assert.deepEqual(full.map((x) => x.key), ['eaten', 'gap', 'ahead', 'plan']);

  const over = ringLegend(energyRing({ eaten: 2000, target: 2200, burned: 1700, projected: 2100 }));
  assert.ok(over.some((x) => x.key === 'over'), '溢出那一圈没有图例');
});

test('异常输入不抛，也不画出负的段', () => {
  for (const input of [
    {}, { eaten: -100, target: 0 }, { eaten: NaN, target: null },
    { eaten: 500, target: 2000, burned: 0 }, { eaten: 0, target: 0, burned: null },
  ]) {
    const m = energyRing(input);
    assert.ok(m.scale > 0, `scale 不该是 0：${JSON.stringify(input)}`);
    for (const s of m.segments) {
      assert.ok(s.to > s.from, `${s.key} 画反了`);
      assert.ok(s.fromPct >= 0 && s.toPct <= 100, `${s.key} 跑出圆周了`);
    }
  }
});
