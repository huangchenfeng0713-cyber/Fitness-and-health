/**
 * 今日健康数据卡：今天的活动数据 + 截至今天最近一次有效体重。
 *
 * 挂在数据页最顶上。下面那张趋势卡画的就是这几项的走势——
 * 「今天多少」和「这些天在往哪走」放在同一页，才不用来回切。
 *
 * 它不跟今日 / 饮食页选的日期走。那两页翻回昨天是为了补记饮食；
 * 这张卡跟着翻的话，「今日健康数据」这个标题就成了假的。
 *
 * 图标不是装饰：六项数值排在一起时，全是数字加两个汉字，
 * 扫一眼分不出哪个是哪个；图标是那个能先被认出来的锚点。
 *
 * 算什么、缺项怎么讲、同步算不算成功都在 core/health-card.js。
 */

import { h, num, formatDuration, todayKey } from '../../lib/utils.js';
import { icon, ICON_SHAPES } from '../../lib/icons.js';
import { infoTip } from '../../lib/ui.js';
import { state, latestHealthEntry } from '../../lib/store.js';
import { setIntent } from '../../lib/nav.js';
import { healthCardState, MISSING_REASONS, FIELD_LABEL } from '../../core/health-card.js';


/** 缺数据时占位的那道杠。用长破折号，不用连字符——后者太短，像个减号 */
const DASH = '—';

/*
 * 列数按项数挑，别让末行只剩一个。
 *
 * 显示几项完全看当天同步上来了什么，从 1 项到 8 项都可能。
 * 固定三列的话 7 项就排成 3+3+1，最后那个吊在中间，怎么摆都是歪的。
 * 先找能整除的（8 → 4+4，6 → 3+3），实在整除不了就挑一个末行至少剩两个的。
 */
export function metricColumns(n) {
  if (n <= 4) return Math.max(n, 1);
  for (const c of [4, 3]) if (n % c === 0) return c;
  for (const c of [3, 4]) if (n % c !== 1) return c;
  return 3;
}

/** 同步入口收在设置抽屉的「数据管理」里，这里直接把抽屉打开 */
function dataCenterBtn() {
  return h('button.secondary-btn.full.health-sync-action', {
    onclick: () => {
      setIntent({ settingsSection: 'data' });
      document.querySelector('.topbar-settings-btn')?.click();
    },
  }, '去同步健康数据');
}

const fmt = (cell) => {
  if (cell.value == null) return DASH;
  if (cell.kind === 'duration') return formatDuration(cell.value);
  return num(cell.value, cell.decimals || 0);
};

/** 体脂与静息心率仍只显示当天值；最近一次收进信息按钮供核对。 */
function lastSeenLines(today) {
  return ['bodyFatPct', 'restingHR'].map((key) => {
    const hit = latestHealthEntry(key, today);
    if (!hit) return null;
    const value = key === 'restingHR' ? num(hit.value) : num(hit.value, 1);
    const unit = key === 'bodyFatPct' ? '%' : ' bpm';
    return h('li', null, h('strong', null, `${FIELD_LABEL[key]}：`),
      `最近一次 ${hit.date} 记到 ${value}${unit}`);
  }).filter(Boolean);
}

export function healthMetricsCard() {
  const today = todayKey();
  const latestWeight = latestHealthEntry('weightKg', today);
  const seen = new Set();
  for (const row of state.healthDays) {
    for (const key of Object.keys(row)) {
      // 先剔 null / 空串再转数字：Number(null) 是 0，而 0 是有限数 ——
      // 一条空值字段会让体脂、饮水这类 optIn 指标凭空常驻一格，天天挂着一道杠。
      const value = row[key];
      if (value != null && String(value).trim() !== '' && Number.isFinite(Number(value))) seen.add(key);
    }
  }
  const info = healthCardState({
    health: state.healthByDate?.get(today) || null,
    lastImport: state.lastImport,
    today,
    everSeen: [...seen],
    latestWeight,
  });
  const cols = metricColumns(info.cells.length);
  // 有数据但缺了活动能量时也值得再同步一次：热量预算就靠它动态调整
  const needsImport = !info.hasAny || info.missing.includes('activeEnergy');
  const syncedClock = info.syncedAt
    ? new Date(info.syncedAt).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    })
    : null;

  const optionalLastSeen = lastSeenLines(today);
  const weightCell = info.cells.find((cell) => cell.key === 'weightKg');

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '今日健康数据'),
      h('div.card-head-actions', null,
        h('span.card-tag', { class: info.synced ? 'card-tag' : 'card-tag muted' },
          info.synced ? '已同步' : '未同步'),
        infoTip('查看同步情况',
          h('p', null, syncedClock
            ? `最近一次同步：${syncedClock}${info.synced ? '（今天）' : ''}。`
            : '还没有同步过健康数据。'),
          info.presentToday.length
            ? h('p', null, `今天读到了：${info.presentToday.map((k) => FIELD_LABEL[k]).join('、')}。`)
            : null,
          info.missing.length
            ? [
              h('p', null, `今天没读到：${info.missing.map((k) => FIELD_LABEL[k]).join('、')}。常见原因——`),
              h('ul', null, MISSING_REASONS.map((r) => h('li', null, r))),
            ]
            : null,
          h('p', null, '体重默认显示截至今天最近一次有效记录，不要求必须当天称重。',
            weightCell?.value != null
              ? ` 当前显示 ${num(weightCell.value, 1)} kg，测量日期 ${weightCell.observedDate || '未知'}。`
              : ' 当前还没有体重记录。'),
          h('p', null, '体脂与静息心率仍只显示当天值；最近一次记录如下：'),
          h('ul', null, optionalLastSeen.length
            ? optionalLastSeen
            : h('li', null, '体脂与静息心率都还没有记录。')),
          info.sourceNote ? h('p', null, info.sourceNote) : null))),
    info.hasAny
      /*
       * 列数也写成 class：四列时格子只有 78px 宽，而「6小时42分」在 17px 下要 82px，
       * 会把格子撑破（scripts/smoke.mjs 里那条 1~8 项的检查就是拦这个的）。
       * 密一档的排布配密一档的字号，不是所有列数都用同一个 17px。
       */
      ? h('div.metric-grid', { class: `metric-grid cols-${cols}`, style: { '--metric-cols': String(cols) } },
        info.cells.map((cell) => h('div.metric-cell', { class: `metric-cell${cell.value == null ? ' empty' : ''}` },
          icon(ICON_SHAPES[cell.key] ? cell.key : 'steps', 'metric-icon'),
          h('div.metric-body', null,
            h('div.metric-value', null, fmt(cell),
              cell.value != null && cell.unit ? h('span.metric-unit', null, cell.unit) : null),
            h('div.metric-label', null, cell.label)))))
      // 一个数都没有时不画一排杠：那不是「今天没测到」，是压根还没同步过
      : h('p.empty-hint', null,
        '今天还没有健康数据。到设置里的「数据管理」从健康 App、快捷指令或导出文件同步。'),
    needsImport && dataCenterBtn(),
    needsImport && info.hasAny && h('p.form-hint', { style: { marginTop: '6px' } },
      '缺「活动能量」，热量预算暂时按公式估算。导入后会按 Apple 设备记录重新估算。'),
  );
}
