/**
 * 设置：一张分组列表，五组各自点进去。
 *
 * 原先五张表单一次全铺开，想改一个体重要先滑过一整屏跟这次无关的东西。
 * 现在每组只留一行：图标、标题、当前状态、箭头。
 *
 * 只有一种情况例外：账号冲突 / 待确认归属 / 锁定 —— 那说的是「你的数据现在有风险」，
 * 必须整屏摆出来，收进二级页面等于没提示。
 */

import { h, clearEl, toast, mount, num, infoTip, confirmAction, field } from '../lib/utils.js';
import { profileCard } from './cards/profile.js';
import { dataManagerCard } from './cards/data-manager.js';
import { state, saveProfile } from '../lib/store.js';
import { GOALS } from '../core/nutrition.js';
import {
  getAccountState, subscribeAccount, signUp, signInWithPassword, signInWithGoogle,
  resetPassword, setPassword, linkGoogle, signOutSafely, signOutPreservingLocal,
  resolveConflict, syncNow, initCloud,
} from '../lib/account.js';
import {
  APP_VERSION, FEEDBACK_KINDS, feedbackKind, buildDiagnostics, buildFeedbackBody, feedbackIssueUrl,
} from '../core/feedback.js';

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
  );
}

/**
 * 账号表单也保留模块级草稿：认证状态会经历 loading / signedIn 等阶段，
 * 不能让一次状态通知把用户刚输入的邮箱或密码清空。
 */
const accountDraft = { email: '', password: '', newPassword: '' };
let accountSlot = null;
let accountSubscribed = false;
let accountRenderPending = false;

function accountError(error) {
  return String(error?.message || error || '操作失败，请稍后重试');
}

function accountProviders(account) {
  return (account.providers || []).map((provider) => (
    typeof provider === 'string' ? provider : provider?.provider
  )).filter(Boolean);
}

function formatSyncTime(value) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '同步时间未知';
  return `上次同步 ${new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)}`;
}

function accountStatus(account) {
  if (account.phase === 'conflict' || account.syncStatus === 'conflict') return ['需要选择数据版本', 'warn'];
  if (account.syncStatus === 'syncing' || account.phase === 'loading') return ['正在同步', 'busy'];
  if (account.syncStatus === 'dirty') return ['等待上传', 'busy'];
  if (account.syncStatus === 'error' || account.phase === 'error') return ['同步异常', 'error'];
  return [formatSyncTime(account.lastSyncedAt), 'ok'];
}

async function runAccountAction(control, action, {
  success = '', clearPassword = false, clearNewPassword = false,
} = {}) {
  control.disabled = true;
  try {
    await action();
    if (clearPassword) accountDraft.password = '';
    if (clearNewPassword) accountDraft.newPassword = '';
    if (success) toast(success, 'ok');
  } catch (error) {
    console.error('账号操作失败', error);
    toast(accountError(error), 'error');
  } finally {
    if (control.isConnected) control.disabled = false;
    if (accountSlot?.isConnected) renderAccountSlot(accountSlot);
  }
}

