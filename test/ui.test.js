import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('所有数据操作集中在数据页，设置页不再重复导入入口', () => {
  const app = read('js/app.js');
  const health = read('js/views/health.js');
  const settings = read('js/views/settings.js');
  const dashboard = read('js/views/dashboard.js');

  assert.match(app, /key: 'health', label: '数据'/);
  assert.match(app, /key: 'diet', label: '饮食'/);
  for (const text of ['同步 Apple 健康', '本应用备份与恢复', '手动补录']) {
    assert.ok(health.includes(text), `数据页缺少“${text}”`);
  }
  assert.ok(!settings.includes('function dataCard'), '设置页仍保留独立数据管理实现');
  assert.ok(!settings.includes('导入备份'), '设置页仍出现重复导入入口');
  assert.ok(dashboard.includes('前往数据中心同步'), '今日页缺少统一入口导航');
  assert.ok(!dashboard.includes('importFromClipboard'), '今日页仍在直接执行数据导入');
});

test('Apple 健康同步与完整备份在文案和行为上明确区分', () => {
  const health = read('js/views/health.js');
  assert.ok(health.includes('只更新身体与活动数据，不会改动饮食记录'));
  assert.ok(health.includes('会先确认再整体替换当前本地数据，不与现有数据混合'));
  assert.ok(health.includes('payload?.app !== \'health-diet-tracker\''), '恢复入口没有校验应用备份身份');
  assert.match(health, /confirmAction\([\s\S]*恢复后会替换当前设备里的全部健康、饮食、设置和自定义食物/);
});

test('长提示在窄屏内换行并限制高度，不再形成溢出的巨型胶囊', () => {
  const css = read('css/app.css');
  const utils = read('js/lib/utils.js');
  assert.match(css, /\.toast \{[\s\S]*max-width: min\(calc\(100vw - 32px\), 440px\)/);
  assert.match(css, /\.toast \{[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.toast\[data-long="true"\][\s\S]*-webkit-line-clamp: 5/);
  assert.ok(utils.includes("el.dataset.long = text.length > 42 ? 'true' : 'false'"));
  assert.ok(utils.includes("'aria-live': 'polite'"));
});
