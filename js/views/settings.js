/** 设置：身体信息、目标与计算偏好。所有导入、备份和恢复统一放在“数据”页。 */

import { h, clearEl, num, toast, mount, infoTip } from '../lib/utils.js';
import { state, saveProfile } from '../lib/store.js';
import {
  ACTIVITY_LEVELS, GOALS, bmi, bmiCategory, leanBodyMass, validateProfile,
} from '../core/nutrition.js';
import {
  APP_VERSION, FEEDBACK_KINDS, feedbackKind, buildDiagnostics, buildFeedbackBody, feedbackIssueUrl,
} from '../core/feedback.js';

function field(label, control, hint, extraClass = '') {
  return h(`label.form-field${extraClass ? `.${extraClass}` : ''}`, null,
    h('span', null, label),
    control,
    hint && h('small.field-hint', null, hint));
}

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

function profileCard(rerender) {
  const d = ensureDraft();
  const saveBtn = h('button.primary-btn', {
    disabled: !isDirty(),
    onclick: async () => {
      const checked = validateProfile(draft);
      if (!checked.valid) { toast(checked.errors[0], 'warn'); return; }
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

  const rate = h('input', {
    type: 'number', step: '0.05', inputmode: 'decimal',
    value: d.rateKgPerWeek != null ? d.rateKgPerWeek : GOALS[d.goal]?.defaultRateKgPerWeek ?? 0,
    oninput: (e) => { d.rateKgPerWeek = Number(e.target.value); touch(); },
  });

  const activity = h('select', {
    onchange: (e) => { d.activity = e.target.value; touch(); },
  }, Object.values(ACTIVITY_LEVELS).map((l) => h('option', { value: l.key, selected: d.activity === l.key }, l.label)));

  const goal = h('select', {
    onchange: (e) => {
      d.goal = e.target.value;
      d.rateKgPerWeek = GOALS[e.target.value].defaultRateKgPerWeek;
      rate.value = d.rateKgPerWeek;   // 直接改 DOM，不重绘
      touch();
    },
  }, Object.values(GOALS).map((g) => h('option', { value: g.key, selected: d.goal === g.key }, g.label)));

  // 下方的体征小卡展示的是「已保存」的口径，避免草稿态给出误导性的数字
  const p = state.profile;
  const w = state.derived?.effectiveProfile?.weightKg ?? p.weightKg;
  const bmiVal = bmi(w, p.heightCm);
  const cat = bmiCategory(bmiVal);
  const lbm = leanBodyMass(w, state.derived?.effectiveProfile?.bodyFatPct ?? p.bodyFatPct);

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '身体信息'),
      h('div.card-head-actions', null,
        dirtyMark,
        infoTip('查看身体信息用途',
          h('p', null, '身高、体重、生日和性别用于估算静息能量。'),
          h('p', null, '填写体脂率后会改用瘦体重公式；家用体脂秤数值只适合观察趋势。')))),
    h('div.form-grid', null,
      field('性别', sexSelect),
      // 生日独占一整行：iOS Safari 的原生日期控件固有宽度大，挤在半格里容易溢出
      field('生日', birthday, '用于计算个人目标', 'span-all'),
      field('身高（cm）', numInput('heightCm', '0.5')),
      field('体重（kg）', numInput('weightKg', '0.1'),
        p.syncWeightFromApple ? '计算时采用所选日期之前最新的 Apple 健康记录' : null),
      field('体脂率（%，可选）', numInput('bodyFatPct', '0.1', '可以留空')),
      // 选项文字长（「轻度活动（每周 1-3 次）」），半格会被截断
      field('日常活动量', activity, '选择平时的生活强度', 'span-all'),
      field('目标', goal),
      field('目标速率（kg/周）', rate, '减脂填负数'),
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

function targetCard() {
  const d = state.derived;
  if (!d) return null;
  const t = d.targets;
  const energyBasis = t.tdeeSource !== 'apple'
    ? '按活动系数估算'
    : t.activeSource === 'formula-fallback'
      ? '静息采用设备记录，缺失活动按活动系数补足'
      : t.activeSource === 'device-baseline'
        ? '活动采用近期设备记录基线估算'
        : '按今日 Apple 能量记录动态估算';
  const rows = [
    ['热量', `${num(t.kcal)} kcal`, energyBasis],
    ['蛋白质', `${num(t.protein)} g`, t.proteinBasis],
    ['脂肪', `${num(t.fat)} g（参考上限 ${num(t.fatUpper || t.fat)} g）`,
      '计划值用于分配三大营养素；真正的参考上限按总热量 35% 计算'],
    ['碳水', `${num(t.carb)} g`, '总热量减去蛋白与脂肪后的剩余'],
    ['膳食纤维', `${num(t.fiber)} g`, '中国成人参考 25–30g'],
    ['钠上限', `${num(t.sodium)} mg`, '约等于 5g 食盐'],
    ['游离糖上限', `${num(t.sugar)} g`, '含糖浆、蜂蜜和果汁中的糖；低于总热量 10%'],
    ['饮水参考', `${num(t.waterMl)} ml`, '温和气候、低活动；运动或炎热天气需额外补充'],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, d.isToday ? '当前每日目标' : `${state.day} · 按当前设置估算`),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${GOALS[t.goal].label} · ${t.rateKgPerWeek > 0 ? '+' : ''}${t.rateKgPerWeek} kg/周`),
        infoTip('查看目标计算依据',
          h('ul', null, rows.map(([name, , note]) => h('li', null,
            h('strong', null, `${name}：`), note)))))),
    h('div.target-list', null, rows.map(([k, v]) => h('div.target-row', null,
      h('span.target-key', null, k),
      h('strong.target-val', null, v)))),
    t.clampedByFloor && h('p.warn-note', null,
      '注意：按目标速率算出的热量低于成人常用饮食计划下限（女 1200 / 男 1500 kcal），已自动上调；如有疾病、孕哺或特殊训练需求，请由专业人员个体化评估。'),
    t.rateWasClamped && h('p.warn-note', null,
      `你填写的 ${t.requestedRateKgPerWeek > 0 ? '+' : ''}${t.requestedRateKgPerWeek} kg/周过快，`
      + `已按体重比例和每日热量调整上限改为 ${t.rateKgPerWeek > 0 ? '+' : ''}${t.rateKgPerWeek} kg/周。`),
  );
}

function toggleCard() {
  const p = state.profile;
  const toggle = (key, label, desc) => h('label.toggle-row', null,
    h('div', null, h('strong', null, label), h('p', null, desc)),
    h('input', {
      type: 'checkbox', checked: !!p[key],
      onchange: (e) => saveProfile({ [key]: e.target.checked }),
    }));
  return h('section.card', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, '热量计算方式'),
        h('p.card-desc', null, '选择每日目标是否跟随设备记录。')),
      infoTip('查看计算方式说明',
        h('p', null, '开启设备消耗后，有可靠记录时采用静息能量与活动能量；缺失时自动回到公式估算。'),
        h('p', null, '这些选项只影响之后显示的目标，不会改动饮食记录。'))),
    toggle('useAppleEnergy', '用 Apple 健康的消耗记录算预算',
      '有设备记录时自动采用，没有时使用估算。'),
    toggle('syncWeightFromApple', '体重体脂跟随 Apple 健康',
      '按正在查看的日期，采用此前最近一次健康记录；体重变化后目标会随之更新。'),
  );
}

/**
 * 反馈草稿也放模块作用域。
 *
 * 理由和上面的身体信息表单一样：输入过程中绝不重绘。设置页任何一次 store
 * 变更（顺手拨个开关就算）都会整页重建，草稿留在这儿，写了一半的字才不会被冲掉。
 */
const feedbackDraft = { kind: FEEDBACK_KINDS[0].key, message: '' };

/** 只报条数不报数值：这份东西会进公开的 issue，体重体脂生日一个都不能带 */
function currentDiagnostics() {
  return buildDiagnostics({
    healthDays: state.healthDays.length,
    dietDays: state.dietDaily.length,
    customFoods: state.customFoods.length,
    userAgent: navigator.userAgent,
    language: navigator.language,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
  });
}

function feedbackCard() {
  const input = h('textarea.feedback-area', {
    rows: 4,
    placeholder: feedbackKind(feedbackDraft.kind).placeholder,
    value: feedbackDraft.message,
    oninput: (e) => { feedbackDraft.message = e.target.value; touch(); },
  });

  const kindSelect = h('select', {
    onchange: (e) => {
      feedbackDraft.kind = e.target.value;
      input.placeholder = feedbackKind(e.target.value).placeholder;   // 直接改 DOM，不重绘
    },
  }, FEEDBACK_KINDS.map((k) => h('option', { value: k.key, selected: feedbackDraft.kind === k.key }, k.label)));

  const submitBtn = h('button.primary-btn', {
    onclick: () => {
      const url = feedbackIssueUrl({ ...feedbackDraft, diagnostics: currentDiagnostics() });
      // noopener：新开的页面拿不到 window.opener，免得它反过来动本页
      window.open(url, '_blank', 'noopener');
    },
  }, '打开 GitHub 提交');

  const copyBtn = h('button.secondary-btn.full', {
    onclick: async () => {
      const body = buildFeedbackBody({ ...feedbackDraft, diagnostics: currentDiagnostics() });
      try {
        await navigator.clipboard.writeText(body);
        toast('已复制，可以粘到任何地方发出来', 'ok');
      } catch {
        // 剪贴板要安全上下文 + 用户手势，http 或旧浏览器上会直接抛
        toast('浏览器不给复制，请手动选中上面的文字', 'error');
      }
    },
  }, '复制反馈内容');

  function touch() {
    const empty = !feedbackDraft.message.trim();
    submitBtn.disabled = empty;
    copyBtn.disabled = empty;
  }
  touch();

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '意见反馈'),
      infoTip('查看反馈隐私说明',
        h('p', null, '提交时会附带应用版本、浏览器、语言和各类记录条数，便于排查。'),
        h('p', null, '不会附带体重、体脂、生日或具体饮食内容；打开 GitHub 后仍由你确认提交。'))),
    h('p.form-hint', null, '选择类型，写清问题，然后打开 GitHub 提交。'),
    h('div.form-grid', null, field('反馈类型', kindSelect, null, 'span-all')),
    input,
    submitBtn,
    copyBtn,
  );
}

export function renderSettings(root) {
  const rerender = () => renderSettings(root);
  clearEl(root);
  mount(root, 
    profileCard(rerender),
    targetCard(),
    toggleCard(),
    feedbackCard(),
    h('section.card.about', null,
      h('div.card-head', null, h('h3', null, '关于')),
      h('p', null, `版本 v${APP_VERSION}`),
      h('p', null, '数据保存在当前设备，不需要账号。'),
      h('p', null, '同步、补录、备份与恢复都在“数据”栏目。'),
      h('a.inline-link', { href: '#health' }, '前往数据中心'),
      h('p', null, '营养建议仅用于日常参考，不能替代医生或注册营养师。'),
    ),
  );
}
