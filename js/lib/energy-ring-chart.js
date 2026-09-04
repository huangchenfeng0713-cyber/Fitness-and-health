/**
 * 今日热量环：整圈 = 今天计划吃多少。只负责画，不算。
 *
 * 两条轨道各画各的：外圈粗的是摄入，内圈细的是消耗。
 * 每条轨道第一圈浅色、第二圈深色盖在浅色上，一条不去动另一条。
 */

const NS = 'http://www.w3.org/2000/svg';
const RING_GAP_DEG = 8;

/*
 * 上一次画到哪儿，用来让弧长「长过去」而不是直接跳。
 *
 * 记在模块里而不是 DOM 上：整张卡每次重绘都会重建这棵 SVG，
 * 挂在节点上的旧值会跟着节点一起被扔掉。
 *
 * 只在同一天、同一把尺子上才动画（`animateKey`）：翻到别的日期、
 * 改档案换了尺子，弧的含义都变了，把它当成「长了一截」是骗人。
 */
const lastArc = new Map();
const ARC_MS = 520;

function reduceMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}

export function energyRingChart({ model, size = 152, stroke = 14, animateKey = null }) {
  const pad = 16;
  const vb = size + pad * 2;
  const cx = vb / 2;
  const cy = vb / 2;
  const r = (size - stroke) / 2;
  const burnR = r - stroke / 2 - 7;
  // 消耗环的粗细：画弧和画刻度共用一个数，否则刻度出头的长度会跟着漂
  const BURN_STROKE = 3.5;
  const span = 360 - RING_GAP_DEG;
  const start = -90 + RING_GAP_DEG / 2;
  const angleOf = (p) => start + (Math.max(0, Math.min(100, p)) / 100) * span;
  const point = (deg, radius) => [
    cx + radius * Math.cos((deg * Math.PI) / 180),
    cy + radius * Math.sin((deg * Math.PI) / 180),
  ];

  const svg = el('svg', {
    viewBox: `0 0 ${vb} ${vb}`, class: 'ring energy-ring',
    preserveAspectRatio: 'xMidYMid meet', overflow: 'visible',
  });

  /* 两条轨道的几何和配色都只写一次，段落按 track / tone 取 */
  const TRACK = {
    intake: { radius: r, width: stroke, light: 'var(--ring-eat)', deep: 'var(--ring-eat-wrap)' },
    burn: { radius: burnR, width: BURN_STROKE, light: 'var(--ring-burn)', deep: 'var(--ring-burn-wrap)' },
  };

  /* 这一版的记忆重记一份，画完整棵树再换上去 —— 中途失败不该留下半份 */
  const nextArc = new Map();
  const canAnimate = animateKey != null && !reduceMotion() && typeof SVGElement !== 'undefined'
    && typeof SVGElement.prototype.animate === 'function';

  const arc = (radius, width, cls, colour, fromPct, toPct, memoKey = null) => {
    const circ = 2 * Math.PI * radius;
    const usable = (span / 360) * circ;
    const from = (Math.max(0, Math.min(100, fromPct)) / 100) * usable;
    const len = (Math.max(0, Math.min(100, toPct)) / 100) * usable - from;
    const dash = (l) => `0 ${from} ${Math.max(0, l)} ${circ}`;
    const memo = memoKey && { key: `${animateKey}|${model.scale}|${memoKey}`, len };
    if (memo) nextArc.set(memo.key, len);
    if (!(len > 0.3)) return;
    const node = el('circle', {
      cx, cy, r: radius, fill: 'none', class: cls, 'stroke-width': width, stroke: colour,
      'stroke-dasharray': dash(len),
      transform: `rotate(${start} ${cx} ${cy})`,
    });
    svg.append(node);
    /*
     * 记一笔饮食之后弧应该长过去，而不是原地换一个长度 ——
     * 那一下是「刚才这口饭走了这么远」，跳变把它说没了。
     * 动画只改 CSS 上的 stroke-dasharray，结束后自然落回属性上的终值。
     */
    if (!canAnimate || !memo) return;
    const prev = lastArc.get(memo.key);
    if (prev == null || Math.abs(prev - len) < 0.5) return;
    node.animate(
      [{ strokeDasharray: dash(prev) }, { strokeDasharray: dash(len) }],
      { duration: ARC_MS, easing: 'cubic-bezier(.22,.61,.36,1)' },
    );
  };

  // 灰轨先铺满，两条都有 —— 没画到的地方就是还没走到的部分
  arc(r, stroke, 'ring-track', null, 0, 100);
  arc(burnR, BURN_STROKE, 'ring-burn-track', null, 0, 100);

  /*
   * 先画完所有第一圈，再画所有第二圈。
   *
   * 同一条轨道上第二圈必须压在第一圈上面（深色盖浅色），而 model.segments
   * 的顺序不保证这一点 —— 按 tone 分两趟画，叠放次序就跟数据顺序无关了。
   */
  for (const tone of ['light', 'deep']) {
    for (const seg of model.segments || []) {
      if (seg.tone !== tone) continue;
      const t = TRACK[seg.track] || TRACK.intake;
      arc(t.radius, t.width, `ring-seg ring-seg-${seg.track} ring-seg-${tone}`,
        t[tone], seg.fromPct, seg.toPct, seg.key);
    }
  }

  const [sx, sy] = point(start, r);
  svg.append(el('rect', {
    x: sx - 2.4, y: sy - 2.4, width: 4.8, height: 4.8, rx: 1, class: 'ring-origin',
  }));

  /*
   * 刻度线完整穿过它标的那条轨道，两端各出头一点点。
   *
   * 早先两条都只刻了一半：摄入那条浮在环的外侧、消耗那条从消耗环冲进主环
   * 停在半路 —— 穿不透的刻度读作「划痕」，不是「记号」。
   * 每条刻度只管自己那条轨道：摄入标主环，消耗标消耗环。
   */
  const OVERHANG = 2.5;
  for (const tick of model.ticks || []) {
    const t = TRACK[tick.track] || TRACK.intake;
    const deg = angleOf(tick.pct);
    const [x1, y1] = point(deg, t.radius - t.width / 2 - OVERHANG);
    const [x2, y2] = point(deg, t.radius + t.width / 2 + OVERHANG);
    /*
     * 刻度跟着它标的那条轨道走色：摄入用绿、消耗用金，跑过一整圈换成对应的深色。
     * 颜色和弧段取自同一张 TRACK 表 —— 刻度和它标的那条弧永远不会走散。
     */
    const tone = tick.laps >= 1 ? 'deep' : 'light';
    svg.append(el('line', {
      x1, y1, x2, y2, stroke: t[tone],
      class: `ring-tick ring-tick-${tick.key} ring-tick-${tone}`,
    }));
  }

  /*
   * 圈心三行，整块居中：
   *   还可摄入     ← 最小
   *     2184       ← 最大
   *     kcal       ← 介于两者之间，贴着数字
   *
   * 差得很少时没有数字，那一句自己占住中间。
   */
  if (model.center) {
    const line = (y, sizePx, weight, cls, text) => {
      const t = el('text', {
        x: cx, y, 'text-anchor': 'middle',
        'dominant-baseline': 'central', 'alignment-baseline': 'middle',
        class: cls, 'font-size': sizePx, 'font-weight': weight,
      });
      t.textContent = text;
      svg.append(t);
    };
    const hasNumber = model.center.kcal != null;
    if (hasNumber) {
      const cap = size / 14;     // 标题最小
      const val = size / 4.9;    // 数字最大
      const unit = size / 8.2;   // kcal 介于两者之间
      const gapTop = size / 16;   // 标题到数字
      const gapBot = size / 48;   // 数字到 kcal，更紧
      const block = cap + gapTop + val + gapBot + unit;
      const captionY = cy - block / 2 + cap / 2;
      const valueY = captionY + cap / 2 + gapTop + val / 2;
      const unitY = valueY + val / 2 + gapBot + unit / 2;
      line(captionY, cap, 500, 'ring-caption', model.center.label);
      line(valueY, val, 700, 'ring-value', String(model.center.kcal));
      line(unitY, unit, 500, 'ring-unit', 'kcal');
    } else {
      line(cy, size / 8.5, 600, 'ring-caption', model.center.label);
    }
  }
  lastArc.clear();
  for (const [k, v] of nextArc) lastArc.set(k, v);
  return svg;
}
