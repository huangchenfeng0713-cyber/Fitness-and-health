import test from 'node:test';
import assert from 'node:assert/strict';
import { withUnit, unitGap } from '../js/core/units.js';

test('西文单位前留空格，中文单位和 g/ml 不留', () => {
  assert.equal(withUnit(116, 'kcal'), '116 kcal');
  assert.equal(withUnit(58, 'bpm'), '58 bpm');
  assert.equal(withUnit(150, 'g'), '150g');
  assert.equal(withUnit(250, 'ml'), '250ml');
  assert.equal(withUnit(550, 'mg'), '550mg');
  assert.equal(withUnit(18, '%'), '18%');
  assert.equal(withUnit(30, '分钟'), '30分钟');
  assert.equal(withUnit(7360, '步'), '7360步');
  assert.equal(withUnit(5, '次'), '5次');
});

test('没有单位就只有数字', () => {
  assert.equal(withUnit(12, ''), '12');
  assert.equal(withUnit(12, null), '12');
  assert.equal(unitGap(''), '');
});

test('unitGap 和 withUnit 给的是同一个答案', () => {
  for (const u of ['kcal', 'g', 'ml', 'mg', '%', '分钟', '次', 'bpm', '']) {
    assert.equal(withUnit(7, u), `7${unitGap(u)}${u}`, `${u} 两处不一致`);
  }
});
