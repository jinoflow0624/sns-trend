// 캐릭터 · NPC · 동물 · 몬스터 도트.
// 캐릭터 한 칸 = 16×24, 발끝이 맨 아래. 방향 4개 × 걷기 4프레임 + 도구 휘두르기 2프레임.

import { makeCanvas, pen, outline, shade, flipX, cached } from './base.js';

export const CW = 16;
export const CH = 24;
export const DIRS = ['down', 'left', 'right', 'up'];

const SKIN_SHADE = s => shade(s, -0.18);

function drawHair(P, look, dir, by) {
  const h = look.hair;
  const hd = shade(h, -0.25);
  const hl = shade(h, 0.2);
  const st = look.hairStyle || 'short';
  if (st === 'bald') {
    if (dir !== 'up') { P.r(4, 6 + by, 1, 3, h); P.r(11, 6 + by, 1, 3, h); }
    else P.r(4, 6 + by, 8, 3, h);
    return;
  }
  if (dir === 'up') {
    P.r(4, 2 + by, 8, 8, h);
    P.r(5, 2 + by, 6, 1, hl);
    if (st === 'long') P.r(4, 10 + by, 8, 3, hd);
    if (st === 'pony') { P.r(7, 10 + by, 2, 4, hd); P.r(7, 9 + by, 2, 1, '#e0605a'); }
  } else if (dir === 'down') {
    P.r(4, 2 + by, 8, 3, h);
    P.r(4, 5 + by, 1, 3, h);
    P.r(11, 5 + by, 1, 3, h);
    P.r(5, 5 + by, 2, 1, h);
    P.r(9, 5 + by, 1, 1, h);
    P.r(5, 2 + by, 5, 1, hl);
    if (st === 'long') { P.r(3, 6 + by, 2, 7, h); P.r(11, 6 + by, 2, 7, h); P.r(3, 12 + by, 2, 1, hd); P.r(11, 12 + by, 2, 1, hd); }
    if (st === 'spiky') { P.p(5, 1 + by, h); P.p(8, 1 + by, h); P.p(10, 1 + by, h); }
  } else {
    // 오른쪽을 보는 옆모습 (왼쪽은 좌우 반전)
    P.r(4, 2 + by, 8, 3, h);
    P.r(4, 5 + by, 4, 3, h);
    P.r(9, 5 + by, 2, 1, h);
    P.r(5, 2 + by, 5, 1, hl);
    if (st === 'long') P.r(3, 6 + by, 4, 7, h);
    if (st === 'pony') { P.r(2, 5 + by, 2, 5, hd); P.p(3, 4 + by, '#e0605a'); }
  }
  if (st === 'bun') {
    P.r(6, 0 + by, 4, 3, h);
    P.r(7, 0 + by, 2, 1, hl);
  }
  if (st === 'cap') {
    const c = look.cap || '#3a6aa0';
    if (dir === 'up') P.r(4, 2 + by, 8, 4, c);
    else {
      P.r(4, 1 + by, 8, 4, c);
      P.r(5, 1 + by, 5, 1, shade(c, 0.25));
      if (dir === 'down') P.r(3, 5 + by, 10, 1, shade(c, -0.25));
      else P.r(9, 5 + by, 4, 1, shade(c, -0.25));
    }
  }
}

function drawHat(P, look, dir, by) {
  if (!look.hat) return;
  const c = look.hat;
  const d = shade(c, -0.25);
  const kind = look.hatKind || '';
  if (kind === 'straw_hat') {
    P.r(2, 4 + by, 12, 1, d);
    P.r(3, 3 + by, 10, 1, c);
    P.r(5, 0 + by, 6, 3, c);
    P.r(5, 2 + by, 6, 1, '#c0504a');
  } else if (kind === 'miner_helmet') {
    P.r(4, 1 + by, 8, 4, c);
    P.r(3, 4 + by, 10, 1, d);
    if (dir !== 'up') { P.r(dir === 'down' ? 7 : 10, 2 + by, 2, 2, '#fffbe0'); }
  } else if (kind === 'beret') {
    P.r(3, 1 + by, 9, 3, c);
    P.r(4, 1 + by, 5, 1, shade(c, 0.25));
    P.p(8, 0 + by, d);
  } else if (kind === 'flower_crown') {
    for (const [x, col] of [[4, '#ff8ac0'], [6, '#ffd23c'], [8, '#ffffff'], [10, '#ff8ac0']]) P.r(x, 2 + by, 2, 2, col);
    P.r(4, 4 + by, 8, 1, '#4cb24a');
  } else {
    P.r(4, 1 + by, 8, 3, c);
    P.r(3, 4 + by, 10, 1, d);
  }
}

