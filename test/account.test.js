import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudAuth } from '../js/lib/cloud-auth.js';
import {
  CloudConflictError, createCloudSync,
} from '../js/lib/cloud-sync.js';
import { createAccountController } from '../js/lib/account.js';
import { isBrowserSafeSupabaseKey } from '../js/config/cloud.js';
import { validateImportPayload } from '../js/lib/db.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function snapshot(label, { diet = 0, settings = 0, extra = null } = {}) {
  return {
    app: 'health-diet-tracker',
    version: 1,
    exportedAt: '2026-08-24T00:00:00.000Z',
    health: [],
    diet: Array.from({ length: diet }, (_, i) => ({ id: i + 1, date: '2026-08-24', name: label })),
    settings: Array.from({ length: settings }, (_, i) => ({ key: `key-${i}`, value: label })),
    customFoods: [],
    ...(extra ? { extra } : {}),
  };
}

function fakeStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function normalizeMeta(value = {}) {
  return {
    owner: value.owner || null,
    revision: Math.max(0, Number(value.revision) || 0),
    dirty: value.dirty === true,
    lastSyncedAt: value.lastSyncedAt || null,
    changeSeq: Math.max(0, Number(value.changeSeq) || 0),
    epoch: Math.max(0, Number(value.epoch) || 0),
    writeLocked: value.writeLocked === true,
  };
}

function lockedError(message = 'account data locked') {
  const error = new Error(message);
  error.code = 'account_data_locked';
  return error;
}

