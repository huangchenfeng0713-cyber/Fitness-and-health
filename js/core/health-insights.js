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

/** 标准差，用来衡量作息是否规律 */
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/** 最小二乘斜率（单位/天） */
function slopePerDay(points) {
  if (points.length < 3) return null;
  const t0 = new Date(points[0].date).getTime();
  const xs = points.map((p) => (new Date(p.date).getTime() - t0) / 86400000);
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

const series = (days, key) => days
  .map((d) => ({ date: d.date, value: Number(d[key]) }))
  .filter((p) => Number.isFinite(p.value) && p.value > 0);

/**
 * 生成健康解读。
 * @param {Array} healthDays 每日 Apple 健康数据
 * @param {object} opts { targets, dietDaily, windowDays }
 * @returns {Array<{key,level,title,text,metric}>} level: good | info | warn | bad
 */
export function healthInsights(healthDays = [], opts = {}) {
  const { targets = null, dietDaily = [], windowDays = 14 } = opts;
  const days = healthDays.slice(-windowDays);
  const out = [];
  const add = (key, level, title, text, metric) => out.push({ key, level, title, text, metric });

  if (days.length < 2) {
    add('nodata', 'info', '数据还不够',
      '至少需要几天的数据才能看出规律。导入 Apple 健康的历史记录后，这里会给出针对你的解读。');
    return out;
  }

  // ---------------- 步数 ----------------
  const steps = series(days, 'steps');
  if (steps.length >= 3) {
    const m = round(avg(steps.map((p) => p.value)));
    const lowDays = steps.filter((p) => p.value < 4000).length;
    if (m < 5000) {
      add('steps', 'warn', `日均 ${m} 步，偏少`,
        '低于 5000 步属于久坐水平。不用一步到位冲一万，先把目标定在 7000 步——'
        + '这个量级对应的全因死亡风险下降已经接近平台期。通勤早下一站、午饭后走 15 分钟就能补上大半。',
        m);
    } else if (m < 7500) {
      add('steps', 'info', `日均 ${m} 步`,
        `已经脱离久坐区间。再往上加到 7000-8000 步，心血管获益还有明显提升空间；超过 10000 步之后收益增长就变缓了。`,
        m);
    } else {
      add('steps', 'good', `日均 ${m} 步，达标`,
        `维持在这个水平就很好。${lowDays > 0 ? `近 ${days.length} 天里有 ${lowDays} 天不足 4000 步，注意别出现连续几天的断档。` : '而且没有明显的断档。'}`,
        m);
    }
  }

  // ---------------- 运动强度 ----------------
  const exercise = series(days, 'exerciseMinutes');
  if (exercise.length >= 3) {
    const weekly = round((avg(exercise.map((p) => p.value)) || 0) * 7);
    const activeDays = exercise.filter((p) => p.value >= 20).length;
    if (weekly < 150) {
      add('exercise', 'warn', `每周锻炼约 ${weekly} 分钟，不足`,
        `WHO 建议成人每周至少 150 分钟中等强度活动，还差 ${round(150 - weekly)} 分钟。`
        + `拆成每周 5 次、每次 30 分钟最容易坚持。另外每周两次力量训练能显著减缓年龄相关的肌肉流失。`,
        weekly);
    } else {
      add('exercise', 'good', `每周锻炼约 ${weekly} 分钟，达标`,
        `已达到 WHO 的 150 分钟建议，近 ${days.length} 天有 ${activeDays} 天进行了 20 分钟以上的活动。`
        + `如果还没有做力量训练，加入每周两次会让减脂期的肌肉保留明显更好。`,
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
        `成人建议 7-9 小时。长期睡不够会升高饥饿素、压低瘦素，直接表现为白天更想吃高糖高脂的东西——`
        + `减脂期这一项常常比少吃几百千卡更关键。`,
        m);
    } else if (m < 7) {
      add('sleep', 'warn', `日均睡眠 ${m} 小时，略少`,
        `离 7 小时还差一点，近 ${days.length} 天有 ${shortDays} 天不足 6.5 小时。提前 30 分钟上床通常比周末补觉有效。`,
        m);
    } else {
      add('sleep', 'good', `日均睡眠 ${m} 小时`,
        `落在建议区间内。${sd > 1.2 ? `不过波动较大（标准差 ${sd} 小时），作息不规律同样会影响食欲激素，尽量固定起床时间。` : '而且比较规律，继续保持。'}`,
        m);
    }
    if (sd > 1.5 && m >= 7) {
      add('sleep_var', 'info', `睡眠时长波动较大（±${sd} 小时）`,
        '固定起床时间比固定入睡时间更容易做到，也更能稳住生物钟。');
    }
  }

  // ---------------- 静息心率 ----------------
  const rhr = series(days, 'restingHR');
  if (rhr.length >= 5) {
    const m = round(avg(rhr.map((p) => p.value)));
    const slope = slopePerDay(rhr);
    const weekly = slope != null ? round(slope * 7, 1) : null;
    if (m > 80) {
      add('rhr', 'warn', `静息心率 ${m} bpm，偏高`,
        '成人静息心率通常在 60-100，但长期高于 80 与心血管风险上升相关。'
        + '规律有氧运动是最有效的降低手段；若同时伴有心悸、乏力，建议就医评估。', m);
    } else if (weekly != null && weekly >= 1.5) {
      add('rhr', 'warn', `静息心率近期上升（+${weekly} bpm/周）`,
        '持续上升常见于训练过量、睡眠不足、压力大或正在感冒。先检查这几项，必要时安排一两天完全休息。', m);
    } else {
      add('rhr', 'good', `静息心率 ${m} bpm`,
        `处在健康区间${weekly != null && weekly <= -0.5 ? '，并且在下降——通常说明有氧能力在改善' : ''}。`, m);
    }
  }

  // ---------------- 体重与体成分 ----------------
  const weight = series(days, 'weightKg');
  if (weight.length >= 4) {
    const slope = slopePerDay(weight);
    const perWeek = slope != null ? round(slope * 7, 2) : null;
    const latest = weight[weight.length - 1].value;
    const goalRate = targets?.rateKgPerWeek ?? 0;
    const pctPerWeek = perWeek != null && latest > 0 ? Math.abs(perWeek / latest) * 100 : null;

    if (perWeek != null) {
      if (pctPerWeek != null && pctPerWeek > 1) {
        add('weight', 'warn', `体重变化 ${perWeek > 0 ? '+' : ''}${perWeek} kg/周，速度偏快`,
          `相当于每周 ${round(pctPerWeek, 1)}% 体重。超过 1%/周时，掉的往往不只是脂肪——`
          + `肌肉和水分占比会明显上升，代谢也更容易下调。把热量缺口收小一些更划算。`, perWeek);
      } else if (goalRate !== 0 && Math.sign(perWeek) !== Math.sign(goalRate) && Math.abs(perWeek) > 0.15) {
        const adjust = round(((perWeek - goalRate) * 7700) / 7) * -1;
        add('weight', 'warn', `体重趋势与目标相反（${perWeek > 0 ? '+' : ''}${perWeek} kg/周）`,
          `目标是 ${goalRate > 0 ? '+' : ''}${goalRate} kg/周。说明真实消耗与估算有偏差，`
          + `建议把每日热量目标调整约 ${adjust > 0 ? '+' : ''}${adjust} kcal，再观察两周。`, perWeek);
      } else {
        add('weight', 'good', `体重趋势 ${perWeek > 0 ? '+' : ''}${perWeek} kg/周`,
          `与目标（${goalRate > 0 ? '+' : ''}${goalRate} kg/周）基本一致。体重每天上下 1kg 是水分波动，看趋势线不要看单日数字。`, perWeek);
      }
    }

    const daily = weight.map((p) => p.value);
    const swing = round(Math.max(...daily) - Math.min(...daily), 1);
    if (swing > 2.5) {
      add('weight_swing', 'info', `近期体重波动 ${swing} kg`,
        '短期大幅波动通常是水钠潴留（重口味、高碳水、月经周期、力量训练后炎症反应），不是真的胖了或瘦了。');
    }
  }

  const bodyFat = series(days, 'bodyFatPct');
  if (bodyFat.length >= 4) {
    const slope = slopePerDay(bodyFat);
    const perWeek = slope != null ? round(slope * 7, 2) : null;
    const latest = round(bodyFat[bodyFat.length - 1].value, 1);
    if (perWeek != null && Math.abs(perWeek) >= 0.1) {
      add('bodyfat', perWeek < 0 ? 'good' : 'info',
        `体脂率 ${latest}%，${perWeek < 0 ? '在下降' : '在上升'}（${perWeek > 0 ? '+' : ''}${perWeek} %/周）`,
        perWeek < 0
          ? '体重和体脂同时下降，说明减的主要是脂肪，方向是对的。'
          : '若体重没怎么变而体脂上升，通常意味着肌肉在流失——检查蛋白质是否吃够、有没有力量训练。',
        latest);
    }
  }

  // ---------------- 消耗与摄入的匹配 ----------------
  const active = series(days, 'activeEnergy');
  if (active.length >= 3 && targets?.kcal > 0) {
    const m = round(avg(active.map((p) => p.value)));
    const sd = round(stdev(active.map((p) => p.value)) || 0);
    if (sd > m * 0.55) {
      add('energy_var', 'info', `每天活动消耗差异很大（平均 ${m}，波动 ±${sd} kcal）`,
        '训练日和休息日的消耗差出几百千卡时，用固定热量目标就会一天吃不够、一天吃超。'
        + '本应用已按当天真实消耗动态调整预算，记得每天同步健康数据。', m);
    }
  }

  // ---------------- 数据完整度 ----------------
  const covered = days.filter((d) => Object.keys(d).some((k) => !['date', 'source'].includes(k))).length;
  const dietCovered = dietDaily.filter((d) => days.some((h) => h.date === d.date)).length;
  if (dietCovered < covered * 0.5) {
    add('logging', 'warn', `近 ${days.length} 天只有 ${dietCovered} 天记了饮食`,
      '健康数据是自动同步的，饮食得手动记。两边都齐了，热量收支才算得准——'
      + '否则趋势图只能看出消耗，看不出为什么没瘦。');
  }

  return out;
}

/** 汇总卡片用的关键指标 */
export function healthSummary(healthDays = [], windowDays = 14) {
  const days = healthDays.slice(-windowDays);
  const pick = (key) => {
    const vals = series(days, key).map((p) => p.value);
    return vals.length ? round(avg(vals), key === 'weightKg' || key === 'bodyFatPct' ? 1 : 0) : null;
  };
  return {
    days: days.length,
    steps: pick('steps'),
    activeEnergy: pick('activeEnergy'),
    exerciseMinutes: pick('exerciseMinutes'),
    sleepHours: (() => {
      const v = pick('sleepMinutes');
      return v != null ? round(v / 60, 1) : null;
    })(),
    restingHR: pick('restingHR'),
    weightKg: pick('weightKg'),
    bodyFatPct: pick('bodyFatPct'),
  };
}
