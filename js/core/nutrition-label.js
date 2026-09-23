/**
 * 营养成分表的文字 → 自定义食物表单要的那几项。
 *
 * 输入是 OCR 认出来的原始文字，**不是干净的表格**。照着真机和 tesseract 实测的噪声写：
 *
 *  - 汉字之间常被插进空格（「营养 成 分 表」）；
 *  - 单位认错：「千焦」→「王焦 / 干焦 / 于焦」，「毫克」→「亳克」，「—糖」→「一炉」；
 *  - 行首多出一个字（「和蛋白质」）；NRV% 那一列多一位（「19%」→「199%」）。
 *
 * 所以按行找关键字、取关键字**后面第一个不带 % 的数**，单位认不出时再推断。
 * 推断出来的（能量单位、那一行「—糖」）要告诉界面，让人重点核对 ——
 * 自动填写省的是打字，不能替人把关；把认错的数悄悄存进食物库，比不填更糟。
 *
 * 纯函数，没有 DOM：OCR 本身在 lib/label-ocr.js，只把文字交到这里。
 */

export const KJ_PER_KCAL = 4.184;

/* 钠 = 食盐 ÷ 2.5（欧盟标签只印 salt，EU 1169/2011 附录 I 的换算）。 */
const SALT_TO_SODIUM_MG = 1000 / 2.5;

const KEYS = ['energy', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium'];

export const LABEL_FIELD_NAMES = {
  energy: '能量', protein: '蛋白质', fat: '脂肪', carb: '碳水', fiber: '膳食纤维', sugar: '糖', sodium: '钠',
};

/*
 * 哪一行是哪一项。顺序有讲究：先认「饱和脂肪 / 反式脂肪」这些**不要的**，
 * 再认纤维和糖（它们常以「—」开头挂在碳水下面），最后才是泛泛的「脂肪」「碳水」。
 */
const SKIP_LINE = /饱和|反式|胆固醇|saturat|trans\b|monounsat|polyunsat|cholesterol|糖醇|polyol|sugar alcohol|added sugars?|添加糖/i;
/* 同样按毫克印、但不是钠的那些行：下面「没名字的毫克行推断为钠」要先把它们排除掉 */
const OTHER_NUTRIENT = /钙|铁|锌|钾|镁|磷|硒|碘|维生素|vitamin|calcium|iron|potassium|zinc|magnesium|phosph/i;
const MATCHERS = [
  ['sodium', /钠|sodium|natrium/i],
  ['salt', /食盐|盐分|(?:^|[^a-z])salt/i],
  ['fiber', /膳食纤维|纤维|fib(?:re|er)/i],
  ['sugar', /(?<![乳])糖(?!醇)|sugars?\b/i],
  ['carb', /碳水化合物|碳水|carbohydrates?|carbs?\b/i],
  ['protein', /蛋白质|蛋白|protein/i],
  ['fat', /脂肪|(?:total\s+)?fat\b/i],
  ['energy', /能量|热量|卡路里|energy|calories|energie/i],
];

/* OCR 常见的单位误认，全部在 NFKC 之后做 */
const UNIT_FIXES = [
  [/[王干于](?=焦)/g, '千'],
  [/千\s*集/g, '千焦'],
  [/[亳毫臺豪]\s*克/g, '毫克'],
  [/\bk\s*[J|l\]]\b/gi, 'kJ'],
  [/\bk\s*ca[l1I|]\b/gi, 'kcal'],
  [/\brng\b/gi, 'mg'],
];

/**
 * NFKC（全角数字、％、括号）+ 去掉汉字之间的空格 + 常见误认修正 + 数字里的 O/l。
 * 导出是为了测试，界面不直接用。
 */
export function normalizeLabelText(text) {
  let out = String(text || '').normalize('NFKC');
  out = out.replace(/([㐀-鿿])[ \t]+(?=[㐀-鿿])/g, '$1');
  for (const [re, to] of UNIT_FIXES) out = out.replace(re, to);
  // 夹在数字中间的 O / o / l / I 几乎一定是 0 / 1
  out = out.replace(/(?<=\d)[Oo](?![A-Za-z])|(?<=[\d.])[Oo](?=\d)/g, '0');
  out = out.replace(/(?<=\d)[lI|](?=[\d.])|(?<=[\d.])[lI|](?=\d)/g, '1');
  // 「6。8」「6，8克」这种小数点被认成中文标点的，只在两边都是数字时才改
  out = out.replace(/(?<=\d)[。，,](?=\d{1,2}\s*(?:克|g|毫克|mg|千焦|kJ|千卡|kcal))/g, '.');
  return out;
}

