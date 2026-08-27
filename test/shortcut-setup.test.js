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
  assert.match(healthView, /没有样本时省略该键，不要填 0/);
  assert.match(guide, /不要用 `0` 代替缺失值/);
  assert.doesNotMatch(guide, /为空时设为 `0`/);
  assert.match(guide, /missing_measurement_time/);
});

test('健康导出文件选择区支持键盘操作', () => {
  assert.match(healthView, /role: 'button', tabindex: 0/);
  assert.match(healthView, /e\.key !== 'Enter' && e\.key !== ' '/);
});

test('步骤里写明「查找健康样本」必须接「计算统计数据 → 总计」', () => {
  // 用户实测：其余字段都到了，唯独步数收不到。
  // 「查找健康样本」返回的是一天几十上百条样本，不接「总计」就不是一个数字，
  // 服务端把空值静默跳过（否则少一项会让整次上传失败），于是缺字段既不报错也无从排查。
  assert.match(healthView, /计算统计数据/);
  assert.match(healthView, /总计/);
  assert.match(healthView, /步数收不到几乎都是这个原因/);
  // 权限是第二常见原因：iOS 逐项询问，当时点了「不允许」之后不会再问
  assert.match(healthView, /隐私与安全性 → 健康 → 快捷指令/);
});

test('同步区列出当天实际收到的字段，缺哪项一眼可见', () => {
  assert.match(healthView, /今天收到了哪些字段/);
  assert.match(healthView, /function syncFieldPanel\(/);
  // 只对基础三项报缺失：可选字段本来就允许不传
  assert.match(healthView, /SYNC_FIELDS\.slice\(0, 3\)/);
  assert.match(healthView, /服务端对空值是静默跳过的/);
  // 面板不在登录门槛里面：不管数据从哪条路进来，「今天到底有什么」都该看得到
  assert.match(healthView, /automaticSyncPanel\(rerender\),\s*\n\s*syncFieldPanel\(\),/);
});

test('快捷指令排查步骤只对快捷指令上传的那天出现', () => {
  // 完整导出或手动补录的日子缺字段是另一回事，
  // 套一段「计算统计数据要选总计」只会把人引到错的地方
  assert.match(healthView, /const viaShortcut = Boolean\(row\._cloudHealthSync\);/);
  assert.match(healthView, /missing\.length && viaShortcut/);
  assert.match(healthView, /跑一次快捷指令或在下面手动补录/);
});
