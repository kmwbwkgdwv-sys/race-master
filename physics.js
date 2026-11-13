// 当たり判定（見た目どおりの形）と壁のぼり。three.js に依存しない純粋な計算だけ
// 当たり判定の形
//   t:0 箱（rr = 角の丸み）
//   t:1 円柱・円すい（r0=下の半径, r1=上の半径, sq=四角すい）
//   t:2 だ円体（terrain=丘として上を歩ける, half=上半分だけ）
//   t:3 横に回した箱（yaw = 縦の軸まわりの向き。がらくた・横にねかせた丸太やたる・ななめに置いた物）
//   t:4 角柱（上から見て凸の多角形 × 高さ。岩の地層・板石など）
// sink（箱）= 絵・模様の壁：体が少しだけ面に入りこめる（体の中心は面から sinkR より近づけない）
// sinkV（だ円体・箱）= ボールプール・お湯など：上に乗ると沈む。ただし沈むのは体の高さの SINK_H まで（全身はうまらない）
//   soft = 上に乗れるだけで横からはすり抜ける（水面・ボールの海）
// どの形も x0..x1 / z0..z1 / y0..y1 の外枠を持つ（大まかな判定と配置チェック用）

export const STEP = 0.36; // 乗り越えられる段差
export const CLIMB = { hold: 0.2, speed: 2.8, side: 0.55, pull: 6 };
export const SINK_H = 0.28; // 沈みこめるのは体の高さのこの割合まで（体の一部だけ）

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function boxCol(x0, x1, z0, z1, y0, y1, o = {}) {
  const rr = Math.max(0, Math.min(o.rr || 0, (x1 - x0) / 2 - 0.001, (z1 - z0) / 2 - 0.001));
  return { t: 0, x0, x1, z0, z1, y0, y1, rr, nc: !!o.nc || !!o.soft, sink: !!o.sink, soft: !!o.soft, sinkV: o.sinkV || 0 };
}
export function cylCol(cx, cz, y0, y1, r0, r1, o = {}) {
  const m = Math.max(r0, r1);
  return { t: 1, cx, cz, y0, y1, r0, r1, sq: !!o.sq, walk: !!o.walk, nc: !!o.nc, x0: cx - m, x1: cx + m, z0: cz - m, z1: cz + m };
}
export function ellCol(cx, cy, cz, rx, ry, rz, o = {}) {
  return { t: 2, cx, cy, cz, rx, ry, rz, terrain: !!o.terrain, nc: !!o.nc || !!o.soft, soft: !!o.soft, sinkV: o.sinkV || 0, y0: o.half ? cy : cy - ry, y1: cy + ry, x0: cx - rx, x1: cx + rx, z0: cz - rz, z1: cz + rz };
}
// 縦の軸まわりに yaw だけ回した箱。(cx,cz)=中心、hx/hz=箱の中での半分の幅・奥行（three.js の rotation.y と同じ向き）
export function oboxCol(cx, cz, hx, hz, yaw, y0, y1, o = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
  const rr = Math.max(0, Math.min(o.rr || 0, hx - 0.001, hz - 0.001));
  const lb = { x0: -hx, x1: hx, z0: -hz, z1: hz, y0, y1, rr, nc: !!o.nc, sink: !!o.sink };
  return { t: 3, cx, cz, c, s, hx, hz, y0, y1, rr, nc: !!o.nc, sink: !!o.sink, lb, x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez };
}
// 上から見て凸の多角形の柱。pts = [[x,z], ...]（向きはどちらでもよい）
export function polyCol(pts, y0, y1, o = {}) {
  let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const P = a < 0 ? pts.slice().reverse() : pts.slice(), n = P.length, E = []; // 反時計回り（x→z）にそろえる
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n], ex = q[0] - p[0], ez = q[1] - p[1], L = Math.hypot(ex, ez) || 1;
    E.push([p[0], p[1], ez / L, -ex / L, ex / L, ez / L, L]); // 始点, 外向きの法線, 辺の向き, 長さ
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  return { t: 4, E, y0, y1, nc: !!o.nc, sink: !!o.sink, x0, x1, z0, z1 };
}
// 多角形の外へ出る向きと距離。inside=中にいる、d=面までの距離（中なら負）、nx,nz=外向き
const _pd = { inside: false, d: 0, nx: 0, nz: 0 };
function polyDist(c, x, z) {
  let mx = -1e9, mi = 0;
  for (let i = 0; i < c.E.length; i++) { const e = c.E[i], s = (x - e[0]) * e[2] + (z - e[1]) * e[3]; if (s > mx) { mx = s; mi = i; } }
  if (mx <= 0) { const e = c.E[mi]; _pd.inside = true; _pd.d = mx; _pd.nx = e[2]; _pd.nz = e[3]; return _pd; }
  let bd = 1e9, bx = 0, bz = 0;
  for (const e of c.E) { // いちばん近い辺の上の点
    const t = clamp((x - e[0]) * e[4] + (z - e[1]) * e[5], 0, e[6]), px = e[0] + e[4] * t, pz = e[1] + e[5] * t, dd = Math.hypot(x - px, z - pz);
    if (dd < bd) { bd = dd; bx = px; bz = pz; }
  }
  _pd.inside = false; _pd.d = bd; _pd.nx = bd > 1e-9 ? (x - bx) / bd : 1; _pd.nz = bd > 1e-9 ? (z - bz) / bd : 0;
  return _pd;
}
// 回した箱の中の座標 ⇔ 世界の座標
const _q = { x: 0, y: 0, z: 0 };
function toL(c, x, z, o) { const dx = x - c.cx, dz = z - c.cz; o.x = dx * c.c - dz * c.s; o.z = dx * c.s + dz * c.c; return o; }
const dirW = (c, lx, lz) => [lx * c.c + lz * c.s, -lx * c.s + lz * c.c];
const dirL = (c, wx, wz) => [wx * c.c - wz * c.s, wx * c.s + wz * c.c];

