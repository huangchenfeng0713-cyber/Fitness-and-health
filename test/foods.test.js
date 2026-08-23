import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOODS, FOOD_BY_ID, CATEGORIES, per100, nutrientsFor,
  searchFoods, unitLabel, portionTip, freeSugarFactor, freeSugarPer100, PORTION_TIPS,
  FOOD_META, isEstimated, macroEnergyPer100,
} from '../js/data/foods.js';

test('食物库规模与索引完整', () => {
  assert.ok(FOODS.length >= 816, `只有 ${FOODS.length} 条`);
  assert.equal(FOOD_BY_ID.size, FOODS.length, 'id 有重复，索引会丢条目');
});

const COMMON_FOOD_EXPANSION_IDS = [
  'glutinous_rice_cooked', 'eight_treasure_rice', 'salted_egg_meat_zongzi', 'redbean_zongzi',
  'plain_zongzi', 'lotus_glutinous_chicken', 'glutinous_siumai', 'mushroom_oil_rice',
  'tuna_onigiri', 'pork_floss_onigiri', 'purple_rice_ball', 'seaweed_plain_onigiri',
  'starch_sausage', 'corn_sausage', 'crispy_sausage', 'fish_tofu', 'grilled_gluten',
  'fried_sweet_potato_ball', 'wolf_tooth_potato', 'fried_chicken_rack',
  'crispy_pork_snack', 'liangfen_savory', 'bobo_chicken', 'nanchang_rice_noodle',
  'claypot_meat_soup', 'fried_rice_vermicelli_cn', 'soup_rice_noodle',
  'intestine_rice_noodle', 'duck_blood_vermicelli_soup', 'hainan_chicken_rice',
  'pork_trotter_rice', 'roast_duck_rice', 'pork_rib_rice', 'soy_sauce_fried_rice',
  'curry_chicken_rice', 'teriyaki_chicken_rice', 'chicken_cutlet_rice', 'char_siu_rice',
  'roast_goose_rice', 'ham_cheese_sandwich', 'pork_floss_bread', 'sausage_bun',
  'custard_bun', 'lava_bun', 'egg_yolk_pastry', 'wife_cake', 'glutinous_lotus_root',
  'glutinous_rice_ball_sweet', 'donkey_roll', 'sesame_ball', 'roasted_sweet_potato',
  'brown_sugar_mantou', 'egg_pancake_plain', 'grilled_mantou', 'baked_lamb_baozi',
  'rice_burger', 'self_heating_rice_meal', 'buldak_noodle_ready', 'fried_niangao',
  'stirfried_niangao', 'northeast_rice_wrap', 'cold_rice_cake', 'street_egg_burger',
  'omelette_rice',
];

test('v1.3 常见食品扩充完整，糯米主食、饭团和街边小吃可直接搜索', () => {
  assert.equal(COMMON_FOOD_EXPANSION_IDS.length, 64);
  for (const id of COMMON_FOOD_EXPANSION_IDS) {
    const food = FOOD_BY_ID.get(id);
    assert.ok(food, `缺少新增食物 ${id}`);
    assert.ok(food.source && food.basis && food.state && food.carbBasis, `${food.name} 缺可审计元数据`);
    assert.equal(isEstimated(food), true, `${food.name} 是通用配方，应明确标为估算`);
  }
  const terms = ['糯米饭', '饭团', '淀粉肠', '鱼豆腐', '烤面筋', '小酥肉',
    '南昌拌粉', '鸭血粉丝汤', '海南鸡饭', '猪脚饭', '蛋黄酥', '自热米饭'];
  assert.deepEqual(terms.filter((term) => searchFoods(term).length === 0), []);
  assert.equal(freeSugarPer100(FOOD_BY_ID.get('glutinous_rice_cooked')), 0,
    '原味糯米饭中的内源糖不应计入游离糖');
});

test('v1.2 扩充食物可搜索，复合菜和包装食品明确披露估算', () => {
  const must = ['砂锅粥', '刀削面', '灌汤包', '意大利面', '兔肉', '鸭血', '黄鳝', '罗非鱼',
    '天贝', '马苏里拉', '荷兰豆', '桑葚', '农家小炒肉', '夫妻肺片', '冒菜', '亲子丼',
    '魔芋爽', '苏打饼干', '龟苓膏', '双皮奶', '酒酿', '藕粉', '西梅汁'];
  assert.deepEqual(must.filter((name) => searchFoods(name).length === 0), []);
  for (const id of ['casserole_congee', 'farm_pork_stirfry', 'maocai', 'konjac_snack']) {
    const food = FOOD_BY_ID.get(id);
    assert.ok(isEstimated(food), `${food.name} 应显示为估算`);
    assert.ok(food.source && food.basis && food.state && food.carbBasis, `${food.name} 缺可审计元数据`);
  }
});

