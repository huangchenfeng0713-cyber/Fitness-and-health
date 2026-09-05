/**
 * 饮食记录页
 *
 * 这一页做的是增量更新而不是整页重绘：搜索框、份量输入框这些
 * 承载焦点的节点一旦被拆掉重建，iOS 就会收起键盘、输入被打断。
 * 所以外壳只建一次（buildShell），之后只刷新会变的那几块容器。
 */

import {
  h, clearEl, num, toast, confirmAction, debounce, shiftDay, mount, runLocalAction, copyText,
} from '../lib/utils.js';
import {
  listRow, searchField, weakTag, segmentedGroupProps, segmentedItemProps, collapseRow,
} from '../lib/ui.js';
import { icon, setIcon, ICON_SHAPES } from '../lib/icons.js';
import { macroBar, splitBar } from '../lib/charts.js';
import { openSheet, closeSheet, sheetIsOpen, setSheetFooter } from '../lib/sheet.js';
import {
  state, addEntry, removeEntry, updateEntry, copyDay, dayMealCounts,
  restoreEntry, allFoods, findFood, addCustomFood, removeCustomFood, portionMemory,
} from '../lib/store.js';
import {
  searchFoods, nutrientsFor, CATEGORIES, per100, unitLabel, portionTip,
  SUGAR_LEVELS, DEFAULT_SUGAR_LEVEL, hasSugarLevel, sugarLevel,
  hasFoodMix, defaultFoodMix, foodMixNutrition,
} from '../data/foods.js';
import { MEALS, MEAL_LABEL, currentMeal, focusFoods, FOCUS_LABEL } from '../core/advisor.js';
import { initialPortion } from '../core/portion.js';
import { macroSplit } from '../core/metrics.js';
import { mergeSameEntries } from '../core/diet-log.js';
import { selectBar } from '../lib/select-bar.js';
import { takeIntent } from '../lib/nav.js';
import { APP_VERSION } from '../core/feedback.js';
import { recommendCard, waterCard } from './cards/meal-advice.js';
import { estimateTag, foodInfoTip, estimateGroupInfoTip } from './cards/food-estimate.js';

const ui = {
  query: '',
  meal: null,
  selected: null,
  grams: 100,
  unitIdx: 0,     // 选中的常用份量下标；等于 servings.length 时表示直接按 g/ml 输入
  qty: 1,         // 份数
  sugar: DEFAULT_SUGAR_LEVEL,   // 茶饮糖度
  mix: {},        // 清补凉等复合食物的 { foodId: g/ml }
  showCustomForm: false,
  moreResults: false,   // 搜索结果是否已展开全部
  focus: null,          // 'protein' | 'fiber' —— 从今日页的提示跳过来时的筛选
  /*
   * 记录卡是不是在编辑态。
   *
   * 默认只看不改：这张卡大部分时候是拿来「核对今天吃了什么」的，
   * 而每行右边挂着一个可输入的克数框和一个红叉，滑动列表时很容易误触 ——
   * 删掉一条记录没有撤销。要改就先按一下「编辑」。
   */
  editEntries: false,
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

  nodes.results = h('div.slot');
  nodes.portion = h('div.slot');
  nodes.customBox = h('div.slot');
  nodes.entries = h('div.slot');
  nodes.water = h('div.slot');
  nodes.advice = h('div.slot');

  const search = searchField({
    ariaLabel: '搜索食物，支持中文或拼音',
    // 只刷新结果区，绝不重建这个 input 本身
    oninput: debounce((e) => {
      ui.query = e.target.value;
      // 换了搜索词就收回「显示更多」，否则搜下一个词还是一次铺满
      ui.moreResults = false;
      if (ui.focus) {
        ui.focus = null;
      }
      refreshResults();
    }, 160),
  });
  nodes.searchInput = search.input;
  nodes.searchField = search.el;

  nodes.customToggle = h('button.text-btn', {
    onclick: () => {
      ui.showCustomForm = !ui.showCustomForm;
      setCustomToggleLabel();
      refreshCustomForm();
    },
  }, icon('plus'), '自定义');

  nodes.basketBar = selectBar({
    /*
     * 摘要里带上「记到哪一餐」：确认键上只有一个勾，落到哪一餐得在别处说清楚。
     */
    summary: () => `饮食备选 ${ui.basket.length} 样 · ${basketTotals().kcal} kcal`,
    detail: () => `蛋白 ${basketTotals().protein}g`,
    actionLabel: () => `记录${ui.basket.length}样到${MEAL_LABEL[guessMeal()]}`,
    actionAriaLabel: () => `记录${ui.basket.length}样到${MEAL_LABEL[guessMeal()]}`,
    items: () => ui.basket.map((b) => ({
      key: b.food.id,
      label: b.food.name,
      tag: estimateTag(b.food),
      note: `${b.grams}${b.food.basis === '100ml' ? 'ml' : 'g'} · ${Math.round(Number((b.nutrients || nutrientsFor(b.food, b.grams, b.sugarLevel || undefined)).kcal))} kcal`,
    })),
    onRemove: (id) => { removeFromBasket(id); refreshResults(); },
    onClear: () => { ui.basket = []; refreshResults(); },
    onConfirm: () => { recordBasket(); },
  });

  nodes.searchCard = h('section.card.search-card', null,
    // 「饮食记录」这个名字让给下面那张真正列出记录的卡；这一张做的是「加一笔」
    h('div.card-head.search-card-head', null,
      h('h3', null, '添加食物'),
      h('div.card-head-actions', null,
        nodes.customToggle)),
    nodes.searchField,
    nodes.customBox,
    nodes.results,
    nodes.basketBar.el);

  nodes.root = h('div.view-stack', null,
    // 喝水放最上面：它是「点两下就完事」的动作，不该压在记录列表下面
    nodes.water, nodes.searchCard, nodes.entries, nodes.advice);
  mount(root, nodes.root);
}

/* ---------------------------------------------------------------- 各区块 */

/*
 * 顶部那条「热量余量 / 蛋白还差 / 下一餐预算」已删。
 *
 * 三个数在这一页各有更好的去处：份量面板本来就写着「记下这一笔会推进到哪」，
 * 那才是做决定的时刻；而「今天整体怎么样」是今日页的问题。
 * 摆在这儿只是把同一批数字提前念一遍，还把搜索框顶到了首屏之外。
 */

