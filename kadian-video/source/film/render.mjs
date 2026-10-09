// usage: node render.mjs <outdir> <fps> <workers> [startSec endSec]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'child_process';
import fs from 'fs';
const [outdir, fpsS, wS, sS, eS] = process.argv.slice(2);
const fps = parseInt(fpsS), NW = parseInt(wS);
fs.mkdirSync(outdir, { recursive: true });
const AUDIO_DUR = parseFloat(process.env.DUR || '191.87');
const f0 = sS ? Math.round(parseFloat(sS) * fps) : 0;
const f1 = eS ? Math.round(parseFloat(eS) * fps) : Math.ceil(AUDIO_DUR * fps);
const per = Math.ceil((f1 - f0) / NW);
const crf = process.env.CRF || '14';
async function worker(w) {
  const a = f0 + w * per, b = Math.min(f1, a + per); if (a >= b) return;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('[pageerror]', w, e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(() => window.READY === true, null, { timeout: 180000 });
  const cdp = await page.context().newCDPSession(page);
  const out = `${outdir}/chunk_${String(w).padStart(2, '0')}.mp4`;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', (process.env.PRESET || 'slow'), '-tune', 'animation', '-crf', crf, '-pix_fmt', 'yuv420p', '-x264-params', 'keyint=120:min-keyint=60',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    await page.evaluate(([t, i]) => renderFrame(t, i), [f / fps, f]);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true });
    const buf = Buffer.from(r.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(res => ff.stdin.once('drain', res));
    if ((f - a) % 300 === 0) console.log(`w${w} ${f - a}/${b - a}  ${((Date.now() - t0) / Math.max(1, f - a)).toFixed(0)} ms/f`);
  }
  ff.stdin.end(); await new Promise(res => ff.on('close', res));
  await browser.close();
  console.log(`w${w} done ${b - a} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await Promise.all([...Array(NW).keys()].map(worker));
fs.writeFileSync(`${outdir}/list.txt`, [...Array(NW).keys()].filter(w => f0 + w * per < f1).map(w => `file 'chunk_${String(w).padStart(2, '0')}.mp4'`).join('\n') + '\n');
console.log('all done');