test('每条记录字段齐全且合理', () => {
  for (const f of FOODS) {
    assert.ok(f.id && typeof f.id === 'string', `缺 id: ${f.name}`);
    assert.match(f.id, /^[a-z0-9_]+$/, `${f.name} 的 id 只能用小写字母、数字和下划线`);
    assert.ok(f.name && typeof f.name === 'string', `缺名称: ${f.id}`);
    assert.ok(CATEGORIES[f.cat], `${f.name} 的分类 "${f.cat}" 不存在`);
    assert.equal(f.n.length, 7, `${f.name} 的营养数组应有 7 项`);
    for (const v of f.n) assert.ok(Number.isFinite(v) && v >= 0, `${f.name} 有非法营养值`);
    assert.ok(Array.isArray(f.s) && f.s.length, `${f.name} 缺常用份量`);
    for (const [name, g] of f.s) {
      assert.ok(typeof name === 'string' && name.length, `${f.name} 的份量缺名称`);
      assert.ok(g > 0 && g <= 1000, `${f.name} 的份量 ${g}g 不合理`);
    }
    assert.ok(Array.isArray(f.f), `${f.name} 缺语义标记数组`);
  }
});

test('热量与三大宏量自洽（纤维按 2 kcal/g 计）', () => {
  const off = [];
  for (const f of FOODS) {
    if (f.f.includes('alcohol')) continue;   // 酒精 7 kcal/g，不在三大宏量里
    const [kcal, protein, fat, carb, fiber] = f.n;
    if (kcal <= 20) continue;
    // 膳食纤维大部分不产能，按 2 kcal/g 折算，剩余碳水按 4
    const est = protein * 4 + fat * 9 + Math.max(carb - fiber, 0) * 4 + fiber * 2;
    // 低热量食物用相对容差过严：柠檬这类富含有机酸的，通用 Atwater 系数会高估十几千卡，
    // 但绝对差很小。所以取「相对 25%」与「绝对 12 kcal」中较宽的一个。
    const tolerance = Math.max(kcal * 0.25, 12);
    if (Math.abs(est - kcal) > tolerance) off.push(`${f.name}: 标注 ${kcal}，按宏量算 ${Math.round(est)}`);
  }
  assert.deepEqual(off, [], `以下条目热量与宏量对不上：\n${off.join('\n')}`);
});

test('纤维不超过碳水，糖不超过碳水', () => {
  for (const f of FOODS) {
    const [, , , carb, fiber, sugar] = f.n;
    assert.ok(fiber <= carb + 0.1, `${f.name} 的纤维(${fiber}) 超过了碳水(${carb})`);
    assert.ok(sugar <= carb + 0.1, `${f.name} 的糖(${sugar}) 超过了碳水(${carb})`);
  }
});

test('每个分类都有份量参照，且每条食物都能取到', () => {
  for (const key of Object.keys(CATEGORIES)) {
    assert.ok(PORTION_TIPS[key], `分类 ${CATEGORIES[key]} 缺份量参照`);
  }
  for (const f of FOODS) {
    assert.ok(portionTip(f).length > 10, `${f.name} 取不到份量参照`);
  }
});

test('量词换算读起来通顺', () => {
  assert.equal(unitLabel('一份'), '份');
  assert.equal(unitLabel('一块'), '块');
  assert.equal(unitLabel('一小把'), '小把');
  assert.equal(unitLabel('小碗'), '小碗', '本来就没有「一」的不动它');
  assert.equal(unitLabel('中杯'), '中杯');
});

test('搜索：中文、拼音、分类都能命中', () => {
  assert.ok(searchFoods('鸡胸').some((f) => f.id === 'chicken_breast'));
  assert.ok(searchFoods('jixiong').some((f) => f.id === 'chicken_breast'));
  assert.ok(searchFoods('niunai').some((f) => f.id === 'milk_whole'));
  assert.ok(searchFoods('蔬菜').length > 0, '按分类名也应能搜到');
  assert.equal(searchFoods('这个东西根本不存在').length, 0);
});

test('常见食物搜得到（按用户会输入的词来测，而不是看名字里有没有这几个字）', () => {
  const must = ['米饭', '鸡蛋', '牛奶', '鸡胸', '面条', '馒头', '豆腐', '苹果', '香蕉',
    '西兰花', '三文鱼', '牛肉', '酸奶', '燕麦', '咖啡', '奶茶', '火锅', '沙拉',
    '包子', '饺子', '粥', '虾', '排骨', '土豆', '番茄', '西红柿', '马铃薯', '稀饭',
    '白饭', '黑咖啡', '瘦牛肉', '水煮蛋', '鲜奶', '轻食'];
  const missing = must.filter((kw) => searchFoods(kw).length === 0);
  assert.deepEqual(missing, [], `以下词搜不到任何食物：${missing.join('、')}`);
});

