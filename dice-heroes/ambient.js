// 배경 분위기 입자 — 화면 위에 아주 옅게 깔리는 가벼운 캔버스 한 장 (트레이 · 손패 위는 비운다).
//   stars   : 대전(봇 · 온라인) — 별빛이 가볍게 반짝인다
//   embers  : 협동 보스전 — 불씨가 떠오른다. 보스가 스킬을 쓰면 surge() 로 잠깐 더 밝고 크게
//   forest  : 원정 1막 어둠의 숲 — 반딧불
//   frost   : 원정 2막 얼어붙은 폐허 — 눈송이
//   castle  : 원정 3막 마왕성 — 보라 불꽃
// 데이터를 쓰지 않는다 (그림 파일 없음). 초당 30번까지만 그리고, 화면이 가려지면 멈춘다.
// 어떤 분위기를 깔지는 setAmbientSource(fn) 이 0.5초마다 물어본다: fn() → { mode, color, hot } 또는 null
const MODES = {
  stars:  { n: 34, spawn: 'all' },
  embers: { n: 26, spawn: 'bottom' },
  forest: { n: 18, spawn: 'all' },
  frost:  { n: 30, spawn: 'top' },
  castle: { n: 24, spawn: 'bottom' },
};
let cv = null, g = null, want = null, cur = null, parts = [], raf = 0, last = 0, src = null, poll = 0;
let surgeAmt = 0;            // 0~1: 보스 스킬 직후 불씨가 밝고 커진다
// 화면 위에 아주 옅게 깔리되, 트레이 · 손패 위에는 그리지 않는다 (주사위 · 카드가 가려지지 않게). 0.5초마다 위치를 다시 잰다
const AVOID = '#tray, .tray, .hand, .modal, .deck-box, .split';
let holes = [];
const inHole = (x, y) => holes.some(r => x >= r.l && x <= r.r && y >= r.t && y <= r.b);
const W = () => innerWidth, H = () => innerHeight;
const rnd = (a, b) => a + Math.random() * (b - a);

function ensure() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.className = 'ambient-canvas';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  g = cv.getContext('2d');
  const fit = () => { cv.width = Math.round(W() / 2); cv.height = Math.round(H() / 2); };   // 반 해상도 (도트 느낌 · 가볍게)
  fit();
  addEventListener('resize', fit);
}

function make(mode, first) {
  const w = W() / 2, h = H() / 2, m = MODES[mode];
  const y = m.spawn === 'bottom' ? (first ? rnd(0, h) : h + 4) : m.spawn === 'top' ? (first ? rnd(0, h) : -4) : rnd(0, h);
  const p = { x: rnd(0, w), y, t: rnd(0, 6.28), life: 0, max: rnd(4, 9) };
  if (mode === 'stars') Object.assign(p, { s: Math.random() < 0.2 ? 2 : 1, sp: rnd(0.6, 1.8), max: rnd(6, 14) });
  if (mode === 'embers') Object.assign(p, { vx: rnd(-6, 6), vy: rnd(-16, -8), s: Math.random() < 0.4 ? 3 : 2 });
  if (mode === 'forest') Object.assign(p, { vx: rnd(-4, 4), vy: rnd(-4, 4), s: 2 });
  if (mode === 'frost') Object.assign(p, { vx: rnd(-3, 3), vy: rnd(5, 11), s: Math.random() < 0.35 ? 2 : 1, max: 30 });
  if (mode === 'castle') Object.assign(p, { vx: rnd(-3, 3), vy: rnd(-12, -6), s: Math.random() < 0.4 ? 3 : 2 });
  return p;
}

