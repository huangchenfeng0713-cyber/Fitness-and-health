/** 通用工具：DOM、日期、格式化 */

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
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

/** YYYY-MM-DD（本地时区） */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return todayKey(date);
}

export function formatDayLabel(key) {
  const today = todayKey();
  if (key === today) return '今天';
  if (key === shiftDay(today, -1)) return '昨天';
  if (key === shiftDay(today, 1)) return '明天';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const week = '日一二三四五六'[date.getDay()];
  const sameYear = y === new Date().getFullYear();
  return `${sameYear ? '' : `${y}年`}${m}月${d}日 周${week}`;
}

/** 一天已过去的比例，用于实时预算分配 */
export function dayFraction(now = new Date()) {
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

export const num = (v, d = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return d > 0 ? n.toFixed(d) : String(Math.round(n));
};

/**
 * 睡眠这类按小时衡量更自然的时长。
 * 「5小时42分」在窄表格里会被截断成「5小时」，反而看不出差别；
 * 小数小时既短又能比较，一眼看出 5.7 和 6.9 的差距。
 * unit: false 用于本身就带单位槽位的地方，避免出现「5.7 小时 小时」。
 */
export function formatHours(mins, { unit = true } = {}) {
  const v = Number(mins);
  if (!Number.isFinite(v)) return '—';
  const h = Math.round((v / 60) * 10) / 10;
  return unit ? `${h} 小时` : String(h);
}

export function formatMinutes(mins) {
  if (!Number.isFinite(Number(mins))) return '—';
  const m = Math.round(Number(mins));
  return m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? `${m % 60}分` : ''}` : `${m}分钟`;
}

/** 轻量提示条 */
let toastTimer = null;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div.toast', { id: 'toast' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
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
