/**
 * 「当前饮食推荐 / 喝水」两张卡。
 *
 * 原先长在今日页上。但今日页要回答的是「我今天怎么样」，
 * 而这三张都是「我现在该做什么」——真要照着做的时候人已经在饮食页了，
 * 隔着一次切页反而多余。抽成卡片模块挂到饮食页，搬家只改一行 import。
 */

import { h, num, toast, runLocalAction } from '../../lib/utils.js';
import { icon } from '../../lib/icons.js';
import { infoTip, listRow, weakTag } from '../../lib/ui.js';
import { state, saveHealthDay } from '../../lib/store.js';
import { CATEGORIES } from '../../data/foods.js';
import { MEAL_LABEL } from '../../core/advisor.js';
import { estimateTag, estimateGroupInfoTip } from './food-estimate.js';

const expanded = { recommend: false };

function moreToggle(key, total, shown, rerender) {
  if (total <= shown) return null;
  return h('button.more-btn', {
    onclick: () => { expanded[key] = !expanded[key]; rerender(); },
  }, expanded[key] ? '收起' : `展开其余 ${total - shown} 项`);
}

/*
 * 推荐行的 ＋ 和搜索结果里的 ＋ 走同一条路：**先开份量面板**。
 *
 * 原先它直接按推荐的克数落库。可推荐给的克数是「按剩余预算算出来的一份」，
 * 不是这个人自己的份量 —— 而克数是乘数，差一倍热量就差一倍。
 * 同一个加号在两处做两件不同的事，本身也说不通。
 * 落库那一步交给份量面板，`addEntry` 在饮食页仍然只出现一次。
 */
function recRow(item, meal, onPick) {
  const f = item.food;
  return listRow({ className: 'rec-row' },
    h('div.rec-info', null,
      h('div.rec-name', null, f.name,
        estimateTag(f),
        weakTag(CATEGORIES[f.cat] || '自定义')),
      h('div.rec-portion', null, item.portionLabel),
      h('div.rec-reasons', null, item.reasons.slice(0, 2).map((r) => h('span.reason', null, r)))),
    h('div.rec-nums', null,
      h('span.rec-kcal', null, `${item.nutrients.kcal}`),
      h('span.rec-unit', null, 'kcal'),
      h('span.rec-prot', null, `蛋白 ${item.nutrients.protein}g`)),
    h('button.add-btn', {
      'aria-label': `选择 ${f.name}`,
      onclick: () => onPick?.(f, { meal }),
    }, icon('plus')),
  );
}

export function recommendCard(rerender, onPick) {
  const advice = state.derived?.advice;
  if (!advice) return null;
  const meal = advice.budget.meal.key;
  const all = advice.recommend;
  const list = expanded.recommend ? all : all.slice(0, 3);
  return h('section.card.recommend-card', null,
    h('div.card-head.recommend-card-head', null,
      h('h3', null, '当前饮食推荐'),
      h('div.card-head-actions', null,
        estimateGroupInfoTip(all.map((item) => item.food), '查看推荐中的估算说明'))),
    h('div.recommend-budget', { 'aria-label': '当前餐次预算' },
      h('span', null, MEAL_LABEL[meal]),
      h('span', null, `${num(advice.budget.kcal)} kcal`),
      h('span', null, advice.budget.proteinFeasible
        ? `蛋白 ${num(advice.budget.protein, 0)}g`
        : `蛋白≤${num(advice.budget.maxProteinByKcal, 1)}g`)),
    all.length
      ? [
        h('div.rec-list', null, list.map((item) => recRow(item, meal, onPick))),
        moreToggle('recommend', all.length, 3, rerender),
      ]
      : h('p.empty-hint', null, '今天的热量预算已经吃满了。剩下时间以水和无糖茶为主，明天回到正常预算即可。'),
  );
}

/*
 * 喝水：一行就够。
 *
 * 记的是「主动喝了几次」，不是毫升。饮料、汤、粥、水果和饭菜里的水分同样
 * 被人体吸收，单算白水没法代表全天水分够不够 ——「125 / 1700 ml」那根条
 * 会被读成「今天只完成了 7%」，而那个人可能刚喝完两碗汤。
 *
 * 撤销不常驻。它一天里最多用上一次（误触），却要一直占着一个控件和四个字；
 * 改成刚点完那几秒钟内出现，过了就收起来。
 */
const MAX_WATER_TAPS = 40;
/** 刚记完那几秒钟里把「撤销」露出来。再长就成了常驻控件 */
const UNDO_WINDOW_MS = 5000;

/** 今天点了几次。旧记录没有这个字段时按 0 起算 */
const waterTaps = () => Math.max(0, Math.round(Number(state.derived?.health?.waterCount) || 0));

