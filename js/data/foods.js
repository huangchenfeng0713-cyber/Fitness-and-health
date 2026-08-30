/**
 * 食物营养库（固体按每 100g 可食部，饮品按每 100ml）
 * 数据参考《中国食物成分表》标准版及常见品牌营养标签的通用值，用于估算而非临床用途。
 *
 * 字段：
 *   id       唯一标识
 *   name     中文名
 *   alias    搜索别名（拼音首字母 / 俗称）
 *   cat      分类
 *   n        按 basis 每 100g/100ml：[热量kcal, 蛋白g, 脂肪g, 碳水g, 膳食纤维g, 糖g, 钠mg]
 *   s        常用份量 [[名称, 克数], ...]
 *   sf       仅茶饮：点「无糖」时仍残留的总糖（每 100g）
 *   nfs      其中不属于 WHO 游离糖的部分（乳糖、完整果肉内源糖等，每 100g）
 *   source   可选数据来源 { type, ref, accessed? }；recipe 来源自动视为估算
 *   basis    营养数值基准：100g / 100ml / serving
 *   state    食物状态：raw / cooked / ready / dry
 *   edibleRatio 毛重中的可食比例（0~1）；份量已按可食部填写时为 1
 *   carbBasis 碳水口径：total 含纤维 / available 不含纤维
 *   note     估算边界；汤面、汤菜必须说明是否计入汤汁
 *   caffeineMg 可选，每 100ml 咖啡因 mg；用于含咖啡因饮料的醒目提示
 *   f        语义标记（无法从营养数字推导的部分）
 *            fried 油炸 / refined 精制 / processed 加工肉或深加工 / whole 全谷物
 *            quick 便利店随手可得 / breakfast 适合早餐 / late 适合睡前 / cook 需烹饪
 *            sweetdrink 含糖饮料 / alcohol 酒精 / natsugar 糖来自天然乳糖，不计入游离糖
 *            est 该品牌未公开完整营养表，数值按同类食品推算
 *            tealevel 可选糖度（营养按全糖录入，由 nutrientsFor 按糖度换算）
 *            instant 方便面类（名字未必带「面」，靠标记识别）
 *            functional 功能/运动饮料 / caffeinated 含咖啡因
 */

export const CATEGORIES = {
  staple: '主食',
  meat: '肉禽',
  seafood: '水产',
  egg: '蛋类',
  dairy: '乳制品',
  soy: '豆制品',
  veg: '蔬菜',
  fruit: '水果',
  nut: '坚果种子',
  drink: '饮品',
  snack: '零食甜点',
  dish: '菜肴外卖',
  chain: '连锁快餐',
  other: '其他',
};

/** 新数据必须使用这些稳定枚举；旧条目可逐步补齐，不影响现有记录。 */
export const FOOD_META = Object.freeze({
  sourceTypes: Object.freeze(['cnfct', 'label', 'recipe', 'usda']),
  bases: Object.freeze(['100g', '100ml', 'serving']),
  states: Object.freeze(['raw', 'cooked', 'ready', 'dry']),
  carbBases: Object.freeze(['total', 'available']),
});

const SOURCE_RECIPE = Object.freeze({
  type: 'recipe',
  ref: '通用中式配方估算（原料成分与成品重量折算）',
});
const SOURCE_CNFCT = Object.freeze({
  type: 'cnfct',
  ref: '《中国食物成分表（第6版）》代表值',
});
const SOURCE_USDA = Object.freeze({
  type: 'usda',
  ref: 'USDA FoodData Central Foundation/SR Legacy representative value',
  accessed: '2026-08-23',
});
const SOURCE_MCDONALDS_CN = Object.freeze({
  type: 'label',
  ref: '麦当劳中国官网营养计算器（各单品，营养数据更新于 2025-04）',
  accessed: '2026-08-23',
});
const SOURCE_RED_BULL = Object.freeze({
  type: 'label',
  ref: 'Red Bull 官方产品问答（250ml 原味含糖 27g、咖啡因 80mg；无糖版不含糖）',
  accessed: '2026-08-24',
});
const SOURCE_GATORADE = Object.freeze({
  type: 'label',
  ref: 'Gatorade 官方产品与 FAQ（Thirst Quencher / Zero / Fit / Fast Twitch）',
  accessed: '2026-08-24',
});
const SOURCE_MONSTER = Object.freeze({
  type: 'label',
  ref: 'Monster Energy 官方产品页（Original Green / Ultra Zero Sugar）',
  accessed: '2026-08-24',
});
const SOURCE_POWERADE = Object.freeze({
  type: 'label',
  ref: 'Coca-Cola POWERADE 官方产品营养表代表口味',
  accessed: '2026-08-24',
});
const SOURCE_NONGFU_C100 = Object.freeze({
  type: 'label',
  ref: '农夫山泉水溶C100官方产品页及柠檬味445ml瓶身营养成分表（710kJ、碳水42g、钠128mg）',
  accessed: '2026-08-30',
});
const SOURCE_AYP_BBQ = Object.freeze({
  type: 'recipe',
  ref: '安又胖（原安三胖）官网产品页、正大广场门店页及携程合生汇菜单核对品名；营养按同类原料与常见腌料估算',
  accessed: '2026-08-26',
});
const SOURCE_MUWU_BBQ = Object.freeze({
  type: 'recipe',
  ref: '木屋烧烤官网及携程门店菜单核对品名；营养按同类烤串配方估算',
  accessed: '2026-08-26',
});
const SOURCE_XITA_BBQ = Object.freeze({
  type: 'recipe',
  ref: '西塔老太太泥炉烤肉携程门店菜单核对品名；营养按同类肉品与腌料估算',
  accessed: '2026-08-26',
});
const SOURCE_JIUTIAN_BBQ = Object.freeze({
  type: 'recipe',
  ref: '九田家黑牛烤肉多门店公开菜单核对品名；营养按同类肉品与配方估算',
  accessed: '2026-08-26',
});
const SOURCE_FENGMAO_BBQ = Object.freeze({
  type: 'recipe',
  ref: '丰茂烤串公开门店菜单核对品名；营养按同类烤串配方估算',
  accessed: '2026-08-26',
});
const SOURCE_FEIHA_BBQ = Object.freeze({
  type: 'recipe',
  ref: '破店肥哈东北烧烤携程门店菜单核对品名；营养按同类东北烧烤配方估算',
  accessed: '2026-08-26',
});
const SOURCE_NANPU = Object.freeze({
  type: 'recipe',
  // 这家没有公开营养表，品名也拿不到官方菜单，只能按该品类门店通行的菜品整理。
  // 写清楚是「整理」而不是「核对」——别把估算说成核对过的。
  ref: '南浦拌饭为韩式石锅拌饭连锁；品名按该品类门店通行菜单整理，营养按同类配方与常见份量估算',
  accessed: '2026-08-28',
});
const SOURCE_KFC_CN_EST = Object.freeze({
  type: 'recipe',
  ref: '肯德基中国官方产品宣传核对品名；中国食物成分表肯德基条目、FatSecret 品牌条目及公开称重拆解交叉核对营养',
  accessed: '2026-08-27',
});
const SOURCE_MINNAN = Object.freeze({
  type: 'recipe',
  ref: '央广网厦门地方名小吃资料与厦门旅游网闽南古早味资料核对品名和主要原料；营养按通用配方与常见成品重量估算',
  accessed: '2026-08-29',
});
const META_RECIPE_READY = Object.freeze({
  source: SOURCE_RECIPE, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const META_RECIPE_RAW = Object.freeze({
  source: SOURCE_RECIPE, basis: '100g', state: 'raw', edibleRatio: 1, carbBasis: 'total',
});
const META_RECIPE_COOKED = Object.freeze({
  source: SOURCE_RECIPE, basis: '100g', state: 'cooked', edibleRatio: 1, carbBasis: 'total',
});
const META_RECIPE_DRINK = Object.freeze({
  source: SOURCE_RECIPE, basis: '100ml', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const drinkLabelMeta = (source) => ({
  source, basis: '100ml', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const META_CNFCT_RAW = Object.freeze({
  source: SOURCE_CNFCT, basis: '100g', state: 'raw', edibleRatio: 1, carbBasis: 'total',
});
const META_CNFCT_COOKED = Object.freeze({
  source: SOURCE_CNFCT, basis: '100g', state: 'cooked', edibleRatio: 1, carbBasis: 'total',
});
const META_USDA_RAW = Object.freeze({
  source: SOURCE_USDA, basis: '100g', state: 'raw', edibleRatio: 1, carbBasis: 'total',
});
const META_USDA_COOKED = Object.freeze({
  source: SOURCE_USDA, basis: '100g', state: 'cooked', edibleRatio: 1, carbBasis: 'total',
});
const META_USDA_READY = Object.freeze({
  source: SOURCE_USDA, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const META_USDA_DRINK = Object.freeze({
  source: SOURCE_USDA, basis: '100ml', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const META_KFC_EST = Object.freeze({
  source: SOURCE_KFC_CN_EST, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const META_KFC_DRINK_EST = Object.freeze({
  source: SOURCE_KFC_CN_EST, basis: '100ml', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});
const META_MINNAN_READY = Object.freeze({
  source: SOURCE_MINNAN, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total',
});

function brandedBbqFood({
  id, name, alias, n, servingGrams, source, servingLabel = '一份可食部', note = '', flags = [],
  // 乳糖、完整果肉的内源糖不属于 WHO 游离糖。这个字段原先没往外传，
  // 写了也不生效 —— 而条目的说明里却写着「已单列」，等于界面在说假话。
  nfs = undefined,
}) {
  return {
    id, name, alias, cat: 'chain', n, s: [[servingLabel, servingGrams]],
    source, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total',
    ...(nfs === undefined ? {} : { nfs }),
    note: `${note ? `${note}；` : ''}品牌未公开完整营养表，按同类原料、常见腌料和烤制成品率估算；门店、批次及实际蘸料会有差异`,
    f: [...flags, 'est'],
  };
}

export const FOODS = [
  // ---------- 主食 ----------
  { id: 'rice_white', name: '米饭（白米）', alias: 'mifan rice 白饭 米飯', cat: 'staple', n: [116, 2.6, 0.3, 25.9, 0.3, 0, 2], s: [['小碗', 150], ['中碗', 200], ['大碗', 300]], f: ['refined'] },
  { id: 'rice_brown', name: '糙米饭', alias: 'caomi brown rice', cat: 'staple', n: [123, 2.8, 1.0, 25.6, 1.8, 0.4, 3], s: [['小碗', 150], ['中碗', 200]], f: ['whole'] },
  { id: 'congee', name: '白粥', alias: 'zhou porridge 稀饭 大米粥', cat: 'staple', n: [46, 1.1, 0.2, 9.9, 0.1, 0, 2], s: [['一碗', 300]], f: ['refined', 'breakfast'] },
  { id: 'oats', name: '燕麦片（干）', alias: 'yanmai oat', cat: 'staple', n: [377, 15.0, 6.7, 61.6, 10.1, 1.1, 3], s: [['一份', 40], ['一杯', 80]], f: ['whole', 'breakfast'] },
  { id: 'bread_white', name: '白吐司', alias: 'tusi bread', cat: 'staple', n: [280, 8.6, 3.5, 52.0, 2.2, 5.0, 460], s: [['一片', 35]], f: ['refined', 'quick', 'breakfast'] },
  { id: 'bread_whole', name: '全麦面包', alias: 'quanmai whole wheat', cat: 'staple', n: [246, 10.5, 3.4, 44.0, 6.0, 4.0, 420], s: [['一片', 40]], f: ['whole', 'quick', 'breakfast'] },
  { id: 'mantou', name: '馒头', alias: 'mantou steamed bun', cat: 'staple', n: [223, 7.0, 1.1, 47.0, 1.3, 2.0, 165], s: [['一个', 100]], f: ['refined', 'breakfast'] },
  { id: 'baozi_pork', name: '猪肉包子', alias: 'baozi 包子 肉包', cat: 'staple', n: [227, 8.5, 8.0, 30.0, 1.2, 3.0, 480], s: [['一个', 90]], f: ['breakfast'] },
  { id: 'noodle_cooked', name: '面条（煮熟）', alias: 'miantiao noodle 面 挂面 汤面', cat: 'staple', n: [110, 3.9, 0.5, 22.0, 1.0, 0.4, 180], s: [['一碗', 250]], f: ['refined'] },
  { id: 'instant_noodle', name: '方便面（含调料）', alias: 'fangbianmian instant noodle', cat: 'staple', n: [470, 9.5, 21.0, 60.0, 2.0, 4.0, 1800], s: [['一包', 100]], f: ['fried', 'refined', 'processed', 'quick', 'instant'] },
  { id: 'dumpling_pork', name: '猪肉水饺', alias: 'shuijiao dumpling 饺子 shuijiao', cat: 'staple', n: [230, 9.0, 8.5, 28.0, 1.4, 1.5, 480], s: [['一个', 20], ['一盘12个', 240]], f: [] },
  { id: 'sweet_potato', name: '红薯（蒸）', alias: 'hongshu sweet potato', cat: 'staple', n: [90, 1.6, 0.2, 20.7, 2.2, 6.5, 28], s: [['一个中等', 180]], f: ['whole', 'breakfast'] },
  { id: 'potato', name: '土豆（蒸）', alias: 'tudou potato 马铃薯 洋芋', cat: 'staple', n: [81, 2.0, 0.2, 17.8, 1.4, 0.9, 6], s: [['一个中等', 150]], f: ['whole'] },
  { id: 'corn', name: '玉米（煮）', alias: 'yumi corn', cat: 'staple', n: [112, 4.0, 1.2, 22.8, 2.9, 3.2, 15], s: [['一根', 200]], f: ['whole', 'breakfast'] },
  { id: 'youtiao', name: '油条', alias: 'youtiao fried dough', cat: 'staple', n: [388, 6.9, 17.6, 51.0, 0.9, 1.0, 585], s: [['一根', 60]], f: ['fried', 'refined', 'breakfast'] },
  { id: 'quinoa', name: '藜麦（熟）', alias: 'limai quinoa', cat: 'staple', n: [120, 4.4, 1.9, 21.3, 2.8, 0.9, 7], s: [['一份', 150]], f: ['whole'] },
  { id: 'rice_noodle', name: '米粉（煮熟）', alias: 'mifen rice noodle', cat: 'staple', n: [109, 2.0, 0.2, 24.9, 0.5, 0.1, 90], s: [['一碗', 250]], f: ['refined'] },
  { id: 'zongzi', name: '肉粽', alias: 'zongzi', cat: 'staple', n: [195, 5.5, 6.5, 29.0, 1.0, 2.0, 420], s: [['一个', 180]], f: ['natsugar'] },
  { id: 'shaobing', name: '烧饼', alias: 'shaobing', cat: 'staple', n: [326, 8.0, 12.0, 47.0, 1.6, 2.0, 520], s: [['一个', 80]], f: ['refined', 'breakfast'] },
  { id: 'buckwheat_noodle', name: '荞麦面（煮熟）', alias: 'qiaomai soba', cat: 'staple', n: [99, 5.1, 0.4, 20.0, 1.8, 0.5, 60], s: [['一碗', 250]], f: ['whole'] },

  // ---------- 肉禽 ----------
  { id: 'chicken_breast', name: '鸡胸肉（水煮）', alias: 'jixiong chicken breast', cat: 'meat', n: [133, 29.5, 1.9, 0, 0, 0, 62], s: [['一块', 150], ['一份', 100]], f: ['cook'] },
  { id: 'chicken_thigh', name: '鸡腿肉（去皮）', alias: 'jitui chicken thigh', cat: 'meat', n: [181, 24.0, 9.2, 0, 0, 0, 88], s: [['一只去骨可食部', 120]], f: ['cook'] },
  { id: 'chicken_wing', name: '鸡翅（烤）', alias: 'jichi chicken wing', cat: 'meat', n: [266, 22.0, 19.5, 1.0, 0, 0.5, 420], s: [['一只可食部', 25]], edibleRatio: 0.55, note: '营养按去骨可食部计；若称带骨整只，先按约 55% 折算可食重量', f: [] },
  { id: 'fried_chicken', name: '炸鸡（带皮）', alias: 'zhaji fried chicken', cat: 'meat', n: [298, 20.0, 20.5, 9.5, 0.4, 0.5, 700], s: [['一块', 100]], f: ['fried', 'processed'] },
  { id: 'pork_lean', name: '猪瘦肉', alias: 'zhushourou lean pork', cat: 'meat', n: [143, 20.3, 6.2, 1.5, 0, 0, 57], s: [['一份', 100]], f: ['cook'] },
  { id: 'pork_belly', name: '五花肉', alias: 'wuhuarou pork belly', cat: 'meat', n: [518, 9.0, 53.0, 2.4, 0, 0, 60], s: [['一份', 100]], f: [] },
  { id: 'beef_lean', name: '瘦牛肉（生）', alias: 'niurou lean beef 牛肉 瘦牛肉 牛腱', cat: 'meat', n: [160, 21.5, 7.5, 1.2, 0, 0, 62], s: [['一份可食部', 100]], note: '通用瘦牛肉代表值；牛腱可作近似搜索，但不同部位脂肪含量会有差异', f: ['cook'] },
  { id: 'beef_steak', name: '西冷牛排（煎/烤）', alias: 'niupai steak sirloin striploin xileng 西冷 纽约客', cat: 'meat', n: [212, 24.0, 12.8, 0, 0, 0, 70], s: [['一块可食部', 200]], ...META_USDA_COOKED, note: '按煎烤熟牛排可食部计，不含额外黄油、酱汁和配菜；不同修脂程度会改变脂肪含量', f: [] },
  { id: 'beef_tenderloin_steak', name: '菲力牛排（煎/烤）', alias: 'feili niupai tenderloin filet mignon 牛柳', cat: 'meat', n: [218, 28.5, 11.0, 0, 0, 0, 55], s: [['一块可食部', 180]], ...META_USDA_COOKED, note: '按煎烤熟里脊可食部计，不含额外黄油、酱汁和配菜', f: [] },
  { id: 'beef_ribeye_steak', name: '肉眼牛排（煎/烤）', alias: 'rouyan niupai ribeye steak 肋眼', cat: 'meat', n: [291, 24.9, 21.8, 0, 0, 0, 60], s: [['一块可食部', 220]], ...META_USDA_COOKED, note: '按煎烤熟肋眼可食部计，不含额外黄油、酱汁和配菜；大理石脂肪差异较大', f: [] },
  { id: 'beef_tbone_steak', name: 'T骨牛排（煎/烤）', alias: 'T gu niupai t-bone porterhouse steak 红屋', cat: 'meat', n: [247, 25.5, 15.7, 0, 0, 0, 58], s: [['一块去骨可食部', 250]], ...META_USDA_COOKED, note: '营养按去骨熟可食部计；若按整块带骨称重，应先扣除骨头，不含黄油与酱汁', f: [] },
  { id: 'beef_flat_iron_steak', name: '板腱牛排（煎/烤）', alias: 'banjian niupai flat iron oyster blade steak', cat: 'meat', n: [225, 27.0, 12.5, 0, 0, 0, 60], s: [['一块可食部', 200]], ...META_USDA_COOKED, note: '按煎烤熟板腱可食部计，不含额外黄油、酱汁和配菜', f: [] },
  { id: 'beef_short_rib_steak', name: '牛小排（煎/烤）', alias: 'niuxiaopai short rib steak boneless', cat: 'meat', n: [310, 23.0, 24.0, 0, 0, 0, 65], s: [['一份可食部', 200]], ...META_USDA_COOKED, note: '按去骨煎烤熟可食部计；牛小排脂肪差异明显，不含额外酱汁', f: [] },
  { id: 'beef_tomahawk_steak', name: '战斧牛排（可食部）', alias: 'zhanfu niupai tomahawk steak', cat: 'meat', n: [291, 24.9, 21.8, 0, 0, 0, 60], s: [['一人份去骨可食部', 300]], ...META_USDA_COOKED, note: '战斧本质为带长骨肋眼；营养按去骨熟可食部计，不能把整块带骨重量直接作为食用量', f: [] },
  { id: 'steak_pan_fried_butter', name: '黄油煎牛排（通用）', alias: 'huangyou jian niupai butter steak homemade', cat: 'dish', n: [258, 25.0, 17.5, 1.0, 0, 0.5, 350], s: [['一份', 220]], ...META_RECIPE_READY, note: '按一块中等脂肪牛排、少量黄油和盐估算；实际用油、修脂与熟度会明显影响数值', f: ['est'] },
  { id: 'steak_black_pepper_restaurant', name: '黑椒牛排（餐厅，含酱）', alias: 'heijiao niupai black pepper steak restaurant', cat: 'dish', n: [228, 21.0, 14.0, 8.0, 0.5, 4.0, 720], s: [['一份牛排和酱', 250]], ...META_RECIPE_READY, note: '只计牛排和常见黑椒酱，不含意面、鸡蛋、薯条等配菜；酱量与腌制会显著影响钠和糖', f: ['est'] },
  { id: 'lamb', name: '羊肉（瘦）', alias: 'yangrou lamb', cat: 'meat', n: [203, 19.0, 14.1, 0, 0, 0, 69], s: [['一份', 100]], f: [] },
  { id: 'duck', name: '烤鸭（带皮）', alias: 'kaoya duck', cat: 'meat', n: [436, 16.6, 38.4, 6.0, 0, 1.0, 83], s: [['一份去骨可食部', 100]], f: [] },
  { id: 'sausage', name: '中式香肠 / 腊肠', alias: 'xiangchang lachang sausage', cat: 'meat', n: [508, 12.0, 48.0, 6.0, 0, 3.0, 1300], s: [['一根', 60]], f: ['processed', 'quick'] },
  { id: 'bacon', name: '培根', alias: 'peigen bacon', cat: 'meat', n: [381, 22.4, 30.6, 2.0, 0, 1.0, 1500], s: [['一片', 25]], f: ['processed'] },
  { id: 'ham_lean', name: '低脂火腿片', alias: 'huotui ham', cat: 'meat', n: [120, 18.0, 4.0, 2.5, 0, 1.5, 1000], s: [['一片', 25]], f: ['processed', 'quick'] },
  { id: 'chicken_liver', name: '鸡肝', alias: 'jigan liver', cat: 'meat', n: [121, 16.6, 4.8, 2.8, 0, 0, 92], s: [['一份', 80]], f: [] },

  // ---------- 水产 ----------
  { id: 'salmon', name: '三文鱼', alias: 'sanwenyu salmon', cat: 'seafood', n: [208, 20.4, 13.4, 0, 0, 0, 59], s: [['一块', 120]], f: [] },
  { id: 'basa', name: '巴沙鱼', alias: 'bashayu basa', cat: 'seafood', n: [90, 15.0, 3.0, 0, 0, 0, 100], s: [['一片', 150]], f: ['cook'] },
  { id: 'cod', name: '鳕鱼', alias: 'xueyu cod', cat: 'seafood', n: [88, 20.4, 0.5, 0, 0, 0, 130], s: [['一块', 120]], f: ['cook'] },
  { id: 'shrimp', name: '虾仁', alias: 'xiaren shrimp 虾 基围虾', cat: 'seafood', n: [93, 18.6, 0.8, 2.8, 0, 0, 165], s: [['一份', 100]], f: ['cook'] },
  { id: 'crucian', name: '鲫鱼', alias: 'jiyu crucian', cat: 'seafood', n: [108, 17.1, 2.7, 3.8, 0, 0, 41], s: [['一条', 200]], f: [] },
  { id: 'tuna_can', name: '金枪鱼罐头（水浸）', alias: 'jinqiangyu tuna', cat: 'seafood', n: [116, 25.5, 1.0, 0, 0, 0, 320], s: [['一罐', 80]], f: ['quick', 'processed'] },
  { id: 'squid', name: '鱿鱼', alias: 'youyu squid', cat: 'seafood', n: [84, 17.0, 1.4, 0, 0, 0, 110], s: [['一份', 100]], f: [] },
  { id: 'oyster', name: '生蚝', alias: 'shenghao oyster', cat: 'seafood', n: [73, 10.9, 2.5, 2.0, 0, 0, 462], s: [['一只', 30]], f: [] },
  { id: 'clam', name: '蛤蜊', alias: 'geli clam', cat: 'seafood', n: [62, 10.1, 1.1, 2.8, 0, 0, 425], s: [['一份', 100]], f: [] },

  // ---------- 蛋类 ----------
  { id: 'egg_whole', name: '鸡蛋（全蛋，煮）', alias: 'jidan egg 水煮蛋 白煮蛋', cat: 'egg', n: [147, 13.3, 8.8, 2.8, 0, 1.1, 132], s: [['一个', 55]], f: ['quick', 'breakfast'] },
  { id: 'egg_white', name: '蛋白（煮）', alias: 'danbai egg white', cat: 'egg', n: [52, 11.6, 0.1, 0.7, 0, 0.7, 166], s: [['一个', 33]], f: ['quick'] },
  { id: 'egg_fried', name: '煎蛋（油煎）', alias: 'jiandan fried egg', cat: 'egg', n: [216, 13.0, 17.0, 2.0, 0, 1.0, 210], s: [['一个', 60]], f: ['fried', 'breakfast'] },
  { id: 'tea_egg', name: '茶叶蛋', alias: 'chayedan tea egg', cat: 'egg', n: [152, 13.0, 9.5, 3.0, 0, 1.0, 620], s: [['一个', 55]], f: ['quick', 'breakfast'] },

  // ---------- 乳制品 ----------
  { id: 'milk_whole', name: '全脂牛奶', alias: 'niunai milk 牛奶 鲜奶', cat: 'dairy', n: [65, 3.3, 3.6, 4.9, 0, 4.9, 50], s: [['一盒', 250], ['一杯', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_skim', name: '脱脂牛奶', alias: 'tuozhi skim milk', cat: 'dairy', n: [35, 3.4, 0.2, 5.0, 0, 5.0, 52], s: [['一盒', 250]], f: ['quick', 'late', 'natsugar'] },
  { id: 'yogurt_plain', name: '无糖酸奶', alias: 'suannai yogurt 酸奶 无糖', cat: 'dairy', n: [61, 3.5, 3.2, 4.7, 0, 4.7, 45], s: [['一盒', 150]], f: ['quick', 'late', 'breakfast', 'natsugar'] },
  { id: 'yogurt_greek', name: '希腊酸奶（0脂）', alias: 'xila greek yogurt', cat: 'dairy', n: [59, 10.0, 0.4, 3.6, 0, 3.6, 36], s: [['一盒', 150]], f: ['quick', 'late', 'natsugar'] },
  { id: 'yogurt_sweet', name: '风味酸奶（含糖）', alias: 'fengwei suannai', cat: 'dairy', n: [92, 3.0, 2.7, 13.5, 0, 13.0, 60], s: [['一盒', 180]], nfs: 4.7, f: ['quick', 'est'] },
  { id: 'cheese', name: '原制奶酪', alias: 'nailao yuanzhinailao cheese', cat: 'dairy', n: [328, 25.7, 23.5, 3.5, 0, 2.0, 580], s: [['一片', 20]], f: ['quick', 'natsugar'] },
  { id: 'whey', name: '乳清蛋白粉', alias: 'ruqing whey protein', cat: 'dairy', n: [380, 78.0, 5.0, 8.0, 0, 3.0, 300], s: [['一勺', 30]], f: ['quick', 'natsugar'] },

  // ---------- 豆制品 ----------
  { id: 'tofu_firm', name: '北豆腐（老豆腐）', alias: 'doufu tofu', cat: 'soy', n: [116, 12.2, 4.8, 4.2, 0.5, 0.5, 8], s: [['一块', 150]], f: ['cook'] },
  { id: 'tofu_silken', name: '内酯豆腐', alias: 'neizhi tofu', cat: 'soy', n: [50, 5.0, 1.9, 3.3, 0.4, 0.4, 7], s: [['一盒', 250]], f: [] },
  { id: 'soymilk', name: '豆浆（无糖）', alias: 'doujiang soy milk', cat: 'soy', n: [31, 3.0, 1.6, 1.2, 0.4, 0.4, 3], s: [['一杯', 300]], f: ['breakfast', 'quick', 'natsugar'] },
  { id: 'dried_tofu', name: '豆腐干', alias: 'doufugan dried tofu', cat: 'soy', n: [140, 16.2, 3.6, 11.5, 0.8, 1.0, 330], s: [['一份', 80]], f: ['quick'] },
  { id: 'edamame', name: '毛豆', alias: 'maodou edamame', cat: 'soy', n: [131, 13.1, 5.0, 10.5, 4.0, 2.2, 4], s: [['一份', 100]], f: [] },
  { id: 'soybean', name: '黄豆（干）', alias: 'huangdou soybean', cat: 'soy', n: [390, 35.0, 16.0, 34.2, 15.5, 7.0, 2], s: [['一份', 30]], f: [] },
  { id: 'fuzhu', name: '腐竹（干）', alias: 'fuzhu', cat: 'soy', n: [459, 44.6, 21.7, 22.3, 2.0, 1.0, 27], s: [['一份', 30]], f: [] },

  // ---------- 蔬菜 ----------
  { id: 'broccoli', name: '西兰花', alias: 'xilanhua broccoli', cat: 'veg', n: [36, 4.1, 0.6, 4.3, 1.6, 1.5, 18], s: [['一份', 150]], f: ['cook'] },
  { id: 'spinach', name: '菠菜', alias: 'bocai spinach', cat: 'veg', n: [28, 2.6, 0.3, 4.5, 1.7, 0.4, 85], s: [['一份', 150]], f: ['cook'] },
  { id: 'cabbage', name: '大白菜', alias: 'baicai cabbage', cat: 'veg', n: [20, 1.5, 0.1, 3.2, 0.8, 1.2, 57], s: [['一份', 200]], f: ['cook'] },
  { id: 'lettuce', name: '生菜', alias: 'shengcai lettuce', cat: 'veg', n: [16, 1.3, 0.3, 2.0, 0.7, 0.9, 33], s: [['一份', 100]], f: [] },
  { id: 'cucumber', name: '黄瓜', alias: 'huanggua cucumber', cat: 'veg', n: [16, 0.8, 0.2, 2.9, 0.5, 1.7, 5], s: [['一根', 200]], f: ['quick'] },
  { id: 'tomato', name: '番茄', alias: 'fanqie tomato 西红柿', cat: 'veg', n: [20, 0.9, 0.2, 4.0, 0.5, 2.6, 5], s: [['一个', 150]], f: ['quick'] },
  { id: 'carrot', name: '胡萝卜', alias: 'huluobo carrot', cat: 'veg', n: [39, 1.0, 0.2, 8.8, 3.2, 4.7, 71], s: [['一根', 120]], f: [] },
  { id: 'mushroom', name: '香菇（鲜）', alias: 'xianggu mushroom', cat: 'veg', n: [26, 2.2, 0.3, 5.2, 3.3, 1.5, 2], s: [['一份', 100]], f: ['cook'] },
  { id: 'eggplant', name: '茄子', alias: 'qiezi eggplant', cat: 'veg', n: [23, 1.1, 0.2, 4.9, 1.3, 2.4, 6], s: [['一份', 150]], f: ['cook'] },
  { id: 'pepper_green', name: '青椒', alias: 'qingjiao pepper', cat: 'veg', n: [22, 1.4, 0.3, 4.0, 1.4, 2.1, 2], s: [['一份', 100]], f: [] },
  { id: 'celery', name: '芹菜', alias: 'qincai celery', cat: 'veg', n: [22, 1.2, 0.2, 4.5, 1.2, 1.4, 159], s: [['一份', 150]], f: [] },
  { id: 'bean_sprout', name: '绿豆芽', alias: 'douya sprout', cat: 'veg', n: [18, 2.1, 0.1, 2.9, 0.8, 0.6, 4], s: [['一份', 150]], f: [] },
  { id: 'seaweed', name: '海带（水发）', alias: 'haidai kelp', cat: 'veg', n: [14, 1.2, 0.1, 2.1, 0.5, 0.3, 107], s: [['一份', 150]], f: [] },
  { id: 'okra', name: '秋葵', alias: 'qiukui okra', cat: 'veg', n: [33, 2.0, 0.1, 7.5, 3.2, 1.5, 7], s: [['一份', 100]], f: [] },
  { id: 'pumpkin', name: '南瓜', alias: 'nangua pumpkin', cat: 'veg', n: [26, 0.7, 0.1, 5.3, 0.8, 2.8, 1], s: [['一份', 200]], f: [] },
  { id: 'kimchi', name: '韩式泡菜', alias: 'hanshipaocai kimchi', cat: 'veg', n: [30, 1.6, 0.4, 5.5, 2.0, 2.0, 1200], s: [['一份', 80]], f: ['processed'] },

  // ---------- 水果 ----------
  { id: 'apple', name: '苹果', alias: 'pingguo apple', cat: 'fruit', n: [53, 0.2, 0.2, 13.5, 1.2, 10.4, 1], s: [['一个', 200]], f: ['quick'] },
  { id: 'banana', name: '香蕉', alias: 'xiangjiao banana', cat: 'fruit', n: [93, 1.4, 0.2, 22.0, 1.2, 12.2, 1], s: [['一根', 120]], f: ['quick', 'breakfast'] },
  { id: 'orange', name: '橙子', alias: 'chengzi orange', cat: 'fruit', n: [48, 0.8, 0.2, 11.1, 0.6, 9.2, 1], s: [['一个', 200]], f: ['quick'] },
  { id: 'blueberry', name: '蓝莓', alias: 'lanmei blueberry', cat: 'fruit', n: [57, 0.7, 0.3, 14.5, 2.4, 10.0, 1], s: [['一盒', 125]], f: ['quick'] },
  { id: 'strawberry', name: '草莓', alias: 'caomei strawberry', cat: 'fruit', n: [32, 1.0, 0.2, 7.1, 1.1, 4.9, 4], s: [['一份', 150]], f: ['quick'] },
  { id: 'grape', name: '葡萄', alias: 'putao grape', cat: 'fruit', n: [69, 0.7, 0.2, 18.1, 0.9, 15.5, 2], s: [['一份', 150]], f: [] },
  { id: 'watermelon', name: '西瓜', alias: 'xigua watermelon', cat: 'fruit', n: [30, 0.6, 0.2, 7.6, 0.4, 6.2, 1], s: [['一块', 300]], f: [] },
  { id: 'mango', name: '芒果', alias: 'mangguo mango', cat: 'fruit', n: [60, 0.8, 0.4, 15.0, 1.6, 13.7, 1], s: [['一个', 200]], f: [] },
  { id: 'kiwi', name: '猕猴桃', alias: 'mihoutao kiwi', cat: 'fruit', n: [61, 1.1, 0.5, 14.7, 3.0, 9.0, 3], s: [['一个', 90]], f: ['quick'] },
  { id: 'avocado', name: '牛油果', alias: 'niuyouguo avocado', cat: 'fruit', n: [160, 2.0, 14.7, 8.5, 6.7, 0.7, 7], s: [['半个', 70]], f: [] },
  { id: 'pear', name: '梨', alias: 'li pear', cat: 'fruit', n: [51, 0.4, 0.2, 13.3, 3.1, 9.8, 2], s: [['一个', 250]], f: ['quick'] },
  { id: 'grapefruit', name: '西柚', alias: 'xiyou grapefruit', cat: 'fruit', n: [42, 0.8, 0.1, 10.7, 1.6, 7.0, 0], s: [['半个', 200]], f: [] },

  // ---------- 坚果种子 ----------
  { id: 'almond', name: '巴旦木 / 扁桃仁', alias: 'badanmu biantaoren almond', cat: 'nut', n: [579, 21.2, 49.9, 21.6, 12.5, 4.4, 1], s: [['一小把', 25]], f: ['quick'] },
  { id: 'walnut', name: '核桃仁', alias: 'hetao walnut', cat: 'nut', n: [654, 15.2, 65.2, 13.7, 6.7, 2.6, 2], s: [['一小把', 25]], f: ['quick'] },
  { id: 'peanut', name: '花生（炒）', alias: 'huasheng peanut', cat: 'nut', n: [589, 24.0, 48.0, 21.0, 8.0, 4.0, 445], s: [['一小把', 25]], f: [] },
  { id: 'cashew', name: '腰果', alias: 'yaoguo cashew', cat: 'nut', n: [559, 17.3, 36.7, 41.6, 3.6, 5.9, 251], s: [['一小把', 25]], f: ['quick'] },
  { id: 'chia', name: '奇亚籽', alias: 'qiyazi chia', cat: 'nut', n: [486, 16.5, 30.7, 42.1, 34.4, 0, 16], s: [['一勺', 15]], f: [] },
  { id: 'peanut_butter', name: '花生酱', alias: 'huashengjiang peanut butter', cat: 'nut', n: [588, 25.0, 50.0, 20.0, 6.0, 9.0, 430], s: [['一勺', 15]], f: [] },

  // ---------- 饮品 ----------
  { id: 'water', name: '白水', alias: 'shui water', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 0], s: [['一杯', 250]], f: ['quick', 'late'] },
  { id: 'black_coffee', name: '美式咖啡（无糖）', alias: 'kafei coffee 咖啡 美式 黑咖啡', cat: 'drink', n: [2, 0.2, 0, 0.3, 0, 0, 3], s: [['一杯', 350]], f: ['quick', 'caffeinated'] },
  { id: 'latte', name: '拿铁（全脂）', alias: 'natie latte', cat: 'drink', n: [55, 3.0, 3.0, 4.3, 0, 4.3, 45], s: [['中杯', 350]], f: ['quick', 'caffeinated', 'natsugar'] },
  { id: 'cola', name: '可乐', alias: 'kele cola', cat: 'drink', n: [43, 0, 0, 10.8, 0, 10.8, 12], s: [['一罐', 330]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'cola_zero', name: '无糖可乐', alias: 'wutang kele zero cola', cat: 'drink', n: [0.4, 0, 0, 0.1, 0, 0, 12], s: [['一罐', 330]], f: ['quick', 'caffeinated'] },
  { id: 'juice_orange', name: '橙汁（100%）', alias: 'chengzhi juice', cat: 'drink', n: [45, 0.7, 0.2, 10.4, 0.2, 8.8, 3], s: [['一杯', 250]], f: ['sweetdrink', 'quick'] },
  { id: 'sports_drink', name: '运动饮料', alias: 'yundong yinliao sports drink', cat: 'drink', n: [26, 0, 0, 6.4, 0, 6.0, 45], s: [['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'beer', name: '啤酒', alias: 'pijiu beer', cat: 'drink', n: [43, 0.4, 0, 3.6, 0, 0, 4], s: [['一罐', 330]], f: ['alcohol'] },
  { id: 'baijiu', name: '白酒（52度）', alias: 'baijiu liquor', cat: 'drink', n: [298, 0, 0, 0, 0, 0, 1], s: [['一两', 50]], f: ['alcohol'] },
  { id: 'green_tea', name: '茶（无糖）', alias: 'cha tea', cat: 'drink', n: [1, 0, 0, 0.2, 0, 0, 2], s: [['一杯', 250]], f: ['quick', 'caffeinated'] },

  // ---------- 零食甜点 ----------
  { id: 'potato_chips', name: '薯片', alias: 'shupian chips', cat: 'snack', n: [548, 6.0, 35.0, 52.0, 4.0, 2.5, 600], s: [['一小包', 50]], f: ['fried', 'processed', 'quick'] },
  { id: 'chocolate_milk', name: '牛奶巧克力', alias: 'qiaokeli chocolate', cat: 'snack', n: [546, 7.7, 31.3, 59.4, 3.4, 52.0, 79], s: [['一块', 25]], f: ['processed', 'quick', 'caffeinated'] },
  { id: 'chocolate_dark', name: '黑巧克力（85%）', alias: 'heiqiaokeli dark chocolate', cat: 'snack', n: [592, 10.0, 46.0, 30.0, 11.0, 14.0, 20], s: [['一块', 20]], f: ['quick', 'caffeinated'] },
  { id: 'biscuit', name: '饼干（甜）', alias: 'binggan biscuit', cat: 'snack', n: [480, 6.5, 20.0, 68.0, 1.5, 25.0, 350], s: [['一小包', 30]], f: ['refined', 'processed', 'quick'] },
  { id: 'cake', name: '奶油蛋糕', alias: 'dangao cake', cat: 'snack', n: [350, 4.5, 20.0, 38.0, 0.8, 27.0, 210], s: [['一块', 100]], f: ['refined', 'processed'] },
  { id: 'ice_cream', name: '冰淇淋', alias: 'bingqilin ice cream', cat: 'snack', n: [207, 3.5, 11.0, 24.0, 0.5, 21.0, 80], s: [['一个', 100]], f: ['processed', 'quick'] },
  { id: 'protein_bar', name: '蛋白棒', alias: 'danbaibang protein bar', cat: 'snack', n: [370, 30.0, 11.0, 36.0, 6.0, 8.0, 300], s: [['一根', 60]], f: ['quick', 'processed'] },
  { id: 'jerky', name: '牛肉干', alias: 'niurougan jerky', cat: 'snack', n: [313, 45.6, 12.0, 3.0, 0, 2.0, 1500], s: [['一小包', 40]], f: ['processed', 'quick'] },
  { id: 'egg_snack', name: '卤蛋（便利店）', alias: 'ludan', cat: 'snack', n: [150, 12.8, 9.8, 3.0, 0, 1.0, 700], s: [['一个', 55]], f: ['quick'] },
  { id: 'nut_mix', name: '每日坚果混合装', alias: 'meiri jianguo mixed nuts', cat: 'snack', n: [570, 17.0, 45.0, 25.0, 8.0, 8.0, 60], s: [['一小袋', 25]], f: ['quick'] },

  // ---------- 菜肴 / 外卖 ----------
  { id: 'gongbao', name: '宫保鸡丁', alias: 'gongbaojiding', cat: 'dish', n: [201, 12.5, 13.0, 8.5, 1.0, 4.0, 780], s: [['一份', 250]], f: [] },
  { id: 'yuxiang', name: '鱼香肉丝', alias: 'yuxiangrousi', cat: 'dish', n: [193, 9.5, 13.5, 9.0, 1.2, 5.0, 820], s: [['一份', 250]], f: [] },
  { id: 'braised_pork', name: '红烧肉', alias: 'hongshaorou', cat: 'dish', n: [430, 11.0, 40.0, 7.0, 0, 6.0, 700], s: [['一份', 150]], f: [] },
  { id: 'tomato_egg', name: '番茄炒蛋', alias: 'fanqiechaodan 西红柿炒蛋 西红柿', cat: 'dish', n: [128, 6.5, 9.0, 5.5, 0.6, 3.5, 520], s: [['一份', 250]], f: [] },
  { id: 'mapo_tofu', name: '麻婆豆腐', alias: 'mapodoufu', cat: 'dish', n: [151, 9.0, 11.0, 4.5, 0.8, 1.5, 850], s: [['一份', 250]], f: [] },
  { id: 'fried_rice', name: '蛋炒饭', alias: 'danchaofan fried rice', cat: 'dish', n: [186, 5.5, 7.5, 24.0, 0.6, 1.0, 620], s: [['一份', 350]], f: ['fried'] },
  { id: 'beef_noodle', name: '牛肉面', alias: 'niuroumian beef noodle 兰州拉面 兰州牛肉面 lanzhou lamian', cat: 'dish', n: [117, 6.5, 3.5, 15.0, 0.9, 1.0, 680], s: [['一碗', 600]], f: [] },
  { id: 'wonton', name: '馄饨（鲜肉）', alias: 'huntun wonton 小馄饨 云吞 抄手', cat: 'dish', n: [124, 6.0, 4.5, 15.0, 0.7, 1.0, 620], s: [['一碗', 350]], f: ['breakfast'] },
  { id: 'hotpot_clear', name: '清汤火锅（涮菜为主）', alias: 'huoguo hotpot 火锅 涮锅', cat: 'dish', n: [110, 9.0, 6.0, 5.0, 1.5, 1.0, 900], s: [['一份', 400]], f: [] },
  { id: 'malatang', name: '麻辣烫', alias: 'malatang', cat: 'dish', n: [145, 7.0, 9.5, 8.5, 1.5, 2.0, 1100], s: [['一份', 500]], f: [] },
  { id: 'burger', name: '汉堡（牛肉）', alias: 'hanbao burger', cat: 'dish', n: [270, 13.0, 13.0, 25.0, 1.2, 5.0, 520], s: [['一个', 200]], f: ['processed', 'quick'] },
  { id: 'french_fries', name: '薯条', alias: 'shutiao fries', cat: 'dish', n: [312, 3.5, 15.0, 41.0, 3.5, 0.5, 300], s: [['中份', 115]], f: ['fried', 'processed', 'quick'] },
  { id: 'pizza', name: '披萨（芝士）', alias: 'pisa pizza', cat: 'dish', n: [266, 11.0, 10.0, 33.0, 2.0, 3.5, 600], s: [['一块', 110]], f: ['processed'] },
  { id: 'sushi', name: '寿司卷', alias: 'shousi sushi', cat: 'dish', n: [150, 6.0, 2.5, 26.0, 0.8, 4.0, 400], s: [['一盒8个', 200]], f: ['quick'] },
  { id: 'salad_chicken', name: '鸡胸沙拉（轻食）', alias: 'shala salad 沙拉 轻食', cat: 'dish', n: [95, 10.5, 3.5, 5.5, 1.8, 2.0, 320], s: [['一份', 350]], f: ['quick'] },
  { id: 'sandwich_egg', name: '鸡蛋三明治', alias: 'sanmingzhi sandwich', cat: 'dish', n: [228, 10.0, 10.5, 23.0, 1.5, 4.0, 520], s: [['一个', 160]], f: ['quick', 'breakfast'] },
  { id: 'roast_chicken_leg', name: '烤鸡腿（便利店）', alias: 'kaojitui', cat: 'dish', n: [190, 22.0, 11.0, 1.0, 0, 0.5, 560], s: [['一只去骨可食部', 80]], edibleRatio: 0.67, note: '份量按去骨后可食部计；整只带骨称重需先折算', f: ['quick'] },
  { id: 'steamed_fish', name: '清蒸鱼', alias: 'qingzhengyu steamed fish', cat: 'dish', n: [122, 18.5, 4.5, 1.0, 0, 0.5, 480], s: [['一份', 200]], f: [] },
  { id: 'stir_veg', name: '清炒时蔬', alias: 'qingchaoshishu', cat: 'dish', n: [78, 2.0, 6.0, 4.5, 1.8, 1.5, 480], s: [['一份', 200]], f: [] },
  { id: 'cold_noodle', name: '凉面（麻酱辣油）', alias: 'liangmian cold noodle 麻酱凉面 辣油凉面', cat: 'dish', n: [168, 3.5, 5.5, 26.0, 0.8, 2.0, 700], s: [['一份', 300]], note: '按同时含少量芝麻酱和辣油的通用拌面估算，不代表两种独立配方', f: ['refined'] },

  // ---------- 主食（补充） ----------
  { id: 'noodle_dry', name: '挂面（干）', alias: 'guamian', cat: 'staple', n: [346, 11.4, 0.9, 71.5, 1.5, 1.0, 160], s: [['一把', 100]], f: ['refined'] },
  { id: 'rice_congee_meat', name: '皮蛋瘦肉粥', alias: 'pidanshouroukzhou', cat: 'staple', n: [72, 3.5, 2.2, 9.6, 0.3, 0.5, 350], s: [['一碗', 400]], f: ['breakfast'] },
  { id: 'flatbread', name: '手抓饼', alias: 'shouzhuabing', cat: 'staple', n: [326, 6.5, 18.0, 34.0, 1.0, 2.0, 500], s: [['一张', 90]], f: ['fried', 'refined', 'breakfast'] },
  { id: 'jianbing', name: '煎饼果子', alias: 'jianbingguozi 煎饼 山东煎饼', cat: 'staple', n: [232, 8.0, 10.5, 26.0, 1.2, 2.0, 620], s: [['一个', 220]], f: ['breakfast'] },
  { id: 'wotou', name: '窝头（玉米面）', alias: 'wotou', cat: 'staple', n: [227, 6.0, 1.6, 47.0, 3.5, 2.0, 5], s: [['一个', 80]], f: ['whole', 'breakfast', 'natsugar'] },
  { id: 'purple_potato', name: '紫薯（蒸）', alias: 'zishu', cat: 'staple', n: [106, 1.9, 0.3, 24.0, 2.5, 6.0, 20], s: [['一个', 150]], f: ['whole', 'breakfast'] },
  { id: 'yam', name: '山药（蒸）', alias: 'shanyao', cat: 'staple', n: [57, 1.9, 0.2, 12.4, 0.8, 1.0, 18], s: [['一段', 150]], f: ['whole'] },
  { id: 'taro', name: '芋头（蒸）', alias: 'yutou', cat: 'staple', n: [81, 2.2, 0.2, 18.1, 1.0, 0.8, 33], s: [['一个', 120]], f: ['whole'] },
  { id: 'millet_congee', name: '小米粥', alias: 'xiaomizhou', cat: 'staple', n: [46, 1.4, 0.3, 9.8, 0.4, 0.2, 3], s: [['一碗', 350]], f: ['whole', 'breakfast'] },
  { id: 'black_rice', name: '黑米饭', alias: 'heimifan', cat: 'staple', n: [128, 3.2, 1.0, 26.5, 1.6, 0.5, 3], s: [['小碗', 150], ['中碗', 200]], f: ['whole'] },
  { id: 'wonton_noodle', name: '云吞面', alias: 'yuntunmian', cat: 'staple', n: [128, 6.8, 3.8, 17.0, 0.9, 1.0, 640], s: [['一碗', 450]], f: [] },
  { id: 'chow_mein', name: '炒面', alias: 'chaomian', cat: 'staple', n: [196, 6.0, 8.5, 24.0, 1.2, 1.5, 700], s: [['一份', 350]], f: ['fried'] },
  { id: 'hot_dry_noodle', name: '热干面', alias: 'reganmian', cat: 'staple', n: [220, 7.5, 9.0, 28.0, 1.5, 1.5, 750], s: [['一碗', 300]], f: ['breakfast'] },
  { id: 'rice_roll', name: '肠粉', alias: 'changfen', cat: 'staple', n: [122, 4.0, 3.5, 19.0, 0.5, 1.5, 520], s: [['一份', 250]], f: ['breakfast'] },
  { id: 'siumai', name: '烧麦', alias: 'shaomai', cat: 'staple', n: [238, 8.0, 10.0, 28.0, 1.0, 1.0, 520], s: [['一个', 35]], f: ['breakfast'] },
  { id: 'baozi_veg', name: '素菜包', alias: 'sucaibao', cat: 'staple', n: [196, 6.0, 5.0, 32.0, 2.0, 3.0, 400], s: [['一个', 90]], f: ['breakfast'] },
  { id: 'egg_pancake', name: '鸡蛋灌饼', alias: 'jidanguanbing', cat: 'staple', n: [265, 9.0, 12.0, 30.0, 1.2, 2.0, 580], s: [['一个', 180]], f: ['breakfast'] },
  { id: 'toast_multigrain', name: '杂粮吐司', alias: 'zaliangtusi', cat: 'staple', n: [258, 9.5, 4.5, 44.0, 5.5, 4.0, 400], s: [['一片', 40]], f: ['whole', 'quick', 'breakfast'] },
  { id: 'bagel', name: '贝果', alias: 'beiguo bagel', cat: 'staple', n: [270, 10.0, 1.5, 53.0, 2.3, 5.0, 480], s: [['一个', 90]], f: ['quick', 'breakfast'] },
  { id: 'croissant', name: '可颂 / 牛角包', alias: 'kesong croissant', cat: 'staple', n: [406, 8.0, 21.0, 45.8, 2.6, 8.0, 420], s: [['一个', 60]], f: ['refined', 'quick', 'breakfast'] },
  { id: 'pasta', name: '意面（煮熟）', alias: 'yimian pasta', cat: 'staple', n: [131, 5.0, 1.1, 25.0, 1.8, 0.6, 5], s: [['一份', 250]], f: [] },
  { id: 'vermicelli', name: '粉丝（煮熟）', alias: 'fensi', cat: 'staple', n: [84, 0.2, 0.1, 20.8, 0.4, 0.1, 10], s: [['一份', 200]], f: ['refined'] },

  // ---------- 肉禽（补充） ----------
  { id: 'chicken_whole_leg', name: '琵琶腿（带皮）', alias: 'pipatui', cat: 'meat', n: [216, 19.0, 15.0, 0, 0, 0, 90], s: [['一只', 130]], f: [] },
  { id: 'chicken_breast_pan', name: '煎鸡胸', alias: 'jianjixiong', cat: 'meat', n: [180, 28.0, 7.0, 1.0, 0, 0.5, 320], s: [['一块', 150]], f: [] },
  { id: 'pork_rib', name: '排骨（可食部）', alias: 'paigu 排骨 猪排', cat: 'meat', n: [278, 16.0, 23.0, 0.7, 0, 0, 62], s: [['一份去骨可食部', 150]], note: '营养与份量均不含骨重', f: [] },
  { id: 'pork_minced', name: '猪肉馅（三分肥）', alias: 'zhurouxian', cat: 'meat', n: [260, 15.0, 22.0, 0.5, 0, 0, 60], s: [['一份', 100]], f: [] },
  { id: 'beef_minced', name: '牛肉馅', alias: 'niurouxian', cat: 'meat', n: [215, 19.0, 15.0, 0, 0, 0, 66], s: [['一份', 100]], f: [] },
  { id: 'beef_fatty', name: '肥牛卷', alias: 'feiniujuan', cat: 'meat', n: [285, 15.0, 25.0, 0.5, 0, 0, 70], s: [['一份', 150]], f: [] },
  { id: 'lamb_skewer', name: '羊肉串', alias: 'yangrouchuan', cat: 'meat', n: [280, 18.0, 22.0, 2.0, 0, 1.0, 480], s: [['一串', 25]], f: [] },
  { id: 'chicken_skewer', name: '烤鸡肉串', alias: 'kaojirouchuan', cat: 'meat', n: [195, 21.0, 11.0, 2.0, 0, 1.0, 450], s: [['一串', 30]], f: [] },
  { id: 'pork_liver', name: '猪肝', alias: 'zhugan', cat: 'meat', n: [129, 19.3, 3.5, 5.0, 0, 0, 68], s: [['一份', 80]], f: [] },
  { id: 'chicken_feet', name: '鸡爪', alias: 'jizhua', cat: 'meat', n: [254, 23.9, 16.4, 2.7, 0, 0, 169], s: [['一只', 40]], f: [] },
  { id: 'luncheon_meat', name: '午餐肉', alias: 'wucanrou', cat: 'meat', n: [229, 9.4, 15.9, 12.0, 0, 2.0, 980], s: [['一片', 30]], f: ['processed', 'quick'] },
  { id: 'meatball', name: '猪肉丸', alias: 'zhurouwan rouyuan meatball', cat: 'meat', n: [200, 12.0, 13.0, 9.0, 0, 1.5, 700], s: [['一个', 25]], f: ['processed'] },
  { id: 'turkey_breast', name: '火鸡胸肉', alias: 'huojixiong turkey', cat: 'meat', n: [111, 24.0, 1.0, 0, 0, 0, 60], s: [['一份', 100]], f: ['cook'] },

  // ---------- 水产（补充） ----------
  { id: 'yellow_croaker', name: '黄花鱼', alias: 'huanghuayu', cat: 'seafood', n: [99, 17.9, 3.0, 0.1, 0, 0, 121], s: [['一条', 200]], f: [] },
  { id: 'hairtail', name: '带鱼', alias: 'daiyu', cat: 'seafood', n: [127, 17.7, 4.9, 3.1, 0, 0, 150], s: [['一段', 120]], f: [] },
  { id: 'grass_carp', name: '草鱼', alias: 'caoyu', cat: 'seafood', n: [113, 16.6, 5.2, 0, 0, 0, 46], s: [['一份', 150]], f: [] },
  { id: 'sea_bass', name: '鲈鱼', alias: 'luyu', cat: 'seafood', n: [105, 18.6, 3.4, 0, 0, 0, 144], s: [['一条', 250]], f: [] },
  { id: 'crab', name: '螃蟹（可食部）', alias: 'pangxie', cat: 'seafood', n: [103, 17.5, 2.6, 2.3, 0, 0, 260], s: [['一只去壳可食部', 60]], edibleRatio: 0.4, note: '中等整蟹毛重约 150g 时，按约 40% 折为 60g 可食部；品种和肥满度会影响比例', f: [] },
  { id: 'scallop', name: '扇贝', alias: 'shanbei', cat: 'seafood', n: [60, 11.1, 0.6, 2.6, 0, 0, 339], s: [['一只', 25]], f: [] },
  { id: 'fish_ball', name: '鱼丸', alias: 'yuwan', cat: 'seafood', n: [110, 10.0, 3.0, 10.0, 0, 1.0, 600], s: [['一个', 20]], f: ['processed'] },
  { id: 'seaweed_sheet', name: '紫菜（干）', alias: 'zicai dried laver', cat: 'seafood', n: [250, 26.7, 1.1, 44.1, 21.6, 3.0, 710], s: [['一小把', 5]], f: [] },
  { id: 'dried_shrimp', name: '虾皮', alias: 'xiapi', cat: 'seafood', n: [153, 30.7, 2.2, 2.5, 0, 0, 5057], s: [['一勺', 5]], f: [] },

  // ---------- 蛋类（补充） ----------
  { id: 'quail_egg', name: '鹌鹑蛋（煮）', alias: 'anchundan', cat: 'egg', n: [160, 12.8, 11.1, 2.1, 0, 0.4, 106], s: [['一个', 10]], f: ['quick'] },
  { id: 'century_egg', name: '皮蛋', alias: 'pidan', cat: 'egg', n: [171, 14.2, 10.7, 4.5, 0, 0, 542], s: [['一个', 60]], f: ['quick'] },
  { id: 'salted_egg', name: '咸鸭蛋', alias: 'xianyadan', cat: 'egg', n: [190, 12.7, 12.7, 6.3, 0, 0, 2706], s: [['一个', 60]], f: ['quick'] },
  { id: 'steamed_egg', name: '蒸蛋羹', alias: 'zhengdangeng', cat: 'egg', n: [72, 6.5, 4.4, 1.6, 0, 0.6, 320], s: [['一碗', 200]], f: [] },

  // ---------- 乳制品（补充） ----------
  { id: 'milk_high_protein', name: '高蛋白牛奶', alias: 'gaodanbai niunai', cat: 'dairy', n: [56, 6.0, 1.6, 4.5, 0, 4.5, 60], s: [['一盒', 250]], f: ['quick', 'late', 'natsugar'] },
  { id: 'cheese_cottage', name: '茅屋芝士 / 白软干酪', alias: 'maowu cottage cheese', cat: 'dairy', n: [98, 11.1, 4.3, 3.4, 0, 2.7, 364], s: [['一份', 100]], f: ['quick', 'natsugar'] },
  { id: 'cream', name: '淡奶油', alias: 'danainai cream', cat: 'dairy', n: [345, 2.1, 36.1, 3.1, 0, 3.0, 30], s: [['一勺', 15]], f: ['natsugar'] },
  { id: 'butter', name: '黄油', alias: 'huangyou butter', cat: 'dairy', n: [717, 0.9, 81.1, 0.1, 0, 0.1, 11], s: [['一小块', 10]], f: [] },
  { id: 'condensed_milk', name: '炼乳', alias: 'lianru', cat: 'dairy', n: [321, 7.9, 8.7, 54.4, 0, 54.0, 127], s: [['一勺', 20]], f: [] , nfs: 12.0},
  { id: 'cheese_stick', name: '奶酪棒', alias: 'nailaobang', cat: 'dairy', n: [200, 6.5, 10.0, 21.0, 0, 15.0, 200], s: [['一根', 25]], f: ['quick', 'processed'] },

  // ---------- 豆制品（补充） ----------
  { id: 'soymilk_sweet', name: '豆浆（加糖）', alias: 'tiandoujiang', cat: 'soy', n: [55, 2.8, 1.5, 7.5, 0.4, 6.0, 5], s: [['一杯', 300]], f: ['breakfast', 'quick'] },
  { id: 'tofu_skin', name: '豆皮 / 千张', alias: 'doupi qianzhang', cat: 'soy', n: [201, 24.5, 11.5, 1.0, 1.0, 0.5, 20], s: [['一份', 80]], f: [] },
  { id: 'tofu_fried', name: '油豆腐 / 豆泡', alias: 'youdoufu', cat: 'soy', n: [244, 17.0, 17.6, 6.0, 0.6, 0.5, 12], s: [['一个', 15]], f: ['fried'] },
  { id: 'douhua', name: '豆腐脑（咸口）', alias: 'douhua doufunao xiandouhua 咸豆花', cat: 'soy', n: [47, 4.5, 1.9, 3.2, 0.3, 0.3, 380], s: [['一碗', 300]], note: '含咸卤或酱油的代表值；甜豆花请使用独立条目', f: ['breakfast'] },
  { id: 'natto', name: '纳豆', alias: 'nadou natto', cat: 'soy', n: [200, 18.0, 10.0, 12.0, 5.4, 4.0, 7], s: [['一盒', 50]], f: ['quick', 'natsugar'] },
  { id: 'mung_bean', name: '绿豆（干）', alias: 'lvdou', cat: 'soy', n: [329, 21.6, 0.8, 62.0, 6.4, 3.0, 3], s: [['一份', 40]], f: [] },
  { id: 'red_bean', name: '红豆（干）', alias: 'hongdou', cat: 'soy', n: [324, 20.2, 0.6, 63.4, 7.7, 3.0, 2], s: [['一份', 40]], f: [] },
  { id: 'chickpea', name: '鹰嘴豆（熟）', alias: 'yingzuidou chickpea', cat: 'soy', n: [164, 8.9, 2.6, 27.4, 7.6, 4.8, 7], s: [['一份', 100]], f: [] },

  // ---------- 蔬菜（补充） ----------
  { id: 'chinese_cabbage', name: '小白菜 / 青菜', alias: 'xiaobaicai qingcai', cat: 'veg', n: [15, 1.5, 0.3, 2.4, 1.1, 0.9, 74], s: [['一份', 200]], f: ['cook'] },
  { id: 'lettuce_stem', name: '莴笋', alias: 'wosun', cat: 'veg', n: [15, 1.0, 0.1, 2.8, 0.6, 1.0, 36], s: [['一份', 150]], f: ['cook'] },
  { id: 'cauliflower', name: '花菜', alias: 'huacai', cat: 'veg', n: [24, 2.1, 0.2, 4.6, 1.2, 1.9, 32], s: [['一份', 150]], f: ['cook'] },
  { id: 'green_bean', name: '四季豆', alias: 'sijidou', cat: 'veg', n: [31, 2.0, 0.4, 5.7, 1.5, 1.6, 9], s: [['一份', 150]], f: ['cook'] },
  { id: 'lotus_root', name: '莲藕', alias: 'lianou', cat: 'veg', n: [73, 1.9, 0.2, 16.4, 1.2, 1.5, 44], s: [['一份', 150]], f: [] },
  { id: 'bamboo_shoot', name: '竹笋', alias: 'zhusun', cat: 'veg', n: [23, 2.6, 0.2, 3.6, 1.8, 1.0, 0.4], s: [['一份', 150]], f: [] },
  { id: 'winter_melon', name: '冬瓜', alias: 'donggua', cat: 'veg', n: [12, 0.4, 0.2, 2.6, 0.7, 1.6, 2], s: [['一份', 200]], f: [] },
  { id: 'bitter_melon', name: '苦瓜', alias: 'kugua', cat: 'veg', n: [22, 1.0, 0.1, 4.9, 1.4, 1.0, 3], s: [['一份', 150]], f: [] },
  { id: 'chinese_chive', name: '韭菜', alias: 'jiucai', cat: 'veg', n: [26, 2.4, 0.4, 4.6, 1.4, 1.5, 8], s: [['一份', 100]], f: [] },
  { id: 'garlic_sprout', name: '蒜苗', alias: 'suanmiao', cat: 'veg', n: [37, 2.1, 0.4, 8.0, 1.8, 2.0, 5], s: [['一份', 100]], f: [] },
  { id: 'enoki', name: '金针菇', alias: 'jinzhengu', cat: 'veg', n: [32, 2.4, 0.4, 6.0, 2.7, 1.5, 4], s: [['一份', 100]], f: [] },
  { id: 'wood_ear', name: '木耳（水发）', alias: 'muer', cat: 'veg', n: [27, 1.5, 0.2, 6.0, 2.6, 0.5, 9], s: [['一份', 100]], f: [] },
  { id: 'oyster_mushroom', name: '平菇', alias: 'pinggu', cat: 'veg', n: [24, 1.9, 0.3, 4.6, 2.3, 1.0, 4], s: [['一份', 150]], f: [] },
  { id: 'asparagus', name: '芦笋', alias: 'lusun', cat: 'veg', n: [22, 2.2, 0.1, 4.1, 2.1, 1.9, 2], s: [['一份', 150]], f: [] },
  { id: 'zucchini', name: '西葫芦', alias: 'xihulu', cat: 'veg', n: [19, 0.8, 0.2, 3.8, 0.6, 1.7, 5], s: [['一份', 200]], f: [] },
  { id: 'radish', name: '白萝卜', alias: 'bailuobo', cat: 'veg', n: [23, 0.9, 0.1, 5.0, 1.0, 2.5, 62], s: [['一份', 200]], f: [] },
  { id: 'onion', name: '洋葱', alias: 'yangcong', cat: 'veg', n: [40, 1.1, 0.2, 9.0, 0.9, 4.2, 4], s: [['半个', 100]], f: [] },
  { id: 'sweet_corn_kernel', name: '甜玉米粒', alias: 'tianyumili', cat: 'veg', n: [86, 3.3, 1.2, 19.0, 2.0, 3.2, 15], s: [['一份', 100]], f: [] },
  { id: 'purple_cabbage', name: '紫甘蓝', alias: 'zigannlan', cat: 'veg', n: [31, 1.4, 0.2, 6.5, 2.1, 3.3, 27], s: [['一份', 100]], f: [] },
  { id: 'cherry_tomato', name: '圣女果', alias: 'shengnvguo', cat: 'veg', n: [22, 1.0, 0.2, 4.4, 1.2, 2.9, 5], s: [['一份', 150]], f: ['quick'] },

  // ---------- 水果（补充） ----------
  { id: 'peach', name: '桃子', alias: 'taozi', cat: 'fruit', n: [51, 0.9, 0.1, 12.2, 1.3, 8.7, 5], s: [['一个', 200]], f: ['quick'] },
  { id: 'plum', name: '李子', alias: 'lizi', cat: 'fruit', n: [38, 0.7, 0.2, 8.7, 0.9, 7.5, 4], s: [['一个', 80]], f: ['quick'] },
  { id: 'cherry', name: '樱桃', alias: 'yingtao', cat: 'fruit', n: [63, 1.1, 0.2, 15.0, 2.1, 12.8, 3], s: [['一份', 150]], f: ['quick'] },
  { id: 'pineapple', name: '菠萝', alias: 'boluo', cat: 'fruit', n: [50, 0.5, 0.1, 12.6, 1.4, 9.9, 1], s: [['一份', 200]], f: [] },
  { id: 'pomelo', name: '柚子', alias: 'youzi', cat: 'fruit', n: [42, 0.8, 0.2, 9.5, 0.4, 7.5, 3], s: [['一份', 200]], f: [] },
  { id: 'persimmon', name: '柿子', alias: 'shizi', cat: 'fruit', n: [71, 0.4, 0.1, 18.5, 1.4, 12.5, 1], s: [['一个', 150]], f: [] },
  { id: 'dragon_fruit', name: '火龙果', alias: 'huolongguo', cat: 'fruit', n: [55, 1.1, 0.2, 13.3, 1.6, 9.0, 2], s: [['半个', 200]], f: [] },
  { id: 'longan', name: '龙眼（鲜）', alias: 'longyan fresh longan 鲜桂圆', cat: 'fruit', n: [71, 1.2, 0.1, 16.6, 0.4, 15.0, 3], s: [['一份去皮去核可食部', 100]], f: [] },
  { id: 'lychee', name: '荔枝', alias: 'lizhi', cat: 'fruit', n: [70, 0.9, 0.2, 16.6, 0.5, 15.2, 2], s: [['一份', 100]], f: [] },
  { id: 'coconut_water', name: '椰子水', alias: 'yeziishui', cat: 'fruit', n: [19, 0.7, 0.2, 3.7, 1.1, 2.6, 105], s: [['一杯', 250]], f: ['quick'] },
  { id: 'raisin', name: '葡萄干', alias: 'putaogan', cat: 'fruit', n: [341, 3.1, 0.4, 83.4, 3.7, 59.0, 11], s: [['一小把', 25]], f: ['quick'] },
  { id: 'jujube_dry', name: '红枣（干）', alias: 'hongzao', cat: 'fruit', n: [276, 3.2, 0.5, 67.8, 6.2, 55.0, 6], s: [['一小把', 25]], f: ['quick'] },

  // ---------- 坚果（补充） ----------
  { id: 'pistachio', name: '开心果', alias: 'kaixinguo', cat: 'nut', n: [614, 20.6, 53.0, 21.9, 8.2, 7.7, 756], s: [['一小把', 25]], f: ['quick'] },
  { id: 'sunflower_seed', name: '瓜子', alias: 'guazi', cat: 'nut', n: [606, 22.6, 52.8, 17.3, 4.5, 2.6, 350], s: [['一小把', 25]], f: [] },
  { id: 'pumpkin_seed', name: '南瓜子', alias: 'nanguazi', cat: 'nut', n: [566, 33.2, 48.1, 4.9, 4.2, 1.4, 20], s: [['一小把', 25]], f: [] },
  { id: 'hazelnut', name: '榛子', alias: 'zhenzi', cat: 'nut', n: [628, 15.0, 60.8, 16.7, 9.7, 4.3, 0], s: [['一小把', 25]], f: ['quick'] },
  { id: 'macadamia', name: '夏威夷果', alias: 'xiaweiyiguo macadamia', cat: 'nut', n: [718, 7.9, 75.8, 13.8, 8.6, 4.6, 5], s: [['一小把', 25]], f: ['quick'] },
  { id: 'sesame', name: '芝麻', alias: 'zhima', cat: 'nut', n: [573, 17.7, 49.7, 23.4, 11.8, 0.3, 11], s: [['一勺', 10]], f: [] },
  { id: 'flaxseed', name: '亚麻籽', alias: 'yamazi', cat: 'nut', n: [534, 18.3, 42.2, 28.9, 27.3, 1.6, 30], s: [['一勺', 12]], f: [] },

  // ---------- 饮品（补充） ----------
  { id: 'americano_milk', name: '美式咖啡（加奶）', alias: 'meishikafei jianai americano milk', cat: 'drink', n: [18, 0.8, 0.8, 1.8, 0, 1.5, 18], s: [['中杯', 350]], nfs: 1.5, source: SOURCE_RECIPE, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total', f: ['quick', 'natsugar', 'est', 'caffeinated'] },
  { id: 'soda_lemon', name: '柠檬气泡水（无糖）', alias: 'qipaoshui', cat: 'drink', n: [1, 0, 0, 0.2, 0, 0, 15], s: [['一罐', 330]], f: ['quick', 'late'] },
  { id: 'yakult', name: '乳酸菌饮料', alias: 'ruusuanjun yakult', cat: 'drink', n: [71, 1.1, 0.1, 16.5, 0, 15.5, 25], s: [['一小瓶', 100]], f: ['sweetdrink', 'quick'] },
  { id: 'energy_drink', name: '功能饮料', alias: 'gongneng yinliao', cat: 'drink', n: [45, 0, 0, 11.0, 0, 11.0, 100], s: [['一罐', 250]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'wine_red', name: '红酒', alias: 'hongjiu', cat: 'drink', n: [85, 0.1, 0, 2.6, 0, 0.6, 4], s: [['一杯', 150]], f: ['alcohol'] },
  { id: 'sake', name: '清酒', alias: 'qingjiu sake', cat: 'drink', n: [134, 0.5, 0, 5.0, 0, 0, 2], s: [['一小杯', 100]], f: ['alcohol'] },
  { id: 'protein_shake', name: '蛋白奶昔（即饮）', alias: 'danbai naixi', cat: 'drink', n: [50, 8.0, 1.0, 2.5, 0, 2.0, 90], s: [['一瓶', 330]], f: ['quick', 'natsugar'] },
  { id: 'coconut_milk_drink', name: '椰汁饮料（含糖）', alias: 'yezhi yenai coconut drink', cat: 'drink', n: [104, 1.0, 7.0, 9.5, 0, 8.0, 30], s: [['一盒', 245]], f: ['sweetdrink', 'quick', 'est'] },
  { id: 'soup_broth', name: '清汤 / 蔬菜汤', alias: 'qingtang', cat: 'drink', n: [18, 1.0, 0.8, 1.8, 0.3, 0.5, 380], s: [['一碗', 300]], f: [] },

  // ---------- 零食（补充） ----------
  { id: 'egg_roll', name: '蛋卷', alias: 'danjuan', cat: 'snack', n: [520, 7.0, 27.0, 62.0, 1.0, 28.0, 220], s: [['一根', 15]], f: ['refined', 'processed', 'quick'] },
  { id: 'sachima', name: '沙琪玛', alias: 'shaqima', cat: 'snack', n: [452, 5.0, 20.0, 63.0, 1.0, 30.0, 200], s: [['一块', 40]], f: ['fried', 'processed', 'quick'] },
  { id: 'mooncake', name: '月饼', alias: 'yuebing', cat: 'snack', n: [420, 6.0, 16.0, 64.0, 2.0, 35.0, 200], s: [['一个', 100]], f: ['processed'] },
  { id: 'popcorn', name: '爆米花（焦糖）', alias: 'baomihua', cat: 'snack', n: [420, 5.0, 12.0, 74.0, 5.0, 40.0, 300], s: [['一小桶', 60]], f: ['processed'] },
  { id: 'pudding', name: '布丁', alias: 'buding', cat: 'snack', n: [130, 3.0, 4.0, 21.0, 0, 19.0, 90], s: [['一个', 100]], f: ['processed', 'quick'] },
  { id: 'egg_tart', name: '蛋挞', alias: 'danta', cat: 'snack', n: [300, 5.0, 17.0, 32.0, 0.5, 15.0, 180], s: [['一个', 60]], f: ['processed'] },
  { id: 'donut', name: '甜甜圈', alias: 'tiantianquan donut', cat: 'snack', n: [420, 5.5, 24.0, 46.0, 1.5, 22.0, 320], s: [['一个', 60]], f: ['fried', 'processed'] },
  { id: 'bubble_pearl', name: '珍珠（波霸）', alias: 'zhenzhu boba', cat: 'snack', n: [186, 0.2, 0.1, 46.0, 0.5, 20.0, 5], s: [['一份', 80]], f: ['refined'] },
  { id: 'rice_cracker', name: '米饼 / 仙贝', alias: 'mibing xianbei', cat: 'snack', n: [400, 6.0, 8.0, 76.0, 1.0, 12.0, 600], s: [['一小包', 30]], f: ['refined', 'processed', 'quick'] },
  { id: 'seaweed_snack', name: '海苔脆片', alias: 'haitai cuipian', cat: 'snack', n: [420, 20.0, 25.0, 30.0, 12.0, 4.0, 900], s: [['一小包', 20]], f: ['processed', 'quick'] },
  { id: 'spicy_strip', name: '辣条', alias: 'latiao', cat: 'snack', n: [480, 12.0, 30.0, 40.0, 2.0, 8.0, 2000], s: [['一小包', 50]], f: ['processed', 'quick'] },
  { id: 'yogurt_drink', name: '常温酸奶饮品', alias: 'suannai yinpin', cat: 'snack', n: [85, 2.5, 2.0, 14.0, 0, 12.0, 55], s: [['一瓶', 200]], f: ['quick'] , nfs: 3.5},

  // ---------- 菜肴外卖（补充） ----------
  { id: 'kungpao_shrimp', name: '宫保虾球', alias: 'gongbaoxia gongbaoxiaqiu', cat: 'dish', n: [170, 13.0, 11.0, 8.0, 1.0, 4.0, 750], s: [['一份可食部', 200]], source: SOURCE_RECIPE, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total', f: ['est'] },
  { id: 'sweet_sour_pork', name: '糖醋里脊', alias: 'tangculiji', cat: 'dish', n: [275, 12.0, 15.0, 23.0, 0.5, 12.0, 620], s: [['一份', 200]], f: ['fried'] },
  { id: 'twice_pork', name: '回锅肉', alias: 'huiguorou', cat: 'dish', n: [330, 12.0, 28.0, 7.0, 1.0, 3.0, 900], s: [['一份', 200]], f: [] },
  { id: 'dry_pot_cauliflower', name: '干锅花菜', alias: 'ganguohuacai', cat: 'dish', n: [130, 4.0, 9.5, 7.5, 2.2, 2.0, 780], s: [['一份', 250]], f: [] },
  { id: 'braised_eggplant', name: '红烧茄子', alias: 'hongshaoqiezi', cat: 'dish', n: [165, 2.0, 13.0, 10.5, 2.0, 4.0, 700], s: [['一份', 250]], f: ['fried'] },
  { id: 'scrambled_egg_chive', name: '韭菜炒蛋', alias: 'jiucaichaodan', cat: 'dish', n: [145, 8.0, 11.0, 3.5, 1.0, 1.0, 500], s: [['一份', 200]], f: [] },
  { id: 'chicken_soup', name: '鸡汤', alias: 'jitang', cat: 'dish', n: [58, 4.5, 4.0, 0.8, 0, 0.3, 400], s: [['一碗', 300]], f: [] },
  { id: 'seaweed_egg_soup', name: '紫菜蛋花汤', alias: 'zicaidanhuatang', cat: 'dish', n: [28, 2.2, 1.5, 1.6, 0.3, 0.4, 480], s: [['一碗', 300]], f: [] },
  { id: 'tomato_egg_soup', name: '番茄蛋汤', alias: 'fanqiedantang 西红柿蛋汤', cat: 'dish', n: [32, 2.0, 1.8, 2.2, 0.4, 1.5, 450], s: [['一碗', 300]], f: [] },
  { id: 'lo_mei', name: '卤味拼盘', alias: 'luwei', cat: 'dish', n: [210, 18.0, 13.0, 5.0, 0.3, 2.0, 1100], s: [['一份', 150]], f: ['processed'] },
  { id: 'bbq_skewer_veg', name: '烤蔬菜串', alias: 'kaoshucai', cat: 'dish', n: [95, 2.0, 7.0, 6.0, 2.0, 2.0, 420], s: [['一串', 60]], f: [] },
  { id: 'poke_bowl', name: '牛油果三文鱼饭', alias: 'poke bowl', cat: 'dish', n: [155, 9.0, 7.0, 14.0, 1.8, 2.0, 380], s: [['一份', 400]], f: ['quick'] },
  { id: 'chicken_wrap', name: '鸡肉卷', alias: 'jirouzhuan wrap', cat: 'dish', n: [215, 11.0, 9.0, 23.0, 1.5, 3.0, 560], s: [['一个', 180]], f: ['quick'] },
  { id: 'oden', name: '关东煮', alias: 'guandongzhu oden', cat: 'dish', n: [85, 6.0, 3.5, 7.0, 0.8, 1.5, 900], s: [['一份', 200]], f: ['quick'] },
  { id: 'curry_rice', name: '咖喱饭', alias: 'galifan', cat: 'dish', n: [150, 5.0, 5.0, 21.0, 1.2, 3.0, 500], s: [['一份', 400]], f: [] },
  { id: 'ramen', name: '日式拉面', alias: 'rishilamian ramen', cat: 'dish', n: [125, 6.0, 4.5, 15.0, 1.0, 1.0, 800], s: [['一碗', 550]], f: [] },
  { id: 'donburi_beef', name: '牛肉盖饭', alias: 'niuroufan gyudon', cat: 'dish', n: [160, 7.5, 5.5, 20.0, 0.8, 3.0, 550], s: [['一份', 400]], f: [] },
  { id: 'spring_roll', name: '春卷', alias: 'chunjuan', cat: 'dish', n: [290, 5.0, 16.0, 32.0, 1.5, 2.0, 450], s: [['一个', 40]], f: ['fried'] },
  { id: 'chicken_nugget', name: '鸡块', alias: 'jikuai nugget', cat: 'dish', n: [296, 15.0, 19.0, 16.0, 1.0, 0.5, 550], s: [['一份5块', 90]], f: ['fried', 'processed', 'quick'] },
  { id: 'salad_veg', name: '蔬菜沙拉（油醋汁）', alias: 'shucaishala', cat: 'dish', n: [65, 1.5, 4.5, 5.0, 2.0, 2.5, 220], s: [['一份', 250]], f: ['quick'] },
  { id: 'corn_soup', name: '玉米浓汤', alias: 'yuminongtang', cat: 'dish', n: [72, 2.0, 2.5, 11.0, 0.8, 3.5, 420], s: [['一碗', 250]], f: ['quick'] },
  { id: 'porridge_seafood', name: '海鲜粥', alias: 'haixianzhou', cat: 'dish', n: [65, 4.0, 1.2, 9.5, 0.3, 0.5, 400], s: [['一碗', 400]], f: ['breakfast'] },

  // ---------- 蔬菜（第三批：叶菜、瓜豆、菌菇） ----------
  { id: 'water_spinach', name: '空心菜', alias: 'kongxincai 蕹菜 通菜 空心菜', cat: 'veg', n: [20, 2.2, 0.3, 3.6, 1.4, 0.8, 94], s: [['一份', 200]], f: ['cook'] },
  { id: 'crown_daisy', name: '茼蒿', alias: 'tonghao', cat: 'veg', n: [21, 1.9, 0.3, 3.9, 1.2, 0.9, 161], s: [['一份', 200]], f: ['cook'] },
  { id: 'youmaicai', name: '油麦菜', alias: 'youmaicai', cat: 'veg', n: [15, 1.4, 0.4, 2.1, 0.6, 0.8, 80], s: [['一份', 200]], f: ['cook'] },
  { id: 'baby_cabbage', name: '娃娃菜', alias: 'wawacai', cat: 'veg', n: [17, 1.3, 0.2, 2.9, 0.9, 1.2, 48], s: [['一份', 200]], f: ['cook'] },
  { id: 'shanghai_greens', name: '上海青 / 鸡毛菜', alias: 'shanghaiqing jimaocai', cat: 'veg', n: [15, 1.5, 0.3, 2.4, 1.1, 0.9, 74], s: [['一份', 200]], f: ['cook'] },
  { id: 'gailan', name: '芥兰', alias: 'gailan jielan', cat: 'veg', n: [19, 2.8, 0.4, 2.6, 1.6, 1.0, 50], s: [['一份', 200]], f: ['cook'] },
  { id: 'caixin', name: '菜心 / 菜苔', alias: 'caixin caitai', cat: 'veg', n: [20, 2.0, 0.3, 3.0, 1.3, 1.0, 46], s: [['一份', 200]], f: ['cook'] },
  { id: 'pea_shoot', name: '豌豆苗', alias: 'wandoumiao doumiao', cat: 'veg', n: [34, 4.0, 0.8, 4.6, 1.9, 1.0, 18], s: [['一份', 150]], f: ['cook'] },
  { id: 'amaranth', name: '苋菜', alias: 'xiancai', cat: 'veg', n: [25, 2.5, 0.4, 3.4, 1.8, 0.8, 32], s: [['一份', 200]], f: ['cook'] },
  { id: 'cilantro', name: '香菜', alias: 'xiangcai yansui', cat: 'veg', n: [31, 1.8, 0.4, 6.2, 1.2, 1.0, 48], s: [['一小把', 20]], f: [] },
  { id: 'perilla', name: '紫苏叶', alias: 'zisu', cat: 'veg', n: [37, 3.8, 0.6, 5.0, 3.0, 0.8, 4], s: [['一小把', 15]], f: [] },
  { id: 'luffa', name: '丝瓜', alias: 'sigua', cat: 'veg', n: [20, 1.0, 0.2, 4.2, 0.6, 2.0, 5], s: [['一份', 200]], f: ['cook'] },
  { id: 'chayote', name: '佛手瓜', alias: 'foshougua', cat: 'veg', n: [19, 0.8, 0.1, 4.5, 1.2, 1.7, 2], s: [['一份', 200]], f: ['cook'] },
  { id: 'long_bean', name: '豆角 / 豇豆', alias: 'doujiao jiangdou', cat: 'veg', n: [34, 2.7, 0.2, 6.7, 2.1, 2.0, 5], s: [['一份', 150]], f: ['cook'] },
  { id: 'hyacinth_bean', name: '扁豆', alias: 'biandou', cat: 'veg', n: [37, 2.7, 0.2, 6.9, 2.1, 1.5, 4], s: [['一份', 150]], f: ['cook'] },
  { id: 'broad_bean', name: '蚕豆（鲜）', alias: 'candou', cat: 'veg', n: [104, 8.8, 0.4, 19.5, 3.5, 2.0, 4], s: [['一份', 100]], f: [] },
  { id: 'green_pea', name: '豌豆（鲜）', alias: 'wandou', cat: 'veg', n: [105, 7.4, 0.3, 21.2, 3.0, 5.7, 1], s: [['一份', 100]], f: [] },
  { id: 'baby_corn', name: '玉米笋', alias: 'yumisun', cat: 'veg', n: [26, 2.1, 0.2, 4.8, 1.6, 1.5, 5], s: [['一份', 100]], f: [] },
  { id: 'water_bamboo', name: '茭白', alias: 'jiaobai', cat: 'veg', n: [23, 1.2, 0.2, 5.9, 1.9, 1.5, 6], s: [['一份', 150]], f: ['cook'] },
  { id: 'water_chestnut', name: '荸荠 / 马蹄', alias: 'biqi matí matai', cat: 'veg', n: [61, 1.2, 0.2, 14.2, 1.1, 6.0, 16], s: [['一份', 100]], f: [] },
  { id: 'daylily', name: '黄花菜（干）', alias: 'huanghuacai jinzhen', cat: 'veg', n: [199, 19.4, 1.4, 34.9, 7.7, 5.0, 60], s: [['一小把', 15]], f: [] },
  { id: 'king_oyster', name: '杏鲍菇', alias: 'xingbaogu', cat: 'veg', n: [35, 1.3, 0.1, 8.3, 2.1, 1.5, 3], s: [['一份', 150]], f: ['cook'] },
  { id: 'shimeji', name: '蟹味菇 / 白玉菇', alias: 'xieweigu baiyugu', cat: 'veg', n: [28, 2.7, 0.3, 5.0, 2.2, 1.2, 5], s: [['一份', 100]], f: ['cook'] },
  { id: 'button_mushroom', name: '口蘑 / 双孢菇', alias: 'koumo shuangbaogu', cat: 'veg', n: [22, 3.1, 0.3, 3.3, 1.0, 1.7, 5], s: [['一份', 100]], f: ['cook'] },
  { id: 'tea_tree_mushroom', name: '茶树菇', alias: 'chashugu', cat: 'veg', n: [31, 3.5, 0.4, 5.2, 2.6, 1.0, 8], s: [['一份', 100]], f: ['cook'] },
  { id: 'white_fungus', name: '银耳（水发）', alias: 'yiner baimuer', cat: 'veg', n: [26, 0.9, 0.1, 6.4, 2.6, 0.6, 5], s: [['一份', 150]], f: [] },
  { id: 'chinese_yam_bean', name: '凉薯 / 沙葛', alias: 'liangshu shage jicama', cat: 'veg', n: [38, 0.7, 0.1, 8.8, 4.9, 1.8, 4], s: [['一份', 150]], f: [] },
  { id: 'pickled_mustard', name: '榨菜', alias: 'zhacai', cat: 'veg', n: [29, 2.0, 0.3, 6.5, 2.1, 1.5, 4252], s: [['一小包', 30]], f: ['processed', 'quick'] },
  { id: 'dried_radish', name: '萝卜干', alias: 'luobogan', cat: 'veg', n: [60, 3.3, 0.3, 12.0, 3.0, 3.0, 3000], s: [['一份', 30]], f: ['processed'] },
  { id: 'sprout_soybean', name: '黄豆芽', alias: 'huangdouya', cat: 'veg', n: [44, 4.5, 1.6, 3.0, 1.5, 0.5, 7], s: [['一份', 150]], f: ['cook'] },
  { id: 'ginger', name: '姜', alias: 'jiang', cat: 'veg', n: [41, 1.3, 0.6, 10.3, 2.7, 1.0, 27], s: [['一小块', 10]], f: [] },
  { id: 'garlic', name: '大蒜', alias: 'dasuan', cat: 'veg', n: [126, 4.5, 0.2, 27.6, 1.1, 1.4, 19], s: [['一瓣', 5]], f: [] },
  { id: 'scallion', name: '小葱', alias: 'xiaocong', cat: 'veg', n: [30, 1.6, 0.4, 5.9, 1.4, 1.5, 10], s: [['一小把', 20]], f: [] },
  { id: 'chili_fresh', name: '小米辣 / 尖椒', alias: 'xiaomila jianjiao', cat: 'veg', n: [32, 1.3, 0.4, 6.4, 3.2, 3.0, 2], s: [['一份', 30]], f: [] },

  // ---------- 水果（第三批） ----------
  { id: 'guava', name: '番石榴 / 芭乐', alias: 'fanshiliu bale guava', cat: 'fruit', n: [41, 1.1, 0.4, 9.4, 5.9, 5.5, 3], s: [['一个', 200]], f: ['quick'] },
  { id: 'papaya', name: '木瓜', alias: 'mugua papaya', cat: 'fruit', n: [29, 0.4, 0.1, 7.0, 0.8, 5.9, 28], s: [['半个', 200]], f: [] },
  { id: 'mangosteen', name: '山竹', alias: 'shanzhu mangosteen', cat: 'fruit', n: [69, 0.4, 0.2, 18.0, 1.5, 15.0, 7], s: [['一个', 50]], f: [] },
  { id: 'durian', name: '榴莲', alias: 'liulian durian', cat: 'fruit', n: [147, 2.6, 3.3, 27.1, 1.7, 18.0, 2], s: [['一块', 100]], f: [] },
  { id: 'fig', name: '无花果', alias: 'wuhuaguo fig', cat: 'fruit', n: [65, 1.5, 0.1, 16.0, 3.0, 13.0, 5], s: [['一个', 60]], f: ['quick'] },
  { id: 'hawthorn', name: '山楂', alias: 'shanzha', cat: 'fruit', n: [95, 0.5, 0.6, 25.1, 3.1, 15.0, 5], s: [['一份', 100]], f: [] },
  { id: 'sugarcane', name: '甘蔗', alias: 'ganzhe', cat: 'fruit', n: [64, 0.4, 0.1, 16.0, 0.6, 15.0, 3], s: [['一段', 150]], f: [] },
  { id: 'cantaloupe', name: '哈密瓜', alias: 'hamigua', cat: 'fruit', n: [34, 0.5, 0.1, 7.9, 0.2, 7.0, 26], s: [['一块', 250]], f: [] },
  { id: 'blackberry', name: '黑莓 / 树莓', alias: 'heimei shumei', cat: 'fruit', n: [43, 1.4, 0.5, 9.6, 5.3, 4.9, 1], s: [['一盒', 125]], f: ['quick'] },
  { id: 'lemon', name: '柠檬', alias: 'ningmeng lemon', cat: 'fruit', n: [29, 1.1, 0.3, 9.3, 2.8, 2.5, 2], s: [['一个', 100]], f: [] },
  { id: 'apricot', name: '杏', alias: 'xing apricot', cat: 'fruit', n: [48, 1.4, 0.4, 11.1, 2.0, 9.2, 1], s: [['一个', 50]], f: ['quick'] },
  { id: 'pomegranate', name: '石榴', alias: 'shiliu', cat: 'fruit', n: [72, 1.4, 0.2, 18.7, 4.8, 13.7, 3], s: [['半个', 150]], f: [] },

  // ---------- 菜肴外卖（第二批：常点的整份菜） ----------
  { id: 'braised_chicken_rice', name: '黄焖鸡米饭', alias: 'huangmenji', cat: 'dish', n: [155, 8.5, 6.0, 17.0, 0.8, 2.0, 700], s: [['一份', 500]], f: [] },
  { id: 'braised_chicken', name: '黄焖鸡（不含饭）', alias: 'huangmenji', cat: 'dish', n: [168, 14.0, 10.5, 4.5, 0.7, 2.0, 850], s: [['一份', 250]], f: [] },
  { id: 'shredded_potato', name: '酸辣土豆丝', alias: 'suanlatudousi', cat: 'dish', n: [110, 2.0, 6.0, 13.0, 1.3, 1.5, 620], s: [['一份', 200]], f: [] },
  { id: 'disanxian', name: '地三鲜', alias: 'disanxian', cat: 'dish', n: [178, 2.5, 13.0, 13.5, 2.0, 3.5, 700], s: [['一份', 250]], f: ['fried'] },
  { id: 'boiled_pork', name: '水煮肉片', alias: 'shuizhuroupian', cat: 'dish', n: [225, 13.0, 17.0, 5.0, 1.0, 1.0, 1000], s: [['一份', 300]], f: [] },
  { id: 'boiled_fish', name: '水煮鱼', alias: 'shuizhuyu', cat: 'dish', n: [190, 15.0, 13.0, 3.5, 0.8, 1.0, 950], s: [['一份', 350]], f: [] },
  { id: 'laziji', name: '辣子鸡', alias: 'laziji', cat: 'dish', n: [265, 18.0, 18.0, 8.0, 1.0, 2.0, 900], s: [['一份', 250]], f: ['fried'] },
  { id: 'saliva_chicken', name: '口水鸡', alias: 'koushuiji', cat: 'dish', n: [215, 18.0, 14.5, 3.0, 0.5, 2.0, 850], s: [['一份', 200]], f: [] },
  { id: 'white_cut_chicken', name: '白切鸡', alias: 'baiqieji', cat: 'dish', n: [190, 20.0, 12.0, 0.5, 0, 0.3, 420], s: [['一份', 200]], f: [] },
  { id: 'sanbei_chicken', name: '三杯鸡', alias: 'sanbeiji', cat: 'dish', n: [220, 17.0, 14.0, 6.0, 0.4, 3.5, 880], s: [['一份', 250]], f: [] },
  { id: 'steamed_rib', name: '豉汁蒸排骨', alias: 'chizhipaigu', cat: 'dish', n: [245, 15.0, 18.0, 4.0, 0.3, 1.5, 780], s: [['一份去骨可食部', 150]], note: '营养按排骨肉和附着豉汁计，不含骨重', f: [] },
  { id: 'sweet_sour_rib', name: '糖醋排骨', alias: 'tangcupaigu', cat: 'dish', n: [320, 14.0, 22.0, 17.0, 0.3, 14.0, 700], s: [['一份去骨可食部', 150]], note: '营养按排骨肉和附着糖醋汁计，不含骨重', f: [] },
  { id: 'meigan_pork', name: '梅菜扣肉', alias: 'meicaikourou', cat: 'dish', n: [405, 10.0, 37.0, 8.0, 1.2, 4.0, 1100], s: [['一份', 200]], f: [] },
  { id: 'lion_head', name: '狮子头 / 四喜丸子', alias: 'shizitou sixiwanzi', cat: 'dish', n: [280, 13.0, 22.0, 8.0, 0.4, 2.0, 720], s: [['一个', 80]], f: [] },
  { id: 'mayi_shangshu', name: '蚂蚁上树', alias: 'mayishangshu', cat: 'dish', n: [175, 5.0, 8.5, 19.5, 0.6, 1.5, 780], s: [['一份', 250]], f: [] },
  { id: 'dry_fried_bean', name: '干煸四季豆', alias: 'ganbiansijidou', cat: 'dish', n: [155, 3.5, 11.5, 9.0, 2.6, 2.0, 720], s: [['一份', 200]], f: ['fried'] },
  { id: 'garlic_broccoli', name: '蒜蓉西兰花', alias: 'suanrongxilanhua', cat: 'dish', n: [82, 4.0, 5.5, 5.0, 1.8, 1.6, 480], s: [['一份', 200]], f: [] },
  { id: 'garlic_spinach', name: '蒜蓉菠菜', alias: 'suanrongbocai', cat: 'dish', n: [75, 2.8, 5.5, 4.8, 1.7, 0.8, 520], s: [['一份', 200]], f: [] },
  { id: 'oyster_lettuce', name: '蚝油生菜', alias: 'haoyoushengcai', cat: 'dish', n: [68, 1.6, 5.0, 4.5, 0.9, 1.5, 620], s: [['一份', 200]], f: [] },
  { id: 'scrambled_egg_tomato_rice', name: '番茄鸡蛋盖饭', alias: 'fanqiejidangaifan 西红柿鸡蛋盖饭', cat: 'dish', n: [148, 5.0, 5.5, 19.5, 0.6, 2.0, 500], s: [['一份', 450]], f: [] },
  { id: 'pork_rice', name: '卤肉饭', alias: 'luroufan', cat: 'dish', n: [178, 6.5, 7.5, 21.0, 0.6, 3.0, 620], s: [['一份', 400]], f: [] },
  { id: 'chicken_leg_rice', name: '鸡腿饭', alias: 'jituifan', cat: 'dish', n: [165, 9.0, 6.0, 19.5, 0.7, 1.5, 560], s: [['一份', 450]], f: [] },
  { id: 'eggplant_rice', name: '茄子煲饭', alias: 'qiezibaofan', cat: 'dish', n: [152, 4.0, 6.5, 19.5, 1.3, 2.5, 640], s: [['一份', 450]], f: [] },
  { id: 'mapo_rice', name: '麻婆豆腐盖饭', alias: 'mapodoufugaifan', cat: 'dish', n: [148, 6.0, 6.0, 18.0, 0.7, 1.5, 620], s: [['一份', 450]], f: [] },
  { id: 'stir_squid', name: '爆炒鱿鱼', alias: 'baochaoyouyu', cat: 'dish', n: [125, 15.0, 6.0, 3.0, 0.5, 1.5, 760], s: [['一份', 200]], f: [] },
  { id: 'garlic_scallop', name: '蒜蓉粉丝蒸扇贝', alias: 'suanrongfensishanbei', cat: 'dish', n: [120, 9.0, 4.0, 12.0, 0.4, 1.0, 620], s: [['一只去壳可食部', 40]], note: '按扇贝肉、粉丝和附着蒜蓉汁计，不含贝壳', f: [] },
  { id: 'crayfish', name: '小龙虾（蒜蓉，可食部）', alias: 'xiaolongxia', cat: 'dish', n: [135, 16.0, 6.5, 3.0, 0.2, 1.0, 900], s: [['一份去壳可食部', 100]], edibleRatio: 0.33, note: '常见约 300g 带壳成品按三分之一折为 100g 虾肉和附着蒜蓉汁；不含壳重与盘底余汁', f: [] },
  { id: 'grilled_fish', name: '烤鱼', alias: 'kaoyu', cat: 'dish', n: [175, 16.0, 11.0, 3.5, 0.8, 1.5, 950], s: [['一份', 350]], f: [] },
  { id: 'spicy_hotpot', name: '麻辣香锅', alias: 'malaxiangguo', cat: 'dish', n: [195, 9.0, 14.5, 8.0, 1.6, 2.0, 1150], s: [['一份', 400]], f: [] },
  { id: 'hotpot_spicy', name: '红汤火锅（涮肉为主）', alias: 'hongtanghuoguo', cat: 'dish', n: [185, 11.0, 14.0, 4.0, 1.0, 1.0, 1200], s: [['一份', 400]], f: [] },
  { id: 'bbq_pork_belly', name: '烤五花肉', alias: 'kaowuhuarou', cat: 'dish', n: [420, 13.0, 40.0, 2.0, 0, 1.0, 600], s: [['一份', 150]], f: [] },
  { id: 'bbq_eggplant', name: '烤茄子', alias: 'kaoqiezi', cat: 'dish', n: [110, 2.0, 8.0, 8.0, 1.8, 3.0, 620], s: [['一个', 250]], f: [] },
  { id: 'bbq_corn', name: '烤玉米', alias: 'kaoyumi', cat: 'dish', n: [130, 4.0, 3.0, 23.0, 2.8, 3.5, 300], s: [['一根', 200]], f: [] },
  { id: 'chicken_congee', name: '鸡丝粥', alias: 'jisizhou', cat: 'dish', n: [62, 4.0, 1.0, 9.0, 0.3, 0.4, 380], s: [['一碗', 400]], f: ['breakfast'] },
  { id: 'beef_brisket_noodle', name: '牛腩面', alias: 'niunanmian', cat: 'dish', n: [135, 7.5, 5.0, 15.0, 0.9, 1.0, 720], s: [['一碗', 550]], f: [] },
  { id: 'tomato_beef_noodle', name: '番茄牛肉面', alias: 'fanqieniuroumian', cat: 'dish', n: [118, 6.5, 3.5, 15.5, 1.0, 2.0, 650], s: [['一碗', 550]], f: [] },
  { id: 'suanla_fen', name: '酸辣粉', alias: 'suanlafen', cat: 'dish', n: [125, 2.5, 5.5, 17.0, 0.8, 1.5, 900], s: [['一碗', 400]], f: [] },
  { id: 'luosifen', name: '螺蛳粉', alias: 'luosifen', cat: 'dish', n: [140, 4.5, 6.0, 18.0, 1.2, 1.5, 1100], s: [['一碗', 450]], f: [] },
  { id: 'liangpi_spicy', name: '麻辣凉皮', alias: 'malaliangpi liangpi', cat: 'dish', n: [190, 4.0, 7.5, 29.0, 1.2, 2.0, 700], s: [['一份', 350]], source: SOURCE_RECIPE, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total', f: ['refined', 'est'] },
  { id: 'guobaorou', name: '锅包肉', alias: 'guobaorou', cat: 'dish', n: [300, 12.0, 17.0, 26.0, 0.4, 13.0, 640], s: [['一份', 200]], f: ['fried'] },
  { id: 'kaobing_meat', name: '肉夹馍', alias: 'roujiamo', cat: 'dish', n: [275, 11.0, 13.0, 29.0, 1.2, 2.0, 700], s: [['一个', 200]], f: [] },
  { id: 'guokui', name: '锅盔（肉馅）', alias: 'guokui rouguokui', cat: 'dish', n: [300, 8.0, 14.0, 38.0, 1.5, 2.0, 650], s: [['一个', 100]], source: SOURCE_RECIPE, basis: '100g', state: 'ready', edibleRatio: 1, carbBasis: 'total', f: ['fried', 'breakfast', 'est'] },
  { id: 'xiaolongbao', name: '小笼包', alias: 'xiaolongbao', cat: 'dish', n: [230, 9.0, 10.0, 26.0, 0.9, 1.5, 500], s: [['一个', 25]], f: ['breakfast'] },
  { id: 'guotie', name: '锅贴 / 煎饺', alias: 'guotie jianjiao', cat: 'dish', n: [265, 9.0, 13.0, 27.0, 1.2, 1.5, 520], s: [['一个', 25]], f: ['fried'] },
  { id: 'fried_rice_yangzhou', name: '扬州炒饭', alias: 'yangzhouchaofan', cat: 'dish', n: [195, 6.5, 8.0, 24.0, 0.8, 1.2, 650], s: [['一份', 350]], f: ['fried'] },
  { id: 'claypot_rice', name: '煲仔饭', alias: 'baozaifan', cat: 'dish', n: [185, 8.0, 6.5, 24.0, 0.7, 2.0, 620], s: [['一份', 400]], f: [] },
  { id: 'steamed_pork_rib_rice', name: '粉蒸肉', alias: 'fenzhengrou', cat: 'dish', n: [290, 11.0, 20.0, 18.0, 0.6, 2.0, 680], s: [['一份', 200]], f: [] },
  { id: 'stew_beef_potato', name: '土豆炖牛肉', alias: 'tudoudunniurou', cat: 'dish', n: [148, 10.5, 8.0, 8.5, 1.0, 1.5, 700], s: [['一份', 300]], f: [] },
  { id: 'stew_pork_bean', name: '排骨炖豆角', alias: 'paigudundoujiao', cat: 'dish', n: [155, 9.0, 10.5, 6.5, 1.6, 1.5, 680], s: [['一份可食部', 250]], note: '排骨按去骨肉、豆角按可食部计；包含少量附着汤汁', f: [] },
  { id: 'chicken_mushroom_stew', name: '小鸡炖蘑菇', alias: 'xiaojidunmogu', cat: 'dish', n: [140, 12.0, 8.5, 4.0, 1.2, 1.0, 700], s: [['一份', 300]], f: [] },
  { id: 'dongpo_pork', name: '东坡肉', alias: 'dongporou', cat: 'dish', n: [450, 10.0, 42.0, 8.0, 0, 6.0, 750], s: [['一块', 100]], f: [] },
  { id: 'salt_pepper_shrimp', name: '椒盐虾（可食部）', alias: 'jiaoyanxia', cat: 'dish', n: [175, 18.0, 9.0, 5.0, 0.2, 0.5, 900], s: [['一份去壳可食部', 120]], edibleRatio: 0.6, note: '按虾肉和可食用脆壳/挂料的代表比例折算，不把剩余虾壳重量计入', f: ['fried'] },
  { id: 'stir_beef_pepper', name: '青椒炒牛肉', alias: 'qingjiaoniurou', cat: 'dish', n: [165, 14.0, 10.0, 4.5, 1.0, 1.5, 720], s: [['一份', 250]], f: [] },
  { id: 'stir_pork_cabbage', name: '手撕包菜', alias: 'shousibaocai', cat: 'dish', n: [88, 1.8, 6.5, 5.5, 1.2, 2.0, 560], s: [['一份', 200]], f: [] },
  { id: 'stir_egg_fungus', name: '木耳炒鸡蛋', alias: 'muerchaodan', cat: 'dish', n: [118, 6.5, 8.5, 3.8, 1.5, 0.8, 520], s: [['一份', 200]], f: [] },
  { id: 'stir_shrimp_egg', name: '虾仁炒蛋', alias: 'xiarenchaodan', cat: 'dish', n: [135, 12.0, 8.5, 2.5, 0.2, 0.8, 560], s: [['一份', 200]], f: [] },
  { id: 'chicken_salad_wrap', name: '全麦鸡胸卷', alias: 'quanmaijixiongjuan', cat: 'dish', n: [175, 13.0, 5.5, 18.0, 2.5, 2.0, 480], s: [['一个', 200]], f: ['quick'] },
  { id: 'tuna_sandwich', name: '金枪鱼三明治', alias: 'jinqiangyusanmingzhi', cat: 'dish', n: [215, 12.0, 8.5, 23.0, 1.6, 3.0, 560], s: [['一个', 170]], f: ['quick'] },
  { id: 'fried_chicken_burger', name: '炸鸡汉堡', alias: 'zhajihanbao', cat: 'dish', n: [295, 13.0, 15.0, 27.0, 1.3, 5.0, 700], s: [['一个', 200]], f: ['fried', 'processed', 'quick'] },
  { id: 'hash_brown', name: '薯饼', alias: 'shubing hashbrown', cat: 'dish', n: [310, 3.0, 18.0, 34.0, 3.0, 0.5, 480], s: [['一块', 55]], f: ['fried', 'processed', 'quick'] },
  { id: 'onion_ring', name: '洋葱圈', alias: 'yangcongquan', cat: 'dish', n: [370, 5.0, 21.0, 41.0, 2.0, 4.0, 620], s: [['一份', 90]], f: ['fried', 'processed'] },
  { id: 'takoyaki', name: '章鱼小丸子', alias: 'zhangyuxiaowanzi takoyaki', cat: 'dish', n: [190, 7.0, 9.0, 20.0, 0.8, 3.0, 620], s: [['一份6个', 120]], f: [] },
  { id: 'tempura', name: '天妇罗', alias: 'tianfuluo tempura', cat: 'dish', n: [270, 9.0, 16.0, 22.0, 1.2, 1.0, 450], s: [['一份', 120]], f: ['fried'] },
  { id: 'sashimi', name: '刺身拼盘', alias: 'cishen sashimi', cat: 'dish', n: [140, 21.0, 6.0, 0.5, 0, 0, 90], s: [['一份', 150]], f: [] },
  { id: 'miso_soup', name: '味噌汤', alias: 'weizengtang miso', cat: 'dish', n: [35, 2.5, 1.2, 3.5, 0.6, 1.0, 700], s: [['一碗', 200]], f: ['quick'] },
  { id: 'kimchi_stew', name: '泡菜锅', alias: 'paocaiguo', cat: 'dish', n: [78, 5.5, 4.0, 5.0, 1.5, 2.0, 1000], s: [['一份', 400]], f: [] },
  { id: 'bibimbap', name: '石锅拌饭', alias: 'shiguobanfan bibimbap', cat: 'dish', n: [148, 6.0, 5.0, 20.0, 1.5, 2.5, 550], s: [['一份', 450]], f: [] },
  { id: 'pad_thai', name: '泰式炒河粉', alias: 'taishichaohefen padthai', cat: 'dish', n: [185, 7.0, 7.5, 23.0, 1.2, 4.0, 700], s: [['一份', 350]], f: [] },
  { id: 'tom_yum', name: '冬阴功汤', alias: 'dongyingong tomyum', cat: 'dish', n: [62, 5.0, 3.0, 4.0, 0.6, 2.0, 800], s: [['一碗', 300]], f: [] },

  // ---------- 主食（第三批） ----------
  { id: 'naan', name: '烤馕', alias: 'kaonang', cat: 'staple', n: [320, 9.0, 6.0, 57.0, 2.5, 2.0, 450], s: [['四分之一个', 80]], f: ['refined'] },
  { id: 'huajuan', name: '花卷', alias: 'huajuan', cat: 'staple', n: [217, 6.4, 1.0, 45.6, 1.5, 2.0, 200], s: [['一个', 80]], f: ['refined', 'breakfast'] },
  { id: 'yinsijuan', name: '银丝卷（蒸）', alias: 'yinsijuan steamed silver thread roll', cat: 'staple', n: [235, 7.0, 2.5, 47.0, 1.3, 4.0, 220], s: [['一个', 70]], note: '不适用于油炸馒头片；油炸会显著提高脂肪和热量', f: ['refined', 'breakfast'] },
  { id: 'tangyuan', name: '汤圆（芝麻馅）', alias: 'tangyuan yuanxiao', cat: 'staple', n: [311, 5.0, 12.0, 46.0, 1.0, 18.0, 60], s: [['一个', 20]], f: [] },
  { id: 'niangao', name: '年糕', alias: 'niangao', cat: 'staple', n: [154, 3.0, 0.5, 34.0, 0.6, 1.0, 40], s: [['一份', 150]], f: ['refined'] },
  { id: 'oat_milk_bowl', name: '燕麦牛奶碗', alias: 'yanmainiunai overnight oats', cat: 'staple', n: [110, 5.0, 3.0, 16.0, 2.2, 5.0, 40], s: [['一碗', 300]], f: ['breakfast', 'quick'] },
  { id: 'cereal', name: '即食麦片（含糖）', alias: 'maipian cereal', cat: 'staple', n: [400, 8.0, 8.0, 74.0, 5.0, 22.0, 300], s: [['一份', 40]], f: ['processed', 'quick', 'breakfast'] },
  { id: 'rice_ball_jp', name: '饭团', alias: 'fantuan onigiri', cat: 'staple', n: [170, 4.0, 2.0, 34.0, 0.6, 1.5, 400], s: [['一个', 110]], f: ['quick', 'breakfast'] },
  { id: 'sweet_potato_noodle', name: '红薯粉', alias: 'hongshufen', cat: 'staple', n: [95, 0.2, 0.1, 23.5, 0.5, 0.2, 12], s: [['一份', 200]], f: ['refined'] },
  { id: 'udon', name: '乌冬面（煮熟）', alias: 'wudongmian udon', cat: 'staple', n: [105, 3.0, 0.3, 22.0, 0.9, 0.5, 200], s: [['一份', 250]], f: ['refined'] },
  { id: 'tortilla', name: '墨西哥卷饼皮', alias: 'juanbingpi tortilla', cat: 'staple', n: [310, 8.0, 8.0, 51.0, 3.0, 2.0, 550], s: [['一张', 50]], f: ['quick'] },

  // ---------- 肉禽 / 水产（第三批） ----------
  { id: 'chicken_gizzard', name: '鸡胗', alias: 'jizhen', cat: 'meat', n: [118, 19.2, 2.8, 4.0, 0, 0, 74], s: [['一份', 100]], f: [] },
  { id: 'duck_breast', name: '鸭胸肉（去皮）', alias: 'yaxiong', cat: 'meat', n: [133, 19.0, 6.0, 0, 0, 0, 90], s: [['一块', 120]], f: ['cook'] },
  { id: 'pork_tenderloin', name: '猪里脊', alias: 'zhuliji', cat: 'meat', n: [155, 20.2, 7.9, 0.7, 0, 0, 57], s: [['一份', 100]], f: ['cook'] },
  { id: 'beef_tendon', name: '牛筋', alias: 'niujin', cat: 'meat', n: [151, 34.1, 0.5, 2.0, 0, 0, 118], s: [['一份', 100]], f: [] },
  { id: 'chicken_heart', name: '鸡心', alias: 'jixin', cat: 'meat', n: [172, 15.9, 11.8, 0.6, 0, 0, 74], s: [['一份', 80]], f: [] },
  { id: 'shredded_pork_dry', name: '肉松', alias: 'rousong', cat: 'meat', n: [396, 41.8, 10.7, 33.0, 0, 25.0, 1900], s: [['一勺', 10]], f: ['processed', 'quick'] },
  { id: 'mackerel', name: '青花鱼', alias: 'qinghuayu saba mackerel', cat: 'seafood', n: [205, 21.0, 13.0, 0, 0, 0, 74], s: [['一块可食部', 120]], f: ['cook'] },
  { id: 'sardine', name: '沙丁鱼', alias: 'shadingyu sardine', cat: 'seafood', n: [208, 24.6, 11.5, 0, 0, 0, 505], s: [['一罐', 100]], f: ['quick'] },
  { id: 'eel', name: '鳗鱼（蒲烧）', alias: 'manyu unagi', cat: 'seafood', n: [293, 23.0, 21.0, 3.0, 0, 2.5, 510], s: [['一份', 120]], f: [] },
  { id: 'sea_cucumber', name: '海参（水发）', alias: 'haishen', cat: 'seafood', n: [25, 6.0, 0.1, 0.4, 0, 0, 502], s: [['一只', 60]], f: [] },
  { id: 'abalone', name: '鲍鱼', alias: 'baoyu', cat: 'seafood', n: [84, 12.6, 0.8, 6.6, 0, 0, 2012], s: [['一只', 40]], f: [] },
  { id: 'mussel', name: '青口 / 贻贝', alias: 'qingkou yibei', cat: 'seafood', n: [86, 11.9, 2.2, 3.7, 0, 0, 286], s: [['一份', 100]], f: [] },

  // ---------- 乳制品 / 豆制品（第三批） ----------
  { id: 'milk_powder', name: '全脂奶粉', alias: 'naifen', cat: 'dairy', n: [478, 20.1, 21.2, 51.7, 0, 51.0, 260], s: [['一勺', 25]], f: ['natsugar'] },
  { id: 'goat_milk', name: '羊奶', alias: 'yangnai', cat: 'dairy', n: [59, 3.6, 3.5, 4.6, 0, 4.6, 50], s: [['一杯', 250]], f: ['natsugar', 'quick'] },
  { id: 'lactose_free_milk', name: '零乳糖牛奶', alias: 'wuruutang niunai', cat: 'dairy', n: [45, 3.5, 1.5, 4.6, 0, 4.6, 55], s: [['一盒', 250]], f: ['natsugar', 'quick', 'late'] },
  { id: 'skyr', name: '冰岛式酸奶 skyr', alias: 'skyr', cat: 'dairy', n: [63, 11.0, 0.2, 4.0, 0, 4.0, 40], s: [['一盒', 150]], f: ['quick', 'late', 'natsugar'] },
  { id: 'soy_protein', name: '大豆蛋白粉', alias: 'dadoudanbai soy protein', cat: 'soy', n: [370, 80.0, 2.0, 8.0, 3.0, 1.0, 900], s: [['一勺', 30]], f: ['quick'] },
  { id: 'tofu_stinky', name: '臭豆腐（炸）', alias: 'choudoufu', cat: 'soy', n: [250, 14.0, 18.0, 8.0, 1.0, 1.0, 900], s: [['一份', 120]], f: ['fried'] },
  { id: 'soy_stick', name: '豆干丝 / 干丝', alias: 'gansi doufusi', cat: 'soy', n: [155, 18.0, 6.0, 8.0, 1.2, 0.8, 350], s: [['一份', 100]], f: [] },

  // ---------- 饮品（第三批） ----------
  { id: 'sugarcane_juice', name: '甘蔗汁', alias: 'ganzhezhi', cat: 'drink', n: [58, 0.2, 0.1, 14.0, 0.1, 13.0, 5], s: [['一杯', 350]], f: ['sweetdrink'] },
  { id: 'soy_milk_black', name: '黑豆浆', alias: 'heidoujiang', cat: 'drink', n: [40, 3.5, 1.8, 2.5, 0.6, 0.8, 5], s: [['一杯', 300]], f: ['breakfast', 'quick'] },
  { id: 'barley_tea', name: '大麦茶', alias: 'damaicha', cat: 'drink', n: [2, 0.1, 0, 0.4, 0, 0, 3], s: [['一杯', 250]], f: ['quick', 'late'] },
  { id: 'chrysanthemum_tea', name: '菊花茶（无糖）', alias: 'juhuacha', cat: 'drink', n: [2, 0.1, 0, 0.4, 0, 0, 2], s: [['一杯', 250]], f: ['quick', 'late'] },
  { id: 'lemon_water', name: '柠檬水（无糖）', alias: 'ningmengshui', cat: 'drink', n: [4, 0.1, 0, 1.0, 0.1, 0.3, 2], s: [['一杯', 350]], f: ['quick', 'late'] },
  { id: 'cocoa_milk', name: '可可牛奶', alias: 'kekeniunai', cat: 'drink', n: [80, 3.2, 2.5, 11.5, 0.5, 10.0, 60], s: [['一盒', 250]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'whisky', name: '威士忌', alias: 'weishiji whisky', cat: 'drink', n: [250, 0, 0, 0.1, 0, 0, 1], s: [['一杯', 45]], f: ['alcohol'] },
  { id: 'cocktail', name: '鸡尾酒', alias: 'jiweijiu cocktail', cat: 'drink', n: [155, 0.1, 0.1, 12.0, 0, 11.0, 10], s: [['一杯', 200]], f: ['alcohol', 'sweetdrink'] },

  // ---------- 零食（第三批） ----------
  { id: 'oat_bar', name: '燕麦能量棒（通用）', alias: 'yanmaibang energy bar', cat: 'snack', n: [420, 7.0, 15.0, 63.0, 5.0, 25.0, 180], s: [['一根', 40]], ...META_RECIPE_READY, note: '非特定品牌配方，坚果、糖浆和油脂比例差异很大；有包装时应优先使用标签', f: ['processed', 'quick', 'est'] },
  { id: 'dried_mango', name: '芒果干', alias: 'mangguogan', cat: 'snack', n: [314, 2.0, 0.5, 78.0, 3.0, 62.0, 30], s: [['一小包', 40]], f: ['processed', 'quick'] },
  { id: 'freeze_dried_fruit', name: '冻干水果', alias: 'donggan shuiguo', cat: 'snack', n: [350, 3.0, 1.0, 84.0, 8.0, 60.0, 15], s: [['一小包', 20]], f: ['processed', 'quick'] },
  { id: 'tofu_snack', name: '豆干（零食装）', alias: 'dougan lingshi', cat: 'snack', n: [230, 22.0, 11.0, 12.0, 1.5, 4.0, 1300], s: [['一小包', 40]], f: ['processed', 'quick'] },
  { id: 'chicken_breast_snack', name: '即食鸡胸肉', alias: 'jishijixiong', cat: 'snack', n: [115, 22.0, 2.0, 2.0, 0, 1.0, 700], s: [['一袋', 100]], f: ['quick', 'processed'] },
  { id: 'konjac_jelly', name: '蒟蒻果冻', alias: 'jurao guodong konjac', cat: 'snack', n: [45, 0, 0, 11.0, 1.0, 9.0, 30], s: [['一个', 60]], f: ['processed', 'quick'] },
  { id: 'chestnut', name: '板栗（熟）', alias: 'banli', cat: 'snack', n: [214, 4.8, 1.5, 46.0, 1.7, 8.0, 5], s: [['一小把', 60]], f: ['quick', 'natsugar'] },
  { id: 'dried_tofu_skin_snack', name: '素毛肚 / 辣味素食', alias: 'sumaodu', cat: 'snack', n: [400, 15.0, 25.0, 30.0, 3.0, 5.0, 1600], s: [['一小包', 50]], f: ['processed', 'quick'] },
  { id: 'wafer', name: '威化饼', alias: 'weihuabing wafer', cat: 'snack', n: [510, 5.0, 27.0, 62.0, 1.0, 32.0, 200], s: [['一块', 20]], f: ['refined', 'processed', 'quick'] },
  { id: 'red_bean_bun', name: '豆沙包', alias: 'doushabao', cat: 'snack', n: [250, 6.0, 3.0, 50.0, 2.0, 20.0, 180], s: [['一个', 80]], f: ['breakfast'] },

  // ---------- 连锁快餐 ----------
  { id: 'kfc_spicy_burger', name: '肯德基 香辣鸡腿堡', alias: 'kfc kendeji xianglajitui', cat: 'chain', n: [270, 13.5, 13.0, 24.9, 1.4, 3.8, 595], s: [['一个', 185]], f: ['quick', 'processed'] },
  { id: 'kfc_crispy_burger', name: '肯德基 劲脆鸡腿堡', alias: 'kfc jincui', cat: 'chain', n: [284, 13.7, 14.2, 24.7, 1.3, 3.7, 605], s: [['一个', 190]], f: ['quick', 'processed'] },
  { id: 'kfc_no_burger', name: '肯德基 新奥尔良烤鸡腿堡', alias: 'kfc xinaoerliang kaojituibao', cat: 'chain', n: [221, 13.8, 7.2, 24.6, 1.3, 4.6, 513], s: [['一个', 195]], f: ['quick', 'processed'] },
  { id: 'kfc_spa_chicken_burger', name: '肯德基 黄金SPA鸡排堡', alias: 'kfc kendeji huangjin spa jipai chicken burger 黄金spa堡 鸡排堡', cat: 'chain', n: [303, 13.0, 17.1, 24.4, 1.2, 3.8, 620], s: [['一个', 153]], ...META_KFC_EST, note: '按公开称重拆解约 153g、465 kcal 的整堡倒算；门店鸡排、沙拉酱和面包实际份量会有差异', f: ['quick', 'fried', 'processed', 'est'] },
  { id: 'kfc_og_chicken', name: '肯德基 吮指原味鸡', alias: 'kfc shunzhiyuanweiji yuanweiji', cat: 'chain', n: [283, 22.2, 18.9, 7.8, 0.6, 0.6, 778], s: [['一块', 90]], f: ['quick', 'processed'] },
  { id: 'kfc_hot_bone_chicken', name: '肯德基 热辣香骨鸡', alias: 'kfc kendeji rela xiangguji 香骨鸡 热辣香鸡骨', cat: 'chain', n: [260, 18.9, 16.1, 9.8, 0.5, 0.8, 700], s: [['三块', 87], ['一块', 29], ['十五块', 435]], ...META_KFC_EST, note: '公开整份数据为 3 块约 87g、226 kcal；本条按整份营养倒算，带骨大小、裹粉和吸油量会造成波动', f: ['quick', 'fried', 'processed', 'est'] },
  { id: 'kfc_hot_drumette_xl', name: '肯德基 特大号热辣翅根', alias: 'kfc kendeji teda rela chigen 香辣翅根 热辣翅根 翅根 大翅根', cat: 'chain', n: [337, 19.4, 23.6, 12.8, 0.5, 1.0, 780], s: [['一只', 45], ['八只', 360]], ...META_KFC_EST, note: '限时商品未公开完整营养表；单只按约 45g 成品及同类香辣鸡翅代表值估算，骨重与实际大小会影响结果', f: ['quick', 'fried', 'processed', 'est'] },
  { id: 'kfc_no_wing', name: '肯德基 新奥尔良烤翅', alias: 'kfc kaochi 奥尔良烤翅 奥尔良翅根 奥尔良翅中', cat: 'chain', n: [244, 22.2, 14.4, 6.7, 0.0, 4.4, 733], s: [['一只', 45]], f: ['quick', 'processed'] },
  { id: 'kfc_hot_wing', name: '肯德基 香辣鸡翅', alias: 'kfc xianglajichi 香辣翅根 香辣翅中 普通翅根', cat: 'chain', n: [333, 20.0, 22.2, 13.3, 0.7, 1.1, 778], s: [['一只', 45]], f: ['quick', 'processed'] },
  { id: 'kfc_nuggets', name: '肯德基 黄金鸡块（原上校鸡块）', alias: 'kfc huangjinjikuai shangxiaojikuai 黄金鸡块 上校鸡块 chicken nuggets', cat: 'chain', n: [307, 17.3, 17.3, 20.0, 0.8, 0.7, 733], s: [['五块', 75]], f: ['quick', 'processed'] },
  { id: 'kfc_popcorn_chicken', name: '肯德基 劲爆鸡米花', alias: 'kfc kendeji jinbao jimihua popcorn chicken 鸡米花', cat: 'chain', n: [304, 18.4, 18.9, 16.2, 0.5, 0.8, 895], s: [['一份', 100]], ...META_KFC_EST, note: '每 100g 宏量营养参考《中国食物成分表》的肯德基条目；包装份量、裹粉和吸油量可能变化', f: ['quick', 'fried', 'processed', 'est'] },
  { id: 'kfc_fries', name: '肯德基 薯条（中）', alias: 'kfc shutiao', cat: 'chain', n: [322, 4.3, 14.8, 42.6, 3.5, 0.4, 261], s: [['中份', 115]], f: ['quick', 'processed'] },
  { id: 'kfc_sweet_corn', name: '肯德基 香甜粟米棒', alias: 'kfc kendeji xiangtian sumibang 玉米棒 甜玉米 粟米', cat: 'chain', n: [126, 3.2, 0.2, 28.6, 2.5, 6.0, 12], s: [['一份', 90]], nfs: 6.0, ...META_KFC_EST, note: '营养参考《中国食物成分表》的肯德基甜玉米籽粒代表值；总糖主要来自完整玉米，不计入游离糖', f: ['quick', 'est'] },
  { id: 'kfc_egg_tart', name: '肯德基 葡式蛋挞', alias: 'kfc danta putashidanta', cat: 'chain', n: [350, 5.8, 20.0, 36.7, 0.7, 20.0, 167], s: [['一个', 60]], f: ['quick', 'processed'] },
  { id: 'kfc_cone', name: '肯德基 脆皮甜筒', alias: 'kfc kendeji cuipi tiantong 甜筒 冰淇淋', cat: 'chain', n: [134, 5.1, 3.3, 20.9, 0.5, 17.0, 80], s: [['一个', 112]], ...META_KFC_EST, note: '按公开品牌条目约 150 kcal/个倒算；门店挤出的冰淇淋重量会有差异', f: ['quick', 'processed', 'est'] },
  { id: 'kfc_9fruit_juice', name: '肯德基 九珍果汁', alias: 'kfc kendeji jiuzhen guozhi 9珍果汁 九珍果汁饮料', cat: 'chain', n: [31, 0.1, 0.3, 6.9, 0.0, 6.5, 5], s: [['一杯 500ml', 500]], nfs: 0, ...META_KFC_DRINK_EST, note: '公开品牌条目为 500ml 约 156 kcal；属于复合果汁饮料，果汁和浓缩果汁中的糖按游离糖计算', f: ['quick', 'sweetdrink', 'processed', 'est'] },
  { id: 'kfc_pingpong_lemon_ice', name: '肯德基 乒乒乓乓冰球杯（柠檬味）', alias: 'kfc kendeji pingpingpangpang bingqiu bei lemon 冰球 冰球杯 柠檬冰球 孙颖莎冰球杯', cat: 'chain', n: [36, 0.0, 0.0, 9.0, 0.0, 8.5, 5], s: [['一杯（约）', 300]], nfs: 0, ...META_KFC_EST, note: '官方未公开完整营养表和净含量，按 300g 柠檬味甜冰约 108 kcal 估算；本条只计杯内冰球，另加牛奶、汽水或其他饮料必须单独记录', f: ['quick', 'sweetdrink', 'processed', 'est'] },
  { id: 'kfc_drumstick_icecream', name: '肯德基 黄金大鸡腿形雪糕', alias: 'kfc kendeji huangjin dajitui xuegao 鸡腿雪糕 大鸡腿冰淇淋', cat: 'chain', n: [300, 3.5, 15.0, 37.0, 1.0, 25.0, 70], s: [['一支', 75]], ...META_KFC_EST, note: '限时商品未公开完整营养表；按公开约 225 kcal/支及巧克力脆皮香草雪糕同类配方估算', f: ['quick', 'processed', 'est'] },
  { id: 'kfc_twister', name: '肯德基 老北京鸡肉卷', alias: 'kfc laobeijingjirouzhuan', cat: 'chain', n: [245, 11.0, 11.0, 25.5, 1.2, 3.0, 550], s: [['一个', 200]], f: ['quick', 'processed'] },
  { id: 'kfc_mash', name: '肯德基 醇香土豆泥', alias: 'kfc tudouni', cat: 'chain', n: [83, 1.7, 2.5, 13.3, 1.0, 0.8, 417], s: [['一份', 120]], f: ['quick', 'processed'] },
  { id: 'kfc_veg_soup', name: '肯德基 芙蓉鲜蔬汤', alias: 'kfc furongtang', cat: 'chain', n: [15, 0.8, 0.5, 2.0, 0.3, 0.5, 300], s: [['一份', 200]], f: ['quick', 'processed'] },
  { id: 'mcd_bigmac', name: '麦当劳 巨无霸', alias: 'mcdonalds maidanglao juwuba bigmac', cat: 'chain', n: [238, 12.1, 12.1, 20.0, 1.4, 3.7, 442], s: [['一个', 215]], f: ['quick', 'processed'] },
  { id: 'mcd_spicy_chicken', name: '麦当劳 麦辣鸡腿堡', alias: 'mcd mailajitui', cat: 'chain', n: [248, 12.0, 12.0, 22.5, 1.2, 3.5, 500], s: [['一个', 200]], f: ['quick', 'processed'] },
  { id: 'mcd_double_cheese', name: '麦当劳 双层吉士汉堡', alias: 'mcd shuangcengjishi', cat: 'chain', n: [265, 15.2, 13.3, 20.6, 1.2, 4.2, 636], s: [['一个', 165]], f: ['quick', 'processed'] },
  { id: 'mcd_mcchicken', name: '麦当劳 麦香鸡', alias: 'mcd maixiangji', cat: 'chain', n: [273, 12.3, 12.3, 28.5, 1.5, 3.8, 538], s: [['一个', 130]], f: ['quick', 'processed'] },
  { id: 'mcd_grilled_chicken', name: '麦当劳 板烧鸡腿堡', alias: 'mcd banshaojitui', cat: 'chain', n: [210, 13.3, 7.6, 21.4, 1.2, 3.8, 524], s: [['一个', 210]], f: ['quick', 'processed'] },
  { id: 'mcd_nuggets', name: '麦当劳 麦乐鸡（5块）', alias: 'mcd mailejikuai nuggets', cat: 'chain', n: [258, 14.7, 15.8, 14.7, 0.8, 0.5, 505], s: [['五块', 95]], f: ['quick', 'processed'] },
  { id: 'mcd_fries', name: '麦当劳 薯条（中）', alias: 'mcd shutiao', cat: 'chain', n: [291, 3.5, 13.9, 37.4, 3.5, 0.4, 217], s: [['中份', 115]], f: ['quick', 'processed'] },
  { id: 'mcd_mcflurry', name: '麦当劳 麦旋风', alias: 'mcd maixuanfeng mcflurry', cat: 'chain', n: [183, 4.4, 5.6, 28.9, 0.4, 24.4, 100], s: [['一份', 180]], f: ['quick', 'processed'] },
  { id: 'mcd_sausage_muffin', name: '麦当劳 猪柳蛋麦满分', alias: 'mcd maimanfen zhuliudan', cat: 'chain', n: [280, 12.7, 14.7, 24.0, 1.3, 2.7, 600], s: [['一个', 150]], f: ['quick', 'processed'] },
  { id: 'mcd_taro_pie', name: '麦当劳 香芋派', alias: 'mcd xiangyupai', cat: 'chain', n: [307, 4.0, 16.0, 37.3, 2.0, 16.0, 267], s: [['一个', 75]], f: ['quick', 'processed'] },
  { id: 'bk_whopper', name: '汉堡王 皇堡', alias: 'burgerking hanbaowang huangbao whopper', cat: 'chain', n: [222, 10.4, 12.2, 18.1, 1.1, 4.1, 370], s: [['一个', 270]], f: ['quick', 'processed'] },
  { id: 'bk_chicken', name: '汉堡王 香辣鸡腿堡', alias: 'burgerking hanbaowang', cat: 'chain', n: [248, 11.4, 12.4, 22.4, 1.2, 3.8, 476], s: [['一个', 210]], f: ['quick', 'processed', 'est'] },
  { id: 'dicos_drumstick', name: '德克士 脆皮手枪腿', alias: 'dicos dekeshi shouqiangtui', cat: 'chain', n: [250, 18.3, 15.0, 10.0, 0.5, 0.8, 583], s: [['一只', 120]], f: ['quick', 'processed', 'est'] },
  { id: 'dicos_burger', name: '德克士 香辣鸡腿堡', alias: 'dicos dekeshi', cat: 'chain', n: [254, 11.9, 11.9, 24.3, 1.4, 3.2, 514], s: [['一个', 185]], f: ['quick', 'processed', 'est'] },
  { id: 'tastien_spicy', name: '塔斯汀 香辣鸡腿堡', alias: 'tasiting tastien zhongguohanbao', cat: 'chain', n: [239, 12.2, 10.0, 25.6, 1.4, 3.3, 528], s: [['一个', 180]], f: ['quick', 'processed', 'est'] },
  { id: 'tastien_beef', name: '塔斯汀 麻辣嫩牛堡', alias: 'tasiting tastien', cat: 'chain', n: [237, 11.1, 10.5, 25.3, 1.3, 3.2, 526], s: [['一个', 190]], f: ['quick', 'processed', 'est'] },
  { id: 'tastien_duck', name: '塔斯汀 北京烤鸭堡', alias: 'tasiting tastien kaoyabao', cat: 'chain', n: [247, 10.5, 11.6, 25.3, 1.3, 4.2, 553], s: [['一个', 190]], f: ['quick', 'processed', 'est'] },
  { id: 'wallace_burger', name: '华莱士 全鸡堡', alias: 'hualaishi wallace', cat: 'chain', n: [240, 11.4, 10.9, 24.6, 1.1, 3.4, 514], s: [['一个', 175]], f: ['quick', 'processed', 'est'] },
  { id: 'ph_supreme', name: '必胜客 超级至尊比萨（1块）', alias: 'pizzahut bishengke zhizun', cat: 'chain', n: [250, 11.8, 10.9, 26.4, 1.8, 3.6, 564], s: [['一块', 110]], f: ['quick', 'processed'] },
  { id: 'ph_cheese_crust', name: '必胜客 芝心比萨（1块）', alias: 'pizzahut bishengke zhixin', cat: 'chain', n: [272, 12.0, 12.8, 27.2, 1.6, 4.0, 600], s: [['一块', 125]], f: ['quick', 'processed'] },
  { id: 'ph_durian', name: '必胜客 榴莲比萨（1块）', alias: 'pizzahut bishengke liulian', cat: 'chain', n: [264, 9.1, 10.0, 34.5, 1.8, 10.9, 436], s: [['一块', 110]], f: ['quick', 'processed', 'est'] },
  { id: 'ph_pasta', name: '必胜客 意式肉酱面', alias: 'pizzahut bishengke rouzjiangmian', cat: 'chain', n: [160, 6.3, 5.1, 22.3, 1.1, 2.6, 314], s: [['一份', 350]], f: ['quick', 'processed', 'est'] },
  { id: 'ph_wing', name: '必胜客 蜜汁烤翅', alias: 'pizzahut bishengke mizhikaochi', cat: 'chain', n: [267, 20.0, 15.6, 11.1, 0.0, 8.9, 778], s: [['一只', 45]], f: ['quick', 'processed', 'est'] },
  { id: 'subway_chicken', name: '赛百味 6寸鸡胸三明治', alias: 'subway saibaiwei', cat: 'chain', n: [141, 10.9, 2.3, 20.0, 1.8, 2.7, 364], s: [['一个', 220]], f: ['quick', 'processed'] },
  { id: 'subway_tuna', name: '赛百味 6寸金枪鱼三明治', alias: 'subway saibaiwei jinqiangyu', cat: 'chain', n: [205, 9.1, 10.0, 19.5, 1.8, 2.7, 341], s: [['一个', 220]], f: ['quick', 'processed'] },
  { id: 'laoxiangji_soup', name: '老乡鸡 肥西老母鸡汤', alias: 'laoxiangji feixilaomujitang', cat: 'chain', n: [32, 2.0, 2.2, 0.5, 0.0, 0.1, 200], s: [['一份', 400]], f: ['quick', 'processed', 'est'] },
  { id: 'laoxiangji_set', name: '老乡鸡 两菜一饭套餐', alias: 'laoxiangji taocan', cat: 'chain', n: [118, 4.7, 4.4, 14.5, 0.7, 1.1, 291], s: [['一份', 550]], f: ['quick', 'processed', 'est'] },
  { id: 'shaxian_dumpling', name: '沙县小吃 蒸饺（一两）', alias: 'shaxian zhengjiao', cat: 'chain', n: [208, 7.5, 8.3, 25.0, 1.0, 1.2, 433], s: [['一份', 120]], f: ['quick', 'processed', 'est'] },
  { id: 'shaxian_noodle', name: '沙县小吃 花生拌面', alias: 'shaxian banmian', cat: 'chain', n: [180, 4.8, 6.4, 25.2, 0.8, 1.6, 360], s: [['一份', 250]], f: ['quick', 'processed', 'est'] },
  { id: 'shaxian_stew', name: '沙县小吃 炖罐（排骨）', alias: 'shaxian dunguan', cat: 'chain', n: [57, 4.0, 3.7, 1.7, 0.1, 0.3, 214], s: [['一罐', 350]], f: ['quick', 'processed', 'est'] },
  { id: 'saizeriya_gratin', name: '萨莉亚 芝士焗饭', alias: 'saizeriya salia zhishijufan', cat: 'chain', n: [150, 5.0, 5.5, 20.0, 0.8, 1.5, 300], s: [['一份', 400]], f: ['quick', 'processed', 'est'] },
  { id: 'hefu_noodle', name: '和府捞面 招牌汤面', alias: 'hefulaomian tangmian', cat: 'chain', n: [91, 4.0, 2.2, 13.6, 0.7, 0.7, 327], s: [['一份', 550]], f: ['quick', 'processed', 'est'] },
  { id: 'yoshinoya_beef', name: '吉野家 牛肉饭（中碗）', alias: 'yoshinoya jiyejia niuroufan', cat: 'chain', n: [144, 4.9, 4.4, 21.1, 0.7, 2.7, 311], s: [['中碗', 450]], f: ['quick', 'processed', 'est'] },

  // ---------- 茶饮 / 咖啡连锁（营养按全糖录入，糖度由界面换算） ----------
  { id: 'tea_boba', name: '珍珠奶茶', alias: 'zhenzhunaicha bobo boba naicha', cat: 'chain', n: [94, 1.2, 2.8, 16.0, 0.2, 9.6, 24], s: [['中杯 500ml', 500]], sf: 1.2, nfs: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_milk_plain', name: '奶茶（不加料）', alias: 'naicha', cat: 'chain', n: [66, 1.0, 1.6, 11.6, 0.0, 7.2, 22], s: [['中杯 500ml', 500]], sf: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_milk_green', name: '奶绿', alias: 'nailv naicha', cat: 'chain', n: [68, 1.0, 2.0, 11.2, 0.0, 6.8, 22], s: [['中杯 500ml', 500]], sf: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_cheese_top', name: '芝士奶盖茶', alias: 'zhishinaigai naigaicha', cat: 'chain', n: [64, 1.4, 3.4, 7.0, 0.0, 5.6, 28], s: [['中杯 500ml', 500]], sf: 1.8, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_brownsugar_boba', name: '黑糖珍珠鲜奶', alias: 'heitangzhenzhuxiannai heitang', cat: 'chain', n: [96, 1.8, 3.0, 15.2, 0.2, 10.4, 26], s: [['中杯 500ml', 500]], sf: 2.0, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'tea_grass_jelly', name: '烧仙草', alias: 'shaoxiancao', cat: 'chain', n: [84, 1.2, 2.4, 14.4, 0.5, 8.0, 24], s: [['中杯 500ml', 500]], sf: 2.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_taro_boba', name: '芋圆奶茶', alias: 'yuyuannaicha', cat: 'chain', n: [90, 1.2, 2.6, 15.2, 0.3, 8.4, 24], s: [['中杯 500ml', 500]], sf: 2.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_fruit', name: '水果茶', alias: 'shuiguocha guocha', cat: 'chain', n: [46, 0.2, 0.1, 11.2, 0.3, 10.0, 4], s: [['中杯 500ml', 500]], sf: 2.8, nfs: 0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_lemon', name: '柠檬茶', alias: 'ningmengcha', cat: 'chain', n: [40, 0.1, 0.0, 9.8, 0.1, 9.0, 3], s: [['中杯 500ml', 500]], sf: 0.8, nfs: 0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'tea_yogurt_fruit', name: '水果酸奶昔', alias: 'suannaixi', cat: 'chain', n: [76, 1.6, 1.8, 13.2, 0.3, 10.4, 30], s: [['中杯 500ml', 500]], sf: 2.8, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'tea_pure', name: '纯茶（乌龙/茉莉）', alias: 'chuncha wulong molihua', cat: 'chain', n: [2, 0.0, 0.0, 0.3, 0.0, 0.0, 3], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'caffeinated'] },
  { id: 'mixue_boba', name: '蜜雪冰城 珍珠奶茶', alias: 'mixue miyuebingcheng zhenzhunaicha', cat: 'chain', n: [84, 1.0, 2.4, 14.6, 0.2, 8.4, 22], s: [['中杯 500ml', 500]], sf: 1.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'mixue_lemon', name: '蜜雪冰城 冰鲜柠檬水', alias: 'mixue ningmengshui', cat: 'chain', n: [36, 0.1, 0.0, 9.0, 0.1, 8.4, 2], s: [['大杯 500ml', 500]], sf: 0.4, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'mixue_icecream_tea', name: '蜜雪冰城 冰淇淋红茶', alias: 'mixue bingqilinhongcha', cat: 'chain', n: [56, 0.6, 1.4, 10.2, 0.0, 8.8, 16], s: [['中杯 500ml', 500]], sf: 2.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'mixue_shake', name: '蜜雪冰城 摇摇奶昔', alias: 'mixue yaoyaonaixi', cat: 'chain', n: [78, 1.2, 2.2, 13.2, 0.1, 10.0, 24], s: [['中杯 500ml', 500]], sf: 2.2, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'heytea_grape', name: '喜茶 多肉葡萄', alias: 'heytea xicha duoroputao', cat: 'chain', n: [60, 0.4, 1.0, 12.4, 0.2, 10.8, 12], s: [['中杯 500ml', 500]], sf: 3.2, nfs: 0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'heytea_cheese_grape', name: '喜茶 芝芝葡萄', alias: 'heytea xicha zhizhiputao', cat: 'chain', n: [66, 1.2, 2.6, 9.6, 0.2, 8.0, 26], s: [['中杯 500ml', 500]], sf: 2.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'heytea_berry', name: '喜茶 芝芝莓莓', alias: 'heytea xicha zhizhimeimei', cat: 'chain', n: [64, 1.2, 2.6, 9.0, 0.3, 7.6, 26], s: [['中杯 500ml', 500]], sf: 2.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'heytea_brownsugar', name: '喜茶 烤黑糖波波牛乳', alias: 'heytea xicha kaoheitangbobo', cat: 'chain', n: [94, 1.8, 3.0, 14.8, 0.2, 10.0, 26], s: [['中杯 500ml', 500]], sf: 2.2, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'naixue_strawberry', name: '奈雪的茶 霸气芝士草莓', alias: 'naixue naixuedecha baqizhishicaomei', cat: 'chain', n: [57, 1.2, 2.0, 8.3, 0.3, 7.0, 23], s: [['大杯 600ml', 600]], sf: 2.3, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'naixue_treasure', name: '奈雪的茶 宝藏茶', alias: 'naixue baozangcha', cat: 'chain', n: [50, 0.5, 0.8, 10.3, 0.2, 8.0, 10], s: [['大杯 600ml', 600]], sf: 2.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'chabaidao_mango', name: '茶百道 杨枝甘露', alias: 'chabaidao yangzhiganlu', cat: 'chain', n: [70, 0.6, 1.8, 12.6, 0.3, 10.4, 16], s: [['中杯 500ml', 500]], sf: 3.6, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'chabaidao_taro', name: '茶百道 芋圆奶茶', alias: 'chabaidao yuyuannaicha', cat: 'chain', n: [90, 1.2, 2.6, 15.2, 0.3, 8.4, 24], s: [['中杯 500ml', 500]], sf: 2.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'chabaidao_osmanthus', name: '茶百道 桂花乌龙奶茶', alias: 'chabaidao guihuawulong', cat: 'chain', n: [76, 1.2, 2.4, 12.0, 0.1, 6.8, 24], s: [['中杯 500ml', 500]], sf: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'guming_grape', name: '古茗 超A芝士葡萄', alias: 'guming chaoAzhishiputao', cat: 'chain', n: [64, 1.2, 2.4, 9.4, 0.2, 7.6, 26], s: [['中杯 500ml', 500]], sf: 2.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'guming_jasmine', name: '古茗 云雾茉莉奶绿', alias: 'guming yunwumolinailv', cat: 'chain', n: [72, 1.0, 2.2, 11.6, 0.1, 6.4, 23], s: [['中杯 500ml', 500]], sf: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'hushang_purple_rice', name: '沪上阿姨 血糯米奶茶', alias: 'hushangayi xuenumi', cat: 'chain', n: [92, 1.4, 2.6, 15.4, 0.4, 8.0, 24], s: [['中杯 500ml', 500]], sf: 2.4, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'yidiandian_boba', name: '一点点 波霸奶茶', alias: 'yidiandian bobanaicha', cat: 'chain', n: [88, 1.0, 2.6, 15.2, 0.2, 8.8, 23], s: [['中杯 500ml', 500]], sf: 1.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'yidiandian_sijinaiqing', name: '一点点 四季奶青', alias: 'yidiandian sijinaiqing', cat: 'chain', n: [66, 1.0, 2.2, 10.4, 0.0, 6.0, 22], s: [['中杯 500ml', 500]], sf: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'coco_boba', name: 'CoCo都可 珍珠奶茶', alias: 'coco dukezhenzhunaicha', cat: 'chain', n: [86, 1.0, 2.6, 14.6, 0.2, 8.4, 23], s: [['中杯 500ml', 500]], sf: 1.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'coco_qingke', name: 'CoCo都可 青稞奶茶', alias: 'coco qingkenaicha', cat: 'chain', n: [84, 1.2, 2.4, 14.2, 0.4, 7.6, 23], s: [['中杯 500ml', 500]], sf: 1.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'shuyi_grassjelly', name: '书亦烧仙草 招牌烧仙草', alias: 'shuyi shaoxiancao', cat: 'chain', n: [86, 1.2, 2.4, 14.8, 0.5, 8.0, 24], s: [['中杯 500ml', 500]], sf: 2.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'yihetang_kaonai', name: '益禾堂 烤奶', alias: 'yihetang kaonai', cat: 'chain', n: [70, 1.2, 2.2, 11.0, 0.0, 6.0, 24], s: [['中杯 500ml', 500]], sf: 1.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  /*
   * 洪都大拇指：南昌本地茶饮连锁。招牌是「椰椰」那一条线 ——
   * 鲜果打底 + 椰乳，上面盖一球冰淇淋。
   *
   * 这条线的糖有两个来源，无糖档只能去掉其中一个：糖浆能不加，
   * 但冰淇淋和椰乳自带的糖去不掉，所以 sf 比一般奶茶高不少。
   * 其中只有奶来的乳糖不算 WHO 游离糖（nfs）；西瓜汁、葡萄汁这些
   * 即使来自水果也算游离糖，不往 nfs 里放。
   *
   * 鲜果椰乳那几款不含茶底，不打 caffeinated。
   */
  { id: 'hddmz_watermelon_coco', name: '洪都大拇指 冰淇淋西瓜椰椰', alias: 'hongdu damuzhi dabumu bingqilin xigua yeye 大拇指 西瓜椰椰 冰淇淋西瓜', cat: 'chain', n: [62, 0.7, 2.2, 10.0, 0.2, 9.0, 18], s: [['中杯 500ml', 500]], sf: 4.2, nfs: 0.6, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'hddmz_grape_coco', name: '洪都大拇指 冰淇淋葡萄椰椰', alias: 'hongdu damuzhi bingqilin putao yeye 葡萄椰椰', cat: 'chain', n: [66, 0.7, 2.2, 11.0, 0.2, 10.0, 18], s: [['中杯 500ml', 500]], sf: 4.6, nfs: 0.6, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'hddmz_mango_coco', name: '洪都大拇指 冰淇淋芒果椰椰', alias: 'hongdu damuzhi bingqilin mangguo yeye 芒果椰椰', cat: 'chain', n: [68, 0.8, 2.4, 11.0, 0.3, 9.8, 18], s: [['中杯 500ml', 500]], sf: 4.8, nfs: 0.6, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'hddmz_coco_milk_tea', name: '洪都大拇指 生椰奶茶', alias: 'hongdu damuzhi shengye naicha 椰椰奶茶', cat: 'chain', n: [72, 1.0, 2.6, 11.4, 0.0, 7.0, 22], s: [['中杯 500ml', 500]], sf: 1.6, nfs: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'hddmz_signature_milk_tea', name: '洪都大拇指 招牌奶茶', alias: 'hongdu damuzhi zhaopai naicha', cat: 'chain', n: [76, 1.1, 2.4, 12.4, 0.0, 7.4, 24], s: [['中杯 500ml', 500]], sf: 1.2, nfs: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'hddmz_boba', name: '洪都大拇指 珍珠奶茶', alias: 'hongdu damuzhi zhenzhu naicha', cat: 'chain', n: [88, 1.0, 2.5, 15.2, 0.2, 8.6, 23], s: [['中杯 500ml', 500]], sf: 1.2, nfs: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'hddmz_mango_sago', name: '洪都大拇指 杨枝甘露', alias: 'hongdu damuzhi yangzhi ganlu', cat: 'chain', n: [72, 0.7, 1.9, 12.8, 0.3, 10.6, 16], s: [['中杯 500ml', 500]], sf: 3.8, nfs: 0.5, f: ['quick', 'est', 'sweetdrink', 'tealevel'] },
  { id: 'hddmz_grass_jelly', name: '洪都大拇指 烧仙草', alias: 'hongdu damuzhi shao xiancao', cat: 'chain', n: [86, 1.2, 2.4, 15.0, 0.5, 8.0, 24], s: [['中杯 500ml', 500]], sf: 2.2, nfs: 1.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'hddmz_lemon_tea', name: '洪都大拇指 柠檬茶', alias: 'hongdu damuzhi ningmeng cha', cat: 'chain', n: [40, 0.1, 0.0, 9.8, 0.1, 9.0, 3], s: [['中杯 500ml', 500]], sf: 0.8, nfs: 0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'chayan_youlan', name: '茶颜悦色 幽兰拿铁', alias: 'chayanyuese youlannatie', cat: 'chain', n: [71, 1.5, 2.9, 9.6, 0.1, 5.8, 27], s: [['中杯 480ml', 480]], sf: 2.1, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'bawang_boya', name: '霸王茶姬 伯牙绝弦', alias: 'bawangchaji boyajuexian', cat: 'chain', n: [47, 1.3, 1.3, 7.4, 0.0, 6.0, 26], s: [['中杯 470ml', 470]], sf: 1.9, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'bawang_osmanthus', name: '霸王茶姬 桂馥兰香', alias: 'bawangchaji guifulanxiang', cat: 'chain', n: [45, 1.3, 1.3, 7.0, 0.0, 5.5, 26], s: [['中杯 470ml', 470]], sf: 1.9, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'sb_latte', name: '星巴克 拿铁', alias: 'starbucks xingbake natie', cat: 'chain', n: [54, 2.8, 2.8, 4.2, 0.0, 4.2, 37], s: [['中杯 355ml', 355]], f: ['quick', 'est', 'natsugar', 'caffeinated'] },
  { id: 'sb_mocha', name: '星巴克 摩卡', alias: 'starbucks xingbake moka', cat: 'chain', n: [85, 2.8, 3.4, 10.7, 0.3, 9.0, 39], s: [['中杯 355ml', 355]], sf: 4.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'sb_matcha_latte', name: '星巴克 抹茶拿铁', alias: 'starbucks xingbake mochanatie', cat: 'chain', n: [68, 2.8, 2.5, 8.7, 0.3, 7.9, 39], s: [['中杯 355ml', 355]], sf: 4.2, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'sb_frappuccino', name: '星巴克 星冰乐', alias: 'starbucks xingbingle', cat: 'chain', n: [85, 1.1, 3.1, 13.2, 0.0, 12.7, 51], s: [['中杯 355ml', 355]], sf: 3.4, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'luckin_coconut', name: '瑞幸 生椰拿铁', alias: 'luckin ruixing shengyenatie', cat: 'chain', n: [47, 1.1, 1.9, 6.2, 0.0, 5.5, 23], s: [['大杯 470ml', 470]], sf: 2.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'luckin_thick_milk', name: '瑞幸 厚乳拿铁', alias: 'luckin ruixing hourunatie', cat: 'chain', n: [51, 1.9, 2.3, 5.5, 0.0, 5.1, 30], s: [['大杯 470ml', 470]], sf: 3.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'luckin_velvet', name: '瑞幸 丝绒拿铁', alias: 'luckin ruixing sirongnatie', cat: 'chain', n: [53, 1.9, 2.3, 6.2, 0.0, 5.3, 30], s: [['大杯 470ml', 470]], sf: 3.0, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'luckin_cloud', name: '瑞幸 椰云拿铁', alias: 'luckin ruixing yeyunnatie', cat: 'chain', n: [57, 1.3, 2.6, 7.2, 0.0, 6.4, 26], s: [['大杯 470ml', 470]], sf: 2.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },
  { id: 'luckin_americano', name: '瑞幸 美式', alias: 'luckin ruixing meishi', cat: 'chain', n: [1, 0.1, 0.0, 0.2, 0.0, 0.0, 2], s: [['大杯 470ml', 470]], f: ['quick', 'est', 'caffeinated'] },
  { id: 'kudi_latte', name: '库迪 生椰拿铁', alias: 'kudi shengyenatie', cat: 'chain', n: [45, 1.1, 1.9, 6.0, 0.0, 5.3, 23], s: [['大杯 470ml', 470]], sf: 2.6, f: ['quick', 'est', 'sweetdrink', 'tealevel', 'caffeinated'] },

  // ---------- 补剂 / 冰品 / 品牌方便面 ----------
  { id: 'gainer_myprotein', name: 'Myprotein 增肌粉', alias: 'myprotein zengjifen weightgainer', cat: 'dairy', n: [386, 29.0, 5.7, 51.0, 2.0, 10.0, 120], s: [['一份', 100]], f: [] },
  { id: 'gainer_generic', name: '增肌粉（通用）', alias: 'zengjifen gainer', cat: 'dairy', n: [400, 26.7, 5.3, 60.0, 2.0, 16.0, 147], s: [['一勺', 75]], f: ['est'] },
  { id: 'creatine', name: '肌酸（一水）', alias: 'jisuan creatine', cat: 'other', n: [0, 0.0, 0.0, 0.0, 0.0, 0.0, 0], s: [['一勺', 5]], f: [] },
  { id: 'bcaa', name: '支链氨基酸 BCAA', alias: 'bcaa zhilianjianji', cat: 'other', n: [400, 100.0, 0.0, 0.0, 0.0, 0.0, 200], s: [['一份', 10]], f: ['est'] },
  { id: 'duck_leg_rice', name: '鸭腿饭', alias: 'yatuifan luyatuifan', cat: 'dish', n: [156, 6.7, 5.6, 19.6, 0.6, 1.3, 289], s: [['一份', 450]], f: ['est'] },
  { id: 'roast_duck_leg', name: '卤鸭腿（单只）', alias: 'luyatui yatui', cat: 'meat', n: [189, 14.4, 13.9, 1.7, 0.0, 1.1, 500], s: [['一只去骨可食部', 120]], edibleRatio: 0.67, note: '份量按去骨可食部计；不同卤水配方的钠差异较大', f: ['est'] },
  { id: 'braised_duck', name: '酱鸭', alias: 'jiangya', cat: 'meat', n: [220, 16.0, 16.0, 2.7, 0.0, 2.0, 633], s: [['一份', 150]], f: ['est'] },
  { id: 'wangwang_bing', name: '旺旺 碎冰冰', alias: 'wangwang suibingbing bingbing', cat: 'snack', n: [75, 0.0, 0.0, 18.8, 0.0, 17.5, 12], s: [['一支', 80]], f: ['quick', 'processed', 'est'] },
  { id: 'cornetto', name: '和路雪 可爱多甜筒', alias: 'keaiduo cornetto tiantong', cat: 'snack', n: [313, 3.7, 16.4, 37.3, 0.7, 29.9, 90], s: [['一个', 67]], f: ['quick', 'processed', 'est'] },
  { id: 'magnum', name: '和路雪 梦龙', alias: 'menglong magnum', cat: 'snack', n: [385, 4.6, 26.2, 32.3, 0.9, 29.2, 77], s: [['一支', 65]], f: ['quick', 'processed', 'est'] },
  { id: 'qiaolezi', name: '伊利 巧乐兹', alias: 'qiaolezi', cat: 'snack', n: [267, 3.3, 13.3, 33.3, 0.7, 26.7, 73], s: [['一支', 75]], f: ['quick', 'processed', 'est'] },
  { id: 'green_mood', name: '伊利 绿色心情', alias: 'lvsexinqing', cat: 'snack', n: [167, 1.9, 3.8, 32.1, 0.0, 28.2, 51], s: [['一支', 78]], f: ['quick', 'processed', 'est'] },
  { id: 'laobinggun', name: '老冰棍', alias: 'laobinggun bingun', cat: 'snack', n: [100, 0.4, 0.1, 24.3, 0.0, 22.9, 11], s: [['一支', 70]], f: ['quick', 'processed', 'est'] },
  { id: 'binggongchang', name: '蒙牛 冰工厂', alias: 'binggongchang', cat: 'snack', n: [93, 0.4, 0.1, 22.9, 0.0, 21.4, 14], s: [['一支', 70]], f: ['quick', 'processed', 'est'] },
  { id: 'qiancengxue', name: '蒙牛 千层雪', alias: 'qiancengxue', cat: 'snack', n: [240, 3.3, 12.0, 29.3, 0.4, 24.0, 67], s: [['一支', 75]], f: ['quick', 'processed', 'est'] },
  { id: 'suibian', name: '蒙牛 随变', alias: 'suibian', cat: 'snack', n: [267, 3.3, 14.7, 30.7, 0.7, 24.0, 73], s: [['一支', 75]], f: ['quick', 'processed', 'est'] },
  { id: 'qiaocuibang', name: '伊利 巧脆棒', alias: 'qiaocuibang', cat: 'snack', n: [279, 3.7, 16.2, 29.4, 0.6, 23.5, 74], s: [['一支', 68]], f: ['quick', 'processed', 'est'] },
  { id: 'guangming_lenggou', name: '光明 冷狗', alias: 'lenggou guangming', cat: 'snack', n: [267, 4.2, 15.0, 28.3, 0.0, 23.3, 75], s: [['一支', 60]], f: ['quick', 'processed', 'est'] },
  { id: 'bayi_icecream', name: '八喜 冰淇淋', alias: 'baxi bayi icecream', cat: 'snack', n: [240, 4.0, 14.0, 25.0, 0.0, 22.0, 60], s: [['一杯', 100]], f: ['quick', 'processed', 'est'] },
  { id: 'haagen_mini', name: '哈根达斯 迷你杯', alias: 'haagendazs hagendasi', cat: 'snack', n: [284, 4.9, 18.5, 24.7, 0.6, 22.2, 68], s: [['一杯', 81]], f: ['quick', 'processed'] },
  { id: 'zhongxuegao', name: '钟薛高 雪糕', alias: 'zhongxuegao', cat: 'snack', n: [244, 3.8, 14.1, 25.6, 0.4, 21.8, 64], s: [['一片', 78]], f: ['quick', 'processed', 'est'] },
  { id: 'mixue_sundae', name: '蜜雪冰城 圣代', alias: 'mixue shengdai', cat: 'snack', n: [183, 3.3, 5.8, 29.2, 0.2, 25.0, 67], s: [['一份', 120]], f: ['quick', 'processed', 'est'] },
  { id: 'mcd_sundae', name: '麦当劳 圣代', alias: 'mcd shengdai', cat: 'snack', n: [166, 3.4, 4.1, 29.0, 0.0, 24.8, 62], s: [['一份', 145]], f: ['quick', 'processed'] },
  { id: 'kfc_sundae', name: '肯德基 圣代', alias: 'kfc shengdai', cat: 'snack', n: [164, 2.9, 4.3, 28.6, 0.0, 24.3, 61], s: [['一份', 140]], f: ['quick', 'processed', 'est'] },
  { id: 'ksf_hongshao', name: '康师傅 红烧牛肉面', alias: 'kangshifu hongshaoniuroumian', cat: 'staple', n: [476, 8.7, 19.4, 64.1, 1.9, 4.9, 1845], s: [['一袋', 103]], f: ['quick', 'fried', 'refined', 'processed', 'instant'] },
  { id: 'ksf_hongshao_cup', name: '康师傅 红烧牛肉面（桶）', alias: 'kangshifu hongshaotong', cat: 'staple', n: [476, 9.0, 19.0, 64.8, 1.9, 4.8, 1857], s: [['一桶', 105]], f: ['quick', 'fried', 'refined', 'processed', 'instant'] },
  { id: 'ksf_xianglaniurou', name: '康师傅 香辣牛肉面', alias: 'kangshifu xianglaniurou', cat: 'staple', n: [471, 8.7, 19.4, 63.1, 1.9, 4.9, 1796], s: [['一袋', 103]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'ksf_laotan', name: '康师傅 老坛酸菜牛肉面', alias: 'kangshifu laotansuancai', cat: 'staple', n: [455, 8.2, 19.1, 60.0, 1.8, 4.5, 1909], s: [['一袋', 110]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'tongyi_laotan', name: '统一 老坛酸菜牛肉面', alias: 'tongyi laotansuancai', cat: 'staple', n: [433, 7.6, 17.6, 58.8, 1.7, 5.0, 1933], s: [['一袋', 119]], f: ['quick', 'fried', 'refined', 'processed', 'instant'] },
  { id: 'tongyi_tangdaren', name: '统一 汤达人 日式豚骨', alias: 'tongyi tangdaren tungu', cat: 'staple', n: [398, 8.5, 14.4, 57.6, 2.1, 5.1, 1483], s: [['一桶', 118]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'tongyi_hongshao', name: '统一 红烧牛肉面', alias: 'tongyi hongshaoniurou', cat: 'staple', n: [454, 8.3, 18.5, 61.1, 1.9, 4.6, 1759], s: [['一袋', 108]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'baixiang_xiangla', name: '白象 香辣牛肉面', alias: 'baixiang xianglaniurou', cat: 'staple', n: [444, 8.3, 18.5, 59.3, 1.9, 4.6, 1667], s: [['一袋', 108]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'baixiang_gutang', name: '白象 汤好喝', alias: 'baixiang tanghaohe', cat: 'staple', n: [420, 8.0, 16.1, 58.9, 1.8, 4.5, 1518], s: [['一桶', 112]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'jinmailang_laofanjia', name: '今麦郎 老范家（非油炸）', alias: 'jinmailang laofanjia feiyouzha', cat: 'staple', n: [333, 9.5, 3.8, 66.7, 2.9, 3.8, 1429], s: [['一份', 105]], f: ['quick', 'refined', 'processed', 'est', 'instant'] },
  { id: 'jinmailang_hongshao', name: '今麦郎 红烧牛肉面', alias: 'jinmailang hongshao', cat: 'staple', n: [457, 8.6, 18.1, 62.9, 1.9, 4.8, 1762], s: [['一袋', 105]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'nissin_demae', name: '出前一丁 麻油味', alias: 'chuqianyiding demae nissin', cat: 'staple', n: [450, 9.0, 19.0, 60.0, 2.0, 3.0, 1600], s: [['一包', 100]], f: ['quick', 'fried', 'refined', 'processed', 'instant'] },
  { id: 'nissin_cupnoodle', name: '日清 合味道 海鲜杯面', alias: 'heweidao cupnoodle nissin', cat: 'staple', n: [467, 9.3, 18.7, 64.0, 2.0, 5.3, 1800], s: [['一杯', 75]], f: ['quick', 'fried', 'refined', 'processed', 'instant'] },
  { id: 'nongshim_shin', name: '农心 辛拉面', alias: 'xinlamian shinramyun nongshim', cat: 'staple', n: [417, 8.3, 13.3, 65.8, 2.5, 3.3, 1492], s: [['一包', 120]], f: ['quick', 'fried', 'refined', 'processed', 'instant'] },
  { id: 'wugu_daochang', name: '五谷道场 非油炸面', alias: 'wugudaochang feiyouzha', cat: 'staple', n: [340, 10.0, 3.0, 68.0, 3.0, 3.0, 1400], s: [['一份', 100]], f: ['quick', 'refined', 'processed', 'est', 'instant'] },
  { id: 'lamian_shuo', name: '拉面说 日式豚骨拉面', alias: 'lamianshuo', cat: 'staple', n: [188, 6.7, 5.8, 26.7, 1.2, 2.1, 792], s: [['一份', 240]], f: ['quick', 'refined', 'processed', 'est', 'instant'] },
  { id: 'ksf_bowl_noodle', name: '康师傅 面霸/大食桶', alias: 'kangshifu mianba dashitong', cat: 'staple', n: [462, 9.1, 18.2, 64.3, 2.1, 4.2, 1748], s: [['一桶', 143]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'suanlafen_bag', name: '嗨吃家 酸辣粉（桶装）', alias: 'haichijia suanlafen', cat: 'staple', n: [311, 4.4, 7.4, 56.3, 1.5, 4.4, 1407], s: [['一桶', 135]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },
  { id: 'luosifen_bag', name: '螺蛳粉（袋装）', alias: 'luosifen daizhuang', cat: 'staple', n: [160, 3.7, 4.7, 26.0, 1.3, 1.7, 700], s: [['一袋', 300]], f: ['quick', 'fried', 'refined', 'processed', 'est', 'instant'] },

  // ---------- 2026 中国常见食物补充（通用配方均明确标 est） ----------
  { id: 'millet_rice', name: '小米饭', alias: 'xiaomifan millet rice', cat: 'staple', n: [114, 3.1, 1.0, 23.8, 1.2, 0.1, 2], s: [['小碗', 150], ['中碗', 200]], ...META_RECIPE_COOKED, f: ['whole', 'breakfast', 'est'] },
  { id: 'mixed_grain_rice', name: '杂粮饭', alias: 'zaliangfan mixed grain rice', cat: 'staple', n: [120, 3.2, 1.1, 23.8, 2.0, 0.4, 4], s: [['小碗', 150], ['中碗', 200]], ...META_RECIPE_COOKED, f: ['whole', 'est'] },
  { id: 'eight_treasure_congee', name: '八宝粥（无额外糖）', alias: 'babaozhou eight treasure congee', cat: 'staple', n: [72, 2.3, 0.6, 14.5, 1.7, 1.5, 8], s: [['一碗', 300]], ...META_RECIPE_COOKED, f: ['whole', 'breakfast', 'est'] },
  { id: 'cornmeal_congee', name: '玉米面粥', alias: 'yumimianzhou cornmeal congee', cat: 'staple', n: [45, 1.2, 0.4, 9.2, 0.9, 0.3, 2], s: [['一碗', 300]], ...META_RECIPE_COOKED, f: ['whole', 'breakfast', 'est'] },
  { id: 'scallion_pancake', name: '葱油饼', alias: 'congyoubing scallion pancake', cat: 'staple', n: [320, 7.0, 16.0, 36.0, 1.5, 1.5, 650], s: [['一张', 100]], ...META_RECIPE_READY, f: ['fried', 'refined', 'breakfast', 'est'] },
  { id: 'fagao', name: '发糕', alias: 'fagao steamed sponge cake', cat: 'staple', n: [230, 5.5, 1.0, 50.0, 1.2, 10.0, 180], s: [['一块', 80]], ...META_RECIPE_READY, f: ['refined', 'breakfast', 'est'] },
  { id: 'cifantuan', name: '粢饭团', alias: 'cifantuan rice roll', cat: 'staple', n: [210, 5.5, 6.5, 32.0, 1.0, 2.0, 450], s: [['一个', 220]], ...META_RECIPE_READY, f: ['breakfast', 'est'] },
  { id: 'hulatang', name: '胡辣汤', alias: 'hulatang pepper soup', cat: 'dish', n: [45, 2.6, 2.0, 4.0, 0.6, 0.8, 520], s: [['一碗', 350]], ...META_RECIPE_READY, note: '按整碗汤汁全部食用估算', f: ['breakfast', 'est'] },
  { id: 'chongqing_noodle', name: '重庆小面', alias: 'chongqingxiaomian', cat: 'dish', n: [165, 5.0, 7.0, 22.0, 1.0, 1.5, 650], s: [['一碗', 450]], ...META_RECIPE_READY, note: '按面、浇头及约一半汤汁食用估算', f: ['refined', 'est'] },
  { id: 'henan_huimian', name: '河南烩面', alias: 'henanhuimian', cat: 'dish', n: [120, 6.0, 3.5, 16.0, 1.0, 1.0, 620], s: [['一碗', 550]], ...META_RECIPE_READY, note: '按面、浇头及约一半汤汁食用估算', f: ['refined', 'est'] },
  { id: 'guilin_rice_noodle', name: '桂林米粉', alias: 'guilinmifen', cat: 'dish', n: [125, 6.0, 3.5, 18.0, 0.8, 1.2, 650], s: [['一碗', 500]], ...META_RECIPE_READY, note: '按米粉、配菜及约一半卤汤食用估算', f: ['refined', 'est'] },
  { id: 'cross_bridge_rice_noodle', name: '过桥米线', alias: 'guoqiaomixian yunnan', cat: 'dish', n: [105, 5.5, 3.0, 15.0, 0.8, 1.0, 550], s: [['一碗', 600]], ...META_RECIPE_READY, note: '按米线、配料及约一半汤汁食用估算', f: ['refined', 'est'] },

  { id: 'pickled_fish', name: '酸菜鱼', alias: 'suancaiyu pickled fish', cat: 'dish', n: [145, 13.0, 8.5, 3.0, 1.0, 1.5, 950], s: [['一份可食部', 400]], ...META_RECIPE_READY, note: '按鱼肉、酸菜并摄入约四分之一汤汁估算', f: ['est'] },
  { id: 'maoxuewang', name: '毛血旺', alias: 'maoxuewang', cat: 'dish', n: [165, 10.0, 12.0, 5.0, 1.0, 1.5, 1200], s: [['一份可食部', 400]], ...META_RECIPE_READY, note: '按固形配料并摄入约四分之一红油汤汁估算', f: ['est'] },
  { id: 'chopped_pepper_fish_head', name: '剁椒鱼头', alias: 'duojiaoyutou', cat: 'dish', n: [155, 14.0, 10.0, 3.0, 0.8, 1.0, 1100], s: [['一份可食部', 350]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'tomato_beef_brisket', name: '番茄炖牛腩', alias: 'fanqiedunniunan tomato beef', cat: 'dish', n: [145, 10.0, 8.0, 7.0, 1.0, 3.0, 550], s: [['一份', 300]], ...META_RECIPE_READY, note: '按固形食材并摄入少量炖汁估算', f: ['est'] },
  { id: 'mushu_pork', name: '木须肉', alias: 'muxurou', cat: 'dish', n: [150, 10.0, 10.0, 5.0, 1.0, 2.0, 600], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'beijing_sauce_pork', name: '京酱肉丝', alias: 'jingjiangrousi', cat: 'dish', n: [210, 15.0, 12.0, 12.0, 0.5, 8.0, 800], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'garlic_sprout_pork', name: '蒜薹炒肉', alias: 'suantaichaorou', cat: 'dish', n: [170, 9.0, 12.0, 7.0, 1.5, 2.5, 650], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'zucchini_egg', name: '西葫芦炒蛋', alias: 'xihuluchaodan', cat: 'dish', n: [110, 6.0, 8.0, 4.0, 1.0, 2.0, 450], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'yuxiang_eggplant', name: '鱼香茄子', alias: 'yuxiangqiezi', cat: 'dish', n: [180, 3.0, 14.0, 12.0, 2.2, 6.0, 750], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'char_siu', name: '叉烧', alias: 'chashao char siu', cat: 'meat', n: [290, 23.0, 16.0, 15.0, 0, 10.0, 1000], s: [['一份', 100]], ...META_RECIPE_READY, f: ['processed', 'est'] },
  { id: 'roast_goose', name: '烧鹅（带皮）', alias: 'shaoe roast goose', cat: 'meat', n: [340, 18.0, 28.0, 5.0, 0, 2.0, 650], s: [['一份可食部', 100]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'salted_duck_nanjing', name: '南京盐水鸭', alias: 'nanjing yanshuiya', cat: 'meat', n: [230, 17.0, 17.0, 2.0, 0, 1.0, 1000], s: [['一份可食部', 150]], ...META_RECIPE_READY, f: ['processed', 'est'] },

  { id: 'pork_trotter_braised', name: '卤猪蹄', alias: 'luzhuti zhutizi pork trotter', cat: 'meat', n: [260, 23.0, 18.0, 3.0, 0, 1.5, 650], s: [['一份可食部', 150]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_intestine_cooked', name: '猪大肠（熟，未调味）', alias: 'zhudachang pork intestine', cat: 'meat', n: [196, 6.9, 18.7, 0, 0, 0, 116], s: [['一份可食部', 100]], ...META_CNFCT_COOKED, f: [] },
  { id: 'duck_gizzard', name: '鸭胗（生）', alias: 'yazhen duck gizzard', cat: 'meat', n: [118, 19.0, 3.0, 2.0, 0, 0, 70], s: [['一份可食部', 100]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'duck_egg_boiled', name: '鸭蛋（煮）', alias: 'yadan boiled duck egg', cat: 'egg', n: [180, 12.6, 13.0, 3.1, 0, 0.5, 146], s: [['一个可食部', 65]], ...META_CNFCT_COOKED, f: ['quick'] },
  { id: 'mock_chicken', name: '素鸡', alias: 'suji mock chicken', cat: 'soy', n: [194, 16.5, 12.5, 4.2, 0.9, 0.6, 500], s: [['一份', 100]], ...META_RECIPE_READY, f: ['processed', 'est'] },
  { id: 'fermented_tofu', name: '腐乳', alias: 'furu fermented tofu', cat: 'soy', n: [135, 11.3, 8.2, 5.1, 0.5, 1.2, 2800], s: [['一块', 10]], ...META_RECIPE_READY, f: ['processed', 'est'] },
  { id: 'yangmei', name: '杨梅', alias: 'yangmei waxberry', cat: 'fruit', n: [30, 0.8, 0.2, 6.7, 1.0, 5.7, 1], s: [['一份可食部', 150]], ...META_CNFCT_RAW, f: [] },
  { id: 'loquat', name: '枇杷', alias: 'pipa loquat', cat: 'fruit', n: [41, 0.8, 0.2, 9.3, 0.8, 7.0, 4], s: [['一份可食部', 150]], ...META_CNFCT_RAW, f: [] },

  // 曾被合并但营养差异明显的条目，拆开后搜索不再把它们当作同一种食物。
  { id: 'ham_sausage', name: '火腿肠', alias: 'huotuichang ham sausage', cat: 'meat', n: [212, 13.0, 16.0, 10.0, 0, 3.0, 900], s: [['一根', 50]], ...META_RECIPE_READY, f: ['processed', 'quick', 'est'] },
  { id: 'sole_fish', name: '龙利鱼（鳎目鱼）', alias: 'longliyu sole fish tamuyu', cat: 'seafood', n: [83, 17.7, 1.4, 0, 0, 0, 80], s: [['一片可食部', 150]], source: SOURCE_RECIPE, basis: '100g', state: 'raw', edibleRatio: 1, carbBasis: 'total', f: ['cook', 'est'] },
  { id: 'apricot_kernel', name: '甜杏仁（杏核仁）', alias: 'xingren tianxingren apricot kernel 杏核', cat: 'nut', n: [562, 22.0, 45.0, 23.0, 10.0, 4.0, 5], s: [['一小把', 20]], source: SOURCE_RECIPE, basis: '100g', state: 'raw', edibleRatio: 1, carbBasis: 'total', note: '不是巴旦木；按市售可食甜杏核仁代表值估算，苦杏仁不可直接替代', f: ['quick', 'est'] },
  { id: 'coconut_milk_unsweetened', name: '椰浆（无糖）', alias: 'yejiang coconut milk unsweetened', cat: 'drink', n: [200, 2.0, 20.0, 3.0, 0, 2.0, 15], s: [['半杯', 100]], ...META_RECIPE_READY, f: ['natsugar', 'est'] },

  // ---------- 中国常见食物（第二批：早餐、家常菜、豆制品、蔬果与地方点心） ----------
  // 下列通用餐馆/家庭配方均按成品 100g 估算；油盐、糖和汤汁会随做法显著变化，因此统一标 est。

  // 修复历史错配后，将原来被错误名称占用的四种食物以独立 id 补回。
  { id: 'oat_latte', name: '燕麦拿铁', alias: 'yanmai natie oat latte', cat: 'drink', n: [45, 1.0, 1.8, 6.5, 0.5, 5.0, 40], s: [['一杯', 350]], ...META_RECIPE_READY, note: '按无额外糖的燕麦饮咖啡代表配方；不同燕麦饮品牌糖和油脂差异较大', f: ['quick', 'est', 'caffeinated'] },
  { id: 'braised_prawns', name: '油焖大虾', alias: 'youmendaxia braised prawns', cat: 'dish', n: [148, 16.0, 8.0, 3.0, 0, 1.5, 700], s: [['一份可食部', 150]], ...META_RECIPE_READY, note: '营养与份量均按去壳后可食部计，不把虾壳重量计入', f: ['est'] },
  { id: 'youpo_noodle', name: '油泼面', alias: 'youpomian oil splash noodle', cat: 'staple', n: [225, 6.5, 9.5, 29.0, 1.2, 1.0, 700], s: [['一碗', 350]], ...META_RECIPE_READY, note: '按熟面、辣椒与热油拌匀后的整碗成品估算，无额外汤汁', f: ['refined', 'est'] },
  { id: 'shengjian_bao', name: '生煎包', alias: 'shengjianbao sheng jian bun', cat: 'staple', n: [255, 8.5, 12.0, 28.0, 1.0, 2.5, 520], s: [['一个', 45]], ...META_RECIPE_READY, f: ['fried', 'breakfast', 'est'] },

  // 将过去容易混为一项、但营养或用法差异明显的食物拆开。
  { id: 'chinese_sauerkraut', name: '东北酸菜', alias: 'dongbei suancai chinese sauerkraut', cat: 'veg', n: [22, 1.1, 0.2, 4.6, 1.6, 1.2, 900], s: [['一份', 80]], ...META_RECIPE_READY, note: '按盐渍白菜沥去部分卤水后的通用值估算，钠受浸泡和漂洗影响很大', f: ['processed', 'est'] },
  { id: 'beef_ball', name: '牛肉丸', alias: 'niurouwan beef ball chaoshan', cat: 'meat', n: [200, 15.0, 12.0, 10.0, 0, 1.5, 800], s: [['一个', 25]], ...META_RECIPE_READY, note: '非特定品牌的通用配方，淀粉和钠随肉含量而变', f: ['processed', 'est'] },
  { id: 'spanish_mackerel', name: '鲅鱼（生）', alias: 'bayu spanish mackerel', cat: 'seafood', n: [121, 21.2, 3.1, 0, 0, 0, 72], s: [['一块可食部', 120]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'processed_cheese_slice', name: '再制干酪片', alias: 'zaizhi ganlao cheese slice processed cheese', cat: 'dairy', n: [310, 16.0, 25.0, 7.0, 0, 4.0, 1200], s: [['一片', 20]], nfs: 2.5, ...META_RECIPE_READY, note: '非特定品牌代表值；实际应优先使用包装营养标签', f: ['quick', 'processed', 'est'] },
  { id: 'sweet_douhua', name: '豆花（甜口）', alias: 'tiandouhua sweet douhua tofu pudding 甜豆花 豆腐花 甜豆腐脑', cat: 'soy', n: [65, 3.5, 1.5, 9.5, 0.3, 6.0, 35], s: [['一碗', 300]], nfs: 0.3, ...META_RECIPE_READY, note: '按嫩豆花加糖水的通用配方估算；糖水用量决定游离糖', f: ['breakfast', 'est'] },
  { id: 'dried_longan', name: '桂圆干（龙眼肉）', alias: 'guiyuangan longyanrou dried longan', cat: 'fruit', n: [313, 4.6, 1.0, 74.6, 2.0, 65.0, 4], s: [['一小把去核可食部', 20]], source: SOURCE_CNFCT, basis: '100g', state: 'dry', edibleRatio: 1, carbBasis: 'total', note: '按去壳去核的干龙眼肉计，不与鲜龙眼混用', f: ['quick'] },

  // 早餐与主食。
  { id: 'sweet_potato_congee', name: '红薯粥', alias: 'hongshuzhou sweet potato congee', cat: 'staple', n: [55, 1.2, 0.2, 12.3, 0.8, 2.2, 3], s: [['一碗', 300]], ...META_RECIPE_COOKED, f: ['whole', 'breakfast', 'est'] },
  { id: 'pumpkin_congee', name: '南瓜粥', alias: 'nanguazhou pumpkin congee', cat: 'staple', n: [48, 1.1, 0.2, 10.5, 0.6, 1.5, 3], s: [['一碗', 300]], ...META_RECIPE_COOKED, f: ['breakfast', 'est'] },
  { id: 'salty_soymilk', name: '咸豆浆', alias: 'xiandoujiang salty soy milk', cat: 'drink', n: [42, 3.0, 2.0, 3.0, 0.5, 0.5, 320], s: [['一碗', 300]], ...META_RECIPE_READY, note: '按无糖豆浆加少量酱油、醋和榨菜的通用配方估算', f: ['breakfast', 'est'] },
  { id: 'steamed_rice_cake', name: '白糖发糕（米糕）', alias: 'baitang fagao migao steamed rice cake', cat: 'staple', n: [235, 4.0, 1.0, 52.0, 1.0, 12.0, 120], s: [['一块', 80]], ...META_RECIPE_READY, f: ['refined', 'breakfast', 'est'] },
  { id: 'black_sesame_paste', name: '黑芝麻糊（冲调粉）', alias: 'heizhimahu black sesame paste', cat: 'staple', n: [410, 10.0, 16.0, 61.0, 5.0, 25.0, 120], s: [['一小袋干粉', 30]], source: SOURCE_RECIPE, basis: '100g', state: 'dry', edibleRatio: 1, carbBasis: 'total', note: '非特定品牌含糖冲调粉代表值；饮用时营养按干粉克数计', f: ['processed', 'breakfast', 'est'] },
  { id: 'chive_pocket', name: '韭菜盒子', alias: 'jiucaihezi chive pocket', cat: 'staple', n: [240, 7.0, 10.0, 32.0, 2.0, 2.0, 550], s: [['一个', 120]], ...META_RECIPE_READY, f: ['fried', 'breakfast', 'est'] },
  { id: 'wuhan_doupi', name: '武汉三鲜豆皮', alias: 'wuhan sanxian doupi', cat: 'staple', n: [215, 8.0, 9.0, 28.0, 1.2, 2.0, 520], s: [['一份', 180]], ...META_RECIPE_READY, f: ['fried', 'breakfast', 'est'] },
  { id: 'rice_milk', name: '米浆（甜）', alias: 'mijiang rice milk drink', cat: 'drink', n: [50, 1.0, 0.5, 10.5, 0.2, 4.0, 10], s: [['一杯', 300]], ...META_RECIPE_READY, note: '按大米磨浆、加少量糖的早餐饮品估算，不代表包装植物饮料', f: ['breakfast', 'sweetdrink', 'est'] },

  // 家常菜；所有份量均为可直接食用的成品重量。
  { id: 'dapanji', name: '大盘鸡', alias: 'dapanji big plate chicken', cat: 'dish', n: [180, 12.0, 11.0, 9.0, 1.2, 2.5, 850], s: [['一人份可食部', 350]], ...META_RECIPE_READY, note: '按鸡肉、土豆和少量挂汁计，不含另加面条，也不喝盘底余汁', f: ['est'] },
  { id: 'scallion_lamb', name: '葱爆羊肉', alias: 'congbaoyangrou scallion lamb', cat: 'dish', n: [210, 15.0, 15.0, 5.0, 1.0, 2.0, 750], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'cumin_lamb', name: '孜然羊肉', alias: 'ziranyangrou cumin lamb', cat: 'dish', n: [240, 18.0, 17.0, 4.0, 0.8, 1.0, 780], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'home_style_tofu', name: '家常豆腐', alias: 'jiachangdoufu home style tofu', cat: 'dish', n: [150, 9.0, 10.0, 7.0, 1.0, 2.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'braised_tofu', name: '红烧豆腐', alias: 'hongshaodoufu braised tofu', cat: 'dish', n: [120, 8.0, 7.0, 6.0, 1.0, 2.5, 650], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'minced_pork_tofu', name: '肉末豆腐', alias: 'roumodoufu minced pork tofu', cat: 'dish', n: [135, 9.0, 8.0, 6.0, 1.0, 1.5, 680], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'celery_pork', name: '芹菜炒肉', alias: 'qincaichaorou celery pork', cat: 'dish', n: [145, 10.0, 9.0, 6.0, 1.3, 1.5, 650], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'broccoli_shrimp', name: '西兰花炒虾仁', alias: 'xilanhua chaoxiaren broccoli shrimp', cat: 'dish', n: [100, 10.0, 5.0, 7.0, 2.0, 2.0, 480], s: [['一份可食部', 250]], ...META_RECIPE_READY, note: '虾按去壳虾仁计', f: ['est'] },
  { id: 'white_boiled_shrimp', name: '白灼虾', alias: 'baizhuoxia white boiled shrimp', cat: 'seafood', n: [100, 20.0, 1.5, 1.0, 0, 0, 180], s: [['一份去壳可食部', 150]], ...META_RECIPE_READY, note: '营养和份量均按去头去壳后的虾肉计，不含蘸料', f: ['est'] },
  { id: 'cold_wood_ear', name: '凉拌木耳', alias: 'liangbanmuer cold wood ear', cat: 'dish', n: [70, 2.0, 4.0, 8.0, 3.5, 3.0, 600], s: [['一份', 150]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'smashed_cucumber', name: '拍黄瓜', alias: 'paihuanggua smashed cucumber', cat: 'dish', n: [55, 1.0, 3.5, 5.0, 1.0, 3.0, 500], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'sour_beef_hotpot', name: '酸汤肥牛', alias: 'suantangfeiniu sour beef hotpot', cat: 'dish', n: [160, 10.0, 11.0, 6.0, 1.0, 2.0, 1000], s: [['一人份（含少量汤）', 400]], ...META_RECIPE_READY, note: '按肥牛和配菜全部吃完、约喝四分之一汤汁估算；喝完整汤会显著增加钠', f: ['est'] },

  // 豆类与面筋。
  { id: 'black_soybean', name: '黑豆（干）', alias: 'heidou black soybean dry', cat: 'soy', n: [401, 36.0, 15.9, 33.6, 10.2, 5.0, 5], s: [['一小把干豆', 30]], source: SOURCE_CNFCT, basis: '100g', state: 'dry', edibleRatio: 1, carbBasis: 'total', f: ['whole', 'cook'] },
  { id: 'fermented_black_bean', name: '豆豉', alias: 'douchi fermented black bean', cat: 'soy', n: [270, 20.0, 8.0, 32.0, 6.0, 3.0, 4000], s: [['一勺', 10]], ...META_RECIPE_READY, note: '不同产地和盐渍工艺差异很大，按通用调味豆豉估算', f: ['processed', 'est'] },
  { id: 'wheat_gluten', name: '烤麸（干）', alias: 'kaofu wheat gluten dry', cat: 'soy', n: [364, 26.0, 3.0, 58.0, 1.0, 2.0, 40], s: [['一份干品', 30]], source: SOURCE_CNFCT, basis: '100g', state: 'dry', edibleRatio: 1, carbBasis: 'total', f: ['cook'] },
  { id: 'fried_gluten_ball', name: '油面筋', alias: 'youmianjin fried gluten ball', cat: 'soy', n: [490, 25.0, 32.0, 25.0, 1.0, 2.0, 300], s: [['一个', 20]], ...META_RECIPE_READY, f: ['fried', 'processed', 'est'] },
  { id: 'fuzhu_soaked', name: '腐竹（泡发）', alias: 'fuzhu soaked yuba', cat: 'soy', n: [115, 11.0, 5.5, 6.0, 1.0, 0.5, 20], s: [['一份泡发品', 100]], ...META_RECIPE_COOKED, note: '由干腐竹吸水后的代表值折算，不含调味汁', f: ['est'] },

  // 蔬果按可食部录入。
  { id: 'sweet_potato_leaves', name: '红薯叶（生）', alias: 'hongshuye sweet potato leaves', cat: 'veg', n: [42, 3.1, 0.6, 7.1, 2.8, 1.2, 45], s: [['一份可食部', 150]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'shepherd_purse', name: '荠菜（生）', alias: 'jicai shepherd purse', cat: 'veg', n: [31, 2.9, 0.4, 4.7, 1.7, 1.0, 31], s: [['一份可食部', 150]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'mustard_greens', name: '芥菜（生）', alias: 'jiecai mustard greens', cat: 'veg', n: [27, 2.0, 0.4, 4.7, 3.2, 1.3, 20], s: [['一份可食部', 150]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'water_caltrop', name: '菱角（熟）', alias: 'lingjiao water caltrop cooked', cat: 'staple', n: [101, 4.5, 0.2, 21.4, 1.9, 3.6, 5], s: [['一份去壳可食部', 100]], ...META_CNFCT_COOKED, f: ['whole'] },
  { id: 'winter_jujube', name: '冬枣', alias: 'dongzao winter jujube', cat: 'fruit', n: [113, 1.8, 0.2, 27.8, 1.9, 23.2, 1], s: [['一份去核可食部', 100]], ...META_CNFCT_RAW, f: ['quick'] },
  { id: 'muskmelon', name: '甜瓜', alias: 'tiangua xianggua muskmelon', cat: 'fruit', n: [26, 0.4, 0.1, 6.2, 0.4, 5.7, 8], s: [['一份去皮可食部', 200]], ...META_CNFCT_RAW, f: [] },
  { id: 'passion_fruit', name: '百香果', alias: 'baixiangguo passion fruit', cat: 'fruit', n: [97, 2.2, 0.7, 23.4, 10.4, 11.2, 28], s: [['两个果肉可食部', 50]], ...META_USDA_RAW, f: ['quick'] },
  { id: 'mandarin', name: '砂糖橘', alias: 'shatangju mandarin', cat: 'fruit', n: [53, 0.8, 0.3, 13.3, 1.8, 10.6, 2], s: [['一份去皮可食部', 150]], ...META_CNFCT_RAW, f: ['quick'] },

  // 地方点心、零食和饮品；无可靠品牌标签时只给通用配方估算。
  { id: 'twisted_dough_mahua', name: '麻花', alias: 'mahua twisted dough', cat: 'snack', n: [527, 8.3, 31.5, 53.4, 1.5, 15.0, 380], s: [['一根', 50]], ...META_RECIPE_READY, f: ['fried', 'refined', 'processed', 'est'] },
  { id: 'peach_cookie', name: '桃酥', alias: 'taosu peach cookie', cat: 'snack', n: [520, 6.0, 30.0, 58.0, 2.0, 22.0, 300], s: [['一块', 35]], ...META_RECIPE_READY, f: ['refined', 'processed', 'est'] },
  { id: 'mung_bean_cake', name: '绿豆糕', alias: 'lvdougao mung bean cake', cat: 'snack', n: [350, 7.0, 8.0, 63.0, 3.0, 35.0, 120], s: [['一块', 30]], ...META_RECIPE_READY, f: ['processed', 'est'] },
  { id: 'rice_crust', name: '锅巴', alias: 'guoba rice crust', cat: 'snack', n: [480, 7.0, 20.0, 67.0, 2.0, 3.0, 600], s: [['一小包', 30]], ...META_RECIPE_READY, f: ['fried', 'refined', 'processed', 'quick', 'est'] },
  { id: 'sour_plum_drink', name: '酸梅汤（含糖）', alias: 'suanmeitang sour plum drink', cat: 'drink', n: [45, 0.1, 0, 11.0, 0.2, 10.0, 10], s: [['一杯', 350]], ...META_RECIPE_READY, f: ['sweetdrink', 'est'] },
  { id: 'almond_drink', name: '杏仁露（含糖）', alias: 'xingrenlu almond drink', cat: 'drink', n: [45, 0.8, 1.5, 7.0, 0.2, 6.0, 35], s: [['一杯', 250]], ...META_RECIPE_READY, f: ['sweetdrink', 'processed', 'est'] },
  { id: 'candied_hawthorn', name: '冰糖葫芦', alias: 'bingtanghulu candied hawthorn', cat: 'snack', n: [180, 0.5, 0.2, 44.0, 2.5, 38.0, 10], s: [['一串可食部', 80]], ...META_RECIPE_READY, note: '按去核山楂和糖衣可食部计', f: ['processed', 'quick', 'est'] },

  // ---------- v1.2 食物库扩充：基础食材、地方主食、常见菜肴与包装食品 ----------
  { id: 'casserole_congee', name: '砂锅粥（通用）', alias: 'shaguozhou casserole congee', cat: 'staple', n: [75, 4.0, 2.0, 10.5, 0.8, 0.5, 400], s: [['一碗', 450]], ...META_RECIPE_READY, note: '按米粥、少量肉或海鲜及整碗汤汁估算；不同配料和盐量差异较大', f: ['est'] },
  { id: 'knife_cut_noodle', name: '刀削面（熟面）', alias: 'daoxiaomian knife cut noodle', cat: 'staple', n: [135, 4.5, 0.8, 27.5, 1.0, 0.5, 120], s: [['一碗熟面', 250]], ...META_RECIPE_COOKED, note: '仅按煮熟面条计，不含浇头和汤汁', f: ['refined', 'est'] },
  { id: 'grilled_cold_noodle', name: '烤冷面', alias: 'kaolengmian grilled cold noodle', cat: 'staple', n: [260, 7.5, 9.0, 39.0, 1.5, 5.0, 700], s: [['一份', 220]], ...META_RECIPE_READY, note: '按冷面片、鸡蛋、酱料和少量油的街边通用配方估算', f: ['refined', 'processed', 'est'] },
  { id: 'soup_dumpling', name: '灌汤包', alias: 'guantangbao soup dumpling', cat: 'staple', n: [230, 8.5, 10.0, 27.0, 1.0, 2.0, 550], s: [['一个', 45], ['一笼6个', 270]], ...META_RECIPE_READY, f: ['breakfast', 'est'] },
  { id: 'spaghetti_cooked', name: '意大利面（煮熟，无酱）', alias: 'yidalimian spaghetti pasta 意面', cat: 'staple', n: [158, 5.8, 0.9, 30.9, 1.8, 0.6, 1], s: [['一盘熟面', 200]], ...META_USDA_COOKED, note: '只计煮熟面条；肉酱、奶油酱和芝士需另记', f: ['refined'] },
  { id: 'macaroni_cooked', name: '通心粉（煮熟，无酱）', alias: 'tongxinfen macaroni pasta', cat: 'staple', n: [157, 5.8, 0.9, 30.9, 1.8, 0.6, 1], s: [['一碗熟面', 180]], ...META_USDA_COOKED, note: '只计煮熟通心粉，不含酱汁', f: ['refined'] },
  { id: 'oatmeal_porridge', name: '燕麦粥（清水煮）', alias: 'yanmaizhou oatmeal porridge', cat: 'staple', n: [71, 2.5, 1.5, 12.0, 1.7, 0.3, 2], s: [['一碗', 300]], ...META_RECIPE_COOKED, note: '按燕麦片与清水煮制，不含奶、糖或坚果', f: ['whole', 'breakfast', 'est'] },
  { id: 'croissant_plain', name: '羊角包 / 可颂（原味）', alias: 'yangjiaobao kesong croissant', cat: 'staple', n: [406, 8.2, 21.0, 45.8, 2.6, 11.3, 467], s: [['一个', 60]], ...META_USDA_READY, f: ['refined', 'breakfast', 'quick'] },
  { id: 'baguette', name: '法棍面包', alias: 'fagun baguette french bread', cat: 'staple', n: [274, 8.5, 1.1, 57.6, 2.3, 2.5, 540], s: [['一段', 80]], ...META_USDA_READY, f: ['refined', 'quick'] },
  { id: 'english_muffin', name: '英式松饼', alias: 'yingshisongbing english muffin', cat: 'staple', n: [235, 8.0, 1.8, 46.0, 2.7, 2.5, 430], s: [['一个', 60]], ...META_USDA_READY, f: ['refined', 'breakfast', 'quick'] },
  { id: 'waffle_plain', name: '华夫饼（原味）', alias: 'huafubing waffle', cat: 'snack', n: [291, 7.9, 14.1, 33.0, 1.2, 8.0, 511], s: [['一块', 70]], ...META_USDA_READY, f: ['refined', 'breakfast', 'processed'] },
  { id: 'scone_plain', name: '司康（原味）', alias: 'sikang scone', cat: 'snack', n: [353, 6.5, 14.5, 50.7, 1.7, 14.0, 420], s: [['一个', 65]], ...META_USDA_READY, f: ['refined', 'breakfast', 'processed'] },
  { id: 'qingtuan', name: '青团', alias: 'qingtuan green rice cake', cat: 'snack', n: [230, 4.0, 5.0, 44.0, 1.5, 14.0, 100], s: [['一个', 60]], ...META_RECIPE_READY, note: '按糯米皮和甜豆沙馅通用配方估算，肉松蛋黄等馅料差异很大', f: ['processed', 'est'] },
  { id: 'glutinous_rice_cake', name: '糍粑（原味）', alias: 'ciba glutinous rice cake', cat: 'staple', n: [220, 4.0, 2.0, 48.0, 1.0, 4.0, 40], s: [['一块', 80]], ...META_RECIPE_READY, note: '按蒸熟糯米成品估算；红糖、黄豆粉和煎炸用油需另计', f: ['refined', 'est'] },
  { id: 'rice_sheet', name: '米皮（熟）', alias: 'mipi rice sheet', cat: 'staple', n: [110, 2.0, 0.3, 24.5, 0.5, 0.2, 30], s: [['一份米皮', 250]], ...META_RECIPE_COOKED, note: '仅按熟米皮计，不含辣油、芝麻酱和配菜', f: ['refined', 'est'] },
  { id: 'rice_vermicelli_cooked', name: '粉干（煮熟）', alias: 'fengan rice vermicelli cooked', cat: 'staple', n: [112, 2.1, 0.3, 25.0, 0.6, 0.1, 10], s: [['一碗熟粉', 250]], ...META_RECIPE_COOKED, note: '仅按煮熟粉干计，不含汤、油和浇头', f: ['refined', 'est'] },
  { id: 'wheat_vermicelli_cooked', name: '面线（煮熟）', alias: 'mianxian wheat vermicelli', cat: 'staple', n: [125, 4.2, 0.5, 26.0, 1.0, 0.4, 140], s: [['一碗熟面线', 250]], ...META_RECIPE_COOKED, note: '仅按熟面线计，部分干面线本身含盐较高', f: ['refined', 'est'] },
  { id: 'alkaline_noodle_cooked', name: '碱水面（煮熟）', alias: 'jianshuimian alkaline noodle', cat: 'staple', n: [138, 4.8, 0.8, 28.0, 1.0, 0.5, 250], s: [['一碗熟面', 250]], ...META_RECIPE_COOKED, note: '只计熟面条，不含拌酱、汤或浇头', f: ['refined', 'est'] },
  { id: 'instant_glass_noodle', name: '方便粉丝（含调料，干）', alias: 'fangbianfensi instant glass noodle', cat: 'staple', n: [350, 7.0, 1.0, 78.0, 4.0, 2.0, 1800], s: [['一桶干料', 100]], source: SOURCE_RECIPE, basis: '100g', state: 'dry', edibleRatio: 1, carbBasis: 'total', note: '非特定品牌代表值，按干粉丝与整包调料计；实际以包装标签为准', f: ['refined', 'processed', 'quick', 'instant', 'est'] },

  { id: 'rabbit_raw', name: '兔肉（瘦，生）', alias: 'turou rabbit meat', cat: 'meat', n: [102, 19.7, 2.2, 0, 0, 0, 45], s: [['一份可食部', 100]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'goose_raw', name: '鹅肉（带皮，生）', alias: 'erou goose meat', cat: 'meat', n: [251, 17.9, 19.9, 0, 0, 0, 73], s: [['一份可食部', 100]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'beef_tripe_cooked', name: '牛肚（熟，未调味）', alias: 'niudu beef tripe', cat: 'meat', n: [85, 12.1, 3.4, 1.9, 0, 0, 45], s: [['一份可食部', 100]], ...META_CNFCT_COOKED, f: [] },
  { id: 'beef_omasum_cooked', name: '牛百叶（熟，未调味）', alias: 'niubaiye beef omasum tripe', cat: 'meat', n: [72, 12.5, 2.0, 0, 0, 0, 70], s: [['一份可食部', 100]], ...META_CNFCT_COOKED, f: [] },
  { id: 'duck_blood', name: '鸭血（熟）', alias: 'yaxue duck blood', cat: 'meat', n: [55, 12.4, 0.4, 0.5, 0, 0, 195], s: [['一盒', 300], ['一份', 100]], ...META_CNFCT_COOKED, f: ['quick'] },
  { id: 'pork_blood', name: '猪血（熟）', alias: 'zhuxue pork blood', cat: 'meat', n: [55, 12.2, 0.3, 0.9, 0, 0, 56], s: [['一份', 150]], ...META_CNFCT_COOKED, f: [] },
  { id: 'eel_raw', name: '黄鳝（生）', alias: 'huangshan shanyu eel', cat: 'seafood', n: [89, 18.0, 1.4, 1.2, 0, 0, 70], s: [['一份去骨可食部', 120]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'carp_raw', name: '鲤鱼（生）', alias: 'liyu carp', cat: 'seafood', n: [109, 17.6, 4.1, 0, 0, 0, 53], s: [['一块可食部', 120]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'pomfret_raw', name: '鲳鱼（生）', alias: 'changyu pomfret', cat: 'seafood', n: [140, 18.5, 7.3, 0, 0, 0, 62], s: [['一块可食部', 120]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'tilapia_raw', name: '罗非鱼（生）', alias: 'luofeiyu tilapia', cat: 'seafood', n: [96, 20.1, 1.7, 0, 0, 0, 52], s: [['一块可食部', 150]], ...META_USDA_RAW, f: ['cook'] },
  { id: 'saury_raw', name: '秋刀鱼（生）', alias: 'qiudaoyu saury', cat: 'seafood', n: [314, 18.5, 25.9, 0, 0, 0, 60], s: [['一条可食部', 100]], ...META_RECIPE_RAW, note: '按去头去骨可食部的常见高脂秋刀鱼代表值估算', f: ['cook', 'est'] },
  { id: 'jellyfish_ready', name: '海蜇（即食，未拌油）', alias: 'haizhe jellyfish', cat: 'seafood', n: [74, 13.0, 0.3, 4.0, 0, 0, 330], s: [['一份', 100]], ...META_RECIPE_READY, note: '按漂洗后的即食海蜇代表值；盐渍程度会显著影响钠', f: ['processed', 'est'] },
  { id: 'crab_stick', name: '蟹棒 / 蟹柳', alias: 'xiebang xieliu crab stick surimi', cat: 'seafood', n: [95, 7.0, 0.5, 15.0, 0, 6.0, 850], s: [['一根', 20]], ...META_RECIPE_READY, note: '非特定品牌鱼糜制品代表值，以包装标签为准', f: ['processed', 'quick', 'est'] },
  { id: 'shrimp_ball', name: '虾丸', alias: 'xiawan shrimp ball', cat: 'seafood', n: [140, 12.0, 5.0, 13.0, 0.5, 2.0, 750], s: [['一个', 25]], ...META_RECIPE_READY, note: '非特定品牌代表值，淀粉、虾肉比例和钠差异较大', f: ['processed', 'est'] },
  { id: 'pork_ball', name: '贡丸（猪肉丸）', alias: 'gongwan pork ball', cat: 'meat', n: [190, 12.0, 13.0, 9.0, 0.5, 2.0, 800], s: [['一个', 25]], ...META_RECIPE_READY, note: '非特定品牌通用配方估算', f: ['processed', 'est'] },

  { id: 'tempeh', name: '天贝', alias: 'tianbei tempeh fermented soybean', cat: 'soy', n: [195, 19.9, 11.4, 7.6, 3.9, 0, 9], s: [['一份', 100]], ...META_USDA_READY, f: ['whole', 'cook'] },
  { id: 'mozzarella', name: '马苏里拉奶酪', alias: 'masulila mozzarella cheese', cat: 'dairy', n: [300, 22.2, 22.4, 2.2, 0, 1.0, 627], s: [['一小把碎奶酪', 30]], nfs: 1.0, ...META_USDA_READY, f: ['quick', 'natsugar'] },
  { id: 'kefir_plain', name: '开菲尔（原味无加糖）', alias: 'kaifeier kefir fermented milk', cat: 'dairy', n: [62, 3.5, 3.5, 4.7, 0, 4.7, 50], s: [['一杯', 200]], nfs: 4.7, ...META_USDA_READY, f: ['quick', 'natsugar'] },
  { id: 'sweet_soy_drink', name: '豆奶（含糖，通用）', alias: 'dounai sweet soy drink', cat: 'drink', n: [60, 2.5, 1.5, 9.0, 0.5, 6.0, 55], s: [['一盒', 250]], nfs: 1.0, ...META_RECIPE_READY, note: '非特定品牌含糖豆奶代表值，实际优先使用包装标签', f: ['sweetdrink', 'processed', 'quick', 'est'] },
  { id: 'tofu_noodle', name: '豆腐丝 / 千张丝（即食）', alias: 'doufusi qianzhangsi tofu noodle', cat: 'soy', n: [160, 19.0, 7.0, 6.0, 1.0, 1.0, 500], s: [['一份', 80]], ...META_RECIPE_READY, note: '按未额外拌油的豆制品代表值估算，卤制品钠可能更高', f: ['processed', 'quick', 'est'] },

  { id: 'snow_pea', name: '荷兰豆（生）', alias: 'helandou snow pea', cat: 'veg', n: [42, 2.8, 0.2, 7.5, 2.6, 4.0, 4], s: [['一份', 150]], ...META_USDA_RAW, f: ['cook'] },
  { id: 'beetroot', name: '甜菜根（生）', alias: 'tiancaigen beetroot beet', cat: 'veg', n: [43, 1.6, 0.2, 10.0, 2.8, 6.8, 78], s: [['一份', 150]], ...META_USDA_RAW, f: [] },
  { id: 'watercress', name: '西洋菜（生）', alias: 'xiyangcai watercress', cat: 'veg', n: [22, 2.3, 0.1, 3.3, 0.5, 0.2, 41], s: [['一份', 150]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'bitter_lettuce', name: '苦菊（生）', alias: 'kuju bitter lettuce endive', cat: 'veg', n: [20, 1.2, 0.2, 3.4, 1.5, 1.2, 30], s: [['一份', 120]], ...META_RECIPE_RAW, note: '按常见生食叶菜代表值估算', f: ['quick', 'est'] },
  { id: 'lily_bulb', name: '鲜百合（鳞茎）', alias: 'xianbaihe lily bulb', cat: 'veg', n: [166, 3.2, 0.1, 38.8, 1.7, 2.5, 6], s: [['一份可食部', 100]], ...META_CNFCT_RAW, f: ['cook'] },
  { id: 'bamboo_fungus', name: '竹荪（水发）', alias: 'zhusun bamboo fungus', cat: 'veg', n: [20, 1.5, 0.1, 4.5, 3.0, 0, 10], s: [['一份', 100]], ...META_RECIPE_COOKED, note: '由干竹荪泡发后的代表值折算，不含汤和调味', f: ['cook', 'est'] },
  { id: 'wakame', name: '裙带菜（水发）', alias: 'qundaicai wakame', cat: 'veg', n: [45, 3.0, 0.6, 9.1, 0.5, 0.7, 872], s: [['一份', 80]], ...META_RECIPE_COOKED, note: '盐渍产品是否充分漂洗会显著影响钠', f: ['processed', 'est'] },
  { id: 'nectarine', name: '油桃', alias: 'youtao nectarine', cat: 'fruit', n: [44, 1.1, 0.3, 10.6, 1.7, 7.9, 0], s: [['一个可食部', 150]], ...META_USDA_RAW, f: ['quick'] },
  { id: 'mulberry', name: '桑葚', alias: 'sangshen mulberry', cat: 'fruit', n: [43, 1.4, 0.4, 9.8, 1.7, 8.1, 10], s: [['一盒', 125]], ...META_USDA_RAW, f: ['quick'] },
  { id: 'cranberry_raw', name: '蔓越莓（鲜）', alias: 'manyuemei cranberry fresh', cat: 'fruit', n: [46, 0.4, 0.1, 12.2, 4.6, 4.0, 2], s: [['一份', 100]], ...META_USDA_RAW, note: '鲜果值；不等同于通常大量加糖的蔓越莓干', f: [] },
  { id: 'sunflower_seed_kernel', name: '葵花籽仁（原味）', alias: 'kuihuaziren sunflower seed kernel', cat: 'nut', n: [584, 20.8, 51.5, 20.0, 8.6, 2.6, 9], s: [['一小把', 25]], ...META_USDA_RAW, f: ['quick'] },
  { id: 'pine_nut', name: '松子仁', alias: 'songziren pine nut', cat: 'nut', n: [673, 13.7, 68.4, 13.1, 3.7, 3.6, 2], s: [['一小把', 20]], ...META_USDA_RAW, f: ['quick'] },

  { id: 'farm_pork_stirfry', name: '农家小炒肉', alias: 'nongjiaxiaochaorou pork stir fry', cat: 'dish', n: [210, 12.0, 16.0, 6.0, 1.0, 2.0, 750], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'sweet_sour_pork_canton', name: '咕咾肉', alias: 'gulaorou sweet sour pork', cat: 'dish', n: [245, 14.0, 14.0, 16.0, 0.5, 10.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['fried', 'est'] },
  { id: 'salt_baked_chicken', name: '盐焗鸡', alias: 'yanjuji salt baked chicken', cat: 'dish', n: [215, 24.0, 13.0, 2.0, 0, 1.0, 750], s: [['一份去骨可食部', 150]], ...META_RECIPE_READY, note: '按带皮可食部估算，不计骨重', f: ['est'] },
  { id: 'lotus_stirfry', name: '荷塘小炒', alias: 'hetangxiaochao lotus root stir fry', cat: 'dish', n: [95, 3.5, 5.0, 10.0, 3.0, 3.0, 450], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'mushroom_soup', name: '菌菇汤（清汤）', alias: 'jungutang mushroom soup', cat: 'dish', n: [35, 2.0, 1.5, 4.0, 1.0, 1.0, 350], s: [['一碗', 350]], ...META_RECIPE_READY, note: '按菌菇和整碗清汤计，奶油菌菇汤不适用', f: ['est'] },
  { id: 'dough_drop_soup', name: '疙瘩汤', alias: 'gedatang dough drop soup', cat: 'dish', n: [70, 3.0, 1.5, 11.5, 0.7, 0.8, 450], s: [['一碗', 400]], ...META_RECIPE_READY, note: '按面疙瘩、少量蛋菜和整碗汤汁估算', f: ['est'] },
  { id: 'kelp_salad', name: '凉拌海带丝', alias: 'liangbanhaidaisi kelp salad', cat: 'dish', n: [65, 1.5, 4.0, 7.0, 2.0, 3.0, 650], s: [['一份', 150]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'sliced_beef_offal', name: '夫妻肺片', alias: 'fuqifeipian sliced beef offal', cat: 'dish', n: [190, 17.0, 12.0, 7.0, 0.5, 2.0, 1000], s: [['一份', 200]], ...META_RECIPE_READY, note: '按牛肉、牛杂和红油调味汁的通用配方估算', f: ['est'] },
  { id: 'braised_duck_neck', name: '卤鸭脖', alias: 'luyabo braised duck neck', cat: 'meat', n: [220, 18.0, 15.0, 4.0, 0, 2.0, 1200], s: [['一根去骨可食部', 60]], ...META_RECIPE_READY, note: '营养和份量均按去骨可食部估算', f: ['processed', 'est'] },
  { id: 'braised_duck_wing', name: '卤鸭翅', alias: 'luyachi braised duck wing', cat: 'meat', n: [245, 19.0, 18.0, 3.0, 0, 1.0, 1100], s: [['一只去骨可食部', 35]], ...META_RECIPE_READY, note: '营养和份量均按去骨可食部估算', f: ['processed', 'est'] },
  { id: 'grilled_sausage', name: '烤肠（通用）', alias: 'kaochang grilled sausage', cat: 'meat', n: [260, 11.0, 21.0, 8.0, 0.5, 3.0, 900], s: [['一根', 60]], ...META_RECIPE_READY, note: '非特定品牌淀粉肠或肉肠代表值，实际差异很大', f: ['processed', 'quick', 'est'] },
  { id: 'fried_skewers', name: '炸串（混合）', alias: 'zhachuan fried skewers', cat: 'dish', n: [270, 12.0, 18.0, 14.0, 1.0, 2.0, 1000], s: [['一份可食部', 250]], ...META_RECIPE_READY, note: '按肉类、豆制品、蔬菜和酱料混合估算，不含竹签重量', f: ['fried', 'est'] },
  { id: 'maocai', name: '冒菜', alias: 'maocai spicy hot pot bowl', cat: 'dish', n: [125, 7.0, 8.0, 7.0, 2.0, 2.0, 950], s: [['一人份（含少量汤）', 500]], ...META_RECIPE_READY, note: '按食材全部吃完并摄入约四分之一汤汁估算；喝汤会显著增加钠和油脂', f: ['est'] },
  { id: 'sizzling_beef', name: '铁板牛肉', alias: 'tieban niurou sizzling beef', cat: 'dish', n: [180, 14.0, 12.0, 6.0, 1.0, 2.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'oyakodon', name: '亲子丼', alias: 'qinzijing oyakodon chicken egg rice', cat: 'dish', n: [165, 8.0, 5.0, 24.0, 0.7, 3.0, 500], s: [['一碗', 450]], ...META_RECIPE_READY, note: '按米饭、鸡肉、鸡蛋和酱汁的整碗成品估算', f: ['est'] },
  { id: 'gyudon', name: '牛丼 / 日式牛肉饭', alias: 'niujing gyudon beef bowl', cat: 'dish', n: [175, 8.0, 6.0, 24.0, 0.8, 4.0, 600], s: [['一碗', 450]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'eel_rice', name: '鳗鱼饭', alias: 'manyufan eel rice unadon', cat: 'dish', n: [200, 8.0, 5.0, 31.0, 0.5, 5.0, 500], s: [['一碗', 400]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'sushi_hand_roll', name: '寿司手卷（通用）', alias: 'shoushishoujuan sushi hand roll', cat: 'dish', n: [170, 7.0, 4.0, 28.0, 1.0, 3.0, 450], s: [['一个', 120]], ...META_RECIPE_READY, note: '按米饭、海苔、鱼或蛋和少量酱料估算', f: ['est'] },

  { id: 'konjac_snack', name: '魔芋爽（调味）', alias: 'moyushuang konjac snack', cat: 'snack', n: [80, 1.0, 3.0, 12.0, 4.0, 4.0, 1200], s: [['一小包', 20]], ...META_RECIPE_READY, note: '非特定品牌代表值，钠和油脂以包装标签为准', f: ['processed', 'quick', 'est'] },
  { id: 'soda_cracker', name: '苏打饼干', alias: 'sudabinggan soda cracker', cat: 'snack', n: [430, 9.0, 13.0, 70.0, 3.0, 8.0, 700], s: [['一小包', 30]], ...META_RECIPE_READY, note: '非特定品牌代表值', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'granola_cereal', name: '谷物麦片 / 格兰诺拉', alias: 'guwumai pian granola cereal', cat: 'staple', n: [450, 10.0, 16.0, 68.0, 8.0, 22.0, 250], s: [['一份', 40]], ...META_RECIPE_READY, note: '按含坚果和糖浆的即食谷物麦片估算；不等同于原味燕麦片', f: ['whole', 'processed', 'breakfast', 'quick', 'est'] },
  { id: 'guilinggao', name: '龟苓膏（含糖）', alias: 'guilinggao herbal jelly', cat: 'snack', n: [40, 0.2, 0, 9.8, 0.5, 8.0, 20], s: [['一杯', 250]], ...META_RECIPE_READY, note: '按含糖即食产品估算；无糖产品应另建包装标签记录', f: ['quick', 'est'] },
  { id: 'double_skin_milk', name: '双皮奶', alias: 'shuangpinai double skin milk pudding', cat: 'snack', n: [145, 5.0, 7.0, 17.0, 0, 15.0, 80], s: [['一碗', 180]], nfs: 4.5, ...META_RECIPE_READY, f: ['est'] },
  { id: 'fermented_rice', name: '酒酿 / 醪糟', alias: 'jiuniang laozao fermented rice', cat: 'snack', n: [85, 1.5, 0.2, 19.0, 0, 13.0, 5], s: [['一小碗', 150]], ...META_RECIPE_READY, note: '按含米粒和酒酿汁的通用成品估算，发酵程度会改变糖与酒精含量', f: ['est'] },
  { id: 'lotus_root_starch', name: '藕粉（干粉，无加糖）', alias: 'oufen lotus root starch', cat: 'staple', n: [372, 0.2, 0.1, 92.0, 1.0, 0, 10], s: [['一小袋干粉', 30]], source: SOURCE_RECIPE, basis: '100g', state: 'dry', edibleRatio: 1, carbBasis: 'total', note: '按无糖纯藕粉干重计；冲调水不增加营养，含糖产品应优先看标签', f: ['refined', 'breakfast', 'est'] },
  { id: 'prune_juice', name: '西梅汁（100%）', alias: 'ximeizhi prune juice', cat: 'drink', n: [71, 0.6, 0, 17.5, 0.7, 16.5, 4], s: [['一杯', 250]], ...META_USDA_READY, f: ['sweetdrink', 'quick'] },
  { id: 'ice_jelly', name: '冰粉（含糖水）', alias: 'bingfen ice jelly', cat: 'snack', n: [65, 0.2, 0.1, 16.0, 0.5, 14.0, 10], s: [['一碗', 300]], ...META_RECIPE_READY, note: '按冰粉冻、糖水和少量配料估算，红糖与配料用量决定热量', f: ['est'] },
  { id: 'butter_cookie', name: '曲奇饼干', alias: 'quqi butter cookie', cat: 'snack', n: [502, 6.0, 24.0, 66.0, 2.0, 28.0, 330], s: [['两块', 25]], ...META_RECIPE_READY, note: '非特定品牌代表值', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'sandwich_cookie', name: '夹心饼干', alias: 'jiaxinbinggan sandwich cookie', cat: 'snack', n: [485, 5.0, 21.0, 69.0, 2.0, 36.0, 380], s: [['两块', 30]], ...META_RECIPE_READY, note: '非特定品牌代表值', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'prawn_cracker', name: '虾条 / 虾片（膨化）', alias: 'xiatiao xiapian prawn cracker', cat: 'snack', n: [510, 5.0, 27.0, 63.0, 2.0, 4.0, 750], s: [['一小包', 30]], ...META_RECIPE_READY, note: '非特定品牌膨化食品代表值', f: ['fried', 'processed', 'quick', 'est'] },
  { id: 'mochi', name: '麻薯（甜馅）', alias: 'mashu mochi', cat: 'snack', n: [270, 3.0, 5.0, 53.0, 1.0, 25.0, 80], s: [['一个', 40]], ...META_RECIPE_READY, f: ['refined', 'processed', 'est'] },
  { id: 'rice_cracker_snow', name: '雪饼', alias: 'xuebing rice cracker snow', cat: 'snack', n: [465, 5.0, 17.0, 70.0, 2.0, 12.0, 600], s: [['两片', 20]], ...META_RECIPE_READY, note: '非特定品牌代表值', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'fruit_hawthorn_roll', name: '果丹皮', alias: 'guodanpi hawthorn fruit roll', cat: 'snack', n: [330, 1.0, 0.5, 80.0, 4.0, 65.0, 20], s: [['一条', 25]], ...META_RECIPE_READY, note: '按加糖山楂制品估算', f: ['processed', 'quick', 'est'] },
  { id: 'preserved_plum', name: '话梅 / 陈皮梅', alias: 'huamei chenpimei preserved plum', cat: 'snack', n: [260, 2.0, 0.5, 63.0, 5.0, 50.0, 1200], s: [['三颗可食部', 15]], ...META_RECIPE_READY, note: '非特定品牌蜜饯代表值，糖和钠差异很大', f: ['processed', 'quick', 'est'] },
  { id: 'dried_prune', name: '西梅干', alias: 'ximeigan dried prune', cat: 'fruit', n: [240, 2.2, 0.4, 64.0, 7.1, 38.0, 2], s: [['一小把', 30]], ...META_USDA_READY, note: '按无额外加糖的干西梅计；糖为完整果干内源糖', f: ['quick'] },

  // ---------- v1.3 常见食品补充：糯米主食、饭团、街边小吃、粉面和盖饭 ----------
  { id: 'glutinous_rice_cooked', name: '糯米饭（熟）', alias: 'nuomifan glutinous sticky rice cooked', cat: 'staple', n: [116, 2.3, 0.3, 25.8, 0.3, 0.1, 2], s: [['小碗', 150], ['中碗', 200]], nfs: 0.1, ...META_RECIPE_COOKED, note: '只计清水蒸熟糯米，不含糖、油和配菜', f: ['refined', 'est'] },
  { id: 'eight_treasure_rice', name: '八宝饭', alias: 'babaofan eight treasure glutinous rice', cat: 'staple', n: [220, 4.0, 4.0, 42.0, 2.0, 18.0, 80], s: [['一小碗', 180]], ...META_RECIPE_READY, note: '按糯米、豆沙、果脯、坚果和糖的常见甜口配方估算', f: ['refined', 'processed', 'est'] },
  { id: 'salted_egg_meat_zongzi', name: '咸蛋黄肉粽', alias: 'xiandanhuang rouzong rouzongzi zongzi 咸肉粽 粽子', cat: 'staple', n: [260, 8.0, 12.0, 30.0, 1.0, 2.0, 600], s: [['一个', 180]], ...META_RECIPE_READY, note: '按糯米、五花肉、咸蛋黄和咸味调料估算，不含粽叶重量', f: ['processed', 'quick', 'est'] },
  { id: 'redbean_zongzi', name: '豆沙粽', alias: 'doushazong red bean zongzi sweet', cat: 'staple', n: [216, 5.0, 2.0, 45.0, 2.0, 14.0, 80], s: [['一个', 150]], ...META_RECIPE_READY, note: '按糯米和甜豆沙馅估算，不含粽叶重量', f: ['refined', 'processed', 'est'] },
  { id: 'plain_zongzi', name: '白粽 / 原味粽', alias: 'baizong yuanweizong plain zongzi', cat: 'staple', n: [195, 4.0, 1.0, 43.0, 1.0, 0.5, 30], s: [['一个', 150]], nfs: 0.5, ...META_RECIPE_READY, note: '只计原味糯米粽，不含蘸糖和粽叶重量', f: ['refined', 'est'] },
  { id: 'lotus_glutinous_chicken', name: '糯米鸡（荷叶）', alias: 'nuomiji heye glutinous rice chicken', cat: 'staple', n: [231, 9.0, 9.0, 29.0, 1.0, 2.0, 650], s: [['一个', 220]], ...META_RECIPE_READY, note: '按糯米、鸡肉、香菇和咸味酱汁估算，不含荷叶重量', f: ['processed', 'breakfast', 'est'] },
  { id: 'glutinous_siumai', name: '糯米烧麦', alias: 'nuomishaomai sticky rice siumai', cat: 'staple', n: [203, 6.0, 5.0, 34.0, 1.0, 1.0, 420], s: [['一个', 45], ['一笼6个', 270]], ...META_RECIPE_READY, f: ['breakfast', 'est'] },
  { id: 'mushroom_oil_rice', name: '香菇油饭 / 糯米油饭', alias: 'xianggu youfan nuomiyoufan mushroom oil rice', cat: 'staple', n: [215, 5.0, 7.0, 34.0, 2.0, 2.0, 500], s: [['一碗', 250]], ...META_RECIPE_READY, note: '按糯米、香菇、少量肉和油葱酥的咸口配方估算', f: ['processed', 'est'] },
  { id: 'tuna_onigiri', name: '金枪鱼蛋黄酱饭团', alias: 'jinqiangyu danhuangjiang fantuan tuna mayo onigiri', cat: 'staple', n: [187, 6.0, 5.0, 30.0, 1.0, 1.5, 450], s: [['一个', 110]], ...META_RECIPE_READY, note: '非特定便利店品牌代表值；馅料和饭量以包装标签为准', f: ['processed', 'quick', 'breakfast', 'est'] },
  { id: 'pork_floss_onigiri', name: '肉松饭团', alias: 'rousongfantuan pork floss onigiri', cat: 'staple', n: [199, 6.0, 4.5, 34.0, 1.0, 4.0, 500], s: [['一个', 115]], ...META_RECIPE_READY, note: '按米饭、肉松和少量沙拉酱估算', f: ['processed', 'quick', 'breakfast', 'est'] },
  { id: 'purple_rice_ball', name: '紫米饭团', alias: 'zimifantuan purple rice ball', cat: 'staple', n: [184, 4.5, 2.0, 38.0, 2.5, 4.0, 250], s: [['一个', 130]], ...META_RECIPE_READY, note: '按紫米、糯米和少量甜咸馅料的便利店代表配方估算', f: ['processed', 'quick', 'breakfast', 'est'] },
  { id: 'seaweed_plain_onigiri', name: '海苔盐饭团', alias: 'haitaiyanfantuan plain seaweed onigiri', cat: 'staple', n: [165, 3.5, 1.0, 36.0, 1.0, 0.5, 380], s: [['一个', 105]], ...META_RECIPE_READY, note: '按米饭、海苔和咸味调料估算，不含额外肉馅', f: ['quick', 'breakfast', 'est'] },

  { id: 'starch_sausage', name: '淀粉肠', alias: 'dianfenchang starch sausage street sausage', cat: 'meat', n: [250, 8.0, 17.0, 16.0, 0.5, 3.0, 1000], s: [['一根', 65]], ...META_RECIPE_READY, note: '非特定品牌高淀粉火腿肠代表值；肉含量、油和钠差异很大，包装食品优先看标签', f: ['processed', 'quick', 'est'] },
  { id: 'corn_sausage', name: '玉米肠', alias: 'yumichang corn sausage', cat: 'meat', n: [236, 10.0, 17.0, 11.0, 0.5, 4.0, 950], s: [['一根', 50]], ...META_RECIPE_READY, note: '非特定品牌代表值，以包装标签为准', f: ['processed', 'quick', 'est'] },
  { id: 'crispy_sausage', name: '脆皮肠 / 热狗肠', alias: 'cuipichang regouchang crispy hotdog sausage', cat: 'meat', n: [266, 13.0, 22.0, 4.0, 0, 2.0, 1100], s: [['一根', 45]], ...META_RECIPE_READY, note: '非特定品牌肉肠代表值，以包装标签为准', f: ['processed', 'quick', 'est'] },
  { id: 'fish_tofu', name: '鱼豆腐', alias: 'yudoufu fish tofu surimi', cat: 'seafood', n: [159, 10.0, 8.0, 12.0, 0.5, 2.0, 800], s: [['一块', 20]], ...META_RECIPE_READY, note: '鱼糜和淀粉制品，不是豆腐；品牌配方差异较大', f: ['processed', 'quick', 'est'] },
  { id: 'grilled_gluten', name: '烤面筋', alias: 'kaomianjin grilled gluten skewer', cat: 'snack', n: [197, 17.0, 7.0, 17.0, 1.0, 3.0, 900], s: [['一串', 80]], ...META_RECIPE_READY, note: '按面筋、刷油和咸辣酱料估算', f: ['processed', 'quick', 'est'] },
  { id: 'fried_sweet_potato_ball', name: '地瓜丸 / 甘梅薯球', alias: 'diguawan ganmeishuqiu sweet potato ball', cat: 'snack', n: [335, 3.0, 15.0, 48.0, 2.0, 12.0, 200], s: [['一份', 120]], ...META_RECIPE_READY, note: '按甜薯、淀粉、糖和油炸吸油量估算', f: ['fried', 'processed', 'quick', 'est'] },
  { id: 'wolf_tooth_potato', name: '狼牙土豆', alias: 'langyatudou wolf tooth potato', cat: 'dish', n: [237, 4.0, 11.0, 32.0, 3.0, 2.0, 650], s: [['一份', 250]], ...META_RECIPE_READY, note: '按油炸或煎制土豆、辣椒油和调味料估算', f: ['fried', 'est'] },
  { id: 'fried_chicken_rack', name: '炸鸡架', alias: 'zhajijia fried chicken rack', cat: 'meat', n: [290, 17.0, 22.0, 6.0, 0, 1.0, 850], s: [['一份去骨可食部', 120]], ...META_RECIPE_READY, note: '营养和份量均按去骨可食部估算；实际裹粉与吸油量差异较大', f: ['fried', 'processed', 'est'] },
  { id: 'crispy_pork_snack', name: '小酥肉', alias: 'xiaosurou crispy pork', cat: 'dish', n: [295, 15.0, 20.0, 14.0, 0.5, 1.0, 700], s: [['一份', 180]], ...META_RECIPE_READY, note: '按猪肉、裹粉和油炸吸油量估算', f: ['fried', 'est'] },
  { id: 'liangfen_savory', name: '川味凉粉', alias: 'chuanweiliangfen savory starch jelly', cat: 'dish', n: [118, 1.5, 5.0, 17.0, 0.5, 1.0, 550], s: [['一碗', 300]], ...META_RECIPE_READY, note: '按豌豆或绿豆淀粉凉粉、红油和酱汁估算', f: ['refined', 'est'] },
  { id: 'bobo_chicken', name: '钵钵鸡（冷串）', alias: 'boboboji bobo chicken cold skewers', cat: 'dish', n: [159, 12.0, 9.0, 8.0, 1.0, 2.0, 900], s: [['一份可食部', 300]], ...META_RECIPE_READY, note: '按肉类、内脏、豆制品、蔬菜及附着红油汁估算，不含竹签和剩余汤汁', f: ['est'] },

  { id: 'nanchang_rice_noodle', name: '南昌拌粉', alias: 'nanchangbanfen jiangxibanfen rice noodle', cat: 'dish', n: [205, 5.0, 7.0, 31.0, 1.0, 2.0, 650], s: [['一碗', 350]], ...META_RECIPE_READY, note: '按熟米粉、萝卜干、花生、辣油和酱油的常见配方估算', f: ['breakfast', 'est'] },
  { id: 'claypot_meat_soup', name: '瓦罐肉汤', alias: 'waguanroutang claypot meat soup', cat: 'dish', n: [72, 7.0, 4.0, 2.0, 0, 0.5, 450], s: [['一罐', 350]], ...META_RECIPE_READY, note: '按肉饼或排骨和整罐清汤计；不同店铺肉量及盐量差异较大', f: ['breakfast', 'est'] },
  { id: 'fried_rice_vermicelli_cn', name: '炒米粉', alias: 'chaomifen chinese fried rice vermicelli', cat: 'dish', n: [210, 5.0, 8.0, 30.0, 1.0, 2.0, 700], s: [['一份', 400]], ...META_RECIPE_READY, note: '按米粉、蛋或少量肉、蔬菜和炒制用油估算', f: ['fried', 'est'] },
  { id: 'soup_rice_noodle', name: '汤米粉 / 汤粉', alias: 'tangmifen tangfen soup rice noodle', cat: 'dish', n: [136, 5.5, 3.5, 21.0, 1.0, 1.0, 600], s: [['一碗', 500]], ...META_RECIPE_READY, note: '按米粉、少量肉菜和整碗汤计；不喝汤时实际钠更低', f: ['breakfast', 'est'] },
  { id: 'intestine_rice_noodle', name: '肥肠粉', alias: 'feichangfen intestine rice noodle', cat: 'dish', n: [178, 7.0, 8.0, 20.0, 1.0, 1.0, 750], s: [['一碗', 500]], ...META_RECIPE_READY, note: '按红薯粉、肥肠、配菜和整碗汤汁估算', f: ['est'] },
  { id: 'duck_blood_vermicelli_soup', name: '鸭血粉丝汤', alias: 'yaxuefensitang duck blood vermicelli soup', cat: 'dish', n: [123, 6.0, 4.0, 16.0, 0.7, 1.0, 800], s: [['一碗', 500]], ...META_RECIPE_READY, note: '按鸭血、粉丝、少量鸭杂和整碗汤计；不喝汤时实际钠更低', f: ['est'] },

  { id: 'hainan_chicken_rice', name: '海南鸡饭', alias: 'hainanjifan hainan chicken rice', cat: 'dish', n: [182, 8.0, 7.0, 22.0, 0.5, 1.0, 500], s: [['一份', 500]], ...META_RECIPE_READY, note: '按油饭、带皮白切鸡和蘸汁的整份成品估算', f: ['est'] },
  { id: 'pork_trotter_rice', name: '猪脚饭 / 隆江猪脚饭', alias: 'zhujiaofan longjiang pork trotter rice', cat: 'dish', n: [231, 9.0, 12.0, 22.0, 0.5, 2.0, 650], s: [['一份', 500]], ...META_RECIPE_READY, note: '按米饭、去骨猪脚可食部、卤汁和少量配菜估算', f: ['est'] },
  { id: 'roast_duck_rice', name: '烧鸭饭', alias: 'shaoyafan roast duck rice', cat: 'dish', n: [195, 9.0, 8.0, 22.0, 0.5, 3.0, 650], s: [['一份', 450]], ...META_RECIPE_READY, note: '按米饭、带皮烧鸭可食部和酱汁估算，不含骨重', f: ['est'] },
  { id: 'pork_rib_rice', name: '排骨饭', alias: 'paigufan pork rib rice', cat: 'dish', n: [194, 10.0, 8.0, 21.0, 1.0, 2.0, 650], s: [['一份', 500]], ...META_RECIPE_READY, note: '按米饭、去骨排骨可食部、酱汁和少量配菜估算', f: ['est'] },
  { id: 'soy_sauce_fried_rice', name: '酱油炒饭', alias: 'jiangyouchaofan soy sauce fried rice', cat: 'dish', n: [191, 4.5, 7.0, 28.0, 0.8, 1.0, 650], s: [['一份', 350]], ...META_RECIPE_READY, f: ['fried', 'est'] },
  { id: 'curry_chicken_rice', name: '咖喱鸡饭', alias: 'galijifan curry chicken rice', cat: 'dish', n: [173, 7.5, 6.0, 23.0, 1.5, 2.5, 550], s: [['一份', 500]], ...META_RECIPE_READY, note: '按米饭、鸡肉、土豆胡萝卜和咖喱汁估算', f: ['est'] },
  { id: 'teriyaki_chicken_rice', name: '照烧鸡饭', alias: 'zhaoshaojifan teriyaki chicken rice', cat: 'dish', n: [176, 9.0, 5.0, 24.0, 0.7, 5.0, 600], s: [['一份', 450]], ...META_RECIPE_READY, note: '按米饭、去骨鸡腿和照烧汁估算', f: ['est'] },
  { id: 'chicken_cutlet_rice', name: '鸡排饭', alias: 'jipaifan chicken cutlet rice', cat: 'dish', n: [220, 9.0, 10.0, 24.0, 1.0, 2.0, 600], s: [['一份', 500]], ...META_RECIPE_READY, note: '按米饭、裹粉炸鸡排、酱汁和少量配菜估算', f: ['fried', 'est'] },
  { id: 'char_siu_rice', name: '叉烧饭', alias: 'chashaofan char siu rice', cat: 'dish', n: [175, 8.0, 5.0, 25.0, 0.8, 4.0, 650], s: [['一份', 450]], ...META_RECIPE_READY, note: '按米饭、叉烧可食部和甜咸酱汁估算', f: ['est'] },
  { id: 'roast_goose_rice', name: '烧鹅饭', alias: 'shaoefan roast goose rice', cat: 'dish', n: [204, 9.0, 9.0, 22.0, 0.5, 2.0, 650], s: [['一份', 450]], ...META_RECIPE_READY, note: '按米饭、带皮烧鹅可食部和酱汁估算，不含骨重', f: ['est'] },

  { id: 'ham_cheese_sandwich', name: '火腿芝士三明治', alias: 'huotuizhishi sanmingzhi ham cheese sandwich', cat: 'staple', n: [226, 10.0, 10.0, 25.0, 2.0, 4.0, 650], s: [['一个', 170]], ...META_RECIPE_READY, note: '非特定便利店品牌代表值，以包装标签为准', f: ['processed', 'quick', 'breakfast', 'est'] },
  { id: 'pork_floss_bread', name: '肉松面包', alias: 'rousongmianbao pork floss bread', cat: 'snack', n: [329, 9.0, 13.0, 45.0, 2.0, 12.0, 500], s: [['一个', 90]], ...META_RECIPE_READY, note: '按甜面包、肉松和少量沙拉酱估算', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'sausage_bun', name: '肠仔包', alias: 'changzaibao sausage bun', cat: 'snack', n: [314, 9.0, 14.0, 39.0, 2.0, 8.0, 600], s: [['一个', 100]], ...META_RECIPE_READY, note: '按甜面包和一根小香肠估算', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'custard_bun', name: '奶黄包', alias: 'naihuangbao custard bun', cat: 'staple', n: [268, 7.0, 7.0, 45.0, 1.5, 15.0, 180], s: [['一个', 55]], nfs: 1.5, ...META_RECIPE_READY, f: ['refined', 'breakfast', 'est'] },
  { id: 'lava_bun', name: '流沙包（咸蛋黄）', alias: 'liushabao salted egg yolk lava bun', cat: 'staple', n: [285, 7.0, 11.0, 40.0, 1.0, 14.0, 220], s: [['一个', 55]], ...META_RECIPE_READY, f: ['refined', 'breakfast', 'est'] },
  { id: 'egg_yolk_pastry', name: '蛋黄酥', alias: 'danhuangsu egg yolk pastry', cat: 'snack', n: [412, 8.0, 24.0, 42.0, 2.0, 16.0, 260], s: [['一个', 60]], ...META_RECIPE_READY, note: '按酥皮、豆沙和咸蛋黄的常见配方估算', f: ['refined', 'processed', 'est'] },
  { id: 'wife_cake', name: '老婆饼', alias: 'laopobing wife cake pastry', cat: 'snack', n: [403, 5.0, 18.0, 56.0, 1.5, 20.0, 220], s: [['一个', 55]], ...META_RECIPE_READY, f: ['refined', 'processed', 'est'] },
  { id: 'glutinous_lotus_root', name: '桂花糯米藕', alias: 'guihua nuomiou glutinous lotus root', cat: 'snack', n: [125, 2.0, 0.5, 29.0, 2.0, 12.0, 40], s: [['一份', 150]], ...META_RECIPE_READY, note: '按莲藕、糯米和甜桂花糖汁估算', f: ['processed', 'est'] },
  { id: 'glutinous_rice_ball_sweet', name: '糯米糍（甜馅）', alias: 'nuomici glutinous rice ball sweet', cat: 'snack', n: [285, 4.0, 8.0, 50.0, 1.5, 24.0, 80], s: [['一个', 45]], ...META_RECIPE_READY, note: '按糯米皮和花生、豆沙或椰蓉甜馅的代表值估算', f: ['refined', 'processed', 'est'] },
  { id: 'donkey_roll', name: '驴打滚', alias: 'lvdagun donkey roll soybean flour', cat: 'snack', n: [261, 8.0, 5.0, 48.0, 4.0, 18.0, 50], s: [['一块', 50]], ...META_RECIPE_READY, note: '按糯米面、豆沙和黄豆粉估算', f: ['processed', 'est'] },
  { id: 'sesame_ball', name: '麻团 / 芝麻球', alias: 'matuan zhimaqiu sesame ball', cat: 'snack', n: [364, 7.0, 18.0, 45.0, 3.0, 14.0, 180], s: [['一个', 45]], ...META_RECIPE_READY, note: '按糯米面、甜馅、芝麻和油炸吸油量估算', f: ['fried', 'refined', 'processed', 'est'] },
  { id: 'roasted_sweet_potato', name: '烤红薯', alias: 'kaohongshu roasted sweet potato', cat: 'staple', n: [101, 1.6, 0.2, 24.7, 3.0, 7.0, 30], s: [['一个', 250]], nfs: 7.0, ...META_RECIPE_COOKED, note: '按不加糖油的烤红薯可食部计', f: ['whole', 'quick', 'est'] },
  { id: 'brown_sugar_mantou', name: '红糖馒头', alias: 'hongtangmantou brown sugar mantou', cat: 'staple', n: [232, 6.5, 1.0, 50.0, 1.5, 12.0, 160], s: [['一个', 90]], ...META_RECIPE_READY, f: ['refined', 'breakfast', 'est'] },
  { id: 'egg_pancake_plain', name: '街边鸡蛋饼', alias: 'jidanbing street egg pancake', cat: 'staple', n: [246, 8.0, 12.0, 27.0, 1.0, 2.0, 500], s: [['一个', 180]], ...META_RECIPE_READY, note: '按面糊、鸡蛋、刷油和酱料估算，不含火腿肠等额外加料', f: ['breakfast', 'est'] },
  { id: 'grilled_mantou', name: '烤馒头片', alias: 'kaomantoupian grilled mantou', cat: 'staple', n: [261, 7.0, 5.0, 48.0, 2.0, 4.0, 300], s: [['两片', 80]], ...META_RECIPE_READY, note: '按馒头片刷少量油和调味料烤制估算', f: ['refined', 'quick', 'est'] },
  { id: 'baked_lamb_baozi', name: '烤包子（羊肉）', alias: 'kaobaozi yangrou baked lamb bun', cat: 'staple', n: [253, 9.0, 12.0, 28.0, 1.5, 2.0, 650], s: [['一个', 100]], ...META_RECIPE_READY, note: '按面皮、羊肉洋葱馅和烤制用油估算', f: ['processed', 'est'] },
  { id: 'rice_burger', name: '米汉堡', alias: 'mihanbao rice burger', cat: 'dish', n: [205, 9.0, 7.0, 27.0, 1.0, 3.0, 500], s: [['一个', 190]], ...META_RECIPE_READY, note: '按两片压制米饭、肉饼、蔬菜和酱汁估算', f: ['processed', 'quick', 'est'] },
  { id: 'self_heating_rice_meal', name: '自热米饭（通用）', alias: 'zire mifan fangbianmifan self heating rice meal', cat: 'dish', n: [185, 7.0, 7.0, 24.0, 1.0, 2.0, 700], s: [['一盒成品', 420]], ...META_RECIPE_READY, note: '非特定品牌米饭和菜包整盒代表值，实际以包装标签为准', f: ['processed', 'quick', 'est'] },
  { id: 'buldak_noodle_ready', name: '火鸡面（拌好）', alias: 'huojimian buldak spicy noodle ready', cat: 'dish', n: [232, 7.0, 11.0, 27.0, 1.5, 4.0, 800], s: [['一份', 300]], ...META_RECIPE_READY, note: '按方便面饼和整包辣酱拌好后的代表值估算，品牌和用水量不同会影响每100g数值', f: ['fried', 'processed', 'quick', 'instant', 'est'] },
  { id: 'fried_niangao', name: '炸年糕', alias: 'zhaniangao fried rice cake', cat: 'snack', n: [240, 3.0, 10.0, 35.0, 1.0, 4.0, 400], s: [['一份', 150]], ...META_RECIPE_READY, note: '按年糕、油炸吸油量和甜咸酱料估算', f: ['fried', 'refined', 'est'] },
  { id: 'stirfried_niangao', name: '炒年糕', alias: 'chaoniangao stir fried rice cake', cat: 'dish', n: [195, 4.0, 6.0, 32.0, 1.5, 3.0, 650], s: [['一份', 350]], ...META_RECIPE_READY, note: '按年糕、蔬菜、少量肉和炒制用油估算', f: ['refined', 'est'] },
  { id: 'northeast_rice_wrap', name: '东北饭包 / 大饭包', alias: 'dongbeifanbao dafanbao northeast rice wrap', cat: 'dish', n: [163, 5.0, 5.0, 26.0, 3.0, 2.0, 550], s: [['一个', 400]], ...META_RECIPE_READY, note: '按米饭、土豆泥、鸡蛋酱、蔬菜和豆酱估算', f: ['est'] },
  { id: 'cold_rice_cake', name: '凉糕（红糖）', alias: 'lianggao cold rice cake brown sugar', cat: 'snack', n: [99, 1.0, 0, 24.0, 0.5, 12.0, 10], s: [['一碗', 250]], ...META_RECIPE_READY, note: '按米制凉糕和红糖浆估算', f: ['refined', 'est'] },
  { id: 'street_egg_burger', name: '鸡蛋汉堡（街边）', alias: 'jidanhanbao street egg burger', cat: 'dish', n: [246, 8.0, 12.0, 27.0, 1.0, 3.0, 500], s: [['一个', 180]], ...META_RECIPE_READY, note: '按面糊、鸡蛋、少量肉馅、刷油和酱料估算', f: ['fried', 'breakfast', 'est'] },
  { id: 'omelette_rice', name: '蛋包饭', alias: 'danbaofan omelette rice omurice', cat: 'dish', n: [181, 7.0, 7.0, 23.0, 1.0, 3.0, 500], s: [['一份', 450]], ...META_RECIPE_READY, note: '按番茄炒饭、蛋皮和少量酱汁估算', f: ['est'] },

  // ---------- 功能与运动饮料 ----------
  { id: 'nongfu_c100_lemon', name: '农夫山泉 水溶C100（柠檬味）', alias: 'nongfu shuirong c100 水溶c100 水溶C C100 农夫山泉c100 柠檬味 复合果汁饮料', cat: 'drink', n: [38.1, 0, 0, 9.44, 0, 9.44, 28.76], s: [['一瓶', 445]], nfs: 0, ...drinkLabelMeta(SOURCE_NONGFU_C100), note: '按445ml柠檬味瓶身标签折算；标签未单列总糖，配料中的白砂糖、果葡糖浆及果汁糖均属于游离糖，因此按42g碳水计入游离糖；西柚、青皮桔等口味或新批次请以瓶身标签为准', f: ['sweetdrink', 'processed', 'quick', 'functional'] },
  { id: 'redbull_original_imported', name: 'Red Bull 红牛能量饮料（进口原味）', alias: 'red bull hongniu 红牛 奥地利红牛 功能饮料 energy drink', cat: 'drink', n: [46, 0, 0, 10.8, 0, 10.8, 40], s: [['一罐', 250]], caffeineMg: 32, ...drinkLabelMeta(SOURCE_RED_BULL), note: '按国际版 250ml 罐装折算；中国不同系列配方并不相同，购买后应优先看罐身标签', f: ['sweetdrink', 'processed', 'quick', 'functional', 'caffeinated'] },
  { id: 'redbull_sugarfree_imported', name: 'Red Bull 红牛无糖能量饮料', alias: 'red bull sugarfree zero hongniu wutang 红牛无糖 红牛0糖', cat: 'drink', n: [3, 0, 0, 0.8, 0, 0, 40], s: [['一罐', 250]], caffeineMg: 32, ...drinkLabelMeta(SOURCE_RED_BULL), note: '无糖不等于无咖啡因；不同地区版本热量和钠可能略有差异，以罐身标签为准', f: ['processed', 'quick', 'functional', 'caffeinated'] },
  { id: 'monster_original_green', name: 'Monster 魔爪能量饮料（原味）', alias: 'monster mozhao 魔爪 怪兽 绿魔爪 energy drink', cat: 'drink', n: [46, 0, 0, 11.0, 0, 11.0, 75], s: [['一罐', 500]], caffeineMg: 32, ...drinkLabelMeta(SOURCE_MONSTER), note: '按官方 500ml Original Green 的糖和咖啡因折算；地区版本及罐装容量可能不同', f: ['sweetdrink', 'processed', 'quick', 'functional', 'caffeinated'] },
  { id: 'monster_ultra_zero', name: 'Monster 魔爪 Ultra 无糖', alias: 'monster ultra zero mozhao wutang 魔爪无糖 白魔爪 黑魔爪', cat: 'drink', n: [2, 0, 0, 1.0, 0, 0, 75], s: [['一罐', 473]], caffeineMg: 31.7, ...drinkLabelMeta(SOURCE_MONSTER), note: 'Ultra 各口味与地区版本容量、钠和咖啡因略有差异；无糖不等于无咖啡因', f: ['processed', 'quick', 'functional', 'caffeinated'] },
  { id: 'eastroc_energy_original', name: '东鹏特饮（含糖）', alias: 'dongpeng tedian 东鹏特饮 东鹏 功能饮料 energy drink', cat: 'drink', n: [52, 0, 0, 13.0, 0, 13.0, 50], s: [['一瓶', 500], ['一瓶小装', 250]], caffeineMg: 20, ...META_RECIPE_DRINK, note: '按常见含糖维生素功能饮料代表标签估算；东鹏不同系列和容量配方不同，以瓶身标签为准', f: ['sweetdrink', 'processed', 'quick', 'functional', 'caffeinated', 'est'] },
  { id: 'warhorse_energy_original', name: '战马能量型维生素饮料', alias: 'zhanma 战马 能量饮料 功能饮料 energy drink', cat: 'drink', n: [48, 0, 0, 12.0, 0, 12.0, 50], s: [['一罐', 310]], caffeineMg: 20, ...META_RECIPE_DRINK, note: '非特定口味的代表值，实际以包装营养表和咖啡因标示为准', f: ['sweetdrink', 'processed', 'quick', 'functional', 'caffeinated', 'est'] },
  { id: 'lehu_energy_original', name: '乐虎氨基酸维生素功能饮料', alias: 'lehu 乐虎 氨基酸 维生素 功能饮料 energy drink', cat: 'drink', n: [50, 0, 0, 12.5, 0, 12.5, 50], s: [['一罐', 250], ['一瓶', 380]], caffeineMg: 20, ...META_RECIPE_DRINK, note: '按常见含糖罐装配方估算；不同包装版本可能变化，以标签为准', f: ['sweetdrink', 'processed', 'quick', 'functional', 'caffeinated', 'est'] },
  { id: 'amino_energy_drink_generic', name: '氨基酸能量饮料（含糖，通用）', alias: 'anjisuan nengliang yinliao amino acid energy drink 体质能量 功能饮料', cat: 'drink', n: [30, 0, 0, 7.5, 0, 7.5, 50], s: [['一瓶', 500]], caffeineMg: 15, ...META_RECIPE_DRINK, note: '通用品类估算，不代表特定品牌；“氨基酸”字样不能替代正餐蛋白质', f: ['sweetdrink', 'processed', 'quick', 'functional', 'caffeinated', 'est'] },
  { id: 'gatorade_thirst_quencher', name: 'Gatorade 佳得乐运动饮料（原味类）', alias: 'gatorade jiadele 佳得乐 运动饮料 sports drink electrolyte', cat: 'drink', n: [23, 0, 0, 5.9, 0, 5.9, 45], s: [['一瓶', 591], ['一份', 355]], ...drinkLabelMeta(SOURCE_GATORADE), note: '按官方 Thirst Quencher 每 12oz 的热量与碳水折算；国内口味与包装请以标签为准', f: ['sweetdrink', 'processed', 'quick', 'functional'] },
  { id: 'gatorade_zero', name: 'Gatorade 佳得乐 Zero 无糖', alias: 'gatorade zero jiadele wutang 佳得乐无糖 0糖 电解质', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 45], s: [['一瓶', 591], ['一份', 355]], ...drinkLabelMeta(SOURCE_GATORADE), note: '官方说明为零糖、含与经典款同等级电解质且不含咖啡因；钠按代表包装折算', f: ['processed', 'quick', 'functional'] },
  { id: 'gatorade_fit', name: 'Gatorade Fit 维生素电解质饮料', alias: 'gatorade fit vitamin electrolyte 维生素电解质 无添加糖', cat: 'drink', n: [3, 0, 0, 0.6, 0, 0.6, 46], s: [['一瓶', 500]], nfs: 0, ...drinkLabelMeta(SOURCE_GATORADE), note: '官方 500ml 规格为 10–15 kcal、3g 碳水、230mg 钠且不含咖啡因；无添加糖不等于绝对零糖，果汁来源糖仍按游离糖计', f: ['processed', 'quick', 'functional'] },
  { id: 'gatorade_fast_twitch', name: 'Gatorade Fast Twitch 无糖咖啡因电解质饮料', alias: 'gatorade fast twitch workout preworkout 训练前 氮泵 咖啡因 电解质', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 60], s: [['一瓶', 355]], caffeineMg: 56.3, ...drinkLabelMeta(SOURCE_GATORADE), note: '一瓶约含 200mg 咖啡因，属于高咖啡因产品；不应与咖啡、能量饮料或训练前补剂叠加', f: ['processed', 'quick', 'functional', 'caffeinated'] },
  { id: 'powerade_original', name: 'POWERADE 运动饮料（含糖）', alias: 'powerade baokuang 运动饮料 电解质 sports drink', cat: 'drink', n: [23, 0, 0, 5.9, 0, 5.9, 68], s: [['一瓶', 710], ['一份', 355]], ...drinkLabelMeta(SOURCE_POWERADE), note: '按 Coca-Cola 官方代表口味每 12oz 80kcal、21g 糖、240mg 钠折算；地区配方差异明显', f: ['sweetdrink', 'processed', 'quick', 'functional'] },
  { id: 'pocari_sweat', name: '宝矿力水特电解质饮料', alias: 'baokuangli shuute pocari sweat 宝矿力 水特 电解质 运动饮料', cat: 'drink', n: [25, 0, 0, 6.2, 0, 6.2, 49], s: [['一瓶', 500]], ...META_RECIPE_DRINK, note: '按常见瓶装产品代表标签估算，不同地区和口味可能变化；它含糖，不等同于白水', f: ['sweetdrink', 'processed', 'quick', 'functional', 'est'] },
  { id: 'mizone_vitamin_drink', name: '脉动维生素饮料（含糖）', alias: 'maidong mizone 脉动 维生素饮料 功能饮料', cat: 'drink', n: [19, 0, 0, 4.6, 0, 4.5, 18], s: [['一瓶', 600]], ...META_RECIPE_DRINK, note: '按常见口味代表标签估算；不同系列的糖和热量不同，以包装为准', f: ['sweetdrink', 'processed', 'quick', 'functional', 'est'] },
  { id: 'scream_sports_drink', name: '尖叫运动饮料（含糖）', alias: 'jianjiao scream 尖叫 运动饮料 电解质', cat: 'drink', n: [26, 0, 0, 6.4, 0, 6.0, 50], s: [['一瓶', 550]], ...META_RECIPE_DRINK, note: '按常见运动型口味代表值估算；不同颜色和系列配方可能不同', f: ['sweetdrink', 'processed', 'quick', 'functional', 'est'] },
  { id: 'alien_electrolyte_zero', name: '外星人电解质水（无糖类）', alias: 'waixingren alien electrolyte 外星人 电解质水 0糖 无糖', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 60], s: [['一瓶', 500]], ...META_RECIPE_DRINK, note: '按无糖电解质水通用值估算；不同口味的钠及矿物质含量以标签为准', f: ['processed', 'quick', 'functional', 'est'] },
  { id: 'electrolyte_water_low_sugar', name: '电解质水（低糖，通用）', alias: 'dianjiezhi shui low sugar electrolyte water 低糖 补水饮料', cat: 'drink', n: [12, 0, 0, 3.0, 0, 3.0, 60], s: [['一瓶', 500]], ...META_RECIPE_DRINK, note: '通用品类代表值；大量出汗时应按实际包装的钠与糖含量选择', f: ['sweetdrink', 'processed', 'quick', 'functional', 'est'] },
  { id: 'vitamin_water_sugared', name: '维生素水（含糖，通用）', alias: 'weishengsu shui vitamin water 维他命水 营养素饮料', cat: 'drink', n: [20, 0, 0, 5.0, 0, 5.0, 20], s: [['一瓶', 500]], ...META_RECIPE_DRINK, note: '“含维生素”不代表低糖；通用值仅用于没有包装信息时估算', f: ['sweetdrink', 'processed', 'quick', 'functional', 'est'] },
  { id: 'vitamin_water_zero', name: '维生素水（无糖，通用）', alias: 'weishengsu shui wutang vitamin water zero 维他命水 0糖', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 20], s: [['一瓶', 500]], ...META_RECIPE_DRINK, note: '通用无糖维生素饮料估算；维生素和甜味剂种类随品牌变化', f: ['processed', 'quick', 'functional', 'est'] },
  { id: 'caffeinated_sparkling_zero', name: '无糖咖啡因气泡水（通用）', alias: 'kafeiyin qipaoshui caffeine sparkling energy water 无糖能量气泡水', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 10], s: [['一罐', 330], ['一瓶', 500]], caffeineMg: 20, ...META_RECIPE_DRINK, note: '按每 500ml 约 100mg 咖啡因的代表配方估算；实际差异很大，请查看包装总咖啡因', f: ['processed', 'quick', 'functional', 'caffeinated', 'est'] },
  { id: 'electrolyte_tablet_prepared', name: '电解质泡腾片冲饮（无糖类）', alias: 'dianjiezhi paotengpian electrolyte tablet drink 冲剂 运动补水', cat: 'drink', n: [4, 0, 0, 1.0, 0, 0, 50], s: [['一片冲饮', 500]], ...META_RECIPE_DRINK, note: '按一片兑 500ml 水的通用配方估算；务必按包装冲调比例记录，钠和碳水差异很大', f: ['processed', 'quick', 'functional', 'est'] },

  // ---------- 其他 ----------
  { id: 'oil', name: '食用油', alias: 'you oil', cat: 'other', n: [899, 0, 99.9, 0, 0, 0, 0], s: [['一勺', 10]], f: [] },
  { id: 'sugar', name: '白砂糖', alias: 'tang sugar', cat: 'other', n: [400, 0, 0, 99.9, 0, 99.9, 1], s: [['一勺', 8]], f: ['refined'] },
  { id: 'soy_sauce', name: '生抽 / 酱油', alias: 'jiangyou soy sauce', cat: 'other', n: [63, 5.6, 0.1, 10.1, 0.2, 3.0, 5757], s: [['一勺', 10]], f: [] },
  { id: 'mayo', name: '蛋黄酱（原味）', alias: 'danhuangjiang shalajiang mayo mayonnaise 沙拉酱', cat: 'other', n: [680, 1.5, 75.0, 2.0, 0, 1.5, 600], s: [['一勺', 12]], note: '不等同于低脂或甜味沙拉酱；包装产品应优先用标签', f: ['processed'] },

  // ---- 牛奶与乳品品牌。乳糖不属于 WHO 游离糖：纯奶打 natsugar，
  // 加糖乳品用 nfs 写明其中属于乳糖的那部分，只有加进去的糖算游离糖。
  // ---- 以及一批常见蔬果、主食、菜肴与连锁快餐。
  { id: 'milk_telunsu', name: '蒙牛 特仑苏纯牛奶', alias: 'mengniu telunsu', cat: 'dairy', n: [69, 3.6, 4.4, 5, 0, 5, 60], s: [['一盒', 250], ['一小盒', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_telunsu_organic', name: '蒙牛 特仑苏有机纯牛奶', alias: 'telunsu youji', cat: 'dairy', n: [71, 3.8, 4.4, 5, 0, 5, 60], s: [['一盒', 250]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_jindian', name: '伊利 金典纯牛奶', alias: 'yili jindian', cat: 'dairy', n: [70, 3.6, 4, 5, 0, 5, 60], s: [['一盒', 250], ['一小盒', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_mengniu_plain', name: '蒙牛 纯牛奶', alias: 'mengniu chunniunai', cat: 'dairy', n: [64, 3.2, 3.6, 4.8, 0, 4.8, 60], s: [['一盒', 250], ['一小盒', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_yili_plain', name: '伊利 纯牛奶', alias: 'yili chunniunai', cat: 'dairy', n: [64, 3.2, 3.6, 4.9, 0, 4.9, 60], s: [['一盒', 250], ['一小盒', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_guangming_youbei', name: '光明 优倍鲜牛奶', alias: 'guangming youbei', cat: 'dairy', n: [69, 3.3, 4, 5, 0, 5, 55], s: [['一瓶', 280], ['一小瓶', 195]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_sanyuan_fresh', name: '三元 极致鲜牛奶', alias: 'sanyuan jizhi', cat: 'dairy', n: [69, 3.3, 4, 5, 0, 5, 55], s: [['一瓶', 450], ['一小瓶', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_junlebao_fresh', name: '君乐宝 悦鲜活鲜牛奶', alias: 'junlebao yuexianhuo', cat: 'dairy', n: [70, 3.6, 4, 5, 0, 5, 55], s: [['一瓶', 260], ['一小瓶', 135]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_renyang', name: '认养一头牛 全脂纯牛奶', alias: 'renyangyitouniu', cat: 'dairy', n: [69, 3.3, 4, 5, 0, 5, 60], s: [['一盒', 250]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_meirixianyu', name: '每日鲜语 鲜牛奶', alias: 'meirixianyu', cat: 'dairy', n: [72, 3.6, 4.2, 5, 0, 5, 55], s: [['一瓶', 250], ['小瓶', 185]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_shuhua', name: '伊利 舒化无乳糖牛奶', alias: 'yili shuhua wurutang', cat: 'dairy', n: [64, 3.2, 3.6, 4.8, 0, 4.8, 60], s: [['一盒', 220]], f: ['quick', 'late', 'natsugar'] },
  { id: 'milk_anchor', name: '安佳 全脂纯牛奶', alias: 'anjia anchor quanzhi', cat: 'dairy', n: [66, 3.4, 3.8, 4.8, 0, 4.8, 50], s: [['一盒', 250]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_devondale', name: '德运 全脂纯牛奶', alias: 'deyun devondale', cat: 'dairy', n: [66, 3.3, 3.8, 4.8, 0, 4.8, 45], s: [['一盒', 250]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_wangzai', name: '旺仔牛奶', alias: 'wangzai niunai', cat: 'dairy', n: [75, 2.5, 3, 9.4, 0, 9, 60], s: [['一罐', 145]], f: ['quick', 'processed'], nfs: 2.5 },
  { id: 'milk_breakfast_mengniu', name: '蒙牛 早餐奶', alias: 'mengniu zaocan nai', cat: 'dairy', n: [68, 2.8, 2.6, 8.5, 0, 8, 90], s: [['一盒', 250]], f: ['quick', 'breakfast'], nfs: 4 },
  { id: 'milk_qqstar', name: '伊利 QQ星儿童成长牛奶', alias: 'yili qqxing ertong', cat: 'dairy', n: [70, 3, 3.3, 7.5, 0, 7.2, 60], s: [['一盒', 125]], f: ['quick'], nfs: 4.5 },
  { id: 'milk_ad_calcium', name: '娃哈哈 AD钙奶', alias: 'wahaha ad gainai', cat: 'dairy', n: [54, 0.9, 1, 10, 0, 9.6, 30], s: [['一瓶', 220], ['小瓶', 100]], f: ['quick', 'processed', 'sweetdrink'], nfs: 1.2 },
  { id: 'milk_yousuanru', name: '伊利 优酸乳', alias: 'yili yousuanru', cat: 'dairy', n: [55, 1, 1, 10.5, 0, 10, 40], s: [['一盒', 250]], f: ['quick', 'processed', 'sweetdrink'], nfs: 1.5 },
  { id: 'milk_zhenguoli', name: '蒙牛 真果粒', alias: 'mengniu zhenguoli', cat: 'dairy', n: [72, 1, 1.5, 13.5, 0.2, 12.8, 45], s: [['一盒', 250]], f: ['quick', 'processed', 'sweetdrink'], nfs: 1.5 },
  { id: 'yogurt_ambpoial', name: '伊利 安慕希希腊风味酸奶（原味）', alias: 'yili anmuxi', cat: 'dairy', n: [100, 3.1, 3.1, 14.4, 0, 13.5, 55], s: [['一盒', 205]], f: ['quick', 'late'], nfs: 4 },
  { id: 'yogurt_chunzhen', name: '蒙牛 纯甄常温酸奶', alias: 'mengniu chunzhen', cat: 'dairy', n: [95, 3, 3, 14, 0, 13.2, 55], s: [['一盒', 200]], f: ['quick', 'late'], nfs: 4 },
  { id: 'yogurt_momchilovtsi', name: '光明 莫斯利安常温酸奶', alias: 'guangming mosiliangan', cat: 'dairy', n: [93, 3, 3.3, 12.5, 0, 11.8, 60], s: [['一盒', 200]], f: ['quick', 'late'], nfs: 4 },
  { id: 'yogurt_jianai', name: '简爱 裸酸奶（0添加）', alias: 'jianai luo suannai', cat: 'dairy', n: [64, 3.3, 3.5, 4.8, 0, 4.8, 50], s: [['一杯', 135]], f: ['quick', 'late', 'natsugar'] },
  { id: 'yogurt_ruoshi', name: '光明 如实无糖酸奶', alias: 'guangming rushi', cat: 'dairy', n: [66, 3.4, 3.6, 4.5, 0, 4.5, 50], s: [['一杯', 135]], f: ['quick', 'late', 'natsugar'] },
  { id: 'yogurt_junlebao_jianjia', name: '君乐宝 简醇0蔗糖酸奶', alias: 'junlebao jianchun', cat: 'dairy', n: [68, 3.6, 3.3, 5.4, 0, 5, 55], s: [['一袋', 135]], f: ['quick', 'late', 'natsugar'] },
  { id: 'yogurt_drink_yakult', name: '养乐多 活性乳酸菌饮品', alias: 'yangleduo yakult', cat: 'dairy', n: [68, 1.1, 0.1, 15.7, 0, 15.4, 25], s: [['一瓶', 100]], f: ['quick', 'processed', 'sweetdrink'], nfs: 1 },
  { id: 'milk_powder_yili', name: '伊利 成人全脂奶粉', alias: 'yili chengren naifen', cat: 'dairy', n: [490, 20.5, 22, 52, 0, 51, 300], s: [['一勺', 25], ['一杯冲调', 30]], f: ['natsugar', 'est'] },
  { id: 'kale', name: '羽衣甘蓝', alias: 'yuyiganlan kale', cat: 'veg', n: [35, 2.9, 1.5, 4.4, 4.1, 0.8, 53], s: [['一份', 80]], f: ['whole'] },
  { id: 'chinese_broccoli', name: '芥蓝', alias: 'jielan gailan', cat: 'veg', n: [24, 2.8, 0.4, 4.1, 1.6, 1, 50], s: [['一份', 150]], f: ['whole'] },
  { id: 'water_spinach_stem', name: '空心菜梗', alias: 'kongxincai geng', cat: 'veg', n: [20, 2.2, 0.2, 3.6, 1.4, 0.8, 95], s: [['一份', 150]], f: ['whole'] },
  { id: 'bamboo_shoot_fresh', name: '鲜笋', alias: 'xiansun bamboo', cat: 'veg', n: [27, 2.6, 0.3, 5.2, 2.2, 1.6, 4], s: [['一份', 120]], f: ['whole'] },
  { id: 'lotus_sprout', name: '藕带', alias: 'oudai', cat: 'veg', n: [45, 1.5, 0.1, 10.2, 1.5, 1.2, 20], s: [['一份', 120]], f: ['whole'] },
  { id: 'yam_chinese', name: '铁棍山药', alias: 'tiegun shanyao', cat: 'veg', n: [97, 1.9, 0.2, 22.6, 0.8, 0.5, 18], s: [['一根', 150], ['一段', 100]], f: ['whole'] },
  { id: 'taro_small', name: '小芋头', alias: 'xiaoyutou taro', cat: 'veg', n: [112, 2.2, 0.2, 26, 4.1, 0.4, 11], s: [['一个', 60], ['一份', 150]], f: ['whole'] },
  { id: 'sugar_apple', name: '释迦 / 番荔枝', alias: 'shijia sugarapple', cat: 'fruit', n: [94, 2.1, 0.3, 23.6, 4.4, 17, 9], s: [['一个', 200]], f: ['whole'] },
  { id: 'starfruit', name: '杨桃', alias: 'yangtao starfruit', cat: 'fruit', n: [31, 1, 0.3, 6.7, 2.8, 3.9, 2], s: [['一个', 130]], f: ['whole'] },
  { id: 'raspberry', name: '树莓', alias: 'shumei raspberry', cat: 'fruit', n: [52, 1.2, 0.7, 11.9, 6.5, 4.4, 1], s: [['一盒', 125]], f: ['whole'] },
  { id: 'mandarin_chou', name: '丑橘 / 不知火', alias: 'chouju buzhihuo', cat: 'fruit', n: [48, 0.8, 0.2, 11.8, 1.6, 9.4, 2], s: [['一个', 220]], f: ['whole'] },
  { id: 'green_grape', name: '青提', alias: 'qingti green grape', cat: 'fruit', n: [69, 0.7, 0.2, 18.1, 0.9, 15.5, 2], s: [['一小串', 150]], f: ['whole'] },
  { id: 'coconut_meat', name: '椰肉', alias: 'yerou coconut', cat: 'fruit', n: [354, 3.3, 33.5, 15.2, 9, 6.2, 20], s: [['一份', 50]], f: ['whole'] },
  { id: 'shouzhuabing', name: '手抓饼（原味）', alias: 'shouzhuabing', cat: 'staple', n: [326, 6.5, 17.5, 35.8, 1.2, 2, 520], s: [['一张', 90]], f: ['refined', 'breakfast', 'quick', 'fried'] },
  { id: 'nuomiji', name: '糯米鸡', alias: 'nuomiji', cat: 'staple', n: [195, 7, 6.5, 26.8, 0.9, 1.2, 420], s: [['一个', 180]], f: ['refined'] },
  { id: 'lvrou_huoshao', name: '驴肉火烧', alias: 'lvrou huoshao', cat: 'staple', n: [268, 12.5, 11, 29.5, 1.4, 1, 560], s: [['一个', 150]], f: ['refined'] },
  { id: 'liangpi', name: '凉皮', alias: 'liangpi', cat: 'staple', n: [168, 3.2, 4.2, 29.5, 0.8, 1.5, 650], s: [['一份', 250]], f: ['refined'] },
  { id: 'mixian', name: '云南米线（汤）', alias: 'mixian yunnan', cat: 'staple', n: [118, 3.6, 2, 21.5, 0.6, 0.6, 520], s: [['一碗', 450]], f: ['refined'] },
  { id: 'quinoa_rice', name: '藜麦饭', alias: 'laimai fan quinoa', cat: 'staple', n: [143, 4.9, 2.1, 26, 2.4, 0.9, 5], s: [['一碗', 180]], f: ['whole'] },
  { id: 'naan_bread', name: '馕', alias: 'nang', cat: 'staple', n: [300, 9.5, 6, 52, 2.2, 2, 480], s: [['半个', 80], ['一个', 160]], f: ['refined'] },
  { id: 'tangyuan_sesame', name: '黑芝麻汤圆', alias: 'heizhima tangyuan', cat: 'staple', n: [311, 6, 13.5, 42, 1.5, 15, 60], s: [['4 个', 80]], f: ['refined'] },
  { id: 'tieguodun_e', name: '铁锅炖大鹅', alias: 'tieguo dun dae', cat: 'dish', n: [196, 15, 13.5, 3.5, 0.6, 1, 700], s: [['一份', 350]], f: ['cook'] },
  { id: 'zhuduji', name: '猪肚鸡', alias: 'zhudu ji', cat: 'dish', n: [112, 11.5, 6, 3, 0.3, 0.8, 620], s: [['一份', 400]], f: ['cook'] },
  { id: 'chaoshan_niurouwan', name: '潮汕牛肉丸', alias: 'chaoshan niurouwan', cat: 'dish', n: [168, 17, 9, 4.5, 0.2, 0.5, 760], s: [['一份', 150], ['一颗', 20]], f: ['cook', 'processed'] },
  { id: 'xiaochao_huang_niurou', name: '小炒黄牛肉', alias: 'xiaochao huangniurou', cat: 'dish', n: [188, 17.5, 11.5, 3.5, 0.8, 1.2, 760], s: [['一份', 200]], f: ['cook'] },
  { id: 'zhengshui_dan', name: '蒸水蛋', alias: 'zhengshuidan', cat: 'dish', n: [86, 7.5, 5.5, 1.5, 0, 1, 320], s: [['一份', 150]], f: ['cook'] },
  { id: 'luobo_niunanbao', name: '萝卜牛腩煲', alias: 'luobo niunan bao', cat: 'dish', n: [152, 13, 9, 4.5, 1, 1.8, 640], s: [['一份', 350]], f: ['cook'] },
  { id: 'wallace_wings', name: '华莱士 炸鸡翅', alias: 'hualaishi zhajichi', cat: 'chain', n: [290, 19, 18.5, 12, 0.6, 1, 700], s: [['一只', 50]], f: ['quick', 'processed', 'fried', 'est'] },
  { id: 'dicos_chicken', name: '德克士 脆皮炸鸡', alias: 'dekeshi cuipizhaji', cat: 'chain', n: [288, 21, 19, 8.5, 0.5, 0.8, 720], s: [['一块', 95]], f: ['quick', 'processed', 'fried', 'est'] },
  { id: 'saizeriya_doria', name: '萨莉亚 米兰风焗饭', alias: 'saliya milanfeng jufan', cat: 'chain', n: [152, 6.5, 6, 18, 1, 2, 420], s: [['一份', 350]], f: ['quick', 'est'] },
  { id: 'saizeriya_snail', name: '萨莉亚 焗蜗牛', alias: 'saliya juwoniu', cat: 'chain', n: [210, 9, 17, 5, 0.4, 0.6, 540], s: [['一份', 85]], f: ['quick', 'est'] },
  { id: 'laoxiangji_steam_egg', name: '老乡鸡 蒸蛋', alias: 'laoxiangji zhengdan', cat: 'chain', n: [88, 7.2, 5.8, 1.5, 0, 1, 340], s: [['一份', 150]], f: ['quick', 'est'] },
  { id: 'xiangcunji_rice', name: '乡村基 香辣鸡腿饭', alias: 'xiangcunji jituifan', cat: 'chain', n: [172, 9.5, 6.5, 19.5, 1, 1.5, 560], s: [['一份', 450]], f: ['quick', 'est'] },
  { id: 'zhengongfu_rice', name: '真功夫 香菇滑鸡饭', alias: 'zhengongfu xianggu huaji', cat: 'chain', n: [158, 9, 5, 19.5, 1, 1.2, 520], s: [['一份', 450]], f: ['quick', 'est'] },
  { id: 'mixue_lemonade', name: '蜜雪冰城 柠檬水', alias: 'mixue ningmengshui', cat: 'drink', n: [38, 0.1, 0, 9.5, 0.2, 9.2, 5], s: [['中杯', 500]], f: ['sweetdrink', 'tealevel', 'est'], sf: 0.5, nfs: 0 },
  { id: 'mixue_icecream', name: '蜜雪冰城 冰淇淋', alias: 'mixue bingqilin', cat: 'snack', n: [186, 3, 6.5, 29, 0, 24, 70], s: [['一个', 75]], f: ['processed', 'est'], nfs: 3 },
  { id: 'rice_cake_korean', name: '韩式年糕', alias: 'hanshi niangao tteok', cat: 'staple', n: [218, 3.6, 0.6, 49.5, 1, 0.5, 280], s: [['一份', 150]], f: ['refined'] },

  // ---------- 闽琼鄂地方小吃与可组合甜品 ----------
  { id: 'fuding_pork_slices', name: '福鼎肉片', alias: 'fuding roupian 福建肉片 温州瘦肉丸 肉片汤', cat: 'dish', n: [92, 8.5, 1.8, 10.5, 0.2, 0.8, 600], s: [['一小碗（含汤）', 300], ['一大碗（含汤）', 450]], ...META_RECIPE_READY, note: '按猪后腿瘦肉、地瓜粉及整碗清汤估算；摊店的粉肉比例、汤底和调味差异较大，不喝汤时钠摄入通常更低', f: ['est', 'breakfast'] },
  { id: 'tujia_sauce_pancake', name: '土家酱香饼', alias: 'tujia jiangxiangbing 酱香饼 公婆饼 恩施', cat: 'staple', n: [337, 7.5, 15, 44, 2, 4, 780], s: [['一小块', 50], ['一份', 150], ['半张', 250]], ...META_RECIPE_READY, note: '按刷油烙饼和咸甜酱料估算；摊店刷油量、酱量和切块大小差异明显', f: ['refined', 'fried', 'processed', 'quick', 'est'] },
  { id: 'fujian_guobianhu', name: '福州锅边糊', alias: 'fuzhou guobianhu 鼎边糊 福建小吃', cat: 'dish', n: [68, 2.8, 1.8, 9.8, 0.4, 0.4, 550], s: [['一碗（含汤）', 400]], ...META_RECIPE_READY, note: '按米浆片、海鲜或肉末配料及整碗汤估算；汤底和配料随店家变化', f: ['breakfast', 'est'] },
  { id: 'fuzhou_rouyan', name: '福州肉燕', alias: 'fuzhou rouyan 太平燕 肉燕汤 福建小吃', cat: 'dish', n: [99, 9.5, 3, 8.5, 0.2, 0.3, 600], s: [['一碗（含汤）', 350], ['一只', 20]], ...META_RECIPE_READY, note: '按肉燕、少量配菜及整碗汤估算；若不喝汤，实际钠摄入通常更低', f: ['est'] },
  { id: 'shaxian_bianrou', name: '沙县扁肉', alias: 'shaxian bianrou 扁食 馄饨 福建小吃', cat: 'dish', n: [85, 7.5, 2.5, 8.2, 0.2, 0.3, 560], s: [['一碗（含汤）', 350], ['一只', 18]], ...META_RECIPE_READY, note: '按扁肉及整碗清汤估算；馅料、汤底和调味随店家变化', f: ['est'] },
  { id: 'minnan_shacha_noodle', name: '厦门沙茶面', alias: 'xiamen shachamian shacha noodle satay noodles 闽南沙茶面 沙嗲面', cat: 'dish', n: [128, 6.5, 5.5, 13.5, 0.7, 1.4, 650], s: [['一碗（含汤和常见配料）', 500]], nfs: 0.6, ...META_MINNAN_READY, note: '按面、沙茶汤底、豆制品、肉片与少量海鲜的常见整碗搭配估算；加料种类、花生酱与汤底浓度会使热量和钠显著变化，不喝完汤时钠通常更低', f: ['est'] },
  { id: 'xiamen_shrimp_noodle', name: '厦门虾面', alias: 'xiamen xiamian shrimp noodle 闽南虾面 虾汤面', cat: 'dish', n: [93, 5.2, 2.2, 13.0, 0.5, 1.5, 520], s: [['一碗（含汤）', 500]], nfs: 0.8, ...META_MINNAN_READY, note: '按面条、虾汤、虾仁、肉片和常见配料估算；汤底用油与调味差异较大，不喝完汤时钠通常更低', f: ['est'] },
  { id: 'minnan_mianxianhu', name: '闽南面线糊', alias: 'minnan mianxianhu quanzhou mianxian hu 泉州面线糊 糊面线', cat: 'dish', n: [72, 3.2, 2.0, 9.5, 0.4, 0.5, 520], s: [['一碗（含汤）', 400]], nfs: 0.2, ...META_MINNAN_READY, note: '按细面线、淀粉汤底及少量海鲜或肉末估算；若另加大肠、醋肉、卤蛋或油条，应分别记录', f: ['breakfast', 'est'] },
  { id: 'minnan_oyster_omelette', name: '闽南海蛎煎', alias: 'minnan hailijian oyster omelette 蚵仔煎 海蛎煎蛋', cat: 'dish', n: [190, 8.5, 11.5, 15.0, 0.8, 2.0, 620], s: [['一盘', 220]], nfs: 0.8, ...META_MINNAN_READY, note: '按海蛎、鸡蛋、地瓜粉、蒜苗与煎制用油估算；粉浆和用油量会明显改变热量', f: ['fried', 'est'] },
  { id: 'minnan_five_spice_roll', name: '闽南炸五香', alias: 'minnan zhawuxiang wujian five spice roll 五香卷 石码五香', cat: 'dish', n: [285, 12.0, 18.0, 20.0, 1.2, 3.0, 720], s: [['一条', 120], ['一份切盘', 180]], nfs: 0.6, ...META_MINNAN_READY, note: '按猪肉、荸荠或洋葱、豆皮和地瓜粉卷制后油炸估算；馅料比例和吸油量差异较大', f: ['fried', 'est'] },
  { id: 'xiamen_tusundong', name: '厦门土笋冻（含蘸汁）', alias: 'xiamen tusundong earthworm jelly 土笋冻 沙虫冻', cat: 'dish', n: [48, 6.8, 0.6, 4.0, 0.2, 2.0, 420], s: [['一份', 150]], nfs: 1.0, ...META_MINNAN_READY, note: '按凝冻本体及常见酱油、蒜蓉、醋蘸汁估算；不蘸汁时钠和糖会更低', f: ['est'] },
  { id: 'xiamen_roast_pork_zongzi', name: '厦门烧肉粽', alias: 'xiamen shaorouzong rouzong 闽南肉粽 烧肉粽', cat: 'staple', n: [235, 7.5, 10.5, 31.0, 1.2, 2.0, 620], s: [['一个', 200]], nfs: 0.6, ...META_MINNAN_READY, note: '按糯米、五花肉、香菇、虾米与常见卤料估算；咸蛋黄、板栗和花生等馅料会改变数值', f: ['est'] },
  { id: 'minnan_runbing', name: '闽南润饼 / 薄饼', alias: 'minnan runbing baobing spring roll 闽南春卷 麦仔煎皮', cat: 'dish', n: [155, 7.0, 6.0, 19.0, 2.0, 3.0, 500], s: [['一卷', 250]], nfs: 1.5, ...META_MINNAN_READY, note: '按薄饼皮、包菜、胡萝卜、豆干、肉丝与少量花生糖粉的常见搭配估算；各家馅料和甜咸口差异明显', f: ['est'] },
  { id: 'minnan_fried_mianxian', name: '闽南炒面线', alias: 'minnan chaomianxian fried mee sua 炒米线 面线', cat: 'dish', n: [185, 7.0, 8.0, 23.0, 1.2, 1.5, 600], s: [['一盘', 350]], nfs: 0.7, ...META_MINNAN_READY, note: '按熟面线、肉丝、海鲜、蔬菜与炒制用油估算；用油和调味差异较大', f: ['est'] },
  { id: 'minnan_fried_kwayteow', name: '闽南炒粿条', alias: 'minnan chaoguotiao fried kway teow 粿仔 炒河粉', cat: 'dish', n: [178, 7.5, 7.5, 21.0, 1.2, 2.0, 680], s: [['一盘', 350]], nfs: 0.8, ...META_MINNAN_READY, note: '按粿条、蛋、肉或海鲜、豆芽和酱油炒制估算；用油、酱料与配料差异较大', f: ['est'] },
  { id: 'minnan_youcicngguo', name: '闽南油葱粿', alias: 'minnan youcongguo yam cake radish cake 油葱糕 碗仔粿', cat: 'staple', n: [180, 5.0, 7.0, 25.0, 1.0, 0.8, 500], s: [['一块', 150]], nfs: 0.4, ...META_MINNAN_READY, note: '按米浆、油葱酥、肉末或虾米蒸制估算；浇酱和煎制会额外增加钠与脂肪', f: ['est'] },
  { id: 'xiamen_taro_bun', name: '厦门芋包', alias: 'xiamen yubao taro bun 闽南芋包 芋仔包', cat: 'staple', n: [150, 6.0, 5.5, 20.0, 2.0, 1.5, 480], s: [['一个', 180]], nfs: 0.8, ...META_MINNAN_READY, note: '按芋泥外皮、肉丁、笋干、香菇与虾米蒸制估算；个头和馅料比例差异较大', f: ['est'] },
  { id: 'tongan_fengrou', name: '同安封肉', alias: 'tongan fengrou xiamen braised pork 厦门封肉 闽南封肉', cat: 'dish', n: [305, 13.5, 25.0, 6.0, 0.8, 3.0, 680], s: [['一份可食部', 180]], nfs: 1.0, ...META_MINNAN_READY, note: '按五花肉、香菇、板栗和酱汁焖制估算；肥瘦比例与酱汁摄入量会显著改变热量和钠', f: ['est'] },
  { id: 'quanzhou_ginger_duck', name: '泉州姜母鸭', alias: 'quanzhou jiangmuya ginger duck xiamen 姜母鸭', cat: 'dish', n: [235, 18.0, 17.0, 3.0, 0.4, 1.0, 650], s: [['一份去骨可食部', 250]], nfs: 0.3, ...META_MINNAN_READY, note: '按带皮鸭肉、老姜、麻油和米酒焖制后的可食部估算；皮脂、麻油和酱汁摄入量差异较大', f: ['est'] },
  { id: 'quanzhou_cu_pork', name: '泉州醋肉', alias: 'quanzhou curou vinegar pork 闽南醋肉 炸醋肉', cat: 'dish', n: [310, 15.0, 18.0, 24.0, 0.5, 2.0, 800], s: [['一份', 150]], nfs: 0.5, ...META_MINNAN_READY, note: '按腌制猪肉裹地瓜粉油炸估算；肉的肥瘦、裹粉与吸油量差异明显', f: ['fried', 'est'] },
  { id: 'xiamen_peanut_soup', name: '厦门花生汤', alias: 'xiamen huashengtang peanut soup 闽南花生汤', cat: 'snack', n: [116, 4.2, 5.6, 13.2, 1.2, 9.5, 10], s: [['一碗', 300]], nfs: 0.7, ...META_MINNAN_READY, note: '按去皮花生和加糖汤水估算；甜度与花生浓度会显著改变热量和游离糖', f: ['est'] },
  { id: 'quanzhou_four_fruit_soup', name: '泉州四果汤', alias: 'quanzhou siguotang four fruit soup 闽南四果汤 石花膏甜汤', cat: 'snack', n: [78, 1.2, 0.5, 18.5, 1.0, 12.0, 25], s: [['一碗', 350]], nfs: 4.0, ...META_MINNAN_READY, note: '按石花膏、豆类、莲子、芋圆或水果与糖水的常见组合估算；自选配料和糖水量差异很大', f: ['est'] },
  { id: 'minnan_shihuagao', name: '闽南石花膏（糖水）', alias: 'minnan shihuagao agar jelly 石花冻 海石花', cat: 'snack', n: [42, 0.2, 0.1, 10.3, 0.6, 9.0, 8], s: [['一碗', 300]], nfs: 0, ...META_MINNAN_READY, note: '按石花凝胶与清糖水估算；不加糖或另加水果、蜂蜜时应按实际调整', f: ['est'] },
  { id: 'minnan_salty_rice', name: '闽南咸饭', alias: 'minnan xianfan salty rice mustard rice 芥菜饭 咸肉饭', cat: 'staple', n: [168, 6.5, 6.5, 21.0, 1.2, 1.5, 520], s: [['一碗', 250]], nfs: 0.5, ...META_MINNAN_READY, note: '按米饭、五花肉或腊肉、芥菜、香菇与虾米焖制估算；肉量和调味差异较大', f: ['est'] },
  { id: 'quanzhou_beef_soup', name: '泉州牛肉羹', alias: 'quanzhou niurougeng beef soup 闽南牛肉汤 牛肉羹汤', cat: 'dish', n: [82, 8.5, 1.8, 8.0, 0.3, 0.5, 580], s: [['一碗（含汤）', 350]], nfs: 0.2, ...META_MINNAN_READY, note: '按牛肉片裹少量地瓜粉与整碗清汤估算；若不喝完汤，实际钠通常更低', f: ['est'] },
  { id: 'curry_fish_balls', name: '咖喱鱼蛋 / 咖喱鱼丸', alias: 'gali yudan curry fish ball 鱼蛋 街边小吃', cat: 'snack', n: [164, 10, 7, 15, 1, 2, 700], s: [['一串 4 颗', 80], ['一份 8 颗', 160]], ...META_RECIPE_READY, note: '按鱼丸和附着咖喱酱估算，不包含饮用余下酱汁', f: ['processed', 'quick', 'est'] },
  { id: 'street_chicken_cutlet', name: '街边炸鸡排', alias: 'jipai fried chicken cutlet 正新鸡排 大鸡排', cat: 'snack', n: [293, 21, 15, 19, 1, 1, 780], s: [['一块', 180]], ...META_RECIPE_READY, note: '按裹粉鸡胸肉、吸油和撒料估算；厚度、裹粉和吸油量差异较大', f: ['fried', 'processed', 'quick', 'est'] },
  { id: 'egg_waffle', name: '鸡蛋仔', alias: 'jidanzi egg waffle 香港小吃', cat: 'snack', n: [325, 7.5, 12.5, 46, 1, 18, 260], s: [['一份', 150], ['半份', 75]], ...META_RECIPE_READY, note: '按原味鸡蛋仔估算；加巧克力、奶油或冰淇淋需另记', f: ['refined', 'quick', 'est'] },
  { id: 'cream_puff', name: '泡芙（奶油馅）', alias: 'paofu cream puff shu', cat: 'snack', n: [292, 6, 18, 27, 1, 12, 180], s: [['一个小号', 35], ['一个大号', 80]], ...META_RECIPE_READY, note: '按奶油夹心泡芙通用配方估算，馅料比例会显著影响热量', f: ['refined', 'processed', 'quick', 'est'] },
  { id: 'ginger_milk_curd', name: '姜撞奶', alias: 'jiangzhuangnai ginger milk curd 广东甜品', cat: 'snack', n: [120, 4, 4.5, 16, 0.1, 15, 70], s: [['一碗', 220]], ...META_RECIPE_READY, nfs: 3.8, note: '按全脂奶和加糖的常见甜度估算；牛奶乳糖不计入游离糖，加糖部分计入', f: ['est'] },
  { id: 'sweet_red_bean_soup', name: '红豆糖水', alias: 'hongdou tangshui red bean soup 红豆沙', cat: 'snack', n: [93, 3.5, 0.3, 19.2, 3.1, 9.5, 18], s: [['一碗', 300]], ...META_RECIPE_READY, nfs: 0.2, note: '按煮红豆和糖水估算；甜度可使热量明显变化', f: ['est'] },
  { id: 'sweet_mung_bean_soup', name: '绿豆糖水', alias: 'lvdou tangshui mung bean soup 绿豆汤', cat: 'snack', n: [82, 3, 0.2, 17.4, 2.8, 8, 15], s: [['一碗', 300]], ...META_RECIPE_READY, nfs: 0.5, note: '按煮绿豆和糖水估算；不加糖版本可在清补凉配料中用熟绿豆记录', f: ['est'] },
  { id: 'white_fungus_soup', name: '银耳羹（加糖）', alias: 'yiner geng white fungus soup 银耳汤', cat: 'snack', n: [54, 0.3, 0.1, 13.4, 0.8, 10, 8], s: [['一碗', 300]], ...META_RECIPE_READY, nfs: 0, note: '按银耳和糖水估算；红枣、莲子等额外配料需按实际加入', f: ['est'] },
  { id: 'jiuniang_tangyuan', name: '酒酿小圆子', alias: 'jiuniang xiaoyuanzi fermented rice dumpling 醪糟汤圆', cat: 'snack', n: [94, 2, 1, 19.5, 0.4, 8, 25], s: [['一碗', 300]], ...META_RECIPE_READY, note: '按甜酒酿、小圆子和汤汁估算；糖量与圆子比例差异较大', f: ['refined', 'est'] },

  // 清补凉的可选原料也各自可搜索；组合条目会按用户实际选择逐项求和。
  { id: 'coconut_milk_sweet', name: '椰奶（清补凉甜味底）', alias: 'yenai coconut milk qingbuliang 清补凉椰奶', cat: 'drink', n: [105, 1, 7, 9.5, 0, 8, 30], s: [['一杯', 250]], nfs: 0, ...META_RECIPE_DRINK, note: '按稀释椰浆和糖的甜品底估算；并非罐装浓椰浆', f: ['sweetdrink', 'est'] },
  { id: 'red_bean_cooked', name: '红豆（煮熟，无糖）', alias: 'hongdou cooked red bean 赤小豆 熟红豆', cat: 'soy', n: [127, 8.7, 0.5, 22.8, 6.4, 0.3, 1], s: [['一勺', 25], ['一份', 100]], nfs: 0.3, ...META_USDA_COOKED, f: ['whole'] },
  { id: 'mung_bean_cooked', name: '绿豆（煮熟，无糖）', alias: 'lvdou cooked mung bean 熟绿豆', cat: 'soy', n: [105, 7, 0.4, 19.2, 7.6, 2, 2], s: [['一勺', 25], ['一份', 100]], nfs: 2, ...META_USDA_COOKED, f: ['whole'] },
  { id: 'coix_seed_cooked', name: '薏米（煮熟，无糖）', alias: 'yimi coix job tears cooked 薏仁', cat: 'staple', n: [123, 3, 0.5, 26.7, 1.5, 0.5, 3], s: [['一勺', 25], ['一份', 100]], nfs: 0.5, ...META_RECIPE_COOKED, f: ['whole', 'est'] },
  { id: 'lotus_seed_cooked', name: '莲子（煮熟，无糖）', alias: 'lianzi lotus seed cooked 熟莲子', cat: 'nut', n: [89, 4.9, 0.5, 17.3, 4.9, 0.3, 1], s: [['一勺', 25], ['一份', 100]], nfs: 0.3, ...META_USDA_COOKED, f: ['whole'] },
  { id: 'peanut_boiled', name: '花生（煮，无糖）', alias: 'huasheng boiled peanut 水煮花生', cat: 'nut', n: [320, 13.5, 22, 21.3, 8.8, 2.5, 9], s: [['一勺', 15], ['一小把', 30]], nfs: 2.5, ...META_USDA_COOKED, f: ['whole'] },
  { id: 'grass_jelly_plain', name: '仙草冻 / 凉粉（无糖）', alias: 'xiancao grass jelly liangfen 烧仙草 黑凉粉', cat: 'snack', n: [15, 0.2, 0, 3.8, 0.6, 0, 5], s: [['一勺', 30], ['一份', 100]], ...META_RECIPE_READY, note: '只计无糖凝胶本体，糖浆、奶底和其它配料另计', f: ['est'] },
  { id: 'sago_cooked', name: '西米（煮熟，无糖）', alias: 'ximi sago cooked 西米露配料', cat: 'staple', n: [71, 0.2, 0.1, 17.5, 0.2, 0, 1], s: [['一勺', 25], ['一份', 100]], ...META_RECIPE_COOKED, note: '只计煮熟西米本体，不含糖水和奶底', f: ['refined', 'est'] },
  { id: 'taro_balls_cooked', name: '芋圆（煮熟）', alias: 'yuyuan taro balls cooked 地瓜圆 甜品配料', cat: 'snack', n: [177, 1, 0.4, 42.8, 0.8, 8, 20], s: [['一勺', 30], ['一份', 100]], nfs: 0, ...META_RECIPE_COOKED, note: '按含糖淀粉芋圆估算，品牌和手作配方差异较大', f: ['refined', 'processed', 'est'] },
  { id: 'adazi_cooked', name: '阿达籽（煮熟）', alias: 'adazi 海南清补凉 透明糯米粒 甜品配料', cat: 'snack', n: [125, 0.2, 0.1, 31, 0.3, 5, 15], s: [['一勺', 25], ['一份', 100]], nfs: 0, ...META_RECIPE_COOKED, note: '按海南甜品常见木薯淀粉制阿达籽估算', f: ['refined', 'est'] },
  { id: 'winter_melon_candy', name: '冬瓜糖', alias: 'dongguatang winter melon candy 糖冬瓜', cat: 'snack', n: [319, 0.3, 0.1, 79.5, 0.5, 72, 20], s: [['一小勺', 15], ['一份', 30]], nfs: 0, ...META_RECIPE_READY, f: ['processed', 'quick', 'est'] },
  { id: 'dessert_sugar_syrup', name: '甜品糖浆', alias: 'tangjiang sugar syrup qingbuliang 清补凉糖水', cat: 'other', n: [60, 0, 0, 15, 0, 15, 1], s: [['一勺', 20], ['一份', 50]], nfs: 0, ...META_RECIPE_READY, note: '按约 15% 糖的稀糖浆估算', f: ['refined', 'est'] },
  {
    id: 'qingbuliang_custom', name: '清补凉（自选配料）', alias: 'qingbuliang 海南清补凉 椰奶清补凉 椰子水清补凉', cat: 'snack',
    n: [102, 2.2, 5.4, 11.8, 1.6, 4.8, 16], s: [['常见一碗', 375]], nfs: 1,
    ...META_RECIPE_READY,
    note: '营养按下方实际勾选的常用料和份量逐项计算；椰奶、糖浆、冰淇淋及各店甜度差异会显著改变热量与游离糖',
    f: ['est'],
    mix: {
      label: '常用配料与份量',
      components: [
        { foodId: 'coconut_milk_sweet', label: '椰奶底', defaultGrams: 180, step: 10, max: 500, unit: 'ml' },
        { foodId: 'coconut_water', label: '椰子水', defaultGrams: 0, step: 10, max: 400, unit: 'ml' },
        { foodId: 'red_bean_cooked', label: '红豆', defaultGrams: 25, step: 5, max: 150 },
        { foodId: 'mung_bean_cooked', label: '绿豆', defaultGrams: 20, step: 5, max: 150 },
        { foodId: 'coix_seed_cooked', label: '薏米', defaultGrams: 20, step: 5, max: 150 },
        { foodId: 'peanut_boiled', label: '花生', defaultGrams: 10, step: 5, max: 80 },
        { foodId: 'lotus_seed_cooked', label: '莲子', defaultGrams: 0, step: 5, max: 100 },
        { foodId: 'grass_jelly_plain', label: '仙草冻', defaultGrams: 30, step: 10, max: 200 },
        { foodId: 'sago_cooked', label: '西米', defaultGrams: 25, step: 5, max: 150 },
        { foodId: 'taro_balls_cooked', label: '芋圆', defaultGrams: 0, step: 5, max: 150 },
        { foodId: 'adazi_cooked', label: '阿达籽', defaultGrams: 0, step: 5, max: 150 },
        { foodId: 'coconut_meat', label: '椰肉', defaultGrams: 15, step: 5, max: 100 },
        { foodId: 'watermelon', label: '西瓜', defaultGrams: 30, step: 10, max: 200 },
        { foodId: 'pineapple', label: '菠萝', defaultGrams: 0, step: 10, max: 200 },
        { foodId: 'macaroni_cooked', label: '通心粉', defaultGrams: 0, step: 5, max: 150 },
        { foodId: 'winter_melon_candy', label: '冬瓜糖', defaultGrams: 0, step: 5, max: 60 },
        { foodId: 'ice_cream', label: '冰淇淋', defaultGrams: 0, step: 10, max: 150 },
        { foodId: 'dessert_sugar_syrup', label: '糖浆', defaultGrams: 0, step: 5, max: 100 },
        { foodId: 'water', label: '冰与水', defaultGrams: 20, step: 10, max: 300, unit: 'ml' },
      ],
    },
  },

  // ---------- 品牌烤肉与烤串 ----------
  // 品牌大多只公开菜单、不公开营养表。这里核对真实在售/推荐菜名，营养统一按
  // 同类原料、常见腌料和烤制成品率估算，并在每个条目的来源与说明中披露边界。
  brandedBbqFood({ id: 'ayp_black_pork_belly', name: '安又胖 厚切黑猪五花肉', alias: '安三胖 anyoupang ansanpang heiqie heizhu wuhua 韩国烤肉', n: [431, 15, 39, 5, 0.2, 3, 650], servingGrams: 150, source: SOURCE_AYP_BBQ, note: '常用份量按一盘烤熟可食部估重' }),
  brandedBbqFood({ id: 'ayp_big_pork_belly', name: '安又胖 超级big胖猪五花', alias: '安三胖 anyoupang ansanpang big pangzhu wuhua 超级胖猪五花', n: [455, 14, 43, 3, 0, 1.5, 620], servingGrams: 180, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_beef_short_rib_roll', name: '安又胖 原切牛肋排卷', alias: '安三胖 anyoupang ansanpang niuleipai juan beef short rib roll', n: [335, 20, 27, 3, 0, 1, 420], servingGrams: 150, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_secret_beef', name: '安又胖 招牌秘制牛肉', alias: '安三胖 anyoupang ansanpang mizhi niurou 招牌牛肉', n: [230, 20, 14, 6, 0.2, 4, 720], servingGrams: 150, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_secret_woosamgyeop', name: '安又胖 秘制吾桑格', alias: '安三胖 anyoupang ansanpang wusangge woosamgyeop 牛五花 薄切肥牛', n: [354, 17, 30, 4, 0.1, 2, 650], servingGrams: 150, source: SOURCE_AYP_BBQ, note: '“吾桑格”按韩式牛五花薄片估算' }),
  brandedBbqFood({ id: 'ayp_fruit_woosamgyeop', name: '安又胖 果味吾桑格', alias: '安三胖 anyoupang ansanpang guowei wusangge woosamgyeop 牛五花', n: [365, 17, 29, 9, 0.2, 6, 720], servingGrams: 150, source: SOURCE_AYP_BBQ, note: '“吾桑格”按韩式牛五花薄片并计入果味腌料估算' }),
  brandedBbqFood({ id: 'ayp_fruit_skirt', name: '安又胖 果味横膈膜', alias: '安三胖 anyoupang ansanpang guowei henggemo skirt steak', n: [224, 22, 12, 7, 0.3, 5, 680], servingGrams: 150, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_jar_beef_rib_finger', name: '安又胖 坛香秘制牛肋条', alias: '安三胖 anyoupang ansanpang tanxiang mizhi niuleitiao rib finger', n: [260, 21, 18, 3.5, 0.2, 2, 720], servingGrams: 150, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_fruit_pork_rib', name: '安又胖 妈妈的果味猪排', alias: '安三胖 anyoupang ansanpang mama guowei zhupai pork steak', n: [271, 19, 19, 6, 0.2, 4, 700], servingGrams: 160, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_m6_ribeye', name: '安又胖 原切M6肋眼牛排', alias: '安三胖 anyoupang ansanpang m6 leiyan niupai ribeye 黑松露', n: [292, 23, 22, 0.5, 0, 0, 360], servingGrams: 180, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_wasabi_egg_beef', name: '安又胖 山葵蛋滑烧肉', alias: '安三胖 anyoupang ansanpang shankui danhua shaorou wasabi egg beef', n: [210, 17, 14, 4, 0.2, 2, 600], servingGrams: 150, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_pork_sausage', name: '安又胖 济州岛手作猪腿肠', alias: '安三胖 anyoupang ansanpang jeju zhutuichang sausage 风干肠', n: [309, 15, 25, 6, 0.2, 2, 950], servingGrams: 100, source: SOURCE_AYP_BBQ, flags: ['processed'] }),
  brandedBbqFood({ id: 'ayp_spicy_chicken_feet', name: '安又胖 韩式火辣鸡爪', alias: '安三胖 anyoupang ansanpang huola jizhua spicy chicken feet', n: [220, 18, 12, 10, 0.5, 6, 900], servingGrams: 180, source: SOURCE_AYP_BBQ, note: '按去骨可食部和附着酱汁估算，不含骨重' }),
  brandedBbqFood({ id: 'ayp_spicy_rice_cake', name: '安又胖 妈妈的辣年糕条', alias: '安三胖 anyoupang ansanpang mama la niangaotiao tteokbokki', n: [204, 4, 2, 43, 1, 12, 650], servingGrams: 180, source: SOURCE_AYP_BBQ, flags: ['refined'] }),
  brandedBbqFood({ id: 'ayp_fishcake_rice_cake', name: '安又胖 鱼饼炒年糕', alias: '安三胖 anyoupang ansanpang yubing chao niangao fishcake tteokbokki', n: [186, 6, 4, 32, 1, 9, 780], servingGrams: 220, source: SOURCE_AYP_BBQ, flags: ['processed', 'refined'] }),
  brandedBbqFood({ id: 'ayp_bibimbap', name: '安又胖 国民拌饭', alias: '安三胖 anyoupang ansanpang guomin banfan bibimbap', n: [150, 6, 5, 21, 1.5, 3, 520], servingGrams: 400, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_tuna_rice_ball', name: '安又胖 手作金枪鱼饭团', alias: '安三胖 anyoupang ansanpang jinqiangyu fantuan tuna rice ball', n: [204, 7, 6, 31, 1, 2, 480], servingGrams: 180, source: SOURCE_AYP_BBQ, flags: ['processed'] }),
  brandedBbqFood({ id: 'ayp_rock_fried_chicken', name: '安又胖 摇滚炸鸡', alias: '安三胖 anyoupang ansanpang yaogun zhaji 爆汁炸鸡 fried chicken', n: [298, 19, 19, 13, 0.5, 2, 760], servingGrams: 200, source: SOURCE_AYP_BBQ, flags: ['fried', 'processed'] }),
  brandedBbqFood({ id: 'ayp_grilled_pineapple', name: '安又胖 烤菠萝', alias: '安三胖 anyoupang ansanpang kao boluo grilled pineapple', n: [97, 0.5, 2.5, 19, 2, 14, 120], servingGrams: 120, source: SOURCE_AYP_BBQ, nfs: 12, note: '菠萝本身的糖属于完整水果内源糖，不计入游离糖；只把烤制时的糖浆算作游离糖' }),
  brandedBbqFood({ id: 'ayp_pumpkin_porridge', name: '安又胖 南瓜粥', alias: '安三胖 anyoupang ansanpang nangua zhou pumpkin porridge', n: [56, 1.2, 1, 11, 0.8, 5, 120], servingGrams: 220, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_potato_salad', name: '安又胖 土豆泥', alias: '安三胖 anyoupang ansanpang tudouni potato salad', n: [166, 2, 12, 13, 1.2, 2, 420], servingGrams: 100, source: SOURCE_AYP_BBQ }),
  brandedBbqFood({ id: 'ayp_tiramisu_bingsu', name: '安又胖 首尔提拉米苏雪花冰', alias: '安三胖 anyoupang ansanpang shouer tiramisu xuehuabing bingsu', n: [194, 3, 7, 30, 0.5, 24, 95], servingGrams: 350, source: SOURCE_AYP_BBQ, flags: ['processed'] }),

  brandedBbqFood({ id: 'muwu_lamb_skewer', name: '木屋烧烤 烤羔羊肉串', alias: 'muwu shaokao gaoyang yangrouchuan lamb skewer 招牌羊肉串', n: [259, 20, 19, 2, 0, 0.5, 620], servingGrams: 90, servingLabel: '一份（3串）', source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_grilled_wings', name: '木屋烧烤 招牌烤翅', alias: 'muwu shaokao kaochi mizhi chi chicken wings 蜜汁翅', n: [271, 20, 19, 5, 0.2, 3, 720], servingGrams: 100, servingLabel: '一份（2只）', source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_oyster', name: '木屋烧烤 烤湛江生蚝', alias: 'muwu shaokao zhanjiang shenghao oyster', n: [106, 10, 3, 10, 0.5, 3, 680], servingGrams: 120, servingLabel: '一份（4只可食部）', source: SOURCE_MUWU_BBQ, note: '按蚝肉和蒜蓉调味计，不含贝壳' }),
  brandedBbqFood({ id: 'muwu_pork_belly', name: '木屋烧烤 烤五花肉', alias: 'muwu shaokao wuhuarou pork belly', n: [391, 16, 35, 3, 0, 1, 650], servingGrams: 120, source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_chicken_cartilage', name: '木屋烧烤 烤鸡脆骨', alias: 'muwu shaokao jicuigu chicken cartilage', n: [190, 20, 10, 5, 0.2, 2, 780], servingGrams: 90, servingLabel: '一份（3串）', source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_spicy_pork_skewer', name: '木屋烧烤 泼辣猪小串', alias: 'muwu shaokao pola zhuxiaochuan spicy pork skewer', n: [240, 19, 16, 5, 0.3, 3, 750], servingGrams: 100, servingLabel: '一份（5串）', source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_bursting_tofu', name: '木屋烧烤 包浆豆腐', alias: 'muwu shaokao baojiang doufu grilled tofu', n: [168, 10, 10, 10, 1, 2, 720], servingGrams: 150, source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_grilled_intestine', name: '木屋烧烤 烤肥肠', alias: 'muwu shaokao feichang grilled intestine', n: [316, 13, 28, 3, 0, 1, 700], servingGrams: 100, servingLabel: '一份（3串）', source: SOURCE_MUWU_BBQ }),
  brandedBbqFood({ id: 'muwu_grilled_bread', name: '木屋烧烤 烤面包片', alias: 'muwu shaokao mianbaopian grilled bread', n: [328, 8, 12, 48, 2, 8, 420], servingGrams: 80, servingLabel: '一份（2片）', source: SOURCE_MUWU_BBQ, flags: ['refined'] }),
  brandedBbqFood({ id: 'muwu_fried_rice', name: '木屋烧烤 木屋炒饭', alias: 'muwu shaokao chaofan fried rice 紫金酱油炒饭', n: [197, 5, 7, 29, 1, 2, 620], servingGrams: 350, source: SOURCE_MUWU_BBQ }),

  brandedBbqFood({ id: 'xita_signature_beef', name: '西塔老太太 老太太特色肥瘦', alias: 'xita laotaitai feishou beef 泥炉烤肉', n: [331, 19, 27, 3, 0, 1, 600], servingGrams: 150, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_rolled_short_rib', name: '西塔老太太 秘制卷牛肋排', alias: 'xita laotaitai mizhi juan niuleipai short rib', n: [331, 20, 27, 2, 0, 1, 520], servingGrams: 150, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_heavy_skirt', name: '西塔老太太 重磅横膈膜', alias: 'xita laotaitai zhongbang henggemo skirt steak', n: [229, 22, 13, 6, 0, 3, 650], servingGrams: 150, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_secret_beef_belly', name: '西塔老太太 秘制牛五花', alias: 'xita laotaitai mizhi niuwuhua beef belly', n: [350, 18, 30, 2, 0, 1, 600], servingGrams: 150, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_snow_beef', name: '西塔老太太 吉品雪花肉', alias: 'xita laotaitai jipin xuehuarou marbled beef 极品雪花肉', n: [320, 21, 26, 0.5, 0, 0, 380], servingGrams: 150, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_sandalwood_rib_finger', name: '西塔老太太 檀香小肋条肉', alias: 'xita laotaitai tanxiang xiaoleitiao rib finger', n: [276, 21, 20, 3, 0, 1.5, 650], servingGrams: 150, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_dry_sausage', name: '西塔老太太 烤风干肠', alias: 'xita laotaitai fengganchang dry sausage', n: [340, 17, 28, 5, 0, 2, 1050], servingGrams: 100, source: SOURCE_XITA_BBQ, flags: ['processed'] }),
  brandedBbqFood({ id: 'xita_old_bibimbap', name: '西塔老太太 老式拌饭', alias: 'xita laotaitai laoshi banfan bibimbap', n: [149, 5, 4, 24, 1.5, 3, 520], servingGrams: 400, source: SOURCE_XITA_BBQ }),
  brandedBbqFood({ id: 'xita_butter_rice_cake', name: '西塔老太太 黄油米饼', alias: 'xita laotaitai huangyou mibing butter rice cake', n: [246, 4, 8, 40, 1, 5, 480], servingGrams: 120, source: SOURCE_XITA_BBQ, flags: ['refined'] }),
  brandedBbqFood({ id: 'xita_seafood_pancake', name: '西塔老太太 泥炉海鲜葱饼', alias: 'xita laotaitai haixian congbing seafood pancake', n: [191, 8, 9, 20, 1, 2, 650], servingGrams: 220, source: SOURCE_XITA_BBQ }),

  brandedBbqFood({ id: 'jiutian_beef_rib_finger', name: '九田家 黑牛肋条', alias: 'jiutianjia heiniu leitiao beef rib finger', n: [271, 21, 19, 4, 0, 2, 690], servingGrams: 150, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_oyster_blade', name: '九田家 黑牛牡蛎肉', alias: 'jiutianjia heiniu muli beef oyster blade', n: [249, 22, 17, 2, 0, 1, 520], servingGrams: 150, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_chuck_roll', name: '九田家 黑牛上脑', alias: 'jiutianjia heiniu shangnao chuck roll', n: [284, 21, 22, 0.5, 0, 0, 420], servingGrams: 150, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_seasoned_pork_belly', name: '九田家 调味猪五花', alias: 'jiutianjia tiaowei zhu wuhua pork belly', n: [390, 15, 34, 6, 0, 3, 700], servingGrams: 150, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_beef_tongue', name: '九田家 黑牛牛舌', alias: 'jiutianjia heiniu niushe beef tongue', n: [259, 21, 19, 1, 0, 0.5, 520], servingGrams: 120, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_secret_fatty_beef', name: '九田家 秘制肥牛', alias: 'jiutianjia mizhi feiniu marinated fatty beef', n: [331, 18, 27, 4, 0, 2, 650], servingGrams: 150, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_lamb_chop', name: '九田家 锡盟羊排', alias: 'jiutianjia ximeng yangpai lamb chop', n: [291, 20, 23, 1, 0, 0.5, 560], servingGrams: 160, note: '按去骨可食部估算', source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_teriyaki_chicken_rice', name: '九田家 照烧鸡腿饭', alias: 'jiutianjia zhaoshao jitui fan teriyaki chicken rice', n: [168, 8, 6, 21, 1, 3, 580], servingGrams: 450, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_beef_bibimbap', name: '九田家 牛肉石锅拌饭', alias: 'jiutianjia niurou shiguo banfan bibimbap', n: [158, 7, 5, 22, 1.5, 3, 560], servingGrams: 450, source: SOURCE_JIUTIAN_BBQ }),
  brandedBbqFood({ id: 'jiutian_seaweed_soup', name: '九田家 海带汤', alias: 'jiutianjia haidai tang seaweed soup', n: [45, 4, 2, 3, 0.7, 0.5, 650], servingGrams: 300, note: '按整碗汤计；不喝汤时钠摄入更低', source: SOURCE_JIUTIAN_BBQ }),

  brandedBbqFood({ id: 'fengmao_sunit_lamb_skewer', name: '丰茂烤串 苏尼特羊肉串', alias: 'fengmao kaochuan sunite yangrouchuan lamb skewer', n: [259, 20, 19, 2, 0, 0.5, 620], servingGrams: 90, servingLabel: '一份（3串）', source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_large_lamb_skewer', name: '丰茂烤串 羊肉大串', alias: 'fengmao kaochuan yangrou dachuan large lamb skewer', n: [266, 20, 20, 1.5, 0, 0.5, 600], servingGrams: 120, servingLabel: '一份（2串）', source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_beef_skewer', name: '丰茂烤串 精品牛排串', alias: 'fengmao kaochuan niupai chuan beef skewer', n: [245, 21, 17, 2, 0, 0.5, 620], servingGrams: 100, servingLabel: '一份（3串）', source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_beef_tendon', name: '丰茂烤串 牛板筋', alias: 'fengmao kaochuan niubanjin beef tendon', n: [160, 25, 4, 6, 0, 1, 750], servingGrams: 90, servingLabel: '一份（3串）', source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_lamb_chop', name: '丰茂烤串 爱的小羊排', alias: 'fengmao kaochuan xiaoyangpai lamb chop', n: [300, 20, 24, 1, 0, 0.5, 560], servingGrams: 160, note: '按去骨可食部估算', source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_pork_enoki', name: '丰茂烤串 五花肉卷金针菇', alias: 'fengmao kaochuan wuhuarou juan jinzhengu', n: [248, 13, 18, 9, 1, 3, 680], servingGrams: 120, source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_chicken_cartilage', name: '丰茂烤串 哎呀掌中宝', alias: 'fengmao kaochuan zhangzhongbao chicken cartilage', n: [219, 18, 15, 3, 0.2, 1, 700], servingGrams: 90, servingLabel: '一份（3串）', source: SOURCE_FENGMAO_BBQ }),
  brandedBbqFood({ id: 'fengmao_sausage', name: '丰茂烤串 烤香肠', alias: 'fengmao kaochuan xiangchang grilled sausage', n: [300, 14, 24, 7, 0.3, 3, 980], servingGrams: 100, servingLabel: '一份（2根）', source: SOURCE_FENGMAO_BBQ, flags: ['processed'] }),

  brandedBbqFood({ id: 'feiha_meat_tendon', name: '破店肥哈 破店大肉筋', alias: 'podian feiha daroujin meat tendon 东北烧烤', n: [253, 22, 17, 3, 0, 1, 720], servingGrams: 100, servingLabel: '一份（3串）', source: SOURCE_FEIHA_BBQ }),
  brandedBbqFood({ id: 'feiha_chicken_cartilage', name: '破店肥哈 鸡脆骨', alias: 'podian feiha jicuigu chicken cartilage', n: [199, 20, 11, 5, 0.2, 2, 760], servingGrams: 90, servingLabel: '一份（3串）', source: SOURCE_FEIHA_BBQ }),
  brandedBbqFood({ id: 'feiha_beef_tongue', name: '破店肥哈 一口大牛舌', alias: 'podian feiha niushe beef tongue', n: [259, 21, 19, 1, 0, 0.5, 540], servingGrams: 100, servingLabel: '一份（3串）', source: SOURCE_FEIHA_BBQ }),
  brandedBbqFood({ id: 'feiha_grilled_intestine', name: '破店肥哈 烤肥肠', alias: 'podian feiha kaofeichang grilled intestine', n: [316, 13, 28, 3, 0, 1, 720], servingGrams: 100, servingLabel: '一份（3串）', source: SOURCE_FEIHA_BBQ }),
  brandedBbqFood({ id: 'feiha_qq_chicken_rack', name: '破店肥哈 QQ鸡架', alias: 'podian feiha qq jijia chicken rack 沈阳鸡架', n: [280, 20, 20, 5, 0.2, 1, 800], servingGrams: 180, note: '按去除大骨后的可食部和附着调味计', source: SOURCE_FEIHA_BBQ }),
  brandedBbqFood({ id: 'feiha_cold_noodle', name: '破店肥哈 大冷面', alias: 'podian feiha dalengmian korean cold noodle', n: [108, 3, 1, 22, 1, 4, 600], servingGrams: 500, note: '按面、配菜和整碗汤计；不喝汤时钠摄入更低', source: SOURCE_FEIHA_BBQ }),
  brandedBbqFood({ id: 'feiha_grilled_bread', name: '破店肥哈 烤面包', alias: 'podian feiha kao mianbao grilled bread', n: [323, 8, 11, 49, 2, 8, 420], servingGrams: 100, servingLabel: '一份（2片）', source: SOURCE_FEIHA_BBQ, flags: ['refined'] }),
  brandedBbqFood({ id: 'feiha_crayfish_tail', name: '破店肥哈 麻辣龙虾尾', alias: 'podian feiha mala longxiawei crayfish tail', n: [144, 16, 7, 4, 0.3, 1, 850], servingGrams: 220, note: '按去壳虾尾可食部和附着酱汁计，不含壳与盘底余汁', source: SOURCE_FEIHA_BBQ }),

  /*
   * 南浦拌饭：石锅拌饭连锁。主力是各种浇头的石锅拌饭，其余是汤锅、冷面和小食。
   * 拌饭那几款的差别几乎全在浇头上（牛肉 / 五花 / 海鲜 / 芝士），底下都是同一碗饭 ——
   * 所以热量差主要来自脂肪，碳水几乎一样。
   */
  brandedBbqFood({ id: 'nanpu_beef_bibimbap', name: '南浦拌饭 牛肉石锅拌饭', alias: 'nanpu banfan niurou shiguo banfan beef bibimbap 南浦石锅拌饭', n: [155, 6.5, 5, 21, 1.5, 3, 520], servingGrams: 500, source: SOURCE_NANPU, note: '含拌饭酱；拌开后酱汁全部计入' }),
  brandedBbqFood({ id: 'nanpu_pork_kimchi_bibimbap', name: '南浦拌饭 泡菜五花肉石锅拌饭', alias: 'nanpu banfan paocai wuhuarou shiguo banfan kimchi pork bibimbap', n: [175, 6, 7.5, 21, 1.6, 3.5, 640], servingGrams: 500, source: SOURCE_NANPU }),
  brandedBbqFood({ id: 'nanpu_seafood_bibimbap', name: '南浦拌饭 海鲜石锅拌饭', alias: 'nanpu banfan haixian shiguo banfan seafood bibimbap', n: [145, 7, 4, 20.5, 1.5, 3, 580], servingGrams: 500, source: SOURCE_NANPU }),
  brandedBbqFood({ id: 'nanpu_cheese_bibimbap', name: '南浦拌饭 芝士石锅拌饭', alias: 'nanpu banfan zhishi shiguo banfan cheese bibimbap', n: [185, 8, 8, 20, 1.3, 3.5, 660], servingGrams: 500, source: SOURCE_NANPU, nfs: 1.2, note: '芝士带来的乳糖不算游离糖，已单列' }),
  brandedBbqFood({ id: 'nanpu_veg_bibimbap', name: '南浦拌饭 什锦石锅拌饭', alias: 'nanpu banfan shijin shiguo banfan vegetable bibimbap 素拌饭 原味拌饭', n: [140, 4.5, 4.5, 21.5, 1.8, 3, 500], servingGrams: 500, source: SOURCE_NANPU }),
  brandedBbqFood({ id: 'nanpu_army_stew', name: '南浦拌饭 部队锅', alias: 'nanpu banfan budui guo army stew budae jjigae', n: [120, 6.5, 6.5, 9, 1, 2, 900], servingGrams: 500, source: SOURCE_NANPU, flags: ['processed'], note: '含火腿肠、午餐肉与方便面；按整锅连汤计，不喝汤时钠摄入更低' }),
  brandedBbqFood({ id: 'nanpu_soybean_paste_soup', name: '南浦拌饭 大酱汤', alias: 'nanpu banfan dajiang tang doenjang jjigae soybean paste soup', n: [55, 4, 2.5, 4.5, 1.2, 1.5, 850], servingGrams: 350, source: SOURCE_NANPU, note: '按整碗连汤计；不喝汤时钠摄入更低' }),
  brandedBbqFood({ id: 'nanpu_soft_tofu_soup', name: '南浦拌饭 嫩豆腐汤', alias: 'nanpu banfan nendoufu tang sundubu jjigae soft tofu soup', n: [62, 5, 3.5, 3, 0.8, 1.2, 820], servingGrams: 400, source: SOURCE_NANPU, note: '按整碗连汤计；不喝汤时钠摄入更低' }),
  brandedBbqFood({ id: 'nanpu_cold_noodle', name: '南浦拌饭 韩式冷面', alias: 'nanpu banfan hanshi lengmian korean cold noodle naengmyeon', n: [105, 3.5, 1, 21, 1, 4, 620], servingGrams: 550, source: SOURCE_NANPU, note: '按面、配菜和整碗冷汤计；不喝汤时钠摄入更低' }),
  brandedBbqFood({ id: 'nanpu_tteokbokki', name: '南浦拌饭 辣炒年糕', alias: 'nanpu banfan lachao niangao tteokbokki', n: [190, 4, 3, 38, 1.2, 10, 700], servingGrams: 300, source: SOURCE_NANPU, flags: ['refined'] }),
  brandedBbqFood({ id: 'nanpu_cheese_tteokbokki', name: '南浦拌饭 芝士炒年糕', alias: 'nanpu banfan zhishi chao niangao cheese tteokbokki', n: [215, 6.5, 6.5, 34, 1.1, 9, 760], servingGrams: 320, source: SOURCE_NANPU, flags: ['refined'], nfs: 1 }),
  brandedBbqFood({ id: 'nanpu_gimbap', name: '南浦拌饭 紫菜包饭', alias: 'nanpu banfan zicai baofan gimbap kimbap 韩式饭卷', n: [165, 5, 4.5, 27, 1.5, 2, 480], servingGrams: 220, servingLabel: '一份（约8块）', source: SOURCE_NANPU }),
  brandedBbqFood({ id: 'nanpu_fried_chicken', name: '南浦拌饭 韩式炸鸡', alias: 'nanpu banfan hanshi zhaji korean fried chicken', n: [265, 17, 15, 15, 0.6, 5, 700], servingGrams: 250, source: SOURCE_NANPU, flags: ['fried', 'processed'], note: '按去骨可食部和裹粉、酱汁计' }),
  brandedBbqFood({ id: 'nanpu_kimchi_pancake', name: '南浦拌饭 泡菜饼', alias: 'nanpu banfan paocai bing kimchi pancake kimchijeon 韩式煎饼', n: [205, 5, 10, 24, 1.4, 2.5, 680], servingGrams: 200, source: SOURCE_NANPU, flags: ['fried'] }),

  // ---------- 果汁与常见即饮果蔬饮品（液体均按 100ml） ----------
  { id: 'juice_apple', name: '苹果汁（100%）', alias: 'pingguozhi apple juice 纯果汁', cat: 'drink', n: [46, 0.1, 0.1, 11.3, 0.2, 9.6, 4], s: [['一杯', 250], ['一小瓶', 300]], nfs: 0, ...META_USDA_DRINK, f: ['sweetdrink', 'quick'] },
  { id: 'juice_grape', name: '葡萄汁（100%）', alias: 'putaozhi grape juice 纯果汁', cat: 'drink', n: [60, 0.4, 0.1, 15.2, 0.2, 14.5, 5], s: [['一杯', 250]], nfs: 0, ...META_USDA_DRINK, f: ['sweetdrink', 'quick'] },
  { id: 'juice_pineapple', name: '菠萝汁（100%）', alias: 'boluozhi pineapple juice 凤梨汁 纯果汁', cat: 'drink', n: [53, 0.4, 0.1, 13.1, 0.2, 10.5, 2], s: [['一杯', 250]], nfs: 0, ...META_USDA_DRINK, f: ['sweetdrink', 'quick'] },
  { id: 'juice_pear', name: '梨汁（100%）', alias: 'lizhi pear juice 雪梨汁 纯果汁', cat: 'drink', n: [47, 0.1, 0.1, 11.7, 0.2, 9.8, 4], s: [['一杯', 250]], nfs: 0, ...META_USDA_DRINK, f: ['sweetdrink', 'quick'] },
  { id: 'juice_mango', name: '芒果汁（100%）', alias: 'mangguozhi mango juice 纯果汁', cat: 'drink', n: [56, 0.2, 0.1, 14, 0.3, 12.5, 5], s: [['一杯', 250]], nfs: 0, ...META_RECIPE_DRINK, note: '按无额外加糖的芒果原汁代表值估算；浓稠果泥型饮品差异较大', f: ['sweetdrink', 'quick', 'est'] },
  { id: 'juice_pomegranate', name: '石榴汁（100%）', alias: 'shiliuzhi pomegranate juice 纯果汁', cat: 'drink', n: [54, 0.2, 0.1, 13.2, 0.1, 12.5, 5], s: [['一杯', 250]], nfs: 0, ...META_USDA_DRINK, f: ['sweetdrink', 'quick'] },
  { id: 'juice_watermelon', name: '西瓜汁（鲜榨，无加糖）', alias: 'xiguazhi watermelon juice 鲜榨果汁', cat: 'drink', n: [31, 0.6, 0.2, 7.6, 0.2, 6.2, 2], s: [['一杯', 350]], nfs: 0, ...META_RECIPE_DRINK, note: '按不加糖、不滤渣的鲜榨西瓜汁估算；加糖需另计', f: ['sweetdrink', 'quick', 'est'] },
  { id: 'juice_tomato', name: '番茄汁（无加糖）', alias: 'fanqiezhi tomato juice 西红柿汁', cat: 'drink', n: [17, 0.8, 0.1, 3.5, 0.4, 2.6, 20], s: [['一杯', 250], ['一罐', 330]], nfs: 0, ...META_USDA_DRINK, note: '钠按低盐代表值；罐装加盐番茄汁应优先看包装标签', f: ['quick'] },
  { id: 'juice_carrot', name: '胡萝卜汁（无加糖）', alias: 'huluobozhi carrot juice 果蔬汁', cat: 'drink', n: [41, 0.9, 0.2, 9.3, 0.8, 3.9, 45], s: [['一杯', 250]], nfs: 0, ...META_USDA_DRINK, f: ['quick'] },
  { id: 'juice_mixed_fruit', name: '混合果汁（100%）', alias: 'hunhe guozhi mixed fruit juice 复合果汁', cat: 'drink', n: [53, 0.3, 0.1, 13, 0.2, 11, 5], s: [['一杯', 250], ['一瓶', 300]], nfs: 0, ...META_RECIPE_DRINK, note: '按无额外加糖的混合果汁代表值估算，实际以配料表和营养标签为准', f: ['sweetdrink', 'quick', 'est'] },
  { id: 'juice_drink_generic', name: '果汁饮料（含糖，通用）', alias: 'guozhi yinliao juice drink 果味饮料 果粒饮料', cat: 'drink', n: [42, 0.1, 0, 10.5, 0.1, 10, 8], s: [['一瓶', 500], ['一盒', 250]], nfs: 0, ...META_RECIPE_DRINK, note: '不是 100% 果汁；按水、果汁和添加糖的常见果汁饮料估算，优先使用包装标签', f: ['sweetdrink', 'processed', 'quick', 'est'] },
  { id: 'corn_juice', name: '鲜榨玉米汁（常见甜度）', alias: 'yumizhi corn juice 玉米饮料', cat: 'drink', n: [52, 1.2, 0.7, 10.5, 0.6, 5, 25], s: [['一杯', 300]], nfs: 1, ...META_RECIPE_DRINK, note: '按玉米、水和少量添加糖的餐馆常见配方估算', f: ['sweetdrink', 'est'] },
  { id: 'mixed_fruit_cup', name: '鲜切水果拼盘', alias: 'shuiguo pingpan fruit cup 果切 水果捞不加奶', cat: 'fruit', n: [53, 0.6, 0.2, 13, 1.4, 10.5, 2], s: [['一盒', 300], ['一小盒', 200]], ...META_RECIPE_READY, note: '按多种完整鲜果混合估算，不含酸奶、椰奶、糖浆或罐头水果', f: ['whole', 'quick', 'est'] },

  // ---- 主流碳酸饮料、瓶装茶与植物蛋白饮料。
  // 汽水和甜茶饮的糖全是加进去的，按 WHO 定义整份都算游离糖，不写 nfs；
  // 奶茶、核桃乳这类含乳/植物蛋白的，用 nfs 扣掉其中天然存在的那部分。
  { id: 'sprite', name: '雪碧', alias: 'xuebi sprite qishui', cat: 'drink', n: [43, 0, 0, 10.6, 0, 10.6, 12], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'sprite_zero', name: '无糖雪碧', alias: 'wutang xuebi sprite zero', cat: 'drink', n: [1, 0, 0, 0.3, 0, 0, 12], s: [['一罐', 330], ['一瓶', 500]], f: ['quick'] },
  { id: 'fanta_orange', name: '芬达 橙味汽水', alias: 'fenda fanta chengwei', cat: 'drink', n: [46, 0, 0, 11.3, 0, 11.3, 15], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'mirinda', name: '美年达 橙味汽水', alias: 'meinianda mirinda', cat: 'drink', n: [48, 0, 0, 11.9, 0, 11.9, 15], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'seven_up', name: '七喜', alias: 'qixi 7up', cat: 'drink', n: [44, 0, 0, 10.8, 0, 10.8, 14], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'pepsi', name: '百事可乐', alias: 'baishi kele pepsi', cat: 'drink', n: [43, 0, 0, 10.9, 0, 10.9, 8], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'pepsi_zero', name: '百事可乐 无糖', alias: 'baishi wutang pepsi zero', cat: 'drink', n: [1, 0, 0, 0.2, 0, 0, 10], s: [['一罐', 330], ['一瓶', 500]], f: ['quick', 'caffeinated'] },
  { id: 'beibingyang', name: '北冰洋 橙汁汽水', alias: 'beibingyang chengzhi qishui', cat: 'drink', n: [50, 0, 0, 12.3, 0, 12, 10], s: [['一瓶', 248]], f: ['sweetdrink', 'quick'] },
  { id: 'bingfeng', name: '冰峰 橙味汽水', alias: 'bingfeng qishui', cat: 'drink', n: [47, 0, 0, 11.5, 0, 11.2, 10], s: [['一瓶', 330]], f: ['sweetdrink', 'quick', 'est'] },
  { id: 'dayao', name: '大窑 嘉宾果汁汽水', alias: 'dayao jiabin', cat: 'drink', n: [45, 0, 0, 11, 0, 10.6, 12], s: [['一瓶', 520]], f: ['sweetdrink', 'quick', 'est'] },
  { id: 'laoshan_cola', name: '崂山可乐', alias: 'laoshan kele', cat: 'drink', n: [44, 0, 0, 10.8, 0, 10.8, 12], s: [['一瓶', 330]], f: ['sweetdrink', 'quick', 'est'] },
  { id: 'ginger_ale', name: '干姜水 / 姜汁汽水', alias: 'ganjiangshui ginger ale', cat: 'drink', n: [38, 0, 0, 9.4, 0, 9.4, 20], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'tonic_water', name: '汤力水', alias: 'tangli shui tonic', cat: 'drink', n: [34, 0, 0, 8.5, 0, 8.5, 10], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'soda_water', name: '苏打水（无糖）', alias: 'sudashui soda water', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 20], s: [['一瓶', 500], ['小瓶', 330]], f: ['quick'] },
  { id: 'mineral_water', name: '矿泉水', alias: 'kuangquanshui mineral water', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 5], s: [['一瓶', 550], ['大瓶', 1000]], f: ['quick'] },
  { id: 'kangshifu_icetea', name: '康师傅 冰红茶', alias: 'kangshifu binghongcha', cat: 'drink', n: [31, 0, 0, 7.7, 0, 7.7, 25], s: [['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'kangshifu_greentea', name: '康师傅 绿茶（蜂蜜茉莉）', alias: 'kangshifu lvcha', cat: 'drink', n: [27, 0, 0, 6.6, 0, 6.6, 20], s: [['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'tongyi_icetea', name: '统一 冰红茶', alias: 'tongyi binghongcha', cat: 'drink', n: [32, 0, 0, 8, 0, 8, 25], s: [['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'tongyi_greentea', name: '统一 绿茶', alias: 'tongyi lvcha', cat: 'drink', n: [26, 0, 0, 6.4, 0, 6.4, 20], s: [['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'suntory_oolong', name: '三得利 乌龙茶（无糖）', alias: 'sandeli wulongcha suntory', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 10], s: [['一瓶', 500]], f: ['quick', 'caffeinated'] },
  { id: 'oriental_leaf', name: '农夫山泉 东方树叶（无糖）', alias: 'dongfangshuye oriental leaf', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 10], s: [['一瓶', 500]], f: ['quick', 'caffeinated'] },
  { id: 'chapai', name: '农夫山泉 茶π', alias: 'chapai chapi', cat: 'drink', n: [22, 0, 0, 5.4, 0, 5.4, 15], s: [['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'vita_lemon_tea', name: '维他 柠檬茶', alias: 'weita ningmengcha vita lemon tea', cat: 'drink', n: [43, 0, 0, 10.6, 0, 10.6, 15], s: [['一盒', 250], ['一瓶', 500]], f: ['sweetdrink', 'quick', 'caffeinated'] },
  { id: 'assam_milk_tea', name: '统一 阿萨姆奶茶', alias: 'tongyi asamu naicha', cat: 'drink', n: [60, 0.8, 1.5, 10.9, 0, 10.5, 50], s: [['一瓶', 500], ['小瓶', 250]], f: ['sweetdrink', 'quick', 'caffeinated'], nfs: 1 },
  { id: 'wanglaoji', name: '王老吉 凉茶', alias: 'wanglaoji liangcha', cat: 'drink', n: [38, 0, 0, 9.4, 0, 9.4, 20], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'jiaduobao', name: '加多宝 凉茶', alias: 'jiaduobao liangcha', cat: 'drink', n: [37, 0, 0, 9.2, 0, 9.2, 20], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'jianlibao', name: '健力宝 运动饮料', alias: 'jianlibao', cat: 'drink', n: [42, 0, 0, 10.4, 0, 10, 40], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'liugehetao', name: '六个核桃 核桃乳', alias: 'liugehetao hetaoru', cat: 'drink', n: [48, 0.6, 2.4, 6.2, 0, 5.6, 45], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'], nfs: 0.5 },
  { id: 'vitasoy_original', name: '维他奶 原味豆奶', alias: 'weitanai vitasoy', cat: 'drink', n: [45, 1.9, 1.3, 6.4, 0, 5.6, 40], s: [['一盒', 250]], f: ['sweetdrink', 'quick'], nfs: 1 },
  { id: 'yeshu_coconut', name: '椰树 椰汁', alias: 'yeshu yezhi', cat: 'drink', n: [69, 0.6, 3, 9.9, 0, 9, 40], s: [['一罐', 330], ['一瓶', 500]], f: ['sweetdrink', 'quick'], nfs: 1 },
  { id: 'zhajiang_noodle', name: '炸酱面', alias: 'zhajiangmian fried sauce noodle', cat: 'dish', n: [215, 8.5, 8.0, 27.0, 1.8, 2.0, 760], s: [['一碗', 400]], ...META_RECIPE_READY, note: '按面、炸酱和菜码拌匀后的整碗计；酱和面的比例随店家差异很大', f: ['est'] },
  { id: 'tingzai_congee', name: '艇仔粥', alias: 'tingzaizhou sampan congee', cat: 'dish', n: [72, 4.5, 2.2, 8.5, 0.3, 0.4, 420], s: [['一碗', 400]], ...META_RECIPE_READY, note: '按粥底加鱼片、花生、油条碎等配料的整碗计', f: ['breakfast', 'est'] },
  { id: 'dorayaki', name: '铜锣烧', alias: 'tongluoshao dorayaki', cat: 'snack', n: [285, 6.5, 4.5, 55.0, 2.0, 30.0, 180], s: [['一个', 70]], ...META_RECIPE_READY, note: '按红豆馅通用配方估算；不同品牌馅料和糖量差异较大', f: ['refined', 'est'], nfs: 1.5 },
  { id: 'taiyaki', name: '鲷鱼烧', alias: 'diaoyushao taiyaki', cat: 'snack', n: [255, 5.5, 5.0, 47.0, 1.8, 22.0, 200], s: [['一个', 100]], ...META_RECIPE_READY, note: '按红豆馅通用配方估算；奶油、卡仕达等其它馅料糖脂差异较大', f: ['refined', 'est'], nfs: 1.2 },
  { id: 'bozai_gao', name: '钵仔糕', alias: 'bozaigao bowl pudding', cat: 'snack', n: [165, 1.2, 0.3, 39.0, 0.6, 16.0, 30], s: [['一个', 80]], ...META_RECIPE_READY, note: '按粘米粉加糖的通用配方估算；红豆款糖和碳水略高', f: ['refined', 'est'], nfs: 0.5 },
  { id: 'tangyou_baba', name: '糖油粑粑', alias: 'tangyoubaba', cat: 'snack', n: [330, 3.0, 12.0, 53.0, 0.8, 24.0, 45], s: [['两个', 90]], ...META_RECIPE_READY, note: '糯米粉油炸后裹糖浆，糖和油都随做法差异很大', f: ['fried', 'refined', 'est'], nfs: 0 },
  { id: 'chengzhi_milk_drink', name: '橙汁乳饮料（通用）', alias: 'chengzhi ru yinliao', cat: 'drink', n: [52, 0.9, 1, 9.9, 0, 9.4, 40], s: [['一瓶', 450]], f: ['sweetdrink', 'quick', 'processed', 'est'], nfs: 1.2 },

  // ---------- 家常炒菜与汤（按成品 100g 估算） ----------
  // 用户按「一份」记账为主，所以份量给的是家庭一盘的常见量；
  // 油盐随各家做法差异很大，统一标 est，不冒充实测值。
  { id: 'pork_pepper_shred', name: '青椒肉丝', alias: 'qingjiaorousi shredded pork green pepper', cat: 'dish', n: [155, 10.0, 11.0, 4.0, 1.2, 2.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_edamame', name: '毛豆炒肉丝', alias: 'maodouchaorousi edamame pork', cat: 'dish', n: [190, 14.0, 11.5, 8.0, 3.0, 1.8, 650], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_onion', name: '洋葱炒肉片', alias: 'yangcongchaoroupian onion pork', cat: 'dish', n: [175, 10.5, 12.0, 6.5, 1.2, 3.5, 680], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_zhacai', name: '榨菜肉丝', alias: 'zhacairousi pickled mustard pork', cat: 'dish', n: [170, 11.0, 12.0, 4.0, 1.5, 1.5, 1400], s: [['一份', 200]], ...META_RECIPE_READY, note: '榨菜本身含盐很高，钠随品牌和漂洗程度差异很大', f: ['processed', 'est'] },
  { id: 'pork_lettuce_stem', name: '莴笋炒肉片', alias: 'wosunchaoroupian celtuce pork', cat: 'dish', n: [150, 9.5, 11.0, 3.5, 1.0, 1.5, 640], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_cucumber', name: '黄瓜炒肉片', alias: 'huangguachaoroupian cucumber pork', cat: 'dish', n: [140, 9.0, 10.5, 2.8, 0.8, 1.5, 620], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_green_bean', name: '豆角炒肉', alias: 'doujiaochaorou green bean pork', cat: 'dish', n: [165, 9.0, 12.0, 6.5, 2.2, 2.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_dried_tofu', name: '香干炒肉丝', alias: 'xianggan chaorousi dried tofu pork', cat: 'dish', n: [210, 15.0, 14.5, 5.0, 1.5, 1.2, 780], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_snow_pea', name: '荷兰豆炒肉片', alias: 'helandouchaoroupian snow pea pork', cat: 'dish', n: [155, 9.5, 11.0, 5.5, 2.0, 2.5, 660], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_water_bamboo', name: '茭白炒肉丝', alias: 'jiaobaichaorousi water bamboo pork', cat: 'dish', n: [150, 9.0, 11.0, 4.5, 1.5, 1.8, 650], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'pork_garlic_leaf', name: '蒜苗炒肉', alias: 'suanmiaochaorou garlic sprout pork', cat: 'dish', n: [175, 10.0, 13.0, 5.0, 1.5, 1.5, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'egg_cucumber', name: '黄瓜炒鸡蛋', alias: 'huangguachaojidan cucumber egg', cat: 'dish', n: [130, 7.5, 10.0, 2.5, 0.6, 1.5, 520], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'egg_bittergourd', name: '苦瓜炒蛋', alias: 'kuguachaodan bitter gourd egg', cat: 'dish', n: [135, 7.0, 10.5, 3.0, 1.2, 1.0, 540], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'egg_onion', name: '洋葱炒蛋', alias: 'yangcongchaodan onion egg', cat: 'dish', n: [140, 7.0, 10.5, 5.0, 1.0, 3.0, 530], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'vinegar_cabbage', name: '醋溜白菜', alias: 'culiubaicai vinegar cabbage', cat: 'dish', n: [85, 1.5, 6.5, 5.5, 1.3, 3.0, 620], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'stir_youmaicai', name: '清炒油麦菜', alias: 'qingchaoyoumaicai stir fried indian lettuce', cat: 'dish', n: [75, 1.8, 6.0, 3.0, 1.2, 1.2, 580], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'stir_water_spinach', name: '炒空心菜', alias: 'chaokongxincai water spinach', cat: 'dish', n: [80, 2.2, 6.2, 3.5, 1.5, 1.0, 600], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'mushroom_bokchoy', name: '香菇青菜', alias: 'xianggu qingcai shiitake bok choy', cat: 'dish', n: [85, 2.5, 6.2, 4.5, 1.8, 1.5, 610], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'baby_cabbage_soup', name: '上汤娃娃菜', alias: 'shangtangwawacai baby cabbage broth', cat: 'dish', n: [70, 2.8, 4.5, 3.5, 1.2, 1.5, 650], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'vinegar_lotus_root', name: '醋溜藕片', alias: 'culiuoupian vinegar lotus root', cat: 'dish', n: [110, 1.5, 5.5, 14.0, 1.5, 4.0, 560], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'stir_yam', name: '清炒山药', alias: 'qingchaoshanyao stir fried yam', cat: 'dish', n: [110, 2.0, 5.0, 15.0, 1.0, 1.5, 520], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'stir_pumpkin', name: '素炒南瓜', alias: 'suchaonangua stir fried pumpkin', cat: 'dish', n: [90, 1.2, 5.0, 11.0, 1.5, 5.0, 450], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'tomato_cauliflower', name: '西红柿炒菜花', alias: 'xihongshichaocaihua tomato cauliflower', cat: 'dish', n: [85, 2.5, 6.0, 5.0, 2.0, 2.5, 580], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'cola_chicken_wing', name: '可乐鸡翅', alias: 'kelejichi cola chicken wings', cat: 'dish', n: [230, 17.0, 14.0, 8.0, 0.2, 7.0, 720], s: [['一份', 180]], ...META_RECIPE_READY, note: '糖主要来自可乐与冰糖，按加进去的糖计入游离糖', f: ['est'] },
  { id: 'braised_chicken_wing', name: '红烧鸡翅', alias: 'hongshaojichi braised chicken wings', cat: 'dish', n: [215, 17.5, 14.0, 4.5, 0.2, 3.5, 780], s: [['一份', 180]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'chestnut_chicken', name: '板栗烧鸡', alias: 'banlishaoji chestnut chicken', cat: 'dish', n: [200, 13.0, 11.0, 13.0, 1.5, 3.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'scallion_beef', name: '葱爆牛肉', alias: 'congbaoniurou scallion beef', cat: 'dish', n: [190, 16.0, 12.5, 3.5, 0.8, 1.8, 720], s: [['一份', 200]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'liu_rou_duan', name: '溜肉段', alias: 'liuroduan crispy pork', cat: 'dish', n: [265, 13.0, 17.0, 14.0, 0.5, 4.0, 750], s: [['一份', 200]], ...META_RECIPE_READY, f: ['fried', 'est'] },
  { id: 'garlic_ribs', name: '蒜香排骨', alias: 'suanxiangpaigu garlic pork ribs', cat: 'dish', n: [280, 17.0, 21.0, 5.0, 0.3, 2.5, 760], s: [['一份', 200]], ...META_RECIPE_READY, note: '按去骨可食部估算，带骨称重会高估摄入', f: ['fried', 'est'] },
  { id: 'beer_duck', name: '啤酒鸭', alias: 'pijiuya beer duck', cat: 'dish', n: [235, 16.0, 17.0, 3.5, 0.5, 1.5, 730], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'spicy_shrimp', name: '香辣虾', alias: 'xianglaxia spicy shrimp', cat: 'dish', n: [175, 17.0, 10.5, 3.5, 0.8, 1.5, 850], s: [['一份', 200]], ...META_RECIPE_READY, note: '按去壳可食部计，虾壳重量不计入', f: ['est'] },
  { id: 'winter_melon_ball_soup', name: '冬瓜丸子汤', alias: 'dongguawanzitang winter melon meatball soup', cat: 'dish', n: [55, 3.5, 3.2, 3.0, 0.6, 1.2, 480], s: [['一份', 300]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'luffa_egg_soup', name: '丝瓜蛋汤', alias: 'sigua dantang luffa egg soup', cat: 'dish', n: [45, 2.5, 2.8, 2.5, 0.6, 1.2, 440], s: [['一份', 300]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'cabbage_tofu_soup', name: '白菜豆腐汤', alias: 'baicai doufu tang cabbage tofu soup', cat: 'dish', n: [50, 3.5, 2.8, 2.8, 0.8, 1.0, 460], s: [['一份', 300]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'corn_rib_soup', name: '玉米排骨汤', alias: 'yumipaigutang corn pork rib soup', cat: 'dish', n: [70, 4.5, 3.5, 5.5, 0.8, 2.0, 470], s: [['一份', 350]], ...META_RECIPE_READY, note: '按连汤带料一起计；只喝汤不吃料时蛋白会明显偏低', f: ['est'] },
  { id: 'yam_rib_soup', name: '山药排骨汤', alias: 'shanyaopaigutang yam pork rib soup', cat: 'dish', n: [75, 4.5, 3.8, 6.0, 0.6, 1.0, 470], s: [['一份', 350]], ...META_RECIPE_READY, note: '按连汤带料一起计；只喝汤不吃料时蛋白会明显偏低', f: ['est'] },
  { id: 'tomato_fish', name: '番茄龙利鱼', alias: 'fanqielongliyu tomato basa fish', cat: 'dish', n: [105, 13.0, 4.5, 3.5, 0.8, 2.2, 620], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'mushroom_chicken', name: '香菇滑鸡', alias: 'xiangguhuaji shiitake chicken', cat: 'dish', n: [165, 15.0, 10.0, 4.0, 1.2, 1.5, 690], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },
  { id: 'minced_pork_eggplant', name: '肉末茄子', alias: 'roumoqiezi minced pork eggplant', cat: 'dish', n: [165, 6.5, 12.5, 7.0, 2.2, 3.0, 700], s: [['一份', 250]], ...META_RECIPE_READY, f: ['est'] },

  // ---------- 下馆子常见菜（按餐馆成品 100g 估算） ----------
  // 「一份」是整盘或砂锅的常见上桌重量；两人分食时按实际吃到的比例记录。
  { id: 'nongjia_yiwangxiang', name: '农家一碗香', alias: 'nongjia yiwanxiang 一碗香 农家菜 辣椒炒肉炒蛋', cat: 'dish', n: [220, 13.0, 17.0, 6.0, 0.8, 1.5, 760], s: [['一份', 300]], ...META_RECIPE_READY, note: '按猪肉、鸡蛋和辣椒同炒估算；肥瘦肉比例与用油量会明显影响热量', f: ['est'] },
  { id: 'soybean_pork_trotter', name: '黄豆焖猪脚', alias: 'huangdou men zhujiao 黄豆猪脚 黄豆猪蹄 黄豆炖猪蹄 soybean pork trotter', cat: 'dish', n: [285, 18.0, 21.0, 7.0, 2.0, 1.0, 720], s: [['一份可食部', 250]], ...META_RECIPE_READY, note: '按去骨猪脚皮肉和熟黄豆可食部估算，不含骨头；汤汁和糖色用量因店而异', f: ['est'] },
  { id: 'dry_pot_qianye_tofu', name: '干锅千叶豆腐', alias: 'ganguo qianyedoufu 千页豆腐 干锅豆腐', cat: 'dish', n: [205, 10.0, 15.0, 9.0, 1.2, 2.0, 900], s: [['一份', 300]], ...META_RECIPE_READY, note: '按千叶豆腐、五花肉和配菜同炒估算；盘底余油不计入', f: ['est'] },
  { id: 'dry_pot_potato', name: '干锅土豆片', alias: 'ganguo tudoupian 干锅洋芋片 dry pot potato', cat: 'dish', n: [165, 3.5, 11.0, 17.0, 2.2, 1.5, 780], s: [['一份', 300]], ...META_RECIPE_READY, note: '按土豆片过油后与配菜干锅炒制估算；是否油炸和盘底余油会造成较大差异', f: ['est'] },
  { id: 'pepper_salt_ribs', name: '椒盐排骨', alias: 'jiaoyan paigu salt pepper ribs', cat: 'dish', n: [285, 17.0, 22.0, 7.0, 0.3, 1.0, 800], s: [['一份可食部', 220]], ...META_RECIPE_READY, note: '按去骨可食部和附着炸粉计，不含骨头；实际整盘称重不能直接当作可食重量', f: ['fried', 'est'] },
  { id: 'fish_head_tofu_soup', name: '鱼头豆腐汤', alias: 'yutou doufu tang fish head tofu soup', cat: 'dish', n: [75, 7.0, 4.5, 3.0, 0.4, 0.6, 420], s: [['一份可食部', 400]], ...META_RECIPE_READY, note: '按鱼肉、豆腐和整碗汤计，不含鱼骨；只喝汤或不喝汤都会改变实际营养', f: ['est'] },
  { id: 'lotus_root_rib_soup', name: '莲藕排骨汤', alias: 'lianou paigu tang lotus root rib soup', cat: 'dish', n: [80, 5.5, 4.0, 6.0, 1.0, 1.0, 420], s: [['一份可食部', 400]], ...META_RECIPE_READY, note: '按去骨排骨肉、莲藕和整碗汤计；只喝汤不吃料时蛋白质会明显更低', f: ['est'] },
  { id: 'ground_pot_chicken', name: '地锅鸡', alias: 'diguoji 地锅鸡贴饼 ground pot chicken', cat: 'dish', n: [185, 13.0, 8.0, 17.0, 1.0, 2.5, 720], s: [['一份可食部', 350]], ...META_RECIPE_READY, note: '按鸡肉可食部、贴饼和附着汤汁一起估算，不含鸡骨与盘底余汁', f: ['est'] },
  { id: 'sizzling_japanese_tofu', name: '铁板日本豆腐', alias: 'tieban riben doufu 玉子豆腐 鸡蛋豆腐 sizzling japanese tofu', cat: 'dish', n: [165, 7.0, 12.0, 8.0, 0.5, 2.0, 780], s: [['一份', 300]], ...META_RECIPE_READY, note: '按日本豆腐裹粉煎炸后加酱汁和配菜估算；裹粉与用油量差异较大', f: ['fried', 'est'] },
  { id: 'dry_pot_frog', name: '干锅牛蛙', alias: 'ganguo niuwa dry pot frog', cat: 'dish', n: [160, 19.0, 8.0, 7.0, 1.0, 1.0, 900], s: [['一份可食部', 300]], ...META_RECIPE_READY, note: '按牛蛙肉、配菜和附着油汁可食部估算，不含骨头和盘底余油', f: ['est'] },
  { id: 'stir_fried_intestine', name: '溜肥肠', alias: 'liufeichang 熘肥肠 炒肥肠 stir fried pork intestine', cat: 'dish', n: [260, 12.0, 22.0, 6.0, 0.5, 1.0, 900], s: [['一份', 250]], ...META_RECIPE_READY, note: '按熟肥肠、配菜和芡汁估算；预煮去油程度会显著影响脂肪', f: ['est'] },
  { id: 'casserole_tofu', name: '砂锅豆腐煲', alias: 'shaguo doufubao 豆腐砂锅 tofu casserole', cat: 'dish', n: [105, 7.0, 6.5, 5.0, 1.2, 1.5, 650], s: [['一份', 350]], ...META_RECIPE_READY, note: '按豆腐、菌菇蔬菜和整份汤汁估算；加入五花肉或油炸豆腐时热量会更高', f: ['est'] },
  { id: 'pickled_cabbage_pork', name: '酸菜白肉', alias: 'suancai bairou 东北酸菜汆白肉 pickled cabbage pork', cat: 'dish', n: [145, 8.0, 11.0, 4.0, 1.2, 1.0, 950], s: [['一份', 350]], ...META_RECIPE_READY, note: '按五花肉、酸菜和整碗汤计；酸菜用量、漂洗和喝汤多少会显著影响钠', f: ['est'] },
  { id: 'chili_scrambled_egg', name: '辣椒炒鸡蛋', alias: 'lajiao chao jidan 青椒炒蛋 尖椒炒蛋 chili scrambled egg', cat: 'dish', n: [150, 8.0, 11.5, 4.0, 1.3, 2.0, 560], s: [['一份', 250]], ...META_RECIPE_READY, note: '按鸡蛋和鲜辣椒同炒估算；主要差异来自鸡蛋数量与用油量', f: ['est'] },
];

/*
 * 菜肴的游离糖：按 WHO 定义，只有做菜时「加进去的糖」和果汁糖算游离糖，
 * 蔬菜、肉、乳里自带的糖不算。
 *
 * 之前所有菜肴都没写 nfs，等于把炒青菜里青菜自带的糖也计进了游离糖上限——
 * 一天三盘菜能凭空多出十几克，占 50g 上限的两三成。
 * 总糖是一回事，游离糖是另一回事，界面上的「游离糖上限」说的是后者。
 *
 * 下面是每 100g 成品里「加进去的那部分糖」的估计。没列出的菜按 0 处理：
 * 清蒸、白灼、汆汤、清炒、水煮、炖菜、汤面和粥本来就不放糖，糖全部来自食材。
 *
 * 精度与营养数据本身一致（都是 est）：只区分「不加糖 / 提鲜一撮 /
 * 明显用糖调味 / 糖是主味」四个量级，不追求小数位上的准确。
 */
const DISH_ADDED_SUGAR = Object.freeze({
  // 糖是主味：糖醋、锅包肉、咕咾肉、可乐鸡翅、京酱（甜面酱）
  sweet_sour_rib: 12.5, guobaorou: 12.0, sweet_sour_pork: 11.0, sweet_sour_pork_canton: 8.5,
  beijing_sauce_pork: 6.5, cola_chicken_wing: 6.5,
  // 明显用糖调味：红烧糖色、照烧、卤汁、鱼香、寿司醋，以及面包、沙拉酱、番茄酱、咖喱块等含糖调料
  braised_pork: 5.0, dongpo_pork: 5.0, eel_rice: 4.0, teriyaki_chicken_rice: 4.0,
  yuxiang_eggplant: 4.0, burger: 3.5, fried_chicken_burger: 3.5, yuxiang: 3.5,
  buldak_noodle_ready: 3.0, char_siu_rice: 3.0, gyudon: 3.0, liu_rou_duan: 3.0, pad_thai: 3.0,
  braised_chicken_wing: 2.5, braised_eggplant: 2.5, meigan_pork: 2.5, sanbei_chicken: 2.5,
  sandwich_egg: 2.5, sushi: 2.5, sushi_hand_roll: 2.2, takoyaki: 2.2, gongbao: 2.0,
  kungpao_shrimp: 2.0, oyakodon: 2.0, pork_rice: 2.0, rice_burger: 2.0, stirfried_niangao: 2.0,
  tuna_sandwich: 2.0, vinegar_lotus_root: 2.0, chicken_wrap: 1.8, omelette_rice: 1.8,
  braised_tofu: 1.5, chestnut_chicken: 1.5, curry_rice: 1.5, disanxian: 1.5, onion_ring: 1.5,
  pizza: 1.5, roast_duck_rice: 1.5, street_egg_burger: 1.5, twice_pork: 1.5,
  vinegar_cabbage: 1.5, bibimbap: 1.2, cold_wood_ear: 1.2, curry_chicken_rice: 1.2,
  kelp_salad: 1.2, lo_mei: 1.2, pork_trotter_rice: 1.2, claypot_rice: 1.0, cold_noodle: 1.0,
  corn_soup: 1.0, kimchi_stew: 1.0, minced_pork_eggplant: 1.0, roast_goose_rice: 1.0,
  self_heating_rice_meal: 1.0, tomato_egg: 1.0,
  // 只是提鲜的一撮糖，或蚝油、豉汁、辣酱带进来的少量糖
  braised_chicken: 0.8, braised_chicken_rice: 0.8, chicken_cutlet_rice: 0.8,
  chicken_salad_wrap: 0.8, dapanji: 0.8, eggplant_rice: 0.8, fried_skewers: 0.8,
  garlic_ribs: 0.8, home_style_tofu: 0.8, liangpi_spicy: 0.8, lion_head: 0.8,
  nanchang_rice_noodle: 0.8, pork_rib_rice: 0.8, salad_chicken: 0.8, salad_veg: 0.8,
  saliva_chicken: 0.8, sliced_beef_offal: 0.8, smashed_cucumber: 0.8, tom_yum: 0.8,
  bbq_corn: 0.5, bbq_eggplant: 0.5, bbq_pork_belly: 0.5, bobo_chicken: 0.5,
  fried_rice_vermicelli_cn: 0.5, guokui: 0.5, kaobing_meat: 0.5, laziji: 0.5, lotus_stirfry: 0.5,
  luosifen: 0.5, malatang: 0.5, maocai: 0.5, mushu_pork: 0.5, northeast_rice_wrap: 0.5,
  oden: 0.5, oyster_lettuce: 0.5, poke_bowl: 0.5, pork_onion: 0.5, scallion_beef: 0.5,
  scallion_lamb: 0.5, scrambled_egg_tomato_rice: 0.5, sizzling_beef: 0.5, spicy_hotpot: 0.5,
  spring_roll: 0.5, steamed_pork_rib_rice: 0.5, steamed_rib: 0.5, stir_pumpkin: 0.5,
  suanla_fen: 0.5, tomato_beef_brisket: 0.5, wolf_tooth_potato: 0.5, bbq_skewer_veg: 0.3,
  chicken_leg_rice: 0.3, dry_fried_bean: 0.3, dry_pot_cauliflower: 0.3, duck_leg_rice: 0.3,
  egg_onion: 0.3, farm_pork_stirfry: 0.3, garlic_sprout_pork: 0.3, luobo_niunanbao: 0.3,
  pork_edamame: 0.3, pork_green_bean: 0.3, pork_pepper_shred: 0.3, pork_snow_pea: 0.3,
  pork_water_bamboo: 0.3, sour_beef_hotpot: 0.3, soy_sauce_fried_rice: 0.3,
  stir_pork_cabbage: 0.3, tomato_beef_noodle: 0.3, tomato_cauliflower: 0.3, tomato_fish: 0.3,
  broccoli_shrimp: 0.2, hotpot_clear: 0.2, hotpot_spicy: 0.2, zucchini_egg: 0.2,
  nongjia_yiwangxiang: 0.5, soybean_pork_trotter: 0.8, dry_pot_qianye_tofu: 0.8,
  dry_pot_potato: 0.5, pepper_salt_ribs: 0.3, sizzling_japanese_tofu: 0.8,
  dry_pot_frog: 0.5, stir_fried_intestine: 0.5, casserole_tofu: 0.2,
  chili_scrambled_egg: 0.2,
});

// 旧库兼容迁移：不改营养数字，只把已能确定的来源、估算边界和糖口径显式化。
// 这样导出数据或其它消费者不必依赖 isEstimated() 的 UI 兜底才能知道复合菜是估算值。
const LEGACY_BROTH_NOTES = Object.freeze({
  beef_noodle: '按面、牛肉和整碗汤计；若不喝汤，实际钠和摄入重量会更低',
  wonton: '按馄饨和整碗汤计；若不喝汤，实际钠会更低',
  hotpot_clear: '按涮菜、肉和附着汤汁计，不包含饮用锅底',
  malatang: '按食材和约三分之一汤汁计；喝完整汤会显著增加钠',
  chicken_soup: '按鸡肉和整碗汤计',
  seaweed_egg_soup: '按配料和整碗汤计',
  tomato_egg_soup: '按配料和整碗汤计',
  oden: '按食材和约四分之一汤汁计；不喝汤时钠更低',
  ramen: '按面、配料和整碗汤计；若不喝汤，实际钠会更低',
  corn_soup: '按整碗浓汤计',
  boiled_pork: '按肉片、配菜和附着油汤计，不包含饮用盘底余汤',
  boiled_fish: '按鱼肉、配菜和附着油汤计，不包含鱼骨和饮用盘底余汤',
  hotpot_spicy: '按涮肉、配菜和附着汤汁计，不包含饮用红汤锅底',
  beef_brisket_noodle: '按面、牛腩和整碗汤计；若不喝汤，实际钠会更低',
  tomato_beef_noodle: '按面、牛肉和整碗汤计；若不喝汤，实际钠会更低',
  suanla_fen: '按粉、配料和整碗汤计；若不喝汤，实际钠会更低',
  luosifen: '按粉、配料和整碗汤计；若不喝汤，实际钠会更低',
  miso_soup: '按整碗汤计',
  tom_yum: '按配料和整碗汤计',
});

// WHO 游离糖不包含完整食物中未被释放、也未额外添加的内源糖。
// 这些旧条目都是原味完整谷薯、豆、坚果种子或蛋；用 nfs 明确总糖中的非游离部分。
const INTRINSIC_SUGAR_IDS = new Set([
  'oats', 'rice_brown', 'sweet_potato', 'potato', 'corn', 'quinoa', 'purple_potato',
  'yam', 'taro', 'millet_congee', 'black_rice', 'water_caltrop', 'spaghetti_cooked',
  'macaroni_cooked', 'oatmeal_porridge', 'rice_sheet', 'rice_vermicelli_cooked',
  'wheat_vermicelli_cooked', 'alkaline_noodle_cooked',
  'soybean', 'black_soybean', 'chickpea', 'mung_bean', 'red_bean', 'edamame',
  'fuzhu', 'tofu_firm', 'tofu_silken', 'fuzhu_soaked', 'wheat_gluten', 'soy_milk_black', 'tempeh',
  'almond', 'walnut', 'cashew', 'peanut', 'pistachio', 'sunflower_seed', 'pumpkin_seed',
  'sesame', 'chia', 'flaxseed', 'hazelnut', 'macadamia', 'apricot_kernel',
  'sunflower_seed_kernel', 'pine_nut',
  'egg_whole', 'egg_white', 'egg_fried', 'duck_egg_boiled', 'quail_egg', 'seaweed_sheet',
]);

for (const food of FOODS) {
  // 旧饮品最初没有单位元数据，界面会把 250ml 错写成 250g。只补能确定的
  // 计量口径，不给旧营养数字虚构来源；新旧饮品从此都统一显示 ml。
  if (food.cat === 'drink') {
    food.basis ||= '100ml';
    food.state ||= 'ready';
    food.edibleRatio ??= 1;
    food.carbBasis ||= 'total';
  }
  if (food.id === 'juice_orange') food.nfs = 0;
  if (food.id === 'coconut_water') {
    food.cat = 'drink';
    food.basis = '100ml';
    food.state ||= 'ready';
    food.edibleRatio ??= 1;
    food.carbBasis ||= 'total';
    food.nfs = 0;
  }

  if (food.cat === 'dish') {
    if (!food.f.includes('est')) food.f = [...food.f, 'est'];
    food.note ||= LEGACY_BROTH_NOTES[food.id]
      || '通用成品配方估算；用油、调味和原料比例会随家庭或餐馆做法变化';
    // nfs = 不属于 WHO 游离糖的那部分，也就是食材自带的糖
    if (food.nfs === undefined) {
      const totalSugar = Number(food.n[5]) || 0;
      const added = Math.min(DISH_ADDED_SUGAR[food.id] || 0, totalSugar);
      food.nfs = Math.round((totalSugar - added) * 10) / 10;
    }
  }

  if (food.id === 'mcd_bigmac') {
    food.source = SOURCE_MCDONALDS_CN;
    food.basis = '100g';
    food.state = 'ready';
    food.edibleRatio = 1;
    food.carbBasis = 'total';
    food.note ||= '由官网单份营养和本库记录的单份重量换算；品牌更新配方或份量后需复核';
  } else if (food.cat === 'chain' && !food.f.includes('est')) {
    food.f = [...food.f, 'est'];
    food.note ||= '未保存可复核的当前在售版本官方营养表，按现有代表值估算';
  } else if (food.id === 'mcd_sundae' && !food.f.includes('est')) {
    food.f = [...food.f, 'est'];
    food.note ||= '未保存可复核的当前在售版本官方营养表，按现有代表值估算';
  }

  if (INTRINSIC_SUGAR_IDS.has(food.id) && food.nfs == null) food.nfs = food.n[5];
}

/**
 * 份量参照：用身体部位和常见容器来估重。
 * 没有厨房秤的时候，这比让人凭空报「克」靠谱得多。
 */
export const PORTION_TIPS = {
  meat: '一个手掌心大小、约手掌厚 ≈ 100g 生肉（熟后缩水到约 75g）',
  seafood: '一块手掌心大小的鱼 ≈ 100g；中等大小的虾一只 ≈ 10g',
  egg: '一个中等鸡蛋去壳 ≈ 50g',
  dairy: '常见牛奶盒 250ml；酸奶杯 150~200g；一片芝士 ≈ 20g',
  soy: '超市盒装豆腐一整盒 ≈ 350g，半盒 ≈ 175g',
  staple: '一个成年拳头 ≈ 150g 米饭；普通饭碗装平 ≈ 200g，冒尖 ≈ 300g',
  veg: '双手捧起一捧生叶菜 ≈ 100g；炒熟后体积缩一半，一拳 ≈ 150g',
  fruit: '一个拳头大的水果 ≈ 150g；一小把浆果 ≈ 50g',
  nut: '掌心平铺一层不堆叠 ≈ 25g（约 20 颗巴旦木）',
  drink: '一次性纸杯 ≈ 200ml；易拉罐 330ml；奶茶中杯 500ml',
  snack: '一小包薯片 ≈ 50g；一格独立包装巧克力 ≈ 10g',
  dish: '外卖餐盒的一个主菜格 ≈ 250g；餐馆一盘炒菜 ≈ 400g，通常是两人份',
  chain: '按品牌的标准份量计。套餐要把主食、小食、饮料分别记；奶茶记得选对糖度，全糖和三分糖能差 100 多千卡',
  other: '普通瓷勺一平勺油 ≈ 10g；啤酒瓶盖一平盖盐 ≈ 5g',
};

/** 该条营养是否为推算值（品牌未公开完整营养表） */
export function isEstimated(food) {
  // recipe 和通用复合菜都属于估算；连锁食品只有保存了可复核 label 来源才允许不标估算。
  return food?.source?.type === 'recipe'
    || food.cat === 'dish'
    || (food.cat === 'chain' && food?.source?.type !== 'label')
    || (food.f || []).includes('est');
}

/**
 * 用通用 Atwater 系数复核每 100g 宏量营养对应的能量。
 * total 碳水含纤维，先扣除纤维再按 4 kcal/g，纤维按 2 kcal/g；
 * available 碳水已不含纤维，不能再次扣除。
 */
export function macroEnergyPer100(food) {
  const p = per100(food);
  const availableCarb = food.carbBasis === 'available'
    ? p.carb
    : Math.max(p.carb - p.fiber, 0);
  return p.protein * 4 + p.fat * 9 + availableCarb * 4 + p.fiber * 2;
}

export function portionTip(food) {
  return PORTION_TIPS[food.cat] || PORTION_TIPS.other;
}

/**
 * 把「一份」「一小把」这类量词拆成可计数的单位：
 * 显示成「1.5 份」而不是「1.5 一份」。
 */
export function unitLabel(servingName) {
  return String(servingName).replace(/^一(?=[^\d])/, '') || servingName;
}

/** 名称 -> 食物 的索引 */
export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

/** 复合食物是否支持逐项选择原料；目前用于清补凉，结构可复用于沙拉、麻辣烫等。 */
export function hasFoodMix(food) {
  return Array.isArray(food?.mix?.components) && food.mix.components.length > 0;
}

/** 返回一份新的默认原料表，调用方可以直接修改而不会污染食物库。 */
export function defaultFoodMix(food) {
  if (!hasFoodMix(food)) return {};
  return Object.fromEntries(food.mix.components.map((component) => [
    component.foodId,
    Math.max(0, Number(component.defaultGrams) || 0),
  ]));
}

const roundMix = (value, decimals = 1) => {
  const scale = 10 ** decimals;
  return Math.round((Number(value) || 0) * scale) / scale;
};

/**
 * 把复合食物的原料逐项换算再求和。
 * amounts 省略时使用默认配方；一旦传入对象，未出现的原料按 0 处理，便于彻底取消某项。
 */
export function foodMixNutrition(food, amounts = null) {
  if (!hasFoodMix(food)) throw new TypeError('这个食物没有可组合配方');
  const selected = amounts == null ? defaultFoodMix(food) : amounts;
  const total = {
    kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0,
    totalSugar: 0, sugar: 0, sodium: 0,
  };
  const components = [];
  let grams = 0;

  for (const component of food.mix.components) {
    const ingredient = FOOD_BY_ID.get(component.foodId);
    if (!ingredient) throw new Error(`复合食物缺少原料：${component.foodId}`);
    const max = Math.max(0, Number(component.max) || 1000);
    const amount = Math.min(max, Math.max(0, roundMix(selected?.[component.foodId] ?? 0)));
    if (amount <= 0) continue;
    const nutrients = nutrientsFor(ingredient, amount);
    for (const key of Object.keys(total)) total[key] += Number(nutrients[key]) || 0;
    grams += amount;
    components.push({
      foodId: component.foodId,
      name: ingredient.name,
      label: component.label || ingredient.name,
      grams: amount,
      unit: component.unit || (ingredient.basis === '100ml' ? 'ml' : 'g'),
    });
  }

  return {
    grams: roundMix(grams),
    nutrients: {
      kcal: Math.round(total.kcal),
      protein: roundMix(total.protein),
      fat: roundMix(total.fat),
      carb: roundMix(total.carb),
      fiber: roundMix(total.fiber),
      totalSugar: roundMix(total.totalSugar),
      sugar: roundMix(total.sugar),
      sodium: Math.round(total.sodium),
    },
    components,
  };
}

/** 把 n 数组展开成具名对象（每 100g） */
export function per100(food) {
  const [kcal, protein, fat, carb, fiber, sugar, sodium] = food.n;
  return { kcal, protein, fat, carb, fiber, sugar, totalSugar: sugar, sodium };
}

/**
 * 每 100g 的游离糖（WHO 定义）。n[5] 始终是总糖；这里只扣除有依据的内源性糖，
 * 茶饮糖度只缩放可调糖，固定配料糖仍保留。
 */
export function freeSugarPer100(food, levelKey = DEFAULT_SUGAR_LEVEL) {
  const base = per100(food);
  const adjusted = applySugarLevel(food, base, levelKey);
  let nonFree = 0;
  if (food.cat === 'fruit' || food.cat === 'veg' || (food.f || []).includes('natsugar')) {
    nonFree = adjusted.sugar;
  } else if (Number.isFinite(Number(food.nfs))) {
    nonFree = Number(food.nfs);
  } else if (hasSugarLevel(food)) {
    // 旧茶饮数据没有逐一拆分时，把“无糖仍有的糖”保守视作乳糖/完整配料内源糖；
    // 果汁、水果泥等明确属于游离糖的条目必须显式写 nfs: 0。
    nonFree = Math.min(Number(food.sf) || 0, adjusted.sugar);
  }
  return Math.max(0, Math.round((adjusted.sugar - Math.min(nonFree, adjusted.sugar)) * 10) / 10);
}

/** 兼容建议引擎的比例接口；风味乳品等可以是 0~1 之间，不再强迫二选一。 */
export function freeSugarFactor(food) {
  const total = per100(food).sugar;
  return total > 0 ? freeSugarPer100(food) / total : 0;
}

/**
 * 茶饮的糖度档位。国内奶茶店基本都是这五档（少数店把「七分糖」叫「少糖」、
 * 「三分糖」叫「微糖」）。ratio 指的是加进去的那部分糖保留多少。
 */
export const SUGAR_LEVELS = [
  { key: 'full', label: '全糖', ratio: 1 },
  { key: 'seven', label: '七分糖', alias: '少糖', ratio: 0.7 },
  { key: 'half', label: '半糖', ratio: 0.5 },
  { key: 'three', label: '三分糖', alias: '微糖', ratio: 0.3 },
  { key: 'none', label: '无糖', ratio: 0 },
];

export const DEFAULT_SUGAR_LEVEL = 'full';

/** 该食物是否支持选糖度 */
export function hasSugarLevel(food) {
  return (food.f || []).includes('tealevel');
}

export function sugarLevel(key) {
  const found = SUGAR_LEVELS.find((l) => l.key === key);
  if (!found) throw new RangeError(`不认识的糖度：${key}`);
  return found;
}

/**
 * 按糖度换算每 100g 的热量与糖。
 * 只有「可调糖」随档位缩放；sf 是无糖档仍存在的总糖，其中有多少不属于游离糖由 nfs 说明。
 */
function applySugarLevel(food, p, levelKey) {
  if (!hasSugarLevel(food) || !levelKey || levelKey === 'full') return p;
  const ratio = sugarLevel(levelKey).ratio;
  const floor = Math.min(Number(food.sf) || 0, p.sugar);
  const addedSugar = Math.max(p.sugar - floor, 0);
  const removed = addedSugar * (1 - ratio);
  return {
    ...p,
    sugar: Math.round((floor + addedSugar * ratio) * 10) / 10,
    carb: Math.max(0, Math.round((p.carb - removed) * 10) / 10),
    kcal: Math.max(0, Math.round(p.kcal - removed * ATWATER_CARB)),
  };
}

const ATWATER_CARB = 4;

/**
 * 按克数换算营养。totalSugar 是总糖；sugar 是 WHO 游离糖，与每日上限对应。
 * @param {string} [levelKey] 茶饮糖度，缺省按全糖
 */
export function nutrientsFor(food, grams, levelKey) {
  const p = applySugarLevel(food, per100(food), levelKey);
  const k = Math.max(0, Number(grams) || 0) / 100;
  const r = (v) => Math.round(v * k * 10) / 10;
  return {
    kcal: Math.round(p.kcal * k),
    protein: r(p.protein),
    fat: r(p.fat),
    carb: r(p.carb),
    fiber: r(p.fiber),
    totalSugar: r(p.sugar),
    sugar: r(freeSugarPer100(food, levelKey || DEFAULT_SUGAR_LEVEL)),
    sodium: Math.round(p.sodium * k),
  };
}

/** 两个词的字符重合度（0~1）：用来兜底匹配「番茄炒鸡蛋」→「番茄炒蛋」这类说法差异 */
function charSimilarity(a, b) {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const ch of setA) if (setB.has(ch)) common += 1;
  return (2 * common) / (setA.size + setB.size);
}

/** 模糊搜索：名称、别名、分类、字符重合度 */
export function searchFoods(query, list = FOODS, limit = 30) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  const scored = [];
  let index = 0;
  for (const f of list) {
    const order = index; index += 1;   // 同分时保持录入顺序，见下方 sort
    const name = f.name.toLowerCase();
    const alias = (f.alias || '').toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (alias.startsWith(q)) score = 50;
    else if (alias.includes(q)) score = 35;
    else if ((CATEGORIES[f.cat] || '').includes(q)) score = 20;
    else if (q.length >= 3) {
      // 兜底：叫法不完全一致时按字符重合度打分。
      // 这样「番茄炒鸡蛋」会把「番茄炒蛋」排在「番茄」前面，
      // 而不是让最短的那条仅因为被完整包含就抢到高分。
      // 别名里的中文俗称也参与，「西红柿炒蛋」才能找到「番茄炒蛋」。
      let sim = charSimilarity(q, name);
      for (const token of alias.split(/\s+/)) {
        if (token.length >= 2 && /[\u4e00-\u9fa5]/.test(token)) {
          sim = Math.max(sim, charSimilarity(q, token));
        }
      }
      if (sim >= 0.5) score = Math.round(45 * sim);
    }
    if (score > 0) scored.push({ f, score, order });
  }
  // 同分时按录入顺序，而不是按名称：数据里同品牌是按常点程度排的，
  // 按名称排会让「肯德基 醇香土豆泥」跑到「劲脆鸡腿堡」前面。
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((x) => x.f);
}
