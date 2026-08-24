/** 纯 SVG 图表，无第三方依赖，配色跟随 CSS 变量以适配深色模式 */

const NS = 'http://www.w3.org/2000/svg';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/*
 * 估算文字宽度，用来给点选时弹出的数值气泡画底板。
 * SVG 里量文字要等元素进 DOM 再 getBBox，图表是离屏拼好再挂上去的，量不到；
 * 中文按 11px、西文数字按 6.2px 估算，误差几个像素不影响观感。
 */
const textWidth = (str, size = 11) => [...String(str)]
  .reduce((sum, ch) => sum + (/[\x00-\xff]/.test(ch) ? size * 0.56 : size), 0);

/**
 * 给图表加「点一下看某一天数值」的能力。
 *
 * 只在 7 天视图开：点数少、每个点有近百像素的落点区间，手指点得准；
 * 30 天以上一个点不到 20px，点选只会选错，不如不做。
 *
 * 交互只改 SVG 自己的 DOM，不碰应用状态，所以不会触发整页重绘。
 */
/*
 * 已经展开的十字线。同一页有五张图，点第二张时第一张那条得收起来，
 * 否则屏幕上会同时挂着好几条线，不知道在看哪天。
 *
 * 不用 document 上的事件：render* 会反复重建图表，监听器会越积越多。
 * 这里存的是弱引用式的登记表，每次展开时顺手清掉已经从文档里摘掉的项。
 */
const openPickers = new Set();

function attachPicker({ svg, pad, width, height, items, color, formatValue }) {
  if (!items.length) return;
  const marker = el('g', { class: 'chart-marker' });
  marker.setAttribute('style', 'display:none');
  const vline = el('line', { class: 'marker-line' });
  const dot = el('circle', { r: 4.5, fill: color, stroke: 'var(--card)', 'stroke-width': 2 });
  const bg = el('rect', { class: 'marker-bubble', rx: 5, height: 18 });
  const label = el('text', { class: 'marker-value', 'font-size': 11, 'text-anchor': 'middle' });
  marker.append(vline, bg, label, dot);

  let activeIndex = null;
  const hide = () => { marker.setAttribute('style', 'display:none'); activeIndex = null; };
  const entry = { marker, hide };
  const show = (i) => {
    if (activeIndex === i) { hide(); return; }   // 再点一次收起
    for (const other of [...openPickers]) {
      if (!other.marker.isConnected) { openPickers.delete(other); continue; }
      if (other !== entry) other.hide();
    }
    openPickers.add(entry);
    activeIndex = i;
    const it = items[i];
    vline.setAttribute('x1', it.x); vline.setAttribute('x2', it.x);
    vline.setAttribute('y1', height - pad.b); vline.setAttribute('y2', it.y);
    dot.setAttribute('cx', it.x); dot.setAttribute('cy', it.y);
    const text = `${it.label} · ${formatValue(it.value)}`;
    const w = textWidth(text) + 12;
    // 气泡贴着点上方，靠边时向内收，别画到画布外
    const cx = Math.min(width - pad.r - w / 2, Math.max(pad.l + w / 2, it.x));
    // 点贴着顶时气泡往上放会被卡片裁掉，翻到点下方去
    const above = it.y - 24 >= pad.t;
    const top = above ? it.y - 24 : Math.min(height - pad.b - 20, it.y + 8);
    bg.setAttribute('x', cx - w / 2); bg.setAttribute('y', top); bg.setAttribute('width', w);
    label.setAttribute('x', cx); label.setAttribute('y', top + 13);
    label.textContent = text;
    marker.setAttribute('style', '');
  };

  const hits = el('g', { class: 'chart-hits' });
  items.forEach((it, i) => {
    const left = i === 0 ? pad.l : (items[i - 1].x + it.x) / 2;
    const right = i === items.length - 1 ? width - pad.r : (it.x + items[i + 1].x) / 2;
    const r = el('rect', {
      x: left, y: pad.t, width: Math.max(1, right - left), height: height - pad.t - pad.b,
      fill: 'transparent',
    });
    r.addEventListener('click', (ev) => { ev.stopPropagation(); show(i); });
    hits.append(r);
  });
  svg.addEventListener('click', hide);
  svg.append(marker, hits);
}

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
  domain = null, showAllDates = false, interactive = false,
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
  const pxAt = (ms) => pad.l + clamp01((ms - x0) / (x1 - x0)) * (width - pad.l - pad.r);
  const px = (i) => (hasCalendarX
    ? pxAt(dayXs[i])
    : pad.l + (i / (points.length - 1)) * (width - pad.l - pad.r));
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

  // 横轴。7 天视图逐日标注，长区间只标两端——30 个日期挤在一起谁也看不清
  if (showAllDates) {
    /*
     * 标区间里的每一天，不是「每个有数据的点」。
     * 体重可能只有三天有记录，若只标那三天，同一页几张图的横轴刻度就又对不齐了，
     * 而且用户要的是「看得到每一天是几号」。
     */
    const oneDay = 86400000;
    const labelDays = [];
    if (hasCalendarX && (x1 - x0) / oneDay <= 31) {
      for (let ms = x0; ms <= x1; ms += oneDay) labelDays.push({ ms, x: pxAt(ms) });
    } else {
      points.forEach((pt, i) => labelDays.push({ ms: dayXs[i], x: px(i) }));
    }
    for (const day of labelDays) {
      const t = el('text', {
        x: day.x, y: height - 6, 'text-anchor': 'middle', class: 'axis', 'font-size': 9.5,
      });
      t.textContent = new Date(day.ms).toISOString().slice(5, 10);
      svg.append(t);
    }
  } else {
    // 给了 domain 就标区间两端，标数据两端会和相邻卡片对不上
    const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
    first.textContent = String(useDomain ? domain[0] : points[0].x).slice(5);
    const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
    lastT.textContent = String(useDomain ? domain[1] : last.x).slice(5);
    svg.append(first, lastT);
  }

  if (interactive) {
    attachPicker({
      svg, pad, width, height, color,
      items: points.map((pt, i) => ({
        x: px(i), y: py(Number(pt.y)), label: String(pt.x).slice(5), value: Number(pt.y),
      })),
      formatValue: (v) => `${fmt(v)}${unit || ''}`,
    });
  }

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
  showAllDates = false, interactive = false,
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

  const barCx = (i) => pad.l + (i + 0.5) * (innerW / data.length);

  if (showAllDates) {
    data.forEach((d, i) => {
      const t = el('text', {
        x: barCx(i), y: height - 6, 'text-anchor': 'middle', class: 'axis', 'font-size': 9.5,
      });
      t.textContent = String(d.x).slice(5);
      svg.append(t);
    });
  } else {
    const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
    first.textContent = String(data[0].x).slice(5);
    const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
    lastT.textContent = String(data[data.length - 1].x).slice(5);
    svg.append(first, lastT);
  }

  if (interactive) {
    // 没有记录的那天也要能点，点了告诉用户「没有记录」，比点不动更好懂
    attachPicker({
      svg, pad, width, height, color: 'var(--accent)',
      items: data.map((d, i) => {
        const has = d.y != null && Number.isFinite(Number(d.y));
        return {
          x: barCx(i), y: has ? py(Number(d.y)) : height - pad.b,
          label: String(d.x).slice(5), value: has ? Number(d.y) : null,
        };
      }),
      formatValue: (v) => (v == null ? '没有记录' : `${Math.round(v)}${unit}`),
    });
  }
  return svg;
}