// 캐릭터 한 프레임
function drawChar(look, dir, frame, pose) {
  const c = makeCanvas(CW, CH);
  const P = pen(c.getContext('2d'));
  const skin = look.skin;
  const sk2 = SKIN_SHADE(skin);
  const top = look.top;
  const top2 = shade(top, -0.22);
  const bot = look.bottom || '#4a5a8a';
  const bot2 = shade(bot, -0.25);
  const shoe = '#4a3228';
  const walking = pose === 'walk';
  const bob = walking && (frame === 1 || frame === 3) ? 1 : 0;
  const by = bob + (look.small ? 2 : 0);
  const step = walking ? [0, 1, 0, -1][frame] : 0;
  const swing = pose === 'act' ? frame : -1;

  // 다리 · 신발
  if (dir === 'down' || dir === 'up') {
    const l = step > 0 ? -1 : 0;
    const r = step < 0 ? -1 : 0;
    P.r(5, 18 + by + l, 2, 4 - l, bot);
    P.r(9, 18 + by + r, 2, 4 - r, bot);
    P.r(5, 21 + (by ? 0 : 0) + l + 1, 2, 1, shoe);
    P.r(9, 21 + r + 1, 2, 1, shoe);
  } else {
    const a = step;
    P.r(6 + a, 18 + by, 2, 4, bot2);
    P.r(8 - a, 18 + by, 2, 4, bot);
    P.r(6 + a, 22, 3, 1, shoe);
    P.r(8 - a, 22, 3, 1, shoe);
  }
  // 바지 윗부분
  P.r(5, 16 + by, 6, 2, bot);
  P.r(5, 16 + by, 6, 1, bot2);
  // 몸통
  P.r(4, 11 + by, 8, 6, top);
  P.r(dir === 'left' ? 4 : 11, 11 + by, 1, 6, top2);
  P.r(4, 16 + by, 8, 1, top2);
  if (dir === 'down') { P.r(7, 11 + by, 2, 1, sk2); P.p(8, 13 + by, shade(top, 0.25)); }
  // 팔
  const armY = walking ? [0, -1, 0, 1][frame] : 0;
  if (dir === 'down' || dir === 'up') {
    P.r(3, 12 + by + armY, 1, 4, top2);
    P.r(12, 12 + by - armY, 1, 4, top2);
    P.r(3, 16 + by + armY, 1, 1, skin);
    P.r(12, 16 + by - armY, 1, 1, skin);
  } else if (swing < 0) {
    P.r(7 + armY, 12 + by, 2, 4, top2);
    P.r(7 + armY, 16 + by, 2, 1, skin);
  }
  // 목 · 머리
  P.r(7, 10 + by, 2, 1, sk2);
  if (dir === 'down') {
    P.r(4, 3 + by, 8, 7, skin);
    P.r(4, 9 + by, 8, 1, sk2);
    P.r(6, 6 + by, 1, 2, '#2b1e1c');
    P.r(9, 6 + by, 1, 2, '#2b1e1c');
    P.p(6, 6 + by, '#5a4a48');
    P.r(5, 8 + by, 1, 1, '#f4a0a0');
    P.r(10, 8 + by, 1, 1, '#f4a0a0');
    P.r(7, 8 + by, 2, 1, sk2);
  } else if (dir === 'up') {
    P.r(4, 3 + by, 8, 7, skin);
  } else {
    P.r(5, 3 + by, 7, 7, skin);
    P.r(12, 6 + by, 1, 2, skin);
    P.r(9, 6 + by, 1, 2, '#2b1e1c');
    P.p(10, 8 + by, '#f4a0a0');
    P.r(5, 9 + by, 7, 1, sk2);
  }
  if (look.beard && dir !== 'up') {
    if (dir === 'down') { P.r(5, 8 + by, 6, 2, look.hair); P.r(7, 8 + by, 2, 1, sk2); }
    else P.r(8, 8 + by, 4, 2, look.hair);
  }
  drawHair(P, look, dir, by);
  drawHat(P, look, dir, by);
  // 도구 휘두르기: 옆모습에서 팔을 앞으로
  if (swing >= 0 && (dir === 'left' || dir === 'right')) {
    const up = swing === 0;
    P.r(9, (up ? 10 : 13) + by, 3, 2, top2);
    P.r(12, (up ? 10 : 13) + by, 1, 2, skin);
  } else if (swing >= 0) {
    P.r(3, (swing === 0 ? 10 : 13) + by, 1, 4, top2);
    P.r(12, (swing === 0 ? 10 : 13) + by, 1, 4, top2);
  }
  return outline(c);
}

