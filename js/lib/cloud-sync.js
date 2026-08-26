import * as defaultDb from './db.js';

export const MAX_CLOUD_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const CLOUD_SNAPSHOT_SCHEMA_VERSION = 1;

const REMOTE_FIELDS = 'user_id,schema_version,revision,payload,updated_at';
// 写入成功后只取 revision 和时间戳。旧实现把刚上传的整份 payload 又完整下载一遍，
// 历史健康数据较多时会把一次同步的流量近乎翻倍，也更容易在移动网络上超时。
const REMOTE_WRITE_FIELDS = 'user_id,schema_version,revision,updated_at';
const META_PREFIX = 'health-diet.cloud.v1';

export class CloudSyncError extends Error {
  constructor(message, code = 'sync_error', cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CloudSyncError';
    this.code = code;
  }
}

export class CloudConflictError extends CloudSyncError {
  constructor(message = '本机和云端都有更新，请先选择保留哪一份') {
    super(message, 'cloud_conflict');
    this.name = 'CloudConflictError';
  }
}

function asSyncError(error, fallback = '云同步失败，请稍后重试') {
  if (error instanceof CloudSyncError) return error;
  return new CloudSyncError(String(error?.message || fallback), error?.code || 'sync_error', error);
}

function byteLength(value) {
  const json = JSON.stringify(value);
  if (json == null) throw new CloudSyncError('本机数据无法序列化，尚未上传', 'invalid_snapshot');
  return { json, bytes: new TextEncoder().encode(json).byteLength };
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function assertSnapshotSize(snapshot, limit = MAX_CLOUD_SNAPSHOT_BYTES) {
  const { json, bytes } = byteLength(snapshot);
  if (bytes > limit) {
    throw new CloudSyncError(
      `账号数据约 ${(bytes / 1024 / 1024).toFixed(1)} MB，超过 8 MB 云同步上限；本机数据未被删除`,
      'snapshot_too_large',
    );
  }
  return { bytes, snapshot: JSON.parse(json) };
}

export function snapshotHasUserData(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  return ['health', 'diet', 'settings', 'customFoods']
    .some((key) => Array.isArray(snapshot[key]) && snapshot[key].length > 0);
}

export function snapshotSummary(snapshot) {
  const count = (key) => (Array.isArray(snapshot?.[key]) ? snapshot[key].length : 0);
  return {
    healthDays: count('health'),
    dietEntries: count('diet'),
    settings: count('settings'),
    customFoods: count('customFoods'),
    exportedAt: snapshot?.exportedAt || null,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function usableStorage(candidate) {
  if (candidate) return candidate;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return memoryStorage();
    const probe = `${META_PREFIX}.probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage();
  }
}

function createMetadata(storage, dbApi) {
  const keys = {
    owner: `${META_PREFIX}.owner`,
    revision: `${META_PREFIX}.revision`,
    dirty: `${META_PREFIX}.dirty`,
    lastSyncedAt: `${META_PREFIX}.last-synced-at`,
  };
  const read = (key) => {
    try { return storage.getItem(keys[key]); } catch { return null; }
  };
  const write = (key, value) => {
    try {
      if (value == null || value === '') storage.removeItem(keys[key]);
      else storage.setItem(keys[key], String(value));
    } catch { /* 内存数据仍可使用；下次启动会重新安全协商 */ }
  };
  const empty = () => ({
    owner: null, revision: 0, dirty: false, lastSyncedAt: null,
    changeSeq: 0, epoch: 0, writeLocked: false,
  });
  let cache = empty();
  let loaded = false;
  let loadPromise = null;
  let persistence = Promise.resolve();

  const normalize = (value) => {
    if (!value || typeof value !== 'object') return null;
    const revision = Number(value.revision);
    const changeSeq = Number(value.changeSeq);
    const epoch = Number(value.epoch);
    return {
      owner: typeof value.owner === 'string' && value.owner ? value.owner : null,
      revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
      dirty: value.dirty === true,
      lastSyncedAt: typeof value.lastSyncedAt === 'string' ? value.lastSyncedAt : null,
      changeSeq: Number.isSafeInteger(changeSeq) && changeSeq >= 0 ? changeSeq : 0,
      epoch: Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0,
      writeLocked: value.writeLocked === true,
    };
  };

  function mirror() {
    write('owner', cache.owner);
    write('revision', cache.revision);
    write('dirty', cache.dirty ? '1' : '0');
    write('lastSyncedAt', cache.lastSyncedAt);
  }

  function queuePersist(options = {}) {
    if (typeof dbApi.setCloudSyncMetadata !== 'function') return persistence;
    const value = { ...cache };
    persistence = persistence.catch(() => {}).then(async () => {
      try {
        const saved = normalize(await dbApi.setCloudSyncMetadata(value, options));
        if (!saved) return;
        if (saved.epoch > cache.epoch) {
          cache = saved;
          mirror();
          return;
        }
        if (saved.epoch === cache.epoch) {
          cache.changeSeq = Math.max(cache.changeSeq, saved.changeSeq);
          cache.dirty = cache.dirty || saved.dirty;
          cache.writeLocked = cache.writeLocked || saved.writeLocked;
          if (saved.changeSeq >= cache.changeSeq) {
            cache.revision = Math.max(cache.revision, saved.revision);
            cache.lastSyncedAt = saved.lastSyncedAt || cache.lastSyncedAt;
          }
          mirror();
        }
      } catch (error) {
        // A competing tab may win an owner/epoch CAS. Roll the optimistic
        // in-memory value back to IndexedDB so this controller can recover
        // without requiring a page reload.
        try {
          const durable = normalize(await dbApi.getCloudSyncMetadata?.());
          cache = durable || empty();
          mirror();
        } catch { /* preserve the original CAS error */ }
        throw error;
      }
    });
    return persistence;
  }

  async function load({ refresh = false } = {}) {
    if (loaded && !refresh) return { ...cache };
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        await persistence;
      } catch (error) {
        if (!refresh) throw error;
      }
      const durable = typeof dbApi.getCloudSyncMetadata === 'function'
        ? normalize(await dbApi.getCloudSyncMetadata()) : null;
      if (durable) {
        cache = durable;
      } else if (!loaded) {
        // v1.5 之前的 localStorage 元数据仅用于一次性迁移；之后 IndexedDB 是权威来源。
        const legacyOwner = read('owner') || null;
        const legacyRevision = Number(read('revision'));
        cache = legacyOwner ? {
          owner: legacyOwner,
          revision: Number.isSafeInteger(legacyRevision) && legacyRevision >= 0 ? legacyRevision : 0,
          dirty: read('dirty') === '1',
          lastSyncedAt: read('lastSyncedAt') || null,
          changeSeq: 0,
          epoch: 0,
          writeLocked: false,
        } : empty();
        if (legacyOwner) await queuePersist();
      } else {
        cache = empty();
      }
      loaded = true;
      mirror();
      return { ...cache };
    })().finally(() => { loadPromise = null; });
    return loadPromise;
  }

  return {
    load,
    async flush() { await persistence; },
    async update(patch, options = {}) {
      cache = { ...cache, ...patch };
      mirror();
      queuePersist(options);
      await persistence;
      return { ...cache };
    },
    get owner() { return cache.owner; },
    set owner(value) { cache.owner = value || null; mirror(); queuePersist(); },
    get revision() { return cache.revision; },
    set revision(value) {
      cache.revision = Math.max(0, Number(value) || 0);
      mirror();
      queuePersist();
    },
    get dirty() { return cache.dirty; },
    set dirty(value) { cache.dirty = value === true; mirror(); queuePersist(); },
    get lastSyncedAt() { return cache.lastSyncedAt; },
    set lastSyncedAt(value) { cache.lastSyncedAt = value || null; mirror(); queuePersist(); },
    get changeSeq() { return cache.changeSeq; },
    set changeSeq(value) {
      cache.changeSeq = Math.max(0, Number(value) || 0);
      queuePersist();
    },
    get epoch() { return cache.epoch; },
    set epoch(value) {
      cache.epoch = Math.max(0, Number(value) || 0);
      queuePersist();
    },
    get writeLocked() { return cache.writeLocked; },
    set writeLocked(value) { cache.writeLocked = value === true; queuePersist(); },
    async clear({ keepLocked = false } = {}) {
      const expectedContext = {
        owner: cache.owner,
        revision: cache.revision,
        epoch: cache.epoch,
        changeSeq: cache.changeSeq,
      };
      persistence = persistence.catch(() => {}).then(async () => {
        try {
          if (typeof dbApi.clearCloudSyncMetadata === 'function') {
            cache = normalize(await dbApi.clearCloudSyncMetadata({
              writeLocked: keepLocked,
              expectedContext,
            })) || empty();
          } else {
            cache = empty();
          }
          Object.keys(keys).forEach((key) => write(key, null));
        } catch (error) {
          try {
            cache = normalize(await dbApi.getCloudSyncMetadata?.()) || empty();
            mirror();
          } catch { /* preserve the original CAS error */ }
          throw error;
        }
      });
      await persistence;
    },
  };
}

function normalizeRemote(row) {
  if (!row) return null;
  const value = Array.isArray(row) ? row[0] : row;
  if (!value) return null;
  const schemaVersion = Number(value.schema_version);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new CloudSyncError('云端数据结构版本无效，已停止覆盖本机数据', 'invalid_remote');
  }
  if (schemaVersion > CLOUD_SNAPSHOT_SCHEMA_VERSION) {
    throw new CloudSyncError('云端数据来自更新版本，请先升级应用；本机数据未被覆盖', 'remote_schema_newer');
  }
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new CloudSyncError('云端数据版本无效，已停止覆盖本机数据', 'invalid_remote');
  }
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    throw new CloudSyncError('云端数据格式无效，已停止覆盖本机数据', 'invalid_remote');
  }
  return { ...value, schema_version: schemaVersion, revision };
}

function normalizeWriteResponse(row, snapshot, { userId, revision }) {
  if (!row) return null;
  const value = Array.isArray(row) ? row[0] : row;
  if (!value) return null;
  const remote = normalizeRemote({ ...value, payload: snapshot });
  if (remote.user_id !== userId || remote.revision !== revision) {
    throw new CloudSyncError('云端写入确认信息无效，本机数据已保留', 'invalid_remote');
  }
  return remote;
}

function sameJsonValue(left, right, ignoreTopLevelExportedAt = false) {
  if (Object.is(left, right)) return true;
  if (left == null || right == null || typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (typeof left !== 'object') return false;
  const visibleKeys = (value) => Object.keys(value)
    .filter((key) => !(ignoreTopLevelExportedAt && key === 'exportedAt'))
    .sort();
  const leftKeys = visibleKeys(left);
  const rightKeys = visibleKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index]
    && sameJsonValue(left[key], right[key]));
}

function snapshotsHaveSameData(left, right) {
  return Boolean(left && right && sameJsonValue(left, right, true));
}

function throwQueryError(error, fallback) {
  if (!error) return;
  throw new CloudSyncError(String(error.message || fallback), error.code || 'remote_error', error);
}

async function singleResult(query, { maybe = false } = {}) {
  if (maybe && typeof query.maybeSingle === 'function') return query.maybeSingle();
  if (typeof query.single === 'function') return query.single();
  return query;
}

export function createCloudSync({
  client,
  table = 'user_snapshots',
  dbApi = defaultDb,
  storage = null,
  afterLocalReplace = null,
  debounceMs = 1200,
  maxSnapshotBytes = MAX_CLOUD_SNAPSHOT_BYTES,
  remoteTimeoutMs = 12_000,
  uploadTimeoutMs = 30_000,
  now = () => new Date(),
} = {}) {
  if (!client?.from) throw new TypeError('云同步需要 Supabase client');
  const listeners = new Set();
  const metadata = createMetadata(usableStorage(storage), dbApi);
  let currentUser = null;
  let pendingConflict = null;
  let timer = null;
  let activeSync = null;
  let generation = 0;
  let transitionReason = null;
  let activeResolution = null;

  const state = {
    syncStatus: 'idle',
    conflict: null,
    lastSyncedAt: metadata.lastSyncedAt,
    error: null,
    transitionReason: null,
    ownershipPending: false,
  };

  function publicState() {
    return {
      ...state,
      conflict: state.conflict ? {
        ...state.conflict,
        device: { ...state.conflict.device },
        cloud: { ...state.conflict.cloud },
      } : null,
    };
  }

  function emit() {
    const value = publicState();
    for (const listener of listeners) {
      try { listener(value); } catch (err) { console.error('云同步状态监听器出错', err); }
    }
  }

  function patchState(patch) {
    Object.assign(state, patch);
    emit();
  }

  function completedOwnershipState() {
    const stillTransitioning = transitionReason === 'safe-signout';
    if (!stillTransitioning) transitionReason = null;
    return {
      ownershipPending: stillTransitioning,
      transitionReason: stillTransitioning ? transitionReason : null,
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('云同步监听器必须是函数');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clearTimer() {
    if (timer != null) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (!currentUser || pendingConflict) return;
    timer = setTimeout(() => {
      timer = null;
      syncNow().catch(() => {});
    }, Math.max(0, debounceMs));
  }

  async function runRemoteQuery(query, {
    maybe = false, operation = '云端请求', timeoutMs = remoteTimeoutMs,
  } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const abortable = controller && typeof query?.abortSignal === 'function'
      ? query.abortSignal(controller.signal) : query;
    let timer = null;
    try {
      return await Promise.race([
        singleResult(abortable, { maybe }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller?.abort();
            reject(new CloudSyncError(`${operation}超时，本地数据已保留`, 'remote_timeout'));
          }, Math.max(1, Number(timeoutMs) || Number(remoteTimeoutMs) || 12_000));
        }),
      ]);
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }

  async function quiet(action) {
    return action();
  }

  async function captureLocalSnapshot() {
    if (typeof dbApi.exportAllWithCloudMetadata === 'function') {
      const captured = await dbApi.exportAllWithCloudMetadata();
      const durable = captured.metadata || {};
      return {
        snapshot: captured.snapshot,
        owner: durable.owner || null,
        epoch: Math.max(0, Number(durable.epoch) || 0),
        changeSeq: Math.max(0, Number(durable.changeSeq) || 0),
        dirty: durable.dirty === true,
        writeLocked: durable.writeLocked === true,
      };
    }
    const snapshot = await dbApi.exportAll();
    await metadata.load({ refresh: true });
    return {
      snapshot,
      owner: metadata.owner,
      epoch: metadata.epoch,
      changeSeq: metadata.changeSeq,
      dirty: metadata.dirty,
      writeLocked: metadata.writeLocked,
    };
  }

  async function notifyLocalReplace(reason) {
    if (typeof afterLocalReplace === 'function') await afterLocalReplace(reason);
  }

  async function metadataGuard({ allowLocked = Boolean(transitionReason), refresh = true } = {}) {
    await metadata.load({ refresh });
    await metadata.flush();
    return {
      owner: metadata.owner,
      revision: metadata.revision,
      epoch: metadata.epoch,
      changeSeq: metadata.changeSeq,
      writeLocked: metadata.writeLocked,
      allowLocked,
    };
  }

  async function clearLocal(reason, { allowLocked = true, guard: expectedGuard = null } = {}) {
    const guard = expectedGuard || await metadataGuard({ allowLocked });
    await quiet(async () => {
      if (typeof dbApi.clearAllStores === 'function') {
        await dbApi.clearAllStores({ source: 'cloud', guard });
      }
      else {
        for (const store of Object.values(dbApi.STORES || {})) await dbApi.clear(store);
      }
      await notifyLocalReplace(reason);
    });
  }

  async function fetchRemote(userId) {
    const result = await runRemoteQuery(
      client.from(table).select(REMOTE_FIELDS).eq('user_id', userId),
      { maybe: true, operation: '读取云端数据' },
    );
    throwQueryError(result?.error, '读取云端数据失败');
    return normalizeRemote(result?.data);
  }

  async function insertRemote(userId, snapshot, bytes) {
    const row = {
      user_id: userId,
      schema_version: CLOUD_SNAPSHOT_SCHEMA_VERSION,
      revision: 1,
      payload: snapshot,
    };
    const result = await runRemoteQuery(
      client.from(table).insert(row).select(REMOTE_WRITE_FIELDS),
      { operation: `首次上传账号数据（约 ${formatBytes(bytes)}）`, timeoutMs: uploadTimeoutMs },
    );
    throwQueryError(result?.error, '首次上传账号数据失败');
    return normalizeWriteResponse(result?.data || row, snapshot, { userId, revision: 1 });
  }

  async function updateRemote(userId, expectedRevision, snapshot, bytes) {
    const nextRevision = expectedRevision + 1;
    const result = await runRemoteQuery(
      client.from(table)
        .update({
          schema_version: CLOUD_SNAPSHOT_SCHEMA_VERSION,
          revision: nextRevision,
          payload: snapshot,
        })
        .eq('user_id', userId)
        .eq('revision', expectedRevision)
        .select(REMOTE_WRITE_FIELDS),
      {
        maybe: true,
        operation: `上传账号数据（约 ${formatBytes(bytes)}）`,
        timeoutMs: uploadTimeoutMs,
      },
    );
    throwQueryError(result?.error, '上传账号数据失败');
    return normalizeWriteResponse(result?.data, snapshot, { userId, revision: nextRevision });
  }

  async function establishOwner(userId, revision, {
    dirty = false, syncedAt = null, unlock = false, expectedChangeSeq = null,
    expectedContext: requestContext = null,
  } = {}) {
    // Unlocking is an account-boundary transition. Advance the durable epoch so
    // a write that queued while the old lock was active cannot commit afterward.
    await metadata.load({ refresh: true });
    if (requestContext && (
      metadata.owner !== requestContext.owner
      || metadata.epoch !== requestContext.epoch
    )) {
      throw accountBoundaryError('账号数据边界已变更，旧请求已取消');
    }
    if (metadata.owner && metadata.owner !== userId) {
      throw accountBoundaryError('本地数据已归属另一个账号，已拒绝接管');
    }
    const ownershipChanged = metadata.owner !== userId;
    const mustAdvanceEpoch = ownershipChanged || (unlock && metadata.writeLocked);
    const changedSinceRequest = expectedChangeSeq != null
      && metadata.changeSeq !== expectedChangeSeq;
    const nextDirty = dirty || changedSinceRequest;
    const expectedContext = {
      owner: requestContext?.owner ?? metadata.owner,
      epoch: requestContext?.epoch ?? metadata.epoch,
      changeSeq: expectedChangeSeq ?? metadata.changeSeq,
    };
    await metadata.update({
      owner: userId,
      revision,
      dirty: nextDirty,
      ...(syncedAt ? { lastSyncedAt: syncedAt } : {}),
      ...(mustAdvanceEpoch ? { epoch: metadata.epoch + 1 } : {}),
      ...(unlock ? { writeLocked: false } : {}),
    }, {
      allowClearDirty: !nextDirty && expectedChangeSeq != null,
      expectedContext,
      requireContext: Boolean(requestContext),
    });
  }

  async function fetchRemoteNotOlderThanMetadata(
    userId, token, expectedContext = null, attempts = 2,
  ) {
    let remote = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      remote = await fetchRemote(userId);
      assertCurrent(userId, token);
      await metadata.load({ refresh: true });
      if (expectedContext && (
        metadata.owner !== expectedContext.owner
        || metadata.epoch !== expectedContext.epoch
      )) {
        throw accountBoundaryError('账号数据边界已在其它标签页变更');
      }
      const remoteRevision = remote?.revision || 0;
      if (!remote) {
        if (metadata.revision === 0 || attempt === attempts - 1) return null;
        continue;
      }
      if (remoteRevision >= metadata.revision) return remote;
    }
    throw new CloudSyncError(
      '云端版本暂时落后于本地已确认版本，已停止落地以避免回退',
      'remote_stale',
    );
  }

  async function beginTransition(reason) {
    await metadata.load({ refresh: true });
    await metadata.flush();
    transitionReason = reason;
    await metadata.update({
      epoch: metadata.epoch + 1,
      writeLocked: true,
    });
    patchState({ transitionReason: reason, ownershipPending: true });
    return metadataGuard({ allowLocked: true, refresh: true });
  }

  async function cancelTransition() {
    await metadata.load({ refresh: true });
    if (currentUser && (metadata.owner === currentUser.id || metadata.owner == null)) {
      await metadata.update({
        epoch: metadata.epoch + 1,
        writeLocked: false,
      });
    }
    const ownershipConflict = ['orphan-local-data', 'device-and-cloud']
      .includes(pendingConflict?.reason);
    transitionReason = ownershipConflict ? pendingConflict.reason : null;
    patchState({
      transitionReason,
      ownershipPending: ownershipConflict,
    });
    return publicState();
  }

  async function beginSafeSignOut({ preserveLocal = false } = {}) {
    if (pendingConflict || (state.ownershipPending && transitionReason !== 'safe-signout')) {
      throw new CloudConflictError('本地与云端存在冲突，解决后才能安全退出');
    }
    return beginTransition(preserveLocal ? 'preserved-signout' : 'safe-signout');
  }

  function assertCurrent(userId, token) {
    if (!currentUser || currentUser.id !== userId || generation !== token) {
      throw new CloudSyncError('账号已经切换，旧的同步操作已取消', 'sync_cancelled');
    }
  }

  function accountBoundaryError(message = '账号数据边界已变更') {
    transitionReason = 'owner-locked';
    patchState({
      syncStatus: 'locked',
      ownershipPending: true,
      transitionReason,
      error: message,
    });
    return new CloudSyncError(message, 'owner_mismatch');
  }

  async function applyRemote(
    remote, reason = 'cloud', userId = currentUser?.id, token = generation,
    expectedContext = null,
  ) {
    assertCurrent(userId, token);
    assertSnapshotSize(remote.payload, maxSnapshotBytes);
    const guard = await metadataGuard();
    const expectedChangeSeq = typeof expectedContext === 'number'
      ? expectedContext : (expectedContext?.changeSeq ?? metadata.changeSeq);
    if (expectedContext && typeof expectedContext === 'object' && (
      guard.owner !== expectedContext.owner || guard.epoch !== expectedContext.epoch
    )) {
      throw accountBoundaryError('账号数据边界已变更，旧云端响应已丢弃');
    }
    if (guard.owner && guard.owner !== userId) {
      throw accountBoundaryError('本地账号归属已变更，已停止落地');
    }
    if (remote.revision < guard.revision) {
      throw new CloudSyncError('云端版本已落后，已停止落地以避免回退', 'remote_stale');
    }
    if (guard.changeSeq !== expectedChangeSeq) {
      const local = await dbApi.exportAll();
      throw await enterConflict('local-changed-during-sync', local, remote);
    }
    const keepLocked = transitionReason === 'safe-signout';
    const advanceEpoch = guard.owner !== userId || (guard.writeLocked && !keepLocked);
    const syncedAt = remote.updated_at || now().toISOString();
    try {
      await quiet(async () => {
        assertCurrent(userId, token);
        await dbApi.importAll(remote.payload, {
          source: 'cloud',
          guard,
          cloudMetadata: {
            owner: userId,
            revision: remote.revision,
            dirty: false,
            lastSyncedAt: syncedAt,
            changeSeq: guard.changeSeq,
            epoch: guard.epoch + (advanceEpoch ? 1 : 0),
            writeLocked: keepLocked,
          },
        });
        assertCurrent(userId, token);
        await metadata.load({ refresh: true });
        // Compatibility for injected DB fakes/older adapters that do not yet
        // implement the atomic cloudMetadata option.
        if (metadata.owner !== userId || metadata.revision < remote.revision) {
          await establishOwner(userId, remote.revision, {
            dirty: false, syncedAt, unlock: !keepLocked,
            expectedChangeSeq: guard.changeSeq,
            expectedContext: guard,
          });
        }
        await notifyLocalReplace(reason);
      });
    } catch (error) {
      if (error?.code === 'account_data_locked') {
        await metadata.load({ refresh: true });
        if ((metadata.owner && metadata.owner !== userId)
          || (expectedContext && typeof expectedContext === 'object'
            && metadata.epoch !== expectedContext.epoch)) {
          transitionReason = 'owner-locked';
          patchState({
            syncStatus: 'locked', ownershipPending: true,
            transitionReason: 'owner-locked',
            error: '账号数据边界已在其它标签页改变',
          });
          throw new CloudSyncError('账号数据已切换，旧响应已丢弃', 'owner_mismatch');
        }
        const local = await dbApi.exportAll();
        throw await enterConflict('local-changed-during-sync', local, remote);
      }
      throw error;
    }
    assertCurrent(userId, token);
    await metadata.load({ refresh: true });
    pendingConflict = null;
    patchState({
      syncStatus: metadata.dirty ? 'dirty' : 'idle',
      conflict: null,
      error: null,
      lastSyncedAt: metadata.lastSyncedAt,
      ...completedOwnershipState(),
    });
    if (metadata.dirty) schedule();
  }

  function conflictDetails(reason, local, remote) {
    return {
      reason,
      device: snapshotSummary(local),
      cloud: snapshotSummary(remote?.payload),
      cloudRevision: remote?.revision || 0,
      cloudUpdatedAt: remote?.updated_at || null,
    };
  }

  async function enterConflict(reason, local, remote) {
    pendingConflict = { reason, local, remote };
    const ownershipPending = ['orphan-local-data', 'device-and-cloud'].includes(reason);
    await metadata.load({ refresh: true });
    await metadata.update({
      dirty: true,
      ...(ownershipPending && !metadata.writeLocked ? {
        epoch: metadata.epoch + 1,
        writeLocked: true,
      } : {}),
    });
    transitionReason = ownershipPending ? reason : null;
    patchState({
      syncStatus: 'conflict',
      conflict: conflictDetails(reason, local, remote),
      error: null,
      ownershipPending,
      transitionReason: ownershipPending ? reason : null,
    });
    return new CloudConflictError();
  }

  async function markSynced(
    remote, userId = currentUser?.id, token = generation,
    expectedContext = null,
  ) {
    assertCurrent(userId, token);
    const syncedAt = remote?.updated_at || now().toISOString();
    await establishOwner(userId, remote?.revision || metadata.revision, {
      dirty: false,
      syncedAt,
      unlock: transitionReason !== 'safe-signout',
      expectedChangeSeq: expectedContext?.changeSeq ?? metadata.changeSeq,
      expectedContext,
    });
    await metadata.load({ refresh: true });
    pendingConflict = null;
    patchState({
      syncStatus: metadata.dirty ? 'dirty' : 'idle',
      conflict: null, error: null, lastSyncedAt: syncedAt,
      ...completedOwnershipState(),
    });
    if (metadata.dirty) schedule();
  }

  async function upload(
    expectedRevision, userId = currentUser?.id, token = generation,
  ) {
    assertCurrent(userId, token);
    const captured = await captureLocalSnapshot();
    assertCurrent(userId, token);
    if (captured.owner !== userId || captured.epoch !== metadata.epoch) {
      throw new CloudSyncError('账号数据状态已变化，请重新同步', 'sync_cancelled');
    }
    const { snapshot, bytes } = assertSnapshotSize(captured.snapshot, maxSnapshotBytes);
    let remote;
    if (expectedRevision === 0) {
      try {
        remote = await insertRemote(userId, snapshot, bytes);
      } catch (error) {
        if (error?.code === '23505') {
          const latest = await fetchRemote(userId);
          assertCurrent(userId, token);
          throw await enterConflict('cloud-created-elsewhere', snapshot, latest);
        }
        throw error;
      }
    } else {
      remote = await updateRemote(userId, expectedRevision, snapshot, bytes);
      if (!remote) {
        const latest = await fetchRemote(userId);
        assertCurrent(userId, token);
        throw await enterConflict('revision-mismatch', snapshot, latest);
      }
    }
    assertCurrent(userId, token);
    await metadata.load({ refresh: true });
    if (metadata.owner !== userId || metadata.epoch !== captured.epoch) {
      throw new CloudSyncError('账号数据状态已变化，请重新登录', 'sync_cancelled');
    }
    const changedDuringUpload = metadata.changeSeq !== captured.changeSeq;
    await establishOwner(userId, remote.revision, {
      dirty: changedDuringUpload,
      syncedAt: remote.updated_at || now().toISOString(),
      unlock: transitionReason !== 'safe-signout',
      expectedChangeSeq: captured.changeSeq,
      expectedContext: captured,
    });
    await metadata.load({ refresh: true });
    pendingConflict = null;
    patchState({
      syncStatus: metadata.dirty ? 'dirty' : 'idle',
      conflict: null,
      error: null,
      lastSyncedAt: metadata.lastSyncedAt,
      ...completedOwnershipState(),
    });
    if (metadata.dirty) schedule();
    return remote;
  }

  async function bootstrap(user, token) {
    await metadata.load({ refresh: true });
    await metadata.flush();
    transitionReason = 'login-ownership-check';
    clearTimer();
    patchState({
      syncStatus: 'syncing', conflict: null, error: null,
      lastSyncedAt: metadata.lastSyncedAt,
      ownershipPending: true,
      transitionReason: 'login-ownership-check',
    });
    const previousOwner = metadata.owner;
    if (previousOwner && previousOwner !== user.id) {
      if (metadata.dirty || metadata.writeLocked) {
        await beginTransition('owner-locked');
        transitionReason = 'owner-locked';
        patchState({
          syncStatus: 'locked', ownershipPending: true, transitionReason,
          error: '这台设备保留着另一个账号尚未同步的数据，请重新登录原账号完成同步',
        });
        currentUser = null;
        throw new CloudSyncError('另一个账号的未同步数据已锁定保留', 'owner_locked');
      }
      await beginTransition('account-switch');
      await clearLocal('account-switch');
      await metadata.clear({ keepLocked: true });
    } else if (previousOwner === user.id) {
      // A valid local session for the durable owner is enough to restore local
      // use immediately. Remote availability affects sync status, not privacy.
      if (metadata.writeLocked) {
        await metadata.update({ epoch: metadata.epoch + 1, writeLocked: false });
      }
      transitionReason = null;
      patchState({ ownershipPending: false, transitionReason: null });
    } else {
      // Freeze both an existing account realm and an unowned guest realm while
      // ownership/remote revision is being checked. A timeout therefore cannot
      // expose a writable account snapshot as ordinary local data.
      await beginTransition('login-ownership-check');
    }
    const captured = await captureLocalSnapshot();
    const local = captured.snapshot;
    const remote = await fetchRemoteNotOlderThanMetadata(user.id, token, captured);
    if (token !== generation || currentUser?.id !== user.id) return;
    await metadata.load({ refresh: true });
    const owner = metadata.owner;

    if (!remote) {
      if (!owner && snapshotHasUserData(local)) {
        await enterConflict('orphan-local-data', local, null);
        return;
      }
      if (owner && metadata.revision > 0) {
        await enterConflict('cloud-missing', local, null);
        return;
      }
      const needsUpload = owner === user.id && metadata.dirty;
      await establishOwner(user.id, 0, {
        dirty: needsUpload,
        unlock: !needsUpload,
        expectedChangeSeq: captured.changeSeq,
        expectedContext: captured,
      });
      if (needsUpload) {
        await upload(0, user.id, token);
      } else {
        patchState({
          syncStatus: 'idle', conflict: null, error: null,
          ownershipPending: false, transitionReason: null,
        });
      }
      return;
    }

    if (!owner) {
      if (snapshotHasUserData(local)) {
        await enterConflict('device-and-cloud', local, remote);
        return;
      }
      await applyRemote(remote, 'cloud-login', user.id, token, captured);
      return;
    }

    if (owner !== user.id) {
      throw new CloudSyncError('本地账号归属校验失败，已停止同步', 'owner_mismatch');
    }
    const localRevision = metadata.revision;
    if (localRevision === remote.revision) {
      if (metadata.dirty) await upload(localRevision, user.id, token);
      else await markSynced(remote, user.id, token, captured);
      return;
    }
    if (remote.revision < localRevision) {
      throw new CloudSyncError('云端版本低于本地已确认版本，已停止回退', 'remote_stale');
    }
    // 上一次写入可能已经到达服务器，但客户端在收到/处理确认响应前中断。
    // 若云端新 revision 与当前本机业务数据完全一致（只忽略每次导出都会变化的
    // exportedAt），直接补记同步元数据，避免制造一个并不存在的数据冲突。
    if (metadata.dirty && snapshotsHaveSameData(local, remote.payload)) {
      await markSynced(remote, user.id, token, captured);
      return;
    }
    if (metadata.dirty || (localRevision === 0 && snapshotHasUserData(local))) {
      await enterConflict('revision-mismatch', local, remote);
      return;
    }
    await applyRemote(remote, 'cloud-newer', user.id, token, captured);
  }

  async function suspend({ reason = 'auth-lost', preserveOwned = false } = {}) {
    generation += 1;
    clearTimer();
    await metadata.load({ refresh: true });
    const ownedBeforeSuspend = Boolean(metadata.owner);
    if (ownedBeforeSuspend) await beginTransition(reason);
    if (activeSync) {
      try { await activeSync; } catch { /* 失效的旧会话请求不得继续落地 */ }
    }
    await metadata.load({ refresh: true });
    await metadata.flush();
    currentUser = null;
    const owned = Boolean(metadata.owner);
    // 用户明确选择“保留本机记录并退出”时，即使当前 metadata 不脏也不能清库。
    // 云端请求已经失败，不能据此证明本机副本可安全丢弃；将其锁住，待原账号
    // 重新登录后再协商版本。
    const preserved = owned && (preserveOwned || metadata.dirty || Boolean(pendingConflict));
    if (!owned) transitionReason = null;
    patchState({
      syncStatus: preserved ? 'locked' : 'idle',
      error: preserved ? '登录状态已失效；未同步的本机数据已锁定保留，重新登录后才能继续同步' : null,
      conflict: state.conflict,
      lastSyncedAt: metadata.lastSyncedAt,
      ownershipPending: preserved,
      transitionReason: preserved ? reason : null,
    });
    return { ...publicState(), preserved, owned, reason };
  }

  async function detach({ forceClear = false, preserveOwned = false, reason = 'auth-lost' } = {}) {
    const suspended = await suspend({ reason, preserveOwned });
    if (!forceClear && suspended.preserved) return suspended;
    if (!forceClear && !suspended.owned) {
      if (metadata.writeLocked) await metadata.clear();
      transitionReason = null;
      patchState({ ownershipPending: false, transitionReason: null, error: null });
      return { ...publicState(), preserved: false, owned: false, reason };
    }
    await clearLocal(reason);
    await metadata.clear();
    transitionReason = null;
    pendingConflict = null;
    patchState({
      syncStatus: 'idle', conflict: null, error: null, lastSyncedAt: null,
      ownershipPending: false, transitionReason: null,
    });
    return { ...publicState(), preserved: false, cleared: true, reason };
  }

  async function setUser(user) {
    if (!user?.id) return detach({ reason: 'unexpected-signout' });
    const token = ++generation;
    clearTimer();
    // syncNow 可能正在为旧账号落地快照。先使它失效并等待收尾，再清库/装入新账号，
    // 避免旧请求在账号切换后把旧账号数据写回 IndexedDB。
    if (activeSync) {
      try { await activeSync; } catch { /* 失效或网络错误均由后续账号状态接管 */ }
    }
    if (token !== generation) return publicState();
    pendingConflict = null;
    currentUser = user;
    try {
      await bootstrap(currentUser, token);
      if (!['conflict', 'locked'].includes(state.syncStatus)) {
        patchState(completedOwnershipState());
      }
      return publicState();
    } catch (error) {
      const normalized = asSyncError(error);
      if (['owner_locked', 'owner_mismatch', 'account_data_locked'].includes(normalized.code)) {
        patchState({
          syncStatus: 'locked', ownershipPending: true,
          transitionReason: transitionReason || 'owner-locked',
          error: normalized.message,
        });
        throw normalized;
      }
      if (normalized.code !== 'cloud_conflict') {
        patchState({ syncStatus: metadata.dirty ? 'dirty' : 'error', error: normalized.message });
      }
      throw normalized;
    }
  }

  async function performSync() {
    await metadata.load({ refresh: true });
    await metadata.flush();
    if (!currentUser) throw new CloudSyncError('请先登录账号再同步', 'not_signed_in');
    if (pendingConflict) throw new CloudConflictError();
    const userId = currentUser.id;
    const token = generation;
    if (metadata.owner !== currentUser.id) {
      await bootstrap(currentUser, generation);
      if (pendingConflict) throw new CloudConflictError();
      return publicState();
    }
    patchState({ syncStatus: 'syncing', error: null });
    let captured = await captureLocalSnapshot();
    let local = captured.snapshot;
    assertCurrent(userId, token);
    const remote = await fetchRemoteNotOlderThanMetadata(userId, token, captured);
    assertCurrent(userId, token);
    await metadata.load({ refresh: true });
    if (metadata.changeSeq !== captured.changeSeq) {
      captured = await captureLocalSnapshot();
      local = captured.snapshot;
    }
    const expectedRevision = metadata.revision;

    if (!remote) {
      if (expectedRevision > 0) throw await enterConflict('cloud-missing', local, null);
      await upload(0, userId, token);
      return publicState();
    }
    if (remote.revision > expectedRevision) {
      if (metadata.dirty) {
        if (snapshotsHaveSameData(local, remote.payload)) {
          await markSynced(remote, userId, token, captured);
          return publicState();
        }
        throw await enterConflict('revision-mismatch', local, remote);
      }
      await applyRemote(remote, 'cloud-newer', userId, token, captured);
      return publicState();
    }
    if (remote.revision < expectedRevision) {
      throw new CloudSyncError(
        '云端版本低于本地已确认版本，已停止回退并请稍后重试',
        'remote_stale',
      );
    }
    if (metadata.dirty) await upload(expectedRevision, userId, token);
    else await markSynced(remote, userId, token, captured);
    return publicState();
  }

  async function syncNow() {
    clearTimer();
    if (activeSync) return activeSync;
    activeSync = performSync().catch(async (error) => {
      const normalized = asSyncError(error);
      if (['owner_locked', 'owner_mismatch', 'account_data_locked'].includes(normalized.code)) {
        patchState({
          syncStatus: 'locked', ownershipPending: true,
          transitionReason: transitionReason || 'owner-locked',
          error: normalized.message,
        });
        throw normalized;
      }
      if (!['cloud_conflict', 'sync_cancelled'].includes(normalized.code)) {
        patchState({ syncStatus: 'error', error: normalized.message });
      }
      throw normalized;
    }).finally(() => { activeSync = null; });
    return activeSync;
  }

  async function flush() {
    await metadata.load({ refresh: true });
    await metadata.flush();
    clearTimer();
    if (!currentUser) return publicState();
    if (pendingConflict) throw new CloudConflictError('本机与云端存在冲突，解决后才能安全退出');
    // 本机没有未上传修改时可以直接退出：另一台设备的新 revision 已经安全存在云端，
    // 清掉当前设备的旧副本不会造成数据丢失。旧逻辑在这里仍强制读取云端，网络稍慢
    // 就让用户永远退不出去，同时并没有增加实际的数据安全性。
    if (!metadata.dirty) return {
      ...publicState(), changeSeq: metadata.changeSeq, epoch: metadata.epoch,
    };

    // 只有本机确有待上传修改时，才必须读取远端 revision 后再条件更新，避免覆盖
    // 另一台设备刚写入的版本。
    await syncNow();
    await metadata.load({ refresh: true });
    await metadata.flush();
    if (metadata.dirty || pendingConflict) {
      throw new CloudSyncError('尚有数据未同步，已取消退出以避免丢失', 'unsynced_changes');
    }
    return { ...publicState(), changeSeq: metadata.changeSeq, epoch: metadata.epoch };
  }

  async function resolveConflictImpl(choice) {
    await metadata.load({ refresh: true });
    await metadata.flush();
    if (!['cloud', 'device'].includes(choice)) {
      throw new TypeError("冲突选择只能是 'cloud' 或 'device'");
    }
    if (!currentUser || !pendingConflict) return publicState();
    const userId = currentUser.id;
    const token = generation;
    const originalPending = pendingConflict;
    const originalConflictState = state.conflict;
    const originalOwner = metadata.owner;
    const originalWriteLocked = metadata.writeLocked;
    clearTimer();
    patchState({ syncStatus: 'syncing', error: null });
    try {
      await beginTransition('conflict-resolution');
      const captured = await captureLocalSnapshot();
      const latest = await fetchRemote(userId);
      assertCurrent(userId, token);
      await metadata.load({ refresh: true });
      if (metadata.owner !== captured.owner
        || metadata.epoch !== captured.epoch
        || metadata.changeSeq !== captured.changeSeq) {
        throw new CloudSyncError('解决冲突期间本地数据已变更，请重新选择', 'sync_cancelled');
      }
      if (choice === 'cloud') {
        if (!latest) {
          await clearLocal('conflict-cloud-empty', { guard: {
            owner: captured.owner,
            revision: metadata.revision,
            epoch: captured.epoch,
            changeSeq: captured.changeSeq,
            allowLocked: true,
          } });
          await metadata.clear({ keepLocked: true });
          const claimContext = await metadataGuard({ allowLocked: true });
          await establishOwner(userId, 0, {
            dirty: true,
            expectedChangeSeq: claimContext.changeSeq,
            expectedContext: claimContext,
          });
          await upload(0, userId, token);
          return publicState();
        }
        await applyRemote(latest, 'conflict-cloud', userId, token, captured);
        return publicState();
      }

      // 用户已经明确选择本机版本：以刚读取到的最新 revision 做条件更新，仍防止读取后再次并发覆盖。
      await establishOwner(userId, latest?.revision || 0, {
        dirty: true,
        expectedChangeSeq: captured.changeSeq,
        expectedContext: captured,
      });
      await upload(latest?.revision || 0, userId, token);
      return publicState();
    } catch (error) {
      const normalized = asSyncError(error);
      if (!['owner_locked', 'owner_mismatch', 'account_data_locked'].includes(normalized.code)) {
        pendingConflict = originalPending;
        await metadata.load({ refresh: true });
        if (metadata.owner === originalOwner && metadata.writeLocked !== originalWriteLocked) {
          await metadata.update({
            epoch: metadata.epoch + 1,
            writeLocked: originalWriteLocked,
          });
        }
        const ownershipPending = ['orphan-local-data', 'device-and-cloud']
          .includes(originalPending?.reason);
        transitionReason = ownershipPending ? originalPending.reason : null;
        patchState({
          syncStatus: 'conflict',
          conflict: originalConflictState,
          error: normalized.message,
          ownershipPending,
          transitionReason,
        });
      }
      throw normalized;
    }
  }

  function resolveConflict(choice) {
    if (activeResolution) return activeResolution;
    activeResolution = resolveConflictImpl(choice)
      .finally(() => { activeResolution = null; });
    return activeResolution;
  }

  const unsubscribeWrites = dbApi.subscribeWrites?.((event) => {
    if (event?.source === 'cloud') return;
    if (!currentUser || metadata.owner !== currentUser.id) return;
    // The real DB already advanced this counter in the same transaction. Keep
    // the in-memory copy monotonic until the durable refresh completes.
    void metadata.update({
      dirty: true,
      changeSeq: metadata.changeSeq + 1,
    }).catch((error) => {
      patchState({ syncStatus: 'error', error: String(error?.message || error) });
    });
    patchState({
      syncStatus: pendingConflict ? 'conflict' : 'dirty',
      error: null,
    });
    schedule();
  }) || (() => {});

  function destroy() {
    clearTimer();
    unsubscribeWrites();
    listeners.clear();
    currentUser = null;
  }

  return {
    state,
    subscribe,
    setUser,
    suspend,
    detach,
    syncNow,
    flush,
    resolveConflict,
    beginSafeSignOut,
    cancelTransition,
    destroy,
    get user() { return currentUser; },
    get ownerId() { return metadata.owner; },
    get dirty() { return metadata.dirty; },
    get revision() { return metadata.revision; },
  };
}
