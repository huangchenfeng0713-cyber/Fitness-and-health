from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected 1 occurrence, found {count}: {old[:90]!r}')
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement):
    text = read(path)
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{path}: regex expected 1 match: {pattern[:100]!r}')
    write(path, out)


# ---------------------------------------------------------------------------
# 健身页：把器械筛选真正写回 view，而不是渲染完再由 MutationObserver 搬 DOM。
training = 'js/views/training.js'
replace_once(training,
    "let equipFilter = 'all';\n",
    "let equipFilter = 'all';\n// 器械菜单属于纯界面状态：换器械会重绘，但菜单不应因此自动收起。\nlet equipMenuOpen = false;\n")
replace_once(training,
    "return h('div.range-switch.body-part-switch', null,",
    "return h('div.range-switch.body-part-switch.picker-scope-switch', null,")
replace_once(training,
    "return h('div.range-switch', null,\n    [['group', '身体部位'], ['split', '动作模式']]",
    "return h('div.range-switch.picker-mode-switch', null,\n    [['group', '身体部位'], ['split', '动作模式']]")
replace_once(training,
    "return h('div.range-switch', null,\n    SPLITS.map((sp)",
    "return h('div.range-switch.picker-scope-switch', null,\n    SPLITS.map((sp)")
replace_once(training,
    "const pickNode = h('span.ex-pick', null, chosen ? '✓' : marked ? '●' : '＋');\n  const clashNode = h('div.ex-clash-slot');",
    "const pickNode = h('span.ex-pick', null, chosen || marked ? '✓' : '＋');\n  const clashNode = h('span.ex-clash-slot', {\n    onclick: (event) => {\n      const detail = clashNode.dataset.detail;\n      if (!detail) return;\n      event.preventDefault();\n      event.stopPropagation();\n      toast(detail, 'info');\n    },\n  });")
replace_once(training,
    "pickNode.textContent = on ? '●' : '＋';",
    "pickNode.textContent = on ? '✓' : '＋';")
replace_once(training,
    "return clash.level === 'high'\n    ? { cls: 'ex-clash', text: `和「${clash.other.name}」重复` }\n    : { cls: 'ex-clash soft', text: `和「${clash.other.name}」部分重叠` };",
    "return clash.level === 'high'\n    ? { cls: 'ex-clash', badge: '重复', detail: `和「${clash.other.name}」重复` }\n    : { cls: 'ex-clash soft', badge: '重叠', detail: `和「${clash.other.name}」部分重叠` };")
replace_once(training,
    "clashNode.className = line ? `ex-clash-slot ${line.cls}` : 'ex-clash-slot';\n    clashNode.textContent = line ? line.text : '';",
    "clashNode.className = line ? `ex-clash-slot clash-badge ${line.cls}` : 'ex-clash-slot';\n    clashNode.textContent = line ? line.badge : '';\n    clashNode.dataset.detail = line ? line.detail : '';\n    clashNode.title = line ? line.detail : '';")

new_equip = r'''function equipMenu(rerender, all) {
  const active = EQUIP_FILTERS.find((f) => f.key === equipFilter) || EQUIP_FILTERS[0];
  return h('div.equip-filter-wrap', null,
    h('button.equip-filter-btn', {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': String(equipMenuOpen),
      onclick: (event) => {
        event.stopPropagation();
        equipMenuOpen = !equipMenuOpen;
        rerender();
      },
    },
    h('span', null, active.label),
    h('span.equip-filter-caret', { 'aria-hidden': 'true' }, '⌄')),
    equipMenuOpen ? h('div.equip-filter-menu', { role: 'menu', 'aria-label': '器械筛选' },
      EQUIP_FILTERS.map((f) => {
        const n = all.filter(f.match).length;
        const selected = equipFilter === f.key;
        return h('button.equip-filter-option', {
          class: `equip-filter-option${selected ? ' active' : ''}${n ? '' : ' empty'}`,
          type: 'button', role: 'menuitemradio', 'aria-checked': String(selected),
          onclick: (event) => {
            event.stopPropagation();
            equipFilter = f.key;
            showAllExercises = false;
            // 选一个器械后保持菜单展开，方便连续比较；点外部或筛选按钮才收起。
            equipMenuOpen = true;
            rerender();
          },
        },
        h('span', null, f.label),
        h('span.equip-filter-count', null, String(n)),
        h('span.equip-filter-check', { 'aria-hidden': 'true' }, selected ? '✓' : ''));
      })) : null);
}'''
regex_once(training,
    r"function equipTabs\(rerender, all\) \{.*?\n\}\n\nfunction pickerCard",
    new_equip + "\n\nfunction pickerCard")
