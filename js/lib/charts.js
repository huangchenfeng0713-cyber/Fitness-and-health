/** 纯 SVG 图表，无第三方依赖，配色跟随 CSS 变量以适配深色模式 */

const NS = 'http://www.w3.org/2000/svg';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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

/**
 * 横向进度条（宏量营养素）
 * @param {number} [delta] 本次将要增加的量，用半透明的第二段画出来，
 *        让人一眼看出「记完这笔会推进到哪」。
 */
export function macroBar({
  value, target, delta = 0, color = 'var(--accent)', overIsBad = true,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'macro-bar';
  const pctOf = (v) => (target > 0 ? (v / target) * 100 : 0);

  const basePct = Math.max(0, Math.min(pctOf(value), 100));
  const totalPct = pctOf(value + delta);

  const fill = document.createElement('div');
  fill.className = `macro-bar-fill${overIsBad && pctOf(value) > 105 ? ' over' : ''}`;
  fill.style.width = `${basePct}%`;
  if (!overIsBad || pctOf(value) <= 105) fill.style.background = color;
  wrap.append(fill);

  if (delta > 0) {
    const add = document.createElement('div');
    add.className = 'macro-bar-delta';
    add.style.width = `${Math.max(0, Math.min(totalPct, 100) - basePct)}%`;
    add.style.background = overIsBad && totalPct > 105 ? 'var(--danger)' : color;
    wrap.append(add);
  }

  if (overIsBad && totalPct > 100) {
    const over = document.createElement('div');
    over.className = 'macro-bar-over';
    over.style.width = `${Math.min(totalPct - 100, 40)}%`;
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
  target = null, targetLabel = '', unit = '', area = true, decimals = null,
  domain = null,
  emptyText = '数据不足，至少需要 2 个记录日',
}) {
  const pad = { l: 38, r: 12, t: 14, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'none' });
  const points = data.filter((d) => Number.isFinite(Number(d.y)));

  if (points.length < 2) {
    const t = el('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty', 'font-size': 13 });
    t.textContent = emptyText;
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
  // 步数、能量、睡眠这类天然非负的指标，纵轴不该出现负刻度
  if (ys.every((v) => v >= 0)) min = Math.max(0, min);

  // 刻度小数位随量程自适应：量程只有 1 时固定 0 位会出现「1 / 1 / 0」这种重复刻度
  const range = max - min;
  const dec = decimals != null ? decimals : (range >= 20 ? 0 : range >= 2 ? 1 : 2);
  const fmt = (v) => {
    const t = v.toFixed(dec);
    return t === `-${(0).toFixed(dec)}` ? (0).toFixed(dec) : t;   // 别显示 "-0"
  };

  // 日期有缺口时必须按真实日历距离布点；否则 8 月 1 日、2 日、30 日会被
  // 画成等间距，视觉上把最后 28 天的空档压成一天。
  const dayXs = points.map((p) => Date.parse(`${String(p.x).slice(0, 10)}T00:00:00Z`));
  /*
   * domain 指定横轴窗口，让同一页的多张图对齐。
   *
   * 不给 domain 时横轴是「第一个有数据的日子 → 最后一个有数据的日子」，
   * 于是趋势页里只有 2 次体重记录的图显示 08-22 → 08-23，
   * 旁边活动能量却是 07-26 → 08-24 —— 同一个「近 30 天」，三张图三个区间，
   * 根本没法横向比较。柱状图本来就按整段区间画，线图也该跟上。
   */
  const domainXs = Array.isArray(domain) && domain.length === 2
    ? domain.map((d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`))
    : null;
  const useDomain = domainXs != null && domainXs.every(Number.isFinite) && domainXs[1] > domainXs[0];
  const x0 = useDomain ? domainXs[0] : dayXs[0];
  const x1 = useDomain ? domainXs[1] : dayXs.at(-1);
  const hasCalendarX = dayXs.every(Number.isFinite) && x1 > x0;
  const px = (i) => {
    const ratio = hasCalendarX
      ? clamp01((dayXs[i] - x0) / (x1 - x0))
      : i / (points.length - 1);
    return pad.l + ratio * (width - pad.l - pad.r);
  };
  const py = (v) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);

  // 网格与纵轴
  for (let i = 0; i <= 3; i += 1) {
    const v = min + ((max - min) * i) / 3;
    const y = py(v);
    svg.append(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'grid' }));
    const t = el('text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
    t.textContent = fmt(v);
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

  // 横轴：首尾日期。给了 domain 就标区间两端，标数据两端会和相邻卡片对不上
  const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
  first.textContent = String(useDomain ? domain[0] : points[0].x).slice(5);
  const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
  lastT.textContent = String(useDomain ? domain[1] : last.x).slice(5);
  svg.append(first, lastT);

  if (unit) {
    const u = el('text', { x: pad.l, y: 10, class: 'axis', 'font-size': 10 });
    u.textContent = unit;
    svg.append(u);
  }
  return svg;
}

/** 柱状图：摄入 vs 目标（超标柱染红） */
export function barChart({
  data = [], width = 640, height = 200, target = null, unit = '',
  targetLabel = '目标', overIsBad = true, partialX = null,
}) {
  const pad = { l: 38, r: 12, t: 14, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'none' });
  const measured = data.filter((d) => d.y != null && Number.isFinite(Number(d.y)));
  if (!measured.length) {
    const t = el('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty', 'font-size': 13 });
    t.textContent = '还没有记录';
    svg.append(t);
    return svg;
  }
  const max = Math.max(...measured.map((d) => Number(d.y)), target || 0) * 1.15 || 1;
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
    if (d.y == null || !Number.isFinite(Number(d.y))) return;
    const v = Number(d.y);
    const x = pad.l + (i + 0.5) * (innerW / data.length) - bw / 2;
    const y = py(v);
    const isPartial = partialX != null && d.x === partialX;
    svg.append(el('rect', {
      x, y, width: bw, height: Math.max(0, height - pad.b - y), rx: Math.min(3, bw / 2),
      fill: overIsBad && target && v > target * 1.05 ? 'var(--danger)' : 'var(--accent)',
      opacity: isPartial ? 0.38 : target && v < target * 0.75 ? 0.5 : 0.9,
    }));
  });

  if (target != null) {
    const y = py(target);
    svg.append(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'target-line' }));
    const t = el('text', { x: width - pad.r, y: y - 4, 'text-anchor': 'end', class: 'target-label', 'font-size': 10 });
    t.textContent = `${targetLabel} ${Math.round(target)}${unit}`;
    svg.append(t);
  }

  const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
  first.textContent = String(data[0].x).slice(5);
  const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
  lastT.textContent = String(data[data.length - 1].x).slice(5);
  svg.append(first, lastT);
  return svg;
}
