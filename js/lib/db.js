/**
 * IndexedDB 封装
 * 所有数据只存在这台设备的浏览器里，不上传任何服务器。
 */

const DB_NAME = 'health-diet-tracker';
const DB_VERSION = 1;

export const STORES = {
  health: 'health',       // 每日 Apple 健康数据，key = 'YYYY-MM-DD'
  diet: 'diet',           // 饮食条目，key = 自增 id，索引 date
  settings: 'settings',   // 键值对配置
  customFoods: 'customFoods', // 用户自建食物
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function getAll(store) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, 'readonly').get(key));
}

export async function put(store, value) {
  const db = await openDB();
  return wrap(tx(db, store, 'readwrite').put(value));
}

export async function del(store, key) {
  const db = await openDB();
  return wrap(tx(db, store, 'readwrite').delete(key));
}

export async function clear(store) {
  const db = await openDB();
  return wrap(tx(db, store, 'readwrite').clear());
}

/** 批量写入（导入健康数据时一次几千天也不卡） */
export async function bulkPut(store, values, { merge = false } = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
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
    t.oncomplete = () => resolve(written);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** 在同一个事务里写入完整行并删除已失效的主键，供全量快照同步使用。 */
export async function bulkSync(store, values = [], deleteKeys = []) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const key of deleteKeys) os.delete(key);
    for (const value of values) os.put(value);
    t.oncomplete = () => resolve({ written: values.length, deleted: deleteKeys.length });
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
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

/** 导出全部数据（用于备份 / 换设备） */
export async function exportAll() {
  const [health, diet, settings, customFoods] = await Promise.all([
    getAll(STORES.health), getAll(STORES.diet), getAll(STORES.settings), getAll(STORES.customFoods),
  ]);
  return {
    app: 'health-diet-tracker',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    health, diet, settings, customFoods,
  };
}

/** 导入备份 */
export async function importAll(payload) {
  if (payload?.app !== 'health-diet-tracker') throw new Error('不是本应用导出的备份文件');
  const counts = {};
  for (const store of [STORES.health, STORES.settings, STORES.customFoods]) {
    const rows = payload[store] || [];
    await clear(store);
    if (rows.length) await bulkPut(store, rows);
    counts[store] = rows.length;
  }
  await clear(STORES.diet);
  const db = await openDB();
  const diet = payload.diet || [];
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORES.diet, 'readwrite');
    const os = t.objectStore(STORES.diet);
    for (const row of diet) os.put(row);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  counts.diet = diet.length;
  return counts;
}
