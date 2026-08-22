/**
 * 饮食记录页
 *
 * 这一页做的是增量更新而不是整页重绘：搜索框、份量输入框这些
 * 承载焦点的节点一旦被拆掉重建，iOS 就会收起键盘、输入被打断。
 * 所以外壳只建一次（buildShell），之后只刷新会变的那几块容器。
 */

import { h, clearEl, num, toast, confirmAction, debounce, shiftDay, mount } from '../lib/utils.js';
import {
  state, addEntry, removeEntry, updateEntry, copyDay,
  allFoods, findFood, addCustomFood, removeCustomFood,
} from '../lib/store.js';
import { searchFoods, nutrientsFor, CATEGORIES, per100, unitLabel, portionTip, isEstimated } from '../data/foods.js';
import { MEALS, MEAL_LABEL, currentMeal } from '../core/advisor.js';

const ui = {
  query: '',
  meal: null,
  selected: null,
  grams: 100,
  unitIdx: 0,     // 选中的常用份量下标；等于 servings.length 时表示直接按克输入
  qty: 1,         // 份数
  showCustomForm: false,
};

/** 常驻 DOM 节点引用 */
const nodes = {};

const guessMeal = () => ui.meal || currentMeal().key;

/* ---------------------------------------------------------------- 外壳 */

function buildShell(root) {
  clearEl(root);

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
    nodes.quick, nodes.searchCard, nodes.entries);
  mount(root, nodes.root);
}

/* ---------------------------------------------------------------- 各区块 */

