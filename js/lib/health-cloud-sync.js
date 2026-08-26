import { readCloudConfig } from '../config/cloud.js';
import {
  CLOUD_HEALTH_SELECT, cloudHealthRange, newerCloudHealthDays,
} from '../core/cloud-health.js';
import { getAccountState, getCloudClient } from './account.js';
import { mergeHealthDays, state as storeState } from './store.js';

const INITIAL_STATE = Object.freeze({
  status: 'idle',
  userId: null,
  devices: [],
  lastPulledAt: null,
  lastCloudUpdateAt: null,
  importedDays: 0,
  credential: null,
  error: null,
});

export const healthCloudState = { ...INITIAL_STATE, devices: [] };
const listeners = new Set();
let activePull = null;
let activePullUserId = null;
let activeDeviceRefresh = null;

function snapshot() {
  return {
    ...healthCloudState,
    devices: healthCloudState.devices.map((device) => ({ ...device })),
    credential: healthCloudState.credential ? { ...healthCloudState.credential } : null,
  };
}

function patch(next) {
  Object.assign(healthCloudState, next);
  const value = snapshot();
  for (const listener of listeners) {
    try { listener(value); } catch (error) { console.error('自动健康同步监听器出错', error); }
  }
}

export function subscribeHealthCloud(listener) {
  if (typeof listener !== 'function') throw new TypeError('健康同步监听器必须是函数');
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

function cloudError(error, fallback) {
  const raw = String(error?.message || '');
  let message = raw || fallback;
  if (/too many active devices/i.test(raw) || error?.code === '54000') {
    message = '当前账号最多连接 10 台设备，请先撤销不用的设备';
  } else if (/not authenticated|jwt/i.test(raw) || error?.code === '28000') {
    message = '登录状态已失效，请重新登录';
  } else if (/could not find the table|relation .* does not exist/i.test(raw)
    || error?.code === 'PGRST205') {
    message = '自动同步服务尚未完成部署，请稍后再试';
  }
  const next = new Error(message);
  next.code = error?.code || 'health_cloud_error';
  return next;
}

function patchOperationError(error) {
  if (error?.code === 'health_account_changed') resetHealthCloudState();
  else patch({ status: 'error', error: error.message });
}

function connection() {
  const account = getAccountState();
  const client = getCloudClient();
  if (!account.user || !client) throw cloudError(null, '请先登录账号再配置自动同步');
  if (account.ownershipPending || ['locked', 'conflict'].includes(account.status)) {
    throw cloudError(null, '请先完成账号数据确认，再配置自动同步');
  }
  return { account, client };
}

function accountIsCurrent(userId) {
  const current = getAccountState();
  return current.user?.id === userId
    && !current.ownershipPending
    && !['locked', 'conflict'].includes(current.status);
}

function assertCurrentAccount(userId) {
  if (!accountIsCurrent(userId)) {
    const error = cloudError(null, '账号已切换，旧同步请求已安全丢弃');
    error.code = 'health_account_changed';
    throw error;
  }
}

function randomToken() {
  if (!globalThis.crypto?.getRandomValues) throw cloudError(null, '当前浏览器无法安全生成设备令牌');
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `hds_${globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

async function tokenHash(token) {
  if (!globalThis.crypto?.subtle) throw cloudError(null, '当前页面不是安全连接，无法生成同步令牌');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(token),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function healthSyncEndpoint() {
  const base = readCloudConfig().supabaseUrl.replace(/\/+$/, '');
  return base ? `${base}/functions/v1/health-sync` : '';
}

async function queryDevices(client) {
  const result = await client.from('health_sync_devices')
    .select('id,device_name,created_at,last_sync_at,revoked_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (result.error) throw cloudError(result.error, '读取同步设备失败');
  return (result.data || []).map((device) => ({ ...device }));
}

export async function refreshHealthSyncDevices() {
  if (activeDeviceRefresh) return activeDeviceRefresh;
  activeDeviceRefresh = (async () => {
    const { account, client } = connection();
    const devices = await queryDevices(client);
    assertCurrentAccount(account.user.id);
    patch({ userId: account.user.id, devices, error: null });
    return devices;
  })().catch((error) => {
    patchOperationError(error);
    throw error;
  }).finally(() => { activeDeviceRefresh = null; });
  return activeDeviceRefresh;
}

async function fetchHealthRows(client, { updatedAfter = null } = {}) {
  const rows = [];
  const pageSize = 500;
  const maxRows = 20000;
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = client.from('health_daily').select(CLOUD_HEALTH_SELECT);
    if (updatedAfter) {
      // 包含游标本身，避免两笔提交恰好同一时间戳时漏掉后到的日期；
      // newerCloudHealthDays 会把已经落地的同版本行过滤掉。
      query = query.gte('updated_at', updatedAfter)
        .order('updated_at', { ascending: true })
        .order('date', { ascending: true });
    } else {
      query = query.order('date', { ascending: true });
    }
    const result = await query.range(from, from + pageSize - 1);
    if (result.error) throw cloudError(result.error, '读取账号健康数据失败');
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw cloudError(null, '账号健康数据超过 20000 天，请联系维护者处理');
}

export async function pullAccountHealth({ minIntervalMs = 0 } = {}) {
  const account = getAccountState();
  if (!account.user || account.ownershipPending
    || ['locked', 'conflict', 'loading'].includes(account.status)) return { skipped: true };
  if (healthCloudState.userId && healthCloudState.userId !== account.user.id) {
    patch({ ...INITIAL_STATE, userId: account.user.id, devices: [] });
  }
  const previousPull = Date.parse(healthCloudState.lastPulledAt || '');
  if (minIntervalMs > 0 && Number.isFinite(previousPull)
    && Date.now() - previousPull < minIntervalMs) return { skipped: true };
  if (activePull) {
    if (activePullUserId === account.user.id) return activePull;
    return activePull.catch(() => {}).then(() => pullAccountHealth({ minIntervalMs: 0 }));
  }

  const pullUserId = account.user.id;
  activePullUserId = pullUserId;
  activePull = (async () => {
    const { account: current, client } = connection();
    patch({ status: 'pulling', userId: current.user.id, error: null });
    const updatedAfter = healthCloudState.lastCloudUpdateAt;
    const [devices, rows] = await Promise.all([
      queryDevices(client), fetchHealthRows(client, { updatedAfter }),
    ]);
    assertCurrentAccount(current.user.id);
    const fresh = newerCloudHealthDays(rows, storeState.healthDays);
    if (fresh.length) {
      const range = cloudHealthRange(rows);
      await mergeHealthDays(fresh, {
        sourceFormat: 'account-health-sync',
        fullSnapshot: false,
        cloudSync: true,
        range,
        quality: { invalidRecords: 0, duplicateRecords: 0, multiSourceDays: 0 },
      });
    }
    assertCurrentAccount(current.user.id);
    const lastCloudUpdateAt = rows.reduce((latest, row) => {
      const time = Date.parse(row.updated_at || row.captured_at || '');
      const latestTime = Date.parse(latest || '') || 0;
      return Number.isFinite(time) && time > latestTime
        ? (row.updated_at || row.captured_at) : latest;
    }, healthCloudState.lastCloudUpdateAt);
    const lastPulledAt = new Date().toISOString();
    patch({
      status: 'idle', devices, lastPulledAt, lastCloudUpdateAt,
      importedDays: fresh.length, error: null,
    });
    return { skipped: false, importedDays: fresh.length, rows: rows.length, devices };
  })().catch((error) => {
    if (!accountIsCurrent(pullUserId)) {
      resetHealthCloudState();
      return { skipped: true };
    }
    patch({ status: 'error', error: error.message });
    throw error;
  }).finally(() => {
    if (activePullUserId === pullUserId) {
      activePull = null;
      activePullUserId = null;
    }
  });
  return activePull;
}

export async function createHealthSyncDevice(deviceName) {
  const name = String(deviceName || '').trim();
  if (!name || name.length > 80) throw cloudError(null, '设备名称应为 1–80 个字符');
  const { account, client } = connection();
  patch({ status: 'creating', error: null });
  try {
    const token = randomToken();
    const hash = await tokenHash(token);
    const result = await client.rpc('register_health_sync_device', {
      p_device_name: name,
      p_token_hash: hash,
    });
    if (result.error) throw cloudError(result.error, '创建同步设备失败');
    assertCurrentAccount(account.user.id);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    const credential = {
      endpoint: healthSyncEndpoint(), token, deviceId: row?.device_id || null,
      deviceName: row?.device_name || name, createdAt: row?.created_at || new Date().toISOString(),
    };
    const devices = await queryDevices(client);
    assertCurrentAccount(account.user.id);
    patch({ status: 'idle', userId: account.user.id, devices, credential, error: null });
    return { ...credential };
  } catch (error) {
    patchOperationError(error);
    throw error;
  }
}

export async function revokeHealthSyncDevice(deviceId) {
  const { account, client } = connection();
  patch({ status: 'revoking', error: null });
  try {
    const result = await client.rpc('revoke_health_sync_device', { p_device_id: deviceId });
    if (result.error) throw cloudError(result.error, '撤销同步设备失败');
    if (result.data !== true) throw cloudError(null, '没有找到这个同步设备');
    assertCurrentAccount(account.user.id);
    const devices = await queryDevices(client);
    assertCurrentAccount(account.user.id);
    patch({ status: 'idle', devices, error: null });
    return true;
  } catch (error) {
    patchOperationError(error);
    throw error;
  }
}

export async function clearAccountHealthSyncData() {
  const { account, client } = connection();
  const result = await client.rpc('clear_health_sync_data');
  if (result.error) throw cloudError(result.error, '清空账号健康同步数据失败');
  assertCurrentAccount(account.user.id);
  patch({ ...INITIAL_STATE, devices: [] });
  return result.data;
}

export function forgetGeneratedHealthSyncCredential() {
  patch({ credential: null });
}

export function resetHealthCloudState() {
  patch({ ...INITIAL_STATE, devices: [] });
}