export const cylRad = (c, y) => (y <= c.y0 ? c.r0 : y >= c.y1 ? c.r1 : c.r0 + (c.r1 - c.r0) * (y - c.y0) / (c.y1 - c.y0));
// だ円の、中心から (dx,dz) 方向へのふちまでの距離
function ellRim(c, dx, dz, d) {
  if (d < 1e-6) return Math.min(c.rx, c.rz);
  const ux = dx / d / c.rx, uz = dz / d / c.rz;
  return 1 / Math.sqrt(ux * ux + uz * uz);
}

// 体（半径R・高さHの縦長の筒）を当たり判定から押し出す。足元の高さ ground を返す
// sinkR > 0 のとき（隠れる側）、絵・模様の壁には体の中心を面から sinkR まで近づけられる（体の前の方だけが入る）
export function collide(p, R, H, cols, fall = 0, sinkR = 0) {
  const stepT = Math.max(STEP, fall + 0.08), top = p.y + H * 0.92, svMax = Math.max(0.05, H * SINK_H);
  const st = { ground: 0, blocked: false };
  for (const c of cols) {
    if (p.x <= c.x0 - R || p.x >= c.x1 + R || p.z <= c.z0 - R || p.z >= c.z1 + R) continue;
    if (c.t === 0) {
      if (c.soft) { // ボールの海・水面など：上から入ると沈んで立つ（沈むのは体の一部だけ）。横からはすり抜ける
        if (p.x <= c.x0 || p.x >= c.x1 || p.z <= c.z0 || p.z >= c.z1) continue;
        const s = c.y1 - Math.min(c.sinkV, svMax); if (p.y >= s - Math.min(stepT, fall + 0.12) && s > st.ground) st.ground = s;
        continue;
      }
      boxHit(p, c, R, stepT, fall, sinkR, top, st);
    } else if (c.t === 3) {
      toL(c, p.x, p.z, _q); _q.y = p.y;
      if (boxHit(_q, c.lb, R, stepT, fall, sinkR, top, st)) { const w = dirW(c, _q.x, _q.z); p.x = c.cx + w[0]; p.z = c.cz + w[1]; }
    } else if (c.t === 4) {
      const q = polyDist(c, p.x, p.z);
      if (!q.inside && q.d >= R) continue;
      const sinkOn = c.sink && sinkR > 0, thr = sinkOn && !q.inside ? Math.min(stepT, fall + 0.02) : stepT;
      if (p.y >= c.y1 - thr) { if ((q.inside || q.d < R * 0.7) && c.y1 > st.ground) st.ground = c.y1; continue; }
      if (top < c.y0) continue;
      if (!c.nc) st.blocked = true;
      const r = sinkOn ? Math.min(R, sinkR) : R, m = q.inside ? r - q.d : r - q.d;
      if (m > 0) { p.x += q.nx * m; p.z += q.nz * m; }
    } else if (c.t === 1) {
      const dx = p.x - c.cx, dz = p.z - c.cz, d = c.sq ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
      if (d >= Math.max(c.r0, c.r1) + R) continue;
      // 足場になるか（てっぺん／ゆるい坂）
      const dS = Math.max(0, d - R * 0.6); let s = -1e9;
      if (dS <= c.r1 + 1e-6) s = c.y1;
      else if (c.r0 > c.r1 && dS < c.r0) s = c.y0 + (c.y1 - c.y0) * (c.r0 - dS) / (c.r0 - c.r1);
      if (s > -1e8 && p.y >= s - stepT && (dS <= c.r1 + 1e-6 || c.walk || s <= p.y + 0.03)) { if (s > st.ground) st.ground = s; continue; }
      if (top <= c.y0 || p.y >= c.y1) continue;
      const rad = cylRad(c, c.r0 >= c.r1 ? Math.max(p.y, c.y0) : Math.min(top, c.y1));
      if (c.sq) { if (pushBox(p, R, c.cx - rad, c.cx + rad, c.cz - rad, c.cz + rad, 0) && !c.nc) st.blocked = true; continue; }
      if (d >= rad + R) continue;
      if (!c.nc) st.blocked = true;
      if (d > 1e-6) { const k = (rad + R) / d; p.x = c.cx + dx * k; p.z = c.cz + dz * k; } else p.x = c.cx + rad + R;
    } else {
      const dx = p.x - c.cx, dz = p.z - c.cz, d = Math.hypot(dx, dz), rh = ellRim(c, dx, dz, d);
      if (d >= rh + R) continue;
      const dS = Math.max(0, d - R * (c.terrain ? 0.3 : 0.6)), sv = Math.min(c.sinkV, svMax);
      if (dS < rh) {
        const q = dS / rh, s = c.cy + c.ry * Math.sqrt(1 - q * q);
        if (s >= c.y0 && p.y >= s - sv - (c.terrain ? 3 : c.soft ? Math.min(stepT, fall + 0.12) : stepT) && (c.terrain || c.soft || q < 0.75 || s - sv <= p.y + 0.03)) { if (s - sv > st.ground) st.ground = s - sv; continue; }
      }
      if (c.terrain || c.soft) continue; // 丘は地面として扱うだけ／水面は横からすり抜ける
      const lo = Math.max(p.y, c.y0), hi = Math.min(top, c.y1); if (lo >= hi) continue;
      const v = (clamp(c.cy, lo, hi) - c.cy) / c.ry; if (v * v >= 1) continue;
      const rad = rh * Math.sqrt(1 - v * v);
      if (d >= rad + R) continue;
      if (!c.nc) st.blocked = true;
      if (d > 1e-6) { const k = (rad + R) / d; p.x = c.cx + dx * k; p.z = c.cz + dz * k; } else p.x = c.cx + rad + R;
    }
  }
  return st;
}
// 箱（または回した箱の中の座標）。q を押し出したら true
function boxHit(q, c, R, stepT, fall, sinkR, top, st) {
  const rr = c.rr, cx = clamp(q.x, c.x0 + rr, c.x1 - rr), cz = clamp(q.z, c.z0 + rr, c.z1 - rr);
  const dx = q.x - cx, dz = q.z - cz, d2 = dx * dx + dz * dz, RR = R + rr;
  if (d2 >= RR * RR) return false;
  const sinkOn = c.sink && sinkR > 0;
  // 絵・模様の壁に体を寄せている時は、よじ登りの途中で段差として上に乗らない（上から落ちてきた時だけ乗る）
  const thr = sinkOn && d2 > 1e-8 ? Math.min(stepT, fall + 0.02) : stepT;
  if (q.y >= c.y1 - thr) { const k = rr + R * 0.7; if (d2 < k * k && c.y1 > st.ground) st.ground = c.y1; return false; } // 上に乗れる
  if (top < c.y0) return false;
  if (!c.nc) st.blocked = true;
  return pushBox(q, sinkOn ? Math.min(R, sinkR) : R, c.x0, c.x1, c.z0, c.z1, rr);
}
function pushBox(p, R, x0, x1, z0, z1, rr) {
  const cx = clamp(p.x, x0 + rr, x1 - rr), cz = clamp(p.z, z0 + rr, z1 - rr);
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz, RR = R + rr;
  if (d2 >= RR * RR) return false;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (RR - d) / d; p.x += dx * k; p.z += dz * k; return true; }
  const a = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = a.indexOf(Math.min(...a)); // 中に入り込んだら一番近い面へ
  if (i === 0) p.x = x0 - R; else if (i === 1) p.x = x1 + R; else if (i === 2) p.z = z0 - R; else p.z = z1 + R;
  return true;
}

