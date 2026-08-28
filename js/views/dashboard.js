/**
 * 今日：我今天怎么样。状态 + 提示，两张卡。
 *
 * 这一页只回答「现在什么情况」。吃什么去饮食页，今天同步了什么、
 * 这些天在往哪走去数据页。
 *
 * 主卡本身就是一张完整的每日目标表：热量、三大营养素、纤维、钠、糖、饮水
 * 八项全在，而且每项都带着「已摄入 / 目标摄入」。所以数据页那张只列目标的表撤了——
 * 同一批数字，这里的版本还多告诉你离目标还差多少。
 */

import {
  h, clearEl, num, mount, infoTip,
} from '../lib/utils.js';
import { ring, macroBar, rangeBar, splitBar } from '../lib/charts.js';
import { dailyMetrics, macroSplit, KIND } from '../core/metrics.js';
import { state } from '../lib/store.js';
import { GOALS } from '../core/nutrition.js';
import { FOCUS_LABEL } from '../core/advisor.js';
import { setIntent } from '../lib/nav.js';

const LEVEL_TEXT = { good: '节奏正常', warn: '需要注意', bad: '已超标' };

/** 记住哪些区块被展开，重绘时不丢失 */
const expanded = { insights: false };

/** 可展开区块的通用页脚按钮 */
function moreToggle(key, total, shown, rerender) {
  if (total <= shown) return null;
  return h('button.more-btn', {
    onclick: () => { expanded[key] = !expanded[key]; rerender(); },
  }, expanded[key] ? '收起' : `展开其余 ${total - shown} 项`);
}

/* ---------------------------------------------------------------- 主卡 */

/*
 * 一行一个指标，每行按自己的性质画。
 *
 * 以前七项共用一根「填满了没有」的进度条，于是碳水也长着一根没填满的条、
 * 旁边写「还差 29g」——碳水是蛋白和脂肪分完热量之后的余数，照那根条去补，
 * 是界面在劝人多吃。性质和措辞都由 core/metrics.js 定，这里只负责画。
 */
/*
 * 条形统一用强调色，只有饮水单独一个蓝。
 *
 * 原先蛋白紫、碳水橙、脂肪橘红、饮水蓝四条并排，一张卡里四个色相 ——
 * 可每条旁边就写着「蛋白质」「碳水」，颜色并不承担区分作用，纯粹是装饰。
 * 饮水留蓝是因为它和上面三条不是一类东西（那三条是吃进去的宏量）。
 */
const KIND_COLOR = {
  kcal: 'var(--accent)', protein: 'var(--accent)', fat: 'var(--accent)',
  carb: 'var(--accent)', fiber: 'var(--accent)', sodium: 'var(--muted)',
  sugar: 'var(--muted)', water: 'var(--water)',
};

/*
 * 分两组画。
 *
 * 上面是「吃进去多少」：蛋白一条、碳水脂肪合用一条、饮水一条；
 * 下面三项（纤维、钠、游离糖）是门槛，只关心够没够 / 超没超，压成三个方框
 * 一行排开——它们不需要一整行的条，摊开只会把卡片拉长。
 *
 * 碳水和脂肪原先各占一条区间。两条都「在范围内」时总量却能差出 796 kcal
 * （2660 kcal 的计划上是 30%），两条各自说自己没问题、合起来对不上账；
 * 照计划吃的人还会看到「碳水低于建议 74g」。它们分的本来就是同一块热量，
 * 所以合成一条，说的也换成真正有意义的那件事：这块热量偏碳水还是偏脂肪。
 */
const CHIP_KEYS = ['fiber', 'sodium', 'sugar'];

function metricRow(m) {
  const { state: st } = m;
  const value = m.decimals ? num(m.eaten, m.decimals) : num(m.eaten);
  return h('div', { class: `metric-row ${st.level}` },
    h('div.metric-row-top', null,
      h('span.metric-row-label', null, m.label),
      h('strong.metric-row-value', null, `${value}${m.unit}`),
      h('span.metric-row-note', null, st.range ? `${st.note} · ${st.range}` : st.note)),
    /*
     * 记录类不画条。metricState 里它就定义成「只是记录，没有达标一说」，
     * 而这里原先是无条件画的 —— 没有区间就落到 macroBar，饮水于是长出
     * 一根「填到 1700」的进度条，界面在要求用户把一个不该有目标的数填满。
     */
    m.kind === KIND.log ? null
      : st.zoneStart != null
        ? rangeBar({
          fillPct: st.fillPct, zoneStart: st.zoneStart, zoneEnd: st.zoneEnd,
          color: KIND_COLOR[m.key], level: st.level,
        })
        : macroBar({
          value: m.eaten, target: m.target, color: KIND_COLOR[m.key],
          // 只有真上限会画成红色，下限和余数不会
          overIsBad: m.kind === KIND.ceiling,
        }));
}

