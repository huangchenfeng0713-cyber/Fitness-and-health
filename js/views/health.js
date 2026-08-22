/** 健康数据：导入 Apple 健康导出文件、手动补录、查看已同步的每日数据 */

import { h, clearEl, num, toast, formatMinutes, formatHours, mount } from '../lib/utils.js';
import { state, saveHealthDay, countMisscaledDays, repairHealthEnergy,
  listImplausibleDays, clearImplausibleHealth } from '../lib/store.js';
import { healthInsights, healthSummary } from '../core/health-insights.js';
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
    const result = await runImportWorker(payload, (m) => setProgress(m.stage, m.pct));
    const outcome = await applyImport(result);
    toast(outcome.message, outcome.ok ? 'ok' : 'warn');
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

function importCard(rerender) {
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
  h('div.dropzone-icon', null, '⬆'),
  h('strong', null, '选择或拖入健康导出文件'),
  h('span', null, '支持 导出.zip / export.xml / JSON / CSV，几百 MB 也能流式解析'),
  input);

  progressEl = h('div.progress', { hidden: true },
    h('div.progress-track', null, h('div.progress-fill')),
    h('div.progress-text'));

  const pasteArea = h('textarea.paste-area', {
    placeholder: '{"date":"2026-08-21","steps":8600,"activeEnergy":520,"weight":71.2}',
    rows: 4,
  });

  const clipboardBtn = h('button.secondary-btn', {
    onclick: async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) { toast('剪贴板是空的', 'warn'); return; }
        handleImport({ text: text.trim() }, rerender);
      } catch {
        toast('浏览器不允许读剪贴板，请用下面的粘贴框', 'warn');
      }
    },
  }, '从剪贴板读取');

  const last = state.lastImport;

  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '导入 Apple 健康数据')),
    drop,
    progressEl,
    h('div.btn-row', { style: { marginTop: '12px' } }, clipboardBtn),
    h('details.paste-block', null,
      h('summary', null, '或粘贴快捷指令输出的 JSON / CSV'),
      h('p.form-hint', { style: { margin: '4px 0 8px' } },
        '单条记录、多条数组、CSV 都行。字段名大小写、下划线、多余空格都会自动归一化，'
        + '常见叫法（weight / body_mass / 体重）也认得。只有 date 是必需的。'),
      pasteArea,
      h('button.secondary-btn.full', {
        onclick: () => {
          const text = pasteArea.value.trim();
          if (!text) { toast('先粘贴内容', 'warn'); return; }
          handleImport({ text }, rerender);
          pasteArea.value = '';
        },
      }, '解析并导入')),
    last && h('p.import-meta', null,
      `上次导入：${new Date(last.at).toLocaleString('zh-CN')} · ${last.days} 天`,
      last.range ? ` · ${last.range[0]} ~ ${last.range[1]}` : '',
      last.records ? ` · ${num(last.records)} 条原始记录` : ''),
    h('p.privacy-note', null, '所有数据只保存在这台设备的浏览器里，不会上传到任何服务器。'),
  );
}

