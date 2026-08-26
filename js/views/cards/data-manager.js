/**
 * 数据管理卡片：Apple 健康同步、自动同步、手动补录、本应用备份与恢复、同步帮助。
 *
 * 单独成模块是为了让「这张卡片放在哪一页」变成一行 import 的事。
 * 它以前长在数据页里，现在挂在设置页——都是维护性操作，和日常看数据不是一类。
 */

import { h, num, toast, confirmAction, download, infoTip } from '../../lib/utils.js';
import { state, saveHealthDay, saveProfile, clearAllData, db } from '../../lib/store.js';
import { isPlausibleHealthValue } from '../../core/health.js';
import { runImportWorker, applyImport } from '../../lib/importer.js';
import { getAccountState, syncNow } from '../../lib/account.js';
import {
  healthCloudState, createHealthSyncDevice, pullAccountHealth,
  revokeHealthSyncDevice, clearAccountHealthSyncData,
  forgetGeneratedHealthSyncCredential,
} from '../../lib/health-cloud-sync.js';

let importing = false;
let progressEl = null;
const autoSyncDraft = { deviceName: '我的 iPhone' };

function formatSyncMoment(value, fallback = '尚未上传') {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

async function copyText(value, successMessage) {
  const text = String(value || '');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = h('textarea', { value: text, readonly: true });
    fallback.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand?.('copy');
    fallback.remove();
    if (!copied) throw new Error('浏览器不允许复制，请长按内容手动复制');
  }
  toast(successMessage, 'ok');
}

function shortcutConfig(credential) {
  return JSON.stringify({
    method: 'POST',
    url: credential.endpoint,
    headers: {
      'Content-Type': 'application/json',
      'X-Health-Sync-Token': credential.token,
    },
    bodyExample: {
      protocolVersion: 1,
      timestamp: '2026-08-25T14:10:00+08:00',
      date: '2026-08-25',
      timezone: 'Asia/Shanghai',
      source: 'apple_shortcuts',
      steps: 4217,
      activeEnergyKcal: 203.6,
      restingEnergyKcal: 912.4,
    },
  }, null, 2);
}

function setProgress(stage, pct) {
  if (!progressEl) return;
  progressEl.hidden = false;
  const bar = progressEl.querySelector('.progress-fill');
  const text = progressEl.querySelector('.progress-text');
  if (bar && pct != null) bar.style.width = `${Math.max(2, Math.min(100, pct))}%`;
  if (text) text.textContent = stage || '';
}

async function handleImport(payload, rerender) {
  if (importing) return;
  importing = true;
  try {
    setProgress('准备中…', 1);
    const result = await runImportWorker({
      ...payload,
      sourcePriority: state.profile.appleSourcePriority || [],
    }, (m) => setProgress(m.stage, m.pct));
    const outcome = await applyImport(result);
    toast(outcome.ok
      ? (outcome.days ? `同步完成：已更新 ${outcome.days} 天健康数据` : 'Apple 健康快照已同步')
      : outcome.message, outcome.ok ? 'ok' : 'warn');
  } catch (err) {
    console.error(err);
    toast(`导入失败：${err.message}`, 'error');
  } finally {
    importing = false;
    setProgress('', 0);
    if (progressEl) progressEl.hidden = true;
    rerender();
  }
}

