import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [healthView, guide] = await Promise.all([
  // 数据管理卡片已抽成独立模块（现挂在设置页），这里跟着代码走
  readFile(new URL('../js/views/cards/data-manager.js', import.meta.url), 'utf8'),
  readFile(new URL('../docs/SHORTCUT_SYNC.md', import.meta.url), 'utf8'),
]);

test('快捷指令基础配置只包含低风险的三项累计指标', () => {
  const configBlock = healthView.match(/function shortcutConfig[\s\S]+?\n}\n\nfunction setProgress/)?.[0] || '';
  assert.match(configBlock, /protocolVersion:\s*1/);
  assert.match(configBlock, /steps:/);
  assert.match(configBlock, /activeEnergyKcal:/);
  assert.match(configBlock, /restingEnergyKcal:/);
  assert.doesNotMatch(configBlock, /sleepMinutes|weightKg|bodyFatPct|restingHR|vo2max/);
});

test('快捷指令入口可直接打开编辑器，并明确缺失指标不能伪造为零', () => {
  assert.match(healthView, /shortcuts:\/\/create-shortcut/);
  assert.match(healthView, /某项没有样本时省略该键，不要填 0/);
  assert.match(guide, /不要用 `0` 代替缺失值/);
  assert.doesNotMatch(guide, /为空时设为 `0`/);
  assert.match(guide, /missing_measurement_time/);
});

test('健康导出文件选择区支持键盘操作', () => {
  assert.match(healthView, /role: 'button', tabindex: 0/);
  assert.match(healthView, /e\.key !== 'Enter' && e\.key !== ' '/);
});
