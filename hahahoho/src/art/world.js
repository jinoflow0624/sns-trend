// 지형 · 물건 · 건물 · 작물 · 가구 도트.
import { makeCanvas, pen, outline, shade, cached, mix } from './base.js';
import { T } from '../world/maps.js';
import { hash2 } from '../logic/rng.js';
import { itemIcon } from './items.js';
import { CROPS, ITEMS } from '../data.js';

export const TS = 16;

const PAL = {
  grass: ['#7ec04e', '#8fd05c', '#6aab40', '#5f9c3a'],
  dark: ['#4f9444', '#5ca650', '#43823a', '#3a7433'],
  path: ['#d9b77f', '#e6c792', '#c79f66', '#b8905a'],
  plaza: ['#cfc6b5', '#dcd4c4', '#b3a998', '#9e9483'],
  sand: ['#eed79c', '#f6e4b2', '#dcc285', '#cfb277'],
  water: ['#4aa6e0', '#62b8ec', '#3a8ecf', '#2f7cbc'],
  soil: ['#b98c58', '#c69a64', '#a47a48', '#94693c'],
  floor: ['#c99a66', '#d6a975', '#b3864f', '#9e7443'],
  cave: ['#5f5550', '#6b605a', '#514844', '#463e3a'],
  ruin: ['#7d8c8a', '#8b9a98', '#6b7a78', '#5d6b69'],
};

// 같은 계열끼리는 경계를 그리지 않는다
const FAMILY = {
  [T.GRASS]: 'g', [T.FLOWER]: 'g', [T.DARK]: 'g', [T.PATH]: 'p', [T.PLAZA]: 'z', [T.SAND]: 's', [T.WATER]: 'w',
  [T.BRIDGE]: 'b', [T.CLIFF]: 'c', [T.SOIL]: 'o', [T.FLOOR]: 'f', [T.WALL]: 'x', [T.CAVE]: 'v', [T.CAVEWALL]: 'V',
  [T.RUIN]: 'r', [T.RUINWALL]: 'R', [T.VOID]: 'n',
};

function speckle(P, x0, y0, pal, seed, n = 7) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(x0 + i, y0, seed) * 16);
    const y = Math.floor(hash2(x0, y0 + i, seed + 1) * 16);
    P.p(x0 * 16 + x, y0 * 16 + y, pal[1 + (i % 3)]);
  }
}

function tileBase(P, t, x, y, m) {
  const X = x * 16;
  const Y = y * 16;
  switch (t) {
    case T.GRASS: case T.FLOWER: case T.DARK: {
      const pal = t === T.DARK ? PAL.dark : PAL.grass;
      P.r(X, Y, 16, 16, pal[0]);
      speckle(P, x, y, pal, 3, 8);
      if (hash2(x, y, 9) < 0.35) { // 풀포기
        const gx = X + 3 + Math.floor(hash2(x, y, 10) * 9);
        const gy = Y + 4 + Math.floor(hash2(x, y, 11) * 9);
        P.p(gx, gy, pal[3]); P.p(gx + 2, gy, pal[3]); P.p(gx + 1, gy - 1, pal[3]);
        P.p(gx + 1, gy, pal[1]);
      }
      break;
    }
    case T.PATH: P.r(X, Y, 16, 16, PAL.path[0]); speckle(P, x, y, PAL.path, 5, 6); break;
    case T.SAND: P.r(X, Y, 16, 16, PAL.sand[0]); speckle(P, x, y, PAL.sand, 6, 6); break;
    case T.PLAZA: {
      P.r(X, Y, 16, 16, PAL.plaza[0]);
      const off = y % 2 ? 4 : 0;
      P.r(X, Y + 7, 16, 1, PAL.plaza[2]); P.r(X, Y + 15, 16, 1, PAL.plaza[2]);
      P.r(X + ((off + 0) % 16), Y, 1, 7, PAL.plaza[2]); P.r(X + ((off + 8) % 16), Y + 8, 1, 7, PAL.plaza[2]);
      P.r(X + 1, Y + 1, 5, 1, PAL.plaza[1]);
      break;
    }
    case T.WATER: {
      P.r(X, Y, 16, 16, PAL.water[0]);
      if (hash2(x, y, 7) < 0.5) P.r(X + 3, Y + 9, 5, 1, PAL.water[2]);
      break;
    }
    case T.BRIDGE: {
      P.r(X, Y, 16, 16, '#b07a4a');
      for (let i = 0; i < 16; i += 4) P.r(X + i, Y, 1, 16, '#8a5a32');
      P.r(X, Y + 3, 16, 1, '#c89060');
      const up = m.get(x, y - 1) !== T.BRIDGE;
      const dn = m.get(x, y + 1) !== T.BRIDGE;
      if (up) P.r(X, Y, 16, 2, '#6a4222');
      if (dn) { P.r(X, Y + 14, 16, 2, '#6a4222'); P.r(X + 2, Y + 16 - 1, 2, 1, '#6a4222'); }
      break;
    }
    case T.CLIFF: {
      P.r(X, Y, 16, 16, '#8f7e6c');
      for (let i = 0; i < 16; i += 5) P.r(X, Y + i + (x % 2), 16, 1, '#76675a');
      P.r(X + 3 + (y % 3) * 3, Y + 2, 1, 12, '#76675a');
      if (m.get(x, y + 1) !== T.CLIFF) P.r(X, Y + 14, 16, 2, '#5f5347');
      if (m.get(x, y - 1) !== T.CLIFF) { P.r(X, Y, 16, 3, PAL.grass[0]); P.r(X, Y + 3, 16, 1, PAL.grass[3]); }
      break;
    }
    case T.SOIL: P.r(X, Y, 16, 16, PAL.soil[0]); speckle(P, x, y, PAL.soil, 8, 5); break;
    case T.FLOOR: {
      P.r(X, Y, 16, 16, PAL.floor[0]);
      P.r(X, Y + 7, 16, 1, PAL.floor[3]); P.r(X, Y + 15, 16, 1, PAL.floor[3]);
      P.r(X + ((y % 2) ? 5 : 11), Y, 1, 7, PAL.floor[2]); P.r(X + ((y % 2) ? 12 : 3), Y + 8, 1, 7, PAL.floor[2]);
      P.r(X + 1, Y + 1, 6, 1, PAL.floor[1]);
      break;
    }
    case T.WALL: {
      const top = m.get(x, y + 1) !== T.WALL;
      P.r(X, Y, 16, 16, '#efdcb4');
      for (let i = 2; i < 16; i += 6) P.r(X + i, Y, 2, 16, '#e6cfa0');
      if (top) { P.r(X, Y + 12, 16, 4, '#9e7443'); P.r(X, Y + 12, 16, 1, '#c99a66'); }
      if (y === 0 || m.get(x, y - 1) !== T.WALL) P.r(X, Y, 16, 3, '#6a4a2e');
      if (x === 0 || x === m.w - 1 || y === m.h - 1) { P.r(X, Y, 16, 16, '#6a4a2e'); P.r(X + 1, Y + 1, 14, 14, '#7e5a3a'); }
      break;
    }
    case T.CAVE: P.r(X, Y, 16, 16, PAL.cave[0]); speckle(P, x, y, PAL.cave, 12, 7); break;
    case T.CAVEWALL: {
      P.r(X, Y, 16, 16, '#3b3230');
      if (m.get(x, y + 1) !== T.CAVEWALL) { P.r(X, Y + 8, 16, 8, '#57493f'); P.r(X, Y + 8, 16, 1, '#6d5c4f'); P.r(X + 4, Y + 11, 3, 2, '#4a3e35'); }
      else if (hash2(x, y, 13) < 0.3) P.r(X + 5, Y + 5, 3, 2, '#463b37');
      break;
    }
    case T.RUIN: {
      P.r(X, Y, 16, 16, PAL.ruin[0]);
      P.r(X, Y, 16, 1, PAL.ruin[2]); P.r(X, Y, 1, 16, PAL.ruin[2]);
      P.r(X + 1, Y + 1, 7, 7, PAL.ruin[1]); P.r(X + 8, Y + 8, 7, 7, PAL.ruin[3]);
      if (hash2(x, y, 14) < 0.2) { P.p(X + 10, Y + 4, '#5aa04a'); P.p(X + 11, Y + 4, '#5aa04a'); }
      break;
    }
    case T.RUINWALL: {
      P.r(X, Y, 16, 16, '#3f4b4a');
      if (m.get(x, y + 1) !== T.RUINWALL) {
        P.r(X, Y + 4, 16, 12, '#5a6867');
        for (let j = 4; j < 16; j += 4) P.r(X, Y + j, 16, 1, '#4a5756');
        P.r(X + ((y + j2(x)) % 2 ? 4 : 10), Y + 4, 1, 12, '#4a5756');
      }
      break;
    }
    default: P.r(X, Y, 16, 16, '#0d0b0b');
  }
}
const j2 = x => x % 3;

