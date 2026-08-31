import test from 'node:test';
import assert from 'node:assert/strict';

import '../js/data/food-extras.js';
import {
  FOOD_BY_ID, searchFoods, hasFoodMix, defaultFoodMix, foodMixNutrition,
} from '../js/data/foods.js';

const findFood = (id) => FOOD_BY_ID.get(id);

test('响铃卷可搜索且带常用份量', () => {
  const food = findFood('ringing_roll_fried');
  assert.ok(food);
  assert.equal(food.name, '响铃卷（油炸腐皮卷）');
  assert.ok(food.s.some(([label, grams]) => label === '一根' && grams === 12));
  assert.equal(searchFoods('响铃卷', undefined, 10)[0]?.id, food.id);
});

test('绝味水煮是可逐项调整的复合食物', () => {
  const food = findFood('juewei_shuizhu_mix');
  assert.ok(food);
  assert.equal(hasFoodMix(food), true);
  assert.ok(food.mix.components.length >= 10);

  const defaults = defaultFoodMix(food);
  assert.equal(defaults.jw_shuizhu_lotus, 60);
  assert.equal(defaults.jw_shuizhu_spinach, 50);

  const chosen = foodMixNutrition(food, {
    jw_shuizhu_lotus: 100,
    jw_shuizhu_tripe: 80,
    jw_shuizhu_tofu_puff: 40,
  });
  assert.equal(chosen.grams, 220);
  assert.equal(chosen.components.length, 3);
  assert.ok(chosen.nutrients.kcal > 200);
  assert.ok(chosen.nutrients.protein > 10);
  assert.ok(chosen.nutrients.sodium > 1000);
});

test('绝味水煮食材可以单独搜索和记录', () => {
  assert.equal(searchFoods('绝味水煮 牛肚', undefined, 10)[0]?.id, 'jw_shuizhu_tripe');
  assert.equal(searchFoods('绝味水煮 花甲', undefined, 10)[0]?.id, 'jw_shuizhu_clam');
  assert.equal(searchFoods('绝味水煮 藕丸', undefined, 10)[0]?.id, 'jw_shuizhu_lotus_ball');
});
