/** 数据中心：集中管理 Apple 健康同步、应用备份、手动补录与健康数据查看。 */

import {
  h, clearEl, num, toast, formatMinutes, formatHours, mount, confirmAction, download, infoTip,
} from '../lib/utils.js';
import {
  state, saveHealthDay, saveProfile, countMisscaledDays, repairHealthEnergy,
  listImplausibleDays, clearImplausibleHealth, clearAllData, db,
} from '../lib/store.js';
import { healthInsights, healthSummary } from '../core/health-insights.js';
import { isPlausibleHealthValue } from '../core/health.js';
import { runImportWorker, applyImport } from '../lib/importer.js';

let importing = false;
let progressEl = null;

function setProgress(stage, pct) {
  if (!progressEl) return;
  progressEl.hidden = false;
  const bar = progressEl.querySelector('.progress-fill');
  const text = progressEl.querySelector('.progress-text');
  if (bar && pct != null) bar.style.width = `${Math.max(2, Math.min(100, pct))}%`;
  if (text) text.textContent = stage || '';
}

async function handleImport(payload, rerender) {
  if (importing) return;
  importing = true;
  try {
    setProgress('准备中…', 1);
    const result = await runImportWorker({
      ...payload,
      sourcePriority: state.profile.appleSourcePriority || [],
    }, (m) => setProgress(m.stage, m.pct));
    const outcome = await applyImport(result);
    toast(outcome.ok
      ? (outcome.days ? `同步完成：已更新 ${outcome.days} 天健康数据` : 'Apple 健康快照已同步')
      : outcome.message, outcome.ok ? 'ok' : 'warn');
  } catch (err) {
    console.error(err);
    toast(`导入失败：${err.message}`, 'error');
  } finally {
    importing = false;
    setProgress('', 0);
    if (progressEl) progressEl.hidden = true;
    rerender();
  }
}

function importQualityItems(last) {
  const q = last?.quality || {};
  const items = [];
  if (last?.fullSnapshot != null) items.push(last.fullSnapshot ? '导入方式：完整快照' : '导入方式：增量合并');
  if (last?.sourceFormat) items.push(`文件格式：${last.sourceFormat === 'apple-health-export' ? 'Apple 官方导出' : last.sourceFormat}`);
  if (last?.records) items.push(`解析 ${num(last.records)} 条原始健康记录`);
  if (q.duplicateRecords) items.push(`去除 ${num(q.duplicateRecords)} 条完全重复样本`);
  if (q.overlapBuckets) items.push(`处理 ${num(q.overlapBuckets)} 个多来源重叠时间段`);
  if (q.sleepOverlapMinutes) items.push(`合并 ${num(q.sleepOverlapMinutes)} 分钟重叠睡眠`);
  if (q.activitySummaryDays) items.push(`${num(q.activitySummaryDays)} 天采用 Apple 活动圆环日汇总`);
  if (last?.workoutCount) items.push(`识别 ${num(last.workoutCount)} 次锻炼，未重复计入活动能量`);
  if (q.invalidRecords) items.push(`隔离 ${num(q.invalidRecords)} 条异常数值`);
  if (q.unsupportedRecords) items.push(`保留报告 ${num(q.unsupportedRecords)} 条暂未支持的记录`);
  if (q.unsupportedXmlElementCount) items.push(`安全跳过 ${num(q.unsupportedXmlElementCount)} 个暂未支持的 XML 元素`);
  if (q.truncatedXml) items.push('文件未完整闭合，本次已自动降级为增量合并');
  return items;
}

