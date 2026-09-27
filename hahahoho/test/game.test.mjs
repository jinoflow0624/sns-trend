// Game 클래스를 DOM 없이 메모리 저장소로 돌려 보는 통합 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 전역 최소 흉내
globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const { Game } = await import('../src/game/game.js');
const { createPlayer } = await import('../src/logic/player.js');
const Inv = await import('../src/logic/inventory.js');
const { FARM_SOIL } = await import('../src/world/maps.js');
const { HOUR_MS, MIN } = await import('../src/data.js');

// 트랜잭션이 원자적인 메모리 저장소 (Firebase 와 같은 의미)
class MemStore {
  constructor(shared = { data: {}, watchers: new Set() }) { this.kind = 'online'; this.s = shared; }
  read(path) { let c = this.s.data; for (const k of path.split('/').filter(Boolean)) { if (c == null) return null; c = c[k]; } return c ?? null; }
  write(path, v) {
    const ks = path.split('/').filter(Boolean);
    if (!ks.length) { this.s.data = v ?? {}; } else {
      let c = this.s.data;
      for (const k of ks.slice(0, -1)) { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }
      if (v == null) delete c[ks.at(-1)]; else c[ks.at(-1)] = JSON.parse(JSON.stringify(v));
    }
    for (const w of this.s.watchers) w.cb(structuredClone(this.read(w.path)));
  }
  watch(path, cb) { const w = { path, cb }; this.s.watchers.add(w); cb(structuredClone(this.read(path))); return () => this.s.watchers.delete(w); }
  async get(p) { return structuredClone(this.read(p)); }
  async set(p, v) { this.write(p, v); }
  async update(p, o) { for (const [k, v] of Object.entries(o)) this.write(`${p}/${k}`, v); }
  async remove(p) { this.write(p, null); }
  async txn(p, fn) { const cur = structuredClone(this.read(p)); const n = fn(cur); if (n === undefined) return { committed: false, value: cur }; this.write(p, n); return { committed: true, value: n }; }
  presence(p, v) { this.write(p, v); }
  close() {}
}
const fakeUI = () => {
  const ui = { toasts: [], idle: null, toast(m) { ui.toasts.push(m); }, showIdle(r) { ui.idle = r; } };
  return new Proxy(ui, { get: (t, k) => (k in t ? t[k] : () => {}) });
};
async function mkGame({ job = 'farmer', shared, lastSeen } = {}) {
  const me = createPlayer({ id: `p${Math.random()}`.slice(0, 8), name: '테스트', job });
  if (lastSeen) me.lastSeen = lastSeen;
  const store = new MemStore(shared);
  const ui = fakeUI();
  const g = new Game({ store, code: 'TEST01', pid: me.id, me, ui, settings: { vibrate: false } });
  await g.start();
  return { g, ui, store };
}

test('접속하면 방치 보상이 뜨고, 받으면 가방/보관함으로 들어간다', async () => {
  const { g, ui } = await mkGame({ job: 'miner', lastSeen: Date.now() - 3 * HOUR_MS });
  assert.ok(ui.idle, '방치 보상 없음');
  assert.ok(ui.idle.hours > 2.9);
  const before = Inv.count(g.me.inv, 'stone') + (g.me.stash.stone || 0);
  g.acceptIdle(ui.idle);
  assert.ok(Inv.count(g.me.inv, 'stone') + (g.me.stash.stone || 0) > before);
  g.stop();
});

test('밭: 갈기 → 심기 → 물 → 수확, 공유 밭은 한 사람만 수확', async () => {
  const shared = { data: {}, watchers: new Set() };
  const { g: a } = await mkGame({ shared });
  const { g: b } = await mkGame({ shared });
  const x = FARM_SOIL.x; const y = FARM_SOIL.y;
  a.map = { ...a.map }; // 농장
  await a.plotAction(x, y);
  assert.ok(b.farm[0]?.tilled, '다른 사람에게도 보인다');
  await a.plotAction(x, y);
  assert.equal(a.farm[0].crop, 'turnip');
  a.action = null;
  await a.plotAction(x, y);
  assert.ok(a.farm[0].wetUntil > Date.now());
  // 다 자란 걸로 만든다
  await a.store.set('farm/0', { ...a.farm[0], at: Date.now() - 30 * MIN });
  const ha = a.me.stats.harvested; const hb = b.me.stats.harvested;
  await Promise.all([a.harvestPlot(0, x, y), b.harvestPlot(0, x, y)]);
  assert.equal((a.me.stats.harvested - ha > 0) + (b.me.stats.harvested - hb > 0), 1, '정확히 한 명만 수확');
  a.stop(); b.stop();
});