function importQualityItems(last) {
  const q = last?.quality || {};
  const items = [];
  if (last?.fullSnapshot != null) items.push(last.fullSnapshot ? '导入方式：完整快照' : '导入方式：增量合并');
  if (last?.sourceFormat) {
    const format = {
      'apple-health-export': 'Apple 官方导出',
      'account-health-sync': '账号自动同步',
    }[last.sourceFormat] || last.sourceFormat;
    items.push(`数据来源：${format}`);
  }
  if (last?.records) items.push(`解析 ${num(last.records)} 条原始健康记录`);
  if (q.duplicateRecords) items.push(`去除 ${num(q.duplicateRecords)} 条完全重复样本`);
  if (q.overlapBuckets) items.push(`处理 ${num(q.overlapBuckets)} 个多来源重叠时间段`);
  if (q.sleepOverlapMinutes) items.push(`合并 ${num(q.sleepOverlapMinutes)} 分钟重叠睡眠`);
  if (q.activitySummaryDays) items.push(`${num(q.activitySummaryDays)} 天采用 Apple 活动圆环日汇总`);
  if (last?.workoutCount) items.push(`识别 ${num(last.workoutCount)} 次锻炼，未重复计入活动能量`);
  if (q.invalidRecords) items.push(`隔离 ${num(q.invalidRecords)} 条异常数值`);
  if (q.unsupportedRecords) items.push(`保留报告 ${num(q.unsupportedRecords)} 条暂未支持的记录`);
  if (q.unsupportedXmlElementCount) items.push(`安全跳过 ${num(q.unsupportedXmlElementCount)} 个暂未支持的 XML 元素`);
  if (q.truncatedXml) items.push('文件未完整闭合，本次已自动降级为增量合并');
  return items;
}

function lastSyncPanel(last) {
  if (!last) return h('div.sync-empty', null,
    h('strong', null, '尚未同步 Apple 健康'),
    h('span', null, '第一次建议使用“健康 App 完整导出”，以后可用快捷指令补充当天数据。'));
  const when = new Date(last.at);
  const at = Number.isNaN(when.getTime()) ? '时间未知' : when.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const range = last.range?.length === 2 ? `${last.range[0]} 至 ${last.range[1]}` : '日期范围未知';
  const details = importQualityItems(last);
  const sources = last.quality?.sourceCoverage?.map((source) => source.sourceName).filter(Boolean) || [];
  if (sources.length) details.splice(2, 0, `识别 ${sources.length} 个数据来源`);
  return h('div.sync-result', null,
    h('div.sync-result-head', null,
      h('div', null, h('strong', null, `已同步 ${num(last.days)} 天`), h('span', null, range)),
      h('time', null, at)),
    details.length && h('details.sync-details', null,
      h('summary', null, '导入详情'),
      h('ul', null, details.map((item) => h('li', null, item))),
      sources.length && h('p', null, `识别来源：${sources.slice(0, 6).join('、')}${sources.length > 6 ? '等' : ''}`)));
}

