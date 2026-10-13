// 원정(로그라이크) 룰 엔진 테스트 — node test/run.test.mjs
import assert from 'node:assert/strict';
import * as Run from '../run/rules.js';
import { RELIC_ART, SEAL_ART, OMEN_ART } from '../run/relic-art.js';
import * as AC from '../achievements.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.stack}`); }
}
// 막 징조는 따로 시험한다 (여기서는 징조 없이)
function mk(o) { const R = Run.createRun(o); R.omenOpts = null; return R; }
const run = (cls = 'gambler', seed = 7) => mk({ cls, seed });
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
    assert.equal(R.deck.length, Run.BASE_DECK.length + 2);
    assert.equal(R.deck.filter(c => Run.isSpecial(c.cat)).length, 1);     // 특별 카드 1장
    assert.equal(R.hp, ci.hp);
    assert.equal(R.flip, ci.flip);
    assert.equal(R.deck.at(-1).cat, ci.sig.cat);
    assert.deepEqual(Run.kwsOf(R.deck.at(-1)), ci.sig.kw ? [ci.sig.kw] : []);
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
  assert.equal(Run.scoreCard(R, { u: 999, cat: 'threes', up: 0, kw: null }).total, 11);   // 9 × 같은 눈 3개 1.2
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
  assert.deepEqual(Run.coverAtk(R, 0), { atk: 0, gold: 0, full: false });
});
test('보존: 턴이 끝나도 손패에 남고, 나머지 카드만 버린다', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.e.hp = R.C.e.maxHp = 500;
  R.C.hand[1] = { u: 9201, cat: 'sixes', up: 0, kw: 'keep' };
  Run.playCard(R, 0, 'enemy');
  assert.ok(R.C.hand.some(c => c.u === 9201), '보존 카드는 다음 턴 손패에 있다');
  assert.ok(!R.C.discard.some(c => c.u === 9201));
  assert.equal(R.C.hand.length, Run.handSize(R));
});
test('낮은 족보 유물: 에이스의 긍지 · 수집가의 상자 · 작은 수의 힘 · 쌍둥이 별 · 질풍 · 연환', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  const ace = { u: 9301, cat: 'ones', up: 0, kw: null };
  R.C.dice = [1, 1, 1, 1, 6];
  assert.equal(Run.scoreCard(R, ace).total, 6);               // 4 × 같은 눈 4개 1.5
  R.relics.push('ace');
  assert.equal(Run.scoreCard(R, ace).total, 48);              // 1의 눈 4개 × 8, × 1.5
  R.relics.push('pairs');
  assert.equal(Run.scoreCard(R, ace).total, 66);              // (32 + 4 × 3) × 1.5
  R.relics.push('quad');
  assert.equal(Run.scoreCard(R, ace).total, 132);             // 4개 이상 +100% (합연산), × 1.5
  R.relics = ['small'];
  assert.equal(Run.scoreCard(R, ace).total, 15);              // 4 × 2.5 × 1.5
  R.relics = ['flow'];
  R.C.dice = [1, 2, 3, 4, 5];
  assert.equal(Run.scoreCard(R, { u: 9302, cat: 'lstr', up: 0, kw: null }).total, 45);
  assert.equal(Run.scoreCard(R, { u: 9303, cat: 'sstr', up: 0, kw: null }).total, 25);
  R.relics = ['combo'];
  R.C.e.block = 0;
  R.C.hand[0] = { u: 9304, cat: 'lstr', up: 0, kw: null };
  assert.equal(Run.preview(R, 0, 'enemy').dmg, 60);
});
test('덱 방향 유물이 있으면 그 계열 카드가 더 자주 나온다', () => {
  const count = relics => { const R = run('rogue', 3); R.relics = relics; let n = 0; for (let k = 0; k < 400; k++) if (Run.isUpper(Run.rollCard(R, 2).cat)) n++; return n; };
  assert.ok(count(['ace', 'small']) > count([]) * 2);
});
test('승천: 단계가 쌓이며 적 · 회복 · 체력이 바뀐다', () => {
  const a0 = mk({ cls: 'warrior', seed: 9 }), a10 = mk({ cls: 'warrior', seed: 9, asc: 10 });
  assert.equal(a10.asc, 10);
  assert.ok(a10.maxHp < a0.maxHp);
  assert.ok(Run.restAmount(a10) < Run.restAmount(a0));
  Run.startCombat(a0, 'slime'); Run.startCombat(a10, 'slime');
  assert.ok(Run.atkOf(a10, 10) > Run.atkOf(a0, 10));
  assert.equal(Run.furyOf(a10).from, Run.furyOf(a0).from - 2);
  assert.equal(mk({ cls: 'warrior', asc: 99 }).asc, Run.ASC_MAX);
});
test('원정 도전과제: 요트 카드로 공격하면 기록된다', () => {
  const R = run('rogue');
  intoFight(R);
  Run.roll(R);
  R.C.dice = [6, 6, 6, 6, 6];
  R.C.e.hp = R.C.e.maxHp = 500;
  R.C.hand[0] = { u: 9401, cat: 'yacht', up: 0, kw: null };
  Run.playCard(R, 0, 'enemy');
  assert.ok(R.feats.includes('yacht'));
  assert.ok(Run.drainFx(R).some(f => f.type === 'feat' && f.id === 'yacht'));
});
test('유물 · 인장 · 징조 그림(relic-art.js): 16줄 × 16글자, 팔레트에 있는 글자만, 6색 이하, 있는 id', () => {
  const all = [...Object.entries(RELIC_ART).map(([id, a]) => [id, a, Run.relicInfo(id)]), ...Object.entries(SEAL_ART).map(([id, a]) => [id, a, Run.sealInfo(id)]), ...Object.entries(OMEN_ART).map(([id, a]) => [id, a, Run.omenInfo(id)])];
  for (const [id, a, known] of all) {
    assert.ok(known, `없는 id: ${id}`);
    assert.equal(a.rows.length, 16, `${id} 줄 수`);
    const pal = { k: 1, ...a.pal };
    assert.ok(Object.keys(pal).length <= 6, `${id} 색이 6개를 넘는다`);
    for (const row of a.rows) {
      assert.equal(row.length, 16, `${id} 줄 길이`);
      for (const ch of row) assert.ok(ch === '.' || pal[ch], `${id}: 팔레트에 없는 글자 ${ch}`);
    }
    for (const c of Object.values(a.pal)) assert.match(c, /^#[0-9A-Fa-f]{6}$/, `${id} 색 형식`);
  }
});
test('원정 준비(원정 밖 성장): 체력 · 골드 · 도구 · 물약 · 대표 카드 · 시작 유물', () => {
  const base = mk({ cls: 'warrior', seed: 5 });
  const R = mk({ cls: 'warrior', seed: 5, meta: { lv: { hp: 5, gold: 3, tools: 2, potion: 1, sharp: 1, relic: 1 } } });
  assert.equal(R.maxHp, base.maxHp + 10);
  assert.equal(R.gold, base.gold + 60);
  assert.equal(R.flip, base.flip + 1); assert.equal(R.nudge, base.nudge + 1);
  assert.deepEqual(R.potions, ['heal']);
  assert.equal(R.deck.at(-1).up, 1);
  assert.equal(R.phase, 'reward'); assert.equal(R.reward.kind, 'start');
  Run.takeReward(R, 0); Run.leaveReward(R);
  assert.equal(R.relics.length, 1); assert.equal(R.phase, 'map');
});
test('주사위 깎는 노인: 야추 한 턴 점수만큼 면을 깎고, 깎은 면이 굴림에 나온다', () => {
  assert.deepEqual(Run.carveCount([1, 1, 2, 2, 3]), { n: 1, score: 9, cat: 'choice' });
  assert.equal(Run.carveCount([3, 3, 2, 2, 5]).n, 2);   // 초이스 15
  assert.equal(Run.carveCount([6, 6, 6, 5, 5]).n, 3);
  assert.equal(Run.carveCount([4, 4, 4, 4, 4]).n, 4);
  const R = run('bard', 4);
  R.phase = 'event'; R.event = { id: 'carver', result: null, dice: null, fight: null };
  Run.eventChoose(R, 0);
  assert.throws(() => Run.eventHold(R, 0));                 // 굴리기 전엔 못 잡는다
  Run.eventRoll(R); Run.eventHold(R, 0); const kept = R.event.yacht.dice[0];
  Run.eventRoll(R); assert.equal(R.event.yacht.dice[0], kept);
  Run.eventStop(R);
  const n = R.pick.left;
  assert.ok(n >= 1 && n <= 4);
  for (let k = 0; k < n; k++) Run.carveFace(R, 0, k, 6);
  assert.equal(R.pick, null); assert.ok(R.event.result);
  assert.equal(Run.facesOf(R, 0).filter(v => v === 6).length, n + 1);   // 깎은 n면 + 원래 6의 면
  // 6면을 모두 6으로 깎은 주사위는 늘 6
  R.dfaces[1] = [6, 6, 6, 6, 6, 6];
  Run.eventLeave(R); intoFight(R);
  for (let k = 0; k < 20; k++) { R.C.rolled = false; R.C.rollsLeft = 3; R.C.held = R.C.held.map(() => false); Run.roll(R); assert.equal(R.C.dice[1], 6); }
});
test('예전 특수 주사위 · 주사위 칸은 별조각으로 돌려준다', () => {
  const p = Run.fixProgress({ stars: 5, lv: { slot: 2, hp: 1 }, dice: ['gold', 'twin'], equip: ['gold'] });
  assert.equal(p.stars, 5 + 80 + 120 + 60 + 150);
  assert.ok(!p.dice && !p.equip && !p.lv.slot); assert.equal(p.lv.hp, 1);
  assert.equal(Run.fixProgress(p).stars, 5 + 80 + 120 + 60 + 150);   // 한 번만
});
test('별조각: 지난 층 · 엘리트 · 보스 · 클리어, 승천이 높을수록 더', () => {
  const R = mk({ cls: 'rogue', seed: 1 });
  Object.assign(R.stats, { floors: 10, elites: 2, bosses: 1 });
  assert.equal(Run.starsOf(R), 20 + 8 + 10);
  R.asc = 5; R.won = true;
  assert.equal(Run.starsOf(R), Math.round((38 + 20) * 1.5));
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
  assert.ok(R.pick.opts.includes('up'));
  Run.chooseUpgrade(R, R.pick.opts.indexOf('up'));
  assert.equal(c.up, 1);
  assert.equal(R.phase, 'map');
});
test('카드 강화: 효과를 3개까지 새기고, 다 차면 더 강화할 수 없다', () => {
  const R = run('warrior');
  const c = R.deck.find(x => !Run.kwsOf(x).length);
  c.up = 1;
  for (let n = 1; n <= Run.KW_MAX; n++) {
    R.phase = 'rest';
    Run.startUpgrade(R);
    Run.pickDeck(R, c.u);
    assert.ok(!R.pick.opts.includes('up'));
    assert.equal(R.pick.opts.length, 3);
    Run.chooseUpgrade(R, 0);
    assert.equal(Run.kwsOf(c).length, n);
    assert.equal(new Set(Run.kwsOf(c)).size, n);       // 같은 효과는 두 번 붙지 않는다
  }
  assert.equal(Run.canUpgrade(c), false);
  assert.equal(Run.cardRarity(c), 3);
  // 여러 효과가 함께 동작한다
  const R2 = run('rogue');
  intoFight(R2);
  Run.roll(R2);
  R2.C.dice = [6, 6, 6, 6, 6];
  R2.hp = 10;
  R2.C.hand[0] = { u: 9501, cat: 'choice', up: 0, kws: ['vamp', 'gold', 'keep'] };
  const p = Run.preview(R2, 0, 'enemy');
  assert.equal(p.heal, 10); assert.equal(p.gold, 10);
});
test('상점 대장장이: 골드를 내고 상점마다 한 번 강화', () => {
  const R = run('warrior');
  R.phase = 'shop'; R.gold = 500; R.shop = { cards: [], relics: [], potions: [], tools: [], removed: false, smithed: false };
  const price = Run.smithPrice(R);
  Run.startSmith(R);
  const c = R.deck[0];
  Run.pickDeck(R, c.u);
  Run.chooseUpgrade(R, 0);
  assert.equal(R.gold, 500 - price);
  assert.equal(R.phase, 'shop');
  assert.throws(() => Run.startSmith(R));
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
      if (R.event.yacht) { Run.eventRoll(R); Run.eventStop(R); while (R.pick?.why === 'face') Run.carveFace(R, 0, R.pick.left - 1, 6 - (R.pick.left % 2)); }
      if (R.pick) { const c = R.deck.find(x => !x.up) || R.deck[0]; Run.pickDeck(R, c.u); if (R.pick?.opts) Run.chooseUpgrade(R, 0); }
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
      const R = mk({ cls, seed: 100 + k });
      Run.botRun(R, mulberry(k + 1), 6);
      assert.ok(R.ended, `${cls} 원정이 끝나지 않았다 (${R.phase})`);
      assert.ok(R.won || R.hp === 0);
    }
  }
});
test('같은 시드 · 같은 선택이면 같은 결과, 상태는 JSON 으로 저장된다', () => {
  const a = mk({ cls: 'outlaw', seed: 42 });
  const b = mk({ cls: 'outlaw', seed: 42 });
  Run.botRun(a, mulberry(9), 6);
  Run.botRun(b, mulberry(9), 6);
  assert.equal(a.hp, b.hp);
  assert.equal(a.stats.floors, b.stats.floors);
  const R = mk({ cls: 'rogue', seed: 5 });
  intoFight(R);
  Run.roll(R);
  const copy = JSON.parse(JSON.stringify(R));
  Run.playCard(copy, 0, 'enemy');
  assert.ok(copy.C.turn >= 1);
});

