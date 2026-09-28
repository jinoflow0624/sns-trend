// 대화하기(연애 시뮬레이션풍) 대본 · 장면 고르기 · 친밀도
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATES } from '../src/dates.js';
import { NPCS, NPC_TASTE, TASTE_HINT, ITEMS } from '../src/data.js';
import { pickScene, choose, heartsOf } from '../src/logic/date.js';
import { getMap, isSolid } from '../src/world/maps.js';
import { mkGame, settle } from './helpers.mjs';

const EMOTES = new Set(['heart', 'happy', 'surprise', 'sweat', 'sad']);

test('대본: 모든 NPC 에 대화하기가 있고, 장면 형식이 맞다', () => {
  assert.deepEqual(Object.keys(DATES).sort(), Object.keys(NPCS).sort());
  for (const [id, D] of Object.entries(DATES)) {
    assert.ok(D.topics.length >= 3, id);
    assert.ok(D.theme.length === 2 && D.profile, id);
    for (const sc of [...D.topics, ...Object.values(D.events)]) {
      assert.ok(sc.lines.length >= 1, id);
      assert.ok(sc.choices.length >= 2, id);
      for (const [t, pts, reply, emote] of sc.choices) {
        assert.ok(t && reply, id);
        assert.equal(typeof pts, 'number');
        assert.ok(EMOTES.has(emote), `${id}: ${emote}`);
      }
      // 연애 대상이 아니면 두근거리는 반응은 없다
      if (!D.romance) assert.ok(sc.choices.every(c => c[3] !== 'heart'), id);
    }
  }
  // 아이·어르신은 연애 대상이 아니다
  for (const id of ['minsu', 'sunja', 'mayor']) assert.equal(DATES[id].romance, false);
});

test('새 NPC 두 명: 취향 · 힌트 · 마을/호수 자리', () => {
  for (const id of ['juhyuk', 'karina']) {
    assert.ok(NPCS[id] && NPC_TASTE[id] && TASTE_HINT[id], id);
    for (const k of [...NPC_TASTE[id].love, ...NPC_TASTE[id].like, ...NPC_TASTE[id].dislike]) if (!k.startsWith('type:')) assert.ok(ITEMS[k], k);
  }
  const town = getMap('town', { houseLv: 1, seedKey: 'x' });
  const h = town.npcs.find(n => n.id === 'juhyuk');
  assert.ok(h && !isSolid(town, h.x, h.y));
  const lake = getMap('lake', { houseLv: 1, seedKey: 'x' });
  const a = lake.npcs.find(n => n.id === 'karina');
  a.route.forEach(([x, y], i) => {
    const [x2, y2] = a.route[(i + 1) % a.route.length];
    for (let k = 0; k <= 10; k++) {
      const px = x + (x2 - x) * k / 10; const py = y + (y2 - y) * k / 10;
      assert.ok(!isSolid(lake, px, py), `카리나 경로 (${px},${py})`);
    }
  });
});

test('장면: 하트가 차면 특별 이야기가 먼저, 한 번 보면 다시 안 나온다', () => {
  const f = { pts: 0 };
  assert.ok(pickScene('bomi', f, 1).key.startsWith('t'));
  f.pts = 150; // 하트 3
  const e = pickScene('bomi', f, 1);
  assert.equal(e.event, 3);
  const r = choose(f, e, 0, 1);
  assert.ok(r.counted && r.gain === 30);
  assert.ok(f.ev[3]);
  assert.ok(pickScene('bomi', f, 1).key.startsWith('t'), '본 이야기는 다시 안 나온다');
  assert.equal(pickScene('nobody', f, 1), null);
});

