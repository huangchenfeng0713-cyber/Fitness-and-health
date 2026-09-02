/**
 * 健身：按身体部位或动作模式挑动作，实时指出刺激高度相似的组合，并按天记下来。
 *
 * 计划本身存 IndexedDB（`store.saveTraining`），不再是页面内存里的一个数组——
 * 之前刷新一下当天选的动作就全没了，记不下来的计划等于没记。
 *
 * 只有「当前看哪个部位 / 哪个器械档位 / 哪个动作展开着」这类纯界面状态还放模块级：
 * render* 会被定时器反复重跑，存在 DOM 里会被抹掉。
 */

import { h, clearEl, mount, num, todayKey, toast } from '../lib/utils.js';
import { icon, setIcon } from '../lib/icons.js';
import {
  listRow, persistentInfoTip, searchField, weakTag,
  segmentedGroupProps, segmentedItemProps,
} from '../lib/ui.js';
import {
  GROUPS, MUSCLES, PATTERNS, EQUIPMENT, EXERCISE_BY_ID, searchExercises,
} from '../data/exercises.js';
import { state, saveTraining, trainingFor } from '../lib/store.js';
import { selectBar } from '../lib/select-bar.js';
import {
  exercisesForGroup, exercisesForSplit, SPLITS, coveredGroupKeys, planAdvice,
  recommendFor, exerciseTags, EQUIP_FILTERS, equipFilterOf, lastPerformance,
  sessionVolume, recentTrainingRows,
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
// 动作列表那张卡现在看的是列表还是推荐。纯界面状态，不落库
let showRecommend = false;
// 搜索词是挑选器自己的界面状态；卡片因记录动作而重绘时仍保留。
let exerciseQuery = '';
/*
 * 待加入计划的一批动作。
 *
 * 只放在页面内存里，勾选不写库、不重绘 —— 原先每点一个都要落库并整页重绘，
 * 实测连点三个：页面自己滚了两次，同一行的 y 从 813 跳到 201 又跳到 897。
 * 列表在手指底下动，第二下十有八九点错。攒够了按一次「加入计划」。
 */
let pending = new Set();
let pickerBar = null;
let pickerCompactObserver = null;

/*
 * 健身页固定记**今天**，不跟今日 / 饮食页选的日期走。
 * 那两页翻回昨天是为了补记饮食；训练跟着翻的话，勾一个动作会落到昨天那一天，
 * 而页面上没有任何地方提示你正在记哪一天。历史训练去「近 7 日训练记录」看。
 */
const trainingDay = () => todayKey();
const session = () => trainingFor(trainingDay());
const picked = () => session().items.map((i) => i.id);

/** 改一天的计划：写库 → store 触发重绘，不用自己调 rerender */
async function updateSession(mutate) {
  const current = session();
  const next = mutate(current.items.map((i) => ({ ...i, sets: i.sets.map((x) => ({ ...x })) })));
  return saveTraining(trainingDay(), { items: next });
}

const cloneTrainingItem = (item) => ({
  ...item,
  sets: (item.sets || []).map((set) => ({ ...set })),
});

async function removeExerciseWithUndo(exercise) {
  const current = session().items;
  const index = current.findIndex((item) => item.id === exercise.id);
  if (index < 0) return;
  const removed = cloneTrainingItem(current[index]);
  await updateSession((items) => items.filter((item) => item.id !== exercise.id));
  toast(`已移除「${exercise.name}」`, 'info', {
    label: '撤销',
    onClick: () => updateSession((items) => {
      if (items.some((item) => item.id === removed.id)) return items;
      const next = [...items];
      next.splice(Math.min(index, next.length), 0, cloneTrainingItem(removed));
      return next;
    }),
  });
}
/* 器械档位定义搬去了 core/training.js —— 推荐和动作列表得筛在同一个范围里 */
let equipFilter = 'all';
// 器械菜单属于纯界面状态：换器械会重绘，但菜单不应因此自动收起。
let equipMenuOpen = false;

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
        'aria-label': done ? `${g.label}（今天已练到）` : g.label,
        onclick: () => { activeGroup = g.key; showAllExercises = false; rerender(); },
      }, g.label, done ? h('span.tab-dot', { 'aria-hidden': 'true' }) : null);
    }));
}

