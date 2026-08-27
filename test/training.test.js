import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISES, EXERCISE_BY_ID, GROUPS, MUSCLES, PATTERNS, searchExercises,
} from '../js/data/exercises.js';
import {
  overlapScore, overlapLevel, findOverlaps, coverage,
  replacementsFor, exercisesForGroup, exercisesForMuscles, planAdvice, starterCombo,
  normalizeSession, sessionVolume, weeklyVolume, recentExercises,
} from '../js/core/training.js';

test('动作库结构完整：五个部位、id 与名称唯一、肌肉与模式键合法', () => {
  assert.deepEqual(GROUPS.map((g) => g.label), ['胸', '肩（臂）', '背', '腿', '腹']);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length, 'id 有重复');
  assert.equal(new Set(EXERCISES.map((e) => e.name)).size, EXERCISES.length, '名称有重复');
  for (const e of EXERCISES) {
    assert.ok(GROUPS.some((g) => g.key === e.group), `${e.name} 的部位不在五大块里`);
    assert.ok(PATTERNS[e.pattern], `${e.name} 的动作模式非法`);
    assert.ok(e.primary.length, `${e.name} 没写主动肌`);
    for (const m of [...e.primary, ...e.secondary]) {
      assert.ok(MUSCLES[m], `${e.name} 引用了不存在的肌肉键 ${m}`);
    }
  }
  for (const g of GROUPS) {
    assert.ok(EXERCISES.filter((e) => e.group === g.key).length >= 8,
      `${g.label} 的动作太少，选起来不够用`);
  }
});

test('每个部位的主要肌肉都至少有一个动作练得到', () => {
  const primaryHit = new Set(EXERCISES.flatMap((e) => e.primary));
  for (const g of GROUPS) {
    for (const m of g.muscles) {
      assert.ok(primaryHit.has(m), `${MUSCLES[m]} 没有任何动作把它当主动肌`);
    }
  }
});

test('杠铃卧推和哑铃卧推判为高度重复', () => {
  // 用户举的例子：只差器械，动作模式和主动肌完全一样
  const a = EXERCISE_BY_ID.get('bench_press_bb');
  const b = EXERCISE_BY_ID.get('bench_press_db');
  assert.equal(overlapLevel(overlapScore(a, b)), 'high');
  const [dup] = findOverlaps(['bench_press_bb', 'bench_press_db']);
  assert.equal(dup.level, 'high');
  assert.deepEqual(dup.sharedPrimary, ['pec_mid']);
  assert.equal(dup.samePattern, true);
});

test('名字像但练的不是一回事的，不判重复', () => {
  // 平板 vs 上斜：都叫卧推，主动肌一个是中部一个是上胸
  assert.equal(findOverlaps(['bench_press_bb', 'incline_bench_db']).length, 0);
  // 深蹲 vs 罗马尼亚硬拉：都练下肢，一个伸膝主导一个髋铰链
  assert.equal(overlapLevel(overlapScore(
    EXERCISE_BY_ID.get('squat_bb'), EXERCISE_BY_ID.get('rdl_bb'),
  )), 'none');
});

test('名字毫不相干但主动肌相同的，能被认出来', () => {
  // 窄距卧推和绳索下压名字不像，主动肌都是肱三头肌
  const score = overlapScore(
    EXERCISE_BY_ID.get('close_grip_bench'), EXERCISE_BY_ID.get('triceps_pushdown'),
  );
  assert.ok(overlapLevel(score) !== 'none', `实得 ${score}`);
});

test('重复时给出的替换动作，本身不与留下的动作重复', () => {
  const selection = ['bench_press_bb', 'bench_press_db'];
  const alts = replacementsFor('bench_press_db', selection);
  assert.ok(alts.length, '没有给出替换建议');
  for (const alt of alts) {
    assert.ok(!selection.includes(alt.id), `${alt.name} 已经在计划里了`);
    assert.equal(overlapLevel(overlapScore(alt, EXERCISE_BY_ID.get('bench_press_bb'))), 'none',
      `${alt.name} 和留下的杠铃卧推还是重复的`);
    assert.equal(alt.group, 'chest', `${alt.name} 不是胸部动作`);
  }
});

