import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNutritionLabel, normalizeLabelText, describeLabelResult, linesFromWords,
} from '../js/core/nutrition-label.js';

/*
 * 这一段是 tesseract（chi_sim，psm 4）对一张标准营养成分表的**原样输出**，
 * 一个字没改：「千焦」认成「王焦」、「蛋白质」前多了个「和」、「—糖」认成「一炉」、
 * NRV% 那一列 19% 认成 199%。解析器要在这种输入上把七项全拿对。
 */
const REAL_OCR = `营养成分表

项目                     每100克                NRV%
能量                     1569王焦              199%
和蛋白质                  6.8克                    工1%
脂肪               18.5克             319%
碳水化合物     55.2克       18%
一炉        12.0克

膳食纤维      2.1克       8%
钠                 420毫克            21%
`;

test('真机 OCR 原样输出：七项全拿对，推断出来的糖标成待核对', () => {
  const r = parseNutritionLabel(REAL_OCR);
  assert.deepEqual(r.values, {
    energy: 375, protein: 6.8, fat: 18.5, carb: 55.2, fiber: 2.1, sugar: 12, sodium: 420,
  });
  assert.deepEqual(r.energyLabel, { value: 1569, unit: 'kj' }, '表单要能照标签原样显示 1569 kJ');
  assert.equal(r.basis, '100g');
  assert.equal(r.source, 'per100');
  assert.deepEqual(r.guessed, ['sugar']);
  assert.deepEqual(r.warnings, []);
});

test('汉字之间被插了空格也认得（tesseract 默认版面分析的输出）', () => {
  const r = parseNutritionLabel('营养 成 分 表\n项 目 每 100 克 NRV%\n能 量 1569 千 焦 19%\n蛋 白 质 6.8 克 11%\n钠 420 毫 克 21%');
  assert.equal(r.values.energy, 375);
  assert.equal(r.values.protein, 6.8);
  assert.equal(r.values.sodium, 420);
  assert.equal(r.source, 'per100');
});

test('全角数字、全角百分号、中文句号当小数点都能读', () => {
  assert.equal(normalizeLabelText('６．８克'), '6.8克');
  const r = parseNutritionLabel('每100克\n蛋白质 ６．８克 １１％\n脂肪 18。5克\n钠 42O毫克');
  assert.equal(r.values.protein, 6.8);
  assert.equal(r.values.fat, 18.5);
  assert.equal(r.values.sodium, 420, '数字里夹的字母 O 是 0');
});

test('按每份标的要换算成每 100 克，份量一起带回去', () => {
  const r = parseNutritionLabel('营养成分表\n项目 每份(30克) NRV%\n能量 471千焦 6%\n蛋白质 2.0克 3%\n脂肪 5.6克 9%\n碳水化合物 16.5克 6%\n钠 126毫克 6%');
  assert.equal(r.source, 'serving');
  assert.deepEqual(r.serving, { size: 30, unit: 'g' });
  assert.equal(r.values.energy, 375.2);
  assert.equal(r.values.protein, 6.7);
  assert.equal(r.values.sodium, 420);
  assert.equal(r.energyLabel, null, '换算过的就不能再说「标签上印的是这个数」');
  assert.match(describeLabelResult(r).detail, /每份 30克，已换算成每 100 克/);
});

test('饮料按每 100 毫升', () => {
  const r = parseNutritionLabel('项目 每100毫升 NRV%\n能量 180千焦 2%\n蛋白质 0克 0%\n脂肪 0克 0%\n碳水化合物 10.6克 4%\n钠 12毫克 1%');
  assert.equal(r.basis, '100ml');
  assert.equal(r.values.protein, 0, '标签上写 0 就是 0，不是没认出来');
  assert.equal(r.values.carb, 10.6);
  assert.ok(r.keys.includes('protein'));
});

test('饱和脂肪、反式脂肪那几行不能顶掉总脂肪', () => {
  const r = parseNutritionLabel('每100克\n脂肪 18.5克\n—饱和脂肪 8.0克\n—反式脂肪 0克\n碳水化合物 50克');
  assert.equal(r.values.fat, 18.5);
});