/** 今日提示可直接带着“补蛋白 / 补纤维”意图进入结果，不再额外铺分类按钮。 */
function pickFocus(focus = null) {
  ui.focus = focus;
  ui.query = '';
  ui.moreResults = false;
  if (nodes.searchInput) nodes.searchInput.value = '';
  refreshResults();
}

/**
 * 没在搜索时展示当下的推荐。
 * 记录页内容天然偏短，下方常空一大片；而这一页的用途就是记东西，
 * 把「现在该吃什么」放这儿既填了空白，也正好是用户要的下一步。
 */

/* ---------------------------------------------------------------- 多选篮子 */

const inBasket = (id) => ui.basket.some((b) => b.food.id === id);

/**
 * 往备选里放一样。份量、糖度、配料都由份量面板定好了才进来 ——
 * 这里不再自己猜一个量。
 *
 * `nutrients` / `composition` 只有复合甜品（清补凉那类）会带：
 * 它们的营养是按实际选中的原料算出来的，回头再按食物库反算会把选择丢掉。
 */
function addToBasket({ food, grams, sugarLevel = null, nutrients = null, composition = null }) {
  if (inBasket(food.id)) return;
  ui.basket = [...ui.basket, { food, grams, sugarLevel, nutrients, composition }];
}

const removeFromBasket = (id) => { ui.basket = ui.basket.filter((b) => b.food.id !== id); };

