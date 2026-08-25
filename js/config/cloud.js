/**
 * 账号云同步的公开配置。
 *
 * Supabase 项目 URL 和 publishable/anon key 本来就是浏览器公开信息；真正的访问边界由
 * supabase/schema.sql 的 RLS 保证。这里故意不提供任何项目值，更不能放 service-role key。
 * 部署时可在 app.js 运行前设置：
 *   window.__HEALTH_DIET_CLOUD_CONFIG__ = {
 *     supabaseUrl: 'https://PROJECT.supabase.co',
 *     supabasePublishableKey: 'sb_publishable_...'
 *   };
 */

export const SUPABASE_JS_VERSION = '2.112.4';
export const SUPABASE_ESM_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_JS_VERSION}/+esm`;

const EMPTY_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: '',
  table: 'user_snapshots',
});

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  if (!part || typeof globalThis.atob !== 'function') return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(globalThis.atob(padded));
  } catch {
    return null;
  }
}

/** 拒绝把高权限密钥误发到浏览器；publishable key 或旧版 anon JWT 均可使用。 */
export function isBrowserSafeSupabaseKey(key) {
  const value = clean(key);
  if (!value || /^sb_(?:secret|service_role)_/i.test(value)) return false;
  if (/^sb_publishable_[a-z0-9_-]+$/i.test(value)) return true;
  if (value.split('.').length !== 3) return false;
  const payload = decodeJwtPayload(value);
  return payload?.role === 'anon';
}

export function readCloudConfig(overrides = {}) {
  const runtime = (typeof globalThis.__HEALTH_DIET_CLOUD_CONFIG__ === 'object'
    && globalThis.__HEALTH_DIET_CLOUD_CONFIG__) || {};
  const config = {
    ...EMPTY_CONFIG,
    ...runtime,
    ...overrides,
  };
  config.supabaseUrl = clean(config.supabaseUrl || config.url);
  config.supabasePublishableKey = clean(
    config.supabasePublishableKey || config.publishableKey || config.anonKey,
  );
  config.table = clean(config.table) || EMPTY_CONFIG.table;
  return config;
}

export function inspectCloudConfig(overrides = {}) {
  const config = readCloudConfig(overrides);
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    return { configured: false, reason: '云同步尚未配置，本机数据仍可正常使用', config };
  }
  let parsed;
  try { parsed = new URL(config.supabaseUrl); } catch { parsed = null; }
  const localHttp = parsed?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (!parsed || (parsed.protocol !== 'https:' && !localHttp)) {
    return { configured: false, reason: 'Supabase 项目地址无效', config };
  }
  if (!isBrowserSafeSupabaseKey(config.supabasePublishableKey)) {
    return { configured: false, reason: '浏览器配置禁止使用 service-role/secret 密钥', config };
  }
  if (!/^[a-z][a-z0-9_]*$/i.test(config.table)) {
    return { configured: false, reason: '云数据表名无效', config };
  }
  return { configured: true, reason: null, config };
}

export const CLOUD_CONFIG = EMPTY_CONFIG;
