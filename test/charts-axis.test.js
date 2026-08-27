/**
 * 图表纵轴刻度的取值逻辑。
 * lineChart 依赖 DOM，这里只测抽出来的刻度规则，保证不再出现
 * 「1 / 1 / 0 / -0」这种重复且带负零的刻度。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** 与 charts.js 中 lineChart 保持一致的刻度计算 */
function axisTicks(values, { target = null, decimals = null } = {}) {
  const ys = [...values];
  if (target != null) ys.push(target);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  const span = max - min || Math.abs(max) * 0.1 || 1;
  min -= span * 0.12;
  max += span * 0.12;
  if (ys.every((v) => v >= 0)) min = Math.max(0, min);
  const range = max - min;
  let dec = decimals != null ? decimals : (range >= 20 ? 0 : range >= 2 ? 1 : 2);
  /*
   * 量程比刻度精度还细时，四条刻度会印成「62.0 / 62.0 / 61.9 / 61.9」——
   * 一条横线上两个一样的数，等于没有刻度。体重最容易碰上：一周之内波动
   * 常常不到 0.1 kg，而它又显式要了 1 位小数，自适应那条规则被绕过去了。
   * 所以调用方给的位数只当下限，撞车了继续往上加。
   */
  const tickAt = (i, d) => (min + ((max - min) * i) / 3).toFixed(d);
  while (dec < 4 && new Set([0, 1, 2, 3].map((i) => tickAt(i, dec))).size < 4) dec += 1;
  const fmt = (v) => {
    const t = v.toFixed(dec);
    return t === `-${(0).toFixed(dec)}` ? (0).toFixed(dec) : t;
  };
  return [0, 1, 2, 3].map((i) => fmt(min + ((max - min) * i) / 3));
}

test('小量程不会产生重复刻度', () => {
  // 修复前：活动能量被缩小一千倍后落在 0~1，刻度渲染成 1 / 1 / 0 / -0
  const ticks = axisTicks([0.2, 0.55, 0.9, 1.1, 0.75]);
  assert.equal(new Set(ticks).size, ticks.length, `刻度有重复：${ticks.join(' / ')}`);
});

test('非负指标不会出现负刻度或负零', () => {
  for (const vals of [[0.2, 1.1], [0, 5000, 9000], [6.4, 7.7, 8.4]]) {
    const ticks = axisTicks(vals);
    for (const t of ticks) {
      assert.ok(!t.startsWith('-'), `出现负刻度 ${t}（数据全为非负）：${ticks.join(' / ')}`);
    }
  }
});

test('可以有负刻度的场景仍然保留（热量收支）', () => {
  const ticks = axisTicks([-620, -180, 240], { target: 0 });
  assert.ok(ticks.some((t) => t.startsWith('-')), `收支图应保留负刻度：${ticks.join(' / ')}`);
});

test('大量程用整数刻度，小量程自动加小数位', () => {
  assert.ok(axisTicks([2000, 9000]).every((t) => !t.includes('.')), '步数这类大数不该带小数');
  assert.ok(axisTicks([70.1, 71.8]).some((t) => t.includes('.')), '体重需要小数位才能区分');
  assert.ok(axisTicks([0.2, 1.1]).every((t) => t.split('.')[1]?.length === 2), '小量程应保留两位');
});

test('显式指定小数位时以调用方为准', () => {
  assert.ok(axisTicks([70.1, 71.8], { decimals: 1 }).every((t) => t.split('.')[1]?.length === 1));
});

test('调用方给的小数位只是下限，量程太细时继续加位', () => {
  // 实测：一周体重 61.92~62.00，decimals: 1 画出「62.0 / 62.0 / 61.9 / 61.9」
  const ticks = axisTicks([61.92, 61.94, 62.0, 61.96], { decimals: 1 });
  assert.equal(new Set(ticks).size, ticks.length, `刻度有重复：${ticks.join(' / ')}`);
});


/* ---------------------------------------------------- 横轴窗口 domain */