function fakeDb(initial, initialCloudMetadata = null) {
  let data = clone(initial);
  let cloudMetadata = initialCloudMetadata ? normalizeMeta(initialCloudMetadata) : null;
  const listeners = new Set();
  const api = {
    clearCount: 0,
    beforeImport: null,
    afterImport: null,
    beforeClear: null,
    beforeMetaClear: null,
    async exportAll() { return clone(data); },
    async exportAllWithCloudMetadata() {
      return { snapshot: clone(data), metadata: cloudMetadata ? clone(cloudMetadata) : null };
    },
    assertGuard(guard) {
      if (!guard) return;
      const current = normalizeMeta(cloudMetadata || {});
      if ((current.writeLocked && guard.allowLocked !== true)
        || current.owner !== (guard.owner || null)
        || (guard.revision != null && current.revision !== guard.revision)
        || current.epoch !== guard.epoch
        || (guard.changeSeq != null && current.changeSeq !== guard.changeSeq)) {
        throw lockedError();
      }
    },
    async importAll(next, options = {}) {
      if (api.beforeImport) await api.beforeImport();
      api.assertGuard(options.guard);
      const current = normalizeMeta(cloudMetadata || {});
      if (options.cloudMetadata) {
        const target = normalizeMeta(options.cloudMetadata);
        if ((current.owner && target.owner !== current.owner)
          || (!current.owner && target.owner && target.epoch <= current.epoch)) throw lockedError();
        cloudMetadata = target;
      } else if (options.source !== 'cloud') {
        cloudMetadata = normalizeMeta({
          ...current, dirty: true, changeSeq: current.changeSeq + 1,
        });
      }
      data = clone(next);
      if (api.afterImport) await api.afterImport();
      listeners.forEach((listener) => listener({ operation: 'import-all', source: options.source || 'local' }));
    },
    async getCloudSyncMetadata() { return cloudMetadata ? clone(cloudMetadata) : null; },
    async setCloudSyncMetadata(next, options = {}) {
      const requested = normalizeMeta(next);
      const current = normalizeMeta(cloudMetadata || {});
      const hasCurrent = cloudMetadata != null;
      if (requested.epoch < current.epoch) throw lockedError('stale epoch');
      if (hasCurrent && current.owner && requested.owner !== current.owner) throw lockedError('owner switch');
      if (hasCurrent && !current.owner && requested.owner && requested.epoch <= current.epoch) {
        throw lockedError('claim lost');
      }
      const contextMatches = options.expectedContext
        && current.owner === (options.expectedContext.owner || null)
        && current.epoch === options.expectedContext.epoch
        && current.changeSeq === options.expectedContext.changeSeq;
      const boundaryMatches = options.expectedContext
        && current.owner === (options.expectedContext.owner || null)
        && current.epoch === options.expectedContext.epoch;
      if (options.requireContext && !boundaryMatches) throw lockedError('context changed');
      const newerWrite = current.changeSeq > requested.changeSeq;
      const sameOwner = current.owner === requested.owner;
      cloudMetadata = normalizeMeta({
        ...requested,
        revision: sameOwner ? Math.max(current.revision, requested.revision) : requested.revision,
        lastSyncedAt: sameOwner && String(current.lastSyncedAt || '') > String(requested.lastSyncedAt || '')
          ? current.lastSyncedAt : requested.lastSyncedAt,
        changeSeq: Math.max(current.changeSeq, requested.changeSeq),
        dirty: newerWrite || (current.dirty && !requested.dirty
          && !(options.allowClearDirty && contextMatches)) ? true : requested.dirty,
        writeLocked: requested.epoch === current.epoch && current.writeLocked
          ? true : requested.writeLocked,
      });
      return clone(cloudMetadata);
    },
    async clearCloudSyncMetadata({ writeLocked = false, expectedContext = null } = {}) {
      if (api.beforeMetaClear) await api.beforeMetaClear();
      const current = normalizeMeta(cloudMetadata || {});
      if (!expectedContext
        || current.owner !== (expectedContext.owner || null)
        || current.revision !== expectedContext.revision
        || current.changeSeq !== expectedContext.changeSeq
        || current.epoch !== expectedContext.epoch) throw lockedError('clear context changed');
      cloudMetadata = normalizeMeta({
        changeSeq: current.changeSeq, epoch: current.epoch + 1, writeLocked,
      });
      return clone(cloudMetadata);
    },
    async clearAllStores(options = {}) {
      if (api.beforeClear) await api.beforeClear();
      api.assertGuard(options.guard);
      this.clearCount += 1;
      data = snapshot('empty');
      listeners.forEach((listener) => listener({ operation: 'clear-all', source: options.source || 'local' }));
    },
    subscribeWrites(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mutate(action) {
      const current = normalizeMeta(cloudMetadata || {});
      if (current.writeLocked) throw lockedError();
      action(data);
      cloudMetadata = normalizeMeta({
        ...current, dirty: true, changeSeq: current.changeSeq + 1,
      });
      listeners.forEach((listener) => listener({ operation: 'test', source: 'local' }));
    },
    externalMutate(action, expected = null) {
      const current = normalizeMeta(cloudMetadata || {});
      if (current.writeLocked || (expected && (
        current.owner !== expected.owner || current.epoch !== expected.epoch
      ))) throw lockedError();
      action(data);
      cloudMetadata = normalizeMeta({
        ...current, dirty: true, changeSeq: current.changeSeq + 1,
      });
    },
    read() { return clone(data); },
    readCloudMetadata() { return cloudMetadata ? clone(cloudMetadata) : null; },
    forceMetadata(next) { cloudMetadata = next ? normalizeMeta(next) : null; },
    forceData(next) { data = clone(next); },
  };
  return api;
}

class FakeQuery {
  constructor(client) {
    this.client = client;
    this.action = null;
    this.filters = [];
    this.value = null;
    this.selectedFields = null;
  }

  select(fields = null) {
    this.selectedFields = fields;
    this.client.selectFields.push({ action: this.action || 'select', fields });
    if (!this.action) this.action = 'select';
    return this;
  }

  insert(value) { this.action = 'insert'; this.value = clone(value); return this; }

  update(value) { this.action = 'update'; this.value = clone(value); return this; }

  abortSignal() { return this; }

  eq(key, value) { this.filters.push([key, value]); return this; }

  maybeSingle() { return this.execute(); }

  single() { return this.execute(); }

  project(row) {
    if (!row || !this.selectedFields) return clone(row);
    const fields = this.selectedFields.split(',').map((field) => field.trim()).filter(Boolean);
    return Object.fromEntries(fields
      .filter((field) => Object.hasOwn(row, field))
      .map((field) => [field, clone(row[field])]));
  }

  async execute() {
    const userId = this.filters.find(([key]) => key === 'user_id')?.[1] || this.value?.user_id;
    if (this.client.failQueries) return { data: null, error: { code: 'network', message: 'offline' } };
    if (this.action === 'select') {
      const selected = clone(this.client.rows.get(userId) || null);
      if (this.client.onSelect) await this.client.onSelect({ userId, selected });
      return { data: this.project(selected), error: null };
    }
    if (this.action === 'insert') {
      if (this.client.rows.has(userId)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      if (Object.hasOwn(this.value, 'updated_at')) throw new Error('client must not send updated_at');
      if (this.client.onInsert) await this.client.onInsert({ userId, value: clone(this.value) });
      const inserted = {
        ...clone(this.value), revision: 1,
        updated_at: `2026-08-24T00:01:${String(++this.client.clock).padStart(2, '0')}.000Z`,
      };
      this.client.rows.set(userId, inserted);
      return { data: this.project(inserted), error: null };
    }
    if (this.action === 'update') {
      const row = this.client.rows.get(userId);
      const expected = this.filters.find(([key]) => key === 'revision')?.[1];
      if (!row || row.revision !== expected) return { data: null, error: null };
      if (Object.hasOwn(this.value, 'updated_at')) throw new Error('client must not send updated_at');
      if (this.value.revision !== expected + 1) {
        return { data: null, error: { code: '40001', message: 'invalid revision step' } };
      }
      if (this.client.onUpdate) await this.client.onUpdate({ userId, value: clone(this.value), row: clone(row) });
      const next = {
        ...row, ...clone(this.value),
        updated_at: `2026-08-24T00:01:${String(++this.client.clock).padStart(2, '0')}.000Z`,
      };
      this.client.rows.set(userId, next);
      return { data: this.project(next), error: null };
    }
    throw new Error(`unsupported query ${this.action}`);
  }
}

function fakeClient({ session = null, rows = [], nextSignInUserId = 'signed-in' } = {}) {
  const listeners = new Set();
  const calls = [];
  const client = {
    rows: new Map(rows.map((row) => [row.user_id, clone(row)])),
    calls,
    selectFields: [],
    failQueries: false,
    clock: 0,
    onSelect: null,
    onInsert: null,
    onUpdate: null,
    nextSignInUserId,
    from() { return new FakeQuery(client); },
    emitAuth(event, nextSession) {
      session = nextSession || null;
      listeners.forEach((listener) => listener(event, session));
    },
  };
  client.auth = {
    signOutCalls: 0,
    onAuthStateChange(listener) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async getSession() { return { data: { session }, error: null }; },
    async signUp(input) {
      calls.push(['signUp', input]);
      return { data: { user: { id: 'new', email: input.email }, session: null }, error: null };
    },
    async signInWithPassword(input) {
      calls.push(['signInWithPassword', input]);
      session = {
        user: {
          id: client.nextSignInUserId, email: input.email,
          identities: [{ provider: 'email' }], app_metadata: { providers: ['email'] },
        },
      };
      listeners.forEach((listener) => listener('SIGNED_IN', session));
      return { data: { session, user: session.user }, error: null };
    },
    async signInWithOAuth(input) {
      calls.push(['signInWithOAuth', input]);
      return { data: { provider: input.provider, url: 'https://accounts.google.test' }, error: null };
    },
    async linkIdentity(input) {
      calls.push(['linkIdentity', input]);
      return { data: { provider: input.provider }, error: null };
    },
    async updateUser(input) {
      calls.push(['updateUser', input]);
      if (!session?.user) return { data: {}, error: null };
      session.user = {
        ...session.user,
        identities: [...(session.user.identities || []), { provider: 'email' }],
        app_metadata: { ...(session.user.app_metadata || {}), providers: ['email'] },
      };
      listeners.forEach((listener) => listener('USER_UPDATED', session));
      return { data: { user: session.user }, error: null };
    },
    async resetPasswordForEmail(email, options) {
      calls.push(['resetPasswordForEmail', { email, options }]);
      return { data: {}, error: null };
    },
    async signOut(options) {
      this.signOutCalls += 1;
      calls.push(['signOut', options]);
      session = null;
      listeners.forEach((listener) => listener('SIGNED_OUT', null));
      return { error: null };
    },
  };
  return client;
}

async function waitFor(predicate, message = 'condition') {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(`timed out waiting for ${message}`);
}

function accountUser(id) {
  return {
    id, email: `${id}@example.com`, identities: [{ provider: 'email' }],
    app_metadata: { providers: ['email'] },
  };
}

function unavailableAuthFactory(configured = true) {
  return () => ({
    state: {
      configured, available: false, user: null, providers: [], error: 'offline',
    },
    client: null,
    config: { table: 'user_snapshots' },
    async initialize() { return { ...this.state }; },
    subscribe() { return () => {}; },
    destroy() {},
  });
}

function remoteRow(userId, revision, payload) {
  return {
    user_id: userId,
    schema_version: 1,
    revision,
    payload: clone(payload),
    updated_at: `2026-08-24T00:00:0${revision}.000Z`,
  };
}

test('首次登录且本机来源不明时不自动上传，明确选择本机后才迁移', async () => {
  const db = fakeDb(snapshot('device', { diet: 1 }));
  const client = fakeClient();
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });

  await sync.setUser({ id: 'u1', email: 'a@example.com' });
  assert.equal(sync.state.syncStatus, 'conflict');
  assert.equal(client.rows.has('u1'), false);
  await sync.resolveConflict('device');

  assert.equal(client.rows.get('u1').revision, 1);
  assert.equal(client.rows.get('u1').payload.diet[0].name, 'device');
  assert.equal(sync.ownerId, 'u1');
  assert.equal(sync.dirty, false);
  assert.equal(sync.state.syncStatus, 'idle');
  sync.destroy();
});

