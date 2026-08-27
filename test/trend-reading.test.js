import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSeries, trendReading, MIN_POINTS_FOR_TREND, MIN_POINTS_FOR_CLAIM,
} from '../js/core/trend-reading.js';

const pts = (...ys) => ys.map((y, i) => ({ x: `2026-08-${String(i + 1).padStart(2, '0')}`, y }));

test('analyzeSeries 给出均值、极值与前后半段的漂移', () => {
  const s = analyzeSeries(pts(100, 100, 200, 200));
  assert.equal(s.n, 4);
  assert.equal(s.avg, 150);
  assert.equal(s.min, 100);
  assert.equal(s.max, 200);
  assert.equal(s.spread, 100);
  // 前半 100、后半 200
  assert.equal(s.drift, 100);
  assert.equal(s.enoughForTrend, true);
});

test('drift 用前后半段均值而不是首尾两点，单个离群值不会主导结论', () => {
  // 最后一天是个 900 的离群值：首尾直接相减是 +400，前后半段只有 +107
  const ys = [500, 480, 460, 440, 420, 900];
  const naive = ys[ys.length - 1] - ys[0];
  const s = analyzeSeries(pts(...ys));
  assert.ok(Math.abs(s.drift) < Math.abs(naive) / 2,
    `离群值仍主导了漂移：drift=${s.drift}，首尾差=${naive}`);
});

test('样本不足时 analyzeSeries 不声称有趋势', () => {
  for (let n = 1; n < MIN_POINTS_FOR_TREND; n += 1) {
    const s = analyzeSeries(pts(...Array(n).fill(2000)));
    assert.equal(s.enoughForTrend, false, `${n} 个点不应判定为可看趋势`);
  }
  assert.equal(analyzeSeries([]), null);
});

test('漏记的日子不是 0：null 会被剔掉而不是当成零', () => {
  // Number(null) === 0，直接转数字会把没记录的那天算成「吃了 0 kcal」，
  // 平均值凭空掉一大截——这条口径全应用一致。
  assert.equal(analyzeSeries([{ x: 'a', y: null }]), null);
  const s = analyzeSeries([{ x: 'a', y: 2000 }, { x: 'b', y: null }, { x: 'c', y: 2200 }]);
  assert.equal(s.n, 2);
  assert.equal(s.avg, 2100);
  assert.equal(s.min, 2000);
});

test('空序列给出「怎么才能有数据」而不是硬凑结论', () => {
  for (const metric of ['kcal', 'protein', 'weight', 'active', 'sleep', 'restingHR', 'balance']) {
    const text = trendReading(metric, [], { target: 2000, threshold: 100 });
    assert.ok(text.length > 8, `${metric} 的空态文案太短`);
    assert.ok(!/NaN|undefined|null/.test(text), `${metric} 空态出现了脏值：${text}`);
  }
  assert.equal(trendReading('不存在的指标', pts(1, 2, 3)), '');
});

test('热量解读报出与目标的差、超标天数与走向', () => {
  const text = trendReading('kcal', pts(2400, 2500, 2600, 2700), { target: 2000 });
  assert.match(text, /有记录的 4 天里日均 2550 kcal/);
  assert.match(text, /比目标高 550 kcal/);
  assert.match(text, /4 天超出目标 5% 以上/);
  assert.match(text, /后半段比前半段多吃约 200 kcal\/天/);
});

test('摄入偏低时只有连续多天才说「长期」', () => {
  const one = trendReading('kcal', pts(1000, 2100, 2000, 2050), { target: 2000 });
    assert.match(one, /另有 1 天不到目标的四分之三。/);
  assert.ok(!one.includes('长期'), `单日偏低不该给出长期结论：${one}`);

  const many = trendReading('kcal', pts(1000, 1100, 1200, 1300), { target: 2000 });
  assert.ok(many.includes('长期'), '连续多天偏低应给出长期警示');
});

test('蛋白解读以达标率为主，平均值不能掩盖漏掉的日子', () => {
  // 日均 100g 看着达标，实际只有一天够
  const text = trendReading('protein', pts(280, 40, 40, 40), { target: 120, threshold: 108 });
  assert.match(text, /达标 1 天/);
  assert.match(text, /达标率偏低/);
});

test('体重记录不够时说明门槛，而不是给一个假的每周变化', () => {
  const text = trendReading('weight', pts(60.02, 59.98), {
    kgPerWeek: null, goalRate: -0.5, records: 2, spanDays: 2,
  });
  // 卡片右上角写「最新 60.0 kg」，图下面这句得是同一个写法
  assert.match(text, /所选区间有 2 次记录，最新 60\.0 kg/);
  assert.match(text, /至少需要 4 次、且首末相隔 7 天/);
  assert.ok(!/kg\/周/.test(text.replace('kg/周趋势', '')) || !/拟合趋势/.test(text));
});

test('减脂掉得比目标多算「快」，不能带符号相减说成「慢」', () => {
  // 目标 -0.5、实际 -0.9：-0.9 − (-0.5) = -0.4，直接相减会说成「比目标慢」，
  // 而减脂最常见的风险恰恰是掉太快，说反了会把人推向更大的缺口。
  const fast = trendReading('weight', pts(62, 61.4, 60.8, 60.2), {
    kgPerWeek: -0.9, goalRate: -0.5, records: 4, spanDays: 14,
  });
  assert.match(fast, /拟合趋势 -0\.9 kg\/周（目标 -0\.5）/);
  assert.match(fast, /比目标快 0\.4 kg\/周/);
  assert.match(fast, /每周变化超过体重的 1%/);

  const slow = trendReading('weight', pts(62, 61.9, 61.8, 61.8), {
    kgPerWeek: -0.2, goalRate: -0.5, records: 4, spanDays: 14,
  });
  assert.match(slow, /比目标慢 0\.3 kg\/周/);

  // 增肌方向同理：目标 +0.25、实际 +0.5 也是「快」
  const bulk = trendReading('weight', pts(60, 60.3, 60.6, 61), {
    kgPerWeek: 0.5, goalRate: 0.25, records: 4, spanDays: 14,
  });
  assert.match(bulk, /比目标快 0\.25 kg\/周/);
  assert.ok(!bulk.includes('把热量缺口收小'), '增重时不该建议收小缺口');
});

