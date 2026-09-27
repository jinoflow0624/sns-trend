// 캔버스 렌더러. 모든 그림은 16px 도트를 정수 배율(Z)로 키워 또렷하게 그린다.
import { groundCanvas, drawWaterFx, objectSprite, cropSprite, soilOverlay, lockedSoil, furniture, TS } from '../art/world.js';
import { charSheet, catSheet, monsterSheet } from '../art/chars.js';
import { itemIcon, toolIcon } from '../art/items.js';
import { MONSTERS, ITEMS } from '../data.js';
import { FARM_SOIL, T } from '../world/maps.js';
import * as Farm from '../logic/farm.js';
import { lookOf } from '../logic/player.js';
import { darkness } from './clock.js';
import { hash2 } from '../logic/rng.js';

const FONT = "'Galmuri11', 'Galmuri9', 'Apple SD Gothic Neo', sans-serif";

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.cam = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const r = this.cv.getBoundingClientRect();
    this.dpr = dpr;
    this.W = Math.max(1, Math.round(r.width * dpr));
    this.H = Math.max(1, Math.round(r.height * dpr));
    this.cv.width = this.W;
    this.cv.height = this.H;
    // 가로로 대략 10~16칸이 보이도록
    this.Z = Math.max(2, Math.floor(Math.min(this.W / (TS * 10.5), this.H / (TS * 8.5))));
    this.light.width = Math.ceil(this.W / 2);
    this.light.height = Math.ceil(this.H / 2);
  }

  // 화면 좌표(CSS px) → 월드 타일 좌표
  toWorld(sx, sy) {
    const Z = this.Z;
    return { x: (sx * this.dpr - this.ox) / Z / TS, y: (sy * this.dpr - this.oy) / Z / TS };
  }
  toScreen(wx, wy) {
    return { x: (wx * TS * this.Z + this.ox) / this.dpr, y: (wy * TS * this.Z + this.oy) / this.dpr };
  }

  draw(g, dt) {
    const { ctx, W, H, Z } = this;
    const m = g.map;
    if (!m) return;
    const now = performance.now();
    const clock = g.clock;
    // 카메라: 부드럽게 따라가고 맵 밖은 보이지 않게
    const viewW = W / Z / TS; const viewH = H / Z / TS;
    let tx = g.px; let ty = g.py - 0.5;
    tx = m.w <= viewW ? m.w / 2 : Math.max(viewW / 2, Math.min(m.w - viewW / 2, tx));
    ty = m.h <= viewH ? m.h / 2 : Math.max(viewH / 2, Math.min(m.h - viewH / 2, ty));
    if (!this.cam || this.cam.map !== m.key) this.cam = { x: tx, y: ty, map: m.key };
    const k = Math.min(1, dt * 8);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.ox = Math.round(W / 2 - this.cam.x * TS * Z);
    this.oy = Math.round(H / 2 - this.cam.y * TS * Z);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = m.cave || m.ruins ? '#0d0b0b' : m.indoor ? '#2a1c14' : '#3a7433';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(Z, 0, 0, Z, this.ox, this.oy);
    ctx.imageSmoothingEnabled = false;

    const x0 = Math.max(0, Math.floor(this.cam.x - viewW / 2) - 2);
    const y0 = Math.max(0, Math.floor(this.cam.y - viewH / 2) - 2);
    const x1 = Math.min(m.w - 1, Math.ceil(this.cam.x + viewW / 2) + 2);
    const y1 = Math.min(m.h - 1, Math.ceil(this.cam.y + viewH / 2) + 3);
    const inView = (x, y, pad = 2) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;

    ctx.drawImage(groundCanvas(m), 0, 0);
    drawWaterFx(ctx, m, x0, y0, x1, y1, now);

    const nowMs = Date.now();
    const night = darkness(clock.hour) > 0.3;
    const st = {
      t: now, night,
      felled: o => (g.nodes[o.nid] || 0) > nowMs,
      discovered: wp => !!g.waypoints[wp],
      forageItem: o => g.forageItem(o),
    };
    const list = [];
    const lights = [];

    // 밭
    if (m.id === 'farm') {
      const S = FARM_SOIL;
      const lim = g.plotLimit();
      for (let j = 0; j < S.h; j++) for (let i = 0; i < S.w; i++) {
        const x = S.x + i; const y = S.y + j;
        if (!inView(x, y)) continue;
        const idx = j * S.w + i;
        if (idx >= lim) { ctx.drawImage(lockedSoil(), x * TS, y * TS); continue; }
        const p = g.farm[idx];
        if (p?.tilled) ctx.drawImage(soilOverlay(Farm.isWet(p, nowMs)), x * TS, y * TS);
        if (p?.crop) {
          const stage = Farm.stageOf(p, nowMs, g.plotBonus(p));
          const spr = cropSprite(p.crop, stage);
          const bob = stage === 4 ? Math.round(Math.sin(now / 300 + i) * 0.6) : 0;
          list.push({ y: y + 0.9, d: () => ctx.drawImage(spr.c, x * TS + spr.ox, y * TS + spr.oy + bob) });
          if (stage === 4 && Math.sin(now / 400 + idx) > 0.93) g.sparkleOnce?.(x, y);
        }
      }
    }

    // 바닥에 까는 것 (러그 · 사다리 · 룬 · 창문)
    for (const o of m.objects) {
      if (!inView(o.x, o.y, 4)) continue;
      if (o.t === 'ladder' || o.t === 'window' || (o.t === 'waypoint' && o.kind === 'rune')) {
        const s = objectSprite(o, m, st);
        if (s) ctx.drawImage(s.c, o.x * TS + s.ox, o.y * TS + s.oy);
        if (o.t === 'waypoint' && st.discovered(o.wp)) lights.push([o.x + 0.5, o.y + 0.5, 2.5, '#7ae8ff']);
        continue;
      }
      if (o.t === 'forage' && st.felled(o)) continue;
      if (o.t === 'rock' && st.felled(o)) continue;
      const s = objectSprite(o, m, st);
      if (!s) continue;
      let sx = 0;
      if (g.shakeObj?.o === o) sx = Math.round(Math.sin(now / 25) * 1.5);
      const baseY = o.t === 'bed' ? o.y + 0.2 : o.y + o.h - 0.1 - (o.t === 'fountain' ? 0.6 : 0);
      list.push({ y: baseY, d: () => ctx.drawImage(s.c, o.x * TS + s.ox + sx, o.y * TS + s.oy) });
      if (o.t === 'lamp' && night) lights.push([o.x + 0.5, o.y - 0.6, 4, '#ffd88a']);
      if ((o.t === 'building' || o.t === 'hut') && night) lights.push([o.x + o.w / 2, o.y + o.h - 1, 3.5, '#ffd88a']);
      if (o.t === 'station' && o.kind === 'stove') lights.push([o.x + 0.5, o.y + 0.5, 2.2, '#ff9a4a']);
      if (o.t === 'crystal') lights.push([o.x + 0.5, o.y + 0.5, 2, '#b98aff']);
      if (o.t === 'waypoint' && st.discovered(o.wp)) lights.push([o.x + 0.5, o.y - 0.3, 2.5, '#7ae8ff']);
    }

    // 가구
    if (m.id === 'house') {
      const fr = Math.floor(now / 250);
      for (const f of Object.values(g.house.furniture || {})) {
        const it = ITEMS[f.i];
        if (!it) continue;
        const s = furniture(f.i, fr);
        const draw = () => ctx.drawImage(s.c, f.x * TS + s.ox, f.y * TS + s.oy);
        if (it.floor) draw(); else list.push({ y: f.y + it.h - 0.1, d: draw });
        if (it.light) lights.push([f.x + it.w / 2, f.y, 3.5, '#ffd88a']);
      }
    }

    // NPC
    for (const n of g.npcList()) {
      if (!inView(n.x, n.y)) continue;
      if (n.pet) {
        const sh = catSheet();
        const fr = n.moving ? Math.floor(now / 160) % 2 : 0;
        const c = (n.dir === 'left' ? sh.left : sh.right)[fr];
        list.push({ y: n.y, d: () => { this.shadow(n.x, n.y, 5); ctx.drawImage(c, Math.round(n.x * TS) - 8, Math.round(n.y * TS) - 11); } });
        continue;
      }
      const look = { bottom: '#5a4a3a', ...n.data.look };
      const sheet = charSheet(look);
      const fr = n.moving ? Math.floor(now / 140) % 4 : 0;
      const bob = !n.moving && Math.floor(now / 700 + n.x) % 2 === 0 ? 0 : 0;
      list.push({ y: n.y, d: () => this.drawChar(sheet, n.dir, fr, n.x, n.y + bob, null) });
      list.push({ y: 999, d: () => {}, tag: { x: n.x, y: n.y, text: n.data.name, color: '#ffe8a8', near: Math.hypot(g.px - n.x, g.py - n.y) < 3.5 } });
    }

    // 다른 사람들
    for (const o of Object.values(g.players)) {
      if (!o.online || o.map !== m.id || !o.pub) continue;
      const sheet = charSheet(o.pub.l || {});
      const fr = o.moving ? Math.floor(o.animT * 8) % 4 : 0;
      list.push({ y: o.y, d: () => this.drawChar(sheet, o.pub.d || 'down', fr, o.x, o.y, o.pub.a ? { tool: o.pub.a, t: now } : null) });
      list.push({ y: 999, d: () => {}, tag: { x: o.x, y: o.y, text: o.pub.n, color: '#9fe8ff', near: true, bubble: o.bubble && o.bubble.until > Date.now() ? o.bubble.text : null } });
    }

    // 몬스터
    for (const mo of g.monsters) {
      if (mo.dead || !inView(mo.x, mo.y)) continue;
      const M = MONSTERS[mo.kind];
      const sh = monsterSheet(mo.kind, M.color);
      list.push({ y: mo.y, d: () => {
        const frames = sh.char ? sh[mo.dir] || sh.right : sh[mo.dir === 'left' ? 'left' : 'right'];
        const fr = frames[Math.floor((mo.moving ? now / 130 : now / 400) + mo.t) % frames.length];
        const fly = mo.fly ? Math.round(Math.sin(now / 200 + mo.t) * 2) - 6 : 0;
        this.shadow(mo.x, mo.y, mo.boss ? 12 : 5);
        if (mo.hitT > 0 && Math.floor(now / 60) % 2) ctx.globalAlpha = 0.4;
        ctx.drawImage(fr, Math.round(mo.x * TS - fr.width / 2), Math.round(mo.y * TS - fr.height + 2 + fly));
        ctx.globalAlpha = 1;
        if (mo.hp < mo.maxHp) {
          const w = mo.boss ? 28 : 14;
          const bx = Math.round(mo.x * TS - w / 2); const by = Math.round(mo.y * TS - fr.height - 3 + fly);
          ctx.fillStyle = '#2b1e1c'; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
          ctx.fillStyle = '#e04a3a'; ctx.fillRect(bx, by, Math.round(w * mo.hp / mo.maxHp), 2);
        }
      } });
    }

    // 나
    const meSheet = charSheet(lookOf(g.me));
    const act = g.action && g.action.until > now ? g.action : null;
    const myFr = g.moving ? Math.floor(g.animT * 9) % 4 : 0;
    const blink = g.invuln > 0 && Math.floor(now / 70) % 2;
    list.push({ y: g.py, d: () => { if (!blink) this.drawChar(meSheet, g.dir, myFr, g.px, g.py, act ? { tool: act.tool, t: now, until: act.until } : null, g.auto); } });
    if (g.myBubble && g.myBubble.until > Date.now()) list.push({ y: 999, d: () => {}, tag: { x: g.px, y: g.py, text: '', bubble: g.myBubble.text } });

    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();

    // 낚시
    if (g.fishing) this.drawFishing(g, now);

    // 상호작용 대상 표시
    if (!g.moving && !g.fishing && !g.decor) {
      const t = g.facingTarget();
      if (t && t.kind !== 'monster') this.bracket(t, now);
    }
    if (g.marker) {
      const r = 3 + (0.6 - g.marker.t) * 8;
      ctx.strokeStyle = `rgba(255,255,255,${g.marker.t})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(g.marker.x * TS, g.marker.y * TS + 4, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (g.decor) this.drawDecor(g, now);

    // 분위기 입자 (낮: 나비, 밤: 반딧불)
    if (m.outdoor) this.ambient(g, now, night, x0, y0, x1, y1);

    // 효과
    for (const f of g.fx) {
      const a = 1 - f.t / f.life;
      if (f.k === 'p') { ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.fillRect(Math.round(f.x * TS), Math.round(f.y * TS), 1 + (f.size > 1 ? 1 : 0), 1 + (f.size > 1 ? 1 : 0)); }
      ctx.globalAlpha = 1;
    }

    // 조명
    const dark = m.cave || m.ruins ? 0.72 : m.indoor ? darkness(clock.hour) * 0.35 : darkness(clock.hour);
    if (m.cave || m.ruins) lights.push([g.px, g.py - 0.5, 5.5, '#ffe0a0']);
    else if (night) lights.push([g.px, g.py - 0.5, 2.2, '#ffe0a0']);
    if (dark > 0.02) this.drawLight(dark, lights, m);

    // 화면 좌표 (이름표 · 말풍선 · 떠오르는 글자)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const it of list) if (it.tag) this.tag(it.tag);
    for (const f of g.fx) if (f.k === 'text' || f.k === 'item') this.floatFx(f);
    if (g.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, g.fade)})`; ctx.fillRect(0, 0, W, H); }
  }

  shadow(x, y, r = 5) {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(Math.round(x * TS), Math.round(y * TS), r, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  }

  drawChar(sheet, dir, frame, x, y, act, sitting) {
    const c = this.ctx;
    this.shadow(x, y, 5);
    const d = sheet[dir] || sheet.down;
    let img = d.walk[frame];
    let swing = -1;
    if (act && act.tool !== 'hand') {
      swing = act.until ? (act.until - act.t > 160 ? 0 : 1) : Math.floor(act.t / 160) % 2;
      img = d.act[swing];
    }
    const dx = Math.round(x * TS) - 8;
    const dy = Math.round(y * TS) - 23 + (sitting ? 1 : 0);
    c.drawImage(img, dx, dy);
    if (act && act.tool && act.tool !== 'hand') {
      const icon = toolIcon(act.tool, 2);
      const [hx, hy] = { down: [4, 8], up: [4, 2], left: [-6, 6], right: [10, 6] }[dir] || [4, 8];
      c.save();
      c.translate(dx + hx + 6, dy + hy + 10);
      const ang = (swing === 0 ? -0.9 : 0.6) * (dir === 'left' ? -1 : 1);
      c.rotate(ang);
      c.drawImage(icon, -8, -12);
      c.restore();
    }
    if (sitting) {
      c.fillStyle = '#ffffff';
      c.font = `6px ${FONT}`;
      c.fillText('z', dx + 13, dy + 2 - (Math.floor(performance.now() / 500) % 3));
    }
  }

  bracket(t, now) {
    const c = this.ctx;
    let x; let y; let w = 16; let h = 16;
    if (t.kind === 'object') { x = t.o.x * TS; y = (t.o.y + t.o.h - Math.min(t.o.h, 1)) * TS; w = t.o.w * TS; h = Math.min(t.o.h, 1) * TS; if (t.o.t === 'building') return; }
    else if (t.kind === 'npc' || t.kind === 'player') { x = Math.round(t.cx * TS) - 8; y = Math.round(t.cy * TS) - 22; h = 24; }
    else { x = Math.floor(t.cx) * TS; y = Math.floor(t.cy) * TS; }
    const p = Math.floor(now / 300) % 2;
    c.fillStyle = '#fff4c0';
    const L = 4;
    for (const [bx, by, sx, sy] of [[x - p, y - p, 1, 1], [x + w + p, y - p, -1, 1], [x - p, y + h + p, 1, -1], [x + w + p, y + h + p, -1, -1]]) {
      c.fillRect(sx > 0 ? bx : bx - L, sy > 0 ? by : by - 1, L, 1);
      c.fillRect(sx > 0 ? bx : bx - 1, sy > 0 ? by : by - L, 1, L);
    }
  }

  drawFishing(g, now) {
    const c = this.ctx;
    const f = g.fishing;
    const [hx, hy] = [g.px + ({ left: -0.5, right: 0.5 }[g.dir] || 0), g.py - 1];
    const k = f.state === 'cast' ? Math.min(1, f.t / 0.45) : 1;
    const bx = hx + (f.bx - hx) * k;
    const by = hy + (f.by - hy) * k - Math.sin(k * Math.PI) * 1.2;
    const bob = f.state === 'bite' ? Math.round(Math.sin(now / 50) * 1.5) + 1 : f.state === 'wait' ? Math.round(Math.sin(now / 400)) : 0;
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(hx * TS, hy * TS); c.quadraticCurveTo(((hx + bx) / 2) * TS, (Math.max(hy, by) + 0.5) * TS, bx * TS, by * TS + bob); c.stroke();
    c.fillStyle = '#e04a3a'; c.fillRect(Math.round(bx * TS) - 1, Math.round(by * TS) - 2 + bob, 3, 2);
    c.fillStyle = '#ffffff'; c.fillRect(Math.round(bx * TS) - 1, Math.round(by * TS) + bob, 3, 1);
    if (f.state === 'wait' && Math.floor(now / 900) % 2) { c.strokeStyle = 'rgba(205,238,255,0.6)'; c.beginPath(); c.ellipse(bx * TS, by * TS + 2, 5, 2, 0, 0, Math.PI * 2); c.stroke(); }
    if (f.state === 'bite') {
      c.fillStyle = '#ffd23c';
      c.fillRect(Math.round(g.px * TS) - 1, Math.round(g.py * TS) - 36, 3, 7);
      c.fillRect(Math.round(g.px * TS) - 1, Math.round(g.py * TS) - 27, 3, 2);
    }
  }

  drawDecor(g, now) {
    const c = this.ctx;
    const d = g.map.decor;
    c.strokeStyle = 'rgba(255,244,192,0.25)'; c.lineWidth = 0.5;
    for (let x = d.x; x <= d.x + d.w; x++) { c.beginPath(); c.moveTo(x * TS, d.y * TS); c.lineTo(x * TS, (d.y + d.h) * TS); c.stroke(); }
    for (let y = d.y; y <= d.y + d.h; y++) { c.beginPath(); c.moveTo(d.x * TS, y * TS); c.lineTo((d.x + d.w) * TS, y * TS); c.stroke(); }
    const gh = g.decor.ghost;
    if (gh && ITEMS[gh.id]) {
      const s = furniture(gh.id, 0);
      c.globalAlpha = 0.55 + Math.sin(now / 200) * 0.15;
      c.drawImage(s.c, gh.x * TS + s.ox, gh.y * TS + s.oy);
      c.globalAlpha = 1;
      c.fillStyle = gh.bad ? 'rgba(224,74,58,0.35)' : 'rgba(120,220,120,0.3)';
      c.fillRect(gh.x * TS, gh.y * TS, ITEMS[gh.id].w * TS, ITEMS[gh.id].h * TS);
    }
  }

  ambient(g, now, night, x0, y0, x1, y1) {
    const c = this.ctx;
    const n = night ? 14 : 5;
    for (let i = 0; i < n; i++) {
      const seedX = hash2(i, 1, 77); const seedY = hash2(i, 2, 77);
      const x = x0 + ((seedX * (x1 - x0) + Math.sin(now / 2300 + i) * 2 + now / 9000 * (i % 2 ? 1 : -1)) % (x1 - x0 + 1));
      const y = y0 + ((seedY * (y1 - y0) + Math.cos(now / 1900 + i * 1.3) * 1.5) % (y1 - y0 + 1));
      if (night) {
        const a = (Math.sin(now / 350 + i * 2) + 1) / 2;
        c.fillStyle = `rgba(230,255,140,${0.4 + a * 0.6})`;
        c.fillRect(Math.round(x * TS), Math.round(y * TS), 1, 1);
      } else if (g.map.id !== 'forest') {
        const flap = Math.floor(now / 120 + i) % 2;
        c.fillStyle = ['#ffffff', '#ffd23c', '#ff8ac0'][i % 3];
        const px = Math.round(x * TS); const py = Math.round(y * TS);
        c.fillRect(px - 1 - flap, py, 1 + flap, 2); c.fillRect(px + 1, py, 1 + flap, 2);
      } else {
        c.fillStyle = '#6ab04a';
        c.fillRect(Math.round(x * TS), Math.round(((y + now / 3000) % (y1 - y0 + 1) + y0) * TS), 2, 1);
      }
    }
  }

  drawLight(dark, lights, m) {
    const L = this.light;
    const lc = L.getContext('2d');
    const s = 0.5;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, L.width, L.height);
    lc.fillStyle = m.cave || m.ruins ? `rgba(8,6,6,${dark})` : `rgba(12,16,48,${dark})`;
    lc.fillRect(0, 0, L.width, L.height);
    lc.globalCompositeOperation = 'destination-out';
    const flick = 1 + Math.sin(performance.now() / 120) * 0.03;
    for (const [x, y, r] of lights) {
      const sx = (x * TS * this.Z + this.ox) * s; const sy = (y * TS * this.Z + this.oy) * s;
      const R = r * TS * this.Z * s * flick;
      const gr = lc.createRadialGradient(sx, sy, 0, sx, sy, R);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = gr;
      lc.fillRect(sx - R, sy - R, R * 2, R * 2);
    }
    lc.globalCompositeOperation = 'source-over';
    const c = this.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(L, 0, 0, this.W, this.H);
    // 따뜻한 빛 번짐
    c.globalCompositeOperation = 'lighter';
    for (const [x, y, r, col] of lights) {
      const sx = x * TS * this.Z + this.ox; const sy = y * TS * this.Z + this.oy;
      const R = r * TS * this.Z * 0.5;
      const gr = c.createRadialGradient(sx, sy, 0, sx, sy, R);
      gr.addColorStop(0, `${col}${Math.round(dark * 70).toString(16).padStart(2, '0')}`);
      gr.addColorStop(1, `${col}00`);
      c.fillStyle = gr;
      c.fillRect(sx - R, sy - R, R * 2, R * 2);
    }
    c.restore();
    c.imageSmoothingEnabled = false;
  }

  tag(t) {
    const c = this.ctx;
    const d = this.dpr;
    const p = { x: t.x * TS * this.Z + this.ox, y: (t.y * TS - 26) * this.Z + this.oy };
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    if (t.text && t.near) {
      c.font = `${11 * d}px ${FONT}`;
      const w = c.measureText(t.text).width + 8 * d;
      c.fillStyle = 'rgba(20,14,12,0.6)';
      c.fillRect(p.x - w / 2, p.y - 14 * d, w, 14 * d);
      c.fillStyle = t.color || '#fff';
      c.fillText(t.text, p.x, p.y - 2 * d);
    }
    if (t.bubble) {
      c.font = `${12 * d}px ${FONT}`;
      const w = Math.min(220 * d, c.measureText(t.bubble).width + 14 * d);
      const by = p.y - (t.text && t.near ? 18 : 2) * d;
      c.fillStyle = '#fffbe8';
      c.strokeStyle = '#2b1e1c';
      c.lineWidth = 2 * d;
      c.beginPath();
      c.roundRect?.(p.x - w / 2, by - 20 * d, w, 20 * d, 6 * d);
      c.fill(); c.stroke();
      c.fillStyle = '#2b1e1c';
      c.fillText(t.bubble, p.x, by - 4 * d, w - 10 * d);
    }
  }

  floatFx(f) {
    const c = this.ctx;
    const d = this.dpr;
    const x = f.x * TS * this.Z + this.ox;
    const y = f.y * TS * this.Z + this.oy;
    const a = Math.min(1, (1 - f.t / f.life) * 2);
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (f.k === 'text') {
      c.font = `bold ${14 * d}px ${FONT}`;
      c.lineWidth = 3 * d;
      c.strokeStyle = '#2b1e1c';
      c.strokeText(f.text, x, y);
      c.fillStyle = f.color;
      c.fillText(f.text, x, y);
    } else {
      const s = 16 * d * 1.5;
      c.imageSmoothingEnabled = false;
      c.drawImage(itemIcon(f.id), x - s, y - s / 2, s, s);
      c.font = `bold ${13 * d}px ${FONT}`;
      c.lineWidth = 3 * d;
      c.strokeStyle = '#2b1e1c';
      c.strokeText(`+${f.n}`, x + s * 0.4, y);
      c.fillStyle = '#ffffff';
      c.fillText(`+${f.n}`, x + s * 0.4, y);
    }
    c.globalAlpha = 1;
  }
}

export { T };
