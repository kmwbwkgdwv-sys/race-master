// 模様テクスチャ（どれも上下左右につなぎ目なく並ぶ）。スポイトで模様の色も吸える
// drawPattern(ctx, S, kind, c1, c2, rnd)  c1 = 地の色、c2 = 模様の色（色の配列も可）
const arr = c => (Array.isArray(c) ? c : [c]);

export function drawPattern(x, S, kind, c1, c2, r) {
  if (kind.startsWith('art')) return drawArt(x, S, kind, c1, arr(c2), r);
  const cols = arr(c2), col = i => cols[i % cols.length];
  x.fillStyle = c1; x.fillRect(0, 0, S, S);
  // はみ出した分を反対側にも描いて、つなぎ目をなくす
  const wrap = (fn, px, py, m) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (px + dx > -m && px + dx < S + m && py + dy > -m && py + dy < S + m) fn(px + dx, py + dy); };
  const dot = (px, py, rad, c) => { x.fillStyle = c; wrap((a, b) => { x.beginPath(); x.arc(a, b, rad, 0, 6.2832); x.fill(); }, px, py, rad); };
  const speck = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * S, r() * S, 2 + r() * 5, 2 + r() * 5); } };
  const q = S / 4;
  switch (kind) {
    case 'dots': // 水玉
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) dot(i * q + (j % 2 ? q / 2 : 0) + q / 4, j * q + q / 2, q * 0.27, col(i + j));
      break;
    case 'hstripe': // 横じま
      for (let i = 0; i < 4; i++) if (i % 2) { x.fillStyle = col(i >> 1); x.fillRect(0, i * q, S, q); }
      break;
    case 'vband': // たてじま
      for (let i = 0; i < 4; i++) if (i % 2) { x.fillStyle = col(i >> 1); x.fillRect(i * q, 0, q, S); }
      break;
    case 'diag': // ななめじま
      x.lineWidth = q * 0.5; x.lineCap = 'butt';
      for (let k = -6; k < 6; k++) { x.strokeStyle = col(k & 1); x.beginPath(); x.moveTo(k * q - q, -q); x.lineTo(k * q + S + q, S + q); x.stroke(); }
      break;
    case 'zigzag': // ギザギザ
      x.lineWidth = q * 0.36; x.lineJoin = 'miter';
      for (let j = 0; j < 4; j++) { x.strokeStyle = col(j); x.beginPath(); for (let i = -1; i <= 8; i++) x.lineTo(i * q / 2, j * q + q / 2 + (i % 2 ? -q / 4 : q / 4)); x.stroke(); }
      break;
    case 'check2': // 大きな市松
      x.fillStyle = col(0); x.fillRect(0, 0, S / 2, S / 2); x.fillRect(S / 2, S / 2, S / 2, S / 2);
      break;
    case 'brick': // レンガ
      x.fillStyle = col(0); x.fillRect(0, 0, S, S); x.fillStyle = c1;
      for (let j = 0; j < 4; j++) { x.fillRect(0, j * q, S, 4); for (let i = 0; i < 2; i++) x.fillRect(((i * S / 2 + (j % 2 ? S / 4 : 0)) % S), j * q, 4, q); }
      speck(80, 0.04);
      break;
    case 'camo': // 迷彩（まだら）
      for (let k = 0; k < 3; k++) for (let i = 0; i < 9; i++) { const cx = r() * S, cy = r() * S, c = col(k); for (let b = 0; b < 4; b++) dot(cx + (r() - 0.5) * q, cy + (r() - 0.5) * q, q * (0.22 + r() * 0.3), c); }
      break;
    case 'confetti': // 紙ふぶき・花畑
      for (let i = 0; i < 70; i++) dot(r() * S, r() * S, 2.5 + r() * 4, col(i));
      break;
    case 'splat': // ペンキのしぶき
      for (let i = 0; i < 9; i++) {
        const cx = r() * S, cy = r() * S, c = col(i), s = q * (0.35 + r() * 0.45); dot(cx, cy, s, c);
        for (let b = 0; b < 7; b++) { const a = r() * 6.283, d = s * (1 + r() * 1.3); dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * (0.12 + r() * 0.25), c); }
      }
      break;
    case 'rainbow': // にじ色の帯
      { const n = Math.max(2, cols.length); for (let i = 0; i < n; i++) { x.fillStyle = col(i); x.fillRect(0, Math.floor(i * S / n), S, Math.ceil(S / n) + 1); } }
      break;
    case 'wave': // 波
      x.lineWidth = q * 0.34;
      for (let j = 0; j < 4; j++) { x.strokeStyle = col(j); x.beginPath(); for (let i = -8; i <= S + 8; i += 4) x.lineTo(i, j * q + q / 2 + Math.sin(i / S * 6.2832 * 2) * q * 0.22); x.stroke(); }
      break;
    case 'leaf': // 葉っぱ
      speck(60, 0.05);
      for (let i = 0; i < 46; i++) { const cx = r() * S, cy = r() * S, c = col(i), a = r() * 3.14; x.fillStyle = c; wrap((ax, ay) => { x.beginPath(); x.ellipse(ax, ay, 9, 4.5, a, 0, 6.2832); x.fill(); }, cx, cy, 10); }
      break;
    case 'bark': // 木の皮
      for (let i = 0; i < 26; i++) { x.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)'; const px = r() * S, w = 2 + r() * 5; x.fillRect(px, 0, w, S); }
      speck(60, 0.05);
      break;
    case 'planks': { // 木箱の板（たての板・すき間・まわりのわく）
      const fr = q * 0.34; x.fillStyle = col(0);
      for (let i = 0; i < 4; i++) { x.fillStyle = shade(c1, 0.9 + ((i * 37) % 5) * 0.04); x.fillRect(i * q, 0, q, S); x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(i * q, 0, 3, S); }
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(60,30,10,${(0.05 + r() * 0.08).toFixed(3)})`; x.fillRect(r() * S, r() * S, 1 + r() * 1.5, 8 + r() * 26); } // 木目
      x.fillStyle = shade(c1, 0.78); x.fillRect(0, 0, S, fr); x.fillRect(0, S - fr, S, fr); x.fillRect(0, 0, fr, S); x.fillRect(S - fr, 0, fr, S);
      x.strokeStyle = shade(c1, 0.72); x.lineWidth = fr * 0.8; x.beginPath(); x.moveTo(fr, fr); x.lineTo(S - fr, S - fr); x.stroke(); // ななめの補強
      x.fillStyle = 'rgba(0,0,0,0.5)'; for (const [a, b] of [[fr / 2, fr / 2], [S - fr / 2, fr / 2], [fr / 2, S - fr / 2], [S - fr / 2, S - fr / 2]]) { x.beginPath(); x.arc(a, b, 2.2, 0, 6.2832); x.fill(); } // くぎ
      break;
    }
    case 'carton': // 段ボール（まん中にガムテープ・ふたの線・印刷）
      speck(120, 0.03);
      x.fillStyle = shade(c1, 0.82); x.fillRect(0, S * 0.495, S, 2);
      x.fillStyle = 'rgba(236,224,196,0.85)'; x.fillRect(S * 0.41, 0, S * 0.18, S);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(S * 0.43, 0, S * 0.03, S);
      x.strokeStyle = 'rgba(40,30,20,0.55)'; x.lineWidth = 2; x.strokeRect(S * 0.08, S * 0.66, S * 0.2, S * 0.2); x.beginPath(); x.moveTo(S * 0.12, S * 0.8); x.lineTo(S * 0.18, S * 0.7); x.lineTo(S * 0.24, S * 0.8); x.stroke(); // 上向き矢印のマーク
      break;
    case 'corrugate': // 波板（コンテナ・倉庫の壁）
      for (let i = 0; i < 16; i++) { const g = x.createLinearGradient(i * S / 16, 0, (i + 1) * S / 16, 0); g.addColorStop(0, shade(c1, 0.78)); g.addColorStop(0.5, shade(c1, 1.12)); g.addColorStop(1, shade(c1, 0.78)); x.fillStyle = g; x.fillRect(i * S / 16, 0, S / 16 + 1, S); }
      for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(120,60,20,${(0.05 + r() * 0.12).toFixed(3)})`; x.fillRect(r() * S, r() * S, 2 + r() * 10, 2 + r() * 16); } // さび
      break;
    case 'vents': // ロッカーの通気口・取っ手
      x.fillStyle = 'rgba(0,0,0,0.45)'; for (let i = 0; i < 6; i++) x.fillRect(S * 0.3, S * 0.06 + i * S * 0.045, S * 0.4, S * 0.022);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 3, S); x.fillRect(S - 3, 0, 3, S);
      x.fillStyle = '#c9ccd0'; x.fillRect(S * 0.78, S * 0.45, S * 0.06, S * 0.14); x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(S * 0.79, S * 0.47, S * 0.04, S * 0.1);
      x.fillStyle = '#f4f4f4'; x.fillRect(S * 0.4, S * 0.38, S * 0.2, S * 0.08);
      break;
    case 'rockface': // 岩肌：大きな色の面（体に塗りやすい）と少しのひび
      for (let k = 0; k < 7; k++) { // 角ばった色の面
        const cx = r() * S, cy = r() * S, rad = q * (0.7 + r() * 0.9), n = 5 + Math.floor(r() * 3), c = col(k);
        x.fillStyle = c; wrap((a, b) => { x.beginPath(); for (let i = 0; i < n; i++) { const t = i / n * 6.2832 + r() * 0.4, rr = rad * (0.7 + r() * 0.3); i ? x.lineTo(a + Math.cos(t) * rr, b + Math.sin(t) * rr) : x.moveTo(a + Math.cos(t) * rr, b + Math.sin(t) * rr); } x.closePath(); x.fill(); }, cx, cy, rad);
      }
      x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) { let a = r() * S, b = r() * S; x.beginPath(); x.moveTo(a, b); for (let i = 0; i < 5; i++) { a += (r() - 0.5) * q; b += r() * q * 0.6; x.lineTo(a, b); } x.stroke(); }
      speck(90, 0.04);
      break;
    case 'strata': // 地層（よこの帯。上下でつながる）
      { const n = 3; for (let i = 0; i < n; i++) { x.fillStyle = col(i); const y0 = Math.floor(i * S / n + (i ? S / n * 0.3 : 0)); x.fillRect(0, y0, S, Math.ceil(S / n * (i ? 0.3 : 0.5))); } }
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const y = r() * S; x.beginPath(); for (let i = 0; i <= 8; i++) x.lineTo(i * S / 8, y + (r() - 0.5) * 6); x.stroke(); }
      speck(110, 0.035);
      break;
    case 'bigcamo': // 大きな迷彩（色の数が少なく、体にまねしやすい）
      for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) { const cx = r() * S, cy = r() * S, c = col(k); for (let b = 0; b < 3; b++) dot(cx + (r() - 0.5) * q * 1.4, cy + (r() - 0.5) * q * 1.4, q * (0.45 + r() * 0.35), c); }
      break;
    case 'graffiti': // らくがき（太いしぶき・ぐるぐる・ギザギザの線）
      for (let i = 0; i < 6; i++) { const cx = r() * S, cy = r() * S, c = col(i), s = q * (0.4 + r() * 0.5); dot(cx, cy, s, c); for (let b = 0; b < 5; b++) { const a = r() * 6.283, d = s * (1 + r()); dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * (0.1 + r() * 0.2), c); } }
      x.lineCap = 'round'; x.lineJoin = 'round';
      for (let i = 0; i < 4; i++) { x.strokeStyle = col(i + 2); x.lineWidth = q * (0.12 + r() * 0.12); x.beginPath(); let a = r() * S, b = r() * S; x.moveTo(a, b); for (let k = 0; k < 6; k++) { a += (r() - 0.5) * q * 1.6; b += (r() - 0.5) * q * 1.6; x.lineTo(a, b); } x.stroke(); }
      x.strokeStyle = '#1b1d20'; x.lineWidth = 3; for (let i = 0; i < 2; i++) { const a = r() * S * 0.6, b = r() * S * 0.7 + 20; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(a + 20, b - 30, a + 40, b); x.quadraticCurveTo(a + 60, b + 30, a + 80, b); x.stroke(); }
      break;
    case 'grain': // 木目（家具の板）
      for (let i = 0; i < 22; i++) { x.strokeStyle = `rgba(70,40,15,${(0.06 + r() * 0.1).toFixed(3)})`; x.lineWidth = 1 + r() * 2; const y = r() * S; x.beginPath(); for (let k = 0; k <= 8; k++) x.lineTo(k * S / 8, y + Math.sin(k * 0.9 + i) * 3 + (r() - 0.5) * 2); x.stroke(); }
      speck(60, 0.03);
      break;
    case 'fabric': // 布（ソファ・クッションの織り目）
      for (let i = 0; i < S; i += 4) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); }
      speck(160, 0.03);
      break;
    case 'vend': // 自動販売機の窓（ならんだ飲み物とねだん）
      x.fillStyle = shade(c1, 1.05); x.fillRect(0, 0, S, S);
      for (let j = 0; j < 3; j++) {
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, (j + 1) * S / 3 - 6, S, 6);
        for (let i = 0; i < 6; i++) { const cx = (i + 0.5) * S / 6, by = (j + 1) * S / 3 - 14, c = col(i + j * 2); x.fillStyle = c; x.fillRect(cx - 7, by - 22, 14, 22); x.fillRect(cx - 3, by - 28, 6, 6); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(cx - 5, by - 18, 3, 14); x.fillStyle = '#1b1d20'; x.fillRect(cx - 6, by + 2, 12, 5); }
      }
      break;
    case 'tatami': { // たたみ（い草のすじ・ふちの帯）。1枚に2畳（たて・よこ）
      x.fillStyle = 'rgba(70,90,30,0.16)'; for (let i = 0; i < S; i += 5) x.fillRect(0, i, S, 2);
      x.fillStyle = 'rgba(255,255,230,0.10)'; for (let i = 2; i < S; i += 9) x.fillRect(0, i, S, 1);
      speck(70, 0.03); x.fillStyle = col(0); x.fillRect(0, 0, S, 9); x.fillRect(0, S / 2 - 4, S, 9); x.fillRect(0, 0, 3, S);
      break;
    }
    case 'clock': { // 時計の文字ばん（目もりと針）
      const c = S / 2; x.fillStyle = col(0);
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, rr = k % 3 ? 5 : 9; x.fillRect(c + Math.cos(a) * S * 0.4 - rr, c + Math.sin(a) * S * 0.4 - rr, rr * 2, rr * 2); }
      x.strokeStyle = col(0); x.lineCap = 'round'; x.lineWidth = S * 0.045; x.beginPath(); x.moveTo(c, c); x.lineTo(c + S * 0.2, c - S * 0.12); x.stroke();
      x.lineWidth = S * 0.03; x.beginPath(); x.moveTo(c, c); x.lineTo(c - S * 0.05, c - S * 0.33); x.stroke();
      break;
    }
    case 'rooftile': { // 屋根がわら（横にならんだかわら。段ごとにずれた継ぎ目・かげ・つや）
      for (let j = 0; j < 4; j++) {
        const y0 = j * q; x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, y0 + q * 0.8, S, q * 0.2);
        x.fillStyle = 'rgba(255,255,255,0.13)'; x.fillRect(0, y0 + q * 0.08, S, q * 0.16);
        for (let i = 0; i < 8; i++) { const cx = i * S / 8 + (j % 2 ? S / 16 : 0); x.fillStyle = col(0); wrap((a, b) => x.fillRect(a, b, 4, q * 0.8), cx, y0, 8); }
      }
      break;
    }
    case 'tile': { // タイル（目地）
      const n = 4, t = S / n; x.fillStyle = col(0);
      for (let i = 0; i < n; i++) { x.fillRect(0, i * t, S, 3); x.fillRect(i * t, 0, 3, S); }
      x.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) x.fillRect(i * t + 6, j * t + 6, t * 0.35, 3);
      break;
    }
    case 'shoji': { // しょうじ（白い紙と木のこうし）
      x.fillStyle = col(0); const c = 3, rws = 4;
      for (let i = 0; i <= c; i++) x.fillRect(i * S / c - 3, 0, 6, S);
      for (let j = 0; j <= rws; j++) x.fillRect(0, j * S / rws - 3, S, 6);
      x.fillStyle = 'rgba(0,0,0,0.04)'; for (let i = 0; i < 30; i++) x.fillRect(r() * S, r() * S, 10 + r() * 20, 2);
      break;
    }
    case 'floorwood': { // フローリング（ずらして並んだ板）
      const n = 6, t = S / n;
      for (let j = 0; j < n; j++) {
        let a = -Math.floor(r() * S * 0.5);
        while (a < S) { const L = S * (0.35 + r() * 0.5); x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${(0.03 + r() * 0.06).toFixed(3)})`; x.fillRect(a, j * t, L, t); x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(a, j * t, 2, t); a += L; }
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, j * t, S, 2);
      }
      x.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 60; i++) x.fillRect(r() * S, r() * S, 12 + r() * 30, 1);
      break;
    }
    case 'cabinet': // 台所の戸だな（とびらと取っ手）
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 0, 3, S); x.fillRect(0, S * 0.24, S, 3);
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(6, S * 0.3, S - 12, 2);
      x.fillStyle = col(0); x.fillRect(S * 0.72, S * 0.1, S * 0.16, 4); x.fillRect(S * 0.8, S * 0.36, 5, S * 0.22);
      break;
    case 'books': // 本だなの本（いろいろな色と高さの背表紙）
      for (let j = 0; j < 4; j++) {
        const y1 = (j + 1) * S / 4 - 4; x.fillStyle = shade(c1, 0.7); x.fillRect(0, y1, S, 4);
        for (let a = 2; a < S - 4;) { const w = 5 + Math.floor(r() * 7), hh = S / 4 * (0.6 + r() * 0.32); x.fillStyle = col(Math.floor(r() * 8)); x.fillRect(a, y1 - hh, w, hh); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(a + 1, y1 - hh * 0.8, w - 2, 2); a += w + 1; }
      }
      break;
    case 'chain': // 金あみのフェンス（ひし形のあみ目）
      x.fillStyle = shade(c1, 0.42); x.fillRect(0, 0, S, S);
      x.strokeStyle = c1; x.lineWidth = 2.2;
      for (let k = -8; k <= 8; k++) { x.beginPath(); x.moveTo(k * q / 2, 0); x.lineTo(k * q / 2 + S, S); x.stroke(); x.beginPath(); x.moveTo(k * q / 2, S); x.lineTo(k * q / 2 + S, 0); x.stroke(); }
      break;
    case 'blockwall': // ブロック塀（目地と、ところどころに花の形の穴）
      x.fillStyle = 'rgba(0,0,0,0.28)';
      for (let j = 0; j < 4; j++) { x.fillRect(0, j * q, S, 3); for (let i = 0; i < 2; i++) x.fillRect(i * S / 2, j * q, 3, q); }
      for (const [a, b] of [[S * 0.25, q * 1.5], [S * 0.75, q * 3.5]]) { x.fillStyle = 'rgba(0,0,0,0.55)'; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(a + Math.cos(k * 1.571) * q * 0.16, b + Math.sin(k * 1.571) * q * 0.16, q * 0.14, 0, 6.2832); x.fill(); } }
      speck(120, 0.04);
      break;
    case 'aqua': { // 水そう（水・水草・魚・あわ・じゃり）
      const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#9fdcf0'); g.addColorStop(1, '#2f7fb0'); x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.fillStyle = '#d9c49a'; x.fillRect(0, S * 0.86, S, S * 0.14); for (let i = 0; i < 40; i++) { x.fillStyle = r() < 0.5 ? '#b8a07a' : '#efe2c4'; x.fillRect(r() * S, S * 0.86 + r() * S * 0.12, 3, 3); }
      x.strokeStyle = '#3f9b4a'; x.lineWidth = 4; for (let i = 0; i < 6; i++) { const a = r() * S; x.beginPath(); x.moveTo(a, S * 0.88); for (let k = 1; k <= 6; k++) x.lineTo(a + Math.sin(k + i) * 6, S * 0.88 - k * S * 0.08); x.stroke(); }
      for (let i = 0; i < 5; i++) { const a = 20 + r() * (S - 40), b = 20 + r() * S * 0.6, c = col(i); x.fillStyle = c; x.beginPath(); x.ellipse(a, b, 9, 5, 0, 0, 6.2832); x.fill(); x.beginPath(); x.moveTo(a - 8, b); x.lineTo(a - 15, b - 5); x.lineTo(a - 15, b + 5); x.closePath(); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 10; i++) { x.beginPath(); x.arc(S * 0.8 + r() * 10, r() * S * 0.8, 2 + r() * 2, 0, 6.2832); x.fill(); }
      break;
    }
    default: speck(280, 0.035); // ざらつき
  }
}

// ---- 額縁の絵（つなぎ目なしではなく、1枚の絵）。体に同じ色・形を塗れば絵に溶けこめる ----
export const ART_KINDS = ['artLand', 'artGrid', 'artFruit', 'artSea', 'artFlower', 'artNight', 'artDots', 'artAbs', 'artField', 'artCat'];
function drawArt(x, S, kind, c1, P, r) {
  const p = i => P[i % P.length], u = S / 256;
  const rect = (c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a * u, b * u, w * u, h * u); };
  const circ = (c, a, b, rad) => { x.fillStyle = c; x.beginPath(); x.arc(a * u, b * u, rad * u, 0, 6.2832); x.fill(); };
  const ell = (c, a, b, rx, ry, rot = 0) => { x.fillStyle = c; x.beginPath(); x.ellipse(a * u, b * u, rx * u, ry * u, rot, 0, 6.2832); x.fill(); };
  const poly = (c, pts) => { x.fillStyle = c; x.beginPath(); pts.forEach((q, i) => (i ? x.lineTo(q[0] * u, q[1] * u) : x.moveTo(q[0] * u, q[1] * u))); x.closePath(); x.fill(); };
  const hill = (c, base, amp, f, ph) => { const pts = [[0, 256]]; for (let i = 0; i <= 32; i++) pts.push([i * 8, base - amp * (0.6 * Math.sin(i * f + ph) + 0.4 * Math.sin(i * f * 2.3 + ph * 1.7))]); pts.push([256, 256]); poly(c, pts); };
  const brush = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * S, r() * S, (3 + r() * 10) * u, (1 + r() * 2) * u); } }; // 筆のあと
  x.fillStyle = c1; x.fillRect(0, 0, S, S);
  switch (kind) {
    case 'artLand': { // 山と丘の風景
      for (let i = 0; i < 6; i++) rect(i % 2 ? '#bfe3f2' : '#aedcf0', 0, i * 22, 256, 22);
      circ('#ffe28a', 196, 46, 22); circ('#fff4c2', 196, 46, 15);
      ell('#ffffff', 70, 40, 30, 10); ell('#ffffff', 92, 34, 22, 10);
      poly('#8d9bb0', [[0, 150], [60, 70], [110, 140], [160, 60], [230, 150], [256, 120], [256, 256], [0, 256]]);
      poly('#f4f4f4', [[60, 70], [72, 86], [52, 86]]); poly('#f4f4f4', [[160, 60], [174, 78], [148, 78]]);
      hill(p(0), 170, 14, 0.35, 1); hill(p(1), 200, 12, 0.5, 3); hill(p(2), 230, 10, 0.7, 5);
      for (let i = 0; i < 9; i++) { const a = 20 + r() * 216, b = 190 + r() * 50; rect('#6b4a2b', a - 2, b, 4, 12); circ(p(3), a, b - 4, 9); }
      break;
    }
    case 'artGrid': { // 太い線と原色の四角
      const xs = [0, 60 + r() * 30, 150 + r() * 30, 256], ys = [0, 50 + r() * 40, 150 + r() * 40, 256];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const c = r() < 0.45 ? p(i * 3 + j) : '#f4f1e8'; rect(c, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]); }
      for (const v of xs.slice(1, 3)) rect('#1b1d20', v - 5, 0, 10, 256);
      for (const v of ys.slice(1, 3)) rect('#1b1d20', 0, v - 5, 256, 10);
      rect('#1b1d20', xs[1], ys[1] + 40, xs[2] - xs[1], 8);
      break;
    }
    case 'artFruit': { // 机の上のくだもの
      rect(p(0), 0, 0, 256, 160); rect(shade(p(0), 0.85), 0, 0, 256, 18);
      rect('#8a5a33', 0, 160, 256, 96); rect('#7a4c2a', 0, 160, 256, 8);
      ell('#e8e1d2', 128, 176, 86, 20); ell('#c9c1b0', 128, 182, 70, 12);
      const F = [['#e0413a', 92, 150, 22], ['#f0a020', 132, 146, 24], ['#7fbf3f', 168, 154, 20], ['#e0413a', 112, 128, 18], ['#b06fd8', 150, 124, 16], ['#f0d040', 76, 166, 14]];
      for (const [c, a, b, rad] of F) { circ(c, a, b, rad); circ('rgba(255,255,255,0.35)', a - rad * 0.35, b - rad * 0.35, rad * 0.3); }
      rect('#4a7a2a', 130, 118, 3, 10); ell('#4fbf6a', 138, 120, 7, 3, -0.4);
      break;
    }
    case 'artSea': { // 波と舟
      for (let i = 0; i < 5; i++) rect(i % 2 ? '#ffd9a8' : '#ffc78a', 0, i * 20, 256, 20);
      circ('#ff8a5c', 128, 100, 30);
      for (let j = 0; j < 8; j++) { const y = 100 + j * 20; x.fillStyle = j % 2 ? p(0) : p(1); x.beginPath(); x.moveTo(0, y * u); for (let i = 0; i <= 16; i++) x.quadraticCurveTo((i * 16 - 8) * u, (y - 10) * u, i * 16 * u, y * u); x.lineTo(S, S); x.lineTo(0, S); x.closePath(); x.fill(); }
      poly('#8a5a33', [[100, 128], [160, 128], [150, 140], [110, 140]]); rect('#55606b', 128, 86, 3, 42); poly('#f4f4f4', [[131, 88], [131, 124], [156, 124]]);
      break;
    }
    case 'artFlower': { // 花びん
      rect(p(0), 0, 0, 256, 256); for (let i = 0; i < 8; i++) rect(shade(p(0), i % 2 ? 0.94 : 1.04), i * 32, 0, 32, 190);
      rect('#b08a5a', 0, 190, 256, 66);
      poly(p(1), [[100, 140], [156, 140], [168, 200], [150, 230], [106, 230], [88, 200]]);
      for (let i = 0; i < 9; i++) { const a = 70 + r() * 116, b = 40 + r() * 80, c = p(2 + i); x.strokeStyle = '#3f7a2a'; x.lineWidth = 3 * u; x.beginPath(); x.moveTo(128 * u, 145 * u); x.lineTo(a * u, b * u); x.stroke(); for (let k = 0; k < 6; k++) circ(c, a + Math.cos(k * 1.05) * 10, b + Math.sin(k * 1.05) * 10, 8); circ('#ffd940', a, b, 6); }
      break;
    }
    case 'artNight': { // うずまく星空
      rect('#1b2a5a', 0, 0, 256, 256);
      for (let k = 0; k < 7; k++) { const a = r() * 256, b = r() * 150, R = 12 + r() * 26; x.strokeStyle = k % 2 ? '#7fa8e8' : '#4f7fe0'; x.lineWidth = 6 * u; x.beginPath(); for (let t = 0; t < 14; t += 0.2) x.lineTo((a + Math.cos(t) * R * t / 14) * u, (b + Math.sin(t) * R * t / 14) * u); x.stroke(); }
      for (let i = 0; i < 12; i++) { const a = r() * 256, b = r() * 160; circ('#f0d040', a, b, 7); circ('#fff4c2', a, b, 3); }
      circ('#ffe28a', 210, 40, 18); circ('#1b2a5a', 218, 34, 15);
      hill('#1b2440', 200, 16, 0.4, 2); hill(p(0), 228, 10, 0.6, 4);
      poly('#14181f', [[40, 256], [52, 90], [64, 256]]); poly('#14181f', [[60, 256], [70, 130], [80, 256]]);
      break;
    }
    case 'artDots': { // ポップな水玉と帯
      rect(p(0), 0, 0, 256, 256);
      for (let i = 0; i < 4; i++) rect(p(1 + i), 0, i * 64 + 22, 256, 20);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) circ(p(2 + ((i + j) % 4)), 21 + i * 43, 21 + j * 43, 8 + ((i * 3 + j) % 3) * 4);
      break;
    }
    case 'artAbs': { // ぬりたくった抽象画
      rect(p(0), 0, 0, 256, 256);
      for (let i = 0; i < 9; i++) ell(p(1 + i), r() * 256, r() * 256, 20 + r() * 60, 12 + r() * 40, r() * 3);
      for (let i = 0; i < 6; i++) { x.strokeStyle = p(i + 3); x.lineWidth = (6 + r() * 10) * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(r() * S, r() * S); x.bezierCurveTo(r() * S, r() * S, r() * S, r() * S, r() * S, r() * S); x.stroke(); }
      break;
    }
    case 'artField': { // 大きな色の面（体に塗りやすい）
      const n = 3 + Math.floor(r() * 2); let y = 0;
      for (let i = 0; i < n; i++) { const h = i === n - 1 ? 256 - y : 40 + r() * 70; rect(p(i), 0, y, 256, h); y += h; }
      rect(p(n), 30, 40, 196, 60); rect(shade(p(n), 0.8), 30, 140, 196, 70);
      break;
    }
    case 'artCat': { // ねこの絵
      rect(p(0), 0, 0, 256, 256); rect(shade(p(0), 0.88), 0, 190, 256, 66);
      const c = p(1); ell(c, 128, 170, 62, 50); circ(c, 128, 100, 44);
      poly(c, [[92, 80], [96, 40], [122, 66]]); poly(c, [[164, 80], [160, 40], [134, 66]]);
      x.strokeStyle = c; x.lineWidth = 14 * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(186 * u, 200 * u); x.quadraticCurveTo(236 * u, 190 * u, 220 * u, 130 * u); x.stroke();
      ell('#f0d040', 112, 98, 8, 10); ell('#f0d040', 144, 98, 8, 10); ell('#1b1d20', 112, 98, 3, 9); ell('#1b1d20', 144, 98, 3, 9);
      poly('#e0719a', [[122, 114], [134, 114], [128, 121]]);
      break;
    }
  }
  brush(160, 0.05);
}
const shade = (c, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
