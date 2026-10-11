// 원정(로그라이크) 룰 엔진 테스트 — node test/run.test.mjs
import assert from 'node:assert/strict';
import * as Run from '../run/rules.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.stack}`); }
}
const run = (cls = 'gambler', seed = 7) => Run.createRun({ cls, seed });
// 지도에서 첫 전투 칸으로 들어간다
function intoFight(R) {
  const id = Run.nextNodes(R).find(i => Run.mapNode(R, i).type === 'fight');
  Run.enterNode(R, id);
  assert.equal(R.phase, 'combat');
  return R.C;
}
function mulberry(a) { return () => { let t = (a = (a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

console.log('\n원정 시작 · 지도');
test('직업마다 시작 덱 9장 · 체력 · 도구', () => {
  for (const cls of Object.keys(Run.RUN_CLASSES)) {
    const R = run(cls);
    const ci = Run.RUN_CLASSES[cls];
    assert.equal(R.deck.length, Run.BASE_DECK.length + 1);
    assert.equal(R.hp, ci.hp);
    assert.equal(R.flip, ci.flip);
    assert.equal(R.deck.at(-1).cat, ci.sig.cat);
    assert.equal(R.deck.at(-1).kw, ci.sig.kw || null);
    assert.ok(ci.desc.length > 10);
  }
});
test('지도: 1층 전투 · 4층 보물 · 6층 휴식 · 맨 위 보스, 모든 칸이 보스까지 이어진다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const R = run('monk', seed);
    const { nodes, boss } = R.map;
    assert.equal(nodes[boss].type, 'boss');
    for (const n of nodes) {
      if (n.row === 1) assert.equal(n.type, 'fight');
      if (n.row === 4) assert.equal(n.type, 'treasure');
      if (n.row === Run.ROWS) assert.equal(n.type, 'rest');
      if (n.row <= Run.ROWS) assert.ok(n.next.length > 0, `${n.row}층 칸이 막다른 길`);
      for (const j of n.next) assert.equal(nodes[j].row, n.row + 1);
      if (n.row === 2) assert.notEqual(n.type, 'elite');
    }
    assert.ok(nodes.filter(n => n.row === 1).length >= 2);
  }
});
test('갈 수 없는 칸으로는 못 간다', () => {
  const R = run();
  const far = R.map.nodes.find(n => n.row === 3);
  assert.throws(() => Run.enterNode(R, far.id));
});

console.log('\n전투');
test('턴 시작: 손패 4장(마법사 5장), 굴림 3번, 적 의도', () => {
  const R = run('warrior');
  const C = intoFight(R);
  assert.equal(C.hand.length, 4);
  assert.equal(C.rollsLeft, 3);
  assert.ok(C.e.intent);
  const M = run('mage');
  assert.equal(intoFight(M).hand.length, 5);
});
test('굴리기 전에는 카드를 낼 수 없고, 굴리면 낼 수 있다', () => {
  const R = run('warrior');
  intoFight(R);
  assert.throws(() => Run.playCard(R, 0, 'enemy'));
  Run.roll(R);
  const hp0 = R.C.e.hp + R.C.e.block;
  const turn0 = R.C.turn;
  Run.playCard(R, 0, 'enemy');
  if (R.phase === 'combat') {
    assert.equal(R.C.turn, turn0 + 1);                       // 적이 행동하고 새 턴
    assert.ok(R.C.e.hp <= hp0);
    assert.equal(R.C.hand.length, 4);
  }
});
test('점수 = 요트 원룰 + 강화 30%', () => {
  const R = run('monk');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [3, 3, 3, 5, 5];
  assert.equal(Run.scoreCard(R, { u: 999, cat: 'full', up: 0, kw: null }).total, 19);
  assert.equal(Run.scoreCard(R, { u: 999, cat: 'full', up: 1, kw: null }).total, 19 + Math.round(19 * 0.3));
  assert.equal(Run.scoreCard(R, { u: 999, cat: 'threes', up: 0, kw: null }).total, 9);
  assert.equal(Run.scoreCard(R, { u: 999, cat: 'yacht', up: 0, kw: null }).total, 0);
});
test('방어로 내면 점수만큼 보호막, 적 공격은 보호막부터 깎는다', () => {
  const R = run('gambler', 3);
  intoFight(R);
  Run.placeBet(R, 0);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 5];
  const choice = R.C.hand.findIndex(c => c.cat === 'choice');
  const hi = choice >= 0 ? choice : 0;
  const p = Run.preview(R, hi, 'self');
  const hp0 = R.hp;
  R.C.e.intent = { ko: '테스트', atk: 10 };
  const inc = Run.incoming(R);
  Run.playCard(R, hi, 'self');
  const lost = hp0 - R.hp;
  assert.equal(lost, Math.max(0, inc - p.block));
});
test('관통은 적 보호막을 무시한다', () => {
  const R = run('warrior');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.e.block = 50;
  R.C.e.hp = R.C.e.maxHp = 100;
  R.C.e.intent = { ko: '대기', atk: 1 };
  R.C.hand[0] = { u: 9001, cat: 'choice', up: 0, kw: 'pierce' };
  R.C.hand[1] = { u: 9002, cat: 'choice', up: 0, kw: null };
  assert.equal(Run.preview(R, 0, 'enemy').pierce, true);
  assert.equal(Run.preview(R, 1, 'enemy').pierce, false);
  Run.playCard(R, 0, 'enemy');
  assert.equal(R.C.e.hp, 70);                               // 보호막 50 을 지나 30 이 그대로
});
test('공격 · 방어 나누기: 한 장의 점수를 피해와 보호막으로 나눠 낸다', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.e.block = 0;
  R.C.e.hp = R.C.e.maxHp = 100;
  R.C.e.intent = { ko: '테스트', atk: 1 };
  R.C.hand[0] = { u: 9001, cat: 'choice', up: 0, kw: null };
  const p = Run.preview(R, 0, 18);
  assert.equal(p.score, 30);
  assert.equal(p.atk, 18); assert.equal(p.def, 12);
  assert.equal(p.dmg, 18); assert.equal(p.block, 12);
  assert.deepEqual([Run.preview(R, 0, 'enemy').dmg, Run.preview(R, 0, 'enemy').block], [30, 0]);
  assert.deepEqual([Run.preview(R, 0, 'self').dmg, Run.preview(R, 0, 'self').block], [0, 30]);
  assert.equal(Run.preview(R, 0, 99).atk, 30);               // 범위를 넘으면 끝으로
  assert.equal(Run.preview(R, 0, -5).atk, 0);
  assert.throws(() => Run.playCard(R, 0, 'foo'));
  Run.playCard(R, 0, 18);
  const play = Run.drainFx(R).find(f => f.type === 'play');
  assert.equal(play.dmg, 18);
  assert.equal(play.block, 12);
  assert.equal(play.target, 'enemy');
  assert.equal(R.C.e.hp, 82);
});
test('수호: 방어로 돌린 점수의 보호막 +50%, 공격 몫에는 붙지 않는다', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.hand[0] = { u: 9001, cat: 'choice', up: 0, kw: 'guard' };
  assert.equal(Run.preview(R, 0, 'self').block, 45);
  assert.equal(Run.preview(R, 0, 'enemy').block, 0);
  const p = Run.preview(R, 0, 20);
  assert.equal(p.dmg, 20);
  assert.equal(p.block, 15);
});
test('공격 몫 키워드: 흡혈 · 황금 · 화상은 공격한 점수 기준, 약화는 절반 이상 공격해야', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.e.block = 0;
  R.C.e.hp = R.C.e.maxHp = 200;
  R.hp = 10;
  R.C.hand[0] = { u: 9001, cat: 'choice', up: 0, kw: 'vamp' };
  R.C.hand[1] = { u: 9002, cat: 'choice', up: 0, kw: 'gold' };
  R.C.hand[2] = { u: 9003, cat: 'choice', up: 0, kw: 'burn' };
  R.C.hand[3] = { u: 9004, cat: 'choice', up: 0, kw: 'weak' };
  assert.equal(Run.preview(R, 0, 12).heal, 4);
  assert.equal(Run.preview(R, 0, 'self').heal, 0);
  assert.equal(Run.preview(R, 1, 9).gold, 3);
  assert.equal(Run.preview(R, 2, 20).burn, 5);
  assert.equal(Run.preview(R, 2, 3).burn, 0);
  assert.equal(Run.preview(R, 3, 14).weak, false);
  assert.equal(Run.preview(R, 3, 15).weak, true);
  assert.equal(Run.preview(R, 3, 'self').weak, false);
});
test('다 막을 만큼만 방어하고 나머지는 공격 (coverAtk)', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.e.hp = R.C.e.maxHp = 200;
  R.C.e.intent = { ko: '테스트', atk: 6, hits: 2 };
  R.C.hand[0] = { u: 9001, cat: 'choice', up: 0, kw: null };
  R.C.hand[1] = { u: 9002, cat: 'choice', up: 0, kw: 'guard' };
  const inc = Run.incoming(R) - R.C.block;
  assert.ok(inc > 0 && inc < 30);
  const c = Run.coverAtk(R, 0);
  assert.equal(c.full, true);
  assert.equal(c.atk, 30 - inc);
  assert.equal(Run.takenAfter(R, Run.preview(R, 0, c.atk)), 0);
  assert.ok(Run.takenAfter(R, Run.preview(R, 0, c.atk + 1)) > 0);
  assert.ok(Run.coverAtk(R, 1).atk > c.atk);                // 수호는 덜 방어해도 다 막는다
  R.C.e.intent = { ko: '큰 공격', atk: 200 };
  assert.deepEqual(Run.coverAtk(R, 0), { atk: 0, full: false });
});
test('봉인 · 얼음: 첫 굴림 뒤 걸리고, 봉인은 다시 굴리면 풀린다', () => {
  const R = run('monk', 11);
  intoFight(R);
  R.C.hex = { t: 'seal', n: 2 };
  Run.roll(R);
  assert.equal(R.C.sealed.length, 2);
  const i = R.C.sealed[0];
  assert.throws(() => Run.toggleHold(R, i));
  assert.throws(() => Run.useNudge(R, i, 1));
  const v = R.C.dice[i];
  Run.roll(R);
  assert.equal(R.C.dice[i], v);           // 봉인된 주사위는 그 굴림에서 그대로
  assert.equal(R.C.sealed.length, 0);     // 그리고 풀린다
  const F = run('monk', 12);
  intoFight(F);
  F.C.hex = { t: 'freeze', n: 2 };
  Run.roll(F);
  assert.equal(F.C.frozen.length, 2);
  const j = F.C.frozen[0], w = F.C.dice[j];
  Run.roll(F);
  assert.equal(F.C.dice[j], w);
});
test('화염 숨결: 가장 높은 주사위가 1로', () => {
  for (let seed = 1; seed < 20; seed++) {
    const R = run('monk', seed);
    intoFight(R);
    R.C.hex = { t: 'burn', n: 1 };
    Run.roll(R);
    const f = Run.drainFx(R).find(x => x.type === 'hexDice');
    if (!f) continue;
    const i = f.dice[0];
    assert.equal(f.from[i], Math.max(...f.from));
    assert.equal(R.C.dice[i], 1);
  }
});
test('응시: 노려본 카드는 0점, 교체하면 벗어난다', () => {
  const R = run('warrior', 5);
  intoFight(R);
  R.C.gazed = [R.C.hand[0].u];
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.hand[0] = { ...R.C.hand[0], cat: 'choice' };
  assert.equal(Run.scoreCard(R, R.C.hand[0]).total, 0);
  Run.swapCard(R, 0);
  assert.equal(R.C.gazed.length, 0);
  assert.throws(() => Run.swapCard(R, 0));   // 턴마다 1번
});
test('도박사: 배팅해야 굴릴 수 있고 배팅 카드는 ×1.25', () => {
  const R = run('gambler');
  intoFight(R);
  assert.throws(() => Run.roll(R));
  Run.placeBet(R, 0);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 5, 5];
  const c = { ...R.C.hand[0], cat: 'choice', up: 0, kw: null };
  R.C.hand[0] = c;
  R.C.bet = c.u;
  assert.equal(Run.scoreCard(R, c).total, 28 + Math.round(28 * (Run.CLASS_TUNE.betMul - 1)));
});
test('타짜: 턴마다 2번까지 원하는 눈으로', () => {
  const R = run('sharper');
  intoFight(R);
  Run.roll(R);
  Run.useDeal(R, 0, 6);
  Run.useDeal(R, 1, 6);
  assert.equal(R.C.dice[0], 6);
  assert.equal(R.C.dice[1], 6);
  assert.throws(() => Run.useDeal(R, 2, 6));
});
test('무희: 25점 이상이면 춤사위 +1, 쓰면 모든 주사위 +1', () => {
  const R = run('dancer');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [2, 3, 4, 5, 6];
  Run.useDance(R);
  assert.deepEqual(R.C.dice, [3, 4, 5, 6, 6]);
  assert.equal(R.dance, 0);
  assert.throws(() => Run.useDance(R));
});
test('세머리 용: 한 장으로 30 이상이면 그 머리의 숨결이 나가지 않는다', () => {
  const R = run('warrior');
  R.act = 2;
  Run.startCombat(R, 'hydra');
  const head = R.C.e.intent.head;
  assert.ok(head);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.hand[0] = { u: 7777, cat: 'yacht', up: 0, kw: null };
  const hp0 = R.hp;
  Run.playCard(R, 0, 'enemy');
  assert.equal(R.C.e.cut[head], true);
  assert.equal(R.hp, hp0);                 // 숨결이 나가지 않았다
});
test('보스는 체력 절반 아래에서 분노 (힘 +2)', () => {
  const R = run('warrior');
  Run.startCombat(R, 'dragon');
  R.C.e.hp = Math.floor(R.C.e.maxHp / 2) + 1;
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 5];
  const str0 = R.C.e.str;
  Run.playCard(R, R.C.hand.findIndex(c => c.cat === 'choice') >= 0 ? R.C.hand.findIndex(c => c.cat === 'choice') : 0, 'enemy');
  if (R.C.e.hp * 2 < R.C.e.maxHp && R.C.e.hp > 0) assert.ok(R.C.e.raged && R.C.e.str >= str0 + 2);
});
test('격앙: 전투가 길어지면 적이 힘을 얻는다', () => {
  const R = run('warrior');
  const C = intoFight(R);
  C.e.hp = C.e.maxHp = 9999;
  for (let t = 0; t < 7; t++) {
    Run.roll(R);
    R.C.dice = [1, 1, 2, 2, 3];
    R.C.e.intent = { ko: '대기', block: 1 };
    Run.playCard(R, 0, 'self');
  }
  assert.ok(R.C.e.fury >= 2);
});

