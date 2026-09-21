import { isRecordedSet, isRecordedItem, trainingSetText } from '../core/training-records.js';
/** 健身记录可选择补记日期；历史统计仍以真实今天为终点。 */
import { h, clearEl, mount, num, todayKey, shiftDay, toast, runLocalAction, confirmAction } from '../lib/utils.js';
import { icon, setIcon } from '../lib/icons.js';
import {
  listRow, persistentInfoTip, searchField, cardHeader, emptyState,
  segmentedGroupProps, segmentedItemProps, selectField,
} from '../lib/ui.js';
import {
  GROUPS, MUSCLES, PATTERNS, EQUIPMENT, EXERCISE_BY_ID, searchExercises,
  MUSCLE_TARGETS, exerciseTargets, exerciseTargetText, muscleTargetOptions, matchesMuscleTarget, exerciseVariants, exerciseForRecord,
} from '../data/exercises.js';
import { state, saveTraining, trainingFor } from '../lib/store.js';
import { subscribeAccount } from '../lib/account.js';
import { selectBar } from '../lib/select-bar.js';
import { openSheet, closeSheet, setSheetFooter, setSheetFooterVisible } from '../lib/sheet.js';
import {
  exercisesForGroup, exercisesForSplit, SPLITS, coveredGroupKeys, planAdvice,
  recommendFor, exerciseTags, EQUIP_FILTERS, equipFilterOf, lastPerformance,
  sessionVolume, recentTrainingRows, trainingCoverage, emptyPlanBrief, weeklyTrainingSummary,
  overlapScore, overlapLevel, restoreTrainingItems, newTrainingItem, recordingDefaultsFor, createSetDraft, appendConfirmedSets, trainingHistoryDays, trainingAreaDetail,
} from '../core/training.js';

let activeGroup = 'chest';
let pickMode = 'group';     // 'group' 按部位 | 'split' 按推拉腿
let activeSplit = 'push';
let targetFilter = 'all';
// 展开着记组数的那个动作；纯界面状态，不落库
let expanded = null;
const LIST_PREVIEW = 8;
let showAllExercises = false;
// 动作列表那张卡现在看的是列表还是推荐。纯界面状态，不落库
let showRecommend = false;
// 搜索词是挑选器自己的界面状态；卡片因记录动作而重绘时仍保留。
let exerciseQuery = '';
let pending = new Set();
let pickerBar = null;

// 补记日期独立于今日/饮食页日期；null 表示持续跟随真实今天。
let recordingDate = null;
const trainingDay = () => recordingDate || todayKey();
const session = () => trainingFor(trainingDay());
const picked = () => session().items.map((i) => i.id);
// 复制值只存在于编辑草稿；确认后才写入组记录，刷新/换日不会变成已完成训练。
const setDrafts = new Map();
const draftKey = (id, date = trainingDay()) => `${date}:${id}`;
let observingAccount = false;
const disclosureState = new Map();
let resetDisclosures = false;
let accountContext = null;
const budgetOptions = { minutes: null, setBudget: null, setsPerExercise: 3 };
function disclosure(key, className, title, ...children) {
  return h('details.' + className, { 'data-training-disclosure': key, open: disclosureState.get(key) === true,
    ontoggle: event => { if (event.currentTarget.isConnected) disclosureState.set(key, event.currentTarget.open); } },
    h('summary', null, title), ...children);
}

// Serialize user writes; compute each mutation from the latest state, bound to its original day.
let writing = Promise.resolve();
function updateSession(mutate, date = trainingDay()) {
  const task = writing.then(() => {
    const items = trainingFor(date).items.map(cloneTrainingItem);
    const next = mutate(items);
    return next === null ? undefined : saveTraining(date, { items: next });
  });
  writing = task.catch(() => {});
  return runLocalAction(null, () => task, '保存训练');
}

const cloneTrainingItem = (item) => ({
  ...item,
  sets: (item.sets || []).map((set) => ({ ...set })),
});

async function removeExerciseWithUndo(exercise) {
  const date = trainingDay();
  let removed = [];
  const result = await updateSession(items => {
    const index = items.findIndex(item => item.id === exercise.id);
    setDrafts.delete(draftKey(exercise.id, date));
    if (index >= 0) removed = [{ item: cloneTrainingItem(items[index]), index }];
    return items.filter(item => item.id !== exercise.id);
  }, date);
  if (result.ok && removed.length) toast(`已移除「${exercise.name}」`, 'info', {
    label: '撤销', onClick: () => restoreRemoved(removed, date),
  });
}

async function restoreRemoved(removed, date) {
  const result = await updateSession(items => restoreTrainingItems(items, removed), date);
  if (result.ok) toast('已恢复，期间新增的动作保留', 'ok');
}

let trainingView = 'current';
let pickerRoot = null;
let pickerDay = null;
let uiDay = trainingDay();
let proposal = null;
let proposalKey = '';
let committing = false;

function currentProposal() {
  const key = [pickMode, activeGroup, activeSplit, equipFilter, targetFilter, budgetOptions.minutes, budgetOptions.setBudget, budgetOptions.setsPerExercise].join(':');
  if (!proposal || key !== proposalKey) {
    proposalKey = key;
    proposal = recommendFor({ mode: pickMode, groupKey: activeGroup, splitKey: activeSplit,
      selection: [...session().items.map(exerciseForRecord), ...pending], equip: equipFilter, target: targetFilter, sessions: state.trainingDays, endDate: trainingDay(), ...budgetOptions });
  }
  return proposal;
}

