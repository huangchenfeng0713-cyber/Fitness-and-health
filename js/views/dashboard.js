/** 今日：当前状态、核心目标与可执行提示。 */

import { h, clearEl, num, mount } from '../lib/utils.js';
import { infoTip, persistentInfoTip } from '../lib/ui.js';
import { pointValueTrack } from '../lib/point-value-tip.js';
import { energyRingChart, macroBar, rangeBar, splitBar } from '../lib/charts.js';
import { dailyMetrics, macroSplit, nutrientScale, KIND } from '../core/metrics.js';
import { energyRing, lockTrackScale } from '../core/energy-ring.js';
import { state } from '../lib/store.js';
import { GOALS } from '../core/nutrition.js';
import { FOCUS_LABEL } from '../core/advisor.js';
import { setIntent } from '../lib/nav.js';

/*
 * 主卡只有两档。红色那一档（'已超标'）删了 —— `judgeStatus` 从来不返回它，
 * 也不该返回：热量目标是计划区间不是安全上限，把「今天吃多了」画成危险色
 * 会诱导跳餐。红只留给钠、游离糖那些真上限（见 core/metrics.js）。
 */
const LEVEL_TEXT = { good: '节奏正常', warn: '需要注意' };
const expanded = { insights: false };

function moreToggle(key, total, shown, rerender) {
  if (total <= shown) return null;
  return h('button.more-btn', {
    onclick: () => { expanded[key] = !expanded[key]; rerender(); },
  }, expanded[key] ? '收起' : `展开其余 ${total - shown} 项`);
}

/*
 * 营养条用**数据色**，不是语义色。
 *
 * 这些颜色回答的是「这一条画的是哪一项」，不是「做得好不好」——
 * 好不好由条的填充位置和 `state.level` 说。原先蛋白、碳水、纤维全是主绿，
 * 于是主卡上「符合计划的绿」和「蛋白这一项的绿」是同一个颜色，
 * 而热量环也绿，一屏下来只剩一种颜色，几条不同的信息挤在一起分不开。
 *
 * 上限类（钠、游离糖）仍走中性灰：它们没有「自己的身份」，只有超没超。
 */
const KIND_COLOR = {
  kcal: 'var(--accent)', protein: 'var(--protein)', fat: 'var(--carb)',
  carb: 'var(--carb)', fiber: 'var(--accent)', sodium: 'var(--muted)',
  sugar: 'var(--muted)',
};
/*
 * 主卡底下**三个**方框，没有饮水。
 *
 * 饮水归饮食页那张一行式的卡 —— 记水的时刻是在那儿，主卡这一排回答的是
 * 「今天这几项吃够没吃超」，而饮水只数次数、压根不画条，混进来是第四种画法。
 * 它当年还带着数据蓝（`--water`），一排四个格三个说「到了 / 超了」、
 * 一个说「这是哪一项」—— 两层颜色混着用的代价就是从这儿量出来的。
 * `KIND_COLOR` 里那条 water 因此一并删掉，别再加回来。
 */
const CHIP_KEYS = ['fiber', 'sodium', 'sugar'];

function metricRow(m) {
  const { state: st } = m;
  const note = m.complete !== false && !state.derived.isToday && m.kind === KIND.floor && m.eaten < m.target
    ? `低于目标 ${num(m.target - m.eaten)}${m.unit}` : st.note;
  const value = m.display ?? (m.decimals ? num(m.eaten, m.decimals) : num(m.eaten));
  return h('div', { class: `metric-row ${st.level}` },
    h('div.metric-row-top', null,
      h('span.metric-row-label', null, m.label),
      h('strong.metric-row-value', null, `${value}${m.unit}`),
      h('span.metric-row-note', null, st.range ? `${note} · ${st.range}` : note)),
    m.kind === KIND.log ? null
      : st.zoneStart != null
        ? rangeBar({
          fillPct: st.fillPct, zoneStart: st.zoneStart, zoneEnd: st.zoneEnd,
          color: KIND_COLOR[m.key], level: st.level,
        })
        : macroBar({
          value: m.eaten, target: m.target, color: KIND_COLOR[m.key],
          overIsBad: m.kind === KIND.ceiling,
        }));
}

