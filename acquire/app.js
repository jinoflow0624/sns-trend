// 화면 렌더링과 입력 처리.
import * as E from './engine.js';
import * as Net from './net.js';
import { HostRoom, GuestRoom, LocalRoom, loadHostGame, clearHostGame, MIN_PLAYERS, MAX_PLAYERS } from './room.js';
import { loadFirebase, firebaseReady, FireRoom, sweepMyRooms, watchUsage, usageInfo, FREE_MONTHLY_BYTES } from './fire.js';
import * as FX from './fx.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const won = n => '$' + Number(n).toLocaleString();

let room = null;
const ui = {
  selTile: null, buy: {}, dispose: { sell: 0, trade: 0 }, tab: 'info',
  lastTile: null, prevBoard: null,
  seenEvent: 0,     // 팝업으로 이미 보여준 이벤트 번호
  seenChat: 0,      // 이미 읽은 채팅 번호
  unread: 0,        // 안 읽은 채팅 수
  chatInit: false,  // 첫 렌더에서 기존 대화를 '읽음'으로 처리했는지
  wasMyTurn: false, // 내 차례 전환을 감지하기 위한 이전 상태
  endAsked: false,  // 종료 선언 팝업을 이미 띄웠는지
  endShown: false,  // 최종 결과 팝업을 이미 띄웠는지
};

