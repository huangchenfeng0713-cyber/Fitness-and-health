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
/**
 * 环形进度。
 *
 * `overIsBad` 默认关掉：超过 100% 是不是坏事，只有调用方知道。
 * 原先这里写死「>105% 一律画成 danger」，于是无论主卡传什么颜色进来都会被
 * 就地改红 —— 增重计划要求每天吃超，圆环却一直在报警，两者对不上。
 * 饮水环同理，多喝一点也不是错误。
 */
/*
 * 热量圆环。段落、刻度、外圈文字由 core/energy-ring.js 算好，这里只管画。
 *
 * viewBox 比环本身宽出一圈：两条刻度线各带一个外圈文字（消耗 / 全天），
 * 得留出地方，否则左右两边的字会被裁掉。
 *
 * 十二点开一道小豁口 + 起点方块：闭合的环在什么都没有时看不出从哪儿开始、
 * 往哪边走 —— 而「一口没吃」是每天早上打开时的样子。
 */
const RING_GAP_DEG = 8;

export function energyRingChart({ model, size = 152, stroke = 14 }) {
  const padX = 78;                      // 给外圈那两行字让出的横向空间
  const padY = 22;
  const vbW = size + padX * 2;
  const vbH = size + padY * 2;
  const cx = vbW / 2;
  const cy = vbH / 2;
  const r = (size - stroke) / 2;
  const span = 360 - RING_GAP_DEG;
  const start = -90 + RING_GAP_DEG / 2;
  const c = 2 * Math.PI * r;
  const angleOf = (p) => start + (Math.max(0, Math.min(100, p)) / 100) * span;
  const point = (deg, radius) => [
    cx + radius * Math.cos((deg * Math.PI) / 180),
    cy + radius * Math.sin((deg * Math.PI) / 180),
  ];

  const svg = el('svg', {
    viewBox: `0 0 ${vbW} ${vbH}`, class: 'ring energy-ring',
    preserveAspectRatio: 'xMidYMid meet',
  });

  /** 一段弧：从 fromPct 走到 toPct */
  const arc = (radius, width, cls, fromPct, toPct) => {
    const circ = 2 * Math.PI * radius;
    const usable = (span / 360) * circ;
    const from = (Math.max(0, Math.min(100, fromPct)) / 100) * usable;
    const len = (Math.max(0, Math.min(100, toPct)) / 100) * usable - from;
    if (!(len > 0.3)) return;
    svg.append(el('circle', {
      cx, cy, r: radius, fill: 'none', class: cls, 'stroke-width': width,
      // 先空一段跳到起点再画本段：比给每段单独算路径省事，也不会有接缝
      'stroke-dasharray': `0 ${from} ${len} ${circ}`,
      transform: `rotate(${start} ${cx} ${cy})`,
    }));
  };

  // 底槽只铺到可用角度，否则豁口那儿会露出一截灰
  arc(r, stroke, 'ring-track', 0, 100);
  for (const s of model.segments) {
    arc(r, stroke, `ring-seg ring-seg-${s.tone}`, s.fromPct, s.toPct);
  }

  /* 吃得比烧的多：从消耗那条线到已摄入这一段，走主环外面的细轨 */
  if (model.overflow) {
    const outerR = r + stroke / 2 + 4;
    arc(outerR, 4, 'ring-overflow', model.overflow.fromPct, model.overflow.toPct);
  }

  /* 起点方块：什么都没有时靠它看出这一圈从哪儿开始 */
  const [sx, sy] = point(start, r);
  svg.append(el('rect', {
    x: sx - 2.4, y: sy - 2.4, width: 4.8, height: 4.8, rx: 1, class: 'ring-origin',
  }));

  for (const tick of model.ticks) {
    const deg = angleOf(tick.pct);
    const half = tick.strong ? stroke * 0.72 : stroke * 0.5;
    const [x1, y1] = point(deg, r - half);
    const [x2, y2] = point(deg, r + half);
    svg.append(el('line', {
      x1, y1, x2, y2, class: `ring-tick${tick.strong ? ' strong' : ''}`,
    }));

    /*
     * 外圈那行字。锚点按左右半边翻转，否则右半边的字会往回压在环上。
     * 只有这两个注释（消耗 / 全天）—— 段落本身不再各挂一个标注。
     */
    const norm = ((deg % 360) + 360) % 360;
    const onLeft = norm > 90 && norm < 270;
    const [tx, ty] = point(deg, r + stroke * 0.72 + 8);
    const text = el('text', {
      x: tx, y: ty, class: `ring-tick-label${tick.strong ? ' strong' : ''}`,
      'text-anchor': onLeft ? 'end' : 'start',
      'dominant-baseline': 'middle',
      'font-size': 13,
    });
    text.textContent = `${tick.label} ${tick.kcal}`;
    svg.append(text);
  }

  if (model.center) {
    const main = el('text', {
      x: cx, y: cy - 3, 'text-anchor': 'middle',
      class: 'ring-label', 'font-size': size / 4.6, 'font-weight': 650,
    });
    main.textContent = String(model.center.kcal);
    svg.append(main);
    const sub = el('text', {
      x: cx, y: cy + size / 5.6, 'text-anchor': 'middle',
      class: 'ring-sub', 'font-size': size / 11.5,
    });
    sub.textContent = model.center.label;
    svg.append(sub);
  }
  return svg;
}

