// ============================================================
//  engine.js — deterministic beat-synced canvas renderer core
// ============================================================
const W = 1920, H = 1080;
const COL = {
  bg: '#060504', bg2: '#0d0b08', ink: '#f3eee4',
  dim: 'rgba(243,238,228,0.58)', faint: 'rgba(243,238,228,0.14)', hair: 'rgba(243,238,228,0.08)',
  aud: '#7dd3c6', vid: '#f0a65a', gold: '#ffd98a', off: '#e86a56', mint: '#f4b6a6',
  ring: '#e1b669', cream: '#ffe5b3', hot: '#fff6e4', wave: '#f4f0e6',
};
const FONT = {
  sans: '"Noto Sans SC Variable", sans-serif',
  serif: '"Noto Serif SC Variable", serif',
  mono: '"JetBrains Mono", "Noto Sans SC Variable", monospace',
  grot: '"Space Grotesk Variable", "Noto Sans SC Variable", sans-serif',
};
let TL = null, AD = null;
const SCN = {};   // name -> {draw(ctx,t,s), hud, chap}
const TR = {};    // incoming transition per scene: {type, n (beats), pre (beats), ...}
const VIS_LEAD = 0.033;           // grid sits ~25 ms after the real drum attacks; +8 ms so visuals land a hair early ("宁早勿晚")
const ATTACK = 0.025;             // true attack = grid time - ATTACK

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const TAU = Math.PI * 2;
const E = {
  lin: t => t,
  inQ: t => t * t, outQ: t => 1 - (1 - t) * (1 - t),
  inC: t => t * t * t, outC: t => 1 - Math.pow(1 - t, 3),
  ioC: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQu: t => 1 - Math.pow(1 - t, 5),
  outE: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inE: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  ioE: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outB: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outEl: t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * TAU / 3) + 1,
  ss: t => t * t * (3 - 2 * t),
  sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
};
// ---------- beat helpers ----------
function SB(name) { const s = TL.scenes.find(x => x.name === name); return s ? s.b0 : 0; }
const bt = k => TL.t0 + k * TL.T;
const B = t => (t - TL.t0) / TL.T;
const A = (t, a, d, e = E.outE) => e(clamp((t - a) / d));            // time-based progress
const Ab = (t, k, n, e = E.outE) => A(t, bt(k), n * TL.T, e);         // beat-based progress
const since = (t, k) => t - bt(k);
function lastBeat(t, step = 1, off = 0) { return Math.floor((B(t) - off) / step + 1e-9) * step + off; }
function pulse(t, decay = 0.16, step = 1, off = 0) { const k = lastBeat(t, step, off); return Math.exp(-(t - bt(k)) / decay); }
function pulseAt(t, k, decay = 0.16) { const d = t - bt(k); return d < 0 ? 0 : Math.exp(-d / decay); }
// a list of hit beats -> decaying pulse of most recent
function pulseList(t, list, decay = 0.16) { let best = 0; for (const k of list) { const d = t - bt(k); if (d >= 0 && d < decay * 8) best = Math.max(best, Math.exp(-d / decay)); } return best; }

// ---------- deterministic randomness ----------
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
const R = (a, b = 0) => hash((a * 7919 + b * 104729 + 13) | 0);
function vnoise(x, seed = 0) { const i = Math.floor(x), f = x - i; const a = R(i, seed), b = R(i + 1, seed); const u = f * f * (3 - 2 * f); return a + (b - a) * u; }

// ---------- audio data ----------
function envAt(t, ch) {   // 0 rms, 1 low, 2 high, 3 flux, 4 lowflux
  const m = AD.meta, L = m.env_len; const i = t * m.env_rate; const i0 = Math.floor(i);
  if (i0 < 0 || i0 >= L - 1) return 0; const f = i - i0;
  return (AD.env[ch * L + i0] * (1 - f) + AD.env[ch * L + i0 + 1] * f) / 255;
}
function waveAt(t) { const m = AD.meta; const i = Math.floor(t * m.wave_rate); if (i < 0 || i >= m.wave_len) return 0; return AD.wave[i] / 255; }
function specAt(t, b) { const m = AD.meta; const i = Math.floor(t * m.env_rate); if (i < 0 || i >= m.env_len) return 0; return AD.spec[i * 32 + b] / 255; }

