// 방(로비 + 진행 중 게임) 관리.
// HostRoom  : 권위 있는 게임 상태를 보유. 모든 액션을 검증하고 결과를 브로드캐스트한다.
// GuestRoom : 호스트가 보내준 상태를 그대로 반영하고, 입력은 액션 메시지로 보낸다.

import * as E from './engine.js';
import * as Net from './net.js';

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;

const nowChat = (from, text) => ({ from, text, n: Date.now() + Math.random() });

const HEARTBEAT_MS = 5000;    // 호스트가 살아 있음을 알리는 주기
const STALE_MS = 15000;       // 이만큼 아무 소식이 없으면 끊긴 것으로 본다 (신호 3번 누락)
const LOBBY_GRACE_MS = 40000; // 로비에서 끊긴 자리를 비우기까지 기다리는 시간
const SAVE_KEY = 'acquire.hostGame';

function saveHostGame(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* 무시 */ }
}
export function loadHostGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // 12시간이 지났거나 이미 끝난 게임은 버린다
    if (!data?.code || !data.state || data.state.ended) return null;
    if (Date.now() - (data.savedAt || 0) > 12 * 3600 * 1000) return null;
    return data;
  } catch { return null; }
}
export function clearHostGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 무시 */ }
}

export class HostRoom {
  // onChange: 화면을 다시 그려야 할 때 호출
  constructor({ code, hostName, onChange, onFatal, restore, opts }) {
    this.isHost = true;
    this.code = code;
    this.opts = opts || (restore && restore.opts) || {};
    this.onChange = onChange;
    this.onFatal = onFatal;
    this.token = Net.myToken();
    this.status = 'connecting';
    this.error = '';
    this.net = null;
    this.timers = new Map();

    if (restore) { // 저장해 둔 진행 중 게임 이어받기
      this.seats = restore.seats.map(s => ({ ...s, connected: s.token === this.token, conn: null }));
      this.state = restore.state;
      this.chat = restore.chat || [];
      this.pushChat(null, '방장이 다시 접속했습니다. 참가자들은 자동으로 다시 연결됩니다.');
    } else {
      this.seats = [{ token: this.token, name: hostName, connected: true, conn: null }];
      this.state = null;
      this.chat = [];
    }
  }

  async open() {
    this.net = await Net.startHost(this.code, {
      onConnect: () => this.onChange?.(),
      onData: (conn, msg) => this.handle(conn, msg),
      onClose: conn => this.dropConn(conn),
      onError: err => this.onFatal?.(err),
    });
    this.status = 'ok';
    this.startHeartbeat();
    this.onChange?.();
  }

