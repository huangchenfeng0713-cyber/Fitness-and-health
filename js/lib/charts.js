/** 纯 SVG 图表，无第三方依赖，配色跟随 CSS 变量以适配深色模式 */

const NS = 'http://www.w3.org/2000/svg';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 给图表加「点一下看某一天数值」的能力。
 *
 * 只在 7 天视图开：点数少、每个点有近百像素的落点区间，手指点得准；
 * 30 天以上一个点不到 20px，点选只会选错，不如不做。
 *
 * 交互只改 SVG 自己的 DOM，不碰应用状态，所以不会触发整页重绘。
 */
/*
 * 选中某一天时在图上标出来。
 *
 * 设计上有两点是刻意的：
 *
 * 1. 选中状态存在调用方（趋势页）而不是 SVG 里。这样一次点选能让同一页
 *    五张图同时标注同一天——「那天吃了多少、动了多少、睡了多久」本来就是
 *    一个问题，分五次点五张图才看得全没有意义。而且 render* 会因为定时器
 *    和数据变化反复重跑，状态放在 SVG 内部会被重绘抹掉。
 *
 * 2. 数值不画在图上。气泡压在数据点旁边会盖住相邻的点，手指点下去的位置
 *    又正好挡住它。数值改由卡片在图下方单独显示一行，什么都不遮。
 */
function markSelectedBar({ svg, x, y, width: bw, height: bh, radius }) {
  // 柱状图上画竖线会藏进柱子里，不如直接把这根柱子描出来
  svg.append(el('rect', {
    class: 'chart-marker marker-bar', x: x - 2, y: y - 2, width: bw + 4, height: bh + 4,
    rx: radius + 2, fill: 'none',
  }));
}

function markSelected({ svg, pad, width, height, color, x, y }) {
  const g = el('g', { class: 'chart-marker' });
  g.append(el('line', {
    class: 'marker-line', x1: x, x2: x, y1: height - pad.b, y2: y == null ? pad.t : y,
    ...(y == null ? { opacity: 0.45 } : {}),
  }));
  if (y != null) {
    g.append(el('circle', { cx: x, cy: y, r: 4.5, fill: color, stroke: 'var(--card)', 'stroke-width': 2 }));
  }
  svg.append(g);
}

