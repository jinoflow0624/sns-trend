import { t as TR } from './i18n.js';
// 도전과제 — 게임(app.js · wallet.js)과 서버(dice-heroes-prod/functions)가 같은 파일을 쓴다.
// 서버 사본은 dice-heroes-prod/build.mjs 가 functions/shared/ 로 복사한다 (여기만 고치면 된다).
//
// 진행도는 지갑의 ach 에 쌓인다: { n: { 키: 누적 수 }, m: { 키: 최고 기록 }, got: { 과제 id: 받은 시각 } }
//   · 한 판이 끝나 보석을 정산할 때(claimRun) 그 판의 기록(statsOf)을 더한다 — 정산되지 않은 판(오프라인 · 튜토리얼)은 세지 않는다
//   · 온라인 방 판은 서버가 방 기록에서 직접 센다. 오프라인 판은 앱이 보낸 값을 한 판 상한(PER_GAME)으로 자른다
//   · 보상은 '받기'를 눌러야 들어온다 (서버가 진행도를 다시 확인한다)

// 난이도별 보석 (1 쉬움 · 2 보통 · 3 어려움 · 4 전설)
export const TIER = {
  1: { ko: TR('브론즈'), gems: 50, color: '#D08A4A' },
  2: { ko: TR('실버'), gems: 100, color: '#C8D2E6' },
  3: { ko: TR('골드'), gems: 200, color: '#FFD24A' },
  4: { ko: TR('전설'), gems: 400, color: '#FF6FB5' },
};

// 한 판에서 쌓을 수 있는 최대치 (오프라인 판 값 검사)
export const PER_GAME = {
  games: 1, quests: 40, upper: 1, clean: 1, collect: 1, y6: 1, y1: 1,
  c_four: 1, c_full: 1, c_sstr: 1, c_lstr: 1, c_yacht: 1,
  vsWin: 1, clWin: 1, onWin: 1, coopWin: 1,
};
// 누적이 아니라 '최고 기록'으로 남기는 키 (b:<보스>:<난이도> = 토벌 등급 1 B · 2 A · 3 S)
export const MAX_CAP = { score: 1500, clScore: 400, level: 10 };
export const GRADE_RANK = { B: 1, A: 2, S: 3 };
export const BASE_BOSSES = ['dragon', 'orc', 'lich'];
const BOSS_KO = { dragon: TR('화염룡'), orc: TR('오크 대족장'), lich: TR('리치') };
const BOSS_OBJ = { dragon: TR('화염룡을'), orc: TR('오크 대족장을'), lich: TR('리치를') };

const A = [];
const add = (cat, id, tier, ko, desc, goal, prog, opt = {}) => A.push({ cat, id, tier, ko, desc, goal, prog, ...opt });
const sum = key => ach => ach?.n?.[key] || 0;
const best = key => ach => ach?.m?.[key] || 0;
// 보스 등급: 보통 이상 난이도에서 받은 가장 좋은 등급
const bossBest = (boss, minDiff = 1) => ach => Math.max(0, ...[0, 1, 2].filter(d => d >= minDiff).map(d => ach?.m?.[`b:${boss}:${d}`] || 0));

// ── 족보 (3단계) ──
const COMBO = [
  ['yacht', TR('요트'), [1, 10, 50]],
  ['lstr', TR('라지 스트레이트'), [5, 30, 100]],
  ['four', TR('포카인드'), [5, 30, 100]],
  ['full', TR('풀하우스'), [10, 50, 150]],
  ['sstr', TR('스몰 스트레이트'), [10, 50, 150]],
];
const STEP_KO = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
for (const [cat, ko, goals] of COMBO) goals.forEach((g, k) =>
  add('combo', `c_${cat}_${k + 1}`, k + 1, `${ko} ${STEP_KO[k]}`, TR('{0}를 {1}번 기록 (0점 제외)', ko, g), g, sum(`c_${cat}`), { series: `c_${cat}` }));