function backupPanel(rerender) {
  const connected = Boolean(getAccountState().user);
  const restoreInput = h('input', {
    type: 'file', accept: '.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        if (payload?.app !== 'health-diet-tracker') {
          throw new Error('这不是本应用导出的完整备份；Apple 健康文件请在“同步 Apple 健康”中选择');
        }
        const healthCount = Array.isArray(payload.health) ? payload.health.length : 0;
        const dietCount = Array.isArray(payload.diet) ? payload.diet.length : 0;
        const cloudWarning = getAccountState().user
          ? '你已登录：恢复后的完整数据还会同步并替换当前账号的云端版本。\n\n'
          : '';
        const ok = confirmAction(
          `恢复后会替换当前设备里的全部健康、饮食、设置和自定义食物。\n\n`
          + cloudWarning
          + `所选备份：健康 ${healthCount} 天，饮食 ${dietCount} 条。\n\n继续恢复吗？`,
        );
        if (!ok) return;
        const counts = await db.importAll(payload);
        if (getAccountState().user) {
          try {
            await syncNow();
            toast(`恢复并同步完成：健康 ${counts.health} 天，饮食 ${counts.diet} 条`, 'ok');
          } catch (syncError) {
            toast(`本机恢复完成，但云同步尚未完成：${syncError.message}`, 'warn');
          }
        } else {
          toast(`恢复完成：健康 ${counts.health} 天，饮食 ${counts.diet} 条`, 'ok');
        }
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        toast(`恢复失败：${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    },
  });

  return h('div.data-actions', null,
      h('div.data-action', null,
        h('div.data-action-icon', null, '↓'),
        h('div.data-action-copy', null,
          h('strong', null, '导出当前完整备份'),
          h('span', null, '下载到“文件”，换设备或清缓存前保存一份。')),
        h('button.secondary-btn.compact', {
          onclick: async () => {
            const payload = await db.exportAll();
            download(`健康饮食备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
            toast('完整备份已下载', 'ok');
          },
        }, '导出')),
      h('div.data-action', null,
        h('div.data-action-icon', null, '↺'),
        h('div.data-action-copy', null,
          h('strong', null, '恢复完整备份'),
          h('span', null, connected
            ? '会替换本机数据，并在确认后同步替换当前账号的云端版本。'
            : '会先确认再整体替换当前本地数据，不与现有数据混合。')),
        h('label.secondary-btn.compact', null, '选择备份', restoreInput)),
      h('div.data-action.danger', null,
        h('div.data-action-icon', null, '×'),
        h('div.data-action-copy', null,
          h('strong', null, connected ? '清空当前账号数据' : '清空本机数据'),
          h('span', null, connected
            ? '删除本机全部内容并同步清空该账号云端（含自动健康数据），同时撤销所有设备；无法撤销。'
            : '删除本设备上的全部内容；无法撤销。')),
        h('button.secondary-btn.compact.danger', {
          onclick: async () => {
            const cloud = Boolean(getAccountState().user);
            const warning = cloud
              ? '确定清空当前账号的全部数据？本机内容、账号云端快照、快捷指令健康数据都会删除，所有同步设备也会被撤销。此操作不可撤销，建议先导出完整备份。'
              : '确定清空全部本地数据？此操作不可撤销。建议先导出完整备份。';
            if (!confirmAction(warning)) return;
            if (cloud) {
              try {
                await clearAccountHealthSyncData();
              } catch (syncError) {
                toast(`尚未清空：账号健康同步数据删除失败（${syncError.message}）`, 'error');
                return;
              }
            }
            await clearAllData();
            if (cloud) {
              try {
                await syncNow();
                toast('当前账号数据已清空，所有自动同步设备已撤销', 'ok');
              } catch (syncError) {
                toast(`本机已清空，但云端清空尚未完成：${syncError.message}`, 'warn');
              }
            } else {
              toast('本机数据已清空', 'ok');
            }
            rerender();
          },
        }, '清空')));
}

function credentialField(label, value, copyLabel, message) {
  return h('div.sync-secret-field', null,
    h('span', null, label),
    h('code', null, value),
    h('button.secondary-btn.compact', {
      type: 'button', onclick: () => copyText(value, message).catch((error) => toast(error.message, 'error')),
    }, copyLabel));
}

