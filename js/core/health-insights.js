/**
 * 健康数据解读
 *
 * 把 Apple 健康同步来的原始数字（步数、活动能量、睡眠、静息心率、体重、体脂）
 * 翻译成「这意味着什么、该怎么做」。纯函数模块，可在 Node 中单测。
 *
 * 判断依据主要来自 WHO《身体活动和久坐行为指南》、
 * 美国睡眠医学会（AASM）成人睡眠时长共识，以及《中国居民膳食指南》。
 */

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

const DAY_MS = 86400000;
const WEIGHT_RATE_TOLERANCE = 0.15;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const hasHealthMeasurement = (day) => Object.entries(day).some(([key, value]) => (
  !['date', 'source'].includes(key) && Number.isFinite(Number(value))
));

/** 只接受真实存在的 YYYY-MM-DD，避免 Date 对无效日期的宽松纠正。 */
function validDayKey(value) {
  const key = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const ms = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === key ? key : null;
}

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((v, i) => (i === 0 ? String(v) : String(v).padStart(2, '0')))
    .join('-');
}

const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / DAY_MS;

const calendarSpan = (points) => {
  if (!points.length) return 0;
  return dayNumber(points[points.length - 1].date) - dayNumber(points[0].date) + 1;
};

/**
 * 清理并按日历窗口取数：同日记录合并、日期排序、排除未来数据。
 * 未指定截止日期时，以不晚于今天的最新记录日为窗口终点，便于查看历史导入。
 */
function windowedDays(healthDays, windowDays = 14, asOfDate = null) {
  const byDate = new Map();
  for (const raw of healthDays || []) {
    const date = validDayKey(raw?.date);
    if (!date) continue;
    byDate.set(date, { ...(byDate.get(date) || {}), ...raw, date });
  }

  const hardLimit = todayKey();
  const available = [...byDate.values()]
    .filter((d) => d.date <= hardLimit && hasHealthMeasurement(d))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!available.length) return [];

  const requested = validDayKey(asOfDate);
  const cutoff = requested
    ? (requested < hardLimit ? requested : hardLimit)
    : available[available.length - 1].date;
  const n = Math.max(1, Math.floor(Number(windowDays) || 14));
  const start = dayNumber(cutoff) - n + 1;
  return available.filter((d) => d.date <= cutoff && dayNumber(d.date) >= start);
}

/** 标准差，只用来衡量睡眠时长波动，不能代表入睡/起床时间是否规律。 */
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/** 最小二乘斜率（单位/天） */
function slopePerDay(points) {
  if (points.length < 3) return null;
  const t0 = dayNumber(points[0].date);
  const xs = points.map((p) => dayNumber(p.date) - t0);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}

const ZERO_IS_MEASUREMENT = new Set(['steps', 'activeEnergy']);

const series = (days, key) => days
  .map((d) => ({ date: d.date, raw: d[key], value: Number(d[key]) }))
  .filter((p) => p.raw != null && String(p.raw).trim() !== '' && Number.isFinite(p.value)
    && (ZERO_IS_MEASUREMENT.has(key) ? p.value >= 0 : p.value > 0))
  .map(({ date, value }) => ({ date, value }))
  .sort((a, b) => a.date.localeCompare(b.date));

function weightTrendStatsFromDays(days) {
  const points = series(days, 'weightKg');
  const spanDays = calendarSpan(points);
  const elapsedDays = Math.max(0, spanDays - 1);
  // 四次连续称重挤在三四天里，换算成“每周变化”会把水分波动放大。
  // 因此点数与首末间隔必须同时满足，所有页面共用这一条门槛。
  const slope = points.length >= 4 && elapsedDays >= 7 ? slopePerDay(points) : null;
  return {
    records: points.length,
    spanDays,
    elapsedDays,
    kgPerWeek: slope != null ? round(slope * 7, 2) : null,
  };
}

/** 趋势页和健康解读共用的体重拟合口径。 */
export function weightTrendStats(healthDays = [], windowDays = 30, asOfDate = null) {
  return weightTrendStatsFromDays(windowedDays(healthDays, windowDays, asOfDate));
}

/**
 * 生成健康解读。
 * @param {Array} healthDays 每日 Apple 健康数据
 * @param {object} opts { targets, dietDaily, windowDays, asOfDate/endDate }
 * @returns {Array<{key,level,title,text,metric}>} level: good | info | warn | bad
 */
