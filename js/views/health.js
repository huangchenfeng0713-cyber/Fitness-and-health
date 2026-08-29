/**
 * 数据页：今天同步上来了什么 + 这些天在往哪走。
 *
 * 健康数据摆在最上面，下面那张趋势卡画的就是同一批指标的走势，
 * 「今天多少」和「在往哪走」放同一页才不用来回切。
 * 每日目标不在这里——它是今天该吃多少，长在今日页的主卡上。
 * 解读收在每张图下面：看着那条曲线读那段话，比先看一堆汇总数字要直接。
 * 数据的维护性操作（导入 / 备份 / 补录）在设置页。
 */

import { h, clearEl, toast, mount } from '../lib/utils.js';
import {
  countMisscaledDays, repairHealthEnergy,
  listImplausibleDays, clearImplausibleHealth,
} from '../lib/store.js';
import { trendCharts } from './cards/trend-charts.js';
import { healthMetricsCard } from './cards/health-metrics.js';
import { weeklySummaryCard } from './cards/weekly-summary.js';

/**
 * 早期版本把 Apple 导出的 unit="Cal"（千卡）当成小卡除以了 1000，
 * 已经存进来的能量数据全部小一千倍。与其让人重新导入全部历史，
 * 不如就地乘回去 —— 判据很保守，只动量级明显不可能的那些天。
 */
function repairCard(rerender) {
  const count = countMisscaledDays();
  if (!count) return null;
  return h('section.card.card-danger', null,
    h('div.card-head', null,
      h('h3', null, '有 ' + count + ' 天的能量数据需要修正'),
      h('span.card-tag', null, '一次点击即可')),
    h('p.empty-hint', null,
      '这些天的活动能量与静息能量被记成了实际值的千分之一，'
      + '导致热量预算退化成公式估算。这是早期版本的单位换算缺陷，现已修复，'
      + '但已经存进来的历史数据需要就地修正一次。'),
    h('button.primary-btn', {
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const n = await repairHealthEnergy();
        toast(`已修正 ${n} 天的能量数据`, 'ok');
        rerender();
      },
    }, `修正这 ${count} 天`),
    h('p.form-hint', null,
      '只会改动活动能量、静息能量与膳食热量三项；步数、体重、睡眠等一律不动。'
      + '重复点击不会把正确的数据再放大。'));
}

const FIELD_LABEL = {
  restingEnergy: '静息能量', activeEnergy: '活动能量', hkKcal: '膳食热量',
  steps: '步数', exerciseMinutes: '锻炼时间', sleepMinutes: '睡眠',
};

/*
 * 和上面那张修正卡不同：这里的数不是量级错了、能算回去，而是根本不可能
 * （成人静息代谢到不了 5000 kcal）。猜不出真值，只能抹掉让人重新导入，
 * 留着的话它会一路污染热量预算和之后 14 天的基线。
 */
function implausibleCard(rerender) {
  const bad = listImplausibleDays();
  if (!bad.length) return null;
  const sample = bad.slice(0, 3).map((d) => `${d.date}（${d.fields.map((f) => FIELD_LABEL[f] || f).join('、')}）`);
  return h('section.card.card-danger', null,
    h('div.card-head', null,
      h('h3', null, `有 ${bad.length} 天的数值不可能是真的`),
      h('span.card-tag', null, '建议清掉')),
    h('p.empty-hint', null,
      sample.join('；') + (bad.length > 3 ? ` 等 ${bad.length} 天` : '')),
    h('p.form-hint', { style: { margin: '4px 0 10px' } },
      '常见原因是快捷指令里的日期范围没选「今天」，把多天累加成了一天。'
      + '这种数会把热量目标顶高一大截，也会污染近 14 天的基线，'
      + '所以先抹掉、再重新导入一次更稳妥。'),
    h('button.primary-btn', {
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const n = await clearImplausibleHealth();
        toast(`已清掉 ${n} 天的异常数值`, 'ok');
        rerender();
      },
    }, `清掉这 ${bad.length} 天的异常数值`),
    h('p.form-hint', null, '只抹掉超出生理上限的那几项，同一天里其余字段（体重、睡眠等）原样保留。'));
}






export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    healthMetricsCard(),
    // 速览在趋势图上面：先回答「这七天整体怎么样」，想看某项怎么走再往下翻
    weeklySummaryCard(),
    ...(trendCharts(rerender) || []),
  );
}
