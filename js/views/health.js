/** 健康数据：导入 Apple 健康导出文件、手动补录、查看已同步的每日数据 */

import { h, clearEl, num, toast, formatMinutes, mount } from '../lib/utils.js';
import { state, mergeHealthDays, saveHealthDay } from '../lib/store.js';

let importing = false;
let progressEl = null;

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/health-import.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') setProgress(msg.stage, msg.pct);
      else if (msg.type === 'done') { worker.terminate(); resolve(msg.result); }
      else if (msg.type === 'error') { worker.terminate(); reject(new Error(msg.message)); }
    };
    worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message || '导入进程出错')); };
    worker.postMessage(payload);
  });
}

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
    const result = await runWorker(payload);
    if (!result.days.length) {
      toast('文件里没有识别到可用的健康数据', 'warn');
    } else {
      await mergeHealthDays(result.days, { records: result.recordCount, types: result.types.length });
      const [from, to] = [result.days[0].date, result.days[result.days.length - 1].date];
      toast(`已导入 ${result.days.length} 天（${from} ~ ${to}）`, 'ok');
    }
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
    placeholder: '[{"date":"2026-08-21","steps":8600,"activeEnergy":520,"weightKg":71.2}]',
    rows: 3,
  });

  const last = state.lastImport;

  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '导入 Apple 健康数据')),
    drop,
    progressEl,
    h('details.paste-block', null,
      h('summary', null, '或粘贴快捷指令输出的 JSON / CSV'),
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
  const steps = [
    ['在 iPhone 上导出', '打开「健康」App → 右上角头像 → 滑到底部「导出所有健康数据」 → 生成 导出.zip（数据多时要等几分钟）。'],
    ['把文件传到这里', '导出后选择「存储到“文件”」或用隔空投送发到电脑，再回到本页上传。zip 不用解压，直接传。'],
    ['想每天自动同步？', '用「快捷指令」App 新建一个自动化：每天 23:50 获取当日健康样本（步数、活动能量、体重等）→ 文本 → 拷贝到剪贴板，然后粘贴到上面的输入框。也可以用 Health Auto Export 这类 App 定期导出 JSON 再上传。'],
    ['最少需要哪些数据？', '活动能量和体重最关键：有了它们，热量预算就会按你当天的真实消耗动态调整，而不是套用固定的活动系数。'],
  ];
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '怎么把数据弄过来')),
    h('ol.guide-list', null, steps.map(([t, d]) => h('li', null,
      h('strong', null, t), h('p', null, d)))),
  );
}

function manualCard(rerender) {
  const day = state.healthByDate.get(state.day) || {};
  const fields = [
    ['steps', '步数', '步'],
    ['activeEnergy', '活动能量', 'kcal'],
    ['exerciseMinutes', '锻炼时间', '分钟'],
    ['sleepMinutes', '睡眠', '分钟'],
    ['weightKg', '体重', 'kg'],
    ['bodyFatPct', '体脂率', '%'],
    ['waterMl', '饮水', 'ml'],
  ];
  const inputs = {};
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, `手动补录 · ${state.day}`),
      h('span.card-tag', null, '没导出数据时也能用')),
    h('div.form-grid', null, fields.map(([key, label, unit]) => {
      const input = h('input', {
        type: 'number', step: '0.1', inputmode: 'decimal',
        value: day[key] != null ? day[key] : '',
        placeholder: unit,
      });
      inputs[key] = input;
      return h('label.form-field', null, h('span', null, `${label}（${unit}）`), input);
    })),
    h('button.primary-btn', {
      onclick: async () => {
        const patch = {};
        for (const [key] of fields) {
          const v = inputs[key].value.trim();
          if (v !== '') patch[key] = Number(v);
        }
        if (!Object.keys(patch).length) { toast('没有填写任何数值', 'warn'); return; }
        await saveHealthDay(state.day, { ...patch, source: 'manual' });
        toast('已保存', 'ok');
        rerender();
      },
    }, '保存这一天的健康数据'),
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
    ['sleepMinutes', '睡眠', (v) => (v != null ? formatMinutes(v) : '—')],
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
    importCard(rerender),
    manualCard(rerender),
    dataTable(),
    guideCard(),
  );
}
