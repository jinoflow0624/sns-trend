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
const SEEN_INTERVAL_MS = 8000;   // 살아 있다고 알리는 주기
const TOUCH_INTERVAL_MS = 60000; // 방 활동 시각(lastActive) 갱신 주기 — 24시간 기준이라 1분이면 충분
const SWEEP_LIMIT = 20;          // 한 번에 청소할 방 수
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
const SEEN_KEY = 'acquire.visitedRooms';

// ── 무료 한도 감시 ───────────────────────────────────────────────────────────
//
// Spark(무료) 요금제는 월 다운로드 10GB. 서버가 없어 진짜 알림은 못 보내므로,
// 각 클라이언트가 자기가 주고받은 양을 월별 카운터에 더하고, 임계치를 넘으면
// 앱 안에서 경고를 띄운다. 95%를 넘으면 새 방 만들기를 막아 한도 초과를 예방한다.
export const FREE_MONTHLY_BYTES = 10 * 1024 * 1024 * 1024;
const WARN_AT = 0.7;
const BLOCK_AT = 0.95;
const USAGE_FLUSH_MS = 60000;

const usageMonth = () => new Date().toISOString().slice(0, 7);  // YYYY-MM
let usagePending = 0;
let usageTotal = 0;
let usageFlushedAt = 0;

export const usageInfo = () => ({
  bytes: usageTotal,
  limit: FREE_MONTHLY_BYTES,
  ratio: usageTotal / FREE_MONTHLY_BYTES,
  warn: usageTotal >= FREE_MONTHLY_BYTES * WARN_AT,
  block: usageTotal >= FREE_MONTHLY_BYTES * BLOCK_AT,
});

export function addUsage(bytes) {
  usagePending += bytes;
  usageTotal += bytes;
}

async function flushUsage() {
  if (!db || usagePending <= 0) return;
  if (Date.now() - usageFlushedAt < USAGE_FLUSH_MS) return;
  const add = usagePending;
  usagePending = 0;
  usageFlushedAt = Date.now();
  try {
    await fb.runTransaction(fb.ref(db, `usage/${usageMonth()}`), cur => (cur || 0) + add);
  } catch { usagePending += add; }   // 실패하면 다음 기회에 다시 보낸다
}

export async function watchUsage(onChange) {
  if (!db) return;
  try {
    const ref = fb.ref(db, `usage/${usageMonth()}`);
    fb.onValue(ref, snap => {
      usageTotal = Number(snap.val()) || 0;
      onChange?.(usageInfo());
    }, () => {});
    setInterval(() => { flushUsage().then(() => onChange?.(usageInfo())); }, USAGE_FLUSH_MS);
  } catch { /* 감시 실패는 게임과 무관 */ }
}

const isExpired = room =>
  !room || Date.now() - (room.lastActive ?? room.createdAt ?? 0) > ROOM_TTL_MS;

// ── 방 청소 ──────────────────────────────────────────────────────────────────
//
// 24시간 넘게 아무도 접속하지 않은 방은 삭제한다. 서버가 없으니 청소도 클라이언트가 한다.
//
// 전역 목록을 훑는 방식은 쓰지 않았다. /rooms 목록 조회를 열면 방 코드를 모르는 사람도
// 아무 방에나 들어올 수 있게 되는데, 그게 이 앱의 유일한 접근 통제이기 때문이다.
// 대신 각자가 "자기가 다녀간 방"만 기억해 두었다가 정리한다.
// 방을 만들거나 들어간 사람이 결국 이 사이트에 다시 오므로 실질적으로 대부분 정리된다.

function visitedRooms() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function saveVisited(list) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-40))); } catch { /* 무시 */ }
}
export function rememberRoom(code) {
  const list = visitedRooms().filter(r => r.code !== code);
  list.push({ code, ts: Date.now() });
  saveVisited(list);
}

