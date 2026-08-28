/**
 * 指标的性质，决定界面该怎么画、怎么说。
 *
 * 之前七种指标共用一根进度条，只有一个「超了算不算坏」的开关。
 * 于是碳水也长着一根没填满的条，旁边写「还差 29g」——可碳水是
 * 蛋白和脂肪分完热量之后的**余数**，不是要吃到的数。照着那根条去补，
 * 是界面在劝人多吃。
 *
 * 纯函数，不碰 DOM。所有措辞也在这里定：同一个性质在哪儿都得是同一句话。
 */

import { ATWATER } from './nutrition.js';

/** 指标性质 */
export const KIND = {
  /** 下限：够了就行，再多没有额外好处（蛋白、纤维） */
  floor: 'floor',
  /** 上限：别超（钠、游离糖） */
  ceiling: 'ceiling',
  /** 区间：落在里面就是照计划在走（热量、脂肪） */
  range: 'range',
  /**
   * 余数：由其它项算出来的结果，本来就不是目标。
   * 碳水曾经归在这里，措辞是「按剩余热量分配，不必吃满」—— 说的是对的，
   * 但那是开发者视角的解释，用户看不懂。现在碳水改用 AMDR 区间（45~65% 供能），
   * 有出处、能对照。这一档留着，别的指标要是也变成纯余数还用得上。
   */
  remainder: 'remainder',
  /** 记录：只是记下来，没有达标一说（饮水） */
  log: 'log',
};

/**
 * 显示等级。颜色语义只有这五档，别再加。
 *
 *   met   达到下限 / 落在区间内   —— 绿
 *   plain 中性，没有好坏          —— 灰
 *   near  接近或略微超出上限      —— 橙
 *   over  明确超过真上限          —— 红
 *
 * 红色**只留给真正的上限**。热量比计划多 180 kcal 不是错误：
 * 增重计划本来就要求每天吃超，把执行计划画成危险色是自相矛盾的。
 */
export const LEVEL = { met: 'met', plain: 'plain', near: 'near', over: 'over' };

/** 上限接近到多少算「该留意了」。纯工程取值，不是生理阈值。 */
export const CEILING_NEAR_PCT = 80;
/** 上限超过多少才算真超。留 5% 是给四舍五入和份量估算的余量。 */
export const CEILING_OVER_PCT = 105;
/**
 * 热量区间的宽度：计划目标的 ±10%。
 *
 * 工程护栏，没有生理含义。依据是「单日波动 10% 对一周均值的影响很小」——
 * 真正决定体重走向的是 7 天平均，不是某一天。判定「今天明显吃多了」用的仍是
 * advisor 里那条 12%，两处不要混。
 */
export const KCAL_BAND = 0.1;

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

const pctOf = (value, base) => (base > 0 ? (value / base) * 100 : 0);

/**
 * 算出一个指标该怎么显示。
 *
 * @param {object} spec
 *  - kind    KIND 里的一种
 *  - eaten   已摄入
 *  - target  下限 / 上限 / 区间中点，按 kind 解释
 *  - lo, hi  仅 kind='range' 用
 *  - unit    单位，进措辞
 *  - decimals 措辞里数字保留几位
 * @returns {{ level, note, fillPct, markerPct }}
 *  - fillPct   条形填充百分比（0~100）
 *  - markerPct 区间指标里「现在落在哪」的位置，其余为 null
 */
