/**
 * 训练动作库。
 *
 * 判重靠两样东西，缺一不可：
 *   pattern  动作模式（水平推、垂直拉、髋铰链…）——决定「练的是同一件事」
 *   primary  主要发力肌肉——决定「练的是同一块肉」
 *
 * 杠铃卧推和哑铃卧推之所以重复，不是因为名字里都有「卧推」，
 * 而是两者的 pattern 和 primary 完全一样，只差器械。
 * 所以这两个字段必须如实填，不能按名字凑。
 */

/** 肌肉键 → 中文名 */
export const MUSCLES = {
  pec_upper: '上胸', pec_mid: '胸大肌中部', pec_lower: '下胸',
  delt_front: '三角肌前束', delt_side: '三角肌中束', delt_rear: '三角肌后束',
  triceps: '肱三头肌', biceps: '肱二头肌', forearm: '前臂',
  lat: '背阔肌', trap_mid: '斜方肌中下部', rhomboid: '菱形肌',
  trap_upper: '斜方肌上部', erector: '竖脊肌',
  quad: '股四头肌', ham: '腘绳肌', glute: '臀大肌',
  adductor: '大腿内收肌', abductor: '臀中肌', calf: '小腿三头肌',
  abs: '腹直肌', oblique: '腹斜肌', deep_core: '腹横肌 / 深层核心',
  hip_flexor: '髂腰肌',
};

/** 动作模式 → 中文名。判重时同模式加权 */
export const PATTERNS = {
  horizontal_push: '水平推', incline_push: '上斜推', vertical_push: '过顶推',
  chest_fly: '胸部飞鸟', dip: '臂屈伸下压',
  horizontal_pull: '水平拉', vertical_pull: '垂直拉', pullover: '上拉展背',
  shrug: '耸肩', lateral_raise: '侧平举', rear_delt: '后束外展',
  elbow_extension: '伸肘', elbow_flexion: '屈肘',
  squat: '深蹲', hinge: '髋铰链', lunge: '弓步分腿',
  leg_extension: '伸膝', leg_curl: '屈膝', hip_thrust: '臀推',
  adduction: '内收', abduction: '外展', calf_raise: '提踵',
  trunk_flexion: '躯干屈曲', anti_extension: '抗伸展',
  anti_rotation: '抗旋转', anti_lateral: '抗侧屈', rotation: '躯干旋转',
  lateral_flexion: '躯干侧屈',
};

/** 五大部位。臂并进肩，和用户的分法一致 */
export const GROUPS = [
  { key: 'chest', label: '胸', muscles: ['pec_upper', 'pec_mid', 'pec_lower'] },
  { key: 'shoulder', label: '肩臂', muscles: ['delt_front', 'delt_side', 'delt_rear', 'triceps', 'biceps', 'forearm'] },
  { key: 'back', label: '背', muscles: ['lat', 'trap_mid', 'rhomboid', 'trap_upper', 'erector'] },
  { key: 'leg', label: '腿', muscles: ['quad', 'ham', 'glute', 'adductor', 'abductor', 'calf'] },
  { key: 'core', label: '腹', muscles: ['abs', 'oblique', 'deep_core', 'hip_flexor'] },
];

export const EQUIPMENT = {
  barbell: '杠铃', dumbbell: '哑铃', machine: '器械', cable: '绳索',
  bodyweight: '徒手', kettlebell: '壶铃', band: '弹力带',
};

const X = (id, name, alias, group, pattern, primary, secondary, equipment, compound = true) =>
  ({ id, name, alias, group, pattern, primary, secondary, equipment, compound });

