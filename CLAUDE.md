# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 命令

```bash
npm test                                              # 全部测试（node --test）
node --test test/nutrition.test.js                    # 单个文件
node --test --test-name-pattern='Katch' test/*.test.js  # 按用例名筛选
npm run serve                                         # python3 -m http.server 8080

# 浏览器冒烟：起动、四个栏目、IndexedDB 落库、Service Worker 接管
# CI 会自己跑；本地要跑得先起服务器，playwright 用 PLAYWRIGHT_PATH 指过去
node scripts/smoke.mjs http://127.0.0.1:8080
```

`.github/workflows/ci.yml` 在每个 PR 上跑单元测试 + 浏览器冒烟。
**浏览器那一层不是可有可无的**：启动失败吞掉自救按钮、身体信息不合格白屏、
推荐份量漏出浮点数，这三个都是几百项单元测试全绿的情况下漏过去的。

**没有构建、没有依赖、没有 lint 配置。** `package.json` 里没有 `dependencies`，测试直接跑源码。
不要引入 npm 包、打包器或框架 —— 浏览器直接加载 `js/` 下的 ES 模块。

页面必须走 http(s)（ES 模块 + Module Worker），双击 `index.html` 打不开。

## 架构

### 三层纯度边界

| 层 | 能碰什么 | 谁能测 |
| --- | --- | --- |
| `js/core/*`、`js/data/*` | 纯函数，无 DOM、无浏览器 API | 测试只 import 这两处 |
| `js/lib/*` | IndexedDB / Worker / DOM 工具 / SVG | 否 |
| `js/views/*` | 只做 DOM 渲染 | 否 |

新增的计算逻辑一律放 `core/`，否则写不了测试。视图里不要出现营养计算。
「该显示哪几个动作」「这条曲线该怎么解读」这类挑选与措辞逻辑也算计算，
同样放 `core/`（见 `training.js`、`trend-reading.js`）。

### 栏目与卡片

底部四栏：**今日 / 饮食 / 数据 / 健身**，设置在右上角的侧边抽屉里。

各页只回答一个问题，别把「我怎么样」和「我该做什么」混在一起：

- **今日** —— 我今天怎么样。主卡 + 今日提示，两张。
  **主卡就是每日目标表**：热量、蛋白、碳水、脂肪、纤维、钠、糖、饮水八项全在，
  而且每项都带「已吃 / 目标」。所以别再单列一张只有目标的表——那是同一批数字，
  少说了「还差多少」。目标依据和 Apple 能量的时效收在主卡右上角的 `infoTip` 里；
  但「身体信息不合格 / 演示数据 / 数据过期」这几条不许收进去，
  它们说的是「你现在看到的数字不对」，藏起来就没人会发现（`energyFreshness`）。
  只读的「今日记录」已删：饮食页那张是可编辑的超集，看到了却改不了反而要再翻一页。
  多日趋势（日均摄入、蛋白达标率、体重斜率）也不在这里，归数据页的图。
- **饮食** —— 我现在该吃什么。搜索记账、当天记录、喝水、当前饮食推荐。
  推荐原先长在今日页，但真要照着做的时候人已经在这一页了。
  「现在别碰」整块已删（连 `buildAvoidList` 一起）：说的是「别做什么」，
  和这一页要回答的「该吃什么」是反过来的，而且一次列五条几乎每天都一样。
- **数据** —— 今天同步了什么 + 在往哪走。健康数据（带图标）+ 一张趋势卡（图和选择器同卡）。
  健康数据摆最上面，下面那张趋势卡画的就是同一批指标的走势。
  解读收在每张图下面：看着那条曲线读那段话，比先看一堆汇总数字再往下翻要直接。
- **健身** —— 今天练什么、练了多少。

会换页的卡片抽成 `js/views/cards/*`，导出一个挂载函数（`profileCard`、`healthMetricsCard`、
`dataManagerCard`、`trendCharts`、`recommendCard`、`waterCard`），搬家只改一行 import。
`test/ui.test.js` 的断言跟着「页面挂了哪些卡片」走，不跟着文件走。
**视图不许 import 兄弟视图**（`test/module-refs.test.js` 会拦），要复用就抽成卡片。

### store.js 是唯一枢纽，`recompute()` 是整条流水线

顺序有依赖，改动时别打乱：

1. `effectiveProfile` = 用户填的 profile，叠加 Apple 健康的体重 / 体脂 / 身高（`syncWeightFromApple`）
2. `computeBaseline(healthDays, dietDaily, day)` → 近 14 天基线
3. `basalMetabolicRate` → `staticTDEE`
4. `dynamicTDEE` —— 仅当 `useAppleEnergy` 且当天有 `activeEnergy`/`restingEnergy` 时才算
5. `dailyTargets(effectiveProfile, dynamic)`
6. `buildAdvice({ targets, intake, entries, profile, health, baseline, now })`
7. 全部塞进 `state.derived`

