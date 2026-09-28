// 맵 정의. 손으로 설계한 지상 맵(농장·마을·호수·숲·광산 입구·집)과
// 씨앗으로 만드는 절차 생성 맵(광산 층·유적 층)이 있다.
// 순수 로직이라 테스트에서도 불러 검증한다.

import { hash2, mulberry32, hashStr, randInt } from '../logic/rng.js';
import { HOUSE_LEVELS } from '../data.js';

export const T = {
  GRASS: 0, FLOWER: 1, PATH: 2, WATER: 3, SAND: 4, BRIDGE: 5, CLIFF: 6, SOIL: 7,
  FLOOR: 8, WALL: 9, CAVE: 10, CAVEWALL: 11, RUIN: 12, RUINWALL: 13, PLAZA: 14, VOID: 15, DARK: 16,
};
export const SOLID_TILES = new Set([T.WATER, T.CLIFF, T.WALL, T.CAVEWALL, T.RUINWALL, T.VOID]);

// 물건 중 길을 막는 것
const SOLID_OBJ = new Set(['pillar', 'tree', 'bush', 'rock', 'building', 'waypoint', 'lamp', 'board', 'fountain', 'station', 'fence', 'bed', 'chest', 'cave', 'arch', 'hut', 'anvil', 'crate', 'boulder']);

class Builder {
  constructor(id, name, w, h, fill, opts = {}) {
    Object.assign(this, { id, name, w, h, ...opts });
    this.tiles = new Uint8Array(w * h).fill(fill);
    this.objects = [];
    this.warps = [];
    this.npcs = [];
    this.spawns = [];
    this.reserved = new Uint8Array(w * h);
    this.nid = 0;
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.tiles[y * this.w + x] : T.VOID; }
  set(x, y, t) { if (this.in(x, y)) this.tiles[y * this.w + x] = t; }
  rect(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, t); }
  reserve(x, y, w = 1, h = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.in(i, j)) this.reserved[j * this.w + i] = 1; }
  free(x, y) { return this.in(x, y) && !this.reserved[y * this.w + x]; }
  obj(o) {
    const w = o.w || 1;
    const h = o.h || 1;
    const obj = { w, h, ...o };
    if (['tree', 'rock', 'bush', 'forage', 'boulder', 'crystal'].includes(o.t) && obj.nid == null) obj.nid = `${o.t[0]}${this.nid++}`;
    this.objects.push(obj);
    this.reserve(o.x, o.y, w, h);
    return obj;
  }
  ellipse(cx, cy, rx, ry, t) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, t);
      }
    }
  }
  // 가장자리를 나무로 두르고, 출구 칸은 비운다
  borderTrees(gaps = []) {
    const isGap = (x, y) => gaps.some(g => x >= g.x && x < g.x + (g.w || 1) && y >= g.y && y < g.y + (g.h || 1));
    for (let x = 0; x < this.w; x++) for (const y of [0, this.h - 1]) if (!isGap(x, y)) this.obj({ t: 'tree', x, y, deco: true });
    for (let y = 1; y < this.h - 1; y++) for (const x of [0, this.w - 1]) if (!isGap(x, y)) this.obj({ t: 'tree', x, y, deco: true });
  }
  scatter(kind, density, seed, pred = () => true, extra = {}) {
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (!this.free(x, y) || !pred(this.get(x, y), x, y)) continue;
        if (hash2(x, y, seed) < density) this.obj({ t: kind, x, y, ...extra });
      }
    }
  }
  warp(x, y, w, h, to, tx, ty, label) { this.warps.push({ x, y, w, h, to, tx, ty, label }); this.reserve(x, y, w, h); }
  done() {
    const m = this;
    m.solid = new Uint8Array(m.w * m.h);
    for (let i = 0; i < m.tiles.length; i++) if (SOLID_TILES.has(m.tiles[i])) m.solid[i] = 1;
    for (const o of m.objects) {
      if (!SOLID_OBJ.has(o.t)) continue;
      const fh = o.foot ?? o.h;
      for (let j = o.y + o.h - fh; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) {
        if (o.door && i === o.door.x && j === o.door.y) continue;
        if (o.doors?.some(([dx, dy]) => dx === i && dy === j)) continue; // 동굴 입구처럼 지나갈 수 있는 칸
        if (m.in(i, j)) m.solid[j * m.w + i] = 1;
      }
    }
    // 자원 칸 → 물건 (베어 낸 뒤 지나갈 수 있게 할 때 쓴다)
    m.nodeGrid = new Array(m.w * m.h);
    for (const o of m.objects) if (o.nid && !o.deco) m.nodeGrid[o.y * m.w + o.x] = o;
    delete m.reserved;
    return m;
  }
}

