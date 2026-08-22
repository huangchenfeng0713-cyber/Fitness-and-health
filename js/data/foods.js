/**
 * 食物营养库（每 100g 可食部）
 * 数据参考《中国食物成分表》标准版及常见品牌营养标签的通用值，用于估算而非临床用途。
 *
 * 字段：
 *   id       唯一标识
 *   name     中文名
 *   alias    搜索别名（拼音首字母 / 俗称）
 *   cat      分类
 *   n        每 100g：[热量kcal, 蛋白g, 脂肪g, 碳水g, 膳食纤维g, 糖g, 钠mg]
 *   s        常用份量 [[名称, 克数], ...]
 *   f        语义标记（无法从营养数字推导的部分）
 *            fried 油炸 / refined 精制 / processed 加工肉或深加工 / whole 全谷物
 *            quick 便利店随手可得 / breakfast 适合早餐 / late 适合睡前 / cook 需烹饪
 *            sweetdrink 含糖饮料 / alcohol 酒精 / natsugar 糖来自天然乳糖，不计入游离糖
 *            est 该品牌未公开完整营养表，数值按同类食品推算
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
  { id: 'instant_noodle', name: '方便面（含调料）', alias: 'fangbianmian instant noodle', cat: 'staple', n: [470, 9.5, 21.0, 60.0, 2.0, 4.0, 1800], s: [['一包', 100]], f: ['fried', 'refined', 'processed', 'quick'] },
  { id: 'dumpling_pork', name: '猪肉水饺', alias: 'shuijiao dumpling 饺子 shuijiao', cat: 'staple', n: [230, 9.0, 8.5, 28.0, 1.4, 1.5, 480], s: [['一个', 20], ['一盘12个', 240]], f: [] },
  { id: 'sweet_potato', name: '红薯（蒸）', alias: 'hongshu sweet potato', cat: 'staple', n: [90, 1.6, 0.2, 20.7, 2.2, 6.5, 28], s: [['一个中等', 180]], f: ['whole', 'breakfast'] },
  { id: 'potato', name: '土豆（蒸）', alias: 'tudou potato 马铃薯 洋芋', cat: 'staple', n: [81, 2.0, 0.2, 17.8, 1.4, 0.9, 6], s: [['一个中等', 150]], f: ['whole'] },
  { id: 'corn', name: '玉米（煮）', alias: 'yumi corn', cat: 'staple', n: [112, 4.0, 1.2, 22.8, 2.9, 3.2, 15], s: [['一根', 200]], f: ['whole', 'breakfast'] },
  { id: 'youtiao', name: '油条', alias: 'youtiao fried dough', cat: 'staple', n: [388, 6.9, 17.6, 51.0, 0.9, 1.0, 585], s: [['一根', 60]], f: ['fried', 'refined', 'breakfast'] },
  { id: 'quinoa', name: '藜麦（熟）', alias: 'limai quinoa', cat: 'staple', n: [120, 4.4, 1.9, 21.3, 2.8, 0.9, 7], s: [['一份', 150]], f: ['whole'] },
  { id: 'rice_noodle', name: '米粉（煮熟）', alias: 'mifen rice noodle', cat: 'staple', n: [109, 2.0, 0.2, 24.9, 0.5, 0.1, 90], s: [['一碗', 250]], f: ['refined'] },
  { id: 'zongzi', name: '肉粽', alias: 'zongzi', cat: 'staple', n: [195, 5.5, 6.5, 29.0, 1.0, 2.0, 420], s: [['一个', 180]], f: [] },
  { id: 'shaobing', name: '烧饼', alias: 'shaobing', cat: 'staple', n: [326, 8.0, 12.0, 47.0, 1.6, 2.0, 520], s: [['一个', 80]], f: ['refined', 'breakfast'] },
  { id: 'buckwheat_noodle', name: '荞麦面（煮熟）', alias: 'qiaomai soba', cat: 'staple', n: [99, 5.1, 0.4, 20.0, 1.8, 0.5, 60], s: [['一碗', 250]], f: ['whole'] },

  // ---------- 肉禽 ----------
  { id: 'chicken_breast', name: '鸡胸肉（水煮）', alias: 'jixiong chicken breast', cat: 'meat', n: [133, 29.5, 1.9, 0, 0, 0, 62], s: [['一块', 150], ['一份', 100]], f: ['cook'] },
  { id: 'chicken_thigh', name: '鸡腿肉（去皮）', alias: 'jitui chicken thigh', cat: 'meat', n: [181, 24.0, 9.2, 0, 0, 0, 88], s: [['一只', 120]], f: ['cook'] },
  { id: 'chicken_wing', name: '鸡翅（烤）', alias: 'jichi chicken wing', cat: 'meat', n: [266, 22.0, 19.5, 1.0, 0, 0.5, 420], s: [['一只', 45]], f: [] },
  { id: 'fried_chicken', name: '炸鸡（带皮）', alias: 'zhaji fried chicken', cat: 'meat', n: [298, 20.0, 20.5, 9.5, 0.4, 0.5, 700], s: [['一块', 100]], f: ['fried', 'processed'] },
  { id: 'pork_lean', name: '猪瘦肉', alias: 'zhushourou lean pork', cat: 'meat', n: [143, 20.3, 6.2, 1.5, 0, 0, 57], s: [['一份', 100]], f: ['cook'] },
  { id: 'pork_belly', name: '五花肉', alias: 'wuhuarou pork belly', cat: 'meat', n: [518, 9.0, 53.0, 2.4, 0, 0, 60], s: [['一份', 100]], f: [] },
  { id: 'beef_lean', name: '牛腱 / 瘦牛肉', alias: 'niurou beef 牛肉 瘦牛肉', cat: 'meat', n: [160, 21.5, 7.5, 1.2, 0, 0, 62], s: [['一份', 100]], f: ['cook'] },
  { id: 'beef_steak', name: '西冷牛排', alias: 'niupai steak', cat: 'meat', n: [212, 24.0, 12.8, 0, 0, 0, 70], s: [['一块', 200]], f: [] },
  { id: 'lamb', name: '羊肉（瘦）', alias: 'yangrou lamb', cat: 'meat', n: [203, 19.0, 14.1, 0, 0, 0, 69], s: [['一份', 100]], f: [] },
  { id: 'duck', name: '烤鸭（带皮）', alias: 'kaoya duck', cat: 'meat', n: [436, 16.6, 38.4, 6.0, 0, 1.0, 83], s: [['一份', 100]], f: [] },
  { id: 'sausage', name: '香肠 / 火腿肠', alias: 'xiangchang sausage', cat: 'meat', n: [508, 12.0, 48.0, 6.0, 0, 3.0, 1300], s: [['一根', 60]], f: ['processed', 'quick'] },
  { id: 'bacon', name: '培根', alias: 'peigen bacon', cat: 'meat', n: [381, 22.4, 30.6, 2.0, 0, 1.0, 1500], s: [['一片', 25]], f: ['processed'] },
  { id: 'ham_lean', name: '低脂火腿片', alias: 'huotui ham', cat: 'meat', n: [120, 18.0, 4.0, 2.5, 0, 1.5, 1000], s: [['一片', 25]], f: ['processed', 'quick'] },
  { id: 'chicken_liver', name: '鸡肝', alias: 'jigan liver', cat: 'meat', n: [121, 16.6, 4.8, 2.8, 0, 0, 92], s: [['一份', 80]], f: [] },

  // ---------- 水产 ----------
  { id: 'salmon', name: '三文鱼', alias: 'sanwenyu salmon', cat: 'seafood', n: [208, 20.4, 13.4, 0, 0, 0, 59], s: [['一块', 120]], f: [] },
  { id: 'basa', name: '巴沙鱼 / 龙利鱼', alias: 'bashayu basa', cat: 'seafood', n: [90, 15.0, 3.0, 0, 0, 0, 100], s: [['一片', 150]], f: ['cook'] },
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
  { id: 'yogurt_sweet', name: '风味酸奶（含糖）', alias: 'fengwei suannai', cat: 'dairy', n: [92, 3.0, 2.7, 13.5, 0, 13.0, 60], s: [['一盒', 180]], f: ['quick'] },
  { id: 'cheese', name: '奶酪 / 芝士片', alias: 'nailao cheese', cat: 'dairy', n: [328, 25.7, 23.5, 3.5, 0, 2.0, 580], s: [['一片', 20]], f: ['quick', 'natsugar'] },
  { id: 'whey', name: '乳清蛋白粉', alias: 'ruqing whey protein', cat: 'dairy', n: [380, 78.0, 5.0, 8.0, 0, 3.0, 300], s: [['一勺', 30]], f: ['quick'] },

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
  { id: 'kimchi', name: '泡菜 / 酸菜', alias: 'paocai kimchi', cat: 'veg', n: [30, 1.6, 0.4, 5.5, 2.0, 2.0, 1200], s: [['一份', 80]], f: ['processed'] },

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
  { id: 'almond', name: '巴旦木 / 杏仁', alias: 'badanmu almond', cat: 'nut', n: [579, 21.2, 49.9, 21.6, 12.5, 4.4, 1], s: [['一小把', 25]], f: ['quick'] },
  { id: 'walnut', name: '核桃仁', alias: 'hetao walnut', cat: 'nut', n: [654, 15.2, 65.2, 13.7, 6.7, 2.6, 2], s: [['一小把', 25]], f: ['quick'] },
  { id: 'peanut', name: '花生（炒）', alias: 'huasheng peanut', cat: 'nut', n: [589, 24.0, 48.0, 21.0, 8.0, 4.0, 445], s: [['一小把', 25]], f: [] },
  { id: 'cashew', name: '腰果', alias: 'yaoguo cashew', cat: 'nut', n: [559, 17.3, 36.7, 41.6, 3.6, 5.9, 251], s: [['一小把', 25]], f: ['quick'] },
  { id: 'chia', name: '奇亚籽', alias: 'qiyazi chia', cat: 'nut', n: [486, 16.5, 30.7, 42.1, 34.4, 0, 16], s: [['一勺', 15]], f: [] },
  { id: 'peanut_butter', name: '花生酱', alias: 'huashengjiang peanut butter', cat: 'nut', n: [588, 25.0, 50.0, 20.0, 6.0, 9.0, 430], s: [['一勺', 15]], f: [] },

  // ---------- 饮品 ----------
  { id: 'water', name: '白水', alias: 'shui water', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 0], s: [['一杯', 250]], f: ['quick', 'late'] },
  { id: 'black_coffee', name: '美式咖啡（无糖）', alias: 'kafei coffee 咖啡 美式 黑咖啡', cat: 'drink', n: [2, 0.2, 0, 0.3, 0, 0, 3], s: [['一杯', 350]], f: ['quick'] },
  { id: 'latte', name: '拿铁（全脂）', alias: 'natie latte', cat: 'drink', n: [55, 3.0, 3.0, 4.3, 0, 4.3, 45], s: [['中杯', 350]], f: ['quick'] },
  { id: 'milk_tea', name: '奶茶（全糖）', alias: 'naicha milk tea', cat: 'drink', n: [86, 1.0, 3.2, 13.5, 0, 12.5, 40], s: [['中杯', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'cola', name: '可乐', alias: 'kele cola', cat: 'drink', n: [43, 0, 0, 10.8, 0, 10.8, 12], s: [['一罐', 330]], f: ['sweetdrink', 'quick'] },
  { id: 'cola_zero', name: '无糖可乐', alias: 'wutang kele zero cola', cat: 'drink', n: [0.4, 0, 0, 0.1, 0, 0, 12], s: [['一罐', 330]], f: ['quick'] },
  { id: 'juice_orange', name: '橙汁（100%）', alias: 'chengzhi juice', cat: 'drink', n: [45, 0.7, 0.2, 10.4, 0.2, 8.8, 3], s: [['一杯', 250]], f: ['sweetdrink', 'quick'] },
  { id: 'sports_drink', name: '运动饮料', alias: 'yundong yinliao sports drink', cat: 'drink', n: [26, 0, 0, 6.4, 0, 6.0, 45], s: [['一瓶', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'beer', name: '啤酒', alias: 'pijiu beer', cat: 'drink', n: [43, 0.4, 0, 3.6, 0, 0, 4], s: [['一罐', 330]], f: ['alcohol'] },
  { id: 'baijiu', name: '白酒（52度）', alias: 'baijiu liquor', cat: 'drink', n: [298, 0, 0, 0, 0, 0, 1], s: [['一两', 50]], f: ['alcohol'] },
  { id: 'green_tea', name: '茶（无糖）', alias: 'cha tea', cat: 'drink', n: [1, 0, 0, 0.2, 0, 0, 2], s: [['一杯', 250]], f: ['quick', 'late'] },

  // ---------- 零食甜点 ----------
  { id: 'potato_chips', name: '薯片', alias: 'shupian chips', cat: 'snack', n: [548, 6.0, 35.0, 52.0, 4.0, 2.5, 600], s: [['一小包', 50]], f: ['fried', 'processed', 'quick'] },
  { id: 'chocolate_milk', name: '牛奶巧克力', alias: 'qiaokeli chocolate', cat: 'snack', n: [546, 7.7, 31.3, 59.4, 3.4, 52.0, 79], s: [['一块', 25]], f: ['processed', 'quick'] },
  { id: 'chocolate_dark', name: '黑巧克力（85%）', alias: 'heiqiaokeli dark chocolate', cat: 'snack', n: [592, 10.0, 46.0, 30.0, 11.0, 14.0, 20], s: [['一块', 20]], f: ['quick'] },
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
  { id: 'beef_noodle', name: '牛肉面', alias: 'niuroumian beef noodle', cat: 'dish', n: [117, 6.5, 3.5, 15.0, 0.9, 1.0, 680], s: [['一碗', 600]], f: [] },
  { id: 'wonton', name: '馄饨（鲜肉）', alias: 'huntun wonton', cat: 'dish', n: [124, 6.0, 4.5, 15.0, 0.7, 1.0, 620], s: [['一碗', 350]], f: ['breakfast'] },
  { id: 'hotpot_clear', name: '清汤火锅（涮菜为主）', alias: 'huoguo hotpot 火锅 涮锅', cat: 'dish', n: [110, 9.0, 6.0, 5.0, 1.5, 1.0, 900], s: [['一份', 400]], f: [] },
  { id: 'malatang', name: '麻辣烫', alias: 'malatang', cat: 'dish', n: [145, 7.0, 9.5, 8.5, 1.5, 2.0, 1100], s: [['一份', 500]], f: [] },
  { id: 'burger', name: '汉堡（牛肉）', alias: 'hanbao burger', cat: 'dish', n: [270, 13.0, 13.0, 25.0, 1.2, 5.0, 520], s: [['一个', 200]], f: ['processed', 'quick'] },
  { id: 'french_fries', name: '薯条', alias: 'shutiao fries', cat: 'dish', n: [312, 3.5, 15.0, 41.0, 3.5, 0.5, 300], s: [['中份', 115]], f: ['fried', 'processed', 'quick'] },
  { id: 'pizza', name: '披萨（芝士）', alias: 'pisa pizza', cat: 'dish', n: [266, 11.0, 10.0, 33.0, 2.0, 3.5, 600], s: [['一块', 110]], f: ['processed'] },
  { id: 'sushi', name: '寿司卷', alias: 'shousi sushi', cat: 'dish', n: [150, 6.0, 2.5, 26.0, 0.8, 4.0, 400], s: [['一盒8个', 200]], f: ['quick'] },
  { id: 'salad_chicken', name: '鸡胸沙拉（轻食）', alias: 'shala salad 沙拉 轻食', cat: 'dish', n: [95, 10.5, 3.5, 5.5, 1.8, 2.0, 320], s: [['一份', 350]], f: ['quick'] },
  { id: 'sandwich_egg', name: '鸡蛋三明治', alias: 'sanmingzhi sandwich', cat: 'dish', n: [228, 10.0, 10.5, 23.0, 1.5, 4.0, 520], s: [['一个', 160]], f: ['quick', 'breakfast'] },
  { id: 'roast_chicken_leg', name: '烤鸡腿（便利店）', alias: 'kaojitui', cat: 'dish', n: [190, 22.0, 11.0, 1.0, 0, 0.5, 560], s: [['一只', 120]], f: ['quick'] },
  { id: 'steamed_fish', name: '清蒸鱼', alias: 'qingzhengyu steamed fish', cat: 'dish', n: [122, 18.5, 4.5, 1.0, 0, 0.5, 480], s: [['一份', 200]], f: [] },
  { id: 'stir_veg', name: '清炒时蔬', alias: 'qingchaoshishu', cat: 'dish', n: [78, 2.0, 6.0, 4.5, 1.8, 1.5, 480], s: [['一份', 200]], f: [] },
  { id: 'cold_noodle', name: '凉皮 / 凉面', alias: 'liangpi liangmian', cat: 'dish', n: [168, 3.5, 5.5, 26.0, 0.8, 2.0, 700], s: [['一份', 300]], f: ['refined'] },

  // ---------- 主食（补充） ----------
  { id: 'noodle_dry', name: '挂面（干）', alias: 'guamian', cat: 'staple', n: [346, 11.4, 0.9, 71.5, 1.5, 1.0, 160], s: [['一把', 100]], f: ['refined'] },
  { id: 'rice_congee_meat', name: '皮蛋瘦肉粥', alias: 'pidanshouroukzhou', cat: 'staple', n: [72, 3.5, 2.2, 9.6, 0.3, 0.5, 350], s: [['一碗', 400]], f: ['breakfast'] },
  { id: 'flatbread', name: '手抓饼', alias: 'shouzhuabing', cat: 'staple', n: [326, 6.5, 18.0, 34.0, 1.0, 2.0, 500], s: [['一张', 90]], f: ['fried', 'refined', 'breakfast'] },
  { id: 'jianbing', name: '煎饼果子', alias: 'jianbingguozi', cat: 'staple', n: [232, 8.0, 10.5, 26.0, 1.2, 2.0, 620], s: [['一个', 220]], f: ['breakfast'] },
  { id: 'wotou', name: '窝头（玉米面）', alias: 'wotou', cat: 'staple', n: [227, 6.0, 1.6, 47.0, 3.5, 2.0, 5], s: [['一个', 80]], f: ['whole', 'breakfast'] },
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
  { id: 'pork_rib', name: '排骨', alias: 'paigu 排骨 猪排', cat: 'meat', n: [278, 16.0, 23.0, 0.7, 0, 0, 62], s: [['一份', 150]], f: [] },
  { id: 'pork_minced', name: '猪肉馅（三分肥）', alias: 'zhurouxian', cat: 'meat', n: [260, 15.0, 22.0, 0.5, 0, 0, 60], s: [['一份', 100]], f: [] },
  { id: 'beef_minced', name: '牛肉馅', alias: 'niurouxian', cat: 'meat', n: [215, 19.0, 15.0, 0, 0, 0, 66], s: [['一份', 100]], f: [] },
  { id: 'beef_fatty', name: '肥牛卷', alias: 'feiniujuan', cat: 'meat', n: [285, 15.0, 25.0, 0.5, 0, 0, 70], s: [['一份', 150]], f: [] },
  { id: 'lamb_skewer', name: '羊肉串', alias: 'yangrouchuan', cat: 'meat', n: [280, 18.0, 22.0, 2.0, 0, 1.0, 480], s: [['一串', 25]], f: [] },
  { id: 'chicken_skewer', name: '烤鸡肉串', alias: 'kaojirouchuan', cat: 'meat', n: [195, 21.0, 11.0, 2.0, 0, 1.0, 450], s: [['一串', 30]], f: [] },
  { id: 'pork_liver', name: '猪肝', alias: 'zhugan', cat: 'meat', n: [129, 19.3, 3.5, 5.0, 0, 0, 68], s: [['一份', 80]], f: [] },
  { id: 'chicken_feet', name: '鸡爪', alias: 'jizhua', cat: 'meat', n: [254, 23.9, 16.4, 2.7, 0, 0, 169], s: [['一只', 40]], f: [] },
  { id: 'luncheon_meat', name: '午餐肉', alias: 'wucanrou', cat: 'meat', n: [229, 9.4, 15.9, 12.0, 0, 2.0, 980], s: [['一片', 30]], f: ['processed', 'quick'] },
  { id: 'meatball', name: '肉丸 / 撒尿牛丸', alias: 'rouwan', cat: 'meat', n: [200, 12.0, 13.0, 9.0, 0, 1.5, 700], s: [['一个', 25]], f: ['processed'] },
  { id: 'turkey_breast', name: '火鸡胸肉', alias: 'huojixiong turkey', cat: 'meat', n: [111, 24.0, 1.0, 0, 0, 0, 60], s: [['一份', 100]], f: ['cook'] },

  // ---------- 水产（补充） ----------
  { id: 'yellow_croaker', name: '黄花鱼', alias: 'huanghuayu', cat: 'seafood', n: [99, 17.9, 3.0, 0.1, 0, 0, 121], s: [['一条', 200]], f: [] },
  { id: 'hairtail', name: '带鱼', alias: 'daiyu', cat: 'seafood', n: [127, 17.7, 4.9, 3.1, 0, 0, 150], s: [['一段', 120]], f: [] },
  { id: 'grass_carp', name: '草鱼', alias: 'caoyu', cat: 'seafood', n: [113, 16.6, 5.2, 0, 0, 0, 46], s: [['一份', 150]], f: [] },
  { id: 'sea_bass', name: '鲈鱼', alias: 'luyu', cat: 'seafood', n: [105, 18.6, 3.4, 0, 0, 0, 144], s: [['一条', 250]], f: [] },
  { id: 'crab', name: '螃蟹', alias: 'pangxie', cat: 'seafood', n: [103, 17.5, 2.6, 2.3, 0, 0, 260], s: [['一只', 150]], f: [] },
  { id: 'scallop', name: '扇贝', alias: 'shanbei', cat: 'seafood', n: [60, 11.1, 0.6, 2.6, 0, 0, 339], s: [['一只', 25]], f: [] },
  { id: 'fish_ball', name: '鱼丸', alias: 'yuwan', cat: 'seafood', n: [110, 10.0, 3.0, 10.0, 0, 1.0, 600], s: [['一个', 20]], f: ['processed'] },
  { id: 'seaweed_sheet', name: '海苔 / 紫菜', alias: 'haitai zicai', cat: 'seafood', n: [250, 26.7, 1.1, 44.1, 21.6, 3.0, 710], s: [['一小包', 5]], f: ['quick'] },
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
  { id: 'condensed_milk', name: '炼乳', alias: 'lianru', cat: 'dairy', n: [321, 7.9, 8.7, 54.4, 0, 54.0, 127], s: [['一勺', 20]], f: [] },
  { id: 'cheese_stick', name: '奶酪棒', alias: 'nailaobang', cat: 'dairy', n: [200, 6.5, 10.0, 21.0, 0, 15.0, 200], s: [['一根', 25]], f: ['quick', 'processed'] },

  // ---------- 豆制品（补充） ----------
  { id: 'soymilk_sweet', name: '豆浆（加糖）', alias: 'tiandoujiang', cat: 'soy', n: [55, 2.8, 1.5, 7.5, 0.4, 6.0, 5], s: [['一杯', 300]], f: ['breakfast', 'quick'] },
  { id: 'tofu_skin', name: '豆皮 / 千张', alias: 'doupi qianzhang', cat: 'soy', n: [201, 24.5, 11.5, 1.0, 1.0, 0.5, 20], s: [['一份', 80]], f: [] },
  { id: 'tofu_fried', name: '油豆腐 / 豆泡', alias: 'youdoufu', cat: 'soy', n: [244, 17.0, 17.6, 6.0, 0.6, 0.5, 12], s: [['一个', 15]], f: ['fried'] },
  { id: 'douhua', name: '豆花 / 豆腐脑', alias: 'douhua doufunao', cat: 'soy', n: [47, 4.5, 1.9, 3.2, 0.3, 0.3, 380], s: [['一碗', 300]], f: ['breakfast'] },
  { id: 'natto', name: '纳豆', alias: 'nadou natto', cat: 'soy', n: [200, 18.0, 10.0, 12.0, 5.4, 4.0, 7], s: [['一盒', 50]], f: ['quick'] },
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
  { id: 'longan', name: '龙眼 / 桂圆', alias: 'longyan guiyuan', cat: 'fruit', n: [71, 1.2, 0.1, 16.6, 0.4, 15.0, 3], s: [['一份', 100]], f: [] },
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
  { id: 'americano_milk', name: '燕麦拿铁', alias: 'yanmainatie oat latte', cat: 'drink', n: [45, 1.0, 1.8, 6.5, 0.5, 5.0, 40], s: [['中杯', 350]], f: ['quick'] },
  { id: 'milk_tea_lowsugar', name: '奶茶（三分糖）', alias: 'naicha sanfen', cat: 'drink', n: [52, 1.0, 2.8, 5.5, 0, 4.5, 40], s: [['中杯', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'soda_lemon', name: '柠檬气泡水（无糖）', alias: 'qipaoshui', cat: 'drink', n: [1, 0, 0, 0.2, 0, 0, 15], s: [['一罐', 330]], f: ['quick', 'late'] },
  { id: 'yakult', name: '乳酸菌饮料', alias: 'ruusuanjun yakult', cat: 'drink', n: [71, 1.1, 0.1, 16.5, 0, 15.5, 25], s: [['一小瓶', 100]], f: ['sweetdrink', 'quick'] },
  { id: 'energy_drink', name: '功能饮料', alias: 'gongneng yinliao', cat: 'drink', n: [45, 0, 0, 11.0, 0, 11.0, 100], s: [['一罐', 250]], f: ['sweetdrink', 'quick'] },
  { id: 'wine_red', name: '红酒', alias: 'hongjiu', cat: 'drink', n: [85, 0.1, 0, 2.6, 0, 0.6, 4], s: [['一杯', 150]], f: ['alcohol'] },
  { id: 'sake', name: '清酒', alias: 'qingjiu sake', cat: 'drink', n: [134, 0.5, 0, 5.0, 0, 0, 2], s: [['一小杯', 100]], f: ['alcohol'] },
  { id: 'protein_shake', name: '蛋白奶昔（即饮）', alias: 'danbai naixi', cat: 'drink', n: [50, 8.0, 1.0, 2.5, 0, 2.0, 90], s: [['一瓶', 330]], f: ['quick'] },
  { id: 'coconut_milk_drink', name: '椰奶', alias: 'yenai', cat: 'drink', n: [104, 1.0, 7.0, 9.5, 0, 8.0, 30], s: [['一盒', 245]], f: ['sweetdrink', 'quick'] },
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
  { id: 'yogurt_drink', name: '常温酸奶饮品', alias: 'suannai yinpin', cat: 'snack', n: [85, 2.5, 2.0, 14.0, 0, 12.0, 55], s: [['一瓶', 200]], f: ['quick'] },

  // ---------- 菜肴外卖（补充） ----------
  { id: 'kungpao_shrimp', name: '油焖大虾', alias: 'youmendaxia', cat: 'dish', n: [148, 16.0, 8.0, 3.0, 0, 1.5, 700], s: [['一份', 200]], f: [] },
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
  { id: 'steamed_rib', name: '豉汁蒸排骨', alias: 'chizhipaigu', cat: 'dish', n: [245, 15.0, 18.0, 4.0, 0.3, 1.5, 780], s: [['一份', 200]], f: [] },
  { id: 'sweet_sour_rib', name: '糖醋排骨', alias: 'tangcupaigu', cat: 'dish', n: [320, 14.0, 22.0, 17.0, 0.3, 14.0, 700], s: [['一份', 200]], f: [] },
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
  { id: 'garlic_scallop', name: '蒜蓉粉丝蒸扇贝', alias: 'suanrongfensishanbei', cat: 'dish', n: [120, 9.0, 4.0, 12.0, 0.4, 1.0, 620], s: [['一只', 60]], f: [] },
  { id: 'crayfish', name: '小龙虾（蒜蓉）', alias: 'xiaolongxia', cat: 'dish', n: [135, 16.0, 6.5, 3.0, 0.2, 1.0, 900], s: [['一份', 300]], f: [] },
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
  { id: 'liangpi_spicy', name: '油泼面', alias: 'youpomian', cat: 'dish', n: [225, 6.5, 9.5, 29.0, 1.2, 1.0, 700], s: [['一份', 350]], f: [] },
  { id: 'guobaorou', name: '锅包肉', alias: 'guobaorou', cat: 'dish', n: [300, 12.0, 17.0, 26.0, 0.4, 13.0, 640], s: [['一份', 200]], f: ['fried'] },
  { id: 'kaobing_meat', name: '肉夹馍', alias: 'roujiamo', cat: 'dish', n: [275, 11.0, 13.0, 29.0, 1.2, 2.0, 700], s: [['一个', 200]], f: [] },
  { id: 'guokui', name: '生煎包', alias: 'shengjianbao', cat: 'dish', n: [255, 8.5, 12.0, 28.0, 1.0, 2.5, 520], s: [['一个', 45]], f: ['fried', 'breakfast'] },
  { id: 'xiaolongbao', name: '小笼包', alias: 'xiaolongbao', cat: 'dish', n: [230, 9.0, 10.0, 26.0, 0.9, 1.5, 500], s: [['一个', 25]], f: ['breakfast'] },
  { id: 'guotie', name: '锅贴 / 煎饺', alias: 'guotie jianjiao', cat: 'dish', n: [265, 9.0, 13.0, 27.0, 1.2, 1.5, 520], s: [['一个', 25]], f: ['fried'] },
  { id: 'fried_rice_yangzhou', name: '扬州炒饭', alias: 'yangzhouchaofan', cat: 'dish', n: [195, 6.5, 8.0, 24.0, 0.8, 1.2, 650], s: [['一份', 350]], f: ['fried'] },
  { id: 'claypot_rice', name: '煲仔饭', alias: 'baozaifan', cat: 'dish', n: [185, 8.0, 6.5, 24.0, 0.7, 2.0, 620], s: [['一份', 400]], f: [] },
  { id: 'steamed_pork_rib_rice', name: '粉蒸肉', alias: 'fenzhengrou', cat: 'dish', n: [290, 11.0, 20.0, 18.0, 0.6, 2.0, 680], s: [['一份', 200]], f: [] },
  { id: 'stew_beef_potato', name: '土豆炖牛肉', alias: 'tudoudunniurou', cat: 'dish', n: [148, 10.5, 8.0, 8.5, 1.0, 1.5, 700], s: [['一份', 300]], f: [] },
  { id: 'stew_pork_bean', name: '排骨炖豆角', alias: 'paigudundoujiao', cat: 'dish', n: [155, 9.0, 10.5, 6.5, 1.6, 1.5, 680], s: [['一份', 300]], f: [] },
  { id: 'chicken_mushroom_stew', name: '小鸡炖蘑菇', alias: 'xiaojidunmogu', cat: 'dish', n: [140, 12.0, 8.5, 4.0, 1.2, 1.0, 700], s: [['一份', 300]], f: [] },
  { id: 'dongpo_pork', name: '东坡肉', alias: 'dongporou', cat: 'dish', n: [450, 10.0, 42.0, 8.0, 0, 6.0, 750], s: [['一块', 100]], f: [] },
  { id: 'salt_pepper_shrimp', name: '椒盐虾', alias: 'jiaoyanxia', cat: 'dish', n: [175, 18.0, 9.0, 5.0, 0.2, 0.5, 900], s: [['一份', 200]], f: ['fried'] },
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
  { id: 'yinsijuan', name: '银丝卷 / 馒头片', alias: 'yinsijuan', cat: 'staple', n: [235, 7.0, 2.5, 47.0, 1.3, 4.0, 220], s: [['一个', 70]], f: ['refined', 'breakfast'] },
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
  { id: 'mackerel', name: '鲅鱼 / 青花鱼', alias: 'bayu qinghuayu saba', cat: 'seafood', n: [205, 21.0, 13.0, 0, 0, 0, 74], s: [['一块', 120]], f: [] },
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
  { id: 'fruit_tea', name: '水果茶（含糖）', alias: 'shuiguocha', cat: 'drink', n: [45, 0.2, 0.1, 11.0, 0.3, 10.0, 15], s: [['中杯', 500]], f: ['sweetdrink', 'quick'] },
  { id: 'cocoa_milk', name: '可可牛奶', alias: 'kekeniunai', cat: 'drink', n: [80, 3.2, 2.5, 11.5, 0.5, 10.0, 60], s: [['一盒', 250]], f: ['sweetdrink', 'quick'] },
  { id: 'whisky', name: '威士忌', alias: 'weishiji whisky', cat: 'drink', n: [250, 0, 0, 0.1, 0, 0, 1], s: [['一杯', 45]], f: ['alcohol'] },
  { id: 'cocktail', name: '鸡尾酒', alias: 'jiweijiu cocktail', cat: 'drink', n: [155, 0.1, 0.1, 12.0, 0, 11.0, 10], s: [['一杯', 200]], f: ['alcohol', 'sweetdrink'] },

  // ---------- 零食（第三批） ----------
  { id: 'oat_bar', name: '燕麦棒 / 能量棒', alias: 'yanmaibang energy bar', cat: 'snack', n: [420, 7.0, 15.0, 63.0, 5.0, 25.0, 180], s: [['一根', 40]], f: ['processed', 'quick'] },
  { id: 'dried_mango', name: '芒果干', alias: 'mangguogan', cat: 'snack', n: [314, 2.0, 0.5, 78.0, 3.0, 62.0, 30], s: [['一小包', 40]], f: ['processed', 'quick'] },
  { id: 'freeze_dried_fruit', name: '冻干水果', alias: 'donggan shuiguo', cat: 'snack', n: [350, 3.0, 1.0, 84.0, 8.0, 60.0, 15], s: [['一小包', 20]], f: ['processed', 'quick'] },
  { id: 'tofu_snack', name: '豆干（零食装）', alias: 'dougan lingshi', cat: 'snack', n: [230, 22.0, 11.0, 12.0, 1.5, 4.0, 1300], s: [['一小包', 40]], f: ['processed', 'quick'] },
  { id: 'chicken_breast_snack', name: '即食鸡胸肉', alias: 'jishijixiong', cat: 'snack', n: [115, 22.0, 2.0, 2.0, 0, 1.0, 700], s: [['一袋', 100]], f: ['quick', 'processed'] },
  { id: 'konjac_jelly', name: '蒟蒻果冻', alias: 'jurao guodong konjac', cat: 'snack', n: [45, 0, 0, 11.0, 1.0, 9.0, 30], s: [['一个', 60]], f: ['processed', 'quick'] },
  { id: 'chestnut', name: '板栗（熟）', alias: 'banli', cat: 'snack', n: [214, 4.8, 1.5, 46.0, 1.7, 8.0, 5], s: [['一小把', 60]], f: ['quick'] },
  { id: 'dried_tofu_skin_snack', name: '素毛肚 / 辣味素食', alias: 'sumaodu', cat: 'snack', n: [400, 15.0, 25.0, 30.0, 3.0, 5.0, 1600], s: [['一小包', 50]], f: ['processed', 'quick'] },
  { id: 'wafer', name: '威化饼', alias: 'weihuabing wafer', cat: 'snack', n: [510, 5.0, 27.0, 62.0, 1.0, 32.0, 200], s: [['一块', 20]], f: ['refined', 'processed', 'quick'] },
  { id: 'red_bean_bun', name: '豆沙包', alias: 'doushabao', cat: 'snack', n: [250, 6.0, 3.0, 50.0, 2.0, 20.0, 180], s: [['一个', 80]], f: ['breakfast'] },

  // ---------- 连锁快餐 ----------
  { id: 'kfc_spicy_burger', name: '肯德基 香辣鸡腿堡', alias: 'kfc kendeji xianglajitui', cat: 'chain', n: [270, 13.5, 13.0, 24.9, 1.4, 3.8, 595], s: [['一个', 185]], f: ['quick', 'processed'] },
  { id: 'kfc_crispy_burger', name: '肯德基 劲脆鸡腿堡', alias: 'kfc jincui', cat: 'chain', n: [284, 13.7, 14.2, 24.7, 1.3, 3.7, 605], s: [['一个', 190]], f: ['quick', 'processed'] },
  { id: 'kfc_no_burger', name: '肯德基 新奥尔良烤鸡腿堡', alias: 'kfc xinaoerliang kaojituibao', cat: 'chain', n: [221, 13.8, 7.2, 24.6, 1.3, 4.6, 513], s: [['一个', 195]], f: ['quick', 'processed'] },
  { id: 'kfc_og_chicken', name: '肯德基 吮指原味鸡', alias: 'kfc shunzhiyuanweiji yuanweiji', cat: 'chain', n: [283, 22.2, 18.9, 7.8, 0.6, 0.6, 778], s: [['一块', 90]], f: ['quick', 'processed'] },
  { id: 'kfc_no_wing', name: '肯德基 新奥尔良烤翅', alias: 'kfc kaochi', cat: 'chain', n: [244, 22.2, 14.4, 6.7, 0.0, 4.4, 733], s: [['一只', 45]], f: ['quick', 'processed'] },
  { id: 'kfc_hot_wing', name: '肯德基 香辣鸡翅', alias: 'kfc xianglajichi', cat: 'chain', n: [333, 20.0, 22.2, 13.3, 0.7, 1.1, 778], s: [['一只', 45]], f: ['quick', 'processed'] },
  { id: 'kfc_nuggets', name: '肯德基 上校鸡块', alias: 'kfc shangxiaojikuai', cat: 'chain', n: [307, 17.3, 17.3, 20.0, 0.8, 0.7, 733], s: [['五块', 75]], f: ['quick', 'processed'] },
  { id: 'kfc_fries', name: '肯德基 薯条（中）', alias: 'kfc shutiao', cat: 'chain', n: [322, 4.3, 14.8, 42.6, 3.5, 0.4, 261], s: [['中份', 115]], f: ['quick', 'processed'] },
  { id: 'kfc_egg_tart', name: '肯德基 葡式蛋挞', alias: 'kfc danta putashidanta', cat: 'chain', n: [350, 5.8, 20.0, 36.7, 0.7, 20.0, 167], s: [['一个', 60]], f: ['quick', 'processed'] },
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
  { id: 'sb_latte', name: '星巴克 拿铁（中杯）', alias: 'starbucks xingbake natie', cat: 'chain', n: [54, 2.8, 2.8, 4.2, 0.0, 4.2, 37], s: [['中杯', 355]], f: ['quick', 'processed'] },
  { id: 'sb_mocha', name: '星巴克 摩卡（中杯）', alias: 'starbucks xingbake moka', cat: 'chain', n: [85, 2.8, 3.4, 10.7, 0.3, 9.0, 39], s: [['中杯', 355]], f: ['quick', 'processed'] },
  { id: 'sb_frappuccino', name: '星巴克 星冰乐（中杯）', alias: 'starbucks xingbingle', cat: 'chain', n: [85, 1.1, 3.1, 13.2, 0.0, 12.7, 51], s: [['中杯', 355]], f: ['quick', 'processed', 'est'] },
  { id: 'luckin_coconut', name: '瑞幸 生椰拿铁（大杯）', alias: 'luckin ruixing shengyenatie', cat: 'chain', n: [47, 1.1, 1.9, 6.2, 0.0, 5.5, 23], s: [['大杯', 470]], f: ['quick', 'processed', 'est'] },
  { id: 'luckin_thick_milk', name: '瑞幸 厚乳拿铁（大杯）', alias: 'luckin ruixing hourunatie', cat: 'chain', n: [51, 1.9, 2.3, 5.5, 0.0, 5.1, 30], s: [['大杯', 470]], f: ['quick', 'processed', 'est'] },
  { id: 'mixue_lemon', name: '蜜雪冰城 柠檬水（大杯）', alias: 'mixue miyuebingcheng ningmengshui', cat: 'chain', n: [29, 0.1, 0.0, 7.2, 0.1, 6.8, 2], s: [['大杯', 500]], f: ['quick', 'processed', 'est'] },
  { id: 'mixue_icecream', name: '蜜雪冰城 甜筒', alias: 'mixue tiantong', cat: 'chain', n: [214, 3.6, 8.6, 30.0, 0.4, 24.3, 86], s: [['一个', 70]], f: ['quick', 'processed', 'est'] },
  { id: 'heytea_grape', name: '喜茶 多肉葡萄（标准糖）', alias: 'heytea xicha duoroputao', cat: 'chain', n: [56, 0.4, 1.0, 11.2, 0.2, 9.6, 12], s: [['中杯', 500]], f: ['quick', 'processed', 'est'] },
  { id: 'chabaidao_mango', name: '茶百道 杨枝甘露', alias: 'chabaidao yangzhiganlu', cat: 'chain', n: [70, 0.6, 1.8, 12.6, 0.3, 10.4, 16], s: [['中杯', 500]], f: ['quick', 'processed', 'est'] },
  { id: 'bawang_milktea', name: '霸王茶姬 伯牙绝弦', alias: 'bawangchaji boyajuexian', cat: 'chain', n: [47, 1.3, 1.3, 7.4, 0.0, 6.0, 26], s: [['中杯', 470]], f: ['quick', 'processed', 'est'] },
  { id: 'laoxiangji_soup', name: '老乡鸡 肥西老母鸡汤', alias: 'laoxiangji feixilaomujitang', cat: 'chain', n: [32, 2.0, 2.2, 0.5, 0.0, 0.1, 200], s: [['一份', 400]], f: ['quick', 'processed', 'est'] },
  { id: 'laoxiangji_set', name: '老乡鸡 两菜一饭套餐', alias: 'laoxiangji taocan', cat: 'chain', n: [118, 4.7, 4.4, 14.5, 0.7, 1.1, 291], s: [['一份', 550]], f: ['quick', 'processed', 'est'] },
  { id: 'shaxian_dumpling', name: '沙县小吃 蒸饺（一两）', alias: 'shaxian zhengjiao', cat: 'chain', n: [208, 7.5, 8.3, 25.0, 1.0, 1.2, 433], s: [['一份', 120]], f: ['quick', 'processed', 'est'] },
  { id: 'shaxian_noodle', name: '沙县小吃 花生拌面', alias: 'shaxian banmian', cat: 'chain', n: [180, 4.8, 6.4, 25.2, 0.8, 1.6, 360], s: [['一份', 250]], f: ['quick', 'processed', 'est'] },
  { id: 'shaxian_stew', name: '沙县小吃 炖罐（排骨）', alias: 'shaxian dunguan', cat: 'chain', n: [57, 4.0, 3.7, 1.7, 0.1, 0.3, 214], s: [['一罐', 350]], f: ['quick', 'processed', 'est'] },
  { id: 'saizeriya_gratin', name: '萨莉亚 芝士焗饭', alias: 'saizeriya salia zhishijufan', cat: 'chain', n: [150, 5.0, 5.5, 20.0, 0.8, 1.5, 300], s: [['一份', 400]], f: ['quick', 'processed', 'est'] },
  { id: 'hefu_noodle', name: '和府捞面 招牌汤面', alias: 'hefulaomian tangmian', cat: 'chain', n: [91, 4.0, 2.2, 13.6, 0.7, 0.7, 327], s: [['一份', 550]], f: ['quick', 'processed', 'est'] },
  { id: 'yoshinoya_beef', name: '吉野家 牛肉饭（中碗）', alias: 'yoshinoya jiyejia niuroufan', cat: 'chain', n: [144, 4.9, 4.4, 21.1, 0.7, 2.7, 311], s: [['中碗', 450]], f: ['quick', 'processed', 'est'] },

  // ---------- 茶饮连锁（糖度影响极大，主力品类按糖度分档） ----------
  { id: 'tea_boba_full', name: '珍珠奶茶（全糖）', alias: 'zhenzhunaicha bobo boba naicha', cat: 'chain', n: [94, 1.2, 2.8, 16.0, 0.2, 9.6, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_boba_half', name: '珍珠奶茶（半糖）', alias: 'zhenzhunaicha banging naicha', cat: 'chain', n: [78, 1.2, 2.8, 12.0, 0.2, 5.6, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_boba_low', name: '珍珠奶茶（三分糖）', alias: 'zhenzhunaicha sanfentang naicha', cat: 'chain', n: [70, 1.2, 2.8, 10.0, 0.2, 3.6, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_boba_none', name: '珍珠奶茶（无糖）', alias: 'zhenzhunaicha wutang naicha', cat: 'chain', n: [60, 1.2, 2.8, 7.6, 0.2, 1.2, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est'] },
  { id: 'tea_milk_plain_none', name: '奶茶（不加料·无糖）', alias: 'naicha wutang', cat: 'chain', n: [30, 1.0, 1.6, 2.8, 0.0, 1.0, 22], s: [['中杯 500ml', 500]], f: ['quick', 'est'] },
  { id: 'tea_cheese_top', name: '芝士奶盖茶', alias: 'zhishinaigai naigaicha', cat: 'chain', n: [64, 1.4, 3.4, 7.0, 0.0, 5.6, 28], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_brownsugar_boba', name: '黑糖珍珠鲜奶', alias: 'heitangzhenzhuxiannai heitang', cat: 'chain', n: [96, 1.8, 3.0, 15.2, 0.2, 10.4, 26], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_grass_jelly', name: '烧仙草', alias: 'shaoxiancao', cat: 'chain', n: [84, 1.2, 2.4, 14.4, 0.5, 8.0, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_taro_boba', name: '芋圆奶茶', alias: 'yuyuannaicha', cat: 'chain', n: [90, 1.2, 2.6, 15.2, 0.3, 8.4, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_fruit_light', name: '水果茶（半糖）', alias: 'shuiguocha guocha', cat: 'chain', n: [36, 0.2, 0.1, 8.8, 0.3, 7.6, 4], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_pure_none', name: '纯茶（无糖）', alias: 'chuncha wutangcha', cat: 'chain', n: [2, 0.0, 0.0, 0.3, 0.0, 0.0, 3], s: [['中杯 500ml', 500]], f: ['quick', 'est'] },
  { id: 'tea_lemon_light', name: '柠檬茶（半糖）', alias: 'ningmengcha', cat: 'chain', n: [32, 0.1, 0.0, 8.0, 0.1, 7.2, 3], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'tea_yogurt_fruit', name: '水果酸奶昔', alias: 'suannaixi', cat: 'chain', n: [76, 1.6, 1.8, 13.2, 0.3, 10.4, 30], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'mixue_boba', name: '蜜雪冰城 珍珠奶茶', alias: 'mixue miyuebingcheng zhenzhunaicha', cat: 'chain', n: [84, 1.0, 2.4, 14.6, 0.2, 8.4, 22], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'mixue_bingqilin_tea', name: '蜜雪冰城 冰淇淋红茶', alias: 'mixue bingqilinhongcha', cat: 'chain', n: [56, 0.6, 1.4, 10.2, 0.0, 8.8, 16], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'mixue_grape', name: '蜜雪冰城 摇摇奶昔', alias: 'mixue yaoyaonaixi', cat: 'chain', n: [78, 1.2, 2.2, 13.2, 0.1, 10.0, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'heytea_cheese_grape', name: '喜茶 芝芝葡萄', alias: 'heytea xicha zhizhiputao', cat: 'chain', n: [66, 1.2, 2.6, 9.6, 0.2, 8.0, 26], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'heytea_berry', name: '喜茶 芝芝莓莓', alias: 'heytea xicha zhizhimeimei', cat: 'chain', n: [64, 1.2, 2.6, 9.0, 0.3, 7.6, 26], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'heytea_brownsugar', name: '喜茶 烤黑糖波波牛乳', alias: 'heytea xicha kaoheitangbobo', cat: 'chain', n: [94, 1.8, 3.0, 14.8, 0.2, 10.0, 26], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'naixue_strawberry', name: '奈雪的茶 霸气芝士草莓', alias: 'naixue naixuedecha bpqizhishicaomei', cat: 'chain', n: [57, 1.2, 2.0, 8.3, 0.3, 7.0, 23], s: [['大杯 600ml', 600]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'naixue_treasure', name: '奈雪的茶 宝藏茶', alias: 'naixue baozangcha', cat: 'chain', n: [50, 0.5, 0.8, 10.3, 0.2, 8.0, 10], s: [['大杯 600ml', 600]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'chabaidao_taro', name: '茶百道 芋圆奶茶', alias: 'chabaidao yuyuannaicha', cat: 'chain', n: [90, 1.2, 2.6, 15.2, 0.3, 8.4, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'chabaidao_osmanthus', name: '茶百道 桂花乌龙奶茶', alias: 'chabaidao guihuawulong', cat: 'chain', n: [76, 1.2, 2.4, 12.0, 0.1, 6.8, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'guming_grape', name: '古茗 超A芝士葡萄', alias: 'guming chaoAzhishiputao', cat: 'chain', n: [64, 1.2, 2.4, 9.4, 0.2, 7.6, 26], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'guming_jasmine', name: '古茗 云雾茉莉奶绿', alias: 'guming yunwumolinailv', cat: 'chain', n: [72, 1.0, 2.2, 11.6, 0.1, 6.4, 23], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'hushang_purple_rice', name: '沪上阿姨 血糯米奶茶', alias: 'hushangayi xuenumi', cat: 'chain', n: [92, 1.4, 2.6, 15.4, 0.4, 8.0, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'yidiandian_boba', name: '一点点 波霸奶茶', alias: 'yidiandian bobanaicha', cat: 'chain', n: [88, 1.0, 2.6, 15.2, 0.2, 8.8, 23], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'yidiandian_sijinaiqing', name: '一点点 四季奶青', alias: 'yidiandian sijinaiqing', cat: 'chain', n: [66, 1.0, 2.2, 10.4, 0.0, 6.0, 22], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'coco_boba', name: 'CoCo都可 珍珠奶茶', alias: 'coco dukezhenzhunaicha', cat: 'chain', n: [86, 1.0, 2.6, 14.6, 0.2, 8.4, 23], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'coco_qingke', name: 'CoCo都可 青稞奶茶', alias: 'coco qingkenaicha', cat: 'chain', n: [84, 1.2, 2.4, 14.2, 0.4, 7.6, 23], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'shuyi_grassjelly', name: '书亦烧仙草 招牌烧仙草', alias: 'shuyi shaoxiancao', cat: 'chain', n: [86, 1.2, 2.4, 14.8, 0.5, 8.0, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'yihetang_kaonai', name: '益禾堂 烤奶', alias: 'yihetang kaonai', cat: 'chain', n: [70, 1.2, 2.2, 11.0, 0.0, 6.0, 24], s: [['中杯 500ml', 500]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'chayan_youlan', name: '茶颜悦色 幽兰拿铁', alias: 'chayanyuese youlannatie', cat: 'chain', n: [71, 1.5, 2.9, 9.6, 0.1, 5.8, 27], s: [['中杯 480ml', 480]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'bawang_osmanthus', name: '霸王茶姬 桂馥兰香', alias: 'bawangchaji guifulanxiang', cat: 'chain', n: [45, 1.3, 1.3, 7.0, 0.0, 5.5, 26], s: [['中杯 470ml', 470]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'luckin_velvet', name: '瑞幸 丝绒拿铁', alias: 'luckin ruixing sirongnatie', cat: 'chain', n: [53, 1.9, 2.3, 6.2, 0.0, 5.3, 30], s: [['大杯 470ml', 470]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'luckin_coconut_cloud', name: '瑞幸 椰云拿铁', alias: 'luckin ruixing yeyunnatie', cat: 'chain', n: [57, 1.3, 2.6, 7.2, 0.0, 6.4, 26], s: [['大杯 470ml', 470]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'luckin_americano', name: '瑞幸 美式（无糖）', alias: 'luckin ruixing meishi', cat: 'chain', n: [1, 0.1, 0.0, 0.2, 0.0, 0.0, 2], s: [['大杯 470ml', 470]], f: ['quick', 'est'] },
  { id: 'sb_matcha_latte', name: '星巴克 抹茶拿铁', alias: 'starbucks xingbake mochanatie', cat: 'chain', n: [68, 2.8, 2.5, 8.7, 0.3, 7.9, 39], s: [['中杯 355ml', 355]], f: ['quick', 'est', 'sweetdrink'] },
  { id: 'kudi_latte', name: '库迪 生椰拿铁', alias: 'kudi shengyenatie', cat: 'chain', n: [45, 1.1, 1.9, 6.0, 0.0, 5.3, 23], s: [['大杯 470ml', 470]], f: ['quick', 'est', 'sweetdrink'] },

  // ---------- 其他 ----------
  { id: 'oil', name: '食用油', alias: 'you oil', cat: 'other', n: [899, 0, 99.9, 0, 0, 0, 0], s: [['一勺', 10]], f: [] },
  { id: 'sugar', name: '白砂糖', alias: 'tang sugar', cat: 'other', n: [400, 0, 0, 99.9, 0, 99.9, 1], s: [['一勺', 8]], f: ['refined'] },
  { id: 'soy_sauce', name: '生抽 / 酱油', alias: 'jiangyou soy sauce', cat: 'other', n: [63, 5.6, 0.1, 10.1, 0.2, 3.0, 5757], s: [['一勺', 10]], f: [] },
  { id: 'mayo', name: '沙拉酱 / 蛋黄酱', alias: 'shalajiang mayo', cat: 'other', n: [680, 1.5, 75.0, 2.0, 0, 1.5, 600], s: [['一勺', 12]], f: ['processed'] },
];

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
  return (food.f || []).includes('est');
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

/** 把 n 数组展开成具名对象（每 100g） */
export function per100(food) {
  const [kcal, protein, fat, carb, fiber, sugar, sodium] = food.n;
  return { kcal, protein, fat, carb, fiber, sugar, sodium };
}

/**
 * 游离糖系数（WHO 定义）：完整水果和蔬菜里的糖、以及奶类的乳糖属于内源性糖，
 * 不计入「添加糖 / 游离糖」上限；果汁虽然来自水果，但榨汁后按游离糖计。
 */
export function freeSugarFactor(food) {
  if (food.cat === 'fruit' || food.cat === 'veg') return 0;
  if ((food.f || []).includes('natsugar')) return 0;
  return 1;
}

/** 按克数换算营养。sugar 一栏是游离糖，与每日添加糖上限对应。 */
export function nutrientsFor(food, grams) {
  const p = per100(food);
  const k = (Number(grams) || 0) / 100;
  const r = (v) => Math.round(v * k * 10) / 10;
  return {
    kcal: Math.round(p.kcal * k),
    protein: r(p.protein),
    fat: r(p.fat),
    carb: r(p.carb),
    fiber: r(p.fiber),
    sugar: r(p.sugar * freeSugarFactor(food)),
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
