/**
 * 拍营养成分表 → 自动填写自定义食物。
 *
 * CI 不下载真正的识别引擎（6 MB、要外网）：`lib/label-ocr.js` 优先用 `globalThis.Tesseract`，
 * 这里注入一个假引擎，吐出**一张带框线的真实包装在 tesseract 稀疏模式下的逐词原样输出**
 * （和 test/nutrition-label.test.js 的 BOXED_WORDS 同一份）。真引擎本身在本地实测过。
 *
 * 守的是界面这一层：拍照 / 相册两个入口都在、识别时有进度、七项填进对应的格子、
 * 推断出来的格子标成橙色、人一改就退色、保存进食物库的数是换算对的、认不出来时给出重拍的办法。
 */
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8137';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
let checks = 0;
const check = (name, value) => { assert.ok(value, name); console.log('✓ ' + name); checks++; };

const BOXED_WORDS = '营养@663,177-910,229  成@788,173-840,247  分@839,173-877,247  表@876,173-914,247  项@304,287-380,325  目@355,283-382,342  每@755,277-817,316  100@816,270-870,325  克@878,274-913,313  NRV%@1107,273-1209,304  能@307,369-388,408  量@362,365-392,424  1569@759,357-938,398  于@863,353-906,409  焦@905,353-941,409  19%@1109,357-1184,388  和@309,453-329,493  蛋白质@328,451-432,493  6.8@759,443-861,482  克@825,439-863,493  11%@1111,441-1186,472  18.5@762,526-888,566  克@852,522-890,576  忆@1111,526-1133,556  生@1140,526-1158,555  放@1165,525-1188,555  脂肪@311,537-391,577  7.2@763,611-864,650  克@829,607-867,661  一@311,621-381,659  饱和@396,619-451,659  脂肪@458,619-519,658  18%@1116,693-1191,724  碳水@313,703-520,744  化@417,699-457,761  合@456,699-495,761  物@495,699-523,761  55.2@765,694-892,734  克@857,690-896,745  一@314,788-396,828  糖@374,784-398,845  12.0@767,778-893,818  克@857,774-895,828  膳食@317,872-416,913  纤维@415,870-483,911  2.1@768,863-870,902  克@835,856-873,916  8%@1117,862-1169,892  420@769,945-926,986  毫@857,941-897,998  克@896,941-929,998  21%@1120,945-1196,976';

/* 在页面里跑：假 tesseract。`window.__ocrMode` 为 'blank' 时什么都认不出来 */
function installFakeTesseract(wordSpec) {
  const words = wordSpec.split(/\s{2,}/).map((t) => {
    const m = t.match(/^(.*)@(\d+),(\d+)-(\d+),(\d+)$/);
    return { text: m[1], bbox: { x0: +m[2], y0: +m[3], x1: +m[4], y1: +m[5] } };
  });
  window.__ocrCalls = [];
  window.Tesseract = {
    async createWorker(lang, oem, { logger } = {}) {
      let psm = '3';
      return {
        async setParameters(p) { psm = p.tessedit_pageseg_mode || psm; },
        async recognize(image) {
          window.__ocrCalls.push({ lang, psm, isCanvas: image instanceof HTMLCanvasElement });
          for (const progress of [0.2, 0.6, 1]) {
            logger?.({ status: 'recognizing text', progress });
            await new Promise((r) => setTimeout(r, 120));
          }
          if (window.__ocrMode === 'blank') return { data: { text: '', blocks: [] } };
          return { data: { text: '', blocks: [{ paragraphs: [{ lines: [{ words }] }] }] } };
        },
        async terminate() {},
      };
    },
  };
}

/* 一张 4×4 的灰色 PNG：够 createImageBitmap 解码，内容无所谓（识别是假的） */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAAAAACMmsGiAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAT+AICYfQsWQAAAABJRU5ErkJggg==', 'base64');

