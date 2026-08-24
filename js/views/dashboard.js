/** 今日总览：一眼看懂「还能吃多少、该吃什么、别碰什么」 */

import { h, clearEl, num, formatMinutes, formatHours, toast, mount, todayKey } from '../lib/utils.js';
import { ring, macroBar } from '../lib/charts.js';
import { state, addEntry } from '../lib/store.js';
import { CATEGORIES, isEstimated } from '../data/foods.js';
import { MEAL_LABEL } from '../core/advisor.js';

const LEVEL_TEXT = { good: '节奏正常', warn: '需要注意', bad: '已超标' };

/** 记住哪些区块被展开，重绘时不丢失 */
const expanded = { recommend: false, avoid: false, insights: false };

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

  const macroMini = (label, g, color) => h('div.mini-macro', null,
    h('div.mini-macro-top', null,
      h('span', null, label),
      h('strong', { class: g.pct > 105 ? 'over' : '' }, `${num(g.eaten)}`),
      h('span.mini-macro-target', null, `/${num(g.target)}g`)),
    macroBar({ value: g.eaten, target: g.target, color }));

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
        macroMini('脂肪', gaps.fat, 'var(--fat)'))),

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
      microChip('钠上限', gaps.sodium, 'mg'),
      microChip('游离糖上限', gaps.sugar, 'g')),
  );
}

function energyFreshness(derived) {
  const meta = derived.energyData;
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

function microChip(label, g, unit) {
  const level = g.pct > 105 ? 'over' : g.pct >= 80 ? 'near' : '';
  return h(`div.micro-chip.${level}`, null,
    h('span.micro-label', null, label),
    h('span.micro-val', null, `${num(g.eaten, unit === 'mg' ? 0 : 1)}`),
    h('span.micro-target', null, `/${num(g.target)}${unit}`));
}

/* ---------------------------------------------------------------- 推荐 */

function recommendCard(advice, rerender) {
  const meal = advice.budget.meal.key;
  const all = advice.recommend;
  const list = expanded.recommend ? all : all.slice(0, 3);

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '现在吃什么'),
      h('span.card-tag', null, advice.budget.proteinFeasible
        ? `${MEAL_LABEL[meal]} · ${num(advice.budget.kcal)} kcal / ${num(advice.budget.protein, 0)}g 蛋白`
        : `${MEAL_LABEL[meal]} · ${num(advice.budget.kcal)} kcal / 蛋白最多约 ${num(advice.budget.maxProteinByKcal, 1)}g`)),
    all.length
      ? [
        h('div.rec-list', null, list.map((item) => recRow(item, meal))),
        moreToggle('recommend', all.length, 3, rerender),
      ]
      : h('p.empty-hint', null, '今天的热量预算已经吃满了。剩下时间以水和无糖茶为主，明天回到正常预算即可。'),
  );
}

function recRow(item, meal) {
  const f = item.food;
  return h('div.rec-row', null,
    h('div.rec-info', null,
      h('div.rec-name', null, f.name,
        isEstimated(f) && h('span.chip.chip-est', null, '估算'),
        h('span.chip', null, CATEGORIES[f.cat] || '自定义')),
      h('div.rec-portion', null, item.portionLabel),
      h('div.rec-reasons', null, item.reasons.slice(0, 2).map((r) => h('span.reason', null, r)))),
    h('div.rec-nums', null,
      h('span.rec-kcal', null, `${item.nutrients.kcal}`),
      h('span.rec-unit', null, 'kcal'),
      h('span.rec-prot', null, `蛋白 ${item.nutrients.protein}g`)),
    h('button.add-btn', {
      'aria-label': `记录 ${f.name}`,
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        await addEntry({ foodId: f.id, grams: item.grams, meal });
        toast(`已记录 ${f.name} ${item.grams}g`, 'ok');
      },
    }, '＋'),
  );
}

/* ---------------------------------------------------------------- 避免 */

function avoidCard(advice, rerender) {
  const all = advice.avoid;
  if (!all.length) return null;
  const list = expanded.avoid ? all : all.slice(0, 3);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '现在别碰'),
      h('span.card-tag', null, '按此刻的剩余预算判断')),
    h('div.avoid-list', null, list.map((item) => h('div.avoid-row', null,
      h('div.avoid-name', null, item.food.name,
        h('span.chip.chip-danger', null, `${item.per100.kcal} kcal/100g`)),
      h('div.avoid-reason', null, item.reason)))),
    moreToggle('avoid', all.length, 3, rerender),
  );
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

function dataCenterBtn() {
  return h('button.secondary-btn.full', {
    onclick: () => { location.hash = 'health'; },
  }, '前往数据中心同步');
}

function healthCard(health, derived) {
  const has = Object.keys(health).some((k) => !['date', 'source'].includes(k));
  const isToday = state.day === todayKey();
  // 今天没数据、或者有数据但缺了活动能量（热量预算就靠它动态调整），都值得提示导入
  const needsImport = isToday && (!has || health.activeEnergy == null);
  const items = [
    ['步数', health.steps != null ? num(health.steps) : '—'],
    ['活动', health.activeEnergy != null ? `${num(health.activeEnergy)}` : '—', 'kcal'],
    ['锻炼', health.exerciseMinutes ? formatMinutes(health.exerciseMinutes) : '—'],
    ['睡眠', health.sleepMinutes ? formatHours(health.sleepMinutes, { unit: false }) : '—',
      health.sleepMinutes ? '小时' : ''],
    ['体重', num(health.weightKg ?? derived.effectiveProfile.weightKg, 1), 'kg'],
    ['体脂', health.bodyFatPct != null ? num(health.bodyFatPct, 1) : '—', '%'],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, 'Apple 健康'),
      h('span.card-tag', null, has ? (health.source === 'manual' ? '手动录入' : '已同步') : '未同步')),
    has
      ? h('div.health-strip', null, items.map(([k, v, u]) => h('div.health-cell', null,
        h('div.health-value', null, v, u && h('span.health-unit', null, u)),
        h('div.health-label', null, k))))
      : h('p.empty-hint', null, isToday
        ? '今天还没有健康数据。请到“数据”栏目从 Apple 健康、快捷指令或导出文件同步。'
        : '这一天还没有健康数据。到“数据”栏目同步 Apple 健康，或手动补录。'),
    needsImport && dataCenterBtn(),
    needsImport && has && h('p.form-hint', { style: { marginTop: '6px' } },
      '缺「活动能量」，热量预算暂时按公式估算。导入后会按 Apple 设备记录重新估算。'),
  );
}

/* ---------------------------------------------------------------- 记录摘要 */

function entriesCard() {
  const entries = state.dietEntries;
  if (!entries.length) return null;
  const byMeal = {};
  for (const e of entries) (byMeal[e.meal] ||= []).push(e);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '今日记录'),
      h('span.card-tag', null, `${entries.length} 项 · ${num(entries.reduce((a, e) => a + e.kcal, 0))} kcal`)),
    h('div.entry-summary', null,
      Object.entries(byMeal).map(([meal, list]) => h('div.entry-meal', null,
        h('div.entry-meal-head', null,
          h('strong', null, MEAL_LABEL[meal] || meal),
          h('span', null, `${num(list.reduce((a, e) => a + e.kcal, 0))} kcal`)),
        h('div.entry-meal-items', null,
          list.map((e) => h('span.entry-tag', null, `${e.name} ${num(e.grams)}g`)))))),
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
    recommendCard(advice, rerender),
    avoidCard(advice, rerender),
    insightsCard(advice, rerender),
    healthCard(health, d),
    entriesCard(),
  );
}