function rerenderPicker() {
  if (!pickerRoot?.isConnected) return;
  const scroll = pickerRoot.closest('.sheet-scroll');
  const top = scroll?.scrollTop || 0;
  const active = document.activeElement;
  /*
   * **不许把焦点还给 `<select>`。**
   *
   * 焦点对别的控件是个被动状态，对 `<select>` 是个动作：手机上 `focus()` 一个
   * select 会把原生选择器**再弹一次**。而这张卡每次重绘都是整棵树拆了重建，
   * 于是「挑法」和「细分部位」这两个下拉选完一个值，选择器立刻又弹出来 ——
   * 再选一次同样的值才收得掉，因为第二次值没变、不触发 change，也就不再重绘。
   *
   * 更远的一截是：iOS 上点 `<button>` 不夺焦点，焦点会一直滞留在上次动过的那个
   * select 上。于是接着点部位、点器械、点「推荐」—— 任何一次重绘都会把那个
   * 下拉重新弹出来一次，而用户压根没碰它。
   *
   * 代价是键盘用户改完下拉后焦点落回 body，得 Tab 回去。这一档比「主力平台上
   * 每次重绘都弹一次选择器」轻得多。
   */
  const label = active?.tagName === 'SELECT' ? null : active?.getAttribute('aria-label');
  mount(clearEl(pickerRoot), pickerCard(rerenderPicker));
  if (scroll) scroll.scrollTop = top;
  if (label && !active?.isConnected) [...pickerRoot.querySelectorAll('[aria-label]')]
    .find(el => el.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
  pickerBar?.render();
}

function openPicker() {
  if (pickerRoot?.isConnected) return;
  if (pickerDay !== trainingDay()) pending.clear();
  pickerDay = trainingDay();
  proposal = null;
  showRecommend = false;
  exerciseQuery = '';
  pickerRoot = h('div.training-picker-panel');
  pickerBar = buildPickerBar();
  const header = h('div.training-picker-head', null, h('h2', null, '添加动作'));
  openSheet(h('div.training-picker', null, header, pickerRoot), {
    label: '添加训练动作', onClose: () => { pickerRoot = null; pickerBar = null; rerenderTraining(); },
    returnFocus: () => document.querySelector('.training-add'),
  });
  setSheetFooter(pickerBar.el);
  // 收起底栏要走 sheet 自己的接口：安全区在底栏和正文之间只算一次，得一起改
  pickerBar.onVisibility = setSheetFooterVisible;
  rerenderPicker();
}

let equipFilter = 'all';
// 器械菜单属于纯界面状态：换器械会重绘，但菜单不应因此自动收起。
let equipMenuOpen = false;

const pickedExercises = () => session().items.map(exerciseForRecord).filter(Boolean);

function muscleLine(e) {
  const primary = exerciseTargetText(e);
  const secondary = exerciseTargetText(e, 'secondary');
  return secondary ? `${primary}　协同：${secondary}` : primary;
}

function groupTabs(rerender) {
  const covered = coveredGroupKeys(picked());
  return h('div.range-switch.body-part-switch.picker-scope-switch', {
    ...segmentedGroupProps('身体部位'),
    style: { '--picker-cols': String(GROUPS.length) },
  },
    GROUPS.map((g) => {
      const done = covered.has(g.key);
      return h('button', {
        class: `chip-btn${activeGroup === g.key ? ' active' : ''}`,
        ...segmentedItemProps(activeGroup === g.key),
        // 点是纯装饰，读屏软件按这句话来
        'aria-label': done ? `${g.label}（当日已安排）` : g.label,
        onclick: () => { activeGroup = g.key; targetFilter = 'all'; showAllExercises = false; rerender(); },
      }, g.label, done ? h('span.tab-dot', { 'aria-hidden': 'true' }) : null);
    }));
}

function modeSelect(rerender) {
  // 走共用的 selectField（`lib/ui.js`）：画出来的箭头、焦点圈、
  // 「选中项要建完再赋」那个坑都在那儿，这儿只说尺寸和内容。
  // sm 档 = 宽度跟着文字走，因为它是「设一次就很少再动的偏好」，不该铺满一行。
  return selectField([['group', '按身体部位'], ['split', '按动作模式']], {
    label: '按什么挑动作',
    value: pickMode,
    size: 'sm',
    className: 'picker-mode-field',
    onPick: (value) => { pickMode = value; targetFilter = 'all'; showAllExercises = false; rerender(); },
  });
}

function splitTabs(rerender) {
  return h('div.range-switch.picker-scope-switch', {
    ...segmentedGroupProps('动作模式'),
    style: { '--picker-cols': String(SPLITS.length) },
  },
    SPLITS.map((sp) => h('button', {
      class: `chip-btn${activeSplit === sp.key ? ' active' : ''}`,
      ...segmentedItemProps(activeSplit === sp.key),
      onclick: () => { activeSplit = sp.key; targetFilter = 'all'; showAllExercises = false; rerender(); },
    }, sp.label)));
}

function clashWith(e) {
  const others = [...pickedExercises(), ...[...pending].map((id) => EXERCISE_BY_ID.get(id))]
    .filter(Boolean);
  let worst = null;
  for (const other of others) {
    if (other.id === e.id) continue;
    const score = overlapScore(e, other);
    if (overlapLevel(score) === 'none') continue;
    if (!worst || score > worst.score) worst = { other, score, level: overlapLevel(score) };
  }
  return worst;
}

/*
 * 重复提示写成整句，不做成「短标签 + 点开看详情」。
 *
 * 「模式相近」这四个字谁都看得懂，可它不构成一个判断 —— 要不要换掉这个动作，
 * 取决于**和谁**相近。把那半句藏进一次点击里，等于把有用的那半句藏了起来，
 * 而列表里每一行都多出一个点得动的色块。
 */
function clashLine(e) {
  if (picked().includes(e.id) || pending.has(e.id)) return null;
  const clash = clashWith(e);
  if (!clash) return null;
  return clash.level === 'high'
    ? { cls: 'ex-clash', text: `与「${clash.other.name}」动作模式相近` }
    : { cls: 'ex-clash soft', text: `和「${clash.other.name}」部分重叠` };
}

function exerciseMeta(tags) {
  const classes = ['pattern', 'muscle', 'type'];
  return h('div.exercise-meta', null,
    tags.map((tag, index) => h('span', {
      class: `exercise-meta-tag ${classes[index] || 'detail'}`,
    }, tag)));
}

function lastLine(exercise) {
  const last = lastPerformance(state.trainingDays, exercise.id, { before: trainingDay() });
  if (!last) return null;
  const parts = [last.weightLabel, last.repsLabel && `× ${last.repsLabel}`].filter(Boolean);
  return h('div.ex-last', null, `上次 ${last.date.slice(5)} · ${parts.join(' ')}`);
}

function exerciseRow(e, rerender, scopeMuscles = null) {
  const chosen = picked().includes(e.id);
  const marked = pending.has(e.id);
  const pickNode = h('button.ex-pick.exercise-choice-action', {
    type: 'button',
    'aria-pressed': String(chosen || marked),
    'aria-label': `${chosen ? `从本次训练移除 ${e.name}` : marked ? `取消选择 ${e.name}` : `选择 ${e.name}`}`,
    onclick: async () => {
      if (committing) return;
      /*
       * 已加入的那一行点一下就是移出去 —— 和饮食页备选里的「＋ 变成 ✓，
       * 点一下移出去」是同一条规矩。
       *
       * 上一版这里是 `disabled: chosen`：一枚绿色的 ✓ 摆在那儿，点了没有任何反应。
       * 而「刚加错了想撤掉」正是人回到这一页最常见的理由，于是读出来是
       * 「加进去就拿不下来了」。移除照旧走带撤销的那条路。
       */
      if (chosen) { await removeExerciseWithUndo(e); rerender(); return; }
      if (pending.has(e.id)) pending.delete(e.id); else pending.add(e.id);
      const on = pending.has(e.id);
      row.classList.toggle('marked', on);
      pickNode.setAttribute('aria-pressed', String(on));
      pickNode.setAttribute('aria-label', `${on ? '取消选择' : '选择'} ${e.name}`);
      setIcon(pickNode, on ? 'check' : 'plus');
      // 勾中一个会改变其它行「和已选的重不重」，所以整列的提示都要跟一下
      for (const other of row.parentNode?.children || []) other.syncClash?.();
      row.closest('.rec-picks')?.refreshSelection?.();
      if (pickerBar) pickerBar.render();
    },
  }, icon(chosen || marked ? 'check' : 'plus'));
  const clashNode = h('div.ex-clash-slot');
  const row = listRow({
    className: `ex-row exercise-choice-row${chosen ? ' chosen' : ''}${marked ? ' marked' : ''}`,
  },
  h('div.ex-main.exercise-choice-main', null,
    h('div.ex-name', null, h('strong', null, e.name),
      persistentInfoTip(`exercise-target-${e.id}`, '训练部位与动作要点',
        `主练：${muscleLine(e)}。${exerciseTargets(e).note || '具体侧重随动作幅度、关节角度与完成方式变化。'}`)),
    exerciseMeta(exerciseTags(e, { scopeMuscles })),
    lastLine(e),
    clashNode),
  pickNode);

  row.syncClash = () => {
    const line = clashLine(e);
    // 保留 ex-clash-slot：整条 className 覆盖掉的话，提示消失之后
    // `:empty { display: none }` 就不再命中，行里会留一道空白
    clashNode.className = line ? `ex-clash-slot ${line.cls}` : 'ex-clash-slot';
    clashNode.textContent = line ? line.text : '';
  };
  row.syncClash();
  return row;
}

function equipMenu(rerender, allInScope) {
  const active = EQUIP_FILTERS.find((f) => f.key === equipFilter) || EQUIP_FILTERS[0];
  const wrap = h('div.equip-filter-wrap', null,
    h('button.equip-filter-btn', {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': String(equipMenuOpen),
      'aria-label': `按器械筛选，当前是${active.label}`,
      onclick: (event) => {
        event.stopPropagation();
        equipMenuOpen = !equipMenuOpen;
        rerender();
      },
    },
    icon('filter', 'equip-filter-icon'),
    h('span.equip-filter-label', null, active.label),
    // 展开箭头也是画出来的：打出来的 ⌄ 在三个平台上是三种字形，和旁边的图标对不齐
    h('span.equip-filter-caret', { 'aria-hidden': 'true' }, icon('chevron'))),
    equipMenuOpen ? h('div.equip-filter-menu', { role: 'menu', 'aria-label': '器械筛选' },
      EQUIP_FILTERS.map((f) => {
        const n = allInScope.filter(f.match).length;
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
        h('span.equip-filter-check', { 'aria-hidden': 'true' }, selected ? icon('check') : null));
      })) : null);
  return wrap;
}

