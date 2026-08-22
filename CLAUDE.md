# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 命令

```bash
npm test                                              # 全部测试（node --test，100 用例）
node --test test/nutrition.test.js                    # 单个文件
node --test --test-name-pattern='Katch' test/*.test.js  # 按用例名筛选
npm run serve                                         # python3 -m http.server 8080
```

**没有构建、没有依赖、没有 lint 配置。** `package.json` 里没有 `dependencies`，测试直接跑源码。
不要引入 npm 包、打包器或框架 —— 浏览器直接加载 `js/` 下的 ES 模块。

页面必须走 http(s)（ES 模块 + Module Worker），双击 `index.html` 打不开。

## 架构

### 三层纯度边界

| 层 | 能碰什么 | 谁能测 |
| --- | --- | --- |
| `js/core/*`、`js/data/foods.js` | 纯函数，无 DOM、无浏览器 API | 测试只 import 这两处 |
| `js/lib/*` | IndexedDB / Worker / DOM 工具 / SVG | 否 |
| `js/views/*` | 只做 DOM 渲染 | 否 |

新增的计算逻辑一律放 `core/`，否则写不了测试。视图里不要出现营养计算。

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

`DB_VERSION = 1`，四个 store：`health`（key 为 `YYYY-MM-DD`）、`diet`（自增 id + `date` 索引）、
`settings`（键值对）、`customFoods`。加 store 或索引要同时改 `DB_VERSION` 和 `onupgradeneeded`。

## 食物库的数据契约

`test/foods.test.js` 会强制以下约束，加食物前先看那个文件：

- `n` = 每 100g 的 `[热量kcal, 蛋白g, 脂肪g, 碳水g, 纤维g, 糖g, 钠mg]`，七项，全部非负。
- 热量与宏量自洽：`蛋白*4 + 脂肪*9 + (碳水-纤维)*4 + 纤维*2`，误差不超过 `max(25%, 12 kcal)`（`alcohol` 除外）。
- 纤维 ≤ 碳水，糖 ≤ 碳水。
- `s`（常用份量）非空，每份 0 < 克数 ≤ 1000；`cat` 必须在 `CATEGORIES` 里，且该分类要有 `PORTION_TIPS`。
- `cat: 'chain'` 的首个份量必须是品牌标准份（个 / 块 / 只 / 份 / 杯…），40~600g。
- 搜索同分时按数组里的录入顺序 —— 同品牌把主力单品排在配菜前面。
- **糖度是界面选项，不是多条记录。** 加 `tealevel` 标记，营养按全糖录入，`nutrientsFor` 按 `SUGAR_LEVELS`
  五档换算；奶的乳糖、珍珠芋圆的糖水、水果自带的糖放进 `sf`，这部分不随糖度归零。
- 品牌未公开完整营养表的打 `est`，界面会显示「估算」；茶饮除星巴克 / 瑞幸外一律 `est`。
- `freeSugarFactor` 按 WHO 游离糖定义：`fruit`/`veg` 必须是 0，`snack` 必须是 1。

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
- 新增 js 模块要加进 `sw.js` 的 `SHELL`（目前 `core/health-insights.js` 和 `lib/importer.js` 漏了）。

## 约定

界面文案、代码注释、commit message 一律中文。commit 用 `feat:` / `fix:` + 中文摘要。

注释写「为什么」而不是「是什么」，通常是记录踩过的坑（看 `app.js` 的 `syncOnboarding`、
`diet.js` 的文件头注释）。新写的注释照这个来。
