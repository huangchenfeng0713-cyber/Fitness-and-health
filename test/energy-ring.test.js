import test from 'node:test';
import assert from 'node:assert/strict';
import { energyRing } from '../js/core/energy-ring.js';

test('两条弧的长度差就是缺口', () => {
  // 截图里那一版：目标 2186、吃了 1725、当前消耗 1855、预计 1856
  const m = energyRing({ eaten: 1725, target: 2186, burned: 1855, projected: 1856 });
  assert.equal(m.scale, 2186, '圆周该取几个数里最大的');
  assert.equal(m.intake.kcal, 1725);
  assert.equal(m.burn.kcal, 1855);
  assert.equal(m.gap, 130);
  // 内环比外环长出来的那一截，正是缺口占圆周的比例
  assert.ok(Math.abs((m.burn.pct - m.intake.pct) - (130 / 2186) * 100) < 0.01,
    '两条弧的长度差和缺口对不上，图就在骗人');
  assert.equal(m.remaining, 461);
  assert.equal(m.planDelta, 330, '目标和预计消耗之间那一截是计划盈余');
});

/*
 * 上一版就栽在这儿：摄入为 0 时那条锚定视线的实心弧不存在，
 * 整圈只剩三层几乎一样的淡绿。而这恰恰是每天早上打开时的样子。
 */
test('一口没吃时仍然读得出来：外环空着、内环有长度', () => {
  const m = energyRing({ eaten: 0, target: 2186, burned: 1722, projected: 2186 });
  assert.equal(m.intake.pct, 0, '没吃就是没吃，外环不该有长度');
  assert.ok(m.burn.pct > 70, `内环该走出大半圈，实际 ${m.burn.pct}%`);
  assert.equal(m.gap, 1722);
  // 只要两条弧不一样长，这张图就还在说话
  assert.ok(m.burn.pct - m.intake.pct > 70);
});

test('消耗还会往前走的那一段单独画，且接在此刻后面', () => {
  const m = energyRing({ eaten: 900, target: 2200, burned: 1400, projected: 2100 });
  assert.ok(m.ahead, '「今天接下来还会烧掉多少」没画出来');
  assert.equal(m.ahead.kcal, 700);
  assert.equal(m.ahead.fromPct, m.burn.pct, '延伸段必须从此刻接上，不能悬空');
  assert.ok(m.ahead.pct > m.ahead.fromPct);
});

test('预计消耗和此刻一样时不画延伸段', () => {
  const m = energyRing({ eaten: 500, target: 2000, burned: 1800, projected: 1800 });
  assert.equal(m.ahead, null, '零长度的一段画出来只是一道毛刺');
});

test('目标落在圆周尽头时不画刻度', () => {
  // 目标就是最大值，刻度会压在十二点的起点圆点上，什么也没多说
  const flush = energyRing({ eaten: 900, target: 2000, burned: 700, projected: 1500 });
  assert.equal(flush.targetTick, null);
  // 减脂计划里预计消耗更大，目标就落在圈中间，这时候要画
  const cut = energyRing({ eaten: 800, target: 1800, burned: 1200, projected: 2300 });
  assert.equal(cut.scale, 2300, '圆周要装得下预计消耗，否则内环画到圈外');
  assert.ok(cut.targetTick, '目标刻度没画出来');
  assert.equal(cut.targetTick.kcal, 1800);
  assert.equal(cut.planDelta, -500, '减脂计划的目标低于预计消耗，是负的');
});

test('吃得比烧的多时报盈余，不报缺口', () => {
  const m = energyRing({ eaten: 2000, target: 2200, burned: 1700, projected: 2100 });
  assert.equal(m.gap, 0, '没有缺口了还报一个数是在编');
  assert.equal(m.surplus, 300);
  assert.ok(m.intake.pct > m.burn.pct, '吃得多，外环就该比内环长');
});

test('没有设备数据时不画内环，也不编造消耗', () => {
  const m = energyRing({ eaten: 900, target: 2000 });
  assert.equal(m.hasBurn, false);
  assert.equal(m.burn, null, '没有消耗数据就不该有内环');
  assert.equal(m.ahead, null);
  assert.equal(m.gap, 0);
  assert.equal(m.remaining, 1100);
  assert.ok(m.intake.pct > 0, '外环仍然要画：吃了多少总是知道的');
});

test('异常输入不抛，也不画出圈外的弧', () => {
  for (const input of [
    {}, { eaten: -100, target: 0 }, { eaten: NaN, target: null },
    { eaten: 500, target: 2000, burned: 0 }, { eaten: 0, target: 0, burned: null },
    { eaten: 9999, target: 100, burned: 50, projected: 60 },
  ]) {
    const m = energyRing(input);
    assert.ok(m.scale > 0, `scale 不该是 0：${JSON.stringify(input)}`);
    for (const part of [m.intake, m.burn, m.ahead, m.targetTick]) {
      if (!part) continue;
      assert.ok(part.pct >= 0 && part.pct <= 100, `${JSON.stringify(part)} 跑出圆周了`);
    }
  }
});
