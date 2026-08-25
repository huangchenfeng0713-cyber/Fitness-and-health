import { inspectCloudConfig, SUPABASE_ESM_URL } from './config/cloud.js';

const $ = (selector) => document.querySelector(selector);
let client = null;
let endpoint = '';
let oneTimeToken = '';

function text(id, value) { const el = $(id); if (el) el.textContent = value; }
function setStatus(message, kind = '') {
  const el = $('#status');
  el.textContent = message;
  el.dataset.kind = kind;
}
function base64url(bytes) {
  let raw = '';
  bytes.forEach((b) => { raw += String.fromCharCode(b); });
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sha256Hex(value) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function copy(value) {
  await navigator.clipboard.writeText(value);
  setStatus('已复制到剪贴板', 'ok');
}

function renderShortcutExample() {
  const sample = {
    protocolVersion: 1,
    syncId: '2026-08-25T14:10:00+08:00-001',
    capturedAt: '2026-08-25T14:10:00+08:00',
    date: '2026-08-25',
    timezone: 'Asia/Shanghai',
    source: 'apple_shortcuts',
    steps: 1594,
    activeEnergy: 103.21,
    restingEnergy: 791.67,
    exerciseMinutes: 3,
    standMinutes: 36,
    distanceKm: 1.113,
    sleepMinutes: 352,
    restingHR: 70,
  };
  $('#json-example').textContent = JSON.stringify(sample, null, 2);
}

async function listDevices() {
  const root = $('#devices');
  const { data, error } = await client.from('health_sync_devices')
    .select('id,device_name,created_at,last_sync_at,revoked_at')
    .order('created_at', { ascending: false });
  if (error) { root.textContent = error.message; return; }
  root.replaceChildren();
  for (const device of data || []) {
    const row = document.createElement('div');
    row.className = 'device';
    const info = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = device.device_name;
    const small = document.createElement('small');
    small.textContent = device.revoked_at
      ? '已撤销'
      : device.last_sync_at ? `上次同步 ${new Date(device.last_sync_at).toLocaleString()}` : '尚未同步';
    info.append(strong, small);
    row.append(info);
    if (!device.revoked_at) {
      const button = document.createElement('button');
      button.textContent = '撤销';
      button.onclick = async () => {
        if (!confirm(`撤销“${device.device_name}”的同步权限？旧令牌会立即失效。`)) return;
        const { error: revokeError } = await client.rpc('revoke_health_sync_device', { p_device_id: device.id });
        if (revokeError) setStatus(revokeError.message, 'error');
        else { setStatus('设备令牌已撤销', 'ok'); await listDevices(); }
      };
      row.append(button);
    }
    root.append(row);
  }
  if (!root.children.length) root.textContent = '还没有同步设备。';
}

async function createDevice() {
  const name = $('#device-name').value.trim();
  if (!name) { setStatus('先填写设备名称', 'error'); return; }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  oneTimeToken = `hds_${base64url(bytes)}`;
  const hash = await sha256Hex(oneTimeToken);
  const { error } = await client.rpc('register_health_sync_device', {
    p_device_name: name,
    p_token_hash: hash,
  });
  if (error) { oneTimeToken = ''; setStatus(error.message, 'error'); return; }
  $('#token').textContent = oneTimeToken;
  $('#token-panel').hidden = false;
  setStatus('令牌已创建。原始令牌只显示这一次，请现在复制到快捷指令。', 'ok');
  await listDevices();
}

async function boot() {
  renderShortcutExample();
  const inspection = inspectCloudConfig();
  if (!inspection.configured) { setStatus('这个部署没有配置 Supabase。', 'error'); return; }
  endpoint = `${inspection.config.supabaseUrl.replace(/\/$/, '')}/functions/v1/health-sync`;
  text('#endpoint', endpoint);
  const { createClient } = await import(SUPABASE_ESM_URL);
  client = createClient(inspection.config.supabaseUrl, inspection.config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session?.user) {
    setStatus('请先回到主页面登录账号，再打开这个设置页。', 'error');
    $('#setup-controls').hidden = true;
    return;
  }
  setStatus(`已登录：${data.session.user.email || data.session.user.id}`, 'ok');
  $('#create-device').onclick = createDevice;
  $('#copy-endpoint').onclick = () => copy(endpoint);
  $('#copy-token').onclick = () => oneTimeToken && copy(oneTimeToken);
  $('#copy-json').onclick = () => copy($('#json-example').textContent);
  await listDevices();
}

boot().catch((error) => setStatus(String(error?.message || error), 'error'));