function pickerCard(rerender) {
  const byGroup = pickMode === 'group';
  const all = byGroup ? exercisesForGroup(activeGroup) : exercisesForSplit(activeSplit);
  const filter = equipFilterOf(equipFilter);
  const list = all.filter(filter.match).filter(exercise => matchesMuscleTarget(exercise, targetFilter));
  const group = GROUPS.find((g) => g.key === activeGroup);
  const split = SPLITS.find((sp) => sp.key === activeSplit);
  const scopeLabel = byGroup ? group.label : `${split.label}的动作`;
  const scopeMuscles = byGroup ? group.muscles : null;
  const visibleRows = () => {
    const kept = new Set([...picked(), ...pending]);
    return showAllExercises
      ? list
      : [...list.slice(0, LIST_PREVIEW), ...list.slice(LIST_PREVIEW).filter((e) => kept.has(e.id))];
  };

  const rec = showRecommend ? currentProposal() : null;
  const viewTabs = h('div.range-switch.picker-view-switch',
    segmentedGroupProps('看全部动作还是推荐组合'),
    [['all', '列表'], ['recommend', '推荐']].map(([key, label]) => {
      const active = (key === 'recommend') === showRecommend;
      return h('button', {
        class: `chip-btn${active ? ' active' : ''}`,
        ...segmentedItemProps(active),
        onclick: () => { showRecommend = key === 'recommend'; rerender(); },
      }, label);
    }));

  const targetSelect = h('select.picker-target-select', {
    'aria-label': '细分训练部位',
    onchange: event => { targetFilter = event.currentTarget.value; showAllExercises = false; rerender(); },
  }, h('option', { value: 'all' }, '全部细分部位'),
  muscleTargetOptions(all).map(target => h('option', { value: target.key }, target.label)));
  targetSelect.value = targetFilter;
  const controls = h('div.picker-controls', null,
    h('div.picker-scope-row', null, modeSelect(rerender), equipMenu(rerender, all)),
    byGroup ? groupTabs(rerender) : splitTabs(rerender),
    targetSelect);
  const scopeName = h('strong.picker-scope-name', null, targetFilter !== 'all'
    ? MUSCLE_TARGETS[targetFilter] : byGroup ? `${group.label}部动作` : `${split.label}的动作`);
  const scopeCount = h('span.picker-scope-count', null,
    showRecommend ? `${rec.items.length} 个推荐` : `${list.length} 个`);
  const listHead = h('div.picker-list-head', null,
    h('div.picker-scope', null, scopeName, scopeCount),
    viewTabs);
  const search = searchField({
    className: 'exercise-search-row',
    inputClassName: 'exercise-search-input',
    value: exerciseQuery,
    ariaLabel: '搜索动作，支持中文、拼音或英文', placeholder: '搜索动作或部位，如下腹、后束',
  });
  const searchInput = search.input;
  const searchCount = h('span.card-tag', { hidden: true });
  const normalBody = () => (showRecommend
    ? recommendBody(rec)
    : [
      list.length
        ? h('div.ex-list', null, visibleRows().map((e) => exerciseRow(e, rerender, scopeMuscles)))
        : h('p.empty-hint', null, `${scopeLabel}里没有符合当前器械档位的动作，换一档看看。`),
      list.length > LIST_PREVIEW ? h('button.more-btn', {
        onclick: () => { showAllExercises = !showAllExercises; rerender(); },
      }, showAllExercises ? `只看前 ${LIST_PREVIEW} 个` : `展开其余 ${list.length - LIST_PREVIEW} 个`) : null,
    ]);
  const normalContent = h('div.picker-normal-results', null, normalBody());
  const searchContent = h('div.exercise-search-results', { hidden: true });

  const updateSearch = () => {
    const query = exerciseQuery.trim();
    const searching = Boolean(query);
    const leavingSearch = !searching && !searchContent.hidden;
    controls.hidden = searching;
    normalContent.hidden = searching;
    searchContent.hidden = !searching;
    clearEl(searchContent);
    listHead.hidden = searching;
    searchCount.hidden = !searching;
    card.querySelector('.picker-card-head').hidden = !searching && !showRecommend;
    if (!searching) {
      scopeCount.textContent = showRecommend ? `${rec.items.length} 个推荐` : `${list.length} 个`;
      if (leavingSearch) mount(clearEl(normalContent), normalBody());
      return;
    }
    // 搜索是全库搜的，器械档位这时候不参与筛选，所以列表头整块让位
    const matches = searchExercises(query);
    searchCount.textContent = `${matches.length} 个结果`;
    mount(searchContent,
      matches.length
        ? h('div.ex-list', null,
          matches.map((e) => exerciseRow(e, rerender)))
        : h('p.empty-hint.exercise-search-empty', null, '没有找到动作，试试动作名、拼音或英文。'));
  };
  searchInput.addEventListener('input', (event) => {
    const next = event.target.value;
    if (!next && exerciseQuery && document.activeElement !== searchInput) {
      searchInput.value = exerciseQuery;
      search.sync();
      return;
    }
    if (next === exerciseQuery) return;
    exerciseQuery = next;
    updateSearch();
  });

  const card = h('section.card.exercise-picker-card', null,
    h('div.card-head.picker-card-head', null,
      h('div.card-head-actions', null,
        searchCount,
        showRecommend ? recommendTip() : null)),
    search.el,
    controls,
    listHead,
    normalContent,
    searchContent);
  updateSearch();
  return card;
}

