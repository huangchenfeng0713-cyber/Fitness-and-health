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
    if (Math.abs(est - kcal) / kcal > 0.25) off.push(`${f.name}: 标注 ${kcal}，按宏量算 ${Math.round(est)}`);
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
