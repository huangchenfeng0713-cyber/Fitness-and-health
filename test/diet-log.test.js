import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSameEntries } from '../js/core/diet-log.js';

const rice = (over = {}) => ({
  id: Math.random(), meal: 'lunch', foodId: 'rice_white', name: '米饭（白米）',
  unit: 'g', grams: 150, kcal: 174, protein: 3.9, fat: 0.5, carb: 38.8,
  fiber: 0.5, sugar: 0, sodium: 3, ...over,
});

test('同一餐同一样东西合成一条，克数和营养逐项相加', () => {
  const merged = mergeSameEntries([rice(), rice(), rice()]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 3);
  assert.equal(merged[0].grams, 450, '吃了三碗就是三碗，不是取平均');
  assert.equal(Math.round(merged[0].kcal), 522);
  assert.equal(merged[0].entries.length, 3, '原始记录要留着，编辑态还得一条条动');
});

test('糖度不同不合并', () => {
  // 全糖和三分糖能差一百多千卡
  const merged = mergeSameEntries([
    rice({ foodId: 'milk_tea', sugarLevel: 'full' }),
    rice({ foodId: 'milk_tea', sugarLevel: 'three' }),
  ]);
  assert.equal(merged.length, 2);
});

test('餐次、单位、配料不同都不合并', () => {
  assert.equal(mergeSameEntries([rice(), rice({ meal: 'dinner' })]).length, 2);
  assert.equal(mergeSameEntries([rice(), rice({ unit: 'ml' })]).length, 2);
  assert.equal(mergeSameEntries([
    rice({ composition: [{ foodId: 'a', grams: 10 }] }),
    rice({ composition: [{ foodId: 'b', grams: 10 }] }),
  ]).length, 2);
});

test('只有一条也照样返回一组，调用方不用分两种情况', () => {
  const merged = mergeSameEntries([rice()]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 1);
  assert.deepEqual(mergeSameEntries([]), []);
  assert.deepEqual(mergeSameEntries(), []);
  assert.deepEqual(mergeSameEntries([null, undefined]), []);
});
