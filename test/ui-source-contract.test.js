import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('健身器械筛选由 training view 自己管理状态', () => {
  const training = text('js/views/training.js');
  assert.match(training, /let equipMenuOpen = false/);
  assert.match(training, /equip-filter-menu/);
});

test('选择动作是三种形态，不是三排一样的灰槽', () => {
  const training = text('js/views/training.js');
  /*
   * 挑法（用哪套分类法）、范围（练哪儿）、视图（怎么呈现）是三件不同的事，
   * 却曾经是三排一模一样的灰槽白格叠在一起 —— 读出来是三个并列的兄弟。
   * 现在：挑法是下拉、范围是唯一那排分段控件、视图收窄一档挂在列表头右边。
   * 层级由形态 + 疏密表达，不靠三块一样的灰槽比谁在上面。
   */
  assert.doesNotMatch(training, /picker-mode-switch/, '挑法又变回分段控件了');
  assert.match(training, /h\('select\.picker-mode-select'/, '挑法应当是个下拉');
  assert.match(training, /picker-scope-switch/);
  assert.match(training, /byGroup \? groupTabs\(rerender\) : splitTabs\(rerender\)\);/,
    'picker-controls 里只该有挑法和范围');
  assert.match(training, /const listHead = h\('div\.picker-list-head'/,
    '缺少「这张列表是什么」那一行');
  assert.match(training, /h\('div\.picker-list-tools', null, equipMenu\(rerender, all\), viewTabs\)/,
    '视图切换没有和器械筛选一起挂在列表头右边');
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

/*
 * 版本号只在 package.json 里写一次，其余三处必须跟上。
 *
 * 原先这条测试把版本号也硬编码了一遍，于是每次发版要改五个地方 ——
 * 而它本来要防的是「改了 package.json 忘了改 sw.js，离线外壳不更新」。
 * 从 package.json 读出来再比对，改一处就够，约束还在。
 */
test('应用版本与离线缓存键同步', () => {
  const version = JSON.parse(text('package.json')).version;
  assert.match(version, /^\d+\.\d+\.\d+$/, `package.json 的版本号不对：${version}`);
  const esc = version.replace(/\./g, '\\.');
  assert.match(text('js/core/feedback.js'), new RegExp(`APP_VERSION = '${esc}'`),
    'feedback.js 的版本号没跟上');
  assert.match(text('sw.js'), new RegExp(`health-diet-v${esc}`),
    'sw.js 的缓存键没跟上 —— 漏了这个，用户拿到的还是上一版的离线外壳');
  assert.match(text('README.md'), new RegExp(`当前版本：\\*\\*v${esc}\\*\\*`),
    'README 的版本号没跟上');
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
  /*
   * 数据色和语义色是两套：语义色说「好不好」，数据色说「这是哪一项」。
   * 饮水属于后者，所以它有自己的蓝，而不再借用主绿 ——
   * 借用的时候，主卡上「符合计划的绿」和「饮水这一项的绿」是同一个颜色。
   */
  assert.match(css, /--water: #[0-9a-f]{6}/, '饮水没有自己的数据色');
  assert.doesNotMatch(css, /--water:\s*var\(--accent\)/, '数据色又借用了语义色');
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
  /*
   * 说明层只写用户拿来判断的话。
   * 「估算依据：通用中式配方折算」和「资料核对日期」讲的是这份数据怎么来的、
   * 什么时候核过 —— 维护这个库的人要，照着吃饭的人不要。
   */
  // 只看真的会渲染出去的字符串，注释里记着为什么删的那段不算
  const strings = (disclosure.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    .match(/'[^'\n]*'|`[^`]*`/g) || []).join(' ');
  assert.doesNotMatch(strings, /估算依据|资料核对日期/,
    '说明面板里又出现了讲数据怎么来的文字');
  assert.match(disclosure, /disclosure\.generic/, '共有的误差来源没有展示');
  assert.match(disclosure, /const generics = \[\.\.\.new Set\(/,
    '共有的那句误差没有去重，列五道菜会抄五遍');

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