// 다른 지형과 맞닿은 가장자리를 부드럽게
function edges(P, m, x, y) {
  const t = m.get(x, y);
  const f = FAMILY[t];
  const X = x * 16;
  const Y = y * 16;
  const nb = (dx, dy) => m.get(x + dx, y + dy);
  if (f === 'w') {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const n = nb(dx, dy);
      if (FAMILY[n] === 'w' || FAMILY[n] === 'b' || n === T.VOID) continue;
      const foam = '#cdeeff';
      const sh = '#2f7cbc';
      if (dy === -1) { P.r(X, Y, 16, 2, sh); P.r(X, Y + 2, 16, 1, foam); }
      if (dy === 1) { P.r(X, Y + 15, 16, 1, foam); }
      if (dx === -1) { P.r(X, Y, 1, 16, foam); }
      if (dx === 1) { P.r(X + 15, Y, 1, 16, foam); }
    }
    // 볼록한 모서리는 둥글게 (양옆이 모두 땅이면 모서리를 땅 색으로 깎는다)
    const landCol = n => (n === T.SAND ? PAL.sand[0] : n === T.DARK ? PAL.dark[0] : n === T.PATH ? PAL.path[0] : PAL.grass[0]);
    const isLand = n => FAMILY[n] !== 'w' && FAMILY[n] !== 'b' && n !== T.VOID;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = nb(dx, 0); const ny = nb(0, dy);
      if (!isLand(nx) || !isLand(ny)) continue;
      const col = landCol(ny);
      const cx = dx < 0 ? X : X + 15;
      const cy = dy < 0 ? Y : Y + 15;
      // 모서리에서부터 줄마다 깎는 길이 (반지름 6px 정도의 둥근 모서리)
      const cut = [6, 4, 3, 2, 1, 1];
      cut.forEach((len, row) => {
        const yy = dy < 0 ? cy + row : cy - row;
        for (let i = 0; i < len; i++) P.p(cx + (dx < 0 ? i : -i), yy, col);
        P.p(cx + (dx < 0 ? len : -len), yy, '#cdeeff');
      });
    }
    return;
  }
  if (f === 'p' || f === 's' || f === 'o' || f === 'z') {
    const pal = f === 'p' ? PAL.path : f === 's' ? PAL.sand : f === 'o' ? PAL.soil : PAL.plaza;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const n = nb(dx, dy);
      if (FAMILY[n] !== 'g') continue;
      const g = n === T.DARK ? PAL.dark : PAL.grass;
      for (let i = 0; i < 16; i++) {
        const d = hash2(x * 16 + i, y * 16 + dx + dy * 3, 21) < 0.5 ? 1 : 2;
        if (dy === -1) P.r(X + i, Y, 1, d, g[0]);
        if (dy === 1) P.r(X + i, Y + 16 - d, 1, d, g[0]);
        if (dx === -1) P.r(X, Y + i, d, 1, g[0]);
        if (dx === 1) P.r(X + 16 - d, Y + i, d, 1, g[0]);
      }
      if (dy === -1) P.r(X, Y + 2, 16, 1, pal[3]);
    }
  }
}

