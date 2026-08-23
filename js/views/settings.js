/** 设置：身体信息、目标、数据管理 */

import { h, clearEl, num, toast, confirmAction, download, mount } from '../lib/utils.js';
import { state, saveProfile, clearAllData, db } from '../lib/store.js';
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
      await saveProfile({ ...draft });
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
    h('div.card-head', null, h('h3', null, '身体信息'), dirtyMark),
    h('div.form-grid', null,
      field('性别', sexSelect),
      // 生日独占一整行：iOS Safari 的原生日期控件固有宽度大，挤在半格里容易溢出
      field('生日', birthday, '用于估算静息能量；本计算仅适用于成人', 'span-all'),
      field('身高（cm）', numInput('heightCm', '0.5')),
      field('体重（kg）', numInput('weightKg', '0.1'), p.syncWeightFromApple ? '已开启 Apple 健康体重同步，会以最新记录为准' : null),
      field('体脂率（%，可选）', numInput('bodyFatPct', '0.1', '不填则用 Mifflin 公式'),
        '填入后改用 Katch-McArdle；家用体脂秤（BIA）误差会影响结果，不能视为更准确'),
      // 选项文字长（「轻度活动（每周 1-3 次）」），半格会被截断
      field('日常活动量', activity, '运动消耗由 Apple 健康单独计入，这里选平时的生活强度', 'span-all'),
      field('目标', goal),
      field('目标速率（kg/周）', rate, '减脂填负数。建议不超过体重的 1%/周'),
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
  const rows = [
    ['热量', `${num(t.kcal)} kcal`, t.tdeeSource === 'apple' ? '按今日 Apple 消耗记录动态估算' : '按活动系数估算'],
    ['蛋白质', `${num(t.protein)} g`, t.proteinBasis],
    ['脂肪', `${num(t.fat)} g`, '占总热量 20%~35%'],
    ['碳水', `${num(t.carb)} g`, '总热量减去蛋白与脂肪后的剩余'],
    ['膳食纤维', `${num(t.fiber)} g`, '中国成人参考 25–30g'],
    ['钠上限', `${num(t.sodium)} mg`, '约等于 5g 食盐'],
    ['游离糖上限', `${num(t.sugar)} g`, '含糖浆、蜂蜜和果汁中的糖；低于总热量 10%'],
    ['饮水参考', `${num(t.waterMl)} ml`, '温和气候、低活动；运动或炎热天气需额外补充'],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '当前每日目标'),
      h('span.card-tag', null, `${GOALS[t.goal].label} · ${t.rateKgPerWeek > 0 ? '+' : ''}${t.rateKgPerWeek} kg/周`)),
    h('div.target-list', null, rows.map(([k, v, note]) => h('div.target-row', null,
      h('span.target-key', null, k),
      h('strong.target-val', null, v),
      h('span.target-note', null, note)))),
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
    h('div.card-head', null, h('h3', null, '动态调整')),
    toggle('useAppleEnergy', '用 Apple 健康的消耗记录算预算',
      '开启后，热量目标 = 当天静息消耗 + 活动消耗 ± 目标缺口，不额外叠加固定 TEF；每次刷新都会跟着当天的运动量变。关闭则用固定的活动系数。'),
    toggle('syncWeightFromApple', '体重体脂跟随 Apple 健康',
      '以健康 App 里最新一次记录为准，体重变了目标也会自动跟着变。'),
  );
}

function dataCard(rerender) {
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, '数据管理')),
    h('p.form-hint', null, '所有数据都存在这台设备的浏览器里。换设备或清缓存前，记得先导出备份。'),
    h('div.btn-row', null,
      h('button.secondary-btn', {
        onclick: async () => {
          const payload = await db.exportAll();
          download(`健康饮食备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
          toast('备份已下载', 'ok');
        },
      }, '导出备份'),
      h('label.secondary-btn', null, '导入备份',
        h('input', {
          type: 'file', accept: '.json', hidden: true,
          onchange: async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const counts = await db.importAll(JSON.parse(await file.text()));
              toast(`已导入：健康 ${counts.health} 天 / 饮食 ${counts.diet} 条`, 'ok');
              window.location.reload();
            } catch (err) {
              toast(`导入失败：${err.message}`, 'error');
            }
            e.target.value = '';
          },
        })),
      h('button.secondary-btn.danger', {
        onclick: async () => {
          if (!confirmAction('确定清空全部数据？此操作不可撤销，建议先导出备份。')) return;
          await clearAllData();
          resetDraft();
          toast('已清空');
          rerender();
        },
      }, '清空全部数据'),
    ),
    h('div.stat-row', null,
      h('div.stat', null, h('strong', null, state.healthDays.length), h('span', null, '健康数据天数')),
      h('div.stat', null, h('strong', null, state.dietDaily.length), h('span', null, '有饮食记录的天数')),
      h('div.stat', null, h('strong', null, state.customFoods.length), h('span', null, '自定义食物')),
    ),
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
    h('div.card-head', null, h('h3', null, '意见反馈')),
    h('p.form-hint', null, '应用本身不联网，所以反馈不会自动发出去。点下面的按钮只是打开 GitHub 的新建 issue 页面并把内容填好，你能看到全文、改完再决定要不要提交。'),
    h('div.form-grid', null, field('反馈类型', kindSelect, null, 'span-all')),
    input,
    h('p.form-hint', null, '会一并附上：应用版本、浏览器型号、语言，以及健康 / 饮食 / 自定义食物各有多少条。不含体重、体脂、生日，也不含任何一条饮食记录。'),
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
    dataCard(rerender),
    feedbackCard(),
    h('section.card.about', null,
      h('div.card-head', null, h('h3', null, '关于')),
      h('p', null, `版本 v${APP_VERSION}`),
      h('p', null, '这是一个纯本地运行的网页应用：没有账号、没有后端、不联网上传任何数据。'),
      h('p', null, '所有营养建议基于通用膳食指南与常见食物成分表，用于日常管理参考，不能替代医生或注册营养师的意见。有慢性病、正在服药或处于孕期哺乳期，请遵医嘱。'),
    ),
  );
}
