/**
 * 多选条：选中若干项之后，一次性提交。
 *
 * 饮食和健身共用一套。两处原先都是「点一个 → 立刻落库 → 整页重绘」，
 * 代价在健身页量得出来：连点三个动作，页面每次都自己滚一段，
 * 同一行的 y 坐标从 813 跳到 201 又跳回 897 —— 列表在手指底下动，
 * 第二下十有八九点错。饮食那边更慢，一顿三菜一饭要 12 次操作，
 * 因为每记一样都要开一次份量弹层再关掉。
 *
 * 所以选中只改页面内存，不写库、不重绘；攒够了按一次确认。
 *
 * 它钉在滚动容器底部而不是视口底部：`.view` 才是真正在滚的那层
 * （见 sheet.js 里同一个坑），钉在视口上会盖住 tab 栏。
 */

import { h, mount, clearEl, icon } from './utils.js';

/**
 * 建一个多选条。返回的对象只有 render 和 el —— 数据留在调用方，
 * 这里不存状态，否则两个页面切来切去会互相看到对方的选择。
 *
 * @param {object} opts
 * @param {() => string} opts.summary        主行，比如「已选 3 样 · 812 kcal」
 * @param {() => string} [opts.detail]        副行，比如「蛋白 52g」；挤不下就别塞进主行
 * @param {() => string} opts.actionLabel    确认按钮上的字（可以只是一个勾）
 * @param {() => string} [opts.actionAriaLabel] 按钮只有一个符号时，给读屏软件的说法
 * @param {() => Array}  opts.items          展开后逐项列出，每项 { key, label, note }
 * @param {(key) => void} opts.onRemove      去掉某一项
 * @param {() => void}   opts.onConfirm      提交
 * @param {() => void}   opts.onClear        全部清掉
 */
export function selectBar({
  summary, detail, actionLabel, actionAriaLabel, items, onRemove, onConfirm, onClear,
}) {
  const el = h('div.select-bar', { hidden: true });
  let open = false;

  function render() {
    const list = items();
    clearEl(el);
    // 一项都没有时整条收起来：留一条空条会一直占着屏幕底部
    el.hidden = list.length === 0;
    if (!list.length) { open = false; return; }
    const sub = detail ? detail() : '';
    mount(el,
      open ? h('div.select-bar-list', null,
        list.map((it) => h('div.select-bar-item', null,
          h('div.select-bar-item-main', null,
            h('strong', null, it.label),
            it.note ? h('span.select-bar-item-note', null, it.note) : null),
          h('button.icon-btn', {
            type: 'button', 'aria-label': `去掉 ${it.label}`,
            onclick: () => { onRemove(it.key); render(); },
          }, icon('close', { size: 16 })))),
        // 「清空」收在展开区里：收起时那一行只该有摘要和主操作，挤三个东西会换行
        h('button.text-btn.select-bar-clear', {
          type: 'button', onclick: () => { onClear(); open = false; render(); },
        }, '清空全部')) : null,
      h('div.select-bar-main', null,
        // 摘要本身是展开开关：多选之后最想确认的就是「我到底选了什么」
        h('button.select-bar-summary', {
          type: 'button', 'aria-expanded': String(open),
          onclick: () => { open = !open; render(); },
        },
        h('span.select-bar-summary-text', null,
          h('strong', null, summary()),
          sub ? h('span.select-bar-detail', null, sub) : null),
        icon(open ? 'down' : 'up', { size: 15, cls: 'select-bar-caret' })),
        h('button.primary-btn.select-bar-go', {
          type: 'button',
          // 按钮上只有一个符号时，读屏软件念不出它是干什么的
          'aria-label': actionAriaLabel ? actionAriaLabel() : null,
          onclick: () => { open = false; onConfirm(); },
        }, actionLabel())));
  }

  render();
  return { el, render };
}
