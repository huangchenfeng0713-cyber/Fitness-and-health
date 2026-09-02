import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('健身器械筛选由 training view 自己管理状态', () => {
  const training = text('js/views/training.js');
  assert.match(training, /let equipMenuOpen = false/);
  assert.match(training, /equip-filter-menu/);
});

test('选择动作是「2 + 1」，不是三级下钻', () => {
  const training = text('js/views/training.js');
  assert.match(training, /picker-mode-switch/);
  assert.match(training, /picker-scope-switch/);
  /*
   * 上面两排是筛（挑法 → 范围），picker-controls 里只有这两排。
   * 「全部动作 / 推荐组合」换的是同一批动作的呈现方式，不是把范围再切细 ——
   * 塞进同一组控件等于宣称三者是一条下钻链。
   */
  assert.match(training, /byGroup \? groupTabs\(rerender\) : splitTabs\(rerender\)\);/,
    'picker-controls 里不该有第三排');
  assert.match(training, /const listHead = h\('div\.picker-list-head'/,
    '缺少「这张列表是什么」那一行');
  assert.match(training, /listHead,\s*\n\s*viewTabs,/,
    '视图切换没有跟着列表头走');
  assert.ok(!/picker-list-toolbar/.test(training), '列表工具条应当已经取消');
  assert.doesNotMatch(training, /equipTabs\(rerender, all\)/);
  // 器械筛选得看得出是能点的：图标 + 文字 + 箭头，不是一行裸文字
  assert.match(training, /icon\('filter', 'equip-filter-icon'\)/, '器械筛选没有图标');
  assert.match(text('css/app.css'), /\.equip-filter-btn \{[^}]*border: 1px solid/s,
    '器械筛选没有可点的外形');
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
  assert.match(text('package.json'), /"version": "3\.1\.0"/);
  assert.match(text('js/core/feedback.js'), /APP_VERSION = '3\.1\.0'/);
  assert.match(text('sw.js'), /health-diet-v3\.1\.0/);
  assert.match(text('README.md'), /当前版本：\*\*v3\.1\.0\*\*/);
});