function signedOutAccount(account) {
  const email = h('input', {
    type: 'email', autocomplete: 'email', inputmode: 'email', required: true,
    placeholder: 'name@example.com', value: accountDraft.email,
    oninput: (event) => { accountDraft.email = event.target.value; },
  });
  const password = h('input', {
    type: 'password', autocomplete: 'current-password', required: true,
    placeholder: '登录密码', value: accountDraft.password,
    oninput: (event) => { accountDraft.password = event.target.value; },
  });

  const loginBtn = h('button.primary-btn', { type: 'submit' }, '登录');
  const signupBtn = h('button.secondary-btn', {
    type: 'button',
    onclick: () => {
      const address = accountDraft.email.trim();
      if (!address || !email.checkValidity()) { toast('请填写有效邮箱', 'warn'); email.focus(); return; }
      if (accountDraft.password.length < 8) { toast('注册密码至少需要 8 位', 'warn'); password.focus(); return; }
      runAccountAction(signupBtn, () => signUp(address, accountDraft.password), {
        success: '注册请求已提交；如收到验证邮件，请先完成验证', clearPassword: true,
      });
    },
  }, '注册账号');
  const googleBtn = h('button.secondary-btn.account-google-btn', {
    type: 'button',
    onclick: () => runAccountAction(googleBtn, signInWithGoogle),
  }, '使用 Google 登录');
  const resetBtn = h('button.text-btn', {
    type: 'button',
    onclick: () => {
      const address = accountDraft.email.trim();
      if (!address || !email.checkValidity()) { toast('先填写注册邮箱，再发送重置邮件', 'warn'); email.focus(); return; }
      runAccountAction(resetBtn, () => resetPassword(address), { success: '密码重置邮件已发送' });
    },
  }, '忘记密码');

  const form = h('form.account-form', {
    onsubmit: (event) => {
      event.preventDefault();
      const address = accountDraft.email.trim();
      if (!address || !email.checkValidity()) { toast('请填写有效邮箱', 'warn'); email.focus(); return; }
      if (!accountDraft.password) { toast('请输入密码', 'warn'); password.focus(); return; }
      runAccountAction(loginBtn, () => signInWithPassword(address, accountDraft.password), {
        success: '已登录', clearPassword: true,
      });
    },
  },
  h('div.form-grid', null,
    field('邮箱', email, null, 'span-all'),
    field('密码', password, '注册新账号时请使用至少 8 位密码', 'span-all')),
  h('div.account-actions', null, loginBtn, signupBtn),
  googleBtn,
  h('div.account-link-row', null, resetBtn));

  return h('div', null,
    h('p.account-lead', null, '登录后数据会同步到账号的云端空间。'),
    form,
    /*
     * 两条账号合并的说明收进感叹号：说的是「同一个邮箱用两种方式登录会怎样」，
     * 真碰上的时候才需要，平时挂在表单下面每次都要跳过。
     */
    h('div.account-note-row', null,
      infoTip('查看多种登录方式的说明',
        h('p', null, 'Google 与邮箱密码使用同一个已验证邮箱时会归入同一账号；首次登录若本机与云端都有数据，会先让你选择，不会静默覆盖。'),
        h('p', null, '如果最先用 Google 创建账号，请先用 Google 登录，再到“管理登录方式”添加密码；不要用“注册账号”补设密码。'))),
    account.error && h('p.account-error', { role: 'alert' }, accountError(account.error)));
}

function conflictPanel(account) {
  const orphan = account.conflict?.reason === 'orphan-local-data';
  const summary = (label, value) => h('div.account-conflict-version', null,
    h('strong', null, label),
    h('span', null, value
      ? `${Number(value.healthDays) || 0} 天健康 · ${Number(value.dietEntries) || 0} 条饮食 · ${Number(value.customFoods) || 0} 个自定义食物`
      : '没有可读取的数据摘要'));
  const cloudBtn = h('button.secondary-btn', {
    type: 'button',
    onclick: () => {
      const warning = orphan
        ? '这份本机数据的账号归属无法确认。继续会清空本机记录，改用当前账号的空白云端空间；此操作不可撤销。继续吗？'
        : '改用云端数据后，这台设备当前未上传的数据会被替换。继续吗？';
      if (!confirmAction(warning)) return;
      runAccountAction(cloudBtn, () => resolveConflict('cloud'), {
        success: orphan ? '已清空未确认归属的本机数据' : '已采用云端数据',
      });
    },
  }, orphan ? '清空本机，使用空账号' : '使用云端数据');
  const deviceBtn = h('button.secondary-btn', {
    type: 'button',
    onclick: () => {
      const warning = orphan
        ? '只有在确认这份本机数据属于你时才能继续。确认后，它会归入并上传到当前账号。继续吗？'
        : '使用这台设备的数据会替换当前云端版本。继续吗？';
      if (!confirmAction(warning)) return;
      runAccountAction(deviceBtn, () => resolveConflict('device'), {
        success: orphan ? '已确认归属并上传本机数据' : '已采用并上传这台设备的数据',
      });
    },
  }, orphan ? '确认属于我并上传' : '使用这台设备的数据');
  return h('div.account-conflict', { role: 'alert' },
    h('strong', null, orphan ? '本机数据的账号归属无法确认' : '检测到两个不同的数据版本'),
    h('p', null, orphan
      ? '为防止把上一位用户的健康记录上传到你的账号，数据已锁定。请明确确认本机数据属于你，或清空本机并使用当前空账号。'
      : '为防止健康或饮食记录丢失，同步已暂停。请选择保留哪一份；另一份会被替换。'),
    h('div.account-conflict-versions', null,
      summary('这台设备', account.conflict?.device),
      summary('云端账号', account.conflict?.cloud)),
    h('div.account-actions', null, cloudBtn, deviceBtn),
    account.error && h('p.account-error', null, accountError(account.error)));
}

