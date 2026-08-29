/**
 * 指标性质：同一个数字在不同性质下该说什么、画成什么颜色。
 *
 * 这一组不是回归测试，是防止有人再把七种指标合回一根「填满了没有」的进度条。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND, LEVEL, metricState, rangeScale, dailyMetrics, KCAL_BAND,
  macroSplit, referenceBand, MIN_SPLIT_KCAL, MIN_SPLIT_SHARE,
} from '../js/core/metrics.js';
import { dailyTargets } from '../js/core/nutrition.js';

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

test('目标是脏数据时不许把 NaN 印到界面上', () => {
  // dailyTargets 自己不会产出这种值，但恢复备份和云端同步是绕过校验直接落库的。
  // 界面上出现「还差 NaNg」「上限 -100g」时，用户看到的是乱码，不是「这项没数据」。
  for (const t of [NaN, -100, null, undefined, 'abc', Infinity]) {
    for (const kind of [KIND.floor, KIND.ceiling, KIND.range, KIND.remainder, KIND.log]) {
      const st = metricState({ kind, eaten: 50, target: t, lo: t, hi: t, unit: 'g' });
      const text = `${st.note}${st.range || ''}`;
      assert.doesNotMatch(text, /NaN|Infinity|undefined/, `${kind} / ${String(t)} → ${text}`);
      for (const k of ['fillPct', 'zoneStart', 'zoneEnd']) {
        if (st[k] != null) assert.ok(Number.isFinite(st[k]), `${kind} 的 ${k} 是 ${st[k]}`);
      }
    }
  }
});

/*
 * 碳水和脂肪合成一条：它们分的是同一块热量。
 *
 * 分开画两条区间最要命的一点是两条可以同时「在范围内」而总量对不上账 ——
 * 实测 2660 kcal 的计划上有 796 kcal（30%）的自由度。合起来之后
 * 要回答的问题也换了：不是「碳水够不够」，是「这块热量偏哪边」。
 */
const PLAN = { kcal: 2660, protein: 142, carb: 240, fat: 74 };
const splitAt = (carb, fat, plan = PLAN) => macroSplit(plan, { carb: { eaten: carb }, fat: { eaten: fat } });

test('参考区间由脂肪 AMDR 反解，不是随手划的一个点', () => {
  const band = referenceBand(PLAN);
  // 这块热量 = 2660 − 142×4 = 2092；脂肪吃到 35%（931 kcal）碳水占比最低
  assert.equal(band.lo, Math.floor(((2092 - 2660 * 0.35) / 2092) * 100));
  assert.equal(band.hi, Math.ceil(((2092 - 2660 * 0.20) / 2092) * 100));
  assert.ok(band.hi - band.lo >= 15, `区间该是宽泛的，实际只有 ${band.hi - band.lo} 个百分点`);

  // 取整只许放宽：四舍五入过的边界会把刚好照计划吃的人判到区间外
  assert.ok(band.lo <= ((2092 - 2660 * 0.35) / 2092) * 100);
  assert.ok(band.hi >= ((2092 - 2660 * 0.20) / 2092) * 100);

  // 蛋白高到把这块热量挤没了，就不画区间——硬给一个 0–100% 等于什么都没说
  assert.equal(referenceBand({ kcal: 2000, protein: 500 }), null);
  assert.equal(referenceBand({ kcal: 0, protein: 0 }), null);
});