export function metricState({
  kind, eaten = 0, target = 0, lo = null, hi = null, unit = 'g', decimals = 0,
  // 区间是谁定的：热量那条是「你的计划」（目标 ±10%），
  // 脂肪碳水那两条是「文献建议」（IOM AMDR）。措辞不能混。
  rangeWord = '建议',
}) {
  /*
   * 先把进来的数收干净再用。目标一旦是 NaN 或负数，措辞里就会直接印出
   * 「还差 NaNg」「上限 -100g」—— 用户看到的是乱码，而不是「这项没数据」。
   * dailyTargets 自己不会产出这种值，但恢复备份和云端同步能把它写进来。
   */
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  eaten = num(eaten);
  target = num(target);
  lo = lo == null ? null : num(lo);
  hi = hi == null ? null : num(hi);
  const n = (v) => `${round(v, decimals)}${unit}`;

  if (kind === KIND.remainder) {
    return {
      level: LEVEL.plain,
      note: '按剩余热量分配，不必吃满',
      fillPct: Math.min(100, Math.max(0, pctOf(eaten, target))),
      markerPct: null,
    };
  }

  if (kind === KIND.log) {
    return {
      level: LEVEL.plain,
      note: target > 0 ? `参考 ${n(target)}` : '已记录',
      fillPct: Math.min(100, Math.max(0, pctOf(eaten, target))),
      markerPct: null,
    };
  }

  if (kind === KIND.floor) {
    const pct = pctOf(eaten, target);
    const short = target - eaten;
    return {
      level: pct >= 100 ? LEVEL.met : LEVEL.plain,
      note: pct >= 100 ? '已达到' : `还差 ${n(Math.max(0, short))}`,
      fillPct: Math.min(100, Math.max(0, pct)),
      markerPct: null,
    };
  }

  if (kind === KIND.ceiling) {
    const pct = pctOf(eaten, target);
    const level = pct > CEILING_OVER_PCT ? LEVEL.over
      : pct >= CEILING_NEAR_PCT ? LEVEL.near : LEVEL.plain;
    return {
      level,
      note: pct > 100 ? `已超 ${n(eaten - target)}`
        : level === LEVEL.near ? `接近上限，还剩 ${n(target - eaten)}`
          : `上限 ${n(target)}`,
      fillPct: Math.min(100, Math.max(0, pct)),
      markerPct: null,
    };
  }

  if (kind === KIND.range) {
    const low = Number(lo);
    const high = Number(hi);
    const inside = eaten >= low && eaten <= high;
    return {
      level: inside ? LEVEL.met : LEVEL.near,
      note: inside ? `在${rangeWord}范围内`
        : eaten < low ? `低于${rangeWord} ${n(low - eaten)}`
          : `高于${rangeWord} ${n(eaten - high)}`,
      // 单位只写一次：「281g–406g」读起来像两个独立的数
      range: `${round(low, decimals)}–${round(high, decimals)}${unit}`,
      ...rangeScale(eaten, low, high),
    };
  }

  throw new RangeError(`未知的指标性质：${kind}`);
}

/**
 * 区间指标怎么画：从左往右填到你的量，建议区间画成一段罩子盖在上面。
 *
 * 之前是「中间一段浅色 + 一根竖线」，有三个毛病：
 *  1. 罩子的颜色跟着你的位置变 —— 可区间是固定的建议，凭什么因为你吃多了就换色；
 *  2. 和上下几行（都是从左往右填）读法不一样，扫的时候要切换两次；
 *  3. 区间被压在 20%~80%，两头各留 20% 表示「低了/高了」——
 *     吃 10g 和吃 30g 标记位置差不了多少，图在压缩事实。
 *
 * 现在整条是线性的：轴顶取「建议上界的 1.35 倍」和「已摄入的 1.08 倍」里的大者，
 * 这样区间大致落在中段，超出多少也看得见。
 *
 * @returns {{ fillPct, zoneStart, zoneEnd, axisMax }} 都是 0~100 的百分比
 */
export function rangeScale(eaten, lo, hi) {
  const low = Math.max(0, Number(lo) || 0);
  const high = Math.max(low, Number(hi) || 0);
  const value = Math.max(0, Number(eaten) || 0);
  const axisMax = Math.max(high * 1.35, value * 1.08, 1);
  const pct = (v) => Math.max(0, Math.min(100, (v / axisMax) * 100));
  return {
    fillPct: pct(value),
    zoneStart: pct(low),
    zoneEnd: pct(high),
    axisMax: round(axisMax),
  };
}


/**
 * 结构判定的宽容带：碳水供能占比和计划差几个百分点以内算「跟着计划走」。
 * 纯工程取值，没有生理含义 —— 份量估算本身的误差就不止这么点。
 */
export const SPLIT_BALANCED_PP = 8;

/**
 * 碳水和脂肪合成一条：它们分的是同一块热量。
 *
 * 分开画成两条区间，最要命的是两条可以同时「在范围内」而总量对不上账：
 * 2660 kcal 的计划上实测有 796 kcal（30%）的自由度，两条各自说自己没问题。
 * 而且那时卡片会对着照计划吃的人写「碳水低于建议 74g」——热量明明已经吃满了。
 *
 * 合起来之后要回答的问题也变了，从「碳水够不够」变成「剩下这部分热量偏哪边」。
 * 比例按 4 / 9 kcal 每克算（就是界面上说的「按热量算」），
 * 不做纤维那 2 kcal 的细扣：那点差别不到 2%，写进去只会让人对不上手算的数。
 *
 * @returns {{carbG, fatG, kcal, carbPct, fatPct, planCarbPct, planFatPct,
 *            diffPp, structure, label, level, note}}
 */
