/**
 * 今日热量环。
 *
 * **整圈 = 今天计划吃多少**（今日摄入目标，取整到百）。12 点就是吃满计划。
 * 绿弧是已经吃了的，绿弧到 12 点那段灰是还能吃的。
 * 黄弧是已经烧掉的，画在自己那条轨道上，只作对照。
 *
 * 摄入和消耗**是两条轨道**，用同一把尺子换算角度，但互不覆盖：
 * 消耗跑得再远也碰不到绿弧。上午烧的比吃的多是常态，不是错误，
 * 所以不因此放大尺子，也不把绿弧扫成灰。
 *
 * 每条轨道各自跑圈：第一圈浅色，越过 12 点进第二圈换深色盖在浅色上。
 * 深色退回去会露出下面的浅色；**浅色永远不会被擦回灰轨**。
 *
 * 尺子每天开始算一次，当天内不变 —— 加一餐、同步消耗都不许让弧跳。
 * 只有计划本身变了（改体重 / 目标 / 速率，或导入历史把近期基线挪了）
 * 才从改的那一天起换一把新尺子，改回去同理。
 */

/*
 * 键里带 v2：v1 存的圆周是按「预计日消耗」算的，和现在这把「摄入目标」
 * 不是一个含义。沿用旧键会让升级当天的环还按旧尺子画，12 点就不等于吃满计划。
 */
const SCALE_KEY = 'health-diet-ring-scale-v2';
/** 差这么点以内就说「接近目标」，不报数 —— 几十千卡的估算误差不值得算成缺口 */
const BALANCE_WITHIN = 40;

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** 圆周 = 今日摄入目标取整到百。没有目标时给一个中性的兜底，不让圆周变成 0。 */
export function trackScale(target) {
  const raw = n(target);
  const base = raw != null && raw > 0 ? raw : 2000;
  return Math.max(100, Math.round(base / 100) * 100);
}

function memoryStore() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function toScaleMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue;
    if (Number.isFinite(v.scale) && v.scale >= 100 && Number.isFinite(v.target)) out[k] = v;
  }
  return out;
}

/**
 * 当天的圆周锁住。
 *
 * 锁的是「这一天 + 当时的摄入目标」：目标一天之内本来就不变（它走的是近 14 天
 * 基线，不跟当天的手表累计），所以正常用一天下来读到的都是同一个数。
 * 真去改了档案，目标变了，就从改的这一天起换尺子 —— 那正是「计划变了」。
 *
 * storage 可注入，方便单测。
 */
export function lockTrackScale(date, target, storage = memoryStore()) {
  const goal = n(target);
  const computed = trackScale(goal);
  const key = String(date || '');
  if (!key || !storage) return computed;
  const current = goal != null && goal > 0 ? goal : 0;
  try {
    const map = toScaleMap(JSON.parse(storage.getItem(SCALE_KEY) || 'null'));
    const saved = map[key];
    if (saved && Math.abs(saved.target - current) < 0.5) return saved.scale;
    map[key] = { scale: computed, target: current };
    storage.setItem(SCALE_KEY, JSON.stringify(map));
  } catch {
    return computed;
  }
  return computed;
}

/** 一个数在这把尺子上跑了几圈、第一圈和第二圈各画多少。第二圈封顶。 */
export function lap(x, scale) {
  const v = Math.max(0, n(x) || 0);
  const s = Math.max(1, scale);
  return {
    pct: v / s,
    laps: Math.floor(v / s),
    firstPct: (Math.min(v, s) / s) * 100,
    wrapPct: (Math.min(Math.max(v - s, 0), s) / s) * 100,
  };
}

/*
 * 圈心只有三句，全部对着**摄入目标**说。
 *
 * 不写「摄入领先 / 消耗领先」—— 谁在前面看两条刻度线就知道了，
 * 而上午消耗跑在摄入前面本来就是常态，把它印成一句结论会读成「今天出问题了」。
 * 也不写「缺口」：白天没吃满是正常的，那段灰是还能吃的额度。
 *
 * 吃超了那句叫**「超出目标」不叫「热量盈余」**。
 * 「盈余」在这个应用里已经有确定含义 —— 近 7 日速览的「累计收支」和趋势解读
 * 都用它表示**摄入减消耗**，也就是另一个差值。减脂时吃超目标 400，实际仍然
 * 是赤字，屏幕上就会同时出现今日卡「热量盈余 400」和数据页「缺口 xxx」，
 * 同一个词两个意思还能一正一负。「超出目标」和「接近目标」共用同一个参照词。
 *
 * 没吃满那句分两种，看**计划要不要你吃到消耗之上**（surplusPlan）：
 * 减脂 / 维持是一份额度，用「还能吃」；增肌是一件没做完的事，用「还应吃」。
 * 判据用计划的每日盈亏而不是目标名 —— 增肌档把速率设成 0 时并没有要补的量，
 * 那时候「还能吃」才对。
 */
