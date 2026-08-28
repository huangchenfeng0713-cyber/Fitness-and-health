/**
 * 饮食记录页
 *
 * 这一页做的是增量更新而不是整页重绘：搜索框、份量输入框这些
 * 承载焦点的节点一旦被拆掉重建，iOS 就会收起键盘、输入被打断。
 * 所以外壳只建一次（buildShell），之后只刷新会变的那几块容器。
 */

import {
  h, clearEl, num, toast, confirmAction, debounce, shiftDay, mount, infoTip, runLocalAction, copyText,
} from '../lib/utils.js';
import { macroBar } from '../lib/charts.js';
import { openSheet, closeSheet, sheetIsOpen } from '../lib/sheet.js';
import {
  state, addEntry, removeEntry, updateEntry, copyDay,
  allFoods, findFood, addCustomFood, removeCustomFood, portionMemory,
} from '../lib/store.js';
import {
  searchFoods, nutrientsFor, CATEGORIES, per100, unitLabel, portionTip, isEstimated,
  SUGAR_LEVELS, DEFAULT_SUGAR_LEVEL, hasSugarLevel, sugarLevel,
  hasFoodMix, defaultFoodMix, foodMixNutrition,
} from '../data/foods.js';
import { MEALS, MEAL_LABEL, currentMeal } from '../core/advisor.js';
import { initialPortion } from '../core/portion.js';
import { selectBar } from '../lib/select-bar.js';
import { APP_VERSION } from '../core/feedback.js';
import { recommendCard, waterCard } from './cards/meal-advice.js';

const ui = {
  query: '',
  category: null,
  meal: null,
  selected: null,
  grams: 100,
  unitIdx: 0,     // 选中的常用份量下标；等于 servings.length 时表示直接按 g/ml 输入
  qty: 1,         // 份数
  sugar: DEFAULT_SUGAR_LEVEL,   // 茶饮糖度
  mix: {},        // 清补凉等复合食物的 { foodId: g/ml }
  showCustomForm: false,
  historyOpen: false,   // 历史搜索是否展开
  moreResults: false,   // 搜索结果是否已展开全部
  /*
   * 待记录的一篮子。
   *
   * 一顿三菜一饭原先要 12 次操作：每样都得开一次份量弹层、记一次、再关掉。
   * 篮子里的项只在页面内存里，按「记录到X餐」才一次性落库。
   * 每项 { food, grams, sugarLevel } —— 份量取的是这个人自己记过的量
   * （portionMemory），没记过就用库里的第一档。
   */
  basket: [],
};

/** 常驻 DOM 节点引用 */
const nodes = {};

const guessMeal = () => ui.meal || currentMeal().key;

/** 搜索先出几条。剩下的点「显示更多」 */
const RESULT_PREVIEW = 10;

/* ---------------------------------------------------------------- 外壳 */

function buildShell(root) {
  clearEl(root);

  nodes.quick = h('div.slot');
  nodes.favRow = h('div.slot');
  nodes.categories = h('div.slot');
  nodes.results = h('div.slot');
  nodes.portion = h('div.slot');
  nodes.customBox = h('div.slot');
  nodes.entries = h('div.slot');
  nodes.water = h('div.slot');
  nodes.advice = h('div.slot');

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
      // 换了搜索词就收回「显示更多」，否则搜下一个词还是一次铺满
      ui.moreResults = false;
      if (ui.category) {
        ui.category = null;
        refreshCategories();
      }
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

  nodes.basketBar = selectBar({
    summary: () => `已选 ${ui.basket.length} 样 · ${basketTotals().kcal} kcal`,
    detail: () => `蛋白 ${basketTotals().protein}g`,
    actionLabel: () => `记录到${MEAL_LABEL[guessMeal()]}`,
    items: () => ui.basket.map((b) => ({
      key: b.food.id,
      label: b.food.name,
      note: `${b.grams}${b.food.basis === '100ml' ? 'ml' : 'g'} · ${Math.round(Number(nutrientsFor(b.food, b.grams, b.sugarLevel || undefined).kcal))} kcal`,
    })),
    onRemove: (id) => { removeFromBasket(id); refreshResults(); },
    onClear: () => { ui.basket = []; refreshResults(); },
    onConfirm: () => { recordBasket(); },
  });

  nodes.searchCard = h('section.card', null,
    h('div.card-head.search-card-head', null,
      h('h3', null, '饮食记录'),
      h('span.card-tag', null, `${allFoods().length} 种`)),
    h('div.search-row', null, nodes.searchInput, nodes.customToggle),
    nodes.customBox,
    nodes.favRow,
    nodes.categories,
    nodes.results,
    nodes.basketBar.el);

  nodes.root = h('div.view-stack', null,
    // 喝水放最上面：它是「点两下就完事」的动作，不该压在记录列表下面
    nodes.quick, nodes.water, nodes.searchCard, nodes.entries, nodes.advice);
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
    h('div.qs-item', null, h('span', null, '热量余量'),
      h('strong', { class: kcal.remaining < 0 ? 'neg' : '' }, `${num(kcal.remaining)} kcal`)),
    h('div.qs-item', null, h('span', null, '蛋白还差'),
      h('strong', { class: protein.remaining <= 0 ? 'pos' : '' }, `${num(Math.max(protein.remaining, 0), 1)} g`)),
    h('div.qs-item', null, h('span', null, '下一餐'),
      h('strong', null, `${MEAL_LABEL[d.advice.budget.meal.key]} ${num(d.advice.budget.kcal)} kcal`)),
  ));
}

