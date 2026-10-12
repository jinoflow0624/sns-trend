// 도전과제 — 게임(app.js · wallet.js)과 서버(dice-heroes-prod/functions)가 같은 파일을 쓴다.
// 서버 사본은 dice-heroes-prod/build.mjs 가 functions/shared/ 로 복사한다 (여기만 고치면 된다).
//
// 진행도는 지갑의 ach 에 쌓인다: { n: { 키: 누적 수 }, m: { 키: 최고 기록 }, got: { 과제 id: 받은 시각 } }
//   · 한 판이 끝나 보석을 정산할 때(claimRun) 그 판의 기록(statsOf)을 더한다 — 정산되지 않은 판(오프라인 · 튜토리얼)은 세지 않는다
//   · 온라인 방 판은 서버가 방 기록에서 직접 센다. 오프라인 판은 앱이 보낸 값을 한 판 상한(PER_GAME)으로 자른다
//   · 보상은 '받기'를 눌러야 들어온다 (서버가 진행도를 다시 확인한다)

// 난이도별 보석 (1 쉬움 · 2 보통 · 3 어려움 · 4 전설)
export const TIER = {
  1: { ko: '브론즈', gems: 50, color: '#D08A4A' },
  2: { ko: '실버', gems: 100, color: '#C8D2E6' },
  3: { ko: '골드', gems: 200, color: '#FFD24A' },
  4: { ko: '전설', gems: 400, color: '#FF6FB5' },
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
const BOSS_KO = { dragon: '화염룡', orc: '오크 대족장', lich: '리치' };
const BOSS_OBJ = { dragon: '화염룡을', orc: '오크 대족장을', lich: '리치를' };

const A = [];
const add = (cat, id, tier, ko, desc, goal, prog, opt = {}) => A.push({ cat, id, tier, ko, desc, goal, prog, ...opt });
const sum = key => ach => ach?.n?.[key] || 0;
const best = key => ach => ach?.m?.[key] || 0;
// 보스 등급: 보통 이상 난이도에서 받은 가장 좋은 등급
const bossBest = (boss, minDiff = 1) => ach => Math.max(0, ...[0, 1, 2].filter(d => d >= minDiff).map(d => ach?.m?.[`b:${boss}:${d}`] || 0));

// ── 족보 (3단계) ──
const COMBO = [
  ['yacht', '요트', [1, 10, 50]],
  ['lstr', '라지 스트레이트', [5, 30, 100]],
  ['four', '포카인드', [5, 30, 100]],
  ['full', '풀하우스', [10, 50, 150]],
  ['sstr', '스몰 스트레이트', [10, 50, 150]],
];
const STEP_KO = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
for (const [cat, ko, goals] of COMBO) goals.forEach((g, k) =>
  add('combo', `c_${cat}_${k + 1}`, k + 1, `${ko} ${STEP_KO[k]}`, `${ko}를 ${g}번 기록 (0점 제외)`, g, sum(`c_${cat}`), { series: `c_${cat}` }));
add('combo', 'y6', 2, '여섯의 왕', '6 다섯 개로 요트', 1, sum('y6'));
add('combo', 'y1', 2, '뱀눈 요트', '1 다섯 개로 요트', 1, sum('y1'));
add('combo', 'collect', 2, '족보 수집가', '한 판에 요트 · 라지 스트레이트 · 풀하우스 · 포카인드를 모두 기록', 1, sum('collect'));
add('combo', 'clean', 2, '빈칸 없는 점수표', '한 판의 12칸을 모두 0점 없이 채우기', 1, sum('clean'));
[[1, 1], [20, 2], [100, 3]].forEach(([g, t], k) =>
  add('combo', `upper_${k + 1}`, t, `상단 보너스 ${STEP_KO[k]}`, `상단 보너스(+35)를 ${g}번 달성`, g, sum('upper'), { series: 'upper' }));

// ── 의뢰 · 성장 ──
[[10, 1], [100, 2], [500, 3]].forEach(([g, t], k) =>
  add('quest', `quest_${k + 1}`, t, `의뢰 해결사 ${STEP_KO[k]}`, `의뢰 게시판 의뢰를 모두 합쳐 ${g}번 달성`, g, sum('quests'), { series: 'quest' }));
add('quest', 'lvmax', 2, '최고 레벨', '한 판에서 레벨 10 달성', 10, best('level'));

// ── 보스 토벌 (보통 이상 난이도) ──
for (const b of BASE_BOSSES) [['B', 1], ['A', 2], ['S', 3]].forEach(([gr, t]) =>
  add('boss', `${b}_${gr}`, t, `${BOSS_KO[b]} ${gr}등급`, `${BOSS_OBJ[b]} 보통 이상 난이도에서 ${gr === 'S' ? 'S' : `${gr} 이상`} 등급으로 토벌`, GRADE_RANK[gr], bossBest(b), { nobar: true, series: `boss_${b}` }));
// 강화 보스 (보통 이상): 실버 · 골드 · 골드
const UP_KO = { hydra: ['세머리 용', '세머리 용을'], cyclops: ['키클롭스', '키클롭스를'], overlord: ['오버로드', '오버로드를'] };
for (const [b, [ko, obj]] of Object.entries(UP_KO)) [['B', 2], ['A', 3], ['S', 3]].forEach(([gr, t]) =>
  add('boss', `${b}_${gr}`, t, `${ko} ${gr}등급`, `${obj} ${gr === 'S' ? 'S' : `${gr} 이상`} 등급으로 토벌`, GRADE_RANK[gr], bossBest(b), { nobar: true, series: `boss_${b}` }));
// 마신 릴리스 (보통 이상): 마왕을 어려움으로 깨기 전에는 숨긴다
[['B', 3], ['A', 4], ['S', 4]].forEach(([gr, t]) =>
  add('boss', `archdemon_${gr}`, t, `마신 ${gr}등급`, `마신 릴리스를 ${gr === 'S' ? 'S' : `${gr} 이상`} 등급으로 토벌`, GRADE_RANK[gr], bossBest('archdemon'), { nobar: true, series: 'boss_archdemon', secret: 'archdemon' }));
add('boss', 'unseal', 3, '봉인 해제', '화염룡 · 오크 대족장 · 리치를 모두 어려움으로 토벌', 3,
  ach => BASE_BOSSES.filter(b => (ach?.m?.[`b:${b}:2`] || 0) > 0).length);
// 마왕: 스포일러 방지 — 마왕 봉인이 풀리기 전에는 목록에 나오지 않는다 (secret)
const DEMON = { series: 'demon', secret: 'demon' };
add('boss', 'demon_clear', 3, '마왕 토벌', '마왕 릴리스를 토벌 (난이도 무관)', 1, bossBest('demon', 0), DEMON);
add('boss', 'demon_A', 4, '밤의 끝', '마왕 릴리스를 어려움에서 A 이상 등급으로 토벌', 2, bossBest('demon', 2), { ...DEMON, nobar: true });
add('boss', 'demon_S', 4, '전설의 용사', '마왕 릴리스를 어려움에서 S 등급으로 토벌', 3, bossBest('demon', 2), { ...DEMON, nobar: true });
[[1, 1], [30, 2], [150, 3]].forEach(([g, t], k) =>
  add('boss', `coop_${k + 1}`, t, `토벌대 ${STEP_KO[k]}`, `협동 보스를 ${g}번 토벌`, g, sum('coopWin'), { series: 'coop' }));

// ── 대전 ──
[[1, 1], [20, 2], [100, 3]].forEach(([g, t], k) =>
  add('versus', `vs_${k + 1}`, t, `승부사 ${STEP_KO[k]}`, `대전에서 ${g}번 승리 (클래식 포함)`, g, sum('vsWin'), { series: 'vs' }));
add('versus', 'cl_1', 1, '클래식 입문', '클래식 야추에서 승리', 1, sum('clWin'), { series: 'cl' });
add('versus', 'cl_2', 2, '클래식 고수', '클래식 야추에서 20번 승리', 20, sum('clWin'), { series: 'cl' });
add('versus', 'on_10', 2, '온라인 강자', '온라인 방 대전에서 사람을 상대로 10번 승리', 10, sum('onWin'));
add('versus', 'score300', 2, '300점 클럽', '대전 최종 점수 300점 이상', 300, best('score'), { series: 'score' });
add('versus', 'score400', 3, '400점 클럽', '대전 최종 점수 400점 이상', 400, best('score'), { series: 'score' });
add('versus', 'cl250', 3, '클래식 250', '클래식 야추에서 250점 이상', 250, best('clScore'));

// ── 꾸준함 ──
[[10, 1], [100, 2], [500, 3]].forEach(([g, t], k) =>
  add('play', `games_${k + 1}`, t, `모험가 ${STEP_KO[k]}`, `${g}판 끝까지 하기 (보석을 받은 판)`, g, sum('games'), { series: 'games' }));

export const ACHIEVEMENTS = A;
export const ACH_CATS = [['combo', '족보'], ['quest', '성장'], ['boss', '보스'], ['versus', '대전'], ['play', '꾸준함']];
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
