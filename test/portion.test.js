import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTION_MEMORY_LIMIT, rememberedPortion, isPresetPortion, nextPortionMemory, initialPortion,
} from '../js/core/portion.js';

const rice = { id: 'rice_white', s: [['1 碗', 150], ['1 小碗', 100]] };

test('照着库里现成份量记的不进记忆表', () => {
  // 第一次随手点个「1 碗」就把它钉死，等于把猜的值升级成用户的选择
  assert.equal(nextPortionMemory({}, rice, 150), null);
  assert.equal(nextPortionMemory({}, rice, 100), null);
  assert.equal(isPresetPortion(rice, 150), true);
  assert.equal(isPresetPortion(rice, 420), false);
});

test('改过一次就记住，下次选中直接用这个数', () => {
  const m = nextPortionMemory({}, rice, 420);
  assert.deepEqual(m, { rice_white: 420 });
  assert.equal(rememberedPortion(m, 'rice_white'), 420);
  assert.equal(initialPortion(rice, m).grams, 420);
});

test('已经改过的食物，改回默认份量也要记', () => {
  /*
   * 「420g → 150g（默认）」是一次表态，不是没发生过。
   * 漏掉这一步的话下次又跳回 420g，用户会觉得改不动。
   */
  const m = nextPortionMemory({ rice_white: 420 }, rice, 150);
  assert.deepEqual(m, { rice_white: 150 });
});

test('和上次记的一样就不用再写一次库', () => {
  assert.equal(nextPortionMemory({ rice_white: 420 }, rice, 420), null);
  assert.equal(nextPortionMemory({ rice_white: 420 }, rice, 420.3), null, '半克以内算同一个数');
});

test('脏数据不进表', () => {
  for (const g of [0, -5, NaN, null, undefined, '很多']) {
    assert.equal(nextPortionMemory({}, rice, g), null, `${g} 不该被记下来`);
  }
  assert.equal(nextPortionMemory({}, { s: [] }, 200), null, '没有 id 的食物记不了');
  assert.equal(rememberedPortion({ rice_white: 0 }, 'rice_white'), null);
  assert.equal(rememberedPortion({ rice_white: 'abc' }, 'rice_white'), null);
  assert.equal(rememberedPortion(null, 'rice_white'), null);
});

test('表不会无限长，先记的先掉', () => {
  const many = {};
  for (let i = 0; i < PORTION_MEMORY_LIMIT; i += 1) many[`f${i}`] = 200;
  const next = nextPortionMemory(many, rice, 420);
  assert.equal(Object.keys(next).length, PORTION_MEMORY_LIMIT);
  assert.equal(next.rice_white, 420, '刚记的这条必须在');
  assert.equal(next.f0, undefined, '最早的那条该被挤掉');
});

test('记住的量对得上某一档就选那一档，对不上才落到按克输入', () => {
  // 显示「1 小碗」比显示「100 克」好读
  const onPreset = initialPortion(rice, { rice_white: 100 });
  assert.equal(onPreset.unitIdx, 1);
  const free = initialPortion(rice, { rice_white: 420 });
  assert.equal(free.unitIdx, rice.s.length, '按克输入是份量列表后面那一档');
  const fresh = initialPortion(rice, {});
  assert.deepEqual([fresh.unitIdx, fresh.grams, fresh.remembered], [0, 150, null]);
  const noServings = initialPortion({ id: 'x' }, {});
  assert.deepEqual([noServings.unitIdx, noServings.grams], [0, 100], '没有常用份量时兜底 100g');
});

test('qty 要一起给出来：面板上那个大数字读的是它，不是 grams', () => {
  /*
   * 只设 grams 不设 qty，弹层以按克输入开场时大读数是一道杠（computeGrams 拿到的
   * qty 还是上一次的 1），而下面输入框里明明写着 420 —— 同一个面板两个数对不上。
   * 按份量档时 qty 是「几份」，按克输入时 qty 本身就是克数。
   */
  const free = initialPortion(rice, { rice_white: 420 });
  assert.equal(free.qty, 420, '按克输入时 qty 就是克数');
  assert.equal(initialPortion(rice, { rice_white: 100 }).qty, 1, '选中某一档时是 1 份');
  assert.equal(initialPortion(rice, {}).qty, 1);
  assert.equal(initialPortion({ id: 'x' }, {}).qty, 1);
});
