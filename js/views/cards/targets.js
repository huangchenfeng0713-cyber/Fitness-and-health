/**
 * 当前每日目标卡片。挂在数据页：下方图表画的就是「离这些目标还差多少」，
 * 目标和走势放在同一页才对得上。
 *
 * 默认只显示一行。八项目标里前四项在今日页的主卡上已经作为分母出现过
 * （85/87g 蛋白、1867/2000mg 钠…），真要逐条核对的场合并不多；
 * 但「依据是什么」得随时查得到，所以展开和信息按钮都留着。
 */

import { h, num, infoTip } from '../../lib/utils.js';
import { state } from '../../lib/store.js';
import { GOALS } from '../../core/nutrition.js';

/*
 * 展开状态放模块级：整页重绘每 60 秒就会跑一次，
 * 用 <details> 或存在 DOM 里的话，看到一半会被自己收起来。
 */
let open = false;

export function targetCard(rerender = () => {}) {
  const d = state.derived;
  if (!d) return null;
  const t = d.targets;
  const energyBasis = t.tdeeSource !== 'apple'
    ? '按活动系数估算'
    : t.activeSource === 'formula-fallback'
      ? '静息采用设备记录，缺失活动按活动系数补足'
      : t.activeSource === 'device-baseline'
        ? '活动采用近期设备记录基线估算'
        : '按今日 Apple 能量记录动态估算';
  const rows = [
    ['热量', `${num(t.kcal)} kcal`, energyBasis],
    ['蛋白质', `${num(t.protein)} g`, t.proteinBasis],
    ['脂肪', `${num(t.fat)} g（参考上限 ${num(t.fatUpper || t.fat)} g）`,
      '计划值用于分配三大营养素；真正的参考上限按总热量 35% 计算'],
    ['碳水', `${num(t.carb)} g`, '总热量减去蛋白与脂肪后的剩余'],
    ['膳食纤维', `${num(t.fiber)} g`, '中国成人参考 25–30g'],
    ['钠上限', `${num(t.sodium)} mg`, '约等于 5g 食盐'],
    ['游离糖上限', `${num(t.sugar)} g`, '含糖浆、蜂蜜和果汁中的糖；低于总热量 10%'],
    ['饮水参考', `${num(t.waterMl)} ml`, '温和气候、低活动；运动或炎热天气需额外补充'],
  ];
  // 收起时的一行：热量和三大营养素，其余四项展开才看
  const brief = [
    `${num(t.kcal)} kcal`,
    `蛋白 ${num(t.protein)} g`,
    `碳水 ${num(t.carb)} g`,
    `脂肪 ${num(t.fat)} g`,
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, d.isToday ? '当前每日目标' : `${state.day} · 按当前设置估算`),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${GOALS[t.goal].label} · ${t.rateKgPerWeek > 0 ? '+' : ''}${t.rateKgPerWeek} kg/周`),
        infoTip('查看目标计算依据',
          h('ul', null, rows.map(([name, , note]) => h('li', null,
            h('strong', null, `${name}：`), note)))))),
    open
      ? h('div.target-list', null, rows.map(([k, v]) => h('div.target-row', null,
        h('span.target-key', null, k),
        h('strong.target-val', null, v))))
      : h('div.stat-line', null, brief.map((text) => h('span.stat-bit', null,
        h('strong', null, text)))),
    h('button.more-btn', {
      onclick: () => { open = !open; rerender(); },
    }, open ? '收起' : '展开其余 4 项'),
    // 这两条是「你填的数被改过了」，收起时也必须看得见
    t.clampedByFloor && h('p.warn-note', null,
      '注意：按目标速率算出的热量低于成人常用饮食计划下限（女 1200 / 男 1500 kcal），已自动上调；如有疾病、孕哺或特殊训练需求，请由专业人员个体化评估。'),
    t.rateWasClamped && h('p.warn-note', null,
      `你填写的 ${t.requestedRateKgPerWeek > 0 ? '+' : ''}${t.requestedRateKgPerWeek} kg/周过快，`
      + `已按体重比例和每日热量调整上限改为 ${t.rateKgPerWeek > 0 ? '+' : ''}${t.rateKgPerWeek} kg/周。`),
  );
}
