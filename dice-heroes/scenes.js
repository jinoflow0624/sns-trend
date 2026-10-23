// 도트 배경 장면 — 타이틀 화면.
// 낮은 해상도(가로 약 160~200px)로 그린 뒤 정수 배율로 키워 진짜 도트처럼 보이게 한다.

const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };

// 작은 도트 주사위 (9×9)
function pixelDie(g, x, y, v, squash = 1) {
  const w = Math.max(1, Math.round(9 * squash));
  const ox = Math.round(x + (9 - w) / 2);
  g.fillStyle = '#1A1030'; g.fillRect(ox - 1, y - 1, w + 2, 11);
  g.fillStyle = '#FFF8EC'; g.fillRect(ox, y, w, 9);
  g.fillStyle = '#D9CCE8'; g.fillRect(ox, y + 8, w, 1);
  if (squash < 0.6) return;
  g.fillStyle = v === 1 ? '#E8435A' : '#2A1E48';
  for (const [px, py] of PIPS[v]) g.fillRect(ox + Math.round((1 + px * 3) * squash), y + 1 + py * 3, 2, 2);
}

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

class PixelStage {
  constructor(canvas, draw) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.draw = draw;
    this.t0 = performance.now();
    this.alive = true;
    this.fit();
    this.onResize = () => this.fit();
    addEventListener('resize', this.onResize);
    const loop = () => {
      if (!this.alive) return;
      this.g.imageSmoothingEnabled = false;
      this.draw(this.g, this.w, this.h, (performance.now() - this.t0) / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  fit() {
    const r = this.canvas.getBoundingClientRect();
    const cw = Math.max(200, r.width || innerWidth), ch = Math.max(200, r.height || innerHeight);
    this.scale = Math.max(2, Math.floor(cw / 125));
    this.w = Math.ceil(cw / this.scale);
    this.h = Math.ceil(ch / this.scale);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }
  stop() { this.alive = false; removeEventListener('resize', this.onResize); }
}

// ── 공용 배경 조각 ───────────────────────────────────────────────────────────
function sky(g, w, h, top = '#0B0826', mid = '#2B1D6B', low = '#6A3A8C') {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top); grad.addColorStop(0.6, mid); grad.addColorStop(1, low);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
}
function stars(g, w, h, t, seed = 7) {
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * w), y = Math.floor(r() * h * 0.6), p = r() * 6;
    const tw = Math.sin(t * 2 + p) > 0.3;
    g.fillStyle = tw ? '#FFFFFF' : '#8C7FD9';
    g.fillRect(x, y, 1, 1);
    if (tw && r() > 0.85) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
}
function moon(g, x, y) {
  g.fillStyle = '#FFF3C4';
  for (let dy = -7; dy <= 7; dy++) {
    const half = Math.floor(Math.sqrt(49 - dy * dy));
    g.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
  g.fillStyle = '#E8D59A';
  g.fillRect(x - 3, y - 2, 2, 2); g.fillRect(x + 2, y + 2, 3, 2);
}
function ridge(g, w, base, amp, step, color, seed, drift = 0) {
  const r = rng(seed);
  const hs = [];
  for (let i = 0; i < 64; i++) hs.push(r());
  g.fillStyle = color;
  const off = Math.floor(drift);
  for (let x = 0; x < w; x += step) {
    const k = Math.floor((x + off) / step);
    const a = hs[((k % 64) + 64) % 64], b = hs[(((k + 1) % 64) + 64) % 64];
    const top = Math.round(base - amp * (a * 0.6 + b * 0.4));
    g.fillRect(x, top, step, 400);
  }
}
// 깃발 (펄럭임): 깃대 꼭대기 (px, py) 에서 오른쪽으로
function flag(g, px, py, color, t, len = 6, poleH = 7) {
  g.fillStyle = '#150F33'; g.fillRect(px, py, 1, poleH);
  g.fillStyle = '#FFE27A'; g.fillRect(px, py - 1, 1, 1);           // 깃대 끝 금빛
  for (let i = 0; i < len; i++) {
    const wv = i < 2 ? 0 : Math.sin(t * 5 - i * 0.8) > 0.3 ? 1 : 0;   // 깃대 쪽은 고정, 끝으로 갈수록 살짝 펄럭
    const h = i >= len - 1 ? 2 : 3;
    g.fillStyle = color; g.fillRect(px + 1 + i, py + wv, 1, h);
    if (i === 0) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(px + 1, py + wv, 1, 3); }
  }
}
// 이스터 에그 깃발 색: 왼쪽 노랑 (마신 릴리스 어려움) · 가운데 빨강 (원정 하드모드) · 오른쪽 파랑 (원정 첫 클리어)
const FLAG = { left: '#FFC83D', mid: '#E8435A', right: '#4FB3FF' };