// 体のパーツの1点が物にめり込んでいたら、外へ出すための移動量 [dx, dz] を返す
//   allow = 絵・模様の壁に入りこんでよい深さ（隠れる側だけ。体の一部しか入らない小さな値）
export function pushOut(v, cols, allow = 0) {
  for (const c of cols) {
    if (c.soft) continue;
    if (v.x <= c.x0 || v.x >= c.x1 || v.z <= c.z0 || v.z >= c.z1 || v.y <= c.y0 + 0.06 || v.y >= c.y1 - 0.1) continue;
    if (c.t === 0 || c.t === 3) {
      let lx = v.x, lz = v.z, b = c;
      if (c.t === 3) { toL(c, v.x, v.z, _q); lx = _q.x; lz = _q.z; b = c.lb; if (lx <= b.x0 || lx >= b.x1 || lz <= b.z0 || lz >= b.z1) continue; }
      const a = [lx - b.x0, b.x1 - lx, lz - b.z0, b.z1 - lz], k = a.indexOf(Math.min(...a));
      let d;
      if (b.sink && allow > 0) { d = a[k] - allow; if (d <= 0) continue; d += 0.02; } // 絵・模様の壁：allow までは体が入りこんでよい
      else d = a[k] + 0.03;
      const lv = k === 0 ? [-d, 0] : k === 1 ? [d, 0] : k === 2 ? [0, -d] : [0, d];
      return c.t === 3 ? dirW(c, lv[0], lv[1]) : lv;
    }
    if (c.t === 4) {
      const q = polyDist(c, v.x, v.z); if (!q.inside) continue;
      let d = -q.d; if (c.sink && allow > 0) { d -= allow; if (d <= 0) continue; d += 0.02; } else d += 0.03;
      return [q.nx * d, q.nz * d];
    }
    const dx = v.x - (c.cx), dz = v.z - c.cz, d = Math.hypot(dx, dz);
    let rad;
    if (c.t === 1) {
      rad = cylRad(c, v.y);
      if (c.sq) { if (Math.abs(dx) >= rad || Math.abs(dz) >= rad) continue; const r = faceOut(v, c.cx - rad, c.cx + rad, c.cz - rad, c.cz + rad); if (r) return r; continue; }
    } else {
      if (c.terrain || c.soft) continue;
      const rh = ellRim(c, dx, dz, d), w = (v.y - c.cy) / c.ry; if (w * w >= 1) continue;
      rad = rh * Math.sqrt(1 - w * w);
      const q = Math.min(1, d / rh), s = c.cy + c.ry * Math.sqrt(1 - q * q);
      if (v.y >= s - c.sinkV - 0.1) continue; // 表面にのっている（沈んでいる）だけ
    }
    if (d >= rad) continue;
    const m = rad - d + 0.03;
    return d > 1e-6 ? [dx / d * m, dz / d * m] : [m, 0];
  }
  return null;
}
function faceOut(v, x0, x1, z0, z1) {
  const a = [v.x - x0, x1 - v.x, v.z - z0, z1 - v.z], k = a.indexOf(Math.min(...a)), d = a[k] + 0.03;
  return k === 0 ? [-d, 0] : k === 1 ? [d, 0] : k === 2 ? [0, -d] : [0, d];
}

