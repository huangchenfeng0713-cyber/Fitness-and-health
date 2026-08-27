/**
 * 健身建议：按部位挑动作，实时告诉你这套里哪些动作在做重复的事。
 *
 * 选中状态放模块级，和趋势页的区间选择同理——render* 会被定时器反复重跑，
 * 状态存在 DOM 里会被抹掉。
 */

import { h, clearEl, mount } from '../lib/utils.js';
import { GROUPS, MUSCLES, PATTERNS, EQUIPMENT, EXERCISE_BY_ID } from '../data/exercises.js';
import {
  exercisesForGroup, findOverlaps, coverage, planAdvice, starterCombo,
  overlapScore, overlapLevel,
} from '../core/training.js';

let activeGroup = 'chest';
let picked = [];
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

const pickedExercises = () => picked.map((id) => EXERCISE_BY_ID.get(id)).filter(Boolean);

function muscleLine(e) {
  const primary = e.primary.map((m) => MUSCLES[m]).join('、');
  const secondary = e.secondary.map((m) => MUSCLES[m]).join('、');
  return secondary ? `${primary}　协同：${secondary}` : primary;
}

function groupTabs(rerender) {
  return h('div.range-switch', null,
    GROUPS.map((g) => h('button', {
      class: `chip-btn${activeGroup === g.key ? ' active' : ''}`,
      onclick: () => { activeGroup = g.key; rerender(); },
    }, g.label)));
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

function exerciseRow(e, rerender) {
  const chosen = picked.includes(e.id);
  const clash = chosen ? null : clashWith(e);
  return h('button.ex-row', {
    class: `ex-row${chosen ? ' chosen' : ''}`,
    onclick: () => {
      picked = chosen ? picked.filter((id) => id !== e.id) : [...picked, e.id];
      rerender();
    },
  },
  h('div.ex-main', null,
    h('div.ex-name', null,
      h('strong', null, e.name),
      h('span.ex-tag', null, PATTERNS[e.pattern]),
      e.compound ? h('span.ex-tag.compound', null, '复合') : null),
    h('div.ex-muscle', null, muscleLine(e)),
    clash && clash.level === 'high'
      ? h('div.ex-clash', null, `与已选的「${clash.other.name}」高度重复`)
      : clash ? h('div.ex-clash.soft', null, `与「${clash.other.name}」部分重叠`) : null),
  h('span.ex-pick', null, chosen ? '✓' : '＋'));
}

function equipTabs(rerender, all) {
  return h('div.chart-switch', null,
    EQUIP_FILTERS.map((f) => {
      const n = all.filter(f.match).length;
      return h('button', {
        class: `chip-btn${equipFilter === f.key ? ' active' : ''}${n ? '' : ' empty'}`,
        onclick: () => { equipFilter = f.key; rerender(); },
      }, `${f.label} ${n}`);
    }));
}

function pickerCard(rerender) {
  const all = exercisesForGroup(activeGroup);
  const filter = EQUIP_FILTERS.find((f) => f.key === equipFilter) || EQUIP_FILTERS[0];
  const list = all.filter(filter.match);
  const group = GROUPS.find((g) => g.key === activeGroup);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '动作选择'),
      h('span.card-tag', null, `${group.label} · ${list.length} 个`)),
    groupTabs(rerender),
    equipTabs(rerender, all),
    h('p.form-hint', { style: { margin: '10px 0 4px' } },
      `${group.label}主要覆盖：${group.muscles.map((m) => MUSCLES[m]).join('、')}。点一下加入今日计划，再点一下取消。`),
    list.length
      ? h('div.ex-list', null, list.map((e) => exerciseRow(e, rerender)))
      : h('p.empty-hint', null, `${group.label}下没有${filter.label}动作，换个器械档位看看。`));
}

function planCard(rerender) {
  const list = pickedExercises();
  if (!list.length) {
    return h('section.card', null,
      h('div.card-head', null, h('h3', null, '今日计划')),
      h('p.empty-hint', null, '还没选动作。从上面按部位挑几个，这里会告诉你有没有练重复、还缺哪些部位。'));
  }
  const overlaps = findOverlaps(list);
  const cov = coverage(list).filter((c) => c.exercises > 0);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '今日计划'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${list.length} 个动作`),
        h('button.text-btn', { onclick: () => { picked = []; rerender(); } }, '清空'))),
    h('div.plan-list', null, list.map((e, i) => h('div.plan-row', null,
      h('span.plan-index', null, String(i + 1)),
      h('div.plan-main', null,
        h('div.ex-name', null, h('strong', null, e.name),
          h('span.ex-tag', null, EQUIPMENT[e.equipment])),
        h('div.ex-muscle', null, muscleLine(e))),
      h('button.text-btn.danger', {
        onclick: () => { picked = picked.filter((id) => id !== e.id); rerender(); },
      }, '移除')))),
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
      const next = a.replaces ? picked.filter((id) => id !== a.replaces) : [...picked];
      picked = next.includes(a.id) ? next : [...next, a.id];
      rerender();
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

/** 没选动作时，给个「这个部位怎么练」的起手方案 */
function starterCard(rerender) {
  if (picked.length) return null;
  const group = GROUPS.find((g) => g.key === activeGroup);
  const combo = starterCombo(activeGroup);
  if (!combo.length) return null;
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, `${group.label}怎么练`),
      h('span.card-tag', null, '起手组合')),
    h('p.form-hint', { style: { marginBottom: '10px' } },
      '三个不同的动作模式，各自补上另外两个练不到的地方，之间没有重复。'),
    h('div.plan-list', null, combo.map((e, i) => h('div.plan-row', null,
      h('span.plan-index', null, String(i + 1)),
      h('div.plan-main', null,
        h('div.ex-name', null, h('strong', null, e.name),
          h('span.ex-tag', null, PATTERNS[e.pattern])),
        h('div.ex-muscle', null, muscleLine(e)))))),
    h('button.secondary-btn.full', {
      style: { marginTop: '12px' },
      onclick: () => { picked = combo.map((e) => e.id); rerender(); },
    }, '用这套开始'));
}

export function renderTraining(root) {
  const rerender = () => renderTraining(root);
  clearEl(root);
  mount(root,
    planCard(rerender),
    adviceCard(rerender),
    starterCard(rerender),
    pickerCard(rerender),
  );
}
