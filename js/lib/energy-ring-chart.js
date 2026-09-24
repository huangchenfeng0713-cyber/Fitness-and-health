/**
 * 今日热量环只负责绘制，刻度、圈数和真实数值仍由 core/energy-ring.js 决定。
 * Canvas 把每条弧切成细小的角度片，颜色沿进度单调加深；圈心与图例仍是 HTML。
 */

const GAP_DEG = 8;
const ARC_MS = 520;
const STEPS_PER_LAP = 120;
const TOKENS = {
  intake: ['--ring-eat-start', '--ring-eat', '--ring-eat-wrap'],
  burn: ['--ring-burn-start', '--ring-burn', '--ring-burn-wrap'],
};
const FALLBACK = {
  intake: ['#dcfff0', '#42c992', '#1c9e75'],
  burn: ['#fff3d3', '#e8ad55', '#c88935'],
};

const lastArc = new Map();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const hex = (value) => /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;

function reduceMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 从设计 token 读取两条轨道各自的三档颜色。 */
export function ringPalette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(TOKENS).map(([track, names]) => [track,
    names.map((name, i) => hex(style.getPropertyValue(name).trim()) || FALLBACK[track][i])]));
}

function mixHex(from, to, t) {
  const channels = [1, 3, 5].map(i => Math.round(
    parseInt(from.slice(i, i + 2), 16) * (1 - t) + parseInt(to.slice(i, i + 2), 16) * t,
  ));
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

/** 第一圈由浅到中，第二圈由中到深；超过两圈时颜色停在最深档。 */
export function ringProgressColor(track, totalPct, palette) {
  const stops = palette[track];
  const progress = clamp(Number.isFinite(totalPct) ? totalPct : 0, 0, 200);
  const stage = progress <= 100 ? 0 : 1;
  return mixHex(stops[stage], stops[stage + 1], (progress - stage * 100) / 100);
}

/** 图例色块始终取当前弧尖端的颜色，而非固定的圈数档。 */
export function ringTipColor(model, track, palette = ringPalette()) {
  const lap = model.laps?.[track === 'burn' ? 'burned' : 'eaten'];
  return ringProgressColor(track, (lap?.firstPct || 0) + (lap?.wrapPct || 0), palette);
}

function endpoint(ctx, cx, cy, radius, angle, width, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, width / 2, 0, Math.PI * 2);
  ctx.fill();
}

function trackArc(ctx, cx, cy, radius, width, start, span, color) {
  const trim = width / (2 * radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start + trim, start + span - trim);
  ctx.stroke();
}

function gradientArc(ctx, cx, cy, radius, width, start, span, pct, track, tone, palette) {
  if (!(pct > .3)) return;
  const length = radius * span * clamp(pct, 0, 100) / 100;
  // 圆头两侧各占半个描边，几何范围仍停在轨道的起止点之内。
  const insetOf = (l) => Math.min(width / 2, Math.max(0, l) / 2);
  const from = start + insetOf(length) / radius;
  const to = start + length / radius - insetOf(length) / radius;
  const base = tone === 'deep' ? 100 : 0;
  const firstColor = ringProgressColor(track, base, palette);
  const tipColor = ringProgressColor(track, base + pct, palette);
  const sliceAngle = span / STEPS_PER_LAP;

  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  for (let angle = from; angle < to - .0001; angle += sliceAngle) {
    const end = Math.min(to, angle + sliceAngle);
    const atPct = (angle + end) / 2 - start;
    ctx.strokeStyle = ringProgressColor(track, base + atPct / span * 100, palette);
    ctx.beginPath();
    // 相邻色段重叠约 1.5px，避免 Canvas 每段独立抗锯齿留下放射状细缝。
    ctx.arc(cx, cy, radius, angle, Math.min(to, end + .025));
    ctx.stroke();
  }
  endpoint(ctx, cx, cy, radius, from, width, firstColor);
  endpoint(ctx, cx, cy, radius, to, width, tipColor);
}

export function energyRingChart({ model, size = 152, stroke = 14, animateKey = null }) {
  const pad = 6;
  const vb = size + pad * 2;
  const cx = vb / 2;
  const cy = vb / 2;
  const radius = (size - stroke) / 2;
  const burnRadius = radius - stroke / 2 - 7;
  const burnWidth = 5;
  const span = (360 - GAP_DEG) * Math.PI / 180;
  const start = (-90 + GAP_DEG / 2) * Math.PI / 180;
  const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'ring energy-ring';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.round(vb * pixelRatio);
  canvas.height = Math.round(vb * pixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const palette = ringPalette();
  const trackColor = getComputedStyle(document.querySelector('.hero-body') || document.documentElement)
    .getPropertyValue('--hero-track').trim() || 'rgba(255,255,255,.14)';
  const current = new Map();
  const previous = new Map();
  const nextArc = new Map();
  let hasChange = false;
  for (const seg of model.segments || []) {
    const radiusFor = seg.track === 'burn' ? burnRadius : radius;
    const usable = radiusFor * span;
    const len = clamp(seg.toPct, 0, 100) / 100 * usable;
    const memo = animateKey == null ? null : `${animateKey}|${model.scale}|${seg.key}`;
    const prev = memo == null ? null : lastArc.get(memo);
    if (memo) nextArc.set(memo, len);
    current.set(seg.key, seg.toPct);
    previous.set(seg.key, prev == null ? seg.toPct : prev / usable * 100);
    if (prev != null && Math.abs(prev - len) >= .5) hasChange = true;
  }
  lastArc.clear();
  for (const [key, len] of nextArc) lastArc.set(key, len);

  const paint = (progress) => {
    ctx.clearRect(0, 0, vb, vb);
    trackArc(ctx, cx, cy, radius, stroke, start, span, trackColor);
    if (model.hasBurn) trackArc(ctx, cx, cy, burnRadius, burnWidth, start, span, trackColor);
    for (const tone of ['light', 'deep']) for (const seg of model.segments || []) {
      if (seg.tone !== tone) continue;
      const from = previous.get(seg.key) ?? seg.toPct;
      const to = current.get(seg.key) ?? seg.toPct;
      const pct = from + (to - from) * progress;
      gradientArc(ctx, cx, cy, seg.track === 'burn' ? burnRadius : radius,
        seg.track === 'burn' ? burnWidth : stroke, start, span, pct, seg.track, tone, palette);
    }
  };
  const canAnimate = animateKey != null && hasChange && !reduceMotion()
    && typeof requestAnimationFrame === 'function';
  if (!canAnimate) paint(1);
  else {
    paint(0);
    const started = performance.now();
    const tick = (now) => {
      if (!canvas.isConnected) return;
      const progress = clamp((now - started) / ARC_MS, 0, 1);
      paint(1 - (1 - progress) ** 3);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return canvas;
}
