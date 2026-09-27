import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, JOBS, RECIPES, CROPS, MIN, IDLE_JOBS, REAL_HOUR, SHOPS, MONSTERS, NPCS, REQUEST_POOL, HOUSE_LEVELS, NPC_TASTE } from '../src/data.js';
import * as Inv from '../src/logic/inventory.js';
import * as P from '../src/logic/player.js';
import * as F from '../src/logic/farm.js';
import { computeIdle } from '../src/logic/idle.js';
import { craft, canCraft } from '../src/logic/craft.js';
import { sellPrice, dailyRequests, priceMult } from '../src/logic/market.js';
import { mulberry32 } from '../src/logic/rng.js';

test('데이터: 참조하는 아이템이 모두 존재한다', () => {
  const need = new Set();
  for (const j of Object.values(JOBS)) j.items.forEach(([id]) => need.add(id));
  for (const r of RECIPES) { need.add(r.out[0]); r.in.forEach(([id]) => need.add(id)); Object.values(r.alt || {}).flat().forEach(id => need.add(id)); }
  for (const c of Object.keys(CROPS)) { need.add(c); need.add(`seed_${c}`); }
  for (const j of Object.values(IDLE_JOBS)) j.table.forEach(([id]) => need.add(id));
  for (const s of Object.values(SHOPS)) s.sells.forEach(id => need.add(id));
  for (const m of Object.values(MONSTERS)) m.drops.forEach(([id]) => need.add(id));
  REQUEST_POOL.forEach(([id]) => need.add(id));
  HOUSE_LEVELS.filter(Boolean).forEach(h => (h.cost?.items || []).forEach(([id]) => need.add(id)));
  for (const [npc, t] of Object.entries(NPC_TASTE)) {
    assert.ok(NPCS[npc], `취향만 있고 NPC 없음: ${npc}`);
    [...t.love, ...t.like, ...t.dislike].filter(k => !k.startsWith('type:')).forEach(id => need.add(id));
  }
  for (const id of need) assert.ok(ITEMS[id], `없는 아이템: ${id}`);
  for (const [id, it] of Object.entries(ITEMS)) if (it.type === 'seed') assert.ok(CROPS[it.crop], id);
  assert.ok(Object.keys(NPCS).length >= 6);
});

test('직업별 초기 능력치: 전문 분야가 가장 높다', () => {
  const s = j => JOBS[j].stats;
  assert.ok(s('miner').str >= Math.max(...Object.keys(JOBS).map(j => s(j).str)));
  assert.ok(s('tailor').crf >= Math.max(...Object.keys(JOBS).map(j => s(j).crf)));
  assert.ok(s('hunter').hp >= Math.max(...Object.keys(JOBS).map(j => s(j).hp)));
  assert.ok(s('farmer').en >= Math.max(...Object.keys(JOBS).map(j => s(j).en)));
  assert.ok(s('fisher').dex >= s('farmer').dex && s('fisher').luk >= s('miner').luk);
  for (const j of Object.values(JOBS)) {
    const sum = j.stats.str + j.stats.dex + j.stats.luk + j.stats.crf;
    assert.ok(sum >= 22 && sum <= 27, `${j.name} 능력치 합 ${sum}`);
  }
});

test('캐릭터 생성: 직업 도구와 시작 아이템', () => {
  const p = P.createPlayer({ id: 'a', name: '지노', job: 'miner' });
  assert.equal(p.tools.pick, 2);
  assert.equal(p.tools.hoe, 1);
  assert.equal(p.skills.mine.lv, 3);
  assert.equal(Inv.count(p.inv, 'bread'), 4);
  assert.equal(p.hp, JOBS.miner.stats.hp);
});

test('인벤토리: 쌓기 · 넘침 · 빼기 · 옮기기', () => {
  const inv = Inv.makeInv(3);
  assert.equal(Inv.add(inv, 'wood', 150), 0);
  assert.deepEqual(inv.map(s => s?.n), [99, 51, undefined]);
  assert.equal(Inv.add(inv, 'stone', 120), 21, '넘친 만큼 돌려준다');
  assert.ok(!Inv.remove(inv, 'wood', 200));
  assert.equal(Inv.count(inv, 'wood'), 150, '실패하면 그대로');
  assert.ok(Inv.remove(inv, 'wood', 60));
  assert.equal(Inv.count(inv, 'wood'), 90);
  Inv.move(inv, 0, 2);
  assert.equal(inv[2].id, 'wood');
  const p = { inv: Inv.makeInv(1), stash: {} };
  assert.equal(Inv.give(p, 'wood', 120), 21);
  assert.equal(p.stash.wood, 21, '넘치면 보관함으로');
});

