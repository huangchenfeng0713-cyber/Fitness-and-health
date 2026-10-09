// ============================================================
//  shots.js — library of abstract "footage" shots for montages
//  each: (ctx, x, y, w, h, lt, t, seed) ; lt = seconds since cut
// ============================================================
const PAL = [
  ['#060504', '#ffe5b3', COL.ring], ['#e1b669', '#060504', '#fff6e4'], ['#060504', COL.aud, '#ffe5b3'],
  ['#f3eadb', '#060504', '#c8913f'], ['#ffd98a', '#060504', '#fff6e4'], ['#0d0b08', COL.vid, COL.cream],
  ['#7dd3c6', '#060504', '#fff6e4'], ['#14110c', COL.gold, COL.aud],
];
const SHOTS = {
  dot(ctx, x, y, w, h, lt, t, s, p) {
    const m = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, e = E.outE(clamp(lt / 0.45));
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = p[1]; ctx.lineWidth = m * 0.006;
    for (let i = 0; i < 3; i++) { const q = clamp((lt - i * 0.07) / 0.9); if (q <= 0) continue; ctx.globalAlpha = 1 - q; circle(ctx, cx, cy, m * (0.08 + 0.5 * E.outC(q))); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = p[1]; circle(ctx, cx, cy, m * 0.075 * e); ctx.fill();
  },
  circle(ctx, x, y, w, h, lt, t, s, p) {
    const m = Math.min(w, h), e = E.outE(clamp(lt / 0.4));
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const cx = x + w * (0.38 + 0.04 * Math.sin(t * 0.8 + s)), cy = y + h * 0.52;
    ctx.fillStyle = p[1]; circle(ctx, cx, cy, m * (0.36 + 0.06 * (1 - e))); ctx.fill();
    const a = t * 2.2 + s; ctx.fillStyle = p[2]; circle(ctx, cx + Math.cos(a) * m * 0.5, cy + Math.sin(a) * m * 0.5, m * 0.04); ctx.fill();
    ctx.strokeStyle = p[1]; ctx.lineWidth = 2; circle(ctx, cx, cy, m * 0.5); ctx.stroke();
  },
  bars(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const n = 14, gap = w * 0.012, bw = (w - gap * (n + 1)) / n, e = E.outE(clamp(lt / 0.3));
    for (let i = 0; i < n; i++) {
      const v = specAt(t, 2 + Math.floor(i * 1.9)); const hh = h * (0.12 + 0.72 * v) * e;
      ctx.fillStyle = i % 5 === 2 ? p[2] : p[1]; ctx.fillRect(x + gap + i * (bw + gap), y + h - hh - h * 0.08, bw, hh);
    }
  },
  char(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const chars = ['卡', '点', '拍', '切', '准', '对', '齐', '律'];
    const c = chars[Math.floor(s * 7.3) % chars.length]; const e = E.outE(clamp(lt / 0.5));
    ctx.save(); ctx.fillStyle = p[1]; font(ctx, h * 1.05, 900, FONT.sans); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(x + w * (0.5 + 0.12 * (R(s * 100, 3) - 0.5)), y + h * 0.56); const sc = 1.18 - 0.18 * e + 0.01 * lt; ctx.scale(sc, sc);
    ctx.fillText(c, 0, 0); ctx.restore();
    ctx.fillStyle = p[2]; ctx.fillRect(x + w * 0.06, y + h * 0.08, w * 0.12 * e, Math.max(3, h * 0.008));
  },
  grid(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const cols = 8, rows = 5, cw = w / cols, ch = h / rows, e = E.outE(clamp(lt / 0.35));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c, on = R(k, Math.floor(s * 1000)) > 0.5; const cx = x + c * cw + cw / 2, cy = y + r * ch + ch / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((on ? 1 : 0) * Math.PI / 2 * e + (on ? 0 : Math.PI / 4));
      ctx.fillStyle = on ? p[1] : p[2]; const sz = Math.min(cw, ch) * (on ? 0.42 : 0.18); ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore();
    }
  },
  stripes(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const sw = Math.min(w, h) * 0.09, off = (lt * sw * 2.4 + E.outE(clamp(lt / 0.35)) * sw * 2) % (sw * 2);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = p[1]; const L = Math.hypot(w, h);
    for (let k = -L; k < L; k += sw * 2) ctx.fillRect(k + off - L * 0, -L, sw, 2 * L);
    ctx.restore();
    ctx.fillStyle = p[0]; const bw = w * 0.36, bh = h * 0.22; ctx.fillRect(x + w / 2 - bw / 2, y + h / 2 - bh / 2, bw, bh);
    txt(ctx, 'BEAT', x + w / 2, y + h / 2 + bh * 0.2, { size: bh * 0.62, weight: 700, fam: FONT.grot, color: p[1], align: 'center', ls: bh * 0.05 });
  },
  rings(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const m = Math.max(w, h), cx = x + w / 2, cy = y + h / 2; ctx.strokeStyle = p[1];
    for (let i = 0; i < 9; i++) {
      const r = ((i / 9 + lt * 0.35) % 1) * m * 0.75 + E.outE(clamp(lt / 0.4)) * m * 0.03; ctx.globalAlpha = 1 - r / (m * 0.78);
      ctx.lineWidth = m * 0.004 + (i % 3 === 0 ? m * 0.006 : 0); circle(ctx, cx, cy, r); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = p[2]; circle(ctx, cx, cy, Math.min(w, h) * 0.03); ctx.fill();
  },
  wave(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const cy = y + h / 2, span = 2.4, e = E.outE(clamp(lt / 0.4));
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) { const u = i / 240; const v = waveAt(t - span / 2 + u * span); const xx = x + u * w; const yy = cy - v * h * 0.38 * e * (i % 2 ? 1 : -1); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
    ctx.strokeStyle = p[1]; ctx.lineWidth = Math.max(2, h * 0.006); ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = p[2]; ctx.fillRect(x + w / 2 - 1.5, y + h * 0.12, 3, h * 0.76);
  },
  tri(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const m = Math.min(w, h), cx = x + w / 2, cy = y + h * 0.54, e = E.outB(clamp(lt / 0.45));
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 6 * (1 - e) + lt * 0.15);
    ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; ctx.lineTo(Math.cos(a) * m * 0.4, Math.sin(a) * m * 0.4); } ctx.closePath();
    ctx.fillStyle = p[1]; ctx.fill(); ctx.rotate(Math.PI); ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; ctx.lineTo(Math.cos(a) * m * 0.22, Math.sin(a) * m * 0.22); } ctx.closePath();
    ctx.strokeStyle = p[2]; ctx.lineWidth = m * 0.012; ctx.stroke(); ctx.restore();
  },
  split(ctx, x, y, w, h, lt, t, s, p) {
    const e = E.outE(clamp(lt / 0.4)); const k = w * (0.5 + 0.25 * (1 - e) * (R(s * 50, 1) > 0.5 ? 1 : -1));
    ctx.fillStyle = COL.vid; ctx.fillRect(x, y, k, h); ctx.fillStyle = COL.aud; ctx.fillRect(x + k, y, w - k, h);
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(x + k - 3, y, 6, h);
    txt(ctx, '画面', x + k - w * 0.04, y + h * 0.62, { size: h * 0.16, weight: 900, color: '#060504', align: 'right' });
    txt(ctx, '声音', x + k + w * 0.04, y + h * 0.62, { size: h * 0.16, weight: 900, color: '#060504', align: 'left' });
  },
  burst(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const cx = x + w / 2, cy = y + h / 2, L = Math.hypot(w, h), n = 28, e = E.outE(clamp(lt / 0.4));
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(lt * 0.25 + s); ctx.fillStyle = p[1];
    for (let i = 0; i < n; i++) { ctx.rotate(TAU / n); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -L * 0.04 * e); ctx.lineTo(L, L * 0.04 * e); ctx.closePath(); ctx.fill(); }
    ctx.restore(); ctx.fillStyle = p[0]; circle(ctx, cx, cy, Math.min(w, h) * 0.16 * e); ctx.fill();
    ctx.fillStyle = p[2]; circle(ctx, cx, cy, Math.min(w, h) * 0.05); ctx.fill();
  },
  word(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const words = ['SYNC', 'CUT', 'HIT', 'DROP', 'BEAT']; const wd = words[Math.floor(s * 11) % words.length];
    const e = E.outE(clamp(lt / 0.45)); const sz = h * 0.42;
    for (let i = 0; i < 3; i++) txt(ctx, wd, x + w / 2, y + h / 2 + sz * 0.35 + (i - 1) * sz * 0.92 * e, { size: sz, weight: 700, fam: FONT.grot, color: i === 1 ? p[1] : 'rgba(0,0,0,0)', stroke: i === 1 ? null : p[1], lw: 2, align: 'center', ls: sz * 0.02 });
  },
  square(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const m = Math.min(w, h), e = E.outE(clamp(lt / 0.45));
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(Math.PI / 4 * e + lt * 0.1);
    ctx.fillStyle = p[1]; ctx.fillRect(-m * 0.28, -m * 0.28, m * 0.56, m * 0.56);
    ctx.strokeStyle = p[2]; ctx.lineWidth = m * 0.01; ctx.strokeRect(-m * 0.4, -m * 0.4, m * 0.8, m * 0.8); ctx.restore();
  },
  checker(ctx, x, y, w, h, lt, t, s, p) {
    const e = E.outE(clamp(lt / 0.5)); const sz = Math.min(w, h) * (0.32 - 0.14 * e - 0.02 * lt);
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h); ctx.fillStyle = p[1];
    const cx = x + w / 2, cy = y + h / 2; const nx = Math.ceil(w / sz / 2) + 1, ny = Math.ceil(h / sz / 2) + 1;
    for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) if ((i + j) & 1) ctx.fillRect(cx + i * sz - sz / 2, cy + j * sz - sz / 2, sz, sz);
  },
  cross(ctx, x, y, w, h, lt, t, s, p) {
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, h);
    const m = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, e = E.outE(clamp(lt / 0.4));
    ctx.strokeStyle = p[1]; ctx.lineWidth = Math.max(2, m * 0.006);
    line(ctx, x, cy, x + w, cy); line(ctx, cx, y, cx, y + h);
    for (let i = 1; i <= 3; i++) { circle(ctx, cx, cy, m * 0.13 * i * (0.6 + 0.4 * e)); ctx.stroke(); }
    ctx.fillStyle = p[2]; circle(ctx, cx, cy, m * 0.035); ctx.fill();
  },
};
SHOTS.halo = function (ctx, x, y, w, h, lt, t, s, p) {
  ctx.fillStyle = '#060504'; ctx.fillRect(x, y, w, h);
  const m = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, k = hitEnv('kick', t, .14), e = E.outB(clamp(lt / .3));
  const d = ringDrive(t); const R = m * .3 * e * (1 + d.swell);
  glow(ctx, cx, cy, R * 2.4, COL.ring, .12 + .25 * k);
  segRing(ctx, cx + d.dx * m / 900, cy + d.dy * m / 900, R, .06 + .3 * hitEnv('snare', t, .17, LOUD), null, (3 + 3 * k) * (1 + 1.5 * d.fl), .95, 12, mixHex(COL.ring, COL.hot, d.fl));
  ringLine(ctx, cx, cy, R + m * .05, COL.ring, .25, 1);
  for (const wv of d.waves) { const u = wv.age / wv.life; ringLine(ctx, cx, cy, R + m * .03 + m * .35 * (1 - Math.pow(1 - u, 2)) * (.5 + .7 * wv.p), COL.wave, (.3 + .7 * wv.p) * Math.pow(1 - u, 1.6), 2 + 6 * wv.p); }
  circle(ctx, cx, cy, 3 + 4 * k); ctx.fillStyle = COL.cream; ctx.fill();
};
const SHOT_ORDER = ['dot', 'circle', 'bars', 'char', 'grid', 'stripes', 'rings', 'char', 'wave', 'tri', 'split', 'burst', 'word', 'square', 'checker', 'cross'];

// draw a montage: cuts = [{t, shot, seed, pal}] sorted; rect; flash on cut
function drawShot(ctx, cut, t, x, y, w, h) {
  const lt = Math.max(0, t - cut.t);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  SHOTS[cut.shot](ctx, x, y, w, h, lt, t, cut.seed, cut.pal || PAL[Math.floor(cut.seed * 97) % PAL.length]);
  const f = Math.exp(-lt / 0.07) * (cut.flash == null ? 0.35 : cut.flash);
  if (f > 0.01) { ctx.fillStyle = `rgba(255,240,214,${f})`; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
function montage(ctx, t, cuts, x, y, w, h) {
  let c = null; for (const k of cuts) if (t >= k.t) c = k; else break;
  if (c) drawShot(ctx, c, t, x, y, w, h);
  return c;
}
function mkCuts(beats, startIdx = 0, palOff = 0) {
  return beats.map((k, i) => ({ t: bt(k), beat: k, shot: SHOT_ORDER[(i + startIdx) % SHOT_ORDER.length], seed: R(i + startIdx, 77), pal: PAL[(i + palOff) % PAL.length] }));
}
