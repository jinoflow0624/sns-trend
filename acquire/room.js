// 방(로비 + 진행 중 게임) 관리.
// HostRoom  : 권위 있는 게임 상태를 보유. 모든 액션을 검증하고 결과를 브로드캐스트한다.
// GuestRoom : 호스트가 보내준 상태를 그대로 반영하고, 입력은 액션 메시지로 보낸다.

import * as E from './engine.js';
import * as Net from './net.js';

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;

const nowChat = (from, text) => ({ from, text, n: Date.now() + Math.random() });

export class HostRoom {
  // onChange: 화면을 다시 그려야 할 때 호출
  constructor({ code, hostName, onChange, onFatal }) {
    this.isHost = true;
    this.code = code;
    this.onChange = onChange;
    this.onFatal = onFatal;
    this.token = Net.myToken();
    this.seats = [{ token: this.token, name: hostName, connected: true, conn: null }];
    this.state = null;
    this.chat = [];
    this.net = null;
    this.error = '';
  }

  async open() {
    this.net = await Net.startHost(this.code, {
      onConnect: () => this.onChange?.(),
      onData: (conn, msg) => this.handle(conn, msg),
      onClose: conn => this.dropConn(conn),
      onError: err => this.onFatal?.(err),
    });
    this.onChange?.();
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
      existing.conn = conn;
      existing.connected = true;
      existing.name = name;
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
    if (!this.state) { // 로비에서 나가면 자리를 비운다
      this.seats = this.seats.filter(s => s !== seat);
      this.pushChat(null, `${seat.name} 님이 퇴장했습니다.`);
    } else {
      this.pushChat(null, `${seat.name} 님의 연결이 끊겼습니다. 다시 들어오면 자리를 이어받습니다.`);
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
    this.state = E.createGame(this.seats.map((s, i) => ({ name: s.name, ref: i })));
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
      started: !!this.state,
      seats: this.seats.map(s => ({ name: s.name, connected: s.connected })),
    };
  }

  pushAll() {
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
    };
  }

  destroy() { this.net?.destroy(); }
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
  }

  async open() {
    this.net = await Net.joinHost(this.code, {
      onData: msg => this.handle(msg),
      onClose: () => this.onFatal?.(new Error('방장과의 연결이 끊어졌습니다. 방장이 페이지를 열어 둔 상태에서 새로고침해 주세요.')),
    });
    this.net.send({ t: 'hello', token: this.token, name: this.name });
  }

  handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'error') {
      this.error = msg.msg;
      if (msg.fatal) this.onFatal?.(new Error(msg.msg));
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
    };
  }

  destroy() { this.net?.destroy(); }
}

// 한 브라우저에서 전원을 조작하는 로컬 모드 (?local=N).
// 네트워크 없이 룰을 연습하거나 UI를 확인할 때 쓴다.
export class LocalRoom {
  constructor({ count, names, onChange }) {
    this.isHost = true;
    this.local = true;
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
    this.state = E.createGame(this.seatNames.map((name, i) => ({ name, ref: i })));
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
    };
  }

  destroy() {}
}
