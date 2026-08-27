/**
 * IndexedDB 封装
 * IndexedDB 始终保存当前设备副本；是否同步到当前登录账号由 cloud-sync.js 明确控制。
 */

const DB_NAME = 'health-diet-tracker';
const DB_VERSION = 3;

export const STORES = {
  health: 'health',       // 每日 Apple 健康数据，key = 'YYYY-MM-DD'
  diet: 'diet',           // 饮食条目，key = 自增 id，索引 date
  settings: 'settings',   // 键值对配置
  customFoods: 'customFoods', // 用户自建食物
  training: 'training',   // 每日训练记录，key = 'YYYY-MM-DD'
};

// 内部归属信息绝不能进入 exportAll/importAll，否则会被当作账号数据上传并在设备间复制。
const INTERNAL_STORES = {
  cloudMeta: 'cloudMeta',
};
const CLOUD_META_KEY = 'account-sync';

let dbPromise = null;
const writeListeners = new Set();
let fallbackLockTail = Promise.resolve();
const ACCOUNT_DATA_LOCK = 'health-diet-account-data-v1';
const IMPORT_LIMITS = Object.freeze({
  health: 50_000,
  diet: 200_000,
  settings: 20_000,
  customFoods: 50_000,
  training: 50_000,
  maxDepth: 16,
  maxNodes: 2_000_000,
  maxObjectKeys: 512,
  maxStringLength: 1_000_000,
  maxTotalStringChars: 32 * 1024 * 1024,
});

export class AccountDataLockedError extends Error {
  constructor(message = '账号数据正在切换，请稍后重试') {
    super(message);
    this.name = 'AccountDataLockedError';
    this.code = 'account_data_locked';
  }
}

function validDayKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateJsonValue(root) {
  const seen = new WeakSet();
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  let stringChars = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > IMPORT_LIMITS.maxNodes) throw new Error('导入数据结构过于复杂');
    if (depth > IMPORT_LIMITS.maxDepth) throw new Error('导入数据嵌套过深');
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('导入数据含有非有限数值');
    }
    if (typeof value === 'string') {
      if (value.length > IMPORT_LIMITS.maxStringLength) throw new Error('导入数据含有过长文本');
      stringChars += value.length;
      if (stringChars > IMPORT_LIMITS.maxTotalStringChars) throw new Error('导入数据文本总量过大');
      continue;
    }
    if (value == null || ['boolean', 'number'].includes(typeof value)) continue;
    if (typeof value !== 'object') throw new Error('导入数据含有不支持的值');
    if (seen.has(value)) throw new Error('导入数据含有循环引用');
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > IMPORT_LIMITS.diet) throw new Error('导入数组过大');
      for (let i = value.length - 1; i >= 0; i -= 1) {
        stack.push({ value: value[i], depth: depth + 1 });
      }
      continue;
    }
    const keys = Object.keys(value);
    if (keys.length > IMPORT_LIMITS.maxObjectKeys) throw new Error('导入记录字段过多');
    for (const key of keys) {
      if (key.length > 256 || ['__proto__', 'prototype'].includes(key)) {
        throw new Error('导入记录含有非法字段名');
      }
      stack.push({ value: value[key], depth: depth + 1 });
    }
  }
}

export function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('导入数据必须是对象');
  }
  validateJsonValue(payload);
  const rows = Object.fromEntries(Object.values(STORES).map((store) => {
    const value = payload[store] ?? [];
    if (!Array.isArray(value)) throw new Error(`备份中的 ${store} 不是数组`);
    if (value.length > IMPORT_LIMITS[store]) throw new Error(`备份中的 ${store} 记录过多`);
    if (value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`备份中的 ${store} 含有无效记录`);
    }
    return [store, value];
  }));
  const assertUnique = (store, key, validate) => {
    const seen = new Set();
    for (const row of rows[store]) {
      const value = row[key];
      if (!validate(value)) throw new Error(`备份中的 ${store} 含有无效 ${key}`);
      const token = `${typeof value}:${String(value)}`;
      if (seen.has(token)) throw new Error(`备份中的 ${store} 含有重复 ${key}`);
      seen.add(token);
    }
  };
  assertUnique('health', 'date', validDayKey);
  assertUnique('diet', 'id', (value) => Number.isSafeInteger(value) && value > 0);
  for (const row of rows.diet) {
    if (!validDayKey(row.date)) throw new Error('备份中的 diet 含有无效 date');
  }
  assertUnique('settings', 'key', (value) => typeof value === 'string' && value.length > 0 && value.length <= 256);
  assertUnique('customFoods', 'id', (value) => typeof value === 'string' && value.length > 0 && value.length <= 256);
  assertUnique('training', 'date', validDayKey);
  return rows;
}