function automaticSyncPanel(rerender) {
  const account = getAccountState();
  if (!account.user) {
    return h('section.auto-sync-box', null,
      h('div.auto-sync-title', null,
        h('div', null, h('strong', null, '快捷指令自动上传'), h('span', null, '需要登录账号')),
        h('span.status-pill', null, '自动')),
      h('p', null, '登录后可为 iPhone 生成专属连接。快捷指令会直接把健康数据存进你的账号，网页不必保持打开。'),
      h('button.secondary-btn.full', {
        type: 'button', onclick: () => { location.hash = 'settings'; },
      }, '登录后启用'));
  }

  const credential = healthCloudState.userId && healthCloudState.userId !== account.user.id
    ? null : healthCloudState.credential;
  const devices = healthCloudState.userId && healthCloudState.userId !== account.user.id
    ? [] : healthCloudState.devices;
  const busy = ['creating', 'pulling', 'revoking'].includes(healthCloudState.status);
  const nameInput = h('input', {
    type: 'text', maxlength: 80, value: autoSyncDraft.deviceName,
    placeholder: '例如：我的 iPhone', autocomplete: 'off',
    oninput: (event) => { autoSyncDraft.deviceName = event.target.value; },
  });
  const createBtn = h('button.primary-btn', {
    type: 'button', disabled: busy,
    onclick: async () => {
      const name = autoSyncDraft.deviceName.trim();
      if (!name) { toast('请先填写设备名称', 'warn'); nameInput.focus(); return; }
      createBtn.disabled = true;
      try {
        await createHealthSyncDevice(name);
        toast('连接已创建；请现在保存令牌', 'ok');
        rerender();
      } catch (error) {
        toast(`创建失败：${error.message}`, 'error');
        if (createBtn.isConnected) createBtn.disabled = false;
      }
    },
  }, healthCloudState.status === 'creating' ? '正在生成…' : '生成连接信息');

  const credentialPanel = credential && h('div.sync-credential', { role: 'status' },
    h('div.sync-credential-head', null,
      h('div', null,
        h('strong', null, `${credential.deviceName} 的一次性连接信息`),
        h('span', null, '先复制基础配置，再在 iPhone 上打开快捷指令；令牌关闭后无法再次查看。')),
      h('span.status-pill.warn', null, '仅显示一次')),
    credentialField('上传 URL', credential.endpoint, '复制 URL', '上传 URL 已复制'),
    credentialField('设备令牌', credential.token, '复制令牌', '设备令牌已复制'),
    h('div.sync-credential-actions', null,
      h('button.primary-btn', {
        type: 'button',
        onclick: () => copyText(shortcutConfig(credential), '完整快捷指令配置已复制')
          .catch((error) => toast(error.message, 'error')),
      }, '1. 复制基础配置'),
      h('button.secondary-btn', {
        type: 'button',
        onclick: () => { window.location.href = 'shortcuts://create-shortcut'; },
      }, '2. 在 iPhone 上新建'),
      h('button.text-btn', {
        type: 'button', onclick: () => { forgetGeneratedHealthSyncCredential(); rerender(); },
      }, '已保存，隐藏')),
    h('p.sync-credential-note', null,
      '基础模板只包含步数、活动能量和静息能量。没有样本的字段要省略；体重、体脂、睡眠等请确认基础同步成功后再按帮助页添加。'));

  const deviceList = devices.length
    ? h('div.sync-device-list', null,
      h('div.sync-device-list-head', null,
        h('strong', null, `已连接设备 · ${devices.length}`),
        h('span', null, '最多 10 台')),
      devices.map((device) => h('div.sync-device-row', null,
        h('div', null,
          h('strong', null, device.device_name),
          h('span', null, `最近上传：${formatSyncMoment(device.last_sync_at)}`)),
        h('button.text-btn.danger', {
          type: 'button', disabled: busy,
          onclick: async (event) => {
            if (!confirmAction(`撤销“${device.device_name}”的上传权限？这台设备之后的请求会被拒绝。`)) return;
            const control = event.currentTarget;
            control.disabled = true;
            try {
              await revokeHealthSyncDevice(device.id);
              if (credential?.deviceId === device.id) forgetGeneratedHealthSyncCredential();
              toast('设备上传权限已撤销', 'ok');
              rerender();
            } catch (error) {
              toast(`撤销失败：${error.message}`, 'error');
              if (control.isConnected) control.disabled = false;
            }
          },
        }, '撤销'))))
    : h('p.sync-device-empty', null, '还没有连接设备。生成连接信息后，再把 URL 和令牌填进快捷指令。');

  const pullBtn = h('button.secondary-btn.full', {
    type: 'button', disabled: busy,
    onclick: async () => {
      pullBtn.disabled = true;
      try {
        const outcome = await pullAccountHealth();
        if (outcome.skipped) toast('账号正在切换或同步，请稍后再试', 'warn');
        else toast(outcome.importedDays
          ? `已读取账号最新数据：更新 ${outcome.importedDays} 天`
          : '账号健康数据已是最新', 'ok');
        rerender();
      } catch (error) {
        toast(`读取失败：${error.message}`, 'error');
        if (pullBtn.isConnected) pullBtn.disabled = false;
      }
    },
  }, healthCloudState.status === 'pulling' ? '正在读取…' : '立即读取账号最新数据');

  return h('section.auto-sync-box', null,
    h('div.auto-sync-title', null,
      h('div', null,
        h('strong', null, '快捷指令自动上传'),
        h('span', null, account.email || '当前登录账号')),
      h('span.status-pill.ok', null, '账号直连')),
    h('p', null, '快捷指令上传后会立即保存到账户；网站在打开、切回前台以及使用期间自动读取，不需要中转文件。'),
    h('div.auto-sync-form', null,
      h('label.form-field', null, h('span', null, '设备名称'), nameInput),
      createBtn),
    credentialPanel,
    deviceList,
    h('div.auto-sync-status', null,
      h('span', null, healthCloudState.lastCloudUpdateAt
        ? `账号最新数据：${formatSyncMoment(healthCloudState.lastCloudUpdateAt)}`
        : '账号中尚无快捷指令数据'),
      healthCloudState.lastPulledAt && h('span', null,
        `本机读取：${formatSyncMoment(healthCloudState.lastPulledAt)}`)),
    pullBtn,
    healthCloudState.error && h('p.account-error', { role: 'alert' }, healthCloudState.error));
}

