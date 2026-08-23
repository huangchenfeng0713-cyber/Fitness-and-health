/**
 * 健康数据导入的公共入口。
 * 健康页（带进度条）和 URL 自动导入都走这里，避免两处各写一遍。
 */

import { mergeHealthDays } from './store.js';

/** 把文件或文本丢给 Worker 解析 */
export function runImportWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/health-import.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg);
      else if (msg.type === 'done') { worker.terminate(); resolve(msg.result); }
      else if (msg.type === 'error') { worker.terminate(); reject(new Error(msg.message)); }
    };
    worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message || '导入进程出错')); };
    worker.postMessage(payload);
  });
}

/** 认不出的字段列成一句人话，别让数据被悄悄丢掉 */
function ignoredNote(ignoredKeys) {
  if (!ignoredKeys?.length) return '';
  const shown = ignoredKeys.slice(0, 3).map((k) => `「${k}」`).join('、');
  const more = ignoredKeys.length > 3 ? ` 等 ${ignoredKeys.length} 个` : '';
  return `，忽略了不认识的字段${shown}${more}`;
}

/** 把自动数据清洗说清楚，避免用户误以为原始 XML 的简单求和就是 Health App 官方统计。 */
function qualityNote(quality) {
  if (!quality) return '';
  const notes = [];
  if (quality.duplicateRecords) notes.push(`去重 ${quality.duplicateRecords} 条重复样本`);
  if (quality.sleepOverlapMinutes) notes.push(`合并 ${Math.round(quality.sleepOverlapMinutes)} 分钟重叠睡眠`);
  if (quality.multiSourceDays) notes.push(`${quality.multiSourceDays} 个多来源指标按单来源日总量最大值近似消重`);
  if (quality.invalidRecords) notes.push(`隔离 ${quality.invalidRecords} 条异常值`);
  return notes.length ? `；${notes.join('，')}` : '';
}

/** 解析结果写入本地库，返回一句可直接展示的结果说明 */
export async function applyImport(result, meta = {}) {
  const note = ignoredNote(result?.ignoredKeys);
  const cleaned = qualityNote(result?.quality);
  if (!result?.days?.length) {
    return {
      ok: false,
      ignoredKeys: result?.ignoredKeys || [],
      message: result?.ignoredKeys?.length
        ? `没识别到可用数据${note}`
        : '没识别到可用的健康数据，请检查是不是缺少 date 字段',
    };
  }
  await mergeHealthDays(result.days, { records: result.recordCount, types: result.types?.length, ...meta });
  const from = result.days[0].date;
  const to = result.days[result.days.length - 1].date;
  const range = from === to ? from : `${from} ~ ${to}`;
  return {
    ok: true,
    days: result.days.length,
    ignoredKeys: result.ignoredKeys || [],
    quality: result.quality || null,
    message: `已导入 ${result.days.length} 天（${range}）${note}${cleaned}`,
  };
}

/**
 * 从地址栏读取数据并导入。
 *
 * 让快捷指令可以「打开一个链接」就完成同步：
 *   https://你的地址/#import=<URL 编码后的 JSON>
 * 比拷剪贴板再回来点一下还少一步，也不用申请剪贴板权限。
 */
export async function importFromUrlHash() {
  const hash = location.hash || '';
  const m = /[#&]import=([^&]+)/.exec(hash);
  if (!m) return null;

  // 无论成功失败都先把参数清掉，避免刷新时重复导入
  const clean = hash.replace(/[#&]import=[^&]+/, '');
  history.replaceState(null, '', location.pathname + location.search + (clean === '#' ? '' : clean));

  let text;
  try {
    text = decodeURIComponent(m[1]);
  } catch {
    return { ok: false, message: '链接里的数据格式不对，无法解码' };
  }

  try {
    const result = await runImportWorker({ text });
    return applyImport(result, { via: 'url' });
  } catch (err) {
    return { ok: false, message: `导入失败：${err.message}` };
  }
}