add('combo', 'y6', 2, TR('여섯의 왕'), TR('6 다섯 개로 요트'), 1, sum('y6'));
add('combo', 'y1', 2, TR('뱀눈 요트'), TR('1 다섯 개로 요트'), 1, sum('y1'));
add('combo', 'collect', 2, TR('족보 수집가'), TR('한 판에 요트 · 라지 스트레이트 · 풀하우스 · 포카인드를 모두 기록'), 1, sum('collect'));
add('combo', 'clean', 2, TR('빈칸 없는 점수표'), TR('한 판의 12칸을 모두 0점 없이 채우기'), 1, sum('clean'));
[[1, 1], [20, 2], [100, 3]].forEach(([g, t], k) =>
  add('combo', `upper_${k + 1}`, t, TR('상단 보너스 {0}', STEP_KO[k]), TR('상단 보너스(+35)를 {0}번 달성', g), g, sum('upper'), { series: 'upper' }));

// ── 의뢰 · 성장 ──
[[10, 1], [100, 2], [500, 3]].forEach(([g, t], k) =>
  add('quest', `quest_${k + 1}`, t, TR('의뢰 해결사 {0}', STEP_KO[k]), TR('의뢰 게시판 의뢰를 모두 합쳐 {0}번 달성', g), g, sum('quests'), { series: 'quest' }));
add('quest', 'lvmax', 2, TR('최고 레벨'), TR('한 판에서 레벨 10 달성'), 10, best('level'));

// ── 보스 토벌 (보통 이상 난이도) ──
for (const b of BASE_BOSSES) [['B', 1], ['A', 2], ['S', 3]].forEach(([gr, t]) =>
  add('boss', `${b}_${gr}`, t, TR('{0} {1}등급', BOSS_KO[b], gr), TR('{0} 보통 이상 난이도에서 {1} 등급으로 토벌', BOSS_OBJ[b], gr === 'S' ? 'S' : TR('{0} 이상', gr)), GRADE_RANK[gr], bossBest(b), { nobar: true, series: `boss_${b}` }));
// 강화 보스 (보통 이상): 실버 · 골드 · 골드
const UP_KO = { hydra: [TR('세머리 용'), TR('세머리 용을')], cyclops: [TR('키클롭스'), TR('키클롭스를')], overlord: [TR('오버로드'), TR('오버로드를')] };
for (const [b, [ko, obj]] of Object.entries(UP_KO)) [['B', 2], ['A', 3], ['S', 3]].forEach(([gr, t]) =>
  add('boss', `${b}_${gr}`, t, TR('{0} {1}등급', ko, gr), TR('{0} {1} 등급으로 토벌', obj, gr === 'S' ? 'S' : TR('{0} 이상', gr)), GRADE_RANK[gr], bossBest(b), { nobar: true, series: `boss_${b}` }));
// 마신 릴리스 (보통 이상): 마왕을 어려움으로 깨기 전에는 숨긴다
[['B', 3], ['A', 4], ['S', 4]].forEach(([gr, t]) =>
  add('boss', `archdemon_${gr}`, t, TR('마신 {0}등급', gr), TR('마신 릴리스를 {0} 등급으로 토벌', gr === 'S' ? 'S' : TR('{0} 이상', gr)), GRADE_RANK[gr], bossBest('archdemon'), { nobar: true, series: 'boss_archdemon', secret: 'archdemon' }));
add('boss', 'unseal', 3, TR('봉인 해제'), TR('화염룡 · 오크 대족장 · 리치를 모두 어려움으로 토벌'), 3,
  ach => BASE_BOSSES.filter(b => (ach?.m?.[`b:${b}:2`] || 0) > 0).length);
// 마왕: 스포일러 방지 — 마왕 봉인이 풀리기 전에는 목록에 나오지 않는다 (secret)
const DEMON = { series: 'demon', secret: 'demon' };
add('boss', 'demon_clear', 3, TR('마왕 토벌'), TR('마왕 릴리스를 토벌 (난이도 무관)'), 1, bossBest('demon', 0), DEMON);
add('boss', 'demon_A', 4, TR('밤의 끝'), TR('마왕 릴리스를 어려움에서 A 이상 등급으로 토벌'), 2, bossBest('demon', 2), { ...DEMON, nobar: true });
add('boss', 'demon_S', 4, TR('전설의 용사'), TR('마왕 릴리스를 어려움에서 S 등급으로 토벌'), 3, bossBest('demon', 2), { ...DEMON, nobar: true });
[[1, 1], [30, 2], [150, 3]].forEach(([g, t], k) =>
  add('boss', `coop_${k + 1}`, t, TR('토벌대 {0}', STEP_KO[k]), TR('협동 보스를 {0}번 토벌', g), g, sum('coopWin'), { series: 'coop' }));

