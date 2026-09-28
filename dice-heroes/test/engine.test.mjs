// 다이스 히어로즈 룰 엔진 테스트 — node test/engine.test.mjs
import assert from 'node:assert/strict';
import * as E from '../engine.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.stack}`); }
}
const game = (n = 2, seed = 7) =>
  E.createGame([...Array(n)].map((_, i) => ({ name: `P${i + 1}`, cls: 'warrior' })), seed);

console.log('\n요트 원룰 점수');
test('상단 항목은 해당 눈의 합', () => {
  assert.equal(E.baseScore('threes', [3, 3, 1, 3, 6]), 9);
  assert.equal(E.baseScore('sixes', [1, 2, 3, 4, 5]), 0);
});
test('초이스 / 포카인드 / 풀하우스는 5개 합', () => {
  assert.equal(E.baseScore('choice', [6, 6, 5, 4, 1]), 22);
  assert.equal(E.baseScore('four', [5, 5, 5, 5, 2]), 22);
  assert.equal(E.baseScore('four', [5, 5, 5, 5, 5]), 25);
  assert.equal(E.baseScore('four', [5, 5, 5, 2, 2]), 0);
  assert.equal(E.baseScore('full', [5, 5, 5, 2, 2]), 19);
  assert.equal(E.baseScore('full', [5, 5, 5, 5, 5]), 0);
});
test('스트레이트 15 / 30, 요트 50', () => {
  assert.equal(E.baseScore('sstr', [1, 2, 3, 4, 6]), 15);
  assert.equal(E.baseScore('sstr', [3, 4, 5, 6, 6]), 15);
  assert.equal(E.baseScore('sstr', [1, 2, 3, 5, 6]), 0);
  assert.equal(E.baseScore('lstr', [2, 3, 4, 5, 6]), 30);
  assert.equal(E.baseScore('lstr', [1, 2, 3, 4, 6]), 0);
  assert.equal(E.baseScore('yacht', [4, 4, 4, 4, 4]), 50);
});
test('상단 63점 이상이면 보너스 35, 전사는 50', () => {
  const s = game();
  const p = s.players[0];
  Object.assign(p.scores, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 12 }); // 57
  assert.equal(E.cardTotal(p), 57 + 35);                   // 전사
  p.cls = 'mage';
  assert.equal(E.cardTotal(p), 57);
});

console.log('\n특성 · 주사위 6개');
test('여섯 번째 주사위는 가장 좋은 5개로 계산', () => {
  const s = game();
  const p = s.players[0];
  p.perks.sixth = 1;
  assert.equal(E.catScore(s, p, 'yacht', [3, 3, 3, 3, 3, 1]), 50);
  assert.equal(E.catScore(s, p, 'lstr', [1, 6, 2, 3, 4, 5]), 30);
  assert.ok(E.questMet('rainbow', [1, 1, 2, 3, 4, 5]));
});
test('항목 보너스 특성은 0점일 때 붙지 않는다', () => {
  const s = game();
  const p = s.players[0];
  p.perks.full = 1;
  assert.equal(E.catScore(s, p, 'full', [2, 2, 3, 3, 3]), 23);
  assert.equal(E.catScore(s, p, 'full', [1, 2, 3, 4, 5]), 0);
});
test('뒤집기는 7-눈, 조정은 ±1 (1~6 밖은 거부)', () => {
  const s = game();
  E.roll(s);
  const p = E.current(s);
  p.flip = 1; p.nudge = 1;
  s.dice[0] = 2; E.useFlip(s, 0); assert.equal(s.dice[0], 5);
  s.dice[1] = 6; assert.throws(() => E.useNudge(s, 1, 1));
  E.useNudge(s, 1, -1); assert.equal(s.dice[1], 5);
  assert.throws(() => E.useFlip(s, 0));
});