test('体重往目标反方向走时直接点破，而不是报一个「慢多少」', () => {
  const text = trendReading('weight', pts(60, 60.3, 60.6, 61), {
    kgPerWeek: 0.4, goalRate: -0.5, records: 4, spanDays: 14,
  });
  assert.match(text, /方向反了：目标是减重，实际在往另一边走/);
});

test('目标是维持时不谈快慢，只说有没有稳住', () => {
  const held = trendReading('weight', pts(60, 60.05, 59.95, 60), {
    kgPerWeek: 0.02, goalRate: 0, records: 4, spanDays: 14,
  });
  assert.match(held, /目标是维持，目前基本稳住了/);
  const drift = trendReading('weight', pts(60, 60.3, 60.6, 61), {
    kgPerWeek: 0.35, goalRate: 0, records: 4, spanDays: 14,
  });
  assert.match(drift, /目标是维持，但每周涨了 0\.35 kg/);
});

test('摄入样本不足 3 天时不给「日均比目标差多少」的结论', () => {
  /*
   * 这道门槛原先在今日提示那边（buildInsights）。摄入结论搬到图下面之后，
   * 门槛也只剩这一道：记了一天就说「日均 1287 kcal，比目标低 713」，
   * 那是那一天，不是平均。
   */
  const one = trendReading('kcal', pts(1287), { target: 2000 });
  assert.match(one, /有记录的 1 天里日均 1287 kcal/);
  assert.doesNotMatch(one, /比目标[高低]/);
  assert.match(one, /再记满 2 天/);

  const enough = trendReading('kcal', pts(1287, 1300, 1400), { target: 2000 });
  assert.match(enough, /有记录的 3 天里日均 1329 kcal，比目标低 671 kcal/);
});

test('蛋白样本不足时只报天数，不下达标率的判断', () => {
  const two = trendReading('protein', pts(120, 60), { target: 120, threshold: 108 });
  assert.match(two, /有记录的 2 天里达标 1 天/);
  assert.doesNotMatch(two, /执行得不错|一半多的日子|达标率偏低/);
  assert.match(two, /再记满 1 天/);
});

test('体重解读只说趋势和快慢，不直接开热量处方', () => {
  // 两周的斜率里有一大半是水分。看着它调热量，调的多半是水。
  const text = trendReading('weight', pts(62, 61.4, 60.8, 60.2), {
    kgPerWeek: -0.9, goalRate: -0.5, records: 4, spanDays: 14,
  });
  assert.doesNotMatch(text, /调整约 [+-]?\d+ kcal|每天(多|少)吃 \d+ kcal/);
});

test('静息心率持续上升时点名可能的原因', () => {
  const up = trendReading('restingHR', pts(56, 57, 62, 64));
  assert.match(up, /日均 60 bpm，区间内 56 ~ 64 bpm/);
  assert.match(up, /持续上升常见于训练过量、睡眠不足、压力大或正在感冒/);

  const down = trendReading('restingHR', pts(66, 65, 59, 58));
  assert.match(down, /有氧能力在改善/);
});

test('静息心率的常见范围表述与解读一致', () => {
  assert.match(trendReading('restingHR', pts(88, 90, 86, 92)), /成人常见范围是 60~100/);
  assert.match(trendReading('restingHR', pts(45, 46, 44, 47)), /经常训练的人属于正常/);
});

test('热量收支样本少于 3 天时不换算成每周体重变化', () => {
  const few = trendReading('balance', pts(-1200, -1100));
  assert.ok(!few.includes('7700'), `样本不足仍在外推：${few}`);
  assert.match(few, /还不足以换算成每周的体重变化/);

  const enough = trendReading('balance', pts(-600, -500, -550));
  assert.match(enough, /按 7700 kcal\/kg 的脂肪当量换算/);
  assert.match(enough, /不等于体重一定这样变/);
  assert.ok(MIN_POINTS_FOR_CLAIM === 3);
});

test('睡眠不足时先建议稳定增加睡眠机会，而不是周末补觉', () => {
  const text = trendReading('sleep', pts(5.5, 6, 5.8, 6.2));
  assert.match(text, /明显低于成人 7~9 小时的常见建议/);
  assert.match(text, /4 天不足 6\.5 小时/);
  assert.match(text, /比周末补觉更有用/);
});

test('所有解读都不会输出脏值', () => {
  const cases = [
    ['kcal', pts(2000), { target: 0 }],
    ['protein', pts(0, 0), { target: 0, threshold: 0 }],
    ['weight', pts(60), { kgPerWeek: 0, goalRate: null, records: 1, spanDays: 1 }],
    ['active', pts(0, 0, 0)],
    ['sleep', pts(8)],
    ['restingHR', pts(60)],
    ['balance', pts(0, 0, 0)],
  ];
  for (const [metric, points, opts] of cases) {
    const text = trendReading(metric, points, opts || {});
    assert.ok(!/NaN|undefined|Infinity|\[object/.test(text), `${metric}: ${text}`);
  }
});
