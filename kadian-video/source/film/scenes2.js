// ============================================================
//  scenes2.js — 02 binding, pip&pop, window, 03 groove
// ============================================================
let PIP = null;
function initScenes2() {
  // pip & pop grid
  const rows = 6, cols = 11, sp = 118; const gx = W / 2 - (cols - 1) * sp / 2, gy = 250;
  const dots = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) dots.push({ x: gx + c * sp, y: gy + r * sp, flashes: [] });
  const target = 3 * cols + 7;
  const P0 = SB('r2') + 16, REV = SB('r2b');
  const tStart = bt(P0 + 1.5), tEnd = bt(REV + 14);
  const beatNear = tt => { const k = Math.round(B(tt)); return Math.abs(tt - bt(k)) < 0.12; };
  dots.forEach((d, i) => {
    if (i === target) { for (let k = P0 + 2; k < REV + 14; k++) d.flashes.push(bt(k)); return; }
    let tt = tStart + R(i, 1) * 0.8, n = 0;
    while (tt < tEnd) { tt += 0.45 + 1.4 * R(i, n + 10); n++; if (!beatNear(tt)) d.flashes.push(tt); }
  });
  PIP = { dots, target, rows, cols };
}
function flashAmt(list, t, dec = 0.11) { let f = 0; for (const tf of list) { const d = t - tf; if (d >= -0.02 && d < 0.8) f = Math.max(f, d < 0 ? 0 : Math.exp(-d / dec)); } return f; }
function drawPip(ctx, t, inBeat) {
  const reveal = A(t, bt(SB('r2b')), 0.5, E.outC);
  PIP.dots.forEach((d, i) => {
    const appear = A(t, bt(inBeat) + (Math.hypot(d.x - W / 2, d.y - 545) / 900) * 0.6, 0.4, E.outB); if (appear <= 0) return;
    const isT = i === PIP.target; const f = flashAmt(d.flashes, t);
    const dimA = isT ? 1 : 1 - 0.75 * reveal;
    ctx.save(); ctx.globalAlpha = dimA * clamp(appear);
    circle(ctx, d.x, d.y, 14 * appear); ctx.fillStyle = 'rgba(243,238,228,0.2)'; ctx.fill();
    if (f > 0.01) { circle(ctx, d.x, d.y, 14 + 9 * f); ctx.fillStyle = hexA(COL.vid, f); ctx.fill(); glow(ctx, d.x, d.y, 70, COL.vid, f * 0.8); circle(LLc, d.x, d.y, 10 + 8 * f); LLc.fillStyle = hexA(COL.cream, .55 * f * dimA); LLc.fill(); }
    ctx.restore();
  });
  if (reveal > 0) {
    const d = PIP.dots[PIP.target]; const p = pulse(t, 0.2);
    ctx.save(); ctx.globalAlpha = reveal;
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 4; circle(ctx, d.x, d.y, 44 + 30 * (1 - reveal) + 6 * p); ctx.stroke();
    ctx.lineWidth = 2; ctx.globalAlpha = reveal * 0.5; circle(ctx, d.x, d.y, 64 + 20 * p); ctx.stroke();
    ctx.globalAlpha = reveal; chip(ctx, d.x + 84, d.y - 70, '♩ 跟着鼓点闪', COL.gold, 1, { size: 24, fill: true });
    ctx.restore();
  }
}

