/** Fitness: today recording and history; action selection is a shared sheet with an explicit commit. */
import { h, clearEl, mount, num, todayKey, shiftDay, daySeed, toast, runLocalAction, confirmAction } from '../lib/utils.js';
import { icon, setIcon } from '../lib/icons.js';
import {
  listRow, persistentInfoTip, searchField, cardHeader, emptyState,
  segmentedGroupProps, segmentedItemProps,
} from '../lib/ui.js';
import {
  GROUPS, MUSCLES, PATTERNS, EQUIPMENT, EXERCISE_BY_ID, searchExercises,
} from '../data/exercises.js';
import { state, saveTraining, trainingFor } from '../lib/store.js';
import { selectBar } from '../lib/select-bar.js';
import { openSheet, closeSheet, setSheetFooter } from '../lib/sheet.js';
import {
  exercisesForGroup, exercisesForSplit, SPLITS, coveredGroupKeys, planAdvice,
  recommendFor, exerciseTags, EQUIP_FILTERS, equipFilterOf, lastPerformance,
  sessionVolume, recentTrainingRows, trainingCoverage,
  overlapScore, overlapLevel, restoreTrainingItems,
} from '../core/training.js';

let activeGroup = 'chest';
let pickMode = 'group';     // 'group' 按部位 | 'split' 按推拉腿
let activeSplit = 'push';
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

const trainingDay = () => todayKey();
const session = () => trainingFor(trainingDay());
const picked = () => session().items.map((i) => i.id);

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
  const key = [pickMode, activeGroup, activeSplit, equipFilter].join(':');
  if (!proposal || key !== proposalKey) {
    proposalKey = key;
    proposal = recommendFor({ mode: pickMode, groupKey: activeGroup, splitKey: activeSplit,
      selection: [...picked(), ...pending], equip: equipFilter, seed: daySeed(trainingDay()) });
  }
  return proposal;
}

function rerenderPicker() {
  if (!pickerRoot?.isConnected) return;
  const scroll = pickerRoot.closest('.sheet-scroll');
  const top = scroll?.scrollTop || 0;
  const active = document.activeElement;
  const label = active?.getAttribute('aria-label');
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
  const header = h('div.training-picker-head', null, h('h2', null, '添加动作'),
    h('button.icon-btn', { type: 'button', 'aria-label': '关闭动作选择', onclick: () => closeSheet() }, icon('close')));
  openSheet(h('div.training-picker', null, header, pickerRoot), {
    label: '添加训练动作', onClose: () => { pickerRoot = null; pickerBar = null; rerenderTraining(); },
    returnFocus: () => document.querySelector('.training-add'),
  });
  setSheetFooter(pickerBar.el);
  pickerBar.onVisibility = visible => { const footer = pickerBar?.el.closest('.sheet-footer'); if (footer) footer.hidden = !visible; };
  rerenderPicker();
}

let equipFilter = 'all';
// 器械菜单属于纯界面状态：换器械会重绘，但菜单不应因此自动收起。
let equipMenuOpen = false;

const pickedExercises = () => picked().map((id) => EXERCISE_BY_ID.get(id)).filter(Boolean);

function muscleLine(e) {
  const primary = e.primary.map((m) => MUSCLES[m]).join('、');
  const secondary = e.secondary.map((m) => MUSCLES[m]).join('、');
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
        'aria-label': done ? `${g.label}（今日已安排）` : g.label,
        onclick: () => { activeGroup = g.key; showAllExercises = false; rerender(); },
      }, g.label, done ? h('span.tab-dot', { 'aria-hidden': 'true' }) : null);
    }));
}

function modeSelect(rerender) {
  const select = h('select.picker-mode-select', {
    'aria-label': '按什么挑动作',
    onchange: (ev) => { pickMode = ev.currentTarget.value; showAllExercises = false; rerender(); },
  }, [['group', '按身体部位'], ['split', '按动作模式']].map(([key, label]) => h('option', { value: key }, label)));
  // 选中项要在节点建好之后再设：给还没挂上的 option 设 selected 会被按 selectedIndex 打回第一项
  select.value = pickMode;
  return h('div.picker-mode-field', null,
    select,
    // 展开箭头是画出来的 chevron 转 90°，和趋势卡、设置页用的是同一个形
    h('span.picker-mode-caret', { 'aria-hidden': 'true' }, icon('chevron')));
}