function guideCard() {
  const shortcutRecipe = [
    '打开「快捷指令」App → 右上角 + 新建',
    '添加「查找健康样本」，类型选「步数」，'
      + '「排序方式：开始日期／降序」，日期范围选「今天」，勾选「计算统计数据：总计」',
    '重复上一步，把类型换成：活动能量、静息能量、锻炼分钟数、体重、体脂率、睡眠分析',
    '添加「文本」，内容写成 JSON：'
      + '[{"date":"当前日期","steps":步数总计,"activeEnergy":活动能量,"weightKg":体重}]'
      + '（花括号里的中文换成上面各步的「魔法变量」）',
    '最后加「拷贝到剪贴板」，存好并给它起个名字',
  ];

  // 把「每天记得跑一次」这一步也交给系统。剩下那一下点击省不掉：
  // iOS 不允许网页在没有用户手势时读剪贴板。
  const automationRecipe = [
    '「快捷指令」App → 底部「自动化」→ 右上角 + → 选「特定时间」',
    '时间设 23:50、重复选「每天」',
    '关键一步：把「运行前询问」关掉（新版 iOS 里是选「立即运行」），'
      + '否则每天还要点一次通知才跑',
    '下一步选刚才存的那条快捷指令 → 完成',
    '之后每天数据会自动躺在剪贴板里，打开本 App 在「今日」页点一下「一键导入」就行',
  ];

  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '三种同步方式，按省事程度排')),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge.fast', null, '最快'), h('strong', null, '快捷指令 + 定时自动化')),
      h('p', null, '配置一次，之后每天只剩一下：定时自动化在后台把当天数据拷进剪贴板，'
        + '打开 App 在「今日」页点一下「一键导入」。'),
      h('p.form-hint', { style: { margin: '2px 0 8px' } },
        '说明：网页读不到 Apple 健康（iOS 没给 Safari 这个接口），所以同步绕不开快捷指令；'
        + '而读剪贴板必须有一次点击，系统还会再弹一次「粘贴」确认。'
        + '真正的全自动做不到，这已经是最省的路径。'),
      h('details', null,
        h('summary', null, '第一步：做一条取数的快捷指令'),
        h('ol.guide-list', null, shortcutRecipe.map((t) => h('li', null, t)))),
      h('details', null,
        h('summary', null, '第二步：让它每天自己跑'),
        h('ol.guide-list', null, automationRecipe.map((t) => h('li', null, t))))),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge', null, '较快'), h('strong', null, '第三方导出 App')),
      h('p', null, 'Health Auto Export 这类 App 可以定时把健康数据导成 JSON/CSV 存到「文件」或云盘，'
        + '本页直接上传即可，格式会自动识别。适合想要长期自动归档的情况。')),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge', null, '最全'), h('strong', null, '官方完整导出')),
      h('p', null, '「健康」App → 右上角头像 → 滑到底部「导出所有健康数据」→ 得到 导出.zip，'
        + '不用解压直接传。数据量大时要等几分钟，适合第一次导入全部历史。')),

    h('p.form-hint', null, '最关键的两项是活动能量和体重：有了它们，热量预算就会按你当天的真实消耗动态调整，'
      + '而不是套用固定的活动系数。'),
  );
}

function manualCard(rerender) {
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
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, `手动补录 · ${state.day}`),
      h('span.card-tag', null, '没导出数据时也能用')),
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
        await saveHealthDay(state.day, { ...patch, source: 'manual' });
        toast('已保存', 'ok');
        rerender();
      },
    }, '保存这一天的健康数据'),
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
  const summary = healthSummary(state.healthDays);
  const list = healthInsights(state.healthDays, {
    targets: state.derived?.targets,
    dietDaily: state.dietDaily,
  });

  const cells = [
    ['日均步数', summary.steps, '步'],
    ['日均活动', summary.activeEnergy, 'kcal'],
    ['日均锻炼', summary.exerciseMinutes, '分钟'],
    ['日均睡眠', summary.sleepHours, '小时'],
    ['静息心率', summary.restingHR, 'bpm'],
    ['体脂率', summary.bodyFatPct, '%'],
  ].filter(([, v]) => v != null);

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '健康解读'),
      h('span.card-tag', null, summary.days ? `基于近 ${summary.days} 天` : '')),
    cells.length ? h('div.health-strip', null, cells.map(([k, v, u]) => h('div.health-cell', null,
      h('div.health-value', null, num(v, u === '小时' || u === '%' ? 1 : 0), h('span.health-unit', null, u)),
      h('div.health-label', null, k)))) : null,
    h('div.insight-list', { style: { marginTop: cells.length ? '16px' : '0' } },
      list.map((i) => h(`div.insight.${i.level}`, null,
        h('div.insight-title', null, i.title),
        h('div.insight-text', null, i.text)))),
  );
}

function dataTable() {
  const rows = [...state.healthDays].slice(-14).reverse();
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
      h('h3', null, '已同步的数据'),
      h('span.card-tag', null, `最近 14 天 / 共 ${state.healthDays.length} 天`)),
    h('div.table-wrap', null, h('table.data-table', null,
      h('thead', null, h('tr', null, cols.map(([, label]) => h('th', null, label)))),
      h('tbody', null, rows.map((r) => h('tr', {
        class: r.date === state.day ? 'current' : '',
      }, cols.map(([key, , fmt]) => h('td', null, fmt(r[key])))))))),
    h('p.form-hint', null, '活动 / 静息单位为 kcal。点击顶部日期可切换到任意一天查看。'),
  );
}

export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    insightCard(),
    importCard(rerender),
    manualCard(rerender),
    dataTable(),
    guideCard(),
  );
}