test('本机访客数据与既有云数据不会静默互相覆盖，可明确选择云端', async () => {
  const local = snapshot('device', { diet: 1 });
  const cloud = snapshot('cloud', { diet: 2 });
  const db = fakeDb(local);
  const client = fakeClient({ rows: [remoteRow('u1', 4, cloud)] });
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });

  await sync.setUser({ id: 'u1' });
  assert.equal(sync.state.syncStatus, 'conflict');
  assert.equal(db.read().diet[0].name, 'device');

  await sync.resolveConflict('cloud');
  assert.equal(db.read().diet.length, 2);
  assert.equal(db.read().diet[0].name, 'cloud');
  assert.equal(sync.revision, 4);
  sync.destroy();
});

test('明确选择本机数据时仍使用 revision 条件更新，云端版本递增', async () => {
  const local = snapshot('device', { diet: 1 });
  const client = fakeClient({ rows: [remoteRow('u1', 2, snapshot('cloud', { diet: 2 }))] });
  const sync = createCloudSync({
    client, dbApi: fakeDb(local), storage: fakeStorage(), debounceMs: 60_000,
  });

  await sync.setUser({ id: 'u1' });
  await sync.resolveConflict('device');

  assert.equal(client.rows.get('u1').revision, 3);
  assert.equal(client.rows.get('u1').payload.diet[0].name, 'device');
  assert.equal(sync.state.syncStatus, 'idle');
  sync.destroy();
});

test('其他设备先更新 revision 时，本机修改进入冲突而不是覆盖云端', async () => {
  const db = fakeDb(snapshot('device', { diet: 1 }));
  const client = fakeClient();
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await sync.setUser({ id: 'u1' });
  await sync.resolveConflict('device');

  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'local-new' }));
  client.rows.set('u1', remoteRow('u1', 2, snapshot('other-device', { diet: 3 })));

  await assert.rejects(sync.syncNow(), CloudConflictError);
  assert.equal(sync.state.syncStatus, 'conflict');
  assert.equal(client.rows.get('u1').payload.diet[0].name, 'other-device');
  sync.destroy();
});

