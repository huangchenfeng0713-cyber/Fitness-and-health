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
  kind, eaten = 0, target = 0, lo = null, hi = null, unit = 'g', decimals = 0, roundUp = false,
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
  // 上限类指标向上取整：把已经吃进去的量说少了，比说多了糟糕得多
  const show = (v) => (roundUp ? Math.ceil(round(v, decimals + 2)) : round(v, decimals));
  const n = (v) => `${show(v)}${unit}`;

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
 * 碳水 / 脂肪的参考区间是拿脂肪 AMDR 反解出来的。
 *
 * 脂肪占总能量 20%~35%（IOM AMDR）。热量目标和蛋白定下来之后，
 * 剩给碳水和脂肪的那块热量（下面叫「这块热量」）是固定的，
 * 于是脂肪吃到 AMDR 上界时碳水占这块热量的比例最低，吃到下界时最高——
 * 两端都能被这一句话解释，不是随手划的。
 *
 * 它是**长期饮食结构的参考**，不是每天必须命中的靶子：区间本身就有二十个
 * 百分点宽，落在里面说明结构没跑偏，不落在里面也只是偏了，不是错了。
 */
export const FAT_AMDR = { lo: 0.20, hi: 0.35 };

/**
 * 吃到多少才谈得上「今天的结构」。
 *
 * 早饭一碗粥就判「偏碳水」，说的是那一顿，不是这一天。
 * 取计划里这块热量的四分之一，并且至少 300 kcal —— 纯工程取值。
 */
export const MIN_SPLIT_KCAL = 300;
export const MIN_SPLIT_SHARE = 0.25;

const clampPct = (v) => Math.max(0, Math.min(100, v));

/**
 * 碳水和脂肪合成一条：它们分的是同一块热量。
 *
 * 分开画成两条区间，最要命的是两条可以同时「在范围内」而总量对不上账：
 * 2660 kcal 的计划上实测有 796 kcal（30%）的自由度，两条各自说自己没问题。
 * 而且那时卡片会对着照计划吃的人写「碳水低于建议 74g」——热量明明已经吃满了。
 *
 * 合起来之后要回答的问题也变了，从「碳水够不够」变成「这块热量偏碳水还是偏脂肪」。
 * 比例按 4 / 9 kcal 每克算（就是界面上说的「按热量算」），
 * 不做纤维那 2 kcal 的细扣：那点差别不到 2%，写进去只会让人对不上手算的数。
 *
 * @returns {{carbG, fatG, kcal, carbPct, fatPct, bandLo, bandHi,
 *            structure, label, level, note}}
 *  - structure: none 还没吃 / low 吃得还不多 / balanced 在区间里 / carb / fat
 */
export function macroSplit(targets = {}, gaps = {}) {
  const pos = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const carbG = round(pos(gaps.carb?.eaten), 1);
  const fatG = round(pos(gaps.fat?.eaten), 1);
  const carbKcal = carbG * ATWATER.carb;
  const fatKcal = fatG * ATWATER.fat;
  const kcal = Math.round(carbKcal + fatKcal);

  const band = referenceBand(targets);
  const note = band ? `碳水参考 ${band.lo}–${band.hi}%` : '';
  const base = {
    carbG, fatG, kcal, bandLo: band?.lo ?? null, bandHi: band?.hi ?? null, note,
  };

  if (!(kcal > 0)) {
    return {
      ...base, carbPct: null, fatPct: null, structure: 'none', label: '还没有记录', level: LEVEL.plain,
    };
  }
  // 两个百分比必须凑成 100：各自四舍五入会印出「58% / 43%」
  const carbPct = Math.round((carbKcal / (carbKcal + fatKcal)) * 100);
  const fatPct = 100 - carbPct;

  // 吃得还不多的时候只报数，不下结论
  const planPool = poolKcal(targets);
  const enough = kcal >= Math.max(MIN_SPLIT_KCAL, planPool * MIN_SPLIT_SHARE);
  if (!enough || !band) {
    return {
      ...base,
      carbPct,
      fatPct,
      structure: 'low',
      label: band ? '吃得还不多，先不评价结构' : '结构比例',
      level: LEVEL.plain,
    };
  }

  const structure = carbPct < band.lo ? 'fat' : carbPct > band.hi ? 'carb' : 'balanced';
  return {
    ...base,
    carbPct,
    fatPct,
    structure,
    label: structure === 'balanced' ? '结构适中' : structure === 'carb' ? '偏碳水' : '偏脂肪',
    /*
     * 只有绿和灰，没有橙和红。三大营养素怎么分本来就有很宽的合理区间，
     * 把「今天多吃了米饭」画成警告色，是把偏好问题说成健康问题。
     */
    level: structure === 'balanced' ? LEVEL.met : LEVEL.plain,
  };
}

/** 计划里留给碳水和脂肪的那块热量 */
function poolKcal(targets) {
  const kcal = Number(targets.kcal);
  const protein = Number(targets.protein);
  if (!(kcal > 0)) return 0;
  const pool = kcal - (Number.isFinite(protein) ? Math.max(0, protein) : 0) * ATWATER.protein;
  return Math.max(0, pool);
}

/**
 * 碳水占「这块热量」的参考区间，两端由脂肪 AMDR 反解。
 * 蛋白吃得特别高时这块热量会很小，区间可能退化——退化了就不画，
 * 硬给一个 0–100% 的区间等于什么都没说。
 */
export function referenceBand(targets = {}) {
  const kcal = Number(targets.kcal);
  const pool = poolKcal(targets);
  if (!(kcal > 0) || !(pool > 0)) return null;
  // 脂肪吃到 AMDR 上界 → 碳水占比最低；吃到下界 → 最高
  const lo = clampPct(((pool - kcal * FAT_AMDR.hi) / pool) * 100);
  const hi = clampPct(((pool - kcal * FAT_AMDR.lo) / pool) * 100);
  // 取整只许放宽：四舍五入过的边界会把刚好照计划吃的人判到区间外
  const loFloor = Math.floor(lo);
  const hiCeil = Math.ceil(hi);
  if (hiCeil - loFloor < 5) return null;
  return { lo: loFloor, hi: hiCeil };
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
      /*
       * 游离糖跟纤维、钠、饮水并排在主卡的四个方框里，那一排必须是同一种精度。
       * 原先只有它带一位小数，四个格子里三个写 `0` 一个写 `0.0`。
       *
       * 取整用**向上**，不用四舍五入：这是个上限，18.4g 报成 18g 是把
       * 已经吃进去的糖说少了。宁可显示得比实际严一点，也不该反过来。
       */
      key: 'sugar', label: '游离糖', unit: 'g', kind: KIND.ceiling,
      eaten: gaps.sugar.eaten, target: targets.sugar, decimals: 0, roundUp: true,
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
  ].map((m) => ({
    ...m,
    state: metricState(m),
    /*
     * 显示值由这里给，视图别再各自 round 一遍。
     * 上限类（游离糖）向上取整 —— 把已经吃进去的量说少了比说多了糟糕；
     * 而视图那边只知道 decimals，算不出这件事。
     */
    display: m.roundUp
      ? String(Math.ceil(Math.round(Math.max(0, Number(m.eaten) || 0) * 100) / 100))
      : null,
  }));
}
