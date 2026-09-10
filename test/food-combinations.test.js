import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOODS, FOOD_BY_ID, searchFoods, parseFoodCombination, generatedFoodById,
  hasFoodMix, foodMixNutrition, nutrientsFor, defaultFoodMix, foodMixComponents, foodBrandOptions,
} from '../js/data/foods.js';

test('高优先级固定菜与组合菜都能按用户输入首条命中', () => {
  const expected = new Map([
    ['胡萝卜炒鸡蛋', 'combo_carrot_egg_stir'], ['青椒炒鸡蛋', 'chili_scrambled_egg'],
    ['青椒炒蛋', 'chili_scrambled_egg'], ['火腿肠炒鸡蛋', 'combo_ham_egg_stir'],
    ['火腿炒鸡蛋', 'combo_ham_egg_stir'],
    ['土豆炒肉', 'combo_potato_pork_stir'], ['木耳炒肉', 'combo_wood_ear_pork_stir'],
    ['西兰花炒肉', 'combo_broccoli_pork_stir'], ['菜花炒肉', 'combo_cauliflower_pork_stir'],
    ['丝瓜炒鸡蛋', 'combo_luffa_egg_stir'], ['白菜炒肉', 'combo_cabbage_pork_stir'],
    ['红烧排骨', 'braised_ribs_red'], ['土豆烧鸡', 'combo_potato_chicken_braise'],
    ['土豆烧肉', 'combo_potato_pork_braise'], ['烤肉拌饭', 'combo_bbq_rice'],
    ['麻辣拌', 'combo_spicy_mix'], ['鸡公煲', 'chicken_claypot'],
    ['鱼香肉丝盖饭', 'combo_yuxiang_pork_rice'], ['宫保鸡丁盖饭', 'combo_gongbao_rice'],
    ['回锅肉盖饭', 'combo_twice_pork_rice'], ['梅菜扣肉饭', 'combo_meigan_pork_rice'],
    ['中式快餐盒饭（两荤一素）', 'combo_two_meat_one_veg_box'],
    ['青菜瘦肉粥', 'combo_greens_pork_congee'], ['黑米粥', 'black_rice_congee'],
    ['葱油拌面', 'scallion_oil_noodle'], ['肉馅饼', 'meat_pie'], ['橘子', 'mandarin'],
    ['果冻', 'jelly_sweet'], ['青椒土豆丝', 'combo_pepper_potato_stir'],
    ['苦瓜炒肉', 'combo_bitter_pork_stir'], ['西葫芦炒肉', 'combo_zucchini_pork_stir'],
    ['蒜苔炒鸡蛋', 'combo_garlic_scape_egg_stir'], ['芹菜炒鸡蛋', 'combo_celery_egg_stir'],
    ['豆芽炒肉', 'combo_sprout_pork_stir'], ['白菜炖豆腐', 'combo_cabbage_tofu_stew'],
    ['木耳炒山药', 'combo_wood_ear_yam_stir'], ['青椒炒豆干', 'combo_pepper_dried_tofu_stir'],
    ['芹菜炒香干', 'combo_celery_dried_tofu_stir'], ['红烧鸡腿', 'braised_chicken_leg_red'],
    ['卤鸡腿', 'marinated_chicken_leg'], ['土豆炖排骨', 'combo_potato_rib_stew'],
    ['白萝卜炖排骨', 'combo_radish_rib_stew'], ['虾仁蒸蛋', 'combo_shrimp_steamed_egg'],
    ['小葱拌豆腐', 'combo_scallion_tofu_mix'], ['牛肉包子', 'baozi_beef'],
    ['韭菜鸡蛋包子', 'combo_chive_egg_bun'], ['油饼', 'oil_flatbread'],
    ['家常烙饼', 'home_flatbread'], ['杂粮粥', 'combo_mixed_grain_congee'],
    ['小米南瓜粥', 'combo_millet_pumpkin_congee'], ['火腿炒饭', 'combo_ham_fried_rice'],
    ['腊肠炒饭', 'combo_sausage_fried_rice'], ['牛肉炒饭', 'combo_beef_fried_rice'],
    ['担担面', 'dandan_noodle'], ['新疆拌面', 'xinjiang_lagman'],
    ['脆皮鸡饭', 'combo_crispy_chicken_rice'], ['泡椒凤爪', 'pickled_chicken_feet'],
    ['蛋黄派', 'egg_yolk_pie'],
  ]);
  for (const [query, id] of expected) {
    assert.equal(searchFoods(query, FOODS, 5)[0]?.id, id, `“${query}”首条没有命中 ${id}`);
  }
});