/**
 * 碳水 / 脂肪合用的那一行。
 *
 * 上面一行是比例（这决定结构偏哪边），下面一行是各自的克数——
 * 只给比例的话，「58% : 42%」既说不出吃了多少，也没法和食物对上。
 */
function splitRow(split) {
  const empty = split.structure === 'none';
  return h('div', { class: `metric-row split-row ${split.level}` },
    h('div.metric-row-top', null,
      h('span.metric-row-label', null, '碳水 / 脂肪'),
      h('strong.metric-row-value', null, empty ? '—' : `${split.carbPct}% : ${split.fatPct}%`),
      h('span.metric-row-note', null, split.label)),
    splitBar({ carbPct: split.carbPct || 0, markPct: split.planCarbPct, empty }),
    /*
     * 中间那格是条上那根竖标的说明。合计热量原先摆在这儿，可它和圆环里的
     * 数字是同一件事；而竖标不解释的话，没人知道那道线是什么。
     */
    h('div.split-grams', null,
      h('span', null, `碳水 ${num(split.carbG)}g`),
      h('span.split-grams-plan', null, split.note),
      h('span', null, `脂肪 ${num(split.fatG)}g`)));
}

/** 门槛类指标：方框里两个数，够不够 / 超没超一眼看完 */
function metricChip(m) {
  const { state: st } = m;
  const value = m.decimals ? num(m.eaten, m.decimals) : num(m.eaten);
  return h('div', { class: `micro-chip ${st.level}` },
    h('span.micro-label', null, m.label),
    h('span.micro-val', null, value),
    h('span.micro-target', null, `/${num(m.target)}${m.unit.trim()}`));
}

function heroCard(advice, targets, derived) {
  const { status, gaps } = advice;
  const metrics = dailyMetrics(targets, gaps, derived.health?.waterCount);
  const kcal = metrics.find((m) => m.key === 'kcal');
  const by = Object.fromEntries(metrics.map((m) => [m.key, m]));

  /*
   * 圆环画的是「落在计划区间的哪里」，不是「占目标的百分之几」。
   *
   * 原先只要超一点就整圈变红。可增重计划本来就要求每天吃超——把执行计划
   * 画成危险色，等于界面自己跟自己打架。区间内是绿的，出了区间是橙的，
   * 红色只留给真正的上限（钠、游离糖）。
   */
  const inRange = kcal.state.level === 'met';
  const diff = Math.round(kcal.eaten - targets.kcal);

  return h(`section.card.hero.${status.level}`, null,
    h('div.hero-head', null,
      h('div.hero-head-main', null,
        h('span.status-pill', null, LEVEL_TEXT[status.level]),
        h('h2', null, status.headline)),
      heroInfo(derived, targets)),
    h('p.hero-detail', null, status.detail),
    // 计划速率的代价也是热量的事，紧跟着热量那一段说
    rateNote(targets),

    // 圆环说「吃到计划的哪儿了」，右边说「今天实际收支」，都是热量的事，放一起
    h('div.hero-body', null,
      h('div.hero-ring', null,
        ring({
          /*
           * 弧长仍然是「吃了目标的百分之几」——这是圆环唯一直观的读法。
           * 一度改成画区间落点，结果吃了 90% 的人看到一个几乎空的圈，
           * 数字和图形对不上。判断交给颜色：区间内绿、出界橙，红色不给热量用。
           */
          pct: gaps.kcal.pct,
          size: 104,
          stroke: 10,
          label: num(kcal.eaten),
          sub: `/ ${num(targets.kcal)} kcal`,
          color: inRange ? 'var(--accent)' : 'var(--warn)',
        }),
        h('p.hero-ring-note', { class: `hero-ring-note${inRange ? '' : ' warn'}` },
          inRange ? '在计划范围内'
            : diff > 0 ? `比计划多 ${num(diff)} kcal` : `比计划少 ${num(-diff)} kcal`)),
      energyBalance(derived, targets)),

    h('div.metric-list', null,
      metricRow(by.protein),
      splitRow(macroSplit(targets, gaps)),
      metricRow(by.water)),
    h('div.hero-micros', null, CHIP_KEYS.map((k) => metricChip(by[k]))),
    energyFreshness(derived),
  );
}

/*
 * 计划 / 实际分成两行说。
 *
 * 「今日目标 2076」是按近期节奏定的，一天之内不会动；「今天实际消耗 1746」
 * 跟着手表走，本来就该动。以前只有一个数，手表一同步目标就跳，
 * 同一顿饭从「刚好」变成「超标」——用户什么都没做错，是脚下的尺子在动。
 */
