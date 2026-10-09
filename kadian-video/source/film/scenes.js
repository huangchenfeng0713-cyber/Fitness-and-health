// ============================================================
//  scenes.js — shared components + scenes part 1
// ============================================================
let LC, LD, LCc, LDc;
function initScenes() {
  LC = mkLayer(); LD = mkLayer(); LCc = LC.getContext('2d'); LDc = LD.getContext('2d');
  HOOK_CUTS = mkHookCuts(); DEF_CLIPS = mkDefClips();
  if (typeof initScenes2 === 'function') initScenes2();
  if (typeof initScenes3 === 'function') initScenes3();
}
// internal sub-parts with transitions. parts: [{b, draw(ctx,t,s,part), tr:{type,n,...}}]
function sub(ctx, t, s, parts) {
  const bb = B(t); let i = 0; for (let k = 0; k < parts.length; k++) if (bb >= parts[k].b) i = k;
  const p = parts[i], prev = parts[i - 1], nx = parts[i + 1];
  const paint = (c, part) => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); part.draw(c, t, s, part); c.restore(); };
  if (nx && nx.tr && nx.tr.pre && bb >= nx.b - nx.tr.pre) {
    noLight(() => paint(LCc, p)); const q = (bb - (nx.b - nx.tr.pre)) / nx.tr.pre; preEffect(ctx, nx.tr, q, LC);
  } else if (prev && p.tr && p.tr.n && bb < p.b + p.tr.n) {
    noLight(() => paint(LCc, prev)); paint(LDc, p); compose(ctx, p.tr, (bb - p.b) / p.tr.n, LC, LD);
  } else p.draw(ctx, t, s, p);
}
function chip(ctx, x, y, text, color, a = 1, o = {}) {
  if (a <= 0.01) return;
  const size = o.size || 24; const w = measure(ctx, text, size, o.weight || 700, o.fam || FONT.sans, o.ls || 1) + size * 1.1; const h = size * 1.7;
  const ax = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  ctx.save(); ctx.globalAlpha *= a;
  const bp = 1 + .035 * pulse(FRAME_T, .1); ctx.translate(ax + w / 2, y); ctx.scale(bp, bp); ctx.translate(-(ax + w / 2), -y);
  rr(ctx, ax, y - h / 2, w, h, h / 2);
  if (o.fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.fillStyle = hexA(color, 0.14); ctx.fill(); ctx.strokeStyle = hexA(color, 0.9); ctx.lineWidth = 1.5; ctx.stroke(); }
  txt(ctx, text, ax + w / 2, y + size * 0.36, { size, weight: o.weight || 700, fam: o.fam || FONT.sans, color: o.fill ? '#060504' : color, align: 'center', ls: o.ls || 1 });
  ctx.restore(); return w;
}
function cite() { /* v2: no on-screen citations */ }
function typeOn(s, t, t0, cps = 40) { const n = Math.floor(clamp((t - t0) * cps, 0, s.length)); return s.slice(0, n); }
function shake(ctx, amt, t, seed = 0) { if (amt <= 0.01) return; ctx.translate((vnoise(t * 30, seed) - 0.5) * amt, (vnoise(t * 30, seed + 9) - 0.5) * amt); }
function zoomAround(ctx, x, y, s) { ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y); }
function checkMark(ctx, x, y, r, color, p) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = [[-0.5, 0.02], [-0.15, 0.36], [0.55, -0.4]]; ctx.beginPath();
  const L1 = 0.5, tot = p * 1.0; ctx.moveTo(x + pts[0][0] * r, y + pts[0][1] * r);
  const q1 = clamp(tot / L1), q2 = clamp((tot - L1) / (1 - L1));
  ctx.lineTo(x + lerp(pts[0][0], pts[1][0], q1) * r, y + lerp(pts[0][1], pts[1][1], q1) * r);
  if (q2 > 0) ctx.lineTo(x + lerp(pts[1][0], pts[2][0], q2) * r, y + lerp(pts[1][1], pts[2][1], q2) * r);
  ctx.stroke(); ctx.restore();
}
function chapterCard(ctx, t, k0, num, title, en, color) {
  bgBase(ctx, t, { tint: color, glow: 0.12, gx: 0.25 });
  const age = t - bt(k0), cx = 400, cy = 540;
  const grow = E.outB(clamp((age + 0.03) / 0.22));
  const h = haloRing(ctx, t, cx, cy, 168, { grow, since: bt(k0) - 0.06, halo: .08, gain: .9, nt: 16 });
  // the downbeat itself throws one big shockwave out of the ring
  if (age >= 0 && age < .8) { const u = age / .8; ringLine(LLc, cx, cy, 190 + 520 * (1 - Math.pow(1 - u, 2)), COL.wave, Math.pow(1 - u, 1.6), 3 + 12 * (1 - u)); }
  const sn = 1.3 - .3 * E.outB(clamp(age / .22));
  ctx.save(); zoomAround(ctx, cx, cy, sn); ctx.globalAlpha = clamp(age / .05 + .001);
  txt(ctx, num, cx, cy + 40, { size: 112, weight: 700, fam: FONT.mono, color: COL.cream, align: 'center', ls: -4 }); ctx.restore();
  txt(LLc, num, cx, cy + 40, { size: 112, weight: 700, fam: FONT.mono, color: color, align: 'center', ls: -4, alpha: .35 * clamp(age / .05) });
  const tx = 690;
  ctext(ctx, title, tx, 572, { size: 124, weight: 900 }, i => { const q = A(t, bt(k0) + 0.08 + 0.05 * i, 0.45, E.outE); return { a: q, dy: 44 * (1 - q) }; });
  txt(ctx, typeOn(en, t, bt(k0) + 0.3, 45), tx + 4, 640, { size: 24, weight: 400, fam: FONT.mono, color: color, ls: 7, alpha: .9 });
  ctx.fillStyle = COL.faint; ctx.fillRect(tx + 4, 676, 1040 * A(t, bt(k0) + 0.15, 0.9, E.outE), 1.5);
  if (age >= 0) flashCream(.22 * Math.exp(-age / .07));
}

