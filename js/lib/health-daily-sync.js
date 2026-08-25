/**
 * health_daily bridge
 *
 * health_daily is the authoritative cloud copy of Apple Health daily data. This module mirrors
 * it into the existing IndexedDB health store so the rest of the v1.5.1 app can stay offline-first.
 * It never writes health_daily from the browser; only the Edge Function may do that.
 */
import { inspectCloudConfig, SUPABASE_ESM_URL } from '../config/cloud.js';
import { mergeHealthDays } from './store.js';

const SELECT_FIELDS = [
  'user_id', 'date', 'captured_at', 'timezone', 'source', 'updated_at',
  'steps', 'active_energy', 'resting_energy', 'exercise_minutes', 'stand_minutes',
  'distance_km', 'sleep_minutes', 'water_ml', 'weight_kg', 'body_fat_pct', 'resting_hr', 'vo2max',
].join(',');

let client = null;
let userId = null;
let channel = null;
let pullPromise = null;
let lastPullAt = null;

function toLocal(row) {
  const mapped = {
    date: row.date,
    source: 'apple',
    energyObservedAt: row.captured_at || null,
  };
  const pairs = {
    steps: 'steps', active_energy: 'activeEnergy', resting_energy: 'restingEnergy',
    exercise_minutes: 'exerciseMinutes', stand_minutes: 'standMinutes', distance_km: 'distanceKm',
    sleep_minutes: 'sleepMinutes', water_ml: 'waterMl', weight_kg: 'weightKg',
    body_fat_pct: 'bodyFatPct', resting_hr: 'restingHR', vo2max: 'vo2max',
  };
  for (const [remote, local] of Object.entries(pairs)) {
    if (row[remote] != null) mapped[local] = Number(row[remote]);
  }
  return mapped;
}

function emit(detail) {
  globalThis.dispatchEvent?.(new CustomEvent('health-daily-sync', { detail }));
}

async function pull(reason = 'manual') {
  if (!client || !userId) return { ok: false, reason: 'signed-out' };
  if (pullPromise) return pullPromise;
  pullPromise = (async () => {
    const { data, error } = await client.from('health_daily')
      .select(SELECT_FIELDS)
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(4000);
    if (error) throw error;
    const days = (data || []).map(toLocal);
    if (days.length) {
      await mergeHealthDays(days, {
        via: 'health_daily', sourceFormat: 'partial', cloudAuthoritative: true,
      });
    }
    lastPullAt = new Date().toISOString();
    const result = { ok: true, reason, days: days.length, at: lastPullAt };
    emit(result);
    return result;
  })().catch((error) => {
    console.warn('health_daily 拉取失败', error);
    const result = { ok: false, reason, error: String(error?.message || error) };
    emit(result);
    return result;
  }).finally(() => { pullPromise = null; });
  return pullPromise;
}

async function attach(nextUserId) {
  if (userId === nextUserId) return;
  if (channel && client) await client.removeChannel(channel).catch(() => {});
  channel = null;
  userId = nextUserId || null;
  if (!userId) return;

  await pull('sign-in');
  // Account snapshot reconciliation may still be finishing; pull once more afterward so
  // health_daily wins even when an older v1.5.1 snapshot contained stale health rows.
  setTimeout(() => pull('post-account-sync'), 2500);

  channel = client.channel(`health-daily-${userId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'health_daily', filter: `user_id=eq.${userId}`,
    }, () => { pull('realtime'); })
    .subscribe();
}

function injectSetupLink() {
  const card = document.querySelector('.account-card');
  if (!card || card.querySelector('[data-health-sync-setup]')) return;
  const row = document.createElement('p');
  row.className = 'privacy-note';
  row.dataset.healthSyncSetup = '1';
  const link = document.createElement('a');
  link.className = 'inline-link';
  link.href = 'sync-setup.html';
  link.textContent = '设置 Apple 健康自动同步';
  row.append('Apple 健康可由 iPhone 快捷指令直接同步到账号：', link);
  card.append(row);
}

async function boot() {
  const inspection = inspectCloudConfig();
  if (!inspection.configured) return;
  try {
    const { createClient } = await import(SUPABASE_ESM_URL);
    client = createClient(
      inspection.config.supabaseUrl,
      inspection.config.supabasePublishableKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
    );
    const { data } = await client.auth.getSession();
    await attach(data?.session?.user?.id || null);
    client.auth.onAuthStateChange((_event, session) => { attach(session?.user?.id || null); });

    const foregroundPull = () => {
      if (!document.hidden && userId) pull('foreground');
      injectSetupLink();
    };
    document.addEventListener('visibilitychange', foregroundPull);
    window.addEventListener('focus', foregroundPull);
    window.addEventListener('pageshow', foregroundPull);
    new MutationObserver(injectSetupLink).observe(document.body, { childList: true, subtree: true });
    injectSetupLink();
  } catch (error) {
    console.warn('health_daily bridge 初始化失败', error);
  }
}

export const healthDailySync = {
  pull,
  get state() { return { userId, lastPullAt, connected: Boolean(client) }; },
};

globalThis.__HEALTH_DAILY_SYNC__ = healthDailySync;
boot();
