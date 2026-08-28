/**
 * 健身：按身体部位或动作模式挑动作，实时指出刺激高度相似的组合，并按天记下来。
 *
 * 计划本身存 IndexedDB（`store.saveTraining`），不再是页面内存里的一个数组——
 * 之前刷新一下当天选的动作就全没了，记不下来的计划等于没记。
 *
 * 只有「当前看哪个部位 / 哪个器械档位 / 哪个动作展开着」这类纯界面状态还放模块级：
 * render* 会被定时器反复重跑，存在 DOM 里会被抹掉。
 */

import { h, clearEl, mount, num, todayKey, infoTip } from '../lib/utils.js';
import { GROUPS, MUSCLES, PATTERNS, EQUIPMENT, EXERCISE_BY_ID } from '../data/exercises.js';
import { state, saveTraining, trainingFor } from '../lib/store.js';
import {
  exercisesForGroup, exercisesForSplit, SPLITS, findOverlaps, coverage, coveredGroupKeys, planAdvice,
  starterCombo, starterSplitCombo,
  sessionVolume, recentExercises, weeklyVolume,
  overlapScore, overlapLevel,
} from '../core/training.js';

let activeGroup = 'chest';
/*
 * 挑动作有两种思路：「今天练胸」按部位，「今天是推的日子」按动作模式。
 * 分化训练用的是后者 —— 推的动作共用三角肌前束和肱三头肌，分开练等于
 * 让这些小肌肉连着两天挨累。两种都留着，用分段控件切。
 */
let pickMode = 'group';     // 'group' 按部位 | 'split' 按推拉腿
let activeSplit = 'push';
// 展开着记组数的那个动作；纯界面状态，不落库
let expanded = null;
/*
 * 动作列表默认只出前几个。一个部位三十来个动作是整整一屏半，
 * 而真正要挑的时候人是先切部位、再切器械档位，把范围缩到几个才开始看——
 * 一上来就铺满，反而看不出这一档里有什么。
 */
const LIST_PREVIEW = 8;
let showAllExercises = false;

const session = () => trainingFor(state.day);
const picked = () => session().items.map((i) => i.id);

/** 改一天的计划：写库 → store 触发重绘，不用自己调 rerender */
async function updateSession(mutate) {
  const current = session();
  const next = mutate(current.items.map((i) => ({ ...i, sets: i.sets.map((x) => ({ ...x })) })));
  await saveTraining(state.day, { items: next });
}
/*
 * 器械筛选。动作库到 100 多个之后，一个部位三十来个动作滑不完，
 * 而且「今天只有固定器械可用」是健身房里最常见的约束——按这个筛比按名字找快得多。
 */
const EQUIP_FILTERS = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'machine', label: '固定器械', match: (e) => e.equipment === 'machine' || e.equipment === 'cable' },
  { key: 'free', label: '自由重量', match: (e) => e.equipment === 'barbell' || e.equipment === 'dumbbell' || e.equipment === 'kettlebell' },
  { key: 'bodyweight', label: '徒手', match: (e) => e.equipment === 'bodyweight' || e.equipment === 'band' },
];
let equipFilter = 'all';

const pickedExercises = () => picked().map((id) => EXERCISE_BY_ID.get(id)).filter(Boolean);

function muscleLine(e) {
  const primary = e.primary.map((m) => MUSCLES[m]).join('、');
  const secondary = e.secondary.map((m) => MUSCLES[m]).join('、');
  return secondary ? `${primary}　协同：${secondary}` : primary;
}

/*
 * 部位标签上带一个点：今天已选的动作练到了这一组。
 *
 * 这原本是人体图唯一比这排标签多给的信息（「今天哪儿练了、哪儿空着」）。
 * 图本身已经删掉 —— 它在真机上一块胸肌只有 19px 宽，画不出能看的解剖细节，
 * 而正下方这排文字标签做的是同一件事，还说得更清楚。只把这条信息搬过来。
 * 协同肌也算：卧推练到了三头，问「肩臂今天空着吗」时它不该算空着。
 */
