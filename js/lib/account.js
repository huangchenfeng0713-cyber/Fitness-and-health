import { createCloudAuth, CloudAuthError } from './cloud-auth.js';
import {
  createCloudSync, CloudConflictError, MAX_CLOUD_SNAPSHOT_BYTES,
} from './cloud-sync.js';
import * as defaultDb from './db.js';

const INITIAL_STATE = Object.freeze({
  configured: false,
  status: 'local',
  phase: 'local', // 兼容早期调用方；与 status 保持一致
  user: null,
  email: null,
  provider: null,
  providers: [],
  syncStatus: 'idle',
  lastSyncedAt: null,
  conflict: null,
  error: null,
  ownershipPending: false,
  transitionReason: null,
});

export const cloudState = { ...INITIAL_STATE, providers: [] };

async function defaultAfterLocalReplace() {
  const { reloadStoreFromDB } = await import('./store.js');
  await reloadStoreFromDB();
}

function providerLabel(providers) {
  return providers?.length ? providers.join('+') : null;
}

function publicState(state) {
  return {
    ...state,
    user: state.user ? { ...state.user } : null,
    providers: [...(state.providers || [])],
    conflict: state.conflict ? {
      ...state.conflict,
      device: { ...state.conflict.device },
      cloud: { ...state.conflict.cloud },
    } : null,
  };
}

