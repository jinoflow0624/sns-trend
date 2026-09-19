// 화면 렌더링과 입력 처리.
import * as E from './engine.js';
import * as Net from './net.js';
import { HostRoom, GuestRoom, LocalRoom, MIN_PLAYERS, MAX_PLAYERS } from './room.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const won = n => '$' + Number(n).toLocaleString();

let room = null;
const ui = { selTile: null, buy: {}, dispose: { sell: 0, trade: 0 }, tab: 'info', lastTile: null, prevBoard: null };

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

function wireRoom(r) {
  room = r;
  window.addEventListener('beforeunload', () => r.destroy());
}

async function doHost() {
  const name = myName();
  Net.rememberName(name);
  setupMsg('방을 만드는 중…');
  $('btnHost').disabled = $('btnJoin').disabled = true;
  try {
    const r = new HostRoom({
      code: Net.makeRoomCode(),
      hostName: name,
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
    if (i === 0) li.append(el('span', 'seat-tag', '방장'));
    if (i === v.seat) li.append(el('span', 'you-tag', '나'));
    list.append(li);
  });

  const n = v.lobby.seats.length;
  const start = $('btnStart');
  start.hidden = !v.isHost;
  start.disabled = n < MIN_PLAYERS;
  start.textContent = n < MIN_PLAYERS ? `게임 시작 (${MIN_PLAYERS}명 이상 필요)` : `게임 시작 (${n}명)`;
  $('lobbyWait').hidden = v.isHost;
  $('lobbyMsg').textContent = v.error || (v.isHost ? `링크를 공유하세요 · 최대 ${MAX_PLAYERS}명` : '');
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
  const myPlacePhase = state.phase === 'place' && acting === v.me;

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

  const acting = E.actingPlayer(state);
  const actingName = state.players[acting]?.name ?? '?';
  const mine = acting === v.me;

  if (!mine) {
    pane.append(el('div', 'action-title', `${actingName} 님의 차례`));
    pane.append(el('div', 'waiting', phaseHint(state, false)));
    return;
  }

  const title = el('div', 'action-title', phaseTitle(state));
  const hint = el('div', 'action-hint', phaseHint(state, true));
  pane.append(title, hint);
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

      const item = el('div', 'buy-item');
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
    if (i === v.me) head.append(el('span', 'you-tag', v.local ? '조작 중' : '나'));
    const seat = v.lobby.seats[p.ref];
    if (seat && !seat.connected) head.append(el('span', 'off-tag', '끊김'));
    head.append(el('span', 'money', won(p.money)));
    card.append(head);

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
}

// ── 이벤트 연결 ──────────────────────────────────────────────────────────────
$('btnHost').onclick = doHost;
$('btnJoin').onclick = () => {
  if ($('joinBlock').hidden) { $('joinBlock').hidden = false; $('codeInput').focus(); }
  else doJoin();
};
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
$('nameInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!$('joinBlock').hidden && $('codeInput').value.trim()) doJoin(); else doHost();
});
$('btnStart').onclick = () => room?.localStart();
$('btnCopy').onclick = copyInvite;
$('btnCopy2').onclick = copyInvite;

document.querySelectorAll('.side-tab').forEach(tab => {
  tab.onclick = () => {
    ui.tab = tab.dataset.tab;
    document.querySelectorAll('.side-tab').forEach(t => t.classList.toggle('is-on', t === tab));
    ['info', 'log', 'chat'].forEach(name => { $('tab-' + name).hidden = name !== ui.tab; });
  };
});

$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('chatInput');
  room?.localChat(input.value);
  input.value = '';
});

$('btnRules').onclick = () => {
  $('rulesDialogBody').innerHTML = document.querySelector('#setup .rules-body').innerHTML;
  $('rulesDialog').showModal();
};

// ── 진입 ─────────────────────────────────────────────────────────────────────
(function init() {
  $('nameInput').value = Net.recallName();
  const params = new URLSearchParams(location.search);

  const localCount = parseInt(params.get('local') || '', 10);
  if (localCount >= MIN_PLAYERS && localCount <= MAX_PLAYERS) {
    // 로컬 모드 — 한 화면에서 전원을 조작 (연습/점검용)
    const r = new LocalRoom({ count: localCount, onChange: render });
    r.open().then(() => { wireRoom(r); r.localStart(); render(); });
    return;
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
})();
