// 하루의 끝(잠 · 기절 · 가판대 정산) · 커피 · 정수기 · 양동이 · NPC 인사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkGame, newShared, settle } from './helpers.mjs';
import { HOUR_MS, ITEMS, RECIPES, BREW_MS, CUPS_PER_BUCKET, purifierLimit, NPCS, NPC_SECRET_LINES } from '../src/data.js';
import { shouldEndDay, mustPassOut, wakeStats, settleStall } from '../src/logic/day.js';
import * as Brew from '../src/logic/purifier.js';
import { coupleDay, greeting } from '../src/logic/npc.js';
import { clockAt, legacyDay, fmtClock } from '../src/game/clock.js';
import { sellPrice } from '../src/logic/market.js';
import { craft } from '../src/logic/craft.js';
import * as Inv from '../src/logic/inventory.js';

// 오늘을 hour 시로 맞춘다
const setHour = (g, hour) => g.store.set('day', { n: g.day, start: Date.now() - (hour - 6) * HOUR_MS });
const nearWater = g => {
  for (let y = 0; y < g.map.h; y++) for (let x = 0; x < g.map.w; x++) {
    const t = g.targetAt(x + 0.5, y + 0.5);
    if (t?.kind === 'water') return t;
  }
  return null;
};

test('규칙: 하루를 끝낼 때 · 쓰러질 때 · 다음 날 체력/기력', () => {
  assert.equal(shouldEndDay(15, []), true, '모두 잠들면 낮이라도 끝');
  assert.equal(shouldEndDay(15, [{ caff: false }]), false);
  assert.equal(shouldEndDay(24.01, [{ caff: false }]), true, '자정');
  assert.equal(shouldEndDay(25, [{ caff: true }, { caff: false }]), false, '커피 마신 사람이 깨어 있으면 계속');
  assert.equal(shouldEndDay(26, [{ caff: true }]), true, '새벽 2시는 한계');
  assert.equal(mustPassOut(23.9, false), false);
  assert.equal(mustPassOut(24, false), true);
  assert.equal(mustPassOut(25.9, true), false);
  assert.equal(mustPassOut(26, true), true);
  assert.deepEqual(wakeStats('slept', { hp: 101, en: 130 }), { hp: 101, en: 130 });
  assert.deepEqual(wakeStats('faint', { hp: 101, en: 130 }), { hp: 51, en: 44 }, '체력 절반 · 기력 3분의 1');
  assert.deepEqual(wakeStats('away', { hp: 90, en: 90 }), { hp: 90, en: 90 });
});

test('가판대 정산: 올린 날의 시세로 판다', () => {
  const r = settleStall({ d: 7, items: { turnip: 3, pumpkin: 1, nope: 4 } }, { luk: 5 });
  assert.equal(r.lines.length, 2);
  assert.equal(r.total, sellPrice('turnip', 7) * 3 + sellPrice('pumpkin', 7));
  assert.equal(r.lines[0].id, 'pumpkin', '많이 번 것부터');
  assert.equal(settleStall(null).total, 0);
});

test('시계: 6시에 시작해 자정은 24시, 표시는 오전 12시', () => {
  const now = Date.now();
  const c = clockAt(now, { n: 3, start: now - 18.5 * HOUR_MS });
  assert.equal(c.day, 3);
  assert.equal(c.h, 24);
  assert.equal(fmtClock(c), '오전 12:30');
  assert.equal(fmtClock(clockAt(now, { n: 1, start: now - 7 * HOUR_MS })), '오후 1:00');
  // 예전 세계는 지금 시각을 이어받는다
  const epoch = now - (2 * 24 + 5) * HOUR_MS; // 3일차 오전 11시
  const d = legacyDay(now, epoch);
  assert.equal(d.n, 3);
  assert.equal(Math.round(clockAt(now, d).hour), 11);
});

test('정수기: 물 양동이 하나에 10잔, 한 잔에 30초씩 차례로', () => {
  const t0 = 1_000_000;
  let f = { i: 'f_purifier' };
  assert.equal(Brew.addBeans(f, 1, t0).used, 0, '물이 없으면 못 넣는다');
  f = Brew.loadWater(f, t0);
  assert.equal(f.w, CUPS_PER_BUCKET);
  assert.equal(Brew.loadWater(f, t0), null, '물이 남아 있으면 더 못 끼운다');
  ({ next: f } = Brew.addBeans(f, 3, t0));
  assert.equal(f.w, 7);
  assert.equal(Brew.takeCups(f, t0 + BREW_MS - 1).cups, 0);
  assert.ok(Math.abs(Brew.brewProgress(f, t0 + BREW_MS / 2) - 0.5) < 1e-9);
  const a = Brew.takeCups(f, t0 + BREW_MS * 2 + 5);
  assert.equal(a.cups, 2);
  f = a.next;
  assert.equal(Brew.brewState(f, t0 + BREW_MS * 2 + 5).b, 1);
  assert.equal(Brew.takeCups(f, t0 + BREW_MS * 3).cups, 1, '남은 한 잔도 제 시간에');
  // 쉬고 있다가 넣으면 그때부터 30초
  const b = Brew.addBeans(Brew.takeCups(f, t0 + BREW_MS * 3).next, 20, t0 + BREW_MS * 10);
  assert.equal(b.used, 7, '남은 물만큼만');
  assert.equal(Brew.takeCups(b.next, t0 + BREW_MS * 11).cups, 1);
});