console.log('\n보상 · 상점 · 휴식 · 이벤트');
test('전투에서 이기면 보상: 골드 · 카드 고르기, 받고 나서 지도로', () => {
  const R = run('warrior');
  const C = intoFight(R);
  C.e.hp = 1;
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.hand[0] = { u: 8001, cat: 'choice', up: 0, kw: null };
  Run.playCard(R, 0, 'enemy');
  assert.equal(R.phase, 'reward');
  const gi = R.reward.items.findIndex(it => it.t === 'gold');
  const g0 = R.gold;
  Run.takeReward(R, gi);
  assert.ok(R.gold > g0);
  const ci = R.reward.items.findIndex(it => it.t === 'card');
  const n0 = R.deck.length;
  Run.takeReward(R, ci, 1);
  assert.equal(R.deck.length, n0 + 1);
  assert.throws(() => Run.takeReward(R, ci, 0));
  Run.leaveReward(R);
  assert.equal(R.phase, 'map');
});
test('상점: 골드로 사고, 카드 제거는 한 번', () => {
  const R = run('monk');
  R.gold = 999;
  R.phase = 'shop';
  R.shop = (() => { R.phase = 'map'; const id = Run.nextNodes(R)[0]; R.map.nodes[id].type = 'shop'; Run.enterNode(R, id); return R.shop; })();
  assert.equal(R.phase, 'shop');
  const n0 = R.deck.length;
  Run.buy(R, 'card', 0);
  assert.equal(R.deck.length, n0 + 1);
  assert.throws(() => Run.buy(R, 'card', 0));
  Run.startRemove(R);
  const u = R.deck[0].u;
  Run.pickDeck(R, u);
  assert.equal(R.deck.length, n0);
  assert.throws(() => Run.startRemove(R));
  Run.leaveShop(R);
  assert.equal(R.phase, 'map');
});
test('휴식: 체력 30% 회복 또는 카드 1장 강화', () => {
  const R = run('warrior');
  R.phase = 'rest';
  R.hp = 10;
  Run.restHeal(R);
  assert.equal(R.hp, 10 + Math.round(R.maxHp * 0.3));
  R.phase = 'rest';
  Run.startUpgrade(R);
  const c = R.deck.find(x => !x.up);
  Run.pickDeck(R, c.u);
  assert.equal(c.up, 1);
  assert.equal(R.phase, 'map');
});
test('이벤트는 모두 고를 수 있는 선택지가 있고 끝까지 진행된다', () => {
  for (const ev of Run.EVENTS) {
    for (let k = 0; k < ev.opts.length; k++) {
      const R = run('bard', 21 + k);
      R.gold = 100;
      R.phase = 'event';
      R.event = { id: ev.id, result: null, dice: null, fight: null };
      if (!ev.opts[k].can(R)) continue;
      Run.eventChoose(R, k);
      if (R.pick) { const c = R.deck.find(x => !x.up) || R.deck[0]; Run.pickDeck(R, c.u); }
      assert.ok(R.event.result, `${ev.id} ${k}: 결과 문장`);
      Run.eventLeave(R);
      assert.ok(['map', 'combat'].includes(R.phase));
    }
  }
});