/**
 * 区间条：从左往右填到你的量，建议区间画成一段罩子。
 *
 * 位置由 core/metrics.js 的 rangeScale 算好（整条线性），这里只管画。
 * 罩子的颜色固定 —— 它是「建议吃到哪儿」，不该因为你今天吃多了就换色；
 * 该变色的是填充本身。
 *
 * @param {number} fillPct   已摄入占整条的百分比
 * @param {number} zoneStart 建议区间下界的位置
 * @param {number} zoneEnd   建议区间上界的位置
 */
export function rangeBar({
  fillPct = 0, zoneStart = 0, zoneEnd = 100, color = 'var(--accent)', level = 'met',
}) {
  const wrap = document.createElement('div');
  wrap.className = `range-bar ${level}`;

  const zone = document.createElement('div');
  zone.className = 'range-bar-zone';
  zone.style.left = `${zoneStart}%`;
  zone.style.width = `${Math.max(0, zoneEnd - zoneStart)}%`;
  wrap.append(zone);

  const fill = document.createElement('div');
  fill.className = 'range-bar-fill';
  fill.style.width = `${fillPct}%`;
  fill.style.background = color;
  wrap.append(fill);

  return wrap;
}

/**
 * 碳水 / 脂肪合用的一条：一根**刻度**，不是进度条。
 *
 * 标题顺序是「碳水 / 脂肪」，横轴也按这个顺序：左端全碳水，右端全脂肪。
 * 传进来的仍是碳水占比，因此绘图坐标要用 100 − 碳水占比；浅色那段是
 * 碳水参考区间（由脂肪 AMDR 反解），圆点是今天落在哪儿。
 *
 * 之前画的是「两段按比例分」加一根计划分界线。那样看着像在说
 * 「分界线就是标准答案」，可结构本来就有二十个百分点的合理区间 ——
 * 一个点会让人以为差一格都是没做好。
 *
 * @param {number|null} carbPct 当前碳水占比；null 就只画区间
 * @param {number|null} carbBandLo/carbBandHi 碳水参考区间两端
 */
export function splitBar({
  carbPct = null, carbBandLo = null, carbBandHi = null, level = 'plain',
}) {
  const wrap = document.createElement('div');
  wrap.className = `split-bar ${level}`;
  const pct = (value) => Math.max(0, Math.min(100, Number(value)));

  if (carbBandLo != null && carbBandHi != null && carbBandHi > carbBandLo) {
    const lo = pct(carbBandLo);
    const hi = pct(carbBandHi);
    const band = document.createElement('div');
    band.className = 'split-bar-band';
    band.style.left = `${100 - hi}%`;
    band.style.width = `${Math.max(0, hi - lo)}%`;
    wrap.append(band);
  }

  if (carbPct != null && Number.isFinite(Number(carbPct))) {
    const mark = document.createElement('div');
    mark.className = 'split-bar-point';
    mark.style.left = `${100 - pct(carbPct)}%`;
    wrap.append(mark);
  }
  return wrap;
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
  emptyText = '数据不足',
}) {
  const pad = { l: 38, r: 12, t: 14, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'none' });
  /*
   * 先剔掉 null 再转数字。
   *
   * Number(null) 是 0，而 Number.isFinite(0) 是 true —— 没记录的那天就这么
   * 混成了「吃了 0 kcal」的实点：图上多出一串贴着地板的点，把折线拽下去，
   * 而图下面那段解读用的是 analyzeSeries（它剔了 null），于是同一张卡里
   * 「有记录的 6 天日均 2212」和一条从 0 起步的线并排放着，自相矛盾。
   *
   * 全是 null 时 points 为空，正好落到下面的空状态，不再画一条全零的线。
   * 这个坑 CLAUDE.md 里记过一次（analyzeSeries 那处），这里当时漏了。
   */
  const hasValue = (d) => d != null && d.y != null && d.y !== '' && Number.isFinite(Number(d.y));
  const points = data.filter(hasValue);

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
    if (hasValue(point)) {
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
