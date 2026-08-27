/**
 * 训练动作的重复度与组合建议。
 *
 * 纯函数，不碰 DOM，可以在 Node 里单测。
 *
 * 核心问题：同一天同时练杠铃卧推和哑铃卧推，等于把同一件事做了两遍。
 * 判据不是名字像不像，而是「动作模式 + 主要发力肌肉」是否重合——
 * 上斜卧推和平板卧推名字更像，但练的部位不同，不该判成重复；
 * 而窄距卧推和绳索下压名字毫不相干，主动肌都是肱三头肌，反而有真实重叠。
 */

import { EXERCISES, EXERCISE_BY_ID, GROUPS, MUSCLES, PATTERNS, EQUIPMENT } from '../data/exercises.js';

const jaccard = (a = [], b = []) => {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  for (const v of sa) if (sb.has(v)) inter += 1;
  return inter / (sa.size + sb.size - inter);
};

/*
 * 权重取值说明（属于产品取舍，不是生理常数）：
 *   主动肌 0.55  —— 练哪块肉是最重要的判据
 *   动作模式 0.25 —— 同一个模式意味着同样的关节角度与发力顺序
 *   协同肌 0.20  —— 只作微调，避免「都练到三头」就把一堆动作判成重复
 */
const W_PRIMARY = 0.55;
const W_PATTERN = 0.25;
const W_SECONDARY = 0.2;

/** 两个动作的重合度 0~1 */
export function overlapScore(a, b) {
  if (!a || !b || a.id === b.id) return 1;
  return W_PRIMARY * jaccard(a.primary, b.primary)
    + W_PATTERN * (a.pattern === b.pattern ? 1 : 0)
    + W_SECONDARY * jaccard(a.secondary, b.secondary);
}

export const OVERLAP_HIGH = 0.7;
export const OVERLAP_SOME = 0.45;

export function overlapLevel(score) {
  if (score >= OVERLAP_HIGH) return 'high';
  if (score >= OVERLAP_SOME) return 'some';
  return 'none';
}

const toExercises = (ids = []) => ids
  .map((id) => (typeof id === 'string' ? EXERCISE_BY_ID.get(id) : id))
  .filter(Boolean);