// ── 대전 ──
[[1, 1], [20, 2], [100, 3]].forEach(([g, t], k) =>
  add('versus', `vs_${k + 1}`, t, TR('승부사 {0}', STEP_KO[k]), TR('대전에서 {0}번 승리 (클래식 포함)', g), g, sum('vsWin'), { series: 'vs' }));
add('versus', 'cl_1', 1, TR('클래식 입문'), TR('클래식 야추에서 승리'), 1, sum('clWin'), { series: 'cl' });
add('versus', 'cl_2', 2, TR('클래식 고수'), TR('클래식 야추에서 20번 승리'), 20, sum('clWin'), { series: 'cl' });
add('versus', 'on_10', 2, TR('온라인 강자'), TR('온라인 방 대전에서 사람을 상대로 10번 승리'), 10, sum('onWin'));
add('versus', 'score300', 2, TR('300점 클럽'), TR('대전 최종 점수 300점 이상'), 300, best('score'), { series: 'score' });
add('versus', 'score400', 3, TR('400점 클럽'), TR('대전 최종 점수 400점 이상'), 400, best('score'), { series: 'score' });
add('versus', 'cl250', 3, TR('클래식 250'), TR('클래식 야추에서 250점 이상'), 250, best('clScore'));

// ── 꾸준함 ──
[[10, 1], [100, 2], [500, 3]].forEach(([g, t], k) =>
  add('play', `games_${k + 1}`, t, TR('모험가 {0}', STEP_KO[k]), TR('{0}판 끝까지 하기 (보석을 받은 판)', g), g, sum('games'), { series: 'games' }));

// ── 원정 (로그라이크) — 원정 기록(run/rules.js 의 progress.best)에서 syncRunAch 로 ach.m['r:…'] 에 옮긴다.
//    배포판은 서버가 원정 끝(xFinish)에 행동 기록을 다시 돌려 계산한 기록으로만 옮긴다. 원정이 없는 곳에서는 숨긴다 (secret 'run')
const RUN = { secret: 'run' };
add('run', 'run_act1', 1, TR('숲을 지나'), TR('원정 1막 돌파'), 9, best('r:top'), { ...RUN, nobar: true, series: 'run_act' });
add('run', 'run_act2', 2, TR('폐허를 지나'), TR('원정 2막 돌파'), 17, best('r:top'), { ...RUN, nobar: true, series: 'run_act' });
[[1, 2], [10, 3], [30, 4]].forEach(([g, t], k) =>
  add('run', `run_win_${k + 1}`, t, TR('마왕 토벌 원정 {0}', STEP_KO[k]), TR('원정을 {0}번 클리어', g), g, best('r:wins'), { ...RUN, series: 'run_win' }));
[[10, 1], [50, 2], [150, 3]].forEach(([g, t], k) =>
  add('run', `run_runs_${k + 1}`, t, TR('원정대 {0}', STEP_KO[k]), TR('원정을 {0}번 떠나기', g), g, best('r:runs'), { ...RUN, series: 'run_runs' }));
[[3, 2], [6, 3], [9, 4]].forEach(([g, t], k) =>
  add('run', `run_cls_${k + 1}`, t, TR('만능 원정가 {0}', STEP_KO[k]), TR('서로 다른 직업 {0}개로 원정 클리어', g), g, best('r:cls'), { ...RUN, series: 'run_cls' }));
[[1, 2], [5, 3], [10, 4]].forEach(([g, t], k) =>
  add('run', `run_asc_${k + 1}`, t, TR('하드모드 정복자 {0}', STEP_KO[k]), TR('하드모드 {0} 이상으로 원정 클리어', g), g, best('r:asc'), { ...RUN, nobar: g === 1, series: 'run_asc' }));
[[6, 2], [12, 3]].forEach(([g, t], k) =>
  add('run', `run_feat_${k + 1}`, t, TR('원정 개척자 {0}', STEP_KO[k]), TR('원정 도전과제(원정 화면의 업적) {0}개 달성', g), g, best('r:feats'), { ...RUN, series: 'run_feat' }));
