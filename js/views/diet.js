/** 饮食记录：搜索食物、按份量记账、编辑删除、常吃与"和昨天一样" */

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

function guessMeal() {
  return ui.meal || currentMeal().key;
}

/** 食物选择后的份量面板 */
function portionPanel(rerender) {
  const food = ui.selected;
  if (!food) return null;
  const nut = nutrientsFor(food, ui.grams);
  const p = per100(food);

  const setGrams = (g) => {
    ui.grams = Math.max(1, Math.round(g));
    rerender();
  };

  return h('div.portion-panel', null,
    h('div.portion-head', null,
      h('div', null,
        h('strong', null, food.name),
        h('span.chip', null, CATEGORIES[food.cat] || '自定义'),
        h('div.portion-per100', null, `每 100g：${p.kcal} kcal · 蛋白 ${p.protein}g · 脂肪 ${p.fat}g · 碳水 ${p.carb}g`)),
      h('button.icon-btn', { onclick: () => { ui.selected = null; rerender(); } }, '×')),

    h('div.portion-servings', null,
      (food.s || []).map(([name, g]) => h('button', {
        class: `chip-btn${ui.grams === g ? ' active' : ''}`,
        onclick: () => setGrams(g),
      }, `${name} ${g}g`)),
      [50, 100, 150, 200].map((g) => h('button', {
        class: `chip-btn${ui.grams === g ? ' active' : ''}`,
        onclick: () => setGrams(g),
      }, `${g}g`))),

    h('div.portion-grams', null,
      h('button.step-btn', { onclick: () => setGrams(ui.grams - 10) }, '−10'),
      h('input.grams-input', {
        type: 'number', value: ui.grams, min: 1, step: 5, inputmode: 'numeric',
        oninput: (e) => { ui.grams = Math.max(1, Number(e.target.value) || 1); renderNutrientPreview(); },
      }),
      h('span.unit', null, 'g'),
      h('button.step-btn', { onclick: () => setGrams(ui.grams + 10) }, '+10')),

    h('div.portion-preview', { id: 'portion-preview' }, nutrientPreview(nut)),

    h('div.portion-meal', null,
      MEALS.map((m) => h('button', {
        class: `chip-btn${guessMeal() === m.key ? ' active' : ''}`,
        onclick: () => { ui.meal = m.key; rerender(); },
      }, m.label))),

    h('button.primary-btn', {
      onclick: async () => {
        await addEntry({ foodId: food.id, grams: ui.grams, meal: guessMeal(), custom: food.custom ? food : null });
        toast(`已记录 ${food.name} ${ui.grams}g`, 'ok');
        ui.selected = null;
        ui.query = '';
        rerender();
      },
    }, `记录到${MEAL_LABEL[guessMeal()]}`),
  );
}

function nutrientPreview(nut) {
  return [
    h('div.np', null, h('strong', null, num(nut.kcal)), h('span', null, 'kcal')),
    h('div.np', null, h('strong', null, num(nut.protein, 1)), h('span', null, '蛋白 g')),
    h('div.np', null, h('strong', null, num(nut.fat, 1)), h('span', null, '脂肪 g')),
    h('div.np', null, h('strong', null, num(nut.carb, 1)), h('span', null, '碳水 g')),
    h('div.np', null, h('strong', null, num(nut.sodium)), h('span', null, '钠 mg')),
  ];
}

function renderNutrientPreview() {
  const box = document.getElementById('portion-preview');
  if (!box || !ui.selected) return;
  clearEl(box).append(...nutrientPreview(nutrientsFor(ui.selected, ui.grams)));
}

function searchPanel(rerender) {
  const results = searchFoods(ui.query, allFoods(), ui.query ? 24 : 0);
  const favorites = state.favorites.map(findFood).filter(Boolean).slice(0, 10);

  return h('section.card', null,
    h('div.search-row', null,
      h('input.search-input', {
        type: 'search',
        placeholder: '搜索食物，支持拼音',
        value: ui.query,
        oninput: debounce((e) => { ui.query = e.target.value; rerender(); }, 180),
      }),
      h('button.text-btn', { onclick: () => { ui.showCustomForm = !ui.showCustomForm; rerender(); } },
        ui.showCustomForm ? '收起' : '+ 自定义')),

    ui.showCustomForm && customFoodForm(rerender),

    !ui.query && favorites.length ? h('div.fav-row', null,
      h('span.fav-label', null, '常吃'),
      favorites.map((f) => h('button.chip-btn', {
        onclick: () => { ui.selected = f; ui.grams = f.s?.[0]?.[1] || 100; rerender(); },
      }, f.name))) : null,

    ui.query ? h('div.search-results', null,
      results.length
        ? results.map((f) => {
          const p = per100(f);
          return h('button.search-item', {
            onclick: () => { ui.selected = f; ui.grams = f.s?.[0]?.[1] || 100; rerender(); },
          },
          h('div.search-item-main', null,
            h('strong', null, f.name),
            h('span.search-item-meta', null, `${p.kcal} kcal · 蛋白 ${p.protein}g / 100g`)),
          h('span.chip', null, CATEGORIES[f.cat] || '自定义'));
        })
        : h('p.empty-hint', null, '没找到。可以点「+ 自定义」按包装上的营养成分表新建一个。'))
      : null,

    ui.selected && portionPanel(rerender),
  );
}