test('인벤토리 정리: 핫바는 두고 나머지만', () => {
  const inv = Inv.makeInv(12);
  inv[0] = { id: 'bread', n: 1 };
  inv[9] = { id: 'wood', n: 3 };
  inv[11] = { id: 'wood', n: 4 };
  inv[10] = { id: 'seed_turnip', n: 2 };
  Inv.sortInv(inv);
  assert.equal(inv[0].id, 'bread');
  assert.equal(inv[8].id, 'seed_turnip');
  assert.equal(inv[9].id, 'wood');
  assert.equal(inv[9].n, 7);
});

test('능력치: 옷과 버프가 반영된다', () => {
  const p = P.createPlayer({ id: 'a', name: 'a', job: 'farmer' });
  const before = P.statsOf(p).luk;
  Inv.give(p, 'flower_crown', 1);
  const idx = p.inv.findIndex(s => s?.id === 'flower_crown');
  assert.ok(P.equip(p, idx).ok);
  assert.equal(P.statsOf(p).luk, before + 2);
  assert.equal(P.lookOf(p).hat, ITEMS.flower_crown.look);
  Inv.give(p, 'pumpkin_pie', 1);
  const now = Date.now();
  p.en = 10;
  P.eat(p, p.inv.findIndex(s => s?.id === 'pumpkin_pie'), now);
  assert.equal(P.statsOf(p, now).luk, before + 5);
  assert.equal(P.statsOf(p, now + 31 * MIN).luk, before + 2, '버프는 30분');
  assert.ok(p.en > 10);
});

test('재봉사는 옷 능력치 +1', () => {
  const t = P.createPlayer({ id: 'a', name: 'a', job: 'tailor' });
  const base = P.statsOf(t).luk;
  Inv.give(t, 'flower_crown', 1);
  P.equip(t, t.inv.findIndex(s => s?.id === 'flower_crown'));
  assert.equal(P.statsOf(t).luk, base + 3);
});

test('경험치와 레벨업', () => {
  const p = P.createPlayer({ id: 'a', name: 'a', job: 'cook' });
  const ups = P.gainXp(p, 'farm', 1000);
  assert.ok(ups.length >= 3);
  assert.ok(p.skills.farm.lv > 3);
});

test('농사: 물 준 시간만 제 속도, 마르면 절반', () => {
  const t0 = 1_000_000;
  let plot = F.till({});
  plot = F.plant(plot, 'turnip', t0);
  assert.equal(F.stageOf(plot, t0), 0);
  plot = F.water(plot, t0);
  assert.ok(F.water(plot, t0 + MIN) === null, '이미 촉촉하면 null');
  // 순무 3분: 촉촉한 동안 3분이면 다 자란다
  assert.ok(F.isRipe(plot, t0 + 3 * MIN));
  // 물을 안 주면 6분
  let dry = F.plant(F.till({}), 'turnip', t0);
  assert.ok(!F.isRipe(dry, t0 + 5 * MIN));
  assert.ok(F.isRipe(dry, t0 + 6 * MIN + 1));
  // 보너스
  assert.ok(F.isRipe(dry, t0 + 5.5 * MIN, 0.1));
  const h = F.harvest(plot, t0 + 3 * MIN, mulberry32(1));
  assert.equal(h.item, 'turnip');
  assert.ok(h.n >= 1 && h.n <= 2);
  assert.equal(h.plot.crop, null);
  assert.ok(h.plot.tilled);
  assert.equal(F.harvest(F.plant(F.till({}), 'pumpkin', t0), t0 + MIN, mulberry32(1)), null, '덜 자라면 수확 불가');
});

test('농사: 물 기간이 걸쳐 있을 때 정확히 합산', () => {
  const t0 = 0;
  const plot = { tilled: true, crop: 'pumpkin', progress: 0, at: t0, wetUntil: t0 + 20 * MIN };
  // 호박 28분: 20분 촉촉 → 20/28, 이후 16분 건조 → 8/28 → 합 1
  assert.ok(Math.abs(F.progressAt(plot, t0 + 36 * MIN) - 1) < 1e-9);
  assert.ok(F.progressAt(plot, t0 + 35 * MIN) < 1);
});

