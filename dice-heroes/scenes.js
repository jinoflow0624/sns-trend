// 도트 배경 장면 — 타이틀 화면과 스토리 인트로.
// 낮은 해상도(가로 약 160~200px)로 그린 뒤 정수 배율로 키워 진짜 도트처럼 보이게 한다.
import { drawSprite } from './pixel.js';

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
const HEROES = ['warrior', 'rogue', 'mage', 'bard', 'gambler'];

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
    // 영웅들이 언덕 위에서 들썩인다
    const n = HEROES.length, gap = Math.min(30, Math.floor((w - 20) / n));
    const x0 = Math.floor((w - gap * (n - 1) - 16) / 2);
    HEROES.forEach((id, i) => {
      const bob = Math.floor(Math.abs(Math.sin(t * 4 + i * 1.3)) * 2);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(x0 + i * gap + 3, gy + 1, 10, 2);
      drawSprite(g, id, x0 + i * gap, gy - 15 - bob, 1);
    });
  });
}

// ── 스토리 인트로 ────────────────────────────────────────────────────────────
export const STORY = [
  { scene: 'sky',    text: '천 년에 한 번,\n하늘에서 운명의 주사위 다섯 개가 떨어진다.' },
  { scene: 'board',  text: '주사위를 굴리는 자는 의뢰를 해결하고,\n운명을 비트는 힘을 얻어 점점 더 강해진다.' },
  { scene: 'heroes', text: '전사, 도적, 마법사, 음유시인, 도박사.\n다섯 영웅이 그 주사위를 노린다.' },
  { scene: 'fairy',  text: '그리고 나는 길잡이 요정 루루!\n열두 번의 굴림 안에 전설이 되는 법을 알려 줄게.' },
];

export function storyScene(canvas, getPanel) {
  return new PixelStage(canvas, (g, w, h, t) => {
    const p = STORY[getPanel()]?.scene || 'sky';
    const gy = Math.floor(h * 0.62);
    if (p === 'sky') {
      sky(g, w, h, '#05031A', '#1A1150', '#3B2476');
      stars(g, w, h, t, 21);
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(w * (0.2 + i * 0.15)), y = Math.floor(((t * 20 + i * 18) % (gy + 20)) - 20);
        g.fillStyle = 'rgba(255, 220, 120, .45)';
        g.fillRect(x + 4, y - 14, 1, 12);
        pixelDie(g, x, y, 1 + ((i + Math.floor(t * 5)) % 6), Math.abs(Math.cos(t * 2 + i)));
      }
      ridge(g, w, gy + 10, 24, 5, '#1B1242', 9);
    } else if (p === 'board') {
      sky(g, w, h, '#1E2A5E', '#6A4C9C', '#E08A6A');
      ridge(g, w, gy, 20, 6, '#3A2A6A', 4);
      ground(g, w, h, gy);
      // 의뢰 게시판
      const bx = Math.floor(w / 2) - 30, by = gy - 44;
      g.fillStyle = '#4A2A14'; g.fillRect(bx + 4, by + 30, 4, 16); g.fillRect(bx + 52, by + 30, 4, 16);
      g.fillStyle = '#1A1030'; g.fillRect(bx - 1, by - 1, 62, 34);
      g.fillStyle = '#8A5A2A'; g.fillRect(bx, by, 60, 32);
      g.fillStyle = '#B07A3E'; g.fillRect(bx, by, 60, 3);
      [[6, 7], [24, 5], [42, 8]].forEach(([dx, dy], i) => {
        const sway = Math.round(Math.sin(t * 2 + i));
        g.fillStyle = '#F5E3B8'; g.fillRect(bx + dx, by + dy + sway, 13, 17);
        g.fillStyle = '#C79B5A'; for (let k = 0; k < 4; k++) g.fillRect(bx + dx + 2, by + dy + 4 + k * 3 + sway, 9, 1);
        g.fillStyle = '#E8435A'; g.fillRect(bx + dx + 5, by + dy - 1 + sway, 3, 2);
      });
      drawSprite(g, 'warrior', bx - 22, gy - 16, 1);
      drawSprite(g, 'mage', bx + 66, gy - 16, 1, true);
    } else if (p === 'heroes') {
      sky(g, w, h, '#150B3A', '#5B2A7A', '#E0664A');
      ridge(g, w, gy, 26, 6, '#40205E', 12, t * 4);
      ground(g, w, h, gy);
      const n = HEROES.length, gap = Math.min(30, Math.floor((w - 16) / n));
      const x0 = Math.floor((w - gap * (n - 1) - 32) / 2);
      HEROES.forEach((id, i) => {
        const jump = Math.max(0, Math.sin(t * 5 - i * 0.7)) * 6;
        drawSprite(g, id, x0 + i * gap, gy - 32 - Math.floor(jump), 2);
      });
    } else {
      sky(g, w, h, '#0E1A4A', '#2A4C9C', '#7AC4E0');
      stars(g, w, h * 0.5, t, 33);
      ground(g, w, h, gy);
      const fy = gy - 60 + Math.floor(Math.sin(t * 3) * 4);
      g.fillStyle = 'rgba(156, 242, 255, .25)';
      g.fillRect(Math.floor(w / 2) - 24, fy - 4, 48, 56);
      drawSprite(g, 'fairy', Math.floor(w / 2) - 24, fy, 3);
      const r = rng(Math.floor(t * 8));
      g.fillStyle = '#FFF3A0';
      for (let i = 0; i < 8; i++) g.fillRect(Math.floor(w / 2 - 30 + r() * 60), Math.floor(fy + r() * 50), 1, 1);
    }
  });
}

// 스플래시 뒤 짧은 로고용
export { pixelDie };