const grassy = t => t === T.GRASS || t === T.DARK;

// ── 농장 ─────────────────────────────────────────────────────────────────────
export const FARM_SOIL = { x: 19, y: 3, w: 12, h: 6 }; // 72칸, 집 레벨에 따라 열린다
export const HOUSE_DOOR = { x: 7, y: 8 };

function buildFarm() {
  const b = new Builder('farm', '하하호호 농장', 34, 26, T.GRASS, { outdoor: true, fishTable: 'pond', music: 'farm' });
  b.borderTrees([{ x: 16, y: 0, w: 2 }, { x: 33, y: 12, h: 2 }, { x: 16, y: 25, w: 2 }]);
  b.rect(16, 0, 2, 26, T.PATH);
  b.rect(7, 12, 27, 2, T.PATH);
  b.rect(7, 9, 1, 3, T.PATH);
  b.reserve(15, 0, 4, 26);
  b.reserve(6, 11, 28, 4);
  b.warp(16, 0, 2, 1, 'mine_gate', 11.5, 13.5, '광산 입구');
  b.warp(33, 12, 1, 2, 'town', 1.5, 13, '마을');
  b.warp(16, 25, 2, 1, 'forest', 17.5, 1.5, '숲');

  b.obj({ t: 'building', kind: 'house', x: 4, y: 4, w: 7, h: 5, foot: 3, door: HOUSE_DOOR, name: '우리 집' });
  b.warp(HOUSE_DOOR.x, HOUSE_DOOR.y, 1, 1, 'house', 0, 0, '집 안');
  b.reserve(3, 3, 9, 7);
  b.obj({ t: 'station', kind: 'bench', x: 12, y: 7, name: '목공 작업대' });
  b.obj({ t: 'chest', kind: 'shipbox', x: 12, y: 5, name: '가판대' });
  b.reserve(11, 4, 3, 5);

  const s = FARM_SOIL;
  b.rect(s.x, s.y, s.w, s.h, T.SOIL);
  for (let x = s.x - 1; x <= s.x + s.w; x++) b.obj({ t: 'fence', x, y: s.y - 1 });
  for (let y = s.y; y < s.y + s.h; y++) { b.obj({ t: 'fence', x: s.x - 1, y }); b.obj({ t: 'fence', x: s.x + s.w, y }); }
  b.reserve(s.x - 1, s.y - 1, s.w + 2, s.h + 3);

  b.ellipse(6, 18.5, 3.6, 2.8, T.WATER);
  b.ellipse(8.5, 17.5, 2.2, 1.6, T.WATER); // 한쪽으로 늘어진 연못 모양
  b.reserve(1, 14, 11, 9);
  b.obj({ t: 'waypoint', x: 13, y: 15, wp: 'farm', name: '농장 석상' });
  b.reserve(12, 14, 3, 3);
  b.obj({ t: 'sign', x: 18, y: 14, text: '오른쪽은 마을, 위는 광산, 아래는 숲' });
  b.npcs.push({ id: 'duri', x: 20.5, y: 15.4, shop: 'regrow' });
  b.reserve(19, 14, 4, 3);
  b.npcs.push({ id: 'dog', pet: 'dog', route: [[8, 12.4], [25, 12.4], [25, 13.5], [8, 13.5]], speed: 1.6 });

  b.scatter('tree', 0.12, 11, grassy);
  b.scatter('rock', 0.05, 12, grassy);
  b.scatter('bush', 0.04, 13, grassy);
  b.scatter('flower', 0.10, 14, grassy);
  return b.done();
}