function splitTabs(rerender) {
  return h('div.range-switch.picker-scope-switch', {
    ...segmentedGroupProps('动作模式'),
    style: { '--picker-cols': String(SPLITS.length) },
  },
    SPLITS.map((sp) => h('button', {
      class: `chip-btn${activeSplit === sp.key ? ' active' : ''}`,
      ...segmentedItemProps(activeSplit === sp.key),
      onclick: () => { activeSplit = sp.key; showAllExercises = false; rerender(); },
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

function clashLine(e) {
  if (picked().includes(e.id) || pending.has(e.id)) return null;
  const clash = clashWith(e);
  if (!clash) return null;
  return clash.level === 'high'
    ? { cls: 'ex-clash', badge: '模式相近', detail: `与「${clash.other.name}」动作模式相近` }
    : { cls: 'ex-clash soft', badge: '部分相近', detail: `和「${clash.other.name}」部分重叠` };
}

function exerciseMeta(tags) {
  const classes = ['pattern', 'muscle', 'type'];
  return h('div.exercise-meta', null,
    tags.map((tag, index) => h('span', {
      class: `exercise-meta-tag ${classes[index] || 'detail'}`,
    }, tag)));
}

function lastLine(exercise) {
  const last = lastPerformance(state.trainingDays, exercise.id, { before: todayKey() });
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
    'aria-label': `${chosen ? '已加入' : marked ? '取消选择' : '选择'} ${e.name}`, disabled: chosen,
    onclick: async () => {
      // 已加入的动作在本次训练中管理，选择面板只维护待选项。
      if (chosen || committing) return;
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
  const clashNode = h('button.ex-clash-slot', { type: 'button',
    onclick: (event) => {
      const detail = clashNode.dataset.detail;
      if (!detail) return;
      event.preventDefault();
      event.stopPropagation();
      toast(detail, 'info');
    },
  });
  const row = listRow({
    className: `ex-row exercise-choice-row${chosen ? ' chosen' : ''}${marked ? ' marked' : ''}`,
  },
  h('div.ex-main.exercise-choice-main', null,
    h('div.ex-name', null, h('strong', null, e.name)),
    exerciseMeta(exerciseTags(e, { scopeMuscles })),
    lastLine(e),
    clashNode),
  pickNode);

  row.syncClash = () => {
    const line = clashLine(e);
    // 保留 ex-clash-slot：整条 className 覆盖掉的话，提示消失之后
    // `:empty { display: none }` 就不再命中，行里会留一道空白
    clashNode.className = line ? `ex-clash-slot ${line.cls}` : 'ex-clash-slot';
    clashNode.textContent = line ? line.badge : '';
    clashNode.dataset.detail = line ? line.detail : '';
    clashNode.title = line ? line.detail : '';
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
  const list = all.filter(filter.match);
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

  const controls = h('div.picker-controls', null,
    h('div.picker-scope-row', null, modeSelect(rerender), equipMenu(rerender, all)),
    byGroup ? groupTabs(rerender) : splitTabs(rerender));
  const scopeName = h('strong.picker-scope-name', null, byGroup ? `${group.label}部动作` : `${split.label}的动作`);
  const scopeCount = h('span.picker-scope-count', null,
    showRecommend ? `${rec.items.length} 个推荐` : `${list.length} 个`);
  const listHead = h('div.picker-list-head', null,
    h('div.picker-scope', null, scopeName, scopeCount),
    viewTabs);
  const search = searchField({
    className: 'exercise-search-row',
    inputClassName: 'exercise-search-input',
    value: exerciseQuery,
    ariaLabel: '搜索动作，支持中文、拼音或英文', placeholder: '搜索动作、拼音或英文',
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
      ...ids.filter(id => !items.some(item => item.id === id)).map(id => ({ id, sets: [], done: false }))], date);
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
      return e ? { key: id, label: e.name, note: `${MUSCLES[e.primary[0]] || ''} · ${PATTERNS[e.pattern]}` } : null;
    }).filter(Boolean),
    onRemove: (id) => { pending.delete(id); rerenderPicker(); },
    onClear: () => { pending = new Set(); rerenderPicker(); },
    onConfirm: () => commitPending(),
  });
  bar.el.classList.add('training-select-bar');
  return bar;
}

function setRow(item, index, set) {
  const date = trainingDay();
  const numberInput = (key, placeholder, step) => h('input.set-input', {
    type: 'number', inputmode: 'decimal', step, min: 0,
    'aria-label': `${EXERCISE_BY_ID.get(item.id)?.name} 第 ${index + 1} 组${placeholder}${key === 'weightKg' ? ' kg' : ''}`,
    value: set[key] == null ? '' : set[key],
    placeholder,
    onchange: (ev) => {
      const raw = ev.target.value.trim();
      updateSession((items) => items.map((i) => (i.id === item.id
        ? { ...i, sets: i.sets.map((x, k) => (k === index ? { ...x, [key]: raw === '' ? null : Number(raw) } : x)) }
        : i)), date);
    },
  });
  return h('div.set-row', null,
    h('span.set-index', null, `${index + 1}`),
    numberInput('weightKg', '重量', '0.5'),
    h('span.set-unit', null, 'kg ×'),
    numberInput('reps', '次数', '1'),
    h('span.set-unit', null, '次'),
    h('button.text-btn.danger', {
      onclick: async () => {
        let removed;
        const result = await updateSession((items) => items.map((i) => {
          if (i.id !== item.id || !i.sets[index]) return i;
          removed = { ...i.sets[index] };
          return { ...i, sets: i.sets.filter((_, k) => k !== index) };
        }), date);
        if (!result.ok || !removed) return;
        toast('已删除这一组', 'info', {
          label: '撤销',
          onClick: () => updateSession((items) => items.map((i) => {
            if (i.id !== item.id) return i;
            const sets = [...i.sets];
            sets.splice(Math.min(index, sets.length), 0, { ...removed });
            return { ...i, sets };
          }), date),
        });
      },
      'aria-label': '删除这一组',
    }, icon('close')));
}

function planRow(exercise, index) {
  const item = session().items.find(i => i.id === exercise.id);
  const open = expanded === exercise.id;
  const recorded = item.sets.filter(set => set.reps > 0).length;
  const label = recorded ? `已记录 ${recorded} 组` : item.done ? '已标记完成' : '尚未记组';
  return h('div.plan-row-wrap', null,
    h('div.plan-row', null,
      h('span.plan-index', null, String(index + 1)),
      h('div.plan-main', null, h('div.ex-name', null, h('strong', null, exercise.name)), h('span.form-hint', null, label)),
      h('button.text-btn', { type: 'button', 'aria-expanded': String(open),
        'aria-controls': `sets-${exercise.id}`, onclick: () => { expanded = open ? null : exercise.id; rerenderTraining(); },
      }, open ? '收起' : '记组')),
    open ? h('div.set-editor', { id: `sets-${exercise.id}` },
      h('p.form-hint', null, `${EQUIPMENT[exercise.equipment]} · 主练 ${muscleLine(exercise)}`),
      item.sets.length ? item.sets.map((set, k) => setRow(item, k, set))
        : h('p.form-hint', null, '重量可留空；填写次数后计为已记录组。'),
      h('div.training-edit-actions', null,
        h('button.secondary-btn', { onclick: () => updateSession(items => items.map(i => {
          if (i.id !== exercise.id) return i;
          const last = i.sets.at(-1);
          return { ...i, sets: [...i.sets, { reps: last?.reps ?? null, weightKg: last?.weightKg ?? null }] };
        })) }, item.sets.length ? '再加一组' : '加第一组'),
        h('button.text-btn.danger', { onclick: () => removeExerciseWithUndo(exercise) }, '移除动作'))) : null);
}

function planCard() {
  const list = pickedExercises();
  const add = () => h('button.secondary-btn.training-add', { onclick: openPicker }, pending.size ? `继续选择 · 待加入 ${pending.size}` : '添加动作');
  if (!list.length) return h('section.card.training-current-card', null,
    cardHeader('本次训练', { summary: trainingDay() }),
    emptyState('今天还没有安排动作。', add()));
  const volume = sessionVolume(session());
  return h('section.card.training-current-card', null,
    cardHeader('今日动作', { summary: `${trainingDay()} · 已安排 ${list.length} 个动作 · 已记录 ${volume.doneSets} 组`,
      actions: [h('button.text-btn', { onclick: async () => {
        const date = trainingDay();
        let removed;
        const result = await updateSession(items => {
          if (items.some(item => item.done || item.sets.length) && !confirmAction(`清空 ${date} 的 ${items.length} 个动作及组数记录？可撤销本次清空。`)) return null;
          removed = items.map((item, index) => ({ item: cloneTrainingItem(item), index }));
          return [];
        }, date);
        if (result.ok && removed) toast('已清空今日动作', 'info', { label: '撤销', onClick: () => restoreRemoved(removed, date) });
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
    return items.flatMap(i => i.id === old.id ? (inserted ? [{ id: action.id, sets: [], done: false }] : []) : [i]);
  }, date);
  if (result.ok) toast('已替换动作', 'info', { label: '撤销', onClick: () => updateSession(items => {
    if (inserted) {
      const added = items.find(i => i.id === action.id);
      if (added?.sets.length || added?.done) throw Object.assign(new Error('新动作已有记录，未覆盖。请在今日动作中核对。'), { name: 'TrainingConflictError' });
    }
    return restoreTrainingItems(inserted ? items.filter(i => i.id !== action.id) : items, [{ item: original, index }]);
  }, date) });
}

let adviceOpen = false;
function adviceCard() {
  const tips = planAdvice(pickedExercises());
  if (!tips.length) return null;
  return h('details.card.training-advice', { open: adviceOpen, ontoggle: ev => { adviceOpen = ev.currentTarget.open; } },
    h('summary', null, h('strong', null, '训练建议'), h('span', null, `${tips.length} 项可选参考`)),
    h('div.insight-list', null, tips.map(t => h('div.insight.info', null,
      h('div.insight-title', null, t.title), h('div.insight-text', null, t.text),
      t.actions?.length ? h('div.tip-actions', null, t.actions.map(a => h('button.chip-btn.tip-action', {
        onclick: () => replaceExercise(a),
      }, `替换为：${a.label}`))) : null))));
}

function coverageCard() {
  const model = trainingCoverage(state.trainingDays, trainingDay());
  return h('section.card.training-coverage', null,
    cardHeader('部位训练间隔', { summary: '按已记录的有效次数或完成标记统计；未记录不代表没有训练。',
      actions: [persistentInfoTip('training-coverage-method', '查看训练覆盖统计口径',
        '只统计主练部位，协同肌不另计。同部位同日计一次；近7日含今天及此前6天。空计划不计入。')] }),
    h('div.coverage-table', { role: 'table', 'aria-label': '各部位训练间隔和近7日覆盖' },
      h('div.coverage-row.coverage-heading', { role: 'row' },
        h('span', { role: 'columnheader' }, '部位'), h('span', { role: 'columnheader' }, '最近记录'), h('span', { role: 'columnheader' }, '近7日')),
      model.groups.map(g => h('div.coverage-row', { role: 'row', 'data-group': g.key },
        h('strong', { role: 'cell' }, g.label), h('span', { role: 'cell', title: g.lastDate || '' }, g.lastLabel),
        h('span', { role: 'cell' }, `${g.count} 次`)))));
}

let expandedRow = null;
let plannedOpen = false;
function weeklyCard() {
  const rows = recentTrainingRows(state.trainingDays, trainingDay());
  const recorded = rows.filter(r => r.done || r.sets.some(s => s.reps > 0));
  const planned = rows.filter(r => !recorded.includes(r));
  const dates = [...new Set(recorded.map(r => r.date))];
  return h('section.card.training-history-card', null,
    cardHeader('近 7 日训练记录', { summary: `${shiftDay(trainingDay(), -6)} 至 ${trainingDay()} · ${num(dates.length)} 个记录日 · ${recorded.length} 个已记录动作` }),
    recorded.length ? dates.map(date => h('div.training-log-day', null,
      h('h4', null, date), h('div.log-list', null, recorded.filter(r => r.date === date).map(r => {
        const key = `${date}:${r.id}`, open = expandedRow === key;
        const validSets = r.sets.filter(s => s.reps > 0);
        return h('div.log-item', null,
          h('button.log-row', { type: 'button', 'aria-expanded': String(open), onclick: () => { expandedRow = open ? null : key; rerenderTraining(); } },
            h('span.log-name', null, r.name), h('span.log-meta', null, validSets.length ? `${validSets.length} 组 · ${r.weightLabel || '重量未填'}` : '已标记完成')),
          open ? h('div.log-sets', null, r.sets.map((set, n) => h('div.log-set', null,
            h('span', null, `第 ${n + 1} 组`), h('span', null, `${set.weightKg > 0 ? set.weightKg + ' kg' : '重量未填'} × ${set.reps > 0 ? set.reps + ' 次' : '次数未填'}`)))) : null);
      })))) : emptyState('近 7 日还没有已记录的训练。'),
    planned.length ? h('details.training-planned', { open: plannedOpen, ontoggle: ev => { plannedOpen = ev.currentTarget.open; } },
      h('summary', null, `已安排但未记组数 · ${planned.length} 个动作`),
      planned.map(r => h('p', null, `${r.date} · ${r.name} · 未记组数`))) : null);
}

function recommendTip() {
  return persistentInfoTip('training-recommendation-method', '这几个是怎么挑的',
    '在当前范围与器械中，按不同动作模式提供可编辑候选。已安排的模式不自动补齐；不是必须完成的清单，也不代表按个人训练目标制定的处方。');
}

function recommendBody(rec) {
  const remaining = () => rec.items.filter(item => !picked().includes(item.id) && !pending.has(item.id));
  const bulk = h('button.secondary-btn.full', { onclick: () => {
    remaining().forEach(item => pending.add(item.id)); rerenderPicker();
  } });
  const rows = h('div.rec-picks', null, rec.items.map(item => exerciseRow(EXERCISE_BY_ID.get(item.id), rerenderPicker,
    pickMode === 'group' ? GROUPS.find(group => group.key === activeGroup)?.muscles : null)));
  rows.refreshSelection = () => {
    const count = remaining().length;
    bulk.hidden = count === 0;
    bulk.textContent = `选择本批剩余 ${count} 个`;
  };
  rows.refreshSelection();
  return [h('p.form-hint', null, '本批候选保持不变，可只选需要的动作。确认加入后返回本次训练。'),
    rec.items.length ? rows
      : emptyState('当前已安排的模式没有可补充候选，可在列表中自行挑选。'),
    bulk];
}

let rerenderTraining = () => {};
document.addEventListener('click', event => {
  if (!equipMenuOpen || event.target.closest?.('.equip-filter-wrap')) return;
  equipMenuOpen = false;
  rerenderPicker();
});

export function renderTraining(root) {
  const date = trainingDay();
  if (uiDay !== date) {
    uiDay = date; pending.clear(); proposal = null; expanded = null;
    if (pickerRoot?.isConnected) closeSheet({ force: true });
  }
  rerenderTraining = () => renderTraining(root);
  clearEl(root);
  const actionSlot = document.getElementById('actionbar');
  if (actionSlot) { clearEl(actionSlot); actionSlot.hidden = true; }
  const tabs = h('div.range-switch.training-view-tabs', segmentedGroupProps('健身视图'),
    [['current', '本次训练'], ['history', '训练记录']].map(([key, label]) => h('button.chip-btn', {
      ...segmentedItemProps(trainingView === key), class: trainingView === key ? 'active' : '',
      id: `training-tab-${key}`, 'aria-controls': `training-panel-${key}`,
      onclick: () => { trainingView = key; renderTraining(root); root.scrollTop = 0; },
    }, label)));
  mount(root, tabs, h('div.training-panel', { id: `training-panel-${trainingView}`, role: 'tabpanel', 'aria-labelledby': `training-tab-${trainingView}` },
    trainingView === 'current' ? [planCard(), adviceCard()] : [weeklyCard(), coverageCard()]));
}
