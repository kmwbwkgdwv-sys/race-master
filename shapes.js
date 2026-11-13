// でこぼこした形（岩・ふくろ・しげみ）や、ねじれたオブジェの形を作る。three.js に依存しない計算だけ
// どの端末でも同じ形になるよう、乱数は seed から作る

function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 細かく分けた球（正二十面体を分割）
export function icosphere(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), mid = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a; let i = cache.get(k);
      if (i === undefined) { const m = V[a].map((c, j) => (c + V[b][j]) / 2), l = Math.hypot(...m); i = V.length; V.push(m.map(c => c / l)); cache.set(k, i); }
      return i;
    };
    const G = [];
    for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); G.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = G;
  }
  return { V, F };
}

// でこぼこの球：半径を、いくつかの波の重ね合わせでゆがませる。bump=でこぼこの大きさ、freq=細かさ
export function lump(seed, bump = 0.25, freq = 2.2, detail = 3) {
  const { V, F } = icosphere(detail), r = rnd(seed), waves = [];
  for (let i = 0; i < 6; i++) { const th = r() * 6.283, ph = Math.acos(r() * 2 - 1); waves.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), freq * (0.7 + r() * 0.9) * (1 + i * 0.35), r() * 6.283, 1 / (1 + i * 0.6)]); }
  const wsum = waves.reduce((a, w) => a + w[5], 0);
  const n = V.length, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = V[i]; let s = 0;
    for (const w of waves) s += Math.sin((x * w[0] + y * w[1] + z * w[2]) * w[3] * 3.14159 + w[4]) * w[5];
    const k = 1 + bump * s / wsum;
    pos[i * 3] = x * k; pos[i * 3 + 1] = y * k; pos[i * 3 + 2] = z * k;
    uv[i * 2] = 0.5 + Math.atan2(z, x) / 6.2832; uv[i * 2 + 1] = 0.5 + Math.asin(Math.max(-1, Math.min(1, y))) / 3.1416;
  }
  const idx = new Uint32Array(F.length * 3); F.forEach((f, i) => idx.set(f, i * 3));
  // なめらかな面の向き（周りの三角形の向きの平均）
  const nrm = new Float32Array(n * 3);
  for (const [a, b, c] of F) {
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nrm[v * 3] += cx; nrm[v * 3 + 1] += cy; nrm[v * 3 + 2] += cz; }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1; nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l; }
  return { pos, nrm, uv, idx };
}

// ねじれたオブジェ（トーラス結び目）の中心線の点。three.js の TorusKnotGeometry と同じ式
export function knotPoint(u, p, q, R) {
  const cu = Math.cos(u), su = Math.sin(u), quOverP = q / p * u, cs = Math.cos(quOverP);
  return [R * (2 + cs) * 0.5 * cu, R * (2 + cs) * su * 0.5, R * Math.sin(quOverP) * 0.5];
}
