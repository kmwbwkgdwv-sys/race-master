// マップ定義。h = { B(箱), F(床), cyl(円柱), ball(球), dome(だ円の山), cap(丸頭の柱), arch(アーチ), outer(外壁), rnd(乱数),
//                   lathe(回転体：たる・つぼ), ring(輪の飾り), slab(岩の板：凸の多角形の柱), lump(でこぼこ), capc(向きつきの柱) … }
// B(x, y0, z, 幅, 高さ, 奥行, 色, opt)  ※ x,z は中心、y0 は底面の高さ
// opt.pat = [模様, 地の色, 模様の色(配列も可), 横のくり返し, 縦のくり返し]  模様は patterns.js
// opt.nocol = 当たり判定なし（面に貼った薄い飾りだけに使う。体がうまる大きさの物には使わない）
// opt.sink = 絵・模様の壁（隠れる側は体の前の方だけが少し入りこむ。全身はうまらない）
// opt.soft + sinkV = 水面・ボールの海（上から入ると沈む。沈むのは体の高さの3割ほどまで）
// 見た目と当たり判定はそろえる：かたむけた箱・ねかせた円柱・玉・タイヤ・枝・葉っぱも、見た目どおりに当たる
export const MAP_LIST = [['house', 'おうち'], ['park', '公園'], ['school', '学校'], ['warehouse', '倉庫'], ['town', '夜の商店街'],
  ['station', 'ガソリンスタンド'], ['circuit', 'サーキット'], ['desert', '古代の砂漠'], ['neon', 'ネオン街'], ['volcano', '火山']];

const NC = { nocol: true }, FL = { nocol: true, flat: true };
const WALL = 4.5; // 内壁の高さ
const ROOM_WALL = 6; // 部屋のマップ（おうち・学校）の内壁の高さ＝外壁と同じ。上には見えない天井があり、壁のふちには乗れない
const shade = (c, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join(''); // 色を明るく・暗く
const seed8 = h => Math.floor(h.rnd() * 8);
const pick = (h, a) => a[Math.floor(h.rnd() * a.length)];
const LEAF = ['#2f7d3a', '#3b8f46', '#25622d', '#4a9a3e'];
const LEAFC = { core: 0.92 }; // 葉っぱ：かたいかたまり（でこぼこの表面に体が少し入るだけ。中にはもぐれない）
const TOY = ['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a', '#b06fd8', '#f08a3c'];
const CARD = ['#c7a36a', '#b8935a', '#d4b483', '#a8834f'];
const CONT = ['#b8452f', '#2f6fb0', '#3f9b6a', '#d98a2b', '#7b5ea7', '#8d8f94', '#c9b037'];
const WOOD = '#8a5a33';

// 模様えらび（地の色はそのマップの色、模様の色はアクセント色）
const PATK = ['dots', 'hstripe', 'vband', 'diag', 'zigzag', 'check2', 'camo', 'confetti', 'splat', 'wave', 'rainbow', 'brick', 'bigcamo'];
function rpat(h, pal, acc, rx = 1, ry = 1, kinds = PATK) {
  const k = pick(h, kinds), a = pick(h, pal);
  let b = pick(h, acc); if (b === a) b = '#f4f4f4';
  const c2 = k === 'camo' ? [pick(h, pal), b, pick(h, pal)] : k === 'bigcamo' ? [b, shade(a, 0.78)] : (k === 'confetti' || k === 'splat' || k === 'rainbow') ? acc : b;
  return [k, a, c2, rx, ry];
}
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/* ---- 形づくりの道具 ---- */
function hull(P) { // 凸包（岩の板の形を凸の多角形にする）
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// だ円（rx, rz を rot だけ回す）のまわりに n 個の点を少しゆらして置き、凸の多角形にする
function rockPts(h, rx, rz, n = 8, j = 0.15, rot = 0) {
  const P = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = (i + (h.rnd() - 0.5) * 0.55) / n * 6.2832, k = 1 - h.rnd() * j, px = Math.cos(a) * rx * k, pz = Math.sin(a) * rz * k; P.push([px * c - pz * s, px * s + pz * c]); }
  return hull(P);
}
// 角ばった岩（平らな面が多い。大きな色の面の岩肌なので、体に同じ色を塗ってはりつける）
function stone(h, x, z, s, c, y = 0, flat = 0) {
  const ht = s * (flat || (0.6 + h.rnd() * 0.55)), pts = rockPts(h, s, s * (0.62 + h.rnd() * 0.35), 7 + Math.floor(h.rnd() * 3), 0.16, h.rnd() * 6.28);
  h.slab(x, y, z, pts, ht, c, { top: 0.84 + h.rnd() * 0.1, bev: Math.min(0.24, ht * 0.25), pat: ['rockface', c, [shade(c, 0.86), shade(c, 1.12)], 0.42, 0.42] });
  return ht;
}

/* ---- 家具・小物（実物をまねて細かく作る。当たり判定も見た目どおり） ---- */
const table = (h, x, z, w, d, c, ht = 0.76) => { // 天板・幕板・下が細い脚
  h.B(x, ht - 0.07, z, w, 0.07, d, c, { r: 0.03, pat: ['grain', c, 0, 2, 1] });
  const ac = shade(c, 0.85);
  for (const s of [-1, 1]) { h.B(x, ht - 0.17, z + s * (d / 2 - 0.09), w - 0.24, 0.1, 0.04, ac, { r: 0.01 }); h.B(x + s * (w / 2 - 0.09), ht - 0.17, z, 0.04, 0.1, d - 0.24, ac, { r: 0.01 }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.cyl(x + sx * (w / 2 - 0.09), 0, z + sz * (d / 2 - 0.09), 0.035, ht - 0.07, ac, { rt: 0.05, seg: 10 });
};
// いす：座面・4本の脚・背もたれ（fz / fx = 座った人が向く方向）
const chair = (h, x, z, c, fz = 1, fx = 0) => {
  const sh = 0.46, w = 0.46, ac = shade(c, 0.85);
  h.B(x, sh - 0.05, z, w, 0.05, w, c, { r: 0.02, pat: ['grain', c, 0, 1, 1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.cyl(x + sx * (w / 2 - 0.04), 0, z + sz * (w / 2 - 0.04), 0.022, sh - 0.05, ac, { seg: 8 });
  const bx = x - fx * (w / 2 - 0.03), bz = z - fz * (w / 2 - 0.03), al = fz !== 0;
  for (const s of [-1, 1]) h.B(bx + (al ? s * (w / 2 - 0.03) : 0), sh, bz + (al ? 0 : s * (w / 2 - 0.03)), 0.04, 0.5, 0.04, ac, { r: 0.01 });
  h.B(bx, sh + 0.32, bz, al ? w : 0.035, 0.16, al ? 0.035 : w, c, { r: 0.015 });
  h.B(bx, sh + 0.12, bz, al ? w - 0.08 : 0.03, 0.06, al ? 0.03 : w - 0.08, c, { r: 0.01 });
};
// ソファ：脚・台・ひじかけ・背もたれ・分かれた座面と背のクッション。back = ±1 背もたれのある側
function sofa(h, x, z, L, c, al, back) {
  const D = 1.15, P = (a, b) => (al ? [x + a, z + b] : [x + b, z + a]), fab = ['fabric', c, 0, 2, 1];
  const B = (a, y, b, l, ht, d, col, o) => { const [px, pz] = P(a, b); h.B(px, y, pz, al ? l : d, ht, al ? d : l, col, o); };
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = P(sa * (L / 2 - 0.14), sb * (D / 2 - 0.14)); h.cyl(px, 0, pz, 0.04, 0.12, '#3a2a1c', { seg: 8 }); }
  B(0, 0.12, 0, L, 0.2, D, shade(c, 0.88), { r: 0.06, pat: fab });
  for (const s of [-1, 1]) B(s * (L / 2 - 0.14), 0.12, 0, 0.28, 0.55, D, c, { r: 0.1, pat: fab });
  B(0, 0.12, back * (D / 2 - 0.15), L, 0.82, 0.3, c, { r: 0.12, pat: fab });
  const n = Math.max(2, Math.round((L - 0.56) / 0.85)), cw = (L - 0.56) / n;
  for (let i = 0; i < n; i++) {
    const a = -L / 2 + 0.28 + cw * (i + 0.5);
    B(a, 0.32, -back * 0.08, cw - 0.04, 0.17, D - 0.4, shade(c, 1.06), { r: 0.07, pat: fab }); // 座面のクッション
    B(a, 0.49, back * (D / 2 - 0.4), cw - 0.06, 0.42, 0.2, shade(c, 1.12), { r: 0.09, pat: fab }); // 背のクッション
  }
}
const sofaX = (h, x, z, w, c, back) => sofa(h, x, z, w, c, true, back);
const sofaZ = (h, x, z, d, c, back) => sofa(h, x, z, d, c, false, back);
// ベッド：脚・木のわく・マットレス・掛けぶとん・まくら・ヘッドボード（ベッドの下には少しすき間がある）
const bed = (h, x, z, c) => {
  const W = 2.2, L = 3.2, wd = '#6b4a2b';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.B(x + sx * (W / 2 - 0.08), 0, z + sz * (L / 2 - 0.08), 0.12, 0.32, 0.12, wd, { r: 0.02 });
  h.B(x, 0.3, z, W, 0.14, L, wd, { r: 0.03, pat: ['grain', wd, 0, 2, 2] });
  h.B(x, 0.44, z, W - 0.1, 0.24, L - 0.14, '#efe9df', { r: 0.1, pat: ['fabric', '#efe9df', 0, 3, 3] });
  h.B(x, 0.64, z - 0.32, W + 0.04, 0.1, L - 0.74, c, { r: 0.05, pat: ['fabric', c, 0, 3, 3] });
  h.B(x, 0.46, z - L / 2 + 0.04, W + 0.04, 0.24, 0.06, c, { r: 0.03 }); // 足もとに垂れた掛けぶとん
  for (const s of [-1, 1]) h.lump(x + s * 0.5, 0.79, z + 1.15, 0.42, 0.11, 0.24, '#ffffff', { seed: seed8(h), bump: 0.12, freq: 1.3, pat: ['fabric', '#ffffff', 0, 2, 1] });
  h.B(x, 0, z + L / 2 + 0.06, W + 0.12, 1.25, 0.12, wd, { r: 0.04, pat: ['grain', wd, 0, 2, 1] });
  for (const s of [-1, 1]) h.cyl(x + s * (W / 2 + 0.02), 0, z + L / 2 + 0.06, 0.07, 1.4, wd, { seg: 12 }); // ヘッドボードの柱
  h.B(x, 0, z - L / 2 - 0.05, W + 0.1, 0.64, 0.1, wd, { r: 0.03 });
};
// 車：車体・屋根・窓・バンパー・ライト・ミラー・ドアの線・車輪（車の下にも少しすき間がある）
const car = (h, x, z, c, alongX) => {
  const L = 4.4, W = 2, P = (a, b) => (alongX ? [x + a, z + b] : [x + b, z + a]);
  const B = (a, y, b, l, ht, w, col, o) => { const [px, pz] = P(a, b); h.B(px, y, pz, alongX ? l : w, ht, alongX ? w : l, col, o); };
  const G = '#1e2a36', gl = { nocol: true, r: 0.02, rough: 0.12 };
  B(0, 0.32, 0, L, 0.6, W, c, { r: 0.3 });
  B(-0.15, 0.92, 0, 2.4, 0.62, W - 0.26, c, { r: 0.28 });
  for (const s of [-1, 1]) { B(-0.15, 0.98, s * (W / 2 - 0.12), 2.1, 0.44, 0.04, G, gl); B(-0.15, 0.98, s * (W / 2 - 0.115), 0.06, 0.44, 0.05, c, NC); } // 横の窓と柱
  B(1.06, 0.98, 0, 0.04, 0.44, W - 0.42, G, gl); B(-1.36, 0.98, 0, 0.04, 0.44, W - 0.42, G, gl); // 前後のガラス
  B(L / 2 + 0.04, 0.3, 0, 0.18, 0.26, W - 0.08, '#2a3038', { r: 0.09 }); B(-L / 2 - 0.04, 0.3, 0, 0.18, 0.26, W - 0.08, '#2a3038', { r: 0.09 }); // バンパー
  for (const s of [-1, 1]) {
    B(L / 2 + 0.005, 0.64, s * 0.68, 0.05, 0.14, 0.36, '#fff4c2', { nocol: true, glow: 0.6, r: 0.03 }); B(-L / 2 - 0.005, 0.64, s * 0.7, 0.05, 0.14, 0.32, '#e0413a', { nocol: true, glow: 0.5, r: 0.03 });
    B(0.92, 0.94, s * (W / 2 + 0.07), 0.14, 0.12, 0.14, c, { r: 0.04 }); // ミラー
    B(0.05, 0.42, s * (W / 2 + 0.004), 0.02, 0.46, 0.01, shade(c, 0.65), NC); B(-0.35, 0.78, s * (W / 2 + 0.01), 0.2, 0.04, 0.02, '#c9ccd0', NC); // ドアの線・取っ手
  }
  B(L / 2 + 0.135, 0.34, 0, 0.02, 0.15, 0.52, '#f4f4f4', NC); // ナンバー
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = P(sa * 1.4, sb * 0.92); h.wheel(px, 0.36, pz, 0.36, 0.28, alongX ? 'z' : 'x'); }
};
const palm = (h, x, z, s = 1) => { // ヤシ：節のある幹・葉（葉にも当たる）・実
  const H = 4 * s;
  h.cyl(x, 0, z, 0.36 * s, H, '#8a6a3c', { rt: 0.24 * s, pat: ['bark', '#8a6a3c', 0, 2, 3] });
  for (let k = 1; k < 8; k++) h.ring(x, k * H / 8, z, (0.36 - 0.12 * k / 8) * s + 0.01, 0.035 * s, '#6b4a2b');
  h.cyl(x, H, z, 0.7 * s, 0.2 * s, '#6b4a2b', { rt: 0.55 * s });
  for (let i = 0; i < 7; i++) {
    const a = i * 0.898 + h.rnd() * 0.3, ca = Math.cos(a), sa = Math.sin(a);
    h.dome(x + ca * 1.2 * s, 4.05 * s, z + sa * 1.2 * s, 1.4 * s, 0.24 * s, 0.5 * s, '#3f8f3a', { nocol: true, rot: a, pat: ['leaf', '#3f8f3a', LEAF, 3, 1] });
    for (const d of [0.6, 1.25, 1.95]) h.ell(x + ca * d * s, (4.12 - d * 0.08) * s, z + sa * d * s, 0.4 * s, 0.2 * s, 0.4 * s); // 葉の当たり判定
  }
  for (let i = 0; i < 3; i++) h.ball(x + Math.cos(i * 2.1) * 0.3 * s, 3.85 * s, z + Math.sin(i * 2.1) * 0.3 * s, 0.17 * s, '#6b4a2b');
};
// 木：根もとが広がった太い幹（登れる）・枝・でこぼこの葉っぱのかたまり
// 葉っぱはかたいので中にはもぐれない。上に乗ると表面のでこぼこに少しだけ体が沈む
const tree = (h, x, z, s = 1) => {
  const th = 2.5 * s, bk = ['bark', '#6b4a2b', 0, 3, 2];
  h.lathe(x, 0, z, [[0.001, 0], [0.9 * s, 0], [0.66 * s, 0.16 * s], [0.52 * s, 0.5 * s], [0.46 * s, th * 0.6], [0.38 * s, th], [0.3 * s, th + 0.4 * s], [0.001, th + 0.45 * s]], '#6b4a2b',
    { pat: bk, seg: 14, cols: [[0, 0.3 * s, 0.78 * s, 0.56 * s], [0.3 * s, th, 0.52 * s, 0.38 * s]] });
  for (let i = 0; i < 5; i++) { // 根
    const a = i * 1.2566 + h.rnd() * 0.5, len = (0.8 + h.rnd() * 0.4) * s;
    h.capc(x + Math.cos(a) * (0.5 * s + len * 0.4), 0.06 * s, z + Math.sin(a) * (0.5 * s + len * 0.4), 0.14 * s, len, Math.cos(a), -0.12, Math.sin(a), '#5a3c24', { pat: ['bark', '#5a3c24', 0, 1, 2] });
  }
  for (let i = 0; i < 4; i++) { const a = i * 1.571 + h.rnd() * 0.8, tl = 0.6 + h.rnd() * 0.35, len = (1.1 + h.rnd() * 0.5) * s, dx = Math.cos(a) * Math.sin(tl), dy = Math.cos(tl), dz = Math.sin(a) * Math.sin(tl); h.capc(x + dx * len / 2, th - 0.2 * s + dy * len / 2, z + dz * len / 2, 0.13 * s, len, dx, dy, dz, '#5a3c24', { pat: ['bark', '#5a3c24', 0, 1, 2] }); }
  // 葉っぱは小さめのかたまりをいくつも集めた形（かたまりの間のくぼみは本物のくぼみ。かたまりの中にはもぐれない）
  const cs = ['#2f7d3a', '#3b8f46', '#2e6b34', '#357f3c'];
  const leaf = (px, py, pz, r) => { const c = pick(h, cs); h.lump(px, py, pz, r * 1.05, r * 0.86, r, c, { core: 0.93, seed: seed8(h), bump: 0.15, freq: 2.6, ry: h.rnd() * 6.28, pat: ['leaf', c, LEAF, 2, 2] }); };
  leaf(x, th + 1.6 * s, z, 1.05 * s);
  const n = 5 + (h.rnd() < 0.5 ? 1 : 0), a0 = h.rnd() * 6.28;
  for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.2832 + (h.rnd() - 0.5) * 0.4; leaf(x + Math.cos(a) * 1.05 * s, th + (0.75 + h.rnd() * 0.3) * s, z + Math.sin(a) * 1.05 * s, (0.82 + h.rnd() * 0.25) * s); }
  for (let i = 0; i < 3; i++) { const a = a0 + 0.5 + i * 2.094; leaf(x + Math.cos(a) * 0.85 * s, th + 0.05 * s, z + Math.sin(a) * 0.85 * s, 0.68 * s); }
};
const plant = (h, x, z) => { // 鉢植え：ふちのある鉢・土・葉っぱ
  h.lathe(x, 0, z, [[0.001, 0], [0.26, 0], [0.35, 0.5], [0.4, 0.52], [0.4, 0.6], [0.35, 0.6], [0.34, 0.54], [0.001, 0.53]], '#b5651d', { cols: [[0, 0.6, 0.3, 0.4]] });
  h.cyl(x, 0.5, z, 0.33, 0.04, '#4a3426', NC);
  h.lump(x, 1.15, z, 0.7, 0.72, 0.7, '#2f7d3a', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] });
};
const tires = (h, x, z, n = 3) => { // 積んだタイヤ：まん中の穴に入れる（当たり判定は輪にそって並べた細い柱）
  for (let i = 0; i < 8; i++) { const a = i * 0.785; h.cylc(x + Math.cos(a) * 0.36, 0, z + Math.sin(a) * 0.36, 0.14, 0.3 * n); }
  for (let i = 0; i < n; i++) h.tire(x, i * 0.3, z, 0.5, NC);
};
const pylon = (h, x, z) => { h.B(x, 0, z, 0.42, 0.04, 0.42, '#f08a3c'); h.cone(x, 0.04, z, 0.17, 0.55, '#f08a3c', { pat: ['hstripe', '#f08a3c', '#f4f4f4', 1, 2] }); };
const kart = (h, x, z, c) => {
  h.B(x, 0.12, z, 1.1, 0.3, 1.8, c, { r: 0.14 }); h.B(x, 0.42, z + 0.42, 0.66, 0.42, 0.42, '#2a3038', { r: 0.12 });
  h.B(x, 0.42, z - 0.55, 0.9, 0.14, 0.3, shade(c, 0.85), { r: 0.06 }); h.cyl(x, 0.42, z - 0.25, 0.03, 0.3, '#2a3038', { seg: 8 }); h.ring(x, 0.72, z - 0.25, 0.14, 0.025, '#2a3038');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(x + sx * 0.62, 0.22, z + sz * 0.62, 0.22, 0.2, 'x');
};
const pump = (h, x, z) => { // 給油機：島（縁石）・本体・画面・ノズル掛け・ホース・車止め
  h.B(x, 0, z, 1.5, 0.18, 5, '#c9c9c9', { r: 0.06, pat: ['noise', '#c9c9c9', 0, 2, 4] });
  h.B(x, 0.18, z, 0.95, 1.75, 0.6, '#e0413a', { r: 0.2 }); h.B(x, 1.93, z, 1.05, 0.3, 0.7, '#f4f4f4', { r: 0.06 });
  for (const s of [-1, 1]) {
    h.B(x, 1.2, z + s * 0.31, 0.7, 0.45, 0.02, '#15171a', NC); h.B(x - 0.15, 1.32, z + s * 0.32, 0.3, 0.12, 0.01, '#5fe0a0', { nocol: true, glow: 0.8 }); // 画面
    h.B(x + 0.25, 0.7, z + s * 0.34, 0.18, 0.3, 0.1, '#2a3038', { r: 0.03 }); // ノズル掛け
    h.capc(x + 0.25, 0.6, z + s * 0.42, 0.035, 0.6, 0.05, -1, 0.2 * s, '#22262b', NC); // ホース
    h.cyl(x, 0.18, z + s * 2.1, 0.12, 0.9, '#f0d040', { pat: ['hstripe', '#f0d040', '#2a3038', 1, 3] });
  }
};
const lamp = (h, x, z, ht = 2.6) => { h.cyl(x, 0, z, 0.16, 0.12, '#444a50'); h.cyl(x, 0, z, 0.07, ht, '#444a50'); h.cyl(x, ht, z, 0.2, 0.05, '#444a50', NC); h.ball(x, ht + 0.22, z, 0.26, '#fff4c2', { glow: 1 }); };
const bench = (h, x, z, alongX, c = WOOD, fz = 1) => { // ベンチ：板の座面・背もたれ・鉄の脚（fz = 背もたれのある側）
  const L = 2, P = (a, b) => (alongX ? [x + a, z + b * fz] : [x + b * fz, z + a]), B = (a, y, b, l, ht, d, col, o) => { const [px, pz] = P(a, b); h.B(px, y, pz, alongX ? l : d, ht, alongX ? d : l, col, o); };
  for (let i = 0; i < 3; i++) B(0, 0.42, -0.2 + i * 0.17, L, 0.05, 0.13, c, { r: 0.02, pat: ['grain', c, 0, 2, 1] });
  for (let i = 0; i < 2; i++) B(0, 0.6 + i * 0.2, 0.3, L, 0.13, 0.04, c, { r: 0.02, pat: ['grain', c, 0, 2, 1] });
  for (const s of [-1, 1]) { B(s * (L / 2 - 0.15), 0, -0.2, 0.06, 0.42, 0.06, '#2a3038', { r: 0.01 }); B(s * (L / 2 - 0.15), 0, 0.22, 0.06, 1.0, 0.06, '#2a3038', { r: 0.01 }); B(s * (L / 2 - 0.15), 0.38, 0.01, 0.06, 0.05, 0.5, '#2a3038', { r: 0.01 }); }
};
const carton = (h, x, y, z, w, ht, d, c) => h.B(x, y, z, w, ht, d, c, { r: 0.03, pat: ['carton', c, 0, 1, 1] }); // 段ボール（ガムテープつき）
const woodcrate = (h, x, y, z, s, c = '#b08a5a') => { // 木箱（板・わく・くぎ）
  h.B(x, y, z, s, s, s, c, { r: 0.04, pat: ['planks', c, 0, 1, 1] });
  for (const a of [-1, 1]) for (const b of [-1, 1]) h.B(x + a * (s / 2 - 0.02), y, z + b * (s / 2 - 0.02), 0.07, s, 0.07, shade(c, 0.75), { nocol: true, r: 0.01 }); // 角の柱
};
function drum(h, x, z, c, y = 0) { // ドラム缶（ふち・2本の輪・注ぎ口）
  const R = 0.45, H = 1.2;
  h.lathe(x, y, z, [[0.001, 0], [R, 0], [R, 0.04], [R * 0.96, 0.07], [R * 0.96, H - 0.07], [R, H - 0.04], [R, H], [R * 0.92, H], [R * 0.92, H - 0.025], [0.001, H - 0.025]], c, { rough: 0.45, seg: 22 });
  for (const t of [0.36, 0.7]) h.ring(x, y + t * H, z, R * 0.98, 0.025, shade(c, 0.82));
  h.cyl(x + R * 0.55, y + H - 0.025, z, 0.06, 0.03, shade(c, 0.7), { nocol: true, seg: 10 });
}
function cask(h, x, z, y = 0) { // 木のたる（ふくらんだ形・たが）
  const R = 0.44, H = 1.08, prof = [[0.001, 0]];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([R * (0.84 + 0.16 * Math.sin(t * Math.PI)), t * H]); }
  prof.push([R * 0.78, H], [0.001, H - 0.03]);
  h.lathe(x, y, z, prof, WOOD, { pat: ['vband', WOOD, '#7a4c2a', 5, 1], seg: 20 });
  for (const t of [0.1, 0.34, 0.66, 0.9]) h.ring(x, y + t * H, z, R * (0.84 + 0.16 * Math.sin(t * Math.PI)) + 0.005, 0.028, '#3a3d44');
}
const pallet = (h, x, z, c = '#b08a5a') => { // 木のパレット（板のあいだにすき間）
  for (const s of [-1, 0, 1]) h.B(x + s * 0.72, 0, z, 0.14, 0.1, 1.7, shade(c, 0.85));
  for (let i = 0; i < 5; i++) h.B(x, 0.1, z - 0.7 + i * 0.35, 1.7, 0.05, 0.22, c, { pat: ['grain', c, 0, 2, 1] });
};
function vending(h, x, z, c, fz = 1) { // 自動販売機（飲み物の窓・ボタン・お金を入れる所・取り出し口）
  h.B(x, 0, z, 1, 1.9, 0.8, c, { r: 0.08 });
  const zf = z + fz * 0.405;
  h.B(x - 0.1, 0.95, zf, 0.72, 0.82, 0.02, '#dfeff5', { nocol: true, glow: 0.35, rough: 0.12, pat: ['vend', '#dfeff5', TOY, 1, 1] });
  h.B(x + 0.36, 1.0, zf, 0.16, 0.56, 0.02, '#2a3038', NC);
  for (let i = 0; i < 4; i++) h.B(x + 0.36, 1.06 + i * 0.12, zf + fz * 0.01, 0.08, 0.05, 0.02, '#ffd940', { nocol: true, glow: 0.6 });
  h.B(x - 0.1, 0.2, zf, 0.72, 0.3, 0.02, '#15171a', NC); h.B(x, 1.8, zf, 0.9, 0.08, 0.02, '#f4f4f4', { nocol: true, glow: 0.4 });
}
function bookshelf(h, x, z, w, d, ht, c) { // 本だな（中は本でいっぱい。当たり判定は全体の箱）
  const al = w >= d;
  h.B(x, 0, z, w, ht, d, c, { r: 0.03, pat: ['grain', c, 0, 1, 2] });
  for (const s of [-1, 1]) h.B(al ? x : x + s * (d / 2 + 0.005), 0.08, al ? z + s * (d / 2 + 0.005) : z, al ? w - 0.12 : 0.01, ht - 0.16, al ? 0.01 : w - 0.12, '#f4f1e8', { nocol: true, pat: ['books', c, TOY.concat(['#2a3038', '#f4f1e8']), Math.max(1, Math.round(Math.max(w, d) / 1.2)), Math.max(1, Math.round(ht / 2))] });
}
const brick = (h, x, y, z, s, c) => { h.B(x, y, z, s, s * 0.6, s, c, { r: 0.05 }); for (const a of [-1, 1]) for (const b of [-1, 1]) h.cyl(x + a * s / 4, y + s * 0.6, z + b * s / 4, s * 0.12, s * 0.1, c, { seg: 12, nocol: true }); }; // おもちゃのブロック（上にぽっち）
const stool = (h, x, z, c) => { h.cyl(x, 0, z, 0.22, 0.03, '#55606b'); h.cyl(x, 0, z, 0.04, 0.6, '#8d8f94', { seg: 8 }); h.cyl(x, 0.6, z, 0.24, 0.08, c, { rt: 0.26 }); h.ring(x, 0.25, z, 0.17, 0.015, '#8d8f94'); };
const bin = (h, x, z, c = '#3f9b6a') => { h.lathe(x, 0, z, [[0.001, 0], [0.3, 0], [0.34, 0.85], [0.37, 0.86], [0.37, 0.95], [0.001, 0.95]], c, { pat: ['vband', c, shade(c, 0.85), 6, 1] }); h.B(x, 0.95, z, 0.3, 0.06, 0.08, shade(c, 0.7), NC); }; // ゴミ箱
const hydrant = (h, x, z) => { h.lathe(x, 0, z, [[0.001, 0], [0.18, 0], [0.18, 0.06], [0.13, 0.08], [0.13, 0.62], [0.16, 0.66], [0.15, 0.78], [0.06, 0.86], [0.001, 0.88]], '#e0413a', { cols: [[0, 0.88, 0.16, 0.12]] }); for (const s of [-1, 1]) h.cyl(x + s * 0.18, 0.45, z, 0.06, 0.12, '#e0413a', { rot: [0, 0, Math.PI / 2], nocol: true }); }; // 消火栓
const mailbox = (h, x, z) => { h.B(x, 0, z, 0.14, 0.75, 0.14, '#2a3038'); h.B(x, 0.75, z, 0.5, 0.65, 0.42, '#d9342b', { r: 0.16 }); h.B(x, 1.2, z + 0.215, 0.3, 0.04, 0.01, '#15171a', NC); }; // ポスト

// x方向／z方向にのびる壁。pat = [模様, 模様の色] で壁紙つき
const wallPat = (pat, c, len, ht) => (pat ? { sink: true, pat: [pat[0], c, pat[1], Math.max(1, Math.round(len / 1.6)), Math.max(1, Math.round(ht / 1.6))] } : undefined); // 壁紙の壁には体の前の方が少し入る
const wallX = (h, z, x0, x1, c, ht = WALL, pat) => h.B((x0 + x1) / 2, 0, z, x1 - x0, ht, 0.4, c, wallPat(pat, c, x1 - x0, ht));
const wallZ = (h, x, z0, z1, c, ht = WALL, pat) => h.B(x, 0, (z0 + z1) / 2, 0.4, ht, z1 - z0, c, wallPat(pat, c, z1 - z0, ht));

/* ---- 額縁の絵：隠れる側は絵に体の前の方を少しだけ入れられる（絵と同じ色・形を体に塗れば同化できる） ---- */
const ART = ['artLand', 'artGrid', 'artFruit', 'artSea', 'artFlower', 'artNight', 'artDots', 'artAbs', 'artField', 'artCat'];
const ARTPAL = [['#4f9a45', '#6fae5a', '#3b7f3a', '#2e6b34'], ['#e04f4f', '#4f7fe0', '#f0d040', '#f4f1e8'], ['#f3e3c3', '#e0719a', '#59b6d8', '#f0d040', '#b06fd8'],
  ['#2f6fb0', '#59b6d8', '#f4f4f4', '#1b2a5a'], ['#f08a3c', '#f0d040', '#e04f4f', '#8a5a33'], ['#b06fd8', '#ff8ac8', '#4fbf6a', '#f0d040'], ['#d9b08c', '#8a5a33', '#c9573f', '#5a3c28']];
// (x,z) = 壁の表面の点、(nx,nz) = 壁から外への向き、y0 = 絵の下の高さ
function pic(h, x, y0, z, nx, nz, w, ht, kind, P) {
  const t = 0.22, al = nz !== 0, k = kind || pick(h, ART); P = P || pick(h, ARTPAL);
  h.B(x + nx * t / 2, y0, z + nz * t / 2, al ? w : t, ht, al ? t : w, P[0], { pat: [k, P[0], P, 1, 1], sharp: true, sink: true });
  const fc = pick(h, ['#c9a24a', '#6b4a2b', '#2a3038', '#f4f4f4']), f = 0.12, ft = t + 0.05, cx = x + nx * ft / 2, cz = z + nz * ft / 2, o = { r: 0.03 };
  for (const s of [-1, 1]) {
    h.B(cx, s < 0 ? y0 - f : y0 + ht, cz, al ? w + 2 * f : ft, f, al ? ft : w + 2 * f, fc, o); // 額縁の上下
    h.B(al ? cx + s * (w / 2 + f / 2) : cx, y0, al ? cz : cz + s * (w / 2 + f / 2), al ? f : ft, ht, al ? ft : f, fc, o); // 左右
  }
}

/* ---- 中に入れる物（現実に中に入れる物は入れるように。入口は隠れる側が通れる大きさ） ---- */
// 箱の殻（4つの壁と屋根）。dir = 入口の向き、dw/dh = 入口の幅・高さ（dw が面より広いとその面はまるごと開く）
function shell(h, x, z, w, d, ht, t, col, o, dir, dw, dh, roof = true) {
  for (const [nx, nz] of DIRS) {
    const alZ = nx !== 0, L = alZ ? d - 2 * t : w, cx = x + nx * (w / 2 - t / 2), cz = z + nz * (d / 2 - t / 2);
    const seg = (a, b, y0, y1) => { if (b - a < 0.02 || y1 - y0 < 0.02) return; const m = (a + b) / 2; h.B(alZ ? cx : cx + m, y0, alZ ? cz + m : cz, alZ ? t : b - a, y1 - y0, alZ ? b - a : t, col, o); };
    if (dir && nx === dir[0] && nz === dir[1] && dw > 0) { const e = Math.min(dw, L) / 2; seg(-L / 2, -e, 0, ht); seg(e, L / 2, 0, ht); seg(-e, e, Math.min(dh, ht), ht); }
    else seg(-L / 2, L / 2, 0, ht);
  }
  if (roof) h.B(x, ht, z, w, t, d, col, o);
}
// 横にねかせた筒（土管・中が空洞の丸太）。当たり判定は輪切りにした箱を重ねる（中は平らな床）
function tube(h, x, z, ro, ri, L, alongX, col, o) {
  h.tube(x, ro, z, ro, ri, L, alongX ? 'x' : 'z', col, o);
  const cy = ro, yf = Math.min(ro - ri + 0.1, 0.22), zi0 = Math.sqrt(ri * ri - (cy - yf) * (cy - yf)); // 床は段差で上がれる高さ
  const box = (a, b, y0, y1) => { const m = (a + b) / 2; h.boxc(alongX ? x : x + m, y0, alongX ? z + m : z, alongX ? L : b - a, y1 - y0, alongX ? b - a : L, { sharp: true }); };
  box(-zi0, zi0, 0, yf);
  h.B(x, yf - 0.04, z, alongX ? L - 0.04 : 2 * zi0 + 0.1, 0.04, alongX ? 2 * zi0 + 0.1 : L - 0.04, shade(col, 0.6), { nocol: true, sharp: true }); // 中の床（落ち葉・砂）
  const N = 6, hs = (cy + ri - yf) / N;
  for (let k = 0; k < N; k++) {
    const ya = yf + k * hs, yb = ya + hs, dIn = Math.max(Math.abs(ya - cy), Math.abs(yb - cy)), dOut = ya <= cy && yb >= cy ? 0 : Math.min(Math.abs(ya - cy), Math.abs(yb - cy));
    const zi = Math.sqrt(Math.max(0, ri * ri - dIn * dIn)), zo = Math.sqrt(ro * ro - dOut * dOut);
    if (zi < 0.03) box(-zo, zo, ya, yb); else { box(-zo, -zi, ya, yb); box(zi, zo, ya, yb); }
  }
  const zt = Math.sqrt(ro * ro - ri * ri); box(-zt, zt, cy + ri, cy + ro);
}
// 洋服だんす：扉が開いていて中に入れる。服はおくの方にかかっていて（服にも当たる）、手前に立つすき間がある
function closet(h, x, z, dir, c, pal, acc) {
  const al = dir[1] !== 0, WD = 2.2, D = 1.15, ht = 2.4, w = al ? WD : D, d = al ? D : WD, bk = -0.19; // bk = 服をおくへずらす量
  shell(h, x, z, w, d, ht, 0.08, c, { r: 0.03, pat: ['grain', c, 0, 1, 2] }, dir, 99, 99);
  for (const s of [-1, 1]) h.B(al ? x + s * WD / 2 : x + dir[0] * (D / 2 + WD / 4), 0.05, al ? z + dir[1] * (D / 2 + WD / 4) : z, al ? 0.06 : WD / 2, ht - 0.1, al ? WD / 2 : 0.06, shade(c, 1.08), { r: 0.02 }); // 開いた扉
  const ox = al ? 0 : dir[0] * bk, oz = al ? dir[1] * bk : 0;
  h.cyl(x + ox, ht - 0.35, z + oz, 0.03, WD - 0.2, '#c9c9c9', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
  for (let t = -WD / 2 + 0.25; t < WD / 2 - 0.15; t += 0.24 + h.rnd() * 0.12) {
    const ch = 1.25 + h.rnd() * 0.45, cc = pick(h, acc.concat(pal));
    h.B(al ? x + t : x + ox, ht - 0.38 - ch, al ? z + oz : z + t, al ? 0.1 : 0.52, ch, al ? 0.52 : 0.1, cc, { r: 0.03, pat: h.rnd() < 0.6 ? rpat(h, pal, acc, 1, 2) : undefined });
    h.B(al ? x + t : x + ox, ht - 0.42, al ? z + oz : z + t, al ? 0.03 : 0.4, 0.06, al ? 0.4 : 0.03, '#c9c9c9', NC); // ハンガー
  }
}
// テント：入口から中に入れる（三角の屋根は見た目、当たり判定は段々の箱）
function tent(h, x, z, alongX, s, c, c2) {
  const L = 2.6, R = 1.35, hw = R * 0.866, H = R * 1.5, ang = Math.atan2(hw, H), Ls = Math.hypot(hw, H), o = { nocol: true, pat: ['vband', c, c2, 4, 1] };
  for (const e of [-1, 1]) {
    if (alongX) h.B(x, (H - Ls) / 2, z + e * hw / 2, L, Ls, 0.05, c, Object.assign({ rot: [-e * ang, 0, 0] }, o)); // かたむけた布（当たり判定は下の段々の箱）
    else h.B(x + e * hw / 2, (H - Ls) / 2, z, 0.05, Ls, L, c, Object.assign({ rot: [0, 0, e * ang] }, o));
  }
  if (alongX) h.cyl(x - s * L / 2, R * 0.5, z, R, 0.06, c, { nocol: true, seg: 3, rot: [-Math.PI / 2, 0, -Math.PI / 2] });
  else h.cyl(x, R * 0.5, z - s * L / 2, R, 0.06, c, { nocol: true, seg: 3, rot: [-Math.PI / 2, 0, 0] });
  h.B(x, 0, z, alongX ? L : hw * 1.9, 0.03, alongX ? hw * 1.9 : L, c2, { nocol: true, flat: true });
  for (const e of [-1, 1]) h.cyl(alongX ? x + e * (L / 2 + 0.3) : x + e * 0.6, 0, alongX ? z + e * 0.6 : z + e * (L / 2 + 0.3), 0.03, 0.25, '#c9c9c9', { seg: 6 }); // ペグ
  const box = (a, b, y0, y1, l0, l1) => { const m = (a + b) / 2, n = (l0 + l1) / 2; h.boxc(alongX ? x + n : x + m, y0, alongX ? z + m : z + n, alongX ? l1 - l0 : b - a, y1 - y0, alongX ? b - a : l1 - l0, { sharp: true }); };
  const hwy = y => hw * (1 - y / H), N = 5;
  for (let k = 0; k < N; k++) {
    const ya = k * H / N, yb = ya + H / N, a = hwy(ya) + 0.04, b = hwy(yb) - 0.04;
    if (k === N - 1) box(-a, a, ya, yb, -L / 2, L / 2); else { box(-a, -b, ya, yb, -L / 2, L / 2); box(b, a, ya, yb, -L / 2, L / 2); }
    box(-a, a, ya, yb, s > 0 ? -L / 2 - 0.04 : L / 2 - 0.04, s > 0 ? -L / 2 + 0.04 : L / 2 + 0.04); // おくの壁
  }
}
// ボールの海・水そうなど：ふちの壁の中に、上から入ると沈む層（沈むのは体の一部だけ）
function pit(h, x, z, w, d, rh, t, c, o, top, sinkV, pat) {
  shell(h, x, z, w, d, rh, t, c, o, null, 0, 0, false);
  h.B(x, 0, z, w - 2 * t, top, d - 2 * t, pat[1], { soft: true, sinkV, pat, sharp: true });
}

/* ---- 隠れ場所になる小物（マップごとの kit から自動でたくさん配置される）。pal = マップの色、acc = アクセント色 ---- */
export const KIT = {
  crate(h, x, z) { // 木箱と段ボールの山
    const s = 0.8 + h.rnd() * 0.5, wood = h.rnd() < 0.5, put = (px, py, pz, k) => (wood ? woodcrate(h, px, py, pz, k, pick(h, ['#b08a5a', '#a07a4a', '#c09a6a'])) : carton(h, px, py, pz, k, k * 0.85, k, pick(h, CARD)));
    put(x, 0, z, s); if (h.rnd() < 0.55) put(x + 0.08, wood ? s : s * 0.85, z - 0.05, s * 0.78); if (h.rnd() < 0.45) put(x + s * 0.98, 0, z + 0.2, s * 0.8);
  },
  barrel(h, x, z, pal) { const n = 1 + Math.floor(h.rnd() * 3), wood = h.rnd() < 0.4; for (let i = 0; i < n; i++) { const px = x + (i % 2) * 0.95, pz = z + (i > 1 ? 0.95 : 0); if (wood) cask(h, px, pz); else drum(h, px, pz, pick(h, pal)); } },
  bush(h, x, z) { // でこぼこのしげみ（かたいので中にはもぐれない）
    const r = 0.7 + h.rnd() * 0.5, c = pick(h, ['#2f7d3a', '#3b8f46', '#2e6b34']);
    h.lump(x, r * 0.7, z, r * 1.1, r * 0.9, r, c, { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, ry: h.rnd() * 6, pat: ['leaf', c, LEAF, 2, 2] });
    if (h.rnd() < 0.6) h.lump(x + r * 0.95, r * 0.5, z + 0.3, r * 0.75, r * 0.65, r * 0.7, '#3b8f46', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3.2, pat: ['leaf', '#3b8f46', LEAF, 2, 2] });
  },
  rock(h, x, z, pal) { // 角ばった岩の集まり（平らな面に体をよせて、岩と同じ色にぬる）
    const n = 1 + Math.floor(h.rnd() * 3), c = pick(h, pal);
    for (let i = 0; i < n; i++) stone(h, x + (h.rnd() - 0.5) * 1.8, z + (h.rnd() - 0.5) * 1.8, 0.7 + h.rnd() * 0.7, i % 2 ? shade(c, 0.9) : c);
  },
  planter(h, x, z, pal) { const c = pick(h, pal); h.B(x, 0, z, 1.3, 0.6, 1.3, c, { r: 0.18, pat: ['noise', c, 0, 1, 1] }); h.B(x, 0.58, z, 1.1, 0.04, 1.1, '#4a3426', NC); h.lump(x, 1.15, z, 0.75, 0.68, 0.75, '#2f7d3a', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] }); },
  pillar(h, x, z, pal) { // 柱（台座・みぞ・柱頭）
    const r = 0.5 + h.rnd() * 0.22, ht = 2.2 + h.rnd() * 1.6, c = pick(h, pal);
    h.B(x, 0, z, r * 2.5, 0.3, r * 2.5, shade(c, 0.88), { r: 0.04 });
    h.cyl(x, 0.3, z, r, ht - 0.55, c, { rt: r * 0.92, seg: 16, pat: ['vband', c, shade(c, 0.86), 4, 1] });
    h.B(x, ht - 0.25, z, r * 2.3, 0.25, r * 2.3, shade(c, 0.9), { r: 0.05 });
  },
  screen(h, x, z, pal, acc) { // ついたて（わく・足つき。半分は模様つき）
    const w = 2 + h.rnd() * 1.6, c = pick(h, pal), ht = 1.5 + h.rnd() * 0.6, o = { r: 0.06, sink: true };
    if (h.rnd() < 0.5) o.pat = rpat(h, pal, acc, Math.round(w / 1.2), 1);
    const one = (cx, cz, al, L) => {
      h.B(cx, 0.1, cz, al ? L : 0.16, ht - 0.1, al ? 0.16 : L, c, o);
      h.B(cx, ht - 0.02, cz, al ? L + 0.08 : 0.22, 0.08, al ? 0.22 : L + 0.08, shade(c, 0.75), { r: 0.02 });
      for (const s of [-1, 1]) h.B(al ? cx + s * (L / 2 - 0.1) : cx, 0, al ? cz : cz + s * (L / 2 - 0.1), al ? 0.12 : 0.5, 0.1, al ? 0.5 : 0.12, '#55606b', { r: 0.02 });
    };
    if (h.rnd() < 0.5) { one(x, z, true, w); if (h.rnd() < 0.5) one(x + w / 2, z + 0.8, false, 1.6); }
    else { one(x, z, false, w); if (h.rnd() < 0.5) one(x + 0.8, z + w / 2, true, 1.6); }
  },
  toy(h, x, z) { const n = 2 + Math.floor(h.rnd() * 4); for (let i = 0; i < n; i++) { const s = 0.5 + h.rnd() * 0.4; brick(h, x + (i % 2) * 0.8, Math.floor(i / 2) * 0.34, z + (i % 3) * 0.15, s, pick(h, TOY)); } },
  shelfK(h, x, z, pal) { const al = h.rnd() < 0.5; bookshelf(h, x, z, al ? 2.2 : 0.7, al ? 0.7 : 2.2, 1.9, pick(h, pal)); },
  sofaK(h, x, z, pal) { if (h.rnd() < 0.5) sofaX(h, x, z, 2.4 + h.rnd(), pick(h, pal), h.rnd() < 0.5 ? 1 : -1); else sofaZ(h, x, z, 2.4 + h.rnd(), pick(h, pal), h.rnd() < 0.5 ? 1 : -1); },
  stool(h, x, z, pal) { for (let i = 0; i < 3; i++) stool(h, x + i * 0.75, z + (i % 2) * 0.5, pick(h, pal)); },
  plantK(h, x, z) { plant(h, x, z); if (h.rnd() < 0.5) plant(h, x + 0.9, z + 0.3); },
  tiresK(h, x, z) { tires(h, x, z, 2 + Math.floor(h.rnd() * 3)); if (h.rnd() < 0.6) tires(h, x + 1.05, z + 0.2, 1 + Math.floor(h.rnd() * 3)); },
  pylonK(h, x, z) { for (let i = 0; i < 3; i++) pylon(h, x + i * 0.6, z + (i % 2) * 0.5); h.B(x + 0.6, 0, z - 0.9, 2, 0.9, 0.3, '#f4f4f4', { r: 0.12, pat: ['diag', '#f4f4f4', '#e0413a', 3, 1] }); },
  vend(h, x, z) { vending(h, x, z, pick(h, ['#e0413a', '#2f6fb0', '#f4f4f4', '#3f9b6a']), h.rnd() < 0.5 ? 1 : -1); if (h.rnd() < 0.5) bin(h, x + 0.95, z, '#55606b'); },
  pot(h, x, z) { // つぼ（回転体。首が細い）
    for (let i = 0; i < 3; i++) {
      const px = x + i * 0.8, pz = z + (i % 2) * 0.6, s = 0.8 + h.rnd() * 0.6, c = pick(h, ['#b5651d', '#a8582a', '#c97b4a']);
      h.lathe(px, 0, pz, [[0.001, 0], [0.22 * s, 0], [0.38 * s, 0.3 * s], [0.4 * s, 0.55 * s], [0.3 * s, 0.85 * s], [0.16 * s, 1.0 * s], [0.2 * s, 1.12 * s], [0.18 * s, 1.14 * s], [0.12 * s, 1.0 * s]], c, { pat: ['hstripe', c, shade(c, 0.78), 1, 3], cols: [[0, 0.75 * s, 0.38 * s, 0.32 * s], [0.75 * s, 1.14 * s, 0.22 * s, 0.18 * s]] });
    }
  },
  crystal(h, x, z) { // 六角の結晶のかたまり
    for (let i = 0; i < 3 + Math.floor(h.rnd() * 3); i++) {
      const r = 0.22 + h.rnd() * 0.3, ht = 0.8 + h.rnd() * 1.8, px = x + (h.rnd() - 0.5) * 1.4, pz = z + (h.rnd() - 0.5) * 1.4, c = pick(h, ['#5a3a8a', '#7b4fb8', '#8a5cff', '#4a2a70']);
      h.cyl(px, 0, pz, r, ht, c, { seg: 6, rough: 0.2, glow: 0.15 }); h.cone(px, ht, pz, r, r * 1.6, shade(c, 1.15), { seg: 6, rough: 0.2, glow: 0.2 });
    }
  },
  neonBox(h, x, z, pal) { const s = 0.9 + h.rnd() * 0.5; h.B(x, 0, z, s, s, s, pick(h, pal), { r: 0.2 }); h.B(x, s, z, s * 0.9, 0.06, s * 0.9, pick(h, ['#ff3ab8', '#33eaff', '#ffd940']), { glow: 1.3 }); if (h.rnd() < 0.5) h.B(x + s, 0, z, s * 0.8, s * 1.4, s * 0.8, pick(h, pal), { r: 0.2 }); },

  /* ---- 色をぬって隠れるための物（模様つき・丸い形） ---- */
  mural(h, x, z, pal, acc) { // 模様の壁（コの字のくぼみに入って隠れる）
    const al = h.rnd() < 0.5, w = 2.6 + h.rnd() * 1.2, ht = 2.1 + h.rnd() * 0.8, t = 0.36, wl = 0.9 + h.rnd() * 0.5, sd = h.rnd() < 0.5 ? 1 : -1;
    const p = rpat(h, pal, acc, Math.max(2, Math.round(w / 1.2)), Math.max(2, Math.round(ht / 1.2)));
    const o = { pat: p, r: 0.16, sink: true }, ow = { pat: [p[0], p[1], p[2], 1, p[4]], r: 0.16, sink: true }; // 模様の壁には体の前の方が少し入る
    if (al) { h.B(x, 0, z, w, ht, t, p[1], o); for (const e of [-1, 1]) h.B(x + e * (w / 2 - t / 2), 0, z + sd * (wl + t) / 2, t, ht, wl, p[1], ow); }
    else { h.B(x, 0, z, t, ht, w, p[1], o); for (const e of [-1, 1]) h.B(x + sd * (wl + t) / 2, 0, z + e * (w / 2 - t / 2), wl, ht, t, p[1], ow); }
  },
  blob(h, x, z, pal, acc) { // まんまるクッション
    const rx = 0.9 + h.rnd() * 0.6, ry = 0.6 + h.rnd() * 0.5, p = rpat(h, pal, acc, 3, 2);
    h.dome(x, 0, z, rx, ry, rx * (0.85 + h.rnd() * 0.3), p[1], { pat: p, solid: true });
    if (h.rnd() < 0.5) { const r2 = rx * 0.6; h.dome(x + rx + r2 * 0.5, 0, z + 0.3, r2, ry * 0.75, r2, p[1], { pat: p, solid: true }); }
  },
  pole(h, x, z, pal, acc) { // しましまの丸い柱
    const r = 0.4 + h.rnd() * 0.25, len = 1.4 + h.rnd() * 1.4, p = rpat(h, pal, acc, 3, Math.max(2, Math.round(len)), ['hstripe', 'diag', 'dots', 'zigzag', 'rainbow', 'wave']);
    h.cap(x, 0, z, r, len, p[1], { pat: p });
    if (h.rnd() < 0.5) h.cap(x + r * 2.4, 0, z + 0.2, r * 0.75, len * 0.6, p[1], { pat: p });
  },
  mush(h, x, z, pal) { // きのこ（かさの下にも上にも隠れられる）
    const s = 0.8 + h.rnd() * 0.6, sh = (1.3 + h.rnd() * 0.4) * s, cr = (1.1 + h.rnd() * 0.4) * s;
    const c = pick(h, ['#e04f4f', '#f08a3c', '#b06fd8', '#4f7fe0', '#d8a7b1', pal[0]]);
    h.cyl(x, 0, z, 0.34 * s, sh, '#efe6d2', { rt: 0.27 * s });
    h.dome(x, sh, z, cr, 0.75 * s, cr, c, { pat: ['dots', c, '#f7f3ea', 4, 1], solid: true, half: true });
    h.ring(x, sh * 0.72, z, 0.3 * s, 0.05 * s, '#f7f3ea'); // つば
  },
  rug(h, x, z, pal, acc) { // 模様のマット（寝そべって隠れる）
    const r = 1.1 + h.rnd() * 0.7; h.cyl(x, 0, z, r, 0.03, '#ffffff', { pat: rpat(h, pal, acc, 2, 2), nocol: true, flat: true, seg: 40 });
    if (h.rnd() < 0.6) KIT.blob(h, x + r * 0.45, z - r * 0.35, pal, acc);
  },
  arch(h, x, z, pal, acc) { // にじのアーチ（くぐれる・登れる）
    const R = 1.5 + h.rnd() * 0.5; h.arch(x, z, R, 0.3, h.rnd() < 0.5 ? 0 : Math.PI / 2, ['rainbow', '#ffffff', acc, 1, 1]);
  },
  cubes(h, x, z, pal, acc) { // 模様のキューブ
    const n = 2 + Math.floor(h.rnd() * 3), hs = [];
    for (let i = 0; i < n; i++) {
      const s = 0.75 + h.rnd() * 0.45, p = rpat(h, pal, acc, 1, 1);
      if (i === 3) h.B(x, hs[0], z, s * 0.85, s * 0.85, s * 0.85, p[1], { pat: p, r: 0.2 });
      else { h.B(x + (i % 2) * 1.0, 0, z + (i === 2 ? 1.0 : 0), s, s, s, p[1], { pat: p, r: 0.2 }); hs.push(s); }
    }
  },
  flowers(h, x, z) { // 花のおか
    const rx = 1.2 + h.rnd() * 0.6;
    h.dome(x, 0, z, rx, 0.55 + h.rnd() * 0.3, rx * 0.8, '#4f9a45', { pat: ['confetti', '#4f9a45', ['#ff6fa8', '#ffd940', '#ffffff', '#b06fd8', '#ff8a3c'], 2, 2], solid: true });
  },

  /* ---- カメレオンのように「同じ色・模様の場所にはりついて」隠れるための物 ---- */
  // くぼみのある模様の壁：くぼみ（体が入る深さ）に入って、くぼみのおくと同じ色に塗る。高い所のくぼみには登って入る
  nook(h, x, z, pal, acc, f = {}) {
    const al = f.al != null ? f.al : h.rnd() < 0.5, sd = f.sd || (h.rnd() < 0.5 ? 1 : -1);
    const L = f.L || 3.8 + h.rnd() * 1.4, ht = 2.6 + h.rnd() * 0.7, T = 0.75, nd = 0.42, bt = 0.08;
    const p = rpat(h, pal, acc, 1, 1, ['bigcamo', 'hstripe', 'vband', 'check2', 'dots', 'splat', 'brick', 'zigzag', 'camo']);
    const inC = Array.isArray(p[2]) ? p[2][0] : p[2];
    const B = (a0, a1, y0, y1, b0, b1, pat) => { // a = 長さの向き、b = 厚みの向き（＋がくぼみのある面）
      if (a1 - a0 < 0.02 || y1 - y0 < 0.02) return;
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2 * sd, pp = [pat[0], pat[1], pat[2], Math.max(1, Math.round((a1 - a0) / 1.1)), Math.max(1, Math.round((y1 - y0) / 1.1))];
      h.B(al ? x + ca : x + cb, y0, al ? z + cb : z + ca, al ? a1 - a0 : b1 - b0, y1 - y0, al ? b1 - b0 : a1 - a0, pat[1], { pat: pp, r: 0.03, sink: true });
    };
    const nN = L > 4.4 ? 2 : 1 + (h.rnd() < 0.5 ? 1 : 0), N = [];
    for (let i = 0; i < nN; i++) N.push({ c: -L / 2 + L * (i + 0.5) / nN + (h.rnd() - 0.5) * 0.3, w: 0.95 + h.rnd() * 0.3, hh: 1.3 + h.rnd() * 0.3, y: i % 2 && ht > 2.8 ? 1.0 : 0 });
    const inner = ['noise', inC, 0, 1, 1];
    let a = -L / 2;
    for (const n of N) {
      const a0 = n.c - n.w / 2, a1 = n.c + n.w / 2;
      B(a, a0, 0, ht, -T / 2 + bt, T / 2, p); // くぼみのあいだの壁
      B(a0, a1, 0, n.y, -T / 2 + bt, T / 2, p); // くぼみの下
      B(a0, a1, n.y + n.hh, ht, -T / 2 + bt, T / 2, p); // くぼみの上
      B(a0, a1, n.y, n.y + n.hh, -T / 2 + bt, T / 2 - nd, inner); // くぼみのおく（無地なので体を同じ色に塗りやすい）
      a = a1;
    }
    B(a, L / 2, 0, ht, -T / 2 + bt, T / 2, p);
    B(-L / 2, L / 2, 0, ht, -T / 2, -T / 2 + bt, p); // うしろの面
    h.B(x, ht, z, al ? L + 0.16 : T + 0.12, 0.14, al ? T + 0.12 : L + 0.16, shade(p[1], 0.8), { r: 0.04 }); // 上のふち
  },
  // もようの大きなブロックの山：ブロックのあいだのすき間・のせたブロックの下のトンネルに入って、同じ模様に塗る
  blocks(h, x, z, pal, acc) {
    const s = 1.3 + h.rnd() * 0.4, g = 0.55, off = s / 2 + g / 2, skip = Math.floor(h.rnd() * 6), ks = ['bigcamo', 'check2', 'dots', 'hstripe', 'vband', 'zigzag', 'splat', 'diag', 'brick'];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c, i) => { if (i === skip) return; const p = rpat(h, pal, acc, 1, 1, ks); h.B(x + c[0] * off, 0, z + c[1] * off, s, s * 0.9, s, p[1], { pat: p, r: 0.06, sink: true }); });
    const br = [[0, 1, true, -1], [2, 3, true, 1], [0, 2, false, -1], [1, 3, false, 1]].filter(b => b[0] !== skip && b[1] !== skip), b = pick(h, br), p = rpat(h, pal, acc, 2, 1, ks);
    if (b[2]) h.B(x, s * 0.9, z + b[3] * off, 2 * s + g, s * 0.7, s * 0.85, p[1], { pat: p, r: 0.06, sink: true }); // 上にのった横長のブロック（下にトンネル）
    else h.B(x + b[3] * off, s * 0.9, z, s * 0.85, s * 0.7, 2 * s + g, p[1], { pat: p, r: 0.06, sink: true });
  },
  // 地層の岩：色の帯がかさなる大きな岩。下の層が小さく、上の層が「ひさし」になって、その下に立って隠れられる
  outcrop(h, x, z, pal, acc, k = 1) {
    const c0 = pick(h, pal), c1 = pick(h, pal), band = [c0, shade(c1, 0.9), shade(c0, 1.12), c1, shade(c0, 0.84)];
    const a = h.rnd() * 6.28, ux = Math.cos(a), uz = Math.sin(a), R = (2.3 + h.rnd() * 0.8) * k, el = 0.72 + h.rnd() * 0.22;
    let y = 0, i = 0;
    const layer = (cx, cz, r, t) => { const c = band[i++ % band.length]; h.slab(cx, y, cz, rockPts(h, r, r * el, 9, 0.1, a), t, c, { top: 0.95, bev: 0.07, pat: ['strata', c, [shade(c, 0.88), shade(c, 1.1)], 0.45, Math.round(4 / t) / 4] }); y += t; };
    layer(x - ux * R * 0.36, z - uz * R * 0.36, R * 0.6, (1.15 + h.rnd() * 0.3) * Math.max(1, k)); // 下の層（小さく、うしろ寄り）
    layer(x, z, R, 0.5 + h.rnd() * 0.25); // ひさしになる層
    const n = 1 + Math.floor(h.rnd() * 3);
    for (let j = 0; j < n; j++) { const kk = 0.8 - j * 0.17, w = (h.rnd() - 0.5) * R * 0.3; layer(x - ux * R * 0.13 * (j + 1) + uz * w, z - uz * R * 0.13 * (j + 1) - ux * w, R * kk, 0.45 + h.rnd() * 0.35); }
  },
  // 岩のすき間：2つの大きな岩のあいだにもぐって、岩肌と同じ色に塗る（上に石がはさまっていることも）
  crevice(h, x, z, pal) {
    const al = h.rnd() < 0.5, c = pick(h, pal), g = 0.74 + h.rnd() * 0.2; let lo = 99;
    for (const s of [-1, 1]) {
      const w = 1.1 + h.rnd() * 0.45, L = 2.4 + h.rnd() * 1.1, ht = 2.3 + h.rnd() * 1.2, cc = s < 0 ? c : shade(c, 0.88);
      h.slab(x + (al ? 0 : s * (g / 2 + w)), 0, z + (al ? s * (g / 2 + w) : 0), rockPts(h, al ? L / 2 : w, al ? w : L / 2, 10, 0.07, 0), ht, cc, { top: 0.92, bev: 0.14, pat: ['rockface', cc, [shade(cc, 0.88), shade(cc, 1.12)], 0.42, 0.42] });
      lo = Math.min(lo, ht);
    }
    if (h.rnd() < 0.55) h.slab(x, lo - 0.05, z, rockPts(h, g / 2 + 0.7, g / 2 + 0.7, 7, 0.12, h.rnd() * 3), 0.55, shade(c, 1.06), { top: 0.8, bev: 0.12, pat: ['rockface', c, [shade(c, 0.9), shade(c, 1.1)], 0.42, 0.42] });
  },
  stoneK(h, x, z, pal) { KIT.rock(h, x, z, pal); },
  // らくがきの壁・ペンキ缶・はしご：しぶきの色を体に塗って壁にはりつく
  graffiti(h, x, z, pal, acc) {
    const al = h.rnd() < 0.5, L = 4 + h.rnd() * 1.5, ht = 2.4 + h.rnd() * 0.6, base = pick(h, ['#f4f4f4', '#2a3038', pal[0], '#d9d2c4']), sd = h.rnd() < 0.5 ? 1 : -1;
    const p = ['graffiti', base, acc, Math.max(2, Math.round(L / 1.6)), Math.max(1, Math.round(ht / 1.6))];
    h.B(x, 0, z, al ? L : 0.3, ht, al ? 0.3 : L, base, { pat: p, r: 0.05, sink: true });
    const wl = 1.4 + h.rnd() * 0.8, e = h.rnd() < 0.5 ? 1 : -1; // 角になる短い壁
    h.B(al ? x + e * (L / 2 - 0.15) : x + sd * (wl / 2 + 0.15), 0, al ? z + sd * (wl / 2 + 0.15) : z + e * (L / 2 - 0.15), al ? 0.3 : wl, ht * 0.85, al ? wl : 0.3, base, { pat: ['graffiti', base, acc, 1, 1], r: 0.05, sink: true });
    for (let i = 0; i < 3 + Math.floor(h.rnd() * 3); i++) { // ペンキ缶
      const c = pick(h, acc), t = (h.rnd() - 0.5) * (L - 1.2), px = al ? x + t : x + sd * (0.4 + h.rnd() * 0.3), pz = al ? z + sd * (0.4 + h.rnd() * 0.3) : z + t;
      h.lathe(px, 0, pz, [[0.001, 0], [0.16, 0], [0.16, 0.26], [0.145, 0.27], [0.001, 0.27]], c, { seg: 14 }); h.B(px, 0.27, pz, 0.3, 0.012, 0.3, c, { nocol: true, flat: true }); // こぼれたペンキ
    }
    const hl = ht * 0.9, t = (h.rnd() - 0.5) * (L - 1.5); // はしご（かたむけて立てかける）
    for (const s of [-1, 1]) h.B(al ? x + t + s * 0.22 : x + sd * 0.35, 0, al ? z + sd * 0.35 : z + t + s * 0.22, 0.06, hl, 0.06, '#c9c9c9', { rot: al ? [sd * 0.18, 0, 0] : [0, 0, -sd * 0.18] });
  },
  // しましまの階段：階段の下にすき間（もぐれる）・上の踊り場のうしろに模様の壁
  stairs(h, x, z, pal, acc) {
    const dir = pick(h, DIRS), n = 4 + Math.floor(h.rnd() * 2), rise = 0.42, run = 0.55, W = 1.6, side = h.rnd() < 0.5 ? 1 : -1;
    const p = rpat(h, pal, acc, 2, 1, ['hstripe', 'vband', 'check2', 'zigzag', 'dots', 'bigcamo']);
    const at = (a, b) => (dir[0] ? [x + dir[0] * a, z + b] : [x + b, z + dir[1] * a]); // a = のぼる向き, b = 横
    const B = (a, b, y, la, ht, lb, o) => { const [px, pz] = at(a, b); h.B(px, y, pz, dir[0] ? la : lb, ht, dir[0] ? lb : la, o.pat ? o.pat[1] : p[1], o); };
    const a0 = -(n * run) / 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k + 0.5) * run, y = (k + 1) * rise;
      B(a, 0, y - 0.14, run + 0.02, 0.14, W, { pat: [p[0], p[1], p[2], 2, 1], r: 0.02 }); // ふみ板
      B(a, side * (W / 2 + 0.1), 0, run, y, 0.2, { pat: [p[0], p[1], p[2], 1, Math.max(1, k)], r: 0.02 }); // 横の壁（ささえ）
    }
    const ty = n * rise, la = a0 + n * run + 0.6;
    B(la, 0, 0, 1.2, ty, W + 0.4, { pat: [p[0], p[1], p[2], 1, 2], r: 0.03, sink: true }); // 踊り場
    B(la + 0.7, 0, ty, 0.25, 2.0, W + 0.4, { pat: [p[0], p[1], p[2], 2, 2], r: 0.03, sink: true }); // 踊り場のうしろの壁
  },
  // 床の大きなもよう＋同じもようのクッション：寝そべって床と同じもようを塗る
  patch(h, x, z, pal, acc) {
    const w = 3 + h.rnd() * 1.4, d = 2.6 + h.rnd() * 1.2, p = rpat(h, pal, acc, Math.max(1, Math.round(w / 1.4)), Math.max(1, Math.round(d / 1.4)), ['bigcamo', 'check2', 'dots', 'zigzag', 'splat', 'confetti', 'wave', 'hstripe']);
    h.B(x, 0, z, w, 0.04, d, p[1], { pat: p, flat: true, nocol: true });
    for (let i = 0; i < 2 + Math.floor(h.rnd() * 2); i++) h.B(x + (h.rnd() - 0.5) * (w - 1), 0, z + (h.rnd() - 0.5) * (d - 1), 0.8 + h.rnd() * 0.4, 0.35 + h.rnd() * 0.3, 0.8 + h.rnd() * 0.4, p[1], { pat: [p[0], p[1], p[2], 1, 1], r: 0.16 });
  },

  /* ---- 形がばらばら・でこぼこの物（すぐにバレないように） ---- */
  junk(h, x, z, pal, acc) { // がらくたの山：かたむいた箱・タイヤ・ボール・横だおしのたる（ひとつずつ見た目どおりに当たる）
    const cs = pal.concat(acc);
    for (let i = 0; i < 10; i++) {
      const a = h.rnd() * 6.28, d = Math.sqrt(h.rnd()) * 1.15, s = 0.35 + h.rnd() * 0.45, y = i > 5 ? 0.4 + h.rnd() * 0.3 : 0, c = pick(h, cs), px = x + Math.cos(a) * d * (i > 5 ? 0.5 : 1), pz = z + Math.sin(a) * d * (i > 5 ? 0.5 : 1), k = h.rnd();
      if (k < 0.5) h.B(px, y, pz, s, s * (0.6 + h.rnd() * 0.6), s * (0.7 + h.rnd() * 0.5), c, { r: 0.06, rot: [h.rnd() * 0.5 - 0.25, h.rnd() * 3.14, h.rnd() * 0.5 - 0.25], pat: h.rnd() < 0.45 ? rpat(h, pal, acc, 1, 1) : undefined });
      else if (k < 0.68) h.ball(px, y + s * 0.5, pz, s * 0.5, c, h.rnd() < 0.5 ? { pat: rpat(h, pal, acc, 2, 1, ['hstripe', 'dots', 'check2']) } : undefined);
      else if (k < 0.84) h.tire(px, y, pz, s * 0.9);
      else h.cyl(px, y + s * 0.45, pz, s * 0.42, s * 1.3, c, { rot: [Math.PI / 2, 0, 0], pat: ['hstripe', c, shade(c, 0.8), 1, 3] });
    }
  },
  bags(h, x, z, pal) { // ふくろの山（ぽってりした、でこぼこの形。ひとつずつ当たる）
    const cs = ['#c8a36a', '#b08a5a', '#d9c49a', '#8a7a5a', '#e8e1d2'].concat(pal), n = 5 + Math.floor(h.rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = h.rnd() * 6.28, d = h.rnd() * 0.9, s = 0.45 + h.rnd() * 0.25, top = i > 3, c = pick(h, cs);
      h.lump(x + Math.cos(a) * d * (top ? 0.5 : 1), top ? 0.62 + s * 0.45 : s * 0.55, z + Math.sin(a) * d * (top ? 0.5 : 1), s * 1.15, s * 0.6, s * 0.85, c, { seed: seed8(h), bump: 0.2, freq: 1.5, ry: h.rnd() * 3.14, core: 0.92, pat: [pick(h, ['noise', 'noise', 'hstripe', 'camo']), c, [shade(c, 0.85), shade(c, 1.12)], 2, 2] });
    }
  },
  sculpt(h, x, z, pal, acc) { // 変な形のオブジェ（ねじれた輪・でこぼこの石を積んだもの）
    const c = pick(h, acc);
    h.B(x, 0, z, 1.9, 0.6, 1.9, pick(h, ['#d9d2c4', '#b9c0c7', '#8d8f94']), { r: 0.25 });
    if (h.rnd() < 0.55) { const R = 0.85 + h.rnd() * 0.35; h.knot(x, 0.6 + R * 1.55 + 0.26, z, R, 0.26, 2, 3, h.rnd() * 3.14, c, { pat: [pick(h, ['rainbow', 'hstripe', 'dots', 'zigzag']), c, acc, 8, 1] }); }
    else { let y = 0.6; for (let i = 0; i < 4; i++) { const s = 0.75 - i * 0.12; h.lump(x + (h.rnd() - 0.5) * 0.35, y + s * 0.8, z + (h.rnd() - 0.5) * 0.35, s, s * 0.85, s, pick(h, acc), { seed: seed8(h), bump: 0.22, freq: 2.6, ry: h.rnd() * 6, pat: rpat(h, pal, acc, 2, 2) }); y += s * 1.45; } }
  },
  coral(h, x, z, pal, acc) { // 枝分かれしたくねくねの形（サンゴ・サボテン・ねじれた木）
    const c = pick(h, pal.concat(acc)), pat = h.rnd() < 0.6 ? rpat(h, pal, acc, 2, 3, ['hstripe', 'dots', 'zigzag', 'camo', 'wave']) : undefined;
    const th = 1.6 + h.rnd() * 1.2, r = 0.3 + h.rnd() * 0.12, nb = 3 + Math.floor(h.rnd() * 3);
    h.cap(x, 0, z, r, th, c, { pat });
    for (let i = 0; i < nb; i++) {
      const a = i / nb * 6.28 + h.rnd() * 0.9, tilt = 0.7 + h.rnd() * 0.6, len = 1.0 + h.rnd() * 1.0, y0 = th * (0.3 + h.rnd() * 0.55), br = r * (0.6 + h.rnd() * 0.25);
      const dx = Math.cos(a) * Math.sin(tilt), dy = Math.cos(tilt), dz = Math.sin(a) * Math.sin(tilt);
      h.capc(x + dx * len / 2, y0 + dy * len / 2, z + dz * len / 2, br, len, dx, dy, dz, c, { pat });
      h.ball(x + dx * len, y0 + dy * len, z + dz * len, br * 1.3, c, { pat });
    }
  },
  goods(h, x, z, pal, acc) { // 商品がぎっしり並んだ棚（こまかい色の中にまぎれる。棚ぜんたいが当たる）
    const al = h.rnd() < 0.5, L = 2.4 + Math.floor(h.rnd() * 3) * 0.5, D = 0.7, w = al ? L : D, d = al ? D : L, c = pick(h, pal), cs = acc.concat(TOY, ['#f4f4f4', '#2a3038']);
    for (const s of [-1, 1]) h.B(x + (al ? s * (L / 2 - 0.04) : 0), 0, z + (al ? 0 : s * (L / 2 - 0.04)), al ? 0.08 : D, 1.95, al ? D : 0.08, c, { nocol: true, r: 0.02 });
    for (let lv = 0; lv < 4; lv++) {
      const y = 0.08 + lv * 0.47; h.B(x, y, z, w, 0.05, d, shade(c, 1.1), { nocol: true, sharp: true });
      h.B(al ? x : x + 0.36, y + 0.02, al ? z + 0.36 : z, al ? w - 0.1 : 0.02, 0.06, al ? 0.02 : d - 0.1, '#f4f4f4', NC); // ねだんのふだ
      for (let t = -L / 2 + 0.14; t < L / 2 - 0.16;) {
        const iw = 0.12 + Math.floor(h.rnd() * 4) * 0.05, ih = 0.15 + Math.floor(h.rnd() * 4) * 0.06, ic = pick(h, cs), px = al ? x + t + iw / 2 : x, pz = al ? z : z + t + iw / 2;
        if (h.rnd() < 0.62) h.B(px, y + 0.05, pz, al ? iw : 0.32, ih, al ? 0.32 : iw, ic, { nocol: true, r: 0.02 });
        else h.cyl(px, y + 0.05, pz, iw * 0.45, ih * 1.25, ic, { nocol: true, seg: 10 });
        t += iw + 0.03;
      }
    }
    h.boxc(x, 0, z, w, 1.95, d);
  },
  laundry(h, x, z, pal, acc) { // 洗たく物（ひらひらの布のうしろに隠れる。布にも当たる）
    const al = h.rnd() < 0.5, L = 3 + h.rnd() * 1.5;
    for (const s of [-1, 1]) { h.cyl(x + (al ? s * L / 2 : 0), 0, z + (al ? 0 : s * L / 2), 0.07, 2.1, '#8d8f94'); h.B(x + (al ? s * L / 2 : 0), 0, z + (al ? 0 : s * L / 2), 0.5, 0.06, 0.5, '#8d8f94'); }
    h.B(x, 2.0, z, al ? L : 0.03, 0.03, al ? 0.03 : L, '#f4f4f4', { nocol: true, sharp: true });
    for (let t = -L / 2 + 0.4; t < L / 2 - 0.3; t += 0.55 + h.rnd() * 0.3) {
      const cw = 0.4 + h.rnd() * 0.35, ch = 0.6 + h.rnd() * 0.6, c = pick(h, acc.concat(pal));
      h.B(x + (al ? t : 0), 2.0 - ch, z + (al ? 0 : t), al ? cw : 0.04, ch, al ? 0.04 : cw, c, { r: 0.01, pat: h.rnd() < 0.6 ? rpat(h, pal, acc, 1, 1) : undefined, rot: al ? [0, 0, (h.rnd() - 0.5) * 0.14] : [(h.rnd() - 0.5) * 0.14, 0, 0] });
      for (const s of [-1, 1]) h.B(x + (al ? t + s * cw * 0.35 : 0), 1.98, z + (al ? 0 : t + s * cw * 0.35), 0.03, 0.07, 0.03, '#ffd940', NC); // せんたくばさみ
    }
  },
  logs(h, x, z) { // 丸太の山（1本ずつ見た目どおりに当たる）
    const al = h.rnd() < 0.5, L = 2 + h.rnd(), r = 0.22;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
      const o = (i - (2 - row) / 2) * r * 2.05, c = pick(h, ['#8a5a33', '#7a4c2a', '#9b6b43']), px = x + (al ? 0 : o), py = r + row * r * 1.75, pz = z + (al ? o : 0);
      h.cyl(px, py, pz, r, L, c, { rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], pat: ['bark', c, 0, 2, 1] });
      for (const s of [-1, 1]) h.cyl(al ? px + s * (L / 2 + 0.005) : px, py, al ? pz : pz + s * (L / 2 + 0.005), r * 0.92, 0.012, '#d9b48a', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], pat: ['wave', '#d9b48a', '#b08a5a', 1, 2] }); // 切り口（年輪）
    }
  },
  parasol(h, x, z, pal, acc) { // パラソルの席（ポール・かさにも当たる）
    const c = pick(h, acc);
    h.cyl(x, 0, z, 0.05, 2.3, '#d9d2c4'); h.cone(x, 2.0, z, 1.6, 0.6, c, { seg: 12, pat: ['vband', c, '#f4f4f4', 6, 1] });
    h.cyl(x, 0, z, 0.25, 0.05, '#8d8f94');
    h.cyl(x, 0.7, z, 0.6, 0.05, '#f4f4f4'); h.cyl(x, 0, z, 0.06, 0.7, '#d9d2c4', { seg: 8 }); // テーブル
    for (const s of [-1, 1]) stool(h, x + s * 1.05, z + s * 0.3, pick(h, pal));
  },
  hedge(h, x, z) { // でこぼこの生け垣（かたいので中にはもぐれない）
    const al = h.rnd() < 0.5, n = 3 + Math.floor(h.rnd() * 3);
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.95, sz = 0.6 + h.rnd() * 0.25; h.lump(x + (al ? o : 0), sz * 0.9, z + (al ? 0 : o), sz, sz * 1.05, sz, '#2f7d3a', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3.2, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] }); }
  },

  /* ---- 中に入れる物・少し沈める物 ---- */
  gallery(h, x, z, pal) { // 絵がかかった壁（絵に体の前の方を入れて隠れる）
    const al = h.rnd() < 0.5, L = 4.4, ht = 3, t = 0.3, c = pick(h, ['#f4f1e8', '#e8dcc8', '#d9dde0', pal[0]]);
    h.B(x, 0, z, al ? L : t, ht, al ? t : L, c, { r: 0.06 });
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) h.B(al ? x + (k - 0.5) * (L - 0.3) : x, 0, al ? z : z + (k - 0.5) * (L - 0.3), al ? 0.3 : t + 0.2, 0.2, al ? t + 0.2 : 0.3, shade(c, 0.8), { r: 0.02 }); // 足
    for (const s of [-1, 1]) {
      const n = h.rnd() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) { const o = n === 1 ? 0 : (i - 0.5) * 2.1, pw = n === 1 ? 3 : 1.7, ph = n === 1 ? 2.3 : 2.0; pic(h, al ? x + o : x + s * t / 2, 0.3, al ? z + s * t / 2 : z + o, al ? 0 : s, al ? s : 0, pw, ph); }
    }
  },
  hut(h, x, z, pal, acc) { // 小屋（入口から中に入れる・屋根にも登れる）
    const w = 2.3 + h.rnd() * 0.5, d = 2.1 + h.rnd() * 0.4, ht = 1.9, c = pick(h, pal), o = { r: 0.04, pat: h.rnd() < 0.5 ? rpat(h, pal, acc, 2, 2) : ['vstripe', c, shade(c, 0.88), 3, 2] }, dir = pick(h, DIRS);
    shell(h, x, z, w, d, ht, 0.12, c, o, dir, 1.0, 1.45);
    h.cone(x, ht + 0.12, z, (Math.max(w, d) / 2 + 0.25) / 0.707, 1.0, pick(h, acc), { seg: 4, pat: ['hstripe', '#ffffff', 0, 1, 6] });
    const al = dir[1] !== 0; h.B(al ? x + 0.65 : x + dir[0] * (w / 2 + 0.01), 0.9, al ? z + dir[1] * (d / 2 + 0.01) : z + 0.65, al ? 0.6 : 0.02, 0.5, al ? 0.02 : 0.6, '#9fd0e8', { nocol: true, rough: 0.15 }); // 窓
  },
  bigbox(h, x, z) { // 横だおしの大きな段ボール（一面が開いていて中に入れる）
    const w = 1.6 + h.rnd() * 0.4, d = 1.5 + h.rnd() * 0.3, ht = 1.3 + h.rnd() * 0.3, dir = pick(h, DIRS), c = pick(h, CARD), o = { r: 0.03, pat: ['carton', c, 0, 1, 1] };
    shell(h, x, z, w, d, ht, 0.06, c, o, dir, 99, 99);
    if (dir[1]) h.B(x, ht - 0.3, z + dir[1] * (d / 2 + 0.26), w - 0.04, 0.03, 0.55, c, { rot: [dir[1] * 0.55, 0, 0] }); // 開いたふた（当たる）
    else h.B(x + dir[0] * (w / 2 + 0.26), ht - 0.3, z, 0.55, 0.03, d - 0.04, c, { rot: [0, 0, -dir[0] * 0.55] });
  },
  pipe(h, x, z, pal, acc) { // 土管（中を通りぬけられる・上にも乗れる）
    const c = pick(h, ['#b9c0c7', '#a8afb6', '#c9c1b0']);
    tube(h, x, z, 0.97, 0.85, 2.8 + h.rnd() * 0.8, h.rnd() < 0.5, c, { pat: h.rnd() < 0.5 ? ['noise', c, 0, 3, 2] : rpat(h, pal, acc, 3, 2) });
  },
  hlog(h, x, z) { // 中がからっぽの丸太（もぐりこめる）
    const c = pick(h, ['#8a5a33', '#7a4c2a']);
    tube(h, x, z, 0.84, 0.7, 2.6 + h.rnd() * 0.6, h.rnd() < 0.5, c, { pat: ['bark', c, 0, 4, 1] });
  },
  closet(h, x, z, pal, acc) { closet(h, x, z, pick(h, DIRS), pick(h, ['#8a5a33', '#6b4a2b', '#c9a26b', '#f3f1ec', pal[0]]), pal, acc); },
  tent(h, x, z, pal, acc) { const c = pick(h, acc); let c2 = pick(h, acc); if (c2 === c) c2 = '#f4f4f4'; tent(h, x, z, h.rnd() < 0.5, h.rnd() < 0.5 ? 1 : -1, c, c2); },
  ballpit(h, x, z, pal, acc) { // ボールプール（上から飛びこむと体の下の方がしずむ）
    const w = 3 + h.rnd() * 0.8, d = 2.4 + h.rnd() * 0.6, c = pick(h, acc);
    pit(h, x, z, w, d, 0.5, 0.22, c, { r: 0.08, pat: ['vband', c, '#f4f4f4', 6, 1] }, 0.62, 0.44, ['dots', pick(h, TOY), TOY, 4, 3]);
    for (let i = 0; i < 12; i++) h.ball(x + (h.rnd() - 0.5) * (w - 0.8), 0.64, z + (h.rnd() - 0.5) * (d - 0.8), 0.14, pick(h, TOY), NC); // ボールの海の表面の飾り
  },
  grass(h, x, z) { // 背の高い草のかたまり（かたいので中にはもぐれない。上に乗ると少し沈む）
    const n = 4 + Math.floor(h.rnd() * 3), c = pick(h, ['#5f9a3a', '#6fae4a', '#4f8a32']);
    for (let i = 0; i < n; i++) {
      const a = h.rnd() * 6.28, d = Math.sqrt(h.rnd()) * 1.0, s = 0.6 + h.rnd() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      h.lump(px, s * 0.6, pz, s * 0.85, s * 1.1, s * 0.85, c, { core: 0.9, seed: seed8(h), bump: 0.24, freq: 4.5, pat: ['leaf', c, ['#7fc24f', '#3f7a2a', '#a8c94f'], 2, 3] });
      for (let k = 0; k < 3; k++) { const b = h.rnd() * 6.28; h.cone(px + Math.cos(b) * s * 0.5, s * 0.9, pz + Math.sin(b) * s * 0.5, 0.05, 0.6 + h.rnd() * 0.4, '#7fc24f', { nocol: true, seg: 4 }); } // 穂先（細いので体はかくれない）
    }
  },
  leafpile(h, x, z) { // 落ち葉の山（上に乗ると少しだけ沈む）
    const r = 1.1 + h.rnd() * 0.4, c = pick(h, ['#d98a2b', '#c9573f', '#e0b040', '#a8692b']);
    h.lump(x, 0, z, r, r * 0.7, r * 0.9, c, { core: 0.9, half: true, seed: seed8(h), bump: 0.18, freq: 3, pat: ['confetti', c, ['#e0b040', '#b8452f', '#8a5a33', '#f0d040'], 2, 2] });
  },
  dumpster(h, x, z) { // 大きなゴミ箱（上から飛びこんで中に隠れる）
    const al = h.rnd() < 0.5, w = al ? 2.3 : 1.5, d = al ? 1.5 : 2.3, ht = 1.25, c = pick(h, ['#2f6f4a', '#2f6fb0', '#55606b', '#b8452f']);
    pit(h, x, z, w, d, ht, 0.08, c, { r: 0.03, pat: ['vband', c, shade(c, 0.85), 4, 1] }, 0.55, 0.3, ['camo', '#3a3d44', ['#55606b', '#2a2d33', '#8a7a5a'], 2, 2]);
    if (al) h.B(x, ht - 0.02, z - d / 2 - 0.12, w, 0.9, 0.05, shade(c, 0.85), { rot: [-0.25, 0, 0] }); // 開いたふた（当たる）
    else h.B(x - w / 2 - 0.12, ht - 0.02, z, 0.05, 0.9, d, shade(c, 0.85), { rot: [0, 0, 0.25] });
    for (const s of [-1, 1]) for (const t of [-1, 1]) h.wheel(x + s * (w / 2 - 0.2), 0.08, z + t * (d / 2 - 0.2), 0.08, 0.06, al ? 'z' : 'x', NC);
  },
  booth(h, x, z, pal, acc) { // 電話ボックス・写真ブース（半分しめたカーテンのうしろに隠れる。カーテンにも当たる）
    const dir = pick(h, DIRS), w = 1.5, d = 1.5, ht = 2.3, c = pick(h, acc), cc = pick(h, acc.concat(pal)), al = dir[0] === 0;
    shell(h, x, z, w, d, ht, 0.1, c, { r: 0.04, pat: rpat(h, pal, acc, 1, 2) }, dir, 99, 99);
    const cw = (w - 0.2) / 2, sh = h.rnd() < 0.5 ? 1 : -1;
    h.B(x + dir[0] * (w / 2 - 0.06) + (al ? sh * cw / 2 : 0), 0.35, z + dir[1] * (d / 2 - 0.06) + (al ? 0 : sh * cw / 2), al ? cw : 0.05, ht - 0.45, al ? 0.05 : cw, cc, { r: 0.02, pat: [pick(h, ['vband', 'dots', 'hstripe']), cc, '#f4f4f4', 2, 2] });
    h.B(x + dir[0] * (w / 2 - 0.06), ht - 0.12, z + dir[1] * (d / 2 - 0.06), al ? w - 0.2 : 0.03, 0.03, al ? 0.03 : d - 0.2, '#c9c9c9', NC); // カーテンレール
    h.B(x - dir[0] * 0.5, 0, z - dir[1] * 0.5, al ? 0.5 : 0.4, 0.5, al ? 0.4 : 0.5, '#55606b', { r: 0.1 }); // 中のいす
    h.B(x, ht + 0.1, z, w + 0.1, 0.35, d + 0.1, pick(h, acc), { glow: 0.8, r: 0.05 });
  }
};
/* ---- 向きのある物を置く道具：a = 正面（dir）の向きの長さ、b = 横 ---- */
function frame(h, x, z, dir) {
  const ax = dir[0], az = dir[1];
  const at = (a, b) => [x + ax * a - az * b, z + az * a + ax * b];
  const B = (a, b, y, la, ht, lb, col, o) => { const [px, pz] = at(a, b); h.B(px, y, pz, ax ? la : lb, ht, ax ? lb : la, col, o); };
  const tilt = ang => (ax ? [0, 0, -ax * ang] : [az * ang, 0, 0]); // +a のはしが下がるようにかたむける
  return { at, B, tilt, ax, az };
}
// 2点をむすぶ細い棒（当たり判定は棒にそって並べた球）
function rod(h, p, q, r, c, o) { const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], l = Math.hypot(dx, dy, dz); h.capc((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, r, Math.max(0.01, l - 2 * r), dx, dy, dz, c, o); }
// くまのぬいぐるみ（体・頭・耳・うで・あし・口もと）
function bear(h, x, y, z, s, c, yaw) {
  const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -fz, rz = fx, lc = shade(c, 1.22), fab = ['fabric', c, 0, 2, 2];
  h.ball(x, y + 0.42 * s, z, 0.42 * s, c, { pat: fab });
  h.ball(x + fx * 0.05 * s, y + 1.0 * s, z + fz * 0.05 * s, 0.32 * s, c, { pat: fab });
  for (const t of [-1, 1]) {
    h.ball(x + rx * t * 0.24 * s, y + 1.27 * s, z + rz * t * 0.24 * s, 0.11 * s, c);
    h.ball(x + rx * t * 0.38 * s + fx * 0.12 * s, y + 0.55 * s, z + rz * t * 0.38 * s + fz * 0.12 * s, 0.14 * s, c);
    h.ball(x + rx * t * 0.22 * s + fx * 0.32 * s, y + 0.15 * s, z + rz * t * 0.22 * s + fz * 0.32 * s, 0.16 * s, c);
    h.ball(x + rx * t * 0.11 * s + fx * 0.28 * s, y + 1.08 * s, z + rz * t * 0.11 * s + fz * 0.28 * s, 0.035 * s, '#1b1d20', NC);
  }
  h.ball(x + fx * 0.28 * s, y + 0.95 * s, z + fz * 0.28 * s, 0.11 * s, lc, NC); h.ball(x + fx * 0.39 * s, y + 0.98 * s, z + fz * 0.39 * s, 0.035 * s, '#1b1d20', NC);
  h.ball(x + fx * 0.28 * s, y + 0.42 * s, z + fz * 0.28 * s, 0.2 * s, lc, NC); // おなか
}
// 物をいくつか、空いている所に置く（部屋ごとに家具や遊具をそろえる）
function scatter(h, kinds, x0, x1, z0, z1, pal, acc, tries = 40) {
  for (const k of kinds) for (let t = 0; t < tries; t++) {
    const x = x0 + h.rnd() * (x1 - x0), z = z0 + h.rnd() * (z1 - z0);
    if (h.free(x, z, KIT_R[k] || 1.4)) { KIT[k](h, x, z, pal, acc); break; }
  }
}

// 自転車：車輪・フレーム・サドル・ハンドル・かご（al = x の向き）
function bikeAt(h, x, z, al, c, basket) {
  const P = (a, y, b = 0) => (al ? [x + a, y, z + b] : [x + b, y, z + a]);
  for (const s of [-1, 1]) { const [px, py, pz] = P(s * 0.55, 0.34); h.torus(px, py, pz, 0.31, 0.04, al ? [0, 0, 0] : [0, Math.PI / 2, 0], '#1b1d20'); h.cyl(px, py, pz, 0.05, 0.08, '#c9ccd0', { nocol: true, rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] }); }
  const rA = P(-0.55, 0.34), bb = P(-0.02, 0.3), sp = P(-0.2, 0.82), hd = P(0.38, 0.8), fA = P(0.55, 0.34);
  for (const [a, b] of [[rA, sp], [sp, bb], [bb, hd], [hd, fA], [rA, bb], [sp, hd]]) rod(h, a, b, 0.025, c);
  h.lump(...P(-0.22, 0.9), 0.14, 0.05, 0.08, '#2a3038', { seed: 1, bump: 0.05, freq: 1 });
  rod(h, P(0.36, 0.95, -0.28), P(0.36, 0.95, 0.28), 0.02, '#2a3038'); rod(h, hd, P(0.36, 0.95), 0.02, c);
  if (basket) { const [bx, by, bz] = P(0.62, 0.7); h.B(bx, by, bz, al ? 0.28 : 0.34, 0.2, al ? 0.34 : 0.28, '#c9ccd0', { r: 0.02, pat: ['vband', '#c9ccd0', '#8d8f94', 3, 1] }); }
}
// 人形（ドレス・頭・かみの毛・うで・リボン）
function doll(h, x, y, z, s, c, yaw) {
  const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -fz, rz = fx, skin = '#f3d2b0', hair = pick(h, ['#3a2a1c', '#e0b040', '#8a5a33', '#1b1d20', '#c9573f']);
  for (const t of [-1, 1]) h.cyl(x + rx * t * 0.07 * s, y, z + rz * t * 0.07 * s, 0.045 * s, 0.2 * s, skin, { seg: 8 });
  h.cone(x, y + 0.18 * s, z, 0.3 * s, 0.42 * s, c, { rt: 0.12 * s, seg: 16, pat: ['dots', c, '#f4f4f4', 4, 1] });
  h.cyl(x, y + 0.6 * s, z, 0.12 * s, 0.2 * s, c, { seg: 12 });
  h.ball(x, y + 0.95 * s, z, 0.17 * s, skin);
  h.lump(x - fx * 0.03 * s, y + 1.0 * s, z - fz * 0.03 * s, 0.2 * s, 0.17 * s, 0.2 * s, hair, { seed: seed8(h), bump: 0.12, freq: 2 });
  for (const t of [-1, 1]) { rod(h, [x + rx * t * 0.14 * s, y + 0.76 * s, z + rz * t * 0.14 * s], [x + rx * t * 0.22 * s + fx * 0.05 * s, y + 0.45 * s, z + rz * t * 0.22 * s + fz * 0.05 * s], 0.04 * s, skin); h.ball(x + rx * t * 0.06 * s + fx * 0.15 * s, y + 0.97 * s, z + rz * t * 0.06 * s + fz * 0.15 * s, 0.02 * s, '#1b1d20', NC); }
  h.ball(x + rx * 0.14 * s, y + 1.14 * s, z + rz * 0.14 * s, 0.06 * s, '#ff6fa8'); // リボン
}
/* ---- 遊具（下にもぐる・中に入る・すき間にはりつく。どれも見た目どおりに当たる） ---- */
Object.assign(KIT, {
  slideK(h, x, z, pal, acc) { // すべり台：はしご・踊り場・屋根・すべる所（踊り場の下にもぐれる。すべる所は歩いてものぼれる）
    const dir = pick(h, DIRS), F = frame(h, x - dir[0] * 1.2, z - dir[1] * 1.2, dir), c = pick(h, acc), c2 = pick(h, ['#f4f4f4', '#2f6fb0', '#e0413a', '#f0d040']), P = 1.5, L = 2.6;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = F.at(sa * 0.6, sb * 0.6); h.cyl(px, 0, pz, 0.07, P + 1.1, c2, { seg: 12 }); }
    F.B(0, 0, P - 0.12, 1.3, 0.12, 1.3, '#d9d2c4', { r: 0.03, pat: ['grain', '#d9d2c4', 0, 2, 2] });
    for (const sb of [-1, 1]) F.B(0, sb * 0.62, P, 1.15, 0.6, 0.06, c, { r: 0.03, pat: ['dots', c, '#f4f4f4', 2, 1] });
    const sb = h.rnd() < 0.5 ? 1 : -1, pp = rpat(h, pal, acc, 2, 1, ['bigcamo', 'dots', 'hstripe', 'check2', 'zigzag']);
    F.B(0, sb * 0.62, 0, 1.15, P - 0.15, 0.06, pp[1], { pat: pp, r: 0.02, sink: true }); // 踊り場の下の模様の板（下にもぐって同じ模様に塗る）
    { const [rx, rz] = F.at(0, 0); h.cone(rx, P + 1.1, rz, 1.05, 0.75, c2, { seg: 4, pat: ['vband', c2, '#f4f4f4', 4, 1] }); }
    for (const t of [-1, 1]) F.B(-0.82, t * 0.3, 0, 0.07, P + 0.55, 0.07, c2, { r: 0.02 });
    for (let k = 1; k <= 5; k++) F.B(-0.82, 0, k * P / 5 - 0.03, 0.07, 0.05, 0.6, '#f4f4f4', { r: 0.02 });
    const dh = P - 0.25, len = Math.hypot(L, dh), ang = Math.atan2(dh, L), a0 = 0.65, mid = a0 + L / 2;
    F.B(mid, 0, 0.25 + dh / 2 - 0.03, len, 0.06, 0.75, c, { nocol: true, rot: F.tilt(ang), rough: 0.3 });
    for (const t of [-1, 1]) F.B(mid, t * 0.4, 0.25 + dh / 2 - 0.02, len, 0.18, 0.05, c, { nocol: true, rot: F.tilt(ang) });
    const N = 6;
    for (let i = 0; i < N; i++) { const aa = a0 + (i + 0.5) * L / N, yt = P - i * dh / N, yb = Math.max(0, P - (i + 1) * dh / N - 0.12), [px, pz] = F.at(aa, 0); h.boxc(px, yb, pz, F.ax ? L / N : 0.85, yt - yb, F.ax ? 0.85 : L / N, { sharp: true }); }
    F.B(a0 + L + 0.15, 0, 0, 0.4, 0.22, 0.85, c, { r: 0.05 });
  },
  jungle(h, x, z, pal, acc) { // ジャングルジム：色とりどりの棒の箱（中にもぐれる・上に登れる・中に模様の板）
    const s = 0.8, nx = 3, nz = 2, ny = 3, x0 = x - nx * s / 2, z0 = z - nz * s / 2, cs = TOY, col = i => cs[i % cs.length];
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) h.cyl(x0 + i * s, 0, z0 + k * s, 0.045, ny * s + 0.06, col(i + k), { seg: 10 });
    for (let j = 1; j <= ny; j++) {
      const y = j * s - 0.04;
      for (let i = 0; i < nx; i++) for (let k = 0; k <= nz; k++) h.B(x0 + (i + 0.5) * s, y, z0 + k * s, s, 0.08, 0.08, col(j + k), { r: 0.035 });
      for (let i = 0; i <= nx; i++) for (let k = 0; k < nz; k++) h.B(x0 + i * s, y, z0 + (k + 0.5) * s, 0.08, 0.08, s, col(j + i + 1), { r: 0.035 });
    }
    h.B(x0 + s * 1.5, ny * s + 0.04, z0 + s * 0.5, s * 0.96, 0.06, s * 0.96, '#d9d2c4', { r: 0.02, pat: ['grain', '#d9d2c4', 0, 1, 1] });
    h.B(x0 + s * 2.5, s + 0.04, z0 + s * 0.5, s * 0.96, 0.06, s * 0.96, '#d9d2c4', { r: 0.02, pat: ['grain', '#d9d2c4', 0, 1, 1] });
    const p = rpat(h, pal, acc, 1, 1, ['bigcamo', 'dots', 'check2', 'hstripe']); h.B(x0 + s * 0.5, 0, z0 + s, s * 0.9, s * 0.95, 0.06, p[1], { pat: p, r: 0.02, sink: true });
  },
  swing(h, x, z, pal, acc) { // ブランコ：A字の柱・上の棒・座板・くさり
    const al = h.rnd() < 0.5, L = 3.4, H = 2.3, c = pick(h, acc), P = (a, b) => (al ? [x + a, z + b] : [x + b, z + a]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const [px, pz] = P(s * L / 2, t * 0.6), [tx, tz] = P(s * L / 2, 0); rod(h, [px, 0, pz], [tx, H, tz], 0.06, c); }
    { const [px, pz] = P(0, 0); h.cyl(px, H, pz, 0.07, L + 0.2, c, { rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] }); h.B(px, 0, pz, al ? L - 0.4 : 1.4, 0.02, al ? 1.4 : L - 0.4, '#c9a36a', FL); }
    for (let i = 0; i < 2; i++) {
      const a = (i - 0.5) * 1.4, [px, pz] = P(a, 0); h.B(px, 0.42, pz, al ? 0.5 : 0.3, 0.06, al ? 0.3 : 0.5, pick(h, TOY), { r: 0.03 });
      for (const t of [-1, 1]) { const [cx, cz] = P(a + t * 0.22, 0); h.B(cx, 0.48, cz, 0.025, H - 0.48, 0.025, '#9aa1a8', NC); }
    }
  },
  seesaw(h, x, z, pal, acc) { // シーソー：支点・板・取っ手・はしのタイヤ
    const al = h.rnd() < 0.5, c = pick(h, acc), L = 3.4, t = (h.rnd() < 0.5 ? 1 : -1) * 0.16;
    h.cone(x, 0, z, 0.4, 0.42, '#55606b', { seg: 3 });
    h.B(x, 0.42, z, al ? L : 0.34, 0.08, al ? 0.34 : L, c, { r: 0.03, rot: al ? [0, 0, t] : [t, 0, 0], pat: ['grain', c, 0, 3, 1] });
    for (const s of [-1, 1]) {
      const off = s * (L / 2 - 0.35), yy = 0.46 + (al ? off * Math.sin(t) : -off * Math.sin(t)), px = al ? x + off : x, pz = al ? z : z + off;
      h.cyl(px, yy, pz, 0.03, 0.32, '#c9ccd0', { seg: 6 }); h.B(px, yy + 0.32, pz, al ? 0.04 : 0.3, 0.04, al ? 0.3 : 0.04, '#c9ccd0', { r: 0.015 });
      h.tire(al ? x + s * (L / 2 - 0.2) : x, 0, al ? z : z + s * (L / 2 - 0.2), 0.25);
    }
  },
  spring(h, x, z) { // スプリング遊具（どうぶつ）
    const n = 2 + (h.rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const px = x + (i - (n - 1) / 2) * 1.3, pz = z + (h.rnd() - 0.5) * 0.6, k = Math.floor(h.rnd() * 4), yaw = h.rnd() * 6.28, fx = Math.cos(yaw), fz = Math.sin(yaw);
      const C = [['#a8693f', '#5a3c24'], ['#f0d040', '#f08a3c'], ['#f4f4f4', '#2a3038'], ['#4fbf6a', '#2e6b34']][k];
      h.cyl(px, 0, pz, 0.32, 0.04, '#55606b'); h.cylc(px, 0, pz, 0.12, 0.5);
      for (let j = 0; j < 5; j++) h.ring(px, 0.09 + j * 0.08, pz, 0.12, 0.025, '#e0413a');
      h.lump(px, 0.74, pz, 0.42, 0.26, 0.42, C[0], { seed: seed8(h), bump: 0.06, freq: 1.2, core: 0.93, pat: k === 2 ? ['bigcamo', C[0], [C[1], C[1]], 2, 1] : ['fabric', C[0], 0, 2, 1] });
      h.ball(px + fx * 0.36, 1.04, pz + fz * 0.36, 0.22, C[0]);
      h.ball(px + fx * 0.56, 1.0, pz + fz * 0.56, 0.09, C[1]);
      for (const t of [-1, 1]) h.ball(px + fx * 0.32 - fz * t * 0.14, 1.24, pz + fz * 0.32 + fx * t * 0.14, 0.07, C[1]);
      h.ball(px - fx * 0.42, 0.84, pz - fz * 0.42, 0.1, C[1]);
      rod(h, [px + fx * 0.22 - fz * 0.22, 1.02, pz + fz * 0.22 + fx * 0.22], [px + fx * 0.22 + fz * 0.22, 1.02, pz + fz * 0.22 - fx * 0.22], 0.03, '#c9ccd0');
    }
  },
  sandbox(h, x, z, pal, acc) { // 砂場：木のわく・砂・砂山・お城・バケツ・スコップ（砂の上に寝そべって砂の色に塗る）
    const w = 4.2, d = 3.4, sand = '#e2cf9c', wd = '#b08a5a';
    for (const s of [-1, 1]) { h.B(x, 0, z + s * (d / 2 - 0.1), w, 0.3, 0.2, wd, { r: 0.04, pat: ['grain', wd, 0, 3, 1] }); h.B(x + s * (w / 2 - 0.1), 0, z, 0.2, 0.3, d - 0.4, wd, { r: 0.04, pat: ['grain', wd, 0, 3, 1] }); }
    h.B(x, 0, z, w - 0.4, 0.16, d - 0.4, sand, { pat: ['noise', sand, 0, 3, 3], sharp: true });
    h.dome(x + 0.7, 0.16, z - 0.4, 1.0, 0.5, 0.8, sand, { pat: ['noise', sand, 0, 2, 2], solid: true });
    for (const [dx, dz, r] of [[-1.0, 0.6, 0.32], [-0.5, 0.9, 0.22], [-1.3, 1.0, 0.2]]) { h.cyl(x + dx, 0.16, z + dz, r, r * 1.4, '#d9c28a', { pat: ['brick', '#d9c28a', '#c9b07a', 2, 1] }); h.cone(x + dx, 0.16 + r * 1.4, z + dz, r * 1.05, r * 0.9, '#d9c28a'); }
    const bc = pick(h, TOY); h.lathe(x - 0.2, 0.16, z - 0.9, [[0.001, 0], [0.13, 0], [0.18, 0.26], [0.16, 0.26], [0.001, 0.2]], bc, { seg: 14 });
    rod(h, [x + 0.5, 0.2, z + 0.9], [x + 1.1, 0.24, z + 0.7], 0.03, pick(h, TOY)); h.B(x + 1.25, 0.16, z + 0.65, 0.25, 0.03, 0.18, pick(h, TOY), { r: 0.01 });
  },
  playhouse(h, x, z, pal, acc) { // ままごとハウス：入口・窓・とんがり屋根・中に小さなテーブルとくま
    const w = 2.1, d = 1.9, ht = 1.5, c = pick(h, ['#f3c6d4', '#c6e3f3', '#fff1b8', '#d4f3c6']), dir = pick(h, DIRS), al = dir[1] !== 0;
    shell(h, x, z, w, d, ht, 0.1, c, { r: 0.03, pat: ['vstripe', c, shade(c, 0.92), 3, 2] }, dir, 0.85, 1.15);
    h.cone(x, ht + 0.1, z, (Math.max(w, d) / 2 + 0.2) / 0.707, 0.9, pick(h, acc), { seg: 4, pat: ['hstripe', pick(h, acc), '#f4f4f4', 1, 5] });
    for (const s of [-1, 1]) { // 横の窓と花だん
      const wx = al ? x + s * (w / 2 + 0.01) : x, wz = al ? z : z + s * (d / 2 + 0.01);
      h.B(wx, 0.6, wz, al ? 0.02 : 0.6, 0.5, al ? 0.6 : 0.02, '#9fd0e8', { nocol: true, rough: 0.15 });
      h.B(al ? wx + s * 0.08 : wx, 0.5, al ? wz : wz + s * 0.08, al ? 0.16 : 0.7, 0.12, al ? 0.7 : 0.16, '#8a5a33', { r: 0.02 }); h.lump(al ? wx + s * 0.08 : wx, 0.66, al ? wz : wz + s * 0.08, al ? 0.1 : 0.32, 0.08, al ? 0.32 : 0.1, '#4fbf6a', { core: 0.9, bump: 0.3, freq: 3, seed: seed8(h), pat: ['confetti', '#4fbf6a', ['#ff6fa8', '#ffd940', '#ffffff'], 2, 1] });
    }
    h.B(x - dir[0] * 0.4, 0, z - dir[1] * 0.4, 0.5, 0.35, 0.5, '#f4f4f4', { r: 0.06 }); bear(h, x - dir[0] * 0.15 + (al ? 0.55 : 0), 0, z - dir[1] * 0.15 + (al ? 0 : 0.55), 0.38, '#d9b48a', Math.atan2(dir[1], dir[0]));
  },
  tiretun(h, x, z) { // 半分うまったタイヤのトンネル（いちばん大きいタイヤはしゃがんでくぐれる）
    const al = h.rnd() < 0.5, n = 4 + Math.floor(h.rnd() * 3);
    for (let i = 0; i < n; i++) { const R = 0.55 + ((i * 7) % 3) * 0.13, o = (i - (n - 1) / 2) * 0.78; h.arch(al ? x + o : x, al ? z : z + o, R, 0.2, al ? Math.PI / 2 : 0, ['noise', '#22252a', 0, 1, 1]); }
  },
  climb(h, x, z, pal, acc) { // ボルダリングの壁：色とりどりのホールド・下のマット（壁と同じ色に塗ってはりつく）
    const al = h.rnd() < 0.5, sd = h.rnd() < 0.5 ? 1 : -1, L = 3.4, ht = 3.0, base = pick(h, ['#3a4a5e', '#5a6b7d', '#e8e1d2', pal[0]]);
    h.B(x, 0, z, al ? L : 0.3, ht, al ? 0.3 : L, base, { pat: ['noise', base, 0, 3, 3], r: 0.04, sink: true });
    for (let i = 0; i < 16; i++) { const u = (h.rnd() - 0.5) * (L - 0.4), v = 0.3 + h.rnd() * (ht - 0.5), c = pick(h, TOY), s = 0.07 + h.rnd() * 0.07; h.lump(al ? x + u : x + sd * 0.17, v, al ? z + sd * 0.17 : z + u, s * 1.3, s, s, c, { seed: seed8(h), bump: 0.3, freq: 2 }); }
    h.B(al ? x : x + sd * 0.85, 0, al ? z + sd * 0.85 : z, al ? L : 1.3, 0.28, al ? 1.3 : L, '#2f6fb0', { r: 0.1, pat: ['fabric', '#2f6fb0', 0, 3, 1] });
    const e = h.rnd() < 0.5 ? 1 : -1; h.B(al ? x + e * (L / 2 + 0.15) : x + sd * 0.6, 0, al ? z + sd * 0.6 : z + e * (L / 2 + 0.15), al ? 0.3 : 1.5, ht * 0.8, al ? 1.5 : 0.3, base, { pat: ['noise', base, 0, 1, 2], r: 0.04, sink: true }); // 横の壁（角になる）
  },
  merry(h, x, z, pal, acc) { // 回転ジャングル（円盤・まん中の柱・持ち手）
    const c = pick(h, acc);
    h.cyl(x, 0, z, 0.5, 0.15, '#55606b'); h.cyl(x, 0.15, z, 1.4, 0.12, c, { pat: ['diag', c, '#f4f4f4', 6, 1] }); h.cyl(x, 0.27, z, 0.08, 0.95, '#c9ccd0', { seg: 10 });
    for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785, ca = Math.cos(a), sa = Math.sin(a); rod(h, [x + ca * 0.08, 1.15, z + sa * 0.08], [x + ca * 1.15, 1.0, z + sa * 1.15], 0.035, TOY[i]); h.cyl(x + ca * 1.15, 0.27, z + sa * 1.15, 0.035, 0.75, TOY[i], { seg: 8 }); }
  },
  bars(h, x, z, pal, acc) { // 鉄棒（3つの高さ）
    const al = h.rnd() < 0.5, c = pick(h, acc), hs = [0.7, 0.9, 1.1], P = a => (al ? [x + a, z] : [x, z + a]);
    for (let i = 0; i < 4; i++) { const [px, pz] = P(-1.65 + i * 1.1); h.cyl(px, 0, pz, 0.06, (hs[Math.min(i, 2)] || 1.1) + 0.1, c, { seg: 10 }); }
    for (let i = 0; i < 3; i++) { const [px, pz] = P(-1.1 + i * 1.1); h.cyl(px, hs[i], pz, 0.03, 1.1, '#c9ccd0', { rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] }); }
  },
  trampoline(h, x, z, pal, acc) { // トランポリン（下にもぐれる）
    const R = 1.3, c = pick(h, acc);
    h.torus(x, 0.55, z, R, 0.07, [Math.PI / 2, 0, 0], c);
    h.cyl(x, 0.5, z, R - 0.05, 0.04, '#22252a', { pat: ['noise', '#22252a', 0, 2, 2] });
    for (let i = 0; i < 6; i++) { const a = i * 1.047, ca = Math.cos(a), sa = Math.sin(a); rod(h, [x + ca * R, 0.55, z + sa * R], [x + ca * (R + 0.15), 0, z + sa * (R + 0.15)], 0.035, '#8d8f94'); }
  },

  /* ---- いろいろな形の道具・家の中の物（うしろ・すき間・下に隠れる） ---- */
  plush(h, x, z, pal, acc) { // ぬいぐるみの山（くまの間にまぎれて、同じ色に塗る）
    const n = 3 + Math.floor(h.rnd() * 3), cs = ['#a8693f', '#d9b48a', '#f3c6d4', '#c6e3f3', '#f4f4f4', '#8a5a33', '#f0d040'];
    h.B(x + 0.2, 0, z - 0.2, 1.9, 0.18, 1.6, pick(h, TOY), { r: 0.08, pat: ['fabric', pick(h, TOY), 0, 2, 2] });
    for (let i = 0; i < n; i++) { const a = h.rnd() * 6.28, d = 0.2 + h.rnd() * 0.8; bear(h, x + Math.cos(a) * d, 0.18 + (i > 3 ? 0.35 : 0), z + Math.sin(a) * d, 0.45 + h.rnd() * 0.5, pick(h, cs), h.rnd() * 6.28); }
  },
  kotatsu(h, x, z, pal, acc) { // こたつ：ふとん・天板・みかん・ざぶとん
    const q = pick(h, ['#c9573f', '#3f5f8a', '#e0b040', '#6b8f4a', '#b06fd8']), wd = '#8a5a33';
    h.B(x, 0, z, 2.1, 0.42, 1.7, q, { r: 0.16, pat: [pick(h, ['check2', 'diag', 'dots', 'hstripe', 'bigcamo']), q, shade(q, 1.3), 3, 2] });
    h.B(x, 0.42, z, 1.6, 0.06, 1.25, wd, { r: 0.03, pat: ['grain', wd, 0, 2, 1] });
    h.lathe(x + 0.25, 0.48, z, [[0.001, 0], [0.16, 0], [0.22, 0.1], [0.2, 0.1], [0.001, 0.04]], '#b08a5a', { seg: 12 });
    for (let i = 0; i < 4; i++) h.ball(x + 0.25 + Math.cos(i * 1.6) * 0.1, 0.62, z + Math.sin(i * 1.6) * 0.1, 0.07, '#f08a3c', NC);
    for (const [dx, dz] of [[0, 1.25], [0, -1.25], [1.45, 0], [-1.45, 0]]) if (h.rnd() < 0.8) { const c = pick(h, acc); h.B(x + dx, 0, z + dz, 0.7, 0.1, 0.7, c, { r: 0.04, pat: ['fabric', c, 0, 1, 1] }); }
  },
  coats(h, x, z, pal, acc) { // コートかけと長いコート（コートのうしろに隠れる）
    h.cyl(x, 0, z, 0.3, 0.05, '#3a2a1c'); h.cyl(x, 0, z, 0.04, 1.9, '#3a2a1c', { seg: 8 }); h.ball(x, 1.93, z, 0.06, '#3a2a1c');
    const n = 3 + Math.floor(h.rnd() * 2), a0 = h.rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * 6.28, ca = Math.cos(a), sa = Math.sin(a), c = pick(h, acc.concat(pal));
      rod(h, [x, 1.62, z], [x + ca * 0.2, 1.78, z + sa * 0.2], 0.02, '#3a2a1c', NC);
      h.B(x + ca * 0.33, 0.48, z + sa * 0.33, 0.58, 1.25, 0.2, c, { r: 0.07, rot: [0, -a - Math.PI / 2, 0], pat: h.rnd() < 0.5 ? rpat(h, pal, acc, 1, 2) : ['fabric', c, 0, 1, 2] });
    }
    if (h.rnd() < 0.6) h.lump(x, 1.98, z, 0.24, 0.12, 0.24, pick(h, acc), { seed: seed8(h), bump: 0.05, freq: 1 });
  },
  beanbag(h, x, z, pal, acc) { // ビーズクッション
    for (let i = 0; i < 2 + Math.floor(h.rnd() * 2); i++) { const s = 0.5 + h.rnd() * 0.3, c = pick(h, acc.concat(pal)), a = h.rnd() * 6.28; h.lump(x + Math.cos(a) * i * 0.6, s * 0.45, z + Math.sin(a) * i * 0.6, s * 1.1, s * 0.55, s, c, { seed: seed8(h), bump: 0.1, freq: 1.4, core: 0.93, ry: h.rnd() * 6, pat: ['fabric', c, 0, 2, 2] }); }
  },
  ladderK(h, x, z) { // 脚立（A字。ふみ台つき）
    const al = h.rnd() < 0.5, H = 1.8, sp = 0.5, k = 0.13, c = pick(h, ['#c9ccd0', '#f0d040', '#e0413a']);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const px = al ? x + t * 0.28 : x + s * sp / 2, pz = al ? z + s * sp / 2 : z + t * 0.28; h.B(px, 0, pz, 0.06, H, 0.06, c, { r: 0.015, rot: al ? [-s * k, 0, 0] : [0, 0, s * k] }); }
    for (let j = 1; j <= 4; j++) { const y = j * H / 5, o = sp / 2 + (H / 2 - y) * Math.sin(k); h.B(al ? x : x + o, y - 0.03, al ? z + o : z, al ? 0.62 : 0.14, 0.05, al ? 0.14 : 0.62, c, { r: 0.01 }); }
    h.B(x, H - 0.06, z, al ? 0.62 : 0.32, 0.06, al ? 0.32 : 0.62, c, { r: 0.02 });
  },
  cleaning(h, x, z, pal, acc) { // そうじ道具：そうじ機・バケツとモップ・ほうき
    const c = pick(h, ['#e0413a', '#2f6fb0', '#f0d040', '#4fbf6a']);
    h.lump(x, 0.22, z, 0.38, 0.22, 0.28, c, { seed: seed8(h), bump: 0.04, freq: 1, core: 0.94 }); h.ring(x, 0.22, z, 0.3, 0.025, '#2a3038');
    rod(h, [x + 0.3, 0.3, z], [x + 0.55, 0.55, z + 0.1], 0.04, '#2a3038'); rod(h, [x + 0.55, 0.55, z + 0.1], [x + 0.85, 0.06, z + 0.15], 0.025, '#c9ccd0'); h.B(x + 0.9, 0, z + 0.15, 0.16, 0.06, 0.36, '#2a3038', { r: 0.02 });
    const bc = pick(h, TOY); h.lathe(x - 0.6, 0, z + 0.3, [[0.001, 0], [0.17, 0], [0.22, 0.32], [0.2, 0.32], [0.001, 0.26]], bc, { seg: 14 });
    rod(h, [x - 0.6, 0.15, z + 0.3], [x - 0.75, 1.4, z + 0.5], 0.022, '#c9a26b'); h.lump(x - 0.6, 0.18, z + 0.3, 0.14, 0.1, 0.14, '#efe6d2', { seed: seed8(h), bump: 0.4, freq: 4, nocol: true });
    rod(h, [x - 0.2, 0.25, z - 0.45], [x - 0.35, 1.45, z - 0.5], 0.022, '#c9a26b'); h.B(x - 0.2, 0, z - 0.45, 0.32, 0.28, 0.08, '#d9b48a', { r: 0.02, rot: [0, 0, 0.12] });
  },
  bike(h, x, z, pal, acc) { bikeAt(h, x, z, h.rnd() < 0.5, pick(h, acc), h.rnd() < 0.6); }, // 自転車
  garden(h, x, z, pal, acc) { // 庭の道具：一輪車・じょうろ・植木ばち・ホース
    const c = pick(h, ['#2f6fb0', '#3f9b6a', '#e0413a']), o = h.rnd() < 0.5 ? 1 : -1;
    h.B(x, 0.32, z, 0.95, 0.3, 0.62, c, { r: 0.1 }); h.B(x, 0.6, z, 0.8, 0.02, 0.5, '#5a3c24', NC); // 一輪車の荷台
    h.torus(x + 0.6, 0.22, z, 0.2, 0.05, [0, 0, 0], '#1b1d20'); for (const s of [-1, 1]) { rod(h, [x + 0.55, 0.22, z + s * 0.05], [x - 0.75, 0.62, z + s * 0.32], 0.025, '#55606b'); rod(h, [x - 0.3, 0.32, z + s * 0.25], [x - 0.35, 0, z + s * 0.28], 0.025, '#55606b'); }
    const wc = pick(h, TOY); h.lathe(x + 0.2, 0, z + o * 0.85, [[0.001, 0], [0.17, 0], [0.17, 0.32], [0.08, 0.38], [0.001, 0.38]], wc, { seg: 14 }); rod(h, [x + 0.32, 0.12, z + o * 0.85], [x + 0.62, 0.42, z + o * 0.85], 0.025, wc); h.torus(x + 0.12, 0.42, z + o * 0.85, 0.12, 0.02, [0, 0, 0], wc, NC);
    for (let i = 0; i < 3; i++) { const px = x - 0.6 + i * 0.5, pz = z - o * 0.85, fc = pick(h, ['#ff6fa8', '#ffd940', '#b06fd8', '#ffffff']); h.lathe(px, 0, pz, [[0.001, 0], [0.13, 0], [0.18, 0.28], [0.001, 0.28]], '#b5651d', { seg: 12 }); h.lump(px, 0.42, pz, 0.2, 0.17, 0.2, '#3b8f46', { core: 0.9, bump: 0.3, freq: 3, seed: seed8(h), pat: ['confetti', '#3b8f46', [fc, '#ffffff'], 1, 1] }); }
    h.cyl(x - 0.9, 0, z + o * 0.5, 0.22, 0.5, '#55606b'); h.torus(x - 0.9, 0.3, z + o * 0.5, 0.24, 0.05, [0, 0, 0], '#3f9b6a', NC); // ホースまき
  },
  music(h, x, z, pal, acc) { // 楽器：ドラムセット・ギター・アンプ
    const c = pick(h, ['#e0413a', '#2f6fb0', '#1b1d20', '#b06fd8']);
    h.cyl(x, 0.32, z, 0.32, 0.4, c, { rot: [Math.PI / 2, 0, 0], pat: ['hstripe', c, '#f4f4f4', 1, 1] }); // バスドラム
    for (const [dx, dz, r] of [[0.15, -0.1, 0.16], [-0.2, -0.1, 0.17]]) h.cyl(x + dx, 0.66, z + dz, r, 0.16, c);
    h.cyl(x + 0.55, 0.52, z - 0.3, 0.19, 0.14, '#c9ccd0'); h.cyl(x + 0.55, 0, z - 0.3, 0.02, 0.52, '#8d8f94', { seg: 6 });
    for (const [dx, dz, y] of [[-0.65, -0.35, 1.05], [0.75, 0.15, 1.15]]) { h.cyl(x + dx, 0, z + dz, 0.02, y, '#8d8f94', { seg: 6 }); h.cyl(x + dx, y, z + dz, 0.28, 0.015, '#d9b440', { rough: 0.25 }); }
    stool(h, x, z - 0.75, '#2a3038');
    const gx = x - 1.1, gc = pick(h, ['#e0413a', '#f0d040', '#d9b48a', '#2f6fb0']); // ギター（スタンドに立てる）
    h.lump(gx, 0.3, z + 0.3, 0.26, 0.24, 0.08, gc, { seed: 2, bump: 0.02, freq: 1, core: 0.95 }); h.lump(gx, 0.6, z + 0.3, 0.2, 0.18, 0.07, gc, { seed: 3, bump: 0.02, freq: 1, core: 0.95 }); h.cyl(gx, 0.4, z + 0.31, 0.06, 0.02, '#1b1d20', { nocol: true, rot: [Math.PI / 2, 0, 0] });
    rod(h, [gx, 0.75, z + 0.3], [gx, 1.35, z + 0.3], 0.03, '#5a3c24'); h.B(gx, 1.35, z + 0.3, 0.1, 0.16, 0.04, '#1b1d20', { r: 0.01 });
    h.B(x + 1.2, 0, z + 0.4, 0.7, 0.75, 0.4, '#2a3038', { r: 0.05 }); h.B(x + 1.2, 0.08, z + 0.61, 0.6, 0.5, 0.01, '#4a4f57', { nocol: true, pat: ['fabric', '#4a4f57', 0, 2, 2] }); // アンプ
  },
  study(h, x, z, pal, acc) { // 勉強づくえ：いす・電気スタンド・地球儀・本・ランドセル
    const fz = h.rnd() < 0.5 ? 1 : -1, c = pick(h, ['#c98f4e', '#8a5a33', '#f4f1e8']);
    table(h, x, z, 1.6, 0.8, c); chair(h, x, z - fz * 0.75, pick(h, ['#3a5f8a', '#e0413a', '#4fbf6a']), fz);
    h.cyl(x + 0.55, 0.76, z + fz * 0.2, 0.1, 0.03, '#2a3038'); rod(h, [x + 0.55, 0.78, z + fz * 0.2], [x + 0.45, 1.15, z + fz * 0.1], 0.02, '#2a3038'); h.cone(x + 0.35, 1.02, z + fz * 0.05, 0.12, 0.14, '#f5e9c0', { glow: 0.6, rt: 0.05 });
    h.cyl(x - 0.5, 0.76, z + fz * 0.15, 0.08, 0.02, '#2a3038'); rod(h, [x - 0.5, 0.78, z + fz * 0.15], [x - 0.5, 0.88, z + fz * 0.15], 0.015, '#2a3038'); h.ball(x - 0.5, 1.05, z + fz * 0.15, 0.17, '#2f6fb0', { pat: ['camo', '#2f6fb0', ['#4fbf6a', '#d9b48a', '#4fbf6a'], 2, 1] });
    for (let i = 0; i < 4; i++) h.B(x - 0.05, 0.76 + i * 0.05, z + fz * 0.15, 0.36 - i * 0.03, 0.05, 0.26, pick(h, TOY), { r: 0.01 });
    h.lump(x, 0.62, z - fz * 0.95, 0.2, 0.22, 0.12, pick(h, ['#e0413a', '#1b1d20', '#b06fd8']), { seed: 4, bump: 0.03, freq: 1, core: 0.95 }); // ランドセル
  },
  toybox(h, x, z, pal, acc) { // おもちゃ箱：ふたの開いた箱にボール・ブロック・あひる
    const c = pick(h, acc);
    shell(h, x, z, 1.5, 1.0, 0.7, 0.08, c, { r: 0.04, pat: ['dots', c, '#f4f4f4', 2, 1] }, null, 0, 0, false);
    h.B(x, 0, z, 1.34, 0.6, 0.84, '#f0d040', { sharp: true, pat: ['confetti', '#f0d040', TOY, 2, 1] });
    for (let i = 0; i < 6; i++) h.ball(x - 0.5 + h.rnd(), 0.7, z - 0.25 + h.rnd() * 0.5, 0.1 + h.rnd() * 0.06, pick(h, TOY), NC);
    brick(h, x + 0.3, 0.6, z - 0.1, 0.3, pick(h, TOY));
    h.ball(x - 0.2, 0.72, z + 0.15, 0.13, '#f0d040'); h.ball(x - 0.2, 0.9, z + 0.2, 0.08, '#f0d040'); h.ball(x - 0.2, 0.9, z + 0.28, 0.04, '#f08a3c', NC);
    h.B(x, 0.7, z - 0.58, 1.5, 0.6, 0.06, c, { r: 0.03, rot: [-0.35, 0, 0], pat: ['dots', c, '#f4f4f4', 2, 1] }); // 開いたふた
  },
  umbrella(h, x, z) { // かさ立てとかさ
    h.lathe(x, 0, z, [[0.001, 0], [0.2, 0], [0.2, 0.5], [0.17, 0.5], [0.001, 0.45]], '#55606b', { seg: 14 });
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4, c = pick(h, TOY.concat(['#2a3038', '#f4f4f4'])), px = x + Math.cos(a) * 0.08, pz = z + Math.sin(a) * 0.08; rod(h, [px, 0.1, pz], [px + Math.cos(a) * 0.12, 1.05, pz + Math.sin(a) * 0.12], 0.018, '#2a3038'); h.cone(px + Math.cos(a) * 0.08, 0.45, pz + Math.sin(a) * 0.08, 0.07, 0.5, c, { rt: 0.025, seg: 8 }); }
  },
  gym(h, x, z, pal, acc) { // 体育の道具：跳び箱・マットの山・平均台・ボールかご
    const al = h.rnd() < 0.5, wd = '#c9a26b', P = (a, b) => (al ? [x + a, z + b] : [x + b, z + a]);
    { const [vx, vz] = P(-0.9, 0); for (let k = 0; k < 5; k++) h.B(vx, k * 0.18, vz, al ? 1.1 - k * 0.05 : 0.72 - k * 0.03, 0.18, al ? 0.72 - k * 0.03 : 1.1 - k * 0.05, wd, { r: 0.03, pat: ['grain', wd, 0, 2, 1] }); h.B(vx, 0.9, vz, al ? 0.86 : 0.58, 0.12, al ? 0.58 : 0.86, '#f4f4f4', { r: 0.06, pat: ['fabric', '#f4f4f4', 0, 1, 1] }); }
    { const [mx, mz] = P(0.7, -0.2); for (let k = 0; k < 4; k++) h.B(mx, k * 0.12, mz, al ? 1.2 : 1.8, 0.12, al ? 1.8 : 1.2, k % 2 ? '#2f6fb0' : '#3f6fc9', { r: 0.05, pat: ['fabric', '#2f6fb0', 0, 2, 2] }); h.cyl(mx, 0.48 + 0.3, mz, 0.3, 1.2, '#3f6fc9', { rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2], pat: ['wave', '#3f6fc9', '#2f6fb0', 2, 1] }); } // まいたマット
    { const [bx, bz] = P(0, 1.2); h.B(bx, 0.55, bz, al ? 3.0 : 0.12, 0.12, al ? 0.12 : 3.0, wd, { r: 0.02, pat: ['grain', wd, 0, 4, 1] }); for (const s of [-1, 1]) { const [sx, sz] = P(s * 1.3, 1.2); h.B(sx, 0, sz, al ? 0.12 : 0.5, 0.55, al ? 0.5 : 0.12, '#55606b', { r: 0.02 }); } } // 平均台
    { const [cx, cz] = P(1.8, 0.9); h.B(cx, 0.1, cz, 0.7, 0.6, 0.7, '#c9ccd0', { r: 0.03, pat: ['vband', '#c9ccd0', '#8d8f94', 3, 2] }); for (const s of [-1, 1]) for (const t of [-1, 1]) h.wheel(cx + s * 0.28, 0.06, cz + t * 0.28, 0.06, 0.04, 'x', NC); for (let i = 0; i < 4; i++) h.ball(cx - 0.15 + (i % 2) * 0.3, 0.86, cz - 0.15 + Math.floor(i / 2) * 0.3, 0.16, pick(h, ['#f08a3c', '#f4f4f4', '#e04f4f'])); }
  },
  easel(h, x, z, pal, acc) { // イーゼルの大きな絵（体の前の方を入れて、絵と同じ色に塗る）・パレット・いす
    const al = h.rnd() < 0.5, sd = h.rnd() < 0.5 ? 1 : -1, P = ARTPAL[Math.floor(h.rnd() * ARTPAL.length)], k = ART[Math.floor(h.rnd() * ART.length)];
    h.B(x, 0.55, z, al ? 1.3 : 0.08, 1.05, al ? 0.08 : 1.3, P[0], { pat: [k, P[0], P, 1, 1], sharp: true, sink: true });
    for (const s of [-1, 1]) rod(h, [al ? x + s * 0.5 : x + sd * 0.12, 0, al ? z + sd * 0.12 : z + s * 0.5], [al ? x + s * 0.2 : x, 1.75, al ? z : z + s * 0.2], 0.025, '#8a5a33');
    rod(h, [al ? x : x - sd * 0.55, 0, al ? z - sd * 0.55 : z], [x, 1.6, z], 0.025, '#8a5a33');
    h.B(x, 0.5, z, al ? 1.2 : 0.16, 0.04, al ? 0.16 : 1.2, '#8a5a33', { r: 0.01 });
    stool(h, al ? x : x + sd * 0.9, al ? z + sd * 0.9 : z, '#55606b');
    h.cyl(al ? x + 0.35 : x + sd * 0.9, 0.7, al ? z + sd * 0.9 : z + 0.35, 0.16, 0.01, '#e8dcc8', { nocol: true, pat: ['confetti', '#e8dcc8', P, 1, 1] }); // パレット
  }
});


/* ---- 窓・大きな家・銅像 ---- */
// 窓ガラス（中がすけて見える。体は通りぬけない。弾は通る）
const glass = (h, x, y, z, w, ht, d) => { h.B(x, y, z, w, ht, d, '#bfe3f2', { soft: true, glass: true, sharp: true }); h.boxc(x, y, z, w, ht, d, { sharp: true }); };
// 部屋の中の窓：出っぱった窓わく・窓台（体が入るくぼみ）・外の景色・左右のカーテン。(x,z)=壁の内側の面、(nx,nz)=部屋の内向き
function windowIn(h, x, z, nx, nz, w = 2.4, y0 = 1.15, ht = 1.5) {
  const al = nz !== 0, dp = 0.4, fr = '#f4f1e8', B = (a, b, y, la, hh, lb, c, o) => h.B(x + (al ? a : nx * b), y, z + (al ? nz * b : a), al ? la : lb, hh, al ? lb : la, c, o);
  B(0, 0.012, y0, w, ht, 0.02, '#a8d8f0', { nocol: true, glow: 0.4, pat: [pick(h, ['artLand', 'artField', 'artSea']), '#a8d8f0', pick(h, ARTPAL), 1, 1] }); // 窓の外の景色
  B(0, 0.03, y0 + ht / 2, w, 0.05, 0.03, fr, NC); B(0, 0.03, y0, 0.05, ht, 0.03, fr, NC);
  B(0, dp / 2, y0 - 0.12, w + 0.5, 0.12, dp, fr, { r: 0.02 });
  for (const t of [-1, 1]) B(t * (w / 2 + 0.12), dp / 2, y0 - 0.12, 0.24, ht + 0.3, dp, fr, { r: 0.02 });
  B(0, dp / 2, y0 + ht, w + 0.5, 0.18, dp, fr, { r: 0.02 });
  const cc = pick(h, ['#c9573f', '#7d8fb3', '#e8dcc8', '#8fbf7a', '#e0719a', '#f0d040']);
  for (const t of [-1, 1]) B(t * (w / 2 + 0.3), dp + 0.1, y0 - 0.5, 0.4, ht + 0.95, 0.14, cc, { r: 0.06, pat: ['vband', cc, shade(cc, 0.82), 2, 1] }); // カーテン（たば）
  B(0, dp + 0.1, y0 + ht + 0.45, w + 1.3, 0.05, 0.05, '#c9a24a', NC);
}
// 大きな家：中に入れる。窓（ガラス・外の窓わく・よろい戸・中のカーテン）・玄関ポーチ・部屋ごとの家具と小物・屋上
//   dir = 正面の向き。中は リビング（玄関）／ダイニングキッチン／子ども部屋／寝室／洗面所（勝手口）／トイレ／浴室 の7つ
function bigHouse(h, x, z, dir, pal) {
  const F = frame(h, x, z, dir), W = 16, D = 11, H = 3.2, t = 0.3, uX = F.ax === 0; // u = 横（W）、v = 奥行（D、正面が +v）
  const B = (v, u, y, dv, hh, du, c, o) => F.B(v, u, y, dv, hh, du, c, o);
  const G = (v, u, y, dv, hh, du) => { const [px, pz] = F.at(v, u); glass(h, px, y, pz, F.ax ? dv : du, hh, F.ax ? du : dv); };
  const wl = pick(h, ['#e8dcc8', '#d9e7e3', '#f3e3c3', '#e7d9e8']), sid = pick(h, ['#c9573f', '#7d8fb3', '#f4f1e8', '#8fbf7a', '#e0b040']), shut = pick(h, ['#2f6fb0', '#3f9b6a', '#8a5a33', '#b8452f']);
  const outP = (len, hh) => ['hstripe', sid, shade(sid, 0.88), Math.max(1, Math.round(len / 1.4)), Math.max(2, Math.round(hh * 2.5))]; // 外：横板
  const inP = (len, hh) => ['dots', wl, shade(wl, 0.9), Math.max(1, Math.round(len / 1.2)), Math.max(1, Math.round(hh / 1.2))]; // 中：かべ紙
  B(0, 0, 0, D, 0.04, W, '#c9a26b', { flat: true, nocol: true, pat: ['vstripe', '#c9a26b', '#b8935a', Math.round(W / 1.2), 1] }); // 床
  // 外のかべ（穴をあけて窓・ドア）。outer = 外がわの向き（+1 / -1）
  const wall = (alongU, fixed, outer, from, to, holes) => {
    const seg = (a0, a1, y0, y1) => {
      if (a1 - a0 < 0.02 || y1 - y0 < 0.02) return;
      const m = (a0 + a1) / 2, len = a1 - a0, hh = y1 - y0;
      for (const [k, off] of [[1, t / 4], [0, -t / 4]]) { // 外がわの板と中がわのかべ紙
        const pat = k ? outP(len, hh) : inP(len, hh), c = k ? sid : wl, f = fixed + outer * off;
        if (alongU) B(f, m, y0, t / 2, hh, len, c, { pat, r: 0.01 }); else B(m, f, y0, len, hh, t / 2, c, { pat, r: 0.01 });
      }
    };
    let a = from;
    for (const [c, w, y0, y1, kind] of holes.slice().sort((p, q) => p[0] - q[0])) {
      seg(a, c - w / 2, 0, H); seg(c - w / 2, c + w / 2, 0, y0); seg(c - w / 2, c + w / 2, y1, H); a = c + w / 2;
      if (kind !== 'win') continue;
      if (alongU) G(fixed, c, y0, 0.04, y1 - y0, w); else G(c, fixed, y0, w, y1 - y0, 0.04);
      const o = fixed + outer * (t / 2 + 0.12), ii = fixed - outer * (t / 2 + 0.14);
      if (alongU) {
        B(o, c, y0 - 0.12, 0.26, 0.12, w + 0.3, '#f4f1e8', { r: 0.02 }); // 外の窓台
        for (const sgn of [-1, 1]) { B(fixed + outer * (t / 2 + 0.04), c + sgn * (w / 2 + 0.3), y0, 0.06, y1 - y0, 0.55, shut, { r: 0.01, pat: ['hstripe', shut, shade(shut, 0.8), 1, 6] }); B(ii, c + sgn * (w / 2 + 0.22), y0 - 0.05, 0.14, y1 - y0 + 0.4, 0.42, '#e8dcc8', { r: 0.05, pat: ['vband', pick(h, ['#c9573f', '#7d8fb3', '#e0719a', '#e8dcc8']), '#f4f1e8', 2, 1] }); } // よろい戸・中のカーテン
      } else {
        B(c, o, y0 - 0.12, w + 0.3, 0.12, 0.26, '#f4f1e8', { r: 0.02 });
        for (const sgn of [-1, 1]) { B(c + sgn * (w / 2 + 0.3), fixed + outer * (t / 2 + 0.04), y0, 0.55, y1 - y0, 0.06, shut, { r: 0.01, pat: ['hstripe', shut, shade(shut, 0.8), 1, 6] }); B(c + sgn * (w / 2 + 0.22), ii, y0 - 0.05, 0.42, y1 - y0 + 0.4, 0.14, '#e8dcc8', { r: 0.05, pat: ['vband', pick(h, ['#c9573f', '#7d8fb3', '#e0719a', '#e8dcc8']), '#f4f1e8', 2, 1] }); }
      }
    }
    seg(a, to, 0, H);
  };
  const win = c => [c, 1.8, 1.0, 2.4, 'win'];
  wall(true, D / 2 - t / 2, 1, -W / 2, W / 2, [[-4, 1.5, 0, 2.3, 'door'], win(-6.6), win(-1.6), win(2.6), win(6)]); // 正面
  wall(true, -D / 2 + t / 2, -1, -W / 2, W / 2, [win(-5.5), win(-2.2), win(2.2), win(5.8)]); // うら
  wall(false, -W / 2 + t / 2, -1, -D / 2 + t, D / 2 - t, [win(-2.6), win(2.6)]); // 左
  wall(false, W / 2 - t / 2, 1, -D / 2 + t, D / 2 - t, [win(-3.2), [0.8, 1.4, 0, 2.3, 'door'], [4.4, 0.9, 1.3, 2.2, 'win']]); // 右（浴室の窓・勝手口・トイレの小窓）
  // 中のかべ（ドアの穴つき）
  const inw = (alongU, fixed, from, to, doors) => {
    let a = from;
    const seg = (a0, a1, y0, y1) => { if (a1 - a0 < 0.02) return; const m = (a0 + a1) / 2; if (alongU) B(fixed, m, y0, 0.2, y1 - y0, a1 - a0, wl, { pat: inP(a1 - a0, y1 - y0), r: 0.01 }); else B(m, fixed, y0, a1 - a0, y1 - y0, 0.2, wl, { pat: inP(a1 - a0, y1 - y0), r: 0.01 }); };
    for (const c of doors) { seg(a, c - 0.75, 0, H); seg(c - 0.75, c + 0.75, 2.3, H); a = c + 0.75; }
    seg(a, to, 0, H);
  };
  inw(false, -1, -D / 2 + t, D / 2 - t, [-2.6, 2.6]); // まん中（左右を分ける）
  inw(true, 0, -W / 2 + t, -1.1, [-4.6]); // 左：リビング（前）とキッチン（うしろ）
  inw(true, 0.5, -0.9, 3.9, [1.5]); // まん中：子ども部屋（前）と寝室（うしろ）
  inw(false, 4.0, -D / 2 + t, D / 2 - t, [1.5]); // 右の列（洗面所・トイレ・浴室）とのしきり
  inw(true, 3.6, 4.1, W / 2 - t, [5.2]); inw(true, -1.2, 4.1, W / 2 - t, [6.6]); // トイレ｜洗面所｜浴室
  // 天井・屋上（パラペット・ソーラーパネル・えんとつ）
  B(0, 0, H - 0.02, D - 2 * t, 0.02, W - 2 * t, '#f4f4f4', NC);
  B(0, 0, H, D + 0.6, 0.3, W + 0.6, '#8d8f94', { r: 0.04, pat: ['noise', '#8d8f94', 0, 4, 4] });
  for (const s of [-1, 1]) { B(s * (D / 2 + 0.2), 0, H + 0.3, 0.2, 0.55, W + 0.6, sid, { r: 0.03 }); B(0, s * (W / 2 + 0.2), H + 0.3, D + 0.2, 0.55, 0.2, sid, { r: 0.03 }); }
  B(-2, 4, H + 0.3, 2.4, 0.5, 3.6, '#2f4f7a', { rot: F.ax ? [0, 0, 0.3 * F.ax] : [-0.3 * F.az, 0, 0], pat: ['check2', '#2f4f7a', '#3f6fa0', 3, 2] }); // ソーラーパネル
  B(1, -5.5, H + 0.3, 0.8, 1.4, 0.8, '#b8452f', { r: 0.03, pat: ['brick', '#b8452f', '#9a3a28', 1, 2] }); // えんとつ
  // 天井の明かり（部屋ごと）
  for (const [v, u] of [[2.6, -4.4], [-2.6, -4.4], [2.9, 1.5], [-2.4, 1.5], [1.2, 5.9], [4.4, 5.9], [-3.2, 5.9]]) { const [px, pz] = F.at(v, u); h.ball(px, H - 0.25, pz, 0.22, '#fff4c2', { glow: 1, nocol: true }); h.cyl(px, H - 0.1, pz, 0.3, 0.08, '#f4f4f4', NC); }
  // 玄関ポーチ：段・柱・ひさし・開いたドア
  B(D / 2 + 0.9, -4, 0, 1.6, 0.16, 2.6, '#b9b7b0', { r: 0.03 }); B(D / 2 + 1.9, -4, 0, 0.5, 0.08, 2.0, '#b9b7b0', { r: 0.02 });
  for (const sgn of [-1, 1]) { const [px, pz] = F.at(D / 2 + 1.5, -4 + sgn * 1.15); h.cyl(px, 0.16, pz, 0.1, 2.5, '#f4f1e8', { seg: 12 }); }
  B(D / 2 + 0.9, -4, 2.66, 1.9, 0.14, 2.8, shut, { r: 0.04 });
  B(D / 2 - t - 0.7, -4 - 0.72, 0, 1.4, 2.25, 0.06, '#8a5a33', { r: 0.02, pat: ['cabinet', '#8a5a33', '#c9a24a', 1, 2] }); // 開いたドア
  { const [px, pz] = F.at(D / 2 + 1.4, -6.3); mailbox(h, px, pz); }
  // ---- 部屋ごとの家具（向きをそろえて壁ぞいに。ドアの前はあけておく）----
  const Dw = (dv, du) => [F.ax * dv - F.az * du, F.az * dv + F.ax * du]; // 家の中の向き → 世界の向き
  const put = (fn, v, u, dv, du, ...a) => { const [px, pz] = F.at(v, u); return fn(h, px, pz, Dw(dv, du), ...a); };
  const at = (v, u) => F.at(v, u), A = TOY, cc = pick(h, ['#3f5f8a', '#7a2f2f', '#5a7a4a', '#8a6a9a']);
  // リビング（玄関から入る）：テレビ・ソファ・テーブル・本だな・くつ箱
  put(tvF, 2.4, -7.4, 0, 1, 2.6); put(sofaF, 2.4, -2.6, 0, -1, 2.6, cc); { const [px, pz] = at(2.4, -5.0); const [w, d] = lie(Dw(0, 1), 1.0, 1.6); table(h, px, pz, w, d, '#6b4a2b', 0.42); }
  { const [px, pz] = at(2.4, -4.8); const [w, d] = lie(Dw(0, 1), 3.2, 3.4); h.F(px, pz, w, d, 0, ['diag', '#a8443f', '#d9a441', 2, 2], true); }
  put(shoeboxF, 4.95, -6.4, -1, 0, 1.4, 0.9); put(chestF, 0.45, -6.6, 1, 0, 1.6, 0.85, '#8a5a33');
  { const [px, pz] = at(0.6, -2.0); KIT.tallplant(h, px, pz, pal, A); } { const [px, pz] = at(4.6, -1.7); KIT.plush(h, px, pz, pal, A); }
  // ダイニングキッチン：流し台とコンロ・冷蔵庫・食卓・食器だな
  put(counterF, -4.85, -4.6, 1, 0, 4.6, { sink: -1.2, stove: 1.2 }); put(fridgeF, -4.8, -1.6, 1, 0);
  { const [px, pz] = at(-2.2, -4.8); const [w, d] = lie(Dw(1, 0), 1.0, 1.7); table(h, px, pz, w, d, '#c98f4e'); for (const s2 of [-1, 1]) { const [cx, cz] = at(-2.2 + s2 * 0.75, -4.8), [fx, fz] = Dw(-s2, 0); chair(h, cx, cz, '#8a5a33', fz, fx); } }
  put(cupboardF, -2.2, -7.45, 0, 1, 1.8, '#b08a5a'); { const [px, pz] = at(-0.7, -7.2); bin(h, px, pz, '#55606b'); }
  // 子ども部屋：2段ベッド・つくえ・おもちゃ箱
  put(bunkF, 4.45, 0.4, 0, 1, pick(h, TOY)); put(deskF, 3.9, 3.45, 0, -1, '#f3f1ec', 'study'); { const [px, pz] = at(1.5, 0.0); KIT.toybox(h, px, pz, pal, A); }
  { const [px, pz] = at(2.6, 1.6); const [w, d] = lie(Dw(0, 1), 2.0, 2.0); h.F(px, pz, w, d, 0, ['dots', '#f3c6d4', '#ffffff', 2, 2], true); bear(h, px, 0, pz, 0.45, '#d9b48a', 0); }
  // 寝室：ベッド・ナイトテーブル・たんす・洋服だんす（中に入れる）
  put(bedF, -3.4, 1.2, 1, 0, pick(h, ['#5b76b8', '#e0719a', '#8fbf7a']), 2.0, 3.0); put(nightF, -4.75, -0.4, 1, 0, '#8a5a33'); put(nightF, -4.75, 2.8, 1, 0, '#8a5a33');
  { const [px, pz] = at(-0.9, 3.35); closet(h, px, pz, Dw(0, -1), '#8a5a33', pal, A); }
  // 洗面所（勝手口から入れる）：洗たく機・洗面台・せんたくかご
  put(washerF, 2.8, 7.35, 0, -1, true); put(vanityF, -0.85, 4.8, 1, 0, 1.2); { const [px, pz] = at(2.9, 4.6); h.lathe(px, 0, pz, [[0.001, 0], [0.24, 0], [0.28, 0.45], [0.001, 0.45]], '#d8c9a3', { pat: ['vband', '#d8c9a3', '#c4b48c', 6, 1] }); }
  // トイレ・浴室（お湯に体の下の方が沈む）
  put(toiletF, 4.45, 7.25, 0, -1);
  { const [px, pz] = at(-4.2, 5.9); const [w, d] = lie(Dw(1, 0), 1.5, 3.2); pit(h, px, pz, w, d, 0.7, 0.2, '#ffffff', { r: 0.1 }, 0.58, 0.34, ['wave', '#7fc4e0', '#b8e2f0', 2, 3]); }
  { const [px, pz] = at(-2.0, 7.5); h.cyl(px, 0, pz, 0.03, 2.1, '#c9ccd0', { seg: 8 }); h.ball(px, 2.05, pz, 0.12, '#c9ccd0', NC); const [qx, qz] = at(-2.0, 6.3); h.cyl(qx, 0, qz, 0.2, 0.38, '#f4f4f4', { seg: 14 }); }
  // 庭：木のさく・花だん・車・自転車
  for (const sgn of [-1, 1]) { const [px, pz] = F.at(D / 2 + 3.2, sgn * 5.5); KIT.planter(h, px, pz, pal); }
  { const [px, pz] = F.at(0, -W / 2 - 3.2); car(h, px, pz, pick(h, CARC), !uX); }
  { const [px, pz] = F.at(-D / 2 - 1.2, -3); bikeAt(h, px, pz, uX, pick(h, TOY), true); }
}
// 銅像：台の上の人の像（手をあげる・考える・胸像）や動物の像。となりに何ものっていない台があることも（台に乗って、像と同じ色にぬってポーズ！）
function statueFig(h, x, y, z, kind, c, yaw) {
  const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -fz, rz = fx, o = { rough: 0.35, pat: ['noise', c, 0, 1, 1] };
  if (kind === 'bust') { h.lump(x, y + 0.35, z, 0.5, 0.35, 0.3, c, { ...o, seed: 5, bump: 0.05, freq: 1, ry: -yaw }); h.ball(x, y + 0.95, z, 0.3, c, o); h.lump(x - fx * 0.05, y + 1.08, z - fz * 0.05, 0.31, 0.2, 0.31, shade(c, 0.9), { ...o, seed: 2, bump: 0.15, freq: 3 }); return; }
  if (kind === 'animal') { // すわった犬
    h.lump(x, y + 0.45, z, 0.32, 0.45, 0.32, c, { ...o, seed: 3, bump: 0.05, freq: 1 }); h.ball(x + fx * 0.15, y + 1.05, z + fz * 0.15, 0.24, c, o); h.ball(x + fx * 0.38, y + 1.0, z + fz * 0.38, 0.1, c, o);
    for (const t of [-1, 1]) { h.ball(x + rx * t * 0.16 + fx * 0.1, y + 1.27, z + rz * t * 0.16 + fz * 0.1, 0.08, c, o); h.cyl(x + rx * t * 0.14 + fx * 0.2, y, z + rz * t * 0.14 + fz * 0.2, 0.07, 0.5, c, { ...o, seg: 8 }); }
    rod(h, [x - fx * 0.3, y + 0.15, z - fz * 0.3], [x - fx * 0.5 + rx * 0.2, y + 0.1, z - fz * 0.5 + rz * 0.2], 0.05, c, o); return;
  }
  // 人：あし・コート・頭・ぼうし・うで
  for (const t of [-1, 1]) h.cyl(x + rx * t * 0.13, y, z + rz * t * 0.13, 0.1, 0.75, c, { ...o, seg: 10 });
  h.lathe(x, y + 0.6, z, [[0.001, 0], [0.34, 0], [0.3, 0.5], [0.26, 0.85], [0.18, 0.95], [0.001, 0.95]], c, { ...o, seg: 16 });
  h.ball(x, y + 1.72, z, 0.2, c, o); h.cyl(x, y + 1.6, z, 0.08, 0.1, c, { ...o, seg: 8 });
  if (kind === 'hero') { // 片手をあげる
    rod(h, [x + rx * 0.3, y + 1.45, z + rz * 0.3], [x + rx * 0.45 + fx * 0.1, y + 2.15, z + rz * 0.45 + fz * 0.1], 0.08, c, o); h.ball(x + rx * 0.47 + fx * 0.1, y + 2.22, z + rz * 0.47 + fz * 0.1, 0.09, c, o);
    rod(h, [x - rx * 0.3, y + 1.45, z - rz * 0.3], [x - rx * 0.36 + fx * 0.05, y + 0.85, z - rz * 0.36 + fz * 0.05], 0.08, c, o);
    h.cyl(x, y + 1.88, z, 0.24, 0.04, c, { ...o, seg: 16 }); h.cyl(x, y + 1.9, z, 0.15, 0.18, c, { ...o, seg: 12 }); // ぼうし
  } else { // 考える（あごに手）
    rod(h, [x + rx * 0.3, y + 1.45, z + rz * 0.3], [x + rx * 0.2 + fx * 0.25, y + 1.15, z + rz * 0.2 + fz * 0.25], 0.08, c, o); rod(h, [x + rx * 0.2 + fx * 0.25, y + 1.15, z + rz * 0.2 + fz * 0.25], [x + fx * 0.18, y + 1.58, z + fz * 0.18], 0.07, c, o);
    rod(h, [x - rx * 0.3, y + 1.45, z - rz * 0.3], [x - rx * 0.32 + fx * 0.15, y + 0.95, z - rz * 0.32 + fz * 0.15], 0.08, c, o); h.lathe(x - rx * 0.33 + fx * 0.2, y + 0.75, z - rz * 0.33 + fz * 0.2, [[0.001, 0], [0.12, 0], [0.13, 0.25], [0.001, 0.25]], c, { ...o, seg: 10 }); // 本
  }
}
function pedestal(h, x, z, s, stone) {
  h.B(x, 0, z, 1.9 * s, 0.3, 1.9 * s, shade(stone, 0.9), { r: 0.04, pat: ['noise', stone, 0, 1, 1] });
  h.B(x, 0.3, z, 1.4 * s, 1.25, 1.4 * s, stone, { r: 0.03, pat: ['noise', stone, 0, 1, 1] });
  h.B(x, 1.55, z, 1.6 * s, 0.15, 1.6 * s, shade(stone, 0.9), { r: 0.04 });
  return 1.7;
}
/* ---- 部屋の中の人形・家具、外の小物（フェンス・車・自販機・電柱・工事中の柵など） ---- */
const CARC = ['#e9edf0', '#1b1d20', '#b8262b', '#2f6fb0', '#9aa1a8', '#f0d040', '#3f9b6a', '#7b5ea7', '#c9573f'];
Object.assign(KIT, {
  dolls(h, x, z, pal, acc) { // 人形たち（ドレスの人形・くま・人形の家）
    const n = 3 + Math.floor(h.rnd() * 3), cs = ['#e0719a', '#b06fd8', '#59b6d8', '#f0d040', '#e04f4f', '#4fbf6a'];
    for (let i = 0; i < n; i++) { const a = i / n * 6.28 + h.rnd() * 0.5, d = 0.5 + h.rnd() * 0.5, s = 0.6 + h.rnd() * 0.6; if (h.rnd() < 0.7) doll(h, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, s, pick(h, cs), a + Math.PI); else bear(h, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, s * 0.7, pick(h, ['#a8693f', '#d9b48a', '#f3c6d4']), a + Math.PI); }
    const c = pick(h, ['#f3c6d4', '#fff1b8', '#c6e3f3']); // 人形の家
    h.B(x, 0, z, 0.9, 0.7, 0.5, c, { r: 0.03, pat: ['cabinet', c, '#e0719a', 2, 2] }); h.cone(x, 0.7, z, 0.62, 0.4, '#e0719a', { seg: 4 });
  },
  robot(h, x, z, pal, acc) { // おもちゃのロボット（大きい。となりに立って同じ色に）
    const c = pick(h, ['#c9ccd0', '#2f6fb0', '#e0413a', '#f0d040']), c2 = pick(h, TOY), s = 1 + h.rnd() * 0.4, fz = h.rnd() < 0.5 ? 1 : -1;
    for (const t of [-1, 1]) { h.B(x + t * 0.18 * s, 0, z, 0.24 * s, 0.5 * s, 0.3 * s, c2, { r: 0.04 }); h.B(x + t * 0.45 * s, 0.6 * s, z, 0.18 * s, 0.55 * s, 0.2 * s, c, { r: 0.05 }); h.ball(x + t * 0.45 * s, 0.55 * s, z, 0.11 * s, c2); }
    h.B(x, 0.5 * s, z, 0.7 * s, 0.65 * s, 0.45 * s, c, { r: 0.08, pat: ['check2', c, shade(c, 0.85), 2, 2] });
    h.B(x, 0.6 * s, z + fz * 0.23 * s, 0.35 * s, 0.25 * s, 0.02, '#2a3038', { nocol: true, pat: ['confetti', '#2a3038', ['#5fe0a0', '#ff3ab8', '#ffd940'], 1, 1], glow: 0.6 });
    h.B(x, 1.17 * s, z, 0.45 * s, 0.38 * s, 0.4 * s, c, { r: 0.08 });
    for (const t of [-1, 1]) h.ball(x + t * 0.1 * s, 1.38 * s, z + fz * 0.2 * s, 0.05 * s, '#5fe0ff', { glow: 1, nocol: true });
    h.cyl(x, 1.55 * s, z, 0.02 * s, 0.25 * s, '#55606b', { seg: 6 }); h.ball(x, 1.82 * s, z, 0.06 * s, '#e0413a', { glow: 0.8 });
  },
  dino(h, x, z, pal, acc) { // 恐竜のおもちゃ（首・しっぽ・せなかのとげ）
    const c = pick(h, ['#4fbf6a', '#3f8f4a', '#b06fd8', '#f08a3c']), al = h.rnd() < 0.5, d = h.rnd() < 0.5 ? 1 : -1, P = (a, y, b = 0) => (al ? [x + a * d, y, z + b] : [x + b, y, z + a * d]);
    h.lump(...P(0, 0.75), al ? 0.75 : 0.42, 0.42, al ? 0.42 : 0.75, c, { seed: seed8(h), bump: 0.06, freq: 1.2, core: 0.93, pat: ['bigcamo', c, [shade(c, 0.8), shade(c, 1.15)], 2, 1] });
    rod(h, P(0.55, 0.95), P(0.95, 1.6), 0.18, c); h.lump(...P(1.1, 1.7), al ? 0.32 : 0.2, 0.2, al ? 0.2 : 0.32, c, { seed: 3, bump: 0.05, freq: 1 });
    rod(h, P(-0.6, 0.75), P(-1.6, 0.3), 0.17, c); rod(h, P(-1.6, 0.3), P(-2.1, 0.2), 0.09, c);
    for (const sa of [-0.3, 0.35]) for (const sb of [-0.25, 0.25]) { const [lx, ly, lz] = P(sa, 0, sb); h.cyl(lx, 0, lz, 0.12, 0.45, shade(c, 0.9), { seg: 10 }); }
    for (let i = 0; i < 5; i++) { const [sx, sy, sz] = P(0.5 - i * 0.3, 1.12 - Math.abs(i - 1) * 0.05); h.cone(sx, sy, sz, 0.1, 0.22, '#f0d040', { seg: 4, nocol: true }); }
  },
  hina(h, x, z, pal, acc) { // ひな人形（赤いだんの上に小さな人形・ぼんぼり）。赤い布と同じ色に塗る
    const al = h.rnd() < 0.5, fz = h.rnd() < 0.5 ? 1 : -1, W = 2.4;
    for (let k = 0; k < 5; k++) { const dd = (2 - k) * 0.35 * fz; h.B(al ? x : x + dd, 0, al ? z + dd : z, al ? W : 0.4 + (4 - k) * 0.0, (k + 1) * 0.3, al ? 0.4 : W, '#c9302a', { r: 0.02, pat: ['fabric', '#c9302a', 0, 3, 1], sink: true }); }
    for (let k = 0; k < 5; k++) for (let i = 0; i < [2, 3, 5, 2, 2][k]; i++) {
      const n = [2, 3, 5, 2, 2][k], u = (i - (n - 1) / 2) * (W / (n + 0.5)), dd = (k - 2) * 0.35 * fz, px = al ? x + u : x + dd, pz = al ? z + dd : z + u, y = (5 - k) * 0.3 - 0.3 + 0.3, c = pick(h, ['#e04f4f', '#2f6fb0', '#f0d040', '#4fbf6a', '#b06fd8', '#f4f4f4']);
      h.cone(px, y, pz, 0.11, 0.22, c, { rt: 0.04, seg: 10, pat: ['dots', c, '#f0d040', 2, 1] }); h.ball(px, y + 0.27, pz, 0.06, '#f4f4f4');
    }
    for (const t of [-1, 1]) { const px = al ? x + t * (W / 2 + 0.25) : x - 0.5 * fz, pz = al ? z - 0.5 * fz : z + t * (W / 2 + 0.25); h.cyl(px, 0, pz, 0.03, 0.7, '#2a3038', { seg: 6 }); h.lathe(px, 0.7, pz, [[0.001, 0], [0.12, 0.02], [0.14, 0.2], [0.1, 0.32], [0.001, 0.32]], '#fff4c2', { glow: 0.6, seg: 10 }); }
  },
  dresser(h, x, z, pal, acc) { // タンス（引き出し・取っ手）と上の小物
    const al = h.rnd() < 0.5, c = pick(h, ['#8a5a33', '#c98f4e', '#f3f1ec', '#6b4a2b']), ht = 1.1 + h.rnd() * 0.6;
    h.B(x, 0, z, al ? 1.6 : 0.6, ht, al ? 0.6 : 1.6, c, { r: 0.03, pat: ['cabinet', c, '#c9a24a', 2, Math.round(ht / 0.3)] });
    h.lathe(x + (al ? 0.5 : 0), ht, z + (al ? 0 : 0.5), [[0.001, 0], [0.08, 0], [0.12, 0.15], [0.05, 0.32], [0.07, 0.36], [0.001, 0.36]], pick(h, ['#59b6d8', '#e0719a', '#f4f4f4']), { seg: 12 });
    h.lump(x + (al ? 0.5 : 0), ht + 0.42, z + (al ? 0 : 0.5), 0.14, 0.1, 0.14, pick(h, ['#ff6fa8', '#ffd940']), { seed: 2, bump: 0.3, freq: 3, nocol: true });
    h.B(x - (al ? 0.4 : 0), ht, z - (al ? 0 : 0.4), al ? 0.3 : 0.05, 0.38, al ? 0.05 : 0.3, '#c9a24a', { r: 0.01, rot: al ? [-0.15, 0, 0] : [0, 0, 0.15] }); // 写真立て
    doll(h, x - (al ? 0.05 : 0), ht, z - (al ? 0 : 0.05), 0.35, pick(h, ['#e0719a', '#59b6d8']), al ? Math.PI / 2 : 0);
  },
  dining(h, x, z, pal, acc) { // 食卓といす4つ・お皿
    const c = pick(h, ['#c98f4e', '#8a5a33', '#f3f1ec']), cc = pick(h, acc);
    table(h, x, z, 1.8, 1.1, c);
    for (const t of [-1, 1]) { chair(h, x - 0.45, z + t * 0.85, cc, -t); chair(h, x + 0.45, z + t * 0.85, cc, -t); }
    for (const t of [-1, 1]) for (const u of [-0.45, 0.45]) h.cyl(x + u, 0.76, z + t * 0.3, 0.14, 0.02, '#f4f4f4', { nocol: true });
    h.lathe(x, 0.76, z, [[0.001, 0], [0.08, 0], [0.12, 0.2], [0.04, 0.3], [0.001, 0.3]], '#59b6d8', { seg: 12 }); // 花びん
  },
  fridgeK(h, x, z, pal, acc) { // 冷蔵庫（とびらの線・取っ手・マグネット）と電子レンジのたな
    const fz = h.rnd() < 0.5 ? 1 : -1, c = pick(h, ['#e9edf0', '#c9d1d6', '#e0413a', '#f3f1ec']), zf = z + fz * 0.41;
    h.B(x, 0, z, 0.9, 1.9, 0.8, c, { r: 0.06 }); h.B(x, 1.25, zf, 0.86, 0.02, 0.02, shade(c, 0.75), NC);
    h.B(x + 0.36, 1.35, zf + fz * 0.02, 0.04, 0.4, 0.04, '#9aa1a8', NC); h.B(x + 0.36, 0.6, zf + fz * 0.02, 0.04, 0.4, 0.04, '#9aa1a8', NC);
    for (let i = 0; i < 4; i++) h.B(x - 0.2 + (i % 2) * 0.22, 1.45 + Math.floor(i / 2) * 0.16, zf + fz * 0.01, 0.1, 0.08, 0.02, pick(h, TOY), NC);
    h.B(x + 1.0, 0, z, 0.8, 0.9, 0.6, '#f4f4f4', { r: 0.03, pat: ['cabinet', '#f4f4f4', '#9aa1a8', 1, 1] }); h.B(x + 1.0, 0.9, z, 0.6, 0.38, 0.45, '#2a3038', { r: 0.03 }); h.B(x + 0.95, 0.96, z + fz * 0.23, 0.38, 0.24, 0.01, '#1e2a36', NC); // 電子レンジ
  },
  washer(h, x, z, pal, acc) { // 洗たく機（丸いまど）・せんたくかご
    const fz = h.rnd() < 0.5 ? 1 : -1, zf = z + fz * 0.36;
    h.B(x, 0, z, 0.7, 0.95, 0.7, '#f4f4f4', { r: 0.06 }); h.cyl(x, 0.48, zf, 0.2, 0.02, '#1e2a36', { nocol: true, rot: [Math.PI / 2, 0, 0] }); h.torus(x, 0.48, zf, 0.22, 0.03, [0, 0, 0], '#9aa1a8', NC);
    h.B(x - 0.15, 0.8, zf + fz * 0.005, 0.3, 0.08, 0.01, '#5fe0a0', { nocol: true, glow: 0.6 });
    const bc = pick(h, ['#59b6d8', '#e0719a', '#f0d040']); h.lathe(x + 0.85, 0, z, [[0.001, 0], [0.25, 0], [0.3, 0.42], [0.27, 0.42], [0.001, 0.38]], bc, { seg: 14, pat: ['vband', bc, shade(bc, 0.8), 6, 1] });
    for (let i = 0; i < 3; i++) h.lump(x + 0.8 + (i - 1) * 0.12, 0.45, z + (i % 2) * 0.1, 0.16, 0.08, 0.13, pick(h, TOY), { seed: seed8(h), bump: 0.3, freq: 2, nocol: true });
  },
  tvset(h, x, z, pal, acc) { // テレビ・テレビ台・ゲーム機・座いす
    const fz = h.rnd() < 0.5 ? 1 : -1, c = pick(h, ['#2b2b2b', '#8a5a33', '#f3f1ec']);
    h.B(x, 0, z, 2.2, 0.5, 0.5, c, { r: 0.03, pat: ['cabinet', c, '#c9ccd0', 2, 1] });
    h.B(x, 0.5, z, 0.5, 0.06, 0.25, '#15171a'); h.B(x, 0.56, z, 0.08, 0.2, 0.06, '#15171a'); h.B(x, 0.72, z, 1.8, 1.05, 0.08, '#111418', { r: 0.03 }); h.B(x, 0.77, z + fz * 0.045, 1.7, 0.95, 0.01, '#1d3550', { nocol: true, glow: 0.3, pat: ['artLand', '#1d3550', ARTPAL[0], 1, 1] });
    h.B(x + 0.75, 0.5, z, 0.3, 0.07, 0.2, '#f4f4f4', { r: 0.02 });
    for (const t of [-1, 1]) { const cc = pick(h, acc); h.B(x + t * 0.6, 0, z + fz * 1.6, 0.6, 0.15, 0.6, cc, { r: 0.05, pat: ['fabric', cc, 0, 1, 1] }); h.B(x + t * 0.6, 0.12, z + fz * 1.88, 0.6, 0.5, 0.1, cc, { r: 0.05, rot: [fz * 0.25, 0, 0] }); }
  },
  lampset(h, x, z, pal, acc) { // フロアランプ・丸いサイドテーブル・ひとりがけソファ
    h.cyl(x, 0, z, 0.22, 0.04, '#2a3038'); h.cyl(x, 0, z, 0.025, 1.6, '#2a3038', { seg: 6 }); h.cone(x, 1.45, z, 0.32, 0.38, '#f5e9c0', { rt: 0.18, glow: 0.7 });
    h.lathe(x + 0.7, 0, z, [[0.001, 0], [0.18, 0], [0.04, 0.05], [0.04, 0.55], [0.3, 0.56], [0.3, 0.6], [0.001, 0.6]], '#8a5a33', { seg: 16, cols: [[0, 0.6, 0.3, 0.3]] });
    h.lathe(x + 0.7, 0.6, z, [[0.001, 0], [0.06, 0], [0.08, 0.1], [0.04, 0.16], [0.001, 0.16]], '#f4f4f4', { seg: 10 });
    sofa(h, x - 0.2, z + 1.1, 1.3, pick(h, acc.concat(pal)), true, -1);
  },
  clock(h, x, z) { // 大きな振り子時計
    const fz = h.rnd() < 0.5 ? 1 : -1, c = pick(h, ['#6b4a2b', '#8a5a33', '#3a2a1c']), zf = z + fz * 0.21;
    h.B(x, 0, z, 0.6, 2.1, 0.4, c, { r: 0.04, pat: ['grain', c, 0, 1, 3] }); h.B(x, 2.1, z, 0.7, 0.12, 0.46, shade(c, 0.85), { r: 0.04 });
    h.cyl(x, 1.7, zf, 0.2, 0.02, '#f4f1e8', { nocol: true, rot: [Math.PI / 2, 0, 0] }); h.torus(x, 1.7, zf, 0.21, 0.025, [0, 0, 0], '#c9a24a', NC);
    h.B(x, 1.7, zf + fz * 0.015, 0.02, 0.14, 0.01, '#1b1d20', NC); h.B(x + 0.05, 1.72, zf + fz * 0.016, 0.1, 0.02, 0.01, '#1b1d20', NC);
    h.B(x, 0.35, zf, 0.4, 1.0, 0.01, '#3a4a5e', { nocol: true, rough: 0.15 }); h.cyl(x, 0.55, zf + fz * 0.01, 0.08, 0.01, '#d9b440', { nocol: true, rot: [Math.PI / 2, 0, 0] }); h.B(x, 0.62, zf + fz * 0.008, 0.015, 0.7, 0.005, '#d9b440', NC);
  },
  aquarium(h, x, z, pal, acc) { // 水そう（水・水草・魚の絵）と台。青い水と同じ色に塗る
    const al = h.rnd() < 0.5, c = pick(h, ['#2a3038', '#8a5a33']);
    h.B(x, 0, z, al ? 1.6 : 0.6, 0.75, al ? 0.6 : 1.6, c, { r: 0.03, pat: ['cabinet', c, '#c9ccd0', 2, 1] });
    h.B(x, 0.75, z, al ? 1.5 : 0.5, 0.75, al ? 0.5 : 1.5, '#7fc4e0', { r: 0.02, glow: 0.35, rough: 0.1, sink: true, pat: ['aqua', '#7fc4e0', ['#f08a3c', '#f0d040', '#e04f4f', '#59b6d8'], 1, 1] });
    h.B(x, 1.5, z, al ? 1.56 : 0.56, 0.06, al ? 0.56 : 1.56, '#2a3038', { r: 0.02 });
  },
  pcdesk(h, x, z, pal, acc) { // パソコンのつくえ：モニター・キーボード・回るいす
    const fz = h.rnd() < 0.5 ? 1 : -1;
    table(h, x, z, 1.5, 0.75, '#e8e1d2');
    h.B(x, 0.76, z + fz * 0.2, 0.25, 0.03, 0.18, '#2a3038'); h.B(x, 0.79, z + fz * 0.22, 0.05, 0.25, 0.05, '#2a3038'); h.B(x, 0.95, z + fz * 0.22, 0.85, 0.5, 0.05, '#15171a', { r: 0.02 });
    h.B(x, 0.99, z + fz * 0.19, 0.8, 0.43, 0.01, '#2f6fb0', { nocol: true, glow: 0.4, pat: ['artGrid', '#2f6fb0', ARTPAL[1], 1, 1] });
    h.B(x, 0.76, z - fz * 0.12, 0.6, 0.03, 0.18, '#2a3038', { r: 0.01 }); h.B(x + 0.45, 0.76, z - fz * 0.1, 0.08, 0.03, 0.12, '#2a3038', { r: 0.02 });
    h.B(x + 0.7, 0, z + fz * 0.1, 0.22, 0.5, 0.45, '#2a3038', { r: 0.02 }); h.ball(x + 0.7, 0.42, z + fz * 0.33, 0.015, '#5fe0ff', { glow: 1, nocol: true }); // パソコン本体
    const cz = z - fz * 0.75; h.cyl(x, 0, cz, 0.3, 0.04, '#2a3038', { seg: 5 }); h.cyl(x, 0.04, cz, 0.04, 0.4, '#8d8f94', { seg: 8 }); h.B(x, 0.44, cz, 0.5, 0.08, 0.5, '#2a3038', { r: 0.04 }); h.B(x, 0.52, cz - fz * 0.23, 0.46, 0.55, 0.06, '#2a3038', { r: 0.05 });
  },
  tallplant(h, x, z) { // 大きな観葉植物（くきと大きな葉）
    h.lathe(x, 0, z, [[0.001, 0], [0.24, 0], [0.32, 0.5], [0.34, 0.55], [0.001, 0.52]], pick(h, ['#f4f4f4', '#2a3038', '#b5651d']), { seg: 16 });
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + h.rnd() * 0.4, hh = 0.9 + h.rnd() * 1.0, lx = x + Math.cos(a) * 0.35, lz = z + Math.sin(a) * 0.35;
      rod(h, [x, 0.5, z], [lx, hh, lz], 0.02, '#3f7a2a', NC);
      h.lump(lx + Math.cos(a) * 0.15, hh + 0.05, lz + Math.sin(a) * 0.15, 0.3, 0.06, 0.2, pick(h, ['#2f7d3a', '#3b8f46', '#25622d']), { seed: seed8(h), bump: 0.2, freq: 2, ry: -a, pat: ['leaf', '#2f7d3a', LEAF, 1, 1] });
    }
  },

  /* ---- 外の小物 ---- */
  fence(h, x, z, pal, acc) { // フェンス：木のさく／金あみ／ブロック塀（うしろや角に隠れる。L字のことも）
    const kind = pick(h, ['wood', 'chain', 'block']), L = 4 + h.rnd() * 3, al = h.rnd() < 0.5, c = kind === 'wood' ? pick(h, ['#f4f4f4', '#b08a5a', '#8a5a33', '#d9c49a']) : kind === 'chain' ? '#b9c0c7' : pick(h, ['#b9b7b0', '#c9c2b0', '#9aa1a8']);
    const seg = (cx, cz, sal, len) => {
      const P = a => (sal ? [cx + a, cz] : [cx, cz + a]);
      if (kind === 'wood') {
        for (let a = -len / 2 + 0.1; a <= len / 2 - 0.05; a += 0.24) { const [px, pz] = P(a); h.B(px, 0, pz, sal ? 0.13 : 0.05, 1.15, sal ? 0.05 : 0.13, c, { nocol: true, r: 0.02 }); h.cone(px, 1.15, pz, 0.07, 0.1, c, { seg: 4, nocol: true }); }
        for (const y of [0.3, 0.85]) { const [px, pz] = P(0); h.B(px + (sal ? 0 : 0.06), y, pz + (sal ? 0.06 : 0), sal ? len : 0.04, 0.1, sal ? 0.04 : len, shade(c, 0.85), NC); }
        const [px, pz] = P(0); h.boxc(px, 0, pz, sal ? len : 0.14, 1.2, sal ? 0.14 : len, { sharp: true });
      } else if (kind === 'chain') {
        for (let a = -len / 2; a <= len / 2 + 0.01; a += len / Math.ceil(len / 2)) { const [px, pz] = P(a); h.cyl(px, 0, pz, 0.05, 1.8, '#8d8f94', { seg: 8 }); }
        const [px, pz] = P(0); h.B(px, 0.05, pz, sal ? len : 0.03, 1.7, sal ? 0.03 : len, c, { pat: ['chain', c, 0, Math.round(len * 1.5), 3], sharp: true }); h.cyl(px, 1.78, pz, 0.03, len, '#8d8f94', { rot: sal ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
      } else {
        const [px, pz] = P(0); h.B(px, 0, pz, sal ? len : 0.2, 1.4, sal ? 0.2 : len, c, { r: 0.02, sink: true, pat: ['blockwall', c, 0, Math.max(1, Math.round(len / 1.2)), 2] }); h.B(px, 1.4, pz, sal ? len + 0.04 : 0.26, 0.08, sal ? 0.26 : len + 0.04, shade(c, 0.85), { r: 0.02 });
      }
    };
    seg(x, z, al, L);
    if (h.rnd() < 0.45) { const e = h.rnd() < 0.5 ? 1 : -1, L2 = 2 + h.rnd() * 2, sd = h.rnd() < 0.5 ? 1 : -1; seg(al ? x + e * L / 2 : x + sd * L2 / 2, al ? z + sd * L2 / 2 : z + e * L / 2, !al, L2); }
  },
  carK(h, x, z, pal, acc) { // 止めてある車（車の下・うしろに隠れる）と駐車場の白線
    const al = h.rnd() < 0.5, n = h.rnd() < 0.45 ? 2 : 1;
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 2.7; car(h, al ? x : x + o, al ? z + o : z, pick(h, CARC), al); }
    for (let i = 0; i <= n; i++) { const o = (i - n / 2) * 2.7; h.B(al ? x : x + o, 0, al ? z + o : z, al ? 5 : 0.1, 0.02, al ? 0.1 : 5, '#f4f4f4', FL); }
    if (h.rnd() < 0.5) { const o = (n / 2) * 2.7 + 0.4; h.B(al ? x - 2.6 : x + o, 0, al ? z + o : z - 2.6, 0.35, 0.15, 0.35, '#f0d040', { r: 0.05 }); } // 車止め
  },
  vendrow(h, x, z, pal, acc) { // 自動販売機のならび・空きかん入れ・ベンチ
    const n = 2 + Math.floor(h.rnd() * 3), fz = h.rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) vending(h, x + (i - (n - 1) / 2) * 1.05, z, pick(h, ['#e0413a', '#2f6fb0', '#f4f4f4', '#3f9b6a', '#f0d040', '#1b1d20']), fz);
    for (const t of [-1, 1]) if (h.rnd() < 0.7) { const bx = x + t * (n / 2 * 1.05 + 0.4); h.lathe(bx, 0, z + fz * 0.1, [[0.001, 0], [0.24, 0], [0.24, 0.85], [0.18, 0.95], [0.001, 0.95]], '#2f6fb0', { seg: 14 }); h.cyl(bx, 0.95, z + fz * 0.1, 0.07, 0.01, '#15171a', NC); }
    if (h.rnd() < 0.5) bench(h, x, z + fz * 1.4, true, WOOD, -fz);
  },
  garbage(h, x, z) { // ゴミ置き場：ゴミぶくろの山・ネット・大きなゴミ箱・看板
    const n = 5 + Math.floor(h.rnd() * 4);
    for (let i = 0; i < n; i++) { const a = h.rnd() * 6.28, d = h.rnd() * 0.7, s = 0.32 + h.rnd() * 0.15, c = pick(h, ['#e8e8e8', '#cfe3f0', '#d9e8c9', '#2a3038']); h.lump(x + Math.cos(a) * d, i > 4 ? 0.5 : s * 0.8, z + Math.sin(a) * d, s, s * 0.9, s, c, { seed: seed8(h), bump: 0.25, freq: 2, core: 0.92, pat: ['noise', c, 0, 1, 1] }); }
    h.B(x, 0.95, z, 1.9, 0.02, 1.7, '#2f6fb0', { nocol: true, pat: ['chain', '#4f7fe0', 0, 4, 4] });
    const gc = pick(h, ['#3f9b6a', '#2f6fb0', '#9aa1a8']); h.B(x + 1.5, 0, z, 1.0, 1.0, 0.8, gc, { r: 0.04, pat: ['vband', gc, shade(gc, 0.85), 3, 1] }); h.B(x + 1.5, 1.0, z, 1.04, 0.06, 0.84, shade(gc, 0.8), { r: 0.02 });
    h.cyl(x - 1.1, 0, z - 0.6, 0.04, 1.4, '#8d8f94', { seg: 6 }); h.B(x - 1.1, 1.2, z - 0.6, 0.6, 0.4, 0.03, '#f4f4f4', { pat: ['hstripe', '#f4f4f4', '#3f9b6a', 1, 3] });
  },
  bikerack(h, x, z, pal, acc) { // 駐輪場：ラックと自転車
    const al = h.rnd() < 0.5, n = 2 + Math.floor(h.rnd() * 3);
    h.cyl(x, 0.3, z, 0.03, n * 0.75 + 0.3, '#8d8f94', { rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.75; bikeAt(h, al ? x + 0.3 : x + o, al ? z + o : z + 0.3, al, pick(h, CARC.concat(acc)), h.rnd() < 0.5); }
  },
  sign(h, x, z, pal, acc) { // 電柱（登れる）・広告の板・標識・カーブミラー
    h.cyl(x, 0, z, 0.2, 7.5, '#9aa1a8', { rt: 0.15, pat: ['noise', '#9aa1a8', 0, 1, 4] });
    h.B(x, 6.6, z, 1.6, 0.12, 0.12, '#55606b'); for (const t of [-0.6, 0.6]) h.cyl(x + t, 6.72, z, 0.04, 0.14, '#f4f4f4', { seg: 6 });
    h.cyl(x + 0.38, 5.2, z, 0.25, 0.7, '#8d8f94'); h.B(x + 0.2, 5.4, z, 0.2, 0.08, 0.08, '#55606b');
    const ac = pick(h, acc); h.B(x, 1.6, z + 0.22, 0.42, 1.4, 0.04, ac, { r: 0.01, sink: true, pat: ['hstripe', ac, '#f4f4f4', 1, 5] }); // 電柱の広告
    for (let k = 0; k < 8; k++) h.B(x - 0.22, 2.6 + k * 0.4, z, 0.2, 0.04, 0.04, '#55606b', { r: 0.01 }); // 足場ボルト
    const sx = x + 1.4; h.cyl(sx, 0, z, 0.04, 2.3, '#c9ccd0', { seg: 6 });
    if (h.rnd() < 0.5) h.cyl(sx, 2.3, z, 0.32, 0.03, '#2f6fb0', { rot: [Math.PI / 2, 0, 0], pat: ['hstripe', '#2f6fb0', '#f4f4f4', 1, 1] });
    else h.cyl(sx, 2.25, z, 0.38, 0.03, '#e0413a', { seg: 3, rot: [Math.PI / 2, 0, Math.PI / 2] });
    if (h.rnd() < 0.6) { const mx = x - 1.3; h.cyl(mx, 0, z, 0.05, 2.5, '#f08a3c', { seg: 8 }); h.torus(mx, 2.7, z + 0.08, 0.32, 0.04, [0, 0, 0], '#f08a3c'); h.cyl(mx, 2.7, z + 0.08, 0.3, 0.02, '#cfe6f0', { nocol: true, rot: [Math.PI / 2, 0, 0], rough: 0.05 }); }
  },
  barricade(h, x, z, pal, acc) { // 工事中：しましまの柵・コーン・矢印の看板・土のう
    const al = h.rnd() < 0.5, P = (a, b) => (al ? [x + a, z + b] : [x + b, z + a]);
    for (let i = 0; i < 2; i++) { const a = (i - 0.5) * 1.6; { const [px, pz] = P(a, 0); h.B(px, 0.8, pz, al ? 1.4 : 0.06, 0.22, al ? 0.06 : 1.4, '#f0d040', { r: 0.02, pat: ['diag', '#f0d040', '#1b1d20', 4, 1] }); h.B(px, 0.35, pz, al ? 1.4 : 0.06, 0.16, al ? 0.06 : 1.4, '#f4f4f4', { r: 0.02, pat: ['diag', '#f4f4f4', '#e0413a', 4, 1] }); }
      for (const t of [-1, 1]) for (const u of [-0.25, 0.25]) { const [lx, lz] = P(a + t * 0.62, u); const [tx, tz] = P(a + t * 0.62, 0); rod(h, [lx, 0, lz], [tx, 1.05, tz], 0.03, '#55606b'); }
      const [bx, bz] = P(a + 0.62, 0); h.ball(bx, 1.15, bz, 0.07, '#ffb46b', { glow: 1.2 }); }
    for (let i = 0; i < 3; i++) { const [px, pz] = P(-1.4 + i * 1.4, 0.9); pylon(h, px, pz); }
    { const [px, pz] = P(2.0, 0.2); h.cyl(px, 0, pz, 0.04, 1.2, '#55606b', { seg: 6 }); h.B(px, 1.2, pz, al ? 0.8 : 0.04, 0.6, al ? 0.04 : 0.8, '#f0d040', { pat: ['zigzag', '#f0d040', '#1b1d20', 2, 1] }); }
    for (let i = 0; i < 4; i++) { const [px, pz] = P(-0.6 + (i % 2) * 0.6, -0.9); h.lump(px, (Math.floor(i / 2)) * 0.25 + 0.14, pz, 0.32, 0.14, 0.22, '#b8a070', { seed: seed8(h), bump: 0.12, freq: 1.5, core: 0.93, pat: ['noise', '#b8a070', 0, 1, 1] }); }
  },
  crates(h, x, z, pal, acc) { // プラスチックのケースの山（すき間に入って、ケースと同じ色に塗る）
    const c = pick(h, ['#f0d040', '#e0413a', '#2f6fb0', '#3f9b6a', '#f08a3c']);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { const ht = 2 + Math.floor(h.rnd() * 4); for (let j = 0; j < ht; j++) h.B(x + (i - 1) * 0.62, j * 0.32, z + (k - 0.5) * 0.48 + (i === 1 && k === 1 ? 0.4 : 0), 0.58, 0.31, 0.44, c, { r: 0.02, pat: ['vband', c, shade(c, 0.7), 2, 1] }); }
  },
  cart(h, x, z, pal, acc) { // ショッピングカート（2台かさねて）
    const al = h.rnd() < 0.5;
    for (let i = 0; i < 2; i++) { const o = i * 0.32, px = al ? x + o : x, pz = al ? z : z + o;
      h.B(px, 0.45, pz, al ? 0.85 : 0.55, 0.45, al ? 0.55 : 0.85, '#c9ccd0', { r: 0.02, pat: ['chain', '#e9edf0', 0, 3, 2] });
      rod(h, al ? [px - 0.45, 0.95, pz - 0.28] : [px - 0.28, 0.95, pz - 0.45], al ? [px - 0.45, 0.95, pz + 0.28] : [px + 0.28, 0.95, pz - 0.45], 0.03, '#e0413a');
      for (const s of [-1, 1]) for (const t of [-1, 1]) h.wheel(px + (al ? s * 0.35 : t * 0.22), 0.06, pz + (al ? t * 0.22 : s * 0.35), 0.06, 0.04, al ? 'z' : 'x', NC);
      h.B(px, 0.06, pz, al ? 0.8 : 0.5, 0.06, al ? 0.5 : 0.8, '#8d8f94', { r: 0.01 }); }
  },
  gasbottle(h, x, z) { // ガスボンベ（くさりでつないで）
    for (let i = 0; i < 3 + Math.floor(h.rnd() * 3); i++) { const px = x + (i % 3) * 0.55 - 0.55, pz = z + Math.floor(i / 3) * 0.55, c = pick(h, ['#9aa1a8', '#2f6fb0', '#3f9b6a', '#e0413a']); h.lathe(px, 0, pz, [[0.001, 0], [0.24, 0], [0.24, 1.2], [0.14, 1.38], [0.06, 1.42], [0.001, 1.42]], c, { seg: 14 }); h.cyl(px, 1.42, pz, 0.05, 0.14, '#c9a24a', { seg: 8 }); }
    rod(h, [x - 0.9, 0.9, z - 0.3], [x + 0.9, 0.9, z - 0.3], 0.02, '#55606b', NC);
  },
  standsign(h, x, z, pal, acc) { // 立て看板（A字）とのぼり旗（看板と同じ色に塗る）
    const al = h.rnd() < 0.5, c = pick(h, acc), p = [pick(h, ['graffiti', 'dots', 'hstripe', 'check2']), c, ['#f4f4f4', '#1b1d20'], 1, 2];
    for (const s of [-1, 1]) h.B(al ? x : x + s * 0.2, 0, al ? z + s * 0.2 : z, al ? 0.75 : 0.04, 1.15, al ? 0.04 : 0.75, c, { r: 0.02, pat: p, rot: al ? [-s * 0.17, 0, 0] : [0, 0, s * 0.17] });
    for (let i = 0; i < 2; i++) { const fx = x + (al ? (i ? 1.0 : -1.0) : 0.6), fz = z + (al ? 0.6 : (i ? 1.0 : -1.0)), fc = pick(h, acc); h.cyl(fx, 0, fz, 0.025, 2.4, '#c9ccd0', { seg: 6 }); h.B(al ? fx + 0.3 : fx, 0.6, al ? fz : fz + 0.3, al ? 0.55 : 0.02, 1.7, al ? 0.02 : 0.55, fc, { pat: [pick(h, ['vband', 'hstripe', 'dots']), fc, '#f4f4f4', 1, 3] }); }
  },
  statue(h, x, z, pal, acc) { // 銅像（ブロンズ・石・大理石）。となりに空いた台があることも（台に乗ってポーズすれば銅像のふり）
    const c = pick(h, ['#8a6a3c', '#6b5a3a', '#4f6b5a', '#c9c2b0', '#f1ede4']), stone = pick(h, ['#b9b7b0', '#d9d2c4', '#8d8f94']), kind = pick(h, ['hero', 'think', 'bust', 'animal']), yaw = pick(h, [0, 1.571, 3.1416, -1.571]);
    const y = pedestal(h, x, z, kind === 'bust' ? 0.75 : 1, stone);
    if (kind === 'bust') h.cyl(x, y, z, 0.25, 0.3, stone, { seg: 12 });
    statueFig(h, x, kind === 'bust' ? y + 0.3 : y, z, kind, c, yaw);
    h.B(x + Math.cos(yaw) * 0.71, 0.75, z + Math.sin(yaw) * 0.71, Math.abs(Math.cos(yaw)) > 0.5 ? 0.02 : 0.6, 0.35, Math.abs(Math.cos(yaw)) > 0.5 ? 0.6 : 0.02, '#c9a24a', { nocol: true, pat: ['hstripe', '#c9a24a', '#8a6a3c', 1, 4] }); // 名前の板
    if (h.rnd() < 0.5) { const e = h.rnd() < 0.5 ? 1 : -1; pedestal(h, x + e * 2.4, z, 1, stone); } // 空いた台
  },
  streetset(h, x, z) { // 消火栓・ポスト・ゴミ箱・車止めのくい
    hydrant(h, x - 0.8, z); mailbox(h, x + 0.4, z); bin(h, x + 1.3, z + 0.2, '#55606b');
    for (let i = 0; i < 3; i++) h.cap(x - 1.6 + i * 0.7, 0, z + 0.9, 0.09, 0.65, '#f0d040', { pat: ['hstripe', '#f0d040', '#2a3038', 1, 2] });
  }
});
// 大きめの小物は、まわりに広めのすき間がないと置かない
export const KIT_R = { gallery: 2.6, hut: 2.0, bigbox: 1.5, pipe: 2.2, hlog: 2.0, closet: 1.9, tent: 2.0, ballpit: 2.3, grass: 1.8, leafpile: 1.6, dumpster: 1.7, booth: 1.4, tiresK: 1.4, mural: 2.4, arch: 2.2, blob: 1.8, rug: 2.0, cubes: 1.6, flowers: 1.8, mush: 1.7, screen: 1.9, sofaK: 1.8, junk: 1.8, bags: 1.6, sculpt: 1.6, coral: 1.9, goods: 1.9, laundry: 2.4, logs: 1.7, parasol: 1.9, hedge: 2.5, rock: 1.9,
  nook: 2.9, blocks: 2.2, outcrop: 3.3, crevice: 3.0, stoneK: 1.9, graffiti: 2.9, stairs: 2.6, patch: 2.3, pot: 1.6, crystal: 1.4, vend: 1.3,
  slideK: 2.6, jungle: 1.9, swing: 2.2, seesaw: 2.0, spring: 2.0, sandbox: 2.6, playhouse: 1.8, tiretun: 2.4, climb: 2.2, merry: 1.7, bars: 2.0, trampoline: 1.7,
  plush: 1.5, kotatsu: 1.9, coats: 1.0, beanbag: 1.4, ladderK: 0.9, cleaning: 1.3, bike: 1.1, garden: 1.5, music: 1.8, study: 1.3, toybox: 1.1, umbrella: 0.6, gym: 2.4, easel: 1.2,
  dolls: 1.3, robot: 1.0, dino: 1.9, hina: 1.7, dresser: 1.1, dining: 1.6, fridgeK: 1.4, washer: 1.2, tvset: 1.9, lampset: 1.6, clock: 0.6, aquarium: 1.1, pcdesk: 1.3, tallplant: 0.9,
  fence: 2.4, carK: 2.8, vendrow: 2.0, garbage: 2.0, bikerack: 1.8, sign: 1.6, barricade: 2.4, crates: 1.2, cart: 0.9, gasbottle: 1.0, standsign: 1.4, streetset: 1.8, statue: 2.0 };

// ---- 街づくり：塗って隠れる・壁にくっついて隠れるための仕掛けがいっぱいの建物 ----
// T = { pal: 建物の色, acc: アクセント色, night, neon, facade: 外壁の模様 }
function bld(h, T, x, z, w, d, ht, fz) { // fz = ±1：表（通り側）が向く z の向き
  const col = pick(h, T.pal), acc = pick(h, T.acc), zf = z + fz * d / 2, mural = h.rnd() < 0.3;
  let ac2 = pick(h, T.acc); if (ac2 === col) ac2 = '#f4f4f4';
  const fk = pick(h, T.facade), fpat = [fk, col, T.neon ? acc : (h.rnd() < 0.5 ? '#f4f4f4' : ac2), Math.max(1, Math.round(w / 2.2)), Math.max(1, Math.round(ht / 2.2))];
  h.B(x, 0, z, w, ht, d, col, { pat: fpat, r: 0.22, glow: T.neon ? 0.45 : 0, sink: true }); // 外壁ぜんたいが模様（体の前の方が少し入る）（スポイトで吸って塗れば溶け込める）
  // 外壁の凹凸：角の柱・屋根のふち・1階と2階のあいだの帯（すき間やくぼみに隠れる）
  const dc = shade(col, 0.82);
  for (const s of [-1, 1]) h.B(x + s * (w / 2 - 0.25), 0, zf + fz * 0.16, 0.5, ht, 0.32, dc, { r: 0.08 });
  h.B(x, ht - 0.4, zf + fz * 0.22, w + 0.3, 0.4, 0.44, dc, { r: 0.08 });
  h.B(x, 3.15, zf + fz * 0.1, w - 1.0, 0.18, 0.2, dc, { r: 0.04 });
  if (mural) { // 大きな壁画
    const mp = [pick(h, ['splat', 'confetti', 'rainbow', 'camo', 'wave', 'graffiti', 'bigcamo']), pick(h, ['#f4f4f4', col, '#2a3038']), T.acc, 3, 2];
    h.B(x, 0.05, zf + fz * 0.15, w - 1.1, Math.min(ht - 0.6, 4.6), 0.3, '#ffffff', { sharp: true, sink: true, pat: mp, glow: T.neon ? 0.6 : 0 }); // 壁画（体の前の方を入れて隠れる）
  } else { // 1階の店先：ショーウィンドウ・とびら・入口の段
    h.B(x - w * 0.12, 0.3, zf + fz * 0.03, w * 0.55, 2.0, 0.06, T.night ? '#ffd98a' : '#9fd0e8', { nocol: true, glow: T.night ? 0.9 : 0.15 });
    h.B(x - w * 0.12, 0.3, zf + fz * 0.07, 0.06, 2.0, 0.04, dc, NC); h.B(x - w * 0.12, 0.22, zf + fz * 0.12, w * 0.58, 0.1, 0.2, dc, { r: 0.02 }); // 窓わく・窓の下の台
    h.B(x + w * 0.3, 0, zf + fz * 0.03, 1.1, 2.2, 0.06, '#3a3d44', NC); h.B(x + w * 0.3 + 0.38, 1.0, zf + fz * 0.08, 0.06, 0.2, 0.04, '#c9ccd0', NC);
    for (const t of [-1, 1]) h.B(x + w * 0.3 + t * 0.78, 0, zf + fz * 0.35, 0.3, 2.35, 0.7, dc, { r: 0.04 }); // 入口の左右のかべ（入口がくぼみになる）
    h.B(x + w * 0.3, 0, zf + fz * 0.35, 1.5, 0.14, 0.7, '#b9b7b0', { r: 0.02 });
  }
  // 日よけ（乗れる・上に隠れられる）
  const aw = w * (0.6 + h.rnd() * 0.25);
  h.B(x, 2.55, zf + fz * 0.8, aw, 0.16, 1.6, acc, { pat: ['vband', acc, '#f4f4f4', Math.max(2, Math.round(aw / 0.8)), 1], r: 0.06, glow: T.neon ? 0.5 : 0 });
  h.B(x, 2.32, zf + fz * 1.58, aw, 0.24, 0.04, acc, { pat: ['zigzag', acc, '#f4f4f4', Math.max(2, Math.round(aw / 0.8)), 1] }); // 日よけのたれ
  // 上の階：窓・ベランダ（乗れる）・室外機（足場）
  for (let y = mural ? 5.3 : 3.6; y < ht - 1.3; y += 2.8) {
    for (const s of [-1, 1]) if (h.rnd() < 0.8) {
      const ww = Math.min(1.4, w * 0.22);
      const wx = x + s * w * 0.25, fr = T.neon ? shade(col, 1.6) : '#d9d2c4', dp = 0.42, wc = T.night ? pick(h, ['#ffd98a', '#9fd0e8', '#2a3038']) : '#9fd0e8';
      h.B(wx, y, zf + fz * 0.03, ww, 1.3, 0.05, wc, { nocol: true, glow: T.night ? 0.7 : 0.1, pat: h.rnd() < 0.5 ? ['vband', wc, shade(wc, 0.82), 2, 1] : undefined }); // ガラス（カーテンのしま）
      h.B(wx, y + 0.62, zf + fz * 0.06, ww, 0.05, 0.03, '#f4f4f4', NC); h.B(wx, y, zf + fz * 0.06, 0.05, 1.3, 0.03, '#f4f4f4', NC); // 窓の桟
      // 窓わくが前に出ていて、窓のところが体の入るくぼみになる（窓台に乗って、窓と同じ色に塗る）
      h.B(wx, y - 0.16, zf + fz * dp / 2, ww + 0.5, 0.16, dp, fr, { r: 0.03 });
      for (const t of [-1, 1]) h.B(wx + t * (ww / 2 + 0.12), y - 0.16, zf + fz * dp / 2, 0.24, 1.64, dp, fr, { r: 0.03 });
      h.B(wx, y + 1.3, zf + fz * dp / 2, ww + 0.5, 0.18, dp, fr, { r: 0.03 });
      if (h.rnd() < 0.3) { h.B(x + s * w * 0.25, y - 0.0, zf + fz * 0.3, ww, 0.3, 0.3, '#8a5a33', { r: 0.03 }); h.lump(x + s * w * 0.25, y + 0.42, zf + fz * 0.3, ww * 0.45, 0.22, 0.17, '#3b8f46', { ...LEAFC, seed: seed8(h), bump: 0.3, freq: 3, pat: ['confetti', '#3b8f46', ['#ff6fa8', '#ffd940', '#ffffff'], 2, 1] }); } // 窓の花だん
    }
    if (h.rnd() < 0.45) {
      const bx = x + (h.rnd() - 0.5) * w * 0.4, bw = Math.min(3, w * 0.45);
      h.B(bx, y - 0.35, zf + fz * 0.65, bw, 0.2, 1.3, '#d8d2c4', { r: 0.06 });
      h.B(bx, y - 0.15, zf + fz * 1.22, bw, 0.75, 0.12, ac2, { pat: [pick(h, ['vband', 'dots', 'hstripe']), ac2, '#f4f4f4', Math.max(2, Math.round(bw / 0.7)), 1], r: 0.05 });
    }
    if (h.rnd() < 0.35) { const ax = x + (h.rnd() - 0.5) * w * 0.7; h.B(ax, y - 0.55, zf + fz * 0.35, 0.95, 0.65, 0.6, '#d9dde0', { r: 0.1 }); h.cyl(ax, y - 0.22, zf + fz * 0.66, 0.24, 0.02, '#55606b', { nocol: true, rot: [Math.PI / 2, 0, 0] }); } // 室外機（ファン）
    if (T.neon) h.B(x, y - 0.75, z, w + 0.1, 0.14, d + 0.1, pick(h, T.acc), { nocol: true, glow: 1.5 }); // ネオンの帯
  }
  // 横に突き出た看板（両面にくっつける）・雨どい
  const sx = h.rnd() < 0.5 ? -1 : 1;
  if (h.rnd() < 0.7) { const sh = Math.min(4.6, ht - 3.4); h.B(x + sx * (w / 2 - 0.45), 3.1, zf + fz * 0.95, 0.36, sh, 1.7, acc, { pat: [pick(h, ['hstripe', 'check2', 'dots', 'rainbow', 'zigzag']), acc, T.neon ? '#ffffff' : ac2, 1, 3], r: 0.1, glow: T.night ? 0.7 : 0, sink: true }); h.B(x + sx * (w / 2 - 0.45), 3.1 + sh, zf + fz * 0.4, 0.08, 0.08, 0.8, '#55606b'); }
  if (h.rnd() < 0.6) { h.cyl(x - sx * (w / 2 - 0.2), 0, zf + fz * 0.18, 0.13, ht, '#8d8f94'); for (let y = 2; y < ht; y += 2.5) h.B(x - sx * (w / 2 - 0.2), y, zf + fz * 0.09, 0.1, 0.08, 0.2, '#6d7076', NC); }
  // 屋上・屋根：建物ごとにちがう形（平らな屋上／切妻／寄棟／ドーム／連続した三角屋根／とんがり屋根の塔／給水塔）
  const parapet = () => { for (const s of [-1, 1]) { h.B(x, ht, z + s * (d / 2 - 0.1), w, 0.6, 0.2, col, { r: 0.06 }); h.B(x + s * (w / 2 - 0.1), ht, z, 0.2, 0.6, d - 0.4, col, { r: 0.06 }); } };
  const rc = T.neon ? pick(h, ['#2a2f4a', '#3a2440', '#1f3a4a']) : pick(h, ['#8a3a2a', '#3f5f8a', '#4a5a4a', '#6b4a3a', '#2f3a4a', '#9a6a3a', '#5a6a7a']);
  const rp = n => ['rooftile', rc, shade(rc, 0.68), Math.max(2, Math.round(n / 1.4)), 3], rs = h.rnd(), eave = () => h.B(x, ht, z, w + 0.6, 0.16, d + 0.6, dc, { r: 0.04 });
  if (rs < 0.28) { // 平らな屋上：低い壁・タンク・室外機・看板
    parapet();
    if (h.rnd() < 0.45) { const tx = x - w * 0.25, tz = z - fz * d * 0.15; h.cyl(tx, ht + 0.3, tz, 0.85, 1.7, '#b9c0c7', { pat: ['hstripe', '#b9c0c7', '#a3aab2', 1, 3] }); for (const s of [-1, 1]) for (const t of [-1, 1]) h.cyl(tx + s * 0.5, ht, tz + t * 0.5, 0.05, 0.3, '#55606b', { seg: 6 }); }
    if (h.rnd() < 0.5) h.B(x + w * 0.2, ht, z, 1.2, 0.8, 1, '#d9dde0', { r: 0.12 });
    if (h.rnd() < 0.4) { // 屋上の大きな看板
      const bw = Math.min(5, w - 1);
      for (const s of [-1, 1]) h.B(x + s * bw * 0.35, ht, z - fz * d * 0.2, 0.18, 1.6, 0.18, '#55606b');
      h.B(x, ht + 1.6, z - fz * d * 0.2, bw, 2.2, 0.3, acc, { pat: [pick(h, ['splat', 'confetti', 'check2', 'wave', 'rainbow']), acc, T.acc, 3, 1], r: 0.08, glow: T.night ? 0.6 : 0, sink: true });
    }
  } else if (rs < 0.46) { // 切妻（むねは通りと平行）・えんとつ
    eave(); const rh = Math.min(3.2, d * 0.45); h.roof(x, ht + 0.16, z, w + 0.5, d + 0.5, rh, w + 0.5, rc, { pat: rp(w) });
    if (h.rnd() < 0.6) h.B(x + w * 0.28, ht, z - fz * d * 0.18, 0.7, rh + 0.9, 0.7, '#b8452f', { r: 0.03, pat: ['brick', '#b8452f', '#9a3a28', 1, 3] });
  } else if (rs < 0.6) { // 寄棟（四方に坂）・天窓
    eave(); const rh = Math.min(2.6, Math.min(w, d) * 0.4); h.roof(x, ht + 0.16, z, w + 0.5, d + 0.5, rh, Math.max(0, w - d), rc, { pat: rp(w) });
    if (h.rnd() < 0.5) h.B(x - w * 0.15, ht + rh * 0.35, z + fz * d * 0.18, 0.9, 0.5, 0.7, '#9fd0e8', { r: 0.05, nocol: true, glow: T.night ? 0.6 : 0.1 });
  } else if (rs < 0.72) { // ドームの屋根（まるい。上に登れる）と、てっぺんの飾り
    parapet(); const r = Math.min(w, d) * 0.36, dc2 = T.neon ? pick(h, T.acc) : pick(h, ['#3f8f8a', '#c9a24a', '#e8dcc8', '#7d8fb3']);
    h.cyl(x, ht, z, r * 1.05, 0.6, col, { seg: 20 }); h.dome(x, ht + 0.6, z, r, r * 0.85, r, dc2, { solid: true, pat: ['vband', dc2, shade(dc2, 0.82), 8, 1], glow: T.neon ? 0.3 : 0 });
    h.cyl(x, ht + 0.6 + r * 0.85, z, 0.06, 1.2, '#c9a24a', { seg: 6 }); h.ball(x, ht + 1.85 + r * 0.85, z, 0.16, '#c9a24a', NC);
  } else if (rs < 0.84) { // 三角屋根がならぶ（工場や駅のような、むねが通りと直角）
    eave(); const n = Math.max(2, Math.round(w / 3)), sw = (w + 0.5) / n;
    for (let i = 0; i < n; i++) h.roof(x - (w + 0.5) / 2 + (i + 0.5) * sw, ht + 0.16, z, sw, d + 0.5, Math.min(1.8, sw * 0.6), d + 0.5, rc, { al: true, pat: rp(d) });
  } else if (rs < 0.93) { // 角にとんがり屋根の塔（時計つき）
    parapet(); const tx = x - (h.rnd() < 0.5 ? -1 : 1) * (w / 2 - 1.4), tz = z + fz * (d / 2 - 1.4), th = 2.6;
    h.B(tx, ht, tz, 2.4, th, 2.4, col, { r: 0.06, pat: fpat }); h.B(tx, ht + th, tz, 2.7, 0.2, 2.7, dc, { r: 0.04 });
    h.roof(tx, ht + th + 0.2, tz, 2.8, 2.8, 2.6, 0, rc, { pat: rp(3) });
    h.cyl(tx, ht + th * 0.6, tz + fz * 1.2, 0.6, 0.08, '#f4f4f4', { rot: [Math.PI / 2, 0, 0], nocol: true, pat: ['clock', '#f4f4f4', '#2a3038', 1, 1] });
  } else { // 給水塔：脚の上の丸いタンクととんがり屋根
    parapet(); const tx = x + w * 0.2, tz = z - fz * d * 0.12;
    for (const s of [-1, 1]) for (const t of [-1, 1]) rod(h, [tx + s * 0.75, ht, tz + t * 0.75], [tx + s * 0.6, ht + 2.2, tz + t * 0.6], 0.07, '#55606b');
    h.B(tx, ht + 2.2, tz, 1.9, 0.12, 1.9, '#55606b'); h.cyl(tx, ht + 2.32, tz, 0.95, 1.8, '#8a5a33', { pat: ['vband', '#8a5a33', '#6b4a2b', 12, 1] }); h.cone(tx, ht + 4.12, tz, 1.1, 1.0, rc);
  }
}
function row(h, T, x0, x1, z, d, fz, hmin, hmax) { // 通りぞいに建物を並べる（ところどころに路地）
  let x = x0;
  while (x1 - x > 4.5) {
    const w = Math.min(x1 - x, 5 + h.rnd() * 4.5); if (x1 - x - w < 4.5) { bld(h, T, (x + x1) / 2, z, x1 - x, d, hmin + h.rnd() * (hmax - hmin), fz); break; }
    bld(h, T, x + w / 2, z, w, d, hmin + h.rnd() * (hmax - hmin), fz); x += w;
    if (h.rnd() < 0.45) { // 路地：木箱・ゴミ箱
      const gw = 1.8 + h.rnd() * 1; KIT.crate(h, x + gw / 2, z + (h.rnd() - 0.5) * d * 0.6); x += gw;
    }
  }
}
function courtyard(h, T, x0, x1, z0, z1) { // 建物のあいだの中庭
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, k = h.rnd();
  if (k < 0.3) { // 模様のタイル広場
    h.F(cx, cz, w - 1, d - 1, '#ffffff', [pick(h, ['check2', 'dots', 'zigzag', 'brick']), pick(h, T.pal), pick(h, T.acc), Math.round(w / 3), Math.round(d / 3)], 1);
    for (const s of [-1, 1]) bench(h, cx + s * w * 0.3, cz, true, WOOD, 1);
    KIT.pole(h, cx, cz, T.pal, T.acc);
  } else if (k < 0.55) { // 小さな公園
    h.F(cx, cz, w - 1, d - 1, '#6fae5a', null, 1);
    tree(h, cx - w * 0.22, cz, 0.9); KIT.bush(h, cx + w * 0.25, cz - d * 0.15); KIT.flowers(h, cx + w * 0.15, cz + d * 0.2);
  } else if (k < 0.78) { // らくがきの路地裏（はりついて隠れる）
    KIT.graffiti(h, cx - w * 0.18, cz, T.pal, T.acc); KIT.blocks(h, cx + w * 0.22, cz, T.pal, T.acc);
  } else { // 屋台
    for (const s of [-1, 1]) {
      const sx = cx + s * w * 0.22, c = pick(h, T.acc);
      table(h, sx, cz, 2.6, 1.2, '#b08a5a', 0.95);
      for (let i = 0; i < 3; i++) h.B(sx - 0.8 + i * 0.8, 0.95, cz, 0.6, 0.35, 0.9, pick(h, TOY), { r: 0.1 });
      for (const t of [-1, 1]) h.B(sx + t * 1.2, 0, cz - 0.5, 0.1, 2.3, 0.1, '#55606b');
      h.B(sx, 2.3, cz, 3, 0.14, 1.6, c, { pat: ['vband', c, '#f4f4f4', 4, 1], glow: T.neon ? 0.5 : 0 });
    }
  }
}
function city(h, T) {
  // 歩道
  for (const s of [-1, 1]) h.B(0, 0, s * 5.2, 72, 0.15, 2.4, '#b9b7b0', { flat: true, pat: ['check2', '#b9b7b0', '#aaa8a1', 36, 1] });
  for (const s of [-1, 1]) for (const t of [-1, 1]) h.B(s * 4.7, 0, t * 16.2, 2.4, 0.15, 21.6, '#b9b7b0', { flat: true, pat: ['check2', '#b9b7b0', '#aaa8a1', 1, 11] });
  for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) h.B(x, 0, 0, 2, 0.02, 0.25, '#ffffff', FL); // 道路の線
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) h.B(s * 8.6, 0, -2.6 + k * 1.05, 1.6, 0.02, 0.5, '#ffffff', FL); // 横断歩道
  // 4つの区画 × 2ブロック：通りぞいの建物・奥の建物・その間の中庭
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const [a, b] of [[6.4, 18.6], [21.4, 34.6]]) {
    const x0 = sx > 0 ? a : -b, x1 = sx > 0 ? b : -a;
    row(h, T, x0, x1, sz * 10.4, 7, -sz, T.hmin, T.hmax); // 通りに面した建物（大通りのほうを向く）
    row(h, T, x0, x1, sz * 23.6, 6.4, -sz, T.hmin + 1, T.hmax + 2); // 奥の建物（中庭のほうを向く）
    courtyard(h, T, x0, x1, sz > 0 ? 14.2 : -20.2, sz > 0 ? 20.2 : -14.2);
    // 路地の入口（ブロックの間）に木箱・たる
    if (a > 10) { KIT.crate(h, sx * 20, sz * 11); KIT.barrel(h, sx * 20, sz * 17, T.pal); }
  }
  // まんなかの噴水広場
  h.F(0, 0, 12, 10, '#ffffff', [pick(h, ['check2', 'brick']), '#e8dcc8', pick(h, T.acc), 6, 5], 1);
  h.cyl(0, 0, 0, 2.8, 0.6, '#b9c0c7', { pat: ['brick', '#b9c0c7', '#9aa1a8', 8, 1] }); h.ring(0, 0.6, 0, 2.75, 0.08, '#d9dde0'); h.cyl(0, 0.6, 0, 2.5, 0.04, T.neon ? '#33eaff' : '#5fa8d8', { nocol: true, glow: T.neon ? 0.9 : 0 });
  h.cap(0, 0, 0, 0.55, 2.2, '#ffffff', { pat: ['rainbow', '#ffffff', T.acc, 2, 3] }); h.cyl(0, 1.5, 0, 1.0, 0.12, '#d9dde0', { rt: 0.8 });
  // 大通りの小物：街灯・ベンチ・自動販売機・バス停・看板柱・ゴミ箱・消火栓・ポスト
  for (let x = -32; x <= 32; x += 8) if (Math.abs(x) > 6) for (const s of [-1, 1]) {
    const z = s * 4.6, k = Math.round(x / 8 + s * 3) % 4;
    h.cyl(x, 0.15, z, 0.16, 0.2, '#444a50'); h.cyl(x, 0.15, z, 0.09, 4, '#444a50'); h.B(x, 4.0, z - s * 0.3, 0.08, 0.08, 0.7, '#444a50'); h.ball(x, 4.35, z - s * 0.55, 0.32, T.neon ? pick(h, T.acc) : '#fff4c2', { glow: 1 });
    if (k === 0) { vending(h, x + 1.6, z + s * 0.4, pick(h, ['#e04f4f', '#2f6fb0', '#f4f4f4', '#3f9b6a']), -s); vending(h, x + 2.7, z + s * 0.4, pick(h, T.acc), -s); bin(h, x + 3.6, z + s * 0.2, '#55606b'); }
    else if (k === 1) { bench(h, x + 2, z, true, WOOD, s); hydrant(h, x - 1.2, z - s * 0.4); }
    else if (k === 2) { // バス停（ポスターの壁・屋根・ベンチ）
      const c = pick(h, T.acc); h.B(x + 2.2, 0.15, z + s * 0.9, 3.2, 2.4, 0.16, c, { pat: [pick(h, ['splat', 'confetti', 'wave', 'dots']), c, T.acc, 2, 1], r: 0.06, glow: T.night ? 0.4 : 0, sink: true });
      h.B(x + 2.2, 2.55, z + s * 0.5, 3.4, 0.14, 1.2, '#55606b'); for (const t of [-1, 1]) h.B(x + 2.2 + t * 1.6, 0.15, z + s * 0.1, 0.08, 2.4, 0.08, '#55606b');
      bench(h, x + 2.2, z + s * 0.45, true, WOOD, s); h.cyl(x + 0.4, 0.15, z - s * 0.3, 0.05, 2.6, '#55606b'); h.cyl(x + 0.4, 2.75, z - s * 0.3, 0.3, 0.05, '#2f6fb0', { rot: [Math.PI / 2, 0, 0] });
    } else { // 看板柱（大きな板にくっつける）・ポスト
      const c = pick(h, T.acc); for (const t of [-1, 1]) h.cyl(x + 2 + t * 1.3, 0.15, z, 0.1, 2.4, '#55606b');
      h.B(x + 2, 2.4, z, 3.2, 1.8, 0.25, c, { pat: [pick(h, ['check2', 'hstripe', 'rainbow', 'camo', 'graffiti']), c, T.acc, 2, 1], r: 0.08, glow: T.night ? 0.5 : 0, sink: true });
      mailbox(h, x - 1.4, z);
    }
  }
  car(h, -14, -1.9, pick(h, T.acc), true); car(h, 12, 1.9, pick(h, T.acc), true); car(h, 27, -1.9, pick(h, T.acc), true); car(h, -27, 1.9, pick(h, T.acc), true);
  // 横の通りに止めてある車（車の下・あいだに隠れる）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const zz of [9.5, 16, 22.5]) if (h.rnd() < 0.7) car(h, sx * 2.1, sz * zz, pick(h, CARC), false);
}

/* ======== 部屋づくり：家具を壁ぞいに、向きをそろえて置く ========
   dir = 家具の正面の向き（[1,0] / [-1,0] / [0,1] / [0,-1]）。frame の a = 正面への向き、b = 横 */
const lie = (dir, a, b) => (dir[0] ? [a, b] : [b, a]); // 正面方向 a・横 b の大きさ → x・z の大きさ
// 部屋の壁：両がわで別の壁紙。ax = 'x' なら z = c の線上に x = a0〜a1。doors = [[中心, 幅, open], ...]（open = わくなしの大きな入口）
//   sA = 小さい側（z / x が小さい側）の [色, [模様, 模様の色, 体が入るか]]、sB = 大きい側
function wallR(h, ax, c, a0, a1, doors, sA, sB, ht = ROOM_WALL) {
  const X = ax === 'x';
  const box = (m, L, off, y0, y1, s) => {
    if (L < 0.04 || y1 - y0 < 0.04) return;
    const [col, pt] = s, o = { r: 0.02 };
    if (pt) { o.pat = [pt[0], col, pt[1], Math.max(1, Math.round(L / 1.6)), Math.max(1, Math.round((y1 - y0) / 1.6))]; if (pt[2]) o.sink = true; }
    h.B(X ? m : c + off, y0, X ? c + off : m, X ? L : 0.2, y1 - y0, X ? 0.2 : L, col, o);
  };
  const seg = (p, q, y0, y1) => { box((p + q) / 2, q - p, -0.1, y0, y1, sA); box((p + q) / 2, q - p, 0.1, y0, y1, sB); };
  let a = a0;
  for (const [dc, dw, open] of doors.slice().sort((u, v) => u[0] - v[0])) {
    seg(a, dc - dw / 2, 0, ht); a = dc + dw / 2;
    if (open) continue;
    seg(dc - dw / 2, dc + dw / 2, 2.6, ht); // ドアの上のかべ
    const fc = '#f4f1e8';
    for (const s of [-1, 1]) h.B(X ? dc + s * (dw / 2 + 0.06) : c, 0, X ? c : dc + s * (dw / 2 + 0.06), X ? 0.12 : 0.5, 2.68, X ? 0.5 : 0.12, fc, { r: 0.02 }); // ドアわく
    h.B(X ? dc : c, 2.6, X ? c : dc, X ? dw + 0.24 : 0.5, 0.12, X ? 0.5 : dw + 0.24, fc, { r: 0.02 });
  }
  seg(a, a1, 0, ht);
}
// 部屋の中へ90度ひらいたドア（ドアのうしろ＝ドアと壁のあいだに隠れられる）。(hx,hz) = ちょうつがい、inDir = 部屋の中への向き、w = ドアの幅
function doorOpen(h, hx, hz, inDir, w, c = '#c9a26b') {
  const cx = hx + inDir[0] * (w / 2 + 0.05), cz = hz + inDir[1] * (w / 2 + 0.05);
  h.B(cx, 0.02, cz, inDir[0] ? w : 0.07, 2.5, inDir[0] ? 0.07 : w, c, { r: 0.02, pat: ['cabinet', c, shade(c, 0.7), 1, 2] });
  h.ball(cx + inDir[0] * (w / 2 - 0.2) + (inDir[0] ? 0 : 0.07), 1.1, cz + inDir[1] * (w / 2 - 0.2) + (inDir[1] ? 0 : 0.07), 0.06, '#c9a24a', NC);
}
// ベッド（dir = 頭から足への向き。頭は壁ぎわ）。下には少しすき間
function bedF(h, x, z, dir, c, W = 2, L = 3, wd = '#6b4a2b') {
  const F = frame(h, x, z, dir), B = F.B;
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) B(sa * (L / 2 - 0.08), sb * (W / 2 - 0.08), 0, 0.12, 0.32, 0.12, wd, { r: 0.02 });
  B(0, 0, 0.3, L, 0.14, W, wd, { r: 0.03, pat: ['grain', wd, 0, 2, 2] });
  B(0, 0, 0.44, L - 0.14, 0.24, W - 0.1, '#efe9df', { r: 0.1, pat: ['fabric', '#efe9df', 0, 3, 3] });
  B(0.3, 0, 0.64, L - 0.74, 0.1, W + 0.04, c, { r: 0.05, pat: ['fabric', c, 0, 3, 3] });
  B(L / 2 - 0.02, 0, 0.42, 0.06, 0.3, W + 0.04, c, { r: 0.03 });
  const np = W > 1.7 ? 2 : 1;
  for (let i = 0; i < np; i++) { const [px, pz] = F.at(-L / 2 + 0.45, np > 1 ? (i - 0.5) * W / 2 : 0), [rx, rz] = lie(dir, 0.24, Math.min(0.42, W / 2 - 0.12)); h.lump(px, 0.79, pz, rx, 0.11, rz, '#ffffff', { seed: seed8(h), bump: 0.12, freq: 1.3, pat: ['fabric', '#ffffff', 0, 2, 1] }); }
  B(-L / 2 - 0.06, 0, 0, 0.12, 1.25, W + 0.12, wd, { r: 0.04, pat: ['grain', wd, 0, 2, 1] });
  B(L / 2 + 0.05, 0, 0, 0.1, 0.64, W + 0.1, wd, { r: 0.03 });
}
function nightF(h, x, z, dir, c) { // ナイトテーブルと電気スタンド
  frame(h, x, z, dir).B(0, 0, 0, 0.5, 0.6, 0.55, c, { r: 0.03, pat: ['cabinet', c, shade(c, 0.6), 1, 2] });
  h.cyl(x, 0.6, z, 0.1, 0.04, '#c9a24a'); h.cyl(x, 0.64, z, 0.02, 0.3, '#c9a24a', { seg: 6 }); h.cone(x, 0.9, z, 0.2, 0.24, '#f5e9c0', { rt: 0.12, glow: 0.5 });
}
function chestF(h, x, z, dir, w, ht, c, top = true) { // たんす・チェスト（引き出し）と上の小物
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.55, ht, w, c, { r: 0.03, pat: ['cabinet', c, shade(c, 0.55), Math.max(1, Math.round(w / 0.7)), Math.max(2, Math.round(ht / 0.32))] });
  if (!top) return;
  const [vx, vz] = F.at(0, -w / 4); h.lathe(vx, ht, vz, [[0.001, 0], [0.09, 0], [0.12, 0.15], [0.06, 0.3], [0.08, 0.36], [0.001, 0.36]], pick(h, TOY), { seg: 12 });
  F.B(-0.12, w / 4, ht, 0.05, 0.3, 0.24, '#c9a24a', { r: 0.01, nocol: true });
  F.B(0.02, w / 4 - 0.35, ht, 0.26, 0.12, 0.3, pick(h, TOY), { r: 0.03 });
}
// つくえ（dir = いすのある側）。kind：'study' スタンドと本／'pc' モニター／'make' 鏡（ドレッサー）
function deskF(h, x, z, dir, c, kind = 'study') {
  const F = frame(h, x, z, dir), w = 1.5, d = 0.7, ac = shade(c, 0.85);
  F.B(0, 0, 0.7, d, 0.06, w, c, { r: 0.02, pat: ['grain', c, 0, 2, 1] });
  F.B(0, w / 2 - 0.23, 0, d - 0.04, 0.7, 0.42, ac, { r: 0.02, pat: ['cabinet', ac, shade(ac, 0.6), 1, 3] });
  F.B(0, -w / 2 + 0.04, 0, d - 0.04, 0.7, 0.05, ac, { r: 0.01 });
  F.B(-d / 2 + 0.04, -0.22, 0.25, 0.04, 0.4, w - 0.55, ac, { r: 0.01 });
  { const [cx, cz] = F.at(0.72, -0.15); chair(h, cx, cz, kind === 'pc' ? '#2a3038' : kind === 'make' ? '#e8dcc8' : c, -dir[1], -dir[0]); }
  if (kind === 'pc') {
    F.B(-0.16, 0, 0.76, 0.22, 0.04, 0.3, '#2a3038'); F.B(-0.18, 0, 0.8, 0.06, 0.24, 0.08, '#2a3038', NC);
    F.B(-0.2, 0, 1.0, 0.05, 0.42, 0.78, '#15171a', { r: 0.02 }); F.B(-0.17, 0, 1.03, 0.02, 0.36, 0.7, '#2a5f9a', { nocol: true, glow: 0.35 });
    F.B(0.12, -0.05, 0.76, 0.17, 0.025, 0.5, '#3a3d44', NC);
  } else if (kind === 'make') {
    F.B(-0.3, 0, 0.76, 0.06, 1.0, 0.8, '#c9a24a', { r: 0.03 }); F.B(-0.26, 0, 0.82, 0.02, 0.88, 0.68, '#cfe6f2', { nocol: true, glow: 0.12 });
    for (let i = 0; i < 4; i++) { const [px, pz] = F.at(0.05, -0.55 + i * 0.12); h.cyl(px, 0.76, pz, 0.04, 0.12 + (i % 2) * 0.06, pick(h, TOY), { seg: 8, nocol: true }); }
  } else {
    const [px, pz] = F.at(-0.15, w / 2 - 0.3); h.cyl(px, 0.76, pz, 0.08, 0.03, '#2a3038'); h.cyl(px, 0.79, pz, 0.015, 0.45, '#2a3038', { seg: 6 }); h.cone(px, 1.2, pz, 0.14, 0.14, '#f5e9c0', { rt: 0.06, glow: 0.5 });
    for (let i = 0; i < 3; i++) F.B(-0.2, -0.45 + i * 0.09, 0.76, 0.22, 0.28, 0.07, pick(h, TOY), NC);
  }
}
const sofaF = (h, x, z, dir, L, c) => sofa(h, x, z, L, c, dir[1] !== 0, -(dir[1] || dir[0])); // 背もたれは壁の側
function tvF(h, x, z, dir, w = 3.2) { // テレビ台・テレビ・スピーカー・ゲーム機
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.6, 0.5, w, '#2b2b2b', { r: 0.04, pat: ['cabinet', '#2b2b2b', '#c9ccd0', Math.max(1, Math.round(w / 0.9)), 1] });
  F.B(-0.05, 0, 0.5, 0.3, 0.05, 0.5, '#15171a'); F.B(-0.05, 0, 0.55, 0.08, 0.2, 0.1, '#15171a');
  const sw = w * 0.72, sh = sw * 0.56;
  F.B(-0.05, 0, 0.72, 0.08, sh, sw, '#111418', { r: 0.03 });
  F.B(0.0, 0, 0.76, 0.02, sh - 0.08, sw - 0.08, '#1d3550', { nocol: true, glow: 0.3, pat: [pick(h, ['artSea', 'artField', 'artLand']), '#1d3550', pick(h, ARTPAL), 1, 1] });
  for (const s of [-1, 1]) { const [px, pz] = F.at(0, s * (w / 2 - 0.22)); h.cyl(px, 0.5, pz, 0.13, 0.75, '#2a3038', { seg: 12 }); }
  F.B(0.12, w * 0.22, 0.5, 0.25, 0.06, 0.35, '#f4f4f4', { r: 0.02, nocol: true });
}
// 台所のカウンター：下の戸だな・天板・流し・コンロ・換気扇・つり戸だな。o.sink / o.stove = 横の位置
function counterF(h, x, z, dir, len, o = {}) {
  const F = frame(h, x, z, dir), c = o.c || '#f4f4f4';
  F.B(0, 0, 0, 0.65, 0.9, len, c, { r: 0.02, pat: ['cabinet', c, '#9aa1a8', Math.max(1, Math.round(len / 0.6)), 1] });
  F.B(0.02, 0, 0.9, 0.7, 0.05, len + 0.02, o.top || '#3a3a3a', { r: 0.01 });
  if (o.sink != null) { F.B(0.05, o.sink, 0.951, 0.42, 0.02, 0.7, '#c9ccd0', NC); const [px, pz] = F.at(-0.22, o.sink); h.cyl(px, 0.95, pz, 0.03, 0.32, '#c9ccd0', { seg: 8 }); }
  const ups = [];
  if (o.stove != null) {
    for (const s of [-1, 1]) { const [px, pz] = F.at(0.05, o.stove + s * 0.28); h.ring(px, 0.97, pz, 0.14, 0.022, '#2a3038'); }
    F.B(-0.05, o.stove, 1.6, 0.55, 0.3, 0.9, '#c9ccd0', { r: 0.03 }); ups.push([-len / 2, o.stove - 0.55], [o.stove + 0.55, len / 2]);
  } else ups.push([-len / 2, len / 2]);
  for (const [b0, b1] of ups) if (b1 - b0 > 0.4) F.B(-0.15, (b0 + b1) / 2, 1.6, 0.35, 0.75, b1 - b0, c, { r: 0.02, pat: ['cabinet', c, '#9aa1a8', Math.max(1, Math.round((b1 - b0) / 0.6)), 1] });
}
function fridgeF(h, x, z, dir) { // 冷蔵庫（とびらのすき間・取っ手・マグネット）
  const F = frame(h, x, z, dir), c = '#d5dbe0';
  F.B(0, 0, 0, 0.75, 1.95, 0.85, c, { r: 0.06 });
  F.B(0.38, 0, 1.25, 0.02, 0.02, 0.78, '#9aa1a8', NC);
  for (const [y, hh] of [[0.45, 0.55], [1.4, 0.4]]) F.B(0.4, 0.32, y, 0.05, hh, 0.05, '#9aa1a8', NC);
  for (let i = 0; i < 3; i++) F.B(0.38, -0.25 + i * 0.15, 1.5 + (i % 2) * 0.12, 0.02, 0.08, 0.08, pick(h, TOY), NC);
}
function cupboardF(h, x, z, dir, w, c) { // 食器だな（下は戸だな、上はガラスの中にお皿）
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.5, 0.9, w, c, { r: 0.02, pat: ['cabinet', c, shade(c, 0.6), Math.max(1, Math.round(w / 0.6)), 1] });
  F.B(0.02, 0, 0.9, 0.54, 0.04, w + 0.04, shade(c, 0.85));
  F.B(-0.06, 0, 0.94, 0.38, 1.25, w, c, { r: 0.02 });
  F.B(0.14, 0, 1.0, 0.02, 1.12, w - 0.12, '#e8f1f4', { nocol: true, pat: ['books', '#e8f1f4', ['#f4f4f4', '#e0d8c8', '#7d8fb3', '#c9573f'], Math.max(1, Math.round(w / 0.8)), 1] });
}
function toiletF(h, x, z, dir) { // トイレ（タンク・便器・ふた・紙）
  const F = frame(h, x, z, dir), W = '#f4f4f4';
  F.B(-0.32, 0, 0.42, 0.22, 0.42, 0.52, W, { r: 0.05 });
  const [px, pz] = F.at(0.04, 0); h.lathe(px, 0, pz, [[0.001, 0], [0.15, 0], [0.13, 0.15], [0.22, 0.38], [0.24, 0.42], [0.001, 0.42]], W, { seg: 18 });
  F.B(0.02, 0, 0.42, 0.5, 0.04, 0.44, '#e9edf0', { r: 0.03 });
  const [rx, rz] = F.at(-0.3, 0.6); h.cyl(rx, 0.7, rz, 0.06, 0.12, '#ffffff', { seg: 10, nocol: true, rot: dir[0] ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
}
function vanityF(h, x, z, dir, w) { // 洗面台（洗面ボウル・じゃ口・鏡・びん）
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.55, 0.85, w, '#f4f4f4', { r: 0.02, pat: ['cabinet', '#f4f4f4', '#9aa1a8', Math.max(1, Math.round(w / 0.6)), 1] });
  F.B(0.01, 0, 0.85, 0.58, 0.06, w + 0.02, '#e9edf0', { r: 0.02 });
  const [px, pz] = F.at(0.04, 0); h.cyl(px, 0.91, pz, 0.22, 0.015, '#c9d6de', NC); const [fx, fz] = F.at(-0.2, 0); h.cyl(fx, 0.91, fz, 0.03, 0.25, '#c9ccd0', { seg: 8 });
  F.B(-0.25, 0, 1.15, 0.05, 0.95, w * 0.85, '#c9a24a', { r: 0.02 }); F.B(-0.22, 0, 1.2, 0.02, 0.85, w * 0.85 - 0.1, '#cfe6f2', { nocol: true, glow: 0.12 });
  for (let i = 0; i < 4; i++) { const [bx, bz] = F.at(-0.12, w / 2 - 0.2 - i * 0.14); h.cyl(bx, 0.91, bz, 0.04, 0.14 + (i % 3) * 0.05, pick(h, ['#e0719a', '#59b6d8', '#f4f4f4', '#4fbf6a']), { seg: 8, nocol: true }); }
}
function washerF(h, x, z, dir, stack) { // 洗たく機（丸いまど）。stack なら上にかんそう機
  const F = frame(h, x, z, dir), rot = dir[0] ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  for (let k = 0; k < (stack ? 2 : 1); k++) {
    const y = k * 0.92; F.B(0, 0, y, 0.65, 0.9, 0.65, '#f4f4f4', { r: 0.06 });
    const [px, pz] = F.at(0.33, 0); h.cyl(px, y + 0.42, pz, 0.22, 0.03, '#9fb8c8', { rot, nocol: true }); h.cyl(px, y + 0.42, pz, 0.16, 0.036, '#5f7f9a', { rot, nocol: true });
    F.B(0.31, 0, y + 0.76, 0.05, 0.09, 0.5, '#c9ccd0', NC);
  }
}
function pianoF(h, x, z, dir, c = '#15171a') { // アップライトピアノといす
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.6, 1.3, 1.6, c, { r: 0.03, rough: 0.2 });
  F.B(0.42, 0, 0.68, 0.3, 0.1, 1.56, c, { r: 0.02, rough: 0.2 });
  F.B(0.43, 0, 0.78, 0.26, 0.02, 1.44, '#f4f4f4', { nocol: true, pat: ['vband', '#f4f4f4', '#15171a', 24, 1] });
  F.B(0.32, 0, 0.95, 0.04, 0.3, 0.5, '#f4f1e8', NC);
  F.B(1.05, 0, 0, 0.4, 0.48, 0.9, c, { r: 0.03 });
}
function shoeboxF(h, x, z, dir, w, ht = 1.0, c = '#c9a26b') { // くつ箱と上の小物
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.4, ht, w, c, { r: 0.02, pat: ['cabinet', c, shade(c, 0.6), Math.max(1, Math.round(w / 0.5)), Math.max(1, Math.round(ht / 0.5))] });
  const [vx, vz] = F.at(0, w / 3); h.lathe(vx, ht, vz, [[0.001, 0], [0.08, 0], [0.11, 0.2], [0.05, 0.36], [0.001, 0.36]], '#3f9b6a', { seg: 12 });
  F.B(0, -w / 4, ht, 0.25, 0.04, 0.4, '#5a3c28', NC);
}
function shoes(h, x, z, n) { for (let i = 0; i < n; i++) { const c = pick(h, ['#2a3038', '#e04f4f', '#f4f4f4', '#8a5a33', '#4f7fe0']), px = x + (h.rnd() - 0.5) * 1.6, pz = z + (h.rnd() - 0.5) * 1.6; for (const s of [-1, 1]) h.B(px + s * 0.09, 0.02, pz, 0.12, 0.1, 0.28, c, { r: 0.04, nocol: true }); } }
function bunkF(h, x, z, dir, c) { // 2段ベッド（上の段の柵・はしご）。上の段に登れる
  const F = frame(h, x, z, dir), L = 2.6, W = 1.25;
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) F.B(sa * (L / 2 - 0.05), sb * (W / 2 - 0.05), 0, 0.1, 2.15, 0.1, c, { r: 0.02 });
  for (const y of [0.18, 1.45]) {
    F.B(0, 0, y, L, 0.14, W, c, { r: 0.02 });
    F.B(0, 0, y + 0.14, L - 0.12, 0.18, W - 0.12, '#efe9df', { r: 0.07, pat: ['fabric', '#efe9df', 0, 2, 1] });
    const q = pick(h, TOY); F.B(0.25, 0, y + 0.3, L - 0.62, 0.07, W - 0.04, q, { r: 0.03, pat: ['dots', q, '#f4f4f4', 3, 2] });
  }
  F.B(-0.15, W / 2 - 0.05, 1.77, L - 0.75, 0.24, 0.06, c, { r: 0.02 }); F.B(0, -W / 2 + 0.05, 1.77, L - 0.1, 0.24, 0.06, c, { r: 0.02 });
  for (const ab of [L / 2 - 0.62, L / 2 - 0.17]) F.B(ab, W / 2 + 0.05, 0, 0.05, 1.9, 0.05, c, { r: 0.01 });
  for (let i = 0; i < 4; i++) F.B(L / 2 - 0.4, W / 2 + 0.05, 0.42 + i * 0.36, 0.45, 0.04, 0.04, c, NC);
}
function cribF(h, x, z, dir) { // ベビーベッド（さくの模様・メリー）
  const F = frame(h, x, z, dir), L = 1.4, W = 0.8, c = '#f3f1ec';
  for (const s of [-1, 1]) F.B(s * (W / 2 - 0.03), 0, 0.08, 0.06, 0.9, L, c, { r: 0.02, pat: ['vband', c, '#d9d2c4', 10, 1] });
  for (const s of [-1, 1]) F.B(0, s * (L / 2 - 0.03), 0, W, 1.08, 0.06, c, { r: 0.02 });
  F.B(0, 0, 0.35, W - 0.12, 0.14, L - 0.12, '#f6e1ea', { r: 0.05, pat: ['dots', '#f6e1ea', '#ffffff', 2, 1] });
  bear(h, x, 0.49, z, 0.3, '#d9b48a', Math.atan2(dir[1], dir[0]));
  const [mx, mz] = F.at(-W / 2 + 0.03, 0); rod(h, [mx, 1.0, mz], [mx, 1.7, mz], 0.02, '#f4f4f4', NC);
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; h.ball(mx + Math.cos(a) * 0.25, 1.45, mz + Math.sin(a) * 0.25, 0.07, TOY[i], NC); }
}
function oshiireF(h, x, z, dir, w) { // おしいれ：上の段にふとん。下の段はすき間に入れる。ふすまが半分しまっている
  const F = frame(h, x, z, dir), D = 0.9, H = 2.4, c = '#e6d8b8', fr = '#8a6a4a';
  F.B(-D / 2 + 0.04, 0, 0, 0.08, H, w, c);
  for (const s of [-1, 1]) F.B(0, s * (w / 2 - 0.04), 0, D, H, 0.08, c);
  F.B(0, 0, H - 0.08, D, 0.08, w, c);
  F.B(0.02, 0, 1.15, D - 0.04, 0.08, w - 0.16, fr, { r: 0.01 });
  for (let k = 0; k < 3; k++) { const q = pick(h, ['#f4f4f4', '#7d8fb3', '#e0719a', '#f0d040', '#8fbf7a']); F.B(-0.02, -w / 4, 1.23 + k * 0.2, 0.75, 0.2, w / 2 - 0.2, q, { r: 0.08, pat: ['fabric', q, 0, 2, 1] }); }
  { const [px, pz] = F.at(-0.1, w / 4 + 0.1); carton(h, px, 1.23, pz, 0.6, 0.45, 0.6, CARD[0]); }
  { const [px, pz] = F.at(-0.1, w / 2 - 0.45); carton(h, px, 0, pz, 0.55, 0.5, 0.55, CARD[2]); }
  F.B(D / 2 + 0.03, w / 4, 0, 0.05, H - 0.1, w / 2, '#f3ead8', { r: 0.01, pat: ['artField', '#f3ead8', ARTPAL[4], 1, 1] });
}
function tokonomaF(h, x, z, dir, w) { // 床の間：一段高い板・かけじく・花びん・床柱
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.9, 0.15, w, '#8a5a33', { r: 0.02, pat: ['grain', '#8a5a33', 0, 2, 1] });
  F.B(-0.41, 0, 0.6, 0.04, 1.7, 0.75, '#f3ead8', { sharp: true, sink: true, pat: ['artNight', '#f3ead8', ARTPAL[3], 1, 1] });
  const [px, pz] = F.at(0.05, w / 2 - 0.5); h.lathe(px, 0.15, pz, [[0.001, 0], [0.12, 0], [0.16, 0.2], [0.08, 0.42], [0.1, 0.48], [0.001, 0.48]], '#3f5f8a', { seg: 14 });
  rod(h, [px, 0.6, pz], [px, 1.15, pz], 0.02, '#5a3c28', NC); for (let i = 0; i < 6; i++) h.ball(px + (h.rnd() - 0.5) * 0.4, 0.95 + h.rnd() * 0.3, pz + (h.rnd() - 0.5) * 0.4, 0.06, '#f3a6c4', NC);
  const [qx, qz] = F.at(0.38, w / 2 + 0.05); h.cyl(qx, 0, qz, 0.09, 2.6, '#6b4a2b', { seg: 10 });
}
function shojiF(h, x, z, dir, w) { frame(h, x, z, dir).B(0.03, 0, 0, 0.06, 2.3, w, '#f4efe4', { sharp: true, sink: true, pat: ['shoji', '#f4efe4', '#8a6a4a', Math.max(1, Math.round(w / 0.9)), 2] }); } // 壁のしょうじ（体の前の方が少し入る）
function byobuF(h, x, z, dir) { // びょうぶ（ジグザグの4枚。うしろに隠れる）
  const F = frame(h, x, z, dir), P = pick(h, ARTPAL), k = pick(h, ['artLand', 'artFlower', 'artField']);
  for (let i = 0; i < 4; i++) { const [px, pz] = F.at((i % 2) * 0.16, (i - 1.5) * 0.5), yaw = (i % 2 ? 0.35 : -0.35); h.B(px, 0.02, pz, dir[0] ? 0.04 : 0.54, 1.6, dir[0] ? 0.54 : 0.04, P[0], { rot: [0, yaw, 0], pat: [k, P[0], P, 1, 1] }); }
}
const andonF = (h, x, z) => { h.B(x, 0, z, 0.42, 0.75, 0.42, '#fff4d0', { glow: 0.45, r: 0.02, pat: ['shoji', '#fff4d0', '#8a6a4a', 1, 1] }); }; // あんどん
// 階段：dir = のぼる向き。(x,z) = 一番下の段の手前のまん中。上におどり場。段の下はあいていて、もぐれる
function stairsR(h, x, z, dir, n, w, rise = 0.23, run = 0.52, land = 1.9, c = '#b98d5c') {
  const F = frame(h, x, z, dir);
  for (let i = 0; i < n; i++) F.B((i + 0.5) * run, 0, i * rise, run + 0.02, rise, w, c, { r: 0.02, pat: ['grain', c, 0, 1, 1] });
  F.B(n * run + land / 2, 0, (n - 1) * rise, land, rise, w, c, { r: 0.02, pat: ['grain', c, 0, 1, 2] });
  const rc = '#6b4a2b', side = w / 2 + 0.03, A = (a, y) => { const [px, pz] = F.at(a, side); return [px, y, pz]; };
  rod(h, A(0.1, 0.95), A(n * run, n * rise + 0.95), 0.035, rc); rod(h, A(n * run, n * rise + 0.95), A(n * run + land - 0.05, n * rise + 0.95), 0.035, rc);
  for (const [a, y] of [[0.1, 0], [n * run, n * rise], [n * run + land - 0.05, n * rise]]) rod(h, A(a, y), A(a, y + 0.95), 0.04, rc);
}
// 金属のたな（物がぎっしり。たなぜんたいが当たる）
function rackF(h, x, z, dir, len, ht = 2.0, items = 'pantry') {
  const F = frame(h, x, z, dir), d = 0.55, mc = '#9aa1a8', [W, D] = lie(dir, d, len);
  h.boxc(x, 0, z, W, ht, D);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) F.B(sa * (d / 2 - 0.03), sb * (len / 2 - 0.03), 0, 0.04, ht, 0.04, mc, NC);
  const lv = Math.max(3, Math.round(ht / 0.55)), cols = items === 'pantry' ? ['#c7a36a', '#e04f4f', '#f0d040', '#f4f4f4', '#4fbf6a', '#d98a2b'] : items === 'bath' ? ['#f4f4f4', '#59b6d8', '#e0719a', '#c6e3f3'] : ['#c7a36a', '#b8935a', '#2f6fb0', '#55606b', '#3f9b6a'];
  for (let k = 0; k < lv; k++) {
    const y = 0.08 + k * (ht - 0.1) / (lv - 1); F.B(0, 0, y, d, 0.03, len, mc, NC);
    if (k === lv - 1) break;
    const n = Math.min(8, Math.max(2, Math.round(len / 0.55))), gap = (ht - 0.1) / (lv - 1);
    for (let i = 0; i < n; i++) { if (h.rnd() < 0.18) continue; const iw = 0.2 + h.rnd() * 0.28, ih = Math.min(gap - 0.08, 0.15 + h.rnd() * 0.3), b = -len / 2 + (i + 0.5) * len / n, c = pick(h, cols);
      if (h.rnd() < 0.35) { const [px, pz] = F.at(0, b); h.cyl(px, y + 0.03, pz, iw * 0.4, ih, c, { seg: 10, nocol: true }); } else F.B(0, b, y + 0.03, d - 0.12, ih, iw, c, { r: 0.02, nocol: true, pat: c === '#c7a36a' || c === '#b8935a' ? ['carton', c, 0, 1, 1] : undefined }); }
  }
}
function consoleF(h, x, z, dir, w) { // ろうかの細いテーブル・花びん・写真立て
  const [W, D] = lie(dir, 0.4, w); table(h, x, z, W, D, '#8a5a33', 0.8);
  const F = frame(h, x, z, dir), [vx, vz] = F.at(0, -w / 3);
  h.lathe(vx, 0.8, vz, [[0.001, 0], [0.09, 0], [0.13, 0.18], [0.06, 0.38], [0.09, 0.45], [0.001, 0.45]], pick(h, ['#2f6fb0', '#c9573f', '#f4f4f4']), { seg: 12 });
  for (let i = 0; i < 5; i++) h.ball(vx + (h.rnd() - 0.5) * 0.3, 1.3 + h.rnd() * 0.2, vz + (h.rnd() - 0.5) * 0.3, 0.07, pick(h, TOY), NC);
  F.B(-0.08, w / 6, 0.8, 0.04, 0.28, 0.22, '#c9a24a', NC); F.B(-0.06, w / 3, 0.8, 0.04, 0.22, 0.18, '#2a3038', NC);
}
function pingpongF(h, x, z, dir) { // 卓球台（下にもぐれる）
  const [W, D] = lie(dir, 2.74, 1.525), F = frame(h, x, z, dir); table(h, x, z, W, D, '#2f6b4f', 0.76);
  F.B(0, 0, 0.761, 2.7, 0.005, 0.03, '#f4f4f4', NC); F.B(0, 0, 0.76, 0.02, 0.16, 1.7, '#f4f4f4', NC);
  for (const s of [-1, 1]) { const [px, pz] = F.at(s * 0.9, 0.3 * s); h.cyl(px, 0.76, pz, 0.08, 0.02, '#e04f4f', NC); }
}
function treadmillF(h, x, z, dir) { // ランニングマシン（前に操作パネル）
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 1.9, 0.18, 0.85, '#2a3038', { r: 0.04 }); F.B(0.08, 0, 0.18, 1.6, 0.02, 0.6, '#15171a', NC);
  for (const s of [-1, 1]) { const [px, pz] = F.at(-0.82, s * 0.4); rod(h, [px, 0.18, pz], [px, 1.25, pz], 0.035, '#55606b'); }
  F.B(-0.86, 0, 1.2, 0.25, 0.14, 0.86, '#2a3038', { r: 0.03 }); F.B(-0.82, 0, 1.34, 0.12, 0.02, 0.4, '#3dff9a', { nocol: true, glow: 0.4 });
}
function punchbagF(h, x, z) { // サンドバッグ（スタンドにつるす）
  h.B(x - 0.5, 0, z, 0.9, 0.08, 0.9, '#2a3038', { r: 0.03 }); h.cyl(x - 0.8, 0.08, z, 0.05, 2.4, '#55606b', { seg: 10 }); h.B(x - 0.4, 2.42, z, 0.9, 0.08, 0.1, '#55606b');
  rod(h, [x, 2.42, z], [x, 1.75, z], 0.015, '#c9ccd0', NC); h.cyl(x, 0.65, z, 0.3, 1.1, '#c9302a', { seg: 16, pat: ['hstripe', '#c9302a', '#2a3038', 1, 6] });
}
function clothesF(h, x, z, dir, len) { // 服をかけたハンガーラック（服のうしろに隠れる。服ぜんたいが当たる）
  const F = frame(h, x, z, dir), [W, D] = lie(dir, 0.5, len);
  F.B(0, 0, 1.95, 0.04, 0.04, len, '#c9ccd0', NC); for (const s of [-1, 1]) F.B(0, s * len / 2, 0, 0.06, 2.0, 0.06, '#c9ccd0');
  const n = Math.floor(len / 0.3);
  for (let i = 0; i < n; i++) { const c = pick(h, ['#2a3038', '#7d8fb3', '#c9573f', '#e8dcc8', '#3f5f8a', '#8fbf7a', '#e0719a', '#f4f4f4']), ln = 0.7 + h.rnd() * 0.9; F.B((h.rnd() - 0.5) * 0.06, -len / 2 + (i + 0.5) * len / n, 1.9 - ln, 0.42, ln, 0.1, c, { r: 0.04, nocol: true, pat: ['fabric', c, 0, 1, 2] }); }
  h.boxc(x, 0.45, z, W * 0.8, 1.5, D);
}
function globeF(h, x, z) { h.cyl(x, 0, z, 0.2, 0.05, '#5a3c28'); h.cyl(x, 0.05, z, 0.03, 0.55, '#5a3c28', { seg: 6 }); h.ball(x, 0.95, z, 0.33, '#2f6fb0', { pat: ['artSea', '#2f6fb0', ['#4fbf6a', '#59b6d8', '#f4f4f4', '#2f6fb0'], 2, 1] }); h.torus(x, 0.95, z, 0.38, 0.02, [0, 0, 0.4], '#c9a24a', NC); } // 地球儀

// 部屋の中で使う道具（RM = 部屋の内がわ、put = 壁ぎわに家具を向きをそろえて置く など）
function roomTools(h, HX, HZ) {
  const RM = (x0, x1, z0, z1) => ({ x0: x0 <= -HX ? x0 : x0 + 0.2, x1: x1 >= HX ? x1 : x1 - 0.2, z0: z0 <= -HZ ? z0 : z0 + 0.2, z1: z1 >= HZ ? z1 : z1 - 0.2 });
  const at = (R, s, t, dp) => (s === 'n' || s === 's') ? { x: t >= 0 ? R.x0 + t : R.x1 + t, z: s === 'n' ? R.z0 + dp / 2 : R.z1 - dp / 2, dir: [0, s === 'n' ? 1 : -1] }
    : { x: s === 'w' ? R.x0 + dp / 2 : R.x1 - dp / 2, z: t >= 0 ? R.z0 + t : R.z1 + t, dir: [s === 'w' ? 1 : -1, 0] };
  const put = (R, s, t, dp, fn, ...a) => { const p = at(R, s, t, dp); fn(h, p.x, p.z, p.dir, ...a); return p; };
  const shelf = (R, s, t, len, ht, c, dp = 0.8) => { const p = at(R, s, t, dp); bookshelf(h, p.x, p.z, p.dir[0] ? dp : len, p.dir[0] ? len : dp, ht, c); };
  const win = (R, s, t, w) => { const p = at(R, s, t, 0); windowIn(h, p.x, p.z, p.dir[0], p.dir[1], w); };
  const art = (R, s, t, y0, w, ht) => { const p = at(R, s, t, 0); pic(h, p.x, y0, p.z, p.dir[0], p.dir[1], w, ht); };
  const FL = (x0, x1, z0, z1, pat) => h.F((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, pat);
  const wood = (c, x0, x1, z0, z1) => FL(x0, x1, z0, z1, ['floorwood', c, 0, Math.max(1, Math.round((x1 - x0) / 3)), Math.max(1, Math.round((z1 - z0) / 3))]);
  const tile = (c, g, x0, x1, z0, z1) => FL(x0, x1, z0, z1, ['tile', c, g, Math.max(1, Math.round((x1 - x0) / 1.4)), Math.max(1, Math.round((z1 - z0) / 1.4))]);
  const rug = (x, z, w, d, k, c1, c2) => h.F(x, z, w, d, 0, [k, c1, c2, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2))], true);
  return { RM, at, put, shelf, win, art, FL, wood, tile, rug };
}

/* ======== 学校の家具 ======== */
// 児童のつくえ（天板・物入れ・脚）といす（fz = 座った人が向く向き）
function schoolDesk(h, x, z, c, fz = -1) {
  h.B(x, 0.68, z, 1.3, 0.06, 0.8, '#d7b47c', { r: 0.02, pat: ['grain', '#d7b47c', 0, 1, 1] }); h.B(x, 0.5, z, 1.2, 0.14, 0.7, '#8d8f94', { r: 0.01 });
  for (const sx of [-1, 1]) h.B(x + sx * 0.58, 0, z, 0.05, 0.5, 0.7, '#8d8f94', { r: 0.01 });
  chair(h, x, z - fz * 0.85, c, fz);
  if (h.rnd() < 0.25) h.B(x + 0.62, 0.3, z - 0.1, 0.12, 0.34, 0.3, pick(h, TOY), { r: 0.04, nocol: true }); // 横にかけた手さげ
}
// 黒板（わく・チョーク入れ・字）。dir = 黒板の正面
function blackboardF(h, x, z, dir, w) {
  const F = frame(h, x, z, dir);
  F.B(0.06, 0, 0.9, 0.12, 1.8, w + 0.2, '#8a6a4a', { r: 0.02 });
  F.B(0.13, 0, 1.0, 0.02, 1.6, w, '#2f5d46', { nocol: true, pat: ['noise', '#2f5d46', 0, 3, 1] });
  F.B(0.2, 0, 0.92, 0.16, 0.05, w, '#c9a26b', { r: 0.01 });
  for (let k = 0; k < 5; k++) F.B(0.145, -w / 2 + 0.8 + k * (w - 1.6) / 4, 1.35 + (k % 3) * 0.4, 0.01, 0.04, 0.6 + (k % 2) * 0.4, '#f4f4f4', NC); // 字
  for (let k = 0; k < 3; k++) F.B(0.2, 0.3 + k * 0.12, 0.97, 0.04, 0.03, 0.08, pick(h, ['#f4f4f4', '#f0d040', '#e0719a']), NC); // チョーク
}
// 教卓（大きめのつくえ・前の板）
function lecternF(h, x, z, dir) {
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 0.8, 0.95, 1.6, '#8a5a33', { r: 0.03, pat: ['grain', '#8a5a33', 0, 2, 1] });
  F.B(0.02, 0, 0.95, 0.85, 0.05, 1.7, '#6b4a2b', { r: 0.02 });
  F.B(0.0, 0.4, 1.0, 0.3, 0.06, 0.4, '#f4f4f4', NC); F.B(-0.1, -0.45, 1.0, 0.25, 0.16, 0.3, '#4f7fe0', { r: 0.02, nocol: true });
}
// ロッカー（せの高い。とびらの通気口・取っ手・名ふだ）
function lockerRowF(h, x, z, dir, len, c, ht = 1.9) {
  const F = frame(h, x, z, dir), n = Math.max(1, Math.round(len / 0.65));
  F.B(0, 0, 0, 0.5, ht, len, c, { r: 0.03 });
  F.B(0.255, 0, 0.05, 0.01, ht - 0.1, len - 0.06, c, { nocol: true, pat: ['vents', c, 0, n, 1] });
}
// ランドセルのたな（ます目に色とりどりのかばん）
function cubbyF(h, x, z, dir, len) {
  const F = frame(h, x, z, dir), n = Math.max(2, Math.round(len / 0.55));
  F.B(0, 0, 0, 0.45, 1.25, len, '#c9a26b', { r: 0.02, pat: ['cabinet', '#c9a26b', '#8a6a4a', n, 3] });
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) if (h.rnd() < 0.75) F.B(0.17, -len / 2 + (i + 0.5) * len / n, 0.47 + k * 0.4, 0.14, 0.28, len / n - 0.14, pick(h, ['#e04f4f', '#2a3038', '#4f7fe0', '#b06fd8', '#8a5a33', '#e0719a']), { r: 0.04, nocol: true });
}
// げた箱（両面のくつ入れ。列のあいだに隠れる）
function getabakoF(h, x, z, dir, len, ht = 1.7) {
  const F = frame(h, x, z, dir), c = '#b9b7b0', n = Math.max(2, Math.round(len / 0.32)), m = Math.max(3, Math.round(ht / 0.3));
  F.B(0, 0, 0, 0.8, ht, len, c, { r: 0.02 });
  for (const s of [-1, 1]) F.B(s * 0.405, 0, 0.05, 0.01, ht - 0.1, len - 0.06, c, { nocol: true, pat: ['cabinet', c, '#7a7d82', n, m] });
  for (let i = 0; i < 6; i++) { const [px, pz] = F.at((h.rnd() < 0.5 ? -1 : 1) * 0.44, -len / 2 + 0.3 + h.rnd() * (len - 0.6)); h.B(px, 0, pz, 0.14, 0.1, 0.28, pick(h, ['#f4f4f4', '#e04f4f', '#4f7fe0']), { r: 0.04, nocol: true }); } // 上ばき
}
// カーテン（レールからたれた、ひだのある布。当たり判定あり。半分あいている）
function curtainF(h, x, z, dir, len, ht, c, y0 = 0) {
  const F = frame(h, x, z, dir);
  F.B(0, 0, ht, 0.06, 0.05, len, '#c9ccd0', NC);
  F.B(0, 0, y0 + 0.12, 0.12, ht - y0 - 0.12, len, c, { r: 0.04, pat: ['vband', c, shade(c, 0.85), Math.max(2, Math.round(len / 0.3)), 1] });
}
// トイレの個室（しきり・半分あいたドア・便器）。(x,z) = 個室のまん中、dir = 入口の向き
function stallF(h, x, z, dir, c = '#7fb7d8') {
  const F = frame(h, x, z, dir), W = 1.5, D = 1.7, H = 1.9;
  for (const s of [-1, 1]) F.B(0, s * W / 2, 0.15, D, H - 0.15, 0.06, c, { r: 0.02 });
  F.B(D / 2, -W / 2 + 0.35, 0.15, 0.06, H - 0.15, 0.7, c, { r: 0.02 }); // 入口の横の板
  { // 外へ大きく開いたドア（ちょうつがいは入口のはし）
    const th = 1.35, L = 0.78, [px, pz] = F.at(D / 2 + L / 2 * Math.sin(th), W / 2 - L / 2 * Math.cos(th)), [ox, oz] = F.at(0, 0), [ex, ez] = F.at(Math.sin(th), -Math.cos(th));
    h.B(px, 0.15, pz, 0.06, H - 0.2, L, shade(c, 1.08), { r: 0.02, rot: [0, Math.atan2(ex - ox, ez - oz), 0] });
  }
  { const [px, pz] = F.at(-D / 2 + 0.45, 0); toiletF(h, px, pz, dir); }
}
// 実験台（黒い天板・流し・じゃ口・ガスの栓）といす
function labBenchF(h, x, z, dir, len = 3) {
  const F = frame(h, x, z, dir);
  F.B(0, 0, 0, 1.3, 0.85, len, '#e8e1d2', { r: 0.02, pat: ['cabinet', '#e8e1d2', '#9a8a6a', Math.max(1, Math.round(len / 0.7)), 1] });
  F.B(0, 0, 0.85, 1.4, 0.06, len + 0.1, '#1b1d20', { r: 0.02 });
  F.B(0, -len / 2 + 0.45, 0.911, 0.5, 0.01, 0.6, '#9aa1a8', NC); { const [px, pz] = F.at(0, -len / 2 + 0.1); h.cyl(px, 0.91, pz, 0.03, 0.4, '#c9ccd0', { seg: 8 }); }
  for (let i = 0; i < 3; i++) { const [px, pz] = F.at(0, -0.3 + i * 0.6); h.cyl(px, 0.91, pz, 0.04, 0.12, '#e0b030', { seg: 8, nocol: true }); h.lathe(px + 0.25, 0.91, pz, [[0.001, 0], [0.09, 0], [0.09, 0.05], [0.04, 0.16], [0.04, 0.24], [0.001, 0.24]], pick(h, ['#bfe6f5', '#c6f0c0', '#f6d0e0']), { seg: 10 }); }
  for (const s of [-1, 1]) for (const t of [-1, 1]) { const [px, pz] = F.at(s * 1.05, t * len / 4); stool(h, px, pz, '#55606b'); }
}
// 段（音楽室のひな段・体育館のステージなど）。(x,z) = 前のはしのまん中、dir = 上る向き
function risersF(h, x, z, dir, n, w, rise, run, c) {
  const F = frame(h, x, z, dir);
  for (let i = 0; i < n; i++) F.B(i * run + run / 2, 0, 0, run, (i + 1) * rise, w, c, { r: 0.02, pat: ['floorwood', c, 0, Math.max(1, Math.round(w / 2)), 1] });
}
// 譜面台
function standF(h, x, z) { h.cyl(x, 0, z, 0.2, 0.03, '#2a3038'); rod(h, [x, 0.03, z], [x, 1.05, z], 0.02, '#2a3038'); h.B(x, 1.05, z, 0.5, 0.35, 0.04, '#2a3038', { rot: [-0.4, 0, 0], nocol: true }); }
// たいこ（ティンパニ）
function drumF(h, x, z, r = 0.45) { h.lathe(x, 0.15, z, [[0.001, 0], [r * 0.5, 0], [r, 0.45], [r, 0.62], [0.001, 0.62]], '#c98f4e', { seg: 16 }); h.cyl(x, 0.77, z, r * 0.98, 0.02, '#f4efe4', NC); for (let k = 0; k < 3; k++) { const a = k * 2.09; rod(h, [x + Math.cos(a) * r * 0.5, 0, z + Math.sin(a) * r * 0.5], [x + Math.cos(a) * r * 0.55, 0.3, z + Math.sin(a) * r * 0.55], 0.02, '#c9ccd0'); } }
// マットの山（体育倉庫）
function matsF(h, x, z, n, c = '#3f6fc9', al = true) { for (let i = 0; i < n; i++) h.B(x + (h.rnd() - 0.5) * 0.15, i * 0.2, z + (h.rnd() - 0.5) * 0.15, al ? 2.2 : 1.2, 0.2, al ? 1.2 : 2.2, i % 3 === 2 ? '#3f9b6a' : c, { r: 0.06 }); }
// とび箱
function vaultF(h, x, z, k = 5, al = true) { for (let i = 0; i < k; i++) h.B(x, i * 0.22, z, (al ? 1.5 : 0.9) - i * 0.04 * (al ? 1 : 0), 0.22, (al ? 0.9 : 1.5) - i * 0.04 * (al ? 0 : 1), i === k - 1 ? '#f4f4f4' : '#c9a26b', { r: 0.03, pat: i === k - 1 ? undefined : ['grain', '#c9a26b', 0, 1, 1] }); }
// ボールかご
function ballCartF(h, x, z) { h.B(x, 0.12, z, 1.0, 0.85, 0.7, '#c0c6cc', { r: 0.04, pat: ['vband', '#c0c6cc', '#8d8f94', 6, 1] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.cyl(x + sx * 0.42, 0, z + sz * 0.28, 0.06, 0.12, '#2a3038', NC); for (let i = 0; i < 5; i++) h.ball(x - 0.3 + (i % 3) * 0.3, 1.0, z - 0.12 + Math.floor(i / 3) * 0.24, 0.16, pick(h, ['#f08a3c', '#f4f4f4', '#e04f4f']), NC); }

export const MAPS = {
  /* ---------- ロビー（ゲーム開始までみんなで歩き回る。まんなかの HUNTER の円に乗ると鬼になれる） ---------- */
  lobby: {
    name: 'ロビー', hx: 11, hz: 8.5, sky: '#cfd8e3', spawn: [0, 5.2], hunter: [0, 0, 1.7],
    build(h) {
      h.F(0, 0, 22, 17, 0, ['check2', '#ece7dd', '#dcd5c8', 11, 8]);
      h.outer(5, '#efe6d6');
      // HUNTER の円（床の印。当たり判定はなく、円の中に立っているかだけを見る）
      h.cyl(0, 0, 0, 1.86, 0.03, '#ffffff', { nocol: true, flat: true, seg: 56 });
      h.cyl(0, 0, 0, 1.7, 0.045, '#d9342b', { nocol: true, flat: true, seg: 56, glow: 0.35 });
      h.label(0, 0.06, 0, 2.9, 0.8, 'HUNTER', '#ffffff');
      // 奥の壁ぞい：模様の練習パネル
      [['dots', '#f0d040', '#e04f4f'], ['hstripe', '#4f7fe0', '#f4f4f4'], ['camo', '#6fae5a', ['#2e6b34', '#8a5a33', '#d8c9a3']], ['splat', '#f4f4f4', TOY], ['brick', '#d9b08c', '#b8452f'], ['zigzag', '#b06fd8', '#f4f4f4']]
        .forEach(([k, a, b], i) => h.B(-8.75 + i * 3.5, 0, -8.1, 2.8, 3, 0.35, a, { pat: [k, a, b, 2, 2], r: 0.15, sink: true }));
      // 手前の壁：体の前の方を入れて隠れる絵／ボールプール／入れる小屋
      pic(h, -1.9, 0.15, 8.5, 0, -1, 3.2, 2.6, 'artField', ['#59b6d8', '#f0d040', '#e04f4f', '#4fbf6a', '#f4f1e8']); pic(h, 1.9, 0.15, 8.5, 0, -1, 3.2, 2.6, 'artLand', ARTPAL[0]);
      pit(h, -2.4, -5.4, 3.2, 2.2, 0.5, 0.22, '#4f7fe0', { r: 0.08, pat: ['vband', '#4f7fe0', '#f4f4f4', 6, 1] }, 0.62, 0.44, ['dots', '#f0d040', TOY, 4, 3]);
      shell(h, 2.6, -5.4, 2.2, 2.0, 1.9, 0.12, '#e8dcc8', { r: 0.04, pat: ['vstripe', '#e8dcc8', '#d4c4a8', 3, 2] }, [0, 1], 1.0, 1.45); h.cone(2.6, 2.02, -5.4, 1.35 / 0.707, 1.0, '#c9573f', { seg: 4 });
      // 左：くっつく練習の壁（でっぱりつき）
      h.B(-10.7, 0, -2.5, 0.5, 4.5, 6, '#7d8fb3', { pat: ['vband', '#7d8fb3', '#f4f4f4', 4, 3], r: 0.12 });
      for (const [z, y] of [[-4.5, 1.4], [-1.5, 2.4], [-3.5, 3.4]]) h.B(-10.2, y, z, 0.6, 0.18, 1.2, '#f4f4f4', { r: 0.06 });
      // くぼみの壁（カメレオンの練習：くぼみに入って、おくと同じ色に塗る）
      KIT.nook(h, -6.4, -6.2, ['#f0d040', '#59b6d8', '#e0719a'], TOY, { al: true, sd: 1, L: 3.4 });
      // 左手前：ラウンジ
      sofaZ(h, -9.6, 4.5, 3.6, '#c9573f', -1); table(h, -7.6, 4.5, 1.2, 2, '#6b4a2b', 0.45); plant(h, -9.8, 7.4);
      // 右：色見本・小物
      TOY.forEach((c, i) => h.B(10.75, 0.6 + (i % 2) * 1.3, -4 + Math.floor(i / 2) * 2.2, 0.15, 1.1, 1.8, c));
      KIT.junk(h, 8.2, 2.6, ['#e8dcc8', '#7d8fb3'], TOY);
      KIT.sculpt(h, -7, 0.8, ['#e8dcc8'], TOY);
      KIT.outcrop(h, 6.6, -2.2, ['#c9a36a', '#b8452f', '#e8dcc8'], TOY, 0.62); // 地層の岩（ひさしの下に入る練習）
      KIT.arch(h, 6.4, 5.9, ['#ffffff'], TOY);
      KIT.mush(h, -5.4, 6.2, ['#e04f4f']);
      h.dome(5.8, 0, -5.6, 1.0, 0.75, 0.9, '#b06fd8', { pat: ['dots', '#b06fd8', '#f7f3ea', 3, 2], solid: true });
      for (const [x, z] of [[-10.2, -7.8], [10.2, -7.8], [-10.2, 7.8], [10.2, 7.8]]) lamp(h, x, z);
      plant(h, 9.8, 7.4); plant(h, 9.8, -7.4);
      scatter(h, ['robot', 'dolls', 'tallplant'], -10, -3, -3, 7.5, ['#e8dcc8'], TOY); scatter(h, ['dino', 'vendrow', 'tallplant'], 3, 10, -4, 7.5, ['#e8dcc8'], TOY);
    }
  },

  /* ---------- おうち（廊下と、たくさんの部屋） ----------
     北：リビング／和室／階段ホール／ダイニングキッチン／パントリー／書斎／納戸／玄関
     南：主寝室（ウォークインクローゼット・ベビールーム）／子ども部屋×2／遊び部屋／洗面所／浴室／トイレ／物置／趣味の部屋 */
  house: {
    name: 'おうち', hx: 24, hz: 17, sky: '#d5dde6', pal: ['#e8dcc8', '#b98d5c', '#7d8fb3', '#8fbf7a', '#f3f1ec', '#c9573f', '#3f5f8a'], spawn: [-3, 0],
    build(h) {
      const P = this.pal, A = TOY, HX = 24, HZ = 17;
      const FL = (x0, x1, z0, z1, pat) => h.F((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, pat);
      const wood = (c, x0, x1, z0, z1) => FL(x0, x1, z0, z1, ['floorwood', c, 0, Math.max(1, Math.round((x1 - x0) / 3)), Math.max(1, Math.round((z1 - z0) / 3))]);
      const tile = (c, g, x0, x1, z0, z1) => FL(x0, x1, z0, z1, ['tile', c, g, Math.max(1, Math.round((x1 - x0) / 1.4)), Math.max(1, Math.round((z1 - z0) / 1.4))]);
      const rug = (x, z, w, d, k, c1, c2) => h.F(x, z, w, d, 0, [k, c1, c2, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2))], true);
      // 部屋の内がわ（内壁は厚さ 0.4 なので 0.2 ずつ内へ）と、壁ぎわに家具を置く道具
      const RM = (x0, x1, z0, z1) => ({ x0: x0 <= -HX ? x0 : x0 + 0.2, x1: x1 >= HX ? x1 : x1 - 0.2, z0: z0 <= -HZ ? z0 : z0 + 0.2, z1: z1 >= HZ ? z1 : z1 - 0.2 });
      const at = (R, s, t, dp) => (s === 'n' || s === 's') ? { x: t >= 0 ? R.x0 + t : R.x1 + t, z: s === 'n' ? R.z0 + dp / 2 : R.z1 - dp / 2, dir: [0, s === 'n' ? 1 : -1] }
        : { x: s === 'w' ? R.x0 + dp / 2 : R.x1 - dp / 2, z: t >= 0 ? R.z0 + t : R.z1 + t, dir: [s === 'w' ? 1 : -1, 0] };
      const put = (R, s, t, dp, fn, ...a) => { const p = at(R, s, t, dp); fn(h, p.x, p.z, p.dir, ...a); return p; };
      const shelf = (R, s, t, len, ht, c, dp = 0.8) => { const p = at(R, s, t, dp); bookshelf(h, p.x, p.z, p.dir[0] ? dp : len, p.dir[0] ? len : dp, ht, c); };
      const win = (R, s, t, w) => { const p = at(R, s, t, 0); windowIn(h, p.x, p.z, p.dir[0], p.dir[1], w); };
      const art = (R, s, t, y0, w, ht) => { const p = at(R, s, t, 0); pic(h, p.x, y0, p.z, p.dir[0], p.dir[1], w, ht); };
      const LV = RM(-24, -10, -17, -1.5), WA = RM(-10, -2, -17, -9.5), HL = RM(-10, -2, -9.5, -1.5), DK = RM(-2, 12, -17, -1.5), PAN = RM(12, 17, -17, -10), STU = RM(17, 24, -17, -10), NAN = RM(12, 17, -10, -1.5);
      const BED = RM(-24, -11, 1.5, 11), WIC = RM(-24, -18, 11, 17), BABY = RM(-18, -11, 11, 17), KA = RM(-11, -3, 1.5, 10), KB = RM(-3, 5, 1.5, 10), PLAY = RM(-11, 5, 10, 17);
      const SEN = RM(5, 10, 1.5, 8), BATH = RM(5, 10, 8, 17), WC = RM(10, 13, 1.5, 6.5), MONO = RM(10, 13, 6.5, 17), HOB = RM(13, 24, 1.5, 17);
      // ---- 床 ----
      wood('#c9a26b', -24, 17, -1.5, 1.5); wood('#c9a26b', 17, 24, -10, 1.5); // 廊下・玄関
      wood('#b98d5c', -24, -10, -17, -1.5); FL(-10, -2, -17, -9.5, ['tatami', '#cfc68a', '#3f5f3a', 4, 4]); wood('#b98d5c', -10, -2, -9.5, -1.5); wood('#d1ad78', -2, 12, -17, -1.5);
      tile('#efe6d0', '#c9bfa8', 12, 17, -17, -10); FL(17, 24, -17, -10, ['fabric', '#3f5a48', 0, 5, 5]); FL(12, 17, -10, -1.5, ['noise', '#a9a59a', 0, 3, 5]);
      FL(-24, -11, 1.5, 11, ['fabric', '#d8cbb0', 0, 7, 5]); wood('#c9a26b', -24, -18, 11, 17); FL(-18, -11, 11, 17, ['dots', '#f6e1ea', '#ffffff', 4, 3]);
      wood('#d9b98c', -11, -3, 1.5, 10); wood('#b98d5c', -3, 5, 1.5, 10); FL(-11, 5, 10, 17, ['check2', '#f0d040', '#59b6d8', 8, 4]);
      tile('#eef3f6', '#c9d6de', 5, 10, 1.5, 8); tile('#d8ecf4', '#a8c8d8', 5, 10, 8, 17); tile('#f1ece0', '#d9d2c4', 10, 13, 1.5, 6.5); FL(10, 13, 6.5, 17, ['noise', '#a9a59a', 0, 2, 5]);
      wood('#c9a26b', 13, 24, 1.5, 17);
      h.outer(6, '#efe6d6');
      h.boxc(0, ROOM_WALL, 0, 2 * HX + 8, 2, 2 * HZ + 8, { noclimb: true, sharp: true }); // 見えない天井（壁のてっぺんと同じ高さ。壁を登っても、ふちの上には出られない）
      // ---- 壁（部屋ごとに壁紙を変える）----
      const S = {
        cor: ['#f3f1ec'], liv: ['#efe3cf', ['dots', '#e2d2b6', 1]], wa: ['#d9c7a0'], hall: ['#f3f1ec'], dk: ['#f4efe4'], pan: ['#e9e4d8'], stu: ['#3f5a50', ['vband', '#365048', 1]],
        nan: ['#d9d4c7'], gen: ['#efe6d6'], bed: ['#d9e1ea', ['dots', '#c8d3df', 1]], wic: ['#efe9df'], baby: ['#f6e1ea', ['dots', '#f3c6d4', 1]], ka: ['#f8e3ef', ['hstripe', '#f3c6d4', 1]],
        kb: ['#dcecf8', ['vband', '#c6e3f3', 1]], play: ['#fff1b8', ['confetti', TOY, 1]], sen: ['#e9f3f6', ['tile', '#c9d6de']], bath: ['#cfe6f2', ['tile', '#a8cfe0']], wc: ['#f1ece0', ['tile', '#d9d2c4']], mono: ['#d9d4c7'], hob: ['#e4e9ee'],
      };
      wallR(h, 'x', -1.5, -24, -10, [[-17, 3]], S.liv, S.cor); wallR(h, 'x', -1.5, -10, -2, [[-6, 3, true]], S.hall, S.cor); wallR(h, 'x', -1.5, -2, 12, [[4, 3]], S.dk, S.cor); wallR(h, 'x', -1.5, 12, 17, [[14.5, 2]], S.nan, S.cor);
      wallR(h, 'z', -10, -17, -9.5, [[-14.5, 2, true]], S.liv, S.wa); wallR(h, 'z', -10, -9.5, -1.5, [], S.liv, S.hall); wallR(h, 'x', -9.5, -10, -2, [[-4, 2, true]], S.wa, S.hall);
      wallR(h, 'z', -2, -17, -9.5, [[-14.5, 2, true]], S.wa, S.dk); wallR(h, 'z', -2, -9.5, -1.5, [], S.hall, S.dk);
      wallR(h, 'z', 12, -17, -10, [[-14, 2]], S.dk, S.pan); wallR(h, 'z', 12, -10, -1.5, [], S.dk, S.nan);
      wallR(h, 'x', -10, 12, 17, [[14.5, 2]], S.pan, S.nan); wallR(h, 'x', -10, 17, 24, [[20.5, 2]], S.stu, S.gen);
      wallR(h, 'z', 17, -17, -10, [], S.pan, S.stu); wallR(h, 'z', 17, -10, -1.5, [[-5.5, 2]], S.nan, S.gen);
      wallR(h, 'x', 1.5, -24, -11, [[-15.5, 3]], S.cor, S.bed); wallR(h, 'x', 1.5, -11, -3, [[-7, 2.2]], S.cor, S.ka); wallR(h, 'x', 1.5, -3, 5, [[1, 2.2]], S.cor, S.kb);
      wallR(h, 'x', 1.5, 5, 10, [[7.5, 2]], S.cor, S.sen); wallR(h, 'x', 1.5, 10, 13, [[11.5, 1.8]], S.cor, S.wc); wallR(h, 'x', 1.5, 13, 24, [[18.5, 3]], S.cor, S.hob);
      wallR(h, 'z', -11, 1.5, 10, [], S.bed, S.ka); wallR(h, 'z', -11, 10, 11, [], S.bed, S.play); wallR(h, 'z', -11, 11, 17, [], S.baby, S.play);
      wallR(h, 'x', 11, -24, -18, [[-21, 2]], S.bed, S.wic); wallR(h, 'x', 11, -18, -11, [[-14.5, 2]], S.bed, S.baby); wallR(h, 'z', -18, 11, 17, [], S.wic, S.baby);
      wallR(h, 'z', -3, 1.5, 10, [], S.ka, S.kb); wallR(h, 'x', 10, -11, -3, [[-7, 2]], S.ka, S.play); wallR(h, 'x', 10, -3, 5, [[1, 2]], S.kb, S.play);
      wallR(h, 'z', 5, 1.5, 8, [], S.kb, S.sen); wallR(h, 'z', 5, 8, 10, [], S.kb, S.bath); wallR(h, 'z', 5, 10, 17, [], S.play, S.bath); wallR(h, 'x', 8, 5, 10, [[7.5, 2]], S.sen, S.bath);
      wallR(h, 'z', 10, 1.5, 6.5, [], S.sen, S.wc); wallR(h, 'z', 10, 6.5, 8, [], S.sen, S.mono); wallR(h, 'z', 10, 8, 17, [], S.bath, S.mono); wallR(h, 'x', 6.5, 10, 13, [], S.wc, S.mono);
      wallR(h, 'z', 13, 1.5, 6.5, [], S.wc, S.hob); wallR(h, 'z', 13, 6.5, 17, [[12, 2]], S.mono, S.hob);
      // 開いたドア（ドアと壁のあいだに隠れられる）
      doorOpen(h, -8.1, 1.7, [0, 1], 2.0, '#f3c6d4'); doorOpen(h, 2.1, 1.7, [0, 1], 2.0, '#9fc6e8'); doorOpen(h, 8.5, 1.7, [0, 1], 1.8); doorOpen(h, 12.4, 1.7, [0, 1], 1.6);
      doorOpen(h, 13.5, -1.7, [0, -1], 1.8, '#a9a59a'); doorOpen(h, 21.5, -10.2, [0, -1], 1.8, '#5a3c28'); doorOpen(h, -20, 11.2, [0, 1], 1.8); doorOpen(h, -13.5, 11.2, [0, 1], 1.8, '#f6e1ea');
      doorOpen(h, 12.2, -13, [1, 0], 1.8); doorOpen(h, 13.2, 11, [1, 0], 1.8, '#a9a59a'); doorOpen(h, 16.8, -4.5, [-1, 0], 1.8, '#a9a59a');
      // ---- 廊下 ----
      rug(-3.5, 0, 39, 1.3, 'diag', '#7d3f3f', '#c9a24a'); consoleF(h, -12, -1.1, [0, 1], 2.0); consoleF(h, 9.5, -1.1, [0, 1], 2.0);
      KIT.tallplant(h, -23.2, 0, P, A); windowIn(h, -24, 0, 1, 0, 1.2);
      for (const [x, nz] of [[-21.5, 1], [-0.8, 1], [-20.5, -1], [-11, -1], [-3.2, -1], [4.2, -1], [15, -1]]) pic(h, x, 1.15, nz > 0 ? -1.3 : 1.3, 0, nz, 1.5, 1.15);
      h.cyl(-9, 0, 0.5, 0.18, 0.08, '#2a3038', NC); // おそうじロボット
      // ---- 玄関（土間・上がりかまち・くつ箱・ドア）----
      h.F(22.5, -4.5, 3.0, 8.0, 0, ['check2', '#9aa1a8', '#8d8f94', 3, 8], true); h.B(20.85, 0, -4.5, 0.3, 0.12, 8.0, '#8a5a33', { r: 0.02, pat: ['grain', '#8a5a33', 0, 1, 4] });
      h.B(23.9, 0, -4.5, 0.2, 2.7, 1.9, '#6b4a2b', { r: 0.02, pat: ['cabinet', '#6b4a2b', '#c9a24a', 1, 2] }); h.ball(23.75, 1.1, -3.8, 0.08, '#c9a24a', NC); h.B(23.92, 2.7, -4.5, 0.24, 0.15, 2.3, '#f4f1e8');
      shoeboxF(h, 22.75, -9.6, [0, 1], 2.2, 1.0); shoes(h, 22.4, -3.4, 4); shoes(h, 22.6, -6.6, 2); KIT.umbrella(h, 23.4, -1.0, P, A);
      KIT.coats(h, 18.3, -8.7, P, A); KIT.tallplant(h, 23.3, 0.6, P, A); bench(h, 17.65, -2.6, false, '#8a5a33', -1); pic(h, 22.2, 1.2, 1.3, 0, -1, 1.4, 1.2);
      // ---- リビング（テレビとソファ・本だな・ピアノ・水そう）----
      rug(-18.8, -9.4, 7, 5, 'diag', '#a8443f', '#d9a441');
      put(LV, 'w', 7.6, 0.6, tvF, 3.4); sofaF(h, -14.0, -9.4, [-1, 0], 4.4, '#3f5f8a'); sofaF(h, -18.5, -5.6, [0, -1], 3.0, '#3f5f8a'); sofaF(h, -18.8, -13.4, [0, 1], 1.4, '#c9573f');
      table(h, -18.8, -9.4, 2.0, 1.1, '#6b4a2b', 0.45); lamp(h, -20.7, -13.7, 2.3);
      shelf(LV, 'n', 2.5, 4, 2.4, '#8a5a33'); shelf(LV, 'n', -2.2, 3.2, 2.2, '#7a4c2a'); win(LV, 'n', 7.0, 2.4);
      put(LV, 'e', 1.2, 0.6, pianoF); put(LV, 'e', -2.4, 0.55, chestF, 2.6, 0.85, '#6b4a2b'); art(LV, 'e', -2.4, 1.5, 2.0, 1.3); art(LV, 'w', 7.6, 2.6, 2.4, 1.1);
      KIT.aquarium(h, -22.6, -3.3, P, A); KIT.tallplant(h, -23.2, -12.6, P, A); KIT.tallplant(h, -11.1, -6.6, P, A); KIT.plush(h, -13.0, -3.4, P, A); KIT.beanbag(h, -21.4, -14.9, P, A);
      // ---- 和室（おしいれ・床の間・こたつ・びょうぶ・しょうじ）----
      put(WA, 'n', 2.1, 0.9, oshiireF, 3.4); put(WA, 'n', -1.5, 0.9, tokonomaF, 2.4); KIT.kotatsu(h, -6.2, -13.0, P, A);
      put(WA, 's', 1.4, 0.55, chestF, 1.8, 1.4, '#7a4c2a'); byobuF(h, -9.3, -11.6, [1, 0]); andonF(h, -2.8, -10.3); shojiF(h, -2.2, -11.0, [-1, 0], 1.8);
      // ---- 階段ホール（段の下にもぐれる・上のおどり場にも登れる）----
      stairsR(h, -8.9, -2.3, [0, -1], 9, 1.8, 0.23, 0.5, 1.6);
      carton(h, -9.3, 0, -7.8, 0.8, 0.6, 0.8, CARD[1]); carton(h, -9.25, 0.6, -7.85, 0.6, 0.45, 0.6, CARD[3]); KIT.cleaning(h, -6.4, -7.6, P, A);
      KIT.clock(h, -2.8, -5.0, P, A); KIT.coats(h, -3.0, -2.9, P, A); plant(h, -5.9, -8.4); pic(h, -9.8, 2.7, -7.6, 1, 0, 1.2, 1.0);
      // ---- ダイニングキッチン ----
      put(DK, 'n', 4.1, 0.65, counterF, 8.2, { sink: -2.2, stove: 2.1 }); put(DK, 'n', 9.0, 0.75, fridgeF); win(DK, 'n', 11.7, 2.0); bin(h, 8.05, -16.6, '#55606b'); bin(h, 11.3, -12.0, '#3f9b6a');
      h.B(2.5, 0, -13.0, 4.4, 0.9, 1.0, '#e8dcc8', { r: 0.02, pat: ['cabinet', '#e8dcc8', '#9a8a6a', 6, 1] }); h.B(2.5, 0.9, -13.0, 4.6, 0.06, 1.2, '#3a3a3a', { r: 0.01 }); // アイランドキッチン
      for (const x of [0.9, 2.1, 3.3, 4.5]) stool(h, x, -11.8, '#c9573f');
      rug(5, -6, 5, 3.4, 'check2', '#e8dcc8', '#d9c9a8'); table(h, 5, -6, 3.2, 1.6, '#c98f4e');
      for (const x of [3.9, 5, 6.1]) { chair(h, x, -4.85, '#8a5a33', -1); chair(h, x, -7.15, '#8a5a33', 1); }
      put(DK, 'e', -4.5, 0.5, cupboardF, 2.6, '#b08a5a'); put(DK, 'w', -3.0, 0.55, chestF, 2.2, 0.9, '#8a6a4a'); art(DK, 'w', -3.0, 1.5, 1.8, 1.2);
      KIT.tallplant(h, 11.1, -2.6, P, A); plant(h, -1.1, -2.4); KIT.crates(h, 10.4, -10.4, P, A);
      // ---- パントリー ----
      put(PAN, 'n', 2.3, 0.55, rackF, 4.4, 2.2); put(PAN, 'e', 3.9, 0.55, rackF, 3.0, 2.2);
      carton(h, 13.0, 0, -11.0, 0.9, 0.8, 0.9, CARD[0]); carton(h, 13.0, 0.8, -11.0, 0.7, 0.55, 0.7, CARD[2]); h.lump(15.4, 0.35, -15.6, 0.45, 0.35, 0.32, '#e8dcc8', { seed: 3, bump: 0.12, freq: 2, pat: ['fabric', '#e8dcc8', 0, 1, 1] }); // 米ぶくろ
      // ---- 書斎 ----
      put(STU, 'n', 2.4, 0.7, deskF, '#6b4a2b', 'pc'); win(STU, 'n', -1.4, 1.8); shelf(STU, 'e', 3.2, 3.6, 2.4, '#5a3c28'); shelf(STU, 'w', 3.0, 3.0, 2.0, '#5a3c28');
      sofaF(h, 22.9, -10.775, [0, -1], 1.4, '#7a2f2f'); globeF(h, 21.0, -13.5); rug(20.6, -13.6, 3, 2.6, 'diag', '#5a2f2f', '#c9a24a');
      // ---- 納戸 ----
      put(NAN, 'w', 4.0, 0.55, rackF, 4.4, 2.0, 'store'); bikeAt(h, 14.5, -7.0, false, '#e04f4f', false);
      for (const [x, z, s] of [[16.3, -9.3, 0.9], [16.3, -8.3, 0.85], [16.3, -3.0, 0.9]]) { carton(h, x, 0, z, s, s * 0.85, s, pick(h, CARD)); if (h.rnd() < 0.6) carton(h, x, s * 0.85, z, s * 0.8, s * 0.6, s * 0.8, pick(h, CARD)); }
      h.B(16.35, 0, -2.0, 0.35, 1.1, 0.7, '#2f6fb0', { r: 0.06 }); // スーツケース
      // ---- 主寝室 ----
      bedF(h, -22.28, 6.2, [1, 0], '#5b76b8', 2.6, 3.2); nightF(h, -23.75, 4.54, [1, 0], '#8a5a33'); nightF(h, -23.75, 7.86, [1, 0], '#8a5a33'); win(BED, 'w', -1.3, 1.6);
      closet(h, -17.5, 10.225, [0, -1], '#8a5a33', P, A); put(BED, 'e', 6.8, 0.7, deskF, '#c9a26b', 'make'); put(BED, 'e', 2.4, 0.55, chestF, 1.8, 1.1, '#8a5a33');
      sofaF(h, -19.6, 2.275, [0, 1], 1.4, '#c9573f'); rug(-18.6, 6.2, 3.6, 3, 'diag', '#7d8fb3', '#d9e1ea'); art(BED, 'w', 4.5, 1.75, 1.8, 1.1);
      // ウォークインクローゼット（服のうしろに隠れる）
      clothesF(h, -21.2, 16.0, [0, -1], 4.6); clothesF(h, -23.0, 13.1, [1, 0], 2.6); put(WIC, 'e', 2.8, 0.55, chestF, 1.4, 1.2, '#efe9df'); h.B(-19.0, 0, 12.4, 0.8, 0.75, 0.4, '#7b5ea7', { r: 0.06 });
      // ベビールーム
      put(BABY, 's', 3.3, 0.8, cribF); win(BABY, 's', -1.4, 1.4); put(BABY, 'w', 2.9, 0.55, chestF, 1.5, 1.0, '#f3f1ec'); put(BABY, 'e', 2.4, 1.15, sofaF, 1.3, '#f3c6d4');
      bear(h, -12.4, 0, 16.3, 0.5, '#d9b48a', -1.57); bear(h, -17.2, 0, 12.0, 0.45, '#c6e3f3', 0); KIT.toybox(h, -16.6, 16.2, P, A);
      // ---- 子ども部屋A（ひな人形・人形の家）----
      bedF(h, -9.28, 6.0, [1, 0], '#e0719a', 1.6, 2.8); KIT.hina(h, -9.4, 8.5, P, A); put(KA, 'e', 4.0, 0.7, deskF, '#f3f1ec', 'study');
      put(KA, 'n', 1.2, 0.55, chestF, 1.6, 1.1, '#f3f1ec'); shelf(KA, 'n', -1.0, 1.6, 1.6, '#e0719a', 0.6); rug(-6.6, 6, 3.4, 2.6, 'dots', '#f3c6d4', '#ffffff');
      KIT.dolls(h, -6.4, 7.2, P, A); KIT.beanbag(h, -4.6, 8.4, P, A); bear(h, -9.6, 0.74, 5.6, 0.35, '#f3c6d4', 0); bear(h, -9.6, 0.74, 6.4, 0.3, '#c6e3f3', 0);
      // ---- 子ども部屋B（2段ベッド）----
      bunkF(h, 4.15, 5.6, [0, 1], '#4f7fe0'); put(KB, 'w', 4.2, 0.7, deskF, '#4f7fe0', 'pc'); shelf(KB, 's', 1.2, 1.8, 1.8, '#4f7fe0', 0.6); put(KB, 's', -1.0, 0.55, chestF, 1.4, 1.0, '#59b6d8');
      rug(0.6, 5.6, 3.2, 2.6, 'check2', '#4f7fe0', '#f0d040'); KIT.robot(h, 3.3, 8.2, P, A); KIT.toybox(h, -1.0, 8.3, P, A);
      // ---- 遊び部屋 ----
      KIT.slideK(h, -8.2, 14.4, P, A); KIT.ballpit(h, -3.0, 14.6, P, A); KIT.playhouse(h, 2.6, 15.0, P, A); win(PLAY, 's', 2.3, 2.0); win(PLAY, 's', -2.3, 2.0);
      for (let i = 0; i < 5; i++) brick(h, -4.4 + (i % 3) * 0.75, 0, 10.9 + Math.floor(i / 3) * 0.75, 0.55, TOY[i]);
      // ---- 洗面所 ----
      put(SEN, 'e', 2.6, 0.55, vanityF, 2.0); put(SEN, 'w', -1.0, 0.65, washerF, true); put(SEN, 'w', 2.2, 0.55, rackF, 1.8, 1.8, 'bath');
      h.lathe(9.2, 0, 7.1, [[0.001, 0], [0.26, 0], [0.3, 0.5], [0.001, 0.5]], '#d8c9a3', { pat: ['vband', '#d8c9a3', '#c4b48c', 6, 1] }); rug(7.5, 7.3, 1.6, 0.8, 'hstripe', '#59b6d8', '#f4f4f4');
      // ---- 浴室（お湯に体の下の方が沈む）----
      pit(h, 7.5, 15.5, 4.4, 2.8, 0.75, 0.25, '#ffffff', { r: 0.12 }, 0.62, 0.36, ['wave', '#7fc4e0', '#b8e2f0', 3, 4]);
      h.cyl(7.5, 0.75, 16.85, 0.04, 0.45, '#c9ccd0', { seg: 8 }); h.cyl(9.6, 0, 10.6, 0.03, 2.2, '#c9ccd0', { seg: 8 }); h.ball(9.45, 2.15, 10.6, 0.12, '#c9ccd0', NC);
      h.cyl(6.4, 0, 11.4, 0.22, 0.42, '#f4f4f4', { seg: 14 }); h.lathe(7.3, 0, 11.0, [[0.001, 0], [0.2, 0], [0.24, 0.3], [0.001, 0.3]], '#f0d040', { seg: 14 }); h.B(9.6, 1.0, 12.4, 0.3, 0.05, 1.2, '#c9ccd0', NC);
      for (let i = 0; i < 4; i++) h.cyl(9.62, 1.05, 12.0 + i * 0.25, 0.05, 0.2, pick(h, ['#e0719a', '#59b6d8', '#f4f4f4']), { seg: 8, nocol: true });
      // ---- トイレ ----
      put(WC, 's', 1.3, 0.86, toiletF); h.B(12.5, 0, 4.6, 0.5, 0.8, 0.5, '#f4f4f4', { r: 0.04 }); h.B(11.5, 1.65, 6.12, 1.2, 0.05, 0.35, '#8a5a33');
      for (let i = 0; i < 3; i++) h.cyl(11.2 + i * 0.25, 1.7, 6.12, 0.1, 0.12, '#ffffff', { seg: 10, nocol: true });
      // ---- 物置 ----
      put(MONO, 'w', 5.0, 0.55, rackF, 5.0, 2.0, 'store'); bikeAt(h, 11.9, 15.5, false, '#4fbf6a', true); h.lathe(11.0, 0, 16.4, [[0.001, 0], [0.22, 0], [0.26, 0.42], [0.001, 0.42]], '#3f9b6a', { seg: 12 });
      for (const [z, s] of [[7.4, 0.9], [8.4, 0.85], [9.4, 0.8]]) { carton(h, 12.3, 0, z, s, s * 0.85, s, pick(h, CARD)); if (h.rnd() < 0.6) carton(h, 12.3, s * 0.85, z, s * 0.8, s * 0.6, s * 0.8, pick(h, CARD)); }
      // ---- 趣味の部屋（卓球台・楽器・ランニングマシン・サンドバッグ）----
      pingpongF(h, 18.6, 9.4, [0, 1]); KIT.music(h, 15.4, 15.0, P, A); put(HOB, 'e', 4.4, 1.9, treadmillF); punchbagF(h, 22.8, 2.9);
      put(HOB, 'e', -4.0, 1.15, sofaF, 3.0, '#7d8fb3'); KIT.easel(h, 21.0, 15.8, P, A); shelf(HOB, 'w', 5.0, 3.0, 2.2, '#8a5a33'); KIT.dino(h, 21.4, 9.6, P, A);
      h.B(14.6, 0, 2.3, 1.6, 0.6, 0.5, '#2a3038', { r: 0.03 }); for (let i = 0; i < 4; i++) h.cyl(14.05 + i * 0.36, 0.6, 2.3, 0.12, 0.22, '#55606b', { seg: 10, nocol: true }); // ダンベル
      win(HOB, 'e', 2.2, 1.6); win(HOB, 'e', 7.8, 2.0); win(HOB, 's', 5.4, 2.4); rug(21.6, 5.4, 3.0, 3.6, 'check2', '#3f6fc9', '#2f5aa8');
    }
  },

  /* ---------- 公園 ---------- */
  park: {
    name: '公園', hx: 36, hz: 28, sky: '#8fc8f0', dark: 0.95, floorTex: 'grass', kit: ['statue', 'statue', 'bush', 'hedge', 'rock', 'rock', 'planter', 'mush', 'sculpt', 'coral', 'logs', 'parasol', 'junk', 'laundry', 'flowers', 'mural', 'arch', 'pipe', 'hlog', 'grass', 'leafpile', 'tent', 'hut', 'outcrop', 'outcrop', 'crevice', 'nook', 'blocks', 'patch', 'stairs',
      'slideK', 'jungle', 'swing', 'seesaw', 'spring', 'sandbox', 'tiretun', 'merry', 'climb', 'bars', 'playhouse', 'bike', 'garden', 'trampoline', 'fence', 'fence', 'carK', 'vendrow', 'bikerack', 'sign', 'streetset', 'garbage'], pal: ['#6fae5a', '#8d8f94', '#8a5a33', '#2e6b34', '#d8c9a3'], clutter: 96, spawn: [0, -6],
    build(h) {
      h.F(0, 0, 72, 56, '#6fae5a');
      h.outer(6, '#3c6e3a');
      h.B(0, 0, 0, 72, 0.03, 3.4, '#d8c9a3', FL); h.B(0, 0, 0, 3.4, 0.03, 56, '#d8c9a3', FL);
      h.cyl(0, 0, 0, 5.2, 0.035, '#d8c9a3', FL);
      bigHouse(h, 15, 19, [0, -1], this.pal); // 大きな家（中に入れる）
      for (const sx of [-1, 1]) { pedestal(h, sx * 6.5, -4.5, 1, '#d9d2c4'); statueFig(h, sx * 6.5, 1.7, -4.5, sx < 0 ? 'hero' : 'think', '#8a6a3c', sx < 0 ? 0 : 3.1416); } // 噴水の前の銅像
      pedestal(h, 0, -7.2, 1, '#d9d2c4'); // 何ものっていない台（ここに乗って銅像のふり）
      h.cyl(0, 0, 0, 3.2, 0.55, '#b9c0c7', { pat: ['brick', '#b9c0c7', '#9aa1a8', 10, 1] }); h.ring(0, 0.55, 0, 3.15, 0.08, '#d9dde0'); h.cyl(0, 0.55, 0, 2.8, 0.04, '#5fa8d8', NC); h.cyl(0, 0, 0, 0.5, 2.2, '#aab2ba'); h.cyl(0, 1.6, 0, 1.1, 0.12, '#aab2ba', { rt: 0.9 });
      // 池（まわりは角ばった石）
      h.cyl(22, 0, -15, 6.5, 0.04, '#4f95c9', FL);
      for (let i = 0; i < 9; i++) { const a = i * 0.7; stone(h, 22 + Math.cos(a) * 7, -15 + Math.sin(a) * 7, 0.6 + h.rnd() * 0.45, i % 2 ? '#8d8f94' : '#9a9ca0', 0, 0.55); }
      // 遊具：すべり台・ジャングルジム・ブランコ
      h.F(-22, 15, 18, 16, '#e2cf9c', null, 1); // 遊具の広場：すべり台・ジャングルジム・ブランコ・シーソー・スプリング・砂場・タイヤ・ボルダリング・回転遊具・鉄棒・ままごとハウス
      scatter(h, ['slideK', 'jungle', 'swing', 'sandbox', 'seesaw', 'climb', 'spring', 'tiretun', 'merry', 'playhouse', 'bars', 'trampoline', 'spring'], -30.5, -13.5, 7.5, 22.5, this.pal, TOY, 60);
      for (const [x, z] of [[-31, 7], [-13, 7], [-31, 23], [-13, 23]]) lamp(h, x, z, 3);
      // 生け垣の迷路（でこぼこの葉っぱの壁。中にはもぐれない）
      for (let k = 0; k < 5; k++) h.B(-23 + (k % 2 ? 3 : -3), 0, -24 + k * 4, 16, 1.9, 0.9, '#2e6b34', { r: 0.25, pat: ['leaf', '#2e6b34', LEAF, 12, 2] });
      h.B(-33, 0, -16, 0.9, 1.9, 16, '#2e6b34', { r: 0.25, pat: ['leaf', '#2e6b34', LEAF, 12, 2] }); h.B(-13, 0, -14, 0.9, 1.9, 12, '#2e6b34', { r: 0.25, pat: ['leaf', '#2e6b34', LEAF, 9, 2] });
      // 木とやぶ
      let n = 0, guard = 0;
      while (n < 30 && guard++ < 400) {
        const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50;
        if (Math.abs(x) < 4 || Math.abs(z) < 4 || Math.hypot(x, z) < 8) continue;
        if (x < -11 && z < -4) continue; if (x < -11 && z > 6) continue; if (Math.hypot(x - 22, z + 15) < 9) continue; if (x > 18 && z > 12) continue;
        if (!h.free(x, z, 2.2)) continue; // 家・銅像にかさならない
        tree(h, x, z, 0.8 + h.rnd() * 0.5); n++;
      }
      for (let i = 0; i < 16; i++) { const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50; if (Math.abs(x) < 3 || Math.abs(z) < 3 || (x < -11 && z < -4) || !h.free(x, z, 1.4)) continue; const s = 0.6 + h.rnd() * 0.45, c = i % 2 ? '#3b8f46' : '#2f7d3a'; h.lump(x, s * 0.75, z, s * 1.3, s, s * 1.1, c, { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, ry: h.rnd() * 6, pat: ['leaf', c, LEAF, 2, 2] }); }
      // ベンチ・花だん
      for (const x of [-28, -18, -9, 9, 18, 28]) bench(h, x, 2.7, true, WOOD, 1);
      for (const z of [-20, -11, 11, 20]) bench(h, -2.8, z, false, WOOD, -1);
      [[8, -8, '#e0719a'], [-8, -8, '#f0d040'], [8, 8, '#e04f4f'], [-8, 8, '#b06fd8']].forEach(f => { h.B(f[0], 0, f[1], 4, 0.4, 4, '#6b4a2b', { r: 0.06, pat: ['brick', '#6b4a2b', '#5a3c24', 4, 1] }); h.B(f[0], 0.4, f[1], 3.6, 0.25, 3.6, f[2], { pat: ['confetti', f[2], ['#ffffff', '#ffd940', '#3b8f46'], 3, 3] }); });
      // ピクニック
      for (const p of [[16, 10.5], [21, 10.5]]) { table(h, p[0], p[1], 2.4, 1.2, '#b08a5a'); h.B(p[0], 0, p[1] - 1.1, 2.4, 0.42, 0.4, '#b08a5a', { pat: ['grain', '#b08a5a', 0, 2, 1] }); h.B(p[0], 0, p[1] + 1.1, 2.4, 0.42, 0.4, '#b08a5a', { pat: ['grain', '#b08a5a', 0, 2, 1] }); }
      h.B(31, 0, -2, 4, 3, 4.5, '#d9d2c4', { pat: ['brick', '#d9d2c4', '#c4bcaa', 4, 3] }); h.B(31, 3, -2, 4.6, 0.15, 5.1, '#8a6a4a', { r: 0.03 }); h.roof(31, 3.15, -2, 4.6, 5.1, 1.5, 0, '#5a3c28', { pat: ['rooftile', '#5a3c28', '#3a2818', 3, 3] }); // トイレの建物と四角すいの屋根 vending(h, 27.6, -3, '#e04f4f', -1); vending(h, 27.6, -1.6, '#4f7fe0', -1);
      bin(h, 5, 5, '#55606b'); bin(h, -5, -5, '#55606b'); bin(h, 21, 3, '#3f9b6a');
      for (const p of [[6, -20], [-6, 20], [30, 8], [-30, 3]]) lamp(h, p[0], p[1], 3.4);
      // 岩場（地層の岩・すき間）
      const PP = ['#8d8f94', '#a39a8a', '#7a7c80', '#b5ab98'];
      KIT.outcrop(h, -17, -3, PP, []); KIT.outcrop(h, 3, -15, PP, []); KIT.crevice(h, 13, -23, PP);
      // 駐車場・自販機・フェンス・電柱など外の小物
      scatter(h, ['carK', 'carK', 'carK', 'carK', 'vendrow', 'vendrow', 'vendrow', 'garbage', 'bikerack', 'sign', 'sign', 'fence', 'fence', 'fence', 'fence', 'fence', 'fence', 'streetset', 'standsign', 'crates', 'fence', 'carK'], -34, 34, -26, 26, this.pal, ['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a'], 60);
    }
  },

  /* ---------- 学校（ろうかと、たくさんの部屋） ----------
     北：教室×2／職員室／校長室／保健室／放送室／図書室／昇降口（げた箱）
     南：音楽室／図工室／理科室／トイレ／体育倉庫／体育館（ステージ・幕） */
  school: {
    name: '学校', hx: 34, hz: 26, sky: '#bfe0f5', pal: ['#f2efe6', '#c9a26b', '#d7b47c', '#5f87b8', '#b85f5f', '#cfe0d3'], spawn: [0, 0],
    build(h) {
      const P = this.pal, A = TOY, T = roomTools(h, 34, 26), { RM, put, shelf, win, art, FL, wood, tile, rug } = T;
      const C1 = RM(-34, -20, -26, -3), C2 = RM(-20, -6, -26, -3), STF = RM(-6, 8, -14, -3), PRN = RM(-6, 8, -26, -14), NUR = RM(8, 15, -14, -3), BRD = RM(8, 15, -26, -14), LIB = RM(15, 34, -26, -12), ENT = RM(15, 34, -12, -3);
      const MUS = RM(-34, -20, 3, 26), ART = RM(-20, -6, 3, 26), SCI = RM(-6, 6, 3, 26), WC = RM(6, 12, 3, 13), STO = RM(6, 12, 13, 26), GYM = RM(12, 34, 3, 26);
      // ---- 床 ----
      tile('#d9d4c7', '#c9c4b7', -34, 34, -3, 3);
      wood('#c9a26b', -34, -6, -26, -3); FL(-6, 8, -14, -3, ['fabric', '#8d939a', 0, 6, 5]); FL(-6, 8, -26, -14, ['fabric', '#7a2f2f', 0, 6, 5]);
      tile('#eef6f2', '#cfe0d8', 8, 15, -14, -3); FL(8, 15, -26, -14, ['fabric', '#3a414a', 0, 3, 5]); wood('#b98d5c', 15, 34, -26, -12); FL(15, 34, -12, -3, ['check2', '#9aa1a8', '#8d8f94', 9, 4]);
      wood('#b98d5c', -34, -20, 3, 26); FL(-20, -6, 3, 26, ['vstripe', '#c9a26b', '#bf9860', 7, 1]); tile('#e8eef0', '#c9d3d8', -6, 6, 3, 26);
      tile('#d8ecf4', '#a8c8d8', 6, 12, 3, 13); FL(6, 12, 13, 26, ['noise', '#a9a59a', 0, 2, 5]); wood('#d9a55a', 12, 34, 3, 26);
      h.outer(6, '#f2efe6');
      h.boxc(0, ROOM_WALL, 0, 2 * 34 + 8, 2, 2 * 26 + 8, { noclimb: true, sharp: true }); // 見えない天井（壁のふちには乗れない）
      // ---- 壁（部屋ごとに色・模様を変える）----
      const S = {
        cor: ['#f2efe6'], c1: ['#f2efe6'], c2: ['#f6f1e2'], stf: ['#e9e4d8'], prn: ['#d9c7a0', ['vband', '#cdb88e', 1]], nur: ['#eef6f2'], brd: ['#5f6f7f', ['dots', '#4f5f6f', 1]],
        lib: ['#efe3cf', ['dots', '#e2d2b6', 1]], ent: ['#e4e9ee'], mus: ['#f3ead8', ['vband', '#e8dcc0', 1]], art: ['#cfe0d3', ['splat', TOY, 1]], sci: ['#e8eef0'],
        wc: ['#d8ecf4', ['tile', '#a8cfe0']], sto: ['#d9d4c7'], gym: ['#f2efe6'],
      };
      wallR(h, 'x', -3, -34, -20, [[-31, 2], [-23, 2]], S.c1, S.cor); wallR(h, 'x', -3, -20, -6, [[-17, 2], [-9, 2]], S.c2, S.cor); wallR(h, 'x', -3, -6, 8, [[1, 2.2]], S.stf, S.cor);
      wallR(h, 'x', -3, 8, 15, [[11.5, 2]], S.nur, S.cor); wallR(h, 'x', -3, 15, 34, [[24.5, 17, true]], S.ent, S.cor);
      wallR(h, 'x', 3, -34, -20, [[-31, 2], [-23, 2]], S.cor, S.mus); wallR(h, 'x', 3, -20, -6, [[-17, 2], [-9, 2]], S.cor, S.art); wallR(h, 'x', 3, -6, 6, [[-3, 2], [3, 2]], S.cor, S.sci);
      wallR(h, 'x', 3, 6, 12, [[9, 1.8]], S.cor, S.wc); wallR(h, 'x', 3, 12, 34, [[17, 3], [29, 3]], S.cor, S.gym);
      wallR(h, 'z', -20, -26, -3, [], S.c1, S.c2); wallR(h, 'z', -20, 3, 26, [[14.5, 2]], S.mus, S.art);
      wallR(h, 'z', -6, -26, -14, [], S.c2, S.prn); wallR(h, 'z', -6, -14, -3, [[-8.5, 2]], S.c2, S.stf); wallR(h, 'z', -6, 3, 26, [[20, 2]], S.art, S.sci);
      wallR(h, 'z', 8, -26, -14, [[-22, 1.8]], S.prn, S.brd); wallR(h, 'z', 8, -14, -3, [[-8.5, 1.8]], S.stf, S.nur);
      wallR(h, 'z', 15, -26, -14, [[-18, 1.8]], S.brd, S.lib); wallR(h, 'z', 15, -14, -12, [], S.nur, S.lib); wallR(h, 'z', 15, -12, -3, [], S.nur, S.ent);
      wallR(h, 'z', 6, 3, 13, [], S.sci, S.wc); wallR(h, 'z', 6, 13, 26, [], S.sci, S.sto); wallR(h, 'z', 12, 3, 13, [], S.wc, S.gym); wallR(h, 'z', 12, 13, 26, [[19, 2.4]], S.sto, S.gym);
      wallR(h, 'x', -14, -6, 8, [[4, 2]], S.prn, S.stf); wallR(h, 'x', -14, 8, 15, [], S.brd, S.nur); wallR(h, 'x', -12, 15, 34, [[21.2, 2.4], [28.2, 2.4]], S.lib, S.ent); wallR(h, 'x', 13, 6, 12, [], S.wc, S.sto);
      // 開いたドア（ドアと壁のあいだに隠れる）
      doorOpen(h, 3.15, -3.2, [0, -1], 2.0, '#b08a5a'); doorOpen(h, 12.6, -3.2, [0, -1], 1.8, '#cfe0d8'); doorOpen(h, 5.1, -14.2, [0, -1], 1.8, '#5a3c28');
      doorOpen(h, 10.0, 3.2, [0, 1], 1.6, '#7fb7d8'); doorOpen(h, 12.2, 20.3, [1, 0], 2.2, '#9aa1a8'); doorOpen(h, -20.2, 15.6, [-1, 0], 1.8, '#c9a26b');
      // ---- ろうか（ロッカー・ベンチ・けいじ板・消火器）----
      for (const x of [-27, -13]) lockerRowF(h, x, 2.55, [0, -1], 3.6, x < -20 ? '#5f87b8' : '#b85f5f');
      lockerRowF(h, -1.2, -2.55, [0, 1], 2.6, '#6f9f6f'); lockerRowF(h, 6.8, 2.55, [0, -1], 1.3, '#9aa1a8');
      for (const x of [-19.5, -5.6, 20.5]) bench(h, x, 2.35, true, '#8a5a33', 1);
      for (const x of [-27, -13, 5.5]) art({ x0: -34, x1: 34, z0: -2.8, z1: 2.8 }, 'n', x + 34, 1.2, 2.2, 1.4);
      for (const x of [-33.2, 33.2]) KIT.tallplant(h, x, 0, P, A);
      h.cyl(-33.4, 0, -2.2, 0.16, 0.6, '#e0413a', { seg: 12 }); h.cyl(33.4, 0, 2.2, 0.16, 0.6, '#e0413a', { seg: 12 }); // 消火器
      // ---- 教室（黒板・教壇・つくえ5×5・ランドセルのたな・ロッカー）----
      const classroom = (R, cx, cc) => {
        blackboardF(h, cx, -26, [0, 1], 9); h.B(cx, 0, -24.9, 10, 0.18, 2.0, '#b98d5c', { r: 0.02, pat: ['floorwood', '#b98d5c', 0, 4, 1] });
        lecternF(h, cx, -22.9, [0, 1]);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) schoolDesk(h, cx - 5.2 + i * 2.6, -20.2 + j * 3.0, cc, -1);
        cubbyF(h, cx, -3.425, [0, -1], 5.6);
        put(R, 'e', -1.6, 0.5, lockerRowF, 2.4, '#9aa1a8'); plant(h, R.x1 - 0.6, R.z0 + 0.6);
        art(R, 'e', 9, 1.4, 2.4, 1.6); art(R, 'e', 14.5, 1.4, 2.4, 1.6);
      };
      classroom(C1, -27, '#4f7fe0'); classroom(C2, -13, '#e04f4f');
      win(C1, 'w', 8, 2.4); win(C1, 'w', 14, 2.4); shelf(C1, 'w', 4.0, 3.0, 1.6, '#b08a5a', 0.6); art(C2, 'w', 4, 1.3, 2.0, 1.4);
      // ---- 職員室（先生のつくえの島・コピー機・本だな・ソファ）----
      for (const iz of [-10, -6]) for (let k = 0; k < 3; k++) { deskF(h, -3.9 + k * 1.5, iz - 0.35, [0, -1], '#9aa1a8', k === 1 ? 'pc' : 'study'); deskF(h, -3.9 + k * 1.5, iz + 0.35, [0, 1], '#9aa1a8', k === 1 ? 'study' : 'pc'); }
      shelf(STF, 'n', 2.0, 3.2, 2.0, '#9aa1a8', 0.6); shelf(STF, 'n', 5.8, 3.0, 2.0, '#9aa1a8', 0.6); blackboardF(h, 7.8, -11.3, [-1, 0], 3);
      h.B(6.6, 0, -13.1, 1.2, 1.05, 0.8, '#d5dbe0', { r: 0.05 }); h.B(6.6, 1.05, -13.1, 1.0, 0.1, 0.6, '#9aa1a8', { r: 0.03 }); // コピー機
      sofaF(h, 7.2, -5.0, [-1, 0], 2.2, '#7d8fb3'); table(h, 5.6, -5.0, 0.8, 1.4, '#6b4a2b', 0.42); KIT.tallplant(h, -5.2, -3.9, P, A); KIT.clock(h, -5.3, -12.4, P, A);
      // ---- 校長室（大きなつくえ・ソファのセット・トロフィーのたな・肖像画）----
      deskF(h, 1, -22.6, [0, -1], '#5a3c28', 'pc'); rug(1, -17.5, 6, 3.6, 'diag', '#7a2f2f', '#c9a24a');
      sofaF(h, -1.6, -17.5, [1, 0], 2.4, '#7a2f2f'); sofaF(h, 3.6, -17.5, [-1, 0], 2.4, '#7a2f2f'); table(h, 1, -17.5, 1.2, 2.0, '#5a3c28', 0.45);
      put(PRN, 'w', 6, 0.5, cupboardF, 3.0, '#5a3c28'); shelf(PRN, 'e', 1.6, 3.0, 2.2, '#5a3c28', 0.6); win(PRN, 'n', 6.8, 2.4);
      art(PRN, 'n', 2.4, 1.7, 1.2, 1.5); art(PRN, 'n', 11.2, 1.7, 1.2, 1.5); KIT.tallplant(h, -5.2, -25.3, P, A); KIT.tallplant(h, 7.2, -14.8, P, A);
      for (const [x, c] of [[-1.6, '#e04f4f'], [3.6, '#4f7fe0']]) { h.cyl(x, 0, -24.9, 0.25, 0.05, '#c9a24a'); h.cyl(x, 0.05, -24.9, 0.03, 2.2, '#c9a24a', { seg: 8 }); h.B(x + 0.45, 1.5, -24.9, 0.9, 0.6, 0.02, c, { nocol: true, pat: ['hstripe', c, '#f4f4f4', 1, 3] }); } // 旗
      // ---- 保健室（カーテンのベッド・薬のたな・つくえ・洗面台・身長計）----
      bedF(h, 13.55, -12.0, [-1, 0], '#cfe8e0', 1.1, 2.2); bedF(h, 13.55, -8.6, [-1, 0], '#f6e1ea', 1.1, 2.2);
      curtainF(h, 13.6, -10.3, [0, 1], 2.4, 2.1, '#cfe8e0'); curtainF(h, 12.1, -12.4, [1, 0], 1.6, 2.1, '#cfe8e0'); curtainF(h, 12.1, -8.3, [1, 0], 1.2, 2.1, '#f6e1ea');
      put(NUR, 'n', 1.5, 0.5, cupboardF, 2.2, '#f4f4f4'); put(NUR, 'w', 2.2, 0.7, deskF, '#f4f4f4', 'study'); put(NUR, 'w', -1.3, 0.55, vanityF, 1.2);
      sofaF(h, 13.6, -3.775, [0, -1], 1.6, '#59b6d8'); h.B(14.3, 0, -5.6, 0.5, 0.06, 0.5, '#c9ccd0'); h.cyl(14.45, 0.06, -5.6, 0.04, 2.0, '#c9ccd0', { seg: 8 }); h.B(14.3, 1.5, -5.6, 0.3, 0.04, 0.3, '#c9ccd0', NC); // 身長計
      // ---- 放送室（ミキサー・スピーカー・マイク・CDのたな）----
      put(BRD, 'n', 3.3, 0.65, counterF, 4.0, { c: '#55606b', top: '#2a3038' });
      for (let i = 0; i < 10; i++) h.B(9.7 + i * 0.3, 0.951, -25.1 + (i % 2) * 0.18, 0.12, 0.03, 0.12, pick(h, ['#e04f4f', '#3dff9a', '#f0d040', '#59b6d8']), { nocol: true, glow: 0.5 });
      for (const x of [9.0, 14.0]) h.B(x, 0, -24.0, 0.7, 1.3, 0.6, '#2a3038', { r: 0.05, pat: ['dots', '#2a3038', '#55606b', 1, 2] }); // スピーカー
      shelf(BRD, 'w', 8.5, 2.2, 2.0, '#2a3038', 0.5); chair(h, 11.5, -23.6, '#2a3038', -1); rod(h, [12.6, 0, -21.5], [12.6, 1.5, -21.5], 0.025, '#2a3038'); h.ball(12.6, 1.55, -21.5, 0.08, '#55606b', NC);
      sofaF(h, 14.2, -15.3, [-1, 0], 2.0, '#2a3038'); carton(h, 9.0, 0, -15.0, 0.9, 0.7, 0.9, CARD[0]); carton(h, 9.0, 0.7, -15.0, 0.7, 0.5, 0.7, CARD[2]);
      // ---- 図書室（本だなの列・読書テーブル・カウンター・絵本コーナー）----
      for (const x of [19.5, 23.2, 26.9, 30.6]) bookshelf(h, x, -21.2, 0.9, 6, 2.2, pick(h, ['#8a5a33', '#7a4c2a', '#9a6a43']));
      shelf(LIB, 'n', 3.5, 5, 2.4, '#8a5a33'); shelf(LIB, 'n', 10.5, 5, 2.4, '#8a5a33'); shelf(LIB, 'n', 16, 3.5, 2.4, '#8a5a33');
      for (const x of [20.5, 27.0]) { table(h, x, -15.3, 3.2, 1.5, '#c9a26b'); for (const dx of [-1, 0, 1]) { chair(h, x + dx, -14.25, '#5f87b8', -1); chair(h, x + dx, -16.35, '#5f87b8', 1); } }
      h.B(16.2, 0, -14.6, 0.8, 1.0, 2.6, '#c9a26b', { r: 0.03, pat: ['grain', '#c9a26b', 0, 1, 2] }); h.B(16.2, 1.0, -14.6, 0.95, 0.05, 2.75, '#8a5a33', { r: 0.02 }); // カウンター
      rug(31.6, -15.0, 3.6, 3.6, 'dots', '#f0d040', '#e0719a'); KIT.beanbag(h, 32.4, -13.6, P, A); KIT.beanbag(h, 30.6, -16.2, P, A); globeF(h, 15.9, -24.6);
      win(LIB, 'e', 5, 2.0); win(LIB, 'e', 10.5, 2.0);
      // ---- 昇降口（げた箱の列・かさ立て・ガラスの戸・マット）----
      for (const x of [19.5, 23.0, 26.5, 30.0]) getabakoF(h, x, -7.4, [1, 0], 4.8, 1.7);
      glass(h, 33.8, 0, -7.4, 0.12, 2.6, 4.2); h.B(33.85, 2.6, -7.4, 0.3, 0.2, 4.6, '#9aa1a8'); rug(32.4, -7.4, 1.8, 4.0, 'hstripe', '#3f5f8a', '#2f4f7a');
      KIT.umbrella(h, 17.2, -4.2, P, A); KIT.umbrella(h, 32.6, -4.0, P, A); bench(h, 32.8, -10.6, true, '#8a5a33', -1); art(ENT, 'n', 9.3, 1.3, 3.0, 1.6);
      // ---- 音楽室（ひな段・いすと譜面台・ピアノ・ドラム・ティンパニ）----
      blackboardF(h, -27, 26, [0, -1], 6); for (let k = 0; k < 5; k++) h.B(-27, 1.35 + k * 0.22, 25.86, 5.6, 0.02, 0.01, '#f4f4f4', NC); // 五線
      risersF(h, -27, 12.0, [0, -1], 3, 10, 0.22, 2.2, '#b98d5c');
      for (let i = 0; i < 6; i++) { const x = -31.2 + i * 1.7, z = 16.2 + Math.abs(i - 2.5) * 0.35; chair(h, x, z, '#3f5f8a', 1); standF(h, x, z + 0.9); }
      put(MUS, 'w', -4.5, 0.6, pianoF); KIT.music(h, -24.0, 21.0, P, A); drumF(h, -32.8, 13.6); drumF(h, -32.6, 15.2, 0.38);
      shelf(MUS, 'e', 4.0, 3.0, 2.0, '#8a5a33'); shelf(MUS, 'e', 20.5, 3.0, 2.0, '#8a5a33'); art(MUS, 'n', 6.8, 2.2, 2.0, 1.2); win(MUS, 's', 2.2, 1.6); win(MUS, 's', 11.8, 1.6);
      // ---- 図工室（大きなつくえ・流し・イーゼル・作品）----
      for (const [x, z] of [[-16, 9], [-10, 9], [-16, 16.5], [-10, 16.5]]) { table(h, x, z, 4, 2, '#e8dcc8'); for (const dx of [-1.2, 1.2]) { stool(h, x + dx, z - 1.5, '#55606b'); stool(h, x + dx, z + 1.5, '#55606b'); } }
      put(ART, 's', 6.8, 0.65, counterF, 8.0, { sink: -2.0 }); TOY.forEach((c, i) => h.lathe(-15.6 + i * 1.2, 0.95, 25.4, [[0.001, 0], [0.25, 0], [0.25, 0.36], [0.22, 0.39], [0.001, 0.39]], c, { seg: 14 }));
      art(ART, 'w', 4.5, 0.15, 2.6, 2.4); art(ART, 'w', 19.5, 0.15, 2.6, 2.4);
      KIT.easel(h, -7.6, 7.0, P, A); KIT.easel(h, -7.6, 12.0, P, A); KIT.robot(h, -18.7, 22.6, P, A); KIT.dino(h, -8.6, 23.0, P, A);
      // ---- 理科室（実験台・薬品のたな・水そう・地球儀）----
      for (const [x, z] of [[-2.5, 9.5], [2.5, 9.5], [-2.5, 16.5], [2.5, 16.5]]) labBenchF(h, x, z, [1, 0], 3.0);
      blackboardF(h, 0, 26, [0, -1], 6); labBenchF(h, 0, 23.0, [0, 1], 3.2);
      put(SCI, 'w', 4.5, 0.55, rackF, 3.0, 2.0, 'bath'); put(SCI, 'e', 12.0, 0.55, rackF, 3.0, 2.0, 'bath'); KIT.aquarium(h, 4.6, 21.0, P, A); globeF(h, -4.9, 24.6); art(SCI, 'e', 18.5, 1.3, 2.4, 1.6);
      // ---- トイレ（個室・小便器・洗面台）----
      for (const z of [6.0, 7.5, 9.0, 10.5]) stallF(h, 10.95, z, [-1, 0]);
      for (const z of [6.2, 7.4, 8.6]) { h.B(6.45, 0.35, z, 0.36, 0.65, 0.45, '#f4f4f4', { r: 0.1 }); h.B(6.5, 0.6, z + 0.6, 0.5, 1.0, 0.04, '#7fb7d8', { r: 0.01 }); }
      put(WC, 'n', 0.9, 0.55, vanityF, 1.6); KIT.cleaning(h, 7.2, 12.0, P, A);
      // ---- 体育倉庫（マット・とび箱・ボールかご・たな）----
      matsF(h, 8.0, 15.0, 6); vaultF(h, 7.4, 18.6, 6, false); ballCartF(h, 10.6, 15.0); put(STO, 's', 2.8, 0.55, rackF, 4.0, 2.0, 'store');
      matsF(h, 8.6, 22.0, 4, '#e04f4f'); put(STO, 'w', 9.5, 0.5, lockerRowF, 2.0, '#9aa1a8'); pylon(h, 10.9, 23.4); pylon(h, 11.3, 22.8);
      // ---- 体育館（コートの線・バスケットゴール・ステージと幕・観客席）----
      h.B(23, 0, 14.6, 0.15, 0.02, 22.5, '#ffffff', { nocol: true, flat: true }); h.cyl(23, 0, 14.6, 3, 0.02, '#c98f4e', { nocol: true, flat: true });
      for (const [z, s] of [[3.55, 1], [25.65, -1]]) { h.B(23, 0, z, 0.3, 3.6, 0.3, '#888e94'); h.B(23, 2.7, z + s * 0.4, 1.8, 1.2, 0.15, '#ffffff'); h.ring(23, 2.9, z + s * 0.75, 0.25, 0.025, '#e0413a'); }
      h.B(31.75, 0, 14.6, 4.5, 1.1, 15, '#b98d5c', { r: 0.03, pat: ['floorwood', '#b98d5c', 0, 2, 5] }); // ステージ
      risersF(h, 27.3, 14.6, [1, 0], 5, 3, 0.22, 0.44, '#b98d5c');
      curtainF(h, 29.75, 8.9, [1, 0], 3.6, 4.4, '#9a2a2a', 1.1); curtainF(h, 29.75, 20.3, [1, 0], 3.6, 4.4, '#9a2a2a', 1.1); curtainF(h, 32.9, 14.6, [-1, 0], 13, 4.4, '#7a2020', 1.1);
      h.lathe(31.0, 1.1, 12.4, [[0.001, 0], [0.2, 0], [0.26, 0.5], [0.001, 0.5]], '#c9a24a', { seg: 12 }); h.lump(31.0, 1.9, 12.4, 0.4, 0.4, 0.4, '#e0719a', { seed: 2, bump: 0.2, freq: 3, pat: ['confetti', '#e0719a', ['#f4f4f4', '#f0d040'], 2, 1] });
      risersF(h, 15.4, 9.0, [-1, 0], 3, 10, 0.22, 1.0, '#b08a5a');
      vaultF(h, 18.0, 21.5, 5); matsF(h, 21.5, 23.8, 3); ballCartF(h, 26.2, 23.8); for (let i = 0; i < 4; i++) h.ball(14 + i * 1.1, 0.35, 24.9 - (i % 2) * 0.5, 0.35, i % 2 ? '#f08a3c' : '#e04f4f', { pat: ['hstripe', i % 2 ? '#f08a3c' : '#e04f4f', '#2a3038', 1, 4] });
    }
  },

  /* ---------- 倉庫 ---------- */
  warehouse: {
    name: '倉庫', hx: 36, hz: 26, sky: '#39424d', dark: 0.62, floorTex: 'concrete', kit: ['crate', 'barrel', 'tiresK', 'junk', 'bags', 'bags', 'logs', 'goods', 'screen', 'mural', 'pole', 'bigbox', 'bigbox', 'dumpster', 'pipe', 'hut', 'graffiti', 'graffiti', 'nook', 'blocks', 'stairs', 'ladderK', 'cleaning', 'bike', 'garden', 'gym', 'crates', 'gasbottle', 'cart', 'barricade', 'fence'], acc: ['#b8452f', '#2f6fb0', '#3f9b6a', '#d98a2b', '#e0c030', '#f4f4f4'], pal: ['#8a8d91', '#70757b', '#2f6fb0', '#d98a2b', '#b8452f', '#3d5f93'], clutter: 100, spawn: [3, 1],
    build(h) {
      h.F(0, 0, 72, 52, '#8a8d91');
      h.outer(7, '#70757b');
      h.B(0, 0, 0, 72, 0.02, 0.3, '#e0c030', FL); h.B(-4, 0, 0, 0.3, 0.02, 52, '#e0c030', FL); h.B(4, 0, 0, 0.3, 0.02, 52, '#e0c030', FL);
      // コンテナ（波板・とびらのかんぬき・角の金具）
      const box = (x, y, z, c, alongX) => {
        h.B(x, y, z, alongX ? 6 : 2.5, 2.6, alongX ? 2.5 : 6, c, { r: 0.04, pat: ['corrugate', c, 0, alongX ? 3 : 1, 1] });
        const ex = alongX ? x + 3.01 : x, ez = alongX ? z : z + 3.01;
        for (let k = 0; k < 4; k++) h.B(alongX ? ex : x - 0.9 + k * 0.6, y + 0.2, alongX ? z - 0.9 + k * 0.6 : ez, alongX ? 0.04 : 0.05, 2.2, alongX ? 0.05 : 0.04, '#c9ccd0', NC); // かんぬき
        for (const s of [-1, 1]) for (const t of [0, 1]) h.B(alongX ? x + s * 2.92 : x + s * 1.17, y + t * 2.42, alongX ? z + 1.17 : z + s * 2.92, 0.18, 0.18, 0.18, shade(c, 0.7), NC); // 角の金具
      };
      let k = 0;
      for (const x of [-30, -22.5, -15]) for (const z of [-21, -15, -9]) { box(x, 0, z, CONT[k % 7], true); if (h.rnd() < 0.45) box(x, 2.6, z, CONT[(k + 3) % 7], true); k++; }
      for (const z of [8, 15, 22]) box(-31, 0, z, CONT[k++ % 7], false);
      // ラック（柱・棚板・段ボール）
      for (const x of [9, 15, 21, 27, 33]) {
        for (const z of [-21.5, -7.5, -14.5]) h.B(x, 0, z, 1.4, 3.8, 0.2, '#3d5f93', { pat: ['vents', '#3d5f93', 0, 1, 3] });
        h.B(x, 1.3, -14.5, 1.5, 0.1, 14, '#e08a2b'); h.B(x, 2.6, -14.5, 1.5, 0.1, 14, '#e08a2b');
        for (let i = 0; i < 5; i++) { const z = -20.5 + i * 3 + h.rnd(), s = 0.8 + h.rnd() * 0.4; carton(h, x, 0, z, s, s, s, CARD[i % 4]); if (h.rnd() < 0.6) carton(h, x, 1.4, z + 1, s, s * 0.9, s, CARD[(i + 1) % 4]); if (h.rnd() < 0.4) carton(h, x, 2.7, z - 0.5, s, s * 0.8, s, CARD[(i + 2) % 4]); }
      }
      // パレット（板のすき間つき）と段ボールの山
      for (let x = -22; x <= 14; x += 5.2) for (let z = 6; z <= 22; z += 5.4) {
        if (h.rnd() < 0.2) continue;
        pallet(h, x, z); const s = 1.2 + h.rnd() * 0.3, lv = 1 + Math.floor(h.rnd() * 2.4);
        for (let i = 0; i < lv; i++) carton(h, x, 0.15 + i * 1.0, z, s - i * 0.15, 1.0, s - i * 0.15, CARD[Math.floor(h.rnd() * 4)]);
      }
      for (const p of [[-18, 0], [18, 0], [-26, 3.5], [2, -24], [-9, -12.5], [30, 9], [0, 12], [-22, 24.5]]) lamp(h, p[0], p[1], 3.2);
      // ドラム缶・フォークリフト・柱
      for (let i = 0; i < 10; i++) drum(h, -33 + (i % 4) * 1.15, -3.5 + Math.floor(i / 4) * 1.15, ['#2f6fb0', '#d98a2b', '#b8452f'][i % 3]);
      for (const p of [[-8, -3], [18, 3]]) {
        h.B(p[0], 0.15, p[1], 1.4, 1.15, 2.4, '#e0b020', { r: 0.1 }); h.B(p[0], 1.3, p[1] + 0.3, 1.2, 0.9, 1.2, '#2a3038', { r: 0.06 }); h.B(p[0], 2.2, p[1] + 0.3, 1.3, 0.08, 1.3, '#e0b020');
        for (const s of [-1, 1]) { h.B(p[0] + s * 0.4, 0, p[1] - 1.5, 0.1, 2.6, 0.12, '#2a3038'); h.B(p[0] + s * 0.3, 0.1, p[1] - 2.2, 0.15, 0.06, 1.2, '#55606b'); h.cyl(p[0] + s * 0.6, 1.3, p[1] + 0.9, 0.04, 0.9, '#2a3038', { seg: 6 }); }
        for (const s of [-1, 1]) for (const t of [-1, 1]) h.wheel(p[0] + s * 0.62, 0.3, p[1] + t * 0.8, 0.3, 0.22, 'x');
      }
      for (const x of [-18, 0, 18]) for (const z of [-4, 4]) { h.B(x, 0, z, 0.8, 7, 0.8, '#70757b', { pat: ['hstripe', '#70757b', '#e0c030', 1, 1] }); h.B(x, 0, z, 0.9, 1.2, 0.9, '#e0c030', { pat: ['diag', '#e0c030', '#2a3038', 2, 1] }); }
      // 事務所
      wallX(h, 12, 22, 29, '#d8d2c4', 3.2); wallX(h, 12, 32, 36, '#d8d2c4', 3.2); wallZ(h, 22, 12, 26, '#d8d2c4', 3.2);
      h.F(29, 19, 14, 14, '#5b76b8', null, 1);
      table(h, 30, 22, 3, 1.4, '#c98f4e'); chair(h, 30, 20.6, '#2a3038', 1); h.B(35.2, 0, 18, 1, 2, 4, '#8d8f94', { pat: ['cabinet', '#8d8f94', '#2a3038', 1, 4] }); h.B(23.2, 0, 23, 1, 1.2, 3, '#9aa1a8', { pat: ['cabinet', '#9aa1a8', '#2a3038', 1, 3] }); plant(h, 34.5, 13.5);
      // トラック（荷台・運転席・窓・車輪）
      h.B(28, 0.5, 4, 8, 2.8, 2.6, '#e9edf0', { r: 0.06, pat: ['corrugate', '#e9edf0', 0, 4, 1] }); h.B(33.2, 0.5, 4, 2.2, 2, 2.4, '#b8452f', { r: 0.2 }); h.B(34.31, 1.6, 4, 0.04, 0.7, 1.9, '#1e2a36', { nocol: true, rough: 0.12 }); h.B(34.4, 0.5, 4, 0.2, 0.4, 2.4, '#2a3038', { r: 0.06 });
      for (const dx of [-3, 0, 4.6]) for (const dz of [-1.2, 1.2]) h.wheel(28 + dx, 0.45, 4 + dz, 0.45, 0.3, 'z');
      h.B(-12, 0, 2, 2.4, 1.2, 1.4, '#3f9b6a', { pat: ['corrugate', '#3f9b6a', 0, 1, 1] }); h.B(8, 0, 24.8, 5, 1, 1, '#55606b', { pat: ['cabinet', '#55606b', '#c9ccd0', 4, 1] });
      scatter(h, ['crates', 'crates', 'gasbottle', 'cart', 'barricade', 'fence', 'fence', 'carK', 'vendrow', 'crates', 'gasbottle'], -34, 34, -24, 24, this.pal, this.acc, 50);
    }
  },

  /* ---------- 夜の商店街（模様の外壁・日よけ・ベランダ・看板・屋上・中庭の街） ---------- */
  town: {
    name: '夜の商店街', hx: 36, hz: 28, sky: '#0b1024', night: true, dark: 0.5, floorTex: 'asphalt', kit: ['statue', 'crate', 'barrel', 'planter', 'vend', 'junk', 'bags', 'sculpt', 'parasol', 'goods', 'laundry', 'hedge', 'mural', 'pole', 'booth', 'dumpster', 'gallery', 'hut', 'bigbox', 'graffiti', 'nook', 'blocks', 'bike', 'garden', 'music', 'vendrow', 'bikerack', 'garbage', 'sign', 'standsign', 'crates', 'streetset', 'carK'], pal: ['#b9b7b0', '#4a4d52', '#d9b08c', '#c97b63', '#9fb7c4', '#8a5a33'], clutter: 40, spawn: [12, 0],
    build(h) {
      h.F(0, 0, 72, 56, '#4a4d52');
      h.outer(9, '#8d8f94');
      city(h, { pal: ['#d9b08c', '#c97b63', '#e8dcc8', '#9fb7c4', '#b5c99a', '#d8a7b1', '#c9c2b0', '#a7b8d8', '#e0c48c', '#b89c84'], acc: ['#e04f4f', '#3f9b6a', '#2f6fb0', '#f08a3c', '#b06fd8', '#f0d040'], night: true, neon: false, facade: ['brick', 'vband', 'hstripe', 'check2', 'dots', 'wave', 'diag', 'bigcamo'], hmin: 5, hmax: 9 });
      scatter(h, ['carK', 'carK', 'vendrow', 'garbage', 'bikerack', 'sign', 'sign', 'barricade', 'crates', 'standsign', 'streetset', 'fence', 'cart', 'vendrow', 'bikerack'], -34, 34, -26, 26, this.pal, ['#e04f4f', '#3f9b6a', '#2f6fb0', '#f08a3c', '#b06fd8', '#f0d040'], 60); // 路地・中庭の小物
      h.ball(-60, 50, -70, 5, '#fff6d8', { glow: 1.6, nolight: true });
    }
  },
  /* ---------- ガソリンスタンド（まんたんステーションより） ---------- */
  station: {
    name: 'ガソリンスタンド', hx: 34, hz: 26, sky: '#a9d4ee', floorTex: 'asphalt', kit: ['statue', 'crate', 'barrel', 'tiresK', 'junk', 'bags', 'pylonK', 'vend', 'sculpt', 'parasol', 'goods', 'screen', 'mural', 'dumpster', 'booth', 'bigbox', 'hut', 'pipe', 'graffiti', 'graffiti', 'nook', 'blocks', 'patch', 'bike', 'cleaning', 'ladderK', 'garden', 'carK', 'vendrow', 'crates', 'gasbottle', 'standsign', 'cart', 'fence', 'barricade'], pal: ['#5a5d62', '#e0413a', '#f4f4f4', '#eee9df', '#b9c0c7', '#2f6fb0'], clutter: 84, spawn: [0, 13],
    build(h) {
      h.F(0, 0, 68, 52, '#5a5d62'); h.outer(7, '#b9c0c7');
      h.F(0, 21, 68, 10, '#44474c', ['img:road', '#44474c', 0.2, 8, 1.2], 1);
      h.B(0, 0, 15.4, 68, 0.15, 1.2, '#b9b7b0', { flat: true, pat: ['check2', '#b9b7b0', '#aaa8a1', 34, 1] });
      // コンビニ
      const W = '#eee9df';
      h.F(0, -17, 28, 18, '#e9e7df', ['img:tile', '#ffffff', 0.05, 7, 4.5], 1);
      wallZ(h, -14, -26, -8, W); wallZ(h, 14, -26, -8, W); wallX(h, -8, -14, -2, W); wallX(h, -8, 2, 14, W); wallX(h, -19, -14, 9, W);
      h.B(0, 3.5, -7.6, 12, 0.9, 0.3, '#e0413a', { glow: 0.7 }); h.B(0, 3.5, -7.4, 5, 0.5, 0.1, '#ffffff', { nocol: true, glow: 1 });
      [-9, -4.5, 4.5, 9].forEach((x, i) => { for (const z of [-11.5, -15]) { h.B(x, 0, z, 3.4, 1.5, 0.8, '#d9d2c4', { r: 0.03 }); h.B(x, 1.5, z, 3.2, 0.25, 0.6, TOY[(i + (z < -12 ? 3 : 0)) % 6], { pat: ['vend', '#f4f4f4', TOY, 3, 1] }); for (const s of [-1, 1]) h.B(x, 0.1, z + s * 0.41, 3.3, 1.3, 0.01, '#f4f4f4', { nocol: true, pat: ['books', '#d9d2c4', TOY, 3, 1] }); } });
      h.B(0, 0, -13.2, 2.4, 1.1, 1.2, '#f4f4f4', { r: 0.04 }); for (let i = 0; i < 3; i++) h.ball(-0.7 + i * 0.7, 1.3, -13.2, 0.25, TOY[i]);
      h.B(-9.5, 0, -9.3, 5, 1, 1, '#3f5f8a', { r: 0.04 }); h.B(-10.5, 1, -9.3, 0.5, 0.35, 0.5, '#22262b', { r: 0.04 }); h.B(-8.5, 1, -9.3, 0.5, 0.35, 0.5, '#22262b', { r: 0.04 }); // レジ
      h.B(-13.3, 0, -14.5, 0.9, 2.2, 7, '#cfe6f0', { glow: 0.25, pat: ['vend', '#cfe6f0', TOY, 5, 2] }); h.B(12.9, 0, -10.5, 1.2, 1.4, 3, '#3a3a3a', { r: 0.04 }); h.cyl(12.9, 1.4, -10, 0.2, 0.4, '#e0413a');
      for (let i = 0; i < 10; i++) { const x = -12 + (i % 5) * 2.1, z = -21.5 - Math.floor(i / 5) * 2.2; carton(h, x, 0, z, 1, 0.9, 1, CARD[i % 4]); if (i % 3 === 0) carton(h, x, 0.9, z, 0.85, 0.8, 0.85, CARD[(i + 1) % 4]); }
      h.B(3, 0, -25.3, 7, 2.2, 0.9, '#55606b', { pat: ['cabinet', '#55606b', '#c9ccd0', 6, 2] }); table(h, 11.5, -24, 2.4, 1.2, '#c98f4e'); h.B(11.5, 0.76, -24.2, 0.9, 0.6, 0.12, '#15171a'); chair(h, 11.5, -22.7, '#2a3038', -1);
      // キャノピーと給油機
      for (const x of [-12.5, 12.5]) for (const z of [0.5, 9.5]) h.cyl(x, 0, z, 0.32, 5.2, '#e9edf0');
      h.B(0, 5.2, 5, 28, 0.7, 12, '#f4f4f4', { r: 0.3 }); h.B(0, 5.25, 5, 28.3, 0.3, 12.3, '#e0413a');
      for (const x of [-8, 0, 8]) { pump(h, x, 5); h.B(x, 5.1, 5, 3.4, 0.08, 1.4, '#fff4c2', { nocol: true, glow: 1.6 }); }
      car(h, -4, 5, '#2f6fb0', false); car(h, 4, 3.5, '#f0d040', false); car(h, -26, -15, '#b8262b', false); car(h, -22.5, -15, '#e9edf0', false);
      // 店の前
      vending(h, 5, -7.2, '#e0413a', 1); vending(h, 6.2, -7.2, '#2f6fb0', 1); vending(h, 7.4, -7.2, '#f4f4f4', 1);
      h.B(10.5, 0, -7.1, 2.2, 1, 1, '#cfe6f0', { r: 0.06, pat: ['vend', '#cfe6f0', TOY, 2, 1] }); bench(h, -6, -7.0, true, WOOD, 1); bin(h, -8.5, -7.2, '#55606b'); bin(h, -9.4, -7.2, '#3f9b6a');
      h.B(-3.2, 0, -6, 0.9, 1.2, 0.3, '#f0d040', { pat: ['diag', '#f0d040', '#2a3038', 1, 1] }); h.cyl(-14.7, 0, -12, 0.09, 1.1, '#8d8f94'); h.B(-14.35, 1.4, -12, 0.1, 0.6, 0.6, '#2f6fb0');
      h.cyl(-15.6, 0, -11.2, 0.2, 0.32, '#7f8a94'); h.cyl(-16.2, 0, -12, 0.2, 0.32, '#7f8a94'); h.cyl(-15.4, 0, -13, 0.03, 1.4, '#c99a5b');
      // 看板・洗車機・タイヤ
      h.cyl(-28, 0, 12, 0.3, 7, '#8d8f94'); h.B(-28, 5, 12, 4.2, 2.6, 0.5, '#e0413a', { glow: 0.5, r: 0.2 }); h.B(-28, 3.3, 12, 3.6, 1.3, 0.45, '#f4f4f4', { r: 0.06 });
      for (let i = 0; i < 3; i++) h.B(-29.2 + i * 1.2, 3.5, 11.76, 0.9, 0.9, 0.02, '#2a3038', NC); // ねだんの数字
      h.B(20, 0, 2, 1, 1.6, 1, '#f08a3c', { r: 0.06 }); tires(h, 22, 6); tires(h, 23.1, 6.6, 4); tires(h, 21.6, 7.3, 2); tires(h, -18, 9, 3);
      h.B(27.5, 0, 2, 0.5, 3.4, 10, '#3f9b6a', { pat: ['vband', '#3f9b6a', '#f4f4f4', 6, 1] }); h.B(33.2, 0, 2, 0.5, 3.4, 10, '#3f9b6a', { pat: ['vband', '#3f9b6a', '#f4f4f4', 6, 1] }); h.B(30.35, 3.4, 2, 6.2, 0.4, 10, '#3f9b6a');
      for (const [x, z, c] of [[28.6, 0, '#4f7fe0'], [32.1, 0, '#4f7fe0'], [28.6, 4, '#e04f4f'], [32.1, 4, '#e04f4f']]) h.cyl(x, 0, z, 0.55, 3, c, { pat: ['camo', c, ['#f4f4f4', shade(c, 0.8)], 3, 4] }); // 洗車のブラシ
      h.B(24, 0.5, -19, 3, 2.8, 8, '#e9edf0', { r: 0.25, pat: ['corrugate', '#e9edf0', 0, 1, 4] }); h.B(24, 0.5, -13.8, 2.7, 2, 2.2, '#2f6fb0', { r: 0.3 }); h.B(24, 1.6, -12.69, 2.2, 0.7, 0.04, '#1e2a36', { nocol: true, rough: 0.12 });
      for (const dz of [-22, -16.5, -13.6]) for (const dx of [-1.4, 1.4]) h.wheel(24 + dx, 0.5, dz, 0.5, 0.35, 'x');
      h.B(-30, 0, -23, 3, 1.5, 1.8, '#2f6f5a', { r: 0.06, pat: ['corrugate', '#2f6f5a', 0, 2, 1] }); pallet(h, 19, -24.5); carton(h, 19, 0.15, -24.5, 1.4, 1.1, 1.4, CARD[1]);
      tree(h, -31, 3); tree(h, -31, -5, 1.2); tree(h, 31, -23); tree(h, 17, -23, 0.9); tree(h, -19, -23, 1.1);
      lamp(h, -20, 14.7, 4.2); lamp(h, 20, 14.7, 4.2); lamp(h, -31, -11, 3.6); lamp(h, 16.5, -9, 3.2);
      car(h, -18, 20, '#3f9b6a', true); car(h, 14, 23, '#7b5ea7', true);
      for (let x = -32; x <= 32; x += 4) h.B(x, 0.02, 21, 2, 0.02, 0.25, '#ffffff', FL);
      for (let i = 0; i < 5; i++) pylon(h, 15 + i * 1.2, 11);
      scatter(h, ['carK', 'carK', 'carK', 'vendrow', 'crates', 'gasbottle', 'barricade', 'fence', 'fence', 'sign', 'standsign', 'cart', 'bikerack', 'garbage', 'streetset'], -32, 32, -25, 25, this.pal, ['#e0413a', '#2f6fb0', '#f0d040', '#3f9b6a'], 50);
    }
  },

  /* ---------- サーキット（レースマスター「マスター・サーキット」より） ---------- */
  circuit: {
    name: 'サーキット', hx: 38, hz: 28, sky: '#a8d6f5', floorTex: 'grass', kit: ['statue', 'tiresK', 'pylonK', 'bush', 'hedge', 'rock', 'junk', 'sculpt', 'coral', 'logs', 'parasol', 'flowers', 'mush', 'mural', 'arch', 'tent', 'tent', 'pipe', 'grass', 'leafpile', 'hut', 'hlog', 'outcrop', 'crevice', 'blocks', 'blocks', 'nook', 'patch', 'slideK', 'swing', 'jungle', 'spring', 'tiretun', 'merry', 'sandbox', 'bike', 'trampoline', 'climb', 'fence', 'carK', 'vendrow', 'barricade', 'crates', 'standsign'], pal: ['#5fa84f', '#45474e', '#e0413a', '#ffffff', '#b8bcc6', '#8d8f94'], clutter: 84, spawn: [0, 0],
    build(h) {
      h.F(0, 0, 76, 56, '#5fa84f'); h.outer(7, '#3c6e3a');
      const RD = '#45474e';
      h.B(0, 0, -15, 44, 0.03, 9, RD, FL); h.B(0, 0, 15, 44, 0.03, 9, RD, FL);
      for (const sx of [-1, 1]) { h.cyl(sx * 22, 0, 0, 19.5, 0.03, RD, FL); h.cyl(sx * 22, 0.03, 0, 10.5, 0.02, '#5fa84f', FL); }
      h.B(0, 0.03, 0, 44, 0.02, 21, '#5fa84f', FL);
      for (let x = -20; x <= 20; x += 4) { h.B(x, 0.03, -15, 2, 0.02, 0.25, '#ffffff', FL); h.B(x, 0.03, 15, 2, 0.02, 0.25, '#ffffff', FL); }
      for (let x = -21; x <= 21; x += 2) { h.B(x, 0, -19.7, 1.9, 0.12, 0.4, Math.round(x / 2) % 2 ? '#e0413a' : '#ffffff', FL); h.B(x, 0, 10.3, 1.9, 0.12, 0.4, Math.round(x / 2) % 2 ? '#e0413a' : '#ffffff', FL); }
      // スタートゲート
      h.cyl(-3, 0, -20.2, 0.3, 5, '#e9edf0'); h.cyl(-3, 0, -9.8, 0.3, 5, '#e9edf0');
      h.B(-3, 5, -15, 1, 1.2, 11.6, 0, { pat: ['checker', '#ffffff', '#15171a', 1, 6] });
      h.B(-3, 0.035, -15, 1.2, 0.02, 9, 0, { nocol: true, flat: true, pat: ['checker', '#ffffff', '#15171a', 1, 5] });
      for (let i = 0; i < 5; i++) h.ball(-3.55, 5.6, -17 + i, 0.15, '#e0413a', { glow: 1.2 }); // スタートの信号
      // 観客席（段・観客・手すり）
      for (const cx of [-13, 13]) {
        for (let r = 0; r < 4; r++) {
          h.B(cx, 0, -22.5 - r * 1.3, 20, 0.7 + r * 0.7, 1.3, '#b8bcc6', { pat: ['vband', '#b8bcc6', '#a8acb6', 10, 1] });
          for (let k = 0; k < 9; k++) { const c = TOY[(k + r * 2) % 6]; h.ball(cx - 8.5 + k * 2.1 + (r % 2), 0.7 + r * 0.7 + 0.35, -22.5 - r * 1.3, 0.32, c); h.ball(cx - 8.5 + k * 2.1 + (r % 2), 0.7 + r * 0.7 + 0.85, -22.5 - r * 1.3, 0.2, '#f3d2b0'); }
        }
        h.B(cx, 0.7, -21.8, 20, 0.5, 0.06, '#e9edf0', NC);
      }
      // 湖と丘
      h.cyl(8, 0.05, 1, 6.5, 0.03, '#4f95c9', FL); h.cyl(13, 0.05, -1, 4, 0.03, '#4f95c9', FL);
      h.dome(-10, 0, 1, 6.5, 3.4, 5, '#4f9a45'); h.dome(-17, 0, -2, 4, 2.4, 3.6, '#58a84c'); h.dome(22, 0, 0, 5, 3, 5, '#4f9a45'); h.dome(-22, 0, 1, 4.5, 2.6, 4.5, '#58a84c');
      for (let i = 0; i < 7; i++) { const a = i * 0.9; stone(h, 8 + Math.cos(a) * 7.4, 1 + Math.sin(a) * 7, 0.55 + h.rnd() * 0.4, i % 2 ? '#8d8f94' : '#9a9ca0', 0, 0.55); }
      // タイヤバリア・パイロン・カート
      for (const sx of [-1, 1]) for (let i = -4; i <= 4; i++) { const a = i * 0.32; tires(h, sx * (22 + Math.cos(a) * 15.2), Math.sin(a) * 15.2, 2 + (Math.abs(i) % 2)); }
      for (let i = 0; i < 8; i++) { pylon(h, -18 + i * 1.5, 10.9); pylon(h, 6 + i * 1.5, 19.2); }
      kart(h, 2, -13, '#e04f4f'); kart(h, 4.5, -16.5, '#4f7fe0'); kart(h, 7, -13, '#f0d040'); kart(h, 9.5, -16.5, '#4fbf6a'); kart(h, -24, 14, '#b06fd8'); kart(h, 16, 16, '#f08a3c');
      // ピット
      h.B(0, 0, 26.9, 30, 3.6, 0.4, '#d9d2c4', { pat: ['vstripe', '#d9d2c4', '#c9c2b4', 10, 1] }); h.B(0, 3.2, 24.6, 30.4, 0.4, 5, '#b8bcc6'); for (let i = 0; i <= 5; i++) h.B(-15 + i * 6, 0, 24.6, 0.4, 3.2, 4.6, '#d9d2c4');
      for (let i = 0; i < 5; i++) { h.B(-12 + i * 6, 0, 26.2, 3.6, 1, 0.8, ['#b8452f', '#2f6fb0'][i % 2], { r: 0.08, pat: ['cabinet', ['#b8452f', '#2f6fb0'][i % 2], '#c9ccd0', 3, 1] }); tires(h, -13.6 + i * 6, 24.4, 2 + i % 3); if (i % 2) kart(h, -11.4 + i * 6, 24.2, TOY[i]); h.B(-12 + i * 6, 2.9, 22.2, 4.4, 0.5, 0.2, TOY[i], { glow: 0.5 }); }
      for (let i = 0; i < 6; i++) { drum(h, -17 + i * 0.95, 21, ['#b8452f', '#2f6fb0'][i % 2]); woodcrate(h, 15 + (i % 3) * 1.3, Math.floor(i / 3) * 0.9, 21, 0.9, '#b8452f'); }
      tires(h, -20.5, 22.5, 4); tires(h, -21.7, 23, 3); tires(h, 21, 23, 4); h.B(20, 0, 20.5, 2.2, 0.9, 1, '#55606b', { pat: ['cabinet', '#55606b', '#c9ccd0', 2, 1] });
      // 表彰台・アイテムボックス・ジャンプ台
      h.B(27, 0, 22, 1.6, 1.2, 1.6, '#f0d040', { r: 0.04 }); h.B(25.4, 0, 22, 1.6, 0.8, 1.6, '#c0c6cc', { r: 0.04 }); h.B(28.6, 0, 22, 1.6, 0.5, 1.6, '#c98f4e', { r: 0.04 });
      for (let i = 0; i < 4; i++) { h.B(-9 + i * 2.2, 0.5, 15, 1, 1, 1, TOY[i + 1], { glow: 0.9, r: 0.2, pat: ['dots', TOY[i + 1], '#ffffff', 1, 1] }); h.B(-34, 0.5, -6 + i * 4, 1, 1, 1, TOY[i], { glow: 0.9, r: 0.2, pat: ['dots', TOY[i], '#ffffff', 1, 1] }); }
      for (let k = 0; k < 3; k++) h.B(12 + k * 1.5, 0, -15, 1.5, 0.3 + k * 0.3, 7, '#f08a3c', { pat: ['diag', '#f08a3c', '#f4f4f4', 1, 3] });
      h.B(-12, 0.035, -15, 3, 0.02, 3, '#ffd23a', { nocol: true, flat: true, glow: 1.2 }); h.B(30, 0.035, 9, 3, 0.02, 3, '#ffd23a', { nocol: true, flat: true, glow: 1.2 });
      // 木・旗・雲・太陽
      for (const p of [[-34, -24], [-30, -25], [34, -24], [35, 22], [-35, 23], [-30, 25], [0, 5], [3, -5], [-3, -4], [31, 25], [-36, 10], [36, -10]]) tree(h, p[0], p[1], 0.8 + h.rnd() * 0.5);
      for (const x of [-22, -8, 8, 22]) { h.cyl(x, 0, -27, 0.07, 6, '#e9edf0'); h.B(x + 0.7, 5, -27, 1.4, 0.9, 0.06, TOY[(x + 22) / 2 % 6 | 0], { pat: ['check2', TOY[(x + 22) / 2 % 6 | 0], '#f4f4f4', 2, 1] }); }
      for (let k = 0; k < 9; k++) h.dome(-50 + k * 13 + h.rnd() * 6, 30 + h.rnd() * 8, -30 + h.rnd() * 60, 7 + h.rnd() * 5, 2 + h.rnd(), 4 + h.rnd() * 3, '#ffffff', { nocol: true, sky: true });
      h.ball(60, 55, 40, 6, '#fff4c2', { glow: 2, nolight: true });
      const CP = ['#8d8f94', '#a39a8a', '#b8bcc6', '#7a7c80'];
      KIT.outcrop(h, -33, 17, CP, []); KIT.outcrop(h, 31, -3, CP, []); KIT.crevice(h, -25, -9, CP);
      scatter(h, ['carK', 'carK', 'carK', 'vendrow', 'fence', 'fence', 'barricade', 'crates', 'sign', 'standsign', 'gasbottle', 'bikerack'], -36, 36, -26, 26, this.pal, TOY, 50);
    }
  },

  /* ---------- 古代の砂漠（レースマスター「古代の砂漠」より） ---------- */
  desert: {
    name: '古代の砂漠', hx: 38, hz: 28, sky: '#f2cc8f', kit: ['statue', 'statue', 'rock', 'rock', 'pot', 'pillar', 'bags', 'coral', 'sculpt', 'junk', 'logs', 'mural', 'tent', 'tent', 'hut', 'pipe', 'outcrop', 'outcrop', 'outcrop', 'crevice', 'crevice', 'nook', 'nook', 'blocks', 'stairs'], acc: ['#b8452f', '#2f6fb0', '#f0d040', '#efe2c4', '#8a5a33', '#3fa0c9'], pal: ['#d6ab66', '#c9a36a', '#b8905a', '#ddb672', '#c98a5a', '#e0c08c'], clutter: 96, spawn: [0, 4],
    build(h) {
      const S = '#d6ab66', ST = '#c9a36a', ST2 = '#b8905a';
      h.F(0, 0, 76, 56, S); h.outer(7, '#c49a5e');
      // ピラミッド
      h.cone(-24, 0, -16, 11, 11, ST, { seg: 4, cw: 0.62, pat: ['brick', ST, ST2, 6, 6] }); h.cone(22, 0, -18, 8.5, 8.5, ST2, { seg: 4, cw: 0.62, pat: ['brick', ST2, ST, 5, 5] }); h.cone(28, 0, 14, 6, 6, ST, { seg: 4, cw: 0.62, pat: ['brick', ST, ST2, 4, 4] });
      for (let k = 0; k < 5; k++) h.B(-22, k * 1.0, 16, 12 - k * 2.2, 1.0, 12 - k * 2.2, k % 2 ? ST : ST2, { r: 0.12, pat: ['brick', k % 2 ? ST : ST2, shade(ST, 0.85), Math.max(1, 6 - k), 1], sink: true });
      h.B(-22, 5, 16, 1.4, 1.6, 1.4, '#f0d040', { glow: 0.5, r: 0.3 });
      // 神殿の柱と石（みぞのある柱・こわれた柱）
      for (let i = 0; i < 6; i++) { const x = -6 + (i % 3) * 6, z = -20 + Math.floor(i / 3) * 6; h.B(x, 0, z, 1.6, 0.4, 1.6, ST2, { r: 0.04 }); h.cyl(x, 0.4, z, 0.55, i === 4 ? 2 : 4.2, ST, { rt: 0.48, seg: 16, pat: ['vband', ST, shade(ST, 0.86), 4, 1] }); if (i !== 4) h.B(x, 4.6, z, 1.5, 0.35, 1.5, ST2, { r: 0.04 }); }
      h.B(0, 4.95, -20, 14.5, 0.6, 1.6, ST2, { r: 0.04, pat: ['zigzag', ST2, ST, 8, 1] }); h.cyl(3, 0.45, -12.5, 0.45, 3.6, ST, { rot: [Math.PI / 2, 0, 0], seg: 16, pat: ['vband', ST, shade(ST, 0.86), 4, 1] }); // 倒れた柱
      for (let i = 0; i < 16; i++) { const x = -34 + h.rnd() * 68, z = -24 + h.rnd() * 48, s = 0.5 + h.rnd() * 0.8, c = pick(h, [ST, ST2, '#c98a5a']); if (Math.hypot(x, z - 4) < 5) continue; stone(h, x, z, s, c); }
      // スフィンクス風の像・オベリスク
      h.B(10, 0, 3, 2.4, 1.2, 5.5, ST, { r: 0.4, pat: ['brick', ST, ST2, 2, 1] }); h.B(10, 1.2, 5, 1.6, 1.6, 1.6, ST, { r: 0.5 }); h.ball(10, 3.2, 5.2, 0.85, ST2); h.B(9.2, 0, 6.2, 0.7, 0.6, 2.4, ST2, { r: 0.25 }); h.B(10.8, 0, 6.2, 0.7, 0.6, 2.4, ST2, { r: 0.25 });
      h.B(10, 2.2, 5.85, 1.2, 0.9, 0.02, '#2f6fb0', { nocol: true, pat: ['hstripe', '#2f6fb0', '#f0d040', 1, 4] }); // 頭かざり
      for (const p of [[-10, 2], [-4, 12], [16, -6]]) { h.B(p[0], 0, p[1], 1.5, 0.5, 1.5, ST2, { r: 0.04 }); h.B(p[0], 0.5, p[1], 0.9, 5, 0.9, ST, { r: 0.1, pat: ['zigzag', ST, ST2, 1, 5], sink: true }); h.cone(p[0], 5.5, p[1], 0.65, 1, '#f0d040', { seg: 4 }); }
      // オアシス
      h.cyl(-4, 0.03, 20, 6, 0.03, '#3fa0c9', FL); h.cyl(-4, 0.02, 20, 7.5, 0.02, '#7fb86a', FL);
      for (const p of [[-11, 18], [-9, 24], [2, 25], [4, 17], [-2, 13.5]]) palm(h, p[0], p[1], 0.9 + h.rnd() * 0.4);
      for (let i = 0; i < 8; i++) { const a = i * 0.8; h.cyl(-4 + Math.cos(a) * 6.6, 0, 20 + Math.sin(a) * 6.3, 0.07, 1 + h.rnd(), '#5f9a45'); }
      // テントと市場
      for (const [x, z, c] of [[14, 20, '#b8452f'], [20, 23, '#2f6fb0'], [8, 12, '#e8dcc8']]) {
        h.cone(x, 0, z, 2.6, 3, c, { seg: 4, cw: 0.5, pat: ['vband', c, '#efe2c4', 4, 1] }); woodcrate(h, x + 2.6, 0, z - 1.5, 1, '#b08a5a');
        KIT.pot(h, x - 2.6, z - 1.8);
      }
      h.B(16, 0, 16, 4, 0.04, 2.6, '#a8443f', { flat: true, nocol: true, pat: ['zigzag', '#a8443f', '#f0d040', 3, 2] }); table(h, 16, 16, 3, 1.2, '#8a5a33', 0.7); for (let i = 0; i < 4; i++) h.ball(15 + i * 0.7, 0.95, 16, 0.24, TOY[i]);
      // 砂丘・サボテン
      h.dome(30, 0, -4, 7, 2.6, 5, '#ddb672'); h.dome(-32, 0, 2, 5, 2.2, 7, '#ddb672'); h.dome(4, 0, -6, 4.5, 1.8, 3.4, '#ddb672'); h.dome(-12, 0, -6, 4, 1.7, 3, '#d9b06c');
      for (const p of [[-16, 6], [20, 6], [33, -22], [-34, -8], [12, -12], [-30, 24], [34, 2]]) { // サボテン（うでにも当たる）
        const c = '#3f8f4a', pt = ['vband', c, shade(c, 0.85), 6, 1];
        h.cap(p[0], 0, p[1], 0.3, 2.0, c, { pat: pt });
        for (const s of [-1, 1]) if (h.rnd() < 0.75) { const y0 = 0.8 + h.rnd() * 0.6; h.capc(p[0] + s * 0.42, y0, p[1], 0.15, 0.45, s, 0.15, 0, c, { pat: pt }); h.cap(p[0] + s * 0.66, y0, p[1], 0.15, 0.7 + h.rnd() * 0.4, c, { pat: pt }); }
      }
      for (const p of [[-14, -22], [14, -24], [-34, 20], [34, 24]]) lamp(h, p[0], p[1], 2.2);
      // 地層の岩・岩のすき間（ひさしの下・すき間に入って、岩の帯と同じ色に塗る）
      const DP = ['#d6ab66', '#c98a5a', '#e0c08c', '#b8905a', '#a8693f'];
      KIT.outcrop(h, -23, 1, DP, []); KIT.outcrop(h, 15, -1, DP, []); KIT.outcrop(h, 33, -17, DP, []); KIT.crevice(h, -11, -17, DP);
      scatter(h, ['crates', 'fence', 'standsign', 'fence', 'crates', 'gasbottle'], -34, 34, -24, 24, DP, this.acc, 40); // 市場の木のさく・ケース・旗
      h.ball(-70, 45, -50, 7, '#fff0c0', { glow: 2, nolight: true });
    }
  },

  /* ---------- ネオン街（光る模様のビルの街） ---------- */
  neon: {
    name: 'ネオン街', hx: 36, hz: 28, sky: '#16052a', night: true, dark: 0.42, kit: ['statue', 'neonBox', 'junk', 'sculpt', 'sculpt', 'bags', 'coral', 'goods', 'screen', 'mural', 'pole', 'booth', 'booth', 'dumpster', 'gallery', 'hut', 'graffiti', 'graffiti', 'nook', 'blocks', 'bike', 'music', 'vendrow', 'bikerack', 'garbage', 'sign', 'standsign', 'crates', 'carK'], pal: ['#1c1c2e', '#1a1430', '#221436', '#2a2440', '#3a3550'], acc: ['#ff3ab8', '#33eaff', '#ffd940', '#8a5cff', '#3dff9a'], clutter: 40, spawn: [12, 0],
    build(h) {
      const NE = ['#ff3ab8', '#33eaff', '#ffd940', '#8a5cff', '#3dff9a'];
      h.F(0, 0, 72, 56, '#1c1c2e'); h.outer(12, '#14101f');
      for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) h.B(x, 0.02, 1.9, 2, 0.02, 0.2, NE[1], { nocol: true, flat: true, glow: 1.2 });
      city(h, { pal: ['#1a1430', '#141a36', '#221436', '#2a1d40', '#1c2440'], acc: NE, night: true, neon: true, facade: ['hstripe', 'vband', 'check2', 'zigzag', 'diag', 'dots', 'wave', 'bigcamo'], hmin: 7, hmax: 13 });
      scatter(h, ['carK', 'carK', 'vendrow', 'garbage', 'bikerack', 'sign', 'sign', 'barricade', 'crates', 'standsign', 'streetset', 'fence', 'cart', 'vendrow', 'bikerack'], -34, 34, -26, 26, this.pal, NE, 60);
      h.ball(-60, 60, 70, 9, '#ffe6f6', { glow: 1.6, nolight: true });
    }
  },

  /* ---------- 火山（レースマスター「火山コア」より） ---------- */
  volcano: {
    name: '火山', hx: 36, hz: 28, sky: '#2a0a06', night: true, dark: 0.5, kit: ['rock', 'rock', 'crystal', 'coral', 'junk', 'bags', 'sculpt', 'barrel', 'mural', 'hlog', 'pipe', 'hut', 'outcrop', 'outcrop', 'outcrop', 'crevice', 'crevice', 'nook', 'blocks', 'climb', 'ladderK', 'barricade', 'gasbottle', 'crates', 'fence'], acc: ['#ff6a14', '#ffa028', '#5a3a8a', '#7b4fb8', '#1c1513', '#ffb46b'], pal: ['#2b2422', '#3a302c', '#332a27', '#40342f', '#5a3a2a', '#6b4a3a'], clutter: 104, spawn: [0, 2],
    build(h) {
      const RK = '#2b2422', RK2 = '#3a302c', LV = '#ff6a14';
      h.F(0, 0, 72, 56, RK); h.outer(9, '#1f1917');
      // 溶岩の川（光る床）と橋
      h.B(0, 0, -9, 72, 0.02, 3, LV, { nocol: true, flat: true, glow: 1.6, pat: ['wave', LV, '#ffa028', 24, 1] }); h.B(-14, 0, 8, 3, 0.02, 40, LV, { nocol: true, flat: true, glow: 1.6, pat: ['wave', LV, '#ffa028', 1, 13] }); h.B(18, 0, 14, 36, 0.02, 2.4, LV, { nocol: true, flat: true, glow: 1.6, pat: ['wave', LV, '#ffa028', 12, 1] });
      h.cyl(22, 0.01, -18, 5, 0.02, LV, { nocol: true, flat: true, glow: 1.6 }); h.cyl(-26, 0.01, 18, 4, 0.02, '#ffa028', { nocol: true, flat: true, glow: 1.6 });
      for (const p of [[-24, -9, 0], [4, -9, 0], [26, -9, 0], [-14, 2, 1], [-14, 20, 1], [10, 14, 0], [28, 14, 0]]) { h.B(p[0], 0.02, p[1], p[2] ? 4.4 : 2.6, 0.14, p[2] ? 2.6 : 4.4, '#6b4a2b', { flat: true, pat: ['vstripe', '#6b4a2b', '#5a3c24', p[2] ? 6 : 4, 1] }); }
      // 火山
      for (const [x, z, r] of [[-25, -19, 8], [28, 22, 6], [30, -3, 5]]) { h.cone(x, 0, z, r, r * 1.05, RK2, { seg: 9, cw: 0.6, rt: r * 0.22, pat: ['rockface', RK2, [RK, '#4a3a34'], 3, 2] }); h.cyl(x, r * 1.05 - 0.05, z, r * 0.2, 0.12, LV, { nocol: true, glow: 2.4 }); h.ball(x, r * 1.05 + 0.6, z, 0.5, '#ffb46b', { glow: 1 }); }
      // 柱状の岩（六角）・岩
      for (const [cx, cz] of [[6, -20], [-6, 12], [20, 4], [-30, 2], [8, 23]]) for (let i = 0; i < 7; i++) { const a = i * 0.9, d = i ? 1.1 : 0; h.cyl(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, 0.62, 1 + h.rnd() * 3.2, i % 2 ? RK2 : '#332a27', { seg: 6, pat: ['strata', i % 2 ? RK2 : '#332a27', ['#2b2422', '#4a3a34'], 1, 2] }); }
      for (let i = 0; i < 22; i++) { const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50, s = 0.5 + h.rnd() * 0.9, c = pick(h, [RK2, '#40342f', '#5a3a2a']); if (Math.hypot(x, z - 2) < 4) continue; stone(h, x, z, s, c); }
      // 黒曜石の結晶・間欠泉・枯れ木
      for (const p of [[-4, -16], [14, -4], [-22, 10], [2, 18], [32, 10], [-33, -8]]) KIT.crystal(h, p[0], p[1]);
      for (const p of [[10, -14], [-20, -2], [16, 22]]) { h.cyl(p[0], 0, p[1], 0.9, 0.35, RK2, { pat: ['rockface', RK2, [RK, '#4a3a34'], 1, 1] }); h.cyl(p[0], 0.35, p[1], 0.45, 0.06, '#ffa028', { nocol: true, glow: 2 }); h.ball(p[0], 1, p[1], 0.3, '#ffb46b', { glow: 1 }); }
      for (const p of [[-8, 4], [24, -12], [-30, 24], [34, 18], [0, -24]]) { h.cyl(p[0], 0, p[1], 0.2, 3, '#1c1513', { rt: 0.1 }); h.capc(p[0] + 0.45, 1.9, p[1], 0.07, 1.0, 0.8, 0.6, 0, '#1c1513'); h.capc(p[0] - 0.35, 2.4, p[1] + 0.2, 0.05, 0.8, -0.7, 0.6, 0.3, '#1c1513'); }
      // 採掘キャンプ（トロッコ・線路・木箱・ドラム缶・テント）
      for (let i = 0; i < 3; i++) { h.B(4 + i * 2.4, 0.25, 6, 1.6, 0.9, 1.1, '#55606b', { r: 0.15, pat: ['corrugate', '#55606b', 0, 2, 1] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(4 + i * 2.4 + sx * 0.5, 0.25, 6 + sz * 0.6, 0.25, 0.12, 'x'); h.ball(4 + i * 2.4, 1.25, 6, 0.4, i % 2 ? LV : RK2, i % 2 ? { glow: 1.2 } : {}); }
      h.B(8, 0, 6.6, 12, 0.08, 0.12, '#8d8f94', FL); h.B(8, 0, 5.4, 12, 0.08, 0.12, '#8d8f94', FL); for (let k = 0; k < 12; k++) h.B(2.5 + k, 0, 6, 0.2, 0.05, 1.6, '#5a3c24', FL);
      for (let i = 0; i < 6; i++) woodcrate(h, -4 + (i % 3) * 1.2, Math.floor(i / 3) * 1, -3, 1.0, '#a07a4a');
      for (let i = 0; i < 4; i++) drum(h, -8 + i * 1.1, -4.5, ['#b8452f', '#55606b'][i % 2]);
      h.cone(-2, 0, 7, 2.4, 2.8, '#6b5a4a', { seg: 4, cw: 0.5, pat: ['vband', '#6b5a4a', '#5a4a3a', 4, 1] }); lamp(h, 1.5, 9, 2.4); lamp(h, -5, -1, 2.4);
      h.dome(-6, 0, 22, 5, 1.8, 3.5, '#3a302c'); h.dome(20, 0, -24, 5, 2, 3, '#3a302c'); h.dome(33, 0, -20, 3, 1.6, 4, '#332a27');
      // 地層の岩（黒い岩と赤茶の層）・岩のすき間
      const VP = ['#3a302c', '#5a3a2a', '#6b4a3a', '#2b2422', '#7a3a24'];
      KIT.outcrop(h, -27, -5, VP, []); KIT.outcrop(h, -1, 13, VP, []); KIT.outcrop(h, -13, -23, VP, []); KIT.crevice(h, 21, -5, VP);
      scatter(h, ['barricade', 'gasbottle', 'crates', 'fence', 'carK', 'sign', 'barricade', 'fence'], -33, 33, -25, 25, VP, this.acc, 40); // 採掘キャンプの柵・ボンベ・車
    }
  }
};
