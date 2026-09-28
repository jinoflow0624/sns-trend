// 게임 본체: 내 캐릭터 조작 · 상호작용 · 공유 세계 동기화 · 몬스터 · 낚시 · 방치 보상.
//
// 동기화 원칙
//   - 내 캐릭터(players/{pid}/data, pub)는 나만 쓴다.
//   - 공유 세계(밭 한 칸, 자원 하나, 집, 보관함, 석상)는 칸마다 트랜잭션으로 고친다 → 동시에 눌러도 안전.
//   - NPC 위치·광산 지형·시세는 시계와 씨앗으로 계산하므로 동기화하지 않는다.
//   - 몬스터는 각자 화면에서 따로 돈다(보상도 각자).

import {
  ITEMS, JOBS, TOOLS, TOOL_UPGRADE, TOOL_TIERS, CROPS, MONSTERS, SHOPS, HOUSE_LEVELS, HOUSE_GROWTH,
  NPCS, RECIPES, IDLE_JOBS, MIN, HOUR_MS, REAL_HOUR, NPC_TASTE, TASTE_POINTS, PETS, HELPER_PLANS, REGROW_COST,
  BEDTIME_H, COFFEE_H, purifierLimit, NEST_LEVELS, SPOUSE_GIFTS,
} from '../data.js';
import { MARRIED } from '../dates.js';
import * as Inv from '../logic/inventory.js';
import * as P from '../logic/player.js';
import * as Farm from '../logic/farm.js';
import { computeIdle, idleCapHours } from '../logic/idle.js';
import { craft as doCraft, canCraft } from '../logic/craft.js';
import { sellPrice, buyPrice, dailyRequests } from '../logic/market.js';
import { mulberry32, hashStr, hash2, weighted, randInt, rngFor } from '../logic/rng.js';
import { getMap, isSolid, objectAt, warpAt, tileAt, T, FARM_SOIL, waypointInfo, FISH_TABLES, oreTable } from '../world/maps.js';
import { findPath } from '../world/path.js';
import { clockAt, legacyDay } from './clock.js';
import { shouldEndDay, mustPassOut, wakeStats, settleStall } from '../logic/day.js';
import * as Brew from '../logic/purifier.js';
import { greeting } from '../logic/npc.js';
import { pickScene, choose as chooseDate, countsToday, canPropose } from '../logic/date.js';

const SPEED = 4.2;          // 타일/초
const PUB_MS = 140;         // 위치 전송 간격(움직일 때)
const SAVE_MS = 6000;       // 캐릭터 저장 간격
// 지상의 나무·바위는 한 번 베거나 캐면 다시 자라지 않는다 (숲지기 두리에게 값을 치르면 되살아남)
export const GONE = 9e15;
const HELPER_TICK_MS = 15000;
const DAY_TICK_MS = 1000;
// 자원 칸 값: 1e9 보다 작으면 "그 날(일차)까지 없음", 크면 "그 시각(현실)까지 없음"
const DAY_MARK = 1e9;
const FORAGE = {
  forest: [['mushroom', 3], ['berry', 3], ['herb', 3], ['flower', 2]],
  default: [['flower', 3], ['herb', 1]],
};
const DIR_V = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

export class Game {
  constructor({ store, code, pid, me, ui, settings, slotIndex }) {
    this.store = store;
    this.code = code;
    this.pid = pid;
    this.me = me;
    this.ui = ui;
    this.settings = settings;
    this.slotIndex = slotIndex;
    this.meta = null;
    this.house = { level: 1, furniture: {}, fund: { gold: 0, items: {} }, contrib: {} };
    this.waypoints = {};
    this.players = {};
    this.farm = {};
    this.nodes = {};
    this.chest = {};
    this.chat = [];
    this.monsters = [];
    this.fx = [];
    this.path = null;
    this.pending = null;     // 도착하면 할 상호작용
    this.dir = 'down';
    this.moving = false;
    this.animT = 0;
    this.action = null;      // { tool, until }
    this.fishing = null;
    this.selected = 0;       // 핫바 선택 칸
    this.joy = { x: 0, y: 0 };
    this.keys = new Set();
    this.hits = new Map();   // 자원별 누적 타격
    this.invuln = 0;
    this.dirty = true;
    this.lastSave = 0;
    this.lastPub = 0;
    this.lastRegen = performance.now();
    this.decor = null;       // 꾸미기 모드 { slot }
    this.unsubs = [];
    this.fade = 0;
    this.dayState = null;    // 공용 { n, start }
    this.sleeping = null;    // null | 'bed'(침대에서 잠) | 'faint'(밤늦게 쓰러짐)
    this.stall = null;       // 내 가판대 { d, items }
    this.nightWarned = {};
  }

  // ── 시작 · 종료 ────────────────────────────────────────────────────────────
  async start() {
    const S = this.store;
    let meta = await S.get('meta');
    if (!meta) {
      meta = { name: `${this.me.name}네 마을`, createdAt: Date.now(), v: 1 };
      await S.set('meta', meta);
    }
    this.meta = meta;
    this.epoch = meta.createdAt;
    // 오늘(공용). 예전 세계는 처음 들어올 때 지금 시각을 이어받아 옮긴다.
    const d0 = await S.txn('day', cur => (cur?.n ? undefined : legacyDay(Date.now(), meta.createdAt)));
    this.dayState = d0.value;
    const sub = (path, fn) => this.unsubs.push(S.watch(path, fn));
    sub('meta', v => { if (v) this.meta = v; });
    sub('day', v => { if (v?.n) { this.dayState = v; this.onDayState(); } });
    sub(`stall/${this.pid}`, v => { this.stall = v || null; this.ui.refresh?.('stall'); });
    sub('house', v => {
      const prevLv = this.house.level;
      this.house = { level: 1, furniture: {}, fund: { gold: 0, items: {} }, contrib: {}, ...(v || {}) };
      this.house.fund = { gold: 0, items: {}, ...(this.house.fund || {}) };
      this.house.furniture ||= {};
      if (prevLv !== this.house.level && this.map?.id === 'house') this.enterMap('house', null, null, true);
      this.ui.refresh?.();
    });
    sub('waypoints', v => { this.waypoints = v || {}; });
    sub('farm', v => { this.farm = v || {}; });
    sub('chest', v => { this.chest = v || {}; this.ui.refresh?.('chest'); });
    sub('chat', v => { this.onChat(v); });
    sub('pub', v => { this.onPlayers(v || {}); });

    await S.update('', { 'meta/lastActive': Date.now() }).catch(() => {});
    sub('helper', v => { this.helper = v || null; });
    // 방치 창고: 접속 중이든 아니든 idleAt 이후로 계속 쌓인다. 오래 비웠다 돌아오면 먼저 보여 준다.
    if (!this.me.idleAt) this.me.idleAt = this.me.lastSeen || Date.now();
    const stored = this.idleNow();
    if (stored && Date.now() - (this.me.lastSeen || 0) > 5 * MIN) this.ui.showIdle(stored);
    this.me.lastSeen = Date.now();
    this.me.hp = Math.max(1, Math.min(this.me.hp, P.maxHp(this.me)));
    // 처음이면 오늘부터. 꺼 둔 사이 날이 바뀌었으면 가판대 정산부터 한다.
    if (this.me.dayN == null) { this.me.dayN = this.day; this.me.dayGold0 = this.me.gold; }

    const mapId = this.me.map || 'farm';
    this.enterMap(getMap(mapId, this.mapCtx()) ? mapId : 'farm', this.me.x, this.me.y, true);
    this.saveNow();
    S.presence(`pub/${this.pid}/on`, 1);
    this.touchTimer = setInterval(() => S.update('', { 'meta/lastActive': Date.now() }).catch(() => {}), 60000);
    this.touchTimer.unref?.(); // (Node 테스트용) 타이머 때문에 프로세스가 안 끝나지 않게
    // 아무도 없는 사이 새벽 2시가 지났다면 그날은 이미 끝난 것으로 넘긴다
    const n0 = this.day;
    if (this.clock.hour >= COFFEE_H) await S.txn('day', cur => (cur?.n === n0 ? { n: n0 + 1, start: Date.now() } : undefined));
    this.started = true;
    if (this.me.dayN < this.day) await this.finishDay('away');
    else if (this.clock.hour >= BEDTIME_H) {
      // 한밤중에 들어오면 쓰러뜨리지 않고 집 침대에서 시작한다
      this.enterMap('house', null, null, true);
      this.goToBed();
    }
    this.onHide = () => { if (document.visibilityState === 'hidden') this.saveNow(); };
    document.addEventListener('visibilitychange', this.onHide);
    addEventListener('pagehide', this.onHide);
  }

  stop() {
    this.saveNow();
    clearInterval(this.touchTimer);
    document.removeEventListener('visibilitychange', this.onHide);
    removeEventListener('pagehide', this.onHide);
    for (const u of this.unsubs) try { u(); } catch { /* 무시 */ }
    this.store.update(`pub/${this.pid}`, { on: 0 }).catch(() => {});
    this.store.close();
  }

  // ── 시간 ───────────────────────────────────────────────────────────────────
  get clock() { return clockAt(Date.now(), this.dayState); }
  get day() { return this.clock.day; }
  mapCtx() { return { houseLv: this.house.level, seedKey: `${this.code}-d${this.day}`, nestLv: this.me.nest?.lv || 0, spouse: this.me.spouse?.id || null }; }
  nestLv() { return this.me.nest?.lv || 0; }
  stats() { return P.statsOf(this.me); }
  houseGrowth() { return HOUSE_GROWTH[this.house.level] || 0; }
  plotBonus(plot) { return (plot?.b || 0) + this.houseGrowth(); }

  // ── 동기화 수신 ────────────────────────────────────────────────────────────
  onPlayers(all) {
    const now = Date.now();
    for (const [pid, pub] of Object.entries(all)) {
      if (pid === this.pid || !pub?.m) continue;
      let o = this.players[pid];
      if (!o) o = this.players[pid] = { x: pub.x, y: pub.y, animT: 0 };
      o.pub = pub;
      o.online = pub.on === 1 && now - (pub.t || 0) < 90000;
      if (o.map !== pub.m) { o.x = pub.x; o.y = pub.y; }
      o.map = pub.m;
      if (pub.e && pub.et > (o.lastE || 0)) { o.lastE = pub.et; o.bubble = { text: pub.e, until: now + 4000 }; }
    }
    for (const pid of Object.keys(this.players)) if (!all[pid]) delete this.players[pid];
    this.ui.refresh?.('players');
  }

  onChat(v) {
    let list = [];
    try { list = typeof v === 'string' ? JSON.parse(v) : []; } catch { list = []; }
    const known = new Set(this.chat.map(c => c.k));
    const fresh = list.filter(c => !known.has(c.k));
    this.chat = list;
    if (this.chatReady) for (const c of fresh) if (c.p !== this.pid) this.ui.onChat?.(c);
    this.chatReady = true;
  }

  // ── 맵 이동 ────────────────────────────────────────────────────────────────
  enterMap(id, x, y, silent = false, fromFloor = null) {
    const m = getMap(id, this.mapCtx());
    if (!m) return;
    const prevId = this.map?.id;
    this.map = m;
    this.me.map = id;
    if ((id === 'house' || id === 'nest') && (x == null || x === 0)) { x = m.door.x + 0.5; y = m.door.y - 0.6; }
    if ((m.cave || m.ruins) && (x == null || x === 0)) {
      const up = fromFloor != null && fromFloor > m.floor;
      ({ x, y } = up ? m.exitDown : m.entry);
    }
    if (x == null || isSolid(m, x, y)) ({ x, y } = this.safeSpot(m, x, y));
    this.px = x; this.py = y;
    this.path = null;
    this.pending = null;
    this.fishing = null;
    this.decor = null;
    if (this.nodesUnsub) this.nodesUnsub();
    this.nodes = {};
    this.nodesUnsub = this.store.watch(`nodes/${m.key}`, v => { this.nodes = v || {}; });
    this.spawnMonsters();
    this.fade = 1;
    if (m.floor) {
      const k = m.cave ? 'mineMax' : 'ruinsMax';
      this.me.done[k] = Math.max(this.me.done[k] || 0, m.floor);
    }
    this.dirty = true;
    this.pubNow();
    if (!silent && prevId !== id) this.ui.mapBanner?.(m.name);
    this.ui.refresh?.('map');
  }

