import test from 'node:test';
import assert from 'node:assert/strict';
import * as rhythm from '../js/core/eating-rhythm.js';
const { expectedShare, paceNote } = rhythm;

test('固定三餐窗口：窗口内平滑、餐间保持，比例30/40/30', () => {
  const at = hour => expectedShare({ hour }).share;
  for (const [h, value] of [[6.5,0],[9,.3],[11.5,.3],[14,.7],[17.5,.7],[20,1],[24,1],[7.75,.15]]) assert.equal(at(h), value);
  for (let h = 0; h <= 24; h += .01) {
    assert.ok(at(h + .01) >= at(h));
    assert.ok(at(h + .01) - at(h) < .003, '不能瞬间跳台阶');
  }
});
test('旧个人模式与历史记录不再改变固定三餐参照', () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`, meal: 'dinner', kcal: 3000, time: '2026-08-01T23:00:00',
  }));
  for (const hour of [8, 10, 12, 15, 19, 22]) {
    assert.deepEqual(expectedShare({ hour, mode: 'personal', entries }), expectedShare({ hour }));
    assert.deepEqual(paceNote({ hour, eatenPct: 30, mode: 'personal', entries }), paceNote({ hour, eatenPct: 30 }));
  }
  for (const key of ['personalMealReference', 'RHYTHM_MODES', 'rhythmMode', 'MIN_DAYS_FOR_PERSONAL', 'MAX_PERSONAL_DAYS']) {
    assert.equal(Object.hasOwn(rhythm, key), false, key + ' 应已移除');
  }
});

test('固定参照仍按时段判断，夜间不催补热量', () => {
  assert.equal(paceNote({ hour: 6, eatenPct: 0 }).tone, 'early');
  assert.equal(paceNote({ hour: 12, eatenPct: 40 }).tone, 'onTrack');
  const night = paceNote({ hour: 22, eatenPct: 30 });
  assert.equal(night.tone, 'late');
  assert.match(night.text, /明天/);
  assert.equal(night.basis, '膳食指南');
});
