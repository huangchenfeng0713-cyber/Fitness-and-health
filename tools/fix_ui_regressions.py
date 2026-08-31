from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected 1 occurrence, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# Data page: keep the direct healthMetricsCard() call visible in renderHealth so the
# view ordering contract stays simple, and open the settings drawer directly.
replace_once('js/views/health.js',
"""      onclick: () => {
        setIntent({ settingsSection: 'data' });
        location.hash = 'settings';
      },
""",
"""      onclick: () => {
        setIntent({ settingsSection: 'data' });
        document.querySelector('.topbar-settings-btn')?.click();
      },
""")
replace_once('js/views/health.js',
"""function healthMetricsWithSync() {
  const card = healthMetricsCard();
  const nudge = healthSyncNudge();
  if (card && nudge) card.append(nudge);
  return card;
}

export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    healthMetricsWithSync(),
""",
"""export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  const metrics = healthMetricsCard();
  const nudge = healthSyncNudge();
  if (metrics && nudge) metrics.append(nudge);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    metrics,
""")

# Training clash slot keeps its stable base + state class; the short badge content is
# visual, not a third class that breaks the existing zero-height-empty-slot contract.
replace_once('js/views/training.js',
"clashNode.className = line ? `ex-clash-slot clash-badge ${line.cls}` : 'ex-clash-slot';",
"clashNode.className = line ? `ex-clash-slot ${line.cls}` : 'ex-clash-slot';")
replace_once('css/ux-polish.css', '.ex-clash-slot.clash-badge {', '.ex-clash-slot.ex-clash {')
replace_once('css/ux-polish.css', '.ex-clash-slot.clash-badge.soft {', '.ex-clash-slot.ex-clash.soft {')

# A recently merged food-extra test still imported a helper that no longer belongs to
# foods.js. Use the exported canonical map, matching the rest of the food tests.
replace_once('test/food-extras.test.js',
"""import {
  findFood, searchFoods, hasFoodMix, defaultFoodMix, foodMixNutrition,
} from '../js/data/foods.js';
""",
"""import {
  FOOD_BY_ID, searchFoods, hasFoodMix, defaultFoodMix, foodMixNutrition,
} from '../js/data/foods.js';

const findFood = (id) => FOOD_BY_ID.get(id);
""")

# UI tests: align stale contracts with current main behavior and this UI pass.
replace_once('test/ui.test.js',
"""  for (const keep of ['clampedByFloor', 'rateWasClamped']) {
    assert.ok(dashboard.includes(keep), `「你填的数被改过了」这类提示不能丢：${keep}`);
  }
""",
"""  // 热量计划被成人常用下限真正改写时仍要说明；单纯超过建议速率只在输入框旁提示。
  assert.ok(dashboard.includes('clampedByFloor'), '热量计划被下限改写后的说明不能丢');
  assert.ok(!dashboard.includes('rateWasClamped'), '速率提示不应常驻今日页');
""")
replace_once('test/ui.test.js',
"""  const appModule = html.indexOf('<script type=\"module\" src=\"js/app.js\"></script>');
  assert.ok(assignment >= 0 && assignment < appModule, '云配置必须在 app.js 启动前注入');
""",
"""  const bootstrapModule = html.indexOf('<script type=\"module\" src=\"js/bootstrap.js\"></script>');
  assert.ok(assignment >= 0 && assignment < bootstrapModule, '云配置必须在 bootstrap.js 启动前注入');
""")
replace_once('test/ui.test.js',
"""test('速率越线在主卡上说，不藏进感叹号', () => {
  const dashboard = page('dashboard');
  const code = strip(dashboard);

  const heroInfo = code.slice(code.indexOf('function heroInfo('), code.indexOf('function rateNote('));
  assert.ok(!heroInfo.includes('rateWasClamped'),
    '「你填的数被改过了」还留在折叠面板里，藏起来等于没说');

  const hero = code.slice(code.indexOf('function heroCard('), code.indexOf('function energyBalance('));
  assert.match(hero, /rateNote\\(targets\\)/, '主卡上没有速率说明');

  const note = code.slice(code.indexOf('function rateNote('));
  assert.match(note, /rateOverAdvisory/, '越过建议上沿要说出来');
  assert.match(note, /rateAdvisoryKg/, '要给出建议上沿到底是多少');
  /*
   * 只许点名最后真正起作用的那一条。原先那句「已按体重比例和每日热量
   * 调整上限改为…」一口气点了两个机制，实测只有一条碰到了。
   */
  assert.match(note, /rateLimitedBy/, '截断原因得按实际起作用的那一条来说');
  assert.ok(!/按体重比例和每日热量/.test(code), '又把两个机制写回同一句话里了');
});
""",
"""test('速率越过建议只在输入时即时提示，不常驻今日主卡', () => {
  const dashboard = strip(page('dashboard'));
  const profile = strip(read('js/views/cards/profile.js'));

  assert.ok(!dashboard.includes('rateWasClamped'), '速率提示又常驻到今日页了');
  assert.ok(!dashboard.includes('rateOverAdvisory'), '超过建议速率的提示又常驻到今日页了');
  assert.ok(!dashboard.includes('function rateNote('), '今日页又恢复了单独的速率警告块');
  assert.match(profile, /rateGuidance/, '速率输入框旁边没有即时判断');
  assert.match(profile, /syncRateHint/, '速率判断没有跟着输入即时更新');
});
""")
replace_once('test/ui.test.js',
"assert.deepEqual(keys, ['身体与目标', '账号与同步', '数据管理', '计算与显示', '关于与反馈']);",
"assert.deepEqual(keys, ['身体与目标', '账号与同步', '导入与备份', '计算与显示', '关于与反馈']);")