/*
 * 历史搜索：记过的食物，点一下直接回到份量面板。
 *
 * 默认只露两行。这些名字长短差得很远（「米饭（白米）」和
 * 「肯德基 乒乒乓乓冰球杯（柠檬味）」不是一个量级），按个数截断会时多时少，
 * 所以用高度截断，再按实际有没有溢出决定要不要出「展开」。
 */
const HISTORY_LIMIT = 10;

function refreshFav() {
  clearEl(nodes.favRow);
  if (ui.query || ui.category) return;
  const history = state.favorites.map(findFood).filter(Boolean).slice(0, HISTORY_LIMIT);
  if (!history.length) return;
  const chips = h('div.fav-chips', { class: `fav-chips${ui.historyOpen ? '' : ' collapsed'}` },
    history.map((f) => h('button.chip-btn', { onclick: () => selectFood(f) }, f.name)));
  const toggle = h('button.text-btn.fav-toggle', {
    hidden: true,
    onclick: () => { ui.historyOpen = !ui.historyOpen; refreshFav(); },
  }, ui.historyOpen ? '收起' : '展开');
  mount(nodes.favRow, h('div.fav-row', null,
    h('span.fav-label', null, '历史搜索'),
    chips,
    toggle));
  // 折叠按钮只在真的放不下时出现——没溢出还挂个「展开」是骗人的
  toggle.hidden = !ui.historyOpen && chips.scrollHeight <= chips.clientHeight + 2;
}

function refreshCategories() {
  clearEl(nodes.categories);
  mount(nodes.categories, h('div.category-browser', null,
    h('span.category-label', null, '分类'),
    h('div.category-scroll', null,
      Object.entries(CATEGORIES).map(([key, label]) => h('button.chip-btn', {
        class: ui.category === key ? 'active' : '',
        onclick: () => {
          ui.category = ui.category === key ? null : key;
          ui.query = '';
          ui.moreResults = false;
          nodes.searchInput.value = '';
          refreshCategories();
          refreshResults();
        },
      }, label)))));
}

/**
 * 没在搜索时展示当下的推荐。
 * 记录页内容天然偏短，下方常空一大片；而这一页的用途就是记东西，
 * 把「现在该吃什么」放这儿既填了空白，也正好是用户要的下一步。
 */

/* ---------------------------------------------------------------- 多选篮子 */

const inBasket = (id) => ui.basket.some((b) => b.food.id === id);

/** 往篮子里放一样。份量用这个人自己记过的量，没记过就用库里第一档 */
function addToBasket(food) {
  if (inBasket(food.id)) return;
  const start = initialPortion(food, portionMemory());
  ui.basket = [...ui.basket, {
    food,
    grams: start.grams,
    // 茶饮的糖度在篮子里不逐项问，按默认；要改糖度就点开份量面板单独记
    sugarLevel: hasSugarLevel(food) ? DEFAULT_SUGAR_LEVEL : null,
  }];
}

const removeFromBasket = (id) => { ui.basket = ui.basket.filter((b) => b.food.id !== id); };

/** 篮子里这些加起来是多少 —— 按下记录之前能核对一眼 */
function basketTotals() {
  const total = { kcal: 0, protein: 0 };
  for (const b of ui.basket) {
    const n = nutrientsFor(b.food, b.grams, b.sugarLevel || undefined);
    total.kcal += Number(n.kcal) || 0;
    total.protein += Number(n.protein) || 0;
  }
  return { kcal: Math.round(total.kcal), protein: Math.round(total.protein) };
}

