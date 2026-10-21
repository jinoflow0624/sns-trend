// 원정 (로그라이크) 룰 엔진 — 테스트판 전용 (배포판 빌드에는 run/ 폴더를 넣지 않는다).
//
// 한 판 = 영웅 하나로 3막을 끝까지 가는 원정. 막마다 갈림길 지도(6층 + 보스)를 골라 가며
// 전투 · 엘리트 · 이벤트 · 상점 · 휴식 · 보물 칸을 지나고, 막 끝에서 보스를 쓰러뜨린다.
//
// 전투: 매 턴 덱에서 족보 카드 4장을 뽑고 주사위를 최대 3번 굴린 뒤, 카드 1장을 낸다.
//   적에게 끌어다 놓으면 공격(점수 = 피해), 영웅에게 끌어다 놓으면 방어(점수 = 보호막).
//   그다음 적이 미리 보여 준 행동(의도)을 한다. 영웅 체력이 0 이 되면 원정 실패.
//
// DOM 이 없는 순수 로직이라 브라우저 · Node 테스트 · 밸런스 시뮬레이션에서 똑같이 돈다.
// 상태(R)는 전부 평범한 JSON(난수 상태 포함)이라 그대로 저장했다가 이어 할 수 있다.
import { CAT_IDS, catInfo, baseScore, fiveSets, isCombo, RUSH_CATS } from '../engine.js';

export const HAND = 4;            // 손패
export const ROLLS = 3;           // 턴마다 굴림
export const TOOL_CAP = 5;        // 뒤집기 · 조정 보유 한도 (원정 내내 이어진다)
export const POTION_SLOTS = 3;
export const UP_MUL = 0.3;        // 강화(+) 카드: 점수 +30%
export const ROWS = 7;            // 막마다 지도 층 수 (그 위에 보스 층)
export const COLS = 4;
export const ACTS = 3;
export const REST_HEAL = 0.3;     // 휴식: 최대 체력의 30%
export const ACT_HEAL = 0.6;      // 막을 넘어갈 때: 잃은 체력의 60%
export const DANCE_NEED = 25, DANCE_CAP = 3;
export const BURN_TURNS = 3;
export const GUARD_MUL = 0.5;     // 수호: 방어로 돌린 점수의 보호막 +50%
export const HYDRA_CUT = 30;      // 세머리 용: 카드 한 장으로 이만큼 피해를 주면 이번 턴의 머리가 잘린다
// 격앙: 전투가 길어지면 적이 턴마다 힘을 얻는다 (막기만 하며 버티는 것을 막는다). from 턴부터 적의 턴이 끝날 때마다 힘 +str
export const FURY = { normal: { from: 5, str: 1 }, elite: { from: 6, str: 2 }, boss: { from: 8, str: 2 }, special: { from: 7, str: 2 } };
// ── 히든 보스 「시공 광대」 (지도에 없다. 칸에 들어갈 때 끼어든다 — 이긴 뒤 · 쓰러진 뒤 원래 가려던 칸으로) ──
//   3번째 원정부터 1 · 2막에서 칸에 들어갈 때마다 JESTER_P 확률, 4번째 원정은 2막 중간(JESTER_ROW 층 이상)에서 한 번 반드시.
//   한 원정에 한 번만. 져도 원정은 끝나지 않는다 — 체력 절반으로 일어나 보상 없이 원래 칸으로
export const JESTER_P = 0.005, JESTER_FROM = 3, JESTER_FIXED = 4, JESTER_ROW = 4;
export const JESTER_DODGE = 0.3;           // 카드 공격을 30% 확률로 피한다
export const JESTER_DARE = 1.5;            // 광대 카드로 공격하면 피해 ×1.5
export const JESTER_SHUFFLE = 0.4;         // 턴마다 이 확률로 몰래 손패를 섞는다 (첫 · 두 번째 굴림 뒤 중 하나)
export const jesterPrize = act => ({ stars: 50 + (act - 1) * 25, gems: 50 + (act - 1) * 25 });