test('美式 Nutrition Facts：按份量换算，Total Carbohydrate 标成含纤维的总碳水', () => {
  const r = parseNutritionLabel(`Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g`);
  assert.equal(r.source, 'serving');
  assert.deepEqual(r.serving, { size: 55, unit: 'g' });
  assert.equal(r.values.energy, 418.2, 'Calories 就是 kcal，不去猜');
  assert.equal(r.values.fat, 14.5);
  assert.equal(r.values.sugar, 21.8, '添加糖那一行不能顶掉总糖');
  assert.equal(r.values.sodium, 290.9);
  assert.equal(r.carbBasis, 'total');
  assert.deepEqual(r.guessed, []);
});

test('欧盟标签只印食盐：换算成钠，并标成待核对', () => {
  const r = parseNutritionLabel('Nutrition per 100g\nEnergy 1046kJ/250kcal\nFat 10g\nof which saturates 2g\nCarbohydrate 30g\nof which sugars 5g\nFibre 3g\nProtein 8g\nSalt 1.2g');
  assert.equal(r.values.energy, 250, '同一行 kJ 和 kcal 都有时取 kcal');
  assert.deepEqual(r.energyLabel, { value: 250, unit: 'kcal' });
  assert.equal(r.values.sodium, 480);
  assert.equal(r.values.sugar, 5);
  assert.ok(r.guessed.includes('sodium'));
});

test('能量单位没认出来：拿三大营养素反推是 kJ 还是 kcal', () => {
  const kj = parseNutritionLabel('每100克\n能量 1569\n蛋白质 6.8克\n脂肪 18.5克\n碳水化合物 55.2克');
  assert.equal(kj.values.energy, 375);
  assert.ok(kj.guessed.includes('energy'), '推断出来的单位要让人核对');
  const kcal = parseNutritionLabel('每100克\n能量 410\n蛋白质 6.8克\n脂肪 18.5克\n碳水化合物 55.2克');
  assert.equal(kcal.values.energy, 410);
});

test('能量和三大营养素对不上时提醒核对（多半有一个数认错了）', () => {
  const r = parseNutritionLabel('每100克\n能量 100千卡\n脂肪 20克\n蛋白质 5克\n碳水化合物 10克');
  assert.ok(r.warnings.includes('energy-mismatch'));
  assert.match(describeLabelResult(r).detail, /对不上/);
});

test('没写每 100 克还是每份：按每 100 克填，并且说出来', () => {
  const r = parseNutritionLabel('能量 1569千焦\n蛋白质 6.8克');
  assert.equal(r.source, 'assumed');
  assert.ok(r.warnings.includes('basis-assumed'));
});

test('什么都没认出来：不填、给出重拍的办法', () => {
  const r = parseNutritionLabel('配料：小麦粉、白砂糖、植物油\n保质期 12个月');
  assert.deepEqual(r.keys, []);
  const d = describeLabelResult(r);
  assert.equal(d.ok, false);
  assert.match(d.detail, /占满画面/);
});

test('描述里点名没认出来的几项', () => {
  const r = parseNutritionLabel('每100克\n能量 1569千焦\n蛋白质 6.8克\n脂肪 18.5克\n碳水化合物 55.2克');
  const d = describeLabelResult(r);
  assert.equal(d.title, '已填入 4 项，请对照包装核对');
  assert.match(d.detail, /膳食纤维、糖、钠没认出来/);
});

/*
 * 一张带框线的营养成分表（像拍出来的：灰底、倾斜约 1°）在 tesseract 稀疏文本模式下的
 * **逐词原样输出**：文字@x0,y0-x1,y1(置信度)。框线让「钠」整个丢了，「千焦」成了
 * 「于 焦」、NRV 31% 成了「忆 生 放」，词框还互相重叠（1569 的框伸到了单位上）。
 */
