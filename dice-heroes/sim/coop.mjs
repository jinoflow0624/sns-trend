// 협동모드 밸런스 — 보스 × 난이도 × 인원별 승률과 토벌 라운드.
//   node sim/coop.mjs [판수=120] [보스 id: dragon|orc|lich — 생략하면 전부]
// 목표 승률(봇 기준): 쉬움 약 70~80% · 보통 약 35~45% · 매우 어려움 약 15~30%
import * as E from '../engine.js';

const N = Number(process.argv[2]) || 120;
const ONLY = process.argv[3];
function mulberry(seed) {
  return () => {
    let t = (seed = (seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = x => (100 * x).toFixed(0).padStart(4) + '%';
console.log(`\n협동모드 밸런스 — 조합당 ${N}판 (봇, 카드는 희귀도 우선)\n`);
console.log('보스            난이도        1인            2인            4인');
for (const b of E.BOSSES.filter(x => !ONLY || x.id === ONLY)) {
  for (const d of E.DIFFS) {
    const cells = [];
    for (const n of [1, 2, 4]) {
      let win = 0, rounds = 0;
      for (let g = 0; g < N; g++) {
        const rng = mulberry(7 + g * 31 + n);
        const setup = [...Array(n)].map((_, i) => ({ name: `B${i}`, cls: E.CLASSES[Math.floor(rng() * 5)].id, bot: true }));
        const s = E.createGame(setup, 900 + g, { mode: 'coop', boss: b.id, diff: d.id });
        let guard = 0;
        while (!s.ended && guard++ < 20000) E.applyBot(s, E.botAction(s, rng, 8));
        if (s.boss.won) { win++; rounds += s.round; }
      }
      cells.push(`${pct(win / N)} (R${win ? (rounds / win).toFixed(1) : '-'})`.padEnd(15));
    }
    console.log(`${b.ko.padEnd(12)} ${d.ko.padEnd(8)} ${cells.join('')}`);
  }
}