// ── 집 안 (집 레벨에 따라 크기가 바뀐다) ─────────────────────────────────────
export function buildHouse(level = 1) {
  const lv = Math.max(1, Math.min(5, level));
  const [rw, rh] = HOUSE_LEVELS[lv].room;
  const W = rw + 2;
  const H = rh + 3;
  const b = new Builder('house', `우리 집 · ${(HOUSE_LEVELS[level] || HOUSE_LEVELS[lv]).name}`, W, H, T.FLOOR, { indoor: true, level: lv });
  b.rect(0, 0, W, 3, T.WALL);
  b.rect(0, 0, 1, H, T.WALL);
  b.rect(W - 1, 0, 1, H, T.WALL);
  b.rect(0, H - 1, W, 1, T.WALL);
  const door = { x: Math.floor(W / 2), y: H - 1 };
  b.set(door.x, door.y, T.FLOOR);
  b.warp(door.x, door.y, 1, 1, 'farm', HOUSE_DOOR.x + 0.5, HOUSE_DOOR.y + 1.6, '밖으로');
  b.door = door;
  b.obj({ t: 'bed', x: 1, y: 3, w: 2, h: 2, name: '침대' });
  b.obj({ t: 'chest', kind: 'chest', x: 3, y: 3, name: '공용 보관함' });
  if (lv >= 2) b.obj({ t: 'station', kind: 'stove', x: W - 3, y: 3, name: '화덕' });
  if (lv >= 3) {
    b.obj({ t: 'station', kind: 'sewing', x: W - 4, y: 3, name: '재봉틀' });
    b.obj({ t: 'station', kind: 'bench', x: W - 5, y: 3, name: '작업대' });
  }
  b.obj({ t: 'window', x: 5, y: 1, w: 2, h: 1 });
  if (W > 10) b.obj({ t: 'window', x: W - 7, y: 1, w: 2, h: 1 });
  b.reserve(door.x - 1, H - 3, 3, 3);
  // 가구를 놓을 수 있는 영역
  b.decor = { x: 1, y: 3, w: W - 2, h: H - 4 };
  return b.done();
}

// ── 마을 ─────────────────────────────────────────────────────────────────────
function buildTown() {
  const b = new Builder('town', '하하호호 마을', 36, 26, T.GRASS, { outdoor: true, music: 'town' });
  b.borderTrees([{ x: 0, y: 12, h: 2 }, { x: 35, y: 12, h: 2 }]);
  b.rect(0, 12, 36, 2, T.PATH);
  b.warp(0, 12, 1, 2, 'farm', 32, 13, '농장');
  b.warp(35, 12, 1, 2, 'lake', 1.5, 12.5, '호수');
  b.rect(11, 9, 14, 9, T.PLAZA);
  b.rect(3, 7, 30, 2, T.PATH);
  b.reserve(0, 11, 36, 4);
  b.reserve(10, 8, 16, 11);

  const shops = [
    { x: 2, kind: 'market', name: '봄이네 시장', npc: 'bomi', station: null },
    { x: 9, kind: 'tailor', name: '실비 의상실', npc: 'silvi', station: 'sewing' },
    { x: 20, kind: 'diner', name: '순자 식당', npc: 'sunja', station: 'stove' },
    { x: 27, kind: 'smithy', name: '철수 대장간', npc: 'chulsu', station: 'bench' },
  ];
  for (const s of shops) {
    b.obj({ t: 'building', kind: s.kind, x: s.x, y: 1, w: 6, h: 5, foot: 3, name: s.name });
    b.npcs.push({ id: s.npc, x: s.x + 2.5, y: 7.2, shop: s.kind === 'smithy' ? 'smithy' : s.kind });
    if (s.station) b.obj({ t: 'station', kind: s.station, x: s.x + 4, y: 6, name: { sewing: '재봉틀', stove: '화덕', bench: '작업대' }[s.station] });
    b.reserve(s.x - 1, 0, 8, 9);
  }
  b.obj({ t: 'anvil', x: 32, y: 7 });

  b.obj({ t: 'fountain', x: 16, y: 11, w: 4, h: 3 });
  b.obj({ t: 'board', x: 22, y: 10, name: '마을 게시판' });
  b.obj({ t: 'waypoint', x: 13, y: 15, wp: 'town', name: '마을 석상' });
  for (const [x, y] of [[11, 9], [24, 9], [11, 17], [24, 17]]) b.obj({ t: 'lamp', x, y });
  b.obj({ t: 'building', kind: 'cottage', x: 3, y: 18, w: 5, h: 4, foot: 2, name: '민수네 집' });
  b.obj({ t: 'building', kind: 'cottage2', x: 28, y: 18, w: 5, h: 4, foot: 2, name: '촌장님 댁' });
  b.reserve(2, 17, 7, 6);
  b.reserve(27, 17, 7, 6);
  b.ellipse(18, 21.5, 3, 1.6, T.WATER);
  b.reserve(14, 19, 9, 5);

  b.npcs.push({ id: 'mayor', route: [[13, 10], [23, 10], [23, 16.5], [14.5, 16.5]], speed: 1.2 });
  b.npcs.push({ id: 'minsu', route: [[10, 12.6], [26, 12.6], [26, 16.5], [10, 16.5]], speed: 1.8 });
  b.npcs.push({ id: 'eunwoo', x: 21.5, y: 14.6 }); // 분수대 옆 버스킹
  b.npcs.push({ id: 'cat', pet: 'cat', route: [[12, 18.3], [24, 18.3], [24, 9.5], [12, 9.5]], speed: 1.1 });

  b.scatter('tree', 0.10, 21, grassy);
  b.scatter('bush', 0.05, 22, grassy);
  b.scatter('flower', 0.16, 23, grassy);
  return b.done();
}

