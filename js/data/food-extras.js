/**
 * v2.10 新增食物。
 *
 * 这批条目单独注册，避免为了少量新增食物整段重写体量很大的 foods.js。
 * FOODS 与 FOOD_BY_ID 都是可变容器；在 app.js 之前加载本模块后，搜索、份量、
 * 推荐和复合食物计算会和内置条目完全一致。
 */

import { FOODS, FOOD_BY_ID } from './foods.js';

const SOURCE_RINGING_ROLL = Object.freeze({
  type: 'recipe',
  ref: '响铃卷按油炸腐皮代表值估算；《生命时报》2024-03-09曾引用某品牌营养表：每100g约640kcal、脂肪65.3g',
  accessed: '2026-08-31',
});

const SOURCE_JUEWEI_SHUIZHU = Object.freeze({
  type: 'recipe',
  ref: '携程公开的南昌/德安“绝味水煮”门店菜单核对常见品名；营养按对应食材与南昌水煮常见油盐调味估算',
  accessed: '2026-08-31',
});

const ready = (extra = {}) => ({
  basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total', ...extra,
});

const foods = [
  {
    id: 'ringing_roll_fried',
    name: '响铃卷（油炸腐皮卷）',
    alias: 'xianglingjuan ringing roll 炸响铃 油炸豆皮 火锅响铃卷 铃铃卷',
    cat: 'soy',
    n: [640, 15, 61, 8, 2, 1, 180],
    s: [['一根', 12], ['两根', 24], ['一小份', 50]],
    source: SOURCE_RINGING_ROLL,
    ...ready(),
    note: '按常见油炸响铃卷本体估算；品牌吸油量差异很大。放进火锅、水煮或麻辣烫后还会吸附汤汁与油脂，实际热量和钠可能更高',
    f: ['fried', 'processed', 'est'],
  },

  /* “绝味水煮”在南昌是独立水煮小吃品牌，并非绝味鸭脖产品线。门店菜单会变化。 */
  {
    id: 'jw_shuizhu_lotus', name: '绝味水煮·藕片', alias: '绝味水煮 藕片 xiangla oupian', cat: 'chain',
    n: [95, 1.8, 4.0, 13.0, 2.5, 2.5, 650], s: [['一份', 80]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按藕片煮制后拌入香辣调味估算', f: ['est'],
  },
  {
    id: 'jw_shuizhu_spinach', name: '绝味水煮·菠菜', alias: '绝味水煮 菠菜 bocai', cat: 'chain',
    n: [55, 2.8, 3.0, 4.0, 2.2, 0.5, 600], s: [['一份', 80]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按焯煮菠菜和附着调味油汁估算', f: ['est'],
  },
  {
    id: 'jw_shuizhu_potato', name: '绝味水煮·土豆片', alias: '绝味水煮 土豆片 potato tudou', cat: 'chain',
    n: [110, 2.2, 4.0, 17.0, 1.5, 0.8, 600], s: [['一份', 100]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按熟土豆片和附着香辣调味估算；部分门店未必长期供应', f: ['est'],
  },
  {
    id: 'jw_shuizhu_tofu_puff', name: '绝味水煮·三角豆泡', alias: '绝味水煮 三角豆泡 油豆腐 tofu puff', cat: 'chain',
    n: [245, 15.0, 18.0, 8.0, 1.0, 1.0, 500], s: [['一个', 20], ['一份', 80]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '油炸豆泡本身含油，水煮后还会吸附汤汁；实际热量与钠受吸汁量影响较大', f: ['fried', 'processed', 'est'],
  },
  {
    id: 'jw_shuizhu_beancurd_sausage', name: '绝味水煮·豆肠', alias: '绝味水煮 豆肠 豆制品 beancurd roll', cat: 'chain',
    n: [195, 15.0, 12.0, 8.0, 1.0, 1.0, 650], s: [['一份', 80]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '豆肠各地产品配方差异较大，按常见压制豆制品加香辣调味估算', f: ['processed', 'est'],
  },
  {
    id: 'jw_shuizhu_crabstick', name: '绝味水煮·蟹肉棒', alias: '绝味水煮 蟹肉棒 xieroubang crab stick', cat: 'chain',
    n: [105, 8.0, 2.0, 14.0, 0.3, 5.0, 800], s: [['一根', 25], ['一份', 75]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按常见鱼糜蟹肉棒加水煮调味估算；品牌淀粉和钠差异明显', f: ['processed', 'est'],
  },
  {
    id: 'jw_shuizhu_tripe', name: '绝味水煮·牛肚', alias: '绝味水煮 牛肚 niudu tripe', cat: 'chain',
    n: [115, 14.0, 5.0, 3.0, 0, 0.5, 700], s: [['一份', 80]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按熟牛肚与香辣调味估算', f: ['est'],
  },
  {
    id: 'jw_shuizhu_pork_blood', name: '绝味水煮·猪血', alias: '绝味水煮 猪血 zhuxue pork blood', cat: 'chain',
    n: [65, 9.0, 2.0, 3.0, 0, 0.2, 650], s: [['一块', 50], ['一份', 100]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按熟猪血和汤汁附着量估算', f: ['processed', 'est'],
  },
  {
    id: 'jw_shuizhu_clam', name: '绝味水煮·花甲', alias: '绝味水煮 花甲 huajia clam', cat: 'chain',
    n: [85, 12.0, 2.0, 4.0, 0, 0.5, 650], s: [['一份可食部', 100]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按去壳可食部和附着汤汁估算；记录重量时不计贝壳', f: ['est'],
  },
  {
    id: 'jw_shuizhu_chicken_feet', name: '绝味水煮·鸡爪', alias: '绝味水煮 鸡脚 鸡爪 jizhua chicken feet', cat: 'chain',
    n: [235, 20.0, 16.0, 4.0, 0, 1.0, 750], s: [['一只可食部', 35], ['一份可食部', 105]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按去骨可食比例折算并计入香辣调味；实际整只称重会包含骨头', f: ['est'],
  },
  {
    id: 'jw_shuizhu_heart_lung', name: '绝味水煮·香辣心肺', alias: '绝味水煮 心肺 xinfei pork heart lung', cat: 'chain',
    n: [150, 17.0, 8.0, 5.0, 0.2, 1.0, 800], s: [['一份', 100]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按猪心肺混合熟食与香辣卤汁估算，具体内脏比例随门店变化', f: ['processed', 'est'],
  },
  {
    id: 'jw_shuizhu_lotus_ball', name: '绝味水煮·手工藕丸', alias: '绝味水煮 藕丸 ouwan lotus ball', cat: 'chain',
    n: [135, 4.0, 5.0, 19.0, 1.5, 2.0, 650], s: [['一个', 30], ['一份', 90]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按莲藕、淀粉和少量肉馅的常见手工藕丸估算，门店配方可能不同', f: ['processed', 'est'],
  },
  {
    id: 'jw_shuizhu_century_egg', name: '绝味水煮·皮蛋', alias: '绝味水煮 皮蛋 pidan century egg', cat: 'chain',
    n: [170, 12.0, 11.0, 7.0, 0, 0.5, 650], s: [['半个', 30], ['一个', 60]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按皮蛋与凉拌/水煮调味估算', f: ['processed', 'est'],
  },
  {
    id: 'jw_shuizhu_snail', name: '绝味水煮·螺蛳肉', alias: '绝味水煮 螺丝 螺蛳 luosi snail', cat: 'chain',
    n: [100, 14.0, 3.0, 4.0, 0, 0.3, 650], s: [['一份可食部', 80]], source: SOURCE_JUEWEI_SHUIZHU, ...ready(),
    note: '按去壳螺蛳可食部和香辣汤汁估算；若按带壳总重记录会明显高估', f: ['est'],
  },
  {
    id: 'juewei_shuizhu_mix',
    name: '绝味水煮（自选食材）',
    alias: 'juewei shuizhu 绝味水煮 南昌水煮 水煮自选 关东煮',
    cat: 'chain',
    n: [100, 7, 5, 8, 1, 1, 650],
    s: [['一份', 300]],
    source: SOURCE_JUEWEI_SHUIZHU,
    ...ready(),
    note: '“绝味水煮”是南昌常见水煮小吃品牌，各门店供应会变化。本条不套固定一碗营养；进入后按你实际选的食材与克数逐项计算',
    f: ['est'],
    mix: {
      label: '这份水煮里有什么',
      components: [
        { foodId: 'jw_shuizhu_lotus', label: '藕片', defaultGrams: 60, step: 10, max: 300 },
        { foodId: 'jw_shuizhu_spinach', label: '菠菜', defaultGrams: 50, step: 10, max: 300 },
        { foodId: 'jw_shuizhu_potato', label: '土豆片', defaultGrams: 0, step: 10, max: 300 },
        { foodId: 'jw_shuizhu_tofu_puff', label: '三角豆泡', defaultGrams: 40, step: 10, max: 250 },
        { foodId: 'jw_shuizhu_beancurd_sausage', label: '豆肠', defaultGrams: 0, step: 10, max: 250 },
        { foodId: 'jw_shuizhu_crabstick', label: '蟹肉棒', defaultGrams: 0, step: 5, max: 200 },
        { foodId: 'jw_shuizhu_tripe', label: '牛肚', defaultGrams: 0, step: 10, max: 250 },
        { foodId: 'jw_shuizhu_pork_blood', label: '猪血', defaultGrams: 0, step: 10, max: 300 },
        { foodId: 'jw_shuizhu_clam', label: '花甲（可食部）', defaultGrams: 0, step: 10, max: 300 },
        { foodId: 'jw_shuizhu_chicken_feet', label: '鸡爪（可食部）', defaultGrams: 0, step: 5, max: 250 },
        { foodId: 'jw_shuizhu_heart_lung', label: '香辣心肺', defaultGrams: 0, step: 10, max: 250 },
        { foodId: 'jw_shuizhu_lotus_ball', label: '手工藕丸', defaultGrams: 0, step: 10, max: 250 },
        { foodId: 'jw_shuizhu_century_egg', label: '皮蛋', defaultGrams: 0, step: 10, max: 180 },
        { foodId: 'jw_shuizhu_snail', label: '螺蛳肉（可食部）', defaultGrams: 0, step: 10, max: 250 },
      ],
    },
  },
];

for (const food of foods) {
  if (FOOD_BY_ID.has(food.id)) continue;
  FOODS.push(food);
  FOOD_BY_ID.set(food.id, food);
}