/** 篮子里这些加起来是多少 —— 按下记录之前能核对一眼 */
function basketTotals() {
  const total = { kcal: 0, protein: 0 };
  for (const b of ui.basket) {
    // 复合甜品自带算好的营养：按食物库反算会把「选了哪几样原料」丢掉
    const n = b.nutrients || nutrientsFor(b.food, b.grams, b.sugarLevel || undefined);
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
  const failedItems = [];
  for (const b of list) {
    const levelLabel = b.sugarLevel && b.sugarLevel !== 'full' ? `（${sugarLevel(b.sugarLevel).label}）` : '';
    try {
      await addEntry({
        foodId: b.food.id, grams: b.grams, meal,
        sugarLevel: b.sugarLevel,
        name: b.food.name + levelLabel,
        custom: b.food.custom ? b.food : null,
        ...(b.nutrients ? { nutrients: b.nutrients } : {}),
        ...(b.composition ? { composition: b.composition } : {}),
      });
      ok += 1;
    } catch (err) {
      // 一条失败不该把剩下的也丢掉；最后统一报还剩几条没记上
      console.error('记录失败', b.food.name, err);
      failedItems.push(b);
    }
  }
  const failed = failedItems.length;
  ui.basket = failedItems;
  ui.query = '';
  if (nodes.searchInput) nodes.searchInput.value = '';
  toast(failed ? `记下 ${ok} 样，还有 ${failed} 样没记上` : `已记录 ${ok} 样到${label}`, failed ? 'warn' : 'ok');
  refreshResults();
  refreshBasket();
}

/* 加号是图标，所以换文案不能再写 textContent —— 那会把图标一起抹掉。 */
function setCustomToggleLabel() {
  if (!nodes.customToggle) return;
  clearEl(nodes.customToggle);
  mount(nodes.customToggle, ui.showCustomForm ? '收起' : [icon('plus'), '自定义']);
}

/** 份量已经确认后，清掉弹层状态并回到搜索入口。 */
function finishPortion() {
  ui.selected = null;
  ui.mix = {};
  ui.query = '';
  nodes.searchInput.value = '';
  refreshResults();
  closeSheet({ force: true });
  refreshAdvice();
  refreshBasket();
}

/** 单项常用路径：不强迫先进入批量清单，确认份量后直接记到所选餐次。 */
async function recordOne(control, {
  food, grams, sugarLevel = null, nutrients = null, composition = null,
}) {
  const meal = guessMeal();
  const levelLabel = sugarLevel && sugarLevel !== 'full' ? `（${sugarLevelLabel(sugarLevel)}）` : '';
  const result = await runLocalAction(control, () => addEntry({
    foodId: food.id,
    grams,
    meal,
    sugarLevel,
    name: food.name + levelLabel,
    custom: food.custom ? food : null,
    ...(nutrients ? { nutrients } : {}),
    ...(composition ? { composition } : {}),
  }), '记录饮食');
  if (!result.ok) return;
  /*
   * 撤销必须由这里给出。
   *
   * 早先它挂在一个全局 click 监听里：按钮文字以「记录到」开头就算数，
   * 然后 rAF 轮询 state.dietEntries 最多 1800ms 去找刚写进去的那条。
   * 两个后果都真的会发生 —— 落库慢过 1800ms 就彻底没有撤销；
   * 而这里本来已经先弹过一次不带撤销的提示，那个监听再覆盖一次，
   * 同一次操作的提示会当着人的面改写一遍。
   * addEntry 本来就把新记录返回了（runLocalAction 原样放在 value 里），
   * 根本不用去 DOM 和 store 里找。
   */
  const entry = result.value;
  const unit = food.basis === '100ml' ? 'ml' : 'g';
  toast(`已记录到${MEAL_LABEL[meal]} · ${entry.name} ${num(entry.grams)}${unit}`, 'ok',
    entry.id == null ? null : { label: '撤销', onClick: () => removeEntry(entry.id) });
  finishPortion();
}

const sugarLevelLabel = (key) => sugarLevel(key)?.label || '';

/** 批量路径：当前这一项先放进本餐清单，继续搜索其它食物。 */
function queueOne(item) {
  addToBasket(item);
  finishPortion();
}

function refreshBasket() {
  if (nodes.basketBar) nodes.basketBar.render();
}

function refreshResults() {
  clearEl(nodes.results);
  if (!ui.query && !ui.focus) { refreshAdvice(); return; }
  refreshAdvice();

  /*
   * 先出十条。搜索是「我知道自己要什么」的场景：想找的那个基本落在前几条，
   * 一次铺二十几条只会把份量面板顶到屏幕外面，还得往回滚。
   * 剩下的点「显示更多」再出。
   */
  const all = ui.query
    ? searchFoods(ui.query, allFoods(), 60)
    : focusFoods(ui.focus, allFoods(), 60);
  const results = ui.moreResults ? all.slice(0, 60) : all.slice(0, RESULT_PREVIEW);
  if (!all.length) {
    mount(nodes.results,
      h('p.empty-hint', null, '没找到。可以点「+ 自定义」按包装上的营养成分表新建一个。'),
      feedbackLink(ui.query));
    return;
  }
  mount(nodes.results,
    /*
     * 说清这张表是按什么排的，否则「为什么鳕鱼排在鸡胸肉前面」没人猜得到。
     *
     * 前面那个可关闭的胶囊是**出口**。这一屏是从今日提示的「补蛋白」跳进来的，
     * 原先唯一的退出方式是往搜索框里打字（打字会顺手清掉 focus）——
     * 可谁也猜不到这一点，于是人就困在一列鳕鱼牛筋里出不去了。
     */
    ui.focus ? h('div.result-caption', null,
      h('button.focus-chip', {
        type: 'button',
        'aria-label': `退出「${FOCUS_LABEL[ui.focus]}」，回到推荐`,
        onclick: () => pickFocus(null),
      }, FOCUS_LABEL[ui.focus], icon('close', 'focus-chip-x')),
      h('span', null, `${all.length} 项，按每 100 kcal 含量从高到低`)) : null,
    h('div.search-results', null, results.map((f) => {
    const p = per100(f);
    const basis = f.basis === '100ml' ? '100ml' : '100g';
    const chosen = inBasket(f.id);
    /*
     * 整行就是「打开份量」。右侧再摆一个 ＋ 做同一件事，只会让人猜两者有何区别；
     * 已在本餐清单里的项才显示 ✓，它只负责移出，职责清楚。
     */
    return h('div.search-item-wrap', null,
      listRow({
        as: 'button', className: 'search-item',
        type: 'button', disabled: chosen,
        'aria-label': chosen ? `${f.name} 已在本餐清单` : `选择 ${f.name} 的份量`,
        onclick: () => selectFood(f),
      },
        h('div.search-item-main', null,
          h('strong', null, f.name),
          h('span.search-item-meta', null, `${p.kcal} kcal · 蛋白 ${p.protein}g / ${basis}`)),
        // 分类（肉禽 / 菜肴外卖…）不写：挑食物时它不参与判断，
        // 一列结果每行挂一个灰块，比食物名还抢眼
        h('div.search-item-tags', null, estimateTag(f))),
      chosen ? h('button.search-item-remove', {
        type: 'button',
        'aria-label': `把 ${f.name} 移出本餐清单`,
        onclick: () => {
          removeFromBasket(f.id);
          refreshResults();
          refreshBasket();
        },
      }, icon('check')) : null);
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
  /*
   * 糖度和餐次也照记忆来。
   *
   * 糖度只在这个食物有档位时才用得上；餐次只在这次还没手动选过餐次时才让位 ——
   * 用户如果已经在备选条上选了「记到晚餐」，不能因为下一样食物平时是早餐吃的
   * 就把整批拽回早餐。没有记忆时仍然按钟点猜。
   */
  if (start.sugarLevel && hasSugarLevel(food)) ui.sugar = start.sugarLevel;
  if (start.meal && !ui.meal && !ui.basket.length) ui.meal = start.meal;
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
  const directBtn = h('button.primary-btn', null);
  const queueBtn = h('button.secondary-btn', null, '继续添加');

  const refreshMealChips = () => {
    mount(clearEl(nodes.mealRow), MEALS.map((m) => h('button', {
      class: `chip-btn${guessMeal() === m.key ? ' active' : ''}`,
      ...segmentedItemProps(guessMeal() === m.key, 'radio'),
      onclick: () => { ui.meal = m.key; refreshMealChips(); refreshBasket(); },
    }, m.label)));
    directBtn.textContent = ui.basket.length
      ? '加入本餐清单'
      : `记录到${MEAL_LABEL[guessMeal()]}`;
  };

  const syncTotals = () => {
    currentMix = foodMixNutrition(food, ui.mix);
    ui.grams = currentMix.grams;
    const amountText = Number.isInteger(currentMix.grams)
      ? num(currentMix.grams) : num(currentMix.grams, 1);
    totalAmount.textContent = `约 ${amountText} g`;
    totalKcal.textContent = `${num(currentMix.nutrients.kcal)} kcal`;
    selectedCount.textContent = `已选 ${currentMix.components.length}/${components.length} 项`;
    directBtn.disabled = currentMix.grams <= 0;
    queueBtn.disabled = currentMix.grams <= 0;
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
        }, icon('minus')),
        input,
        h('span.mix-unit', null, unit),
        h('button.mix-step', {
          type: 'button', 'aria-label': `增加${component.label}`,
          onclick: () => setAmount((Number(ui.mix[component.foodId]) || 0) + step),
        }, icon('plus'))));

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
      setIcon(toggle, active ? 'check' : 'plus');
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

  const item = () => ({
    food,
    grams: currentMix.grams,
    nutrients: currentMix.nutrients,
    composition: currentMix.components,
  });
  directBtn.onclick = () => {
    if (currentMix.grams <= 0) {
      toast('至少选择一种配料', 'warn');
      return;
    }
    if (ui.basket.length) queueOne(item());
    else recordOne(directBtn, item());
  };
  queueBtn.onclick = () => queueOne(item());

  refreshMealChips();
  const action = h(`div.sheet-action${ui.basket.length ? '' : '.dual'}`, null,
    ui.basket.length ? null : queueBtn,
    directBtn);

  mount(nodes.portion, h('div.portion-panel.mix-picker', null,
    h('div.portion-head', null,
      h('div.portion-head-main', null,
        h('div.portion-title-line', null,
          h('strong', null, food.name),
          estimateTag(food)),
        h('div.portion-per100', null, '营养按当前选择逐项计算，不套用固定一碗。')),
      h('div.portion-head-actions', null,
        foodInfoTip(food, { label: '查看估算依据与误差' }),
        h('button.icon-btn', {
          'aria-label': '取消',
          onclick: () => closeSheet(),
        }, icon('close')))),

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
    nodes.mealRow));
  setSheetFooter(action);

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
  // 程序自己收场（切页重建外壳时选中态是空的），不是用户在关它 —— 这一下必须落地：
  // nodes.portion 上面刚 clearEl 过，被开场闸门挡下来就会留一层空弹层钉在屏幕上
  if (!food) { closeSheet({ force: true }); return; }
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
    directBtn.disabled = pending;
    queueBtn.disabled = pending;
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

  /*
   * 快捷份量只在「按克输入」时出现。
   *
   * 按份数选的时候，0.5 / 1 / 1.5 / 2 / 3 就是步进器按几下的结果 ——
   * 同一个数字给两套控件，中间还夹着步进器本身，三层加起来在 390px 上
   * 占掉约 450px，「记下这一笔会推进到哪」被顶到首屏之外。
   * 按克的 50 / 100 / 150 / 200 / 300 不一样：步长是 10，那几个是真的快捷键。
   */
  const quickChips = h('div.qty-quick', segmentedGroupProps('快捷份量', 'radio'));
  function refreshQuickChips() {
    quickChips.hidden = !gramMode();
    if (!gramMode()) { clearEl(quickChips); return; }
    mount(clearEl(quickChips), [50, 100, 150, 200, 300].map((v) => h('button', {
      class: `chip-btn${Math.abs(ui.qty - v) < 1e-6 ? ' active' : ''}`,
      ...segmentedItemProps(Math.abs(ui.qty - v) < 1e-6, 'radio'),
      onclick: () => { ui.qty = v; syncReadouts(); refreshQuickChips(); },
    }, `${v}${isLiquid ? 'ml' : 'g'}`)));
  }

  const gramInputWrap = h('div.gram-input-wrap', null,
    h('span', null, isLiquid ? '毫升数' : '克数'), gramsInput,
    h('span.unit', null, isLiquid ? 'ml' : 'g'));
  function toggleGramInput() { gramInputWrap.hidden = !gramMode(); }

  nodes.preview = h('div.preview-slot');
  nodes.mealRow = h('div.portion-meal', segmentedGroupProps('记到哪一餐', 'radio'));
  const directBtn = h('button.primary-btn', null);
  const queueBtn = h('button.secondary-btn', null, '继续添加');

  // 茶饮的糖度：同一杯全糖和三分糖能差 100 多千卡，必须能选
  const sugarRow = hasSugarLevel(food) ? h('div.sugar-row', segmentedGroupProps('糖度', 'radio')) : null;
  const refreshSugarChips = () => {
    if (!sugarRow) return;
    mount(clearEl(sugarRow), SUGAR_LEVELS.map((l) => h('button', {
      class: `chip-btn${ui.sugar === l.key ? ' active' : ''}`,
      ...segmentedItemProps(ui.sugar === l.key, 'radio'),
      title: l.alias ? `也叫「${l.alias}」` : '',
      onclick: () => { ui.sugar = l.key; refreshSugarChips(); syncReadouts(); },
    }, l.alias ? `${l.label} / ${l.alias}` : l.label)));
  };
  refreshSugarChips();

  /*
   * 餐次是**整批**的选择，不是每样各选一次：备选里这几样按一次勾一起落库。
   * 所以这里选的是「这一批记到哪一餐」，备选条上也写着同一个答案。
   */
  const refreshMealChips = () => {
    mount(clearEl(nodes.mealRow), MEALS.map((m) => h('button', {
      class: `chip-btn${guessMeal() === m.key ? ' active' : ''}`,
      ...segmentedItemProps(guessMeal() === m.key, 'radio'),
      onclick: () => { ui.meal = m.key; refreshMealChips(); refreshBasket(); },
    }, m.label)));
    directBtn.textContent = ui.basket.length
      ? '加入本餐清单'
      : `记录到${MEAL_LABEL[guessMeal()]}`;
  };

  const item = () => ({
    food,
    grams: ui.grams,
    sugarLevel: hasSugarLevel(food) ? ui.sugar : null,
  });
  directBtn.onclick = () => {
    if (ui.basket.length) queueOne(item());
    else recordOne(directBtn, item());
  };
  queueBtn.onclick = () => queueOne(item());

  refreshMealChips();
  refreshQuickChips();
  toggleGramInput();

  const action = h(`div.sheet-action${ui.basket.length ? '' : '.dual'}`, null,
    ui.basket.length ? null : queueBtn,
    directBtn);

  mount(nodes.portion, h('div.portion-panel', null,
    h('div.portion-head', null,
      h('div.portion-head-main', null,
        h('div.portion-title-line', null,
          h('strong', null, food.name),
          estimateTag(food)),
        h('div.portion-per100', null,
          `每 ${isLiquid ? '100ml' : '100g'}：${p.kcal} kcal · 蛋白 ${p.protein}g · 脂肪 ${p.fat}g · 碳水 ${p.carb}g`)),
      h('div.portion-head-actions', null,
        foodInfoTip(food, { label: '查看食物依据与误差' }),
        h('button.icon-btn', {
          'aria-label': '取消',
          onclick: () => closeSheet(),
        }, icon('close')))),

    sugarRow && h('div.field-label', null, '糖度'),
    sugarRow,

    h('div.field-label', null, food.cat === 'drink' ? '喝了多少' : '吃了多少'),
    unitRow,

    h('div.qty-stepper', null,
      h('button.step-btn.round', { 'aria-label': '减少', onclick: () => bump(-1) }, icon('minus')),
      h('div.qty-readout', null, qtyValue, qtyUnit, gramsHint),
      h('button.step-btn.round', { 'aria-label': '增加', onclick: () => bump(1) }, icon('plus'))),

    quickChips,
    gramInputWrap,

    h('p.portion-tip', null, portionTip(food)),
    caffeineWarning,

    nodes.preview,
    h('div.field-label', null, '记到哪一餐'),
    nodes.mealRow));
  setSheetFooter(action);

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
    impactSplitRow(n),
    note);
}

/*
 * 碳水和脂肪合用一根刻度，和今日主卡是同一根。
 *
 * 分成两行画时它们能同时「在范围内」而总量对不上账（主卡上量到过 796 kcal 的差），
 * 所以这里也只画一根：横轴是碳水占这块热量的百分比。
 *
 * 这段一度长在一个 MutationObserver 里，靠 `.impact-to` 的文本把两个数字
 * 再读回来算一遍 —— 而 n 和 gaps 就在手边。回读一旦碰上改文案、换单位、
 * 数字带千分位就会静默失效，界面上只表现为「那一行忽然变回两行」。
 */
function impactSplitRow(n) {
  const gaps = state.derived?.advice?.gaps;
  const targets = state.derived?.targets;
  if (!gaps || !targets) return null;
  const split = macroSplit(targets, {
    ...gaps,
    carb: { ...gaps.carb, eaten: gaps.carb.eaten + n.carb },
    fat: { ...gaps.fat, eaten: gaps.fat.eaten + n.fat },
  });
  return h('div.impact-split-row', null,
    h('div.impact-split-head', null,
      h('span', null, '碳水 / 脂肪'),
      h('strong', null, split.carbPct == null ? '—' : `${split.carbPct}% / ${split.fatPct}%`),
      h('span', null, split.label)),
    splitBar({
      carbPct: split.carbPct,
      carbBandLo: split.bandLo,
      carbBandHi: split.bandHi,
      level: split.level,
    }),
    h('div.impact-split-grams', null,
      h('span', null, `碳水 ${num(split.carbG)}g`),
      h('span', null, split.note),
      h('span', null, `脂肪 ${num(split.fatG)}g`)));
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

/*
 * 自定义食物的编辑草稿。
 *
 * 模块级而不是 refreshCustomForm 的局部变量：后台任何一次落库都会重跑
 * renderDiet，填了一半的表单不能就这么没了。id 非空表示在改一条已有的，
 * 保存时沿用同一个 id —— 否则「改一个数」会变成「多出一条重名食物」，
 * 而旧记录还指着旧 id。
 */
const customDraft = { id: null, energyUnit: 'kcal' };

/* 标签上写 kJ 的比写 kcal 的多。1 kcal = 4.184 kJ（GB 28050 用的就是这个数）。 */
const KJ_PER_KCAL = 4.184;

function resetCustomDraft() {
  customDraft.id = null;
  customDraft.energyUnit = 'kcal';
}

const CUSTOM_NUM_FIELDS = [
  ['protein', '蛋白 g', 0],
  ['fat', '脂肪 g', 1],
  ['carb', '碳水 g', 2],
  ['fiber', '膳食纤维 g', 3],
  ['sugar', '糖 g', 4],
  ['sodium', '钠 mg', 5],
];

function refreshCustomForm() {
  clearEl(nodes.customBox);
  if (!ui.showCustomForm) return;

  const editing = customDraft.id
    ? state.customFoods.find((f) => f.id === customDraft.id)
    : null;
  if (customDraft.id && !editing) resetCustomDraft();

  const n = editing?.n || [];
  const inputs = {};
  const numInput = (key, label, value) => {
    const input = h('input', {
      type: 'number', placeholder: label, step: '0.1', inputmode: 'decimal',
      value: value == null ? '' : String(value),
    });
    inputs[key] = input;
    return h('label.form-field', null, h('span', null, label), input);
  };

  inputs.name = h('input', {
    type: 'text', placeholder: '名称', value: editing?.name || '',
  });

  /*
   * 能量那一格自带单位开关：点一下在 kcal / kJ 之间切，已经填的数字跟着换算。
   * 换算而不是清空 —— 照着标签把 1569 填进去、发现填错了单位，
   * 再让人自己按计算器除 4.184 是没道理的。
   */
  const energyValue = () => {
    const raw = Number(inputs.energy.value);
    if (!Number.isFinite(raw)) return null;
    return customDraft.energyUnit === 'kj' ? raw / KJ_PER_KCAL : raw;
  };
  inputs.energy = h('input', {
    type: 'number', placeholder: '能量', step: '0.1', inputmode: 'decimal',
    value: n[0] == null ? '' : String(n[0]),
  });
  const unitBtn = h('button.energy-unit-btn', {
    type: 'button',
    'aria-label': '切换能量单位',
  }, customDraft.energyUnit === 'kj' ? 'kJ' : 'kcal');
  unitBtn.onclick = () => {
    const before = Number(inputs.energy.value);
    customDraft.energyUnit = customDraft.energyUnit === 'kj' ? 'kcal' : 'kj';
    if (Number.isFinite(before) && inputs.energy.value !== '') {
      const kcal = customDraft.energyUnit === 'kj' ? before * KJ_PER_KCAL : before / KJ_PER_KCAL;
      inputs.energy.value = String(Math.round(kcal * 10) / 10);
    }
    unitBtn.textContent = customDraft.energyUnit === 'kj' ? 'kJ' : 'kcal';
    inputs.energy.focus();
  };

  inputs.cat = h('select', null, Object.entries(CATEGORIES).map(([key, label]) =>
    h('option', { value: key }, label)));
  // 挂进 select 之后再设 value：给还没插入的 option 设 selected 会被打回第一项
  inputs.cat.value = editing?.cat || 'other';

  inputs.liquid = h('input', { type: 'checkbox', checked: editing?.basis === '100ml' });
  inputs.portionName = h('input', {
    type: 'text', placeholder: '一份',
    value: editing?.s?.[0]?.[0] || '',
  });
  inputs.portionGrams = h('input', {
    type: 'number', placeholder: '100', step: '1', inputmode: 'numeric',
    value: editing?.s?.[0]?.[1] == null ? '' : String(editing.s[0][1]),
  });

  const save = async () => {
    const name = inputs.name.value.trim();
    const kcal = energyValue();
    if (!name || kcal == null) { toast('至少填写名称和每 100g 能量', 'warn'); return; }
    const val = (key) => Math.max(0, Number(inputs[key].value) || 0);
    const carb = val('carb');
    const fiber = val('fiber');
    const sugar = val('sugar');
    // 食物库自己的契约：纤维和糖都不能超过碳水，否则营养汇总会算出负的可用碳水
    if (fiber > carb) { toast('膳食纤维不能超过碳水', 'warn'); return; }
    if (sugar > carb) { toast('糖不能超过碳水', 'warn'); return; }
    const grams = Math.round(Number(inputs.portionGrams.value) || 100);
    if (!(grams > 0 && grams <= 1000)) { toast('常用份量要在 1~1000 之间', 'warn'); return; }
    const liquid = inputs.liquid.checked;

    const food = await addCustomFood({
      ...(customDraft.id ? { id: customDraft.id } : {}),
      name, alias: '', cat: inputs.cat.value, custom: true,
      n: [Math.round(kcal * 10) / 10, val('protein'), val('fat'), carb, fiber, sugar, val('sodium')],
      s: [[inputs.portionName.value.trim() || '一份', grams]],
      ...(liquid ? { basis: '100ml', state: 'ready', edibleRatio: 1, carbBasis: 'total' } : {}),
      f: [],
    });
    toast(customDraft.id ? `已保存「${name}」` : `已添加「${name}」`, 'ok');
    const wasEditing = Boolean(customDraft.id);
    resetCustomDraft();
    ui.showCustomForm = false;
    setCustomToggleLabel();
    refreshCustomForm();
    refreshResults();
    refreshEntries();
    if (!wasEditing) selectFood(food);
  };

  mount(nodes.customBox, h('div.custom-form', null,
    h('p.form-hint', null, editing
      ? `正在修改「${editing.name}」。改完之后，之前记过的那几笔仍然保留当时的数值。`
      : '按包装上的「营养成分表（每 100 克）」填写。能量那一格可以点右边的单位在 kcal 和 kJ 之间切。'),
    h('div.form-grid', null,
      h('label.form-field.span-all', null, h('span', null, '名称'), inputs.name),
      h('label.form-field', null, h('span', null, '分类'), inputs.cat),
      h('label.form-field', null, h('span', null, '能量'),
        h('div.energy-field', null, inputs.energy, unitBtn)),
      CUSTOM_NUM_FIELDS.map(([key, label, idx]) => numInput(key, label, n[idx + 1])),
      h('label.form-field', null, h('span', null, '常用份量'), inputs.portionName),
      h('label.form-field', null, h('span', null, '这一份多少克'), inputs.portionGrams),
      h('label.form-field.span-all.checkbox-field', null, inputs.liquid,
        h('span', null, '这是饮品，按毫升记'))),
    h('div.custom-form-actions', null,
      editing ? h('button.secondary-btn', {
        type: 'button',
        onclick: () => { resetCustomDraft(); refreshCustomForm(); },
      }, '取消修改') : null,
      h('button.primary-btn', { onclick: save },
        editing ? '保存修改' : '保存到我的食物库')),
    state.customFoods.length ? h('div.custom-list', null,
      state.customFoods.map((f) => h('span.custom-chip', { class: f.id === customDraft.id ? 'active' : '' },
        /*
         * 名字本身就是「改这一条」的入口。原先自定义食物存进去就再也改不了，
         * 填错一个数只能删掉重来 —— 而删掉会让已经记过的那几笔查不到食物。
         */
        h('button.custom-chip-name', {
          type: 'button',
          'aria-label': `修改 ${f.name}`,
          onclick: () => {
            customDraft.id = f.id;
            customDraft.energyUnit = 'kcal';
            refreshCustomForm();
          },
        }, f.name),
        h('button', {
          'aria-label': `删除 ${f.name}`,
          /*
           * 删之前先说这个食物还挂着几条记录。
           *
           * 不拦 —— 记录是自洽的，删掉食物不该连记录一起丢；但也不能一声不吭，
           * 那几条记录之后在饮食记录里会标成「食物已删除」，事先知道比事后发现好。
           */
          onclick: async () => {
            const used = state.dietEntries.filter((entry) => entry.foodId === f.id).length;
            if (used && !confirmAction(
              `「${f.name}」还有 ${used} 条饮食记录。删掉食物不会删掉这些记录，`
              + '它们会保留当时的营养数值，只是不能再从库里搜到这个食物。继续吗？',
            )) return;
            if (customDraft.id === f.id) resetCustomDraft();
            await removeCustomFood(f.id);
            refreshCustomForm();
          },
        }, icon('close'))))) : null,
  ));
}


/*
 * 餐次图标。五个标题原先只有两个汉字，滑到一半分不出看的是哪一餐。
 * 形和别的图标一起放在 lib/icons.js —— 描边粗细要跟底栏、健康数据对齐。
 */
function mealIcon(meal) {
  return ICON_SHAPES[meal] ? icon(meal, 'meal-icon') : null;
}

/*
 * 合并后的一行。只有一条时就是原来那一行，多条时折叠起来。
 *
 * 用 <details> 而不是自己管展开状态：这张卡每次落库都会重建，
 * 自己记的话得再挂一份 key→是否展开的表，而 details 用原生行为就够 ——
 * 收起来是常态，真要看明细的是少数。
 */
function mergedRow(group) {
  if (group.count === 1) return entryRow(group.entries[0], false);
  return h('details.entry-merged', null,
    h('summary.entry-row', null,
      h('div.entry-main', null,
        h('div.entry-name', null, group.name,
          h('span.entry-times', null, `×${group.count}`)),
        h('div.entry-meta', null,
          h('strong', null, `${num(group.kcal)} kcal`),
          ` · 蛋 ${num(group.protein, 1)} · 脂 ${num(group.fat, 1)} · 碳 ${num(group.carb, 1)} g`)),
      h('span.entry-grams-text', null, `${num(group.grams)}${group.unit}`)),
    h('div.entry-merged-list', null, group.entries.map((e) => entryRow(e, false))));
}

function refreshEntries() {
  clearEl(nodes.entries);
  const order = MEALS.map((m) => m.key);
  const entries = [...state.dietEntries].sort(
    (a, b) => order.indexOf(a.meal) - order.indexOf(b.meal) || String(a.time).localeCompare(String(b.time)),
  );

  if (!entries.length) {
    ui.editEntries = false;   // 一条都没有还留在编辑态，下次进来会看到一个没用的「完成」
    mount(nodes.entries, h('section.card', null,
      h('div.card-head', null, h('h3', null, '饮食记录')),
      h('p.empty-hint', null, '还没有记录。搜索食物加进来，或者用下面的「和昨天一样」。'),
      copyRow()));
    return;
  }

  const grouped = {};
  for (const e of entries) (grouped[e.meal] ||= []).push(e);
  const editing = ui.editEntries;

  mount(nodes.entries, h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '饮食记录'),
      /*
       * ⓘ 排在最后。全应用其余五张卡的说明入口都贴着卡头右边缘，
       * 只有这一张夹在摘要和「编辑」中间 —— 同一个记号在同一屏上有两个落点，
       * 眼睛就得每张卡重新找一遍。
       */
      h('div.card-head-actions', null,
        h('span.card-tag', null,
          `${num(entries.reduce((a, e) => a + e.kcal, 0))} kcal · 蛋白 ${num(entries.reduce((a, e) => a + e.protein, 0), 1)}g`),
        h('button.text-btn', {
          type: 'button', 'aria-pressed': String(editing),
          onclick: () => { ui.editEntries = !ui.editEntries; refreshEntries(); },
        }, editing ? '完成' : '编辑'),
        /*
         * 这张卡只留这一个说明入口。
         *
         * 每一行各挂一个 ⓘ 的时候，十几条记录就是十几个按钮，而它们说的多半是
         * 同一句话。这里按当前实际显示的这几条汇总：估算菜品的依据、
         * 「记录是记账当时的快照」，以及真有食物查不到时那句解释。
         */
        estimateGroupInfoTip(
          entries.map((entry) => findFood(entry.foodId)),
          '查看本日记录说明',
          {
            extra: [
              h('p', null, '每条记录保存的是记账当时的营养数值；之后食物库更新不会回填已经记下的记录。'),
              entries.some((entry) => !findFood(entry.foodId))
                ? h('p', null, '标着「食物已删除」的那几条，食物已经不在库里了'
                  + '（可能被删掉了，或者换设备时没带过来）。记录本身完整保留，'
                  + '克数、餐次照样能改，也可以删除。')
                : null,
            ],
          },
        ))),
    Object.entries(grouped).map(([meal, list]) => h('div.meal-group', null,
      h('div.meal-group-head', null,
        mealIcon(meal),
        h('strong', null, MEAL_LABEL[meal] || meal),
        h('span', null, `${num(list.reduce((a, e) => a + e.kcal, 0))} kcal`)),
      /*
       * 只读态把「同一笔」合成一行（`米饭（白米） ×3 · 450g`），点开看明细。
       * 编辑态一条是一条 —— 删的、改克数的、换餐次的都是某一条具体记录。
       */
      editing
        ? list.map((e) => entryRow(e, true))
        : mergeSameEntries(list).map(mergedRow))),
    // 「和昨天一样 / 清空这一天」也是改数据，跟着编辑态走
    editing ? copyRow() : null));
}