// ── 호수 ─────────────────────────────────────────────────────────────────────
function buildLake() {
  const b = new Builder('lake', '반짝 호수', 32, 24, T.GRASS, { outdoor: true, fishTable: 'lake', music: 'lake' });
  b.borderTrees([{ x: 0, y: 12, h: 2 }]);
  b.warp(0, 12, 1, 2, 'town', 34, 12.5, '마을');
  b.rect(0, 12, 12, 2, T.PATH);
  b.ellipse(21, 12, 9.8, 8.6, T.SAND);
  b.ellipse(21, 12, 8.4, 7.2, T.WATER);
  b.rect(11, 12, 7, 2, T.BRIDGE);
  b.reserve(0, 11, 19, 4);
  b.reserve(11, 3, 21, 19);
  b.obj({ t: 'hut', kind: 'fishshop', x: 3, y: 3, w: 5, h: 4, foot: 2, name: '강태공 낚시점' });
  b.npcs.push({ id: 'kang', x: 5.5, y: 8.2, shop: 'fisher' });
  b.reserve(2, 2, 7, 8);
  b.obj({ t: 'waypoint', x: 6, y: 17, wp: 'lake', name: '호수 석상' });
  b.reserve(5, 16, 3, 3);
  b.obj({ t: 'crate', x: 9, y: 9 });
  b.npcs.push({ id: 'karina', route: [[4.5, 19.5], [12.5, 19.5]], speed: 0.9 }); // 호숫가 춤 연습
  b.npcs.push({ id: 'duck', pet: 'duck', route: [[18, 8], [25, 9], [26, 15], [19, 16]], speed: 0.8 });
  b.scatter('tree', 0.14, 31, grassy);
  b.scatter('flower', 0.12, 32, grassy);
  b.scatter('bush', 0.05, 33, grassy);
  return b.done();
}

