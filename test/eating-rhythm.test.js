import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedShare, paceNote, rhythmMode, rhythmBasis, RHYTHM_MODES,
  DEFAULT_RHYTHM_MODE, MIN_DAYS_FOR_PERSONAL,
} from '../js/core/eating-rhythm.js';

const entriesFor = (days, hours) => {
  const out = [];
  for (let d = 0; d < days; d += 1) {
    const date = `2026-08-${String(10 + d).padStart(2, '0')}`;
    for (const [hour, kcal] of hours) {
      out.push({ date, kcal, time: `${date}T${String(hour).padStart(2, '0')}:00:00` });
    }
  }
  return out;
};

test('膳食指南那条曲线随钟点单调上升，不是匀速直线', () => {
  const at = (h) => expectedShare({ hour: h }).share;
  assert.equal(at(5), 0, '一天开始时是 0');
  assert.equal(at(21), 1, '晚餐结束就该吃满');
  for (let h = 6; h <= 21; h += 1) {
    assert.ok(at(h) >= at(h - 1), `${h} 点比 ${h - 1} 点低了`);
  }
  /*
   * 它是**折线**，不是直线：每一餐的窗口内按那一餐的供能比往上走，
   * 换一餐就换一个斜率。匀速那条 `(hour-6)/16` 到 21 点才 93.75%，
   * 而按三餐比例晚餐一结束就是 100% —— 这正是要区别开的地方。
   */
  assert.ok(at(10.5) > at(9), '早餐窗口内应当在涨');
  const slope = (a, b) => (at(b) - at(a)) / (b - a);
  const slopeLunch = slope(11, 14.5);
  const slopeSnack = slope(15, 17.5);
  const slopeBreakfast = slope(9, 10.5);
  assert.ok(slopeLunch > slopeSnack * 2,
    `正餐段该比加餐段陡得多，实际 ${slopeLunch.toFixed(3)} vs ${slopeSnack.toFixed(3)}`);
  assert.ok(slopeBreakfast > slopeSnack,
    `早餐段不该比加餐段还平，实际 ${slopeBreakfast.toFixed(3)} vs ${slopeSnack.toFixed(3)}`);
  assert.ok(Math.abs(at(21) - 1) < 1e-9 && (21 - 6) / 16 < 0.95, '和匀速直线的区别没体现出来');
});

test('样本够就用自己的分布', () => {
  // 这个人 70% 的热量在晚上：早 200、晚 800
  const entries = entriesFor(10, [[8, 200], [19, 800]]);
  const mine = expectedShare({ mode: 'personal', hour: 12, entries });
  assert.equal(mine.mode, 'personal');
  assert.equal(mine.fellBack, false);
  assert.ok(Math.abs(mine.share - 0.2) < 0.02, `中午该在 20% 上下，实际 ${mine.share}`);
  // 同一时刻，指南口径要高得多 —— 这正是「按我平常」存在的理由
  assert.ok(expectedShare({ hour: 12 }).share > mine.share + 0.1);
});

test('样本不够就退回指南，并且说出来', () => {
  const few = expectedShare({
    mode: 'personal', hour: 12, entries: entriesFor(MIN_DAYS_FOR_PERSONAL - 1, [[8, 500]]),
  });
  assert.equal(few.mode, 'guideline');
  assert.equal(few.requested, 'personal');
  assert.equal(few.fellBack, true, '退回了却不说，用户会以为看的是自己的节奏');
  assert.deepEqual(expectedShare({ mode: 'personal', hour: 12, entries: [] }).mode, 'guideline');
});

test('每天各自归一化，一顿火锅不该把曲线拽偏', () => {
  const normal = entriesFor(9, [[8, 300], [19, 300]]);
  const feast = [{ date: '2026-08-20', kcal: 6000, time: '2026-08-20T21:00:00' }];
  const a = expectedShare({ mode: 'personal', hour: 12, entries: normal });
  const b = expectedShare({ mode: 'personal', hour: 12, entries: [...normal, ...feast] });
  assert.ok(Math.abs(a.share - b.share) < 0.06,
    `一天 6000 kcal 就把曲线拽走了：${a.share} → ${b.share}`);
});

test('差得不多说中性的一句；夜里不催人补热量', () => {
  assert.equal(paceNote({ hour: 12, eatenPct: 40 }).tone, 'onTrack', '差一点点不该说成偏离');
  assert.equal(paceNote({ hour: 18, eatenPct: 30 }).tone, 'behind', '差四成该说一句');
  assert.equal(paceNote({ hour: 12, eatenPct: 90 }).tone, 'ahead', '吃得快也该说一句');
  assert.equal(paceNote({ hour: 6, eatenPct: 0 }).tone, 'early', '天没亮时 0% 是必然，不作数');
  const night = paceNote({ hour: 22, eatenPct: 30 });
  assert.equal(night.tone, 'late');
  assert.doesNotMatch(night.text, /漏记|缺口/,
    '晚上 10 点催人补热量，等于劝人睡前大吃一顿');
  assert.match(night.text, /明天/);
  // 说的时候要点明依据是哪一套口径
  assert.match(paceNote({ hour: 18, eatenPct: 30 }).text, /膳食指南/);
  assert.match(
    paceNote({ hour: 18, eatenPct: 30, mode: 'personal', entries: entriesFor(10, [[8, 500]]) }).text,
    /你近两周/,
  );
  // 每一句都得带上那个百分比，否则「低于」没有参照物
  for (const tone of [12, 18, 22]) {
    const note = paceNote({ hour: tone, eatenPct: 30 });
    if (note.tone !== 'early') assert.match(note.text, /\d+%/, `${tone} 点这句没写出参照值`);
  }
  assert.equal(rhythmBasis('personal'), '你近两周的节奏');
  assert.equal(rhythmBasis('guideline'), '膳食指南');
});

test('模式表能查、有兜底', () => {
  assert.equal(rhythmMode('personal').key, 'personal');
  assert.equal(rhythmMode('不存在').key, DEFAULT_RHYTHM_MODE);
  assert.equal(rhythmMode().key, DEFAULT_RHYTHM_MODE);
  assert.equal(RHYTHM_MODES.length, 2);
  for (const m of RHYTHM_MODES) assert.ok(m.label && m.desc, `${m.key} 缺少说明`);
});