/**
 * 把 OCR 的一个个词按坐标拼回表格的行。
 *
 * 真实包装上的营养成分表都带框线，而 tesseract 的版面分析一见框线就把
 * 中间那列当成唯一的文本块 —— 实测「能量 / 蛋白质 / 脂肪…」那一整列直接丢了，
 * 三种分割模式都一样。换成「稀疏文本」模式能把每个片段都找回来（连置信度 0 的
 * 「糖」「毫」都在），但行的归属得自己拼。
 *
 * 做法是**从左往右串**：每个词接到「上一个词离它最近、竖直方向差不到半个字高」的那一行后面。
 * 沿着行一个词一个词地接，照片拍歪几度也不怕 —— 相邻两个词之间的倾斜漂移很小，
 * 而如果按全局 y 坐标一刀切，歪 2 度、隔 800 像素就差出半行。
 *
 * @param {{ text: string, bbox: { x0:number, y0:number, x1:number, y1:number } }[]} words
 * @returns {string[]} 从上到下的行，词之间一个空格
 */
export function linesFromWords(words) {
  const items = (words || [])
    .filter((w) => w && String(w.text || '').trim() && w.bbox)
    .map((w) => ({
      text: String(w.text).trim(),
      x0: w.bbox.x0, x1: w.bbox.x1,
      yc: (w.bbox.y0 + w.bbox.y1) / 2,
      h: Math.max(1, w.bbox.y1 - w.bbox.y0),
    }));
  if (!items.length) return [];
  const heights = items.map((w) => w.h).sort((a, b) => a - b);
  const medianH = heights[heights.length >> 1];
  const tolerance = medianH * 0.55;
  /*
   * 先把整张图扶正。每个词找它右边最近、竖直方向差不到一个字高的邻居，
   * 两者连线的斜率取中位数就是倾斜角 —— 表格一行里名称、数值、NRV 三列隔得很开，
   * 歪 4° 时隔 450 像素就差出 31 像素，比半个字高的容差大，光靠逐词往后接接不上。
   * 太近的一对（同一个词里的两个字）不算：几像素的高度差会被放大成离谱的斜率。
   */
  for (const w of items) w.xc = (w.x0 + w.x1) / 2;
  const slopes = [];
  for (const a of items) {
    let next = null;
    for (const b of items) {
      const dx = b.xc - a.xc;
      if (dx <= medianH || Math.abs(b.yc - a.yc) > medianH * 0.9) continue;
      if (!next || dx < next.dx) next = { dx, dy: b.yc - a.yc };
    }
    if (next) slopes.push(next.dy / next.dx);
  }
  slopes.sort((a, b) => a - b);
  const skew = slopes.length ? Math.max(-0.15, Math.min(0.15, slopes[slopes.length >> 1])) : 0;
  for (const w of items) w.yc -= skew * w.xc;
  items.sort((a, b) => a.x0 - b.x0);
  const rows = [];
  for (const w of items) {
    let best = null;
    for (const row of rows) {
      // 词框常常互相重叠（「1569」的框一直伸到「千焦」上），重叠不能当成「不是同一行」
      const last = row[row.length - 1];
      const dy = Math.abs(last.yc - w.yc);
      if (dy <= tolerance && (!best || dy < best.dy)) best = { row, dy };
    }
    if (best) best.row.push(w);
    else rows.push([w]);
  }
  return rows
    .map((row) => ({ y: row.reduce((s, w) => s + w.yc, 0) / row.length, text: row.map((w) => w.text).join(' ') }))
    .sort((a, b) => a.y - b.y)
    .map((r) => r.text);
}

const NUMBER_WITH_UNIT = /([<≤＜]?\s*)(\d+(?:\.\d+)?)\s*(千焦|kJ|千卡|kcal|大卡|卡路里|毫克|mg|微克|μg|ug|毫升|ml|克|g|%)?/gi;

function unitOf(raw) {
  const u = String(raw || '').toLowerCase();
  if (!u) return null;
  if (u === '千焦' || u === 'kj') return 'kj';
  if (u === '千卡' || u === 'kcal' || u === '大卡' || u === '卡路里') return 'kcal';
  if (u === '毫克' || u === 'mg') return 'mg';
  if (u === '微克' || u === 'μg' || u === 'ug') return 'ug';
  if (u === '毫升' || u === 'ml') return 'ml';
  if (u === '克' || u === 'g') return 'g';
  if (u === '%') return '%';
  return null;
}

/* 关键字后面的数，跳过 NRV% 那一列 */
function numbersAfter(line, index) {
  const tail = line.slice(index);
  const out = [];
  for (const m of tail.matchAll(NUMBER_WITH_UNIT)) {
    const unit = unitOf(m[3]);
    if (unit === '%') continue;
    // 「100克」出现在行里时多半是表头（「每100克」），不是这一项的值
    if (/每\s*$/.test(tail.slice(0, m.index))) continue;
    out.push({ value: Number(m[2]), unit });
  }
  return out;
}

