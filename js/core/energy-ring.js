/**
 * 热量圆环：一圈里说清「吃了多少、烧了多少、计划留了多少」。
 *
 * ## 圆周就是今日热量目标
 *
 * 目标 = 预计全天消耗 + 计划盈余（减脂时是负的，那就是计划赤字）。
 * 圈里那个数是 `目标 − 已摄入`：还能吃多少。吃过头就翻成「盈余」。
 *
 * ## 四段，按「已经发生了多少」由实到虚
 *
 *   已摄入   0 → 已摄入                实心
 *   缺口     已摄入 → 当前消耗          半透明（只在吃得比烧的少时有）
 *   未到达   两者较大的那个 → 预计全天   最淡
 *   盈余段   预计全天 → 目标            虚线纹理
 *
 * 密度递减和「越实越是已经发生」对齐。盈余段用纹理而不是第四级明度：
 * 那是计划里主动给的额度，和「欠着的」性质不同，再降一档只会和缺口打架。
 *
 * ## 两条刻度线，各带一个外圈文字
 *
 * 长实线是**当前消耗**（设备到此刻的静息 + 活动，直接相加，不外推），
 * 短淡线是**预计全天消耗**。两条之间的距离就是「今天接下来还会再烧掉多少」。
 * 贴太近时只留长的那条 —— 并排两根线读不出是两个数。
 *
 * ## 吃得比烧的多时，多出来的溢到外圈细轨
 *
 * 单色没有第二个色相来表达「缺口翻成了盈余」，改用位置：
 * 从当前消耗那条刻度线到已摄入这一段，在主环外面再画一条细弧。
 * 主环那一圈仍然只讲「今天走到哪儿了」。
 *
 * 这个模块只算长度和位置，不碰 DOM；画在 lib/charts.js 里。
 */

/** 各段的语义。界面上的图例直接用这里的措辞，别再拼第二份 */
export const SEGMENT_META = Object.freeze({
  eaten: { label: '已摄入', tone: 'solid' },
  gap: { label: '缺口', tone: 'mid' },
  ahead: { label: '未到达', tone: 'faint' },
  plan: { label: '盈余段', tone: 'dashed' },
  deficit: { label: '赤字段', tone: 'dashed' },
});

/* 两条刻度靠得比这还近就只留长的那条（占圆周的百分比） */
const TICK_MERGE_PCT = 3;

/*
 * `Number(null)` 是 0，而 `Number.isFinite(0)` 是 true —— 光用 isFinite 过滤，
 * 「没有设备数据」会被读成「消耗是 0」，主环上就凭空多出一条刻度线。
 * 所以先把 null / undefined / 空串挡掉再转数字。
 */
const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const pos = (v) => (n(v) != null && n(v) > 0 ? n(v) : null);

/**
 * 算出这一圈该怎么画。
 *
 * @param {object} input
 *   eaten     已摄入 kcal
 *   target    今日热量目标 —— 圆周就是它
 *   burned    当前消耗（设备到此刻的静息 + 活动）。没有设备数据时传 null
 *   projected 预计全天消耗。没有时传 null
 */
export function energyRing({
  eaten = 0, target = 0, burned = null, projected = null,
} = {}) {
  const ate = Math.max(0, n(eaten) || 0);
  const goal = pos(target);
  /*
   * 当前消耗允许是 0（早上刚起来，设备还没记到任何东西），
   * 所以这里不能用 pos() —— 0 和「没有设备数据」是两回事。
   */
  const burnRaw = n(burned);
  const burn = burnRaw != null && burnRaw >= 0 ? burnRaw : null;
  const plan = pos(projected);

  /*
   * 圆周就是目标。但目标不能装下全部时得让位 —— 吃过头了还按目标画，
   * 实心弧会转出圈外；预计消耗大于目标（减脂计划）时刻度线同理。
   */
  const scale = Math.max(goal || 0, ate, burn || 0, plan || 0, 1);
  const pct = (v) => Math.max(0, Math.min(100, ((v || 0) / scale) * 100));

  const segments = [];
  const push = (key, from, to) => {
    if (!(to > from + 0.5)) return;   // 半千卡以内画不出来，也没意义
    const meta = SEGMENT_META[key];
    segments.push({
      key,
      fromPct: pct(from),
      toPct: pct(to),
      kcal: Math.round(to - from),
      label: meta.label,
      tone: meta.tone,
    });
  };

  push('eaten', 0, ate);
  if (burn != null) push('gap', ate, burn);
  const reached = Math.max(ate, burn ?? 0);
  if (plan != null) push('ahead', reached, plan);
  else if (goal != null) push('ahead', reached, goal);

  /*
   * 计划段：预计全天消耗和目标之间那一截。
   * 目标更大 = 计划里主动多给的盈余；目标更小 = 计划里主动扣掉的赤字。
   * 两种都是「计划做的事」，不是「今天欠的」，共用虚线纹理。
   */
  if (goal != null && plan != null && Math.abs(goal - plan) > 0.5) {
    const key = goal > plan ? 'plan' : 'deficit';
    push(key, Math.min(goal, plan), Math.max(goal, plan));
  }

  /*
   * 刻度。落在圆周尽头的不画 —— 那只是「这一圈到此为止」，什么也没多说。
   * 外圈那两行字就挂在这上面，所以 label 在这里一并给出。
   */
  const ticks = [];
  const atEnd = (v) => pct(v) >= 99.5;
  if (burn != null && !atEnd(burn)) {
    ticks.push({
      key: 'burned', pct: pct(burn), kcal: Math.round(burn),
      label: '消耗', strong: true,
    });
  }
  if (plan != null && !atEnd(plan)
    && (burn == null || Math.abs(pct(plan) - pct(burn)) >= TICK_MERGE_PCT)) {
    ticks.push({
      key: 'projected', pct: pct(plan), kcal: Math.round(plan),
      label: '全天', strong: false,
    });
  }

  /* 吃得比烧的多：从消耗那条线到已摄入这一段，画在主环外面 */
  const over = burn != null && ate > burn ? Math.round(ate - burn) : 0;

  const remaining = goal != null ? Math.round(goal - ate) : null;
  return {
    scale,
    segments,
    ticks,
    overflow: over > 0 ? { fromPct: pct(burn), toPct: pct(ate), kcal: over } : null,
    eaten: Math.round(ate),
    burned: burn != null ? Math.round(burn) : null,
    projected: plan != null ? Math.round(plan) : null,
    target: goal != null ? Math.round(goal) : null,
    /* 圈里那个数。吃过头就翻成「盈余」，别再写一个负的余量 */
    center: remaining == null ? null : {
      kcal: Math.abs(remaining),
      label: remaining < 0 ? '盈余 kcal' : '余量 kcal',
      over: remaining < 0,
    },
    remaining,
    gap: burn != null && burn > ate ? Math.round(burn - ate) : 0,
    surplus: over,
    hasBurn: burn != null,
  };
}

/**
 * 图例：只列这一圈真的画出来的段。
 *
 * 全量列四条的话，没有设备数据的人会看到两条永远不出现的图例，
 * 而他最需要知道的恰恰是「为什么这里少了东西」。
 */
export function ringLegend(model) {
  const seen = new Set();
  const out = [];
  for (const seg of model?.segments || []) {
    if (seen.has(seg.key)) continue;
    seen.add(seg.key);
    out.push({ key: seg.key, label: seg.label, tone: seg.tone });
  }
  // 溢出走的是外圈细轨，图例也画成细的 —— 和「已摄入」共用实心块会分不出
  if (model?.overflow) out.push({ key: 'over', label: '超出消耗', tone: 'thin' });
  return out;
}