/** 身体部位 / 动作模式 —— 两种挑法之间切换 */
function modeTabs(rerender) {
  return h('div.range-switch.picker-mode-switch', segmentedGroupProps('挑动作的方式'),
    [['group', '身体部位'], ['split', '动作模式']].map(([key, label]) => h('button', {
      class: `chip-btn${pickMode === key ? ' active' : ''}`,
      ...segmentedItemProps(pickMode === key),
      onclick: () => { pickMode = key; showAllExercises = false; rerender(); },
    }, label)));
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

/*
 * 和这个动作重合度最高的那一个，用来在挑的时候当场标出来。
 *
 * **勾中还没提交的那些也要算进来。** 原先只比已经在计划里的：
 * 连勾杠铃卧推和哑铃卧推，两个都还没落库，一句提示都不出，
 * 等按下「加入计划」之后才在训练建议里读到「这俩刺激高度相似」——
 * 那时候人已经选完了，改起来要回头再走一遍。
 */
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
 * 一行上那句重复提示；没有重复、或者这一行本来就已经选中了，都不显示。
 *
 * **已经选中的行不提示。** 这句话的用处是「先别点这个」——
 * 都选完了再在两行上各写一遍「和对方几乎一样」，说的是同一件事，
 * 而且把列表铺满红字。选完之后要看的分析在「训练建议」里。
 *
 * 措辞要短：这是挑动作时扫一眼的东西，不是读的。
 */
function clashLine(e) {
  if (picked().includes(e.id) || pending.has(e.id)) return null;
  const clash = clashWith(e);
  if (!clash) return null;
  return clash.level === 'high'
    ? { cls: 'ex-clash', badge: '重复', detail: `和「${clash.other.name}」重复` }
    : { cls: 'ex-clash soft', badge: '重叠', detail: `和「${clash.other.name}」部分重叠` };
}

/**
 * 动作列表与推荐列表共用同一套注释。
 *
 * 这里接收已经整理好的三项语义（主要动作模式 / 主要肌肉 / 动作类型），
 * 避免两个视图各自拼字：一边写成「股四头肌 · 深蹲 + 复合」，另一边又是
 * 三个圆角标签，看起来像在表达两套不同的信息。
 *
 * 写成一行文字，不用 weakTag —— 胶囊留给「可以选的状态」。
 * 这三条点不动也选不了，做成灰底小块之后一屏十几个色块比动作名还抢眼；
 * 筛到「胸」的时候，五行的三个标签还一模一样，纯粹是噪音。
 */
function exerciseMeta(tags) {
  const classes = ['pattern', 'muscle', 'type'];
  return h('div.exercise-meta', null,
    tags.map((tag, index) => h('span', {
      class: `exercise-meta-tag ${classes[index] || 'detail'}`,
    }, tag)));
}

/*
 * 「上次 60kg × 8,8,6」。
 *
 * 排计划的时候最想知道的就是这个，而它原先只写在页面最下面的
 * 「近 7 日训练记录」里 —— 挑动作要先滚到底、记住数字、再滚回来。
 *
 * 写成一行极轻的灰字，不做成第四个标签：那三条已经删掉胶囊了，
 * 这里再加一块色斑等于把刚清掉的东西又搬回来。没记录就整行不出现。
 */
function lastLine(exercise) {
  const last = lastPerformance(state.trainingDays, exercise.id, { before: todayKey() });
  if (!last) return null;
  const parts = [last.weightLabel, last.repsLabel && `× ${last.repsLabel}`].filter(Boolean);
  return h('div.ex-last', null, `上次 ${last.date.slice(5)} · ${parts.join(' ')}`);
}

function exerciseRow(e, rerender) {
  const chosen = picked().includes(e.id);
  const marked = pending.has(e.id);
  // 单独留住这两个节点，勾选时只改它们，不重建整行
  const pickNode = h('span.ex-pick.exercise-choice-action', { 'aria-hidden': 'true' },
    icon(chosen || marked ? 'check' : 'plus'));
  const clashNode = h('span.ex-clash-slot', {
    onclick: (event) => {
      const detail = clashNode.dataset.detail;
      if (!detail) return;
      event.preventDefault();
      event.stopPropagation();
      toast(detail, 'info');
    },
  });
  const row = listRow({
    as: 'button',
    className: `ex-row exercise-choice-row${chosen ? ' chosen' : ''}${marked ? ' marked' : ''}`,
    type: 'button',
    'aria-pressed': String(chosen || marked),
    onclick: async () => {
      // 已在计划里的：点一下就撤掉。撤销不常做，重绘一次可以接受。
      if (chosen) {
        await removeExerciseWithUndo(e);
        return;
      }
      /*
       * 还没加的：只改这一行的样子和底下那条多选条，不整页重绘。
       * 走 rerender() 的话列表会重排（多出一行「与已选的X刺激高度相似」），
       * 下一个要点的动作就跑走了 —— 这正是要避开的那件事。
       */
      if (pending.has(e.id)) pending.delete(e.id); else pending.add(e.id);
      const on = pending.has(e.id);
      row.classList.toggle('marked', on);
      row.setAttribute('aria-pressed', String(on));
      setIcon(pickNode, on ? 'check' : 'plus');
      // 勾中一个会改变其它行「和已选的重不重」，所以整列的提示都要跟一下
      for (const other of row.parentNode?.children || []) other.syncClash?.();
      if (pickerBar) pickerBar.render();
    },
  },
  h('div.ex-main.exercise-choice-main', null,
    h('div.ex-name', null, h('strong', null, e.name)),
    /*
     * 默认只给三个短标签：主要动作模式 / 主要肌肉 / 动作类型。
     * 原先每行都把主动肌和所有协同肌铺开（「胸大肌中部　协同：三角肌前束、肱三头肌」），
     * 十几行叠起来全是同一批肌肉名，扫的时候反而找不到动作名在哪。
     * 协同肌收进「已选动作建议」那张卡——真要看细节是在排计划的时候，不是在挑的时候。
     */
    exerciseMeta(exerciseTags(e)),
    lastLine(e),
    clashNode),
  pickNode);

  /*
   * 只改这一句提示的文字，不动行的其它部分。
   * 走 rerender() 会重排整张列表，下一个要点的动作就跑走了。
   */
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

/**
 * 原来的两排筛选离开可视区后，用一行当前范围摘要接管应用顶栏。
 * 摘要不制造新的筛选状态，点它只把原控件滚回视野；真正的选择仍由上面的
 * 分段控件完成，避免桌面和手机各养一套交互。
 */
function setupPickerCompact(root) {
  pickerCompactObserver?.disconnect();
  pickerCompactObserver = null;

  const card = root.querySelector('.exercise-picker-card');
  const controls = card?.querySelector('.picker-controls');
  const scrollRoot = root.closest('.view') || document.querySelector('main.view');
  if (!card || !controls || !scrollRoot || typeof IntersectionObserver === 'undefined') return;

  pickerCompactObserver = new IntersectionObserver(([entry]) => {
    if (!card.isConnected) return;
    const rootTop = scrollRoot.getBoundingClientRect().top;
    const above = !entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop + 1;
    card.classList.toggle('picker-controls-collapsed', above);
  }, { root: scrollRoot, threshold: 0 });
  pickerCompactObserver.observe(controls);
}

/*
 * 器械筛选 + 当前有多少个动作，合成卡头右边那一个控件。
 *
 * 它原先和「全部动作 / 推荐组合」并排在列表工具条上，把那一排挤得只有半屏宽 ——
 * 而那一排是「胸 / 肩臂 / 背…」的下一级，理应和它一样宽。
 * 挪到卡头之后两件事也归了位：筛的是范围，「18 个动作」正是这个范围筛出来的数量，
 * 本来就该是同一个控件说的同一句话。
 */
function equipMenu(rerender, all, countLabel) {
  const active = EQUIP_FILTERS.find((f) => f.key === equipFilter) || EQUIP_FILTERS[0];
  const label = h('span.equip-filter-label', null, `${active.label} · ${countLabel}`);
  const wrap = h('div.equip-filter-wrap', null,
    h('button.equip-filter-btn', {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': String(equipMenuOpen),
      'aria-label': `器械筛选，当前${active.label}，${countLabel}`,
      onclick: (event) => {
        event.stopPropagation();
        equipMenuOpen = !equipMenuOpen;
        rerender();
      },
    },
    label,
    // 展开箭头也是画出来的：打出来的 ⌄ 在三个平台上是三种字形，和旁边的图标对不齐
    h('span.equip-filter-caret', { 'aria-hidden': 'true' }, icon('chevron'))),
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
        h('span.equip-filter-check', { 'aria-hidden': 'true' }, selected ? icon('check') : null));
      })) : null);
  wrap.setLabel = (text) => { label.textContent = `${active.label} · ${text}`; };
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
  /*
   * 收起时也不能把已选的动作藏掉：这一行的 ✓ 就是取消选择的入口，
   * 藏起来等于选了就撤不掉。排在第 8 个之后的已选项直接接到末尾，
   * 不打乱原顺序（同部位是按主次排的）。
   */
  const chosen = new Set(picked());
  const visible = showAllExercises
    ? list
    : [...list.slice(0, LIST_PREVIEW), ...list.slice(LIST_PREVIEW).filter((e) => chosen.has(e.id))];

  /* 全部动作与推荐组合是两种并列视图，文字直接说出当前选择，避免只写“推荐”。 */
  const rec = showRecommend ? recommendFor({
    mode: pickMode, groupKey: activeGroup, splitKey: activeSplit,
    selection: picked(), equip: equipFilter,
  }) : null;
  /*
   * 「全部动作 / 推荐组合」和上面两排一样是互斥选择，所以也用分段控件。
   * 原先它是下划线 tab，而同一屏上「身体部位 / 动作模式」「胸肩臂背腿腹」
   * 是灰槽白格 —— 三组做同一件事的开关摆出两套视觉语言，
   * 而 CLAUDE.md 自己写着「互斥的选择一律用分段控件」。
   */
  const viewTabs = h('div.range-switch.picker-view-switch.picker-list-tabs',
    segmentedGroupProps('看全部动作还是推荐组合'),
    [['all', '全部动作'], ['recommend', '推荐组合']].map(([key, label]) => {
      const active = (key === 'recommend') === showRecommend;
      return h('button', {
        class: `chip-btn${active ? ' active' : ''}`,
        ...segmentedItemProps(active),
        onclick: () => { showRecommend = key === 'recommend'; rerender(); },
      }, label);
    }));

  /*
   * 三排都在这里，宽度也一样：
   *   身体部位 / 动作模式  ← 挑法
   *   胸 肩臂 背 腿 腹      ← 范围
   *   全部动作 / 推荐组合   ← 在这个范围里看哪一组
   * 第三排是第二排的下一级，原先它和器械筛选并排在列表工具条上，
   * 只占半屏宽，看起来像另一套东西。
   */
  const controls = h('div.picker-controls', null,
    modeTabs(rerender),
    byGroup ? groupTabs(rerender) : splitTabs(rerender),
    viewTabs);
  const compactScope = byGroup ? group.label : split.label;
  let card = null;
  const compactSummary = h('button.picker-compact-summary', {
    type: 'button',
    hidden: showRecommend,
    'aria-label': `当前筛选：${byGroup ? '身体部位' : '动作模式'} ${compactScope}，${filter.label}；回到顶部`,
    onclick: () => card?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
  },
  h('span', null, `${byGroup ? '身体部位' : '动作模式'} · ${compactScope} · ${filter.label}`),
  h('span.picker-compact-action', null, '回到顶部'));

  const countLabel = showRecommend ? `${rec.items.length} 个推荐` : `${list.length} 个动作`;
  const equip = equipMenu(rerender, all, countLabel);
  const search = searchField({
    className: 'exercise-search-row',
    inputClassName: 'exercise-search-input',
    value: exerciseQuery,
    ariaLabel: '搜索动作，支持中文、拼音或英文',
  });
  const searchInput = search.input;
  const normalContent = h('div.picker-normal-results', null,
    showRecommend
      ? recommendBody(rec)
      : [
        list.length
          ? h('div.ex-list', null, visible.map((e) => exerciseRow(e, rerender)))
          : h('p.empty-hint', null, `${scopeLabel}里没有${filter.label}动作，换个器械档位看看。`),
        list.length > LIST_PREVIEW ? h('button.more-btn', {
          onclick: () => { showAllExercises = !showAllExercises; rerender(); },
        }, showAllExercises ? `只看前 ${LIST_PREVIEW} 个` : `展开其余 ${list.length - LIST_PREVIEW} 个`) : null,
      ]);
  const searchContent = h('div.exercise-search-results', { hidden: true });

  const updateSearch = () => {
    const query = exerciseQuery.trim();
    const searching = Boolean(query);
    controls.hidden = searching;
    compactSummary.hidden = searching || showRecommend;
    normalContent.hidden = searching;
    searchContent.hidden = !searching;
    clearEl(searchContent);
    if (!searching) {
      equip.setLabel(showRecommend ? `${rec.items.length} 个推荐` : `${list.length} 个动作`);
      return;
    }
    // 搜索是全库搜的，器械档位这时候不参与筛选，所以只报结果数
    const matches = searchExercises(query);
    equip.setLabel(`${matches.length} 个结果`);
    mount(searchContent,
      matches.length
        ? h('div.ex-list', null,
          matches.map((e) => exerciseRow(e, rerender)))
        : h('p.empty-hint.exercise-search-empty', null, '没有找到动作，试试动作名、拼音或英文。'));
  };
  searchInput.addEventListener('input', (event) => {
    exerciseQuery = event.target.value;
    updateSearch();
  });

  card = h('section.card.exercise-picker-card', null,
    h('div.card-head.picker-card-head', null,
      h('h3', null, '选择动作'),
      h('div.card-head-actions', null,
        equip,
        showRecommend ? recommendTip() : null)),
    search.el,
    compactSummary,
    controls,
    normalContent,
    searchContent);
  updateSearch();
  return card;
}