// ------------------------------------------------------------ R2 (124-152)
SCN.r2 = {
  hud: true, chap: '02 绑定', push: .008,
  draw(ctx, t, s) {
    sub(ctx, t, s, [
      { b: s.b0, draw: (c, t) => chapterCard(c, t, s.b0, '02', '视听合为一', 'MULTISENSORY  BINDING', COL.aud) },
      { b: s.b0 + 4, draw: r2Bind, tr: { type: 'iris', n: 0.9, color: COL.aud } },
      { b: s.b0 + 16, draw: (c, t) => pipScene(c, t, s), tr: { type: 'wipe', n: 0.8, color: COL.vid } },
    ]);
  }
};
TR.r2 = { type: 'wipe', n: 0.9, color: COL.aud };
function r2Bind(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.aud, glow: 0.07 });
  const b = B(t), k0 = s.b0 + 4, cy = 520, xs = 330, xe = 1590, xc = 960;
  const tBind = wt('D2', '绑定'), tStrong = wt('D2', '感知');
  const inA = A(t, bt(k0), 0.6, E.outC);
  ctx.save(); ctx.globalAlpha = inA;
  // sound icon
  ctx.fillStyle = COL.aud; rr(ctx, xs - 70, cy - 30, 34, 60, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(xs - 40, cy - 30); ctx.lineTo(xs - 6, cy - 62); ctx.lineTo(xs - 6, cy + 62); ctx.lineTo(xs - 40, cy + 30); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = COL.aud; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = 1; i <= 3; i++) { const pp = pulse(t, 0.25); ctx.globalAlpha = inA * (0.4 + 0.6 * pp) * (1 - i * 0.2); ctx.beginPath(); ctx.arc(xs, cy, 22 + i * 22, -0.8, 0.8); ctx.stroke(); }
  ctx.globalAlpha = inA;
  txt(ctx, '声音', xs - 30, cy + 130, { size: 40, weight: 900, color: COL.aud, align: 'center' });
  // eye icon
  ctx.strokeStyle = COL.vid; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(xe - 90, cy); ctx.quadraticCurveTo(xe, cy - 80, xe + 90, cy); ctx.quadraticCurveTo(xe, cy + 80, xe - 90, cy); ctx.stroke();
  circle(ctx, xe, cy, 30); ctx.fillStyle = COL.vid; ctx.fill(); circle(ctx, xe + 8, cy - 8, 8); ctx.fillStyle = '#060504'; ctx.fill();
  txt(ctx, '画面', xe, cy + 130, { size: 40, weight: 900, color: COL.vid, align: 'center' });
  // paths
  ctx.fillStyle = COL.faint; ctx.fillRect(xs + 80, cy - 1, xc - 120 - xs - 80, 2); ctx.fillRect(xc + 120, cy - 1, xe - 110 - xc - 120, 2);
  ctx.restore();
  // brain node
  const locked = t >= tBind - 0.1;
  let hitBig = 0, hitA = 0, hitV = 0;
  for (let k = Math.floor(b) - 1; k <= Math.floor(b) + 1; k++) {
    if (k < k0) continue;
    const arrA = bt(k), syncK = bt(k) >= tBind - 0.1; const arrV = syncK ? bt(k) : bt(k + 0.42);
    const travel = TL.T * 0.85;
    // audio pulse
    const qa = (t - (arrA - travel)) / travel; if (qa >= 0 && qa < 1) { const x = lerp(xs + 80, xc - 110, E.inQ(qa)); circle(ctx, x, cy, 13); ctx.fillStyle = COL.aud; ctx.fill(); glow(ctx, x, cy, 60, COL.aud, 0.8); }
    const qv = (t - (arrV - travel)) / travel; if (qv >= 0 && qv < 1) { const x = lerp(xe - 110, xc + 110, E.inQ(qv)); circle(ctx, x, cy, 13); ctx.fillStyle = COL.vid; ctx.fill(); glow(ctx, x, cy, 60, COL.vid, 0.8); }
    if (syncK) hitBig = Math.max(hitBig, pulseAt(t, k, 0.3)); else { hitA = Math.max(hitA, t >= arrA ? Math.exp(-(t - arrA) / 0.2) : 0); hitV = Math.max(hitV, t >= arrV ? Math.exp(-(t - arrV) / 0.2) : 0); }
  }
  const nodeR = 100 + 26 * hitBig;
  circle(ctx, xc, cy, nodeR); ctx.fillStyle = '#14110c'; ctx.fill(); ctx.strokeStyle = hexA(COL.ink, 0.35 + 0.6 * hitBig); ctx.lineWidth = 2.5; ctx.stroke();
  if (hitA > 0.01) { ctx.strokeStyle = hexA(COL.aud, hitA); ctx.lineWidth = 4; circle(ctx, xc, cy, 70 + 40 * (1 - hitA)); ctx.stroke(); }
  if (hitV > 0.01) { ctx.strokeStyle = hexA(COL.vid, hitV); ctx.lineWidth = 4; circle(ctx, xc, cy, 70 + 40 * (1 - hitV)); ctx.stroke(); }
  if (hitBig > 0.01) { ringLine(LLc, xc, cy, nodeR + 30 + 380 * (1 - hitBig), COL.wave, hitBig * .9, 3 + 10 * hitBig); FRAME_GLOW = Math.max(FRAME_GLOW, .5 + .8 * hitBig); glow(ctx, xc, cy, 300, COL.ink, hitBig * 0.7); ctx.strokeStyle = `rgba(255,240,214,${hitBig})`; ctx.lineWidth = 5; circle(ctx, xc, cy, nodeR + 60 * (1 - hitBig)); ctx.stroke(); }
  txt(ctx, '大脑', xc, cy + 14, { size: 40, weight: 900, color: COL.ink, align: 'center' });
  // labels
  const lab = locked ? '同时到达 → 一个事件' : '先后到达 → 两个事件';
  chip(ctx, xc, cy - 190, lab, locked ? COL.ink : '#a59a86', inA, { align: 'center', size: 26 });
  const es = A(t, tStrong - 0.05, 0.45, E.outB);
  if (es > 0) {
    ctx.save(); ctx.globalAlpha = clamp(es); zoomAround(ctx, xc, cy + 240, 0.7 + 0.3 * es);
    txt(ctx, '1 + 1 > 2', xc, cy + 262, { size: 64, weight: 700, fam: FONT.mono, color: COL.gold, align: 'center' });
    txt(ctx, '更强 · 更显眼 · 反应更快', xc, cy + 310, { size: 24, weight: 500, color: COL.dim, align: 'center', ls: 3 });
    ctx.restore();
  }
  cite(ctx, t, 'Stein & Meredith, 1993 · The Merging of the Senses', tBind);
}
function pipScene(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.vid, glow: 0.06, grid: false });
  const k0 = SB('r2') + 16;
  const hd = A(t, bt(k0 + 1.4), 0.5, E.outC);
  const rev = t >= bt(SB('r2b'));
  ctx.save(); ctx.globalAlpha = hd;
  txt(ctx, rev ? '就是它' : '找一找：哪个点跟着鼓点闪？', W / 2, 150, { size: 46, weight: 900, align: 'center', color: rev ? COL.gold : COL.ink });
  if (!rev) {
    const pr = clamp((B(t) - SB('pip')) / 16); const bw = 700;
    ctx.fillStyle = COL.faint; ctx.fillRect(W / 2 - bw / 2, 186, bw, 3);
    ctx.fillStyle = COL.vid; ctx.fillRect(W / 2 - bw / 2, 186, bw * (1 - pr), 3);
  }
  ctx.restore();
  drawPip(ctx, t, k0);
  cite(ctx, t, 'Van der Burg et al., 2008 · “Pip and Pop”', bt(168));
}
SCN.pip = { hud: true, chap: '02 绑定 · 试试看', subs: true, push: .012, draw(ctx, t, s) { pipScene(ctx, t, s); } };

