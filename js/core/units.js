/**
 * 数字和单位之间到底空不空格，只在这里定一次。
 *
 * 之前同一页上能数出四五种写法：`116 kcal`（空格）、`150g`（不空）、
 * `约 150 g`（空）、`30 分钟`（空）、`34分钟`（不空）。每一处都是当时
 * 随手拼的字符串，没人错，但摆在一起就是乱。
 *
 * 规矩很简单，跟着中文排版的通行做法：
 *  - **西文单位前留一个空格**：`116 kcal`、`550 mg`、`58 bpm`
 *  - **中文单位不留**：`30分钟`、`7360步`、`5次`
 *  - **g / ml 这两个不留**：它们几乎总是紧跟在克重后面（`150g`、`250ml`），
 *    留了空格反而像是两个字段。这一条是惯例，不是推导出来的。
 */

/** 贴着数字写的单位（不留空格）。其余西文单位一律留一个空格。 */
const TIGHT_UNITS = new Set(['g', 'ml', 'kg', 'mg', '%']);

/** 中日韩字符：中文单位一律贴着数字写。 */
const CJK = /[一-龥]/;

/**
 * 把数字和单位拼成界面上的写法。
 * @param {number|string} value 已经取好整、保留好小数的数字（或它的字符串形式）
 * @param {string} unit 单位，例如 'kcal' / 'g' / '分钟' / '次'
 */
export function withUnit(value, unit) {
  const u = String(unit || '');
  if (!u) return String(value);
  const tight = TIGHT_UNITS.has(u) || CJK.test(u[0]);
  return `${value}${tight ? '' : ' '}${u}`;
}

/** 该不该留空格。给那些自己拼模板、不方便走 withUnit 的地方用。 */
export function unitGap(unit) {
  const u = String(unit || '');
  return !u || TIGHT_UNITS.has(u) || CJK.test(u[0]) ? '' : ' ';
}