function signedInAccount(account) {
  const providers = accountProviders(account);
  const [statusText, statusKind] = accountStatus(account);
  const syncBtn = h('button.secondary-btn', {
    type: 'button', disabled: account.syncStatus === 'syncing',
    onclick: () => runAccountAction(syncBtn, syncNow, { success: '云端同步完成' }),
  }, account.syncStatus === 'syncing' ? '正在同步…' : '立即同步');
  const logoutBtn = h('button.secondary-btn.danger', {
    type: 'button',
    onclick: () => {
      if (!confirmAction('退出前会先确认最新数据已上传；成功后会从这台设备清除该账号的数据。快捷指令连接不会随登录状态自动撤销；如需停止上传，请先到“数据”页撤销设备。继续吗？')) return;
      runAccountAction(logoutBtn, signOutSafely, { success: '已安全退出账号' });
    },
  }, '安全退出');
  const preserveLogoutBtn = account.syncStatus === 'error' && h('button.text-btn.danger', {
    type: 'button',
    onclick: () => {
      if (!confirmAction('这会退出账号，但不会删除或上传当前本机记录。记录会锁定在这台设备上，只能重新登录原账号后恢复；期间不能切换给其他账号使用。继续吗？')) return;
      runAccountAction(preserveLogoutBtn, signOutPreservingLocal, {
        success: '已退出；本机记录已锁定保留',
      });
    },
  }, '保留本机记录并退出');

  const password = h('input', {
    type: 'password', autocomplete: 'new-password', minlength: 8,
    placeholder: '至少 8 位新密码', value: accountDraft.newPassword,
    oninput: (event) => { accountDraft.newPassword = event.target.value; },
  });
  const passwordBtn = h('button.secondary-btn.full', {
    type: 'button',
    onclick: () => {
      if (accountDraft.newPassword.length < 8) { toast('新密码至少需要 8 位', 'warn'); password.focus(); return; }
      runAccountAction(passwordBtn, () => setPassword(accountDraft.newPassword), {
        success: providers.includes('email') ? '登录密码已更新' : '已为此账号设置邮箱登录密码',
        clearNewPassword: true,
      });
    },
  }, providers.includes('email') ? '更换登录密码' : '添加邮箱密码登录');
  const googleBtn = !providers.includes('google') && h('button.secondary-btn.full', {
    type: 'button',
    onclick: () => runAccountAction(googleBtn, linkGoogle),
  }, '绑定 Google 登录');

  return h('div', null,
    h('div.account-identity', null,
      h('div', null,
        h('strong', null, account.user?.email || '已登录账号'),
        h('span', null, providers.length
          ? `登录方式：${providers.map((p) => (p === 'google' ? 'Google' : '邮箱密码')).join('、')}`
          : '账号已连接')),
      h(`span.account-sync-badge.${statusKind}`, { role: 'status', 'aria-live': 'polite' }, statusText)),
    (account.phase === 'conflict' || account.syncStatus === 'conflict')
      ? conflictPanel(account)
      : h('div', null,
        h('div.account-actions', null, syncBtn, logoutBtn),
        preserveLogoutBtn && h('div.account-offline-signout', null,
          h('span', null, '云同步失败时仍可退出；本机记录会锁定保留，不会交给其他账号。'),
          preserveLogoutBtn)),
    h('p.privacy-note', null, '正常安全退出会在确认待上传修改后清除本机账号记录；“保留本机记录并退出”则只锁定、不删除。已连接的快捷指令会继续写入原账号，需在数据页单独撤销。'),
    h('details.account-linking', null,
      h('summary', null, '管理登录方式'),
      h('p', null, '设置密码后可以用相同邮箱登录；绑定 Google 后也仍是同一个账号。'),
      field(providers.includes('email') ? '新密码' : '设置邮箱登录密码', password, null, 'span-all'),
      passwordBtn,
      googleBtn,
      providers.includes('google') && h('p.account-provider-ok', null, 'Google 登录已绑定')),
    account.error && account.phase !== 'conflict'
      && h('p.account-error', { role: 'alert' }, accountError(account.error)));
}

