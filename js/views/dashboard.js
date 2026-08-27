/**
 * 今日：我今天怎么样。状态 + 提示，两张卡。
 *
 * 这一页只回答「现在什么情况」。吃什么去饮食页，今天同步了什么、
 * 这些天在往哪走去数据页。
 *
 * 主卡本身就是一张完整的每日目标表：热量、三大营养素、纤维、钠、糖、饮水
 * 八项全在，而且每项都带着「已摄入 / 目标摄入」。所以数据页那张只列目标的表撤了——
 * 同一批数字，这里的版本还多告诉你离目标还差多少。
 */

import {
  h, clearEl, num, mount, infoTip,
} from '../lib/utils.js';
import { ring, macroBar } from '../lib/charts.js';
import { state } from '../lib/store.js';
import { GOALS } from '../core/nutrition.js';

const LEVEL_TEXT = { good: '节奏正常', warn: '需要注意', bad: '已超标' };

/** 记住哪些区块被展开，重绘时不丢失 */
const expanded = { insights: false };

/** 可展开区块的通用页脚按钮 */
function moreToggle(key, total, shown, rerender) {
  if (total <= shown) return null;
  return h('button.more-btn', {
    onclick: () => { expanded[key] = !expanded[key]; rerender(); },
  }, expanded[key] ? '收起' : `展开其余 ${total - shown} 项`);
}

/* ---------------------------------------------------------------- 主卡 */

function heroCard(advice, targets, derived) {
  const { status, gaps } = advice;
  const left = gaps.kcal.remaining;
  const over = left < 0;

  const macroMini = (label, g, color, { target = g.target, upperLimit = false } = {}) => {
    const pct = target > 0 ? (g.eaten / target) * 100 : 0;
    return h('div.mini-macro', null,
    h('div.mini-macro-top', null,
      h('span', null, label),
      h('strong', { class: upperLimit && pct > 105 ? 'over' : '' }, `${num(g.eaten)}`),
      h('span.mini-macro-target', null, `/${num(target)}g`)),
    macroBar({ value: g.eaten, target, color, overIsBad: upperLimit }));
  };

  return h(`section.card.hero.${status.level}`, null,
    h('div.hero-head', null,
      h('div.hero-head-main', null,
        h('span.status-pill', null, LEVEL_TEXT[status.level]),
        h('h2', null, status.headline)),
      heroInfo(derived, targets)),
    h('p.hero-detail', null, status.detail),

    h('div.hero-body', null,
      h('div.hero-ring', null,
        ring({
          pct: gaps.kcal.pct,
          size: 108,
          stroke: 10,
          label: num(Math.abs(left)),
          sub: over ? 'kcal 超出' : 'kcal 热量余量',
          color: over ? 'var(--danger)'
            : status.level === 'warn' ? 'var(--warn)' : 'var(--accent)',
        })),
      h('div.hero-macros', null,
        macroMini('蛋白质', gaps.protein, 'var(--protein)'),
        macroMini('碳水', gaps.carb, 'var(--carb)'),
        macroMini('脂肪上限', gaps.fat, 'var(--fat)', {
          target: targets.fatUpper || gaps.fat.target, upperLimit: true,
        }))),

    h('div.hero-foot', null,
      h('span', null, `已摄入 ${num(gaps.kcal.eaten)}`),
      h('span', null, `目标摄入 ${num(targets.kcal)}`),
      h('span', null, derived.dynamic
        ? `预计总消耗 ${num(targets.tdee)}`
        : `基础代谢 ${num(targets.bmr)}`),
      h('span', null, `${targets.dailyDelta > 0 ? '计划盈余' : targets.dailyDelta < 0 ? '计划赤字' : '计划平衡'} ${num(Math.abs(targets.dailyDelta))}`)),

    energyFreshness(derived),

    h('div.hero-micros', null,
      microChip('纤维', gaps.fiber, 'g'),
      microChip('钠上限', gaps.sodium, 'mg', true),
      microChip('游离糖上限', gaps.sugar, 'g', true),
      microChip('饮水', waterGap(derived), 'ml')),
  );
}

