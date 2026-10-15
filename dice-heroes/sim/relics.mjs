// 유물 세기 — 유물 하나를 들고 출발한 봇과 없이 출발한 봇의 클리어율 차이 (1 · 2 · 3막 평균, %p)
//   node sim/relics.mjs [직업마다 판 수=40] [유물,유물...]
// 결과로 RELICS 의 희귀도(보스 +16%p 이상 · 희귀 +8 ~ 16 · 일반 그 아래)와 RELIC_POWER 를 맞춘다. 오래 걸린다 (유물 80개 × 360판)
import * as Run from '../run/rules.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a)) || 40);
const only = args.find(a => /^[a-z,]+$/.test(a))?.split(',');
function mulberry(a) { return () => { let t = (a = (a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function measure(id) {
  let s = 0, n = 0;
  for (const cls of Object.keys(Run.RUN_CLASSES)) for (let k = 0; k < N; k++) {
    const seed = (k * 7919 + 17) >>> 0;
    const R = Run.createRun({ cls, seed });
    if (id) {
      const need = Run.SPECIAL_RELIC[id];          // 특별 카드 전용 유물은 그 카드를 들고
      if (need) { const c = R.deck.find(x => Run.isSpecial(x.cat)); if (c) c.cat = need; }
      Run.gainRelic(R, id);
    }
    R.fx = [];
    Run.botRun(R, mulberry(seed ^ 0x9E3779B9));
    s += ((R.act >= 2) + (R.act >= 3) + R.won) / 3; n++;
  }
  return s / n * 100;
}
const base = measure(null);
const rows = (only || Run.RELICS.map(r => r.id)).map(id => ({ id, d: measure(id) - base })).sort((a, b) => b.d - a.d);
for (const r of rows) { const x = Run.relicInfo(r.id); console.log(`${r.d.toFixed(1).padStart(6)}  ${['', '일반', '희귀', '보스'][x.r]}  ${r.id.padEnd(12)} ${x.ko}`); }