test('本机没有待上传修改时安全退出不依赖再次读取云端', async () => {
  const db = fakeDb(snapshot('device', { diet: 1 }));
  const client = fakeClient();
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await sync.setUser({ id: 'u1' });
  await sync.resolveConflict('device');
  let selects = 0;
  client.onSelect = async () => { selects += 1; };
  client.rows.set('u1', remoteRow('u1', 2, snapshot('new-cloud', { diet: 2 })));

  await sync.beginSafeSignOut();
  await sync.flush();

  assert.equal(selects, 0, '云端已有安全副本时，退出不应被一次额外读取卡住');
  assert.equal(sync.revision, 1);
  assert.equal(db.read().diet.length, 1);
  await sync.cancelTransition();
  sync.destroy();
});

test('较新 schema 的云快照不会落地覆盖当前应用数据', async () => {
  const local = snapshot('device', { diet: 1 });
  const newer = { ...remoteRow('u1', 2, snapshot('future', { diet: 2 })), schema_version: 2 };
  const db = fakeDb(local);
  const sync = createCloudSync({
    client: fakeClient({ rows: [newer] }), dbApi: db, storage: fakeStorage(), debounceMs: 60_000,
  });

  await assert.rejects(sync.setUser({ id: 'u1' }), (error) => error.code === 'remote_schema_newer');
  assert.equal(db.read().diet[0].name, 'device');
  sync.destroy();
});

test('切换账号会先清空旧账号数据，再加载新账号快照', async () => {
  const db = fakeDb(snapshot('account-a', { diet: 1 }), {
    owner: 'u1', revision: 0, dirty: true, lastSyncedAt: null,
  });
  const client = fakeClient({ rows: [remoteRow('u2', 7, snapshot('account-b', { settings: 1 }))] });
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await sync.setUser({ id: 'u1' });

  await sync.setUser({ id: 'u2' });

  assert.equal(db.clearCount, 1);
  assert.equal(db.read().settings[0].value, 'account-b');
  assert.equal(db.read().diet.length, 0);
  assert.equal(sync.ownerId, 'u2');
  sync.destroy();
});

test('超过 8 MB 的快照拒绝上传且保留本机数据', async () => {
  const large = snapshot('large', { diet: 1 });
  large.diet[0].note = 'x'.repeat(8 * 1024 * 1024);
  const db = fakeDb(large);
  const sync = createCloudSync({
    client: fakeClient(), dbApi: db, storage: fakeStorage(), debounceMs: 60_000,
  });

  await sync.setUser({ id: 'u1' });
  await assert.rejects(sync.resolveConflict('device'), (error) => error.code === 'snapshot_too_large');
  assert.equal(db.read().diet[0].note.length, 8 * 1024 * 1024);
  assert.equal(sync.dirty, true);
  sync.destroy();
});

test('认证层同时支持邮箱密码、Google 登录、Google 关联和设置密码', async () => {
  const client = fakeClient();
  const auth = createCloudAuth({ client });
  await auth.initialize();
  await auth.signUpWithPassword('USER@example.com', 'password-123');
  await auth.signInWithPassword('USER@example.com', 'password-123');
  await auth.signInWithGoogle({ redirectTo: 'https://app.test/#settings' });
  await auth.linkGoogle({ redirectTo: 'https://app.test/#settings' });
  await auth.setPassword('new-password-123');
  await auth.resetPassword('USER@example.com');

  assert.equal(client.calls.find(([name]) => name === 'signUp')[1].email, 'user@example.com');
  assert.equal(client.calls.find(([name]) => name === 'signInWithOAuth')[1].provider, 'google');
  assert.equal(client.calls.find(([name]) => name === 'linkIdentity')[1].provider, 'google');
  assert.deepEqual(client.calls.find(([name]) => name === 'updateUser')[1], { password: 'new-password-123' });
  auth.destroy();
});

test('浏览器配置只接受 publishable key 或 role=anon 的可解码 JWT', () => {
  const jwt = (role) => [
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'signature',
  ].join('.');
  assert.equal(isBrowserSafeSupabaseKey('sb_publishable_public-project-key'), true);
  assert.equal(isBrowserSafeSupabaseKey(jwt('anon')), true);
  assert.equal(isBrowserSafeSupabaseKey(jwt('service_role')), false);
  assert.equal(isBrowserSafeSupabaseKey('sb_secret_server-only'), false);
  assert.equal(isBrowserSafeSupabaseKey('arbitrary-string'), false);
  assert.equal(isBrowserSafeSupabaseKey('not.a.jwt'), false);
});

test('云端冲突未解决时安全退出会在 Supabase signOut 前终止并保留本机数据', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local);
  const user = {
    id: 'u1', email: 'u1@example.com', identities: [{ provider: 'email' }],
    app_metadata: { providers: ['email'] },
  };
  const client = fakeClient({
    session: { user },
    rows: [remoteRow('u1', 3, snapshot('cloud', { diet: 2 }))],
  });
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {}, debounceMs: 60_000,
  });
  await controller.initialize();
  assert.equal(controller.state.status, 'conflict');

  await assert.rejects(controller.signOutSafely(), CloudConflictError);
  assert.equal(client.auth.signOutCalls, 0);
  assert.equal(db.read().diet[0].name, 'device');
  assert.equal(controller.state.user.id, 'u1');
  controller.destroy();
});

