/**
 * 「当前饮食推荐 / 喝水」两张卡。
 *
 * 原先长在今日页上。但今日页要回答的是「我今天怎么样」，
 * 而这三张都是「我现在该做什么」——真要照着做的时候人已经在饮食页了，
 * 隔着一次切页反而多余。抽成卡片模块挂到饮食页，搬家只改一行 import。
 */

import { h, num, toast, runLocalAction } from '../../lib/utils.js';
import { icon } from '../../lib/icons.js';
import { infoTip, listRow } from '../../lib/ui.js';
import { state, saveHealthDay } from '../../lib/store.js';
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
      h('div.rec-name', null, f.name, estimateTag(f)),
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
 * 撤销要退回**这一串连点之前**，不是只退一下。
 *
 * 快速点两下之后按撤销，原先只减 1 —— 人看到的是「我点了两下，撤销一下，
 * 还多出一次」。这里记住这一串开始前的次数，撤销直接回到那个值。
 * 撤销窗口关掉（五秒没动）之后再点，就是新的一串。
 */
let undoBaseline = null;
let lastTapAt = 0;
/* 间隔超过这么久就算新的一串，撤销只退最近这一串 */
const BURST_GAP_MS = 1500;

async function setWater(next) {
  const target = Math.max(0, Math.min(MAX_WATER_TAPS, Math.round(next)));
  if (target === waterTaps()) return;
  await saveHealthDay(state.day, { waterCount: target, source: 'manual' });
}

const bumpWater = (delta) => setWater(waterTaps() + delta);

/*
 * 提示窗口挂在模块上，不挂在节点上：这张卡每次落库都会整个重建，
 * 挂在节点上的状态会跟着一起没。
 */
function openUndoWindow(rerender, before = null) {
  /*
   * 一串连点只记第一下之前的次数。
   * 「同一串」按**两下之间的间隔**算，不按撤销窗口算 —— 撤销窗口是从
   * 最后一下起五秒，隔四秒点一下也会把它续上，那样慢慢点十下会被当成一串。
   */
  const now = Date.now();
  if (before != null && now - lastTapAt > BURST_GAP_MS) undoBaseline = before;
  lastTapAt = now;
  undoUntil = Date.now() + UNDO_WINDOW_MS;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoUntil = 0;
    undoBaseline = null;
    rerender();
  }, UNDO_WINDOW_MS);
}

function closeUndoWindow() {
  undoUntil = 0;
  undoBaseline = null;
  clearTimeout(undoTimer);
}

/**
 * 水滴甩到数字上。
 *
 * **整段动画跑在 body 上，不挂在这张卡的任何节点上。**
 * 卡片每次落库都会重建，挂在卡里的动画会连节点一起被换掉 ——
 * 前两版都栽在这儿：一次点击引发两次渲染，动画挂在第一个节点上，
 * 而它马上就被第二个换掉了，于是「只有第一次能看到」。
 *
 * 用 Web Animations 而不是 CSS 关键帧：位移是算出来的像素，
 * 直接以数值传进去，不必往关键帧里塞 calc(var(--x) * n)
 * （Safari 对那个支持不稳，整条关键帧一失效就只剩第一帧）。
 */
/* 水滴飞行的时长，以及它落进数字的那一刻 —— 涟漪和数字都对着这个时刻起 */
const FLY_MS = 620;
const LAND_MS = 380;