console.log('\n덱 빌딩 유물');
const fight = (relics, setup) => { const R = mk({ cls: 'bard', seed: 4 }); R.relics.push(...relics); Run.startCombat(R, 'slime'); setup?.(R); return R; };
test('자석 주사위: 같은 눈 3개면 다른 주사위 1개가 그 눈으로 (턴마다 1번)', () => {
  let hit = 0;
  for (let s = 1; s < 200 && !hit; s++) {
    const R = mk({ cls: 'warrior', seed: s }); R.relics.push('magnet'); Run.startCombat(R, 'slime');
    Run.roll(R);
    const cnt = [0, 0, 0, 0, 0, 0, 0]; R.C.dice.forEach(v => cnt[v]++);
    if (R.C.magnet) { hit++; assert.ok(Math.max(...cnt) >= 4); assert.ok(Run.drainFx(R).some(f => f.type === 'lucky' && f.why === 'magnet')); }
  }
  assert.ok(hit);
});
test('저울추 · 묵주 · 도서관 열쇠', () => {
  const R = fight(['weight']); R.C.rolled = true; R.C.dice = [1, 2, 3, 4, 6]; R.C.rollsLeft = 2;
  assert.equal(Run.scoreCard(R, { u: 1, cat: 'choice', up: 0 }).total, 16 + 12);
  const T = fight(['rosary']); T.C.rolled = true; T.C.dice = [6, 6, 6, 1, 2];
  T.deck = T.deck.slice(0, 8);
  assert.equal(Run.scoreCard(T, { u: 1, cat: 'sixes', up: 0 }).parts.find(p => p.ko === '수도승의 묵주').amt, 5);
  const L = fight(['libkey']); const h0 = Run.handSize(L);
  while (L.deck.length < Run.LIBKEY_MIN) L.deck.push({ ...L.deck[0], u: 900 + L.deck.length });
  assert.equal(Run.handSize(L), h0 + 1);
});
test('불씨 항아리 · 피의 성배 · 성벽 설계도 · 보존 상자', () => {
  const R = fight(['ember']); R.C.rolled = true; R.C.dice = [6, 6, 6, 6, 6]; R.C.e.hp = 999;
  R.C.hand[0] = { u: 7001, cat: 'sixes', up: 0, kws: ['burn'] };
  Run.playCard(R, 0, 'enemy');
  assert.equal(R.C.e.burn, Math.floor(60 / 4) + 3);   // 30 × 같은 눈 5개 2
  const B = fight(['bloodcup']); B.C.rolled = true; B.C.dice = [6, 6, 6, 6, 6]; B.C.e.hp = 999; B.hp = B.maxHp;
  B.C.hand[0] = { u: 7002, cat: 'sixes', up: 0, kws: ['vamp'] };
  const blk0 = B.C.block; Run.playCard(B, 0, 'enemy');
  assert.ok(Run.drainFx(B).some(f => f.type === 'play' && f.cup === 30));
  const G = fight(['rampart']); G.C.rolled = true; G.C.dice = [6, 6, 6, 6, 6]; G.C.e.hp = 999;
  G.C.hand[0] = { u: 7003, cat: 'sixes', up: 0, kws: ['guard'] };
  Run.playCard(G, 0, 'self');
  const got = Math.floor(Math.round(30 * 1.5 + 0) / 2);
  if (G.phase === 'combat') assert.ok(Run.drainFx(G).some(f => f.type === 'heroBlock' && f.why === 'rampart' && f.n >= got - 20));
  const K = fight(['keepbox']); K.C.hand[0] = { u: 7004, cat: 'sixes', up: 0, kws: ['keep'] };
  K.C.rolled = true; K.C.dice = [1, 1, 1, 1, 1]; K.C.e.hp = 999;
  Run.playCard(K, 1, 'self');                  // 보존 카드는 손패에 남는다 → 다음 턴 첫 카드 +15%
  if (K.phase === 'combat') { assert.equal(K.C.keepUp, 0.15); K.C.rolled = true; K.C.dice = [6, 6, 6, 6, 6]; assert.ok(Run.scoreCard(K, { u: 1, cat: 'sixes', up: 0 }).parts.some(p => p.ko === '보존 상자')); }
});

