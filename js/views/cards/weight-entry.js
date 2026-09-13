/** 共用健康日记录和手动字段来源，不另建体重日志。 */
import { h, num, todayKey, toast, runLocalAction, confirmAction } from '../../lib/utils.js';
import { state, latestHealthEntry, saveHealthDay } from '../../lib/store.js';
import { isPlausibleHealthValue } from '../../core/health.js';
import { openSheet, closeSheet, setSheetFooter } from '../../lib/sheet.js';
import { icon } from '../../lib/icons.js';

export function openWeightEntry() {
  const today = todayKey();
  const weight = h('input', { type: 'number', inputmode: 'decimal', min: 1, step: '0.1',
    'aria-label': '体重 kg', value: state.healthByDate.get(today)?.weightKg ?? '', placeholder: 'kg' });
  const date = h('input', { type: 'date', value: today, max: today, 'aria-label': '称重日期',
    onchange: ev => { weight.value = state.healthByDate.get(ev.target.value)?.weightKg ?? ''; } });
  const save = h('button.primary-btn', { type: 'button', onclick: async () => {
    const day = date.value;
    const value = weight.value.trim() === '' ? null : Number(weight.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > todayKey() || !isPlausibleHealthValue('weightKg', value)) {
      toast('请填写有效称重日期和体重（kg）', 'warn'); return;
    }
    const existing = state.healthByDate.get(day)?.weightKg;
    if (existing != null && Number(existing) !== value && !confirmAction(`${day} 已记录 ${existing} kg，改为 ${value} kg？只替换当天体重，其余健康数据保留。`)) return;
    const result = await runLocalAction(save, () => saveHealthDay(day, { weightKg: value, source: 'manual' }), '保存体重');
    if (result.ok) { closeSheet({ force: true }); toast(`已记录 ${day} · ${num(value, 1)} kg`, 'ok'); }
  } }, '保存体重');
  openSheet(h('div', null,
    h('div.card-head', null, h('h2', null, '记录体重'),
      h('button.icon-btn', { 'aria-label': '关闭体重记录', onclick: closeSheet }, icon('close'))),
    h('div.form-grid', null,
      h('label.form-field', null, h('span', null, '称重日期'), date),
      h('label.form-field', null, h('span', null, '体重（kg）'), weight)),
    h('p.form-hint', null, '按实际称重日期保存为手动记录，与健康同步使用同一份体重数据。')),
  { label: '记录体重' });
  setSheetFooter(save);
}

export function weightEntryButton() {
  return h('button.secondary-btn.compact', { type: 'button', onclick: openWeightEntry }, '记体重');
}

export function quickWeightCard() {
  const last = latestHealthEntry('weightKg', todayKey());
  return h('section.card.quick-weight-card', null,
    h('div.card-head', null, h('h3', null, '体重'), weightEntryButton()),
    h('p', null, last ? `${num(last.value, 1)} kg · ${last.date}` : '尚无称重记录'));
}