function splitRow(split) {
  const known = split.carbPct != null;
  return h('div', { class: `metric-row split-row ${split.level}` },
    h('div.metric-row-top', null,
      h('span.metric-row-label', null, '碳水:脂肪'),
      h('span.metric-row-note', null, split.label)),
    pointValueTrack({
      key: `${state.day}:macro-split`, label: '碳水/脂肪',
      value: known ? `碳水 ${split.carbPct}% / 脂肪 ${split.fatPct}%\n碳水 ${num(split.carbG, 1).replace(/\.0$/, '')} g / 脂肪 ${num(split.fatG, 1).replace(/\.0$/, '')} g` : null,
      track: splitBar({
        carbPct: split.carbPct,
        carbBandLo: split.bandLo,
        carbBandHi: split.bandHi,
        level: split.level,
      }),
    }));
}

function metricChip(m) {
  const scale = nutrientScale(m);
  const value = m.display ?? num(m.eaten, m.decimals || 0);
  return h('div.micro-chip', { 'data-nutrient': m.key },
    h('span.micro-label', null, m.label),
    pointValueTrack({
      key: `${state.day}:${m.key}`, label: m.label, value: `${value} ${m.unit.trim()}${m.complete === false ? ' · 已知部分，数据未齐' : ''}`,
      track: h('div.nutrient-scale', null,
        scale.zoneStart == null ? null : h('span.nutrient-zone', {
          style: { left: scale.zoneStart + '%', width: (scale.zoneEnd - scale.zoneStart) + '%' },
        }),
        scale.limitPct == null ? null : h('span.nutrient-limit', { style: { left: scale.limitPct + '%' } }),
        h('span', { class: 'split-bar-point nutrient-point ' + scale.level,
          style: { left: scale.markerPct + '%' } })),
    }));
}

function heroCard(advice, targets, derived) {
  const { status, gaps } = advice;
  const metrics = dailyMetrics(targets, gaps, derived.health?.waterCount);
  const by = Object.fromEntries(metrics.map((m) => [m.key, m]));

  /*
   * 整圈 = 今天计划吃多少（摄入目标精确值），12 点就是吃满计划。
   * 尺子当天锁死，只有计划本身变了才从那一天起换。
   *
   * 「设备记录消耗」用设备到此刻的静息 + 活动（liveEnergy.burnedNow），
   * 不用 liveEnergy.tdee —— 后者是按已过时长外推出来的全天值，
   * 早上八点就报出一千七，环上那条弧看着像「今天已经烧掉八成」。
   */
  const ringScale = lockTrackScale(state.day, targets.kcal);
  const ringModel = energyRing({
    eaten: gaps.kcal.eaten,
    burned: derived.liveEnergy?.burnedNow ?? null,
    target: targets.kcal,
    scale: ringScale,
  });

  return h(`section.card.hero.${status.level}`, null,
    h('div.hero-head', null,
      h('div.hero-head-main', null,
        h('span.status-pill', null, status.label || LEVEL_TEXT[status.level]),
        h('h2', null, status.headline)),
      heroInfo(derived, targets)),
    h('p.hero-detail', null, status.detail),

    /*
     * 环居中，下面一行图例。原先摄入 / 消耗是贴在环左右的两列文字，
     * 一屏上就有三处数字（左、右、圈心）在说同一件事，而环两边的空当
     * 又把整只环挤小了。图例只有色块 + 名字 + 值，和环上的两条弧一一对应。
     *
     * 字走 HTML 不写进 SVG —— SVG 里的字会跟着环缩放，和卡片上别处的 12px 对不齐。
     */
    h('div.hero-body', null,
      h('div.hero-ring', null,
        h('div.ring-stack', null,
          // 只在同一天里让弧长过去；翻日期是换了一份数据，不是「长了一截」
          energyRingChart({ model: ringModel, animateKey: state.day }),
          ringCenter(ringModel)),
        ringLegend(ringModel))),

    h('div.metric-list', null,
      metricRow(by.protein),
      splitRow(macroSplit(targets, gaps))),
    h('div.hero-micros', null, CHIP_KEYS.map((k) => metricChip(by[k]))),
    derived.energyData?.observedAt ? h('p.form-hint', null, '截至 ' + new Date(derived.energyData.observedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })) : null,
    energyFreshness(derived),
  );
}