test('份量换算：克数与营养线性对应', () => {
  const rice = FOOD_BY_ID.get('rice_white');
  const p = per100(rice);
  const half = nutrientsFor(rice, 50);
  const double = nutrientsFor(rice, 200);
  assert.equal(half.kcal, Math.round(p.kcal * 0.5));
  assert.equal(double.kcal, Math.round(p.kcal * 2));
  assert.equal(nutrientsFor(rice, 0).kcal, 0);
  assert.deepEqual(nutrientsFor(rice, -50), {
    kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, totalSugar: 0, sugar: 0, sodium: 0,
  }, '负克数必须按 0 处理，不能生成负营养');
});

test('游离糖可按部分糖扣除，不再强迫乳品整项全算或全免', () => {
  for (const f of FOODS) {
    const factor = freeSugarFactor(f);
    assert.ok(factor >= 0 && factor <= 1, `${f.name} 的游离糖比例应在 0~1`);
    if (f.cat === 'fruit' || f.cat === 'veg') assert.equal(factor, 0, `${f.name} 的天然糖不该计入`);
  }
  const yogurt = FOOD_BY_ID.get('yogurt_sweet');
  assert.ok(freeSugarFactor(yogurt) > 0 && freeSugarFactor(yogurt) < 1,
    '风味酸奶应只计添加部分，不能把乳糖全算进去');
  assert.equal(freeSugarPer100(FOOD_BY_ID.get('sb_latte')), 0, '纯拿铁乳糖不算游离糖');
});

test('总糖与游离糖分开保存，且游离糖不超过总糖', () => {
  for (const f of FOODS) {
    const n = nutrientsFor(f, 100);
    assert.ok(n.sugar <= n.totalSugar + 0.1, `${f.name} 的游离糖超过总糖`);
  }
  const yogurt = nutrientsFor(FOOD_BY_ID.get('yogurt_sweet'), 100);
  assert.equal(yogurt.totalSugar, 13);
  assert.ok(yogurt.sugar > 8 && yogurt.sugar < 9);
});

test('新增中国常见食物可搜索，通用复合菜明确标为估算', async () => {
  const { isEstimated } = await import('../js/data/foods.js');
  const must = ['小米饭', '杂粮饭', '胡辣汤', '重庆小面', '桂林米粉', '酸菜鱼', '毛血旺',
    '剁椒鱼头', '木须肉', '鱼香茄子', '叉烧', '盐水鸭', '猪蹄', '鸭胗', '素鸡', '腐乳', '杨梅', '枇杷'];
  assert.deepEqual(must.filter((name) => searchFoods(name).length === 0), []);
  assert.ok(isEstimated(FOOD_BY_ID.get('pickled_fish')));
  assert.ok(isEstimated(FOOD_BY_ID.get('tomato_egg')), '通用家常菜也应明确显示估算');
});

test('连锁快餐品牌都收录了，且搜品牌名首条是主力单品', async () => {
  const { isEstimated } = await import('../js/data/foods.js');
  const brands = {
    肯德基: '鸡腿堡', kfc: '鸡腿堡', 麦当劳: '巨无霸', 塔斯汀: '堡',
    必胜客: '比萨', 汉堡王: '皇堡', 德克士: null, 华莱士: null,
    赛百味: '三明治', 星巴克: null, 瑞幸: '拿铁', 蜜雪: null,
    喜茶: null, 老乡鸡: null, 沙县: null, 萨莉亚: null, 吉野家: null,
  };
  for (const [kw, expectFirst] of Object.entries(brands)) {
    const hits = searchFoods(kw);
    assert.ok(hits.length > 0, `搜不到品牌「${kw}」`);
    if (expectFirst) {
      assert.ok(hits[0].name.includes(expectFirst),
        `搜「${kw}」首条应是主力单品，实际是「${hits[0].name}」`);
    }
  }
  // 同名单品要能按品牌区分
  const fries = searchFoods('薯条').map((f) => f.name);
  assert.ok(fries.some((n) => n.includes('肯德基')) && fries.some((n) => n.includes('麦当劳')),
    `薯条应能区分品牌：${fries.join(' / ')}`);
  assert.ok(isEstimated(FOOD_BY_ID.get('tastien_spicy')), '塔斯汀未公开营养表，应标为估算');
  assert.ok(!isEstimated(FOOD_BY_ID.get('mcd_bigmac')), '巨无霸有官方数据，不该标估算');
});

