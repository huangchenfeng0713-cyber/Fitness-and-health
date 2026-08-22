/**
 * 饮食记录页
 *
 * 这一页做的是增量更新而不是整页重绘：搜索框、份量输入框这些
 * 承载焦点的节点一旦被拆掉重建，iOS 就会收起键盘、输入被打断。
 * 所以外壳只建一次（buildShell），之后只刷新会变的那几块容器。
 */

import { h, clearEl, num, toast, confirmAction, debounce, shiftDay } from '../lib/utils.js';
import {
  state, addEntry, removeEntry, updateEntry, copyDay,
  allFoods, findFood, addCustomFood, removeCustomFood,
} from '../lib/store.js';
import { searchFoods, nutrientsFor, CATEGORIES, per100 } from '../data/foods.js';
import { MEALS, MEAL_LABEL, currentMeal } from '../core/advisor.js';
import { dayNav } from './dashboard.js';

const ui = {
  query: '',
  meal: null,
  selected: null,
  grams: 100,
  showCustomForm: false,
};

/** 常驻 DOM 节点引用 */
const nodes = {};

const guessMeal = () => ui.meal || currentMeal().key;

/* ---------------------------------------------------------------- 外壳 */

function buildShell(root) {
  clearEl(root);

  nodes.dayNav = h('div.slot');
  nodes.quick = h('div.slot');
  nodes.favRow = h('div.slot');
  nodes.results = h('div.slot');
  nodes.portion = h('div.slot');
  nodes.customBox = h('div.slot');
  nodes.entries = h('div.slot');

  nodes.searchInput = h('input.search-input', {
    type: 'search',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    placeholder: '搜索食物，支持拼音',
    // 只刷新结果区，绝不重建这个 input 本身
    oninput: debounce((e) => {
      ui.query = e.target.value;
      refreshResults();
    }, 160),
  });

  nodes.customToggle = h('button.text-btn', {
    onclick: () => {
      ui.showCustomForm = !ui.showCustomForm;
      nodes.customToggle.textContent = ui.showCustomForm ? '收起' : '+ 自定义';
      refreshCustomForm();
    },
  }, '+ 自定义');

  nodes.searchCard = h('section.card', null,
    h('div.search-row', null, nodes.searchInput, nodes.customToggle),
    nodes.customBox,
    nodes.favRow,
    nodes.results,
    nodes.portion);

  nodes.root = h('div.view-stack', null,
    nodes.dayNav, nodes.quick, nodes.searchCard, nodes.entries);
  root.append(nodes.root);
}

/* ---------------------------------------------------------------- 各区块 */

function refreshDayNav() {
  clearEl(nodes.dayNav).append(dayNav());
}

/** 顶部实时剩余额度，记账时随时能看到 */
function refreshQuick() {
  const d = state.derived;
  clearEl(nodes.quick);
  if (!d) return;
  const { kcal, protein } = d.advice.gaps;
  nodes.quick.append(h('div.quick-strip', null,
    h('div.qs-item', null, h('span', null, '还可吃'),
      h('strong', { class: kcal.remaining < 0 ? 'neg' : '' }, `${num(kcal.remaining)} kcal`)),
    h('div.qs-item', null, h('span', null, '蛋白还差'),
      h('strong', { class: protein.remaining <= 0 ? 'pos' : '' }, `${num(Math.max(protein.remaining, 0), 1)} g`)),
    h('div.qs-item', null, h('span', null, '下一餐'),
      h('strong', null, `${MEAL_LABEL[d.advice.budget.meal.key]} ${num(d.advice.budget.kcal)} kcal`)),
  ));
}

function refreshFav() {
  clearEl(nodes.favRow);
  if (ui.query) return;
  const favorites = state.favorites.map(findFood).filter(Boolean).slice(0, 10);
  if (!favorites.length) return;
  nodes.favRow.append(h('div.fav-row', null,
    h('span.fav-label', null, '常吃'),
    favorites.map((f) => h('button.chip-btn', { onclick: () => selectFood(f) }, f.name))));
}

function refreshResults() {
  clearEl(nodes.results);
  refreshFav();
  if (!ui.query) return;

  const results = searchFoods(ui.query, allFoods(), 24);
  if (!results.length) {
    nodes.results.append(h('p.empty-hint', null, '没找到。可以点「+ 自定义」按包装上的营养成分表新建一个。'));
    return;
  }
  nodes.results.append(h('div.search-results', null, results.map((f) => {
    const p = per100(f);
    return h('button.search-item', { onclick: () => selectFood(f) },
      h('div.search-item-main', null,
        h('strong', null, f.name),
        h('span.search-item-meta', null, `${p.kcal} kcal · 蛋白 ${p.protein}g / 100g`)),
      h('span.chip', null, CATEGORIES[f.cat] || '自定义'));
  })));
}