function energyBalance(derived, targets) {
  const live = derived.liveEnergy;
  const planWord = targets.dailyDelta > 0 ? '计划盈余' : targets.dailyDelta < 0 ? '计划赤字' : '计划平衡';
  const line = (k, v) => h('div.energy-line', null,
    h('span.energy-key', null, k), h('strong.energy-val', null, v));
  return h('div.energy-block', null,
    line(planWord, `${num(Math.abs(targets.dailyDelta))} kcal`),
    live
      ? line('今日实际消耗', `${num(live.tdee)} kcal`)
      : line('预计总消耗', `${num(targets.tdee)} kcal`),
    live
      ? line(`实际${live.surplus >= 0 ? '盈余' : '缺口'}`, `${num(Math.abs(live.surplus))} kcal`)
      : line('基础代谢', `${num(targets.bmr)} kcal`));
}

/*
 * 目标依据和能量数据的时效收进右上角那个圈里的感叹号。
 *
 * 「Apple 能量数据截至 21:00，距今 7 分钟」这种话每天都对、每天都一样，
 * 常驻在主卡中间等于每次打开都要跳过一遍。要查的时候点开就有。
 *
 * 但真正出了问题的那几条（身体信息不合格、演示数据、数据过期）不收——
 * 那些是「你现在看到的数字不对」，藏起来就没人会发现。
 */
function heroInfo(derived, targets) {
  const meta = derived.energyData;
  const basis = [
    ['热量', targets.tdeeSource !== 'apple'
      ? '按活动系数估算'
      : targets.activeSource === 'formula-fallback'
        ? '静息采用设备记录，缺失活动按活动系数补足'
        : targets.activeSource === 'device-baseline'
          ? '活动采用近期设备记录基线估算'
          : '按今日 Apple 能量记录动态估算'],
    ['蛋白质', targets.proteinBasis],
    ['脂肪', `计划 ${num(targets.fat)}g 用于分配三大营养素；参考上限 ${num(targets.fatUpper || targets.fat)}g 按总热量 35% 计算`],
    ['碳水', '总热量减去蛋白与脂肪后的剩余'],
    ['膳食纤维', '中国成人参考 25–30g'],
    ['钠上限', '约等于 5g 食盐'],
    ['游离糖上限', '含糖浆、蜂蜜和果汁中的糖；低于总热量 10%'],
    ['饮水参考', '温和气候、低活动；运动或炎热天气需额外补充'],
  ];
  let freshness = null;
  if (meta?.observedAt && derived.dynamic && !meta.stale) {
    const observed = new Date(meta.observedAt);
    const clock = observed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const age = meta.ageMinutes >= 120
      ? `，距今约 ${Math.max(2, Math.round(meta.ageMinutes / 60))} 小时`
      : meta.ageMinutes > 5 ? `，距今 ${meta.ageMinutes} 分钟` : '';
    freshness = `Apple 能量数据截至 ${clock}${age}；没有新数据时热量目标会保持不变。`;
  }
  return infoTip('查看目标计算依据',
    /*
     * 「增肌 · +0.3 kg/周」是把程序算不出来的东西说成了结论：
     * 它能规划的只是体重变化速度，长的是肌肉还是别的，这里判断不了。
     * 目标名保留（那是你想做的事），但数字明确标成「计划体重」。
     */
    h('p', null, h('strong', null, `${GOALS[targets.goal].label}`),
      targets.rateKgPerWeek === 0
        ? ' · 计划体重维持不变'
        : ` · 计划体重 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周`),
    h('p', null,
      `按 7700 kcal/kg 的脂肪当量换算，相当于每天${targets.dailyDelta >= 0 ? '多' : '少'}吃 `
      + `${num(Math.abs(targets.dailyDelta))} kcal。这只是能量换算，`
      + '程序规划的是体重变化速度，不能保证增减的是肌肉还是脂肪。'),
    freshness && h('p', null, freshness),
    h('ul', null, basis.map(([name, note]) => h('li', null,
      h('strong', null, `${name}：`), note))),
    targets.clampedByFloor && h('p', null,
      '按目标速率算出的热量低于成人常用饮食计划下限（女 1200 / 男 1500 kcal），已自动上调；'
      + '如有疾病、孕哺或特殊训练需求，请由专业人员个体化评估。'),
  );
}

/** 带符号写速率：+0.3 和 0.3 读起来是两件事 */
const signedRate = (v) => `${Number(v) > 0 ? '+' : ''}${Number(v)}`;

