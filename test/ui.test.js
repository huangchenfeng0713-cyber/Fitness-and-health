import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/*
 * 一个页面「包含」什么，应该按它挂载了哪些卡片来算，而不是按代码写在哪个文件里。
 * 身体信息、每日目标、数据管理都抽成了独立卡片模块，可以挂到任意页面；
 * 断言跟着页面走，之后再调整栏目分布就不用改这些用例。
 */
const CARD_MODULES = [
  'js/views/cards/profile.js',
  'js/views/cards/health-metrics.js',
  'js/views/cards/data-manager.js',
  'js/views/cards/trend-charts.js',
  'js/views/cards/meal-advice.js',
];
const page = (name) => {
  const own = read(`js/views/${name}.js`);
  const mounted = CARD_MODULES
    .filter((path) => own.includes(path.replace('js/views/', './')))
    .map((path) => read(path));
  return [own, ...mounted].join('\n');
};

test('栏目分工：数据页看数据与走势，设置页放身体信息与维护操作', () => {
  const app = read('js/app.js');
  const health = page('health');
  const settings = page('settings');
  const dashboard = page('dashboard');

  assert.match(app, /key: 'health', label: '数据'/);
  assert.match(app, /key: 'diet', label: '饮食'/);
  // 「数据」和「趋势」合成一页：现在怎么样和在往哪走是同一个问题
  assert.ok(!app.includes("label: '趋势'"), '趋势应已并入数据页');
  assert.ok(!app.includes('views/trends.js'), 'app.js 仍在引用已删除的趋势页');

  // 身体信息是一切目标计算的输入，改动频率最高，放在设置页最上面
  for (const text of ['身体信息', '日常活动量', '目标速率']) {
    assert.ok(settings.includes(text), `设置页缺少“${text}”`);
  }
  assert.ok(!read('js/views/health.js').includes('profileCard'),
    '数据页不该再挂身体信息表单');
  // 同步、备份、补录都是维护性操作，收进设置页
  for (const text of ['同步 Apple 健康', '本应用备份与恢复', '手动补录']) {
    assert.ok(settings.includes(text), `设置页缺少“${text}”`);
  }
  assert.ok(!read('js/views/health.js').includes('dataManagerCard'),
    '数据页不该再挂数据管理卡');
  /*
   * 每日目标长在今日页的主卡上：那里每一项都带着「已摄入 / 目标摄入」，
   * 比单独列一张只有目标的表多告诉你一件事——还差多少。
   * 数据页那张撤了，八项目标和它们的依据要在今日页找得到。
   */
  for (const item of ['纤维', '钠上限', '游离糖上限', '饮水']) {
    assert.ok(dashboard.includes(item), `今日主卡缺少目标项「${item}」`);
  }
  assert.ok(dashboard.includes("infoTip('查看目标计算依据'"), '目标依据没有跟着搬到今日页');
  assert.ok(!health.includes('当前每日目标'), '数据页不该再单列一张只有目标的表');
  assert.ok(!settings.includes('当前每日目标'), '设置页不该再重复每日目标');
  // 健康数据摆在数据页最上面，和下面那张画同一批指标的趋势卡挨着
  const dataMounted = health.slice(health.indexOf('export function renderHealth'));
  assert.ok(dataMounted.indexOf('healthMetricsCard()') < dataMounted.indexOf('trendCharts(rerender)'),
    '健康数据应排在趋势图之前');
  assert.ok(!dashboard.includes("h3', null, 'Apple 健康'"), '今日页不该再挂健康数据卡');

  assert.ok(!settings.includes('function dataCard'), '设置页仍保留旧的数据卡实现');
  // 同步入口跟着健康数据卡搬到了数据页，仍然只是把设置抽屉打开
  assert.ok(health.includes("document.querySelector('.topbar-settings-btn')"),
    '数据页的同步入口没有指向设置抽屉');
  assert.ok(!health.includes('importFromClipboard'), '数据页仍在直接执行数据导入');
  assert.ok(!dashboard.includes('importFromClipboard'), '今日页仍在直接执行数据导入');
});