  // 참가자에게 주기적으로 신호를 보내 연결이 살아 있는지 알린다.
  // 동시에 방장 자신의 시그널링 소켓도 되살린다(모바일에서 탭이 얼었다 깨어난 경우).
  startHeartbeat() {
    clearInterval(this.beat);
    this.beat = setInterval(() => {
      this.net?.revive();
      this.net?.broadcast({ t: 'ping' });
      if (this.net && !this.net.alive()) this.status = 'lost';
    }, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') this.net?.revive(); };
    document.addEventListener('visibilitychange', onVisible);
    this.onVisible = onVisible;
  }

  save() {
    if (!this.state) return;
    saveHostGame({
      code: this.code,
      opts: this.opts,
      savedAt: Date.now(),
      seats: this.seats.map(s => ({ token: s.token, name: s.name })),
      chat: this.chat.slice(-40),
      state: this.state,
    });
  }

  // ── 좌석 ───────────────────────────────────────────────────────────────────
  seatOf(conn) { return this.seats.find(s => s.conn === conn); }
  mySeatIndex() { return 0; }

  // 게임 중 좌석 인덱스 → 엔진 플레이어 인덱스 (엔진은 선공 순으로 재정렬한다)
  playerIndexForSeat(seatIdx) {
    if (!this.state) return -1;
    return this.state.players.findIndex(p => p.ref === seatIdx);
  }

  handle(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') return this.onHello(conn, msg);

    const seat = this.seatOf(conn);
    if (!seat) return this.net.send(conn, { t: 'error', msg: '먼저 방에 참가해 주세요.' });
    const seatIdx = this.seats.indexOf(seat);

    if (msg.t === 'chat') {
      const text = String(msg.text || '').slice(0, 200).trim();
      if (text) { this.pushChat(seat.name, text); this.pushAll(); }
      return;
    }
    if (msg.t === 'action') return this.act(seatIdx, msg.action, conn);
    if (msg.t === 'start') {
      if (seatIdx !== 0) return this.net.send(conn, { t: 'error', msg: '방장만 게임을 시작할 수 있습니다.' });
      return this.startGame(conn);
    }
  }

  onHello(conn, msg) {
    const name = String(msg.name || '').slice(0, 12).trim() || '플레이어';
    const token = String(msg.token || '');

    const existing = this.seats.find(s => s.token === token);
    if (existing) { // 재접속 — 원래 자리 복구
      clearTimeout(this.timers.get(token));
      this.timers.delete(token);
      const wasOff = !existing.connected;
      existing.conn = conn;
      existing.connected = true;
      existing.name = name;
      if (wasOff && this.state) this.pushChat(null, `${name} 님이 다시 연결되었습니다.`);
    } else if (this.state) {
      this.net.send(conn, { t: 'error', msg: '이미 시작된 게임입니다. 참가할 수 없습니다.', fatal: true });
      return;
    } else if (this.seats.length >= MAX_PLAYERS) {
      this.net.send(conn, { t: 'error', msg: `정원(${MAX_PLAYERS}명)이 찼습니다.`, fatal: true });
      return;
    } else {
      this.seats.push({ token, name, connected: true, conn });
      this.pushChat(null, `${name} 님이 입장했습니다.`);
    }
    this.pushAll();
  }

  dropConn(conn) {
    const seat = this.seatOf(conn);
    if (!seat) return;
    seat.connected = false;
    seat.conn = null;

    if (!this.state) {
      // 로비에서는 잠깐 끊긴 것일 수 있으므로 바로 자리를 비우지 않는다
      clearTimeout(this.timers.get(seat.token));
      this.timers.set(seat.token, setTimeout(() => {
        if (seat.connected || this.state) return;
        this.seats = this.seats.filter(s => s !== seat);
        this.pushChat(null, `${seat.name} 님이 퇴장했습니다.`);
        this.pushAll();
      }, LOBBY_GRACE_MS));
      this.pushChat(null, `${seat.name} 님의 연결이 끊겼습니다. 다시 연결을 기다리는 중…`);
    } else {
      this.pushChat(null, `${seat.name} 님의 연결이 끊겼습니다. 돌아오면 자동으로 이어집니다.`);
    }
    this.pushAll();
  }

  startGame(conn) {
    if (this.state) return;
    if (this.seats.length < MIN_PLAYERS) {
      const msg = `최소 ${MIN_PLAYERS}명이 필요합니다.`;
      if (conn) this.net.send(conn, { t: 'error', msg }); else this.error = msg;
      this.onChange?.();
      return;
    }
    this.state = E.createGame(this.seats.map((s, i) => ({ name: s.name, ref: i })), Date.now(), this.opts);
    this.pushChat(null, '게임이 시작되었습니다.');
    this.pushAll();
  }

  act(seatIdx, action, conn) {
    if (!this.state) return;
    const playerIdx = this.playerIndexForSeat(seatIdx);
    if (playerIdx < 0) return;
    const res = E.applyAction(this.state, playerIdx, action);
    if (!res.ok) {
      if (conn) this.net.send(conn, { t: 'error', msg: res.error });
      else { this.error = res.error; this.onChange?.(); }
      return;
    }
    this.error = '';
    this.pushAll();
  }

  // 방장 자신의 입력
  localAct(action) { this.act(0, action, null); }
  localChat(text) { const t = String(text || '').slice(0, 200).trim(); if (t) { this.pushChat(this.seats[0].name, t); this.pushAll(); } }
  localStart() { this.startGame(null); }

  pushChat(from, text) {
    this.chat.push(nowChat(from, text));
    if (this.chat.length > 100) this.chat.splice(0, this.chat.length - 100);
  }

  lobbyPayload() {
    return {
      code: this.code,
      opts: this.opts,
      started: !!this.state,
      seats: this.seats.map(s => ({ name: s.name, connected: s.connected })),
    };
  }

  pushAll() {
    this.save();
    for (const seat of this.seats) {
      if (!seat.conn) continue;
      const seatIdx = this.seats.indexOf(seat);
      this.net.send(seat.conn, {
        t: 'sync',
        seat: seatIdx,
        lobby: this.lobbyPayload(),
        chat: this.chat,
        state: this.state ? E.sanitize(this.state, this.playerIndexForSeat(seatIdx)) : null,
      });
    }
    this.onChange?.();
  }

  // 화면 렌더링에 쓰는 통합 뷰.
  // 방장 화면도 sanitize를 거쳐 다른 사람 손패가 보이지 않게 한다.
  view() {
    const me = this.state ? this.playerIndexForSeat(0) : -1;
    return {
      isHost: true,
      code: this.code,
      seat: 0,
      lobby: this.lobbyPayload(),
      chat: this.chat,
      state: this.state ? E.sanitize(this.state, me) : null,
      me,
      error: this.error,
      status: this.status,
    };
  }

  destroy() {
    clearInterval(this.beat);
    for (const t of this.timers.values()) clearTimeout(t);
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    this.net?.destroy();
  }
}

export class GuestRoom {
  constructor({ code, name, onChange, onFatal }) {
    this.isHost = false;
    this.code = code;
    this.name = name;
    this.onChange = onChange;
    this.onFatal = onFatal;
    this.token = Net.myToken();
    this.seat = -1;
    this.lobby = { code, started: false, seats: [] };
    this.chat = [];
    this.state = null;
    this.error = '';
    this.net = null;
    this.status = 'connecting';
    this.attempt = 0;
    this.closed = false;
    this.lastSeen = 0;
  }