function lockedAccount(account) {
  const preservedExit = account.transitionReason === 'preserved-signout';
  return h('div', null,
    h('div.account-conflict', { role: 'alert' },
      h('strong', null, preservedExit
        ? '已退出，原账号记录已在本机锁定保留'
        : '原账号的数据仍锁定在这台设备上'),
      h('p', null, preservedExit
        ? '由于云端同步未完成，应用没有删除这份记录。重新登录原来的邮箱或 Google 账号即可恢复并继续同步；其他账号不能接管。'
        : '登录状态意外失效时，应用不会清除或展示原账号的数据，也不会允许另一个账号接管。请用原来的邮箱或 Google 账号重新登录。'),
      account.error && h('p.account-error', null, accountError(account.error))),
    signedOutAccount(account));
}

function unavailableLockedAccount(account) {
  const retryBtn = h('button.secondary-btn', {
    type: 'button',
    onclick: () => runAccountAction(retryBtn, async () => {
      const next = await initCloud();
      if (next.transitionReason === 'auth-unavailable') {
        throw new Error(next.error || '账号服务仍不可用，请检查网络后重试');
      }
      return next;
    }, { success: '账号服务已重新连接' }),
  }, '重新连接账号服务');
  return h('div.account-conflict', { role: 'alert' },
    h('strong', null, '云账号暂时不可用，原账号数据已锁定'),
    h('p', null, '应用不会把这份账号数据当作访客记录展示或交给另一个账号。网络恢复后可直接重新连接，再用原账号验证，无需刷新整页。'),
    account.error && h('p.account-error', null, accountError(account.error)),
    h('div.account-actions', null,
      retryBtn,
      h('a.inline-link', { href: 'docs/CLOUD_SYNC.md', target: '_blank', rel: 'noopener' }, '查看部署检查')));
}

function accountCard() {
  const account = getAccountState();
  // phase=local 也可能只是配置正确但 SDK/网络暂时不可用；不能误报成管理员未配置。
  const configured = account.configured !== false;
  const actionableConflict = (account.status === 'conflict' || account.phase === 'conflict'
    || account.syncStatus === 'conflict') && account.user && account.conflict;
  let content;
  if (account.status === 'locked' && account.transitionReason === 'auth-unavailable') {
    content = unavailableLockedAccount(account);
  } else if (account.status === 'locked') {
    content = lockedAccount(account);
  } else if (actionableConflict) {
    content = signedInAccount(account);
  } else if (account.ownershipPending === true) {
    const preservingExit = account.transitionReason === 'preserved-signout';
    content = h('div.account-loading', { role: 'status', 'aria-live': 'polite' },
      h('strong', null, preservingExit
        ? '正在保留本机记录并退出…'
        : account.transitionReason === 'safe-signout' ? '正在安全退出…' : '正在确认账号数据归属…'),
      h('span', null, '完成前暂不提供同步、退出或登录方式修改，避免与账号切换并发。'));
  } else if (!configured) {
    content = h('div.account-local', null,
      h('p.account-lead', null, '当前是本地模式：全部数据只保存在这台设备的浏览器里，应用仍可完整使用。'),
      h('p.form-hint', null, '站点管理员配置 Supabase 后，邮箱密码与 Google 登录才会出现；页面不会要求或保存服务端密钥。'),
      account.error && !accountError(account.error).includes('尚未配置')
        && h('p.account-error', { role: 'status' }, accountError(account.error)),
      h('a.inline-link', { href: 'docs/CLOUD_SYNC.md', target: '_blank', rel: 'noopener' }, '查看云同步配置说明'));
  } else if (account.user) {
    content = signedInAccount(account);
  } else if (account.phase === 'loading') {
    content = h('div.account-loading', { role: 'status', 'aria-live': 'polite' },
      h('strong', null, '正在恢复登录状态…'),
      h('span', null, '本地数据不会在账号确认前上传或替换。'));
  } else {
    content = signedOutAccount(account);
  }
  return h('section.card.account-card', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, '账号与云同步'),
        h('p.card-desc', null, account.status === 'locked'
          ? '原账号数据正在隐私锁保护下。'
          : configured ? '跨设备保存，每个账号的数据彼此隔离。' : '无需登录也能继续使用。')),
      h('span.card-tag', null, account.status === 'locked'
        ? '数据锁定'
        : configured ? (account.user ? '账号云同步' : '未登录') : '本地模式')),
    content);
}

