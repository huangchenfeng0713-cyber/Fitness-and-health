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

test('数据结果排在统一的数据管理入口之前，首屏卡片不会再被 flex 压扁', () => {
  const health = read('js/views/health.js');
  const css = read('css/app.css');
  const rendered = health.slice(health.indexOf('export function renderHealth'));
  assert.ok(rendered.indexOf('insightCard()') < rendered.indexOf('dataManagerCard(rerender)'),
    '健康概览应排在导入操作之前');
  assert.ok(rendered.indexOf('dataTable()') < rendered.indexOf('dataManagerCard(rerender)'),
    '最近记录应排在导入操作之前');
  const manager = health.slice(health.indexOf('function dataManagerCard'), health.indexOf('/**\n * 早期版本'));
  for (const label of ['同步 Apple 健康', '手动补录', '本应用备份与恢复', '同步帮助']) {
    assert.ok(manager.includes(label), `统一数据管理卡缺少“${label}”`);
  }
  assert.match(css, /\.view > \* \{ flex: 0 0 auto; \}/);
  assert.ok(!health.includes('dataHubCard()'), '不应再把导入说明大卡放在页面最前面');
});

test('设置从底部主栏目移到可收起的右侧抽屉，补充说明使用信息圆点', () => {
  const app = read('js/app.js');
  const css = read('css/app.css');
  const utils = read('js/lib/utils.js');
  assert.ok(!/key: 'settings', label: '设置'/.test(app), '底栏仍保留设置栏目');
  assert.ok(app.includes('settings-drawer') && app.includes('openSettings') && app.includes('closeSettings'));
  assert.match(css, /\.settings-drawer[\s\S]*translateX\(102%\)/);
  assert.match(css, /\.settings-overlay\.open \.settings-drawer \{ transform: translateX\(0\); \}/);
  assert.ok(utils.includes("h('details.info-tip'"), '缺少可点击的信息圆点组件');
});

test('含咖啡因功能饮料按毫升记录，并动态显示整份咖啡因', () => {
  const diet = read('js/views/diet.js');
  assert.ok(diet.includes("food.basis === '100ml'"));
  assert.ok(diet.includes('food.caffeineMg'));
  assert.ok(diet.includes('本份约含 ${caffeine} mg 咖啡因'));
  assert.ok(diet.includes("isLiquid ? 'ml' : 'g'"));
});
