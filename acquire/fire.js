// Firebase Realtime Database 백엔드.
//
// P2P 방식과 달리 '방장'이 없다. 게임 상태가 DB에 있고, 각 클라이언트가
// 트랜잭션으로 자기 액션을 적용한다. 그래서 누가 나가든 게임이 죽지 않는다.
//
// 상태는 JSON 문자열로 저장한다 — RTDB는 배열의 null을 버리고 희소 배열을
// 객체로 바꿔버려서, 보드(108칸 중 상당수가 null)를 그대로 넣으면 깨진다.

import * as E from './engine.js';
import * as Net from './net.js';

let fb = null;   // 번들된 Firebase SDK
let db = null;
let cfg = null;

export const ROOM_TTL_MS = 24 * 3600 * 1000;
const SEEN_INTERVAL_MS = 8000;  // 살아 있다고 알리는 주기
const OFFLINE_MS = 20000;       // 이만큼 소식이 없으면 접속 끊김으로 표시
const ABSENT_MS = 45000;        // 이만큼 지나면 다른 사람이 대신 진행할 수 있다

// fireconfig.js 가 있으면 Firebase 모드, 없으면 P2P 모드로 떨어진다
export async function loadFirebase() {
  if (db) return db;
  if (!cfg) {
    try {
      cfg = (await import('./fireconfig.js')).firebaseConfig;
    } catch {
      return null; // 설정 파일 없음 — Firebase 모드 비활성
    }
  }
  if (!cfg?.databaseURL) return null;

  fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(cfg);
  db = fb.getDatabase(app);

  // 테스트용 에뮬레이터 연결 (?fbemu=127.0.0.1:9100)
  const emu = new URLSearchParams(location.search).get('fbemu');
  if (emu) {
    const [host, port] = emu.split(':');
    fb.connectDatabaseEmulator(db, host, Number(port));
  }
  return db;
}

export const firebaseReady = () => !!db;

const roomPath = code => `rooms/${code}`;

// Firebase 오류를 사람이 읽을 수 있는 안내로 바꾼다
export function explain(err) {
  const msg = String(err?.message || err || '');
  if (/permission|PERMISSION_DENIED/i.test(msg)) {
    return 'Firebase 접근이 거부되었습니다. Realtime Database의 "규칙" 탭에 database.rules.json 내용을 붙여넣고 게시했는지 확인해 주세요.';
  }
  if (/network|offline|unavailable/i.test(msg)) {
    return 'Firebase에 연결하지 못했습니다. 네트워크를 확인해 주세요.';
  }
  return msg || '알 수 없는 오류가 발생했습니다.';
}

