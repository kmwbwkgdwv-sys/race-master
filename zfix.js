// 同じ平面に、同じ向きの面が2つ重なっていると、模様が2重になってチラつく（Z ファイティング）。
// マップを組み立てたあとで重なりを探し、小さい方の面を少しだけ外へ出して直す（当たり判定は変えない）。
//   items: { t:'box', x, y, z, w, h, d, rot, rr, key, ord } … y は底の高さ
//          { t:'cyl', x, y, z, r, rt, h, rot, key, ord }   … rot なし：y は底 / rot あり：y は中心
//   key: 同じ材質（無地）なら同じ文字列（チラついても同じ色なので直さない）。模様つきは null
//   結果は item.g（box: [[-x,+x],[-y,+y],[-z,+z]] の外へ出す量、cyl: [下, 上]）に入る
const EPS = 0.01, DELTA = 0.02, MINA = 0.003;

function rotE(rot, v) { // three.js の Euler 'XYZ' と同じ回し方
  const [a, b, c] = rot, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [cb * cc * v[0] - cb * sc * v[1] + sb * v[2],
    (ca * sc + sa * sb * cc) * v[0] + (ca * cc - sa * sb * sc) * v[1] - sa * cb * v[2],
    (sa * sc - ca * sb * cc) * v[0] + (sa * cc + ca * sb * sc) * v[1] + ca * cb * v[2]];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - a[1] * b[0]; } return s / 2; }
