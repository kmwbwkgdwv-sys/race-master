// 隠れる側の体：頭・胴・手足を「なめらかにくっつけた1つの形」から作る（関節のつなぎ目や凸凹が出ない）
// three.js に依存しない計算だけ。形は全員同じなので、どの端末でも同じ体になる
//   1) 体の形を距離関数（SDF）で表す：カプセルや角の丸い箱を smooth-min でなめらかに合体
//   2) Surface Nets で三角形のメッシュにする
//   3) 6本の骨（腰・胴・左右の腕・左右の脚）に、近さで重みをつけて動かす（スキニング）
//   4) 色は頂点ごとに塗る（体の表面に直接ペイント）

const R2D = Math.PI / 180;
// 骨の位置（腰の中心が原点。腕は少し開いた形で作り、ポーズ0で真下に下ろす）
export const RIG = {
  shoulder: [0.2, 0.37], armLen: 0.44, armTilt: 40 * R2D,
  hipJ: [0.11, -0.03], legLen: 0.56, legTilt: 7 * R2D,
  head: 0.77
};
export const BONE = { hip: 0, waist: 1, armL: 2, armR: 3, legL: 4, legR: 5 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
// 太さが少しずつ変わるカプセル（a→b、半径 ra→rb）
function cap(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, qx = px - ax, qy = py - ay, qz = pz - az;
  const t = clamp((qx * dx + qy * dy + qz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(qx - dx * t, qy - dy * t, qz - dz * t) - (ra + (rb - ra) * t);
}
function rbox(px, py, pz, hx, hy, hz, r) { // 角の丸い箱
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// 腕・脚の骨（バインド時の向き）
export function limbs() {
  const [sx, sy] = RIG.shoulder, [hx, hy] = RIG.hipJ, at = RIG.armTilt, lt = RIG.legTilt;
  const L = [];
  for (const s of [-1, 1]) L.push({ a: [s * sx, sy, 0], d: [s * Math.sin(at), -Math.cos(at), 0], len: RIG.armLen });
  for (const s of [-1, 1]) L.push({ a: [s * hx, hy, 0], d: [s * Math.sin(lt), -Math.cos(lt), 0], len: RIG.legLen });
  return L; // armL, armR, legL, legR
}
export function makeSDF(shape) {
  const [aL, aR, gL, gR] = limbs();
  const end = l => [l.a[0] + l.d[0] * l.len, l.a[1] + l.d[1] * l.len, l.a[2]];
  const eAL = end(aL), eAR = end(aR), eGL = end(gL), eGR = end(gR);
  if (shape === 'box') {
    // 腕・脚の向きにそった座標で角の丸い箱
    const limbBox = (px, py, pz, l, hw, r) => {
      const cx = l.a[0] + l.d[0] * l.len / 2, cy = l.a[1] + l.d[1] * l.len / 2, qx = px - cx, qy = py - cy;
      const u = qx * -l.d[1] + qy * l.d[0], v = qx * l.d[0] + qy * l.d[1]; // u=横, v=骨の向き
      return rbox(u, v, pz, hw, l.len / 2 + 0.02, hw, r);
    };
    return (x, y, z) => {
      let d = rbox(x, y - 0.22, z, 0.21, 0.28, 0.145, 0.085);
      d = smin(d, rbox(x, y - 0.56, z, 0.1, 0.09, 0.09, 0.05), 0.05);
      d = smin(d, rbox(x, y - RIG.head + 0.02, z, 0.205, 0.2, 0.2, 0.085), 0.05);
      d = smin(d, Math.min(limbBox(x, y, z, aL, 0.078, 0.05), limbBox(x, y, z, aR, 0.078, 0.05)), 0.05);
      d = smin(d, Math.min(limbBox(x, y, z, gL, 0.098, 0.06), limbBox(x, y, z, gR, 0.098, 0.06)), 0.06);
      return d;
    };
  }
  const A = [aL.a[0], aL.a[1], eAL[0], eAL[1], aR.a[0], aR.a[1], eAR[0], eAR[1]], G = [gL.a[0], gL.a[1], eGL[0], eGL[1], gR.a[0], gR.a[1], eGR[0], eGR[1]], hy = RIG.head;
  return (x, y, z) => {
    const zz = z / 0.82; // 胴は前後に少しうすい
    let d = cap(x, y, zz, 0, 0, 0, 0, 0.34, 0, 0.185, 0.2) * 0.86;
    d = smin(d, cap(x, y, z, 0, 0.4, 0, 0, 0.6, 0, 0.09, 0.09), 0.06);
    d = smin(d, Math.hypot(x, y - hy, z) - 0.235, 0.07);
    d = smin(d, Math.min(cap(x, y, z, A[0], A[1], 0, A[2], A[3], 0, 0.076, 0.07), cap(x, y, z, A[4], A[5], 0, A[6], A[7], 0, 0.076, 0.07)), 0.07);
    d = smin(d, Math.min(cap(x, y, z, G[0], G[1], 0, G[2], G[3], 0, 0.1, 0.09), cap(x, y, z, G[4], G[5], 0, G[6], G[7], 0, 0.1, 0.09)), 0.08);
    return d;
  };
}

// Surface Nets：距離関数から、なめらかな三角形メッシュを作る
export function buildBody(shape, cell = 0.021) {
  const f = makeSDF(shape), X0 = -0.66, Y0 = -0.76, Z0 = -0.28;
  const nx = Math.ceil(1.32 / cell), ny = Math.ceil(1.86 / cell), nz = Math.ceil(0.56 / cell);
  const sx = nx + 1, sxy = (nx + 1) * (ny + 1), F = new Float32Array(sxy * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) F[i + j * sx + k * sxy] = f(X0 + i * cell, Y0 + j * cell, Z0 + k * cell);
  const cellV = new Int32Array(nx * ny * nz).fill(-1), P = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], v = new Float32Array(8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[i + co[c][0] + (j + co[c][1]) * sx + (k + co[c][2]) * sxy]; if (v[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let ax = 0, ay = 0, az = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      ax += co[a][0] + (co[b][0] - co[a][0]) * t; ay += co[a][1] + (co[b][1] - co[a][1]) * t; az += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
    }
    cellV[i + j * nx + k * nx * ny] = P.length / 3;
    P.push(X0 + (i + ax / n) * cell, Y0 + (j + ay / n) * cell, Z0 + (k + az / n) * cell);
  }
  const N = P.length / 3, pos = new Float32Array(P), nrm = new Float32Array(N * 3), h = cell * 0.5;
  const grad = (x, y, z, o) => {
    o[0] = f(x + h, y, z) - f(x - h, y, z); o[1] = f(x, y + h, z) - f(x, y - h, z); o[2] = f(x, y, z + h) - f(x, y, z - h);
    const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l;
  };
  const g = [0, 0, 0];
  for (let i = 0; i < N; i++) { // 表面にぴったり寄せて、面の向き（法線）を求める
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    for (let it = 0; it < 3; it++) { const d = f(x, y, z); grad(x, y, z, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
    grad(x, y, z, g); pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; nrm[i * 3] = g[0]; nrm[i * 3 + 1] = g[1]; nrm[i * 3 + 2] = g[2];
  }
  const I = [], cid = (i, j, k) => cellV[i + j * nx + k * nx * ny];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; tri(a, b, c); tri(a, c, d); };
  const tri = (a, b, c) => { // 外向きになるように並べる
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    const s = cx * (nrm[a * 3] + nrm[b * 3] + nrm[c * 3]) + cy * (nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1]) + cz * (nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2]);
    if (s >= 0) I.push(a, b, c); else I.push(a, c, b);
  };
  const neg = (i, j, k) => F[i + j * sx + k * sxy] < 0;
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) if (neg(i, j, k) !== neg(i + 1, j, k)) quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k));
  for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) if (neg(i, j, k) !== neg(i, j + 1, k)) quad(cid(i - 1, j, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i - 1, j, k));
  for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) if (neg(i, j, k) !== neg(i, j, k + 1)) quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k));
  // いちばん大きなかたまりだけ残す（ちぎれた小さなかけらを消す）
  { const par = new Int32Array(N).map((_, i) => i), fd = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (let t = 0; t < I.length; t += 3) { const r0 = fd(I[t]); par[fd(I[t + 1])] = r0; par[fd(I[t + 2])] = r0; }
    const cnt = new Map(); for (let t = 0; t < I.length; t += 3) { const r0 = fd(I[t]); cnt.set(r0, (cnt.get(r0) || 0) + 1); }
    let big = -1, bc = -1; for (const [r0, c] of cnt) if (c > bc) { bc = c; big = r0; }
    const keep = [], remap = new Int32Array(N).fill(-1); let M = 0;
    for (let t = 0; t < I.length; t += 3) if (fd(I[t]) === big) for (let e = 0; e < 3; e++) { const v0 = I[t + e]; if (remap[v0] < 0) remap[v0] = M++; keep.push(remap[v0]); }
    const p2 = new Float32Array(M * 3), n2 = new Float32Array(M * 3);
    for (let v0 = 0; v0 < N; v0++) if (remap[v0] >= 0) for (let a = 0; a < 3; a++) { p2[remap[v0] * 3 + a] = pos[v0 * 3 + a]; n2[remap[v0] * 3 + a] = nrm[v0 * 3 + a]; }
    return finish(M, p2, n2, keep); }
}
function finish(N, pos, nrm, I) {
  // 骨の重み：近い骨ほど強く、境目はなめらかに混ぜる
  const segs = boneSegs(), skinIndex = new Uint16Array(N * 4), skinWeight = new Float32Array(N * 4), d = new Float32Array(6);
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; let dm = 1e9;
    for (let b = 0; b < 6; b++) { const s = segs[b]; d[b] = cap(x, y, z, s[0][0], s[0][1], s[0][2], s[1][0], s[1][1], s[1][2], 0, 0) - BR[b]; if (d[b] < dm) dm = d[b]; } // 骨の表面からの距離
    const w = Array.from(d, (db, b) => [b, Math.exp(-(db - dm) / 0.028)]).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = w.reduce((a, b) => a + b[1], 0);
    w.forEach(([b, ww], k) => { skinIndex[i * 4 + k] = b; skinWeight[i * 4 + k] = ww / sum; });
  }
  return { n: N, pos, nrm, idx: new Uint32Array(I), skinIndex, skinWeight };
}
const BR = [0.15, 0.2, 0.076, 0.076, 0.096, 0.096]; // 骨ごとの太さ（腰・胴・腕・腕・脚・脚）
export function boneSegs() {
  const [aL, aR, gL, gR] = limbs();
  const seg = (l, s) => [[l.a[0] + l.d[0] * s, l.a[1] + l.d[1] * s, 0], [l.a[0] + l.d[0] * l.len, l.a[1] + l.d[1] * l.len, 0]];
  return [[[-0.09, -0.07, 0], [0.09, -0.07, 0]], [[0, 0.06, 0], [0, 0.95, 0]], seg(aL, 0.06), seg(aR, 0.06), seg(gL, 0.08), seg(gR, 0.08)];
}