test('원정 도전과제: 원정 기록이 진행도로 옮겨지고(늘기만), 원정이 없는 곳에서는 숨긴다', () => {
  const p = Run.blankProgress();
  Object.assign(p.best, { runs: 12, wins: 2, top: 21, cls: { gambler: { runs: 6, wins: 1 }, monk: { runs: 6, wins: 0 } }, asc: { gambler: 5 }, feats: ['act1', 'clear'] });
  const ach = AC.syncRunAch({}, p);
  assert.deepEqual(ach.m, { 'r:top': 21, 'r:wins': 2, 'r:runs': 12, 'r:cls': 1, 'r:asc': 5, 'r:feats': 2 });
  for (const id of ['run_act1', 'run_act2', 'run_win_1', 'run_runs_1', 'run_asc_1', 'run_asc_2']) assert.ok(AC.achDone(AC.achInfo(id), ach), id);
  assert.ok(!AC.achDone(AC.achInfo('run_win_2'), ach));
  p.best.runs = 3; AC.syncRunAch(ach, p); assert.equal(ach.m['r:runs'], 12);
  const run = AC.ACHIEVEMENTS.filter(a => a.cat === 'run');
  assert.ok(run.length >= 10 && run.every(a => !AC.achShown(a, {}) && AC.achShown(a, { run: true })));
  assert.ok(AC.achClaimable(ach, {}).every(a => a.cat !== 'run'));
});

