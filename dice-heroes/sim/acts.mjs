// 원정 막별 클리어율 — 초회차(성장 없음) 기준, 직업마다 1막 · 2막 · 3막 클리어율과 어디서 죽었나 (일반 · 엘리트 · 보스)
//   node sim/acts.mjs [판 수=200] [직업,직업...]
// 목표 (CLAUDE.md): 직업마다 1막 50% · 2막 25% · 3막 5%, 죽음은 대부분 보스전, 한 턴에 체력 절반 이상 잃고 죽는 '돌연사'는 적게
// 덮어쓰기 시험: OV='{"tune":{"hp":{"boss":[0.9,1,1.3]}},"hp":{"gambler":100},"ct":{"betMul":1.7}}' node sim/acts.mjs
import * as Run from '../run/rules.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a)) || 200);
const CLASSES = args.find(a => /^[a-z,]+$/.test(a))?.split(',') || Object.keys(Run.RUN_CLASSES);
const OV = JSON.parse(process.env.OV || '{}');
for (const k of ['hp', 'atk']) if (OV.tune?.[k]) Object.assign(Run.TUNE[k], OV.tune[k]);
for (const [c, v] of Object.entries(OV.hp || {})) Run.RUN_CLASSES[c].hp = v;
Object.assign(Run.CLASS_TUNE, OV.ct || {});
function mulberry(a) { return () => { let t = (a = (a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const pct = x => `${(x * 100).toFixed(0)}%`.padStart(4);
const sum = [0, 0, 0];
for (const cls of CLASSES) {
  const r = { a2: 0, a3: 0, win: 0, die: { normal: 0, elite: 0, boss: 0 }, turns: 0, big: 0, sudden: 0, maxHit: 0 };
  for (let k = 0; k < N; k++) {
    const seed = (k * 7919 + 101) >>> 0;
    const R = Run.createRun({ cls, seed });
    // botRun 과 같은 흐름에서 적의 한 턴 피해를 잰다 (한 턴에 최대 체력의 절반 이상 = 돌연사 위험)
    const rng = mulberry(seed ^ 0x9E3779B9);
    let steps = 0, lastBig = false;
    while (!R.ended && steps++ < 20000) {
      if (R.phase === 'combat') Run.applyCombat(R, Run.botCombat(R, rng, 12)); else Run.botRunStep(R, rng);
      for (const f of R.fx) if (f.type === 'enemy' && f.hits?.length) {
        const dmg = f.hits.reduce((a, h) => a + h.dmg, 0);
        r.turns++;
        lastBig = dmg >= R.maxHp * 0.5;
        if (lastBig) r.big++;
        r.maxHit = Math.max(r.maxHit, dmg / R.maxHp);
      }
      R.fx.length = 0;
    }
    if (!R.won && lastBig) r.sudden++;
    r.a2 += R.act >= 2; r.a3 += R.act >= 3; r.win += R.won;
    if (!R.won && R.C) r.die[Run.ENEMIES[R.C.e.id].kind]++;
  }
  const d = N - r.win || 1;
  console.log(`${cls.padEnd(8)} 1막 ${pct(r.a2 / N)} · 2막 ${pct(r.a3 / N)} · 3막 ${pct(r.win / N)}   죽음: 일반 ${pct(r.die.normal / d)} 엘리트 ${pct(r.die.elite / d)} 보스 ${pct(r.die.boss / d)}   한 방 50%+ 죽음 ${pct(r.sudden / d)} · 그런 턴 ${(r.big / r.turns * 1000).toFixed(1)}‰`);
  sum[0] += r.a2 / N; sum[1] += r.a3 / N; sum[2] += r.win / N;
}
console.log(`평균     1막 ${pct(sum[0] / CLASSES.length)} · 2막 ${pct(sum[1] / CLASSES.length)} · 3막 ${pct(sum[2] / CLASSES.length)}`);