test('localStorage 丢失后持久 owner A 的脏数据不会被新账号 B 清除或上传', async () => {
  const local = snapshot('account-a', { diet: 1 });
  const db = fakeDb(local, {
    owner: 'a', revision: 1, dirty: true, epoch: 4, changeSeq: 9, writeLocked: true,
  });
  const client = fakeClient({ rows: [remoteRow('a', 1, local)] });
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });

  await assert.rejects(sync.setUser({ id: 'b' }), (error) => error.code === 'owner_locked');
  assert.equal(db.clearCount, 0);
  assert.equal(db.read().diet[0].name, 'account-a');
  assert.equal(client.rows.has('b'), false);
  assert.equal(sync.state.syncStatus, 'locked');

  await sync.setUser({ id: 'a' });
  assert.equal(sync.ownerId, 'a');
  assert.equal(sync.dirty, false);
  assert.equal(db.readCloudMetadata().writeLocked, false);
  assert.equal(client.rows.get('a').revision, 2);
  sync.destroy();
});

test('意外 SIGNED_OUT 保留并锁定未同步数据，不清库也不上传', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ session: { user: accountUser('u1') }, rows: [remoteRow('u1', 1, local)] });
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {}, debounceMs: 60_000,
  });
  await controller.initialize();
  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'unsynced' }));
  await waitFor(() => db.readCloudMetadata().dirty, 'durable dirty');

  client.emitAuth('SIGNED_OUT', null);
  await waitFor(() => controller.state.status === 'locked', 'locked account state');
  assert.equal(db.clearCount, 0);
  assert.equal(db.read().diet.at(-1).name, 'unsynced');
  assert.equal(db.readCloudMetadata().writeLocked, true);
  assert.equal(client.rows.get('u1').revision, 1);
  assert.equal(controller.state.user, null);
  controller.destroy();
});

test('安全退出会先同步、只退出本设备，然后清除本地账号数据', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ session: { user: accountUser('u1') }, rows: [remoteRow('u1', 1, local)] });
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {}, debounceMs: 60_000,
  });
  await controller.initialize();
  await controller.signOutSafely();

  assert.deepEqual(client.calls.find(([name]) => name === 'signOut')[1], { scope: 'local' });
  assert.equal(controller.state.status, 'signedOut');
  assert.equal(db.clearCount, 1);
  assert.equal(db.read().diet.length, 0);
  assert.equal(db.readCloudMetadata().owner, null);
  assert.equal(db.readCloudMetadata().writeLocked, false);
  controller.destroy();
});

test('本机已同步时即使云端查询故障也能正常安全退出', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ session: { user: accountUser('u1') }, rows: [remoteRow('u1', 1, local)] });
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {}, debounceMs: 60_000,
  });
  await controller.initialize();
  client.failQueries = true;

  await controller.signOutSafely();

  assert.equal(controller.state.status, 'signedOut');
  assert.equal(client.auth.signOutCalls, 1);
  assert.equal(db.clearCount, 1);
  controller.destroy();
});

test('账号快照写入后只回传 revision 元数据，不把整份 payload 再下载一次', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ session: { user: accountUser('u1') }, rows: [remoteRow('u1', 1, local)] });
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {}, debounceMs: 60_000,
  });
  await controller.initialize();
  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'new' }));

  await controller.syncNow();

  const writeSelect = client.selectFields.findLast((call) => call.action === 'update');
  assert.equal(writeSelect?.fields, 'user_id,schema_version,revision,updated_at');
  assert.ok(!writeSelect.fields.includes('payload'));
  assert.equal(client.rows.get('u1').payload.diet.at(-1).name, 'new');
  assert.equal(db.readCloudMetadata().revision, 2);
  assert.equal(db.readCloudMetadata().dirty, false);
  controller.destroy();
});

test('服务器已收下上次上传但客户端未记 revision 时自动恢复而不制造冲突', async () => {
  const local = snapshot('device', { diet: 1, extra: { nested: { a: 1, b: 2 } } });
  const cloud = {
    customFoods: [],
    settings: [],
    diet: [{ name: 'device', date: '2026-08-24', id: 1 }],
    health: [],
    version: 1,
    app: 'health-diet-tracker',
    exportedAt: '2026-08-24T01:23:45.000Z',
    extra: { nested: { b: 2, a: 1 } },
  };
  const db = fakeDb(local, {
    owner: 'u1', revision: 1, dirty: true, changeSeq: 4, epoch: 2,
  });
  const client = fakeClient({
    session: { user: accountUser('u1') },
    rows: [remoteRow('u1', 2, cloud)],
  });
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {}, debounceMs: 60_000,
  });

  await controller.initialize();

  assert.equal(controller.state.status, 'signedIn');
  assert.equal(controller.state.syncStatus, 'idle');
  assert.equal(controller.state.conflict, null);
  assert.equal(db.readCloudMetadata().revision, 2);
  assert.equal(db.readCloudMetadata().dirty, false);
  assert.equal(db.read().exportedAt, local.exportedAt, '只补记同步元数据，不应重写本机业务数据');
  controller.destroy();
});