// RTDB 트랜잭션은 로컬 캐시가 비어 있으면 첫 호출을 null 로 실행한다.
// 거기서 중단해버리면 서버 값을 받아보지도 못하고 실패하므로, null 이면
// 서버 값을 직접 읽어 캐시를 채우고 다시 시도한다.
async function txnOnRoom(ref, mutate) {
  for (let i = 0; i < 4; i++) {
    let sawNull = false;
    let failure = null;
    const res = await fb.runTransaction(ref, room => {
      failure = null;
      if (room === null || room === undefined) { sawNull = true; return; }
      return mutate(room, msg => { failure = msg; });
    });
    if (res.committed) return { ok: true };
    if (failure) return { ok: false, failure };
    if (sawNull) {
      const snap = await fb.get(ref);
      if (!snap.exists()) return { ok: false, failure: '방이 사라졌습니다.' };
      await new Promise(r => setTimeout(r, 120));
      continue;
    }
    return { ok: false, failure: '변경을 적용하지 못했습니다. 다시 시도해 주세요.' };
  }
  return { ok: false, failure: '서버가 바빠 적용하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
}

// ── 방 ───────────────────────────────────────────────────────────────────────
export class FireRoom {
  constructor({ code, name, create, onChange, onFatal }) {
    this.isHost = false;      // Firebase 모드에는 방장이 없다
    this.serverless = true;
    this.code = code;
    this.name = name;
    this.create = create;
    this.onChange = onChange;
    this.onFatal = onFatal;
    this.token = Net.myToken();

    this.doc = null;          // DB에서 받은 방 전체
    this.state = null;        // 파싱한 게임 상태
    this.error = '';
    this.status = 'connecting';
    this.closed = false;
  }

  get ref() { return fb.ref(db, roomPath(this.code)); }

  async open() {
    let snap;
    try {
      snap = await fb.get(this.ref);
    } catch (err) {
      const e = new Error(explain(err));
      e.fatal = true;
      throw e;
    }
    const existing = snap.val();

    if (this.create) {
      if (existing && Date.now() - (existing.createdAt || 0) < ROOM_TTL_MS) {
        throw new Error('이미 사용 중인 방 코드입니다. 다시 시도해 주세요.');
      }
      await fb.set(this.ref, {
        createdAt: Date.now(),
        started: false,
        seats: { [this.token]: { name: this.name, idx: 0, joinedAt: Date.now() } },
      });
      this.subscribe();
    } else {
      if (!existing) {
        const err = new Error('그런 방이 없습니다. 방 코드를 확인해 주세요.');
        err.fatal = true;
        throw err;
      }
      // 리스너를 먼저 붙여 트랜잭션이 서버 값을 가지고 시작하게 한다
      this.subscribe();
      await this.firstSnapshot();
      await this.claimSeat();
    }
    this.watchPresence();
  }

  firstSnapshot() {
    if (this.doc) return Promise.resolve();
    return new Promise(resolve => {
      this.firstResolve = resolve;
      setTimeout(resolve, 6000); // 못 받아도 진행 — 트랜잭션 래퍼가 다시 시도한다
    });
  }

  // 빈 자리를 트랜잭션으로 차지한다 (동시 입장 경쟁 방지)
  async claimSeat() {
    const { ok, failure } = await txnOnRoom(this.ref, (room, fail) => {
      const seats = room.seats || {};
      if (seats[this.token]) {           // 재접속 — 원래 자리 복구
        seats[this.token].name = this.name;
        room.seats = seats;
        return room;
      }
      if (room.started) return fail('이미 시작된 게임입니다. 참가할 수 없습니다.');
      if (Object.keys(seats).length >= 6) return fail('정원(6명)이 찼습니다.');
      seats[this.token] = { name: this.name, idx: Object.keys(seats).length, joinedAt: Date.now() };
      room.seats = seats;
      return room;
    });
    if (!ok) { const err = new Error(failure); err.fatal = true; throw err; }
  }

  // RTDB의 접속 상태를 이용해 누가 온라인인지 표시한다
  watchPresence() {
    const mine = fb.ref(db, `${roomPath(this.code)}/seen/${this.token}`);
    const connected = fb.ref(db, '.info/connected');
    const beat = () => fb.set(mine, Date.now()).catch(() => {});

    this.offConnected = fb.onValue(connected, snap => {
      if (this.closed) return;
      const isOn = snap.val() === true;
      this.status = isOn ? 'ok' : 'reconnecting';
      if (isOn) beat();
      this.onChange?.();
    });

    this.seenTimer = setInterval(() => { if (!this.closed) beat(); }, SEEN_INTERVAL_MS);
    // 시간이 지나면서 '자리 비움' 판정이 바뀌므로 주기적으로 다시 그린다
    this.tick = setInterval(() => { if (!this.closed) this.onChange?.(); }, 5000);
  }

  subscribe() {
    this.offRoom = fb.onValue(this.ref, snap => {
      if (this.closed) return;
      const room = snap.val();
      if (!room) { this.onFatal?.(new Error('방이 삭제되었습니다.')); return; }
      this.doc = room;
      try {
        this.state = room.state ? JSON.parse(room.state) : null;
      } catch {
        this.state = null;
      }
      if (this.firstResolve) { this.firstResolve(); this.firstResolve = null; }
      this.onChange?.();
    }, err => {
      this.status = 'reconnecting';
      this.error = explain(err);
      this.onChange?.();
    });
  }

  // ── 좌석 ───────────────────────────────────────────────────────────────────
  seatList() {
    const seats = this.doc?.seats || {};
    const seen = this.doc?.seen || {};
    const now = Date.now();
    return Object.entries(seats)
      .sort((a, b) => (a[1].idx ?? 0) - (b[1].idx ?? 0))
      .map(([token, s]) => {
        const age = now - (seen[token] || 0);
        return { token, name: s.name, connected: age < OFFLINE_MS, absent: age > ABSENT_MS };
      });
  }

  mySeatIndex() { return this.seatList().findIndex(s => s.token === this.token); }

  playerIndexForSeat(seatIdx) {
    return this.state ? this.state.players.findIndex(p => p.ref === seatIdx) : -1;
  }

  // ── 액션 ───────────────────────────────────────────────────────────────────
  async localStart() {
    const seats = this.seatList();
    if (seats.length < 2) { this.error = '최소 2명이 필요합니다.'; this.onChange?.(); return; }
    const { ok, failure } = await txnOnRoom(this.ref, (room, fail) => {
      if (room.started) return fail('이미 시작되었습니다.');
      const list = Object.entries(room.seats || {})
        .sort((a, b) => (a[1].idx ?? 0) - (b[1].idx ?? 0));
      const state = E.createGame(list.map(([, s], i) => ({ name: s.name, ref: i })));
      room.started = true;
      room.state = JSON.stringify(state);
      return room;
    });
    if (!ok) { this.error = failure; this.onChange?.(); }
  }

  // 트랜잭션 안에서 룰 엔진을 돌린다. 충돌하면 Firebase가 알아서 재시도하므로
  // 여러 명이 동시에 눌러도 순서가 꼬이지 않는다.
  async localAct(action) {
    const seatIdx = this.controlSeat();
    if (seatIdx < 0) return;
    let failure = null;
    try {
      const res = await txnOnRoom(this.ref, (room, fail) => {
        if (!room.state) return fail('아직 게임이 시작되지 않았습니다.');
        let state;
        try { state = JSON.parse(room.state); } catch { return fail('상태를 읽지 못했습니다.'); }
        const playerIdx = state.players.findIndex(p => p.ref === seatIdx);
        if (playerIdx < 0) return fail('내 자리를 찾을 수 없습니다.');
        const out = E.applyAction(state, playerIdx, action);
        if (!out.ok) return fail(out.error);
        room.state = JSON.stringify(state);
        return room;
      });
      failure = res.ok ? null : res.failure;
    } catch (err) {
      failure = explain(err);
    }
    this.error = failure || '';
    this.onChange?.();
  }

  async localChat(text) {
    const t = String(text || '').slice(0, 200).trim();
    if (!t) return;
    const me = this.seatList().find(s => s.token === this.token);
    await fb.push(fb.ref(db, `${roomPath(this.code)}/chat`), {
      from: me?.name || this.name, text: t, n: Date.now(),
    }).catch(() => {});
  }

  chatList() {
    const chat = this.doc?.chat || {};
    return Object.entries(chat)
      .map(([k, v]) => ({ ...v, n: v.n ?? 0, key: k }))
      .sort((a, b) => a.n - b.n)
      .slice(-100);
  }

  // ── 뷰 ─────────────────────────────────────────────────────────────────────
  // 지금 내가 조작할 수 있는 자리. 내 차례면 내 자리,
  // 차례인 사람이 오래 자리를 비웠다면 그 사람 자리(대신 진행).
  controlSeat() {
    const mySeat = this.mySeatIndex();
    if (mySeat < 0 || !this.state) return -1;
    const acting = E.actingPlayer(this.state);
    if (acting == null) return mySeat;
    const actingSeat = this.state.players[acting]?.ref;
    if (actingSeat === mySeat) return mySeat;
    const seats = this.seatList();
    return seats[actingSeat]?.absent ? actingSeat : mySeat;
  }

  view() {
    const seats = this.seatList();
    const seatIdx = this.mySeatIndex();
    const me = this.state ? this.playerIndexForSeat(seatIdx) : -1;

    // 자리를 비운 사람을 대신 조작할 때는 그 사람 시점으로 화면을 구성한다
    const ctrlSeat = this.state ? this.controlSeat() : -1;
    const ctrl = ctrlSeat >= 0 ? this.playerIndexForSeat(ctrlSeat) : me;
    const proxying = this.state && ctrl !== me && ctrl >= 0;

    return {
      isHost: false,
      serverless: true,
      code: this.code,
      seat: seatIdx,
      lobby: { code: this.code, started: !!this.doc?.started, seats },
      chat: this.chatList(),
      // 상태 전체가 DB에 있으므로 손패도 그대로 들어 있다 (README의 한계 참고)
      state: this.state ? E.sanitize(this.state, proxying ? ctrl : me) : null,
      me: proxying ? ctrl : me,
      mySeatPlayer: me,
      proxyFor: proxying ? this.state.players[ctrl].name : null,
      error: this.error,
      status: this.status,
      canStart: !this.doc?.started && seats.length >= 2,
    };
  }

  destroy() {
    this.closed = true;
    clearInterval(this.seenTimer);
    clearInterval(this.tick);
    try { this.offRoom?.(); } catch { /* 무시 */ }
    try { this.offConnected?.(); } catch { /* 무시 */ }
  }
}