console.log('\n인장 · 새 유물 · 합연산 · 막 징조');
const duel = (relics = [], setup) => { const R = mk({ cls: 'bard', seed: 4 }); relics.forEach(id => Run.gainRelic(R, id)); Run.startCombat(R, 'slime'); R.C.e.hp = 999; R.C.rolled = true; setup?.(R); return R; };
test('합연산: 유물 +% 끼리 더하고, 카드 자신의 강화 · 속공만 곱한다', () => {
  const R = duel(['glasscannon', 'bloodpact']); R.C.dice = [6, 6, 6, 1, 2]; R.C.rollNo = 1;
  const sc = Run.scoreCard(R, { u: 1, cat: 'sixes', up: 1, kws: ['quick'] });
  // 18 × (1 + 0.6 + 0.5) = 37.8 → 38, 강화 ×1.3 → 49, 속공 ×1.5 → 74
  assert.equal(sc.total, Math.round(Math.round(Math.round(38 * 1.2) * 1.3) * 1.5));   // 같은 눈 3개 · 강화 · 속공은 곱
  assert.ok(sc.parts.find(p => p.ko === '강화').mul);
});
test('인장: 해 ×1.5 점수 · 구름 보호막 20 · 별 골드 15 · 달은 일회성 복사본', () => {
  const R = duel([], R => { R.C.dice = [6, 6, 6, 6, 6]; });
  R.C.hand[0] = { u: 8001, cat: 'sixes', up: 0, kws: [], seal: 'sun' };
  assert.equal(Run.preview(R, 0, 'enemy').dmg, 90);            // 30 × 같은 눈 5개 2 × 해 1.5
  R.C.hand[1] = { u: 8002, cat: 'sixes', up: 0, kws: [], seal: 'cloud' };
  assert.equal(Run.preview(R, 1, 'self').block - Run.preview(R, 1, 'self').def, 20);
  const M = duel([], R => { R.C.dice = [6, 6, 6, 6, 6]; });
  M.deck.push({ u: 8003, cat: 'sixes', up: 0, kws: [], seal: 'moon' });
  M.C.hand[0] = { u: 8003, cat: 'sixes', up: 0, kws: [], seal: 'moon' };
  Run.playCard(M, 0, 'enemy');
  assert.equal(M.deck.find(c => c.u === 8003).seal, null);         // 인장은 덱에서도 사라진다
  const copy = M.C.hand.find(c => c.temp);
  assert.ok(copy && copy.cat === 'sixes');                          // 다음 턴 손패에 달빛 복사본
  M.C.rolled = true; M.C.dice = [6, 6, 6, 6, 6];
  const n0 = M.C.draw.length + M.C.discard.length + M.C.hand.length;
  Run.playCard(M, M.C.hand.indexOf(copy), 'enemy');
  assert.ok(![...M.C.draw, ...M.C.discard, ...M.C.hand].some(c => c.u === copy.u));   // 쓰고 나면 사라진다
});
test('상점 인장: 사면 붙일 카드를 고르고, 이미 붙은 카드엔 못 붙인다', () => {
  const R = mk({ cls: 'monk', seed: 2 }); R.phase = 'shop'; R.gold = 200; R.shop = { cards: [], relics: [], potions: [], tools: [], seals: [{ id: 'star', price: 30, sold: false }], removed: false, smithed: false };
  Run.buy(R, 'seal', 0);
  assert.equal(R.pick.why, 'seal');
  Run.pickDeck(R, R.deck[0].u);
  assert.equal(R.deck[0].seal, 'star'); assert.equal(R.gold, 170); assert.ok(R.shop.seals[0].sold);
});
test('메아리 북 · 만화경 · 페어 반지 · 장인의 망치', () => {
  const R = duel(['echodrum', 'kaleido', 'hammer'], R => { R.C.dice = [6, 6, 6, 6, 6]; });
  const six = u => ({ u, cat: 'sixes', up: 0, kws: [] });
  R.C.hand = [six(1), { ...six(2), kws: ['keep'] }, { u: 3, cat: 'choice', up: 0, kws: ['keep'] }];
  Run.playCard(R, 0, 'enemy');
  R.C.rolled = true; R.C.dice = [6, 6, 6, 6, 6];
  assert.ok(Run.scoreCard(R, R.C.hand.find(c => c.u === 2)).parts.some(p => p.ko === '메아리 북'));
  assert.equal(R.hammer.sixes, 1);
  const ci = R.C.hand.findIndex(c => c.cat === 'choice');
  assert.ok(Run.preview(R, ci, 'enemy').kal >= 4);                 // 다른 족보 → 만화경
  const P = duel(['pairring'], R => { R.C.dice = [6, 6, 6, 1, 2]; R.C.hand = [six(1), six(2)]; });
  assert.ok(Run.scoreCard(P, P.C.hand[0]).parts.some(p => p.ko === '페어 반지'));
});
test('균형의 추: 1을 6으로 셀 수 있다', () => {
  const R = duel(['balance'], R => { R.C.dice = [6, 6, 6, 6, 1]; });
  assert.equal(Run.scoreCard(R, { u: 1, cat: 'yacht', up: 0, kws: [] }).base, 50);
});
test('엘리트는 유물 3개 중 고르기, 감정사의 돋보기면 4개', () => {
  for (const [rel, n] of [[[], 3], [['loupe'], 4]]) {
    const R = mk({ cls: 'monk', seed: 9 }); rel.forEach(id => Run.gainRelic(R, id));
    Run.startCombat(R, Run.ACT_INFO[1].elite[0]); R.C.e.hp = 1; R.C.rolled = true; R.C.dice = [6, 6, 6, 6, 6]; R.C.hand[0] = { u: 9901, cat: 'choice', up: 0, kws: [] };
    Run.playCard(R, 0, 'enemy');
    const it = R.reward.items.find(x => x.t === 'relicPick');
    assert.equal(it.opts.length, n);
  }
});
test('초이스는 실버 등급 · 일반 카드 보상에서는 나오지 않는다', () => {
  assert.equal(Run.cardRarity({ cat: 'choice', up: 0, kws: [] }), 2);
  const R = mk({ cls: 'monk', seed: 3 });
  for (let k = 0; k < 200; k++) assert.notEqual(Run.rollCard(R, 1).cat, 'choice');
});
test('막 징조: 막마다 2장 중 1장, 고르기 전엔 지도를 못 움직인다', () => {
  const R = Run.createRun({ cls: 'monk', seed: 5 });
  assert.equal(R.omenOpts.length, 2);
  assert.throws(() => Run.enterNode(R, Run.nextNodes(R)[0]));
  const id = R.omenOpts[1];
  Run.chooseOmen(R, 1);
  assert.equal(R.omen, id); assert.equal(R.omenOpts, null);
  Run.enterNode(R, Run.nextNodes(R)[0]);
  const F = mk({ cls: 'monk', seed: 5 }); F.omen = 'feast'; Run.startCombat(F, 'slime'); F.C.rolled = true; F.C.dice = [6, 6, 6, 1, 2];
  assert.ok(Run.scoreCard(F, { u: 1, cat: 'sixes', up: 0, kws: [] }).parts.some(p => p.ko === '피의 축제'));
});
test('새 유물을 모두 가진 봇도 원정을 끝까지 진행한다 (막히지 않음)', () => {
  for (const cls of ['gambler', 'mage', 'sharper']) {
    const R = Run.createRun({ cls, seed: 11 });
    for (const r of Run.RELICS.slice(-29)) Run.gainRelic(R, r.id);
    Run.botRun(R, mulberry(3), 4);
    assert.ok(R.ended);
  }
});