// ── 숲 ───────────────────────────────────────────────────────────────────────
function buildForest() {
  const b = new Builder('forest', '속삭이는 숲', 36, 28, T.DARK, { outdoor: true, music: 'forest', danger: 1 });
  b.borderTrees([{ x: 17, y: 0, w: 2 }]);
  b.warp(17, 0, 2, 1, 'farm', 16.5, 24, '농장');
  // 구불구불한 오솔길
  const path = [[17, 0], [17, 6], [10, 6], [10, 14], [18, 14], [18, 20], [27, 20], [27, 10], [18, 10]];
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0] = path[i];
    const [x1, y1] = path[i + 1];
    b.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 2, Math.abs(y1 - y0) + 2, T.PATH);
    b.reserve(Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, Math.abs(x1 - x0) + 4, Math.abs(y1 - y0) + 4);
  }
  b.rect(17, 20, 2, 5, T.PATH);
  b.reserve(15, 20, 6, 8);
  // 공터 (몬스터)
  const clearings = [[6, 20, 4.5, 3.5], [28, 4, 4, 3], [29, 23, 4, 2.6]];
  for (const [cx, cy, rx, ry] of clearings) { b.ellipse(cx, cy, rx, ry, T.GRASS); b.reserve(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(rx * 2) + 1, Math.ceil(ry * 2) + 1); }
  b.spawns.push({ kind: 'rabbit', x: 6, y: 20, r: 3.5, n: 3 });
  b.spawns.push({ kind: 'slime', x: 12, y: 10, r: 3, n: 2 });
  b.spawns.push({ kind: 'boar', x: 28, y: 4, r: 2.6, n: 1 });
  b.spawns.push({ kind: 'slime', x: 29, y: 23, r: 3, n: 2 });
  b.spawns.push({ kind: 'rabbit', x: 23, y: 15, r: 3, n: 2 });

  b.rect(17, 25, 2, 1, T.PATH);
  b.obj({ t: 'arch', x: 17, y: 24, w: 2, h: 2, foot: 0, name: '고대 유적 입구' });
  b.obj({ t: 'pillar', x: 16, y: 25 });
  b.obj({ t: 'pillar', x: 19, y: 25 });
  b.warp(17, 25, 2, 1, 'ruins:1', 0, 0, '유적 1층');
  b.npcs.push({ id: 'rea', x: 21.5, y: 23.4 });
  b.obj({ t: 'waypoint', x: 14, y: 4, wp: 'forest', name: '숲 석상' });
  b.reserve(13, 3, 3, 3);

  // 채집물
  let k = 0;
  for (let y = 2; y < b.h - 2; y++) for (let x = 2; x < b.w - 2; x++) {
    if (!b.free(x, y) || b.get(x, y) === T.PATH) continue;
    if (hash2(x, y, 44) < 0.022) b.obj({ t: 'forage', x, y, nid: `fg${k++}` });
  }
  b.scatter('tree', 0.38, 41, grassy);
  b.scatter('bush', 0.08, 42, grassy);
  b.scatter('flower', 0.05, 43, t => t === T.GRASS);
  return b.done();
}

// ── 광산 입구 ────────────────────────────────────────────────────────────────
function buildMineGate() {
  const b = new Builder('mine_gate', '광산 입구', 24, 16, T.GRASS, { outdoor: true, music: 'mine' });
  b.rect(0, 0, 24, 3, T.CLIFF);
  b.borderTrees([{ x: 11, y: 15, w: 2 }, { x: 0, y: 0, w: 24, h: 3 }]);
  b.rect(11, 5, 2, 11, T.PATH);
  b.warp(11, 15, 2, 1, 'farm', 16.5, 1.5, '농장');
  b.obj({ t: 'cave', x: 10, y: 2, w: 4, h: 3, foot: 3, doors: [[11, 4], [12, 4]], name: '광산' });
  b.warp(11, 4, 2, 1, 'mine:1', 0, 0, '광산 1층');
  b.set(11, 4, T.CAVE); b.set(12, 4, T.CAVE);
  b.reserve(9, 1, 6, 15);
  b.obj({ t: 'waypoint', x: 6, y: 8, wp: 'mine_gate', name: '광산 석상' });
  b.obj({ t: 'sign', x: 14, y: 6, text: '광산: 깊이 갈수록 귀한 광석이 나와요. 5층마다 승강기가 있어요.' });
  b.obj({ t: 'lamp', x: 9, y: 5 });
  b.reserve(5, 7, 3, 3);
  b.scatter('rock', 0.12, 51, grassy);
  b.scatter('boulder', 0.03, 52, grassy);
  b.scatter('flower', 0.06, 53, grassy);
  return b.done();
}