// 모습 → 방향별 프레임 묶음
export function charSheet(look) {
  const key = `ch:${JSON.stringify(look)}`;
  return cached(key, () => {
    const sheet = {};
    for (const dir of ['down', 'right', 'up']) {
      sheet[dir] = {
        walk: [0, 1, 2, 3].map(f => drawChar(look, dir, f, 'walk')),
        act: [0, 1].map(f => drawChar(look, dir, f, 'act')),
      };
    }
    sheet.left = { walk: sheet.right.walk.map(flipX), act: sheet.right.act.map(flipX) };
    return sheet;
  });
}

// ── 동물 · 몬스터 ────────────────────────────────────────────────────────────
function catFrame(frame, color = '#f0a04a') {
  const c = makeCanvas(16, 12);
  const P = pen(c.getContext('2d'));
  const d = shade(color, -0.25);
  const leg = frame % 2;
  P.r(3, 5, 9, 4, color);
  P.r(4, 5, 7, 1, shade(color, 0.2));
  for (let x = 4; x < 11; x += 3) P.r(x, 6, 1, 2, d);
  P.r(3 + leg, 9, 1, 2, d); P.r(6 - leg, 9, 1, 2, d); P.r(9 + leg, 9, 1, 2, d); P.r(11 - leg, 9, 1, 2, d);
  P.r(10, 2, 5, 5, color);
  P.p(10, 1, color); P.p(14, 1, color);
  P.p(12, 4, '#2b1e1c'); P.p(14, 4, '#2b1e1c');
  P.p(13, 5, '#f48aa0');
  P.r(0, 3 - leg, 1, 3, color); P.r(1, 5, 2, 1, color);
  return outline(c);
}
export const catSheet = () => cached('cat', () => {
  const right = [0, 1].map(f => catFrame(f));
  return { right, left: right.map(flipX) };
});