// ── 화면 전환 ────────────────────────────────────────────────────────────────
function show(which) {
  $('setup').hidden = which !== 'setup';
  $('lobby').hidden = which !== 'lobby';
  $('game').hidden = which !== 'game';
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function inviteLink(code) {
  const q = new URLSearchParams();
  q.set('room', code);
  // 자체 브로커를 쓰는 경우 초대 링크에도 그대로 넘겨준다
  const cur = new URLSearchParams(location.search);
  for (const k of ['peerhost', 'peerport', 'peerpath', 'peersecure']) {
    if (cur.has(k)) q.set(k, cur.get(k));
  }
  return `${location.origin}${location.pathname}?${q}`;
}

async function copyInvite() {
  const link = inviteLink(room?.code || '');
  try {
    await navigator.clipboard.writeText(link);
    toast('초대 링크를 복사했습니다');
  } catch {
    // 클립보드 권한이 없는 브라우저 — 직접 복사할 수 있게 보여준다
    prompt('아래 링크를 복사해 공유하세요', link);
  }
}

// ── 시작 화면 ────────────────────────────────────────────────────────────────
function setupMsg(text, ok = false) {
  const n = $('setupMsg');
  n.textContent = text;
  n.classList.toggle('ok', ok);
}

function myName() {
  const v = $('nameInput').value.trim().slice(0, 12);
  return v || '플레이어';
}

const CUR_KEY = 'acquire.currentRoom';
const rememberCurrent = code => { try { localStorage.setItem(CUR_KEY, code); } catch { /* 무시 */ } };
const recallCurrent = () => { try { return localStorage.getItem(CUR_KEY) || ''; } catch { return ''; } };
const forgetCurrent = () => { try { localStorage.removeItem(CUR_KEY); } catch { /* 무시 */ } };

// 방을 나간다. 다시 자동으로 끌려 들어가지 않게 기억도 지운다.
function leaveRoom() {
  forgetCurrent();
  room?.destroy();
  room = null;
  releaseWakeLock?.();
  releaseWakeLock = null;
  Object.assign(ui, {
    selTile: null, buy: {}, dispose: { sell: 0, trade: 0 },
    seenEvent: 0, seenChat: 0, chatInit: false, unread: 0, wasMyTurn: false,
    endAsked: false, endShown: false, prevBoard: null, lastTile: null,
  });
  history.replaceState(null, '', location.pathname);
  show('setup');
  setupMsg('방에서 나왔습니다.', true);
}

let releaseWakeLock = null;
function wireRoom(r) {
  room = r;
  // 모바일에서 화면이 꺼지면 탭이 얼어 연결이 끊긴다 — 게임 중에는 화면을 깨워 둔다
  releaseWakeLock?.();
  releaseWakeLock = Net.keepScreenAwake();
  rememberCurrent(r.code);
  window.addEventListener('beforeunload', () => r.destroy());
}

async function doHost(restore = null) {
  const name = myName();
  Net.rememberName(name);
  setupMsg(restore ? '방을 다시 여는 중…' : '방을 만드는 중…');
  $('btnHost').disabled = $('btnJoin').disabled = true;
  try {
    if (firebaseReady() && !restore) {
      const r = new FireRoom({
        code: Net.makeRoomCode(), name, create: true,
        opts: { privateShares: $('optPrivate').checked },
        onChange: render,
        onFatal: err => { setupMsg(err.message || '연결 오류'); show('setup'); },
      });
      wireRoom(r);  // 구독 콜백이 open() 도중에 올 수 있어 먼저 연결해 둔다
      try {
        await r.open();
      } catch (err) { room = null; throw err; }
      setupMsg('');
      render();
      return;
    }
    const r = new HostRoom({
      code: restore ? restore.code : Net.makeRoomCode(),
      hostName: name,
      restore,
      opts: { privateShares: $('optPrivate').checked },
      onChange: render,
      onFatal: err => { setupMsg(err.message || '연결 오류'); show('setup'); },
    });
    await r.open();
    wireRoom(r);
    setupMsg('');
    render();
  } catch (err) {
    setupMsg(err.message || '방을 만들지 못했습니다.');
  } finally {
    $('btnHost').disabled = $('btnJoin').disabled = false;
  }
}

async function doJoin() {
  const code = Net.normalizeCode($('codeInput').value);
  if (!code) { setupMsg('방 코드를 입력해 주세요.'); $('codeInput').focus(); return; }
  const name = myName();
  Net.rememberName(name);
  setupMsg('방에 접속하는 중…');
  $('btnHost').disabled = $('btnJoin').disabled = true;
  try {
    if (firebaseReady()) {
      const r = new FireRoom({
        code, name, create: false,
        onChange: render,
        onFatal: err => { setupMsg(err.message || '연결이 끊어졌습니다.'); show('setup'); },
      });
      wireRoom(r);
      try {
        await r.open();
      } catch (err) { room = null; throw err; }
      setupMsg('');
      render();
      return;
    }
    const r = new GuestRoom({
      code, name,
      onChange: render,
      onFatal: err => { setupMsg(err.message || '연결이 끊어졌습니다.'); show('setup'); },
    });
    await r.open();
    wireRoom(r);
    setupMsg('');
  } catch (err) {
    setupMsg(err.message || '접속하지 못했습니다.');
    throw err;
  } finally {
    $('btnHost').disabled = $('btnJoin').disabled = false;
  }
}

// ── 로비 ─────────────────────────────────────────────────────────────────────
function renderLobby(v) {
  $('lobbyCode').textContent = v.code;
  const list = $('lobbySeats');
  list.replaceChildren();
  v.lobby.seats.forEach((s, i) => {
    const li = el('li');
    li.append(el('span', 'dot' + (s.connected ? '' : ' off')), el('span', null, s.name));
    if (i === 0 && !v.serverless) li.append(el('span', 'seat-tag', '방장'));
    if (i === v.seat) li.append(el('span', 'you-tag', '나'));
    list.append(li);
  });

  const n = v.lobby.seats.length;
  const start = $('btnStart');
  // 서버 모드에는 방장이 없어 누구나 시작할 수 있다
  start.hidden = !(v.isHost || v.serverless);
  start.disabled = n < MIN_PLAYERS;
  start.textContent = n < MIN_PLAYERS ? `게임 시작 (${MIN_PLAYERS}명 이상 필요)` : `게임 시작 (${n}명)`;
  $('lobbyWait').hidden = v.isHost || v.serverless;
  $('lobbyPrivate').hidden = !v.lobby.opts?.privateShares;
  const reconnecting = v.status && v.status !== 'ok';
  $('lobbyMsg').textContent = reconnecting
    ? '연결이 끊겼습니다. 다시 연결하는 중…'
    : (v.error || (v.isHost ? `링크를 공유하세요 · 최대 ${MAX_PLAYERS}명` : ''));
}

// ── 보드 ─────────────────────────────────────────────────────────────────────
function renderBoard(v) {
  const state = v.state;
  const board = $('board');
  const sizes = E.chainSizes(state);
  const acting = E.actingPlayer(state);
  const canPlace = state.phase === 'place' && acting === v.me;

  // 마지막으로 놓인 타일 추적 (보드가 실제로 바뀐 경우에만 갱신)
  if (ui.prevBoard) {
    for (let i = 0; i < state.board.length; i++) {
      if (ui.prevBoard[i] === null && state.board[i] !== null) { ui.lastTile = i; break; }
    }
  }
  ui.prevBoard = state.board.slice();

  board.replaceChildren();
  for (let i = 0; i < E.TILE_COUNT; i++) {
    const cell = el('button', 'cell');
    cell.type = 'button';
    const val = state.board[i];
    if (val && val !== 'orphan') {
      const info = E.chainInfo(val);
      cell.classList.add('chain');
      cell.style.background = info.color;
      cell.textContent = info.name[0];
      cell.title = `${info.ko} · ${E.tileName(i)}`;
      if (sizes[val] >= E.SAFE_SIZE) cell.classList.add('safe');
    } else if (val === 'orphan') {
      cell.classList.add('orphan');
      cell.textContent = E.tileName(i);
      cell.title = `독립 타일 · ${E.tileName(i)}`;
    } else {
      cell.textContent = E.tileName(i);
      cell.disabled = true;
    }
    if (i === ui.lastTile) cell.classList.add('last');

    if (canPlace && ui.selTile === i) {
      cell.classList.add('target');
      cell.disabled = false;
      cell.onclick = () => placeSelected();
    } else if (!cell.classList.contains('target')) {
      cell.disabled = true;
    }
    board.append(cell);
  }
}

function placeSelected() {
  if (ui.selTile == null) return;
  const tile = ui.selTile;
  ui.selTile = null;
  room.localAct({ type: 'place', tile });
}

function renderHand(v) {
  const state = v.state;
  const hand = $('hand');
  hand.replaceChildren();
  const me = state.players[v.me];
  if (!me || !me.hand) { hand.append(el('span', 'hand-note', '관전 중')); return; }

  const acting = E.actingPlayer(state);
  const offline = v.status && v.status !== 'ok';
  const myPlacePhase = state.phase === 'place' && acting === v.me && !offline;

  for (const tile of me.hand) {
    const status = E.tileStatus(state, tile);
    const b = el('button', 'tile', E.tileName(tile));
    b.type = 'button';
    if (status !== 'ok') {
      b.classList.add('blocked');
      b.disabled = true;
      b.title = status === 'dead' ? '영구히 놓을 수 없는 타일' : '지금은 놓을 수 없습니다 (체인 7개가 모두 보드에 있음)';
    } else if (!myPlacePhase) {
      b.disabled = true;
    } else {
      if (ui.selTile === tile) b.classList.add('sel');
      b.onclick = () => { ui.selTile = ui.selTile === tile ? null : tile; render(); };
    }
    hand.append(b);
  }
  hand.append(el('span', 'hand-note', `· 남은 타일 ${state.bagCount ?? 0}개`));
}

// ── 액션 패널 ────────────────────────────────────────────────────────────────
function chainButton(id, label, onClick) {
  const info = E.chainInfo(id);
  const b = el('button', 'chain-pick');
  b.type = 'button';
  const sw = el('span', 'swatch');
  sw.style.background = info.color;
  b.append(sw, el('span', null, label ?? info.ko));
  b.onclick = onClick;
  return b;
}

function stepper(value, min, max, step, onChange) {
  const wrap = el('div', 'stepper');
  const dec = el('button', null, '−'); dec.type = 'button';
  const val = el('span', 'val', String(value));
  const inc = el('button', null, '+'); inc.type = 'button';
  dec.disabled = value - step < min;
  inc.disabled = value + step > max;
  dec.onclick = () => onChange(value - step);
  inc.onclick = () => onChange(value + step);
  wrap.append(dec, val, inc);
  return wrap;
}

function renderAction(v) {
  const pane = $('actionPane');
  pane.replaceChildren();
  const state = v.state;

  if (state.ended) return renderResults(pane, state);

  // 연결이 끊긴 동안의 입력은 호스트에 닿지 않는다 — 아예 막아서 헛손질을 방지
  const offline = v.status && v.status !== 'ok';
  pane.classList.toggle('is-offline', !!offline);
  if (offline) {
    pane.append(el('div', 'action-title', '연결이 끊겼습니다'));
    pane.append(el('div', 'waiting', v.serverless
      ? '서버와 다시 연결하는 중입니다. 잠시만 기다려 주세요.'
      : (v.isHost
        ? '브로커와 다시 연결하는 중입니다. 잠시만 기다려 주세요.'
        : '방장과 다시 연결하는 중입니다. 방장이 돌아오면 자동으로 이어집니다.')));
    return;
  }

  const acting = E.actingPlayer(state);
  const actingName = state.players[acting]?.name ?? '?';
  const mine = acting === v.me;

  if (!mine) {
    pane.append(el('div', 'action-title', `${actingName} 님의 차례`));
    const seat = v.lobby.seats[state.players[acting]?.ref];
    if (seat && !seat.connected) {
      pane.append(el('div', 'waiting', seat.absent
        ? `${actingName} 님이 접속 중이 아닙니다. 잠시 후 다른 사람이 대신 진행할 수 있습니다.`
        : `${actingName} 님의 연결이 끊겼습니다. 돌아오기를 기다리는 중…`));
    } else {
      pane.append(el('div', 'waiting', phaseHint(state, false)));
    }
    return;
  }

  const title = el('div', 'action-title', phaseTitle(state));
  const hint = el('div', 'action-hint', phaseHint(state, true));
  pane.append(title, hint);
  if (v.proxyFor) {
    // 자리를 비운 사람을 대신 진행하는 중 — 누구 대신인지 분명히 보여준다
    pane.append(el('div', 'proxy-note', `⚠ ${v.proxyFor} 님이 접속 중이 아니라 대신 진행합니다.`));
  }
  const row = el('div', 'action-row');

  switch (state.phase) {
    case 'place': {
      const me = state.players[v.me];
      const playable = E.playableTiles(state, me.hand || []);
      if (ui.selTile != null) {
        const go = el('button', 'btn btn-primary', `${E.tileName(ui.selTile)}에 놓기`);
        go.onclick = placeSelected;
        const cancel = el('button', 'btn', '취소');
        cancel.onclick = () => { ui.selTile = null; render(); };
        row.append(go, cancel);
      } else if (playable.length === 0) {
        const pass = el('button', 'btn btn-primary', '놓을 수 있는 타일이 없음 — 턴 넘기기');
        pass.onclick = () => room.localAct({ type: 'pass' });
        row.append(pass);
      }
      break;
    }
    case 'found':
      for (const id of E.availableChains(state)) {
        row.append(chainButton(id, null, () => room.localAct({ type: 'found', chain: id })));
      }
      break;
    case 'survivor': {
      const m = state.merger;
      const max = Math.max(...m.chains.map(id => m.sizes[id]));
      for (const id of m.chains.filter(id => m.sizes[id] === max)) {
        row.append(chainButton(id, `${E.chainInfo(id).ko} (${m.sizes[id]}칸)`, () => room.localAct({ type: 'survivor', chain: id })));
      }
      break;
    }
    case 'defunctOrder': {
      const m = state.merger;
      const max = Math.max(...m.pending.map(id => m.sizes[id]));
      for (const id of m.pending.filter(id => m.sizes[id] === max)) {
        row.append(chainButton(id, `${E.chainInfo(id).ko} 먼저`, () => room.localAct({ type: 'defunctOrder', chain: id })));
      }
      break;
    }
    case 'dispose':
      renderDispose(pane, row, v);
      break;
    case 'buy':
      renderBuy(pane, row, v);
      break;
  }

  // 되돌리기 — 타일을 놓은 뒤 턴이 끝나기 전까지, 놓은 사람만
  if (state.canUndo) {
    const undo = el('button', 'btn btn-undo', '↩ 방금 놓은 타일 되돌리기');
    undo.onclick = () => {
      ui.selTile = null;
      ui.buy = {};
      ui.dispose = { sell: 0, trade: 0 };
      room.localAct({ type: 'undo' });
      toast('마지막 수를 되돌렸습니다');
    };
    row.append(undo);
  }

  pane.append(row);
  if (v.error) pane.append(el('div', 'action-err', v.error));
}

function phaseTitle(state) {
  return {
    place: '타일을 놓으세요',
    found: '창립할 호텔 체인을 고르세요',
    survivor: '어느 체인이 살아남을까요?',
    defunctOrder: '어느 체인부터 정리할까요?',
    dispose: '소멸 주식을 처분하세요',
    buy: '주식을 구매하세요 (최대 3장)',
  }[state.phase] || '';
}

function phaseHint(state, mine) {
  const who = mine ? '' : '상대가 ';
  switch (state.phase) {
    case 'place': return mine ? '손패에서 타일을 고른 뒤 보드의 깜빡이는 칸을 누르세요.' : `${who}타일을 놓는 중…`;
    case 'found': return mine ? '창립자는 이 체인의 주식 1장을 무료로 받습니다.' : `${who}창립할 체인을 고르는 중…`;
    case 'survivor': return mine ? '크기가 같아 생존 체인을 직접 고릅니다.' : `${who}생존 체인을 고르는 중…`;
    case 'defunctOrder': return mine ? '소멸 체인 크기가 같습니다. 처리 순서를 고르세요.' : `${who}처리 순서를 고르는 중…`;
    case 'dispose': {
      const m = state.merger;
      const d = E.chainInfo(m.current).ko, s = E.chainInfo(m.survivor).ko;
      return mine
        ? `${d} 주식을 보유·매각하거나 2장당 ${s} 1장으로 교환할 수 있습니다.`
        : `${who}${d} 주식을 처분하는 중…`;
    }
    case 'buy': return mine ? '보드에 있는 체인만, 한 턴에 최대 3장까지 살 수 있습니다.' : `${who}주식을 사는 중…`;
    default: return '';
  }
}

function renderDispose(pane, row, v) {
  const state = v.state, m = state.merger;
  const defunct = m.current, survivor = m.survivor;
  const held = state.players[v.me].shares[defunct];
  const price = m.prices[defunct];
  const poolSurv = state.pool[survivor];

  let { sell, trade } = ui.dispose;
  sell = Math.min(sell, held);
  trade = Math.min(trade, held - sell, poolSurv * 2);
  trade -= trade % 2;

  const info = el('div', 'action-hint');
  info.textContent = `보유 ${held}장 · ${E.chainInfo(defunct).ko} 주가 ${won(price)} · ${E.chainInfo(survivor).ko} 재고 ${poolSurv}장`;
  pane.append(info);

  const grid = el('div', 'buy-grid');

  const sellItem = el('div', 'buy-item');
  const sellTxt = el('div', 'txt');
  sellTxt.append(el('div', 'nm', '매각'), el('span', 'pr', `현금 +${won(sell * price)}`));
  sellItem.append(sellTxt, stepper(sell, 0, held - trade, 1, n => { ui.dispose.sell = n; render(); }));
  grid.append(sellItem);

  const tradeItem = el('div', 'buy-item');
  const tradeTxt = el('div', 'txt');
  tradeTxt.append(el('div', 'nm', `${E.chainInfo(survivor).ko}(으)로 교환`),
    el('span', 'pr', `2장당 1장 · ${trade}장 → ${trade / 2}장`));
  tradeItem.append(tradeTxt, stepper(trade, 0, Math.min(held - sell, poolSurv * 2), 2, n => { ui.dispose.trade = n; render(); }));
  grid.append(tradeItem);

  pane.append(grid);
  pane.append(el('div', 'action-hint', `보유 유지: ${held - sell - trade}장`));

  const go = el('button', 'btn btn-primary', '처분 확정');
  go.onclick = () => { const d = { ...ui.dispose, sell, trade }; ui.dispose = { sell: 0, trade: 0 }; room.localAct({ type: 'dispose', sell: d.sell, trade: d.trade }); };
  const keep = el('button', 'btn', '전부 보유');
  keep.onclick = () => { ui.dispose = { sell: 0, trade: 0 }; room.localAct({ type: 'dispose', sell: 0, trade: 0 }); };
  row.append(go, keep);
}

function renderBuy(pane, row, v) {
  const state = v.state;
  const sizes = E.chainSizes(state);
  const active = E.CHAIN_IDS.filter(id => sizes[id] > 0);
  const money = state.players[v.me].money;

  let count = 0, cost = 0;
  for (const id of active) {
    const n = Math.min(ui.buy[id] || 0, state.pool[id]);
    count += n;
    cost += n * E.stockPrice(id, sizes[id]);
  }

  if (active.length === 0) {
    pane.append(el('div', 'action-hint', '보드에 체인이 없어 살 수 있는 주식이 없습니다.'));
  } else {
    const grid = el('div', 'buy-grid');
    for (const id of active) {
      const info = E.chainInfo(id);
      const price = E.stockPrice(id, sizes[id]);
      const n = Math.min(ui.buy[id] || 0, state.pool[id]);
      const room4 = E.MAX_BUY - (count - n);
      const affordable = Math.floor((money - (cost - n * price)) / price);
      const max = Math.max(0, Math.min(state.pool[id], room4, affordable));

      // 지금 실제로 한 장이라도 더 살 수 있는 체인을 굵은 점선으로 구분한다
      const item = el('div', 'buy-item' + (max > n ? ' can-buy' : ''));
      const sw = el('span', 'swatch'); sw.style.background = info.color;
      const txt = el('div', 'txt');
      txt.append(el('div', 'nm', info.ko), el('span', 'pr', `${won(price)} · 재고 ${state.pool[id]}장`));
      item.append(sw, txt, stepper(n, 0, max, 1, x => { ui.buy[id] = x; render(); }));
      grid.append(item);
    }
    pane.append(grid);
  }

  const total = el('div', 'buy-total' + (cost > money ? ' over' : ''), `${count}장 · ${won(cost)} / 보유 ${won(money)}`);
  row.append(total);

  const go = el('button', 'btn btn-primary', count > 0 ? '구매하고 턴 종료' : '사지 않고 턴 종료');
  go.disabled = cost > money || count > E.MAX_BUY;
  go.onclick = () => { const picks = { ...ui.buy }; ui.buy = {}; room.localAct({ type: 'buy', picks }); };
  row.append(go);

  if (state.buy?.canEnd) {
    const end = el('button', 'btn', '🏁 게임 종료 선언');
    end.onclick = () => {
      if (!confirm('게임을 끝냅니다. 모든 체인의 배당을 지급하고 주식을 현금화한 뒤 순위를 매깁니다. 진행할까요?')) return;
      const picks = { ...ui.buy }; ui.buy = {};
      room.localAct({ type: 'buy', picks, declareEnd: true });
    };
    row.append(end);
  }
}

function renderResults(pane, state) {
  pane.append(el('div', 'action-title', '🏆 게임 종료'));
  const wrap = el('div', 'results');
  state.results.forEach((r, i) => {
    const line = el('div', 'result-row' + (i === 0 ? ' win' : ''));
    line.append(el('span', 'rank', `${i + 1}위`), el('span', null, r.name), el('span', 'amt', won(r.money)));
    wrap.append(line);
  });
  pane.append(wrap);
  const again = el('button', 'btn btn-wide', '새 게임 시작하기');
  again.style.marginTop = '12px';
  again.onclick = () => location.href = location.pathname;
  pane.append(again);
}

// ── 사이드 패널 ──────────────────────────────────────────────────────────────
function renderChains(v) {
  const state = v.state;
  const sizes = E.chainSizes(state);
  const wrap = $('chainTable');
  wrap.replaceChildren();

  const table = el('table', 'chain-table');
  const thead = el('thead');
  const hr = el('tr');
  ['체인', '칸', '주가', '내 주식', '재고'].forEach(t => hr.append(el('th', null, t)));
  thead.append(hr);
  table.append(thead);

  const tbody = el('tbody');
  const mine = state.players[v.me]?.shares ?? null;
  for (const c of E.CHAINS) {
    const size = sizes[c.id];
    const tr = el('tr', size === 0 ? 'gone' : '');
    const nameCell = el('td');
    const cn = el('div', 'cn');
    const sw = el('span', 'swatch'); sw.style.background = c.color;
    cn.append(sw, el('span', null, c.ko));
    if (size >= E.SAFE_SIZE) cn.append(el('span', 'safe-tag', '안전'));
    nameCell.append(cn);
    tr.append(nameCell);
    tr.append(el('td', null, size || '—'));
    tr.append(el('td', null, size ? won(E.stockPrice(c.id, size)) : '—'));
    const ms = mine ? mine[c.id] : 0;
    tr.append(el('td', ms ? 'mine' : '', ms || '—'));
    tr.append(el('td', null, state.pool[c.id]));
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
}

function renderPlayers(v) {
  const state = v.state;
  const sizes = E.chainSizes(state);
  const acting = E.actingPlayer(state);
  const wrap = $('playerList');
  wrap.replaceChildren();

  state.players.forEach((p, i) => {
    const card = el('div', 'player-card' + (i === acting ? ' turn' : ''));
    const head = el('div', 'ph');
    head.append(el('span', null, p.name));
    const myIdx = v.mySeatPlayer ?? v.me;
    if (i === myIdx) head.append(el('span', 'you-tag', v.local ? '조작 중' : '나'));
    if (v.proxyFor && i === v.me) head.append(el('span', 'proxy-tag', '대신 진행'));
    const seat = v.lobby.seats[p.ref];
    if (seat && !seat.connected) head.append(el('span', 'off-tag', '끊김'));
    head.append(el('span', 'money', won(p.money)));
    card.append(head);

    if (!p.shares) {
      // 비공개 모드 — 남의 보유 종목은 가리고 총 장수만 보여준다
      card.append(el('div', 'none', p.shareCount ? `🔒 주식 ${p.shareCount}장 (비공개)` : '보유 주식 없음'));
      wrap.append(card);
      return;
    }
    const held = E.CHAIN_IDS.filter(id => p.shares[id] > 0);
    if (held.length) {
      const pills = el('div', 'shares');
      for (const id of held) {
        const info = E.chainInfo(id);
        const pill = el('span', 'share-pill', `${info.name[0]} ${p.shares[id]}`);
        pill.style.background = info.color;
        pill.title = `${info.ko} ${p.shares[id]}장${sizes[id] ? ` · 평가액 ${won(p.shares[id] * E.stockPrice(id, sizes[id]))}` : ' · 소멸 상태'}`;
        pills.append(pill);
      }
      card.append(pills);
    } else {
      card.append(el('div', 'none', '보유 주식 없음'));
    }
    wrap.append(card);
  });
}

function renderLog(v) {
  const list = $('logList');
  list.replaceChildren();
  for (const entry of v.state.log) list.append(el('div', null, entry.msg));
  list.scrollTop = list.scrollHeight;
  const parent = list.parentElement;
  parent.scrollTop = parent.scrollHeight;
}

function renderChat(v) {
  const list = $('chatList');
  list.replaceChildren();
  for (const c of v.chat) list.append(el('div', c.from ? '' : 'sys', c.from ? `${c.from}: ${c.text}` : c.text));
  const parent = list.parentElement;
  parent.scrollTop = parent.scrollHeight;

  // 새 채팅 감지 → 차임벨 + 빨간 배지.
  // 채팅이 아직 하나도 없는 상태(latest === 0)와 "처음 로드"를 구분해야 하므로 별도 플래그를 쓴다.
  const latest = v.chat.length ? Math.max(...v.chat.map(c => c.n || 0)) : 0;
  if (!ui.chatInit) { ui.chatInit = true; ui.seenChat = latest; }   // 들어오기 전 대화는 알리지 않는다
  else if (latest > ui.seenChat) {
    const fresh = v.chat.filter(c => (c.n || 0) > ui.seenChat);
    ui.seenChat = latest;
    if (ui.tab !== 'chat') {
      ui.unread += fresh.length;
      FX.chime();
    }
  }
  const badge = $('chatBadge');
  badge.hidden = ui.unread === 0;
  badge.textContent = ui.unread > 9 ? '9+' : String(ui.unread);
}

// ── 팝업 ─────────────────────────────────────────────────────────────────────
function chainChip(id) {
  const info = E.chainInfo(id);
  const chip = el('span', 'fx-chain');
  const sw = el('span', 'swatch');
  sw.style.background = info.color;
  chip.append(sw, el('span', null, info.ko));
  return chip;
}

// 합병 배당 — 누가 대주주/차대주주가 되어 얼마를 받았는지
function popupPayout(ev) {
  const node = el('div', 'fx-card');
  node.append(el('div', 'fx-kicker', '합병 배당'));
  const head = el('div', 'fx-title');
  head.append(chainChip(ev.chain), el('span', null, `${ev.size}칸 · 주가 ${won(ev.price)}`));
  node.append(head);

  if (!ev.entries.length) {
    node.append(el('div', 'fx-empty', '주주가 없어 배당이 없습니다.'));
  } else {
    const list = el('div', 'fx-list');
    for (const e of ev.entries) {
      const row = el('div', 'fx-row' + (e.role === 'majority' || e.role === 'sole' || e.role === 'tied-majority' ? ' top' : ''));
      row.append(el('span', 'fx-role', e.label), el('span', 'fx-name', e.name), el('span', 'fx-amt', '+' + won(e.amount)));
      list.append(row);
    }
    node.append(list);
  }
  FX.popup({ node, tone: 'payout', ms: 6000, sound: FX.cash });
}

// 안전 체인 — 5초 뒤 사라진다
function popupSafe(ev) {
  const node = el('div', 'fx-card');
  node.append(el('div', 'fx-kicker', '안전 체인'));
  const head = el('div', 'fx-title');
  head.append(chainChip(ev.chain), el('span', null, `${ev.size}칸`));
  node.append(head);
  node.append(el('div', 'fx-empty', `이제 합병으로 사라지지 않습니다. 주가 ${won(ev.price)}`));
  FX.popup({ node, tone: 'safe', ms: 5000, sound: FX.alert2 });
}

// 게임 종료 조건 충족 — 끝낼지 물어본다
function popupEndChoice() {
  const node = el('div', 'fx-card');
  node.append(el('div', 'fx-kicker', '게임 종료 가능'));
  node.append(el('div', 'fx-title', '지금 게임을 끝낼 수 있습니다'));
  node.append(el('div', 'fx-empty',
    '종료하면 모든 체인의 배당을 지급하고 주식을 전량 현금화한 뒤 순위를 매깁니다. 계속 진행해도 됩니다.'));
  FX.popup({
    node, tone: 'end', sound: FX.alert2,
    buttons: [
      { label: '🏁 지금 끝내기', primary: true, onClick: () => {
        const picks = { ...ui.buy }; ui.buy = {};
        room.localAct({ type: 'buy', picks, declareEnd: true });
      } },
      { label: '계속 진행', onClick: () => {} },
    ],
  });
}

const MEDALS = ['🥇', '🥈', '🥉'];

// 최종 순위 — 금·은·동과 항목별 내역
function popupResults(state) {
  const node = el('div', 'fx-card fx-results');
  node.append(el('div', 'fx-kicker', '게임 종료'));
  node.append(el('div', 'fx-title', `🏆 ${state.results[0].name} 님 우승!`));

  const list = el('div', 'fx-rank');
  state.results.forEach((r, i) => {
    const row = el('div', 'rank-row' + (i === 0 ? ' win' : ''));
    const head = el('div', 'rank-head');
    head.append(
      el('span', 'rank-medal', MEDALS[i] || `${i + 1}위`),
      el('span', 'rank-name', r.name),
      el('span', 'rank-total', won(r.money)),
    );
    row.append(head);

    const parts = el('div', 'rank-parts');
    parts.append(el('span', null, `현금 ${won(r.cash)}`));
    if (r.bonus) parts.append(el('span', null, `배당 +${won(r.bonus)}`));
    if (r.sale) parts.append(el('span', null, `주식 매각 +${won(r.sale)}`));
    row.append(parts);

    const held = Object.entries(r.shares || {});
    if (held.length) {
      const pills = el('div', 'rank-shares');
      for (const [id, n] of held) {
        const info = E.chainInfo(id);
        const pill = el('span', 'share-pill', `${info.name[0]} ${n}`);
        pill.style.background = info.color;
        pill.title = `${info.ko} ${n}장`;
        pills.append(pill);
      }
      row.append(pills);
    } else {
      row.append(el('div', 'rank-shares none', '보유 주식 없음'));
    }
    list.append(row);
  });
  node.append(list);

  FX.popup({
    node, tone: 'results', sound: FX.fanfare,
    buttons: [{ label: '확인', primary: true, onClick: () => {} }],
  });
}

// 상태가 바뀔 때마다 아직 못 본 사건을 팝업으로 풀어 준다
function drainEvents(v) {
  const state = v.state;
  if (!state) return;

  const events = state.events || [];
  // 되돌리기로 이벤트가 지워졌으면 기준 번호도 함께 낮춘다 (다시 놓으면 또 알리도록)
  const maxN = events.length ? Math.max(...events.map(e => e.n)) : 0;
  if (ui.seenEvent > maxN) ui.seenEvent = maxN;
  if (ui.seenEvent === 0 && events.length) {
    // 처음 들어왔거나 재접속한 경우 — 지난 사건을 몰아서 띄우지 않는다
    ui.seenEvent = Math.max(...events.map(e => e.n));
  }
  for (const ev of events.filter(e => e.n > ui.seenEvent).sort((a, b) => a.n - b.n)) {
    ui.seenEvent = ev.n;
    if (ev.type === 'payout') popupPayout(ev);
    else if (ev.type === 'safe') popupSafe(ev);
  }

  // 내 차례가 되면 차임벨
  const acting = E.actingPlayer(state);
  const myTurn = !state.ended && acting === v.me;
  if (myTurn && !ui.wasMyTurn) FX.chime();
  ui.wasMyTurn = myTurn;

  // 종료 조건 충족 — 판당 한 번만 알린다.
  // 이후로는 구매 패널의 "🏁 게임 종료 선언" 버튼이 계속 남아 있으므로 다시 묻지 않는다.
  if (myTurn && state.phase === 'buy' && state.buy?.canEnd && !ui.endAsked) {
    ui.endAsked = true;
    popupEndChoice();
  }

  if (state.ended && !ui.endShown) {
    ui.endShown = true;
    forgetCurrent();   // 끝난 방으로 다시 끌려 들어가지 않게
    popupResults(state);
  }
}

// ── 전체 렌더 ────────────────────────────────────────────────────────────────
function render() {
  if (!room) { show('setup'); return; }
  const v = room.view();

  if (!v.state) {
    show('lobby');
    renderLobby(v);
    return;
  }

  show('game');
  $('topCode').textContent = v.code;
  renderConnection(v);

  const acting = E.actingPlayer(v.state);
  const banner = $('turnBanner');
  if (v.state.ended) {
    banner.textContent = `게임 종료 — 승자 ${v.state.results[0].name}`;
    banner.classList.remove('mine');
  } else if (acting === v.me) {
    banner.textContent = `▶ 내 차례 — ${phaseTitle(v.state)}`;
    banner.classList.add('mine');
  } else {
    banner.textContent = `${v.state.players[acting].name} 님의 차례`;
    banner.classList.remove('mine');
  }

  renderBoard(v);
  renderHand(v);
  renderAction(v);
  renderChains(v);
  renderPlayers(v);
  renderLog(v);
  renderChat(v);
  drainEvents(v);
}

function paintUsage(info) {
  const bar = $('usageBar');
  if (!info || !info.warn) { bar.hidden = true; return; }
  const pct = Math.min(100, Math.round(info.ratio * 100));
  const gb = (n) => (n / 1024 / 1024 / 1024).toFixed(2);
  bar.hidden = false;
  bar.className = 'usage-bar' + (info.block ? ' danger' : '');
  bar.textContent = info.block
    ? `⚠ 이번 달 무료 사용량 ${pct}% (${gb(info.bytes)}/${gb(FREE_MONTHLY_BYTES)} GB) — 한도 초과를 막기 위해 새 방 만들기를 중단했습니다.`
    : `⚠ 이번 달 무료 사용량 ${pct}% (${gb(info.bytes)}/${gb(FREE_MONTHLY_BYTES)} GB) — 한도에 가까워지고 있습니다.`;
}

function renderConnection(v) {
  const bar = $('connBar');
  if (!v.status || v.status === 'ok') { bar.hidden = true; return; }
  bar.hidden = false;
  bar.textContent = v.serverless
    ? '⚠ 서버와의 연결이 끊겼습니다. 다시 연결하는 중…'
    : (v.isHost
      ? '⚠ 브로커 연결이 끊겼습니다. 복구를 시도하는 중…'
      : '⚠ 방장과의 연결이 끊겼습니다. 다시 연결하는 중…  (방장이 돌아오면 자동으로 이어집니다)');
}

// ── 이벤트 연결 ──────────────────────────────────────────────────────────────
$('btnHost').onclick = () => { FX.unlockAudio(); doHost(); };   // 클릭 이벤트가 restore 인자로 넘어가지 않게 감싼다
$('btnJoin').onclick = () => {
  FX.unlockAudio();
  if ($('joinBlock').hidden) { $('joinBlock').hidden = false; $('codeInput').focus(); }
  else doJoin().catch(() => {});
};
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin().catch(() => {}); });
$('nameInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!$('joinBlock').hidden && $('codeInput').value.trim()) doJoin().catch(() => {}); else doHost();
});
$('btnStart').onclick = () => room?.localStart();
$('btnCopy').onclick = copyInvite;
$('btnCopy2').onclick = copyInvite;

