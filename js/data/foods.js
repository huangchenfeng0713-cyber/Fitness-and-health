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
  other: '其他',
};

export const FOODS = [
  // ---------- 主食 ----------
  { id: 'rice_white', name: '米饭（白米）', alias: 'mifan rice', cat: 'staple', n: [116, 2.6, 0.3, 25.9, 0.3, 0, 2], s: [['小碗', 150], ['中碗', 200], ['大碗', 300]], f: ['refined'] },
  { id: 'rice_brown', name: '糙米饭', alias: 'caomi brown rice', cat: 'staple', n: [123, 2.8, 1.0, 25.6, 1.8, 0.4, 3], s: [['小碗', 150], ['中碗', 200]], f: ['whole'] },
  { id: 'congee', name: '白粥', alias: 'zhou porridge', cat: 'staple', n: [46, 1.1, 0.2, 9.9, 0.1, 0, 2], s: [['一碗', 300]], f: ['refined', 'breakfast'] },
  { id: 'oats', name: '燕麦片（干）', alias: 'yanmai oat', cat: 'staple', n: [377, 15.0, 6.7, 61.6, 10.1, 1.1, 3], s: [['一份', 40], ['一杯', 80]], f: ['whole', 'breakfast'] },
  { id: 'bread_white', name: '白吐司', alias: 'tusi bread', cat: 'staple', n: [280, 8.6, 3.5, 52.0, 2.2, 5.0, 460], s: [['一片', 35]], f: ['refined', 'quick', 'breakfast'] },
  { id: 'bread_whole', name: '全麦面包', alias: 'quanmai whole wheat', cat: 'staple', n: [246, 10.5, 3.4, 44.0, 6.0, 4.0, 420], s: [['一片', 40]], f: ['whole', 'quick', 'breakfast'] },
  { id: 'mantou', name: '馒头', alias: 'mantou steamed bun', cat: 'staple', n: [223, 7.0, 1.1, 47.0, 1.3, 2.0, 165], s: [['一个', 100]], f: ['refined', 'breakfast'] },
  { id: 'baozi_pork', name: '猪肉包子', alias: 'baozi', cat: 'staple', n: [227, 8.5, 8.0, 30.0, 1.2, 3.0, 480], s: [['一个', 90]], f: ['breakfast'] },
  { id: 'noodle_cooked', name: '面条（煮熟）', alias: 'miantiao noodle', cat: 'staple', n: [110, 3.9, 0.5, 22.0, 1.0, 0.4, 180], s: [['一碗', 250]], f: ['refined'] },
  { id: 'instant_noodle', name: '方便面（含调料）', alias: 'fangbianmian instant noodle', cat: 'staple', n: [470, 9.5, 21.0, 60.0, 2.0, 4.0, 1800], s: [['一包', 100]], f: ['fried', 'refined', 'processed', 'quick'] },
  { id: 'dumpling_pork', name: '猪肉水饺', alias: 'shuijiao dumpling', cat: 'staple', n: [230, 9.0, 8.5, 28.0, 1.4, 1.5, 480], s: [['一个', 20], ['一份12个', 240]], f: [] },
  { id: 'sweet_potato', name: '红薯（蒸）', alias: 'hongshu sweet potato', cat: 'staple', n: [90, 1.6, 0.2, 20.7, 2.2, 6.5, 28], s: [['一个中等', 180]], f: ['whole', 'breakfast'] },
  { id: 'potato', name: '土豆（蒸）', alias: 'tudou potato', cat: 'staple', n: [81, 2.0, 0.2, 17.8, 1.4, 0.9, 6], s: [['一个中等', 150]], f: ['whole'] },
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
  { id: 'beef_lean', name: '牛腱 / 瘦牛肉', alias: 'niurou beef', cat: 'meat', n: [160, 21.5, 7.5, 1.2, 0, 0, 62], s: [['一份', 100]], f: ['cook'] },
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
  { id: 'shrimp', name: '虾仁', alias: 'xiaren shrimp', cat: 'seafood', n: [93, 18.6, 0.8, 2.8, 0, 0, 165], s: [['一份', 100]], f: ['cook'] },
  { id: 'crucian', name: '鲫鱼', alias: 'jiyu crucian', cat: 'seafood', n: [108, 17.1, 2.7, 3.8, 0, 0, 41], s: [['一条', 200]], f: [] },
  { id: 'tuna_can', name: '金枪鱼罐头（水浸）', alias: 'jinqiangyu tuna', cat: 'seafood', n: [116, 25.5, 1.0, 0, 0, 0, 320], s: [['一罐', 80]], f: ['quick', 'processed'] },
  { id: 'squid', name: '鱿鱼', alias: 'youyu squid', cat: 'seafood', n: [84, 17.0, 1.4, 0, 0, 0, 110], s: [['一份', 100]], f: [] },
  { id: 'oyster', name: '生蚝', alias: 'shenghao oyster', cat: 'seafood', n: [73, 10.9, 2.5, 2.0, 0, 0, 462], s: [['一只', 30]], f: [] },
  { id: 'clam', name: '蛤蜊', alias: 'geli clam', cat: 'seafood', n: [62, 10.1, 1.1, 2.8, 0, 0, 425], s: [['一份', 100]], f: [] },

  // ---------- 蛋类 ----------
  { id: 'egg_whole', name: '鸡蛋（全蛋，煮）', alias: 'jidan egg', cat: 'egg', n: [147, 13.3, 8.8, 2.8, 0, 1.1, 132], s: [['一个', 55]], f: ['quick', 'breakfast'] },
  { id: 'egg_white', name: '蛋白（煮）', alias: 'danbai egg white', cat: 'egg', n: [52, 11.6, 0.1, 0.7, 0, 0.7, 166], s: [['一个', 33]], f: ['quick'] },
  { id: 'egg_fried', name: '煎蛋（油煎）', alias: 'jiandan fried egg', cat: 'egg', n: [216, 13.0, 17.0, 2.0, 0, 1.0, 210], s: [['一个', 60]], f: ['fried', 'breakfast'] },
  { id: 'tea_egg', name: '茶叶蛋', alias: 'chayedan tea egg', cat: 'egg', n: [152, 13.0, 9.5, 3.0, 0, 1.0, 620], s: [['一个', 55]], f: ['quick', 'breakfast'] },

  // ---------- 乳制品 ----------
  { id: 'milk_whole', name: '全脂牛奶', alias: 'niunai milk', cat: 'dairy', n: [65, 3.3, 3.6, 4.9, 0, 4.9, 50], s: [['一盒', 250], ['一杯', 200]], f: ['quick', 'breakfast', 'late', 'natsugar'] },
  { id: 'milk_skim', name: '脱脂牛奶', alias: 'tuozhi skim milk', cat: 'dairy', n: [35, 3.4, 0.2, 5.0, 0, 5.0, 52], s: [['一盒', 250]], f: ['quick', 'late', 'natsugar'] },
  { id: 'yogurt_plain', name: '无糖酸奶', alias: 'suannai yogurt', cat: 'dairy', n: [61, 3.5, 3.2, 4.7, 0, 4.7, 45], s: [['一盒', 150]], f: ['quick', 'late', 'breakfast', 'natsugar'] },
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
  { id: 'tomato', name: '番茄', alias: 'fanqie tomato', cat: 'veg', n: [20, 0.9, 0.2, 4.0, 0.5, 2.6, 5], s: [['一个', 150]], f: ['quick'] },
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
  { id: 'black_coffee', name: '美式咖啡（无糖）', alias: 'kafei coffee', cat: 'drink', n: [2, 0.2, 0, 0.3, 0, 0, 3], s: [['一杯', 350]], f: ['quick'] },
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
  { id: 'tomato_egg', name: '番茄炒蛋', alias: 'fanqiechaodan', cat: 'dish', n: [128, 6.5, 9.0, 5.5, 0.6, 3.5, 520], s: [['一份', 250]], f: [] },
  { id: 'mapo_tofu', name: '麻婆豆腐', alias: 'mapodoufu', cat: 'dish', n: [151, 9.0, 11.0, 4.5, 0.8, 1.5, 850], s: [['一份', 250]], f: [] },
  { id: 'fried_rice', name: '蛋炒饭', alias: 'danchaofan fried rice', cat: 'dish', n: [186, 5.5, 7.5, 24.0, 0.6, 1.0, 620], s: [['一份', 350]], f: ['fried'] },
  { id: 'beef_noodle', name: '牛肉面', alias: 'niuroumian beef noodle', cat: 'dish', n: [117, 6.5, 3.5, 15.0, 0.9, 1.0, 680], s: [['一碗', 600]], f: [] },
  { id: 'wonton', name: '馄饨（鲜肉）', alias: 'huntun wonton', cat: 'dish', n: [124, 6.0, 4.5, 15.0, 0.7, 1.0, 620], s: [['一碗', 350]], f: ['breakfast'] },
  { id: 'hotpot_clear', name: '清汤火锅（涮菜为主）', alias: 'huoguo hotpot', cat: 'dish', n: [110, 9.0, 6.0, 5.0, 1.5, 1.0, 900], s: [['一份', 400]], f: [] },
  { id: 'malatang', name: '麻辣烫', alias: 'malatang', cat: 'dish', n: [145, 7.0, 9.5, 8.5, 1.5, 2.0, 1100], s: [['一份', 500]], f: [] },
  { id: 'burger', name: '汉堡（牛肉）', alias: 'hanbao burger', cat: 'dish', n: [270, 13.0, 13.0, 25.0, 1.2, 5.0, 520], s: [['一个', 200]], f: ['processed', 'quick'] },
  { id: 'french_fries', name: '薯条', alias: 'shutiao fries', cat: 'dish', n: [312, 3.5, 15.0, 41.0, 3.5, 0.5, 300], s: [['中份', 115]], f: ['fried', 'processed', 'quick'] },
  { id: 'pizza', name: '披萨（芝士）', alias: 'pisa pizza', cat: 'dish', n: [266, 11.0, 10.0, 33.0, 2.0, 3.5, 600], s: [['一块', 110]], f: ['processed'] },
  { id: 'sushi', name: '寿司卷', alias: 'shousi sushi', cat: 'dish', n: [150, 6.0, 2.5, 26.0, 0.8, 4.0, 400], s: [['一份8个', 200]], f: ['quick'] },
  { id: 'salad_chicken', name: '鸡胸沙拉（轻食）', alias: 'shala salad', cat: 'dish', n: [95, 10.5, 3.5, 5.5, 1.8, 2.0, 320], s: [['一份', 350]], f: ['quick'] },
  { id: 'sandwich_egg', name: '鸡蛋三明治', alias: 'sanmingzhi sandwich', cat: 'dish', n: [228, 10.0, 10.5, 23.0, 1.5, 4.0, 520], s: [['一个', 160]], f: ['quick', 'breakfast'] },
  { id: 'roast_chicken_leg', name: '烤鸡腿（便利店）', alias: 'kaojitui', cat: 'dish', n: [190, 22.0, 11.0, 1.0, 0, 0.5, 560], s: [['一只', 120]], f: ['quick'] },
  { id: 'steamed_fish', name: '清蒸鱼', alias: 'qingzhengyu steamed fish', cat: 'dish', n: [122, 18.5, 4.5, 1.0, 0, 0.5, 480], s: [['一份', 200]], f: [] },
  { id: 'stir_veg', name: '清炒时蔬', alias: 'qingchaoshishu', cat: 'dish', n: [78, 2.0, 6.0, 4.5, 1.8, 1.5, 480], s: [['一份', 200]], f: [] },
  { id: 'cold_noodle', name: '凉皮 / 凉面', alias: 'liangpi liangmian', cat: 'dish', n: [168, 3.5, 5.5, 26.0, 0.8, 2.0, 700], s: [['一份', 300]], f: ['refined'] },

  // ---------- 其他 ----------
  { id: 'oil', name: '食用油', alias: 'you oil', cat: 'other', n: [899, 0, 99.9, 0, 0, 0, 0], s: [['一勺', 10]], f: [] },
  { id: 'sugar', name: '白砂糖', alias: 'tang sugar', cat: 'other', n: [400, 0, 0, 99.9, 0, 99.9, 1], s: [['一勺', 8]], f: ['refined'] },
  { id: 'soy_sauce', name: '生抽 / 酱油', alias: 'jiangyou soy sauce', cat: 'other', n: [63, 5.6, 0.1, 10.1, 0.2, 3.0, 5757], s: [['一勺', 10]], f: [] },
  { id: 'mayo', name: '沙拉酱 / 蛋黄酱', alias: 'shalajiang mayo', cat: 'other', n: [680, 1.5, 75.0, 2.0, 0, 1.5, 600], s: [['一勺', 12]], f: ['processed'] },
];

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

/** 模糊搜索：名称、别名、分类 */
export function searchFoods(query, list = FOODS, limit = 30) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  const scored = [];
  for (const f of list) {
    const name = f.name.toLowerCase();
    const alias = (f.alias || '').toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (alias.startsWith(q)) score = 50;
    else if (alias.includes(q)) score = 35;
    else if ((CATEGORIES[f.cat] || '').includes(q)) score = 20;
    if (score > 0) scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name, 'zh'));
  return scored.slice(0, limit).map((x) => x.f);
}