function importPanel(rerender) {
  const input = h('input', {
    type: 'file',
    accept: '.zip,.xml,.json,.csv',
    hidden: true,
    onchange: (e) => {
      const file = e.target.files?.[0];
      if (file) handleImport({ file }, rerender);
      e.target.value = '';
    },
  });

  const drop = h('div.dropzone', {
    role: 'button', tabindex: 0, 'aria-label': '选择 Apple 健康导出文件',
    onclick: () => input.click(),
    onkeydown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      input.click();
    },
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    ondragleave: (e) => e.currentTarget.classList.remove('over'),
    ondrop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImport({ file }, rerender);
    },
  },
  h('div.dropzone-icon', null, '↥'),
  h('strong', null, '选择 Apple 健康导出文件'),
  h('span', null, '首次同步可选“导出.zip”；日常同步也支持 JSON / CSV'),
  h('div.file-types', null, ['ZIP', 'XML', 'JSON', 'CSV'].map((type) => h('span', null, type))),
  input);

  progressEl = h('div.progress', { hidden: true },
    h('div.progress-track', null, h('div.progress-fill')),
    h('div.progress-text'));

  const pasteArea = h('textarea.paste-area', {
    placeholder: '{"date":"2026-08-21","steps":8600,"activeEnergy":520,"weight":71.2}',
    rows: 4,
  });

  const clipboardBtn = h('button.primary-btn.import-clipboard', {
    onclick: async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) { toast('剪贴板是空的', 'warn'); return; }
        handleImport({ text: text.trim() }, rerender);
      } catch {
        toast('浏览器不允许读剪贴板，请用下面的粘贴框', 'warn');
      }
    },
  }, '从快捷指令剪贴板同步今天');

  const last = state.lastImport;
  const detectedSources = last?.quality?.sourceCoverage
    ?.map((source) => source.sourceName).filter(Boolean) || [];
  const priorityInput = h('textarea.paste-area', {
    rows: 4,
    placeholder: 'Apple Watch\niPhone\n第三方 App',
    value: (state.profile.appleSourcePriority || []).join('\n'),
  });
  const priorityEditor = h('details.paste-block', null,
    h('summary', null, '高级：统一数据来源优先级'),
    h('p.form-hint', { style: { margin: '4px 0 8px' } },
      '每行一个 export.xml 中的 sourceName，越靠上越优先；不确定时请留空，应用会自动处理。'),
    detectedSources.length && h('p.form-hint', null,
      `上次检测到：${detectedSources.join('、')}`),
    priorityInput,
    h('button.secondary-btn.full', {
      onclick: async () => {
        const priority = [...new Set(priorityInput.value.split(/\r?\n/)
          .map((value) => value.trim()).filter(Boolean))];
        await saveProfile({ appleSourcePriority: priority });
        toast(priority.length ? '来源优先级已保存，下次导入生效' : '已恢复自动来源解析', 'ok');
      },
    }, '保存来源顺序'));

  return h('div.import-panel', null,
    automaticSyncPanel(rerender),
    h('div.import-fallback-title', null,
      h('strong', null, '文件与剪贴板导入'),
      h('span', null, '首次导入历史数据，或自动上传不可用时使用')),
    drop,
    progressEl,
    clipboardBtn,
    h('details.paste-block', null,
      h('summary', null, '手动粘贴快捷指令输出'),
      h('p.form-hint', { style: { margin: '4px 0 8px' } },
        '支持一条或多条 JSON / CSV。每条数据都要有 date；完整应用备份请在“本应用备份与恢复”中选择。'),
      pasteArea,
      h('button.secondary-btn.full', {
        onclick: () => {
          const text = pasteArea.value.trim();
          if (!text) { toast('先粘贴内容', 'warn'); return; }
          handleImport({ text }, rerender);
          pasteArea.value = '';
        },
      }, '解析并同步')),
    lastSyncPanel(last),
    priorityEditor,
  );
}

