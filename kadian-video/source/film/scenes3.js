// ============================================================
//  scenes3.js — 04 tension, showcase, balance, summary, reveal, end
// ============================================================
let SNARE = [], SHOW_CUTS = [], ALL_CUTS = [], OFF_CUTS = [];
let DROPB = 0, LF = null, LFc = null;
// the flashback: snapshots of earlier moments, one per beat, drawn from the film itself
const SNAPS = [['hook', 2.1], ['title', 1.2], ['define', 6.2], ['r1', 1.3], ['r1', 16.5], ['demoA', 12.1], ['demoA', 18.1], ['pip', 8.05], ['lab', 12.05], ['r3', 16.1], ['r4', 28.6], ['showcase', 4.1], ['showcase', 12.1], ['summary', 10.2]];
function flashback(ctx, t, t0, t1) {
  const b0 = B(t0), b1 = B(t1), cuts = [];
  let k = b0; while (k < b1 - 1.0 - 1e-6) { cuts.push(k); k += .5; } while (k < b1 - 1e-6) { cuts.push(k); k += .25; }
  let i = 0; for (let j = 0; j < cuts.length; j++) if (B(t) >= cuts[j]) i = j;
  const [name, off] = SNAPS[i % SNAPS.length]; const sc = TL.scenes.find(x => x.name === name); const tau = bt(SB(name) + off);
  const keepF = FRAME_FLASH, keepG = FRAME_GLOW;
  noLight(() => drawScene(LFc, sc, tau)); FRAME_FLASH = keepF; FRAME_GLOW = keepG;
  const lt = t - bt(cuts[i]), z = 1.07 - .07 * E.outE(clamp(lt / .25));
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); ctx.drawImage(LF, 0, 0); ctx.restore();
  ctx.fillStyle = 'rgba(6,5,4,0.18)'; ctx.fillRect(0, 0, W, H);
  const mm = Math.floor(tau / 60), ss = String(Math.floor(tau % 60)).padStart(2, '0');
  chip(ctx, 72, 140, `◀◀  ${mm}:${ss}`, COL.cream, 1, { size: 26, fam: FONT.mono });
  ctx.fillStyle = hexA(COL.cream, .6); ctx.fillRect(72, 1000, (W - 144) * (i + 1) / cuts.length, 3);
  flashCream(.3 * Math.exp(-lt / .06));
}
function initScenes3() {
  const D = DROPB = SB('showcase');
  SNARE = [];
  for (let k = D - 16; k < D - 10; k++) SNARE.push(k);
  for (let k = D - 10; k < D - 6; k += 0.5) SNARE.push(k);
  for (let k = D - 6; k < D - 4; k += 0.25) SNARE.push(k);
  for (let k = D - 4; k < D - 2; k += 0.125) SNARE.push(k);
  // every on-beat cut / transition in the film (for the reveal)
  const set = new Set();
  for (const s of TL.scenes) if (s.b0 > 0) set.add(s.b0);
  const rel = { define: [16], r1: [4, 24, 36, 38, 39], demoA: [2, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], r2: [4, 16], r2b: [8], r3: [4, 12], r4: [4, 30], balance: [16, 24], summary: [4, 6, 8, 10] };
  for (const [n, ks] of Object.entries(rel)) ks.forEach(k => set.add(SB(n) + k));
  const lab = TL.scenes.find(x => x.name === 'lab'); if (lab) lab.trials.forEach(([k]) => { set.add(k); set.add(k + 2); });
  [8, 16, 24, 25, 33].forEach(k => set.add(k));
  HOOK_CUTS.forEach(c => set.add(c.beat));
  for (let k = D; k < D + 16; k++) set.add(k);
  ALL_CUTS = [...set].filter(k => k < TL.total_beats).sort((a, b) => a - b);
  demoInit(TL.scenes.find(x => x.name === 'demoA'));
  LF = mkLayer(); LFc = LF.getContext('2d');
  OFF_CUTS = [...DEMO.A, ...DEMO.SA].map(c => c.beat).filter(k => Math.abs(k - Math.round(k)) > .05);
}