test('组合菜营养来自基础食材，默认配方可逐项调整', () => {
  for (const query of ['胡萝卜炒鸡蛋', '土豆炒肉', '火腿肠炒鸡蛋']) {
    const food = parseFoodCombination(query);
    assert.ok(food, `没有解析 ${query}`);
    assert.ok(hasFoodMix(food));
    const mixed = foodMixNutrition(food);
    const saved = nutrientsFor(food, food.s[0][1]);
    assert.ok(mixed.components.some((item) => item.foodId === 'oil'), `${query} 没有计算烹调油`);
    assert.ok(Math.abs(saved.kcal - mixed.nutrients.kcal) <= 2, `${query} 的每份热量没有来自配料求和`);
    assert.ok(Math.abs(saved.protein - mixed.nutrients.protein) <= 0.2);
  }
});

test('已有独立配方优先，不合理排列不生成', () => {
  for (const [query, id] of [
    ['宫保鸡丁', 'gongbao'], ['麻婆豆腐', 'mapo_tofu'], ['红烧肉', 'braised_pork'],
    ['沙茶面', 'minnan_shacha_noodle'], ['福鼎肉片', 'fuding_pork_slices'],
  ]) {
    assert.equal(searchFoods(query, FOODS, 5)[0]?.id, id);
    assert.equal(parseFoodCombination(query), null);
  }
  for (const query of ['西瓜炒鸡蛋', '牛奶炒土豆', '胡萝卜炒可乐', '土豆炒牛肉']) {
    assert.equal(parseFoodCombination(query), null, `${query} 不应自动生成`);
    assert.ok(searchFoods(query, FOODS, 10).every((food) => !food.generated));
  }
});

test('组合菜 id 可稳定恢复，历史记录仍能按克数重算', () => {
  const first = parseFoodCombination('胡萝卜炒鸡蛋');
  const restored = generatedFoodById(first.id);
  assert.equal(restored, first);
  assert.deepEqual(nutrientsFor(restored, 136.5), nutrientsFor(first, 136.5));
});

test('辣椒青椒尖椒炒蛋及倒序叫法统一命中固定菜，不再生成重复菜', () => {
  for (const query of ['青椒炒鸡蛋', '青椒炒蛋', '辣椒炒鸡蛋', '辣椒炒蛋', '尖椒炒鸡蛋', '尖椒炒蛋', '鸡蛋炒青椒', '青椒 炒 鸡蛋']) {
    const results = searchFoods(query);
    assert.equal(results[0]?.id, 'chili_scrambled_egg', query);
    assert.ok(results.every(f => f.id !== 'combo_pepper_egg_stir'), query);
    assert.equal(parseFoodCombination(query), null, query);
  }
});

test('火腿炒蛋同义和倒序输入使用同一配方，额外食材不能被忽略', () => {
  for (const query of ['火腿肠炒鸡蛋', '火腿炒鸡蛋', '火腿炒蛋', '火腿肠炒蛋', '鸡蛋炒火腿肠', '鸡蛋炒火腿']) {
    const food = searchFoods(query)[0];
    assert.equal(food.id, 'combo_ham_egg_stir', query);
    const mix = foodMixNutrition(food);
    assert.deepEqual(mix.components.map(c => c.foodId), ['ham_sausage', 'egg_whole', 'oil', 'soy_sauce']);
    const withoutOil = foodMixNutrition(food, { ham_sausage: 100, egg_whole: 110, soy_sauce: 5 });
    assert.ok(mix.nutrients.kcal > withoutOil.nutrients.kcal + 60);
    assert.ok(mix.nutrients.sodium > 900, '加工肉和酱油的钠不能漏算');
  }
  for (const query of ['火腿鸡蛋', '火腿炒鸡蛋牛肉', '青椒炒鸡蛋火腿', '青椒煮鸡蛋', '火腿片炒鸡蛋']) {
    assert.equal(parseFoodCombination(query), null, query);
    assert.ok(searchFoods(query).every(f => !f.generated), query);
  }
});