test('连锁快餐的份量就是品牌的标准份，不是 100g', () => {
  const chain = FOODS.filter((f) => f.cat === 'chain');
  assert.ok(chain.length >= 50, `只有 ${chain.length} 条连锁快餐`);
  for (const f of chain) {
    const [name, g] = f.s[0];
    assert.ok(/个|块|只|份|杯|罐|中份|大杯|中碗|五块/.test(name),
      `${f.name} 的份量名「${name}」不像品牌标准份`);
    assert.ok(g >= 40 && g <= 600, `${f.name} 的份量 ${g}g 不合理`);
  }
});

test('搜索同分时按录入顺序，不按名称笔画', () => {
  // 数据里同品牌按常点程度排列，按名称排会让配菜跑到主食前面
  const kfc = searchFoods('肯德基').map((f) => f.name);
  const burgerAt = kfc.findIndex((n) => n.includes('香辣鸡腿堡'));
  const soupAt = kfc.findIndex((n) => n.includes('芙蓉鲜蔬汤'));
  assert.ok(burgerAt >= 0 && soupAt >= 0);
  assert.ok(burgerAt < soupAt, `主力单品应排在配菜前：${kfc.slice(0, 4).join(' / ')}`);
});

test('茶饮连锁品牌与主力品类都收录了', () => {
  const brands = ['蜜雪', '喜茶', '奈雪', '茶百道', '古茗', '沪上阿姨', '一点点',
    'coco', '书亦', '益禾堂', '茶颜悦色', '霸王茶姬', '库迪', '瑞幸', '星巴克'];
  const missing = brands.filter((b) => searchFoods(b).length === 0);
  assert.deepEqual(missing, [], `搜不到品牌：${missing.join('、')}`);

  const kinds = ['珍珠奶茶', '烧仙草', '奶盖', '黑糖', '芋圆', '水果茶', '纯茶', '拿铁'];
  const missKind = kinds.filter((k) => searchFoods(k).length === 0);
  assert.deepEqual(missKind, [], `搜不到品类：${missKind.join('、')}`);
});

test('糖度五档齐全，且包含常见别名', async () => {
  const { SUGAR_LEVELS } = await import('../js/data/foods.js');
  assert.deepEqual(SUGAR_LEVELS.map((l) => l.label),
    ['全糖', '七分糖', '半糖', '三分糖', '无糖'],
    '国内奶茶店的标准档位就是这五档');
  assert.deepEqual(SUGAR_LEVELS.map((l) => l.ratio), [1, 0.7, 0.5, 0.3, 0]);
  // 少糖 / 微糖 是同档的另一种叫法，得认
  assert.equal(SUGAR_LEVELS.find((l) => l.label === '七分糖').alias, '少糖');
  assert.equal(SUGAR_LEVELS.find((l) => l.label === '三分糖').alias, '微糖');
});

test('糖度换算：热量与糖随档位单调下降', async () => {
  const { SUGAR_LEVELS } = await import('../js/data/foods.js');
  const boba = FOOD_BY_ID.get('tea_boba');
  const rows = SUGAR_LEVELS.map((l) => ({ label: l.label, ...nutrientsFor(boba, 500, l.key) }));
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].kcal < rows[i - 1].kcal,
      `${rows[i].label}(${rows[i].kcal}) 应低于 ${rows[i - 1].label}(${rows[i - 1].kcal})`);
    assert.ok(rows[i].sugar < rows[i - 1].sugar, '糖也应随档位递减');
    assert.ok(rows[i].carb < rows[i - 1].carb, '碳水应跟着糖一起减');
  }
  assert.ok(rows[0].kcal - rows[3].kcal >= 80,
    `全糖与三分糖只差 ${rows[0].kcal - rows[3].kcal} kcal，分档意义不大`);
  // 蛋白脂肪不该被糖度影响
  assert.equal(rows[0].protein, rows[4].protein);
  assert.equal(rows[0].fat, rows[4].fat);
});

test('点无糖时，奶的乳糖与配料自带的糖不会被归零', () => {
  // 珍珠奶茶点无糖，珍珠的糖水和奶的乳糖仍在
  const boba = nutrientsFor(FOOD_BY_ID.get('tea_boba'), 500, 'none');
  assert.ok(boba.sugar > 0 && boba.sugar <= 8, `残留糖 ${boba.sugar}g 不合理`);
  assert.ok(boba.kcal > 250, '无糖奶茶不该只剩几十千卡');

  // 水果茶点无糖，水果自带的糖占比更高
  const fruit = nutrientsFor(FOOD_BY_ID.get('tea_fruit'), 500, 'none');
  assert.ok(fruit.sugar >= 10, `水果自带糖应保留，实得 ${fruit.sugar}g`);
});