// ── 난수 (상태에 들어 있는 시드로 돈다) ─────────────────────────────────────
export function rand(R) {
  let t = (R.rng = (R.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (R, a, b) => a + Math.floor(rand(R) * (b - a + 1));
const pick = (R, arr) => arr[Math.floor(rand(R) * arr.length)];
const die = R => 1 + Math.floor(rand(R) * 6);
// 주사위 한 개 굴리기. 「주사위 깎는 노인」 이벤트로 면을 바꾼 주사위는 그 면들 중 하나가 나온다 (R.dfaces[주사위 번호] = 6면)
function rollFace(R, i) {
  const f = R.dfaces?.[i];
  return f ? f[Math.floor(rand(R) * 6)] : die(R);
}
export const DIE_FACES = [1, 2, 3, 4, 5, 6];
export const facesOf = (R, i) => R.dfaces?.[i] || DIE_FACES;
function shuffle(R, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(R) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// { 값: 가중치 } 에서 하나
function weighted(R, table) {
  const ents = Object.entries(table).filter(([, w]) => w > 0);
  let x = rand(R) * ents.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of ents) { x -= w; if (x < 0) return k; }
  return ents[ents.length - 1][0];
}
const fail = msg => { throw new Error(msg); };
const fx = (R, e) => R.fx.push(e);
function log(R, text) {
  R.log.push(text);
  if (R.log.length > 60) R.log.shift();
}

// ── 행동 기록 · 재현 (서버 검증) ─────────────────────────────────────────────
// 플레이어 행동(아래 act 로 감싼 함수)은 성공할 때마다 R.acts 에 [이름, 인자…] 로 남는다.
// 규칙이 결정적(난수는 R.rng 하나)이라, 서버는 시드 · 직업 · 승천 · 원정 준비 + 행동 기록만으로 판을 처음부터 다시 돌려
// 결과(승패 · 층 · 보스 · 도전과제 · 별조각)를 직접 계산한다 — 기기에서 숫자를 고쳐도 소용없다.
const ACTIONS = {};
let depth = 0;
function act(name, fn) {
  ACTIONS[name] = fn;
  return (R, ...a) => {
    depth++;
    try {
      const out = fn(R, ...a);
      if (depth === 1) (R.acts ||= []).push([name, ...a]);
      return out;
    } finally { depth--; }
  };
}
// 원정 포기 (행동으로 남긴다)
export const giveUp = act('giveUp', R => { if (R.ended) fail('이미 끝난 원정이에요.'); loseRun(R); });
export function replay({ seed, cls, asc = 0, meta = null, acts = [] }) {
  const R = createRun({ cls, seed, asc, meta, name: '' });
  for (const [name, ...a] of acts) {
    const f = ACTIONS[name];
    if (!f) fail(`모르는 행동: ${name}`);
    depth++;
    try { f(R, ...a); } finally { depth--; }
    R.fx = [];
    if (R.ended) break;
  }
  return R;
}

// ── 인장 (족보 카드에 붙이는 일회용 효과. 붙은 카드를 한 번 내면 터지고 사라진다) ──
export const SEALS = {
  sun:   { ko: '해 인장',   icon: 'sun',     color: '#FFB020', desc: '이 카드 점수 ×1.5' },
  moon:  { ko: '달 인장',   icon: 'sparkle', color: '#B9C8FF', desc: '낸 뒤, 이 카드의 달빛 복사본이 다음 턴 손패로 온다 (복사본은 한 번 쓰면 달이 지듯 사라진다)' },
  star:  { ko: '별 인장',   icon: 'star',    color: '#FFE27A', desc: '골드 +15' },
  cloud: { ko: '구름 인장', icon: 'fog',     color: '#CFE6FF', desc: '보호막 +20' },
};
export const SEAL_IDS = Object.keys(SEALS);
export const sealInfo = id => SEALS[id];
export const SEAL_PRICE = 30;

// ── 막 징조 (막을 시작할 때 2장 중 1장. 그 막 내내 깔린다) ──
// tier: 1 순함 ~ 3 거침. 1막은 순한 것 위주, 3막은 거친 것 위주로 뽑는다
export const OMENS = [
  { id: 'feast',    ko: '피의 축제',     icon: 'anger',   tier: 3, desc: '모든 카드 +50% (합연산) · 받는 피해 ×1.5' },
  { id: 'bounty',   ko: '풍요의 땅',     icon: 'leaf',    tier: 2, desc: '적 체력 +25% · 전투에서 이기면 25% 확률로 유물 하나 더' },
  { id: 'fog',      ko: '짙은 안개',     icon: 'fog',     tier: 2, desc: '적의 다음 행동이 보이지 않는다 · 골드 +50%' },
  { id: 'forbid',   ko: '금지된 족보',   icon: 'lock',    tier: 3, desc: '무작위 족보 하나가 0점 · 나머지 족보 +20%' },
  { id: 'rush',     ko: '질주의 계절',   icon: 'boot',    tier: 1, desc: '스트레이트 +50% · 포카인드 · 풀하우스 · 요트 −30%' },
  { id: 'merchant', ko: '상인의 길',     icon: 'coins',   tier: 1, desc: '지도에 상점이 많아진다 · 전투 골드 +30%' },
  { id: 'war',      ko: '전쟁의 북소리', icon: 'drum',    tier: 2, desc: '엘리트 체력 ×1.5 · 대신 엘리트 유물이 더 희귀하다' },
  { id: 'rift',     ko: '시간의 균열',   icon: 'hourglass', tier: 2, desc: '매 턴 굴림 +1 · 손패 −1' },
  { id: 'sealrain', ko: '인장의 비',     icon: 'sparkle', tier: 1, desc: '전투를 시작할 때마다 손패에 인장 1개가 붙는다' },
  { id: 'drought',  ko: '메마른 땅',     icon: 'sun',     tier: 2, desc: '휴식 회복 절반 · 상점 가격 −30%' },
  { id: 'glass',    ko: '유리 세계',     icon: 'gem',     tier: 3, desc: '모든 회복 절반 · 대신 모든 카드 +30% (합연산)' },
  { id: 'regular',  ko: '단골손님의 날', icon: 'coins',   tier: 1, desc: '상점 새로고침 +1' },
  { id: 'wish',     ko: '별똥별 소원',   icon: 'star',    tier: 1, desc: '카드 · 유물 고르기 새로고침 +1' },
];
export const omenInfo = id => OMENS.find(o => o.id === id);
export const omen = (R, id) => R.omen === id;

// ── 족보 카드 ────────────────────────────────────────────────────────────────
// 카드 = { u: 고유 번호, cat: 족보, up: 강화(0/1), kws: [키워드, … 최대 KW_MAX] } (예전 저장본은 kw: 키워드 하나)
export const UPPER = CAT_IDS.slice(0, 6);
export const isUpper = cat => UPPER.includes(cat);
export const KEYWORDS = {
  guard:  { ko: '수호',   icon: 'shield',  color: '#4FB3FF', desc: `방어로 돌린 점수의 보호막 +${GUARD_MUL * 100}%` },
  vamp:   { ko: '흡혈',   icon: 'heart',   color: '#FF5A6A', desc: '공격한 점수의 1/3만큼 체력을 회복한다' },
  burn:   { ko: '화염',   icon: 'fire',    color: '#FF8A1A', desc: `적에게 화상: ${BURN_TURNS}턴 동안 적의 턴이 끝날 때마다 공격한 점수의 1/4 피해 (보호막부터 깎는다)` },
  pierce: { ko: '관통',   icon: 'dagger',  color: '#B98CFF', desc: '공격이 적의 보호막을 무시하고 체력에 바로 들어간다' },
  quick:  { ko: '속공',   icon: 'bolt',    color: '#FFC83D', desc: '첫 굴림 그대로(다시 굴리지 않고) 내면 점수 ×1.5' },
  lucky:  { ko: '행운',   icon: 'clover',  color: '#3EE6B4', desc: '내면 뒤집기 +1' },
  weak:   { ko: '약화',   icon: 'snow',    color: '#7CE0FF', desc: '점수의 절반 이상으로 공격하면 적의 다음 공격 피해가 절반이 된다' },
  gold:   { ko: '황금',   icon: 'coins',   color: '#FFD24A', desc: '공격한 점수의 1/3만큼 골드를 얻는다' },
  echo:   { ko: '메아리', icon: 'recycle', color: '#6BBE45', desc: '내고 나면 버린 더미 대신 다음 턴 손패로 돌아온다' },
  keep:   { ko: '보존',   icon: 'lock',    color: '#C8A2FF', desc: '턴이 끝나도 버려지지 않고 손패에 남는다' },
};
export const KW_IDS = Object.keys(KEYWORDS);
export const CAT_SHORT = { ones: '1', twos: '2', threes: '3', fours: '4', fives: '5', sixes: '6' };
// 카드 앞면에 쓰는 이름 (줄이지 않는다. 긴 이름은 카드 안에서 두 줄로 나뉜다)
export const cardTitle = cat => FUTURE[cat]?.ko || catInfo(cat).ko;
export const CAT_RULE = {
  ones: '1의 개수 + 성장', twos: '2 하나마다 점수 두 배', threes: '3의 개수 × 3', fours: '4의 개수 × 4', fives: '5의 개수 × 5', sixes: '6의 개수 × 6',
  choice: '주사위 5개 합', four: '같은 눈 4개 → 5개 합', full: '3개 + 2개 → 5개 합',
  sstr: '연속 4개 → 20', lstr: '연속 5개 → 30', yacht: '5개 모두 같음 → 50',
  xpar: '조건 맞는 족보를 모두 함께', xpause: '이번 적의 행동 무효', xrent: '손패에 있으면 유물 2개',
};
// 에이스 · 듀스 · 트레이: 원정에서는 실버 등급의 특별 카드 (시작 덱에 직업마다 정해진 1장 — RUN_CLASSES 의 sp, 보상은 실버 이상에서만)
export const SPECIAL = {
  ones: { ko: '주인공', icon: 'crown', desc: '낼 때마다 이 카드의 기본 점수가 영구히 +2' },
  twos: { ko: '두배', icon: 'sparkle', desc: '2가 하나면 2점, 2가 하나 늘 때마다 두 배 (2 → 4 → 8 → 16 → 32)' },
  threes: { ko: '삼위일체', icon: 'star', desc: '점수만큼 공격 · 방어 · 골드를 모두 얻는다 (공격 · 방어를 나눌 수 없다)' },
};
export const SPECIAL_CATS = Object.keys(SPECIAL);
// 미래 카드 (시공 광대를 이겨야만 얻는다): 기본 점수 0 · 강화 불가 (인장은 붙는다) · 홀로그램 등급
export const FUTURE = {
  xpar:   { ko: '병렬 연산', en: 'PARALLEL', icon: 'card',    desc: '기본 점수 0. 내면 손패에서 지금 점수가 나는 족보 카드를 모두 함께 낸다 (점수는 합, 인장 · 효과는 카드마다)' },
  xpause: { ko: '일시정지',  en: 'PAUSE',    icon: 'hourglass', desc: '기본 점수 0. 내면 이번 적의 행동(공격 · 방어 · 스킬)이 모두 무효가 된다' },
  xrent:  { ko: '유물 대여', en: 'RENTAL',   icon: 'gem',     desc: '기본 점수 0. 손패에 있는 동안 무작위 유물 2개를 빌린다 (손패에서 나가면 돌려준다)' },
};
export const FUTURE_CATS = Object.keys(FUTURE);
export const isFuture = cat => !!FUTURE[cat];
// 유물 대여로 빌리는 유물: 전투 중에만 힘을 쓰는 것 (얻을 때 · 전투 시작 때 효과가 있는 것은 뺀다)
const RENT_POOL = ['basic', 'choice', 'insure', 'whet', 'full', 'straight', 'fourk', 'small', 'quad', 'reso', 'parity', 'seven', 'miser', 'beast', 'echodrum', 'pairring', 'combo', 'horn', 'fang', 'scale', 'counter', 'thorn', 'lucky', 'magnet', 'hourglass', 'kaleido'];
export const isSpecial = cat => SPECIAL_CATS.includes(cat);
export const HERO_GROW = 2;       // 주인공: 낼 때마다 기본 점수 +2 (회귀자의 망토면 +3)
export const heroGrow = R => HERO_GROW + (hasRelic(R, 'cape') ? 1 : 0);
// 두배: 2가 n개면 2^n (세포배양관이면 2^(n+1))
export const twoScore = (R, n) => (n > 0 ? 2 ** (n + (hasRelic(R, 'culture') ? 1 : 0)) : 0);
export const cardName = c => `${kwsOf(c).map(k => KEYWORDS[k].ko + ' ').join('')}${cardTitle(c.cat)}${c.up ? '+' : ''}`;
// 희귀도: 1 일반(키워드 없음) · 2 희귀(키워드) · 3 전설(키워드 + 강화, 또는 강화 요트)
export const KW_MAX = 3;                 // 카드 한 장에 붙는 효과는 3개까지 (강화로 하나씩 새긴다)
export const kwsOf = c => c.kws || (c.kw ? [c.kw] : []);
export const hasKw = (c, k) => kwsOf(c).includes(k);
// 초이스(아무 때나 낼 수 있는 족보) · 에이스 · 듀스 · 트레이(특별 카드)는 그 자체로 실버(2) — 효과가 하나 붙으면 골드(3)
export const silverCat = cat => cat === 'choice' || isSpecial(cat);
export const cardRarity = c => {
  if (isFuture(c.cat)) return 4;
  const n = kwsOf(c).length, base = silverCat(c.cat);
  return n >= 2 || (n && (c.up || base)) || (c.cat === 'yacht' && c.up) ? 3 : n || base ? 2 : 1;
};
function mkCard(R, cat, up = 0, kws = []) { return { u: ++R.uid, cat, up: up ? 1 : 0, kws: [kws].flat().filter(Boolean) }; }
// 강화할 수 있는 카드: 아직 +30% 강화를 안 했거나, 효과 칸이 남았다
export const canUpgrade = c => !isFuture(c.cat) && (!c.up || kwsOf(c).length < KW_MAX);

// ── 원정 성장 (게임 밖 성장) ─────────────────────────────────────────────
// 원정이 끝날 때마다 별조각(✦)을 얻고, 원정 준비에서 영구 강화 · 주사위 세트를 산다. 쌓일수록 원정이 쉬워진다.
export const META = [
  { id: 'hp',    ko: '강인함',     icon: 'heart',  max: 5, cost: [40, 60, 80, 100, 120], desc: n => `원정 시작 최대 체력 +${n * 2}` },
  { id: 'gold',  ko: '여비',       icon: 'coins',  max: 3, cost: [30, 50, 70],           desc: n => `시작 골드 +${n * 20}` },
  { id: 'tools', ko: '도구 주머니', icon: 'flip',  max: 2, cost: [50, 90],               desc: n => (n >= 2 ? '시작 뒤집기 +1 · 조정 +1' : '시작 뒤집기 +1') },
  { id: 'potion', ko: '물약 띠',   icon: 'bag',    max: 1, cost: [80],                   desc: () => '회복 물약 1개를 들고 출발' },
  { id: 'relic', ko: '보물 지도',   icon: 'scroll', max: 1, cost: [200],                  desc: () => '출발할 때 직업 유물 1개 (직업마다 어울리는 유물)' },
  { id: 'sharp', ko: '연마된 덱',   icon: 'axe',    max: 1, cost: [100],                  desc: () => '대표 카드 점수 +30%' },
  { id: 'seal',  ko: '인장 상자',   icon: 'sparkle', max: 3, cost: [50, 90, 140],         desc: n => `출발할 때 덱의 무작위 카드 ${n}장에 무작위 인장` },
  { id: 'reshop', ko: '단골 장부',  icon: 'coins',  max: 3, cost: [60, 100, 150],        desc: n => `원정마다 상점 새로고침 ${n}번` },
  { id: 'repick', ko: '다시 뽑기 부적', icon: 'card', max: 3, cost: [60, 100, 150],      desc: n => `원정마다 카드 · 유물 고르기 새로고침 ${n}번` },
  { id: 'appraise', ko: '감정 안목', icon: 'eye',   max: 1, cost: [120],                 desc: () => '유물을 고를 때 2개가 아니라 3개 중에서 고른다' },
];
// (예전) 특수 주사위 · 주사위 칸은 없앴다. 이미 산 것은 별조각으로 돌려준다 (fixProgress)
const OLD_DIE_COST = { gold: 80, heavy: 100, twin: 120, stair: 120 }, OLD_SLOT_COST = [60, 150];
// 보물 지도: 직업마다 정해진 출발 유물
export const START_RELIC = { gambler: 'purse', monk: 'nudge', rogue: 'flip', warrior: 'basic', bard: 'lotus', mage: 'choice', dancer: 'drum', outlaw: 'whet', sharper: 'yacht' };
// 원정이 끝나면 얻는 별조각(✦): 지난 층 2 · 엘리트 4 · 보스 10 · 클리어 20, 승천 1단계마다 +10%
export const starsOf = R => Math.round((R.stats.floors * 2 + R.stats.elites * 4 + R.stats.bosses * 10 + (R.won ? 20 : 0)) * (1 + (R.asc || 0) * 0.1)) + (R.bonusStars || 0);

// 원정 기록 · 별조각 (서버 지갑 wallets/<uid>/run 과 테스트판 기기 저장이 같은 모양 · 같은 규칙)
//   { stars, lv: { 강화 id: 단계 }, best: { runs, wins, top, cls, asc, feats } }
export const blankProgress = () => ({ stars: 0, lv: {}, best: { runs: 0, wins: 0, top: 0, cls: {}, asc: {}, feats: [] } });
export function fixProgress(p) {
  p ||= blankProgress();
  p.stars ||= 0; p.lv ||= {}; p.best ||= blankProgress().best;
  // 없앤 특수 주사위 · 주사위 칸: 쓴 별조각을 돌려준다 (한 번)
  const refund = (p.dice || []).reduce((a, id) => a + (OLD_DIE_COST[id] || 0), 0) + OLD_SLOT_COST.slice(0, p.lv.slot || 0).reduce((a, c) => a + c, 0);
  if (refund) p.stars += refund;
  delete p.dice; delete p.equip; delete p.lv.slot;
  const b = p.best; b.runs ||= 0; b.wins ||= 0; b.top ||= 0; b.cls ||= {}; b.asc ||= {}; b.feats ||= [];
  return p;
}
export const progressMeta = p => ({ lv: { ...p.lv }, runs: p.best?.runs || 0 });
// 끝난 원정을 기록에 더한다 (서버는 행동 기록을 다시 돌린 R 로 부른다)
export function recordRun(p, R) {
  fixProgress(p);
  const b = p.best, stars = starsOf(R);
  b.runs++;
  if (R.won) b.wins++;
  if (R.stats.jester) b.jester = (b.jester || 0) + R.stats.jester;   // 시공 광대를 이긴 적이 있으면 그 스킬 설명이 보인다
  b.top = Math.max(b.top, R.won ? ACTS * (ROWS + 1) : (R.act - 1) * (ROWS + 1) + Math.min(ROWS + 1, floorOf(R)));
  const c = (b.cls[R.cls] ||= { runs: 0, wins: 0 });
  c.runs++;
  const opened = R.won && (b.asc[R.cls] ?? -1) < (R.asc || 0) && (R.asc || 0) < ASC_MAX;
  if (R.won) { c.wins++; b.asc[R.cls] = Math.max(b.asc[R.cls] ?? -1, R.asc || 0); }
  const feats = [...(R.feats || [])];
  if (Object.values(b.cls).filter(x => x.wins > 0).length >= 5) feats.push('five');
  const fresh = [...new Set(feats)].filter(f => !b.feats.includes(f));
  b.feats.push(...fresh);
  p.stars += stars;
  return { stars, won: !!R.won, opened, fresh, gems: R.gems || 0 };
}
// 원정 준비에서 사기 · 주사위 넣기. 안 되면 이유 문자열
export function buyProgress(p, kind, id) {
  fixProgress(p);
  if (kind === 'meta') {
    const u = META.find(m => m.id === id), n = p.lv[id] || 0;
    if (!u) return '없는 강화예요.';
    if (n >= u.max) return '이미 다 올렸어요.';
    if (p.stars < u.cost[n]) return '별조각이 모자라요.';
    p.stars -= u.cost[n]; p.lv[id] = n + 1;
    return null;
  }
  return '이상한 요청이에요.';
}

// ── 승천 (원정을 깬 직업은 한 단계씩 더 어려운 원정을 열 수 있다, 0~10. 단계는 쌓인다) ──
export const ASC_MAX = 10;
export const ASCENSION = [
  null,
  { ko: '정예의 갑옷', desc: '엘리트 체력 +15%' },
  { ko: '거친 길', desc: '일반 적의 공격 +10%' },
  { ko: '두꺼운 가죽', desc: '보스 체력 +15%' },
  { ko: '짧은 휴식', desc: '모닥불 휴식 회복 30% → 20%' },
  { ko: '고된 행군', desc: '막을 넘어갈 때 회복 60% → 40%' },
  { ko: '오래된 상처', desc: '최대 체력 -8%' },
  { ko: '바가지', desc: '상점 가격 +25%' },
  { ko: '정예의 칼날', desc: '엘리트 공격 +15%' },
  { ko: '폭군', desc: '보스 공격 +10%' },
  { ko: '마왕의 시대', desc: '격앙이 2턴 빨리 시작되고, 보스 체력 +10%' },
];
export const asc = (R, n) => (R.asc || 0) >= n;
export const furyOf = R => { const f = FURY[ENEMIES[R.C.e.id].kind]; return asc(R, 10) ? { ...f, from: f.from - 2 } : f; };

// ── 원정 도전과제 (판 안에서 이루면 R.feats 에 남고, 화면이 기록에 옮긴다) ──
export const FEATS = [
  { id: 'act1',     ko: '첫 관문',       icon: 'skull',   desc: '1막 보스를 쓰러뜨린다' },
  { id: 'clear',    ko: '원정 성공',     icon: 'crown',   desc: '마왕을 쓰러뜨리고 원정을 끝낸다' },
  { id: 'flawless', ko: '완벽한 사냥',   icon: 'heart',   desc: '체력을 하나도 잃지 않고 보스를 쓰러뜨린다' },
  { id: 'ace30',    ko: '에이스의 반란', icon: 'die1',    desc: '에이스 카드 한 장으로 30 피해 이상' },
  { id: 'lstr60',   ko: '질주의 끝',     icon: 'boot',    desc: '라지 스트레이트 한 장으로 60 피해 이상' },
  { id: 'yacht',    ko: '요트!',         icon: 'boat',    desc: '요트 카드로 공격한다' },
  { id: 'wall',     ko: '철벽',          icon: 'shield',  desc: '보호막 60 이상으로 적의 턴을 맞는다' },
  { id: 'rich',     ko: '부자',          icon: 'coins',   desc: '골드 500 이상을 모은다' },
  { id: 'hoard',    ko: '수집가',        icon: 'card',    desc: '덱 25장 이상으로 원정을 이어 간다' },
  { id: 'asc5',     ko: '하드모드 정복자',        icon: 'up',      desc: '하드모드 5 이상으로 원정을 끝낸다' },
  { id: 'asc10',    ko: '정점',          icon: 'trophy',  desc: '하드모드 10으로 원정을 끝낸다' },
  { id: 'five',     ko: '다섯 영웅',     icon: 'party',   desc: '서로 다른 직업 5종으로 원정을 끝낸다' },
  { id: 'bulwark',  ko: '방패의 노래',   icon: 'shield',  desc: '한 턴에 보호막 50 이상을 쌓는다 · 음유시인 해금' },
  { id: 'ascetic',  ko: '빈손의 순례',   icon: 'lotus',   desc: '상점에서 아무것도 사지 않고 3막까지 원정을 끝낸다 · 수도승 해금' },
];
// 원정 직업 해금: 기본(전사 · 도적 · 마법사) · 도전과제(음유시인 · 수도승) · 보석(wallet-rules RUN_CLASS_PRICE)
// RUN_ORDER: 직업 고르기 다이얼 순서 (기본 → 도전과제 → 보석 싼 순)
export const RUN_UNLOCK = { warrior: { free: true }, rogue: { free: true }, mage: { free: true }, bard: { feat: 'bulwark' }, monk: { feat: 'ascetic' } };
export const RUN_ORDER = ['warrior', 'rogue', 'mage', 'bard', 'monk', 'gambler', 'outlaw', 'sharper', 'dancer'];
function feat(R, id) {
  const f = (R.feats ||= []);
  if (f.includes(id)) return;
  f.push(id);
  fx(R, { type: 'feat', id });
}
function checkFeats(R) {
  if (R.gold >= 500) feat(R, 'rich');
  if (R.deck.length >= 25) feat(R, 'hoard');
}

// ── 직업 (원정용 능력) ──────────────────────────────────────────────────────
// 보석 해금 직업이 무료 직업(도박사 · 수도승)보다 조금 더 잘 이기도록 맞춘다 (sim/run.mjs).
// sig: 직업마다 시작 덱에 한 장 더 들어가는 대표 카드
// 기본 덱에는 초이스가 없다. 대신 직업 특별 카드(sp: 에이스 · 듀스 · 트레이) 1장이 들어간다 (createRun)
export const BASE_DECK = ['fours', 'sixes', 'fives', 'full', 'four', 'sstr', 'lstr'];
export const RUN_CLASSES = {
  gambler: { hp: 104, sp: 'threes', flip: 1, nudge: 1, sig: { cat: 'full', kw: 'gold' }, skill: '배팅',
    get desc() { return `굴리기 전에 손패 1장에 배팅한다. 배팅한 카드를 내면 점수 ×${CLASS_TUNE.betMul}${CLASS_TUNE.gamblerGold ? `. 전투에서 얻는 골드 +${Math.round(CLASS_TUNE.gamblerGold * 100)}%` : ''}`; } },
  monk:    { hp: 66, sp: 'ones', flip: 0, nudge: 2, sig: { cat: 'choice', kw: 'quick' }, skill: '명상',
    get desc() { return `명상: 카드를 낼 때 남은 굴림 1회당 조정 +1 · 뒤집기 +1 (명상으로는 각각 ${CLASS_TUNE.monkCap}개까지 채운다)${CLASS_TUNE.monkBlock ? ` · 보호막 +${CLASS_TUNE.monkBlock}` : ''}. 금욕: 상점을 쓸 수 없다 (이벤트는 된다)`; } },
  rogue:   { hp: 104, sp: 'ones', flip: 2, nudge: 0, sig: { cat: 'four', kw: 'pierce' }, skill: '그림자 손',
    get desc() { return `전투를 시작할 때마다 뒤집기 +${CLASS_TUNE.rogueFlip}. 뒤집기를 쓴 턴에 내는 카드는 점수 +${Math.round(CLASS_TUNE.rogueMul * 100)}%, 적 보호막을 무시한다`; } },
  warrior: { hp: 100, sp: 'threes', flip: 1, nudge: 1, sig: { cat: 'sixes', kw: 'guard' }, skill: '불굴',
    get desc() { return `숫자 카드(에이스~식스) 점수 +${Math.round(CLASS_TUNE.warriorMul * 100)}%. 숫자 카드로 공격하면 공격한 점수의 절반만큼 보호막도 얻는다`; } },
  bard:    { hp: 95, sp: 'ones', flip: 1, nudge: 2, sig: { cat: 'choice', kw: 'guard' }, skill: '응원가',
    get desc() { return `매 턴 시작에 보호막 +${CLASS_TUNE.bardBlock}. 전투에서 이기면 체력 ${CLASS_TUNE.bardHeal} 회복`; } },
  mage:    { hp: 62, sp: 'twos', flip: 1, nudge: 1, sig: { cat: 'choice', kw: 'echo' }, skill: '비전 지식',
    get desc() { return `손패 5장. 카드로 공격할 때 손에 남은 카드 1장당 피해 +${CLASS_TUNE.mageBonus} (나눠 내면 공격 비율만큼). 카드 보상을 한 장 더 보고 고른다`; } },
  dancer:  { hp: 68, sp: 'threes', flip: 1, nudge: 1, sig: { cat: 'choice', kw: 'burn' }, skill: '춤사위',
    get desc() { return `${DANCE_NEED}점 이상 카드를 내면 춤사위 +1 (최대 ${DANCE_CAP}, 원정 내내 유지). 굴린 뒤 써서 모든 주사위 눈 +1 (6은 그대로), 그 턴 카드 점수 +${Math.round(CLASS_TUNE.danceMul * 100)}% (턴당 1번)`; } },
  outlaw:  { hp: 120, sp: 'threes', flip: 1, nudge: 1, sig: { cat: 'full', kw: 'quick' }, skill: '속전속결',
    get desc() { return `첫 굴림 그대로(다시 굴리지 않고) 카드를 내면 점수 ×${CLASS_TUNE.rushAny}, 포카인드 · 풀하우스 · 스트레이트 · 요트면 ×${CLASS_TUNE.rushMul}. 남은 굴림 1회당 보호막 +${CLASS_TUNE.rushBlock}`; } },
  sharper: { hp: 86, sp: 'ones', flip: 1, nudge: 1, sig: { cat: 'yacht' }, skill: '밑장빼기',
    get desc() { return `굴린 뒤 주사위 1개를 원하는 눈으로 바꾼다. 턴마다 ${CLASS_TUNE.dealsTurn}번, 전투마다 ${CLASS_TUNE.deals}번까지`; } },
};
// 직업 수치 (sim/run.mjs 로 맞춘다)
export const CLASS_TUNE = { mageBonus: 0.5, betMul: 1.65, monkBlock: 0, monkNudge: 1, monkFlipFrom: 1, monkOnce: 0, monkCap: 1, rogueFlip: 2, rogueMul: 0.8, warriorMul: 0.3, bardBlock: 5, bardHeal: 4,
  rushAny: 1.5, rushMul: 1.3, rushBlock: 6, deals: 8, dealsTurn: 2, danceMul: 0.12, gamblerGold: 0 };

// ── 유물 (판 내내 켜져 있는 패시브) — 대부분 원래 특성 카드에서 옮겨 왔다 ──
// r: 1 일반 · 2 희귀 · 3 보스 — 봇 시뮬레이션의 클리어율 기여로 나눴다 (보스 +16%p 이상 · 희귀 +8 ~ 16%p · 일반 그 아래)
export const RELICS = [
  { id: 'flip',      ko: '뒤집기 두루마리', icon: 'flip',      r: 2, desc: '전투를 시작할 때마다 뒤집기 +1' },
  { id: 'nudge',     ko: '미세 조정',       icon: 'nudge',     r: 2, desc: '전투를 시작할 때마다 조정 +1' },
  { id: 'basic',     ko: '기초 수련',       icon: 'belt',      r: 2, desc: '숫자 카드(에이스~식스) 점수 ×1.3' },
  { id: 'choice',    ko: '선택의 달인',     icon: 'clover',    r: 2, desc: '초이스 점수 ×1.2' },
  { id: 'insure',    ko: '보험',            icon: 'shield',    r: 2, desc: '0점 카드를 내면 보호막 14, 뒤집기 +1' },
  { id: 'iron',      ko: '철갑',            icon: 'dscale',    r: 2, desc: '매 턴 시작에 보호막 +3' },
  { id: 'camp',      ko: '모닥불 주머니',   icon: 'fire',      r: 1, desc: '휴식할 때 체력 20 더 회복' },
  { id: 'purse',     ko: '금화 주머니',     icon: 'coins',     r: 1, desc: '전투에서 얻는 골드 +30%' },
  { id: 'drum',      ko: '전쟁 북',         icon: 'drum',      r: 2, desc: '전투 첫 턴에 내는 카드 점수 ×1.5' },
  { id: 'bone',      ko: '뼈 방패',         icon: 'bone',      r: 2, desc: '전투를 시작할 때 보호막 10' },
  { id: 'lotus',     ko: '연꽃',            icon: 'lotus',     r: 1, desc: '전투에서 이기면 체력 6 회복' },
  { id: 'whet',      ko: '숫돌',            icon: 'axe',       r: 2, desc: '공격 피해 +3 (나눠 내면 공격 비율만큼)' },
  { id: 'full',      ko: '풀하우스 장인',   icon: 'house',     r: 1, desc: '풀하우스 점수 ×1.5' },
  { id: 'straight',  ko: '질주',            icon: 'boot',      r: 2, desc: '스몰 · 라지 스트레이트 점수 ×1.3' },
  { id: 'fourk',     ko: '사냥 본능',       icon: 'wolf',      r: 1, desc: '포카인드 점수 ×1.5' },
  { id: 'lucky',     ko: '행운의 부적',     icon: 'amulet',    r: 2, desc: '매 턴 첫 굴림 뒤, 가장 낮은 주사위 1개를 공짜로 한 번 더 굴린다' },
  { id: 'scholar',   ko: '현자의 눈',       icon: 'eye',       r: 1, desc: '카드 보상을 한 장 더 보고 고른다' },
  { id: 'yacht',     ko: '요트 신봉자',     icon: 'boat',      r: 2, desc: '요트 점수 ×1.5, 전투를 시작할 때마다 뒤집기 +1' },
  { id: 'fang',      ko: '흡혈 송곳니',     icon: 'anger',     r: 2, desc: '공격으로 준 피해의 10%만큼 체력 회복' },
  { id: 'thorn',     ko: '가시 갑옷',       icon: 'swords',    r: 2, desc: '공격받을 때마다 적에게 4 피해' },
  { id: 'heart',     ko: '거인의 심장',     icon: 'heart',     r: 2, desc: '얻을 때 최대 체력 +20' },
  { id: 'hourglass', ko: '모래시계',        icon: 'hourglass', r: 1, desc: '카드를 낼 때 남은 굴림 1회당 보호막 +3' },
  { id: 'horn',      ko: '사냥꾼의 뿔피리', icon: 'horn',      r: 3, desc: '엘리트 · 보스에게 주는 피해 +25%' },
  { id: 'medal',     ko: '훈장',            icon: 'medal',     r: 1, desc: '턴마다 카드 교체 +1' },
  { id: 'scale',     ko: '수호자의 저울',   icon: 'scale',     r: 3, desc: '방어로 돌린 점수의 보호막 +30%' },
  { id: 'reroll',    ko: '재굴림의 반지',   icon: 'recycle',   r: 3, desc: '매 턴 굴림 기회 +1' },
  { id: 'crown',     ko: '지혜의 왕관',     icon: 'crown',     r: 2, desc: '손패 +1' },
  { id: 'sixth',     ko: '여섯 번째 주사위', icon: 'star',     r: 3, desc: '주사위 6개를 굴려 가장 좋은 5개로 계산' },
  { id: 'midas',     ko: '황금손',          icon: 'hand',      r: 3, desc: '매 턴 시작에 조정 +1' },
  { id: 'phoenix',   ko: '불사조 깃털',     icon: 'sparkle',   r: 3, desc: '쓰러지면 한 번, 최대 체력의 40%로 되살아난다' },
  { id: 'chalice',   ko: '생명의 성배',     icon: 'trophy',    r: 2, desc: '얻을 때 최대 체력 +30, 체력 모두 회복' },
  // 낮은 족보를 살리는 유물 (덱 방향을 정한다 — 가지면 같은 계열 카드 · 유물이 더 자주 나온다)
  { id: 'small',     ko: '작은 수의 힘',    icon: 'die2',      r: 1, desc: '에이스 · 듀스 · 트레이 카드 점수 ×1.2' },
  { id: 'pairs',     ko: '수집가의 상자',   icon: 'bag',       r: 3, desc: '숫자 카드는 맞는 주사위 1개당 +2점' },
  { id: 'reso',      ko: '공명의 종',       icon: 'pairs',     r: 1, desc: '포 · 파이브 · 식스 카드: 맞는 주사위가 3개 이상이면 점수 ×1.25' },
  { id: 'quad',      ko: '쌍둥이 별',       icon: 'pair4',     r: 2, desc: '숫자 카드에 맞는 주사위가 딱 2개면 점수 ×2' },
  { id: 'flow',      ko: '질풍',            icon: 'rainbow',   r: 3, desc: '스몰 스트레이트 기본 25점 · 라지 스트레이트 기본 40점' },
  { id: 'crutch',    ko: '목발',            icon: 'boot',      r: 2, desc: '라지 스트레이트: 4개만 이어져도 성공으로 친다' },
  { id: 'emptyhouse', ko: '빈집',           icon: 'house',     r: 2, desc: '풀하우스 · 포카인드: 같은 눈이 3개만 있어도 성공으로 친다' },
  { id: 'combo',     ko: '연환',            icon: 'link',      r: 2, desc: '스트레이트 카드로 공격하면 피해 ×1.3' },
  // 덱 빌딩 유물: 특정 키워드 · 족보 · 덱 크기를 살린다 (가지면 그 계열 카드가 더 자주 나오고, 그 계열 카드가 많으면 더 자주 나온다)
  { id: 'ember',     ko: '불씨 항아리',     icon: 'volcano',   r: 2, desc: '화염 카드의 화상 피해 +3, 화상이 1턴 더 간다' },
  { id: 'bloodcup',  ko: '피의 성배',       icon: 'gem',       r: 1, desc: '흡혈 회복 +50%. 체력이 가득 차서 넘치는 회복은 보호막이 된다' },
  { id: 'rampart',   ko: '성벽 설계도',     icon: 'castle',    r: 1, desc: '수호 카드로 얻은 보호막의 절반을 다음 턴 시작에 다시 얻는다' },
  { id: 'keepbox',   ko: '보존 상자',       icon: 'toolbox',   r: 1, desc: '턴 시작에 손패에 남아 있던 보존 카드 1장당, 그 턴 첫 카드 점수 +15%' },
  { id: 'magnet',    ko: '자석 주사위',     icon: 'vortex',    r: 1, desc: '굴린 뒤 같은 눈이 3개 이상이면, 다른 주사위 1개가 그 눈으로 바뀐다 (턴마다 1번)' },
  { id: 'weight',    ko: '저울추',          icon: 'rock',      r: 2, desc: '초이스 카드: 남은 굴림 1회당 기본 점수 +3' },
  { id: 'rosary',    ko: '수도승의 묵주',   icon: 'beads',     r: 1, desc: '덱이 8장 이하면 모든 카드 점수 +25%' },
  { id: 'libkey',    ko: '도서관 열쇠',     icon: 'door',      r: 1, desc: '덱이 20장 이상이면 손패 +1' },
  // ── 새 유물 (발라트로식: 족보를 내는 순서 · 인장 · 위험 · 주사위 눈 · 덱 · 성장 · 리듬) ──
  // 배수는 모두 합연산 (+%끼리 더한다). 곱연산은 카드 자신의 강화 · 효과(속공 등) · 인장만.
  { id: 'echodrum',  ko: '메아리 북',       icon: 'drum',      r: 2, desc: '직전과 같은 족보를 내면 +25%. 같은 족보가 이어질 때마다 +25%씩 쌓인다 (다른 족보를 내면 처음부터)' },
  { id: 'hammer',    ko: '장인의 망치',     icon: 'axe',       r: 2, desc: '같은 족보 카드를 3번 낼 때마다 그 족보의 기본 점수가 영구히 +1 (족보마다 +6까지)' },
  { id: 'pairring',  ko: '페어 반지',       icon: 'link',      r: 2, desc: '손패에 같은 족보 카드가 2장 이상이면 그 카드들 +50%' },
  { id: 'kaleido',   ko: '만화경',          icon: 'rainbow',   r: 2, desc: '직전과 다른 족보를 내면 피해 +2. 다른 족보가 이어질 때마다 +2씩 쌓인다 (같은 족보를 내면 처음부터)' },
  { id: 'palette',   ko: '무지개 팔레트',   icon: 'rainbow',   r: 2, desc: '얻은 뒤로 서로 다른 족보 카드를 8가지 내면, 그때부터 모든 카드 +50%' },
  { id: 'pilgrim',   ko: '순례자의 지도',   icon: 'scroll',    r: 1, desc: '얻은 뒤로 처음 내는 족보마다 골드 15 · 최대 체력 +2' },
  { id: 'sealbag',   ko: '인장 주머니',     icon: 'bag',       r: 1, desc: '전투를 시작할 때마다 손패의 무작위 카드에 인장 1개가 붙는다 (그 전투 동안)' },
  { id: 'goldframe', ko: '황금 인장틀',     icon: 'crown',     r: 1, desc: '인장 효과가 두 번 터진다' },
  { id: 'wax',       ko: '밀랍 봉인',       icon: 'lotus',     r: 1, desc: '인장이 붙은 카드를 내지 않고 턴을 넘기면, 넘길 때마다 그 카드 +10% (쌓인다)' },
  { id: 'sealknife', ko: '인장공의 칼',     icon: 'dagger',    r: 1, desc: '상점의 인장이 반값, 상점마다 인장 하나는 공짜' },
  { id: 'madscale',  ko: '광기의 저울',     icon: 'scale',     r: 3, get desc() { return `턴마다 저울이 기운다: 그 턴의 카드는 미리 보이는 비율(공격 0 · 25 · 50 · 75 · 100%)로 나뉘는 대신 모든 카드 +${Math.round(RT.madMul * 100)}%`; } },
  { id: 'coin',      ko: '동전 던지기',     icon: 'coins',     r: 2, desc: '카드를 낼 때마다 50% 확률로 +100%, 50% 확률로 −25%' },
  { id: 'bloodpact', ko: '피의 계약',       icon: 'heart',     r: 3, desc: '얻을 때 최대 체력 −30%. 모든 카드 +50%' },
  { id: 'glasscannon', ko: '유리 대포',     icon: 'bolt',      r: 3, desc: '모든 카드 +60%. 대신 받는 피해 ×1.4' },
  { id: 'parity',    ko: '홀짝 부적',       icon: 'yinyang',   r: 1, desc: '주사위가 모두 홀수거나 모두 짝수면 +30%' },
  { id: 'seven',     ko: '칠의 축복',       icon: 'clover',    r: 2, desc: '주사위 눈의 합이 7의 배수면 +50%' },
  { id: 'balance',   ko: '균형의 추',       icon: 'scale',     r: 2, desc: '족보를 셀 때 1의 눈을 6으로 셀 수 있다 (더 좋은 쪽으로)' },
  { id: 'discard',   ko: '버림의 미학',     icon: 'recycle',   r: 1, desc: '카드를 교체할 때마다 그 턴 카드 +15% (쌓인다)' },
  { id: 'emptyhand', ko: '빈손의 무사',     icon: 'fist',      r: 3, desc: '손패 −2. 모든 카드 +60%' },
  { id: 'dust',      ko: '서고의 먼지',     icon: 'scroll',    r: 1, desc: '뽑을 더미에 남은 카드 5장당 +4%' },
  { id: 'trinity',   ko: '세 조각 성표',    icon: 'star',      r: 1, desc: '전투에서 이기면 그 전투에 가장 많이 낸 카드가 덱에 1장 더 생긴다 (원정에서 3번까지)' },
  { id: 'bloodsword', ko: '피에 굶주린 검', icon: 'sword',     r: 2, desc: '적을 쓰러뜨릴 때마다 공격 피해가 영구히 +1' },
  { id: 'miser',     ko: '수전노의 금고',   icon: 'money',     r: 1, desc: '가진 골드 50당 +3%' },
  { id: 'beast',     ko: '상처 입은 짐승',  icon: 'wolf',      r: 2, desc: '잃은 체력 10%당 +5%' },
  { id: 'ytower',    ko: '요트 탑',         icon: 'castle',    r: 1, desc: '요트를 낼 때마다 이후 모든 카드 영구히 +3%' },
  { id: 'counter',   ko: '반격의 문장',     icon: 'shield',    r: 1, desc: '적의 공격을 보호막으로 다 막으면, 남은 보호막만큼 적에게 피해' },
  { id: 'sandbank',  ko: '모래 저금통',     icon: 'hourglass', r: 1, desc: '쓰지 않고 남긴 굴림을 다음 턴으로 넘긴다 (최대 +2)' },
  { id: 'zero',      ko: '0점의 기적',      icon: 'sparkle',   r: 1, desc: '0점으로 낸 카드는 그 카드가 영구히 +20% (쌓인다)' },
  { id: 'loupe',     ko: '감정사의 돋보기', icon: 'eye',       r: 1, desc: '유물을 고를 때 후보가 1개 더 나온다' },
  // 특별 카드 전용 (그 카드가 덱에 있으면 더 잘 나온다)
  { id: 'cape',      ko: '회귀자의 망토',   icon: 'crown',     r: 1, desc: '에이스 <주인공>: 낼 때마다 기본 점수가 +2 대신 +3 자란다' },
  { id: 'culture',   ko: '세포배양관',      icon: 'potion',    r: 1, desc: '듀스 <두배>: 점수가 한 단계 커진다 (4 → 8 → 16 → 32 → 64)' },
  { id: 'prism',     ko: '프리즘',          icon: 'gem',       r: 1, desc: '트레이 <삼위일체>: 점수 3배를 공격 · 방어 · 골드로 마음대로 나눌 수 있다' },
];
// 특별 카드 전용 유물 ↔ 그 카드
export const SPECIAL_RELIC = { cape: 'ones', culture: 'twos', prism: 'threes' };
// 유물 수치 (sim: 유물 하나를 들고 출발한 봇의 클리어율 차이로 맞춘다 — 희귀도에 맞게)
export const RELIC_TUNE = { madMul: 1, hammerEvery: 3, hammerCap: 6, comboMul: 1.3, weight: 3, pairs: 2, miser: 0.03, choice: 0.2, bone: 10, nudge: 1,
  beast: 0.05, kaleido: 2, flowL: 40, fang: 0.1, paletteN: 8, coinLow: -0.25 };
const RT = RELIC_TUNE;
export const hammerBonus = (R, cat) => Math.min(RT.hammerCap, Math.floor((R.hammer?.[cat] || 0) / RT.hammerEvery));
// 유물 하나를 들고 출발했을 때 늘어난 클리어율 (%p, 1 · 2 · 3막 평균 · 봇 9직업 × 40판) — 희귀도를 나누고 봇이 유물을 고를 때 쓴다
export const RELIC_POWER = { midas: 34.8, bloodpact: 31.7, madscale: 21.1, sixth: 28.4, reroll: 21.5, flow: 19.2, pairs: 19.1, horn: 18.1, phoenix: 16.7, emptyhand: 16.3, scale: 16.2, glasscannon: 16.0, beast: 15.6, quad: 15.6, kaleido: 15.4, thorn: 15.2, bloodsword: 15.2, crown: 15.1, weight: 14.7, straight: 14.6, coin: 14.0, chalice: 13.4, balance: 13.1, basic: 12.9, combo: 12.9, nudge: 12.6, palette: 12.2, iron: 12.1, flip: 12.1, crutch: 11.8, yacht: 11.6, drum: 11.3, pairring: 11.1, hammer: 10.7, emptyhouse: 10.4, seven: 10.1, insure: 9.9, choice: 9.8, bone: 9.4, ember: 9.3, whet: 9.3, echodrum: 9.1, fang: 9.1, lucky: 8.2, heart: 8.1, sandbank: 7.9, miser: 7.7, prism: 7.4, reso: 6.9, discard: 6.6, hourglass: 6.5, pilgrim: 6.4, full: 5.9, parity: 5.9, lotus: 5.7, rampart: 5.6, scholar: 5.5, fourk: 4.7, keepbox: 4.6, magnet: 4.1, counter: 3.9, sealbag: 3.8, cape: 3.3, dust: 3.0, loupe: 2.8, culture: 2.8, bloodcup: 2.6, camp: 2.3, ytower: 2.1, zero: 1.6, goldframe: 1.0, libkey: 0.7, purse: 0.6, trinity: 0.5, wax: 0.3, rosary: 0.2, sealknife: -0.6, small: -1.9, medal: -2.9 };
export const SAME_CATS_ALL = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'four', 'full', 'sstr', 'lstr', 'yacht'];
// 유물 고르기 후보 수: 기본 2개 (출정 채비 「감정 안목」이면 3개) + 감정사의 돋보기 1개. 예전 저장 판(relicN 없음)은 3개
export const relicChoices = R => (R.relicN ?? 3) + (hasRelic(R, 'loupe') ? 1 : 0);
// 덱 빌딩 유물 ↔ 그 계열 카드
const SAME_CATS = ['four', 'yacht', 'full'];
const ARCH = {
  emptyhouse: c => c.cat === 'full' || c.cat === 'four', crutch: c => c.cat === 'lstr',
  ember: c => hasKw(c, 'burn'), bloodcup: c => hasKw(c, 'vamp'), rampart: c => hasKw(c, 'guard'), keepbox: c => hasKw(c, 'keep'),
  magnet: c => SAME_CATS.includes(c.cat), weight: c => c.cat === 'choice',
};
const ARCH_KW = { ember: 'burn', bloodcup: 'vamp', rampart: 'guard', keepbox: 'keep' };
export const MAGNET_N = 3;
export const ROSARY_MAX = 8, LIBKEY_MIN = 20;
// 덱 방향: 숫자 카드(에이스~식스) · 스트레이트
export const NUM_RELICS = ['basic', 'small', 'pairs', 'quad', 'reso'];
export const STR_RELICS = ['straight', 'flow', 'combo', 'crutch'];
export function synergy(R) {
  return { num: NUM_RELICS.filter(id => hasRelic(R, id)).length + (R.cls === 'warrior' ? 1 : 0), str: STR_RELICS.filter(id => hasRelic(R, id)).length };
}
export const relicInfo = id => RELICS.find(r => r.id === id);
export const hasRelic = (R, id) => R.relics.includes(id) || !!R.C?.rent?.includes(id);   // rent: 유물 대여 카드로 빌린 유물 (이번 전투 · 손패에 있는 동안)

// ── 물약 (3칸, 내 턴에 언제든 한 번 쓰고 사라진다) ──────────────────────────
export const POTIONS = [
  { id: 'heal',  ko: '회복 물약', icon: 'heart',     color: '#FF5A6A', desc: '체력 28 회복' },
  { id: 'block', ko: '방패 물약', icon: 'shield',    color: '#4FB3FF', desc: '보호막 24' },
  { id: 'fire',  ko: '화염 물약', icon: 'fire',      color: '#FF8A1A', desc: '적에게 20 피해 (보호막 무시)' },
  { id: 'time',  ko: '시간 물약', icon: 'hourglass', color: '#B98CFF', desc: '이번 턴 굴림 기회 +2' },
  { id: 'power', ko: '힘의 물약', icon: 'bolt',      color: '#FFC83D', desc: '이번 턴에 내는 카드 점수 ×1.5' },
  { id: 'pure',  ko: '정화 물약', icon: 'sparkle',   color: '#3EE6B4', desc: '이번 턴의 방해(봉인 · 얼음 · 응시 · 패기 · 독)와 약화를 모두 푼다' },
];
export const potionInfo = id => POTIONS.find(p => p.id === id);

// ── 적 ───────────────────────────────────────────────────────────────────────
// 행동(move): atk 공격력 · hits 타수 · block 보호막 · str 힘(이후 공격 +) · heal 회복 · steal 골드 빼앗기
//             weak 영웅 약화(턴) · hex 방해 { t, n } — 영웅이 굴리는 이번 턴 동안 걸린다
// ai: 'random' 무작위(같은 행동 세 번 연속 없음, w: 뽑힐 비중 · 기본 1) · 'cycle' 차례대로. 보스는 rage(체력 절반 아래) 행동 목록이 따로 있다
// 방해(hex) 빈도: 보스는 매 턴 자기 스킬(대전 · 협동 보스 스킬 그대로) > 엘리트는 4번에 1번 > 일반은 5번에 1번쯤 (방해 행동 w 0.5)
export const HEX = {
  burn:    { ko: '화염 숨결',  icon: 'fire',   desc: n => `첫 굴림 뒤 가장 높은 주사위 ${n}개가 1로 탄다` },
  freeze:  { ko: '얼음',       icon: 'snow',   desc: n => `첫 굴림 뒤 주사위 ${n}개가 얼어 다시 굴릴 수 없다 (뒤집기 · 조정은 된다)` },
  seal:    { ko: '봉인',       icon: 'chain',  desc: n => `첫 굴림 뒤 주사위 ${n}개가 봉인된다 (잡기 · 뒤집기 · 조정 불가, 다시 굴리면 풀림)` },
  twist:   { ko: '운명 비틀기', icon: 'vortex', desc: n => `두 번째 굴림 뒤 주사위 ${n}개가 뒤집힌다 (7-눈)` },
  reverse: { ko: '운명 역전',  icon: 'vortex', desc: () => '두 번째 굴림 뒤 가장 많이 나온 눈이 전부 뒤집힌다 (7-눈)' },
  drums:   { ko: '전쟁의 북',  icon: 'drum',   desc: () => '이번 턴 굴림 기회 -1' },
  gaze:    { ko: '응시',       icon: 'eye',    desc: n => `손패 ${n}장을 노려본다. 노려본 카드는 점수 0` },
  haki:    { ko: '패기',       icon: 'anger',  desc: () => '이번 턴 뒤집기 · 조정 · 춤사위 · 밑장빼기 금지' },
  poison:  { ko: '독 안개',    icon: 'toxic',  desc: () => '이번 턴 15점 이하 공격은 피해 절반' },
  // 시공 광대
  facedown: { ko: '뒷면 카드', icon: 'card',   desc: n => `손패 ${n}장이 뒷면이 된다 (무슨 족보인지 알 수 없다)` },
  dare:    { ko: '광대의 도전장', icon: 'anger', desc: () => '손패에 광대 카드가 생긴다. 그 카드를 내지 않으면 이번 턴 피해 절반, 내서 공격하면 피해 ×1.5' },
  bomb:    { ko: '시한폭탄',   icon: 'fire',   desc: () => '손패에 폭탄 카드가 생긴다. 턴이 끝날 때 손패에 남아 있으면 터져 피해를 받는다. 내서 공격하면 피해 ×1.5' },
};
const H = (t, n = 1) => ({ t, n });
const MV = (ko, o = {}) => ({ ko, ...o });
export const ENEMIES = {
  // 1막 — 어둠의 숲
  slime:    { ko: '슬라임', act: 1, kind: 'normal', hp: [52, 58], ai: 'random', moves: [
    MV('몸통 박치기', { atk: 8 }), MV('끈적이는 점액', { atk: 5, hex: H('freeze'), w: 0.5 }), MV('부풀기', { block: 8, str: 1 })] },
  goblin:   { ko: '고블린 약탈꾼', act: 1, kind: 'normal', hp: [56, 62], ai: 'random', moves: [
    MV('단검 찌르기', { atk: 9 }), MV('주머니 털기', { atk: 6, steal: 10 }), MV('방패 들기', { block: 10, atk: 4 })] },
  bat:      { ko: '동굴 박쥐', act: 1, kind: 'normal', hp: [44, 50], ai: 'random', moves: [
    MV('날개 할퀴기', { atk: 5, hits: 2 }), MV('흡혈', { atk: 6, heal: 6 }), MV('초음파', { atk: 4, hex: H('seal'), w: 0.5 })] },
  wolf:     { ko: '숲 늑대', act: 1, kind: 'normal', hp: [58, 64], ai: 'random', moves: [
    MV('물어뜯기', { atk: 10 }), MV('울부짖기', { str: 2, block: 5 }), MV('연속 물기', { atk: 5, hits: 2 })] },
  shaman:   { ko: '고블린 주술사', act: 1, kind: 'elite', hp: [112, 120], ai: 'cycle', moves: [
    MV('저주 인형', { atk: 9, hex: H('twist') }), MV('불꽃 화살', { atk: 14 }), MV('저주 주문', { atk: 8, weak: 1 }), MV('마력 방패', { block: 14, str: 2 })] },
  mimic:    { ko: '미믹', act: 1, kind: 'elite', hp: [120, 130], ai: 'cycle', moves: [
    MV('덥석 물기', { atk: 16 }), MV('혀 휘감기', { atk: 7, hex: H('seal', 2) }), MV('뚜껑 닫기', { block: 18 }), MV('금화 삼키기', { atk: 10, steal: 15 })] },
  // 2막 — 얼어붙은 폐허
  skeleton: { ko: '해골 병사', act: 2, kind: 'normal', hp: [78, 86], ai: 'random', moves: [
    MV('녹슨 칼', { atk: 13 }), MV('뼈 방패', { block: 14, atk: 5 }), MV('뼈 던지기', { atk: 7, hits: 2 })] },
  ghost:    { ko: '원혼', act: 2, kind: 'normal', hp: [70, 78], ai: 'random', moves: [
    MV('원망의 눈길', { atk: 10, hex: H('gaze'), w: 0.5 }), MV('흐려지기', { block: 16 }), MV('비명', { atk: 16 })] },
  wisp:     { ko: '서리 정령', act: 2, kind: 'normal', hp: [72, 80], ai: 'random', moves: [
    MV('서리 입김', { atk: 9, hex: H('freeze', 2), w: 0.5 }), MV('냉기 폭발', { atk: 17 }), MV('얼음 갑옷', { block: 12, str: 1 })] },
  knight:   { ko: '망령 기사', act: 2, kind: 'elite', hp: [146, 156], ai: 'cycle', moves: [
    MV('공포의 기세', { atk: 13, hex: H('haki') }), MV('대검 내려치기', { atk: 21 }), MV('검은 방패', { block: 18 }), MV('삼연참', { atk: 7, hits: 3 })] },
  golem:    { ko: '고대 골렘', act: 2, kind: 'elite', hp: [170, 180], ai: 'cycle', moves: [
    MV('바위 피부', { block: 24 }), MV('지진', { atk: 11, hex: H('drums') }), MV('분쇄', { atk: 24 }), MV('가동', { str: 2, block: 8 })] },
  // 3막 — 마왕성
  imp:      { ko: '임프', act: 3, kind: 'normal', hp: [92, 100], ai: 'random', moves: [
    MV('화염구', { atk: 12, hex: H('burn'), w: 0.5 }), MV('장난질', { atk: 8, weak: 1 }), MV('꼬리 찌르기', { atk: 6, hits: 3 })] },
  hound:    { ko: '지옥견', act: 3, kind: 'normal', hp: [100, 110], ai: 'random', moves: [
    MV('물어뜯기', { atk: 16 }), MV('연속 물기', { atk: 8, hits: 2 }), MV('지옥의 울음', { str: 2, block: 8 })] },
  gargoyle: { ko: '가고일', act: 3, kind: 'normal', hp: [108, 118], ai: 'random', moves: [
    MV('석화', { block: 22 }), MV('내려찍기', { atk: 21 }), MV('돌날개', { block: 12, atk: 10 })] },
  shade:    { ko: '그림자 암살자', act: 3, kind: 'elite', hp: [172, 182], ai: 'cycle', moves: [
    MV('그림자 난도질', { atk: 6, hits: 4 }), MV('그림자 사슬', { atk: 11, hex: H('seal', 2) }), MV('독 바른 칼', { atk: 10, weak: 2 }), MV('어둠 속으로', { block: 18 })] },
  champion: { ko: '마족 근위대장', act: 3, kind: 'elite', hp: [180, 190], ai: 'cycle', moves: [
    MV('도륙', { atk: 22 }), MV('철벽', { block: 20, str: 2 }), MV('위압', { atk: 15, hex: H('haki') }), MV('회전 베기', { atk: 9, hits: 3 })] },

  // ── 막 보스 (협동 보스 8종을 원정 전투에 맞게) ──
  // 보스는 매 턴 자기 스킬을 쓴다 — 대전 · 협동 보스와 같은 스킬만 (마왕: 봉인 · 패기, 화염룡: 화염 숨결 …). 원정의 고비는 보스전
  dragon:   { ko: '화염룡 이그니스', act: 1, kind: 'boss', hp: [156, 156], ai: 'cycle', moves: [
    MV('화염 숨결', { atk: 10, hex: H('burn') }), MV('할퀴기', { atk: 6, hits: 2, hex: H('burn') }), MV('용린 갑옷', { block: 16, hex: H('burn') }), MV('포효', { atk: 6, str: 2, hex: H('burn') })],
    rage: [MV('업화', { atk: 12, hex: H('burn', 2) }), MV('불바다', { atk: 8, hits: 2, hex: H('burn') }), MV('화염 숨결', { atk: 10, hex: H('burn', 2) }), MV('용린 갑옷', { block: 18, hex: H('burn') })] },
  orc:      { ko: '오크 대장 그로크', act: 1, kind: 'boss', hp: [136, 136], ai: 'cycle', moves: [
    MV('전쟁의 북', { atk: 7, hex: H('drums') }), MV('약탈', { atk: 8, steal: 12, heal: 6 }), MV('대도끼', { atk: 12, hex: H('drums') }), MV('약탈', { atk: 6, steal: 10, heal: 6, block: 6 })],
    rage: [MV('전쟁의 북', { atk: 8, hex: H('drums') }), MV('대약탈', { atk: 8, steal: 12, heal: 12 }), MV('광폭화', { atk: 5, hits: 3, hex: H('drums') })] },
  lich:     { ko: '리치 왕 모르가스', act: 1, kind: 'boss', hp: [124, 124], ai: 'cycle', moves: [
    MV('운명 비틀기', { atk: 11, hex: H('twist') }), MV('뼈 방패', { block: 20, atk: 4 }), MV('영혼 흡수', { atk: 11, heal: 10, hex: H('twist') }), MV('뼈 방패', { block: 14, str: 2 })],
    rage: [MV('운명 비틀기', { atk: 12, hex: H('twist', 2) }), MV('영혼 흡수', { atk: 13, heal: 12, hex: H('twist', 2) }), MV('뼈 방패', { block: 22, atk: 5 })] },
  hydra:    { ko: '세머리 용 트리글라브', act: 2, kind: 'boss', hp: [250, 250], ai: 'heads', moves: [
    MV('불 머리의 숨결', { atk: 13, hex: H('burn'), head: 'fire' }), MV('얼음 머리의 숨결', { atk: 11, hex: H('freeze', 2), head: 'ice' }), MV('독 머리의 숨결', { atk: 8, hits: 2, hex: H('poison'), head: 'poison' })] },
  cyclops:  { ko: '키클롭스 폴리페모스', act: 2, kind: 'boss', hp: [230, 230], ai: 'cycle', moves: [
    MV('외눈 응시', { atk: 11, hex: H('gaze') }), MV('바위 투척', { atk: 18, hex: H('drums') }), MV('약탈', { atk: 9, steal: 15, heal: 10 }), MV('외눈 응시', { atk: 8, block: 10, hex: H('gaze') })],
    rage: [MV('외눈 응시', { atk: 12, hex: H('gaze', 2) }), MV('바위 투척', { atk: 20, hex: H('drums') }), MV('분노의 발길질', { atk: 7, hits: 3, hex: H('gaze', 2) })] },
  overlord: { ko: '오버로드 네크라스', act: 2, kind: 'boss', hp: [190, 190], ai: 'cycle', moves: [
    MV('사령술', { str: 2, block: 10, atk: 5 }), MV('운명 역전', { atk: 12, hex: H('reverse') }), MV('뼈의 왕좌', { block: 18, atk: 6, hex: H('reverse') }), MV('운명 역전', { atk: 16, hex: H('reverse') })],
    rage: [MV('시간 역행', { heal: 30, block: 10, once: true }), MV('운명 역전', { atk: 14, hex: H('reverse') }), MV('사령술', { atk: 6, hits: 3, str: 1 }), MV('뼈의 왕좌', { block: 20, atk: 8, hex: H('reverse') })] },
  demon:    { ko: '마왕 릴리스', act: 3, kind: 'boss', hp: [255, 255], ai: 'cycle', moves: [
    MV('봉인', { atk: 13, hex: H('seal') }), MV('패기', { atk: 16, hex: H('haki') }), MV('봉인의 춤', { atk: 7, hits: 3, hex: H('seal') }), MV('패왕의 기세', { block: 24, str: 2, hex: H('haki') })],
    rage: [MV('이중 봉인', { atk: 14, hex: H('seal', 2) }), MV('패기', { atk: 18, hex: H('haki') }), MV('봉인의 춤', { atk: 8, hits: 3, hex: H('seal', 2) }), MV('종말', { atk: 26, hex: H('haki') })] },
};
// ── 히든 보스: 시공 광대 (지도에 없다 · JESTER_P) — 막마다 TUNE.hp/atk.special 로 체력 · 공격을 맞춘다
ENEMIES.jester = { ko: '시공 광대 크로노', act: 0, kind: 'special', hp: [150, 150], ai: 'random', talk: true, moves: [
  MV('저글링 칼', { atk: 5, hits: 3 }), MV('카드 장난', { atk: 8, hex: H('facedown', 2) }), MV('광대의 도전장', { atk: 9, hex: H('dare') }),
  MV('시한폭탄', { atk: 6, hex: H('bomb') }), MV('웃음 가스', { block: 14, str: 1, hex: H('facedown', 1) })],
  rage: [MV('난도질 저글링', { atk: 6, hits: 3 }), MV('카드 장난', { atk: 10, hex: H('facedown', 3) }), MV('광대의 도전장', { atk: 11, hex: H('dare') }), MV('시한폭탄', { atk: 8, hex: H('bomb') })] };
export const enemyInfo = id => ENEMIES[id];
export const ACT_INFO = {
  1: { ko: '어둠의 숲',     normal: ['slime', 'goblin', 'bat', 'wolf'], elite: ['shaman', 'mimic'], boss: ['dragon', 'orc', 'lich'] },
  2: { ko: '얼어붙은 폐허', normal: ['skeleton', 'ghost', 'wisp'], elite: ['knight', 'golem'], boss: ['hydra', 'cyclops', 'overlord'] },
  3: { ko: '마왕성',        normal: ['imp', 'hound', 'gargoyle'], elite: ['shade', 'champion'], boss: ['demon'] },
};
// 밸런스 조절용 배율 [1막, 2막, 3막] — 적 종류별 (sim/run.mjs 가 바꿔 가며 잰다)
export const TUNE = {
  hp:  { normal: [0.92, 0.95, 0.93], elite: [0.75, 0.8, 0.88], boss: [0.9, 1.08, 2.3], special: [0.73, 1.18, 1.9] },
  atk: { normal: [2.1, 2.17, 2.4], elite: [1.92, 2.03, 2.0], boss: [2.04, 2.07, 3.2], special: [1.9, 2.05, 2.3] },
  cap: 0.45,       // 적 한 턴 공격 상한 (영웅 최대 체력 대비) — atkOf
  capRef: 72,      // 상한을 잴 때 최대 체력은 적어도 이만큼으로 본다 (체력이 낮을수록 보스 공격이 더 깎여 오히려 유리해지지 않게)
};

// ── 지도 ─────────────────────────────────────────────────────────────────────
// 층(row) 1~ROWS, 그 위 ROWS+1 이 보스. 1층은 전투, 4층은 보물, ROWS층은 휴식.
export const NODE = {
  fight:    { ko: '전투',   icon: 'sword' },
  elite:    { ko: '엘리트', icon: 'skull' },
  event:    { ko: '이벤트', icon: 'scroll' },
  shop:     { ko: '상점',   icon: 'coins' },
  rest:     { ko: '휴식',   icon: 'fire' },
  treasure: { ko: '보물',   icon: 'gem' },
  boss:     { ko: '보스',   icon: 'crown' },
};
export function genMap(R) {
  const nodes = [];
  const at = {};                       // `${row}:${col}` → node
  const add = (row, col) => {
    const k = `${row}:${col}`;
    if (!at[k]) { at[k] = { id: nodes.length, row, col, type: null, next: [] }; nodes.push(at[k]); }
    return at[k];
  };
  const edges = new Set();            // 같은 층 사이에서 엇갈리는 길을 만들지 않으려고 기록
  const starts = shuffle(R, [0, 1, 2, 3]).slice(0, 3);
  for (let p = 0; p < 4; p++) {
    let col = starts[p % 3];
    let prev = add(1, col);
    for (let row = 2; row <= ROWS; row++) {
      const opts = [col - 1, col, col + 1].filter(c => c >= 0 && c < COLS);
      let nc = pick(R, opts);
      // 엇갈림: (row-1, col)→(row, nc) 와 (row-1, nc)→(row, col) 이 동시에 있으면 안 된다
      if (nc !== col && edges.has(`${row - 1}:${nc}>${col}`)) nc = col;
      edges.add(`${row - 1}:${col}>${nc}`);
      const n = add(row, nc);
      if (!prev.next.includes(n.id)) prev.next.push(n.id);
      prev = n; col = nc;
    }
  }
  const boss = add(ROWS + 1, 1.5);
  nodes.filter(n => n.row === ROWS).forEach(n => n.next.push(boss.id));
  boss.type = 'boss';
  // 칸 종류: 1층 전투 · 4층 보물 · ROWS층 휴식 · 나머지는 섞어서 (엘리트는 3층부터, 상점은 2층부터)
  const parents = id => nodes.filter(n => n.next.includes(id));
  for (const n of nodes.filter(x => x.row <= ROWS).sort((a, b) => a.row - b.row)) {
    if (n.row === 1) n.type = 'fight';
    else if (n.row === 4) n.type = 'treasure';
    else if (n.row === ROWS) n.type = 'rest';
    else {
      const w = { fight: 46, event: 24, elite: n.row >= 3 ? 16 : 0, shop: n.row >= 3 ? 14 : 0 };
      // 바로 앞 칸과 같은 특수 칸(엘리트 · 상점)은 피한다
      for (const p of parents(n.id)) if (p.type === 'elite' || p.type === 'shop') w[p.type] = 0;
      n.type = weighted(R, w);
    }
  }
  // 2막: 3층은 모두 이벤트 (어느 길로 가도 「주사위 깎는 노인」을 만난다)
  if (R.act === 2) nodes.filter(n => n.row === 3).forEach(n => { n.type = 'event'; });
  nodes.forEach(n => n.next.sort((a, b) => nodes[a].col - nodes[b].col));
  return { nodes, boss: boss.id };
}
export const mapNode = (R, id) => R.map.nodes[id];
export function nextNodes(R) {
  if (R.phase !== 'map') return [];
  if (R.pos == null) return R.map.nodes.filter(n => n.row === 1).map(n => n.id);
  return mapNode(R, R.pos).next.slice();
}

// ── 원정 만들기 ─────────────────────────────────────────────────────────────
// meta: 원정 성장 { lv: { hp, gold, tools, potion, relic, sharp, seal } }
export function createRun({ cls = 'gambler', seed = (Math.random() * 2 ** 32) >>> 0, name = '모험가', asc: lv = 0, meta = null } = {}) {
  const k = RUN_CLASSES[cls] ? cls : 'gambler';
  const ci = RUN_CLASSES[k];
  const a = Math.max(0, Math.min(ASC_MAX, Math.floor(Number(lv) || 0)));
  const ml = id => Math.max(0, Math.min(META.find(m => m.id === id).max, Math.floor(meta?.lv?.[id] || 0)));
  const hp = Math.round((ci.hp + ml('hp') * 2) * (a >= 6 ? 0.92 : 1));
  const R = {
    v: 1, seed: seed >>> 0, rng: seed >>> 0, uid: 0, asc: a, feats: [], meta0: meta ? JSON.parse(JSON.stringify(meta)) : null, acts: [],
    cls: k, name, hp, maxHp: hp, gold: 0,
    flip: ci.flip, nudge: ci.nudge, dance: k === 'dancer' ? 1 : 0,
    deck: [], relics: [], potions: [],
    act: 1, map: null, pos: null, boss: null, path: [],
    phase: 'map', C: null, reward: null, shop: null, event: null, pick: null,
    removes: 0, fx: [], log: [],
    stats: { fights: 0, elites: 0, bosses: 0, dmg: 0, maxHit: 0, taken: 0, healed: 0, turns: 0, cards: 0, gold: 0, floors: 0, atkSum: 0, atkN: 0 },
    ended: false, won: false, last: null,
    runNo: Math.max(0, Math.floor(Number(meta?.runs) || 0)) + 1,   // 몇 번째 원정인지 (히든 보스 등장 조건)
  };
  for (const cat of BASE_DECK) R.deck.push(mkCard(R, cat));
  R.deck.push(mkCard(R, ci.sp));      // 직업 특별 카드 1장 (에이스 · 듀스 · 트레이 중 직업에 어울리는 것)
  R.deck.push(mkCard(R, ci.sig.cat, 0, ci.sig.kw || []));
  // 원정 성장
  R.gold += ml('gold') * 20;
  if (ml('tools') >= 1) R.flip = Math.min(TOOL_CAP, R.flip + 1);
  if (ml('tools') >= 2) R.nudge = Math.min(TOOL_CAP, R.nudge + 1);
  for (let n = 0; n < ml('potion'); n++) R.potions.push('heal');
  // 인장 상자: 덱의 무작위 카드에 인장 (원정 내내 붙어 있다가, 그 카드를 내면 터진다)
  // 새로고침 횟수 (원정 내내): 상점 · 카드/유물 고르기
  R.rr = { shop: ml('reshop'), pick: ml('repick') };
  R.relicN = 2 + ml('appraise');
  for (let n = 0; n < ml('seal'); n++) { const free = R.deck.filter(c => !c.seal); if (free.length) pick(R, free).seal = pick(R, SEAL_IDS); }
  const sig = R.deck[R.deck.length - 1];
  if (ml('sharp') >= 1) sig.up = 1;
  R.dfaces = {};                       // 주사위 면 바꾸기 (주사위 깎는 노인)
  newAct(R);
  if (ml('relic')) {
    const id = START_RELIC[k] || rollRelic(R, 1);
    R.phase = 'reward';
    R.reward = { kind: 'start', items: [{ t: 'relic', id }] };
  }
  return R;
}

function newAct(R) {
  R.map = genMap(R);
  R.pos = null;
  R.boss = pick(R, ACT_INFO[R.act].boss);
  R.phase = 'map';
  R.lastFoe = null;
  R.omen = null; R.omenCat = null;
  R.omenOpts = rollOmens(R);
}
// 징조 2장: 1막은 순한 것 위주, 3막은 거친 것 위주 (승천이 높으면 더 거칠게)
function rollOmens(R) {
  const lean = R.act + (R.asc >= 6 ? 1 : 0);
  const w = Object.fromEntries(OMENS.map(o => [o.id, Math.max(1, 6 - Math.abs(o.tier - lean) * 2)]));
  const a = weighted(R, w); delete w[a];
  return [a, weighted(R, w)];
}
export const chooseOmen = act('chooseOmen', function chooseOmen(R, k) {
  if (!R.omenOpts) fail('고를 징조가 없어요.');
  const id = R.omenOpts[k];
  if (!id) fail('없는 징조예요.');
  R.omen = id; R.omenOpts = null;
  if (id === 'regular') R.rr = { ...rrOf(R), shop: rrOf(R).shop + 1 };   // 단골손님의 날: 상점 새로고침 +1
  if (id === 'wish') R.rr = { ...rrOf(R), pick: rrOf(R).pick + 1 };      // 별똥별 소원: 카드 · 유물 새로고침 +1
  if (id === 'forbid') R.omenCat = pick(R, SAME_CATS_ALL.filter(c => c !== 'choice'));
  // 상인의 길: 전투 칸 일부가 상점으로 (1층 · 마지막 층 제외)
  const to = id === 'merchant' ? 'shop' : null;
  if (to) for (const n of R.map.nodes) if (n.type === 'fight' && n.row >= 2 && n.row < ROWS - 1 && rand(R) < 0.3) n.type = to;
  fx(R, { type: 'omen', id });
});

// ── 칸 들어가기 ─────────────────────────────────────────────────────────────
export const enterNode = act('enterNode', function enterNode(R, id) {
  if (R.phase !== 'map') fail('지금은 지도를 움직일 수 없어요.');
  if (R.omenOpts) fail('먼저 이번 막의 징조를 골라 주세요.');
  if (!nextNodes(R).includes(id)) fail('갈 수 없는 칸이에요.');
  const n = mapNode(R, id);
  R.pos = id;
  R.path.push(id);
  R.stats.floors++;
  fx(R, { type: 'enter', node: id, kind: n.type });
  if (jesterNow(R, n)) { R.jester = { met: true, then: id }; fx(R, { type: 'jesterIn' }); return startCombat(R, 'jester'); }
  doNode(R, n);
});
// 히든 보스가 끼어드는가 (한 원정에 한 번). 예전 원정(runNo 없음) · 3번째 원정 전에는 난수를 뽑지 않는다 (같은 시드의 원정이 그대로 돌게)
function jesterNow(R, n) {
  if (R.jester?.met || R.trial || R.sbFight || R.act > 2 || n.type === 'boss' || !(R.runNo >= JESTER_FROM)) return false;
  if (R.runNo === JESTER_FIXED && R.act === 2 && n.row >= JESTER_ROW) return true;
  return rand(R) < JESTER_P;
}
// 광대전이 끝나면 원래 가려던 칸으로
function jesterResume(R) {
  const id = R.jester?.then;
  R.C = null; R.reward = null; R.sbFight = false;
  if (id == null) { R.phase = 'map'; return; }
  R.jester.then = null;
  doNode(R, mapNode(R, id));
}
function doNode(R, n) {
  if (n.type === 'fight') return startCombat(R, pickFoe(R, 'normal'));
  if (n.type === 'elite') return startCombat(R, pickFoe(R, 'elite'));
  if (n.type === 'boss') return startCombat(R, R.boss);
  if (n.type === 'shop') { R.phase = 'shop'; R.shop = genShop(R); return; }
  if (n.type === 'rest') { R.phase = 'rest'; return; }
  if (n.type === 'treasure') {
    R.phase = 'reward';
    // 보물 상자: 유물 고르기 (기본 2개 중 1개 · 새로고침 가능)
    const opts = [];
    for (let k = 0; k < relicChoices(R); k++) { const id = rollRelic(R, relicRarity(R, 'treasure'), opts); if (id) opts.push(id); }
    R.reward = { kind: 'treasure', items: [...(opts.length ? [{ t: 'relicPick', opts, kind: 'treasure' }] : []), { t: 'gold', n: int(R, 15, 30) }] };
    return;
  }
  if (n.type === 'event') return startEvent(R);
  R.phase = 'map';
}
function pickFoe(R, kind) {
  const pool = ACT_INFO[R.act][kind].filter(id => id !== R.lastFoe);
  const id = pick(R, pool);
  R.lastFoe = id;
  return id;
}

// ── 전투 ─────────────────────────────────────────────────────────────────────
export const C_ = R => R.C;
export const handSize = R => Math.max(1, HAND + (R.cls === 'mage' ? 1 : 0) + (hasRelic(R, 'crown') ? 1 : 0) + (hasRelic(R, 'libkey') && R.deck.length >= LIBKEY_MIN ? 1 : 0) - (hasRelic(R, 'emptyhand') ? 2 : 0) - (omen(R, 'rift') ? 1 : 0));
export const diceCount = R => (hasRelic(R, 'sixth') ? 6 : 5);
export function maxRolls(R) {
  const C = R.C;
  let n = ROLLS + (hasRelic(R, 'reroll') ? 1 : 0) + (C?.extraRolls || 0) + (omen(R, 'rift') ? 1 : 0);
  if (C?.hex?.t === 'drums') n--;
  return Math.max(1, n);
}
const isBossKind = e => ENEMIES[e.id].kind !== 'normal';
export const isSealed = (R, i) => !!R.C?.sealed?.includes(i);
export const isFrozen = (R, i) => !!R.C?.frozen?.includes(i);
export const hexActive = (R, t) => R.C?.hex?.t === t && !R.C.pure;
export const toolsLocked = R => hexActive(R, 'haki');

export function startCombat(R, foeId) {
  const def = ENEMIES[foeId];
  const a = R.act - 1;
  const hpMul = TUNE.hp[def.kind][a] * (def.kind === 'elite' && asc(R, 1) ? 1.15 : 1) * (def.kind === 'boss' && asc(R, 3) ? 1.15 : 1) * (def.kind === 'boss' && asc(R, 10) ? 1.1 : 1);
  const hp = Math.round(int(R, def.hp[0], def.hp[1]) * hpMul * (omen(R, 'bounty') ? 1.25 : 1) * (def.kind === 'elite' && omen(R, 'war') ? 1.5 : 1));
  const e = { id: foeId, hp, maxHp: hp, block: 0, str: 0, weak: 0, burn: 0, burnT: 0, mi: -1, intent: null, raged: false, last: [], cut: def.ai === 'heads' ? {} : null, regrew: false };
  R.C = {
    e, turn: 0, phase: 'roll',
    draw: shuffle(R, R.deck.map(c => ({ ...c }))), hand: [], discard: [], top: [],
    dice: [], held: [], rolled: false, rollNo: 0, rollsLeft: 0, dealtTurn: 0,
    block: 0, weak: 0, swaps: 0, flipped: false, bet: null, danced: false,
    deals: R.cls === 'sharper' ? CLASS_TUNE.deals : 0,
    hex: null, sealed: [], frozen: [], gazed: [], pure: false, power: false, extraRolls: 0,
    dealt: 0, taken: 0,
    lastCat: null, chainN: 0, kal: 0, plays: 0, played: {}, swapUsed: 0, bank: 0,
    hidden: [], jest: null, jshuf: 0, rentMap: {}, rent: [],
  };
  R.phase = 'combat';
  R.stats.fights += def.kind === 'normal' ? 1 : 0;
  // 전투 시작 효과 (유물 · 직업)
  if (R.cls === 'rogue') addTool(R, 'flip', CLASS_TUNE.rogueFlip);
  if (hasRelic(R, 'flip')) addTool(R, 'flip', 1);
  if (hasRelic(R, 'yacht')) addTool(R, 'flip', 1);
  if (hasRelic(R, 'nudge')) addTool(R, 'nudge', RT.nudge);
  fx(R, { type: 'combat', foe: foeId, kind: def.kind, hp });
  log(R, `${def.ko} 등장!`);
  chooseIntent(R);
  startTurn(R);
  if (hasRelic(R, 'bone')) { R.C.block += RT.bone; fx(R, { type: 'heroBlock', n: RT.bone, why: 'bone' }); }
  // 인장 주머니 · 인장의 비: 손패의 무작위 카드에 그 전투 동안 인장
  const n = (hasRelic(R, 'sealbag') ? 1 : 0) + (omen(R, 'sealrain') ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const free = R.C.hand.filter(c => !c.seal);
    if (!free.length) break;
    const c = pick(R, free);
    c.seal = pick(R, SEAL_IDS);
    fx(R, { type: 'sealOn', u: c.u, seal: c.seal });
  }
}

function addTool(R, kind, n) {
  const add = Math.max(0, Math.min(n, TOOL_CAP - R[kind]));
  R[kind] += add;
  if (add) fx(R, { type: 'tool', kind, n: add });
  return add;
}

// 적의 다음 행동 고르기 (행동 직후, 그리고 전투 시작 때)
function movesOf(R) {
  const e = R.C.e, def = ENEMIES[e.id];
  return e.raged && def.rage ? def.rage : def.moves;
}
function chooseIntent(R) {
  const e = R.C.e, def = ENEMIES[e.id];
  const moves = movesOf(R);
  let i;
  if (def.ai === 'heads') {
    // 세머리 용: 불 → 얼음 → 독 차례로, 잘린 머리는 건너뛴다 (셋 다 잘리면 몸통 박치기)
    const alive = moves.map((m, k) => k).filter(k => !e.cut[moves[k].head]);
    if (!alive.length) { e.mi = -1; e.intent = MV('몸통 박치기', { atk: 14 }); return; }
    i = alive.find(k => k > e.mi) ?? alive[0];
  } else if (def.ai === 'cycle') {
    i = (e.mi + 1) % moves.length;
    for (let k = 0; k < moves.length && moves[i].once && e.used?.includes(`${e.raged ? 'r' : 'n'}${i}`); k++) i = (i + 1) % moves.length;
  } else {
    const ban = e.last.length >= 2 && e.last[0] === e.last[1] ? e.last[0] : -1;
    const opts = moves.map((m, k) => k).filter(k => k !== ban);
    i = Number(weighted(R, Object.fromEntries(opts.map(k => [k, moves[k].w ?? 1]))));
  }
  e.mi = i;
  e.last = [i, ...e.last].slice(0, 2);
  e.intent = { ...moves[i] };
  if (moves[i].once) (e.used ||= []).push(`${e.raged ? 'r' : 'n'}${i}`);
}

// 의도 화면 표시용: [{ k: 'atk'|'block'|'str'|'heal'|'steal'|'weak'|'hex', n, hits, t }]
export function intentParts(R) {
  const C = R.C, e = C?.e, m = e?.intent;
  if (!m) return [];
  const out = [];
  if (m.hex) out.push({ k: 'hex', t: m.hex.t, n: m.hex.n });
  if (m.atk) out.push({ k: 'atk', n: atkOf(R, m.atk, m.hits || 1), hits: m.hits || 1 });
  if (m.block) out.push({ k: 'block', n: m.block });
  if (m.str) out.push({ k: 'str', n: m.str });
  if (m.heal) out.push({ k: 'heal', n: m.heal });
  if (m.steal) out.push({ k: 'steal', n: m.steal });
  if (m.weak) out.push({ k: 'weak', n: m.weak });
  return out;
}
// 적 한 대의 실제 공격력 (힘 · 막 배율 · 약화 반영)
// 받는 피해 배율 (유리 대포 ×1.4 · 피의 축제 ×1.5). 적 공격 수치(의도 · 딱 막기 · 받을 피해)에 처음부터 넣는다
export const hurtMul = R => (hasRelic(R, 'glasscannon') ? 1.4 : 1) * (omen(R, 'feast') ? 1.5 : 1);
// 돌연사 막기: 적 한 턴 공격(연타 합계)은 영웅 최대 체력의 TUNE.cap 까지 (보호막 빼기 전 · 유리 대포 · 피의 축제 배율 전).
// 연타 공격은 쌓인 힘(분노 · 격앙 · 힘 올리기)을 한 대에 절반만 더한다 — 힘이 쌓인 연타가 한 번에 체력을 다 지우던 것
export function atkOf(R, base, hits = 1) {
  const e = R.C.e;
  const kind = ENEMIES[e.id].kind;
  const am = (kind === 'normal' && asc(R, 2) ? 1.1 : 1) * (kind === 'elite' && asc(R, 8) ? 1.15 : 1) * (kind === 'boss' && asc(R, 9) ? 1.1 : 1);
  const raw = (base + (hits > 1 ? e.str / 2 : e.str)) * TUNE.atk[kind][R.act - 1] * am;
  const v = Math.round(Math.min(raw, (Math.max(R.maxHp, TUNE.capRef) * TUNE.cap) / hits) * hurtMul(R));
  return e.weak > 0 ? Math.floor(v / 2) : v;
}
export const incoming = R => { const m = R.C?.e?.intent; return m?.atk ? atkOf(R, m.atk, m.hits || 1) * (m.hits || 1) : 0; };

// 광기의 저울: 이번 턴 공격 몫 (턴이 시작될 때 정해져 화면에 보인다)
export const madTilt = R => R.C?.tilt ?? 0.5;
function startTurn(R) {
  const C = R.C;
  C.turn++;
  if (hasRelic(R, 'madscale')) C.tilt = [0, 0.25, 0.5, 0.75, 1][Math.floor(rand(R) * 5)];
  R.stats.turns++;
  C.phase = 'roll';
  C.block = 0;
  C.rolled = false;
  C.rollNo = 0;
  C.flipped = false;
  C.bet = null;
  C.danced = false;
  C.sealed = []; C.frozen = []; C.gazed = [];
  C.pure = false; C.power = false; C.extraRolls = 0;
  C.plays = 0; C.magnet = false; C.swapUsed = 0; C.monked = false;
  // 보존 상자: 손패에 남아 있던 보존 카드 수 (그 턴 첫 카드)
  C.keepUp = hasRelic(R, 'keepbox') ? C.hand.filter(c => hasKw(c, 'keep')).length * 0.15 : 0;
  C.swaps = 1 + (hasRelic(R, 'medal') ? 1 : 0);
  C.hex = C.e.intent?.hex ? { ...C.e.intent.hex } : null;
  const n = diceCount(R);
  C.dice = new Array(n).fill(0);
  C.held = new Array(n).fill(false);
  C.rollsLeft = maxRolls(R) + (C.bank || 0);     // 모래 저금통: 지난 턴에 남긴 굴림
  C.bank = 0;
  fx(R, { type: 'turn', n: C.turn });
  if (R.cls === 'bard') { C.block += CLASS_TUNE.bardBlock; fx(R, { type: 'heroBlock', n: CLASS_TUNE.bardBlock, why: 'bard' }); }
  if (hasRelic(R, 'iron')) { C.block += 3; fx(R, { type: 'heroBlock', n: 3, why: 'iron' }); }
  if (hasRelic(R, 'midas')) addTool(R, 'nudge', 1);
  if (C.rampart) { C.block += C.rampart; fx(R, { type: 'heroBlock', n: C.rampart, why: 'rampart' }); C.rampart = 0; }
  // 손패 채우기: 메아리 카드(지난 턴에 낸 것)가 먼저 돌아온다
  const drawn = [];
  while (C.top.length && C.hand.length < handSize(R)) { const c = C.top.shift(); C.hand.push(c); drawn.push(c.u); }
  drawn.push(...drawCards(R, handSize(R) - C.hand.length));
  fx(R, { type: 'draw', us: drawn });
  if (C.hex) {
    fx(R, { type: 'hex', t: C.hex.t, n: C.hex.n, when: 'turn' });
    if (C.hex.t === 'gaze') {
      C.gazed = shuffle(R, C.hand.map(c => c.u)).slice(0, C.hex.n);
      fx(R, { type: 'gaze', us: C.gazed.slice() });
    }
    if (C.hex.t === 'facedown') {
      C.hidden = shuffle(R, C.hand.map(c => c.u)).slice(0, C.hex.n);
      fx(R, { type: 'facedown', us: C.hidden.slice() });
    }
    if (C.hex.t === 'dare' || C.hex.t === 'bomb') {
      // 광대 카드: 큰 족보 하나 (이번 턴만 · 내면 사라진다)
      const c = { ...mkCard(R, pick(R, ['full', 'sstr', 'four', 'lstr', 'choice'])), temp: true, jest: C.hex.t };
      C.hand.push(c);
      C.jest = { kind: C.hex.t, u: c.u };
      fx(R, { type: 'jestCard', u: c.u, cat: c.cat, kind: C.hex.t });
    }
  }
  // 시공 광대: 몰래 손패를 섞을 굴림 (예고 없음)
  if (ENEMIES[C.e.id].talk) C.jshuf = rand(R) < JESTER_SHUFFLE ? 1 + Math.floor(rand(R) * 2) : 0;
  syncRent(R);
}
// 유물 대여: 손패에 있는 대여 카드마다 유물 2개 (손패에 들어올 때 정하고, 나가면 돌려준다)
function syncRent(R) {
  const C = R.C;
  if (!C) return;
  const inHand = new Set(C.hand.filter(c => c.cat === 'xrent').map(c => c.u));
  const before = C.rent.slice();
  for (const u of Object.keys(C.rentMap)) if (!inHand.has(Number(u))) delete C.rentMap[u];
  for (const u of inHand) if (!C.rentMap[u]) {
    const own = new Set([...R.relics, ...Object.values(C.rentMap).flat()]);
    const pool = RENT_POOL.filter(id => RELICS.some(r => r.id === id) && !own.has(id));
    const a = pick(R, pool), b = pick(R, pool.filter(x => x !== a));
    C.rentMap[u] = [a, b].filter(Boolean);
  }
  C.rent = Object.values(C.rentMap).flat();
  if (C.rent.join() !== before.join()) fx(R, { type: 'rent', ids: C.rent.slice(), from: before });
}
// 시공 광대가 손패를 몰래 섞는다: 광대 카드 · 보존 카드 말고 모두 버리고 같은 수만큼 새로 뽑는다
function jesterShuffle(R) {
  const C = R.C;
  const out = C.hand.filter(c => !c.jest && !hasKw(c, 'keep') && C.bet !== c.u);
  if (!out.length) return;
  C.hand = C.hand.filter(c => !out.includes(c));
  C.discard.push(...out.filter(c => !c.temp));
  C.gazed = C.gazed.filter(u => C.hand.some(c => c.u === u)); C.hidden = C.hidden.filter(u => C.hand.some(c => c.u === u));
  const got = drawCards(R, out.length);
  fx(R, { type: 'jestShuffle', out: out.map(c => c.u), in: got });
  syncRent(R);
}

function drawCards(R, n) {
  const C = R.C, out = [];
  for (let k = 0; k < n; k++) {
    if (!C.draw.length) {
      if (!C.discard.length) break;
      C.draw = shuffle(R, C.discard);
      C.discard = [];
      fx(R, { type: 'reshuffle' });
    }
    const c = C.draw.pop();
    C.hand.push(c);
    out.push(c.u);
  }
  return out;
}

const inCombat = R => { if (R.phase !== 'combat' || !R.C || R.C.phase !== 'roll') fail('지금은 할 수 없어요.'); return R.C; };

export const roll = act('roll', function roll(R) {
  const C = inCombat(R);
  if (C.rollsLeft <= 0) fail('굴림 기회를 다 썼어요.');
  // 봉인된 주사위만 남아도 굴릴 수 있다 (굴리면 봉인이 풀린다 — 메인 게임 engine.js 와 같게). 언 주사위는 못 굴린다
  if (C.rolled && C.held.every((h, i) => h || isFrozen(R, i))) fail('모든 주사위를 잡고 있어요.');
  if (R.cls === 'gambler' && !C.rolled && C.bet == null && C.hand.length) fail('먼저 이번 턴에 배팅할 카드를 고르세요.');
  const rolled = C.dice.map((v, i) => !(C.rolled && (C.held[i] || isSealed(R, i) || isFrozen(R, i))));
  C.dice = C.dice.map((v, i) => (rolled[i] ? rollFace(R, i) : v));
  if (!C.rolled) C.held = C.held.map(() => false);
  C.rolled = true;
  C.rollsLeft--;
  C.rollNo++;
  if (C.sealed.length && C.rollNo >= 2) { fx(R, { type: 'unseal', dice: C.sealed.slice() }); C.sealed = []; }
  // 행운의 부적: 첫 굴림 뒤 가장 낮은 주사위 1개를 공짜로 다시
  if (C.rollNo === 1 && hasRelic(R, 'lucky')) {
    const i = C.dice.map((v, k) => k).sort((a, b) => C.dice[a] - C.dice[b])[0];
    if (C.dice[i] < 6) {
      const from = C.dice.slice();
      C.dice[i] = die(R);
      fx(R, { type: 'lucky', dice: [i], from, to: C.dice[i] });
    }
  }
  if (hasRelic(R, 'magnet') && !C.magnet) magnetDice(R);
  afterRollHex(R);
  if (C.jshuf && C.jshuf === C.rollNo && !C.pure) { C.jshuf = 0; jesterShuffle(R); }
});

// 자석 주사위: 같은 눈이 MAGNET_N 개 이상이면 (많은 쪽, 같으면 큰 눈) 다른 주사위 1개를 그 눈으로
function magnetDice(R) {
  const C = R.C, cnt = [0, 0, 0, 0, 0, 0, 0];
  C.dice.forEach(v => cnt[v]++);
  let f = 0;
  for (let v = 6; v >= 1; v--) if (cnt[v] >= MAGNET_N && cnt[v] > (cnt[f] || 0)) f = v;
  if (!f) return;
  const i = C.dice.findIndex((v, k) => v !== f && !isSealed(R, k) && !isFrozen(R, k));
  if (i < 0) return;
  C.magnet = true;
  const from = C.dice.slice();
  C.dice[i] = f;
  fx(R, { type: 'lucky', dice: [i], from, to: f, why: 'magnet' });
}

// 적의 방해가 굴림 직후에 걸린다
function afterRollHex(R) {
  const C = R.C, h = C.hex;
  if (!h || C.pure) return;
  const free = () => C.dice.map((v, i) => i).filter(i => !isSealed(R, i) && !isFrozen(R, i));
  if (C.rollNo === 1) {
    if (h.t === 'burn') {
      const idx = free().sort((a, b) => C.dice[b] - C.dice[a]).slice(0, h.n || 1).filter(i => C.dice[i] > 1);
      if (idx.length) {
        const from = C.dice.slice();
        idx.forEach(i => (C.dice[i] = 1));
        fx(R, { type: 'hexDice', t: 'burn', dice: idx, from, to: 1 });
      }
    }
    if (h.t === 'freeze') {
      C.frozen = shuffle(R, free()).slice(0, h.n);
      C.frozen.forEach(i => (C.held[i] = false));
      fx(R, { type: 'hexDice', t: 'freeze', dice: C.frozen.slice() });
    }
    if (h.t === 'seal') {
      C.sealed = shuffle(R, free()).slice(0, h.n);
      C.sealed.forEach(i => (C.held[i] = false));
      fx(R, { type: 'hexDice', t: 'seal', dice: C.sealed.slice() });
    }
  }
  if (C.rollNo === 2 && (h.t === 'twist' || h.t === 'reverse')) {
    const from = C.dice.slice();
    let idx;
    if (h.t === 'twist') idx = shuffle(R, free()).slice(0, h.n);
    else {
      const cnt = [0, 0, 0, 0, 0, 0, 0];
      free().forEach(i => cnt[C.dice[i]]++);
      const top = Math.max(...cnt);
      const face = [6, 5, 4, 3, 2, 1].find(v => cnt[v] === top);
      idx = free().filter(i => C.dice[i] === face);
    }
    idx.forEach(i => (C.dice[i] = 7 - C.dice[i]));
    if (idx.length) fx(R, { type: 'hexDice', t: h.t, dice: idx, from, to: null });
  }
}

export const toggleHold = act('toggleHold', function toggleHold(R, i) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (i < 0 || i >= C.dice.length) fail('없는 주사위예요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 움직일 수 없어요. 다시 굴리면 풀려요.');
  if (isFrozen(R, i)) fail('얼어붙은 주사위는 이번 턴에 다시 굴릴 수 없어요. 뒤집기 · 조정은 할 수 있어요.');
  C.held[i] = !C.held[i];
});

export const useFlip = act('useFlip', function useFlip(R, i) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (R.flip <= 0) fail('뒤집기가 없어요.');
  if (toolsLocked(R)) fail('패기! 이번 턴은 뒤집기를 쓸 수 없어요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 뒤집을 수 없어요.');
  C.dice[i] = 7 - C.dice[i];
  R.flip--;
  C.flipped = true;
});