function groupTabs(rerender) {
  const covered = coveredGroupKeys(picked());
  return h('div.range-switch.body-part-switch', null,
    GROUPS.map((g) => {
      const done = covered.has(g.key);
      return h('button', {
        class: `chip-btn${activeGroup === g.key ? ' active' : ''}`,
        type: 'button', 'aria-pressed': String(activeGroup === g.key),
        // 点是纯装饰，读屏软件按这句话来
        'aria-label': done ? `${g.label}（今天已练到）` : g.label,
        onclick: () => { activeGroup = g.key; showAllExercises = false; rerender(); },
      }, g.label, done ? h('span.tab-dot', { 'aria-hidden': 'true' }) : null);
    }));
}

/** 身体部位 / 动作模式 —— 两种挑法之间切换 */
function modeTabs(rerender) {
  return h('div.range-switch', null,
    [['group', '身体部位'], ['split', '动作模式']].map(([key, label]) => h('button', {
      class: `chip-btn${pickMode === key ? ' active' : ''}`,
      type: 'button', 'aria-pressed': String(pickMode === key),
      onclick: () => { pickMode = key; showAllExercises = false; rerender(); },
    }, label)));
}

function splitTabs(rerender) {
  return h('div.range-switch', null,
    SPLITS.map((sp) => h('button', {
      class: `chip-btn${activeSplit === sp.key ? ' active' : ''}`,
      type: 'button', 'aria-pressed': String(activeSplit === sp.key),
      onclick: () => { activeSplit = sp.key; showAllExercises = false; rerender(); },
    }, sp.label)));
}

/** 已选动作里，和这个动作重合度最高的那一个（用来在列表上直接标出来） */
function clashWith(e) {
  let worst = null;
  for (const other of pickedExercises()) {
    if (other.id === e.id) continue;
    const score = overlapScore(e, other);
    if (overlapLevel(score) === 'none') continue;
    if (!worst || score > worst.score) worst = { other, score, level: overlapLevel(score) };
  }
  return worst;
}

function exerciseRow(e, rerender, lastDone) {
  const chosen = picked().includes(e.id);
  const clash = chosen ? null : clashWith(e);
  return h('button.ex-row', {
    class: `ex-row${chosen ? ' chosen' : ''}`,
    onclick: () => {
      updateSession((items) => (chosen
        ? items.filter((i) => i.id !== e.id)
        : [...items, { id: e.id, sets: [], done: false }]));
    },
  },
  h('div.ex-main', null,
    h('div.ex-name', null, h('strong', null, e.name)),
    /*
     * 默认只给一行：主要练哪儿 · 什么模式。
     * 原先每行都把主动肌和所有协同肌铺开（「胸大肌中部　协同：三角肌前束、肱三头肌」），
     * 十几行叠起来全是同一批肌肉名，扫的时候反而找不到动作名在哪。
     * 协同肌收进「已选动作建议」那张卡——真要看细节是在排计划的时候，不是在挑的时候。
     */
    h('div.ex-muscle', null,
      `${MUSCLES[e.primary[0]] || ''} · ${PATTERNS[e.pattern]}`,
      e.compound ? h('span.ex-tag.compound', null, '复合') : null),
    clash && clash.level === 'high'
      ? h('div.ex-clash', null, `与已选的「${clash.other.name}」刺激高度相似`)
      : clash ? h('div.ex-clash.soft', null, `与「${clash.other.name}」部分重叠`) : null,
    // 标出上次练过是哪天，省得每次从头翻
    lastDone && !chosen ? h('div.ex-last', null, `上次 ${lastDone.slice(5)}`) : null),
  h('span.ex-pick', null, chosen ? '✓' : '＋'));
}

