import test from 'node:test';
import assert from 'node:assert/strict';
import { pinyinInitials, aliasInitials, matchesInitials } from '../js/core/pinyin.js';
import { searchFoods } from '../js/data/foods.js';
import { searchExercises } from '../js/data/exercises.js';

test('全拼切成音节再取首字母', () => {
  assert.equal(pinyinInitials('tuozhi'), 'tz');
  assert.equal(pinyinInitials('niunaifen'), 'nnf');
  assert.equal(pinyinInitials('xihongshi'), 'xhs');
  // zh/ch/sh 必须比 z/c/s 先匹配，否则 zhi 会被切成 z + hi
  assert.equal(pinyinInitials('zhi'), 'z');
  assert.equal(pinyinInitials('shachamian'), 'scm');
  // 长韵母排在短的前面，否则 xiang 会被切成 xia + ng
  assert.equal(pinyinInitials('xiang'), 'x');
  assert.equal(pinyinInitials('zhuang'), 'z');
});

test('切不干净的一律返回空串，不去猜', () => {
  // 英文单词不是拼音，宁可不给结果也不给错结果；调用方回退到子串匹配
  for (const word of ['skim', 'milk', 'powder', 'bench', 'squat', '']) {
    assert.equal(pinyinInitials(word), '', `${word} 不该被当成拼音`);
  }
  assert.equal(pinyinInitials('tuo zhi'), '', '带空格的整串不该在这里处理');
  assert.equal(pinyinInitials('脱脂'), '', '汉字不进这个函数');
});

test('每个词各给一个缩写，再给一个拼起来的', () => {
  assert.deepEqual(aliasInitials('tuozhi naifen'), ['tz', 'nf', 'tznf']);
  assert.deepEqual(aliasInitials('naifen'), ['nf']);
  assert.deepEqual(aliasInitials('skim milk'), []);
});

test('只认前缀且至少两个字母', () => {
  assert.ok(matchesInitials('tz', 'tuozhi naifen'));
  assert.ok(matchesInitials('tznf', 'tuozhi naifen'));
  assert.ok(matchesInitials('nf', 'tuozhi naifen'));
  // 单个字母会匹配到半个库
  assert.ok(!matchesInitials('t', 'tuozhi naifen'));
  // 子串不算：否则两个字母能在任意长缩写的中间碰上
  assert.ok(!matchesInitials('zn', 'tuozhi naifen'));
  assert.ok(!matchesInitials('TZ ', 'tuozhi naifen') === false, '大小写和空白要归一');
});

test('两个搜索都能用首字母找到东西', () => {
  const foods = searchFoods('tznnf');
  assert.ok(foods.some((f) => f.name.includes('脱脂牛奶粉')),
    `打首字母应当找到脱脂牛奶粉，实际前三条：${foods.slice(0, 3).map((f) => f.name)}`);
  const exercises = searchExercises('glwt');
  assert.ok(exercises.some((e) => e.name === '杠铃卧推'),
    `打 glwt 应当找到杠铃卧推，实际：${exercises.map((e) => e.name)}`);
});
