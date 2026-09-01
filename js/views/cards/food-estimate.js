/**
 * 估算菜品的统一呈现。
 *
 * 列表只放一枚低强调的“估算”标签；来源、误差和核对日期全部收进信息面板。
 * 这样不会给每一行再塞一个 i，也不会让同一份说明散落在标题、脚注和 tooltip。
 */

import { h } from '../../lib/utils.js';
import { infoTip, weakTag } from '../../lib/ui.js';
import { estimateDisclosure } from '../../data/foods.js';

/** 所有页面共用同一枚弱标签；非估算条目不产生节点。 */
export function estimateTag(food) {
  if (!estimateDisclosure(food)) return null;
  return weakTag('估算', {
    tone: 'outline',
    className: 'chip-est',
    ariaLabel: `${food?.name || '该菜品'}的营养数值为估算`,
  });
}

function disclosureRows(disclosure) {
  return [
    h('p.estimate-disclosure-row', null,
      h('strong', null, '估算依据：'), disclosure.basis),
    h('p.estimate-disclosure-row', null,
      h('strong', null, '主要误差：'), disclosure.uncertainty),
    disclosure.accessed
      ? h('p.estimate-disclosure-date', null, `资料核对日期：${disclosure.accessed}`)
      : null,
  ];
}

/**
 * 单个食物的说明入口。估算项统一展示依据与误差；非估算项仍可展示原有 note。
 * extra 用于把复合食物的实际配料快照并入同一个面板，避免一行出现两个信息按钮。
 */
export function foodInfoTip(food, {
  label = '查看食物说明',
  extra = null,
} = {}) {
  const disclosure = estimateDisclosure(food);
  const note = String(food?.note || '').trim();
  const extras = Array.isArray(extra) ? extra.filter(Boolean) : (extra ? [extra] : []);
  if (!disclosure && !note && !extras.length) return null;

  return infoTip(label,
    disclosure
      ? h('p.estimate-disclosure-intro', null,
        '“估算”表示这不是当前官方营养标签或实验室实测值，适合做日常记录参考。')
      : null,
    disclosure ? disclosureRows(disclosure) : h('p', null, note),
    extras);
}

/**
 * 一张卡里可能同时出现多道估算菜品。只放一个信息入口，并在面板内按菜名汇总，
 * 避免推荐列表或饮食记录每一行都长出一个 i。
 */
export function estimateGroupInfoTip(foods, label = '查看估算说明') {
  const unique = [];
  const seen = new Set();
  for (const food of foods || []) {
    const disclosure = estimateDisclosure(food);
    const key = food?.id || food?.name;
    if (!disclosure || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ food, disclosure });
  }
  if (!unique.length) return null;

  return infoTip(label,
    h('p.estimate-disclosure-intro', null,
      '列表中标有“估算”的菜品不是当前官方营养标签或实验室实测值；误差来源集中列在这里。'),
    h('div.estimate-disclosure-list', null, unique.map(({ food, disclosure }) =>
      h('section.estimate-disclosure-item', null,
        h('strong.estimate-disclosure-name', null, food.name),
        disclosureRows(disclosure)))));
}
