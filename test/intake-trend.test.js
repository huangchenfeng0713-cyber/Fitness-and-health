import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeTrend } from '../js/core/intake-trend.js';
import { buildAdvice } from '../js/core/advisor.js';
import { dailyTargets, sumNutrients } from '../js/core/nutrition.js';
const date='2026-09-06', at=t=>new Date(date+'T'+t+':00');
const entry=(meal,time,kcal,extra={})=>({date,time:date+'T'+time+':00',meal,kcal,...extra});
const profile={sex:'male',age:30,heightCm:175,weightKg:72,activity:'light',goal:'maintain'};
const targets={...dailyTargets(profile),kcal:2400,protein:130,carb:300,fat:60,fatUpper:90,fiber:25};
const intake={kcal:800,protein:25,fat:65,carb:55,fiber:5,sodium:600,sugar:5};
const entries=[entry('breakfast','08:00',300),entry('lunch','13:00',500)];
const input={targets,intake,entries,now:at('15:30'),profile};
const predict=patch=>intakeTrend({...input,...patch});

test('餐次有记录和累计 100 kcal 均不能视为完成一天',()=>{
 for(const now of [at('18:30'),at('21:00'),at('23:59')]){
   const t=predict({entries:['breakfast','lunch','dinner'].map(meal=>entry(meal,'08:00',100/3)),intake:{kcal:100},now});
   assert.equal(t.dayComplete,false); assert.equal(t.active,false); assert.ok(t.remainingMeals.some(m=>m.key==='dinner'));
 }
});
test('只有显式完成标记减少未完成餐次',()=>{
 const t=predict({completedMeals:['breakfast'],entries:[...entries,entry('lunch','13:00',100,{mealComplete:true})]});
 assert.deepEqual(t.remainingMeals.map(m=>m.key),['dinner']); assert.equal(t.dayComplete,false);
 assert.equal(predict({dayComplete:true}).state,'settled');
});
test('未来的完成标记不提前结束餐次',()=>{
 const t=predict({entries:[entry('dinner','19:00',100,{mealComplete:true})]});
 assert.ok(t.remainingMeals.some(m=>m.key==='dinner')); assert.equal(t.active,false);
});
test('缺少覆盖证据时不从早餐午餐推算全天范围',()=>{
 for(const kcal of [800,1600,2500]){
   const t=predict({intake:{...intake,kcal}}); assert.equal(t.range,null); assert.equal(t.direction,null);
 }
});
test('提前记录的大餐不当成已经摄入报警',()=>{
 const t=predict({intake:{...intake,kcal:3200},entries:[...entries,entry('dinner','19:00',2400)]});
 assert.equal(t.active,false); assert.equal(t.currentCovered,false);
});
test('已记录明显超计划仍保留正常餐次',()=>{
 const t=predict({intake:{...intake,kcal:2900}});
 assert.equal(t.direction,'over'); assert.equal(t.active,true); assert.ok(t.remainingMeals.some(m=>m.key==='dinner'));
});
test('历史、未来和无效计划通过同一入口关闭推荐',()=>{
 for(const args of [{isToday:false},{isToday:false,observation:{dateMode:'future'}},{targets:{status:'unavailable',reason:'资料无效'}}]){
  const a=buildAdvice({...input,...args}); assert.equal(a.budget,null); assert.deepEqual(a.recommend,[]); assert.deepEqual(a.insights,[]); assert.equal(a.trend.active,false);
 }
});
test('空热量与显式零不同，未知摄入不生成预算',()=>{
 const unknown=buildAdvice({...input,intake:sumNutrients([{kcal:null}])});
 assert.equal(unknown.budget,null);
 const zero=buildAdvice({...input,intake:sumNutrients([{...intake,kcal:0}])});
 assert.ok(zero.budget); assert.equal(zero.gaps.kcal.eaten,0);
});
test('当前累计收支不能替代全天摄入判断',()=>{
 for(const burnedNow of [null,0,700,800,801,3000]){
  const a=buildAdvice({...input,burnedNow});
  assert.equal(a.trend.currentCovered,false); assert.equal(a.trend.dayComplete,false);
  assert.equal(a.trend.active,false); assert.equal(a.gaps.kcal.target,2400);
 }
});
test('21 点不取消未吃的正常晚餐',()=>{
 const a=buildAdvice({...input,now:at('21:00')});
 assert.equal(a.trend.dayComplete,false); assert.ok(a.trend.remainingMeals.some(m=>m.key==='dinner'));
 assert.match(a.trend.reason,/尚未吃正餐，照常安排/);
});
test('超计划但蛋白较少的推荐清楚计入食物自身能量',()=>{
 const a=buildAdvice({...input,intake:{...intake,kcal:2900},now:at('18:30')});
 assert.ok(a.budget.optional); assert.ok(a.recommend.length);
 assert.ok(a.recommend.every(r=>r.nutrients.kcal>0&&r.nutrients.kcal<=200));
});
test('短期高脂结构不触发无覆盖依据的强制补热量',()=>{
 const a=buildAdvice(input); assert.equal(a.correction.active,false); assert.equal(a.correction.fatHigh,true);
 assert.ok(a.recommend.every(r=>r.nutrients.kcal<=a.budget.kcal));
});
test('2359/2162 只描述计划差额，不判定正常晚餐已完成',()=>{
 for(const now of [at('20:30'),at('21:00'),at('23:59')]){
  const a=buildAdvice({...input,now,targets:{...targets,kcal:2162},intake:{...intake,kcal:2359}});
  assert.equal(a.trend.dayComplete,false); assert.equal(a.correction.active,false);
  assert.match(a.status.detail,/2359 kcal.*2162 kcal/);
 }
});
test('旧进食偏好和历史样本不会改变今天的判断或食物顺序',()=>{
 const first=buildAdvice(input), second=buildAdvice({...input,rhythmEntries:[entry('dinner','08:00',4000)],profile:{...profile,rhythmMode:'personal'}});
 assert.deepEqual(first.trend,second.trend); assert.deepEqual(first.recommend,second.recommend);
});
test('计算重复执行不改变趋势和推荐排序',()=>{
 assert.deepEqual(buildAdvice(input),buildAdvice(input));
});