async function commitPending() {
  if (committing || pickerDay !== trainingDay()) return;
  const date = pickerDay;
  const owner = pickerRoot;
  const ids = [...pending];
  if (!ids.length) return;
  committing = true;
  try {
    const result = await updateSession(items => [...items,
      ...ids.filter(id => !items.some(item => item.id === id)).map(id => newTrainingItem(id, state.trainingDays, date))], date);
    if (!result.ok) return;
    if (pickerDay === date) ids.forEach(id => pending.delete(id));
    trainingView = 'current';
    if (pickerRoot === owner && owner?.isConnected) closeSheet({ force: true });
    toast(`已加入 ${ids.length} 个动作，可以开始记组`, 'ok');
  } finally { committing = false; }
}

function buildPickerBar() {
  const bar = selectBar({
    summary: () => `待加入 ${pending.size} 个动作`,
    actionLabel: () => `加入 ${pending.size} 个动作`,
    actionAriaLabel: () => `把已选的 ${pending.size} 个动作加入计划`,
    items: () => [...pending].map((id) => {
      const e = EXERCISE_BY_ID.get(id);
      return e ? { key: id, label: e.name, note: `${exerciseTargetText(e)} · ${PATTERNS[e.pattern]}` } : null;
    }).filter(Boolean),
    onRemove: (id) => { pending.delete(id); rerenderPicker(); },
    onClear: () => { pending = new Set(); rerenderPicker(); },
    onConfirm: () => commitPending(),
  });
  bar.el.classList.add('training-select-bar');
  return bar;
}

function recordingSettings(item) {
  const date = trainingDay(), settings = recordingDefaultsFor(item, state.trainingDays, date);
  const exercise = exerciseForRecord(item), variants = exerciseVariants(item.id);
  let variantId = item.id;
  const settingInputs = {};
  const field = (label, key, values) => {
    const input = h('select', { 'aria-label': label, onchange: event => { settings[key] = event.target.value; } },
      values.map(([value, text]) => h('option', { value, selected: settings[key] === value }, text)));
    settingInputs[key] = input;
    return h('label.form-field', null, h('span', null, label), input);
  };
  const save = h('button.primary-btn', { type: 'button', onclick: async () => {
    const changedVariant = variantId !== item.id;
    const result = await updateSession(items => {
      const current = items.find(i => i.id === item.id);
      if (!current) return null;
      if (changedVariant) {
        if (items.some(i => i.id === variantId)) return items.map(i => i.id === variantId ? { ...i, recordingDefaults: { ...settings } } : i);
        const next = { ...newTrainingItem(variantId, state.trainingDays, date), recordingDefaults: { ...settings } };
        // 已记组的动作不改 ID；另一练法从空记录开始。
        return current.sets.length || current.done ? [...items, next] : items.map(i => i.id === item.id ? next : i);
      }
      return items.map(i => i.id === item.id ? { ...i, recordingDefaults: { ...settings } } : i);
    }, date);
    if (!result.ok) return;
    const key = draftKey(item.id, date), draft = setDrafts.get(key);
    if (changedVariant) { setDrafts.delete(key); expanded = variantId; }
    else if (draft) {
      const changedLoad = draft.loadMode !== settings.loadMode || draft.loadConvention !== settings.loadConvention;
      setDrafts.set(key, { ...draft, ...settings, weightKg: changedLoad ? null : draft.weightKg });
    }
    closeSheet({ force: true }); rerenderTraining();
  } }, '保存设置');
  const variantNote = h('p.form-hint', null, variants.find(v => v.id === item.id)?.note || '');
  openSheet(h('div.training-settings-sheet', null,
    cardHeader(exercise.name),
    variants.length ? h('label.form-field', null, h('span', null, '练法'),
      h('select', { 'aria-label': '练法', onchange: event => { variantId = event.target.value; variantNote.textContent = variants.find(v => v.id === variantId)?.note || '';
        Object.assign(settings, recordingDefaultsFor(session().items.find(i => i.id === variantId) || newTrainingItem(variantId, state.trainingDays, date), state.trainingDays, date));
        Object.entries(settingInputs).forEach(([key, input]) => { input.value = settings[key]; }); } },
        variants.map(v => h('option', { value: v.id, selected: item.id === v.id }, v.label)))) : null,
    variants.length ? variantNote : null,
    h('div.training-settings-fields', null,
      field('记录方式', 'measure', [['reps','按次数'],['time','按时长']]),
      field('负重方式', 'loadMode', [['bodyweight','自重'],['external','附加负重'],['assistance','辅助重量'],['machine','器械标示']]),
      field('重量单位与口径', 'loadConvention', [['single','每只／单侧 kg'],['total','合计 kg'],['scale','器械刻度']])),
    h('p.form-hint', null, '设置用于之后记录的组，下次练这个动作时沿用。已有组的重量和口径保留。'),
    variants.length ? h('p.form-hint', null, '已有记录时，另一练法会单独加入本次训练。') : null),
    { label: '动作记录设置' });
  setSheetFooter(save);
}

