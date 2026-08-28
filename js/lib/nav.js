/**
 * 跨页面的一次性意图。
 *
 * 「蛋白还差 83g」这条提示在今日页，而能补蛋白的食物在饮食页 ——
 * 点一下就该带着「我要补蛋白」这件事跳过去，而不是让人自己再想一遍要搜什么。
 *
 * 用一个模块级的槽而不是 URL 参数：意图只该生效一次，
 * 写进 hash 的话刷新、返回、分享链接都会把它带回来。
 * 视图之间不许互相 import（见 test/module-refs.test.js），所以放在 lib 里当中转。
 */

let pending = null;

/** 记下一个意图，然后切页；take 之后就没了 */
export function setIntent(intent) {
  pending = intent || null;
}

/** 取走意图。取过一次就清空，重绘时不会反复触发 */
export function takeIntent() {
  const v = pending;
  pending = null;
  return v;
}
