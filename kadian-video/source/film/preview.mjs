// usage: node preview.mjs out.png t1 t2 ...   (renders frames and tiles them 3-wide at 640x360)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
const [out, ...ts] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8765/index.html');
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
const files = [];
const full = process.env.FULL === '1';
for (const [i, tsx] of ts.entries()) {
  const t = tsx.startsWith('b') ? null : parseFloat(tsx);
  const tt = t != null ? t : await page.evaluate(k => bt(parseFloat(k)), tsx.slice(1));
  await page.evaluate(([t, i]) => renderFrame(t, i), [tt, i]);
  const f = `${process.env.TMPDIR || "/tmp"}/kadian_prev_f${i}.png`;
  await page.locator('#c').screenshot({ path: f }); files.push(f);
}
await browser.close();
if (full) { fs.copyFileSync(files[0], out); }
else {
  const cols = 3, n = files.length, rows = Math.ceil(n / cols);
  const args = []; files.forEach(f => args.push('-i', f));
  let filt = files.map((_, i) => `[${i}:v]scale=640:360,drawtext=text='${ts[i]}':x=8:y=8:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`).join(';');
  const layout = files.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|');
  filt += ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${n}:layout=${layout}:fill=black[o]`;
  if (n === 1) filt = `[0:v]scale=640:360[o]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, '-filter_complex', filt, '-map', '[o]', out]);
}