**视图只读 `state.derived`**，不直接调 nutrition / advisor。所有变更操作
（`addEntry`、`saveProfile`、`mergeHealthDays`、`setDay`…）结尾都是 `recompute(); emit();`。

看历史日期时 `now` 被钉在 `${day}T20:00:00`，否则会按此刻的钟点给出「该吃午饭了」这种建议。

### 渲染模型

`app.js` 的 `subscribe()` 回调整页重跑当前标签的 `render<Tab>(viewRoot)`，另外还有 60 秒定时器
和 `visibilitychange` 也会触发。所以 `render*` 必须幂等、可反复调用。

整页重绘会打断 iOS 输入（收键盘、日期选择器被当场提交），有两道现成的防线，新代码要沿用：

- `app.js` 的 `isEditing()`：焦点在输入控件里时，跳过定时器与可见性触发的重绘。
- `views/diet.js`：外壳只建一次（`buildShell`），之后只刷新 `nodes.*` 里的插槽。**任何带文本输入的视图都照这个写。**

### 导入链路

`views/health.js` 或 `#import=<JSON>` 链接 → `lib/importer.js` → Worker → `core/health.js` 的纯解析函数
→ `store.mergeHealthDays()` → `db.bulkPut(..., { merge: true })`（同日期只覆盖本次带来的字段）。

Worker 协议：`postMessage({ file })` 或 `{ text }`；回 `{ type: 'progress' | 'done' | 'error' }`。

zip 路径是全流式的（中央目录 → `Blob.slice` → `DecompressionStream('deflate-raw')` → `TextDecoderStream`
→ 分块扫 `<Record>`）。`export.xml` 动辄几 GB，**不要引入 DOMParser 或 zip 库**。
能测的解析逻辑都在 `core/health.js`，Worker 只留文件与 zip 的管道。

### IndexedDB

`DB_VERSION = 3`，五个 store：`health`（key 为 `YYYY-MM-DD`）、`diet`（自增 id + `date` 索引）、
`settings`（键值对）、`customFoods`、`training`（key 为 `YYYY-MM-DD`）。
加 store 或索引要同时改 `DB_VERSION` 和 `onupgradeneeded`，并且同步三处：
`IMPORT_LIMITS`（导入体积上限）、`validateImportPayload`（恢复备份时的校验）、
`cloud-sync.js` 里那份 store 名单（漏了换设备就丢数据）。

## 食物库的数据契约

`test/foods.test.js` 会强制以下约束，加食物前先看那个文件：

- `n` = 每 100g 的 `[热量kcal, 蛋白g, 脂肪g, 碳水g, 纤维g, 总糖g, 钠mg]`，七项，全部非负。
- 热量与宏量自洽：`蛋白*4 + 脂肪*9 + (碳水-纤维)*4 + 纤维*2`，误差不超过 `max(25%, 12 kcal)`（`alcohol` 除外）。
- 纤维 ≤ 碳水，糖 ≤ 碳水。
- `s`（常用份量）非空，每份 0 < 克数 ≤ 1000；`cat` 必须在 `CATEGORIES` 里，且该分类要有 `PORTION_TIPS`。
- `cat: 'chain'` 的首个份量必须是品牌标准份（个 / 块 / 只 / 份 / 杯…），40~600g。
- 搜索同分时按数组里的录入顺序 —— 同品牌把主力单品排在配菜前面。
- **糖度是界面选项，不是多条记录。** 加 `tealevel` 标记，营养按全糖录入，`nutrientsFor` 按 `SUGAR_LEVELS`
  五档换算；`sf` 是点“无糖”时仍存在的总糖，`nfs` 是其中不属于 WHO 游离糖的部分。
  乳糖、完整果肉内源糖写入 `nfs`；果汁、果泥即使来自水果仍属游离糖，必须显式写 `nfs: 0`。
- 品牌未公开完整营养表的打 `est`，界面会显示「估算」；茶饮除星巴克 / 瑞幸外一律 `est`。
- `freeSugarFactor` 按 WHO 游离糖定义从总糖中扣除有依据的非游离糖；`fruit`/`veg` 必须是 0，
  但 `snack` 不能按分类一律设为 1（乳品、完整水果制品等可能只有部分糖属于游离糖）。

## 算法的依据

`docs/算法依据.md` 逐条列出了每个进入计算的常数与公式的出处，分三类标注：
**文献**（有公开发表出处，改动前必须给出新依据）、**惯例**（营养实践通行取值）、
**护栏**（纯工程取值，无生理含义）。

改动任何营养或健康计算前先看那份文档，并同步更新它。`test/nutrition.test.js`
里有一组「公式对文献值」的用例锁着 Mifflin-St Jeor、Katch-McArdle、Atwater、
IOM 纤维/AMDR、WHO 钠与游离糖 —— 它们不是回归测试，是防止有人把公式改成拍脑袋的数。

口径红线：

- 界面上凡是基于「惯例」或「护栏」得出的数字，不得说成实测。Apple 能量本身也是设备估算；
  `dynamicTDEE.measured` 只是兼容字段，界面应写「设备累计 / 预计」，不能翻译成「实测」。
