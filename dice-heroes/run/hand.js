// 원정 손패 — 카드마다 스프링 물리로 움직인다.
// 펼쳐진 부채꼴, 누르면 들리고, 끌면 손가락을 바짝 따라오며 속도만큼 기울고,
// 적(위)에 놓으면 공격 · 영웅(아래)에 놓으면 방어, 위로 튕겨 올려도 공격. 놓친 카드는 출렁이며 제자리로.
const SPRING = { k: 240, c: 21 };      // 보통: 살짝 출렁이며 자리 잡는다
const DRAG = { k: 900, c: 52 };        // 끌 때: 손가락을 바짝 따라온다
const FLY = { k: 620, c: 34 };         // 던질 때
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Hand {
  constructor(host, opt) {
    this.host = host;
    this.o = opt;
    this.list = [];
    this.sel = null;
    this.raf = 0;
    this.last = 0;
    this.drag = null;
    this.btns = document.createElement('div');
    this.btns.className = 'hand-btns';
    host.appendChild(this.btns);
    this.on = [
      [host, 'pointerdown', e => this.down(e)],
      [window, 'pointermove', e => this.move(e), { passive: false }],
      [window, 'pointerup', e => this.up(e)],
      [window, 'pointercancel', e => this.up(e, true)],
      [window, 'resize', () => this.layout()],
      [host, 'contextmenu', e => e.preventDefault()],
    ];
    this.on.forEach(([t, ev, fn, o]) => t.addEventListener(ev, fn, o));
  }
  destroy() {
    this.on.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    cancelAnimationFrame(this.raf);
    clearTimeout(this.drag?.long);
    this.clearAim();
    this.host.innerHTML = '';
    this.list = [];
  }
  get cw() { return this.list[0]?.el.offsetWidth || 82; }
  get ch() { return this.list[0]?.el.offsetHeight || 114; }
  find(u) { return this.list.find(c => c.u === u); }
  el(u) { return this.find(u)?.el; }
  inHand() { return this.list.filter(c => c.mode === 'hand' || c.mode === 'drag' || c.mode === 'held'); }

  // ── 만들기 · 맞추기 ──────────────────────────────────────────────────────
  make(card, at) {
    const el = document.createElement('div');
    el.className = 'rc';
    el.dataset.u = card.u;
    this.host.insertBefore(el, this.btns);
    const it = { u: card.u, card, el, key: '', score: null, mode: 'hand', spring: SPRING,
      x: at.x, y: at.y, r: at.r || 0, s: at.s ?? 1, vx: 0, vy: 0, vr: 0, vs: 0,
      tx: at.x, ty: at.y, tr: 0, ts: 1, ax: 0, ay: 0, z: 1 };
    this.paintCard(it, true);
    return it;
  }
  // 더미 위치 (호스트 기준): 뽑을 더미는 왼쪽 아래, 버린 더미는 오른쪽 아래 바깥
  pile(kind) {
    const W = this.host.clientWidth, H = this.host.clientHeight;
    return kind === 'draw' ? { x: -this.cw * 0.9, y: H * 0.6, r: -40, s: 0.55 } : { x: W + this.cw * 0.2, y: H * 0.6, r: 50, s: 0.55 };
  }
  set(cards, how = 'instant') {
    this.list.forEach(c => c.el.remove());
    this.list = [];
    if (how === 'deal') return this.draw(cards);
    cards.forEach(c => this.list.push(this.make(c, { x: 0, y: 0 })));
    this.layout(true);
    return Promise.resolve();
  }
  async draw(cards) {
    for (const c of cards) {
      if (this.find(c.u)) continue;
      const it = this.make(c, this.pile('draw'));
      this.list.push(it);
      this.layout();
      this.o.sound?.('draw');
      await wait(reduced() ? 0 : 80);
    }
    await wait(reduced() ? 0 : 220);
  }
  async discardAll(us) {
    const out = this.list.filter(c => us.includes(c.u));
    out.forEach((it, i) => setTimeout(() => this.toPile(it), reduced() ? 0 : i * 55));
    await wait(reduced() ? 60 : 180 + out.length * 55);
  }
  toPile(it, kind = 'discard') {
    const p = this.pile(kind);
    it.mode = 'gone';
    it.spring = FLY;
    Object.assign(it, { tx: p.x, ty: p.y, tr: p.r, ts: 0.45 });
    it.el.classList.add('leaving');
    this.kick();
    setTimeout(() => { it.el.remove(); this.list = this.list.filter(c => c !== it); }, 420);
  }
  async swap(outU, card, index) {
    const it = this.find(outU);
    if (it) { it.el.classList.add('swap-out'); this.toPile(it); }
    await wait(140);
    if (card) {
      const n = this.make(card, this.pile('draw'));
      const hand = this.inHand();
      const before = hand[index];
      this.list.splice(before ? this.list.indexOf(before) : this.list.length, 0, n);
      this.layout();
    }
    await wait(260);
  }

  // ── 그리기 ───────────────────────────────────────────────────────────────
  paintCard(it, force = false) {
    const sc = this.o.score(it.card);
    const bet = this.o.bet?.(it.u), gaze = this.o.gazed?.(it.u);
    const key = `${sc}|${bet}|${gaze}`;
    if (!force && key === it.key) return;
    const prev = it.score;
    it.key = key;
    it.score = sc;
    it.el.innerHTML = this.o.face(it.card, sc);
    it.el.classList.toggle('live', sc > 0);
    it.el.classList.toggle('dead', sc === 0);
    it.el.classList.toggle('bet', !!bet);
    it.el.classList.toggle('gazed', !!gaze);
    if (gaze) it.el.insertAdjacentHTML('beforeend', '<i class="rc-gaze"></i>');
    if (bet) it.el.insertAdjacentHTML('beforeend', '<i class="rc-bet">배팅</i>');
    if (!force && sc != null && prev != null && sc !== prev) {
      const em = it.el.querySelector('.rc-pts');
      em?.classList.add(sc > prev ? 'up' : 'down');
      if (sc > 0 && !(prev > 0)) {           // 막 살아난 카드: 반짝
        it.el.classList.remove('pop'); void it.el.offsetWidth; it.el.classList.add('pop');
        it.vs += 4;                           // 톡 튄다
        this.kick();
      }
    }
  }
  refresh() {
    this.list.forEach(it => this.paintCard(it));
    if (this.sel != null && !this.find(this.sel)) this.select(null);
    this.placeBtns();
  }

  // 부채꼴 배치
  layout(snap = false) {
    const hand = this.inHand();
    const n = hand.length;
    const W = this.host.clientWidth, H = this.host.clientHeight;
    const cw = this.cw, ch = this.ch;
    const spread = n > 1 ? Math.min(cw * 0.94, (W - cw - 6) / (n - 1)) : 0;
    const si = hand.findIndex(c => c.u === this.sel);
    hand.forEach((it, i) => {
      if (it.mode !== 'hand') return;
      const k = i - (n - 1) / 2;
      let x = W / 2 + k * spread - cw / 2, y = H - ch + 4 + k * k * 3.2, r = k * 4.2, s = 1;
      if (si >= 0) {
        if (i === si) { y -= 34; r = 0; s = 1.1; }
        else x += Math.sign(i - si) * Math.max(0, 22 - Math.abs(i - si) * 6);
      }
      Object.assign(it, { tx: x, ty: y, tr: r, ts: s, spring: SPRING, z: i === si ? 50 : i + 1 });
      if (snap) Object.assign(it, { x, y, r, s, vx: 0, vy: 0, vr: 0, vs: 0 });
    });
    this.kick();
    this.placeBtns();
  }
  select(u, html = '') {
    this.sel = u;
    this.list.forEach(it => it.el.classList.toggle('sel', it.u === u));
    this.btns.innerHTML = u != null ? html : '';
    this.layout();
  }
  placeBtns() {
    const it = this.sel != null && this.find(this.sel);
    if (!it) { this.btns.style.display = 'none'; return; }
    this.btns.style.display = '';
    const W = this.host.clientWidth;
    const bw = this.btns.offsetWidth || 180;
    this.btns.style.left = `${clamp(it.tx + this.cw / 2 - bw / 2, 2, W - bw - 2)}px`;
    this.btns.style.top = `${it.ty - 46}px`;
  }

  // ── 물리 ─────────────────────────────────────────────────────────────────
  kick() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.tick(t)); } }
  tick(t) {
    const dt = Math.min(0.033, (t - this.last) / 1000);
    this.last = t;
    let busy = !!this.drag;
    for (const it of this.list) {
      const { k, c } = reduced() && it.mode !== 'drag' ? { k: 2000, c: 90 } : it.spring;
      const step = (p, v, target) => {
        const a = k * (it[target] - it[p]) - c * it[v];
        it[v] += a * dt;
        it[p] += it[v] * dt;
        return Math.abs(it[v]) > 0.02 || Math.abs(it[target] - it[p]) > 0.05;
      };
      const px = it.x;
      let m = step('x', 'vx', 'tx');
      m = step('y', 'vy', 'ty') || m;
      m = step('r', 'vr', 'tr') || m;
      m = step('s', 'vs', 'ts') || m;
      // 끄는 동안: 가로 속도만큼 기울고(진자) 3D 로 젖혀진다
      const spd = dt ? (it.x - px) / dt : 0;
      const wantX = it.mode === 'drag' ? clamp(-it.vy * 0.025, -24, 24) : 0;
      const wantY = it.mode === 'drag' ? clamp(spd * 0.03, -28, 28) : 0;
      it.ax += (wantX - it.ax) * Math.min(1, dt * 14);
      it.ay += (wantY - it.ay) * Math.min(1, dt * 14);
      if (Math.abs(it.ax) > 0.1 || Math.abs(it.ay) > 0.1) m = true;
      if (it.mode === 'drag') it.tr = clamp(spd * 0.035, -22, 22);
      it.el.style.transform = `translate3d(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px,0) perspective(640px) rotateX(${it.ax.toFixed(1)}deg) rotateY(${it.ay.toFixed(1)}deg) rotate(${it.r.toFixed(2)}deg) scale(${it.s.toFixed(3)})`;
      it.el.style.zIndex = it.mode === 'drag' || it.mode === 'fly' ? 200 : it.z;
      it.el.style.setProperty('--sx', `${50 + it.ay * 2.4}%`);
      it.el.style.setProperty('--so', `${Math.min(0.85, (Math.abs(it.ax) + Math.abs(it.ay)) / 26)}`);
      if (m) busy = true;
    }
    this.raf = busy ? requestAnimationFrame(tt => this.tick(tt)) : 0;
    if (this.sel != null) this.placeBtns();
  }

  // ── 손가락 ───────────────────────────────────────────────────────────────
  down(e) {
    const el = e.target.closest('.rc');
    if (!el || e.button > 0 || this.drag) return;
    const it = this.find(Number(el.dataset.u));
    if (!it || it.mode !== 'hand') return;
    e.preventDefault();
    const hr = this.host.getBoundingClientRect();
    this.drag = { it, x0: e.clientX, y0: e.clientY, ox: e.clientX - hr.left - it.x, oy: e.clientY - hr.top - it.y, moved: false, t0: performance.now(), vy: 0, py: e.clientY, pt: performance.now(), id: e.pointerId };
    this.drag.long = setTimeout(() => { if (this.drag && !this.drag.moved) { const u = it.u; this.cancelDrag(); this.o.onLong?.(u); } }, 480);
    it.ts = (it.u === this.sel ? 1.1 : 1) + 0.06;      // 누르면 살짝 들린다
    it.ty -= 8;
    this.o.sound?.('touch');
    this.kick();
  }
  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 9) return;
    e.preventDefault();
    if (!d.moved) {
      d.moved = true;
      clearTimeout(d.long);
      d.it.mode = 'drag';
      d.it.spring = DRAG;
      d.it.ts = 1.12;
      d.it.el.classList.add('dragging');
      this.host.classList.add('dragging');
      if (this.sel != null && this.sel !== d.it.u) this.select(null);
      this.btns.style.display = 'none';
      this.o.sound?.('lift');
    }
    const now = performance.now();
    d.vy = (e.clientY - d.py) / Math.max(1, now - d.pt);
    d.py = e.clientY; d.pt = now;
    const hr = this.host.getBoundingClientRect();
    d.it.tx = e.clientX - hr.left - d.ox;
    d.it.ty = e.clientY - hr.top - d.oy;
    this.aim(e.clientX, e.clientY);
    this.kick();
  }
  aim(x, y) {
    const tg = this.o.targets();
    const er = tg.enemy?.getBoundingClientRect(), sr = tg.self?.getBoundingClientRect();
    let t = null;
    if (er && y < er.bottom + 24) t = 'enemy';
    else if (sr && y > sr.top - 8) t = 'self';
    if (t === this.drag.target) return;
    this.drag.target = t;
    tg.enemy?.classList.toggle('drop-on', t === 'enemy');
    tg.self?.classList.toggle('drop-on', t === 'self');
    const el = this.drag.it.el;
    el.classList.toggle('aim-atk', t === 'enemy');
    el.classList.toggle('aim-def', t === 'self');
    if (t) this.o.sound?.('aim');
  }
  clearAim() {
    const tg = this.o.targets?.();
    tg?.enemy?.classList.remove('drop-on');
    tg?.self?.classList.remove('drop-on');
    this.host.classList.remove('dragging');
  }
  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    clearTimeout(d.long);
    d.it.el.classList.remove('dragging', 'aim-atk', 'aim-def');
    d.it.mode = d.it.mode === 'drag' ? 'hand' : d.it.mode;
    this.drag = null;
    this.clearAim();
    this.layout();
  }
  up(e, cancel = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    clearTimeout(d.long);
    const it = d.it;
    if (!d.moved) {
      this.drag = null;
      it.el.classList.remove('dragging');
      this.layout();
      if (!cancel) this.o.onTap?.(it.u);
      return;
    }
    let target = d.target;
    // 위로 세게 튕기면 공격
    if (!target && d.vy < -1.1 && e.clientY < d.y0 - 40) target = 'enemy';
    this.drag = null;
    it.el.classList.remove('dragging', 'aim-atk', 'aim-def');
    this.clearAim();
    if (!cancel && target && this.o.canPlay() && this.o.onDrop(it.u, target)) {
      it.mode = 'held';                         // 낸 카드는 그 자리에서 날아갈 준비 (launch)
      it.ty -= 6;
      this.kick();
      return;
    }
    if (target && !cancel) this.o.sound?.('nope');
    it.mode = 'hand';
    this.layout();
  }

  // 카드를 대상에게 던진다: 날아가 쾅 꽂히고(이때 resolve), 버린 더미로 사라진다
  async launch(u, tgt, target) {
    const it = this.find(u);
    if (!it) return;
    this.select(null);
    const hr = this.host.getBoundingClientRect();
    it.mode = 'fly';
    it.spring = FLY;
    it.el.classList.add('flying', target === 'enemy' ? 'to-atk' : 'to-def');
    Object.assign(it, { tx: tgt.x - hr.left - this.cw / 2, ty: tgt.y - hr.top - this.ch / 2 + (target === 'enemy' ? 10 : -20), tr: target === 'enemy' ? -10 : 6, ts: 1.28 });
    this.kick();
    this.layout();
    await wait(reduced() ? 60 : 230);
    it.el.classList.add('slam');
    it.ts = 0.78;
    it.vs = -6;
    this.o.sound?.('slam');
    await wait(reduced() ? 20 : 90);
    setTimeout(() => this.toPile(it), reduced() ? 0 : 180);
  }
}