function lastSyncPanel(last) {
  if (!last) return h('div.sync-empty', null,
    h('strong', null, '尚未同步 Apple 健康'),
    h('span', null, '第一次建议使用“健康 App 完整导出”，以后可用快捷指令补充当天数据。'));
  const when = new Date(last.at);
  const at = Number.isNaN(when.getTime()) ? '时间未知' : when.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const range = last.range?.length === 2 ? `${last.range[0]} 至 ${last.range[1]}` : '日期范围未知';
  const details = importQualityItems(last);
  const sources = last.quality?.sourceCoverage?.map((source) => source.sourceName).filter(Boolean) || [];
  if (sources.length) details.splice(2, 0, `识别 ${sources.length} 个数据来源`);
  return h('div.sync-result', null,
    h('div.sync-result-head', null,
      h('div', null, h('strong', null, `已同步 ${num(last.days)} 天`), h('span', null, range)),
      h('time', null, at)),
    details.length && h('details.sync-details', null,
      h('summary', null, '导入详情'),
      h('ul', null, details.map((item) => h('li', null, item))),
      sources.length && h('p', null, `识别来源：${sources.slice(0, 6).join('、')}${sources.length > 6 ? '等' : ''}`)));
}

function backupPanel(rerender) {
  const restoreInput = h('input', {
    type: 'file', accept: '.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        if (payload?.app !== 'health-diet-tracker') {
          throw new Error('这不是本应用导出的完整备份；Apple 健康文件请在“同步 Apple 健康”中选择');
        }
        const healthCount = Array.isArray(payload.health) ? payload.health.length : 0;
        const dietCount = Array.isArray(payload.diet) ? payload.diet.length : 0;
        const ok = confirmAction(
          `恢复后会替换当前设备里的全部健康、饮食、设置和自定义食物。\n\n`
          + `所选备份：健康 ${healthCount} 天，饮食 ${dietCount} 条。\n\n继续恢复吗？`,
        );
        if (!ok) return;
        const counts = await db.importAll(payload);
        toast(`恢复完成：健康 ${counts.health} 天，饮食 ${counts.diet} 条`, 'ok');
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        toast(`恢复失败：${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    },
  });

  return h('div.data-actions', null,
      h('div.data-action', null,
        h('div.data-action-icon', null, '↓'),
        h('div.data-action-copy', null,
          h('strong', null, '导出当前完整备份'),
          h('span', null, '下载到“文件”，换设备或清缓存前保存一份。')),
        h('button.secondary-btn.compact', {
          onclick: async () => {
            const payload = await db.exportAll();
            download(`健康饮食备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
            toast('完整备份已下载', 'ok');
          },
        }, '导出')),
      h('div.data-action', null,
        h('div.data-action-icon', null, '↺'),
        h('div.data-action-copy', null,
          h('strong', null, '恢复完整备份'),
          h('span', null, '会先确认再整体替换当前本地数据，不与现有数据混合。')),
        h('label.secondary-btn.compact', null, '选择备份', restoreInput)),
      h('div.data-action.danger', null,
        h('div.data-action-icon', null, '×'),
        h('div.data-action-copy', null,
          h('strong', null, '清空本机数据'),
          h('span', null, '删除本设备上的全部内容；无法撤销。')),
        h('button.secondary-btn.compact.danger', {
          onclick: async () => {
            if (!confirmAction('确定清空全部本地数据？此操作不可撤销。建议先导出完整备份。')) return;
            await clearAllData();
            toast('本机数据已清空', 'ok');
            rerender();
          },
        }, '清空')));
}