function clip(subj, cp) { // 凸多角形どうしの重なり
  let out = subj;
  for (let i = 0; i < cp.length && out.length; i++) {
    const A = cp[i], B = cp[(i + 1) % cp.length], inp = out; out = [];
    const side = p => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
// 箱の中心と、各軸の半分の大きさ（外へ出した量もふくむ）
export function boxShape(it) {
  const g = it.g || [[0, 0], [0, 0], [0, 0]], hw = [it.w / 2, it.h / 2, it.d / 2], sh = [0, 0, 0];
  for (let a = 0; a < 3; a++) { hw[a] += (g[a][0] + g[a][1]) / 2; sh[a] = (g[a][1] - g[a][0]) / 2; }
  const s = it.rot ? rotE(it.rot, sh) : sh;
  return { c: [it.x + s[0], it.y + it.h / 2 + s[1], it.z + s[2]], hw };
}
function cylShape(it) { // 軸・両はしの中心
  const g = it.g || [0, 0], a = it.rot ? rotE(it.rot, [0, 1, 0]) : [0, 1, 0], cy = it.rot ? it.y : it.y + it.h / 2;
  const lo = -it.h / 2 - g[0], hi = it.h / 2 + g[1];
  return { a, c0: [it.x + a[0] * lo, cy + a[1] * lo, it.z + a[2] * lo], c1: [it.x + a[0] * hi, cy + a[1] * hi, it.z + a[2] * hi] };
}
function faces(it, out) {
  if (it.t === 'box') {
    const { c, hw } = boxShape(it), rr = it.rr || 0, R = it.rot ? v => rotE(it.rot, v) : v => v;
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, e1 = hw[a1] - rr, e2 = hw[a2] - rr;
      if (e1 < 0.01 || e2 < 0.01) continue;
      const nl = [0, 0, 0]; nl[ax] = s; const n = R(nl);
      const pts = [];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const l = [0, 0, 0]; l[ax] = s * hw[ax]; l[a1] = u * e1; l[a2] = v * e2; const w = R(l); pts.push([c[0] + w[0], c[1] + w[1], c[2] + w[2]]); }
      if ((n[1] < -0.9 && pts[0][1] < 0.002) || 4 * e1 * e2 < MINA) continue; // 地面についた底は見えない・小さすぎる面は重なっても目立たない
      out.push({ it, ax, s, n, d: dot(n, pts[0]), pts, A: 4 * e1 * e2 });
    }
  } else if (it.t === 'cyl') {
    const { a, c0, c1 } = cylShape(it), U = it.rot ? rotE(it.rot, [1, 0, 0]) : [1, 0, 0], V = it.rot ? rotE(it.rot, [0, 0, 1]) : [0, 0, 1];
    for (const [s, ctr, rad] of [[-1, c0, it.r], [1, c1, it.rt]]) {
      if (rad < 0.02) continue;
      const n = a.map(v => v * s); if (n[1] < -0.9 && ctr[1] < 0.002) continue;
      const pts = []; for (let i = 0; i < 12; i++) { const t = i / 12 * 6.2832, k = rad * 0.96; pts.push([ctr[0] + (U[0] * Math.cos(t) + V[0] * Math.sin(t)) * k, ctr[1] + (U[1] * Math.cos(t) + V[1] * Math.sin(t)) * k, ctr[2] + (U[2] * Math.cos(t) + V[2] * Math.sin(t)) * k]); }
      out.push({ it, ax: -1, s, n, d: dot(n, ctr), pts, A: 3 * rad * rad });
    }
  }
}
function basis(n) { const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; let u = cross(n, a); const l = Math.hypot(u[0], u[1], u[2]); u = u.map(v => v / l); return [u, cross(n, u)]; }
// 重なっている面の組を探す（only があれば、その物の面がからむ組だけ）
export function findCoplanar(items, only = null, eps = EPS, mina = MINA) {
  const F = []; for (const it of items) faces(it, F);
  const key = (f, dd) => ((Math.round(f.n[0] * 40) + 40) * 81 + Math.round(f.n[1] * 40) + 40) * 81 + Math.round(f.n[2] * 40) + 40 + (Math.round(f.d / eps) + dd + 1e6) * 531441; // 向きと距離をまとめた番号
  const B = new Map();
  for (let i = 0; i < F.length; i++) {
    const f = F[i]; f.i = i; const k = key(f, 0); let L = B.get(k); if (!L) B.set(k, L = []); L.push(f);
    const [U, V] = basis(f.n), P = f.pts.map(p => [dot(p, U), dot(p, V)]); f.P = area(P) < 0 ? P.reverse() : P;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } f.bb = [x0, x1, y0, y1];
  }
  const pairs = [], seen = new Set();
  for (const f of F) {
    if (only && !only.has(f.it)) continue;
    for (const dd of [-1, 0, 1]) {
      const L = B.get(key(f, dd)); if (!L) continue;
      for (const g of L) {
        if (g.it === f.it) continue;
        const pk = f.i < g.i ? f.i * 1e6 + g.i : g.i * 1e6 + f.i; if (seen.has(pk)) continue;
        if (Math.abs(g.d - f.d) > eps || dot(f.n, g.n) < 0.999) continue;
        if (f.it.key && f.it.key === g.it.key) continue; // 同じ無地の材質：重なっても見た目は同じ
        const a = f.bb, b = g.bb; if (b[1] < a[0] || b[0] > a[1] || b[3] < a[2] || b[2] > a[3]) continue;
        seen.add(pk);
        const I = clip(f.P, g.P), ar = I.length > 2 ? Math.abs(area(I)) : 0;
        if (ar > mina) pairs.push({ f, g, ar });
      }
    }
  }
  return pairs;
}
// 重なりを直す（小さい方の面を、なければ後から置いた方を外へ出す）。何回かくり返して、出した先でまた重なったものも直す
export function fixCoplanar(items, rounds = 5) {
  let fixed = 0, only = null;
  for (let r = 0; r < rounds; r++) {
    const pairs = findCoplanar(items, only); if (!pairs.length) break;
    const moved = new Set(), fk = f => f.it.ord + ':' + f.ax + ':' + f.s; only = new Set();
    for (const { f, g } of pairs) {
      if (moved.has(fk(f)) || moved.has(fk(g))) continue; // 動かした面がからむ組は次の回に（両方動かすと重なったまま）
      const p = (f.A < g.A * 0.98 || (Math.abs(f.A - g.A) <= g.A * 0.02 && f.it.ord > g.it.ord)) ? f : g, it = p.it;
      if (it.t === 'box') { if (!it.g) it.g = [[0, 0], [0, 0], [0, 0]]; it.g[p.ax][p.s > 0 ? 1 : 0] += DELTA; }
      else { if (!it.g) it.g = [0, 0]; it.g[p.s > 0 ? 1 : 0] += DELTA; }
      moved.add(fk(p)); fixed++;
    }
    for (const { f, g } of pairs) { only.add(f.it); only.add(g.it); }
  }
  return fixed;
}