// 近くの「登れる面」を探す。gap=体の中心から面までの水平距離、n=面から外向きの向き、top=登りきる高さ
export function findWall(p, R, H, cols, tol) {
  const yb = p.y + 0.05, yt = p.y + H + 0.2;
  let best = null, bg = tol;
  for (const c of cols) {
    if (c.nc || c.terrain || c.y1 <= yb || c.y0 >= yt) continue;
    if (p.x < c.x0 - tol || p.x > c.x1 + tol || p.z < c.z0 - tol || p.z > c.z1 + tol) continue;
    let gap, nx, nz, rTop = 1;
    // collide と同じく「体と重なる高さで一番太いところ」までの距離を測る
    const lo = Math.max(p.y, c.y0), hi = Math.min(p.y + H * 0.92, c.y1);
    const ym = c.t === 1 ? (c.r0 >= c.r1 ? lo : hi) : c.t === 2 ? clamp(c.cy, lo, hi) : lo;
    if (c.t === 3) {
      toL(c, p.x, p.z, _q); const b = c.lb;
      const dx = _q.x - clamp(_q.x, b.x0, b.x1), dz = _q.z - clamp(_q.z, b.z0, b.z1), d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      gap = d; [nx, nz] = dirW(c, dx / d, dz / d);
    } else if (c.t === 4) {
      const q = polyDist(c, p.x, p.z); if (q.inside && !c.sink) continue;
      gap = q.d; nx = q.nx; nz = q.nz;
    } else if (c.t === 0 || c.sq) {
      const h = c.t === 0 ? null : cylRad(c, ym);
      const x0 = h === null ? c.x0 : c.cx - h, x1 = h === null ? c.x1 : c.cx + h, z0 = h === null ? c.z0 : c.cz - h, z1 = h === null ? c.z1 : c.cz + h;
      const dx = p.x - clamp(p.x, x0, x1), dz = p.z - clamp(p.z, z0, z1), d = Math.hypot(dx, dz);
      if (d < 1e-6) { // 中に入っている：絵の壁に沈んでいるときは、いちばん近い面を壁とする
        if (!c.sink) continue;
        const a = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = a.indexOf(Math.min(...a));
        gap = -a[i]; nx = i === 0 ? -1 : i === 1 ? 1 : 0; nz = i === 2 ? -1 : i === 3 ? 1 : 0;
      } else { gap = d; nx = dx / d; nz = dz / d; }
      rTop = c.t === 0 ? 1 : c.r1;
    } else {
      const dx = p.x - c.cx, dz = p.z - c.cz, d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      let rad;
      if (c.t === 1) { rad = cylRad(c, ym); rTop = c.r1; }
      else { const w = (ym - c.cy) / c.ry; rad = ellRim(c, dx, dz, d) * Math.sqrt(Math.max(0, 1 - w * w)); rTop = 0.15; }
      gap = d - rad; nx = dx / d; nz = dz / d;
    }
    if (gap < bg) { bg = gap; best = { c, gap, nx, nz, rTop, round: c.t === 1 ? !c.sq : c.t === 2, sink: !!c.sink }; }
  }
  if (!best) return null;
  // 真上にすき間なく積み重なっている物（その物と重なっている物）があれば、そのてっぺんまで登れる
  let top = best.c.y1, ct = best.c;
  for (let g = 0; g < 8; g++) {
    let nx = null;
    for (const c of cols) {
      if (c === ct || c.nc || c.terrain || c.y0 > top + 0.05 || c.y1 <= top + 0.01) continue;
      if (c.x0 > ct.x1 + 0.1 || c.x1 < ct.x0 - 0.1 || c.z0 > ct.z1 + 0.1 || c.z1 < ct.z0 - 0.1) continue; // いまの物と重なっていない物は別の物
      if (p.x < c.x0 - tol - 0.2 || p.x > c.x1 + tol + 0.2 || p.z < c.z0 - tol - 0.2 || p.z > c.z1 + tol + 0.2) continue;
      if (!nx || c.y1 > nx.y1) nx = c;
    }
    if (!nx) break;
    top = nx.y1; ct = nx;
  }
  best.top = top;
  return best;
}