// ------------------------------------------------------------ R2b (168-204)
SCN.r2b = {
  hud: true, chap: '02 绑定', push: .008,
  draw(ctx, t, s) {
    sub(ctx, t, s, [
      { b: s.b0, draw: (c, t) => pipScene(c, t, s) },
      { b: s.b0 + 8, draw: r2Window, tr: { type: 'slide', n: 0.9 } },
    ]);
  }
};
function r2Window(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.gold, glow: 0.07 });
  const k0 = s.b0 + 8, ax0 = 300, ax1 = 1620, ay = 640, ppm = (ax1 - ax0) / 400; const X = ms => (ax0 + ax1) / 2 + ms * ppm;
  const tWin = wt('D4', '几十'), tTol = wt('D4', '容忍'), tLight = wt('D4', '光');
  const eAx = A(t, bt(k0), 0.9, E.outE);
  // title
  ctext(ctx, '绑定窗口', 300, 230, { size: 64, weight: 900 }, i => { const q = A(t, bt(k0) + 0.05 * i, 0.4, E.outE); return { a: q, dy: 20 * (1 - q) }; });
  txt(ctx, 'TEMPORAL BINDING WINDOW', 304, 272, { size: 18, weight: 400, fam: FONT.mono, color: COL.dim, ls: 4, alpha: eAx });
  // axis
  ctx.fillStyle = COL.ink; ctx.fillRect(X(0) - (X(0) - ax0) * eAx, ay, (ax1 - ax0) * eAx, 2);
  for (let ms = -200; ms <= 200; ms += 50) {
    const a = A(t, bt(k0) + 0.3 + (ms + 200) / 400 * 0.4, 0.3); ctx.fillStyle = hexA(COL.ink, 0.6 * a); ctx.fillRect(X(ms) - 1, ay, 2, 14);
    txt(ctx, (ms > 0 ? '+' : '') + ms, X(ms), ay + 44, { size: 18, weight: 400, fam: FONT.mono, color: COL.dim, align: 'center', alpha: a });
  }
  txt(ctx, 'ms', ax1 + 20, ay + 44, { size: 18, fam: FONT.mono, weight: 400, color: COL.dim, alpha: eAx });
  txt(ctx, '← 声音比画面晚', ax0, ay + 96, { size: 26, weight: 700, color: COL.aud, alpha: eAx });
  txt(ctx, '声音比画面早 →', ax1, ay + 96, { size: 26, weight: 700, color: COL.aud, align: 'right', alpha: eAx });
  // zero line
  const ez = A(t, bt(k0 + 1.5), 0.5, E.outE);
  ctx.fillStyle = hexA(COL.ink, ez); ctx.fillRect(X(0) - 1.5, ay - 300 * ez, 3, 300 * ez);
  txt(ctx, '0 · 完全同步', X(0), ay - 316, { size: 22, weight: 700, color: COL.ink, align: 'center', alpha: ez });
  // window
  const ew = A(t, tWin - 0.1, 1.1, E.outE);
  if (ew > 0) {
    const l = X(-125 * ew), r = X(45 * ew);
    const tol = A(t, tTol, 0.6, E.outC);
    const g = ctx.createLinearGradient(0, ay - 230, 0, ay); g.addColorStop(0, hexA(COL.gold, 0.05)); g.addColorStop(1, hexA(COL.gold, 0.32));
    ctx.fillStyle = g; ctx.fillRect(l, ay - 230, r - l, 230);
    ctx.fillStyle = COL.gold; ctx.fillRect(l, ay - 230, 3, 230); ctx.fillRect(r - 3, ay - 230, 3, 230);
    if (tol > 0) { ctx.fillStyle = hexA(COL.gold, 0.22 * tol); ctx.fillRect(l, ay - 230, X(0) - l, 230); }
    txt(ctx, '察觉不到不同步', (l + r) / 2, ay - 110, { size: 30, weight: 900, color: COL.ink, align: 'center', alpha: ew });
    const n1 = A(t, tWin + 0.35, 0.4, E.outB), n2 = A(t, tWin + 0.6, 0.4, E.outB);
    txt(ctx, '−125', X(-125), ay - 250, { size: 40, weight: 700, fam: FONT.mono, color: COL.gold, align: 'center', alpha: clamp(n1) });
    txt(ctx, '+45', X(45), ay - 250, { size: 40, weight: 700, fam: FONT.mono, color: COL.gold, align: 'center', alpha: clamp(n2) });
    if (tol > 0) {
      ctx.save(); ctx.globalAlpha = tol; ctx.strokeStyle = COL.gold; ctx.lineWidth = 3;
      const ya = ay - 168; line(ctx, X(-10), ya, X(-115), ya); ctx.beginPath(); ctx.moveTo(X(-115), ya); ctx.lineTo(X(-115) + 16, ya - 10); ctx.lineTo(X(-115) + 16, ya + 10); ctx.closePath(); ctx.fillStyle = COL.gold; ctx.fill();
      txt(ctx, '更宽容', X(-62), ya - 14, { size: 24, weight: 800, color: COL.gold, align: 'center' });
      ctx.restore();
    }
  }
  // light vs sound inset
  const el = A(t, tLight - 0.1, 0.6, E.outE);
  if (el > 0) {
    const bx = 1180, by = 170, bw = 580, bh = 190;
    ctx.save(); ctx.globalAlpha = el; ctx.translate(0, 20 * (1 - el));
    rr(ctx, bx, by, bw, bh, 16); ctx.fillStyle = 'rgba(243,238,228,0.05)'; ctx.fill(); ctx.strokeStyle = COL.faint; ctx.lineWidth = 1.5; ctx.stroke();
    const lt = t - tLight; const sx = bx + 60, ex = bx + bw - 60, ly = by + 70;
    // flash travels instantly, sound travels slowly
    const lx = lerp(sx, ex, clamp(lt / 0.05)); ctx.fillStyle = COL.gold; ctx.fillRect(sx, ly - 2, lx - sx, 4); glow(ctx, lx, ly, 40, COL.gold, 0.8);
    txt(ctx, '光', sx - 36, ly + 9, { size: 26, weight: 900, color: COL.gold });
    const sxx = lerp(sx, ex, clamp(((lt % 2.2)) / 1.8, 0, 1)); ctx.fillStyle = COL.aud; ctx.fillRect(sx, ly + 48, sxx - sx, 4); glow(ctx, sxx, ly + 50, 40, COL.aud, 0.8);
    txt(ctx, '声', sx - 36, ly + 59, { size: 26, weight: 900, color: COL.aud });
    txt(ctx, '10 米外：声音比光晚到约 29 毫秒', bx + bw / 2, by + bh - 22, { size: 22, weight: 600, color: COL.ink, align: 'center' });
    ctx.restore();
  }
  cite(ctx, t, 'ITU-R BT.1359 · 音画同步的可察觉阈值', tWin + 0.5);
}
function r2Frames(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.gold, glow: 0.07 });
  const k0 = s.b0, cw = 74, n = 21, x0 = W / 2 - (n * cw) / 2, y = 600, ch = 120;
  const tN = wt('D5', '宁早');
  const ea = A(t, bt(k0), 0.7, E.outE);
  // film strip
  ctx.save(); ctx.globalAlpha = ea;
  ctx.fillStyle = '#15120d'; ctx.fillRect(x0 - 20, y - ch / 2 - 30, n * cw + 40, ch + 60);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * cw; const q = A(t, bt(k0) + i * 0.012, 0.4, E.outC);
    rr(ctx, x + 5, y - ch / 2, cw - 10, ch, 6); ctx.fillStyle = hexA(COL.ink, 0.06 + 0.04 * (i % 2)); ctx.fill();
    for (const yy of [y - ch / 2 - 18, y + ch / 2 + 8]) { ctx.fillStyle = 'rgba(243,238,228,0.14)'; ctx.fillRect(x + cw / 2 - 8, yy, 16, 10); }
    txt(ctx, String(i - 10), x + cw / 2, y + 8, { size: 18, weight: 400, fam: FONT.mono, color: COL.dim, align: 'center', alpha: q });
  }
  ctx.restore();
  // beat line at frame boundary (between -1 and 0 -> x0 + 10*cw)
  const xb = x0 + 10 * cw; const p = pulse(t, 0.2);
  ctx.fillStyle = COL.aud; ctx.fillRect(xb - 2, y - 170, 4, 340); glow(ctx, xb, y - 170, 60, COL.aud, 0.5 + 0.5 * p);
  txt(ctx, '拍点', xb, y - 186, { size: 28, weight: 900, color: COL.aud, align: 'center', alpha: ea });
  // markers
  const m1 = A(t, bt(k0 + 1), 0.5, E.outB), m2 = A(t, bt(k0 + 2), 0.5, E.outB);
  const early = xb - cw, late = xb + 2 * cw;
  if (m1 > 0) { ctx.save(); ctx.globalAlpha = clamp(m1); ctx.fillStyle = COL.gold; ctx.fillRect(early - 3, y - 110, 6, 220); chip(ctx, early, y + 170, '✓ 早 1 帧', COL.gold, 1, { align: 'center', size: 26, fill: true }); ctx.restore(); }
  if (m2 > 0) { ctx.save(); ctx.globalAlpha = clamp(m2); ctx.fillStyle = COL.off; ctx.fillRect(late - 3, y - 110, 6, 220); chip(ctx, late, y + 170, '✗ 晚 2 帧', COL.off, 1, { align: 'center', size: 26 }); ctx.restore(); }
  txt(ctx, '30 fps · 1 帧 ≈ 33 ms', x0 + n * cw, y - 120, { size: 20, weight: 400, fam: FONT.mono, color: COL.dim, align: 'right', alpha: ea });
  // big statement
  const e = A(t, tN - 0.05, 0.45, E.outE);
  ctext(ctx, '宁早勿晚', W / 2, 330, { size: 140, weight: 900, align: 'center', ls: 30 }, i => { const q = A(t, tN - 0.05 + 0.07 * i, 0.4, E.outE); return { a: q, s: 1.4 - 0.4 * q, color: i < 2 ? COL.gold : COL.ink }; });
}