function equipTabs(rerender, all) {
  // 器械档位本来就是互斥的一组选择，和上面两排一样用分段控件。
  // 它原先借的是趋势卡那个 .chart-switch —— 那套样式带着一条分隔线和
  // 10px 上内边距（给「图下面还有别的内容」用的），套在灰槽里就成了
  // 一行说不出理由的空白。趋势卡早就改用下拉了，那套样式已无人使用。
  return h('div.range-switch', null,
    EQUIP_FILTERS.map((f) => {
      const n = all.filter(f.match).length;
      return h('button', {
        class: `chip-btn${equipFilter === f.key ? ' active' : ''}${n ? '' : ' empty'}`,
        type: 'button', 'aria-pressed': String(equipFilter === f.key),
        onclick: () => { equipFilter = f.key; showAllExercises = false; rerender(); },
      }, `${f.label} ${n}`);
    }));
}

function pickerCard(rerender) {
  const lastDoneAt = new Map(
    recentExercises(state.trainingDays, { limit: 200, before: state.day })
      .map((r) => [r.exercise.id, r.date]),
  );
  const byGroup = pickMode === 'group';
  const all = byGroup ? exercisesForGroup(activeGroup) : exercisesForSplit(activeSplit);
  const filter = EQUIP_FILTERS.find((f) => f.key === equipFilter) || EQUIP_FILTERS[0];
  const list = all.filter(filter.match);
  const group = GROUPS.find((g) => g.key === activeGroup);
  const split = SPLITS.find((sp) => sp.key === activeSplit);
  const scopeLabel = byGroup ? group.label : `${split.label}的动作`;
  /*
   * 收起时也不能把已选的动作藏掉：这一行的 ✓ 就是取消选择的入口，
   * 藏起来等于选了就撤不掉。排在第 8 个之后的已选项直接接到末尾，
   * 不打乱原顺序（同部位是按主次排的）。
   */
  const chosen = new Set(picked());
  const visible = showAllExercises
    ? list
    : [...list.slice(0, LIST_PREVIEW), ...list.slice(LIST_PREVIEW).filter((e) => chosen.has(e.id))];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '动作选择'),
      h('span.card-tag', null, `${scopeLabel} · ${list.length} 个`)),
    // 部位图只在按部位挑的时候有意义：推拉腿是跨部位的
    modeTabs(rerender),
    byGroup ? groupTabs(rerender) : splitTabs(rerender),
    equipTabs(rerender, all),
    list.length
      ? h('div.ex-list', null, visible.map((e) => exerciseRow(e, rerender, lastDoneAt.get(e.id))))
      : h('p.empty-hint', null, `${scopeLabel}里没有${filter.label}动作，换个器械档位看看。`),
    list.length > LIST_PREVIEW ? h('button.more-btn', {
      onclick: () => { showAllExercises = !showAllExercises; rerender(); },
    }, showAllExercises ? `只看前 ${LIST_PREVIEW} 个` : `展开其余 ${list.length - LIST_PREVIEW} 个`) : null);
}

/*
 * 组数用一行一组，不用「组数 × 次数」两个数字。
 * 递减组、爬坡加重这些真实练法里每组本来就不一样，压成两个数字会逼人取平均。
 *
 * 输入用 change 而不是 input：每敲一个字符就落库会让 iOS 在输入过程中重绘，
 * 键盘会被收起来（视图渲染那节记过这个坑）。
 */
function setRow(item, index, set) {
  const numberInput = (key, placeholder, step) => h('input.set-input', {
    type: 'number', inputmode: 'decimal', step, min: 0,
    value: set[key] == null ? '' : set[key],
    placeholder,
    onchange: (ev) => {
      const raw = ev.target.value.trim();
      updateSession((items) => items.map((i) => (i.id === item.id
        ? { ...i, sets: i.sets.map((x, k) => (k === index ? { ...x, [key]: raw === '' ? null : Number(raw) } : x)) }
        : i)));
    },
  });
  return h('div.set-row', null,
    h('span.set-index', null, `${index + 1}`),
    numberInput('weightKg', '重量', '0.5'),
    h('span.set-unit', null, 'kg ×'),
    numberInput('reps', '次数', '1'),
    h('span.set-unit', null, '次'),
    h('button.text-btn.danger', {
      onclick: () => updateSession((items) => items.map((i) => (i.id === item.id
        ? { ...i, sets: i.sets.filter((_, k) => k !== index) } : i))),
      'aria-label': '删除这一组',
    }, '×'));
}

