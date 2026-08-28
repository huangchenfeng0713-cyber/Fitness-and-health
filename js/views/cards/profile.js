/**
 * 身体信息卡片。
 *
 * 单独成模块，好让它换页只是一行 import 的事——它现在挂在数据页：
 * 身高体重体脂本来就是「我的数据」，和健康记录放在一起才顺。
 */

import { h, num, toast, infoTip, field } from '../../lib/utils.js';
import { state, saveProfile } from '../../lib/store.js';
import {
  ACTIVITY_LEVELS, GOALS, bmi, bmiCategory, leanBodyMass, validateProfile, rateGuidance,
} from '../../core/nutrition.js';

/**
 * 身体信息表单。
 *
 * 这里刻意不做「改一个字段就立刻存盘」：存盘会触发整页重绘，
 * 正在输入的那个 input 会被从 DOM 里拆掉重建 —— iOS 上表现为
 * 打一个字键盘就收起、日期选择器刚滑到某天就被当场提交。
 * 所以改成先写进 draft（纯内存，不重绘），点「保存」才落库。
 */
let draft = null;
let draftBase = null;   // 打开草稿时的 profile 快照，用来判断有没有真的改动

function resetDraft() {
  draft = null;
  draftBase = null;
}

function ensureDraft() {
  if (!draft || draftBase !== state.profile) {
    draft = { ...state.profile };
    draftBase = state.profile;
  }
  return draft;
}

function isDirty() {
  if (!draft) return false;
  return Object.keys(draft).some((k) => {
    const a = draft[k];
    const b = state.profile[k];
    if (a == null && b == null) return false;
    return a !== b;
  });
}


