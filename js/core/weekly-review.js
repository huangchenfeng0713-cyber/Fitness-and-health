/**
 * 每周复盘：把这几周的体重、饮食、训练读成下周的一到三件事。
 *
 * 纯函数，不碰 DOM。输入都是别处已经算好的东西（体重拟合、饮食记录、训练组数、
 * 力量趋势），这里只做判断和措辞，不另起一套统计口径 —— 不做体重平滑，
 * 也不自动反推消耗；消耗校正只给建议，采不采用由人按一下决定。
 *
 * 为什么需要它：数据页原来只回答「在往哪走」，走得不对之后该怎么办，
 * 得自己把体重图、速览、健身页三处的数字拼起来想。增肌的人最常见的卡点
 * 恰恰是这一步 —— 体重不涨，到底是吃少了、计划偏低了，还是只是称得不够多。
 *
 * 每一条都是三段：标题说接下来做什么，basis 说凭什么，action 说具体怎么做。
 * 凭据不够就说还差什么（称重次数、记录天数），不硬给一个调整。
 */

import { dayOffset, shiftDay } from './day.js';
import { KCAL_PER_KG_FAT, TDEE_ADJUST_MAX } from './nutrition.js';
import { MIN_TRAINING_DAYS_FOR_GAP, setCountText, trainingDaysIn, weeklySetVolume } from './training.js';
import { trackedLifts } from './progression.js';
import { MIN_POINTS_FOR_CLAIM, planShift } from './trend-reading.js';
import { weightTrendStats } from './health-insights.js';
import { presentNumber } from './energy-observation.js';
import { withUnit } from './units.js';

/** 体重速度最多往回看 4 周，从最近一次改计划那天算起（护栏） */
export const REVIEW_WINDOW_DAYS = 28;
/** 计划改动后至少两周才判断：体重对热量变化的反应要一两周才稳定下来（惯例） */
export const REVIEW_MIN_DAYS = 14;
/** 和计划差不到 0.1 kg/周算一致 —— 与趋势图解读「基本一致」同一个数 */
export const RATE_TOLERANCE = 0.1;
/** 「按计划吃了」的容差：目标的 5%，至少 100 kcal（护栏，食物估算本身就有这么大的误差） */
export const INTAKE_TOLERANCE_RATIO = 0.05;
export const INTAKE_TOLERANCE_KCAL = 100;
/** 饮食记录至少覆盖窗口的一半、且不少于 7 天，才判断「吃没吃够」（护栏） */
export const MIN_LOGGED_RATIO = 0.5;
export const MIN_LOGGED_DAYS = 7;
/*
 * 一次校正最多 150 kcal，至少 100 kcal 才值得调（护栏）。
 * 按 7700 kcal/kg 反推出来的差是个上界：增肌期长的体重不全是脂肪，
 * 真实能量密度更低，照单全收会调过头。所以每次只走一小步，调完等两周再看。
 */
export const ADJUST_STEP_MAX = 150;
export const ADJUST_STEP_MIN = 100;
/** 最多给几条：再多就不是「下周做什么」，是一张待办清单 */
export const MAX_REVIEW_ITEMS = 3;

const round50 = (v) => Math.round(v / 50) * 50;
const signed = (v) => `${v > 0 ? '+' : ''}${v}`;
const kcal = (v) => withUnit(Math.round(v), 'kcal');

function rateLine(weight, target) {
  const weeks = Math.max(2, Math.round((weight.spanDays || 14) / 7));
  const se = weight.stdErrKgPerWeek != null ? ` ± ${weight.stdErrKgPerWeek}` : '';
  return `近 ${weeks} 周体重 ${signed(weight.kgPerWeek)}${se} kg/周，计划 ${signed(target)}`;
}

function liftsLine(lifts = []) {
  if (!lifts.length) return '';
  const words = lifts.map((l) => (l.trend.pct != null ? `${l.name} ${signed(l.trend.pct)}%`
    : `${l.name}${l.trend.direction === 'up' ? '在涨' : l.trend.direction === 'down' ? '在降' : '持平'}`));
  return `主项力量：${words.join('、')}`;
}

/*
 * 体重速度那一条。返回的是一条建议，或者一条「还差什么」的数据问题。
 *
 * 判断顺序是：计划刚改过就等 → 体重数据够不够 → 和计划差没差、差得出来吗 →
 * 饮食记全了吗 → 是吃得和目标不一样，还是按目标吃了却走偏（估算的消耗有偏差）。
 * 只有最后一种才动目标：吃少了就该先吃够，调目标只会让「没吃够」看起来更多。
 */