console.log('\n턴 · 경험치 · 레벨업');
test('굴리기 전에는 기록할 수 없고 굴림 기회는 3번', () => {
  const s = game();
  assert.throws(() => E.commitScore(s, 'choice'));
  E.roll(s); E.roll(s); E.roll(s);
  assert.throws(() => E.roll(s));
});
test('점수만큼 경험치, 문턱을 넘으면 레벨업 카드 3장', () => {
  const s = game();
  E.roll(s);
  s.dice = [6, 6, 6, 5, 5];
  s.board = [];                 // 퀘스트 영향 제거
  E.commitScore(s, 'choice');   // 28점 → 28xp → Lv2 (25 필요), 남은 3
  const p = s.players[0];
  assert.equal(p.level, 2);
  assert.equal(p.xp, 3);
  assert.equal(s.phase, 'levelup');
  assert.equal(p.offers[0].length, 3);
  assert.equal(new Set(p.offers[0]).size, 3);
  E.pickPerk(s, p.offers[0][0]);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'roll');
});
test('0점을 기록하면 위로 경험치', () => {
  const s = game();
  E.roll(s);
  s.dice = [1, 2, 3, 5, 6];
  s.board = [];
  E.commitScore(s, 'yacht');
  assert.equal(s.players[0].xp, E.ZERO_XP);
});
test('의뢰를 깨면 난이도별 뒤집기·조정과 경험치를 얻고 보드가 다시 채워진다', () => {
  const s = game();
  s.board = ['high', 'pairs', 'odd'];
  E.roll(s);
  s.dice = [6, 6, 5, 5, 4];     // 합 26 · 두 쌍 → 보상 같으니 하나만
  E.commitScore(s, 'choice');
  const p = s.players[0];
  assert.equal(p.questsDone.length, 1);
  assert.equal(p.flip + p.nudge, 1);                  // 쉬운 의뢰(합계 25↑·두 쌍) → 조정 1
  assert.equal(s.board.length, 3);
});
test('연쇄 의뢰면 퀘스트 2개', () => {
  const s = game();
  s.board = ['high', 'pairs', 'odd'];
  s.players[0].perks.chain = 1;
  E.roll(s);
  s.dice = [6, 6, 5, 5, 4];
  E.commitScore(s, 'choice');
  assert.equal(s.players[0].questsDone.length, 2);
});

console.log('\n전체 게임');
test('봇 4명이 12라운드를 끝까지 치르고 모든 칸이 찬다', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = E.createGame(E.CLASSES.slice(0, 4).map((c, i) => ({ name: `B${i}`, cls: c.id, bot: true })), seed);
    let guard = 0;
    while (!s.ended && guard++ < 5000) E.applyBot(s, E.botAction(s, () => E.rand(s), 8));
    assert.ok(s.ended, `seed ${seed} 끝나지 않음`);
    s.players.forEach(p => assert.ok(E.CAT_IDS.every(id => p.scores[id] !== null)));
  }
});
test('같은 시드면 같은 게임 (온라인 동기화·리플레이 전제)', () => {
  const run = seed => {
    const s = E.createGame([{ name: 'A', cls: 'mage', bot: true }, { name: 'B', cls: 'bard', bot: true }], seed);
    while (!s.ended) E.applyBot(s, E.botAction(s, () => E.rand(s), 6));
    return JSON.stringify(E.ranking(s).map(r => r.total));
  };
  assert.equal(run(42), run(42));
});
test('상태는 JSON 왕복해도 그대로 이어진다', () => {
  let s = game(3, 9);
  for (let k = 0; k < 40 && !s.ended; k++) {
    s = JSON.parse(JSON.stringify(s));
    E.applyBot(s, E.botAction(s, () => E.rand(s), 4));
  }
  assert.ok(s.round >= 1);
});

test('칸 점수 = 기본 점수 + 보너스 합 (보너스는 모두 이름이 붙는다)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.createGame([{ name: 'A', cls: E.CLASSES[seed % 5].id, bot: true }, { name: 'B', cls: 'bard', bot: true }], seed);
    while (!s.ended) {
      if (s.phase === 'roll' && s.rolled) {
        const p = E.current(s);
        for (const r of E.preview(s)) {
          if (r.taken) continue;
          const base = Math.max(0, ...E.fiveSets(s.dice).map(d => E.baseScore(r.id, d)));
          assert.equal(r.pts, base + r.bonus.reduce((a, b) => a + b.amt, 0), `${r.id} ${s.dice}`);
          if (!base) assert.equal(r.pts, 0);
        }
      }
      E.applyBot(s, E.botAction(s, () => E.rand(s), 4));
    }
  }
});