test('시작 덱: 초이스 없음 (직업 대표 카드는 그대로) · 특별 카드 1장 · 원정 준비 인장 상자', () => {
  const R = mk({ cls: 'gambler', seed: 1 });
  assert.equal(R.deck.filter(c => c.cat === 'choice').length, 0);
  const M = mk({ cls: 'monk', seed: 1 });
  assert.equal(M.deck.filter(c => c.cat === 'choice').length, 1);     // 수도승 대표 카드(초이스)
  const seen = new Set();
  for (let s = 1; s <= 40; s++) seen.add(mk({ cls: 'gambler', seed: s }).deck.find(c => Run.isSpecial(c.cat)).cat);
  assert.equal(seen.size, 3);
  const S = mk({ cls: 'warrior', seed: 2, meta: { lv: { seal: 3 }, equip: [] } });
  assert.equal(S.deck.filter(c => c.seal).length, 3);
});

test('금화 훔치기: 함께 오는 공격을 다 막으면 못 훔친다', () => {
  for (const [blk, lost] of [[999, 0], [0, 10]]) {
    const R = mk({ cls: 'rogue', seed: 3 }); R.gold = 50;
    Run.startCombat(R, 'goblin'); R.C.e.hp = 999;
    R.C.e.intent = { ko: '주머니 털기', atk: 6, steal: 10 };
    R.C.rolled = true; R.C.dice = [1, 1, 1, 1, 1]; R.C.block = blk;
    R.C.hand[0] = { u: 9911, cat: 'sixes', up: 0, kws: [] };   // 0점 카드
    Run.playCard(R, 0, 'enemy');
    assert.equal(50 - R.gold, lost);
  }
});