// 맵의 바닥 전체를 한 장으로 미리 그린다 (매 프레임 다시 그리지 않도록)
export function groundCanvas(m) {
  return cached(`ground:${m.id}:${m.key}`, () => {
    const c = makeCanvas(m.w * 16, m.h * 16);
    const P = pen(c.getContext('2d'));
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) tileBase(P, m.get(x, y), x, y, m);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) edges(P, m, x, y);
    return c;
  });
}

// 물결 반짝임 (매 프레임, 보이는 물 칸만)
export function drawWaterFx(ctx, m, x0, y0, x1, y1, t) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (m.get(x, y) !== T.WATER) continue;
    const ph = (t / 900 + hash2(x, y, 31) * 6.28);
    const s = Math.sin(ph);
    if (s > 0.55) {
      const ox = Math.floor(hash2(x, y, 32) * 10) + 2;
      const oy = Math.floor(hash2(x, y, 33) * 10) + 3;
      ctx.fillRect(x * 16 + ox, y * 16 + oy, s > 0.85 ? 4 : 2, 1);
    }
  }
}

// ── 물건 ─────────────────────────────────────────────────────────────────────
// 모든 물건 그림은 { c: 캔버스, ox, oy } — (타일 x*16 + ox, y*16 + oy) 에 그린다

function tree(kind, variant, sway) {
  return cached(`tree:${kind}:${variant}:${sway}`, () => {
    const c = makeCanvas(24, 36);
    const P = pen(c.getContext('2d'));
    const dark = kind === 'dark';
    const pine = dark ? variant % 3 !== 0 : variant % 5 === 0;
    const trunk = '#7a5230';
    P.r(10, 24, 4, 11, trunk);
    P.r(10, 24, 1, 11, '#94683e');
    P.r(8, 34, 8, 1, '#5a3a20');
    const s = sway;
    if (pine) {
      const g = dark ? ['#2f6e3a', '#3c8a46', '#245a2f'] : ['#3c8a46', '#4ea457', '#2f6e3a'];
      for (let i = 0; i < 4; i++) {
        const w = 4 + i * 2.5;
        const y = 3 + i * 6;
        P.oval(12 + (i < 2 ? s : 0), y + 3, w, 3, g[i % 2 === 0 ? 0 : 2]);
        P.oval(11 + (i < 2 ? s : 0), y + 2, w - 2, 2, g[1]);
      }
    } else {
      const g = dark ? ['#3f8a3c', '#56a54c', '#2f6e33'] : variant % 4 === 1 ? ['#6aa83e', '#86c44e', '#4f8a32'] : ['#4e9a3e', '#69b84d', '#3a7a30'];
      P.oval(12 + s, 14, 10, 9, g[2]);
      P.oval(12 + s, 12, 9, 8, g[0]);
      P.oval(10 + s, 9, 5, 4, g[1]);
      P.oval(16 + s, 13, 3, 3, g[1]);
      if (variant % 4 === 2) for (const [x, y] of [[8, 14], [15, 8], [17, 17]]) P.r(x + s, y, 2, 2, '#e04a3a');
    }
    return { c: outline(c), ox: -4, oy: -20 };
  });
}

const stump = () => cached('stump', () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  P.r(4, 8, 8, 6, '#7a5230'); P.oval(8, 8, 4, 2, '#d6b27a'); P.p(8, 8, '#a57a4a');
  return { c: outline(c), ox: 0, oy: 0 };
});

function bush(v) {
  return cached(`bush:${v}`, () => {
    const c = makeCanvas(16, 16);
    const P = pen(c.getContext('2d'));
    P.oval(8, 10, 7, 5, '#3f8a3c'); P.oval(7, 8, 5, 4, '#56a54c'); P.p(5, 7, '#7ec860');
    if (v) for (const [x, y] of [[5, 10], [10, 8], [11, 12]]) P.r(x, y, 2, 2, '#8a3cc8');
    return { c: outline(c), ox: 0, oy: -1 };
  });
}

const ORE_COL = { stone: null, coal: '#2c2c34', copper_ore: '#e08a4a', iron_ore: '#e0e6ee', gold_ore: '#ffd23c', gem: '#b565f0', ruby: '#ff2d55' };
function rock(ore, cave) {
  return cached(`rock:${ore}:${cave}`, () => {
    const c = makeCanvas(16, 16);
    const P = pen(c.getContext('2d'));
    const base = cave ? '#8a7f78' : '#a3a3a8';
    P.oval(8, 10, 7, 5, shade(base, -0.2)); P.oval(8, 9, 6, 4, base); P.r(4, 6, 5, 2, shade(base, 0.25));
    const oc = ORE_COL[ore];
    if (oc) for (const [x, y] of [[5, 9], [10, 7], [9, 11]]) { P.r(x, y, 2, 2, oc); P.p(x, y, shade(oc, 0.4)); }
    return { c: outline(c), ox: 0, oy: 0 };
  });
}
const boulder = () => cached('boulder', () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  P.oval(8, 9, 7, 6, '#7d7d84'); P.oval(7, 8, 6, 5, '#95959c'); P.r(4, 4, 4, 2, '#b3b3b9'); P.p(11, 11, '#65656b');
  return { c: outline(c), ox: 0, oy: -2 };
});

function flower(v, sway) {
  return cached(`fl:${v}:${sway}`, () => {
    const c = makeCanvas(16, 16);
    const P = pen(c.getContext('2d'));
    const cols = ['#ffffff', '#ffd23c', '#ff8ac0', '#8ab8ff', '#ff6a5a'];
    const n = 2 + (v % 3);
    for (let i = 0; i < n; i++) {
      const x = 3 + ((v * 7 + i * 5) % 10);
      const y = 6 + ((v * 3 + i * 4) % 7);
      const col = cols[(v + i) % cols.length];
      P.r(x, y + 1, 1, 3, '#4f8a32');
      const sx = x + (i % 2 ? sway : 0);
      P.p(sx - 1, y, col); P.p(sx + 1, y, col); P.p(sx, y - 1, col); P.p(sx, y + 1, col); P.p(sx, y, '#ffb13c');
    }
    return { c, ox: 0, oy: 0 };
  });
}