const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
await context.addInitScript(installFakeTesseract, BOXED_WORDS);
const page = await context.newPage();
await page.route('https://**/*', (route) => route.abort());
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.tab') && !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
  });
  await page.locator('.tab').filter({ hasText: '饮食' }).click();
  await page.getByRole('button', { name: '自定义' }).click();
  await page.locator('.label-scan').waitFor();

  const pickers = await page.evaluate(() => [...document.querySelectorAll('.label-scan-input')].map((i) => ({
    accept: i.accept, capture: i.getAttribute('capture'), label: i.getAttribute('aria-label'),
  })));
  check('拍照、从相册选两个入口都在，拍照直接开后置相机',
    pickers.length === 2 && pickers.every((p) => p.accept === 'image/*')
    && pickers.some((p) => p.capture === 'environment' && p.label === '拍照')
    && pickers.some((p) => p.capture == null && p.label === '从相册选'));
  const btnBox = await page.locator('.label-scan-btn').first().boundingBox();
  check('按钮不小于 44px 高（整块都能点）', btnBox.height >= 44);

  await page.locator('.label-scan-input[aria-label="从相册选"]').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.label-scan-result.is-working').waitFor();
  check('识别期间有进度', await page.locator('.label-scan-progress').count() === 1);
  await page.locator('.label-scan-result.is-done').waitFor({ timeout: 10000 });

  const calls = await page.evaluate(() => window.__ocrCalls);
  check('先用中文模型的稀疏模式读，读够了就不再跑第二遍，喂进去的是预处理过的 canvas',
    calls.length === 1 && calls[0].lang === 'chi_sim' && calls[0].psm === '11' && calls[0].isCanvas);

  const field = (label) => page.evaluate((label) => {
    const f = [...document.querySelectorAll('.custom-form .form-field')].find((el) => el.querySelector('span')?.textContent === label);
    return { value: f?.querySelector('input,select')?.value, filled: f?.classList.contains('is-autofilled'), guessed: f?.classList.contains('is-guessed') };
  }, label);
  const energy = await field('能量');
  check('能量照标签原样填 1569 kJ（单位跟着切到 kJ）',
    energy.value === '1569' && energy.filled && (await page.locator('.energy-unit-btn').first().innerText()).trim() === 'kJ');
  const expected = { '蛋白 g': '6.8', '脂肪 g': '18.5', '碳水 g': '55.2', '膳食纤维 g': '2.1', '总糖 g': '12', '钠 mg': '420' };
  for (const [label, value] of Object.entries(expected)) {
    const f = await field(label);
    assert.equal(f.value, value, `${label} 应为 ${value}`);
    assert.ok(f.filled, `${label} 要标成机器填的`);
  }
  check('六项营养全部填进对应的格子，饱和脂肪那一行没顶掉脂肪', true);
  check('「钠」字丢了、靠毫克推断出来的钠标成待核对（橙色）', (await field('钠 mg')).guessed && !(await field('蛋白 g')).guessed);
  const summary = await page.locator('.label-scan-result').innerText();
  check('结果说清填了几项、哪几项要重点核对', /已填入 7 项/.test(summary) && /钠是推断的/.test(summary));

  await page.locator('.custom-form .form-field', { hasText: '钠 mg' }).locator('input').fill('430');
  check('人一改那一格，底色就退掉', !(await field('钠 mg')).filled);

  await page.locator('.custom-form .form-field', { hasText: '食物名称' }).locator('input').fill('全麦饼干');
  await page.locator('.custom-form .form-field', { hasText: '每份克重/体积' }).locator('input').fill('30');
  await page.getByRole('button', { name: '保存到我的食物库' }).click();
  const saved = await page.evaluate(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const s = await import('/js/lib/store.js');
      const food = s.state.customFoods.find((f) => f.name === '全麦饼干');
      if (food) return food;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  });
  check('保存进食物库：kJ 换算成 kcal，改过的钠按人填的存',
    saved && saved.n[0] === 375 && saved.n[1] === 6.8 && saved.n[6] === 430 && saved.basis === '100g');

  // 认不出来：不填、说怎么重拍。存完新食物会接着弹出份量面板（好直接记一笔），先关掉
  await page.evaluate(async () => (await import('/js/lib/sheet.js')).closeSheet({ force: true }));
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '自定义' }).click();
  await page.locator('.label-scan').waitFor();
  await page.evaluate(() => { window.__ocrMode = 'blank'; window.__ocrCalls = []; });
  await page.locator('.label-scan-input[aria-label="拍照"]').setInputFiles({ name: 'blurry.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.label-scan-result.is-failed').waitFor({ timeout: 10000 });
  const failed = await page.locator('.label-scan-result').innerText();
  const tried = await page.evaluate(() => window.__ocrCalls.map((c) => `${c.lang}/${c.psm}`));
  check('认不出来时三种读法都试过（中文稀疏、中文单列、英文）', tried.join(',') === 'chi_sim/11,chi_sim/4,eng/11');
  check('认不出来时不瞎填，给出重拍的办法', /没认出营养成分表/.test(failed) && /占满画面/.test(failed)
    && (await field('蛋白 g')).value === '');

  check('全程没有页面错误', errors.length === 0);
  if (errors.length) console.log(errors);
  console.log(`\n营养成分表识别冒烟通过：${checks} 项`);
} finally {
  await browser.close();
}
