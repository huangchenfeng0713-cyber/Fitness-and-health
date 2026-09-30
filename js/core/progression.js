/**
 * 这次做多少，以及近几周力量在往哪走。
 *
 * 纯函数，不碰 DOM，可在 Node 里单测。
 *
 * 记组时屏幕上原本只有一条「上次 09-26 · 60kg × 12,12,12」，要不要加重、
 * 加多少得自己想 —— 而这恰恰是一套固定规则就能回答的事。用户原话是
 * 「它没有把数据变成可参考的内容」，这一处就是最直接的一块。
 *
 * 规则是**双重渐进**（惯例）：同一个重量上把每组次数往区间上限推；
 * 每组都到了上限，就加一档重量、从区间下限重新做起。
 *
 * 它不猜你今天状态如何，只看上一次的正式组，回答「照这条规则，这次该做多少」。
 * 目标只预填进草稿，确认之前一个数都不进数据库 —— 状态不好时照上次做、
 * 或者改掉它，都只是改一个输入框。
 */

import { exerciseForRecord } from '../data/exercises.js';
import { normalizeSession, recordingDefaultsFor, createSetDraft } from './training.js';
import { isRecordedSet, REP_RANGES } from './training-records.js';
import { dayOffset } from './day.js';
import { linearFit } from './slope.js';
import { withUnit } from './units.js';

/** 加一档：公斤口径 2.5kg（惯例：多数健身房最小的一对杠铃片、相邻两只哑铃的档差） */
export const LOAD_STEP_KG = 2.5;
/** 器械刻度加 1 档；辅助器械减 2.5kg 辅助 */
export const SCALE_STEP = 1;
/** 计时动作每次多 5 秒，到 60 秒就换更难的练法（惯例） */
export const TIME_STEP_S = 5;
export const TIME_CAP_S = 60;
/** 加一档超过当前重量的这个比例时，补一句「做不到下限就退回来」（护栏） */
export const BIG_JUMP_RATIO = 0.15;
/** 连续这么多次没超过上一次才叫停滞（惯例） */
export const STALL_SESSIONS = 3;
/** 停滞只看这么多天里的记录：隔两个月再练那叫间断，不叫停滞（护栏） */
export const STALL_WINDOW_DAYS = 56;
/** 估算 1RM 只用次数不超过这个数的组：次数越多，Epley 偏差越大（护栏） */
export const E1RM_MAX_REPS = 15;
/** 力量趋势：近 28 天、至少 3 次、首末隔开 14 天才给（护栏） */
export const TREND_DAYS = 28;
export const TREND_MIN_SESSIONS = 3;
export const TREND_MIN_SPAN = 14;
/**
 * ±2% 以内算持平（护栏）：同一重量上只多做一次，估算 1RM 就差 2%~3%，
 * 比这更小的变化，分不出是进步还是那天手感好。
 */
export const TREND_FLAT_PCT = 2;

const round1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => String(round1(v));
const known = (v) => (v && v !== 'unknown' ? v : null);

/** 热身组不算：拿 40kg 热身的那几组去推下一次的目标，目标就被拽低了 */
const isWorkSet = (set) => isRecordedSet(set) && set.setType !== 'warmup';
const isTimed = (set) => set.durationSeconds > 0 && !(set.reps > 0);

/*
 * 默认区间按动作类型给（惯例）：复合 8–12、孤立 10–15、小腿和腹 12–20。
 * 徒手的另算：引体、双杠臂屈伸、反向划船这类拉自己体重的 6–10，
 * 俯卧撑、徒手深蹲这类 12–20 —— 同样是「徒手复合」，一个做到 8 次已经不轻松，
 * 一个做到 12 次才刚热身；共用 8–12 的话，做 12 个俯卧撑的人就会被劝「换更难的练法」。
 * 练 5×5、或者偏爱高次数的人在「设置」里改一次就行 ——
 * 区间是个偏好，这里只负责给一个不离谱的起点。
 */