export function profileCard(rerender) {
  const d = ensureDraft();
  const saveBtn = h('button.primary-btn', {
    disabled: !isDirty(),
    onclick: async () => {
      const checked = validateProfile(draft);
      if (!checked.valid) { toast(checked.errors[0], 'warn'); return; }
      /*
       * 建议上沿之外照存不误 —— 那只是「不划算」，不是「不许」。
       * 拦下的只有明显填错的量级（每周超过体重的 1.5%），
       * 那种数存进去会让全套热量目标一起失真。
       */
      if (rateGuidance({ weightKg: planWeight(), rateKgPerWeek: draft.rateKgPerWeek }).level === 'absurd') {
        toast('目标速率超出可执行范围，请先改小', 'warn');
        return;
      }
      await saveProfile({
        ...draft, ageEstimated: !draft.birthday, demoMode: false, onboarded: true,
      });
      resetDraft();
      toast('已保存', 'ok');
      rerender();
    },
  }, '保存身体信息');

  const dirtyMark = h('span.dirty-mark', { hidden: !isDirty() }, '有未保存的修改');

  /** 只更新保存按钮状态，绝不重绘表单本身 */
  const touch = () => {
    const dirty = isDirty();
    saveBtn.disabled = !dirty;
    dirtyMark.hidden = !dirty;
  };

  const sexSelect = h('select', {
    onchange: (e) => { d.sex = e.target.value; touch(); },
  },
  h('option', { value: 'male', selected: d.sex === 'male' }, '男'),
  h('option', { value: 'female', selected: d.sex === 'female' }, '女'));

  const birthday = h('input', {
    type: 'date', value: d.birthday || '', max: new Date().toISOString().slice(0, 10),
    onchange: (e) => { d.birthday = e.target.value; touch(); },
  });

  /*
   * 身高、体重只从 Apple 健康读，读到过就不再让人改。
   *
   * 两个来源同时存在的时候，界面上摆着一个能编辑的输入框，算目标时用的却是
   * 设备记录——改了没反应，比锁死更让人困惑。所以设备给过值就直接显示那个值，
   * 并写清是哪天读到的（称重不是每天都有，看到的常常是前几天那次）。
   *
   * 设备从来没给过这一项时输入框照常可用：新用户第一次打开、或者刚把健康数据
   * 清空重来，总得有办法把身高填进去，否则连静息能量都算不出来。
   */
  const bodySource = state.derived?.bodySource || {};
  /*
   * 算速率提示要用**实际参与计算的体重**。体重被 Apple 健康锁住时草稿里那份
   * 可能是空的或过期的，拿它去算「体重的百分之几」会给出另一个答案。
   */
  const planWeight = () => Number(state.derived?.effectiveProfile?.weightKg ?? d.weightKg) || 0;
  // 身高是整数居多，写成「176.0 cm」反倒像在标一个并不存在的精度
  const trim = (v) => String(Math.round(v * 10) / 10);
  const lockedField = (label, key, unit, fmt = (v) => num(v, 1)) => {
    const hit = bodySource[key];
    if (!hit) return null;
    return field(label,
      h('div.locked-value', null, h('strong', null, `${fmt(hit.value)} ${unit}`)),
      `来自 Apple 健康 · ${hit.date.slice(5)}`);
  };

  const numInput = (key, step = '0.1', placeholder = '') => h('input', {
    type: 'number', step, inputmode: 'decimal', placeholder,
    value: d[key] != null ? d[key] : '',
    // 用 input 而不是 change：iOS 上 change 的触发时机跟着焦点走，容易丢最后一次输入
    oninput: (e) => {
      const v = e.target.value.trim();
      d[key] = v === '' ? null : Number(v);
      touch();
    },
  });

  /*
   * 速率的提示跟着输入实时变，但**不能重绘表单**：重绘会把正在编辑的 input
   * 连根换掉，iOS 上就是打一个字键盘收一次。所以只改这一个节点的文字和类名。
   */
  const rateHint = h('span');
  const plannedRate = () => (d.rateKgPerWeek != null
    ? d.rateKgPerWeek : GOALS[d.goal]?.defaultRateKgPerWeek ?? 0);
  const syncRateHint = () => {
    const g = rateGuidance({ weightKg: planWeight(), rateKgPerWeek: plannedRate() });
    rateHint.textContent = g.text || '减脂填负数';
    rateHint.className = g.level === 'ok' ? '' : `rate-hint ${g.level}`;
  };

  const rate = h('input', {
    type: 'number', step: '0.05', inputmode: 'decimal',
    value: d.rateKgPerWeek != null ? d.rateKgPerWeek : GOALS[d.goal]?.defaultRateKgPerWeek ?? 0,
    oninput: (e) => { d.rateKgPerWeek = Number(e.target.value); syncRateHint(); touch(); },
  });
  syncRateHint();

  const activity = h('select', {
    onchange: (e) => { d.activity = e.target.value; touch(); },
  }, Object.values(ACTIVITY_LEVELS).map((l) => h('option', { value: l.key, selected: d.activity === l.key }, l.label)));

  const goal = h('select', {
    onchange: (e) => {
      d.goal = e.target.value;
      d.rateKgPerWeek = GOALS[e.target.value].defaultRateKgPerWeek;
      rate.value = d.rateKgPerWeek;   // 直接改 DOM，不重绘
      syncRateHint();
      touch();
    },
  }, Object.values(GOALS).map((g) => h('option', { value: g.key, selected: d.goal === g.key }, g.label)));

  // 下方的体征小卡展示的是「已保存」的口径，避免草稿态给出误导性的数字
  const p = state.profile;
  const w = state.derived?.effectiveProfile?.weightKg ?? p.weightKg;
  const bmiVal = bmi(w, state.derived?.effectiveProfile?.heightCm ?? p.heightCm);
  const cat = bmiCategory(bmiVal);
  const lbm = leanBodyMass(w, state.derived?.effectiveProfile?.bodyFatPct ?? p.bodyFatPct);

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '身体信息'),
      h('div.card-head-actions', null,
        dirtyMark,
        infoTip('查看身体信息用途',
          h('p', null, '身高、体重、生日和性别用于估算静息能量。'),
          h('p', null,
            '身高、体重、体脂只从 Apple 健康读取，取的是所选日期之前最近一次记录——'
            + '称重不是每天都有，没有新记录时会一直沿用上一次读到的值。'
            + '设备从来没给过这一项时，才由你自己填。'),
          h('p', null, '填写体脂率后会改用瘦体重公式；家用体脂秤数值只适合观察趋势。')))),
    h('div.form-grid', null,
      field('性别', sexSelect),
      // 生日独占一整行：iOS Safari 的原生日期控件固有宽度大，挤在半格里容易溢出
      field('生日', birthday, '用于计算个人目标', 'span-all'),
      lockedField('身高（cm）', 'heightCm', 'cm', trim)
        || field('身高（cm）', numInput('heightCm', '0.5'), '同步 Apple 健康后改由设备记录填写'),
      lockedField('体重（kg）', 'weightKg', 'kg')
        || field('体重（kg）', numInput('weightKg', '0.1'), '同步 Apple 健康后改由设备记录填写'),
      lockedField('体脂率（%）', 'bodyFatPct', '%')
        || field('体脂率（%，可选）', numInput('bodyFatPct', '0.1', '可以留空')),
      // 选项文字长（「轻度活动（每周 1-3 次）」），半格会被截断
      field('日常活动量', activity, '选择平时的生活强度', 'span-all'),
      field('目标', goal),
      field('目标速率（kg/周）', rate, rateHint, 'span-all'),
    ),
    saveBtn,
    h('div.stat-row', null,
      h('div.stat', null, h('strong', null, bmiVal ?? '—'), h('span', null, `BMI${cat ? ` · ${cat.label}` : ''}`)),
      h('div.stat', null, h('strong', null, lbm != null ? num(lbm, 1) : '—'), h('span', null, '瘦体重 kg')),
      h('div.stat', null, h('strong', null, num(state.derived?.bmr)), h('span', null, '估算静息能量 kcal')),
      h('div.stat', null, h('strong', null, num(state.derived?.staticTdee)), h('span', null, '估算 TDEE kcal')),
    ),
  );
}