function importPanel(rerender) {
  const input = h('input', {
    type: 'file',
    accept: '.zip,.xml,.json,.csv',
    hidden: true,
    onchange: (e) => {
      const file = e.target.files?.[0];
      if (file) handleImport({ file }, rerender);
      e.target.value = '';
    },
  });

  const drop = h('div.dropzone', {
    onclick: () => input.click(),
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    ondragleave: (e) => e.currentTarget.classList.remove('over'),
    ondrop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImport({ file }, rerender);
    },
  },
  h('div.dropzone-icon', null, '↥'),
  h('strong', null, '选择 Apple 健康导出文件'),
  h('span', null, '首次同步可选“导出.zip”；日常同步也支持 JSON / CSV'),
  h('div.file-types', null, ['ZIP', 'XML', 'JSON', 'CSV'].map((type) => h('span', null, type))),
  input);

  progressEl = h('div.progress', { hidden: true },
    h('div.progress-track', null, h('div.progress-fill')),
    h('div.progress-text'));

  const pasteArea = h('textarea.paste-area', {
    placeholder: '{"date":"2026-08-21","steps":8600,"activeEnergy":520,"weight":71.2}',
    rows: 4,
  });

  const clipboardBtn = h('button.primary-btn.import-clipboard', {
    onclick: async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) { toast('剪贴板是空的', 'warn'); return; }
        handleImport({ text: text.trim() }, rerender);
      } catch {
        toast('浏览器不允许读剪贴板，请用下面的粘贴框', 'warn');
      }
    },
  }, '从快捷指令剪贴板同步今天');

  const last = state.lastImport;
  const detectedSources = last?.quality?.sourceCoverage
    ?.map((source) => source.sourceName).filter(Boolean) || [];
  const priorityInput = h('textarea.paste-area', {
    rows: 4,
    placeholder: 'Apple Watch\niPhone\n第三方 App',
    value: (state.profile.appleSourcePriority || []).join('\n'),
  });
  const priorityEditor = h('details.paste-block', null,
    h('summary', null, '高级：统一数据来源优先级'),
    h('p.form-hint', { style: { margin: '4px 0 8px' } },
      '每行一个 export.xml 中的 sourceName，越靠上越优先；不确定时请留空，应用会自动处理。'),
    detectedSources.length && h('p.form-hint', null,
      `上次检测到：${detectedSources.join('、')}`),
    priorityInput,
    h('button.secondary-btn.full', {
      onclick: async () => {
        const priority = [...new Set(priorityInput.value.split(/\r?\n/)
          .map((value) => value.trim()).filter(Boolean))];
        await saveProfile({ appleSourcePriority: priority });
        toast(priority.length ? '来源优先级已保存，下次导入生效' : '已恢复自动来源解析', 'ok');
      },
    }, '保存来源顺序'));

  return h('div.import-panel', null,
    drop,
    progressEl,
    clipboardBtn,
    h('details.paste-block', null,
      h('summary', null, '手动粘贴快捷指令输出'),
      h('p.form-hint', { style: { margin: '4px 0 8px' } },
        '支持一条或多条 JSON / CSV。每条数据都要有 date；完整应用备份请在“本应用备份与恢复”中选择。'),
      pasteArea,
      h('button.secondary-btn.full', {
        onclick: () => {
          const text = pasteArea.value.trim();
          if (!text) { toast('先粘贴内容', 'warn'); return; }
          handleImport({ text }, rerender);
          pasteArea.value = '';
        },
      }, '解析并同步')),
    lastSyncPanel(last),
    priorityEditor,
  );
}

function guidePanel() {
  const shortcutRecipe = [
    '打开「快捷指令」App → 右上角 + 新建',
    '添加「查找健康样本」，类型选“步数”，日期范围选“今天”，并计算总计',
    '重复上一步，把类型换成：活动能量、静息能量、锻炼分钟数、体重、体脂率、睡眠分析',
    '添加“文本”，按示例组成带 date 的 JSON，并把各项替换为对应的魔法变量',
    '最后添加“拷贝到剪贴板”，保存快捷指令',
  ];

  const automationRecipe = [
    '快捷指令 → 自动化 → + → 特定时间，设为每天 23:50',
    '选择“立即运行”，并运行刚才保存的快捷指令',
    '之后打开本应用的数据页，在“同步 Apple 健康”中点剪贴板同步',
  ];

  return h('div.guide-panel', null,
    h('div.method', null,
      h('div.method-head', null, h('span.method-badge.fast', null, '日常'), h('strong', null, '快捷指令同步')),
      h('p', null, '适合每天补充当天数据。首次配置后，只需在数据页点一次剪贴板同步。'),
      h('details', null,
        h('summary', null, '创建取数快捷指令'),
        h('ol.guide-list', null, shortcutRecipe.map((t) => h('li', null, t)))),
      h('details', null,
        h('summary', null, '设置每日自动运行'),
        h('ol.guide-list', null, automationRecipe.map((t) => h('li', null, t))))),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge', null, '首次'), h('strong', null, '健康 App 完整导出')),
      h('p', null, '「健康」App → 右上角头像 → 滑到底部「导出所有健康数据」→ 得到 导出.zip，'
        + '无需解压，直接在同步区选择。')),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge', null, '可选'), h('strong', null, '第三方导出工具')),
      h('p', null, '支持导入常见工具生成的 JSON / CSV；请先确认文件中每条记录都有 date。')),
  );
}