// ------------------------------------------------------------ HOOK (beats 0-32)
let HOOK_CUTS; const mkHookCuts = (() => {
  const beats = []; for (let k = 16; k < 20; k++) beats.push(k); beats.push(20, 22);
  const order = ['halo', 'circle', 'grid', 'char', 'rings', 'wave'];
  return beats.map((k, i) => ({ t: bt(k), beat: k, shot: order[i % order.length], seed: R(i, 77), pal: PAL[(i * 3) % PAL.length], flash: .3 }));
});
SCN.hook = {
  hud: false, ruler: false,
  cam: (t) => ({ z: B(t) < 16 ? barPush(t, .028) : 1, dx: 0, dy: 0 }),
  draw(ctx, t, s) {
    const b = B(t);
    if (b < 16) return hookHalo(ctx, t, b);
    if (b < 24) return hookMontage(ctx, t, b);
    if (b < 26.9) return hookKadian(ctx, t, b);
    return hookAlign(ctx, t, b);
  }
};
// cold open: one gold ring played by the drums (after the next-beat v6 opening)
function hookHalo(ctx, t, b) {
  const closer = b >= 8;
  bgBase(ctx, t, { tint: COL.ring, glow: closer ? .07 : .04 });
  const cx = W / 2, cy = 520;
  if (b < 0) {   // frame 0: the ring waits, thin, before the first beat
    ringLine(ctx, cx, cy, 250, COL.ring, .7, 2); circle(ctx, cx, cy, 4); ctx.fillStyle = COL.cream; ctx.fill(); return;
  }
  const h = haloRing(ctx, t, cx, cy - 40 * (1 - A(t, bt(6.5), TL.T * 1.5, E.ioC)), closer ? 300 : 250, { inner: closer, halo: closer ? .09 : .03, nt: 16 });
  slash(t, h.y, { double: closer });
  // every beat also breathes the outer hairline, so the grid is felt between drum hits
  const p = pulse(t, .18); ringLine(ctx, h.x, h.y, h.R + 60, COL.ring, .08 + .22 * p, 1);
  const age0 = t - bt(0); if (age0 >= 0) flashCream(.5 * Math.exp(-age0 / .075));
  if (closer) { const a8 = t - bt(8); if (a8 >= 0) flashCream(.18 * Math.exp(-a8 / .07)); }
  // the hook: the film's question lands on the very first beat, gone before the ring's second phrase
  const a0 = t - bt(0), hk = A(t, bt(0) - .02, .05) * (1 - A(t, bt(6.5), TL.T, E.inQ));
  if (hk > 0) ctext(ctx, '卡点，为什么这么爽？', W / 2, 905, { size: 78, weight: 900, align: 'center', ls: 6, color: COL.hot }, () => ({ a: hk, s: 1.25 - .25 * E.outB(clamp(a0 / .22)) + .02 * pulse(t, .14) }));
}
function hookMontage(ctx, t, b) {
  bgBase(ctx, t, { tint: COL.ring, glow: 0.07, gx: 0.33 });
  const k = A(t, bt(16), 0.7, E.ioE);
  const pw = 372, ph = 662, px = 640 - pw / 2, py = 520 - ph / 2;
  const x = lerp(0, px, k), y = lerp(0, py, k), w = lerp(W, pw, k), h = lerp(H, ph, k), r = lerp(0, 34, k);
  if (k > 0) {
    ctx.save(); ctx.globalAlpha = k;
    glow(ctx, x + w / 2, y + h / 2, 520, COL.ring, 0.10);
    rr(ctx, x - 12, y - 12, w + 24, h + 24, r + 10); ctx.fillStyle = '#16130e'; ctx.fill();
    ctx.strokeStyle = 'rgba(225,182,105,0.35)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  montage(ctx, t, HOOK_CUTS, x, y, w, h);
  ctx.restore();
  if (k > 0) {
    ctx.save(); ctx.globalAlpha = k;
    const g = ctx.createLinearGradient(0, y + h * 0.65, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    rr(ctx, x, y, w, h, r); ctx.save(); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x, y + h * 0.65, w, h * 0.35); ctx.restore();
    ctx.fillStyle = 'rgba(243,238,228,0.85)'; ctx.fillRect(x + 22, y + h - 70, 120, 10); ctx.fillStyle = 'rgba(243,238,228,0.45)'; ctx.fillRect(x + 22, y + h - 50, 190, 8);
    for (let i = 0; i < 3; i++) { circle(ctx, x + w - 34, y + h - 210 + i * 62, 17); ctx.fillStyle = 'rgba(243,238,228,0.75)'; ctx.fill(); }
    ctx.fillStyle = 'rgba(243,238,228,0.25)'; ctx.fillRect(x + 16, y + h - 22, w - 32, 3);
    ctx.fillStyle = COL.cream; ctx.fillRect(x + 16, y + h - 22, (w - 32) * clamp((b - 16) / 8), 3);
    ctx.restore();
    hookDiagram(ctx, t, b, k);
  }
}
function hookDiagram(ctx, t, b, k) {
  const x0 = 960, x1 = 1800, xp = 1180, ppb = 104, y1 = 400, y2 = 600;
  const a = A(t, bt(16.3), 0.6, E.outC) * (1 - A(t, bt(23.6), 0.3));
  if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha = a;
  txt(ctx, '音乐 · 节拍', x0, y1 - 62, { size: 34, weight: 800, color: COL.aud, ls: 2 });
  txt(ctx, '画面 · 切换', x0, y2 - 62, { size: 34, weight: 800, color: COL.vid, ls: 2 });
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y1 - 50, x1 - x0, y2 - y1 + 100); ctx.clip();
  ctx.fillStyle = COL.faint; ctx.fillRect(x0, y1, x1 - x0, 1); ctx.fillRect(x0, y2, x1 - x0, 1);
  for (let kk = Math.floor(b - 3); kk < b + 7; kk++) {
    const x = xp + (kk - b) * ppb; const past = kk <= b;
    const hp = past ? Math.exp(-(t - bt(kk)) / 0.25) : 0;
    ctx.fillStyle = hexA(COL.aud, past ? 0.9 : 0.4); ctx.fillRect(x - 3, y1 - 26 - 12 * hp, 6, 52 + 24 * hp);
    const cutHere = HOOK_CUTS.some(c => c.beat === kk);
    if (cutHere) { ctx.fillStyle = hexA(COL.vid, past ? 1 : 0.45); rr(ctx, x - 12, y2 - 26 - 10 * hp, 24, 52 + 20 * hp, 5); ctx.fill(); }
    if (cutHere && hp > 0.02 && x > x0 && x < x1) { LLc.save(); LLc.globalAlpha = a * hp; LLc.fillStyle = COL.cream; LLc.fillRect(x - 1.5, y1, 3, y2 - y1); LLc.restore(); glow(ctx, x, (y1 + y2) / 2, 110, COL.cream, hp * 0.4); }
  }
  ctx.restore();
  ctx.fillStyle = COL.cream; ctx.fillRect(xp - 1, y1 - 50, 2, y2 - y1 + 100);
  txt(ctx, 'NOW', xp, y1 - 104, { size: 16, weight: 700, fam: FONT.mono, color: COL.cream, align: 'center', ls: 3 });
  const ts = wt('A1', '都'); const e = A(t, ts - 0.05, 0.5, E.outC);
  if (e > 0) {
    ctx.globalAlpha = a * e;
    txt(ctx, '每一次切换', x0, y2 + 150, { size: 56, weight: 900, color: COL.vid });
    const w1 = measure(ctx, '每一次切换', 56, 900);
    txt(ctx, ' = ', x0 + w1, y2 + 150, { size: 56, weight: 400, fam: FONT.mono, color: COL.dim });
    txt(ctx, '一个节拍', x0 + w1 + measure(ctx, ' = ', 56, 400, FONT.mono), y2 + 150, { size: 56, weight: 900, color: COL.aud });
  }
  ctx.restore();
}
function hookKadian(ctx, t, b) {
  bgBase(ctx, t, { tint: COL.ring, glow: 0.05 });
  const tk = bt(25), cx = W / 2, cy = 500;
  if (t < tk) {   // a held breath: the point charges, two faint rings close in
    const pre = A(t, bt(24), TL.T, E.inC);
    circle(ctx, cx, cy, 4 + 5 * pre); ctx.fillStyle = COL.cream; ctx.fill(); glow(ctx, cx, cy, 60 + 160 * pre, COL.ring, .3 + .5 * pre);
    ringLine(ctx, cx, cy, lerp(420, 40, pre), COL.ring, .15 + .5 * pre, 1.5);
    const ta = A(t, wt('A2', '这') - 0.05, 0.25, E.outC);
    txt(ctx, '这 叫', cx, cy - 120, { size: 44, weight: 700, color: COL.dim, align: 'center', ls: 12, alpha: ta });
    return;
  }
  const age = t - tk;
  const grow = E.outB(clamp(age / .18));
  haloRing(ctx, t, cx, cy, 300, { grow, since: tk - .05, halo: .07, inner: true, dot: false });
  burst(cx, cy, age, .9, 2.0, 120, 3);
  if (age < .9) { const u = age / .9; ringLine(LLc, cx, cy, 300 + 640 * (1 - Math.pow(1 - u, 2)), COL.wave, Math.pow(1 - u, 1.5), 4 + 14 * (1 - u)); }
  ctext(ctx, '卡点', cx, cy + 92, { size: 250, weight: 900, align: 'center', ls: 12, color: COL.hot }, i => { const q = A(t, tk + i * 0.05, 0.35, E.outE); return { a: q, s: 1.4 - 0.4 * E.outB(q) }; });
  txt(LLc, '卡点', cx, cy + 92, { size: 250, weight: 900, align: 'center', ls: 12, color: COL.ring, alpha: .25 * Math.exp(-age / .5) });
  txt(ctx, typeOn('BEAT-SYNC EDITING', t, tk + 0.2, 40), cx, cy + 420, { size: 24, weight: 400, fam: FONT.mono, color: COL.ring, align: 'center', ls: 8 });
  flashCream(.55 * Math.exp(-age / .075));
}
function hookAlign(ctx, t, b) {
  bgBase(ctx, t, { tint: COL.ring, glow: 0.06 });
  const m = A(t, bt(27), 0.7, E.ioE);
  // the 卡点 halo pulls back to the top as a small emblem
  const hy = lerp(500, 250, m), hs = lerp(1, .38, m);
  ctx.save(); zoomAround(ctx, W / 2, hy, 1); 
  const h = haloRing(ctx, t, W / 2, hy, 300 * hs, { since: bt(25) - .05, inner: m < .5, halo: .04, nt: 16, waves: m < .3, dot: false });
  ctext(ctx, '卡点', W / 2, hy + 92 * hs, { size: 250 * hs, weight: 900, align: 'center', ls: 12 * hs, color: COL.hot }, () => ({}));
  ctx.restore();
  // rows: the music's beats (teal) and the picture's cuts (gold) snap into line on "对齐"
  const n = 9, sp = 150, xs = W / 2 - (n - 1) * sp / 2, yA = 560, yV = 700;
  const tA = wt('A3', '对齐');
  const rowsIn = A(t, bt(27.5), 0.8, E.outC);
  txt(ctx, '音乐', xs - 90, yA + 10, { size: 30, weight: 800, color: COL.aud, align: 'right', alpha: rowsIn });
  txt(ctx, '画面', xs - 90, yV + 10, { size: 30, weight: 800, color: COL.vid, align: 'right', alpha: rowsIn });
  for (let i = 0; i < n; i++) {
    const ai = A(t, bt(27.5) + i * 0.035, 0.5, E.outC); if (ai <= 0) continue;
    const xa = xs + i * sp; ctx.fillStyle = hexA(COL.aud, ai); ctx.fillRect(xa - 3, yA - 30, 6, 60);
    const off = (R(i, 5) - 0.5) * 120; const q = A(t, tA + i * 0.03, 0.7, E.outEl);
    const xv = xa + off * (1 - q);
    ctx.fillStyle = hexA(COL.vid, ai); rr(ctx, xv - 10, yV - 30, 20, 60, 4); ctx.fill();
    const t1 = tA + i * 0.03 + 0.12, hit = t > t1 ? Math.exp(-(t - t1) / 0.25) : 0;
    if (q > 0.9) { ctx.fillStyle = hexA(COL.cream, .25 + .5 * hit); ctx.fillRect(xa - 1, yA + 30, 2, yV - yA - 60); }
    if (hit > 0.02) { LLc.save(); LLc.globalAlpha = hit; LLc.fillStyle = COL.cream; LLc.fillRect(xa - 1.5, yA + 30, 3, yV - yA - 60); LLc.restore(); }
  }
  // countdown into the drop: four marks, one per beat of the last bar
  for (let j = 0; j < 4; j++) {
    const tj = bt(28 + j); if (t < tj) { circle(ctx, W / 2 - 96 + j * 64, 860, 6); ctx.fillStyle = hexA(COL.ring, .25); ctx.fill(); continue; }
    const pop = Math.exp(-(t - tj) / .25); circle(ctx, W / 2 - 96 + j * 64, 860, 7 + 7 * pop); ctx.fillStyle = pop > .3 ? COL.cream : COL.ring; ctx.fill();
    if (pop > .05) glow(ctx, W / 2 - 96 + j * 64, 860, 50, COL.ring, pop * .6);
  }
  const tq = wt('A3', '爽'); const eq = A(t, tq - 0.2, 0.35, E.outB);
  if (eq > 0) txt(ctx, '？', W / 2 + 140, hy + 40, { size: 120, weight: 900, color: COL.gold, align: 'left', alpha: clamp(eq) });
}

