/**
 * 拼音首字母匹配。
 *
 * 食物和动作的 `alias` 里本来就写着全拼（「脱脂奶粉」是 `tuozhi naifen`），
 * 可搜索只做子串匹配 —— 打 `tzn` 一条都出不来，得把整串拼音敲完。
 * 手机上打全拼比打汉字还慢，这个别名字段等于白写。
 *
 * 这里把全拼切成音节再取首字母：`tuozhi` → `tuo`+`zhi` → `tz`。
 * 不引拼音库、也不带汉字表 —— 那要么是外部依赖，要么是几万条的映射；
 * 而我们要处理的输入本来就已经是拼音了，只差一步切音节。
 *
 * 切不干净的（英文单词、缩写）直接返回空串，让调用方回退到原来的子串匹配，
 * 不去猜。`skim` 会被切成 `s-ki-m` 这种残渣，宁可不给结果也不给错结果。
 */

/* 声母。zh/ch/sh 必须排在 z/c/s 前面，否则 `zhi` 会被切成 `z`+`hi`。 */
const INITIALS = '(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?';

/*
 * 韵母，长的排前面：交替匹配是从左往右试的，`iang` 排在 `ia` 后面就永远轮不到，
 * `xiang` 会被切成 `xia`+`ng`。
 */
const FINALS = [
  'iang', 'iong', 'uang', 'ueng',
  'uai', 'uan', 'ian', 'iao', 'ang', 'eng', 'ing', 'ong',
  'ua', 'uo', 'ui', 'un', 'ue', 've', 'ia', 'ie', 'iu', 'in',
  'ai', 'ei', 'ao', 'ou', 'an', 'en', 'er',
  'a', 'o', 'e', 'i', 'u', 'v',
].join('|');

const SYLLABLE = new RegExp(`^${INITIALS}(?:${FINALS})`);

/** 一个音节的首字母：zh/ch/sh 取 z/c/s，零声母取韵母第一个字母。 */
function syllableInitial(syllable) {
  return syllable[0];
}

/**
 * 把一串全拼切成首字母。切不干净就返回空串。
 * @param {string} token 只含小写字母的一串拼音，例如 `tuozhi`
 * @returns {string} 例如 `tz`；无法完整切分时是 `''`
 */
export function pinyinInitials(token) {
  const text = String(token || '').toLowerCase();
  if (!text || !/^[a-z]+$/.test(text)) return '';
  let rest = text;
  let out = '';
  // 上限只是护栏：正常拼音串不会有 24 个音节，写死是为了任何输入都不会转圈
  for (let i = 0; i < 24 && rest; i += 1) {
    const m = SYLLABLE.exec(rest);
    if (!m || !m[0]) return '';
    out += syllableInitial(m[0]);
    rest = rest.slice(m[0].length);
  }
  return rest ? '' : out;
}

/**
 * 这条别名的首字母缩写有哪些写法。
 *
 * 每个空格分隔的词各给一个（`tuozhi naifen` → `tz`、`nf`），
 * 再给一个整体拼起来的（`tznf`）—— 两种打法都有人用。
 */
export function aliasInitials(alias) {
  const tokens = String(alias || '').toLowerCase().split(/\s+/).filter(Boolean);
  const perToken = tokens.map(pinyinInitials).filter(Boolean);
  if (!perToken.length) return [];
  const joined = perToken.join('');
  return perToken.length > 1 ? [...perToken, joined] : perToken;
}

/**
 * 查询串是不是这条别名的首字母缩写。
 *
 * 只认前缀，不认子串：`nf` 应当找到「牛奶粉」，但不该在「西红柿炒蛋」
 * 的首字母 `xhscd` 中间碰巧命中就算数 —— 那样两个字母能匹配上半个库。
 * 也要求至少两个字母，单个字母同样会匹配得到处都是。
 */
export function matchesInitials(query, alias) {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2 || !/^[a-z]+$/.test(q)) return false;
  return aliasInitials(alias).some((initials) => initials.startsWith(q));
}