function renderAccountSlot(slot) {
  accountRenderPending = false;
  clearEl(slot);
  slot.append(accountCard());
}

function ensureAccountSubscription(slot) {
  accountSlot = slot;
  slot.addEventListener('focusout', () => setTimeout(() => {
    if (accountRenderPending && accountSlot === slot && !slot.contains(document.activeElement)) {
      renderAccountSlot(slot);
    }
  }, 0));
  if (accountSubscribed) return;
  accountSubscribed = true;
  subscribeAccount(() => {
    if (!accountSlot?.isConnected) return;
    if (accountSlot.contains(document.activeElement)) {
      accountRenderPending = true;
      return;
    }
    renderAccountSlot(accountSlot);
  });
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

/*
 * 反馈和「关于」合成一张卡。
 * 「关于」只有四行字，单独占一张让本来就三屏多的抽屉又长一截；
 * 两者都属于「这个应用本身的事」，放一起也说得通。
 */
function feedbackCard({ about = null } = {}) {
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
      h('h3', null, '关于与反馈'),
      infoTip('查看反馈隐私说明',
        h('p', null, '提交时会附带应用版本、浏览器、语言和各类记录条数，便于排查。'),
        h('p', null, '不会附带体重、体脂、生日或具体饮食内容；打开 GitHub 后仍由你确认提交。'))),
    about,
    h('div.form-grid', null, field('反馈类型', kindSelect, null, 'span-all')),
    input,
    submitBtn,
    copyBtn,
  );
}

/* ---------------------------------------------------------------- 分组列表 */

/*
 * 设置主页是一张分组列表，不再把五张表单一次全铺开。
 *
 * 原先一进来就是身体信息的十个输入框、账号表单、数据管理、开关和关于——
 * 想改一个体重要先滑过一整屏跟这次无关的东西，而每一块都带着自己的说明文字。
 * 现在每组只留一行：图标、标题、当前状态、箭头；点进去才是那张表单。
 *
 * 状态那一列不是装饰：它让「不用点进去也知道现在设成什么了」成立，
 * 这正是分组列表比一堆折叠面板好用的地方。
 */
let openSection = null;

const SECTION_ICON = {
  body: 'M12 3.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4ZM12 8.4v7M8 10.5l4-1.4 4 1.4M9.5 20.4 12 15.4l2.5 5',
  account: 'M12 12.4a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.4c.8-3.4 3.8-5.4 7.5-5.4s6.7 2 7.5 5.4',
  data: 'M12 3.6c4.1 0 7.4 1.2 7.4 2.7S16.1 9 12 9 4.6 7.8 4.6 6.3 7.9 3.6 12 3.6ZM4.6 6.3v11.4c0 1.5 3.3 2.7 7.4 2.7s7.4-1.2 7.4-2.7V6.3M4.6 12c0 1.5 3.3 2.7 7.4 2.7s7.4-1.2 7.4-2.7',
  calc: 'M6.4 3.6h11.2c.9 0 1.6.7 1.6 1.6v13.6c0 .9-.7 1.6-1.6 1.6H6.4c-.9 0-1.6-.7-1.6-1.6V5.2c0-.9.7-1.6 1.6-1.6ZM8 7.6h8M8 12h2.5M8 16.2h2.5M14 12h2M14 16.2h2',
  about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.4v.1',
};

