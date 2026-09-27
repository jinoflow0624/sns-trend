import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMap, isSolid, WAYPOINTS, waypointInfo, buildHouse, FARM_SOIL, T } from '../src/world/maps.js';
import { findPath } from '../src/world/path.js';

const center = v => Math.floor(v);
function reachable(m, from, to) {
  return !!findPath(m, from.x, from.y, to.x, to.y, { maxNodes: 20000 });
}

test('지상 맵이 모두 만들어지고 출구 도착 지점이 막혀 있지 않다', () => {
  for (const id of ['farm', 'town', 'lake', 'forest', 'mine_gate']) {
    const m = getMap(id);
    assert.ok(m, id);
    assert.equal(m.tiles.length, m.w * m.h);
    for (const w of m.warps) {
      if (w.to === 'house' || w.to.includes(':')) continue;
      const t = getMap(w.to);
      assert.ok(!isSolid(t, w.tx, w.ty), `${id} → ${w.to} 도착 (${w.tx},${w.ty}) 막힘`);
      // 도착 지점에서 다시 돌아가는 출구까지 걸어갈 수 있어야 한다
      const back = t.warps.find(x => x.to === id);
      assert.ok(back, `${w.to} 에서 ${id} 로 가는 출구 없음`);
    }
  }
});

test('순간이동 석상 옆에 설 수 있다', () => {
  for (const [id, wp] of Object.entries(WAYPOINTS)) {
    const m = getMap(wp.map);
    assert.ok(!isSolid(m, wp.x, wp.y), `${id} 도착점 막힘`);
    assert.ok(m.objects.some(o => o.t === 'waypoint' && o.wp === id), `${id} 석상 없음`);
  }
});

test('농장: 집 문 → 밭 → 마을 출구까지 걸어갈 수 있다', () => {
  const m = getMap('farm');
  const start = { x: 7.5, y: 9.6 };
  assert.ok(reachable(m, start, { x: FARM_SOIL.x + 3.5, y: FARM_SOIL.y + FARM_SOIL.h + 0.5 }));
  assert.ok(reachable(m, start, { x: 32.5, y: 12.5 }));
  assert.ok(reachable(m, start, { x: 13.5, y: 16.6 }));
  assert.equal(m.tiles[FARM_SOIL.y * m.w + FARM_SOIL.x], T.SOIL);
});

test('마을: 상점 NPC 앞까지 걸어갈 수 있다', () => {
  const m = getMap('town');
  for (const n of m.npcs.filter(n => n.shop)) {
    assert.ok(reachable(m, { x: 1.5, y: 13 }, { x: n.x, y: n.y + 1 }), n.id);
  }
});

test('숲: 유적 입구와 석상까지 갈 수 있다', () => {
  const m = getMap('forest');
  assert.ok(reachable(m, { x: 17.5, y: 1.5 }, { x: 17.5, y: 24.5 }));
  assert.ok(reachable(m, { x: 17.5, y: 1.5 }, { x: 14.5, y: 5.6 }));
});

test('집: 레벨마다 커지고 가구 영역이 있다', () => {
  let prev = 0;
  for (let lv = 1; lv <= 5; lv++) {
    const h = buildHouse(lv);
    assert.ok(h.w * h.h > prev);
    prev = h.w * h.h;
    assert.ok(h.decor.w > 3);
    assert.ok(!isSolid(h, h.door.x + 0.5, h.door.y - 0.6), '문 앞 막힘');
    assert.ok(h.objects.some(o => o.t === 'bed'));
  }
  assert.ok(buildHouse(3).objects.some(o => o.kind === 'sewing'));
  assert.ok(!buildHouse(1).objects.some(o => o.kind === 'stove'));
});

test('광산·유적 층: 입구에서 내려가는 사다리까지 길이 있다 (바위는 깰 수 있으니 무시)', () => {
  for (let f = 1; f <= 25; f++) {
    for (const kind of ['mine', 'ruins']) {
      const m = getMap(`${kind}:${f}`, { seedKey: `W${f % 4}-d${f}` });
      assert.ok(m.entry && m.exitDown, `${kind} ${f}`);
      assert.ok(!isSolid(m, m.entry.x, m.entry.y), `${kind}${f} 입구 막힘`);
      const ok = findPath(m, m.entry.x, m.entry.y, m.exitDown.x, m.exitDown.y, { maxNodes: 50000, ignore: o => o.t === 'rock' || o.t === 'crystal' });
      assert.ok(ok, `${kind} ${f}층 길 없음`);
      if (f % 5 === 0) assert.ok(waypointInfo(`${kind}${f}`));
    }
  }
});

test('같은 씨앗이면 같은 광산', () => {
  const a = getMap('mine:7', { seedKey: 'Q-1' });
  const b = getMap('mine:7', { seedKey: 'Q-2' });
  assert.notDeepEqual([...a.tiles], [...b.tiles]);
  assert.equal(a, getMap('mine:7', { seedKey: 'Q-1' }));
});