test('2막: 3층은 모두 이벤트이고, 2막의 첫 이벤트는 주사위 깎는 노인 · 막마다 7층 + 보스', () => {
  assert.equal(Run.ROWS, 7);
  const R = mk({ cls: 'monk', seed: 6 }); R.phase = 'map'; R.reward = null;
  R.act = 2; R.map = Run.genMap(R); R.pos = null; R.path = [];
  assert.ok(R.map.nodes.filter(n => n.row === 3).every(n => n.type === 'event'));
  const r2 = R.map.nodes.find(n => n.row === 2 && n.next.some(j => R.map.nodes[j].row === 3));
  R.pos = r2.id;
  Run.enterNode(R, r2.next[0]);
  assert.equal(R.event.id, 'carver');
  assert.equal(Math.max(...R.map.nodes.map(n => n.row)), Run.ROWS + 1);
});

console.log('\n특별 카드 (에이스 · 듀스 · 트레이)');
test('특별 카드는 실버 등급, 일반(브론즈) 보상에는 나오지 않는다', () => {
  const R = run('rogue', 5);
  for (const cat of Run.SPECIAL_CATS) assert.equal(Run.cardRarity({ cat, kws: [] }), 2);
  for (let k = 0; k < 300; k++) assert.ok(!Run.isSpecial(Run.rollCard(R, 1).cat));
  let n = 0; for (let k = 0; k < 300; k++) if (Run.isSpecial(Run.rollCard(R, 2).cat)) n++;
  assert.ok(n > 0);
});
test('에이스 <주인공>: 낼 때마다 기본 점수 +2 영구 (망토 +3, 달빛 복사본도 원래 카드를 키운다)', () => {
  const R = duel([], R => { R.C.dice = [1, 1, 5, 5, 6]; });
  R.deck.push({ u: 7001, cat: 'ones', up: 0, kws: [], seal: 'moon' });
  R.C.hand[0] = { u: 7001, cat: 'ones', up: 0, kws: [], seal: 'moon' };
  assert.equal(Run.scoreCard(R, R.C.hand[0]).total, 2);
  Run.playCard(R, 0, 'enemy');
  assert.equal(R.deck.find(c => c.u === 7001).grow, 2);
  const copy = R.C.hand.find(c => c.temp);
  R.C.rolled = true; R.C.dice = [2, 3, 4, 5, 6];
  assert.equal(Run.scoreCard(R, copy).total, 2);                  // 1이 없어도 자란 만큼은 나온다
  Run.playCard(R, R.C.hand.indexOf(copy), 'enemy');
  assert.equal(R.deck.find(c => c.u === 7001).grow, 4);
  const M = duel(['cape'], R => { R.C.dice = [1, 2, 3, 4, 6]; });
  M.deck.push({ u: 7002, cat: 'ones', up: 0, kws: [] }); M.C.hand[0] = { u: 7002, cat: 'ones', up: 0, kws: [] };
  Run.playCard(M, 0, 'enemy');
  assert.equal(M.deck.find(c => c.u === 7002).grow, 3);
});
test('듀스 <두배>: 2,4,8,16,32 (세포배양관이면 4 ~ 64), 같은 눈 보너스 없음', () => {
  const R = duel([]);
  const two = { u: 7003, cat: 'twos', up: 0, kws: [] };
  for (const [d, v] of [[[2, 1, 3, 4, 5], 2], [[2, 2, 3, 4, 5], 4], [[2, 2, 2, 4, 5], 8], [[2, 2, 2, 2, 5], 16], [[2, 2, 2, 2, 2], 32], [[1, 3, 4, 5, 6], 0]]) {
    R.C.dice = d; assert.equal(Run.scoreCard(R, two).total, v);
  }
  const C = duel(['culture'], R => { R.C.dice = [2, 2, 2, 2, 2]; });
  assert.equal(Run.scoreCard(C, two).total, 64);
  C.C.dice = [2, 1, 3, 4, 5]; assert.equal(Run.scoreCard(C, two).total, 4);
});
test('트레이 <삼위일체>: 점수만큼 공격 · 방어 · 골드, 나눌 수 없다 (프리즘이면 3배를 나눈다)', () => {
  const R = duel([], R => { R.C.dice = [3, 3, 3, 5, 6]; R.C.e.block = 0; });
  R.C.hand[0] = { u: 7004, cat: 'threes', up: 0, kws: [] };
  const S = Run.scoreCard(R, R.C.hand[0]).total;
  for (const want of ['enemy', 'self', 3]) {
    const p = Run.preview(R, 0, want);
    assert.equal(p.atk, S); assert.equal(p.def, S); assert.equal(p.gold, S); assert.equal(p.dmg, S);
  }
  const g0 = R.gold;
  Run.playCard(R, 0, 'self');
  assert.equal(R.gold, g0 + S);
  const P = duel(['prism'], R => { R.C.dice = [3, 3, 3, 5, 6]; R.C.e.block = 0; });
  P.C.hand[0] = { u: 7005, cat: 'threes', up: 0, kws: [] };
  const q = Run.preview(P, 0, 10, null, 5);
  assert.equal(q.atk, 10); assert.equal(q.gold, 5); assert.equal(q.def, S * 3 - 15);
  P.C.e.intent = { ko: '테스트', atk: 6 };
  const c = Run.coverAtk(P, 0);
  assert.ok(c.full && Math.abs(c.atk - c.gold) <= 1);             // 딱 막기: 남은 몫은 공격 · 골드 반반
  assert.equal(Run.takenAfter(P, Run.preview(P, 0, c.atk, null, c.gold)), 0);
});
test('특별 카드 전용 유물: 그 카드가 덱에 있으면 더 잘 나온다', () => {
  const freq = (deckCat) => { const R = run('rogue', 6); R.deck = R.deck.filter(c => !Run.isSpecial(c.cat)); if (deckCat) R.deck.push({ u: 999, cat: deckCat, up: 0, kws: [] }); let n = 0; for (let k = 0; k < 3000; k++) if (Run.rollRelic(R, 2) === 'cape') n++; return n; };
  assert.ok(freq('ones') > freq(null));
});