test('同一批数字不在两页各写一遍', () => {
  /*
   * 简化那一轮盘出来的重复：
   *  - 今日的「今日记录」和饮食页的「饮食记录编辑」是同一批记录，一个只读一个可编辑；
   *  - 今日主卡已经把八项目标当分母写了一遍（85/87g 蛋白、1867/2000mg 钠）；
   *  - 「初步体重趋势 +0.14 kg/周」和体重图下面那段话说的是同一件事，图那边说得更全。
   * 功能一项没少，只是各自留在该在的那一页。
   */
  const dashboard = page('dashboard');
  const diet = page('diet');

  const mounted = dashboard.slice(dashboard.indexOf('export function renderDashboard'));
  assert.ok(!/entriesCard|'今日记录'/.test(mounted), '今日页又挂回了只读的记录卡');
  assert.ok(diet.includes('饮食记录编辑'), '可编辑的那张记录卡不能一起没了');

  // 健康数据每项配一个图标：六项全是数字加两个汉字，扫一眼分不出哪个是哪个
  const metrics = read('js/views/cards/health-metrics.js');
  for (const key of ['steps', 'activeEnergy', 'exerciseMinutes', 'sleepMinutes', 'weightKg', 'restingHR']) {
    assert.ok(new RegExp(`${key}:\\s*'M`).test(metrics), `指标 ${key} 没有图标`);
  }

  // 目标依据收进圈里的感叹号，但「你现在看到的数字不对」这几条不许收
  assert.match(dashboard, /function heroInfo\(/, '目标依据应收进主卡右上角');
  for (const keep of ['profileError', 'demoMode', 'missingObservationTime']) {
    assert.ok(new RegExp(`energyFreshness[\\s\\S]*${keep}`).test(dashboard),
      `出了问题的提示不能收进折叠面板：${keep}`);
  }
  for (const keep of ['clampedByFloor', 'rateWasClamped']) {
    assert.ok(dashboard.includes(keep), `「你填的数被改过了」这类提示不能丢：${keep}`);
  }
});

test('份量面板是底部弹层，记录按钮不会被顶到折叠线以下', () => {
  /*
   * 原先它长在搜索结果下面：选完一个食物要往下滚过整列结果才看得见，
   * 手机上这一滚就是大半屏。
   */
  const diet = read('js/views/diet.js');
  const sheet = read('js/lib/sheet.js');
  const css = read('css/app.css');
  assert.match(diet, /openSheet\(nodes\.portion/, '份量面板没有走公共弹层');
  assert.match(diet, /if \(!food\) \{ closeSheet\(\); return; \}/, '取消选中时没有关掉弹层');
  assert.match(css, /\.sheet \{[\s\S]*?position: absolute[\s\S]*?bottom: 0/, '弹层没有贴在底部');
  assert.match(css, /\.sheet-action \{[\s\S]*?position: sticky/, '记录按钮没有钉住');

  /*
   * 滚动穿透：弹层内部滚到头之后手指继续滑，会带着背后的页面跑，
   * 表现就是「点不中弹层里的东西」。两道都要有，缺一道 iOS 上都会漏。
   */
  assert.match(css, /\.sheet \{[\s\S]*?overscroll-behavior: contain/, '弹层没有拦住滚动链');
  assert.match(css, /body\.sheet-open \{[\s\S]*?position: fixed/, 'iOS 上只有 overflow:hidden 拦不住拖动');
  assert.match(sheet, /document\.body\.style\.top = `-\$\{lockedScrollY\}px`/, '钉住 body 时没有记住滚动位置');
  assert.match(sheet, /window\.scrollTo\(0, lockedScrollY\)/, '关掉弹层后没有滚回原处');
  // 背景点一下、Esc 都要能关
  assert.match(sheet, /sheet-backdrop', \{ onclick: \(\) => closeSheet\(\) \}/, '点背景关不掉弹层');
  assert.match(sheet, /ev\.key === 'Escape'/, 'Esc 关不掉弹层');
});

test('喝水要先确认再落库，卡面上只留杯量按钮', () => {
  // 原先点一下直接就记，口袋里误触一次就多出 250ml，
  // 而且这个数会连着覆盖 Apple 健康那边的饮水
  const card = read('js/views/cards/meal-advice.js');
  assert.match(card, /\{ label: '一小杯', ml: 125 \}/);
  assert.match(card, /\{ label: '中杯', ml: 250 \}/);
  assert.match(card, /\{ label: '大杯', ml: 550 \}/);
  assert.match(card, /openSheet\(waterSheet\(step/, '点杯量没有弹确认层');
  assert.match(card, /okBtn\.onclick = async \(\) => \{[\s\S]*?saveHealthDay/, '确认按钮不落库');
  // 落库只能发生在确认按钮里：卡面按钮直接写库就等于没有确认这一步
  const saves = card.match(/saveHealthDay\(/g) || [];   // 只数调用点，import 那行不算
  assert.equal(saves.length, 1, `喝水只该有一处落库，实际 ${saves.length} 处`);
});

test('搜索先出十条，换词收回展开；没找到时给反馈入口', () => {
  const diet = read('js/views/diet.js');
  assert.match(diet, /const RESULT_PREVIEW = 10/);
  // 换搜索词、换分类都要收回「显示更多」，否则搜下一个词还是一次铺满
  const resets = diet.match(/ui\.moreResults = false/g) || [];
  assert.ok(resets.length >= 2, `换词和换分类都要收回展开：只找到 ${resets.length} 处`);
  assert.match(diet, /function feedbackLink\(query\)/, '没有反馈入口');
  assert.match(diet, /【食物库缺条目】搜索词：/, '反馈模板没带上搜到的词');
});

test('历史搜索按高度折叠两行，没溢出就不出「展开」', () => {
  // 名字长短差得远（「米饭（白米）」和「肯德基 乒乒乓乓冰球杯（柠檬味）」），
  // 按个数截会时多时少，两行看起来像三行
  const diet = read('js/views/diet.js');
  const css = read('css/app.css');
  assert.match(diet, /const HISTORY_LIMIT = 10/);
  assert.match(diet, /'历史搜索'/, '标签没改成历史搜索');
  assert.match(diet, /toggle\.hidden = !ui\.historyOpen && chips\.scrollHeight <= chips\.clientHeight/,
    '没溢出时不该挂一个「展开」');
  assert.match(css, /\.fav-chips\.collapsed \{[^}]*max-height/, '折叠不是按高度截的');
});

test('缺数据的指标画一道杠，不是整格消失', () => {
  /*
   * 原先「没有值就不出现」：手表哪天没记静息心率，这一格就凭空少一个，
   * 格子重新排布、每天长得都不一样，而且「没测到」和「这个应用不显示心率」
   * 从界面上分不出来。
   */
  const metrics = read('js/views/cards/health-metrics.js');
  assert.match(metrics, /const DASH = '—'/, '没有占位符');
  assert.match(metrics, /value \?\? DASH/, '缺值时没有退回占位符');
  assert.ok(!/\.filter\(\(\[, , v\]\) => v != null\)/.test(metrics), '仍在把缺值的项过滤掉');
  // 体脂例外：多数人没有体脂秤，常年挂一道杠只是噪音
  assert.match(metrics, /\.\.\.\(bodyFat \? \[cell\('bodyFatPct'/, '体脂应当只在记到过时出现');
  // 一个数都没有时是「还没同步过」，不是一排杠
  assert.match(metrics, /has\s*\n?\s*\? h\('div\.metric-grid'/, '空状态判断没有走「有没有任何数据」');
});

test('漏记的那天不能被当成 0 画进折线', () => {
  // Number(null) 是 0，Number.isFinite(0) 是 true —— 没记录的那天曾经就这么
  // 混成实点，把折线拽到地板上，而图下面的解读用的是剔过 null 的均值
  const charts = read('js/lib/charts.js');
  assert.match(charts, /const hasValue = \(d\) => d != null && d\.y != null && d\.y !== ''/,
    'lineChart 仍在用 Number.isFinite(Number(y)) 直接判断');
  assert.ok(!/data\.filter\(\(d\) => Number\.isFinite\(Number\(d\.y\)\)\)/.test(charts));
  assert.match(charts, /if \(hasValue\(point\)\)/, '分段逻辑也要用同一个判断');
});

test('图表 key 认不出来时退回第一张，不让整张卡消失', () => {
  /*
   * activeChart 是模块级状态，活得比一次渲染长。删掉某个图、改了 key，
   * 或者别处误写一个值进来，SPEC[activeChart] 就是 undefined ——
   * 直接调用会抛在渲染中途，结果是数据页少了一整张卡，控制台里什么都没有。
   * 排查时实测过：把 activeChart 设成一个不存在的值，趋势卡整个不见了。
   */
  const charts = read('js/views/cards/trend-charts.js');
  assert.match(charts, /if \(typeof SPEC\[activeChart\] !== 'function'\) activeChart = CHARTS\[0\]\.key;/,
    '没有兜底：认不出来的 key 会让整张卡渲染失败');
  // 兜底必须在取 spec 之前
  assert.ok(charts.indexOf("typeof SPEC[activeChart] !== 'function'") < charts.indexOf('const spec = SPEC[activeChart]()'),
    '兜底写在了取 spec 之后，等于没有');
});

test('趋势卡标题固定，不跟着下拉变', () => {
  // 同一张卡的名字每切一次就换一个，找不到锚点；下拉第一项本来就写着看的是什么
  const charts = read('js/views/cards/trend-charts.js');
  assert.match(charts, /h\('h3', null, '健康趋势图'\)/);
  assert.ok(!/h\('h3', null, spec\.title\)/.test(charts), '标题仍在跟着下拉变');
});

test('身高体重只从 Apple 健康读，读到过就不再让人改', () => {
  /*
   * 界面上摆着一个能编辑的输入框、算目标时用的却是设备记录，改了没反应——
   * 比锁死更让人困惑。所以设备给过值就直接显示那个值，并写清是哪天读到的。
   * 设备从来没给过时输入框照常可用，否则新用户连身高都填不进去。
   */
  const profile = read('js/views/cards/profile.js');
  assert.match(profile, /const bodySource = state\.derived\?\.bodySource/, '锁定状态应来自 store 算好的来源');
  assert.match(profile, /if \(!hit\) return null;/, '没有设备记录时要退回可编辑的输入框');
  for (const key of ['heightCm', 'weightKg']) {
    assert.ok(new RegExp(`lockedField\\([^)]*'${key}'`).test(profile), `${key} 没有走只读字段`);
    assert.ok(new RegExp(`\\|\\| field\\([^)]*numInput\\('${key}'`).test(profile),
      `${key} 缺少「设备没给过就自己填」的退路`);
  }
  assert.match(profile, /来自 Apple 健康/, '只读字段要写明来源');

  // 只剩一个来源之后，那个「体重体脂跟随 Apple 健康」的开关就没有意义了
  const settings = page('settings');
  assert.ok(!settings.includes('syncWeightFromApple'), '身体数据只有一个来源，不该再留开关');

  // 健康数据卡上的体重同样沿用最近一次，并把日期标在名字后面
  const metrics = read('js/views/cards/health-metrics.js');
  assert.match(metrics, /latestHealthEntry/, '体重应取最近一次记录而不是当天那条');
  assert.match(metrics, /`体重 \$\{weight\.date\}`/, '沿用前几天的值要标出日期');
  assert.ok(!/'饮水'/.test(metrics), '饮水已从健康数据卡撤掉');
});

test('健身页有人体部位图，点哪块选哪组，已练的会点亮', () => {
  /*
   * 挑动作本来就是「我今天想练这块」，指着图上那块比在五个文字标签里挑更直接。
   * 正反两张并排：背和斜方肌在正面图上画不出来，硬塞会让人对不上位置。
   */
  const training = read('js/views/training.js');
  const map = read('js/data/body-map.js');
  const css = read('css/app.css');
  assert.match(training, /function bodyMap\(rerender\)/, '没有部位图');
  assert.match(training, /view\('front'\), view\('back'\)/, '缺正面或背面');
  // 五个组在图上都得点得到，否则有的组只能靠文字标签选
  const groups = new Set((map.match(/group: '(\w+)'/g) || []).map((m) => m.split("'")[1]));
  for (const key of ['chest', 'shoulder', 'back', 'leg', 'core']) {
    assert.ok(groups.has(key), `部位图上点不到「${key}」`);
  }
  // 三种状态：选中 / 已覆盖 / 其余
  assert.match(training, /covered\.has\(r\.group\) \? ' covered'/, '没有标出今天已经练到的部位');
  for (const cls of ['.body-region.active', '.body-region.covered']) {
    assert.ok(css.includes(cls), `${cls} 没有样式`);
  }
  // 图上的块要能用键盘操作
  assert.match(training, /node\.setAttribute\('tabindex', '0'\)/, '部位块不能聚焦');
  assert.match(training, /ev\.key === 'Enter' \|\| ev\.key === ' '/, '部位块不能用键盘选中');
});

test('动作行默认只给一行：练哪儿、什么模式', () => {
  // 原先每行都把主动肌和所有协同肌铺开，十几行叠起来全是同一批肌肉名，
  // 扫的时候反而找不到动作名在哪
  const training = read('js/views/training.js');
  const rows = training.match(/\$\{MUSCLES\[e\.primary\[0\]\] \|\| ''\} · \$\{PATTERNS\[e\.pattern\]\}/g) || [];
  assert.ok(rows.length >= 2, `挑动作和动作推荐都该用一行式，只找到 ${rows.length} 处`);
  // 排计划那张卡仍然给全：真要看细节是在排计划的时候，不是在挑的时候
  assert.match(training, /h\('div\.ex-muscle', null, muscleLine\(exercise\)\)/, '已选动作那张卡不该也砍掉协同肌');
});

test('动作列表默认只出前几个，但已选的绝不会被藏起来', () => {
  // 一个部位三十来个动作是整整一屏半；而列表里那一行的 ✓ 就是取消选择的入口，
  // 收起时把它藏掉，等于选了就撤不掉。
  const training = read('js/views/training.js');
  assert.match(training, /const LIST_PREVIEW = \d+/);
  assert.match(training, /list\.slice\(LIST_PREVIEW\)\.filter\(\(e\) => chosen\.has\(e\.id\)\)/,
    '排在预览之后的已选动作要接到末尾');
  // 换部位、换器械档位都要收回去，否则换一档还是满屏
  const resets = training.match(/showAllExercises = false/g) || [];
  assert.ok(resets.length >= 2, `切部位和切器械档位都要收回预览：只找到 ${resets.length} 处`);
});

test('可移动的卡片各自成模块，换页只是改一行 import', () => {
  // 栏目分布还会调整；卡片抽成模块后，搬家不用再搬几百行代码
  for (const path of CARD_MODULES) {
    const src = read(path);
    assert.match(src, /^export function \w+\(/m, `${path} 没有导出挂载函数`);
  }
  const sw = read('sw.js');
  for (const path of CARD_MODULES) {
    assert.ok(sw.includes(`'./${path}'`), `${path} 没进离线外壳`);
  }
});

test('Apple 健康同步与完整备份在文案和行为上明确区分', () => {
  const health = page('settings');
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

test('数据页只留健康数据和趋势，解读收到每张图下面', () => {
  // 原先「近 14 天概览」「健康数据解读」「最近记录」三张卡加上趋势图，
  // 一页四五屏、三处在说同一批数字。
  const health = page('health');
  const settings = page('settings');
  const css = read('css/app.css');
  const rendered = health.slice(health.indexOf('export function renderHealth'));
  const at = (name) => rendered.indexOf(name);
  assert.ok(at('healthMetricsCard()') >= 0, '数据页缺少健康数据卡');
  assert.ok(at('healthMetricsCard()') < at('trendCharts(rerender)'), '健康数据应排在趋势图之前');
  for (const gone of ['overviewCard(', 'insightCard(', 'dataTable(', 'targetCard(']) {
    assert.ok(!rendered.includes(gone), `${gone} 应该已经移除`);
  }
  // 移掉的步数与锻炼解读要在图表里补回来，功能不能因为搬家而少
  const charts = read('js/views/cards/trend-charts.js');
  for (const key of ["key: 'steps'", "key: 'exercise'"]) {
    assert.ok(charts.includes(key), `趋势图缺少 ${key}`);
  }
  const reading = read('js/core/trend-reading.js');
  assert.match(reading, /steps: readSteps, exercise: readExercise/, '新图没有对应的解读');
  // 身体信息挪到了设置页最上面：它是目标计算的输入，不是「最近怎么样」的一部分
  const drawer = settings.slice(settings.indexOf('export function renderSettings'));
  assert.ok(drawer.indexOf('profileCard(rerender)') > 0, '设置页缺少身体信息');
  assert.ok(drawer.indexOf('profileCard(rerender)') < drawer.indexOf('dataManagerCard(rerender)'),
    '身体信息应排在数据管理之前');

  const manager = read('js/views/cards/data-manager.js');
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
  const settings = page('settings');
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
  const settings = page('settings');
  assert.ok(settings.includes("resolveConflict('cloud')"), '缺少保留云端版本的选择');
  assert.ok(settings.includes("resolveConflict('device')"), '缺少保留本机版本的选择');
  assert.ok(settings.includes('不会静默覆盖'));
  assert.ok(settings.includes('signOutSafely'), '退出没有走安全登出接口');
  assert.ok(settings.includes('退出前会先确认最新数据已上传'));
  assert.ok(settings.includes('成功后会从这台设备清除该账号的数据'));
  assert.ok(settings.includes('signOutPreservingLocal'), '同步失败后缺少保留本机记录的退出路径');
  assert.ok(settings.includes('保留本机记录并退出'));
  assert.ok(settings.includes('只能重新登录原账号后恢复'));
});

test('账号归属未确认时锁定业务界面和设置，只允许原账号恢复或明确认领', () => {
  const app = read('js/app.js');
  const settings = page('settings');
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
  const health = page('settings');
  assert.ok(health.includes('getAccountState'));
  assert.ok(health.includes('恢复后的完整数据还会同步并替换当前账号的云端版本'));
  assert.ok(health.includes('清空当前账号数据'));
  assert.ok(health.includes('同步清空该账号云端'));
  assert.ok(health.includes('await syncNow()'), '恢复或清空后没有显式等待账号同步');
});

test('含咖啡因功能饮料按毫升记录，并动态显示整份咖啡因', () => {
  const diet = page('diet');
  assert.ok(diet.includes("food.basis === '100ml'"));
  assert.ok(diet.includes('food.caffeineMg'));
  assert.ok(diet.includes('本份约含 ${caffeine} mg 咖啡因'));
  assert.ok(diet.includes("isLiquid ? 'ml' : 'g'"));
});

test('趋势页的体重门槛、蛋白达标线与当前日统计口径一致', () => {
  const trends = page('health');
  const charts = read('js/lib/charts.js');
  // 体重门槛的说法由解读模块给出，必须和 weightTrendStats 的实际口径一致
  assert.ok(read('js/core/trend-reading.js').includes('至少需要 4 次、且首末相隔 7 天'));
  assert.match(read('js/core/health-insights.js'),
    /points\.length >= 4 && elapsedDays >= 7/, '体重拟合门槛与解读文案不一致');
  assert.ok(trends.includes('target: proteinThreshold'));
  assert.ok(trends.includes('targetLabel: `达标线 ${Math.round(proteinThreshold)}g`'));
  assert.ok(trends.includes('overIsBad: false'), '蛋白超过最低目标不应标红');
  // 当天已经整体不画了，不再需要「半截数据点」处理
  assert.ok(!trends.includes('partialX'), '趋势页不该还留着当天半截数据的处理');
  assert.ok(charts.includes('emptyText = \'数据不足，至少需要 2 个记录日\''));
});

test('趋势页统计图统一为折线图，漏记日断线而不是虚构连续数据', () => {
  const trends = page('health');
  const charts = read('js/lib/charts.js');
  assert.ok(!trends.includes('barChart'), '趋势页仍在使用柱状图');
  for (const title of ['每日热量摄入', '每日蛋白摄入']) {
    const index = trends.indexOf(`title: '${title}'`);
    assert.ok(index > 0, `缺少${title}图表`);
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
  const diet = page('diet');
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
  // 推荐卡从今日页搬到饮食页后，一键记录的入口也跟着过去了
  const diet = page('diet');
  const utils = read('js/lib/utils.js');
  const css = read('css/app.css');
  assert.ok(diet.includes('runLocalAction'));
  assert.ok(utils.includes('control.disabled = wasDisabled'));
  assert.match(css, /\.entry-name \.info-tip-panel \{[\s\S]*position: fixed/);
  assert.match(css, /\.entry-name \.info-tip-panel \{[\s\S]*bottom: calc\(78px \+ var\(--safe-bottom\)\)/);
  assert.match(css, /\.entry-name \.info-tip-panel \{[\s\S]*max-height: min\(38vh, 280px\)/);
});

test('脂肪计划值不再冒充上限，液体条目始终使用 ml', () => {
  const advisor = read('js/core/advisor.js');
  const dashboard = page('dashboard');
  const diet = page('diet');
  const settings = page('settings');
  // 脂肪现在按区间画：下界 AMDR 20%、上界 35%，两头都得有依据
  const metrics = read('js/core/metrics.js');
  assert.match(metrics, /lo: targets\.fatLower[\s\S]*hi: targets\.fatUpper/, '脂肪区间没有用 AMDR 两端');
  assert.match(read('js/core/nutrition.js'), /const fatLower = round\(\(kcal \* 0\.20\) \/ ATWATER\.fat\)/);
  assert.ok(dashboard.includes('参考上限'), '脂肪的参考上限依据要写清楚');
  // 记录行搬到饮食页之后，液体用 ml 这条也跟着搬了过去
  assert.ok(diet.includes("findFood(e.foodId)?.basis === '100ml'"));
  assert.ok(diet.includes("basis === '100ml' ? '100ml' : '100g'"));
  assert.ok(diet.includes("isLiquid ? '毫升数' : '克数'"));
  assert.ok(advisor.includes("food.basis === '100ml' ? 'ml' : 'g'"));
});

test('数据与趋势页显示统计截止日期，新版本可主动提示刷新', () => {
  const app = read('js/app.js');
  const health = page('health');
  const settings = page('settings');
  const trends = page('health');
  assert.ok(app.includes('topbar-context-note'));
  assert.ok(app.includes('showUpdateNotice'));
  assert.ok(app.includes("updateViaCache: 'none'"));
  assert.ok(app.includes('registration.update()'));
  assert.ok(trends.includes("'当前设置估算目标'"));
});


test('趋势页所有折线图共用同一横轴窗口', () => {
  // 用户实测：同一个「近 30 天」下，体重图 08-22→08-23、活动能量 07-26→08-24。
  // 折线图不传 domain 就会各画各的。
  const trends = page('health');
  const calls = trends.match(/lineChart\(\{[\s\S]*?\}\)/g) || [];
  assert.ok(calls.length >= 4, `折线图数量异常：${calls.length}`);
  for (const call of calls) {
    assert.ok(/domain: axisDomain/.test(call),
      `有折线图没有传 domain：${call.slice(0, 90)}`);
  }
  assert.match(trends, /const axisDomain = \[days\[0\], days\[days\.length - 1\]\]/);
});

test('活动能量图有平均参考线，且与卡片标签同源', () => {
  const trends = page('health');
  const idx = trends.indexOf("title: '活动能量'");
  assert.ok(idx > 0, '找不到活动能量图表');
  const block = trends.slice(idx, idx + 900);
  assert.ok(/target: avgActive/.test(block), '活动能量图缺少平均参考线');
  assert.ok(/targetLabel: avgActive != null \? `平均 \$\{avgActive\}`/.test(block),
    '参考线标签应短且与卡片标签同一个数');
  assert.ok(/已结束日平均 \$\{avgActive\} kcal/.test(block), '卡片标签应写明是已结束日的平均');
});

test('趋势图统计到前一天为止，当天不画也不计入', () => {
  // 一天没过完，活动能量和摄入都还在累加，画出来是个必然偏低的点，
  // 会被误读成「今天掉下去了」。区间本身就止于前一天，图与平均用同一批数据。
  const trends = page('health');
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
  const trends = page('health');
  const labels = [...trends.matchAll(/label: '([^']+)', days:/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['7 天', '近一个月', '近六个月', '全部']);
});

test('只有 7 天视图开逐日标注与点选', () => {
  // 一个月以上一个点不到 20px，点选只会选错
  const trends = page('health');
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
  const trends = page('health');
  assert.match(trends, /range === 'all' \? fullTable\(days, dietByDate\) : null/);
  assert.match(trends, /function fullTable\(/);
  // 缺的字段要留空，不能当成 0
  assert.ok(trends.includes('不会当成 0'), '明细表没有说明缺失字段的处理');
});

test('一次点选让同一页所有图标注同一天', () => {
  // 「那天吃了多少、动了多少、睡了多久」是一个问题，
  // 选中状态因此放在趋势页而不是各张图内部，一次点选全页生效。
  const trends = page('health');
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
  const trends = page('health');
  const charts = read('js/lib/charts.js');
  assert.match(trends, /function readoutRow\(/);
  // 没选中就不占位：常驻一行「点图上任意一天……」纯属噪音
  assert.ok(!trends.includes('点图上任意一天'), '不该再常驻可点提示');
  assert.match(trends, /if \(!selectedDay\) return null;/, '没选中时读数行应整行不出现');
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

test('账号 SDK 固定版本，应用外壳按整版原子切换并支持离线恢复', () => {
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
  assert.ok(worker.includes('const shellRequest = navigation || SHELL_URLS.has(e.request.url)'));
  assert.ok(worker.includes('if (cached) return cached'), '当前控制器必须固定读取同一版应用外壳');
  assert.ok(worker.includes('addAll(SHELL)'), '新缓存必须在激活前一次性取得全部应用外壳');
  assert.ok(app.indexOf('void registerServiceWorker({ waitForControl: false })')
    < app.indexOf('const cloudInitialization = initCloud()'),
  '缓存更新与账号初始化应并行，不能把首屏卡在等待控制器上');
  assert.ok(app.includes('accountBootstrapPending'), '并行初始化时仍须锁住未确认归属的个人数据');
});

test('账号归属检查先于可交互首屏，暂时离线后可自动重连', () => {
  const app = read('js/app.js');
  const settings = page('settings');
  const boot = app.slice(app.indexOf('async function boot()'));
  assert.ok(boot.indexOf('const cloudInitialization = initCloud()') < boot.indexOf('renderTabs();'),
    '账号状态必须先切成 loading，设置抽屉才不会闪现旧账号资料');
  assert.ok(app.includes("window.addEventListener('online'"), '网络恢复时缺少账号服务重试');
  assert.ok(app.includes("account.transitionReason === 'auth-unavailable'"));
  assert.ok(settings.includes('const configured = account.configured !== false;'),
    '配置存在但网络离线时不应误报为管理员未配置');
  assert.ok(settings.includes('重新连接账号服务'));
});

test('启动卡住时提供只清程序缓存的自救入口，不会删除 IndexedDB 记录', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  assert.ok(html.includes('正在打开健康饮食助手'));
  assert.ok(html.includes('修复缓存并重新打开'));
  assert.ok(html.includes("key.startsWith('health-diet-')"));
  assert.ok(html.includes('registration.unregister()'));
  assert.ok(!/indexedDB\.deleteDatabase|clearAllData/.test(html), '缓存修复不得删除用户记录');
  assert.ok(html.includes('setTimeout(() => showRecovery(), 12_000)'));
  assert.ok(app.includes('window.__HEALTH_DIET_BOOT__?.ready?.()'));
  assert.ok(app.includes('window.__HEALTH_DIET_BOOT__?.fail?.(error)'));

  // initStore 失败时也要走 fail()：ready() 会把「修复缓存并重新打开」一并收掉，
  // 用户就只剩一条指错方向的提示，没有任何出路
  const bootCatch = app.slice(app.indexOf('await initStore();'), app.indexOf('void registerServiceWorker'));
  assert.ok(bootCatch.includes('window.__HEALTH_DIET_BOOT__?.fail?.('), '启动失败没有留下自救入口');
  assert.ok(!bootCatch.includes('?.ready?.()'), '启动失败仍在收掉启动页');
  // 不能先 clearEl(viewRoot)：启动页在 #view 里，摘掉之后
  // showRecovery() 会因为 screen.isConnected 为 false 直接返回，自救按钮永远不出现
  // 按行首匹配，别把解释这段历史的注释也算进去
  assert.ok(!/^\s*clearEl\(viewRoot\)/m.test(bootCatch), '启动失败时把自救界面一起清掉了');
  // 也不能一律甩锅给 IndexedDB —— 数据迁移和身体信息校验也在 initStore 里
  assert.ok(bootCatch.includes('storageLike'), '所有启动失败仍被说成存储不可用');
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

test('7 天视图首末日期靠边对齐，最后一天不会被 SVG 边界切掉', () => {
  // 右边距只有 12px，居中的「08-20」有一半落在绘图区外
  const charts = read('js/lib/charts.js');
  assert.match(charts, /const anchor = i === 0 \? 'start' : i === labelDays\.length - 1 \? 'end' : 'middle'/);
  assert.match(charts, /'text-anchor': anchor/);
});

test('短标签不会被从中间断成两截', () => {
  // 实测 393px 屏：「游离糖上限」被断成「游离糖上 / 限」，「1g 蛋白」被断成「蛋 / 白」。
  // 中文默认允许在任意两个字之间断行，短标签必须显式挡住。
  const css = read('css/app.css');
  for (const cls of ['.metric-row-label', '.metric-row-value', '.metric-row-note', '.hero-ring-note']) {
    assert.match(css, new RegExp(`\\${cls} \\{[^}]*white-space: nowrap`), `${cls} 会被从中间断开`);
  }
  assert.match(css, /\.card-tag \{[\s\S]*?word-break: keep-all;[\s\S]*?\}/, '卡片角标仍会在词内断行');
});

test('身体信息不可用时，界面说清是哪一条不合格', () => {
  // 笼统说「演示数据」会让人以为只是没填，实际是填了但被拒——
  // 常见于恢复了一份旧备份，或换设备后云端同步下来的旧档案。
  const dashboard = page('dashboard');
  assert.match(dashboard, /derived\.profileError/, '首屏没有读取身体信息的错误原因');
  assert.ok(dashboard.includes('身体信息暂时算不出目标'), '缺少可操作的提示文案');
  assert.ok(dashboard.includes('设置 → 身体信息'), '没有告诉用户去哪里改');
  // 提示要排在笼统的「演示身体数据」之前，否则具体原因会被它盖掉
  const at = (s) => dashboard.indexOf(s);
  assert.ok(at('derived.profileError') < at('当前使用演示身体数据'), '具体原因被笼统提示盖住了');

  const store = read('js/lib/store.js');
  assert.match(store, /const profileCheck = validateProfile\(effectiveProfile\)/);
  assert.match(store, /const calcProfile = profileCheck\.valid/, '没有退回默认档案');
  assert.ok(!/dailyTargets\(effectiveProfile/.test(store), '目标仍在用未经校验的档案计算');
});

test('食物数量不写死：界面上的数由食物库自己算，README 的数有测试盯着', () => {
  // 写死必然漂移：库里已经 1080 项时，饮食页还写着「900+ 种」、README 写着 1010。
  const diet = read('js/views/diet.js');
  assert.match(diet, /\$\{allFoods\(\)\.length\} 种/, '界面上的食物数仍是写死的');
  assert.ok(!diet.includes('900+'), '还残留写死的旧数字');

  const readme = read('README.md');
  const claimed = Number(readme.match(/内置 (\d+) 种常见食物/)?.[1]);
  const source = read('js/data/foods.js');
  const actual = (source.match(/\{ id: '/g) || []).length;
  assert.ok(Number.isFinite(claimed), 'README 里找不到食物数量');
  assert.ok(Math.abs(claimed - actual) <= 5,
    `README 写 ${claimed} 种，实际约 ${actual} 种`);
});

test('统计截止日期收在信息按钮里，不再占一整段正文', () => {
  // 那段话每次进页面都要读一遍，实际只在第一次有用。
  const health = page('health');
  assert.ok(!health.includes('今天还没过完，画进去必然是个偏低的点'), '正文里还留着那段说明');
  // 但口径本身不能丢，得能在信息按钮里查到
  assert.match(health, /统计到 \$\{endDay\} 为止；\$\{todayNote \|\| '所选日期当天不计入。'\}/);
});

test('区间与图表改用下拉，不再铺一屏按钮', () => {
  // 九张图加四个区间铺开就占掉大半屏，而每次只看其中一个。
  const health = page('health');
  assert.match(health, /h\('select\.trend-select'/, '没有改成原生下拉');
  assert.ok(!health.includes("h('div.chart-switch'"), '还留着一排图表按钮');
  assert.ok(!health.includes("h('div.range-switch'"), '还留着一排区间按钮');
  // 没数据的图仍可选，点进去会说明缺什么
  // 后缀短一点：下拉宽度只有半屏，「（暂无数据）」会把名字挤没
  assert.match(health, /availability\[c\.key\] \? c\.label : `\$\{c\.label\} · 无数据`/);
  // 选择器和图必须在同一张卡里
  assert.match(health, /h\('section\.card\.trend-card'[\s\S]{0,900}h\('div\.trend-pickers'/);
});

test('设置页不再把用户指向已经搬走的数据管理', () => {
  // 数据管理搬进设置抽屉后，关于卡片仍写着「都在“数据”栏目」，
  // 底下还有个 #health 链接——会把人送到一个没有数据管理的页面。
  const settings = read('js/views/settings.js');
  assert.ok(!settings.includes("href: '#health'"), '还留着指向数据页的死链');
  // 那句「维护操作都在本页」已删：数据管理卡就摆在同一页上方，不必再用一句话指路
  assert.ok(!settings.includes('“数据”栏目只看结果'), '又加回了指路的说明文字');

  // 用户可见文案里不该再出现已经不存在的「趋势页」
  for (const file of ['js/core/advisor.js', 'js/core/health-insights.js', 'js/core/nutrition.js']) {
    const src = read(file).split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    assert.ok(!src.includes('趋势页'), `${file} 的用户文案里还有「趋势页」`);
  }
});

test('训练计划按天落库，不再是刷新就没的页面内存', () => {
  // 之前是 `let picked = []`：选好的动作刷新一下全没，记不下来的计划等于没记
  const training = read('js/views/training.js');
  assert.ok(!/^let picked = \[\];$/m.test(training), '计划仍存在页面内存里');
  assert.match(training, /const picked = \(\) => session\(\)\.items/, '计划应从 store 读');
  assert.match(training, /saveTraining/, '没有写库入口');

  const db = read('js/lib/db.js');
  assert.match(db, /training: 'training'/, 'training store 没登记');
  assert.match(db, /createObjectStore\(STORES\.training, \{ keyPath: 'date' \}\)/);
  // 加 store 必须同时改版本号，否则老用户的库里不会创建它
  assert.match(db, /const DB_VERSION = 3;/, 'DB_VERSION 没跟着加 store 一起升');
  assert.match(db, /training: 50_000/, '导入体积上限漏了 training');
  assert.match(db, /assertUnique\('training', 'date', validDayKey\)/, '恢复备份时没校验 training');

  // 备份和云同步都要带上，否则换设备训练记录就丢了
  const sync = read('js/lib/cloud-sync.js');
  assert.match(sync, /'customFoods', 'training'/, '云同步没带上 training');
});

test('每个 store 都要同步到导入上限、备份校验和云同步三处', () => {
  /*
   * 上面那条只盯着 training 一个名字，再加第六个 store 照样能漏。
   * 这条按 db.js 里的 STORES 逐个查 —— 漏了云同步那份名单，
   * 换设备时那一类数据就静默丢失，用户是在新手机上发现的。
   */
  const db = read('js/lib/db.js');
  const block = db.match(/export const STORES = \{([\s\S]*?)\};/);
  assert.ok(block, '没找到 STORES 定义');
  const stores = [...block[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map((m) => m[2]);
  assert.ok(stores.length >= 5, `STORES 只解析出 ${stores.length} 个，正则可能过期了`);

  const limits = db.match(/const IMPORT_LIMITS = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(limits, '没找到 IMPORT_LIMITS');
  const sync = read('js/lib/cloud-sync.js');
  for (const store of stores) {
    assert.match(limits[1], new RegExp(`\\b${store}\\s*:`), `IMPORT_LIMITS 漏了 ${store}`);
    assert.match(sync, new RegExp(`'${store}'`), `cloud-sync.js 的 store 名单漏了 ${store}，换设备会丢这类数据`);
  }
});
