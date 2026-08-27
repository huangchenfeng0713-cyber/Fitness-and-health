import test from 'node:test';
import assert from 'node:assert/strict';
import { healthInsights, healthSummary, weightTrendStats } from '../js/core/health-insights.js';

const mkDaysFrom = (start, n, fn) => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10),
  ...fn(i),
}));
const mkDays = (n, fn) => mkDaysFrom('2026-08-01', n, fn);

const titles = (r) => r.map((x) => x.title).join(' | ');
const byKey = (r, k) => r.find((x) => x.key === k);

test('数据不足时只给一条说明，不瞎解读', () => {
  const r = healthInsights([{ date: '2026-08-01', steps: 100 }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].key, 'nodata');
});

test('所有文案都不含未展开的字符串拼接或模板残留', () => {
  const r = healthInsights(mkDays(14, (i) => ({
    steps: 4000 + i * 40, activeEnergy: 300 + (i % 3) * 280, exerciseMinutes: i % 3 ? 5 : 25,
    sleepMinutes: 360 + (i % 4) * 35, restingHR: 72 + i * 0.2,
    weightKg: 73 - i * 0.09, bodyFatPct: 20 - i * 0.03,
  })), { targets: { rateKgPerWeek: -0.5, kcal: 1800 } });
  assert.ok(r.length >= 5, `只产出了 ${r.length} 条`);
  for (const item of r) {
    for (const field of [item.title, item.text]) {
      assert.ok(!/\+ '|' \+|\$\{|\[object/.test(field), `文案里有拼接残留：${field}`);
      assert.ok(!/undefined|NaN|null/.test(field), `文案里有空值：${field}`);
      assert.ok(field.length > 2, '文案为空');
    }
    assert.ok(['good', 'info', 'warn', 'bad'].includes(item.level), `未知等级 ${item.level}`);
    assert.ok(item.key, '缺 key');
  }
});

test('步数分档使用谨慎的参考表述，不把步数等同久坐或健康结论', () => {
  const at = (v) => healthInsights(mkDays(10, () => ({ steps: v })));
  assert.equal(byKey(at(3000), 'steps').level, 'warn');
  assert.equal(byKey(at(6000), 'steps').level, 'info');
  assert.equal(byKey(at(9000), 'steps').level, 'good');
  assert.match(byKey(at(3000), 'steps').text, /不能单独代表/);
  assert.match(byKey(at(9000), 'steps').text, /不能替代/);
});

test('运动量按 WHO 每周 150 分钟判定', () => {
  const low = healthInsights(mkDays(10, () => ({ exerciseMinutes: 10 })));
  const ok = healthInsights(mkDays(10, () => ({ exerciseMinutes: 30 })));
  assert.equal(byKey(low, 'exercise').level, 'warn');
  assert.match(byKey(low, 'exercise').title, /70 分钟/);
  assert.equal(byKey(ok, 'exercise').level, 'good');
});

test('周运动量按日历跨度折算，并把明确的零运动日计为 0', () => {
  const days = mkDays(14, (i) => ({
    steps: 7000,
    exerciseMinutes: i === 2 || i === 9 ? 75 : 0,
  }));
  const hit = byKey(healthInsights(days), 'exercise');
  assert.equal(hit.metric, 75, '14 天共 150 分钟应折算为每周 75 分钟');
  assert.equal(hit.level, 'warn');
  assert.equal(healthSummary(days).exerciseMinutes, 11, '摘要日均也应包含零运动日');
});

test('日历数据大面积缺测时不把缺测日当作零运动日下结论', () => {
  const sparse = [
    { date: '2026-08-01', exerciseMinutes: 60 },
    { date: '2026-08-07', exerciseMinutes: 60 },
    { date: '2026-08-14', exerciseMinutes: 60 },
  ];
  assert.equal(byKey(healthInsights(sparse), 'exercise'), undefined);
  assert.equal(healthSummary(sparse).exerciseMinutes, null);
});

test('有其它健康数据但缺运动字段时，也不能把缺测日补成零', () => {
  const partial = mkDays(14, (i) => ({
    steps: 7000,
    ...(i === 2 || i === 9 ? { exerciseMinutes: 75 } : {}),
  }));
  assert.equal(byKey(healthInsights(partial), 'exercise'), undefined);
  assert.equal(healthSummary(partial).exerciseMinutes, null);
});

test('睡眠分档只描述睡眠时长波动，不推断作息规律性', () => {
  const bad = healthInsights(mkDays(10, () => ({ sleepMinutes: 5.5 * 60 })));
  assert.equal(byKey(bad, 'sleep').level, 'bad');
  const irregular = healthInsights(mkDays(10, (i) => ({ sleepMinutes: (i % 2 ? 5.5 : 9.5) * 60 })));
  assert.ok(/波动/.test(titles(irregular)), `未识别睡眠时长波动：${titles(irregular)}`);
  assert.doesNotMatch(irregular.map((x) => x.text).join(' | '), /作息不规律|比较规律/);
  assert.match(byKey(irregular, 'sleep_var').text, /不能代表入睡或起床时间/);
});

test('减重过快会被拦下（>1% 体重/周）', () => {
  const fast = healthInsights(
    mkDays(14, (i) => ({ weightKg: 70 - i * 0.2 })),   // -1.4 kg/周 ≈ 2%
    { targets: { rateKgPerWeek: -0.5 } },
  );
  const w = byKey(fast, 'weight');
  assert.equal(w.level, 'warn');
  assert.match(w.text, /肌肉/);
});

test('体重趋势同时要求足够点数与至少 7 天首末间隔', () => {
  const crowded = mkDays(4, (i) => ({ weightKg: 70 - i * 0.3 }));
  assert.equal(weightTrendStats(crowded, 30, '2026-08-24').kgPerWeek, null);
  assert.equal(byKey(healthInsights(crowded, { asOfDate: '2026-08-24' }), 'weight'), undefined,
    '四次称重挤在四天里不应外推成每周趋势');

  const spread = [
    { date: '2026-08-01', weightKg: 70 },
    { date: '2026-08-03', weightKg: 69.9 },
    { date: '2026-08-06', weightKg: 69.7 },
    { date: '2026-08-09', weightKg: 69.6 },
  ];
  const stats = weightTrendStats(spread, 30, '2026-08-24');
  assert.equal(stats.records, 4);
  assert.equal(stats.elapsedDays, 8);
  assert.ok(stats.kgPerWeek < 0);
});

test('体脂和静息心率不足一周时不外推每周趋势', () => {
  const short = mkDays(6, (i) => ({
    restingHR: 60 + i * 2,
    bodyFatPct: 20 + i * 0.3,
    weightKg: 70,
  }));
  const result = healthInsights(short, { windowDays: 14 });
  assert.equal(byKey(result, 'bodyfat'), undefined);
  assert.doesNotMatch(byKey(result, 'rhr')?.title || '', /近期上升/);
});

test('体重趋势偏离目标但不足 28 天时不贸然调整热量', () => {
  const wrong = healthInsights(
    mkDays(14, (i) => ({ weightKg: 70 + i * 0.05 })),  // 在涨，但目标是减
    { targets: { rateKgPerWeek: -0.5 } },
  );
  const w = byKey(wrong, 'weight');
  assert.equal(w.level, 'warn');
  assert.match(w.text, /至少积累 28 天/);
  assert.doesNotMatch(w.text, /调整约 [+-]?\d+ kcal/);
});

test('至少 28 天后才按实际与目标差值建议热量调整，且单次不超过 ±250 kcal', () => {
  const wrong = healthInsights(
    mkDaysFrom('2026-06-01', 35, (i) => ({ weightKg: 70 + i * 0.05 })),
    { targets: { rateKgPerWeek: -0.5 }, windowDays: 35 },
  );
  const w = byKey(wrong, 'weight');
  assert.equal(w.level, 'warn');
  assert.match(w.text, /基于 35 个日历日/);
  assert.match(w.text, /调整约 -250 kcal/);
  assert.match(w.text, /单次最多 ±250 kcal/);
});

test('体重实际趋势和目标同方向但差值超出容差时仍会提醒', () => {
  const slow = healthInsights(
    mkDays(14, (i) => ({ weightKg: 70 - i * 0.02 })), // -0.14 kg/周，明显慢于 -0.5
    { targets: { rateKgPerWeek: -0.5 } },
  );
  const w = byKey(slow, 'weight');
  assert.equal(w.level, 'warn');
  assert.match(w.title, /偏离目标/);
  assert.match(w.text, /观察容差/);
});

test('体重与目标一致时给正反馈', () => {
  const good = healthInsights(
    mkDays(14, (i) => ({ weightKg: 70 - i * 0.07 })),  // ≈ -0.5 kg/周
    { targets: { rateKgPerWeek: -0.5 } },
  );
  assert.equal(byKey(good, 'weight').level, 'good');
});

test('静息心率持续上升会提醒', () => {
  const rising = healthInsights(mkDays(14, (i) => ({ restingHR: 60 + i * 0.4 })));
  assert.equal(byKey(rising, 'rhr').level, 'warn');
  assert.match(byKey(rising, 'rhr').title, /上升/);
  assert.match(byKey(rising, 'rhr').text, /可能|不能只凭趋势/);
});

test('体脂结论必须结合体重，并提示 BIA 的测量局限', () => {
  const together = healthInsights(mkDays(14, (i) => ({
    weightKg: 70 - i * 0.06,
    bodyFatPct: 22 - i * 0.04,
  })));
  const bf = byKey(together, 'bodyfat');
  assert.equal(bf.level, 'info');
  assert.match(bf.text, /体重趋势和体脂读数同时下降/);
  assert.match(bf.text, /不能据此断定/);
  assert.match(bf.text, /BIA/);
  assert.doesNotMatch(bf.text, /减的主要是脂肪，方向是对的/);
});

test('体重与体脂方向不一致时不武断判断肌肉流失', () => {
  const conflict = healthInsights(mkDays(14, (i) => ({
    weightKg: 70 - i * 0.06,
    bodyFatPct: 20 + i * 0.04,
  })));
  const bf = byKey(conflict, 'bodyfat');
  assert.match(bf.text, /方向不一致/);
  assert.match(bf.text, /不能据此判断肌肉流失/);
  assert.doesNotMatch(bf.text, /通常意味着肌肉在流失/);
});

test('饮食记录太少会提醒（否则收支算不准）', () => {
  const r = healthInsights(mkDays(14, () => ({ steps: 8000 })), { dietDaily: [] });
  assert.ok(byKey(r, 'logging'), '应提醒补记饮食');
});

test('饮食记得够全就不再唠叨', () => {
  const days = mkDays(14, () => ({ steps: 8000 }));
  const r = healthInsights(days, { dietDaily: days.map((d) => ({ date: d.date, kcal: 1800 })) });
  assert.equal(byKey(r, 'logging'), undefined);
});

test('饮食覆盖提示使用所选日历窗口，不把“健康记录日数”冒充天数', () => {
  const health = [
    { date: '2026-08-01', steps: 8000 },
    { date: '2026-08-10', steps: 8000 },
    { date: '2026-08-20', steps: 8000 },
  ];
  const diet = [
    { date: '2026-08-02', kcal: 1800 },
    { date: '2026-08-03', kcal: 1900 },
  ];
  const hit = byKey(healthInsights(health, {
    dietDaily: diet, windowDays: 30, asOfDate: '2026-08-24',
  }), 'logging');
  assert.match(hit.title, /近 30 天饮食仅记录 2 天/);
  assert.match(hit.text, /健康数据覆盖 3 天/);
  assert.match(hit.text, /同一天齐全 0 天/);
});

test('摘要指标取近窗口均值', () => {
  const s = healthSummary(mkDays(14, () => ({ steps: 8000, sleepMinutes: 450, weightKg: 70 })));
  assert.equal(s.steps, 8000);
  assert.equal(s.sleepHours, 7.5);
  assert.equal(s.weightKg, 70);
  assert.equal(s.restingHR, null, '没有的数据应为 null 而不是 0');
});

test('明确记录的零步数和零活动参与平均，缺失字段才跳过', () => {
  const days = [
    { date: '2026-08-01', steps: 0, activeEnergy: 0 },
    { date: '2026-08-02', steps: 100, activeEnergy: 0 },
    { date: '2026-08-03', steps: 200, activeEnergy: 300 },
    { date: '2026-08-04', weightKg: 70 },
  ];
  const summary = healthSummary(days, 14, '2026-08-04');
  assert.equal(summary.steps, 100);
  assert.equal(summary.activeEnergy, 100);
});

test('窗口先按日期排序，并以截止日期取日历窗口', () => {
  const shuffled = [
    { date: '2026-08-10', steps: 10000 },
    { date: '2026-08-08', steps: 2000 },
    { date: '2026-08-09', steps: 6000 },
    { date: '2026-08-07', steps: 500 },
  ];
  assert.equal(healthSummary(shuffled, 2).steps, 8000, '应取 8 月 9-10 日，而不是数组末两项');
  assert.equal(healthSummary(shuffled, 2, '2026-08-09').steps, 4000, '截止 8 月 9 日应取 8-9 日');
});

test('未来数据不会进入摘要或健康解读', () => {
  const days = [
    ...mkDays(3, () => ({ steps: 6000 })),
    { date: '2099-01-01', steps: 999999, restingHR: 250 },
  ];
  const summary = healthSummary(days, 14);
  assert.equal(summary.steps, 6000);
  assert.equal(summary.restingHR, null);
  assert.equal(byKey(healthInsights(days), 'rhr'), undefined);
});

test('识别出被单位缺陷缩小过的历史能量数据', () => {
  // 早期版本把 Apple 导出的 unit="Cal"（千卡）当成小卡除以了 1000
  const broken = healthInsights(mkDays(14, () => ({ steps: 8000, activeEnergy: 0.55 })));
  const hit = byKey(broken, 'suspect_energy');
  assert.ok(hit, '没能识别出异常量级的能量数据');
  assert.equal(hit.level, 'bad');
  assert.match(hit.text, /重新导入/);
});

test('正常量级的能量数据不会被误报', () => {
  const fine = healthInsights(mkDays(14, () => ({ steps: 8000, activeEnergy: 550 })));
  assert.equal(byKey(fine, 'suspect_energy'), undefined);
});

test('真正久坐的人（步数也低）不会被误判成数据错误', () => {
  const sedentary = healthInsights(mkDays(14, () => ({ steps: 900, activeEnergy: 15 })));
  assert.equal(byKey(sedentary, 'suspect_energy'), undefined, '步数也低时应视为真实久坐，而非数据问题');
});

test('概览与解读的日均睡眠是同一个数，不会因两次取整差出 0.1 小时', () => {
  // 实测：同一页概览写 6.8 小时、下面的健康数据解读写 6.7 小时。
  // 原因是概览先把分钟均值四舍五入成整数，再除 60 又 round 一次。
  const days = [
    { date: '2026-08-20', sleepMinutes: 400 },
    { date: '2026-08-21', sleepMinutes: 409 },
    { date: '2026-08-22', sleepMinutes: 404.5 },
  ];
  const summary = healthSummary(days, 14, '2026-08-22');
  const insight = healthInsights(days, { windowDays: 14, asOfDate: '2026-08-22' })
    .find((i) => i.key === 'sleep');
  assert.equal(summary.sleepHours, insight.metric,
    `概览 ${summary.sleepHours} 小时 与解读 ${insight.metric} 小时对不上`);
  assert.equal(summary.sleepHours, 6.7);
});
