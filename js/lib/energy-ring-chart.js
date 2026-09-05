/**
 * 今日热量环：整圈 = 今天计划吃多少。只负责画，不算。
 *
 * 两条轨道各画各的：外圈粗的是摄入，内圈细的是消耗。
 * 每条轨道第一圈浅色、第二圈深色盖在浅色上，一条不去动另一条。
 *
 * **这里只画弧，一个字都不写。** 圈心那两行和下面的图例都是 HTML
 * （见 views/dashboard.js 的 ringCenter / ringLegend）：SVG 里的字会跟着环缩放，
 * 窄屏上环缩到 62vw，一行 14px 的说明就掉到 12px 可读下限以下，
 * 而且它用的是自己算出来的字号，接不上 app.css 顶部那七档。
 */

const NS = 'http://www.w3.org/2000/svg';
const RING_GAP_DEG = 8;

/*
 * 上一次画到哪儿，用来让弧长「长过去」而不是直接跳。
 *
 * 记在模块里而不是 DOM 上：整张卡每次重绘都会重建这棵 SVG，
 * 挂在节点上的旧值会跟着节点一起被扔掉。
 *
 * 只在同一天、同一把尺子上才动画（`animateKey`）：翻到别的日期、
 * 改档案换了尺子，弧的含义都变了，把它当成「长了一截」是骗人。
 */
const lastArc = new Map();
const ARC_MS = 520;

function reduceMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}

