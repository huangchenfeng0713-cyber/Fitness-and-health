import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTargets, nutrientReferences } from '../js/core/nutrition.js';
import { dailyMetrics, nutrientScale } from '../js/core/metrics.js';
test('钠AI/PI按年龄，不随活动放宽；糖供能标准有克数封顶',()=>{
  for(const [age,attention,max] of [[18,1500,2000],[64,1500,2000],[65,1400,1900],[74,1400,1900],[75,1400,1800],[90,1400,1800]]){
    const r=nutrientReferences({age},4000);
    assert.equal(r.sodium,max); assert.equal(r.sodiumAttention,attention);
    assert.equal(r.sugar,50); assert.equal(r.sugarAttention,25);
  }
  assert.equal(nutrientReferences({},1600).sugar,40);
  assert.equal(nutrientReferences({},1600).sugarAttention,20);
});
test('纤维绿色区间固定，不足橙，达标和偏高黑，无红线',()=>{
  for(const [eaten,level,pct] of [[0,'near',0],[24.9,'near',49.8],[25,'plain',50],[30,'plain',60],[45,'plain',90],[100,'plain',100]]){
    const m=nutrientScale({key:'fiber',eaten});
    assert.equal(m.level,level); assert.ok(Math.abs(m.markerPct-pct)<1e-9);
    assert.equal(m.zoneStart,50); assert.equal(m.zoneEnd,60); assert.equal(m.limitPct,null);
  }
});
test('钠/糖正常黑，提醒橙，超限立即红；尺度固定读数封顶',()=>{
  for(const [key,target,attention] of [['sodium',2000,1500],['sugar',50,25]]){
    for(const [eaten,level] of [[0,'plain'],[attention-.01,'plain'],[attention,'near'],[target,'near'],[target+.01,'over'],[target*10,'over']]){
      const m=nutrientScale({key,target,attention,eaten});
      assert.equal(m.level,level); assert.equal(m.limitPct,78); assert.equal(m.zoneStart,null);
      assert.equal(m.axisMax,target/.78); assert.ok(m.markerPct<=100);
    }
  }
});
test('每日指标复用同一份目标和提醒门槛，保留食物统计输入',()=>{
  const t=dailyTargets({sex:'male',age:70,weightKg:70,heightCm:175,activity:'light',goal:'maintain'});
  const gaps=Object.fromEntries(['kcal','protein','fat','carb','fiber','sodium','sugar'].map(k=>[k,{eaten:0}]));
  gaps.sugar.eaten=26.2;
  const m=dailyMetrics(t,gaps);
  assert.equal(m.find(m=>m.key==='sodium').target,1900);
  assert.equal(m.find(m=>m.key==='sodium').attention,1400);
  assert.equal(m.find(m=>m.key==='sugar').eaten,26.2);
});