/*
 * 一条记录。默认只读 —— 按了「编辑」才给出克数输入框和删除。
 *
 * 原先每行都挂着可输入的框和一个红叉：这张卡大部分时候是拿来核对
 * 「今天吃了什么」的，滑动列表时很容易蹭到，而删掉一条没有撤销。
 */
/*
 * 改餐次的下拉。
 *
 * value 要在节点建好之后再设：给还没挂进 <select> 的 <option> 设 selected，
 * 浏览器会在插入时按 selectedIndex 重算，那一下就把选中项打回第一项 ——
 * 表现是记录明明已经移到晚餐，下拉里还写着早餐。
 */
function mealSelect(entry) {
  const select = h('select.entry-meal', {
    'aria-label': `${entry.name} 属于哪一餐`,
    onchange: async (ev) => {
      const node = ev.currentTarget;
      const meal = node.value;
      if (meal === entry.meal) return;
      const before = entry.meal;
      const result = await runLocalAction(node, () => updateEntry(entry.id, { meal }), '更改餐次');
      if (!result.ok) { node.value = before; return; }
      /*
       * 改餐次和改克数一样要能撤销：这一行本来就挤（下拉 + 数字框 + 删除），
       * 滑列表时最容易蹭到的就是这个下拉，而蹭错了原先只能自己再选回去 ——
       * 可这时候人已经不记得它原来在哪一餐了。
       */
      toast(`已移到${MEAL_LABEL[meal] || meal}`, 'ok', {
        label: '撤销',
        onClick: () => updateEntry(entry.id, { meal: before }),
      });
    },
  }, MEALS.map((m) => h('option', { value: m.key }, m.label)));
  select.value = entry.meal;
  return select;
}