const HEAVY_BODYWEIGHT = new Set(['vertical_pull', 'dip', 'horizontal_pull']);
export function defaultRepRange(exercise, loadMode = null) {
  if (exercise?.pattern === 'calf_raise' || exercise?.group === 'core') return '12-20';
  if (loadMode === 'bodyweight') return HEAVY_BODYWEIGHT.has(exercise?.pattern) ? '6-10' : '12-20';
  return exercise?.compound ? '8-12' : '10-15';
}

/*
 * 加一档加多少。刻度是 1 档；公斤先看上次用的那个数落在哪套档差上：
 * 6kg 的哑铃说明这家健身房是 2kg 一档（下一只是 8，不是 8.5），
 * 62.5 说明杠铃片有 1.25 的一对（加 2.5）。都对不上就按 2.5 给。
 */
function loadStepFor(load, convention) {
  if (convention === 'scale') return SCALE_STEP;
  if (!(load > 0)) return LOAD_STEP_KG;
  const fits = (step) => Math.abs(load / step - Math.round(load / step)) < 1e-6;
  return [LOAD_STEP_KG, 2, 1, 0.5].find(fits) ?? LOAD_STEP_KG;
}

export function repRangeFor(exercise, defaults = {}) {
  const custom = Object.hasOwn(REP_RANGES, String(defaults?.repRange ?? '')) ? defaults.repRange : null;
  const key = custom || defaultRepRange(exercise, defaults?.loadMode);
  const [lo, hi] = REP_RANGES[key];
  return { key, lo, hi, custom: Boolean(custom) };
}

/*
 * 这一组能不能和现在的设置比。
 *
 * 上午按「合计 kg」记的 40，和下午按「每只 kg」记的 20 是同一个重量，
 * 可数字差一倍 —— 拿它推目标，要么让人加倍、要么让人减半。
 * 没注明口径的老记录照旧能比（那时候只有一种写法）。
 */
function comparable(set, defaults) {
  const mode = known(set.loadMode);
  const convention = known(set.loadConvention);
  return (!mode || mode === defaults.loadMode)
    && (!convention || convention === defaults.loadConvention)
    && isTimed(set) === (defaults.measure === 'time');
}

