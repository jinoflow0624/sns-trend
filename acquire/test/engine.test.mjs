// 아콰이어 룰 엔진 테스트 — node test/engine.test.mjs
import assert from 'node:assert/strict';
import * as E from '../engine.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

// 테스트용으로 보드를 직접 조립한다
function blank(names = ['A', 'B', 'C']) {
  const s = E.createGame(names, 1);
  s.board = new Array(E.TILE_COUNT).fill(null);
  s.bag = [...Array(E.TILE_COUNT).keys()].reverse();
  s.players.forEach(p => { p.hand = []; p.money = E.START_MONEY; E.CHAIN_IDS.forEach(id => p.shares[id] = 0); });
  s.pool = Object.fromEntries(E.CHAIN_IDS.map(id => [id, E.SHARES_PER_CHAIN]));
  s.turn = 0; s.phase = 'place'; s.merger = null; s.pendingFound = null; s.ended = false;
  return s;
}
const T = name => {
  const col = parseInt(name, 10) - 1;
  const row = name.replace(/^\d+/, '').charCodeAt(0) - 65;
  return row * E.COLS + col;
};
const give = (s, p, tile) => { s.players[p].hand.push(tile); s.players[p].hand.sort((a, b) => a - b); };
const must = r => { assert.equal(r.ok, true, r.error); return r; };

console.log('\n좌표 / 인접');
test('tileName 매핑', () => {
  assert.equal(E.tileName(0), '1A');
  assert.equal(E.tileName(11), '12A');
  assert.equal(E.tileName(12), '1B');
  assert.equal(E.tileName(107), '12I');
  assert.equal(T('1A'), 0); assert.equal(T('12I'), 107);
});
test('모서리 인접은 2칸, 중앙은 4칸', () => {
  assert.equal(E.neighbors(T('1A')).length, 2);
  assert.equal(E.neighbors(T('6E')).length, 4);
});

console.log('\n주가표');
test('저가 등급 (Tower)', () => {
  assert.equal(E.stockPrice('tower', 2), 200);
  assert.equal(E.stockPrice('tower', 5), 500);
  assert.equal(E.stockPrice('tower', 6), 600);
  assert.equal(E.stockPrice('tower', 10), 600);
  assert.equal(E.stockPrice('tower', 11), 700);
  assert.equal(E.stockPrice('tower', 20), 700);
  assert.equal(E.stockPrice('tower', 21), 800);
  assert.equal(E.stockPrice('tower', 31), 900);
  assert.equal(E.stockPrice('tower', 41), 1000);
});
test('중가 +100 / 고가 +200', () => {
  assert.equal(E.stockPrice('american', 2), 300);
  assert.equal(E.stockPrice('continental', 2), 400);
  assert.equal(E.stockPrice('continental', 6), 800);
});

console.log('\n배당 계산');
test('단독 대주주 + 단독 소주주', () => {
  const b = E.calcBonuses([{ player: 0, count: 5 }, { player: 1, count: 3 }], 600);
  assert.deepEqual(b.map(x => [x.player, x.amount]), [[0, 6000], [1, 3000]]);
});
test('주주가 한 명이면 대+소 모두 수령', () => {
  const b = E.calcBonuses([{ player: 0, count: 4 }], 500);
  assert.deepEqual(b.map(x => [x.player, x.amount]), [[0, 7500]]);
});
test('대주주 동률 → 대+소 합산 균등, $100 올림', () => {
  // 대 3000 + 소 1500 = 4500 / 2 = 2250 → 2300
  const b = E.calcBonuses([{ player: 0, count: 3 }, { player: 1, count: 3 }], 300);
  assert.deepEqual(b.map(x => x.amount), [2300, 2300]);
  assert.equal(b[0].role, 'tied-majority');
});
test('소주주 동률 → 소주주 배당만 균등 분할', () => {
  const b = E.calcBonuses([{ player: 0, count: 7 }, { player: 1, count: 2 }, { player: 2, count: 2 }], 600);
  assert.deepEqual(b.map(x => [x.player, x.amount]), [[0, 6000], [1, 1500], [2, 1500]]);
});
test('0장 보유자는 제외', () => {
  const b = E.calcBonuses([{ player: 0, count: 2 }, { player: 1, count: 0 }], 200);
  assert.equal(b.length, 1);
  assert.equal(b[0].amount, 3000); // 단독 주주
});