  // 최초 연결. 여기서 실패하면 방 코드가 틀렸을 가능성이 커서 그대로 알린다.
  async open() {
    await this.dial();
    this.watchConnection();
  }

  async dial() {
    this.net = await Net.joinHost(this.code, {
      onData: msg => this.handle(msg),
      onClose: () => this.lost(),
    });
    this.net.send({ t: 'hello', token: this.token, name: this.name });
    this.status = 'ok';
    this.attempt = 0;
    this.lastSeen = Date.now();
    this.onChange?.();
  }

  // 연결이 끊기면 내쫓지 않고 조용히 다시 붙는다.
  // 모바일에서 잠깐 브라우저를 벗어나면 탭이 얼면서 연결이 끊기는데, 돌아오면 이 경로로 복구된다.
  lost() {
    if (this.closed || this.status === 'reconnecting') return;
    try { this.net?.destroy(); } catch { /* 무시 */ }
    this.net = null;
    this.status = 'reconnecting';
    this.onChange?.();
    this.scheduleRetry();
  }

  scheduleRetry() {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    const delay = Math.min(1500 * 2 ** Math.min(this.attempt, 4), 10000);
    this.attempt++;
    this.retryTimer = setTimeout(async () => {
      if (this.closed) return;
      try {
        await this.dial();
      } catch {
        // 방장이 아직 안 돌아왔을 수 있다 — 계속 기다린다
        this.status = 'reconnecting';
        this.onChange?.();
        this.scheduleRetry();
      }
    }, delay);
  }

  retryNow() {
    if (this.closed || this.status === 'ok') return;
    this.attempt = 0;
    clearTimeout(this.retryTimer);
    this.scheduleRetry();
  }

