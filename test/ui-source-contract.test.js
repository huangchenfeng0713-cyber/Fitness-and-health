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

test('移动端选择动作控制区保持三层结构', () => {
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
  assert.doesNotMatch(smoke, /waitUntil:\s*'networkidle'/,
    '可选云请求会让 networkidle 永远等不到，启动冒烟应以 DOM 与应用节点为准');
});

test('应用版本与离线缓存键同步', () => {
  assert.match(text('package.json'), /"version": "2\.11\.3"/);
  assert.match(text('js/core/feedback.js'), /APP_VERSION = '2\.11\.3'/);
  assert.match(text('sw.js'), /health-diet-v2\.11\.3/);
  assert.match(text('README.md'), /当前版本：\*\*v2\.11\.3\*\*/);
});

test('截图反馈对应的移动端文案与布局不会回退', () => {
  const dashboard = text('js/views/dashboard.js');
  const diet = text('js/views/diet.js');
  const mealAdvice = text('js/views/cards/meal-advice.js');
  const training = text('js/views/training.js');
  const css = text('css/app.css');
  const polish = text('css/ux-polish.css');

  assert.doesNotMatch(dashboard, /h\('summary'[^\n]*'为什么'/, '今日页又出现成排“为什么”');
  assert.match(dashboard,
    /persistentInfoTip\('today-insights-evidence', '查看当前提示的判断依据'/,
    '今日提示缺少唯一的卡片级说明入口');
  assert.doesNotMatch(dashboard, /insight-why/, '今日提示行里又出现了各自的感叹号');
  assert.match(dashboard, /const explained = list\.filter\(\(insight\) => insight\.basis\)/,
    '说明层内容没有跟随当前显示的提示');
  assert.match(css, /\.insight-evidence-tip \.info-tip-panel\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s,
    '集中后的提示依据在手机上可能长出屏幕');
  assert.match(training, /h\('h3', null, '选择动作'\)/);
  assert.doesNotMatch(training, /h\('h3', null, '挑动作'\)/);
  assert.match(training, /exerciseMeta\(exerciseTags\(e\)\)/,
    '全部动作没有使用主要动作模式、主要肌肉、动作类型标签');
  assert.match(training, /exerciseMeta\(item\.tags\)/,
    '推荐组合没有使用同一个标签渲染器');

  assert.match(diet, /section\.card\.search-card/, '食物搜索卡缺少控制输入态样式的锚点');
  const searchHead = diet.slice(diet.indexOf("h('div.card-head.search-card-head"), diet.indexOf("h('div.search-row.search-row-full"));
  assert.doesNotMatch(searchHead, /allFoods\(\)\.length| 种/, '添加食物标题又显示库内数量');
  assert.doesNotMatch(diet, /category-browser|nodes\.categories/,
    '添加食物搜索框下又出现分类标签');

  assert.match(mealAdvice, /div\.recommend-budget/, '推荐预算又挤回标题右边');
  assert.match(polish, /\.recommend-budget span\s*\{[^}]*white-space:\s*nowrap/s,
    '推荐预算仍可能折到第二行');
  assert.match(css, /--water:\s*var\(--accent\)/, '饮水没有统一成主绿色');
  assert.doesNotMatch(mealAdvice, /\*\*直接饮水\*\*/, 'DOM 文案里混入了不会渲染的 Markdown');
});

test('筛选菜单不会在切换栏目后把旧健身页画回来', () => {
  const training = text('js/views/training.js');
  assert.match(training,
    /if \(document\.querySelector\('#view \.exercise-picker-card'\)\) rerenderTraining\(\);/);
});

test('健康同步入口不重复出现', () => {
  const metrics = text('js/views/cards/health-metrics.js');
  const health = text('js/views/health.js');
  assert.match(metrics, /health-sync-action/);
  assert.match(metrics, /setIntent\(\{ settingsSection: 'data' \}\)/,
    '健康卡的同步按钮没有直达导入与备份');
  assert.match(health, /!metrics\.querySelector\('\.health-sync-action'\)/);
});