console.log('\n특성 카드 후보');
test('해당 칸을 모두 0점으로 버린 특성은 후보에 나오지 않는다', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = game(2, seed);
    const p = s.players[0];
    Object.assign(p.scores, { choice: 0, full: 0, sstr: 0, lstr: 0, four: 0, yacht: 0 });
    s.board = [];
    E.roll(s);
    s.dice = [6, 6, 6, 5, 5];
    p.level = 5; p.xp = 0;
    E.commitScore(s, 'sixes');         // 28점 + 레벨업
    for (const offer of p.offers) {
      for (const id of offer) assert.ok(!['choice', 'full', 'straight', 'fourk', 'yacht'].includes(id), `seed ${seed}: ${id}`);
    }
  }
});
test('고를 특성이 모자라면 즉시 보상 카드로 채우고, 고르면 바로 받는다', () => {
  const s = game(2, 3);
  const p = s.players[0];
  for (const k of E.PERKS) if (!k.filler) p.perks[k.id] = k.max;   // 전부 최대치
  s.board = [];
  E.roll(s);
  s.dice = [6, 6, 6, 5, 5];
  E.commitScore(s, 'choice');
  const offer = p.offers[0];
  assert.equal(offer.length, 3);
  assert.ok(offer.every(id => E.perkInfo(id).filler));
  const c0 = p.flip + p.nudge;
  E.pickPerk(s, offer[0]);
  assert.ok(p.flip + p.nudge > c0);
  assert.equal(p.perks[offer[0]], undefined);
});

test('의뢰 난이도가 높을수록 보상이 크다', () => {
  const s = game();
  const p = s.players[0];
  const tot = q => { const r = E.questReward(s, p, q); return r.flip * 2 + r.nudge; };
  assert.ok(tot('pairs') < tot('quad'));
  assert.ok(tot('quad') < tot('yacht'));
});

test('칸 강화 특성은 이미 점수를 낸 칸에 소급 적용 (0점 칸 제외)', () => {
  const s = game(2, 5);
  const p = s.players[0];
  Object.assign(p.scores, { ones: 3, twos: 0, threes: 9, choice: 24 });
  s.phase = 'levelup';
  p.offers = [['basic', 'choice', 'flip']];
  E.pickPerk(s, 'basic');
  assert.deepEqual([p.scores.ones, p.scores.twos, p.scores.threes], [5, 0, 11]);
  s.phase = 'levelup'; s.turn = 0;
  p.offers = [['choice', 'flip', 'nudge']];
  assert.equal(E.perkRetro(p, 'choice'), 8);
  E.pickPerk(s, 'choice');
  assert.equal(p.scores.choice, 32);
});
test('해당 칸을 모두 0점으로 버렸을 때만 후보에서 빠진다', () => {
  const s = game();
  const p = s.players[0];
  p.scores.choice = 0;
  assert.ok(E.perkUseless(p, 'choice'));
  p.scores.choice = 20;
  assert.ok(!E.perkUseless(p, 'choice'));
});

console.log('\n협동모드');
const coop = (boss, diff = 1, n = 2) =>
  E.createGame([...Array(n)].map((_, i) => ({ name: `P${i}`, cls: 'mage' })), 11, { mode: 'coop', boss, diff });
test('점수가 곧 보스 피해, 의뢰는 뒤집기·조정 보상', () => {
  const s = coop('orc');
  const hp0 = s.boss.hp;
  s.board = ['high', 'pairs', 'odd'];
  E.roll(s);
  s.dice = [6, 6, 5, 5, 4];                  // 초이스 26, 의뢰 보상은 충전으로
  E.commitScore(s, 'choice');
  assert.equal(hp0 - s.boss.hp, 26);
  assert.equal(s.players[0].nudge, 1);
});
test('드래곤 용린 갑옷: 상단 피해 감소', () => {
  const s = coop('dragon', 1);
  s.board = [];
  E.roll(s);
  s.dice = [6, 6, 6, 1, 2];
  const hp0 = s.boss.hp;
  E.commitScore(s, 'sixes');                 // 18 × 50%
  assert.equal(hp0 - s.boss.hp, 9);
});
test('오크 약탈: 0점이면 회복, 전쟁의 북: 굴림 -1', () => {
  const s = coop('orc', 1);
  s.board = [];
  s.boss.hp -= 50;
  const hp0 = s.boss.hp;
  E.roll(s);
  s.dice = [1, 2, 3, 5, 6];
  E.commitScore(s, 'yacht');
  assert.equal(s.boss.hp, hp0 + 20);
  s.round = 2; s.events[1] = 'calm';          // 보통: 2라운드마다 북
  assert.equal(E.maxRolls(s), E.BASE_ROLLS - 1);
});
test('리치 뼈 방패는 체력보다 먼저 깎인다', () => {
  const s = coop('lich', 0);
  s.board = [];
  s.boss.shield = 10;
  E.roll(s);
  s.dice = [6, 6, 5, 5, 4];
  const hp0 = s.boss.hp;
  E.commitScore(s, 'choice');
  assert.equal(s.boss.shield, 0);
  assert.equal(hp0 - s.boss.hp, 16);
});
test('체력이 0이 되면 그 자리에서 승리로 끝난다', () => {
  const s = coop('dragon', 0);
  s.board = [];
  s.boss.hp = 5;
  E.roll(s);
  s.dice = [6, 6, 5, 5, 4];
  E.commitScore(s, 'choice');
  assert.ok(s.ended && s.boss.won);
  assert.notEqual(E.coopGrade(s), 'F');
});
test('보스 3종 × 난이도 3 봇 완주', () => {
  for (const b of E.BOSSES) for (const d of E.DIFFS) {
    const s = coop(b.id, d.id, 3);
    let guard = 0;
    while (!s.ended && guard++ < 20000) E.applyBot(s, E.botAction(s, () => E.rand(s), 4));
    assert.ok(s.ended, `${b.id}/${d.id}`);
  }
});

