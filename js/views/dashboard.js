/** 今日：当前状态、核心目标与可执行提示。 */

import { h, clearEl, num, mount } from '../lib/utils.js';
import { infoTip, persistentInfoTip } from '../lib/ui.js';
import { energyRingChart, macroBar, rangeBar, splitBar } from '../lib/charts.js';
import { dailyMetrics, macroSplit, KIND } from '../core/metrics.js';
import { energyRing, lockTrackScale } from '../core/energy-ring.js';
import { state } from '../lib/store.js';
import { GOALS } from '../core/nutrition.js';
import { FOCUS_LABEL } from '../core/advisor.js';
import { setIntent } from '../lib/nav.js';

const LEVEL_TEXT = { good: '节奏正常', warn: '需要注意', bad: '已超标' };
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
  sugar: 'var(--muted)', water: 'var(--water)',
};
const CHIP_KEYS = ['fiber', 'sodium', 'sugar', 'water'];

function metricRow(m) {
  const { state: st } = m;
  const value = m.display ?? (m.decimals ? num(m.eaten, m.decimals) : num(m.eaten));
  return h('div', { class: `metric-row ${st.level}` },
    h('div.metric-row-top', null,
      h('span.metric-row-label', null, m.label),
      h('strong.metric-row-value', null, `${value}${m.unit}`),
      h('span.metric-row-note', null, st.range ? `${st.note} · ${st.range}` : st.note)),
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
      h('span.metric-row-label', null, '碳水 / 脂肪'),
      h('strong.metric-row-value', null, known ? `${split.carbPct}% / ${split.fatPct}%` : '—'),
      h('span.metric-row-note', null, split.label)),
    splitBar({
      carbPct: split.carbPct,
      carbBandLo: split.bandLo,
      carbBandHi: split.bandHi,
      level: split.level,
    }),
    h('div.split-grams', null,
      h('span.split-end', null, `碳水 ${num(split.carbG)}g`),
      h('span.split-grams-plan', null, split.note),
      h('span.split-end', null, `脂肪 ${num(split.fatG)}g`)));
}

function metricChip(m) {
  const { state: st } = m;
  const value = m.display ?? (m.decimals ? num(m.eaten, m.decimals) : num(m.eaten));
  const unit = m.unit.trim();
  return h('div', { class: `micro-chip ${st.level}${m.kind === KIND.log ? ' log' : ''}` },
    h('span.micro-label', null, m.label),
    h('span.micro-val', null, value),
    m.kind === KIND.log
      ? h('span.micro-unit', null, unit)
      : h('span.micro-target', null, `/${num(m.target)}${unit}`));
}

function heroCard(advice, targets, derived) {
  const { status, gaps } = advice;
  const metrics = dailyMetrics(targets, gaps, derived.health?.waterCount);
  const kcal = metrics.find((m) => m.key === 'kcal');
  const by = Object.fromEntries(metrics.map((m) => [m.key, m]));

  /*
   * 热量环是环形跑道，不是目标进度条。
   * 绿是摄入，黄是消耗，尺子按预计日消耗取整到百，当天内不许改。
   */
  /*
   * 「当前消耗」用设备到此刻的静息 + 活动（liveEnergy.burnedNow），
   * 不用 liveEnergy.tdee —— 后者是按已过时长外推出来的全天值，
   * 早上八点就报出一千七，环上那条弧看着像「今天已经烧掉八成」。
   * 外推那个数是「预计全天消耗」，走 targets.tdee。
   */
  const ringScale = lockTrackScale(state.day, targets.tdee);
  const ringModel = energyRing({
    eaten: gaps.kcal.eaten,
    burned: derived.liveEnergy?.burnedNow ?? null,
    projected: targets.tdee,
    scale: ringScale,
  });

  return h(`section.card.hero.${status.level}`, null,
    h('div.hero-head', null,
      h('div.hero-head-main', null,
        h('span.status-pill', null, LEVEL_TEXT[status.level]),
        h('h2', null, status.headline)),
      heroInfo(derived, targets)),
    h('p.hero-detail', null, status.detail),

    /*
     * 环占满一行。两条刻度各带一个外圈文字，环左右两边都要留出地方。
     */
    h('div.hero-body', null,
      h('div.hero-ring', null, energyRingChart({ model: ringModel }))),

    h('div.metric-list', null,
      metricRow(by.protein),
      splitRow(macroSplit(targets, gaps))),
    h('div.hero-micros', null, CHIP_KEYS.map((k) => metricChip(by[k]))),
    energyFreshness(derived),
  );
}