// ------------------------------------------------------------ R4 TENSION (232-264)
SCN.r4 = {
  hud: true, chap: '04 释放',
  hudFn: (t) => 1 - A(t, bt(DROPB - 2) - 0.05, 0.08),
  subs: true,
  cam: (t) => {
    const b = B(t), prog = clamp((b - (DROPB - 28)) / 26); if (b >= DROPB - 2 || b < DROPB - 28) return { z: 1, dx: 0, dy: 0 };
    const hit = pulseList(t, SNARE.filter(k => k <= b), .06); const amt = 2 + 10 * prog * prog * hit;
    return { z: 1 + .06 * prog * prog, dx: (vnoise(t * 31, 5) - .5) * amt, dy: (vnoise(t * 31, 9) - .5) * amt };
  },
  draw(ctx, t, s) {
    if (B(t) >= DROPB - 2) return r4Silence(ctx, t);
    sub(ctx, t, s, [
      { b: s.b0, draw: (c, t) => chapterCard(c, t, s.b0, '04', '张力被释放', 'TENSION  ·  RELEASE', COL.vid) },
      { b: s.b0 + 4, draw: r4Ring, tr: { type: 'zoom', n: 0.9 } },
    ]);
  }
};
TR.r4 = { type: 'shutter', n: 1 };
function r4Ring(ctx, t, s) {
  const b = B(t), k0 = s.b0 + 4, prog = clamp((b - k0) / (DROPB - 2 - k0));
  bgBase(ctx, t, { tint: COL.vid, glow: 0.04 + 0.12 * prog, starLevel: 1 - .6 * prog });
  const past = SNARE.filter(k => k <= b), hit = pulseList(t, past, 0.07);
  const cx = W / 2, cy = 500, r = lerp(330, 240, E.inQ(prog));
  // 96 ticks fill clockwise: the expectation meter
  const n = 96, lit = prog * n;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i / n * TAU; const on = i < lit; const frac = clamp(lit - i);
    const r1 = r + 40, r2 = r + 68 + (on ? 10 * hit : 0);
    const L = on ? LLc : ctx; L.save(); L.globalAlpha = on ? (.45 + .55 * frac) * (prog > .85 ? 1 : .8) : .14;
    L.strokeStyle = on ? (prog > .85 ? COL.hot : COL.vid) : COL.ink; L.lineWidth = 5;
    line(L, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); L.restore();
  }
  // the ring itself tightens: its joints close, it heats up, every roll hit flares it and throws a wave
  const gap = lerp(.32, .02, prog), col = mixHex(COL.ring, COL.hot, prog * .6 + .4 * hit);
  segRing(ctx, cx, cy, r, gap, null, 3 + 5 * prog + 6 * hit, .9, 12, col, prog * 1.2);
  if (hit > .02) ringLine(LLc, cx, cy, r, COL.cream, .6 * hit * (.4 + .6 * prog), 10 + 12 * hit);
  for (const k of past) { const age = t - bt(k); if (age > .45) continue; const u = age / .45; ringLine(LLc, cx, cy, r + 20 + 160 * (.4 + .6 * prog) * (1 - Math.pow(1 - u, 2)), COL.wave, (.25 + .6 * prog) * Math.pow(1 - u, 1.6), 2 + 8 * prog * (1 - u)); }
  glow(ctx, cx, cy, r * 1.7, COL.vid, 0.12 + 0.4 * prog * (0.6 + 0.4 * hit));
  FRAME_GLOW = Math.max(FRAME_GLOW, .5 + .6 * prog + .4 * hit);
  txt(ctx, '期待', cx, cy - 70, { size: 30, weight: 700, color: COL.dim, align: 'center', ls: 8 });
  txt(ctx, Math.round(prog * 100) + '%', cx, cy + 50, { size: 130, weight: 700, fam: FONT.mono, color: prog > 0.85 ? COL.hot : COL.vid, align: 'center' });
  const D = DROPB; const subdiv = b < D - 16 ? '' : b < D - 10 ? '1/4' : b < D - 6 ? '1/8' : b < D - 4 ? '1/16' : '1/32';
  if (subdiv) txt(ctx, '鼓点密度 ' + subdiv, cx, cy + 120, { size: 22, weight: 500, fam: FONT.mono, color: COL.dim, align: 'center', ls: 2 });
  const kw = [['渐强', '渐强', -1, 360], ['越来越密', '越来越', 1, 360], ['静默', '静默', -1, 640], ['拉满', '拉满', 1, 640]];
  kw.forEach(([label, w, side, y]) => {
    const tw = wt('F2', w); const q = A(t, tw - 0.05, 0.4, E.outB); if (q <= 0) return;
    chip(ctx, cx + side * 580, y, label, side < 0 ? COL.cream : COL.vid, clamp(q) * (1 - 0.5 * A(t, tw + 2.5, 0.6)), { align: 'center', size: 34 });
  });
  const y = 900, x0 = 360, x1 = 1560;
  ctx.fillStyle = COL.faint; ctx.fillRect(x0, y, x1 - x0, 1);
  for (const k of SNARE) { const x = lerp(x0, x1, (k - (DROPB - 18)) / 18); const ps = k <= b; const hp = ps ? Math.exp(-(t - bt(k)) / 0.1) : 0; ctx.fillStyle = ps ? hexA(COL.cream, 0.5 + 0.5 * hp) : 'rgba(243,238,228,0.15)'; ctx.fillRect(x - 1, y - 10 - 8 * hp, 2, 20 + 16 * hp); }
  const xs = lerp(x0, x1, 16 / 18), xd = lerp(x0, x1, 1);
  ctx.fillStyle = hexA(COL.ink, 0.06); ctx.fillRect(xs, y - 24, xd - xs, 48); txt(ctx, '静默', (xs + xd) / 2, y + 48, { size: 18, weight: 500, color: COL.dim, align: 'center' });
  ctx.fillStyle = COL.gold; ctx.fillRect(xd - 2, y - 30, 4, 60); txt(ctx, 'DROP', xd, y + 48, { size: 16, weight: 700, fam: FONT.mono, color: COL.gold, align: 'center', ls: 2 });
  if (b >= DROPB - 18) { const xp = lerp(x0, x1, (b - (DROPB - 18)) / 18); ctx.fillStyle = COL.vid; circle(ctx, xp, y, 6); ctx.fill(); }
  const v = prog * prog * 0.55; if (v > 0.01) { const g = ctx.createRadialGradient(cx, cy, 200, cx, cy, 1100); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${v})`); ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80); }
}
// two beats of silence: the ring folds into a point that breathes, then draws in before the drop
function r4Silence(ctx, t) {
  ctx.fillStyle = '#000'; ctx.fillRect(-40, -40, W + 80, H + 80);
  const age = t - bt(DROPB - 2), cx = W / 2, cy = 500;
  const col = clamp(age / (.5 * TL.T)); if (col < 1) ringLine(ctx, cx, cy, lerp(240, 6, E.inC(col)), COL.ring, .9 * (1 - col) + .15, 3 * (1 - col) + 1);
  const breathe = Math.sin(TAU * .9 * age), pre = A(t, bt(DROPB) - 0.3, 0.3, E.inE);
  circle(ctx, cx, cy - 20 * pre, 4 + 1.2 * breathe + 5 * pre); ctx.fillStyle = COL.cream; ctx.fill();
  glow(ctx, cx, cy - 20 * pre, 30 + 120 * pre, COL.ring, .25 + .6 * pre);
}

// ------------------------------------------------------------ SHOWCASE (264-280): the release, played on the ring
const SHOW_WORDS = { 4: ['预测', 'gold'], 5: ['绑定', 'aud'], 6: ['律动', 'mint'], 7: ['释放', 'vid'] };
SCN.showcase = {
  hud: false, ruler: false,
  cam: (t) => {
    const D = DROPB, b = B(t), k = Math.floor(b), lt = t - bt(k); const big = k === D ? 22 : k % 4 === 0 ? 12 : 5;
    const [dx, dy] = shakeOff(t, bt(k), big, .08);
    return { z: barPush(t, .035) + .045 * Math.exp(-lt / .12), dx, dy };
  },
  draw(ctx, t, s) {
    const D = DROPB, b = B(t), k = Math.floor(b), lt = t - bt(k), age = t - bt(D);
    bgBase(ctx, t, { tint: COL.ring, glow: .1 + .1 * hitEnv('kick', t, .2) });
    const closer = b >= D + 8, cx = W / 2, cy = 520;
    const grow = E.outB(clamp(age / .16));
    const word = SHOW_WORDS[k - D];
    const tint = word ? COL[word[1]] : null;
    // composition changes every four beats: a wider ring, then a closer doubled one, then the ring with the title
    const R0 = k < D + 4 ? 360 : k < D + 8 ? 300 : k < D + 12 ? 420 : 340;
    const h = haloRing(ctx, t, cx, cy, R0, { grow, since: bt(D) - .05, halo: .1, inner: closer, nt: 24, n: closer ? 16 : 12, dot: !SHOW_WORDS[k - D] && k < D + 12 });
    if (tint) { ringLine(LLc, h.x, h.y, h.R, tint, .8 * Math.exp(-lt / .25), 14); glow(ctx, h.x, h.y, h.R * 2, tint, .25 * Math.exp(-lt / .3)); }
    slash(t, h.y, { since: bt(D) - .05, double: closer, min: .45 });
    // a ring of light dots in the closer bars: one per eighth note steps around
    if (closer && k < D + 12) {
      const b2 = B(t) * 2, idx = Math.floor(b2), lit = Math.exp(-(b2 - idx) / .35);
      for (let i = 0; i < 24; i++) { const a = -Math.PI / 2 + i * TAU / 24, on = ((idx % 24) + 24) % 24 === i ? lit : 0; const rr2 = h.R + 120; circle(ctx, h.x + rr2 * Math.cos(a), h.y + rr2 * Math.sin(a), 5 + 7 * on); ctx.fillStyle = on > .05 ? COL.cream : hexA(COL.ring, .35); ctx.fill(); }
    }
    // every downbeat throws three concentric waves
    if (lt < .7 && k % 2 === 0) for (let i = 0; i < 3; i++) { const u = clamp((lt - i * .05) / .65); if (u <= 0) continue; ringLine(LLc, h.x, h.y, h.R + 30 + (500 + i * 120) * (1 - Math.pow(1 - u, 2)), COL.wave, (k % 4 === 0 ? .8 : .45) * Math.pow(1 - u, 1.7), 3 + 8 * (1 - u)); }
    burst(cx, cy, age, 1.2, 2.4, 200, 17);
    if (k === D + 8) burst(cx, cy, lt, .7, 1.6, 90, 23);
    if (k === D + 12) burst(cx, cy, lt, .9, 1.8, 120, 29);
    // the words land inside the ring, one per beat
    if (word) {
      const e = 1.3 - .3 * E.outB(clamp(lt / .2));
      ctext(ctx, word[0], h.x, h.y + 58, { size: 170, weight: 900, align: 'center', ls: 20, color: COL.hot }, () => ({ s: e }));
      txt(LLc, word[0], h.x, h.y + 58, { size: 170, weight: 900, align: 'center', ls: 20, color: tint, alpha: .4 * Math.exp(-lt / .3) });
    }
    if (k >= D + 12) {
      const e = 1.25 - .25 * E.outB(clamp((t - bt(D + 12)) / .22));
      ctext(ctx, '卡点', h.x, h.y + 70, { size: 200, weight: 900, align: 'center', ls: 18, color: COL.hot }, () => ({ s: e }));
    }
    flashCream((k === D ? 1 : k % 4 === 0 ? .45 : k === D + 12 ? .5 : .12) * Math.exp(-lt / (k === D ? .1 : .06)));
      }
};
TR.showcase = { type: 'flash', n: 0.3, amt: 0 };

// ------------------------------------------------------------ BALANCE (280-320)
SCN.balance = {
  hud: true, chap: '分寸', push: .01,
  draw(ctx, t, s) {
    sub(ctx, t, s, [
      { b: s.b0, draw: balEvery },
      { b: s.b0 + 16, draw: balCurve, tr: { type: 'wipe', n: 0.9, color: COL.gold } },
      { b: s.b0 + 24, draw: balPro, tr: { type: 'slideUp', n: 0.9 } },
    ]);
  }
};
TR.balance = { type: 'slide', n: 0.9 };
function seqRow(ctx, t, y, pattern, k0, opts = {}) {
  // pattern: array of 16: 0 none, 1 hit, 2 strong, 3 rest(dashed); plus opts.sync = [half-beat positions]
  const cw = 84, gap = 14, n = 16, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2; const b = B(t);
  const step = ((Math.floor(b) - k0) % 16 + 16) % 16;
  const loopStart = k0 + Math.floor((Math.floor(b) - k0) / 16) * 16;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap); const v = pattern[i]; const q = A(t, bt(opts.inBeat || k0) + i * 0.02, 0.35, E.outB);
    ctx.save(); ctx.globalAlpha = clamp(q);
    const cur = i === step && b >= k0; const hp = cur ? pulse(t, 0.2) : 0;
    rr(ctx, x, y - cw / 2, cw, cw, 10);
    if (v === 3) { ctx.setLineDash([6, 6]); ctx.strokeStyle = hexA(COL.ink, 0.35); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    else if (v > 0) { ctx.fillStyle = v === 2 ? COL.gold : COL.vid; ctx.globalAlpha *= 0.55 + 0.45 * hp; ctx.fill(); if (hp > 0.02) glow(ctx, x + cw / 2, y, 90, v === 2 ? COL.gold : COL.vid, hp); }
    else { ctx.fillStyle = 'rgba(243,238,228,0.06)'; ctx.fill(); }
    if (i % 4 === 0) txt(ctx, String(i / 4 + 1), x + 8, y - cw / 2 - 12, { size: 16, weight: 400, fam: FONT.mono, color: COL.dim });
    ctx.restore();
  }
  (opts.sync || []).forEach(pos => {
    const x = x0 + pos * (cw + gap) - gap / 2; const kk = loopStart + pos; const hp = b >= kk ? Math.exp(-(t - bt(kk)) / 0.2) : 0;
    ctx.save(); ctx.globalAlpha = A(t, bt(opts.syncIn || k0), 0.4, E.outB);
    rr(ctx, x - 20, y - cw / 2 - 6, 40, cw + 12, 8); ctx.fillStyle = COL.aud; ctx.globalAlpha *= 0.6 + 0.4 * hp; ctx.fill(); if (hp > 0.02) glow(ctx, x, y, 90, COL.aud, hp);
    ctx.restore();
  });
  // playhead
  if (b >= k0) { const fx = (b - loopStart); const x = x0 + fx * (cw + gap) - gap / 2; ctx.fillStyle = COL.ink; ctx.fillRect(x - 1, y - cw / 2 - 26, 2, cw + 52); }
  return { x0, cw, gap };
}
function balEvery(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.vid, glow: 0.06 });
  const k0 = s.b0, b = B(t);
  ctext(ctx, '每一拍都切', W / 2, 270, { size: 76, weight: 900, align: 'center' }, i => { const q = A(t, wt('G2', '每') - 0.1 + 0.04 * i, 0.4, E.outE); return { a: q, dy: 24 * (1 - q) }; });
  const head = A(t, bt(k0), 0.5); txt(ctx, '但卡点，并不是越密越好', W / 2, 270, { size: 64, weight: 900, align: 'center', alpha: head * (1 - A(t, wt('G2', '每') - 0.3, 0.2)) });
  seqRow(ctx, t, 430, new Array(16).fill(1), k0, { inBeat: k0 });
  // habituation chart
  const tH = wt('G2', '习惯'), tN = wt('G2', '惊喜'); const ea = A(t, tH - 0.3, 0.6, E.outC);
  if (ea > 0) {
    const x0 = 520, x1 = 1400, y0 = 820, y1 = 600; ctx.save(); ctx.globalAlpha = ea;
    ctx.fillStyle = COL.faint; ctx.fillRect(x0, y0, x1 - x0, 2); ctx.fillRect(x0, y1, 2, y0 - y1);
    txt(ctx, '惊喜感', x0 - 20, y1 + 10, { size: 24, weight: 800, color: COL.vid, align: 'right' });
    txt(ctx, '重复次数 →', x1, y0 + 36, { size: 20, weight: 500, color: COL.dim, align: 'right' });
    const nHits = clamp((B(t) - k0) / 22) ;
    ctx.beginPath(); for (let i = 0; i <= 200; i++) { const u = i / 200; if (u > nHits) break; const y = y0 - (y0 - y1) * Math.exp(-u * 4.2); const x = lerp(x0, x1, u); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = COL.vid; ctx.lineWidth = 4; ctx.stroke();
    const ux = lerp(x0, x1, nHits), uy = y0 - (y0 - y1) * Math.exp(-nHits * 4.2); circle(ctx, ux, uy, 8); ctx.fillStyle = COL.ink; ctx.fill();
    const en = A(t, tN - 0.1, 0.4, E.outB); if (en > 0) chip(ctx, x1, y1 + 10, '惊喜 ≈ 0', COL.off, clamp(en), { align: 'right', size: 28 });
    txt(ctx, '习惯化 habituation', x0 + 20, y1 + 6, { size: 18, weight: 400, fam: FONT.mono, color: COL.dim });
    ctx.restore();
  }
}
function balCurve(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.gold, glow: 0.07 });
  const k0 = s.b0 + 16, X0 = 420, X1 = 1500, Y0 = 820, Y1 = 330;
  const tFound = wt('G2', '最让'), tBal = wt('G2', '平衡'), tSure = wt('G2', '确定');
  const e = A(t, bt(k0), 0.6, E.outC);
  ctx.save(); ctx.globalAlpha = e;
  ctx.fillStyle = COL.faint; ctx.fillRect(X0, Y0, X1 - X0, 2); ctx.fillRect(X0, Y1 - 30, 2, Y0 - Y1 + 30);
  txt(ctx, '愉悦', X0 - 20, Y1, { size: 28, weight: 900, color: COL.gold, align: 'right' });
  txt(ctx, '可预测性 →', X1, Y0 + 44, { size: 24, weight: 700, color: COL.ink, align: 'right' });
  txt(ctx, '全是意外', X0, Y0 + 44, { size: 22, weight: 500, color: COL.dim });
  ctx.restore();
  const f = u => Math.exp(-Math.pow((u - 0.56) / 0.24, 2));
  const dr = A(t, bt(k0) + 0.2, TL.T * 3, E.ioC);
  ctx.beginPath(); for (let i = 0; i <= 300; i++) { const u = i / 300; if (u > dr) break; const x = lerp(X0, X1, u), y = Y0 - (Y0 - Y1) * f(u); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 4; ctx.stroke();
  // endpoint labels
  const el = A(t, bt(k0 + 2), 0.5, E.outB);
  if (el > 0) {
    chip(ctx, X1, Y0 - (Y0 - Y1) * f(1) - 50, '每拍都切 = 完全可预测', COL.vid, clamp(el), { align: 'right', size: 22 });
    chip(ctx, X0 + 10, Y0 - (Y0 - Y1) * f(0) - 50, '乱切 = 全是意外', COL.off, clamp(el), { size: 22 });
  }
  // moving dot to the sweet spot
  const mv = A(t, Math.max(tSure - 0.4, bt(k0 + 3)), 1.4, E.ioC);
  const u = lerp(0.97, 0.56, mv); const x = lerp(X0, X1, u), y = Y0 - (Y0 - Y1) * f(u);
  if (el > 0) { circle(ctx, x, y, 14); ctx.fillStyle = COL.gold; ctx.fill(); glow(ctx, x, y, 90, COL.gold, 0.4 + 0.5 * mv); }
  const eb = A(t, tBal - 0.1, 0.45, E.outB);
  if (eb > 0) {
    ctx.save(); ctx.globalAlpha = clamp(eb); txt(ctx, '刚刚好', x, y - 70, { size: 48, weight: 900, color: COL.gold, align: 'center' });
    txt(ctx, '确定  ×  意外', x, y - 34, { size: 22, weight: 500, fam: FONT.sans, color: COL.ink, align: 'center', ls: 2 });
    ctx.fillStyle = hexA(COL.gold, 0.5); ctx.fillRect(x - 1, y + 16, 2, Y0 - y - 16); ctx.restore();
  }
  cite(ctx, t, 'Gold et al., 2019 · J. Neurosci. / Cheung et al., 2019 · Curr. Biol.', tFound);
}
function balPro(ctx, t, s) {
  bgBase(ctx, t, { tint: COL.gold, glow: 0.07 });
  const k0 = s.b0 + 24, b = B(t);
  ctext(ctx, '有稳有变', W / 2, 290, { size: 100, weight: 900, align: 'center', ls: 16 }, i => { const q = A(t, bt(k0) + 0.05 * i, 0.4, E.outE); return { a: q, s: 1.3 - 0.3 * q, color: i < 2 ? COL.gold : COL.ink }; });
  // pattern: strong on downbeats, hits, syncopation, rests at end
  const pat = [2, 0, 1, 0, 2, 0, 1, 1, 2, 0, 1, 0, 2, 0, 3, 3];
  const tS = wt('G3', '切分'), tR = wt('G3', '留白'), tH = wt('G3', '重拍'), tU = wt('G3', '意外');
  const g = seqRow(ctx, t, 500, pat, k0, { inBeat: k0 + 0.5, sync: [5.5, 10.5], syncIn: B(tS) - 0.1 });
  const lab = (text, x, col, tt, y = 620) => { const q = A(t, tt - 0.05, 0.4, E.outB); if (q > 0) chip(ctx, x, y, text, col, clamp(q), { align: 'center', size: 26, fill: col !== COL.ink }); };
  const cx = i => g.x0 + i * (g.cw + g.gap) + g.cw / 2;
  lab('踩稳重拍', cx(4), COL.gold, tH);
  lab('切分', cx(5.5) - g.cw / 2 - g.gap / 2 + g.cw / 2, COL.aud, tS, 380);
  lab('留白', (cx(14) + cx(15)) / 2, COL.ink, tR);
  const eu = A(t, tU - 0.05, 0.45, E.outB);
  if (eu > 0) txt(ctx, '→ 一点小意外，让大脑保持期待', W / 2, 760, { size: 34, weight: 700, color: COL.ink, align: 'center', alpha: clamp(eu) });
}

// ------------------------------------------------------------ SUMMARY (320-332)
// ------------------------------------------------------------ SUMMARY (320-332): the concept ring lights up, one reason every two beats
SCN.summary = {
  hud: true, chap: '总结',
  cam: (t) => ({ z: barPush(t, .02), dx: 0, dy: 0 }),
  draw(ctx, t, s) {
    bgBase(ctx, t, { tint: COL.ring, glow: 0.08 });
    const k0 = s.b0;
    ctext(ctx, '卡点，为什么爽？', W / 2, 190, { size: 84, weight: 900, align: 'center' }, i => { const q = A(t, bt(k0) + 0.04 * i, 0.4, E.outE); return { a: q, s: 1.3 - 0.3 * q }; });
    conceptRing(ctx, t, { appear: [k0 + .5, k0 + .75, k0 + 1, k0 + 1.25], fill: [k0 + 4, k0 + 6, k0 + 8, k0 + 10], labels: true });
    // the centre: a small halo that answers the drums
    haloRing(ctx, t, QUAD.cx, QUAD.cy, 70, { grow: E.outB(clamp((t - bt(k0)) / .3)), ticks: false, waves: false, push: false, width: 3, gain: .8 });
    for (const kk of [k0 + 4, k0 + 6, k0 + 8, k0 + 10]) { const a = t - bt(kk); if (a >= 0) flashCream(.16 * Math.exp(-a / .07)); }
  }
};
TR.summary = { type: 'wipe', n: 0.9, color: COL.gold };

// ------------------------------------------------------------ REVEAL (332-352)
SCN.reveal = {
  hud: true, chap: '总结', push: .01,
  draw(ctx, t, s) {
    bgBase(ctx, t, { tint: COL.ring, glow: 0.07 });
    const k0 = s.b0, b = B(t);
    // the concept ring leaves
    const out = A(t, bt(k0), 0.45, E.inQ);
    if (out < 1) {
      ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(0, -300 * out); zoomAround(ctx, W / 2, 500, 1 - 0.2 * out);
      ctext(ctx, '卡点，为什么爽？', W / 2, 190, { size: 84, weight: 900, align: 'center' }, () => ({}));
      conceptRing(ctx, t, { appear: [k0 - 12, k0 - 12, k0 - 12, k0 - 12], fill: [k0 - 8, k0 - 6, k0 - 4, k0 - 2], labels: true });
      ctx.restore();
    }
    // flashback through the film's own cuts, then the proof on the timeline
    const tFb0 = bt(k0 + 1), tFb1 = wt('H3', '都');
    if (t >= tFb0 && t < tFb1) return flashback(ctx, t, tFb0, tFb1);
    const X0 = 160, X1 = 1760, Y = 560, TB = TL.total_beats;
    const ein = A(t, tFb1, 0.5, E.outE) * (t >= tFb1 ? 1 : 0);
    const tTr = tFb1, tBeat = wt('H3', '拍子'), tQ = wt('H3', '注意');
    ctx.save(); ctx.globalAlpha = ein;
    txt(ctx, '这条视频的时间轴', X0, Y - 170, { size: 40, weight: 900 });
    txt(ctx, `0:00 — ${Math.floor(bt(TB) / 60)}:${String(Math.round(bt(TB) % 60)).padStart(2, '0')}  ·  ${TB} 拍`, X0, Y - 130, { size: 20, weight: 400, fam: FONT.mono, color: COL.dim, ls: 1 });
    // beat grid
    for (let k = 0; k <= TB; k++) { const x = lerp(X0, X1, k / TB); ctx.fillStyle = hexA(COL.aud, k % 4 === 0 ? 0.32 : 0.13); ctx.fillRect(x - 0.5, Y - 60, 1, 120); }
    ctx.restore();
    // cut markers sweep in
    const sweep = t < tFb1 ? 0 : A(t, tTr, Math.max(.6, tBeat - tTr + .3), E.ioC);
    let shown = 0;
    for (const k of ALL_CUTS) { const u = k / TB; if (u > sweep) break; shown++; const x = lerp(X0, X1, u); const hp = Math.exp(-Math.max(0, (sweep - u)) * 30);
      ctx.fillStyle = hexA(COL.vid, 0.85); ctx.fillRect(x - 1.5, Y - 46 - 14 * hp, 3, 92 + 28 * hp); if (hp > 0.3) glow(ctx, x, Y, 40, COL.vid, hp * 0.6); }
    for (const k of OFF_CUTS) { const u = k / TB; if (u > sweep) break; const x = lerp(X0, X1, u); ctx.fillStyle = COL.off; ctx.fillRect(x - 1.5, Y + 50, 3, 26); }
    if (sweep > 0 && sweep < 1) { const x = lerp(X0, X1, sweep); ctx.fillStyle = COL.ink; ctx.fillRect(x - 1, Y - 80, 2, 160); }
    const eS = A(t, tBeat, 0.5, E.outB);
    ctx.save(); ctx.globalAlpha = ein;
    txt(ctx, `转场 / 切换  ${shown}`, X0, Y + 130, { size: 30, weight: 800, fam: FONT.mono, color: COL.vid });
    if (eS > 0) chip(ctx, X1, Y + 120, '全部落在拍点上 ✓', COL.gold, clamp(eS), { align: 'right', size: 30, fill: true });
    if (eS > 0) txt(ctx, '（除了 A 组那段“反面教材”）', X1, Y + 180, { size: 20, weight: 500, color: COL.off, align: 'right', alpha: clamp(eS) });
    ctx.restore();
    // magnifier
    const em = A(t, tBeat + 0.6, 0.7, E.outE);
    if (em > 0) {
      const mx = 860, mw = 900, my = 760, mh = 120, kA = DROPB, kB = DROPB + 16; ctx.save(); ctx.globalAlpha = clamp(em);
      const sx0 = lerp(X0, X1, kA / TB), sx1 = lerp(X0, X1, kB / TB);
      ctx.strokeStyle = COL.faint; ctx.lineWidth = 1.5; ctx.strokeRect(sx0, Y - 70, sx1 - sx0, 140);
      line(ctx, sx0, Y + 70, mx, my); line(ctx, sx1, Y + 70, mx + mw, my);
      rr(ctx, mx, my, mw, mh, 10); ctx.fillStyle = '#100d09'; ctx.fill(); ctx.stroke();
      for (let k = kA; k <= kB; k++) { const x = lerp(mx + 20, mx + mw - 20, (k - kA) / (kB - kA)); ctx.fillStyle = hexA(COL.aud, 0.6); ctx.fillRect(x - 1, my + 14, 2, mh - 28); ctx.fillStyle = COL.vid; ctx.fillRect(x - 4, my + 34, 8, mh - 68); }
      txt(ctx, '放大：误差 < 1 帧', mx, my - 14, { size: 20, weight: 500, fam: FONT.sans, color: COL.dim });
      ctx.restore();
    }
    const eq = A(t, tQ - 0.1, 0.45, E.outE);
    if (eq > 0) {
      ctx.save(); ctx.globalAlpha = clamp(eq); ctx.fillStyle = 'rgba(6,5,4,0.8)'; ctx.fillRect(0, 0, W, H);
      ctext(ctx, '你注意到了吗？', W / 2, 560, { size: 120, weight: 900, align: 'center' }, i => { const q = A(t, tQ - 0.1 + 0.04 * i, 0.4, E.outE); return { a: q, s: 1.25 - 0.25 * q }; });
      const p = pulse(t, 0.2); ctx.fillStyle = COL.gold; ctx.fillRect(W / 2 - 1, 620, 2, 60 + 30 * p);
      ctx.restore();
    }
  }
};

// ------------------------------------------------------------ END (352-360): the last hit
SCN.end = {
  hud: false, ruler: false, subs: true,
  cam: (t, s) => { const [dx, dy] = shakeOff(t, bt(s.b0), 12, .09); return { z: 1 + .03 * clamp((B(t) - s.b0) / 8), dx, dy }; },
  draw(ctx, t, s) {
    bgBase(ctx, t, { tint: COL.ring, glow: 0.09 });
    const k0 = s.b0, age = t - bt(k0), fo = A(t, bt(s.b1) - 1.3, 1.2, E.inQ);
    const cx = W / 2, cy = 430;
    ctx.save(); ctx.globalAlpha = 1 - fo;
    const h = haloRing(ctx, t, cx, cy, 250, { grow: E.outB(clamp(age / .16)), since: bt(k0) - .05, halo: .08, inner: true, nt: 24, dot: false });
    if (age < 1) { const u = age; ringLine(LLc, cx, cy, 270 + 800 * (1 - Math.pow(1 - u, 2)), COL.wave, Math.pow(1 - u, 1.6), 4 + 14 * (1 - u)); }
    burst(cx, cy, age, 1, 2.4, 180, 41);
    const sc = 1.2 - .2 * E.outB(clamp(age / .22));
    ctext(ctx, '卡点', cx, cy + 62, { size: 170, weight: 900, align: 'center', ls: 16, color: COL.hot }, () => ({ s: sc, a: clamp(age / .02 + .01) }));
    ctext(ctx, '为什么这么爽', cx, 830, { size: 72, weight: 900, align: 'center', ls: 10 }, i => { const q = A(t, bt(k0) + .2 + 0.04 * i, 0.4, E.outE); return { a: q, dy: 20 * (1 - q) }; });
    txt(ctx, '预测  ·  绑定  ·  律动  ·  释放', cx, 900, { size: 28, weight: 500, color: COL.gold, align: 'center', ls: 6, alpha: A(t, bt(k0 + 1), .5) });
    ctx.restore();
    flashCream(.85 * Math.exp(-age / .08));
    if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${fo})`; ctx.fillRect(-60, -60, W + 120, H + 120); }
  }
};
TR.end = { type: 'flash', n: 0.3, amt: 0 };