/** 勾中的这一批一次加进计划：一次落库、一次重绘 */
async function commitPending() {
  const ids = [...pending].filter((id) => !picked().includes(id));
  if (!ids.length) { pending = new Set(); return; }
  pending = new Set();
  await updateSession((items) => [...items, ...ids.map((id) => ({ id, sets: [], done: false }))]);
  toast(`已加入 ${ids.length} 个动作`, 'ok');
}

function buildPickerBar() {
  // 横幅挂在应用壳里，因此无论动作列表滚到哪里都固定在底栏上方。
  const bar = selectBar({
    summary: () => pending.size ? `已选 ${pending.size} 个动作` : '尚未选择动作',
    detail: () => [...pending]
      .map((id) => EXERCISE_BY_ID.get(id)?.name).filter(Boolean).join('、')
      || '可连续选择多个动作',
    actionLabel: () => '加入计划',
    actionAriaLabel: () => pending.size ? `把已选的 ${pending.size} 个动作加入计划` : '请先选择动作',
    items: () => [...pending].map((id) => {
      const e = EXERCISE_BY_ID.get(id);
      return e ? { key: id, label: e.name, note: `${MUSCLES[e.primary[0]] || ''} · ${PATTERNS[e.pattern]}` } : null;
    }).filter(Boolean),
    onRemove: (id) => { pending.delete(id); rerenderTraining?.(); },
    onClear: () => { pending = new Set(); rerenderTraining?.(); },
    onConfirm: () => { commitPending(); },
    alwaysVisible: true,
  });
  bar.el.classList.add('training-select-bar');
  return bar;
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
      onclick: async () => {
        const removed = { ...set };
        await updateSession((items) => items.map((i) => (i.id === item.id
          ? { ...i, sets: i.sets.filter((_, k) => k !== index) } : i)));
        toast('已删除这一组', 'info', {
          label: '撤销',
          onClick: () => updateSession((items) => items.map((i) => {
            if (i.id !== item.id) return i;
            const sets = [...i.sets];
            sets.splice(Math.min(index, sets.length), 0, { ...removed });
            return { ...i, sets };
          })),
        });
      },
      'aria-label': '删除这一组',
    }, icon('close')));
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
          weakTag(EQUIPMENT[exercise.equipment])),
        h('div.ex-muscle', null, muscleLine(exercise))),
      h('button.text-btn', {
        class: `text-btn${item.sets.length ? ' has-sets' : ''}`,
        onclick: () => { expanded = open ? null : exercise.id; rerenderTraining(); },
      }, setSummary),
      h('button.text-btn.danger', {
        onclick: () => removeExerciseWithUndo(exercise),
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

/*
 * 这张卡只回答「今天选了什么、做了几组」。
 *
 * 原先它还兼着报「覆盖部位」和「这套动作之间没有明显重复」——
 * 那是建议，和下面那张「训练建议」说的是同一件事，在同一屏里说两遍。
 * 重复的提示现在提前到挑动作那一步（每行自己带一句），
 * 需要细看的分析仍在训练建议里。这里只做记录。
 */
function planCard() {
  const list = pickedExercises();
  // 固定记今天，标题就直说是今天，不再跟着日期变来变去
  const dayLabel = '今日动作';
  if (!list.length) {
    // 空态只说下一步做什么。原先那三行解释谁都不会在「还没开始」的时候读
    return h('section.card', null,
      h('div.card-head', null, h('h3', null, dayLabel)),
      h('p.empty-hint', null, '还没有动作，从下面按身体部位或动作模式挑选。'),
      h('button.secondary-btn.plan-start', {
        type: 'button',
        onclick: () => document.querySelector('.exercise-picker-card')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        }),
      }, '开始挑选'));
  }
  const volume = sessionVolume(session());
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, dayLabel),
      h('div.card-head-actions', null,
        h('span.card-tag', null, volume.sets
          ? `${list.length} 个动作 · ${volume.sets} 组${volume.tonnage ? ` · ${num(volume.tonnage)} kg` : ''}`
          : `${list.length} 个动作`),
        h('button.text-btn', {
          onclick: async () => {
            const removed = session().items.map(cloneTrainingItem);
            await updateSession(() => []);
            toast('已清空今日动作', 'info', {
              label: '撤销',
              onClick: () => updateSession(() => removed.map(cloneTrainingItem)),
            });
          },
        }, '清空'))),
    h('div.plan-list', null, list.map((e, i) => planRow(e, i))));
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
  h('span', null, icon('plus'), a.label),
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
 * 近 7 日训练记录：一行一个动作。
 *
 * 原先这里是「近 7 天训练量」——各部位多少组的一排数字，外加一整段
 * 「这里只报数，不给每周该练几组的结论」。那段话本身没错，可它比数字还长，
 * 而人翻到这儿想看的是「我前天练了什么、上了多少重量」。
 *
 * 「训练量」这个词以后要留给「重量 × 次数」的容量，不能和训练记录混着用。
 */
