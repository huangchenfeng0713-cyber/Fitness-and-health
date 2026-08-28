/**
 * 指标性质：同一个数字在不同性质下该说什么、画成什么颜色。
 *
 * 这一组不是回归测试，是防止有人再把七种指标合回一根「填满了没有」的进度条。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND, LEVEL, metricState, rangeScale, dailyMetrics, KCAL_BAND,
} from '../js/core/metrics.js';

test('碳水按 AMDR 区间判断，不再说「按剩余热量分配」', () => {
  /*
   * targets.carb 是「热量减蛋白减脂肪」的余数，不能当靶子 ——
   * 拿余数当靶子就变回「还差 29g，快去吃」。所以对照的是 IOM AMDR 的
   * 45%~65% 供能区间：有出处，而且两端都有。
   *
   * 原先的措辞「按剩余热量分配，不必吃满」说的是对的，但那是开发者视角，
   * 用户看不懂。
   */
  const st = metricState({ kind: KIND.range, eaten: 356, target: 357, lo: 281, hi: 406, unit: 'g' });
  assert.equal(st.level, LEVEL.met);
  assert.equal(st.note, '在建议范围内');
  assert.doesNotMatch(st.note, /还差|剩余热量|吃满/, `碳水不该说这些：${st.note}`);
  assert.equal(st.range, '281–406g', '要把区间本身写出来，光说「在范围内」看不出范围是多少');
});

test('下限够了就是绿的，再多也不会变成警告', () => {
  const hit = metricState({ kind: KIND.floor, eaten: 109, target: 106 });
  assert.equal(hit.level, LEVEL.met);
  assert.equal(hit.note, '已达到');
  // 蛋白吃到两倍不是错误，不该报警
  assert.equal(metricState({ kind: KIND.floor, eaten: 212, target: 106 }).level, LEVEL.met);
  const short = metricState({ kind: KIND.floor, eaten: 12.5, target: 30 });
  assert.equal(short.level, LEVEL.plain, '没够只是还没够，不是警告');
  assert.match(short.note, /还差 18g/);
});

test('红色只留给真正的上限', () => {
  const over = metricState({ kind: KIND.ceiling, eaten: 2814, target: 2000, unit: 'mg' });
  assert.equal(over.level, LEVEL.over, '钠超了 40% 必须是红的');
  assert.match(over.note, /已超 814mg/);
  assert.equal(metricState({ kind: KIND.ceiling, eaten: 1700, target: 2000, unit: 'mg' }).level, LEVEL.near);
  assert.equal(metricState({ kind: KIND.ceiling, eaten: 900, target: 2000, unit: 'mg' }).level, LEVEL.plain);
  // 留 5% 余量给四舍五入，刚好吃满不该立刻变红
  assert.equal(metricState({ kind: KIND.ceiling, eaten: 2000, target: 2000 }).level, LEVEL.near);
});

test('热量在计划区间内是绿的，出界只到橙，永远不红', () => {
  /*
   * 实测截图：目标 2076、已摄入 2256，比计划多 180（+8.7%），界面画成红圈。
   * 可这是 +0.3 kg/周的增重计划，本来就要求每天吃超——把执行计划画成危险色，
   * 是界面自己跟自己打架。
   */
  const target = 2076;
  const lo = Math.round(target * (1 - KCAL_BAND));
  const hi = Math.round(target * (1 + KCAL_BAND));
  const onPlan = metricState({ kind: KIND.range, eaten: 2256, target, lo, hi, unit: ' kcal', rangeWord: '计划' });
  assert.equal(onPlan.level, LEVEL.met, `+180 kcal 应算在计划范围内：${onPlan.note}`);
  assert.equal(onPlan.note, '在计划范围内');

  for (const eaten of [1200, 3000]) {
    const out = metricState({ kind: KIND.range, eaten, target, lo, hi, unit: ' kcal', rangeWord: '计划' });
    assert.equal(out.level, LEVEL.near, '出了区间只到橙');
    assert.notEqual(out.level, LEVEL.over, '热量任何情况下都不该画成红色');
  }
  assert.match(metricState({ kind: KIND.range, eaten: 1200, target, lo, hi, unit: ' kcal', rangeWord: '计划' }).note, /低于计划/);
  assert.match(metricState({ kind: KIND.range, eaten: 3000, target, lo, hi, unit: ' kcal', rangeWord: '计划' }).note, /高于计划/);
});