test('旧青椒组合 id 保留原配料与营养，搜索去重不改写历史记录', () => {
  const legacy = generatedFoodById('combo_pepper_egg_stir');
  assert.equal(legacy.id, 'combo_pepper_egg_stir');
  assert.equal(legacy.mix.components[0].foodId, 'pepper_green');
  assert.deepEqual(legacy.mix.components.map(c => c.defaultGrams), [150, 110, 8, 5]);
  assert.notDeepEqual(nutrientsFor(legacy, 100), nutrientsFor(FOOD_BY_ID.get('chili_scrambled_egg'), 100));
  assert.equal(generatedFoodById(legacy.id), legacy);
});

test('已确认的液体与冲调粉单位不再混用', () => {
  for (const id of ['americano_milk', 'oat_latte', 'tea_boba', 'milk_whole', 'soymilk']) {
    assert.equal(FOOD_BY_ID.get(id)?.basis, '100ml', `${id} 应按 ml 记录`);
  }
  const powder = FOOD_BY_ID.get('meal_replacement_shake');
  assert.equal(powder.basis, '100g');
  assert.equal(powder.state, 'dry');
  assert.match(powder.s[0][0], /干粉/);
});

test('炒三丁可取消、添加食材并按保存配方恢复，不污染默认搭配', () => {
  const food = searchFoods('炒三丁')[0];
  assert.equal(food.id, 'combo_three_dice_stir');
  const defaults = defaultFoodMix(food);
  assert.deepEqual(Object.keys(defaults), ['green_pea', 'sweet_corn_kernel', 'carrot', 'ham_sausage', 'oil', 'soy_sauce']);
  const amounts = { ...defaults, green_pea: 0, cucumber: 120 };
  delete amounts.ham_sausage;
  amounts.ham_sausage_jinluo = 60;
  const mixed = foodMixNutrition(food, amounts);
  assert.ok(mixed.components.some(c => c.foodId === 'cucumber' && c.grams === 120));
  assert.ok(mixed.components.some(c => c.foodId === 'ham_sausage_jinluo' && c.grams === 60));
  assert.ok(mixed.components.every(c => !['green_pea', 'ham_sausage'].includes(c.foodId)));
  const restored = foodMixNutrition(generatedFoodById(food.id), Object.fromEntries(mixed.components.map(c => [c.foodId, c.grams])));
  assert.deepEqual(restored, mixed);
  assert.deepEqual(defaultFoodMix(food), defaults);
  assert.equal(foodMixNutrition(food, {}).grams, 0);
  assert.deepEqual(foodMixComponents(food, { bogus_food: 10 }).map(c => c.foodId), Object.keys(defaults));
});

test('火腿肠品牌适用于独立食物和组合菜，切换后只计算选中的品牌', () => {
  for (const brand of foodBrandOptions(FOOD_BY_ID.get('ham_sausage'))) {
    assert.equal(searchFoods(brand.name)[0].id, brand.id);
    const food = searchFoods('青椒洋葱火腿肠')[0];
    assert.equal(food.id, 'combo_pepper_onion_ham_stir');
    const amounts = defaultFoodMix(food);
    delete amounts.ham_sausage;
    amounts[brand.id] = 75;
    const mixed = foodMixNutrition(food, amounts);
    const ham = mixed.components.filter(c => c.foodId.startsWith('ham_sausage'));
    assert.equal(ham.length, 1);
    assert.equal(ham[0].foodId, brand.id);
    assert.equal(ham[0].grams, 75);
  }
});

test('必胜客新品可搜索，全部披萨按片换算且旧id仍有效', () => {
  assert.equal(searchFoods('薯角培根披萨')[0].id, 'ph_potato_bacon');
  assert.equal(searchFoods('五常大米蛋挞')[0].id, 'ph_wuchang_rice_tart');
  for (const food of FOODS.filter(f => /披萨|比萨/.test(f.name))) {
    assert.equal(food.s[0][0], '一片');
    assert.ok(!food.name.includes('块'));
    const [_, grams] = food.s[0];
    assert.ok(Math.abs(nutrientsFor(food, grams * 2).kcal - nutrientsFor(food, grams).kcal * 2) <= 1);
  }
});