- **摄入类结论的分母是「有饮食记录的天数」，不是日历天数。**
  没记录的日子不在样本里，当成 0 kcal 会造出「近 14 天日均赤字 3168 kcal」这种
  并不存在的结论。样本少于 3 天时不下结论（`MIN_POINTS_FOR_CLAIM`）。
  这几条结论现在只在数据页的图下面出现一次，由 `core/trend-reading.js` 把关；
  `buildInsights` 不再重复一遍，别加回去。
- Apple 动态 TDEE 的统一口径是“静息 + 活动”，`tef` 固定为 0；不要再叠加固定 10% TEF。
- BMR 使用公式原值，不设 800 kcal 下限；每日热量目标下限是女 1200 / 男 1500 kcal，
  不与 BMR 取最大值。饮水参考固定为男 1700 / 女 1500 ml。
- `sugar` 目标和饮食汇总表示 WHO 游离糖，不是总糖或狭义添加糖。
  菜肴按 `DISH_ADDED_SUGAR` 表逐道扣掉食材自带的糖（表里没有的按不加糖处理）；
  乳糖和整食内源糖用 `natsugar` 标记。**加新菜时要顺手在那张表里给个值**，
  漏了会被当成完全不加糖。
- 体脂率输入会切换到 Katch-McArdle，但家用 BIA 误差会传导到结果，界面不得宣称“更准”。

## 容易踩的坑

- **能量单位区分大小写**：Apple 导出的 `unit="Cal"` 是大卡（kcal），小写 `cal` 才是 1/1000。
  先 `toLowerCase()` 再比较会让整套数据缩小一千倍 —— 这个 bug 上线过，`findMisscaledEnergyDays` /
  `repairMisscaledEnergy` 就是给用户修历史数据的。
- **HealthKit 的 `%` 存的是 0~1**（0.181 表示 18.1%），第三方导出却直接写 18.1，
  `normalizeValue('percent')` 按数值大小区分。
- `addEntry` 的字段叫 `sugarLevel` 不是 `sugar`：后者是展开的 nutrients 里糖的克数，会互相覆盖。
- 建 DOM 用 `utils.js` 的 `h()` / `mount()`，别用原生 `append()` —— 原生不展开数组
  （得到 `[object HTMLButtonElement]`），也不忽略 `null`/`false`（渲染出字面量 "null"）。
- `lineChart` 的纵轴刻度逻辑在 `test/charts-axis.test.js` 里抄了一份（charts.js 依赖 DOM）。改一处要改两处。
  调用方传的 `decimals` 只是**下限**：量程比它还细时（一周体重只差 0.08kg）
  四条刻度会印成「62.0 / 62.0 / 61.9 / 61.9」，所以撞车了会自动往上加位。
- 图上的虚线要在标签里写清是「建议 / 目标 / 平均」中的哪一个。
  只写「7 小时」，旁边卡片角上又写着「平均 6.6 小时」，两个数对不上，看的人只会以为算错了。
- 新增 js 模块要加进 `sw.js` 的 `SHELL`，并同步 `package.json` / `js/core/feedback.js` 里的版本号
  （`test/ui.test.js` 和 `test/feedback.test.js` 会一起卡）。漏一个模块，离线时整个应用就打不开。
- 跨模块调用忘了 import 只会在浏览器里炸（设置抽屉整页白屏就是这么来的），
  `test/module-refs.test.js` 是手搓的 `no-undef`，替代不了 eslint 但能拦住这一类。
- 中文默认允许在任意两个字之间断行：短标签（`游离糖上限`、`1g 蛋白`）会被断成两截，
  要么 `white-space: nowrap`，要么 `word-break: keep-all`。
- **`recompute()` 里不许把异常抛出去。** 它在 boot 的 `hydrateStore()` 里就会跑一次，
  抛出去 = 整个应用起不来，而且用户连设置抽屉都打不开、没法回去改那条数据。
  身体信息算不出目标时退回默认档案，把原因记进 `derived.profileError` 让界面去说。
  （`saveProfile` 有校验，但恢复备份和云端同步是绕过它直接落库的。）
- 启动失败要调 `__HEALTH_DIET_BOOT__.fail(err)`，**不要先 `clearEl(viewRoot)`**：
  启动页在 `#view` 里，摘掉之后 `showRecovery()` 会因为 `isConnected` 为 false
  直接返回，「修复缓存并重新打开」那个按钮就永远不出现了。
- 份量、克重这类会直接显示的数，取 min/max 时要留意另一侧是不是浮点——
  推荐里出现过 `海鲜粥 384.00000000000006g`，来源是「剩余热量 ÷ 每 100g 热量」。

## 约定

界面文案、代码注释、commit message 一律中文。commit 用 `feat:` / `fix:` + 中文摘要。

注释写「为什么」而不是「是什么」，通常是记录踩过的坑（看 `app.js` 的 `syncOnboarding`、
`diet.js` 的文件头注释）。新写的注释照这个来。