// ------------------------------------------------------------ TITLE (32-40) — the drop: one bright frame, the ring blooms out of a point
SCN.title = {
  hud: false, ruler: false,
  cam: (t) => { const [dx, dy] = shakeOff(t, bt(32), 14, .09); return { z: barPush(t, .02), dx, dy }; },
  draw(ctx, t, s) {
    bgBase(ctx, t, { tint: COL.ring, glow: 0.08 });
    const age = t - bt(32), cx = W / 2, cy = 415;
    const grow = E.outB(clamp(age / .16));
    const h = haloRing(ctx, t, cx, cy, 255, { grow, since: bt(32) - .05, halo: .07, inner: B(t) >= 36, nt: 24, dot: false });
    slash(t, h.y, { since: bt(32) - .05, double: true });
    burst(cx, cy, age, 1, 2.2, 160, 9);
    const sc = 1.2 - .2 * E.outB(clamp(age / .22)) + .015 * h.k;
    ctext(ctx, '卡点', cx, cy + 62, { size: 170, weight: 900, align: 'center', ls: 16, color: COL.hot }, () => ({ s: sc, a: clamp(age / .02 + .01) }));
    txt(ctx, 'WHY  BEAT-SYNC  FEELS  GOOD', cx, 772, { size: 20, weight: 500, fam: FONT.grot, color: COL.ring, align: 'center', ls: 6, alpha: clamp(age / .3) });
    const tq = bt(34), qa = t - tq;
    if (qa >= 0) {
      const qs = 1.3 - .3 * E.outB(clamp(qa / .22));
      ctext(ctx, '为什么这么爽？', cx, 878, { size: 88, weight: 900, align: 'center', color: COL.cream, ls: 6 }, () => ({ s: qs }));
    }
    const e3 = A(t, bt(36), 0.6, E.outC);
    flashCream(.82 * Math.exp(-age / .075));
  }
};
TR.title = { type: 'flash', n: 0.3, amt: 0, pre: 1, pre_type: 'collapse', fx: W / 2, fy: 500 };


