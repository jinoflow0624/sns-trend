// 2D 주사위 트레이 — 3D(WebGL)를 쓸 수 없는 기기용 대체 화면.
// dice3d.js 의 DiceTray 와 같은 방식으로 부른다 (attach · show · setHeld · setTarget · roll · morph · screenPos …).
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const face = v => [...Array(9)].map((_, i) => `<i class="${v && PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('');
const wait = ms => new Promise(r => setTimeout(r, ms));

export function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export class DiceTray2D {
  constructor(host, { onPick, onLong, onThrow } = {}) {
    this.onThrow = onThrow || (() => {});
    this.onPick = onPick || (() => {});
    this.onLong = onLong || (() => {});
    this.el = document.createElement('div');
    this.el.className = 'tray2d';
    this.values = [];
    this.held = [];
    this.target = false;
    this.anim = null;
    this.dice = [];
    this.el.addEventListener('pointerdown', e => {
      const b = e.target.closest('.d2');
      if (!b || this.anim) return;
      const i = Number(b.dataset.i);
      this.press = { i, long: false, timer: setTimeout(() => { if (this.press?.i === i) { this.press.long = true; this.onLong(i, e); } }, 450) };
    });
    this.el.addEventListener('pointerup', () => {
      const p = this.press; this.press = null;
      if (p) { clearTimeout(p.timer); if (!p.long && !this.anim) this.onPick(p.i); }
    });
    this.el.addEventListener('pointerleave', () => { if (this.press) clearTimeout(this.press.timer); this.press = null; });
    this.attach(host);
  }

  attach(host) {
    if (this.host === host) return;
    this.host = host;
    host.appendChild(this.el);
  }

  draw(rolling = []) {
    this.el.innerHTML = this.values.map((v, i) =>
      `<button class="d2${v === 1 ? ' one' : ''}${this.held[i] ? ' held' : ''}${!v ? ' blank' : ''}${rolling[i] ? ' rolling' : ''}${this.target && v ? ' target' : ''}" data-i="${i}" aria-label="주사위 ${v || '-'}">${face(v)}</button>`).join('');
    this.dice = this.values.map((v, i) => ({ value: v, el: this.el.children[i] }));
  }

  show(values, held = []) {
    if (this.anim) return;
    this.values = values.slice();
    this.held = values.map((_, i) => !!held[i]);
    this.draw();
  }

  setHeld(held) { this.held = this.values.map((_, i) => !!held[i]); this.draw(); }
  setTarget(on) { this.target = on; this.draw(); }

  screenPos(i) {
    const el = this.el.children[i] || this.el;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // 굴리는 주사위의 눈을 빠르게 바꾸다가 결과에서 멈춘다
  async roll(values, rolling, speed = 1) {
    this.anim = true;
    this.onThrow();
    this.held = values.map(() => false);
    const steps = Math.round(9 / speed);
    for (let k = 0; k < steps; k++) {
      this.values = values.map((v, i) => (rolling[i] ? 1 + Math.floor(Math.random() * 6) : v));
      this.draw(rolling);
      await wait(55);
    }
    this.values = values.slice();
    this.anim = null;
    this.draw();
  }

  async morph(i, v, kind, ms = 900) {
    const el = this.el.children[i];
    el?.classList.add(kind === 'burn' ? 'burn' : 'twist');
    await wait(ms * 0.6);
    this.values[i] = v;
    this.draw();
    await wait(ms * 0.4);
  }

  quake() { this.el.classList.remove('quake'); void this.el.offsetWidth; this.el.classList.add('quake'); }
  absorb() { this.el.classList.add('absorb'); }
  restore() { this.el.classList.remove('absorb'); }
}