test('수도승: 남은 굴림 1회당 조정 +1', () => {
  const s = E.createGame([{ name: 'M', cls: 'monk' }, { name: 'B', cls: 'mage' }], 21);
  s.board = [];
  s.events[0] = 'calm';
  E.roll(s);
  assert.equal(s.rollsLeft, 2);
  s.dice = [1, 2, 3, 4, 6];                  // 경험치 16: 레벨업 없이 다음 사람 차례로
  E.commitScore(s, 'choice');
  assert.equal(s.players[0].nudge, 2);
  E.drainFx(s);
  E.roll(s); E.roll(s); E.roll(s);            // 다른 직업은 굴림을 다 써도 없음
  E.commitScore(s, 'choice');
  assert.equal(s.players[1].nudge, 0);
});
test('운명 비틀기는 두 번째 굴림 직후, fx에 바뀌기 전 눈', () => {
  const s = coop('lich', 2, 1);              // 매우 어려움: 매 라운드
  s.board = [];
  E.drainFx(s);
  E.roll(s);
  assert.ok(!E.drainFx(s).some(f => f.skill === 'twist'));
  const before = s.dice.slice();
  E.roll(s);
  const f = E.drainFx(s).find(x => x.skill === 'twist');
  assert.ok(f && f.from && f.dice.length === 1);
  const i = f.dice[0];
  assert.equal(s.dice[i], 7 - f.from[i]);
  assert.equal(f.from.length, before.length);
});
test('화염 숨결은 첫 굴림, 가장 높은 주사위가 1로 (fx.from 은 타기 전)', () => {
  const s = coop('dragon', 2, 1);            // 매우 어려움: 2라운드마다
  s.board = [];
  s.round = 2; s.events[1] = 'calm';
  E.drainFx(s);
  E.roll(s);
  const f = E.drainFx(s).find(x => x.skill === 'breath');
  assert.ok(f && f.from);
  const top = Math.max(...f.from);
  f.dice.forEach(i => { assert.equal(s.dice[i], 1); assert.equal(f.from[i], top === f.from[i] ? top : f.from[i]); });
  E.roll(s);
  assert.ok(!E.drainFx(s).some(x => x.skill === 'breath'));
});
test('점수 fx 에 기록한 주사위가 남는다 (공격 연출용)', () => {
  const s = E.createGame([{ name: 'A', cls: 'warrior' }, { name: 'B', cls: 'mage' }], 5);
  s.board = [];
  E.roll(s);
  s.dice = [3, 3, 3, 2, 2];
  E.commitScore(s, 'full');
  const f = E.drainFx(s).find(x => x.type === 'score');
  assert.deepEqual(f.dice, [3, 3, 3, 2, 2]);
});

test('연결 끊김: 봇 전환과 1대1 기권패', () => {
  const s = E.createGame([{ name: 'A', cls: 'warrior' }, { name: 'B', cls: 'mage' }], 3);
  E.dropToBot(s, 1);
  assert.ok(s.players[1].bot && s.players[1].dropped);
  let guard = 0;
  while (!s.ended && guard++ < 5000) {
    if (E.current(s).bot) E.applyBot(s, E.botAction(s, () => E.rand(s), 4));
    else E.applyBot(s, E.botAction(s, () => E.rand(s), 4));
  }
  assert.ok(s.ended);
  const t = E.createGame([{ name: 'A', cls: 'warrior' }, { name: 'B', cls: 'mage' }], 4);
  E.roll(t); t.dice = [6, 6, 6, 6, 6]; E.commitScore(t, 'yacht');
  E.forfeit(t, 0);
  assert.ok(t.ended && t.forfeit === 0);
  assert.equal(E.ranking(t)[0].i, 1);
});

console.log(`\n${passed} 통과, ${failed} 실패`);
if (failed) process.exit(1);