export function healthInsights(healthDays = [], opts = {}) {
  const {
    targets = null, dietDaily = [], windowDays = 14, asOfDate = null, endDate = null,
  } = opts;
  const days = windowedDays(healthDays, windowDays, asOfDate || endDate);
  const out = [];
  const add = (key, level, title, text, metric) => out.push({ key, level, title, text, metric });

  if (days.length < 2) {
    add('nodata', 'info', '数据还不够',
      '至少需要几天的数据才能看出规律。导入 Apple 健康的历史记录后，这里会给出针对你的解读。');
    return out;
  }

  const steps = series(days, 'steps');
  const active = series(days, 'activeEnergy');

  // ---------------- 步数 ----------------
  if (steps.length >= 3) {
    const m = round(avg(steps.map((p) => p.value)));
    const lowDays = steps.filter((p) => p.value < 4000).length;
    if (m < 5000) {
      add('steps', 'warn', `日均 ${m} 步，偏少`,
        '这提示日常步行量可能偏低，但步数不能单独代表久坐时间、运动强度或健康风险。'
        + '可以先在当前基础上逐步增加，例如通勤多走一段、午饭后步行 15 分钟；不必一次冲到一万步。',
        m);
    } else if (m < 7500) {
      add('steps', 'info', `日均 ${m} 步`,
        '处在本应用的中间参考区间。若身体状况允许，可以循序增加到约 7000-8000 步；'
        + '同时仍要结合运动强度和连续久坐时间判断，不能只看步数。',
        m);
    } else {
      add('steps', 'good', `日均 ${m} 步，达标`,
        `达到本应用的步数参考区间。${lowDays > 0 ? `近 ${days.length} 个有记录日里有 ${lowDays} 天不足 4000 步，可以留意是否连续偏低。` : '记录期内没有明显的低步数日。'}`
        + '步数仍不能替代对中高强度运动和久坐时间的评估。',
        m);
    }
  }

  // ---------------- 运动强度 ----------------
  const daySpan = calendarSpan(days);
  const exerciseDays = days.filter((d) => hasOwn(d, 'exerciseMinutes')
    && Number.isFinite(Number(d.exerciseMinutes)) && Number(d.exerciseMinutes) >= 0);
  const exerciseCoverage = daySpan > 0 ? exerciseDays.length / daySpan : 0;
  // 只有字段明确存在的 0 才是零运动；同一天有步数或体重但缺 exerciseMinutes，
  // 仍然属于该指标缺测，不能自动补 0。
  if (daySpan >= 7 && exerciseCoverage >= 0.7) {
    const exerciseValues = exerciseDays.map((d) => Number(d.exerciseMinutes));
    const weekly = round((exerciseValues.reduce((sum, v) => sum + v, 0) / daySpan) * 7);
    const activeDays = exerciseValues.filter((v) => v >= 20).length;
    if (weekly < 150) {
      add('exercise', 'warn', `每周锻炼约 ${weekly} 分钟，不足`,
        `WHO 建议成人每周至少 150 分钟中等强度活动，还差 ${round(150 - weekly)} 分钟。`
        + `这是按 ${daySpan} 个日历日折算的结果（${days.length} 天有健康记录，明确的零运动日计为 0）。`
        + '可以拆成每周 5 次、每次约 30 分钟；另外每周安排两次肌力训练。',
        weekly);
    } else {
      add('exercise', 'good', `每周锻炼约 ${weekly} 分钟，达标`,
        `按 ${daySpan} 个日历日折算，达到 WHO 的每周 150 分钟建议；${days.length} 天有健康记录，其中 ${activeDays} 天记录了至少 20 分钟活动。`
        + '若尚未安排肌力训练，可以逐步加入每周两次。',
        weekly);
    }
  }

  // ---------------- 睡眠 ----------------
  const sleep = series(days, 'sleepMinutes');
  if (sleep.length >= 3) {
    const hours = sleep.map((p) => p.value / 60);
    const m = round(avg(hours), 1);
    const sd = round(stdev(hours) || 0, 1);
    const shortDays = hours.filter((v) => v < 6.5).length;
    if (m < 6.5) {
      add('sleep', 'bad', `日均睡眠 ${m} 小时，明显不足`,
        '成人通常建议每晚睡够 7 小时。长期睡眠不足可能影响食欲调节、注意力和恢复；'
        + '先尝试把睡眠机会逐步增加，并结合白天状态观察。',
        m);
    } else if (m < 7) {
      add('sleep', 'warn', `日均睡眠 ${m} 小时，略少`,
        `离 7 小时还差一点，近 ${days.length} 天有 ${shortDays} 天不足 6.5 小时。可以先把每晚睡眠机会稳定增加约 30 分钟，并结合白天状态观察。`,
        m);
    } else {
      add('sleep', 'good', `日均睡眠 ${m} 小时`,
        `落在建议区间内。${sd > 1.2 ? `不过睡眠时长波动较大（标准差 ${sd} 小时）；这不能直接说明入睡和起床时间是否规律。` : '睡眠时长波动较小，继续保持。'}`,
        m);
    }
    if (sd > 1.5 && m >= 7) {
      add('sleep_var', 'info', `睡眠时长波动较大（±${sd} 小时）`,
        '这只反映每晚睡眠时长差异，不能代表入睡或起床时间的规律性。可以先检查短睡日出现在哪些情境。');
    }
  }

  // ---------------- 静息心率 ----------------
  const rhr = series(days, 'restingHR');
  if (rhr.length >= 5) {
    const m = round(avg(rhr.map((p) => p.value)));
    // 不把四五天的短波动硬外推成“每周变化”；至少要真正跨过一周。
    const slope = calendarSpan(rhr) - 1 >= 7 ? slopePerDay(rhr) : null;
    const weekly = slope != null ? round(slope * 7, 1) : null;
    if (m > 80) {
      add('rhr', 'warn', `静息心率 ${m} bpm，偏高`,
        '成人静息心率常见参考范围约为 60-100 bpm，但年龄、体能、药物和测量条件都会影响读数，单凭平均值不能判断疾病。'
        + '如果持续高于个人平时水平，或伴有心悸、胸闷、乏力等不适，建议就医评估。', m);
    } else if (weekly != null && weekly >= 1.5) {
      add('rhr', 'warn', `静息心率近期上升（+${weekly} bpm/周）`,
        '这种变化可能与训练负荷、睡眠、压力、感染或测量条件变化有关，不能只凭趋势确定原因。'
        + '先复核同一时段的连续测量；若持续上升或伴有不适，再咨询医生。', m);
    } else {
      add('rhr', 'good', `静息心率 ${m} bpm`,
        `处在成人常见参考范围${weekly != null && weekly <= -0.5 ? '，近期读数下降可能与体能或测量条件变化有关' : ''}；仍应结合个人基线和症状看待。`, m);
    }
  }

  // ---------------- 体重与体成分 ----------------
  const weight = series(days, 'weightKg');
  const weightStats = weightTrendStatsFromDays(days);
  let weightPerWeek = null;
  let weightSpan = 0;
  if (weightStats.kgPerWeek != null) {
    weightPerWeek = weightStats.kgPerWeek;
    const perWeek = weightStats.kgPerWeek;
    weightSpan = weightStats.spanDays;
    const latest = weight[weight.length - 1].value;
    const rawGoal = targets?.rateKgPerWeek;
    const parsedGoal = Number(rawGoal);
    const hasGoalRate = rawGoal !== null && rawGoal !== '' && Number.isFinite(parsedGoal);
    const goalRate = hasGoalRate ? parsedGoal : null;
    const rateGap = hasGoalRate && weightPerWeek != null ? weightPerWeek - goalRate : null;
    const pctPerWeek = perWeek != null && latest > 0 ? Math.abs(perWeek / latest) * 100 : null;

    if (perWeek != null) {
      if (pctPerWeek != null && pctPerWeek > 1) {
        add('weight', 'warn', `体重变化 ${perWeek > 0 ? '+' : ''}${perWeek} kg/周，速度偏快`,
          `相当于每周 ${round(pctPerWeek, 1)}% 体重。${perWeek < 0
            ? '减重过快时，变化往往不只来自脂肪，肌肉和水分也可能占较大比例；建议收小热量缺口。'
            : '增重过快时也可能混有水分变化；建议复核目标、饮食记录和连续几周趋势。'}`, perWeek);
      } else if (rateGap != null && Math.abs(rateGap) > WEIGHT_RATE_TOLERANCE) {
        const enoughForAdjustment = weightSpan >= 28 && weight.length >= 8;
        const direction = Math.sign(perWeek) !== Math.sign(goalRate) && Math.abs(goalRate) > 0
          ? '与目标方向不同' : '偏离目标';
        let advice = `实际趋势与目标相差 ${round(Math.abs(rateGap), 2)} kg/周，超过 ${WEIGHT_RATE_TOLERANCE} kg/周的观察容差。`;
        if (enoughForAdjustment) {
          const adjust = clamp(round((-rateGap * 7700) / 7), -250, 250);
          advice += `基于 ${weightSpan} 个日历日的趋势，可先把每日热量目标调整约 ${adjust > 0 ? '+' : ''}${adjust} kcal（单次最多 ±250 kcal），再观察至少两周。`;
        } else {
          advice += `目前只有 ${weightSpan} 个日历日的跨度，先保持方案；至少积累 28 天且有足够称重记录后，再考虑调整热量。`;
        }
        add('weight', 'warn', `体重趋势${direction}（${perWeek > 0 ? '+' : ''}${perWeek} kg/周）`,
          `目标是 ${goalRate > 0 ? '+' : ''}${goalRate} kg/周。${advice}`, perWeek);
      } else if (hasGoalRate) {
        add('weight', 'good', `体重趋势 ${perWeek > 0 ? '+' : ''}${perWeek} kg/周`,
          `与目标（${goalRate > 0 ? '+' : ''}${goalRate} kg/周）的差值在 ±${WEIGHT_RATE_TOLERANCE} kg/周观察容差内。体重单日变化常受水分影响，应继续看多周趋势。`, perWeek);
      } else {
        add('weight', 'info', `体重趋势 ${perWeek > 0 ? '+' : ''}${perWeek} kg/周`,
          '尚未提供目标变化速度，因此只展示趋势，不判断是否达标。体重单日变化常受水分影响，应继续看多周趋势。', perWeek);
      }
    }

    const daily = weight.map((p) => p.value);
    const swing = round(Math.max(...daily) - Math.min(...daily), 1);
    if (swing > 2.5) {
      add('weight_swing', 'info', `近期体重波动 ${swing} kg`,
        '短期大幅波动可能主要来自水分与糖原变化（如重口味、高碳水、月经周期或训练后反应），不能仅凭这些单点判断脂肪增减。');
    }
  }

  const bodyFat = series(days, 'bodyFatPct');
  if (bodyFat.length >= 4 && calendarSpan(bodyFat) - 1 >= 7) {
    const slope = slopePerDay(bodyFat);
    const perWeek = slope != null ? round(slope * 7, 2) : null;
    const latest = round(bodyFat[bodyFat.length - 1].value, 1);
    if (perWeek != null && Math.abs(perWeek) >= 0.1) {
      let interpretation;
      if (weightPerWeek == null) {
        interpretation = '同一窗口缺少足够的体重趋势，不能判断体成分是否真的发生了变化。';
      } else if (perWeek < 0 && weightPerWeek < -WEIGHT_RATE_TOLERANCE) {
        interpretation = '体重趋势和体脂读数同时下降，与减脂方向一致，但不能据此断定减少的主要是脂肪。';
      } else if (perWeek > 0 && weightPerWeek > WEIGHT_RATE_TOLERANCE) {
        interpretation = '体重趋势和体脂读数同时上升，需要继续观察，但不能仅凭这组读数断定脂肪增加。';
      } else if (Math.abs(weightPerWeek) <= WEIGHT_RATE_TOLERANCE) {
        interpretation = '体重趋势基本稳定，单独的体脂读数变化不足以判断脂肪或肌肉变化。';
      } else {
        interpretation = '体重趋势与体脂读数方向不一致，更应先排查水分状态和测量条件，不能据此判断肌肉流失或脂肪变化。';
      }
      add('bodyfat', 'info',
        `体脂率 ${latest}%，${perWeek < 0 ? '在下降' : '在上升'}（${perWeek > 0 ? '+' : ''}${perWeek} %/周）`,
        `${interpretation}家用 BIA 体脂秤会受饮水、进食、运动和测量时段影响，尽量在相近条件下测量并看长期趋势。`,
        latest);
    }
  }

  // ---------------- 消耗与摄入的匹配 ----------------
  if (active.length >= 3 && targets?.kcal > 0) {
    const m = round(avg(active.map((p) => p.value)));
    const sd = round(stdev(active.map((p) => p.value)) || 0);
    if (sd > m * 0.55) {
      add('energy_var', 'info', `每天活动消耗差异很大（平均 ${m}，波动 ±${sd} kcal）`,
        '训练日和休息日的消耗差出几百千卡时，用固定热量目标就会一天吃不够、一天吃超。'
        + '本应用会按当天设备记录估算预算；记得同步健康数据，并留意首页的“数据截至”时间。', m);
    }
  }

  // ---------------- 数据可信度 ----------------
  // 早期版本把 Apple 导出的 unit="Cal"（千卡）当成小卡除以了 1000，
  // 已经导进来的历史数据会小得离谱。这里识别出来并告诉用户重导一次。
  const stepsAvgForCheck = steps.length ? avg(steps.map((p) => p.value)) : null;
  if (active.length >= 3) {
    const activeAvg = avg(active.map((p) => p.value));
    if (activeAvg < 20 && stepsAvgForCheck > 2000) {
      add('suspect_energy', 'bad', '活动能量数据异常偏低',
        `日均步数有 ${round(stepsAvgForCheck)} 步，活动能量却只有 ${round(activeAvg, 1)} kcal，量级明显不对。`
        + '这是早期版本的单位换算缺陷（把 Apple 导出的 Cal 当成了小卡）。'
        + '到本页重新导入一次健康数据即可修正，热量预算也会跟着回到正确水平。');
    }
  }

  // ---------------- 数据完整度 ----------------
  const covered = days.filter((d) => Object.keys(d).some((k) => !['date', 'source'].includes(k))).length;
  const n = Math.max(1, Math.floor(Number(windowDays) || 14));
  const requestedCutoff = validDayKey(asOfDate || endDate);
  const hardLimit = todayKey();
  const cutoff = requestedCutoff
    ? (requestedCutoff < hardLimit ? requestedCutoff : hardLimit)
    : days.at(-1)?.date || hardLimit;
  const start = dayNumber(cutoff) - n + 1;
  const dietDates = new Set((dietDaily || [])
    .map((d) => validDayKey(d?.date))
    .filter((date) => date && date <= cutoff && dayNumber(date) >= start));
  const healthDates = new Set(days.map((d) => d.date));
  const pairedDays = [...dietDates].filter((date) => healthDates.has(date)).length;
  if (covered > 0 && pairedDays < covered * 0.5) {
    add('logging', 'warn', `近 ${n} 天饮食仅记录 ${dietDates.size} 天`,
      `同期健康数据覆盖 ${covered} 天，两类数据在同一天齐全 ${pairedDays} 天。`
      + '热量收支只有在同日摄入与消耗都存在时才有意义；没有记录的日子不会被当成零摄入。');
  }

  return out;
}