export const useNudge = act('useNudge', function useNudge(R, i, d) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (R.nudge <= 0) fail('조정이 없어요.');
  if (toolsLocked(R)) fail('패기! 이번 턴은 조정을 쓸 수 없어요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 조정할 수 없어요.');
  const v = C.dice[i] + (d > 0 ? 1 : -1);
  if (v < 1 || v > 6) fail('주사위는 1~6 사이여야 해요.');
  C.dice[i] = v;
  R.nudge--;
});

// 카드 교체: 손패 1장을 버리고 새로 1장 (턴마다 1번, 훈장이면 2번)
export const swapCard = act('swapCard', function swapCard(R, hi) {
  const C = inCombat(R);
  if (C.swaps <= 0) fail('이번 턴에는 더 바꿀 수 없어요.');
  const c = C.hand[hi];
  if (!c) fail('없는 카드예요.');
  if (C.bet === c.u) fail('배팅한 카드는 바꿀 수 없어요.');
  C.hand.splice(hi, 1);
  C.discard.push(c);
  C.gazed = C.gazed.filter(u => u !== c.u);
  C.swaps--;
  C.swapUsed = (C.swapUsed || 0) + 1;
  const got = drawCards(R, 1);
  // 새 카드를 같은 자리에
  if (got.length) { const nc = C.hand.pop(); C.hand.splice(hi, 0, nc); }
  fx(R, { type: 'swap', out: c.u, in: got[0] ?? null });
  C.hidden = C.hidden.filter(u => u !== c.u);
  syncRent(R);
});

