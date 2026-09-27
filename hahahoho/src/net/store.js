// 저장소 계층. 같은 모양의 두 구현이 있다.
//
//   FireStore  : Firebase Realtime Database — 아콰이어 온라인과 같은 프로젝트(같은 서버).
//                저장 위치는 분리: 아콰이어는 /rooms, 하하호호는 /hahahoho/worlds/{코드}.
//   LocalStore : 이 기기의 localStorage 에 저장 (서버 없이 혼자 하기).
//                같은 브라우저의 다른 탭과는 BroadcastChannel 로 동기화되어 개발 중 멀티 테스트에도 쓴다.
//
// 경로는 세계 루트 기준 상대 경로 ('meta', 'players/abc/pub' …).
// 배열은 RTDB 가 null 을 버리므로 JSON 문자열로 넣는다(인벤토리 등).

export const ROOT = 'hahahoho/worlds';
const LOCAL_PREFIX = 'hahahoho.local.';

const split = p => p.split('/').filter(Boolean);

// ── 로컬 ─────────────────────────────────────────────────────────────────────
export class LocalStore {
  constructor(code) {
    this.kind = 'local';
    this.code = code;
    this.key = LOCAL_PREFIX + code;
    this.watchers = new Set();
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; } catch { this.data = {}; }
    this.onDc = [];
    // 다른 탭의 변경은 (경로, 값) 단위로 받아 적용한다 — 통째로 덮으면 동시에 쓴 내용이 사라진다
    try {
      this.bc = new BroadcastChannel(`hahahoho-${code}`);
      this.bc.onmessage = e => { this.write(e.data.path, e.data.value, false); };
    } catch { this.bc = null; }
    this.onStorage = e => {
      if (this.bc || e.key !== this.key || !e.newValue) return;
      try { this.data = JSON.parse(e.newValue); this.notify(); } catch { /* 무시 */ }
    };
    addEventListener('storage', this.onStorage);
  }
  static exists(code) { try { return !!localStorage.getItem(LOCAL_PREFIX + code); } catch { return false; } }
  static remove(code) { try { localStorage.removeItem(LOCAL_PREFIX + code); } catch { /* 무시 */ } }

  read(path) {
    let cur = this.data;
    for (const k of split(path)) { if (cur == null || typeof cur !== 'object') return null; cur = cur[k]; }
    return cur === undefined ? null : cur;
  }
  write(path, value, broadcast = true) {
    if (broadcast) try { this.bc?.postMessage({ path, value: value ?? null }); } catch { /* 무시 */ }
    const keys = split(path);
    if (!keys.length) { this.data = value ?? {}; return this.commit(); }
    let cur = this.data;
    for (const k of keys.slice(0, -1)) {
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete cur[last];
    else cur[last] = JSON.parse(JSON.stringify(value));
    this.commit();
  }
  commit() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* 용량 초과 */ }
    }, 250);
    this.notify();
  }
  notify() {
    for (const w of this.watchers) {
      const v = this.read(w.path);
      const s = JSON.stringify(v);
      if (s !== w.last) { w.last = s; w.cb(v == null ? null : JSON.parse(s)); }
    }
  }
  async ready() { return true; }
  watch(path, cb) {
    const w = { path, cb, last: undefined };
    this.watchers.add(w);
    queueMicrotask(() => { const v = this.read(path); w.last = JSON.stringify(v); cb(v == null ? null : JSON.parse(w.last)); });
    return () => this.watchers.delete(w);
  }
  async get(path) { const v = this.read(path); return v == null ? null : JSON.parse(JSON.stringify(v)); }
  async set(path, v) { this.write(path, v); }
  async update(path, obj) { for (const [k, v] of Object.entries(obj)) this.write(`${path}/${k}`, v); }
  async remove(path) { this.write(path, null); }
  // fn(현재값) → 새 값, undefined 면 취소
  async txn(path, fn) {
    const cur = await this.get(path);
    const next = fn(cur);
    if (next === undefined) return { committed: false, value: cur };
    this.write(path, next);
    return { committed: true, value: next };
  }
  presence(path, value) { this.write(path, value); this.onDc.push(path); }
  flush() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* 무시 */ } }
  close() {
    for (const p of this.onDc) this.write(p, null);
    this.flush();
    removeEventListener('storage', this.onStorage);
    this.bc?.close();
    this.watchers.clear();
  }
}