test('친밀도: 하루 한 번만 오르고, 같은 날 다시 말 걸면 다른 이야기', () => {
  const f = { pts: 0 };
  const s1 = pickScene('juhyuk', f, 5);
  const r1 = choose(f, s1, 0, 5);
  assert.equal(r1.gain, s1.choices[0][1]);
  const s2 = pickScene('juhyuk', f, 5, 1);
  assert.notEqual(s2.key, s1.key);
  const r2 = choose(f, s2, 0, 5);
  assert.equal(r2.gain, 0, '같은 날은 오르지 않는다');
  assert.equal(r2.counted, false);
  const r3 = choose(f, pickScene('juhyuk', f, 6), 0, 6);
  assert.ok(r3.gain > 0, '다음 날엔 다시 오른다');
  // 나쁜 대답은 깎인다 (0 아래로는 안 내려감)
  const g = { pts: 2 };
  let day = 9;
  while (!pickScene('bomi', g, day).choices.some(c => c[1] < 0)) day++;
  const bad = pickScene('bomi', g, day);
  const k = bad.choices.findIndex(c => c[1] < 0);
  choose(g, bad, k, day);
  assert.equal(g.pts, 0);
  assert.equal(heartsOf({ pts: 999 }), 10);
});

test('게임: 대화하기 → 선택 → 친밀도와 하트', async () => {
  const { g } = await mkGame({ name: '지노' });
  const s = g.dateScene('karina');
  assert.ok(s.lines.every(t => !t.includes('{name}')), '이름이 들어간다');
  assert.ok(s.counts);
  const r = g.dateChoose(s, 0);
  assert.equal(g.me.friends.karina.pts, s.choices[0][1]);
  assert.ok(!g.dateScene('karina').counts, '오늘은 더 안 오른다');
  assert.ok(r.reply);
  g.stop();
});

test('프로필 사진: portraits.json 에 적힌 파일이 모두 있다', async () => {
  const { readFile, stat } = await import('node:fs/promises');
  const dir = new URL('../assets/portraits/', import.meta.url);
  const list = JSON.parse(await readFile(new URL('portraits.json', dir), 'utf8'));
  for (const [id, file] of Object.entries(list)) {
    assert.ok(NPCS[id], `없는 NPC: ${id}`);
    const s = await stat(new URL(file, dir));
    assert.ok(s.size > 1000 && s.size < 400_000, `${file} 크기 ${s.size}`);
  }
});

// ── 가까운 사이 · 결혼 · 신혼집 ──────────────────────────────────────────────
const { CLOSE, MARRIED } = await import('../src/dates.js');
const { canPropose, isCandidate } = await import('../src/logic/date.js');
const { NEST_LEVELS, MARRY_PTS } = await import('../src/data.js');
const Inv = await import('../src/logic/inventory.js');

test('대본: 하트 5개 이야기(모든 NPC)와 결혼 이야기(결혼 상대만)', () => {
  assert.deepEqual(Object.keys(CLOSE).sort(), Object.keys(NPCS).sort());
  for (const [id, list] of Object.entries(CLOSE)) {
    assert.ok(list.length >= 2, id);
    for (const sc of list) for (const c of sc.choices) assert.ok(EMOTES.has(c[3]), id);
    if (!DATES[id].romance) assert.ok(list.every(sc => sc.choices.every(c => c[3] !== 'heart')), `연애 대상 아닌 ${id}`);
  }
  const spouses = Object.keys(NPCS).filter(id => NPCS[id].spouse).sort();
  assert.deepEqual(Object.keys(MARRIED).sort(), spouses);
  for (const id of ['sunja', 'mayor', 'kang', 'minsu']) assert.equal(NPCS[id].spouse, false, `${id} 는 결혼 상대가 아니다`);
  for (const id of spouses) {
    assert.ok(MARRIED[id].accept.length >= 2 && MARRIED[id].lines.length >= 3 && MARRIED[id].topics.length >= 2, id);
    assert.ok(DATES[id].romance, id);
  }
});

test('장면: 하트 5개부터 가까운 이야기, 결혼하면 부부 이야기', () => {
  const low = new Set(); const high = new Set();
  for (let d = 0; d < 40; d++) {
    low.add(pickScene('bomi', { pts: 100, ev: { 3: 1 } }, d).key[0]);
    high.add(pickScene('bomi', { pts: 260, ev: { 3: 1 } }, d).key[0]);
  }
  assert.ok(!low.has('c'));
  assert.ok(high.has('c') && high.has('t'));
  const wed = new Set();
  for (let d = 0; d < 20; d++) wed.add(pickScene('bomi', { pts: 600, ev: { 3: 1, 6: 1 } }, d, 0, { married: true }).key[0]);
  assert.ok(wed.has('m') && !wed.has('t'));
});