/** 一次把篮子里的全记下来 */
async function recordBasket() {
  const list = ui.basket;
  if (!list.length) return;
  const meal = guessMeal();
  const label = MEAL_LABEL[meal];
  let ok = 0;
  for (const b of list) {
    const levelLabel = b.sugarLevel && b.sugarLevel !== 'full' ? `（${sugarLevel(b.sugarLevel).label}）` : '';
    try {
      await addEntry({
        foodId: b.food.id, grams: b.grams, meal,
        sugarLevel: b.sugarLevel,
        name: b.food.name + levelLabel,
        custom: b.food.custom ? b.food : null,
      });
      ok += 1;
    } catch (err) {
      // 一条失败不该把剩下的也丢掉；最后统一报还剩几条没记上
      console.error('记录失败', b.food.name, err);
    }
  }
  const failed = list.length - ok;
  ui.basket = failed ? list.slice(ok) : [];
  ui.query = '';
  if (nodes.searchInput) nodes.searchInput.value = '';
  toast(failed ? `记下 ${ok} 样，还有 ${failed} 样没记上` : `已记录 ${ok} 样到${label}`, failed ? 'warn' : 'ok');
  refreshResults();
  refreshBasket();
}

function refreshBasket() {
  if (nodes.basketBar) nodes.basketBar.render();
}

function refreshResults() {
  clearEl(nodes.results);
  refreshFav();
  if (!ui.query && !ui.category) { refreshAdvice(); return; }
  refreshAdvice();

  /*
   * 先出十条。搜索是「我知道自己要什么」的场景：想找的那个基本落在前几条，
   * 一次铺二十几条只会把份量面板顶到屏幕外面，还得往回滚。
   * 剩下的点「显示更多」再出。
   */
  const all = ui.query
    ? searchFoods(ui.query, allFoods(), 60)
    : allFoods().filter((food) => food.cat === ui.category);
  const results = ui.moreResults ? all.slice(0, 60) : all.slice(0, RESULT_PREVIEW);
  if (!all.length) {
    mount(nodes.results,
      h('p.empty-hint', null, '没找到。可以点「+ 自定义」按包装上的营养成分表新建一个。'),
      feedbackLink(ui.query));
    return;
  }
  mount(nodes.results,
    ui.category && h('div.result-caption', null, `${CATEGORIES[ui.category]} · ${all.length} 项`),
    h('div.search-results', null, results.map((f) => {
    const p = per100(f);
    const basis = f.basis === '100ml' ? '100ml' : '100g';
    const chosen = inBasket(f.id);
    /*
     * 一行两个入口：
     *   点行本身  → 开份量面板，改完克数单独记（要调份量、选糖度时走这条）
     *   点右边的 ＋ → 直接进篮子，用你上次记的份量，不开弹层
     * 记一顿饭的时候按的都是 ＋，弹层一次都不用开。
     */
    return h('div.search-item-wrap', null,
      h('button.search-item', { type: 'button', onclick: () => selectFood(f) },
        h('div.search-item-main', null,
          h('strong', null, f.name),
          h('span.search-item-meta', null, `${p.kcal} kcal · 蛋白 ${p.protein}g / ${basis}`)),
        h('div.search-item-tags', null,
          isEstimated(f) && h('span.chip.chip-est', {
            title: '营养会随配方、烹调或品牌而变化，当前数值为估算参考',
          }, '估算'),
          h('span.chip', null, CATEGORIES[f.cat] || '自定义'))),
      h('button.search-item-add', {
        type: 'button',
        class: `search-item-add${chosen ? ' chosen' : ''}`,
        'aria-label': chosen ? `把 ${f.name} 移出待记录` : `把 ${f.name} 加入待记录`,
        'aria-pressed': String(chosen),
        onclick: () => {
          if (chosen) removeFromBasket(f.id); else addToBasket(f);
          refreshResults();
          refreshBasket();
        },
      }, chosen ? '✓' : '＋'));
    })),
    all.length > results.length ? h('button.more-btn', {
      onclick: () => { ui.moreResults = true; refreshResults(); },
    }, `显示更多（还有 ${all.length - results.length} 项）`) : null,
    ui.query ? feedbackLink(ui.query) : null);
}

/*
 * 「没找到？告诉我」。
 *
 * 食物库缺条目是这类应用最常见的挫败点，而用户当下就在搜索框前面 ——
 * 让他翻到设置页去写反馈，多半就算了。这里把当时搜的词一起带过去。
 */
function feedbackLink(query) {
  return h('button.text-btn.feedback-link', {
    onclick: async () => {
      const text = `【食物库缺条目】搜索词：${query || '（未填写）'}\n`
        + `应用版本：${APP_VERSION}\n请补充这个食物的名称、品牌和包装上的营养成分表。`;
      const ok = await copyText(text);
      toast(ok ? '已复制反馈模板，可粘贴发给作者' : '复制失败，请到设置页的「关于与反馈」提交', ok ? 'ok' : 'warn');
    },
  }, '没找到想要的？告诉我');
}

