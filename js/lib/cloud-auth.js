import {
  SUPABASE_ESM_URL, inspectCloudConfig,
} from '../config/cloud.js';

const AUTH_ERROR_MESSAGES = {
  invalid_credentials: '邮箱或密码错误',
  email_not_confirmed: '请先打开验证邮件确认邮箱',
  user_already_exists: '这个邮箱已经注册，请直接登录或使用 Google 登录',
  weak_password: '密码强度不足，请至少使用 8 位字符',
  over_email_send_rate_limit: '邮件发送过于频繁，请稍后再试',
  over_request_rate_limit: '操作过于频繁，请稍后再试',
};

export class CloudAuthError extends Error {
  constructor(message, code = 'auth_error', cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CloudAuthError';
    this.code = code;
  }
}

function authError(error, fallback = '账号操作失败，请稍后重试') {
  if (error instanceof CloudAuthError) return error;
  const code = error?.code || error?.name || 'auth_error';
  const normalized = String(code).toLowerCase();
  let message = AUTH_ERROR_MESSAGES[normalized];
  const raw = String(error?.message || '');
  if (!message && /invalid login credentials/i.test(raw)) message = AUTH_ERROR_MESSAGES.invalid_credentials;
  if (!message && /email not confirmed/i.test(raw)) message = AUTH_ERROR_MESSAGES.email_not_confirmed;
  return new CloudAuthError(message || raw || fallback, normalized, error);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new CloudAuthError('请输入有效的邮箱地址', 'invalid_email');
  return email;
}

function normalizePassword(value) {
  const password = String(value || '');
  if (password.length < 8) throw new CloudAuthError('密码至少需要 8 位字符', 'weak_password');
  if (password.length > 72) throw new CloudAuthError('密码不能超过 72 位字符', 'weak_password');
  return password;
}

function credentials(emailOrOptions, password) {
  if (emailOrOptions && typeof emailOrOptions === 'object') {
    return {
      email: normalizeEmail(emailOrOptions.email),
      password: normalizePassword(emailOrOptions.password),
      redirectTo: emailOrOptions.redirectTo,
    };
  }
  return { email: normalizeEmail(emailOrOptions), password: normalizePassword(password) };
}

function defaultRedirectTo() {
  if (typeof location === 'undefined') return undefined;
  const target = new URL(location.href);
  target.searchParams.delete('code');
  target.searchParams.delete('error');
  target.searchParams.delete('error_code');
  target.searchParams.delete('error_description');
  target.hash = 'settings';
  return target.href;
}

export function authProviders(user) {
  if (!user) return [];
  const providers = new Set();
  for (const identity of user.identities || []) {
    if (identity?.provider) providers.add(identity.provider);
  }
  const metadataProviders = user.app_metadata?.providers;
  if (Array.isArray(metadataProviders)) metadataProviders.forEach((provider) => providers.add(provider));
  if (user.app_metadata?.provider) providers.add(user.app_metadata.provider);
  return [...providers].sort();
}