function customFoodForm(rerender) {
  const fields = [
    ['name', '名称', 'text', ''],
    ['kcal', '热量 kcal/100g', 'number', ''],
    ['protein', '蛋白 g', 'number', ''],
    ['fat', '脂肪 g', 'number', ''],
    ['carb', '碳水 g', 'number', ''],
    ['sodium', '钠 mg', 'number', ''],
  ];
  const inputs = {};
  const form = h('div.custom-form', null,
    h('p.form-hint', null, '按包装上的「营养成分表（每 100 克）」填写即可。'),
    h('div.form-grid', null, fields.map(([key, label, type]) => {
      const input = h('input', { type, placeholder: label, step: '0.1', inputmode: type === 'number' ? 'decimal' : 'text' });
      inputs[key] = input;
      return h('label.form-field', null, h('span', null, label), input);
    })),
    h('button.primary-btn', {
      onclick: async () => {
        const name = inputs.name.value.trim();
        const kcal = Number(inputs.kcal.value);
        if (!name || !Number.isFinite(kcal)) { toast('至少填写名称和每 100g 热量', 'warn'); return; }
        const food = await addCustomFood({
          name,
          alias: '',
          cat: 'other',
          custom: true,
          n: [kcal, Number(inputs.protein.value) || 0, Number(inputs.fat.value) || 0,
            Number(inputs.carb.value) || 0, 0, 0, Number(inputs.sodium.value) || 0],
          s: [['一份', 100]],
          f: [],
        });
        toast(`已添加「${name}」`, 'ok');
        ui.showCustomForm = false;
        ui.selected = food;
        ui.grams = 100;
        rerender();
      },
    }, '保存到我的食物库'),
    state.customFoods.length ? h('div.custom-list', null,
      state.customFoods.map((f) => h('span.custom-chip', null, f.name,
        h('button', {
          onclick: async () => { await removeCustomFood(f.id); rerender(); },
          title: '删除',
        }, '×')))) : null,
  );
  return form;
}

function entryList(rerender) {
  const entries = [...state.dietEntries].sort((a, b) => {
    const order = MEALS.map((m) => m.key);
    return order.indexOf(a.meal) - order.indexOf(b.meal) || String(a.time).localeCompare(String(b.time));
  });

  if (!entries.length) {
    return h('section.card', null,
      h('div.card-head', null, h('h3', null, '这一天的记录')),
      h('p.empty-hint', null, '还没有记录。搜索食物加进来，或者用下面的「和昨天一样」。'),
      copyRow(rerender));
  }

  const grouped = {};
  for (const e of entries) (grouped[e.meal] ||= []).push(e);

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '这一天的记录'),
      h('span.card-tag', null, `${num(entries.reduce((a, e) => a + e.kcal, 0))} kcal · 蛋白 ${num(entries.reduce((a, e) => a + e.protein, 0), 1)}g`)),
    Object.entries(grouped).map(([meal, list]) => h('div.meal-group', null,
      h('div.meal-group-head', null,
        h('strong', null, MEAL_LABEL[meal] || meal),
        h('span', null, `${num(list.reduce((a, e) => a + e.kcal, 0))} kcal`)),
      list.map((e) => h('div.entry-row', null,
        h('div.entry-main', null,
          h('div.entry-name', null, e.name),
          h('div.entry-meta', null,
            h('strong', null, `${num(e.kcal)} kcal`),
            ` · 蛋 ${num(e.protein, 1)} · 脂 ${num(e.fat, 1)} · 碳 ${num(e.carb, 1)} g`)),
        h('div.entry-actions', null,
          h('input.entry-grams', {
            type: 'number', value: num(e.grams), min: 1, step: 5, inputmode: 'numeric',
            title: '修改克数',
            onchange: async (ev) => {
              const g = Number(ev.target.value);
              if (g > 0) { await updateEntry(e.id, { grams: g }); toast('已更新', 'ok'); }
            },
          }),
          h('span.unit', null, 'g'),
          h('button.icon-btn.danger', {
            title: '删除',
            onclick: async () => { await removeEntry(e.id); toast('已删除'); },
          }, '×')))))),
    copyRow(rerender));
}

function copyRow(rerender) {
  return h('div.copy-row', null,
    h('button.text-btn', {
      onclick: async () => {
        const n = await copyDay(shiftDay(state.day, -1));
        toast(n ? `已复制昨天的 ${n} 条记录` : '昨天没有记录', n ? 'ok' : 'warn');
        rerender();
      },
    }, '和昨天一样'),
    h('button.text-btn.danger', {
      onclick: async () => {
        if (!state.dietEntries.length) return;
        if (!confirmAction(`确定清空 ${state.day} 的全部 ${state.dietEntries.length} 条记录？`)) return;
        for (const e of [...state.dietEntries]) await removeEntry(e.id);
        toast('已清空');
        rerender();
      },
    }, '清空这一天'),
  );
}

export function renderDiet(root) {
  const rerender = () => renderDiet(root);
  clearEl(root);
  root.append(
    dayNav(),
    quickStrip(),
    searchPanel(rerender),
    entryList(rerender),
  );
}

/** 顶部一条实时的剩余额度，记账时随时能看到 */
function quickStrip() {
  const d = state.derived;
  if (!d) return null;
  const { kcal, protein } = d.advice.gaps;
  return h('div.quick-strip', null,
    h('div.qs-item', null, h('span', null, '还可吃'), h('strong', { class: kcal.remaining < 0 ? 'neg' : '' }, `${num(kcal.remaining)} kcal`)),
    h('div.qs-item', null, h('span', null, '蛋白还差'), h('strong', { class: protein.remaining <= 0 ? 'pos' : '' }, `${num(Math.max(protein.remaining, 0), 1)} g`)),
    h('div.qs-item', null, h('span', null, '下一餐'), h('strong', null, `${MEAL_LABEL[d.advice.budget.meal.key]} ${num(d.advice.budget.kcal)} kcal`)),
  );
}