export function energyRingChart({ model, size = 152, stroke = 14, animateKey = null }) {
  /*
   * 留白只够描边的抗锯齿用。
   *
   * 原先是 16，因为刻度和起点方块要从轨道外面探出来 —— 那两样都没了，
   * 于是 232px 的框里有 40px 是空的，环白白小了一圈，
   * 到下面那行图例的距离也跟着被撑开。框还是 232px，环填得更满。
   */
  const pad = 6;
  const vb = size + pad * 2;
  const cx = vb / 2;
  const cy = vb / 2;
  const r = (size - stroke) / 2;
  const burnR = r - stroke / 2 - 7;
  /*
   * 消耗环的粗细。原先是 3.5，主环 14 —— 4:1 之下它细得像一根发丝，
   * 和外面那条读不出是一套东西。5 仍然一眼分得出主次，又配得上。
   */
  const BURN_STROKE = 5;
  const span = 360 - RING_GAP_DEG;
  const start = -90 + RING_GAP_DEG / 2;

  const svg = el('svg', {
    viewBox: `0 0 ${vb} ${vb}`, class: 'ring energy-ring',
    preserveAspectRatio: 'xMidYMid meet', overflow: 'visible',
  });

  /* 两条轨道的几何和配色都只写一次，段落按 track / tone 取 */
  const TRACK = {
    intake: { radius: r, width: stroke, light: 'var(--ring-eat)', deep: 'var(--ring-eat-wrap)' },
    burn: { radius: burnR, width: BURN_STROKE, light: 'var(--ring-burn)', deep: 'var(--ring-burn-wrap)' },
  };

  /* 这一版的记忆重记一份，画完整棵树再换上去 —— 中途失败不该留下半份 */
  const nextArc = new Map();
  const canAnimate = animateKey != null && !reduceMotion() && typeof SVGElement !== 'undefined'
    && typeof SVGElement.prototype.animate === 'function';

  /*
   * 弧画成圆头（`round`），灰轨仍是方头。
   *
   * 圆头是这次改观感的主要一条：方切的端头读作「被裁断」，圆头读作「走到这儿了」——
   * 而「走到哪儿了」正是这只环唯一要说的事。原先端头另外刻一条同色的短线来说它，
   * 两端各出头 2.5px，在真机上读出来是弧上的一道划痕、一个豁口，不是记号。
   * 端头本身能说清楚，就不该再加一道线。
   *
   * 圆头会往两端各多画半个描边宽，所以画之前把这一截从长度里扣掉：
   * 落笔范围和方头时一模一样，吃满计划那一下也不会顶进 12 点的缺口。
   * 短到扣不出来的（刚记第一笔）留一个点 —— 圆头下的零长度就是个圆点。
   *
   * **起点靠 dashoffset 挪，不靠在 dasharray 前面塞一段 0。**
   * 「0 起点 长度 …」在方头下画不出东西，换成圆头之后那个零长度的段
   * 立刻变成一个整圆的点 —— 弧的起点上就鼓出一个比描边还宽的疙瘩，
   * 和弧身之间还留着一道豁口。实测就是这么来的。
   */
  const arc = (radius, width, cls, colour, fromPct, toPct, memoKey = null) => {
    const circ = 2 * Math.PI * radius;
    const usable = (span / 360) * circ;
    const from = (Math.max(0, Math.min(100, fromPct)) / 100) * usable;
    const len = (Math.max(0, Math.min(100, toPct)) / 100) * usable - from;
    const insetOf = (l) => Math.min(width / 2, Math.max(0, l) / 2);
    const dash = (l) => `${Math.max(0.01, Math.max(0, l) - insetOf(l) * 2)} ${circ}`;
    const memo = memoKey && { key: `${animateKey}|${model.scale}|${memoKey}`, len };
    if (memo) nextArc.set(memo.key, len);
    if (!(len > 0.3)) return;
    const node = el('circle', {
      cx, cy, r: radius, fill: 'none', class: cls, 'stroke-width': width, stroke: colour,
      'stroke-dasharray': dash(len),
      'stroke-dashoffset': -(from + insetOf(len)),
      transform: `rotate(${start} ${cx} ${cy})`,
    });
    svg.append(node);
    /*
     * 记一笔饮食之后弧应该长过去，而不是原地换一个长度 ——
     * 那一下是「刚才这口饭走了这么远」，跳变把它说没了。
     * 动画只改 CSS 上的 stroke-dasharray，结束后自然落回属性上的终值。
     */
    if (!canAnimate || !memo) return;
    const prev = lastArc.get(memo.key);
    if (prev == null || Math.abs(prev - len) < 0.5) return;
    node.animate(
      [{ strokeDasharray: dash(prev) }, { strokeDasharray: dash(len) }],
      { duration: ARC_MS, easing: 'cubic-bezier(.22,.61,.36,1)' },
    );
  };

  /*
   * 灰轨先铺满 —— 没画到的地方就是还没走到的部分。
   *
   * **灰轨的两端也是圆头。** 一圈圆头的弧躺在一条方切的槽里，两端对不上，
   * 12 点那道缺口读出来像是被裁出来的，不像特意留的。
   * 圆头会往两端各鼓出半个描边，所以和弧走同一套长度补偿（`round` 那条路）：
   * 落笔范围仍是 352°，缺口一点没被糊上。
   *
   * **消耗那条轨道只在真有设备数据时才铺。** 手表没连、今天没同步的时候，
   * 里面那圈灰是画给一条永远不会出现的弧的：它说「这儿还有一样东西」，
   * 然后一整天什么都不来。粗细从 3.5 提到 5 之后这一圈更显眼，更不能空着。
   */
  arc(r, stroke, 'ring-track', null, 0, 100);
  if (model.hasBurn) arc(burnR, BURN_STROKE, 'ring-burn-track', null, 0, 100);

  /*
   * 先画完所有第一圈，再画所有第二圈。
   *
   * 同一条轨道上第二圈必须压在第一圈上面（深色盖浅色），而 model.segments
   * 的顺序不保证这一点 —— 按 tone 分两趟画，叠放次序就跟数据顺序无关了。
   */
  for (const tone of ['light', 'deep']) {
    for (const seg of model.segments || []) {
      if (seg.tone !== tone) continue;
      const t = TRACK[seg.track] || TRACK.intake;
      arc(t.radius, t.width, `ring-seg ring-seg-${seg.track} ring-seg-${tone}`,
        t[tone], seg.fromPct, seg.toPct, seg.key);
    }
  }

  lastArc.clear();
  for (const [k, v] of nextArc) lastArc.set(k, v);
  return svg;
}