replace_once(training,
    "const viewTabs = h('div.range-switch.picker-view-switch', null,",
    "const viewTabs = h('div.picker-view-switch.picker-list-tabs', null,")
replace_once(training,
    "h('span.card-tag', null, showRecommend\n          ? `${scopeLabel} · ${rec.items.length} 个`\n          : `${scopeLabel} · ${list.length} 个`),",
    "h('span.card-tag', null, showRecommend\n          ? `${rec.items.length} 个推荐`\n          : `${list.length} 个动作`),")
replace_once(training,
    "modeTabs(rerender),\n    byGroup ? groupTabs(rerender) : splitTabs(rerender),\n    equipTabs(rerender, all),\n    viewTabs,",
    "modeTabs(rerender),\n    byGroup ? groupTabs(rerender) : splitTabs(rerender),\n    h('div.picker-list-toolbar', null, viewTabs, equipMenu(rerender, all)),")
replace_once(training,
    "let rerenderTraining = () => {};\n",
    "let rerenderTraining = () => {};\n\n// 点菜单外部才关闭器械筛选；换器械本身不会把菜单折回去。\ndocument.addEventListener('click', (event) => {\n  if (!equipMenuOpen || event.target.closest?.('.equip-filter-wrap')) return;\n  equipMenuOpen = false;\n  rerenderTraining();\n});\n")
replace_once(training,
    "mount(root,\n    planCard(),\n    pickerCard(rerender),",
    "mount(root,\n    picked().length ? planCard() : null,\n    pickerCard(rerender),")

# ---------------------------------------------------------------------------
# ux-polish.js 不再接管健身 DOM。稳定交互全部由 training.js 自己渲染。
uxjs = 'js/ux-polish.js'
regex_once(uxjs,
    r"\nfunction enhanceTraining\(\) \{.*?\n\}\n\nfunction numberFrom",
    "\nfunction numberFrom")
replace_once(uxjs,
    "  enhanceHealthContext();\n  enhanceTraining();\n  enhanceImpactSplit();",
    "  enhanceHealthContext();\n  enhanceImpactSplit();")

# ---------------------------------------------------------------------------
# 健身控制区：三层信息层级；部位/推拉腿固定宽；筛选与列表标签同一行且悬浮。
uxcss = 'css/ux-polish.css'
new_training_css = r'''/* 12a/13a：健身挑选器由 training.js 原生渲染，不再做 DOM 二次改造。 */
.picker-mode-switch .chip-btn {
  flex: 1 1 0;
  min-height: 44px;
}
.picker-scope-switch {
  width: max-content;
  max-width: 100%;
  gap: 4px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.picker-scope-switch::-webkit-scrollbar { display: none; }
.picker-scope-switch .chip-btn {
  flex: 0 0 68px;
  min-width: 68px;
  min-height: 44px;
  padding: 6px 4px;
}

.picker-list-toolbar {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin-top: 10px;
  border-bottom: 1px solid var(--hairline);
}
.picker-view-switch {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 18px;
}
.picker-view-switch .chip-btn {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 2px 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
}
.picker-view-switch .chip-btn.active {
  color: var(--accent);
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--accent);
}

.equip-filter-wrap {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  padding-bottom: 5px;
}
.equip-filter-btn {
  min-height: 44px;
  max-width: 132px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.equip-filter-btn[aria-expanded='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}
.equip-filter-caret { font-size: 11px; transform: translateY(-1px); }
.equip-filter-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 5px);
  right: 0;
  width: min(278px, calc(100vw - 56px));
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .14);
}
.equip-filter-option {
  width: 100%;
  min-height: 44px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.equip-filter-option + .equip-filter-option { margin-top: 2px; }
.equip-filter-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.equip-filter-option.empty { opacity: .45; }
.equip-filter-count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.equip-filter-check { color: var(--accent); text-align: center; font-weight: 700; }

/* 重复原因本来就属于辅助信息：短标签常驻，点一下再看具体和谁冲突。 */
.ex-clash-slot.clash-badge {
  display: inline-flex;
  width: fit-content;
  margin-top: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  color: var(--warn);
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.35;
  cursor: pointer;
}
.ex-clash-slot.clash-badge.soft {
  color: var(--muted);
  background: var(--card-2);
}
'''
regex_once(uxcss,
    r"/\* 12a：器械筛选收进一个按钮，动作/推荐变成列表内的标签。 \*/.*?(?=/\* 4a：份量面板里的结构行和今日页用同一根碳水/脂肪刻度。 \*/)",
    new_training_css + "\n")