function manualPanel(rerender) {
  const day = state.healthByDate.get(state.day) || {};
  const fields = [
    ['steps', '步数', '步'],
    ['activeEnergy', '活动能量', 'kcal'],
    ['exerciseMinutes', '锻炼时间', '分钟'],
    ['sleepMinutes', '睡眠', '小时', 60],
    ['weightKg', '体重', 'kg'],
    ['bodyFatPct', '体脂率', '%'],
    ['waterMl', '饮水', 'ml'],
  ];
  const inputs = {};
  return h('div.manual-panel', null,
    h('div.form-grid', null, fields.map(([key, label, unit, scale]) => {
      const input = h('input', {
        type: 'number', step: '0.1', inputmode: 'decimal',
        // scale 是「填进去的单位 → 存起来的单位」的倍数：睡眠按小时填，内部仍按分钟存
        value: day[key] != null ? (scale ? Math.round((day[key] / scale) * 10) / 10 : day[key]) : '',
        placeholder: unit,
      });
      inputs[key] = input;
      return h('label.form-field', null, h('span', null, `${label}（${unit}）`), input);
    })),
    h('button.primary-btn', {
      onclick: async () => {
        const patch = {};
        for (const [key, , , scale] of fields) {
          const v = inputs[key].value.trim();
          if (v !== '') patch[key] = scale ? Number(v) * scale : Number(v);
        }
        if (!Object.keys(patch).length) { toast('没有填写任何数值', 'warn'); return; }
        const invalid = Object.entries(patch).find(([key, value]) => !isPlausibleHealthValue(key, value));
        if (invalid) { toast(`${invalid[0]} 的数值不合理，请检查单位`, 'warn'); return; }
        await saveHealthDay(state.day, { ...patch, source: 'manual' });
        toast('已保存', 'ok');
        rerender();
      },
    }, '保存这一天的健康数据'),
  );
}

function managerSection(icon, title, subtitle, content, open = false) {
  return h('details.manager-section', { open },
    h('summary', null,
      h('span.manager-icon', null, icon),
      h('span.manager-summary-copy', null,
        h('strong', null, title),
        h('span', null, subtitle)),
      h('span.manager-chevron', { 'aria-hidden': 'true' }, '›')),
    h('div.manager-panel', null, content));
}

/** 同步、补录、恢复和说明只出现一次，并统一放在结果之后。 */
function dataManagerCard(rerender) {
  const last = state.lastImport;
  const lastHint = last?.days
    ? `上次同步 ${num(last.days)} 天${last.range?.[1] ? ` · 至 ${last.range[1]}` : ''}`
    : '从健康 App、快捷指令或导出文件同步';
  return h('section.card.data-manager#data-manager', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, '数据管理'),
        h('p.card-desc', null, '需要同步、补录、换设备或恢复时再展开。')),
      h('div.card-head-actions', null,
        infoTip('查看数据来源说明',
          h('p', null, h('strong', null, '同步 Apple 健康：'),
            '只更新身体与活动数据，不会改动饮食记录。'),
          h('p', null, h('strong', null, '手动补录：'),
            '只保存你填写的当天字段。'),
          h('p', null, h('strong', null, '恢复完整备份：'),
            '会替换本应用的健康、饮食、设置和自定义食物。'),
          h('p', null, '文件只在当前设备读取，不会上传到服务器。')))),
    h('div.manager-list', null,
      managerSection('↥', '同步 Apple 健康', lastHint, importPanel(rerender)),
      managerSection('＋', `手动补录 · ${state.day}`, '补充当天缺少的健康字段', manualPanel(rerender)),
      managerSection('↺', '本应用备份与恢复', '导出、换设备、恢复或清空本机数据', backupPanel(rerender)),
      managerSection('?', '同步帮助', '首次完整导出与日常快捷指令步骤', guidePanel())),
  );
}

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

