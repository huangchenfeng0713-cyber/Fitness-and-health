/**
 * 最小二乘斜率，**以及这条斜率有多不确定**。
 *
 * 最小二乘本身在这个仓库里写过两遍：`health-insights.js` 的 `slopePerDay`
 * 和 `health.js` 的 `computeBaseline` 里手抄的一段 —— 逐行几乎一样，
 * 门槛还不同（一个 ≥3 点，一个 ≥4 点且跨 7 天）。收进这里一份。
 *
 * 真正新加的是**标准误**，它补的是这个应用在别处一直守着、唯独体重这一处
 * 没落实的那条纪律：宁可显示数据不足，不显示假精度。
 * 数据页体重图下面那句「比目标快 0.32 kg/周」，4 次称重和 30 次称重
 * 说出来的口气一模一样 —— 而体重的日常波动（水分、糖原、肠内容物）
 * 本来就有近一公斤量级，4 个点拟合出来的那 0.32 很可能整个都是噪声。
 * 现有的把关只有一道二值闸（≥4 次且跨 7 天），过了就用确定语气说话。
 *
 * 标准误从**残差**算，不预设一个噪声水平：
 *
 *     SE(斜率) = sqrt( Σ残差² / (n−2) ) / sqrt( Σ(x−x̄)² )
 *
 * 这样「点太少」「跨度太短」「秤上数字本来就跳」三件事会一起落进同一个数，
 * 不用为它们各设一道阈值。`n − 2` 是自由度，所以至少要三个点。
 *
 * 纯函数、不认日期：调用方自己把日期换成天序号。这样它既不依赖 `core/day.js`，
 * 也不会和 `health.js` / `health-insights.js` 互相 import 成环。
 */

/**
 * @param {Array<{x:number,y:number}>} points x 是天序号，y 是测量值
 * @returns {{perDay:number, stdErrPerDay:number, n:number}|null}
 */
export function linearFit(points = []) {
  const pts = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  // 所有样本落在同一天：给不出斜率，也不该硬给一个 0
  if (!(den > 0)) return null;
  const perDay = num / den;
  const intercept = my - perDay * mx;
  let sse = 0;
  for (const p of pts) {
    const resid = p.y - (intercept + perDay * p.x);
    sse += resid * resid;
  }
  return { perDay, stdErrPerDay: Math.sqrt(sse / (n - 2)) / Math.sqrt(den), n };
}

/**
 * 换算成「每周」，并按界面显示体重的精度取整。
 *
 * 取整之后再比大小：**用户看到的数和程序据以下结论的数必须是同一个**，
 * 否则会出现「写着 ±0.21、却说 0.21 分辨得出来」这种自相矛盾。
 */
export function weeklyTrend(points = []) {
  const fit = linearFit(points);
  if (!fit) return null;
  const round2 = (v) => Math.round(v * 100) / 100;
  return { perWeek: round2(fit.perDay * 7), stdErrPerWeek: round2(fit.stdErrPerDay * 7), n: fit.n };
}
