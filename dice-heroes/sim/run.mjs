// 원정(로그라이크) 밸런스 시뮬레이터 — 봇이 원정을 끝까지 돌고 직업별 결과를 낸다.
//   node sim/run.mjs [판 수=200] [직업,직업...] [--samples=12] [--seed=1]
// 결과: 클리어율 · 막별 도달률 · 평균 층 · 처치 · 남은 체력 · 사망 위치(적)
import * as Run from '../run/rules.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a)) || 200);
const only = args.find(a => /^[a-z,]+$/.test(a))?.split(',');
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const SAMPLES = Number(opt('samples') || 12);
const SEED = Number(opt('seed') || 1);
const CLASSES = only || Object.keys(Run.RUN_CLASSES);

// 시뮬레이션 난수 (봇 표본용) — 판마다 고정해 다시 돌려도 같은 결과
function mulberry(a) { return () => { let t = (a = (a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const t0 = Date.now();
const rows = [];
for (const cls of CLASSES) {
  const r = { cls, win: 0, act: [0, 0, 0, 0], floors: 0, turns: 0, hp: 0, deaths: {}, deck: 0, relics: 0, gold: 0, dmg: 0 };
  for (let k = 0; k < N; k++) {
    const seed = (SEED * 100003 + k * 7919) >>> 0;
    const R = Run.createRun({ cls, seed });
    Run.botRun(R, mulberry(seed ^ 0x9E3779B9), SAMPLES);
    if (R.won) r.win++;
    r.act[R.act]++;
    r.floors += R.stats.floors;
    r.turns += R.stats.turns;
    r.deck += R.deck.length;
    r.relics += R.relics.length;
    r.dmg += R.stats.dmg;
    if (R.won) r.hp += R.hp / R.maxHp;
    else if (R.C) { const id = R.C.e.id; r.deaths[id] = (r.deaths[id] || 0) + 1; }
  }
  rows.push(r);
  const pct = x => `${(x / N * 100).toFixed(1)}%`;
  const reach2 = N - r.act[1], reach3 = r.act[3];
  const top = Object.entries(r.deaths).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => `${id} ${n}`).join(', ');
  console.log(`${cls.padEnd(8)} 클리어 ${pct(r.win).padStart(6)} · 2막 ${pct(reach2).padStart(6)} · 3막 ${pct(reach3).padStart(6)} · 층 ${(r.floors / N).toFixed(1)} · 턴 ${(r.turns / N).toFixed(0)} · 덱 ${(r.deck / N).toFixed(1)} · 유물 ${(r.relics / N).toFixed(1)} · 클리어 체력 ${r.win ? (r.hp / r.win * 100).toFixed(0) : '-'}% · 사망 ${top}`);
}
const avg = rows.reduce((a, r) => a + r.win, 0) / rows.length / N;
console.log(`평균 클리어 ${(avg * 100).toFixed(1)}% · ${N}판 × ${CLASSES.length}직업 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
