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

test('奶茶按糖度分档，且热量随糖度单调下降', () => {
  const ids = ['tea_boba_full', 'tea_boba_half', 'tea_boba_low', 'tea_boba_none'];
  const rows = ids.map((id) => {
    const f = FOOD_BY_ID.get(id);
    assert.ok(f, `缺少 ${id}`);
    return { name: f.name, ...nutrientsFor(f, f.s[0][1]) };
  });
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].kcal < rows[i - 1].kcal,
      `${rows[i].name}(${rows[i].kcal}) 应低于 ${rows[i - 1].name}(${rows[i - 1].kcal})`);
    assert.ok(rows[i].sugar < rows[i - 1].sugar, '糖也应随糖度递减');
  }
  // 全糖与三分糖的差距要足够大，否则分档没意义
  assert.ok(rows[0].kcal - rows[2].kcal >= 80,
    `全糖与三分糖只差 ${rows[0].kcal - rows[2].kcal} kcal，分档意义不大`);
});

test('茶饮均标为估算（品牌不公开营养表）', async () => {
  const { isEstimated } = await import('../js/data/foods.js');
  const tea = FOODS.filter((f) => f.cat === 'chain' && /茶|奶|拿铁|仙草/.test(f.name));
  const notMarked = tea.filter((f) => !isEstimated(f) && !/星巴克|瑞幸/.test(f.name));
  assert.deepEqual(notMarked.map((f) => f.name), [],
    '茶饮品牌不公开营养表，应一律标为估算');
});
