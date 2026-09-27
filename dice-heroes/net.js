// 온라인 방 — 링크로 초대해서 2~4인이 각자 기기로 함께 한다.
//
// 방장 서버가 따로 없다. 방 전체(로비 + 게임 상태)를 JSON 문자열 하나로 DB에 두고,
// 각 기기가 트랜잭션으로 자기 행동을 적용한다. 룰 엔진이 결정적(시드 난수)이라
// 누가 적용해도 결과가 같고, 누가 나가도 방이 죽지 않는다.
//
// 백엔드 두 가지:
//   firebase — 실제 서비스. 아콰이어 온라인과 같은 Firebase 프로젝트, 경로 rooms/DH-코드
//   local    — 같은 브라우저의 탭끼리 (BroadcastChannel). 인터넷 없이 흐름을 시험할 때 ?net=local

const PREFIX = 'DH-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SEEN_MS = 8000;       // 살아 있다고 알리는 주기
export const ABSENT_MS = 45000;    // 이만큼 소식이 없으면 다른 사람이 대신 진행할 수 있다

export function makeCode(len = 5) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}
export const normalizeCode = raw => (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

// 기기마다 한 번 만드는 식별 토큰 (재접속해도 같은 자리)
export function myToken() {
  try {
    let t = localStorage.getItem('diceheroes.token');
    if (!t) { t = makeCode(12); localStorage.setItem('diceheroes.token', t); }
    return t;
  } catch { return (window.__dhToken ||= makeCode(12)); }
}

export function inviteLink(code) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  const net = new URLSearchParams(location.search).get('net');
  if (net) u.searchParams.set('net', net);
  return u.toString();
}

// ── 로컬 백엔드 (탭끼리) ─────────────────────────────────────────────────────
class LocalBackend {
  constructor() {
    this.kind = 'local';
    this.ch = new BroadcastChannel('diceheroes-rooms');
    this.watchers = new Map();
    // 다른 탭은 localStorage 반영이 늦을 수 있어 방 상태를 메시지에 실어 보낸다
    this.ch.onmessage = e => { const cb = this.watchers.get(e.data.code); if (cb) cb(e.data.room); };
  }
  key(code) { return `dh.room.${code}`; }
  read(code) { try { return JSON.parse(localStorage.getItem(this.key(code))); } catch { return null; } }
  emit(code) { const cb = this.watchers.get(code); if (cb) cb(this.read(code)); }
  async exists(code) { return !!this.read(code); }
  write(code, room) {
    localStorage.setItem(this.key(code), JSON.stringify(room));
    this.ch.postMessage({ code, room });
  }
  async create(code, room) { this.write(code, room); this.emit(code); }
  async txn(code, mutate) {
    const room = this.read(code);
    if (!room) return { ok: false, failure: '방이 사라졌습니다.' };
    let failure = null;
    const next = mutate(room, m => { failure = m; });
    if (failure) return { ok: false, failure };
    if (next === undefined) return { ok: true };
    this.write(code, next);
    setTimeout(() => this.emit(code), 0);
    return { ok: true };
  }
  async touch(code, token) {
    const room = this.read(code);
    if (!room) return;
    room.seen = { ...(room.seen || {}), [token]: Date.now() };
    this.write(code, room);
  }
  watch(code, cb) {
    this.watchers.set(code, cb);
    setTimeout(() => this.emit(code), 0);
    return () => this.watchers.delete(code);
  }
}

