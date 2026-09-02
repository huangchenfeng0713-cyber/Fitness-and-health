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
 * 今天这套动作练到了哪几个部位（主动肌 + 协同肌）。
 *
 * 和 coverage() 不同：那个按肌肉逐条报缺口，用于排计划；这个只回答
 * 「这一组今天碰过没有」，给挑动作那排标记用。协同肌也算 ——
 * 卧推练到了三头，问「今天肩臂空着吗」时它不该算空着。
 */
export function coveredGroupKeys(selection = []) {
  const hit = new Set();
  for (const e of toExercises(selection)) {
    for (const m of [...(e.primary || []), ...(e.secondary || [])]) hit.add(m);
  }
  return new Set(GROUPS.filter((g) => g.muscles.some((m) => hit.has(m))).map((g) => g.key));
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
/**
 * 推 / 拉 / 腿 / 核心 —— 另一种挑动作的分法。
 *
 * 「今天练胸」和「今天是推的日子」是两种不同的思路：前者按部位，后者按动作模式。
 * 分化训练（PPL）用的是后者，一次练完所有推的动作，因为它们共用同一批
 * 协同肌（三角肌前束、肱三头肌），分开练等于让这些小肌肉连着两天挨累。
 *
 * 归类按动作模式走，不按主动肌 —— 侧平举练的是肩，但它和卧推共用不了
 * 肱三头肌，可在 PPL 的惯例里它仍归推日（同一天把肩练完，别再单开一天）。
 */
export const SPLITS = [
  { key: 'push', label: '推', patterns: ['horizontal_push', 'incline_push', 'vertical_push', 'chest_fly', 'dip', 'elbow_extension', 'lateral_raise'] },
  { key: 'pull', label: '拉', patterns: ['horizontal_pull', 'vertical_pull', 'pullover', 'shrug', 'rear_delt', 'elbow_flexion'] },
  { key: 'legs', label: '腿', patterns: ['squat', 'hinge', 'lunge', 'leg_extension', 'leg_curl', 'hip_thrust', 'adduction', 'abduction', 'calf_raise'] },
  { key: 'core', label: '核心', patterns: ['trunk_flexion', 'anti_extension', 'anti_rotation', 'anti_lateral', 'rotation', 'lateral_flexion'] },
];

const SPLIT_BY_PATTERN = new Map(
  SPLITS.flatMap((s) => s.patterns.map((p) => [p, s.key])),
);

/*
 * 髋铰链是唯一一个光看模式分不了的：这一类里既有以竖脊肌为主的
 * （硬拉、架上拉、山羊挺身、器械背伸展 —— PPL 里都在拉日），
 * 也有以腘绳肌臀大肌为主的（罗马尼亚硬拉、早安式 —— 在腿日）。
 * 一律归腿的话，练拉日的人在「拉」里找不到硬拉和背伸展。
 * 所以这一类按主动肌里排第一的那块再分一次。
 */
const PULL_DOMINANT = new Set(['erector', 'trap_mid', 'trap_upper', 'rhomboid', 'lat']);

/** 一个动作属于推 / 拉 / 腿 / 核心里的哪一类 */
export function splitOf(exercise) {
  const base = SPLIT_BY_PATTERN.get(exercise?.pattern) || null;
  if (base === 'legs' && exercise?.pattern === 'hinge' && PULL_DOMINANT.has(exercise.primary?.[0])) {
    return 'pull';
  }
  return base;
}

/** 某一类下的全部动作，顺序沿用动作库里的录入顺序 */
export function exercisesForSplit(key) {
  return EXERCISES.filter((e) => splitOf(e) === key);
}

export function exercisesForGroup(groupKey) {
  return EXERCISES
    .filter((e) => e.group === groupKey)
    .sort((a, b) => (b.compound ? 1 : 0) - (a.compound ? 1 : 0));
}

/*
 * 推荐组合是一个可编辑的起手模板，不是「至少要做几个动作」的健康门槛。
 * 每个范围先列最有代表性的互补动作模式，再从该模式中优先选库里靠前的复合动作。
 * 这样不会出现腿日先推髋内收/外展、拉日先给四个弯举的排序错误。
 */
const GROUP_STARTER_PATTERNS = Object.freeze({
  chest: ['horizontal_push', 'incline_push', 'chest_fly', 'dip'],
  shoulder: ['vertical_push', 'lateral_raise', 'rear_delt', 'elbow_flexion', 'elbow_extension'],
  back: ['vertical_pull', 'horizontal_pull', 'hinge', 'pullover'],
  leg: ['squat', 'hinge', 'lunge', 'leg_curl', 'calf_raise'],
  core: ['anti_extension', 'trunk_flexion', 'anti_lateral', 'anti_rotation'],
});

const SPLIT_STARTER_PATTERNS = Object.freeze({
  push: ['horizontal_push', 'vertical_push', 'incline_push', 'lateral_raise', 'elbow_extension'],
  pull: ['vertical_pull', 'horizontal_pull', 'rear_delt', 'elbow_flexion'],
  legs: ['squat', 'hinge', 'lunge', 'leg_curl', 'calf_raise'],
  core: ['anti_extension', 'trunk_flexion', 'anti_lateral', 'anti_rotation'],
});

function comboForPatterns(list, patterns, requestedSize) {
  const size = Math.max(1, Math.min(Number(requestedSize) || patterns.length, list.length));
  const combo = [];
  for (const pattern of patterns) {
    if (combo.length >= size) break;
    const candidate = list
      .filter((e) => e.pattern === pattern && !combo.some((picked) => picked.id === e.id))
      .sort((a, b) => Number(b.compound) - Number(a.compound))
      .find((e) => combo.every((picked) => overlapLevel(overlapScore(e, picked)) !== 'high'));
    if (candidate) combo.push(candidate);
  }
  // 动作库较小或某个模式缺失时仍尽量凑齐，但不塞进高度重复的替代品。
  for (const exercise of list) {
    if (combo.length >= size) break;
    if (combo.some((picked) => picked.id === exercise.id)) continue;
    if (combo.some((picked) => overlapLevel(overlapScore(exercise, picked)) === 'high')) continue;
    combo.push(exercise);
  }
  return combo;
}

/**
 * 某个部位的起手组合。
 *
 * 早先只是「挑一个复合动作，再配两个和它重合最低的」。动作库补到 100 多个之后，
 * 重合最低的永远是孤立动作——胸日会被搭成「一个卧推 + 两个飞鸟」，
 * 三个动作全压在胸大肌中部，上胸下胸一个没练到。
 *
 * 现在的规则：默认的 4–5 个动作优先来自不同动作模式（推 / 拉 / 铰链…），
 * 每一步只收「至少练到一块还没练到的肌肉」的，其中复合动作优先，
 * 再按库里的录入顺序（主流动作排在前面）。
 *
 * 换模式这条比「多覆盖几块肌肉」更管用：只按覆盖面排会搭出
 * 「杠铃划船 + 俯卧撑胸划船」这种两个水平拉，或者把早安式体前屈顶进新手方案。
 */
export function starterCombo(groupKey, size = null) {
  const list = exercisesForGroup(groupKey);
  if (!list.length) return [];
  const patterns = GROUP_STARTER_PATTERNS[groupKey] || [...new Set(list.map((e) => e.pattern))];
  return comboForPatterns(list, patterns, size ?? patterns.length);
}

/** 按推 / 拉 / 腿 / 核心生成另一套起手组合。 */
export function starterSplitCombo(splitKey, size = null) {
  const list = exercisesForSplit(splitKey);
  if (!list.length) return [];
  const patterns = SPLIT_STARTER_PATTERNS[splitKey] || [...new Set(list.map((e) => e.pattern))];
  return comboForPatterns(list, patterns, size ?? patterns.length);
}

/*
 * 器械筛选。动作库到 100 多个之后，一个部位三十来个动作滑不完，
 * 而且「今天只有固定器械可用」是健身房里最常见的约束。
 *
 * 定义放 core，是因为推荐和动作列表要用**同一份**：
 * 两边各写一份的话，筛到「徒手」时列表里全是徒手动作，
 * 推荐位却还在推杠铃卧推 —— 推荐就成了和这一屏无关的东西。
 */
export const EQUIP_FILTERS = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'machine', label: '固定器械', match: (e) => e.equipment === 'machine' || e.equipment === 'cable' },
  { key: 'free', label: '自由重量', match: (e) => e.equipment === 'barbell' || e.equipment === 'dumbbell' || e.equipment === 'kettlebell' },
  { key: 'bodyweight', label: '徒手', match: (e) => e.equipment === 'bodyweight' || e.equipment === 'band' },
];