  safeSpot(m, x = m.w / 2, y = m.h / 2) {
    const cx = Math.floor(x); const cy = Math.floor(y);
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = cx + dx + 0.5; const ty = cy + dy + 0.5;
      if (!isSolid(m, tx, ty) && !warpAt(m, tx, ty)) return { x: tx, y: ty };
    }
    return { x: m.w / 2, y: m.h / 2 };
  }

  takeWarp(w) {
    const to = w.to;
    if (to === 'nest_yard' && !this.me.spouse) {
      // 결혼 전에는 신혼집 터로 못 간다
      this.px -= 0.8;
      this.path = null;
      if (!this.nestWarned || performance.now() - this.nestWarned > 3000) { this.nestWarned = performance.now(); this.ui.toast('결혼하면 이 길 너머에 신혼집을 지을 수 있어요'); }
      return;
    }
    const from = this.map;
    this.hits.clear();
    if (to.startsWith('mine:') || to.startsWith('ruins:')) {
      this.enterMap(to, w.tx || null, w.ty || null, false, from.floor ?? null);
    } else this.enterMap(to, w.tx || null, w.ty || null);
  }

  // ── 매 프레임 ──────────────────────────────────────────────────────────────
  update(dt) {
    const now = Date.now();
    this.animT += dt;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 3);
    if (this.invuln > 0) this.invuln -= dt;
    this.updateMove(dt);
    this.updateMonsters(dt);
    this.updateFishing(dt);
    this.updateFx(dt);
    this.updateOthers(dt);
    // 기력 · 체력 자연 회복
    if (performance.now() - this.lastRegen > 10000) {
      this.lastRegen = performance.now();
      const st = this.stats();
      if (this.me.en < st.en) { this.me.en = Math.min(st.en, this.me.en + 2); this.dirty = true; }
      if (this.me.hp < st.hp && !this.inCombat()) { this.me.hp = Math.min(st.hp, this.me.hp + 2); this.dirty = true; }
    }
    // 밭 일꾼: 접속한 사람 중 한 명(아이디가 가장 작은 사람)이 대표로 수확한다
    if (now - (this.lastHelperTick || 0) > HELPER_TICK_MS) {
      this.lastHelperTick = now;
      if (this.helperActive() && this.isLeader()) this.helperTick().catch(() => {});
    }
    if (now - (this.lastDayTick || 0) > DAY_TICK_MS) {
      this.lastDayTick = now;
      this.dayTick().catch(() => {});
    }
    if (this.dirty && now - this.lastSave > SAVE_MS) this.saveNow();
  }

  inCombat() { return this.monsters.some(m => !m.dead && m.angry && Math.hypot(m.x - this.px, m.y - this.py) < 6); }

  updateMove(dt) {
    let vx = 0; let vy = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('a')) vx -= 1;
    if (k.has('ArrowRight') || k.has('d')) vx += 1;
    if (k.has('ArrowUp') || k.has('w')) vy -= 1;
    if (k.has('ArrowDown') || k.has('s')) vy += 1;
    if (this.joy.x || this.joy.y) { vx = this.joy.x; vy = this.joy.y; }
    if (this.fishing || this.decor?.busy || this.sleeping) { vx = 0; vy = 0; this.path = null; }
    if (vx || vy) { this.path = null; this.pending = null; }

    if (!vx && !vy && this.path?.length) {
      const tgt = this.path[0];
      const dx = tgt.x - this.px; const dy = tgt.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d < 0.08) {
        this.path.shift();
        if (!this.path.length) { this.path = null; this.arrive(); }
      } else { vx = dx / d; vy = dy / d; }
    }

    const len = Math.hypot(vx, vy);
    this.moving = len > 0.05;
    if (!this.moving) return;
    const mag = Math.min(1, len);
    const spd = (SPEED + this.stats().dex * 0.04) * mag;
    const nx = vx / len; const ny = vy / len;
    if (Math.abs(nx) > Math.abs(ny) * 1.1) this.dir = nx < 0 ? 'left' : 'right';
    else this.dir = ny < 0 ? 'up' : 'down';
    this.tryMove(nx * spd * dt, 0);
    this.tryMove(0, ny * spd * dt);
    const w = warpAt(this.map, this.px, this.py);
    if (w) this.takeWarp(w);
    this.pubSoon();
  }

  // 베어 내거나 캐낸 자원이 있던 칸은 지나갈 수 있다
  deadNodeAt(x, y) {
    const o = this.map.nodeGrid?.[Math.floor(y) * this.map.w + Math.floor(x)];
    return !!o && this.nodeDead(o);
  }
  solidAt(x, y) { return isSolid(this.map, x, y) && !this.deadNodeAt(x, y); }
  pathIgnore() { return o => !!o.nid && this.nodeDead(o); }

  blocked(x, y) {
    const r = 0.28;
    const pts = [[x - r, y - 0.15], [x + r, y - 0.15], [x - r, y + 0.2], [x + r, y + 0.2]];
    for (const [px, py] of pts) {
      if (this.solidAt(px, py)) return true;
      if (this.map.id === 'house' && this.furnitureSolidAt(Math.floor(px), Math.floor(py))) return true;
    }
    return false;
  }
  tryMove(dx, dy) {
    const nx = this.px + dx; const ny = this.py + dy;
    if (!this.blocked(nx, ny)) { this.px = nx; this.py = ny; return true; }
    // 모서리에 걸리면 살짝 미끄러지게
    if (dx) { for (const s of [0.2, -0.2]) if (!this.blocked(nx, this.py + s) && !this.blocked(this.px, this.py + s)) { this.py += s * 0.25; return false; } }
    if (dy) { for (const s of [0.2, -0.2]) if (!this.blocked(this.px + s, ny) && !this.blocked(this.px + s, this.py)) { this.px += s * 0.25; return false; } }
    return false;
  }

  // ── 터치 이동 ──────────────────────────────────────────────────────────────
  // 화면을 누른 월드 좌표. 물건이면 옆까지 걸어가서 상호작용.
  tapWorld(wx, wy) {
    if (this.sleeping) return;
    if (this.decor) return this.decorTap(wx, wy);
    if (this.fishing) return this.action_();
    const tx = Math.floor(wx); const ty = Math.floor(wy);
    const target = this.targetAt(wx, wy);
    if (target) {
      const d = Math.hypot(target.cx - this.px, target.cy - this.py);
      if (d < target.reach) { this.face(target.cx, target.cy); return this.interact(target); }
      const path = findPath(this.map, this.px, this.py, target.px ?? target.cx, target.py ?? target.cy, { adjacent: true, maxNodes: 6000, ignore: this.pathIgnore() });
      if (path) { this.path = path; this.pending = target; this.marker = { x: target.cx, y: target.cy, t: 0.6 }; return; }
    }
    if (!this.solidAt(wx, wy)) {
      const path = findPath(this.map, this.px, this.py, tx + 0.5, ty + 0.5, { maxNodes: 6000, ignore: this.pathIgnore() });
      if (path) { this.path = path.length ? path : [{ x: tx + 0.5, y: ty + 0.5 }]; this.pending = null; this.marker = { x: tx + 0.5, y: ty + 0.5, t: 0.6 }; }
    }
  }

  arrive() {
    const t = this.pending;
    this.pending = null;
    if (!t) return;
    // 걷는 동안 움직이는 NPC·동물은 지금 위치를 다시 찾는다
    if (t.kind === 'npc' || t.kind === 'pet') {
      const n = this.npcList().find(q => q.id === t.npc.id);
      if (n) {
        const d = Math.hypot(n.x - this.px, n.y - this.py);
        if (d > 2.4 && (t.retry || 0) < 3) {
          const path = findPath(this.map, this.px, this.py, n.x, n.y, { adjacent: true, maxNodes: 6000, ignore: this.pathIgnore() });
          if (path?.length) { this.path = path; this.pending = { ...t, npc: n, cx: n.x, cy: n.y, retry: (t.retry || 0) + 1 }; return; }
        }
        this.face(n.x, n.y);
        if (d <= 2.8) this.interact({ ...t, npc: n, cx: n.x, cy: n.y });
        return;
      }
    }
    this.face(t.cx, t.cy);
    const d = Math.hypot(t.cx - this.px, t.cy - this.py);
    if (d < t.reach + 0.8) this.interact(t);
  }

  face(x, y) {
    const dx = x - this.px; const dy = y - this.py;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx < 0 ? 'left' : 'right';
    else this.dir = dy < 0 ? 'up' : 'down';
  }

  // 누른 위치나 바라보는 칸에 있는 상호작용 대상
  targetAt(wx, wy) {
    const m = this.map;
    // 몬스터
    for (const mo of this.monsters) {
      if (!mo.dead && Math.hypot(mo.x - wx, mo.y - wy) < 0.8) return { kind: 'monster', mo, cx: mo.x, cy: mo.y, reach: 1.3 };
    }
    // NPC · 동물 (머리부터 발밑까지 넉넉하게)
    for (const n of this.npcList()) {
      const tall = n.pet ? 0.9 : 1.7;
      if (Math.abs(n.x - wx) < 0.75 && wy > n.y - tall && wy < n.y + 0.5) {
        return { kind: n.pet ? 'pet' : 'npc', npc: n, cx: n.x, cy: n.y, reach: n.pet ? 1.8 : 2.0 };
      }
    }
    // 다른 사람
    for (const [pid, o] of Object.entries(this.players)) {
      if (o.map === m.id && o.online && Math.abs(o.x - wx) < 0.6 && wy > o.y - 1.4 && wy < o.y + 0.4) return { kind: 'player', pid, cx: o.x, cy: o.y, reach: 1.8 };
    }
    const tx = Math.floor(wx); const ty = Math.floor(wy);
    // 가구
    if (m.id === 'house') {
      const f = this.furnitureAt(tx, ty);
      if (f) return { kind: 'furniture', f, cx: tx + 0.5, cy: ty + 0.5, reach: 1.5 };
    }
    // 물건 (나무는 위쪽을 눌러도 줄기로)
    let o = objectAt(m, wx, wy);
    if (!o) {
      const below = objectAt(m, wx, wy + 1);
      if (below && (below.t === 'tree' || below.t === 'waypoint' || below.t === 'lamp' || below.t === 'station' || below.t === 'board')) o = below;
    }
    if (o && (o.t === 'building' || o.t === 'hut')) return this.buildingTarget(o);
    if (o && this.interactable(o)) {
      const cx = o.x + o.w / 2; const cy = o.y + o.h - 0.5;
      return { kind: 'object', o, cx, cy, reach: Math.max(o.w, o.h) / 2 + 1.0, px: o.x + Math.floor(o.w / 2) + 0.5, py: o.y + o.h - 0.5 };
    }
    const t = tileAt(m, wx, wy);
    if (t === T.SOIL && m.id === 'farm') return { kind: 'plot', x: tx, y: ty, cx: tx + 0.5, cy: ty + 0.5, reach: 1.45 };
    if (t === T.WATER && m.fishTable) return { kind: 'water', x: tx, y: ty, cx: tx + 0.5, cy: ty + 0.5, reach: 2.2 };
    return null;
  }

  // 건물을 누르면: 우리 집은 문으로 들어가고, 가게는 앞에 선 주인에게 말을 건다
  buildingTarget(o) {
    if (o.kind === 'house' && o.door) {
      return { kind: 'door', o, cx: o.door.x + 0.5, cy: o.door.y + 0.5, px: o.door.x + 0.5, py: o.door.y + 0.5, reach: 0.9, walkIn: true };
    }
    const owner = this.npcList().find(n => !n.pet && n.x >= o.x - 1 && n.x <= o.x + o.w + 1 && n.y >= o.y + o.h - 1 && n.y <= o.y + o.h + 3);
    if (owner) return { kind: 'npc', npc: owner, cx: owner.x, cy: owner.y, reach: 2.0 };
    return null;
  }

  interactable(o) {
    if (o.deco) return false;
    if (['tree', 'rock', 'bush', 'forage', 'boulder', 'crystal'].includes(o.t)) return !this.nodeDead(o) || o.t === 'bush';
    return ['waypoint', 'station', 'chest', 'bed', 'board', 'sign', 'fountain', 'anvil', 'crate'].includes(o.t);
  }

  // 바라보는 앞 칸의 대상 (액션 버튼용)
  facingTarget() {
    const [dx, dy] = DIR_V[this.dir];
    // 몬스터가 가까이 있으면 우선
    let best = null; let bd = 1.5;
    for (const mo of this.monsters) {
      if (mo.dead) continue;
      const d = Math.hypot(mo.x - this.px, mo.y - this.py);
      if (d < bd) { bd = d; best = mo; }
    }
    if (best && !best.passive) return { kind: 'monster', mo: best, cx: best.x, cy: best.y, reach: 1.5 };
    for (const dist of [0.8, 1.3]) {
      const t = this.targetAt(this.px + dx * dist, this.py - 0.1 + dy * dist);
      if (t && t.kind !== 'player' && t.kind !== 'door') return t;
    }
    // 바라보는 방향이 조금 어긋나도 바로 옆 사람에게는 말을 걸 수 있게
    for (const n of this.npcList()) {
      if (Math.hypot(n.x - this.px, n.y - this.py) < 1.5) return { kind: n.pet ? 'pet' : 'npc', npc: n, cx: n.x, cy: n.y, reach: 2 };
    }
    if (best) return { kind: 'monster', mo: best, cx: best.x, cy: best.y, reach: 1.5 };
    return null;
  }

  // 액션 버튼에 보여 줄 아이콘/글자 (아이콘은 ui 의 도트 아이콘 이름)
  contextHint() {
    if (this.sleeping) return { icon: 'bed', label: this.sleeping === 'bed' ? '자는 중' : '기절' };
    if (this.fishing) return { icon: 'rod', label: this.fishing.state === 'bite' ? '지금!' : this.fishing.state === 'reel' ? '잡기!' : '거두기' };
    if (this.decor) return { icon: 'chair', label: '놓기' };
    const t = this.facingTarget();
    if (!t) return { icon: 'hand', label: '살펴보기' };
    return this.describeTarget(t);
  }
  describeTarget(t) {
    switch (t.kind) {
      case 'monster': return { icon: 'sword', label: t.mo.passive && !t.mo.angry ? '사냥' : '공격' };
      case 'npc': return { icon: 'talk', label: t.npc.shop ? '거래' : '대화' };
      case 'pet': return { icon: 'heart', label: '쓰다듬기' };
      case 'player': return { icon: 'hand', label: '인사' };
      case 'furniture': {
        const it = ITEMS[t.f.i];
        if (it?.purifier) return { icon: 'purifier', label: '정수기' };
        if (it?.station) return { icon: 'furnace', label: it.name };
        return { icon: 'chair', label: '가구' };
      }
      case 'water': return this.selectedItem()?.id === 'bucket' ? { icon: 'bucket', label: '물 뜨기' } : { icon: 'rod', label: '낚시' };
      case 'door': return { icon: 'house', label: '들어가기' };
      case 'plot': {
        const i = this.plotIndex(t.x, t.y);
        if (i >= this.plotLimit()) return { icon: 'lock', label: '잠김' };
        const p = this.effPlot(this.farm[i]);
        const now = Date.now();
        if (!p?.tilled) return { icon: 'hoe', label: '밭 갈기' };
        if (!p.crop) return { icon: 'seed', label: this.selectedItem()?.type === 'seed' ? '심기' : '씨앗 심기' };
        if (Farm.isRipe(p, now, this.plotBonus(p))) return { icon: 'basket', label: '수확' };
        if (!Farm.isWet(p, now)) return { icon: 'can', label: '물 주기' };
        return { icon: 'clock', label: '자라는 중' };
      }
      case 'object': {
        const o = t.o;
        return ({
          tree: { icon: 'axe', label: '벌목' }, rock: { icon: 'pick', label: '채굴' }, boulder: { icon: 'pick', label: '채굴' }, crystal: { icon: 'pick', label: '채굴' },
          bush: { icon: 'hand', label: '흔들기' }, forage: { icon: 'basket', label: '줍기' }, waypoint: { icon: 'portal', label: '순간이동' },
          station: { icon: 'craft', label: '제작' }, chest: { icon: 'box', label: o.kind === 'shipbox' ? '가판대' : '열기' }, bed: { icon: 'bed', label: '자기' },
          board: o.kind === 'nest' ? { icon: 'house', label: '신혼집' } : { icon: 'board', label: '부탁' }, sign: { icon: 'board', label: o.kind === 'nestlot' ? '신혼집' : '읽기' }, fountain: { icon: 'coin', label: '소원' },
        })[o.t] || { icon: 'hand', label: '살펴보기' };
      }
    }
    return { icon: 'hand', label: '살펴보기' };
  }

  // 액션 버튼
  action_() {
    if (this.sleeping) return;
    if (this.fishing) return this.fishPress();
    if (this.decor) return;
    const t = this.facingTarget();
    if (t) return this.interact(t);
    this.ui.toast('앞에 아무것도 없어요');
  }

  interact(t) {
    switch (t.kind) {
      case 'monster': return this.attack(t.mo);
      case 'npc': return this.ui.openNpc(t.npc);
      case 'pet': return this.petCry(t.npc);
      case 'door': return this.enterDoor(t.o);
      case 'player': return this.wave(t.pid);
      case 'furniture': {
        const it = ITEMS[t.f.i];
        if (it?.purifier) return this.ui.openPurifier?.(t.f.fid);
        if (it?.station) return this.ui.openCraft(it.station);
        return this.ui.toast(`${it?.name || '가구'} — 꾸미기 모드에서 옮길 수 있어요`);
      }
      case 'water':
        this.face(t.cx, t.cy);
        if (this.selectedItem()?.id === 'bucket') return this.fillBucket();
        return this.startFishing();
      case 'plot': return this.plotAction(t.x, t.y);
      case 'object': return this.objectAction(t.o);
    }
  }

  // ── 도구 사용 공통 ─────────────────────────────────────────────────────────
  useTool(tool, cost) {
    if (this.action && this.action.until > performance.now()) return false;
    const c = cost ?? P.toolCost(this.me, tool);
    if (!P.spendEn(this.me, c)) {
      this.ui.toast('기력이 부족해요. 음식을 먹거나 침대에서 쉬세요', 'bad');
      return false;
    }
    this.action = { tool, until: performance.now() + 320, dur: 320 };
    // 다른 사람 화면에도 휘두르는 모습이 보이도록 바로 알리고, 끝나면 다시 알린다
    this.pubNow();
    clearTimeout(this.actPubTimer);
    this.actPubTimer = setTimeout(() => this.pubNow(), 360);
    this.dirty = true;
    this.ui.sfx?.(tool);
    return true;
  }

  gainXp(skill, n) {
    const ups = P.gainXp(this.me, skill, n);
    for (const u of ups) this.ui.levelUp?.(u);
    this.dirty = true;
  }

  give(id, n) {
    if (n <= 0) return;
    const over = Inv.give(this.me, id, n);
    this.floatItem(id, n);
    if (over) this.ui.toast(`가방이 가득 차 ${ITEMS[id].name} ${over}개는 보관함으로 갔어요`);
    this.dirty = true;
  }

  // ── 밭 ─────────────────────────────────────────────────────────────────────
  plotIndex(x, y) {
    const s = FARM_SOIL;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h) return -1;
    return (y - s.y) * s.w + (x - s.x);
  }
  plotLimit() { return HOUSE_LEVELS[this.house.level]?.plots || 24; }

  // 괭이·물뿌리개는 단계가 오르면 여러 칸을 한 번에
  toolArea(tool, x, y) {
    const tier = this.me.tools[tool] || 1;
    if (tier < 3) return [[x, y]];
    const [dx, dy] = DIR_V[this.dir];
    if (tier === 3) return [0, 1, 2].map(i => [x + dx * i, y + dy * i]);
    const out = [];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) out.push([x + i, y + j]);
    return out;
  }

  async plotAction(x, y) {
    const i = this.plotIndex(x, y);
    if (i < 0) return;
    if (i >= this.plotLimit()) return this.ui.toast('이 칸은 집을 키우면 쓸 수 있어요');
    const now = Date.now();
    const p = this.effPlot(this.farm[i]);
    if (!p?.tilled) {
      if (!this.useTool('hoe')) return;
      this.dust(x + 0.5, y + 0.5);
      let n = 0;
      for (const [ax, ay] of this.toolArea('hoe', x, y)) {
        const k = this.plotIndex(ax, ay);
        if (k < 0 || k >= this.plotLimit()) continue;
        const r = await this.store.txn(`farm/${k}`, cur => Farm.till(cur || {}) || undefined);
        if (r.committed) n++;
      }
      if (n) this.gainXp('farm', 2 * n);
      return;
    }
    if (Farm.isRipe(p, now, this.plotBonus(p))) return this.harvestPlot(i, x, y);
    if (!p.crop) {
      const sel = this.selectedItem();
      const seedSlot = sel?.type === 'seed' ? this.selected : this.me.inv.findIndex(s => s && ITEMS[s.id].type === 'seed');
      if (seedSlot < 0) return this.ui.toast('씨앗이 없어요. 봄이네 시장에서 살 수 있어요');
      const seedId = this.me.inv[seedSlot].id;
      const crop = ITEMS[seedId].crop;
      Inv.removeAt(this.me.inv, seedSlot, 1);
      const b = JOBS[this.me.job]?.perk?.growth || 0;
      const r = await this.store.txn(`farm/${i}`, cur => {
        const next = Farm.plant(cur, crop, Date.now());
        return next ? { ...next, b, by: this.me.name } : undefined;
      });
      if (!r.committed) { Inv.give(this.me, seedId, 1); return this.ui.toast('이미 뭔가 심겨 있어요'); }
      this.sparkle(x + 0.5, y + 0.5, '#8fd05c');
      this.gainXp('farm', 1);
      this.ui.sfx?.('plant');
      this.dirty = true;
      return;
    }
    if (!Farm.isWet(p, now)) {
      if (!this.useTool('can')) return;
      this.splash(x + 0.5, y + 0.5);
      let n = 0;
      for (const [ax, ay] of this.toolArea('can', x, y)) {
        const k = this.plotIndex(ax, ay);
        if (k < 0 || k >= this.plotLimit()) continue;
        const r = await this.store.txn(`farm/${k}`, cur => (cur ? Farm.water(cur, Date.now(), this.plotBonus(cur)) || undefined : undefined));
        if (r.committed) n++;
      }
      if (n) this.gainXp('farm', n);
      return;
    }
    const left = Farm.timeLeft(p, now, this.plotBonus(p));
    this.ui.toast(`${CROPS[p.crop].name} — 약 ${Math.max(1, Math.ceil(left / MIN))}분 뒤 수확할 수 있어요`);
  }

  async harvestPlot(i, x, y) {
    const perk = JOBS[this.me.job]?.perk || {};
    const extra = (perk.bonusHarvest || 0) + this.stats().luk * 0.01;
    let got = null;
    const r = await this.store.txn(`farm/${i}`, cur => {
      const h = Farm.harvest(this.effPlot(cur), Date.now(), mulberry32(hashStr(`${i}:${cur?.at}:${this.pid}`)), { bonus: this.plotBonus(cur), extraChance: extra });
      got = h;
      return h ? { ...h.plot, wetUntil: cur.wetUntil || 0 } : undefined;
    });
    if (!r.committed || !got) return this.ui.toast('이미 누가 수확했어요');
    this.action = { tool: 'hand', until: performance.now() + 250 };
    this.give(got.item, got.n);
    this.me.stats.harvested += got.n;
    this.gainXp('farm', got.xp);
    this.sparkle(x + 0.5, y + 0.5, '#ffd23c');
    this.ui.sfx?.('harvest');
  }

  // ── 자원 (나무 · 바위 · 덤불 · 채집물) ─────────────────────────────────────
  nodeDead(o) { return this.deadVal(this.nodes[o.nid]); }
  deadVal(v) { v = v || 0; return v < DAY_MARK ? v >= this.day : v > Date.now(); }
  forageItem(o) {
    const table = FORAGE[this.map.id] || FORAGE.default;
    return weighted(mulberry32(hashStr(`${o.nid}:${this.day}`)), table);
  }

  async claimNode(o, until) {
    const r = await this.store.txn(`nodes/${this.map.key}/${o.nid}`, cur => (this.deadVal(cur) ? undefined : until));
    return r.committed;
  }

  async objectAction(o) {
    const now = Date.now();
    switch (o.t) {
      case 'tree': {
        if (this.nodeDead(o)) return this.ui.toast('그루터기만 남았어요. 숲지기 두리에게 부탁하면 되살아나요');
        if (!this.useTool('axe')) return;
        this.face(o.x + 0.5, o.y + 0.5);
        const need = Math.max(1, 4 - (this.me.tools.axe || 1) + (this.map.id === 'forest' ? 1 : 0));
        const h = (this.hits.get(o.nid) || 0) + 1;
        this.hits.set(o.nid, h);
        this.shakeObj = { o, t: 0.25 };
        this.leaves(o.x + 0.5, o.y - 0.5);
        if (h < need) return;
        this.hits.delete(o.nid);
        if (!(await this.claimNode(o, GONE))) return this.ui.toast('누가 먼저 베었어요');
        const rnd = mulberry32(hashStr(`${o.nid}:${now}`));
        this.give('wood', randInt(rnd, 3, 5) + (this.me.tools.axe >= 3 ? 2 : 0));
        if (rnd() < 0.25) this.give(this.map.id === 'forest' ? 'mushroom' : 'herb', 1);
        this.gainXp('farm', 4);
        this.ui.sfx?.('fell');
        return;
      }
      case 'rock': case 'boulder': case 'crystal': {
        if (this.nodeDead(o)) return;
        if (!this.useTool('pick')) return;
        this.face(o.x + 0.5, o.y + 0.5);
        const perk = JOBS[this.me.job]?.perk || {};
        const dmg = (this.me.tools.pick || 1) + (perk.mineDmg || 0) + Math.floor(this.stats().str / 8);
        const hp = o.hp || { boulder: 5, crystal: 3 }[o.t] || 2;
        const h = (this.hits.get(o.nid) || 0) + dmg;
        this.hits.set(o.nid, h);
        this.shakeObj = { o, t: 0.2 };
        this.chips(o.x + 0.5, o.y + 0.5);
        if (h < hp) return;
        this.hits.delete(o.nid);
        // 광산 층은 날마다 새로 만들어지므로 사실상 하루 뒤 다시 생기고, 지상 바위는 되살리기 전까지 없다
        if (!(await this.claimNode(o, GONE))) return;
        const rnd = mulberry32(hashStr(`${o.nid}:${now}:${this.pid}`));
        if (o.t === 'crystal') {
          this.give(rnd() < 0.7 ? 'gem' : 'stone', 1);
          this.gainXp('mine', 15);
          this.ui.sfx?.('break');
          return;
        }
        if (o.t === 'boulder') {
          this.give('stone', randInt(rnd, 4, 6));
          if (rnd() < 0.5) this.give(weighted(rnd, [['coal', 2], ['copper_ore', 2], ['iron_ore', 1]]), 1);
          this.me.stats.mined++;
          this.gainXp('mine', 8);
          this.ui.sfx?.('break');
          return;
        }
        let ore = o.ore;
        if (!ore) ore = weighted(rnd, [['stone', 8], ['coal', 1], ['copper_ore', 1.5]]);
        if (ore === 'stone' && this.map.cave && rnd() < (perk.oreLuck || 0) + this.stats().luk * 0.005) ore = weighted(rnd, oreTable(this.map.floor).filter(([id]) => id !== 'stone'));
        this.give(ore, ore === 'stone' ? randInt(rnd, 1, 3) : randInt(rnd, 1, 2));
        if (ore !== 'stone' && rnd() < 0.5) this.give('stone', 1);
        this.me.stats.mined++;
        this.gainXp('mine', ore === 'stone' ? 3 : ore.includes('gem') || ore === 'ruby' ? 20 : 8);
        this.ui.sfx?.('break');
        return;
      }
      case 'bush': {
        this.shakeObj = { o, t: 0.25 };
        this.leaves(o.x + 0.5, o.y + 0.3);
        if (hash2(o.x, o.y, 8) >= 0.25 || this.nodeDead(o)) return this.ui.toast('바스락…');
        if (!(await this.claimNode(o, this.day))) return; // 오늘 하루만 비어 있다
        this.give('berry', 2);
        this.gainXp('farm', 2);
        return;
      }
      case 'forage': {
        if (this.nodeDead(o)) return;
        const item = this.forageItem(o);
        if (!(await this.claimNode(o, this.day))) return;
        this.action = { tool: 'hand', until: performance.now() + 250 };
        this.give(item, 1);
        this.gainXp('farm', 3);
        return;
      }
      case 'waypoint': {
        if (!this.waypoints[o.wp]) {
          await this.store.txn(`waypoints/${o.wp}`, cur => cur || { by: this.me.name, t: now });
          this.ui.toast(`${waypointInfo(o.wp)?.name || o.name} 석상이 깨어났어요. 이제 어디서든 이곳으로 순간이동할 수 있어요`, 'good');
          this.sparkle(o.x + 0.5, o.y, '#7ae8ff', 14);
          this.ui.sfx?.('discover');
          this.chatSys(`${this.me.name} 님이 ${waypointInfo(o.wp)?.name} 석상을 깨웠어요`);
        }
        return this.ui.openTeleport();
      }
      case 'station': return this.ui.openCraft(o.kind);
      case 'chest':
        if (o.kind === 'shipbox') return this.ui.openStall?.();
        if (o.kind === 'treasure') return this.openTreasure(o);
        return this.ui.openChest();
      case 'bed': return this.ui.askSleep ? this.ui.askSleep() : this.goToBed();
      case 'board': return o.kind === 'nest' ? this.ui.openNest?.() : this.ui.openBoard();
      case 'sign': return o.kind === 'nestlot' ? this.ui.openNest?.() : this.ui.toast(o.text || '낡은 표지판이에요');
      case 'fountain': {
        if (this.me.gold < 10) return this.ui.toast('동전이 없어요');
        this.me.gold -= 10;
        this.me.buffs = P.activeBuffs(this.me).filter(b => b.src !== 'fountain');
        this.me.buffs.push({ src: 'fountain', stats: { luk: 2 }, until: now + 15 * MIN });
        this.splash(o.x + 2, o.y + 1.5);
        this.dirty = true;
        return this.ui.toast('퐁당! 동전을 던졌어요. 행운 +2 (15분)', 'good');
      }
      case 'anvil': return this.ui.toast('철수 아저씨의 모루예요. 도구 강화는 철수 아저씨에게 부탁하세요');
      case 'crate': return this.ui.toast('낚시 도구가 담긴 나무 상자예요');
      default: return undefined;
    }
  }

  openTreasure(o) {
    const key = `${o.key}:${this.day}`;
    if (this.me.done[key]) return this.ui.toast('오늘은 이미 열었어요');
    this.me.done[key] = 1;
    const f = this.map.floor || 1;
    const rnd = rngFor(this.pid, key);
    const gold = 40 + f * 25 + randInt(rnd, 0, 60);
    this.me.gold += gold;
    this.floatText(`+${gold}G`, '#ffd23c');
    const loot = weighted(rnd, [['copper_ore', 3], ['iron_ore', 2 + f * 0.2], ['gold_ore', f * 0.2], ['gem', 0.6 + f * 0.05], ['ruby', f > 6 ? 0.3 : 0], ['cloth', 1], ['wool', 1]]);
    this.give(loot, randInt(rnd, 1, 3));
    this.sparkle(o.x + 0.5, o.y + 0.5, '#ffd23c', 12);
    this.ui.sfx?.('discover');
    this.dirty = true;
  }

  // ── 하루의 끝 ──────────────────────────────────────────────────────────────
  // 오늘 커피를 마셨나 (새벽 2시까지 버틸 수 있다)
  hasCaffeine() { return this.me.caff === this.day; }

  // 침대에 눕는다. 체력·기력은 모두가 잠들어 하루가 끝날 때 한꺼번에 찬다.
  goToBed() {
    if (this.sleeping) return;
    const bed = this.map.objects.find(o => o.t === 'bed');
    this.sleeping = 'bed';
    this.sleptIn = this.map.id;
    this.path = null; this.pending = null; this.fishing = null; this.decor = null;
    if (bed) { this.px = bed.x + bed.w / 2; this.py = bed.y + 1.2; }
    this.dir = 'down';
    this.fade = 0.8;
    this.pubNow();
    this.ui.sleepChanged?.();
    this.dayTick().catch(() => {});
  }
  // 기다리다 다시 일어난다 (쓰러진 사람은 못 일어난다)
  wakeUp() {
    if (this.sleeping !== 'bed') return;
    this.sleeping = null;
    const bed = this.map.objects.find(o => o.t === 'bed');
    if (bed) ({ x: this.px, y: this.py } = this.safeSpot(this.map, bed.x + bed.w + 0.5, bed.y + bed.h + 0.5));
    this.pubNow();
    this.ui.sleepChanged?.();
  }
  // 밤 12시(커피를 마셨으면 새벽 2시)가 지나도록 깨어 있으면 그 자리에서 쓰러진다
  passOut() {
    if (this.sleeping) return;
    this.sleeping = 'faint';
    this.path = null; this.pending = null; this.fishing = null; this.decor = null;
    this.fade = 1.2;
    this.pubNow();
    this.ui.toast('너무 늦었어요… 그 자리에서 쓰러졌어요', 'bad');
    this.ui.sleepChanged?.();
  }

  // 접속 중인 사람들의 잠 상태 (나 포함) → [{ name, z(0 깨어 있음 · 1 침대 · 2 쓰러짐), caff }]
  roster() {
    const out = [{ me: true, name: this.me.name, z: this.sleeping === 'bed' ? 1 : this.sleeping ? 2 : 0, caff: this.hasCaffeine() }];
    for (const o of Object.values(this.players)) {
      if (!o.online || !o.pub) continue;
      out.push({ name: o.pub.n, z: o.pub.z || 0, caff: o.pub.cf === this.day });
    }
    return out;
  }

  // 1초마다: 밤 알림 · 쓰러지기 · 하루 끝내기
  async dayTick() {
    if (!this.started || !this.dayState || this.dayBusy) return;
    const { hour } = this.clock;
    const n = this.dayState.n;
    const warn = (k, msg) => { if (this.nightWarned[k] !== n) { this.nightWarned[k] = n; this.ui.toast(msg); } };
    if (!this.sleeping) {
      if (hour >= BEDTIME_H - 1 && hour < BEDTIME_H && !this.hasCaffeine()) warn('late', '밤 11시예요. 12시 전에 집에 가서 자야 해요');
      if (hour >= COFFEE_H - 1 && hour < COFFEE_H && this.hasCaffeine()) warn('coffee', '커피 기운이 떨어져 가요. 새벽 2시엔 쓰러져요');
      if (mustPassOut(hour, this.hasCaffeine())) this.passOut();
    }
    const awake = this.roster().filter(p => !p.z);
    if (!shouldEndDay(hour, awake)) return;
    // 누가 먼저 넘겨도 한 번만 넘어간다
    await this.store.txn('day', cur => (cur?.n === n ? { n: n + 1, start: Date.now() } : undefined));
  }

  // 공용 날짜가 바뀌면 각자 자기 하루를 마무리한다
  onDayState() {
    if (!this.started || this.dayBusy || this.me.dayN == null || this.me.dayN >= this.dayState.n) return;
    const outcome = this.sleeping === 'bed' ? 'slept' : 'faint';
    this.finishDay(outcome).catch(err => console.warn('day end', err));
  }

  // 하루 정산: 가판대 판매 · 체력/기력 · 집에서 아침 6시에 깨기 · 요약 창
  async finishDay(outcome) {
    if (this.dayBusy) return;
    this.dayBusy = true;
    try {
      const prevDay = this.me.dayN;
      const sold = await this.sellStall();
      const st = this.stats();
      const w = wakeStats(outcome, st);
      this.me.hp = w.hp;
      this.me.en = w.en;
      const earned = this.me.gold - (this.me.dayGold0 ?? this.me.gold);
      this.me.dayN = this.day;
      this.me.dayGold0 = this.me.gold;
      // 결혼했으면 배우자가 아침을 챙겨 주고, 신혼집에서 잤으면 힘이 난다
      const lv = this.nestLv();
      const gifts = [];
      if (this.me.spouse && lv >= 2) {
        const rnd = mulberry32(hashStr(`${this.pid}:gift:${this.day}`));
        for (let k = 0; k < lv - 1; k++) gifts.push(SPOUSE_GIFTS[Math.floor(rnd() * SPOUSE_GIFTS.length)]);
        for (const id of gifts) Inv.give(this.me, id, 1);
      }
      const bonus = outcome === 'slept' && this.sleptIn === 'nest' ? (lv >= 5 ? { en: 30, hp: 30 } : lv >= 4 ? { en: 20 } : null) : null;
      if (bonus) {
        this.me.buffs = P.activeBuffs(this.me).filter(b => b.src !== 'nest');
        this.me.buffs.push({ src: 'nest', stats: bonus, until: Date.now() + 20 * MIN });
        const st2 = this.stats();
        this.me.hp = st2.hp; this.me.en = st2.en;
      }
      this.sleeping = null;
      this.sleptIn = null;
      this.hits.clear();
      const home = this.me.spouse && lv >= 1 ? 'nest' : 'house';
      this.enterMap(home, null, null, true);
      const bed = this.map.objects.find(o => o.t === 'bed');
      if (bed) ({ x: this.px, y: this.py } = this.safeSpot(this.map, bed.x + bed.w + 0.5, bed.y + bed.h + 0.5));
      this.dir = 'down';
      this.fade = 1.5;
      this.dirty = true;
      this.saveNow();
      this.ui.sleepChanged?.();
      this.ui.showDayEnd?.({ day: prevDay, next: this.day, outcome, sold, earned, gold: this.me.gold, hp: w.hp, en: w.en, st, gifts, spouse: this.me.spouse?.id, bonus });
      if (this.meta && (this.meta.dayN || 0) < this.day) this.store.update('meta', { dayN: this.day }).catch(() => {});
    } finally {
      this.dayBusy = false;
    }
  }

  // ── 가판대 (각자 자기 칸) ──────────────────────────────────────────────────
  // 올려 둔 물건은 하루가 끝날 때 올린 날의 시세로 팔려 올린 사람에게 돈이 들어온다
  async stallPut(slot, n) {
    const s = this.me.inv[slot];
    if (!s) return { ok: false, msg: '빈 칸이에요' };
    if (!SHOPS.market.buys.includes(ITEMS[s.id].type)) return { ok: false, msg: '가판대에서는 팔 수 없는 물건이에요' };
    const id = s.id;
    n = Math.min(n, s.n);
    Inv.removeAt(this.me.inv, slot, n);
    const day = this.day;
    const r = await this.store.txn(`stall/${this.pid}`, cur => {
      const items = { ...(cur?.items || {}) };
      items[id] = (items[id] || 0) + n;
      return { d: day, items };
    });
    if (!r.committed) { Inv.give(this.me, id, n); return { ok: false, msg: '올리지 못했어요' }; }
    this.stall = r.value;
    this.dirty = true;
    this.ui.sfx?.('plant');
    return { ok: true, msg: `${ITEMS[id].name} ${n}개를 가판대에 올렸어요` };
  }
  async stallTake(id, n) {
    let took = 0;
    const r = await this.store.txn(`stall/${this.pid}`, cur => {
      const have = cur?.items?.[id] || 0;
      took = Math.min(have, n);
      if (!took) return undefined;
      const items = { ...cur.items, [id]: have - took };
      if (!items[id]) delete items[id];
      return Object.keys(items).length ? { ...cur, items } : null;
    });
    if (!r.committed || !took) return 0;
    this.stall = r.value;
    Inv.give(this.me, id, took);
    this.dirty = true;
    return took;
  }
  stallEstimate() {
    const items = this.stall?.items || {};
    return settleStall({ d: this.day, items }, { luk: this.stats().luk, bonus: this.shopBonus('market') });
  }
  async sellStall() {
    let got = null;
    const r = await this.store.txn(`stall/${this.pid}`, cur => { got = cur; return cur ? null : undefined; });
    if (!r.committed || !got) return { lines: [], total: 0 };
    const res = settleStall(got, { luk: this.stats().luk, bonus: this.shopBonus('market') });
    this.me.gold += res.total;
    this.stall = null;
    this.dirty = true;
    return res;
  }

  // ── 전투 ───────────────────────────────────────────────────────────────────
  spawnMonsters() {
    this.monsters = [];
    const m = this.map;
    const rnd = mulberry32(hashStr(`${m.key}:${Date.now() >> 16}`));
    for (const sp of m.spawns || []) {
      for (let i = 0; i < sp.n; i++) this.monsters.push(this.makeMonster(sp, rnd));
    }
  }
  makeMonster(sp, rnd = Math.random) {
    const M = MONSTERS[sp.kind];
    const lv = sp.lv || 0;
    const scale = 1 + lv * 0.15;
    let x = sp.x; let y = sp.y;
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2; const r = rnd() * sp.r;
      const tx = sp.x + Math.cos(a) * r; const ty = sp.y + Math.sin(a) * r;
      if (!isSolid(this.map, tx, ty)) { x = tx; y = ty; break; }
    }
    return {
      kind: sp.kind, sp, x, y, hp: Math.round(M.hp * scale), maxHp: Math.round(M.hp * scale),
      atk: Math.round(M.atk * (1 + lv * 0.1)), spd: M.spd, passive: !!M.passive, angry: !M.passive,
      dir: 'right', t: rnd() * 10, cd: 0, hitT: 0, wander: null, dead: false, respawnAt: 0, boss: !!M.boss, fly: !!M.fly,
    };
  }

  monsterFree(mo, x, y) {
    if (mo.fly) {
      // 날아다니는 몬스터는 바위·물 위로 지나가지만 벽은 못 뚫는다
      if (x < 0.5 || y < 0.5 || x > this.map.w - 0.5 || y > this.map.h - 0.5) return false;
      const t = tileAt(this.map, x, y);
      return ![T.CAVEWALL, T.RUINWALL, T.VOID, T.CLIFF, T.WALL].includes(t);
    }
    return !this.solidAt(x - 0.25, y) && !this.solidAt(x + 0.25, y) && !this.solidAt(x, y - 0.2) && !this.solidAt(x, y + 0.2);
  }

  updateMonsters(dt) {
    const now = performance.now();
    for (const mo of this.monsters) {
      if (mo.dead) {
        if (now > mo.respawnAt) Object.assign(mo, this.makeMonster(mo.sp));
        continue;
      }
      mo.t += dt;
      if (mo.hitT > 0) mo.hitT -= dt;
      if (mo.cd > 0) mo.cd -= dt;
      if (mo.kb) {
        const nx = mo.x + mo.kb.x * dt * 8; const ny = mo.y + mo.kb.y * dt * 8;
        if (this.monsterFree(mo, nx, ny)) { mo.x = nx; mo.y = ny; }
        mo.kb.t -= dt;
        if (mo.kb.t <= 0) mo.kb = null;
        continue;
      }
      const dx = this.px - mo.x; const dy = this.py - mo.y;
      const d = Math.hypot(dx, dy);
      let vx = 0; let vy = 0; let spd = mo.spd;
      if (mo.passive && !mo.angry) {
        if (d < 3) { vx = -dx / d; vy = -dy / d; spd *= 1.1; }
        else if (this.wanderStep(mo, dt)) ({ vx, vy } = mo.wander);
      } else if (d < (mo.boss ? 9 : 6.5)) {
        if (d > 0.7) { vx = dx / d; vy = dy / d; }
        if (d < 0.95 && mo.cd <= 0) this.monsterHit(mo);
      } else if (this.wanderStep(mo, dt)) ({ vx, vy } = mo.wander);
      if (vx || vy) {
        const nx = mo.x + vx * spd * dt; const ny = mo.y + vy * spd * dt;
        if (this.monsterFree(mo, nx, mo.y)) mo.x = nx;
        if (this.monsterFree(mo, mo.x, ny)) mo.y = ny;
        if (Math.abs(vx) > 0.1) mo.dir = vx < 0 ? 'left' : 'right';
        mo.moving = true;
      } else mo.moving = false;
    }
  }
  wanderStep(mo, dt) {
    if (!mo.wander || mo.wander.t <= 0) {
      const a = Math.random() * Math.PI * 2;
      const go = Math.random() < 0.55;
      mo.wander = { vx: go ? Math.cos(a) * 0.5 : 0, vy: go ? Math.sin(a) * 0.5 : 0, t: 1 + Math.random() * 2 };
      // 둥지에서 너무 멀면 돌아간다
      const hx = mo.sp.x - mo.x; const hy = mo.sp.y - mo.y; const hd = Math.hypot(hx, hy);
      if (hd > mo.sp.r + 2) { mo.wander.vx = hx / hd * 0.6; mo.wander.vy = hy / hd * 0.6; }
    }
    mo.wander.t -= dt;
    return true;
  }

  monsterHit(mo) {
    mo.cd = mo.boss ? 1.6 : 1.2;
    if (this.invuln > 0 || !mo.atk) return;
    const dmg = Math.max(1, Math.round(mo.atk - this.stats().str * 0.3));
    this.me.hp -= dmg;
    this.invuln = 0.9;
    this.floatText(`-${dmg}`, '#ff5a5a', this.px, this.py - 1.2);
    this.ui.hurt?.();
    const d = Math.hypot(this.px - mo.x, this.py - mo.y) || 1;
    this.tryMove((this.px - mo.x) / d * 0.5, 0);
    this.tryMove(0, (this.py - mo.y) / d * 0.5);
    this.dirty = true;
    if (this.me.hp <= 0) this.faint();
  }

  faint() {
    const lost = Math.min(500, Math.floor(this.me.gold * 0.1));
    this.me.gold -= lost;
    const st = this.stats();
    this.me.hp = Math.round(st.hp * 0.4);
    this.me.en = Math.max(this.me.en, Math.round(st.en * 0.3));
    this.ui.toast(`기절했어요. 집에서 깨어났어요${lost ? ` (${lost}G 잃음)` : ''}`, 'bad');
    this.enterMap('house', null, null);
  }

  attack(mo) {
    if (!this.useTool('sword', 2)) return;
    this.face(mo.x, mo.y);
    const [fx, fy] = DIR_V[this.dir];
    const st = this.stats();
    const perk = JOBS[this.me.job]?.perk || {};
    for (const m2 of this.monsters) {
      if (m2.dead) continue;
      const dx = m2.x - this.px; const dy = m2.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d > 1.6 || (d > 0.4 && (dx * fx + dy * fy) / d < 0.2)) continue;
      const crit = Math.random() < st.luk * 0.012;
      const dmg = Math.round(((this.me.tools.sword || 1) * 5 + st.str * 0.9 + st.skill('combat') * 1.5) * (1 + (perk.atk || 0)) * (0.85 + Math.random() * 0.3) * (crit ? 1.8 : 1));
      m2.hp -= dmg;
      m2.hitT = 0.25;
      m2.angry = true;
      if (!m2.boss) m2.kb = { x: dx / (d || 1), y: dy / (d || 1), t: 0.12 };
      this.floatText(crit ? `${dmg}!` : `${dmg}`, crit ? '#ffd23c' : '#ffffff', m2.x, m2.y - 1);
      if (m2.hp <= 0) this.killMonster(m2);
    }
  }

  killMonster(mo) {
    mo.dead = true;
    mo.respawnAt = performance.now() + (mo.boss ? 5 * MIN : 40000);
    const M = MONSTERS[mo.kind];
    const perk = JOBS[this.me.job]?.perk || {};
    const rnd = Math.random;
    for (const [id, ch, lo, hi] of M.drops) {
      if (rnd() < ch * (1 + (perk.loot || 0))) this.give(id, randInt(rnd, lo, hi) + (perk.loot && rnd() < perk.loot ? 1 : 0));
    }
    const gold = Math.round((M.xp * 1.5) * (1 + (mo.sp.lv || 0) * 0.1));
    this.me.gold += gold;
    this.floatText(`+${gold}G`, '#ffd23c', mo.x, mo.y - 1.6);
    this.me.stats.hunted++;
    this.gainXp('combat', M.xp * (1 + (mo.sp.lv || 0) * 0.1));
    this.sparkle(mo.x, mo.y, M.color, 10);
    if (mo.boss) this.chatSys(`${this.me.name} 님이 ${this.map.name}의 ${M.name}을(를) 쓰러뜨렸어요!`);
  }

  // ── 낚시 ───────────────────────────────────────────────────────────────────
  startFishing() {
    if (!this.useTool('rod', 2)) return;
    const [dx, dy] = DIR_V[this.dir];
    let bx = this.px + dx * 1.6; let by = this.py + dy * 1.6;
    for (let k = 1.2; k <= 2.6; k += 0.2) { const x = this.px + dx * k; const y = this.py + dy * k; if (tileAt(this.map, x, y) === T.WATER) { bx = x; by = y; break; } }
    if (tileAt(this.map, bx, by) !== T.WATER) { this.me.en += 2; return this.ui.toast('물 쪽을 바라보고 던져야 해요'); }
    const perk = JOBS[this.me.job]?.perk || {};
    const bait = Inv.count(this.me.inv, 'bait') > 0;
    if (bait) Inv.remove(this.me.inv, 'bait', 1);
    const wait = (2.2 + Math.random() * 5) * (1 - (perk.biteSpeed || 0)) * (bait ? 0.6 : 1);
    this.fishing = { state: 'cast', t: 0, wait, bx, by, bait };
    this.ui.sfx?.('cast');
  }
  updateFishing(dt) {
    const f = this.fishing;
    if (!f) return;
    f.t += dt;
    if (f.state === 'cast' && f.t > 0.45) { f.state = 'wait'; f.t = 0; this.splash(f.bx, f.by, 4); }
    else if (f.state === 'wait' && f.t > f.wait) {
      f.state = 'bite'; f.t = 0;
      if (this.settings.vibrate) navigator.vibrate?.([60, 40, 60]);
      this.ui.sfx?.('bite');
    } else if (f.state === 'bite' && f.t > 1.1) { this.fishing = null; this.ui.toast('입질을 놓쳤어요'); }
    else if (f.state === 'reel') {
      f.pos += f.vel * dt;
      if (f.pos < 0) { f.pos = 0; f.vel = Math.abs(f.vel); }
      if (f.pos > 1) { f.pos = 1; f.vel = -Math.abs(f.vel); }
      if (f.t > 6) { this.fishing = null; this.ui.toast('줄이 끊어졌어요…'); }
    }
  }
  fishPress() {
    const f = this.fishing;
    if (f.state === 'cast' || f.state === 'wait') { this.fishing = null; return this.ui.toast('낚싯대를 거뒀어요'); }
    if (f.state === 'bite') {
      const table = FISH_TABLES[this.map.fishTable] || FISH_TABLES.pond;
      const st = this.stats();
      const lv = st.skill('fish');
      const rnd = Math.random;
      const adj = table.map(([id, w]) => [id, id === 'boot' ? w : w * (1 + ((ITEMS[id].fishLv || 1) <= lv ? 0.4 : -0.3) + st.luk * 0.01 * (ITEMS[id].fishLv || 1) / 3)]);
      const fish = weighted(rnd, adj.map(([id, w]) => [id, Math.max(0.01, w)]));
      const diff = ITEMS[fish].fishLv || 1;
      const perk = JOBS[this.me.job]?.perk || {};
      const zone = Math.min(0.55, 0.16 + lv * 0.025 + st.dex * 0.006 + (perk.zone || 0) * 0.3);
      Object.assign(f, { state: 'reel', t: 0, fish, pos: 0, vel: 0.9 + diff * 0.22, zone, zoneAt: 0.2 + Math.random() * (0.8 - zone) });
      return;
    }
    if (f.state === 'reel') {
      const ok = f.pos >= f.zoneAt && f.pos <= f.zoneAt + f.zone;
      this.fishing = null;
      if (!ok) return this.ui.toast('아깝다, 물고기가 도망갔어요');
      this.give(f.fish, 1);
      this.me.stats.fished++;
      this.gainXp('fish', f.fish === 'boot' ? 2 : 6 + (ITEMS[f.fish].fishLv || 1) * 4);
      this.splash(f.bx, f.by, 8);
      this.ui.caught?.(f.fish);
    }
  }

  // ── NPC ────────────────────────────────────────────────────────────────────
  npcList() {
    const out = [];
    const now = Date.now();
    for (const n of this.map.npcs || []) {
      let x = n.x; let y = n.y; let dir = 'down'; let moving = false;
      if (n.route) {
        // 경로를 따라 걷다 모퉁이마다 잠깐 쉰다 — 시계로 계산하므로 모두 같은 위치를 본다
        const pts = n.route;
        const segs = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
        const pause = 2.5;
        const total = segs.reduce((a, s) => a + s.len / n.speed + pause, 0);
        let tt = ((now / 1000) + hashStr(n.id) % 100) % total;
        for (const s of segs) {
          const dur = s.len / n.speed;
          if (tt < dur) {
            const k = tt / dur;
            x = s.p[0] + (s.q[0] - s.p[0]) * k; y = s.p[1] + (s.q[1] - s.p[1]) * k;
            const dx = s.q[0] - s.p[0]; const dy = s.q[1] - s.p[1];
            dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
            moving = true;
            break;
          }
          tt -= dur;
          if (tt < pause) { x = s.q[0]; y = s.q[1]; break; }
          tt -= pause;
        }
      }
      if (!moving && Math.hypot(this.px - x, this.py - y) < 3) {
        const dx = this.px - x; const dy = this.py - y;
        dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      }
      out.push({ ...n, x, y, dir, moving, data: NPCS[n.id] });
    }
    return out;
  }

  talk(npcId) {
    const f = this.me.friends[npcId] || (this.me.friends[npcId] = { pts: 0, day: 0, gift: 0 });
    let first = false;
    if (f.day !== this.day) { f.day = this.day; f.pts += 10; first = true; this.dirty = true; }
    // 말을 걸 때마다 인사가 달라진다 (가끔 이스터에그)
    const wed = this.me.spouse?.id === npcId && MARRIED[npcId];
    const line = wed ? wed.lines[Math.floor(Math.random() * wed.lines.length)].replaceAll('{name}', this.me.name) : greeting(npcId, Math.random, Date.now(), this.me.name);
    return { line, hearts: Math.min(10, Math.floor(f.pts / 50)), first };
  }
  // 취향에 따라 친밀도가 달라진다 (아주 좋아함 · 좋아함 · 보통 · 싫어함)
  tasteOf(npcId, itemId) {
    const t = NPC_TASTE[npcId];
    if (!t) return 'neutral';
    const it = ITEMS[itemId];
    const hit = list => (list || []).some(k => k === itemId || k === `type:${it?.type}`);
    if (hit(t.love)) return 'love';
    if (hit(t.dislike)) return 'dislike';
    if (hit(t.like)) return 'like';
    return 'neutral';
  }
  gift(npcId, slot) {
    const s = this.me.inv[slot];
    if (!s) return null;
    const f = this.me.friends[npcId] || (this.me.friends[npcId] = { pts: 0, day: 0, gift: 0 });
    if (f.gift === this.day) return { ok: false, msg: '오늘은 이미 선물했어요. 내일 또 주세요' };
    const it = ITEMS[s.id];
    Inv.removeAt(this.me.inv, slot, 1);
    f.gift = this.day;
    const taste = this.tasteOf(npcId, s.id);
    const pts = TASTE_POINTS[taste] + (taste === 'neutral' ? Math.min(20, Math.round(it.price / 30)) : 0);
    f.pts = Math.max(0, f.pts + pts);
    (f.known ||= {})[s.id] = taste;
    this.dirty = true;
    const line = {
      love: `"${it.name}! 이거 정말 좋아해요. 어떻게 알았어요?"`,
      like: `"${it.name}, 고마워요. 잘 쓸게요."`,
      neutral: `"${it.name}이네요. 고마워요."`,
      dislike: `"음… ${it.name}은(는) 별로예요."`,
    }[taste];
    return { ok: taste !== 'dislike', taste, msg: `${NPCS[npcId].name}: ${line} (친밀도 ${pts > 0 ? '+' : ''}${pts})` };
  }
  hearts(npcId) { return Math.min(10, Math.floor((this.me.friends[npcId]?.pts || 0) / 50)); }

  // ── 대화하기 (연애 시뮬레이션풍) ─────────────────────────────────────────
  friendOf(npcId) { return this.me.friends[npcId] || (this.me.friends[npcId] = { pts: 0, day: 0, gift: 0 }); }
  dateScene(npcId) {
    const f = this.friendOf(npcId);
    this.dateTurns ||= {};
    const k = `${npcId}:${this.day}`;
    const n = f.dated === this.day ? (this.dateTurns[k] = (this.dateTurns[k] || 0) + 1) : 0;
    const scene = pickScene(npcId, f, this.day, n, { married: this.me.spouse?.id === npcId });
    if (!scene) return null;
    const name = this.me.name;
    const sub = t => t.replaceAll('{name}', name);
    return {
      ...scene,
      lines: scene.lines.map(sub),
      ask: scene.ask ? sub(scene.ask) : '',
      choices: scene.choices.map(([t, pts, reply, emote]) => [sub(t), pts, sub(reply), emote]),
      counts: countsToday(f, scene, this.day),
    };
  }
  // ── 결혼 ───────────────────────────────────────────────────────────────────
  setGender(g) {
    if (this.me.spouse || !['m', 'f'].includes(g)) return;
    this.me.gender = g;
    this.dirty = true;
  }
  proposeCheck(npcId) { return canPropose(this.me, npcId, Inv.count(this.me.inv, 'ring') > 0); }
  propose(npcId) {
    const chk = this.proposeCheck(npcId);
    if (!chk.ok) return { ok: false, msg: chk.why };
    Inv.remove(this.me.inv, 'ring', 1);
    this.me.spouse = { id: npcId, day: this.day };
    this.me.nest ||= { lv: 0 };
    this.dirty = true;
    this.saveNow();
    this.chatSys(`${this.me.name} 님과 ${NPCS[npcId].name}이(가) 결혼했어요! 축하해 주세요`);
    const name = this.me.name;
    return { ok: true, lines: MARRIED[npcId].accept.map(t => t.replaceAll('{name}', name)) };
  }
  // 신혼집 짓기 · 키우기 (내 가방과 돈으로)
  nestNext() { return NEST_LEVELS[this.nestLv() + 1] || null; }
  nestUpgrade() {
    if (!this.me.spouse) return { ok: false, msg: '결혼하면 신혼집을 지을 수 있어요' };
    const next = this.nestNext();
    if (!next) return { ok: false, msg: '이미 최고 단계예요' };
    if (this.me.gold < next.cost.gold) return { ok: false, msg: '골드가 부족해요' };
    if (!Inv.hasAll(this.me.inv, next.cost.items)) return { ok: false, msg: '재료가 부족해요' };
    Inv.removeAll(this.me.inv, next.cost.items);
    this.me.gold -= next.cost.gold;
    this.me.nest = { ...(this.me.nest || {}), lv: this.nestLv() + 1 };
    this.dirty = true;
    this.saveNow();
    if (this.map.id === 'nest_yard' || this.map.id === 'nest') this.enterMap(this.map.id, this.px, this.py, true);
    this.ui.sfx?.('discover');
    return { ok: true, msg: `${next.name}이(가) 되었어요! ${next.perks}` };
  }

  dateChoose(scene, idx) {
    const f = this.friendOf(scene.npcId);
    const r = chooseDate(f, scene, idx, this.day);
    if (!r) return null;
    this.dirty = true;
    this.ui.sfx?.(r.gain > 0 ? 'harvest' : r.gain < 0 ? 'error' : 'click');
    if (r.up) this.ui.sfx?.('levelup');
    return r;
  }

  petCry(n) {
    const pet = PETS[n.pet];
    if (!pet) return;
    this.petBubble = { id: n.id, text: pet.cry, until: Date.now() + 1800 };
    this.particles(n.x, n.y - 0.8, '#ff8ac0', 5, 1.2, 1.5, 0.8, 2);
    this.ui.sfx?.(pet.sound);
  }
  // 양동이를 든 채 물가를 누르면 물을 뜬다
  fillBucket() {
    const slot = this.selected;
    const s = this.me.inv[slot];
    if (s?.id !== 'bucket') return;
    Inv.removeAt(this.me.inv, slot, 1);
    this.give('water_bucket', 1);
    const w = this.me.inv.findIndex(x => x?.id === 'water_bucket');
    if (!this.me.inv[slot] && w >= 0) this.select(w);
    this.action = { tool: 'hand', until: performance.now() + 250 };
    const [dx, dy] = DIR_V[this.dir];
    this.splash(this.px + dx * 1.2, this.py + dy * 1.2, 8);
    this.ui.sfx?.('can');
    this.ui.toast('물 양동이를 채웠어요. 정수기에 끼우면 커피 10잔을 내릴 수 있어요', 'good');
    this.dirty = true;
  }

  // ── 정수기 (집 가구) ──────────────────────────────────────────────────────
  purifier(fid) { return this.house.furniture?.[fid] || null; }
  async purifierTxn(fid, fn) {
    let out = null;
    const r = await this.store.txn(`house/furniture/${fid}`, cur => {
      if (!cur || !ITEMS[cur.i]?.purifier) return undefined;
      out = fn(cur, Date.now());
      return out?.next || undefined;
    });
    return r.committed ? out : null;
  }
  async purifierLoad(fid) {
    if (Inv.count(this.me.inv, 'water_bucket') < 1) return { ok: false, msg: '물 양동이가 없어요. 양동이를 들고 물가를 누르면 떠 와요' };
    const f = this.purifier(fid);
    if (Brew.brewState(f, Date.now()).w > 0) return { ok: false, msg: '아직 물이 남아 있어요' };
    Inv.remove(this.me.inv, 'water_bucket', 1);
    const res = await this.purifierTxn(fid, (cur, now) => ({ next: Brew.loadWater(cur, now) }));
    if (!res?.next) { Inv.give(this.me, 'water_bucket', 1); return { ok: false, msg: '물을 채우지 못했어요' }; }
    Inv.give(this.me, 'bucket', 1); // 빈 양동이는 돌려받는다
    this.dirty = true;
    this.ui.sfx?.('can');
    return { ok: true, msg: '물 양동이를 끼웠어요. 커피 10잔을 내릴 수 있어요' };
  }
  async purifierBrew(fid, n) {
    n = Math.min(n, Inv.count(this.me.inv, 'coffee_bean'));
    if (n <= 0) return { ok: false, msg: '커피콩이 없어요' };
    Inv.remove(this.me.inv, 'coffee_bean', n);
    const res = await this.purifierTxn(fid, (cur, now) => Brew.addBeans(cur, n, now));
    const used = res?.used || 0;
    if (used < n) Inv.give(this.me, 'coffee_bean', n - used);
    if (!used) return { ok: false, msg: '물이 없어요. 물 양동이를 먼저 끼워 주세요' };
    this.dirty = true;
    this.ui.sfx?.('plant');
    return { ok: true, msg: `커피콩 ${used}개를 넣었어요. 한 잔에 30초씩 내려요` };
  }
  async purifierTake(fid) {
    const res = await this.purifierTxn(fid, (cur, now) => Brew.takeCups(cur, now));
    if (!res?.cups) return { ok: false, msg: '아직 다 내린 커피가 없어요' };
    this.give('coffee', res.cups);
    this.ui.sfx?.('harvest');
    return { ok: true, msg: `커피 ${res.cups}잔을 꺼냈어요` };
  }
  purifierCount() { return Object.values(this.house.furniture || {}).filter(f => ITEMS[f.i]?.purifier).length; }

  enterDoor(o) {
    const w = this.map.warps.find(q => q.x === o.door.x && q.y === o.door.y);
    if (w) this.takeWarp(w);
  }

  // ── 가방 ───────────────────────────────────────────────────────────────────
  selectedItem() { const s = this.me.inv[this.selected]; return s ? ITEMS[s.id] : null; }
  select(i) { this.selected = i; this.ui.refresh?.('hotbar'); }
  useSlot(i) {
    const s = this.me.inv[i];
    if (!s) return;
    const it = ITEMS[s.id];
    if (it.type === 'food') {
      if (it.caffeine && this.hasCaffeine()) return this.ui.toast('오늘은 이미 커피를 마셨어요. 커피는 하루 한 잔이에요', 'bad');
      const r = P.eat(this.me, i);
      if (r.ok && it.caffeine) {
        this.me.caff = this.day;
        this.pubNow();
        r.msg = '커피 한 잔! 오늘은 새벽 2시까지 거뜬해요';
      }
      this.ui.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) this.sparkle(this.px, this.py - 1, '#ff8ac0', 6);
    } else if (it.type === 'cloth') {
      const r = P.equip(this.me, i);
      this.ui.toast(r.msg, r.ok ? 'good' : 'bad');
      this.pubNow();
    } else if (it.type === 'furniture') {
      if (this.map.id !== 'house') return this.ui.toast('가구는 집 안에서 놓을 수 있어요');
      this.startDecor(i);
    } else if (it.type === 'seed') {
      this.select(i);
      this.ui.toast('갈아 둔 밭을 누르면 심어요');
    } else this.select(i);
    this.dirty = true;
    this.ui.refresh?.();
  }
  unequip(slot) { P.unequip(this.me, slot); this.dirty = true; this.pubNow(); this.ui.refresh?.(); }
  moveSlot(a, b) { Inv.move(this.me.inv, a, b); this.dirty = true; }
  sortBag() { Inv.sortInv(this.me.inv); this.dirty = true; }
  trashSlot(i) { this.me.inv[i] = null; this.dirty = true; }
  takeFromStash(id, n) {
    const have = this.me.stash[id] || 0;
    n = Math.min(n, have);
    const left = Inv.add(this.me.inv, id, n);
    const moved = n - left;
    this.me.stash[id] = have - moved;
    if (!this.me.stash[id]) delete this.me.stash[id];
    this.dirty = true;
    return moved;
  }
  // ── 방치 창고 ──────────────────────────────────────────────────────────────
  // idleAt 이후로 고른 활동의 수확물이 계속 쌓인다(접속 중에도, 꺼 둔 동안에도). 상한은 집 레벨에 따라 8/16시간.
  idleCapMs() { return idleCapHours(this.house.level) * REAL_HOUR; }
  idleNow(now = Date.now()) {
    const since = this.me.idleAt || now;
    return computeIdle(this.me, now - since, { seed: hashStr(`${this.pid}:${since}`), houseLv: this.house.level });
  }
  idleFill(now = Date.now()) { return Math.min(1, (now - (this.me.idleAt || now)) / this.idleCapMs()); }
  collectIdle() {
    const r = this.idleNow();
    if (!r || !r.items.length) return null;
    let stashed = 0;
    for (const [id, n] of r.items) stashed += Inv.give(this.me, id, n);
    this.gainXp(r.skill, r.xp);
    this.me.idleAt = Date.now();
    this.dirty = true;
    this.saveNow();
    return { ...r, stashed };
  }
  setIdleJob(j) {
    if (!IDLE_JOBS[j] || j === this.me.idle) return;
    this.collectIdle(); // 바꾸기 전까지 쌓인 것은 먼저 받는다
    this.me.idle = j;
    this.me.idleAt = Date.now();
    this.dirty = true;
  }

  // ── 밭 일꾼 ────────────────────────────────────────────────────────────────
  helperActive(now = Date.now()) { return (this.helper?.until || 0) > now; }
  // 일꾼이 일하는 동안 밭은 늘 촉촉하다 (고용 전에 심은 작물은 고용한 뒤부터)
  effPlot(p) {
    if (!p || !this.helper?.until) return p;
    return { ...p, wetUntil: Math.max(p.wetUntil || 0, this.helper.until) };
  }
  isLeader() {
    const online = Object.entries(this.players).filter(([, o]) => o.online).map(([pid]) => pid);
    return [this.pid, ...online].sort()[0] === this.pid;
  }
  async hireHelper(i) {
    const plan = HELPER_PLANS[i];
    if (!plan) return { ok: false, msg: '잘못된 선택이에요' };
    if (this.me.gold < plan.gold) return { ok: false, msg: '골드가 부족해요' };
    this.me.gold -= plan.gold;
    const now = Date.now();
    const r = await this.store.txn('helper', cur => ({ until: Math.max(now, cur?.until || 0) + plan.hours * REAL_HOUR, by: this.me.name }));
    if (!r.committed) { this.me.gold += plan.gold; return { ok: false, msg: '고용하지 못했어요. 다시 시도해 주세요' }; }
    this.helper = r.value;
    this.dirty = true;
    this.chatSys(`${this.me.name} 님이 밭 일꾼을 ${plan.hours}시간 고용했어요`);
    return { ok: true, msg: `밭 일꾼이 ${plan.hours}시간 동안 물을 주고, 다 자란 작물을 거둬 공용 보관함에 넣어요` };
  }
  async helperTick() {
    const now = Math.min(Date.now(), this.helper.until);
    const got = {};
    for (let i = 0; i < this.plotLimit(); i++) {
      const p = this.farm[i];
      if (!p?.crop) continue;
      if (Farm.rawProgress(this.effPlot(p), now, this.plotBonus(p)) < 1) continue;
      let res = null;
      const r = await this.store.txn(`farm/${i}`, cur => {
        if (!cur?.crop) return undefined;
        res = Farm.helperHarvest(this.effPlot(cur), now, mulberry32(hashStr(`h${i}:${cur.at}`)), this.plotBonus(cur));
        return res ? { ...res.plot, wetUntil: cur.wetUntil || 0 } : undefined;
      });
      if (r.committed && res) got[res.item] = (got[res.item] || 0) + res.n;
    }
    const ids = Object.keys(got);
    if (!ids.length) return;
    await this.store.txn('chest', cur => {
      const next = { ...(cur || {}) };
      for (const id of ids) next[id] = (next[id] || 0) + got[id];
      return next;
    });
    this.chatSys(`밭 일꾼이 ${ids.map(id => `${ITEMS[id].name} ${got[id]}개`).join(', ')}를 거둬 공용 보관함에 넣었어요`);
  }

  // ── 숲지기 두리: 베어 낸 나무·바위 되살리기 ────────────────────────────────
  async regrowInfo() {
    const out = [];
    for (const id of ['farm', 'town', 'lake', 'forest', 'mine_gate']) {
      const m = getMap(id, this.mapCtx());
      const nodes = (await this.store.get(`nodes/${m.key}`)) || {};
      const gone = m.objects.filter(o => o.nid && ['tree', 'rock', 'boulder', 'crystal'].includes(o.t) && (nodes[o.nid] || 0) >= GONE).length;
      out.push({ id, name: m.name, gone, cost: gone ? Math.max(REGROW_COST.min, gone * REGROW_COST.perNode) : 0 });
    }
    return out;
  }
  async regrow(mapId) {
    const m = getMap(mapId, this.mapCtx());
    const info = (await this.regrowInfo()).find(x => x.id === mapId);
    if (!info?.gone) return { ok: false, msg: '되살릴 것이 없어요' };
    if (this.me.gold < info.cost) return { ok: false, msg: `골드가 부족해요 (${info.cost}G 필요)` };
    this.me.gold -= info.cost;
    const kinds = new Set(m.objects.filter(o => o.nid && ['tree', 'rock', 'boulder', 'crystal'].includes(o.t)).map(o => o.nid));
    const r = await this.store.txn(`nodes/${m.key}`, cur => {
      const next = { ...(cur || {}) };
      for (const [k, v] of Object.entries(next)) if (v >= GONE && kinds.has(k)) delete next[k];
      return next;
    });
    if (!r.committed) { this.me.gold += info.cost; return { ok: false, msg: '되살리지 못했어요' }; }
    this.dirty = true;
    this.chatSys(`숲지기 두리가 ${m.name}의 나무와 바위 ${info.gone}개를 되살렸어요`);
    return { ok: true, msg: `${m.name}의 나무와 바위 ${info.gone}개가 되살아났어요 (-${info.cost}G)` };
  }

  // ── 제작 ───────────────────────────────────────────────────────────────────
  craft(recipeId) {
    const r = RECIPES.find(x => x.id === recipeId);
    const res = doCraft(this.me, r);
    if (res.ok) {
      for (const u of res.ups || []) this.ui.levelUp?.(u);
      this.floatItem(res.item, res.n);
      this.dirty = true;
    }
    return res;
  }
  canCraft(recipeId) { return canCraft(this.me, RECIPES.find(x => x.id === recipeId)); }
  // 최대 n번 만든다 (재료가 떨어지면 거기서 멈춤)
  craftMany(recipeId, n) {
    let made = 0; let times = 0; let item = null; let last = null;
    for (let i = 0; i < n; i++) {
      const res = this.craft(recipeId);
      if (!res.ok) { last = res; break; }
      times++; made += res.n; item = res.item;
    }
    if (!times) return last || { ok: false, msg: '만들 수 없어요' };
    return { ok: true, item, n: made, times, msg: `${ITEMS[item].name} ${made}개를 만들었어요${times < n && last ? ` (재료가 떨어져 ${times}번만)` : ''}` };
  }
  maxCraftable(recipeId) {
    const r = RECIPES.find(x => x.id === recipeId);
    const chk = canCraft(this.me, r);
    if (!chk.ok) return 0;
    return Math.max(1, Math.min(...chk.inputs.map(([id, n]) => Math.floor(Inv.count(this.me.inv, id) / n))));
  }

  // ── 시장 ───────────────────────────────────────────────────────────────────
  shopBonus(shop) { const npc = SHOPS[shop]?.npc; return npc ? this.hearts(npc) * 0.02 : 0; }
  priceOf(id, shop) { return Math.round(sellPrice(id, this.day, this.stats().luk) * (1 + this.shopBonus(shop))); }
  sell(slot, n, shop) {
    const s = this.me.inv[slot];
    if (!s) return;
    n = Math.min(n, s.n);
    const price = this.priceOf(s.id, shop) * n;
    Inv.removeAt(this.me.inv, slot, n);
    this.me.gold += price;
    this.dirty = true;
    this.ui.sfx?.('coin');
    return price;
  }
  buy(id, n) {
    const cost = buyPrice(id) * n;
    if (this.me.gold < cost) return { ok: false, msg: '골드가 부족해요' };
    if (!Inv.canAdd(this.me.inv, id, n)) return { ok: false, msg: '가방에 자리가 없어요' };
    this.me.gold -= cost;
    Inv.add(this.me.inv, id, n);
    this.dirty = true;
    this.ui.sfx?.('coin');
    return { ok: true, msg: `${ITEMS[id].name} ${n}개 구입 (-${cost}G)` };
  }
  upgradeTool(tool) {
    const tier = this.me.tools[tool] || 1;
    const cost = TOOL_UPGRADE[tier];
    if (!cost) return { ok: false, msg: '이미 최고 단계예요' };
    if (this.me.gold < cost.gold) return { ok: false, msg: '골드가 부족해요' };
    if (!Inv.hasAll(this.me.inv, cost.items)) return { ok: false, msg: '재료가 부족해요' };
    Inv.removeAll(this.me.inv, cost.items);
    this.me.gold -= cost.gold;
    this.me.tools[tool] = tier + 1;
    this.dirty = true;
    return { ok: true, msg: `${TOOLS[tool].name}이(가) ${TOOL_TIERS[tier + 1]} 단계가 되었어요` };
  }

  // ── 오늘의 부탁 ────────────────────────────────────────────────────────────
  requests() { return dailyRequests(this.code, this.day); }
  deliver(req) {
    const k = `req-${req.key}`;
    if (this.me.done[k]) return { ok: false, msg: '이미 완료했어요' };
    if (!Inv.remove(this.me.inv, req.id, req.n)) return { ok: false, msg: '물건이 모자라요' };
    this.me.done[k] = 1;
    this.me.gold += req.reward;
    const f = this.me.friends.mayor || (this.me.friends.mayor = { pts: 0, day: 0, gift: 0 });
    f.pts += 25;
    this.dirty = true;
    this.chatSys(`${this.me.name} 님이 마을 부탁(${ITEMS[req.id].name} ${req.n}개)을 해결했어요`);
    return { ok: true, msg: `부탁 완료! +${req.reward}G` };
  }

  // ── 집 키우기 (모두 함께) ──────────────────────────────────────────────────
  async donate(id, n) {
    if (id === 'gold') {
      if (this.me.gold < n) return { ok: false, msg: '골드가 부족해요' };
      this.me.gold -= n;
    } else if (!Inv.remove(this.me.inv, id, n)) return { ok: false, msg: '물건이 부족해요' };
    const r = await this.store.txn('house', cur => {
      const h = { level: 1, furniture: {}, contrib: {}, ...(cur || {}) };
      h.fund = { gold: 0, items: {}, ...(h.fund || {}) };
      h.fund.items = { ...(h.fund.items || {}) };
      if (id === 'gold') h.fund.gold += n; else h.fund.items[id] = (h.fund.items[id] || 0) + n;
      h.contrib = { ...(h.contrib || {}) };
      h.contrib[this.pid] = { n: this.me.name, v: (h.contrib[this.pid]?.v || 0) + (id === 'gold' ? n : ITEMS[id].price * n) };
      return h;
    });
    if (!r.committed) {
      if (id === 'gold') this.me.gold += n; else Inv.give(this.me, id, n);
      return { ok: false, msg: '기부하지 못했어요. 다시 시도해 주세요' };
    }
    this.dirty = true;
    this.saveNow();
    return { ok: true, msg: `집 키우기에 ${id === 'gold' ? `${n}G` : `${ITEMS[id].name} ${n}개`}를 보탰어요` };
  }
  houseNeeds() {
    const next = HOUSE_LEVELS[this.house.level + 1];
    if (!next) return null;
    const fund = this.house.fund || { gold: 0, items: {} };
    return {
      next, lv: this.house.level + 1,
      gold: { need: next.cost.gold, have: fund.gold || 0 },
      items: next.cost.items.map(([id, n]) => ({ id, need: n, have: fund.items?.[id] || 0 })),
    };
  }
  async levelUpHouse() {
    let ok = false;
    const r = await this.store.txn('house', cur => {
      const h = { level: 1, furniture: {}, contrib: {}, ...(cur || {}) };
      const next = HOUSE_LEVELS[(h.level || 1) + 1];
      if (!next) return undefined;
      const fund = { gold: 0, items: {}, ...(h.fund || {}) };
      if ((fund.gold || 0) < next.cost.gold) return undefined;
      if (!next.cost.items.every(([id, n]) => (fund.items?.[id] || 0) >= n)) return undefined;
      const items = { ...fund.items };
      for (const [id, n] of next.cost.items) { items[id] -= n; if (!items[id]) delete items[id]; }
      ok = true;
      return { ...h, level: (h.level || 1) + 1, fund: { gold: fund.gold - next.cost.gold, items } };
    });
    if (r.committed && ok) {
      this.chatSys(`집이 "${HOUSE_LEVELS[r.value.level].name}"(으)로 커졌어요!`);
      return { ok: true, msg: `${HOUSE_LEVELS[r.value.level].name}(으)로 커졌어요. ${HOUSE_LEVELS[r.value.level].perks}` };
    }
    return { ok: false, msg: '아직 재료가 모자라요' };
  }

  // ── 공용 보관함 ────────────────────────────────────────────────────────────
  async chestPut(slot, n) {
    const s = this.me.inv[slot];
    if (!s) return;
    const id = s.id;
    n = Math.min(n, s.n);
    Inv.removeAt(this.me.inv, slot, n);
    const r = await this.store.txn('chest', cur => ({ ...(cur || {}), [id]: ((cur || {})[id] || 0) + n }));
    if (!r.committed) Inv.give(this.me, id, n);
    this.dirty = true;
  }
  async chestTake(id, n) {
    let took = 0;
    const room = Math.min(n, Inv.roomFor(this.me.inv, id));
    if (room <= 0) { this.ui.toast('가방에 자리가 없어요', 'bad'); return; }
    const r = await this.store.txn('chest', cur => {
      const have = cur?.[id] || 0;
      took = Math.min(have, room);
      if (!took) return undefined;
      const next = { ...cur, [id]: have - took };
      if (!next[id]) delete next[id];
      return next;
    });
    if (r.committed && took) { Inv.give(this.me, id, took); this.dirty = true; }
  }

  // ── 순간이동 ───────────────────────────────────────────────────────────────
  teleport(wp) {
    const info = waypointInfo(wp);
    if (!info || !this.waypoints[wp]) return this.ui.toast('아직 깨우지 않은 석상이에요');
    if (!P.spendEn(this.me, 3)) return this.ui.toast('기력이 부족해요', 'bad');
    const m = getMap(info.map, this.mapCtx());
    const o = m.objects.find(q => q.t === 'waypoint' && q.wp === wp);
    const x = info.x ?? (o ? o.x + 0.5 : null);
    const y = info.y ?? (o ? o.y + 1.6 : null);
    this.sparkle(this.px, this.py - 0.5, '#7ae8ff', 12);
    this.enterMap(info.map, x, y);
    this.sparkle(this.px, this.py - 0.5, '#7ae8ff', 12);
    this.ui.sfx?.('teleport');
  }

  // ── 꾸미기 ─────────────────────────────────────────────────────────────────
  // 한 칸에 러그와 의자처럼 여러 가구가 겹칠 수 있다
  furnitureListAt(x, y) {
    const out = [];
    for (const [fid, f] of Object.entries(this.house.furniture || {})) {
      const it = ITEMS[f.i];
      if (it && x >= f.x && x < f.x + it.w && y >= f.y && y < f.y + it.h) out.push({ ...f, fid });
    }
    return out;
  }
  // 위에 놓인 가구 우선 (러그보다 의자)
  furnitureAt(x, y) {
    const list = this.furnitureListAt(x, y);
    return list.find(f => !ITEMS[f.i].floor) || list[0] || null;
  }
  furnitureSolidAt(x, y) {
    return this.furnitureListAt(x, y).some(f => !ITEMS[f.i].floor);
  }
  startDecor(slot = null) {
    if (this.map.id !== 'house') return this.ui.toast('집 안에서만 꾸밀 수 있어요');
    this.decor = { slot, ghost: null };
    this.path = null;
    this.ui.refresh?.('decor');
  }
  stopDecor() { this.decor = null; this.ui.refresh?.('decor'); }
  canPlace(id, x, y) {
    const it = ITEMS[id];
    const d = this.map.decor;
    if (x < d.x || y < d.y || x + it.w > d.x + d.w || y + it.h > d.y + d.h) return false;
    for (let j = y; j < y + it.h; j++) for (let i = x; i < x + it.w; i++) {
      if (isSolid(this.map, i + 0.5, j + 0.5)) return false;
      // 러그 위에 의자는 되지만 같은 층끼리는 겹치지 않게
      if (this.furnitureListAt(i, j).some(f => !!ITEMS[f.i].floor === !!it.floor)) return false;
      if (Math.abs(i + 0.5 - this.map.door.x - 0.5) < 1 && j >= this.map.door.y - 2) return false;
      if (!it.floor && Math.floor(this.px) === i && Math.floor(this.py) === j) return false;
    }
    return true;
  }
  async decorTap(wx, wy) {
    const x = Math.floor(wx); const y = Math.floor(wy);
    const d = this.decor;
    if (d.slot == null) {
      // 가구 집어 들기
      const f = this.furnitureAt(x, y);
      if (!f) return this.ui.toast('옮길 가구를 누르거나, 가방에서 가구를 고르세요');
      if (ITEMS[f.i]?.purifier) {
        const st = Brew.brewState(f, Date.now());
        if (st.b || st.r) return this.ui.toast('커피를 내리는 중이에요. 다 내린 뒤 꺼내고 옮겨 주세요', 'bad');
        if (st.w) this.ui.toast('정수기에 남아 있던 물은 쏟아졌어요');
      }
      const r = await this.store.txn(`house/furniture/${f.fid}`, cur => (cur ? null : undefined));
      if (r.committed) { Inv.give(this.me, f.i, 1); this.dirty = true; this.ui.toast(`${ITEMS[f.i].name}을(를) 가방에 넣었어요`); this.ui.refresh?.('decor'); }
      return;
    }
    const s = this.me.inv[d.slot];
    if (!s || ITEMS[s.id].type !== 'furniture') { d.slot = null; return this.ui.refresh?.('decor'); }
    const it = ITEMS[s.id];
    if (it.purifier && this.purifierCount() >= purifierLimit(this.house.level)) {
      return this.ui.toast(`정수기는 지금 ${purifierLimit(this.house.level)}개까지 놓을 수 있어요 (집 6·11·16…단계마다 1개 더)`, 'bad');
    }
    const px = x - Math.floor((it.w - 1) / 2);
    const py = y - Math.floor((it.h - 1) / 2);
    if (!this.canPlace(s.id, px, py)) { d.ghost = { id: s.id, x: px, y: py, bad: true }; return this.ui.toast('여기엔 놓을 수 없어요'); }
    const id = s.id;
    Inv.removeAt(this.me.inv, d.slot, 1);
    const fid = `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    await this.store.set(`house/furniture/${fid}`, { i: id, x: px, y: py, by: this.me.name });
    this.dirty = true;
    this.sparkle(px + it.w / 2, py + it.h / 2, '#ffd23c', 8);
    if (!this.me.inv[d.slot]) d.slot = null;
    this.ui.refresh?.('decor');
  }

  // ── 소통 ───────────────────────────────────────────────────────────────────
  async sendChat(text) {
    const t = String(text || '').trim().slice(0, 60);
    if (!t) return;
    const now = Date.now();
    this.myBubble = { text: t, until: now + 4000 };
    this.pubExtra = { e: t, et: now };
    this.pubNow();
    await this.store.txn('chat', cur => {
      let list = [];
      try { list = cur ? JSON.parse(cur) : []; } catch { list = []; }
      list.push({ k: `${now}${Math.random()}`.slice(0, 20), p: this.pid, n: this.me.name, t, at: now });
      return JSON.stringify(list.slice(-40));
    });
  }
  async chatSys(t) {
    const now = Date.now();
    await this.store.txn('chat', cur => {
      let list = [];
      try { list = cur ? JSON.parse(cur) : []; } catch { list = []; }
      list.push({ k: `${now}${Math.random()}`.slice(0, 20), p: this.pid, sys: 1, t, at: now });
      return JSON.stringify(list.slice(-40));
    }).catch(() => {});
  }
  wave(pid) {
    const o = this.players[pid];
    this.sendChat(`${o?.pub?.n || ''} 안녕!`);
  }

  // ── 저장 · 전송 ────────────────────────────────────────────────────────────
  pubData() {
    return {
      n: this.me.name, j: this.me.job, l: P.lookOf(this.me), m: this.map.id,
      x: Math.round(this.px * 100) / 100, y: Math.round(this.py * 100) / 100, d: this.dir,
      mv: this.moving ? 1 : 0, a: this.action && this.action.until > performance.now() ? this.action.tool : '', at: this.action ? this.me.tools[this.action.tool] || 0 : 0,
      t: Date.now(), on: 1, lv: P.totalLevel(this.me), z: this.sleeping === 'bed' ? 1 : this.sleeping ? 2 : 0, cf: this.me.caff || 0,
      ...(this.pubExtra || {}),
    };
  }
  pubSoon() {
    const now = performance.now();
    if (now - this.lastPub < PUB_MS) return;
    this.pubNow();
  }
  pubNow() {
    this.lastPub = performance.now();
    this.store.set(`pub/${this.pid}`, this.pubData()).catch(() => {});
  }
  saveNow() {
    if (!this.map) return;
    this.me.x = Math.round(this.px * 100) / 100;
    this.me.y = Math.round(this.py * 100) / 100;
    this.me.lastSeen = Date.now();
    this.lastSave = Date.now();
    this.dirty = false;
    const json = JSON.stringify(this.me);
    this.store.set(`players/${this.pid}`, json).catch(err => console.warn('save', err));
    this.pubNow();
    this.ui.backup?.(this.me);
    this.ui.saved?.();
  }

  // ── 연출 ───────────────────────────────────────────────────────────────────
  floatText(text, color = '#fff', x = this.px, y = this.py - 1.3) {
    this.fx.push({ k: 'text', text, color, x, y, t: 0, life: 1.1 });
  }
  floatItem(id, n) { this.fx.push({ k: 'item', id, n, x: this.px, y: this.py - 1.4, t: 0, life: 1.2 }); }
  particles(x, y, color, n, spd = 2, up = 2, life = 0.6, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.push({ k: 'p', x, y, vx: Math.cos(a) * spd * Math.random(), vy: Math.sin(a) * spd * Math.random() - up, color, t: 0, life: life * (0.6 + Math.random() * 0.6), size });
    }
  }
  sparkle(x, y, color = '#ffd23c', n = 8) { this.particles(x, y, color, n, 2.2, 1.5, 0.7); }
  dust(x, y) { this.particles(x, y, '#c8a070', 6, 1.5, 0.8, 0.45); }
  chips(x, y) { this.particles(x, y, '#a8a8b0', 6, 2.5, 1.5, 0.5); }
  leaves(x, y) { this.particles(x, y, '#5aa04a', 5, 1.8, 0.4, 0.8); }
  splash(x, y, n = 6) { this.particles(x, y, '#cdeeff', n, 1.6, 2.4, 0.5); }
  updateFx(dt) {
    for (const f of this.fx) {
      f.t += dt;
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 6 * dt; }
      else f.y -= dt * 0.9;
    }
    this.fx = this.fx.filter(f => f.t < f.life);
    if (this.marker) { this.marker.t -= dt; if (this.marker.t <= 0) this.marker = null; }
    if (this.shakeObj) { this.shakeObj.t -= dt; if (this.shakeObj.t <= 0) this.shakeObj = null; }
  }
  updateOthers(dt) {
    for (const o of Object.values(this.players)) {
      if (!o.pub) continue;
      const dx = o.pub.x - o.x; const dy = o.pub.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) { o.x = o.pub.x; o.y = o.pub.y; }
      else { const k = Math.min(1, dt * 10); o.x += dx * k; o.y += dy * k; }
      o.moving = d > 0.05 || o.pub.mv;
      o.animT += dt;
    }
  }
}

export { ITEMS, TOOLS, TOOL_TIERS, HOUR_MS };