function rateItem(input) {
  const { plan, goal, change, today, windowDays, weight, intake, adjust = 0, lifts } = input;
  if (!plan) {
    return {
      key: 'plan', level: 'info', title: '先把身体信息填完整',
      basis: '现在算不出计划，也就没有可以对照的速度。',
      action: '在设置 → 身体信息里补全之后，这里会开始给建议。',
    };
  }
  if (change && dayOffset(today, change.at) < REVIEW_MIN_DAYS) {
    const days = dayOffset(today, change.at);
    const what = change.key === 'rate'
      ? `计划速度从 ${signed(change.from)} 改成 ${signed(change.to)} kg/周`
      : `目标从 ${kcal(change.from)} 改成 ${kcal(change.to)}`;
    return {
      key: 'wait', level: 'info', title: `照新目标再吃 ${REVIEW_MIN_DAYS - days} 天`,
      basis: `${days === 0 ? '今天' : `${days} 天前`}${what}，体重一般要两周左右才看得出反应。`,
      action: '这期间按新目标吃、称重照常；到时候这里会重新判断。',
    };
  }
  if (weight?.kgPerWeek == null) {
    return {
      key: 'weigh', level: 'info', title: '一周称 3–4 次体重',
      basis: `近 ${windowDays} 天只有 ${weight?.records || 0} 次称重，看不出体重在往哪走，也就判断不了计划吃得对不对。`,
      action: '早上起床、上完厕所、吃东西之前称，隔一天一次就够；至少 4 次、跨开一周就能给结论。',
    };
  }
  const target = Number(plan.rateKgPerWeek) || 0;
  const actual = weight.kgPerWeek;
  const se = Number(weight.stdErrKgPerWeek) || 0;
  const diff = Math.round((actual - target) * 100) / 100;
  const line = rateLine(weight, target);
  const lifted = liftsLine(lifts);
  if (Math.abs(diff) < RATE_TOLERANCE) {
    return {
      key: 'on-track', level: 'good', title: '照现在的节奏继续',
      basis: `${line}，基本一致${lifted ? `；${lifted}` : ''}。`,
      action: goal === 'bulk' ? '吃够、练够、睡够，下周再看。'
        : goal === 'cut' ? '按目标吃、训练重量尽量保持，下周再看。' : '照现在吃，下周再看。',
    };
  }
  if (Math.abs(diff) <= se) {
    return {
      key: 'unclear', level: 'info', title: '再称一两周再下结论',
      basis: `${line}，差 ${Math.abs(diff)} kg/周，但还在拟合误差之内。`,
      action: '照现在的计划吃，多称几次；精度够了这里会给出要不要调的建议。',
    };
  }
  // 体重比计划「少存了能量」：增肌涨得慢、减脂掉得快、维持在往下掉，都是这一边
  const short = diff < 0;
  const drift = goal === 'cut' ? (short ? '掉得比计划快' : '掉得比计划慢')
    : goal === 'bulk' ? (short ? '涨得比计划慢' : '涨得比计划快')
      : (short ? '在往下掉' : '在往上涨');
  const logged = Number(intake?.loggedDays) || 0;
  if (logged < Math.max(MIN_LOGGED_DAYS, Math.ceil(windowDays * MIN_LOGGED_RATIO)) || !(intake?.avgKcal > 0)) {
    return {
      key: 'log', level: 'info', title: '先把饮食记全两周',
      basis: `${line}，${drift}；可近 ${windowDays} 天只记了 ${logged} 天饮食，分不清是吃${short ? '少' : '多'}了，还是计划本身有偏差。`,
      action: '每天把吃的都记上，两周后这里就能判断要不要调目标。',
    };
  }
  const planKcal = Number(plan.kcal);
  const gap = intake.avgKcal - planKcal;
  const tol = Math.max(INTAKE_TOLERANCE_KCAL, planKcal * INTAKE_TOLERANCE_RATIO);
  const ate = `有记录的 ${logged} 天里日均 ${kcal(intake.avgKcal)}`;
  if (short && gap < -tol) {
    return {
      key: 'eat-more', level: goal === 'cut' ? 'warn' : 'info',
      title: goal === 'bulk' ? '先按目标吃够' : '别吃得比目标还少',
      basis: `${line}，${drift}；${ate}，比目标 ${kcal(planKcal)} 少 ${kcal(-gap)}。`,
      action: goal === 'bulk' ? '体重涨得慢主要是吃得不够：先按目标吃满两周，不用改计划。'
        : goal === 'cut' ? '减得太快更容易连肌肉一起掉：先按目标吃够，不用改计划。'
          : '先按目标吃够两周再看，不用改计划。',
    };
  }
  if (!short && gap > tol) {
    return {
      key: 'eat-less', level: 'info', title: '先按目标吃，别多吃',
      basis: `${line}，${drift}；${ate}，比目标 ${kcal(planKcal)} 多 ${kcal(gap)}。`,
      action: goal === 'bulk' ? '涨得太快时，多出来的更可能是脂肪：先回到目标吃两周，不用改计划。'
        : '先回到目标吃两周再看，不用改计划。',
    };
  }
  /*
   * 按目标吃了（或者吃得反而往另一边偏），体重却走偏：计划里估算的消耗和实际对不上。
   *   实际消耗 = 实际摄入 − 实际速度 × 7700/7；估算消耗 = 目标 − 计划速度 × 7700/7
   * 两者之差就是估算的偏差。7700 只是换算近似（docs/算法依据.md），所以只走一小步。
   */
  const error = gap + (target - actual) * (KCAL_PER_KG_FAT / 7);
  const size = Math.min(ADJUST_STEP_MAX, round50(Math.abs(error)));
  if (size < ADJUST_STEP_MIN) {
    return {
      key: 'on-track', level: 'good', title: '照现在的节奏继续',
      basis: `${line}；${ate}，和目标的差已经能解释这点偏离${lifted ? `；${lifted}` : ''}。`,
      action: '照现在吃，下周再看。',
    };
  }
  const step = Math.sign(error) * size;
  const cause = `${ate}，基本按目标 ${kcal(planKcal)} 吃了 —— 说明实际消耗比估算${step > 0 ? '高' : '低'}约 ${kcal(round50(Math.abs(error)))}`;
  if (step < 0 && (plan.clampedByFloor || input.fresh?.clampedByFloor)) {
    return {
      key: 'floor', level: 'info', title: '目标已经在下限，不再往下调',
      basis: `${line}，${drift}；${cause}。可目标已经是应用计划的下限。`,
      action: '想再快一点，可以增加日常活动量；也可以接受现在的速度。',
    };
  }
  /*
   * 采用之后目标要正好变 step 这么多。
   *
   * 存档案时计划按今天的数据从头算（`planIfSaved`），不是在旧计划上加减：
   * 旧计划存得早、设备基线后来变了的话，光存一次就可能差出几百 kcal ——
   * 实测「采用：每天多吃 150」存完目标反而少了 150。所以校正值要把这段差一起补上：
   *   新校正 = 旧校正 + (旧目标 + step − 照现在存下去的目标)
   * 于是新目标 = 旧目标 + step，而校正值说的就是「模型估的消耗比实际少多少」。
   */
  const fresh = Number.isFinite(Number(input.fresh?.kcal)) ? Number(input.fresh.kcal) : planKcal;
  const wanted = adjust + (planKcal + step - fresh);
  // 校正值不凑整：凑到 10 的话目标会差出几 kcal，「多吃 150」就不是正好 150 了
  const next = Math.round(Math.max(-TDEE_ADJUST_MAX, Math.min(TDEE_ADJUST_MAX, wanted)));
  const delta = Math.round(next - adjust + fresh - planKcal);
  if (Math.sign(delta) !== Math.sign(step) || Math.abs(delta) < ADJUST_STEP_MIN) {
    return {
      key: 'adjust-max', level: 'warn', title: '先核对记录和设备数据',
      basis: `${line}，${drift}；${cause}。可消耗校正已经累计到 ${signed(adjust)} kcal/天，再调就超出上限（±${TDEE_ADJUST_MAX}）。`,
      action: '差这么多，更可能是饮食漏记、称重条件不一致或设备的消耗数据有问题，先核对这几样。',
    };
  }
  return {
    key: 'adjust', level: 'info', title: `每天${delta > 0 ? '多' : '少'}吃 ${Math.abs(delta)} kcal`,
    basis: `${line}，${drift}；${cause}。`,
    action: `采用后目标从 ${kcal(planKcal)} 变成 ${kcal(planKcal + delta)}；调完至少等两周再看效果。`,
    apply: { kind: 'adjust', value: next, delta },
  };
}