function guidePanel() {
  const shortcutRecipe = [
    '先登录本应用，在“同步 Apple 健康”里生成连接信息，点击“复制基础配置”保存上传 URL、设备令牌和字段示例',
    '在 iPhone 上点击“新建”直接打开「快捷指令」编辑器；首次只读取今天的步数、活动能量和静息能量并分别求总和',
    '添加“字典”，放入 date、timestamp、timezone、steps、activeEnergyKcal、restingEnergyKcal；某项没有样本时省略该键，不要填 0',
    '添加“获取 URL 内容”：方法选 POST，请求体选 JSON；标头增加 X-Health-Sync-Token，值填刚才保存的设备令牌',
    '首次手动运行并允许读取健康数据；返回 ok: true 就表示已经写入账号',
    '基础同步稳定后再添加锻炼、站立和距离；体重、体脂等必须同时上传真实 measuredAt。睡眠容易因阶段重叠重复，默认不添加',
  ];

  const automationRecipe = [
    '快捷指令 → 自动化 → + → 特定时间，选择希望同步的时刻',
    '选择“立即运行”，并运行刚才保存的上传快捷指令',
    '可以建立多个时刻，例如 08:00、12:00、18:00、23:30；同一天累计值会更新，不会相加成重复记录',
    'iOS 可能因省电、锁屏或权限延迟执行自动化，不保证严格整点；打开本应用时会自动读取账号里的最新结果',
  ];

  return h('div.guide-panel', null,
    h('div.method', null,
      h('div.method-head', null, h('span.method-badge.fast', null, '推荐'), h('strong', null, '快捷指令自动上传')),
      h('p', null, '上传直接进入当前账号，不需要复制粘贴，也不要求网页在后台常驻。'),
      h('details', null,
        h('summary', null, '创建自动上传快捷指令'),
        h('ol.guide-list', null, shortcutRecipe.map((t) => h('li', null, t)))),
      h('details', null,
        h('summary', null, '设置定时自动运行'),
        h('ol.guide-list', null, automationRecipe.map((t) => h('li', null, t))))),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge', null, '首次'), h('strong', null, '健康 App 完整导出')),
      h('p', null, '「健康」App → 右上角头像 → 滑到底部「导出所有健康数据」→ 得到 导出.zip，'
        + '无需解压，直接在同步区选择。')),

    h('div.method', null,
      h('div.method-head', null, h('span.method-badge', null, '备用'), h('strong', null, '剪贴板或第三方导出工具')),
      h('p', null, '仍支持 JSON / CSV 手动导入；每条记录需要 date。中文弯引号会自动修正。')),
  );
}

