// 영웅 16프레임 모션 (assets/heroes/<직업>_motion.webp · tools/make_hero_v8.py)
// 시트 512×512 = 128×128 칸 4×4. 0~3 대기 · 4~11 공격 · 12~15 피격. 기준점(발밑) (56,116), 오른쪽을 본다.
// 시간은 원화 그대로: 대기 800ms 반복 · 공격 640ms (타격 140ms 뒤) · 피격 460ms. 연출 빠르기(spd)만큼 빨라진다.
// 캔버스에 한 칸씩 도트 그대로(번지지 않게) 그린다. 번쩍임 · 붉은 깜빡임은 그 칸 모양 그대로 색을 덧칠한다.
import { GAME } from './config.js';

export const FRAME = 128, COLS = 4, ORIGIN = { x: 56, y: 116 };
// 캐릭터 키 (칸 128px 중 그림이 차지하는 높이). 화면에서 영웅 크기를 맞출 때 쓴다
export const FIG_H = 84;
export const CLIPS = {
  idle: { frames: [0, 1, 2, 3], ms: [200, 200, 200, 200], loop: true },
  attack: { frames: [4, 5, 6, 7, 8, 9, 10, 11], ms: [70, 70, 50, 50, 70, 70, 120, 140], contact: 2 },
  hurt: { frames: [12, 13, 14, 15], ms: [70, 70, 160, 160] },
};
export const clipMs = name => CLIPS[name].ms.reduce((a, b) => a + b, 0);
const IDS = ['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper'];
export const motionURL = id => `assets/heroes/${id}_motion.webp?v=${GAME.version}`;
export const bustURL = id => `assets/heroes/${id}_bust.webp?v=${GAME.version}`;
export const hasMotion = id => IDS.includes(id);

const sheets = {};
// 모든 직업 시트를 미리 받아 둔다 (한 장 15~25KB). 연출이 시작될 때 이미 풀려 있어야 한다
export function preloadMotion() {
  if (typeof Image === 'undefined') return;
  for (const id of IDS) {
    if (sheets[id]) continue;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => im.decode?.().catch(() => {});
    im.src = motionURL(id);
    sheets[id] = im;
    const b = new Image(); b.decoding = 'async'; b.src = bustURL(id);   // 작은 초상화 (상반신)
  }
}
export const motionReady = id => !!sheets[id]?.complete && sheets[id].naturalWidth > 0;

// 칸 하나 그리기. tint = { color, a } 면 그 칸 모양 그대로 색을 덧칠한다 (번쩍임)
const tmp = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function drawFrame(g, id, f, tint) {
  const im = sheets[id];
  const sx = (f % COLS) * FRAME, sy = Math.floor(f / COLS) * FRAME;
  g.clearRect(0, 0, FRAME, FRAME);
  g.imageSmoothingEnabled = false;
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
    if (!clip.loop && step >= clip.ms.length) {   // 끝 → 대기로
      if (this.onContact && !this.hit) { this.hit = true; this.onContact(); }
      this.state = 'idle'; this.t0 = now; this.tintFn = null; this.onContact = null;
      const d = this.done; this.done = null; d?.();
      requestAnimationFrame(this.tick);
      return;
    }
    if (clip.contact != null && step >= clip.contact && !this.hit) { this.hit = true; this.onContact?.(); }
    const k = clip.loop ? 0 : el / clipMs(this.state);
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
