/** 身体信息与目标设置。 */

import { h, num, toast, field } from '../../lib/utils.js';
import { infoTip } from '../../lib/ui.js';
import { state, saveProfile, planForProfile } from '../../lib/store.js';
import {
  ACTIVITY_LEVELS, GOALS, bmi, bmiCategory, leanBodyMass, validateProfile, rateGuidance, ageFrom,
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
  const previewProfile = () => ({ ...d, targetVersions: [], ...Object.fromEntries(Object.entries(bodySource).filter(([, hit]) => hit).map(([k, hit]) => [k, hit.value])) });
  const planWeight = () => Number(previewProfile().weightKg) || 0;

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
      toast('已保存，从今天生效', 'ok');
      rerender();
    },
  }, '保存身体信息');

  const dirtyMark = h('span.dirty-mark', { hidden: !isDirty() }, '有未保存的修改');
  const touch = () => {
    const dirty = isDirty();
    saveBtn.disabled = !dirty;
    dirtyMark.hidden = !dirty;
    syncRateHint();
    syncDraftStats();
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
    const solved = planForProfile(previewProfile());
    rateHint.textContent = solved.status === 'unavailable' ? solved.reason
      : '输入意愿 ' + plannedRate() + ' kg/周；实际预算 ' + solved.kcal + ' kcal/天，初始调整 ' + solved.dailyDelta + ' kcal/天。'
        + (solved.rateLimitedBy ? ({ floor: '受应用计划下限约束。', 'daily-kcal': '受每日调整上限约束。' })[solved.rateLimitedBy] || '' : '')
        + '7700 换算仅作初始预算近似。';
    rateHint.className = solved.status === 'unavailable' ? 'rate-hint over' : '';
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

  const stats = h('div.stat-row');
  const syncDraftStats = () => {
    const p = previewProfile(), solved = planForProfile(p);
    const bmiVal = bmi(p.weightKg, p.heightCm), cat = bmiCategory(bmiVal, ageFrom(p));
    const lbm = leanBodyMass(p.weightKg, p.bodyFatPct);
    stats.replaceChildren(...[
      [num(bmiVal, 1), `BMI · 成人参考${cat ? ` · ${cat.label}` : ''}`],
      [num(lbm, 1), '瘦体重 kg'], [num(solved.bmr), '估算静息能量 kcal'], [num(solved.tdee), '计划参考 TDEE kcal'],
    ].map(([value, label]) => h('div.stat', null, h('strong', null, value), h('span', null, label))));
  };
  syncDraftStats();

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '身体信息'),
      h('div.card-head-actions', null,
        dirtyMark,
        infoTip('查看身体信息用途',
          h('p', null, '身高、体重、生日和性别用来估算你的能量需求。已同步的身高、体重、体脂采用设备记录，生日在此填写。自动计划适用于 19–78 岁一般健康成人，不覆盖孕哺和需医疗营养治疗者。'),
          h('p', null, '体脂率可选。家用体脂秤的单次数值误差较大，更适合看长期趋势。'),
          h('p', null, '日常活动量包括工作、通勤和运动，不能仅按每周训练次数选择。活动系数是粗略参考，可结合多日记录调整。')))),

    h('div.form-grid', null,
      field('性别', sexSelect),
      field('生日', birthday, null, 'span-all'),
      lockedField('身高（cm）', 'heightCm', 'cm', trim)
        || field('身高（cm）', numInput('heightCm', '0.5')),
      lockedField('体重（kg）', 'weightKg', 'kg')
        || field('体重（kg）', numInput('weightKg', '0.1')),
      lockedField('体脂率（%）', 'bodyFatPct', '%')
        || field('体脂率（%，可选）', numInput('bodyFatPct', '0.1', '可以留空')),
      field('日常活动量', activity, null, 'span-all'),
      field('目标', goal),
      field('目标速率（kg/周）', rate, rateHint, 'span-all')),
    saveBtn,
    h('p.form-hint', null, '新计划从保存当天生效，历史无版本时按当前设置对照。'),
    stats);
}
