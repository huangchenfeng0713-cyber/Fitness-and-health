/**
 * 时长的写法。
 *
 * 睡眠、锻炼这类时长在界面上一律写成「6小时42分」，不写「6.7 小时」。
 *
 * 小数小时是给**图表纵轴**用的：轴上要一排等距的刻度，6.5 / 7.0 / 7.5 才对得齐。
 * 但一个具体的睡眠时长不是刻度，是人要读出来的数——「6.7 小时」得在脑子里
 * 把 0.7 乘回 60 才知道是多久，而屏幕上本来就有地方把它写清楚。
 *
 * 纯函数放 core，是因为主卡的提示（`buildInsights`）和数据页的卡片要说同一句话；
 * 各写一份的话，同一个睡眠时长在两页会是两种写法。
 */

/**
 * 「42分钟」「6小时」「6小时42分」。没有数就给一道杠。
 *
 * 先剔 null / undefined / ''，再转数字：`Number(null)` 是 0，
 * 而 `Number.isFinite(0)` 是 true —— 只用后者判断的话，
 * 没记到睡眠的那天会显示成「0分钟」，读起来是「你一夜没睡」。
 */
export function formatDuration(mins) {
  const parts = durationParts(mins);
  return parts ? parts.map((p) => `${p.value}${p.unit}`).join('') : '—';
}

/**
 * 拆成「数 + 单位」几段：`[{ value: 6, unit: '小时' }, { value: 42, unit: '分' }]`。
 *
 * 给的是同一个写法的另一种形状，不是第二套口径 —— `formatDuration` 就建在它上面，
 * 两处不可能说出不同的时长。
 *
 * 之所以要拆：健康数据那一行里，每一格都是「大数字 + 小单位」（`430 kcal`、
 * `42分钟`），唯独睡眠把整串「6小时42分」印成和数字一样大的粗体 ——
 * 同一行两种写法，而且那三个汉字按数字的字号排，四列时正好把格子撑破
 * （实测 76px 的字塞进 64.5px 的格）。把单位交回 `.metric-unit`，
 * 它既和邻居一致，也不再需要为一格特例去改整行的排布。
 */
export function durationParts(mins) {
  if (mins == null || mins === '') return null;
  const v = Number(mins);
  if (!Number.isFinite(v)) return null;
  const total = Math.round(v);
  if (total < 60) return [{ value: total, unit: '分钟' }];
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? [{ value: h, unit: '小时' }, { value: m, unit: '分' }] : [{ value: h, unit: '小时' }];
}
