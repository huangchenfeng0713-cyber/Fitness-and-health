/**
 * 人体部位图的形状数据。
 *
 * 只是一组形状，没有逻辑 —— 放 data/ 和食物库、动作库同层。
 *
 * 用矩形和椭圆拼，不用手绘路径：这是「点哪儿选哪块」的按钮，不是解剖图。
 * 手绘路径既难画准，又会让人以为它在标注具体某一束肌肉；
 * 几何块反而一眼看懂「这一块代表胸」。
 *
 * 正反两个视图并排 —— 背和斜方肌在正面图上画不出来，硬塞会让人对不上位置。
 * 坐标系 100 × 190，外面按卡片宽度等比缩放。
 */

/** 不可点的底：头和脖子，只是让人认出这是个人 */
export const BODY_BASE = [
  { view: 'both', shape: 'circle', cx: 50, cy: 13, r: 9 },
  { view: 'both', shape: 'rect', x: 45, y: 21, w: 10, h: 6, rx: 2 },
];

/**
 * 可点区域。同一组可以有好几块（比如左右手臂）。
 * group 对应 data/exercises.js 里 GROUPS 的 key。
 */
export const REGIONS = [
  // ---- 正面 ----
  { group: 'shoulder', view: 'front', shape: 'circle', cx: 30, cy: 35, r: 8 },
  { group: 'shoulder', view: 'front', shape: 'circle', cx: 70, cy: 35, r: 8 },
  { group: 'chest', view: 'front', shape: 'rect', x: 35, y: 28, w: 30, h: 22, rx: 7 },
  { group: 'core', view: 'front', shape: 'rect', x: 38, y: 52, w: 24, h: 30, rx: 6 },
  // 手臂并进「肩（臂）」，和 GROUPS 的划分保持一致
  { group: 'shoulder', view: 'front', shape: 'rect', x: 22, y: 44, w: 10, h: 40, rx: 5 },
  { group: 'shoulder', view: 'front', shape: 'rect', x: 68, y: 44, w: 10, h: 40, rx: 5 },
  { group: 'leg', view: 'front', shape: 'rect', x: 36, y: 85, w: 12, h: 90, rx: 6 },
  { group: 'leg', view: 'front', shape: 'rect', x: 52, y: 85, w: 12, h: 90, rx: 6 },

  // ---- 背面 ----
  { group: 'shoulder', view: 'back', shape: 'circle', cx: 30, cy: 35, r: 8 },
  { group: 'shoulder', view: 'back', shape: 'circle', cx: 70, cy: 35, r: 8 },
  { group: 'back', view: 'back', shape: 'rect', x: 35, y: 28, w: 30, h: 34, rx: 7 },
  { group: 'back', view: 'back', shape: 'rect', x: 38, y: 64, w: 24, h: 18, rx: 5 },
  { group: 'shoulder', view: 'back', shape: 'rect', x: 22, y: 44, w: 10, h: 40, rx: 5 },
  { group: 'shoulder', view: 'back', shape: 'rect', x: 68, y: 44, w: 10, h: 40, rx: 5 },
  { group: 'leg', view: 'back', shape: 'rect', x: 36, y: 85, w: 12, h: 90, rx: 6 },
  { group: 'leg', view: 'back', shape: 'rect', x: 52, y: 85, w: 12, h: 90, rx: 6 },
];

export const VIEW_LABEL = { front: '正面', back: '背面' };
