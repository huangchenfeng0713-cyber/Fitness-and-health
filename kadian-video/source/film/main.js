// ============================================================
//  main.js — scene sequencing, transitions, frame entry point
// ============================================================
let CTX, LA, LB, LAc, LBc, SCENES;

function sceneIdx(t) { const b = B(t); for (let i = 0; i < SCENES.length; i++) if (b < SCENES[i].b1) return i; return SCENES.length - 1; }
function drawScene(ctx, s, t) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
  if (ctx === CTX) camApply(ctx);
  s.lt = t - bt(s.b0); s.lb = B(t) - s.b0;
  SCN[s.name].draw(ctx, t, s); ctx.restore();
}
// word timing: absolute time of substring `sub` in narration line `id`
function wt(id, sub, occ = 0) {
  const n = TL.narr.find(x => x.id === id); if (!n) return 0;
  let idx = -1; for (let k = 0; k <= occ; k++) idx = n.text.indexOf(sub, idx + 1);
  if (idx < 0) return n.words[0].t;
  const chars = [...n.text.slice(0, idx)].length;
  for (let j = chars; j < n._times.length; j++) if (n._times[j] != null) return snap8(n._times[j]);
  return snap8(n.end);
}
// visuals tied to a spoken word land on the nearest eighth-note of the music (within ~130 ms of the word)
function snap8(tw) { const k = Math.round(B(tw) * 2) / 2; let ts = bt(k); if (ts - tw > 0.133) ts = bt(k - .5); return ts; }
function lineT(id) { const n = TL.narr.find(x => x.id === id); return n ? [n.words[0].t, n.end] : [0, 0]; }

function compose(ctx, tr, p, la, lb) {
  const e = E.outE(clamp(p));
  ctx.save();
  switch (tr.type) {
    case 'wipe': {
      ctx.drawImage(la, 0, 0);
      const sl = 260, fx = lerp(-sl, W + sl, e);
      ctx.save(); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(fx + sl, 0); ctx.lineTo(fx - sl, H); ctx.lineTo(-10, H); ctx.closePath(); ctx.clip();
      ctx.drawImage(lb, 0, 0); ctx.restore();
      if (p < 1) { ctx.strokeStyle = tr.color || COL.gold; ctx.lineWidth = 6; line(ctx, fx + sl, 0, fx - sl, H); }
      break;
    }
    case 'iris': {
      ctx.drawImage(la, 0, 0);
      const cx = tr.cx || W / 2, cy = tr.cy || H / 2, r = e * Math.hypot(W, H) * 0.62;
      ctx.save(); circle(ctx, cx, cy, r); ctx.clip(); ctx.drawImage(lb, 0, 0); ctx.restore();
      if (p < 1) { ctx.strokeStyle = tr.color || COL.ink; ctx.lineWidth = 4 * (1 - e) + 1; circle(ctx, cx, cy, r); ctx.stroke(); }
      break;
    }
    case 'slide': {
      const dir = tr.dir || 1;
      ctx.drawImage(la, -dir * W * e, 0); ctx.drawImage(lb, dir * W * (1 - e), 0);
      break;
    }
    case 'slideUp': {
      ctx.drawImage(la, 0, -H * e); ctx.drawImage(lb, 0, H * (1 - e));
      break;
    }
    case 'shutter': {
      ctx.drawImage(la, 0, 0); const n = 9, bh = H / n;
      for (let i = 0; i < n; i++) {
        const q = E.outE(clamp(p * 1.6 - i * 0.06)); const dx = (1 - q) * W * (i % 2 ? 1 : -1);
        ctx.save(); ctx.beginPath(); ctx.rect(0, i * bh, W, bh + 1); ctx.clip(); ctx.drawImage(lb, dx, 0); ctx.restore();
      }
      break;
    }
    case 'zoom': {
      ctx.save(); ctx.globalAlpha = 1 - e; const s1 = 1 + 0.5 * e; ctx.translate(W / 2, H / 2); ctx.scale(s1, s1); ctx.drawImage(la, -W / 2, -H / 2); ctx.restore();
      ctx.save(); ctx.globalAlpha = e; const s2 = 0.9 + 0.1 * e; ctx.translate(W / 2, H / 2); ctx.scale(s2, s2); ctx.drawImage(lb, -W / 2, -H / 2); ctx.restore();
      break;
    }
    case 'flash': default: {
      const s2 = 1 + 0.05 * (1 - e); ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s2, s2); ctx.drawImage(lb, -W / 2, -H / 2); ctx.restore();
      const f = Math.pow(1 - clamp(p * 2.2), 2) * (tr.amt == null ? 0.7 : tr.amt);
      if (f > 0.005) { ctx.fillStyle = hexA(COL.cream, f); ctx.fillRect(-60, -60, W + 120, H + 120); }
    }
  }
  ctx.restore();
}
function preEffect(ctx, tr, q, la) {    // q 0..1 approaching the cut
  ctx.save();
  if (tr.pre_type === 'zoomInto') {
    const z = lerp(1, tr.z || 7, E.inE(q)); ctx.translate(tr.fx, tr.fy); ctx.scale(z, z); ctx.translate(-tr.fx, -tr.fy);
    ctx.drawImage(la, 0, 0);
  } else if (tr.pre_type === 'collapse') {
    // the whole picture folds into a bright point over the last beat (the breath before a drop)
    const z = Math.max(.002, 1 - E.inC(q)); ctx.save(); ctx.globalAlpha = 1 - E.inQ(q) * .5;
    ctx.translate(tr.fx, tr.fy); ctx.scale(z, z); ctx.translate(-tr.fx, -tr.fy); ctx.drawImage(la, 0, 0); ctx.restore();
    const r = 3 + 6 * E.inC(q); circle(ctx, tr.fx, tr.fy, r); ctx.fillStyle = COL.cream; ctx.fill(); glow(ctx, tr.fx, tr.fy, 40 + 140 * E.inC(q), COL.ring, .4 + .6 * q);
  } else if (tr.pre_type === 'fadeBlack') {
    ctx.drawImage(la, 0, 0); ctx.fillStyle = `rgba(0,0,0,${E.inC(q)})`; ctx.fillRect(0, 0, W, H);
  } else ctx.drawImage(la, 0, 0);
  ctx.restore();
}