export function createAccountController({
  stateTarget = null,
  config = {},
  client = null,
  createClient = null,
  dbApi = undefined,
  storage = null,
  afterLocalReplace = defaultAfterLocalReplace,
  debounceMs = 1200,
  maxSnapshotBytes = MAX_CLOUD_SNAPSHOT_BYTES,
  authFactory = createCloudAuth,
  syncFactory = createCloudSync,
} = {}) {
  const state = stateTarget || { ...INITIAL_STATE, providers: [] };
  Object.assign(state, INITIAL_STATE, { providers: [] });
  const listeners = new Set();
  const auth = authFactory({ client, createClient, config });
  const localDb = dbApi || defaultDb;
  let sync = null;
  let initialized = false;
  let initializing = null;
  let authUnsubscribe = null;
  let syncUnsubscribe = null;
  let syncedUserId = null;
  let authQueue = Promise.resolve();
  let safeSignOutInProgress = false;
  let preserveLocalSignOutInProgress = false;
  let safeSignOutHandled = false;

  function emit() {
    const value = publicState(state);
    for (const listener of listeners) {
      try { listener(value); } catch (err) { console.error('云账号监听器出错', err); }
    }
  }

  function patch(patchValue) {
    if (patchValue.status && !patchValue.phase) patchValue.phase = patchValue.status;
    Object.assign(state, patchValue);
    emit();
  }

  function setUserState(user, providers = auth.state.providers || []) {
    const normalized = user ? { id: user.id, email: user.email || null } : null;
    patch({
      user: normalized,
      email: normalized?.email || null,
      providers: [...providers],
      provider: providerLabel(providers),
    });
  }

  function applySyncState(next) {
    if (!next) return;
    let status = state.user ? 'signedIn' : state.status;
    if (next.syncStatus === 'conflict') status = 'conflict';
    else if (next.syncStatus === 'locked') status = 'locked';
    else if (next.syncStatus === 'error') status = 'error';
    else if (next.syncStatus === 'syncing' && state.user) status = 'loading';
    patch({
      status,
      syncStatus: next.syncStatus,
      conflict: next.conflict || null,
      lastSyncedAt: next.lastSyncedAt || null,
      error: next.error || null,
      ownershipPending: next.ownershipPending === true,
      transitionReason: next.transitionReason || null,
    });
  }

  async function handleAuthUser(user, event = 'AUTH_CHANGED') {
    if (!sync) return;
    if (!user) {
      const preserving = event === 'PRESERVED_SIGNED_OUT' || preserveLocalSignOutInProgress;
      const intentional = preserving || event === 'SAFE_SIGNED_OUT' || safeSignOutInProgress;
      const signOutReason = preserving ? 'preserved-signout'
        : intentional ? 'safe-signout' : 'unexpected-signout';
      if (intentional && safeSignOutHandled) return;
      patch({
        status: 'loading',
        syncStatus: 'syncing',
        ownershipPending: true,
        transitionReason: signOutReason,
        error: null,
      });
      if (intentional) safeSignOutHandled = true;
      syncedUserId = null;
      const detached = preserving
        ? await sync.detach({ preserveOwned: true, reason: signOutReason })
        : intentional
        ? await sync.detach({ forceClear: true, reason: 'safe-signout' })
        : await sync.detach({ reason: 'unexpected-signout' });
      setUserState(null, []);
      if (detached.preserved) {
        const preservedMessage = preserving
          ? '已退出账号；本机记录未删除并已锁定，重新登录原账号后可继续同步'
          : '登录状态已失效，本机未同步数据已锁定保留';
        patch({
          status: 'locked', syncStatus: 'locked', conflict: detached.conflict || null,
          lastSyncedAt: detached.lastSyncedAt || null,
          error: preserving ? preservedMessage : (detached.error || preservedMessage),
          ownershipPending: true,
          transitionReason: detached.transitionReason || signOutReason,
        });
        return;
      }
      patch({
        status: 'signedOut', syncStatus: 'idle', conflict: null,
        lastSyncedAt: null, error: null,
        ownershipPending: false, transitionReason: null,
      });
      return;
    }

    const providers = auth.state.providers || [];
    const normalizedUser = { id: user.id, email: user.email || null };
    if (syncedUserId === user.id) {
      patch({
        user: normalizedUser,
        email: normalizedUser.email,
        providers: [...providers],
        provider: providerLabel(providers),
      });
      if (!['conflict', 'error', 'locked'].includes(state.status)
        && state.ownershipPending !== true) patch({ status: 'signedIn' });
      return;
    }
    patch({
      user: normalizedUser,
      email: normalizedUser.email,
      providers: [...providers],
      provider: providerLabel(providers),
      status: 'loading',
      syncStatus: 'syncing',
      ownershipPending: true,
      transitionReason: 'login-ownership-check',
      error: null,
    });
    try {
      const next = await sync.setUser(user);
      syncedUserId = user.id;
      applySyncState(next);
      if (next.syncStatus !== 'conflict' && next.syncStatus !== 'error') patch({ status: 'signedIn' });
    } catch (error) {
      if (['owner_locked', 'owner_mismatch', 'account_data_locked'].includes(error?.code)) {
        await auth.signOut().catch(() => {});
        setUserState(null, []);
        patch({
          status: 'locked', syncStatus: 'locked', ownershipPending: true,
          transitionReason: 'owner-locked', error: error.message,
        });
        return;
      }
      if (error instanceof CloudConflictError || sync.state.syncStatus === 'conflict') {
        applySyncState(sync.state);
        patch({ status: 'conflict' });
        return;
      }
      patch({ status: 'error', syncStatus: sync.state.syncStatus, error: error.message });
    }
  }

  function queueAuthUser(user, event) {
    authQueue = authQueue.then(() => handleAuthUser(user, event)).catch((error) => {
      patch({ status: 'error', error: String(error?.message || error) });
    });
    return authQueue;
  }

  async function initialize() {
    if (initialized) return publicState(state);
    if (initializing) return initializing;
    initializing = (async () => {
      patch({ status: 'loading', error: null });
      const authState = await auth.initialize();
      state.configured = Boolean(authState.configured);
      if (!authState.configured || !authState.available || !auth.client) {
        // Missing configuration is stable, while a configured service that is
        // temporarily offline must remain retryable when the network returns.
        initialized = !authState.configured;
        let durableProtection = false;
        let durableProbeError = null;
        if (typeof localDb.getCloudSyncMetadata === 'function') {
          try {
            const durable = await localDb.getCloudSyncMetadata();
            if (durable?.owner) {
              durableProtection = true;
              if (!durable.writeLocked) {
                await localDb.setCloudSyncMetadata({
                  ...durable,
                  epoch: Math.max(0, Number(durable.epoch) || 0) + 1,
                  writeLocked: true,
                });
              }
            } else if (durable?.writeLocked) {
              // owner=null + locked can be an interrupted claim/switch. Without
              // authentication it is impossible to prove whose data is visible,
              // so fail closed instead of treating it as ordinary guest data.
              durableProtection = true;
            }
          } catch (error) {
            // A concurrent tab may change owner/epoch between the probe and the
            // lock CAS. Never let that failure fall through to visible local mode.
            durableProtection = true;
            durableProbeError = error;
          }
        }
        patch({
          configured: Boolean(authState.configured),
          status: durableProtection ? 'locked' : 'local',
          syncStatus: durableProtection ? 'locked' : 'idle',
          ownershipPending: durableProtection,
          transitionReason: durableProtection ? 'auth-unavailable' : null,
          error: durableProtection
            ? (durableProbeError?.message
              || '云账号暂时不可用；原账号数据已锁定保护，恢复连接并重新登录后可继续使用')
            : (authState.error || null),
        });
        return publicState(state);
      }

      sync = syncFactory({
        client: auth.client,
        table: auth.config.table,
        ...(dbApi ? { dbApi } : {}),
        storage,
        afterLocalReplace,
        debounceMs,
        maxSnapshotBytes,
      });
      syncUnsubscribe = sync.subscribe(applySyncState);
      authUnsubscribe = auth.subscribe((next, event) => queueAuthUser(next.user, event));
      initialized = true;
      patch({ configured: true, error: null });
      await queueAuthUser(authState.user, 'INITIAL_SESSION');
      return publicState(state);
    })().finally(() => { initializing = null; });
    return initializing;
  }

  async function ensureInitialized() {
    await initialize();
    if (!state.configured || !auth.state.available) {
      throw new CloudAuthError(
        state.error || '云账号尚未配置，本机记录功能仍可正常使用',
        'cloud_unavailable',
      );
    }
  }

  function ensureSignedOutForLogin() {
    if (state.user) throw new CloudAuthError('请先安全退出当前账号再登录另一个账号', 'already_signed_in');
  }

  async function signUpWithPassword(email, password) {
    await ensureInitialized();
    ensureSignedOutForLogin();
    const data = await auth.signUpWithPassword(email, password);
    if (data?.session?.user) await authQueue;
    return { ...data, confirmationRequired: !data?.session };
  }

  async function signInWithPassword(email, password) {
    await ensureInitialized();
    ensureSignedOutForLogin();
    const data = await auth.signInWithPassword(email, password);
    if (data?.session?.user) await authQueue;
    return data;
  }

  async function signInWithGoogle(options = {}) {
    await ensureInitialized();
    ensureSignedOutForLogin();
    return auth.signInWithGoogle(options);
  }

  async function linkGoogle(options = {}) {
    await ensureInitialized();
    return auth.linkGoogle(options);
  }

  async function setPassword(password) {
    await ensureInitialized();
    const data = await auth.setPassword(password);
    const providers = new Set(state.providers);
    providers.add('email');
    setUserState(state.user, [...providers].sort());
    return data;
  }

  async function resetPassword(email) {
    await ensureInitialized();
    return auth.resetPassword(email);
  }

  async function syncNow() {
    await ensureInitialized();
    if (!sync || !state.user) throw new CloudAuthError('请先登录账号再同步', 'not_signed_in');
    try {
      const next = await sync.syncNow();
      applySyncState(next);
      return next;
    } catch (error) {
      applySyncState(sync.state);
      throw error;
    }
  }

  async function resolveCloudConflict(choice) {
    await ensureInitialized();
    if (!sync) throw new CloudAuthError('云同步不可用', 'cloud_unavailable');
    const next = await sync.resolveConflict(choice);
    applySyncState(next);
    if (next.syncStatus === 'idle') patch({ status: 'signedIn' });
    return next;
  }

  async function signOutSafely() {
    await ensureInitialized();
    if (!state.user) return publicState(state);
    await sync.beginSafeSignOut();
    try {
      // 先跨标签冻结写入，再 flush；任何失败都会在 auth.signOut 之前解锁并保留会话/数据。
      await sync.flush();
      patch({
        status: 'loading', syncStatus: 'syncing', error: null,
        ownershipPending: true, transitionReason: 'safe-signout',
      });
      safeSignOutInProgress = true;
      safeSignOutHandled = false;
      await auth.signOut();
      // Some SDK/client paths emit SIGNED_OUT and some only resolve signOut.
      // Queueing the fallback through the same lane makes both cases idempotent.
      await queueAuthUser(null, 'SAFE_SIGNED_OUT');
    } catch (error) {
      if (!safeSignOutHandled) await sync.cancelTransition();
      throw error;
    } finally {
      safeSignOutInProgress = false;
      safeSignOutHandled = false;
    }
    return publicState(state);
  }

  /**
   * 云端暂时不可达时仍允许退出，但绝不清除本机副本。副本会保持账号归属锁，
   * 只能由同一账号重新认证后解锁，避免下一位登录者看到或接管这些记录。
   */
  async function signOutPreservingLocal() {
    await ensureInitialized();
    if (!state.user) return publicState(state);
    await sync.beginSafeSignOut({ preserveLocal: true });
    try {
      patch({
        status: 'loading', syncStatus: 'syncing', error: null,
        ownershipPending: true, transitionReason: 'preserved-signout',
      });
      safeSignOutInProgress = true;
      preserveLocalSignOutInProgress = true;
      safeSignOutHandled = false;
      await auth.signOut();
      await queueAuthUser(null, 'PRESERVED_SIGNED_OUT');
    } catch (error) {
      if (!safeSignOutHandled) await sync.cancelTransition();
      throw error;
    } finally {
      safeSignOutInProgress = false;
      preserveLocalSignOutInProgress = false;
      safeSignOutHandled = false;
    }
    return publicState(state);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('云账号监听器必须是函数');
    listeners.add(listener);
    listener(publicState(state));
    return () => listeners.delete(listener);
  }

  function destroy() {
    authUnsubscribe?.();
    syncUnsubscribe?.();
    sync?.destroy();
    auth.destroy();
    listeners.clear();
  }

  return {
    state,
    get client() { return auth.client; },
    initialize,
    subscribe,
    signUpWithPassword,
    signUp: signUpWithPassword,
    signInWithPassword,
    signInWithGoogle,
    linkGoogle,
    setPassword,
    resetPassword,
    syncNow,
    resolveCloudConflict,
    resolveConflict: resolveCloudConflict,
    signOutSafely,
    signOutPreservingLocal,
    signOut: signOutSafely,
    destroy,
  };
}