# 饮食页：搜索框独占一行，自定义入口放标题右侧。
with open(ROOT / uxcss, 'a', encoding='utf-8') as f:
    f.write(r'''

/* v2.10.1：高频搜索优先，自定义食物退到标题区。 */
.search-card-head .card-head-actions { gap: 7px; }
.search-card-head .text-btn {
  min-height: 36px;
  padding: 0 7px;
  font-size: 12.5px;
  white-space: nowrap;
}
.search-row.search-row-full .search-input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

/* 数据页只有在缺失/陈旧时才出现这条轻提示。 */
.health-sync-nudge {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline);
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.4;
}
.health-sync-nudge > span { flex: 1 1 auto; min-width: 0; }
.health-sync-nudge .text-btn {
  flex: none;
  min-height: 44px;
  padding: 0 6px;
  white-space: nowrap;
}

@media (max-width: 360px) {
  .picker-scope-switch { width: 100%; }
  .picker-scope-switch .chip-btn { flex-basis: 66px; min-width: 66px; }
  .picker-list-toolbar { gap: 6px; }
  .picker-view-switch { gap: 12px; }
  .equip-filter-btn { max-width: 116px; padding-inline: 8px; }
}
''')

# ---------------------------------------------------------------------------
# 饮食页布局。
diet = 'js/views/diet.js'
replace_once(diet,
    "h('div.card-head.search-card-head', null,\n      h('h3', null, '添加食物'),\n      h('span.card-tag', null, `${allFoods().length} 种`)),\n    h('div.search-row', null, nodes.searchInput, nodes.customToggle),",
    "h('div.card-head.search-card-head', null,\n      h('h3', null, '添加食物'),\n      h('div.card-head-actions', null,\n        h('span.card-tag', null, `${allFoods().length} 种`),\n        nodes.customToggle)),\n    h('div.search-row.search-row-full', null, nodes.searchInput),")

# ---------------------------------------------------------------------------
# 数据页：只有没同步/过旧时，在“今日健康数据”卡底部给一个轻量入口。
health = 'js/views/health.js'
replace_once(health,
    "import { h, clearEl, toast, mount } from '../lib/utils.js';",
    "import { h, clearEl, toast, mount, todayKey } from '../lib/utils.js';")
replace_once(health,
    "  listImplausibleDays, clearImplausibleHealth,\n} from '../lib/store.js';",
    "  listImplausibleDays, clearImplausibleHealth, state,\n} from '../lib/store.js';\nimport { setIntent } from '../lib/nav.js';")