let expandedRow = null;

function weeklyCard(rerender) {
  const rows = recentTrainingRows(state.trainingDays, trainingDay());
  if (!rows.length) {
    return h('section.card', null,
      h('div.card-head', null, h('h3', null, '近 7 日训练记录')),
      h('p.empty-hint', null, '记录后显示'));
  }
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '近 7 日训练记录'),
      h('span.card-tag', null, `${new Set(rows.map((r) => r.date)).size} 天 · ${rows.length} 个动作`)),
    h('div.log-list', null, rows.map((r, i) => {
      const key = `${r.date}:${r.id}:${i}`;
      const open = expandedRow === key;
      const meta = [`${r.setCount} 组`, r.weightLabel, r.repsLabel].filter(Boolean).join(' · ');
      return h('div.log-item', null,
        h('button.log-row', {
          type: 'button', 'aria-expanded': String(open),
          // 每组的重量次数收在里面：一行摊开五组，列表就没法扫了
          onclick: () => { expandedRow = open ? null : key; rerender(); },
        },
        h('span.log-date', null, r.date.slice(5)),
        h('span.log-name', null, r.name),
        h('span.log-meta', null, meta || '未记组数')),
        open && r.sets.length
          ? h('div.log-sets', null, r.sets.map((set, n) => h('div.log-set', null,
            h('span', null, `第 ${n + 1} 组`),
            h('span', null, [
              set.weightKg > 0 ? `${set.weightKg} kg` : null,
              set.reps > 0 ? `${set.reps} 次` : null,
            ].filter(Boolean).join(' × ') || '未记'))))
          : null);
    })));
}