test('집 레벨에 따라 잠긴 밭은 갈 수 없다', async () => {
  const { g, ui } = await mkGame();
  const lockedY = FARM_SOIL.y + 4; // 24칸(2줄) 이후는 잠김
  await g.plotAction(FARM_SOIL.x, lockedY);
  assert.equal(g.farm[4 * FARM_SOIL.w], undefined);
  assert.ok(ui.toasts.some(t => t.includes('집을 키우면')));
  g.stop();
});

test('요리 · 시장 · 도구 강화', async () => {
  const { g } = await mkGame({ job: 'cook' });
  Inv.give(g.me, 'potato', 2);
  const r = g.craft('r_baked_potato');
  assert.ok(r.ok, r.msg);
  const gold = g.me.gold;
  const slot = g.me.inv.findIndex(s => s?.id === 'turnip');
  const got = g.sell(slot, 1, 'market');
  assert.equal(g.me.gold, gold + got);
  assert.ok(g.buy('seed_pumpkin', 1).ok);
  assert.ok(!g.upgradeTool('pick').ok, '재료 없이는 불가');
  g.me.gold = 1000; Inv.give(g.me, 'copper_ore', 5); Inv.give(g.me, 'wood', 5);
  assert.ok(g.upgradeTool('pick').ok);
  assert.equal(g.me.tools.pick, 2);
  g.stop();
});

test('집 키우기: 여럿이 기부하고 레벨업하면 밭이 넓어진다', async () => {
  const shared = { data: {}, watchers: new Set() };
  const { g: a } = await mkGame({ shared });
  const { g: b } = await mkGame({ shared });
  assert.equal(a.plotLimit(), 24);
  a.me.gold = 1000; b.me.gold = 1000;
  Inv.give(a.me, 'wood', 60); Inv.give(b.me, 'stone', 40);
  assert.ok((await a.donate('gold', 800)).ok);
  assert.ok((await b.donate('gold', 700)).ok);
  assert.ok(!(await a.levelUpHouse()).ok, '재료 부족');
  await a.donate('wood', 60); await b.donate('stone', 40);
  assert.ok((await b.levelUpHouse()).ok);
  assert.equal(a.house.level, 2);
  assert.equal(a.plotLimit(), 36);
  assert.equal(a.house.fund.gold, 0);
  a.stop(); b.stop();
});

test('순간이동: 깨운 석상만, 기력 소모', async () => {
  const { g, ui } = await mkGame();
  g.teleport('town');
  assert.equal(g.map.id, 'farm');
  assert.ok(ui.toasts.at(-1).includes('깨우지'));
  const stone = g.map.objects.find(o => o.t === 'waypoint');
  await g.objectAction(stone);
  assert.ok(g.waypoints.farm);
  await g.store.set('waypoints/town', { by: 'x' });
  const en = g.me.en;
  g.teleport('town');
  assert.equal(g.map.id, 'town');
  assert.equal(g.me.en, en - 3);
  g.stop();
});

test('집 꾸미기: 가구 놓기 · 겹치기 금지 · 다시 넣기', async () => {
  const { g } = await mkGame();
  g.enterMap('house', null, null);
  Inv.give(g.me, 'f_chair', 2);
  Inv.give(g.me, 'f_rug', 1);
  const slot = id => g.me.inv.findIndex(s => s?.id === id);
  g.startDecor(slot('f_rug'));
  await g.decorTap(4.5, 5.5);
  g.decor.slot = slot('f_chair');
  await g.decorTap(4.5, 5.5); // 러그 위 의자는 가능
  g.decor.slot = slot('f_chair');
  await g.decorTap(4.5, 5.5); // 의자 위 의자는 불가
  const list = Object.values(g.house.furniture);
  assert.equal(list.length, 2);
  assert.equal(Inv.count(g.me.inv, 'f_chair'), 1);
  g.decor.slot = null;
  await g.decorTap(4.5, 5.5); // 집어 들기
  assert.equal(Object.keys(g.house.furniture).length, 1);
  g.stop();
});

test('전투: 몬스터를 쓰러뜨리면 보상, 쓰러지면 집에서 깨어난다', async () => {
  const { g } = await mkGame({ job: 'hunter' });
  g.enterMap('forest', 17.5, 2);
  const mo = g.monsters[0];
  g.px = mo.x - 0.8; g.py = mo.y;
  const gold = g.me.gold;
  for (let i = 0; i < 20 && !mo.dead; i++) { g.action = null; g.attack(mo); }
  assert.ok(mo.dead);
  assert.ok(g.me.gold > gold);
  g.me.hp = 1; g.invuln = 0;
  g.monsterHit({ atk: 50, cd: 0, x: g.px + 0.5, y: g.py });
  assert.equal(g.map.id, 'house');
  assert.ok(g.me.hp > 1);
  g.stop();
});