health_helpers = r'''
function healthSyncNudge() {
  const at = new Date(state.lastImport?.at || '');
  const now = Date.now();
  const hasHistory = Array.isArray(state.healthDays) && state.healthDays.length > 0;
  let message = '';

  if (Number.isNaN(at.getTime())) {
    message = hasHistory ? '今天还没有新的健康同步。' : '还没有健康数据，可以先导入或连接同步。';
  } else if (todayKey(at) !== todayKey()) {
    message = '今天还没有同步健康数据。';
  } else if (now - at.getTime() > 3 * 60 * 60 * 1000 || state.derived?.energyData?.stale) {
    message = '健康数据已经有一段时间没更新。';
  }
  if (!message) return null;

  return h('div.health-sync-nudge', null,
    h('span', null, message),
    h('button.text-btn', {
      type: 'button',
      onclick: () => {
        setIntent({ settingsSection: 'data' });
        location.hash = 'settings';
      },
    }, '去同步 / 导入'));
}

function healthMetricsWithSync() {
  const card = healthMetricsCard();
  const nudge = healthSyncNudge();
  if (card && nudge) card.append(nudge);
  return card;
}
'''
replace_once(health,
    "\n\n\n\n\n\nexport function renderHealth(root) {",
    "\n" + health_helpers + "\nexport function renderHealth(root) {")
replace_once(health,
    "    healthMetricsCard(),",
    "    healthMetricsWithSync(),")

# ---------------------------------------------------------------------------
# 设置：一级名称更明确，并可接收数据页的一次性跳转意图。
settings = 'js/views/settings.js'
replace_once(settings,
    "import { state, saveProfile } from '../lib/store.js';",
    "import { state, saveProfile } from '../lib/store.js';\nimport { takeIntent } from '../lib/nav.js';")
replace_once(settings,
    "  { key: 'data', label: '数据管理' },",
    "  { key: 'data', label: '导入与备份' },")
replace_once(settings,
    "export function renderSettings(root) {\n  const rerender = () => renderSettings(root);\n  clearEl(root);",
    "export function renderSettings(root) {\n  const rerender = () => renderSettings(root);\n  const intent = takeIntent();\n  if (intent?.settingsSection && SECTIONS.some((x) => x.key === intent.settingsSection)) {\n    openSection = intent.settingsSection;\n  }\n  clearEl(root);")

# ---------------------------------------------------------------------------
# 版本统一为补丁版 2.10.1；同时刷新离线缓存键。
replace_once('package.json', '"version": "2.10.0"', '"version": "2.10.1"')
replace_once('js/core/feedback.js', "export const APP_VERSION = '2.10.0';", "export const APP_VERSION = '2.10.1';")
replace_once('sw.js', "const CACHE = 'health-diet-v2.10.0';", "const CACHE = 'health-diet-v2.10.1';")
replace_once('README.md',
    '当前版本：**v2.9.2**（健身待选横幅全屏铺开；统一碳水 / 脂肪比例的方向与视觉尺度）',
    '当前版本：**v2.10.1**（健身挑选器、数据同步入口与移动端交互精修）')
replace_once('css/ux-polish.css',
    '/* v2.10.0：高频交互与可读性精修。只覆盖视图层，不改变营养或训练算法。 */',
    '/* v2.10.1：高频交互与可读性精修。只覆盖视图层，不改变营养或训练算法。 */')

# ---------------------------------------------------------------------------
# 回归测试：以后不要再把器械筛选搬回 MutationObserver，也别让版本号再分叉。
test_path = ROOT / 'test/ui-source-contract.test.js'
test_path.write_text(r'''import test from 'node:test';
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

test('移动端挑动作控制区保持三层结构', () => {
  const training = text('js/views/training.js');
  assert.match(training, /picker-mode-switch/);
  assert.match(training, /picker-scope-switch/);
  assert.match(training, /picker-list-toolbar/);
  assert.doesNotMatch(training, /equipTabs\(rerender, all\)/);
});

test('应用版本与离线缓存键同步', () => {
  assert.match(text('package.json'), /"version": "2\.10\.1"/);
  assert.match(text('js/core/feedback.js'), /APP_VERSION = '2\.10\.1'/);
  assert.match(text('sw.js'), /health-diet-v2\.10\.1/);
  assert.match(text('README.md'), /当前版本：\*\*v2\.10\.1\*\*/);
});
''', encoding='utf-8')

print('UI usability patch applied successfully')