/*
 * 一条记录是自洽的：名字、克数和七项营养在记账那一刻就存进去了。
 *
 * 所以这一行只用记录本身渲染，不依赖还能不能在食物库里查到它。
 * 原先反过来 —— 查不到就把 null 一路传给 estimateTag，整个饮食页被错误边界
 * 接管。而饮食页是唯一能删掉那条记录的地方，崩了就永远删不掉了。
 * 查不到的情形是真实存在的：自定义食物被删、换设备恢复的备份没带上它、
 * 旧版本留下的 id。这时候明说「食物已删除」，别装作没事，也别崩。
 */
function entryRow(e, editing) {
  const food = findFood(e.foodId);
  // 记录自带单位；老记录没有这个字段，才回头看查到的食物
  const isLiquid = e.unit ? e.unit === 'ml' : food?.basis === '100ml';
  const unit = isLiquid ? 'ml' : 'g';
  const recordNote = e.note
    ? h('p.entry-record-note', null, h('strong', null, '本次记录：'), e.note)
    : null;
  /*
   * 这一行不再各挂一个信息按钮。
   *
   * 十几条记录就是十几个 ⓘ，而它们说的多半是同一件事（「估算」的依据、
   * 「按记账当时的数值保存」）。卡片右上角本来就有一个统一入口，
   * 它会按当前实际显示的这几条动态汇总 —— 依据只该有一个入口，
   * 这条规矩在「今日提示」那张卡上已经立过一次了。
   * 每次记录时填的备注是这一条独有的，留在行里，但只在编辑态展开。
   */
  return h('div.entry-row', { class: `entry-row${editing ? ' editing' : ''}` },
    h('div.entry-main', null,
      h('div.entry-name', null, e.name,
        estimateTag(food),
        food ? null : weakTag('食物已删除', { tone: 'outline', className: 'chip-missing' })),
      h('div.entry-meta', null,
        h('strong', null, `${num(e.kcal)} kcal`),
        ` · 蛋 ${num(e.protein, 1)} · 脂 ${num(e.fat, 1)} · 碳 ${num(e.carb, 1)} g`),
      editing ? recordNote : null),
    editing ? h('div.entry-actions', null,
      h('input.entry-grams', {
        type: 'number', value: num(e.grams), min: 1, step: 5, inputmode: 'numeric',
        'aria-label': `${e.name} 的${isLiquid ? '毫升数' : '克数'}`,
        // 用 change：输入过程中不落库，避免每敲一个数字就重算重绘
        onchange: async (ev) => {
          const input = ev.currentTarget;
          const g = Number(ev.target.value);
          if (g > 0) {
            const before = e.grams;
            const result = await runLocalAction(input, () => updateEntry(e.id, { grams: g }), '更新份量');
            if (!result.ok) { input.value = num(before); return; }
            toast(`已改成 ${num(g)}${unit}`, 'ok', {
              label: '撤销',
              onClick: () => updateEntry(e.id, { grams: before }),
            });
            return;
          }
          input.value = num(e.grams);   // 清空或填了非法值就还原，别留个空框
        },
      }),
      h('span.unit', null, unit),
      /*
       * 餐次也能改。记账时经常先随手记下来，事后才发现该算在别的餐里——
       * 原先只能删掉重记一遍，而重记要重新搜、重新填克数。
       *
       * 用 select 而不是五个 chip：这一行本来就挤（克数输入 + 单位 + 删除），
       * 再塞五个按钮会把动作名挤没。
       */
      mealSelect(e),
      h('button.icon-btn.danger', {
        'aria-label': `删除 ${e.name}`,
        onclick: async (ev) => {
          /*
           * 按钮要先抓在手里：`event.currentTarget` 只在事件派发的那一刻有效，
           * 过了下面这个 await 就是 null，`runLocalAction` 会拿不到要禁用的控件。
           */
          const btn = ev.currentTarget;
          // 先把这一行收起来，再落库：删完整段瞬间上跳的话，人分不清删掉的是哪一条
          await collapseRow(btn.closest('.entry-row'));
          const result = await runLocalAction(btn, () => removeEntry(e.id), '删除记录');
          if (result.ok) toast(`已删除「${e.name}」`, 'info', {
            label: '撤销',
            onClick: async () => {
              await restoreEntry(e);
              toast('已恢复', 'ok');
            },
          });
        },
      }, icon('close')))
      // 只读时仍要看得到吃了多少，只是不能改
      : h('div.entry-actions.readonly', null,
        h('span.entry-grams-text', null, `${num(e.grams)} ${unit}`)));
}