export const placeBet = act('placeBet', function placeBet(R, hi) {
  const C = inCombat(R);
  if (R.cls !== 'gambler') fail('도박사만 배팅할 수 있어요.');
  if (C.rolled) fail('배팅은 굴리기 전에만 할 수 있어요.');
  const c = C.hand[hi];
  if (!c) fail('없는 카드예요.');
  C.bet = c.u;
  fx(R, { type: 'bet', u: c.u });
});

export const canDance = R => R.cls === 'dancer' && R.phase === 'combat' && R.C?.phase === 'roll' && R.C.rolled && R.dance > 0 && !R.C.danced && !toolsLocked(R);
export const useDance = act('useDance', function useDance(R) {
  const C = inCombat(R);
  if (!canDance(R)) fail(toolsLocked(R) ? '패기! 이번 턴은 춤출 수 없어요.' : '지금은 춤사위를 쓸 수 없어요.');
  const from = C.dice.slice();
  C.dice = C.dice.map((v, i) => (isSealed(R, i) ? v : Math.min(6, v + 1)));
  R.dance--;
  C.danced = true;
  fx(R, { type: 'dance', from, to: C.dice.slice() });
});

export const canDeal = R => R.cls === 'sharper' && R.phase === 'combat' && R.C?.phase === 'roll' && R.C.rolled && R.C.deals > 0 && (R.C.dealtTurn !== R.C.turn || R.C.dealtN < CLASS_TUNE.dealsTurn) && !toolsLocked(R);
export const useDeal = act('useDeal', function useDeal(R, i, v) {
  const C = inCombat(R);
  if (!canDeal(R)) fail(toolsLocked(R) ? '패기! 이번 턴은 밑장빼기를 할 수 없어요.' : '지금은 밑장빼기를 할 수 없어요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 바꿀 수 없어요.');
  v = Math.floor(Number(v));
  if (!(v >= 1 && v <= 6)) fail('주사위는 1~6 사이여야 해요.');
  const from = C.dice[i];
  C.dice[i] = v;
  C.deals--;
  C.dealtN = C.dealtTurn === C.turn ? (C.dealtN || 0) + 1 : 1;
  C.dealtTurn = C.turn;
  fx(R, { type: 'deal', i, from, v });
});

// 회복 물약은 전투 밖(지도 · 보상 · 상점 · 휴식 · 이벤트)에서도 마실 수 있다. 다른 물약은 전투 중에만
export const canDrinkOut = R => !R.ended && R.phase !== 'combat' && R.phase !== 'won' && R.phase !== 'lost';
export const usePotion = act('usePotion', function usePotion(R, slot) {
  const id = R.potions[slot];
  if (!id) fail('빈 칸이에요.');
  if (id === 'heal' && canDrinkOut(R)) {
    if (R.hp >= R.maxHp) fail('체력이 가득 차 있어요.');
    R.potions.splice(slot, 1);
    fx(R, { type: 'potion', id });
    healHero(R, 28, 'potion');
    return;
  }
  const C = inCombat(R);
  R.potions.splice(slot, 1);
  fx(R, { type: 'potion', id });
  if (id === 'heal') healHero(R, 28, 'potion');
  if (id === 'block') { C.block += 24; fx(R, { type: 'heroBlock', n: 24, why: 'potion' }); }
  if (id === 'fire') hitEnemy(R, 20, { pierce: true, why: 'potion' });
  if (id === 'time') { C.extraRolls += 2; C.rollsLeft += 2; }
  if (id === 'power') C.power = true;
  if (id === 'pure') {
    C.pure = true; C.weak = 0;
    if (C.sealed.length) fx(R, { type: 'unseal', dice: C.sealed.slice() });
    if (C.hex?.t === 'drums') C.rollsLeft++;
    C.sealed = []; C.frozen = []; C.gazed = [];
  }
  if (C.e.hp <= 0) winCombat(R);
});
export const dropPotion = act('dropPotion', (R, slot) => { R.potions.splice(slot, 1); });