// ------------------------------------------------------------ LAB: hear it — one clap, the sound early or late by 0.1 s
function labGap(t, claps) {
  // the hands close onto each clap's picture moment and spring open after it
  let g = 1;
  for (const k of claps) {
    const c = bt(k), d = t - c;
    if (d >= -.42 && d < 0) g = Math.min(g, 1 - E.inQ((d + .42) / .42));
    else if (d >= 0 && d < .5) g = Math.min(g, E.outC(d / .5));
  }
  return g;
}
SCN.lab = {
  hud: true, chap: '02 绑定 · 听一听',
  draw(ctx, t, s) {
    bgBase(ctx, t, { tint: COL.aud, glow: .06 });
    const b = B(t), trials = s.trials, k0 = s.b0, cx = W / 2, cy = 520;
    const tr0 = trials[0][0], end = trials[2][0] + 4;
    ctext(ctx, '听一听', cx, 175, { size: 76, weight: 900, align: 'center', ls: 12 }, i => { const q = A(t, bt(k0) + .05 * i, .35, E.outE); return { a: q, dy: 24 * (1 - q) }; });
    txt(ctx, '看两只手合上的那一下，听拍手声', cx, 232, { size: 30, weight: 500, color: COL.dim, align: 'center', alpha: A(t, bt(k0 + 1), .4) });
    // current trial
    let cur = -1; trials.forEach(([k], i) => { if (b >= k - .5 && b < k + 3.5) cur = i; });
    const claps = []; trials.forEach(([k]) => claps.push(k, k + 2));
    const g = labGap(t, claps), gap = 46 + 330 * g;
    const handIn = A(t, bt(k0 + 1.5), .5, E.outB);
    for (const side of [-1, 1]) {
      const x = cx + side * (gap / 2 + 36);
      ctx.save(); ctx.globalAlpha = clamp(handIn); rr(ctx, x - 36, cy - 120, 72, 240, 36); ctx.fillStyle = COL.cream; ctx.fill();
      ctx.globalAlpha *= .35; rr(ctx, x - 36 + side * 10, cy - 104, 30, 208, 15); ctx.fillStyle = COL.ring; ctx.fill(); ctx.restore();
    }
    // the picture event: the moment the hands meet
    for (const k of claps) {
      const d = t - bt(k); if (d < 0 || d > .6) continue; const u = d / .6;
      ringLine(LLc, cx, cy, 60 + 360 * (1 - Math.pow(1 - u, 2)), COL.wave, Math.pow(1 - u, 1.7), 3 + 10 * (1 - u));
      glow(ctx, cx, cy, 160, COL.cream, Math.exp(-d / .1)); FRAME_GLOW = Math.max(FRAME_GLOW, .5 + .6 * Math.exp(-d / .12));
    }
    // trial labels: what is being played now, and where the sound sits against the picture
    const labels = ['① 同步', '② 声音早 0.1 秒', '③ 声音晚 0.1 秒'];
    trials.forEach(([k, off], i) => {
      const x = cx + (i - 1) * 520, on = i === cur, done = b >= k + 3.5;
      const q = A(t, bt(k), .3, E.outB); if (b < k - .5) return;
      ctx.save(); ctx.globalAlpha = (on ? 1 : .45) * clamp(q + (done ? 1 : 0)); zoomAround(ctx, x, 330, on ? 1.3 - .3 * clamp(q) : 1);
      txt(ctx, labels[i], x, 345, { size: on ? 42 : 34, weight: 900, color: i === 0 ? COL.cream : COL.aud, align: 'center' }); ctx.restore();
      if (on) {   // a still diagram: picture mark at 0, sound mark offset by the trial (no pulse at the sound time)
        const ax0 = cx - 300, ax1 = cx + 300, ay = 820, px = cx, sx = cx + off * 2000;
        ctx.save(); ctx.globalAlpha = clamp(q);
        ctx.fillStyle = COL.faint; ctx.fillRect(ax0, ay, ax1 - ax0, 2);
        ctx.fillStyle = COL.gold; rr(ctx, px - 6, ay - 34, 12, 68, 4); ctx.fill();
        ctx.fillStyle = COL.aud; rr(ctx, sx - 6, ay - 34, 12, 68, 4); ctx.fill();
        txt(ctx, '画面', px, ay - 48, { size: 22, weight: 800, color: COL.gold, align: 'center' });
        txt(ctx, '声音', sx, ay + 64, { size: 22, weight: 800, color: COL.aud, align: 'center' });
        if (off !== 0) { ctx.strokeStyle = COL.aud; ctx.lineWidth = 2; line(ctx, px, ay + 20, sx, ay + 20); txt(ctx, off < 0 ? '抢先 100 毫秒' : '迟到 100 毫秒', (px + sx) / 2, ay + 98, { size: 22, weight: 500, color: COL.dim, align: 'center' }); }
        ctx.restore();
      }
    });
    // the verdict
    const tv = wt('D4y', '声音'), ev = A(t, tv - .05, .4, E.outB);
    if (b >= end && ev > 0) {
      ctx.save(); ctx.globalAlpha = clamp(ev);
      chip(ctx, cx - 300, 800, '声音抢先 → 更容易察觉 ✗', COL.off, 1, { align: 'center', size: 30 });
      chip(ctx, cx + 300, 800, '声音迟到 → 常常察觉不到 ✓', COL.gold, 1, { align: 'center', size: 30, fill: true });
      ctx.restore();
    }
  }
};
TR.lab = { type: 'slide', n: 0.9 };
SCN.r2c = { hud: true, chap: '02 绑定', push: .01, draw(ctx, t, s) { r2Frames(ctx, t, s); } };
TR.r2c = { type: 'shutter', n: 1 };