test('覆盖分析说得出这套还缺哪块肉', () => {
  const cov = coverage(['bench_press_bb', 'bench_press_db']);
  const chest = cov.find((c) => c.key === 'chest');
  assert.equal(chest.exercises, 2);
  assert.deepEqual(chest.covered, ['pec_mid']);
  assert.deepEqual(chest.missing, ['pec_upper', 'pec_lower']);
  const back = cov.find((c) => c.key === 'back');
  assert.equal(back.exercises, 0);
});

test('按部位取动作，复合动作排在前面', () => {
  for (const g of GROUPS) {
    const list = exercisesForGroup(g.key);
    const firstIsolation = list.findIndex((e) => !e.compound);
    if (firstIsolation === -1) continue;
    assert.ok(list.slice(firstIsolation).every((e) => !e.compound),
      `${g.label} 的复合动作没有排在前面`);
  }
});

test('组合建议：重复、推拉失衡、全孤立动作都能指出来', () => {
  const dup = planAdvice(['bench_press_bb', 'bench_press_db']);
  assert.ok(dup.some((t) => t.level === 'warn' && /刺激高度相似/.test(t.title)));
  // 动作名只出现在按钮上，正文不再重复念一遍
  const dupTip = dup.find((t) => t.key.startsWith('dup-'));
  assert.ok(/把 哑铃卧推 换成/.test(dupTip.text), '没指明该换掉哪一个');
  assert.ok(dupTip.actions.length, '没给出替换方案');

  const allPush = planAdvice(['bench_press_bb', 'ohp_db', 'incline_bench_db', 'cable_fly']);
  assert.ok(allPush.some((t) => /拉只有 0 个/.test(t.title)), JSON.stringify(allPush.map((t) => t.title)));

  const isolationOnly = planAdvice(['lateral_raise_db', 'curl_db', 'leg_extension']);
  assert.ok(isolationOnly.some((t) => /全是孤立动作/.test(t.title)));

  // 一套搭配合理的推日不该被乱报
  const good = planAdvice(['bench_press_bb', 'incline_bench_db', 'lateral_raise_db', 'triceps_pushdown']);
  assert.ok(!good.some((t) => t.level === 'warn'), JSON.stringify(good.map((t) => t.title)));
});

test('纯腿日不会被推拉平衡的提示打扰', () => {
  const legDay = planAdvice(['squat_bb', 'rdl_bb', 'leg_press', 'calf_raise_standing']);
  assert.ok(!legDay.some((t) => t.key === 'push-pull'), JSON.stringify(legDay.map((t) => t.title)));
});

test('动作可以按中文名、拼音和肌肉搜到', () => {
  assert.ok(searchExercises('卧推').some((e) => e.id === 'bench_press_bb'));
  assert.ok(searchExercises('yingla').some((e) => e.id === 'deadlift'));
  assert.ok(searchExercises('squat').some((e) => e.id === 'squat_bb'));
  assert.ok(searchExercises('背阔肌').some((e) => e.group === 'back'));
  assert.deepEqual(searchExercises(''), []);
});

test('固定器械动作足够多，每个部位都能只用器械凑出一套', () => {
  // 用户要求补大量固定器械动作：健身房里最常见的约束是「只有器械可用」
  const isMachine = (e) => e.equipment === 'machine' || e.equipment === 'cable';
  for (const g of GROUPS) {
    const machines = EXERCISES.filter((e) => e.group === g.key && isMachine(e));
    assert.ok(machines.length >= 5,
      `${g.label} 只有 ${machines.length} 个固定器械动作，凑不出一套`);
  }
  assert.ok(EXERCISES.filter(isMachine).length >= 55,
    '固定器械动作总量偏少');
});