// ── 카드 점수 ────────────────────────────────────────────────────────────────
// 기본 점수(요트 원룰) + 보너스 목록. 보너스는 모두 기본 점수에 대한 배율이라 더해서 쌓는다
// (강화 +30% 와 장인 +50% 가 같이 있으면 +80%). 응시 · 약화 · 독은 마지막에 전체에 곱한다.
// 공명의 종 (유물): 포 · 파이브 · 식스 카드에 맞는 주사위가 3개 이상이면 +100% (예전 '같은 눈 보너스'를 유물로 옮겼다)
export const RESO_CATS = ['fours', 'fives', 'sixes'], RESO_N = 3, RESO_MUL = 0.25;
// 균형의 추: 1의 눈을 6으로 셀 수 있다 → 1을 6으로 바꾼 모든 경우 중 가장 좋은 점수
function bestBase(R, cat, dice) {
  const bs = set => (cat === 'twos' ? twoScore(R, set.filter(v => v === 2).length) : relaxBase(R, cat, set) ?? baseScore(cat, set));
  const one = (d) => Math.max(0, ...fiveSets(d).map(bs));
  if (!hasRelic(R, 'balance') || !dice.includes(1)) return one(dice);
  const ones = dice.map((v, i) => (v === 1 ? i : -1)).filter(i => i >= 0);
  let best = 0;
  for (let m = 0; m < 1 << ones.length; m++) best = Math.max(best, one(dice.map((v, i) => (ones.includes(i) && m & (1 << ones.indexOf(i)) ? 6 : v))));
  return best;
}
// 목발: 라지 스트레이트는 4개만 이어져도 30. 빈집: 풀하우스 · 포카인드는 같은 눈 3개만 있어도 5개 합
// (조건을 못 채우면 null → 원래 규칙)
function relaxBase(R, cat, set) {
  if (cat === 'lstr' && hasRelic(R, 'crutch') && baseScore('sstr', set) > 0) return 30;
  if ((cat === 'full' || cat === 'four') && hasRelic(R, 'emptyhouse')) {
    const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of set) c[v]++;
    if (Math.max(...c) >= 3) return set.reduce((a, v) => a + v, 0);
  }
  return null;
}
// 숫자 카드에 맞는 주사위 수 (듀스는 점수가 2^n 이라 거꾸로 센다)
function upN(R, cat, base) {
  if (cat === 'twos') return base > 0 ? Math.round(Math.log2(base)) - (hasRelic(R, 'culture') ? 1 : 0) : 0;
  return Math.round(base / (UPPER.indexOf(cat) + 1));
}
// 점수 계산 규칙 (사용자 결정): 유물 · 직업 · 물약 · 징조의 배수는 모두 합연산 (+% 끼리 더해 한 번에 곱한다).
// 곱연산은 카드 자신의 것만: 강화(+30%) · 속공(×1.5). 응시 · 약화는 마지막에.
export function scoreCard(R, card, dice = R.C?.dice || [], opts = {}) {
  const C = R.C;
  if (isFuture(card.cat)) return { base: 0, parts: [], total: 0, notes: [] };
  let base = dice.length && !dice.includes(0) ? bestBase(R, card.cat, dice) : 0;
  const parts = [];
  const notes0 = [];
  const forbid = omen(R, 'forbid') && R.omenCat === card.cat;
  if (base > 0 && forbid) { base = 0; notes0.push('금지된 족보'); }
  // 주인공(에이스): 낼 때마다 자란 기본 점수. 1이 없어도 붙는다
  const hero = card.cat === 'ones' && card.grow && dice.length && !dice.includes(0) && !forbid ? card.grow : 0;
  const on = base > 0 || hero > 0;
  // 유물이 기본 점수를 바꾼다 (수집가의 상자 · 질풍). 배율은 바뀐 기본 점수에 붙는다
  let adj = base;
  if (on) {
    if (isUpper(card.cat)) {
      const n = upN(R, card.cat, base);
      if (n && hasRelic(R, 'pairs')) { parts.push({ ko: '수집가의 상자', amt: n * RT.pairs }); adj += n * RT.pairs; }
    } else if (card.cat === 'sstr' && !hasRelic(R, 'flow')) {
      adj = 20; parts.push({ ko: '스몰 스트레이트', amt: 5 });          // 원정에서는 15 → 20 (낮은 족보 살리기)
    } else if (hasRelic(R, 'flow') && (card.cat === 'sstr' || card.cat === 'lstr')) {
      adj = card.cat === 'sstr' ? 25 : RT.flowL;
      parts.push({ ko: '질풍', amt: adj - base });
    } else if (hasRelic(R, 'weight') && card.cat === 'choice' && C?.rollsLeft > 0) {
      parts.push({ ko: '저울추', amt: C.rollsLeft * RT.weight });
      adj += C.rollsLeft * RT.weight;
    }
    if (hero) { parts.push({ ko: '주인공', amt: hero }); adj += hero; }
    const hm = hasRelic(R, 'hammer') ? hammerBonus(R, card.cat) : 0;
    if (hm) { parts.push({ ko: '장인의 망치', amt: hm }); adj += hm; }
  }
  // 합연산: 모든 +% 를 모아 바뀐 기본 점수에 한 번에 붙인다
  const add = (ko, mul) => { const amt = Math.round(adj * mul); if (amt) parts.push({ ko, amt }); };
  if (on) {
    if (hasRelic(R, 'small') && ['ones', 'twos', 'threes'].includes(card.cat)) add('작은 수의 힘', 0.2);
    if (hasRelic(R, 'quad') && isUpper(card.cat) && upN(R, card.cat, base) === 2) add('쌍둥이 별', 1);
    if (hasRelic(R, 'basic') && isUpper(card.cat)) add('기초 수련', 0.3);
    if (hasRelic(R, 'reso') && RESO_CATS.includes(card.cat) && upN(R, card.cat, base) >= RESO_N) add('공명의 종', RESO_MUL);
    if (hasRelic(R, 'choice') && card.cat === 'choice') add('선택의 달인', RT.choice);
    if (hasRelic(R, 'full') && card.cat === 'full') add('풀하우스 장인', 0.5);
    if (hasRelic(R, 'straight') && (card.cat === 'sstr' || card.cat === 'lstr')) add('질주', 0.3);
    if (hasRelic(R, 'fourk') && card.cat === 'four') add('사냥 본능', 0.5);
    if (hasRelic(R, 'yacht') && card.cat === 'yacht') add('요트 신봉자', 0.5);
    if (R.cls === 'warrior' && isUpper(card.cat)) add('불굴', CLASS_TUNE.warriorMul);
    if (hasRelic(R, 'rosary') && R.deck.length <= ROSARY_MAX) add('수도승의 묵주', 0.25);
    // 새 유물
    if (hasRelic(R, 'palette') && R.palette?.done) add('무지개 팔레트', 0.5);
    if (hasRelic(R, 'madscale')) add('광기의 저울', RT.madMul);
    if (opts.coin === 1) add('동전 앞면', 1);
    if (opts.coin === -1) add('동전 뒷면', RT.coinLow);
    if (hasRelic(R, 'bloodpact')) add('피의 계약', 0.5);
    if (hasRelic(R, 'glasscannon')) add('유리 대포', 0.6);
    if (hasRelic(R, 'parity') && dice.length && (dice.every(v => v % 2) || dice.every(v => !(v % 2)))) add('홀짝 부적', 0.3);
    if (hasRelic(R, 'seven') && dice.length && !(dice.reduce((a, v) => a + v, 0) % 7)) add('칠의 축복', 0.5);
    if (hasRelic(R, 'emptyhand')) add('빈손의 무사', 0.6);
    if (hasRelic(R, 'miser') && R.gold >= 50) add('수전노의 금고', Math.floor(R.gold / 50) * RT.miser);
    if (hasRelic(R, 'beast')) { const k = Math.floor((1 - R.hp / R.maxHp) * 10); if (k > 0) add('상처 입은 짐승', k * RT.beast); }
    if (hasRelic(R, 'ytower') && R.ytower) add('요트 탑', R.ytower * 0.03);
    if (hasRelic(R, 'zero') && card.zeroUp) add('0점의 기적', card.zeroUp);
    if (hasRelic(R, 'wax') && card.waxUp) add('밀랍 봉인', card.waxUp);
    // 막 징조
    if (omen(R, 'feast')) add('피의 축제', 0.5);
    if (omen(R, 'forbid')) add('금지된 족보', 0.2);
    if (omen(R, 'glass')) add('유리 세계', 0.3);
    if (omen(R, 'rush')) add('질주의 계절', card.cat === 'sstr' || card.cat === 'lstr' ? 0.5 : ['four', 'full', 'yacht'].includes(card.cat) ? -0.3 : 0);
    if (C) {
      if (hasRelic(R, 'echodrum') && C.lastCat === card.cat && C.chainN > 0) add('메아리 북', 0.25 * C.chainN);
      if (hasRelic(R, 'pairring') && C.hand.filter(c => c.cat === card.cat).length >= 2) add('페어 반지', 0.5);
      if (hasRelic(R, 'discard') && C.swapUsed) add('버림의 미학', 0.15 * C.swapUsed);
      if (hasRelic(R, 'dust') && C.draw.length >= 5) add('서고의 먼지', Math.floor(C.draw.length / 5) * 0.04);
      if (C.keepUp && !C.plays) add('보존 상자', C.keepUp);
      const first = C.rollNo === 1;
      if (R.cls === 'gambler' && C.bet === card.u) add('배팅', CLASS_TUNE.betMul - 1);
      if (R.cls === 'outlaw' && first) add('속전속결', (RUSH_CATS.includes(card.cat) && isCombo(card.cat, dice) ? CLASS_TUNE.rushMul : CLASS_TUNE.rushAny) - 1);
      if (R.cls === 'dancer' && C.danced) add('춤사위', CLASS_TUNE.danceMul);
      if (R.cls === 'rogue' && C.flipped) add('그림자 손', CLASS_TUNE.rogueMul);
      if (hasRelic(R, 'drum') && C.turn === 1) add('전쟁 북', 0.5);
      if (C.power) add('힘의 물약', 0.5);
    }
  }
  let total = Math.max(0, base + parts.reduce((a, p) => a + p.amt, 0));
  // 곱연산: 카드 자신의 강화 · 효과
  const mulBy = (ko, m) => { const amt = Math.round(total * m); if (amt) { parts.push({ ko, amt, mul: true }); total += amt; } };
  if (total > 0) {
    if (card.up) mulBy('강화', UP_MUL);
    if (card.seal === 'sun') { mulBy('해 인장', 0.5); if (hasRelic(R, 'goldframe')) mulBy('해 인장 (황금 인장틀)', 0.5); }   // 카드에 붙은 효과라 곱연산
    if (C && hasKw(card, 'quick') && C.rollNo === 1) mulBy('속공', 0.5);
  }
  const notes = notes0;
  if (C && C.gazed.includes(card.u) && !C.pure) { total = 0; notes.push('응시'); }
  if (C && C.weak > 0 && total > 0) { total = Math.floor(total * 0.75); notes.push('약화 ×0.75'); }
  return { base, parts, total, notes };
}

// 카드 점수를 공격 · 방어로 나눠 내면 어떻게 되는지 (화면 표시 · 봇 공용).
// atk: 공격에 쓰는 점수 (0 ~ 카드 점수). 'enemy' = 전부 공격, 'self' = 전부 방어. 나머지 점수는 방어(보호막)로 간다.
// 공격 몫: 피해 · 관통 · 흡혈 · 황금 · 화상 · 약화(절반 이상일 때), 고정 보너스(숫돌 · 비전 지식)는 공격 비율만큼.
// 방어 몫: 보호막 (수호 +50% · 수호자의 저울 +30%).
export function splitAtk(score, want) {
  if (want === 'enemy') return score;
  if (want === 'self') return 0;
  const n = Math.round(Number(want));
  return Number.isFinite(n) ? Math.max(0, Math.min(score, n)) : null;
}
// 트레이 <삼위일체>: 점수만큼 공격 · 방어 · 골드를 모두 얻는다 (나눌 수 없다).
// 프리즘이 있으면 점수 3배를 공격(want) · 골드(gold) · 방어(나머지)로 마음대로 나눈다.
export const isTrinity = card => card?.cat === 'threes';
export const prismOn = (R, card) => isTrinity(card) && hasRelic(R, 'prism');
export const splitPool = (R, card, S) => (prismOn(R, card) ? S * 3 : S);
export function preview(R, hi, want = 'enemy', sc = null, gold = 0) {
  const C = R.C, card = C.hand[hi];
  return splitOut(R, card, sc || scoreCard(R, card), want, gold);
}
function splitOut(R, card, sc, want, gwant = 0) {
  const C = R.C, e = C.e;
  const S = sc.total, T = splitPool(R, card, S);
  let atk, def, tri = 0;
  if (isTrinity(card) && !prismOn(R, card)) { atk = S; def = S; tri = S; }
  else {
    atk = splitAtk(T, want) ?? T;
    if (prismOn(R, card)) tri = Math.max(0, Math.min(T - atk, Math.round(Number(gwant) || 0)));
    def = T - atk - tri;
  }
  const share = S > 0 ? Math.min(1, atk / S) : 0;
  const out = { score: S, pool: T, atk, def, dmg: 0, pierce: false, block: 0, heal: 0, gold: 0, burn: 0, weak: false, kill: false,
    whet: 0, arcane: 0, combo: false, horn: false, poison: false, defMul: 1, wblk: 0, always: 0, tri };
  if (atk > 0) {
    if (hasRelic(R, 'whet')) out.whet = Math.round(3 * share);
    if (R.cls === 'mage') out.arcane = Math.round((C.hand.length - 1) * CLASS_TUNE.mageBonus * share);
    // 만화경 (다른 족보가 이어진 만큼) · 피에 굶주린 검 (쓰러뜨린 적 수): 고정 피해, 공격 비율만큼
    if (hasRelic(R, 'kaleido') && C.lastCat && C.lastCat !== card.cat) out.kal = Math.round(RT.kaleido * ((C.kal || 0) + 1) * share);
    if (hasRelic(R, 'bloodsword') && R.kills) out.bsword = Math.round(R.kills * share);
    let d = atk + out.whet + out.arcane + (out.kal || 0) + (out.bsword || 0);
    // 해 인장: 피해 ×2 (카드에 붙은 효과라 곱연산. 황금 인장틀이면 두 번)

    if (hasRelic(R, 'combo') && (card.cat === 'sstr' || card.cat === 'lstr')) { d = Math.round(d * RT.comboMul); out.combo = true; }
    if (hasRelic(R, 'horn') && isBossKind(e)) { d = Math.round(d * 1.25); out.horn = true; }
    if (hexActive(R, 'poison') && d <= 15) { d = Math.floor(d / 2); out.poison = true; }
    // 시공 광대 카드: 그 카드로 공격하면 ×1.5, 도전장을 무시하고 다른 카드를 내면 피해 절반
    if (C.jest && !C.pure) {
      if (card.u === C.jest.u) { d = Math.round(d * JESTER_DARE); out.dare = 'up'; }
      else if (C.jest.kind === 'dare' && !C.multi?.includes(C.jest.u)) { d = Math.floor(d / 2); out.dare = 'down'; }
    }
    out.dmg = d;
    out.pierce = hasKw(card, 'pierce') || (R.cls === 'rogue' && C.flipped);
    const through = out.pierce ? d : Math.max(0, d - e.block);
    out.kill = through >= e.hp;
    if (hasKw(card, 'vamp')) out.heal += Math.floor(atk / 3 * (hasRelic(R, 'bloodcup') ? 1.5 : 1));
    if (hasRelic(R, 'fang')) out.heal += Math.floor(through * RT.fang);
    if (hasKw(card, 'gold')) out.gold = Math.floor(atk / 3);
    if (hasKw(card, 'burn')) out.burn = Math.floor(atk / 4) + (hasRelic(R, 'ember') ? 3 : 0);
    if (hasKw(card, 'weak')) out.weak = atk * 2 >= T;
    if (R.cls === 'warrior' && isUpper(card.cat)) out.wblk = Math.floor(atk / 2);
  }
  out.defMul = 1 + (hasKw(card, 'guard') ? GUARD_MUL : 0) + (hasRelic(R, 'scale') ? 0.3 : 0);
  out.block = Math.round(def * out.defMul) + out.wblk;
  // 낼 때 늘 붙는 것 (나누는 것과 상관없이)
  const left = C.rollsLeft;
  if (R.cls === 'monk') out.always += left * CLASS_TUNE.monkBlock;
  if (hasRelic(R, 'hourglass')) out.always += left * 3;
  if (R.cls === 'outlaw' && C.rollNo === 1) out.always += left * CLASS_TUNE.rushBlock;
  if (S === 0 && hasRelic(R, 'insure')) out.always += 14;
  const twice = hasRelic(R, 'goldframe') ? 2 : 1;
  if (card.seal === 'cloud') out.always += 20 * twice;
  if (card.seal === 'star') out.gold += 15 * twice;
  out.gold += tri;
  out.block += out.always;
  return { ...out, sc };
}
// 다음 적 공격의 총 피해 (보호막 빼기 전). weak: 이번 카드로 약화를 걸 때
export function incomingAfter(R, weak = false) {
  const e = R.C?.e, m = e?.intent;
  if (!m?.atk) return 0;
  let per = atkOf(R, m.atk, m.hits || 1);
  if (weak && !(e.weak > 0)) per = Math.floor(per / 2);
  return per * (m.hits || 1);
}
// 이 미리보기대로 내면 다음 적의 턴에 잃을 체력
export const takenAfter = (R, p) => Math.max(0, incomingAfter(R, p.weak) - R.C.block - p.block);
// 다음 공격을 다 막으면서 공격에 쓸 수 있는 가장 큰 점수. 다 못 막으면 { atk: 0, full: false }
// 프리즘 삼위일체: 막고 남은 몫을 공격 · 골드에 똑같이 나눈다 (gold)
export function coverAtk(R, hi, sc = null) {
  const card = R.C.hand[hi];
  sc ||= scoreCard(R, card);
  if (isTrinity(card) && !prismOn(R, card)) return { atk: sc.total, gold: sc.total, full: !takenAfter(R, splitOut(R, card, sc, 'enemy')) };
  const T = splitPool(R, card, sc.total);
  for (let a = T; a >= 0; a--) {
    if (takenAfter(R, splitOut(R, card, sc, a))) continue;
    if (!prismOn(R, card)) return { atk: a, gold: 0, full: true };
    const g = Math.floor(a / 2);
    return { atk: a - g, gold: g, full: true };
  }
  return { atk: 0, gold: 0, full: false };
}

export const playCard = act('playCard', function playCard(R, hi, target, gold = 0) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  const card = C.hand[hi];
  if (!card) fail('없는 카드예요.');
  if (target !== 'enemy' && target !== 'self' && !(typeof target === 'number' && Number.isFinite(target))) fail('공격할지 방어할지 골라 주세요.');
  // 병렬 연산: 점수가 나는 손패 카드를 모두 함께 (공격 몫은 카드 점수 비율대로 나눈다)
  if (card.cat === 'xpar') {
    const others = parallelSet(R, card.u);
    const S = others.reduce((a, o) => a + o.s, 0);
    const want = splitAtk(S, target) ?? S;
    C.multi = others.map(o => o.c.u);
    fx(R, { type: 'parallel', us: C.multi.slice(), score: S });
    let left = want;
    for (let k = 0; k < others.length; k++) {
      const o = others[k], share = k === others.length - 1 ? left : Math.min(left, Math.round(want * o.s / (S || 1)));
      left -= share;
      const i = C.hand.findIndex(c => c.u === o.c.u);
      if (i < 0) continue;
      if (resolvePlay(R, i, share >= o.s ? 'enemy' : share <= 0 ? 'self' : share, 0) === 'won') { C.multi = null; return winCombat(R); }
    }
    C.multi = null;
    const j = C.hand.findIndex(c => c.u === card.u);
    if (resolvePlay(R, j, 'self', 0) === 'won') return winCombat(R);
    return enemyTurn(R);
  }
  if (card.cat === 'xpause') C.paused = true;     // 일시정지: 이번 적의 행동 무효
  if (resolvePlay(R, hi, target, gold) === 'won') return winCombat(R);
  enemyTurn(R);
});
// 병렬 연산이 함께 낼 카드: 지금 점수가 나는 손패 족보 카드 (미래 카드 빼고)
export function parallelSet(R, u) {
  const C = R.C;
  return C.hand.filter(c => c.u !== u && !isFuture(c.cat)).map(c => ({ c, s: splitPool(R, c, scoreCard(R, c).total) })).filter(o => o.s > 0);
}
// 카드 한 장을 낸다 (적의 턴은 부르지 않는다). 적이 쓰러지면 'won'
function resolvePlay(R, hi, target, gold = 0) {
  const C = R.C, card = C.hand[hi];
  // 동전 던지기 · 광기의 저울: 낼 때 정해진다 (같은 난수라 다시 돌려도 같다)
  const coin = hasRelic(R, 'coin') ? (rand(R) < 0.5 ? 1 : -1) : 0;
  const sc = scoreCard(R, card, C.dice, { coin });
  // 나눠 낸 카드: 동전이 바꾼 비율만큼 공격 몫도 같이 (공격 · 방어가 같은 % 로 늘고 준다)
  gold = Math.max(0, Math.round(Number(gold) || 0));
  if (coin && typeof target === 'number') { const t0 = scoreCard(R, card, C.dice, {}).total; if (t0 > 0) { target = Math.round(target * sc.total / t0); gold = Math.round(gold * sc.total / t0); } }
  if (hasRelic(R, 'madscale') && !(isTrinity(card) && !prismOn(R, card))) { target = Math.round(splitPool(R, card, sc.total) * madTilt(R)); gold = 0; }
  const p = preview(R, hi, target, sc, gold);
  C.hand.splice(hi, 1);
  R.stats.cards++;
  const ev = { type: 'play', u: card.u, cat: card.cat, kws: kwsOf(card), up: card.up, target: p.atk > 0 ? 'enemy' : 'self', atk: p.atk, def: p.def,
    score: p.score, parts: p.sc.parts, base: p.sc.base, notes: p.sc.notes, dmg: 0, blocked: 0, block: 0, heal: 0, gold: 0,
    coin: coin || undefined, mad: hasRelic(R, 'madscale') || undefined, seal: card.seal || undefined, temp: card.temp || undefined, tri: p.tri || undefined };
  fx(R, ev);
  // 피해
  if (p.atk > 0 && p.dmg > 0) {
    const r = hitEnemy(R, p.dmg, { pierce: p.pierce, why: 'card', quiet: true });
    ev.dmg = r.dmg; ev.blocked = r.blocked;
    if (r.dodge) ev.dodge = true;
    R.stats.maxHit = Math.max(R.stats.maxHit, p.dmg);
    R.stats.atkSum += p.dmg; R.stats.atkN++;
    // 세머리 용: 한 장으로 HYDRA_CUT 이상이면 이번 턴 머리가 잘려 그 숨결은 나가지 않는다
    if (C.e.cut && C.e.intent?.head && p.dmg >= HYDRA_CUT && C.e.hp > 0) {
      C.e.cut[C.e.intent.head] = true;
      ev.behead = C.e.intent.head;
      C.e.intent = null;
      log(R, '머리 하나를 베어 냈다!');
    }
  }
  if (p.block) { C.block += p.block; ev.block = p.block; }
  if (p.atk > 0 && card.cat === 'ones' && p.dmg >= 30) feat(R, 'ace30');
  if (p.atk > 0 && card.cat === 'lstr' && p.dmg >= 60) feat(R, 'lstr60');
  if (p.atk > 0 && card.cat === 'yacht' && p.score > 0) feat(R, 'yacht');
  if (C.block >= 60 && incoming(R) > 0) feat(R, 'wall');
  if (C.block >= 50) feat(R, 'bulwark');
  if (p.heal) {
    ev.heal = healHero(R, p.heal, 'card', true);
    // 피의 성배: 넘친 회복은 보호막
    const over = hasRelic(R, 'bloodcup') ? p.heal - ev.heal : 0;
    if (over > 0) { C.block += over; ev.block += over; ev.cup = over; }
  }
  if (hasRelic(R, 'rampart') && hasKw(card, 'guard') && p.block) C.rampart = (C.rampart || 0) + Math.floor(p.block / 2);
  C.plays = (C.plays || 0) + 1;
  if (p.gold) { R.gold += p.gold; R.stats.gold += p.gold; ev.gold = p.gold; }
  if (p.burn) { C.e.burn += p.burn; C.e.burnT = BURN_TURNS + (hasRelic(R, 'ember') ? 1 : 0); ev.burn = p.burn; }
  if (p.weak) { C.e.weak = 1; ev.weak = true; }
  if (hasKw(card, 'lucky')) ev.flip = addTool(R, 'flip', 1);
  if (p.score === 0 && hasRelic(R, 'insure')) addTool(R, 'flip', 1);
  if (R.cls === 'monk' && C.rollsLeft > 0 && !(CLASS_TUNE.monkOnce && C.monked)) { const n = Math.min(C.rollsLeft, CLASS_TUNE.monkNudge), cap = CLASS_TUNE.monkCap;   // 명상으로는 cap 개까지만 채운다
    const nn = Math.min(n, Math.max(0, cap - R.nudge)); if (nn) ev.nudge = addTool(R, 'nudge', nn);
    const fl = Math.min(Math.max(0, C.rollsLeft - CLASS_TUNE.monkFlipFrom + 1), CLASS_TUNE.monkNudge, Math.max(0, cap - R.flip)); if (fl) ev.flip = addTool(R, 'flip', fl);
    C.monked = true; }
  if (R.cls === 'dancer' && p.score >= DANCE_NEED && R.dance < DANCE_CAP) { R.dance++; ev.dance = true; }
  afterPlay(R, card, p, ev);
  // 카드는 버린 더미로 (메아리는 다음 턴 손패로). 달빛 복사본은 한 번 쓰면 사라진다
  if (!card.temp) (hasKw(card, 'echo') ? C.top : C.discard).push(card);
  checkFeats(R);
  log(R, `${cardName(card)} ${[p.atk > 0 ? `공격 ${p.dmg}` : '', p.block ? `방어 ${p.block}` : ''].filter(Boolean).join(' · ') || '0점'}`);
  C.hidden = C.hidden.filter(x => x !== card.u);
  if (card.jest && C.jest?.u === card.u) C.jest = { ...C.jest, played: true };
  syncRent(R);
  if (C.e.hp <= 0) return 'won';
  return '';
}

// 덱의 원래 카드 (전투 중 카드는 사본이라 영구 변화는 둘 다에 적는다)
const deckCard = (R, u) => R.deck.find(c => c.u === u);
// 카드를 낸 뒤: 족보 순서 유물 · 성장 유물 · 인장
function afterPlay(R, card, p, ev) {
  const C = R.C, cat = card.cat;
  // 메아리 북 (같은 족보 연속) · 만화경 (다른 족보 연속)
  if (C.lastCat === cat) { C.chainN = (C.chainN || 0) + 1; C.kal = 0; }
  else { if (C.lastCat) C.kal = (C.kal || 0) + 1; C.chainN = 1; }
  C.lastCat = cat;
  C.played[card.u] = (C.played[card.u] || 0) + 1;
  if (hasRelic(R, 'hammer')) (R.hammer ||= {})[cat] = (R.hammer[cat] || 0) + 1;
  if (hasRelic(R, 'palette') && R.palette && !R.palette.done) {
    if (!R.palette.seen.includes(cat)) R.palette.seen.push(cat);
    if (R.palette.seen.length >= RT.paletteN) { R.palette.done = true; ev.palette = true; }
  }
  if (hasRelic(R, 'pilgrim') && R.pilgrim && !R.pilgrim.includes(cat)) {
    R.pilgrim.push(cat);
    R.gold += 15; R.stats.gold += 15; R.maxHp += 2; R.hp += 2;
    ev.pilgrim = true;
  }
  if (hasRelic(R, 'ytower') && cat === 'yacht' && p.score > 0) R.ytower = (R.ytower || 0) + 1;
  // 주인공: 낼 때마다 기본 점수가 영구히 자란다 (달빛 복사본을 내도 원래 카드가 자란다)
  if (cat === 'ones') {
    const u0 = card.src || card.u, g = heroGrow(R);
    ev.grow = g;
    const d = deckCard(R, u0); if (d) d.grow = (d.grow || 0) + g;
    for (const c of [card, ...C.hand, ...C.draw, ...C.discard, ...C.top]) if (c.u === u0 || c.src === u0) c.grow = (c.grow || 0) + g;
  }
  if (hasRelic(R, 'zero') && p.score === 0 && !card.temp) {
    card.zeroUp = Math.round(((card.zeroUp || 0) + 0.2) * 100) / 100;
    const d = deckCard(R, card.u); if (d) d.zeroUp = card.zeroUp;
  }
  // 인장: 터지고 사라진다 (덱의 원래 카드에서도). 달 인장은 달빛 복사본을 다음 턴 손패로
  if (card.seal) {
    const seal = card.seal;
    if (seal === 'moon') {
      for (let k = 0; k < (hasRelic(R, 'goldframe') ? 2 : 1); k++) {
        const copy = { ...card, u: ++R.uid, src: card.src || card.u, seal: null, temp: true, waxUp: 0 };
        C.top.push(copy);
        ev.moon = (ev.moon || 0) + 1;
      }
    }
    card.seal = null; card.waxUp = 0;
    const d = deckCard(R, card.u); if (d) { d.seal = null; d.waxUp = 0; }
    ev.sealUsed = seal;
  }
}

// 적에게 피해. 보호막이 먼저 깎인다 (관통은 무시)
function hitEnemy(R, amount, { pierce = false, why = '', quiet = false } = {}) {
  // 시공 광대: 카드 공격을 JESTER_DODGE 확률로 피한다
  if (why === 'card' && amount > 0 && ENEMIES[R.C.e.id].talk && rand(R) < JESTER_DODGE) {
    fx(R, { type: 'dodge' });
    return { dmg: 0, blocked: 0, dodge: true };
  }
  const e = R.C.e;
  let left = Math.max(0, Math.round(amount));
  const blocked = pierce ? 0 : Math.min(e.block, left);
  e.block -= blocked;
  left -= blocked;
  const dmg = Math.min(e.hp, left);
  e.hp -= dmg;
  R.stats.dmg += dmg;
  R.C.dealt += dmg;
  if (!quiet) fx(R, { type: 'hit', dmg, blocked, why });
  checkRage(R);
  return { dmg, blocked };
}
function checkRage(R) {
  const e = R.C.e, def = ENEMIES[e.id];
  if ((def.kind !== 'boss' && def.kind !== 'special') || e.raged || e.hp <= 0 || e.hp * 2 >= e.maxHp) return;
  e.raged = true;
  e.str += 2;
  fx(R, { type: 'rage', foe: e.id });
  log(R, `${def.ko} 분노!`);
  // 세머리 용: 잘린 머리 하나가 다시 자란다
  if (def.ai === 'heads') {
    const h = Object.keys(e.cut).find(k => e.cut[k]);
    if (h) { e.cut[h] = false; e.regrew = true; fx(R, { type: 'regrow', head: h }); }
  }
}

function healHero(R, n, why, quiet = false) {
  if (omen(R, 'glass')) n /= 2;
  const add = Math.max(0, Math.min(Math.round(n), R.maxHp - R.hp));
  R.hp += add;
  R.stats.healed += add;
  if (add && !quiet) fx(R, { type: 'heal', n: add, why });
  return add;
}

