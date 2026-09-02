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
 * 饮食页把它钉在滚动卡片底部；健身页则把同一组件挂进应用壳的
 * `#actionbar`，固定在内容区与 tab 栏之间。
 */

import { h, mount, clearEl } from './utils.js';
import { icon } from './icons.js';

/**
 * 建一个多选条。返回的对象只有 render 和 el —— 数据留在调用方，
 * 这里不存状态，否则两个页面切来切去会互相看到对方的选择。
 *
 * @param {object} opts
 * @param {() => string} opts.summary        主行，比如「已选 3 样 · 812 kcal」
 * @param {() => string} [opts.detail]        副行，比如「蛋白 52g」；挤不下就别塞进主行
 * @param {() => string} opts.actionLabel    确认按钮上的字（可以只是一个勾）
 * @param {() => string} [opts.actionAriaLabel] 按钮只有一个符号时，给读屏软件的说法
 * @param {() => Array}  opts.items          展开后逐项列出，每项 { key, label, note, tag? }
 * @param {(key) => void} opts.onRemove      去掉某一项
 * @param {() => void}   opts.onConfirm      提交
 * @param {() => void}   opts.onClear        全部清掉
 * @param {boolean}      [opts.alwaysVisible] 没有选中项时是否仍显示（用于固定操作栏）
 */
export function selectBar({
  summary, detail, actionLabel, actionAriaLabel, items, onRemove, onConfirm, onClear,
  alwaysVisible = false,
}) {
  const el = h('div.select-bar', { hidden: true });
  let open = false;

  function render() {
    const list = items();
    clearEl(el);
    const empty = list.length === 0;
    // 饮食清单没内容时收起；健身固定栏则保留，并把提交按钮置灰。
    el.hidden = empty && !alwaysVisible;
    if (empty) open = false;
    if (el.hidden) return;
    const sub = detail ? detail() : '';
    mount(el,
      open && !empty ? h('div.select-bar-list', null,
        list.map((it) => h('div.select-bar-item', null,
          h('div.select-bar-item-main', null,
            h('div.select-bar-item-title', null,
              h('strong', null, it.label),
              it.tag || null),
            it.note ? h('span.select-bar-item-note', null, it.note) : null),
          h('button.icon-btn', {
            type: 'button', 'aria-label': `去掉 ${it.label}`,
            onclick: () => { onRemove(it.key); render(); },
          }, icon('close')))),
        // 「清空」收在展开区里：收起时那一行只该有摘要和主操作，挤三个东西会换行
        h('button.text-btn.select-bar-clear', {
          type: 'button', onclick: () => { onClear(); open = false; render(); },
        }, '清空全部')) : null,
      h('div.select-bar-main', null,
        // 摘要本身是展开开关：多选之后最想确认的就是「我到底选了什么」
        h('button.select-bar-summary', {
          type: 'button', 'aria-expanded': String(open), disabled: empty,
          onclick: () => { open = !open; render(); },
        },
        h('span.select-bar-summary-text', null,
          h('strong', null, summary()),
          sub ? h('span.select-bar-detail', null, sub) : null),
        empty ? null : h('span.select-bar-caret', { 'aria-hidden': 'true' }, open ? '⌄' : '⌃')),
        h('button.primary-btn.select-bar-go', {
          type: 'button',
          disabled: empty,
          // 按钮上只有一个符号时，读屏软件念不出它是干什么的
          'aria-label': actionAriaLabel ? actionAriaLabel() : null,
          onclick: () => { if (empty) return; open = false; onConfirm(); },
        }, actionLabel())));
  }

  render();
  return { el, render };
}