let singleton = null;

function account(options = undefined) {
  if (!singleton) singleton = createAccountController({ ...(options || {}), stateTarget: cloudState });
  return singleton;
}

export function getAccountState() {
  return publicState(cloudState);
}

/** 复用账号模块已经初始化的客户端，避免健康同步再创建一套 Auth 会话。 */
export function getCloudClient() {
  return account().client || null;
}

export function subscribeCloud(listener) {
  return account().subscribe(listener);
}

export const subscribeAccount = subscribeCloud;

export function initCloud(options = {}) {
  return account(options).initialize();
}

export const initAccountSync = initCloud;

export function signUpWithPassword(...args) {
  return account().signUpWithPassword(...args);
}

export const signUp = signUpWithPassword;

export function signInWithPassword(...args) {
  return account().signInWithPassword(...args);
}

export function signInWithGoogle(...args) {
  return account().signInWithGoogle(...args);
}

export function linkGoogle(...args) {
  return account().linkGoogle(...args);
}

export function setPassword(...args) {
  return account().setPassword(...args);
}

export function resetPassword(...args) {
  return account().resetPassword(...args);
}

export function syncNow(...args) {
  return account().syncNow(...args);
}

export function resolveCloudConflict(...args) {
  return account().resolveCloudConflict(...args);
}

export const resolveConflict = resolveCloudConflict;

export function signOutSafely(...args) {
  return account().signOutSafely(...args);
}

export function signOutPreservingLocal(...args) {
  return account().signOutPreservingLocal(...args);
}

export const signOut = signOutSafely;
