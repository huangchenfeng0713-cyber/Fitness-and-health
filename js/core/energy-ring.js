/**
 * 热量圆环：一圈里同时说清「吃了多少」「烧了多少」「计划留了多少」。
 *
 * 原先那个环只画一件事 —— 已摄入占目标的百分比，超了就整条变橙。
 * 于是「今天已经烧掉 1855、只吃了 1725」这件事在环上完全看不见，
 * 得挪到旁边的文字里读。
 *
 * 现在**区分的担子从色相移到密度和位置上**：同一个绿色给三个密度，
 * 实心是已经吃到的，半透明是欠着的缺口，最淡的是还没走到的。
 * 密度递减的顺序刚好和语义对齐 —— 越"实"就是越已经发生。
 * 不用第二个色相，也就不必再纠结「橙色到底是警告还是分类」。
 *
 * 刻度线只负责切分，不负责表达量。给两条：
 *  - 长实线 = 当前消耗（设备累计到此刻）
 *  - 短淡线 = 预计全天消耗
 * 两条之间的距离本身在回答一个原卡片完全没表达的问题：
 * 今天接下来还会再烧掉多少。
 *
 * 盈余段（计划里主动多给的额度）用**虚线纹理**而不是第四级明度：
 * 它和「还没吃到」性质不同 —— 那是计划给的，不是欠着的。
 * 纹理表达这种「另一类」比再降一档透明度更准确，也不会和缺口打架。
 *
 * 这个模块只算段落和刻度的位置，不碰 DOM；画在 lib/charts.js 里。
 */

/** 环上的段落类型。顺序就是从起点往外画的顺序 */
export const RING_SEGMENTS = Object.freeze(['eaten', 'gap', 'ahead', 'plan']);

/**
 * 各段的语义。界面上的图例直接用这里的措辞，别再拼第二份。
 *
 * `tone` 决定画法：solid / mid / faint 是同一个绿的三个密度，
 * dashed 是纹理。
 */
export const SEGMENT_META = Object.freeze({
  eaten: { label: '已摄入', tone: 'solid' },
  gap: { label: '缺口', tone: 'mid' },
  ahead: { label: '未到达', tone: 'faint' },
  plan: { label: '盈余段', tone: 'dashed' },
  deficit: { label: '赤字段', tone: 'dashed' },
});

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
 *   scale, segments, ticks, overflow, remaining, gap, surplus, hasBurn
 * }}
 *   scale     圆周对应多少 kcal
 *   segments  [{ key, from, to, fromPct, toPct, kcal, label, tone }]
 *   ticks     [{ key, at, pct, kcal, label, strong }]
 *   overflow  吃得比烧的多时，多出来的那部分（画在外圈细轨上），否则 null
 */
export function energyRing({
  eaten = 0, target = 0, burned = null, projected = null,
} = {}) {
  const ate = Math.max(0, n(eaten) || 0);
  const goal = pos(target);
  const burn = pos(burned);
  /*
   * 没有设备数据时预计消耗也无从谈起。两个都缺就退回最朴素的一圈：
   * 实心是吃了的，剩下是没吃到的 —— 和改版前一样，不会更差。
   */
  const plan = pos(projected) ?? burn;

  /*
   * 圆周取三个数里最大的那个。
   *
   * 不能固定按目标：减脂计划里预计消耗本来就大于目标，刻度线会跑到圈外；
   * 也不能固定按消耗：增重计划里目标更大，盈余段就没地方画。
   * 取最大值之后每一段都装得下，谁到了尽头谁就是圆周本身。
   */
  const scale = Math.max(ate, goal || 0, burn || 0, plan || 0, 1);
  const pct = (v) => Math.max(0, Math.min(100, (v / scale) * 100));

  const segments = [];
  const push = (key, from, to) => {
    if (!(to > from + 0.5)) return;   // 半千卡以内画不出来，也没意义
    const meta = SEGMENT_META[key];
    segments.push({
      key,
      from,
      to,
      fromPct: pct(from),
      toPct: pct(to),
      kcal: Math.round(to - from),
      label: meta.label,
      tone: meta.tone,
    });
  };

  push('eaten', 0, ate);
  if (burn != null) {
    // 吃得比烧的少：中间这段就是今天实际欠着的缺口
    push('gap', ate, burn);
    // 消耗还会往前走，这一段是「今天接下来还会烧掉的」
    push('ahead', Math.max(ate, burn), Math.max(ate, plan));
  } else {
    // 没有设备数据时，「还没吃到」直接铺到目标
    push('ahead', ate, goal || 0);
  }

  /*
   * 计划段：预计全天消耗和目标之间的那一截。
   * 目标更大 = 计划里主动多给的盈余；目标更小 = 计划里主动扣掉的赤字。
   * 两种都是「计划做的事」，不是「今天欠的」，所以共用虚线纹理。
   */
  const planEnd = plan ?? 0;
  if (goal != null && plan != null && Math.abs(goal - planEnd) > 0.5) {
    const key = goal > planEnd ? 'plan' : 'deficit';
    const meta = SEGMENT_META[key];
    const from = Math.min(goal, planEnd);
    const to = Math.max(goal, planEnd);
    segments.push({
      key,
      from,
      to,
      fromPct: pct(from),
      toPct: pct(to),
      kcal: Math.round(to - from),
      label: meta.label,
      tone: meta.tone,
    });
  }

  const ticks = [];
  /*
   * 落在圆周尽头的刻度不画。
   *
   * 没有设备数据时预计消耗就是圆周本身，那条线会正好压在十二点的
   * 起点圆点上 —— 画一条「这一圈到这儿为止」的线，什么也没多说。
   */
  const atEnd = (v) => pct(v) >= 99.5;
  if (burn != null && !atEnd(burn)) {
    ticks.push({
      key: 'burned', at: burn, pct: pct(burn), kcal: Math.round(burn),
      label: '消耗', strong: true,
    });
  }
  // 两条刻度贴太近时只留长的那条：并排两根线读不出是两个数
  if (plan != null && !atEnd(plan) && (burn == null || Math.abs(pct(plan) - pct(burn)) >= 3)) {
    ticks.push({
      key: 'projected', at: plan, pct: pct(plan), kcal: Math.round(plan),
      label: '预计', strong: false,
    });
  }

  /*
   * 吃得比烧的多。
   *
   * 双色版靠橙转绿表达这个翻转，单色版没有色相可用，改成**往外溢**：
   * 多出来的部分画在主环外面那圈细轨上。位置比颜色更直白，
   * 也不占用主环的语义 —— 主环那一圈仍然只讲「今天走到哪儿了」。
   */
  const over = burn != null && ate > burn ? Math.round(ate - burn) : 0;

  return {
    scale,
    segments,
    ticks,
    overflow: over > 0 ? { kcal: over, pct: pct(over) } : null,
    eaten: Math.round(ate),
    // 视图直接读这两个，别再从 ticks 里翻 —— 刻度会因为落在圆周尽头而不画
    burned: burn != null ? Math.round(burn) : null,
    projected: plan != null ? Math.round(plan) : null,
    target: goal != null ? Math.round(goal) : null,
    remaining: goal != null ? Math.round(goal - ate) : null,
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
  if (model?.overflow) out.push({ key: 'over', label: '超出消耗', tone: 'solid' });
  return out;
}