const setLabel = trainingSetText;
const loadUnit = set => set.loadConvention === 'scale' ? '刻度' : 'kg';
function setTypeSheet(item, index) {
  const date = trainingDay(), set = item.sets[index];
  openSheet(h('div', null, cardHeader(`第 ${index + 1} 组`),
    h('div.training-edit-actions', null, [['work','正式组'],['warmup','热身组']].map(([value, label]) => h('button.secondary-btn.compact', {
      type: 'button', onclick: async () => {
        const result = await updateSession(items => items.map(i => i.id === item.id
          ? { ...i, sets: i.sets.map((s, k) => k === index ? { ...s, setType: value, completed: true } : s) } : i), date);
        if (result.ok) closeSheet({ force: true });
      } }, label))),
    set.completed === false ? h('p.form-hint', null, setLabel(set)) : null,
    h('button.text-btn.danger', { type: 'button', onclick: async () => {
      let removed;
      const result = await updateSession(items => items.map(i => {
        if (i.id !== item.id || !i.sets[index]) return i;
        removed = { ...i.sets[index] };
        return { ...i, sets: i.sets.filter((_, k) => k !== index) };
      }), date);
      if (result.ok) {
        closeSheet({ force: true });
        if (removed) toast('已删除这一组', 'info', { label: '撤销', onClick: () => updateSession(items => items.map(i => {
          if (i.id !== item.id) return i;
          const sets = [...i.sets]; sets.splice(Math.min(index, sets.length), 0, removed); return { ...i, sets };
        }), date) });
      }
    } }, '删除这一组')), { label: '组记录设置' });
}

function setValueInput(set, field, label, change, eventName = 'onchange') {
  return h('label.training-value-cell', null,
    h('input.set-input', { type: 'number', inputmode: field === 'weightKg' ? 'decimal' : 'numeric',
      min: 0, step: field === 'weightKg' ? '0.5' : '1', value: set[field] ?? '', 'aria-label': label,
      [eventName]: event => change(field, event.target.value.trim() === '' ? null : Number(event.target.value)) }),
    h('span.set-unit', null, field === 'weightKg' ? loadUnit(set) : field === 'durationSeconds' ? '秒' : '次'));
}

function setRow(item, index, set, showWeight) {
  const date = trainingDay(), exercise = exerciseForRecord(item);
  const change = (key, value) => updateSession(items => items.map(i => i.id === item.id
    ? { ...i, sets: i.sets.map((s, k) => k === index ? { ...s, [key]: value } : s) } : i), date);
  const recorded = isRecordedSet(set);
  return h('div.set-row.training-recorded-set' + (showWeight ? '' : '.training-timed-row'), null,
    h('span.set-index', null, `${index + 1}`),
    showWeight ? set.loadMode === 'bodyweight' ? h('span.training-bodyweight', null, '自重')
      : setValueInput(set, 'weightKg', `${exercise.name} 第 ${index + 1} 组重量 ${loadUnit(set)}`, change) : null,
    setValueInput(set, set.durationSeconds > 0 ? 'durationSeconds' : 'reps', `${exercise.name} 第 ${index + 1} 组${set.durationSeconds > 0 ? '时长' : '次数'}`, change),
    h('button.training-set-status', { type: 'button', 'aria-label': `第 ${index + 1} 组记录设置`, onclick: () => setTypeSheet(item, index) },
      set.setType === 'warmup' ? '热身' : recorded ? icon('check') : '未完成'));
}

function draftSetEditor(item, showWeight) {
  const date = trainingDay(), key = draftKey(item.id, date), draft = setDrafts.get(key);
  if (!draft) return null;
  const confirm = async event => {
    try { appendConfirmedSets(item, draft, date); } catch (error) { toast(error.message, 'warn'); return; }
    event.currentTarget.disabled = true;
    const result = await updateSession(items => items.map(i => i.id === item.id ? appendConfirmedSets(i, draft, date) : i), date);
    if (result.ok) setDrafts.delete(key);
    rerenderTraining();
  };
  const change = (field, value) => { draft[field] = value; };
  const input = (field, label) => setValueInput(draft, field, label, change, 'oninput');
  const type = h('button.text-btn', { type: 'button', onclick: () => {
    draft.setType = draft.setType === 'work' ? 'warmup' : 'work'; rerenderTraining();
  } }, draft.setType === 'warmup' ? '热身组' : '正式组');
  const count = h('select', { 'aria-label': '本次记录组数', onchange: event => { draft.count = Number(event.target.value); rerenderTraining(); } },
    Array.from({ length: 20 - item.sets.length }, (_, n) => h('option', { value: n + 1, selected: draft.count === n + 1 }, `${n + 1} 组`)));
  return h('div.training-set-draft', null,
    h('div.set-row' + (showWeight ? '' : '.training-timed-row'), null,
      h('span.set-index', null, String(item.sets.length + 1)),
      showWeight ? draft.loadMode === 'bodyweight' ? h('span.training-bodyweight', null, '自重') : input('weightKg', `待确认重量（${loadUnit(draft)}）`) : null,
      input(draft.measure === 'time' ? 'durationSeconds' : 'reps', draft.measure === 'time' ? '待确认时长（秒）' : '待确认次数'),
      h('button.training-set-confirm', { type: 'button', 'aria-label': draft.count > 1 ? `确认记录 ${draft.count} 组` : '确认记录这一组', onclick: confirm }, icon('check'))),
    h('div.training-draft-controls', null, type, h('label.training-batch-count', null, h('span', null, '记录'), count),
      h('button.text-btn', { type: 'button', onclick: () => { setDrafts.delete(key); rerenderTraining(); } }, '取消')),
    draft.count > 1 ? h('p.form-hint', null, `确认已完成 ${draft.count} 组相同记录后，点击右侧勾号保存。`) : null);
}

function previousSets(exercise) {
  const last = lastPerformance(state.trainingDays, exercise.id, { before: trainingDay() });
  if (!last) return null;
  return disclosure(`last:${trainingDay()}:${exercise.id}`, 'training-last-sets',
    `上次 ${last.date} · ${last.setCount} 组 · 查看逐组`,
    last.sets.map((set, n) => h('p.form-hint', null, `第 ${n + 1} 组 · ${setLabel(set)}`)));

}

/*
 * 「移除」写在动作行上，不藏进「记组」展开层里。
 *
 * 原先这一行右边只有「记组」，移除是展开之后才出现的第三个按钮 ——
 * 而挑选弹层里那枚已加入的 ✓ 又是点不动的，于是加错一个动作之后，
 * 两条路都走不通，读出来就是「加进去的动作根本删不掉」。
 * 撤销由 removeExerciseWithUndo 给，所以摆在外面也不怕手滑。
 */
