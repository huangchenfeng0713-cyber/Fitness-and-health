/**
 * 高频 UI 组件。
 *
 * 搜索框、弱标签与列表行如果只靠调用方记住一串 class，页面迟早会再次分叉：
 * 有的输入框忘了关闭自动纠错，有的标签高一像素，有的列表行把分隔线画到另一边。
 * 这里固定结构与默认语义；业务页面只提供内容和行为。
 */

import { h, infoTip, persistentInfoTip } from './utils.js';

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
  return {
    input,
    el: h('div.search-row.search-row-full.ui-search-field', { class: className }, input),
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