function castle(g, x, y, c = '#150F33', win = '#FFC83D', mk = {}, t = 0) {
  g.fillStyle = c;
  g.fillRect(x, y - 18, 34, 18);
  g.fillRect(x + 4, y - 30, 8, 12); g.fillRect(x + 22, y - 30, 8, 12);
  g.fillRect(x + 13, y - 38, 8, 20);
  for (let i = 0; i < 4; i++) { g.fillRect(x + 4 + i * 2 + (i > 1 ? 0 : 0), y - 32, 1, 2); }
  g.fillRect(x + 12, y - 41, 10, 3);
  g.fillStyle = win;
  g.fillRect(x + 7, y - 25, 2, 3); g.fillRect(x + 25, y - 25, 2, 3); g.fillRect(x + 16, y - 32, 2, 3);
  g.fillStyle = '#0A0720'; g.fillRect(x + 14, y - 8, 6, 8);
  // 깃발 (조건을 이루면 올라간다)
  if (mk.left) flag(g, x + 7, y - 37, FLAG.left, t);
  if (mk.mid) flag(g, x + 16, y - 48, FLAG.mid, t + 1);
  if (mk.right) flag(g, x + 25, y - 37, FLAG.right, t + 2);
}
// 뾰족 지붕 (삼각형) — 가운데 cx, 밑변 y, 폭 w, 높이 h
function cone(g, cx, y, w, h) {
  for (let i = 0; i < h; i++) {
    const half = Math.max(0, Math.round((w / 2) * (1 - i / h)));
    g.fillRect(cx - half, y - i - 1, half * 2 + 1, 1);
  }
}
// 톱니 성벽 꼭대기
function merlons(g, x, y, w, step = 4) { for (let i = 0; i < w; i += step) g.fillRect(x + i, y - 2, 2, 2); }
// 하드모드 10 클리어: 두 배 크고 화려한 성 (실루엣) · 폭 70
function grandCastle(g, x, y, c, win, mk, t) {
  const lit = (wx, wy, k) => { g.fillStyle = Math.sin(t * 3 + k * 1.7) > -0.85 ? win : '#FF9A1F'; g.fillRect(wx, wy, 2, 3); };
  g.fillStyle = c;
  // 바깥 작은 탑
  g.fillRect(x - 2, y - 34, 10, 34); cone(g, x + 3, y - 34, 10, 9);
  g.fillRect(x + 62, y - 34, 10, 34); cone(g, x + 67, y - 34, 10, 9);
  // 성벽
  g.fillRect(x, y - 22, 70, 22); merlons(g, x, y - 22, 70);
  // 큰 탑 둘
  g.fillRect(x + 10, y - 54, 13, 54); cone(g, x + 16, y - 54, 15, 13); merlons(g, x + 10, y - 54, 13, 3);
  g.fillRect(x + 47, y - 54, 13, 54); cone(g, x + 53, y - 54, 15, 13); merlons(g, x + 47, y - 54, 13, 3);
  // 본성 · 가운데 첨탑
  g.fillRect(x + 23, y - 64, 24, 64); merlons(g, x + 23, y - 64, 24);
  g.fillRect(x + 29, y - 78, 12, 14); cone(g, x + 35, y - 78, 16, 16);
  g.fillRect(x + 34, y - 102, 1, 8);
  // 날개 다리 (공중 회랑)
  g.fillRect(x + 22, y - 44, 26, 3);
  // 금빛 장식: 지붕 끝 · 첨탑 고리
  g.fillStyle = '#FFE27A';
  g.fillRect(x + 3, y - 44, 1, 1); g.fillRect(x + 67, y - 44, 1, 1);
  g.fillRect(x + 16, y - 68, 1, 1); g.fillRect(x + 53, y - 68, 1, 1);
  g.fillRect(x + 33, y - 80, 5, 1);
  // 창문 (줄지어 깜빡임)
  let k = 0;
  for (const wy of [y - 46, y - 36, y - 26]) { lit(x + 15, wy, k++); lit(x + 52, wy, k++); }
  for (const wy of [y - 56, y - 48]) for (const wx of [x + 27, x + 34, x + 41]) lit(wx, wy, k++);
  lit(x + 34, y - 72, k++);
  lit(x + 2, y - 26, k++); lit(x + 66, y - 26, k++);
  for (const wx of [x + 25, x + 43]) lit(wx, y - 16, k++);
  // 성문 (아치)
  g.fillStyle = '#0A0720'; g.fillRect(x + 30, y - 12, 10, 12); g.fillRect(x + 31, y - 14, 8, 2); g.fillRect(x + 33, y - 15, 4, 1);
  g.fillStyle = '#FFC83D'; g.fillRect(x + 34, y - 10, 2, 1);
  // 깃발
  if (mk.left) flag(g, x + 16, y - 75, FLAG.left, t, 8, 8);
  if (mk.mid) flag(g, x + 34, y - 110, FLAG.mid, t + 1, 9, 8);
  if (mk.right) flag(g, x + 53, y - 75, FLAG.right, t + 2, 8, 8);
  // 반짝이 (첨탑 둘레)
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + i * 1.05, kk = (Math.sin(t * 2.3 + i * 2) + 1) / 2;
    if (kk < 0.5) continue;
    const sx = Math.round(x + 35 + Math.cos(a) * 34), sy = Math.round(y - 70 + Math.sin(a) * 22);
    g.fillStyle = kk > 0.85 ? '#FFFFFF' : '#FFE27A';
    g.fillRect(sx, sy, 1, 1); if (kk > 0.8) { g.fillRect(sx - 1, sy, 3, 1); g.fillRect(sx, sy - 1, 1, 3); }
  }
}
function ground(g, w, h, y) {
  g.fillStyle = '#1C3B2E'; g.fillRect(0, y, w, h - y);
  g.fillStyle = '#2E6B4A'; g.fillRect(0, y, w, 2);
  const r = rng(3);
  g.fillStyle = '#255740';
  for (let i = 0; i < 40; i++) g.fillRect(Math.floor(r() * w), y + 3 + Math.floor(r() * (h - y)), 2, 1);
}

