/**
 * 健身：按身体部位或动作模式挑动作，实时指出刺激高度相似的组合，并按天记下来。
 *
 * 计划本身存 IndexedDB（`store.saveTraining`），不再是页面内存里的一个数组——
 * 之前刷新一下当天选的动作就全没了，记不下来的计划等于没记。
 *
 * 只有「当前看哪个部位 / 哪个器械档位 / 哪个动作展开着」这类纯界面状态还放模块级：
 * render* 会被定时器反复重跑，存在 DOM 里会被抹掉。
 */

import { h, clearEl, mount, num, todayKey, infoTip, toast } from '../lib/utils.js';
import { GROUPS, MUSCLES, PATTERNS, EQUIPMENT, EXERCISE_BY_ID } from '../data/exercises.js';
import { state, saveTraining, trainingFor } from '../lib/store.js';
import { selectBar } from '../lib/select-bar.js';
import {
  exercisesForGroup, exercisesForSplit, SPLITS, coveredGroupKeys, planAdvice,
  recommendFor, EQUIP_FILTERS, equipFilterOf,
  sessionVolume, recentExercises, recentTrainingRows,
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
/*
 * 待加入计划的一批动作。
 *
 * 只放在页面内存里，勾选不写库、不重绘 —— 原先每点一个都要落库并整页重绘，
 * 实测连点三个：页面自己滚了两次，同一行的 y 从 813 跳到 201 又跳到 897。
 * 列表在手指底下动，第二下十有八九点错。攒够了按一次「加入计划」。
 */
let pending = new Set();
let pickerBar = null;

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
    ? { cls: 'ex-clash', text: `和「${clash.other.name}」重复` }
    : { cls: 'ex-clash soft', text: `和「${clash.other.name}」部分重叠` };
}

function exerciseRow(e, rerender, lastDone) {
  const chosen = picked().includes(e.id);
  const marked = pending.has(e.id);
  // 单独留住这两个节点，勾选时只改它们，不重建整行
  const pickNode = h('span.ex-pick', null, chosen ? '✓' : marked ? '●' : '＋');
  const clashNode = h('div.ex-clash-slot');
  const row = h('button.ex-row', {
    class: `ex-row${chosen ? ' chosen' : ''}${marked ? ' marked' : ''}`,
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
      pickNode.textContent = on ? '●' : '＋';
      // 勾中一个会改变其它行「和已选的重不重」，所以整列的提示都要跟一下
      for (const other of row.parentNode?.children || []) other.syncClash?.();
      if (pickerBar) pickerBar.render();
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
    clashNode,
    // 标出上次练过是哪天，省得每次从头翻
    lastDone && !chosen ? h('div.ex-last', null, `上次 ${lastDone.slice(5)}`) : null),
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
    clashNode.textContent = line ? line.text : '';
  };
  row.syncClash();
  return row;
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
    recentExercises(state.trainingDays, { limit: 200, before: trainingDay() })
      .map((r) => [r.exercise.id, r.date]),
  );
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
  const viewTabs = h('div.range-switch.picker-view-switch', null,
    [['all', '全部动作'], ['recommend', '推荐组合']].map(([key, label]) => {
      const active = (key === 'recommend') === showRecommend;
      return h('button', {
        class: `chip-btn${active ? ' active' : ''}`,
        type: 'button', 'aria-pressed': String(active),
        onclick: () => { showRecommend = key === 'recommend'; rerender(); },
      }, label);
    }));

  return h('section.card.exercise-picker-card', null,
    h('div.card-head', null,
      h('h3', null, '挑动作'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, showRecommend
          ? `${scopeLabel} · ${rec.items.length} 个`
          : `${scopeLabel} · ${list.length} 个`),
        showRecommend ? recommendTip() : null)),
    modeTabs(rerender),
    byGroup ? groupTabs(rerender) : splitTabs(rerender),
    equipTabs(rerender, all),
    viewTabs,
    showRecommend
      ? recommendBody(rec)
      : [
        list.length
          ? h('div.ex-list', null, visible.map((e) => exerciseRow(e, rerender, lastDoneAt.get(e.id))))
          : h('p.empty-hint', null, `${scopeLabel}里没有${filter.label}动作，换个器械档位看看。`),
        list.length > LIST_PREVIEW ? h('button.more-btn', {
          onclick: () => { showAllExercises = !showAllExercises; rerender(); },
        }, showAllExercises ? `只看前 ${LIST_PREVIEW} 个` : `展开其余 ${list.length - LIST_PREVIEW} 个`) : null,
      ],
    // 待记录的那一批在两个视图里都留着，切过去不会让人以为勾的东西没了
    pickerBar.el);
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
  /*
   * 这一条紧贴动作列表，不留上边距。
   *
   * 公共横幅默认带 10px 上边距，那是给饮食页用的——那边它下面还接着别的内容。
   * 健身页里它就长在列表末尾，10px 变成一条说不出理由的空白。
   * 只给这一处加个修饰类，不动共用样式。
   */
  const bar = selectBar({
    summary: () => `已选 ${pending.size} 个动作`,
    detail: () => [...pending]
      .map((id) => EXERCISE_BY_ID.get(id)?.name).filter(Boolean).join('、'),
    actionLabel: () => '加入计划',
    items: () => [...pending].map((id) => {
      const e = EXERCISE_BY_ID.get(id);
      return e ? { key: id, label: e.name, note: `${MUSCLES[e.primary[0]] || ''} · ${PATTERNS[e.pattern]}` } : null;
    }).filter(Boolean),
    onRemove: (id) => { pending.delete(id); rerenderTraining?.(); },
    onClear: () => { pending = new Set(); rerenderTraining?.(); },
    onConfirm: () => { commitPending(); },
  });
  bar.el.classList.add('select-bar-tight');
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
  return infoTip('这几个是怎么挑的',
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
    h('div.rec-picks', null, rec.items.map((item) => h('div.rec-pick', null,
      h('div.rec-pick-main', null,
        h('div.ex-name', null, h('strong', null, item.name)),
        // 理由用短标签，不写长句：五条推荐写成五段话，读完比自己翻列表还慢
        h('div.rec-pick-tags', null, item.tags.map((t) => h('span.rec-tag', null, t)))),
      /*
       * 加号用描边的小圆，不用实心绿。五个实心绿圆排成一列就是一整块色斑，
       * 而这一屏真正的主要动作是下面那个「全部加入」。
       */
      h('button.rec-add', {
        type: 'button', 'aria-label': `加入 ${item.name}`,
        onclick: () => updateSession((items) => (items.some((i) => i.id === item.id)
          ? items
          : [...items, { id: item.id, sets: [], done: false }])),
      }, '＋')))),
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

export function renderTraining(root) {
  const rerender = () => renderTraining(root);
  rerenderTraining = rerender;
  clearEl(root);
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
    planCard(),
    pickerCard(rerender),
    adviceCard(rerender),
    weeklyCard(rerender),
  );
}