function manualPanel(rerender) {
  const day = state.healthByDate.get(state.day) || {};
  const fields = [
    ['steps', '步数', '步'],
    ['activeEnergy', '活动能量', 'kcal'],
    ['exerciseMinutes', '锻炼时间', '分钟'],
    ['sleepMinutes', '睡眠', '小时', 60],
    ['weightKg', '体重', 'kg'],
    ['bodyFatPct', '体脂率', '%'],
    ['waterMl', '饮水', 'ml'],
  ];
  const inputs = {};
  return h('div.manual-panel', null,
    h('div.form-grid', null, fields.map(([key, label, unit, scale]) => {
      const input = h('input', {
        type: 'number', step: '0.1', inputmode: 'decimal',
        // scale 是「填进去的单位 → 存起来的单位」的倍数：睡眠按小时填，内部仍按分钟存
        value: day[key] != null ? (scale ? Math.round((day[key] / scale) * 10) / 10 : day[key]) : '',
        placeholder: unit,
      });
      inputs[key] = input;
      return h('label.form-field', null, h('span', null, `${label}（${unit}）`), input);
    })),
    h('button.primary-btn', {
      onclick: async () => {
        const patch = {};
        for (const [key, , , scale] of fields) {
          const v = inputs[key].value.trim();
          if (v !== '') patch[key] = scale ? Number(v) * scale : Number(v);
        }
        if (!Object.keys(patch).length) { toast('没有填写任何数值', 'warn'); return; }
        const invalid = Object.entries(patch).find(([key, value]) => !isPlausibleHealthValue(key, value));
        if (invalid) { toast(`${invalid[0]} 的数值不合理，请检查单位`, 'warn'); return; }
        await saveHealthDay(state.day, { ...patch, source: 'manual' });
        toast('已保存', 'ok');
        rerender();
      },
    }, '保存这一天的健康数据'),
  );
}

function managerSection(icon, title, subtitle, content, open = false) {
  return h('details.manager-section', { open },
    h('summary', null,
      h('span.manager-icon', null, icon),
      h('span.manager-summary-copy', null,
        h('strong', null, title),
        h('span', null, subtitle)),
      h('span.manager-chevron', { 'aria-hidden': 'true' }, '›')),
    h('div.manager-panel', null, content));
}

/** 同步、补录、恢复和说明只出现一次，并统一放在结果之后。 */
export function dataManagerCard(rerender) {
  const last = state.lastImport;
  const connected = Boolean(getAccountState().user);
  const lastHint = last?.days
    ? `上次同步 ${num(last.days)} 天${last.range?.[1] ? ` · 至 ${last.range[1]}` : ''}`
    : '从健康 App、快捷指令或导出文件同步';
  return h('section.card.data-manager#data-manager', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, '数据管理'),
        h('p.card-desc', null, '需要同步、补录、换设备或恢复时再展开。')),
      h('div.card-head-actions', null,
        infoTip('查看数据来源说明',
          h('p', null, h('strong', null, '同步 Apple 健康：'),
            '只更新身体与活动数据，不会改动饮食记录。'),
          h('p', null, h('strong', null, '手动补录：'),
            '只保存你填写的当天字段。'),
          h('p', null, h('strong', null, '恢复完整备份：'),
            '会替换本应用的健康、饮食、设置和自定义食物。'),
          h('p', null, connected
            ? '文件在当前设备读取；解析或恢复后的数据会同步到当前登录账号。'
            : '文件只在当前设备读取；未登录时不会上传个人数据。')))),
    h('div.manager-list', null,
      managerSection('↥', '同步 Apple 健康', lastHint, importPanel(rerender)),
      managerSection('＋', `手动补录 · ${state.day}`, '补充当天缺少的健康字段', manualPanel(rerender)),
      managerSection('↺', '本应用备份与恢复', connected
        ? '导出、恢复或清空当前账号数据'
        : '导出、换设备、恢复或清空本机数据', backupPanel(rerender)),
      managerSection('?', '同步帮助', '首次完整导出与日常快捷指令步骤', guidePanel())),
  );
}