  // 호스트의 신호가 끊기면 close 이벤트 없이 조용히 죽는 경우가 있어 직접 감시한다
  watchConnection() {
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.closed) return;
      if (this.status === 'ok' && Date.now() - this.lastSeen > STALE_MS) this.lost();
    }, 2000);

    this.onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // 백그라운드에서 돌아왔다 — 연결 상태를 즉시 확인하고 필요하면 바로 재시도
      if (this.status !== 'ok' || !this.net?.alive()) { this.status = 'ok'; this.lost(); this.retryNow(); }
    };
    document.addEventListener('visibilitychange', this.onVisible);
  }

  handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    this.lastSeen = Date.now();
    if (msg.t === 'ping') return;
    if (msg.t === 'error') {
      this.error = msg.msg;
      // 정원 초과·이미 시작된 게임처럼 호스트가 거부한 경우에만 포기한다
      if (msg.fatal) { this.closed = true; this.onFatal?.(new Error(msg.msg)); }
      this.onChange?.();
      return;
    }
    if (msg.t === 'sync') {
      this.seat = msg.seat;
      this.lobby = msg.lobby;
      this.chat = msg.chat || [];
      this.state = msg.state;
      this.error = '';
      this.onChange?.();
    }
  }

  playerIndexForSeat(seatIdx) {
    if (!this.state) return -1;
    return this.state.players.findIndex(p => p.ref === seatIdx);
  }

  localAct(action) { this.net?.send({ t: 'action', action }); }
  localChat(text) { const t = String(text || '').slice(0, 200).trim(); if (t) this.net?.send({ t: 'chat', text: t }); }
  localStart() { /* 참가자는 시작할 수 없다 */ }

  view() {
    return {
      isHost: false,
      code: this.code,
      seat: this.seat,
      lobby: this.lobby,
      chat: this.chat,
      state: this.state,
      me: this.state ? this.playerIndexForSeat(this.seat) : -1,
      error: this.error,
      status: this.status,
    };
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    this.net?.destroy();
  }
}

// 한 브라우저에서 전원을 조작하는 로컬 모드 (?local=N).
// 네트워크 없이 룰을 연습하거나 UI를 확인할 때 쓴다.
export class LocalRoom {
  constructor({ count, names, onChange, opts }) {
    this.isHost = true;
    this.local = true;
    this.opts = opts || {};
    this.code = 'LOCAL';
    this.onChange = onChange;
    this.seatNames = names || Array.from({ length: count }, (_, i) => `플레이어 ${i + 1}`);
    this.state = null;
    this.chat = [{ from: null, text: '로컬 모드 — 한 화면에서 전원을 번갈아 조작합니다.', n: 0 }];
    this.error = '';
  }

  async open() { this.onChange?.(); }
  playerIndexForSeat(seatIdx) { return this.state ? this.state.players.findIndex(p => p.ref === seatIdx) : -1; }

  localStart() {
    this.state = E.createGame(this.seatNames.map((name, i) => ({ name, ref: i })), Date.now(), this.opts);
    this.onChange?.();
  }

  localAct(action) {
    if (!this.state) return;
    const res = E.applyAction(this.state, E.actingPlayer(this.state), action);
    this.error = res.ok ? '' : res.error;
    this.onChange?.();
  }

  localChat(text) { if (text) { this.chat.push({ from: '나', text, n: Date.now() }); this.onChange?.(); } }

  view() {
    // 로컬 모드에서는 지금 조작할 차례인 플레이어의 시점으로 본다.
    // 게임이 끝나면 actingPlayer()가 null이므로 선공 시점으로 되돌린다.
    const me = this.state ? (E.actingPlayer(this.state) ?? 0) : -1;
    return {
      isHost: true,
      local: true,
      code: this.code,
      seat: 0,
      lobby: { code: this.code, started: !!this.state, seats: this.seatNames.map(n => ({ name: n, connected: true })) },
      chat: this.chat,
      state: this.state ? E.sanitize(this.state, me) : null,
      me,
      error: this.error,
      status: 'ok',
    };
  }

  destroy() {}
}