test('大快照上传使用独立宽限时限，超时时提示本次数据量并保留本地修改', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ session: { user: accountUser('u1') }, rows: [remoteRow('u1', 1, local)] });
  const controller = createAccountController({
    client,
    dbApi: db,
    storage: fakeStorage(),
    afterLocalReplace: async () => {},
    debounceMs: 60_000,
    syncFactory: (options) => createCloudSync({
      ...options, remoteTimeoutMs: 100, uploadTimeoutMs: 5,
    }),
  });
  await controller.initialize();
  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'unsynced' }));
  client.onUpdate = async () => new Promise(() => {});

  await assert.rejects(controller.syncNow(), (error) => {
    assert.equal(error.code, 'remote_timeout');
    assert.match(error.message, /上传账号数据（约 \d+ KB）超时/);
    return true;
  });
  assert.equal(db.readCloudMetadata().dirty, true);
  assert.equal(db.read().diet.at(-1).name, 'unsynced');
  controller.destroy();
});

test('未同步记录遇到云端超时后可选择保留本机并退出', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({
    session: { user: accountUser('u1') },
    rows: [remoteRow('u1', 1, local)],
    nextSignInUserId: 'u1',
  });
  const controller = createAccountController({
    client,
    dbApi: db,
    storage: fakeStorage(),
    afterLocalReplace: async () => {},
    debounceMs: 60_000,
    syncFactory: (options) => createCloudSync({ ...options, remoteTimeoutMs: 5 }),
  });
  await controller.initialize();
  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'unsynced' }));
  await waitFor(() => db.readCloudMetadata().dirty, 'durable dirty');
  client.onSelect = async () => new Promise(() => {});

  await assert.rejects(controller.signOutSafely(), (error) => error.code === 'remote_timeout');
  assert.equal(controller.state.user.id, 'u1');
  assert.equal(db.clearCount, 0);

  await controller.signOutPreservingLocal();

  assert.equal(client.auth.signOutCalls, 1);
  assert.equal(controller.state.user, null);
  assert.equal(controller.state.status, 'locked');
  assert.equal(controller.state.transitionReason, 'preserved-signout');
  assert.equal(db.clearCount, 0);
  assert.equal(db.read().diet.at(-1).name, 'unsynced');
  assert.equal(db.readCloudMetadata().writeLocked, true);

  client.onSelect = null;
  await controller.signInWithPassword('u1@example.com', 'password-123');
  await waitFor(() => controller.state.status === 'signedIn', 'same account recovery');
  assert.equal(db.readCloudMetadata().writeLocked, false);
  assert.equal(client.rows.get('u1').payload.diet.at(-1).name, 'unsynced');
  controller.destroy();
});

test('无 owner 的访客 dirty 数据在未登录启动时仍是可用本地模式', async () => {
  const local = snapshot('guest', { diet: 1 });
  const db = fakeDb(local, { owner: null, dirty: true, changeSeq: 3, writeLocked: false });
  const controller = createAccountController({
    client: fakeClient(), dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {},
  });
  await controller.initialize();
  assert.equal(controller.state.status, 'signedOut');
  assert.notEqual(controller.state.syncStatus, 'locked');
  assert.equal(db.read().diet[0].name, 'guest');
  db.mutate((data) => data.diet[0].name = 'guest-edit');
  assert.equal(db.read().diet[0].name, 'guest-edit');
  controller.destroy();
});

test('认证 SDK 不可用时 owner 或未完成归属锁都必须 fail closed', async () => {
  for (const metadata of [
    { owner: 'u1', dirty: false, writeLocked: false },
    { owner: null, dirty: false, writeLocked: true, epoch: 3 },
  ]) {
    const controller = createAccountController({
      authFactory: unavailableAuthFactory(true),
      dbApi: fakeDb(snapshot('protected', { diet: 1 }), metadata),
    });
    await controller.initialize();
    assert.equal(controller.state.status, 'locked');
    assert.equal(controller.state.ownershipPending, true);
    assert.equal(controller.state.transitionReason, 'auth-unavailable');
    controller.destroy();
  }
});

test('认证不可用且 durable 写锁 CAS 失败时仍 fail closed', async () => {
  const db = fakeDb(snapshot('protected', { diet: 1 }), {
    owner: 'u1', revision: 1, dirty: false, epoch: 2,
  });
  db.setCloudSyncMetadata = async () => { throw lockedError('concurrent owner change'); };
  const controller = createAccountController({
    authFactory: unavailableAuthFactory(true), dbApi: db,
  });
  await controller.initialize();
  assert.equal(controller.state.status, 'locked');
  assert.equal(controller.state.syncStatus, 'locked');
  assert.equal(controller.state.ownershipPending, true);
  assert.equal(controller.state.transitionReason, 'auth-unavailable');
  controller.destroy();
});

test('已确认同 owner 在云端断网时解锁本地使用，新写入仍持久 dirty', async () => {
  const local = snapshot('offline-owner', { diet: 1 });
  const db = fakeDb(local, {
    owner: 'u1', revision: 1, dirty: false, epoch: 2, writeLocked: true,
  });
  const client = fakeClient();
  client.failQueries = true;
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await assert.rejects(sync.setUser({ id: 'u1' }), (error) => error.code === 'network');
  assert.equal(sync.state.ownershipPending, false);
  assert.equal(db.readCloudMetadata().writeLocked, false);
  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'offline-new' }));
  assert.equal(db.readCloudMetadata().dirty, true);
  sync.destroy();
});