test('截图反馈对应的移动端文案与布局不会回退', () => {
  const dashboard = text('js/views/dashboard.js');
  const diet = text('js/views/diet.js');
  const mealAdvice = text('js/views/cards/meal-advice.js');
  const training = text('js/views/training.js');
  const css = text('css/app.css');
  const polish = text('css/app.css');

  assert.doesNotMatch(dashboard, /h\('summary'[^\n]*'为什么'/, '今日页又出现成排“为什么”');
  assert.match(dashboard,
    /persistentInfoTip\('today-insights-evidence', '查看当前提示的判断依据'/,
    '今日提示缺少唯一的卡片级说明入口');
  assert.doesNotMatch(dashboard, /insight-why/, '今日提示行里又出现了各自的信息按钮');
  assert.match(dashboard, /const explained = list\.filter\(\(insight\) => insight\.basis\)/,
    '说明层内容没有跟随当前显示的提示');
  assert.match(css, /\.insight-evidence-tip \.info-tip-panel\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s,
    '集中后的提示依据在手机上可能长出屏幕');
  assert.match(training, /h\('h3', null, '选择动作'\)/);
  assert.doesNotMatch(training, /h\('h3', null, '挑动作'\)/);
  /*
   * 标签仍由 exerciseTags 统一给；只是把「主练 XX」在它等于筛选条件本身时省掉 ——
   * 筛到「胸」的时候五行全写「主练胸大肌中部」，重复五遍反而把有区别的那两条挤淡了。
   */
  assert.match(training, /exerciseMeta\(exerciseTags\(e, \{ scopeMuscles \}\)\)/,
    '全部动作没有使用主要动作模式、主要肌肉、动作类型标签');
  assert.match(training, /const scopeMuscles = byGroup \? group\.muscles : null;/,
    '没有把当前范围传给标签渲染');
  assert.match(training, /exerciseMeta\(item\.tags\)/,
    '推荐组合没有使用同一个标签渲染器');

  assert.match(diet, /section\.card\.search-card/, '食物搜索卡缺少控制输入态样式的锚点');
  const searchHead = diet.slice(diet.indexOf("h('div.card-head.search-card-head"), diet.indexOf("h('div.search-row.search-row-full"));
  assert.doesNotMatch(searchHead, /allFoods\(\)\.length| 种/, '添加食物标题又显示库内数量');
  assert.doesNotMatch(diet, /category-browser|nodes\.categories/,
    '添加食物搜索框下又出现分类标签');
  assert.doesNotMatch(diet, /favRow|historyChip|refreshFav|HISTORY_LIMIT/,
    '添加食物又出现历史记录');

  assert.match(mealAdvice, /div\.recommend-budget/, '推荐预算又挤回标题右边');
  assert.match(polish, /\.recommend-budget span\s*\{[^}]*white-space:\s*nowrap/s,
    '推荐预算仍可能折到第二行');
  assert.match(css, /--water:\s*var\(--accent\)/, '饮水没有统一成主绿色');
  assert.doesNotMatch(mealAdvice, /\*\*直接饮水\*\*/, 'DOM 文案里混入了不会渲染的 Markdown');
});

test('估算菜品统一使用弱标签，误差来源集中到信息面板', () => {
  const diet = text('js/views/diet.js');
  const mealAdvice = text('js/views/cards/meal-advice.js');
  const disclosure = text('js/views/cards/food-estimate.js');
  const foods = text('js/data/foods.js');
  const css = text('css/app.css');
  const sw = text('sw.js');

  assert.match(disclosure, /export function estimateTag\(food\)/,
    '各页面没有复用同一枚估算标签');
  assert.match(disclosure, /export function foodInfoTip\(food/,
    '单项估算依据没有统一进入信息面板');
  assert.match(disclosure, /export function estimateGroupInfoTip\(foods/,
    '多条菜品没有使用卡片级集中说明');
  assert.match(foods, /export function estimateDisclosure\(food\)/,
    '估算依据与误差没有数据层统一口径');
  assert.match(disclosure, /'估算依据：'/);
  assert.match(disclosure, /'主要误差：'/);

  assert.ok((diet.match(/estimateTag\(/g) || []).length >= 5,
    '搜索、备选清单、份量、复合食物或饮食记录中仍有估算标签缺口');
  assert.match(mealAdvice, /estimateTag\(f\)/, '当前饮食推荐没有统一估算标签');
  assert.match(mealAdvice, /estimateGroupInfoTip\(all\.map/,
    '推荐中的误差来源没有集中到卡片级信息面板');
  assert.match(diet, /estimateGroupInfoTip\(\s*\n\s*entries\.map/,
    '饮食记录中的估算项没有集中说明');
  /*
   * 每一行不许再各挂一个信息按钮：十几条记录就是十几个 ⓘ，
   * 而它们说的多半是同一句话。依据只该有一个入口。
   */
  assert.ok(!/foodInfoTip\(food, \{\s*\n?\s*label: '查看估算与记录说明'/.test(diet),
    '饮食记录又给每一行挂了一个信息按钮');
  assert.doesNotMatch(diet, /按配料估算/, '复合食物仍使用不一致的标签文字');
  assert.doesNotMatch(diet, /营养会随配方、烹调或品牌而变化，以上数值为估算参考/,
    '估算误差仍散落在份量面板正文');

  assert.match(css, /\.chip-est\s*\{[^}]*background:\s*transparent[^}]*color:\s*var\(--faint\)/s,
    '估算标签仍是警告色，没有降为弱标签');
  assert.doesNotMatch(css, /\.chip-est\s*\{[^}]*var\(--warn\)/s,
    '估算标签不应使用警告色');
  assert.match(sw, /\.\/js\/views\/cards\/food-estimate\.js/,
    '估算呈现模块没有进入离线应用外壳');
  assert.ok((diet.match(/div\.portion-title-line/g) || []).length >= 2,
    '普通与复合食物的菜名、估算和分类没有共用标题行');
  assert.match(css, /\.portion-title-line\s*\{[^}]*column-gap:\s*6px/s,
    '估算与分类标签之间没有稳定留白');
  assert.match(css, /\.info-tip-panel strong\s*\{[^}]*font-size:\s*inherit/s,
    '信息面板的黑体说明仍会擅自放大字号');
  assert.doesNotMatch(css, /\.estimate-disclosure-list\s*\{[^}]*overflow-y:\s*auto/s,
    '估算列表和外层面板形成了双重滚动');
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