/** 选中的动作里，哪些两两之间重复 */
export function findOverlaps(selection = []) {
  const list = toExercises(selection);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const score = overlapScore(list[i], list[j]);
      const level = overlapLevel(score);
      if (level === 'none') continue;
      out.push({
        a: list[i],
        b: list[j],
        score: Math.round(score * 100) / 100,
        level,
        samePattern: list[i].pattern === list[j].pattern,
        sharedPrimary: list[i].primary.filter((m) => list[j].primary.includes(m)),
      });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** 这套动作覆盖了哪些部位与肌肉，还缺什么 */
export function coverage(selection = []) {
  const list = toExercises(selection);
  const hit = new Set();
  for (const e of list) for (const m of e.primary) hit.add(m);
  return GROUPS.map((g) => {
    const covered = g.muscles.filter((m) => hit.has(m));
    return {
      key: g.key,
      label: g.label,
      exercises: list.filter((e) => e.group === g.key).length,
      covered,
      missing: g.muscles.filter((m) => !hit.has(m)),
    };
  });
}

/**
 * 替换建议：给定已选动作，从同部位里挑与整套重合度最低的几个。
 * 排除已选的，也排除和「要换掉的那个」本身高度重复的——换了等于没换。
 */
export function replacementsFor(target, selection = [], limit = 3) {
  const goal = typeof target === 'string' ? EXERCISE_BY_ID.get(target) : target;
  if (!goal) return [];
  const list = toExercises(selection);
  const chosen = new Set(list.map((e) => e.id));
  const rest = list.filter((e) => e.id !== goal.id);
  return EXERCISES
    .filter((e) => e.group === goal.group && !chosen.has(e.id))
    .map((e) => ({
      exercise: e,
      // 与「留下的那些动作」重合越低越好；和被换掉的那个也不能太像
      worst: Math.max(overlapScore(e, goal), ...rest.map((r) => overlapScore(e, r)), 0),
      // 只按重合度排，替换卧推时最先冒出来的是绳索夹胸——重合确实最低，
      // 但拿孤立动作换掉复合动作是把这次训练的主项拆了。同类优先。
      sameClass: !!e.compound === !!goal.compound,
    }))
    .filter((c) => overlapLevel(c.worst) !== 'high')
    .sort((x, y) => (Number(y.sameClass) - Number(x.sameClass)) || (x.worst - y.worst))
    .slice(0, limit)
    .map((c) => c.exercise);
}

/**
 * 针对某几块「还没练到」的肌肉，能补什么动作。
 *
 * 排序有两层：先看这个动作把多少块缺失肌肉当主动肌（补得准），
 * 再看它与已选动作的最高重合度（补进去不会变成又一次重复）。
 * 只说「还没练到三角肌后束」而不给动作名，等于把问题原样退回给用户。
 */
export function exercisesForMuscles(muscles = [], options = {}) {
  const { exclude = [], group = null, limit = 3 } = options;
  const want = new Set(muscles);
  if (!want.size) return [];
  const chosen = toExercises(exclude);
  const taken = new Set(chosen.map((e) => e.id));
  return EXERCISES
    .filter((e) => !taken.has(e.id) && (!group || e.group === group))
    .map((e) => ({
      exercise: e,
      hits: e.primary.filter((m) => want.has(m)).length,
      worst: chosen.length ? Math.max(...chosen.map((r) => overlapScore(e, r))) : 0,
    }))
    .filter((c) => c.hits > 0 && overlapLevel(c.worst) !== 'high')
    .sort((a, b) => (b.hits - a.hits) || (a.worst - b.worst))
    .slice(0, limit)
    .map((c) => c.exercise);
}

/** 某个部位可以练哪些动作，复合动作排前面 */
export function exercisesForGroup(groupKey) {
  return EXERCISES
    .filter((e) => e.group === groupKey)
    .sort((a, b) => (b.compound ? 1 : 0) - (a.compound ? 1 : 0));
}

/**
 * 某个部位的起手组合。
 *
 * 早先只是「挑一个复合动作，再配两个和它重合最低的」。动作库补到 100 多个之后，
 * 重合最低的永远是孤立动作——胸日会被搭成「一个卧推 + 两个飞鸟」，
 * 三个动作全压在胸大肌中部，上胸下胸一个没练到。
 *
 * 现在的规则：三个动作必须是三个不同的动作模式（推 / 拉 / 铰链…），
 * 每一步只收「至少练到一块还没练到的肌肉」的，其中复合动作优先，
 * 再按库里的录入顺序（主流动作排在前面）。
 *
 * 换模式这条比「多覆盖几块肌肉」更管用：只按覆盖面排会搭出
 * 「杠铃划船 + 俯卧撑胸划船」这种两个水平拉，或者把早安式体前屈顶进新手方案。
 */
export function starterCombo(groupKey, size = 3) {
  const list = exercisesForGroup(groupKey);
  if (!list.length) return [];
  const anchor = list.find((e) => e.compound) || list[0];
  const combo = [anchor];
  const covered = new Set(anchor.primary);
  while (combo.length < size) {
    const patterns = new Set(combo.map((e) => e.pattern));
    const pool = list.filter((e) => !combo.some((c) => c.id === e.id));
    // 模式不重样是硬要求；实在挑不出来（动作少的部位）才放宽
    const fresh = pool.filter((e) => !patterns.has(e.pattern));
    const next = (fresh.length ? fresh : pool)
      .map((e, order) => ({
        exercise: e,
        order,
        fillsGap: e.primary.some((m) => !covered.has(m)),
        worst: Math.max(...combo.map((c) => overlapScore(e, c)), 0),
      }))
      .filter((c) => overlapLevel(c.worst) !== 'high')
      .sort((a, b) => (Number(b.fillsGap) - Number(a.fillsGap))
        || (Number(b.exercise.compound) - Number(a.exercise.compound))
        || (a.order - b.order))[0];
    if (!next) break;
    combo.push(next.exercise);
    for (const m of next.exercise.primary) covered.add(m);
  }
  return combo;
}

/**
 * 整套训练的建议。
 *
 * 只给能从「动作构成」本身看出来的结论：重复、推拉失衡、缺主要动作、
 * 复合动作该排前面。训练量、强度、周期这些要结合个人情况，不在这里瞎猜。
 */
export function planAdvice(selection = []) {
  const list = toExercises(selection);
  const tips = [];
  if (!list.length) return tips;

  const overlaps = findOverlaps(list);
  /*
   * 一个动作只提一次。
   *
   * 两两比对是 O(n²)：选满一个部位的十八个动作会生成五十多条提示，
   * 「杠铃卧推和另外五个重复」被拆成五条说五遍，真正要紧的那条反而被埋掉。
   * 按重合度从高到低贪心：每对里挑一个标记为「该换掉的」，
   * 只要这一对里已经有动作被标记过就跳过——去掉它之后那些重叠自然消失。
   */
  const MAX_DUP_TIPS = 5;
  const flagged = new Set();
  const highs = overlaps.filter((x) => x.level === 'high');
  const deferred = new Set();
  const dupTips = [];
  const tipped = new Set();   // 已经单独出过提示的动作，汇总里不再重复计数
  for (const o of highs) {
    if (flagged.has(o.a.id) || flagged.has(o.b.id)) {
      deferred.add(o.a.id);
      deferred.add(o.b.id);
      continue;
    }
    flagged.add(o.b.id);
    // 一次最多列五条：真有十几个重复时，先改这几个再回来看比一次倒给用户有用
    if (dupTips.length >= MAX_DUP_TIPS) { deferred.add(o.b.id); continue; }
    tipped.add(o.b.id);
    const alts = replacementsFor(o.b, list, 3);
    dupTips.push({
      level: 'warn',
      key: `dup-${o.a.id}-${o.b.id}`,
      title: `${o.a.name} 和 ${o.b.name} 练的是同一件事`,
      // 建议要能直接点，光念一串动作名等于让人回到列表里自己找。
      // 动作名只出现在按钮上，正文不再重复念一遍。
      actions: alts.map((e) => ({ id: e.id, label: e.name, replaces: o.b.id })),
      // 现在库里同一个模式往往有好几台器械，两边都是 machine 时不能再说「只差器械」
      text: `两者都是${PATTERNS[o.a.pattern]}、主要练${o.sharedPrimary.map((m) => MUSCLES[m]).join('、') || MUSCLES[o.a.primary[0]]}，`
        + (o.a.equipment === o.b.equipment
          ? `器械也一样（${EQUIPMENT[o.a.equipment]}），只是换了台机子。`
          : `只差器械（${EQUIPMENT[o.a.equipment]} / ${EQUIPMENT[o.b.equipment]}）。`)
        + '同一次训练里放两个，多出来的量没有换来新的刺激。'
        + (alts.length ? `换掉 ${o.b.name}、改成下面任意一个更划算，它们和这套都不重复。` : ''),
    });
  }
  tips.push(...dupTips);
  // 用 id 集合判断，不要拿 key.endsWith(id) 去猜——id 互为后缀时会误判
  const stillOverlapping = [...deferred].filter((id) => !tipped.has(id));
  if (stillOverlapping.length) {
    tips.push({
      level: 'info',
      key: 'dup-more',
      title: `另有 ${stillOverlapping.length} 个动作和上面这些重复`,
      text: '先按上面的建议换掉几个，剩下的重叠多半会跟着消失，调整完再看一遍这里。',
    });
  }

  /*
   * 部分重叠只提最像的三组。这类提示是「知道就好」，不是必须处理的问题，
   * 全部列出来只会把上面真正要改的那几条挤出屏幕。
   */
  const somes = overlaps.filter((x) => x.level === 'some');
  for (const o of somes.slice(0, 3)) {
    tips.push({
      level: 'info',
      key: `part-${o.a.id}-${o.b.id}`,
      title: `${o.a.name} 与 ${o.b.name} 有部分重叠`,
      text: `共同练到 ${[...new Set([...o.a.primary, ...o.b.primary])].map((m) => MUSCLES[m]).join('、')}。`
        + '放在一起不算错，但两个都做力竭时后一个会明显掉力量，把复合动作排前面。',
    });
  }
  if (somes.length > 3) {
    tips.push({
      level: 'info',
      key: 'part-more',
      title: `还有 ${somes.length - 3} 组动作部分重叠`,
      text: '部分重叠不算错，这里只列最像的三组；真正要处理的是上面那些高度重复。',
    });
  }

  // 推拉平衡：只在同时含有推或拉时才提，纯腿日不该被这条打扰
  const pushPatterns = new Set(['horizontal_push', 'incline_push', 'vertical_push', 'dip', 'chest_fly']);
  const pullPatterns = new Set(['horizontal_pull', 'vertical_pull', 'pullover', 'rear_delt']);
  const push = list.filter((e) => pushPatterns.has(e.pattern)).length;
  const pull = list.filter((e) => pullPatterns.has(e.pattern)).length;
  if (push + pull >= 3 && (push === 0 || pull === 0 || Math.max(push, pull) >= Math.min(push, pull) * 3)) {
    tips.push({
      level: 'info',
      key: 'push-pull',
      title: push > pull ? `推的动作 ${push} 个，拉只有 ${pull} 个` : `拉的动作 ${pull} 个，推只有 ${push} 个`,
      text: '长期偏向一侧容易让肩往前扣。不必每次都一比一，但一周之内推和拉的组数尽量接近。',
    });
  }

  // 只做孤立动作
  const compound = list.filter((e) => e.compound).length;
  if (list.length >= 3 && compound === 0) {
    tips.push({
      level: 'info',
      key: 'no-compound',
      title: '这套全是孤立动作',
      text: '孤立动作适合补短板，但整体力量和肌肉量主要靠复合动作推动。先加一个深蹲、硬拉、卧推或引体这类多关节动作打底。',
    });
  } else if (compound > 0) {
    const first = list.findIndex((e) => e.compound);
    if (first > 0 && !list[0].compound) {
      tips.push({
        level: 'info',
        key: 'order',
        title: `建议把 ${list[first].name} 排到最前面`,
        text: '复合动作对神经和关节的要求最高，放在体力最好的时候做；孤立动作留到后面收尾。',
      });
    }
  }

  // 覆盖情况
  const cov = coverage(list).filter((c) => c.exercises > 0);
  for (const c of cov) {
    if (!c.missing.length || c.exercises < 2) continue;
    const fills = exercisesForMuscles(c.missing, { exclude: list, group: c.key, limit: 3 });
    // note 是「这个动作补的是哪块」，交给界面贴在按钮上；正文不再把动作名重复一遍
    const fillsFor = (e) => MUSCLES[e.primary.find((x) => c.missing.includes(x))] || '';
    tips.push({
      level: 'info',
      key: `gap-${c.key}`,
      title: `${c.label}：还没练到 ${c.missing.map((m) => MUSCLES[m]).join('、')}`,
      text: `这次${c.label}安排了 ${c.exercises} 个动作，但都集中在 ${c.covered.map((m) => MUSCLES[m]).join('、')}。`
        + (fills.length ? '想练全的话，从下面挑一个补上。' : '想练全的话补一个针对性动作。'),
      actions: fills.map((e) => ({ id: e.id, label: e.name, note: fillsFor(e) })),
    });
  }
  return tips;
}

export { MUSCLES, PATTERNS, EQUIPMENT, GROUPS };