// ── 광산 층 (절차 생성, 날마다 바뀐다) ───────────────────────────────────────
function oreTable(floor) {
  const t = [['stone', 10], ['coal', 2 + floor * 0.2]];
  t.push(['copper_ore', floor < 10 ? 4 : 2]);
  if (floor >= 4) t.push(['iron_ore', Math.min(5, floor * 0.4)]);
  if (floor >= 9) t.push(['gold_ore', Math.min(4, (floor - 8) * 0.5)]);
  if (floor >= 3) t.push(['gem', 0.25 + floor * 0.03]);
  if (floor >= 14) t.push(['ruby', 0.15]);
  return t;
}
export { oreTable };

function caveCarve(rnd, W, H, fill = 0.44) {
  let g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 || rnd() < fill ? 1 : 0)));
  for (let it = 0; it < 4; it++) {
    g = g.map((row, y) => row.map((v, x) => {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return 1;
      let n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (g[y + j][x + i]) n++;
      return n >= 5 ? 1 : 0;
    }));
  }
  return g;
}

// 가장 큰 빈 공간만 남기고 나머지는 막는다. 시작점에서의 거리 지도도 같이 돌려준다.
function largestRegion(g, W, H) {
  const seen = Array.from({ length: H }, () => Array(W).fill(-1));
  let best = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] || seen[y][x] >= 0) continue;
    const q = [[x, y]];
    const cells = [];
    seen[y][x] = 0;
    while (q.length) {
      const [cx, cy] = q.shift();
      cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx; const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || g[ny][nx] || seen[ny][nx] >= 0) continue;
        seen[ny][nx] = 0;
        q.push([nx, ny]);
      }
    }
    if (cells.length > best.length) best = cells;
  }
  const keep = new Set(best.map(([x, y]) => y * W + x));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!keep.has(y * W + x)) g[y][x] = 1;
  return best;
}

function bfsFar(g, W, H, sx, sy) {
  const dist = Array.from({ length: H }, () => Array(W).fill(-1));
  dist[sy][sx] = 0;
  const q = [[sx, sy]];
  let far = [sx, sy];
  while (q.length) {
    const [x, y] = q.shift();
    if (dist[y][x] > dist[far[1]][far[0]]) far = [x, y];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (g[ny]?.[nx] === 0 && dist[ny][nx] < 0) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); }
    }
  }
  return { far, dist };
}

export function buildMine(floor, seedKey) {
  const W = 30; const H = 22;
  const rnd = mulberry32(hashStr(`${seedKey}|mine|${floor}`));
  let g; let cells;
  for (let tries = 0; tries < 20; tries++) {
    g = caveCarve(rnd, W, H);
    cells = largestRegion(g, W, H);
    if (cells.length > 220) break;
  }
  const b = new Builder(`mine:${floor}`, `광산 ${floor}층`, W, H, T.CAVE, { cave: true, floor, music: 'mine', danger: 1 + floor / 5, dark: true });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.set(x, y, g[y][x] ? T.CAVEWALL : T.CAVE);
  // 입구: 위쪽에 가까운 칸
  cells.sort((a, b2) => a[1] - b2[1] || a[0] - b2[0]);
  const [ux, uy] = cells[Math.floor(cells.length * 0.05)];
  const { far } = bfsFar(g, W, H, ux, uy);
  const [dx, dy] = far;
  b.obj({ t: 'ladder', x: ux, y: uy, up: true, name: floor === 1 ? '밖으로' : `${floor - 1}층으로` });
  b.warp(ux, uy, 1, 1, floor === 1 ? 'mine_gate' : `mine:${floor - 1}`, floor === 1 ? 11.5 : 0, floor === 1 ? 5.6 : 0, '위로');
  b.obj({ t: 'ladder', x: dx, y: dy, down: true, name: `${floor + 1}층으로` });
  b.warp(dx, dy, 1, 1, `mine:${floor + 1}`, 0, 0, '아래로');
  b.entry = { x: ux + 0.5, y: uy + 1.5 };
  b.exitDown = { x: dx + 0.5, y: dy - 0.5 };
  // 입구 칸 아래가 벽이면 비워 둔다
  for (const [x, y] of [[ux, uy + 1], [dx, dy - 1]]) if (b.get(x, y) === T.CAVEWALL) { b.set(x, y, T.CAVE); g[y][x] = 0; }
  b.reserve(ux - 1, uy - 1, 3, 3);
  b.reserve(dx - 1, dy - 1, 3, 3);
  if (floor % 5 === 0) {
    const [ex, ey] = cells[Math.floor(cells.length * 0.12)];
    if (b.free(ex, ey)) b.obj({ t: 'waypoint', kind: 'lift', x: ex, y: ey, wp: `mine${floor}`, name: `${floor}층 승강기` });
  }
  const table = oreTable(floor);
  for (const [x, y] of cells) {
    if (!b.free(x, y)) continue;
    const r = rnd();
    if (r < 0.16) {
      let tot = table.reduce((a, [, w]) => a + w, 0);
      let v = rnd() * tot;
      let ore = 'stone';
      for (const [id, w] of table) { v -= w; if (v <= 0) { ore = id; break; } }
      b.obj({ t: 'rock', x, y, ore, hp: ore === 'stone' ? 2 : ore === 'gem' || ore === 'ruby' ? 5 : 3 });
    } else if (r < 0.17) b.obj({ t: 'crystal', x, y });
  }
  const n = 2 + Math.floor(floor / 3);
  for (let i = 0; i < Math.min(n, 7); i++) {
    const [x, y] = cells[Math.floor(rnd() * cells.length)];
    b.spawns.push({ kind: floor >= 2 && rnd() < 0.55 ? 'bat' : 'slime', x: x + 0.5, y: y + 0.5, r: 2, n: 1, lv: floor });
  }
  return b.done();
}

