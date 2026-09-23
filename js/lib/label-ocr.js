/**
 * 拍营养成分表 → 文字。只管「图片进、文字出」，怎么读这段文字在 core/nutrition-label.js。
 *
 * 引擎是 tesseract.js，**按需**从 jsdelivr 加载（和账号用的 Supabase SDK 同一个 CDN、
 * 同一条 Service Worker 缓存规则）：不用这个功能的人一个字节都不下。
 * 这个项目一个依赖都不引，这里也不例外 —— 它是运行时从 CDN 拿的，不进 package.json。
 * 版本钉死：CDN 上的 latest 会变，而识别参数（稀疏模式 + 按词框拼行、只用中文模型）是照着这一版调的。
 *
 * 首次使用要下载约 6 MB（核心 wasm 约 4 MB、中文模型 1.7 MB）。之后入口模块走 SW 的 SDK 缓存、
 * worker 和 wasm 走浏览器 HTTP 缓存（jsdelivr 带版本号的地址缓存期很长）、语言模型走
 * tesseract 自己的 IndexedDB 缓存 —— 一般不用再下，但**不保证离线可用**，界面上也不这么说。
 *
 * 测试和冒烟可以在 `globalThis.Tesseract` 上放一个假引擎（同 `globalThis.supabase`
 * 那一招），这样 CI 不用下载几 MB 的模型、也不依赖外网。
 */

import { parseNutritionLabel, linesFromWords } from '../core/nutrition-label.js';

export const TESSERACT_VERSION = '7.0.0';
const TESSERACT_ESM_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`;

/* 首次下载的大致体积，界面上用来说「要等一会儿」 */
export const FIRST_USE_DOWNLOAD_MB = 6;

let enginePromise = null;

async function loadEngine() {
  if (globalThis.Tesseract?.createWorker) return globalThis.Tesseract;
  if (!enginePromise) {
    enginePromise = import(TESSERACT_ESM_URL)
      .then((mod) => mod.default?.createWorker ? mod.default : mod)
      .catch((error) => { enginePromise = null; throw error; });
  }
  return enginePromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('这张图片打不开')); };
    img.src = url;
  });
}

/*
 * 预处理：转正、缩放到 1200~2200 像素的长边、灰度、拉伸对比度。
 *
 * iPhone 一张照片 1200 万像素，原样喂给 wasm 要好几秒还容易爆内存；
 * 截图又常常太小，汉字只有十几个像素高，认不出来。
 * 灰度 + 按 1% / 99% 分位拉伸对比度，是为了反光、偏黄的包装纸；
 * 不做硬二值化 —— tesseract 自己的 Otsu 比我们拍脑袋定的阈值强。
 */
async function prepareImage(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await loadImage(file);
  }
  const width = source.width;
  const height = source.height;
  const longSide = Math.max(width, height);
  if (!longSide) throw new Error('这张图片是空的');
  const scale = longSide > 2200 ? 2200 / longSide : longSide < 1200 ? 1200 / longSide : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    px[i] = y;
    histogram[y] += 1;
  }
  const total = px.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += histogram[lo]) < total * 0.01;) lo += 1;
  for (let acc = 0; hi > 0 && (acc += histogram[hi]) < total * 0.01;) hi -= 1;
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span));
    px[i] = v; px[i + 1] = v; px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/* tesseract v5+ 的逐词结果在 blocks → paragraphs → lines → words 里 */
function wordsOf(data) {
  const words = [];
  for (const block of data?.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) words.push(...(line.words || []));
    }
  }
  return words;
}

/*
 * 两种读法：
 *  - 'sparse'（psm 11，稀疏文本）+ 按词框拼行：主力。真实包装的营养成分表都带框线，
 *    默认版面分析一见框线就只认中间那列，「能量 / 蛋白质…」整列丢掉；稀疏模式每个片段都找得回来。
 *  - 'column'（psm 4，单列变长行）：没有框线的简易标签上它的行归属更干净，作为后备。
 * 只用中文模型：中英混合模型会把「克」读成「5%」。英文标签另走一轮 eng。
 */
async function recognizeWith(engine, lang, image, report, mode) {
  const worker = await engine.createWorker(lang, 1, {
    logger: (m) => {
      if (m?.status === 'recognizing text') report({ stage: 'recognize', progress: m.progress ?? 0 });
      else report({ stage: 'load', progress: m?.progress ?? 0 });
    },
  });
  try {
    await worker.setParameters?.({
      tessedit_pageseg_mode: mode === 'sparse' ? '11' : '4',
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(image, {}, { text: true, blocks: mode === 'sparse' });
    const words = mode === 'sparse' ? wordsOf(data) : [];
    return words.length ? linesFromWords(words).join('\n') : String(data?.text || '');
  } finally {
    await worker.terminate?.();
  }
}

/**
 * @param {Blob} file
 * @param {{ onProgress?: (p: { stage: 'prepare'|'load'|'recognize', progress?: number }) => void }} [options]
 * @returns {Promise<{ parsed: ReturnType<typeof parseNutritionLabel>, text: string, lang: string }>}
 */
export async function recognizeNutritionLabel(file, { onProgress } = {}) {
  const report = (p) => { try { onProgress?.(p); } catch { /* 进度只是展示，不能打断识别 */ } };
  report({ stage: 'prepare' });
  const image = await prepareImage(file);
  report({ stage: 'load', progress: 0 });
  const engine = await loadEngine();
  let best = null;
  /*
   * 先中文稀疏模式；认出来的不到三项，换单列模式再读一遍；还不行再用英文模型
   * （进口食品、Nutrition Facts）。英文模型只有这时才下载 —— 大多数人用不到它。
   */
  const passes = [['chi_sim', 'sparse'], ['chi_sim', 'column'], ['eng', 'sparse']];
  for (const [lang, mode] of passes) {
    const text = await recognizeWith(engine, lang, image, report, mode);
    const parsed = parseNutritionLabel(text);
    if (!best || parsed.keys.length > best.parsed.keys.length) best = { parsed, text, lang, mode };
    if (parsed.keys.length >= 3) break;
  }
  return best;
}
