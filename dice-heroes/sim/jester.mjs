// 깜짝 보스 「시공 광대」 승률 — 1 · 2막 중간(그 막 3층을 지난 지도)에서 광대전을 붙여 본다. 목표: 막마다 30% 안팎
//   node sim/jester.mjs [직업당 판 수=40]
// 덮어쓰기: OV='{"hp":[1,1.6],"atk":[1.9,2.05]}' node sim/jester.mjs
import * as Run from '../run/rules.js';
const N = Number(process.argv[2] || 40);
const OV = JSON.parse(process.env.OV || '{}');
if (OV.hp) OV.hp.forEach((v, i) => (Run.TUNE.hp.special[i] = v));
if (OV.atk) OV.atk.forEach((v, i) => (Run.TUNE.atk.special[i] = v));
function mulberry(a) { return () => { let t = (a = (a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const res = { 1: { n: 0, w: 0, turns: 0, future: {} }, 2: { n: 0, w: 0, turns: 0, future: {} } };
for (const cls of Object.keys(Run.RUN_CLASSES)) for (let k = 0; k < N; k++) {
  const seed = (k * 7919 + 101) >>> 0, R = Run.createRun({ cls, seed }), rng = mulberry(seed ^ 0x9E3779B9);
  const done = {};
  let steps = 0;
  while (!R.ended && steps++ < 20000) {
    const a = R.act, floor = R.path.filter(id => Run.mapNode(R, id)).length;
    if (R.phase === 'map' && a <= 2 && !done[a] && R.pos != null && Run.mapNode(R, R.pos).row >= 3) {
      done[a] = true;
      const J = JSON.parse(JSON.stringify(R));
      J.jester = { met: true, then: null }; J.fx = [];
      Run.startCombat(J, 'jester');
      const r2 = mulberry(seed ^ a);
      let s2 = 0, t0 = J.stats.turns;
      while (J.phase === 'combat' && s2++ < 5000) { Run.applyCombat(J, Run.botCombat(J, r2, 12)); J.fx.length = 0; }
      res[a].n++; res[a].turns += J.stats.turns - t0;
      if (J.phase === 'reward') res[a].w++;
    }
    if (R.phase === 'combat') Run.applyCombat(R, Run.botCombat(R, rng, 12)); else Run.botRunStep(R, rng);
    R.fx.length = 0;
    void floor;
  }
}
for (const a of [1, 2]) console.log(`${a}막  ${res[a].n}판  광대 승률 ${(res[a].w / res[a].n * 100).toFixed(0)}%  평균 ${(res[a].turns / res[a].n).toFixed(1)}턴`);
