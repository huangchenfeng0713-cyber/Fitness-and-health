/**
 * 浏览器冒烟测试：起得来、四个栏目都能开、IndexedDB 能写能读、Service Worker 能接管。
 *
 * 为什么单独做这一层：单元测试全绿的情况下，浏览器集成层还是连着出过问题——
 * 启动失败吞掉自救按钮、身体信息不合格白屏、推荐份量漏出浮点数，
 * 三个都不是计算函数的错，node --test 一个都拦不住。
 *
 * 不进 npm test：那一套必须保持零依赖。这个脚本只在 CI 里跑，
 * playwright 用 --no-save 装，不写进 package.json。
 *
 *   node scripts/smoke.mjs [http://127.0.0.1:8137]
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8137';

/*
 * CI 里用 `npm i --no-save playwright` 装到 ./node_modules，import 'playwright' 就能解析；
 * 本地想用系统全局那份时，把路径放进 PLAYWRIGHT_PATH 即可（ESM 不认 NODE_PATH）。
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
/*
 * 只把「未捕获的 JS 异常」算失败。
 * 资源加载失败（net::ERR_*）是网络层的事：CI 机器连不连得上云端 CDN
 * 不该决定这次提交能不能合，否则冒烟测试会变成随机红叉、很快没人看。
 */
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const text = m.text();
  if (m.type() !== 'error') return;
  if (/Failed to load resource|net::ERR_|favicon/.test(text)) return;
  errors.push(`console: ${text}`);
});