function planRow(exercise, index) {
  const item = session().items.find((i) => i.id === exercise.id) || { id: exercise.id, sets: [] };
  const open = expanded === exercise.id;
  const heaviest = Math.max(...item.sets.map((x) => x.weightKg || 0), 0);
  const setSummary = item.sets.length
    ? `${item.sets.length}组${heaviest > 0 ? ` · ${num(heaviest, 1)}kg` : ''}`
    : '记组数';
  return h('div.plan-row-wrap', null,
    h('div.plan-row', null,
      h('span.plan-index', null, String(index + 1)),
      h('div.plan-main', null,
        h('div.ex-name', null, h('strong', null, exercise.name),
          h('span.ex-tag', null, EQUIPMENT[exercise.equipment])),
        h('div.ex-muscle', null, muscleLine(exercise))),
      h('button.text-btn', {
        class: `text-btn${item.sets.length ? ' has-sets' : ''}`,
        onclick: () => { expanded = open ? null : exercise.id; rerenderTraining(); },
      }, setSummary),
      h('button.text-btn.danger', {
        onclick: () => updateSession((items) => items.filter((i) => i.id !== exercise.id)),
      }, '移除')),
    open ? h('div.set-editor', null,
      item.sets.length
        ? item.sets.map((set, k) => setRow(item, k, set))
        : h('p.form-hint', null, '还没记组数。重量留空也可以，只记次数一样能统计组数。'),
      h('button.secondary-btn.full', {
        style: { marginTop: '8px' },
        onclick: () => updateSession((items) => items.map((i) => {
          if (i.id !== exercise.id) return i;
          // 新的一组默认沿用上一组的重量和次数：连续几组同重量是最常见的情况
          const last = i.sets[i.sets.length - 1];
          return { ...i, sets: [...i.sets, { reps: last?.reps ?? null, weightKg: last?.weightKg ?? null }] };
        })),
      }, item.sets.length ? '再加一组' : '加第一组')) : null);
}

function planCard() {
  const list = pickedExercises();
  const dayLabel = state.day === todayKey() ? '已选动作建议' : `${state.day} 的训练`;
  if (!list.length) {
    // 空态只说下一步做什么。原先那三行解释谁都不会在「还没开始」的时候读
    return h('section.card', null,
      h('div.card-head', null, h('h3', null, dayLabel)),
      h('p.empty-hint', null, '请添加训练动作'));
  }
  const overlaps = findOverlaps(list);
  const cov = coverage(list).filter((c) => c.exercises > 0);
  const volume = sessionVolume(session());
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, dayLabel),
      h('div.card-head-actions', null,
        h('span.card-tag', null, volume.sets
          ? `${list.length} 个动作 · ${volume.sets} 组${volume.tonnage ? ` · ${num(volume.tonnage)} kg` : ''}`
          : `${list.length} 个动作`),
        h('button.text-btn', { onclick: () => updateSession(() => []) }, '清空'))),
    h('div.plan-list', null, list.map((e, i) => planRow(e, i))),
    cov.length ? h('p.form-hint', { style: { marginTop: '10px' } },
      `覆盖部位：${cov.map((c) => `${c.label}(${c.exercises})`).join('　')}`) : null,
    overlaps.length ? null : h('p.form-hint', null, '这套动作之间没有明显重复。'));
}

/*
 * 建议里的动作名直接做成按钮。
 * 「还没练到三角肌后束」念完还得回列表里翻，问题等于原样退回给用户；
 * 点一下就加进今日计划（若是替换建议，同时把被换掉的那个移走）才叫建议。
 */
