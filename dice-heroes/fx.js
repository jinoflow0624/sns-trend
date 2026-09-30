// 화면 연출 — 화면 전체에 깔린 캔버스 한 장에 도트 입자를 그린다.
//   · 점수 공격: 주사위가 에너지로 모여 구체가 되고, 보스(대전은 내 점수)로 날아가 터진다
//   · 보스 스킬: 불길(화염 숨결), 소용돌이(운명 비틀기), 충격파(전쟁의 북), 동전(약탈), 뼈 방패
//   · 분노한 보스를 감싸는 불꽃 (보스마다 색이 다르다)
// 좌표는 모두 화면(viewport) 기준. 할 일이 없으면 그리기 루프가 멈춘다.
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const ease = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const wait = ms => new Promise(r => setTimeout(r, ms));

export const PALETTES = {
  fire:   ['#FFF6C8', '#FFD24A', '#FF8A1A', '#FF4A1A', '#B8141E'],
  toxic:  ['#F2FFC0', '#B6F25A', '#5FD13A', '#2E8F2A', '#16501A'],
  arcane: ['#FFFFFF', '#E0CCFF', '#B98CFF', '#7A4BFF', '#3A1E8A'],
  frost:  ['#FFFFFF', '#C8F4FF', '#7CE0FF', '#3AA8FF', '#1E5AC8'],
  gold:   ['#FFFFFF', '#FFF0A8', '#FFD24A', '#FF9A1F', '#C86A0E'],
  rainbow: ['#FFFFFF', '#FF5A6A', '#FFC83D', '#3EE6B4', '#4FB3FF', '#B98CFF'],
  bone:   ['#FFFFFF', '#F2EEDD', '#C9C2A6', '#9DB7D6'],
  smoke:  ['#5A5470', '#3A344F', '#2A2440'],
  heal:   ['#E6FFE0', '#8CF28C', '#3EE6B4'],
  hell:   ['#FFFFFF', '#FF9AB8', '#FF2A6A', '#C21E56', '#4A0A24'],
};
// 분노 불꽃 색
export const RAGE = { dragon: 'fire', orc: 'toxic', lich: 'arcane', demon: 'hell' };

// 점수 크기에 따라 공격 색과 세기를 고른다
export function attackStyle(pts, cat) {
  if (cat === 'yacht') return { pal: PALETTES.rainbow, power: 3 };
  if (pts >= 30) return { pal: PALETTES.arcane, power: 2.4 };
  if (pts >= 20) return { pal: PALETTES.gold, power: 1.8 };
  if (pts >= 10) return { pal: PALETTES.fire, power: 1.3 };
  return { pal: PALETTES.frost, power: 1 };
}