function selectFood(food) {
  ui.selected = food;
  refreshAdvice();
  ui.qty = 1;
  ui.sugar = DEFAULT_SUGAR_LEVEL;
  ui.mix = hasFoodMix(food) ? defaultFoodMix(food) : {};

  /*
   * 上次记的是多少，这次就默认多少。
   *
   * 库里那个「一碗 250g」是通用估值，各人的碗差得远；而克数是乘数，
   * 估错一倍热量就差一倍。改过一次之后按你的数来，比让应用继续猜要实在。
   *
   * 如果记住的量正好等于某个常用份量，就把那一档选中（显示「1 碗」比
   * 显示「250 克」好读）；对不上就落到按克输入那一档。
   */
  const start = initialPortion(food, portionMemory());
  ui.unitIdx = start.unitIdx;
  ui.grams = start.grams;
  ui.qty = start.qty;
  refreshPortion();
}

/**
 * 清补凉一类复合甜品不能只靠一个固定“每 100g”值：椰奶、豆类、芋圆和糖浆
 * 选不选，能让同一碗相差几百千卡。这里把每项原料独立开关和调量，并把最终
 * 原料快照随记录保存；之后在当天列表改总量时，store 会按比例缩放整份配方。
 */
function refreshMixedPortion(food) {
  const components = food.mix.components;
  const controllers = [];
  let currentMix = foodMixNutrition(food, ui.mix);

  nodes.preview = h('div.preview-slot');
  nodes.mealRow = h('div.portion-meal');
  const totalAmount = h('strong.mix-total-value');
  const totalKcal = h('strong.mix-total-value');
  const selectedCount = h('span.mix-selected-count');
  const addBtn = h('button.primary-btn', null, `记录到${MEAL_LABEL[guessMeal()]}`);

  const refreshMealChips = () => {
    mount(clearEl(nodes.mealRow), MEALS.map((m) => h('button', {
      class: `chip-btn${guessMeal() === m.key ? ' active' : ''}`,
      onclick: () => {
        ui.meal = m.key;
        refreshMealChips();
        addBtn.textContent = `记录到${m.label}`;
      },
    }, m.label)));
  };

  const syncTotals = () => {
    currentMix = foodMixNutrition(food, ui.mix);
    ui.grams = currentMix.grams;
    const amountText = Number.isInteger(currentMix.grams)
      ? num(currentMix.grams) : num(currentMix.grams, 1);
    totalAmount.textContent = `约 ${amountText} g`;
    totalKcal.textContent = `${num(currentMix.nutrients.kcal)} kcal`;
    selectedCount.textContent = `已选 ${currentMix.components.length}/${components.length} 项`;
    addBtn.disabled = currentMix.grams <= 0;
    refreshPreview(false, currentMix.nutrients);
  };

  const rows = components.map((component) => {
    const ingredient = findFood(component.foodId);
    const step = Math.max(1, Number(component.step) || 5);
    const max = Math.max(step, Number(component.max) || 1000);
    const unit = component.unit || (ingredient?.basis === '100ml' ? 'ml' : 'g');
    const suggested = Math.min(max, Math.max(step,
      Number(component.defaultGrams) || Number(ingredient?.s?.[0]?.[1]) || step));

    const toggle = h('button.mix-toggle', {
      type: 'button',
      'aria-label': `${component.label}：选择或取消`,
    });
    const input = h('input.mix-amount-input', {
      type: 'number', min: 0, max, step, inputmode: 'decimal',
      'aria-label': `${component.label}的${unit === 'ml' ? '毫升数' : '克数'}`,
    });
    const row = h('div.mix-row', null,
      toggle,
      h('div.mix-ingredient', null,
        h('strong', null, component.label),
        ingredient && h('span', null, `${per100(ingredient).kcal} kcal / 100${unit}`)),
      h('div.mix-amount-control', null,
        h('button.mix-step', {
          type: 'button', 'aria-label': `减少${component.label}`,
          onclick: () => setAmount((Number(ui.mix[component.foodId]) || 0) - step),
        }, '−'),
        input,
        h('span.mix-unit', null, unit),
        h('button.mix-step', {
          type: 'button', 'aria-label': `增加${component.label}`,
          onclick: () => setAmount((Number(ui.mix[component.foodId]) || 0) + step),
        }, '+')));

    const clampAmount = (value) => {
      const finite = Number.isFinite(Number(value)) ? Number(value) : 0;
      return Math.round(Math.min(max, Math.max(0, finite)) * 10) / 10;
    };
    const syncComponent = ({ writeInput = true } = {}) => {
      const amount = clampAmount(ui.mix[component.foodId]);
      ui.mix[component.foodId] = amount;
      const active = amount > 0;
      row.className = `mix-row${active ? ' active' : ''}`;
      toggle.className = `mix-toggle${active ? ' active' : ''}`;
      toggle.textContent = active ? '✓' : '+';
      toggle.setAttribute('aria-pressed', String(active));
      if (writeInput) input.value = String(amount);
    };
    function setAmount(value, { writeInput = true } = {}) {
      ui.mix[component.foodId] = clampAmount(value);
      syncComponent({ writeInput });
      syncTotals();
    }

    toggle.onclick = () => setAmount(Number(ui.mix[component.foodId]) > 0 ? 0 : suggested);
    input.oninput = (event) => {
      if (event.target.value === '') {
        ui.mix[component.foodId] = 0;
        syncComponent({ writeInput: false });
        syncTotals();
        return;
      }
      setAmount(event.target.value, { writeInput: false });
    };
    input.onblur = () => setAmount(input.value);

    syncComponent();
    controllers.push(syncComponent);
    return row;
  });

  addBtn.onclick = async () => {
    if (currentMix.grams <= 0) {
      toast('至少选择一种配料', 'warn');
      return;
    }
    const result = await runLocalAction(addBtn, () => addEntry({
      foodId: food.id,
      grams: currentMix.grams,
      meal: guessMeal(),
      name: food.name,
      nutrients: currentMix.nutrients,
      composition: currentMix.components,
    }), '记录食物');
    if (!result.ok) return;
    toast(`已记录 ${food.name}，${currentMix.components.length} 种配料`, 'ok');
    ui.selected = null;
    ui.mix = {};
    ui.query = '';
    nodes.searchInput.value = '';
    refreshResults();
    refreshPortion();
    refreshAdvice();
  };

  refreshMealChips();
  mount(nodes.portion, h('div.portion-panel.mix-picker', null,
    h('div.portion-head', null,
      h('div', null,
        h('strong', null, food.name),
        h('span.chip.chip-est', null, '按配料估算'),
        h('span.chip', null, CATEGORIES[food.cat]),
        h('div.portion-per100', null, '营养按当前选择逐项计算，不套用固定一碗。')),
      h('div.portion-head-actions', null,
        food.note && infoTip('查看估算说明', h('p', null, food.note)),
        h('button.icon-btn', {
          'aria-label': '取消',
          onclick: () => { ui.selected = null; refreshPortion(); refreshAdvice(); },
        }, '×'))),

    h('div.mix-summary', null,
      h('div', null, h('span', null, '当前总量'), totalAmount),
      h('div', null, h('span', null, '当前热量'), totalKcal)),
    h('div.mix-picker-head', null,
      h('div', null,
        h('div.field-label', null, food.mix.label || '配料与份量'),
        selectedCount),
      h('button.text-btn', {
        type: 'button',
        onclick: () => {
          ui.mix = defaultFoodMix(food);
          controllers.forEach((sync) => sync());
          syncTotals();
        },
      }, '恢复常见搭配')),
    h('p.form-hint.mix-help', null,
      '“+”加入配料，“✓”取消；也可以直接输入每项的克数或毫升数。总量按液体 1ml≈1g 估算。'),
    h('div.mix-grid', null, rows),

    nodes.preview,
    h('div.field-label', null, '记到哪一餐'),
    nodes.mealRow,
    h('div.sheet-action', null, addBtn)));

  syncTotals();
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
  /*
   * 份量面板住在公共弹层里（lib/sheet.js）。滚动穿透、背景锁定、Esc 关闭
   * 那几件事在那边统一处理过一次，这里只管往里填内容。
   */
  if (!food) { closeSheet(); return; }
  if (!sheetIsOpen()) {
    openSheet(nodes.portion, {
      label: '选择份量',
      // 点背景或按 Esc 关掉时，选中状态也要跟着清掉，否则再点同一个食物打不开
      onClose: () => { ui.selected = null; refreshAdvice(); },
    });
  }
  if (hasFoodMix(food)) {
    refreshMixedPortion(food);
    return;
  }

  const p = per100(food);
  const isLiquid = food.basis === '100ml';
  const servings = food.s || [['一份', 100]];
  const gramMode = () => ui.unitIdx >= servings.length;
  const step = () => (gramMode() ? 10 : 0.5);

  const computeGrams = () => (gramMode()
    ? Math.max(1, Math.round(ui.qty))
    : Math.max(1, Math.round(servings[ui.unitIdx][1] * ui.qty)));

  const qtyValue = h('span.qty-value');
  const qtyUnit = h('span.qty-unit');
  const gramsHint = h('div.grams-hint');
  const caffeineWarning = Number(food.caffeineMg) > 0 ? h('p.functional-warning') : null;
  const gramsInput = h('input.grams-input', {
    type: 'number', min: 1, step: 5, inputmode: 'numeric',
    // 建出来就带上初值：pending 判的是「用户把输入框清空了」，
    // 不是「这个框还没画」。少了这个初值，弹层以按克输入开场时
    // （记住的份量对不上任何一档）第一帧大读数是一道杠，
    // 而下面输入框里明明写着 420 —— 同一个面板里两个数对不上。
    value: String(ui.grams),
    'aria-label': isLiquid ? '毫升数' : '克数',
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

    const unit = gramMode() ? (isLiquid ? 'ml' : 'g') : unitLabel(servings[ui.unitIdx][0]);
    qtyValue.textContent = pending ? '—'
      : gramMode() ? String(ui.grams) : String(Number(ui.qty.toFixed(2)));
    qtyUnit.textContent = pending ? '' : unit;
    gramsHint.textContent = gramMode()
      ? `${p.kcal} kcal / ${isLiquid ? '100ml' : '100g'}`
      : `≈ ${ui.grams} ${isLiquid ? 'ml' : 'g'}`;
    if (caffeineWarning) {
      const caffeine = Math.round(Number(food.caffeineMg) * ui.grams / 100);
      caffeineWarning.textContent = `${caffeine >= 150 ? '高咖啡因 · ' : ''}本份约含 ${caffeine} mg 咖啡因。无糖版本也可能含咖啡因，临睡前及对咖啡因敏感时请慎选。`;
    }
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
    }, `${unitLabel(name)}（${g}${isLiquid ? 'ml' : 'g'}）`)),
    h('button', {
      class: `chip-btn${gramMode() ? ' active' : ''}`,
      onclick: () => {
        ui.unitIdx = servings.length; ui.qty = ui.grams;
        rebuildUnitRow(); syncReadouts(); refreshQuickChips(); toggleGramInput();
      },
    }, isLiquid ? '按毫升输入' : '按克输入'));

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
    }, gramMode() ? `${v}${isLiquid ? 'ml' : 'g'}` : `${v} ${unitLabel(servings[ui.unitIdx][0])}`)));
  }

  const gramInputWrap = h('div.gram-input-wrap', null,
    h('span', null, isLiquid ? '毫升数' : '克数'), gramsInput,
    h('span.unit', null, isLiquid ? 'ml' : 'g'));
  function toggleGramInput() { gramInputWrap.hidden = !gramMode(); }

  nodes.preview = h('div.preview-slot');
  nodes.mealRow = h('div.portion-meal', null);
  const addBtn = h('button.primary-btn', null, `记录到${MEAL_LABEL[guessMeal()]}`);

  // 茶饮的糖度：同一杯全糖和三分糖能差 100 多千卡，必须能选
  const sugarRow = hasSugarLevel(food) ? h('div.sugar-row') : null;
  const refreshSugarChips = () => {
    if (!sugarRow) return;
    mount(clearEl(sugarRow), SUGAR_LEVELS.map((l) => h('button', {
      class: `chip-btn${ui.sugar === l.key ? ' active' : ''}`,
      title: l.alias ? `也叫「${l.alias}」` : '',
      onclick: () => { ui.sugar = l.key; refreshSugarChips(); syncReadouts(); },
    }, l.alias ? `${l.label} / ${l.alias}` : l.label)));
  };
  refreshSugarChips();

  const refreshMealChips = () => {
    mount(clearEl(nodes.mealRow), MEALS.map((m) => h('button', {
      class: `chip-btn${guessMeal() === m.key ? ' active' : ''}`,
      onclick: () => { ui.meal = m.key; refreshMealChips(); addBtn.textContent = `记录到${m.label}`; },
    }, m.label)));
  };

  addBtn.onclick = async () => {
    const levelLabel = hasSugarLevel(food) && ui.sugar !== 'full'
      ? `（${sugarLevel(ui.sugar).label}）` : '';
    const result = await runLocalAction(addBtn, () => addEntry({
      foodId: food.id, grams: ui.grams, meal: guessMeal(),
      sugarLevel: hasSugarLevel(food) ? ui.sugar : null,
      name: food.name + levelLabel,
      custom: food.custom ? food : null,
    }), '记录食物');
    if (!result.ok) return;
    toast(`已记录 ${food.name}${levelLabel} ${ui.grams}${isLiquid ? 'ml' : 'g'}`, 'ok');
    ui.selected = null;
    ui.query = '';
    nodes.searchInput.value = '';
    refreshResults();
    refreshPortion();
    refreshAdvice();
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
          `每 ${isLiquid ? '100ml' : '100g'}：${p.kcal} kcal · 蛋白 ${p.protein}g · 脂肪 ${p.fat}g · 碳水 ${p.carb}g`)),
      h('div.portion-head-actions', null,
        food.note && infoTip('查看食物说明', h('p', null, food.note)),
        h('button.icon-btn', {
          'aria-label': '取消',
          onclick: () => { ui.selected = null; refreshPortion(); refreshAdvice(); },
        }, '×'))),

    sugarRow && h('div.field-label', null, '糖度'),
    sugarRow,

    h('div.field-label', null, food.cat === 'drink' ? '喝了多少' : '吃了多少'),
    unitRow,

    h('div.qty-stepper', null,
      h('button.step-btn.round', { 'aria-label': '减少', onclick: () => bump(-1) }, '−'),
      h('div.qty-readout', null, qtyValue, qtyUnit, gramsHint),
      h('button.step-btn.round', { 'aria-label': '增加', onclick: () => bump(1) }, '+')),

    quickChips,
    gramInputWrap,

    h('p.portion-tip', null, portionTip(food)),
    caffeineWarning,
    isEstimated(food) && h('p.form-hint', null,
      '营养会随配方、烹调或品牌而变化，以上数值为估算参考。'),

    nodes.preview,
    h('div.field-label', null, '记到哪一餐'),
    nodes.mealRow,
    h('div.sheet-action', null, addBtn)));

  syncReadouts();
}

