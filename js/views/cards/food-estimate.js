/**
 * 估算菜品的统一呈现。
 *
 * 列表只放一枚低强调的“估算”标签，说明收进一个信息面板 ——
 * 不给每一行再塞一个 i，也不让同一份说明散落在标题、脚注和 tooltip 里。
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

/*
 * 「估算」是什么意思，一句话说清。
 *
 * 原先是三段：估算依据（「通用中式配方估算（原料成分与成品重量折算）」）、
 * 主要误差、资料核对日期。第一段和第三段说的是这份数据怎么来的、什么时候
 * 核过 —— 那是维护这个库的人要的，不是照着吃饭的人要的。
 * 用户要判断的只有一件事：这个数不精确，哪些因素会让它差。
 */
const ESTIMATE_INTRO = '标着「估算」的菜没有官方营养标签，数值按常见做法折算，'
  + '记个大概可以，别当精确值用。';

/**
 * 单个食物的说明入口。
 * extra 用于把复合食物的实际配料快照并入同一个面板，避免一行出现两个信息按钮。
 */
export function foodInfoTip(food, {
  label = '查看食物说明',
  extra = null,
  // 只有 extra 而没有食物说明时也要给出入口（饮食记录靠它说清「这是快照」）
  fallback = false,
} = {}) {
  const disclosure = estimateDisclosure(food);
  const note = String(food?.note || '').trim();
  const extras = Array.isArray(extra) ? extra.filter(Boolean) : (extra ? [extra] : []);
  if (!disclosure && !note && !extras.length && !fallback) return null;

  return infoTip(label,
    disclosure ? h('p.estimate-disclosure-intro', null, ESTIMATE_INTRO) : null,
    disclosure
      ? [
        disclosure.note ? h('p.estimate-disclosure-row', null, disclosure.note) : null,
        h('p.estimate-disclosure-row', null, disclosure.generic),
      ]
      : (note ? h('p', null, note) : null),
    extras);
}

/**
 * 一张卡里可能同时出现多道估算菜品。只放一个信息入口，并在面板内按菜名汇总，
 * 避免推荐列表或饮食记录每一行都长出一个 i。
 */
export function estimateGroupInfoTip(foods, label = '查看估算说明', { extra = null } = {}) {
  const unique = [];
  const seen = new Set();
  for (const food of foods || []) {
    const disclosure = estimateDisclosure(food);
    const key = food?.id || food?.name;
    if (!disclosure || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ food, disclosure });
  }
  const extras = Array.isArray(extra) ? extra.filter(Boolean) : (extra ? [extra] : []);
  if (!unique.length && !extras.length) return null;

  /*
   * 同一类菜共有的那句误差，整张卡只说一次。
   *
   * 原先每道菜后面都跟一遍「原料比例、实际份量、用油、酱汁或汤汁摄入量，
   * 以及烹调失水都会造成误差」，列五道菜就抄五遍 ——
   * 真正有区别的那句（「按粥底加鱼片、花生的整碗计」）反而被埋掉了。
   */
  const generics = [...new Set(unique.map(({ disclosure }) => disclosure.generic))];
  const named = unique.filter(({ disclosure }) => disclosure.note);

  return infoTip(label,
    unique.length ? h('p.estimate-disclosure-intro', null, ESTIMATE_INTRO) : null,
    named.length
      ? h('div.estimate-disclosure-list', null, named.map(({ food, disclosure }) =>
        h('section.estimate-disclosure-item', null,
          h('strong.estimate-disclosure-name', null, food.name),
          h('p.estimate-disclosure-row', null, disclosure.note))))
      : null,
    generics.map((g) => h('p.estimate-disclosure-row', null, g)),
    extras);
}