async function loadCreateClient() {
  const globalCreateClient = globalThis.supabase?.createClient;
  if (typeof globalCreateClient === 'function') return globalCreateClient;
  const module = await import(SUPABASE_ESM_URL);
  if (typeof module.createClient !== 'function') throw new Error('Supabase SDK 未提供 createClient');
  return module.createClient;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new CloudAuthError(message, 'auth_timeout')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function createCloudAuth({
  client = null, createClient = null, config = {}, timeoutMs = 8000,
} = {}) {
  const listeners = new Set();
  const inspection = inspectCloudConfig(config);
  let supabase = client;
  let initialized = false;
  let authSubscription = null;

  const state = {
    configured: Boolean(client) || inspection.configured,
    available: false,
    session: null,
    user: null,
    providers: [],
    error: inspection.configured || client ? null : inspection.reason,
  };

  function snapshot() {
    return { ...state, providers: [...state.providers] };
  }

  function emit(event = 'STATE_CHANGED') {
    const value = snapshot();
    for (const listener of listeners) {
      try { listener(value, event); } catch (err) { console.error('账号状态监听器出错', err); }
    }
  }

  function updateSession(session, event) {
    state.session = session || null;
    state.user = session?.user || null;
    state.providers = authProviders(state.user);
    state.error = null;
    emit(event);
  }

  function updateUser(user, event) {
    state.user = user || null;
    if (state.session && user) state.session = { ...state.session, user };
    state.providers = authProviders(state.user);
    state.error = null;
    emit(event);
  }

  async function initialize() {
    if (initialized) return snapshot();
    initialized = true;
    if (!state.configured) return snapshot();

    try {
      if (!supabase) {
        const factory = createClient || await withTimeout(
          loadCreateClient(), timeoutMs, '云账号组件加载超时，本机模式仍可使用',
        );
        supabase = await factory(
          inspection.config.supabaseUrl,
          inspection.config.supabasePublishableKey,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              flowType: 'pkce',
            },
          },
        );
      }
      if (!supabase?.auth) throw new Error('Supabase Auth 不可用');
      state.available = true;

      const listenerResult = supabase.auth.onAuthStateChange?.((event, session) => {
        updateSession(session, event);
      });
      authSubscription = listenerResult?.data?.subscription || listenerResult?.subscription || null;

      const { data, error } = await withTimeout(
        supabase.auth.getSession(), timeoutMs, '云账号连接超时，本机模式仍可使用',
      );
      if (error) throw error;
      updateSession(data?.session || null, 'INITIAL_SESSION');
      return snapshot();
    } catch (error) {
      authSubscription?.unsubscribe?.();
      authSubscription = null;
      state.available = false;
      state.error = authError(error, '云账号服务暂时不可用，本机数据不受影响').message;
      emit('AUTH_UNAVAILABLE');
      return snapshot();
    }
  }

  function ensureAvailable() {
    if (!initialized || !state.available || !supabase?.auth) {
      throw new CloudAuthError(
        state.error || '云账号服务尚未配置，本机数据仍可正常使用',
        'cloud_unavailable',
      );
    }
  }

  async function runAuth(action, fallback, { acceptUser = true } = {}) {
    ensureAvailable();
    try {
      const result = await action();
      if (result?.error) throw result.error;
      if (result?.data?.session) updateSession(result.data.session, 'SIGNED_IN');
      else if (acceptUser && result?.data?.user) updateUser(result.data.user, 'USER_UPDATED');
      return result?.data ?? result;
    } catch (error) {
      throw authError(error, fallback);
    }
  }

  async function signUpWithPassword(emailOrOptions, password) {
    const input = credentials(emailOrOptions, password);
    return runAuth(() => supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: input.redirectTo || defaultRedirectTo(),
      },
    }), '注册失败，请稍后重试', { acceptUser: false });
  }

  async function signInWithPassword(emailOrOptions, password) {
    const input = credentials(emailOrOptions, password);
    return runAuth(() => supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    }), '登录失败，请稍后重试');
  }

  async function signInWithGoogle(options = {}) {
    const redirectTo = options.redirectTo || defaultRedirectTo();
    return runAuth(() => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : {},
    }), 'Google 登录启动失败，请稍后重试', { acceptUser: false });
  }

  async function linkGoogle(options = {}) {
    if (!state.user) throw new CloudAuthError('请先登录账号再关联 Google', 'not_signed_in');
    const redirectTo = options.redirectTo || defaultRedirectTo();
    return runAuth(() => supabase.auth.linkIdentity({
      provider: 'google',
      options: redirectTo ? { redirectTo } : {},
    }), 'Google 账号关联失败，请稍后重试');
  }

  async function setPassword(passwordOrOptions) {
    if (!state.user) throw new CloudAuthError('请先登录账号再设置密码', 'not_signed_in');
    const password = normalizePassword(
      typeof passwordOrOptions === 'object' ? passwordOrOptions.password : passwordOrOptions,
    );
    return runAuth(() => supabase.auth.updateUser({ password }), '密码设置失败，请稍后重试');
  }

  async function resetPassword(emailOrOptions) {
    const email = normalizeEmail(
      typeof emailOrOptions === 'object' ? emailOrOptions.email : emailOrOptions,
    );
    const redirectTo = (typeof emailOrOptions === 'object' && emailOrOptions.redirectTo)
      || defaultRedirectTo();
    return runAuth(() => supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : {},
    ), '重置邮件发送失败，请稍后重试', { acceptUser: false });
  }

  async function signOut() {
    // 只退出当前浏览器会话；默认 global 会连带撤销用户其它设备上的刷新令牌。
    return runAuth(
      () => supabase.auth.signOut({ scope: 'local' }),
      '退出登录失败，请稍后重试',
      { acceptUser: false },
    );
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('账号监听器必须是函数');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy() {
    authSubscription?.unsubscribe?.();
    authSubscription = null;
    listeners.clear();
  }

  return {
    state,
    get client() { return supabase; },
    get config() { return inspection.config; },
    initialize,
    subscribe,
    signUpWithPassword,
    signInWithPassword,
    signInWithGoogle,
    linkGoogle,
    setPassword,
    resetPassword,
    signOut,
    destroy,
  };
}
