import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('健身器械筛选由 training view 自己管理状态', () => {
  const training = text('js/views/training.js');
  const polish = text('js/ux-polish.js');
  assert.match(training, /let equipMenuOpen = false/);
  assert.match(training, /equip-filter-menu/);
  assert.doesNotMatch(polish, /enhanceTraining|ux-equip-filter|固定器械\|自由重量\|徒手/);
});

test('移动端挑动作控制区保持三层结构', () => {
  const training = text('js/views/training.js');
  assert.match(training, /picker-mode-switch/);
  assert.match(training, /picker-scope-switch/);
  assert.match(training, /picker-list-toolbar/);
  assert.doesNotMatch(training, /equipTabs\(rerender, all\)/);
});

test('冒烟测试从当前主卡判断热量超出状态', () => {
  const smoke = text('scripts/smoke.mjs');
  assert.match(smoke, /heroText: document\.querySelector\('\.hero'\)/);
  assert.match(smoke, /semantics\.heroText/);
  assert.doesNotMatch(smoke, /!\/多\|超\/\.test\(semantics\.foot\)/);
});

test('应用版本与离线缓存键同步', () => {
  assert.match(text('package.json'), /"version": "2\.10\.1"/);
  assert.match(text('js/core/feedback.js'), /APP_VERSION = '2\.10\.1'/);
  assert.match(text('sw.js'), /health-diet-v2\.10\.1/);
  assert.match(text('README.md'), /当前版本：\*\*v2\.10\.1\*\*/);
});