// 영웅이 맞는다. 보호막이 먼저 깎인다
function hurtHero(R, amount, why) {
  const C = R.C;
  let left = Math.max(0, Math.round(amount));
  const blocked = C ? Math.min(C.block, left) : 0;
  if (C) C.block -= blocked;
  left -= blocked;
  const dmg = Math.min(R.hp - (R.sbGod ? 1 : 0), left);   // 시험 원정 무적: 체력 1 아래로 안 내려간다
  R.hp -= dmg;
  R.stats.taken += dmg;
  if (C) C.taken += dmg;
  return { dmg, blocked };
}

function enemyTurn(R) {
  const C = R.C, e = C.e;
  C.phase = 'enemy';
  // 시한폭탄: 턴이 끝날 때 폭탄 카드가 손패에 남아 있으면 터진다 (일시정지 · 정화 물약이면 안 터진다)
  const bomb = C.jest?.kind === 'bomb' && !C.pure && !C.paused && C.hand.some(c => c.u === C.jest.u);
  if (bomb) {
    const r = hurtHero(R, atkOf(R, 7 + R.act * 3), 'bomb');
    fx(R, { type: 'boom', u: C.jest.u, dmg: r.dmg, blocked: r.blocked });
  }
  // 남은 손패는 버린 더미로
  // 남은 손패는 버린 더미로 (보존 카드는 손패에 남는다)
  const out = C.hand.filter(c => !hasKw(c, 'keep'));
  // 밀랍 봉인: 인장이 붙은 채로 턴을 넘긴 카드 +10%
  if (hasRelic(R, 'wax')) for (const c of C.hand) if (c.seal) {
    c.waxUp = Math.round(((c.waxUp || 0) + 0.1) * 100) / 100;
    const d = deckCard(R, c.u); if (d && d.seal) d.waxUp = c.waxUp;
  }
  if (hasRelic(R, 'sandbank')) C.bank = Math.min(2, C.rollsLeft);
  if (out.length) { fx(R, { type: 'discard', us: out.map(c => c.u) }); C.discard.push(...out.filter(c => !c.temp)); }
  C.hand = C.hand.filter(c => hasKw(c, 'keep'));
  C.sealed = []; C.frozen = []; C.gazed = []; C.hidden = []; C.jest = null;
  syncRent(R);
  e.block = 0;                        // 적 보호막은 적의 턴이 시작될 때 사라진다
  if (C.weak > 0) C.weak--;            // 영웅 약화는 영웅 턴 수로 센다
  const fury = furyOf(R);
  const paused = C.paused; C.paused = false;
  const m = paused ? null : e.intent;          // 일시정지: 이번 적의 행동(공격 · 방어 · 힘 · 회복 · 스킬)이 모두 없던 일로
  const act = { type: 'enemy', ko: m?.ko || '', hits: [], block: 0, str: 0, heal: 0, steal: 0, weak: 0, behead: !m && !paused, paused: paused || undefined };
  if (m) {
    if (m.atk) {
      const per = atkOf(R, m.atk, m.hits || 1);
      for (let k = 0; k < (m.hits || 1); k++) {
        const r = hurtHero(R, per, 'atk');
        act.hits.push(r);
        if (hasRelic(R, 'thorn') && e.hp > 0) { const t = hitEnemy(R, 4, { pierce: true, quiet: true }); act.thorn = (act.thorn || 0) + t.dmg; }
        if (R.hp <= 0 || e.hp <= 0) break;
      }
      e.weak = 0;
      // 반격의 문장: 공격을 보호막으로 다 막았으면 남은 보호막만큼 되돌려 준다
      if (hasRelic(R, 'counter') && act.hits.length && act.hits.every(h => h.dmg === 0) && C.block > 0 && e.hp > 0) {
        const t = hitEnemy(R, C.block, { quiet: true });
        act.counter = t.dmg;
      }
    }
    if (m.block) { e.block += m.block; act.block = m.block; }
    if (m.str) { e.str += m.str; act.str = m.str; }
    if (m.heal) { const h = Math.min(m.heal, e.maxHp - e.hp); e.hp += h; act.heal = h; }
    // 금화 훔치기: 함께 오는 공격(본 공격)을 보호막으로 다 막았으면 훔치지 못한다
    if (m.steal) {
      if (m.atk && act.hits.length && act.hits.every(h => h.dmg === 0)) act.kept = Math.min(R.gold, m.steal);
      else { const s = Math.min(R.gold, m.steal); R.gold -= s; act.steal = s; }
    }
    if (m.weak) { C.weak = Math.max(C.weak, m.weak); act.weak = m.weak; }
  }
  fx(R, act);
  if (R.hp <= 0 && ENEMIES[e.id].talk) return jesterLeaves(R);
  if (R.hp <= 0 && !revive(R)) return loseRun(R);
  if (e.hp <= 0) return winCombat(R);     // 가시 갑옷으로 쓰러짐
  // 화상
  if (e.burnT > 0 && e.burn > 0) {
    hitEnemy(R, e.burn, { why: 'burn' });   // 화상도 보호막부터 깎는다 (적이 이번 턴에 친 보호막 → 체력 순)
    e.burnT--;
    if (!e.burnT) e.burn = 0;
    if (e.hp <= 0) return winCombat(R);
  }
  // 격앙
  if (C.turn >= fury.from) {
    e.str += fury.str;
    e.fury = (e.fury || 0) + fury.str;
    fx(R, { type: 'fury', str: fury.str, total: e.fury });
  }
  chooseIntent(R);
  startTurn(R);
}

// 시공 광대에게 쓰러지면: 원정은 이어진다. 체력 절반으로 일어나 보상 없이 원래 가려던 칸으로
function jesterLeaves(R) {
  R.hp = Math.max(1, Math.ceil(R.maxHp / 2));
  R.C.phase = 'lost';
  fx(R, { type: 'jesterOut', won: false, hp: R.hp });
  log(R, '시공 광대가 웃으며 사라졌다…');
  jesterResume(R);
}
function revive(R) {
  if (!hasRelic(R, 'phoenix')) return false;
  R.relics = R.relics.filter(x => x !== 'phoenix');
  R.hp = Math.round(R.maxHp * 0.4);
  fx(R, { type: 'phoenix', hp: R.hp });
  log(R, '불사조 깃털이 타오르며 되살아났다!');
  return true;
}

function loseRun(R) {
  R.hp = 0;
  if (R.C) R.C.phase = 'lost';
  R.phase = 'lost';
  R.ended = true;
  R.won = false;
  fx(R, { type: 'heroDie' });
  log(R, '원정 실패…');
}

function winCombat(R) {
  const C = R.C, e = C.e, def = ENEMIES[e.id];
  C.phase = 'won';
  fx(R, { type: 'foeDie', foe: e.id, kind: def.kind });
  log(R, `${def.ko} 처치!`);
  if (def.kind === 'elite') R.stats.elites++;
  if (def.kind === 'boss') {
    R.stats.bosses++;
    if (R.act === 1) feat(R, 'act1');
    if (!C.taken) feat(R, 'flawless');
    if (R.act >= ACTS) { feat(R, 'clear'); if (!R.stats.shop) feat(R, 'ascetic'); if (asc(R, 5)) feat(R, 'asc5'); if (asc(R, 10)) feat(R, 'asc10'); }
  }
  checkFeats(R);
  if (hasRelic(R, 'bloodsword')) R.kills = (R.kills || 0) + 1;
  // 세 조각 성표: 이 전투에 가장 많이 낸 카드를 덱에 한 장 더 (원정에서 3번까지)
  if (hasRelic(R, 'trinity') && (R.trinity || 0) < 3) {
    const top = Object.entries(C.played).map(([u, n]) => [deckCard(R, Number(u)), n]).filter(([c]) => c).sort((a, b) => b[1] - a[1])[0];
    if (top) { const nc = { ...top[0], u: ++R.uid, seal: null, waxUp: 0 }; R.deck.push(nc); R.trinity = (R.trinity || 0) + 1; fx(R, { type: 'gainCard', u: nc.u, why: 'trinity' }); }
  }
  if (R.cls === 'bard') healHero(R, CLASS_TUNE.bardHeal, 'bard');
  if (hasRelic(R, 'lotus')) healHero(R, 6, 'lotus');
  if (def.kind === 'boss' && R.act >= ACTS && !R.sbFight) { R.phase = 'won'; R.ended = true; R.won = true; fx(R, { type: 'runWon' }); return; }
  R.phase = 'reward';
  if (def.kind === 'special') { fx(R, { type: 'jesterOut', won: true }); R.reward = jesterReward(R); return; }
  R.reward = genReward(R, def.kind);
}

// ── 보상 ─────────────────────────────────────────────────────────────────────
const CAT_W = { choice: 8, four: 12, full: 14, sstr: 15, lstr: 10, yacht: 6, sixes: 13, fives: 11, fours: 7, threes: 5, twos: 5, ones: 5 };   // 초이스는 줄이고 식스 · 파이브 · 스몰 스트레이트를 늘렸다. 에이스 · 듀스 · 트레이는 실버 이상에서만
const KW_W = { guard: 14, vamp: 12, burn: 12, pierce: 10, quick: 12, lucky: 10, weak: 8, gold: 8, echo: 10, keep: 10 };
// 덱 방향 유물이 있으면 그 계열 카드가 더 자주 나온다
function catWeights(R) {
  const w = { ...CAT_W }, sy = synergy(R);
  if (sy.num) for (const c of UPPER) w[c] *= 1 + sy.num * 1.5;
  if (hasRelic(R, 'small')) { w.ones *= 3; w.twos *= 3; w.threes *= 3; }
  if (sy.str) { w.sstr *= 1 + sy.str; w.lstr *= 1 + sy.str; }
  if (hasRelic(R, 'magnet')) for (const c of SAME_CATS) w[c] *= 2.5;
  if (hasRelic(R, 'weight')) w.choice *= 2.5;
  return w;
}
function kwWeights(R) {
  const w = { ...KW_W };
  for (const [id, kw] of Object.entries(ARCH_KW)) if (hasRelic(R, id)) w[kw] *= 3;
  return w;
}
export function rollCard(R, rarity) {
  const w = catWeights(R);
  if (rarity === 1) { delete w.choice; for (const c of SPECIAL_CATS) delete w[c]; return mkCard(R, weighted(R, w)); }   // 초이스 · 특별 카드는 실버 이상에서만
  const cat = weighted(R, w);
  const kww = kwWeights(R);
  const kw = weighted(R, kww);
  if (rarity === 2) return mkCard(R, cat, 0, kw);
  if (rand(R) < 0.3) return mkCard(R, 'yacht', 1, rand(R) < 0.5 ? kw : null);
  if (rand(R) < 0.35) { let k2 = weighted(R, kww); if (k2 === kw) k2 = weighted(R, kww); return mkCard(R, cat, 0, k2 === kw ? [kw] : [kw, k2]); }
  return mkCard(R, cat, 1, kw);
}
function cardOffer(R, kind) {
  const n = 3 + (R.cls === 'mage' ? 1 : 0) + (hasRelic(R, 'scholar') ? 1 : 0);
  const w = kind === 'boss' ? { 1: 0, 2: 60, 3: 40 } : kind === 'elite' ? { 1: 40, 2: 45, 3: 15 } : { 1: 62 - R.act * 4, 2: 32 + R.act * 3, 3: 6 + R.act };
  const out = [];
  for (let k = 0; k < n; k++) {
    let c, tries = 0;
    do { c = rollCard(R, Number(weighted(R, w))); tries++; }
    while (tries < 8 && out.some(o => o.cat === c.cat && kwsOf(o).join() === kwsOf(c).join()));
    out.push(c);
  }
  return out;
}
// 유물 하나 (가진 것 빼고). 그 희귀도가 바닥나면 다른 희귀도에서
export function rollRelic(R, r, exclude = []) {
  const own = new Set([...R.relics, ...exclude]);
  const sy = synergy(R);
  // 이미 고른 덱 방향의 유물은 더 잘 나온다
  const wt = id => 1 + (NUM_RELICS.includes(id) ? sy.num * 2 : 0) + (STR_RELICS.includes(id) ? sy.str * 2 : 0)
    + (ARCH[id] ? Math.min(3, R.deck.filter(ARCH[id]).length) * 0.8 : 0)
    + (SPECIAL_RELIC[id] && R.deck.some(c => c.cat === SPECIAL_RELIC[id]) ? 0.3 : 0)   // 전용 카드가 있으면 +30%
    + (id === 'rosary' && R.deck.length <= 10 ? 2 : 0) + (id === 'libkey' && R.deck.length >= 17 ? 2 : 0);
  for (const rr of [Number(r), 2, 1, 3]) {
    const pool = RELICS.filter(x => x.r === rr && !own.has(x.id));
    if (pool.length) return weighted(R, Object.fromEntries(pool.map(x => [x.id, wt(x.id)])));
  }
  return null;
}
const rollPotion = R => pick(R, POTIONS).id;
function goldMul(R) { return Math.max(0.1, 1 + (hasRelic(R, 'purse') ? 0.3 : 0) + (R.cls === 'gambler' ? CLASS_TUNE.gamblerGold : 0) + (omen(R, 'fog') ? 0.5 : 0) + (omen(R, 'merchant') ? 0.3 : 0)); }
function genReward(R, kind) {
  const items = [];
  const g = kind === 'boss' ? int(R, 70, 85) + R.act * 10 : kind === 'elite' ? int(R, 28, 36) + R.act * 6 : int(R, 12, 18) + R.act * 4;
  items.push({ t: 'gold', n: Math.round(g * goldMul(R)) });
  // 유물은 고르기로 (relicChoices 개 중 1개)
  const relicPick = rarity => {
    const opts = [];
    for (let k = 0; k < relicChoices(R); k++) { const id = rollRelic(R, rarity(), opts); if (id) opts.push(id); }
    if (opts.length) items.push({ t: 'relicPick', opts, kind });
  };
  if (kind === 'elite') relicPick(() => weighted(R, omen(R, 'war') ? { 2: 70, 3: 30 } : { 1: 60, 2: 40 }));   // 전쟁의 북소리: 더 희귀하게
  if (kind === 'boss' && R.act < ACTS) relicPick(() => 3);
  if (kind === 'normal' && omen(R, 'bounty') && rand(R) < 0.25) relicPick(() => weighted(R, { 1: 70, 2: 30 }));
  if (rand(R) < (kind === 'normal' ? 0.4 : 0.6)) items.push({ t: 'potion', id: rollPotion(R) });
  if (kind === 'normal' && rand(R) < 0.3) items.push({ t: rand(R) < 0.5 ? 'flip' : 'nudge', n: 1 });
  if (kind !== 'boss' || R.act < ACTS) items.push({ t: 'card', opts: cardOffer(R, kind) });
  return { kind, items: items.filter(it => it.t !== 'relic' || it.id) };
}

// 시공 광대를 이기면: 별조각 · 보석 (막마다 늘어난다) · 그 막 일반 전투의 두 배 골드 · 미래 카드 3장 중 1장 (유물 없음)
function jesterReward(R) {
  const pz = jesterPrize(R.act);
  const g = 2 * (int(R, 12, 18) + R.act * 4);
  R.stats.jester = (R.stats.jester || 0) + 1;
  return { kind: 'special', items: [{ t: 'gold', n: Math.round(g * goldMul(R)) }, { t: 'stars', n: pz.stars }, { t: 'gems', n: pz.gems },
    { t: 'card', opts: shuffle(R, FUTURE_CATS).map(cat => mkCard(R, cat)), future: true }] };
}
// 새로고침 남은 횟수 (예전 저장 판은 0)
export const rrOf = R => ({ shop: R.rr?.shop || 0, pick: R.rr?.pick || 0 });
// 상점 새로고침: 팔던 물건(카드 · 인장 · 유물 · 물약)을 새로 깐다. 도구 · 대장장이 · 카드 제거는 그대로
export const rerollShop = act('rerollShop', function rerollShop(R) {
  if (R.phase !== 'shop' || !R.shop) fail('상점이 아니에요.');
  if (R.cls === 'monk') fail('금욕: 수도승은 상점을 쓸 수 없어요.');
  if (R.pick) fail('먼저 카드 고르기를 끝내 주세요.');
  if (rrOf(R).shop <= 0) fail('상점 새로고침이 남지 않았어요.');
  const old = R.shop, nu = genShop(R);
  R.shop = { ...nu, tools: old.tools, removed: old.removed, smithed: old.smithed };
  R.rr = { ...rrOf(R), shop: rrOf(R).shop - 1 };
  fx(R, { type: 'reroll', k: 'shop' });
});
// 카드 · 유물 고르기 새로고침: 그 보상의 후보를 새로 뽑는다 (지금 후보는 되도록 빼고)
export const rerollPick = act('rerollPick', function rerollPick(R, idx) {
  const rw = inReward(R);
  const it = rw.items[idx];
  if (!it || it.done || (it.t !== 'card' && it.t !== 'relicPick') || it.future) fail('새로고침할 수 없는 보상이에요.');
  if (rrOf(R).pick <= 0) fail('카드 · 유물 새로고침이 남지 않았어요.');
  if (it.t === 'card') it.opts = cardOffer(R, rw.kind);
  else {
    const old = it.opts, opts = [];
    for (let k = 0; k < old.length; k++) { const id = rollRelic(R, relicRarity(R, it.kind), [...opts, ...old]) || rollRelic(R, relicRarity(R, it.kind), opts); if (id) opts.push(id); }
    if (opts.length) it.opts = opts;
  }
  R.rr = { ...rrOf(R), pick: rrOf(R).pick - 1 };
  fx(R, { type: 'reroll', k: it.t });
});
// 유물 고르기 후보의 희귀도 (genReward 와 같은 규칙)
function relicRarity(R, kind) {
  if (kind === 'boss') return 3;
  if (kind === 'treasure') return weighted(R, { 1: 50, 2: 45, 3: 5 });
  if (kind === 'elite') return weighted(R, omen(R, 'war') ? { 2: 70, 3: 30 } : { 1: 60, 2: 40 });
  return weighted(R, { 1: 70, 2: 30 });
}
function inReward(R) { if (R.phase !== 'reward' || !R.reward) fail('보상을 받을 때가 아니에요.'); return R.reward; }
// 보상 하나 받기. choice: 카드 · 유물 고르기 보상에서 고른 번호 (-1 = 건너뛰기)
export const takeReward = act('takeReward', function takeReward(R, idx, choice = 0) {
  const rw = inReward(R);
  const it = rw.items[idx];
  if (!it || it.done) fail('이미 받은 보상이에요.');
  if (it.t === 'gold') { R.gold += it.n; R.stats.gold += it.n; }
  if (it.t === 'stars') R.bonusStars = (R.bonusStars || 0) + it.n;     // 원정이 끝날 때 별조각에 더한다
  if (it.t === 'gems') R.gems = (R.gems || 0) + it.n;                   // 원정이 끝날 때 지갑에 넣는다
  if (it.t === 'relic') gainRelic(R, it.id);
  if (it.t === 'relicPick') { if (choice >= 0) gainRelic(R, it.opts[choice]); }
  if (it.t === 'potion') {
    if (R.potions.length >= POTION_SLOTS) fail('물약 칸이 가득 찼어요. 하나를 버리거나 쓰고 받으세요.');
    R.potions.push(it.id);
  }
  if (it.t === 'flip' || it.t === 'nudge') { if (!addTool(R, it.t, it.n)) fail(`${it.t === 'flip' ? '뒤집기' : '조정'}를 더 들 수 없어요 (최대 ${TOOL_CAP}).`); }
  if (it.t === 'card') { if (choice >= 0) { const c = it.opts[choice]; if (!c) fail('없는 카드예요.'); R.deck.push({ ...c }); fx(R, { type: 'gainCard', u: c.u }); } }
  it.done = true;
  checkFeats(R);
  fx(R, { type: 'take', t: it.t });
});
export function gainRelic(R, id) {
  if (!id || hasRelic(R, id)) return;
  R.relics.push(id);
  if (id === 'heart') { R.maxHp += 20; R.hp += 20; }
  if (id === 'chalice') { R.maxHp += 30; R.hp = R.maxHp; }
  if (id === 'bloodpact') { R.maxHp = Math.max(10, Math.round(R.maxHp * 0.7)); R.hp = Math.min(R.hp, R.maxHp); }
  if (id === 'palette') R.palette = { seen: [], done: false };
  if (id === 'pilgrim') R.pilgrim = [];
  if (id === 'hammer') R.hammer ||= {};
  fx(R, { type: 'relic', id });
}
// 보상 화면을 떠난다 (남은 보상은 버린다). 보스 보상이면 다음 막으로
export const leaveReward = act('leaveReward', function leaveReward(R) {
  const rw = inReward(R);
  R.reward = null;
  R.C = null;
  if (rw.kind === 'special') return jesterResume(R);
  if (R.sbFight) { R.sbFight = false; R.phase = 'map'; return; }   // 시험 원정에서 고른 싸움: 막 · 층은 그대로
  if (rw.kind === 'boss') {
    if (R.act >= ACTS) { R.phase = 'won'; R.ended = true; R.won = true; fx(R, { type: 'runWon' }); return; }
    R.act++;
    const heal = Math.round((R.maxHp - R.hp) * (asc(R, 5) ? 0.4 : ACT_HEAL) * (omen(R, 'glass') ? 0.5 : 1));
    R.hp += heal;
    newAct(R);
    fx(R, { type: 'act', act: R.act, heal });
    return;
  }
  R.phase = 'map';
});

// ── 상점 ─────────────────────────────────────────────────────────────────────
export const PRICE = { card: { 1: 48, 2: 76, 3: 140 }, relic: { 1: 140, 2: 200, 3: 300 }, potion: 40, flip: 30, nudge: 20, remove: 60, removeStep: 20 };
function genShop(R) {
  const cards = [rollCard(R, 1), rollCard(R, 2), rollCard(R, Number(weighted(R, { 1: 30, 2: 50, 3: 20 })))];
  const jitter = p => Math.round(p * (0.9 + rand(R) * 0.2) * (asc(R, 7) ? 1.25 : 1) * (omen(R, 'drought') ? 0.7 : 1));
  // 인장 2개 (인장공의 칼: 반값, 첫 번째는 공짜)
  const knife = hasRelic(R, 'sealknife');
  const seals = [pick(R, SEAL_IDS), pick(R, SEAL_IDS)].map((id, k) => ({ id, price: knife ? (k === 0 ? 0 : Math.round(jitter(SEAL_PRICE) / 2)) : jitter(SEAL_PRICE), sold: false }));
  return {
    seals,
    cards: cards.map(c => ({ c, price: jitter(PRICE.card[cardRarity(c)]), sold: false })),
    relics: shopRelics(R).map(id => ({ id, price: jitter(PRICE.relic[relicInfo(id).r]), sold: false })),
    potions: [rollPotion(R), rollPotion(R)].map(id => ({ id, price: jitter(PRICE.potion), sold: false })),
    tools: [{ kind: 'flip', price: PRICE.flip, sold: false }, { kind: 'nudge', price: PRICE.nudge, sold: false }],
    removed: false, smithed: false,
  };
}
function shopRelics(R) {
  const a = rollRelic(R, 1), b = rollRelic(R, 2, a ? [a] : []);
  return [a, b].filter(Boolean);
}
// 상점 대장장이: 카드 1장 강화 (상점마다 한 번, 쓸수록 비싸진다)
export const smithPrice = R => Math.round((70 + (R.smiths || 0) * 25) * (asc(R, 7) ? 1.25 : 1));
export const startSmith = act('startSmith', function startSmith(R) {
  if (R.phase !== 'shop' || !R.shop) fail('상점이 아니에요.');
  if (R.cls === 'monk') fail('금욕: 수도승은 상점을 쓸 수 없어요.');
  if (R.shop.smithed) fail('이 상점에서는 이미 강화했어요.');
  startUpgrade(R, 'shop', smithPrice(R));
});
export const removePrice = R => Math.round((PRICE.remove + R.removes * PRICE.removeStep) * (asc(R, 7) ? 1.25 : 1));
export const buy = act('buy', function buy(R, kind, idx) {
  if (R.phase !== 'shop' || !R.shop) fail('상점이 아니에요.');
  if (R.cls === 'monk') fail('금욕: 수도승은 상점을 쓸 수 없어요.');
  const list = { card: R.shop.cards, relic: R.shop.relics, potion: R.shop.potions, tool: R.shop.tools, seal: R.shop.seals || [] }[kind];
  const it = list?.[idx];
  if (!it || it.sold) fail('이미 팔린 물건이에요.');
  if (R.gold < it.price) fail('골드가 모자라요.');
  if (kind === 'potion' && R.potions.length >= POTION_SLOTS) fail('물약 칸이 가득 찼어요.');
  if (kind === 'tool' && R[it.kind] >= TOOL_CAP) fail(`더 들 수 없어요 (최대 ${TOOL_CAP}).`);
  // 인장: 붙일 카드를 고른 뒤에 값을 낸다
  if (kind === 'seal') { if (!R.deck.some(c => !c.seal)) fail('인장을 붙일 카드가 없어요.'); R.pick = { why: 'seal', seal: it.id, cost: it.price, idx, from: 'shop' }; return; }
  R.gold -= it.price;
  R.stats.shop = (R.stats.shop || 0) + 1;    // 상점에서 산 횟수 (빈손의 순례)
  it.sold = true;
  if (kind === 'card') { R.deck.push({ ...it.c }); fx(R, { type: 'gainCard', u: it.c.u }); }
  if (kind === 'relic') gainRelic(R, it.id);
  if (kind === 'potion') R.potions.push(it.id);
  if (kind === 'tool') addTool(R, it.kind, 1);
  fx(R, { type: 'buy', kind });
});
export const startRemove = act('startRemove', function startRemove(R) {
  if (R.cls === 'monk') fail('금욕: 수도승은 상점을 쓸 수 없어요.');
  if (R.phase !== 'shop' || R.shop.removed) fail('카드 제거는 상점마다 한 번이에요.');
  if (R.gold < removePrice(R)) fail('골드가 모자라요.');
  if (R.deck.length <= 5) fail('덱이 너무 작아요 (최소 5장).');
  R.pick = { why: 'remove', cost: removePrice(R), from: 'shop' };
});
export const leaveShop = act('leaveShop', function leaveShop(R) {
  if (R.phase !== 'shop') fail('상점이 아니에요.');
  R.shop = null; R.pick = null;
  R.phase = 'map';
});