document.querySelectorAll('.side-tab').forEach(tab => {
  tab.onclick = () => {
    FX.unlockAudio();
    ui.tab = tab.dataset.tab;
    if (ui.tab === 'chat') ui.unread = 0;   // 채팅 탭을 열면 읽음 처리
    document.querySelectorAll('.side-tab').forEach(t => t.classList.toggle('is-on', t === tab));
    ['info', 'log', 'chat'].forEach(name => { $('tab-' + name).hidden = name !== ui.tab; });
    render();
  };
});

$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('chatInput');
  room?.localChat(input.value);
  input.value = '';
});

$('btnLeave').onclick = () => {
  if (!confirm('방에서 나갑니다. 게임이 진행 중이면 다른 사람이 대신 진행할 수 있습니다. 나갈까요?')) return;
  leaveRoom();
};

function paintMute() {
  $('btnMute').textContent = FX.isMuted() ? '🔇' : '🔊';
  $('btnMute').title = FX.isMuted() ? '소리 켜기' : '소리 끄기';
}
$('btnMute').onclick = () => { FX.setMuted(!FX.isMuted()); paintMute(); if (!FX.isMuted()) FX.chime(); };
paintMute();

$('btnRules').onclick = () => {
  $('rulesDialogBody').innerHTML = document.querySelector('#setup .rules-body').innerHTML;
  $('rulesDialog').showModal();
};

