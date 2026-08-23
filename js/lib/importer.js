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
  if (quality.overlapBuckets) {
    notes.push(`按 ${quality.resolutionMinutes || 5} 分钟区间解析 ${quality.overlapBuckets} 个多来源重叠桶`);
    if (quality.priorityMode === 'inferred') notes.push('来源顺序为推断值，可在健康页按导出文件 sourceName 覆盖');
  }
  if (quality.activitySummaryDays) notes.push(`${quality.activitySummaryDays} 天采用活动圆环日汇总`);
  if (quality.workoutCount) notes.push(`识别 ${quality.workoutCount} 次锻炼（未重复计入活动能量）`);
  if (quality.unsupportedRecords) {
    notes.push(`保留报告 ${quality.unsupportedRecords} 条暂未支持的健康记录`);
  }
  if (quality.unsupportedXmlElementCount) {
    notes.push(`安全跳过 ${quality.unsupportedXmlElementCount} 个暂未支持的 XML 顶层元素`);
  }
  if (quality.snapshotBlockedByUnknownElements) {
    notes.push('因导出含未知顶层结构，已降级为增量合并，不删除旧数据');
  }
  if (quality.invalidRecords) notes.push(`隔离 ${quality.invalidRecords} 条异常值`);
  if (quality.truncatedXml) notes.push('XML 未完整闭合，已降级为增量合并，不删除旧数据');
  return notes.length ? `；${notes.join('，')}` : '';
}

/** 解析结果写入本地库，返回一句可直接展示的结果说明 */
export async function applyImport(result, meta = {}) {
  const note = ignoredNote(result?.ignoredKeys);
  const cleaned = qualityNote(result?.quality);
  const isCompleteSnapshot = result?.fullSnapshot === true;
  if (!result?.days?.length && !isCompleteSnapshot) {
    return {
      ok: false,
      ignoredKeys: result?.ignoredKeys || [],
      message: result?.ignoredKeys?.length
        ? `没识别到可用数据${note}`
        : '没识别到可用的健康数据，请检查是不是缺少 date 字段',
    };
  }
  const days = result.days || [];
  await mergeHealthDays(days, {
    ...meta,
    records: result.recordCount,
    types: result.types?.length,
    sourceFormat: result.sourceFormat || meta.sourceFormat || 'partial',
    fullSnapshot: isCompleteSnapshot,
    snapshotFields: result.snapshotFields || [],
    workoutCount: result.workouts?.length || 0,
    exportDate: result.metadata?.exportDate?.value || null,
    quality: result.quality || null,
  });
  const from = days[0]?.date;
  const to = days[days.length - 1]?.date;
  const range = from === to ? from : `${from} ~ ${to}`;
  return {
    ok: true,
    days: days.length,
    ignoredKeys: result.ignoredKeys || [],
    quality: result.quality || null,
    metadata: result.metadata || null,
    workouts: result.workouts || [],
    message: days.length
      ? `已导入 ${days.length} 天（${range}）${note}${cleaned}`
      : `已同步完整 Apple 健康快照（本次没有可用的按日记录）${note}${cleaned}`,
  };
}

/**
 * 从剪贴板读一段快捷指令输出的数据并导入。
 *
 * 网页拿不到 HealthKit —— iOS 没给 Safari 任何读健康数据的接口，所以同步这件事
 * 绕不开快捷指令。快捷指令那头可以配成「特定时间」自动化自己跑（关掉「运行前询问」
 * 就是无人值守），但把数据交到网页手里这一步必须有用户手势：iOS 不允许网页在没有
 * 手势时读剪贴板，读之前系统还要再弹一次「粘贴」确认。
 *
 * 所以这条路最少也要点一下，真正的零操作做不到。能省的是后面那一串：
 * 放一个按钮在今日页，就是「开 App 点一下」，而不是「切到健康页、展开粘贴框、
 * 长按粘贴、再点解析导入」。
 */
export async function importFromClipboard() {
  if (!navigator.clipboard?.readText) {
    return { ok: false, message: '这个浏览器不给网页读剪贴板，请到「健康」页用粘贴框' };
  }
  let text;
  try {
    text = (await navigator.clipboard.readText())?.trim();
  } catch {
    // 用户在系统的「粘贴」确认里点了取消，也会走到这儿
    return { ok: false, message: '没读到剪贴板，请到「健康」页用粘贴框' };
  }
  if (!text) return { ok: false, message: '剪贴板是空的，先跑一次快捷指令' };
  try {
    const result = await runImportWorker({ text });
    return applyImport(result, { via: 'clipboard' });
  } catch (err) {
    return { ok: false, message: `导入失败：${err.message}` };
  }
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