test('远程读取期间的本地写入进入冲突而不被覆盖', async () => {
  const local = snapshot('local', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ rows: [remoteRow('u1', 2, snapshot('cloud', { diet: 2 }))] });
  let injected = false;
  client.onSelect = async () => {
    if (injected) return;
    injected = true;
    db.mutate((data) => data.diet.push({ id: 3, date: '2026-08-24', name: 'during-fetch' }));
  };
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await sync.setUser({ id: 'u1' });
  assert.equal(sync.state.syncStatus, 'conflict');
  assert.equal(db.read().diet.at(-1).name, 'during-fetch');
  sync.destroy();
});

test('远程落地 guard 后发生的本地写入也不会被吞掉', async () => {
  const local = snapshot('local', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  db.beforeImport = async () => {
    db.beforeImport = null;
    db.externalMutate((data) => data.diet.push({ id: 3, date: '2026-08-24', name: 'before-import' }));
  };
  const sync = createCloudSync({
    client: fakeClient({ rows: [remoteRow('u1', 2, snapshot('cloud', { diet: 2 }))] }),
    dbApi: db, storage: fakeStorage(), debounceMs: 60_000,
  });
  await assert.rejects(sync.setUser({ id: 'u1' }), CloudConflictError);
  assert.equal(sync.state.syncStatus, 'conflict');
  assert.equal(db.read().diet.at(-1).name, 'before-import');
  sync.destroy();
});

test('较旧远程 revision 绝不回退本地已确认快照', async () => {
  const local = snapshot('revision-2', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 2, dirty: false });
  const sync = createCloudSync({
    client: fakeClient({ rows: [remoteRow('u1', 1, snapshot('stale', { diet: 2 }))] }),
    dbApi: db, storage: fakeStorage(), debounceMs: 60_000,
  });
  await assert.rejects(sync.setUser({ id: 'u1' }), (error) => error.code === 'remote_stale');
  assert.equal(db.read().diet[0].name, 'revision-2');
  assert.equal(db.readCloudMetadata().revision, 2);
  sync.destroy();
});

test('旧账号网络响应在 owner/epoch 切换后必须丢弃', async () => {
  const db = fakeDb(snapshot('a', { diet: 1 }), { owner: 'a', revision: 1, dirty: false, epoch: 1 });
  const client = fakeClient({ rows: [remoteRow('a', 2, snapshot('a-cloud', { diet: 2 }))] });
  client.onSelect = async () => {
    client.onSelect = null;
    db.forceData(snapshot('b-local', { settings: 1 }));
    db.forceMetadata({ owner: 'b', revision: 4, dirty: false, epoch: 2 });
  };
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await assert.rejects(sync.setUser({ id: 'a' }), (error) => error.code === 'owner_mismatch');
  assert.equal(sync.state.syncStatus, 'locked');
  assert.equal(db.read().settings[0].value, 'b-local');
  assert.equal(db.readCloudMetadata().owner, 'b');
  sync.destroy();
});

test('两个上下文同时首次认领不能互相接管或混合快照', async () => {
  const db = fakeDb(snapshot('empty'));
  const clientA = fakeClient({ rows: [remoteRow('a', 1, snapshot('a-cloud', { diet: 1 }))] });
  const clientB = fakeClient({ rows: [remoteRow('b', 1, snapshot('b-cloud', { settings: 1 }))] });
  let releaseA;
  let startedA;
  const started = new Promise((resolve) => { startedA = resolve; });
  const gate = new Promise((resolve) => { releaseA = resolve; });
  clientA.onSelect = async () => { startedA(); await gate; };
  const syncA = createCloudSync({ client: clientA, dbApi: db, storage: fakeStorage() });
  const syncB = createCloudSync({ client: clientB, dbApi: db, storage: fakeStorage() });

  const pendingA = syncA.setUser({ id: 'a' });
  await started;
  await syncB.setUser({ id: 'b' });
  releaseA();
  await assert.rejects(pendingA, (error) => error.code === 'owner_mismatch');
  assert.equal(db.readCloudMetadata().owner, 'b');
  assert.equal(db.read().settings[0].value, 'b-cloud');
  assert.equal(db.read().diet.length, 0);
  syncA.destroy();
  syncB.destroy();
});

test('安全退出在网络同步前先冻结 epoch，旧上下文排队写入必须失败', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false, epoch: 2 });
  const sync = createCloudSync({
    client: fakeClient({ rows: [remoteRow('u1', 1, local)] }),
    dbApi: db, storage: fakeStorage(), debounceMs: 60_000,
  });
  await sync.setUser({ id: 'u1' });
  const staleContext = db.readCloudMetadata();
  await sync.beginSafeSignOut();
  assert.throws(() => db.externalMutate(
    (data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'stale-write' }),
    staleContext,
  ), (error) => error.code === 'account_data_locked');
  assert.equal(db.read().diet.some((row) => row.name === 'stale-write'), false);
  await sync.cancelTransition();
  sync.destroy();
});