/** 铺一层透明落点区，点哪天回调哪天 */
function attachHits({ svg, pad, width, height, items, onPick }) {
  if (!items.length || typeof onPick !== 'function') return;
  const hits = el('g', { class: 'chart-hits' });
  items.forEach((it, i) => {
    const left = i === 0 ? pad.l : (items[i - 1].x + it.x) / 2;
    const right = i === items.length - 1 ? width - pad.r : (it.x + items[i + 1].x) / 2;
    const r = el('rect', {
      x: left, y: pad.t, width: Math.max(1, right - left), height: height - pad.t - pad.b,
      fill: 'transparent',
    });
    r.addEventListener('click', (ev) => { ev.stopPropagation(); onPick(it.date); });
    hits.append(r);
  });
  svg.append(hits);
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
  selectedX = null, onPick = null,
  breakOnMissing = false, showPoints = false, overIsBad = false, minPoints = 2,
  emptyText = '数据不足，至少需要 2 个记录日',
}) {
  const pad = { l: 38, r: 12, t: 14, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'none' });
  const points = data.filter((d) => Number.isFinite(Number(d.y)));

  if (points.length < minPoints) {
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
  let dec = decimals != null ? decimals : (range >= 20 ? 0 : range >= 2 ? 1 : 2);
  /*
   * 量程比刻度精度还细时，四条刻度会印成「62.0 / 62.0 / 61.9 / 61.9」——
   * 一条横线上两个一样的数，等于没有刻度。体重最容易碰上：一周之内波动
   * 常常不到 0.1 kg，而它又显式要了 1 位小数，自适应那条规则被绕过去了。
   * 所以调用方给的位数只当下限，撞车了继续往上加。
   */
  const tickAt = (i, d) => (min + ((max - min) * i) / 3).toFixed(d);
  while (dec < 4 && new Set([0, 1, 2, 3].map((i) => tickAt(i, dec))).size < 4) dec += 1;
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
    : points.length === 1
      ? pad.l + (width - pad.l - pad.r) / 2
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

  // 摄入记录可能中间漏几天。柱状图天然不会跨过空白；换成折线后也不能把
  // 08-01 和 08-10 直接连起来，造成“中间每天都有摄入”的错觉。
  const pointIndex = new Map(points.map((point, index) => [point, index]));
  const segments = [];
  let segment = [];
  for (const point of data) {
    if (Number.isFinite(Number(point.y))) {
      segment.push(point);
    } else if (breakOnMissing && segment.length) {
      segments.push(segment);
      segment = [];
    }
  }
  if (segment.length) segments.push(segment);
  if (!breakOnMissing) segments.splice(0, segments.length, points);

  const pointX = (point) => px(pointIndex.get(point));
  for (const line of segments) {
    if (line.length < 2) continue;
    const d = line.map((point, i) => `${i ? 'L' : 'M'}${pointX(point).toFixed(1)},${py(Number(point.y)).toFixed(1)}`).join(' ');
    if (area) {
      const areaPath = `${d} L${pointX(line.at(-1)).toFixed(1)},${height - pad.b} L${pointX(line[0]).toFixed(1)},${height - pad.b} Z`;
      svg.append(el('path', { d: areaPath, fill: color, opacity: 0.12, stroke: 'none' }));
    }
    svg.append(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }

  const last = points[points.length - 1];
  const visiblePoints = showPoints ? points : [last];
  const radius = showPoints && points.length > 60 ? 2 : showPoints && points.length > 14 ? 2.6 : 3.5;
  for (const point of visiblePoints) {
    const high = overIsBad && target != null && Number(point.y) > Number(target) * 1.05;
    svg.append(el('circle', {
      cx: pointX(point), cy: py(Number(point.y)), r: radius,
      fill: high ? 'var(--danger)' : color,
    }));
  }

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
    labelDays.forEach((day, i) => {
      /*
       * 首末两个日期改成靠边对齐。居中的话有一半会落到绘图区外，
       * 而右边距只有 12px —— 最后一天的「20」会被 SVG 边界切掉半个字。
       */
      const anchor = i === 0 ? 'start' : i === labelDays.length - 1 ? 'end' : 'middle';
      const t = el('text', {
        x: day.x, y: height - 6, 'text-anchor': anchor, class: 'axis', 'font-size': 9.5,
      });
      t.textContent = new Date(day.ms).toISOString().slice(5, 10);
      svg.append(t);
    });
  } else {
    // 给了 domain 就标区间两端，标数据两端会和相邻卡片对不上
    const first = el('text', { x: pad.l, y: height - 6, class: 'axis', 'font-size': 10 });
    first.textContent = String(useDomain ? domain[0] : points[0].x).slice(5);
    const lastT = el('text', { x: width - pad.r, y: height - 6, 'text-anchor': 'end', class: 'axis', 'font-size': 10 });
    lastT.textContent = String(useDomain ? domain[1] : last.x).slice(5);
    svg.append(first, lastT);
  }

  if (interactive) {
    /*
     * 落点覆盖整个区间里的每一天，不只是有数据的那几天。
     * 体重可能三天才称一次，若只有这三天能点，选中日在其它图上就对不上了。
     */
    const oneDay = 86400000;
    const hitDays = [];
    if (hasCalendarX && (x1 - x0) / oneDay <= 31) {
      for (let ms = x0; ms <= x1; ms += oneDay) {
        hitDays.push({ x: pxAt(ms), date: new Date(ms).toISOString().slice(0, 10) });
      }
    } else {
      points.forEach((pt, i) => hitDays.push({ x: px(i), date: String(pt.x).slice(0, 10) }));
    }
    if (selectedX) {
      const idx = points.findIndex((pt) => String(pt.x).slice(0, 10) === selectedX);
      const hit = hitDays.find((hd) => hd.date === selectedX);
      if (hit) {
        markSelected({
          svg, pad, width, height, color, x: hit.x,
          y: idx >= 0 ? py(Number(points[idx].y)) : null,
        });
      }
    }
    attachHits({ svg, pad, width, height, items: hitDays, onPick });
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
  showAllDates = false, interactive = false, selectedX = null, onPick = null,
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
    // 没有记录的那天也要能点：选中日要在所有图上都标得出来
    const items = data.map((d, i) => ({ x: barCx(i), date: String(d.x).slice(0, 10) }));
    if (selectedX) {
      const idx = data.findIndex((d) => String(d.x).slice(0, 10) === selectedX);
      if (idx >= 0) {
        const has = data[idx].y != null && Number.isFinite(Number(data[idx].y));
        if (has) {
          const y = py(Number(data[idx].y));
          markSelectedBar({
            svg, x: barCx(idx) - bw / 2, y, width: bw,
            height: Math.max(0, height - pad.b - y), radius: Math.min(3, bw / 2),
          });
        } else {
          // 那天没有记录，没有柱子可描，画一条淡竖线把位置指出来
          markSelected({ svg, pad, width, height, color: 'var(--accent)', x: barCx(idx), y: null });
        }
      }
    }
    attachHits({ svg, pad, width, height, items, onPick });
  }
  return svg;
}