console.log('\n타일 배치');
test('빈 자리에 놓으면 독립 타일', () => {
  const s = blank(); give(s, 0, T('5E'));
  must(E.applyAction(s, 0, { type: 'place', tile: T('5E') }));
  assert.equal(s.board[T('5E')], 'orphan');
  assert.equal(s.phase, 'buy');
});
test('독립 타일에 붙이면 창립 단계로, 창립 보너스 1장', () => {
  const s = blank(); s.board[T('5E')] = 'orphan'; give(s, 0, T('6E'));
  must(E.applyAction(s, 0, { type: 'place', tile: T('6E') }));
  assert.equal(s.phase, 'found');
  must(E.applyAction(s, 0, { type: 'found', chain: 'luxor' }));
  assert.equal(s.board[T('5E')], 'luxor');
  assert.equal(s.board[T('6E')], 'luxor');
  assert.equal(s.players[0].shares.luxor, 1);
  assert.equal(s.pool.luxor, 24);
  assert.equal(s.phase, 'buy');
});
test('창립 시 연결된 독립 타일 덩어리를 모두 흡수', () => {
  const s = blank();
  ['5E', '5F', '5G'].forEach(n => s.board[T(n)] = 'orphan');
  give(s, 0, T('6E'));
  must(E.applyAction(s, 0, { type: 'place', tile: T('6E') }));
  must(E.applyAction(s, 0, { type: 'found', chain: 'tower' }));
  assert.equal(E.chainSizes(s).tower, 4);
});
test('기존 체인에 붙이면 확장', () => {
  const s = blank();
  ['5E', '6E'].forEach(n => s.board[T(n)] = 'festival');
  give(s, 0, T('7E'));
  must(E.applyAction(s, 0, { type: 'place', tile: T('7E') }));
  assert.equal(E.chainSizes(s).festival, 3);
  assert.equal(s.phase, 'buy');
});
test('7개 체인이 모두 있으면 8번째 창립 타일은 blocked', () => {
  const s = blank();
  E.CHAIN_IDS.forEach((id, k) => { s.board[T(`1${'ABCDEFG'[k]}`)] = id; s.board[T(`2${'ABCDEFG'[k]}`)] = id; });
  s.board[T('11A')] = 'orphan';
  assert.equal(E.tileStatus(s, T('12A')), 'blocked');
});

console.log('\n합병');
function mergerSetup() {
  const s = blank();
  // Tower 3칸 (생존) / Luxor 2칸 (소멸), 7E로 연결
  ['5E', '5F', '5D'].forEach(n => s.board[T(n)] = 'tower');
  ['8E', '9E'].forEach(n => s.board[T(n)] = 'luxor');
  s.board[T('6E')] = 'tower';
  give(s, 0, T('7E'));
  return s;
}
test('큰 체인이 작은 체인을 흡수하고 배당 지급', () => {
  const s = mergerSetup();
  s.players[1].shares.luxor = 4;
  s.players[2].shares.luxor = 2;
  const before1 = s.players[1].money, before2 = s.players[2].money;
  must(E.applyAction(s, 0, { type: 'place', tile: T('7E') }));
  // Luxor 2칸 → 주가 $200, 대주주 $2000 / 소주주 $1000
  assert.equal(s.players[1].money, before1 + 2000);
  assert.equal(s.players[2].money, before2 + 1000);
  assert.equal(s.phase, 'dispose');
  assert.equal(s.merger.survivor, 'tower');
  assert.equal(s.merger.current, 'luxor');
  assert.deepEqual(s.merger.queue, [1, 2]); // 타일 놓은 사람(0)은 Luxor 미보유 → 제외
});
test('처분: 매각 / 2대1 교환 / 보유', () => {
  const s = mergerSetup();
  s.players[1].shares.luxor = 5;
  must(E.applyAction(s, 0, { type: 'place', tile: T('7E') }));
  const money = s.players[1].money;
  must(E.applyAction(s, 1, { type: 'dispose', sell: 1, trade: 2 }));
  assert.equal(s.players[1].money, money + 200);  // 1장 × $200
  assert.equal(s.players[1].shares.tower, 1);      // 2장 → 1장 교환
  assert.equal(s.players[1].shares.luxor, 2);      // 나머지 보유
  assert.equal(s.pool.tower, 24);
  assert.equal(s.pool.luxor, 25 + 3);   // 테스트에서 보유분을 직접 지급했으므로 회수분만 증가
  assert.equal(s.phase, 'buy');
  assert.equal(s.board[T('8E')], 'tower');         // 소멸 체인 타일이 생존 체인으로
  assert.equal(s.board[T('7E')], 'tower');         // 놓인 타일도 편입
  assert.equal(E.chainSizes(s).tower, 7);
});
test('홀수 교환과 보유량 초과는 거부', () => {
  const s = mergerSetup();
  s.players[1].shares.luxor = 3;
  must(E.applyAction(s, 0, { type: 'place', tile: T('7E') }));
  assert.equal(E.applyAction(s, 1, { type: 'dispose', trade: 1 }).ok, false);
  assert.equal(E.applyAction(s, 1, { type: 'dispose', sell: 4 }).ok, false);
  must(E.applyAction(s, 1, { type: 'dispose', sell: 3 }));
});
test('크기 동률이면 생존 체인을 고른다', () => {
  const s = blank();
  ['5E', '5F'].forEach(n => s.board[T(n)] = 'tower');
  ['7E', '7F'].forEach(n => s.board[T(n)] = 'luxor');
  give(s, 0, T('6E'));
  must(E.applyAction(s, 0, { type: 'place', tile: T('6E') }));
  assert.equal(s.phase, 'survivor');
  assert.equal(E.applyAction(s, 1, { type: 'survivor', chain: 'luxor' }).ok, false); // 합병 유발자만
  must(E.applyAction(s, 0, { type: 'survivor', chain: 'luxor' }));
  assert.equal(E.chainSizes(s).luxor, 5);
  assert.equal(E.chainSizes(s).tower, 0);
});
test('3체인 동시 합병 — 소멸 순서 선택', () => {
  const s = blank();
  // 6E의 네 이웃(5E / 7E / 6D)에 서로 다른 체인이 각각 붙어 있게 배치
  ['3E', '4E', '5E'].forEach(n => s.board[T(n)] = 'tower');      // 3칸 → 생존
  ['7E', '8E'].forEach(n => s.board[T(n)] = 'luxor');            // 2칸
  ['6D', '6C'].forEach(n => s.board[T(n)] = 'festival');         // 2칸
  give(s, 0, T('6E'));
  s.players[1].shares.festival = 2;  // 주주가 있어야 처분 단계에서 멈춘다
  s.players[1].shares.luxor = 2;
  must(E.applyAction(s, 0, { type: 'place', tile: T('6E') }));
  assert.equal(s.merger.survivor, 'tower');
  assert.equal(s.phase, 'defunctOrder');
  assert.deepEqual(new Set(s.merger.pending), new Set(['luxor', 'festival']));
  must(E.applyAction(s, 0, { type: 'defunctOrder', chain: 'festival' }));
  assert.equal(s.merger.current, 'festival');
  assert.equal(s.phase, 'dispose');
  must(E.applyAction(s, 1, { type: 'dispose', sell: 2 }));
  assert.equal(s.merger.current, 'luxor');   // 두 번째 소멸 체인으로 자동 진행
  must(E.applyAction(s, 1, { type: 'dispose', trade: 2 }));
  assert.equal(s.merger, null);
  assert.equal(E.chainSizes(s).tower, 8);    // 3 + 2 + 2 + 놓은 타일
  assert.equal(s.players[1].shares.tower, 1);
});