// ── 진입 ─────────────────────────────────────────────────────────────────────
async function init() {
  $('nameInput').value = Net.recallName();
  const params = new URLSearchParams(location.search);

  // fireconfig.js 가 있으면 상시 서버(Firebase) 모드, 없으면 기존 P2P 모드
  const useFire = params.get('net') !== 'p2p' && !!(await loadFirebase().catch(() => null));
  // 내가 다녀간 방 중 24시간 넘게 아무도 접속하지 않은 것을 정리한다
  // (실패해도 게임 진행에는 영향 없음)
  if (useFire) {
    sweepMyRooms().catch(() => {});
    // 무료 한도 감시 — 넘칠 것 같으면 화면에 경고를 띄운다
    watchUsage(paintUsage).catch(() => {});
  }
  $('modeTag').textContent = useFire ? '상시 서버 모드' : 'P2P 모드 (방장이 서버)';
  $('modeTag').hidden = false;

  const localCount = parseInt(params.get('local') || '', 10);
  if (localCount >= MIN_PLAYERS && localCount <= MAX_PLAYERS) {
    // 로컬 모드 — 한 화면에서 전원을 조작 (연습/점검용)
    const r = new LocalRoom({ count: localCount, onChange: render, opts: { privateShares: params.get('private') === '1' } });
    await r.open();
    wireRoom(r);
    r.localStart();
    render();
    return;
  }

  // 진행 중이던 방이 저장돼 있으면 이어서 열 수 있게 한다
  const saved = useFire ? null : loadHostGame();
  if (saved && !params.get('room')) {
    const resume = $('btnResume');
    resume.hidden = false;
    resume.textContent = `진행 중이던 방 이어하기 (${saved.code})`;
    resume.onclick = () => doHost(saved);
    $('btnDiscard').hidden = false;
    $('btnDiscard').onclick = () => {
      if (!confirm('저장된 게임을 버립니다. 진행 중이던 판은 복구할 수 없습니다. 계속할까요?')) return;
      clearHostGame();
      $('btnResume').hidden = true;
      $('btnDiscard').hidden = true;
    };
  }

  // 이전에 있던 방으로 자동 복귀 (링크로 들어온 경우는 그 방이 우선)
  const current = Net.normalizeCode(recallCurrent());
  if (current && !params.get('room') && !saved) {
    setupMsg(`이전에 있던 방(${current})으로 돌아가는 중…`);
    $('codeInput').value = current;
    $('joinBlock').hidden = false;
    const cancel = $('btnCancelAuto');
    cancel.hidden = false;
    let cancelled = false;
    cancel.onclick = () => { cancelled = true; forgetCurrent(); cancel.hidden = true; setupMsg(''); };
    show('setup');
    try {
      await doJoin();
      if (!cancelled && room) { cancel.hidden = true; return; }
    } catch { /* 아래로 떨어져 수동 입력 */ }
    cancel.hidden = true;
    if (cancelled) return;
    forgetCurrent();   // 방이 사라졌으면 기억을 버린다
  }

  const code = Net.normalizeCode(params.get('room') || '');
  if (code) {
    // 초대 링크로 들어온 경우 — 참가 모드로 바로 준비
    $('joinBlock').hidden = false;
    $('codeInput').value = code;
    $('btnJoin').classList.add('btn-primary');
    $('btnHost').classList.remove('btn-primary');
    $('btnJoin').textContent = '이 방에 참가';
    setupMsg(`${code} 방에 초대받았습니다. 이름을 적고 참가하세요.`, true);
    $('nameInput').focus();
  } else {
    $('nameInput').focus();
  }
  show('setup');
}

init();