/** 某个动作每一次的正式组，日期升序；只收 before 之前的 */
function workHistory(sessions, exerciseId, before) {
  const out = [];
  for (const raw of sessions || []) {
    if (!raw?.date || (before && raw.date >= before)) continue;
    const item = normalizeSession(raw).items.find((i) => i.id === exerciseId);
    const sets = item ? item.sets.filter(isWorkSet) : [];
    if (sets.length) out.push({ date: raw.date, sets });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/*
 * 这一次的「顶组」：用到的最重那个重量上的几组。
 *
 * 直组（三组都是 60kg）就是全部；金字塔（50 / 55 / 60）只看 60 那一组 ——
 * 双重渐进是在同一个重量上数次数的，混着不同重量的次数一起数没有意义。
 * 辅助器械反过来：辅助越少越难，顶组是辅助最少的那几组。
 */
function topOf(sets, loadMode) {
  if (loadMode === 'bodyweight') return { load: null, sets };
  const assisted = loadMode === 'assistance';
  const loaded = sets.filter((s) => Number.isFinite(s.weightKg) && (assisted ? s.weightKg >= 0 : s.weightKg > 0));
  if (!loaded.length) return { load: null, sets };
  const weights = loaded.map((s) => s.weightKg);
  const load = assisted ? Math.min(...weights) : Math.max(...weights);
  return { load, sets: loaded.filter((s) => s.weightKg === load) };
}

const valuesOf = (sets, measure) => sets.map((s) => (measure === 'time' ? s.durationSeconds : s.reps) || 0);

/*
 * 「这一次比上一次强没强」按双重渐进自己的口径判断：重量上去了算，
 * 同一重量上对应那几组的次数加起来多了也算。
 *
 * **不能拿估算 1RM 比。** 60kg × 12 加到 62.5kg × 8，Epley 从 84 掉到 79 ——
 * 可那正是这套规则要求的那一步。拿 1RM 判，每一轮正常的加重都会被说成「停滞」。
 */
function perfOf(sets, defaults) {
  const top = topOf(sets, defaults.loadMode);
  const load = top.load == null ? 0 : defaults.loadMode === 'assistance' ? -top.load : top.load;
  return { load, values: valuesOf(top.sets, defaults.measure) };
}

function progressed(prev, next) {
  if (next.load > prev.load + 1e-9) return true;
  if (next.load < prev.load - 1e-9) return false;
  const k = Math.min(prev.values.length, next.values.length);
  const sum = (v) => v.slice(0, k).reduce((a, b) => a + b, 0);
  return sum(next.values) > sum(prev.values);
}

function stallOf(history, defaults, date) {
  const recent = history
    .map((e) => ({ date: e.date, sets: e.sets.filter((s) => comparable(s, defaults)) }))
    .filter((e) => e.sets.length && dayOffset(date, e.date) <= STALL_WINDOW_DAYS);
  if (recent.length < STALL_SESSIONS + 1) return null;
  const perfs = recent.map((e) => perfOf(e.sets, defaults));
  for (let i = perfs.length - STALL_SESSIONS; i < perfs.length; i += 1) {
    if (progressed(perfs[i - 1], perfs[i])) return null;
  }
  return { since: recent[recent.length - STALL_SESSIONS - 1].date, sessions: STALL_SESSIONS };
}

/**
 * 这个动作这次做多少。
 *
 * @returns {null | object} 没练过（或上一次一组正式组都没有）时返回 null；
 *   kind: 'add-load' 加一档 | 'add-reps' 同重量多一次 | 'add-time' 多 5 秒
 *       | 'harder' 到顶了、该换更难的练法 | 'incomparable' 上次的口径和现在对不上
 *   values: 每组的目标（次数或秒）；加重时每一项都是区间下限，atLeast 为 true 表示「至少」
 */
export function progressionTarget(sessions = [], item, date = '') {
  const exercise = exerciseForRecord(item);
  if (!exercise) return null;
  const defaults = recordingDefaultsFor(item, sessions, date);
  const history = workHistory(sessions, item.id, date);
  const last = history.at(-1);
  if (!last) return null;
  const range = repRangeFor(exercise, defaults);
  const base = {
    lastDate: last.date, measure: defaults.measure, loadMode: defaults.loadMode,
    loadConvention: defaults.loadConvention, equipment: exercise.equipment, range,
  };
  const sets = last.sets.filter((s) => comparable(s, defaults));
  if (!sets.length) return { ...base, kind: 'incomparable' };
  const top = topOf(sets, defaults.loadMode);
  const lastValues = valuesOf(top.sets, defaults.measure);
  const common = {
    ...base, lastLoad: top.load, lastValues, sets: top.sets.length,
    stall: stallOf(history, defaults, date), atLeast: false, step: null, bigJump: false,
  };

  if (defaults.measure === 'time') {
    if (lastValues.every((v) => v >= TIME_CAP_S)) return { ...common, kind: 'harder', load: top.load, values: lastValues };
    return {
      ...common, kind: 'add-time', load: top.load,
      values: lastValues.map((v) => (v >= TIME_CAP_S ? v : Math.min(TIME_CAP_S, v + TIME_STEP_S))),
    };
  }
  // 超过上限的那一组照旧写它自己的次数：上次做了 15 次，目标写回 12 读起来像在让人少做
  if (!lastValues.every((v) => v >= range.hi)) {
    return { ...common, kind: 'add-reps', load: top.load, values: lastValues.map((v) => (v >= range.hi ? v : v + 1)) };
  }
  const floor = Array(top.sets.length).fill(range.lo);
  if (defaults.loadMode === 'bodyweight') return { ...common, kind: 'harder', load: null, values: lastValues };
  if (top.load == null) return { ...common, kind: 'add-load', load: null, values: floor, atLeast: true };
  if (defaults.loadMode === 'assistance') {
    const next = round1(top.load - LOAD_STEP_KG);
    if (next <= 0) return { ...common, kind: 'harder', load: 0, values: lastValues, unassisted: true };
    return { ...common, kind: 'add-load', load: next, step: -LOAD_STEP_KG, values: floor, atLeast: true };
  }
  const step = loadStepFor(top.load, defaults.loadConvention);
  return {
    ...common, kind: 'add-load', load: round1(top.load + step), step, values: floor, atLeast: true,
    bigJump: step / top.load > BIG_JUMP_RATIO,
  };
}

/* ------------------------------------------------- 措辞 ------------- */

function loadLabel(t, load = t.load) {
  if (t.loadMode === 'bodyweight') return '自重';
  if (load == null) return '';
  if (t.loadMode === 'assistance') return `辅助 ${withUnit(fmt(load), 'kg')}`;
  if (t.loadConvention === 'scale') return `刻度 ${fmt(load)}`;
  const kg = withUnit(fmt(load), 'kg');
  if (t.loadConvention === 'single') return `${t.equipment === 'dumbbell' ? '每只' : '单侧'} ${kg}`;
  return kg;
}

/** 「60kg × 12,12,11」「自重 × 11,10,10」「每组 50,45,45秒」 */
function doseLabel(t, load, values) {
  const timed = t.measure === 'time';
  // 计时动作前面不挂「自重 ×」：「自重 × 45,40秒」读起来像是在数次数
  const label = timed && t.loadMode === 'bodyweight' ? '' : loadLabel(t, load);
  const list = values.join(',');
  if (label) return `${label} × ${timed ? withUnit(list, '秒') : list}`;
  return `每组 ${withUnit(list, timed ? '秒' : '次')}`;
}

/** 目标那一行：「62.5kg · 每组至少 8次」「60kg × 12,12,11」 */
export function targetText(t) {
  if (!t || t.kind === 'incomparable') return null;
  if (t.kind === 'harder') {
    if (t.unassisted) return '试试不用辅助，改成自重记录';
    return t.measure === 'time' ? '换更难的练法，或加负重' : '换更难的练法，或改成负重记录';
  }
  if (t.kind === 'add-load') {
    return `${loadLabel(t) || '加一档重量'} · 每组至少 ${withUnit(t.range.lo, '次')}`;
  }
  return doseLabel(t, t.load, t.values);
}

/** 目标下面那一句：上一次是什么样、所以这次为什么是这个数 */
export function targetReason(t) {
  if (!t) return null;
  if (t.kind === 'incomparable') return '上次的重量口径和现在的设置不同，换算不了；这次按感觉定，记完下次就有目标了。';
  const last = `上次 ${t.lastDate.slice(5)} · ${doseLabel(t, t.lastLoad, t.lastValues)}`;
  const top = `都到了 ${withUnit(t.range.hi, '次')}（${t.range.lo}–${t.range.hi} 的上限）`;
  if (t.kind === 'add-time') {
    return `${last}，每组多 ${withUnit(TIME_STEP_S, '秒')}；到 ${withUnit(TIME_CAP_S, '秒')}后换更难的练法`;
  }
  if (t.kind === 'add-reps') {
    return `${last}，每组争取多做一次；都到 ${withUnit(t.range.hi, '次')}后${t.loadMode === 'bodyweight' ? '换更难的练法' : '再加重'}`;
  }
  if (t.kind === 'harder') {
    if (t.unassisted) return `${last}，辅助已经减到最后一档`;
    return t.measure === 'time' ? `${last}，每组都到了 ${withUnit(TIME_CAP_S, '秒')}` : `${last}，${top}`;
  }
  const step = t.step == null ? '加一档重量'
    : t.step < 0 ? `辅助减 ${withUnit(fmt(-t.step), 'kg')}`
      : t.loadConvention === 'scale' ? `加 ${t.step} 档` : `加 ${withUnit(fmt(t.step), 'kg')}`;
  return `${last}，${top}，${step}`;
}

/** 一档加得太多时补的那一句；6kg 的哑铃换 8kg 就是 +33% */
export function bigJumpNote(t) {
  if (!t?.bigJump || !(t.lastLoad > 0)) return null;
  return `这一档是 +${Math.round((t.step / t.lastLoad) * 100)}%，做不到 ${withUnit(t.range.lo, '次')}就回到上次的重量，多做几次再加。`;
}

/** 停滞时的那一句，按目标说不同的话：减脂期持平本来就是好结果 */
export function stallNote(t, goal = null) {
  if (!t?.stall) return null;
  const head = `连续 ${t.stall.sessions} 次没超过上一次：`;
  if (goal === 'cut') return `${head}减脂期能保住重量和次数就算达标，不用硬加。`;
  if (goal === 'bulk') return `${head}可以在「设置」里换个次数区间，或下周组数减半、休整一周再冲；也看看最近吃够、睡够没有。`;
  return `${head}可以在「设置」里换个次数区间，或安排一周减量。`;
}

/* ------------------------------------------------- 力量趋势 ------------- */

/** Epley（1985）：重量 × (1 + 次数 / 30)。只用来看自己前后的变化，不是真实的 1RM */
export function epley(weightKg, reps) {
  return weightKg * (1 + reps / 30);
}

function bestOf(sets, defaults) {
  if (!sets.length) return null;
  if (defaults.measure === 'time') {
    const v = Math.max(...sets.map((s) => s.durationSeconds || 0));
    return v > 0 ? v : null;
  }
  if (defaults.loadMode === 'bodyweight') {
    const v = Math.max(...sets.map((s) => s.reps || 0));
    return v > 0 ? v : null;
  }
  if (defaults.loadMode === 'assistance') {
    const w = sets.map((s) => s.weightKg).filter((v) => Number.isFinite(v) && v >= 0);
    return w.length ? Math.min(...w) : null;
  }
  const scores = sets.filter((s) => s.weightKg > 0 && s.reps >= 1 && s.reps <= E1RM_MAX_REPS)
    .map((s) => epley(s.weightKg, s.reps));
  return scores.length ? Math.max(...scores) : null;
}

/**
 * 近几周这个动作的力量在往哪走。
 *
 * 每一次取最好的一组，按日期拟合一条直线（和体重趋势同一个最小二乘），
 * 报拟合线在这段开头和结尾各是多少 —— 单看首末两次，哪天手感好一点就翻过来了。
 * 公斤口径报估算 1RM；徒手报最多次数，计时报最长秒数，辅助报辅助重量（越少越强），
 * 刻度只报百分比（刻度不是公斤，报出一个「1RM 刻度」没有意义）。
 *
 * @param {string|object} exerciseOrItem 动作 id，或今天那一条记录
 * @param {string} date 只看这一天之前的记录（今天正在练的那几组不算）
 */
export function strengthTrend(sessions = [], exerciseOrItem, date = '', { days = TREND_DAYS } = {}) {
  const item = typeof exerciseOrItem === 'string' ? { id: exerciseOrItem, sets: [] } : exerciseOrItem;
  if (!exerciseForRecord(item) || !date) return null;
  const defaults = recordingDefaultsFor(item, sessions, date);
  const metric = defaults.measure === 'time' ? 'seconds'
    : defaults.loadMode === 'bodyweight' ? 'reps'
      : defaults.loadMode === 'assistance' ? 'assist'
        : defaults.loadConvention === 'scale' ? 'scale' : 'e1rm';
  const points = workHistory(sessions, item.id, date)
    .filter((e) => dayOffset(date, e.date) <= days)
    .map((e) => ({ date: e.date, y: bestOf(e.sets.filter((s) => comparable(s, defaults)), defaults) }))
    .filter((p) => p.y != null);
  if (points.length < TREND_MIN_SESSIONS) return null;
  const spanDays = dayOffset(points.at(-1).date, points[0].date);
  if (spanDays < TREND_MIN_SPAN) return null;
  const fit = linearFit(points.map((p) => ({ x: dayOffset(p.date, points[0].date), y: p.y })));
  if (!fit) return null;
  const from = fit.intercept;
  const to = fit.intercept + fit.perDay * spanDays;
  let pct = null;
  let direction;
  if (metric === 'assist') {
    // 辅助越少越强；变化不到一档（2.5kg）说明不了什么
    const change = to - from;
    direction = change <= -LOAD_STEP_KG ? 'up' : change >= LOAD_STEP_KG ? 'down' : 'flat';
  } else {
    if (!(from > 0)) return null;
    pct = Math.round(((to - from) / from) * 100);
    direction = pct >= TREND_FLAT_PCT ? 'up' : pct <= -TREND_FLAT_PCT ? 'down' : 'flat';
  }
  return {
    metric, from, to, pct, direction, sessions: points.length, spanDays,
    weeks: Math.max(2, Math.round(spanDays / 7)),
  };
}

const signed = (v) => `${v > 0 ? '+' : ''}${v}`;

/** 趋势那一行的数：「估算 1RM 80 → 84kg（+5%）」 */
export function trendText(trend) {
  if (!trend) return null;
  const r = (v) => Math.round(v);
  if (trend.metric === 'e1rm') return `估算 1RM ${r(trend.from)} → ${withUnit(r(trend.to), 'kg')}（${signed(trend.pct)}%）`;
  if (trend.metric === 'reps') return `最多 ${r(trend.from)} → ${withUnit(r(trend.to), '次')}`;
  if (trend.metric === 'seconds') return `最长 ${r(trend.from)} → ${withUnit(r(trend.to), '秒')}`;
  if (trend.metric === 'assist') {
    const half = (v) => fmt(Math.round(v * 2) / 2);
    return `辅助 ${half(trend.from)} → ${withUnit(half(trend.to), 'kg')}`;
  }
  return `按刻度估算 ${signed(trend.pct)}%`;
}

/** 「在涨 / 基本持平 / 在降」—— 减脂期持平说成「保持住了」，那本来就是目标 */
export function trendWord(trend, goal = null) {
  if (!trend) return null;
  if (trend.direction === 'up') return '在涨';
  if (trend.direction === 'down') return '在降';
  return goal === 'cut' ? '保持住了' : '基本持平';
}

/**
 * 近几周练得最勤、算得出趋势的几个动作。每周复盘拿它说「主项力量怎么样」。
 * 排序：次数多的在前，同样多时复合动作在前（主项通常是复合动作）。
 */
export function trackedLifts(sessions = [], date = '', { limit = 3, days = TREND_DAYS } = {}) {
  const ids = new Set();
  for (const raw of sessions || []) {
    if (!raw?.date || raw.date >= date || dayOffset(date, raw.date) > days) continue;
    for (const item of normalizeSession(raw).items) if (item.sets.some(isWorkSet)) ids.add(item.id);
  }
  return [...ids]
    .map((id) => ({ id, exercise: exerciseForRecord({ id }), trend: strengthTrend(sessions, id, date, { days }) }))
    .filter((row) => row.trend && row.exercise)
    .sort((a, b) => (b.trend.sessions - a.trend.sessions)
      || (Number(Boolean(b.exercise.compound)) - Number(Boolean(a.exercise.compound))))
    .slice(0, limit)
    .map(({ id, exercise, trend }) => ({ id, name: exercise.name, trend }));
}

/* ------------------------------------------------- 草稿预填 ------------- */

/**
 * 「加第一组 / 再加一组」时草稿里预填什么。
 *
 * 今天的第一组正式组填目标；之后几组重量沿用今天上一组正式组（你可能临场改了重量），
 * 只有今天用的就是目标重量时，次数才取对应那一组的目标 —— 换了重量，
 * 上次那几组的次数就不再是参照了。别的情况一律退回 createSetDraft 原来的做法。
 * 草稿只是输入框里的数，确认之前不写库。
 */
export function setDraftFor(item, sessions = [], date = '', target = progressionTarget(sessions, item, date)) {
  const draft = createSetDraft(item, sessions, date);
  if (!target || target.kind === 'incomparable' || target.kind === 'harder') return draft;
  if (draft.measure !== target.measure || draft.loadMode !== target.loadMode
    || draft.loadConvention !== target.loadConvention) return draft;
  const field = target.measure === 'time' ? 'durationSeconds' : 'reps';
  const withLoad = (load) => (draft.loadMode === 'bodyweight' ? null : load ?? draft.weightKg);
  const todayWork = (item.sets || []).filter(isWorkSet);
  if (!todayWork.length) {
    return { ...draft, weightKg: withLoad(target.load), [field]: target.values[0] ?? draft[field] };
  }
  const lastWork = todayWork.at(-1);
  const onTarget = target.load == null || lastWork.weightKg === target.load;
  const planned = onTarget ? target.values[todayWork.length] : null;
  return { ...draft, weightKg: withLoad(lastWork.weightKg), [field]: planned ?? lastWork[field] ?? draft[field] };
}