// ------------------------------------------------------------ DEFINE (40-64)
let DEF_CLIPS; const mkDefClips = (() => { const pat = [2, 1, 1, 2, 2, 1, 1, 2, 1, 1]; const out = []; let k = 30, i = 0; while (k < 90) { const L = pat[i % pat.length]; out.push({ k0: k, k1: k + L, cut: { t: bt(k), shot: SHOT_ORDER[(i * 5 + 3) % 16], seed: R(i, 31), pal: PAL[(i * 3) % 8], flash: 0.2 } }); k += L; i++; } return out; });
SCN.define = {
  hud: true, chap: '定义', push: .008,
  draw(ctx, t, s) {
    sub(ctx, t, s, [
      { b: 40, draw: defineTracks },
      { b: 56, draw: defineSlots, tr: { type: 'zoom', n: 0.8 } },
    ]);
  }
};
TR.define = { type: 'slideUp', n: 0.9 };
function defineTracks(ctx, t) {
  bgBase(ctx, t, { tint: COL.aud, glow: 0.08 });
  const b = B(t), x0 = 360, x1 = 1760, xp = 1060, ppb = 175, yA = 440, yV = 680, hA = 150, hV = 128;
  const inA = A(t, bt(40), 0.7, E.outE), inV = A(t, bt(40.5), 0.7, E.outE);
  // heading
  ctx.save(); ctx.globalAlpha = A(t, bt(40.2), 0.6, E.outC);
  txt(ctx, '卡点', 160, 248, { size: 64, weight: 900 });
  const hw = measure(ctx, '卡点', 64, 900);
  txt(ctx, '把', 160 + hw + 30, 244, { size: 34, weight: 500, color: COL.dim });
  let xx = 160 + hw + 30 + measure(ctx, '把', 34, 500) + 10;
  txt(ctx, '画面事件', xx, 244, { size: 34, weight: 800, color: COL.vid }); xx += measure(ctx, '画面事件', 34, 800) + 10;
  txt(ctx, '对齐到', xx, 244, { size: 34, weight: 500, color: COL.dim }); xx += measure(ctx, '对齐到', 34, 500) + 10;
  txt(ctx, '音乐事件', xx, 244, { size: 34, weight: 800, color: COL.aud });
  ctx.restore();
  // BPM callout
  const eB = A(t, bt(47.6), 0.6, E.outE);
  if (eB > 0) {
    ctx.save(); ctx.globalAlpha = eB;
    txt(ctx, '每分钟约 113 拍', x1, 250, { size: 44, weight: 800, align: 'right', color: COL.ink });
    txt(ctx, '每拍约 0.53 秒', x1, 292, { size: 26, weight: 500, align: 'right', color: COL.dim, ls: 2 });
    ctx.restore();
  }
  // labels
  txt(ctx, '音乐', 160, yA + 6, { size: 40, weight: 900, color: COL.aud, alpha: inA });
  txt(ctx, 'AUDIO', 160, yA + 40, { size: 17, weight: 400, fam: FONT.mono, color: COL.dim, alpha: inA, ls: 4 });
  txt(ctx, '画面', 160, yV + 6, { size: 40, weight: 900, color: COL.vid, alpha: inV });
  txt(ctx, 'VIDEO', 160, yV + 40, { size: 17, weight: 400, fam: FONT.mono, color: COL.dim, alpha: inV, ls: 4 });
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 300, x1 - x0, 520); ctx.clip();
  // waveform
  ctx.save(); ctx.globalAlpha = inA;
  for (let x = x0; x < x1; x += 4) {
    const tau = t + (x - xp) / ppb * TL.T; const v = waveAt(tau); const hh = (8 + v * hA * 0.5);
    ctx.fillStyle = x <= xp ? hexA(COL.aud, 0.85) : hexA(COL.aud, 0.28); ctx.fillRect(x, yA - hh, 2.5, hh * 2);
  }
  ctx.restore();
  // clips
  ctx.save(); ctx.globalAlpha = inV;
  for (const c of DEF_CLIPS) {
    const xa = xp + (c.k0 - b) * ppb + 3, xb = xp + (c.k1 - b) * ppb - 3; if (xb < x0 || xa > x1) continue;
    ctx.save(); rr(ctx, xa, yV - hV / 2, xb - xa, hV, 8); ctx.clip();
    drawShot(ctx, c.cut, Math.max(t, c.cut.t), xa, yV - hV / 2, xb - xa, hV);
    if (xa > xp) { ctx.fillStyle = 'rgba(6,5,4,0.55)'; ctx.fillRect(xa, yV - hV / 2, xb - xa, hV); }
    ctx.restore();
  }
  ctx.restore();
  // beat lines + sync flashes
  for (let k = Math.floor(b - 5); k < b + 5; k++) {
    const x = xp + (k - b) * ppb; const down = k % 4 === 0;
    ctx.fillStyle = hexA(COL.aud, down ? 0.4 : 0.18); ctx.fillRect(x - 0.75, 330, 1.5, 460);
    if (down) txt(ctx, String(k / 4 + 1), x + 6, 340, { size: 15, weight: 400, fam: FONT.mono, color: COL.dim });
    const hp = k <= b ? Math.exp(-(t - bt(k)) / 0.22) : 0;
    if (hp > 0.02) { ctx.fillStyle = `rgba(255,240,214,${hp})`; ctx.fillRect(x - 2, yA - 60, 4, yV - yA + 120); glow(ctx, x, yA, 90, COL.aud, hp * 0.7); glow(ctx, x, yV, 90, COL.vid, hp * 0.7); }
  }
  ctx.restore();
  // playhead
  ctx.fillStyle = COL.ink; ctx.fillRect(xp - 1, 316, 2, 500); txt(ctx, 'NOW', xp, 306, { size: 16, weight: 700, fam: FONT.mono, align: 'center', ls: 3 });
  // event chips (attached to world beats)
  const chipsV = [['切镜', '切镜'], ['动作', '动作'], ['闪光', '闪光']];
  chipsV.forEach(([w, label], i) => {
    const tw = wt('B1', w); const kk = Math.round(B(tw)) + 1; const x = xp + (kk - b) * ppb; const a = A(t, tw - 0.05, 0.35, E.outB);
    if (a > 0 && x > x0 - 60 && x < x1 + 60) { chip(ctx, x, yV + hV / 2 + 40, label, COL.vid, clamp(a), { align: 'center', size: 22 }); ctx.fillStyle = hexA(COL.vid, 0.6 * clamp(a)); ctx.fillRect(x - 0.75, yV + hV / 2 + 4, 1.5, 18); }
  });
  [['鼓点', '鼓点', 0], ['重拍', '重拍', 1]].forEach(([w, label, dn]) => {
    const tw = wt('B1', w); let kk = Math.round(B(tw)) + 1; if (dn) kk = Math.ceil((B(tw) + 1) / 4) * 4;
    const x = xp + (kk - b) * ppb; const a = A(t, tw - 0.05, 0.35, E.outB);
    if (a > 0 && x > x0 - 60 && x < x1 + 60) { chip(ctx, x, yA - hA / 2 - 44, label, COL.aud, clamp(a), { align: 'center', size: 22 }); }
  });
}
// ------------------------------------------------------------ the concept ring: four quadrants = the four reasons
const QUAD = { cx: 960, cy: 600, R: 220 };
const QLABEL = ['预测被兑现', '视听合为一', '身体跟上拍', '张力被释放'];
const QCOL = () => [COL.gold, COL.aud, COL.mint, COL.vid];
function quadMid(i, r) { const a = -Math.PI / 2 + (i + .5) * Math.PI / 2; return [QUAD.cx + r * Math.cos(a), QUAD.cy + r * Math.sin(a)]; }
function conceptRing(ctx, t, o) {
  const { cx, cy, R } = QUAD; const cols = QCOL();
  const base = A(t, bt(o.appear[0]) - .1, .4, E.outC);
  ringLine(ctx, cx, cy, R + 34, COL.ring, .18 * base, 1.2);
  ctx.save(); ctx.globalAlpha = base; ticksRing(ctx, cx, cy, R + 44, 32, t, 2, 9, .16); ctx.restore();
  for (let i = 0; i < 4; i++) {
    const kA = o.appear[i]; const qa = A(t, bt(kA), .35, E.outB); if (qa <= 0) continue;
    const a0 = -Math.PI / 2 + i * Math.PI / 2 + .07, a1 = a0 + Math.PI / 2 - .14;
    const kF = o.fill ? o.fill[i] : null; const fq = kF != null ? A(t, bt(kF), .3, E.outE) : 0;
    const pa = pulseAt(t, kA, .22) * (o.fill ? .4 : 1), pf = kF != null ? pulseAt(t, kF, .25) : 0;
    const col = fq > 0 ? cols[i] : COL.ring;
    if (fq > 0) { ctx.save(); ctx.globalAlpha = .14 * fq + .22 * pf; ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R - 10, a0, a1); ctx.closePath(); ctx.fill(); ctx.restore(); }
    arc(ctx, cx, cy, R * (.9 + .1 * clamp(qa)), a0, a1, col, clamp(qa) * (.55 + .45 * fq), 8 + 6 * fq + 8 * (pa + pf));
    if (pa + pf > .02) arc(LLc, cx, cy, R, a0, a1, fq > 0 ? cols[i] : COL.cream, .7 * Math.min(1, pa + pf), 16 + 10 * Math.min(1, pa + pf));
    for (const [kk, amp] of [[kA, o.fill ? .3 : .7], [kF, 1]]) {
      if (kk == null) continue; const age = t - bt(kk); if (age < 0 || age > .6) continue; const u = age / .6;
      arc(LLc, cx, cy, R + 20 + 220 * (1 - Math.pow(1 - u, 2)), a0, a1, COL.wave, amp * Math.pow(1 - u, 1.6), 3 + 10 * (1 - u));
    }
    const [nx, ny] = quadMid(i, R + 92);
    txt(ctx, '0' + (i + 1), nx, ny + 14, { size: 36, weight: 700, fam: FONT.mono, color: fq > 0 ? cols[i] : COL.ring, align: 'center', alpha: clamp(qa) });
    if (o.labels && fq > 0) {
      const [lx, ly] = quadMid(i, R + 170); const right = lx > cx;
      const ls = 1.25 - .25 * E.outB(clamp((t - bt(kF)) / .22));
      ctx.save(); ctx.globalAlpha = clamp(fq); zoomAround(ctx, lx, ly, ls);
      txt(ctx, QLABEL[i], lx + (right ? -10 : 10), ly + 18, { size: 54, weight: 900, color: COL.ink, align: right ? 'left' : 'right' });
      ctx.restore();
    }
  }
}
function defineSlots(ctx, t) {
  bgBase(ctx, t, { tint: COL.ring, glow: 0.08 });
  ctext(ctx, '对齐，为什么会爽？', W / 2, 200, { size: 80, weight: 900, align: 'center' }, i => { const q = A(t, bt(56) + 0.03 * i, 0.45, E.outE); return { a: q, dy: 26 * (1 - q) }; });
  const t4 = wt('B2', '四');
  txt(ctx, '至少有 4 个原因', W / 2, 270, { size: 34, weight: 500, color: COL.ring, align: 'center', alpha: A(t, t4 - 0.1, 0.4), ls: 4 });
  conceptRing(ctx, t, { appear: [57, 58, 59, 60] });
  const p = pulse(t, .25);
  inkCenter(ctx, '？', QUAD.cx, QUAD.cy, { size: 140, weight: 900, color: COL.cream, alpha: A(t, bt(57), .4) * (.35 + .4 * p) });
}