console.log('\n봇 · 저장');
test('봇이 모든 직업으로 원정을 끝까지 진행한다 (막히지 않음)', () => {
  for (const cls of Object.keys(Run.RUN_CLASSES)) {
    for (let k = 0; k < 3; k++) {
      const R = Run.createRun({ cls, seed: 100 + k });
      Run.botRun(R, mulberry(k + 1), 6);
      assert.ok(R.ended, `${cls} 원정이 끝나지 않았다 (${R.phase})`);
      assert.ok(R.won || R.hp === 0);
    }
  }
});
test('같은 시드 · 같은 선택이면 같은 결과, 상태는 JSON 으로 저장된다', () => {
  const a = Run.createRun({ cls: 'outlaw', seed: 42 });
  const b = Run.createRun({ cls: 'outlaw', seed: 42 });
  Run.botRun(a, mulberry(9), 6);
  Run.botRun(b, mulberry(9), 6);
  assert.equal(a.hp, b.hp);
  assert.equal(a.stats.floors, b.stats.floors);
  const R = Run.createRun({ cls: 'rogue', seed: 5 });
  intoFight(R);
  Run.roll(R);
  const copy = JSON.parse(JSON.stringify(R));
  Run.playCard(copy, 0, 'enemy');
  assert.ok(copy.C.turn >= 1);
});

console.log(`\n${passed} 통과, ${failed} 실패`);
if (failed) process.exit(1);