function planRow(exercise, index) {
  const item = session().items.find(i => i.id === exercise.id);
  const open = expanded === exercise.id;
  const recorded = item.sets.filter(isRecordedSet).length;
  const label = recorded ? `已记录 ${recorded} 组` : item.done ? '已标记完成' : '尚未记组';
  return h('div.plan-row-wrap', null,
    h('div.plan-row', null,
      h('span.plan-index', null, String(index + 1)),
      h('div.plan-main', null, h('div.ex-name', null, h('strong', null, exercise.name)), h('span.form-hint', null, label)),
      h('div.plan-row-actions', null,
        h('button.text-btn', { type: 'button', 'aria-expanded': String(open),
          'aria-controls': `sets-${exercise.id}`, onclick: () => { expanded = open ? null : exercise.id; rerenderTraining(); },
        }, open ? '收起' : '记组'),
        h('button.text-btn.plan-remove', { type: 'button', 'aria-label': `从本次训练移除 ${exercise.name}`,
          onclick: () => removeExerciseWithUndo(exercise) }, '移除'))),
    open ? (() => {
      const defaults = recordingDefaultsFor(item, state.trainingDays, trainingDay());
      const showWeight = defaults.loadMode !== 'bodyweight' || item.sets.some(s => s.loadMode !== 'bodyweight');
      const variant = exerciseVariants(item.id).find(v => v.id === item.id);
      const settingsLabel = [variant?.label, defaults.loadMode === 'bodyweight' ? '自重' : defaults.loadConvention === 'single' ? '每只／单侧 kg'
        : defaults.loadConvention === 'scale' ? '器械刻度' : defaults.loadMode === 'assistance' ? '辅助重量 kg' : '合计 kg',
        defaults.measure === 'time' ? '按时长' : '按次数'].filter(Boolean).join(' · ');
      return h('div.set-editor', { id: `sets-${exercise.id}` },
        h('button.training-settings-trigger', { type: 'button', onclick: () => recordingSettings(item), 'aria-label': `${exercise.name} 记录设置` },
          h('span', null, settingsLabel), h('span', null, '设置')), previousSets(exercise),
        h('div.training-sets-table', null,
          h('div.training-set-head' + (showWeight ? '' : '.training-timed-row'), null, h('span', null, '组'), showWeight ? h('span', null, '重量') : null,
            h('span', null, defaults.measure === 'time' ? '时长' : '次数'), h('span', null, '完成')),
          item.sets.map((set, k) => setRow(item, k, set, showWeight)), draftSetEditor(item, showWeight)),
        h('div.training-edit-actions', null, h('button.secondary-btn.compact', {
          disabled: item.sets.length >= 20 || setDrafts.has(draftKey(item.id)), onclick: () => {
            setDrafts.set(draftKey(item.id), createSetDraft(item, state.trainingDays, trainingDay())); rerenderTraining();
          } }, item.sets.length >= 20 ? '已达 20 组记录上限' : item.sets.length ? '再加一组' : '加第一组')));
    })() : null);

}

function selectTrainingDate(date) {
  // 原生日期控件之外也做校验，防止空值、未来日期写入记录。
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || shiftDay(date, 0) !== date || date > todayKey()) {
    toast('请选择今天或过去的日期', 'warn');
    rerenderTraining();
    return;
  }
  recordingDate = date === todayKey() ? null : date;
  trainingView = 'current';
  rerenderTraining();
}

function trainingDateControl() {
  const historical = trainingDay() !== todayKey();
  return h('div.training-recording-date', null,
    h('label.form-field', null, h('span', null, historical ? '补记日期' : '训练日期'),
      h('input', { type: 'date', value: trainingDay(), max: todayKey(), 'aria-label': '训练日期',
        onchange: event => selectTrainingDate(event.currentTarget.value) })),
    historical ? h('button.text-btn', { type: 'button', onclick: () => selectTrainingDate(todayKey()) }, '回到今天') : null);
}

function planCard() {
  const list = pickedExercises();
  const add = () => h('button.secondary-btn.training-add', { onclick: openPicker }, pending.size ? `继续选择 · 待加入 ${pending.size}` : '添加动作');
  /*
   * 一个动作都没安排时，这张卡原先只有一句「今天还没有安排动作。」，
   * 底下整屏是空的 —— 而这一栏要回答的是「今天练什么」，它一个字都没答。
   *
   * 两行都是记录里有的事实（`emptyPlanBrief`），不替人开处方：
   * 上次练是什么时候、练的哪儿；近 7 日哪几个部位没有记录。
   * 右边那一栏的覆盖表回答的是「练了多少」，两边不重复。
   * 一条记录都没有的新用户拿不到这两行，空状态就还是原来那一句。
   */
  if (!list.length) {
    const brief = emptyPlanBrief(state.trainingDays, trainingDay());
    return h('section.card.training-current-card', null,
      cardHeader('本次训练', { summary: trainingDay(), actions: brief ? [
        persistentInfoTip('training-empty-brief', '这两行是怎么来的',
          '只统计已记录组数或标记完成的动作，按主练部位归类；未记录不代表没有训练。'),
      ] : [] }),
      emptyState(trainingDay() === todayKey() ? '今天还没有安排动作。' : '这一天还没有安排动作。',
        h('div.training-empty-body', null,
          brief ? h('div.week-rows.training-brief', null, brief.rows.map(r => h('div.week-row', null,
            h('span.week-row-label', null, r.label),
            h('strong.week-row-value', null, r.value)))) : null,
          add())));
  }
  const volume = sessionVolume(session());
  return h('section.card.training-current-card', null,
    cardHeader('本次训练', { summary: `${trainingDay()} · 已安排 ${list.length} 个动作 · 已记录 ${volume.doneSets} 组`,
      actions: [h('button.text-btn', { onclick: async () => {
        const date = trainingDay();
        let removed;
        const result = await updateSession(items => {
          if (items.some(item => item.done || item.sets.length) && !confirmAction(`清空 ${date} 的 ${items.length} 个动作及组数记录？可撤销本次清空。`)) return null;
          removed = items.map((item, index) => ({ item: cloneTrainingItem(item), index }));
          return [];
        }, date);
        if (result.ok && removed) toast(`已清空 ${date} 的动作`, 'info', { label: '撤销', onClick: () => restoreRemoved(removed, date) });
      } }, '清空')] }),
    h('div.plan-list', null, list.map((e, i) => planRow(e, i))),
    add(),
    volume.tonnage ? h('div.training-load-note', null,
      h('span', null, `已录负荷量 ${num(volume.tonnage)} kg·次`),
      persistentInfoTip('training-load-scope', '负荷量统计范围', '已录重量 × 次数之和。自重未换算；辅助重量和不同器械不可当作相同阻力，不能解释为净做功或热量消耗。')) : null);
}