test('주주가 아무도 없는 체인은 처분 단계 없이 즉시 흡수', () => {
  const s = blank();
  ['5E', '5F', '5D'].forEach(n => s.board[T(n)] = 'tower');
  ['7E', '8E'].forEach(n => s.board[T(n)] = 'luxor');
  give(s, 0, T('6E'));
  must(E.applyAction(s, 0, { type: 'place', tile: T('6E') }));
  assert.equal(s.merger, null);
  assert.equal(s.phase, 'buy');
  assert.equal(E.chainSizes(s).tower, 6);
});
test('안전 체인 2개를 잇는 타일은 영구 사용 불가', () => {
  const s = blank();
  for (let i = 0; i < 11; i++) s.board[T(`${i + 1}A`)] = 'tower';
  for (let i = 0; i < 11; i++) s.board[T(`${i + 1}C`)] = 'luxor';
  assert.equal(E.chainSizes(s).tower, 11);
  assert.equal(E.tileStatus(s, T('1B')), 'dead');
});
test('안전 체인 1개 + 작은 체인은 합병 가능', () => {
  const s = blank();
  for (let i = 0; i < 11; i++) s.board[T(`${i + 1}A`)] = 'tower';
  s.board[T('1C')] = 'luxor'; s.board[T('2C')] = 'luxor';
  assert.equal(E.tileStatus(s, T('1B')), 'ok');
});

console.log('\n주식 구매');
test('한 턴 최대 3장, 현금 검증', () => {
  const s = blank();
  ['5E', '5F'].forEach(n => s.board[T(n)] = 'continental');
  s.phase = 'buy';
  assert.equal(E.applyAction(s, 0, { type: 'buy', picks: { continental: 4 } }).ok, false);
  s.players[0].money = 500;
  assert.equal(E.applyAction(s, 0, { type: 'buy', picks: { continental: 2 } }).ok, false); // $400×2
  s.players[0].money = 1000;
  must(E.applyAction(s, 0, { type: 'buy', picks: { continental: 2 } }));
  assert.equal(s.players[0].money, 200);
  assert.equal(s.players[0].shares.continental, 2);
  assert.equal(s.pool.continental, 23);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'place');
});
test('보드에 없는 체인은 살 수 없음', () => {
  const s = blank(); s.phase = 'buy';
  assert.equal(E.applyAction(s, 0, { type: 'buy', picks: { tower: 1 } }).ok, false);
});
test('재고보다 많이 살 수 없음', () => {
  const s = blank();
  ['5E', '5F'].forEach(n => s.board[T(n)] = 'tower');
  s.pool.tower = 1; s.phase = 'buy';
  assert.equal(E.applyAction(s, 0, { type: 'buy', picks: { tower: 2 } }).ok, false);
});