/** 把同步来的数字翻译成「这意味着什么、该怎么做」 */
function insightCard() {
  const summary = healthSummary(state.healthDays, 14, state.day);
  const list = healthInsights(state.healthDays, {
    targets: state.derived?.targets,
    dietDaily: state.dietDaily,
    asOfDate: state.day,
  });

  const cells = [
    ['日均步数', summary.steps, '步'],
    ['日均活动', summary.activeEnergy, 'kcal'],
    ['日均锻炼', summary.exerciseMinutes, '分钟'],
    ['日均睡眠', summary.sleepHours, '小时'],
    ['静息心率', summary.restingHR, 'bpm'],
    ['平均体脂率', summary.bodyFatPct, '%'],
  ].filter(([, v]) => v != null);

  return h('section.card', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, '健康概览'),
        h('p.card-desc', null, '近期身体与活动变化，一眼查看。')),
      h('div.card-head-actions', null,
        summary.days ? h('span.card-tag', null, `${summary.days} 个记录日`) : null,
        infoTip('查看统计口径',
          h('p', null, '摘要按截至所选日期的最近 14 个日历日计算；只统计实际存在的字段，缺失不会当成 0。')))),
    cells.length ? h('div.health-strip', null, cells.map(([k, v, u]) => h('div.health-cell', null,
      h('div.health-value', null, num(v, u === '小时' || u === '%' ? 1 : 0), h('span.health-unit', null, u)),
      h('div.health-label', null, k)))) : null,
    h('div.insight-list', { style: { marginTop: cells.length ? '16px' : '0' } },
      list.map((i) => h(`div.insight.${i.level}`, null,
        h('div.insight-title', null, i.title),
        h('div.insight-text', null, i.text)))),
    !cells.length && h('button.secondary-btn.full', {
      onclick: () => document.getElementById('data-manager')?.scrollIntoView({ behavior: 'smooth' }),
    }, '添加健康数据'),
  );
}

function dataTable() {
  const eligible = state.healthDays.filter((d) => d.date <= state.day);
  const rows = eligible.slice(-14).reverse();
  if (!rows.length) return null;
  const cols = [
    ['date', '日期', (v) => v],
    ['steps', '步数', (v) => (v != null ? num(v) : '—')],
    ['activeEnergy', '活动', (v) => (v != null ? `${num(v)}` : '—')],
    ['restingEnergy', '静息', (v) => (v != null ? `${num(v)}` : '—')],
    ['exerciseMinutes', '锻炼', (v) => (v != null ? formatMinutes(v) : '—')],
    ['sleepMinutes', '睡眠', (v) => (v != null ? formatHours(v) : '—')],
    ['weightKg', '体重', (v) => (v != null ? num(v, 1) : '—')],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '最近记录'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `最近 ${rows.length} 个记录日 / 截至所选日共 ${eligible.length} 天`),
        infoTip('查看表格说明',
          h('p', null, '每行是一天的汇总结果；活动与静息能量单位为 kcal。')))),
    h('div.table-wrap', null, h('table.data-table', null,
      h('thead', null, h('tr', null, cols.map(([, label]) => h('th', null, label)))),
      h('tbody', null, rows.map((r) => h('tr', {
        class: r.date === state.day ? 'current' : '',
      }, cols.map(([key, , fmt]) => h('td', null, fmt(r[key])))))))),
  );
}

export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    insightCard(),
    dataTable(),
    dataManagerCard(rerender),
  );
}