export const equipFilterOf = (key) => EQUIP_FILTERS.find((f) => f.key === key) || EQUIP_FILTERS[0];

/**
 * 当前范围里该推荐哪几个动作。
 *
 * 和 starterCombo 的区别是它**认得已经选了什么**：
 * 已选的不再推荐，和已选动作高度重合的也不推荐 ——
 * 否则选完杠铃卧推，推荐位第一个还是哑铃卧推，等于劝人把同一件事做两遍。
 *
 * 挑的顺序仍然是「先覆盖不同的动作模式，复合动作优先」，
 * 这样一套下来角度是散开的，而不是五个动作练同一个角度。
 *
 * 数量：按部位 3–5 个，按推拉腿 4–6 个。部位窄，四五个就够铺开；
 * 推 / 拉 / 腿跨的部位多，少了盖不住。
 *
 * @returns {{items, replacements, scopeKey}}
 *  - items        [{ id, name, tags }]，tags 是短标签，不写长句
 *  - replacements 已选里有高度重合的一对时，给出「换掉哪个、换成什么」
 */
export function recommendFor({
  mode = 'group', groupKey = null, splitKey = null, selection = [], equip = 'all',
} = {}) {
  const byGroup = mode !== 'split';
  const scopeKey = byGroup ? groupKey : splitKey;
  const scopeMuscles = byGroup
    ? (GROUPS.find((g) => g.key === groupKey)?.muscles || null)
    : null;
  const inScope = byGroup ? exercisesForGroup(groupKey) : exercisesForSplit(splitKey);
  // 器械档位也得算进去：列表里全是徒手动作、推荐位却在推杠铃，那不叫推荐
  const pool = inScope.filter(equipFilterOf(equip).match);
  if (!pool.length) return { items: [], replacements: [], scopeKey };

  const chosen = toExercises(selection);
  const chosenIds = new Set(chosen.map((e) => e.id));
  const patterns = (byGroup ? GROUP_STARTER_PATTERNS[groupKey] : SPLIT_STARTER_PATTERNS[splitKey])
    || [...new Set(pool.map((e) => e.pattern))];
  const size = byGroup ? RECOMMEND_SIZE.group : RECOMMEND_SIZE.split;

  // 已选的、以及和已选高度重合的，都不再推荐
  const candidates = pool.filter((e) => !chosenIds.has(e.id)
    && !chosen.some((c) => overlapLevel(overlapScore(e, c)) === 'high'));
  const combo = comboForPatterns(candidates, patterns, Math.min(size, candidates.length));

  /*
   * 已经选了高度重合的一对时，直接把「换掉哪个」摆出来。
   * 只报最重的那一对：一次列五对，等于把选择的负担又推回去。
   */
  const replacements = [];
  const worst = findOverlaps(chosen).filter((o) => o.level === 'high')[0];
  if (worst) {
    const drop = worst.b || worst.a;
    const keep = drop === worst.b ? worst.a : worst.b;
    const options = replacementsFor(drop, chosen, 2);
    if (options.length) {
      replacements.push({
        dropId: drop.id,
        title: `${keep.name}和${drop.name}刺激高度重叠`,
        options: options.map((e) => ({ id: e.id, name: e.name })),
      });
    }
  }

  return {
    scopeKey,
    /*
     * 标签和「全部动作」那一列必须一致 —— 两个视图看的是同一批动作，
     * 标签数不一样会让人以为它们说的不是一回事。所以范围也一起传进去：
     * 按部位挑时省掉「主练 XX」（那就是筛选条件本身），按模式挑时照写。
     */
    items: combo.map((e) => ({
      id: e.id, name: e.name, tags: exerciseTags(e, { scopeMuscles }),
    })),
    replacements,
  };
}