// ---- 体に色を塗る（頂点の色） ----
export function makeHash(pos, cs = 0.05) { // 近くの頂点をすぐ探せるように、場所ごとに分けておく
  const m = new Map(), key = (i, j, k) => i + ',' + j + ',' + k;
  for (let v = 0; v < pos.length / 3; v++) { const k = key(Math.floor(pos[v * 3] / cs), Math.floor(pos[v * 3 + 1] / cs), Math.floor(pos[v * 3 + 2] / cs)); let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); }
  return { m, cs, key, pos };
}
export function near(H, x, y, z, r, fn) { // 半径 r 以内の頂点ごとに fn(頂点番号, 距離)
  const cs = H.cs, p = H.pos, n = Math.ceil(r / cs);
  const ci = Math.floor(x / cs), cj = Math.floor(y / cs), ck = Math.floor(z / cs);
  for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (let k = ck - n; k <= ck + n; k++) {
    const a = H.m.get(H.key(i, j, k)); if (!a) continue;
    for (const v of a) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d <= r) fn(v, d); }
  }
}
export function nearestVert(H, x, y, z) {
  let best = -1, bd = 1e9;
  for (let r = H.cs; r < 0.6 && best < 0; r *= 2) near(H, x, y, z, r, (v, d) => { if (d < bd) { bd = d; best = v; } });
  return best;
}
// 別の形（丸⇔四角）の頂点に色を移すための対応表
export function nearestMap(fromPos, H) {
  const n = fromPos.length / 3, out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, nearestVert(H, fromPos[i * 3], fromPos[i * 3 + 1], fromPos[i * 3 + 2]));
  return out;
}