function fence(n, s, e, w) {
  return cached(`fence:${n}${s}${e}${w}`, () => {
    const c = makeCanvas(16, 20);
    const P = pen(c.getContext('2d'));
    const wd = '#b07a4a';
    const dk = '#7a5230';
    P.r(6, 4, 4, 14, wd); P.r(6, 4, 4, 1, '#d09a64'); P.r(9, 5, 1, 13, dk);
    if (e) { P.r(10, 8, 6, 2, wd); P.r(10, 13, 6, 2, wd); }
    if (w) { P.r(0, 8, 6, 2, wd); P.r(0, 13, 6, 2, wd); }
    if (s) P.r(7, 18, 2, 2, wd);
    if (n) P.r(7, 0, 2, 4, wd);
    return { c: outline(c), ox: 0, oy: -4 };
  });
}

function waypoint(kind, lit, frame) {
  return cached(`wp:${kind}:${lit}:${frame}`, () => {
    const glow = lit ? ['#7ae8ff', '#b8f6ff', '#4ac8f0'][frame % 3] : '#7a7a86';
    if (kind === 'lift') {
      const c = makeCanvas(16, 24);
      const P = pen(c.getContext('2d'));
      P.r(1, 14, 14, 8, '#6a5a4a'); P.r(1, 14, 14, 2, '#8a7a6a'); P.r(2, 2, 2, 12, '#8a7a6a'); P.r(12, 2, 2, 12, '#8a7a6a');
      P.r(2, 2, 12, 2, '#8a7a6a'); P.r(6, 17, 4, 2, glow);
      return { c: outline(c), ox: 0, oy: -8 };
    }
    if (kind === 'rune') {
      const c = makeCanvas(16, 16);
      const P = pen(c.getContext('2d'));
      P.oval(8, 8, 7, 5, '#3f4b4a'); P.oval(8, 8, 5, 3, glow); P.oval(8, 8, 3, 1, '#ffffff');
      return { c, ox: 0, oy: 0 };
    }
    // 순간이동 석상: 돌기둥 가운데에 소용돌이 문이 돌고, 발밑에 빛나는 원
    const c = makeCanvas(16, 32);
    const P = pen(c.getContext('2d'));
    P.oval(8, 29, 7, 2, lit ? '#4ac8f0' : '#6a6a74');
    P.r(2, 26, 12, 4, '#7d7d84'); P.r(2, 26, 12, 1, '#a3a3a8');
    P.r(3, 3, 10, 23, '#9a9aa4'); P.r(3, 3, 2, 23, '#b3b3bd'); P.r(11, 3, 2, 23, '#7d7d86');
    P.r(4, 0, 8, 3, '#9a9aa4'); P.r(5, 0, 6, 1, '#b3b3bd');
    // 소용돌이 문
    P.oval(8, 13, 4, 6, lit ? '#3a2a6a' : '#55555e');
    P.oval(8, 13, 3, 5, lit ? '#6a4ae0' : '#6a6a74');
    P.oval(8, 13, 2, 3, glow);
    if (lit) {
      const ring = [[8, 8], [11, 11], [11, 15], [8, 18], [5, 15], [5, 11]];
      for (let i = 0; i < 2; i++) { const [x, y] = ring[(frame + i * 3) % ring.length]; P.p(x, y, '#ffffff'); }
      P.p(8, 13, '#ffffff');
    }
    // 위쪽 화살표 문양 (여기서 다른 곳으로 떠난다는 표시)
    P.r(7, 22, 2, 3, lit ? '#ffd23c' : '#6a6a74'); P.r(6, 22, 4, 1, lit ? '#ffd23c' : '#6a6a74');
    return { c: outline(c), ox: 0, oy: -16 };
  });
}

function lamp(on) {
  return cached(`lamp:${on}`, () => {
    const c = makeCanvas(16, 32);
    const P = pen(c.getContext('2d'));
    P.r(7, 8, 2, 22, '#3a3a44'); P.r(5, 29, 6, 2, '#3a3a44');
    P.r(4, 2, 8, 7, '#3a3a44'); P.r(5, 3, 6, 5, on ? '#ffe89a' : '#c8c0a0'); P.r(3, 1, 10, 1, '#3a3a44');
    return { c: outline(c), ox: 0, oy: -16 };
  });
}

function sign() {
  return cached('sign', () => {
    const c = makeCanvas(16, 16);
    const P = pen(c.getContext('2d'));
    P.r(7, 8, 2, 8, '#7a5230'); P.r(1, 2, 14, 7, '#c89060'); P.r(1, 2, 14, 1, '#e0b07a');
    P.r(3, 4, 8, 1, '#7a5230'); P.r(3, 6, 6, 1, '#7a5230');
    return { c: outline(c), ox: 0, oy: -2 };
  });
}
function board() {
  return cached('board', () => {
    const c = makeCanvas(16, 24);
    const P = pen(c.getContext('2d'));
    P.r(2, 12, 2, 12, '#7a5230'); P.r(12, 12, 2, 12, '#7a5230');
    P.r(0, 1, 16, 13, '#9a6a3c'); P.r(1, 2, 14, 11, '#c89060');
    P.r(2, 3, 5, 5, '#fffbe8'); P.r(8, 4, 5, 6, '#fff0f0'); P.r(3, 9, 4, 3, '#f0fff0');
    P.p(4, 3, '#e04a3a'); P.p(10, 4, '#3a7ae0');
    return { c: outline(c), ox: 0, oy: -8 };
  });
}

function fountain(frame) {
  return cached(`fountain:${frame}`, () => {
    const c = makeCanvas(64, 56);
    const P = pen(c.getContext('2d'));
    P.oval(32, 38, 30, 14, '#9e9483'); P.oval(32, 36, 28, 12, '#cfc6b5'); P.oval(32, 37, 24, 9, '#4aa6e0');
    P.oval(32, 35, 20, 6, '#62b8ec');
    P.r(28, 14, 8, 22, '#cfc6b5'); P.r(28, 14, 2, 22, '#e0d8c8'); P.oval(32, 14, 9, 3, '#b3a998'); P.oval(32, 13, 7, 2, '#4aa6e0');
    const f = frame % 4;
    for (let i = 0; i < 4; i++) {
      const dx = [-10, -5, 5, 10][i];
      const h = 3 + ((f + i) % 4);
      P.r(32 + dx, 18 + h * 2, 1, 2, '#e8f8ff');
      P.r(32 + dx * 0.6, 12 - h, 1, 2, '#e8f8ff');
    }
    P.r(31, 4 + f, 2, 8 - f, '#cdeeff');
    return { c: outline(c), ox: 0, oy: -8 };
  });
}