/** 汇总卡片用的关键指标；asOfDate 可用于查看某个历史截止日。 */
export function healthSummary(healthDays = [], windowDays = 14, asOfDate = null) {
  const days = windowedDays(healthDays, windowDays, asOfDate);
  const pick = (key) => {
    const vals = series(days, key).map((p) => p.value);
    return vals.length ? round(avg(vals), key === 'weightKg' || key === 'bodyFatPct' ? 1 : 0) : null;
  };
  return {
    days: days.length,
    steps: pick('steps'),
    activeEnergy: pick('activeEnergy'),
    exerciseMinutes: (() => {
      const span = calendarSpan(days);
      const measured = days.filter((d) => hasOwn(d, 'exerciseMinutes')
        && Number.isFinite(Number(d.exerciseMinutes)) && Number(d.exerciseMinutes) >= 0);
      if (span <= 0 || measured.length / span < 0.7) return null;
      const total = measured.reduce((sum, d) => sum + Number(d.exerciseMinutes), 0);
      return round(total / span);
    })(),
    sleepHours: (() => {
      /*
       * 从原始分钟数直接换算，不能拿 pick 的结果再除 60。
       * pick 会先把分钟四舍五入成整数，再除 60 又round 一次，两次取整能差出 0.1 小时——
       * 概览写 6.8 小时、下面的解读写 6.7 小时，同一页两个数对不上。
       */
      const vals = series(days, 'sleepMinutes').map((p) => p.value);
      return vals.length ? round(avg(vals) / 60, 1) : null;
    })(),
    restingHR: pick('restingHR'),
    weightKg: pick('weightKg'),
    bodyFatPct: pick('bodyFatPct'),
  };
}