/**
 * 动作推荐：作为「动作列表」那张卡的一个可选视图，不再单独占一张卡。
 *
 * 它和列表回答的是同一个问题的两半——「这个范围里有什么」和「这个范围里挑哪几个」，
 * 所以共用一张卡、共用同一组开关（部位 / 模式 + 器械档位），点一下切过去，
 * 再点一下切回来。原先它单独占一张卡，夹在挑动作和动作列表中间，
 * 把真正要用的那列动作往下推了整整一屏。
 *
 * 挑什么、为什么挑、重复了该换成什么，全在 core/training.js 的 recommendFor 里。
 */
function recommendTip() {
  return persistentInfoTip('training-recommendation-method', '这几个是怎么挑的',
    h('p', null, '在当前的部位 / 模式和器械档位里，优先覆盖不同的动作模式和角度，'
      + '复合动作排在前面。'),
    h('p', null, '已经选过的、以及和已选动作高度重合的，都不会再出现在这里——'
      + '否则选完杠铃卧推，第一个推荐还是哑铃卧推，等于劝人把同一件事做两遍。'),
    h('p', null, '这只是可编辑的起手参考，不是「必须练满」的清单。'));
}

function recommendBody(rec) {
  if (!rec.items.length && !rec.replacements.length) {
    return h('p.empty-hint', null, '这个范围里已经没有和已选动作不重复的推荐了，换个部位或器械档位看看。');
  }
  return [
    /*
     * 已经选了高度重合的一对时，把「换掉哪个」直接摆成按钮。
     * 只说最重的那一对：一次列五对，等于把选择的负担又推回去。
     */
    rec.replacements.map((r) => h('div.rec-swap', null,
      h('div.rec-swap-title', null, r.title),
      h('div.tip-actions', null, r.options.map((o) => h('button.chip-btn.tip-action', {
        type: 'button',
        onclick: () => updateSession((items) => [
          ...items.filter((i) => i.id !== r.dropId),
          ...(items.some((i) => i.id === o.id) ? [] : [{ id: o.id, sets: [], done: false }]),
        ]),
      }, h('span', null, `换成 ${o.name}`)))))),
    h('div.rec-picks', null, rec.items.map((item) => listRow({
      as: 'button', className: 'rec-pick exercise-choice-row',
      type: 'button', 'aria-label': `加入 ${item.name}`,
      onclick: () => updateSession((items) => (items.some((i) => i.id === item.id)
        ? items
        : [...items, { id: item.id, sets: [], done: false }])),
    },
      h('div.rec-pick-main.exercise-choice-main', null,
        h('div.ex-name', null, h('strong', null, item.name)),
        // 理由用短标签，不写长句：五条推荐写成五段话，读完比自己翻列表还慢
        exerciseMeta(item.tags)),
      /*
       * 加号用描边的小圆，不用实心绿。五个实心绿圆排成一列就是一整块色斑，
       * 而这一屏真正的主要动作是下面那个「全部加入」。
       */
      h('span.rec-add.exercise-choice-action', { 'aria-hidden': 'true' }, icon('plus'))))),
    rec.items.length > 1 ? h('button.secondary-btn.full', {
      style: { marginTop: '12px' },
      onclick: () => updateSession((items) => [
        ...items,
        ...rec.items.filter((r) => !items.some((i) => i.id === r.id))
          .map((r) => ({ id: r.id, sets: [], done: false })),
      ]),
    }, '全部加入') : null,
  ];
}