test('청혼 조건: 하트 10개 · 반지 · 다른 성별 · 한 번만 · 어르신 제외', () => {
  const me = { gender: 'm', friends: { bomi: { pts: MARRY_PTS }, juhyuk: { pts: MARRY_PTS }, sunja: { pts: MARRY_PTS } } };
  assert.ok(canPropose(me, 'bomi', true).ok);
  assert.ok(!canPropose(me, 'bomi', false).ok, '반지 필요');
  assert.ok(!canPropose(me, 'juhyuk', true).ok, '같은 성별');
  assert.ok(!canPropose(me, 'sunja', true).ok, '어르신');
  assert.ok(!canPropose({ ...me, friends: { bomi: { pts: 499 } } }, 'bomi', true).ok, '하트 모자람');
  assert.ok(!canPropose({ ...me, gender: null }, 'bomi', true).ok, '성별 먼저');
  assert.ok(!canPropose({ ...me, spouse: { id: 'rea' } }, 'bomi', true).ok, '이미 결혼');
  assert.ok(isCandidate({ gender: 'f' }, 'juhyuk') && !isCandidate({ gender: 'f' }, 'bomi'));
});

test('게임: 결혼 → 신혼집 터 → 짓기 · 키우기 → 아침 선물', async () => {
  const { g } = await mkGame({ name: '지노' });
  // 결혼 전엔 신혼집 터로 못 간다
  g.takeWarp({ to: 'nest_yard' });
  assert.equal(g.map.id, 'farm');
  g.setGender('m');
  g.friendOf('karina').pts = MARRY_PTS;
  assert.ok(!g.propose('karina').ok, '반지가 없으면 불가');
  Inv.give(g.me, 'ring', 1);
  const r = g.propose('karina');
  assert.ok(r.ok && r.lines.every(t => !t.includes('{name}')));
  assert.equal(g.me.spouse.id, 'karina');
  assert.ok(g.talk('karina').line, '결혼 뒤 인사');
  g.setGender('f');
  assert.equal(g.me.gender, 'm', '결혼하면 성별을 못 바꾼다');
  g.takeWarp({ to: 'nest_yard', tx: 1.5, ty: 9 });
  assert.equal(g.map.id, 'nest_yard');
  // 짓기
  g.me.gold = 0;
  assert.ok(!g.nestUpgrade().ok);
  g.me.gold = 100000;
  for (const [id, n] of NEST_LEVELS[1].cost.items) Inv.give(g.me, id, n);
  assert.ok(g.nestUpgrade().ok);
  assert.equal(g.nestLv(), 1);
  assert.ok(g.map.objects.some(o => o.kind === 'nest'), '신혼집이 생겼다');
  g.enterMap('nest', null, null);
  assert.equal(g.map.id, 'nest');
  assert.ok(g.npcList().some(n => n.id === 'karina'), '배우자가 집에 있다');
  // 2단계 → 아침 선물
  g.me.nest.lv = 2;
  g.enterMap('nest', null, null);
  const before = g.me.inv.filter(Boolean).length + Object.keys(g.me.stash).length;
  g.goToBed();
  await g.dayTick();
  await settle(g);
  assert.equal(g.map.id, 'nest', '신혼집에서 깬다');
  const sum = g.ui.dayEnds.at(-1);
  assert.equal(sum.gifts.length, 1);
  assert.ok(g.me.inv.filter(Boolean).length + Object.keys(g.me.stash).length >= before);
  g.stop();
});

test('상자에서 전부 꺼내기: 들어가는 만큼 한 번에', async () => {
  const { g } = await mkGame();
  await g.store.set('chest', { stone: 150 });
  await g.chestTake('stone', 999);
  assert.equal(Inv.count(g.me.inv, 'stone'), 150);
  assert.equal(g.chest.stone, undefined);
  g.stop();
});