/*
 * 计划速率对热量的影响，说在热量那一段的正下方。
 *
 * 建议上沿（减 1% / 增 0.5% 体重每周）不再拦人：科学结论说的是
 * 「超过这个速度，多出来的按比例主要是脂肪」，不是「0.52% 不安全必须拦下」。
 * 所以填进去的数照用，代价在这里说出来 —— 藏进感叹号等于没说。
 *
 * 截断的话只点名**最后真正起作用的那一条**。原先那句「已按体重比例和
 * 每日热量调整上限改为…」一口气点了两个机制，而实测只有一条碰到了，
 * 用户照着去查另一条会发现根本对不上。
 */
function rateNote(targets) {
  const why = {
    'daily-kcal': '每天的热量调整幅度已经到顶（最多少吃 750 / 多吃 500 kcal）',
    absurd: '这个速率超出了可执行范围',
    floor: '热量已经压到成人饮食计划下限（女 1200 / 男 1500 kcal）',
  }[targets.rateLimitedBy];
  const lines = [
    targets.rateWasClamped && why
      ? `你填的 ${signedRate(targets.requestedRateKgPerWeek)} kg/周没能完整执行：${why}，`
        + `热量按 ${signedRate(targets.rateKgPerWeek)} kg/周安排。`
      : null,
    targets.rateOverAdvisory && targets.rateAdvisoryKg
      ? `计划 ${signedRate(targets.rateKgPerWeek)} kg/周约为体重的 ${targets.ratePctOfWeight}%/周，`
        + `超过建议上沿（约 ${targets.rateAdvisoryKg} kg/周）。`
        + (targets.rateKgPerWeek > 0
          ? '热量给到这个程度，多出来的部分按比例主要是脂肪 —— 肌肉本身长不了这么快。'
          : '热量缺口到这个程度，掉的就不只是脂肪，瘦体重占的比例会上升。')
      : null,
  ].filter(Boolean);
  if (!lines.length) return null;
  return h('p.hero-rate-note', null, lines.join('　'));
}

/** 只有「你看到的数字不对」才留在卡面上 */
function energyFreshness(derived) {
  const meta = derived.energyData;
  /*
   * 身体信息本身算不出目标时要说清是哪一条不合格。
   * 笼统说「演示数据」会让人以为只是没填，实际是填了但被拒——
   * 常见于恢复了一份旧备份，或换设备后云端同步下来的旧档案。
   */
  if (derived.profileError) {
    return h('p.data-freshness.warn', null,
      `身体信息暂时算不出目标（${derived.profileError}），下面的数字来自默认档案。`
      + '请到右上角“设置 → 身体信息”修正后保存。');
  }
  if (derived.demoMode) {
    return h('p.data-freshness.warn', null, '当前使用演示身体数据，热量与营养目标不是你的个性化结果。请到“设置”填写真实信息。');
  }
  if (meta?.missingObservationTime) {
    return h('p.data-freshness.warn', null, '这份能量数据缺少覆盖时间，已停止动态外推并改用公式估算。重新导入即可修复。');
  }
  if (meta?.stale && derived.dynamic) {
    return h('p.data-freshness.warn', null, 'Apple 能量数据已经有一段时间没更新了，热量目标暂时保持不变。重新同步一次即可。');
  }
  return null;
}

/* ---------------------------------------------------------------- 提示 */

/*
 * 有些提示说的是「你还缺什么」，而能补上它的食物在饮食页。
 * 只报数字等于把问题原样退回去 —— 这几条做成可点的，
 * 点一下带着「我要补蛋白」跳过去，落在按每 100 kcal 含量排好的那张表上。
 */
const INSIGHT_FOCUS = { protein: 'protein', fiber: 'fiber' };

function insightsCard(advice, rerender) {
  const all = advice.insights;
  if (!all.length) return null;
  const list = expanded.insights ? all : all.slice(0, 3);
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '今日提示')),
    h('div.insight-list', null, list.map((i) => {
      const focus = INSIGHT_FOCUS[i.type];
      const body = [
        h('div.insight-title', null, i.title),
        h('div.insight-text', null, i.text),
        focus ? h('div.insight-go', null, `去看${FOCUS_LABEL[focus]}的食物 ›`) : null,
      ];
      if (!focus) return h(`div.insight.${i.type}`, null, ...body);
      return h(`button.insight.${i.type}`, {
        class: `insight ${i.type} insight-actionable`,
        type: 'button',
        onclick: () => { setIntent({ focus }); location.hash = 'diet'; },
      }, ...body);
    })),
    moreToggle('insights', all.length, 3, rerender),
  );
}

/* ---------------------------------------------------------------- 健康 */

export function renderDashboard(root) {
  const rerender = () => renderDashboard(root);
  const d = state.derived;
  clearEl(root);
  if (!d) return;
  const { advice, targets } = d;
  mount(root,
    heroCard(advice, targets, d),
    insightsCard(advice, rerender),
  );
}
