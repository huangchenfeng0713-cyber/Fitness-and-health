/**
 * 健康数据卡：所选日期从 Apple 健康同步上来的原始数值。
 *
 * 挂在数据页最顶上。下面那张趋势卡画的就是这几项的走势——
 * 「今天多少」和「这些天在往哪走」放在同一页，才不用来回切。
 *
 * 图标不是装饰：六项数值排在一起时，全是数字加两个汉字，
 * 扫一眼分不出哪个是哪个；图标是那个能先被认出来的锚点。
 */

import { h, num, formatHours, todayKey } from '../../lib/utils.js';
import { state } from '../../lib/store.js';

const svg = (path, { fill = false } = {}) => {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'metric-icon');
  el.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  p.setAttribute('fill', fill ? 'currentColor' : 'none');
  if (!fill) {
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.7');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
  }
  el.append(p);
  return el;
};

/* 一笔画得出来的形，不用图标库——外部依赖一个都不引 */
const ICONS = {
  steps: 'M9 4.5c1.6 0 2.4 1.2 2.4 3 0 1.4-.4 2.6-.4 4 0 1.2.6 2 .6 3.2 0 1.5-.9 2.3-2.3 2.3s-2.3-.9-2.3-2.4c0-1.4.5-2.4.5-3.6 0-1.5-.6-2.3-.6-3.6 0-1.7.8-2.9 2.1-2.9ZM7.6 19.5h3.4M16.5 8c1.3 0 2 1 2 2.5 0 1.2-.4 2.2-.4 3.3 0 1 .5 1.7.5 2.7 0 1.2-.7 1.9-1.9 1.9s-1.9-.8-1.9-2c0-1.2.4-2 .4-3 0-1.2-.5-1.9-.5-3 0-1.4.6-2.4 1.8-2.4Z',
  activeEnergy: 'M12 3s1 3.2 3 5.2 3.3 3.2 3.3 5.8A6.3 6.3 0 0 1 12 20.5a6.3 6.3 0 0 1-6.3-6.5c0-2.2 1.4-3.6 2.4-5.3M12 20.5c-1.6 0-2.8-1.2-2.8-2.8 0-1.7 1.6-2.4 2.4-4.2.9 1.5 3.2 2.5 3.2 4.2 0 1.6-1.2 2.8-2.8 2.8Z',
  exerciseMinutes: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.2 2',
  sleepMinutes: 'M20 14.3A8.2 8.2 0 0 1 9.7 4 8.5 8.5 0 1 0 20 14.3Z',
  weightKg: 'M5.6 8h12.8l1.6 11.5a1.4 1.4 0 0 1-1.4 1.5H5.4A1.4 1.4 0 0 1 4 19.5L5.6 8ZM12 3.5A2.6 2.6 0 0 1 14.6 6c0 .8-.3 1.4-.8 2h-3.6c-.5-.6-.8-1.2-.8-2A2.6 2.6 0 0 1 12 3.5Z',
  bodyFatPct: 'M12 3.5c3.4 3.3 5.5 5.9 5.5 8.7a5.5 5.5 0 0 1-11 0c0-2.8 2.1-5.4 5.5-8.7Z',
  restingHR: 'M3.5 12.5h3l1.8-4 2.7 8 2.4-6 1.6 3.4h5',
  waterMl: 'M12 3.5c3.4 3.3 5.5 5.9 5.5 8.7a5.5 5.5 0 0 1-11 0c0-2.8 2.1-5.4 5.5-8.7Z',
};

/*
 * 列数按项数挑，别让末行只剩一个。
 *
 * 显示几项完全看当天同步上来了什么，从 1 项到 8 项都可能。
 * 固定三列的话 7 项就排成 3+3+1，最后那个吊在中间，怎么摆都是歪的。
 * 先找能整除的（8 → 4+4，6 → 3+3），实在整除不了就挑一个末行至少剩两个的。
 */
export function metricColumns(n) {
  if (n <= 4) return Math.max(n, 1);
  for (const c of [4, 3]) if (n % c === 0) return c;
  for (const c of [3, 4]) if (n % c !== 1) return c;
  return 3;
}

/** 同步入口收在设置抽屉的「数据管理」里，这里直接把抽屉打开 */
function dataCenterBtn() {
  return h('button.secondary-btn.full', {
    onclick: () => document.querySelector('.topbar-settings-btn')?.click(),
  }, '去同步健康数据');
}

export function healthMetricsCard() {
  const d = state.derived;
  if (!d) return null;
  const health = d.health || {};
  const metricKeys = [
    'steps', 'activeEnergy', 'restingEnergy', 'exerciseMinutes', 'sleepMinutes',
    'weightKg', 'bodyFatPct', 'restingHR', 'waterMl',
  ];
  const has = metricKeys.some((key) => health[key] != null && Number.isFinite(Number(health[key])));
  const isToday = state.day === todayKey();
  // 今天没数据、或者有数据但缺了活动能量（热量预算就靠它动态调整），都值得提示导入
  const needsImport = isToday && (!has || health.activeEnergy == null);
  // 没有值的项直接不出现——一排「—」既占地方又什么都没说
  const cells = [
    ['steps', '步数', health.steps != null ? num(health.steps) : null, ''],
    ['activeEnergy', '活动', health.activeEnergy != null ? num(health.activeEnergy) : null, 'kcal'],
    ['exerciseMinutes', '锻炼', health.exerciseMinutes != null ? num(health.exerciseMinutes) : null, '分钟'],
    ['sleepMinutes', '睡眠', health.sleepMinutes != null ? formatHours(health.sleepMinutes, { unit: false }) : null, '小时'],
    ['restingHR', '静息心率', health.restingHR != null ? num(health.restingHR) : null, 'bpm'],
    // 这张卡只展示所选日期的健康记录；档案体重不能冒充当天 Apple 数据。
    ['weightKg', '体重', health.weightKg != null ? num(health.weightKg, 1) : null, 'kg'],
    ['bodyFatPct', '体脂', health.bodyFatPct != null ? num(health.bodyFatPct, 1) : null, '%'],
    ['waterMl', '饮水', health.waterMl != null ? num(health.waterMl) : null, 'ml'],
  ].filter(([, , v]) => v != null);
  const sourceLabel = health.source === 'manual'
    ? '手动录入' : health.source === 'mixed' ? '同步＋补录' : '已同步';
  const cols = metricColumns(cells.length);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '健康数据'),
      h('span.card-tag', null, has ? sourceLabel : '未同步')),
    cells.length
      ? h('div.metric-grid', { style: { '--metric-cols': String(cols) } }, cells.map(([key, label, value, unit]) => h('div.metric-cell', null,
        svg(ICONS[key] || ICONS.steps),
        h('div.metric-body', null,
          h('div.metric-value', null, value, unit && h('span.metric-unit', null, unit)),
          h('div.metric-label', null, label)))))
      : h('p.empty-hint', null, isToday
        ? '今天还没有健康数据。到设置里的「数据管理」从健康 App、快捷指令或导出文件同步。'
        : '这一天还没有健康数据。到设置里的「数据管理」同步，或手动补录当天字段。'),
    needsImport && dataCenterBtn(),
    needsImport && has && h('p.form-hint', { style: { marginTop: '6px' } },
      '缺「活动能量」，热量预算暂时按公式估算。导入后会按 Apple 设备记录重新估算。'),
  );
}