/** 与 charts.js 中 lineChart 的横轴映射保持一致 */
function axisDomainMap(pointDates, domain = null, { width = 640, padL = 38, padR = 12 } = {}) {
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const parse = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
  const dayXs = pointDates.map(parse);
  const domainXs = Array.isArray(domain) && domain.length === 2 ? domain.map(parse) : null;
  const useDomain = domainXs != null && domainXs.every(Number.isFinite) && domainXs[1] > domainXs[0];
  const x0 = useDomain ? domainXs[0] : dayXs[0];
  const x1 = useDomain ? domainXs[1] : dayXs.at(-1);
  const hasCalendarX = dayXs.every(Number.isFinite) && x1 > x0;
  const px = (i) => {
    const ratio = hasCalendarX ? clamp01((dayXs[i] - x0) / (x1 - x0)) : i / (pointDates.length - 1);
    return padL + ratio * (width - padL - padR);
  };
  return {
    useDomain,
    firstLabel: String(useDomain ? domain[0] : pointDates[0]).slice(5),
    lastLabel: String(useDomain ? domain[1] : pointDates.at(-1)).slice(5),
    xs: pointDates.map((_, i) => Math.round(px(i))),
  };
}

test('不给 domain 时横轴仍是「第一个到最后一个有数据的日子」', () => {
  const r = axisDomainMap(['2026-08-22', '2026-08-23']);
  assert.equal(r.useDomain, false);
  assert.equal(r.firstLabel, '08-22');
  assert.equal(r.lastLabel, '08-23');
  assert.equal(r.xs[0], 38);
  assert.equal(r.xs.at(-1), 628, '最后一个点贴右边界');
});

test('给了 domain 后横轴标的是区间两端，数据落在区间内的真实位置', () => {
  // 用户实测：同一页「近 30 天」里，只有 2 次体重记录的图显示 08-22 → 08-23，
  // 旁边活动能量却是 07-26 → 08-24，三张图三个区间没法横向比较。
  const domain = ['2026-07-26', '2026-08-24'];
  const r = axisDomainMap(['2026-08-22', '2026-08-23'], domain);
  assert.equal(r.useDomain, true);
  assert.equal(r.firstLabel, '07-26');
  assert.equal(r.lastLabel, '08-24');
  assert.ok(r.xs[0] > 500 && r.xs[0] < 628, `08-22 应靠近右侧，实得 x=${r.xs[0]}`);
  assert.ok(r.xs.at(-1) < 628, '最后一个数据点不该被拉到右边界，08-23 还不是区间末尾');
});

test('同一 domain 下不同数据的两张图，同一天落在同一个 x 上', () => {
  const domain = ['2026-07-26', '2026-08-24'];
  const a = axisDomainMap(['2026-07-26', '2026-08-10', '2026-08-24'], domain);
  const b = axisDomainMap(['2026-08-10', '2026-08-24'], domain);
  assert.equal(a.xs[1], b.xs[0], '08-10 在两张图上必须对齐');
  assert.equal(a.xs[2], b.xs[1], '08-24 在两张图上必须对齐');
  assert.equal(a.firstLabel, b.firstLabel);
  assert.equal(a.lastLabel, b.lastLabel);
});

test('数据点超出 domain 时被夹住，不会画到画布外', () => {
  const r = axisDomainMap(['2026-07-01', '2026-09-30'], ['2026-07-26', '2026-08-24']);
  assert.ok(r.xs[0] >= 38, `左端不能越界，实得 ${r.xs[0]}`);
  assert.ok(r.xs.at(-1) <= 628, `右端不能越界，实得 ${r.xs.at(-1)}`);
});

test('非法 domain 会被忽略而不是把图画坏', () => {
  for (const bad of [['2026-08-24', '2026-07-26'], ['乱写', '也乱写'], ['2026-08-01'], [], null]) {
    const r = axisDomainMap(['2026-08-22', '2026-08-23'], bad);
    assert.equal(r.useDomain, false, `${JSON.stringify(bad)} 不该被当成有效区间`);
    assert.equal(r.firstLabel, '08-22');
  }
});