test('区间条整条线性，罩子位置只由区间本身决定', () => {
  /*
   * 旧画法把区间压在 20%~80%，两头各留 20% 表示「低了/高了」——
   * 吃 10g 和吃 30g 标记位置差不了多少，图在压缩事实。现在整条线性。
   */
  const a = rangeScale(74, 55, 97);
  assert.ok(a.fillPct > a.zoneStart && a.fillPct < a.zoneEnd, '落在区间里，填充应当停在罩子中间');
  const low = rangeScale(30, 55, 97);
  assert.ok(low.fillPct < low.zoneStart, '少了，填充该停在罩子左边');
  const high = rangeScale(130, 55, 97);
  assert.ok(high.fillPct > high.zoneEnd, '多了，填充该越过罩子右边');

  // 线性：量翻倍，填充百分比也翻倍（同一根轴上比较）
  const one = rangeScale(20, 55, 97);
  const two = rangeScale(40, 55, 97);
  assert.ok(Math.abs(two.fillPct - one.fillPct * 2) < 0.01,
    `刻度不是线性的：20g→${one.fillPct}%，40g→${two.fillPct}%`);

  // 区间退化或为零时不能算出 NaN、也不能跑出界
  for (const s2 of [rangeScale(5, 10, 10), rangeScale(0, 0, 0), rangeScale(0, 55, 97)]) {
    for (const k of ['fillPct', 'zoneStart', 'zoneEnd']) {
      assert.ok(Number.isFinite(s2[k]) && s2[k] >= 0 && s2[k] <= 100, `${k} 越界或是 NaN：${s2[k]}`);
    }
  }
});

test('饮水只是记录，不判达标', () => {
  const st = metricState({ kind: KIND.log, eaten: 550, target: 1700, unit: ' ml' });
  assert.equal(st.level, LEVEL.plain);
  assert.doesNotMatch(st.note, /还差|不足|缺/, `饮水不该判身体缺不缺水：${st.note}`);
});

test('八项指标各自归到该有的性质', () => {
  const targets = {
    kcal: 2076, protein: 106, fat: 69, fatLower: 46, fatUpper: 81,
    carb: 283, carbLower: 234, carbUpper: 337, fiber: 30, sodium: 2000, sugar: 52, waterMl: 1700,
  };
  const g = (eaten, target) => ({ eaten, target, remaining: target - eaten, pct: (eaten / target) * 100 });
  const gaps = {
    kcal: g(2256, 2076), protein: g(109, 106), fat: g(91, 69),
    carb: g(254, 283), fiber: g(12.5, 30), sodium: g(2814, 2000), sugar: g(56.7, 52),
  };
  const list = dailyMetrics(targets, gaps, 550);
  const by = Object.fromEntries(list.map((m) => [m.key, m]));
  assert.equal(list.length, 8, '八项一个都不能少');
  assert.equal(by.kcal.kind, KIND.range);
  assert.equal(by.protein.kind, KIND.floor);
  assert.equal(by.fat.kind, KIND.range);
  assert.equal(by.carb.kind, KIND.range);
  assert.equal(by.fiber.kind, KIND.floor);
  assert.equal(by.sodium.kind, KIND.ceiling);
  assert.equal(by.sugar.kind, KIND.ceiling);
  assert.equal(by.water.kind, KIND.log);

  // 截图那一天该说的话
  assert.equal(by.protein.state.level, LEVEL.met, '蛋白 109/106 已达标');
  assert.equal(by.sodium.state.level, LEVEL.over, '钠 2814/2000 是真超标');
  // 碳水 254g 低于 45% 供能（约 234g 起）—— 这里它落在区间里
  assert.ok([LEVEL.met, LEVEL.near].includes(by.carb.state.level), '碳水应按区间判断');
  assert.equal(by.fat.state.level, LEVEL.near, '脂肪 91 高出 AMDR 上界 81');
  assert.match(by.fat.state.note, /高于建议 10g/, '脂肪区间是 AMDR，措辞该是「建议」不是「计划」');

  /*
   * 红的只有钠和游离糖 —— 这两项确实超过了各自的上限（2814/2000、56.7/52）。
   * 超一点也是超：上限就是上限，分「轻微超」「严重超」两档只会把话说糊。
   * 关键是没有任何一项因为「没吃满」被画成红色。
   */
  const reds = list.filter((m) => m.state.level === LEVEL.over).map((m) => m.key);
  assert.deepEqual(reds, ['sodium', 'sugar'], `只有真上限能变红，实际：${reds}`);
  for (const key of ['kcal', 'protein', 'carb', 'fat', 'fiber', 'water']) {
    assert.notEqual(by[key].state.level, LEVEL.over, `${key} 不是上限，不该变红`);
  }
});

test('目标为 0 或缺失时不产生 NaN', () => {
  for (const kind of Object.values(KIND)) {
    const st = metricState({ kind, eaten: 0, target: 0, lo: 0, hi: 0 });
    assert.ok(Number.isFinite(st.fillPct), `${kind} 的 fillPct 是 NaN`);
    assert.doesNotMatch(st.note, /NaN|undefined|Infinity/, `${kind} 的措辞里漏了脏值：${st.note}`);
  }
});
