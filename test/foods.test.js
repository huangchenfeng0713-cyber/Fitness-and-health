import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOODS, FOOD_BY_ID, CATEGORIES, per100, nutrientsFor,
  searchFoods, unitLabel, portionTip, freeSugarFactor, PORTION_TIPS,
} from '../js/data/foods.js';

test('食物库规模与索引完整', () => {
  assert.ok(FOODS.length >= 280, `只有 ${FOODS.length} 条`);
  assert.equal(FOOD_BY_ID.size, FOODS.length, 'id 有重复，索引会丢条目');
});

test('每条记录字段齐全且合理', () => {
  for (const f of FOODS) {
    assert.ok(f.id && typeof f.id === 'string', `缺 id: ${f.name}`);
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
});

test('游离糖系数只对该免除的类别免除', () => {
  for (const f of FOODS) {
    const factor = freeSugarFactor(f);
    assert.ok(factor === 0 || factor === 1, `${f.name} 的系数应为 0 或 1`);
    if (f.cat === 'fruit' || f.cat === 'veg') assert.equal(factor, 0, `${f.name} 的天然糖不该计入`);
    if (f.cat === 'snack') assert.equal(factor, 1, `${f.name} 的糖应计入`);
  }
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