const BOXED_WORDS = `营养@663,177-910,229(81)  成@788,173-840,247(94)  分@839,173-877,247(93)  表@876,173-914,247(92)  项@304,287-380,325(93)  目@355,283-382,342(86)  每@755,277-817,316(96)  100@816,270-870,325(92)  克@878,274-913,313(82)  NRV%@1107,273-1209,304(83)  能@307,369-388,408(93)  量@362,365-392,424(92)  1569@759,357-938,398(92)  于@863,353-906,409(80)  焦@905,353-941,409(42)  19%@1109,357-1184,388(90)  和@309,453-329,493(63)  蛋白质@328,451-432,493(75)  6.8@759,443-861,482(91)  克@825,439-863,493(34)  11%@1111,441-1186,472(77)  18.5@762,526-888,566(92)  克@852,522-890,576(65)  忆@1111,526-1133,556(0)  生@1140,526-1158,555(0)  放@1165,525-1188,555(0)  脂肪@311,537-391,577(96)  7.2@763,611-864,650(92)  克@829,607-867,661(63)  一@311,621-381,659(96)  饱和@396,619-451,659(94)  脂肪@458,619-519,658(94)  18%@1116,693-1191,724(91)  碳水@313,703-520,744(93)  化@417,699-457,761(93)  合@456,699-495,761(93)  物@495,699-523,761(91)  55.2@765,694-892,734(91)  克@857,690-896,745(74)  一@314,788-396,828(92)  糖@374,784-398,845(0)  12.0@767,778-893,818(92)  克@857,774-895,828(80)  膳食@317,872-416,913(21)  纤维@415,870-483,911(93)  2.1@768,863-870,902(92)  克@835,856-873,916(87)  8%@1117,862-1169,892(89)  420@769,945-926,986(91)  毫@857,941-897,998(0)  克@896,941-929,998(74)  21%@1120,945-1196,976(85)`.trim().split(/\s{2,}/).map((t) => {
  const m = t.match(/^(.*)@(\d+),(\d+)-(\d+),(\d+)\((\d+)\)$/);
  return { text: m[1], bbox: { x0: +m[2], y0: +m[3], x1: +m[4], y1: +m[5] } };
});

test('带框线的表格：按词框拼回行，七项全拿到', () => {
  const lines = linesFromWords(BOXED_WORDS);
  assert.ok(lines.includes('能 量 1569 于 焦 19%'), '重叠的词框也要拼在同一行');
  assert.ok(lines.includes('碳水 化 合 物 55.2 克 18%'));
  const r = parseNutritionLabel(lines.join('\n'));
  assert.deepEqual(r.values, {
    energy: 375, protein: 6.8, fat: 18.5, carb: 55.2, fiber: 2.1, sugar: 12, sodium: 420,
  });
  assert.deepEqual(r.guessed, ['sodium'], '「钠」字丢了、只剩毫克数的那一行是推断的，要核对');
});

test('照片拍歪了：沿着行一个词一个词地接，不按全局 y 一刀切', () => {
  // 歪 4°：名称到数值隔 250 像素、数值到 NRV 隔 450 像素，后者差出 31 像素 —— 比半个字高（22）大
  const tilt = Math.tan((4 * Math.PI) / 180);
  const word = (text, x, row) => {
    const y = 100 + row * 80 + x * tilt;
    return { text, bbox: { x0: x, y0: y - 20, x1: x + 60, y1: y + 20 } };
  };
  const lines = linesFromWords([
    word('能量', 50, 0), word('1569千焦', 300, 0), word('19%', 750, 0),
    word('蛋白质', 50, 1), word('6.8克', 300, 1), word('11%', 750, 1),
  ]);
  assert.deepEqual(lines, ['能量 1569千焦 19%', '蛋白质 6.8克 11%']);
});

test('钙、维生素这些毫克行不会被当成钠', () => {
  const r = parseNutritionLabel('每100克\n能量 1569千焦\n钙 120毫克 15%\n维生素C 30毫克');
  assert.equal(r.values.sodium, null);
});

test('歪 6°、行距约两个字高（真实包装上的疏密）也不串行', () => {
  // 8° 再加上很紧的行距本身就有歧义：两列之间的漂移接近行距，分不出是同一行还是下一行
  const tilt = Math.tan((6 * Math.PI) / 180);
  const word = (text, x, row) => {
    const y = 100 + row * 80 + x * tilt;
    return { text, bbox: { x0: x, y0: y - 18, x1: x + 70, y1: y + 18 } };
  };
  const lines = linesFromWords([
    word('能量', 40, 0), word('1569千焦', 320, 0), word('19%', 700, 0),
    word('蛋白质', 40, 1), word('6.8克', 320, 1), word('11%', 700, 1),
    word('钠', 40, 2), word('420毫克', 320, 2), word('21%', 700, 2),
  ]);
  assert.deepEqual(lines, ['能量 1569千焦 19%', '蛋白质 6.8克 11%', '钠 420毫克 21%']);
});