/*
 * 圈心三行，**中间那行（数字）落在环的正中**：
 *
 *     记录收支        ← --fs-body 中灰
 *       684          ← --fs-display 半粗，它的中心 = 环的中心
 *       kcal         ← --fs-footnote 更轻
 *
 * 数字才是这三行里唯一要被一眼看到的东西，所以由它对准环心，标题和单位
 * 各自挂在它上下 —— 而不是把三行当成一块整体去居中（那样谁都没对准）。
 * 单位到数字的距离是标题到数字的一半（`--space-0` 对 `--space-1`，正好 2 对 4）：
 * 「kcal」是数字的一部分，标题是另一件事，间距得说出这个亲疏。
 * 排布用 `1fr auto 1fr` 的网格，中间那行天然就在正中，不用算偏移量。
 *
 * 字走 HTML 不写进 SVG，和下面那行图例同一个理由：
 * SVG 里的字跟着环缩放，窄屏上环缩到 62vw，那几行就一起掉到 12px 可读下限
 * 以下（实测 320px 的机子上 11.9px）；字号也接不上 app.css 顶部那七档
 * —— 数字曾经是 42px，比全应用最大的一档还大 16px，而它上下两行是 14 和 15，
 * 相邻两行差着三倍。`--fs-display` 的注释写的就是「圆环里的大数」，
 * 之前唯独圆环没在用它。
 */
function ringCenter(model) {
  const c = model.center;
  if (!c) return null;
  const value = c.kcal == null ? '—' : c.kcal > 0 ? '+' + c.kcal
    : c.kcal < 0 ? `−${Math.abs(c.kcal)}` : '0';
  return h('div.ring-center', null,
    h('span.ring-caption', null, state.derived.isToday ? c.label : '当日收支'),
    h('strong.ring-value', null, value),
    h('span.ring-unit', null, 'kcal'));
}

/*
 * 图例：色块 + 名字 + 值，一项对着环上一条弧。
 * 色块的深浅跟着那条轨道当前画到第几圈走 —— 环上颜色变深和图例上变深
 * 说的是同一件事：这条已经跑过一整圈了。
 */
function ringLegend(model) {
  const items = model.legend || [];
  if (!items.length) return null;
  return h('div.ring-legend', null, items.map((item) => h('span.ring-legend-item', null,
    h(`span.ring-swatch.ring-swatch-${item.track}${item.deep ? '.is-deep' : ''}`, {
      'aria-hidden': 'true',
    }),
    h('span.ring-legend-k', null, item.label),
    h('span.ring-legend-v', null, item.track === 'intake'
      ? `${item.kcal} / ${model.target ?? '—'}` : String(item.kcal)),
    h('span.ring-legend-unit', null, 'kcal'))));
}

function heroInfo(derived, targets) {
  const meta = derived.energyData;
  const basis = [
    ['基础代谢', `${num(targets.bmr)} kcal，仅作为能量计算基础，不是需要“吃满”的目标`],
    ['每日计划', targets.tdeeSource === 'apple' ? '采用近期完整日设备基线' : '采用身体资料与活动系数估算'],
    ['蛋白质', targets.proteinBasis],
    ['脂肪', `参考上限 ${num(targets.fatUpper || targets.fat)}g，约占总热量 35%`],
    ['膳食纤维', '中国成人参考 25–30g'],
    ['钠上限', `${num(targets.sodium)}mg；WHO 一般成人参考，非疾病危险线`],
    ['游离糖上限', '保留食物库游离糖口径；低于供能 10% 且不超过 50g，5% 或 25g 为进一步益处参考，非危险线'],
  ];
  let freshness = null;
  if (meta?.observedAt && derived.dynamic && !meta.stale) {
    const observed = new Date(meta.observedAt);
    const clock = observed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const age = meta.ageMinutes >= 120
      ? `，距今约 ${Math.max(2, Math.round(meta.ageMinutes / 60))} 小时`
      : meta.ageMinutes > 5 ? `，距今 ${meta.ageMinutes} 分钟` : '';
    freshness = `Apple 能量数据截至 ${clock}${age}。`;
  }
  return infoTip('查看目标计算依据',
    h('p', null, h('strong', null, `${GOALS[targets.goal].label}`),
      targets.rateKgPerWeek === 0
        ? ' · 计划体重维持不变'
        : ` · 初始预算对应 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周`),
    // 维持目标时「初始预算每天多吃 0 kcal」是句废话，只留后半句
    h('p', null,
      Number(targets.dailyDelta) !== 0
        ? `相当于每天${targets.dailyDelta > 0 ? '多' : '少'}吃 ${num(Math.abs(targets.dailyDelta))} kcal。`
          + '7700 kcal/kg 仅作初始预算近似，不能预测实际体重、肌肉或脂肪变化。'
        : '能规划的只是体重变化的快慢，增减的是肌肉还是脂肪，这里判断不了。'),
    freshness && h('p', null, freshness),
    h('p', null, (targets.context || '按当前设置对照') + ' · ' + targets.referenceDate),
    h('p', null, derived.isToday
      ? '根据当前已记录摄入与已同步消耗计算，不代表全天最终能量结余。'
      : '根据所选日期的摄入与消耗记录回顾；记录可能不完整，对照目标使用现有设置。'),
    h('ul', null, basis.map(([name, note]) => h('li', null,
      h('strong', null, `${name}：`), note))),
    targets.clampedByFloor && h('p', null,
      '按目标速率算出的热量低于成人常用饮食计划下限（女 1200 / 男 1500 kcal），已自动上调；'
      + '如有疾病、孕哺或特殊训练需求，请由专业人员个体化评估。'));
}

