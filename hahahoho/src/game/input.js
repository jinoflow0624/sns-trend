// 입력: 터치로 이동(누른 곳까지 길찾기, 누른 채 끌면 그 방향으로 걷기) · 가상 조이스틱 · 키보드.

export class Input {
  constructor({ canvas, game, renderer, settings, joyEl, onAction, onKey }) {
    Object.assign(this, { canvas, game, renderer, settings, joyEl, onAction, onKey });
    this.ptr = null;
    this.bind();
  }

  setGame(g) { this.game = g; }

  joystickMode() { return this.settings.control === 'joystick'; }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('pointermove', e => this.move(e));
    c.addEventListener('pointerup', e => this.up(e));
    c.addEventListener('pointercancel', e => this.up(e, true));
    c.addEventListener('contextmenu', e => e.preventDefault());
    this.onKeyDown = e => {
      if (e.target.closest?.('input, textarea')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (this.onKey?.(k, e)) { e.preventDefault(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].includes(k)) {
        this.game?.keys.add(k);
        e.preventDefault();
      }
    };
    this.onKeyUp = e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.game?.keys.delete(k);
    };
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', () => this.game?.keys.clear());
  }

  inJoyZone(e) {
    const r = this.canvas.getBoundingClientRect();
    const lefty = this.settings.lefty;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    return y > 0.45 && (lefty ? x > 0.55 : x < 0.5);
  }

  down(e) {
    if (!this.game || this.ptr) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const joy = this.joystickMode() && this.inJoyZone(e);
    this.ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), joy, drag: false };
    if (joy) this.showJoy(e.clientX, e.clientY, 0, 0);
  }

  move(e) {
    const p = this.ptr;
    if (!p || p.id !== e.pointerId || !this.game) return;
    p.x = e.clientX; p.y = e.clientY;
    const dx = p.x - p.x0; const dy = p.y - p.y0;
    const dist = Math.hypot(dx, dy);
    if (p.joy) {
      const R = 46;
      const k = Math.min(1, dist / R);
      const nx = dist ? dx / dist : 0; const ny = dist ? dy / dist : 0;
      const dead = k < 0.18;
      this.game.joy = dead ? { x: 0, y: 0 } : { x: nx * k, y: ny * k };
      this.showJoy(p.x0, p.y0, nx * Math.min(dist, R), ny * Math.min(dist, R));
      return;
    }
    // 누른 채 끌면 손가락 쪽으로 걷기
    if (!p.drag && (dist > 14 || performance.now() - p.t0 > 260)) p.drag = dist > 6 || performance.now() - p.t0 > 260;
    if (p.drag) this.steerToward(p.x, p.y);
  }

  steerToward(sx, sy) {
    const g = this.game;
    const r = this.canvas.getBoundingClientRect();
    const w = this.renderer.toWorld(sx - r.left, sy - r.top);
    const dx = w.x - g.px; const dy = w.y - (g.py - 0.4);
    const d = Math.hypot(dx, dy);
    g.path = null;
    g.pending = null;
    g.joy = d < 0.35 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
  }

  up(e, cancel = false) {
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    this.ptr = null;
    if (this.game) this.game.joy = { x: 0, y: 0 };
    this.hideJoy();
    if (cancel || p.joy || !this.game) return;
    const dt = performance.now() - p.t0;
    if (!p.drag || (Math.hypot(p.x - p.x0, p.y - p.y0) < 10 && dt < 450)) {
      const r = this.canvas.getBoundingClientRect();
      const w = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
      this.game.tapWorld(w.x, w.y);
    }
  }

  showJoy(x, y, kx, ky) {
    const el = this.joyEl;
    if (!el) return;
    el.style.display = 'block';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.firstElementChild.style.transform = `translate(${kx}px, ${ky}px)`;
  }
  hideJoy() { if (this.joyEl) this.joyEl.style.display = 'none'; }

  destroy() {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
  }
}
