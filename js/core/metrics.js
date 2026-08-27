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

/** 指标性质 */
export const KIND = {
  /** 下限：够了就行，再多没有额外好处（蛋白、纤维） */
  floor: 'floor',
  /** 上限：别超（钠、游离糖） */
  ceiling: 'ceiling',
  /** 区间：落在里面就是照计划在走（热量、脂肪） */
  range: 'range',
  /** 余数：由其它项算出来的结果，本来就不是目标（碳水） */
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
}) {
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
      note: inside ? '在计划范围内'
        : eaten < low ? `低于计划 ${n(low - eaten)}`
          : `高于计划 ${n(eaten - high)}`,
      // 区间图上填到哪不重要，重要的是落点相对区间在哪儿
      fillPct: Math.min(100, Math.max(0, pctOf(eaten, high))),
      markerPct: rangePosition(eaten, low, high),
    };
  }

  throw new RangeError(`未知的指标性质：${kind}`);
}

/**
 * 落点在区间里的位置，映射到 0~100。
 *
 * 区间本身占中间的 20%~80%，两边各留 20% 画「低了 / 高了」——
 * 否则刚好卡在边界的点会贴着轴端，看不出是在里面还是外面。
 */
export function rangePosition(value, lo, hi) {
  if (!(hi > lo)) return 50;
  if (value <= lo) {
    const span = lo * 0.5 || 1;
    return Math.max(0, 20 - (Math.min(lo - value, span) / span) * 20);
  }
  if (value >= hi) {
    const span = hi * 0.5 || 1;
    return Math.min(100, 80 + (Math.min(value - hi, span) / span) * 20);
  }
  return 20 + ((value - lo) / (hi - lo)) * 60;
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
      key: 'carb', label: '碳水', unit: 'g', kind: KIND.remainder,
      eaten: gaps.carb.eaten, target: targets.carb,
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
      key: 'water', label: '饮水', unit: ' ml', kind: KIND.log,
      eaten: Number(water) || 0, target: targets.waterMl,
    },
  ].map((m) => ({ ...m, state: metricState(m) }));
}