function hudAlpha(t, i) {
  const s = SCENES[i], on = SCN[s.name].hud; const prev = SCENES[i - 1], next = SCENES[i + 1];
  let a = on ? 1 : 0;
  if (on && prev && !SCN[prev.name].hud) a *= A(t, bt(s.b0) + 0.05, 0.35, E.outC);
  if (on && next && !SCN[next.name].hud) a *= 1 - A(t, bt(next.b0) - 0.3, 0.25, E.inQ);
  if (SCN[s.name].hudFn) a *= SCN[s.name].hudFn(t, s);
  return a;
}

function camApply(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(W / 2 + CAM.dx, H / 2 + CAM.dy); ctx.scale(CAM.z, CAM.z); ctx.translate(-W / 2, -H / 2); }
function renderFrame(t, frame = 0) {
  const tv = t + VIS_LEAD;
  const ctx = CTX; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
  LLc.setTransform(1, 0, 0, 1, 0, 0); LLc.clearRect(0, 0, W, H); FRAME_GLOW = .5; FRAME_FLASH = 0; FRAME_FLASH_COL = null;
  const i = sceneIdx(tv), s = SCENES[i], next = SCENES[i + 1], prev = SCENES[i - 1];
  const sc = SCN[s.name]; s.lt = tv - bt(s.b0); s.lb = B(tv) - s.b0;
  FRAME_T = tv;
  CAM = sc.cam ? sc.cam(tv, s) : { z: sc.push ? barPush(tv, sc.push) + sc.push * .55 * pulse(tv, .11) : 1, dx: 0, dy: 0 };
  const trN = next && TR[next.name], trS = TR[s.name];
  if (trN && trN.pre && tv >= bt(next.b0) - trN.pre * TL.T) {
    noLight(() => drawScene(LAc, s, tv)); const q = (tv - (bt(next.b0) - trN.pre * TL.T)) / (trN.pre * TL.T);
    camApply(ctx); preEffect(ctx, trN, q, LA);
  } else if (trS && prev && trS.n && tv < bt(s.b0) + trS.n * TL.T) {
    const p = (tv - bt(s.b0)) / (trS.n * TL.T);
    if (trS.type === 'flash') { drawScene(LBc, s, tv); camApply(ctx); compose(ctx, trS, p, null, LB); }
    else { noLight(() => drawScene(LAc, prev, tv)); drawScene(LBc, s, tv); camApply(ctx); compose(ctx, trS, p, LA, LB); }
  } else {
    drawScene(ctx, s, tv);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  applyLight(ctx);
  if (FRAME_FLASH > .003) { ctx.fillStyle = hexA(FRAME_FLASH_COL || COL.cream, Math.min(1, FRAME_FLASH)); ctx.fillRect(0, 0, W, H); }
  const ha = hudAlpha(tv, i);
  drawHUD(ctx, tv, SCN[s.name], ha);
  drawRuler(ctx, tv, ha * (SCN[s.name].ruler === false ? 0 : 1));
  drawSubs(ctx, t, SCN[s.name].subs === false ? 0 : 1);
  post(ctx, tv, frame);
}

async function boot() {
  TL = await (await fetch('timeline.json')).json();
  const meta = await (await fetch('audio_data.json')).json();
  const buf = new Uint8Array(await (await fetch('audio_data.bin')).arrayBuffer());
  const wl = meta.wave_len, el = meta.env_len;
  AD = { meta, wave: buf.subarray(0, wl), env: buf.subarray(wl, wl + 5 * el), spec: buf.subarray(wl + 5 * el) };
  SCENES = TL.scenes;
  prepSubs();
  // font preload: every CJK char used anywhere
  let all = TL.narr.map(n => n.text).join('');
  for (const f of ['engine.js', 'shots.js', 'scenes.js', 'scenes2.js', 'scenes3.js', 'main.js']) all += await (await fetch(f)).text();
  const uniq = [...new Set([...all])].join('');
  const fams = ['"Noto Sans SC Variable"', '"Noto Serif SC Variable"', '"JetBrains Mono"', '"Space Grotesk Variable"'];
  const loads = [];
  for (const f of fams) for (const w of [400, 700, 900]) loads.push(document.fonts.load(`${w} 40px ${f}`, uniq));
  await Promise.all(loads); await document.fonts.ready;
  const cv = document.getElementById('c'); CTX = cv.getContext('2d');
  LA = mkLayer(); LB = mkLayer(); LAc = LA.getContext('2d'); LBc = LB.getContext('2d');
  initPost();
  initHalo(await (await fetch('hits.json')).json());
  if (typeof initScenes === 'function') initScenes();
  window.DURATION = bt(TL.total_beats);
  window.READY = true;
}
window.renderFrame = renderFrame;
boot();
