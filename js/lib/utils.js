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
 * 就能关掉，结果它一直挂在那儿，非得回去再点一次信息按钮。
 *
 * 监听器只装一次（挂在 document 上，靠 closest 判断点在不在自己里面），
 * 不能每建一个 infoTip 就装一个 —— 列表里几十条记录就是几十个监听器。
 */
let infoTipDismissBound = false;
let infoTipPositionFrame = 0;

function infoTipViewport() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  };
}

function placeInfoTip(details) {
  if (!details?.open || !details.isConnected) return;
  const summary = details.querySelector(':scope > summary');
  const panel = details.querySelector(':scope > .info-tip-panel');
  if (!summary || !panel) return;

  const viewport = infoTipViewport();
  const margin = 12;
  const gap = 8;
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const anchor = summary.getBoundingClientRect();

  /*
   * 先把说明层放进可见区域再测量。visibility:hidden 仍参与布局，既不会闪到
   * 屏幕左上角，也能拿到真实宽高。随后选择空间更充足的一侧，并把横向位置
   * 夹在可视视口内。iOS 键盘出现时 visualViewport 会缩小，这里也会跟着避让。
   */
  panel.dataset.positioned = 'false';
  panel.style.left = `${viewport.left + margin}px`;
  panel.style.top = `${viewport.top + margin}px`;
  panel.style.maxHeight = '';

  const below = Math.max(0, viewportBottom - anchor.bottom - gap - margin);
  const above = Math.max(0, anchor.top - viewport.top - gap - margin);
  const naturalHeight = Math.min(panel.scrollHeight, 420);
  const placeBelow = below >= Math.min(naturalHeight, 180) || below >= above;
  const available = Math.max(96, placeBelow ? below : above);
  panel.style.maxHeight = `${Math.floor(available)}px`;

  const measured = panel.getBoundingClientRect();
  const left = Math.min(
    Math.max(anchor.left + (anchor.width - measured.width) / 2, viewport.left + margin),
    Math.max(viewport.left + margin, viewportRight - measured.width - margin),
  );
  const top = placeBelow
    ? Math.min(anchor.bottom + gap, viewportBottom - measured.height - margin)
    : Math.max(viewport.top + margin, anchor.top - gap - measured.height);

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.dataset.positioned = 'true';
}

function queueInfoTipPositions(details = null) {
  if (infoTipPositionFrame) cancelAnimationFrame(infoTipPositionFrame);
  infoTipPositionFrame = requestAnimationFrame(() => {
    infoTipPositionFrame = 0;
    if (details) placeInfoTip(details);
    else document.querySelectorAll('details.info-tip[open]').forEach(placeInfoTip);
  });
}

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
   * 点信息按钮本身会变成「先被这里关掉、再被原生打开」，闪一下。
   *
   * 必须在捕获阶段监听。底部 sheet 会阻止内部 click 冒泡，若只在冒泡阶段听，
   * 用户点份量、快捷份数或关闭按钮时，信息层永远收不到“点了外面”。捕获阶段
   * 先判断目标，既能关闭外部浮层，也不会干扰后续控件自己的点击行为。
   * 点在自己的说明层里仍不关 —— 里面可能要选中文字或者点链接。
   */
  document.addEventListener('click', (event) => {
    closeOthers(event.target.closest?.('details.info-tip') || null);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeOthers(null);
  });
  /* 滚动与旋转屏幕后，说明层继续锚定原来的 i，而不是留在旧坐标。 */
  document.addEventListener('scroll', () => queueInfoTipPositions(), true);
  window.addEventListener('resize', () => queueInfoTipPositions());
  window.visualViewport?.addEventListener('resize', () => queueInfoTipPositions());
  window.visualViewport?.addEventListener('scroll', () => queueInfoTipPositions());
}

export function infoTip(label, ...children) {
  bindInfoTipDismiss();
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mark.setAttribute('class', 'info-tip-mark');
  mark.setAttribute('viewBox', '0 0 12 12');
  mark.setAttribute('aria-hidden', 'true');
  const stem = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // 小写 i 用路径和圆点绘制，不依赖字体，也不会在不同系统上变成不同字形。
  stem.setAttribute('d', 'M6 5.1v4.1');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '6');
  dot.setAttribute('cy', '2.8');
  dot.setAttribute('r', '.7');
  mark.append(stem, dot);
  const details = h('details.info-tip', null,
    h('summary', { 'aria-label': label, title: label }, mark),
    h('div.info-tip-panel', { role: 'note' }, children));
  details.addEventListener('toggle', () => {
    const panel = details.querySelector(':scope > .info-tip-panel');
    if (panel) panel.dataset.positioned = 'false';
    if (details.open) queueInfoTipPositions(details);
  });
  return details;
}

/*
 * 某些卡片会被账号状态、数据同步或时钟刷新整块重建。普通 infoTip 跟着 DOM
 * 一起销毁是合理的；但卡片级的主要说明刚点开就被一次无关重绘收起，看起来像
 * 信息按钮失灵。给这类入口一个稳定 key，把用户主动选择的展开态留在模块内存里。
 *
 * 点外面、再次点 summary 或按 Escape 仍会改变 details.open；toggle 事件会把
 * 新状态写回集合，因此这里只抵抗“节点被重建”，不会把用户已经关闭的层又打开。
 */
const persistentInfoTipOpen = new Set();

export function persistentInfoTip(key, label, ...children) {
  const stableKey = String(key);
  const details = infoTip(label, ...children);
  details.open = persistentInfoTipOpen.has(stableKey);
  if (details.open) queueInfoTipPositions(details);
  details.addEventListener('toggle', () => {
    if (details.open) persistentInfoTipOpen.add(stableKey);
    else persistentInfoTipOpen.delete(stableKey);
  });
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
  el.append(h('span.toast-message', null, text));
  if (action?.label && typeof action.onClick === 'function') {
    el.append(h('button.toast-action', {
      type: 'button',
      onclick: async () => {
        clearTimeout(toastTimer);
        el.className = 'toast';
        try {
          await action.onClick();
        } catch (error) {
          console.error('撤销失败', error);
          toast('撤销失败，请刷新后重试', 'error');
        }
      },
    }, action.label));
  }
  el.dataset.long = text.length > 42 ? 'true' : 'false';
  el.className = `toast show ${kind}${action ? ' with-action' : ''}`;
  clearTimeout(toastTimer);
  // 短提示停留 2.8 秒；较长的错误说明多留一点阅读时间，但不再把整份导入报告塞进提示框。
  const duration = action
    ? Math.max(6000, Number(action.duration) || 0)
    : Math.min(6000, Math.max(2800, 1800 + text.length * 38));
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