/**
 * 记完这一笔之后，今日目标会推进到哪。
 *
 * 只报「这一份 386 kcal」没什么用 —— 真正要知道的是：现在 600，
 * 记完变 986，目标 1878。所以把「现在 → 记录后 / 目标」并排显示，
 * 进度条上再用半透明的第二段画出本次增量。
 */
function impactBlock(n) {
  const gaps = state.derived?.advice?.gaps;
  if (!gaps) return null;

  const rows = [
    ['热量', 'kcal', gaps.kcal, n.kcal, 'var(--accent)', 0, true],
    ['蛋白', 'g', gaps.protein, n.protein, 'var(--protein)', 1, false],
    ['碳水', 'g', gaps.carb, n.carb, 'var(--carb)', 1, false],
    ['脂肪上限', 'g', { ...gaps.fat, target: gaps.fat.upper || gaps.fat.target },
      n.fat, 'var(--accent)', 1, true],
  ];

  const kcalAfter = gaps.kcal.eaten + n.kcal;
  const overBy = Math.round(kcalAfter - gaps.kcal.target);
  const proteinAfterPct = gaps.protein.target > 0
    ? Math.round(((gaps.protein.eaten + n.protein) / gaps.protein.target) * 100) : 0;

  let note = null;
  if (overBy > 0) {
    note = h('p.impact-note.warn', null, `记下去会超出今日热量 ${overBy} kcal`);
  } else if (n.kcal > 0) {
    note = h('p.impact-note', null,
      `记下去还剩 ${Math.abs(overBy)} kcal，蛋白完成 ${proteinAfterPct}%`);
  }

  return h('div.impact-block', null,
    h('div.impact-title', null, h('span', null, '记录后 · 今日进度'), h('span', null, '现在 → 记录后 / 目标')),
    rows.map(([label, unit, g, add, color, dec, overIsBad]) => {
      const after = g.eaten + add;
      const pct = g.target > 0 ? (after / g.target) * 100 : 0;
      return h('div.impact-row', null,
        h('div.impact-head', null,
          h('span.impact-name', null, label),
          h('span.impact-from', null, num(g.eaten, dec)),
          h('span.impact-arrow', null, '→'),
          h('span.impact-to', { class: overIsBad && pct > 105 ? 'over' : '' }, num(after, dec)),
          h('span.impact-target', null, `/${num(g.target, 0)}${unit}`)),
        macroBar({ value: g.eaten, delta: add, target: g.target, color, overIsBad }));
    }),
    note);
}

