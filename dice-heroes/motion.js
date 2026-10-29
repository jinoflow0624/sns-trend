// 영웅 32프레임 모션 (assets/heroes/<직업>_motion.webp · tools/make_hero_hd.py) — HD 선화
// 시트 = 384×384 칸 4열 × 8행. 0~3 대기 · 4~11 공격 · 12~15 피격 · 16~23 승리 · 24~31 패배. 기준점(발밑) (174,357), 오른쪽을 본다.
// 시간은 원화 그대로: 대기 800ms 반복 · 공격 640ms (타격 140ms 뒤) · 피격 460ms · 승리 1460ms · 패배 2170ms (뒤 둘은 마지막 자세 유지).
// 선화라 캔버스에 부드럽게(선형 필터) 그린다. 번쩍임 · 붉은 깜빡임은 그 칸 모양 그대로 색을 덧칠한다.
// 시트는 한 장 0.6~1MB 라 다 받지 않고, 이번 판에 나오는 직업만 싸움 화면을 열기 전에 받는다 (loadMotion · stageReady)
import { GAME } from './config.js';

export const FRAME = 384, COLS = 4, ORIGIN = { x: 174, y: 357 };
// 캐릭터 키 (칸 384px 중 대기 자세가 차지하는 높이). 화면에서 영웅 크기를 맞출 때 쓴다
export const FIG_H = 306;
export const CLIPS = {
  idle: { frames: [0, 1, 2, 3], ms: [200, 200, 200, 200], loop: true },
  attack: { frames: [4, 5, 6, 7, 8, 9, 10, 11], ms: [70, 70, 60, 60, 90, 90, 100, 100], contact: 2 },
  hurt: { frames: [12, 13, 14, 15], ms: [80, 100, 140, 140] },
  victory: { frames: [16, 17, 18, 19, 20, 21, 22, 23], ms: [100, 100, 130, 130, 120, 130, 150, 600], hold: true },
  defeat: { frames: [24, 25, 26, 27, 28, 29, 30, 31], ms: [100, 110, 140, 180, 200, 200, 240, 1000], hold: true },
};
export const clipMs = name => CLIPS[name].ms.reduce((a, b) => a + b, 0);
const IDS = ['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper'];
export const motionURL = id => `assets/heroes/${id}_motion.webp?v=${GAME.version}`;
export const bustURL = id => `assets/heroes/${id}_bust.webp?v=${GAME.version}`;
export const hasMotion = id => IDS.includes(id);
// 보스 상반신 (체력바 옆 칸 · tools/make_boss_bust.py). 전신은 보스가 공격할 때 크게 나온다
const BOSS_IDS = ['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon'];
// 정면을 보는 보스는 몸을 오른쪽(영웅 쪽)으로 살짝 돌려 그린다 (화염룡 · 세머리 용은 원래 오른쪽을 본다)
// 왼쪽을 보는 보스(오크)는 좌우를 뒤집는다
export const bossFlips = id => id === 'orc';
export const bossTurns = id => BOSS_IDS.includes(id) && !['dragon', 'hydra', 'orc'].includes(id);
// 보스 그림에 붙일 class (뒤집기 · 돌리기)
export const bossFaceCls = id => (bossFlips(id) ? ' flip-x' : bossTurns(id) ? ' turn-r' : '');
export const bossBustURL = id => (BOSS_IDS.includes(id) ? `assets/boss/${id}_bust.webp?v=${GAME.version}` : null);

const sheets = {};
let small = false;
// 작은 그림(영웅 상반신 · 보스 상반신)은 처음 한 번 모두, 모션 시트는 ids 만 받는다. 다 받고 풀리면 끝나는 Promise
export function loadMotion(ids = []) {
  if (typeof Image === 'undefined') return Promise.resolve();
  if (!small) {
    small = true;
    for (const id of IDS) { const b = new Image(); b.decoding = 'async'; b.src = bustURL(id); }
    for (const id of BOSS_IDS) { const b = new Image(); b.decoding = 'async'; b.src = bossBustURL(id); }
  }
  return Promise.all([...new Set(ids)].filter(hasMotion).map(id => {
    if (!sheets[id]) {
      const im = new Image();
      im.decoding = 'async';
      im.src = motionURL(id);
      im.ready = im.decode ? im.decode().catch(() => {}) : new Promise(r => { im.onload = im.onerror = r; });
      sheets[id] = im;
    }
    return sheets[id].ready;
  }));
}
export const preloadMotion = () => loadMotion();
export const motionReady = id => !!sheets[id]?.complete && sheets[id].naturalWidth > 0;