test('还没练到某块肌肉时，给得出具体补什么动作', () => {
  // 用户反馈：只说「很多地方没练到」，不给动作名，等于把问题原样退回来
  const alts = exercisesForMuscles(['delt_rear'], { group: 'shoulder', limit: 3 });
  assert.ok(alts.length >= 2, '后束缺口给不出动作');
  for (const e of alts) {
    assert.ok(e.primary.includes('delt_rear'), `${e.name} 并不主要练后束`);
  }
});

test('补缺口的动作不会和已选动作再重复一遍', () => {
  // 已经在练绳索面拉，补后束时不该又推荐一个同模式同主动肌的
  const selection = ['ohp_db', 'lateral_raise_db', 'face_pull'];
  const alts = exercisesForMuscles(['delt_rear'], { exclude: selection, group: 'shoulder' });
  for (const e of alts) {
    assert.ok(!selection.includes(e.id), '推荐了已经选过的动作');
    assert.notEqual(overlapLevel(overlapScore(e, EXERCISE_BY_ID.get('face_pull'))), 'high',
      `${e.name} 与已选的绳索面拉高度重复`);
  }
});

test('缺口提示带上可以直接点的动作', () => {
  // 两个动作都压中胸，上胸和下胸没练到
  const tips = planAdvice(['bench_press_bb', 'pec_deck']);
  const gap = tips.find((t) => t.key === 'gap-chest');
  assert.ok(gap, '没给出胸部缺口提示');
  assert.match(gap.title, /还没练到 上胸、下胸/);
  assert.ok(gap.actions.length, '缺口提示没有可点的动作');
  for (const a of gap.actions) {
    const e = EXERCISE_BY_ID.get(a.id);
    assert.ok(e, `动作 ${a.id} 不在库里`);
    assert.ok(e.primary.some((m) => ['pec_upper', 'pec_lower'].includes(m)),
      `${e.name} 补不上这个缺口`);
  }
  assert.match(gap.text, /想练全的话，从下面挑一个补上。/);
  // 补的是哪块肌肉交给按钮上的注解，正文不重复动作名
  for (const a of gap.actions) {
    assert.ok(['上胸', '下胸'].includes(a.note), `按钮没标出补的是哪块：${JSON.stringify(a)}`);
    assert.ok(!gap.text.includes(a.label), `正文重复了动作名 ${a.label}`);
  }
});

test('重复提示里的替换动作可以一键换掉原来那个', () => {
  const tips = planAdvice(['bench_press_bb', 'bench_press_db']);
  const dup = tips.find((t) => t.key.startsWith('dup-'));
  assert.ok(dup.actions.length, '重复提示没给替换动作');
  for (const a of dup.actions) {
    assert.equal(a.replaces, 'bench_press_db', '替换动作没标明换掉的是哪个');
    assert.notEqual(a.id, 'bench_press_db');
  }
});

test('两个动作器械相同时不说「只差器械」', () => {
  // 库里现在同一个模式有好几台器械，「只差器械（器械 / 器械）」读起来像 bug
  const same = planAdvice(['chest_press_machine', 'bench_press_smith'])
    .find((t) => t.key.startsWith('dup-'));
  assert.ok(same, '两台器械推胸没被判成重复');
  assert.ok(!same.text.includes('只差器械'), same.text);
  assert.match(same.text, /器械也一样（器械），只是换了台机子/);

  const diff = planAdvice(['bench_press_bb', 'bench_press_db'])
    .find((t) => t.key.startsWith('dup-'));
  assert.match(diff.text, /只差器械（杠铃 \/ 哑铃）/);
});

test('替换建议优先同类：不拿孤立动作换掉复合动作', () => {
  // 只按重合度排，替换卧推时最先冒出来的是绳索夹胸——重合确实最低，
  // 但那等于把这次训练的主项拆了。
  const forCompound = replacementsFor('bench_press_db', ['bench_press_bb', 'bench_press_db']);
  assert.ok(forCompound.length, '没给出替换动作');
  assert.ok(forCompound[0].compound, `复合动作被换成了孤立动作：${forCompound[0].name}`);

  const forIsolation = replacementsFor('db_fly', ['cable_fly', 'db_fly']);
  assert.ok(forIsolation.length && !forIsolation[0].compound,
    `孤立动作的首选替换不该是复合动作：${forIsolation[0]?.name}`);
});

