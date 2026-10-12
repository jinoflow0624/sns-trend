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
export const ROWS = 6;            // 막마다 지도 층 수 (그 위에 보스 층)
export const COLS = 4;
export const ACTS = 3;
export const REST_HEAL = 0.3;     // 휴식: 최대 체력의 30%
export const ACT_HEAL = 0.6;      // 막을 넘어갈 때: 잃은 체력의 60%
export const DANCE_NEED = 25, DANCE_CAP = 3;
export const BURN_TURNS = 3;
export const GUARD_MUL = 0.5;     // 수호: 방어로 돌린 점수의 보호막 +50%
export const HYDRA_CUT = 30;      // 세머리 용: 카드 한 장으로 이만큼 피해를 주면 이번 턴의 머리가 잘린다
// 격앙: 전투가 길어지면 적이 턴마다 힘을 얻는다 (막기만 하며 버티는 것을 막는다). from 턴부터 적의 턴이 끝날 때마다 힘 +str
export const FURY = { normal: { from: 5, str: 1 }, elite: { from: 6, str: 2 }, boss: { from: 8, str: 2 } };

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
// 특수 주사위 한 개 굴리기 (금 · 무거운). 쌍둥이 · 계단은 다 굴린 뒤 specialDice 가 맞춘다
const dkind = (R, i) => R.dset?.[i] || null;
function rollFace(R, i) {
  const k = dkind(R, i);
  if (k === 'gold') { const v = die(R); return v === 1 ? die(R) : v; }
  if (k === 'heavy') return rand(R) < 0.1 ? 6 : die(R);
  return die(R);
}
function specialDice(R, rolled) {
  const D = R.C.dice;
  D.forEach((v, i) => {
    const k = dkind(R, i);
    if (!rolled[i] || (k !== 'twin' && k !== 'stair') || rand(R) >= 1 / 3) return;
    const others = D.filter((x, j) => j !== i);
    if (k === 'twin') {                    // 다른 주사위 중 가장 많이 나온 눈 (같으면 큰 눈)
      const cnt = [0, 0, 0, 0, 0, 0, 0]; others.forEach(x => cnt[x]++);
      let best = 1; for (let f = 1; f <= 6; f++) if (cnt[f] >= cnt[best]) best = f;
      D[i] = best;
    } else {                               // 없는 눈 중 가장 긴 연속을 만드는 눈
      const has = new Set(others);
      let best = D[i], bl = -1;
      for (let f = 1; f <= 6; f++) {
        if (has.has(f)) continue;
        let lo = f, hi = f;
        while (has.has(lo - 1)) lo--;
        while (has.has(hi + 1)) hi++;
        if (hi - lo > bl) { bl = hi - lo; best = f; }
      }
      D[i] = best;
    }
  });
}
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

// ── 족보 카드 ────────────────────────────────────────────────────────────────
// 카드 = { u: 고유 번호, cat: 족보, up: 강화(0/1), kws: [키워드, … 최대 KW_MAX] } (예전 저장본은 kw: 키워드 하나)
export const UPPER = CAT_IDS.slice(0, 6);
export const isUpper = cat => UPPER.includes(cat);
export const KEYWORDS = {
  guard:  { ko: '수호',   icon: 'shield',  color: '#4FB3FF', desc: `방어로 돌린 점수의 보호막 +${GUARD_MUL * 100}%` },
  vamp:   { ko: '흡혈',   icon: 'heart',   color: '#FF5A6A', desc: '공격한 점수의 1/3만큼 체력을 회복한다' },
  burn:   { ko: '화염',   icon: 'fire',    color: '#FF8A1A', desc: `적에게 화상: ${BURN_TURNS}턴 동안 적의 턴이 끝날 때마다 공격한 점수의 1/4 피해` },
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
export const cardTitle = cat => catInfo(cat).ko;
export const CAT_RULE = {
  ones: '1의 개수 × 1', twos: '2의 개수 × 2', threes: '3의 개수 × 3', fours: '4의 개수 × 4', fives: '5의 개수 × 5', sixes: '6의 개수 × 6',
  choice: '주사위 5개 합', four: '같은 눈 4개 → 5개 합', full: '3개 + 2개 → 5개 합',
  sstr: '연속 4개 → 15', lstr: '연속 5개 → 30', yacht: '5개 모두 같음 → 50',
};
export const cardName = c => `${kwsOf(c).map(k => KEYWORDS[k].ko + ' ').join('')}${catInfo(c.cat).ko}${c.up ? '+' : ''}`;
// 희귀도: 1 일반(키워드 없음) · 2 희귀(키워드) · 3 전설(키워드 + 강화, 또는 강화 요트)
export const KW_MAX = 3;                 // 카드 한 장에 붙는 효과는 3개까지 (강화로 하나씩 새긴다)
export const kwsOf = c => c.kws || (c.kw ? [c.kw] : []);
export const hasKw = (c, k) => kwsOf(c).includes(k);
export const cardRarity = c => { const n = kwsOf(c).length; return n >= 2 || (n && c.up) || (c.cat === 'yacht' && c.up) ? 3 : n ? 2 : 1; };
function mkCard(R, cat, up = 0, kws = []) { return { u: ++R.uid, cat, up: up ? 1 : 0, kws: [kws].flat().filter(Boolean) }; }
// 강화할 수 있는 카드: 아직 +30% 강화를 안 했거나, 효과 칸이 남았다
export const canUpgrade = c => !c.up || kwsOf(c).length < KW_MAX;

// ── 원정 성장 (게임 밖 성장) ─────────────────────────────────────────────
// 원정이 끝날 때마다 별조각(✦)을 얻고, 원정 준비에서 영구 강화 · 주사위 세트를 산다. 쌓일수록 원정이 쉬워진다.
export const META = [
  { id: 'hp',    ko: '강인함',     icon: 'heart',  max: 5, cost: [40, 60, 80, 100, 120], desc: n => `원정 시작 최대 체력 +${n * 2}` },
  { id: 'gold',  ko: '여비',       icon: 'coins',  max: 3, cost: [30, 50, 70],           desc: n => `시작 골드 +${n * 20}` },
  { id: 'tools', ko: '도구 주머니', icon: 'flip',  max: 2, cost: [50, 90],               desc: n => (n >= 2 ? '시작 뒤집기 +1 · 조정 +1' : '시작 뒤집기 +1') },
  { id: 'potion', ko: '물약 띠',   icon: 'bag',    max: 1, cost: [80],                   desc: () => '회복 물약 1개를 들고 출발' },
  { id: 'relic', ko: '보물 지도',   icon: 'scroll', max: 1, cost: [200],                  desc: () => '출발할 때 일반 유물 1개 (무작위)' },
  { id: 'sharp', ko: '연마된 덱',   icon: 'axe',    max: 1, cost: [100],                  desc: () => '대표 카드 점수 +30%' },
  { id: 'slot',  ko: '주사위 칸',   icon: 'die6',   max: 2, cost: [60, 150],              desc: n => `특수 주사위 ${n}개를 넣는다` },
];
// 특수 주사위 (눈은 그대로 1~6, 나오는 눈이 다르다). 원정 준비에서 사서 주사위 칸에 넣는다
export const DICE = [
  { id: 'gold',  ko: '금 주사위',     color: '#FFC83D', cost: 80,  desc: '1이 나오면 한 번 더 굴린다' },
  { id: 'heavy', ko: '무거운 주사위', color: '#9AA4B8', cost: 100, desc: '6이 조금 더 자주 나온다 (1/6 → 약 1/4)' },
  { id: 'twin',  ko: '쌍둥이 주사위', color: '#FF9AD0', cost: 120, desc: '1/3 확률로 다른 주사위와 같은 눈 (포카인드 · 요트)' },
  { id: 'stair', ko: '계단 주사위',   color: '#3EE6B4', cost: 120, desc: '1/3 확률로 다른 주사위에 없는 이어지는 눈 (스트레이트)' },
];
export const diceInfo = id => DICE.find(d => d.id === id);
// 원정이 끝나면 얻는 별조각(✦): 지난 층 2 · 엘리트 4 · 보스 10 · 클리어 20, 승천 1단계마다 +10%
export const starsOf = R => Math.round((R.stats.floors * 2 + R.stats.elites * 4 + R.stats.bosses * 10 + (R.won ? 20 : 0)) * (1 + (R.asc || 0) * 0.1));

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
  { id: 'asc5',     ko: '승천자',        icon: 'up',      desc: '승천 5 이상으로 원정을 끝낸다' },
  { id: 'asc10',    ko: '정점',          icon: 'trophy',  desc: '승천 10으로 원정을 끝낸다' },
  { id: 'five',     ko: '다섯 영웅',     icon: 'party',   desc: '서로 다른 직업 5종으로 원정을 끝낸다' },
];
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
export const BASE_DECK = ['choice', 'choice', 'sixes', 'fives', 'full', 'four', 'sstr', 'lstr'];
export const RUN_CLASSES = {
  gambler: { hp: 76, flip: 1, nudge: 1, sig: { cat: 'full', kw: 'gold' }, skill: '배팅',
    get desc() { return `굴리기 전에 손패 1장에 배팅한다. 배팅한 카드를 내면 점수 ×${CLASS_TUNE.betMul}. 전투에서 얻는 골드 +25%`; } },
  monk:    { hp: 80, flip: 0, nudge: 2, sig: { cat: 'choice', kw: 'quick' }, skill: '명상',
    get desc() { return `카드를 낼 때 남은 굴림 1회당 조정 +1 · 보호막 +${CLASS_TUNE.monkBlock}`; } },
  rogue:   { hp: 92, flip: 2, nudge: 0, sig: { cat: 'four', kw: 'pierce' }, skill: '그림자 손',
    get desc() { return `전투를 시작할 때마다 뒤집기 +${CLASS_TUNE.rogueFlip}. 뒤집기를 쓴 턴에 내는 카드는 점수 +${Math.round(CLASS_TUNE.rogueMul * 100)}%, 적 보호막을 무시한다`; } },
  warrior: { hp: 92, flip: 1, nudge: 1, sig: { cat: 'sixes', kw: 'guard' }, skill: '불굴',
    get desc() { return `숫자 카드(에이스~식스) 점수 +${Math.round(CLASS_TUNE.warriorMul * 100)}%. 숫자 카드로 공격하면 공격한 점수의 절반만큼 보호막도 얻는다`; } },
  bard:    { hp: 91, flip: 1, nudge: 2, sig: { cat: 'choice', kw: 'guard' }, skill: '응원가',
    get desc() { return `매 턴 시작에 보호막 +${CLASS_TUNE.bardBlock}. 전투에서 이기면 체력 ${CLASS_TUNE.bardHeal} 회복`; } },
  mage:    { hp: 80, flip: 1, nudge: 1, sig: { cat: 'choice', kw: 'echo' }, skill: '비전 지식',
    get desc() { return `손패 5장. 카드로 공격할 때 손에 남은 카드 1장당 피해 +${CLASS_TUNE.mageBonus} (나눠 내면 공격 비율만큼). 카드 보상을 한 장 더 보고 고른다`; } },
  dancer:  { hp: 79, flip: 1, nudge: 1, sig: { cat: 'choice', kw: 'burn' }, skill: '춤사위',
    get desc() { return `${DANCE_NEED}점 이상 카드를 내면 춤사위 +1 (최대 ${DANCE_CAP}, 원정 내내 유지). 굴린 뒤 써서 모든 주사위 눈 +1 (6은 그대로), 그 턴 카드 점수 +${Math.round(CLASS_TUNE.danceMul * 100)}% (턴당 1번)`; } },
  outlaw:  { hp: 91, flip: 1, nudge: 1, sig: { cat: 'full', kw: 'quick' }, skill: '속전속결',
    get desc() { return `첫 굴림 그대로(다시 굴리지 않고) 카드를 내면 점수 ×${CLASS_TUNE.rushAny}, 포카인드 · 풀하우스 · 스트레이트 · 요트면 ×${CLASS_TUNE.rushMul}. 남은 굴림 1회당 보호막 +${CLASS_TUNE.rushBlock}`; } },
  sharper: { hp: 80, flip: 1, nudge: 1, sig: { cat: 'yacht' }, skill: '밑장빼기',
    get desc() { return `굴린 뒤 주사위 1개를 원하는 눈으로 바꾼다. 턴마다 ${CLASS_TUNE.dealsTurn}번, 전투마다 ${CLASS_TUNE.deals}번까지`; } },
};
// 직업 수치 (sim/run.mjs 로 맞춘다)
export const CLASS_TUNE = { mageBonus: 1, betMul: 1.25, monkBlock: 3, rogueFlip: 2, rogueMul: 0.4, warriorMul: 0.3, bardBlock: 3, bardHeal: 2,
  rushAny: 1.2, rushMul: 1.5, rushBlock: 4, deals: 6, dealsTurn: 2, danceMul: 0.1, gamblerGold: 0.25 };

