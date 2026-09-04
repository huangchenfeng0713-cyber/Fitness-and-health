/**
 * 意见反馈
 *
 * 这个应用没有后端、不做任何上传（见 README 的隐私说明），所以「提交反馈」
 * 只能是把内容交回给用户、由用户自己发出去：这里负责拼出 issue 的标题、正文
 * 和新建 issue 的链接，用户在 GitHub 页面上看到全文、能改，点了提交才真的发出去。
 *
 * 纯函数模块，不碰 DOM —— 模板、URL 拼装、附带哪些环境信息都要能单测。
 */

/** 与 package.json 的 version 保持一致（没有构建步骤，只能手动同步，test/feedback.test.js 会盯着） */
export const APP_VERSION = '3.6.1';

export const FEEDBACK_REPO = 'huangchenfeng0713-cyber/Fitness-and-health';

/**
 * 正文过长时 GitHub 会直接返回 414，链接也可能被各家 App 的内置浏览器截断。
 * 6000 是留了余量的保守值，超出就截断正文（完整内容仍可用「复制」拿到）。
 */
export const MAX_URL_LENGTH = 6000;

export const TRUNCATION_NOTE = '\n\n（内容过长已截断，请在这里补全）';

/** UA 字符串偶尔会被某些浏览器塞得很长，掐掉尾巴免得挤占正文额度 */
const MAX_UA_LENGTH = 180;

export const FEEDBACK_KINDS = [
  {
    key: 'bug',
    label: '功能有问题',
    labels: 'bug',
    lead: '问题描述',
    extras: ['复现步骤', '期望的结果'],
    placeholder: '在哪一页、点了什么、结果出现了什么？',
  },
  {
    key: 'food',
    label: '食物数据不对 / 想加食物',
    labels: 'food-data',
    lead: '食物与问题',
    extras: ['正确的数值与来源'],
    placeholder: '食物名称，以及哪一项不对（热量 / 蛋白 / 份量…）。想新增的话写清品牌和规格。',
  },
  {
    key: 'idea',
    label: '功能建议',
    labels: 'enhancement',
    lead: '想要的功能',
    extras: ['它能解决什么问题'],
    placeholder: '希望多出什么功能？现在是怎么绕过去的？',
  },
];

const DEFAULT_KIND = FEEDBACK_KINDS[0];

export function feedbackKind(key) {
  return FEEDBACK_KINDS.find((k) => k.key === key) || DEFAULT_KIND;
}

/**
 * 环境信息。
 *
 * 这里是白名单式地挑字段，而不是把传进来的对象摊开：调用方手边就是整个
 * state，一旦写成展开，体重、体脂、生日这些会被顺手带进公开的 issue 里。
 * 只要数量，不要数值。
 */
export function buildDiagnostics(input = {}) {
  const count = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  return {
    appVersion: String(input.appVersion || APP_VERSION),
    healthDays: count(input.healthDays),
    dietDays: count(input.dietDays),
    customFoods: count(input.customFoods),
    userAgent: String(input.userAgent || '').slice(0, MAX_UA_LENGTH),
    language: String(input.language || ''),
    standalone: input.standalone === true,
  };
}

export function formatDiagnostics(diag) {
  if (!diag) return '';
  const rows = [
    ['应用版本', diag.appVersion],
    ['数据规模', `健康 ${diag.healthDays} 天 / 饮食 ${diag.dietDays} 天 / 自定义食物 ${diag.customFoods} 种`],
    ['浏览器', diag.userAgent],
    ['语言', diag.language],
    ['加到主屏幕运行', diag.standalone ? '是' : '否'],
  ];
  return rows.filter(([, v]) => v !== '' && v != null).map(([k, v]) => `- ${k}：${v}`).join('\n');
}

/** 标题取正文首行，太长会把 issue 列表撑得没法看，掐到 60 字 */
export function buildFeedbackTitle({ kind, message = '' } = {}) {
  const k = feedbackKind(kind);
  const first = String(message).split('\n').map((s) => s.trim()).find(Boolean) || '';
  const summary = first.length > 60 ? `${first.slice(0, 60)}…` : first;
  return summary ? `[${k.label}] ${summary}` : `[${k.label}]`;
}

export function buildFeedbackBody({ kind, message = '', diagnostics = null } = {}) {
  const k = feedbackKind(kind);
  const text = String(message).trim();
  const blocks = [`## ${k.lead}\n\n${text || '（请填写）'}`];
  for (const extra of k.extras) blocks.push(`## ${extra}\n\n（请补充）`);
  const diag = formatDiagnostics(diagnostics);
  if (diag) blocks.push(`## 环境信息\n\n${diag}`);
  return blocks.join('\n\n');
}

/**
 * 新建 issue 的链接。正文超出 MAX_URL_LENGTH 时按字符往回削，
 * 直到整条 URL 塞得下为止。
 */
export function feedbackIssueUrl({ kind, message = '', diagnostics = null, repo = FEEDBACK_REPO } = {}) {
  const k = feedbackKind(kind);
  const make = (text) => {
    const title = buildFeedbackTitle({ kind, message: text });
    const body = buildFeedbackBody({ kind, message: text, diagnostics });
    return `https://github.com/${repo}/issues/new`
      + `?title=${encodeURIComponent(title)}`
      + `&labels=${encodeURIComponent(k.labels)}`
      + `&body=${encodeURIComponent(body)}`;
  };

  let text = String(message);
  if (make(text).length <= MAX_URL_LENGTH) return make(text);

  while (text.length > 0) {
    const excess = make(text + TRUNCATION_NOTE).length - MAX_URL_LENGTH;
    if (excess <= 0) break;
    // 一个中文字符编码后是 9 个字符，按这个上界估算要削掉多少，保证每轮都在缩短
    text = text.slice(0, Math.max(0, text.length - Math.max(1, Math.ceil(excess / 9))));
  }
  return make(text + TRUNCATION_NOTE);
}