function chest(kind) {
  return cached(`chest:${kind}`, () => {
    const c = makeCanvas(16, 16);
    const P = pen(c.getContext('2d'));
    const wd = kind === 'shipbox' ? '#a57a4a' : '#9a5a2e';
    const trim = kind === 'treasure' ? '#ffd23c' : '#6a4a2e';
    P.r(1, 5, 14, 10, wd); P.r(1, 5, 14, 4, shade(wd, 0.15)); P.r(1, 9, 14, 1, trim);
    P.r(1, 5, 1, 10, trim); P.r(14, 5, 1, 10, trim); P.r(7, 8, 2, 3, kind === 'treasure' ? '#fff3a0' : '#d8c07a');
    if (kind === 'shipbox') { P.r(3, 11, 10, 1, shade(wd, -0.2)); P.r(3, 13, 10, 1, shade(wd, -0.2)); }
    return { c: outline(c), ox: 0, oy: -1 };
  });
}

function station(kind, frame) {
  return cached(`st:${kind}:${frame}`, () => {
    const c = makeCanvas(16, 24);
    const P = pen(c.getContext('2d'));
    if (kind === 'stove') {
      P.r(1, 6, 14, 17, '#b0503a'); for (let y = 8; y < 22; y += 3) P.r(1, y, 14, 1, '#8a3a2a');
      P.r(1, 4, 14, 3, '#6a6a74'); P.r(4, 14, 8, 7, '#2b1e1c');
      const fl = ['#ffd23c', '#ff8a3c', '#ffb13c'][frame % 3];
      P.r(5, 17 - (frame % 2), 6, 4 + (frame % 2), '#ff6a2c'); P.r(6, 18, 4, 3, fl);
      P.r(10, 0, 3, 4, '#6a6a74');
      P.r(3, 2, 6, 2, '#3a3a44');
    } else if (kind === 'sewing') {
      P.r(0, 12, 16, 3, '#9a6a3c'); P.r(1, 15, 2, 9, '#7a5230'); P.r(13, 15, 2, 9, '#7a5230');
      P.r(3, 5, 10, 3, '#f4efe4'); P.r(10, 5, 3, 7, '#f4efe4'); P.r(3, 8, 2, 4, '#f4efe4'); P.r(3, 5, 10, 1, '#ffffff');
      P.r(4, 10, 1, 2, '#6a6a74'); P.r(7, 3, 2, 2, '#e04a8a');
    } else {
      P.r(0, 10, 16, 4, '#b07a4a'); P.r(0, 10, 16, 1, '#d09a64'); P.r(1, 14, 2, 10, '#7a5230'); P.r(13, 14, 2, 10, '#7a5230');
      P.r(3, 7, 6, 2, '#a3a3a8'); P.r(8, 6, 1, 4, '#7a5230'); P.r(11, 6, 3, 4, '#6a6a74'); P.r(12, 9, 1, 2, '#7a5230');
    }
    return { c: outline(c), ox: 0, oy: -8 };
  });
}

const bed = () => cached('bed', () => {
  const c = makeCanvas(32, 32);
  const P = pen(c.getContext('2d'));
  P.r(1, 1, 30, 30, '#8a5a32'); P.r(3, 3, 26, 26, '#f4efe4');
  P.r(5, 4, 22, 7, '#ffffff'); P.r(5, 10, 22, 1, '#d8d0c0');
  P.r(3, 13, 26, 16, '#e0605a'); P.r(3, 13, 26, 2, '#f08a80');
  for (let x = 6; x < 28; x += 6) P.r(x, 17, 2, 2, '#ffd23c');
  return { c: outline(c), ox: 0, oy: 0 };
});

const ladder = up => cached(`ladder:${up}`, () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  if (!up) { P.oval(8, 9, 7, 6, '#1a1412'); P.oval(8, 8, 6, 5, '#0d0b0b'); }
  P.r(4, 0, 2, 16, '#a57a4a'); P.r(10, 0, 2, 16, '#a57a4a');
  for (let y = 2; y < 16; y += 4) P.r(4, y, 8, 1, '#c89060');
  return { c: up ? outline(c) : c, ox: 0, oy: 0 };
});