function proteinItem({ goal, protein }) {
  if (!protein || !(protein.target > 0) || protein.days < MIN_POINTS_FOR_CLAIM) return null;
  if (protein.hit / protein.days >= 0.5) return null;
  return {
    key: 'protein', level: 'info', title: '每餐固定一份蛋白',
    basis: `近 7 天有记录的 ${protein.days} 天里，只有 ${protein.hit} 天吃够 ${withUnit(Math.round(protein.target), 'g')} 蛋白。`,
    action: `${goal === 'cut' ? '减脂期吃够蛋白有助于保住肌肉' : '蛋白吃够是练了能长的前提之一'}：早餐和加餐各加一份，比如一杯牛奶、两个鸡蛋或一盒希腊酸奶（各约 15–20g）。`,
  };
}

function volumeItem({ goal, training }) {
  const volume = training?.volume;
  if (!volume || (training.activeDays || 0) < MIN_TRAINING_DAYS_FOR_GAP) return null;
  const low = volume.groups.filter((g) => g.status === 'low').sort((a, b) => a.sets - b.sets);
  if (!low.length) return null;
  const shown = low.slice(0, 3);
  const { lo, hi } = volume.reference;
  return {
    key: 'volume', level: 'info', title: `给${shown.map((g) => g.label).join('、')}多安排几组`,
    basis: `近 7 日记录里${shown.map((g) => `${g.label} ${setCountText(g.sets)} 组`).join('、')}`
      + `${low.length > shown.length ? `，另有 ${low.length - shown.length} 个肌群也低于参考` : ''}（协同算半组）；`
      + `${goal === 'cut' ? `减脂期每个肌群每周至少保留约 ${lo} 组` : `增肌常用的参考是每个肌群每周 ${lo}–${hi} 组`}。`,
    action: '下周每个各加一个动作、3 组左右；健身页的推荐会把它们排在前面。',
    link: 'training',
  };
}

