// 밸런스 시뮬레이터 — 봇끼리 N판을 돌려 지표를 뽑는다.
//   node sim/simulate.mjs [판수=400] [인원=4] [--smart]
// 기본은 봇이 레벨업 카드를 무작위로 고른다(특성별 승률을 편향 없이 재려고).
// --smart 는 실제 게임 봇처럼 희귀도 높은 카드를 고른다.
import * as E from '../engine.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 400;
const PLAYERS = Number(args.filter(a => /^\d+$/.test(a))[1]) || 4;
const SMART = args.includes('--smart');

function mulberry(seed) {
  return () => {
    let t = (seed = (seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = x => (100 * x).toFixed(1).padStart(5) + '%';
const pad = (s, n) => String(s).padEnd(n);

const seatWins = new Array(PLAYERS).fill(0);
const cls = {};      // id → { games, wins, scores[] }
const perk = {};     // id → { owners, wins, taken }
const quest = {};    // id → 완료 횟수
const totals = [], cards = [], fames = [], lvlPts = [], levels = [], margins = [], zeros = [], upperHit = [];
const t0 = Date.now();

for (let g = 0; g < N; g++) {
  const rng = mulberry(1000 + g);
  const setup = [...Array(PLAYERS)].map((_, i) => ({
    name: `B${i}`, cls: E.CLASSES[Math.floor(rng() * E.CLASSES.length)].id, bot: true,
  }));
  const s = E.createGame(setup, 5000 + g);
  let guard = 0;
  while (!s.ended && guard++ < 10000) {
    let act = E.botAction(s, rng, 10);
    if (act.type === 'perk') act = { type: 'perk', id: E.botPickPerk(E.current(s), E.current(s).offers[0], rng, !SMART) };
    E.applyBot(s, act);
  }
  const rank = E.ranking(s);
  const top = rank[0].total;
  const winners = rank.filter(r => r.total === top).map(r => r.i);
  margins.push(top - rank[1]?.total || 0);
  s.players.forEach((p, i) => {
    const b = E.breakdown(p);
    const win = winners.includes(i) ? 1 / winners.length : 0;
    seatWins[i] += win;
    totals.push(b.total); cards.push(b.card + b.bonus); fames.push(b.fame); lvlPts.push(b.level);
    levels.push(p.level); zeros.push(p.stats.zeros); upperHit.push(b.bonus > 0 ? 1 : 0);
    const c = (cls[p.cls] ||= { games: 0, wins: 0, scores: [] });
    c.games++; c.wins += win; c.scores.push(b.total);
    for (const [id, n] of Object.entries(p.perks)) {
      const k = (perk[id] ||= { owners: 0, wins: 0, taken: 0 });
      k.owners++; k.wins += win; k.taken += n;
    }
    p.questsDone.forEach(q => (quest[q] = (quest[q] || 0) + 1));
  });
}

const base = 1 / PLAYERS;
console.log(`\n다이스 히어로즈 밸런스 리포트 — ${N}판 × ${PLAYERS}인, 카드 선택: ${SMART ? '희귀도 우선' : '무작위'}  (${((Date.now() - t0) / 1000).toFixed(1)}초)\n`);

console.log('■ 최종 점수');
console.log(`  평균 ${mean(totals).toFixed(1)} ± ${sd(totals).toFixed(1)}  (1·2위 격차 평균 ${mean(margins).toFixed(1)})`);
const share = x => pct(mean(x) / mean(totals));
console.log(`  구성: 점수표 ${mean(cards).toFixed(1)} (${share(cards)}) · 명성 ${mean(fames).toFixed(1)} (${share(fames)}) · 레벨 ${mean(lvlPts).toFixed(1)} (${share(lvlPts)})`);
console.log(`  상단 보너스 달성률 ${pct(mean(upperHit))} · 1인당 0점 기록 ${mean(zeros).toFixed(2)}회`);

console.log('\n■ 성장');
const dist = {};
levels.forEach(l => (dist[l] = (dist[l] || 0) + 1));
console.log(`  최종 레벨 평균 ${mean(levels).toFixed(2)}  (레벨업 ${(mean(levels) - 1).toFixed(2)}회 / 12턴)`);
console.log('  분포 ' + Object.keys(dist).sort((a, b) => a - b).map(l => `Lv${l} ${pct(dist[l] / levels.length).trim()}`).join('  '));

console.log('\n■ 자리 순서 승률 (기준 ' + pct(base).trim() + ')');
seatWins.forEach((w, i) => console.log(`  ${i + 1}번 자리 ${pct(w / N)}`));

console.log('\n■ 직업 (승률 / 평균 점수)');
Object.entries(cls).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games).forEach(([id, c]) => {
  const wr = c.wins / c.games;
  const flag = Math.abs(wr - base) > 0.05 ? (wr > base ? '  ▲ 강함' : '  ▼ 약함') : '';
  console.log(`  ${pad(E.classInfo(id).ko, 6)} ${pct(wr)}  ${mean(c.scores).toFixed(1).padStart(6)}  (n=${c.games})${flag}`);
});

console.log('\n■ 특성 (보유자 승률 — 기준보다 크게 높으면 너무 셈)');
Object.entries(perk).sort((a, b) => b[1].wins / b[1].owners - a[1].wins / a[1].owners).forEach(([id, k]) => {
  const wr = k.wins / k.owners;
  const flag = wr > base + 0.08 ? '  ▲' : wr < base - 0.06 ? '  ▼' : '';
  const info = E.perkInfo(id);
  console.log(`  ${pad(info.ko, 9)} ${pad(E.RARITY[info.rarity].ko, 3)} ${pct(wr)}  (보유 ${k.owners})${flag}`);
});

console.log('\n■ 퀘스트 완료 횟수 (판당)');
E.QUESTS.map(q => [q, (quest[q.id] || 0) / N]).sort((a, b) => b[1] - a[1])
  .forEach(([q, n]) => console.log(`  ${pad(q.ko, 8)} ${n.toFixed(2).padStart(5)}  명성 ${q.fame}`));