function color(mode, p, a) {
  if (mode === 'stars') return `rgba(255,255,240,${a})`;
  if (mode === 'embers') return cur?.color ? hexA(cur.color, a) : `rgba(255,${150 + Math.round(p.t * 10) % 80},60,${a})`;
  if (mode === 'forest') return `rgba(200,255,120,${a})`;
  if (mode === 'frost') return `rgba(220,240,255,${a})`;
  return `rgba(${190 + Math.round(p.t * 9) % 60},110,255,${a})`;
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function frame(now) {
  raf = 0;
  if (!cur || document.hidden) return;
  if (now - last < 33) { raf = requestAnimationFrame(frame); return; }     // 초당 30번까지만
  const dt = Math.min(0.1, (now - last) / 1000 || 0.033);
  last = now;
  const mode = cur.mode, m = MODES[mode], w = W() / 2, h = H() / 2;
  const hot = Math.min(1, (cur.hot ? 0.5 : 0) + surgeAmt);
  surgeAmt = Math.max(0, surgeAmt - dt * 0.6);
  while (parts.length < m.n * (1 + hot)) parts.push(make(mode, false));
  g.clearRect(0, 0, cv.width, cv.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt; p.t += dt;
    if (p.vx != null) { p.x += (p.vx + Math.sin(p.t * 1.3) * 3) * dt * (1 + hot); p.y += p.vy * dt * (1 + hot * 1.5); }
    let a;
    if (mode === 'stars') a = 0.15 + 0.55 * Math.max(0, Math.sin(p.t * p.sp));
    else if (mode === 'forest') a = 0.2 + 0.6 * Math.max(0, Math.sin(p.t * 1.7));
    else a = Math.min(1, p.life * 2) * Math.max(0, 1 - p.life / p.max);
    a *= mode === 'embers' || mode === 'castle' ? 0.7 + hot * 0.3 : 0.75;
    const s = p.s + ((mode === 'embers' || mode === 'castle') && hot > 0.3 ? 1 : 0);
    if (!inHole(p.x * 2, p.y * 2)) {
      g.fillStyle = color(mode, p, a.toFixed(3));
      g.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      if ((mode === 'embers' || mode === 'castle' || mode === 'forest') && s > 1 && a > 0.3) {     // 큰 입자는 둘레가 은은하게
        g.fillStyle = color(mode, p, (a * 0.25).toFixed(3));
        g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, s + 2, s + 2);
      }
    }
    if (p.life > p.max || p.y < -8 || p.y > h + 8 || p.x < -8 || p.x > w + 8) parts.splice(i, 1);
  }
  raf = requestAnimationFrame(frame);
}

function apply(next) {
  const key = next ? `${next.mode}|${next.color || ''}|${next.hot ? 1 : 0}` : '';
  if (key === (cur ? `${cur.mode}|${cur.color || ''}|${cur.hot ? 1 : 0}` : '')) return;
  const modeChanged = (next?.mode || null) !== (cur?.mode || null);
  cur = next;
  if (!cur) { parts = []; if (cv) { g.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; } return; }
  ensure();
  cv.style.display = '';
  if (modeChanged) { parts = []; for (let i = 0; i < MODES[cur.mode].n; i++) parts.push(make(cur.mode, true)); }
  if (!raf) raf = requestAnimationFrame(frame);
}

// 어떤 분위기를 깔지 물어볼 함수 (app.js). 0.5초마다 묻는다
export function setAmbientSource(fn) {
  src = fn;
  clearInterval(poll);
  const check = () => {
    let v = null; try { v = src?.() || null; } catch { v = null; } if (v && !MODES[v.mode]) v = null;
    apply(v);
    if (cur) holes = [...document.querySelectorAll(AVOID)].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height).map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom }));
  };
  check();
  poll = setInterval(check, 500);
}
// 보스가 스킬을 쓸 때: 불씨가 잠깐 더 밝고 크게 (power 0~1)
export function ambientSurge(power = 1) {
  surgeAmt = Math.min(1, surgeAmt + power);
  if (cur && !raf) raf = requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && cur && !raf) { last = 0; raf = requestAnimationFrame(frame); } });