test('정수기 개수: 기본 2대, 집 6·11·16단계마다 1대 더', () => {
  assert.deepEqual([1, 5, 6, 10, 11, 15, 16, 20].map(purifierLimit), [2, 2, 3, 3, 4, 4, 5, 5]);
});

test('제작: 작업대 용광로 → 용광로 철 주괴 → 작업대 양동이', () => {
  const R = id => RECIPES.find(r => r.id === id);
  assert.equal(R('r_f_furnace').station, 'bench');
  assert.deepEqual(R('r_f_furnace').in, [['stone', 25], ['coal', 5]]);
  assert.equal(R('r_iron_bar').station, 'furnace');
  assert.deepEqual(R('r_bucket').in, [['iron_bar', 1]], '양동이는 주괴 1개');
  const p = { inv: Inv.makeInv(), stash: {}, skills: { mine: { lv: 1, xp: 0 }, sew: { lv: 1, xp: 0 } }, stats: { cooked: 0, sewn: 0 }, job: 'miner' };
  Inv.add(p.inv, 'iron_ore', 3); Inv.add(p.inv, 'coal', 1);
  assert.ok(craft(p, R('r_iron_bar')).ok);
  assert.ok(craft(p, R('r_bucket')).ok);
  assert.equal(Inv.count(p.inv, 'bucket'), 1);
  assert.equal(ITEMS.f_furnace.station, 'furnace');
});

test('NPC 인사: 매번 무작위, 이스터에그와 기념일 날수', () => {
  assert.equal(coupleDay(new Date(2019, 4, 28, 15).getTime()), 1, '처음 날이 1일차');
  assert.equal(coupleDay(new Date(2019, 4, 29, 0, 5).getTime()), 2);
  assert.equal(coupleDay(new Date(2020, 4, 27, 23).getTime()), 366);
  // 이스터에그를 고르게 만든 난수
  const seq = vals => { let i = 0; return () => vals[i++ % vals.length]; };
  const now = new Date(2019, 5, 7).getTime();
  assert.equal(greeting('bomi', seq([0.01, 0.99]), now), '오늘은 지노랑 하영이 11일차 되는 날이래용');
  assert.equal(greeting('bomi', seq([0.01, 0.0]), now), '그 소문 알아? 지노가 하영한테 고백편지 썼대~!');
  assert.equal(greeting('silvi', seq([0.01, 0.99]), now), '혜규이 최공 {heart}');
  assert.ok(NPCS.bomi.lines.includes(greeting('bomi', seq([0.9, 0.3]), now)), '보통은 평소 인사');
  assert.ok(!NPC_SECRET_LINES.chulsu);
  const seen = new Set(Array.from({ length: 200 }, () => greeting('kang')));
  assert.ok(seen.size >= 3, '말 걸 때마다 달라진다');
});

