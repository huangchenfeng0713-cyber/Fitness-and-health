/**
 * 「今日健康数据」这张卡该说什么。
 *
 * 挑哪几项、缺的怎么讲、同步算不算成功 —— 都是判断，所以放 core，
 * 视图只负责摆图标和方格。
 *
 * 两条口径：
 *  1. **这张卡永远说真正的今天**，不跟着今日 / 饮食页选的日期走。
 *     那两页翻回昨天是为了补记饮食；跟着翻的话，「今日健康数据」
 *     这个标题就成了假的，而且没有任何地方提示你正在看哪一天。
 *  2. **体重使用截至今天最近一次有效记录。** 体重不必每天测量；测量日期
 *     由卡片右上角的说明明确给出。体脂和静息心率仍只显示当天值，避免把
 *     较早的测量伪装成今天的数据。
 */

import { recordedWaterCount } from './water-log.js';

const FIELDS = [
  { key: 'steps', label: '步数', unit: '', decimals: 0 },
  { key: 'activeEnergy', label: '活动', unit: 'kcal', decimals: 0 },
  { key: 'exerciseMinutes', label: '锻炼', unit: '分钟', decimals: 0 },
  // 睡眠写成「6小时42分」，值本身就带着单位，不再占单位槽
  { key: 'sleepMinutes', label: '睡眠', unit: '', kind: 'duration' },
  { key: 'restingHR', label: '静息心率', unit: 'bpm', decimals: 0 },
  { key: 'weightKg', label: '体重', unit: 'kg', decimals: 1 },
  // 与饮食页同一日、同一字段；0 次表示尚未记水，不推断实际摄水量。
  { key: 'waterCount', label: '喝水记录', unit: '次', decimals: 0, localLog: true },
  /*
   * 体脂和饮水只在这台设备真的记到过的时候才占一格。
   * 多数人没有体脂秤、也没让快捷指令带上饮水，常年挂一道杠只是噪音。
   * 记到过之后它们就和别的项一样，缺了画杠。
   *
   * 设备饮水是 Apple 健康的毫升值，与上面的手动次数并列而不换算。
   */
  { key: 'bodyFatPct', label: '体脂', unit: '%', decimals: 1, optIn: true },
  { key: 'waterMl', label: '设备饮水', unit: 'ml', decimals: 0, optIn: true },
];

/*
 * 先剔 null / undefined / '' 再转数字。
 * Number(null) 是 0，而 Number.isFinite(0) 是 true —— 只用后者判断的话，
 * 今天没同步到活动能量会显示成「0 kcal」，读起来是「你今天一点没动」，
 * 而不是「这项没数据」。这两件事在这张卡上差别很大。
 */
const numeric = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {object} input
 *  - health      今天那一天的健康记录（没有就传 null）
 *  - lastImport  最近一次导入 { at, days, range, ... }
 *  - today       今天的日期串
 *  - everSeen    历史上出现过的字段集合，决定体脂这类可选项占不占格
 *  - latestWeight 截至今天最近一次体重 { value, date }
 * @returns {{ synced, syncedAt, cells, present, presentToday, recent, missing, hasAny, sourceNote }}
 */
export function healthCardState({
  health = null, lastImport = null, today = '', everSeen = [], latestWeight = null,
} = {}) {
  const row = health || {};
  const seen = new Set(everSeen);
  const fallbackWeight = numeric(latestWeight?.value);
  const loggedWaterValue = numeric(row.waterCount);
  const cells = FIELDS
    .filter((f) => !f.optIn || seen.has(f.key))
    .map((f) => {
      const todayValue = f.localLog ? recordedWaterCount(loggedWaterValue) : numeric(row[f.key]);
      if (f.key === 'weightKg' && todayValue == null && fallbackWeight != null) {
        const observedDate = String(latestWeight?.date || '');
        return {
          ...f,
          value: fallbackWeight,
          observedDate,
          recent: observedDate !== today,
        };
      }
      return {
        ...f,
        value: todayValue,
        observedDate: todayValue == null ? '' : today,
        recent: false,
      };
    });

  // 同步提示只统计设备项；手动次数的 0 不等于 Apple 健康读到了饮水样本。
  const deviceCells = cells.filter((c) => !c.localLog);
  const present = deviceCells.filter((c) => c.value != null).map((c) => c.key);
  const presentToday = deviceCells.filter((c) => c.value != null && !c.recent).map((c) => c.key);
  const recent = deviceCells.filter((c) => c.value != null && c.recent).map((c) => c.key);
  const missing = deviceCells.filter((c) => c.value == null).map((c) => c.key);

  /*
   * 「今天同步过没有」问的是同步这个动作，不是某一项有没有值。
   * 手表哪天没戴，静息心率就是空的，可那天照样同步成功了 ——
   * 拿「有没有缺项」判定，会让一张同步正常的卡长期写着「未同步」。
   */
  const at = String(lastImport?.at || '');
  const syncedToday = at.length >= 10 && localDay(at) === today;
  return {
    synced: syncedToday,
    syncedAt: syncedToday ? at : (at || null),
    cells,
    present,
    presentToday,
    recent,
    missing,
    hasAny: present.length > 0 || (loggedWaterValue != null && loggedWaterValue >= 0),
    sourceNote: sourceNote(row),
  };
}

/** ISO 时刻落在本地的哪一天。用 Date 是为了做时区换算，不是读时钟 */
function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sourceNote(row) {
  const source = row.source;
  if (source === 'manual') return '这一天的数据是手动补录的。';
  if (source === 'mixed') return '这一天既有同步来的数据，也有手动补录的部分。';
  if (source && row.waterCount != null) return '设备数据来自 Apple 健康；喝水次数是应用内记录。';
  if (source) return '数据来自 Apple 健康同步。';
  return '';
}

/** 缺项的常见原因，按项给。措辞统一在这里定，界面照抄 */
export const MISSING_REASONS = [
  '这项今天没有样本（比如没戴表、没称重）',
  '健康 App 里没给读取权限',
  '快捷指令里没包含这一项',
  '同步发生在测量之前，再同步一次就有了',
];

export const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));