// 頭の上の天井をさがす（下から物の中に入りこむと、反対側へ押し出されて壁抜けになるため）
function under(c, p, m) {
  if (c.t === 0) return p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m;
  if (c.t === 3) { toL(c, p.x, p.z, _q); return _q.x > -c.hx - m && _q.x < c.hx + m && _q.z > -c.hz - m && _q.z < c.hz + m; }
  if (c.t === 4) { const q = polyDist(c, p.x, p.z); return q.inside || q.d < m; }
  const dx = p.x - c.cx, dz = p.z - c.cz;
  if (c.t === 1) { const r = c.r0 + m; return c.sq ? Math.abs(dx) < r && Math.abs(dz) < r : dx * dx + dz * dz < r * r; }
  if (c.y0 < c.cy - 1e-6) return false; // 下が丸い物は横への押し出しにまかせる
  const d = Math.hypot(dx, dz); return d < ellRim(c, dx, dz, d) + m;
}
export function ceilingAt(p, R, top, cols) {
  let best = null;
  for (const c of cols) {
    if (c.terrain || c.soft || c.y0 < top - 0.05 || (best && c.y0 >= best.y0)) continue;
    if (p.x < c.x0 - R || p.x > c.x1 + R || p.z < c.z0 - R || p.z > c.z1 + R) continue;
    if (under(c, p, R * 0.5)) best = c;
  }
  return best;
}
// 向き (nx,nz) に進んで、その物の下から出るまでの距離
function exitDist(c, p, nx, nz, m) {
  if (c.t === 4) { // 凸の多角形：その向きに進んで外（ふちから m の所）に出るまで
    let t = Infinity;
    for (const e of c.E) { const k = nx * e[2] + nz * e[3]; if (k > 1e-6) t = Math.min(t, (m - ((p.x - e[0]) * e[2] + (p.z - e[1]) * e[3])) / k); }
    return Math.max(0, t === Infinity ? 0 : t);
  }
  if (c.t === 0 || c.t === 3 || c.sq) {
    let px = p.x, pz = p.z, dx = nx, dz = nz, x0, x1, z0, z1;
    if (c.t === 3) { toL(c, p.x, p.z, _q); px = _q.x; pz = _q.z; [dx, dz] = dirL(c, nx, nz); x0 = -c.hx; x1 = c.hx; z0 = -c.hz; z1 = c.hz; }
    else { const h = c.t === 0 ? 0 : c.r0; x0 = c.t === 0 ? c.x0 : c.cx - h; x1 = c.t === 0 ? c.x1 : c.cx + h; z0 = c.t === 0 ? c.z0 : c.cz - h; z1 = c.t === 0 ? c.z1 : c.cz + h; }
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (x1 + m - px) / dx); else if (dx < -1e-6) t = Math.min(t, (x0 - m - px) / dx);
    if (dz > 1e-6) t = Math.min(t, (z1 + m - pz) / dz); else if (dz < -1e-6) t = Math.min(t, (z0 - m - pz) / dz);
    return Math.max(0, t);
  }
  const ox = p.x - c.cx, oz = p.z - c.cz, d = Math.hypot(ox, oz);
  const r = (c.t === 1 ? c.r0 : ellRim(c, ox, oz, d)) + m, b = ox * nx + oz * nz, disc = b * b - (ox * ox + oz * oz - r * r);
  return disc < 0 ? 0 : Math.max(0, -b + Math.sqrt(disc));
}

