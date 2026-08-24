import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

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

test('趋势页的体重门槛、蛋白达标线与当前日统计口径一致', () => {
  const trends = read('js/views/trends.js');
  const charts = read('js/lib/charts.js');
  assert.ok(trends.includes('首末记录相隔 7 天'));
  assert.ok(trends.includes('target: proteinThreshold'));
  assert.ok(trends.includes('targetLabel: `达标线 ${Math.round(proteinThreshold)}g`'));
  assert.ok(trends.includes('overIsBad: false'), '蛋白超过最低目标不应标红');
  // 当天已经整体不画了，不再需要「半截数据点」处理
  assert.ok(!trends.includes('partialX'), '趋势页不该还留着当天半截数据的处理');
  assert.ok(charts.includes('emptyText = \'数据不足，至少需要 2 个记录日\''));
});

test('趋势页统计图统一为折线图，漏记日断线而不是虚构连续数据', () => {
  const trends = read('js/views/trends.js');
  const charts = read('js/lib/charts.js');
  assert.ok(!trends.includes('barChart'), '趋势页仍在使用柱状图');
  for (const title of ['每日热量摄入', '每日蛋白摄入']) {
    const index = trends.indexOf(`chartCard('${title}'`);
    assert.ok(index > 0, `缺少${title}卡片`);
    const block = trends.slice(index, index + 900);
    assert.ok(block.includes('lineChart({'), `${title}没有改成折线图`);
    assert.ok(block.includes('breakOnMissing: true'), `${title}会跨过漏记日连线`);
    assert.ok(block.includes('showPoints: true'), `${title}没有显示实际记录点`);
    assert.ok(block.includes('minPoints: 1'), `${title}只有一天记录时会被错误判空`);
  }
  assert.ok(charts.includes('breakOnMissing = false'));
  assert.match(charts, /else if \(breakOnMissing && segment\.length\)/);
});

test('清补凉支持逐项选配和份量调整，记录会保存营养与配料快照', () => {
  const diet = read('js/views/diet.js');
  const store = read('js/lib/store.js');
  const css = read('css/app.css');
  assert.ok(diet.includes('function refreshMixedPortion(food)'));
  assert.ok(diet.includes('defaultFoodMix(food)'));
  assert.ok(diet.includes('foodMixNutrition(food, ui.mix)'));
  assert.ok(diet.includes('composition: currentMix.components'));
  assert.ok(diet.includes("h('input.mix-amount-input'"));
  assert.ok(css.includes('.mix-row.active') && css.includes('.mix-amount-input'));
  assert.ok(store.includes('nutrients: suppliedNutrients = null'));
  assert.ok(store.includes('composition: savedComposition'));
  assert.ok(store.includes('foodMixNutrition(food, amounts)'), '改列表总量时应同步缩放配方营养');
});

test('脂肪计划值不再冒充上限，液体条目始终使用 ml', () => {
  const advisor = read('js/core/advisor.js');
  const dashboard = read('js/views/dashboard.js');
  const diet = read('js/views/diet.js');
  const settings = read('js/views/settings.js');
  assert.ok(dashboard.includes("macroMini('脂肪上限'"));
  assert.ok(settings.includes('参考上限'));
  assert.ok(dashboard.includes("basis === '100ml' ? 'ml' : 'g'"));
  assert.ok(diet.includes("basis === '100ml' ? '100ml' : '100g'"));
  assert.ok(diet.includes("isLiquid ? '毫升数' : '克数'"));
  assert.ok(advisor.includes("food.basis === '100ml' ? 'ml' : 'g'"));
});

test('数据与趋势页显示统计截止日期，新版本可主动提示刷新', () => {
  const app = read('js/app.js');
  const health = read('js/views/health.js');
  const settings = read('js/views/settings.js');
  const trends = read('js/views/trends.js');
  assert.ok(app.includes('topbar-context-note'));
  assert.ok(app.includes('showUpdateNotice'));
  assert.ok(app.includes("updateViaCache: 'none'"));
  assert.ok(app.includes('registration.update()'));
  assert.ok(health.includes('截至所选日共 ${eligible.length} 天'));
  assert.ok(settings.includes('按当前设置估算'));
  assert.ok(trends.includes("'当前设置估算目标'"));
});


test('趋势页所有折线图共用同一横轴窗口', () => {
  // 用户实测：同一个「近 30 天」下，体重图 08-22→08-23、活动能量 07-26→08-24。
  // 折线图不传 domain 就会各画各的。
  const trends = read('js/views/trends.js');
  const calls = trends.match(/lineChart\(\{[\s\S]*?\}\)/g) || [];
  assert.ok(calls.length >= 4, `折线图数量异常：${calls.length}`);
  for (const call of calls) {
    assert.ok(/domain: axisDomain/.test(call),
      `有折线图没有传 domain：${call.slice(0, 90)}`);
  }
  assert.match(trends, /const axisDomain = \[days\[0\], days\[days\.length - 1\]\]/);
});

test('活动能量图有平均参考线，且与卡片标签同源', () => {
  const trends = read('js/views/trends.js');
  const idx = trends.indexOf("chartCard('活动能量'");
  assert.ok(idx > 0, '找不到活动能量卡片');
  const block = trends.slice(idx, idx + 900);
  assert.ok(/target: avgActive/.test(block), '活动能量图缺少平均参考线');
  assert.ok(/targetLabel: avgActive != null \? `平均 \$\{avgActive\}`/.test(block),
    '参考线标签应短且与卡片标签同一个数');
  assert.ok(/已结束日平均 \$\{avgActive\} kcal/.test(block), '卡片标签应写明是已结束日的平均');
});