// ── 휴식 ─────────────────────────────────────────────────────────────────────
export const restAmount = R => Math.round((Math.round(R.maxHp * (asc(R, 4) ? 0.2 : REST_HEAL)) + (hasRelic(R, 'camp') ? 20 : 0)) * (omen(R, 'drought') ? 0.5 : 1));
export const restHeal = act('restHeal', function restHeal(R) {
  if (R.phase !== 'rest') fail('휴식처가 아니에요.');
  healHero(R, restAmount(R), 'rest');
  R.phase = 'map';
});
export const startUpgrade = act('startUpgrade', function startUpgrade(R, from = 'rest', cost = 0) {
  if (!R.deck.some(canUpgrade)) fail('강화할 카드가 없어요.');
  if (cost && R.gold < cost) fail('골드가 모자라요.');
  R.pick = { why: 'upgrade', from, cost };
});
// 강화 고르기: 점수 +30% (아직 안 했으면) 또는 새 효과 3개 중 하나 (효과가 KW_MAX 개 미만이면)
function upgradeOpts(R, c) {
  const out = [];
  if (!c.up) out.push('up');
  if (kwsOf(c).length < KW_MAX) {
    const w = Object.fromEntries(Object.entries(KW_W).filter(([k]) => !hasKw(c, k)));
    for (let n = 0; n < 3 && Object.keys(w).length; n++) { const k = weighted(R, w); out.push(k); delete w[k]; }
  }
  return out;
}
export const chooseUpgrade = act('chooseUpgrade', function chooseUpgrade(R, k) {
  const pk = R.pick;
  if (!pk || pk.why !== 'upgrade' || !pk.opts) fail('고를 때가 아니에요.');
  const c = R.deck.find(x => x.u === pk.u), o = pk.opts[k];
  if (!c || !o) fail('없는 선택이에요.');
  if (o === 'up') c.up = 1;
  else { c.kws = [...kwsOf(c), o]; delete c.kw; }
  if (pk.cost) { R.gold -= pk.cost; R.smiths = (R.smiths || 0) + 1; if (R.shop) R.shop.smithed = true; if (pk.from === 'shop') R.stats.shop = (R.stats.shop || 0) + 1; }
  fx(R, { type: 'upgrade', u: c.u, opt: o });
  R.pick = null;
  if (pk.from === 'rest') R.phase = 'map';
  if (pk.from === 'event') finishEvent(R, pk.done);
});
// 덱에서 카드 한 장 고르기 (강화 · 제거 · 복제)
export const pickDeck = act('pickDeck', function pickDeck(R, u) {
  const pk = R.pick;
  if (!pk) fail('고를 때가 아니에요.');
  const c = R.deck.find(x => x.u === u);
  if (!c) fail('없는 카드예요.');
  if (pk.why === 'upgrade') {
    if (!canUpgrade(c)) fail('더 강화할 수 없는 카드예요.');
    pk.u = u;
    pk.opts = upgradeOpts(R, c);
    return;                              // 다음: chooseUpgrade 로 강화 고르기
  }
  if (pk.why === 'remove') {
    if (R.deck.length <= 5) fail('덱이 너무 작아요 (최소 5장).');
    R.deck = R.deck.filter(x => x.u !== u);
    if (pk.cost) { R.gold -= pk.cost; R.removes++; R.shop.removed = true; R.stats.shop = (R.stats.shop || 0) + 1; }
    if (pk.hp) { hurtHero(R, pk.hp, 'event'); if (R.hp <= 0 && !revive(R)) { R.pick = null; return loseRun(R); } }
    fx(R, { type: 'remove', u });
  }
  if (pk.why === 'seal') {
    if (c.seal) fail('이미 인장이 붙은 카드예요.');
    if (R.gold < (pk.cost || 0)) fail('골드가 모자라요.');
    R.gold -= pk.cost || 0;
    if (pk.from === 'shop' && pk.cost) R.stats.shop = (R.stats.shop || 0) + 1;
    c.seal = pk.seal;
    if (pk.from === 'shop' && R.shop?.seals?.[pk.idx]) R.shop.seals[pk.idx].sold = true;
    fx(R, { type: 'sealOn', u, seal: pk.seal });
  }
  if (pk.why === 'dup') {
    const nc = { ...c, u: ++R.uid };
    R.deck.push(nc);
    fx(R, { type: 'gainCard', u: nc.u });
  }
  R.pick = null;
  if (pk.from === 'event') finishEvent(R, pk.done);
});
export const cancelPick = act('cancelPick', function cancelPick(R) {
  const pk = R.pick;
  if (!pk) return;
  R.pick = null;
  if (pk.from === 'event') finishEvent(R, '그만두고 떠났다.');
});

// ── 이벤트 (? 칸) ────────────────────────────────────────────────────────────
// opts[k].can(R) 이 거짓이면 그 선택지는 잠긴다. go(R) 는 결과 문장을 돌려준다 (전투 · 카드 고르기로 이어질 수도 있다)
const E_ = (id, ko, art, text, opts) => ({ id, ko, art, text, opts });
const O = (ko, desc, go, can = () => true) => ({ ko, desc, go, can });
export const EVENTS = [
  E_('chest', '수상한 상자', 'gem', '이끼 낀 상자가 길가에 놓여 있다. 뚜껑 틈으로 금빛이 새어 나오는데… 어딘가 숨소리가 들리는 것도 같다.', [
    O('연다', '70%: 유물 · 30%: 미믹과 전투', R => {
      if (rand(R) < 0.7) { const id = rollRelic(R, weighted(R, { 1: 55, 2: 45 })); gainRelic(R, id); return `상자 안에서 「${relicInfo(id)?.ko || '빈 상자'}」를 찾았다!`; }
      R.event.fight = 'mimic';
      return '상자가 이빨을 드러냈다! 미믹이다!';
    }),
    O('지나친다', '아무 일도 없다', () => '괜히 건드리지 않기로 했다.')]),
  E_('spring', '치유의 샘', 'heart', '맑은 샘물이 은은하게 빛난다. 한 모금만 마셔도 상처가 아물 것 같다.', [
    O('마신다', R => `체력 ${Math.round(R.maxHp * 0.25)} 회복`, R => { const n = healHero(R, Math.round(R.maxHp * 0.25), 'event'); return `몸이 가벼워졌다. 체력 ${n} 회복.`; }),
    O('병에 담는다', '회복 물약 1개', R => { R.potions.push('heal'); return '회복 물약을 하나 챙겼다.'; }, R => R.potions.length < POTION_SLOTS)]),
  E_('altar', '피의 제단', 'skull', '붉게 물든 제단. "피를 바치면 힘을 주마." 낮은 목소리가 울린다.', [
    O('피를 바친다', '체력 12 잃고 무작위 유물', R => { hurtHero(R, 12, 'event'); const id = rollRelic(R, weighted(R, { 1: 50, 2: 50 })); gainRelic(R, id); return `제단이 「${relicInfo(id)?.ko}」를 내주었다.`; }, R => R.hp > 12),
    O('떠난다', '아무 일도 없다', () => '불길한 기운을 뒤로하고 떠났다.')]),
  E_('smith', '떠돌이 대장장이', 'axe', '"카드 한 장 손봐 줄까? 공짜야. 아니면 필요 없는 걸 녹여 주지. 대신 손이 좀 베일 거야."', [
    O('강화한다', '카드 1장 강화 (무료)', R => { R.pick = { why: 'upgrade', from: 'event', done: '대장장이가 카드를 반짝반짝 벼려 주었다.' }; return null; }, R => R.deck.some(canUpgrade)),
    O('녹인다', '카드 1장 제거 · 체력 8 잃음', R => { R.pick = { why: 'remove', from: 'event', hp: 8, done: '카드를 녹여 없앴다. 손이 좀 쓰리다.' }; return null; }, R => R.deck.length > 5 && R.hp > 8),
    O('떠난다', '아무 일도 없다', () => '대장장이에게 손을 흔들고 떠났다.')]),
  E_('gamble', '고블린 도박사', 'coins', '"주사위 다섯 개, 합이 18 이상이면 두 배로 돌려주지! 어때, 30골드?" 고블린이 이를 드러내며 웃는다.', [
    O('건다 (30골드)', '주사위 5개 합 18 이상이면 75골드', R => {
      R.gold -= 30;
      const d = [die(R), die(R), die(R), die(R), die(R)];
      const sum = d.reduce((a, b) => a + b, 0);
      R.event.dice = d;
      if (sum >= 18) { R.gold += 75; R.stats.gold += 45; return `합 ${sum}! 75골드를 받았다.`; }
      return `합 ${sum}… 30골드를 잃었다.`;
    }, R => R.gold >= 30),
    O('떠난다', '아무 일도 없다', () => '"쳇, 겁쟁이!"')]),
  E_('shrine', '주사위 신전', 'star', '다섯 개의 주사위가 놓인 오래된 신전. 기도하고 굴리면 신이 응답한다고 한다.', [
    O('기도하고 굴린다', '요트: 보스 유물 · 큰 족보: 희귀 카드 · 그 밖: 골드 15', R => {
      const d = [die(R), die(R), die(R), die(R), die(R)];
      R.event.dice = d;
      if (baseScore('yacht', d)) { const id = rollRelic(R, 3); gainRelic(R, id); return `요트!! 신이 「${relicInfo(id)?.ko}」를 내렸다!`; }
      if (['four', 'full', 'sstr', 'lstr'].some(c => baseScore(c, d))) {
        const c = rollCard(R, 2); R.deck.push(c); fx(R, { type: 'gainCard', u: c.u });
        return `족보가 나왔다! 「${cardName(c)}」 카드를 얻었다.`;
      }
      R.gold += 15; R.stats.gold += 15;
      return '평범한 눈이다. 신전 바닥에서 15골드를 주웠다.';
    }),
    O('떠난다', '아무 일도 없다', () => '신전을 지나쳤다.')]),
  E_('library', '버려진 서고', 'scroll', '먼지 쌓인 책장 사이로 족보 비급이 보인다.', [
    O('비급을 읽는다', '희귀 카드 1장', R => { const c = rollCard(R, 2); R.deck.push(c); fx(R, { type: 'gainCard', u: c.u }); return `「${cardName(c)}」 카드를 익혔다.`; }),
    O('베껴 쓴다', '내 카드 1장 복제', R => { R.pick = { why: 'dup', from: 'event', done: '비급을 베껴 카드 한 장을 더 만들었다.' }; return null; })]),
  E_('trap', '함정 복도', 'warn', '바닥 돌판이 수상하다. 조심스레 건널까, 그냥 뛰어갈까?', [
    O('조심히 건넌다', '주사위 1개: 4 이상이면 무사, 아니면 체력 16 잃음', R => {
      const v = die(R); R.event.dice = [v];
      if (v >= 4) return `${v}! 함정을 피했다.`;
      hurtHero(R, 16, 'event'); return `${v}… 함정이 터졌다! 체력 16을 잃었다.`;
    }),
    O('뛰어간다', '체력 7 잃음', R => { hurtHero(R, 7, 'event'); return '발목을 긁혔지만 빠져나왔다. 체력 7을 잃었다.'; })]),
  E_('carver', '주사위 깎는 노인', 'axe', '"주사위 다섯 개를 세 번까지 굴려 족보를 만들어 보게. 솜씨만큼 자네 주사위의 면을 원하는 눈으로 깎아 주지."', [
    O('도전한다', '야추처럼 3번까지 굴려 족보 점수 · 10점 이하 1면 · 20점 이하 2면 · 30점 이하 3면 · 요트 4면을 깎는다', R => {
      R.event.yacht = { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 3, done: null };
      return null;
    }),
    O('떠난다', '아무 일도 없다', () => '"다음에 또 오게나."')]),
  E_('fairy', '길 잃은 요정', 'sparkle', '날개를 다친 요정이 울고 있다. 상처를 돌봐 주자 요정이 고마워한다.', [
    O('축복을 받는다', '최대 체력 +8', R => { R.maxHp += 8; R.hp += 8; return '따뜻한 빛이 감싼다. 최대 체력 +8.'; }),
    O('선물을 받는다', '뒤집기 +2 · 조정 +2', R => { addTool(R, 'flip', 2); addTool(R, 'nudge', 2); return '요정이 반짝이는 가루를 뿌려 주었다.'; })]),
];
export const eventDef = id => EVENTS.find(e => e.id === id);
function startEvent(R) {
  const seen = new Set(R.seenEvents || []);
  let pool = EVENTS.filter(e => !seen.has(e.id));
  if (!pool.length) { R.seenEvents = []; pool = EVENTS; }
  // 2막에는 「주사위 깎는 노인」이 꼭 한 번 나온다 (2막의 첫 이벤트)
  const carver = R.act === 2 && !R.carver2 && EVENTS.find(e => e.id === 'carver');
  if (carver) R.carver2 = true;
  const ev = carver || pick(R, pool);
  R.seenEvents = [...(R.seenEvents || []), ev.id];
  R.phase = 'event';
  R.event = { id: ev.id, result: null, dice: null, fight: null };
}
export const eventChoose = act('eventChoose', function eventChoose(R, k) {
  if (R.phase !== 'event' || !R.event || R.event.result != null || R.pick) fail('지금은 고를 수 없어요.');
  const o = eventDef(R.event.id).opts[k];
  if (!o) fail('없는 선택지예요.');
  if (!o.can(R)) fail('지금은 고를 수 없는 선택지예요.');
  const text = o.go(R);
  R.event.choice = k;
  if (text != null) R.event.result = text;
  if (R.hp <= 0 && !revive(R)) loseRun(R);
});
// 결과를 보고 지도로 (또는 이벤트 전투로)
export const eventLeave = act('eventLeave', function eventLeave(R) {
  if (R.phase !== 'event') fail('이벤트가 아니에요.');
  const fight = R.event?.fight;
  R.event = null;
  if (fight) return startCombat(R, fight);
  R.phase = 'map';
});
// 주사위 깎는 노인: 야추 한 턴 (3번까지 굴리고, 잡은 주사위는 남긴다)
const yachtGame = R => { const y = R.event?.yacht; if (R.phase !== 'event' || !y || y.done) fail('지금은 굴릴 수 없어요.'); return y; };
export const CARVE_STEPS = [[10, 1], [20, 2], [30, 3]];      // 점수 이하 → 깎는 면 수 (요트는 4)
export function carveCount(dice) {
  if (baseScore('yacht', dice)) return { n: 4, score: 50, cat: 'yacht' };
  let score = 0, cat = 'choice';
  for (const c of CAT_IDS) { const v = baseScore(c, dice); if (v > score) { score = v; cat = c; } }
  return { n: (CARVE_STEPS.find(([max]) => score <= max) || [0, 3])[1], score, cat };
}
export const eventRoll = act('eventRoll', function eventRoll(R) {
  const y = yachtGame(R);
  if (y.rolls <= 0) fail('굴림을 다 썼어요.');
  const first = y.rolls === 3;
  y.dice = y.dice.map((v, i) => (first || !y.held[i] ? die(R) : v));
  y.rolls--;
  if (y.rolls === 0) stopYacht(R);
});
export const eventHold = act('eventHold', function eventHold(R, i) {
  const y = yachtGame(R);
  if (y.rolls === 3) fail('먼저 굴려 주세요.');
  if (i < 0 || i > 4) fail('없는 주사위예요.');
  y.held[i] = !y.held[i];
});
export const eventStop = act('eventStop', function eventStop(R) {
  const y = yachtGame(R);
  if (y.rolls === 3) fail('먼저 굴려 주세요.');
  stopYacht(R);
});
function stopYacht(R) {
  const y = R.event.yacht;
  y.done = carveCount(y.dice);
  R.pick = { why: 'face', left: y.done.n, from: 'event', done: `주사위 면 ${y.done.n}개를 깎았다.` };
}
// 주사위 i 의 f 번째 면을 눈 v 로 깎는다
export const carveFace = act('carveFace', function carveFace(R, i, f, v) {
  const pk = R.pick;
  if (!pk || pk.why !== 'face') fail('지금은 깎을 수 없어요.');
  if (!(i >= 0 && i < 6 && f >= 0 && f < 6 && v >= 1 && v <= 6)) fail('잘못된 면이에요.');
  const faces = (R.dfaces ||= {})[i] = [...facesOf(R, i)];
  if (faces[f] === v) fail('이미 그 눈이에요.');
  faces[f] = v;
  pk.left--;
  fx(R, { type: 'carve', i, f, v });
  if (pk.left <= 0) { R.pick = null; finishEvent(R, pk.done); }
});
function finishEvent(R, text) { if (R.phase === 'event' && R.event && R.event.result == null) R.event.result = text || '끝났다.'; }

// ── 화면 · 저장용 ────────────────────────────────────────────────────────────
export function drainFx(R) { const out = R.fx; R.fx = []; return out; }
export const deckCards = R => R.deck.slice().sort((a, b) => CAT_IDS.indexOf(a.cat) - CAT_IDS.indexOf(b.cat) || b.up - a.up);
export const floorOf = R => (R.pos == null ? 0 : mapNode(R, R.pos).row);