async function replaceExercise(action) {
  const date = trainingDay();
  const old = session().items.find(i => i.id === action.replaces);
  if (!old) return;
  if ((old.sets.length || old.done) && !confirmAction(`替换「${EXERCISE_BY_ID.get(old.id).name}」会移出其 ${old.sets.length} 组记录；新动作从空组开始。可撤销本次替换。继续？`)) return;
  const original = cloneTrainingItem(old);
  const index = session().items.findIndex(i => i.id === old.id);
  let inserted = false;
  const result = await updateSession(items => {
    const live = items.find(i => i.id === old.id);
    if (JSON.stringify(live) !== JSON.stringify(original)) throw Object.assign(new Error('动作已有新修改，请重新查看后替换'), { name: 'TrainingConflictError' });
    inserted = !items.some(i => i.id === action.id);
    return items.flatMap(i => i.id === old.id ? (inserted ? [newTrainingItem(action.id, state.trainingDays, date)] : []) : [i]);
  }, date);
  if (result.ok) toast('已替换动作', 'info', { label: '撤销', onClick: () => updateSession(items => {
    if (inserted) {
      const added = items.find(i => i.id === action.id);
      if (added?.sets.length || added?.done) throw Object.assign(new Error('新动作已有记录，未覆盖。请在对应日期的动作中核对。'), { name: 'TrainingConflictError' });
    }
    return restoreTrainingItems(inserted ? items.filter(i => i.id !== action.id) : items, [{ item: original, index }]);
  }, date) });
}

function adviceCard() {
  const tips = planAdvice(pickedExercises());
  if (!tips.length) return null;
  return h('section.card.training-advice', null,
    cardHeader('训练建议', { actions: [persistentInfoTip('training-advice-method', '训练建议依据', '根据当前动作的主要肌群、动作模式和顺序提供参考。标签相近不等于刺激相同，不要求删除或替换；未评估个人恢复与动作质量。')] }),
    h('div.insight-list', null, tips.map(t => h('div.insight.info', null,
      h('div.insight-title', null, t.title), h('div.insight-text', null, t.text),
      t.actions?.length ? h('div.tip-actions', null, t.actions.map(a => h('button.chip-btn.tip-action', {
        onclick: () => replaceExercise(a),
      }, `替换为：${a.label}`))) : null))));
}

function coverageTable() {
  const model = trainingCoverage(state.trainingDays, todayKey());
  return h('div.training-coverage', null,
    h('div.coverage-row.coverage-heading', null, h('span', null, '部位'), h('span', null, '最近记录'), h('span', null, '近7日')),
    model.groups.map(g => h('div.coverage-row', { 'data-group': g.key },
      h('strong', null, g.label), h('span', { title: g.lastDate || '' }, g.lastLabel), h('span', null, `${g.count} 天`))));
}

let expandedRow = null;
let historyDate = null;
let overviewMode = 'sets';
let plannedOpen = false;
function weeklyCard() {
  const model = trainingHistoryDays(state.trainingDays, todayKey(), historyDate);
  historyDate = model.selected;
  const recorded = model.rows.filter(isRecordedItem), planned = model.rows.filter(row => !isRecordedItem(row));
  return h('section.card.training-history-card', null,
    cardHeader('近 7 日训练记录', { summary: `${shiftDay(todayKey(), -6)} 至 ${todayKey()}` }),
    h('div.training-date-strip', { role: 'group', 'aria-label': '选择训练日期' }, model.days.map(day => h('button.training-date', {
      type: 'button', 'aria-pressed': String(day.date === historyDate),
      'aria-label': `${day.date}${day.recorded ? ' 有训练记录' : ' 暂无记录'}`,
      class: day.date === historyDate ? 'active' : '', onclick: () => { historyDate = day.date; expandedRow = null; plannedOpen = false; rerenderTraining(); },
    }, h('span', null, day.date === todayKey() ? '今天' : ['日','一','二','三','四','五','六'][new Date(day.date + 'T12:00:00').getDay()]),
      h('strong', null, day.date.slice(8)), h('span.training-date-dot', { class: day.recorded ? 'has-records' : '', 'aria-hidden': 'true' })))),
    h('div.training-log-day', null, h('div.training-log-heading', null,
      h('h4', null, `${historyDate} · ${recorded.length} 个动作`),
      h('button.text-btn', { type: 'button', onclick: () => selectTrainingDate(historyDate) }, '编辑')),
      recorded.length ? h('div.log-list', null, recorded.map(r => {
        const key = `${historyDate}:${r.id}`, open = expandedRow === key, validSets = r.sets.filter(isRecordedSet);
        return h('div.log-item', null,
          h('button.log-row', { type: 'button', 'aria-expanded': String(open), onclick: () => { expandedRow = open ? null : key; rerenderTraining(); } },
            h('span.log-name', null, r.name), h('span.log-meta', null, validSets.length ? `${validSets.length} 组` : '已标记完成')),
          open ? h('div.log-sets', null, r.sets.map((set, n) => h('div.log-set', null,
            h('span', null, `第 ${n + 1} 组`), h('span', null, setLabel(set))))) : null);
      })) : emptyState('这一天暂无训练记录。')),
    planned.length ? h('details.training-planned', { open: plannedOpen, ontoggle: ev => { plannedOpen = ev.currentTarget.open; } },
      h('summary', null, `已安排未记录 · ${planned.length} 个动作`), planned.map(r => h('p', null, r.name))) : null);
}

function showAreaDetail(area) {
  const detail = trainingAreaDetail(state.trainingDays, todayKey(), area.key);
  openSheet(h('div.training-area-sheet', null,
    cardHeader(`${area.label} · 近7日`),
    detail.muscles.length ? [
      h('div.coverage-row.coverage-heading', null, h('span', null, '肌群'), h('span', null, '主练'), h('span', null, '协同')),
      detail.muscles.map(m => h('div.coverage-row', null, h('span', null, m.label), h('span', null, `${m.direct} 组`), h('span', null, `${m.secondary} 组`))),
      h('h3', null, '来自这些动作'),
      detail.records.map(r => h('div.training-area-source', null, h('span', null, r.name),
        h('span', null, `${r.date.slice(5)} · ${r.direct ? '主练 ' + r.direct : '协同 ' + r.secondary} 组`))),
    ] : emptyState('近7日暂无该部位的组数记录。')), { label: `${area.label}训练详情` });
}