test('本来就没有加糖的饮品不提供糖度选项', async () => {
  const { hasSugarLevel } = await import('../js/data/foods.js');
  for (const id of ['luckin_americano', 'tea_pure', 'sb_latte']) {
    assert.equal(hasSugarLevel(FOOD_BY_ID.get(id)), false,
      `${FOOD_BY_ID.get(id).name} 不该有糖度选项`);
  }
  for (const id of ['tea_boba', 'mixue_boba', 'heytea_grape', 'luckin_coconut']) {
    assert.equal(hasSugarLevel(FOOD_BY_ID.get(id)), true,
      `${FOOD_BY_ID.get(id).name} 应该能选糖度`);
  }
});

test('缺省不传糖度时按全糖算，与显式全糖一致', () => {
  const f = FOOD_BY_ID.get('tea_boba');
  assert.deepEqual(nutrientsFor(f, 500), nutrientsFor(f, 500, 'full'));
});

test('茶饮不再按糖度重复录入（糖度是选项，不是多条记录）', () => {
  // 只针对茶饮连锁：像「豆浆（无糖）/（加糖）」「美式咖啡（无糖）」是本来
  // 就不同的产品，不是同一杯的糖度变体，不该被这条规则误伤。
  const dupes = FOODS.filter((f) => f.cat === 'chain' && /（(全|半|三分|七分|少|微|无|标准)糖）/.test(f.name));
  assert.deepEqual(dupes.map((f) => f.name), [],
    `糖度应由界面选择：${dupes.map((f) => f.name).join('、')}`);

  // 同一个基础名不该出现多条茶饮
  const byBase = {};
  for (const f of FOODS.filter((x) => x.cat === 'chain')) {
    const base = f.name.replace(/（[^）]*）/g, '').trim();
    (byBase[base] ||= []).push(f.name);
  }
  const repeated = Object.entries(byBase).filter(([, v]) => v.length > 1);
  assert.deepEqual(repeated, [], `连锁条目重名：${repeated.map(([k]) => k).join('、')}`);
});

test('茶饮均标为估算（品牌不公开营养表）', async () => {
  const { isEstimated } = await import('../js/data/foods.js');
  const tea = FOODS.filter((f) => f.cat === 'chain' && /茶|奶|拿铁|仙草/.test(f.name));
  const notMarked = tea.filter((f) => !isEstimated(f) && !/星巴克|瑞幸/.test(f.name));
  assert.deepEqual(notMarked.map((f) => f.name), [],
    '茶饮品牌不公开营养表，应一律标为估算');
});

test('补剂、冰品、品牌方便面都能搜到', () => {
  const musts = [
    '增肌粉', 'myprotein', '鸭腿饭',
    '碎冰冰', '旺旺', '梦龙', '可爱多', '巧乐兹', '老冰棍', '钟薛高', '哈根达斯', '雪糕', '圣代',
    '康师傅', '统一', '老坛酸菜', '白象', '今麦郎', '出前一丁', '辛拉面', '合味道', '汤达人', '拉面说',
  ];
  const missing = musts.filter((k) => searchFoods(k).length === 0);
  assert.deepEqual(missing, [], `搜不到：${missing.join('、')}`);
});

test('方便面按品牌区分，且钠都标得足够高', () => {
  // 按语义标记筛，不靠名字里有没有「面」——「出前一丁 麻油味」就没有
  const noodles = FOODS.filter((f) => f.f.includes('instant'));
  const brands = ['康师傅', '统一', '白象', '今麦郎', '出前一丁', '农心', '日清'];
  for (const b of brands) {
    assert.ok(noodles.some((f) => f.name.includes(b)), `缺品牌 ${b}`);
  }
  // 油炸方便面一份下来钠普遍超过 1500mg，这是它最该被看见的问题
  for (const f of noodles.filter((x) => x.f.includes('fried'))) {
    const per = nutrientsFor(f, f.s[0][1]);
    assert.ok(per.sodium >= 1200, `${f.name} 一份只有 ${per.sodium}mg 钠，偏低得可疑`);
  }
});

test('冰品的糖占比合理（糖应占碳水的大部分）', () => {
  const ices = FOODS.filter((f) => /雪糕|冰棍|甜筒|冰淇淋|圣代|碎冰冰|梦龙|巧乐兹/.test(f.name));
  assert.ok(ices.length >= 10, `只有 ${ices.length} 种冰品`);
  for (const f of ices) {
    const p = per100(f);
    if (p.carb > 5) {
      assert.ok(p.sugar / p.carb >= 0.55,
        `${f.name} 的糖只占碳水的 ${Math.round((p.sugar / p.carb) * 100)}%，冰品不该这样`);
    }
  }
});

