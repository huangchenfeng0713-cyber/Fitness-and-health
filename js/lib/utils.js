/** 通用工具：DOM、日期、格式化 */

/*
 * 自定义属性（--foo）必须走 setProperty。
 * Object.assign(el.style, { '--metric-cols': '4' }) 不报错也不生效——
 * 健康数据的列数就是这么静默失灵的，排版看着没变，查了半天才发现值根本没写进去。
 */
function applyStyle(el, styles) {
  for (const [key, value] of Object.entries(styles)) {
    if (value == null) continue;
    if (key.startsWith('--')) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

/** 极简 DOM 构建器：h('div.card#main', {onclick}, ...children) */
export function h(spec, props = null, ...children) {
  const parts = String(spec).split('.');
  let tag = parts.shift() || 'div';
  let id = null;
  // 支持 tag#id 与 .class#id 两种写法
  const takeId = (token) => {
    const i = token.indexOf('#');
    if (i === -1) return token;
    id = token.slice(i + 1);
    return token.slice(0, i);
  };
  tag = takeId(tag) || 'div';
  const classes = parts.map(takeId).filter(Boolean);
  const el = document.createElement(tag);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = `${el.className} ${v}`.trim();
      else if (k === 'style' && typeof v === 'object') applyStyle(el, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/**
 * 往已有节点里挂子元素。
 *
 * 别直接用原生 el.append()：它既不展开数组（会得到
 * "[object HTMLButtonElement]"），也不忽略 null/false
 * （会渲染出字面量 "null"）。这个包装和 h() 用同一套规则。
 */
export function mount(el, ...children) {
  appendChildren(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/**
 * 把不影响主流程的补充说明收进一个可点击的小圆点里。
 * 使用原生 details，键盘、读屏和无 JavaScript 的场景都能正常展开。
 */
/**
 * 表单字段：标签 + 控件 + 可选说明。
 *
 * 放在 utils 而不是某张卡片里：身体信息、账号、反馈都在用它，
 * 之前它跟着身体信息卡搬进 cards/profile.js，设置页当场整个白屏
 * （field is not defined）。通用的东西就该住在通用的地方。
 */
export function field(label, control, hint, extraClass = '') {
  return h(`label.form-field${extraClass ? `.${extraClass}` : ''}`, null,
    h('span', null, label),
    control,
    hint && h('small.field-hint', null, hint));
}

/*
 * 点开的说明层，点外面就该收起来。
 *
 * <details> 原生只认 summary 上的点击：说明打开之后，用户以为随便点一下别处
 * 就能关掉，结果它一直挂在那儿，非得回去再点一次那个感叹号。
 *
 * 监听器只装一次（挂在 document 上，靠 closest 判断点在不在自己里面），
 * 不能每建一个 infoTip 就装一个 —— 列表里几十条记录就是几十个监听器。
 */
let infoTipDismissBound = false;

function bindInfoTipDismiss() {
  if (infoTipDismissBound) return;
  infoTipDismissBound = true;
  const closeOthers = (except) => {
    document.querySelectorAll('details.info-tip[open]').forEach((tip) => {
      if (tip !== except) tip.open = false;
    });
  };
  /*
   * 用 click 而不是 pointerdown：pointerdown 早于原生的 summary 切换，
   * 点感叹号本身会变成「先被这里关掉、再被原生打开」，闪一下。
   * 点在自己的说明层里不关 —— 里面可能要选中文字或者点链接。
   */
  document.addEventListener('click', (event) => {
    closeOthers(event.target.closest?.('details.info-tip') || null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeOthers(null);
  });
}

/*
 * 界面上的符号一律画出来，不打出来。
 *
 * 打出来的 × ‹ › ⌄ 在三个平台上是三种字形、三种基线和三种粗细：和旁边的中文
 * 对不齐，也没法跟底栏、健康数据那几个描边图标统一。全部换成同一套描边路径。
 */
const ICON_PATH = {
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 19V5M6.5 10.5L12 5l5.5 5.5M5 20.5h14',
  restore: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.2 5v4h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.6M12 17v.1',
};

/**
 * 描边图标。size 只影响这一个图标，颜色一律跟着 currentColor。
 * `cls` 用来接住原来那个 <span> 身上的定位类 —— 换成图标不该把布局一起换掉。
 */
export function icon(name, { size = 18, strokeWidth = 1.9, cls = '' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ui-icon ui-icon-${name}${cls ? ` ${cls}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICON_PATH[name] || ICON_PATH.close);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', String(strokeWidth));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function infoTip(label, ...children) {
  bindInfoTipDismiss();
  const details = h('details.info-tip', null,
    h('summary', { 'aria-label': label, title: label }, '!'),
    h('div.info-tip-panel', { role: 'note' }, children));
  return details;
}

/**
 * 复制到剪贴板。
 *
 * navigator.clipboard 在非安全上下文（http 局域网自建、旧 WebView）里根本不存在，
 * 直接调用会抛 TypeError 而不是返回失败。退回 execCommand 那条老路，
 * 至少让用户还能把内容拿出去。
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 落到下面的兜底 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/*
 * 日期那几个纯函数搬去了 core/day.js —— 顶栏那行字该怎么写是「判断」，
 * 得能写测试。这里原样再导出一遍，免得几十处 import 全要改。
 */
export {
  todayKey, shiftDay, dayFraction, dayOffset, dayHeading,
} from '../core/day.js';

export const num = (v, d = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return d > 0 ? n.toFixed(d) : String(Math.round(n));
};

/*
 * 时长的写法搬去了 core/duration.js —— 主卡的提示和数据页的卡片要说同一句话，
 * 而 core 里的 buildInsights 不能 import lib。这里再导出一遍。
 *
 * 小数小时（`6.7 小时`）那个写法已经删掉：它只在图表纵轴上说得通，
 * 摆到卡片上就得让人把 0.7 乘回 60 才知道是多久。
 */
export { formatDuration } from '../core/duration.js';

/** 轻量提示条 */
let toastTimer = null;
/**
 * 轻量提示条。
 *
 * @param {object} [action] 提示条上挂一个动作，比如「撤销」。
 *   删除是最需要它的场景：确认框会打断每一次删除，而十次里有九次是想删的；
 *   删完给一条能点回来的提示，代价只落在那一次点错上。
 */
export function toast(message, kind = 'info', action = null) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div.toast', {
      id: 'toast',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    });
    document.body.append(el);
  }
  const text = String(message ?? '');
  clearEl(el);
  mount(el, h('span.toast-text', null, text));
  if (action?.label && typeof action.onAction === 'function') {
    mount(el, h('button.toast-action', {
      type: 'button',
      onclick: () => {
        clearTimeout(toastTimer);
        el.className = 'toast';
        action.onAction();
      },
    }, action.label));
  }
  el.dataset.long = text.length > 42 ? 'true' : 'false';
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  /*
   * 短提示停留 2.8 秒；带撤销的多留一会儿 —— 看清「删掉了什么」再决定要不要点回来，
   * 2.8 秒不够。较长的错误说明也多留一点阅读时间。
   */
  const base = action ? 5200 : 2800;
  const duration = Math.min(7000, Math.max(base, 1800 + text.length * 38));
  toastTimer = setTimeout(() => { el.className = 'toast'; }, duration);
}

/**
 * 执行会写入本地数据的界面操作。
 *
 * IndexedDB 写入失败时，不能把按钮永远留在 disabled 状态，也不能只在控制台报错，
 * 否则用户看到的就只是“点了没反应”。返回 ok 让调用方只在真正成功后更新界面。
 */
export async function runLocalAction(control, action, failureLabel = '保存') {
  const wasDisabled = Boolean(control?.disabled);
  if (control) control.disabled = true;
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    console.error(`${failureLabel}失败`, error);
    const name = String(error?.name || '');
    const message = name === 'QuotaExceededError'
      ? `${failureLabel}失败：本机存储空间不足`
      : ['InvalidStateError', 'NotAllowedError', 'SecurityError'].includes(name)
        ? `${failureLabel}失败：浏览器本地存储不可用`
        : `${failureLabel}失败，请刷新后重试`;
    toast(message, 'error');
    return { ok: false, error };
  } finally {
    if (control) control.disabled = wasDisabled;
  }
}

/** 简易确认框（用原生 confirm，避免额外依赖） */
export const confirmAction = (msg) => window.confirm(msg);

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
