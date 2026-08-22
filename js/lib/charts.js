/** 纯 SVG 图表，无第三方依赖，配色跟随 CSS 变量以适配深色模式 */

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}

/** 进度环 */
export function ring({ pct = 0, size = 92, stroke = 9, color = 'var(--accent)', label = '', sub = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 130));
  const dash = (Math.min(clamped, 100) / 100) * c;

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ring' });
  svg.append(el('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none',
    stroke: 'var(--track)', 'stroke-width': stroke,
  }));
  const arc = el('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none',
    stroke: clamped > 105 ? 'var(--danger)' : color,
    'stroke-width': stroke, 'stroke-linecap': 'round',
    'stroke-dasharray': `${dash} ${c}`,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });
  svg.append(arc);

  const main = el('text', {
    x: size / 2, y: size / 2 - (sub ? 2 : -5), 'text-anchor': 'middle',
    class: 'ring-label', 'font-size': size / 4.4, 'font-weight': 650,
  });
  main.textContent = label;
  svg.append(main);
  if (sub) {
    const s = el('text', { x: size / 2, y: size / 2 + size / 6, 'text-anchor': 'middle', class: 'ring-sub', 'font-size': size / 8 });
    s.textContent = sub;
    svg.append(s);
  }
  return svg;
}

/** 横向进度条（宏量营养素） */
export function macroBar({ value, target, color = 'var(--accent)' }) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const wrap = document.createElement('div');
  wrap.className = 'macro-bar';
  const fill = document.createElement('div');
  fill.className = `macro-bar-fill${pct > 105 ? ' over' : ''}`;
  fill.style.width = `${Math.max(0, Math.min(pct, 100))}%`;
  if (pct <= 105) fill.style.background = color;
  wrap.append(fill);
  if (pct > 100) {
    const over = document.createElement('div');
    over.className = 'macro-bar-over';
    over.style.width = `${Math.min(pct - 100, 40)}%`;
    wrap.append(over);
  }
  return wrap;
}

/**
 * 折线图（可叠加目标线与第二条序列）
 * @param {object} opts
 *  - data: [{x:'2026-08-01', y: 72.1}]
 *  - target: 目标横线
 *  - color / fill
 */
export function lineChart({
  data = [], width = 640, height = 200, color = 'var(--accent)',
  target = null, targetLabel = '', unit = '', area = true, decimals = 0,
}) {
  const pad = { l: 38, r: 12, t: 14, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'none' });
  const points = data.filter((d) => Number.isFinite(Number(d.y)));

  if (points.length < 2) {
    const t = el('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty', 'font-size': 13 });
    t.textContent = '数据不足，至少需要 2 天记录';
    svg.append(t);
    return svg;
  }

  const ys = points.map((p) => Number(p.y));
  if (target != null) ys.push(target);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  const span = max - min || Math.abs(max) * 0.1 || 1;
  min -= span * 0.12;
  max += span * 0.12;

  const px = (i) => pad.l + (i / (points.length - 1)) * (width - pad.l - pad.r);
  const py = (v) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);

  // 网格与纵轴
  for (let i = 0; i <= 3; i += 1) {
    const v = min + ((max - min) * i) / 3;
    const y = py(v);
    svg.append(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'grid' }));
    const t = el('text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
    t.textContent = v.toFixed(decimals);
    svg.append(t);
  }

  if (target != null) {
    const y = py(target);
    svg.append(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'target-line' }));
    if (targetLabel) {
      const t = el('text', { x: width - pad.r, y: y - 4, 'text-anchor': 'end', class: 'target-label', 'font-size': 10 });
      t.textContent = targetLabel;
      svg.append(t);
    }
  }

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(Number(p.y)).toFixed(1)}`).join(' ');
  if (area) {
    const areaPath = `${d} L${px(points.length - 1).toFixed(1)},${height - pad.b} L${px(0).toFixed(1)},${height - pad.b} Z`;
    svg.append(el('path', { d: areaPath, fill: color, opacity: 0.12, stroke: 'none' }));
  }
  svg.append(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  const last = points[points.length - 1];
  svg.append(el('circle', { cx: px(points.length - 1), cy: py(Number(last.y)), r: 3.5, fill: color }));

  // 横轴：首尾日期
  const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
  first.textContent = String(points[0].x).slice(5);
  const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
  lastT.textContent = String(last.x).slice(5);
  svg.append(first, lastT);

  if (unit) {
    const u = el('text', { x: pad.l, y: 10, class: 'axis', 'font-size': 10 });
    u.textContent = unit;
    svg.append(u);
  }
  return svg;
}

/** 柱状图：摄入 vs 目标（超标柱染红） */
export function barChart({ data = [], width = 640, height = 200, target = null, unit = '' }) {
  const pad = { l: 38, r: 12, t: 14, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'none' });
  if (!data.length) {
    const t = el('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty', 'font-size': 13 });
    t.textContent = '还没有记录';
    svg.append(t);
    return svg;
  }
  const max = Math.max(...data.map((d) => Number(d.y) || 0), target || 0) * 1.15 || 1;
  const innerW = width - pad.l - pad.r;
  const bw = Math.max(3, (innerW / data.length) * 0.62);
  const py = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);

  for (let i = 0; i <= 3; i += 1) {
    const v = (max * i) / 3;
    const y = py(v);
    svg.append(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'grid' }));
    const t = el('text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
    t.textContent = Math.round(v);
    svg.append(t);
  }

  data.forEach((d, i) => {
    const v = Number(d.y) || 0;
    const x = pad.l + (i + 0.5) * (innerW / data.length) - bw / 2;
    const y = py(v);
    svg.append(el('rect', {
      x, y, width: bw, height: Math.max(0, height - pad.b - y), rx: Math.min(3, bw / 2),
      fill: target && v > target * 1.05 ? 'var(--danger)' : 'var(--accent)',
      opacity: target && v < target * 0.75 ? 0.5 : 0.9,
    }));
  });

  if (target != null) {
    const y = py(target);
    svg.append(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'target-line' }));
    const t = el('text', { x: width - pad.r, y: y - 4, 'text-anchor': 'end', class: 'target-label', 'font-size': 10 });
    t.textContent = `目标 ${Math.round(target)}${unit}`;
    svg.append(t);
  }

  const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
  first.textContent = String(data[0].x).slice(5);
  const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
  lastT.textContent = String(data[data.length - 1].x).slice(5);
  svg.append(first, lastT);
  return svg;
}