test('모두 잠들어야 하루가 끝나고, 먼저 잔 사람은 기다린다 · 가판대는 그때 팔린다', async () => {
  const shared = newShared();
  const { g: a, ui: ua } = await mkGame({ shared, name: '지노' });
  const { g: b, ui: ub } = await mkGame({ shared, name: '하영' });
  const day = a.day;
  // 가판대에 올려도 바로 돈이 들어오지 않는다
  Inv.give(a.me, 'pumpkin', 2);
  const gold0 = a.me.gold;
  const slot = a.me.inv.findIndex(s => s?.id === 'pumpkin');
  assert.ok((await a.stallPut(slot, 2)).ok);
  assert.equal(a.me.gold, gold0);
  assert.equal(a.stall.items.pumpkin, 2);
  // 기력을 써 둔다
  a.me.en = 5; b.me.en = 5; a.me.hp = 10;
  a.enterMap('house', null, null);
  a.goToBed();
  assert.equal(a.sleeping, 'bed');
  assert.equal(a.me.en, 5, '누워도 바로 차지 않는다');
  await a.dayTick(); await b.dayTick();
  assert.equal(a.day, day, '하영이 깨어 있으니 아직');
  b.goToBed();
  await b.dayTick();
  await settle(a, b);
  assert.equal(a.day, day + 1);
  assert.equal(b.day, day + 1);
  assert.ok(Math.abs(a.clock.hour - 6) < 0.01, '다음 날 아침 6시');
  const st = a.stats();
  assert.equal(a.me.en, st.en); assert.equal(a.me.hp, st.hp);
  assert.equal(b.me.en, b.stats().en);
  assert.equal(a.sleeping, null);
  assert.equal(a.map.id, 'house');
  // 요약
  const sum = ua.dayEnds.at(-1);
  assert.equal(sum.day, day);
  assert.equal(sum.outcome, 'slept');
  assert.equal(sum.sold.lines[0].id, 'pumpkin');
  assert.equal(sum.sold.total, sellPrice('pumpkin', day, a.stats().luk) * 2, '올린 날 시세 (행운 반영)');
  assert.equal(a.me.gold, gold0 + sum.sold.total);
  assert.equal(sum.gold, a.me.gold);
  assert.equal(a.stall, null, '가판대는 비었다');
  assert.equal(ub.dayEnds.at(-1).sold.total, 0);
  a.stop(); b.stop();
});

test('먼저 잔 사람이 일어나면 하루가 끝나지 않는다', async () => {
  const shared = newShared();
  const { g: a } = await mkGame({ shared });
  const { g: b } = await mkGame({ shared });
  const day = a.day;
  a.goToBed();
  a.wakeUp();
  b.goToBed();
  await a.dayTick(); await b.dayTick();
  assert.equal(a.day, day);
  a.stop(); b.stop();
});

test('밤 12시까지 안 자면 쓰러지고, 다음 날 체력 절반 · 기력 3분의 1', async () => {
  const { g, ui } = await mkGame();
  await setHour(g, 24.05);
  const day = g.day;
  await g.dayTick();
  await settle(g);
  assert.equal(g.day, day + 1);
  const st = g.stats();
  assert.equal(g.me.hp, Math.ceil(st.hp / 2));
  assert.equal(g.me.en, Math.ceil(st.en / 3));
  assert.equal(ui.dayEnds.at(-1).outcome, 'faint');
  assert.equal(g.map.id, 'house', '집에서 깨어난다');
  g.stop();
});

test('커피: 새벽 2시까지 멀쩡, 하루 한 잔, 상태가 보인다', async () => {
  const shared = newShared();
  const { g: a, ui } = await mkGame({ shared });
  const { g: b } = await mkGame({ shared });
  Inv.give(a.me, 'coffee', 2);
  const slot = () => a.me.inv.findIndex(s => s?.id === 'coffee');
  a.useSlot(slot());
  assert.ok(a.hasCaffeine());
  assert.equal(a.pubData().cf, a.day, '다른 사람에게도 알린다');
  a.useSlot(slot());
  assert.equal(Inv.count(a.me.inv, 'coffee'), 1, '두 잔째는 못 마신다');
  assert.ok(ui.toasts.at(-1).includes('하루 한 잔'));
  const day = a.day;
  await setHour(a, 24.5);
  await b.dayTick(); // 하영은 커피를 안 마셔 쓰러진다
  assert.equal(b.sleeping, 'faint');
  await a.dayTick();
  assert.equal(a.sleeping, null, '커피 마신 지노는 멀쩡');
  assert.equal(a.day, day, '지노가 깨어 있으니 하루가 계속된다');
  await setHour(a, 26.01);
  await a.dayTick();
  await settle(a, b);
  assert.equal(a.day, day + 1);
  assert.ok(!a.hasCaffeine(), '다음 날엔 효과가 없다');
  a.useSlot(slot());
  assert.ok(a.hasCaffeine(), '새 날엔 다시 마실 수 있다');
  a.stop(); b.stop();
});

test('자리를 비운 사이 하루가 끝나면, 돌아왔을 때 가판대가 정산된다', async () => {
  const shared = newShared();
  const { g: a } = await mkGame({ shared });
  const me = a.me;
  Inv.give(me, 'turnip', 5);
  await a.stallPut(me.inv.findIndex(s => s?.id === 'turnip'), 5);
  const day = a.day;
  a.stop();
  const { g: b } = await mkGame({ shared });
  b.goToBed();
  await b.dayTick();
  await settle(b);
  assert.equal(b.day, day + 1);
  const gold = me.gold;
  me.en = 1;
  const { g: a2, ui } = await mkGame({ shared, me });
  await settle(a2);
  assert.equal(me.gold, gold + sellPrice('turnip', day, a2.stats().luk) * 5);
  assert.equal(ui.dayEnds.at(-1).outcome, 'away');
  assert.equal(me.en, a2.stats().en);
  assert.equal(me.dayN, day + 1);
  a2.stop(); b.stop();
});