// ------------------------------------------------------------ R1 PREDICTION (64-108)
SCN.r1 = {
  hud: true, chap: '01 预测', push: .008,
  draw(ctx, t, s) {
    sub(ctx, t, s, [
      { b: s.b0, draw: (c, t) => chapterCard(c, t, s.b0, '01', '预测被兑现', 'PREDICTION  ·  REWARD', COL.gold) },
      { b: s.b0 + 4, draw: r1Entrain, tr: { type: 'wipe', n: 0.8, color: COL.gold } },
      { b: s.b0 + 24, draw: r1Dopamine, tr: { type: 'shutter', n: 1 } },
      { b: s.b0 + 36, draw: r1AB, tr: { type: 'zoom', n: 0.8 } },
    ]);
  }
};
TR.r1 = { type: 'flash', n: 0.5, amt: 0.3, pre: 1, pre_type: 'zoomInto', fx: quadMid(0, QUAD.R)[0], fy: quadMid(0, QUAD.R)[1], z: 6 };
function r1Entrain(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.gold, glow: 0.07, gx: 0.45 });
  const b = B(t), x0 = 200, x1 = 1760, xp = 900, ppb = 205, yM = 330, yN = 560, yV = 770;
  const tLock = wt('C2', '同步'), tPred = wt('C2', '预判'), tC3 = lineT('C3')[0];
  const lockAt = tau => E.ss(clamp((tau - (tLock - 1.0)) / 1.0));
  // labels
  const la = A(t, bt(s.b0 + 4), 0.6, E.outC);
  txt(ctx, '音乐节拍', 72 + 0, yM + 10, { size: 30, weight: 800, color: COL.aud, alpha: la });
  txt(ctx, '神经活动', 72, yN + 10, { size: 30, weight: 800, color: COL.gold, alpha: la });
  const vIn = A(t, tC3 - 0.2, 0.6, E.outC);
  txt(ctx, '画面事件', 72, yV + 10, { size: 30, weight: 800, color: COL.vid, alpha: vIn });
  txt(ctx, 'BRAIN OSCILLATION', 72, yN + 42, { size: 15, weight: 400, fam: FONT.mono, color: COL.dim, alpha: la, ls: 3 });
  ctx.save(); ctx.beginPath(); ctx.rect(340, 220, x1 - 340, 680); ctx.clip();
  ctx.fillStyle = COL.faint; ctx.fillRect(x0, yM + 50, x1 - x0, 1); ctx.fillRect(x0, yN, x1 - x0, 1); if (vIn > 0) ctx.fillRect(x0, yV + 40, (x1 - x0) * vIn, 1);
  // beat spikes (past only)
  for (let k = Math.floor(b - 5); k <= Math.floor(b); k++) {
    const x = xp + (k - b) * ppb; const hp = Math.exp(-(t - bt(k)) / 0.2); const h = 70 + 30 * envAt(bt(k) + 0.02, 4);
    ctx.fillStyle = hexA(COL.aud, 0.85); ctx.fillRect(x - 3, yM + 50 - h - 20 * hp, 6, h + 20 * hp); glow(ctx, x, yM + 20, 80, COL.aud, hp * 0.7);
  }
  // oscillation (past solid)
  const amp = 72;
  const phaseAt = tau => { const l = lockAt(tau); return TAU * B(tau) + (1 - l) * (2.1 * Math.sin(TAU * 0.41 * tau) + 3.4 * (vnoise(tau * 1.3, 4) - 0.5)); };
  ctx.beginPath();
  for (let x = 340; x <= xp; x += 3) { const tau = t + (x - xp) / ppb * TL.T; const y = yN - amp * Math.cos(phaseAt(tau)); x === 340 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.strokeStyle = COL.gold; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  // prediction (future dashed) after lock
  const pa = A(t, tLock, 0.6, E.outC);
  if (pa > 0) {
    ctx.save(); ctx.setLineDash([10, 10]); ctx.globalAlpha = pa * 0.6; ctx.beginPath();
    for (let x = xp; x <= x1; x += 3) { const tau = t + (x - xp) / ppb * TL.T; const y = yN - amp * Math.cos(TAU * B(tau)); x === xp ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
  // predicted next-beat markers
  const pm = A(t, tPred - 0.1, 0.5, E.outC);
  let hits = 0;
  if (pm > 0) {
    for (let k = Math.floor(b) - 3; k <= Math.floor(b) + 3; k++) {
      const x = xp + (k - b) * ppb; if (x < x0 || x > x1) continue;
      const future = k > b; const nextOne = k === Math.floor(b) + 1;
      if (future) {
        ctx.save(); ctx.globalAlpha = pm * (nextOne ? 1 : 0.4); ctx.setLineDash([6, 7]); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.5;
        circle(ctx, x, yM + 10, 34); ctx.stroke(); ctx.restore();
        if (nextOne) {
          const fr = b - Math.floor(b); ctx.save(); ctx.globalAlpha = pm; ctx.strokeStyle = COL.gold; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, yM + 10, 44, -Math.PI / 2, -Math.PI / 2 + TAU * fr); ctx.stroke(); ctx.restore();
          txt(ctx, '预测：下一拍', x, yM - 52, { size: 22, weight: 700, color: COL.gold, align: 'center', alpha: pm });
        }
      } else if (t >= tPred) {
        const hp = Math.exp(-(t - bt(k)) / 0.3);
        ctx.save(); ctx.globalAlpha = pm; circle(ctx, x, yM + 10, 34); ctx.fillStyle = hexA(COL.gold, 0.18 + 0.5 * hp); ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.5; ctx.stroke();
        checkMark(ctx, x, yM + 10, 22, COL.ink, clamp((t - bt(k)) / 0.18)); ctx.restore();
      }
    }
  }
  // visual events row (C3)
  if (vIn > 0) {
    for (let k = Math.floor(b - 5); k <= Math.floor(b); k++) {
      if (bt(k) < tC3 - 0.3) continue;
      const x = xp + (k - b) * ppb; const hp = Math.exp(-(t - bt(k)) / 0.25); hits++;
      ctx.save(); ctx.globalAlpha = vIn; rr(ctx, x - 26, yV - 30 - 8 * hp, 52, 70 + 16 * hp, 8); ctx.fillStyle = COL.vid; ctx.fill(); ctx.restore();
      if (hp > 0.02) { ctx.fillStyle = `rgba(255,240,214,${hp * 0.9})`; ctx.fillRect(x - 2, yM + 50, 4, yV - yM - 80); glow(ctx, x, yV, 120, COL.vid, hp); }
    }
    // ghost future visual slot
    const xn = xp + (Math.floor(b) + 1 - b) * ppb; ctx.save(); ctx.globalAlpha = vIn * 0.5; ctx.setLineDash([6, 7]); ctx.strokeStyle = COL.vid; ctx.lineWidth = 2; rr(ctx, xn - 26, yV - 30, 52, 70, 8); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  // playhead
  ctx.fillStyle = COL.ink; ctx.fillRect(xp - 1, 230, 2, 640); txt(ctx, 'NOW', xp, 220, { size: 16, weight: 700, fam: FONT.mono, align: 'center', ls: 3 });
  txt(ctx, '过去', xp - 24, 880, { size: 18, weight: 500, color: COL.dim, align: 'right' }); txt(ctx, '未来 →', xp + 24, 880, { size: 18, weight: 500, color: COL.dim });
  // status chip
  const locked = t >= tLock;
  const st = t >= tC3 ? '预测 → 兑现 ✓' : locked ? '已与节拍同步 ✓' : '尚未同步…';
  chip(ctx, x1, 168, st, locked ? COL.gold : '#a59a86', A(t, bt(s.b0 + 4.5), 0.4), { align: 'right', size: 24 });
  cite(ctx, t, 'Nozaradan et al., 2011 · J. Neurosci.', tLock);
}
function r1Dopamine(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.gold, glow: 0.10, gx: 0.35 });
  const k0 = s.b0 + 24, X0 = 200, X1 = 1060, Y0 = 800, Y1 = 290;
  const tDA = wt('C4', '多巴胺'), tGuess = wt('C4', '猜中'), tAnt = wt('C4', '期待');
  const draw = A(t, bt(k0), TL.T * 5, E.ioC);
  // axes
  ctx.fillStyle = COL.faint; ctx.fillRect(X0, Y0, X1 - X0, 2); ctx.fillRect(X0, Y1 - 20, 2, Y0 - Y1 + 20);
  txt(ctx, '时间 →', X1, Y0 + 40, { size: 20, weight: 500, color: COL.dim, align: 'right' });
  txt(ctx, '兴奋', X0 - 16, Y1, { size: 20, weight: 500, color: COL.dim, align: 'right' });
  const peakX = 900;
  const curve = x => { const u = (x - X0) / (peakX - X0); if (x <= peakX) return Y0 - 40 - (Y0 - Y1 - 40) * Math.pow(clamp(u), 2.3); const v = (x - peakX) / (X1 - peakX); return Y1 + (Y0 - Y1 - 80) * E.outC(clamp(v)); };
  // zones
  const za = A(t, tAnt, 0.6, E.outC);
  ctx.fillStyle = hexA(COL.gold, 0.08 * za); ctx.fillRect(560, Y1 - 20, peakX - 30 - 560, Y0 - Y1 + 20);
  ctx.fillStyle = hexA(COL.gold, 0.22 * za); ctx.fillRect(peakX - 24, Y1 - 20, 48, Y0 - Y1 + 20);
  txt(ctx, '期待阶段', 580, Y1 + 10, { size: 26, weight: 800, color: COL.gold, alpha: za });
  txt(ctx, '尾状核 · caudate', 580, Y1 + 44, { size: 17, weight: 400, fam: FONT.mono, color: COL.dim, alpha: za });
  txt(ctx, '高潮时刻', peakX + 34, Y1 - 30, { size: 26, weight: 800, color: COL.ink, alpha: za });
  txt(ctx, '伏隔核 · NAcc', peakX + 34, Y1 + 4, { size: 17, weight: 400, fam: FONT.mono, color: COL.dim, alpha: za });
  // curve
  ctx.beginPath(); const xe = lerp(X0, X1, draw);
  for (let x = X0; x <= xe; x += 4) { const y = curve(x); x === X0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 4; ctx.stroke();
  glow(ctx, xe, curve(xe), 60, COL.gold, 0.6 * (1 - draw * 0.5));
  // dopamine particles: bursts on beats after tDA
  if (t > tDA - 0.2) {
    const k1 = Math.ceil(B(tDA - 0.2));
    for (let k = k1; k <= Math.floor(B(t)); k++) {
      for (let j = 0; j < 9; j++) {
        const age = t - bt(k); if (age > 2.6) continue; const zone = j % 3 === 0 ? peakX : lerp(600, peakX - 50, R(k, j));
        const x = zone + (R(k, j + 50) - 0.5) * 60 + Math.sin(age * 3 + j) * 12; const y = curve(zone) - 20 - age * (110 + 60 * R(k, j + 9));
        const a = (1 - age / 2.6) * A(t, bt(k), 0.15);
        ctx.fillStyle = hexA(COL.gold, a); circle(ctx, x, y, 6 + 3 * R(k, j + 3)); ctx.fill();
        if (j === 0) txt(ctx, 'DA', x + 10, y + 5, { size: 14, weight: 700, fam: FONT.mono, color: COL.gold, alpha: a });
      }
    }
  }
  // right column
  const ea = A(t, tDA - 0.1, 0.5, E.outE);
  ctext(ctx, '多巴胺', 1240, 470, { size: 108, weight: 900, color: COL.gold }, i => { const q = A(t, tDA - 0.1 + 0.05 * i, 0.4, E.outE); return { a: q, dy: 30 * (1 - q) }; });
  txt(ctx, 'DOPAMINE · 奖赏回路', 1244, 520, { size: 20, weight: 400, fam: FONT.mono, color: COL.dim, alpha: ea, ls: 3 });
  const eg = A(t, tGuess - 0.05, 0.4, E.outE);
  if (eg > 0) {
    ctx.save(); const pp = pulse(t, 0.2); zoomAround(ctx, 1240, 660, 1 + 0.25 * (1 - eg) + 0.02 * pp);
    ctx.globalAlpha = eg; ctx.fillStyle = COL.gold; rr(ctx, 1232, 588, 520, 120, 14); ctx.fill();
    txt(ctx, '猜中 = 奖赏', 1492, 672, { size: 72, weight: 900, color: '#060504', align: 'center' });
    ctx.restore();
  }
  cite(ctx, t, 'Salimpoor et al., 2011 · Nature Neuroscience', tAnt);
}
function r1AB(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.vid, glow: 0.08 });
  const k0 = s.b0 + 36; const tC = wt('C5', '对比');
  const items = [['A', '随机切换', COL.off, Math.max(bt(k0 + 1.5), tC - 0.1)], ['B', '卡点切换', COL.gold, Math.max(bt(k0 + 2.5), tC + 0.3)]];
  items.forEach(([L, name, col, ta], i) => {
    const x = W / 2 + (i ? 330 : -330); const q = A(t, ta, 0.45, E.outE); if (q <= 0) return;
    ctx.save(); ctx.globalAlpha = q; zoomAround(ctx, x, 520, 1.3 - 0.3 * q);
    txt(ctx, L, x, 640, { size: 420, weight: 700, fam: FONT.grot, stroke: col, lw: 4, align: 'center' });
    const pp = i === 1 ? pulse(t, 0.18) : Math.exp(-((t * 1.37 + 0.3) % 0.9) / 0.15);
    ctx.globalAlpha = q * (0.1 + 0.25 * pp); txt(ctx, L, x, 640, { size: 420, weight: 700, fam: FONT.grot, color: col, align: 'center' });
    ctx.globalAlpha = q; txt(ctx, name, x, 760, { size: 48, weight: 900, color: COL.ink, align: 'center', ls: 6 });
    ctx.restore();
  });
  txt(ctx, 'VS', W / 2, 560, { size: 40, weight: 700, fam: FONT.mono, color: COL.dim, align: 'center', alpha: A(t, items[1][3], 0.4) });
}

