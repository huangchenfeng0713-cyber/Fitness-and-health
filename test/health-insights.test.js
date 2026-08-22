import test from 'node:test';
import assert from 'node:assert/strict';
import { healthInsights, healthSummary } from '../js/core/health-insights.js';

const mkDays = (n, fn) => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10),
  ...fn(i),
}));

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

test('步数分档：久坐 / 中间 / 达标', () => {
  const at = (v) => healthInsights(mkDays(10, () => ({ steps: v })));
  assert.equal(byKey(at(3000), 'steps').level, 'warn');
  assert.equal(byKey(at(6000), 'steps').level, 'info');
  assert.equal(byKey(at(9000), 'steps').level, 'good');
});

test('运动量按 WHO 每周 150 分钟判定', () => {
  const low = healthInsights(mkDays(10, () => ({ exerciseMinutes: 10 })));
  const ok = healthInsights(mkDays(10, () => ({ exerciseMinutes: 30 })));
  assert.equal(byKey(low, 'exercise').level, 'warn');
  assert.match(byKey(low, 'exercise').title, /70 分钟/);
  assert.equal(byKey(ok, 'exercise').level, 'good');
});

test('睡眠分档，且能识别作息不规律', () => {
  const bad = healthInsights(mkDays(10, () => ({ sleepMinutes: 5.5 * 60 })));
  assert.equal(byKey(bad, 'sleep').level, 'bad');
  const irregular = healthInsights(mkDays(10, (i) => ({ sleepMinutes: (i % 2 ? 5.5 : 9.5) * 60 })));
  assert.ok(/波动/.test(titles(irregular)), `未识别作息不规律：${titles(irregular)}`);
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

test('体重趋势与目标相反时给出具体的热量调整建议', () => {
  const wrong = healthInsights(
    mkDays(14, (i) => ({ weightKg: 70 + i * 0.05 })),  // 在涨，但目标是减
    { targets: { rateKgPerWeek: -0.5 } },
  );
  const w = byKey(wrong, 'weight');
  assert.equal(w.level, 'warn');
  assert.match(w.text, /调整约 [+-]?\d+ kcal/);
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

test('摘要指标取近窗口均值', () => {
  const s = healthSummary(mkDays(14, () => ({ steps: 8000, sleepMinutes: 450, weightKg: 70 })));
  assert.equal(s.steps, 8000);
  assert.equal(s.sleepHours, 7.5);
  assert.equal(s.weightKg, 70);
  assert.equal(s.restingHR, null, '没有的数据应为 null 而不是 0');
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