// ── 봇 (밸런스 시뮬레이션 · 화면 점검용) ─────────────────────────────────────
// 전투: 굴림은 '손패 중 가장 좋은 카드의 값'을 최대로 하는 잡기를 표본으로 고르고,
// 카드는 공격 · 방어 배분 후보(전부 공격 · 다 막을 만큼 방어 · 절반 · 전부 방어) 중 이득이 큰 것으로 낸다.
// 표본 계산은 빠른 점수(배율을 미리 계산)로 한다.
// 값의 단위는 '아끼는 체력'. 막은 1점 = 체력 1점. 때린 1점 = 전투가 그만큼 빨리 끝나 덜 맞는 체력 (k = 적 턴당 피해 ÷ 내 턴당 피해).
// 체력이 적으면 지금 막는 쪽에 무게를 더 준다 (bw)
function botCtx(R) {
  const C = R.C, e = C.e;
  const raw = incoming(R), have = C.block;
  const moves = movesOf(R);
  const eAvg = moves.reduce((a, m) => a + (m.atk ? atkOf(R, m.atk, m.hits || 1) * (m.hits || 1) : 0), 0) / moves.length;
  const hAvg = R.stats.atkN > 2 ? R.stats.atkSum / R.stats.atkN : 20;
  const k = Math.min(1.6, Math.max(0.3, eAvg / Math.max(8, hAvg)));
  const frac = R.hp / R.maxHp;
  const bw = frac < 0.25 ? 1.8 : frac < 0.5 ? 1.3 : 1;
  return { raw, have, base: Math.max(0, raw - have), bw, k, ehp: e.hp, miss: R.maxHp - R.hp };
}
// 손패 카드마다 배율 · 성질을 한 번만 계산해 둔다 (rollNo: 그 주사위가 몇 번째 굴림인지)
function prepHand(R, rollNo) {
  const C = R.C;
  const first = rollNo === 1;
  return C.hand.map(card => {
    let mul = 1;
    const up = isFuture(card.cat) ? 'choice' : card.cat;      // 미래 카드: 주사위 계획에서는 0점 카드로 본다
    if (hasRelic(R, 'basic') && isUpper(up)) mul += 0.3;
    if (hasRelic(R, 'choice') && up === 'choice') mul += RT.choice;
    if (hasRelic(R, 'full') && up === 'full') mul += 0.5;
    if (hasRelic(R, 'straight') && (up === 'sstr' || up === 'lstr')) mul += 0.3;
    if (hasRelic(R, 'fourk') && up === 'four') mul += 0.5;
    if (hasRelic(R, 'yacht') && up === 'yacht') mul += 0.5;
    if (R.cls === 'warrior' && isUpper(up)) mul += CLASS_TUNE.warriorMul;
    if (R.cls === 'gambler' && C.bet === card.u) mul += CLASS_TUNE.betMul - 1;
    if (R.cls === 'outlaw' && first) mul += (RUSH_CATS.includes(up) ? CLASS_TUNE.rushMul : CLASS_TUNE.rushAny) - 1;   // 큰 족보는 점수가 나면 곧 완성
    if (R.cls === 'dancer' && C.danced) mul += CLASS_TUNE.danceMul;
    if (R.cls === 'rogue' && C.flipped) mul += CLASS_TUNE.rogueMul;
    if (hasRelic(R, 'drum') && C.turn === 1) mul += 0.5;
    if (C.power) mul += 0.5;
    if (hasRelic(R, 'small') && ['ones', 'twos', 'threes'].includes(up)) mul += 0.2;
    if (hasRelic(R, 'rosary') && R.deck.length <= ROSARY_MAX) mul += 0.25;
    if (C.keepUp && !C.plays) mul += C.keepUp;
    // 새 유물 · 징조 (합연산)
    mul += (hasRelic(R, 'madscale') ? RT.madMul : 0) + (hasRelic(R, 'bloodpact') ? 0.5 : 0) + (hasRelic(R, 'glasscannon') ? 0.6 : 0) + (hasRelic(R, 'emptyhand') ? 0.6 : 0)
      + (R.palette?.done && hasRelic(R, 'palette') ? 0.5 : 0) + (omen(R, 'feast') ? 0.5 : 0) + (omen(R, 'forbid') ? 0.2 : 0) + (omen(R, 'glass') ? 0.3 : 0)
      + (hasRelic(R, 'echodrum') && C.lastCat === up ? 0.25 * (C.chainN || 0) : 0) + (hasRelic(R, 'pairring') && C.hand.filter(c => c.cat === up).length >= 2 ? 0.5 : 0)
      + (card.zeroUp || 0) + (card.waxUp || 0);
    if (omen(R, 'forbid') && R.omenCat === up) mul = 0;
    // 곱연산: 카드 자신의 강화 · 속공
    mul *= (card.up ? 1 + UP_MUL : 1) * (hasKw(card, 'quick') && first ? 1.5 : 1);
    if (C.weak > 0) mul *= 0.75;
    return {
      cat: up, mul, face: isUpper(up) ? UPPER.indexOf(up) + 1 : 0, grow: up === 'ones' && !(omen(R, 'forbid') && R.omenCat === up) ? card.grow || 0 : 0,
      two: up === 'twos' ? (hasRelic(R, 'culture') ? 1 : 0) : null, tri: isTrinity(card), pairs: hasRelic(R, 'pairs'),
      quad: hasRelic(R, 'quad') ? (C.weak > 0 ? 0.75 : 1) : 0, reso: hasRelic(R, 'reso') && RESO_CATS.includes(up), flow: hasRelic(R, 'flow') && (up === 'sstr' || up === 'lstr'),
      combo: hasRelic(R, 'combo') && (up === 'sstr' || up === 'lstr'), crutch: up === 'lstr' && hasRelic(R, 'crutch'),
      house: (up === 'full' || up === 'four') && hasRelic(R, 'emptyhouse'), zero: (C.gazed.includes(card.u) && !C.pure) || isFuture(card.cat),
      flat: (R.cls === 'mage' ? (C.hand.length - 1) * CLASS_TUNE.mageBonus : 0) + (hasRelic(R, 'whet') ? 3 : 0),
      horn: hasRelic(R, 'horn') && isBossKind(C.e), poison: hexActive(R, 'poison'),
      pierce: hasKw(card, 'pierce') || (R.cls === 'rogue' && C.flipped),
      dmul: 1 + (hasKw(card, 'guard') ? GUARD_MUL : 0) + (hasRelic(R, 'scale') ? 0.3 : 0), wblk: R.cls === 'warrior' && isUpper(up),
      vamp: hasKw(card, 'vamp'), burn: hasKw(card, 'burn'), weak: hasKw(card, 'weak'), gold: hasKw(card, 'gold'),
    };
  });
}
function fastBase(cat, d) {
  if (d.length > 5) return Math.max(...fiveSets(d).map(set => baseScore(cat, set)));
  const c = [0, 0, 0, 0, 0, 0, 0];
  let sum = 0;
  for (const v of d) { c[v]++; sum += v; }
  switch (cat) {
    case 'choice': return sum;
    case 'four': return Math.max(...c) >= 4 ? sum : 0;
    case 'full': { const f = c.filter(x => x > 0).sort((a, b) => b - a); return f[0] === 3 && f[1] === 2 ? sum : 0; }
    case 'sstr': return (c[1] && c[2] && c[3] && c[4]) || (c[2] && c[3] && c[4] && c[5]) || (c[3] && c[4] && c[5] && c[6]) ? 15 : 0;
    case 'lstr': return (c[2] && c[3] && c[4] && c[5]) && (c[1] || c[6]) ? 30 : 0;
    case 'yacht': return Math.max(...c) === 5 ? 50 : 0;
    default: { const f = CAT_IDS.indexOf(cat) + 1; return c[f] * f; }
  }
}
// 점수 s 를 공격 a · 방어 s-a 로 나눴을 때의 값 (빠른 근사)
function fastSplit(R, info, s, a, ctx) {
  const e = R.C.e;
  let v = 0, weak = false;
  if (a > 0) {
    let d = a + Math.round(info.flat * a / s);
    if (info.combo) d = Math.round(d * RT.comboMul);
    if (info.horn) d = Math.round(d * 1.25);
    if (info.poison && d <= 15) d = Math.floor(d / 2);
    const through = info.pierce ? d : Math.max(0, d - e.block);
    if (through >= e.hp) return 1000 + through;
    weak = info.weak && a * 2 >= s;
    v += through * ctx.k + (info.vamp ? Math.min(a / 3, ctx.miss) * 0.8 : 0) + (info.burn ? a / 2 * ctx.k : 0) + (info.gold ? a / 10 : 0) + (info.tri ? s / 10 : 0);
  }
  const blk = (info.tri ? s : s - a) * info.dmul + (info.wblk ? a / 2 : 0);
  const taken = Math.max(0, (weak ? ctx.raw / 2 : ctx.raw) - ctx.have - blk);
  return v + (ctx.base - taken) * ctx.bw;
}
function fastValue(R, info, s, ctx) {
  if (s <= 0) return 0;
  let best = fastSplit(R, info, s, s, ctx);
  if (best >= 1000 || !ctx.base || info.tri) return best;      // 삼위일체: 공격 · 방어를 모두 얻는다 (봇은 프리즘도 이렇게 본다)
  // 다 막을 만큼만 방어하고 나머지로 공격 (약화 카드는 절반 이상 공격해 피해를 반으로 줄이는 경우도)
  best = Math.max(best, fastSplit(R, info, s, s - Math.min(s, Math.ceil(ctx.base / info.dmul)), ctx));
  if (info.weak) {
    const h = Math.ceil(s / 2);
    best = Math.max(best, fastSplit(R, info, s, Math.max(h, s - Math.ceil(Math.max(0, ctx.raw / 2 - ctx.have) / info.dmul)), ctx));
  }
  return best;
}
// 빠른 카드 점수 (유물의 기본 점수 변경 포함)
function fastScore(info, dice) {
  const n2 = info.two != null ? Math.min(5, dice.filter(v => v === 2).length) : 0;
  let raw = info.two != null ? (n2 ? 2 ** (n2 + info.two) : 0) : fastBase(info.cat, dice);
  if (!raw && info.crutch && fastBase('sstr', dice)) raw = 30;
  if (!raw && info.house) { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of dice) c[v]++; if (Math.max(...c) >= 3) raw = dice.reduce((a, v) => a + v, 0); }
  if (raw <= 0 && !info.grow) return 0;
  let adj = raw, mul = info.mul;
  if (info.face) {
    const n = info.two != null ? n2 : Math.round(raw / info.face);
    if (info.pairs) adj += n * RT.pairs;
    adj += info.grow;
    if (n === 2) mul += info.quad;
    if (info.reso && n >= RESO_N) mul += RESO_MUL;
    return Math.round(adj * mul);
  } else if (info.flow) adj = info.cat === 'sstr' ? 25 : RT.flowL;
  else if (info.cat === 'sstr') adj = 20;
  return Math.round(adj * mul);
}
function handFast(R, infos, dice, ctx) {
  let best = 0;
  for (const info of infos) {
    if (info.zero) continue;
    const v = fastValue(R, info, fastScore(info, dice), ctx);
    if (v > best) best = v;
  }
  return best;
}
// 실제로 낼 카드: 정확한 미리보기로 비교
function playValue(R, p, ctx) {
  const e = R.C.e;
  let v = 0;
  if (p.atk > 0) {
    const through = p.pierce ? p.dmg : Math.max(0, p.dmg - e.block);
    if (through >= e.hp) return 1000 + through;
    v += through * ctx.k + p.burn * 2 * ctx.k;
  }
  v += p.gold * 0.1;
  return v + (ctx.base - takenAfter(R, p)) * ctx.bw + Math.min(p.heal, ctx.miss) * 0.8;
}
function bestPlay(R) {
  const C = R.C, ctx = botCtx(R);
  let best = { v: -Infinity, hi: 0, atk: 'enemy' };
  C.hand.forEach((card, hi) => {
    const sc = scoreCard(R, card), S = splitPool(R, card, sc.total);
    for (const a of new Set([S, 0, Math.ceil(S / 2), coverAtk(R, hi, sc).atk])) {
      const v = playValue(R, preview(R, hi, a, sc), ctx);
      if (v > best.v + 1e-9) best = { v, hi, atk: a };
    }
  });
  return best;
}
// ── 봇 주사위 계획 (요트 DP) ──────────────────────────────────────────────
// 주사위 n개의 모든 조합(눈의 개수 묶음)과 '남길 주사위' 묶음마다 다시 굴렸을 때 나올 조합의 확률을 미리 만들어 두고,
// 남은 굴림 수만큼 거꾸로 계산해 '지금 멈추기 · 이렇게 남기고 다시 굴리기' 중 기댓값이 가장 큰 쪽을 고른다.
const DP_TABLES = {};
function dpTables(n) {
  if (DP_TABLES[n]) return DP_TABLES[n];
  const key = c => c[1] + c[2] * 7 + c[3] * 49 + c[4] * 343 + c[5] * 2401 + c[6] * 16807;
  const gen = m => {
    const out = [], c = [0, 0, 0, 0, 0, 0, 0];
    const rec = (v, left) => { if (v === 6) { c[6] = left; out.push(c.slice()); return; } for (let x = 0; x <= left; x++) { c[v] = x; rec(v + 1, left - x); } };
    rec(1, m);
    return out;
  };
  const fact = [1, 1, 2, 6, 24, 120, 720];
  const prob = c => { let m = 0, p; for (let v = 1; v <= 6; v++) m += c[v]; p = fact[m]; for (let v = 1; v <= 6; v++) p /= fact[c[v]]; return p / 6 ** m; };
  const states = gen(n), sIdx = new Map(states.map((c, i) => [key(c), i]));
  const outs = [];
  for (let m = 0; m <= n; m++) outs[m] = gen(m).map(c => [c, prob(c)]);
  const keeps = [], kIdx = new Map();
  for (let k = 0; k <= n; k++) for (const c of gen(k)) {
    kIdx.set(key(c), keeps.length);
    const to = [], pr = [];
    for (const [o, p] of outs[n - k]) { to.push(sIdx.get(key(c.map((x, v) => x + o[v])))); pr.push(p); }
    keeps.push({ c, k, to, pr });
  }
  const subs = states.map(c => {
    const list = [], cur = [0, 0, 0, 0, 0, 0, 0];
    const rec = v => { if (v === 7) { list.push(kIdx.get(key(cur))); return; } for (let x = 0; x <= c[v]; x++) { cur[v] = x; rec(v + 1); } };
    rec(1);
    return list;
  });
  const dice = states.map(c => { const d = []; for (let v = 1; v <= 6; v++) for (let x = 0; x < c[v]; x++) d.push(v); return d; });
  const idx = d => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of d) c[v]++; return sIdx.get(key(c)); };
  return (DP_TABLES[n] = { states, keeps, subs, dice, idx });
}
// 이번 턴 계획: W[s] = 지금 주사위가 조합 s 라면 앞으로 얻을 기댓값, stop = 지금 멈추는 게 최선, keep = 남길 눈 개수
function rollPlan(R, ctx) {
  const C = R.C, n = C.dice.length, T = dpTables(n), L = C.rollsLeft;
  const cnt = list => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const i of list) c[C.dice[i]]++; return c; };
  const frozen = cnt(C.frozen), forced0 = cnt([...new Set([...C.frozen, ...C.sealed])]);
  // 남은 굴림 1회당 붙는 것 (수도승 보호막 · 조정, 모래시계, 무법자 첫 굴림 보호막)
  const perRoll = (R.cls === 'monk' ? CLASS_TUNE.monkBlock * 0.6 + 1.5 : 0) + (hasRelic(R, 'hourglass') ? 1.8 : 0);
  const stopV = [], base = new Map();      // 굴림 번호가 달라도 배율이 같으면 한 번만 계산
  for (let t = 0; t <= L; t++) {
    const infos = prepHand(R, C.rollNo + t), left = L - t;
    const bonus = left * perRoll + (R.cls === 'outlaw' && C.rollNo + t === 1 ? left * CLASS_TUNE.rushBlock * 0.6 : 0);
    const sig = infos.map(x => x.mul).join();
    if (!base.has(sig)) base.set(sig, T.dice.map(d => handFast(R, infos, d, ctx)));
    const b = base.get(sig);
    stopV[t] = bonus ? b.map(v => v + bonus) : b;
  }
  let next = stopV[L], keep0 = null, stop0 = true;
  const s0 = T.idx(C.dice);
  for (let t = L - 1; t >= 0; t--) {
    const forced = t === 0 ? forced0 : frozen;
    const ev = new Float64Array(T.keeps.length);
    for (let k = 0; k < T.keeps.length; k++) {
      const K = T.keeps[k];
      let ok = K.k < n;
      for (let v = 1; ok && v <= 6; v++) if (K.c[v] < forced[v]) ok = false;
      if (!ok) { ev[k] = -Infinity; continue; }
      let e = 0; for (let j = 0; j < K.to.length; j++) e += K.pr[j] * next[K.to[j]];
      ev[k] = e;
    }
    const cur = new Float64Array(T.states.length);
    for (let si = 0; si < T.states.length; si++) {
      let best = stopV[t][si], bk = -1;
      for (const k of T.subs[si]) if (ev[k] > best + 1e-9) { best = ev[k]; bk = k; }
      cur[si] = best;
      if (t === 0 && si === s0) { stop0 = bk < 0; keep0 = bk < 0 ? null : T.keeps[bk].c; }
    }
    next = cur;
  }
  return { T, W: next, stop: stop0, keep: keep0 };
}
// 굴리기 전: 처음 굴림부터 남은 굴림을 다 쓸 때까지의 기댓값 (도박사 배팅 고르기)
function freshValue(R, ctx) {
  const C = R.C, n = C.dice.length, T = dpTables(n), L = C.rollsLeft;
  if (L <= 0) return 0;
  let next = null;
  for (let t = L; t >= 1; t--) {
    const infos = prepHand(R, t), stop = T.dice.map(d => handFast(R, infos, d, ctx));
    if (!next) { next = stop; continue; }
    const ev = T.keeps.map(K => { if (K.k >= n) return -Infinity; let e = 0; for (let j = 0; j < K.to.length; j++) e += K.pr[j] * next[K.to[j]]; return e; });
    next = stop.map((v, si) => { let b = v; for (const k of T.subs[si]) if (ev[k] > b) b = ev[k]; return b; });
  }
  const K = T.keeps[0];
  let e = 0; for (let j = 0; j < K.to.length; j++) e += K.pr[j] * next[K.to[j]];
  return e;
}
export function botCombat(R, rng = Math.random, samples = 12) {
  const C = R.C;
  // 물약: 위험하면 회복 · 방패, 잡을 수 있으면 화염, 방해가 심하면 정화
  if (R.potions.length && C.rolled) {
    const inc = incoming(R) - C.block;
    const k = R.potions.findIndex(id => (id === 'heal' && R.hp < R.maxHp * 0.4) || (id === 'block' && inc >= R.hp * 0.5) || (id === 'fire' && C.e.hp <= 20)
      || (id === 'pure' && C.hex && ['seal', 'freeze', 'gaze', 'haki'].includes(C.hex.t) && C.rollNo === 1)
      || (id === 'power' && isBossKind(C.e) && C.rollsLeft === 0) || (id === 'time' && isBossKind(C.e) && C.rollsLeft === 0 && C.rollNo >= 2));
    if (k >= 0) return { type: 'potion', slot: k };
  }
  if (R.cls === 'gambler' && !C.rolled && C.bet == null && C.hand.length) {
    // 배팅: 카드마다 '그 카드에 걸었을 때 이번 턴 기댓값'을 끝까지 계산해 가장 큰 쪽
    const ctx = botCtx(R);
    let hi = 0, bv = -Infinity;
    C.hand.forEach((c, k) => { C.bet = c.u; const v = freshValue(R, ctx); if (v > bv) { bv = v; hi = k; } });
    C.bet = null;
    return { type: 'bet', hi };
  }
  if (!C.rolled) return { type: 'roll' };
  const n = C.dice.length;
  const ctx = botCtx(R);
  const cur = prepHand(R, C.rollNo);
  // 이번 턴의 최선: 주사위 조합마다 '지금 멈추기 · 더 굴리기' 기댓값을 끝까지 계산해 둔다 (요트 DP)
  const plan = rollPlan(R, ctx);
  const W = d => plan.W[plan.T.idx(d)];
  const now = W(C.dice);
  // 첫 굴림 뒤, 가망 없는 카드(0점인 작은 숫자 카드 · 요트)는 한 장 바꾼다
  if (C.swaps > 0 && C.rollNo === 1) {
    const dead = C.hand.findIndex(c => C.bet !== c.u && ['ones', 'twos', 'threes', 'yacht'].includes(c.cat) && !c.grow && fastBase(c.cat, C.dice) === 0);
    if (dead >= 0) return { type: 'swap', hi: dead };
  }
  // 도구(뒤집기 · 조정 · 밑장빼기): 쓰면 이번 턴 기댓값이 얼마나 오르는지 (원정 내내 이어지는 자원이라 문턱을 둔다)
  const thr = (stock, base) => base * (stock >= TOOL_CAP - 1 ? 0.4 : 1);
  if (!toolsLocked(R) && (R.flip > 0 || R.nudge > 0)) {
    const last = C.rollsLeft === 0;
    let ba = null, bg = 0;
    const rogueFirst = R.cls === 'rogue' && !C.flipped;
    const flipHand = rogueFirst ? cur.map(x => ({ ...x, mul: x.mul + CLASS_TUNE.rogueMul, pierce: true })) : null;
    const stopNow = handFast(R, cur, C.dice, ctx);
    for (let i = 0; i < n; i++) {
      if (isSealed(R, i)) continue;
      if (R.flip > 0) {
        const nd = C.dice.slice(); nd[i] = 7 - nd[i];
        const g = (rogueFirst ? Math.max(W(nd), handFast(R, flipHand, nd, ctx)) - Math.max(now, stopNow) : W(nd) - now) - thr(R.flip, last ? 2.5 : 4);
        if (g > bg) { bg = g; ba = { type: 'flip', i }; }
      }
      if (R.nudge > 0) for (const d of [-1, 1]) {
        const v = C.dice[i] + d; if (v < 1 || v > 6) continue;
        const nd = C.dice.slice(); nd[i] = v;
        const g = W(nd) - now - thr(R.nudge, last ? 2 : 3.5);
        if (g > bg) { bg = g; ba = { type: 'nudge', i, d }; }
      }
    }
    if (ba) return ba;
  }
  if (canDeal(R)) {
    // 이번 턴에 두 번 바꿀 수 있으면 두 개를 함께 바꾸는 경우까지 본다
    const two = Math.min(C.deals, CLASS_TUNE.dealsTurn - (C.dealtTurn === C.turn ? C.dealtN || 0 : 0)) >= 2;
    const cost = (C.rollsLeft === 0 ? 1 : 3) + (C.deals <= 2 ? 3 : 0);   // 전투마다 횟수가 정해져 있어 아껴 쓴다
    let bg = cost, ba = null;
    for (let i = 0; i < n; i++) {
      if (isSealed(R, i)) continue;
      for (let v = 1; v <= 6; v++) {
        if (v === C.dice[i]) continue;
        const nd = C.dice.slice(); nd[i] = v;
        const g = W(nd) - now;
        if (g > bg) { bg = g; ba = { type: 'deal', i, v }; }
        if (two) for (let j = i + 1; j < n; j++) {
          if (isSealed(R, j)) continue;
          for (let w = 1; w <= 6; w++) {
            if (w === C.dice[j]) continue;
            const n2 = nd.slice(); n2[j] = w;
            const g2 = W(n2) - now - cost;      // 두 번 쓰는 값
            if (g2 > bg) { bg = g2; ba = { type: 'deal', i, v }; }
          }
        }
      }
    }
    if (ba) return ba;
  }
  if (canDance(R)) {
    const danced = prepHand(R, C.rollNo).map(x => ({ ...x, mul: x.mul + CLASS_TUNE.danceMul }));
    const up = handFast(R, danced, C.dice.map((v, i) => (isSealed(R, i) ? v : Math.min(6, v + 1))), ctx);
    if (up - now > 4 || (C.rollsLeft === 0 && up > now + 1)) return { type: 'dance' };
  }
  if (C.rollsLeft > 0 && !plan.stop && plan.keep) {
    const want = plan.keep.slice(), hold = new Array(n).fill(false);
    // 봉인 · 얼음 주사위는 어차피 남으니 먼저 센다
    for (let i = 0; i < n; i++) if ((isSealed(R, i) || isFrozen(R, i)) && want[C.dice[i]] > 0) { want[C.dice[i]]--; hold[i] = true; }
    for (let i = 0; i < n; i++) if (!hold[i] && want[C.dice[i]] > 0) { want[C.dice[i]]--; hold[i] = true; }
    if (!hold.every((h, i) => h || isFrozen(R, i)))
      return { type: 'reroll', hold: hold.map((h, i) => h && !isSealed(R, i) && !isFrozen(R, i)) };
  }
  const b = bestPlay(R);
  const fut = botFuture(R, b);
  if (fut) return fut;
  return { type: 'play', hi: b.hi, target: b.atk };
}
// 봇의 미래 카드: 병렬 연산은 함께 낼 점수가 한 장보다 넉넉히 크면, 일시정지는 맞으면 위험할 때
function botFuture(R, b) {
  const C = R.C;
  const bestS = C.hand[b.hi] ? splitPool(R, C.hand[b.hi], scoreCard(R, C.hand[b.hi]).total) : 0;
  const need = Math.max(0, incoming(R) - C.block);
  const pi = C.hand.findIndex(c => c.cat === 'xpar');
  if (pi >= 0) {
    const set = parallelSet(R, C.hand[pi].u), S = set.reduce((a, o) => a + o.s, 0);
    if (set.length >= 2 && S > bestS * 1.2 + 4) return { type: 'play', hi: pi, target: need >= R.hp * 0.5 ? Math.max(0, S - need) : need > R.hp * 0.25 ? Math.max(0, S - Math.round(need * 0.6)) : 'enemy' };
  }
  const qi = C.hand.findIndex(c => c.cat === 'xpause');
  if (qi >= 0 && (need >= R.hp * 0.45 || (C.jest?.kind === 'bomb' && need >= R.hp * 0.25)) && bestS < need) return { type: 'play', hi: qi, target: 'self' };
  return null;
}
export function applyCombat(R, a) {
  switch (a.type) {
    case 'roll': return roll(R);
    case 'reroll': a.hold.forEach((h, i) => { if (!!R.C.held[i] !== h && !isSealed(R, i) && !isFrozen(R, i)) toggleHold(R, i); }); return roll(R);
    case 'flip': return useFlip(R, a.i);
    case 'nudge': return useNudge(R, a.i, a.d);
    case 'swap': return swapCard(R, a.hi);
    case 'bet': return placeBet(R, a.hi);
    case 'dance': return useDance(R);
    case 'deal': return useDeal(R, a.i, a.v);
    case 'potion': return usePotion(R, a.slot);
    case 'play': return playCard(R, a.hi, a.target);
  }
}

// 카드 가치 (봇이 보상 · 상점에서 고를 때). 대략 '노렸을 때 기대 점수'
const CARD_EV = { choice: 23, four: 9, full: 10, sstr: 11, lstr: 10, yacht: 6, sixes: 12.6, fives: 10.5, fours: 8.4, threes: 14, twos: 7, ones: 8 };   // 특별 카드: 자람 · 두 배 · 삼위일체를 대충 친다
const KW_V = { guard: 4, vamp: 5, burn: 6, pierce: 3, quick: 4, lucky: 3, weak: 3, gold: 2, echo: 3, keep: 4 };
export function botCardValue(R, c) {
  if (isFuture(c.cat)) return { xpar: 30, xpause: 22, xrent: 16 }[c.cat];
  let v = CARD_EV[c.cat] * (c.up ? 1 + UP_MUL : 1);
  if (R.cls === 'warrior' && isUpper(c.cat)) v *= 1.5;
  const sy = synergy(R);
  if (isUpper(c.cat)) {
    if (hasRelic(R, 'pairs')) v += (CARD_EV[c.cat] / (UPPER.indexOf(c.cat) + 1)) * RT.pairs;
    if (hasRelic(R, 'small') && ['ones', 'twos', 'threes'].includes(c.cat)) v *= 1.2;
    if (hasRelic(R, 'quad')) v *= 1.3;
  }
  if ((c.cat === 'sstr' || c.cat === 'lstr') && sy.str) v *= 1 + (hasRelic(R, 'flow') ? 0.6 : 0) + (hasRelic(R, 'combo') ? 0.5 : 0);
  for (const k of kwsOf(c)) v += KW_V[k];
  // 이미 있는 카드와 겹치면 조금 덜
  const same = R.deck.filter(x => x.cat === c.cat).length;
  return v - same * 1.5;
}
// 시험 원정 (테스트판 전용 버튼): 특별 카드 3장 + 전용 유물 3개를 들고 출발. 정식 출시 전에 버튼과 함께 지울 것
export function trialKit(R) {
  R.deck = R.deck.filter(c => !isSpecial(c.cat));
  for (const cat of SPECIAL_CATS) R.deck.push(mkCard(R, cat));
  for (const id of Object.keys(SPECIAL_RELIC)) if (!hasRelic(R, id)) gainRelic(R, id);
  R.trial = true;
  return R;
}
// ── 시험 원정 샌드박스: 유물 · 카드 · 소모품 · 적 · 징조 · 주사위를 마음대로 (R.trial 에서만) ──
// 테스트판 전용이라 서버 다시 돌리기(act)와 상관없이 판을 바로 고친다.
const sbOn = R => { if (!R?.trial) fail('시험 원정에서만 쓸 수 있어요.'); };
const sbCombat = R => { sbOn(R); if (R.phase !== 'combat' || !R.C || R.C.phase !== 'roll') fail('전투 중에만 쓸 수 있어요.'); return R.C; };
export const sandbox = {
  relic(R, id) {
    sbOn(R);
    if (!relicInfo(id)) fail('없는 유물이에요.');
    if (hasRelic(R, id)) R.relics = R.relics.filter(x => x !== id);
    else gainRelic(R, id);
  },
  // spec: { cat, up, kws, seal }, toHand: 전투 중이면 손패에도 바로
  card(R, spec, toHand = false) {
    sbOn(R);
    if (!CAT_IDS.includes(spec.cat) && !isFuture(spec.cat)) fail('없는 족보예요.');
    const fut = isFuture(spec.cat);
    const c = mkCard(R, spec.cat, spec.up && !fut ? 1 : 0, fut ? [] : (spec.kws || []).filter(k => KEYWORDS[k]).slice(0, KW_MAX));
    if (spec.seal && SEALS[spec.seal]) c.seal = spec.seal;
    if (spec.grow) c.grow = Math.max(0, Math.round(spec.grow));
    R.deck.push(c);
    if (toHand && R.C) { R.C.hand.push({ ...c }); syncRent(R); }
    return c;
  },
  removeCard(R, u) {
    sbOn(R);
    R.deck = R.deck.filter(c => c.u !== u);
    if (R.C) for (const k of ['hand', 'draw', 'discard', 'top']) R.C[k] = R.C[k].filter(c => c.u !== u);
  },
  potion(R, id) {
    sbOn(R);
    if (!potionInfo(id)) fail('없는 물약이에요.');
    if (R.potions.length >= POTION_SLOTS) fail(`물약은 ${POTION_SLOTS}개까지예요.`);
    R.potions.push(id);
  },
  clearPotions(R) { sbOn(R); R.potions = []; },
  // kind: gold · flip · nudge · dance · hp(가득) · maxHp
  res(R, kind, n) {
    sbOn(R);
    if (kind === 'gold') R.gold = Math.max(0, R.gold + n);
    if (kind === 'flip') R.flip = Math.max(0, R.flip + n);
    if (kind === 'nudge') R.nudge = Math.max(0, R.nudge + n);
    if (kind === 'dance') R.dance = Math.max(0, Math.min(DANCE_CAP, R.dance + n));
    if (kind === 'maxHp') { R.maxHp = Math.max(10, R.maxHp + n); R.hp = Math.min(R.hp + Math.max(0, n), R.maxHp); }
    if (kind === 'hp') R.hp = R.maxHp;
    if (kind === 'rrshop') R.rr = { ...rrOf(R), shop: rrOf(R).shop + n };
    if (kind === 'rrpick') R.rr = { ...rrOf(R), pick: rrOf(R).pick + n };
  },
  omen(R, id) {
    sbOn(R);
    if (id && !omenInfo(id)) fail('없는 징조예요.');
    R.omen = id || null; R.omenOpts = null;
    if (id === 'forbid') R.omenCat = pick(R, SAME_CATS_ALL.filter(c => c !== 'choice'));
  },
  act(R, n) { sbOn(R); R.act = Math.max(1, Math.min(ACTS, n)); },
  god(R, on) { sbOn(R); R.sbGod = !!on; },
  // 고른 적과 바로 싸운다 (이기면 보상 뒤 지도로, 막 · 층은 그대로)
  fight(R, foeId) {
    sbOn(R);
    if (!ENEMIES[foeId]) fail('없는 적이에요.');
    if (R.ended) fail('이미 끝난 원정이에요.');
    R.reward = null; R.shop = null; R.event = null; R.pick = null; R.omenOpts = null;
    R.sbFight = true;
    startCombat(R, foeId);
  },
  // 고른 이벤트를 바로 연다 (전투 중이면 전투를 접고)
  event(R, id) {
    sbOn(R);
    const ev = EVENTS.find(e => e.id === id);
    if (!ev) fail('없는 이벤트예요.');
    if (R.ended) fail('이미 끝난 원정이에요.');
    R.reward = null; R.shop = null; R.pick = null; R.omenOpts = null; R.C = null;
    R.phase = 'event';
    R.event = { id: ev.id, result: null, dice: null, fight: null };
  },
  dice(R, i, v) {
    const C = sbCombat(R);
    if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
    if (!(i >= 0 && i < C.dice.length) || !(v >= 1 && v <= 6)) fail('주사위 눈은 1~6이에요.');
    C.dice[i] = v;
  },
  rolls(R, n = 1) { const C = sbCombat(R); C.rollsLeft = Math.max(0, C.rollsLeft + n); },
  foeHp(R, hp) { const C = sbCombat(R); C.e.hp = C.e.maxHp = Math.max(1, Math.round(hp)); },
  clearHex(R) { const C = sbCombat(R); C.hex = null; C.sealed = []; C.frozen = []; C.gazed = []; C.weak = 0; },
};
// 원정 진행(지도 · 보상 · 상점 · 휴식 · 이벤트)을 한 걸음 진행한다
export function botRunStep(R, rng = Math.random) {
  if (R.pick?.why === 'face') {             // 가장 낮은 면을 6으로
    for (let i = 0; i < 5; i++) { const f = facesOf(R, i), k = f.indexOf(Math.min(...f)); if (f[k] < 6) return carveFace(R, i, k, 6); }
    return cancelPick(R);
  }
  if (R.phase === 'event' && R.event?.yacht && !R.event.yacht.done) {   // 가장 많이 나온 눈을 잡고 다시
    const y = R.event.yacht;
    if (y.rolls < 3) {
      const cnt = [0, 0, 0, 0, 0, 0, 0]; y.dice.forEach(v => cnt[v]++);
      const best = cnt.indexOf(Math.max(...cnt));
      const k = y.dice.findIndex((v, i) => (v === best) !== y.held[i]);
      if (k >= 0) return eventHold(R, k);
    }
    return eventRoll(R);
  }
  if (R.pick) {
    const pk = R.pick;
    if (pk.opts) {                       // 강화 고르기: 효과 값이 가장 큰 것 (이미 강화했으면)
      const v = o => (o === 'up' ? 6 : KW_V[o] + (o === 'keep' ? 1 : 0));
      return chooseUpgrade(R, pk.opts.indexOf(pk.opts.slice().sort((a, b) => v(b) - v(a))[0]));
    }
    const cands = R.deck.filter(c => (pk.why === 'upgrade' ? canUpgrade(c) : pk.why === 'seal' ? !c.seal : true));
    if (!cands.length) return cancelPick(R);
    const sorted = cands.slice().sort((a, b) => botCardValue(R, a) - botCardValue(R, b));
    return pickDeck(R, (pk.why === 'remove' ? sorted[0] : sorted[sorted.length - 1]).u);
  }
  if (R.phase === 'map' && R.omenOpts) return chooseOmen(R, rng() < 0.5 ? 0 : 1);
  if (R.phase === 'map') {
    const opts = nextNodes(R).map(id => mapNode(R, id));
    const frac = R.hp / R.maxHp;
    const score = n => ({ fight: 3, elite: frac > 0.7 ? 4 : frac > 0.5 ? 1 : -5, event: 2.5, shop: R.gold >= 120 ? 4 : R.gold >= 70 ? 2 : -1, rest: frac < 0.6 ? 6 : 1, treasure: 5, boss: 0 }[n.type] + rng() * 1.5);
    const best = opts.sort((a, b) => score(b) - score(a))[0];
    return enterNode(R, best.id);
  }
  if (R.phase === 'reward') {
    const rw = R.reward;
    const k = rw.items.findIndex(it => !it.done && !(it.t === 'potion' && R.potions.length >= POTION_SLOTS) && !((it.t === 'flip' || it.t === 'nudge') && R[it.t] >= TOOL_CAP));
    if (k < 0) return leaveReward(R);
    const it = rw.items[k];
    if (it.t === 'card') {
      const vals = it.opts.map(c => botCardValue(R, c));
      const bi = vals.indexOf(Math.max(...vals));
      // 덱이 커지면 정말 좋은 카드만
      const bar = R.deck.length >= 14 ? 16 : R.deck.length >= 11 ? 13 : 8;
      return takeReward(R, k, vals[bi] >= bar ? bi : -1);
    }
    if (it.t === 'relicPick') { const v = it.opts.map(id => RELIC_POWER[id] ?? 5); return takeReward(R, k, v.indexOf(Math.max(...v))); }
    return takeReward(R, k);
  }
  if (R.phase === 'shop') {
    const sh = R.shop;
    if (R.cls === 'monk') return leaveShop(R);
    if (!sh.removed && R.gold >= removePrice(R) && R.deck.length > 7 && R.deck.some(c => botCardValue(R, c) < 7)) return startRemove(R);
    let relic = -1;
    sh.relics.forEach((x, i) => { if (!x.sold && x.price <= R.gold && (RELIC_POWER[x.id] ?? 5) > 2 && (relic < 0 || (RELIC_POWER[x.id] ?? 5) > (RELIC_POWER[sh.relics[relic].id] ?? 5))) relic = i; });
    if (relic >= 0) return buy(R, 'relic', relic);
    const card = sh.cards.findIndex(x => !x.sold && x.price <= R.gold && botCardValue(R, x.c) >= 15 && R.deck.length < 14);
    if (card >= 0) return buy(R, 'card', card);
    if (!sh.smithed && R.gold >= smithPrice(R) + 25 && R.deck.some(canUpgrade)) return startSmith(R);
    const pot = sh.potions.findIndex(x => !x.sold && x.price <= R.gold - 20 && R.potions.length < POTION_SLOTS);
    if (pot >= 0) return buy(R, 'potion', pot);
    return leaveShop(R);
  }
  if (R.phase === 'rest') {
    if (R.hp < R.maxHp * 0.65 || !R.deck.some(canUpgrade)) return restHeal(R);
    return startUpgrade(R);
  }
  if (R.phase === 'event') {
    if (R.event.result != null || R.event.choice != null) return eventLeave(R);
    const ev = eventDef(R.event.id);
    const ok = ev.opts.map((o, k) => k).filter(k => ev.opts[k].can(R));
    // 위험한 선택은 체력이 넉넉할 때만
    const safe = ok.filter(k => !(R.hp < R.maxHp * 0.5 && /체력|전투/.test(typeof ev.opts[k].desc === 'string' ? ev.opts[k].desc : '')));
    const k = (safe.length ? safe : ok)[0];
    return eventChoose(R, k);
  }
}
// 원정 하나를 봇으로 끝까지 (시뮬레이션)
export function botRun(R, rng = Math.random, samples = 12, limit = 20000) {
  let steps = 0;
  while (!R.ended && steps++ < limit) {
    if (R.phase === 'combat') applyCombat(R, botCombat(R, rng, samples));
    else botRunStep(R, rng);
    R.fx.length = 0;
  }
  return R;
}
