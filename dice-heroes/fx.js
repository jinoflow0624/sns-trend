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
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`; };

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
export const RAGE = { dragon: 'fire', orc: 'toxic', lich: 'arcane', hydra: 'arcane', cyclops: 'frost', overlord: 'hell', demon: 'hell', archdemon: 'hell' };

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
    } else if (cls === 'outlaw') {
      // 속사: 총구 섬광과 함께 노란 예광탄이 일직선으로 꽂힌다
      const rad = Math.max(3, 4 * S);
      await volley(shots, 70, 150, (g, p, k) => {
        g.save(); g.translate(Math.round(p.x), Math.round(p.y)); g.rotate(ang);
        g.fillStyle = '#FFE27A'; g.fillRect(-26 * S, -1, 26 * S, 2);              // 궤적
        g.fillStyle = '#FFFFFF'; g.fillRect(-rad, -rad / 2, rad * 2.4, rad);      // 탄두
        g.fillStyle = '#FF8A1A'; g.fillRect(-rad * 2, -rad / 2, rad, rad);
        g.restore();
        if (k < 0.15) { g.fillStyle = '#FFF3B0'; g.beginPath(); g.arc(a.x, a.y, 12 * S * (1 - k * 5), 0, TAU); g.fill(); }   // 총구 섬광
        trail(p.x, p.y, 1, [2, 3], ['#FFE27A', '#FF8A1A']);
      }, (k, i) => line(k, (i - (shots - 1) / 2) * 6));
      this.burst(b.x, b.y, { n: 14, pal: ['#C8C0B0', '#8A8070', '#FFE27A'], speed: [30, 120], grav: -60, life: [0.4, 0.8], size: [3, 6] });   // 화약 연기
    } else if (cls === 'sharper') {
      // 스페이드 에이스 날리기: 손목 스냅으로 휘어 날아가 꽂힌다
      const spade = (g, z, c) => {   // z = 반폭
        g.fillStyle = c; g.beginPath();
        g.moveTo(0, -z * 1.25); g.lineTo(z, z * 0.05); g.lineTo(-z, z * 0.05); g.fill();   // 위 뾰족
        g.beginPath(); g.arc(-z * 0.5, z * 0.15, z * 0.55, 0, TAU); g.arc(z * 0.5, z * 0.15, z * 0.55, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(0, z * 0.2); g.lineTo(z * 0.4, z * 1.15); g.lineTo(-z * 0.4, z * 1.15); g.fill();   // 줄기
      };
      await volley(shots, 85, 300, (g, p, k, i) => {
        const w = 16 * S, h = 22 * S, spin = k * 5 + i * 0.7;
        g.save(); g.translate(Math.round(p.x), Math.round(p.y)); g.rotate(ang + spin);
        g.globalCompositeOperation = 'source-over';   // 층 전체가 더하기 섞기라 검은 문양이 사라진다
        g.fillStyle = '#14101E'; g.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
        g.fillStyle = '#FFF6E8'; g.fillRect(-w / 2, -h / 2, w, h);
        spade(g, w * 0.34, '#14101E');
        g.restore();
        trail(p.x, p.y, 1, [2, 3], ['#4FD6C8', '#FFFFFF', '#14101E']);
      }, (k, i) => line(ease(k), (i % 2 ? 1 : -1) * (16 + i * 4) * Math.sin(k * Math.PI)));
      // 꽂힌 자리에 스페이드 문양이 번쩍
      await this.add((g, k) => {
        g.save(); g.translate(Math.round(b.x), Math.round(b.y - 6 * S)); g.globalAlpha = 1 - k; g.globalCompositeOperation = 'source-over';
        spade(g, (10 + k * 10) * S, '#FFFFFF'); spade(g, (7 + k * 8) * S, '#14101E');
        g.restore();
      }, 260);
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

  // ── 속성 투사체 (숨결 · 운명 비틀기 · 얼음 · 독) ─────────────────────────────
  // 예전에는 모두 같은 네모 광선이었다. 속성마다 날아가는 모양과 맞는 순간의 폭발을 따로 그린다
  // 부드러운 빛 덩어리 (가운데 하얀 심 → 속성 색 → 투명)
  static blob(g, x, y, r, core, mid, a = 1) {
    if (r < 0.5) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(core, a)); gr.addColorStop(0.35, rgba(mid, a * 0.75)); gr.addColorStop(1, rgba(mid, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // 경로 위의 점 (살짝 휘는 곡선): s 0 → 1
  static along(from, to, s, bend = 0) {
    const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, b = Math.sin(s * Math.PI) * bend;
    return { x: from.x + dx * s + nx * b, y: from.y + dy * s + ny * b, ang: Math.atan2(dy, dx), nx, ny, L };
  }

  // 화염 숨결: 입에서 소용돌이치는 불길이 주사위로 쏟아지고, 닿는 곳마다 폭발
  async flame(from, points, ms = 700) {
    const seeds = points.map(() => rnd(0, 10));
    await this.add((g, k) => {
      const reach = Math.min(1, k / 0.32), fade = k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1;
      points.forEach((p, j) => {
        const n = 26;
        for (let i = n - 1; i >= 0; i--) {
          const s = (i / n + k * 2.6 + seeds[j]) % 1;          // 앞으로 흘러가는 불덩이들
          if (s > reach) continue;
          const q = FxLayer.along(from, p, s);
          const wob = Math.sin(s * 14 + k * 36 + i * 1.7) * (4 + s * 16);
          const x = q.x + q.nx * wob, y = q.y + q.ny * wob, r = (7 + s * 30) * fade;
          FxLayer.blob(g, x, y, r * 1.9, '#FF8A1A', '#B8141E', 0.55 * fade);
          FxLayer.blob(g, x, y, r, '#FFF6C8', '#FF8A1A', 0.9 * fade);
        }
        // 입가의 강한 섬광 · 끝머리의 불꽃
        FxLayer.blob(g, from.x, from.y, 34 * fade, '#FFFFFF', '#FFD24A', 0.8 * fade);
        if (reach >= 1) FxLayer.blob(g, p.x, p.y, (46 + Math.sin(k * 50) * 6) * fade, '#FFFFFF', '#FF8A1A', 0.85 * fade);
        if (Math.random() < 0.9) {
          const q = FxLayer.along(from, p, Math.random() * reach);
          this.spawn({ x: q.x + rnd(-10, 10), y: q.y + rnd(-10, 10), vx: rnd(-90, 90), vy: rnd(-200, -60), life: rnd(0.3, 0.6), size: rnd(2, 5), color: pick(PALETTES.fire), drag: 1.6 });
        }
      });
    }, ms);
    points.forEach(p => this.explode(p.x, p.y, 'fire'));
  }

  // 얼음: 뾰족한 얼음 창이 휘며 날아가 박히고, 결정이 깨지며 눈꽃 충격파
  async iceShards(from, points, ms = 700) {
    const N = 5, shards = points.flatMap((p, j) => Array.from({ length: N }, (_, i) => ({ p, j, t0: i * 0.07 + j * 0.03, bend: rnd(-60, 60), hit: false })));
    await this.add((g, k) => {
      for (const sh of shards) {
        const u = Math.max(0, Math.min(1, (k - sh.t0) / 0.42));
        if (u <= 0) continue;
        const s = ease(u), q = FxLayer.along(from, sh.p, s, sh.bend * (1 - u * 0.3));
        if (u < 1) {
          // 꼬리: 지나온 자리의 서리 안개
          for (let b = 1; b <= 5; b++) {
            const qq = FxLayer.along(from, sh.p, Math.max(0, s - b * 0.035), sh.bend);
            FxLayer.blob(g, qq.x, qq.y, 12 - b * 1.6, '#FFFFFF', '#7CE0FF', 0.35 * (1 - b / 6));
          }
          const d = FxLayer.along(from, sh.p, Math.min(1, s + 0.02), sh.bend), ang = Math.atan2(d.y - q.y, d.x - q.x);
          g.save(); g.translate(q.x, q.y); g.rotate(ang);
          const Ls = 30, Ws = 7;
          const lg = g.createLinearGradient(-Ls, 0, Ls * 0.6, 0);
          lg.addColorStop(0, 'rgba(58,168,255,0)'); lg.addColorStop(0.55, 'rgba(124,224,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
          g.fillStyle = lg;
          g.beginPath(); g.moveTo(Ls * 0.6, 0); g.lineTo(0, -Ws); g.lineTo(-Ls, 0); g.lineTo(0, Ws); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.beginPath(); g.moveTo(Ls * 0.6, 0); g.lineTo(2, -2); g.lineTo(-Ls * 0.4, 0); g.closePath(); g.fill();
          g.restore();
          if (Math.random() < 0.35) this.spawn({ x: q.x, y: q.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: rnd(0.25, 0.5), size: rnd(1.5, 3), color: pick(['#FFFFFF', '#C8F4FF']), drag: 2 });
        } else if (!sh.hit) {
          sh.hit = true;
          this.burst(sh.p.x, sh.p.y, { n: 10, pal: ['#FFFFFF', '#C8F4FF', '#7CE0FF'], speed: [80, 220], size: [2, 4], life: [0.25, 0.5], drag: 3 });
        }
      }
    }, ms);
    points.forEach(p => this.explode(p.x, p.y, 'frost'));
  }

  // 운명 비틀기 · 역전: 두 개의 마력 구슬이 나선을 그리며 날아가 주사위 위에 룬 마법진을 연다
  async hexBolt(from, points, ms = 700) {
    await this.add((g, k) => {
      const u = Math.min(1, k / 0.6), s = ease(u);
      for (const p of points) {
        for (const side of [1, -1]) {
          const trail = 9;
          for (let b = trail; b >= 0; b--) {
            const ss = Math.max(0, s - b * 0.03), q = FxLayer.along(from, p, ss);
            const amp = Math.sin(ss * Math.PI) * 26, ph = ss * 16 + (side > 0 ? 0 : Math.PI);
            const x = q.x + q.nx * Math.sin(ph) * amp, y = q.y + q.ny * Math.sin(ph) * amp;
            const r = b ? 9 - b * 0.7 : 12;
            FxLayer.blob(g, x, y, r * (b ? 1.6 : 2.4), b ? '#E0CCFF' : '#FFFFFF', '#7A4BFF', b ? 0.5 * (1 - b / (trail + 1)) : 1);
          }
        }
        if (u >= 1) FxLayer.rune(g, p.x, p.y, 44 * ease(Math.min(1, (k - 0.6) / 0.25)), k * 5, 1 - Math.max(0, (k - 0.85) / 0.15));
      }
    }, ms);
    points.forEach(p => this.explode(p.x, p.y, 'arcane'));
  }
  // 룬 마법진: 겹 고리 + 눈금 + 육망성
  static rune(g, x, y, r, rot, a) {
    if (r < 1 || a <= 0) return;
    g.save(); g.translate(x, y); g.scale(1, 0.62); g.rotate(rot);
    g.globalAlpha = a; g.strokeStyle = '#E0CCFF'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#B98CFF';
    g.beginPath(); g.arc(0, 0, r * 0.78, 0, TAU); g.stroke();
    for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; g.beginPath(); g.moveTo(Math.cos(an) * r * 0.82, Math.sin(an) * r * 0.82); g.lineTo(Math.cos(an) * r * 0.96, Math.sin(an) * r * 0.96); g.stroke(); }
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.8;
    for (const off of [0, Math.PI]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const an = off + (i / 3) * TAU - Math.PI / 2; const px = Math.cos(an) * r * 0.7, py = Math.sin(an) * r * 0.7; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    g.restore(); g.globalAlpha = 1;
  }

  // 독 숨결: 커다란 산성 덩어리가 포물선으로 날아가 트레이에 철퍽
  async acid(from, to, ms = 650) {
    await this.add((g, k) => {
      const s = easeIn(Math.min(1, k)) * 0.6 + k * 0.4;
      const x = from.x + (to.x - from.x) * s, y = from.y + (to.y - from.y) * s - Math.sin(s * Math.PI) * 120;
      const R = 22 + Math.sin(k * 40) * 2;
      FxLayer.blob(g, x, y, R * 2.2, '#B6F25A', '#16501A', 0.6);
      g.save(); g.globalCompositeOperation = 'source-over';
      const gr = g.createRadialGradient(x - R * 0.35, y - R * 0.35, 2, x, y, R);
      gr.addColorStop(0, '#F2FFC0'); gr.addColorStop(0.35, '#B6F25A'); gr.addColorStop(0.8, '#2E8F2A'); gr.addColorStop(1, 'rgba(22,80,26,0.9)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, R * (1 + Math.sin(k * 30) * 0.08), R * (1 - Math.sin(k * 30) * 0.08), 0, 0, TAU); g.fill();
      g.restore();
      if (Math.random() < 0.9) this.spawn({ x: x + rnd(-8, 8), y: y + rnd(0, 10), vx: rnd(-30, 30), vy: rnd(20, 80), life: rnd(0.3, 0.6), size: rnd(3, 6), color: pick(['#B6F25A', '#5FD13A', '#F2FFC0']), grav: 600, drag: 0.5 });
    }, ms);
    this.explode(to.x, to.y, 'toxic');
  }

  // 맞는 순간 (속성별)
  explode(x, y, kind) {
    const K = {
      fire:   { core: '#FFFFFF', mid: '#FF8A1A', pal: PALETTES.fire, ring: '#FFD24A', r: 70, grav: -120, smoke: true },
      frost:  { core: '#FFFFFF', mid: '#7CE0FF', pal: PALETTES.frost, ring: '#C8F4FF', r: 60, grav: 320, flake: true },
      arcane: { core: '#FFFFFF', mid: '#B98CFF', pal: PALETTES.arcane, ring: '#E0CCFF', r: 58, grav: 0 },
      toxic:  { core: '#F2FFC0', mid: '#5FD13A', pal: PALETTES.toxic, ring: '#B6F25A', r: 90, grav: 700, splash: true },
    }[kind];
    this.add((g, k) => {
      const e = ease(k);
      FxLayer.blob(g, x, y, K.r * (0.4 + e), K.core, K.mid, (1 - k) * 0.95);
      if (K.flake) {                                   // 눈꽃 결정이 커지며 사라진다
        g.save(); g.translate(x, y); g.rotate(k * 0.6);
        g.globalAlpha = 1 - k; g.strokeStyle = '#FFFFFF'; g.lineWidth = 3 * (1 - k) + 1;
        const R = 22 + e * 54;
        for (let i = 0; i < 6; i++) {
          g.rotate(TAU / 6);
          g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0);
          g.moveTo(R * 0.55, 0); g.lineTo(R * 0.72, -R * 0.16); g.moveTo(R * 0.55, 0); g.lineTo(R * 0.72, R * 0.16);
          g.stroke();
        }
        g.restore(); g.globalAlpha = 1;
      }
    }, 460);
    this.ring(x, y, { color: K.ring, r0: 10, r1: K.r * 1.3, dur: 420, width: 7 });
    this.burst(x, y, { n: 30, pal: K.pal, speed: [120, 340], size: [2, 6], life: [0.35, 0.8], drag: 2.6, grav: K.grav });
    if (K.smoke) this.burst(x, y - 8, { n: 12, pal: PALETTES.smoke, speed: [20, 70], life: [0.6, 1.1], size: [5, 10], grav: -70, drag: 1 });
    if (K.splash) this.burst(x, y, { n: 26, pal: ['#B6F25A', '#5FD13A', '#F2FFC0'], speed: [180, 380], size: [3, 7], life: [0.5, 0.9], dir: -Math.PI / 2, spread: 2.4, grav: 900, drag: 0.6 });
  }

  // ── 강화 보스 · 마신 스킬 연출 ───────────────────────────────────────────
  // 숨결 광선: 보스 입에서 주사위마다 굵은 광선이 뿜어져 나간다 (떨리는 심 · 흩날리는 불티)
  async beam(from, points, { pal = PALETTES.fire, ms = 650, width = 22 } = {}) {
    await this.add((g, k) => {
      const grow = Math.min(1, k / 0.35), fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      for (const p of points) {
        const tx = from.x + (p.x - from.x) * grow, ty = from.y + (p.y - from.y) * grow;
        const ang = Math.atan2(p.y - from.y, p.x - from.x), L = Math.hypot(tx - from.x, ty - from.y);
        g.save(); g.translate(from.x, from.y); g.rotate(ang);
        const w = width * (0.8 + Math.sin(k * 60) * 0.2) * fade;
        // 가장자리로 갈수록 투명해지는 빛줄기 세 겹 (네모 막대가 아니라 빛처럼)
        for (const [ww, col, a] of [[w * 1.6, pal[3] || pal[2], 0.35], [w * 0.8, pal[1], 0.7], [w * 0.28, '#FFFFFF', 1]]) {
          const lg = g.createLinearGradient(0, -ww, 0, ww);
          lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, rgba(col, a * fade)); lg.addColorStop(1, rgba(col, 0));
          g.fillStyle = lg; g.fillRect(0, -ww, L, ww * 2);
        }
        g.restore();
        FxLayer.blob(g, from.x, from.y, w * 2.2, '#FFFFFF', pal[2] || pal[1], 0.8 * fade);
        FxLayer.blob(g, tx, ty, w * 2.6, '#FFFFFF', pal[2] || pal[1], 0.9 * fade);
        if (Math.random() < 0.8) this.spawn({ x: tx + rnd(-10, 10), y: ty + rnd(-10, 10), vx: rnd(-120, 120), vy: rnd(-160, 40), life: rnd(0.25, 0.5), size: rnd(3, 7), color: pick(pal), drag: 2 });
      }
      g.globalAlpha = 1;
    }, ms);
    points.forEach(p => { this.impact(p.x, p.y, pal, 1.6); });
  }

  // 얼음: 주사위에서 얼음 결정이 뾰족하게 자라나 얼어붙는다
  async frost(points, ms = 800) {
    this.flash('#C8F4FF', 260, 0.35);
    await this.add((g, k) => {
      const grow = ease(Math.min(1, k / 0.45));
      for (const p of points) {
        for (let q = 0; q < 8; q++) {
          const a = (q / 8) * TAU + 0.2, L = (q % 2 ? 38 : 62) * grow;
          for (let s = 0; s < L; s += 5) {
            const sz = Math.max(3, 12 - s * 0.15);
            g.fillStyle = s > L - 8 ? '#FFFFFF' : q % 2 ? '#7CE0FF' : '#C8F4FF';
            g.fillRect(Math.round(p.x + Math.cos(a) * s - sz / 2), Math.round(p.y + Math.sin(a) * s * 0.8 - sz / 2), Math.round(sz), Math.round(sz));
          }
        }
        FxLayer.blob(g, p.x, p.y, 40 * grow, '#FFFFFF', '#7CE0FF', 0.45 * (1 - k * 0.6));   // 주사위를 감싸는 냉기 (네모 상자 없이)
      }
    }, ms);
    points.forEach(p => {
      this.ring(p.x, p.y, { color: '#FFFFFF', r0: 8, r1: 70, dur: 420, width: 6 });
      this.burst(p.x, p.y, { n: 24, pal: PALETTES.frost, speed: [80, 260], grav: 260, life: [0.4, 0.8], size: [2, 5] });
    });
  }

  // 독: 트레이 위로 초록 독안개가 퍼지고 거품이 부글부글 올라온다
  async toxic(c, w, ms = 1000) {
    await this.add((g, k) => {
      const spread = ease(Math.min(1, k / 0.4)), fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      g.save(); g.globalCompositeOperation = 'source-over';
      for (let q = 0; q < 9; q++) {                       // 뭉게뭉게 독안개 덩어리
        const x = c.x + Math.sin(q * 2.4 + k * 3) * w * 0.42 * spread, y = c.y + Math.cos(q * 1.7 + k * 2) * 60 * spread, r = (46 + (q % 3) * 18) * spread;
        g.globalAlpha = 0.16 * fade; g.fillStyle = q % 2 ? '#2E8F2A' : '#16501A';
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.restore();
      for (let q = 0; q < 26; q++) {
        const x = c.x + Math.sin(q * 7.3) * w * 0.5, y = c.y + 70 - ((k * 260 + q * 37) % 180);
        const r = 3 + (q % 4) * 2;
        g.globalAlpha = fade * 0.9; g.fillStyle = q % 3 ? '#5FD13A' : '#B6F25A';
        g.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
        g.fillStyle = '#F2FFC0'; g.fillRect(Math.round(x - r + 1), Math.round(y - r + 1), 2, 2);
      }
      g.globalAlpha = 1;
      if (Math.random() < 0.6) this.spawn({ x: c.x + rnd(-w / 2, w / 2), y: c.y - 80, vx: 0, vy: rnd(60, 140), life: 0.6, size: rnd(3, 5), color: '#B6F25A', drag: 0.5 });
    }, ms);
    this.ring(c.x, c.y, { color: '#5FD13A', r0: 20, r1: w * 0.6, dur: 500, width: 8 });
  }

  // 머리 베기: 거대한 X자 참격이 보스를 가르고 금빛 피가 튄다, 잘린 머리 조각이 날아간다
  async slash(at, size = 120, ms = 700) {
    this.flash('#FFFFFF', 200, 0.6);
    await this.add((g, k) => {
      const cuts = [[-1, -1, 1, 1, 0], [1, -1, -1, 1, 0.22]];
      for (const [x0, y0, x1, y1, d] of cuts) {
        const q = Math.max(0, Math.min(1, (k - d) / 0.25));
        if (q <= 0) continue;
        const fade = k > d + 0.4 ? Math.max(0, 1 - (k - d - 0.4) / 0.3) : 1;
        const ax = at.x + x0 * size, ay = at.y + y0 * size, bx = ax + (at.x + x1 * size - ax) * q, by = ay + (at.y + y1 * size - ay) * q;
        const ang = Math.atan2(by - ay, bx - ax), L = Math.hypot(bx - ax, by - ay);
        g.save(); g.translate(ax, ay); g.rotate(ang);
        g.globalAlpha = 0.6 * fade; g.fillStyle = '#FFD24A'; g.fillRect(0, -9, L, 18);
        g.globalAlpha = fade; g.fillStyle = '#FFFFFF'; g.fillRect(0, -3, L, 6);
        g.restore();
      }
      // 잘린 머리 조각: 위로 튀었다 떨어지며 돈다
      if (k > 0.3) {
        const t = (k - 0.3) / 0.7, x = at.x + 40 + t * 120, y = at.y - 30 - Math.sin(t * Math.PI) * 120 + t * 60;
        g.save(); g.translate(x, y); g.rotate(t * 10);
        g.fillStyle = '#7A5CFF'; g.fillRect(-14, -10, 28, 20); g.fillStyle = '#FFE24A'; g.fillRect(4, -4, 5, 5);
        g.restore();
      }
      g.globalAlpha = 1;
    }, ms);
    this.burst(at.x, at.y, { n: 60, pal: ['#FFFFFF', '#FFD24A', '#FF8A1A', '#E8435A'], speed: [120, 420], life: [0.4, 1], size: [3, 7], grav: 300 });
    this.ring(at.x, at.y, { color: '#FFD24A', r0: 20, r1: size * 1.6, dur: 600, width: 10 });
  }

  // 머리 재생: 보랏빛 촉수가 휘감겨 모이고 고동친다
  async regrow(at, ms = 800) {
    await this.add((g, k) => {
      for (let arm = 0; arm < 5; arm++) {
        for (let i = 0; i < 16; i++) {
          const t = i / 16, a = arm * (TAU / 5) + k * 6 + t * 3;
          const r = (1 - ease(k)) * 140 * (1 - t) + 18;
          g.fillStyle = PALETTES.arcane[(i + arm) % 5]; g.globalAlpha = 1 - t * 0.6;
          g.fillRect(Math.round(at.x + Math.cos(a) * r) - 4, Math.round(at.y + Math.sin(a) * r * 0.8) - 4, 8, 8);
        }
      }
      g.globalAlpha = 1;
    }, ms);
    this.ring(at.x, at.y, { color: '#B98CFF', r0: 10, r1: 110, dur: 500, width: 8 });
    this.burst(at.x, at.y, { n: 40, pal: PALETTES.arcane, speed: [80, 260], life: [0.4, 0.9] });
  }

  // 외눈 응시: 화면 가운데 거대한 눈이 번쩍 뜨이고 붉은 시선이 목표를 꿰뚫는다
  async eye(c, target, ms = 1100) {
    await this.add((g, k) => {
      const open = k < 0.25 ? ease(k / 0.25) : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      const W = Math.min(innerWidth * 0.42, 170), H = W * 0.5 * open;
      g.save(); g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.5 * open; g.fillStyle = '#0A0008'; g.fillRect(0, 0, innerWidth, innerHeight);
      g.globalAlpha = 1;
      g.fillStyle = '#1A1030'; g.beginPath(); g.ellipse(c.x, c.y, W + 6, H + 6, 0, 0, TAU); g.fill();
      g.fillStyle = '#F2EEDD'; g.beginPath(); g.ellipse(c.x, c.y, W, Math.max(1, H), 0, 0, TAU); g.fill();
      if (open > 0.3) {
        const ir = W * 0.36, px = c.x + Math.sin(k * 6) * 6;
        g.fillStyle = '#E8152A'; g.beginPath(); g.arc(px, c.y, ir, 0, TAU); g.fill();
        g.fillStyle = '#1A1030'; g.beginPath(); g.arc(px, c.y, ir * 0.45, 0, TAU); g.fill();
        g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(px - ir * 0.5), Math.round(c.y - ir * 0.5), 6, 6);
      }
      g.restore();
      if (target && k > 0.45 && k < 0.85) {                    // 시선 광선
        const ang = Math.atan2(target.y - c.y, target.x - c.x), L = Math.hypot(target.x - c.x, target.y - c.y);
        g.save(); g.translate(c.x, c.y); g.rotate(ang);
        const flick = 0.85 + Math.sin(k * 70) * 0.15;
        for (const [w, col, a] of [[22, 'rgba(232,21,42,', 0.28], [11, 'rgba(255,59,59,', 0.6], [4, 'rgba(255,255,255,', 0.95]]) {
          const lg = g.createLinearGradient(0, -w, 0, w);
          lg.addColorStop(0, col + '0)'); lg.addColorStop(0.5, col + a * flick + ')'); lg.addColorStop(1, col + '0)');
          g.fillStyle = lg; g.fillRect(0, -w, L, w * 2);
        }
        g.restore();
        FxLayer.blob(g, target.x, target.y, 34 * flick, '#FFFFFF', '#E8152A', 0.8);
        if (Math.random() < 0.7) this.spawn({ x: target.x + rnd(-14, 14), y: target.y + rnd(-14, 14), vx: rnd(-90, 90), vy: rnd(-90, 90), life: 0.4, size: rnd(3, 6), color: pick(['#FF3B3B', '#FFFFFF', '#E8152A']), drag: 2 });
      }
    }, ms);
    if (target) this.ring(target.x, target.y, { color: '#FF3B3B', r0: 10, r1: 90, dur: 450, width: 8 });
  }

  // 바위 투척: 하늘에서 거대한 바위가 굴러떨어져 쾅 — 먼지 · 파편 · 금
  async boulder(to, ms = 700) {
    const from = { x: to.x + 160, y: -80 };
    await this.add((g, k) => {
      const e = easeIn(k), x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e, R = 48;
      g.save(); g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.35 * k; g.fillStyle = '#000000'; g.beginPath(); g.ellipse(to.x, to.y + 30, R * (0.4 + k), R * 0.3 * (0.4 + k), 0, 0, TAU); g.fill();
      g.globalAlpha = 1; g.translate(x, y); g.rotate(k * 8);
      g.fillStyle = '#1A1030'; g.fillRect(-R - 3, -R - 3, R * 2 + 6, R * 2 + 6);
      g.fillStyle = '#8A8070'; g.fillRect(-R, -R, R * 2, R * 2);
      g.fillStyle = '#C8C0B0'; g.fillRect(-R, -R, R * 2, 10); g.fillRect(-R, -R, 10, R * 2);
      g.fillStyle = '#5A5040'; g.fillRect(-R, R - 10, R * 2, 10); g.fillRect(4, -6, 12, 8);
      g.restore();
      this.spawn({ x: x + rnd(-20, 20), y: y - 20, vx: rnd(-20, 20), vy: rnd(-60, -20), life: 0.4, size: rnd(3, 6), color: pick(PALETTES.smoke), drag: 1 });
    }, ms);
    this.flash('#FFFFFF', 160, 0.4);
    this.ring(to.x, to.y, { color: '#C8C0B0', r0: 20, r1: 180, dur: 520, width: 10 });
    this.burst(to.x, to.y, { n: 50, pal: ['#C8C0B0', '#8A8070', '#5A5040', '#FFFFFF'], speed: [120, 380], grav: 520, life: [0.5, 1], size: [3, 8] });
    this.burst(to.x, to.y + 20, { n: 24, pal: PALETTES.smoke, speed: [40, 120], grav: -40, life: [0.6, 1.2], size: [6, 12], drag: 1.2 });
  }

  // 사령술: 땅에서 해골 손이 솟고 영혼이 보스에게 빨려 든다
  async souls(points, to, ms = 1000) {
    await this.add((g, k) => {
      for (const [q, p] of points.entries()) {
        const up = ease(Math.min(1, k / 0.35)) * 54;
        g.fillStyle = '#F2EEDD';
        g.fillRect(Math.round(p.x - 5), Math.round(p.y - up), 10, Math.round(up));           // 팔뼈
        g.fillRect(Math.round(p.x - 14), Math.round(p.y - up - 10), 28, 10);                   // 손바닥
        for (let f = 0; f < 4; f++) g.fillRect(Math.round(p.x - 14 + f * 8), Math.round(p.y - up - 24), 5, 14);   // 손가락
        g.fillStyle = '#C9C2A6'; g.fillRect(Math.round(p.x - 14), Math.round(p.y - up - 2), 28, 2);
        if (k > 0.35) {                                                                         // 영혼이 보스로
          const t = Math.min(1, (k - 0.35 - q * 0.04) / 0.55);
          if (t > 0 && t < 1) {
            const e = easeIn(t), x = p.x + (to.x - p.x) * e + Math.sin(t * 9 + q) * 16, y = p.y - 40 + (to.y - p.y + 40) * e;
            g.globalAlpha = 1 - t * 0.4; g.fillStyle = '#C8F4FF'; g.fillRect(Math.round(x - 7), Math.round(y - 7), 14, 14);
            g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6); g.globalAlpha = 1;
            this.spawn({ x, y, vx: 0, vy: 20, life: 0.3, size: 3, color: '#9DB7D6', drag: 2 });
          }
        }
      }
    }, ms);
    this.ring(to.x, to.y, { color: '#C8F4FF', r0: 10, r1: 90, dur: 460, width: 6 });
    this.burst(to.x, to.y, { n: 30, pal: PALETTES.bone, speed: [60, 200], life: [0.4, 0.8] });
  }

  // 시간 역행: 거꾸로 도는 시계 문양 + 색 반전 섬광
  async clock(at, ms = 1000) {
    this.flash('#B98CFF', 300, 0.4);
    await this.add((g, k) => {
      const R = 70 + Math.sin(k * 20) * 4;
      g.strokeStyle = '#E0CCFF'; g.lineWidth = 5; g.globalAlpha = 1 - k * 0.5;
      g.beginPath(); g.arc(at.x, at.y, R, 0, TAU); g.stroke();
      for (let q = 0; q < 12; q++) { const a = (q / 12) * TAU; g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(at.x + Math.cos(a) * (R - 10)) - 3, Math.round(at.y + Math.sin(a) * (R - 10)) - 3, 6, 6); }
      for (const [len, sp, c] of [[R * 0.75, -30, '#FFFFFF'], [R * 0.5, -6, '#B98CFF']]) {
        const a = k * sp - Math.PI / 2;
        g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.moveTo(at.x, at.y); g.lineTo(at.x + Math.cos(a) * len, at.y + Math.sin(a) * len); g.stroke();
      }
      g.globalAlpha = 1;
    }, ms);
    this.ring(at.x, at.y, { color: '#B98CFF', r0: 80, r1: 10, dur: 400, width: 8 });
    this.burst(at.x, at.y, { n: 36, pal: PALETTES.arcane, speed: [60, 240], life: [0.4, 0.8] });
  }

  // 피의 저주: 하늘에서 핏방울이 쏟아지고 보스 앞에 붉은 문양이 새겨진다
  async blood(at, ms = 1000) {
    await this.add((g, k) => {
      g.save(); g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.22 * Math.sin(k * Math.PI); g.fillStyle = '#4A0A24'; g.fillRect(0, 0, innerWidth, innerHeight);
      for (let q = 0; q < 30; q++) {
        const x = (q * 97) % innerWidth, y = ((k * 900 + q * 53) % (innerHeight + 80)) - 40;
        g.globalAlpha = 0.9; g.fillStyle = q % 3 ? '#8E0E2E' : '#C21E56';
        g.fillRect(x, Math.round(y), 4, 14); g.fillRect(x - 1, Math.round(y) + 12, 6, 6);
      }
      g.restore();
      const r = 56 * ease(Math.min(1, k / 0.4));
      g.strokeStyle = '#FF2A6A'; g.lineWidth = 4; g.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3;
      g.beginPath(); g.arc(at.x, at.y, r, 0, TAU); g.stroke();
      g.beginPath(); for (let q = 0; q <= 3; q++) { const a = k * 2 + (q / 3) * TAU - Math.PI / 2, x = at.x + Math.cos(a) * r, y = at.y + Math.sin(a) * r; q ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.globalAlpha = 1;
    }, ms);
    this.burst(at.x, at.y, { n: 40, pal: PALETTES.hell, speed: [60, 260], grav: 200, life: [0.4, 0.9], size: [3, 6] });
  }

  // 저주 정화: 금빛 성광 기둥이 내리꽂히고 붉은 문양이 산산조각
  async holy(points, ms = 900) {
    this.flash('#FFF0A8', 300, 0.5);
    await this.add((g, k) => {
      for (const p of points) {
        const b = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
        g.globalAlpha = 0.7 * b; g.fillStyle = '#FFF0A8'; g.fillRect(Math.round(p.x - 50 * b), 0, Math.round(100 * b), Math.round(p.y + 30));
        g.globalAlpha = 0.9 * b; g.fillStyle = '#FFFFFF'; g.fillRect(Math.round(p.x - 8), 0, 16, Math.round(p.y + 30));
        for (let q = 0; q < 8; q++) { const a = (q / 8) * TAU + k * 4, r = 30 + k * 140; g.globalAlpha = 1 - k; g.fillStyle = '#FF2A6A'; g.fillRect(Math.round(p.x + Math.cos(a) * r) - 4, Math.round(p.y + Math.sin(a) * r) - 4, 8, 8); }
      }
      g.globalAlpha = 1;
    }, ms);
    points.forEach(p => { this.ring(p.x, p.y, { color: '#FFFFFF', r0: 10, r1: 160, dur: 600, width: 10 }); this.burst(p.x, p.y, { n: 50, pal: PALETTES.gold, speed: [120, 380], life: [0.4, 1] }); });
  }

  // 미드나잇: 하늘이 어두워지고 붉은 초승달이 떠오른다
  async moon(c, ms = 1000) {
    await this.add((g, k) => {
      const v = Math.sin(k * Math.PI);
      g.save(); g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.55 * v; g.fillStyle = '#05020A'; g.fillRect(0, 0, innerWidth, innerHeight);
      g.globalAlpha = v; g.fillStyle = '#FF2A6A'; g.beginPath(); g.arc(c.x, c.y, 46, 0, TAU); g.fill();
      g.fillStyle = '#05020A'; g.beginPath(); g.arc(c.x + 18, c.y - 10, 42, 0, TAU); g.fill();
      g.restore();
      for (let q = 0; q < 14; q++) { const a = (q / 14) * TAU + k * 2; g.globalAlpha = v * 0.8; g.fillStyle = q % 2 ? '#FF9AB8' : '#FFFFFF'; g.fillRect(Math.round(c.x + Math.cos(a) * 80), Math.round(c.y + Math.sin(a) * 80), 3, 3); }
      g.globalAlpha = 1;
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