function strengthItem({ goal, training, plan, rate }) {
  const lifts = training?.lifts || [];
  if (lifts.length < 2) return null;
  const up = lifts.filter((l) => l.trend.direction === 'up');
  const down = lifts.filter((l) => l.trend.direction === 'down');
  const line = liftsLine(lifts);
  // 增肌：体重在涨（按计划或更快），力量却一个都没涨 —— 吃的跟上了，练的没跟上
  if (goal === 'bulk' && !up.length && ['on-track', 'eat-less'].includes(rate?.key)) {
    return {
      key: 'strength-flat', level: 'info', title: '力量没跟上体重',
      basis: `近 4 周${line}；体重在涨。`,
      action: '先看每个肌群的组数够不够、睡够没有；主项可以在健身页的「设置」里换一个次数区间。',
    };
  }
  /*
   * 减脂：一半以上的主项在降，缺口可能偏大。
   * 体重那一条已经在劝多吃（掉得比计划快）时不再说一遍 —— 同一个动作两条理由，
   * 读的人会以为要做两件事。
   */
  if (goal === 'cut' && down.length * 2 >= lifts.length
    && rate?.key !== 'eat-more' && !(rate?.apply?.delta > 0)) {
    const rate = Number(plan?.requestedRateKgPerWeek ?? plan?.rateKgPerWeek);
    const slower = Number.isFinite(rate) && rate < 0 ? Math.round((rate + 0.1) * 100) / 100 : null;
    return {
      key: 'strength-down', level: 'warn', title: '力量在往下掉',
      basis: `近 4 周${line}。`,
      action: slower != null && slower < 0
        ? `缺口可能偏大、恢复跟不上：可以把计划速度放慢到 ${slower} kg/周，训练重量尽量保持。`
        : '缺口可能偏大、恢复跟不上：训练重量尽量保持，留意睡眠。',
      apply: slower != null && slower < 0 ? { kind: 'rate', value: slower } : undefined,
    };
  }
  return null;
}