class FxLayer {
  constructor() {
    this.c = document.createElement('canvas');
    this.c.className = 'fx-canvas';
    this.c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.c);
    this.g = this.c.getContext('2d');
    this.parts = [];       // 입자
    this.items = [];       // 직접 그리는 것 (구체, 고리, 섬광) { draw(g, k, dt), t0, dur, done }
    this.emitters = new Map();
    this.running = false;
    this.speed = 1;
    this.tick = this.tick.bind(this);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.c.width = Math.round(innerWidth * dpr);
    this.c.height = Math.round(innerHeight * dpr);
  }

  kick() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  tick(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalCompositeOperation = 'lighter';
    for (const fn of this.emitters.values()) fn(dt);

    this.items = this.items.filter(it => {
      const k = Math.max(0, Math.min(1, (t - it.t0) / it.dur));   // rAF 시각이 추가 시각보다 살짝 이를 수 있다
      it.draw(g, k, dt);
      if (k >= 1) { it.done?.(); return false; }
      return true;
    });

    const keep = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const size = Math.max(1, p.shrink ? p.size * (0.3 + 0.7 * k) : p.size);
      g.globalAlpha = Math.min(1, k * 1.6) * p.alpha;
      if (p.glow) {
        g.fillStyle = p.color;
        g.globalAlpha *= 0.28;
        g.fillRect(Math.round(p.x - size * 1.5), Math.round(p.y - size * 1.5), Math.round(size * 3), Math.round(size * 3));
        g.globalAlpha = Math.min(1, k * 1.6) * p.alpha;
      }
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), Math.round(size), Math.round(size));
      keep.push(p);
    }
    this.parts = keep;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    if (this.parts.length || this.items.length || this.emitters.size) requestAnimationFrame(this.tick);
    else { this.running = false; g.clearRect(0, 0, innerWidth, innerHeight); }
  }

  spawn(p) {
    this.parts.push({ vx: 0, vy: 0, grav: 0, drag: 0, size: 3, alpha: 1, glow: true, shrink: true, ...p, max: p.life });
    this.kick();
  }

  burst(x, y, { n = 30, pal = PALETTES.gold, speed = [80, 260], size = [2, 5], life = [0.35, 0.8], grav = 0, drag = 2.5, dir = 0, spread = TAU } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = rnd(...speed);
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(...life), size: rnd(...size), color: pick(pal), grav, drag });
    }
  }

  add(draw, dur) {
    return new Promise(done => {
      this.items.push({ draw, dur: dur / this.speed, t0: performance.now(), done });
      this.kick();
    });
  }

  ring(x, y, { color = '#FFFFFF', r0 = 6, r1 = 110, dur = 420, width = 6 } = {}) {
    return this.add((g, k) => {
      const r = r0 + (r1 - r0) * ease(k);
      g.globalAlpha = 1 - k;
      g.strokeStyle = color;
      g.lineWidth = Math.max(1, width * (1 - k));
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }, dur);
  }

  flash(color = '#FFFFFF', dur = 260, alpha = 0.35) {
    return this.add((g, k) => {
      g.globalAlpha = alpha * (1 - k);
      g.fillStyle = color;
      g.fillRect(0, 0, innerWidth, innerHeight);
      g.globalAlpha = 1;
    }, dur);
  }

  // 원 모양 빛 (구체)
  static orb(g, x, y, r, pal, t) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.18, pal[1] || pal[0]);
    grad.addColorStop(0.45, (pal[2] || pal[1]) + '99');
    grad.addColorStop(1, (pal[3] || pal[2]) + '00');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r * 2.4, 0, TAU); g.fill();
    // 도는 빛줄기 (도트 사각형)
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const a = t * 5 + (i / rays) * TAU;
      const len = r * (1.5 + 0.5 * Math.sin(t * 13 + i));
      for (let d = r * 0.9; d < len; d += 3) {
        g.fillStyle = pal[i % pal.length];
        g.fillRect(Math.round(x + Math.cos(a) * d) - 1, Math.round(y + Math.sin(a) * d) - 1, 3, 3);
      }
    }
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.arc(x, y, r * 0.55, 0, TAU); g.fill();
  }

  // ── 점수 공격 ──────────────────────────────────────────────────────────────
  // from: 주사위 화면 좌표들, getTarget: () => {x, y}. 구체가 목표에 닿는 순간 resolve.
  async energy(from, getTarget, { pal = PALETTES.gold, power = 1, onCharge, onLaunch, onImpact } = {}) {
    if (!from.length) return;
    const o = await this.gather(from, { pal, power, onCharge });
    onLaunch?.();
    const tgt = getTarget();
    await this.flyOrb(o, tgt, { pal, power });
    onImpact?.();
    this.impact(tgt.x, tgt.y, pal, power);
  }

  // 주사위마다 에너지 조각이 소용돌이치며 가운데로 모여 구체가 되고, 부풀며 번쩍 → { cx, cy, R, tt }
  async gather(from, { pal = PALETTES.gold, power = 1, onCharge } = {}) {
    const cx = from.reduce((a, p) => a + p.x, 0) / from.length;
    const cy = from.reduce((a, p) => a + p.y, 0) / from.length - 10;
    const R = Math.min(42, 14 + power * 8);
    const sp = this.speed;
    onCharge?.();
    const motes = [];
    from.forEach(p => {
      this.burst(p.x, p.y, { n: 10, pal, speed: [40, 140], life: [0.2, 0.45], size: [2, 4] });
      for (let i = 0; i < 9; i++) motes.push({ x0: p.x + rnd(-14, 14), y0: p.y + rnd(-14, 14), delay: rnd(0, 0.35), swirl: rnd(-1, 1) * 40, c: pick(pal), s: rnd(3, 6) });
    });
    const o = { cx, cy, R, tt: 0 };
    await this.add((g, k, dt) => {
      o.tt += dt;
      for (const m of motes) {
        const q = Math.max(0, Math.min(1, (k - m.delay * 0.6) / (1 - m.delay * 0.6)));
        const e = easeIn(q);
        const nx = m.x0 + (cx - m.x0) * e, ny = m.y0 + (cy - m.y0) * e;
        const perp = Math.sin(q * Math.PI) * m.swirl;
        const x = nx + perp * 0.6, y = ny - perp * 0.4;
        g.fillStyle = m.c;
        g.globalAlpha = 0.35;
        g.fillRect(Math.round(x - m.s), Math.round(y - m.s), m.s * 2, m.s * 2);
        g.globalAlpha = 1;
        g.fillRect(Math.round(x - m.s / 2), Math.round(y - m.s / 2), m.s, m.s);
      }
      FxLayer.orb(g, cx, cy, R * 0.5 * ease(k), pal, o.tt);
    }, 420);
    this.ring(cx, cy, { color: pal[1], r0: R * 3, r1: R * 0.6, dur: 300, width: 3 });
    await this.add((g, k, dt) => {
      o.tt += dt;
      const r = R * (0.5 + 0.5 * ease(k)) * (1 + Math.sin(o.tt * 40) * 0.06);
      FxLayer.orb(g, cx, cy, r, pal, o.tt);
      if (Math.random() < 0.8) {
        const a = rnd(0, TAU), d = R * 3;
        this.spawn({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * d * 4, vy: -Math.sin(a) * d * 4, life: 0.22, size: 3, color: pick(pal) });
      }
    }, 300);
    return o;
  }

  // 모은 구체를 휘어지는 궤적으로 날린다 (꼬리를 남기며). 닿으면 resolve
  async flyOrb(o, tgt, { pal = PALETTES.gold, power = 1, ms = 330, shrink = 0.25 } = {}) {
    const { cx, cy, R } = o;
    const side = tgt.x < cx ? -1 : 1;
    const ctrl = { x: (cx + tgt.x) / 2 + side * 70 + rnd(-30, 30), y: Math.min(cy, tgt.y) - 70 - power * 20 };
    let px = cx, py = cy;
    await this.add((g, k, dt) => {
      o.tt += dt;
      const e = easeIn(k) * 0.55 + k * 0.45;
      const x = (1 - e) * (1 - e) * cx + 2 * (1 - e) * e * ctrl.x + e * e * tgt.x;
      const y = (1 - e) * (1 - e) * cy + 2 * (1 - e) * e * ctrl.y + e * e * tgt.y;
      for (let i = 0; i < 4; i++) {
        const ix = px + (x - px) * (i / 4), iy = py + (y - py) * (i / 4);
        this.spawn({ x: ix + rnd(-3, 3), y: iy + rnd(-3, 3), vx: rnd(-30, 30), vy: rnd(-30, 30), life: rnd(0.2, 0.45), size: rnd(3, 6), color: pick(pal), drag: 3 });
      }
      px = x; py = y;
      FxLayer.orb(g, x, y, R * (1 - shrink * k), pal, o.tt);
    }, ms);
  }

  // ── 대전: 직업별 공격 ──────────────────────────────────────────────────────
  // a(공격자) → b(상대) 로 직업에 맞는 기술을 날린다. 마지막 한 발이 닿는 순간 resolve (onHit: 한 발마다)
  async strike(cls, a, b, { pal = PALETTES.gold, power = 1, onHit } = {}) {
    const dx = b.x - a.x, dy = b.y - a.y, ang = Math.atan2(dy, dx);
    const S = 1 + (power - 1) * 0.35;                           // 족보가 클수록 크게
    const shots = power >= 3 ? 5 : power >= 1.8 ? 4 : 3;       // 여러 발 기술의 발 수
    const hit = (x, y, big = false) => {
      this.burst(x, y, { n: big ? 26 : 12, pal, speed: [80, 260], life: [0.25, 0.55], size: [2, 5], drag: 3 });
      onHit?.(big);
    };
    const line = (k, bend = 0) => {
      const x = a.x + dx * k, y = a.y + dy * k;
      return { x: x - Math.sin(ang) * bend, y: y + Math.cos(ang) * bend };
    };
    const trail = (x, y, n = 2, size = [2, 5], p = pal) => { for (let i = 0; i < n; i++) this.spawn({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-25, 25), vy: rnd(-25, 25), life: rnd(0.18, 0.4), size: rnd(...size), color: pick(p), drag: 3 }); };
    // 한 발을 날리는 공통 틀: draw(g, 위치, 진행도, 발 번호)
    const volley = (n, gap, dur, draw, path = k => line(ease(k))) => Promise.all([...Array(n)].map((_, i) => wait(i * gap / this.speed).then(() =>
      this.add((g, k) => { const p = path(k, i); draw(g, p, k, i); }, dur).then(() => { const p = path(1, i); hit(p.x, p.y, i === n - 1); }))));

    if (cls === 'warrior') {
      // 검기: 초승달 모양 참격이 날아가 벤다
      const R = 26 * S;
      await volley(power >= 1.8 ? 2 : 1, 140, 300, (g, p, k) => {
        g.save(); g.translate(p.x, p.y); g.rotate(ang);
        for (let w = 0; w < 3; w++) {
          g.strokeStyle = w === 0 ? '#FFFFFF' : pal[Math.min(pal.length - 1, w + 1)];
          g.globalAlpha = 1 - w * 0.3;
          g.lineWidth = (7 - w * 2) * S;
          g.beginPath(); g.arc(-w * 6, 0, R, -1.1, 1.1); g.stroke();
        }
        g.restore(); g.globalAlpha = 1;
        trail(p.x, p.y, 3);
      });
    } else if (cls === 'mage') {
      // 화염구: 불꽃 꼬리를 끌며 포물선으로
      const o = { cx: a.x, cy: a.y, R: 11 * S, tt: 0 };
      await this.flyOrb(o, b, { pal: PALETTES.fire, power, ms: 380, shrink: -0.3 });
      hit(b.x, b.y, true);
      this.burst(b.x, b.y, { n: 20, pal: PALETTES.fire, speed: [60, 220], grav: -120, life: [0.4, 0.8], size: [4, 8] });
    } else if (cls === 'rogue') {
      // 단검 연속 투척
      await volley(shots, 90, 230, (g, p) => {
        g.save(); g.translate(Math.round(p.x), Math.round(p.y)); g.rotate(ang);
        g.fillStyle = '#E8EEF8'; g.fillRect(-2, -3 * S, 16 * S, 6 * S);        // 칼날
        g.fillStyle = '#FFFFFF'; g.fillRect(2, -1, 12 * S, 2);
        g.fillStyle = '#5A3A2A'; g.fillRect(-10 * S, -2 * S, 8 * S, 4 * S);    // 손잡이
        g.fillStyle = pal[2] || pal[0]; g.fillRect(-3 * S, -5 * S, 3 * S, 10 * S);
        g.restore();
        trail(p.x, p.y, 1, [2, 3], ['#FFFFFF', '#C8F4FF']);
      }, (k, i) => line(ease(k), (i % 2 ? 1 : -1) * 10 * Math.sin(k * Math.PI)));
    } else if (cls === 'bard') {
      // 음표 파동: 물결치며 날아가는 음표들
      await volley(shots, 110, 420, (g, p, k, i) => {
        const c = pal[(i % (pal.length - 1)) + 1] || '#FFFFFF', z = S * 1.2, x = Math.round(p.x), y = Math.round(p.y);
        g.fillStyle = c;
        g.beginPath(); g.ellipse(x, y, 6 * z, 4.5 * z, -0.4, 0, TAU); g.fill();   // 머리
        g.fillRect(x + 4 * z, y - 18 * z, 2.5 * z, 18 * z);                      // 기둥
        g.fillRect(x + 4 * z, y - 18 * z, 8 * z, 3 * z);                         // 꼬리
        g.fillStyle = '#FFFFFF'; g.fillRect(x - 3 * z, y - 2 * z, 2 * z, 2 * z);
        if (Math.random() < 0.5) trail(p.x, p.y, 1, [2, 3]);
      }, (k, i) => line(k, Math.sin(k * TAU * 1.5 + i) * 22));
    } else if (cls === 'dancer') {
      // 리본 춤: 분홍 리본 꽃잎이 빙글빙글 춤추며 날아간다
      const petals = ['#FFFFFF', '#FF9AD0', '#E84FA0', '#FFC83D'];
      await volley(shots, 90, 460, (g, p, k, i) => {
        const r = 7 * S, a = k * 14 + i;
        g.save(); g.translate(Math.round(p.x), Math.round(p.y)); g.rotate(a);
        for (let q = 0; q < 4; q++) {                    // 꽃잎 네 장
          g.rotate(Math.PI / 2);
          g.fillStyle = petals[(q + i) % petals.length];
          g.beginPath(); g.ellipse(r * 0.9, 0, r, r * 0.45, 0, 0, TAU); g.fill();
        }
        g.fillStyle = '#FFC83D'; g.beginPath(); g.arc(0, 0, r * 0.35, 0, TAU); g.fill();
        g.restore();
        this.spawn({ x: p.x, y: p.y, vx: rnd(-30, 30), vy: rnd(-40, 10), life: rnd(0.3, 0.6), size: rnd(2, 4), color: pick(petals), drag: 2 });
      }, (k, i) => line(k, Math.sin(k * TAU + i * 1.3) * 26));
    } else if (cls === 'gambler') {
      // 카드 날리기: 빙글빙글 도는 카드
      await volley(shots, 100, 320, (g, p, k, i) => {
        const w = 12 * S, h = 17 * S, sx = Math.cos(k * 16 + i);
        g.save(); g.translate(Math.round(p.x), Math.round(p.y)); g.rotate(ang + k * 3); g.scale(Math.max(0.15, Math.abs(sx)), 1);
        g.fillStyle = '#06041A'; g.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
        g.fillStyle = sx > 0 ? '#FFFFFF' : '#C8142E'; g.fillRect(-w / 2, -h / 2, w, h);
        if (sx > 0) { g.fillStyle = i % 2 ? '#C8142E' : '#06041A'; g.beginPath(); g.moveTo(0, -5 * S); g.lineTo(4 * S, 0); g.lineTo(0, 5 * S); g.lineTo(-4 * S, 0); g.fill(); }
        g.restore();
        trail(p.x, p.y, 1, [2, 3], ['#FFD24A', '#FFFFFF']);
      }, (k, i) => line(ease(k), (i - (shots - 1) / 2) * 12 * Math.sin(k * Math.PI)));
    } else {
      // 수도승(기본): 기공 장풍 — 고리 파동을 뿜으며 곧게 날아간다
      const R = 13 * S;
      let lastRing = 0;
      await this.add((g, k) => {
        const p = line(easeIn(k) * 0.6 + k * 0.4);
        if (k - lastRing > 0.12) { lastRing = k; this.ring(p.x, p.y, { color: pal[1] || '#FFFFFF', r0: R, r1: R * 2.4, dur: 260, width: 3 }); }
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 1.8);
        grad.addColorStop(0, '#FFFFFF'); grad.addColorStop(0.4, (pal[1] || '#FFD24A')); grad.addColorStop(1, (pal[3] || pal[2] || '#FF9A1F') + '00');
        g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y, R * 1.8, 0, TAU); g.fill();
        trail(p.x, p.y, 3, [3, 6]);
      }, 340);
      hit(b.x, b.y, true);
      this.ring(b.x, b.y, { color: '#FFFFFF', r0: 8, r1: 70 * S, dur: 380, width: 6 });
    }
  }

  // 0점: 힘없는 연기 한 줌이 날아가다 흩어진다 (상대는 가볍게 피한다)
  async miss(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    await this.add((g, k) => {
      const x = a.x + dx * 0.7 * ease(k), y = a.y + dy * 0.7 * ease(k) - Math.sin(k * Math.PI) * 20;
      g.globalAlpha = 1 - k * 0.6;
      g.fillStyle = PALETTES.smoke[0]; g.beginPath(); g.arc(x, y, 7 + k * 5, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }, 380);
    this.burst(a.x + dx * 0.7, a.y + dy * 0.7, { n: 10, pal: PALETTES.smoke, speed: [20, 70], grav: -40, life: [0.4, 0.8], size: [3, 6] });
  }

  // 왕관이 옛 1등에게서 튕겨 나와 새 1등에게 날아간다
  async crown(a, b, draw) {
    this.burst(a.x, a.y, { n: 14, pal: PALETTES.gold, speed: [60, 200], life: [0.3, 0.6] });
    await this.add((g, k) => {
      const e = ease(k);
      const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e - Math.sin(k * Math.PI) * 70;
      draw(g, x, y, 1 + Math.sin(k * Math.PI) * 0.6, k * TAU * 2);
      if (Math.random() < 0.7) this.spawn({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.4, size: rnd(2, 4), color: pick(PALETTES.gold), drag: 3 });
    }, 620);
    this.burst(b.x, b.y, { n: 24, pal: PALETTES.gold, speed: [80, 240], life: [0.35, 0.7] });
    this.ring(b.x, b.y, { color: '#FFD24A', r1: 60, dur: 420, width: 5 });
  }

  impact(x, y, pal, power = 1) {
    this.burst(x, y, { n: Math.round(30 + power * 22), pal, speed: [120, 380 + power * 80], size: [3, 7], life: [0.35, 0.9], drag: 3 });
    this.burst(x, y, { n: 14, pal: ['#FFFFFF'], speed: [60, 200], size: [2, 3], life: [0.2, 0.4] });
    this.ring(x, y, { color: '#FFFFFF', r1: 60 + power * 30, dur: 320, width: 8 });
    this.ring(x, y, { color: pal[2] || pal[0], r1: 100 + power * 40, dur: 520, width: 5 });
    if (power >= 1.8) this.flash(pal[1], 280, 0.22 + power * 0.05);
  }

  // ── 보스 스킬 ─────────────────────────────────────────────────────────────
  // 주사위가 활활 탄다
  async fire(points, ms = 900) {
    const key = Symbol('fire');
    this.emitters.set(key, dt => {
      for (const p of points) {
        for (let i = 0; i < 5; i++) {
          this.spawn({
            x: p.x + rnd(-22, 22), y: p.y + rnd(-4, 18), vx: rnd(-25, 25), vy: rnd(-230, -110),
            life: rnd(0.35, 0.75), size: rnd(4, 10), color: pick(PALETTES.fire), drag: 1.4,
          });
        }
      }
    });
    points.forEach(p => this.ring(p.x, p.y, { color: '#FF8A1A', r1: 46, dur: 360 }));
    await wait(ms / this.speed);
    this.emitters.delete(key);
    points.forEach(p => this.burst(p.x, p.y - 6, { n: 16, pal: PALETTES.smoke, speed: [20, 70], life: [0.5, 1], size: [4, 8], grav: -60, drag: 1 }));
  }

  // 보랏빛 소용돌이가 주사위를 휘감는다
  async vortex(points, ms = 800) {
    await this.add((g, k) => {
      for (const p of points) {
        for (let arm = 0; arm < 3; arm++) {
          for (let i = 0; i < 14; i++) {
            const a = k * 16 + arm * (TAU / 3) + i * 0.22;
            const r = (48 - i * 2.2) * (1 - k * 0.6);
            const sz = 7 - i * 0.35;
            g.fillStyle = PALETTES.arcane[(i + arm) % 5];
            g.globalAlpha = (1 - k * 0.5) * (1 - i / 16);
            g.fillRect(Math.round(p.x + Math.cos(a) * r - sz / 2), Math.round(p.y + Math.sin(a) * r * 0.6 - sz / 2), Math.round(sz), Math.round(sz));
          }
        }
      }
      g.globalAlpha = 1;
    }, ms);
    points.forEach(p => this.burst(p.x, p.y, { n: 22, pal: PALETTES.arcane, speed: [60, 200], life: [0.3, 0.6] }));
  }

  // 전쟁의 북: 쿵 — 충격파
  quake(x, y, w) {
    this.ring(x, y, { color: '#B6F25A', r0: 10, r1: w * 0.55, dur: 480, width: 7 });
    this.burst(x, y + 20, { n: 16, pal: ['#8A6A3A', '#5A3A2A', '#C9A36B'], speed: [80, 220], dir: -Math.PI / 2, spread: 2.2, grav: 500, life: [0.4, 0.7], size: [3, 5] });
  }

  // 약탈: 동전이 보스에게 빨려 간다
  async coins(from, to, n = 14) {
    const list = [...Array(n)].map(() => ({ x0: from.x + rnd(-60, 60), y0: from.y + rnd(-20, 20), d: rnd(0, 0.4) }));
    await this.add((g, k) => {
      for (const c of list) {
        const q = Math.max(0, Math.min(1, (k - c.d) / (1 - c.d)));
        const e = easeIn(q);
        const x = c.x0 + (to.x - c.x0) * e, y = c.y0 + (to.y - c.y0) * e - Math.sin(q * Math.PI) * 60;
        if (q >= 1) continue;
        g.fillStyle = '#FFD24A'; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        g.fillStyle = '#FFF6C8'; g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 2);
      }
    }, 750);
    this.burst(to.x, to.y, { n: 24, pal: PALETTES.heal, speed: [60, 180], grav: -80, life: [0.4, 0.8] });
  }

  // 뼈 방패: 뼛조각이 보스 둘레를 돌다 방패가 된다
  async shield(at) {
    await this.add((g, k) => {
      for (let i = 0; i < 12; i++) {
        const a = k * 9 + (i / 12) * TAU;
        const r = 70 - 30 * ease(k);
        g.fillStyle = PALETTES.bone[i % 4];
        g.fillRect(Math.round(at.x + Math.cos(a) * r) - 4, Math.round(at.y + Math.sin(a) * r) - 2, 8, 4);
      }
    }, 700);
    this.ring(at.x, at.y, { color: '#C8F4FF', r0: 20, r1: 70, dur: 500, width: 8 });
    this.burst(at.x, at.y, { n: 18, pal: PALETTES.bone, speed: [80, 200] });
  }

  // 쇠사슬 한 줄: (x0,y0) → (x1,y1) 로 도트 고리를 번갈아 그린다
  static chain(g, x0, y0, x1, y1, { hot = 0, phase = 0 } = {}) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L, step = 9;
    for (let s = phase % step; s < L; s += step) {
      const x = x0 + ux * s, y = y0 + uy * s, odd = Math.floor((s - phase) / step) % 2;
      const w = odd ? 4 : 8, h = odd ? 8 : 4;             // 가로 고리 · 세로 고리 번갈아
      const along = Math.abs(ux) > Math.abs(uy);
      const ww = along ? w : h, hh = along ? h : w;
      g.fillStyle = '#2A2440'; g.fillRect(Math.round(x - ww / 2) - 1, Math.round(y - hh / 2) - 1, ww + 2, hh + 2);
      g.fillStyle = hot > 0.5 ? '#FFFFFF' : hot > 0 ? '#E8D8FF' : odd ? '#8A90A8' : '#C8D2E0';
      g.fillRect(Math.round(x - ww / 2), Math.round(y - hh / 2), ww, hh);
    }
  }

  // 마왕의 봉인 (약 1.3초): 발밑에 붉은 마법진이 피어나고 하늘에서 빛기둥 → 사방에서 쇠사슬이 날아와 감긴다 →
  // 사슬이 조여들고 봉인 문양이 쾅 찍힌다
  async seal(points, ms = 1300) {
    const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x / Math.SQRT2, y / Math.SQRT2]);
    let slammed = false;
    this.flash('#2A0A24', 500, 0.35);
    await this.add((g, k) => {
      for (const p of points) {
        // 1) 마법진: 두 겹 원 + 별 모양, 천천히 돌며 커진다
        const open = ease(Math.min(1, k / 0.3));
        const r = 58 * open * (k > 0.75 ? 1 - (k - 0.75) * 1.2 : 1);
        const rot = k * 3;
        g.globalAlpha = 0.85 * open;
        g.strokeStyle = '#FF2A6A'; g.lineWidth = 3;
        g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke();
        g.strokeStyle = '#B98CFF'; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, r * 0.78, 0, TAU); g.stroke();
        g.beginPath();                                   // 오각별
        for (let q = 0; q <= 5; q++) {
          const a = rot + (q * 2 / 5) * TAU - Math.PI / 2;
          const x = p.x + Math.cos(a) * r * 0.78, y = p.y + Math.sin(a) * r * 0.78;
          q ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
        for (let q = 0; q < 8; q++) {                    // 도는 룬 조각
          const a = -rot * 1.6 + (q / 8) * TAU;
          g.fillStyle = q % 2 ? '#FFFFFF' : '#FF9AB8';
          g.fillRect(Math.round(p.x + Math.cos(a) * r) - 3, Math.round(p.y + Math.sin(a) * r) - 3, 6, 6);
        }
        // 2) 빛기둥: 위에서 내리꽂는 보랏빛
        const beam = k < 0.35 ? k / 0.35 : Math.max(0, 1 - (k - 0.35) / 0.3);
        if (beam > 0) {
          g.globalAlpha = 0.35 * beam;
          g.fillStyle = '#B98CFF'; g.fillRect(Math.round(p.x - 16), 0, 32, Math.round(p.y));
          g.globalAlpha = 0.6 * beam;
          g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(p.x - 4), 0, 8, Math.round(p.y));
        }
        // 3) 사방에서 쇠사슬이 날아와 박힌다 (0.3~0.62), 이후 조여든다
        if (k > 0.3) {
          const c = ease(Math.min(1, (k - 0.3) / 0.32));
          const tight = k > 0.62 ? Math.min(1, (k - 0.62) / 0.3) : 0;
          g.globalAlpha = 1;
          dirs.forEach(([ux, uy], q) => {
            const far = 220, near = 14 + 8 * (1 - tight);
            const sx = p.x + ux * far, sy = p.y + uy * far;
            const tx = sx + (p.x + ux * near - sx) * c, ty = sy + (p.y + uy * near - sy) * c;
            const back = far * (1 - tight * 0.55);          // 조여들수록 바깥쪽 사슬이 짧아진다
            FxLayer.chain(g, p.x + ux * back, p.y + uy * back, tx, ty, { phase: tight * 30 + q * 3, hot: tight > 0.8 ? 0.3 : 0 });
            if (c < 1) { g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(tx) - 3, Math.round(ty) - 3, 6, 6); }
          });
        }
        // 4) 봉인 문양이 쾅 (0.77~)
        if (k > 0.77) {
          const s = ease(Math.min(1, (k - 0.77) / 0.12));
          const size = 34 * (1.8 - s * 0.8);
          g.globalAlpha = Math.min(1, s * 1.5);
          g.strokeStyle = '#FF2A6A'; g.lineWidth = 4;
          g.strokeRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), Math.round(size), Math.round(size));
          g.strokeStyle = '#FFFFFF'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(p.x - size * 0.3, p.y - size * 0.3); g.lineTo(p.x + size * 0.3, p.y + size * 0.3);
          g.moveTo(p.x + size * 0.3, p.y - size * 0.3); g.lineTo(p.x - size * 0.3, p.y + size * 0.3); g.stroke();
        }
        g.globalAlpha = 1;
      }
      if (k > 0.77 && !slammed) {
        slammed = true;
        this.flash('#C21E56', 260, 0.4);
        points.forEach(p => {
          this.ring(p.x, p.y, { color: '#FF2A6A', r0: 14, r1: 90, dur: 420, width: 7 });
          this.ring(p.x, p.y, { color: '#FFFFFF', r0: 6, r1: 56, dur: 300, width: 4 });
          this.burst(p.x, p.y, { n: 26, pal: PALETTES.hell, speed: [80, 240], life: [0.3, 0.7] });
          this.burst(p.x, p.y, { n: 12, pal: ['#C8D2E0', '#8A90A8', '#FFFFFF'], speed: [60, 160], grav: 300, life: [0.4, 0.8], size: [3, 5] });
        });
      }
    }, ms);
  }

  // 봉인이 풀린다 (약 0.9초): 사슬이 하얗게 달아올라 떨리다 산산조각 → 빛기둥이 솟구치고 두 겹 고리가 퍼진다
  async unseal(points, ms = 900) {
    const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x / Math.SQRT2, y / Math.SQRT2]);
    let broke = false;
    await this.add((g, k) => {
      for (const p of points) {
        if (k < 0.35) {                                   // 달아올라 부들부들
          const hot = k / 0.35, j = Math.sin(k * 120) * 3 * hot;
          dirs.forEach(([ux, uy]) => FxLayer.chain(g, p.x + ux * 60 + j, p.y + uy * 60, p.x + ux * 14 + j, p.y + uy * 14, { hot }));
          g.globalAlpha = 0.5 * hot;
          g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(p.x - 14), Math.round(p.y - 14), 28, 28);
        } else {                                          // 빛기둥이 위로 솟구친다
          const b = 1 - (k - 0.35) / 0.65;
          g.globalAlpha = 0.45 * b;
          g.fillStyle = '#FFE58A'; g.fillRect(Math.round(p.x - 22 * b), 0, Math.round(44 * b), Math.round(p.y + 20));
          g.globalAlpha = 0.8 * b;
          g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(p.x - 5), 0, 10, Math.round(p.y + 20));
          for (let q = 0; q < 10; q++) {                  // 반짝이는 별 조각이 올라간다
            const y = p.y - ((k - 0.35) * 600 + q * 37) % 260, x = p.x + Math.sin(q * 2.1 + k * 8) * 24;
            g.globalAlpha = b;
            g.fillStyle = q % 2 ? '#FFFFFF' : '#FFD24A';
            g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
          }
        }
        g.globalAlpha = 1;
      }
      if (k >= 0.35 && !broke) {
        broke = true;
        this.flash('#FFFFFF', 280, 0.45);
        points.forEach(p => {
          this.ring(p.x, p.y, { color: '#FFFFFF', r0: 10, r1: 120, dur: 520, width: 8 });
          this.ring(p.x, p.y, { color: '#FFD24A', r0: 6, r1: 80, dur: 420, width: 5 });
          this.ring(p.x, p.y, { color: '#B98CFF', r0: 20, r1: 150, dur: 650, width: 3 });
          dirs.forEach(([ux, uy]) => this.burst(p.x + ux * 30, p.y + uy * 30, { n: 10, pal: ['#C8D2E0', '#8A90A8', '#FFFFFF', '#2A2440'], speed: [120, 300], dir: Math.atan2(uy, ux), spread: 1.2, grav: 520, drag: 0.8, life: [0.5, 0.9], size: [3, 6] }));
          this.burst(p.x, p.y, { n: 30, pal: ['#FFFFFF', '#FFF0A8', '#FFD24A', '#C9B8FF'], speed: [100, 320], life: [0.4, 0.8] });
        });
      }
    }, ms);
  }

  // 0점: 에너지가 흩어져 연기가 된다
  fizzle(points) {
    points.forEach(p => this.burst(p.x, p.y, { n: 8, pal: PALETTES.smoke, speed: [20, 60], grav: -40, life: [0.4, 0.8], size: [3, 6] }));
  }

  // ── 분노 불꽃 ─────────────────────────────────────────────────────────────
  // getRect: 불꽃을 붙일 요소의 화면 위치 (화면을 다시 그려도 따라간다)
  rage(on, getRect, palName = 'fire') {
    if (!on) { this.emitters.delete('rage'); return; }
    const pal = PALETTES[palName] || PALETTES.fire;
    let acc = 0;
    this.emitters.set('rage', dt => {
      const r = getRect();
      if (!r) { this.emitters.delete('rage'); return; }
      if (!r.width) return;
      acc += dt * 90;
      while (acc > 1) {
        acc--;
        const edge = Math.random() < 0.7;
        const x = edge ? r.left + (Math.random() < 0.5 ? rnd(0, r.width * 0.22) : rnd(r.width * 0.78, r.width)) : rnd(r.left, r.right);
        this.spawn({
          x, y: r.bottom - rnd(0, r.height * 0.55), vx: rnd(-18, 18), vy: rnd(-160, -70),
          life: rnd(0.35, 0.8), size: rnd(3, 8), color: pick(pal), drag: 1.2,
        });
      }
    });
    this.kick();
  }
}

let layer = null;
export const FX = () => (layer ||= new FxLayer());

// 요소를 흔든다 (화면 흔들림)
export function shake(el, strength = 1) {
  if (!el) return;
  el.style.setProperty('--sh', `${Math.round(3 + strength * 3)}px`);
  el.classList.remove('shaking');
  void el.offsetWidth;
  el.classList.add('shaking');
  setTimeout(() => el.classList.remove('shaking'), 420);
}