test('趋势图统计到前一天为止，当天不画也不计入', () => {
  // 一天没过完，活动能量和摄入都还在累加，画出来是个必然偏低的点，
  // 会被误读成「今天掉下去了」。区间本身就止于前一天，图与平均用同一批数据。
  const trends = read('js/views/trends.js');
  assert.match(trends, /function lastEndedDay\(\)[\s\S]*?shiftDay\(state\.day, -1\)/,
    '缺少「区间止于前一天」的实现');
  assert.match(trends, /let d = lastEndedDay\(\);/, 'dateRange 仍从今天往回数');
  for (const gone of ['ended(', 'endedKcal', 'endedSleep', 'todayHasDiet', 'viewingToday']) {
    assert.ok(!trends.includes(gone), `还残留旧的当天过滤逻辑：${gone}`);
  }
  assert.match(trends, /const avgSleep = average\(sleepSeries, 1\)/);
  assert.match(trends, /const avgActive = average\(activeSeries\)/);
});

test('区间档位是 7 天 / 近一个月 / 近六个月 / 全部', () => {
  const trends = read('js/views/trends.js');
  const labels = [...trends.matchAll(/label: '([^']+)', days:/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['7 天', '近一个月', '近六个月', '全部']);
});

test('只有 7 天视图开逐日标注与点选', () => {
  // 一个月以上一个点不到 20px，点选只会选错
  const trends = read('js/views/trends.js');
  assert.match(trends, /const isWeek = range === 7;/);
  assert.match(trends, /const pick = isWeek\s*\?\s*\{[\s\S]*?showAllDates: true,[\s\S]*?interactive: true,/);
  assert.match(trends, /:\s*\{\};/, '非 7 天视图应传空对象');
  const chartCalls = trends.match(/lineChart\(\{[\s\S]*?\}\)/g) || [];
  assert.ok(chartCalls.length >= 5, `图表数量异常：${chartCalls.length}`);
  for (const call of chartCalls) {
    assert.ok(/\.\.\.pick/.test(call), `有图表没接上 7 天交互开关：${call.slice(0, 80)}`);
  }
});

test('「全部」档位附一张逐日明细表', () => {
  const trends = read('js/views/trends.js');
  assert.match(trends, /range === 'all' \? fullTable\(days, dietByDate\) : null/);
  assert.match(trends, /function fullTable\(/);
  // 缺的字段要留空，不能当成 0
  assert.ok(trends.includes('不会当成 0'), '明细表没有说明缺失字段的处理');
});

test('一次点选让同一页所有图标注同一天', () => {
  // 「那天吃了多少、动了多少、睡了多久」是一个问题，
  // 选中状态因此放在趋势页而不是各张图内部，一次点选全页生效。
  const trends = read('js/views/trends.js');
  assert.match(trends, /^let selectedDay = null;$/m, '选中日应是模块级状态');
  assert.match(trends, /selectedX: selectedDay/, '图表没有接收选中日');
  assert.match(trends, /onPick: \(date\) => \{ selectedDay = selectedDay === date \? null : date; rerender\(\); \}/,
    '点同一天两次应取消选中');
  assert.match(trends, /if \(selectedDay && \(!isWeek \|\| !days\.includes\(selectedDay\)\)\) selectedDay = null;/,
    '切换区间后应清掉落在窗口外的选中日');

  // 图表本身不存选中状态，只按传进来的值画
  const charts = read('js/lib/charts.js');
  assert.ok(!charts.includes('attachPicker'), '旧的图内状态实现应已移除');
  assert.match(charts, /function markSelected\(/);
  // 柱状图上竖线会藏进柱子里，改成给这根柱子描边
  assert.match(charts, /function markSelectedBar\(/);
  const start = charts.indexOf('function markSelected(');
  const block = charts.slice(start, charts.indexOf('\n}', start));
  assert.ok(!/let |state\.|store/.test(block), 'markSelected 不该持有状态');
});

test('数值显示在图外，不遮挡数据点', () => {
  // 气泡压在数据点旁边会盖住相邻的点，手指点下去的位置又正好挡住它
  const trends = read('js/views/trends.js');
  const charts = read('js/lib/charts.js');
  assert.match(trends, /function readoutRow\(/);
  assert.ok(trends.includes('点图上任意一天查看当天数值'), '没选中时应给出可点提示');
  assert.ok(trends.includes("h('div.chart-readout.empty'"), '空态也要占一行，避免卡片高度跳动');
  assert.ok(!charts.includes('marker-bubble') && !charts.includes('marker-value'),
    '图内不应再画数值气泡');
  const css = read('css/app.css');
  assert.ok(css.includes('.chart-readout'), '缺少数值行样式');
});


test('每个 js 模块都在 Service Worker 的离线清单里', () => {
  // 漏一个模块，离线时整个应用就打不开——历史上 health-insights.js 和
  // importer.js 就漏过。新增模块必须同步改 sw.js，这条测试替人记着。
  const sw = read('sw.js');
  const cached = new Set([...sw.matchAll(/'\.\/(js\/[^']+\.js)'/g)].map((m) => m[1]));
  const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : (e.name.endsWith('.js') ? [`${dir}/${e.name}`] : [])));
  const missing = walk('js').filter((f) => !cached.has(f));
  assert.deepEqual(missing, [], `这些模块没进 sw.js 的 SHELL：${missing.join('、')}`);
});

test('Service Worker 缓存名跟着版本号走', () => {
  // 缓存名不变的话，老用户可能一直吃着旧壳
  const pkg = JSON.parse(read('package.json'));
  assert.ok(read('sw.js').includes(pkg.version),
    `sw.js 的 CACHE 名里没有 package.json 的版本号 ${pkg.version}`);
});
