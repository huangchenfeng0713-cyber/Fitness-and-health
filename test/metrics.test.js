/**
 * 指标性质：同一个数字在不同性质下该说什么、画成什么颜色。
 *
 * 这一组不是回归测试，是防止有人再把七种指标合回一根「填满了没有」的进度条。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND, LEVEL, metricState, rangePosition, dailyMetrics, KCAL_BAND,
} from '../js/core/metrics.js';

test('余数不说「还差多少」——碳水是算出来的，不是要吃到的', () => {
  /*
   * 实测截图：碳水 254/283，界面写「还差 29g」。碳水是蛋白和脂肪分完热量之后
   * 的余数，照着那句话去补，是界面在劝人多吃。
   */
  const st = metricState({ kind: KIND.remainder, eaten: 254, target: 283 });
  assert.equal(st.level, LEVEL.plain, '余数永远是中性的，没有好坏');
  assert.doesNotMatch(st.note, /还差/, `余数不该说还差：${st.note}`);
  assert.match(st.note, /不必吃满/);
  // 吃超了也一样中性
  assert.equal(metricState({ kind: KIND.remainder, eaten: 400, target: 283 }).level, LEVEL.plain);
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
  const onPlan = metricState({ kind: KIND.range, eaten: 2256, target, lo, hi, unit: ' kcal' });
  assert.equal(onPlan.level, LEVEL.met, `+180 kcal 应算在计划范围内：${onPlan.note}`);
  assert.equal(onPlan.note, '在计划范围内');

  for (const eaten of [1200, 3000]) {
    const out = metricState({ kind: KIND.range, eaten, target, lo, hi, unit: ' kcal' });
    assert.equal(out.level, LEVEL.near, '出了区间只到橙');
    assert.notEqual(out.level, LEVEL.over, '热量任何情况下都不该画成红色');
  }
  assert.match(metricState({ kind: KIND.range, eaten: 1200, target, lo, hi, unit: ' kcal' }).note, /低于计划/);
  assert.match(metricState({ kind: KIND.range, eaten: 3000, target, lo, hi, unit: ' kcal' }).note, /高于计划/);
});

test('区间落点：里面按比例铺开，外面收敛到两端', () => {
  assert.equal(rangePosition(50, 40, 60), 50, '正中间');
  assert.equal(rangePosition(40, 40, 60), 20, '下界落在 20%');
  assert.equal(rangePosition(60, 40, 60), 80, '上界落在 80%');
  assert.ok(rangePosition(10, 40, 60) < 20 && rangePosition(10, 40, 60) >= 0);
  assert.ok(rangePosition(200, 40, 60) > 80 && rangePosition(200, 40, 60) <= 100);
  // 区间退化时不能算出 NaN 或跑出界
  for (const v of [rangePosition(5, 10, 10), rangePosition(0, 0, 0)]) {
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `落点越界：${v}`);
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
    carb: 283, fiber: 30, sodium: 2000, sugar: 52, waterMl: 1700,
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
  assert.equal(by.carb.kind, KIND.remainder);
  assert.equal(by.fiber.kind, KIND.floor);
  assert.equal(by.sodium.kind, KIND.ceiling);
  assert.equal(by.sugar.kind, KIND.ceiling);
  assert.equal(by.water.kind, KIND.log);

  // 截图那一天该说的话
  assert.equal(by.protein.state.level, LEVEL.met, '蛋白 109/106 已达标');
  assert.equal(by.sodium.state.level, LEVEL.over, '钠 2814/2000 是真超标');
  assert.equal(by.carb.state.level, LEVEL.plain, '碳水永远中性');
  assert.equal(by.fat.state.level, LEVEL.near, '脂肪 91 高出 AMDR 上界 81');
  assert.match(by.fat.state.note, /高于计划 10g/);

  /*
   * 红的只有钠和游离糖 —— 这两项确实超过了各自的上限（2814/2000、56.7/52）。
   * 超一点也是超：上限就是上限，分「轻微超」「严重超」两档只会把话说糊。
   * 关键是没有任何一项因为「没吃满」被画成红色。
   */
  const reds = list.filter((m) => m.state.level === LEVEL.over).map((m) => m.key);
  assert.deepEqual(reds, ['sodium', 'sugar'], `只有真上限能变红，实际：${reds}`);
  for (const key of ['kcal', 'protein', 'carb', 'fiber', 'water']) {
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