function sectionIcon(key) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'set-icon');
  el.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', SECTION_ICON[key] || SECTION_ICON.about);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  el.append(path);
  return el;
}

/** 每行右边那句「现在设成什么了」。不用点进去就知道 */
function sectionStatus(key, account) {
  const p = state.profile;
  if (key === 'body') {
    const weight = state.derived?.effectiveProfile?.weightKg ?? p.weightKg;
    const goal = GOALS[p.goal]?.label || '维持';
    return weight > 0 ? `${goal} · ${num(weight, 1)} kg` : goal;
  }
  if (key === 'account') {
    if (!account.configured) return '本地模式';
    if (!account.user) return '未登录';
    const [text] = accountStatus(account);
    return text;
  }
  if (key === 'data') return '备份、导入、补录';
  if (key === 'calc') {
    return p.useAppleEnergy ? '跟随设备消耗' : '按公式估算';
  }
  return `v${APP_VERSION}`;
}

function sectionRow(section, account, rerender) {
  return h('button.set-row', {
    type: 'button',
    onclick: () => { openSection = section.key; rerender(); },
  },
  sectionIcon(section.key),
  h('span.set-title', null, section.label),
  h('span.set-status', null, sectionStatus(section.key, account)),
  h('span.set-chevron', { 'aria-hidden': 'true' }, '›'));
}

const SECTIONS = [
  { key: 'body', label: '身体与目标' },
  { key: 'account', label: '账号与同步' },
  { key: 'data', label: '数据管理' },
  { key: 'calc', label: '计算与显示' },
  { key: 'about', label: '关于与反馈' },
];

function backBar(label, rerender) {
  return h('div.set-back', null,
    h('button.set-back-btn', {
      type: 'button',
      onclick: () => { openSection = null; rerender(); },
    }, '‹ 设置'),
    h('strong', null, label));
}

export function renderSettings(root) {
  const rerender = () => renderSettings(root);
  clearEl(root);
  const slot = h('div.account-slot');
  renderAccountSlot(slot);
  ensureAccountSubscription(slot);
  const account = getAccountState();
  /*
   * 账号冲突、待确认归属、锁定这几种情况必须整屏摆出来，不能收进某一组里：
   * 它们说的是「你的数据现在有风险」，藏在二级页面等于没提示。
   */
  const protectedAccountData = account.ownershipPending === true
    || account.status === 'locked'
    || (account.status === 'loading' && !account.user)
    || (account.status === 'conflict' && account.conflict?.reason === 'orphan-local-data');
  if (protectedAccountData) {
    openSection = null;
    mount(root, slot);
    return;
  }
  const accountCopy = account.user
    ? '数据保存在本机，并同步到当前登录账号的专属云端空间。'
    : account.configured
      ? '未登录时数据只保存在当前设备；登录后可同步到账号专属云端空间。'
      : '当前为本地模式，数据只保存在这台设备的浏览器里。';

  const section = SECTIONS.find((x) => x.key === openSection);
  if (section) {
    const body = {
      body: () => profileCard(rerender),
      account: () => slot,
      data: () => dataManagerCard(rerender),
      calc: () => toggleCard(),
      about: () => feedbackCard({
        about: h('div.about-block', null,
          h('p', null, `版本 v${APP_VERSION}`),
          h('p', null, accountCopy),
          h('p', null, '营养建议仅用于日常参考，不能替代医生或注册营养师。')),
      }),
    }[section.key];
    mount(root, backBar(section.label, rerender), body());
    return;
  }

  mount(root, h('div.set-list', null, SECTIONS.map((x) => sectionRow(x, account, rerender))));
}
