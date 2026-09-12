import test from 'node:test';
import assert from 'node:assert/strict';
import { linearFit, weeklyTrend } from '../js/core/slope.js';

/*
 * 斜率本身在这个仓库里写过两遍（health-insights 的 slopePerDay、
 * computeBaseline 里手抄的一段），收进 core/slope.js 一份。
 * 这一组先把「算得对不对」钉死，再钉「不确定度」。
 */
test('最小二乘的斜率和标准误对得上手算', () => {
  // (0,0) (1,0) (2,2) (3,2)：斜率 0.8，残差 0.2/−0.6/0.6/−0.2
  // SSE = 0.8，Σ(x−x̄)² = 5，SE = sqrt(0.8/2)/sqrt(5) = 0.28284
  const fit = linearFit([[0, 0], [1, 0], [2, 2], [3, 2]].map(([x, y]) => ({ x, y })));
  assert.equal(Math.round(fit.perDay * 1e6) / 1e6, 0.8);
  assert.equal(Math.round(fit.stdErrPerDay * 1e5) / 1e5, 0.28284);
  assert.equal(fit.n, 4);
  assert.deepEqual(weeklyTrend([[0, 0], [1, 0], [2, 2], [3, 2]].map(([x, y]) => ({ x, y }))),
    { perWeek: 5.6, stdErrPerWeek: 1.98, n: 4 });
});

test('给不出斜率的时候返回 null，不硬凑一个 0', () => {
  // n−2 是自由度，两个点算不出残差，也就谈不上「这条斜率有多准」
  assert.equal(linearFit([{ x: 0, y: 1 }, { x: 1, y: 2 }]), null);
  assert.equal(linearFit([]), null);
  // 三次称重全落在同一天：Σ(x−x̄)² 为 0，斜率无从谈起
  assert.equal(linearFit([{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }]), null);
  assert.equal(weeklyTrend([{ x: 0, y: 1 }, { x: 1, y: 2 }]), null);
});

test('非有限值不进拟合，不把整条斜率带成 NaN', () => {
  const pts = [{ x: 0, y: 70 }, { x: 7, y: null }, { x: 14, y: 71 }, { x: 21, y: 72 },
    { x: NaN, y: 73 }, { x: 28, y: 72.8 }];
  const fit = linearFit(pts);
  assert.equal(fit.n, 4, 'null 和 NaN 那两条要被剔掉');
  assert.ok(Number.isFinite(fit.perDay) && Number.isFinite(fit.stdErrPerDay));
});

/*
 * 这条是整个改动的立足点：拟合越不牢靠，标准误越大。
 * 原先界面只有一道二值闸（≥4 次且跨 7 天），过了就用确定语气说话 ——
 * 4 个点和 30 个点说出来一模一样。
 *
 * **注意这里只断言站得住的两条：噪声变大、跨度缩水。**
 * 「点越少标准误越大」**不是定理** —— 标准误量的是拟合牢不牢，不是样本多少，
 * 而四个点碰巧共线时残差为 0、标准误也就是 0。第一版真按「点少 → SE 大」
 * 写了断言，用的锯齿噪声让子集恰好落在一条直线上，当场量出 0 < 0.04。
 * 那种情况下这道判据退回原来的口气（等于没变严），不是新的退化，
 * 所以不为它硬塞一个没有来历的下限。
 */
test('数字抖、跨度缩水，标准误都要跟着变大', () => {
  /*
   * 基准这组要带一点噪声，否则残差恒为 0、标准误恒为 0，下面三条断言
   * 全在拿 0 和 0 比 —— 等于什么都没量（第一版就是这么写的，当场绿着骗人）。
   * 用固定的锯齿而不是随机数：测试不该每次跑出不同的数。
   */
  const clean = [];
  for (let i = 0; i < 12; i += 1) clean.push({ x: i * 2, y: 72 + i * 0.08 + (i % 3 - 1) * 0.15 });
  const many = weeklyTrend(clean);
  assert.ok(many.stdErrPerWeek > 0, '基准组必须有非零标准误，否则下面三条比的是 0 和 0');

  // 同样的点数与跨度，但秤上数字来回跳
  const noisy = weeklyTrend(clean.map((p, i) => ({ x: p.x, y: p.y + (i % 2 ? 0.9 : -0.9) })));
  assert.ok(noisy.stdErrPerWeek > many.stdErrPerWeek,
    `数字抖起来标准误没变大：${noisy.stdErrPerWeek} vs ${many.stdErrPerWeek}`);

  // 同样的点数，全挤在几天里
  const cramped = weeklyTrend(clean.map((p, i) => ({ x: i, y: p.y })));
  assert.ok(cramped.stdErrPerWeek > many.stdErrPerWeek,
    `跨度缩水标准误没变大：${cramped.stdErrPerWeek} vs ${many.stdErrPerWeek}`);
});