function matchLine(line) {
  if (SKIP_LINE.test(line)) return null;
  for (const [key, re] of MATCHERS) {
    const m = re.exec(line);
    if (m) return { key, index: m.index + m[0].length };
  }
  return null;
}

/* 表头：每 100 克 / 每 100 毫升 / 每份 30 克 / Serving size 1 cup (228g) */
function detectBasis(text) {
  const per100ml = /(?:每|per)\s*100\s*(?:毫升|ml)/i.test(text);
  const per100g = /(?:每|per)\s*100\s*(?:克|g)(?![a-z])/i.test(text) || /每\s*100\s*克/.test(text);
  const servingMatch = text.match(/(?:每份|份量|每\s*份|serving\s*size|per\s*serving|portion)[^\n\d]{0,24}?(\d+(?:\.\d+)?)\s*(克|g|毫升|ml)(?![a-z])/i)
    || text.match(/serving\s*size[^\n(]*\((\d+(?:\.\d+)?)\s*(g|ml)\)/i);
  const serving = servingMatch ? { size: Number(servingMatch[1]), unit: unitOf(servingMatch[2]) === 'ml' ? 'ml' : 'g' } : null;
  if (per100ml) return { basis: '100ml', source: 'per100', serving };
  if (per100g) return { basis: '100g', source: 'per100', serving };
  if (serving && serving.size > 0 && serving.size <= 1000) {
    return { basis: serving.unit === 'ml' ? '100ml' : '100g', source: 'serving', serving };
  }
  return { basis: '100g', source: 'assumed', serving };
}

const round1 = (v) => Math.round(v * 10) / 10;

/* Atwater，和 test/foods.test.js 的自洽检查同一个式子（纤维按 2 kcal/g） */
function atwater(v) {
  if (v.protein == null && v.fat == null && v.carb == null) return null;
  const carb = v.carb ?? 0;
  const fiber = v.carb == null ? 0 : Math.min(v.fiber ?? 0, carb);
  return (v.protein ?? 0) * 4 + (v.fat ?? 0) * 9 + (carb - fiber) * 4 + fiber * 2;
}

/**
 * @returns {{
 *   values: Record<string, number|null>,   每 100 g/ml；energy 为 kcal
 *   energyLabel: { value:number, unit:'kj'|'kcal' } | null,  标签上印的原值（仅每 100 时给）
 *   basis: '100g'|'100ml', source: 'per100'|'serving'|'assumed',
 *   serving: { size:number, unit:'g'|'ml' } | null,
 *   carbBasis: 'total'|null,
 *   keys: string[], guessed: string[], warnings: string[]
 * }}
 */
export function parseNutritionLabel(rawText) {
  const text = normalizeLabelText(rawText);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const raw = {};
  const guessed = new Set();
  let energyFromCalories = false;
  let lastKey = null;
  let usCarb = false;

  for (const line of lines) {
    const hit = matchLine(line);
    if (!hit) {
      if (SKIP_LINE.test(line) || OTHER_NUTRIENT.test(line)) continue;
      /*
       * 「—糖」常被认成「一炉」「一精」：挂在碳水下面、以破折号开头、带克数、
       * 又认不出名字的那一行，几乎只可能是糖。推断出来的要让人核对。
       */
      if (/^[—\-一–~_]/.test(line) && lastKey === 'carb' && raw.sugar == null) {
        const nums = numbersAfter(line, 1).filter((n) => n.unit === 'g' || n.unit == null);
        if (nums.length) { raw.sugar = nums[0].value; guessed.add('sugar'); lastKey = 'sugar'; }
        continue;
      }
      /*
       * 名字整个没认出来、只剩「420 毫克 21%」的那一行：中文营养成分表的强制项里
       * 只有钠按毫克印（GB 28050 的「4+1」），钙铁锌维生素那些已经在上面排除了。
       * 实测带框线的表格上「钠」这个字常常整个丢掉，数和单位却都在。
       */
      if (raw.sodium == null) {
        const first = numbersAfter(line, 0)[0];
        if (first?.unit === 'mg') { raw.sodium = first.value; guessed.add('sodium'); lastKey = 'sodium'; }
      }
      continue;
    }
    let { key } = hit;
    const nums = numbersAfter(line, hit.index);
    if (!nums.length) continue;
    if (key === 'energy') {
      if (raw.energy != null) continue;
      const kcal = nums.find((n) => n.unit === 'kcal');
      const kj = nums.find((n) => n.unit === 'kj');
      if (kcal) { raw.energy = { value: kcal.value, unit: 'kcal' }; }
      else if (kj) { raw.energy = { value: kj.value, unit: 'kj' }; }
      else {
        raw.energy = { value: nums[0].value, unit: null };
        energyFromCalories = /calories/i.test(line);
      }
    } else if (key === 'salt') {
      if (raw.sodium != null) continue;
      const n = nums[0];
      const grams = n.unit === 'mg' ? n.value / 1000 : n.value;
      raw.sodium = grams * SALT_TO_SODIUM_MG;
      guessed.add('sodium');
      key = 'sodium';
    } else if (key === 'sodium') {
      if (raw.sodium != null) continue;
      const n = nums[0];
      // 单位认不出时按 mg；写着克、数又很小的，是按克印的
      raw.sodium = n.unit === 'g' && n.value < 20 ? n.value * 1000 : n.unit === 'ug' ? n.value / 1000 : n.value;
    } else {
      if (raw[key] != null) continue;
      const n = nums[0];
      raw[key] = n.unit === 'mg' ? n.value / 1000 : n.value;
      if (key === 'carb' && /total\s+carbohydrate/i.test(line)) usCarb = true;
    }
    lastKey = key;
  }

  const { basis, source, serving } = detectBasis(text);
  const warnings = [];

  // 能量单位：标签上写了就照写的；没写的拿三大营养素反推，Calories 一律是 kcal
  let energyKcal = null;
  let energyLabel = null;
  if (raw.energy) {
    let unit = raw.energy.unit;
    if (!unit) {
      if (energyFromCalories) unit = 'kcal';
      else {
        const est = atwater(raw);
        const v = raw.energy.value;
        if (est != null && est > 0) unit = Math.abs(v - est) <= Math.abs(v / KJ_PER_KCAL - est) ? 'kcal' : 'kj';
        else unit = source !== 'serving' && v > 900 ? 'kj' : 'kcal';
        guessed.add('energy');
      }
    }
    energyKcal = unit === 'kj' ? raw.energy.value / KJ_PER_KCAL : raw.energy.value;
    energyLabel = { value: raw.energy.value, unit };
  }

  const scale = source === 'serving' && serving?.size > 0 ? 100 / serving.size : 1;
  const values = {};
  for (const key of KEYS) {
    const v = key === 'energy' ? energyKcal : raw[key];
    values[key] = v == null || !Number.isFinite(v) ? null : round1(v * scale);
  }
  if (source === 'serving') energyLabel = null;

  const keys = KEYS.filter((k) => values[k] != null);
  if (keys.length) {
    const est = atwater(values);
    if (values.energy != null && est != null && est > 0) {
      const diff = Math.abs(values.energy - est);
      if (diff > 12 && diff / Math.max(values.energy, est) > 0.25) warnings.push('energy-mismatch');
    }
    if (values.sugar != null && values.carb != null && values.sugar > values.carb) warnings.push('sugar-over-carb');
    if (values.fiber != null && values.carb != null && values.fiber > values.carb && usCarb) warnings.push('fiber-over-carb');
    if (source === 'assumed') warnings.push('basis-assumed');
  }

  return {
    values,
    energyLabel,
    basis,
    source,
    serving,
    carbBasis: usCarb ? 'total' : null,
    keys,
    guessed: [...guessed].filter((k) => values[k] != null),
    warnings,
  };
}

const WARNING_TEXT = {
  'energy-mismatch': '能量和蛋白、脂肪、碳水对不上，可能有一个数认错了',
  'sugar-over-carb': '糖比碳水还多，至少有一个认错了',
  'fiber-over-carb': '膳食纤维比碳水还多，至少有一个认错了',
  'basis-assumed': '没认出是每 100 克还是每份，先按每 100 克填了',
};

/**
 * 给界面的一句话：认出了几项、按什么换算的、哪里要重点核对。
 * 放在 core 里是为了能测 —— 「该怎么说」也是判断。
 */
export function describeLabelResult(result) {
  if (!result || !result.keys.length) {
    return {
      ok: false,
      title: '没认出营养成分表',
      detail: '让表格占满画面、正对镜头、光线均匀后再拍一次，或者直接手动填写。',
    };
  }
  const unit = result.basis === '100ml' ? '毫升' : '克';
  const parts = [];
  if (result.source === 'serving' && result.serving) {
    parts.push(`标签按每份 ${result.serving.size}${result.serving.unit === 'ml' ? '毫升' : '克'}，已换算成每 100 ${unit}`);
  }
  const check = result.guessed.map((k) => LABEL_FIELD_NAMES[k]);
  if (check.length) parts.push(`${check.join('、')}是推断的，请重点核对`);
  for (const w of result.warnings) parts.push(WARNING_TEXT[w]);
  const missing = KEYS.filter((k) => result.values[k] == null).map((k) => LABEL_FIELD_NAMES[k]);
  if (missing.length && missing.length < KEYS.length) parts.push(`${missing.join('、')}没认出来，需要的话手动补上`);
  return {
    ok: true,
    title: `已填入 ${result.keys.length} 项，请对照包装核对`,
    detail: parts.length ? `${parts.join('；')}。` : '',
  };
}
