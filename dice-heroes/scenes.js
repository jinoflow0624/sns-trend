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
function castle(g, x, y, c = '#150F33', win = '#FFC83D') {
  g.fillStyle = c;
  g.fillRect(x, y - 18, 34, 18);
  g.fillRect(x + 4, y - 30, 8, 12); g.fillRect(x + 22, y - 30, 8, 12);
  g.fillRect(x + 13, y - 38, 8, 20);
  for (let i = 0; i < 4; i++) { g.fillRect(x + 4 + i * 2 + (i > 1 ? 0 : 0), y - 32, 1, 2); }
  g.fillRect(x + 12, y - 41, 10, 3); g.fillRect(x + 16, y - 46, 1, 5);
  g.fillStyle = '#E8435A'; g.fillRect(x + 17, y - 46, 4, 2);
  g.fillStyle = win;
  g.fillRect(x + 7, y - 25, 2, 3); g.fillRect(x + 25, y - 25, 2, 3); g.fillRect(x + 16, y - 32, 2, 3);
  g.fillStyle = '#0A0720'; g.fillRect(x + 14, y - 8, 6, 8);
}
function ground(g, w, h, y) {
  g.fillStyle = '#1C3B2E'; g.fillRect(0, y, w, h - y);
  g.fillStyle = '#2E6B4A'; g.fillRect(0, y, w, 2);
  const r = rng(3);
  g.fillStyle = '#255740';
  for (let i = 0; i < 40; i++) g.fillRect(Math.floor(r() * w), y + 3 + Math.floor(r() * (h - y)), 2, 1);
}

// ── 타이틀 ───────────────────────────────────────────────────────────────────
export function titleScene(canvas) {
  return new PixelStage(canvas, (g, w, h, t) => {
    sky(g, w, h);
    stars(g, w, h, t);
    moon(g, Math.floor(w * 0.8), Math.floor(h * 0.4));
    const gy = Math.floor(h * 0.78);
    ridge(g, w, gy - 18, 34, 6, '#35246E', 11, t * 2);
    castle(g, Math.floor(w * 0.62), gy - 12);
    ridge(g, w, gy - 4, 18, 4, '#24184F', 5, t * 5);
    ground(g, w, h, gy);
    // 하늘에서 떨어지는 운명의 주사위
    for (let i = 0; i < 5; i++) {
      const cyc = (t * 0.35 + i * 0.2) % 1;
      const x = Math.floor(((i * 37 + 13) % 100) / 100 * (w - 12)) + 2;
      const y = Math.floor(-12 + cyc * (gy * 0.7));
      const v = 1 + (Math.floor(t * 6 + i * 2) % 6);
      pixelDie(g, x, y, v, Math.abs(Math.cos(t * 3 + i)));
      g.fillStyle = 'rgba(255, 200, 61, .5)';
      g.fillRect(x + 4, y - 6, 1, 4);
    }
  });
}

// 스플래시 뒤 짧은 로고용
export { pixelDie };