function selectFood(food) {
  ui.selected = food;
  ui.grams = food.s?.[0]?.[1] || 100;
  refreshPortion();
  nodes.portion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function refreshPortion() {
  clearEl(nodes.portion);
  const food = ui.selected;
  if (!food) return;
  const p = per100(food);

  const gramsInput = h('input.grams-input', {
    type: 'number', value: ui.grams, min: 1, step: 5, inputmode: 'numeric',
    // 同理：改克数时只更新营养预览，不重建这个输入框
    oninput: (e) => {
      ui.grams = Math.max(1, Number(e.target.value) || 1);
      refreshPreview();
    },
  });

  const setGrams = (g) => {
    ui.grams = Math.max(1, Math.round(g));
    gramsInput.value = ui.grams;
    refreshPreview();
    refreshServingChips();
  };

  nodes.servingRow = h('div.portion-servings', null);
  nodes.preview = h('div.portion-preview');
  nodes.mealRow = h('div.portion-meal', null);
  const addBtn = h('button.primary-btn', null, `记录到${MEAL_LABEL[guessMeal()]}`);

  const refreshServingChips = () => {
    clearEl(nodes.servingRow).append(
      (food.s || []).map(([name, g]) => h('button', {
        class: `chip-btn${ui.grams === g ? ' active' : ''}`,
        onclick: () => setGrams(g),
      }, `${name} ${g}g`)),
      [50, 100, 150, 200].map((g) => h('button', {
        class: `chip-btn${ui.grams === g ? ' active' : ''}`,
        onclick: () => setGrams(g),
      }, `${g}g`)));
  };

  const refreshMealChips = () => {
    clearEl(nodes.mealRow).append(MEALS.map((m) => h('button', {
      class: `chip-btn${guessMeal() === m.key ? ' active' : ''}`,
      onclick: () => { ui.meal = m.key; refreshMealChips(); addBtn.textContent = `记录到${m.label}`; },
    }, m.label)));
  };

  addBtn.onclick = async () => {
    addBtn.disabled = true;
    await addEntry({
      foodId: food.id, grams: ui.grams, meal: guessMeal(),
      custom: food.custom ? food : null,
    });
    toast(`已记录 ${food.name} ${ui.grams}g`, 'ok');
    ui.selected = null;
    ui.query = '';
    nodes.searchInput.value = '';
    refreshResults();
    refreshPortion();
  };

  refreshServingChips();
  refreshMealChips();

  nodes.portion.append(h('div.portion-panel', null,
    h('div.portion-head', null,
      h('div', null,
        h('strong', null, food.name),
        h('span.chip', null, CATEGORIES[food.cat] || '自定义'),
        h('div.portion-per100', null,
          `每 100g：${p.kcal} kcal · 蛋白 ${p.protein}g · 脂肪 ${p.fat}g · 碳水 ${p.carb}g`)),
      h('button.icon-btn', {
        'aria-label': '取消',
        onclick: () => { ui.selected = null; refreshPortion(); },
      }, '×')),
    nodes.servingRow,
    h('div.portion-grams', null,
      h('button.step-btn', { onclick: () => setGrams(ui.grams - 10) }, '−10'),
      gramsInput,
      h('span.unit', null, 'g'),
      h('button.step-btn', { onclick: () => setGrams(ui.grams + 10) }, '+10')),
    nodes.preview,
    nodes.mealRow,
    addBtn));

  refreshPreview();
}

function refreshPreview() {
  if (!nodes.preview || !ui.selected) return;
  const n = nutrientsFor(ui.selected, ui.grams);
  clearEl(nodes.preview).append(
    h('div.np', null, h('strong', null, num(n.kcal)), h('span', null, 'kcal')),
    h('div.np', null, h('strong', null, num(n.protein, 1)), h('span', null, '蛋白 g')),
    h('div.np', null, h('strong', null, num(n.fat, 1)), h('span', null, '脂肪 g')),
    h('div.np', null, h('strong', null, num(n.carb, 1)), h('span', null, '碳水 g')),
    h('div.np', null, h('strong', null, num(n.sodium)), h('span', null, '钠 mg')));
}

function refreshCustomForm() {
  clearEl(nodes.customBox);
  if (!ui.showCustomForm) return;

  const fields = [
    ['name', '名称', 'text'],
    ['kcal', '热量 kcal', 'number'],
    ['protein', '蛋白 g', 'number'],
    ['fat', '脂肪 g', 'number'],
    ['carb', '碳水 g', 'number'],
    ['sodium', '钠 mg', 'number'],
  ];
  const inputs = {};
  const grid = h('div.form-grid', null, fields.map(([key, label, type]) => {
    const input = h('input', {
      type, placeholder: label, step: '0.1',
      inputmode: type === 'number' ? 'decimal' : 'text',
    });
    inputs[key] = input;
    return h('label.form-field', null, h('span', null, label), input);
  }));

  nodes.customBox.append(h('div.custom-form', null,
    h('p.form-hint', null, '按包装上的「营养成分表（每 100 克）」填写即可。'),
    grid,
    h('button.primary-btn', {
      onclick: async () => {
        const name = inputs.name.value.trim();
        const kcal = Number(inputs.kcal.value);
        if (!name || !Number.isFinite(kcal)) { toast('至少填写名称和每 100g 热量', 'warn'); return; }
        const food = await addCustomFood({
          name, alias: '', cat: 'other', custom: true,
          n: [kcal, Number(inputs.protein.value) || 0, Number(inputs.fat.value) || 0,
            Number(inputs.carb.value) || 0, 0, 0, Number(inputs.sodium.value) || 0],
          s: [['一份', 100]],
          f: [],
        });
        toast(`已添加「${name}」`, 'ok');
        ui.showCustomForm = false;
        nodes.customToggle.textContent = '+ 自定义';
        refreshCustomForm();
        selectFood(food);
      },
    }, '保存到我的食物库'),
    state.customFoods.length ? h('div.custom-list', null,
      state.customFoods.map((f) => h('span.custom-chip', null, f.name,
        h('button', {
          'aria-label': `删除 ${f.name}`,
          onclick: async () => { await removeCustomFood(f.id); refreshCustomForm(); },
        }, '×')))) : null,
  ));
}

function refreshEntries() {
  clearEl(nodes.entries);
  const order = MEALS.map((m) => m.key);
  const entries = [...state.dietEntries].sort(
    (a, b) => order.indexOf(a.meal) - order.indexOf(b.meal) || String(a.time).localeCompare(String(b.time)),
  );

  if (!entries.length) {
    nodes.entries.append(h('section.card', null,
      h('div.card-head', null, h('h3', null, '这一天的记录')),
      h('p.empty-hint', null, '还没有记录。搜索食物加进来，或者用下面的「和昨天一样」。'),
      copyRow()));
    return;
  }

  const grouped = {};
  for (const e of entries) (grouped[e.meal] ||= []).push(e);

  nodes.entries.append(h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '这一天的记录'),
      h('span.card-tag', null,
        `${num(entries.reduce((a, e) => a + e.kcal, 0))} kcal · 蛋白 ${num(entries.reduce((a, e) => a + e.protein, 0), 1)}g`)),
    Object.entries(grouped).map(([meal, list]) => h('div.meal-group', null,
      h('div.meal-group-head', null,
        h('strong', null, MEAL_LABEL[meal] || meal),
        h('span', null, `${num(list.reduce((a, e) => a + e.kcal, 0))} kcal`)),
      list.map(entryRow))),
    copyRow()));
}