// ── Firebase ─────────────────────────────────────────────────────────────────
let fb = null;
let db = null;
let cfg;

export async function firebaseAvailable() {
  if (new URLSearchParams(location.search).get('net') === 'local') return false;
  if (cfg === undefined) {
    try { cfg = (await import('../../fireconfig.js')).firebaseConfig; } catch { cfg = null; }
  }
  return !!cfg?.databaseURL;
}

async function loadFirebase() {
  if (db) return db;
  if (!(await firebaseAvailable())) throw new Error('서버 설정이 없습니다.');
  fb = await import('../../vendor/firebase.js');
  const app = fb.initializeApp(cfg, 'hahahoho');
  db = fb.getDatabase(app);
  const emu = new URLSearchParams(location.search).get('fbemu');
  if (emu) { const [h, p] = emu.split(':'); fb.connectDatabaseEmulator(db, h, Number(p)); }
  return db;
}

export function explain(err) {
  const msg = String(err?.message || err || '');
  if (/permission|PERMISSION_DENIED/i.test(msg)) {
    return '서버가 접근을 거부했습니다. Firebase 콘솔의 Realtime Database 규칙에 hahahoho/database.rules.json 내용을 게시했는지 확인해 주세요.';
  }
  if (/network|offline|unavailable|timeout/i.test(msg)) return '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.';
  return msg || '알 수 없는 오류';
}

export class FireStore {
  constructor(code) {
    this.kind = 'online';
    this.code = code;
    this.base = `${ROOT}/${code}`;
    this.unsubs = new Set();
    this.dcPaths = [];
  }
  ref(path) { return fb.ref(db, path ? `${this.base}/${path}` : this.base); }
  async ready() {
    await loadFirebase();
    // 첫 읽기로 연결·권한을 확인한다 (규칙이 게시되지 않았으면 여기서 실패)
    await Promise.race([
      fb.get(this.ref('meta')),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
    ]);
    return true;
  }
  watch(path, cb) {
    const off = fb.onValue(this.ref(path), snap => cb(snap.val()), err => console.warn('watch', path, err));
    this.unsubs.add(off);
    return () => { off(); this.unsubs.delete(off); };
  }
  async get(path) { return (await fb.get(this.ref(path))).val(); }
  async set(path, v) { await fb.set(this.ref(path), v ?? null); }
  async update(path, obj) { await fb.update(this.ref(path), obj); }
  async remove(path) { await fb.remove(this.ref(path)); }
  // RTDB 트랜잭션은 캐시가 비어 있으면 첫 호출을 null 로 한다. 거기서 취소하면
  // 서버 값을 못 보고 끝나므로, null 로 취소했다면 서버 값을 읽고 한 번 더 시도한다.
  async txn(path, fn) {
    const ref = this.ref(path);
    for (let i = 0; i < 3; i++) {
      let sawNull = false;
      const res = await fb.runTransaction(ref, cur => {
        const next = fn(cur);
        if (next === undefined && cur == null) sawNull = true;
        return next;
      }, { applyLocally: true });
      if (res.committed) return { committed: true, value: res.snapshot.val() };
      if (!sawNull) return { committed: false, value: res.snapshot.val() };
      await fb.get(ref);
    }
    return { committed: false, value: null };
  }
  presence(path, value) {
    const r = this.ref(path);
    fb.set(r, value).catch(() => {});
    fb.onDisconnect(r).remove();
    this.dcPaths.push(path);
  }
  flush() {}
  close() {
    for (const off of this.unsubs) try { off(); } catch { /* 무시 */ }
    this.unsubs.clear();
    for (const p of this.dcPaths) fb.remove(this.ref(p)).catch(() => {});
  }
}

export async function openStore(code, mode) {
  const s = mode === 'online' ? new FireStore(code) : new LocalStore(code);
  await s.ready();
  return s;
}

// ── 세계 코드 · 기기 식별 ────────────────────────────────────────────────────
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(len = 6) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map(n => ALPHA[n % ALPHA.length]).join('');
}
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const makeId = () => (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 16);