// ── 유적 층 (방과 복도) ─────────────────────────────────────────────────────
export function buildRuins(floor, seedKey) {
  const W = 34; const H = 26;
  const rnd = mulberry32(hashStr(`${seedKey}|ruins|${floor}`));
  const b = new Builder(`ruins:${floor}`, `고대 유적 ${floor}층`, W, H, T.RUINWALL, { ruins: true, floor, music: 'ruins', danger: 2 + floor / 3, dark: true });
  // 3×3 격자의 방
  const rooms = [];
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
    const cw = 11; const ch = 8;
    const w = randInt(rnd, 5, 8); const h = randInt(rnd, 4, 5);
    const x = gx * cw + 1 + randInt(rnd, 0, cw - w - 1);
    const y = gy * ch + 1 + randInt(rnd, 0, ch - h - 1);
    b.rect(x, y, w, h, T.RUIN);
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }
  const link = (a, c) => {
    const [x0, y0, x1, y1] = [a.cx, a.cy, c.cx, c.cy];
    b.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1, T.RUIN);
    b.rect(x1, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, T.RUIN);
  };
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
    const r = rooms[gy * 3 + gx];
    if (gx < 2) link(r, rooms[gy * 3 + gx + 1]);
    if (gy < 2 && (gx === 1 || rnd() < 0.5)) link(r, rooms[(gy + 1) * 3 + gx]);
  }
  const start = rooms[0];
  const end = rooms[8];
  const boss = floor % 5 === 0;
  b.obj({ t: 'ladder', x: start.cx, y: start.y, up: true, name: floor === 1 ? '숲으로' : `${floor - 1}층으로` });
  b.warp(start.cx, start.y, 1, 1, floor === 1 ? 'forest' : `ruins:${floor - 1}`, floor === 1 ? 18 : 0, floor === 1 ? 23.4 : 0, '위로');
  b.obj({ t: 'ladder', x: end.cx, y: end.y + end.h - 1, down: true, name: `${floor + 1}층으로` });
  b.warp(end.cx, end.y + end.h - 1, 1, 1, `ruins:${floor + 1}`, 0, 0, '아래로');
  b.entry = { x: start.cx + 0.5, y: start.y + 1.5 };
  b.exitDown = { x: end.cx + 0.5, y: end.y + end.h - 1.5 };
  b.reserve(start.x, start.y, start.w, 2);
  b.reserve(end.cx - 1, end.y + end.h - 2, 3, 2);
  if (boss) {
    const mid = rooms[4];
    b.spawns.push({ kind: 'golem', x: mid.cx + 0.5, y: mid.cy + 0.5, r: 1, n: 1, lv: floor });
    b.obj({ t: 'waypoint', kind: 'rune', x: start.x + start.w - 1, y: start.y + start.h - 1, wp: `ruins${floor}`, name: `유적 ${floor}층 문양` });
  }
  rooms.forEach((r, i) => {
    if (i === 0) return;
    if (!boss || i !== 4) {
      const n = randInt(rnd, 1, 2);
      for (let k = 0; k < n; k++) b.spawns.push({ kind: rnd() < 0.45 + floor * 0.03 ? 'skeleton' : 'slime', x: r.cx + 0.5, y: r.cy + 0.5, r: 1.5, n: 1, lv: floor });
    }
    if (rnd() < 0.4) {
      const x = r.x + r.w - 1; const y = r.y;
      if (b.free(x, y)) b.obj({ t: 'chest', kind: 'treasure', x, y, key: `ruins${floor}r${i}`, name: '보물 상자' });
    }
    for (let k = 0; k < 2; k++) {
      const x = r.x + randInt(rnd, 0, r.w - 1); const y = r.y + randInt(rnd, 0, r.h - 1);
      if (b.free(x, y) && x !== r.cx && y !== r.cy && rnd() < 0.5) b.obj({ t: 'pillar', x, y }); // 복도가 지나는 줄은 피한다
    }
  });
  return b.done();
}

