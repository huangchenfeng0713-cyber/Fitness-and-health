/**
 * 已登录设备的启动：闸门只等「这份数据归谁」，不等整轮云同步。
 *
 * 用一个注入的假 Supabase 客户端（`cloud-auth.js` 的 loadCreateClient 优先用
 * `globalThis.supabase.createClient`，不走 CDN），把云端快照那次读取人为拖到 6 秒 ——
 * 手机网络上下一份几 MB 的快照本来就是这个量级。只用合成数据，不连真实账号。
 *
 * 守的是三件事：
 *  1. 同一账号：快照还在路上时首页就已经露出来（原先要等这 6 秒全部走完）；
 *  2. 版本号没变：第二次启动只问版本号，不再下载整份快照；本机改一笔也是直接上传；
 *  3. 换账号：这 6 秒里锁卡一直在 —— 隐私闸门没有跟着放松。
 */
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8137';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const DELAY_MS = 6000;
let checks = 0;
const check = (name, value) => { assert.ok(value, name); console.log('✓ ' + name); checks++; };

/* 在页面里跑：假 Supabase。配置放在 localStorage，跨重载保留（键名不能长得像 sb-*-auth-token）。 */
function installFakeCloud() {
  const KEY = 'smoke.fake-cloud';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const log = { selects: [], payloadDone: 0, updates: 0 };
  window.__fakeCloud = log;
  const head = (row) => ({
    user_id: row.user_id, schema_version: row.schema_version, revision: row.revision, updated_at: row.updated_at,
  });
  class Query {
    constructor(table) { this.table = table; this.action = 'select'; this.fields = ''; this.filters = {}; this.value = null; }
    select(fields) { if (this.action === 'select') this.fields = String(fields || ''); return this; }
    insert(value) { this.action = 'insert'; this.value = value; return this; }
    update(value) { this.action = 'update'; this.value = value; return this; }
    eq(key, value) { this.filters[key] = value; return this; }
    is() { return this; }
    order() { return this; }
    gte() { return this; }
    range() { return this; }
    abortSignal() { return this; }
    maybeSingle() { return this.run(); }
    single() { return this.run(); }
    then(resolve, reject) { return this.run().then(resolve, reject); }
    async run() {
      // 健康数据、设备列表这些与本条无关，一律空
      if (this.table !== 'user_snapshots') return { data: [], error: null };
      const cloud = read();
      const row = cloud?.row?.user_id === this.filters.user_id ? cloud.row : null;
      if (this.action === 'select') {
        log.selects.push(this.fields);
        if (this.fields.includes('payload')) await new Promise((resolve) => setTimeout(resolve, cloud?.delayMs || 0));
        if (this.fields.includes('payload')) log.payloadDone += 1;
        if (!row) return { data: null, error: null };
        const fields = this.fields.split(',').map((field) => field.trim());
        return { data: Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])), error: null };
      }
      if (this.action === 'update') {
        log.updates += 1;
        if (!row || row.revision !== this.filters.revision) return { data: null, error: null };
        const next = { ...row, ...this.value, updated_at: new Date().toISOString() };
        localStorage.setItem(KEY, JSON.stringify({ ...cloud, row: next }));
        return { data: head(next), error: null };
      }
      return { data: null, error: { code: 'unsupported', message: this.action } };
    }
  }
  window.supabase = {
    createClient() {
      const cloud = read();
      const session = cloud ? { user: {
        id: cloud.userId, email: `${cloud.userId}@example.test`,
        identities: [{ provider: 'email' }], app_metadata: { providers: ['email'] },
      } } : null;
      return {
        from: (table) => new Query(table),
        rpc: async () => ({ data: null, error: null }),
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getSession: async () => ({ data: { session }, error: null }),
          signOut: async () => ({ error: null }),
        },
      };
    },
  };
}

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  await context.addInitScript(installFakeCloud);
  const page = await context.newPage();
  await page.route('https://**/*', (route) => route.abort());
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(error.message));
  return page;
}

/* 读 store / 账号状态得先 await import()，`waitForFunction` 不 await 回调的 Promise，拿 evaluate 自己轮询。 */
async function waitUntil(page, predicate, label, arg, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, arg)) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`等不到：${label}`);
}

const unlocked = () => Boolean(document.querySelector('.tab')
  && !document.querySelector('.account-data-lock')
  && document.querySelector('#view section.card'));

const accountSettled = async () => {
  const { getAccountState } = await import('/js/lib/account.js');
  const account = getAccountState();
  return account.status === 'signedIn' && account.syncStatus === 'idle';
};

/**
 * 在一台「没登录过」的设备上造好本机数据，再把它记成属于 `owner`，
 * 同时摆好一份版本号相同的云端快照和一条本机会话 —— 下一次打开就是「已登录设备的日常启动」。
 */
