// 테스트 공용: 브라우저 전역 흉내 · 트랜잭션이 원자적인 메모리 저장소 · 가짜 UI · 게임 만들기
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

const { Game } = await import('../src/game/game.js');
const { createPlayer } = await import('../src/logic/player.js');

export class MemStore {
  constructor(shared = { data: {}, watchers: new Set() }) { this.kind = 'online'; this.s = shared; }
  read(path) { let c = this.s.data; for (const k of path.split('/').filter(Boolean)) { if (c == null) return null; c = c[k]; } return c ?? null; }
  write(path, v) {
    const ks = path.split('/').filter(Boolean);
    if (!ks.length) { this.s.data = v ?? {}; } else {
      let c = this.s.data;
      for (const k of ks.slice(0, -1)) { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }
      if (v == null) delete c[ks.at(-1)]; else c[ks.at(-1)] = JSON.parse(JSON.stringify(v));
    }
    for (const w of [...this.s.watchers]) if (w.alive) w.cb(structuredClone(this.read(w.path)));
  }
  watch(path, cb) { const w = { path, cb, alive: true }; this.s.watchers.add(w); cb(structuredClone(this.read(path))); return () => { w.alive = false; this.s.watchers.delete(w); }; }
  async get(p) { return structuredClone(this.read(p)); }
  async set(p, v) { this.write(p, v); }
  async update(p, o) { for (const [k, v] of Object.entries(o)) this.write(`${p}/${k}`, v); }
  async remove(p) { this.write(p, null); }
  async txn(p, fn) { const cur = structuredClone(this.read(p)); const n = fn(cur); if (n === undefined) return { committed: false, value: cur }; this.write(p, n); return { committed: true, value: n }; }
  presence(p, v) { this.write(p, v); }
  close() {}
}

export const fakeUI = () => {
  const ui = { toasts: [], idle: null, dayEnds: [], toast(m) { ui.toasts.push(m); }, showIdle(r) { ui.idle = r; }, showDayEnd(s) { ui.dayEnds.push(s); } };
  return new Proxy(ui, { get: (t, k) => (k in t ? t[k] : () => {}) });
};

export const newShared = () => ({ data: {}, watchers: new Set() });

export async function mkGame({ job = 'farmer', shared, me, name = '테스트' } = {}) {
  me ||= createPlayer({ id: `p${Math.random()}`.slice(0, 8), name, job });
  const store = new MemStore(shared);
  const ui = fakeUI();
  const g = new Game({ store, code: 'TEST01', pid: me.id, me, ui, settings: { vibrate: false } });
  await g.start();
  return { g, ui, store };
}

// 비동기 하루 정산이 끝날 때까지
export async function settle(...games) {
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setImmediate(r));
    if (games.every(g => !g.dayBusy)) return;
  }
}