// ── 유물 (판 내내 켜져 있는 패시브) — 대부분 원래 특성 카드에서 옮겨 왔다 ──
// r: 1 일반 · 2 희귀 · 3 보스
export const RELICS = [
  { id: 'flip',      ko: '뒤집기 두루마리', icon: 'flip',      r: 1, desc: '전투를 시작할 때마다 뒤집기 +1' },
  { id: 'nudge',     ko: '미세 조정',       icon: 'nudge',     r: 1, desc: '전투를 시작할 때마다 조정 +2' },
  { id: 'basic',     ko: '기초 수련',       icon: 'belt',      r: 1, desc: '숫자 카드(에이스~식스) 점수 ×1.3' },
  { id: 'choice',    ko: '선택의 달인',     icon: 'clover',    r: 1, desc: '초이스 점수 ×1.3' },
  { id: 'insure',    ko: '보험',            icon: 'shield',    r: 1, desc: '0점 카드를 내면 보호막 14, 뒤집기 +1' },
  { id: 'iron',      ko: '철갑',            icon: 'dscale',    r: 2, desc: '매 턴 시작에 보호막 +3' },
  { id: 'camp',      ko: '모닥불 주머니',   icon: 'fire',      r: 1, desc: '휴식할 때 체력 20 더 회복' },
  { id: 'purse',     ko: '금화 주머니',     icon: 'coins',     r: 1, desc: '전투에서 얻는 골드 +30%' },
  { id: 'drum',      ko: '전쟁 북',         icon: 'drum',      r: 1, desc: '전투 첫 턴에 내는 카드 점수 ×1.5' },
  { id: 'bone',      ko: '뼈 방패',         icon: 'bone',      r: 1, desc: '전투를 시작할 때 보호막 16' },
  { id: 'lotus',     ko: '연꽃',            icon: 'lotus',     r: 1, desc: '전투에서 이기면 체력 6 회복' },
  { id: 'whet',      ko: '숫돌',            icon: 'axe',       r: 1, desc: '공격 피해 +3 (나눠 내면 공격 비율만큼)' },
  { id: 'full',      ko: '풀하우스 장인',   icon: 'house',     r: 2, desc: '풀하우스 점수 ×1.5' },
  { id: 'straight',  ko: '질주',            icon: 'boot',      r: 2, desc: '스몰 · 라지 스트레이트 점수 ×1.3' },
  { id: 'fourk',     ko: '사냥 본능',       icon: 'wolf',      r: 2, desc: '포카인드 점수 ×1.5' },
  { id: 'lucky',     ko: '행운의 부적',     icon: 'amulet',    r: 2, desc: '매 턴 첫 굴림 뒤, 가장 낮은 주사위 1개를 공짜로 한 번 더 굴린다' },
  { id: 'scholar',   ko: '현자의 눈',       icon: 'eye',       r: 2, desc: '카드 보상을 한 장 더 보고 고른다' },
  { id: 'yacht',     ko: '요트 신봉자',     icon: 'boat',      r: 2, desc: '요트 점수 ×1.5, 전투를 시작할 때마다 뒤집기 +1' },
  { id: 'fang',      ko: '흡혈 송곳니',     icon: 'anger',     r: 2, desc: '공격으로 준 피해의 15%만큼 체력 회복' },
  { id: 'thorn',     ko: '가시 갑옷',       icon: 'swords',    r: 2, desc: '공격받을 때마다 적에게 4 피해' },
  { id: 'heart',     ko: '거인의 심장',     icon: 'heart',     r: 2, desc: '얻을 때 최대 체력 +20' },
  { id: 'hourglass', ko: '모래시계',        icon: 'hourglass', r: 2, desc: '카드를 낼 때 남은 굴림 1회당 보호막 +3' },
  { id: 'horn',      ko: '사냥꾼의 뿔피리', icon: 'horn',      r: 2, desc: '엘리트 · 보스에게 주는 피해 +25%' },
  { id: 'medal',     ko: '훈장',            icon: 'medal',     r: 2, desc: '턴마다 카드 교체 +1' },
  { id: 'scale',     ko: '수호자의 저울',   icon: 'scale',     r: 2, desc: '방어로 돌린 점수의 보호막 +30%' },
  { id: 'reroll',    ko: '재굴림의 반지',   icon: 'recycle',   r: 3, desc: '매 턴 굴림 기회 +1' },
  { id: 'crown',     ko: '지혜의 왕관',     icon: 'crown',     r: 3, desc: '손패 +1' },
  { id: 'sixth',     ko: '여섯 번째 주사위', icon: 'star',     r: 3, desc: '주사위 6개를 굴려 가장 좋은 5개로 계산. 대신 굴림 기회 -1' },
  { id: 'midas',     ko: '황금손',          icon: 'hand',      r: 3, desc: '매 턴 시작에 조정 +1' },
  { id: 'phoenix',   ko: '불사조 깃털',     icon: 'sparkle',   r: 3, desc: '쓰러지면 한 번, 최대 체력의 40%로 되살아난다' },
  { id: 'chalice',   ko: '생명의 성배',     icon: 'trophy',    r: 3, desc: '얻을 때 최대 체력 +30, 체력 모두 회복' },
  // 낮은 족보를 살리는 유물 (덱 방향을 정한다 — 가지면 같은 계열 카드 · 유물이 더 자주 나온다)
  { id: 'ace',       ko: '에이스의 긍지',   icon: 'die1',      r: 2, desc: '에이스 카드: 1의 눈 하나를 8점으로 센다' },
  { id: 'small',     ko: '작은 수의 힘',    icon: 'die2',      r: 2, desc: '에이스 · 듀스 · 트레이 카드 점수 ×2.5' },
  { id: 'pairs',     ko: '수집가의 상자',   icon: 'bag',       r: 1, desc: '숫자 카드는 맞는 주사위 1개당 +3점' },
  { id: 'quad',      ko: '쌍둥이 별',       icon: 'pair4',     r: 2, desc: '숫자 카드에 맞는 주사위가 4개 이상이면 점수 ×2' },
  { id: 'flow',      ko: '질풍',            icon: 'rainbow',   r: 2, desc: '스몰 스트레이트 기본 25점 · 라지 스트레이트 기본 45점' },
  { id: 'combo',     ko: '연환',            icon: 'link',      r: 2, desc: '스트레이트 카드로 공격하면 피해가 두 번 들어간다' },
];
// 덱 방향: 숫자 카드(에이스~식스) · 스트레이트
export const NUM_RELICS = ['basic', 'ace', 'small', 'pairs', 'quad'];
export const STR_RELICS = ['straight', 'flow', 'combo'];
export function synergy(R) {
  return { num: NUM_RELICS.filter(id => hasRelic(R, id)).length + (R.cls === 'warrior' ? 1 : 0), str: STR_RELICS.filter(id => hasRelic(R, id)).length };
}
export const relicInfo = id => RELICS.find(r => r.id === id);
export const hasRelic = (R, id) => R.relics.includes(id);

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
// ai: 'random' 무작위(같은 행동 세 번 연속 없음) · 'cycle' 차례대로. 보스는 rage(체력 절반 아래) 행동 목록이 따로 있다
export const HEX = {
  burn:    { ko: '화염 숨결',  icon: 'fire',   desc: () => '첫 굴림 뒤 가장 높은 주사위 1개가 1로 탄다' },
  freeze:  { ko: '얼음',       icon: 'snow',   desc: n => `첫 굴림 뒤 주사위 ${n}개가 얼어 다시 굴릴 수 없다 (뒤집기 · 조정은 된다)` },
  seal:    { ko: '봉인',       icon: 'chain',  desc: n => `첫 굴림 뒤 주사위 ${n}개가 봉인된다 (잡기 · 뒤집기 · 조정 불가, 다시 굴리면 풀림)` },
  twist:   { ko: '운명 비틀기', icon: 'vortex', desc: n => `두 번째 굴림 뒤 주사위 ${n}개가 뒤집힌다 (7-눈)` },
  reverse: { ko: '운명 역전',  icon: 'vortex', desc: () => '두 번째 굴림 뒤 가장 많이 나온 눈이 전부 뒤집힌다 (7-눈)' },
  drums:   { ko: '전쟁의 북',  icon: 'drum',   desc: () => '이번 턴 굴림 기회 -1' },
  gaze:    { ko: '응시',       icon: 'eye',    desc: n => `손패 ${n}장을 노려본다. 노려본 카드는 점수 0` },
  haki:    { ko: '패기',       icon: 'anger',  desc: () => '이번 턴 뒤집기 · 조정 · 춤사위 · 밑장빼기 금지' },
  poison:  { ko: '독 안개',    icon: 'toxic',  desc: () => '이번 턴 15점 이하 공격은 피해 절반' },
};
const H = (t, n = 1) => ({ t, n });
const MV = (ko, o = {}) => ({ ko, ...o });
export const ENEMIES = {
  // 1막 — 어둠의 숲
  slime:    { ko: '슬라임', act: 1, kind: 'normal', hp: [52, 58], ai: 'random', moves: [
    MV('몸통 박치기', { atk: 8 }), MV('끈적이는 점액', { atk: 5, hex: H('freeze') }), MV('부풀기', { block: 8, str: 1 })] },
  goblin:   { ko: '고블린 약탈꾼', act: 1, kind: 'normal', hp: [56, 62], ai: 'random', moves: [
    MV('단검 찌르기', { atk: 9 }), MV('주머니 털기', { atk: 6, steal: 10 }), MV('방패 들기', { block: 10, atk: 4 })] },
  bat:      { ko: '동굴 박쥐', act: 1, kind: 'normal', hp: [44, 50], ai: 'random', moves: [
    MV('날개 할퀴기', { atk: 5, hits: 2 }), MV('흡혈', { atk: 6, heal: 6 }), MV('초음파', { atk: 4, hex: H('seal') })] },
  wolf:     { ko: '숲 늑대', act: 1, kind: 'normal', hp: [58, 64], ai: 'random', moves: [
    MV('물어뜯기', { atk: 10 }), MV('울부짖기', { str: 2, block: 5 }), MV('연속 물기', { atk: 5, hits: 2 })] },
  shaman:   { ko: '고블린 주술사', act: 1, kind: 'elite', hp: [112, 120], ai: 'cycle', moves: [
    MV('저주 인형', { atk: 9, hex: H('twist') }), MV('불꽃 화살', { atk: 14 }), MV('봉인 주문', { atk: 7, hex: H('seal') }), MV('마력 방패', { block: 14, str: 2 })] },
  mimic:    { ko: '미믹', act: 1, kind: 'elite', hp: [120, 130], ai: 'cycle', moves: [
    MV('덥석 물기', { atk: 16 }), MV('혀 휘감기', { atk: 7, hex: H('seal', 2) }), MV('뚜껑 닫기', { block: 18 }), MV('금화 삼키기', { atk: 10, steal: 15 })] },
  // 2막 — 얼어붙은 폐허
  skeleton: { ko: '해골 병사', act: 2, kind: 'normal', hp: [78, 86], ai: 'random', moves: [
    MV('녹슨 칼', { atk: 13 }), MV('뼈 방패', { block: 14, atk: 5 }), MV('뼈 던지기', { atk: 7, hits: 2 })] },
  ghost:    { ko: '원혼', act: 2, kind: 'normal', hp: [70, 78], ai: 'random', moves: [
    MV('원망의 눈길', { atk: 10, hex: H('gaze') }), MV('흐려지기', { block: 16 }), MV('비명', { atk: 16 })] },
  wisp:     { ko: '서리 정령', act: 2, kind: 'normal', hp: [72, 80], ai: 'random', moves: [
    MV('서리 입김', { atk: 9, hex: H('freeze', 2) }), MV('냉기 폭발', { atk: 17 }), MV('얼음 갑옷', { block: 12, str: 1 })] },
  knight:   { ko: '망령 기사', act: 2, kind: 'elite', hp: [146, 156], ai: 'cycle', moves: [
    MV('공포의 기세', { atk: 13, hex: H('haki') }), MV('대검 내려치기', { atk: 21 }), MV('검은 방패', { block: 18 }), MV('삼연참', { atk: 7, hits: 3 })] },
  golem:    { ko: '고대 골렘', act: 2, kind: 'elite', hp: [170, 180], ai: 'cycle', moves: [
    MV('바위 피부', { block: 24 }), MV('지진', { atk: 11, hex: H('drums') }), MV('분쇄', { atk: 24 }), MV('가동', { str: 2, block: 8 })] },
  // 3막 — 마왕성
  imp:      { ko: '임프', act: 3, kind: 'normal', hp: [92, 100], ai: 'random', moves: [
    MV('화염구', { atk: 12, hex: H('burn') }), MV('장난질', { atk: 10, hex: H('twist') }), MV('꼬리 찌르기', { atk: 6, hits: 3 })] },
  hound:    { ko: '지옥견', act: 3, kind: 'normal', hp: [100, 110], ai: 'random', moves: [
    MV('물어뜯기', { atk: 16 }), MV('연속 물기', { atk: 8, hits: 2 }), MV('지옥의 울음', { str: 2, block: 8 })] },
  gargoyle: { ko: '가고일', act: 3, kind: 'normal', hp: [108, 118], ai: 'random', moves: [
    MV('석화', { block: 22 }), MV('내려찍기', { atk: 21 }), MV('돌날개', { block: 12, atk: 10 })] },
  shade:    { ko: '그림자 암살자', act: 3, kind: 'elite', hp: [172, 182], ai: 'cycle', moves: [
    MV('그림자 난도질', { atk: 6, hits: 4 }), MV('그림자 사슬', { atk: 11, hex: H('seal', 2) }), MV('독 바른 칼', { atk: 10, weak: 2 }), MV('어둠 속으로', { block: 18 })] },
  champion: { ko: '마족 근위대장', act: 3, kind: 'elite', hp: [180, 190], ai: 'cycle', moves: [
    MV('도륙', { atk: 22 }), MV('철벽', { block: 20, str: 2 }), MV('위압', { atk: 15, hex: H('haki') }), MV('회전 베기', { atk: 9, hits: 3 })] },

  // ── 막 보스 (협동 보스 8종을 원정 전투에 맞게) ──
  dragon:   { ko: '화염룡 이그니스', act: 1, kind: 'boss', hp: [170, 170], ai: 'cycle', moves: [
    MV('화염 숨결', { atk: 10, hex: H('burn') }), MV('할퀴기', { atk: 6, hits: 2 }), MV('용린 갑옷', { block: 16 }), MV('포효', { atk: 6, str: 2 })],
    rage: [MV('화염 숨결', { atk: 12, hex: H('burn') }), MV('불바다', { atk: 8, hits: 2, hex: H('burn') }), MV('용린 갑옷', { block: 18 })] },
  orc:      { ko: '오크 대장 그로크', act: 1, kind: 'boss', hp: [160, 160], ai: 'cycle', moves: [
    MV('전쟁의 북', { atk: 7, hex: H('drums') }), MV('대도끼', { atk: 12 }), MV('약탈', { atk: 6, steal: 12, heal: 5 }), MV('함성', { str: 1, block: 8 })],
    rage: [MV('전쟁의 북', { atk: 8, hex: H('drums') }), MV('대도끼', { atk: 14 }), MV('광폭화', { atk: 5, hits: 3 })] },
  lich:     { ko: '리치 왕 모르가스', act: 1, kind: 'boss', hp: [172, 172], ai: 'cycle', moves: [
    MV('운명 비틀기', { atk: 11, hex: H('twist') }), MV('뼈 방패', { block: 20 }), MV('영혼 흡수', { atk: 11, heal: 10 }), MV('해골 소환', { str: 2, block: 8 })],
    rage: [MV('운명 비틀기', { atk: 12, hex: H('twist', 2) }), MV('영혼 흡수', { atk: 13, heal: 12 }), MV('뼈 방패', { block: 22 })] },
  hydra:    { ko: '세머리 용 트리글라브', act: 2, kind: 'boss', hp: [250, 250], ai: 'heads', moves: [
    MV('불 머리의 숨결', { atk: 13, hex: H('burn'), head: 'fire' }), MV('얼음 머리의 숨결', { atk: 11, hex: H('freeze', 2), head: 'ice' }), MV('독 머리의 숨결', { atk: 8, hits: 2, hex: H('poison'), head: 'poison' })] },
  cyclops:  { ko: '키클롭스 폴리페모스', act: 2, kind: 'boss', hp: [230, 230], ai: 'cycle', moves: [
    MV('외눈 응시', { atk: 11, hex: H('gaze') }), MV('바위 투척', { atk: 18 }), MV('약탈', { atk: 9, steal: 15, heal: 10 }), MV('땅 구르기', { atk: 8, hex: H('drums'), block: 10 })],
    rage: [MV('외눈 응시', { atk: 12, hex: H('gaze', 2) }), MV('바위 투척', { atk: 20 }), MV('분노의 발길질', { atk: 7, hits: 3 })] },
  overlord: { ko: '오버로드 네크라스', act: 2, kind: 'boss', hp: [215, 215], ai: 'cycle', moves: [
    MV('사령술', { str: 2, block: 10 }), MV('운명 역전', { atk: 12, hex: H('reverse') }), MV('뼈의 왕좌', { block: 18, atk: 6 }), MV('죽음의 손길', { atk: 16 })],
    rage: [MV('시간 역행', { heal: 30, block: 10, once: true }), MV('운명 역전', { atk: 14, hex: H('reverse') }), MV('죽음의 손길', { atk: 19 }), MV('해골 군단', { atk: 6, hits: 3 })] },
  demon:    { ko: '마왕 릴리스', act: 3, kind: 'boss', hp: [300, 300], ai: 'cycle', moves: [
    MV('봉인', { atk: 13, hex: H('seal') }), MV('패기', { atk: 16, hex: H('haki') }), MV('밤의 춤', { atk: 7, hits: 3 }), MV('어둠의 장막', { block: 24, str: 2 })],
    rage: [MV('이중 봉인', { atk: 14, hex: H('seal', 2) }), MV('패기', { atk: 18, hex: H('haki') }), MV('종말', { atk: 28 }), MV('밤의 춤', { atk: 8, hits: 3 })] },
};
export const enemyInfo = id => ENEMIES[id];
export const ACT_INFO = {
  1: { ko: '어둠의 숲',     normal: ['slime', 'goblin', 'bat', 'wolf'], elite: ['shaman', 'mimic'], boss: ['dragon', 'orc', 'lich'] },
  2: { ko: '얼어붙은 폐허', normal: ['skeleton', 'ghost', 'wisp'], elite: ['knight', 'golem'], boss: ['hydra', 'cyclops', 'overlord'] },
  3: { ko: '마왕성',        normal: ['imp', 'hound', 'gargoyle'], elite: ['shade', 'champion'], boss: ['demon'] },
};
// 밸런스 조절용 배율 [1막, 2막, 3막] — 적 종류별 (sim/run.mjs 가 바꿔 가며 잰다)
export const TUNE = {
  hp:  { normal: [0.92, 0.95, 0.93], elite: [0.75, 0.8, 0.88], boss: [0.75, 0.85, 0.92] },
  atk: { normal: [2.06, 1.94, 1.85], elite: [1.87, 1.81, 1.55], boss: [1.9, 1.85, 1.6] },
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
// meta: 원정 성장 { lv: { hp, gold, tools, potion, relic, sharp, slot }, equip: [특수 주사위 id …] }
export function createRun({ cls = 'gambler', seed = (Math.random() * 2 ** 32) >>> 0, name = '모험가', asc: lv = 0, meta = null } = {}) {
  const k = RUN_CLASSES[cls] ? cls : 'gambler';
  const ci = RUN_CLASSES[k];
  const a = Math.max(0, Math.min(ASC_MAX, Math.floor(Number(lv) || 0)));
  const ml = id => Math.max(0, Math.min(META.find(m => m.id === id).max, Math.floor(meta?.lv?.[id] || 0)));
  const hp = Math.round((ci.hp + ml('hp') * 2) * (a >= 6 ? 0.92 : 1));
  const R = {
    v: 1, seed: seed >>> 0, rng: seed >>> 0, uid: 0, asc: a, feats: [],
    cls: k, name, hp, maxHp: hp, gold: 0,
    flip: ci.flip, nudge: ci.nudge, dance: k === 'dancer' ? 1 : 0,
    deck: [], relics: [], potions: [],
    act: 1, map: null, pos: null, boss: null, path: [],
    phase: 'map', C: null, reward: null, shop: null, event: null, pick: null,
    removes: 0, fx: [], log: [],
    stats: { fights: 0, elites: 0, bosses: 0, dmg: 0, maxHit: 0, taken: 0, healed: 0, turns: 0, cards: 0, gold: 0, floors: 0, atkSum: 0, atkN: 0 },
    ended: false, won: false, last: null,
  };
  for (const cat of BASE_DECK) R.deck.push(mkCard(R, cat));
  R.deck.push(mkCard(R, ci.sig.cat, 0, ci.sig.kw || []));
  // 원정 성장
  R.gold += ml('gold') * 20;
  if (ml('tools') >= 1) R.flip = Math.min(TOOL_CAP, R.flip + 1);
  if (ml('tools') >= 2) R.nudge = Math.min(TOOL_CAP, R.nudge + 1);
  for (let n = 0; n < ml('potion'); n++) R.potions.push('heal');
  const sig = R.deck[R.deck.length - 1];
  if (ml('sharp') >= 1) sig.up = 1;
  R.dset = (meta?.equip || []).filter(id => diceInfo(id)).slice(0, ml('slot'));
  newAct(R);
  if (ml('relic')) {
    const id = rollRelic(R, 1);
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
}

// ── 칸 들어가기 ─────────────────────────────────────────────────────────────
export function enterNode(R, id) {
  if (R.phase !== 'map') fail('지금은 지도를 움직일 수 없어요.');
  if (!nextNodes(R).includes(id)) fail('갈 수 없는 칸이에요.');
  const n = mapNode(R, id);
  R.pos = id;
  R.path.push(id);
  R.stats.floors++;
  fx(R, { type: 'enter', node: id, kind: n.type });
  if (n.type === 'fight') return startCombat(R, pickFoe(R, 'normal'));
  if (n.type === 'elite') return startCombat(R, pickFoe(R, 'elite'));
  if (n.type === 'boss') return startCombat(R, R.boss);
  if (n.type === 'shop') { R.phase = 'shop'; R.shop = genShop(R); return; }
  if (n.type === 'rest') { R.phase = 'rest'; return; }
  if (n.type === 'treasure') {
    R.phase = 'reward';
    R.reward = { kind: 'treasure', items: [{ t: 'relic', id: rollRelic(R, weighted(R, { 1: 50, 2: 45, 3: 5 })) }, { t: 'gold', n: int(R, 15, 30) }] };
    return;
  }
  if (n.type === 'event') return startEvent(R);
}
function pickFoe(R, kind) {
  const pool = ACT_INFO[R.act][kind].filter(id => id !== R.lastFoe);
  const id = pick(R, pool);
  R.lastFoe = id;
  return id;
}

// ── 전투 ─────────────────────────────────────────────────────────────────────
export const C_ = R => R.C;
export const handSize = R => HAND + (R.cls === 'mage' ? 1 : 0) + (hasRelic(R, 'crown') ? 1 : 0);
export const diceCount = R => (hasRelic(R, 'sixth') ? 6 : 5);
export function maxRolls(R) {
  const C = R.C;
  let n = ROLLS + (hasRelic(R, 'reroll') ? 1 : 0) - (hasRelic(R, 'sixth') ? 1 : 0) + (C?.extraRolls || 0);
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
  const hp = Math.round(int(R, def.hp[0], def.hp[1]) * hpMul);
  const e = { id: foeId, hp, maxHp: hp, block: 0, str: 0, weak: 0, burn: 0, burnT: 0, mi: -1, intent: null, raged: false, last: [], cut: def.ai === 'heads' ? {} : null, regrew: false };
  R.C = {
    e, turn: 0, phase: 'roll',
    draw: shuffle(R, R.deck.map(c => ({ ...c }))), hand: [], discard: [], top: [],
    dice: [], held: [], rolled: false, rollNo: 0, rollsLeft: 0, dealtTurn: 0,
    block: 0, weak: 0, swaps: 0, flipped: false, bet: null, danced: false,
    deals: R.cls === 'sharper' ? CLASS_TUNE.deals : 0,
    hex: null, sealed: [], frozen: [], gazed: [], pure: false, power: false, extraRolls: 0,
    dealt: 0, taken: 0,
  };
  R.phase = 'combat';
  R.stats.fights += def.kind === 'normal' ? 1 : 0;
  // 전투 시작 효과 (유물 · 직업)
  if (R.cls === 'rogue') addTool(R, 'flip', CLASS_TUNE.rogueFlip);
  if (hasRelic(R, 'flip')) addTool(R, 'flip', 1);
  if (hasRelic(R, 'yacht')) addTool(R, 'flip', 1);
  if (hasRelic(R, 'nudge')) addTool(R, 'nudge', 2);
  fx(R, { type: 'combat', foe: foeId, kind: def.kind, hp });
  log(R, `${def.ko} 등장!`);
  chooseIntent(R);
  startTurn(R);
  if (hasRelic(R, 'bone')) { R.C.block += 16; fx(R, { type: 'heroBlock', n: 16, why: 'bone' }); }
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
    i = pick(R, opts);
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
  if (m.atk) out.push({ k: 'atk', n: atkOf(R, m.atk), hits: m.hits || 1 });
  if (m.block) out.push({ k: 'block', n: m.block });
  if (m.str) out.push({ k: 'str', n: m.str });
  if (m.heal) out.push({ k: 'heal', n: m.heal });
  if (m.steal) out.push({ k: 'steal', n: m.steal });
  if (m.weak) out.push({ k: 'weak', n: m.weak });
  return out;
}
// 적 한 대의 실제 공격력 (힘 · 막 배율 · 약화 반영)
export function atkOf(R, base) {
  const e = R.C.e;
  const kind = ENEMIES[e.id].kind;
  const am = (kind === 'normal' && asc(R, 2) ? 1.1 : 1) * (kind === 'elite' && asc(R, 8) ? 1.15 : 1) * (kind === 'boss' && asc(R, 9) ? 1.1 : 1);
  const v = Math.round((base + e.str) * TUNE.atk[kind][R.act - 1] * am);
  return e.weak > 0 ? Math.floor(v / 2) : v;
}
export const incoming = R => { const m = R.C?.e?.intent; return m?.atk ? atkOf(R, m.atk) * (m.hits || 1) : 0; };

function startTurn(R) {
  const C = R.C;
  C.turn++;
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
  C.swaps = 1 + (hasRelic(R, 'medal') ? 1 : 0);
  C.hex = C.e.intent?.hex ? { ...C.e.intent.hex } : null;
  const n = diceCount(R);
  C.dice = new Array(n).fill(0);
  C.held = new Array(n).fill(false);
  C.rollsLeft = maxRolls(R);
  fx(R, { type: 'turn', n: C.turn });
  if (R.cls === 'bard') { C.block += CLASS_TUNE.bardBlock; fx(R, { type: 'heroBlock', n: CLASS_TUNE.bardBlock, why: 'bard' }); }
  if (hasRelic(R, 'iron')) { C.block += 3; fx(R, { type: 'heroBlock', n: 3, why: 'iron' }); }
  if (hasRelic(R, 'midas')) addTool(R, 'nudge', 1);
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
  }
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

export function roll(R) {
  const C = inCombat(R);
  if (C.rollsLeft <= 0) fail('굴림 기회를 다 썼어요.');
  if (C.rolled && C.held.every((h, i) => h || isSealed(R, i) || isFrozen(R, i))) fail('모든 주사위를 잡고 있어요.');
  if (R.cls === 'gambler' && !C.rolled && C.bet == null && C.hand.length) fail('먼저 이번 턴에 배팅할 카드를 고르세요.');
  const rolled = C.dice.map((v, i) => !(C.rolled && (C.held[i] || isSealed(R, i) || isFrozen(R, i))));
  C.dice = C.dice.map((v, i) => (rolled[i] ? rollFace(R, i) : v));
  specialDice(R, rolled);
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
  afterRollHex(R);
}

// 적의 방해가 굴림 직후에 걸린다
function afterRollHex(R) {
  const C = R.C, h = C.hex;
  if (!h || C.pure) return;
  const free = () => C.dice.map((v, i) => i).filter(i => !isSealed(R, i) && !isFrozen(R, i));
  if (C.rollNo === 1) {
    if (h.t === 'burn') {
      const i = free().sort((a, b) => C.dice[b] - C.dice[a])[0];
      if (i != null && C.dice[i] > 1) {
        const from = C.dice.slice();
        C.dice[i] = 1;
        fx(R, { type: 'hexDice', t: 'burn', dice: [i], from, to: 1 });
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

export function toggleHold(R, i) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (i < 0 || i >= C.dice.length) fail('없는 주사위예요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 움직일 수 없어요. 다시 굴리면 풀려요.');
  if (isFrozen(R, i)) fail('얼어붙은 주사위는 이번 턴에 다시 굴릴 수 없어요. 뒤집기 · 조정은 할 수 있어요.');
  C.held[i] = !C.held[i];
}

export function useFlip(R, i) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (R.flip <= 0) fail('뒤집기가 없어요.');
  if (toolsLocked(R)) fail('패기! 이번 턴은 뒤집기를 쓸 수 없어요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 뒤집을 수 없어요.');
  C.dice[i] = 7 - C.dice[i];
  R.flip--;
  C.flipped = true;
}

export function useNudge(R, i, d) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (R.nudge <= 0) fail('조정이 없어요.');
  if (toolsLocked(R)) fail('패기! 이번 턴은 조정을 쓸 수 없어요.');
  if (isSealed(R, i)) fail('봉인된 주사위는 조정할 수 없어요.');
  const v = C.dice[i] + (d > 0 ? 1 : -1);
  if (v < 1 || v > 6) fail('주사위는 1~6 사이여야 해요.');
  C.dice[i] = v;
  R.nudge--;
}

// 카드 교체: 손패 1장을 버리고 새로 1장 (턴마다 1번, 훈장이면 2번)
export function swapCard(R, hi) {
  const C = inCombat(R);
  if (C.swaps <= 0) fail('이번 턴에는 더 바꿀 수 없어요.');
  const c = C.hand[hi];
  if (!c) fail('없는 카드예요.');
  if (C.bet === c.u) fail('배팅한 카드는 바꿀 수 없어요.');
  C.hand.splice(hi, 1);
  C.discard.push(c);
  C.gazed = C.gazed.filter(u => u !== c.u);
  C.swaps--;
  const got = drawCards(R, 1);
  // 새 카드를 같은 자리에
  if (got.length) { const nc = C.hand.pop(); C.hand.splice(hi, 0, nc); }
  fx(R, { type: 'swap', out: c.u, in: got[0] ?? null });
}

export function placeBet(R, hi) {
  const C = inCombat(R);
  if (R.cls !== 'gambler') fail('도박사만 배팅할 수 있어요.');
  if (C.rolled) fail('배팅은 굴리기 전에만 할 수 있어요.');
  const c = C.hand[hi];
  if (!c) fail('없는 카드예요.');
  C.bet = c.u;
  fx(R, { type: 'bet', u: c.u });
}

export const canDance = R => R.cls === 'dancer' && R.phase === 'combat' && R.C?.phase === 'roll' && R.C.rolled && R.dance > 0 && !R.C.danced && !toolsLocked(R);
export function useDance(R) {
  const C = inCombat(R);
  if (!canDance(R)) fail(toolsLocked(R) ? '패기! 이번 턴은 춤출 수 없어요.' : '지금은 춤사위를 쓸 수 없어요.');
  const from = C.dice.slice();
  C.dice = C.dice.map((v, i) => (isSealed(R, i) ? v : Math.min(6, v + 1)));
  R.dance--;
  C.danced = true;
  fx(R, { type: 'dance', from, to: C.dice.slice() });
}

export const canDeal = R => R.cls === 'sharper' && R.phase === 'combat' && R.C?.phase === 'roll' && R.C.rolled && R.C.deals > 0 && (R.C.dealtTurn !== R.C.turn || R.C.dealtN < CLASS_TUNE.dealsTurn) && !toolsLocked(R);
export function useDeal(R, i, v) {
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
}

export function usePotion(R, slot) {
  const C = inCombat(R);
  const id = R.potions[slot];
  if (!id) fail('빈 칸이에요.');
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
}
export const dropPotion = (R, slot) => { R.potions.splice(slot, 1); };

// ── 카드 점수 ────────────────────────────────────────────────────────────────
// 기본 점수(요트 원룰) + 보너스 목록. 보너스는 모두 기본 점수에 대한 배율이라 더해서 쌓는다
// (강화 +30% 와 장인 +50% 가 같이 있으면 +80%). 응시 · 약화 · 독은 마지막에 전체에 곱한다.
export function scoreCard(R, card, dice = R.C?.dice || [], opts = {}) {
  const C = R.C;
  const base = dice.length && !dice.includes(0) ? Math.max(0, ...fiveSets(dice).map(set => baseScore(card.cat, set))) : 0;
  const parts = [];
  // 유물이 기본 점수를 바꾼다 (에이스의 긍지 · 수집가의 상자 · 질풍). 배율은 바뀐 기본 점수에 붙는다
  let adj = base;
  if (base > 0) {
    if (isUpper(card.cat)) {
      const f = UPPER.indexOf(card.cat) + 1, n = Math.round(base / f);
      if (card.cat === 'ones' && hasRelic(R, 'ace')) { parts.push({ ko: '에이스의 긍지', amt: n * 8 - base }); adj = n * 8; }
      if (hasRelic(R, 'pairs')) { parts.push({ ko: '수집가의 상자', amt: n * 3 }); adj += n * 3; }
    } else if (hasRelic(R, 'flow') && (card.cat === 'sstr' || card.cat === 'lstr')) {
      adj = card.cat === 'sstr' ? 25 : 45;
      parts.push({ ko: '질풍', amt: adj - base });
    }
  }
  const add = (ko, mul) => { const amt = Math.round(adj * mul); if (amt) parts.push({ ko, amt }); };
  if (base > 0) {
    if (hasRelic(R, 'small') && ['ones', 'twos', 'threes'].includes(card.cat)) add('작은 수의 힘', 1.5);
    if (hasRelic(R, 'quad') && isUpper(card.cat) && Math.round(base / (UPPER.indexOf(card.cat) + 1)) >= 4) add('쌍둥이 별', 1);
    if (card.up) add('강화', UP_MUL);
    if (hasRelic(R, 'basic') && isUpper(card.cat)) add('기초 수련', 0.3);
    if (hasRelic(R, 'choice') && card.cat === 'choice') add('선택의 달인', 0.3);
    if (hasRelic(R, 'full') && card.cat === 'full') add('풀하우스 장인', 0.5);
    if (hasRelic(R, 'straight') && (card.cat === 'sstr' || card.cat === 'lstr')) add('질주', 0.3);
    if (hasRelic(R, 'fourk') && card.cat === 'four') add('사냥 본능', 0.5);
    if (hasRelic(R, 'yacht') && card.cat === 'yacht') add('요트 신봉자', 0.5);
    if (R.cls === 'warrior' && isUpper(card.cat)) add('불굴', CLASS_TUNE.warriorMul);
    if (C) {
      const first = C.rollNo === 1;
      if (R.cls === 'gambler' && C.bet === card.u) add('배팅', CLASS_TUNE.betMul - 1);
      if (R.cls === 'outlaw' && first) add('속전속결', (RUSH_CATS.includes(card.cat) && isCombo(card.cat, dice) ? CLASS_TUNE.rushMul : CLASS_TUNE.rushAny) - 1);
      if (R.cls === 'dancer' && C.danced) add('춤사위', CLASS_TUNE.danceMul);
      if (R.cls === 'rogue' && C.flipped) add('그림자 손', CLASS_TUNE.rogueMul);
      if (hasKw(card, 'quick') && first) add('속공', 0.5);
      if (hasRelic(R, 'drum') && C.turn === 1) add('전쟁 북', 0.5);
      if (C.power) add('힘의 물약', 0.5);
    }
  }
  let total = base + parts.reduce((a, p) => a + p.amt, 0);
  const notes = [];
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
export function preview(R, hi, want = 'enemy', sc = null) {
  const C = R.C, card = C.hand[hi];
  return splitOut(R, card, sc || scoreCard(R, card), want);
}
function splitOut(R, card, sc, want) {
  const C = R.C, e = C.e;
  const S = sc.total;
  const atk = splitAtk(S, want) ?? S, def = S - atk, share = S > 0 ? atk / S : 0;
  const out = { score: S, atk, def, dmg: 0, pierce: false, block: 0, heal: 0, gold: 0, burn: 0, weak: false, kill: false,
    whet: 0, arcane: 0, combo: false, horn: false, poison: false, defMul: 1, wblk: 0, always: 0 };
  if (atk > 0) {
    if (hasRelic(R, 'whet')) out.whet = Math.round(3 * share);
    if (R.cls === 'mage') out.arcane = Math.round((C.hand.length - 1) * CLASS_TUNE.mageBonus * share);
    let d = atk + out.whet + out.arcane;
    if (hasRelic(R, 'combo') && (card.cat === 'sstr' || card.cat === 'lstr')) { d *= 2; out.combo = true; }
    if (hasRelic(R, 'horn') && isBossKind(e)) { d = Math.round(d * 1.25); out.horn = true; }
    if (hexActive(R, 'poison') && d <= 15) { d = Math.floor(d / 2); out.poison = true; }
    out.dmg = d;
    out.pierce = hasKw(card, 'pierce') || (R.cls === 'rogue' && C.flipped);
    const through = out.pierce ? d : Math.max(0, d - e.block);
    out.kill = through >= e.hp;
    if (hasKw(card, 'vamp')) out.heal += Math.floor(atk / 3);
    if (hasRelic(R, 'fang')) out.heal += Math.floor(through * 0.15);
    if (hasKw(card, 'gold')) out.gold = Math.floor(atk / 3);
    if (hasKw(card, 'burn')) out.burn = Math.floor(atk / 4);
    if (hasKw(card, 'weak')) out.weak = atk * 2 >= S;
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
  out.block += out.always;
  return { ...out, sc };
}
// 다음 적 공격의 총 피해 (보호막 빼기 전). weak: 이번 카드로 약화를 걸 때
export function incomingAfter(R, weak = false) {
  const e = R.C?.e, m = e?.intent;
  if (!m?.atk) return 0;
  let per = atkOf(R, m.atk);
  if (weak && !(e.weak > 0)) per = Math.floor(per / 2);
  return per * (m.hits || 1);
}
// 이 미리보기대로 내면 다음 적의 턴에 잃을 체력
export const takenAfter = (R, p) => Math.max(0, incomingAfter(R, p.weak) - R.C.block - p.block);
// 다음 공격을 다 막으면서 공격에 쓸 수 있는 가장 큰 점수. 다 못 막으면 { atk: 0, full: false }
export function coverAtk(R, hi, sc = null) {
  const card = R.C.hand[hi];
  sc ||= scoreCard(R, card);
  for (let a = sc.total; a >= 0; a--) if (!takenAfter(R, splitOut(R, card, sc, a))) return { atk: a, full: true };
  return { atk: 0, full: false };
}

export function playCard(R, hi, target) {
  const C = inCombat(R);
  if (!C.rolled) fail('먼저 주사위를 굴려 주세요.');
  const card = C.hand[hi];
  if (!card) fail('없는 카드예요.');
  if (target !== 'enemy' && target !== 'self' && !(typeof target === 'number' && Number.isFinite(target))) fail('공격할지 방어할지 골라 주세요.');
  const p = preview(R, hi, target);
  C.hand.splice(hi, 1);
  R.stats.cards++;
  const ev = { type: 'play', u: card.u, cat: card.cat, kws: kwsOf(card), up: card.up, target: p.atk > 0 ? 'enemy' : 'self', atk: p.atk, def: p.def,
    score: p.score, parts: p.sc.parts, base: p.sc.base, notes: p.sc.notes, dmg: 0, blocked: 0, block: 0, heal: 0, gold: 0 };
  fx(R, ev);
  // 피해
  if (p.atk > 0 && p.dmg > 0) {
    const r = hitEnemy(R, p.dmg, { pierce: p.pierce, why: 'card', quiet: true });
    ev.dmg = r.dmg; ev.blocked = r.blocked;
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
  if (p.heal) ev.heal = healHero(R, p.heal, 'card', true);
  if (p.gold) { R.gold += p.gold; R.stats.gold += p.gold; ev.gold = p.gold; }
  if (p.burn) { C.e.burn += p.burn; C.e.burnT = BURN_TURNS; ev.burn = p.burn; }
  if (p.weak) { C.e.weak = 1; ev.weak = true; }
  if (hasKw(card, 'lucky')) ev.flip = addTool(R, 'flip', 1);
  if (p.score === 0 && hasRelic(R, 'insure')) addTool(R, 'flip', 1);
  if (R.cls === 'monk' && C.rollsLeft > 0) ev.nudge = addTool(R, 'nudge', C.rollsLeft);
  if (R.cls === 'dancer' && p.score >= DANCE_NEED && R.dance < DANCE_CAP) { R.dance++; ev.dance = true; }
  // 카드는 버린 더미로 (메아리는 다음 턴 손패로)
  (hasKw(card, 'echo') ? C.top : C.discard).push(card);
  checkFeats(R);
  log(R, `${cardName(card)} ${[p.atk > 0 ? `공격 ${p.dmg}` : '', p.block ? `방어 ${p.block}` : ''].filter(Boolean).join(' · ') || '0점'}`);
  if (C.e.hp <= 0) return winCombat(R);
  enemyTurn(R);
}

// 적에게 피해. 보호막이 먼저 깎인다 (관통은 무시)
function hitEnemy(R, amount, { pierce = false, why = '', quiet = false } = {}) {
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
  if (def.kind !== 'boss' || e.raged || e.hp <= 0 || e.hp * 2 >= e.maxHp) return;
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
  const dmg = Math.min(R.hp, left);
  R.hp -= dmg;
  R.stats.taken += dmg;
  if (C) C.taken += dmg;
  return { dmg, blocked };
}

function enemyTurn(R) {
  const C = R.C, e = C.e;
  C.phase = 'enemy';
  // 남은 손패는 버린 더미로
  // 남은 손패는 버린 더미로 (보존 카드는 손패에 남는다)
  const out = C.hand.filter(c => !hasKw(c, 'keep'));
  if (out.length) { fx(R, { type: 'discard', us: out.map(c => c.u) }); C.discard.push(...out); }
  C.hand = C.hand.filter(c => hasKw(c, 'keep'));
  C.sealed = []; C.frozen = []; C.gazed = [];
  e.block = 0;                        // 적 보호막은 적의 턴이 시작될 때 사라진다
  if (C.weak > 0) C.weak--;            // 영웅 약화는 영웅 턴 수로 센다
  const fury = furyOf(R);
  const m = e.intent;
  const act = { type: 'enemy', ko: m?.ko || '', hits: [], block: 0, str: 0, heal: 0, steal: 0, weak: 0, behead: !m };
  if (m) {
    if (m.atk) {
      const per = atkOf(R, m.atk);
      for (let k = 0; k < (m.hits || 1); k++) {
        const r = hurtHero(R, per, 'atk');
        act.hits.push(r);
        if (hasRelic(R, 'thorn') && e.hp > 0) { const t = hitEnemy(R, 4, { pierce: true, quiet: true }); act.thorn = (act.thorn || 0) + t.dmg; }
        if (R.hp <= 0 || e.hp <= 0) break;
      }
      e.weak = 0;
    }
    if (m.block) { e.block += m.block; act.block = m.block; }
    if (m.str) { e.str += m.str; act.str = m.str; }
    if (m.heal) { const h = Math.min(m.heal, e.maxHp - e.hp); e.hp += h; act.heal = h; }
    if (m.steal) { const s = Math.min(R.gold, m.steal); R.gold -= s; act.steal = s; }
    if (m.weak) { C.weak = Math.max(C.weak, m.weak); act.weak = m.weak; }
  }
  fx(R, act);
  if (R.hp <= 0 && !revive(R)) return loseRun(R);
  if (e.hp <= 0) return winCombat(R);     // 가시 갑옷으로 쓰러짐
  // 화상
  if (e.burnT > 0 && e.burn > 0) {
    hitEnemy(R, e.burn, { pierce: true, why: 'burn' });
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
    if (R.act >= ACTS) { feat(R, 'clear'); if (asc(R, 5)) feat(R, 'asc5'); if (asc(R, 10)) feat(R, 'asc10'); }
  }
  checkFeats(R);
  if (R.cls === 'bard') healHero(R, CLASS_TUNE.bardHeal, 'bard');
  if (hasRelic(R, 'lotus')) healHero(R, 6, 'lotus');
  if (def.kind === 'boss' && R.act >= ACTS) { R.phase = 'won'; R.ended = true; R.won = true; fx(R, { type: 'runWon' }); return; }
  R.phase = 'reward';
  R.reward = genReward(R, def.kind);
}

// ── 보상 ─────────────────────────────────────────────────────────────────────
const CAT_W = { choice: 14, four: 12, full: 14, sstr: 12, lstr: 10, yacht: 6, sixes: 8, fives: 6, fours: 4, threes: 2, twos: 1, ones: 1 };
const KW_W = { guard: 14, vamp: 12, burn: 12, pierce: 10, quick: 12, lucky: 10, weak: 8, gold: 8, echo: 10, keep: 10 };
// 덱 방향 유물이 있으면 그 계열 카드가 더 자주 나온다
function catWeights(R) {
  const w = { ...CAT_W }, sy = synergy(R);
  if (sy.num) for (const c of UPPER) w[c] *= 1 + sy.num * 1.5;
  if (hasRelic(R, 'ace')) w.ones *= 4;
  if (hasRelic(R, 'small')) { w.ones *= 3; w.twos *= 3; w.threes *= 3; }
  if (sy.str) { w.sstr *= 1 + sy.str; w.lstr *= 1 + sy.str; }
  return w;
}
export function rollCard(R, rarity) {
  const cat = weighted(R, catWeights(R));
  if (rarity === 1) return mkCard(R, cat);
  const kw = weighted(R, KW_W);
  if (rarity === 2) return mkCard(R, cat, 0, kw);
  if (rand(R) < 0.3) return mkCard(R, 'yacht', 1, rand(R) < 0.5 ? kw : null);
  if (rand(R) < 0.35) { let k2 = weighted(R, KW_W); if (k2 === kw) k2 = weighted(R, KW_W); return mkCard(R, cat, 0, k2 === kw ? [kw] : [kw, k2]); }
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
  const wt = id => 1 + (NUM_RELICS.includes(id) ? sy.num * 2 : 0) + (STR_RELICS.includes(id) ? sy.str * 2 : 0);
  for (const rr of [Number(r), 2, 1, 3]) {
    const pool = RELICS.filter(x => x.r === rr && !own.has(x.id));
    if (pool.length) return weighted(R, Object.fromEntries(pool.map(x => [x.id, wt(x.id)])));
  }
  return null;
}
const rollPotion = R => pick(R, POTIONS).id;
function goldMul(R) { return 1 + (hasRelic(R, 'purse') ? 0.3 : 0) + (R.cls === 'gambler' ? CLASS_TUNE.gamblerGold : 0); }
function genReward(R, kind) {
  const items = [];
  const g = kind === 'boss' ? int(R, 70, 85) + R.act * 10 : kind === 'elite' ? int(R, 28, 36) + R.act * 6 : int(R, 12, 18) + R.act * 4;
  items.push({ t: 'gold', n: Math.round(g * goldMul(R)) });
  if (kind === 'elite') items.push({ t: 'relic', id: rollRelic(R, weighted(R, { 1: 60, 2: 40 })) });
  if (kind === 'boss' && R.act < ACTS) {
    const opts = [];
    for (let k = 0; k < 3; k++) { const id = rollRelic(R, 3, opts); if (id) opts.push(id); }
    if (opts.length) items.push({ t: 'relicPick', opts });
  }
  if (rand(R) < (kind === 'normal' ? 0.4 : 0.6)) items.push({ t: 'potion', id: rollPotion(R) });
  if (kind === 'normal' && rand(R) < 0.3) items.push({ t: rand(R) < 0.5 ? 'flip' : 'nudge', n: 1 });
  if (kind !== 'boss' || R.act < ACTS) items.push({ t: 'card', opts: cardOffer(R, kind) });
  return { kind, items: items.filter(it => it.t !== 'relic' || it.id) };
}

function inReward(R) { if (R.phase !== 'reward' || !R.reward) fail('보상을 받을 때가 아니에요.'); return R.reward; }
// 보상 하나 받기. choice: 카드 · 유물 고르기 보상에서 고른 번호 (-1 = 건너뛰기)
export function takeReward(R, idx, choice = 0) {
  const rw = inReward(R);
  const it = rw.items[idx];
  if (!it || it.done) fail('이미 받은 보상이에요.');
  if (it.t === 'gold') { R.gold += it.n; R.stats.gold += it.n; }
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
}
export function gainRelic(R, id) {
  if (!id || hasRelic(R, id)) return;
  R.relics.push(id);
  if (id === 'heart') { R.maxHp += 20; R.hp += 20; }
  if (id === 'chalice') { R.maxHp += 30; R.hp = R.maxHp; }
  fx(R, { type: 'relic', id });
}
// 보상 화면을 떠난다 (남은 보상은 버린다). 보스 보상이면 다음 막으로
export function leaveReward(R) {
  const rw = inReward(R);
  R.reward = null;
  R.C = null;
  if (rw.kind === 'boss') {
    if (R.act >= ACTS) { R.phase = 'won'; R.ended = true; R.won = true; fx(R, { type: 'runWon' }); return; }
    R.act++;
    const heal = Math.round((R.maxHp - R.hp) * (asc(R, 5) ? 0.4 : ACT_HEAL));
    R.hp += heal;
    newAct(R);
    fx(R, { type: 'act', act: R.act, heal });
    return;
  }
  R.phase = 'map';
}

// ── 상점 ─────────────────────────────────────────────────────────────────────
export const PRICE = { card: { 1: 48, 2: 76, 3: 140 }, relic: { 1: 140, 2: 200, 3: 300 }, potion: 40, flip: 30, nudge: 20, remove: 60, removeStep: 20 };
function genShop(R) {
  const cards = [rollCard(R, 1), rollCard(R, 2), rollCard(R, Number(weighted(R, { 1: 30, 2: 50, 3: 20 })))];
  const jitter = p => Math.round(p * (0.9 + rand(R) * 0.2) * (asc(R, 7) ? 1.25 : 1));
  return {
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
export function startSmith(R) {
  if (R.phase !== 'shop' || !R.shop) fail('상점이 아니에요.');
  if (R.shop.smithed) fail('이 상점에서는 이미 강화했어요.');
  startUpgrade(R, 'shop', smithPrice(R));
}
export const removePrice = R => Math.round((PRICE.remove + R.removes * PRICE.removeStep) * (asc(R, 7) ? 1.25 : 1));
export function buy(R, kind, idx) {
  if (R.phase !== 'shop' || !R.shop) fail('상점이 아니에요.');
  const list = { card: R.shop.cards, relic: R.shop.relics, potion: R.shop.potions, tool: R.shop.tools }[kind];
  const it = list?.[idx];
  if (!it || it.sold) fail('이미 팔린 물건이에요.');
  if (R.gold < it.price) fail('골드가 모자라요.');
  if (kind === 'potion' && R.potions.length >= POTION_SLOTS) fail('물약 칸이 가득 찼어요.');
  if (kind === 'tool' && R[it.kind] >= TOOL_CAP) fail(`더 들 수 없어요 (최대 ${TOOL_CAP}).`);
  R.gold -= it.price;
  it.sold = true;
  if (kind === 'card') { R.deck.push({ ...it.c }); fx(R, { type: 'gainCard', u: it.c.u }); }
  if (kind === 'relic') gainRelic(R, it.id);
  if (kind === 'potion') R.potions.push(it.id);
  if (kind === 'tool') addTool(R, it.kind, 1);
  fx(R, { type: 'buy', kind });
}
export function startRemove(R) {
  if (R.phase !== 'shop' || R.shop.removed) fail('카드 제거는 상점마다 한 번이에요.');
  if (R.gold < removePrice(R)) fail('골드가 모자라요.');
  if (R.deck.length <= 5) fail('덱이 너무 작아요 (최소 5장).');
  R.pick = { why: 'remove', cost: removePrice(R), from: 'shop' };
}
export function leaveShop(R) {
  if (R.phase !== 'shop') fail('상점이 아니에요.');
  R.shop = null; R.pick = null;
  R.phase = 'map';
}

// ── 휴식 ─────────────────────────────────────────────────────────────────────
export const restAmount = R => Math.round(R.maxHp * (asc(R, 4) ? 0.2 : REST_HEAL)) + (hasRelic(R, 'camp') ? 20 : 0);
export function restHeal(R) {
  if (R.phase !== 'rest') fail('휴식처가 아니에요.');
  healHero(R, restAmount(R), 'rest');
  R.phase = 'map';
}
export function startUpgrade(R, from = 'rest', cost = 0) {
  if (!R.deck.some(canUpgrade)) fail('강화할 카드가 없어요.');
  if (cost && R.gold < cost) fail('골드가 모자라요.');
  R.pick = { why: 'upgrade', from, cost };
}
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
export function chooseUpgrade(R, k) {
  const pk = R.pick;
  if (!pk || pk.why !== 'upgrade' || !pk.opts) fail('고를 때가 아니에요.');
  const c = R.deck.find(x => x.u === pk.u), o = pk.opts[k];
  if (!c || !o) fail('없는 선택이에요.');
  if (o === 'up') c.up = 1;
  else { c.kws = [...kwsOf(c), o]; delete c.kw; }
  if (pk.cost) { R.gold -= pk.cost; R.smiths = (R.smiths || 0) + 1; if (R.shop) R.shop.smithed = true; }
  fx(R, { type: 'upgrade', u: c.u, opt: o });
  R.pick = null;
  if (pk.from === 'rest') R.phase = 'map';
  if (pk.from === 'event') finishEvent(R, pk.done);
}
// 덱에서 카드 한 장 고르기 (강화 · 제거 · 복제)
export function pickDeck(R, u) {
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
    if (pk.cost) { R.gold -= pk.cost; R.removes++; R.shop.removed = true; }
    if (pk.hp) hurtHero(R, pk.hp, 'event');
    fx(R, { type: 'remove', u });
  }
  if (pk.why === 'dup') {
    const nc = { ...c, u: ++R.uid };
    R.deck.push(nc);
    fx(R, { type: 'gainCard', u: nc.u });
  }
  R.pick = null;
  if (pk.from === 'event') finishEvent(R, pk.done);
}
export function cancelPick(R) {
  const pk = R.pick;
  if (!pk) return;
  R.pick = null;
  if (pk.from === 'event') finishEvent(R, '그만두고 떠났다.');
}

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
  E_('fairy', '길 잃은 요정', 'sparkle', '날개를 다친 요정이 울고 있다. 상처를 돌봐 주자 요정이 고마워한다.', [
    O('축복을 받는다', '최대 체력 +8', R => { R.maxHp += 8; R.hp += 8; return '따뜻한 빛이 감싼다. 최대 체력 +8.'; }),
    O('선물을 받는다', '뒤집기 +2 · 조정 +2', R => { addTool(R, 'flip', 2); addTool(R, 'nudge', 2); return '요정이 반짝이는 가루를 뿌려 주었다.'; })]),
];
export const eventDef = id => EVENTS.find(e => e.id === id);
function startEvent(R) {
  const seen = new Set(R.seenEvents || []);
  let pool = EVENTS.filter(e => !seen.has(e.id));
  if (!pool.length) { R.seenEvents = []; pool = EVENTS; }
  const ev = pick(R, pool);
  R.seenEvents = [...(R.seenEvents || []), ev.id];
  R.phase = 'event';
  R.event = { id: ev.id, result: null, dice: null, fight: null };
}
export function eventChoose(R, k) {
  if (R.phase !== 'event' || !R.event || R.event.result != null || R.pick) fail('지금은 고를 수 없어요.');
  const o = eventDef(R.event.id).opts[k];
  if (!o) fail('없는 선택지예요.');
  if (!o.can(R)) fail('지금은 고를 수 없는 선택지예요.');
  const text = o.go(R);
  R.event.choice = k;
  if (text != null) R.event.result = text;
  if (R.hp <= 0 && !revive(R)) loseRun(R);
}
// 결과를 보고 지도로 (또는 이벤트 전투로)
export function eventLeave(R) {
  if (R.phase !== 'event') fail('이벤트가 아니에요.');
  const fight = R.event?.fight;
  R.event = null;
  if (fight) return startCombat(R, fight);
  R.phase = 'map';
}
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
  const eAvg = moves.reduce((a, m) => a + (m.atk ? atkOf(R, m.atk) * (m.hits || 1) : 0), 0) / moves.length;
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
    const up = card.cat;
    if (card.up) mul += UP_MUL;
    if (hasRelic(R, 'basic') && isUpper(up)) mul += 0.3;
    if (hasRelic(R, 'choice') && up === 'choice') mul += 0.3;
    if (hasRelic(R, 'full') && up === 'full') mul += 0.5;
    if (hasRelic(R, 'straight') && (up === 'sstr' || up === 'lstr')) mul += 0.3;
    if (hasRelic(R, 'fourk') && up === 'four') mul += 0.5;
    if (hasRelic(R, 'yacht') && up === 'yacht') mul += 0.5;
    if (R.cls === 'warrior' && isUpper(up)) mul += CLASS_TUNE.warriorMul;
    if (R.cls === 'gambler' && C.bet === card.u) mul += CLASS_TUNE.betMul - 1;
    if (R.cls === 'outlaw' && first) mul += (RUSH_CATS.includes(up) ? CLASS_TUNE.rushMul : CLASS_TUNE.rushAny) - 1;   // 큰 족보는 점수가 나면 곧 완성
    if (R.cls === 'dancer' && C.danced) mul += CLASS_TUNE.danceMul;
    if (R.cls === 'rogue' && C.flipped) mul += CLASS_TUNE.rogueMul;
    if (hasKw(card, 'quick') && first) mul += 0.5;
    if (hasRelic(R, 'drum') && C.turn === 1) mul += 0.5;
    if (C.power) mul += 0.5;
    if (hasRelic(R, 'small') && ['ones', 'twos', 'threes'].includes(up)) mul += 1.5;
    if (C.weak > 0) mul *= 0.75;
    return {
      cat: up, mul, face: isUpper(up) ? UPPER.indexOf(up) + 1 : 0, ace: up === 'ones' && hasRelic(R, 'ace'), pairs: hasRelic(R, 'pairs'),
      quad: hasRelic(R, 'quad') ? (C.weak > 0 ? 0.75 : 1) : 0, flow: hasRelic(R, 'flow') && (up === 'sstr' || up === 'lstr'),
      combo: hasRelic(R, 'combo') && (up === 'sstr' || up === 'lstr'), zero: C.gazed.includes(card.u) && !C.pure,
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
    if (info.combo) d *= 2;
    if (info.horn) d = Math.round(d * 1.25);
    if (info.poison && d <= 15) d = Math.floor(d / 2);
    const through = info.pierce ? d : Math.max(0, d - e.block);
    if (through >= e.hp) return 1000 + through;
    weak = info.weak && a * 2 >= s;
    v += through * ctx.k + (info.vamp ? Math.min(a / 3, ctx.miss) * 0.8 : 0) + (info.burn ? a / 2 * ctx.k : 0) + (info.gold ? a / 10 : 0);
  }
  const blk = (s - a) * info.dmul + (info.wblk ? a / 2 : 0);
  const taken = Math.max(0, (weak ? ctx.raw / 2 : ctx.raw) - ctx.have - blk);
  return v + (ctx.base - taken) * ctx.bw;
}
function fastValue(R, info, s, ctx) {
  if (s <= 0) return 0;
  let best = fastSplit(R, info, s, s, ctx);
  if (best >= 1000 || !ctx.base) return best;
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
  const raw = fastBase(info.cat, dice);
  if (raw <= 0) return 0;
  let adj = raw, mul = info.mul;
  if (info.face) {
    const n = Math.round(raw / info.face);
    if (info.ace) adj = n * 8;
    if (info.pairs) adj += n * 3;
    if (n >= 4) mul += info.quad;
  } else if (info.flow) adj = info.cat === 'sstr' ? 25 : 45;
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
    v += through * ctx.k + p.burn * 2 * ctx.k + p.gold * 0.1;
  }
  return v + (ctx.base - takenAfter(R, p)) * ctx.bw + Math.min(p.heal, ctx.miss) * 0.8;
}
function bestPlay(R) {
  const C = R.C, ctx = botCtx(R);
  let best = { v: -Infinity, hi: 0, atk: 'enemy' };
  C.hand.forEach((card, hi) => {
    const sc = scoreCard(R, card), S = sc.total;
    for (const a of new Set([S, 0, Math.ceil(S / 2), coverAtk(R, hi, sc).atk])) {
      const v = playValue(R, preview(R, hi, a, sc), ctx);
      if (v > best.v + 1e-9) best = { v, hi, atk: a };
    }
  });
  return best;
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
    let hi = 0;
    C.hand.forEach((c, k) => { if (CARD_EV[c.cat] * (c.up ? 1.3 : 1) > CARD_EV[C.hand[hi].cat] * (C.hand[hi].up ? 1.3 : 1)) hi = k; });
    return { type: 'bet', hi };
  }
  if (!C.rolled) return { type: 'roll' };
  const n = C.dice.length;
  const ctx = botCtx(R);
  const cur = prepHand(R, C.rollNo);
  const now = handFast(R, cur, C.dice, ctx);
  // 첫 굴림 뒤, 가망 없는 카드(0점인 작은 숫자 카드 · 요트)는 한 장 바꾼다
  if (C.swaps > 0 && C.rollNo === 1) {
    const dead = C.hand.findIndex(c => C.bet !== c.u && ['ones', 'twos', 'threes', 'yacht'].includes(c.cat) && fastBase(c.cat, C.dice) === 0);
    if (dead >= 0) return { type: 'swap', hi: dead };
  }
  if (!toolsLocked(R) && (R.flip > 0 || R.nudge > 0)) {
    let bg = C.rollsLeft === 0 ? 4 : R.cls === 'rogue' ? 7 : 12, ba = null;
    const flipHand = R.cls === 'rogue' && !C.flipped ? cur.map(x => ({ ...x, mul: x.mul + CLASS_TUNE.rogueMul, pierce: true })) : cur;
    for (let i = 0; i < n; i++) {
      if (isSealed(R, i)) continue;
      if (R.flip > 0) { const nd = C.dice.slice(); nd[i] = 7 - nd[i]; const g = handFast(R, flipHand, nd, ctx) - now; if (g > bg) { bg = g; ba = { type: 'flip', i }; } }
      if (R.nudge > 0) for (const d of [-1, 1]) {
        const v = C.dice[i] + d; if (v < 1 || v > 6) continue;
        const nd = C.dice.slice(); nd[i] = v; const g = handFast(R, cur, nd, ctx) - now; if (g > bg) { bg = g; ba = { type: 'nudge', i, d }; }
      }
    }
    if (ba) return ba;
  }
  if (canDeal(R) && (C.rollsLeft === 0 || now >= 30)) {
    // 이번 턴에 두 번 바꿀 수 있으면 두 개를 함께 바꾸는 경우까지 본다 (3개 같은 눈 → 요트 같은 큰 그림)
    const two = Math.min(C.deals, CLASS_TUNE.dealsTurn - (C.dealtTurn === C.turn ? C.dealtN || 0 : 0)) >= 2;
    let bg = 1, ba = null;
    for (let i = 0; i < n; i++) {
      if (isSealed(R, i)) continue;
      for (let v = 1; v <= 6; v++) {
        if (v === C.dice[i]) continue;
        const nd = C.dice.slice(); nd[i] = v;
        const g = handFast(R, cur, nd, ctx) - now;
        if (g > bg) { bg = g; ba = { type: 'deal', i, v }; }
        if (two) for (let j = i + 1; j < n; j++) {
          if (isSealed(R, j)) continue;
          for (let w = 1; w <= 6; w++) {
            if (w === C.dice[j]) continue;
            const n2 = nd.slice(); n2[j] = w;
            const g2 = handFast(R, cur, n2, ctx) - now - 3;      // 두 번 쓰는 값
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
    if (up - now > 5 || (C.rollsLeft === 0 && up > now + 1)) return { type: 'dance' };
  }
  if (C.rollsLeft > 0 && now < 1000) {
    const next = prepHand(R, C.rollNo + 1);
    const all = (1 << n) - 1;
    const fixed = [...C.sealed, ...C.frozen].reduce((m, i) => m | (1 << i), 0);
    let bm = all, bv = now;
    for (let mask = 0; mask < all; mask++) {
      if ((mask & fixed) !== fixed) continue;
      let t = 0;
      for (let k = 0; k < samples; k++) {
        const nd = C.dice.map((v, i) => (mask & (1 << i) ? v : 1 + Math.floor(rng() * 6)));
        t += handFast(R, next, nd, ctx);
      }
      const v = t / samples;
      if (v > bv + 0.5) { bv = v; bm = mask; }
    }
    if (bm !== all) return { type: 'reroll', hold: [...Array(n)].map((_, i) => !!(bm & (1 << i)) && !isSealed(R, i) && !isFrozen(R, i)) };
  }
  const b = bestPlay(R);
  return { type: 'play', hi: b.hi, target: b.atk };
}
export function applyCombat(R, a) {
  switch (a.type) {
    case 'roll': return roll(R);
    case 'reroll': R.C.held = a.hold.slice(); return roll(R);
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
const CARD_EV = { choice: 23, four: 9, full: 10, sstr: 11, lstr: 10, yacht: 6, sixes: 12.6, fives: 10.5, fours: 8.4, threes: 6.3, twos: 4.2, ones: 2.1 };
const KW_V = { guard: 4, vamp: 5, burn: 6, pierce: 3, quick: 4, lucky: 3, weak: 3, gold: 2, echo: 3, keep: 4 };
export function botCardValue(R, c) {
  let v = CARD_EV[c.cat] * (c.up ? 1 + UP_MUL : 1);
  if (R.cls === 'warrior' && isUpper(c.cat)) v *= 1.5;
  const sy = synergy(R);
  if (isUpper(c.cat)) {
    if (hasRelic(R, 'pairs')) v += (CARD_EV[c.cat] / (UPPER.indexOf(c.cat) + 1)) * 3;
    if (c.cat === 'ones' && hasRelic(R, 'ace')) v *= 6;
    if (hasRelic(R, 'small') && ['ones', 'twos', 'threes'].includes(c.cat)) v *= 2.5;
    if (hasRelic(R, 'quad')) v *= 1.3;
  }
  if ((c.cat === 'sstr' || c.cat === 'lstr') && sy.str) v *= 1 + (hasRelic(R, 'flow') ? 0.6 : 0) + (hasRelic(R, 'combo') ? 0.8 : 0);
  for (const k of kwsOf(c)) v += KW_V[k];
  // 이미 있는 카드와 겹치면 조금 덜
  const same = R.deck.filter(x => x.cat === c.cat).length;
  return v - same * 1.5;
}
// 원정 진행(지도 · 보상 · 상점 · 휴식 · 이벤트)을 한 걸음 진행한다
export function botRunStep(R, rng = Math.random) {
  if (R.pick) {
    const pk = R.pick;
    if (pk.opts) {                       // 강화 고르기: 효과 값이 가장 큰 것 (이미 강화했으면)
      const v = o => (o === 'up' ? 6 : KW_V[o] + (o === 'keep' ? 1 : 0));
      return chooseUpgrade(R, pk.opts.indexOf(pk.opts.slice().sort((a, b) => v(b) - v(a))[0]));
    }
    const cands = R.deck.filter(c => (pk.why === 'upgrade' ? canUpgrade(c) : true));
    if (!cands.length) return cancelPick(R);
    const sorted = cands.slice().sort((a, b) => botCardValue(R, a) - botCardValue(R, b));
    return pickDeck(R, (pk.why === 'remove' ? sorted[0] : sorted[sorted.length - 1]).u);
  }
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
    if (it.t === 'relicPick') return takeReward(R, k, 0);
    return takeReward(R, k);
  }
  if (R.phase === 'shop') {
    const sh = R.shop;
    if (!sh.removed && R.gold >= removePrice(R) && R.deck.length > 7 && R.deck.some(c => botCardValue(R, c) < 7)) return startRemove(R);
    const relic = sh.relics.findIndex(x => !x.sold && x.price <= R.gold);
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
