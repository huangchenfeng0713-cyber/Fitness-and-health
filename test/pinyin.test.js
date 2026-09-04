import test from 'node:test';
import assert from 'node:assert/strict';
import { pinyinInitials, aliasInitials, matchesInitials, substringMatch } from '../js/core/pinyin.js';
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

test('首字母只认前缀，一个字母也算', () => {
  assert.ok(matchesInitials('tz', 'tuozhi naifen'));
  assert.ok(matchesInitials('tznf', 'tuozhi naifen'));
  assert.ok(matchesInitials('nf', 'tuozhi naifen'));
  // 前缀语义下一个字母是安全的：它只命中首字母以它起头的那些
  assert.ok(matchesInitials('t', 'tuozhi naifen'));
  assert.ok(!matchesInitials('z', 'tuozhi naifen'), '首字母是 t 和 n，不该被 z 命中');
  // 子串不算：否则两个字母能在任意长缩写的中间碰上
  assert.ok(!matchesInitials('zn', 'tuozhi naifen'));
  assert.ok(!matchesInitials('TZ ', 'tuozhi naifen') === false, '大小写和空白要归一');
});

test('一个拉丁字母不拿去做子串匹配', () => {
  /*
   * 别名里存的是全拼，a / i / h 这些字母几乎每条全拼里都有。
   * 改之前搜 h 命中 128 个动作里的 100 个、a 命中 122 个 —— 而人打第一个
   * 拼音字母时看到的正是这一屏，等于搜索框在第一下就没用。
   */
  assert.ok(!substringMatch('t', 'tuozhi naifen'), '一个字母不走子串');
  assert.ok(substringMatch('tu', 'tuozhi naifen'), '两个字母照旧走子串');
  assert.ok(substringMatch('脱', '脱脂牛奶粉'), '单个汉字不受这条限制');

  for (const [q, cap] of [['h', 30], ['a', 30], ['i', 30], ['g', 30]]) {
    const hits = searchExercises(q).length;
    assert.ok(hits <= cap, `搜「${q}」命中 ${hits} 个动作，一个字母不该扫掉大半个库`);
  }
  // 缩窄了但不能缩没：一个字母仍要按首字母给出结果
  assert.ok(searchExercises('g').some((e) => e.name === '杠铃卧推'), '打 g 应当还能看到杠铃开头的动作');
});

test('两个搜索都能用首字母找到东西', () => {
  const foods = searchFoods('tznnf');
  assert.ok(foods.some((f) => f.name.includes('脱脂牛奶粉')),
    `打首字母应当找到脱脂牛奶粉，实际前三条：${foods.slice(0, 3).map((f) => f.name)}`);
  const exercises = searchExercises('glwt');
  assert.ok(exercises.some((e) => e.name === '杠铃卧推'),
    `打 glwt 应当找到杠铃卧推，实际：${exercises.map((e) => e.name)}`);
});