console.log('\n게임 종료');
test('41칸 체인이 생기면 종료 선언 가능', () => {
  const s = blank();
  for (let i = 0; i < 41; i++) s.board[i] = 'tower';
  assert.equal(E.canDeclareEnd(s), true);
});
test('모든 체인이 안전하면 종료 선언 가능', () => {
  const s = blank();
  for (let i = 0; i < 11; i++) s.board[T(`${i + 1}A`)] = 'tower';
  for (let i = 0; i < 12; i++) s.board[T(`${i + 1}D`)] = 'luxor';
  assert.equal(E.canDeclareEnd(s), true);
  s.board[T('1F')] = 'festival'; s.board[T('2F')] = 'festival';
  assert.equal(E.canDeclareEnd(s), false); // 2칸짜리는 안전하지 않음
});
test('종료 정산: 배당 + 전량 현금화 + 순위', () => {
  const s = blank();
  for (let i = 0; i < 41; i++) s.board[i] = 'tower'; // 41칸 → 주가 $1000
  s.players[0].shares.tower = 5;
  s.players[1].shares.tower = 3;
  s.players[0].money = 0; s.players[1].money = 0; s.players[2].money = 0;
  s.phase = 'buy';
  must(E.applyAction(s, 0, { type: 'buy', picks: {}, declareEnd: true }));
  assert.equal(s.ended, true);
  assert.equal(s.players[0].money, 10000 + 5000);       // 대주주 $10,000 + 주식 5×$1000
  assert.equal(s.players[1].money, 5000 + 3000);        // 소주주 $5,000 + 주식 3×$1000
  assert.equal(s.players[2].money, 0);
  assert.equal(s.results[0].name, s.players[0].name);
});
test('조건 미달 상태의 종료 선언은 거부', () => {
  const s = blank();
  ['5E', '5F'].forEach(n => s.board[T(n)] = 'tower');
  s.phase = 'buy';
  assert.equal(E.applyAction(s, 0, { type: 'buy', picks: {}, declareEnd: true }).ok, false);
});

console.log('\n게임 생성 / 턴 진행');
test('초기 배분: 6장 손패, $6000, 1A에 가까운 순 선공', () => {
  const s = E.createGame(['가', '나', '다', '라'], 42);
  assert.equal(s.players.length, 4);
  s.players.forEach(p => {
    assert.equal(p.hand.length, E.HAND_SIZE);
    assert.equal(p.money, E.START_MONEY);
  });
  const starts = s.players.map(p => p.startTile);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.equal(s.board.filter(v => v === 'orphan').length, 4);
  assert.equal(s.bag.length, E.TILE_COUNT - 4 - 4 * E.HAND_SIZE);
});
test('sanitize는 남의 손패를 숨긴다', () => {
  const s = E.createGame(['가', '나'], 7);
  const v = E.sanitize(s, 0);
  assert.ok(Array.isArray(v.players[0].hand));
  assert.equal(v.players[1].hand, null);
  assert.equal(v.players[1].handCount, E.HAND_SIZE);
  assert.equal(v.bag, null);
  assert.equal(v.bagCount, s.bag.length);
});
test('차례가 아닌 플레이어의 입력은 거부', () => {
  const s = E.createGame(['가', '나'], 3);
  const tile = s.players[1].hand[0];
  assert.equal(E.applyAction(s, 1, { type: 'place', tile }).ok, false);
});
test('actingPlayer가 단계별로 올바른 플레이어를 가리킨다', () => {
  const s = mergerSetup();
  s.players[1].shares.luxor = 2;
  assert.equal(E.actingPlayer(s), 0);
  must(E.applyAction(s, 0, { type: 'place', tile: T('7E') }));
  assert.equal(s.phase, 'dispose');
  assert.equal(E.actingPlayer(s), 1);
});

test('createGame이 ref로 원래 좌석을 유지한다', () => {
  const s = E.createGame([{ name: '가', ref: 'a' }, { name: '나', ref: 'b' }, { name: '다', ref: 'c' }], 11);
  assert.deepEqual(new Set(s.players.map(p => p.ref)), new Set(['a', 'b', 'c']));
  s.players.forEach(p => assert.equal(p.name, { a: '가', b: '나', c: '다' }[p.ref]));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