export function macroSplit(targets = {}, gaps = {}) {
  const pos = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const share = (carbG, fatG) => {
    const carbKcal = carbG * ATWATER.carb;
    const total = carbKcal + fatG * ATWATER.fat;
    if (!(total > 0)) return null;
    // 两个百分比必须凑成 100：各自四舍五入会印出「58% : 43%」
    const carbPct = Math.round((carbKcal / total) * 100);
    return { carbPct, fatPct: 100 - carbPct, kcal: Math.round(total) };
  };

  const carbG = round(pos(gaps.carb?.eaten), 1);
  const fatG = round(pos(gaps.fat?.eaten), 1);
  const now = share(carbG, fatG);
  const plan = share(pos(targets.carb), pos(targets.fat));
  const base = {
    carbG, fatG, kcal: now?.kcal || 0,
    planCarbPct: plan?.carbPct ?? null, planFatPct: plan?.fatPct ?? null,
  };

  if (!now) {
    return {
      ...base,
      carbPct: null,
      fatPct: null,
      diffPp: null,
      structure: 'none',
      label: '还没有记录',
      level: LEVEL.plain,
      note: plan ? `计划 ${plan.carbPct}% : ${plan.fatPct}%` : '',
    };
  }

  const diffPp = plan ? now.carbPct - plan.carbPct : 0;
  const structure = !plan || Math.abs(diffPp) <= SPLIT_BALANCED_PP
    ? 'balanced' : diffPp > 0 ? 'carb' : 'fat';
  const label = structure === 'balanced'
    ? '结构接近计划'
    : `${structure === 'carb' ? '偏碳水' : '偏脂肪'} ${Math.abs(diffPp)} 个百分点`;
  return {
    ...base,
    carbPct: now.carbPct,
    fatPct: now.fatPct,
    diffPp,
    structure,
    label,
    /*
     * 偏一点不是错误，所以没有橙和红。
     * 三大营养素怎么分配本来就有很宽的合理区间，把「今天多吃了米饭」
     * 画成警告色，等于把一个偏好问题说成了健康问题。
     */
    level: structure === 'balanced' ? LEVEL.met : LEVEL.plain,
    note: plan ? `计划 ${plan.carbPct}% : ${plan.fatPct}%` : '',
  };
}

/**
 * 今日主卡上八个指标各是什么性质。
 *
 * 表放这里而不是视图里：它是「这个数意味着什么」，属于计算，
 * 而且今日主卡和别处要说同一套话。
 */
export function dailyMetrics(targets, gaps, water = null) {
  const kcalLo = Math.round(targets.kcal * (1 - KCAL_BAND));
  const kcalHi = Math.round(targets.kcal * (1 + KCAL_BAND));
  return [
    {
      key: 'kcal', label: '热量', unit: ' kcal', kind: KIND.range,
      eaten: gaps.kcal.eaten, target: targets.kcal, lo: kcalLo, hi: kcalHi,
      rangeWord: '计划',   // 这条区间是用户自己的计划，不是文献建议
    },
    {
      key: 'protein', label: '蛋白质', unit: 'g', kind: KIND.floor,
      eaten: gaps.protein.eaten, target: targets.protein,
    },
    {
      key: 'fat', label: '脂肪', unit: 'g', kind: KIND.range,
      eaten: gaps.fat.eaten, target: targets.fat,
      lo: targets.fatLower ?? targets.fat, hi: targets.fatUpper ?? targets.fat,
    },
    {
      key: 'carb', label: '碳水', unit: 'g', kind: KIND.range,
      eaten: gaps.carb.eaten, target: targets.carb,
      lo: targets.carbLower ?? targets.carb, hi: targets.carbUpper ?? targets.carb,
    },
    {
      key: 'fiber', label: '膳食纤维', unit: 'g', kind: KIND.floor,
      eaten: gaps.fiber.eaten, target: targets.fiber,
    },
    {
      key: 'sodium', label: '钠', unit: 'mg', kind: KIND.ceiling,
      eaten: gaps.sodium.eaten, target: targets.sodium,
    },
    {
      key: 'sugar', label: '游离糖', unit: 'g', kind: KIND.ceiling,
      eaten: gaps.sugar.eaten, target: targets.sugar, decimals: 1,
    },
    {
      /*
       * 饮水只数「主动喝了几次」，不记毫升。
       * 饮料、汤、粥、水果和饭菜里的水分同样被人体吸收，单算白水没法
       * 代表全天水分够不够 ——「125 / 1700 ml」那根条会被读成「今天只完成了 7%」。
       */
      key: 'water', label: '饮水', unit: ' 次', kind: KIND.log,
      eaten: Math.max(0, Math.round(Number(water) || 0)), target: 0,
    },
  ].map((m) => ({ ...m, state: metricState(m) }));
}
