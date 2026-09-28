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
};
// 분노 불꽃 색
export const RAGE = { dragon: 'fire', orc: 'toxic', lich: 'arcane' };

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
    const cx = from.reduce((a, p) => a + p.x, 0) / from.length;
    const cy = from.reduce((a, p) => a + p.y, 0) / from.length - 10;
    const R = Math.min(42, 14 + power * 8);
    const sp = this.speed;

    // 1) 모이기: 주사위마다 에너지 조각이 소용돌이치며 가운데로
    onCharge?.();
    const motes = [];
    from.forEach(p => {
      this.burst(p.x, p.y, { n: 10, pal, speed: [40, 140], life: [0.2, 0.45], size: [2, 4] });
      for (let i = 0; i < 9; i++) motes.push({ x0: p.x + rnd(-14, 14), y0: p.y + rnd(-14, 14), delay: rnd(0, 0.35), swirl: rnd(-1, 1) * 40, c: pick(pal), s: rnd(3, 6) });
    });
    const gather = 420 / sp;
    let tt = 0;
    await this.add((g, k, dt) => {
      tt += dt;
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
      FxLayer.orb(g, cx, cy, R * 0.5 * ease(k), pal, tt);
    }, gather * sp);

    // 2) 모아 쏘기 준비: 구체가 부풀며 번쩍
    const charge = 300 / sp;
    this.ring(cx, cy, { color: pal[1], r0: R * 3, r1: R * 0.6, dur: charge * sp, width: 3 });
    await this.add((g, k, dt) => {
      tt += dt;
      const r = R * (0.5 + 0.5 * ease(k)) * (1 + Math.sin(tt * 40) * 0.06);
      FxLayer.orb(g, cx, cy, r, pal, tt);
      if (Math.random() < 0.8) {
        const a = rnd(0, TAU), d = R * 3;
        this.spawn({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * d * 4, vy: -Math.sin(a) * d * 4, life: 0.22, size: 3, color: pick(pal) });
      }
    }, charge * sp);

    // 3) 발사: 휘어지는 궤적 + 꼬리
    onLaunch?.();
    const tgt = getTarget();
    const side = tgt.x < cx ? -1 : 1;
    const ctrl = { x: (cx + tgt.x) / 2 + side * 70 + rnd(-30, 30), y: Math.min(cy, tgt.y) - 70 - power * 20 };
    const fly = 330 / sp;
    let px = cx, py = cy;
    await this.add((g, k, dt) => {
      tt += dt;
      const e = easeIn(k) * 0.55 + k * 0.45;
      const x = (1 - e) * (1 - e) * cx + 2 * (1 - e) * e * ctrl.x + e * e * tgt.x;
      const y = (1 - e) * (1 - e) * cy + 2 * (1 - e) * e * ctrl.y + e * e * tgt.y;
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const ix = px + (x - px) * (i / steps), iy = py + (y - py) * (i / steps);
        this.spawn({ x: ix + rnd(-3, 3), y: iy + rnd(-3, 3), vx: rnd(-30, 30), vy: rnd(-30, 30), life: rnd(0.2, 0.45), size: rnd(3, 6), color: pick(pal), drag: 3 });
      }
      px = x; py = y;
      FxLayer.orb(g, x, y, R * (1 - 0.25 * k), pal, tt);
    }, fly * sp);

    // 4) 명중
    onImpact?.();
    this.impact(tgt.x, tgt.y, pal, power);
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