# Weekly-summary tests were still checking a training-count row that current production
# deliberately removed: strength-session details live on the fitness page, while this
# card reports Apple exercise minutes. Update those contracts without changing runtime logic.
replace_once('test/weekly-summary.test.js',
"""  assert.equal(rowOf(s, 'weight').value, '—');
  assert.equal(rowOf(s, 'training').value, '0 次');
""",
"""  assert.equal(rowOf(s, 'weight').value, '—');
  assert.equal(rowOf(s, 'training'), undefined, '力量训练次数留在健身页，不在速览重复');
""")
replace_once('test/weekly-summary.test.js',
"""    healthDays: [{ date: day(30), weightKg: 95 }, { date: day(1), weightKg: 80 }],
    trainingDays: [{ date: day(40), items: [{ id: 'a', sets: [{}] }] }],
    targets: { kcal: 2000, protein: 150 },
  });
  assert.equal(rowOf(s, 'logged').value, '1 / 7 天', '把窗口外的日子算进来了');
  assert.equal(rowOf(s, 'training').value, '0 次');
""",
"""    healthDays: [{ date: day(30), weightKg: 95 }, { date: day(1), weightKg: 80 }],
    targets: { kcal: 2000, protein: 150 },
  });
  assert.equal(rowOf(s, 'logged').value, '1 / 7 天', '把窗口外的日子算进来了');
""")
replace_once('test/weekly-summary.test.js',
"""test('训练只报做了几次几组，不下「该练几组」的结论', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    trainingDays: [
      { date: day(1), items: [{ id: 'a', sets: [{}, {}, {}] }] },
      { date: day(3), items: [{ id: 'b', sets: [{}, {}] }] },
      { date: day(4), items: [] },   // 建了但一个动作都没选：不算一次训练
    ],
  });
  assert.equal(rowOf(s, 'training').value, '2 次');
  assert.match(rowOf(s, 'training').note, /共记下 5 组/);
  for (const r of s.rows) {
    assert.doesNotMatch(String(r.note), /应该|建议每周|太少|不够/, `训练那行下了结论：${r.note}`);
  }
});
""",
"""test('近 7 日速览不重复健身页的力量训练次数和组数', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    trainingDays: [
      { date: day(1), items: [{ id: 'a', sets: [{}, {}, {}] }] },
      { date: day(3), items: [{ id: 'b', sets: [{}, {}] }] },
    ],
  });
  assert.equal(rowOf(s, 'training'), undefined);
  assert.ok(!s.rows.some((r) => /力量训练|共记下 .*组/.test(`${r.label} ${r.note}`)));
});
""")
replace_once('test/weekly-summary.test.js',
"""    healthDays: days.map((date, i) => ({ date, exerciseMinutes: 20 + i * 10, steps: 6000 })),
    trainingDays: [{ date: '2026-08-25', items: [{ sets: [{}, {}, {}] }] }],
    targets: { kcal: 2200, protein: 110 },
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  assert.equal(by.exercise.value, '40分钟', '20/30/40/50/60 的均值是 40');
  assert.match(by.exercise.note, /Apple 健康/);
  assert.equal(by.training.value, '1 次');
  assert.match(by.training.label, /力量训练/, '两个数得叫不同的名字');
  assert.notEqual(by.exercise.label, by.training.label);
""",
"""    healthDays: days.map((date, i) => ({ date, exerciseMinutes: 20 + i * 10, steps: 6000 })),
    targets: { kcal: 2200, protein: 110 },
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  assert.equal(by.exercise.value, '40分钟', '20/30/40/50/60 的均值是 40');
  assert.match(by.exercise.note, /Apple 健康/);
  assert.equal(by.training, undefined, '力量训练次数应留在健身页');
""")

print('UI regression/test-contract fixes applied')