// ── 조회 ─────────────────────────────────────────────────────────────────────
const cache = new Map();
const STATIC = { farm: buildFarm, town: buildTown, lake: buildLake, forest: buildForest, mine_gate: buildMineGate };

// ctx: { houseLv, seedKey(세계 코드 + 날짜) }
export function getMap(id, ctx = {}) {
  const key = id === 'house' ? `house:${ctx.houseLv || 1}` : id.includes(':') ? `${id}@${ctx.seedKey}` : id;
  if (cache.has(key)) return cache.get(key);
  let m;
  if (id === 'house') m = buildHouse(ctx.houseLv || 1);
  else if (id.startsWith('mine:')) m = buildMine(Number(id.split(':')[1]), ctx.seedKey || 'x');
  else if (id.startsWith('ruins:')) m = buildRuins(Number(id.split(':')[1]), ctx.seedKey || 'x');
  else if (STATIC[id]) m = STATIC[id]();
  else return null;
  m.key = key.replace(/[.#$/[\]@:]/g, '_');
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  cache.set(key, m);
  return m;
}

export function isSolid(m, x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= m.w || yi >= m.h) return true;
  return m.solid[yi * m.w + xi] === 1;
}
export const tileAt = (m, x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)];

export function objectAt(m, x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  for (let i = m.objects.length - 1; i >= 0; i--) {
    const o = m.objects[i];
    if (o.deco) continue;
    if (xi >= o.x && xi < o.x + o.w && yi >= o.y && yi < o.y + o.h) return o;
  }
  return null;
}

export const warpAt = (m, x, y) => m.warps.find(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) || null;

// 순간이동 석상 목록 (이름·위치)
export const WAYPOINTS = {
  farm: { map: 'farm', name: '농장', x: 13.5, y: 16.6 },
  town: { map: 'town', name: '마을', x: 13.5, y: 16.6 },
  lake: { map: 'lake', name: '호수', x: 6.5, y: 18.6 },
  forest: { map: 'forest', name: '숲', x: 14.5, y: 5.6 },
  mine_gate: { map: 'mine_gate', name: '광산 입구', x: 6.5, y: 9.6 },
};
export function waypointInfo(id) {
  if (WAYPOINTS[id]) return WAYPOINTS[id];
  const m = /^(mine|ruins)(\d+)$/.exec(id);
  if (!m) return null;
  return { map: `${m[1]}:${m[2]}`, name: m[1] === 'mine' ? `광산 ${m[2]}층` : `유적 ${m[2]}층`, lift: true };
}

export const FISH_TABLES = {
  pond: [['fish_crucian', 60], ['fish_carp', 25], ['boot', 10], ['fish_trout', 5]],
  lake: [['fish_crucian', 35], ['fish_carp', 30], ['fish_trout', 18], ['fish_catfish', 9], ['fish_salmon', 5], ['boot', 6], ['fish_gold', 0.8]],
};