function weeklyGroupsCard() {
  const model = weeklyTrainingSummary(state.trainingDays, todayKey());
  return h('section.card.training-week-groups', null,
    cardHeader('近 7 日训练概览', { summary: `${model.days} 天 · ${model.recorded} 组`, actions: [
      persistentInfoTip('training-week-groups-method', '训练统计说明',
        `已记录 ${model.recorded} 组，其中正式组 ${model.work}、热身 ${model.warmup}、未区分类型 ${model.unknown}。未区分类型的旧记录保留原值，无需补填。主练与协同分别展示，协同不折半；同组同部位只计一次，各部位不能相加为全身组数。间隔只看主练记录，未记录不代表没练。`),
    ] }),
    h('div.range-switch.training-overview-switch', { role: 'group', 'aria-label': '训练概览内容' },
      [['sets','组数'],['interval','间隔']].map(([key, label]) => h('button.chip-btn', {
        type: 'button', class: overviewMode === key ? 'active' : '', 'aria-pressed': String(overviewMode === key),
        onclick: () => { overviewMode = key; rerenderTraining(); },
      }, label))),
    overviewMode === 'interval' ? coverageTable() : h('div', null,
      h('div.coverage-row.coverage-heading', null, h('span', null, '部位'), h('span', null, '主练'), h('span', null, '协同')),
      model.areas.filter(area => !['biceps','triceps','forearm'].includes(area.key)).map(area =>
        h('button.coverage-row.training-area-row', { type: 'button', 'aria-label': `查看${area.label}训练详情`, onclick: () => showAreaDetail(area) },
          h('strong', null, area.label), h('span', null, `${area.direct} 组`), h('span', null, `${area.secondary} 组`)))));
}

function recommendationBudget() {
  const field = (key, label, options) => h('label.form-field', null, h('span', null, label),
    h('select', { 'aria-label': label, onchange: event => {
      budgetOptions[key] = event.target.value === '' ? null : Number(event.target.value); proposal = null; rerenderPicker();
    } }, options.map(([value, text]) => h('option', { value, selected: String(budgetOptions[key] ?? '') === String(value) }, text))));
  return h('div.form-grid.training-budget', null,
    field('minutes', '本次可用时间', [['','不限'],[15,'15 分钟'],[30,'30 分钟'],[45,'45 分钟'],[60,'60 分钟'],[90,'90 分钟']]),
    field('setBudget', '本次组数预算', [['','不限'],[3,'3 组'],[6,'6 组'],[9,'9 组'],[12,'12 组'],[18,'18 组'],[24,'24 组']]),
    field('setsPerExercise', '每动作预留组数', [[1,'1 组'],[2,'2 组'],[3,'3 组'],[4,'4 组'],[5,'5 组']]));
}

function recommendTip() {
  return persistentInfoTip('training-recommendation-method', '这几个是怎么挑的',
    '在当前范围与器械中，优先近 28 日常练动作，再参考本周已安排模式。已选和待选都占预算；每组含休息暂按 3 分钟估算，预留组数可改。时间估算不是消耗或处方；确认只加入动作，不生成完成组。');
}

function recommendBody(rec) {
  const remaining = () => rec.items.filter(item => !picked().includes(item.id) && !pending.has(item.id));
  const bulk = h('button.secondary-btn.full', { onclick: () => {
    remaining().forEach(item => pending.add(item.id)); rerenderPicker();
  } });
  /*
   * 动作行自己那条 `上次 09-13 · 60–70kg × 12,12,12,15` 已经把日期说了，
   * 所以这一句只在它没出现时才补「上次 X」—— 同一行不印两遍同一个日期。
   */
  const rows = h('div.rec-picks', null, rec.items.map(item => {
    const exercise = EXERCISE_BY_ID.get(item.id);
    const shownAbove = Boolean(lastPerformance(state.trainingDays, item.id, { before: trainingDay() }));
    const last = item.lastDate && !shownAbove ? ` · 上次 ${item.lastDate.slice(5)}` : '';
    return h('div', null,
      exerciseRow(exercise, rerenderPicker,
        pickMode === 'group' ? GROUPS.find(group => group.key === activeGroup)?.muscles : null),
      h('p.form-hint.rec-reason', null, `${item.reason}${last} · 预留 ${item.suggestedSets} 组`));
  }));
  rows.refreshSelection = () => {
    const count = remaining().length;
    bulk.hidden = count === 0;
    bulk.textContent = `选择本批剩余 ${count} 个`;
  };
  rows.refreshSelection();
  return [recommendationBudget(), h('p.form-hint', null, '可只选需要的动作；加入后再记组。'),
    rec.items.length ? rows
      : emptyState(rec.reason || '当前已安排的模式没有可补充候选，可在列表中自行挑选。'),
    bulk];
}

let rerenderTraining = () => {};
document.addEventListener('click', event => {
  if (!equipMenuOpen || event.target.closest?.('.equip-filter-wrap')) return;
  equipMenuOpen = false;
  rerenderPicker();
});

export function renderTraining(root) {
  if (!observingAccount) {
    observingAccount = true;
    subscribeAccount(account => {
      const context = `${account.user?.id || 'local'}:${Boolean(account.ownershipPending)}`;
      if (accountContext !== context) {
        setDrafts.clear(); disclosureState.clear(); resetDisclosures = true; historyDate = null; expandedRow = null;
        pending.clear(); proposal = null; recordingDate = null;
        accountContext = context;
      }
    });
  }
  const date = trainingDay();
  if (uiDay !== date) {
    disclosureState.clear(); resetDisclosures = true; historyDate = null; expandedRow = null;
    uiDay = date; pending.clear(); proposal = null; expanded = null;
    if (pickerRoot?.isConnected) closeSheet({ force: true });
  }
  rerenderTraining = () => renderTraining(root);
  const liveDraftKeys = new Set(session().items.map(item => draftKey(item.id)));
  for (const key of setDrafts.keys()) if (key.startsWith(`${date}:`) && !liveDraftKeys.has(key)) setDrafts.delete(key);
  if (!resetDisclosures) root.querySelectorAll('[data-training-disclosure]').forEach(el => disclosureState.set(el.dataset.trainingDisclosure, el.open));
  resetDisclosures = false;
  const scrollTop = root.scrollTop;
  const content = document.createDocumentFragment();
  const actionSlot = document.getElementById('actionbar');
  if (actionSlot) { clearEl(actionSlot); actionSlot.hidden = true; }
  const tabs = h('div.range-switch.training-view-tabs', segmentedGroupProps('健身视图'),
    [['current', '本次训练'], ['history', '训练记录']].map(([key, label]) => h('button.chip-btn', {
      ...segmentedItemProps(trainingView === key), class: trainingView === key ? 'active' : '',
      id: `training-tab-${key}`, 'aria-controls': `training-panel-${key}`,
      onclick: () => { trainingView = key; renderTraining(root); root.scrollTop = 0; },
    }, label)));
  mount(content, tabs, h('div.training-panel', { id: `training-panel-${trainingView}`, role: 'tabpanel', 'aria-labelledby': `training-tab-${trainingView}` },
    trainingView === 'current' ? [trainingDateControl(), planCard(), adviceCard()] : [weeklyCard(), weeklyGroupsCard()]));
  // Build off-screen and replace atomically: an empty scroll container clamps to zero.
  root.replaceChildren(content);
  root.scrollTop = scrollTop;
}