function entryRow(e) {
  return h('div.entry-row', null,
    h('div.entry-main', null,
      h('div.entry-name', null, e.name),
      h('div.entry-meta', null,
        h('strong', null, `${num(e.kcal)} kcal`),
        ` · 蛋 ${num(e.protein, 1)} · 脂 ${num(e.fat, 1)} · 碳 ${num(e.carb, 1)} g`)),
    h('div.entry-actions', null,
      h('input.entry-grams', {
        type: 'number', value: num(e.grams), min: 1, step: 5, inputmode: 'numeric',
        'aria-label': `${e.name} 的克数`,
        // 用 change：输入过程中不落库，避免每敲一个数字就重算重绘
        onchange: async (ev) => {
          const g = Number(ev.target.value);
          if (g > 0) { await updateEntry(e.id, { grams: g }); toast('已更新', 'ok'); }
        },
      }),
      h('span.unit', null, 'g'),
      h('button.icon-btn.danger', {
        'aria-label': `删除 ${e.name}`,
        onclick: async () => { await removeEntry(e.id); toast('已删除'); },
      }, '×')));
}

function copyRow() {
  return h('div.copy-row', null,
    h('button.text-btn', {
      onclick: async () => {
        const n = await copyDay(shiftDay(state.day, -1));
        toast(n ? `已复制昨天的 ${n} 条记录` : '昨天没有记录', n ? 'ok' : 'warn');
      },
    }, '和昨天一样'),
    h('button.text-btn.danger', {
      onclick: async () => {
        if (!state.dietEntries.length) return;
        if (!confirmAction(`确定清空 ${state.day} 的全部 ${state.dietEntries.length} 条记录？`)) return;
        for (const e of [...state.dietEntries]) await removeEntry(e.id);
        toast('已清空');
      },
    }, '清空这一天'),
  );
}

/* ---------------------------------------------------------------- 入口 */

export function renderDiet(root) {
  // 外壳还挂在页面上就只做增量刷新，被别的页面清掉了才重建
  if (nodes.root?.parentNode !== root) {
    buildShell(root);
    refreshCustomForm();
    refreshResults();
    refreshPortion();
  }
  refreshDayNav();
  refreshQuick();
  refreshEntries();
}