// 1フレーム分の移動。b = 体の状態, inp = 入力。くっつき状態が変わったら 'on' / 'off' / 'top' を返す
//   ジャンプ長押し（hold秒以上）で近くの壁にくっつき、押している間は上へ登る
//   一度くっつけば、離しても壁にくっついたまま（スティックで上下左右に移動）
//   もう一度ジャンプを押すと壁から離れる
export function stepBody(b, inp, dt, cols) {
  const p = b.pos; let ev = '';
  if (inp.frozen && b.cling) { b.cling = null; ev = 'off'; }
  if (inp.press && !inp.frozen) {
    if (b.cling) {
      if (b.cling.rel) { const n = b.cling; b.cling = null; b.vy = 4.2; b.kx = n.nx * 3.2; b.kz = n.nz * 3.2; b.used = true; ev = 'off'; }
    } else { b.used = false; if (b.ground) { b.vy = 7; b.ground = false; } }
  }
  if (b.cling && !inp.held) b.cling.rel = true;

  if (b.cling) {
    const n = b.cling, sp = inp.sp || 1, dot = inp.mx * n.nx + inp.mz * n.nz;
    p.x += (inp.mx - dot * n.nx) * CLIMB.side * dt; p.z += (inp.mz - dot * n.nz) * CLIMB.side * dt;
    let v = clamp((inp.held && !n.rel ? CLIMB.speed : 0) - dot / sp * CLIMB.speed, -CLIMB.speed, CLIMB.speed);
    if (v > 0) { // 上に物があるとき：小さな出っぱりなら外へ回りこむ、大きな天井ならそこで止まる
      const top = p.y + b.h * 0.92, cz = ceilingAt(p, b.r, top, cols);
      if (cz && top + v * dt > cz.y0 - 0.01) {
        const out = exitDist(cz, p, n.nx, n.nz, b.r + 0.02);
        if (out < 2.7) { p.x += n.nx * out; p.z += n.nz * out; n.gap += out; }
        else v = Math.max(0, (cz.y0 - 0.01 - top) / dt);
      }
    }
    p.y += v * dt; b.vy = 0; b.kx = b.kz = 0;
    const want = n.sink && b.sinkR > 0 ? b.sinkR + 0.005 : Math.max(b.r + 0.01, n.hold || 0); // 壁にぴったり寄せる（絵の壁には少しだけ入りこむ）
    if (n.gap > want) { const m = Math.min(CLIMB.pull * dt, n.gap - want); p.x -= n.nx * m; p.z -= n.nz * m; }
    const res = collide(p, b.r, b.h, cols, 0, b.sinkR || 0);
    if (p.y <= res.ground) { p.y = res.ground; if (v < 0 || res.ground > 0.01) { b.cling = null; b.ground = true; return 'off'; } }
    const w = findWall(p, b.r, b.h, cols, Math.max(b.r + 0.3, (b.reach || 0) + 0.2));
    if (!w) { b.cling = null; b.ground = false; return 'off'; }
    n.nx = w.nx; n.nz = w.nz; n.gap = w.gap; n.sink = w.sink;
    if (n.pushed) { n.hold = w.gap; n.pushed = false; }
    if (v > 0 && p.y >= w.top - 0.4) { // てっぺんに上がる
      const inward = w.gap + (w.round ? clamp(w.rTop * 0.7, 0.05, 0.3) : 0.3);
      p.x -= w.nx * inward; p.z -= w.nz * inward; p.y = w.top + 0.02; b.vy = 0; b.cling = null; b.ground = true;
      return 'top';
    }
    b.ground = false;
    return ev;
  }

  const kd = Math.max(0, 1 - 5 * dt);
  p.x += (inp.mx + (b.kx || 0)) * dt; p.z += (inp.mz + (b.kz || 0)) * dt; b.kx = (b.kx || 0) * kd; b.kz = (b.kz || 0) * kd;
  b.vy -= 20 * dt; let dy = b.vy * dt;
  if (dy > 0) { const top = p.y + b.h * 0.92, cz = ceilingAt(p, b.r, top, cols); if (cz && top + dy > cz.y0 - 0.01) { dy = Math.max(0, cz.y0 - 0.01 - top); b.vy = 0; } } // 頭をぶつけたら止まる
  p.y += dy;
  const res = collide(p, b.r, b.h, cols, Math.max(0, -b.vy * dt), b.sinkR || 0);
  b.blocked = res.blocked;
  if (p.y <= res.ground) { p.y = res.ground; b.vy = 0; b.ground = true; } else b.ground = false;
  if (inp.held && !b.used && !inp.frozen && inp.heldFor >= CLIMB.hold) {
    const w = findWall(p, b.r, b.h, cols, Math.max(b.r, b.reach || 0) + 0.25); // 壁のすぐそばなら、押しつけていなくてもくっつける
    if (w && w.top > p.y + 0.45) { b.cling = { nx: w.nx, nz: w.nz, gap: w.gap, rel: false, hold: 0, sink: w.sink }; b.vy = 0; b.ground = false; ev = 'on'; }
  }
  return ev;
}