// 내가 다녀간 방 중 만료된 것을 지운다. 최근에 있었던 방은 만료일 수 없으므로 건너뛴다.
export async function sweepMyRooms() {
  if (!db) return 0;
  const list = visitedRooms();
  const stale = list.filter(r => Date.now() - r.ts > ROOM_TTL_MS);
  if (stale.length === 0) return 0;

  let removed = 0;
  const gone = new Set();
  for (const { code } of stale) {
    try {
      const snap = await fb.get(fb.ref(db, roomPath(code)));
      if (!snap.exists()) { gone.add(code); continue; }
      if (!isExpired(snap.val())) continue;   // 다른 사람이 계속 쓰고 있다
      await fb.remove(fb.ref(db, roomPath(code)));
      gone.add(code);
      removed++;
    } catch { /* 권한·네트워크 문제는 조용히 넘어간다 */ }
  }
  if (gone.size) saveVisited(list.filter(r => !gone.has(r.code)));
  return removed;
}

export class FireRoom {
  constructor({ code, name, create, opts, onChange, onFatal }) {
    this.isHost = false;      // Firebase 모드에는 방장이 없다
    this.opts = opts || {};
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
    let existing = snap.val();

    // 24시간 넘게 아무도 접속하지 않은 방은 만료된 것으로 보고 지운다
    if (existing && isExpired(existing)) {
      await fb.remove(this.ref).catch(() => {});
      existing = null;
    }

    if (this.create) {
      if (usageInfo().block) {
        const err = new Error(
          '이번 달 무료 사용량이 거의 찼습니다(95% 초과). 한도를 넘지 않도록 새 방 만들기를 잠시 막았습니다. 다음 달에 초기화됩니다.');
        err.fatal = true;
        throw err;
      }
      if (existing) {
        throw new Error('이미 사용 중인 방 코드입니다. 다시 시도해 주세요.');
      }
      const now = Date.now();
      await fb.set(this.ref, {
        createdAt: now,
        lastActive: now,
        started: false,
        privateShares: !!this.opts.privateShares,
        seats: { [this.token]: { name: this.name, idx: 0, joinedAt: now } },
      });
      this.subscribe();
    } else {
      if (!existing) {
        const err = new Error('그런 방이 없습니다. 방 코드가 틀렸거나, 24시간 넘게 아무도 접속하지 않아 삭제되었습니다.');
        err.fatal = true;
        throw err;
      }
      // 리스너를 먼저 붙여 트랜잭션이 서버 값을 가지고 시작하게 한다
      this.subscribe();
      await this.firstSnapshot();
      await this.claimSeat();
    }
    rememberRoom(this.code);
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

    // 방이 살아 있음을 표시한다. 24시간 기준이라 1분 간격이면 충분하다.
    let lastTouch = 0;
    const touch = () => {
      const now = Date.now();
      if (now - lastTouch < TOUCH_INTERVAL_MS) return;
      lastTouch = now;
      fb.set(fb.ref(db, `${roomPath(this.code)}/lastActive`), now).catch(() => {});
    };
    this.touch = touch;

    this.offConnected = fb.onValue(connected, snap => {
      if (this.closed) return;
      const isOn = snap.val() === true;
      this.status = isOn ? 'ok' : 'reconnecting';
      if (isOn) { beat(); touch(); }
      this.onChange?.();
    });

    this.seenTimer = setInterval(() => { if (!this.closed) { beat(); touch(); } }, SEEN_INTERVAL_MS);
    // 시간이 지나면서 '자리 비움' 판정이 바뀌므로 주기적으로 다시 그린다
    this.tick = setInterval(() => { if (!this.closed) this.onChange?.(); }, 5000);
  }

  subscribe() {
    this.offRoom = fb.onValue(this.ref, snap => {
      if (this.closed) return;
      const room = snap.val();
      if (!room) { this.onFatal?.(new Error('방이 삭제되었습니다.')); return; }
      this.doc = room;
      // 이번에 내려받은 양을 대략 센다 (상태 문자열이 대부분을 차지한다)
      addUsage((room.state?.length || 0) + 200);
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
      const state = E.createGame(list.map(([, s], i) => ({ name: s.name, ref: i })), Date.now(),
        { privateShares: !!room.privateShares });
      room.started = true;
      room.state = JSON.stringify(state);
      room.lastActive = Date.now();
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
        room.lastActive = Date.now();
        addUsage(room.state.length);   // 업로드분
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
    this.touch?.();
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
      lobby: {
        code: this.code,
        started: !!this.doc?.started,
        opts: { privateShares: !!this.doc?.privateShares },
        seats,
      },
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