/*
 * 「复制哪几餐」。
 *
 * 用弹层而不是 confirm：confirm 只能回答是 / 否，而这里要选的是一个子集。
 * 默认全选 —— 多数时候人就是想整天照搬，多按一下勾比多勾五下强。
 */
function pickMealsToCopy(counts) {
  return new Promise((resolve) => {
    const chosen = new Set(counts.keys());
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const rows = MEALS.filter((m) => counts.has(m.key)).map((m) => {
      const btn = h('button.copy-meal-row', {
        type: 'button',
        ...segmentedItemProps(true, 'radio'),
        onclick: () => {
          if (chosen.has(m.key)) chosen.delete(m.key); else chosen.add(m.key);
          const on = chosen.has(m.key);
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-checked', String(on));
          setIcon(mark, on ? 'check' : 'plus');
          go.disabled = chosen.size === 0;
          go.textContent = chosen.size
            ? `复制 ${MEALS.filter((x) => chosen.has(x.key))
              .reduce((a, x) => a + counts.get(x.key), 0)} 条`
            : '至少选一餐';
        },
      });
      const mark = icon('check');
      btn.classList.add('active');
      mount(btn, mealIcon(m.key), h('span.copy-meal-name', null, m.label),
        h('span.copy-meal-count', null, `${counts.get(m.key)} 条`), mark);
      return btn;
    });
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const go = h('button.primary-btn', {
      /*
       * 先 finish 再 closeSheet：closeSheet() 会同步调用 onClose，
       * 而 onClose 里是 finish(null)。反过来写的话，用户按了「复制」，
       * 拿到的却是「取消」—— 弹层关掉了，一条都没复制，也没有任何提示。
       */
      onclick: () => { finish([...chosen]); closeSheet({ force: true }); },
    }, `复制 ${total} 条`);
    openSheet(h('div.portion-panel', null,
      h('div.field-label', null, '复制昨天的哪几餐'),
      h('div.copy-meal-list', segmentedGroupProps('复制哪几餐', 'radio'), rows)),
    { label: '复制昨天的记录', onClose: () => finish(null) });
    setSheetFooter(h('div.sheet-action', null, go));
  });
}

