// 아콰이어(Acquire) 클래식 룰 엔진.
// DOM/네트워크 의존이 없는 순수 로직 — 호스트 브라우저와 Node 테스트에서 동일하게 동작한다.

export const COLS = 12;
export const ROWS = 9;
export const TILE_COUNT = COLS * ROWS; // 108
export const SAFE_SIZE = 11;           // 11칸 이상 = 안전 체인 (합병으로 소멸 불가)
export const END_SIZE = 41;            // 41칸 이상 = 종료 선언 가능
export const SHARES_PER_CHAIN = 25;
export const START_MONEY = 6000;
export const HAND_SIZE = 6;
export const MAX_BUY = 3;

// 1962년 인쇄물 톤. 색은 선명하게 두되(게임의 핵심 신호라서),
// 밝은 앰버·주황은 간판처럼 검은 글자를 써서 대비를 확보한다(ink: true).
// 모든 조합이 흰/검은 글자 기준 4.7:1 이상.
export const CHAINS = [
  { id: 'tower',       name: 'Tower',       ko: '타워',       color: '#E3AF1B', ink: true,  tier: 0 },
  { id: 'luxor',       name: 'Luxor',       ko: '룩소르',     color: '#C0392B', ink: false, tier: 0 },
  { id: 'american',    name: 'American',    ko: '아메리칸',   color: '#2C64A8', ink: false, tier: 1 },
  { id: 'worldwide',   name: 'Worldwide',   ko: '월드와이드', color: '#7A4A9E', ink: false, tier: 1 },
  { id: 'festival',    name: 'Festival',    ko: '페스티벌',   color: '#2E7D4F', ink: false, tier: 1 },
  { id: 'imperial',    name: 'Imperial',    ko: '임페리얼',   color: '#DA6A16', ink: true,  tier: 2 },
  { id: 'continental', name: 'Continental', ko: '컨티넨탈',   color: '#14807A', ink: false, tier: 2 },
];
export const CHAIN_INK = '#241F1A';   // 밝은 체인 위에 얹는 글자색
export const CHAIN_IDS = CHAINS.map(c => c.id);
const CHAIN_BY_ID = Object.fromEntries(CHAINS.map(c => [c.id, c]));
export const chainInfo = id => CHAIN_BY_ID[id];

// ── 보드 좌표 ────────────────────────────────────────────────────────────────
// index 0 = "1A", index 11 = "12A", index 12 = "1B" ... index 107 = "12I"
export const tileName = i => `${(i % COLS) + 1}${String.fromCharCode(65 + Math.floor(i / COLS))}`;