function centerOf(ate, goal, surplusPlan) {
  const shortLabel = surplusPlan ? '还应吃' : '还能吃';
  if (goal == null || goal <= 0) return { key: 'none', label: shortLabel, kcal: null };
  const diff = Math.round(goal - ate);
  if (Math.abs(diff) <= BALANCE_WITHIN) return { key: 'onTarget', label: '接近目标', kcal: null };
  if (diff > 0) return { key: 'left', label: shortLabel, kcal: diff };
  return { key: 'over', label: '超出目标', kcal: -diff };
}

/**
 * @param {object} input
 *   eaten   已摄入 kcal
 *   burned  当前消耗（设备到此刻的静息 + 活动）。没有设备数据时传 null
 *   target      今日摄入目标，只用来在没传 scale 时算尺子、以及算圈心的差额
 *   dailyDelta  计划里每天的盈亏（摄入目标 − 计划消耗）。>0 表示计划要求吃到
 *               消耗之上，圈心那句改说「还应吃」
 *   scale       当天锁定的圆周。传入则不再改
 */
export function energyRing({
  eaten = 0, burned = null, target = null, dailyDelta = null, scale = null,
} = {}) {
  const ate = Math.max(0, n(eaten) || 0);
  const burnRaw = n(burned);
  const hasBurn = burnRaw != null && burnRaw >= 0;
  const burn = hasBurn ? burnRaw : 0;
  const goal = n(target);
  const sc = Math.max(100, n(scale) || trackScale(goal));

  const eatLap = lap(ate, sc);
  const burnLap = lap(burn, sc);

  /*
   * 两条轨道各画各的，一条都不去动另一条。
   * 第二圈从 12 点重新起、往右盖在第一圈上，最多画满两圈；
   * 再多的数值只写在圈心和图例里，不无限叠圈。
   */
  const segments = [];
  const push = (key, track, toPct, tone, kcal) => {
    if (!(toPct > 0.3)) return;
    segments.push({ key, track, tone, fromPct: 0, toPct, kcal: Math.round(kcal) });
  };
  push('eaten', 'intake', eatLap.firstPct, 'light', Math.min(ate, sc));
  push('eatenWrap', 'intake', eatLap.wrapPct, 'deep', Math.min(Math.max(ate - sc, 0), sc));
  if (hasBurn) {
    push('burned', 'burn', burnLap.firstPct, 'light', Math.min(burn, sc));
    push('burnedWrap', 'burn', burnLap.wrapPct, 'deep', Math.min(Math.max(burn - sc, 0), sc));
  }

  /* 刻度不带文字：名字和数值都归下面那行图例，环上只留两条细线 */
  const ticks = [];
  if (ate > 0.5) {
    ticks.push({
      key: 'eaten', track: 'intake', pct: ((ate % sc) / sc) * 100,
      kcal: Math.round(ate), laps: eatLap.laps,
    });
  }
  if (hasBurn) {
    ticks.push({
      key: 'burned', track: 'burn', pct: ((burn % sc) / sc) * 100,
      kcal: Math.round(burn), laps: burnLap.laps,
    });
  }

  /*
   * 图例就是环上那两条弧的说明：色块的深浅跟着轨道当前画到第几圈走，
   * 这样「颜色变深了」在环上和图例上说的是同一件事。
   */
  const legend = [
    { key: 'eaten', track: 'intake', label: '摄入', kcal: Math.round(ate), deep: eatLap.laps >= 1 },
  ];
  if (hasBurn) {
    legend.push({
      key: 'burned', track: 'burn', label: '消耗', kcal: Math.round(burn), deep: burnLap.laps >= 1,
    });
  }

  return {
    scale: sc,
    eaten: Math.round(ate),
    burned: hasBurn ? Math.round(burn) : null,
    target: goal != null ? Math.round(goal) : null,
    hasBurn,
    segments,
    ticks,
    legend,
    laps: { eaten: eatLap, burned: burnLap },
    center: centerOf(ate, goal, (n(dailyDelta) || 0) > 0),
    /** 还能吃多少（负数表示已经超出计划）。界面用圈心，这个数留给测试和提示层 */
    remaining: goal != null ? Math.round(goal - ate) : null,
  };
}