const SECOND_BATCH_IDS = [
  'oat_latte', 'braised_prawns', 'youpo_noodle', 'shengjian_bao',
  'chinese_sauerkraut', 'beef_ball', 'spanish_mackerel', 'processed_cheese_slice',
  'sweet_potato_congee', 'pumpkin_congee', 'salty_soymilk', 'steamed_rice_cake',
  'black_sesame_paste', 'chive_pocket', 'wuhan_doupi', 'rice_milk',
  'dapanji', 'scallion_lamb', 'cumin_lamb', 'home_style_tofu', 'braised_tofu',
  'minced_pork_tofu', 'celery_pork', 'broccoli_shrimp', 'white_boiled_shrimp',
  'cold_wood_ear', 'smashed_cucumber', 'sour_beef_hotpot',
  'black_soybean', 'fermented_black_bean', 'wheat_gluten', 'fried_gluten_ball', 'fuzhu_soaked',
  'sweet_potato_leaves', 'shepherd_purse', 'mustard_greens', 'water_caltrop',
  'winter_jujube', 'muskmelon', 'passion_fruit', 'mandarin',
  'twisted_dough_mahua', 'peach_cookie', 'mung_bean_cake', 'rice_crust',
  'sour_plum_drink', 'almond_drink', 'candied_hawthorn',
];

test('第二批 48 种中国常见食物完整录入且都带可审计元数据', () => {
  assert.equal(SECOND_BATCH_IDS.length, 48);
  for (const id of SECOND_BATCH_IDS) {
    const f = FOOD_BY_ID.get(id);
    assert.ok(f, `缺少第二批食物 ${id}`);
    assert.ok(f.source && typeof f.source === 'object', `${f.name} 缺 source`);
    assert.ok(f.basis, `${f.name} 缺 basis`);
    assert.ok(f.state, `${f.name} 缺 state`);
    assert.ok(Number.isFinite(f.edibleRatio), `${f.name} 缺 edibleRatio`);
    assert.ok(f.carbBasis, `${f.name} 缺 carbBasis`);
    if (f.source.type === 'recipe') {
      assert.ok(f.f.includes('est'), `${f.name} 是通用配方却未标 est`);
      assert.ok(isEstimated(f), `${f.name} 的 recipe 来源应自动视为估算`);
    }
  }
  assert.ok(FOODS.length >= 664, `第二批完成后应至少 664 条，实际 ${FOODS.length}`);
});

test('可选食物元数据遵守稳定 schema，旧条目仍可不带元数据', () => {
  assert.ok(!FOOD_BY_ID.get('rice_white').source, '旧条目不应被强制迁移才能继续使用');
  for (const f of FOODS) {
    if (f.source !== undefined) {
      assert.ok(f.source && typeof f.source === 'object' && !Array.isArray(f.source), `${f.name} 的 source 非对象`);
      assert.ok(FOOD_META.sourceTypes.includes(f.source.type), `${f.name} 的 source.type 非法`);
      assert.ok(typeof f.source.ref === 'string' && f.source.ref.trim().length >= 4, `${f.name} 的 source.ref 过短`);
      if (f.source.accessed !== undefined) {
        assert.match(f.source.accessed, /^\d{4}-\d{2}-\d{2}$/, `${f.name} 的 accessed 应为 YYYY-MM-DD`);
      }
    }
    if (f.basis !== undefined) assert.ok(FOOD_META.bases.includes(f.basis), `${f.name} 的 basis 非法`);
    if (f.state !== undefined) assert.ok(FOOD_META.states.includes(f.state), `${f.name} 的 state 非法`);
    if (f.carbBasis !== undefined) assert.ok(FOOD_META.carbBases.includes(f.carbBasis), `${f.name} 的 carbBasis 非法`);
    if (f.edibleRatio !== undefined) {
      assert.ok(Number.isFinite(f.edibleRatio) && f.edibleRatio > 0 && f.edibleRatio <= 1,
        `${f.name} 的 edibleRatio 必须在 (0, 1]`);
    }
  }
});

test('recipe 来源自动视为估算，并且新增配方显式保留 est 标记', () => {
  const synthetic = { cat: 'drink', source: { type: 'recipe', ref: '测试配方' }, f: [] };
  assert.equal(isEstimated(synthetic), true);
  const recipes = FOODS.filter((f) => f.source?.type === 'recipe');
  assert.ok(recipes.length >= 40, `只有 ${recipes.length} 条配方来源记录`);
  assert.deepEqual(recipes.filter((f) => !f.f.includes('est')).map((f) => f.name), [],
    '配方来源必须同时显式标 est，方便旧版界面兼容');
});

