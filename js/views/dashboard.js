/**
 * 今日：我今天怎么样。状态、提示、Apple 健康快照。
 *
 * 这一页只回答「现在什么情况」。吃什么去饮食页，走势去数据页——
 * 原先这里还挂着一张只读的「今日记录」，和饮食页那张可编辑的是同一批数据，
 * 看到了也改不了，反而得再翻一页。
 */

import {
  h, clearEl, num, formatMinutes, formatHours, mount, todayKey,
} from '../lib/utils.js';
import { ring, macroBar } from '../lib/charts.js';
import { state } from '../lib/store.js';

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
      h('span.status-pill', null, LEVEL_TEXT[status.level]),
      h('h2', null, status.headline)),
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
      h('span', null, `已吃 ${num(gaps.kcal.eaten)}`),
      h('span', null, `目标 ${num(targets.kcal)}`),
      h('span', null, derived.dynamic
        ? `预计总消耗 ${num(targets.tdee)}`
        : `基础代谢 ${num(targets.bmr)}`),
      h('span', null, `${targets.dailyDelta > 0 ? '计划盈余' : targets.dailyDelta < 0 ? '计划赤字' : '计划平衡'} ${num(Math.abs(targets.dailyDelta))}`)),

    energyFreshness(derived),

    h('div.hero-micros', null,
      microChip('纤维', gaps.fiber, 'g'),
      microChip('钠上限', gaps.sodium, 'mg', true),
      microChip('游离糖上限', gaps.sugar, 'g', true)),
  );
}

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
  if (!meta?.observedAt || !derived.dynamic) return null;
  const observed = new Date(meta.observedAt);
  const clock = observed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const age = meta.ageMinutes >= 120
    ? `，距今约 ${Math.max(2, Math.round(meta.ageMinutes / 60))} 小时`
    : meta.ageMinutes > 5 ? `，距今 ${meta.ageMinutes} 分钟` : '';
  return h(`p.data-freshness${meta.stale ? '.warn' : ''}`, null,
    `Apple 能量数据截至 ${clock}${age}；没有新数据时热量目标会保持不变。`);
}

function microChip(label, g, unit, upperLimit = false) {
  const level = upperLimit
    ? g.pct > 105 ? 'over' : g.pct >= 80 ? 'near' : ''
    : g.pct >= 100 ? 'met' : '';
  return h(`div.micro-chip.${level}`, null,
    h('span.micro-label', null, label),
    h('span.micro-val', null, `${num(g.eaten, unit === 'mg' ? 0 : 1)}`),
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

/** 同步入口已经收进设置抽屉里的「数据管理」，这里直接把抽屉打开 */
function dataCenterBtn() {
  return h('button.secondary-btn.full', {
    onclick: () => document.querySelector('.topbar-settings-btn')?.click(),
  }, '去同步健康数据');
}

function healthCard(health) {
  const metricKeys = [
    'steps', 'activeEnergy', 'restingEnergy', 'exerciseMinutes', 'sleepMinutes',
    'weightKg', 'bodyFatPct', 'restingHR', 'waterMl',
  ];
  const has = metricKeys.some((key) => health[key] != null && Number.isFinite(Number(health[key])));
  const isToday = state.day === todayKey();
  // 今天没数据、或者有数据但缺了活动能量（热量预算就靠它动态调整），都值得提示导入
  const needsImport = isToday && (!has || health.activeEnergy == null);
  /*
   * 一行摘要，不是六宫格。
   * 这六项在数据页各有一张趋势图，那边才是看走势的地方；
   * 今日页只需要回答「今天同步上来了没有、大概多少」，占掉三行网格不值。
   * 没有值的项直接不出现——一排「—」既占地方又什么都没说。
   */
  const bits = [
    ['步数', health.steps != null ? num(health.steps) : null],
    ['活动', health.activeEnergy != null ? `${num(health.activeEnergy)} kcal` : null],
    ['锻炼', health.exerciseMinutes != null ? formatMinutes(health.exerciseMinutes) : null],
    ['睡眠', health.sleepMinutes != null ? `${formatHours(health.sleepMinutes, { unit: false })} 小时` : null],
    // 这张卡只展示所选日期的健康记录；档案体重不能冒充当天 Apple 数据。
    ['体重', health.weightKg != null ? `${num(health.weightKg, 1)} kg` : null],
    ['体脂', health.bodyFatPct != null ? `${num(health.bodyFatPct, 1)}%` : null],
  ].filter(([, v]) => v != null);
  const sourceLabel = health.source === 'manual'
    ? '手动录入' : health.source === 'mixed' ? '同步＋补录' : '已同步';
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, 'Apple 健康'),
      h('span.card-tag', null, has ? sourceLabel : '未同步')),
    bits.length
      ? h('div.stat-line', null, bits.map(([k, v]) => h('span.stat-bit', null,
        h('span.stat-key', null, k),
        h('strong', null, v))))
      : h('p.empty-hint', null, isToday
        ? '今天还没有健康数据。到设置里的「数据管理」从健康 App、快捷指令或导出文件同步。'
        : '这一天还没有健康数据。到设置里的「数据管理」同步，或手动补录当天字段。'),
    needsImport && dataCenterBtn(),
    needsImport && has && h('p.form-hint', { style: { marginTop: '6px' } },
      '缺「活动能量」，热量预算暂时按公式估算。导入后会按 Apple 设备记录重新估算。'),
  );
}

export function renderDashboard(root) {
  const rerender = () => renderDashboard(root);
  const d = state.derived;
  clearEl(root);
  if (!d) return;
  const { advice, targets, health } = d;
  mount(root,
    heroCard(advice, targets, d),
    insightsCard(advice, rerender),
    healthCard(health),
  );
}
