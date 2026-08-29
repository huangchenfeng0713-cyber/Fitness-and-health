/**
 * 「今日健康数据」这张卡该说什么。
 *
 * 挑哪几项、缺的怎么讲、同步算不算成功 —— 都是判断，所以放 core，
 * 视图只负责摆图标和方格。
 *
 * 两条口径不能动：
 *  1. **这张卡永远说真正的今天**，不跟着今日 / 饮食页选的日期走。
 *     那两页翻回昨天是为了补记饮食；跟着翻的话，「今日健康数据」
 *     这个标题就成了假的，而且没有任何地方提示你正在看哪一天。
 *  2. **不沿用前几天的体重 / 体脂 / 静息心率。** 沿用会让人把三天前
 *     称的数当成今早刚称的 —— 尤其在体重每天都在小幅波动的时候。
 *     缺就画一道杠，最近一次测量去感叹号或趋势图里找。
 */

const FIELDS = [
  { key: 'steps', label: '步数', unit: '', decimals: 0 },
  { key: 'activeEnergy', label: '活动', unit: 'kcal', decimals: 0 },
  { key: 'exerciseMinutes', label: '锻炼', unit: '分钟', decimals: 0 },
  // 睡眠写成「6小时42分」，值本身就带着单位，不再占单位槽
  { key: 'sleepMinutes', label: '睡眠', unit: '', kind: 'duration' },
  { key: 'restingHR', label: '静息心率', unit: 'bpm', decimals: 0 },
  { key: 'weightKg', label: '体重', unit: 'kg', decimals: 1 },
  /*
   * 体脂和饮水只在这台设备真的记到过的时候才占一格。
   * 多数人没有体脂秤、也没让快捷指令带上饮水，常年挂一道杠只是噪音。
   * 记到过之后它们就和别的项一样，缺了画杠。
   *
   * 饮水这一格是**设备记录的毫升数**，和今日页那个「喝了几次」不是一个数：
   * 那个是主动饮水的次数，不当进度目标；这个是 Apple 健康同步来的原始值，
   * 撤掉它等于把同步上来的数据丢了。
   */
  { key: 'bodyFatPct', label: '体脂', unit: '%', decimals: 1, optIn: true },
  { key: 'waterMl', label: '饮水', unit: 'ml', decimals: 0, optIn: true },
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
 * @returns {{ synced, syncedAt, cells, present, missing, hasAny, sourceNote }}
 */
export function healthCardState({
  health = null, lastImport = null, today = '', everSeen = [],
} = {}) {
  const row = health || {};
  const seen = new Set(everSeen);
  const cells = FIELDS
    .filter((f) => !f.optIn || seen.has(f.key))
    .map((f) => ({ ...f, value: numeric(row[f.key]) }));

  const present = cells.filter((c) => c.value != null).map((c) => c.key);
  const missing = cells.filter((c) => c.value == null).map((c) => c.key);

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
    missing,
    hasAny: present.length > 0,
    sourceNote: sourceNote(row.source),
  };
}

/** ISO 时刻落在本地的哪一天。用 Date 是为了做时区换算，不是读时钟 */
function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sourceNote(source) {
  if (source === 'manual') return '这一天的数据是手动补录的。';
  if (source === 'mixed') return '这一天既有同步来的数据，也有手动补录的部分。';
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