const crystal = frame => cached(`crys:${frame}`, () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  const g = ['#b98aff', '#d6b8ff', '#9a6ae0'][frame % 3];
  P.r(4, 6, 3, 9, '#7a4ac0'); P.r(8, 3, 3, 12, g); P.r(11, 8, 2, 7, '#7a4ac0'); P.p(9, 4, '#ffffff');
  return { c: outline(c), ox: 0, oy: 0 };
});
const pillar = () => cached('pillar', () => {
  const c = makeCanvas(16, 32);
  const P = pen(c.getContext('2d'));
  P.r(3, 4, 10, 26, '#8b9a98'); P.r(3, 4, 3, 26, '#a3b2b0'); P.r(11, 4, 2, 26, '#6b7a78');
  P.r(1, 1, 14, 4, '#7d8c8a'); P.r(1, 28, 14, 4, '#6b7a78'); P.p(9, 14, '#5aa04a'); P.p(10, 15, '#5aa04a');
  return { c: outline(c), ox: 0, oy: -16 };
});
const anvil = () => cached('anvil', () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  P.r(2, 5, 12, 3, '#5a5a64'); P.r(0, 5, 3, 2, '#5a5a64'); P.r(5, 8, 6, 4, '#4a4a54'); P.r(3, 12, 10, 3, '#5a5a64'); P.r(3, 5, 10, 1, '#8a8a94');
  return { c: outline(c), ox: 0, oy: 0 };
});
const crate = () => cached('crate', () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  P.r(1, 3, 14, 12, '#b07a4a'); P.r(1, 3, 14, 1, '#d09a64'); P.line(2, 4, 13, 13, '#8a5a32'); P.line(13, 4, 2, 13, '#8a5a32');
  return { c: outline(c), ox: 0, oy: -1 };
});
const windowSpr = () => cached('window', () => {
  const c = makeCanvas(32, 16);
  const P = pen(c.getContext('2d'));
  P.r(2, 2, 28, 12, '#7a5230'); P.r(4, 4, 24, 8, '#a8dcff'); P.r(15, 4, 2, 8, '#7a5230'); P.r(5, 5, 6, 2, '#ffffff');
  P.r(1, 13, 30, 2, '#9a6a3c');
  return { c, ox: 0, oy: 0 };
});
const caveMouth = () => cached('cave', () => {
  const c = makeCanvas(64, 48);
  const P = pen(c.getContext('2d'));
  P.oval(32, 30, 31, 20, '#6d5c4f'); P.oval(32, 30, 28, 18, '#8a7a6a');
  P.oval(32, 36, 14, 13, '#1a1412'); P.r(18, 36, 28, 12, '#1a1412');
  P.r(20, 20, 3, 28, '#7a5230'); P.r(41, 20, 3, 28, '#7a5230'); P.r(18, 18, 28, 4, '#7a5230');
  for (const [x, y] of [[10, 24], [50, 22], [30, 12]]) P.r(x, y, 4, 2, '#a89888');
  return { c: outline(c), ox: -8, oy: -16 };
});
const arch = () => cached('arch', () => {
  const c = makeCanvas(32, 40);
  const P = pen(c.getContext('2d'));
  P.r(0, 6, 32, 34, '#6b7a78'); P.r(2, 8, 28, 30, '#8b9a98');
  P.r(7, 16, 18, 24, '#120f10'); P.oval(16, 16, 9, 7, '#120f10');
  P.r(0, 2, 32, 6, '#5d6b69'); P.r(12, 0, 8, 4, '#5d6b69'); P.r(14, 1, 4, 2, '#46d6c8');
  for (const [x, y] of [[3, 12], [26, 20], [4, 30]]) P.r(x, y, 3, 2, '#5aa04a');
  return { c: outline(c), ox: 0, oy: -8 };
});

// ── 건물 ─────────────────────────────────────────────────────────────────────
const BUILD = {
  house: { roof: '#c0504a', wall: '#f0dcb4', icon: null },
  market: { roof: '#4aa05a', wall: '#f4ead4', icon: 'turnip', awning: true },
  tailor: { roof: '#9a5ac0', wall: '#f4e4f0', icon: 'cloth' },
  diner: { roof: '#e08a3a', wall: '#fff0d8', icon: 'veggie_soup' },
  smithy: { roof: '#5a6070', wall: '#b8b0a8', icon: 'iron_ore', stone: true },
  cottage: { roof: '#4a7ac0', wall: '#f4ead4', icon: null },
  cottage2: { roof: '#8a5a32', wall: '#e8dcc4', icon: null },
  fishshop: { roof: '#3a8c9a', wall: '#e4f0f0', icon: 'fish_carp' },
};
export function building(o, night) {
  return cached(`bld:${o.kind}:${o.w}x${o.h}:${night}`, () => {
    const W = o.w * 16;
    const H = o.h * 16 + 10;
    const c = makeCanvas(W, H);
    const P = pen(c.getContext('2d'));
    const b = BUILD[o.kind] || BUILD.house;
    const roofH = Math.round(H * 0.46);
    const wallY = roofH - 2;
    // 벽
    P.r(2, wallY, W - 4, H - wallY, b.wall);
    if (b.stone) for (let y = wallY + 3; y < H; y += 5) for (let x = 2 + ((y / 5) % 2) * 4; x < W - 4; x += 8) P.r(x, y, 7, 1, shade(b.wall, -0.18));
    else for (let x = 6; x < W - 4; x += 8) P.r(x, wallY, 1, H - wallY, shade(b.wall, -0.1));
    P.r(2, H - 3, W - 4, 3, shade(b.wall, -0.3));
    // 지붕
    for (let y = 0; y < roofH; y++) {
      const inset = Math.max(0, Math.round((roofH - y) * 0.35) - 2);
      const col = y % 4 === 3 ? shade(b.roof, -0.2) : b.roof;
      P.r(inset, y, W - inset * 2, 1, col);
    }
    P.r(0, roofH - 2, W, 2, shade(b.roof, -0.35));
    P.r(W - 18, 0, 6, 8, '#8a7a6a');
    // 문
    const doorX = o.door ? (o.door.x - o.x) * 16 + 4 : Math.floor(W / 2) - 4;
    P.r(doorX - 1, H - 17, 10, 17, '#6a4222'); P.r(doorX, H - 16, 8, 16, '#9a6a3c'); P.p(doorX + 6, H - 8, '#ffd23c');
    // 창문
    const win = night ? '#ffe89a' : '#a8dcff';
    for (const wx of [8, W - 20]) {
      if (Math.abs(wx - doorX) < 12) continue;
      P.r(wx - 1, wallY + 6, 12, 10, '#6a4222'); P.r(wx, wallY + 7, 10, 8, win); P.r(wx + 4, wallY + 7, 1, 8, '#6a4222');
      if (!night) P.r(wx + 1, wallY + 8, 2, 2, '#ffffff');
    }
    if (b.awning) {
      for (let x = 2; x < W - 2; x += 6) P.r(x, wallY, 3, 5, '#ffffff'), P.r(x + 3, wallY, 3, 5, '#e05a4a');
      P.r(2, wallY + 5, W - 4, 1, '#a0402a');
    }
    // 간판
    if (b.icon) {
      P.r(W / 2 - 9, wallY - 12, 18, 14, '#7a5230'); P.r(W / 2 - 8, wallY - 11, 16, 12, '#e8c88a');
      c.getContext('2d').drawImage(itemIcon(b.icon), W / 2 - 8, wallY - 12);
    }
    return { c: outline(c), ox: 0, oy: -10 };
  });
}