/**
 * @param {object} input
 *   today / endDate  'YYYY-MM-DD'；endDate 是统计截止（昨天）
 *   goal             'bulk' | 'cut' | 'maintain'
 *   plan             截止日生效的计划（status 为 ready 才用）
 *   change           最近 4 周里计划最后一次变化 { key: 'kcal'|'rate', from, to, at } 或 null
 *   windowDays       体重和饮食共用的窗口天数（从最近一次改计划那天算起，最多 28）
 *   weight           weightTrendStats 的结果
 *   intake           { loggedDays, avgKcal } —— 同一窗口
 *   protein          { days, hit, target } —— 近 7 天
 *   adjust           当前的消耗校正
 *   fresh            照现在的设置今天存下去的计划（store.planIfSaved），{ kcal, clampedByFloor }
 *   training         { activeDays, volume, lifts }
 * @returns {{ items: Array<{key, level, title, basis, action, apply?, link?}> }}
 */
export function weeklyReview(input = {}) {
  const plan = input.plan?.status === 'ready' ? input.plan : null;
  const goal = ['bulk', 'cut', 'maintain'].includes(input.goal) ? input.goal : 'maintain';
  const base = { ...input, plan, goal };
  /*
   * 主项力量有两个去处：单独成一条（力量没跟上 / 在往下掉），或者作为好消息
   * 挂在「照现在的节奏继续」后面。单独成条时就不在体重那条里再念一遍。
   */
  const bare = rateItem({ ...base, lifts: [] });
  const strength = strengthItem({ ...base, rate: bare });
  const rate = strength ? bare : rateItem({ ...base, lifts: input.training?.lifts || [] });
  const items = [rate, proteinItem(base), volumeItem(base), strength].filter(Boolean);
  return { items: items.slice(0, MAX_REVIEW_ITEMS) };
}

/**
 * 从原始记录拼出复盘的输入，再交给 weeklyReview。
 *
 * 窗口的规矩只在这里写一次：体重和饮食共用同一段（从最近一次改计划那天起，最多 4 周，
 * 止于昨天）—— 体重是吃出来的，两者必须是同一段日子，否则「按目标吃了却没涨」
 * 可能是拿上个月的饮食去解释这个月的体重。蛋白和训练看近 7 天（这一周做得怎么样）。
 * 饮食口径和「近 7 日速览」一致：有热量记录、且没被标成不完整的日子才算。
 *
 * @param {object} p
 *   planSteps  store.planStepsIn(档案, 窗口起点, 今天) —— 要一直看到今天：今天刚采用的
 *              调整也得算「刚改过」，否则同一条建议采用完还挂在那儿
 */
export function weeklyReviewFromRecords({
  today, endDate, goal, plan, fresh = null, planSteps = [], healthDays = [], dietDaily = [], trainingDays = [], adjust = 0,
} = {}) {
  const from = shiftDay(endDate, -(REVIEW_WINDOW_DAYS - 1));
  const kcalShift = planShift(planSteps, 'kcal');
  // 速率保留两位比：0.25 → 0.3 按一位小数看是同一个数
  const rateShift = planShift(planSteps, 'rateKgPerWeek', { decimals: 2, signed: true });
  const change = [kcalShift && { key: 'kcal', ...kcalShift }, rateShift && { key: 'rate', ...rateShift }]
    .filter(Boolean).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  const windowFrom = change && change.at > from ? change.at : from;
  const windowDays = Math.max(0, dayOffset(endDate, windowFrom) + 1);
  const logged = dietDaily.filter((d) => d?.date >= windowFrom && d.date <= endDate
    && presentNumber(d.kcal) && Number(d.kcal) >= 0 && d.coverage?.kcal?.complete !== false);
  const weekFrom = shiftDay(endDate, -6);
  const week = dietDaily.filter((d) => d?.date >= weekFrom && d.date <= endDate
    && presentNumber(d.protein) && Number(d.protein) >= 0 && d.coverage?.protein?.complete !== false);
  const proteinTarget = Number(plan?.protein) || 0;
  return weeklyReview({
    today, endDate, goal, plan, fresh, change, windowDays, adjust,
    weight: windowDays > 0 ? weightTrendStats(healthDays, windowDays, endDate) : null,
    intake: {
      loggedDays: logged.length,
      avgKcal: logged.length ? logged.reduce((sum, d) => sum + Number(d.kcal), 0) / logged.length : null,
    },
    protein: { days: week.length, hit: week.filter((d) => Number(d.protein) >= proteinTarget).length, target: proteinTarget },
    training: {
      activeDays: trainingDaysIn(trainingDays, endDate, 14),
      volume: weeklySetVolume(trainingDays, endDate, { goal }),
      lifts: trackedLifts(trainingDays, today),
    },
  });
}