// 物の置き場所チェック（大まかな外枠で判定）
export function isFree(x, z, r, cols) {
  for (const c of cols) { if (c.y1 <= 0.4 || c.y0 >= 1.8) continue; if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false; }
  return true;
}

// 当たり判定を場所ごとに分けておく（近くの物だけを調べて軽くする）
export function makeGrid(cols, cs = 4) {
  const m = new Map(), key = (i, j) => (i + 2048) * 4096 + (j + 2048);
  cols.forEach((c, n) => {
    c._n = n;
    const i0 = Math.floor(c.x0 / cs), i1 = Math.floor(c.x1 / cs), j0 = Math.floor(c.z0 / cs), j1 = Math.floor(c.z1 / cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let a = m.get(k); if (!a) m.set(k, a = []); a.push(c); }
  });
  return { m, cs, key, stamp: 0, mark: new Uint32Array(cols.length + 1), out: [] };
}
// (x,z) から r 以内にかかる当たり判定の一覧（返す配列は次の呼び出しで使い回す）
export function nearCols(g, x, z, r) {
  const out = g.out; out.length = 0; g.stamp = (g.stamp + 1) >>> 0 || 1;
  const cs = g.cs, i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((z - r) / cs), j1 = Math.floor((z + r) / cs);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = g.m.get(g.key(i, j)); if (!a) continue;
    for (const c of a) if (g.mark[c._n] !== g.stamp) { g.mark[c._n] = g.stamp; out.push(c); }
  }
  return out;
}