test('旧账号清库后的延迟 metadata.clear 不能清掉新账号 owner', async () => {
  const localA = snapshot('a', { diet: 1 });
  const localB = snapshot('b', { settings: 1 });
  const db = fakeDb(localA, { owner: 'a', revision: 1, dirty: false, epoch: 1 });
  const sync = createCloudSync({
    client: fakeClient({ rows: [remoteRow('a', 1, localA)] }),
    dbApi: db, storage: fakeStorage(), debounceMs: 60_000,
  });
  await sync.setUser({ id: 'a' });
  db.beforeMetaClear = async () => {
    db.beforeMetaClear = null;
    db.forceData(localB);
    db.forceMetadata({ owner: 'b', revision: 3, dirty: false, epoch: 9 });
  };
  await assert.rejects(
    sync.detach({ forceClear: true, reason: 'test-race' }),
    (error) => error.code === 'account_data_locked',
  );
  assert.equal(db.readCloudMetadata().owner, 'b');
  assert.equal(db.readCloudMetadata().revision, 3);
  assert.equal(db.read().settings[0].value, 'b');
  sync.destroy();
});

test('上传响应前另一上下文的新写入保持 dirty 且留待下次上传', async () => {
  const local = snapshot('base', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ rows: [remoteRow('u1', 1, local)] });
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await sync.setUser({ id: 'u1' });
  db.mutate((data) => data.diet.push({ id: 2, date: '2026-08-24', name: 'uploaded' }));
  client.onUpdate = async () => {
    client.onUpdate = null;
    db.externalMutate((data) => data.diet.push({ id: 3, date: '2026-08-24', name: 'after-snapshot' }));
  };
  await sync.syncNow();
  assert.equal(client.rows.get('u1').payload.diet.some((row) => row.name === 'after-snapshot'), false);
  assert.equal(db.readCloudMetadata().dirty, true);
  assert.equal(sync.state.syncStatus, 'dirty');
  sync.destroy();
});

test('冲突解决请求失败后仍保留冲突选项、锁和本地数据，可重试', async () => {
  const db = fakeDb(snapshot('device', { diet: 1 }));
  const client = fakeClient({ rows: [remoteRow('u1', 2, snapshot('cloud', { diet: 2 }))] });
  const sync = createCloudSync({ client, dbApi: db, storage: fakeStorage(), debounceMs: 60_000 });
  await sync.setUser({ id: 'u1' });
  client.failQueries = true;
  await assert.rejects(sync.resolveConflict('cloud'), (error) => error.code === 'network');
  assert.equal(sync.state.syncStatus, 'conflict');
  assert.equal(sync.state.conflict.reason, 'device-and-cloud');
  assert.equal(db.readCloudMetadata().writeLocked, true);
  assert.equal(db.read().diet[0].name, 'device');
  client.failQueries = false;
  await sync.resolveConflict('cloud');
  assert.equal(db.read().diet[0].name, 'cloud');
  sync.destroy();
});

test('登录归属检查尚未完成时拒绝安全退出并发操作', async () => {
  const client = fakeClient({ rows: [remoteRow('u1', 1, snapshot('cloud', { settings: 1 }))] });
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  client.onSelect = async () => { started(); await gate; };
  const sync = createCloudSync({ client, dbApi: fakeDb(snapshot('empty')), storage: fakeStorage() });
  const login = sync.setUser({ id: 'u1' });
  await startedPromise;
  await assert.rejects(sync.beginSafeSignOut(), CloudConflictError);
  release();
  await login;
  sync.destroy();
});

test('USER_UPDATED 只刷新身份提供方，不重复 bootstrap/远程读取', async () => {
  const local = snapshot('device', { diet: 1 });
  const db = fakeDb(local, { owner: 'u1', revision: 1, dirty: false });
  const client = fakeClient({ session: { user: accountUser('u1') }, rows: [remoteRow('u1', 1, local)] });
  let selects = 0;
  client.onSelect = async () => { selects += 1; };
  const controller = createAccountController({
    client, dbApi: db, storage: fakeStorage(), afterLocalReplace: async () => {},
  });
  await controller.initialize();
  const initialSelects = selects;
  await controller.setPassword('new-password-123');
  await waitFor(() => controller.state.providers.includes('email'), 'updated providers');
  assert.equal(selects, initialSelects);
  assert.equal(controller.state.status, 'signedIn');
  controller.destroy();
});

test('导入校验在事务前拒绝超量、重复主键、非有限数和过长字符串', () => {
  const excessive = snapshot('many');
  excessive.health = Array.from({ length: 50_001 }, () => ({ date: '2026-08-24' }));
  assert.throws(() => validateImportPayload(excessive), /记录过多/);

  const duplicate = snapshot('duplicate', { diet: 2 });
  duplicate.diet[1].id = duplicate.diet[0].id;
  assert.throws(() => validateImportPayload(duplicate), /重复 id/);

  const nonFinite = snapshot('nan', { settings: 1 });
  nonFinite.settings[0].value = Number.POSITIVE_INFINITY;
  assert.throws(() => validateImportPayload(nonFinite), /非有限数值/);

  const longText = snapshot('long', { settings: 1 });
  longText.settings[0].value = 'x'.repeat(1_000_001);
  assert.throws(() => validateImportPayload(longText), /过长文本/);
});
