import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeDestination } from '../js/lib/tab-swipe.js';

const gesture = (dx, extras = {}) => ({
  dx, velocity: 0, width: 393, index: 1, count: 4, ...extras,
});

test('横滑只前往相邻栏目，短距离及纵向误触不切页', () => {
  assert.equal(swipeDestination(gesture(-100)), 2);
  assert.equal(swipeDestination(gesture(100)), 0);
  assert.equal(swipeDestination(gesture(-30)), null);
  assert.equal(swipeDestination(gesture(-38, { velocity: -0.7 })), 2);
  assert.equal(swipeDestination(gesture(-100, { cancelled: true })), null);
});

test('首尾栏目与无效宽度不越界', () => {
  assert.equal(swipeDestination(gesture(180, { index: 0 })), null);
  assert.equal(swipeDestination(gesture(-180, { index: 3 })), null);
  assert.equal(swipeDestination(gesture(-100, { width: 0 })), null);
});