function heroInfo(derived, targets) {
  const meta = derived.energyData;
  const basis = [
    ['基础代谢', `${num(targets.bmr)} kcal，仅作为能量计算基础，不是需要“吃满”的目标`],
    ['热量', targets.tdeeSource !== 'apple'
      ? '按活动系数估算'
      : targets.activeSource === 'formula-fallback'
        ? '静息采用设备记录，缺失活动按活动系数补足'
        : targets.activeSource === 'device-baseline'
          ? '活动采用近期设备记录基线估算'
          : '按今日 Apple 能量记录动态估算'],
    ['蛋白质', targets.proteinBasis],
    ['脂肪', `参考上限 ${num(targets.fatUpper || targets.fat)}g，约占总热量 35%`],
    ['膳食纤维', '中国成人参考 25–30g'],
    ['钠上限', '约等于 5g 食盐'],
    ['游离糖上限', '含糖浆、蜂蜜和果汁中的糖；低于总热量 10%'],
    ['饮水参考', '温和气候、低活动；运动或炎热天气需额外补充'],
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
        : ` · 计划体重 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周`),
    // 维持目标时「相当于每天多吃 0 kcal」是句废话，只留后半句
    h('p', null,
      Number(targets.dailyDelta) !== 0
        ? `相当于每天${targets.dailyDelta > 0 ? '多' : '少'}吃 ${num(Math.abs(targets.dailyDelta))} kcal。`
          + '能规划的只是体重变化的快慢，增减的是肌肉还是脂肪，这里判断不了。'
        : '能规划的只是体重变化的快慢，增减的是肌肉还是脂肪，这里判断不了。'),
    freshness && h('p', null, freshness),
    h('p', null, '根据当前已记录摄入与已同步消耗计算，不代表全天最终能量结余。'),
    h('ul', null, basis.map(([name, note]) => h('li', null,
      h('strong', null, `${name}：`), note))),
    targets.clampedByFloor && h('p', null,
      '按目标速率算出的热量低于成人常用饮食计划下限（女 1200 / 男 1500 kcal），已自动上调；'
      + '如有疾病、孕哺或特殊训练需求，请由专业人员个体化评估。'));
}

function energyFreshness(derived) {
  const meta = derived.energyData;
  if (derived.profileError) {
    return h('p.data-freshness.warn', null,
      `身体信息暂时算不出目标（${derived.profileError}），下面的数字来自默认档案。`
      + '请到右上角“设置 → 身体信息”修正后保存。');
  }
  if (derived.demoMode) {
    return h('p.data-freshness.warn', null, '当前使用演示身体数据，热量与营养目标不是你的个性化结果。请到“设置”填写真实信息。');
  }
  if (meta?.missingObservationTime) {
    return h('p.data-freshness.warn', null, '这份能量数据缺少覆盖时间，已停止动态外推并改用公式估算。重新导入即可修复。');
  }
  if (meta?.stale && derived.dynamic) {
    return h('p.data-freshness.warn', null, 'Apple 能量数据已经有一段时间没更新了，热量目标暂时保持不变。重新同步一次即可。');
  }
  return null;
}

const INSIGHT_FOCUS = { protein: 'protein', fiber: 'fiber' };

function insightsCard(advice, rerender) {
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
      h('h3', null, '今日提示'),
      evidence),
    h('div.insight-list', null, list.map((i) => {
      const focus = INSIGHT_FOCUS[i.type];
      const main = [
        h('div.insight-title', null, i.title),
        i.action ? h('div.insight-action', null, i.action) : null,
        focus ? h('div.insight-go', null, `去看${FOCUS_LABEL[focus]}的食物 ›`) : null,
      ];
      const primary = focus
        ? h('button.insight-main.insight-actionable', {
          type: 'button',
          onclick: () => { setIntent({ focus }); location.hash = 'diet'; },
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
    heroCard(advice, targets, d),
    insightsCard(advice, rerender));
}