function energyFreshness(derived) {
  if (derived.demoMode) return h('p.data-freshness.warn', null, '演示档案：请确认身体信息后再使用个人计划。');
  const meta = derived.energyData;
  if (!meta?.valid) return h('p.data-freshness', null, meta?.reason || '能量数据待同步');
  return null;
}

const INSIGHT_FOCUS = { protein: 'protein', fiber: 'fiber' };

function trendCard(advice) {
  const t = advice.trend;
  if (!t || !t.active || ['historical', 'future', 'unavailable'].includes(t.state)) return null;
  const titles = { under: '全天摄入可能偏少', over: '留意后续餐次搭配', steady: '暂未见明确偏离', uncertain: '记录尚不足，先观察', watch: '先留出餐后观察时间', late: '今晚不必追齐数字', settled: '今天不必追齐计划差额', covered: '当前不必额外加餐' };
  return h('section.card.intake-trend', { 'data-state': t.state },
    h('div.card-head', null, h('h3', null, '今日摄入趋势'),
      persistentInfoTip('intake-trend-method', '查看摄入预测依据',
        h('div', null, h('p', null, '餐次有记录不代表吃完。未确认全天记录完整时，不外推确定的摄入不足；晚间仍可照常吃尚未吃的正餐。')))),
    h('p.trend-title', null, titles[t.state] || titles.uncertain),
    t.range && !t.dayComplete ? h('div.trend-range', null, h('span', null, '按后续主餐估计'), h('strong', null, t.range.low + '–' + t.range.high + ' kcal')) : null,
    h('p.trend-basis', null, t.reason),
    t.active ? [
      h('p.trend-action', null, advice.correction.action),
      h('button.secondary-btn.trend-go', { type: 'button', onclick: () => { setIntent({ correction: true }); location.hash = 'diet'; } }, '查看适合的食物'),
    ] : null);
}

function insightsCard(advice, rerender) {
  const isToday = state.derived.isToday;
  const all = advice.insights;
  if (!all.length) return null;
  const list = expanded.insights ? all : all.slice(0, 3);
  const explained = list.filter((insight) => insight.basis);
  const evidence = explained.length
    ? persistentInfoTip('today-insights-evidence', '查看当前提示的判断依据',
      h('ul.insight-evidence-list', null, explained.map((insight) => h('li', null,
        h('strong', null, `${insight.title}：`),
        insight.basis))))
    : null;
  evidence?.classList.add('insight-evidence-tip');
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, isToday ? '今日提示' : '当日回顾'),
      evidence),
    h('div.insight-list', null, list.map((i) => {
      const focus = isToday ? INSIGHT_FOCUS[i.type] : null;
      const main = [
        h('div.insight-title', null, i.title),
        isToday && i.action ? h('div.insight-action', null, i.action) : null,
        !isToday && i.basis ? h('div.insight-action', null, i.basis) : null,
        focus ? h('div.insight-go', null, advice.correction?.active || advice.correction?.optionalProtein ? '查看适合当前情况的食物 ›' : `去看${FOCUS_LABEL[focus]}的食物 ›`) : null,
      ];
      const primary = focus
        ? h('button.insight-main.insight-actionable', {
          type: 'button',
          onclick: () => {
            setIntent(advice.correction?.active || advice.correction?.optionalProtein ? { correction: true } : { focus });
            location.hash = 'diet';
          },
        }, ...main)
        : h('div.insight-main', null, ...main);
      return h(`div.insight.${i.type}`, null, primary);
    })),
    moreToggle('insights', all.length, 3, rerender));
}

export function renderDashboard(root) {
  const rerender = () => renderDashboard(root);
  const d = state.derived;
  clearEl(root);
  if (!d) return;
  const { advice, targets } = d;
  mount(root,
    targets.status === 'unavailable' ? h('section.card', null, h('h2', null, '暂不能生成个人计划'),
      h('p', null, targets.reason), h('p', null, '已知记录摄入 ' + num(d.intake.kcal) + ' kcal'),
      h('a.secondary-btn', { href: '#settings' }, '完善身体信息')) : heroCard(advice, targets, d),
    trendCard(advice),
    insightsCard(advice, rerender));
}
