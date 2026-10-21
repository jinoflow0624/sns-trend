// 원정 보스별 승률 — 보스 앞까지 간 판에서 그 보스를 이긴 비율 (초회차 · 모든 직업)
//   node sim/bosses.mjs [직업당 판 수=60]
// 덮어쓰기 시험: OV='{"tune":{"hp":{"boss":[0.9,1,1.3]}}}' node sim/bosses.mjs
import * as Run from '../run/rules.js';
const N = Number(process.argv[2] || 60);
const OV = JSON.parse(process.env.OV || '{}');
for (const k of ['hp', 'atk']) if (OV.tune?.[k]) Object.assign(Run.TUNE[k], OV.tune[k]);
for (const [id, hp] of Object.entries(OV.boss || {})) Run.ENEMIES[id].hp = [hp, hp];
function mulberry(a) { return () => { let t = (a = (a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const st = {};
for (const cls of Object.keys(Run.RUN_CLASSES)) for (let k = 0; k < N; k++) {
  const seed = (k * 7919 + 101) >>> 0, R = Run.createRun({ cls, seed }), rng = mulberry(seed ^ 0x9E3779B9);
  let steps = 0, cur = null;
  while (!R.ended && steps++ < 20000) {
    if (R.phase === 'combat') Run.applyCombat(R, Run.botCombat(R, rng, 12)); else Run.botRunStep(R, rng);
    R.fx.length = 0;
    const id = R.C?.e?.id, boss = id && Run.ENEMIES[id].kind === 'boss' ? id : null;
    if (boss && !cur) { cur = boss; (st[cur] ||= { n: 0, w: 0 }).n++; }
    if (cur && boss !== cur && !R.ended) { st[cur].w++; cur = null; }
  }
  if (cur && R.won) st[cur].w++;
}
for (const [id, s] of Object.entries(st)) console.log(`${id.padEnd(9)} ${String(s.n).padStart(4)}판  승률 ${(s.w / s.n * 100).toFixed(0)}%`);