// 칸 하나 그리기. tint = { color, a } 면 그 칸 모양 그대로 색을 덧칠한다 (번쩍임)
const tmp = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function drawFrame(g, id, f, tint) {
  const im = sheets[id];
  const sx = (f % COLS) * FRAME, sy = Math.floor(f / COLS) * FRAME;
  g.clearRect(0, 0, FRAME, FRAME);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(im, sx, sy, FRAME, FRAME, 0, 0, FRAME, FRAME);
  if (tint && tint.a > 0.01) {
    tmp.width = tmp.height = FRAME;
    const t = tmp.getContext('2d');
    t.clearRect(0, 0, FRAME, FRAME);
    t.drawImage(im, sx, sy, FRAME, FRAME, 0, 0, FRAME, FRAME);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = tint.color;
    t.fillRect(0, 0, FRAME, FRAME);
    t.globalCompositeOperation = 'source-over';
    g.globalAlpha = Math.min(1, tint.a);
    g.drawImage(tmp, 0, 0);
    g.globalAlpha = 1;
  }
}

// 한 영웅의 재생기. canvas 는 128×128. 화면에서 떨어지면 스스로 멈춘다
export class HeroMotion {
  constructor(canvas, id) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.id = id;
    canvas.width = canvas.height = FRAME;
    this.state = 'idle'; this.t0 = performance.now(); this.spd = 1; this.tintFn = null; this.done = null; this.onContact = null; this.hit = false;
    this.tick = this.tick.bind(this);
    this.last = -1;
    requestAnimationFrame(this.tick);
  }
  // 동작 하나. 끝나면 대기로 돌아가고 Promise 가 풀린다. onContact: 타격 순간 (공격만 · 한 번)
  play(state, { spd = 1, tint = null, onContact = null } = {}) {
    if (this.done) this.done();   // 하던 동작은 끊는다 (피격이 공격을 끊을 수 있다)
    this.state = state; this.spd = spd; this.t0 = performance.now(); this.tintFn = tint; this.onContact = onContact; this.hit = false; this.last = -1;
    return new Promise(r => { this.done = () => { this.done = null; r(); }; });
  }
  // 대기 중에도 덧칠만 (기운 받기: 하얗게 달아오른다)
  glow(tint) { this.tintFn = tint; this.t1 = performance.now(); this.last = -1; }
  tick(now) {
    if (!this.cv.isConnected) { this.done?.(); return; }
    const clip = CLIPS[this.state];
    let el = (now - this.t0) * this.spd;
    let step = 0, acc = 0;
    if (clip.loop) el %= clipMs(this.state);
    for (; step < clip.ms.length; step++) { if (el < acc + clip.ms[step]) break; acc += clip.ms[step]; }
    if (clip.hold && step >= clip.ms.length) {     // 승리 · 패배: 마지막 자세 그대로 (다음 play 까지)
      step = clip.ms.length - 1;
      if (this.done) { const d = this.done; this.done = null; d(); }
    } else if (!clip.loop && step >= clip.ms.length) {   // 끝 → 대기로
      if (this.onContact && !this.hit) { this.hit = true; this.onContact(); }
      this.state = 'idle'; this.t0 = now; this.tintFn = null; this.onContact = null;
      const d = this.done; this.done = null; d?.();
      requestAnimationFrame(this.tick);
      return;
    }
    if (clip.contact != null && step >= clip.contact && !this.hit) { this.hit = true; this.onContact?.(); }
    const k = clip.loop ? 0 : Math.min(1, el / clipMs(this.state));
    const tint = this.tintFn ? this.tintFn(clip.loop ? Math.min(1, (now - (this.t1 || this.t0)) * this.spd / 420) : k) : null;
    const key = `${this.state}:${step}:${tint ? tint.color + Math.round(tint.a * 20) : ''}`;
    if (key !== this.last) { drawFrame(this.g, this.id, clip.frames[step], tint); this.last = key; }
    requestAnimationFrame(this.tick);
  }
}

// 동작별 덧칠 (k = 0~1 진행)
export const TINTS = {
  charge: k => ({ color: '#FFFFFF', a: [0, .2, .1, .3, .25, .45][Math.min(5, Math.floor(k * 6))] }),
  // 공격: 기운이 남아 살짝 하얗다가 칼을 휘두르는 순간(타격 140ms 전)에는 원래 색 — 동작이 또렷이 보여야 한다
  attack: k => (k < .22 ? { color: '#FFFFFF', a: .3 * (1 - k / .22) } : null),
  // 피격: 아주 잠깐 하얗게 → 붉게 두 번 깜빡 (짧게 · 옅게 — 휘청이는 동작이 보이게)
  hurt: k => (k < .1 ? { color: '#FFFFFF', a: .7 } : (k > .18 && k < .28) || (k > .4 && k < .5) ? { color: '#FF2A4A', a: .42 } : null),
};
