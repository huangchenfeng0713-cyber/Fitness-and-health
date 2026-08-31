import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/*
 * 断言之前先把注释去掉。这一条踩过两次：注释里写着「用 click 而不是 pointerdown」，
 * 而用例断言的是「代码里不许出现 pointerdown」—— 它匹配到了那句解释自己的话，
 * 于是明明改对了却一直红。
 */
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

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
   *  - 今日的「今日记录」和饮食页的「饮食记录」是同一批记录，前者只读、后者可编辑；
   *  - 今日主卡已经把八项目标当分母写了一遍（85/87g 蛋白、1867/2000mg 钠）；
   *  - 「初步体重趋势 +0.14 kg/周」和体重图下面那段话说的是同一件事，图那边说得更全。
   * 功能一项没少，只是各自留在该在的那一页。
   */
  const dashboard = page('dashboard');
  const diet = page('diet');

  const mounted = dashboard.slice(dashboard.indexOf('export function renderDashboard'));
  assert.ok(!/entriesCard|'今日记录'/.test(mounted), '今日页又挂回了只读的记录卡');
  // 那张卡改叫「饮食记录」，默认只读，按「编辑」才给出改克数和删除
  assert.match(diet, /h\('h3', null, '饮食记录'\)/, '可编辑的那张记录卡不能一起没了');
  assert.match(diet, /editing \? '完成' : '编辑'/, '记录卡缺少编辑开关');

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
  // 热量计划被成人常用下限真正改写时仍要说明；单纯超过建议速率只在输入框旁提示。
  assert.ok(dashboard.includes('clampedByFloor'), '热量计划被下限改写后的说明不能丢');
  assert.ok(!dashboard.includes('rateWasClamped'), '速率提示不应常驻今日页');
});