// ------------------------------------------------------------ R3 GROOVE (204-232)
SCN.r3 = {
  hud: true, chap: '03 律动', push: .012,
  draw(ctx, t, s) {
    sub(ctx, t, s, [
      { b: s.b0, draw: (c, t) => chapterCard(c, t, s.b0, '03', '身体跟上拍', 'SENSORIMOTOR  ·  GROOVE', COL.mint) },
      { b: s.b0 + 4, draw: r3Brain, tr: { type: 'zoom', n: 0.8 } },
      { b: s.b0 + 12, draw: r3Nod, tr: { type: 'slide', n: 0.9 } },
    ]);
  }
};
TR.r3 = { type: 'iris', n: 1, color: COL.mint };
function headPath(ctx) {
  ctx.beginPath(); ctx.moveTo(90, 470);
  ctx.bezierCurveTo(80, 420, 60, 380, 55, 320); ctx.bezierCurveTo(40, 200, 120, 60, 250, 55);
  ctx.bezierCurveTo(360, 50, 420, 130, 425, 200); ctx.bezierCurveTo(428, 235, 432, 255, 446, 285);
  ctx.lineTo(472, 336); ctx.bezierCurveTo(476, 346, 466, 352, 452, 353); ctx.lineTo(454, 372);
  ctx.bezierCurveTo(458, 380, 450, 385, 446, 388); ctx.lineTo(451, 401); ctx.bezierCurveTo(450, 420, 441, 431, 420, 438);
  ctx.bezierCurveTo(400, 445, 372, 446, 352, 452); ctx.lineTo(338, 476); ctx.lineTo(342, 560);
}
function nodCurve(t, delay = 0) { const k = lastBeat(t - delay); const ph = t - delay - bt(k); return ph < 0.07 ? E.outQ(ph / 0.07) : Math.exp(-(ph - 0.07) / 0.16); }
function r3Brain(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.mint, glow: 0.07, gx: 0.3 });
  const k0 = s.b0 + 4, tAct = wt('E2', '激活'), tMove = wt('E2', '运动');
  const e = A(t, bt(k0), 0.8, E.outE), p = pulse(t, 0.22);
  ctx.save(); ctx.translate(250, 200); ctx.scale(1.32, 1.32);
  ctx.globalAlpha = e;
  headPath(ctx); ctx.strokeStyle = hexA(COL.ink, 0.85); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  // brain outline
  ctx.save(); ctx.setLineDash([6, 8]); ctx.strokeStyle = hexA(COL.ink, 0.3); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(240, 200, 165, 120, -0.08, 0, TAU); ctx.stroke(); ctx.restore();
  // ear sound waves
  for (let i = 0; i < 3; i++) { const q = ((t - bt(lastBeat(t))) / TL.T + i / 3) % 1; ctx.strokeStyle = hexA(COL.aud, (1 - q) * 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(150, 300, 20 + q * 120, Math.PI * 0.75, Math.PI * 1.25); ctx.stroke(); }
  const act = A(t, tMove - 0.2, 0.6, E.outC);
  const nodes = [[245, 108, '辅助运动区', 'SMA'], [262, 222, '基底神经节', 'Basal ganglia']];
  nodes.forEach(([x, y, n1, n2], i) => {
    const pp = act * (0.35 + 0.65 * p);
    glow(ctx, x, y, 90 + 50 * p * act, COL.mint, pp); circle(ctx, x, y, 12 + 5 * p * act); ctx.fillStyle = hexA(COL.mint, 0.4 + 0.6 * act); ctx.fill();
  });
  ctx.restore();
  // labels (outside, screen space)
  const lx = 1010;
  [[108, '辅助运动区', 'SMA · 节拍与动作计时'], [222, '基底神经节', 'Basal ganglia · 节律预测']].forEach(([yy, n1, n2], i) => {
    const q = A(t, tMove - 0.1 + i * 0.25, 0.5, E.outE); if (q <= 0) return;
    const sx = 250 + 1.32 * (i ? 262 : 245), sy = 200 + 1.32 * yy;
    ctx.save(); ctx.globalAlpha = q; ctx.strokeStyle = hexA(COL.mint, 0.6); ctx.lineWidth = 1.5; line(ctx, sx + 20, sy, lerp(sx + 20, lx - 20, q), sy);
    txt(ctx, n1, lx, sy + 4, { size: 40, weight: 900, color: COL.mint }); txt(ctx, n2, lx, sy + 40, { size: 20, weight: 400, fam: FONT.mono, color: COL.dim, ls: 1 });
    ctx.restore();
  });
  const ea = A(t, tAct - 0.05, 0.5, E.outE);
  if (ea > 0) { ctx.save(); ctx.globalAlpha = ea; chip(ctx, lx, 690, '静坐聆听，也会被激活', COL.mint, 1, { size: 30, fill: true }); ctx.restore(); }
  cite(ctx, t, 'Grahn & Brett, 2007 · J. Cogn. Neurosci.', tMove);
}
function drawListener(ctx, x, y, sc, ang, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-95, 120); ctx.bezierCurveTo(-95, 40, -60, 20, 0, 20); ctx.bezierCurveTo(60, 20, 95, 40, 95, 120); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(0, 8); ctx.rotate(ang); ctx.fillRect(-14, -40, 28, 44); circle(ctx, 0, -78, 50); ctx.fill(); ctx.restore();
  ctx.restore();
}
function r3Nod(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.mint, glow: 0.07 });
  const k0 = s.b0 + 12; const tE3 = lineT('E3')[0];
  const split = A(t, Math.max(bt(k0 + 4), tE3 - 0.3), 1.0, E.ioE);
  const n = 7; const span = lerp(1500, 690, split); const cx = lerp(W / 2, 520, split); const sc = lerp(1, 0.6, split);
  for (let i = 0; i < n; i++) {
    const x = cx - span / 2 + i * span / (n - 1); const d = R(i, 3) * 0.03; const amp = 0.24 + 0.08 * R(i, 4);
    const q = A(t, bt(k0) + i * 0.04, 0.5, E.outB); const nod = nodCurve(t, d);
    drawListener(ctx, x, 560 + 24 * (1 - q), sc, amp * nod, i === 3 ? COL.mint : hexA(COL.ink, 0.85), clamp(q));
    if (i === 3) txt(ctx, '你', x, 560 + 190 * sc, { size: 30 * sc + 4, weight: 900, color: COL.mint, align: 'center', alpha: clamp(q) });
  }
  const tNod = wt('E2', '点头'); const en = A(t, tNod - 0.05, 0.4, E.outB);
  if (split < 0.5) txt(ctx, '忍不住想点头', W / 2, 260, { size: 64, weight: 900, align: 'center', alpha: clamp(en) * (1 - split * 2) });
  if (split > 0) {
    const mx = 1080, my = 300, mw = 640, mh = 400; const nod = nodCurve(t);
    ctx.save(); ctx.globalAlpha = split; ctx.translate(80 * (1 - split), 0);
    rr(ctx, mx - 10, my - 10, mw + 20, mh + 20, 16); ctx.fillStyle = '#17140f'; ctx.fill();
    rr(ctx, mx, my, mw, mh, 8); ctx.fillStyle = '#0b0a07'; ctx.fill();
    ctx.save(); rr(ctx, mx, my, mw, mh, 8); ctx.clip();
    const by = my + 120 + 150 * nod; circle(ctx, mx + mw / 2, by, 46); ctx.fillStyle = COL.vid; ctx.fill(); glow(ctx, mx + mw / 2, by, 120, COL.vid, nod * 0.8);
    ctx.fillStyle = hexA(COL.ink, 0.15 + 0.6 * nod); ctx.fillRect(mx + 80, my + mh - 70, mw - 160, 3);
    ctx.restore();
    txt(ctx, '画面替你动', mx + mw / 2, my + mh + 70, { size: 34, weight: 900, color: COL.vid, align: 'center' });
    txt(ctx, '你想动', 520, my + mh + 70, { size: 34, weight: 900, color: COL.mint, align: 'center' });
    txt(ctx, '≈', 990, 540, { size: 90, weight: 700, fam: FONT.mono, color: COL.ink, align: 'center' });
    // motion curves
    for (const [xx, col] of [[520 - 264, COL.mint], [mx + 56, COL.vid]]) {
      ctx.beginPath(); for (let i = 0; i <= 120; i++) { const tau = t - 2 * TL.T + i / 120 * 2 * TL.T; const v = nodCurve(tau); const px = xx + i * 4.4, py = 880 - v * 60; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
  }
}
