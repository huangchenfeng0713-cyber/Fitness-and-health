/**
 * 热量圆环：吃了多少、烧了多少，两条弧一眼比出来。
 *
 * ## 为什么不是「一圈切成四段」
 *
 * 上一版把一个圆环切成四段（已摄入 / 缺口 / 未到达 / 盈余段），靠同一个绿的
 * 三个密度加一层虚线纹理来区分。在「已经吃了八成」那张图上它是好看的 ——
 * 一条又长又实的弧把视线锚住，后面几段依次变淡，读得出层次。
 *
 * 但**打开应用最常见的状态是还没吃**。摄入为 0 时那条实心弧根本不存在，
 * 整圈只剩三层几乎一样的淡绿，没有任何参照物：既看不出从哪儿开始，
 * 也分不出哪段是哪段。一个只在数据好看时才好看的图，是不能用的图。
 *
 * ## 现在的结构
 *
 * 两条同心弧，同一个起点、同一把尺子：
 *
 *   外环（粗）= 摄入      实心，从十二点开始走
 *   内环（细）= 消耗      中密度实心走到「此刻」，再用最淡的一段延伸到「预计全天」
 *
 * **两条弧的长度差就是缺口**，不用图例也读得出来 —— 谁长谁短是位置关系，
 * 而位置是不需要解释的。摄入为 0 时外环空着、内环有长度，一眼就是
 * 「今天烧了不少，还一口没吃」。这正是上一版读不出来的那个状态。
 *
 * 目标不画成第四段，画成外环上的一个刻度。它和内环延伸端之间的距离
 * 就是计划盈余（或赤字），要具体数值时右边那几行写着。
 *
 * 这个模块只算长度和位置，不碰 DOM；画在 lib/charts.js 里。
 */

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const pos = (v) => (n(v) != null && n(v) > 0 ? n(v) : null);

/**
 * 算出这一圈该怎么画。
 *
 * @param {object} input
 *   eaten     已摄入 kcal
 *   target    今日热量目标（计划）
 *   burned    当前消耗（设备累计到此刻）。没有设备数据时传 null
 *   projected 预计全天消耗。没有时传 null
 * @returns {{
 *   scale, intake, burn, ahead, targetTick,
 *   remaining, gap, surplus, hasBurn, planDelta
 * }}
 *   scale       圆周对应多少 kcal
 *   intake      外环那条实心弧 { pct, kcal }
 *   burn        内环那条实心弧 { pct, kcal }，没有设备数据时为 null
 *   ahead       内环从「此刻」延伸到「预计全天」的那一小段，可能为 null
 *   targetTick  外环上的目标刻度；目标就是圆周尽头时为 null（画了也只是「到此为止」）
 */
export function energyRing({
  eaten = 0, target = 0, burned = null, projected = null,
} = {}) {
  const ate = Math.max(0, n(eaten) || 0);
  const goal = pos(target);
  const burn = pos(burned);
  // 没有设备数据时预计消耗也无从谈起，内环整条不画
  const plan = burn != null ? (pos(projected) ?? burn) : null;

  /*
   * 圆周取几个数里最大的那个。
   *
   * 不能固定按目标：减脂计划里预计消耗本来就大于目标，内环会画到圈外；
   * 也不能固定按消耗：增重计划里目标更大，目标刻度就没地方落。
   */
  const scale = Math.max(ate, goal || 0, burn || 0, plan || 0, 1);
  const pct = (v) => Math.max(0, Math.min(100, ((v || 0) / scale) * 100));
  const at = (v) => (v == null ? null : { pct: pct(v), kcal: Math.round(v) });

  /* 目标落在圆周尽头时不画刻度：那只是「这一圈到此为止」，什么也没多说 */
  const goalAtEnd = goal == null || pct(goal) >= 99.5;

  return {
    scale,
    intake: { pct: pct(ate), kcal: Math.round(ate) },
    burn: at(burn),
    // 只有当预计消耗确实比此刻更远时才有这一段
    ahead: plan != null && burn != null && plan > burn + 0.5
      ? { fromPct: pct(burn), pct: pct(plan), kcal: Math.round(plan - burn) }
      : null,
    targetTick: goalAtEnd ? null : at(goal),

    eaten: Math.round(ate),
    burned: burn != null ? Math.round(burn) : null,
    projected: plan != null ? Math.round(plan) : null,
    target: goal != null ? Math.round(goal) : null,
    remaining: goal != null ? Math.round(goal - ate) : null,
    /* 今天实际欠着多少 / 超出多少 —— 就是两条弧的长度差 */
    gap: burn != null && burn > ate ? Math.round(burn - ate) : 0,
    surplus: burn != null && ate > burn ? Math.round(ate - burn) : 0,
    /* 计划里主动给的额度：目标和预计全天消耗之间那一截 */
    planDelta: goal != null && plan != null ? Math.round(goal - plan) : null,
    hasBurn: burn != null,
  };
}