// ---------- drawing helpers ----------
function font(ctx, size, weight = 700, fam = FONT.sans) { ctx.font = `${weight} ${size}px ${fam}`; }
// centre a string on its ink (not its advance box): full-width CJK punctuation sits off-centre in its box
function inkCenter(ctx, s, x, y, o = {}) {
  ctx.save(); font(ctx, o.size || 40, o.weight || 700, o.fam || FONT.sans); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(s); const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  ctx.fillStyle = o.color || COL.ink; if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.fillText(s, x - w / 2 + m.actualBoundingBoxLeft, y - h / 2 + m.actualBoundingBoxAscent); ctx.restore();
}
function txt(ctx, s, x, y, o = {}) {
  ctx.save();
  font(ctx, o.size || 40, o.weight || 700, o.fam || FONT.sans);
  ctx.fillStyle = o.color || COL.ink; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.letterSpacing = (o.ls || 0) + 'px';
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 2; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  else ctx.fillText(s, x, y);
  ctx.restore();
}
function measure(ctx, s, size, weight = 700, fam = FONT.sans, ls = 0) {
  ctx.save(); font(ctx, size, weight, fam); ctx.letterSpacing = ls + 'px'; const w = ctx.measureText(s).width; ctx.restore(); return w;
}
// per-char animated text. fn(i, n) -> {dx,dy,s,a,color,rot}
function ctext(ctx, s, x, y, o, fn) {
  const chars = [...s]; ctx.save(); font(ctx, o.size, o.weight || 900, o.fam || FONT.sans); ctx.letterSpacing = '0px';
  const ls = o.ls || 0; const ws = chars.map(c => ctx.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + ls * (chars.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  ctx.textBaseline = o.base || 'alphabetic'; ctx.textAlign = 'center';
  for (let i = 0; i < chars.length; i++) {
    const r = fn ? fn(i, chars.length) : {}; const a = r.a == null ? 1 : r.a;
    if (a > 0.001) {
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx + ws[i] / 2 + (r.dx || 0), y + (r.dy || 0));
      if (r.rot) ctx.rotate(r.rot); const sc = r.s == null ? 1 : r.s; ctx.scale(sc, sc);
      if (o.stroke && !r.fill) { ctx.strokeStyle = r.color || o.stroke; ctx.lineWidth = o.lw || 2; ctx.strokeText(chars[i], 0, 0); }
      else { ctx.fillStyle = r.color || o.color || COL.ink; ctx.fillText(chars[i], 0, 0); }
      ctx.restore();
    }
    cx += ws[i] + ls;
  }
  ctx.restore(); return total;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function withAlpha(ctx, a, f) { ctx.save(); ctx.globalAlpha *= a; f(); ctx.restore(); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

// glow sprite cache (cheap bloom)
const GLOW = {};
function glowSprite(color) {
  if (GLOW[color]) return GLOW[color];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.25, hexA(color, 0.45)); gr.addColorStop(0.6, hexA(color, 0.1)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); GLOW[color] = c; return c;
}
function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0.003 || r <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
  ctx.drawImage(glowSprite(color), x - r, y - r, 2 * r, 2 * r); ctx.restore();
}

// ---------- background ----------
function bgBase(ctx, t, o = {}) {
  ctx.fillStyle = o.color || COL.bg; ctx.fillRect(0, 0, W, H);
  const tint = o.tint || COL.ring; const ga = (o.glow == null ? 0.10 : o.glow) * 0.75;
  const lo = envAt(t, 1);
  glow(ctx, W * (o.gx || 0.5), H * (o.gy || 0.45), 1100 + 60 * lo, tint, ga * (0.75 + 0.35 * lo));
  if (o.stars !== false) stars(ctx, t, o.starLevel == null ? 1 : o.starLevel);
  if (o.grid === true) dotGrid(ctx, t, o);
}
let STARS = null;
function stars(ctx, t, level = 1) {
  if (level <= 0.01) return;
  if (!STARS) { STARS = []; for (let i = 0; i < 130; i++) STARS.push({ x: R(i, 101) * (W + 160) - 80, y: R(i, 102) * (H + 120) - 60, a: .035 + .085 * R(i, 103), r: 1 + .8 * R(i, 104), ph: TAU * R(i, 105), sp: .6 + R(i, 106) }); }
  ctx.save(); ctx.fillStyle = COL.ring;
  for (const st of STARS) {
    const x = ((st.x + 80 - 22 * st.sp * t) % (W + 160) + (W + 160)) % (W + 160) - 80;
    const a = st.a * (.6 + .45 * Math.sin(st.ph + 1.7 * st.sp * t)) * level * (1 + .9 * pulse(t, .16)); if (a <= 0.004) continue;
    ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, st.y, st.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function dotGrid(ctx, t, o = {}) {
  const step = o.step || 60; const off = ((o.scroll || 0) * t) % step;
  ctx.save(); ctx.fillStyle = 'rgba(243,238,228,0.075)';
  const p = pulse(t, 0.2);
  for (let y = step / 2; y < H; y += step) for (let x = step / 2 - off; x < W + step; x += step) {
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  if (o.beatGrid !== false && p > 0.02) { ctx.globalAlpha = p * 0.05; ctx.fillStyle = COL.ink; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------- layers ----------
function mkLayer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

// ---------- subtitles ----------
const PUNCT = /[，。：；？！—“”、\s]/;
function prepSubs() {
  for (const n of TL.narr) {
    const chars = [...n.text]; const times = []; let wi = 0, wc = 0;
    const words = n.words;
    for (const c of chars) {
      if (PUNCT.test(c)) { times.push(null); continue; }
      const w = words[Math.min(wi, words.length - 1)]; const wl = [...w.w].length;
      times.push(w.t + (w.d * wc) / wl); wc++; if (wc >= wl) { wi++; wc = 0; }
    }
    // chunks split at major punctuation, max ~19 chars
    const chunks = []; let cur = [];
    const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
    for (let i = 0; i < chars.length; i++) {
      cur.push(i); const c = chars[i];
      const soft = '，、：；—'.includes(c); const hard = '。？！'.includes(c);
      const len = cur.filter(j => !PUNCT.test(chars[j])).length;
      if (hard && i < chars.length - 1) flush();
      else if (soft && len >= 7) {
        // look ahead: length until next punctuation
        let k = i + 1, nxt = 0; while (k < chars.length && !PUNCT.test(chars[k])) { nxt++; k++; }
        if (len + nxt > 17) flush();
      }
    }
    flush();
    n._chars = chars; n._times = times;
    n._chunks = chunks.map(ix => {
      // trim trailing soft punctuation for display
      let ids = ix.slice(); while (ids.length && '，。、：；—'.includes(chars[ids[ids.length - 1]])) ids.pop();
      while (ids.length && '—'.includes(chars[ids[0]])) ids.shift();
      const ts = ids.map(j => times[j]).filter(v => v != null);
      return { ids, t0: Math.min(...ts), t1: Math.max(...ts) };
    }).filter(c => c.ids.length);
  }
}
function drawSubs(ctx, t, alphaMul = 1) {
  let line = null;
  for (const n of TL.narr) if (t >= n.words[0].t - 0.12 && t <= n.end + 0.45) line = n;
  if (!line) return;
  const ch = line._chunks; let ci = 0;
  for (let i = 0; i < ch.length; i++) if (t >= ch[i].t0 - 0.12) ci = i;
  const c = ch[ci];
  const fadeIn = A(t, line.words[0].t - 0.12, 0.18, E.outC);
  const fadeOut = 1 - A(t, line.end + 0.2, 0.25, E.inQ);
  const a = Math.min(fadeIn, fadeOut) * alphaMul; if (a <= 0) return;
  const chunkIn = A(t, c.t0 - 0.12, 0.2, E.outC), pop = 1.05 - .05 * E.outB(clamp((t - c.t0 + .12) / .22));
  const s = c.ids.map(j => line._chars[j]).join('');
  const size = 42, y = 986;
  ctx.save();
  // soft backdrop band
  const g = ctx.createLinearGradient(0, H - 230, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, H - 230, W, 230);
  ctx.translate(W / 2, y); ctx.scale(pop, pop); ctx.translate(-W / 2, -y);
  ctext(ctx, s, W / 2, y + (1 - chunkIn) * 10, { size, weight: 600, align: 'center', ls: 2 }, (i) => {
    const tc = line._times[c.ids[i]]; const spoken = tc == null ? 1 : A(t, tc - 0.03, 0.12, E.outC);
    return { a: (0.42 + 0.58 * spoken) * chunkIn };
  });
  ctx.restore();
}

// ---------- HUD ----------
function drawHUD(ctx, t, s, a) {
  if (a <= 0.003) return;
  ctx.save(); ctx.globalAlpha = a;
  // top-left
  txt(ctx, '卡点为什么爽', 72, 78, { size: 22, weight: 700, color: COL.ink, ls: 3, alpha: 0.85 });
  if (s.chap) {
    const w = measure(ctx, '卡点为什么爽', 22, 700, FONT.sans, 3);
    ctx.fillStyle = COL.faint; ctx.fillRect(72 + w + 18, 60, 1, 24);
    txt(ctx, s.chap, 72 + w + 36, 78, { size: 20, weight: 500, fam: FONT.mono, color: COL.dim, ls: 2 });
  }
  ctx.restore();
}
function drawRuler(ctx, t, a, y = 1046) {
  if (a <= 0.003) return;
  const ppb = 56, cx = W / 2, b = B(t + VIS_LEAD);
  ctx.save(); ctx.globalAlpha = a;
  const fade = ctx.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, 'rgba(243,238,228,0)'); fade.addColorStop(0.3, 'rgba(243,238,228,0.32)'); fade.addColorStop(0.7, 'rgba(243,238,228,0.32)'); fade.addColorStop(1, 'rgba(243,238,228,0)');
  ctx.fillStyle = fade; ctx.fillRect(0, y, W, 1);
  const k0 = Math.floor(b - cx / ppb) - 1, k1 = Math.ceil(b + cx / ppb) + 1;
  for (let k = k0; k <= k1; k++) {
    const x = cx + (k - b) * ppb; const d = Math.abs(x - cx) / cx; const al = Math.max(0, 1 - d * 1.15);
    const down = k % 4 === 0; const h = down ? 12 : 6;
    ctx.fillStyle = `rgba(243,238,228,${(down ? 0.55 : 0.32) * al})`; ctx.fillRect(x - 0.75, y - h, 1.5, h);
  }
  const p = pulse(t + VIS_LEAD, 0.18);
  ctx.fillStyle = COL.gold; ctx.fillRect(cx - 1, y - 18, 2, 24);
  glow(ctx, cx, y - 6, 26 + 20 * p, COL.gold, 0.35 + 0.65 * p);
  ctx.restore();
}

// ---------- grain / vignette ----------
let GRAIN = [], VIG = null;
function initPost() {
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 384; const g = c.getContext('2d');
    const im = g.createImageData(384, 384);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); GRAIN.push(c);
  }
  VIG = document.createElement('canvas'); VIG.width = W; VIG.height = H; const g = VIG.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function post(ctx, t, frame) {
  ctx.drawImage(VIG, 0, 0);
  const gc = GRAIN[frame % 4]; ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
  const ox = (R(frame, 1) * 384) | 0, oy = (R(frame, 2) * 384) | 0;
  for (let y = -oy; y < H; y += 384) for (let x = -ox; x < W; x += 384) ctx.drawImage(gc, x, y);
  ctx.restore();
}

// ============================================================
//  HALO kit — drum-driven ring, shockwaves, slashes, bloom
//  (design after the next-beat v6 opening)
// ============================================================
let HITS = { kick: [], snare: [] };
let LL = null, LLc = null, SM = null, SMc = null;     // light layer + bloom buffer
let FRAME_T = 0, FRAME_GLOW = 0.55, FRAME_FLASH = 0, FRAME_FLASH_COL = null, CAM = { z: 1, dx: 0, dy: 0 };
function initHalo(h) {
  for (const k of ['kick', 'snare']) HITS[k] = (h[k] || []).map(([tt, s]) => ({ t: tt + ATTACK, s }));   // -> grid-referenced time
  LL = mkLayer(); LLc = LL.getContext('2d');
  SM = document.createElement('canvas'); SM.width = 480; SM.height = 270; SMc = SM.getContext('2d');
}
function lightCtx() { return LLc; }
let DUMMYc = null;
// draw without contributing light (outgoing scenes in a transition: their light would not be masked)
function noLight(fn) { if (!DUMMYc) { const c = document.createElement('canvas'); c.width = c.height = 1; DUMMYc = c.getContext('2d'); } const real = LLc; LLc = DUMMYc; try { fn(); } finally { LLc = real; } }
function hitsRecent(kind, t, horizon, minS = 0) {
  const out = []; for (const h of HITS[kind]) { const age = t - h.t; if (age >= 0 && age < horizon && h.s >= minS) out.push({ ...h, age }); } return out;
}
function hitEnv(kind, t, tau, minS = 0) { let e = 0; for (const h of hitsRecent(kind, t, tau * 6, minS)) e = Math.max(e, h.s * Math.exp(-h.age / tau)); return e; }
function hitNext(kind, t, minS = 0) { for (const h of HITS[kind]) if (h.t > t && h.s >= minS) return h; return null; }
const LOUD = 0.6;
// how the drums move a ring on this frame (kick sinks & swells it, snare jolts it on a damped spring)
function ringDrive(t, gain = 1, since = -1e9) {
  let swell = 0, dx = 0, dy = 0, fl = 0; const waves = [];
  for (const h of hitsRecent('kick', t, .7)) {
    if (h.t < since) continue; const p = Math.pow(h.s, .9) * gain;
    swell += .17 * p * Math.exp(-h.age / .1); dy += 28 * p * Math.exp(-h.age / .09); fl = Math.max(fl, p * Math.exp(-h.age / .11));
    if (h.age < .62) waves.push({ age: h.age, p, kind: 'kick', life: .62 });
  }
  for (const h of hitsRecent('snare', t, .7, .25)) {
    if (h.t < since) continue; const p = Math.pow(h.s, .9) * gain;
    const side = Math.round(B(h.t) * 2) % 4 < 2 ? 1 : -1;
    dx += side * 30 * p * Math.exp(-h.age / .13) * Math.cos(TAU * h.age / .15);
    swell += .06 * p * Math.exp(-h.age / .08); fl = Math.max(fl, p * Math.exp(-h.age / .13));
    if (h.age < .55 && h.s > .35) waves.push({ age: h.age, p, kind: 'snare', life: .55 });
  }
  return { swell, dx, dy, fl: Math.min(1, fl), waves };
}
function mixHex(a, b, u) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); u = clamp(u);
  const r = Math.round(lerp(pa >> 16 & 255, pb >> 16 & 255, u)), g = Math.round(lerp(pa >> 8 & 255, pb >> 8 & 255, u)), bl = Math.round(lerp(pa & 255, pb & 255, u));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}
function arc(ctx, x, y, r, a0, a1, color, a, w) { if (a <= .003 || r <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke(); ctx.restore(); }
function ringLine(ctx, x, y, r, color, a, w) { if (a <= .003 || r <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore(); }
function segRing(ctx, cx, cy, R, gap, push, w, a, n = 12, color = COL.ring, phase = 0) {
  for (let i = 0; i < n; i++) {
    const a0 = phase + i * TAU / n + gap / 2, a1 = phase + (i + 1) * TAU / n - gap / 2, mid = (a0 + a1) / 2;
    const p = push ? push[i % push.length] : 0;
    arc(ctx, cx + p * Math.cos(mid), cy + p * Math.sin(mid), R, a0, a1, color, a, w);
  }
}
function ringWaves(cx, cy, R, waves, a = 1) {
  const L = LLc;
  for (const w of waves) {
    const u = w.age / w.life, reach = (w.kind === 'kick' ? 260 : 360) * (.5 + .7 * w.p);
    const r = R + 16 + reach * (1 - Math.pow(1 - u, 2)); const al = a * (.3 + .7 * w.p) * Math.pow(1 - u, 1.6);
    if (al > .01) ringLine(L, cx, cy, r, COL.wave, al, 3 + 13 * w.p * (1 - .6 * u));
  }
}
function ticksRing(ctx, cx, cy, rIn, n, t, width = 2.2, len = 11, base = .22) {
  const b2 = B(t) * 2, idx = Math.floor(b2), lit = Math.exp(-(b2 - idx) / .35);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + i * TAU / n, on = ((idx % n) + n) % n === i ? lit : 0, r2 = rIn + len + 16 * on;
    ctx.save(); ctx.globalAlpha *= base + (1 - base) * on; ctx.strokeStyle = on > .05 ? COL.cream : COL.ring; ctx.lineWidth = width;
    line(ctx, cx + rIn * Math.cos(ang), cy + rIn * Math.sin(ang), cx + r2 * Math.cos(ang), cy + r2 * Math.sin(ang)); ctx.restore();
  }
}
// full-width light that cuts across the frame on a loud snare
function slash(t, cy, opts = {}) {
  const rec = hitsRecent('snare', t, .45, opts.min || LOUD).filter(h => h.t >= (opts.since || -1e9)); if (!rec.length) return 0;
  const h = rec[rec.length - 1], L = LLc, cx = opts.cx || W / 2;
  const reach = 1150 * Math.min(1, (h.age + 1 / 60) / (2 / 30)); const a = h.s * Math.exp(-h.age / .12) * (opts.gain || 1);
  L.save(); L.strokeStyle = COL.cream; L.globalAlpha = a; L.lineWidth = 2 + 7 * a; line(L, cx - reach, cy, cx + reach, cy);
  if (reach > 900) { const g = L.createLinearGradient(0, cy - 140, 0, cy + 140); g.addColorStop(0, 'rgba(255,229,179,0)'); g.addColorStop(.5, `rgba(255,229,179,${.14 * a})`); g.addColorStop(1, 'rgba(255,229,179,0)'); L.globalAlpha = 1; L.fillStyle = g; L.fillRect(0, cy - 140, W, 280); }
  L.globalAlpha = a * .5; L.strokeStyle = COL.ring; L.lineWidth = 1.5; line(L, cx - reach * .7, cy - 10, cx + reach * .7, cy - 10); if (opts.double) line(L, cx - reach * .7, cy + 10, cx + reach * .7, cy + 10);
  L.restore(); return a;
}
// the groove ring: every kick/snare moves it by its own strength and throws its own shockwave
function haloRing(ctx, t, cx, cy, R0, o = {}) {
  const g = o.grow == null ? 1 : o.grow, gain = o.gain == null ? 1 : o.gain;
  const k = hitEnv('kick', t, .14) * gain, sb = hitEnv('snare', t, .17, LOUD) * gain, sn = hitEnv('snare', t, .11) * gain;
  const d = ringDrive(t, gain, o.since);
  let wind = 0; const nx = hitNext('snare', t, LOUD);
  if (nx && o.wind !== false) { const half = .5 * TL.T; const q = clamp(1 - (nx.t - t) / half); wind = Math.pow(q, 3) * .07 * nx.s * gain; }
  const R = R0 * g * (1 + d.swell - wind), x = cx + d.dx * g, y = cy + d.dy * g;
  if (o.halo) glow(ctx, x, y, R * 2.2, COL.ring, o.halo * (1 + .6 * k + .4 * sn));
  const col = mixHex(COL.ring, COL.hot, d.fl), alpha = o.alpha == null ? .95 : o.alpha;
  const gap = (o.gap == null ? .05 : o.gap) + .30 * sb + .08 * sn;
  const push = o.push === false ? null : (o.wobble || [1, .7, 1.3, .9, 1.1, .8, 1.2, 1, .75, 1.25, .95, 1.05]).map(v => v * 48 * sb);
  segRing(ctx, x, y, R, gap, push, ((o.width || 4) + 2.5 * k) * (1 + 1.8 * d.fl), alpha * (.88 + .12 * k), o.n || 12, col, o.phase || 0);
  if (d.fl > .02) ringLine(LLc, x, y, R, COL.cream, .55 * d.fl * alpha, 10 + 14 * d.fl);
  if (o.inner) segRing(ctx, x, y, R * .66, gap * 1.3, push && push.map(v => v * .6), 2.5 * (1 + d.fl), (.55 + .45 * sb) * alpha, 8, col, Math.PI / 8);
  ringLine(ctx, x, y, R + 24, COL.ring, (.16 + .2 * d.fl) * alpha, 1.2);
  if (o.waves !== false) ringWaves(x, y, R0 * g, d.waves, alpha * g);
  if (o.ticks !== false) ticksRing(ctx, x, y, R + 38, o.nt || 16, t);
  if (o.dot !== false) { circle(ctx, x, y, (5 + 7 * k) * g); ctx.fillStyle = COL.cream; ctx.globalAlpha = .92 * alpha; ctx.fill(); ctx.globalAlpha = 1; }
  FRAME_GLOW = Math.max(FRAME_GLOW, .55 + .9 * sb + .5 * k);
  return { x, y, R, k, sb, sn, fl: d.fl };
}
// particles thrown out by a drop
const BURST = [];
function burst(cx, cy, age, gain = 1, life = 2.2, n = 140, seed = 1) {
  if (age < 0 || age >= life) return; const L = LLc, drag = 3.2, fade = Math.pow(1 - age / life, 1.5) * gain;
  L.save(); L.strokeStyle = COL.cream; L.fillStyle = COL.cream;
  for (let i = 0; i < n; i++) {
    const dir = TAU * R(i, 300 + seed), sp = 520 + 1480 * R(i, 301 + seed), sz = 1.6 + 2.8 * R(i, 302 + seed);
    const dist = sp * (1 - Math.exp(-drag * age)) / drag, x = cx + dist * Math.cos(dir), y = cy + dist * Math.sin(dir);
    const tail = sp * Math.exp(-drag * age) * .028; L.globalAlpha = fade;
    if (tail > 1) { L.lineWidth = sz * .7; line(L, x, y, x - tail * Math.cos(dir), y - tail * Math.sin(dir)); }
    L.beginPath(); L.arc(x, y, sz, 0, TAU); L.fill();
  }
  L.restore();
}
function shakeOff(t, tEvent, amp = 12, tau = .09) { const a = t - tEvent; if (a < 0) return [0, 0]; const m = amp * Math.exp(-a / tau); const d = TAU * R(Math.floor(a * 60), 77); return [m * Math.cos(d), m * Math.sin(d)]; }
function flashCream(a) { FRAME_FLASH = Math.max(FRAME_FLASH, a); }
// camera lean on each downbeat (fast ease-out, settles over the bar)
function barPush(t, amount = .022) {
  const b = B(t), k = Math.floor(b / 4) * 4, u = (b - k) / 4; const rise = 1 - Math.pow(1 - Math.min(1, u / .12), 2);
  const fall = u > .12 ? 1 - E.ss((u - .12) / .88) : 1; return 1 + amount * rise * fall;
}
function applyLight(ctx) {
  // the light itself, then a two-radius bloom computed from it
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2 + CAM.dx, H / 2 + CAM.dy); ctx.scale(CAM.z, CAM.z); ctx.translate(-W / 2, -H / 2);
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(LL, 0, 0);
  const g = Math.min(FRAME_GLOW, .9);
  SMc.globalCompositeOperation = 'copy'; SMc.filter = 'blur(1.6px)'; SMc.drawImage(LL, 0, 0, 480, 270);
  ctx.globalAlpha = .6 * g; ctx.drawImage(SM, 0, 0, W, H);
  SMc.filter = 'blur(6px)'; SMc.drawImage(LL, 0, 0, 480, 270);
  ctx.globalAlpha = .95 * g; ctx.drawImage(SM, 0, 0, W, H);
  SMc.filter = 'none';
  ctx.restore();
}