test('份量面板正文独立滚动，记录按钮固定在不留假占位的底栏', () => {
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
  assert.match(sheet, /scrollArea = h\('div\.sheet-scroll'\)/, '弹层正文没有独立滚动区');
  assert.match(sheet, /footer = h\('div\.sheet-footer'/, '弹层没有独立底栏');
  assert.match(diet, /setSheetFooter\(action\)/, '记录按钮没有装进独立底栏');
  const actionCss = css.slice(css.lastIndexOf('.sheet-action {'), css.indexOf('.sheet-action .primary-btn'));
  assert.ok(!/position:\s*sticky/.test(actionCss), '记录按钮仍靠 sticky 假吸底，会继续留下原位空白');

  /*
   * 滚动穿透：弹层内部滚到头之后手指继续滑，会带着背后的页面跑，
   * 表现就是「点不中弹层里的东西」。两道都要有，缺一道 iOS 上都会漏。
   */
  assert.match(css, /\.sheet-scroll \{[\s\S]*?overscroll-behavior: contain/, '弹层正文没有拦住滚动链');
  assert.match(css, /body\.sheet-open \{[\s\S]*?position: fixed/, 'iOS 上只有 overflow:hidden 拦不住拖动');
  assert.match(sheet, /document\.body\.style\.top = `-\$\{lockedScrollY\}px`/, '钉住 body 时没有记住滚动位置');
  assert.match(sheet, /window\.scrollTo\(0, lockedScrollY\)/, '关掉弹层后没有滚回原处');
  // 背景点一下、Esc 都要能关
  assert.match(sheet, /sheet-backdrop', \{ onclick: \(\) => closeSheet\(\) \}/, '点背景关不掉弹层');
  assert.match(sheet, /ev\.key === 'Escape'/, 'Esc 关不掉弹层');
});

test('喝水只数次数，不记毫升，也不画完成条', () => {
  /*
   * 饮料、汤、粥、水果和饭菜里的水分同样被人体吸收，单算白水没法代表全天
   * 水分够不够。原先那根「125 / 1700 ml」的进度条会被读成「今天只完成了 7%」，
   * 而 metricState 里饮水本来就定义成 log ——「只是记录，没有达标一说」。
   * 现在只回答一个能诚实回答的问题：今天主动喝了几次水。
   */
  const card = read('js/views/cards/meal-advice.js');
  assert.match(card, /const waterTaps = \(\) =>/, '没有按次数计的饮水');
  assert.match(card, /waterCount: next/, '次数没有落到 waterCount 字段上');
  assert.ok(!/MAX_ONE_TIME_ML|waterMl: Math\.max/.test(card), '还留着按毫升记录的老路');
  // 误触之后总得有办法改回来
  /*
   * 撤销只在刚点完那几秒出现。它一天里最多用上一次（误触），
   * 常驻就是白占一个控件和四个字。
   */
  assert.match(card, /'撤销'/, '点错了没法退回去');
  assert.match(card, /UNDO_WINDOW_MS/, '撤销没有时间窗，等于常驻');
  assert.match(card, /const justLogged = Date\.now\(\) < undoUntil/, '撤销的显示条件没有跟着时间窗走');
  // 次数写在那条状态里，标题右边不能再挂一个同样的数
  assert.ok(!/card-tag[^\n]*已记录/.test(card), '同一个数在一张卡上写了两遍');
  assert.match(card, /Math\.min\(MAX_WATER_TAPS/, '次数没有上限，长按会一直加');

  // Apple 健康同步来的毫升不能丢：那是设备数据，仍留在数据页
  assert.match(read('js/core/health-card.js'), /key: 'waterMl'/, '数据页不该丢掉设备记录的饮水');

  // 说明里必须讲清楚这个数不代表全天水分
  assert.match(card, /饮料、汤、粥、水果和饭菜里的水分同样被人体吸收/, '没有说清这个数的口径');
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
  const metrics = strip(read('js/views/cards/health-metrics.js'));
  assert.match(metrics, /const DASH = '—'/, '没有占位符');
  assert.match(metrics, /cell\.value == null\) return DASH/, '缺值时没有退回占位符');
  assert.ok(!/\.filter\(\(c\) => c\.value != null\)\.map\(\(c\) => c\)/.test(metrics),
    '仍在把缺值的项过滤掉');
  // 一个数都没有时是「还没同步过」，不是一排杠
  assert.match(metrics, /info\.hasAny\s*\n?\s*\? h\('div\.metric-grid'/, '空状态判断没有走「有没有任何数据」');

  // 体脂和饮水例外：没有体脂秤 / 没同步过饮水的人，常年挂一道杠只是噪音
  const core = strip(read('js/core/health-card.js'));
  for (const key of ['bodyFatPct', 'waterMl']) {
    assert.ok(new RegExp(`key: '${key}'[^}]*optIn: true`).test(core), `${key} 应当只在记到过时占一格`);
  }
  assert.match(core, /!f\.optIn \|\| seen\.has\(f\.key\)/, '可选项没有按「历史上有没有记到过」筛');
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
  assert.match(charts, /h\('h3', null, '趋势'\)/);
  assert.ok(!/h\('h3', null, spec\.title\)/.test(charts), '标题仍在跟着下拉变');
  assert.match(charts, /h\('p\.trend-summary', null, spec\.tag\)/,
    '当前图的日均或达标摘要应靠近选择器，而不是挤在卡片标题右侧');
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

});

/*
 * 活动数据钉死今天；体重不要求每天称，显示截至今天最近一次并明确日期。
 * 体脂与静息心率仍只显示当天值，避免旧测量冒充今天。
 */
test('今日健康数据钉死今天，只有体重可使用最近记录', () => {
  const metrics = strip(read('js/views/cards/health-metrics.js'));
  assert.match(metrics, /const today = todayKey\(\);/, '这张卡还在跟着所选日期走');
  assert.ok(!/state\.day/.test(metrics), `不该再读 state.day：${metrics.match(/.*state\.day.*/)?.[0]}`);
  assert.match(metrics, /state\.healthByDate\?\.get\(today\)/, '取的不是今天那一行');
  assert.match(metrics, /latestHealthEntry\('weightKg', today\)/, '没有取截至今天最近一次体重');
  assert.match(metrics, /latestWeight,/, '最近体重没有交给健康卡状态层');

  // 格子保持简洁，测量日期收在右上角感叹号里。
  assert.ok(!/`体重 \$\{/.test(metrics), '又把沿用的日期标回格子里了');
  assert.match(metrics, /体重默认显示截至今天最近一次有效记录/, '说明层没有解释最近体重口径');
  assert.match(metrics, /function lastSeenLines\(/, '最近一次测量没有地方可查');
  assert.match(metrics, /infoTip\(/, '同步情况和最近一次测量要收在感叹号里');

  // 「已同步」说的是今天同步过没有，不是「有没有缺项」
  const core = strip(read('js/core/health-card.js'));
  assert.match(core, /localDay\(at\) === today/, '同步状态没有按「今天有没有同步」判定');
  assert.ok(!/synced[^\n]*missing\.length/.test(core), '又拿缺项去判定同步状态了');
  assert.match(core, /f\.key === 'weightKg' && todayValue == null && fallbackWeight != null/,
    '状态层没有只给体重使用最近记录');
  // 主界面上不再出现「同步＋补录」「手动录入」这类来源字样
  assert.ok(!/同步＋补录|手动录入/.test(metrics), '来源字样应收进说明层，不占卡面');
});

test('挑动作的两种入口都在，部位标签标出今天已练到的组', () => {
  /*
   * 人体图已删。它在真机上一整块胸大肌只有 19px 宽 —— 那个尺寸画不出
   * 能看清的解剖形状，而它占掉 248px 高，把动作列表整个顶到首屏之外；
   * 正下方那排文字标签做的是同一件选择，还说得更清楚。
   * 图唯一多给的信息是「今天哪儿练了、哪儿空着」，搬到标签上的小圆点里。
   */
  const training = read('js/views/training.js');
  const css = read('css/app.css');
  assert.ok(!training.includes('bodyMap'), '人体图应当已经删掉');
  assert.ok(!css.includes('.body-region'), '人体图的样式还留着');

  assert.match(training, /const covered = coveredGroupKeys\(picked\(\)\)/,
    '部位标签没有标出今天已练到的组');
  assert.match(training, /h\('span\.tab-dot'/, '缺少已练到的标记');
  assert.match(training, /`\$\{g\.label\}（今天已练到）`/, '标记没有给读屏软件的说法');
  assert.match(css, /\.tab-dot\s*\{/, '.tab-dot 没有样式');

  assert.match(training, /\['group', '身体部位'\].*\['split', '动作模式'\]/s,
    '两种选择入口应使用“身体部位 / 动作模式”');
  /*
   * 顶栏副标题不许写「数据截至 X」：健身页不跟今日 / 饮食页的日期走，
   * 那句话会让人以为翻回昨天，动作记录也跟着翻。
   */
  const app = strip(read('js/app.js'));
  assert.match(app, /return count \? `今日 \$\{count\} 个动作` : '今日未记录'/,
    '健身页副标题应显示今天真正记录了几个动作');
  assert.match(app, /return '今日未同步'/, '数据页副标题应明确今天是否同步');
  assert.ok(!/数据截至/.test(app), '不跟日期走的页面不该写「数据截至」');
  assert.match(css, /\.body-part-switch\s*\{[^}]*gap:\s*5px/s,
    '胸、肩臂、背、腿、腹之间应留出轻微间距');
});

test('摞在一起的分段控件留缝，动作范围按钮等宽分布', () => {
  /*
   * 三排分段控件各自 margin: 0，直接摞起来就是几条灰槽贴着边，看着像
   * 一整块被割开的色块。而器械档位原先借的是 .chart-switch —— 那套样式
   * 带着一条分隔线和 10px 上内边距（给趋势图下面留的），套进灰槽里
   * 就成了一行说不出理由的空白。趋势卡早就改用下拉，那套样式已无人使用。
   */
  const css = read('css/app.css');
  const polish = read('css/ux-polish.css');
  const training = read('js/views/training.js');
  assert.match(css, /\.range-switch \+ \.range-switch\s*\{[^}]*margin-top/s, '摞起来的分段控件之间没有缝');
  assert.ok(!css.includes('.chart-switch'), '.chart-switch 已无人使用，应当删掉');
  assert.ok(!/h\('div\.chart-switch/.test(training), '器械档位不该再借趋势卡那套样式');
  // 通用分段控件仍按内容分宽；选择动作的部位/模式范围是短标签，要等宽铺满。
  assert.match(css, /\.range-switch \.chip-btn\s*\{[\s\S]*?flex:\s*1 1 auto/,
    '分段控件按内容分宽，不能等宽');
  assert.match(polish, /\.picker-scope-switch\s*\{[\s\S]*?grid-template-columns:\s*repeat\(var\(--picker-cols\), minmax\(0, 1fr\)\)/,
    '动作范围按钮没有按实际选项数等宽铺满');
  assert.match(training, /style: \{ '--picker-cols': String\(GROUPS\.length\) \}/,
    '身体部位没有把实际列数交给样式');
  assert.match(training, /style: \{ '--picker-cols': String\(SPLITS\.length\) \}/,
    '动作模式没有把实际列数交给样式');
});

/*
 * 动作推荐要跟着控制它的那几个开关走，而且得认得已经选了什么 ——
 * 否则选完杠铃卧推，第一个推荐还是哑铃卧推，等于劝人把同一件事做两遍。
 */
test('动作推荐跟随部位 / 模式 / 器械，并避开已选动作', () => {
  const training = strip(read('js/views/training.js'));
  assert.match(training, /recommendFor\(\{[\s\S]*?mode: pickMode/, '推荐没跟着选择方式走');
  assert.match(training, /selection: picked\(\)/, '推荐没有把已选动作算进去');
  assert.match(training, /equip: equipFilter/, '推荐没跟着器械档位走');

  // 范围选择与动作内容合成一张卡，避免先看一张“挑动作”空壳再滑到下一张列表。
  const mounted = training.slice(training.indexOf('mount(root,'));
  const order = ['planCard()', 'pickerCard(rerender)',
    'adviceCard(rerender)', 'weeklyCard(rerender)'];
  const at = order.map((k) => mounted.indexOf(k));
  assert.ok(at.every((i) => i >= 0), `有卡片没挂上：${order.filter((_, i) => at[i] < 0).join('、')}`);
  assert.deepEqual([...at].sort((x, y) => x - y), at, `挂载顺序不对：${at.join(',')}`);
  assert.ok(!/recommendCard\(/.test(training), '推荐又单独占了一张卡');

  assert.ok(!/function scopeCard\(/.test(training), '范围选择又被拆成了独立卡片');
  assert.match(training, /section\.card\.exercise-picker-card/, '合并后的动作选择卡缺少稳定锚点');
  assert.match(training, /\['all', '全部动作'\], \['recommend', '推荐组合'\]/,
    '列表 / 推荐仍是语义含糊的单个开关');
  assert.match(training, /'aria-pressed': String\(active\)/, '两段式切换没有按下态');
  assert.match(training, /showRecommend\s*\n?\s*\? recommendBody\(rec\)/, '推荐和列表没有共用一张卡');

  const core = strip(read('js/core/training.js'));
  assert.match(core, /overlapLevel\(overlapScore\(e, c\)\) === 'high'/, '没有排除与已选高度重合的动作');
  // 理由是短标签，不是一段话
  assert.match(core, /export function exerciseTags/, '推荐理由没有压成短标签');
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
  // 隐私锁必须无视输入焦点：焦点在体重框里也得立刻把旧账号的数据从界面上撤掉
  assert.ok(/const locked = accountDataLocked\(account\)/.test(app), '账号回调里没有算出锁定态');
  assert.ok(app.includes('locked || !isEditing()'), '输入框聚焦时隐私锁仍可能保留旧设置 DOM');
  assert.ok(app.includes('renderCurrentSafely({ force: locked })'),
    '隐私锁触发时业务页面也必须强制重绘，不能因为焦点在输入框里就跳过');
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
  // 目标线画的是现在这套设置算出来的目标，历史那几天当时未必是这个数
  assert.ok(trends.includes("targetContext = '当前目标'"));
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
  assert.match(trends, /function lastEndedDay\(\)[\s\S]*?shiftDay\(todayKey\(\), -1\)/,
    '缺少「区间止于前一天」的实现');
  /*
   * 而且是**真正的昨天**，不跟今日 / 饮食页选的日期走：
   * 跟着翻的话，「近 7 日」在不同页面上会指不同的七天。
   */
  assert.ok(!/state\.day/.test(strip(read('js/views/cards/trend-charts.js'))),
    '趋势图仍在跟着所选日期走');
  assert.match(trends, /let d = lastEndedDay\(\);/, 'dateRange 仍从今天往回数');
  for (const gone of ['ended(', 'endedKcal', 'endedSleep', 'todayHasDiet', 'viewingToday']) {
    assert.ok(!trends.includes(gone), `还残留旧的当天过滤逻辑：${gone}`);
  }
  assert.match(trends, /const avgSleep = average\(sleepSeries, 1\)/);
  assert.match(trends, /const avgActive = average\(activeSeries\)/);
});

test('区间档位是 近 7 日 / 近 30 日 / 近 90 日 / 全部', () => {
  const trends = page('health');
  const labels = [...trends.matchAll(/label: '([^']+)', days:/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['近 7 日', '近 30 日', '近 90 日', '全部']);
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
  const bootstrapModule = html.indexOf('<script type="module" src="js/bootstrap.js"></script>');
  assert.ok(assignment >= 0 && assignment < bootstrapModule, '云配置必须在 bootstrap.js 启动前注入');
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

test('添加食物标题不展示总数，README 的库规模仍有测试盯着', () => {
  const diet = read('js/views/diet.js');
  assert.doesNotMatch(diet, /\$\{allFoods\(\)\.length\} 种/, '添加食物标题又塞回食物总数');
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

test('多选：单项可直接记，多项仍先放清单再一次落库', () => {
  /*
   * 两处原先都是「点一个 → 立刻落库 → 整页重绘」。健身页量得出来：
   * 连点三个动作，页面每次自己滚一段，同一行的 y 从 813 跳到 201 又跳到 897 ——
   * 列表在手指底下动，第二下十有八九点错。饮食那边一顿三菜一饭要 12 次操作，
   * 因为每记一样都要开一次份量弹层再关掉。
   */
  const diet = read('js/views/diet.js');
  const training = read('js/views/training.js');
  const bar = read('js/lib/select-bar.js');

  // 共用同一条多选条，别在两个视图里各搭一个
  for (const [name, src] of [['diet', diet], ['training', training]]) {
    assert.match(src, /import \{ selectBar \} from '\.\.\/lib\/select-bar\.js'/, `${name} 没用共用的多选条`);
  }
  assert.match(bar, /el\.hidden = empty && !alwaysVisible/,
    '共用多选条没有区分普通收起态与固定操作栏');
  assert.match(training, /alwaysVisible: true/, '健身页没有让选择栏在空状态也保持可见');
  assert.ok(!/alwaysVisible:\s*true/.test(diet), '饮食页空清单仍应收起，不能常驻一条空横幅');

  // 饮食：单项是高频路径，可确认份量后直接记；多项仍保留清单批量确认
  assert.match(diet, /function addToBasket\(\{ food, grams/, '饮食页没有待记录备选');
  assert.match(diet, /async function recordBasket\(\)/, '备选不能一次性记录');
  assert.match(diet, /async function recordOne\(/, '单项记录仍被迫先进入批量清单');
  assert.match(diet, /onConfirm: \(\) => \{ recordBasket\(\); \}/, '多选条的确认没有接到批量记录上');
  const addBasketBody = diet.slice(diet.indexOf('function addToBasket'), diet.indexOf('const removeFromBasket'));
  assert.ok(!/addEntry|openSheet/.test(addBasketBody), '加入备选时不该落库，也不该弹出份量面板');
  // 落库恰好两条路径：单项确认和批量确认，搜索结果本身不应落库
  const addEntryCalls = strip(diet).match(/addEntry\(/g) || [];
  assert.equal(addEntryCalls.length, 2, `饮食页有 ${addEntryCalls.length} 处落库，应当只有单项和批量两处`);

  // 健身：勾选只动 pending 和这一行的 DOM，不能碰 updateSession
  assert.match(training, /let pending = new Set\(\)/, '健身页没有待加入的一批');
  const rowBody = training.slice(training.indexOf('function exerciseRow'), training.indexOf('h(\'div.ex-main\''));
  // 注释里解释「为什么不能 rerender」的那句话不算，只看真正会跑的代码
  const rowCode = rowBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  assert.match(rowCode, /if \(pending\.has\(e\.id\)\) pending\.delete\(e\.id\); else pending\.add\(e\.id\);/,
    '勾选没有走 pending');
  assert.ok(!/\brerender\(\)/.test(rowCode.slice(rowCode.indexOf('pending.add'))),
    '勾选之后不该整页重绘 —— 列表会重排，下一个要点的动作就跑走了');
  assert.match(training, /async function commitPending\(\)/, '没有「一次加入计划」');
  assert.match(training, /pending = new Set\(\);\s*\n\s*await updateSession/, '提交时应当一次写库');
});

test('输入框有焦点时不许整页重绘，但事后要补上', () => {
  /*
   * 定时器、可见性、账号轮询这几条路一直都记得躲开输入框，唯独 store 订阅
   * 这条没有 —— 在饮食记录里改克数时，后台任何一次落库（五分钟一次的账号
   * 健康轮询、云端同步拉到新数据）都会把正在编辑的那个 input 连根换掉：
   * 焦点回到 body，iOS 收起键盘，敲了一半的数字也没了。
   */
  const app = read('js/app.js');
  assert.match(app, /function renderCurrentSafely\(\{ force = false \} = \{\}\)/, '缺少带输入保护的重绘入口');
  assert.match(app, /if \(!force && isEditing\(\)\) \{ renderPending = true; return; \}/,
    '重绘时没有躲开输入框，或者跳过之后没记下来');

  // store 订阅这条必须走带保护的那个入口
  const sub = app.slice(app.indexOf('subscribe(() => {'), app.indexOf('let healthAccountUserId'));
  assert.match(sub, /renderCurrentSafely\(\)/, 'store 订阅仍在直接 renderCurrent');
  assert.ok(!/\brenderCurrent\(\);/.test(sub), 'store 订阅里还留着不带保护的 renderCurrent()');

  // 跳过不能就这么算了：失焦之后要补一次，否则页面停在旧数据上
  assert.match(app, /document\.addEventListener\('focusout'/, '跳过重绘之后没有补回来的入口');
  assert.match(app, /if \(renderPending && !isEditing\(\)\) renderCurrentSafely\(\)/,
    '补重绘时没有再确认一次焦点 —— 在两个格子之间跳会把人从第二个框里踢出去');
});

test('重复提示在挑的时候就出，勾中还没提交的也算', () => {
  /*
   * 原先 clashWith 只比已经落库的那些：连勾杠铃卧推和哑铃卧推，两个都还没提交，
   * 一句提示都不出，等按下「加入计划」之后才在训练建议里读到「这俩刺激高度相似」——
   * 那时候人已经选完了，改起来要回头再走一遍。
   */
  const training = read('js/views/training.js');
  assert.match(training, /\[\.\.\.pickedExercises\(\), \.\.\.\[\.\.\.pending\]\.map/,
    '重复判定没有把勾中还没提交的算进来');

  // 已经选中的行不再提示：两行上各写一遍「和对方几乎一样」是同一件事说两遍
  assert.match(training, /if \(picked\(\)\.includes\(e\.id\) \|\| pending\.has\(e\.id\)\) return null;/,
    '已选中的行还在显示重复提示');

  // 勾一个会改变别的行「重不重」，整列都要跟一下；但只能改那一句，不能整页重绘
  assert.match(training, /for \(const other of row\.parentNode\?\.children \|\| \[\]\) other\.syncClash\?\.\(\)/,
    '勾选之后其它行的提示没有跟着更新');
  assert.match(training, /clashNode\.className = line \? `ex-clash-slot \$\{line\.cls\}` : 'ex-clash-slot'/,
    '整条 className 被覆盖会让空槽的隐藏样式失效，行里留一道空白');

  // 提示要短，而且不是红色 —— 选两个卧推变式是取舍不是错误
  assert.match(training, /和「\$\{clash\.other\.name\}」重复/, '提示文案太长，挑动作时是扫不是读');
  const css = read('css/app.css');
  assert.match(css, /\.ex-clash \{[^}]*color: var\(--warn\)/s, '重复提示不该用红色');
});

test('「已选动作」只记录选了什么，不在这里给建议', () => {
  /*
   * 这张卡原先还兼着报「覆盖部位」和「这套动作之间没有明显重复」，
   * 和下面那张「训练建议」说的是同一件事，在同一屏里说两遍。
   */
  const training = read('js/views/training.js');
  const card = training.slice(training.indexOf('function planCard()'), training.indexOf('function tipAction'));
  // 健身页固定记今天，标题就直说是今天，不再跟着日期变来变去
  assert.match(card, /dayLabel = '今日动作'/, '卡片标题没改成「今日动作」');
  assert.ok(!card.includes('覆盖部位'), '记录卡里还留着覆盖部位的分析');
  assert.ok(!card.includes('没有明显重复'), '记录卡里还留着重复度的结论');
  assert.ok(!/findOverlaps|coverage\(/.test(card), '记录卡还在调分析函数');
  // 但组数、重量和清空这些「记录」的部分要留着
  assert.match(card, /planRow\(e, i\)/, '动作行没了，就没法记组数');
  assert.match(card, /volume\.sets/, '组数统计没了');
});

test('说明层点外面就收起来，不必回去再点一次感叹号', () => {
  /*
   * <details> 原生只认 summary 上的点击：说明打开之后，用户以为随便点一下别处
   * 就能关掉，结果它一直挂在那儿。
   */
  const utils = read('js/lib/utils.js');
  assert.match(utils, /document\.addEventListener\('click'/, '没有装「点外面收起来」的监听');
  assert.match(utils, /closeOthers\(event\.target\.closest\?\.\('details\.info-tip'\) \|\| null\)/,
    '判断点在不在自己里面应当用 closest —— 点说明层内部（选字、点链接）不该关掉它');
  assert.match(utils, /if \(event\.key === 'Escape'\) closeOthers\(null\)/, 'Esc 应当也能收起来');

  /*
   * 监听器只装一次。每建一个 infoTip 就装一个的话，
   * 饮食记录里几十条记录就是几十个 document 级监听器。
   */
  assert.match(utils, /let infoTipDismissBound = false;/, '监听器没有做只装一次的保护');
  assert.match(utils, /if \(infoTipDismissBound\) return;\s*\n\s*infoTipDismissBound = true;/,
    '只装一次的保护写得不对');

  // 用 click 不用 pointerdown：pointerdown 早于原生的 summary 切换，点感叹号会闪一下
  // 注释里解释「为什么不用 pointerdown」的那句话不算，只看真正会跑的代码
  const bind = utils.slice(utils.indexOf('function bindInfoTipDismiss'), utils.indexOf('export function infoTip'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  assert.ok(!/pointerdown/.test(bind), 'pointerdown 早于原生切换，点感叹号本身会先关再开，闪一下');
});

test('饮食记录默认只读，按「编辑」才能改克数或删除', () => {
  /*
   * 每行右边原先都挂着一个可输入的克数框和一个红叉。这张卡大部分时候是
   * 拿来核对「今天吃了什么」的，滑动列表时很容易蹭到，而删掉一条没有撤销。
   */
  const diet = read('js/views/diet.js');
  assert.match(diet, /editEntries: false,/, '记录卡没有编辑态');
  assert.match(diet, /function entryRow\(e, editing\)/, '行没有按编辑态区分只读和可改');
  assert.match(diet, /editing \? h\('div\.entry-actions'/, '只读态仍然渲染了可编辑的操作区');
  assert.match(diet, /h\('div\.entry-actions\.readonly'/, '只读态应当仍看得到吃了多少');

  // 「和昨天一样 / 清空这一天」也是改数据，同样跟着编辑态走
  assert.match(diet, /editing \? copyRow\(\) : null/, '批量改数据的按钮没有跟着编辑态收起来');
  // 一条都没有时不该停在编辑态，否则下次进来看到一个没用的「完成」
  assert.match(diet, /ui\.editEntries = false;\s+\/\/ 一条都没有/, '空态没有退出编辑');

  // 搜索卡把「饮食记录」这个名字让出来了，两张卡不能重名
  assert.match(diet, /h\('h3', null, '添加食物'\)/, '搜索卡应当改名，否则两张卡都叫「饮食记录」');
});

/*
 * 碳水和脂肪合用一条，比例按热量算。
 *
 * 分开画两条区间时，两条可以同时「在范围内」而总量差出 796 kcal
 * （2660 kcal 的计划上是 30%）—— 各自说自己没问题，合起来对不上账；
 * 照计划吃的人还会读到「碳水低于建议 74g」。
 */
test('碳水脂肪合成一条，比例和克数都要在上面', () => {
  const dashboard = page('dashboard');
  const code = strip(dashboard);

  assert.match(code, /macroSplit\(targets, gaps\)/, '主卡没有算碳水脂肪的结构比例');
  assert.match(code, /splitBar\(/, '合用的那一条没有画出来');

  /*
   * 是刻度不是进度条：一段参考区间 + 一个当前位置的点。
   * 原先画的是「两段按比例分」加一根计划分界线 —— 那样看着像在说
   * 「分界线就是标准答案」，可结构本来就有二十个百分点的合理区间。
   */
  assert.match(code, /carbPct: split\.carbPct/, '当前比例没有画成指针');
  assert.match(code, /carbBandLo: split\.bandLo[\s\S]*carbBandHi: split\.bandHi/, '没有画出参考区间');
  assert.ok(!/markPct|planCarbPct/.test(code), '又退回「一个计划点」了');
  assert.match(code, /split-grams-plan.*split\.note/, '参考区间得有文字说明');

  // 比例说不出吃了多少，克数得一起给
  assert.match(code, /碳水 \$\{num\(split\.carbG\)\}g/, '缺少碳水克数');
  assert.match(code, /脂肪 \$\{num\(split\.fatG\)\}g/, '缺少脂肪克数');
  assert.match(code, /split\.carbPct\}% \/ \$\{split\.fatPct\}%/, '比例应使用与标题一致的斜杠');
  assert.match(code, /split-grams[\s\S]*碳水 \$\{num\(split\.carbG\)\}g[\s\S]*脂肪 \$\{num\(split\.fatG\)\}g/,
    '标题写碳水 / 脂肪，左右端点却没有按同一顺序');

  // 结构偏移只用中性色：橙和红留给真正的上限
  const barCss = read('css/app.css').slice(read('css/app.css').indexOf('.split-bar {'));
  const barBlock = barCss.slice(0, barCss.indexOf('.hero-rate-note'));
  assert.ok(!/--warn|--danger/.test(barBlock), '结构条用上了警告色');

  // 不能再各画各的：一旦回到两行，那 796 kcal 的自由度就又回来了
  assert.ok(!/metricRow\(by\.carb\)|metricRow\(by\.fat\)/.test(code),
    '碳水或脂肪又单独占了一行');
  assert.ok(!/BAR_KEYS[\s\S]{0,80}'carb'/.test(code), '碳水又回到了逐条画的名单里');

  const splitCode = read('js/lib/charts.js');
  assert.match(strip(splitCode), /export function splitBar/, 'splitBar 得住在 charts.js 里');
  assert.match(read('css/app.css'), /\.split-bar-band/, '参考区间没有样式');
  assert.match(read('css/app.css'), /\.split-bar-point/, '指针没有样式');
  assert.match(read('css/app.css'), /\.macro-bar \{ height: 6px/,
    '蛋白质进度条的粗细基准变了');
  assert.match(read('css/app.css'), /\.split-bar \{[\s\S]*?height: 6px/,
    '碳水 / 脂肪刻度没有和蛋白质条统一粗细');

  // 横轴从左到右也必须是碳水 → 脂肪；不能只交换端点文字。
  const splitCodePlain = strip(splitCode);
  assert.match(splitCodePlain, /band\.style\.left = `\$\{100 - hi\}%`/,
    '参考区间没有随横轴方向镜像');
  assert.match(splitCodePlain, /mark\.style\.left = `\$\{100 - pct\(carbPct\)\}%`/,
    '当前比例的圆点没有随横轴方向镜像');
});

/*
 * 主卡顶上那一段只说热量，速率的代价也归它 —— 那是「吃多少」的事。
 * 蛋白、钠这些归下面的「今日提示」，见 advisor 那边的用例。
 */
test('速率越过建议只在输入时即时提示，不常驻今日主卡', () => {
  const dashboard = strip(page('dashboard'));
  const profile = strip(read('js/views/cards/profile.js'));

  assert.ok(!dashboard.includes('rateWasClamped'), '速率提示又常驻到今日页了');
  assert.ok(!dashboard.includes('rateOverAdvisory'), '超过建议速率的提示又常驻到今日页了');
  assert.ok(!dashboard.includes('function rateNote('), '今日页又恢复了单独的速率警告块');
  assert.match(profile, /rateGuidance/, '速率输入框旁边没有即时判断');
  assert.match(profile, /syncRateHint/, '速率判断没有跟着输入即时更新');
});

/*
 * 建议上沿不拦人，但填的时候得看得见代价；离谱的量级才拦。
 */
test('填目标速率时给出即时判断，离谱的存不下去', () => {
  const profile = strip(read('js/views/cards/profile.js'));
  assert.match(profile, /rateGuidance/, '速率输入框旁边没有即时提示');
  assert.match(profile, /syncRateHint/, '提示没有跟着输入更新');
  assert.match(profile, /level === 'absurd'[\s\S]{0,200}return;/,
    '离谱的速率仍然能存下去');
  // 提示要靠改一个节点更新，不能重绘表单：重绘会把正在输入的框连根换掉
  const hint = profile.slice(profile.indexOf('const syncRateHint'), profile.indexOf('const rate = h('));
  assert.ok(!/rerender\(/.test(hint), '刷新提示时重绘了整张表单');
});

/*
 * 设置主页是一张分组列表，不再把五张表单一次全铺开。
 * 原先想改一个体重，要先滑过身体信息的十个输入框、账号表单、数据管理和一整段关于。
 */
test('设置主页只列五组，点进去才是表单', () => {
  const settings = strip(read('js/views/settings.js'));
  const keys = [...settings.matchAll(/\{ key: '(\w+)', label: '([^']+)' \}/g)].map((m) => m[2]);
  assert.deepEqual(keys, ['身体与目标', '账号与同步', '导入与备份', '计算与显示', '关于与反馈']);

  // 每行右边那句「现在设成什么了」：不点进去也知道
  assert.match(settings, /function sectionStatus\(/, '分组行没有当前状态');
  assert.match(settings, /`v\$\{APP_VERSION\}`/, '关于那一组没显示版本号');
  assert.match(settings, /function backBar\(/, '二级页面没有返回入口');
  assert.match(read('css/app.css'), /\.set-row \{/, '分组列表没有样式');

  /*
   * 账号冲突、待确认归属、锁定这几种必须整屏摆出来。
   * 它们说的是「你的数据现在有风险」，收进二级页面等于没提示。
   */
  const guard = settings.slice(settings.indexOf('const protectedAccountData'));
  assert.match(guard, /openSection = null;\s*\n\s*mount\(root, slot\);\s*\n\s*return;/,
    '出风险时没有强制回到整屏提示');
});

/*
 * 顶栏日期：标题和副标题不许说同一件事。
 * 原先大标题写「昨天」，下面又写「08-28 · 回今天」—— 日期印了两遍。
 */
test('顶栏日期只印一次，不跟日期走的页面也不写「数据截至」', () => {
  const app = strip(read('js/app.js'));
  assert.match(app, /dayHeading\(state\.day, todayKey\(\)\)/, '顶栏没有走统一的日期措辞');
  assert.ok(!/state\.day\.slice\(5\)/.test(app), '副标题又自己拼了一遍日期');
  assert.ok(!/数据截至/.test(app), '不跟日期走的页面不该写「数据截至」');

  // 只有今日和饮食两页跟着日期走
  const dated = [...app.matchAll(/key: '(\w+)',[^}]*dated: true/g)].map((m) => m[1]);
  assert.deepEqual(dated, ['today', 'diet']);
});

/*
 * 数据页、趋势和健身页都不跟今日 / 饮食页选的日期走。
 * 跟着翻的话，「今日健康数据」「近 7 日」这些说法在不同页面上会指不同的日子。
 */
test('数据页、趋势和健身页都不跟所选日期走', () => {
  for (const path of [
    'js/views/cards/health-metrics.js',
    'js/views/cards/weekly-summary.js',
    'js/views/cards/trend-charts.js',
    'js/views/training.js',
  ]) {
    assert.ok(!/state\.day/.test(strip(read(path))), `${path} 仍在读 state.day`);
  }
  // 近 7 日速览统计到昨天：今天还没过完，算进来会把日均拉低
  assert.match(strip(read('js/views/cards/weekly-summary.js')), /endDate: shiftDay\(todayKey\(\), -1\)/);
  assert.match(strip(read('js/views/training.js')), /const trainingDay = \(\) => todayKey\(\)/);
});

/*
 * 「回今天」后面那个返回箭头要画出来，不能打出来。
 * 打出来的 ↩ 在三个平台上是三种字形、三种基线，和旁边的中文对不齐，
 * 而且它跟着字号走，粗细没法和别的图标统一。
 */
test('返回箭头是描边图标，不是打出来的字符', () => {
  const app = strip(read('js/app.js'));
  assert.match(app, /const RETURN_ICON = '<svg/, '返回箭头没有做成图标');
  assert.match(app, /heading\.backToToday \? h\('span\.topbar-back-icon'/, '图标没有挂到顶栏上');
  // 文案里不许再夹着箭头字符
  assert.ok(!/回今天 ?[↩←⟲↺⬅]/.test(strip(read('js/core/day.js'))), '措辞里还夹着打出来的箭头');
  assert.ok(!/回今天 ?[↩←⟲↺⬅]/.test(app));
  // 和底栏、设置那几个图标同一套描边参数
  const css = read('css/app.css');
  assert.match(css, /\.topbar-back-icon svg \{[^}]*stroke: currentColor/s, '图标没有走描边样式');
});

/*
 * 设置面板每次落库、每次账号状态刷新都会整个重建（app.js 的 subscribe），
 * 而 <details open> 是 DOM 上的状态 —— 重建一次就全收起来了。
 * 表现就是「点一下同步，刚展开的那几节自己收了回去」，
 * 而同步恰恰是最会触发落库的那个操作。
 */
test('设置里展开的折叠块不会被一次落库收回去', () => {
  const dm = strip(read('js/views/cards/data-manager.js'));
  assert.match(dm, /const openSections = new Set\(\)/, '没有记住哪几节是展开的');
  assert.match(dm, /function rememberedDetails\(key, spec/, '缺少记得住状态的 details 包装');
  assert.match(dm, /open: openSections\.has\(key\)/, '重建时没有把展开状态还回去');
  assert.match(dm, /ontoggle:/, '展开状态没有被记下来');

  // 四大节和面板里的折叠块都要走这个包装，不能再裸写 details
  for (const key of ['import', 'manual', 'backup', 'guide', 'paste', 'source-priority']) {
    assert.ok(new RegExp(`'${key}'`).test(dm), `折叠块 ${key} 没有稳定的键`);
  }
  assert.ok(!/h\('details/.test(dm), `还有裸写的 details：${dm.match(/h\('details[^,]*/)?.[0]}`);

  /*
   * 键必须稳定，不能拿标题当键：「手动补录 · 2026-08-29」里带着日期，
   * 翻一天就换一个键，昨天展开的那一节今天又是收着的。
   */
  assert.ok(!/openSections\.(has|add)\(title\)/.test(dm), '拿标题当键了');
});

/*
 * 时长写成「6小时42分」，不写「6.7 小时」。
 * 小数小时是给图表纵轴用的——轴上要一排等距刻度；可一个具体的睡眠时长是人要读的数，
 * 「6.7 小时」得在脑子里把 0.7 乘回 60 才知道是多久。
 */
test('睡眠和锻炼写成小时加分钟，不写小数小时', () => {
  const core = strip(read('js/core/duration.js'));
  assert.match(core, /export function formatDuration/, '没有统一的时长写法');
  // Number(null) 是 0，只判 isFinite 会把「没记到」显示成「0分钟」
  assert.match(core, /mins == null \|\| mins === ''/, '没先剔掉空值就转数字');

  // 小数小时那个写法要彻底撤掉，别留一处漏网的
  for (const path of ['js/lib/utils.js', 'js/views/cards/health-metrics.js',
    'js/views/cards/trend-charts.js', 'js/core/advisor.js', 'js/core/trend-reading.js']) {
    assert.ok(!/formatHours/.test(strip(read(path))), `${path} 还在用小数小时`);
  }
  assert.match(strip(read('js/core/health-card.js')), /kind: 'duration'/, '睡眠没有走时长写法');
  assert.match(strip(read('js/views/cards/health-metrics.js')), /formatDuration\(cell\.value\)/);

  // 参考区间和门槛照原样写：那是文献给的数，不是量出来的时长
  const sleep = strip(read('js/core/trend-reading.js'));
  assert.match(sleep, /7~9 小时的常见建议/, '参考区间不该改写');
  assert.match(sleep, /不足 6\.5 小时/, '门槛不该改写');
  assert.match(sleep, /日均 \$\{hm\(s\.avg\)\}/, '日均没有改成小时加分钟');
});

/*
 * 安全区只能算一次。
 *
 * .tabbar 已经把底部安全区吃掉了；长在滚动容器里的东西（多选条）再加一次，
 * 真机上就是凭空多出 34px 空白顶在按钮下面 —— 卡片里空出一大块。
 * 只有真正盖住整个视口的 .sheet 才需要它。
 */
test('底部安全区只在盖住视口的那一层算，别处不许再加一遍', () => {
  const css = read('css/app.css');
  // 裸 env() 只许出现在 token 定义里：iOS 独立运行时首帧 env() 常常还是 0，
  // 布局要用的是 app.js 每次重排写回来的 --safe-*
  const raw = [...css.matchAll(/^[^\n{]*\{[^}]*env\(safe-area-inset/gm)]
    .map((m) => m[0].split('{')[0].trim())
    .filter((sel) => sel !== ':root');
  assert.deepEqual(raw, [], `这些规则绕过了 --safe-* 直接用 env()：${raw.join('、')}`);

  const bar = css.slice(css.indexOf('\n.select-bar {') + 1, css.indexOf('.select-bar[hidden]'));
  assert.ok(!/safe/.test(bar), '多选条又把底部安全区算了一遍');
  const dock = css.slice(css.indexOf('.actionbar-slot {'), css.indexOf('.tab {'));
  assert.ok(!/safe-bottom/.test(dock), '固定选择栏又把底部安全区算了一遍');
  // 弹层底栏接触屏幕底边，它需要；正文有底栏时不再重复计算。
  assert.match(css, /\.sheet-footer \{[\s\S]*?var\(--safe-bottom\)/);
  assert.match(css, /\.sheet\.has-footer \.sheet-scroll \{ padding-bottom: 12px; \}/);
  const action = css.slice(css.lastIndexOf('.sheet-action {'), css.indexOf('.sheet-action .primary-btn'));
  assert.ok(!/safe-bottom/.test(action), '操作按钮内部又重复算了一遍安全区');
});

test('健身选择栏常驻应用壳底部并紧邻底栏', () => {
  const css = read('css/app.css');
  const training = strip(read('js/views/training.js'));
  const app = strip(read('js/app.js'));
  const html = read('index.html');
  assert.match(html, /<main id="view"[\s\S]*?<div id="actionbar"[\s\S]*?<nav id="tabbar"/,
    '固定选择栏没有放在内容区与底部导航之间');
  assert.match(app, /clearEl\(actionSlot\);\s*actionSlot\.hidden = true;/,
    '切换栏目时没有清理旧的固定操作栏');
  assert.match(training, /document\.getElementById\('actionbar'\)/,
    '健身选择栏仍挂在动作卡内部');
  assert.match(training, /clearEl\(actionSlot\);\s*actionSlot\.hidden = true;/,
    '健身页内部重绘前没有清掉旧横幅，会越切筛选越多');
  assert.match(training, /actionSlot\.hidden = false;\s*mount\(actionSlot, pickerBar\.el\);/,
    '健身页没有把选择栏挂进固定槽位');
  assert.match(training, /alwaysVisible: true/, '没选动作时横幅仍会消失');
  const dock = css.slice(css.indexOf('.actionbar-slot {'), css.indexOf('.tab {'));
  assert.match(dock, /flex:\s*none/, '选择栏会被内容区挤压');
  assert.match(dock, /\.actionbar-slot \.select-bar\s*\{[\s\S]*?position:\s*static/,
    '选择栏仍在动作卡内做 sticky 定位');
  assert.match(dock, /margin:\s*0/, '固定栏仍带着卡片内负边距');
  assert.match(dock, /border-radius:\s*0/, '固定栏仍长得像卡片的一部分');
});

/*
 * 记账时经常先随手记下来，事后才发现该算在别的餐里。
 * 原先只能删掉重记一遍，而重记要重新搜、重新填克数。
 */
test('饮食记录编辑态能改餐次', () => {
  const diet = strip(read('js/views/diet.js'));
  assert.match(diet, /function mealSelect\(entry\)/, '编辑态没有改餐次的入口');
  assert.match(diet, /updateEntry\(entry\.id, \{ meal \}\)/, '改了餐次没有落库');
  /*
   * value 要在节点建好之后再设：给还没挂进 <select> 的 <option> 设 selected，
   * 浏览器会在插入时按 selectedIndex 重算，那一下就把选中项打回第一项。
   */
  assert.match(diet, /select\.value = entry\.meal;/, '选中项没有在建好之后再设一次');
  assert.ok(!/option', \{ value: m\.key, selected:/.test(diet), '又回到给 option 设 selected 了');
});

/*
 * 误删是高频且代价明确的操作：不能只靠确认框，也不能用重新 add 的方式伪装撤销，
 * 否则原日期、营养快照和复合配料都会变。
 */
test('饮食与训练的轻量删除都能原样撤销', () => {
  const utils = strip(read('js/lib/utils.js'));
  const store = strip(read('js/lib/store.js'));
  const diet = strip(read('js/views/diet.js'));
  const training = strip(read('js/views/training.js'));
  const css = read('css/app.css');

  assert.match(utils, /export function toast\(message, kind = 'info', action = null\)/,
    '提示条没有可选操作入口');
  assert.match(utils, /button\.toast-action[\s\S]*?await action\.onClick\(\)/,
    '提示条的撤销按钮没有真正执行回调');
  assert.match(css, /\.toast\.with-action[\s\S]*?pointer-events: auto/,
    '带操作的提示条仍不可点击');

  assert.match(store, /export async function restoreEntry\(entry\)/, '没有原样恢复饮食记录的方法');
  assert.match(store, /db\.put\(db\.STORES\.diet, restored\)/,
    '撤销饮食删除必须保留原 id 与完整快照，不能重新生成记录');
  assert.match(diet, /removeEntry\(e\.id\)[\s\S]*?label: '撤销'[\s\S]*?restoreEntry\(e\)/,
    '删除饮食记录后没有接上原样撤销');

  assert.match(training, /function removeExerciseWithUndo\(exercise\)/,
    '训练动作移除没有统一撤销路径');
  assert.match(training, /已删除这一组[\s\S]*?label: '撤销'/,
    '删除训练组后没有撤销入口');
  assert.match(training, /已清空今日动作[\s\S]*?label: '撤销'/,
    '清空今日动作后没有撤销入口');
});

/*
 * 搜索结果整行就是一个入口；右侧再放一个 ＋ 做同一件事，会让人猜两者的区别。
 */
test('搜索结果整行开份量面板，份量确认后可直接记录或继续添加', () => {
  const diet = strip(read('js/views/diet.js'));
  const row = diet.slice(diet.indexOf("h('button.search-item'"), diet.indexOf('all.length > results.length'));
  assert.match(row, /onclick: \(\) => selectFood\(f\)/, '整行没有打开份量面板');
  assert.ok(!diet.includes('button.search-item-add'), '右侧还留着与整行重复的 ＋ 入口');
  assert.match(row, /button\.search-item-remove[\s\S]*?removeFromBasket\(f\.id\)/,
    '已在本餐清单里的项要有明确的移出入口');

  assert.match(diet, /`记录到\$\{MEAL_LABEL\[guessMeal\(\)\]\}`/,
    '主按钮没有直接说清记录到哪一餐');
  assert.match(diet, /'继续添加'/, '缺少进入多项清单的次要入口');
  assert.match(diet, /recordOne\(directBtn, item\(\)\)/, '普通与复合食物没有接到单项记录路径');
  assert.match(diet, /actionLabel: \(\) => `记录\$\{ui\.basket\.length\}样到/,
    '批量确认仍使用含糊的符号，没有写清动作结果');
});
