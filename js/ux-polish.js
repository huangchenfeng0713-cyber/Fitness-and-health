/**
 * v2.10 交互精修层。
 *
 * 这里不改计算与数据结构，只整理渲染后的控件层级：训练筛选、重复提示、
 * 数据页顶栏、份量预览和单项记录后的撤销。render* 会频繁重建 DOM，
 * 所以用一个幂等的 MutationObserver 在每次重绘后补上这些纯视图增强。
 */

import { state, removeEntry, findFood } from './lib/store.js';
import { toast, num } from './lib/utils.js';
import { macroSplit } from './core/metrics.js';
import { splitBar } from './lib/charts.js';

let scheduled = false;

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

function enhanceHealthContext() {
  document.documentElement.classList.toggle('ux-health-page', Boolean(document.querySelector('.trend-card')));
}

function enhanceTraining() {
  const picker = document.querySelector('.exercise-picker-card');
  if (!picker) return;

  /* 没有今日动作时，直接从“挑动作”开始，不先摆一张空卡。 */
  const emptyPlan = [...document.querySelectorAll('#view > .card')]
    .find((card) => card.querySelector('.plan-start'));
  if (emptyPlan) emptyPlan.hidden = true;

  /* 器械从常驻的一整排收成一个筛选按钮；原按钮本身直接搬进去，事件不丢。 */
  if (!picker.querySelector('.ux-equip-filter')) {
    const switches = [...picker.querySelectorAll(':scope > .range-switch')];
    const equipment = switches.find((row) => [...row.querySelectorAll('button')]
      .some((button) => /固定器械|自由重量|徒手/.test(button.textContent || '')));
    if (equipment) {
      const active = equipment.querySelector('button.active');
      const current = String(active?.textContent || '全部').replace(/\s+\d+\s*$/, '').trim();
      const details = document.createElement('details');
      details.className = 'ux-equip-filter';
      const summary = document.createElement('summary');
      summary.textContent = `筛选 · ${current}`;
      const menu = document.createElement('div');
      menu.className = 'ux-equip-menu';
      while (equipment.firstChild) menu.append(equipment.firstChild);
      details.append(summary, menu);
      equipment.replaceWith(details);
    }
  }

  picker.querySelector('.picker-view-switch')?.classList.add('ux-list-tabs');

  /* 未选统一描边＋，待选/已选统一 ✓。 */
  picker.querySelectorAll('.ex-row').forEach((row) => {
    const pick = row.querySelector('.ex-pick');
    if (!pick) return;
    pick.textContent = row.getAttribute('aria-pressed') === 'true' ? '✓' : '＋';
  });

  /* 长句压成“重复/重叠”标签；点标签才看具体和哪个动作冲突。 */
  picker.querySelectorAll('.ex-clash-slot').forEach((slot) => {
    const text = String(slot.dataset.uxDetail || slot.textContent || '').trim();
    if (!text) return;
    if (!slot.dataset.uxDetail) slot.dataset.uxDetail = text;
    slot.textContent = /部分重叠/.test(text) ? '重叠' : '重复';
    slot.classList.add('ux-clash-badge');
    slot.title = text;
    if (slot.dataset.uxBound === '1') return;
    slot.dataset.uxBound = '1';
    slot.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toast(slot.dataset.uxDetail, 'info');
    });
  });
}

function numberFrom(row, selector) {
  const text = row?.querySelector(selector)?.textContent || '';
  const match = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function enhanceImpactSplit() {
  const block = document.querySelector('.impact-block');
  if (!block || block.dataset.uxSplit === '1') return;
  const rows = [...block.querySelectorAll('.impact-row')];
  const carb = rows.find((row) => row.querySelector('.impact-name')?.textContent === '碳水');
  const fat = rows.find((row) => row.querySelector('.impact-name')?.textContent === '脂肪上限');
  if (!carb || !fat || !state.derived?.targets || !state.derived?.advice?.gaps) return;

  const carbAfter = numberFrom(carb, '.impact-to');
  const fatAfter = numberFrom(fat, '.impact-to');
  if (carbAfter == null || fatAfter == null) return;

  const gaps = state.derived.advice.gaps;
  const split = macroSplit(state.derived.targets, {
    ...gaps,
    carb: { ...gaps.carb, eaten: carbAfter },
    fat: { ...gaps.fat, eaten: fatAfter },
  });

  carb.hidden = true;
  fat.hidden = true;
  const combined = document.createElement('div');
  combined.className = 'impact-split-row';

  const head = document.createElement('div');
  head.className = 'impact-split-head';
  const label = document.createElement('span');
  label.textContent = '碳水 / 脂肪';
  const ratio = document.createElement('strong');
  ratio.textContent = split.carbPct == null ? '—' : `${split.carbPct}% / ${split.fatPct}%`;
  const note = document.createElement('span');
  note.textContent = split.label;
  head.append(label, ratio, note);

  const grams = document.createElement('div');
  grams.className = 'impact-split-grams';
  grams.append(
    Object.assign(document.createElement('span'), { textContent: `碳水 ${num(split.carbG)}g` }),
    Object.assign(document.createElement('span'), { textContent: split.note }),
    Object.assign(document.createElement('span'), { textContent: `脂肪 ${num(split.fatG)}g` }),
  );
  combined.append(head, splitBar({
    carbPct: split.carbPct,
    carbBandLo: split.bandLo,
    carbBandHi: split.bandHi,
    level: split.level,
  }), grams);
  fat.after(combined);
  block.dataset.uxSplit = '1';
}

function enhance() {
  enhanceHealthContext();
  enhanceTraining();
  enhanceImpactSplit();
}

/*
 * 单项直接记录：原逻辑负责真正写库；这里仅在成功写入之后覆盖成更完整的
 * “餐次 · 食物 · 份量 / 撤销”提示。批量清单不走这条路径。
 */
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.sheet-action .primary-btn');
  if (!button || !/^记录到/.test(button.textContent || '')) return;
  const before = new Set((state.dietEntries || []).map((entry) => entry.id));
  const started = performance.now();

  const waitForEntry = () => {
    const added = [...(state.dietEntries || [])]
      .reverse().find((entry) => !before.has(entry.id));
    if (!added) {
      if (performance.now() - started < 1800) requestAnimationFrame(waitForEntry);
      return;
    }
    const food = findFood(added.foodId);
    const unit = food?.basis === '100ml' ? 'ml' : 'g';
    const mealLabel = String(button.textContent || '').replace(/^记录到/, '') || '本餐';
    toast(`已记录到${mealLabel} · ${added.name} ${num(added.grams)}${unit}`, 'ok', {
      label: '撤销',
      onClick: () => removeEntry(added.id),
    });
  };
  requestAnimationFrame(waitForEntry);
}, true);

const root = document.getElementById('app');
if (root) {
  new MutationObserver(scheduleEnhance).observe(root, { childList: true, subtree: true, characterData: true });
}
window.addEventListener('hashchange', scheduleEnhance);
scheduleEnhance();
