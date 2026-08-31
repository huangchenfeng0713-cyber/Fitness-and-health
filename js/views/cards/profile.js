/** 身体信息与目标设置。 */

import { h, num, toast, infoTip, field } from '../../lib/utils.js';
import { state, saveProfile } from '../../lib/store.js';
import {
  ACTIVITY_LEVELS, GOALS, bmi, bmiCategory, leanBodyMass, validateProfile, rateGuidance,
} from '../../core/nutrition.js';

let draft = null;
let draftBase = null;

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
  const bodySource = state.derived?.bodySource || {};
  const planWeight = () => Number(state.derived?.effectiveProfile?.weightKg ?? d.weightKg) || 0;

  const saveBtn = h('button.primary-btn', {
    disabled: !isDirty(),
    onclick: async () => {
      const checked = validateProfile(draft);
      if (!checked.valid) { toast(checked.errors[0], 'warn'); return; }
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
    oninput: (e) => {
      const v = e.target.value.trim();
      d[key] = v === '' ? null : Number(v);
      touch();
    },
  });

  /* 目标速率只在输入处即时提示；保存后不在今日页长期重复。 */
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
      rate.value = d.rateKgPerWeek;
      syncRateHint();
      touch();
    },
  }, Object.values(GOALS).map((g) => h('option', { value: g.key, selected: d.goal === g.key }, g.label)));

  const p = state.profile;
  const w = state.derived?.effectiveProfile?.weightKg ?? p.weightKg;
  const bmiVal = bmi(w, state.derived?.effectiveProfile?.heightCm ?? p.heightCm);
  const cat = bmiCategory(bmiVal);
  const lbm = leanBodyMass(w, state.derived?.effectiveProfile?.bodyFatPct ?? p.bodyFatPct);

  const sourceNote = h('p.profile-source-note', null,
    '身高、体重、体脂同步过 Apple 健康后自动采用最近一次设备记录；尚未同步的项目仍可手动填写。');

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '身体信息'),
      h('div.card-head-actions', null,
        dirtyMark,
        infoTip('查看身体信息用途',
          h('p', null, '身高、体重、生日和性别用于估算能量需求；同步过 Apple 健康的身体数据优先采用设备最近一次记录。'),
          h('p', null, '体脂率可选。家用体脂秤的单次数值误差较大，更适合看长期趋势。')))),
    sourceNote,
    h('div.form-grid', null,
      field('性别', sexSelect),
      field('生日', birthday, '用于计算个人目标', 'span-all'),
      lockedField('身高（cm）', 'heightCm', 'cm', trim)
        || field('身高（cm）', numInput('heightCm', '0.5')),
      lockedField('体重（kg）', 'weightKg', 'kg')
        || field('体重（kg）', numInput('weightKg', '0.1')),
      lockedField('体脂率（%）', 'bodyFatPct', '%')
        || field('体脂率（%，可选）', numInput('bodyFatPct', '0.1', '可以留空')),
      field('日常活动量', activity, '选择平时的生活强度', 'span-all'),
      field('目标', goal),
      field('目标速率（kg/周）', rate, rateHint, 'span-all')),
    saveBtn,
    h('div.stat-row', null,
      h('div.stat', null, h('strong', null, bmiVal ?? '—'), h('span', null, `BMI${cat ? ` · ${cat.label}` : ''}`)),
      h('div.stat', null, h('strong', null, lbm != null ? num(lbm, 1) : '—'), h('span', null, '瘦体重 kg')),
      h('div.stat', null, h('strong', null, num(state.derived?.bmr)), h('span', null, '估算静息能量 kcal')),
      h('div.stat', null, h('strong', null, num(state.derived?.staticTdee)), h('span', null, '估算 TDEE kcal'))));
}