test('营养、糖层级与语义标记在合理范围内', () => {
  const allowedFlags = new Set([
    'fried', 'refined', 'processed', 'whole', 'quick', 'breakfast', 'late', 'cook',
    'sweetdrink', 'alcohol', 'natsugar', 'est', 'tealevel', 'instant',
  ]);
  for (const f of FOODS) {
    const [kcal, protein, fat, carb, fiber, totalSugar, sodium] = f.n;
    assert.ok(kcal <= 950, `${f.name} 热量超过物理合理范围`);
    assert.ok(protein <= 100 && fat <= 100 && carb <= 100, `${f.name} 宏量营养超过 100g/100g`);
    assert.ok(fiber <= carb + 0.1, `${f.name} 纤维超过碳水`);
    assert.ok(totalSugar <= carb + 0.1, `${f.name} 总糖超过碳水`);
    assert.ok(sodium <= 20000, `${f.name} 钠高得异常`);
    if (f.nfs !== undefined) assert.ok(f.nfs >= 0 && f.nfs <= totalSugar, `${f.name} 的 nfs 超过总糖`);
    if (f.sf !== undefined) assert.ok(f.sf >= 0 && f.sf <= totalSugar, `${f.name} 的 sf 超过总糖`);
    assert.ok(freeSugarPer100(f) >= 0 && freeSugarPer100(f) <= totalSugar + 0.1,
      `${f.name} 的游离糖不在 [0, 总糖]`);
    for (const flag of f.f) assert.ok(allowedFlags.has(flag), `${f.name} 使用了未知标记 ${flag}`);
  }
});

test('新增来源记录按声明的碳水口径复核能量', () => {
  const off = [];
  for (const f of FOODS.filter((x) => x.source && !x.f.includes('alcohol'))) {
    const kcal = f.n[0];
    const estimated = macroEnergyPer100(f);
    const tolerance = Math.max(18, kcal * 0.20);
    if (Math.abs(estimated - kcal) > tolerance) {
      off.push(`${f.name}: 标注 ${kcal}，宏量折算 ${Math.round(estimated)}`);
    }
  }
  assert.deepEqual(off, [], `来源记录存在能量口径冲突：\n${off.join('\n')}`);

  const base = { n: [0, 1, 1, 10, 2, 0, 0] };
  assert.equal(macroEnergyPer100({ ...base, carbBasis: 'total' }), 49);
  assert.equal(macroEnergyPer100({ ...base, carbBasis: 'available' }), 57);
});

test('名称与 id 不重复，四个历史错配已纠正并补回原食物', () => {
  const byName = new Map();
  const duplicateNames = [];
  for (const f of FOODS) {
    const key = f.name.normalize('NFKC').trim().toLowerCase();
    if (byName.has(key)) duplicateNames.push([byName.get(key), f.id, f.name]);
    else byName.set(key, f.id);
  }
  assert.deepEqual(duplicateNames, [], `存在完全同名条目：${JSON.stringify(duplicateNames)}`);

  assert.equal(FOOD_BY_ID.get('kungpao_shrimp').name, '宫保虾球');
  assert.equal(FOOD_BY_ID.get('liangpi_spicy').name, '麻辣凉皮');
  assert.equal(FOOD_BY_ID.get('guokui').name, '锅盔（肉馅）');
  assert.equal(FOOD_BY_ID.get('americano_milk').name, '美式咖啡（加奶）');
  for (const id of ['braised_prawns', 'youpo_noodle', 'shengjian_bao', 'oat_latte']) {
    assert.ok(FOOD_BY_ID.has(id), `修正错配后漏补 ${id}`);
  }
});

test('高价值合并项已拆分，汤汁与带壳食物的估算边界明确', () => {
  for (const id of ['chinese_sauerkraut', 'beef_ball', 'spanish_mackerel', 'processed_cheese_slice']) {
    assert.ok(FOOD_BY_ID.has(id), `未拆分 ${id}`);
  }
  for (const id of ['hulatang', 'chongqing_noodle', 'henan_huimian', 'guilin_rice_noodle',
    'cross_bridge_rice_noodle', 'sour_beef_hotpot']) {
    const f = FOOD_BY_ID.get(id);
    assert.ok(f?.note && /汤|汁/.test(f.note), `${f?.name || id} 未说明汤汁口径`);
  }
  for (const id of ['braised_prawns', 'broccoli_shrimp', 'white_boiled_shrimp']) {
    const f = FOOD_BY_ID.get(id);
    assert.ok(f.s.some(([label]) => /可食部|去壳/.test(label)), `${f.name} 未说明带壳重量口径`);
  }
});