/*
 * 展开/收起组数编辑器这类纯界面状态改不了 store，触发不了订阅重绘，
 * 所以留一个直接重画本页的入口。
 */
let rerenderTraining = () => {};

// 点菜单外部才关闭器械筛选；换器械本身不会把菜单折回去。
document.addEventListener('click', (event) => {
  if (!equipMenuOpen || event.target.closest?.('.equip-filter-wrap')) return;
  equipMenuOpen = false;
  // 切换底部栏目时，目标页已经把健身 DOM 清掉；此时不能再把旧健身页画回来。
  if (document.querySelector('#view .exercise-picker-card')) rerenderTraining();
});

export function renderTraining(root) {
  const rerender = () => renderTraining(root);
  rerenderTraining = rerender;
  clearEl(root);
  const actionSlot = document.getElementById('actionbar');
  if (actionSlot) {
    clearEl(actionSlot);
    actionSlot.hidden = true;
  }
  // 整页重绘会把上一条的 DOM 丢掉，重新建一条；pending 本身是模块级的，留着
  pickerBar = buildPickerBar();
  /*
   * 顺序按「我今天练了什么 → 接下来练什么 → 这一套行不行 → 前几天练了什么」。
   *
   * 推荐紧跟在控制它的那几个开关后面：换一下部位或器械就看见推荐跟着变。
   * 原先推荐长在页面最上面，和控制它的开关隔着一整列动作，
   * 换了档位也不知道是它在变。
   */
  mount(root,
    picked().length ? planCard() : null,
    pickerCard(rerender),
    adviceCard(rerender),
    weeklyCard(rerender),
  );
  setupPickerCompact(root);
  if (actionSlot) {
    actionSlot.hidden = false;
    mount(actionSlot, pickerBar.el);
  }
}