function slimeFrame(f, color) {
  const c = makeCanvas(16, 14);
  const P = pen(c.getContext('2d'));
  const squash = [0, 1, 2, 1][f];
  const w = 6 + squash;
  const h = 5 - squash;
  P.oval(8, 13 - h, w, h, color);
  P.r(8 - w + 1, 12, w * 2 - 1, 1, shade(color, -0.25));
  P.r(5, 13 - h * 2 + 2, 3, 2, shade(color, 0.45));
  P.r(6, 11 - h, 1, 2, '#2b1e1c');
  P.r(10, 11 - h, 1, 2, '#2b1e1c');
  return outline(c);
}
function rabbitFrame(f, color) {
  const c = makeCanvas(16, 14);
  const P = pen(c.getContext('2d'));
  const hop = f === 1 ? -2 : 0;
  P.oval(7, 10 + hop, 5, 3, color);
  P.r(10, 5 + hop, 4, 4, color);
  P.r(11, 1 + hop, 1, 4, color); P.r(13, 1 + hop, 1, 4, color);
  P.p(11, 2 + hop, '#f4a0b0'); P.p(13, 2 + hop, '#f4a0b0');
  P.p(12, 6 + hop, '#2b1e1c');
  P.r(2, 9 + hop, 2, 2, '#ffffff');
  P.r(4, 12, 2, 1, shade(color, -0.2)); P.r(9, 12, 2, 1, shade(color, -0.2));
  return outline(c);
}
function boarFrame(f, color) {
  const c = makeCanvas(20, 15);
  const P = pen(c.getContext('2d'));
  const d = shade(color, -0.3);
  const l = f % 2;
  P.oval(9, 8, 7, 4, color);
  P.r(4, 4, 10, 1, d);
  for (let x = 4; x < 14; x += 2) P.p(x, 3, d);
  P.r(14, 6, 5, 5, color);
  P.r(18, 8, 2, 2, shade(color, 0.3));
  P.p(19, 8, '#2b1e1c');
  P.p(16, 7, '#2b1e1c');
  P.r(17, 11, 1, 2, '#fffbe0');
  P.r(5 + l, 12, 2, 3, d); P.r(9 - l, 12, 2, 3, d); P.r(12 + l, 12, 2, 3, d);
  return outline(c);
}
function batFrame(f, color) {
  const c = makeCanvas(16, 12);
  const P = pen(c.getContext('2d'));
  const up = [0, 1, 2, 1][f];
  P.oval(8, 6, 2, 3, color);
  P.p(7, 2, color); P.p(9, 2, color);
  P.p(7, 5, '#ff4a4a'); P.p(9, 5, '#ff4a4a');
  const wy = 3 + up * 2;
  P.line(6, 6, 1, wy, shade(color, -0.2)); P.line(6, 7, 1, wy + 1, shade(color, -0.2));
  P.line(10, 6, 15, wy, shade(color, -0.2)); P.line(10, 7, 15, wy + 1, shade(color, -0.2));
  P.r(2, wy + 1, 4, 1, color); P.r(11, wy + 1, 4, 1, color);
  return outline(c);
}
function golemFrame(f) {
  const c = makeCanvas(32, 32);
  const P = pen(c.getContext('2d'));
  const st = '#8a8a7a';
  const dk = '#5a5a4e';
  const moss = '#5aa04a';
  const s = f % 2;
  P.r(7, 10 + s, 18, 16, st);
  P.r(9, 4 + s, 14, 8, st);
  P.r(9, 4 + s, 14, 2, moss);
  P.r(7, 10 + s, 18, 2, moss);
  P.r(12, 7 + s, 2, 2, '#46d6c8'); P.r(18, 7 + s, 2, 2, '#46d6c8');
  P.r(2, 12 + s * 2, 5, 12, dk); P.r(25, 12 - s * 2 + 2, 5, 12, dk);
  P.r(10, 26, 5, 6, dk); P.r(17, 26, 5, 6, dk);
  P.r(13, 16 + s, 6, 5, '#46d6c8');
  P.r(14, 17 + s, 4, 3, '#b8fff6');
  for (const [x, y] of [[9, 20], [21, 14], [11, 13]]) P.r(x, y + s, 2, 1, dk);
  return outline(c);
}

export function monsterSheet(kind, color) {
  return cached(`mon:${kind}`, () => {
    let frames;
    switch (kind) {
      case 'slime': frames = [0, 1, 2, 3].map(f => slimeFrame(f, color)); break;
      case 'rabbit': frames = [0, 1].map(f => rabbitFrame(f, color)); break;
      case 'boar': frames = [0, 1].map(f => boarFrame(f, color)); break;
      case 'bat': frames = [0, 1, 2, 3].map(f => batFrame(f, color)); break;
      case 'golem': frames = [0, 1].map(golemFrame); break;
      case 'skeleton': {
        const look = { skin: '#efe8d8', hair: '#efe8d8', hairStyle: 'bald', top: '#cfc6b4', bottom: '#b8ae9a' };
        const s = charSheet(look);
        return { right: s.right.walk, left: s.left.walk, down: s.down.walk, up: s.up.walk, char: true };
      }
      default: frames = [slimeFrame(0, color)];
    }
    return { right: frames, left: frames.map(flipX) };
  });
}