// 원정 기록 → 도전과제 진행도 (늘기만 한다)
export function syncRunAch(ach, p) {
  const b = p?.best;
  if (!ach || !b) return ach;
  ach.n ||= {}; ach.m ||= {}; ach.got ||= {};
  const v = {
    'r:top': b.top || 0, 'r:wins': b.wins || 0, 'r:runs': b.runs || 0,
    'r:cls': Object.values(b.cls || {}).filter(c => c.wins > 0).length,
    'r:asc': Math.max(0, ...Object.values(b.asc || {})),
    'r:feats': (b.feats || []).length,
  };
  for (const [k, x] of Object.entries(v)) ach.m[k] = Math.max(ach.m[k] || 0, Math.floor(Number(x) || 0));
  return ach;
}

export const ACHIEVEMENTS = A;
export const ACH_CATS = [['combo', TR('족보')], ['quest', TR('성장')], ['boss', TR('보스')], ['versus', TR('대전')], ['play', TR('꾸준함')], ['run', TR('원정')]];
export const achInfo = id => A.find(a => a.id === id);
export const achGems = a => TIER[a.tier].gems;
export const achProgress = (a, ach) => Math.min(a.goal, a.prog(ach));
export const achDone = (a, ach) => a.prog(ach) >= a.goal;
// open: 열린 비밀 묶음 (예: { demon: true }) — 닫힌 비밀 과제는 '받을 보상'에도 세지 않는다
export const achShown = (a, open = {}) => !a.secret || !!open[a.secret];
export const achClaimable = (ach, open) => A.filter(a => achDone(a, ach) && !ach?.got?.[a.id] && (!open || achShown(a, open)));
// 화면 블록: 단계 묶음(series)은 블록 하나로 — 아직 안 받은 가장 낮은 단계를 보여 준다 (다 받았으면 마지막 단계)
export function achBlocks(ach, open = {}) {
  const out = [], seen = new Map();
  for (const a of A) {
    if (!achShown(a, open)) continue;
    if (!a.series) { out.push({ steps: [a] }); continue; }
    if (!seen.has(a.series)) { const b = { steps: [] }; seen.set(a.series, b); out.push(b); }
    seen.get(a.series).steps.push(a);
  }
  for (const b of out) {
    const k = b.steps.findIndex(a => !ach?.got?.[a.id]);
    b.step = k < 0 ? b.steps.length - 1 : k;
    b.a = b.steps[b.step];
  }
  return out;
}

// 한 판 기록을 지갑의 ach 에 더한다. st: statsOf 결과 (서버는 cleanStats 를 거친 값)
export function mergeAch(w, st) {
  const ach = (w.ach ||= {});
  ach.n ||= {}; ach.m ||= {}; ach.got ||= {};
  for (const [k, v] of Object.entries(st)) {
    if (!(v > 0)) continue;
    if (k in PER_GAME) ach.n[k] = (ach.n[k] || 0) + v;
    else if (k in MAX_CAP || k.startsWith('b:')) ach.m[k] = Math.max(ach.m[k] || 0, v);
  }
  return ach;
}
// 오프라인 판 값 검사: 아는 키만, 한 판 상한으로 자른다. 보스 등급은 시작 기록의 보스 · 난이도만
export function cleanStats(st, { mode, boss, diff, win }) {
  const out = {};
  if (!st || typeof st !== 'object') return out;
  const n = v => Math.max(0, Math.floor(Number(v) || 0));
  for (const [k, cap] of Object.entries(PER_GAME)) if (st[k]) out[k] = Math.min(cap, n(st[k]));
  for (const [k, cap] of Object.entries(MAX_CAP)) if (st[k]) out[k] = Math.min(cap, n(st[k]));
  out.onWin = 0;                                      // 온라인 승리는 방 기록으로만
  if (mode !== 'versus' || !win) { out.vsWin = 0; out.clWin = 0; out.score = mode === 'versus' ? out.score : 0; out.clScore = mode === 'versus' ? out.clScore : 0; }
  if (mode !== 'coop' || !win) out.coopWin = 0;
  const bk = `b:${boss}:${diff}`;
  if (mode === 'coop' && win && st[bk]) out[bk] = Math.min(3, n(st[bk]));
  return out;
}