function refreshPreview(pending = false, nutrientOverride = null) {
  if (!nodes.preview || !ui.selected) return;
  const n = nutrientOverride || (pending
    ? { kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, sodium: 0 }
    : nutrientsFor(ui.selected, ui.grams, ui.sugar));

  mount(clearEl(nodes.preview),
    h('div.portion-preview', null,
      h('div.np', null, h('strong', null, num(n.kcal)), h('span', null, 'kcal')),
      h('div.np', null, h('strong', null, num(n.protein, 1)), h('span', null, '蛋白 g')),
      h('div.np', null, h('strong', null, num(n.fat, 1)), h('span', null, '脂肪 g')),
      h('div.np', null, h('strong', null, num(n.carb, 1)), h('span', null, '碳水 g')),
      h('div.np', null, h('strong', null, num(n.sodium)), h('span', null, '钠 mg'))),
    pending ? null : impactBlock(n));
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
      h('div.card-head', null, h('h3', null, '饮食记录编辑')),
      h('p.empty-hint', null, '还没有记录。搜索食物加进来，或者用下面的「和昨天一样」。'),
      copyRow()));
    return;
  }

  const grouped = {};
  for (const e of entries) (grouped[e.meal] ||= []).push(e);

  mount(nodes.entries, h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '饮食记录编辑'),
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
  const isLiquid = findFood(e.foodId)?.basis === '100ml';
  const unit = isLiquid ? 'ml' : 'g';
  return h('div.entry-row', null,
    h('div.entry-main', null,
      h('div.entry-name', null, e.name,
        e.note && infoTip('查看配料与记录说明', h('p', null, e.note))),
      h('div.entry-meta', null,
        h('strong', null, `${num(e.kcal)} kcal`),
        ` · 蛋 ${num(e.protein, 1)} · 脂 ${num(e.fat, 1)} · 碳 ${num(e.carb, 1)} g`)),
    h('div.entry-actions', null,
      h('input.entry-grams', {
        type: 'number', value: num(e.grams), min: 1, step: 5, inputmode: 'numeric',
        'aria-label': `${e.name} 的${isLiquid ? '毫升数' : '克数'}`,
        // 用 change：输入过程中不落库，避免每敲一个数字就重算重绘
        onchange: async (ev) => {
          const input = ev.currentTarget;
          const g = Number(ev.target.value);
          if (g > 0) {
            const result = await runLocalAction(input, () => updateEntry(e.id, { grams: g }), '更新份量');
            if (result.ok) toast('已更新', 'ok');
            else input.value = num(e.grams);
            return;
          }
          input.value = num(e.grams);   // 清空或填了非法值就还原，别留个空框
        },
      }),
      h('span.unit', null, unit),
      h('button.icon-btn.danger', {
        'aria-label': `删除 ${e.name}`,
        onclick: async (ev) => {
          const result = await runLocalAction(ev.currentTarget, () => removeEntry(e.id), '删除记录');
          if (result.ok) toast('已删除');
        },
      }, '×')));
}

