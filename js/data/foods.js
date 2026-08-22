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
  { id: 'potato', name: '土豆（蒸）', alias: 'tudou potato 马铃薯', cat: 'staple', n: [81, 2.0, 0.2, 17.8, 1.4, 0.9, 6], s: [['一个中等', 150]], f: ['whole'] },
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
  { id: 'tomato_egg', name: '番茄炒蛋', alias: 'fanqiechaodan', cat: 'dish', n: [128, 6.5, 9.0, 5.5, 0.6, 3.5, 520], s: [['一份', 250]], f: [] },
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
  { id: 'tomato_egg_soup', name: '番茄蛋汤', alias: 'fanqiedantang', cat: 'dish', n: [32, 2.0, 1.8, 2.2, 0.4, 1.5, 450], s: [['一碗', 300]], f: [] },
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
  other: '普通瓷勺一平勺油 ≈ 10g；啤酒瓶盖一平盖盐 ≈ 5g',
};

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