function tipAction(a, rerender) {
  return h('button.chip-btn.tip-action', {
    onclick: () => {
      updateSession((items) => {
        const kept = a.replaces ? items.filter((i) => i.id !== a.replaces) : items;
        return kept.some((i) => i.id === a.id) ? kept : [...kept, { id: a.id, sets: [], done: false }];
      });
    },
  },
  h('span', null, `＋ ${a.label}`),
  a.note ? h('span.tip-action-note', null, a.note) : null);
}

function adviceCard(rerender) {
  const tips = planAdvice(pickedExercises());
  if (!tips.length) return null;
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '训练建议')),
    h('div.insight-list', null, tips.map((t) => h(`div.insight.${t.level}`, null,
      h('div.insight-title', null, t.title),
      h('div.insight-text', null, t.text),
      t.actions?.length
        ? h('div.tip-actions', null, t.actions.map((a) => tipAction(a, rerender)))
        : null))));
}

/**
 * 近 7 天各部位练了多少组。
 *
 * 只报数字，不给「每周该练几组」的结论——那要结合训练年限、恢复能力和目的，
 * 从「这周练了什么」里看不出来，给了也是拍脑袋。
 */
function weeklyCard() {
  const week = weeklyVolume(state.trainingDays, state.day);
  if (!week.sessions) return null;
  const rows = GROUPS.map((g) => [g.label, week.byGroup[g.key] || 0]).filter(([, n]) => n > 0);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '近 7 天训练量'),
      h('span.card-tag', null, `${week.sessions} 次 · ${week.sets} 组`)),
    h('div.health-strip', null, rows.map(([label, n]) => h('div.health-cell', null,
      h('div.health-value', null, String(n), h('span.health-unit', null, '组')),
      h('div.health-label', null, label)))),
    h('p.form-hint', { style: { marginTop: '10px' } },
      `统计 ${week.start} 至 ${week.end} 记下来的组数。这里只报数，不给「每周该练几组」的结论——`
      + '合适的量取决于训练年限、恢复情况和目的，从练了什么看不出来。'));
}

/** 没选动作时，给个「这个部位怎么练」的起手方案 */
function starterCard(rerender) {
  if (picked().length) return null;
  const byGroup = pickMode === 'group';
  const group = GROUPS.find((g) => g.key === activeGroup);
  const split = SPLITS.find((s) => s.key === activeSplit);
  const combo = byGroup ? starterCombo(activeGroup) : starterSplitCombo(activeSplit);
  if (!combo.length) return null;
  const scopeLabel = byGroup ? group.label : split.label;
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '动作推荐'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${scopeLabel} · 参考组合`),
        infoTip('查看这套怎么来的',
          h('p', null, '按当前范围选出 4–5 个互补动作，优先覆盖不同动作模式并减少重复。它只是可编辑的起手模板，不是最低动作数量。')))),
    h('div.plan-list', null, combo.map((e, i) => h('div.plan-row', null,
      h('span.plan-index', null, String(i + 1)),
      h('div.plan-main', null,
        h('div.ex-name', null, h('strong', null, e.name)),
        h('div.ex-muscle', null, `${MUSCLES[e.primary[0]] || ''} · ${PATTERNS[e.pattern]}`))))),
    h('button.secondary-btn.full', {
      style: { marginTop: '12px' },
      onclick: () => updateSession(() => combo.map((e) => ({ id: e.id, sets: [], done: false }))),
    }, '用这套开始'));
}

/*
 * 展开/收起组数编辑器这类纯界面状态改不了 store，触发不了订阅重绘，
 * 所以留一个直接重画本页的入口。
 */
let rerenderTraining = () => {};

export function renderTraining(root) {
  const rerender = () => renderTraining(root);
  rerenderTraining = rerender;
  clearEl(root);
  mount(root,
    planCard(),
    adviceCard(rerender),
    weeklyCard(),
    starterCard(rerender),
    pickerCard(rerender),
  );
}