/*
 * 目标依据和能量数据的时效收进右上角那个圈里的感叹号。
 *
 * 「Apple 能量数据截至 21:00，距今 7 分钟」这种话每天都对、每天都一样，
 * 常驻在主卡中间等于每次打开都要跳过一遍。要查的时候点开就有。
 *
 * 但真正出了问题的那几条（身体信息不合格、演示数据、数据过期）不收——
 * 那些是「你现在看到的数字不对」，藏起来就没人会发现。
 */
function heroInfo(derived, targets) {
  const meta = derived.energyData;
  const basis = [
    ['热量', targets.tdeeSource !== 'apple'
      ? '按活动系数估算'
      : targets.activeSource === 'formula-fallback'
        ? '静息采用设备记录，缺失活动按活动系数补足'
        : targets.activeSource === 'device-baseline'
          ? '活动采用近期设备记录基线估算'
          : '按今日 Apple 能量记录动态估算'],
    ['蛋白质', targets.proteinBasis],
    ['脂肪', `计划 ${num(targets.fat)}g 用于分配三大营养素；参考上限 ${num(targets.fatUpper || targets.fat)}g 按总热量 35% 计算`],
    ['碳水', '总热量减去蛋白与脂肪后的剩余'],
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
    freshness = `Apple 能量数据截至 ${clock}${age}；没有新数据时热量目标会保持不变。`;
  }
  return infoTip('查看目标计算依据',
    h('p', null, h('strong', null,
      `${GOALS[targets.goal].label} · ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周`)),
    freshness && h('p', null, freshness),
    h('ul', null, basis.map(([name, note]) => h('li', null,
      h('strong', null, `${name}：`), note))),
    targets.clampedByFloor && h('p', null,
      '按目标速率算出的热量低于成人常用饮食计划下限（女 1200 / 男 1500 kcal），已自动上调；'
      + '如有疾病、孕哺或特殊训练需求，请由专业人员个体化评估。'),
    targets.rateWasClamped && h('p', null,
      `你填写的 ${targets.requestedRateKgPerWeek > 0 ? '+' : ''}${targets.requestedRateKgPerWeek} kg/周过快，`
      + `已按体重比例和每日热量调整上限改为 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周。`));
}

/** 只有「你看到的数字不对」才留在卡面上 */
function energyFreshness(derived) {
  const meta = derived.energyData;
  /*
   * 身体信息本身算不出目标时要说清是哪一条不合格。
   * 笼统说「演示数据」会让人以为只是没填，实际是填了但被拒——
   * 常见于恢复了一份旧备份，或换设备后云端同步下来的旧档案。
   */
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

/** 饮水记在健康数据里，不走饮食条目，所以 gaps 里没有它 */
function waterGap(derived) {
  const target = Number(derived.targets?.waterMl) || 0;
  const eaten = Number(derived.health?.waterMl) || 0;
  return { target, eaten, remaining: target - eaten, pct: target > 0 ? Math.round((eaten / target) * 100) : 0 };
}

function microChip(label, g, unit, upperLimit = false) {
  const level = upperLimit
    ? g.pct > 105 ? 'over' : g.pct >= 80 ? 'near' : ''
    : g.pct >= 100 ? 'met' : '';
  return h(`div.micro-chip.${level}`, null,
    h('span.micro-label', null, label),
    h('span.micro-val', null, `${num(g.eaten, unit === 'g' ? 1 : 0)}`),
    h('span.micro-target', null, `/${num(g.target)}${unit}`));
}




/* ---------------------------------------------------------------- 提示 */

function insightsCard(advice, rerender) {
  const all = advice.insights;
  if (!all.length) return null;
  const list = expanded.insights ? all : all.slice(0, 3);
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '今日提示')),
    h('div.insight-list', null, list.map((i) => h(`div.insight.${i.type}`, null,
      h('div.insight-title', null, i.title),
      h('div.insight-text', null, i.text)))),
    moreToggle('insights', all.length, 3, rerender),
  );
}

/* ---------------------------------------------------------------- 健康 */

export function renderDashboard(root) {
  const rerender = () => renderDashboard(root);
  const d = state.derived;
  clearEl(root);
  if (!d) return;
  const { advice, targets } = d;
  mount(root,
    heroCard(advice, targets, d),
    insightsCard(advice, rerender),
  );
}