// ── Firebase 백엔드 ──────────────────────────────────────────────────────────
class FirebaseBackend {
  constructor(fb, db) { this.kind = 'firebase'; this.fb = fb; this.db = db; }
  ref(code, sub = '') { return this.fb.ref(this.db, `rooms/${PREFIX}${code}${sub}`); }
  async exists(code) { return (await this.fb.get(this.ref(code, '/state'))).exists(); }
  async create(code, room) {
    const { seen, ...rest } = room;
    await this.fb.set(this.ref(code), { state: JSON.stringify(rest), lastActive: Date.now(), seen: seen || {} });
  }
  // RTDB 트랜잭션은 로컬 캐시가 비어 있으면 null 로 먼저 실행된다 — 그땐 서버 값을 읽고 다시 시도
  async txn(code, mutate) {
    try { return await this.txnRaw(code, mutate); }
    catch (err) { return { ok: false, failure: explain(err).text }; }
  }
  async txnRaw(code, mutate) {
    const ref = this.ref(code, '/state');
    for (let i = 0; i < 5; i++) {
      let sawNull = false, failure = null;
      const res = await this.fb.runTransaction(ref, str => {
        failure = null;
        if (str === null || str === undefined) { sawNull = true; return; }
        const next = mutate(JSON.parse(str), m => { failure = m; });
        if (failure || next === undefined) return;
        return JSON.stringify(next);
      });
      if (res.committed) { this.fb.set(this.ref(code, '/lastActive'), Date.now()).catch(() => {}); return { ok: true }; }
      if (failure) return { ok: false, failure };
      if (sawNull) {
        const snap = await this.fb.get(ref);
        if (!snap.exists()) return { ok: false, failure: '방이 사라졌습니다.' };
        await new Promise(r => setTimeout(r, 120));
        continue;
      }
      return { ok: true };   // 변경할 것이 없었음
    }
    return { ok: false, failure: '서버가 바빠 적용하지 못했습니다. 다시 시도해 주세요.' };
  }
  async touch(code, token) {
    await this.fb.set(this.ref(code, `/seen/${token}`), Date.now()).catch(() => {});
  }
  watch(code, cb) {
    let state = null, seen = {};
    const fire = () => state && cb({ ...state, seen });
    const u1 = this.fb.onValue(this.ref(code, '/state'), snap => { state = snap.exists() ? JSON.parse(snap.val()) : null; if (!state) cb(null); else fire(); });
    const u2 = this.fb.onValue(this.ref(code, '/seen'), snap => { seen = snap.val() || {}; fire(); });
    return () => { u1(); u2(); };
  }
}

let backend = null;
let fbInit = null;   // Firebase 초기화는 한 번만 (다시 초기화하면 "이미 있음" 오류로 영영 실패한다)

// 실패 원인을 사람이 읽을 수 있게 나눈다
export function explain(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  if (/permission|PERMISSION_DENIED/i.test(msg + code)) {
    return { reason: 'permission', text: '서버가 접근을 거부했습니다. Firebase 데이터베이스 규칙에 rooms 경로가 열려 있는지 확인해 주세요.' };
  }
  if (/timeout/i.test(msg)) {
    return { reason: 'timeout', text: '서버 응답이 늦습니다. 네트워크 상태를 확인하고 다시 눌러 주세요.' };
  }
  if (/import|module|Failed to fetch|dynamically/i.test(msg)) {
    return { reason: 'load', text: '온라인 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.' };
  }
  return { reason: 'network', text: '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.' };
}

// claude.ai 미리보기 같은 샌드박스에서는 외부 서버 연결이 막혀 있다
const inPreview = () => /claude\.ai|claudeusercontent|anthropic/i.test(location.hostname);

export async function getBackend() {
  if (backend) return backend;
  const want = new URLSearchParams(location.search).get('net');
  if (want === 'local') return (backend = new LocalBackend());
  if (inPreview()) {
    const e = new Error('미리보기 화면에서는 온라인 방을 쓸 수 없습니다. 배포된 주소(GitHub Pages)나 설치한 앱에서 열어 주세요.');
    e.reason = 'preview';
    throw e;
  }
  try {
    fbInit ||= (async () => {
      const { firebaseConfig } = await import('./fireconfig.js');
      const fb = await import('./vendor/firebase.js');
      const app = fb.initializeApp(firebaseConfig, 'diceheroes');
      return { fb, db: fb.getDatabase(app) };
    })().catch(err => { fbInit = null; throw err; });
    const { fb, db } = await fbInit;
    // 연결 확인: 읽기 권한과 연결을 한 번에 본다. 모바일 첫 연결은 느릴 수 있어 넉넉히 기다린다.
    await Promise.race([
      fb.get(fb.ref(db, 'rooms/DH-PING/state')),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    return (backend = new FirebaseBackend(fb, db));
  } catch (err) {
    console.error('[online]', err);
    const why = explain(err);
    const e = new Error(why.text);
    e.reason = why.reason;
    e.detail = String(err?.code || err?.message || err).slice(0, 120);
    throw e;
  }
}