export const EXERCISES = [
  // ---------------- 胸 ----------------
  X('bench_press_bb', '杠铃卧推', 'gangling wotui bench press', 'chest', 'horizontal_push', ['pec_mid'], ['delt_front', 'triceps'], 'barbell'),
  X('bench_press_db', '哑铃卧推', 'yaling wotui dumbbell bench', 'chest', 'horizontal_push', ['pec_mid'], ['delt_front', 'triceps'], 'dumbbell'),
  X('bench_press_smith', '史密斯卧推', 'shimisi wotui smith bench', 'chest', 'horizontal_push', ['pec_mid'], ['delt_front', 'triceps'], 'machine'),
  X('chest_press_machine', '坐姿推胸器械', 'zuozi tuixiong chest press', 'chest', 'horizontal_push', ['pec_mid'], ['delt_front', 'triceps'], 'machine'),
  X('pushup', '俯卧撑', 'fuwocheng pushup', 'chest', 'horizontal_push', ['pec_mid'], ['delt_front', 'triceps', 'deep_core'], 'bodyweight'),
  X('incline_bench_bb', '上斜杠铃卧推', 'shangxie gangling wotui incline', 'chest', 'incline_push', ['pec_upper'], ['delt_front', 'triceps'], 'barbell'),
  X('incline_bench_db', '上斜哑铃卧推', 'shangxie yaling wotui incline db', 'chest', 'incline_push', ['pec_upper'], ['delt_front', 'triceps'], 'dumbbell'),
  X('decline_bench', '下斜卧推', 'xiaxie wotui decline', 'chest', 'horizontal_push', ['pec_lower'], ['triceps'], 'barbell'),
  X('dip_chest', '双杠臂屈伸（前倾）', 'shuanggang biqushen dip', 'chest', 'dip', ['pec_lower'], ['triceps', 'delt_front'], 'bodyweight'),
  X('cable_fly', '绳索夹胸', 'shengsuo jiaxiong cable fly', 'chest', 'chest_fly', ['pec_mid'], ['delt_front'], 'cable', false),
  X('db_fly', '哑铃飞鸟', 'yaling feiniao dumbbell fly', 'chest', 'chest_fly', ['pec_mid'], ['delt_front'], 'dumbbell', false),
  X('pec_deck', '蝴蝶机夹胸', 'hudieji jiaxiong pec deck', 'chest', 'chest_fly', ['pec_mid'], ['delt_front'], 'machine', false),
  X('cable_fly_low', '绳索下斜夹胸（上举）', 'shengsuo shangju jiaxiong', 'chest', 'chest_fly', ['pec_upper'], ['delt_front'], 'cable', false),
  X('incline_press_machine', '上斜推胸器械', 'shangxie tuixiong incline chest press machine', 'chest', 'incline_push', ['pec_upper'], ['delt_front', 'triceps'], 'machine'),
  X('decline_press_machine', '下斜推胸器械', 'xiaxie tuixiong decline chest press machine', 'chest', 'horizontal_push', ['pec_lower'], ['triceps'], 'machine'),
  X('smith_incline_press', '史密斯上斜推举', 'shimisi shangxie tuiju smith incline press', 'chest', 'incline_push', ['pec_upper'], ['delt_front', 'triceps'], 'machine'),
  X('assisted_dip_machine', '助力双杠臂屈伸器械', 'zhuli shuanggang biqushen assisted dip machine', 'chest', 'dip', ['pec_lower'], ['triceps', 'delt_front'], 'machine'),
  X('cable_crossover_high', '高位绳索交叉夹胸', 'gaowei shengsuo jiaocha jiaxiong cable crossover', 'chest', 'chest_fly', ['pec_lower'], ['pec_mid'], 'cable', false),

  // ---------------- 肩（臂） ----------------
  X('ohp_bb', '杠铃站姿推举', 'gangling zhanzi tuiju overhead press', 'shoulder', 'vertical_push', ['delt_front'], ['delt_side', 'triceps', 'deep_core'], 'barbell'),
  X('ohp_db', '哑铃坐姿推举', 'yaling zuozi tuiju dumbbell press', 'shoulder', 'vertical_push', ['delt_front'], ['delt_side', 'triceps'], 'dumbbell'),
  X('shoulder_press_machine', '坐姿推肩器械', 'zuozi tuijian machine', 'shoulder', 'vertical_push', ['delt_front'], ['delt_side', 'triceps'], 'machine'),
  X('arnold_press', '阿诺德推举', 'anuode tuiju arnold press', 'shoulder', 'vertical_push', ['delt_front'], ['delt_side', 'triceps'], 'dumbbell'),
  X('lateral_raise_db', '哑铃侧平举', 'yaling cepingju lateral raise', 'shoulder', 'lateral_raise', ['delt_side'], [], 'dumbbell', false),
  X('lateral_raise_cable', '绳索侧平举', 'shengsuo cepingju cable lateral', 'shoulder', 'lateral_raise', ['delt_side'], [], 'cable', false),
  X('lateral_raise_machine', '侧平举器械', 'cepingju machine lateral', 'shoulder', 'lateral_raise', ['delt_side'], [], 'machine', false),
  X('rear_delt_fly', '俯身哑铃侧平举', 'fushen cepingju rear delt fly', 'shoulder', 'rear_delt', ['delt_rear'], ['trap_mid', 'rhomboid'], 'dumbbell', false),
  X('reverse_pec_deck', '反向蝴蝶机', 'fanxiang hudieji reverse pec deck', 'shoulder', 'rear_delt', ['delt_rear'], ['trap_mid'], 'machine', false),
  X('face_pull', '绳索面拉', 'shengsuo mianla face pull', 'shoulder', 'rear_delt', ['delt_rear'], ['trap_mid', 'rhomboid'], 'cable', false),
  X('front_raise', '哑铃前平举', 'yaling qianpingju front raise', 'shoulder', 'lateral_raise', ['delt_front'], [], 'dumbbell', false),
  X('triceps_pushdown', '绳索下压', 'shengsuo xiaya triceps pushdown', 'shoulder', 'elbow_extension', ['triceps'], [], 'cable', false),
  X('skull_crusher', '仰卧臂屈伸', 'yangwo biqushen skull crusher', 'shoulder', 'elbow_extension', ['triceps'], [], 'barbell', false),
  X('overhead_triceps', '过顶臂屈伸', 'guoding biqushen overhead extension', 'shoulder', 'elbow_extension', ['triceps'], [], 'dumbbell', false),
  X('dip_triceps', '双杠臂屈伸（直立）', 'shuanggang biqushen zhili dip', 'shoulder', 'dip', ['triceps'], ['pec_lower', 'delt_front'], 'bodyweight'),
  X('close_grip_bench', '窄距卧推', 'zhaiju wotui close grip', 'shoulder', 'horizontal_push', ['triceps'], ['pec_mid', 'delt_front'], 'barbell'),
  X('curl_bb', '杠铃弯举', 'gangling wanju barbell curl', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'barbell', false),
  X('curl_db', '哑铃弯举', 'yaling wanju dumbbell curl', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'dumbbell', false),
  X('hammer_curl', '锤式弯举', 'chuishi wanju hammer curl', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'dumbbell', false),
  X('preacher_curl', '牧师凳弯举', 'mushideng wanju preacher curl', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'barbell', false),
  X('incline_curl', '上斜哑铃弯举', 'shangxie yaling wanju incline curl', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'dumbbell', false),
  X('shrug_db', '哑铃耸肩', 'yaling songjian shrug', 'back', 'shrug', ['trap_upper'], [], 'dumbbell', false),
  X('wrist_curl', '腕弯举', 'wan wanju wrist curl', 'shoulder', 'elbow_flexion', ['forearm'], [], 'dumbbell', false),
  X('smith_ohp', '史密斯推肩', 'shimisi tuijian smith shoulder press', 'shoulder', 'vertical_push', ['delt_front'], ['delt_side', 'triceps'], 'machine'),
  X('shrug_machine', '器械耸肩', 'qixie songjian shrug machine', 'back', 'shrug', ['trap_upper'], [], 'machine', false),
  X('shrug_bb', '杠铃耸肩', 'gangling songjian barbell shrug', 'back', 'shrug', ['trap_upper'], ['forearm'], 'barbell', false),
  X('triceps_extension_machine', '坐姿臂屈伸器械', 'zuozi biqushen triceps extension machine', 'shoulder', 'elbow_extension', ['triceps'], [], 'machine', false),
  X('curl_machine', '坐姿弯举器械', 'zuozi wanju biceps curl machine', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'machine', false),
  X('preacher_curl_machine', '器械牧师凳弯举', 'qixie mushideng wanju preacher curl machine', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'machine', false),
  X('cable_curl', '绳索弯举', 'shengsuo wanju cable curl', 'shoulder', 'elbow_flexion', ['biceps'], ['forearm'], 'cable', false),
  X('overhead_triceps_cable', '绳索过顶臂屈伸', 'shengsuo guoding biqushen overhead cable extension', 'shoulder', 'elbow_extension', ['triceps'], [], 'cable', false),
  X('upright_row_cable', '绳索直立划船', 'shengsuo zhili huachuan upright row', 'shoulder', 'lateral_raise', ['delt_side'], ['trap_upper', 'biceps'], 'cable', false),
  X('reverse_curl', '反握弯举', 'fanwo wanju reverse curl', 'shoulder', 'elbow_flexion', ['forearm'], ['biceps'], 'barbell', false),
  X('wrist_curl_reverse', '反向腕弯举', 'fanxiang wan wanju reverse wrist curl', 'shoulder', 'elbow_flexion', ['forearm'], [], 'dumbbell', false),

  // ---------------- 背 ----------------
  X('pullup', '引体向上', 'yintixiangshang pullup', 'back', 'vertical_pull', ['lat'], ['biceps', 'rhomboid', 'forearm'], 'bodyweight'),
  X('chinup', '反握引体向上', 'fanwo yintixiangshang chinup', 'back', 'vertical_pull', ['lat'], ['biceps', 'forearm'], 'bodyweight'),
  X('lat_pulldown', '高位下拉', 'gaowei xiala lat pulldown', 'back', 'vertical_pull', ['lat'], ['biceps', 'rhomboid'], 'cable'),
  X('lat_pulldown_close', '窄握下拉', 'zhaiwo xiala close grip pulldown', 'back', 'vertical_pull', ['lat'], ['biceps'], 'cable'),
  X('barbell_row', '杠铃划船', 'gangling huachuan barbell row', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps', 'erector'], 'barbell'),
  X('dumbbell_row', '单臂哑铃划船', 'danbi yaling huachuan db row', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'dumbbell'),
  X('seated_row_cable', '坐姿绳索划船', 'zuozi shengsuo huachuan seated row', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'cable'),
  X('t_bar_row', 'T 杠划船', 't gang huachuan t bar row', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'barbell'),
  X('chest_supported_row', '俯卧撑胸划船', 'fuwo chengxiong huachuan chest supported row', 'back', 'horizontal_pull', ['trap_mid', 'rhomboid'], ['lat', 'delt_rear', 'biceps'], 'machine'),
  X('inverted_row', '反向划船', 'fanxiang huachuan inverted row', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'bodyweight'),
  X('straight_arm_pulldown', '直臂下压', 'zhibi xiaya straight arm pulldown', 'back', 'pullover', ['lat'], ['triceps'], 'cable', false),
  X('db_pullover', '哑铃仰卧上拉', 'yaling yangwo shangla pullover', 'back', 'pullover', ['lat'], ['pec_mid', 'triceps'], 'dumbbell', false),
  X('deadlift', '硬拉', 'yingla deadlift', 'back', 'hinge', ['erector', 'glute'], ['ham', 'lat', 'trap_mid', 'forearm'], 'barbell'),
  X('rack_pull', '架上拉', 'jiashang la rack pull', 'back', 'hinge', ['erector', 'trap_mid'], ['glute', 'lat'], 'barbell'),
  X('back_extension', '山羊挺身', 'shanyang tingshen back extension', 'back', 'hinge', ['erector'], ['glute', 'ham'], 'bodyweight', false),
  X('row_machine_seated', '坐姿划船器械', 'zuozi huachuan seated row machine', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'machine'),
  X('iso_lateral_row', '单侧划船器械', 'danze huachuan iso lateral row machine', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'machine'),
  X('high_row_machine', '高位划船器械', 'gaowei huachuan high row machine', 'back', 'horizontal_pull', ['lat'], ['trap_mid', 'biceps'], 'machine'),
  X('smith_row', '史密斯划船', 'shimisi huachuan smith row', 'back', 'horizontal_pull', ['lat', 'trap_mid'], ['rhomboid', 'biceps'], 'machine'),
  X('assisted_pullup_machine', '助力引体向上器械', 'zhuli yinti assisted pullup machine', 'back', 'vertical_pull', ['lat'], ['biceps', 'rhomboid'], 'machine'),
  X('pulldown_machine', '器械高位下拉', 'qixie gaowei xiala pulldown machine', 'back', 'vertical_pull', ['lat'], ['biceps', 'rhomboid'], 'machine'),
  X('pullover_machine', '器械上拉', 'qixie shangla pullover machine', 'back', 'pullover', ['lat'], ['triceps'], 'machine', false),
  X('back_extension_machine', '器械背伸展', 'qixie beishenzhan back extension machine', 'back', 'hinge', ['erector'], ['glute'], 'machine', false),

  // ---------------- 腿 ----------------
  X('squat_bb', '杠铃深蹲', 'gangling shendun back squat', 'leg', 'squat', ['quad', 'glute'], ['ham', 'erector', 'adductor'], 'barbell'),
  X('front_squat', '前蹲', 'qiandun front squat', 'leg', 'squat', ['quad'], ['glute', 'erector', 'deep_core'], 'barbell'),
  X('goblet_squat', '高脚杯深蹲', 'gaojiaobei shendun goblet squat', 'leg', 'squat', ['quad', 'glute'], ['adductor', 'deep_core'], 'dumbbell'),
  X('hack_squat', '哈克深蹲', 'hake shendun hack squat', 'leg', 'squat', ['quad'], ['glute'], 'machine'),
  X('leg_press', '腿举', 'tuiju leg press', 'leg', 'squat', ['quad', 'glute'], ['ham', 'adductor'], 'machine'),
  X('bulgarian_split', '保加利亚分腿蹲', 'baojialiya fentuidun bulgarian split squat', 'leg', 'lunge', ['quad', 'glute'], ['ham', 'abductor'], 'dumbbell'),
  X('walking_lunge', '行走弓步', 'xingzou gongbu walking lunge', 'leg', 'lunge', ['quad', 'glute'], ['ham', 'adductor'], 'dumbbell'),
  X('step_up', '箭步登台', 'jianbu dengtai step up', 'leg', 'lunge', ['quad', 'glute'], ['ham'], 'dumbbell'),
  X('rdl_bb', '罗马尼亚硬拉', 'luomaniya yingla romanian deadlift', 'leg', 'hinge', ['ham', 'glute'], ['erector', 'forearm'], 'barbell'),
  X('rdl_db', '哑铃罗马尼亚硬拉', 'yaling luomaniya yingla db rdl', 'leg', 'hinge', ['ham', 'glute'], ['erector'], 'dumbbell'),
  X('good_morning', '早安式体前屈', 'zaoanshi tiqianqu good morning', 'leg', 'hinge', ['ham', 'erector'], ['glute'], 'barbell'),
  X('leg_curl', '俯卧腿弯举', 'fuwo tuiwanju leg curl', 'leg', 'leg_curl', ['ham'], ['calf'], 'machine', false),
  X('seated_leg_curl', '坐姿腿弯举', 'zuozi tuiwanju seated leg curl', 'leg', 'leg_curl', ['ham'], [], 'machine', false),
  X('leg_extension', '坐姿腿屈伸', 'zuozi tuiqushen leg extension', 'leg', 'leg_extension', ['quad'], [], 'machine', false),
  X('hip_thrust', '臀推', 'tuntui hip thrust', 'leg', 'hip_thrust', ['glute'], ['ham', 'quad'], 'barbell'),
  X('glute_bridge', '臀桥', 'tunqiao glute bridge', 'leg', 'hip_thrust', ['glute'], ['ham'], 'bodyweight', false),
  X('cable_kickback', '绳索后踢腿', 'shengsuo houtitui cable kickback', 'leg', 'hip_thrust', ['glute'], ['ham'], 'cable', false),
  X('hip_abduction', '坐姿髋外展', 'zuozi kuanwaizhan hip abduction', 'leg', 'abduction', ['abductor'], ['glute'], 'machine', false),
  X('hip_adduction', '坐姿髋内收', 'zuozi kuanneishou hip adduction', 'leg', 'adduction', ['adductor'], [], 'machine', false),
  X('calf_raise_standing', '站姿提踵', 'zhanzi tizhong standing calf raise', 'leg', 'calf_raise', ['calf'], [], 'machine', false),
  X('calf_raise_seated', '坐姿提踵', 'zuozi tizhong seated calf raise', 'leg', 'calf_raise', ['calf'], [], 'machine', false),
  X('smith_squat', '史密斯深蹲', 'shimisi shendun smith squat', 'leg', 'squat', ['quad', 'glute'], ['ham', 'adductor'], 'machine'),
  X('pendulum_squat', '钟摆深蹲机', 'zhongbai shendun pendulum squat', 'leg', 'squat', ['quad'], ['glute'], 'machine'),
  X('belt_squat', '腰带深蹲机', 'yaodai shendun belt squat', 'leg', 'squat', ['quad', 'glute'], ['ham'], 'machine'),
  X('single_leg_press', '单腿腿举', 'dantui tuiju single leg press', 'leg', 'squat', ['quad', 'glute'], ['ham', 'abductor'], 'machine'),
  X('smith_split_squat', '史密斯分腿蹲', 'shimisi fentuidun smith split squat', 'leg', 'lunge', ['quad', 'glute'], ['ham'], 'machine'),
  X('reverse_hack_squat', '反向哈克深蹲', 'fanxiang hake shendun reverse hack squat', 'leg', 'hinge', ['glute', 'ham'], ['erector'], 'machine'),
  X('hip_thrust_machine', '器械臀推', 'qixie tuntui hip thrust machine', 'leg', 'hip_thrust', ['glute'], ['ham', 'quad'], 'machine'),
  X('glute_kickback_machine', '器械后踢腿', 'qixie houtitui glute kickback machine', 'leg', 'hip_thrust', ['glute'], ['ham'], 'machine', false),
  X('standing_leg_curl', '站姿腿弯举', 'zhanzi tuiwanju standing leg curl', 'leg', 'leg_curl', ['ham'], [], 'machine', false),
  X('nordic_curl', '北欧腘绳弯举', 'beiou guosheng wanju nordic curl', 'leg', 'leg_curl', ['ham'], ['glute'], 'bodyweight', false),
  X('calf_raise_leg_press', '腿举机提踵', 'tuijuji tizhong leg press calf raise', 'leg', 'calf_raise', ['calf'], [], 'machine', false),
  X('donkey_calf_raise', '驴式提踵', 'lvshi tizhong donkey calf raise', 'leg', 'calf_raise', ['calf'], [], 'machine', false),
  X('cable_hip_abduction', '绳索站姿髋外展', 'shengsuo zhanzi kuanwaizhan cable hip abduction', 'leg', 'abduction', ['abductor'], ['glute'], 'cable', false),
  X('copenhagen_plank', '哥本哈根侧板', 'gebenhagen ceban copenhagen plank', 'leg', 'adduction', ['adductor'], ['deep_core', 'oblique'], 'bodyweight', false),

  // ---------------- 腹 ----------------
  X('plank', '平板支撑', 'pingban zhicheng plank', 'core', 'anti_extension', ['deep_core'], ['abs'], 'bodyweight', false),
  X('ab_wheel', '腹肌轮', 'fujilun ab wheel rollout', 'core', 'anti_extension', ['deep_core', 'abs'], ['lat'], 'bodyweight', false),
  X('dead_bug', '死虫式', 'sichongshi dead bug', 'core', 'anti_extension', ['deep_core'], ['abs'], 'bodyweight', false),
  X('crunch', '卷腹', 'juanfu crunch', 'core', 'trunk_flexion', ['abs'], [], 'bodyweight', false),
  X('cable_crunch', '绳索跪姿卷腹', 'shengsuo guizi juanfu cable crunch', 'core', 'trunk_flexion', ['abs'], ['oblique'], 'cable', false),
  X('hanging_leg_raise', '悬垂举腿', 'xuanchui jutui hanging leg raise', 'core', 'trunk_flexion', ['abs', 'hip_flexor'], ['forearm'], 'bodyweight', false),
  X('reverse_crunch', '反向卷腹', 'fanxiang juanfu reverse crunch', 'core', 'trunk_flexion', ['abs', 'hip_flexor'], [], 'bodyweight', false),
  X('side_plank', '侧平板', 'ceping ban side plank', 'core', 'anti_lateral', ['oblique'], ['deep_core'], 'bodyweight', false),
  X('suitcase_carry', '单侧农夫行走', 'dance nongfu xingzou suitcase carry', 'core', 'anti_lateral', ['oblique'], ['deep_core', 'forearm', 'trap_upper'], 'dumbbell', false),
  X('pallof_press', '帕洛夫推', 'paluofu tui pallof press', 'core', 'anti_rotation', ['deep_core', 'oblique'], [], 'cable', false),
  X('russian_twist', '俄罗斯转体', 'eluosi zhuanti russian twist', 'core', 'rotation', ['oblique'], ['abs'], 'bodyweight', false),
  X('cable_woodchop', '绳索斜砍', 'shengsuo xiekan woodchop', 'core', 'rotation', ['oblique'], ['deep_core'], 'cable', false),
  X('ab_crunch_machine', '坐姿卷腹器械', 'zuozi juanfu ab crunch machine', 'core', 'trunk_flexion', ['abs'], ['oblique'], 'machine', false),
  X('rotary_torso_machine', '坐姿转体器械', 'zuozi zhuanti rotary torso machine', 'core', 'rotation', ['oblique'], ['deep_core'], 'machine', false),
  X('captains_chair_raise', '罗马椅举腿', 'luomayi jutui captains chair leg raise', 'core', 'trunk_flexion', ['abs', 'hip_flexor'], ['deep_core'], 'bodyweight', false),
  X('decline_situp', '下斜仰卧起坐', 'xiaxie yangwoqizuo decline situp', 'core', 'trunk_flexion', ['abs'], ['hip_flexor'], 'bodyweight', false),
  X('cable_side_bend', '绳索体侧屈', 'shengsuo ticequ cable side bend', 'core', 'lateral_flexion', ['oblique'], ['deep_core'], 'cable', false),
  X('farmer_walk', '双侧农夫行走', 'shuangce nongfu xingzou farmer walk', 'core', 'anti_extension', ['deep_core'], ['forearm', 'trap_upper'], 'dumbbell', false),
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export const GROUP_BY_KEY = new Map(GROUPS.map((g) => [g.key, g]));

/** 名称 / 拼音 / 英文都能搜 */
export function searchExercises(query, list = EXERCISES) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return list.filter((e) => e.name.toLowerCase().includes(q)
    || e.alias.toLowerCase().includes(q)
    || (MUSCLES[e.primary[0]] || '').includes(q));
}
