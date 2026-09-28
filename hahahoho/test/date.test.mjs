// 대화하기(연애 시뮬레이션풍) 대본 · 장면 고르기 · 친밀도
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATES } from '../src/dates.js';
import { NPCS, NPC_TASTE, TASTE_HINT, ITEMS } from '../src/data.js';
import { pickScene, choose, heartsOf } from '../src/logic/date.js';
import { getMap, isSolid } from '../src/world/maps.js';
import { mkGame } from './helpers.mjs';

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
  for (const id of ['eunwoo', 'karina']) {
    assert.ok(NPCS[id] && NPC_TASTE[id] && TASTE_HINT[id], id);
    for (const k of [...NPC_TASTE[id].love, ...NPC_TASTE[id].like, ...NPC_TASTE[id].dislike]) if (!k.startsWith('type:')) assert.ok(ITEMS[k], k);
  }
  const town = getMap('town', { houseLv: 1, seedKey: 'x' });
  const h = town.npcs.find(n => n.id === 'eunwoo');
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
  const s1 = pickScene('eunwoo', f, 5);
  const r1 = choose(f, s1, 0, 5);
  assert.equal(r1.gain, s1.choices[0][1]);
  const s2 = pickScene('eunwoo', f, 5, 1);
  assert.notEqual(s2.key, s1.key);
  const r2 = choose(f, s2, 0, 5);
  assert.equal(r2.gain, 0, '같은 날은 오르지 않는다');
  assert.equal(r2.counted, false);
  const r3 = choose(f, pickScene('eunwoo', f, 6), 0, 6);
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
