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

test('设置页覆盖本地模式、两种登录和互通的登录方式', () => {
  const settings = read('js/views/settings.js');
  const readme = read('README.md');
  for (const text of [
    '当前是本地模式', '注册账号', '使用 Google 登录', '忘记密码',
    '绑定 Google 登录', '添加邮箱密码登录', '更换登录密码',
  ]) {
    assert.ok(settings.includes(text), `账号设置缺少“${text}”`);
  }
  assert.ok(settings.includes('signInWithPassword'));
  assert.ok(settings.includes('signInWithGoogle'));
  assert.ok(settings.includes('setPassword'));
  assert.ok(settings.includes('linkGoogle'));
  assert.ok(settings.includes('同一个已验证邮箱'));
  assert.ok(readme.includes('docs/CLOUD_SYNC.md'), 'README 没有云同步部署文档入口');
});

test('账号冲突必须明确选择，退出使用先同步后清本机的安全流程', () => {
  const settings = read('js/views/settings.js');
  assert.ok(settings.includes("resolveConflict('cloud')"), '缺少保留云端版本的选择');
  assert.ok(settings.includes("resolveConflict('device')"), '缺少保留本机版本的选择');
  assert.ok(settings.includes('不会静默覆盖'));
  assert.ok(settings.includes('signOutSafely'), '退出没有走安全登出接口');
  assert.ok(settings.includes('退出前会先确认最新数据已上传'));
  assert.ok(settings.includes('成功后会从这台设备清除该账号的数据'));
});

test('账号归属未确认时锁定业务界面和设置，只允许原账号恢复或明确认领', () => {
  const app = read('js/app.js');
  const settings = read('js/views/settings.js');
  assert.ok(app.includes('accountDataLocked'), '应用入口缺少账号数据隐私锁');
  assert.ok(app.includes('账号数据已锁定'));
  assert.ok(!app.includes('先导出备份'), '未重新认证时不应允许导出原账号健康数据');
  assert.ok(settings.includes("account.status === 'locked'"));
  assert.ok(app.includes('account.ownershipPending === true'));
  assert.ok(settings.includes('account.ownershipPending === true'));
  assert.ok(app.includes("account.status === 'loading' && !account.user"), '账号初始化异常时可能 fail-open 显示旧数据');
  assert.ok(settings.includes("account.conflict?.reason === 'orphan-local-data'"));
  assert.ok(settings.includes('mount(root, slot)'), '锁定时设置页仍可能显示身体资料与目标');
  assert.ok(settings.includes('原账号的数据仍锁定在这台设备上'));
  assert.ok(settings.includes('云账号暂时不可用，原账号数据已锁定'));
  assert.ok(settings.includes('完成前暂不提供同步、退出或登录方式修改'));
  assert.ok(settings.indexOf('else if (actionableConflict)')
    < settings.indexOf('else if (account.ownershipPending === true)'),
  '可操作冲突被 ownershipPending 加载态挡住，用户将无法选择版本');
  assert.ok(app.includes('accountDataLocked(account) || !isEditing()'), '输入框聚焦时隐私锁仍可能保留旧设置 DOM');
  assert.ok(settings.includes('确认属于我并上传'));
  assert.ok(settings.includes('清空本机，使用空账号'));
});

test('登录账号下恢复备份和清空会明确同步影响云端', () => {
  const health = read('js/views/health.js');
  assert.ok(health.includes('getAccountState'));
  assert.ok(health.includes('恢复后的完整数据还会同步并替换当前账号的云端版本'));
  assert.ok(health.includes('清空当前账号数据'));
  assert.ok(health.includes('同步清空该账号云端'));
  assert.ok(health.includes('await syncNow()'), '恢复或清空后没有显式等待账号同步');
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

test('普通食物记录失败会恢复按钮，条目说明不会被底栏截断', () => {
  const diet = read('js/views/diet.js');
  const dashboard = read('js/views/dashboard.js');
  const utils = read('js/lib/utils.js');
  const css = read('css/app.css');
  assert.ok(diet.includes('runLocalAction'));
  assert.ok(dashboard.includes('runLocalAction'));
  assert.ok(utils.includes('control.disabled = wasDisabled'));
  assert.match(css, /\.entry-name \.info-tip-panel \{[\s\S]*position: fixed/);
  assert.match(css, /\.entry-name \.info-tip-panel \{[\s\S]*bottom: calc\(78px \+ var\(--safe-bottom\)\)/);
  assert.match(css, /\.entry-name \.info-tip-panel \{[\s\S]*max-height: min\(38vh, 280px\)/);
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

test('账号 SDK 固定版本并在首次成功加载后支持离线恢复', () => {
  const config = read('js/config/cloud.js');
  const worker = read('sw.js');
  const app = read('js/app.js');
  const version = config.match(/SUPABASE_JS_VERSION = '([^']+)'/)?.[1];
  assert.ok(version, '云配置没有固定 Supabase SDK 版本');
  assert.ok(worker.includes(`@supabase/supabase-js@${version}/+esm`), 'Service Worker 缓存的 SDK 版本不一致');
  assert.ok(worker.includes("e.request.destination === 'script'"));
  assert.ok(worker.includes("res.type !== 'opaque'"));
  assert.ok(worker.includes('await cache.put(e.request, res.clone())'));
  assert.ok(worker.includes('k !== SDK_CACHE'), '应用升级时不应删除已按需缓存的 SDK 依赖图');
  assert.ok(worker.includes('k.startsWith(CACHE_PREFIX)'), '应用升级时只能清理本应用命名空间内的旧缓存');
  assert.ok(worker.includes("'code', 'error', 'error_code', 'error_description'"), 'OAuth 回调查询不应写入离线缓存');
  assert.ok(app.indexOf('await registerServiceWorker({ waitForControl: inspectCloudConfig().configured })')
    < app.indexOf('await initCloud()'), '首次账号 SDK 加载前 Service Worker 尚未接管页面');
});

test('生产页面只在应用启动前注入 Supabase 浏览器公开配置', () => {
  const html = read('index.html');
  const config = read('js/config/cloud.js');
  const assignment = html.indexOf('window.__HEALTH_DIET_CLOUD_CONFIG__');
  const appModule = html.indexOf('<script type="module" src="js/app.js"></script>');
  assert.ok(assignment >= 0 && assignment < appModule, '云配置必须在 app.js 启动前注入');
  assert.match(html, /supabaseUrl:\s*'https:\/\/[a-z0-9]+\.supabase\.co'/);
  assert.match(html, /supabasePublishableKey:\s*'sb_publishable_[A-Za-z0-9_-]+'/);
  assert.ok(!/sb_(?:secret|service_role)_/i.test(html), '生产页面不得包含 Secret/service-role key');
  assert.ok(config.includes("/^sb_(?:secret|service_role)_/i"), '配置校验必须继续拒绝高权限密钥');
});