async function seedSignedInDevice(page, { owner, sessionUser }) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(unlocked);
  await page.evaluate(async ({ owner, sessionUser, delayMs }) => {
    const store = await import('/js/lib/store.js');
    const db = await import('/js/lib/db.js');
    await store.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    const { snapshot, metadata } = await db.exportAllWithCloudMetadata();
    const current = metadata || {};
    const epoch = Math.max(0, Number(current.epoch) || 0);
    const changeSeq = Math.max(0, Number(current.changeSeq) || 0);
    await db.setCloudSyncMetadata({
      owner, revision: 3, dirty: false, changeSeq, epoch: epoch + 1,
      writeLocked: false, lastSyncedAt: '2026-09-20T00:00:00.000Z',
    }, { allowClearDirty: true, expectedContext: { owner: current.owner || null, epoch, changeSeq } });
    localStorage.setItem('smoke.fake-cloud', JSON.stringify({
      userId: sessionUser, delayMs,
      row: { user_id: sessionUser, schema_version: 1, revision: 3, payload: snapshot, updated_at: '2026-09-20T00:00:00.000Z' },
    }));
    localStorage.setItem('sb-smoke-auth-token', '{}');
  }, { owner, sessionUser, delayMs: DELAY_MS });
}

try {
  /* 1. 同一账号：快照还在路上，首页已经能用 */
  const page = await newPage();
  await seedSignedInDevice(page, { owner: 'u1', sessionUser: 'u1' });
  const started = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(unlocked, null, { timeout: DELAY_MS * 3 });
  const unlockedAfter = Date.now() - started;
  const payloadDoneAtUnlock = await page.evaluate(() => window.__fakeCloud.payloadDone);
  console.log(`  同一账号：${unlockedAfter}ms 露出首页，此时整份快照已下完 ${payloadDoneAtUnlock} 份`);
  check('同一账号启动不等云端快照下载完就露出首页', payloadDoneAtUnlock === 0);
  check(`露出首页远早于快照那 ${DELAY_MS}ms`, unlockedAfter < DELAY_MS / 2);

  // 「升级后第一次启动仍完整核对一遍」在 test/account.test.js 里验：这里第一次打开
  // 往往会先落一笔当天的设置（圆环尺子锁在当天），本机一脏就走「直接上传」那一支了
  await waitUntil(page, accountSettled, '第一次启动的后台同步走完', null, DELAY_MS * 3);

  /* 2. 版本号没变：只问版本号；改一笔也不先下载整份 */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(unlocked);
  await waitUntil(page, accountSettled, '第二次启动的后台同步走完', null, DELAY_MS * 3);
  const second = await page.evaluate(() => window.__fakeCloud.selects);
  console.log(`  第二次启动的读取字段：${JSON.stringify(second)}`);
  check('版本号没变时第二次启动不下载整份快照', second.length > 0 && second.every((fields) => !fields.includes('payload')));

  const cloudRevision = () => JSON.parse(localStorage.getItem('smoke.fake-cloud')).row.revision;
  const before = await page.evaluate(cloudRevision);
  await page.evaluate(async () => {
    const store = await import('/js/lib/store.js');
    await store.addEntry({ foodId: 'rice_white', grams: 150, meal: 'lunch' });
  });
  await waitUntil(page, () => window.__fakeCloud.updates > 0, '记一笔之后的上传', null, 10000);
  await waitUntil(page, accountSettled, '上传走完');
  const afterEdit = await page.evaluate(() => ({
    selects: window.__fakeCloud.selects,
    revision: JSON.parse(localStorage.getItem('smoke.fake-cloud')).row.revision,
  }));
  check('本机改一笔：版本号对上就直接上传，不先下载整份快照',
    afterEdit.revision === before + 1 && afterEdit.selects.every((fields) => !fields.includes('payload')));
  check('同一账号那一路没有页面错误', page.errors.length === 0);
  if (page.errors.length) console.log(page.errors);
  await page.context().close();

  /* 3. 换账号：本机数据属于 u0，登录的是 u1 —— 这 6 秒里必须一直锁着 */
  const other = await newPage();
  await seedSignedInDevice(other, { owner: 'u0', sessionUser: 'u1' });
  await other.reload({ waitUntil: 'domcontentloaded' });
  await other.waitForSelector('.tab');
  await other.waitForTimeout(DELAY_MS / 3);
  const lockedMidway = await other.evaluate(() => ({
    lock: Boolean(document.querySelector('.account-data-lock')),
    payloadDone: window.__fakeCloud.payloadDone,
  }));
  check('换账号：快照还在路上时锁卡一直在', lockedMidway.lock && lockedMidway.payloadDone === 0);
  await other.context().close();

  console.log(`\n启动闸门冒烟通过：${checks} 项`);
} finally {
  await browser.close();
}