function copyRow() {
  return h('div.copy-row', null,
    h('button.text-btn', {
      /*
       * 复制之前先让人挑餐次。
       *
       * 原先是整天照搬：昨天吃了 8 样，今天只想复制早餐那 3 样，
       * 就得先全复制再一条条删 —— 而删一条是有代价的（要进编辑态）。
       * 只有一餐时不弹选择，那没什么可挑的。
       */
      onclick: async (ev) => {
        const from = shiftDay(state.day, -1);
        const counts = await dayMealCounts(from);
        if (!counts.size) { toast('昨天没有记录', 'warn'); return; }
        const meals = counts.size > 1 ? await pickMealsToCopy(counts) : [...counts.keys()];
        if (!meals?.length) return;
        const result = await runLocalAction(ev.currentTarget,
          () => copyDay(from, meals), '复制昨天记录');
        if (!result.ok) return;
        toast(`已复制昨天的 ${result.value} 条记录`, 'ok');
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
 * 「当前饮食推荐 / 喝水」从今日页搬过来。
 * 今日页回答「我今天怎么样」，这两张回答「我现在该做什么」——
 * 真要照着做的时候人已经在这一页了，隔着一次切页反而多余。
 *（「现在别碰」那张连同 buildAvoidList 已经删了：它说的是「别做什么」，
 * 和这一页要回答的「该吃什么」是反过来的，而且一次列五条几乎每天都一样。）
 */
function refreshAdvice() {
  clearEl(nodes.water);
  clearEl(nodes.advice);
  const rerender = () => refreshAdvice();
  mount(nodes.water, waterCard(rerender));
  // 正在搜索或正在调份量时不插推荐：那会儿人有明确目标，多两张卡只会把操作区顶下去
  if (ui.query || ui.selected) return;
  // ＋ 走和搜索结果一样的路：先开份量面板，不直接落库
  mount(nodes.advice, recommendCard(rerender, (food) => selectFood(food)));
}

export function renderDiet(root) {
  // 外壳还挂在页面上就只做增量刷新，被别的页面清掉了才重建
  if (nodes.root?.parentNode !== root) {
    buildShell(root);
    refreshCustomForm();
    refreshResults();
    refreshPortion();
  }
  refreshEntries();
  refreshAdvice();

  /*
   * 从今日页的「蛋白还差 83g」点过来。意图取一次就没了 ——
   * 60 秒定时器和 visibilitychange 都会再跑一遍 renderDiet，
   * 留着的话用户手动切走筛选之后又会被拽回来。
   */
  const intent = takeIntent();
  if (intent?.focus && FOCUS_LABEL[intent.focus]) {
    pickFocus(intent.focus);
    nodes.searchCard?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