export async function withAccountDataLock(action) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request(ACCOUNT_DATA_LOCK, { mode: 'exclusive' }, action);
  }
  const previous = fallbackLockTail;
  let release;
  fallbackLockTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try { return await action(); } finally { release(); }
}

/**
 * 订阅已经成功提交到 IndexedDB 的本地变更。云同步只监听这里，不监听视图刷新，
 * 因此切换日期、重算建议等只读操作不会被误判成需要上传的数据变更。
 */
export function subscribeWrites(listener) {
  if (typeof listener !== 'function') throw new TypeError('写入监听器必须是函数');
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function notifyWrite(detail) {
  const event = { ...detail, at: new Date().toISOString() };
  for (const listener of writeListeners) {
    try { listener(event); } catch (err) { console.error('本地数据写入监听器出错', err); }
  }
}

// 保留旧调用方兼容；不再全局吞事件。云端替换通过 source:'cloud' 精确区分。
export function pauseWriteNotifications() {
  return () => {};
}

export async function withWriteNotificationsPaused(action) {
  return action();
}

export function openDB() {
  if (dbPromise) return dbPromise;
  const opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.health)) {
        db.createObjectStore(STORES.health, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORES.diet)) {
        const s = db.createObjectStore(STORES.diet, { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.customFoods)) {
        db.createObjectStore(STORES.customFoods, { keyPath: 'id' });
      }
      // v1.7.4 起训练计划按天落库；之前只存在页面内存里，刷新就没了
      if (!db.objectStoreNames.contains(STORES.training)) {
        db.createObjectStore(STORES.training, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(INTERNAL_STORES.cloudMeta)) {
        db.createObjectStore(INTERNAL_STORES.cloudMeta, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        if (dbPromise === opening) dbPromise = null;
        db.close();
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      blocked = true;
      const error = new Error('数据库升级被其它旧标签页阻止，请关闭本应用的其它标签页后刷新');
      error.code = 'db_upgrade_blocked';
      reject(error);
    };
  });
  dbPromise = opening;
  return opening;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function writeTransaction(db, stores, {
  source = 'local', expectedContext = null, trackCloudDirty = source === 'local',
  nextCloudMetadata = null,
} = {}) {
  const names = Array.isArray(stores) ? [...stores] : [stores];
  const shouldTrack = trackCloudDirty
    && !names.includes(INTERNAL_STORES.cloudMeta);
  const needsMeta = shouldTrack || Boolean(expectedContext) || Boolean(nextCloudMetadata);
  if (needsMeta && !names.includes(INTERNAL_STORES.cloudMeta)) names.push(INTERNAL_STORES.cloudMeta);
  const transaction = db.transaction(names, 'readwrite');
  if (needsMeta) {
    const metaStore = transaction.objectStore(INTERNAL_STORES.cloudMeta);
    const request = metaStore.get(CLOUD_META_KEY);
    request.onsuccess = () => {
      const row = request.result;
      const value = row?.value && typeof row.value === 'object' ? row.value : {};
      const current = {
        owner: value.owner || null,
        revision: Math.max(0, Number(value.revision) || 0),
        epoch: Number.isSafeInteger(Number(value.epoch)) ? Number(value.epoch) : 0,
        changeSeq: Number.isSafeInteger(Number(value.changeSeq)) ? Number(value.changeSeq) : 0,
        writeLocked: value.writeLocked === true,
      };
      if (expectedContext && (
        (current.writeLocked && expectedContext.allowLocked !== true)
        || current.owner !== expectedContext.owner
        || (expectedContext.revision != null && current.revision !== expectedContext.revision)
        || current.epoch !== expectedContext.epoch
        || (expectedContext.changeSeq != null && current.changeSeq !== expectedContext.changeSeq)
      )) {
        transaction.guardError = new AccountDataLockedError();
        transaction.abort();
        return;
      }
      if (!shouldTrack) return;
      const changeSeq = current.changeSeq + 1;
      metaStore.put({
        key: CLOUD_META_KEY,
        value: {
          owner: current.owner,
          revision: Math.max(0, Number(value.revision) || 0),
          dirty: true,
          lastSyncedAt: value.lastSyncedAt || null,
          changeSeq,
          epoch: current.epoch,
          writeLocked: current.writeLocked,
        },
      });
      return;
    };
    if (nextCloudMetadata) {
      request.onsuccess = () => {
        const row = request.result;
        const value = row?.value && typeof row.value === 'object' ? row.value : {};
        const current = {
          owner: value.owner || null,
          revision: Math.max(0, Number(value.revision) || 0),
          epoch: Number.isSafeInteger(Number(value.epoch)) ? Number(value.epoch) : 0,
          changeSeq: Number.isSafeInteger(Number(value.changeSeq)) ? Number(value.changeSeq) : 0,
          writeLocked: value.writeLocked === true,
        };
        if (expectedContext && (
          (current.writeLocked && expectedContext.allowLocked !== true)
          || current.owner !== expectedContext.owner
          || (expectedContext.revision != null && current.revision !== expectedContext.revision)
          || current.epoch !== expectedContext.epoch
          || (expectedContext.changeSeq != null && current.changeSeq !== expectedContext.changeSeq)
        )) {
          transaction.guardError = new AccountDataLockedError();
          transaction.abort();
          return;
        }
        const nextEpoch = Math.max(0, Number(nextCloudMetadata.epoch) || 0);
        const nextSeq = Math.max(0, Number(nextCloudMetadata.changeSeq) || 0);
        const nextOwner = nextCloudMetadata.owner || null;
        const invalidOwnerChange = (current.owner && nextOwner !== current.owner)
          || (!current.owner && nextOwner && nextEpoch <= current.epoch);
        if (invalidOwnerChange || nextEpoch < current.epoch || nextSeq !== current.changeSeq
          || (nextOwner === current.owner
            && Number(nextCloudMetadata.revision) < current.revision)) {
          transaction.guardError = new AccountDataLockedError();
          transaction.abort();
          return;
        }
        metaStore.put({
          key: CLOUD_META_KEY,
          value: {
            owner: nextCloudMetadata.owner || null,
            revision: Math.max(0, Number(nextCloudMetadata.revision) || 0),
            dirty: nextCloudMetadata.dirty === true,
            lastSyncedAt: nextCloudMetadata.lastSyncedAt || null,
            changeSeq: nextSeq,
            epoch: nextEpoch,
            writeLocked: nextCloudMetadata.writeLocked === true,
          },
        });
      };
    }
  }
  return transaction;
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function readWriteContext(db) {
  const row = await wrap(tx(db, INTERNAL_STORES.cloudMeta, 'readonly').get(CLOUD_META_KEY));
  const value = row?.value && typeof row.value === 'object' ? row.value : {};
  return {
    owner: value.owner || null,
    epoch: Number.isSafeInteger(Number(value.epoch)) ? Number(value.epoch) : 0,
    changeSeq: Number.isSafeInteger(Number(value.changeSeq)) ? Number(value.changeSeq) : 0,
    writeLocked: value.writeLocked === true,
  };
}

async function guardedBusinessWrite(action) {
  const db = await openDB();
  const expectedContext = await readWriteContext(db);
  if (expectedContext.writeLocked) throw new AccountDataLockedError();
  return withAccountDataLock(() => action(db, expectedContext));
}

function committedWrite(db, store, operation, action, {
  notify = true, source = 'local', expectedContext = null,
} = {}) {
  return new Promise((resolve, reject) => {
    const transaction = writeTransaction(db, store, {
      source, expectedContext, trackCloudDirty: notify && source === 'local',
    });
    const objectStore = transaction.objectStore(store);
    let result;
    let request;
    try {
      request = action(objectStore);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => {
      if (notify) notifyWrite({ operation, stores: [store], count: 1, source });
      resolve(result);
    };
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(
      transaction.guardError || transaction.error || request.error || new Error('本地写入已回滚'),
    );
  });
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').get(key));
}

export async function put(store, value) {
  return guardedBusinessWrite((db, expectedContext) => committedWrite(
    db, store, 'put', (objectStore) => objectStore.put(value), { expectedContext },
  ));
}

export async function del(store, key) {
  return guardedBusinessWrite((db, expectedContext) => committedWrite(
    db, store, 'delete', (objectStore) => objectStore.delete(key), { expectedContext },
  ));
}

export async function clear(store) {
  return guardedBusinessWrite((db, expectedContext) => committedWrite(
    db, store, 'clear', (objectStore) => objectStore.clear(), { expectedContext },
  ));
}

/** 批量写入（导入健康数据时一次几千天也不卡） */
export async function bulkPut(store, values, { merge = false } = {}) {
  return guardedBusinessWrite((db, expectedContext) => new Promise((resolve, reject) => {
    const t = writeTransaction(db, store, { expectedContext });
    const os = t.objectStore(store);
    let written = 0;
    for (const value of values) {
      if (merge && value?.date) {
        const g = os.get(value.date);
        g.onsuccess = () => {
          // 新数据覆盖同名字段，但保留旧数据里本次没带的字段（例如手动补录的体重）
          os.put({ ...(g.result || {}), ...value });
        };
      } else {
        os.put(value);
      }
      written += 1;
    }
    t.oncomplete = () => {
      notifyWrite({ operation: 'bulk-put', stores: [store], count: written, source: 'local' });
      resolve(written);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.guardError || t.error);
  }));
}

/** 在同一个事务里写入完整行并删除已失效的主键，供全量快照同步使用。 */
export async function bulkSync(store, values = [], deleteKeys = []) {
  return guardedBusinessWrite((db, expectedContext) => new Promise((resolve, reject) => {
    const t = writeTransaction(db, store, { expectedContext });
    const os = t.objectStore(store);
    for (const key of deleteKeys) os.delete(key);
    for (const value of values) os.put(value);
    t.oncomplete = () => {
      notifyWrite({
        operation: 'bulk-sync', stores: [store], count: values.length,
        deleted: deleteKeys.length, source: 'local',
      });
      resolve({ written: values.length, deleted: deleteKeys.length });
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.guardError || t.error);
  }));
}

export async function getDietByDate(date) {
  const db = await openDB();
  const idx = db.transaction(STORES.diet, 'readonly').objectStore(STORES.diet).index('date');
  return wrap(idx.getAll(IDBKeyRange.only(date)));
}

/** 设置项读写（内部用键值对存储） */
export async function getSetting(key, fallback = null) {
  const row = await get(STORES.settings, key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  return put(STORES.settings, { key, value });
}

/**
 * 账号归属/revision/dirty 的耐久副本。它与业务数据同在 IndexedDB，但使用独立 store，
 * 不参与备份、恢复或云快照，避免 localStorage 被清后把旧账号数据误认成访客数据。
 */
export async function getCloudSyncMetadata() {
  const db = await openDB();
  const row = await wrap(tx(db, INTERNAL_STORES.cloudMeta, 'readonly').get(CLOUD_META_KEY));
  return row?.value && typeof row.value === 'object' ? row.value : null;
}

export async function setCloudSyncMetadata(value, {
  allowClearDirty = false, expectedContext = null, requireContext = false,
} = {}) {
  const db = await openDB();
  return withAccountDataLock(() => new Promise((resolve, reject) => {
    const transaction = db.transaction(INTERNAL_STORES.cloudMeta, 'readwrite');
    const store = transaction.objectStore(INTERNAL_STORES.cloudMeta);
    const request = store.get(CLOUD_META_KEY);
    let saved;
    request.onsuccess = () => {
      const current = request.result?.value || {};
      const hasCurrent = Boolean(request.result);
      const currentEpoch = Math.max(0, Number(current.epoch) || 0);
      const nextEpoch = Math.max(0, Number(value?.epoch) || 0);
      if (nextEpoch < currentEpoch) {
        transaction.guardError = new AccountDataLockedError('账号数据状态已变化，请重新登录后重试');
        transaction.abort();
        return;
      }
      const currentSeq = Math.max(0, Number(current.changeSeq) || 0);
      const requestedSeq = Math.max(0, Number(value?.changeSeq) || 0);
      const hasNewerWrite = currentSeq > requestedSeq;
      const sameEpoch = nextEpoch === currentEpoch;
      const currentOwner = current.owner || null;
      const requestedOwner = value?.owner || null;
      if (hasCurrent && currentOwner && requestedOwner !== currentOwner) {
        transaction.guardError = new AccountDataLockedError('账号归属切换必须先完成受保护的清理过渡');
        transaction.abort();
        return;
      }
      if (hasCurrent && !currentOwner && requestedOwner && nextEpoch <= currentEpoch) {
        transaction.guardError = new AccountDataLockedError('账号数据已被其它标签页认领');
        transaction.abort();
        return;
      }
      if (hasCurrent && sameEpoch && currentOwner !== requestedOwner) {
        transaction.guardError = new AccountDataLockedError('账号数据归属已被其它标签页改变');
        transaction.abort();
        return;
      }
      const sameOwner = currentOwner === requestedOwner;
      const clearContextMatches = Boolean(expectedContext)
        && currentOwner === (expectedContext.owner || null)
        && currentEpoch === Number(expectedContext.epoch)
        && currentSeq === Number(expectedContext.changeSeq);
      const boundaryContextMatches = Boolean(expectedContext)
        && currentOwner === (expectedContext.owner || null)
        && currentEpoch === Number(expectedContext.epoch);
      const mayClearDirty = allowClearDirty && clearContextMatches;
      if (requireContext && !boundaryContextMatches) {
        transaction.guardError = new AccountDataLockedError('账号数据状态已变更');
        transaction.abort();
        return;
      }
      const currentTime = Date.parse(current.lastSyncedAt || '') || 0;
      const requestedTime = Date.parse(value?.lastSyncedAt || '') || 0;
      saved = {
        owner: requestedOwner,
        revision: sameOwner
          ? Math.max(0, Number(current.revision) || 0, Number(value?.revision) || 0)
          : Math.max(0, Number(value?.revision) || 0),
        dirty: hasNewerWrite || (current.dirty === true && value?.dirty !== true && !mayClearDirty)
          ? true : value?.dirty === true,
        lastSyncedAt: sameOwner && currentTime > requestedTime
          ? current.lastSyncedAt : (value?.lastSyncedAt || null),
        changeSeq: Math.max(currentSeq, requestedSeq),
        epoch: nextEpoch,
        // Clearing a durable lock always requires an epoch advance. This
        // prevents a stale same-epoch writer in another tab from unlocking it.
        writeLocked: sameEpoch && current.writeLocked
          ? true : value?.writeLocked === true,
      };
      store.put({ key: CLOUD_META_KEY, value: saved });
    };
    transaction.oncomplete = () => resolve(saved);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(
      transaction.guardError || transaction.error || new AccountDataLockedError(),
    );
  }));
}

export async function clearCloudSyncMetadata({
  writeLocked = false, expectedContext = null,
} = {}) {
  const db = await openDB();
  return withAccountDataLock(() => new Promise((resolve, reject) => {
    const transaction = db.transaction(INTERNAL_STORES.cloudMeta, 'readwrite');
    const store = transaction.objectStore(INTERNAL_STORES.cloudMeta);
    const request = store.get(CLOUD_META_KEY);
    let tombstone;
    request.onsuccess = () => {
      const current = request.result?.value || {};
      const currentOwner = current.owner || null;
      const currentRevision = Math.max(0, Number(current.revision) || 0);
      const currentSeq = Math.max(0, Number(current.changeSeq) || 0);
      const currentEpoch = Math.max(0, Number(current.epoch) || 0);
      if (!expectedContext
        || currentOwner !== (expectedContext.owner || null)
        || currentRevision !== Number(expectedContext.revision)
        || currentSeq !== Number(expectedContext.changeSeq)
        || currentEpoch !== Number(expectedContext.epoch)) {
        transaction.guardError = new AccountDataLockedError('账号数据已在其它标签页变更，已取消清理');
        transaction.abort();
        return;
      }
      tombstone = {
        owner: null,
        revision: 0,
        dirty: false,
        lastSyncedAt: null,
        changeSeq: currentSeq,
        epoch: currentEpoch + 1,
        writeLocked: writeLocked === true,
      };
      store.put({ key: CLOUD_META_KEY, value: tombstone });
    };
    transaction.oncomplete = () => resolve(tombstone);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(
      transaction.guardError || transaction.error || new AccountDataLockedError(),
    );
  }));
}

/** 导出全部数据（用于备份 / 换设备） */
export async function exportAllWithCloudMetadata() {
  const db = await openDB();
  return withAccountDataLock(() => new Promise((resolve, reject) => {
    const names = [...Object.values(STORES), INTERNAL_STORES.cloudMeta];
    const transaction = db.transaction(names, 'readonly');
    const requests = Object.fromEntries(Object.values(STORES).map((store) => [
      store, transaction.objectStore(store).getAll(),
    ]));
    const metaRequest = transaction.objectStore(INTERNAL_STORES.cloudMeta).get(CLOUD_META_KEY);
    transaction.oncomplete = () => resolve({
      snapshot: {
        app: 'health-diet-tracker',
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        health: requests.health.result,
        diet: requests.diet.result,
        settings: requests.settings.result,
        customFoods: requests.customFoods.result,
      },
      metadata: metaRequest.result?.value || null,
    });
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('读取本地快照失败'));
  }));
}

export async function exportAll() {
  const { snapshot } = await exportAllWithCloudMetadata();
  return snapshot;
}

/** 导入备份 */
export async function importAll(payload, {
  source = 'local', guard = null, cloudMetadata = null,
} = {}) {
  if (payload?.app !== 'health-diet-tracker') throw new Error('不是本应用导出的备份文件');
  if (payload.version != null
    && (!Number.isInteger(Number(payload.version)) || Number(payload.version) < 1)) {
    throw new Error('备份文件版本无效');
  }
  if (Number(payload.version) > DB_VERSION) {
    throw new Error('备份来自更新版本的应用，请先升级后再导入');
  }

  const names = Object.values(STORES);
  const rowsByStore = validateImportPayload(payload);

  // 所有清空和写入放在同一个事务：任意一条写入失败，IndexedDB 会整体回滚，
  // 不会再留下“健康数据已清空、饮食只恢复一半”的状态。
  const replace = (db, expectedContext = null) => new Promise((resolve, reject) => {
    const t = writeTransaction(db, names, {
      source, expectedContext, nextCloudMetadata: cloudMetadata,
    });
    try {
      for (const store of names) {
        const os = t.objectStore(store);
        os.clear();
        for (const row of rowsByStore[store]) os.put(row);
      }
    } catch (err) {
      t.abort();
      reject(err);
      return;
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.guardError || t.error || new Error('备份导入已回滚'));
  });
  if (source === 'local') {
    await guardedBusinessWrite((db, expectedContext) => replace(db, expectedContext));
  } else {
    const db = await openDB();
    await withAccountDataLock(() => replace(db, guard));
  }
  notifyWrite({
    operation: 'import-all', stores: names,
    count: names.reduce((total, store) => total + rowsByStore[store].length, 0),
    source,
  });
  return Object.fromEntries(names.map((store) => [store, rowsByStore[store].length]));
}

/** 原子清空所有业务数据，供安全退出账号和“清除全部数据”共同使用。 */
export async function clearAllStores({ source = 'local', guard = null } = {}) {
  const names = Object.values(STORES);
  const clearStores = (db, expectedContext = null) => new Promise((resolve, reject) => {
    const t = writeTransaction(db, names, { source, expectedContext });
    try {
      for (const store of names) t.objectStore(store).clear();
    } catch (err) {
      t.abort();
      reject(err);
      return;
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.guardError || t.error || new Error('清空本地数据失败'));
  });
  if (source === 'local') {
    await guardedBusinessWrite((db, expectedContext) => clearStores(db, expectedContext));
  } else {
    const db = await openDB();
    await withAccountDataLock(() => clearStores(db, guard));
  }
  notifyWrite({ operation: 'clear-all', stores: names, source });
}