try {
  // ---- 起得来 ----
  // 账号 SDK / 云同步属于可选网络请求，不能拿“全网静默”当应用启动条件。
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.tab', { timeout: 15000 });
  /*
   * 等启动闸门放行再往下走。
   *
   * 这一条不是等待技巧，是修一个真的漏检：闸门抬着的时候 #view 里是
   * 「正在确认账号与本机记录」那张卡 —— 它不空、也没有脏值，
   * 于是下面四个栏目检查全都对着同一张启动卡打了勾，而真正的页面一个都没测。
   * 后面那条动作选择的检查因此才炸出来（找不到 .exercise-picker-card）。
   */
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'), null, { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  check('启动闸门放行后才是真页面',
    !(await page.evaluate(() => !!document.querySelector('.account-data-lock'))),
    '30 秒后仍停在「正在确认账号与本机记录」');
  const tabs = await page.$$eval('.tab', (t) => t.map((x) => x.textContent.trim()));
  // 集成测试使用明确的合成成人档案；初始空档案不能生成默认人的计划。
  await page.evaluate(async () => {
    const { saveProfile } = await import('./js/lib/store.js');
    await saveProfile({ sex: 'male', birthday: '1996-06-15', ageEstimated: false, heightCm: 175,
      weightKg: 70, activity: 'light', goal: 'maintain', onboarded: true, demoMode: false });
  });
  check('启动并渲染底部栏目', tabs.length === 4, tabs.join(' / '));

  /*
   * **刚起来就落库，屏幕要立刻跟上。**
   *
   * 重绘订阅原先排在 `await cloudInitialization` 后面：云端握手没回来之前，
   * 谁都不会因为落库而重绘。实测网络不通时那一段是 8.2 秒 —— 应用已经画出来、
   * 点得动，可记一笔饮食主卡不动、点推荐里的 ＋「今日动作」不出现、
   * 喝一次水次数不加一。数据其实都写进去了，等 60 秒的定时器或者切一次页
   * 才补上，读出来就是「点了没反应，过一会儿又自己出现了」。
   *
   * 这一条必须**趁早**跑：跑晚了握手已经回来，订阅挂上了，就测不到那个窗口。
   * 直接写库（不点界面），量的才是「订阅有没有挂上」这一件事。
   */
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('健身'))?.click());
  await page.waitForTimeout(300);
  const liveUpdate = await page.evaluate(async (b) => {
    const store = await import(`${b}/js/lib/store.js`);
    const before = document.querySelectorAll('.plan-list .plan-row').length;
    await store.saveTraining(store.state.day, {
      items: [{ id: 'bench_press_bb', sets: [], done: false }],
    });
    await new Promise((r) => setTimeout(r, 400));
    const after = document.querySelectorAll('.plan-list .plan-row').length;
    await store.saveTraining(store.state.day, { items: [] });
    await new Promise((r) => setTimeout(r, 300));
    return { before, after };
  }, BASE);
  check('刚起来就落库，屏幕立刻跟上（重绘订阅没有排在等云端后面）',
    liveUpdate.before === 0 && liveUpdate.after === 1, JSON.stringify(liveUpdate));

  // ---- 四个栏目都能开，且没有脏值 ----
  for (let i = 0; i < tabs.length; i += 1) {
    await page.evaluate((n) => document.querySelectorAll('.tab')[n]?.click(), i);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const text = document.querySelector('#view')?.innerText || '';
      return {
        empty: text.trim().length < 20,
        dirty: ['undefined', 'NaN', '[object', 'Infinity'].filter((s) => text.includes(s)),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        // 启动闸门那张卡不空也没有脏值，不排掉的话这个检查等于没做
        gated: !!document.querySelector('.account-data-lock'),
      };
    });
    check(`栏目「${tabs[i]}」`, !r.empty && !r.dirty.length && !r.overflow && !r.gated,
      [r.empty && '内容为空', r.dirty.length && `脏值 ${r.dirty}`, r.overflow && '横向溢出',
        r.gated && '看到的是启动闸门，不是这个栏目'].filter(Boolean).join('，'));
  }

  // ---- 全部动作与推荐组合共用标签；推荐说明不会被一次无关重绘收起 ----
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('健身'))?.click());
  await page.waitForTimeout(400);
  // 结构 B 将挑选器移入共享弹层；完整推荐生命周期在 training-design-smoke。
  await page.locator('.training-add').click();
  await page.waitForTimeout(750);
  await page.locator('.picker-view-switch .chip-btn').filter({ hasText: '推荐' }).click();
  const tags = await page.locator('.rec-picks .exercise-meta').evaluateAll(rows => rows.map(row => row.children.length));
  await page.getByLabel('这几个是怎么挑的', { exact: true }).click();
  await page.evaluate(async () => (await import('./js/views/training.js')).renderTraining(document.querySelector('#view')));
  check('推荐使用模式、细分主练、动作类型三项共用标签，主页面重绘不关闭推荐说明', tags.length > 0 && tags.every(n => n === 3)
    && await page.locator('.picker-card-head .info-tip').evaluate(el => el.open));
  await page.locator('.picker-view-switch .chip-btn').filter({ hasText: '列表' }).click();

  // 搜索框复用食物搜索的尺寸，但只替换动作结果区，不能把整张卡和键盘一起重建。
  await page.fill('.exercise-search-input', 'yingla');
  await page.waitForTimeout(150);
  const exerciseSearch = await page.evaluate(() => ({
    inputFocused: document.activeElement?.classList.contains('exercise-search-input'),
    resultText: document.querySelector('.exercise-search-results')?.innerText || '',
    resultCount: document.querySelectorAll('.exercise-search-results .exercise-choice-row').length,
    controlsHidden: document.querySelector('.picker-controls')?.hidden === true,
  }));
  check('动作搜索支持拼音且不丢失输入焦点',
    exerciseSearch.inputFocused && exerciseSearch.resultCount > 0
      && exerciseSearch.resultText.includes('硬拉')
      && exerciseSearch.controlsHidden,
    JSON.stringify(exerciseSearch));

  /*
   * 搜索框本身必须一路活着。
   *
   * 这里量的是节点身份，不是文字：搜索词存在模块变量里，整卡重绘之后
   * 文字照样会被填回来，看起来没事 —— 可输入框已经是另一个节点，
   * 焦点掉回 body，iOS 上就是键盘当场收起、拼音没了。
   *
   * 两种「变空」都要过：用户自己退格清空，以及中文键盘上拼音没上屏就失焦时
   * iOS 补来的那个空值 input 事件（后者不是清空，搜索词和结果都该留着）。
   */
  const searchAlive = await page.evaluate(() => {
    const el = document.querySelector('.exercise-search-input');
    el.focus();
    const first = el;
    const fire = (v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    fire('h');
    const rowsWhileSearching = document.querySelectorAll('.exercise-search-results .ex-row').length;
    // iOS 丢拼音：先失焦，再补一个空值事件
    el.blur();
    fire('');
    const kept = {
      value: document.querySelector('.exercise-search-input')?.value,
      rows: document.querySelectorAll('.exercise-search-results .ex-row').length,
    };
    // 用户自己退格清空：焦点在框里，这一下才算数
    el.focus();
    fire('');
    const after = document.querySelector('.exercise-search-input');
    return {
      rowsWhileSearching,
      keptQuery: kept.value === 'h' && kept.rows === rowsWhileSearching,
      sameNode: first === after,
      stillFocused: document.activeElement === after,
      backToList: document.querySelector('.exercise-search-results')?.hidden === true
        && document.querySelectorAll('.picker-normal-results .ex-row').length > 0,
    };
  });
  const searchProblems = [
    !searchAlive.rowsWhileSearching && '搜索没有出结果，后面几条量不准',
    !searchAlive.keptQuery && '拼音被 iOS 丢掉时搜索词和结果跟着没了',
    !searchAlive.sameNode && '清空搜索词把整张卡重绘了，输入框已是另一个节点',
    !searchAlive.stillFocused && '清空搜索词后焦点掉出输入框，iOS 上键盘会收起',
    !searchAlive.backToList && '清空后没回到普通列表',
  ].filter(Boolean);
  check('搜索框在清空和失焦时都不被重建', searchProblems.length === 0,
    searchProblems.join('；') || JSON.stringify(searchAlive));
  await page.waitForTimeout(100);

  await page.evaluate(async () => (await import('./js/lib/sheet.js')).closeSheet({ force: true }));
  await page.waitForTimeout(300);

  // ---- 饮食页标题、饮水色和推荐预算在手机宽度下保持同一套对齐规则 ----
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('饮食'))?.click());
  await page.waitForTimeout(500);
  const dietLayout = await page.evaluate(() => {
    const head = document.querySelector('.search-card-head');
    const title = head?.querySelector('h3');
    const custom = head?.querySelector('.text-btn');
    const center = (el) => {
      const rect = el?.getBoundingClientRect();
      return rect ? rect.top + rect.height / 2 : null;
    };
    const water = document.querySelector('.water-plus');
    const probe = document.createElement('span');
    probe.style.color = 'var(--text)';
    document.body.append(probe);
    const accentColor = getComputedStyle(probe).color;
    probe.remove();
    const budget = document.querySelector('.recommend-budget');
    const budgetCells = [...(budget?.children || [])];
    return {
      hasFoodCount: /\d+\s*种/.test(head?.textContent || ''),
      headCenterGap: title && custom ? Math.abs(center(title) - center(custom)) : null,
      waterColor: water ? getComputedStyle(water).color : null,
      accentColor,
      budgetCells: budgetCells.length,
      budgetWrapped: budgetCells.some((cell) => cell.scrollWidth > cell.clientWidth + 1
        || cell.getClientRects().length > 1),
      hasCategoryBrowser: !!document.querySelector('.category-browser'),
      hasFoodHistory: !!document.querySelector('.fav-row, .fav-chips, .history-chip'),
    };
  });
  const dietProblems = [
    dietLayout.hasFoodCount && '“添加食物”标题仍显示食物总数',
    dietLayout.headCenterGap == null && '找不到添加食物标题或自定义按钮',
    dietLayout.headCenterGap > 2 && `标题与按钮垂直错开 ${dietLayout.headCenterGap.toFixed(1)}px`,
    dietLayout.waterColor !== dietLayout.accentColor
      && `饮水色 ${dietLayout.waterColor} 没有使用正文深灰色 ${dietLayout.accentColor}`,
    dietLayout.budgetCells !== 3 && `推荐预算应为三栏，实际 ${dietLayout.budgetCells} 栏`,
    dietLayout.budgetWrapped && '推荐预算文字在手机宽度下折行或溢出',
    dietLayout.hasCategoryBrowser && '搜索框下面仍在显示分类标签',
    dietLayout.hasFoodHistory && '添加食物仍在显示历史记录',
  ].filter(Boolean);
  check('饮食页标题、饮水与推荐预算对齐', dietProblems.length === 0, dietProblems.join('；'));

  /*
   * 健康数据的格子排布。
   *
   * 有几项完全看当天同步上来了什么，1~8 项都可能。列数算错的话末行会只剩一个，
   * 孤零零吊在中间。而且这里用的是 CSS 自定义属性——h() 早先用
   * Object.assign(el.style, ...) 写它，不报错也不生效，排版看着"没变"而已，
   * 单元测试一个都拦不住。
   */
  const FIELDS = {
    steps: 8432, activeEnergy: 312, exerciseMinutes: 25, sleepMinutes: 402,
    restingHR: 58, weightKg: 62.4, bodyFatPct: 18.1, waterMl: 1250,
  };
  const badLayouts = [];
  for (let n = 1; n <= 8; n += 1) {
    await page.evaluate(async (keep) => {
      const { saveHealthDay } = await import('./js/lib/store.js');
      const day = new Date().toLocaleDateString('sv-SE');
      const blank = Object.fromEntries(Object.keys(keep.all).map((k) => [k, null]));
      await saveHealthDay(day, { ...blank, source: 'manual' });
      await saveHealthDay(day, { ...keep.patch, source: 'manual' });
    }, { all: FIELDS, patch: Object.fromEntries(Object.entries(FIELDS).slice(0, n)) });
    await page.evaluate(() => [...document.querySelectorAll('.tab')]
      .find((x) => x.textContent.includes('数据'))?.click());
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const grid = document.querySelector('.metric-grid');
      if (!grid) return null;
      const cells = [...grid.querySelectorAll('.metric-cell')];
      const tops = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top)))];
      const boxes = tops.map((t) => cells
        .filter((c) => Math.round(c.getBoundingClientRect().top) === t)
        .map((c) => c.getBoundingClientRect()));
      /*
       * 末行整组居中，且格子宽度、行内间距和上一行完全一样。
       * 拉宽占满（flex-grow: 1）会让宽度对不上；靠左会让两端的余量一边 0 一边一整格。
       */
      const gridBox = grid.getBoundingClientRect();
      const width0 = boxes[0][0].width;
      const gapOf = (row) => (row.length > 1 ? +(row[1].left - row[0].left - row[0].width).toFixed(1) : null);
      const gap0 = gapOf(boxes[0]);
      const badWidth = boxes.flat().some((b) => Math.abs(b.width - width0) > 0.6);
      const badGap = boxes.slice(1).some((row) => gapOf(row) != null && Math.abs(gapOf(row) - gap0) > 0.6);
      // 两端余量相等 = 这一组落在行的正中
      const offCenter = boxes.some((row) => {
        const left = row[0].left - gridBox.left;
        const right = gridBox.right - row[row.length - 1].right;
        return Math.abs(left - right) > 1.2;
      });
      return { rows: boxes.map((b) => b.length), badWidth, badGap, offCenter,
        cut: cells.some((c) => c.scrollWidth > c.clientWidth + 1) };
    });
    /*
     * badWidth / badGap 以前算出来就扔了，只断言 cut 和 offCenter ——
     * 而「每格同宽」正是「末行整组居中」的前提，漏掉它就等于这条检查只测了一半。
     * 实测代价：`--metric-cols` 变成死代码之后，格子改成按内容分宽，8 项在 393px 上
     * 挤不下四格、自己折成 3+3+2，两端余量照样相等，于是这条检查一路是绿的。
     */
    if (!r) badLayouts.push(`${n} 项没渲染出格子`);
    else if (r.cut) badLayouts.push(`${n} 项有格子被撑破`);
    else if (r.badWidth) badLayouts.push(`${n} 项排成 ${r.rows.join('+')}，格子不同宽`);
    else if (r.badGap) badLayouts.push(`${n} 项排成 ${r.rows.join('+')}，行内间距对不上`);
    else if (r.offCenter) badLayouts.push(`${n} 项排成 ${r.rows.join('+')}，有一行没落在正中`);
    // 末行至少两格：7 项要排成 4+3，不许出现 3+3+1 那种吊着一个的末行
    else if (r.rows.length > 1 && r.rows.at(-1) < 2) badLayouts.push(`${n} 项排成 ${r.rows.join('+')}，末行只剩一格`);
  }
  check('健康数据 1~8 项都排得平整，末行整组居中', badLayouts.length === 0, badLayouts.join('；'));
  /*
   * 颜色语义：红色只留给真上限。
   *
   * 单元测试能验 core/metrics.js 算出的 level，但拦不住有人在视图里把 level
   * 接错了线——比如又给热量条加上 overIsBad。这里直接量渲染出来的颜色。
   */
  await page.evaluate(async () => {
    const { addEntry, saveProfile } = await import('./js/lib/store.js');
    // 增重计划下确实吃超：这正是原先会整圈变红的情形，必须真的越过目标才测得到
    await saveProfile({ goal: 'bulk', rateKgPerWeek: 0.3, onboarded: true, demoMode: false });
    await addEntry({ foodId: 'rice_white', grams: 1800 });
    await addEntry({ foodId: 'oil', grams: 160 });
  });
  await page.evaluate(() => document.querySelectorAll('.tab')[0]?.click());
  await page.waitForTimeout(600);
  const semantics = await page.evaluate(async () => {
    const { state } = await import('./js/lib/store.js');
    const rows = [...document.querySelectorAll('.metric-row')].map((r) => ({
      label: r.querySelector('.metric-row-label')?.textContent || '',
      note: r.querySelector('.metric-row-note')?.textContent || '',
      level: /\b(met|near|over|plain)\b/.exec(r.className)?.[1] || '?',
    }));
    const chips = [...document.querySelectorAll('.micro-chip')].map((c) => ({
      label: c.querySelector('.micro-label')?.textContent || '',
      level: /\b(met|near|over|plain)\b/.exec(c.className)?.[1] || 'plain',
    }));
    const chipText = [...document.querySelectorAll('.micro-chip')]
      .map((c) => c.innerText.replace(/\n/g, ' ')).join('｜');
    const ring = document.querySelector('.ring circle:nth-of-type(2)');
    const foot = document.querySelector('.hero-ring-note')?.textContent || '';
    /*
     * 碳水和脂肪合用的那一条：整条永远是满的，有意义的是分界线在哪。
     * 段宽是 JS 写进 style 的百分比，写错了不会报错，只会画出半条 —— 得量。
     */
    const splitEl = document.querySelector('.split-row');
    const noteEl = splitEl?.querySelector('.metric-row-note');
    const barEl = splitEl?.querySelector('.split-bar');
    const bandEl = splitEl?.querySelector('.split-bar-band');
    const pointEl = splitEl?.querySelector('.split-bar-point');
    const barBox = barEl?.getBoundingClientRect();
    const trigger = splitEl?.querySelector('.point-value-trigger');
    const numbersHidden = !/\d/.test(splitEl?.textContent || '');
    trigger?.click();
    const ratioText = document.querySelector('.point-value-tip')?.textContent || '';
    const ratio = /碳水 (\d+)% \/ 脂肪 (\d+)%/.exec(ratioText);
    trigger?.click();
    const proteinRow = [...document.querySelectorAll('.metric-row')]
      .find((row) => row.querySelector('.metric-row-label')?.textContent === '蛋白质');
    const proteinBar = proteinRow?.querySelector('.macro-bar');
    const split = splitEl ? {
      barWidth: barBox?.width || 0,
      barHeight: barBox?.height || 0,
      proteinBarHeight: proteinBar?.getBoundingClientRect().height || 0,
      bandWidth: bandEl?.getBoundingClientRect().width || 0,
      bandLeftPct: Number.parseFloat(bandEl?.style.left || ''),
      bandWidthPct: Number.parseFloat(bandEl?.style.width || ''),
      hasPoint: !!pointEl,
      pointLeftPct: Number.parseFloat(pointEl?.style.left || ''),
      carbPct: ratio ? Number(ratio[1]) : null,
      fatPct: ratio ? Number(ratio[2]) : null,
      ratioText,
      numbersHidden,
      // 指针必须落在条子里：left 是百分比，写错了会跑到卡片外面
      pointInside: pointEl && barBox
        ? pointEl.getBoundingClientRect().left >= barBox.left - 8
          && pointEl.getBoundingClientRect().right <= barBox.right + 8
        : false,
      text: splitEl.innerText.replace(/\n/g, ' '),
      // 这一行的说明比别的长，nowrap + ellipsis 很容易把它截掉
      noteClipped: noteEl ? noteEl.scrollWidth > noteEl.clientWidth + 1 : false,
    } : null;
    return {
      rows, chips, chipText, foot, split,
      abovePlan: state.derived.intake.kcal > state.derived.targets.kcal,
      heroText: document.querySelector('.hero')?.innerText.replace(/\n/g, ' ') || '',
      splitCount: document.querySelectorAll('.split-row').length,
      ringStroke: ring ? getComputedStyle(ring).stroke : null,
    };
  });
  const { split } = semantics;
  const all = [...semantics.rows, ...semantics.chips];
  const wrongRed = all.filter((r) => r.level === 'over'
    && !['钠', '游离糖'].some((k) => r.label.includes(k)));
  const problems = [
    semantics.splitCount !== 1 && `碳水脂肪该合用一条，实际 ${semantics.splitCount} 条`,
    /*
     * 分开画两条区间时，两条可以同时「在范围内」而总量差出 796 kcal。
     * 它们分的是同一块热量，只能有一条。
     */
    semantics.rows.some((r) => r.label === '碳水' || r.label === '脂肪')
      && '碳水或脂肪又单独占了一行',
    /*
     * 它是一根刻度：一段参考区间 + 一个当前位置的点。
     * 区间宽度是 JS 写进 style 的百分比，写错了不会报错，只会画出空条子。
     */
    split && !(split.bandWidth > 8) && `参考区间没画出来：${split.bandWidth.toFixed(0)}px`,
    split && split.bandWidth >= split.barWidth - 2 && '参考区间铺满了整条，等于什么都没说',
    split && !split.hasPoint && '条上没有当前比例的指针',
    split && !split.pointInside && '指针跑到条子外面去了',
    split && Math.abs(split.barHeight - split.proteinBarHeight) > 0.5
      && `蛋白条与结构条粗细不一致：${split.proteinBarHeight}px / ${split.barHeight}px`,
    split && (split.carbPct == null || split.fatPct == null)
      && `点击后没有显示比例：${split.ratioText}`,
    split && split.carbPct + split.fatPct !== 100
      && `碳水 / 脂肪比例没有合计 100%：${split.ratioText}`,
    split && !split.numbersHidden && '碳水脂肪精确值仍然常驻',
    split && Math.abs(split.pointLeftPct - (100 - split.carbPct)) > 0.5
      && `圆点方向没有镜像：碳水 ${split.carbPct}%，位置却是 ${split.pointLeftPct}%`,
    split && (!(split.bandLeftPct >= 0) || !(split.bandWidthPct > 0)
      || split.bandLeftPct + split.bandWidthPct > 100.5)
      && `参考区间坐标无效：${split.bandLeftPct}% + ${split.bandWidthPct}%`,
    split && split.noteClipped && `结构说明被截断了：${split.text}`,
    // 三种营养同排，实际值按需查看，饮水仍保留在饮食页。
    semantics.chips.length !== 3 && `应有三种营养，实际 ${semantics.chips.length}`,
    /饮水|\//.test(semantics.chipText) && `今日营养仍有饮水或目标分母：${semantics.chipText}`,
    /\d/.test(semantics.chipText) && `微量营养精确值仍然常驻：${semantics.chipText}`,
    wrongRed.length && `只有真上限能变红，实际还有 ${wrongRed.map((r) => r.label)}`,
    /* 得真的吃超了这一条才测得到，否则检查形同虚设 */
    !semantics.abovePlan && `测试摄入未超过计划`,
    /* 增重计划下吃超时圆环不能是红的 */
    /rgb\(2[0-9]{2},\s*6[0-9],/.test(semantics.ringStroke || '') && `热量圆环画成了红色 ${semantics.ringStroke}`,
  ].filter(Boolean);
  check('指标颜色语义：红色只给真上限', problems.length === 0, problems.join('；'));

  /*
   * 主卡上「标签 → 它下面那条刻度」的距离只许有一档。
   *
   * 蛋白条是裸的，碳水:脂肪和三个方框的条包在 `.point-value-trigger` 里。那个按钮
   * 原先写着 `min-height: var(--control-md)` 加 `margin: -8px 0`，而 `<button>` 会把
   * 内容垂直居中 —— 6px 的条被顶到 44px 盒子的正中，实测离标签 15~16px，
   * 而蛋白条只有 4px。同一种关系在同一张卡里三个距离，量渲染结果才拦得住。
   * 热区现在靠 `::after` 撑，所以还要验一件事：条上方十几像素那种**什么都没画**的
   * 位置仍然点得中，否则就是把热区一起改没了。
   */
  const spacing = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const rows = [];
    const add = (name, label, bar) => {
      if (!label || !bar) return;
      const btn = bar.closest('button.point-value-trigger');
      rows.push({ name, gap: Math.round((r(bar).top - r(label).bottom) * 10) / 10,
        hit: btn ? Math.round(parseFloat(getComputedStyle(btn, '::after').height) || 0) : null });
    };
    const protein = document.querySelector('.metric-row:not(.split-row)');
    if (protein) add('蛋白质', protein.querySelector('.metric-row-top'), protein.querySelector('.macro-bar'));
    const split = document.querySelector('.split-row');
    if (split) add('碳水:脂肪', split.querySelector('.metric-row-top'), split.querySelector('.split-bar'));
    document.querySelectorAll('.micro-chip').forEach((chip) =>
      add(chip.querySelector('.micro-label')?.textContent.trim() || '方框',
        chip.querySelector('.micro-label'), chip.querySelector('.nutrient-scale')));
    return rows;
  });
  const gaps = [...new Set(spacing.map((s) => s.gap))];
  const shortHit = spacing.filter((s) => s.hit != null && s.hit < 44);
  check('主卡标签到刻度只有一档距离，热区不占版面',
    spacing.length >= 5 && gaps.length === 1 && shortHit.length === 0,
    spacing.length < 5 ? `只量到 ${spacing.length} 行`
      : gaps.length !== 1 ? `${spacing.map((s) => `${s.name} ${s.gap}`).join('、')} —— 有 ${gaps.length} 种距离`
        : shortHit.length ? `热区被砍矮：${shortHit.map((s) => `${s.name} ${s.hit}px`).join('、')}`
          : `五行都是 ${gaps[0]}px，热区 44px`);

  const above = await page.evaluate(async () => {
    const track = document.querySelector('.micro-chip .nutrient-scale');
    if (!track) return 'no-track';
    const box = track.getBoundingClientRect();
    // 条正上方 15px：画出来的东西一个像素都没有，只有 ::after 撑出来的热区
    document.elementFromPoint(box.left + box.width / 2, box.top - 15)?.click();
    await new Promise((r) => setTimeout(r, 250));
    return document.querySelector('.point-value-tip') ? 'opened' : 'missed';
  });
  check('热区靠 ::after 撑出去，条上方空白处仍点得中', above === 'opened', above);

  /*
   * 「你现在看到的数字不对」这几条必须一眼认得出是警告。
   * 一次样式重构里 .data-freshness 被连带删掉，文案还在、颜色和正文一样，
   * 单元测试全绿——这类退化只有量渲染结果才拦得住。
   */
  // 前面那条检查存过一份真实档案，警告就不显示了——这里先把它切回演示态
  await page.evaluate(async () => {
    const { saveProfile } = await import('./js/lib/store.js');
    await saveProfile({ demoMode: true });
  });
  await page.evaluate(() => document.querySelectorAll('.tab')[0]?.click());
  await page.waitForTimeout(600);
  const warnLook = await page.evaluate(() => {
    const el = document.querySelector('.data-freshness.warn');
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const transparent = /rgba\(0,\s*0,\s*0,\s*0\)|^transparent$/.test(bg);
    const body = getComputedStyle(document.querySelector('.hero-detail') || document.body).color;
    return { bg, transparent, sameAsBody: cs.color === body, pad: cs.padding };
  });
  check('演示/过期这类警告看得出是警告',
    !warnLook.missing && !warnLook.transparent && !warnLook.sameAsBody,
    warnLook.missing ? '页面上没有这条警告（演示档案下应当有）'
      : `底色 ${warnLook.bg}${warnLook.sameAsBody ? '，文字颜色和正文一样' : ''}`);
  await page.evaluate(async () => {
    const { saveProfile } = await import('./js/lib/store.js');
    await saveProfile({ demoMode: false });
  });

  /*
   * 没有记录时不画一条全零的线。
   *
   * Number(null) 是 0 而 Number.isFinite(0) 是 true，漏记的那天曾经就这么
   * 混成实点：图上一串贴着地板的点把折线拽下去，而图下面那段解读
   * （analyzeSeries 剔了 null）写的是「有记录的 6 天日均 2212」——
   * 同一张卡里两句话互相打脸。这类只在渲染层显形，单元测试拦不住。
   */
  // 跳到一个肯定没有记录的日期（前面那些检查刚记过东西）
  await page.evaluate(async () => {
    const { setDay } = await import('./js/lib/store.js');
    await setDay('2024-01-15');
  });
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('数据'))?.click());
  await page.waitForTimeout(600);
  const zeroLine = await page.evaluate(() => {
    const sel = document.querySelector('.trend-select');
    if (!sel) return { noChart: true };
    sel.value = 'kcal';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return null;
  });
  await page.waitForTimeout(500);
  const chartState = zeroLine?.noChart ? zeroLine : await page.evaluate(() => {
    const insufficient = document.querySelector('.trend-insufficient');
    if (insufficient) {
      return {
        dots: 0,
        empty: insufficient.textContent.trim() === '数据不足',
        emptyText: insufficient.textContent.trim(),
        onFloor: 0,
      };
    }
    const wrap = document.querySelector('.chart-wrap');
    if (!wrap) return { dots: 0, empty: false, emptyText: '', onFloor: 0 };
    const dots = [...wrap.querySelectorAll('circle')];
    const svg = wrap.querySelector('svg');
    const h = svg ? Number(svg.getAttribute('viewBox').split(' ')[3]) : 0;
    return {
      dots: dots.length,
      empty: !!wrap.querySelector('.chart-empty'),
      // 贴着底边的点：全零线的特征
      onFloor: dots.filter((c) => Number(c.getAttribute('cy')) > h - 12).length,
    };
  });
  /*
   * 判据是「画没画线」，不是「点在不在底边」。
   * 一开始写成后者，结果旧代码也能过：那天连健康数据都没有，纵轴量程塌下来，
   * 那串零点并不贴着底边——检查看着绿，bug 原样还在。
   */
  check('一条记录都没有时给空状态，不画线',
    chartState.noChart || (chartState.empty && chartState.dots === 0),
    chartState.noChart ? '数据页没有图'
      : `本该只写“数据不足”，实际画了 ${chartState.dots} 个点（空状态：${chartState.emptyText || '无'}）`);
  await page.evaluate(async () => {
    const { setDay } = await import('./js/lib/store.js');
    await setDay(new Date().toLocaleDateString('sv-SE'));
  });

  /*
   * 弹层不能把背后的页面带着跑。
   *
   * 用户实测：「有时候我选不中，会滑到底下被它遮住的页面，特别是滑到最底下
   * 的时候」——弹层内部滚到头之后，手指继续滑就换成背景在滚，看着就像点不中。
   * 真正在滚的是 <main class="view">，不是 body，所以只锁 body 拦不住。
   */
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('饮食'))?.click());
  await page.waitForTimeout(500);
  // 顺便验新增的品牌饮料真能从用户会输入的名字打开。
  await page.fill('.search-input', '水溶C100');
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('main.view')?.scrollTo(0, 300));
  await page.waitForTimeout(250);
  const beforeY = await page.evaluate(() => document.querySelector('main.view')?.scrollTop ?? 0);
  await page.evaluate(() => document.querySelector('.search-item')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const el = document.querySelector('.sheet-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  });
  const sheetLayout = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    const scroll = document.querySelector('.sheet-scroll');
    const footer = document.querySelector('.sheet-footer');
    const action = footer?.querySelector('.sheet-action');
    const meal = scroll?.querySelector('.portion-meal');
    const buttons = [...(action?.querySelectorAll('button') || [])];
    if (!sheet || !scroll || !footer || !action || !meal || !buttons.length) return null;
    const sr = sheet.getBoundingClientRect();
    const br = scroll.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    const mr = meal.getBoundingClientRect();
    const top = Math.min(...buttons.map((button) => button.getBoundingClientRect().top));
    const bottom = Math.max(...buttons.map((button) => button.getBoundingClientRect().bottom));
    return {
      actionOutsideScroll: footer.contains(action) && !scroll.contains(action),
      footerGap: Math.round((sr.bottom - fr.bottom) * 10) / 10,
      seamGap: Math.round((fr.top - br.bottom) * 10) / 10,
      topInset: Math.round((top - fr.top) * 10) / 10,
      bottomInset: Math.round((fr.bottom - bottom) * 10) / 10,
      mealAboveFooter: mr.bottom <= fr.top + 1,
      product: scroll.querySelector('.portion-head strong')?.textContent || '',
    };
  });
  const sheetBox = await page.evaluate(() => {
    const el = document.querySelector('.sheet');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + 40, y: r.y + r.height / 2 };
  });
  if (sheetBox) {
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.move(sheetBox.x, sheetBox.y);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(100);
    }
  }
  const sheetScroll = await page.evaluate(() => ({
    open: !document.querySelector('.sheet-wrap')?.hidden,
    duringY: document.querySelector('main.view')?.scrollTop ?? 0,
    contain: document.querySelector('.sheet-scroll')
      ? getComputedStyle(document.querySelector('.sheet-scroll')).overscrollBehaviorY : '',
    // 真正在滚的是 main.view，弹层开着时它必须被锁住
    scrollerLocked: getComputedStyle(document.querySelector('main.view')).overflowY,
  }));
  await page.evaluate(() => document.querySelector('.sheet-backdrop')?.click());
  await page.waitForTimeout(500);
  const afterY = await page.evaluate(() => document.querySelector('main.view')?.scrollTop ?? 0);
  const sheetProblems = [
    !sheetBox && '份量弹层没打开',
    /*
     * `none` 而不是 `contain`：contain 只拦滚动链，橡皮筋还在 —— 滚到顶继续往下拉，
     * 内容被拽下去、顶上留一大片空白，而且那一下被合成器接管之后就停在那儿。
     */
    sheetBox && sheetScroll.contain !== 'none'
      && `弹层正文到顶还能继续往下拉（overscroll-behavior: ${sheetScroll.contain}）`,
    /*
     * 这一条是主判据。上面那个「滚四下看背景动没动」在 Chromium 里用滚轮
     * 复现不出 iOS 的手指拖动——只锁 body 也能过。真正的区别是有没有把
     * main.view 锁住，所以直接量它。
     */
    sheetBox && sheetScroll.scrollerLocked !== 'hidden'
      && `弹层开着时内容区没锁住（overflow-y: ${sheetScroll.scrollerLocked}），手指会把它滑走`,
    sheetBox && sheetScroll.duringY !== beforeY
      && `弹层滚到底后背景跟着跑了：${beforeY} → ${sheetScroll.duringY}`,
    sheetBox && Math.abs(afterY - beforeY) > 5
      && `关掉弹层后页面跳了：${beforeY} → ${afterY}`,
  ].filter(Boolean);
  check('弹层不会把背后的页面带着滚', sheetProblems.length === 0, sheetProblems.join('；'));
  const sheetLayoutProblems = [
    !sheetLayout && '没量到弹层正文与底栏',
    sheetLayout && !sheetLayout.product.includes('水溶C100')
      && `搜索结果不是水溶C100：${sheetLayout.product}`,
    sheetLayout && !sheetLayout.actionOutsideScroll && '操作按钮还留在滚动正文里',
    sheetLayout && Math.abs(sheetLayout.footerGap) > 1
      && `底栏没贴弹层底边：${sheetLayout.footerGap}px`,
    sheetLayout && Math.abs(sheetLayout.seamGap) > 1
      && `正文与底栏之间留了 ${sheetLayout.seamGap}px`,
    sheetLayout && Math.abs(sheetLayout.topInset - sheetLayout.bottomInset) > 2
      && `按钮上下留白不对称：${sheetLayout.topInset}px / ${sheetLayout.bottomInset}px`,
    sheetLayout && !sheetLayout.mealAboveFooter && '餐次选择被底栏盖住了',
  ].filter(Boolean);
  check('份量弹层底栏贴边、不覆盖餐次选择',
    sheetLayoutProblems.length === 0, sheetLayoutProblems.join('；'));
  await page.evaluate(() => { const el = document.querySelector('.search-input'); if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForTimeout(300);

  // 健身选择器确认栏的边界与空态在 training-design-smoke 实测。
  await page.evaluate(async () => (await import('./js/lib/sheet.js')).closeSheet({ force: true }));
  await page.waitForTimeout(300);
  await page.locator('.tab').filter({ hasText: '健身' }).click();

  // ---- 设置抽屉 ----
  await page.evaluate(() => document.querySelector('.topbar-settings-btn')?.click());
  await page.waitForTimeout(700);
  /*
   * 设置主页是一张分组列表：每组一行，点进去才是那张表单。
   * 光看得见五行不算数——真正会坏的是「点进去里面是空的」，所以逐个点开看。
   */
  /*
   * 行的类名是 .settings-row，不是 .set-row —— 后者是训练页记组数那一行。
   * 这条守卫曾经查着 .set-row，两边同名的时候看着是对的；设置行改名之后
   * 它就一直匹配到 0 个元素、报「一行都没有」，而设置页本身好好的。
   * 查不到元素时报「一行都没有」和真的坏掉长得一模一样，所以下面额外断言行数是 5。
   */
  const drawer = await page.$$eval('.settings-drawer .settings-row .set-title', (h) => h.map((x) => x.textContent.trim()));
  const opened = [];
  for (let i = 0; i < drawer.length; i += 1) {
    await page.evaluate((n) => document.querySelectorAll('.settings-drawer .settings-row')[n]?.click(), i);
    await page.waitForTimeout(250);
    const inner = await page.evaluate(() => ({
      back: !!document.querySelector('.settings-drawer .set-back-btn'),
      body: document.querySelector('.settings-drawer .set-back')?.nextElementSibling?.childElementCount || 0,
    }));
    opened.push(`${drawer[i]}${inner.back && inner.body > 0 ? '' : '（空）'}`);
    await page.evaluate(() => document.querySelector('.settings-drawer .set-back-btn')?.click());
    await page.waitForTimeout(200);
  }
  check('设置分组列表每组都点得开',
    drawer.length === 5 && !opened.some((x) => x.includes('（空）')),
    opened.join(' / ') || '(一行都没有)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---- IndexedDB 真的落库：写一条、重新加载、还在 ----
  const wrote = await page.evaluate(async () => {
    const { addEntry, state } = await import('./js/lib/store.js');
    await addEntry({ foodId: 'rice_white', grams: 123 });
    return state.dietEntries.length;
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.tab', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const persisted = await page.evaluate(async () => {
    const { state } = await import('./js/lib/store.js');
    return state.dietEntries.filter((e) => e.grams === 123).length;
  });
  check('IndexedDB 写入后刷新仍在', wrote > 0 && persisted > 0, `写入 ${wrote} 条，刷新后命中 ${persisted} 条`);

  // ---- Service Worker 注册并接管 ----
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { supported: true, registered: false };
    await navigator.serviceWorker.ready;
    return { supported: true, registered: true, controlled: !!navigator.serviceWorker.controller };
  });
  check('Service Worker 注册成功', sw.registered === true, JSON.stringify(sw));

  // ---- 离线外壳：清单里的模块都能从缓存拿到 ----
  const cached = await page.evaluate(async () => {
    if (!('caches' in window)) return null;
    const keys = await caches.keys();
    const shell = keys.find((k) => k.startsWith('health-diet-') && !k.includes('supabase'));
    if (!shell) return { shell: null };
    const cache = await caches.open(shell);
    const entries = await cache.keys();
    return { shell, count: entries.length };
  });
  check('离线外壳已缓存', (cached?.count || 0) > 20, JSON.stringify(cached));

  // ---- 手势：三处都得跟手，而且不能被那 60 秒一次的重绘打断 ----
  /*
   * 用真实指针事件走一遍，不用 dispatchEvent —— 要连 pointer capture、
   * touch-action 和「拖到一半整页重绘」一起验。前两样只有真事件才走得到。
   */
  const swipe = async (from, to, steps = 12) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / steps,
        from.y + ((to.y - from.y) * i) / steps);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
  };
  const currentDay = () => page.evaluate(async (b) => (await import(`${b}/js/lib/store.js`)).state.day, BASE);

  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('今日'))?.click());
  await page.waitForTimeout(500);
  const dayStart = await currentDay();
  const topbarBox = await page.$eval('.topbar-context', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // 右滑 = 往回翻一天（和左边那个「<」同一个动作）；左滑翻回来
  await swipe({ x: topbarBox.x - 60, y: topbarBox.y }, { x: topbarBox.x + 60, y: topbarBox.y });
  await page.waitForTimeout(400);
  const dayBack = await currentDay();
  await swipe({ x: topbarBox.x + 60, y: topbarBox.y }, { x: topbarBox.x - 60, y: topbarBox.y });
  await page.waitForTimeout(400);
  const dayForward = await currentDay();
  // 竖着划是在滚页面，不该翻日期
  await swipe({ x: topbarBox.x, y: topbarBox.y }, { x: topbarBox.x + 8, y: topbarBox.y + 70 });
  await page.waitForTimeout(300);
  const dayAfterVertical = await currentDay();
  check('顶栏左右滑翻日期，竖着划不翻',
    dayBack !== dayStart && dayForward === dayStart && dayAfterVertical === dayStart,
    JSON.stringify({ dayStart, dayBack, dayForward, dayAfterVertical }));

  /*
   * 「正在做手势」漏一次释放，不能把整个应用卡死。
   *
   * app.js 的 busy() 拿 isGesturing() 闸着全应用的重绘：它一旦永久为真，
   * 每次落库都只记一笔 renderPending，再在下一次 pointerup 补跑 ——
   * 表现就是「点哪儿哪儿重绘」，正在打字的输入框被换掉、键盘收起、
   * 刚打开的弹层弹走，而且不重开应用就好不了。
   * 指针捕获在节点被隐藏或换掉时会失效（弹层退场、重绘都会），
   * 那一下的 pointerup 就送不到原来的元素上，所以这不是假想的情况。
   */
  const gestureState = await page.evaluate(async (b) => {
    const g = await import(`${b}/js/lib/gesture.js`);
    g.holdGesture(999);   // 有主但那根手指永远不会抬起来
    g.holdGesture();      // 无主
    return g.isGesturing();
  }, BASE);
  await page.touchscreen.tap(200, 400);
  await page.waitForTimeout(200);
  const gestureHealed = await page.evaluate(async (b) => (await import(`${b}/js/lib/gesture.js`)).isGesturing(), BASE);
  check('手势占用漏了也能自己恢复，不会把重绘永久闸住',
    gestureState === true && gestureHealed === false,
    JSON.stringify({ 漏掉之后: gestureState, 抬一次手之后: gestureHealed }));

  /*
   * 图表按住横扫：手势挂在 document 上，所以每选一天重绘整张卡也不会把它掐断。
   *
   * 先种几天健康数据 —— 冒烟前面那些用例跑的是空库，趋势卡是「数据不足」的
   * 空状态，压根没有可扫的图，这条检查会永远报 0 而看着像手势坏了。
   * 放在整个脚本最后，不会影响前面那条「一条记录都没有时给空状态」。
   */
  await page.evaluate(async (b) => {
    const { mergeHealthDays } = await import(`${b}/js/lib/store.js`);
    const days = [];
    for (let i = 0; i < 20; i += 1) {
      days.push({
        date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
        weight: 72 - i * 0.04, steps: 7000 + (i % 7) * 800,
        activeEnergy: 500, restingEnergy: 1600, sleepMinutes: 410,
        restingHeartRate: 58, exerciseMinutes: 30, waterMl: 900,
      });
    }
    await mergeHealthDays(days);
  }, BASE);
  await page.waitForTimeout(600);
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('数据'))?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('.trend-card')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const chartEl = await page.$('.trend-card svg.chart');
  const chartBox = chartEl ? await chartEl.boundingBox() : null;
  let scrubbed = 0;
  if (chartBox) {
    const seen = new Set();
    await page.exposeFunction('__smokePick', (t) => seen.add(t));
    await page.evaluate(() => {
      window.__smokeWatch = setInterval(() => {
        const t = document.querySelector('.chart-readout')?.textContent || '';
        if (t) window.__smokePick(t.slice(0, 12));
      }, 40);
    });
    await swipe({ x: chartBox.x + chartBox.width * 0.2, y: chartBox.y + chartBox.height / 2 },
      { x: chartBox.x + chartBox.width * 0.85, y: chartBox.y + chartBox.height / 2 }, 18);
    await page.waitForTimeout(300);
    await page.evaluate(() => clearInterval(window.__smokeWatch));
    scrubbed = seen.size;
  }
  check('图表按住横扫能连着换日子', scrubbed >= 2,
    scrubbed >= 2 ? `扫过 ${scrubbed} 天`
      : `扫过去只认到 ${scrubbed} 天 —— 手势多半又挂回被重绘换掉的那棵 SVG 上了`);

  /*
   * 算出来的竖向外边距也得落在六档阶梯上。
   *
   * test/ui.test.js 那条只读得到 app.css 里写着的值，读不到**浏览器补的**：
   * <p> 默认带 margin-block-end: 1em，只覆盖 margin-top 的话它就留在那儿 ——
   * .chart-note 上正好是 13px，既不在阶梯上，还跟着字号浮动，
   * 而且在 CSS 里搜不到，排查时会以为是别处的问题。只有量计算样式才看得见。
   */
  const offLadder = new Map();
  for (const tab of ['今日', '饮食', '数据', '健身']) {
    await page.evaluate((t) => [...document.querySelectorAll('.tab')]
      .find((x) => x.textContent.includes(t))?.click(), tab);
    await page.waitForTimeout(500);
    const rows = await page.evaluate((label) => {
      const LADDER = new Set([0, 2, 4, 8, 12, 16, 24]);
      const out = [];
      for (const el of document.querySelectorAll('#view *')) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || el.closest('svg')) continue;
        const cs = getComputedStyle(el);
        for (const side of ['marginTop', 'marginBottom']) {
          const v = Math.round(parseFloat(cs[side]) * 10) / 10;
          if (!Number.isFinite(v) || v < 0 || LADDER.has(v)) continue;
          const cls = typeof el.className === 'string' && el.className
            ? `.${el.className.trim().split(/\s+/)[0]}` : el.tagName.toLowerCase();
          out.push(`${label} ${el.tagName.toLowerCase()}${cls} ${side}=${v}px`);
        }
      }
      return out;
    }, tab);
    for (const r of rows) offLadder.set(r, true);
  }
  check('算出来的竖向间距也在六档阶梯上（浏览器默认值不许漏进来）',
    offLadder.size === 0, [...offLadder.keys()].slice(0, 5).join('；'));

  // 弹层：拖一小段弹回、拖过阈值才关
  await page.evaluate(() => [...document.querySelectorAll('.tab')]
    .find((x) => x.textContent.includes('饮食'))?.click());
  await page.waitForTimeout(600);
  await page.fill('.exercise-search-input, .ui-search-input', '米饭');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.search-results .ui-list-row, .search-item')?.click());
  await page.waitForTimeout(600);
  const sheetShown = await page.evaluate(() => document.querySelector('.sheet-wrap')?.hidden === false);
  let sheetDrag = null;
  if (sheetShown) {
    const sheetBox = await page.$eval('.sheet', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 24 };
    });
    await swipe({ x: sheetBox.x, y: sheetBox.y }, { x: sheetBox.x, y: sheetBox.y + 40 }, 8);
    await page.waitForTimeout(400);
    const heldOpen = await page.evaluate(() => document.querySelector('.sheet-wrap')?.hidden === false);
    const leftover = await page.evaluate(() => document.querySelector('.sheet')?.style.transform || '');
    await swipe({ x: sheetBox.x, y: sheetBox.y }, { x: sheetBox.x, y: sheetBox.y + 200 }, 14);
    await page.waitForTimeout(500);
    const gone = await page.evaluate(() => document.querySelector('.sheet-wrap')?.hidden === true);
    sheetDrag = { heldOpen, leftover, gone };
  }
  check('弹层拖一点弹回、拖过阈值才关',
    sheetShown && sheetDrag?.heldOpen === true && sheetDrag?.leftover === '' && sheetDrag?.gone === true,
    JSON.stringify({ sheetShown, ...sheetDrag }));

  /*
   * 幽灵点击关不掉遮罩（lib/utils.js 的 scrimDismiss）。
   *
   * iOS 上轻点让一层覆盖物出现在手指底下时，随后补派的那个合成 click 会落到
   * 新出现的那一层上 —— 遮罩铺满整屏，它的 onclick 就是「关掉」，
   * 表现就是「点一下食物，弹层升起来又立刻收回去」。
   * 这里照着补派那一下的样子造一次：**没有 pointerdown 的 click，detail 为 1**
   * （兼容鼠标事件就长这样）。闸门早过了，所以这一条量的是配对，不是时间窗。
   * 两层遮罩一起量：设置抽屉那层是同一个形状，现在只是碰巧被抽屉自己挡住了坐标。
   */
  const ghostClick = async (selector, x, y) => page.evaluate(([sel, cx, cy]) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, detail: 1, clientX: cx, clientY: cy,
    }));
    return true;
  }, [selector, x, y]);

  let ghost = null;
  await page.evaluate(() => document.querySelector('.search-results .ui-list-row, .search-item')?.click());
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => document.querySelector('.sheet-wrap')?.hidden === false)) {
    await ghostClick('.sheet-backdrop', 196, 40);
    await page.waitForTimeout(400);
    const sheetHeld = await page.evaluate(() => document.querySelector('.sheet-wrap')?.hidden === false);
    // 真按在遮罩上再抬手，仍然要关得掉
    await swipe({ x: 196, y: 40 }, { x: 196, y: 40 }, 1);
    await page.waitForTimeout(500);
    const sheetGone = await page.evaluate(() => document.querySelector('.sheet-wrap')?.hidden === true);

    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label')?.includes('设置'))?.click());
    await page.waitForTimeout(600);
    const drawerShown = await page.evaluate(() => document.querySelector('.settings-overlay')?.hidden === false);
    await ghostClick('.settings-overlay', 4, 400);
    await page.waitForTimeout(400);
    const drawerHeld = await page.evaluate(() => document.querySelector('.settings-overlay')?.hidden === false);
    await swipe({ x: 5, y: 400 }, { x: 5, y: 400 }, 1);
    await page.waitForTimeout(600);
    const drawerGone = await page.evaluate(() => document.querySelector('.settings-overlay')?.getAttribute('aria-hidden') === 'true');
    ghost = { sheetHeld, sheetGone, drawerShown, drawerHeld, drawerGone };
  }
  check('补派的幽灵点击关不掉遮罩，真按下去仍然关得掉',
    ghost?.sheetHeld === true && ghost?.sheetGone === true
    && ghost?.drawerShown === true && ghost?.drawerHeld === true && ghost?.drawerGone === true,
    JSON.stringify(ghost));

  // 毛玻璃只给真的叠在内容上面的那几处
  await page.evaluate(async (b) => {
    const { toast } = await import(`${b}/js/lib/utils.js`);
    toast('冒烟：量一下毛玻璃', 'info');
  }, BASE);
  await page.waitForTimeout(300);
  const glass = await page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    };
    return { toast: read('.toast'), actionbar: read('.actionbar-slot'), drawer: read('.settings-drawer') };
  });
  check('毛玻璃只给真的叠在内容上面的那几处',
    /blur/.test(glass.toast || '') && !/blur/.test(glass.actionbar || '') && !/blur/.test(glass.drawer || ''),
    JSON.stringify(glass));

  check('运行期无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error(`冒烟测试失败：${failed.map((f) => f.name).join('、')}`);
  process.exit(1);
}