export function neighbors(i) {
  const r = Math.floor(i / COLS), c = i % COLS, out = [];
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

// ── 주가 / 배당 ──────────────────────────────────────────────────────────────
export function basePrice(size) {
  if (size < 2) return 0;
  if (size <= 5) return size * 100;
  if (size <= 10) return 600;
  if (size <= 20) return 700;
  if (size <= 30) return 800;
  if (size <= 40) return 900;
  return 1000;
}

export function stockPrice(chainId, size) {
  const b = basePrice(size);
  return b === 0 ? 0 : b + CHAIN_BY_ID[chainId].tier * 100;
}

const roundUp100 = n => Math.ceil(n / 100) * 100;

export const ROLE_LABEL = {
  majority: '대주주',
  minority: '차대주주',
  sole: '단독 주주 (대+차 모두)',
  'tied-majority': '대주주 동률',
  'tied-minority': '차대주주 동률',
};

// 대주주/소주주 배당 계산. holders = [{ player, count }] (count > 0 만)
// 반환: [{ player, amount, role }]
export function calcBonuses(holders, price) {
  const list = holders.filter(h => h.count > 0).sort((a, b) => b.count - a.count);
  if (list.length === 0) return [];
  const majority = price * 10, minority = price * 5;

  const topCount = list[0].count;
  const top = list.filter(h => h.count === topCount);

  // 대주주 동률 → 대+소 배당을 합쳐 균등 분배($100 단위 올림), 소주주 배당은 따로 없음
  if (top.length > 1) {
    const each = roundUp100((majority + minority) / top.length);
    return top.map(h => ({ player: h.player, amount: each, role: 'tied-majority' }));
  }

  const out = [{ player: top[0].player, amount: majority, role: 'majority' }];
  const rest = list.filter(h => h.count !== topCount);

  // 주주가 단 한 명 → 대주주 + 소주주 배당을 모두 받음
  if (rest.length === 0) {
    out[0].amount += minority;
    out[0].role = 'sole';
    return out;
  }

  const secondCount = rest[0].count;
  const second = rest.filter(h => h.count === secondCount);
  if (second.length > 1) {
    const each = roundUp100(minority / second.length);
    second.forEach(h => out.push({ player: h.player, amount: each, role: 'tied-minority' }));
  } else {
    out.push({ player: second[0].player, amount: minority, role: 'minority' });
  }
  return out;
}

// ── 난수 (호스트 전용, 시드 고정 가능) ────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── 상태 조회 헬퍼 ───────────────────────────────────────────────────────────
export function chainSizes(state) {
  const sizes = Object.fromEntries(CHAIN_IDS.map(id => [id, 0]));
  for (const v of state.board) if (v && v !== 'orphan') sizes[v]++;
  return sizes;
}

export const activeChains = state => {
  const s = chainSizes(state);
  return CHAIN_IDS.filter(id => s[id] > 0);
};

export const availableChains = state => {
  const s = chainSizes(state);
  return CHAIN_IDS.filter(id => s[id] === 0);
};

// 타일을 놓을 수 있는지: 'ok' | 'dead'(영구 불가) | 'blocked'(지금은 불가)
export function tileStatus(state, tile) {
  if (state.board[tile] !== null) return 'dead';
  const sizes = chainSizes(state);
  const adjChains = new Set();
  let orphan = false;
  for (const n of neighbors(tile)) {
    const v = state.board[n];
    if (v === 'orphan') orphan = true;
    else if (v) adjChains.add(v);
  }
  if (adjChains.size >= 2) {
    const safe = [...adjChains].filter(id => sizes[id] >= SAFE_SIZE);
    // 안전 체인 2개 이상을 잇는 타일은 영구히 놓을 수 없다
    if (safe.length >= 2) return 'dead';
    return 'ok';
  }
  if (adjChains.size === 0 && orphan) {
    // 7개 체인이 모두 보드에 있으면 새 체인을 창립할 수 없다 (나중에 소멸하면 가능해짐)
    if (availableChains(state).length === 0) return 'blocked';
  }
  return 'ok';
}

export const playableTiles = (state, hand) => hand.filter(t => tileStatus(state, t) === 'ok');

export function canDeclareEnd(state) {
  const sizes = chainSizes(state);
  const active = CHAIN_IDS.filter(id => sizes[id] > 0);
  if (active.length === 0) return false;
  if (active.some(id => sizes[id] >= END_SIZE)) return true;
  return active.every(id => sizes[id] >= SAFE_SIZE);
}

// ── 게임 생성 ────────────────────────────────────────────────────────────────
// entries: ['이름', ...] 또는 [{ name, ref }, ...]
// ref는 호출자(로비 좌석)를 가리키는 값으로, 플레이어가 선공 순서대로 재정렬된 뒤에도 유지된다.
export function createGame(entries, seed = Date.now(), opts = {}) {
  const rand = mulberry32(seed);
  const bag = shuffle([...Array(TILE_COUNT).keys()], rand);

  // 각자 타일 1개를 뽑아 보드에 놓고, 1A에 가까운 순서대로 선을 정한다
  const seats = entries.map((e, i) => ({
    name: typeof e === 'string' ? e : e.name,
    ref: typeof e === 'string' ? i : (e.ref ?? i),
    start: bag.pop(),
  }));
  seats.sort((a, b) => a.start - b.start);

  const board = new Array(TILE_COUNT).fill(null);
  for (const s of seats) board[s.start] = 'orphan';

  const state = {
    board,
    bag,
    seed,
    players: seats.map(s => ({
      name: s.name,
      ref: s.ref,
      money: START_MONEY,
      shares: Object.fromEntries(CHAIN_IDS.map(id => [id, 0])),
      hand: [],
      startTile: s.start,
    })),
    pool: Object.fromEntries(CHAIN_IDS.map(id => [id, SHARES_PER_CHAIN])),
    turn: 0,
    phase: 'place',
    pendingFound: null,
    merger: null,
    buy: null,
    log: [],
    events: [],
    safeSeen: [],
    undo: null,
    privateShares: !!opts.privateShares,
    ended: false,
    results: null,
  };

  for (const p of state.players) refill(state, p);
  log(state, `게임 시작 — 선공: ${state.players[0].name} (${tileName(state.players[0].startTile)})`);
  return state;
}

export const LOG_LIMIT = 60;   // DB로 오가는 상태 크기의 대부분이 로그라 짧게 유지한다
const EVENT_LIMIT = 8;

function log(state, msg) {
  state.log.push({ n: (state.logSeq = (state.logSeq || 0) + 1), msg });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

// 화면에 팝업으로 띄울 사건. 클라이언트는 아직 못 본 n 만 골라 보여준다.
function emit(state, ev) {
  state.events = state.events || [];
  state.events.push({ ...ev, n: (state.eventSeq = (state.eventSeq || 0) + 1) });
  if (state.events.length > EVENT_LIMIT) state.events.splice(0, state.events.length - EVENT_LIMIT);
}

// 11칸을 처음 넘긴 체인을 알린다
function checkSafe(state) {
  const sizes = chainSizes(state);
  state.safeSeen = state.safeSeen || [];
  for (const id of CHAIN_IDS) {
    if (sizes[id] >= SAFE_SIZE && !state.safeSeen.includes(id)) {
      state.safeSeen.push(id);
      emit(state, { type: 'safe', chain: id, size: sizes[id], price: stockPrice(id, sizes[id]) });
      log(state, `🛡 ${chainInfo(id).ko}이(가) 안전 체인이 되었습니다 (${sizes[id]}칸)`);
    }
  }
}

function refill(state, player) {
  while (player.hand.length < HAND_SIZE && state.bag.length > 0) player.hand.push(state.bag.pop());
  player.hand.sort((a, b) => a - b);
}

// 손패에서 영구히 놓을 수 없는(dead) 타일을 자동 교체한다.
// 클래식 룰상 선택 사항이지만, dead 타일은 어떤 상황에서도 쓸모가 없어 항상 교체가 이득이다.
function replaceDeadTiles(state, player) {
  const dead = player.hand.filter(t => tileStatus(state, t) === 'dead');
  if (dead.length === 0) return;
  player.hand = player.hand.filter(t => !dead.includes(t));
  refill(state, player);
  log(state, `${player.name}: 사용 불가 타일 ${dead.map(tileName).join(', ')} 교체`);
}

// 놓인 타일에서 연결된 독립 타일 덩어리를 전부 체인에 편입시킨다
function absorbGroup(state, tile, chainId) {
  const queue = [tile];
  state.board[tile] = chainId;
  while (queue.length) {
    const cur = queue.pop();
    for (const n of neighbors(cur)) {
      if (state.board[n] === 'orphan') {
        state.board[n] = chainId;
        queue.push(n);
      }
    }
  }
}

// ── 되돌리기 ─────────────────────────────────────────────────────────────────
//
// 타일을 놓기 직전 상태를 저장해 두고, 같은 턴 안에서 되돌릴 수 있게 한다.
// 상태 전체를 복사하면 DB로 오가는 양이 크게 늘어나므로, 타일 배치가 바꿀 수 있는
// 부분만 담는다. 로그·이벤트는 번호(logSeq/eventSeq)만 기억했다가 잘라내는 식으로 되돌린다.
// 주머니(bag)는 턴이 끝날 때만 바뀌므로 담지 않는다.
function takeUndoSnapshot(state, playerIdx) {
  state.undo = {
    by: playerIdx,
    board: state.board.slice(),
    players: state.players.map(p => ({ money: p.money, shares: { ...p.shares }, hand: p.hand.slice() })),
    pool: { ...state.pool },
    phase: state.phase,
    turn: state.turn,
    merger: state.merger ? JSON.parse(JSON.stringify(state.merger)) : null,
    pendingFound: state.pendingFound ? { ...state.pendingFound } : null,
    buy: state.buy ? { ...state.buy } : null,
    safeSeen: (state.safeSeen || []).slice(),
    logSeq: state.logSeq || 0,
    eventSeq: state.eventSeq || 0,
  };
}

// 누가 지금 되돌릴 수 있는지 (UI가 버튼을 보여줄지 판단하는 데도 쓴다)
export function canUndo(state, playerIdx) {
  return !state.ended && !!state.undo && state.undo.by === playerIdx;
}

function actUndo(state, playerIdx) {
  if (!state.undo) return fail('되돌릴 수 있는 수가 없습니다.');
  if (state.undo.by !== playerIdx) return fail('타일을 놓은 사람만 되돌릴 수 있습니다.');

  const u = state.undo;
  const name = state.players[playerIdx].name;
  state.board = u.board.slice();
  state.players.forEach((p, i) => {
    p.money = u.players[i].money;
    p.shares = { ...u.players[i].shares };
    p.hand = u.players[i].hand.slice();
  });
  state.pool = { ...u.pool };
  state.phase = u.phase;
  state.turn = u.turn;
  state.merger = u.merger;
  state.pendingFound = u.pendingFound;
  state.buy = u.buy;
  state.safeSeen = u.safeSeen.slice();
  // 되돌린 수가 남긴 기록과 팝업을 지운다
  state.log = state.log.filter(e => e.n <= u.logSeq);
  state.logSeq = u.logSeq;
  state.events = (state.events || []).filter(e => e.n <= u.eventSeq);
  state.eventSeq = u.eventSeq;
  state.undo = null;

  log(state, `↩ ${name}이(가) 마지막 수를 되돌렸습니다.`);
  return ok();
}

// ── 액션 처리 ────────────────────────────────────────────────────────────────
// 반환: { ok: true } 또는 { ok: false, error: '...' }
export function applyAction(state, playerIdx, action) {
  if (state.ended) return fail('게임이 이미 끝났습니다.');
  const handlers = {
    place: actPlace,
    found: actFound,
    survivor: actSurvivor,
    defunctOrder: actDefunctOrder,
    dispose: actDispose,
    buy: actBuy,
    pass: actPass,
    undo: actUndo,
  };
  const fn = handlers[action.type];
  if (!fn) return fail('알 수 없는 동작입니다.');
  return fn(state, playerIdx, action);
}

const fail = error => ({ ok: false, error });
const ok = () => ({ ok: true });

function actPlace(state, playerIdx, action) {
  if (state.phase !== 'place') return fail('지금은 타일을 놓을 차례가 아닙니다.');
  if (playerIdx !== state.turn) return fail('당신의 차례가 아닙니다.');
  const player = state.players[playerIdx];
  const tile = action.tile;
  if (!player.hand.includes(tile)) return fail('손에 없는 타일입니다.');
  const status = tileStatus(state, tile);
  if (status === 'dead') return fail('영구히 놓을 수 없는 타일입니다.');
  if (status === 'blocked') return fail('7개 체인이 모두 보드에 있어 새 체인을 만들 수 없습니다.');

  takeUndoSnapshot(state, playerIdx);   // 되돌리기용 — 손패를 건드리기 전에 찍는다
  player.hand = player.hand.filter(t => t !== tile);

  const sizes = chainSizes(state);
  const adjChains = [];
  let hasOrphan = false;
  for (const n of neighbors(tile)) {
    const v = state.board[n];
    if (v === 'orphan') hasOrphan = true;
    else if (v && !adjChains.includes(v)) adjChains.push(v);
  }

  log(state, `${player.name}: ${tileName(tile)} 배치`);

  if (adjChains.length >= 2) {
    state.board[tile] = 'orphan'; // 합병이 끝나면 생존 체인으로 편입된다
    return startMerger(state, tile, adjChains, sizes);
  }
  if (adjChains.length === 1) {
    const id = adjChains[0];
    absorbGroup(state, tile, id);
    const size = chainSizes(state)[id];
    log(state, `→ ${chainInfo(id).ko} 확장 (${size}칸, 주가 $${stockPrice(id, size)})`);
    return toBuyPhase(state);
  }
  if (hasOrphan) {
    state.board[tile] = 'orphan';
    state.pendingFound = { tile };
    state.phase = 'found';
    return ok();
  }
  state.board[tile] = 'orphan';
  return toBuyPhase(state);
}

function actFound(state, playerIdx, action) {
  if (state.phase !== 'found') return fail('지금은 체인을 창립할 차례가 아닙니다.');
  if (playerIdx !== state.turn) return fail('당신의 차례가 아닙니다.');
  const id = action.chain;
  if (!availableChains(state).includes(id)) return fail('이미 보드에 있는 체인입니다.');

  const player = state.players[playerIdx];
  absorbGroup(state, state.pendingFound.tile, id);
  state.pendingFound = null;

  const size = chainSizes(state)[id];
  let bonus = '';
  if (state.pool[id] > 0) { // 창립 보너스 — 무료 주식 1장
    state.pool[id]--;
    player.shares[id]++;
    bonus = ', 창립 보너스 주식 1장';
  }
  log(state, `→ ${player.name}이(가) ${chainInfo(id).ko} 창립 (${size}칸${bonus})`);
  return toBuyPhase(state);
}

// ── 합병 ─────────────────────────────────────────────────────────────────────
function startMerger(state, tile, chains, sizes) {
  const snapshot = Object.fromEntries(chains.map(id => [id, sizes[id]]));
  state.merger = {
    tile,
    chains,
    sizes: snapshot,
    prices: Object.fromEntries(chains.map(id => [id, stockPrice(id, sizes[id])])),
    maker: state.turn,
    survivor: null,
    pending: null,
    current: null,
    queue: [],
    queueIdx: 0,
  };
  log(state, `→ 합병 발생: ${chains.map(id => `${chainInfo(id).ko}(${sizes[id]})`).join(' + ')}`);

  const max = Math.max(...chains.map(id => snapshot[id]));
  const biggest = chains.filter(id => snapshot[id] === max);
  if (biggest.length > 1) {
    state.phase = 'survivor'; // 크기 동률 → 타일을 놓은 사람이 생존 체인을 고른다
    return ok();
  }
  return setSurvivor(state, biggest[0]);
}

function actSurvivor(state, playerIdx, action) {
  if (state.phase !== 'survivor') return fail('지금은 생존 체인을 고를 차례가 아닙니다.');
  if (playerIdx !== state.merger.maker) return fail('합병을 일으킨 플레이어만 선택할 수 있습니다.');
  const m = state.merger;
  const max = Math.max(...m.chains.map(id => m.sizes[id]));
  if (!(m.chains.includes(action.chain) && m.sizes[action.chain] === max)) return fail('생존할 수 없는 체인입니다.');
  return setSurvivor(state, action.chain);
}

function setSurvivor(state, survivor) {
  const m = state.merger;
  m.survivor = survivor;
  m.pending = m.chains.filter(id => id !== survivor);
  log(state, `→ ${chainInfo(survivor).ko} 생존, ${m.pending.map(id => chainInfo(id).ko).join(', ')} 소멸`);
  return advanceMerger(state);
}

function advanceMerger(state) {
  const m = state.merger;
  if (m.current) return ok();
  if (m.pending.length === 0) return finishMerger(state);

  const max = Math.max(...m.pending.map(id => m.sizes[id]));
  const biggest = m.pending.filter(id => m.sizes[id] === max);
  if (biggest.length > 1) {
    state.phase = 'defunctOrder'; // 소멸 체인 크기 동률 → 처리 순서를 고른다
    return ok();
  }
  return beginDefunct(state, biggest[0]);
}

function actDefunctOrder(state, playerIdx, action) {
  if (state.phase !== 'defunctOrder') return fail('지금은 처리 순서를 고를 차례가 아닙니다.');
  if (playerIdx !== state.merger.maker) return fail('합병을 일으킨 플레이어만 선택할 수 있습니다.');
  const m = state.merger;
  const max = Math.max(...m.pending.map(id => m.sizes[id]));
  if (!(m.pending.includes(action.chain) && m.sizes[action.chain] === max)) return fail('먼저 처리할 수 없는 체인입니다.');
  return beginDefunct(state, action.chain);
}

function beginDefunct(state, id) {
  const m = state.merger;
  m.current = id;
  m.pending = m.pending.filter(c => c !== id);

  const price = m.prices[id];
  const holders = state.players.map((p, i) => ({ player: i, count: p.shares[id] }));
  const payouts = calcBonuses(holders, price);
  const shown = [];
  for (const b of payouts) {
    state.players[b.player].money += b.amount;
    const label = ROLE_LABEL[b.role];
    log(state, `   💰 ${chainInfo(id).ko} ${label} ${state.players[b.player].name}: +$${b.amount.toLocaleString()}`);
    shown.push({ name: state.players[b.player].name, amount: b.amount, role: b.role, label });
  }
  if (payouts.length === 0) log(state, `   ${chainInfo(id).ko} 주주 없음 — 배당 없음`);
  emit(state, { type: 'payout', chain: id, size: m.sizes[id], price, entries: shown });

  // 주식 처분 순서: 합병을 일으킨 플레이어부터 시계방향, 해당 주식 보유자만
  const n = state.players.length;
  m.queue = [];
  for (let k = 0; k < n; k++) {
    const idx = (m.maker + k) % n;
    if (state.players[idx].shares[id] > 0) m.queue.push(idx);
  }
  m.queueIdx = 0;
  if (m.queue.length === 0) return completeDefunct(state);
  state.phase = 'dispose';
  return ok();
}

function actDispose(state, playerIdx, action) {
  if (state.phase !== 'dispose') return fail('지금은 주식을 처분할 차례가 아닙니다.');
  const m = state.merger;
  if (m.queue[m.queueIdx] !== playerIdx) return fail('당신의 처분 차례가 아닙니다.');

  const defunct = m.current, survivor = m.survivor;
  const player = state.players[playerIdx];
  const held = player.shares[defunct];
  const sell = Math.max(0, Math.floor(action.sell || 0));
  const trade = Math.max(0, Math.floor(action.trade || 0));

  if (sell + trade > held) return fail('보유량보다 많이 처분할 수 없습니다.');
  if (trade % 2 !== 0) return fail('교환은 2장 단위로만 가능합니다.');
  if (trade / 2 > state.pool[survivor]) return fail(`${chainInfo(survivor).ko} 주식 재고가 부족합니다.`);

  const price = m.prices[defunct];
  if (sell > 0) {
    player.shares[defunct] -= sell;
    state.pool[defunct] += sell;
    player.money += sell * price;
  }
  if (trade > 0) {
    player.shares[defunct] -= trade;
    state.pool[defunct] += trade;
    state.pool[survivor] -= trade / 2;
    player.shares[survivor] += trade / 2;
  }
  const hold = held - sell - trade;
  if (state.privateShares) {
    log(state, `   ${player.name}: ${chainInfo(defunct).ko} 주식 처분 완료`);
  } else {
    const parts = [];
    if (sell) parts.push(`매각 ${sell}장(+$${(sell * price).toLocaleString()})`);
    if (trade) parts.push(`교환 ${trade}→${trade / 2}장`);
    if (hold) parts.push(`보유 ${hold}장`);
    log(state, `   ${player.name}: ${chainInfo(defunct).ko} ${parts.join(', ') || '변동 없음'}`);
  }

  // 다른 사람이 결정을 내린 뒤에는 되돌릴 수 없다
  if (state.undo && state.undo.by !== playerIdx) state.undo = null;

  m.queueIdx++;
  if (m.queueIdx >= m.queue.length) return completeDefunct(state);
  return ok();
}

function completeDefunct(state) {
  const m = state.merger;
  const defunct = m.current;
  for (let i = 0; i < state.board.length; i++) if (state.board[i] === defunct) state.board[i] = m.survivor;
  m.current = null;
  m.queue = [];
  m.queueIdx = 0;
  return advanceMerger(state);
}

function finishMerger(state) {
  const m = state.merger;
  absorbGroup(state, m.tile, m.survivor); // 놓인 타일과 붙어 있던 독립 타일도 생존 체인으로
  const size = chainSizes(state)[m.survivor];
  log(state, `→ 합병 완료: ${chainInfo(m.survivor).ko} ${size}칸 (주가 $${stockPrice(m.survivor, size)})`);
  state.merger = null;
  return toBuyPhase(state);
}

// ── 주식 구매 / 턴 종료 ──────────────────────────────────────────────────────
function toBuyPhase(state) {
  checkSafe(state);
  state.phase = 'buy';
  state.buy = { canEnd: canDeclareEnd(state) };
  return ok();
}

function actBuy(state, playerIdx, action) {
  if (state.phase !== 'buy') return fail('지금은 주식을 살 차례가 아닙니다.');
  if (playerIdx !== state.turn) return fail('당신의 차례가 아닙니다.');
  const player = state.players[playerIdx];
  const picks = action.picks || {};
  const sizes = chainSizes(state);

  let count = 0, cost = 0;
  for (const [id, raw] of Object.entries(picks)) {
    const n = Math.max(0, Math.floor(raw || 0));
    if (n === 0) continue;
    if (!CHAIN_IDS.includes(id)) return fail('알 수 없는 체인입니다.');
    if (sizes[id] === 0) return fail(`${chainInfo(id).ko}은(는) 보드에 없습니다.`);
    if (n > state.pool[id]) return fail(`${chainInfo(id).ko} 주식 재고가 부족합니다.`);
    count += n;
    cost += n * stockPrice(id, sizes[id]);
  }
  if (count > MAX_BUY) return fail(`한 턴에 최대 ${MAX_BUY}장까지만 살 수 있습니다.`);
  if (cost > player.money) return fail('현금이 부족합니다.');

  const bought = [];
  for (const [id, raw] of Object.entries(picks)) {
    const n = Math.max(0, Math.floor(raw || 0));
    if (n === 0) continue;
    state.pool[id] -= n;
    player.shares[id] += n;
    bought.push(`${chainInfo(id).ko} ${n}장`);
  }
  if (cost > 0) {
    player.money -= cost;
    // 비공개 모드에서는 어떤 체인을 몇 장 샀는지 가린다 (보유 현황이 드러나므로)
    log(state, state.privateShares
      ? `${player.name}: 주식 ${count}장 구매 (-$${cost.toLocaleString()})`
      : `${player.name}: ${bought.join(', ')} 구매 (-$${cost.toLocaleString()})`);
  }

  if (action.declareEnd) {
    if (!canDeclareEnd(state)) return fail('아직 종료 조건을 만족하지 않습니다.');
    return endGame(state, playerIdx);
  }
  return endTurn(state);
}

function actPass(state, playerIdx) {
  if (state.phase !== 'place') return fail('지금은 넘길 수 없습니다.');
  if (playerIdx !== state.turn) return fail('당신의 차례가 아닙니다.');
  const player = state.players[playerIdx];
  replaceDeadTiles(state, player);
  if (playableTiles(state, player.hand).length > 0) return fail('놓을 수 있는 타일이 있습니다.');
  log(state, `${player.name}: 놓을 수 있는 타일이 없어 턴을 넘김`);
  return endTurn(state);
}

function endTurn(state) {
  state.undo = null;   // 턴을 넘기면 되돌릴 수 없다
  const player = state.players[state.turn];
  refill(state, player);
  state.buy = null;
  state.turn = (state.turn + 1) % state.players.length;
  const next = state.players[state.turn];
  replaceDeadTiles(state, next);
  refill(state, next);
  state.phase = 'place';
  return ok();
}

function endGame(state, declarerIdx) {
  state.undo = null;
  log(state, `🏁 ${state.players[declarerIdx].name}이(가) 게임 종료를 선언했습니다.`);
  const sizes = chainSizes(state);
  const active = CHAIN_IDS.filter(id => sizes[id] > 0);

  // 정산 전 현금과 보유 주식을 기록해 두고, 항목별로 얼마가 붙었는지 남긴다
  const tally = state.players.map(p => ({
    cash: p.money,
    bonus: 0,
    sale: 0,
    shares: Object.fromEntries(CHAIN_IDS.filter(id => p.shares[id] > 0).map(id => [id, p.shares[id]])),
    bonusDetail: [],
  }));

  for (const id of active) {
    const price = stockPrice(id, sizes[id]);
    const holders = state.players.map((p, i) => ({ player: i, count: p.shares[id] }));
    for (const b of calcBonuses(holders, price)) {
      state.players[b.player].money += b.amount;
      tally[b.player].bonus += b.amount;
      tally[b.player].bonusDetail.push({ chain: id, amount: b.amount, role: b.role, label: ROLE_LABEL[b.role] });
      log(state, `   💰 ${chainInfo(id).ko} 최종 배당 ${state.players[b.player].name}: +$${b.amount.toLocaleString()}`);
    }
  }
  state.players.forEach((p, i) => {
    let sale = 0;
    for (const id of active) sale += p.shares[id] * stockPrice(id, sizes[id]);
    if (sale > 0) {
      p.money += sale;
      tally[i].sale = sale;
      log(state, `   ${p.name}: 보유 주식 전량 현금화 +$${sale.toLocaleString()}`);
    }
  });

  state.results = state.players
    .map((p, i) => ({
      player: i,
      name: p.name,
      money: p.money,
      cash: tally[i].cash,
      bonus: tally[i].bonus,
      sale: tally[i].sale,
      shares: tally[i].shares,
      bonusDetail: tally[i].bonusDetail,
    }))
    .sort((a, b) => b.money - a.money);
  state.ended = true;
  state.phase = 'over';
  log(state, `🏆 승자: ${state.results[0].name} ($${state.results[0].money.toLocaleString()})`);
  return ok();
}

// ── 누가 지금 입력해야 하는가 ─────────────────────────────────────────────────
export function actingPlayer(state) {
  if (state.ended) return null;
  if (state.phase === 'dispose') return state.merger.queue[state.merger.queueIdx];
  if (state.phase === 'survivor' || state.phase === 'defunctOrder') return state.merger.maker;
  return state.turn;
}

// 클라이언트에 보낼 때 남의 손패를 가린다
export function sanitize(state, forPlayer) {
  return {
    ...state,
    bag: null,
    bagCount: state.bag.length,
    // 스냅샷에는 모두의 손패가 들어 있다 — 내보내지 않고 되돌리기 가능 여부만 알린다
    undo: null,
    canUndo: canUndo(state, forPlayer),
    players: state.players.map((p, i) => ({
      ...p,
      hand: i === forPlayer ? p.hand : null,
      handCount: p.hand.length,
      // 비공개 모드에서는 남의 보유 주식을 아예 빼고 개수만 남긴다
      shares: (state.privateShares && i !== forPlayer && !state.ended) ? null : p.shares,
      shareCount: CHAIN_IDS.reduce((t, id) => t + p.shares[id], 0),
    })),
  };
}
