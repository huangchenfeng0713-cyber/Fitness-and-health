/**
 * 高频 UI 组件。
 *
 * 搜索框、弱标签与列表行如果只靠调用方记住一串 class，页面迟早会再次分叉：
 * 有的输入框忘了关闭自动纠错，有的标签高一像素，有的列表行把分隔线画到另一边。
 * 这里固定结构与默认语义；业务页面只提供内容和行为。
 */

import { h, infoTip, persistentInfoTip } from './utils.js';
import { icon } from './icons.js';

export { infoTip, persistentInfoTip };

const classes = (...items) => items.filter(Boolean).join(' ');

/**
 * 统一搜索字段。返回外壳与 input 引用，兼顾稳定焦点和增量刷新场景。
 */
export function searchField({
  className = '',
  inputClassName = '',
  placeholder = '输入内容以搜索',
  ariaLabel = '搜索',
  value = '',
  ...inputProps
} = {}) {
  const input = h('input.search-input.ui-search-input', {
    type: 'search',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    placeholder,
    'aria-label': ariaLabel,
    value,
    class: inputClassName,
    ...inputProps,
  });
  /*
   * 清除键得自己画。
   *
   * `type="search"` 在桌面 Chrome 上有个原生的小叉，**iOS Safari 没有** ——
   * 而这个应用主要就是在 iPhone 上用。打错一个字要按住退格键删半天。
   * 有内容才出现：空的时候摆一个点不动的叉，只会让人以为坏了。
   */
  const clear = h('button.search-clear', {
    type: 'button',
    'aria-label': '清除搜索内容',
    hidden: !value,
    onclick: () => {
      input.value = '';
      syncClear();
      // 派发 input 事件，让调用方的搜索逻辑照常跑一遍，不用各自再记一份清空逻辑
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    },
  }, icon('close'));
  function syncClear() {
    clear.hidden = !input.value;
  }
  input.addEventListener('input', syncClear);

  return {
    input,
    clear,
    el: h('div.search-row.search-row-full.ui-search-field', { class: className }, input, clear),
  };
}

/** 低强调的辅助标签；tone 只表达视觉层级，不承担健康结论。 */
export function weakTag(text, {
  tone = 'soft',
  className = '',
  ariaLabel = null,
} = {}) {
  if (text == null || text === '') return null;
  return h('span.ui-weak-tag', {
    class: classes(`ui-weak-tag-${tone}`, className),
    'aria-label': ariaLabel,
  }, text);
}

/**
 * 统一列表行的结构基类。业务 class 仍负责特有布局，公共 class 负责触控、
 * 文字继承和分隔线等不会因页面不同而改变的部分。
 */
export function listRow({ as = 'div', className = '', ...props } = {}, ...children) {
  return h(as, { ...props, class: classes('ui-list-row', className) }, children);
}

/**
 * 一组互斥选择的无障碍语义。
 *
 * 界面上它们已经统一成分段控件（灰槽 + 选中格浮起一块白），但读屏听到的
 * 仍是「五个各自独立的切换按钮」—— 不知道它们是一组，也不知道现在选中的是哪个。
 *
 * 两种语义分开用，别混：
 *  - **tab**：切换的是「我现在看哪一组内容」（全部动作 / 推荐组合、身体部位 / 动作模式）。
 *  - **radio**：选的是一个值，页面主体不换（糖度、餐次、份量档）。
 *
 * 器械筛选那种「可以叠加在任一组之上」的过滤器不属于这两类，继续用 aria-pressed。
 */
export function groupRole(kind = 'tab') {
  return kind === 'radio'
    ? { container: 'radiogroup', item: 'radio', selected: 'aria-checked' }
    : { container: 'tablist', item: 'tab', selected: 'aria-selected' };
}

/** 一组互斥选择的容器属性 */
export function segmentedGroupProps(label, kind = 'tab') {
  return { role: groupRole(kind).container, 'aria-label': label };
}

/** 组里一个选项的属性 */
export function segmentedItemProps(active, kind = 'tab') {
  const role = groupRole(kind);
  return { type: 'button', role: role.item, [role.selected]: String(Boolean(active)) };
}