test('起手组合是三个不同的动作模式，不会搭成「一个卧推 + 两个飞鸟」', () => {
  // 动作库补大之后，「挑重合最低的两个」永远挑到孤立动作：
  // 胸日会变成三个动作全压在胸大肌中部，上胸下胸一个没练到。
  for (const g of GROUPS) {
    const combo = starterCombo(g.key);
    assert.equal(combo.length, 3, `${g.label} 的起手组合凑不齐三个`);
    assert.equal(new Set(combo.map((e) => e.pattern)).size, 3,
      `${g.label} 起手组合里有重样的动作模式：${combo.map((e) => e.name).join('、')}`);
    assert.equal(findOverlaps(combo).filter((o) => o.level === 'high').length, 0,
      `${g.label} 起手组合里有高度重复`);
    // 每个动作都要补上前面练不到的地方
    const seen = new Set();
    combo.forEach((e, i) => {
      if (i > 0) {
        assert.ok(e.primary.some((m) => !seen.has(m)),
          `${e.name} 没有补上任何新肌肉`);
      }
      for (const m of e.primary) seen.add(m);
    });
  }
});

test('起手组合从复合动作打底', () => {
  for (const key of ['chest', 'shoulder', 'back', 'leg']) {
    assert.ok(starterCombo(key)[0].compound,
      `${key} 的起手第一个动作不是复合动作`);
  }
  // 胸日三个动作要能覆盖上中下胸
  const chest = starterCombo('chest').flatMap((e) => e.primary);
  for (const m of ['pec_upper', 'pec_mid', 'pec_lower']) {
    assert.ok(chest.includes(m), `胸日起手组合没练到 ${MUSCLES[m]}`);
  }
});

test('动作再多，建议条数也不会失控', () => {
  // 两两比对是 O(n²)：选满一个部位的十八个动作原先会生成 52 条提示、
  // 页面 7000px 高，真正要紧的那条被埋在下面。
  for (const g of GROUPS) {
    const all = EXERCISES.filter((e) => e.group === g.key).map((e) => e.id);
    const tips = planAdvice(all);
    assert.ok(tips.length <= 14,
      `${g.label} 全选 ${all.length} 个动作给出了 ${tips.length} 条建议`);
    // 同一个动作不该被反复点名要换掉
    const removals = tips.filter((t) => t.key.startsWith('dup-') && t.actions?.length)
      .map((t) => t.actions[0].replaces);
    assert.equal(new Set(removals).size, removals.length, '同一个动作被要求换掉多次');
  }
});

test('提示过多时给出汇总，而不是默默吞掉', () => {
  const all = EXERCISES.filter((e) => e.group === 'chest').map((e) => e.id);
  const tips = planAdvice(all);
  assert.ok(tips.some((t) => t.key === 'dup-more'), '省略掉的重复没有汇总说明');
  assert.ok(tips.some((t) => t.key === 'part-more'), '省略掉的部分重叠没有汇总说明');
  // 汇总要给得出数字，不能含糊说「还有一些」
  assert.match(tips.find((t) => t.key === 'dup-more').title, /另有 \d+ 个动作/);
});

test('正常规模的一套动作不会被汇总提示打扰', () => {
  // 五个动作、彼此不重复：不该冒出「还有 N 组重叠」这种话
  const tips = planAdvice(['bench_press_bb', 'lat_pulldown', 'squat_bb', 'plank', 'lateral_raise_db']);
  assert.ok(!tips.some((t) => t.key === 'dup-more' || t.key === 'part-more'), JSON.stringify(tips.map((t) => t.title)));
});