function flyDrop(pill) {
  if (!pill?.isConnected) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const drop = pill.querySelector('.water-drop');
  const count = pill.querySelector('.water-count');
  if (!drop || !count || typeof drop.animate !== 'function') return;

  const a = drop.getBoundingClientRect();
  const b = count.getBoundingClientRect();
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  // 量不到就不放动画，不猜一个距离 —— 猜错了水滴会停在半路或飞出卡片
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < 6) return;

  const fly = drop.cloneNode(true);
  fly.classList.add('water-fly');
  Object.assign(fly.style, {
    left: `${a.left}px`, top: `${a.top}px`,
    width: `${a.width}px`, height: `${a.height}px`,
  });
  document.body.append(fly);
  /*
   * 原地那滴让开：飞的是它自己，不是凭空多出来一个副本。
   * 落定之后再淡回来 —— 横幅上不能空着一格。
   * fill 用默认的 none，动画一结束样式自动还原，不会在节点上留残值。
   */
  drop.animate([
    { opacity: 1 }, { opacity: 0, offset: 0.06 },
    { opacity: 0, offset: 0.62 }, { opacity: 1 },
  ], { duration: FLY_MS + 460, easing: 'ease-out' });
  /*
   * 像水而不是像图标在滑轨上走，靠的是形变：起手下沉蓄势，
   * 飞行段沿运动方向拉长，从文字上方划过，落点摊开压扁。
   */
  const at = (t, ax, ay, sx, sy, o) => ({
    offset: t,
    transform: `translate(${Math.round(dx * ax)}px, ${Math.round(dy * ay)}px) scale(${sx}, ${sy})`,
    opacity: o,
  });
  /*
   * 起飞那一下由灰转绿：这滴水是「我按下去的那一下」，
   * 染色让它和右边那个绿色按钮对上，落进数字里也就有了来处。
   */
  const anim = fly.animate([
    { ...at(0, 0, 0, 1, 1, 1), color: 'var(--muted)' },
    { ...at(0.14, 0.08, 0.14, 0.8, 1.22, 1), color: 'var(--accent)', transform: `translate(${Math.round(dx * 0.08)}px, ${Math.round(dy * 0.14 + 4)}px) scale(.8, 1.22)` },
    { ...at(0.52, 0.52, 0.52, 1.55, 0.66, 0.95), transform: `translate(${Math.round(dx * 0.52)}px, ${Math.round(dy * 0.52 - 10)}px) scale(1.55, .66)` },
    { ...at(0.84, 0.93, 0.84, 1.15, 0.8, 0.75), transform: `translate(${Math.round(dx * 0.93)}px, ${Math.round(dy * 0.84 - 2)}px) scale(1.15, .8)` },
    { ...at(1, 1, 1, 0.4, 0.34, 0), color: 'var(--accent)' },
  ], { duration: FLY_MS, easing: 'cubic-bezier(.55, .02, .3, 1)', fill: 'both' });
  anim.finished.then(() => fly.remove(), () => fly.remove());

  /*
   * 落点在整条横幅里荡开。
   *
   * 涟漪要被框裁住才像「水在这个容器里回荡」—— 所以铺一层和横幅同样大小、
   * 同样圆角的裁剪层。波是扁椭圆，沿槽面铺开，不是正圆往外冒。
   * 这一层也挂在 body 上：横幅本身随时会被重绘换掉。
   */
  const wave = document.createElement('span');
  wave.className = 'water-wave';
  const pillBox = pill.getBoundingClientRect();
  Object.assign(wave.style, {
    left: `${pillBox.left}px`, top: `${pillBox.top}px`,
    width: `${pillBox.width}px`, height: `${pillBox.height}px`,
    borderRadius: getComputedStyle(pill).borderRadius,
  });
  // 波心落在数字上，半径取到最远那个角，才铺得满整条
  const originX = b.left + b.width / 2 - pillBox.left;
  const originY = b.top + b.height / 2 - pillBox.top;
  const reach = Math.ceil(Math.hypot(
    Math.max(originX, pillBox.width - originX),
    Math.max(originY, pillBox.height - originY),
  ));
  const rings = [0, 120, 240].map((delay, i) => {
    const ring = document.createElement('i');
    ring.className = 'water-ripple';
    Object.assign(ring.style, {
      left: `${originX}px`, top: `${originY}px`,
      width: `${reach * 2}px`, height: `${reach * 2}px`,
    });
    wave.append(ring);
    return ring.animate(
      [{ transform: 'translate(-50%, -50%) scale(.05, .12)', opacity: 0.58 - i * 0.1 },
        { transform: `translate(-50%, -50%) scale(${1.08 + i * 0.08}, ${0.46 + i * 0.1})`, opacity: 0 }],
      { duration: 760 + i * 70, delay: LAND_MS + delay, easing: 'cubic-bezier(.16,.72,.22,1)', fill: 'both' },
    );
  });
  const sheen = document.createElement('i');
  sheen.className = 'water-sheen';
  Object.assign(sheen.style, {
    left: `${originX}px`, top: `${originY}px`,
    width: `${Math.max(pillBox.width * 1.4, 80)}px`,
    height: `${pillBox.height * 1.8}px`,
  });
  wave.append(sheen);
  const gleam = sheen.animate(
    [{ transform: 'translate(-50%, -50%) scale(.2, .55)', opacity: 0 },
      { transform: 'translate(-18%, -50%) scale(.75, .9)', opacity: 0.42, offset: 0.3 },
      { transform: 'translate(18%, -50%) scale(1.2, .7)', opacity: 0 }],
    { duration: 920, delay: LAND_MS - 30, easing: 'ease-out', fill: 'both' },
  );
  const wash = wave.animate(
    [{ backgroundColor: 'transparent' },
      { backgroundColor: 'var(--accent-soft)', offset: 0.28 },
      { backgroundColor: 'transparent' }],
    { duration: 900, delay: LAND_MS, easing: 'ease-out', fill: 'both' },
  );
  document.body.append(wave);
  Promise.allSettled([...rings, gleam, wash].map((x) => x.finished)).then(() => wave.remove());

  /*
   * 文字跟着水面走：整句先抬再沉，数字稍晚一拍，像波从数字那儿穿过字面。
   * 节点是重绘之后新查到的，这段动画能跑完；下一次点才会再换节点。
   */
  const label = pill.querySelector('.water-label');
  if (label && typeof label.animate === 'function') {
    label.animate(
      [{ transform: 'translateY(0) skewX(0deg)' },
        { transform: 'translateY(-3.5px) skewX(-8deg)', offset: 0.18 },
        { transform: 'translateY(2.6px) skewX(6deg)', offset: 0.38 },
        { transform: 'translateY(-1.6px) skewX(-3.5deg)', offset: 0.58 },
        { transform: 'translateY(1px) skewX(2deg)', offset: 0.78 },
        { transform: 'translateY(0) skewX(0deg)' }],
      { duration: 760, delay: LAND_MS - 40, easing: 'ease-out' },
    );
  }
  count.animate(
    [{ transform: 'scale(1) translateY(0)' },
      { transform: 'scale(1.3) translateY(-4px)', offset: 0.3 },
      { transform: 'scale(.94) translateY(2px)', offset: 0.55 },
      { transform: 'scale(1.08) translateY(-1px)', offset: 0.76 },
      { transform: 'scale(1) translateY(0)' }],
    { duration: 640, delay: LAND_MS - 20, easing: 'ease-out' },
  );
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
          const before = waterTaps();
          const r = await runLocalAction(ev.currentTarget, () => bumpWater(1), '记录饮水');
          if (!r.ok) return;
          openUndoWindow(rerender, before);
          rerender();
          /*
           * 重绘之后从文档里重新查一次，别用 ev.currentTarget 往上找 ——
           * 那时候整张卡已经被换掉了，事件目标挂在一棵离开文档的树上，
           * 量出来的位置全是 0，动画直接被跳过。
           */
          flyDrop(document.querySelector('.water-row .water-pill'));
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
  const count = h('b.water-count', null, String(taps));
  return h('div.water-pill', { role: 'status', 'aria-live': 'polite' },
    dropletIcon(),
    h('span.water-label', null, '已记录 ', count, ' 次饮水'),
    justLogged
      ? [
        h('span.water-sep', { 'aria-hidden': 'true' }, '·'),
        h('button.water-undo', {
          type: 'button',
          onclick: async (ev) => {
            // 退回这一串连点之前，不是只减一下
            const back = undoBaseline;
            const r = await runLocalAction(ev.currentTarget,
              () => (back == null ? bumpWater(-1) : setWater(back)), '撤销');
            if (r.ok) { closeUndoWindow(); rerender(); }
          },
        }, '撤销'),
      ]
      : null);
}
