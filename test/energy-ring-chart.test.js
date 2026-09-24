import test from 'node:test';
import assert from 'node:assert/strict';
import { ringProgressColor, ringTipColor } from '../js/lib/energy-ring-chart.js';
import { energyRing } from '../js/core/energy-ring.js';

const palette = {
  intake: ['#dcfff0', '#42c992', '#1c9e75'],
  burn: ['#fff3d3', '#e8ad55', '#c88935'],
};
const luminance = color => {
  const [red, green, blue] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return red * .2126 + green * .7152 + blue * .0722;
};

test('两条轨道各自从浅到深，第二圈延续第一圈终色并封顶', () => {
  for (const track of ['intake', 'burn']) {
    assert.equal(ringProgressColor(track, 0, palette), palette[track][0]);
    assert.equal(ringProgressColor(track, 100, palette), palette[track][1]);
    assert.equal(ringProgressColor(track, 200, palette), palette[track][2]);
    assert.equal(ringProgressColor(track, 300, palette), palette[track][2]);
    assert.ok(luminance(ringProgressColor(track, 0, palette))
      - luminance(ringProgressColor(track, 100, palette)) >= .35,
    `${track} 第一圈起点和终点太接近`);
    const rgb = pct => [1, 3, 5].map(i => parseInt(ringProgressColor(track, pct, palette).slice(i, i + 2), 16));
    for (const [a, b] of [[0, 25], [25, 75], [75, 100], [100, 150], [150, 200]]) {
      assert.ok(rgb(a).every((channel, i) => channel >= rgb(b)[i]), `${track} ${a}→${b} 变亮了`);
    }
  }
});

test('图例取各自当前弧尖，摄入和消耗互不带动', () => {
  const one = energyRing({ eaten: 550, burned: 1100, target: 2200 });
  assert.equal(ringTipColor(one, 'intake', palette), ringProgressColor('intake', 25, palette));
  assert.equal(ringTipColor(one, 'burn', palette), ringProgressColor('burn', 50, palette));
  const moreBurn = energyRing({ eaten: 550, burned: 3300, target: 2200 });
  assert.equal(ringTipColor(moreBurn, 'intake', palette), ringTipColor(one, 'intake', palette));
  assert.equal(ringTipColor(moreBurn, 'burn', palette), ringProgressColor('burn', 150, palette));
});
