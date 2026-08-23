import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APP_VERSION, FEEDBACK_KINDS, FEEDBACK_REPO, MAX_URL_LENGTH, TRUNCATION_NOTE,
  feedbackKind, buildDiagnostics, formatDiagnostics,
  buildFeedbackTitle, buildFeedbackBody, feedbackIssueUrl,
} from '../js/core/feedback.js';

const diag = buildDiagnostics({
  healthDays: 128, dietDays: 40, customFoods: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  language: 'zh-CN', standalone: true,
});

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** 从 issue 链接里把某个查询参数解出来 */
const param = (url, key) => new URL(url).searchParams.get(key);

test('版本号与 package.json 一致', () => {
  // 没有构建步骤，版本号只能手抄一份，靠这条盯着它别漂移
  assert.equal(APP_VERSION, pkg.version);
});

test('版本号在设置页、README 与离线缓存中同步标注', () => {
  const settings = readFileSync(new URL('../js/views/settings.js', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(settings, /版本 v\$\{APP_VERSION\}/, '设置页“关于”必须展示运行时版本号');
  assert.ok(readme.includes(`当前版本：**v${pkg.version}**`), 'README 版本号未同步');
  assert.ok(serviceWorker.includes(`health-diet-v${pkg.version}`), '离线缓存版本号未同步');
});

test('反馈类型齐全，未知 key 回落到第一个', () => {
  assert.deepEqual(FEEDBACK_KINDS.map((k) => k.key), ['bug', 'food', 'idea']);
  for (const k of FEEDBACK_KINDS) {
    assert.ok(k.label && k.labels && k.lead, `${k.key} 字段不全`);
    assert.ok(Array.isArray(k.extras), `${k.key} 的 extras 应是数组`);
    assert.ok(k.placeholder.length > 5, `${k.key} 缺输入提示`);
  }
  assert.equal(feedbackKind('idea').key, 'idea');
  assert.equal(feedbackKind('这个类型不存在').key, 'bug', '未知类型应回落，不能崩');
  assert.equal(feedbackKind(undefined).key, 'bug');
});

test('环境信息按白名单挑字段，不会把身体数据带出去', () => {
  // 调用方手边就是整个 state，这里必须是「挑」而不是「摊开」
  const leaky = buildDiagnostics({
    healthDays: 10, dietDays: 2, customFoods: 0,
    userAgent: 'UA', language: 'zh-CN', standalone: false,
    // 下面这些一个都不该出现在结果里
    weightKg: 59, bodyFatPct: 18.1, birthday: '1995-03-01', sex: 'female',
    heightCm: 162, profile: { weightKg: 59 }, entries: [{ name: '珍珠奶茶' }],
  });
  const serialized = JSON.stringify(leaky);
  for (const secret of ['59', '18.1', '1995-03-01', 'female', '162', '珍珠奶茶']) {
    assert.ok(!serialized.includes(secret), `环境信息里泄漏了「${secret}」：${serialized}`);
  }
  assert.deepEqual(Object.keys(leaky).sort(),
    ['appVersion', 'customFoods', 'dietDays', 'healthDays', 'language', 'standalone', 'userAgent']);
});

test('条数只认非负整数，脏数据不会写成 NaN', () => {
  const d = buildDiagnostics({ healthDays: -3, dietDays: 'abc', customFoods: 2.7 });
  assert.equal(d.healthDays, 0);
  assert.equal(d.dietDays, 0);
  assert.equal(d.customFoods, 3);
  assert.equal(d.standalone, false, '没传就不能算作主屏幕运行');
});

test('超长 UA 会被截断，免得挤占正文额度', () => {
  const d = buildDiagnostics({ userAgent: 'x'.repeat(5000) });
  assert.ok(d.userAgent.length <= 180, `UA 长度 ${d.userAgent.length}`);
});

test('环境信息渲染成 markdown 列表，空字段不占行', () => {
  const text = formatDiagnostics(diag);
  assert.ok(text.includes(`- 应用版本：${APP_VERSION}`));
  assert.match(text, /- 数据规模：健康 128 天 \/ 饮食 40 天 \/ 自定义食物 3 种/);
  assert.match(text, /- 加到主屏幕运行：是/);

  const bare = formatDiagnostics(buildDiagnostics({ healthDays: 1 }));
  assert.ok(!bare.includes('- 浏览器：'), `UA 为空时不该留空行：${bare}`);
  assert.ok(!bare.includes('- 语言：'));
  assert.equal(formatDiagnostics(null), '');
});

test('标题带类型前缀，取正文首行且不过长', () => {
  assert.equal(buildFeedbackTitle({ kind: 'bug', message: '点了保存没反应' }), '[功能有问题] 点了保存没反应');
  assert.equal(buildFeedbackTitle({ kind: 'idea', message: '' }), '[功能建议]', '没写内容时只留前缀');
  assert.equal(buildFeedbackTitle({ kind: 'food', message: '\n\n  蜜雪的柠檬水热量不对  \n后面还有很多' }),
    '[食物数据不对 / 想加食物] 蜜雪的柠檬水热量不对', '取第一个非空行并去掉首尾空白');

  const long = buildFeedbackTitle({ kind: 'bug', message: '很长'.repeat(100) });
  assert.ok(long.length <= 70, `标题 ${long.length} 字太长`);
  assert.ok(long.endsWith('…'), '截断要有省略号');
});

test('正文按类型给出不同的模板段落', () => {
  const bug = buildFeedbackBody({ kind: 'bug', message: '点了保存没反应', diagnostics: diag });
  assert.match(bug, /## 问题描述\n\n点了保存没反应/);
  assert.match(bug, /## 复现步骤/);
  assert.match(bug, /## 期望的结果/);
  assert.match(bug, /## 环境信息/);

  const food = buildFeedbackBody({ kind: 'food', message: '热量偏高' });
  assert.match(food, /## 食物与问题/);
  assert.match(food, /## 正确的数值与来源/);
  assert.ok(!food.includes('复现步骤'), '食物反馈不该出现 bug 的段落');
  assert.ok(!food.includes('## 环境信息'), '没传环境信息就不该有这一段');

  assert.match(buildFeedbackBody({ kind: 'idea' }), /## 想要的功能\n\n（请填写）/);
});

test('issue 链接指向本仓库，参数编码正确', () => {
  const url = feedbackIssueUrl({ kind: 'bug', message: '搜索 & 记录都不对 #3', diagnostics: diag });
  assert.ok(url.startsWith(`https://github.com/${FEEDBACK_REPO}/issues/new?`), url.slice(0, 80));

  // & 和 # 不转义的话会把后面的参数整段吃掉
  assert.equal(param(url, 'title'), '[功能有问题] 搜索 & 记录都不对 #3');
  assert.equal(param(url, 'labels'), 'bug');
  assert.match(param(url, 'body'), /搜索 & 记录都不对 #3/);
  assert.match(param(url, 'body'), /## 环境信息/);
});

test('每种类型带上自己的 label', () => {
  for (const k of FEEDBACK_KINDS) {
    assert.equal(param(feedbackIssueUrl({ kind: k.key, message: 'x' }), 'labels'), k.labels);
  }
});

test('正文过长会截断到链接塞得下，并留提示', () => {
  const url = feedbackIssueUrl({ kind: 'bug', message: '这是一段很长的反馈。'.repeat(3000), diagnostics: diag });
  assert.ok(url.length <= MAX_URL_LENGTH, `URL 长度 ${url.length} 超过上限 ${MAX_URL_LENGTH}`);
  assert.ok(param(url, 'body').includes(TRUNCATION_NOTE.trim()), '截断后要告诉用户内容不全');
  assert.match(param(url, 'body'), /## 环境信息/, '截断的是用户正文，环境信息要保住');
});

test('纯 ASCII 的超长正文同样能塞下（编码后长度差 9 倍）', () => {
  const url = feedbackIssueUrl({ kind: 'idea', message: 'a'.repeat(60000), diagnostics: diag });
  assert.ok(url.length <= MAX_URL_LENGTH, `URL 长度 ${url.length}`);
});

test('刚好不超长的正文不会被无谓截断', () => {
  const url = feedbackIssueUrl({ kind: 'bug', message: '短反馈', diagnostics: diag });
  assert.ok(!param(url, 'body').includes(TRUNCATION_NOTE.trim()));
  assert.equal(param(url, 'body'), buildFeedbackBody({ kind: 'bug', message: '短反馈', diagnostics: diag }));
});

test('什么都不传也能拼出可用的链接', () => {
  const url = feedbackIssueUrl();
  assert.ok(url.startsWith('https://github.com/'));
  assert.equal(param(url, 'title'), '[功能有问题]');
  assert.match(param(url, 'body'), /## 问题描述/);
});