let undoUntil = 0;
let undoTimer = null;
/*
 * 刚点完那一下要放一次「水滴流到数字上」的动画。
 *
 * 这个标记**只在动画真的跑起来那一刻才清掉**，不设时限。
 *
 * 一次点击会引发两次渲染（saveHealthDay 里的 emit 一次、await 之后的
 * rerender 又一次），第一个节点马上被第二个换掉，所以不能在渲染时就把
 * 标记取走 —— 得等 rAF 里确认节点还在文档上、动画确实挂上去了再清。
 *
 * 也不能用时间窗：写库慢一点（真机上 IndexedDB 比无头浏览器慢得多），
 * 渲染就落在窗口外面，动画从第二次起再也不出现 —— 实机上就是这么表现的。
 */
let pendingFlow = false;

async function bumpWater(delta) {
  const next = Math.max(0, Math.min(MAX_WATER_TAPS, waterTaps() + delta));
  if (next === waterTaps()) return;
  await saveHealthDay(state.day, { waterCount: next, source: 'manual' });
}

/*
 * 提示窗口挂在模块上，不挂在节点上：这张卡每次落库都会整个重建，
 * 挂在节点上的状态会跟着一起没。
 */
function openUndoWindow(rerender) {
  undoUntil = Date.now() + UNDO_WINDOW_MS;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoUntil = 0; rerender(); }, UNDO_WINDOW_MS);
}

function closeUndoWindow() {
  undoUntil = 0;
  clearTimeout(undoTimer);
}

const dropletIcon = () => icon('waterMl', 'water-drop');

export function waterCard(rerender) {
  const d = state.derived;
  if (!d) return null;
  const taps = waterTaps();
  const goal = Number(d.targets?.waterMl) || 0;
  const deviceMl = Number(d.health?.waterMl) || 0;
  const justLogged = Date.now() < undoUntil;

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '喝水'),
      // 次数已经写在下面那条里了，标题右边再挂一个「已记录 5 次」是同一个数写两遍
      infoTip('查看饮水说明',
        h('p', null, '这里只数「主动喝了几次水」，不记毫升 —— 汤、粥、水果和饭菜里的'
          + '水分同样算数，光算白水说明不了全天够不够。'),
        h('p', null, `一般成人每天直接饮水约 ${goal || 1700} ml，`
          + '但更好用的判断是口渴感和尿色，不是有没有恰好喝满某个数字。'),
        deviceMl > 0
          ? h('p', null, `Apple 健康这一天还同步了 ${num(deviceMl)} ml 饮水，在「数据」页能看到。`)
          : null)),
    h('div.water-row', null,
      waterPill(taps, justLogged, rerender),
      h('button.water-add', {
        type: 'button', 'aria-label': `记录一次饮水，当前 ${taps} 次`,
        onclick: async (ev) => {
          pendingFlow = true;
          const r = await runLocalAction(ev.currentTarget, () => bumpWater(1), '记录饮水');
          if (r.ok) { openUndoWindow(rerender); rerender(); } else { pendingFlow = false; }
        },
      }, icon('plus'), '饮水')));
}

/*
 * 左边那条状态。
 *
 * 次数一直写在这儿（原先记完那几秒会换成「已记录一次饮水」，数字消失，
 * 而那正是人最想看到它加一的时刻）。撤销仍然只在那几秒里挂在后面。
 *
 * 记完的动画是水滴往数字上流：位移距离要量出来才知道，所以挂进 DOM 之后
 * 用一帧的时间量一次，写进 --flow-x。量不到就不放动画，不猜一个距离 ——
 * 猜错的话水滴会停在半路上或者飞出卡片。
 */
function waterPill(taps, justLogged, rerender) {
  const drop = dropletIcon();
  const count = h('b.water-count', null, String(taps));
  const pill = h('div.water-pill', { role: 'status', 'aria-live': 'polite' },
    drop,
    h('span', null, '已记录 ', count, ' 次饮水'),
    justLogged
      ? [
        h('span.water-sep', { 'aria-hidden': 'true' }, '·'),
        h('button.water-undo', {
          type: 'button',
          onclick: async (ev) => {
            const r = await runLocalAction(ev.currentTarget, () => bumpWater(-1), '撤销');
            if (r.ok) { closeUndoWindow(); rerender(); }
          },
        }, '撤销'),
      ]
      : null);

  if (pendingFlow) {
    requestAnimationFrame(() => {
      // 这一版渲染已经被下一版换掉了，等下一版自己来挂
      if (!pill.isConnected || !pendingFlow) return;
      const from = drop.getBoundingClientRect();
      const to = count.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      if (!(dx > 0)) return;
      pendingFlow = false;
      /*
       * 关键帧里不写 calc(var(--flow-x) * .55)：Safari 对关键帧里嵌
       * 自定义属性的 calc 支持不稳，整条关键帧失效就只剩第一帧。
       * 几个途中位置在这儿算成具体像素，关键帧里只 var() 不运算。
       */
      for (const [name, ratio] of [['', 1], ['-a', 0.08], ['-b', 0.52], ['-c', 0.93]]) {
        pill.style.setProperty(`--flow-x${name}`, `${Math.round(dx * ratio)}px`);
      }
      pill.classList.add('is-flowing');
    });
  }
  return pill;
}
