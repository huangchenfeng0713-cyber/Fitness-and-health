/**
 * 顶栏那行日期。
 *
 * 这一组防的是「同一个日期上下各写一遍」：原先大标题写「昨天」，
 * 副标题又写「08-28 · 回今天」——日期印了两遍，
 * 而「回今天」在标题已经点明是哪天的时候才有用。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayHeading, dayOffset, shiftDay, todayKey } from '../js/core/day.js';

const TODAY = '2026-08-29';

test('今天和昨天：标题是词，副标题才是日期', () => {
  const today = dayHeading('2026-08-29', TODAY);
  assert.equal(today.title, '今天');
  assert.equal(today.sub, '08-29');
  assert.equal(today.isToday, true);

  const yesterday = dayHeading('2026-08-28', TODAY);
  assert.equal(yesterday.title, '昨天');
  assert.equal(yesterday.sub, '08-28');
  assert.equal(yesterday.isToday, false);

  // 标题里不许再出现日期，副标题里不许再出现那个词
  for (const heading of [today, yesterday]) {
    assert.doesNotMatch(heading.title, /\d/, `标题重复了日期：${heading.title}`);
    assert.doesNotMatch(heading.sub, /今天|昨天/, `副标题重复了标题：${heading.sub}`);
  }
});

test('更远的日期：标题就是日期，副标题只留回今天的出口', () => {
  const h = dayHeading('2026-08-27', TODAY);
  assert.equal(h.title, '08月27日');
  assert.equal(h.sub, '回今天 ↩');
  assert.equal(h.backToToday, true);
  // 日期只印一次
  assert.doesNotMatch(h.sub, /\d/, `副标题又把日期印了一遍：${h.sub}`);
});

test('跨年补上年份，同一年里不写', () => {
  assert.equal(dayHeading('2025-08-27', TODAY).title, '2025年08月27日');
  assert.equal(dayHeading('2026-01-03', TODAY).title, '01月03日');
  // 月和日补零，否则「8月7日」和「08月27日」宽度会跳
  assert.equal(dayHeading('2026-03-05', TODAY).title, '03月05日');
});

test('明天仍然是个词；坏日期退回今天，不印出 NaN', () => {
  assert.equal(dayHeading('2026-08-30', TODAY).title, '明天');
  for (const bad of [null, undefined, '', 'x', '2026-8-9']) {
    const h = dayHeading(bad, TODAY);
    assert.equal(h.title, '今天', `坏输入 ${bad} 没退回今天`);
    assert.doesNotMatch(`${h.title}${h.sub}`, /NaN|undefined/);
  }
});

test('日期加减跨月跨年跨夏令时都对得上', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(dayOffset('2026-08-29', '2026-08-27'), 2);
  assert.equal(dayOffset('2025-12-31', '2026-01-01'), -1);
  // 夏令时切换那两天不能算成 0 天或 2 天
  assert.equal(dayOffset('2026-03-09', '2026-03-08'), 1);
  assert.equal(dayOffset('2026-11-02', '2026-11-01'), 1);
  assert.equal(todayKey(new Date(2026, 7, 9)), '2026-08-09');
});