// ── 작물 ─────────────────────────────────────────────────────────────────────
export function cropSprite(crop, stage) {
  return cached(`crop:${crop}:${stage}`, () => {
    const c = makeCanvas(16, 20);
    const P = pen(c.getContext('2d'));
    const C = CROPS[crop];
    const lf = C.leaf;
    const ld = shade(lf, -0.25);
    const fr = C.color;
    if (stage === 0) { P.p(6, 14, '#6a4a2a'); P.p(9, 13, '#6a4a2a'); P.p(8, 16, '#6a4a2a'); P.r(7, 13, 2, 2, '#8fd05c'); return { c, ox: 0, oy: -4 }; }
    if (crop === 'wheat') {
      const h = [0, 5, 9, 12, 13][stage];
      const col = stage >= 4 ? fr : stage === 3 ? mix(lf, fr, 0.5) : lf;
      for (const x of [4, 7, 10, 12]) { P.r(x, 18 - h, 1, h, col); if (stage >= 3) P.r(x - 1, 18 - h, 3, 3, col); }
    } else if (crop === 'tomato' || crop === 'strawberry' || crop === 'cotton') {
      const h = [0, 4, 7, 10, 11][stage];
      if (crop === 'tomato' && stage >= 2) P.r(8, 18 - h - 3, 1, h + 3, '#a57a4a');
      P.oval(8, 18 - h / 2, 2 + stage, Math.max(1, h / 2), ld);
      P.oval(8, 17 - h / 2, 1 + stage, Math.max(1, h / 2 - 1), lf);
      if (stage >= 4) for (const [x, y] of [[5, 10], [10, 12], [8, 8], [11, 9]]) {
        if (crop === 'cotton') { P.r(x - 1, y - 1, 3, 3, '#ffffff'); P.p(x, y, '#e8e8e8'); } else { P.r(x, y, 2, 2, fr); P.p(x, y, shade(fr, 0.4)); }
      }
    } else if (crop === 'pumpkin') {
      const s = stage;
      P.line(2, 16, 14, 14, ld);
      P.oval(5, 13, 1 + s, 1 + Math.floor(s / 2), lf);
      P.oval(12, 12, s, 1 + Math.floor(s / 2), lf);
      if (s === 3) P.oval(8, 15, 2, 2, mix(lf, fr, 0.4));
      if (s >= 4) { P.oval(8, 14, 6, 4, fr); P.line(5, 11, 5, 17, shade(fr, -0.25)); P.line(8, 10, 8, 18, shade(fr, -0.25)); P.line(11, 11, 11, 17, shade(fr, -0.25)); P.r(7, 8, 2, 3, '#6a5a2a'); }
    } else {
      // 뿌리 작물 (순무·감자·당근)
      const h = [0, 3, 6, 8, 9][stage];
      for (const [dx, lean] of [[-2, -1], [0, 0], [2, 1]]) P.line(8 + dx, 16, 8 + dx + lean * 2, 16 - h, dx ? ld : lf);
      P.oval(8, 16 - h, 2 + Math.floor(stage / 2), 2, lf);
      if (stage >= 4) { P.oval(8, 17, 4, 2, fr); P.p(6, 16, shade(fr, 0.4)); }
    }
    return { c: outline(c), ox: 0, oy: -4 };
  });
}

export function soilOverlay(wet) {
  return cached(`soil:${wet}`, () => {
    const c = makeCanvas(16, 16);
    const P = pen(c.getContext('2d'));
    const base = wet ? '#6e4b2c' : '#94693c';
    P.r(1, 1, 14, 14, base);
    for (let y = 3; y < 15; y += 4) P.r(2, y, 12, 1, shade(base, -0.25));
    P.r(1, 1, 14, 1, shade(base, 0.15));
    return c;
  });
}
export const lockedSoil = () => cached('soil:locked', () => {
  const c = makeCanvas(16, 16);
  const P = pen(c.getContext('2d'));
  P.r(0, 0, 16, 16, '#6aab40');
  for (let i = 0; i < 6; i++) P.p(2 + i * 2, 4 + (i % 3) * 3, '#4f8a32');
  P.r(6, 6, 4, 4, 'rgba(90,60,40,.35)');
  return c;
});

