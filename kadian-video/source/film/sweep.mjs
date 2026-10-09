import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://127.0.0.1:8765/index.html');
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
const res = await page.evaluate(() => { const errs = []; for (let t = 0; t < DURATION + 0.5; t += 0.1) { try { renderFrame(t, Math.round(t * 60)); } catch (e) { errs.push([t.toFixed(1), e.message]); } } return errs; });
console.log('errors:', res.length, JSON.stringify(res.slice(0, 10)));
await browser.close();
