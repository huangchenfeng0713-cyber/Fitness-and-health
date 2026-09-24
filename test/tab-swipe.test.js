import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeDestination, swipePose, tabTravel } from '../js/lib/tab-swipe.js';

const gesture = (dx, extras = {}) => ({
  dx, velocity: 0, width: 393, index: 1, count: 4, ...extras,
});

test('短距离不切页，快拨可前进一步', () => {
  assert.equal(swipeDestination(gesture(100)), 2);
  assert.equal(swipeDestination(gesture(-100)), 0);
  assert.equal(swipeDestination(gesture(-30)), null);
  assert.equal(swipeDestination(gesture(38, { velocity: 0.7 })), 2);
  assert.equal(swipeDestination(gesture(100, { cancelled: true })), null);
});

test('一次拖动最多跨到末栏，反方向同理', () => {
  const width = 393;
  assert.ok(tabTravel(width) * 3 < width - 50);
  assert.equal(swipeDestination(gesture(220, { index: 0 })), 2);
  assert.equal(swipeDestination(gesture(330, { index: 0 })), 3);
  assert.equal(swipeDestination(gesture(-230, { index: 3 })), 1);
  assert.equal(swipeDestination(gesture(-330, { index: 3 })), 0);
});

test('角度严格跟随手指，过半圈换正面，跨页后继续同向旋转', () => {
  const width = 393;
  const travel = tabTravel(width);
  const pose = dx => swipePose({ dx, width, index: 0, count: 4 });
  assert.deepEqual(pose(0), { position: 0, displayIndex: 0, angle: 0 });
  assert.ok(Math.abs(pose(travel * .25).angle - 45) < 1e-8);
  assert.equal(pose(travel * .25).displayIndex, 0);
  assert.ok(Math.abs(pose(travel * .75).angle + 45) < 1e-8);
  assert.equal(pose(travel * .75).displayIndex, 1);
  assert.deepEqual(pose(travel), { position: 1, displayIndex: 1, angle: 0 });
  assert.ok(Math.abs(pose(travel * 1.25).angle - 45) < 1e-8);
  assert.equal(pose(travel * 1.75).displayIndex, 2);
  assert.deepEqual(pose(travel * 3), { position: 3, displayIndex: 3, angle: 0 });
  const reverse = swipePose({ dx: -travel * .25, width, index: 3, count: 4 });
  assert.ok(Math.abs(reverse.angle + 45) < 1e-8);
});

test('首尾栏目与无效宽度不越界', () => {
  assert.equal(swipeDestination(gesture(-180, { index: 0 })), null);
  assert.equal(swipeDestination(gesture(180, { index: 3 })), null);
  assert.equal(swipeDestination(gesture(100, { width: 0 })), null);
});