// ------------------------------------------------------------ DEMO (24 beats): card A | A | card B | B | side by side
let DEMO = null;
function demoInit(s) {
  const k0 = s.b0;
  const mk = (beats, i0, flash) => beats.map((bk, i) => ({ t: bt(bk), beat: bk, shot: SHOT_ORDER[((i + i0) * 3 + 1) % 16], seed: R(i + i0, 41), pal: PAL[((i + i0) * 5 + 1) % 8], flash }));
  const offA = [0, .62, 1.31, 2.48, 3.17, 3.83, 4.71, 5.44];                   // A: cut times have nothing to do with the beat
  const offS = [0, .55, 1.38, 2.2, 2.71, 3.6, 4.33, 5.12, 5.8, 6.47, 7.36];
  const bB = []; for (let k = 0; k < 6; k++) bB.push(k0 + 10 + k);
  const bSB = []; for (let k = 0; k < 8; k++) bSB.push(k0 + 16 + k);
  DEMO = {
    A: mk(offA.map(o => k0 + 2 + o), 0, .12), B: mk(bB, 0, .35),
    SA: mk(offS.map(o => k0 + 16 + o), 3, .12), SB: mk(bSB, 3, .35),
  };
}
const msOff = k => Math.round(Math.abs(k - Math.round(k)) * TL.T * 1000);
function demoStrip(ctx, t, x, y, w, cuts, isB, ppb = 130) {
  const b = B(t), xp = x + w / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y - 60, w, 120); ctx.clip();
  ctx.fillStyle = COL.faint; ctx.fillRect(x, y, w, 1);
  for (let k = Math.floor(b - 6); k < b + 6; k++) { const xx = xp + (k - b) * ppb; ctx.fillStyle = hexA(COL.aud, k % 4 === 0 ? .85 : .5); ctx.fillRect(xx - 1.5, y - 22, 3, 44); }
  for (const c of cuts) {
    const xx = xp + (c.beat - b) * ppb; if (xx < x - 20 || xx > x + w + 20) continue;
    const col = isB ? COL.gold : COL.off, hp = t >= c.t ? Math.exp(-(t - c.t) / .2) : 0;
    ctx.fillStyle = col; rr(ctx, xx - 6, y - 14 - 6 * hp, 12, 28 + 12 * hp, 3); ctx.fill();
    if (hp > .02) glow(ctx, xx, y, 60, col, hp);
  }
  ctx.restore();
  ctx.fillStyle = COL.cream; ctx.fillRect(xp - 1, y - 36, 2, 72);
}
// a verdict tag pops above the strip on each cut: ✗ and how far off (A), ✓ 0 ms (B)
function demoTags(ctx, t, cuts, x, y, isB) {
  for (const c of cuts) {
    const age = t - c.t; if (age < 0 || age > .9) continue; if (!isB && msOff(c.beat) < 30) continue;
    const a = 1 - A(t, c.t + .55, .35), sc = 1.3 - .3 * E.outB(clamp(age / .18));
    ctx.save(); ctx.globalAlpha = a; zoomAround(ctx, x, y, sc);
    chip(ctx, x, y, isB ? '✓ 踩在拍上' : `✗ 偏了 ${msOff(c.beat)} 毫秒`, isB ? COL.gold : COL.off, 1, { align: 'center', size: 32, fill: isB });
    ctx.restore();
  }
}
function demoCard(ctx, t, k, letter, title, sub, col, good) {
  bgBase(ctx, t, { tint: col, glow: .12 });
  const age = t - bt(k), e = E.outB(clamp(age / .22));
  // a ring behind the letter: whole and steady for B, broken and out of step for A
  if (good) haloRing(ctx, t, 560, 520, 210, { grow: e, since: bt(k) - .05, dot: false, halo: .08, nt: 16 });
  else { const j = Math.sin(age * 23) * 6 * Math.exp(-age / .6); segRing(ctx, 560 + j, 520, 210 * e, .55, [0, 18, -10, 26, 4, -16, 12, 30, -6, 20, 8, -22], 5, .85, 12, COL.off, age * .7); }
  ctx.save(); zoomAround(ctx, 560, 520, 1.35 - .35 * e);
  txt(ctx, letter, 560, 620, { size: 300, weight: 700, fam: FONT.grot, color: good ? COL.hot : COL.off, align: 'center' }); ctx.restore();
  ctext(ctx, title, 860, 560, { size: 150, weight: 900, color: good ? COL.hot : COL.ink }, i => { const q = A(t, bt(k) + .05 + .05 * i, .35, E.outE); return { a: q, dy: 40 * (1 - q) }; });
  txt(ctx, sub, 866, 640, { size: 34, weight: 500, color: good ? COL.gold : COL.off, alpha: A(t, bt(k) + .25, .4), ls: 2 });
  if (age >= 0) flashCream((good ? .45 : .25) * Math.exp(-age / .08));
}
function demoMonitor(ctx, t, cuts, mx, my, mw, mh, isB, jitter) {
  ctx.save(); if (jitter) ctx.translate(jitter, 0);
  rr(ctx, mx - 10, my - 10, mw + 20, mh + 20, 18); ctx.fillStyle = '#17140f'; ctx.fill();
  ctx.strokeStyle = hexA(isB ? COL.gold : COL.off, .55); ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); rr(ctx, mx, my, mw, mh, 10); ctx.clip(); montage(ctx, t, cuts, mx, my, mw, mh); ctx.restore();
  ctx.restore();
  // B: every cut throws a wave of light off the frame (on the beat)
  if (isB) for (const c of cuts) { const age = t - c.t; if (age < 0 || age > .5) continue; const u = age / .5, g = 30 * (1 - Math.pow(1 - u, 2)) + 6;
    LLc.save(); LLc.globalAlpha = Math.pow(1 - u, 1.6) * .9; LLc.strokeStyle = COL.cream; LLc.lineWidth = 3 + 6 * (1 - u); rr(LLc, mx - 10 - g, my - 10 - g, mw + 20 + 2 * g, mh + 20 + 2 * g, 18 + g); LLc.stroke(); LLc.restore(); }
}
SCN.demoA = {
  hud: true, chap: '01 预测 · 对比',
  cam: (t, s) => {
    const b = B(t), lb = b - s.b0, lt = t - bt(Math.floor(b));
    if ((lb >= 10 && lb < 16) || lb >= 16) return { z: 1 + .022 * Math.exp(-lt / .1), dx: 0, dy: 0 };      // B and the comparison: punch on the beat
    if (lb < 2 || (lb >= 8 && lb < 10)) { const kk = lb < 2 ? s.b0 : s.b0 + 8; const [dx, dy] = shakeOff(t, bt(kk), 10, .08); return { z: 1, dx, dy }; }
    return { z: 1, dx: 0, dy: 0 };
  },
  draw(ctx, t, s) {
    if (!DEMO) demoInit(s);
    sub(ctx, t, s, [
      { b: s.b0, draw: (c, t) => demoCard(c, t, s.b0, 'A', '不卡点', '切换的时刻，和节拍无关', COL.off, false) },
      { b: s.b0 + 2, draw: (c, t) => demoSingle(c, t, s, false), tr: { type: 'zoom', n: .6 } },
      { b: s.b0 + 8, draw: (c, t) => demoCard(c, t, s.b0 + 8, 'B', '卡点', '每一次切换，都踩在拍子上', COL.gold, true) },
      { b: s.b0 + 10, draw: (c, t) => demoSingle(c, t, s, true), tr: { type: 'zoom', n: .6 } },
      { b: s.b0 + 16, draw: (c, t) => demoSide(c, t, s), tr: { type: 'shutter', n: .9 } },
    ]);
  }
};
TR.demoA = { type: 'flash', n: 0.4, amt: 0 };
function demoSingle(ctx, t, s, isB) {
  bgBase(ctx, t, { tint: isB ? COL.gold : COL.off, glow: .07 });
  const cuts = isB ? DEMO.B : DEMO.A, mx = 400, my = 170, mw = 1120, mh = 630;
  // A: the frame lurches on its own off-beat cuts
  let jit = 0; if (!isB) for (const c of cuts) { const age = t - c.t; if (age >= 0 && age < .3) jit += Math.sin(age * 60) * 14 * Math.exp(-age / .08); }
  txt(ctx, isB ? 'B' : 'A', mx, 128, { size: 64, weight: 700, fam: FONT.grot, color: isB ? COL.gold : COL.off });
  txt(ctx, isB ? '卡点' : '不卡点', mx + 62, 124, { size: 46, weight: 900, color: isB ? COL.hot : COL.ink });
  demoMonitor(ctx, t, cuts, mx, my, mw, mh, isB, jit);
  demoStrip(ctx, t, mx, 880, mw, cuts, isB);
  demoTags(ctx, t, cuts, W / 2, 838, isB);
  txt(ctx, '节拍', mx - 24, 888, { size: 22, weight: 700, color: COL.aud, align: 'right' });
  txt(ctx, '| 切换', mx - 24, 914, { size: 16, weight: 500, color: isB ? COL.gold : COL.off, align: 'right' });
}
function demoSide(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.ring, glow: .08 });
  const k0 = s.b0 + 16, mw = 820, mh = 461, my = 250, xa = 110, xb = 990;
  ctext(ctx, '同一段音乐，放在一起看', W / 2, 160, { size: 54, weight: 900, align: 'center' }, i => { const q = A(t, bt(k0) + .03 * i, .35, E.outE); return { a: q, dy: 20 * (1 - q) }; });
  let jit = 0; for (const c of DEMO.SA) { const age = t - c.t; if (age >= 0 && age < .3) jit += Math.sin(age * 60) * 10 * Math.exp(-age / .08); }
  demoMonitor(ctx, t, DEMO.SA, xa, my, mw, mh, false, jit);
  demoMonitor(ctx, t, DEMO.SB, xb, my, mw, mh, true, 0);
  chip(ctx, xa, my - 46, 'A · 不卡点', COL.off, 1, { size: 28 });
  chip(ctx, xb, my - 46, 'B · 卡点', COL.gold, 1, { size: 28, fill: true });
  demoStrip(ctx, t, xa, 800, mw, DEMO.SA, false, 100);
  demoStrip(ctx, t, xb, 800, mw, DEMO.SB, true, 100);
  demoTags(ctx, t, DEMO.SA, xa + mw / 2, 870, false);
  demoTags(ctx, t, DEMO.SB, xb + mw / 2, 870, true);
}