// ── 타이틀 ───────────────────────────────────────────────────────────────────
// 타이틀 전용 꾸밈 — 도트 느낌은 그대로, 빛과 깊이만 더한다.
// 달 둘레의 은은한 번짐 (겹겹의 반투명 원)
function moonHalo(g, x, y, t) {
  const pulse = 0.85 + 0.15 * Math.sin(t * 1.2);
  for (const [r, a] of [[26, .035], [20, .05], [15, .07], [11, .1]]) {
    g.fillStyle = `rgba(255, 236, 170, ${(a * pulse).toFixed(3)})`;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      g.fillRect(x - half, y + dy, half * 2 + 1, 1);
    }
  }
}
// 금색 · 푸른 반짝이 별 (십자 모양, 천천히 깜빡임)
function sparkStars(g, w, h, t) {
  const r = rng(21);
  for (let i = 0; i < 9; i++) {
    const x = 6 + Math.floor(r() * (w - 12)), y = 4 + Math.floor(r() * h * 0.42), p = r() * 6.28;
    const k = (Math.sin(t * 1.4 + p) + 1) / 2;
    if (k < 0.35) continue;
    g.fillStyle = i % 3 === 0 ? '#FFE9A8' : '#BFD2FF';
    g.fillRect(x, y, 1, 1);
    if (k > 0.7) { g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
    else { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
}
// 가끔 지나가는 별똥별
function shootingStar(g, w, h, t) {
  const T = 9, c = (t % T) / T;
  if (c > 0.13) return;
  const k = c / 0.13, n = Math.floor(t / T);
  const x0 = 20 + ((n * 53) % Math.max(20, w - 60)), y0 = 6 + ((n * 17) % 22);
  const x = x0 + k * 46, y = y0 + k * 22;
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(255, 244, 205, ${(1 - i / 10) * (1 - k * 0.5)})`;
    g.fillRect(Math.round(x - i * 2), Math.round(y - i), 2, 1);
  }
  g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(x), Math.round(y), 2, 2);
}
// 지평선 쪽 보랏빛 안개 띠
function mist(g, w, y, t) {
  for (let i = 0; i < 5; i++) {
    const a = 0.05 + i * 0.012;
    g.fillStyle = `rgba(190, 150, 255, ${a.toFixed(3)})`;
    const off = Math.floor(Math.sin(t * 0.25 + i) * 6);
    g.fillRect(off - 8, y - 14 + i * 3, w + 16, 3);
  }
}
// 성 뒤의 따뜻한 빛, 창문 깜빡임
function castleGlow(g, x, y, t) {
  const f = 0.9 + 0.1 * Math.sin(t * 2.1);
  for (const [r, a] of [[30, .025], [22, .035], [14, .05]]) {
    g.fillStyle = `rgba(255, 190, 80, ${(a * f).toFixed(3)})`;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy) * 1.1);
      g.fillRect(x - half, y + dy, half * 2 + 1, 1);
    }
  }
}
// 떠오르는 금빛 먼지
function motes(g, w, h, t) {
  const r = rng(99);
  for (let i = 0; i < 26; i++) {
    const bx = r() * w, sp = 0.012 + r() * 0.02, ph = r() * 6.28, sz = r() > 0.8 ? 2 : 1;
    const cyc = (t * sp + r()) % 1;
    const x = Math.floor(bx + Math.sin(t * 0.8 + ph) * 4), y = Math.floor(h * 0.86 - cyc * h * 0.7);
    const a = Math.sin(cyc * Math.PI) * (0.5 + 0.5 * Math.sin(t * 3 + ph)) * 0.9;
    if (a < 0.1) continue;
    g.fillStyle = `rgba(255, 214, 110, ${a.toFixed(2)})`;
    g.fillRect(x, y, sz, sz);
  }
}
// 가장자리를 어둡게 눌러 시선을 가운데로
function vignette(g, w, h) {
  const grad = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  grad.addColorStop(0, 'rgba(6, 4, 26, 0)'); grad.addColorStop(1, 'rgba(6, 4, 26, .62)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
}

// marks(): { left, mid, right, grand } — 타이틀 성의 이스터 에그 (app.js castleMarks)
export function titleScene(canvas, marks = () => ({})) {
  return new PixelStage(canvas, (g, w, h, t) => {
    sky(g, w, h, '#070520', '#241761', '#6A3A8C');
    stars(g, w, h, t);
    sparkStars(g, w, h, t);
    const mx = Math.floor(w * 0.8), my = Math.floor(h * 0.4);
    moonHalo(g, mx, my, t);
    moon(g, mx, my);
    shootingStar(g, w, h, t);
    const gy = Math.floor(h * 0.78);
    ridge(g, w, gy - 18, 34, 6, '#35246E', 11, t * 2);
    const mk = marks() || {};
    if (mk.grand) {
      const cx = Math.max(3, Math.min(Math.floor(w * 0.5) - 25, w - 76));
      castleGlow(g, cx + 35, gy - 50, t); castleGlow(g, cx + 35, gy - 28, t + 1);
      grandCastle(g, cx, gy - 12, '#150F33', '#FFC83D', mk, t);
    } else {
      castleGlow(g, Math.floor(w * 0.62) + 17, gy - 30, t);
      castle(g, Math.floor(w * 0.62), gy - 12, '#150F33', Math.sin(t * 7) > -0.92 ? '#FFC83D' : '#FF9A1F', mk, t);
    }
    ridge(g, w, gy - 4, 18, 4, '#24184F', 5, t * 5);
    mist(g, w, gy, t);
    ground(g, w, h, gy);
    // 하늘에서 천천히 내려오는 운명의 주사위 (금빛 꼬리)
    for (let i = 0; i < 4; i++) {
      const cyc = (t * 0.26 + i * 0.25) % 1;
      const x = Math.floor(((i * 41 + 13) % 100) / 100 * (w - 12)) + 2;
      const y = Math.floor(-12 + cyc * (gy * 0.7));
      const v = 1 + (Math.floor(t * 5 + i * 2) % 6);
      for (let k = 1; k <= 4; k++) {
        g.fillStyle = `rgba(255, 200, 61, ${(0.42 - k * 0.09).toFixed(2)})`;
        g.fillRect(x + 4, y - 3 - k * 3, 1, 2);
      }
      pixelDie(g, x, y, v, Math.abs(Math.cos(t * 3 + i)));
    }
    motes(g, w, h, t);
    vignette(g, w, h);
  });
}

// 스플래시 뒤 짧은 로고용
export { pixelDie };