test('旧复合菜在数据层显式披露估算，不再只依赖界面兜底', () => {
  const dishes = FOODS.filter((f) => f.cat === 'dish');
  assert.ok(dishes.length >= 130);
  assert.deepEqual(dishes.filter((f) => !f.f.includes('est')).map((f) => f.name), [],
    '所有通用菜肴都应显式标 est，导出数据也能识别估算值');
  assert.deepEqual(dishes.filter((f) => !f.note?.trim()).map((f) => f.name), [],
    '通用菜肴需要说明配方或汤汁边界');

  for (const id of ['beef_noodle', 'malatang', 'hotpot_clear', 'boiled_fish', 'ramen',
    'suanla_fen', 'luosifen', 'miso_soup', 'tom_yum']) {
    assert.match(FOOD_BY_ID.get(id).note, /汤|锅底|油汤/, `${id} 未说明汤汁是否计入`);
  }
});

test('连锁食品只有可复核 label 来源才允许不标估算', () => {
  const exact = FOODS.filter((f) => f.cat === 'chain' && !isEstimated(f));
  assert.equal(exact.length, 1, '本轮只核对了巨无霸的当前官网单份营养，不应扩大精确来源范围');
  for (const f of exact) {
    assert.equal(f.source?.type, 'label', `${f.name} 没有 label 来源却显示为精确值`);
    assert.match(f.source.ref, /麦当劳中国官网/, `${f.name} 缺可复核来源说明`);
    assert.equal(f.id, 'mcd_bigmac', `${f.name} 尚无本轮逐项核验依据，不应取消估算标记`);
  }
  for (const id of ['kfc_spicy_burger', 'bk_whopper', 'ph_supreme', 'subway_chicken', 'mcd_nuggets']) {
    assert.ok(isEstimated(FOOD_BY_ID.get(id)), `${id} 未保存当前官方标签，应保守标估算`);
    assert.ok(FOOD_BY_ID.get(id).f.includes('est'), `${id} 的数据层也应显式标 est`);
  }
});

test('鲜干龙眼、甜咸豆花和近义但不同的名称已拆清', () => {
  assert.equal(FOOD_BY_ID.get('longan').name, '龙眼（鲜）');
  assert.equal(FOOD_BY_ID.get('dried_longan').name, '桂圆干（龙眼肉）');
  assert.equal(FOOD_BY_ID.get('douhua').name, '豆腐脑（咸口）');
  assert.equal(FOOD_BY_ID.get('sweet_douhua').name, '豆花（甜口）');
  assert.ok(searchFoods('桂圆干').some((f) => f.id === 'dried_longan'));
  assert.ok(searchFoods('甜豆花').some((f) => f.id === 'sweet_douhua'));
  assert.equal(FOOD_BY_ID.get('yinsijuan').name, '银丝卷（蒸）');
  assert.equal(FOOD_BY_ID.get('mayo').name, '蛋黄酱（原味）');
  assert.ok(FOODS.length >= 666, `拆分后应至少 666 条，实际 ${FOODS.length}`);
});

test('带骨壳旧条目按可食部记录，毛重比例不会再被当作可吃重量', () => {
  for (const id of ['chicken_wing', 'roast_chicken_leg', 'crab', 'crayfish',
    'garlic_scallop', 'salt_pepper_shrimp', 'roast_duck_leg']) {
    const f = FOOD_BY_ID.get(id);
    assert.ok(f.s.some(([label]) => /可食部|去骨|去壳/.test(label)), `${f.name} 份量未注明可食部`);
    assert.ok(f.note && /可食|骨|壳/.test(f.note), `${f.name} 缺带骨壳边界说明`);
  }
  assert.ok(FOOD_BY_ID.get('crab').s[0][1] < 100, '一只中等蟹不应把 150g 毛重全算成蟹肉');
  assert.ok(FOOD_BY_ID.get('crayfish').s[0][1] < 150, '小龙虾不应把整盘带壳重量全算成虾肉');
});

test('完整谷薯、豆和坚果的内源糖不计入 WHO 游离糖', () => {
  const intrinsic = [
    'sweet_potato', 'corn', 'purple_potato', 'water_caltrop',
    'soybean', 'black_soybean', 'chickpea', 'edamame',
    'almond', 'cashew', 'pistachio', 'macadamia', 'egg_whole', 'seaweed_sheet',
  ];
  for (const id of intrinsic) {
    const f = FOOD_BY_ID.get(id);
    assert.equal(f.nfs, f.n[5], `${f.name} 的内源糖应显式落在 nfs`);
    assert.equal(freeSugarPer100(f), 0, `${f.name} 不应产生游离糖`);
  }
  assert.ok(freeSugarPer100(FOOD_BY_ID.get('sweet_douhua')) > 5,
    '甜豆花的糖水仍应计入游离糖，不能因豆制品类别被整体豁免');
});
