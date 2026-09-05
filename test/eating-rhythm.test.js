import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedShare, personalMealReference, paceNote, rhythmMode, RHYTHM_MODES } from '../js/core/eating-rhythm.js';
const rows = (count, { gap = 1, start = 0, meals = [['breakfast', 8, 480], ['lunch', 12.5, 780], ['dinner', 19, 740]] } = {}) => {
  const out = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(2025, 0, 1 + (start + i) * gap)).toISOString().slice(0, 10);
    for (const [meal, hour, kcal] of meals) out.push({ date, meal, kcal,
      time: `${date}T${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 ? '30' : '00'}:00` });
  }
  return out;
};
const personal = entries => personalMealReference(entries);
test('固定三餐窗口：窗口内平滑、餐间保持，比例30/40/30', () => {
  const at = hour => expectedShare({ hour }).share;
  for (const [h, value] of [[6.5,0],[9,.3],[11.5,.3],[14,.7],[17.5,.7],[20,1],[24,1],[7.75,.15]]) assert.equal(at(h), value);
  for (let h = 0; h <= 24; h += .01) {
    assert.ok(at(h + .01) >= at(h));
    assert.ok(at(h + .01) - at(h) < .003, '不能瞬间跳台阶');
  }
});
test('0–6个有效日回退，7–27天全用，28天封顶', () => {
  for (const days of [0,1,6,7,13,27,28,40]) {
    const r = expectedShare({ mode: 'personal', entries: rows(days) });
    assert.equal(r.days, Math.min(days,28));
    assert.equal(r.fellBack, days < 7);
    assert.equal(r.mode, days < 7 ? 'guideline' : 'personal');
  }
});
test('最近28个有效日跨空白自然日，不含查看日期及未来', () => {
  const entries = rows(50, {gap:4});
  const dates = [...new Set(entries.map(e=>e.date))];
  const r = personalMealReference(entries, {asOf:dates[40]});
  assert.equal(r.days,28);
  assert.equal(r.dates[0],dates[39]);
  assert.equal(r.dates[27],dates[12]);
});
test('直接采用主餐标签，不根据时刻猜餐次', () => {
  const entries = rows(10,{meals:[['breakfast',11,480],['lunch',15,780],['dinner',21,740]]});
  const r = personal(entries);
  assert.equal(r.meals[0].key,'breakfast');
  assert.equal(r.meals[0].startHour,10.5);
  assert.equal(r.meals[1].startHour,14.5);
  assert.ok(Math.abs(r.meals[0].share-.24)<1e-9);
  assert.equal(personal(entries.map(({meal,...e})=>e)).days,0);
});
test('至少两顿有实质记录，少量、只有加餐、单餐无效', () => {
  assert.equal(personal(rows(8,{meals:[['breakfast',8,400],['dinner',19,600]]})).days,8);
  for (const meals of [[['breakfast',8,50],['lunch',12,50]],[['snack',8,1000],['late',22,1000]],[['breakfast',8,1500]],[['breakfast',8,20],['lunch',12,1200]]]) assert.equal(personal(rows(10,{meals})).days,0);
  const normal = rows(10,{meals:[['breakfast',8,900],['lunch',12,1200],['dinner',19,900]]});
  const partial = rows(2,{start:15,meals:[['breakfast',8,400],['lunch',12,500]]});
  assert.equal(personal([...normal,...partial]).days,10);
});
test('偶尔漏餐不作为零摄入，极端餐量和时间不拉偏典型结果', () => {
  const normal = rows(14);
  const missing = normal.filter(e=>!(e.date==='2025-01-05'&&e.meal==='breakfast'));
  const extreme = rows(1,{start:20,meals:[['breakfast',3,15000],['lunch',15,120],['dinner',23,120]]});
  const a=personal(normal).meals, b=personal([...missing,...extreme]).meals;
  a.forEach((m,i)=>{
    assert.ok(Math.abs(m.share-b[i].share)<.01);
    assert.equal(m.startHour,b[i].startHour);
    assert.equal(m.endHour,b[i].endHour);
  });
});
test('加餐属于实际日总量，历史夜宵不形成参照阶段', () => {
  const normal=rows(10), snacks=rows(10,{meals:[['snack',16,250],['late',23,500]]});
  const r=personal([...normal,...snacks]);
  assert.equal(r.meals.length,3);
  r.meals.forEach((m,i)=>assert.ok(Math.abs(m.share-personal(normal).meals[i].share)<1e-9));
  assert.equal(expectedShare({mode:'personal',entries:[...normal,...snacks],hour:22}).share,1);
});
test('个人参照餐间保持，学习比例随今日计划映射kcal', () => {
  const entries=rows(10), at=hour=>expectedShare({mode:'personal',entries,hour}).share;
  assert.equal(at(10),at(11)); assert.equal(at(15),at(17));
  assert.equal(Math.round(at(10)*2000),480);
  assert.equal(Math.round(at(10)*2400),576);
  assert.deepEqual(personal(entries).meals,personal(entries.map(e=>({...e,kcal:e.kcal*2}))).meals);
});
test('模式可切换，未知模式兜底，夜间不催补热量', () => {
  assert.equal(rhythmMode('invalid').key,'guideline');
  assert.deepEqual(RHYTHM_MODES.map(m=>m.label),['参照膳食','参照平常']);
  assert.equal(paceNote({hour:6,eatenPct:0}).tone,'early');
  assert.equal(paceNote({hour:12,eatenPct:40}).tone,'onTrack');
  const night=paceNote({hour:22,eatenPct:30});
  assert.equal(night.tone,'late'); assert.match(night.text,/明天/);
});