test('시험 원정: 특별 카드 3장 · 전용 유물 3개를 들고 출발', () => {
  const R = Run.trialKit(mk({ cls: 'gambler', seed: 3 }));
  assert.deepEqual(R.deck.filter(c => Run.isSpecial(c.cat)).map(c => c.cat).sort(), ['ones', 'threes', 'twos']);
  for (const id of ['cape', 'culture', 'prism']) assert.ok(Run.hasRelic(R, id));
});
test('시험 원정 샌드박스: 유물 · 카드 · 물약 · 징조 · 적 · 주사위 · 무적 (시험 원정에서만)', () => {
  const N = mk({ cls: 'gambler', seed: 4 });
  assert.throws(() => Run.sandbox.relic(N, 'coin'));
  const R = Run.trialKit(mk({ cls: 'monk', seed: 4 }));
  Run.sandbox.relic(R, 'coin'); assert.ok(Run.hasRelic(R, 'coin'));
  Run.sandbox.relic(R, 'coin'); assert.ok(!Run.hasRelic(R, 'coin'));
  const c = Run.sandbox.card(R, { cat: 'yacht', up: 1, kws: ['guard', 'vamp'], seal: 'sun' });
  assert.ok(R.deck.some(x => x.u === c.u && x.seal === 'sun' && x.up));
  Run.sandbox.potion(R, 'fire'); assert.ok(R.potions.includes('fire'));
  Run.sandbox.omen(R, 'glass'); assert.equal(R.omen, 'glass');
  Run.sandbox.act(R, 3);
  Run.sandbox.fight(R, 'orc');
  assert.equal(R.phase, 'combat'); assert.equal(R.C.e.id, 'orc');
  Run.roll(R);
  Run.sandbox.dice(R, 0, 6); assert.equal(R.C.dice[0], 6);
  Run.sandbox.god(R, true); R.hp = 1;
  R.C.e.intent = { ko: '테스트', atk: 999 }; R.C.block = 0;
  Run.playCard(R, 0, 'self');
  assert.equal(R.hp, 1); assert.ok(!R.ended);                     // 무적: 죽지 않는다
  Run.sandbox.foeHp(R, 1); R.C.rolled = true; R.C.dice = [6, 6, 6, 6, 6]; R.C.e.block = 0; R.C.hand[0] = { u: 7777, cat: 'choice', up: 0, kws: [] };
  Run.playCard(R, 0, 'enemy');
  assert.equal(R.phase, 'reward');                                 // 3막 보스여도 원정이 끝나지 않는다
  Run.leaveReward(R);
  assert.equal(R.phase, 'map'); assert.equal(R.act, 3);
  Run.sandbox.removeCard(R, c.u); assert.ok(!R.deck.some(x => x.u === c.u));
});
console.log('\n기록 · 별조각 (서버 다시 돌리기)');
test('행동 기록을 다시 돌리면 같은 판이 나온다', () => {
  for (const [cls, seed] of [['gambler', 3], ['warrior', 11], ['bard', 21], ['sharper', 8]]) {
    const meta = { lv: { relic: 1, hp: 2 }, equip: [] };
    const R = Run.createRun({ cls, seed, meta });
    Run.botRun(R, mulberry(seed), 4);
    const Rx = Run.replay({ seed, cls, meta, acts: R.acts });
    assert.equal(Rx.hp, R.hp); assert.equal(Rx.won, R.won); assert.equal(Rx.act, R.act);
    assert.equal(Run.starsOf(Rx), Run.starsOf(R));
    assert.deepEqual(Rx.feats, R.feats);
  }
});
test('고친 행동 기록은 맞지 않는다', () => {
  const R = Run.createRun({ cls: 'monk', seed: 4 });
  Run.botRun(R, mulberry(4), 4);
  const acts = R.acts.slice(0, -1);
  const Rx = Run.replay({ seed: 4, cls: 'monk', acts });
  assert.ok(!Rx.ended || Rx.hp !== R.hp || Rx.won !== R.won || Run.starsOf(Rx) !== Run.starsOf(R) || Rx.stats.turns !== R.stats.turns);
  assert.throws(() => Run.replay({ seed: 4, cls: 'monk', acts: [['cheat']] }));
  // 다른 시드로는 같은 기록이 통하지 않는다
  assert.throws(() => { const Ry = Run.replay({ seed: 5, cls: 'monk', acts: R.acts }); if (!Ry.ended || Ry.hp !== R.hp) throw new Error('다름'); });
});
test('기록에 더하기 · 사기 · 넣기', () => {
  const p = Run.blankProgress();
  const R = Run.createRun({ cls: 'gambler', seed: 9 });
  Run.giveUp(R);
  const out = Run.recordRun(p, R);
  assert.equal(p.best.runs, 1); assert.equal(p.stars, out.stars);
  p.stars = 1000;
  assert.equal(Run.buyProgress(p, 'meta', 'nope'), '없는 강화예요.');
  assert.equal(Run.buyProgress(p, 'meta', 'seal'), null);
  assert.equal(p.lv.seal, 1); assert.equal(p.stars, 950);
  p.stars = 0;
  assert.ok(Run.buyProgress(p, 'meta', 'seal'));                 // 별조각 부족
  assert.ok(Run.buyProgress(p, 'die', 'gold'));                  // 특수 주사위는 없다
});
test('출발 유물은 직업마다 하나로 정해져 있다', () => {
  for (const cls of Object.keys(Run.RUN_CLASSES)) {
    const id = Run.START_RELIC[cls];
    assert.ok(Run.relicInfo(id), cls);
    const R = Run.createRun({ cls, seed: 1, meta: { lv: { relic: 1 }, equip: [] } });
    assert.ok(R.relics.includes(id) || (R.pickRelic || []).includes?.(id) || JSON.stringify(R).includes(`"${id}"`), cls);
  }
});

console.log(`\n${passed} 통과, ${failed} 실패`);
if (failed) process.exit(1);