function copyRow() {
  return h('div.copy-row', null,
    h('button.text-btn', {
      onclick: async (ev) => {
        const result = await runLocalAction(ev.currentTarget,
          () => copyDay(shiftDay(state.day, -1)), '复制昨天记录');
        if (!result.ok) return;
        const n = result.value;
        toast(n ? `已复制昨天的 ${n} 条记录` : '昨天没有记录', n ? 'ok' : 'warn');
      },
    }, '和昨天一样'),
    h('button.text-btn.danger', {
      onclick: async (ev) => {
        if (!state.dietEntries.length) return;
        if (!confirmAction(`确定清空 ${state.day} 的全部 ${state.dietEntries.length} 条记录？`)) return;
        const result = await runLocalAction(ev.currentTarget, async () => {
          for (const e of [...state.dietEntries]) await removeEntry(e.id);
        }, '清空记录');
        if (result.ok) toast('已清空');
      },
    }, '清空这一天'),
  );
}

/* ---------------------------------------------------------------- 入口 */

/*
 * 「当前饮食推荐 / 现在别碰 / 喝水」从今日页搬过来。
 * 今日页回答「我今天怎么样」，这三张回答「我现在该做什么」——
 * 真要照着做的时候人已经在这一页了，隔着一次切页反而多余。
 */
function refreshAdvice() {
  clearEl(nodes.water);
  clearEl(nodes.advice);
  const rerender = () => refreshAdvice();
  mount(nodes.water, waterCard(rerender));
  // 正在搜索或正在调份量时不插推荐：那会儿人有明确目标，多两张卡只会把操作区顶下去
  if (ui.query || ui.selected) return;
  mount(nodes.advice, recommendCard(rerender));
}

export function renderDiet(root) {
  // 外壳还挂在页面上就只做增量刷新，被别的页面清掉了才重建
  if (nodes.root?.parentNode !== root) {
    buildShell(root);
    refreshCustomForm();
    refreshCategories();
    refreshResults();
    refreshPortion();
  }
  refreshQuick();
  refreshEntries();
  refreshAdvice();
}
