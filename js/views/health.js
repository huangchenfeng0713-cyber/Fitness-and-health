/**
 * 数据页：今天同步上来了什么 + 这些天在往哪走。
 *
 * 健康数据摆在最上面，下面那张趋势卡画的就是同一批指标的走势，
 * 「今天多少」和「在往哪走」放同一页才不用来回切。
 * 每日目标不在这里——它是今天该吃多少，长在今日页的主卡上。
 * 解读收在每张图下面：看着那条曲线读那段话，比先看一堆汇总数字要直接。
 * 数据的维护性操作（导入 / 备份 / 补录）在设置页。
 */

import { h, clearEl, toast, mount, todayKey, runLocalAction } from '../lib/utils.js';
import {
  countMisscaledDays, repairHealthEnergy, previewEnergyRepairs, undoEnergyRepairs,
  listImplausibleDays, clearImplausibleHealth, state,
} from '../lib/store.js';
import { setIntent } from '../lib/nav.js';
import { trendCharts } from './cards/trend-charts.js';
import { healthMetricsCard } from './cards/health-metrics.js';
import { weeklySummaryCard } from './cards/weekly-summary.js';

/** 可疑记录先核对来源证据；提供预览并保留原值。 */
function repairCard(rerender) {
  const preview = previewEnergyRepairs();
  const canUndo = state.healthDays.some(d => d._energyRepair);
  if (!preview.length && !canUndo) return null;
  return h('section.card', null, h('h3', null, '能量单位修复'),
    preview.length ? h('p', null, '仅修复来源元数据证实的旧 Cal 解析错误。请核对前后值：') : null,
    preview.map(d => h('p', null, d.date + ' · ' + d.fields.map(f => (FIELD_LABEL[f.key] || f.key) + ' ' + f.before + ' → ' + f.after + ' kcal').join('；'))),
    preview.length ? h('button.primary-btn', { onclick: async ev => { const result = await runLocalAction(ev.currentTarget, () => repairHealthEnergy(preview), '修复能量单位'); if (result.ok) { toast('已修复 ' + result.value + ' 日', 'ok'); rerender(); } } }, '应用以上修复') : null,
    canUndo ? h('button.secondary-btn', { onclick: async ev => { const result = await runLocalAction(ev.currentTarget, () => undoEnergyRepairs(), '撤销单位修复'); if (result.ok) { toast('已恢复原值', 'ok'); rerender(); } } }, '撤销单位修复') : null,
    h('p.form-hint', null, '原值保留在本地记录，可撤销。仅数值偏低不会触发千倍修复。'));
}

const FIELD_LABEL = {
  restingEnergy: '静息能量', activeEnergy: '活动能量', hkKcal: '膳食热量',
  steps: '步数', exerciseMinutes: '锻炼时间', sleepMinutes: '睡眠',
};

/** 可疑记录先核对来源证据；提供预览并保留原值。 */
function implausibleCard() {
  const bad = listImplausibleDays();
  if (!bad.length) return null;
  return h('section.card', null, h('h3', null, '有 ' + bad.length + ' 天记录需要核对'),
    bad.map(d => h('p', null, d.date + ' · ' + d.fields.map(f => (FIELD_LABEL[f] || f) + '：' + state.healthByDate.get(d.date)?.[f]).join('；'))),
    h('p.form-hint', null, '这些值超出应用经验检查范围，暂不参与建议；不代表普遍生理不可能。原值保留，请核对单位、来源和日期范围后在设置中补录。'));
}


function healthSyncNudge() {
  const at = new Date(state.lastImport?.at || '');
  const now = Date.now();
  const hasHistory = Array.isArray(state.healthDays) && state.healthDays.length > 0;
  let message = '';

  if (Number.isNaN(at.getTime())) {
    message = hasHistory ? '今天还没有新的健康同步。' : '还没有健康数据，可以先导入或连接同步。';
  } else if (todayKey(at) !== todayKey()) {
    message = '今天还没有同步健康数据。';
  } else if (now - at.getTime() > 3 * 60 * 60 * 1000 || state.derived?.energyData?.stale) {
    message = '健康数据已经有一段时间没更新。';
  }
  if (!message) return null;

  return h('div.health-sync-nudge', null,
    h('span', null, message),
    h('button.text-btn', {
      type: 'button',
      onclick: () => {
        setIntent({ settingsSection: 'data' });
        document.querySelector('.topbar-settings-btn')?.click();
      },
    }, '去同步 / 导入'));
}

export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  const metrics = healthMetricsCard();
  const nudge = healthSyncNudge();
  // 健康卡自己已经给出同步按钮时，不再追加第二个同义入口。
  if (metrics && nudge && !metrics.querySelector('.health-sync-action')) metrics.append(nudge);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    metrics,
    // 速览在趋势图上面：先回答「这七天整体怎么样」，想看某项怎么走再往下翻
    weeklySummaryCard(),
    ...(trendCharts(rerender) || []),
  );
}