test('아무도 없는 사이 새벽 2시가 지났으면 들어올 때 새 날로 넘어간다 (벌칙 없이)', async () => {
  const shared = newShared();
  const { g: a } = await mkGame({ shared });
  const me = a.me;
  const day = a.day;
  await setHour(a, 40);
  a.stop();
  me.en = 3;
  const { g, ui } = await mkGame({ shared, me });
  await settle(g);
  assert.equal(g.day, day + 1);
  assert.ok(g.clock.hour < 6.1);
  assert.equal(ui.dayEnds.at(-1).outcome, 'away');
  assert.equal(me.en, g.stats().en);
  g.stop();
});

test('양동이를 든 채 물가를 누르면 물 양동이가 된다', async () => {
  const { g } = await mkGame();
  g.enterMap('lake', null, null);
  const t = nearWater(g);
  assert.ok(t, '호수에 물가가 있어야 한다');
  Inv.give(g.me, 'bucket', 1);
  g.select(g.me.inv.findIndex(s => s?.id === 'bucket'));
  assert.equal(g.describeTarget(t).label, '물 뜨기');
  g.interact(t);
  assert.equal(Inv.count(g.me.inv, 'bucket'), 0);
  assert.equal(Inv.count(g.me.inv, 'water_bucket'), 1);
  assert.ok(!g.fishing, '낚시가 아니라 물 뜨기');
  g.stop();
});

test('정수기: 집에 두 대까지 놓고, 물 양동이 끼우고 커피콩 넣으면 커피', async () => {
  const { g, ui } = await mkGame();
  g.enterMap('house', null, null);
  Inv.give(g.me, 'f_purifier', 3);
  const slot = () => g.me.inv.findIndex(s => s?.id === 'f_purifier');
  for (const x of [4.5, 6.5, 8.5]) { g.startDecor(slot()); await g.decorTap(x, 6.5); }
  assert.equal(g.purifierCount(), 2);
  assert.ok(ui.toasts.at(-1).includes('2개까지'));
  const [fid] = Object.entries(g.house.furniture).find(([, f]) => f.i === 'f_purifier');
  g.decor = null;
  // 가구를 누르면 정수기 창
  const f = g.house.furniture[fid];
  const t = g.targetAt(f.x + 0.5, f.y + 0.5);
  assert.equal(g.describeTarget(t).label, '정수기');
  assert.ok(!(await g.purifierBrew(fid, 1)).ok, '콩이 없으면 불가');
  Inv.give(g.me, 'coffee_bean', 12);
  assert.ok(!(await g.purifierBrew(fid, 1)).ok, '물이 없으면 불가');
  Inv.give(g.me, 'water_bucket', 1);
  assert.ok((await g.purifierLoad(fid)).ok);
  assert.equal(Inv.count(g.me.inv, 'bucket'), 1, '빈 양동이는 돌려받는다');
  const r = await g.purifierBrew(fid, 999);
  assert.ok(r.ok);
  assert.equal(Inv.count(g.me.inv, 'coffee_bean'), 2, '물 10잔만큼만 넣었다');
  assert.ok(!(await g.purifierTake(fid)).ok, '30초 전엔 없다');
  // 1분 전에 넣은 것으로 돌린다 → 2잔 완성
  await g.store.set(`house/furniture/${fid}`, { ...g.house.furniture[fid], t: Date.now() - 2 * BREW_MS - 100 });
  assert.ok((await g.purifierTake(fid)).ok);
  assert.equal(Inv.count(g.me.inv, 'coffee'), 2);
  // 내리는 중에는 옮길 수 없다
  g.startDecor(null);
  await g.decorTap(g.house.furniture[fid].x + 0.5, g.house.furniture[fid].y + 0.5);
  assert.ok(g.house.furniture[fid], '내리는 중인 정수기는 그대로');
  g.stop();
});

test('덤불 열매는 하루에 한 번 (날이 바뀌면 다시)', async () => {
  const { g } = await mkGame();
  const bush = g.map.objects.find(o => o.t === 'bush' && o.nid);
  assert.ok(bush);
  await g.store.txn(`nodes/${g.map.key}/${bush.nid}`, () => g.day);
  assert.ok(g.nodeDead(bush), '오늘은 비어 있다');
  g.goToBed();
  await g.dayTick();
  await settle(g);
  assert.ok(!g.nodeDead(bush), '다음 날엔 다시 열린다');
  g.stop();
});