test('两个百分比凑成 100，落在区间里叫「结构适中」', () => {
  const onPlan = splitAt(240, 74);
  assert.equal(onPlan.carbPct + onPlan.fatPct, 100);
  assert.equal(onPlan.carbPct, 59);
  assert.equal(onPlan.structure, 'balanced');
  assert.equal(onPlan.label, '结构适中');
  assert.equal(onPlan.level, LEVEL.met);
  assert.equal(onPlan.carbG, 240);
  assert.equal(onPlan.fatG, 74);

  assert.equal(splitAt(400, 30).structure, 'carb');
  assert.equal(splitAt(400, 30).label, '偏碳水');
  assert.equal(splitAt(120, 110).structure, 'fat');
  assert.equal(splitAt(120, 110).label, '偏脂肪');

  /*
   * 偏一点不是错误：只有绿和灰，没有橙也没有红。
   * 三大营养素怎么分本来就有很宽的合理区间，把「今天多吃了米饭」
   * 画成警告色，是把偏好问题说成健康问题。
   */
  for (const s of [splitAt(400, 30), splitAt(120, 110), splitAt(40, 10)]) {
    assert.ok([LEVEL.plain, LEVEL.met].includes(s.level), `结构偏移不该是警告色：${s.level}`);
  }

  // 凑整不能凑出 58% : 43% 这种加起来不是 100 的数
  for (let carb = 0; carb <= 400; carb += 7) {
    for (let fat = 1; fat <= 140; fat += 11) {
      const s = splitAt(carb, fat);
      assert.equal(s.carbPct + s.fatPct, 100, `${carb}g/${fat}g 的两段加起来不是 100`);
    }
  }
});

/*
 * 早饭一碗粥就判「偏碳水」，说的是那一顿，不是这一天。
 */
test('当天吃得还不多时只报比例，不下结构结论', () => {
  const early = splitAt(40, 10);
  assert.equal(early.structure, 'low');
  assert.equal(early.carbPct, 64, '比例照样算得出来，只是不下结论');
  assert.doesNotMatch(early.label, /偏|适中/, `吃得还不多就判了结构：${early.label}`);
  assert.ok(early.kcal < MIN_SPLIT_KCAL || early.kcal < 2092 * MIN_SPLIT_SHARE);

  // 吃够了就正常评价
  assert.equal(splitAt(240, 74).structure, 'balanced');
});

test('一口没吃时不硬凑一个比例出来', () => {
  const s = splitAt(0, 0);
  assert.equal(s.structure, 'none');
  assert.equal(s.carbPct, null);
  assert.equal(s.fatPct, null);
  // 参考区间还是要给：刻度上那段浅色靠它定位
  assert.equal(s.bandLo, referenceBand(PLAN).lo);
  assert.doesNotMatch(s.label, /偏/, `没记录时不该判结构：${s.label}`);
});

/*
 * 拿 AMDR 的 45%~65% 当碳水靶子会自相矛盾：高蛋白减脂档蛋白就占掉四成供能，
 * 照方案吃到的碳水远在 45% 供能以下，卡片会对着照方案吃的人写「低于建议 108g」。
 *
 * 现在区间说的是「碳水占**这块热量**的几成」，两端由脂肪 AMDR 反解，
 * 和总热量解耦。下面这条扫遍 2880 种档案，锁住的正是那件事不会再发生：
 * **照着这个应用自己开的方案吃，永远不会被它判成偏。**
 */
test('照着方案吃的人不会被判成偏碳水或偏脂肪', () => {
  const offenders = [];
  for (const sex of ['male', 'female']) {
    for (const weightKg of [45, 55, 65, 75, 90, 110]) {
      for (const heightCm of [150, 165, 180, 195]) {
        for (const activity of ['sedentary', 'light', 'moderate', 'active', 'athlete']) {
          for (const goal of ['cut', 'maintain', 'bulk']) {
            for (const bodyFatPct of [null, 12, 25, 40]) {
              const t = dailyTargets({ sex, age: 30, weightKg, heightCm, activity, goal, bodyFatPct });
              const s = macroSplit(t, { carb: { eaten: t.carb }, fat: { eaten: t.fat } });
              if (s.structure !== 'balanced' && s.structure !== 'low') {
                offenders.push(`${sex}/${weightKg}kg/${activity}/${goal}/bf=${bodyFatPct}`
                  + ` → ${s.carbPct}% 不在 ${s.bandLo}–${s.bandHi}%（${s.label}）`);
              }
            }
          }
        }
      }
    }
  }
  assert.deepEqual(offenders.slice(0, 5), [], `照方案吃却被判偏的档案有 ${offenders.length} 种`);
});