test('밭 일꾼 수확: 자란 횟수만큼 거두고 남은 진행도는 이어진다', () => {
  const t0 = 0;
  const plot = { tilled: true, crop: 'turnip', progress: 0, at: t0, wetUntil: t0 + 100 * MIN };
  const h = F.helperHarvest(plot, t0 + 7.5 * MIN, mulberry32(2));
  assert.equal(h.cycles, 2, '순무 3분짜리 두 번');
  assert.ok(h.n >= 2 && h.n <= 4);
  assert.ok(Math.abs(h.plot.progress - 0.5) < 1e-9);
  assert.equal(F.helperHarvest(plot, t0 + MIN, mulberry32(2)), null);
});

test('방치 보상: 시간·레벨·직업에 비례, 상한 적용', () => {
  const p = P.createPlayer({ id: 'a', name: 'a', job: 'miner' });
  p.idle = 'mine';
  assert.equal(computeIdle(p, 30 * 1000), null);
  const one = computeIdle(p, REAL_HOUR, { seed: 3 });
  const two = computeIdle(p, 2 * REAL_HOUR, { seed: 3 });
  const total = r => r.items.reduce((a, [, n]) => a + n, 0);
  assert.ok(total(two) > total(one));
  const capped = computeIdle(p, 100 * REAL_HOUR, { seed: 3 });
  assert.equal(capped.hours, 8);
  const big = computeIdle(p, 100 * REAL_HOUR, { seed: 3, houseLv: 4 });
  assert.equal(big.hours, 16);
  const other = P.createPlayer({ id: 'b', name: 'b', job: 'cook' });
  other.idle = 'mine';
  assert.ok(total(computeIdle(other, 8 * REAL_HOUR, { seed: 3 })) < total(capped), '광부가 채굴을 더 잘한다');
});

test('제작: 재료 소모와 결과물, 레벨 제한', () => {
  const p = P.createPlayer({ id: 'a', name: 'a', job: 'farmer' });
  const soup = RECIPES.find(r => r.id === 'r_veggie_soup');
  assert.ok(!canCraft(p, soup).ok);
  Inv.give(p, 'turnip', 1);
  Inv.give(p, 'carrot', 1);
  const res = craft(p, soup, () => 0.99);
  assert.ok(res.ok, res.msg);
  assert.equal(Inv.count(p.inv, 'veggie_soup'), 1);
  assert.equal(Inv.count(p.inv, 'turnip'), 0);
  const pie = RECIPES.find(r => r.id === 'r_pumpkin_pie');
  Inv.give(p, 'pumpkin', 1); Inv.give(p, 'flour', 2);
  assert.ok(!craft(p, pie).ok, '요리 5레벨 필요');
  // 대체 재료: 생선구이는 잉어로도
  const fish = RECIPES.find(r => r.id === 'r_grilled_fish');
  Inv.give(p, 'fish_carp', 1);
  assert.ok(craft(p, fish, () => 0.99).ok);
  assert.equal(Inv.count(p.inv, 'fish_carp'), 0);
});

test('요리사는 가끔 두 배', () => {
  const p = P.createPlayer({ id: 'a', name: 'a', job: 'cook' });
  const r = RECIPES.find(x => x.id === 'r_baked_potato');
  const res = craft(p, r, () => 0.01);
  assert.equal(res.n, 2);
});

test('시장: 시세는 날마다 다르고 같은 날엔 같다', () => {
  assert.equal(sellPrice('pumpkin', 3), sellPrice('pumpkin', 3));
  const prices = new Set([1, 2, 3, 4, 5, 6].map(d => sellPrice('pumpkin', d)));
  assert.ok(prices.size > 2);
  for (let d = 1; d < 50; d++) { const m = priceMult(d, 'turnip'); assert.ok(m >= 0.75 && m <= 1.35); }
  const a = dailyRequests('ABCDE', 4);
  assert.deepEqual(a, dailyRequests('ABCDE', 4));
  assert.equal(a.length, 3);
  assert.notDeepEqual(a, dailyRequests('ABCDE', 5));
});