/** 顶部实时剩余额度，记账时随时能看到 */
function refreshQuick() {
  const d = state.derived;
  clearEl(nodes.quick);
  if (!d) return;
  const { kcal, protein } = d.advice.gaps;
  mount(nodes.quick, h('div.quick-strip', null,
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
  mount(nodes.favRow, h('div.fav-row', null,
    h('span.fav-label', null, '常吃'),
    favorites.map((f) => h('button.chip-btn', { onclick: () => selectFood(f) }, f.name))));
}

function refreshResults() {
  clearEl(nodes.results);
  refreshFav();
  if (!ui.query) return;

  const results = searchFoods(ui.query, allFoods(), 24);
  if (!results.length) {
    mount(nodes.results, h('p.empty-hint', null, '没找到。可以点「+ 自定义」按包装上的营养成分表新建一个。'));
    return;
  }
  mount(nodes.results, h('div.search-results', null, results.map((f) => {
    const p = per100(f);
    return h('button.search-item', { onclick: () => selectFood(f) },
      h('div.search-item-main', null,
        h('strong', null, f.name),
        h('span.search-item-meta', null, `${p.kcal} kcal · 蛋白 ${p.protein}g / 100g`)),
      h('div.search-item-tags', null,
        isEstimated(f) && h('span.chip.chip-est', { title: '该品牌未公开完整营养表，数值按同类食品推算' }, '估算'),
        h('span.chip', null, CATEGORIES[f.cat] || '自定义')));
  })));
}

function selectFood(food) {
  ui.selected = food;
  ui.unitIdx = 0;
  ui.qty = 1;
  ui.grams = food.s?.[0]?.[1] || 100;
  refreshPortion();
  nodes.portion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * 份量面板。
 *
 * 以「份数 × 常用单位」为主、克数为辅：没有厨房秤的人报不出
 * 「185 克」，但能说出「一碗」「半份」。旁边给出实物参照，
 * 想精确时再切到「克」自己填。
 */
function refreshPortion() {
  clearEl(nodes.portion);
  const food = ui.selected;
  if (!food) return;

  const p = per100(food);
  const servings = food.s || [['一份', 100]];
  const gramMode = () => ui.unitIdx >= servings.length;
  const step = () => (gramMode() ? 10 : 0.5);

  const computeGrams = () => (gramMode()
    ? Math.max(1, Math.round(ui.qty))
    : Math.max(1, Math.round(servings[ui.unitIdx][1] * ui.qty)));

  const qtyValue = h('span.qty-value');
  const qtyUnit = h('span.qty-unit');
  const gramsHint = h('div.grams-hint');
  const gramsInput = h('input.grams-input', {
    type: 'number', min: 1, step: 5, inputmode: 'numeric',
    'aria-label': '克数',
    // 输入过程中既不钳制也不回写：一旦在 oninput 里把值改回去，
    // 用户删到空的那一刻就会被填成 1，等于永远删不干净、改不了数。
    oninput: (e) => {
      const v = Number(e.target.value);
      if (e.target.value !== '' && Number.isFinite(v) && v > 0) ui.qty = v;
      syncReadouts({ writeInput: false });
    },
    // 收敛放到失焦时：这时用户已经输完，回填一个合法值才不打断输入
    onblur: (e) => {
      if (e.target.value === '' || !(Number(e.target.value) > 0)) {
        ui.qty = Math.max(1, Math.round(ui.grams) || 1);
      }
      syncReadouts();
    },
  });

  /**
   * 刷新读数。writeInput=false 时不回写克数输入框 ——
   * 用户正在里面打字，改它的 value 会把光标顶走、也让人删不掉内容。
   */
  function syncReadouts({ writeInput = true } = {}) {
    const typing = !writeInput || document.activeElement === gramsInput;
    const pending = gramMode() && gramsInput.value === '';
    if (!pending) ui.grams = computeGrams();

    const unit = gramMode() ? 'g' : unitLabel(servings[ui.unitIdx][0]);
    qtyValue.textContent = pending ? '—'
      : gramMode() ? String(ui.grams) : String(Number(ui.qty.toFixed(2)));
    qtyUnit.textContent = pending ? '' : unit;
    gramsHint.textContent = gramMode()
      ? `${p.kcal} kcal / 100g`
      : `≈ ${ui.grams} g`;
    if (gramMode() && !typing) gramsInput.value = ui.grams;
    refreshPreview(pending);
  }

  const bump = (dir) => {
    ui.qty = Math.max(step(), Number((ui.qty + dir * step()).toFixed(2)));
    syncReadouts();
    refreshQuickChips();
  };

  // 单位切换：食物自带的常用份量 + 一个「克」档
  const unitRow = h('div.unit-row', null,
    servings.map(([name, g], i) => h('button', {
      class: `chip-btn${ui.unitIdx === i ? ' active' : ''}`,
      onclick: () => {
        ui.unitIdx = i; ui.qty = 1;
        rebuildUnitRow(); syncReadouts(); refreshQuickChips(); toggleGramInput();
      },
    }, `${unitLabel(name)}（${g}g）`)),
    h('button', {
      class: `chip-btn${gramMode() ? ' active' : ''}`,
      onclick: () => {
        ui.unitIdx = servings.length; ui.qty = ui.grams;
        rebuildUnitRow(); syncReadouts(); refreshQuickChips(); toggleGramInput();
      },
    }, '按克输入'));

  function rebuildUnitRow() {
    [...unitRow.children].forEach((btn, i) => {
      const active = i === servings.length ? gramMode() : ui.unitIdx === i;
      btn.className = `chip-btn${active ? ' active' : ''}`;
    });
  }

  const quickChips = h('div.qty-quick');
  function refreshQuickChips() {
    const presets = gramMode() ? [50, 100, 150, 200, 300] : [0.5, 1, 1.5, 2, 3];
    mount(clearEl(quickChips), presets.map((v) => h('button', {
      class: `chip-btn${Math.abs(ui.qty - v) < 1e-6 ? ' active' : ''}`,
      onclick: () => { ui.qty = v; syncReadouts(); refreshQuickChips(); },
    }, gramMode() ? `${v}g` : `${v} ${unitLabel(servings[ui.unitIdx][0])}`)));
  }

  const gramInputWrap = h('div.gram-input-wrap', null,
    h('span', null, '克数'), gramsInput, h('span.unit', null, 'g'));
  function toggleGramInput() { gramInputWrap.hidden = !gramMode(); }

  nodes.preview = h('div.portion-preview');
  nodes.mealRow = h('div.portion-meal', null);
  const addBtn = h('button.primary-btn', null, `记录到${MEAL_LABEL[guessMeal()]}`);

  const refreshMealChips = () => {
    mount(clearEl(nodes.mealRow), MEALS.map((m) => h('button', {
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

  refreshMealChips();
  refreshQuickChips();
  toggleGramInput();

  mount(nodes.portion, h('div.portion-panel', null,
    h('div.portion-head', null,
      h('div', null,
        h('strong', null, food.name),
        isEstimated(food) && h('span.chip.chip-est', null, '估算'),
        h('span.chip', null, CATEGORIES[food.cat] || '自定义'),
        h('div.portion-per100', null,
          `每 100g：${p.kcal} kcal · 蛋白 ${p.protein}g · 脂肪 ${p.fat}g · 碳水 ${p.carb}g`)),
      h('button.icon-btn', {
        'aria-label': '取消',
        onclick: () => { ui.selected = null; refreshPortion(); },
      }, '×')),

    h('div.field-label', null, '吃了多少'),
    unitRow,

    h('div.qty-stepper', null,
      h('button.step-btn.round', { 'aria-label': '减少', onclick: () => bump(-1) }, '−'),
      h('div.qty-readout', null, qtyValue, qtyUnit, gramsHint),
      h('button.step-btn.round', { 'aria-label': '增加', onclick: () => bump(1) }, '+')),

    quickChips,
    gramInputWrap,

    h('p.portion-tip', null, portionTip(food)),
    isEstimated(food) && h('p.form-hint', null,
      '该品牌未公开完整营养表，以上数值按同类食品推算，用于估算参考。'),

    nodes.preview,
    h('div.field-label', null, '记到哪一餐'),
    nodes.mealRow,
    addBtn));

  syncReadouts();
}

function refreshPreview(pending = false) {
  if (!nodes.preview || !ui.selected) return;
  const n = pending
    ? { kcal: 0, protein: 0, fat: 0, carb: 0, sodium: 0 }
    : nutrientsFor(ui.selected, ui.grams);
  mount(clearEl(nodes.preview), 
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

  mount(nodes.customBox, h('div.custom-form', null,
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
    mount(nodes.entries, h('section.card', null,
      h('div.card-head', null, h('h3', null, '这一天的记录')),
      h('p.empty-hint', null, '还没有记录。搜索食物加进来，或者用下面的「和昨天一样」。'),
      copyRow()));
    return;
  }

  const grouped = {};
  for (const e of entries) (grouped[e.meal] ||= []).push(e);

  mount(nodes.entries, h('section.card', null,
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
          if (g > 0) { await updateEntry(e.id, { grams: g }); toast('已更新', 'ok'); return; }
          ev.target.value = num(e.grams);   // 清空或填了非法值就还原，别留个空框
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
  refreshQuick();
  refreshEntries();
}