/** 推荐几个。按部位窄、按推拉腿宽，见 recommendFor 的注释 */
export const RECOMMEND_SIZE = Object.freeze({ group: 5, split: 6 });

/**
 * 推荐理由压成三个短标签：动作模式 · 主练哪儿 · 复合还是孤立。
 * 写成整句的话，五条推荐就是五段话，读完比自己翻列表还慢。
 */
/**
 * 动作行下面那几个短标签。
 *
 * `scopeMuscles` 是当前筛选范围覆盖的肌肉。筛到「胸」的时候，五行全写着
 * 「主练胸大肌中部」—— 这句话是筛选条件本身，重复了五遍，
 * 反而把真正有区别的那两条（模式、复合还是孤立）挤淡了。
 * 所以主动肌已经落在当前范围里时就省掉它；搜索结果里没有范围可言，照写不误。
 */
export function exerciseTags(exercise, { scopeMuscles = null } = {}) {
  if (!exercise) return [];
  const primary = exercise.primary?.[0];
  const scopeSaysIt = primary && scopeMuscles?.length === 1 && scopeMuscles[0] === primary;
  const redundant = primary && Array.isArray(scopeMuscles) && scopeMuscles.includes(primary)
    && scopeMuscles.length <= 3;
  return [
    PATTERNS[exercise.pattern],
    primary && !(scopeSaysIt || redundant) ? `主练${MUSCLES[primary]}` : null,
    exercise.compound ? '复合动作' : '孤立动作',
  ].filter(Boolean);
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
      title: `${o.a.name} 和 ${o.b.name} 的刺激高度相似`,
      // 建议要能直接点，光念一串动作名等于让人回到列表里自己找。
      // 动作名只出现在按钮上，正文不再重复念一遍。
      actions: alts.map((e) => ({ id: e.id, label: e.name, replaces: o.b.id })),
      // 现在库里同一个模式往往有好几台器械，两边都是 machine 时不能再说「只差器械」
      text: `两者都是${PATTERNS[o.a.pattern]}、主要练${o.sharedPrimary.map((m) => MUSCLES[m]).join('、') || MUSCLES[o.a.primary[0]]}，`
        + (o.a.equipment === o.b.equipment
          ? `器械也一样（${EQUIPMENT[o.a.equipment]}），只是换了台机子。`
          : `只差器械（${EQUIPMENT[o.a.equipment]} / ${EQUIPMENT[o.b.equipment]}）。`)
        + '同一次训练里放两个，多出来的组数主要是加训练量，不是增加明显不同的刺激角度——'
        + '要不要保留取决于你的训练目的和这一周的总量。'
        + (alts.length ? `如果想换个角度，把 ${o.b.name} 换成下面任意一个，它们和这套没有高度重复。` : ''),
    });
  }
  tips.push(...dupTips);
  // 用 id 集合判断，不要拿 key.endsWith(id) 去猜——id 互为后缀时会误判
  const stillOverlapping = [...deferred].filter((id) => !tipped.has(id));
  if (stillOverlapping.length) {
    tips.push({
      level: 'info',
      key: 'dup-more',
      title: `另有 ${stillOverlapping.length} 个动作和上面这些刺激相似`,
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
        + '放在一起很常见，只是两个都做到接近力竭时，后一个的可用负荷会明显下降；'
        + '如果复合动作是当天主项，通常把它排在前面更容易维持动作质量。',
    });
  }
  if (somes.length > 3) {
    tips.push({
      level: 'info',
      key: 'part-more',
      title: `还有 ${somes.length - 3} 组动作部分重叠`,
      text: '部分重叠不算错，这里只列最像的三组；更值得先看的是上面那些刺激高度相似的。',
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
      text: '不必每次训练都一比一，但一周内同时安排推和拉，通常比长期只练一侧更完整。具体比例应按目标、动作和恢复情况调整。',
    });
  }

  // 只做孤立动作
  const compound = list.filter((e) => e.compound).length;
  if (list.length >= 3 && compound === 0) {
    tips.push({
      level: 'info',
      key: 'no-compound',
      title: '这套全是孤立动作',
      text: '孤立动作也能有效训练局部肌肉；复合动作的优势是用更少动作覆盖更多肌群。可先加一个适合自己的多关节动作作为主项。',
    });
  } else if (compound > 0) {
    const first = list.findIndex((e) => e.compound);
    if (first > 0 && !list[0].compound) {
      tips.push({
        level: 'info',
        key: 'order',
        title: `建议把 ${list[first].name} 排到最前面`,
        text: '通常把最重要、技术要求更高的动作放在体力较好时更容易稳定完成；如果某块肌肉是优先目标，也可以把相应动作提前。',
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

/* ------------------------------------------------- 训练记录 ------------- */

/**
 * 一天的训练记录。
 *
 * 之前「今日计划」只存在页面内存里（`let picked = []`），刷新就没了——
 * 记不下来的计划等于没记，所以从 v1.7.4 起按天落库。
 *
 * 结构刻意做得很浅：{ date, items: [{ id, sets: [{ reps, weightKg }], done }] }。
 * 组数用数组而不是「组数 × 次数」两个数字，是因为递减组、递增重量这些
 * 真实练法里每组本来就不一样，压成两个数字会逼人取平均，反而失真。
 */
const MAX_SETS = 20;
const MAX_REPS = 500;
const MAX_WEIGHT_KG = 500;

const clampNum = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};

/** 把任意来源（旧备份、云端、手输）的记录清洗成可用结构，坏数据丢掉而不是抛异常 */
export function normalizeSession(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const seen = new Set();
  const clean = [];
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : null;
    if (!id || seen.has(id) || !EXERCISE_BY_ID.has(id)) continue;
    seen.add(id);
    const sets = (Array.isArray(item.sets) ? item.sets : []).slice(0, MAX_SETS).map((set) => ({
      reps: clampNum(set?.reps, 0, MAX_REPS),
      weightKg: clampNum(set?.weightKg, 0, MAX_WEIGHT_KG),
    }));
    clean.push({ id, sets, done: item.done === true });
  }
  return { date: typeof raw.date === 'string' ? raw.date : '', items: clean };
}

/** 这次练了多少：总组数、完成组数、按部位的组数，以及能算出来的总容量 */
export function sessionVolume(session) {
  const { items } = normalizeSession(session);
  const byGroup = {};
  let sets = 0;
  let doneSets = 0;
  let tonnage = 0;
  let weighed = 0;
  for (const item of items) {
    const exercise = EXERCISE_BY_ID.get(item.id);
    const counted = item.sets.length;
    sets += counted;
    byGroup[exercise.group] = (byGroup[exercise.group] || 0) + counted;
    for (const set of item.sets) {
      if (set.reps > 0) doneSets += 1;
      if (set.reps > 0 && set.weightKg > 0) {
        tonnage += set.reps * set.weightKg;
        weighed += 1;
      }
    }
  }
  return {
    exercises: items.length,
    sets,
    doneSets,
    byGroup,
    // 只有真的填了重量的组才计入总容量；一组都没填时给 null，不要显示 0 kg
    tonnage: weighed ? Math.round(tonnage) : null,
    weighedSets: weighed,
  };
}

/**
 * 最近练过的动作，最近的排前面。
 * 用来在动作列表上标「上次练过」，省得每次从头翻。
 */
export function recentExercises(sessions = [], { limit = 12, before = null } = {}) {
  const seen = new Map();
  const ordered = [...sessions]
    .filter((s) => s?.date && (!before || s.date < before))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const session of ordered) {
    for (const item of normalizeSession(session).items) {
      if (!seen.has(item.id)) seen.set(item.id, session.date);
      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }
  return [...seen].map(([id, date]) => ({ exercise: EXERCISE_BY_ID.get(id), date }))
    .filter((r) => r.exercise);
}

/**
 * 近一周各部位练了多少组。
 *
 * 只报数字，不给「每周该练几组」的结论——那要结合训练年限、恢复能力和目的，
 * 从「这周练了什么」里看不出来。
 */
/**
 * 近 7 日训练记录：一行一个动作，日期 + 名字 + 组数 / 重量 / 次数。
 *
 * 原先这里是「近 7 天训练量」——各部位练了多少组的一排数字，加一段
 * 「这里只报数，不给每周该练几组的结论」的说明。那段说明是对的，
 * 可它占的地方比数字还大，而人翻到这儿想看的是「我前天练了什么」。
 *
 * 重量和次数按组去重后写成区间：递减组、爬坡加重是真实练法，
 * 压成一个平均数会把这件事抹掉。所有数字都来自实际记录，没记就不写。
 */
export function recentTrainingRows(sessions = [], endDate, days = 7) {
  const end = String(endDate || '');
  if (!end) return [];
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * 86400000)
    .toISOString().slice(0, 10);
  const rows = [];
  for (const raw of sessions) {
    if (!raw?.date || raw.date < start || raw.date > end) continue;
    const session = normalizeSession(raw);
    for (const item of session.items) {
      const exercise = EXERCISE_BY_ID.get(item.id);
      if (!exercise) continue;
      rows.push({
        date: session.date,
        id: item.id,
        name: exercise.name,
        setCount: item.sets.length,
        weightLabel: spanLabel(item.sets.map((x) => x.weightKg), 'kg'),
        repsLabel: spanLabel(item.sets.map((x) => x.reps), '次'),
        sets: item.sets,
        done: item.done,
      });
    }
  }
  // 新的排前面；同一天里保持记录时的顺序
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * 这个动作上一次是怎么练的：日期 + 重量区间 + 每组次数。
 *
 * 排计划的时候最想知道的就是「上次推了多少」，而它现在只写在页面最下面的
 * 「近 7 日训练记录」里 —— 挑动作要先滚到底、记住数字、再滚回来。
 *
 * 只认真的记了重量或次数的那一次：一次「勾了动作但没填组」不该顶掉
 * 前面那次填满的记录，否则给出来的是「上次 —」，比不给还糟。
 * 不限 7 天：上次练胸可能是十天前，那也是「上次」。
 */
export function lastPerformance(sessions = [], exerciseId, { before = null } = {}) {
  if (!exerciseId) return null;
  const ordered = [...sessions]
    .filter((s) => s?.date && (!before || s.date < before))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const raw of ordered) {
    const item = normalizeSession(raw).items.find((x) => x.id === exerciseId);
    if (!item?.sets?.length) continue;
    const weightLabel = spanLabel(item.sets.map((x) => x.weightKg), 'kg');
    const repsList = item.sets.map((x) => x.reps).filter((v) => Number.isFinite(v) && v > 0);
    if (!weightLabel && !repsList.length) continue;
    return {
      date: raw.date,
      setCount: item.sets.length,
      weightLabel,
      // 次数逐组列出来而不是压成区间：8,8,6 和 6–8 说的不是一回事
      repsLabel: repsList.length ? repsList.join(',') : null,
    };
  }
  return null;
}

/** 一组数写成「50kg」或「50–60kg」；一个都没记就不写 */
function spanLabel(values, unit) {
  const nums = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const fmt = (v) => String(Math.round(v * 10) / 10);
  return lo === hi ? `${fmt(lo)}${unit}` : `${fmt(lo)}–${fmt(hi)}${unit}`;
}

export function weeklyVolume(sessions = [], endDate, days = 7) {
  const end = String(endDate || '');
  const start = end ? new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * 86400000)
    .toISOString().slice(0, 10) : '';
  const inWindow = sessions.filter((s) => s?.date && s.date >= start && s.date <= end);
  const byGroup = {};
  let sets = 0;
  for (const session of inWindow) {
    const volume = sessionVolume(session);
    sets += volume.sets;
    for (const [group, n] of Object.entries(volume.byGroup)) {
      byGroup[group] = (byGroup[group] || 0) + n;
    }
  }
  return { days, sessions: inWindow.length, sets, byGroup, start, end };
}