test('重复提示不把话说死：重复度只看动作构成，看不出训练量和负荷', () => {
  // 「练的是同一件事」「多出来的量没有换来新刺激」把训练效果说成了动作构成的函数。
  // 实际还取决于负荷、总量、频率和动作顺序——这些从「选了哪几个动作」里看不出来。
  const tips = planAdvice(['bench_press_bb', 'bench_press_db', 'cable_fly', 'db_fly']);
  const all = tips.map((t) => `${t.title}${t.text}`).join('');
  for (const tooAbsolute of ['练的是同一件事', '没有换来新的刺激']) {
    assert.ok(!all.includes(tooAbsolute), `措辞过于绝对：${tooAbsolute}`);
  }
  // 但也不能含糊到没有立场——要说清「相似在哪」和「取决于什么」
  assert.ok(all.includes('刺激高度相似'));
  assert.ok(all.includes('取决于你的训练目的和这一周的总量'));
});

test('训练记录：坏数据清洗掉，不抛异常', () => {
  const dirty = normalizeSession({
    date: '2026-08-27',
    items: [
      { id: 'bench_press_bb', sets: [{ reps: 8, weightKg: 60 }, { reps: '10', weightKg: '62.5' }] },
      { id: 'bench_press_bb', sets: [] },              // 重复
      { id: '不存在的动作', sets: [{ reps: 5 }] },        // 库里没有
      { id: 'squat_bb', sets: [{ reps: 9e9, weightKg: -3 }] }, // 越界
      null, 'x', 42,
    ],
  });
  assert.deepEqual(dirty.items.map((i) => i.id), ['bench_press_bb', 'squat_bb']);
  assert.deepEqual(dirty.items[0].sets[1], { reps: 10, weightKg: 62.5 }, '字符串数字应被接受');
  const [clamped] = dirty.items[1].sets;
  assert.ok(clamped.reps <= 500 && clamped.weightKg >= 0, `越界值没夹住：${JSON.stringify(clamped)}`);
});

test('训练量只统计真的填了的组，没填重量不冒充 0 kg', () => {
  const noWeight = sessionVolume({ items: [{ id: 'pushup', sets: [{ reps: 20 }, { reps: 18 }] }] });
  assert.equal(noWeight.sets, 2);
  assert.equal(noWeight.doneSets, 2);
  assert.equal(noWeight.tonnage, null, '一组重量都没填时不该给出总容量');

  const mixed = sessionVolume({
    items: [
      { id: 'bench_press_bb', sets: [{ reps: 8, weightKg: 60 }, { reps: 8 }] },
      { id: 'lat_pulldown', sets: [{ reps: 12, weightKg: 45 }] },
    ],
  });
  assert.equal(mixed.sets, 3);
  assert.equal(mixed.weighedSets, 2);
  assert.equal(mixed.tonnage, 8 * 60 + 12 * 45);
  assert.deepEqual(mixed.byGroup, { chest: 2, back: 1 });
});

test('周训练量按日期窗口统计，窗口外的不算', () => {
  const sessions = [
    { date: '2026-08-27', items: [{ id: 'bench_press_bb', sets: [{ reps: 8 }] }] },
    { date: '2026-08-21', items: [{ id: 'squat_bb', sets: [{ reps: 5 }, { reps: 5 }] }] },
    { date: '2026-08-20', items: [{ id: 'deadlift', sets: [{ reps: 3 }] }] },  // 窗口外
  ];
  const week = weeklyVolume(sessions, '2026-08-27');
  assert.equal(week.start, '2026-08-21');
  assert.equal(week.sessions, 2);
  assert.equal(week.sets, 3);
  assert.deepEqual(week.byGroup, { chest: 1, leg: 2 });
});

test('最近练过按日期倒序，且不含当天', () => {
  const sessions = [
    { date: '2026-08-20', items: [{ id: 'squat_bb', sets: [] }] },
    { date: '2026-08-25', items: [{ id: 'bench_press_bb', sets: [] }, { id: 'squat_bb', sets: [] }] },
    { date: '2026-08-27', items: [{ id: 'deadlift', sets: [] }] },
  ];
  const recent = recentExercises(sessions, { before: '2026-08-27' });
  assert.deepEqual(recent.map((r) => r.exercise.id), ['bench_press_bb', 'squat_bb']);
  assert.equal(recent[0].date, '2026-08-25');
  assert.equal(recent[1].date, '2026-08-25', '同一动作应取最近那次的日期');
});