// ── 가구 ─────────────────────────────────────────────────────────────────────
export function furniture(id, frame = 0) {
  const it = ITEMS[id];
  return cached(`fur:${id}:${id === 'f_fireplace' || id === 'f_tank' ? frame % 3 : 0}`, () => {
    const w = (it?.w || 1) * 16;
    const h = (it?.h || 1) * 16;
    const extra = it?.floor ? 0 : 12;
    const c = makeCanvas(w, h + extra);
    const P = pen(c.getContext('2d'));
    const col = it?.sprite.c || '#b07a4a';
    const dk = shade(col, -0.28);
    const lt = shade(col, 0.28);
    const Y = extra;
    switch (id) {
      case 'f_chair': P.r(3, Y - 8, 10, 10, col); P.r(3, Y - 8, 10, 2, lt); P.r(3, Y + 2, 10, 4, lt); P.r(3, Y + 6, 2, 8, dk); P.r(11, Y + 6, 2, 8, dk); break;
      case 'f_table': P.oval(16, Y + 2, 14, 5, col); P.oval(16, Y + 1, 13, 4, lt); P.r(14, Y + 6, 4, 9, dk); P.r(9, Y + 14, 14, 2, dk); P.r(10, Y - 3, 4, 4, '#ffffff'); P.r(11, Y - 4, 2, 2, '#e04a8a'); break;
      case 'f_plant': P.r(4, Y + 6, 8, 9, '#c0604a'); P.r(4, Y + 6, 8, 2, '#d8805a'); P.oval(8, Y + 1, 7, 6, col); P.oval(6, Y - 1, 3, 3, lt); P.oval(11, Y + 2, 3, 2, shade(col, -0.2)); break;
      case 'f_rug': P.r(1, 1, 30, 30, col); P.r(3, 3, 26, 26, lt); P.r(6, 6, 20, 20, col); P.oval(16, 16, 5, 5, '#ffd23c'); for (let x = 2; x < 30; x += 4) { P.p(x, 0, dk); P.p(x, 31, dk); } break;
      case 'f_lamp': P.r(3, Y - 10, 10, 8, col); P.r(3, Y - 10, 10, 2, '#fff4c8'); P.r(7, Y - 2, 2, 14, '#8a6a4a'); P.r(4, Y + 12, 8, 3, '#6a4a3a'); break;
      case 'f_shelf': P.r(1, Y - 10, 30, 25, col); P.r(3, Y - 8, 26, 21, dk); for (let y = Y - 8; y < Y + 12; y += 7) { for (let x = 4; x < 28; x += 3) P.r(x, y, 2, 6, ['#e05a4a', '#4a8ae0', '#ffd23c', '#5ab04a'][(x + y) % 4]); P.r(3, y + 6, 26, 1, col); } break;
      case 'f_sofa': P.r(1, Y - 6, 30, 10, dk); P.r(1, Y + 4, 30, 8, col); P.r(3, Y + 4, 26, 3, lt); P.r(0, Y - 2, 4, 14, dk); P.r(28, Y - 2, 4, 14, dk); P.r(2, Y + 12, 2, 3, '#6a4a3a'); P.r(28, Y + 12, 2, 3, '#6a4a3a'); break;
      case 'f_tank': P.r(1, Y - 6, 14, 12, '#8ad8ff'); P.r(1, Y - 6, 14, 2, '#d8f4ff'); P.r(3 + (frame % 3), Y - 1, 4, 2, '#ff8a3c'); P.r(9, Y + 2 - (frame % 2), 2, 1, '#ffd23c'); P.r(1, Y + 3, 14, 3, '#d8c89a'); P.r(2, Y + 6, 12, 8, '#8a5a32'); break;
      case 'f_bear': P.oval(8, Y + 8, 6, 6, col); P.oval(8, Y - 1, 5, 5, col); P.oval(4, Y - 5, 2, 2, col); P.oval(12, Y - 5, 2, 2, col); P.p(6, Y - 1, '#2b1e1c'); P.p(10, Y - 1, '#2b1e1c'); P.r(7, Y + 1, 3, 2, lt); P.r(6, Y + 7, 4, 4, lt); P.r(6, Y + 3, 5, 1, '#e04a3a'); break;
      case 'f_clock': P.r(3, Y - 12, 10, 27, col); P.r(3, Y - 12, 10, 2, lt); P.oval(8, Y - 5, 4, 4, '#fffbe0'); P.line(8, Y - 5, 8, Y - 8, '#2b1e1c'); P.line(8, Y - 5, 10, Y - 5, '#2b1e1c'); P.r(7, Y + 2, 2, 6 + (frame % 2), '#ffd23c'); break;
      case 'f_fireplace': P.r(0, Y - 10, 32, 26, col); for (let y = Y - 8; y < Y + 15; y += 4) P.r(0, y, 32, 1, dk); P.r(-1, Y - 12, 34, 3, '#6a6a74'); P.r(8, Y + 1, 16, 15, '#1a1412'); P.r(10, Y + 10 - (frame % 2), 12, 6, '#ff6a2c'); P.r(12, Y + 12, 8, 4, ['#ffd23c', '#ffb13c', '#ff8a3c'][frame % 3]); break;
      case 'f_piano': P.r(1, Y - 10, 30, 20, col); P.r(3, Y - 8, 26, 4, '#4a4a54'); P.r(2, Y + 2, 28, 5, '#ffffff'); for (let x = 3; x < 30; x += 3) P.r(x, Y + 2, 1, 3, '#2b1e1c'); P.r(2, Y + 10, 3, 5, col); P.r(27, Y + 10, 3, 5, col); break;
      default: c.getContext('2d').drawImage(itemIcon(id), 0, Y);
    }
    return { c: it?.floor ? c : outline(c), ox: 0, oy: -extra };
  });
}

// ── 물건 그림 고르기 ─────────────────────────────────────────────────────────
// state: { t(시각), night, felled(nid→bool), discovered(wp→bool) }
export function objectSprite(o, m, st) {
  const f3 = Math.floor(st.t / 250) % 3;
  switch (o.t) {
    case 'tree': {
      if (st.felled?.(o)) return stump();
      const v = Math.floor(hash2(o.x, o.y, 5) * 20);
      const sway = Math.sin(st.t / 700 + o.x * 0.7 + o.y) > 0.6 ? 1 : 0;
      return tree(m.id === 'forest' ? 'dark' : 'light', v, sway);
    }
    case 'bush': return bush(!st.felled?.(o) && hash2(o.x, o.y, 8) < 0.25);
    case 'rock': return st.felled?.(o) ? null : rock(o.ore || 'stone', !!m.cave);
    case 'boulder': return st.felled?.(o) ? null : boulder();
    case 'flower': return flower(Math.floor(hash2(o.x, o.y, 2) * 50), Math.sin(st.t / 500 + o.x) > 0.3 ? 1 : 0);
    case 'fence': {
      const has = (dx, dy) => m.objects.some(q => q.t === 'fence' && q.x === o.x + dx && q.y === o.y + dy);
      return fence(has(0, -1), has(0, 1), has(1, 0), has(-1, 0));
    }
    case 'waypoint': return waypoint(o.kind || 'stone', !!st.discovered?.(o.wp), Math.floor(st.t / 160) % 6);
    case 'lamp': return lamp(st.night);
    case 'sign': return sign();
    case 'board': return board();
    case 'fountain': return fountain(Math.floor(st.t / 180) % 4);
    case 'chest': return chest(o.kind);
    case 'station': return station(o.kind, f3);
    case 'bed': return bed();
    case 'ladder': return ladder(!!o.up);
    case 'crystal': return st.felled?.(o) ? null : crystal(f3);
    case 'pillar': return pillar();
    case 'anvil': return anvil();
    case 'crate': return crate();
    case 'window': return windowSpr();
    case 'cave': return caveMouth();
    case 'arch': return arch();
    case 'building': case 'hut': return building(o, st.night);
    case 'forage': return st.forageItem ? { c: itemIcon(st.forageItem(o)), ox: 0, oy: -2 } : null;
    default: return null;
  }
}
