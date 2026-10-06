// 요트 히어로즈 룰 엔진.
// 요트(Yacht) 주사위 12라운드 + 경험치·레벨업·특성 카드 + 공용 퀘스트 보드 + 라운드 이벤트.
// DOM/네트워크 의존이 없는 순수 로직이라 브라우저, Node 테스트, 밸런스 시뮬레이션에서 똑같이 돈다.
// 상태는 전부 평범한 JSON(난수 상태 포함)이라 나중에 온라인 모드에서 그대로 동기화할 수 있다.

export const ROUNDS = 12;
export const BASE_ROLLS = 3;          // 요트 원룰: 1번 굴리고 2번 다시 굴림
export const UPPER_BONUS = 35;
export const UPPER_NEED = 63;
export const MAX_LEVEL = 10;
export const LEVEL_POINTS = 3;        // 최종 점수: (레벨-1) × 3
export const ZERO_XP = 8;             // 0점 기록 시 위로 경험치
export const QUEST_SLOTS = 3;

// 레벨 L → L+1 에 필요한 경험치. 초반엔 자주, 후반엔 드물게 오른다.
export const xpToNext = level => 25 + 15 * (level - 1);

// ── 요트 점수표 ──────────────────────────────────────────────────────────────
export const CATS = [
  { id: 'ones',   ko: '에이스',       up: 1 },
  { id: 'twos',   ko: '듀스',         up: 2 },
  { id: 'threes', ko: '트레이',       up: 3 },
  { id: 'fours',  ko: '포',           up: 4 },
  { id: 'fives',  ko: '파이브',       up: 5 },
  { id: 'sixes',  ko: '식스',         up: 6 },
  { id: 'choice', ko: '초이스',       hint: '5개 합' },
  { id: 'four',   ko: '포카인드',     hint: '같은 눈 4개 → 5개 합' },
  { id: 'full',   ko: '풀하우스',     hint: '3개+2개 → 5개 합' },
  { id: 'sstr',   ko: '스몰 스트레이트', hint: '연속 4개 → 15' },
  { id: 'lstr',   ko: '라지 스트레이트', hint: '연속 5개 → 30' },
  { id: 'yacht',  ko: '요트',         hint: '5개 모두 같음 → 50' },
];
export const CAT_IDS = CATS.map(c => c.id);
export const catInfo = id => CATS.find(c => c.id === id);
const UPPER_IDS = CAT_IDS.slice(0, 6);

export function diceInfo(d) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let sum = 0;
  for (const v of d) { counts[v]++; sum += v; }
  const has = v => counts[v] > 0;
  const run = (a, n) => { for (let i = 0; i < n; i++) if (!has(a + i)) return false; return true; };
  const shape = counts.filter(c => c > 0).sort((a, b) => b - a);
  return {
    counts, sum,
    maxCount: Math.max(...counts),
    distinct: shape.length,
    shape: shape.join(''),
    small: run(1, 4) || run(2, 4) || run(3, 4),
    large: run(1, 5) || run(2, 5),
  };
}

// 요트 원룰 점수 (주사위 5개 기준)
export function baseScore(cat, d) {
  const x = diceInfo(d);
  switch (cat) {
    case 'choice': return x.sum;
    case 'four':   return x.maxCount >= 4 ? x.sum : 0;
    case 'full':   return x.shape === '32' ? x.sum : 0;
    case 'sstr':   return x.small ? 15 : 0;
    case 'lstr':   return x.large ? 30 : 0;
    case 'yacht':  return x.maxCount === 5 ? 50 : 0;
    default: {
      const f = catInfo(cat).up;
      return x.counts[f] * f;
    }
  }
}

// 주사위가 6개(전설 특성)일 때는 5개를 고르는 모든 경우 중 가장 좋은 것을 쓴다
export function fiveSets(d) {
  if (d.length <= 5) return [d];
  return d.map((_, skip) => d.filter((__, i) => i !== skip));
}

// ── 직업 ─────────────────────────────────────────────────────────────────────
// 직업 수치 (봇 1대1 시뮬레이션으로 다른 직업과 승률이 비슷하게 맞춘 값 — big/classes 시뮬레이션)
//   danceNeed: 무희 춤사위 버프를 얻는 기록 점수 (25 → 승률 약 50%)
//   betMul: 도박사 배팅 성공 배율 (×1.45 → 승률 약 47%, ×1.5 는 약 56%)
//   rushMul: 무법자 속전속결 배율 (첫 굴림에 족보를 완성해 바로 적으면 점수 ×배율 · ×1.4 → 승률 약 50%, ×1.5 는 약 56%)
//   dealMin / dealMinEarly: 타짜 봇이 밑장빼기를 쓰는 최소 이득 (마지막 굴림 / 굴림이 남았을 때)
export const CLASS_TUNE = { danceNeed: 25, betMul: 1.45, rushMul: 1.4, dealMin: 6, dealMinEarly: 15 };
export const CLASSES = [
  { id: 'warrior', ko: '전사',     icon: '🗡️', color: '#FF6B5B',
    desc: '상단 보너스 조건이 63 → 50점으로 쉬워진다' },
  { id: 'rogue',   ko: '도적',     icon: '🗝️', color: '#3EE6B4',
    desc: '뒤집기 1회를 들고 시작한다' },
  { id: 'mage',    ko: '마법사',   icon: '🔮', color: '#B36BFF',
    desc: '얻는 경험치 +30%' },
  { id: 'bard',    ko: '음유시인', icon: '🎻', color: '#4FB3FF',
    desc: '의뢰를 깬 턴에 기록하는 점수 +1, 의뢰 보상 조정 +1' },
  { id: 'gambler', ko: '도박사',   icon: '🎲', color: '#FFC83D',
    desc: `배팅: 매 라운드 굴리기 전에 족보 하나를 고른다. 그 족보에 적으면 점수 ×${CLASS_TUNE.betMul}, 다른 칸에 적거나 0점이면 점수 없음` },
  { id: 'monk',    ko: '수도승',   icon: '📿', color: '#FF9A1F',
    desc: '점수를 기록할 때 남은 굴림 1회당 조정 +1' },
  { id: 'dancer',  ko: '무희',     icon: '💃', color: '#FF6FB5',
    desc: `춤사위: ${CLASS_TUNE.danceNeed}점 이상 기록하면 버프 1개 (쌓임). 굴린 뒤 써서 모든 주사위 눈 +1 (6은 그대로) · 라운드당 1번` },
  { id: 'outlaw',  ko: '무법자',   icon: '🤠', color: '#E08A3C',
    get desc() { return `속전속결: 첫 굴림 그대로(다시 굴리지 않고) 포카인드 · 풀하우스 · 스몰/라지 스트레이트 · 요트 중 하나를 완성해 적으면 그 점수 ×${CLASS_TUNE.rushMul}. 다른 칸은 효과 없음`; } },
  { id: 'sharper', ko: '타짜',     icon: '🃏', color: '#4FD6C8',
    desc: '밑장빼기: 굴린 뒤 주사위 1개를 원하는 눈으로 바꾼다 (라운드당 1번). 대신 이번에 적는 족보로는 경험치를 못 얻는다' },
];
export const classInfo = id => CLASSES.find(c => c.id === id);
// 직업 능력: 클래식 야추에서는 직업이 겉모습뿐이라 능력이 없다
export const ab = p => (p.plain ? null : p.cls);

// 족보 완성 (무법자 속전속결): 포카인드 · 풀하우스 · 스트레이트 · 요트 처럼 모양이 맞아야 점수가 나는 칸
export const RUSH_CATS = ['four', 'full', 'sstr', 'lstr', 'yacht'];
export function isCombo(cat, d) {
  if (!RUSH_CATS.includes(cat) || !d.length || d.includes(0)) return false;
  return fiveSets(d).some(set => baseScore(cat, set) > 0);
}

// ── 특성 카드 (레벨업 보상) ──────────────────────────────────────────────────
// rarity: 1 일반 / 2 희귀 / 3 전설.  max: 중복 획득 한도
export const PERKS = [
  { id: 'flip',     ko: '뒤집기 두루마리', icon: '🔄', rarity: 1, max: 9, desc: '주사위 1개를 반대 면(7-눈)으로 뒤집는 기술 2회 충전' },
  { id: 'nudge',    ko: '미세 조정',       icon: '🎯', rarity: 1, max: 9, desc: '주사위 1개를 ±1 바꾸는 기술 2회 충전' },
  { id: 'basic',    ko: '기초 수련',       icon: '🥋', rarity: 1, max: 2, desc: '상단(에이스~식스) 점수 ×1.2 (기록한 칸에도 소급)' },
  { id: 'choice',   ko: '선택의 달인',     icon: '🍀', rarity: 1, max: 2, desc: '초이스 ×1.35 (기록한 칸에도 소급)' },
  { id: 'fame',     ko: '의뢰 전문가',     icon: '📜', rarity: 1, max: 2, desc: '의뢰 보상(뒤집기·조정)이 두 배' },
  { id: 'fast',     ko: '빠른 성장',       icon: '⚡', rarity: 1, max: 2, desc: '얻는 경험치 +25%' },
  { id: 'insure',   ko: '보험',            icon: '🛡️', rarity: 1, max: 1, desc: '0점을 기록하면 경험치 +20, 뒤집기 +1' },
  { id: 'full',     ko: '풀하우스 장인',   icon: '🏠', rarity: 2, max: 2, desc: '풀하우스 ×1.5 (기록한 칸에도 소급)' },
  { id: 'straight', ko: '질주',            icon: '🏃', rarity: 2, max: 2, desc: '두 스트레이트 ×1.3 (기록한 칸에도 소급)' },
  { id: 'fourk',    ko: '사냥 본능',       icon: '🐺', rarity: 2, max: 2, desc: '포카인드 ×1.5 (기록한 칸에도 소급)' },
  { id: 'reroll',   ko: '재굴림 +1',       icon: '♻️', rarity: 2, max: 2, desc: '매 턴 굴림 기회 +1' },
  { id: 'lucky',    ko: '행운의 부적',     icon: '🧿', rarity: 2, max: 1, desc: '매 굴림에서 나온 1은 한 번 더 굴린다' },
  { id: 'chain',    ko: '연쇄 의뢰',       icon: '⛓️', rarity: 2, max: 1, desc: '한 턴에 퀘스트를 2개까지 깬다' },
  { id: 'scholar',  ko: '현자의 눈',       icon: '👁️', rarity: 2, max: 1, desc: '이후 레벨업 때 카드 4장 중에 고른다' },
  { id: 'sixth',    ko: '여섯 번째 주사위', icon: '🌟', rarity: 3, max: 1, desc: '주사위 6개를 굴려 가장 좋은 5개로 계산. 대신 굴림 기회 -1' },
  { id: 'midas',    ko: '황금손',          icon: '👑', rarity: 3, max: 1, desc: '내 턴이 시작될 때마다 조정 +1' },
  { id: 'yacht',    ko: '요트 신봉자',     icon: '⛵', rarity: 3, max: 1, desc: '요트 ×1.4 (기록한 칸에도 소급), 뒤집기 1회 충전' },
  // 대체 보상 — 고를 만한 특성이 모자랄 때만 나온다 (보유 목록에 남지 않고 즉시 받는다)
  { id: 'toolkit',  ko: '모험가 공구함',   icon: '🧰', rarity: 1, max: 99, instant: true, filler: true, desc: '뒤집기 1회 + 조정 1회 충전' },
  { id: 'nudgeBag', ko: '조정 꾸러미',     icon: '🎒', rarity: 1, max: 99, instant: true, filler: true, desc: '조정 3회 충전' },
  { id: 'bigKit',   ko: '장인의 공구함',   icon: '🎖️', rarity: 2, max: 99, instant: true, filler: true, desc: '뒤집기 2회 + 조정 2회 충전' },
];
// 특정 점수 칸에만 붙는 특성 — 그 칸을 모두 채웠으면 효과가 없으므로 후보에서 뺀다
const PERK_CATS = {
  basic: ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'],
  choice: ['choice'], full: ['full'], straight: ['sstr', 'lstr'], fourk: ['four'], yacht: ['yacht'],
};
// 한 장당 기본 점수에 더하는 배율 (예전 +점수와 평균이 비슷하게: 상단 +2 ≈ ×1.2, 초이스 +8 ≈ ×1.35 …).
// 같은 카드를 두 장 들면 더해진다 (×1.2 두 장 = ×1.4, 곱하지 않는다)
export const PERK_MUL = { basic: 0.2, choice: 0.35, full: 0.5, straight: 0.3, fourk: 0.5, yacht: 0.4 };
const perkMulOf = cat => Object.keys(PERK_CATS).find(id => PERK_CATS[id].includes(cat));
// 기록한 칸의 기본 점수 (보너스 빼고). 예전 저장 판은 기록된 점수로 대신한다
const baseOf = (p, c) => p.base?.[c] ?? p.scores[c];
// 소급 적용이 있어서, 칸이 다 찼어도 점수를 낸 칸이 하나라도 있으면 쓸모가 있다.
// 해당 칸을 모두 0점으로 버렸을 때만 효과가 없다.
export const perkUseless = (p, id) => !!PERK_CATS[id] && PERK_CATS[id].every(c => p.scores[c] === 0);
// 지금 고르면 이미 기록한 칸에 바로 더해질 점수 (카드에 표시)
export const perkRetro = (p, id) => (PERK_CATS[id] || []).filter(c => p.scores[c] > 0).reduce((a, c) => a + Math.round(baseOf(p, c) * (PERK_MUL[id] || 0)), 0);
export const perkInfo = id => PERKS.find(p => p.id === id);
export const RARITY = { 1: { ko: '일반', w: 60 }, 2: { ko: '희귀', w: 30 }, 3: { ko: '전설', w: 10 } };

// ── 퀘스트 (공용 보드, 먼저 깬 사람이 가져간다) ───────────────────────────────
// test(info, dice) → 조건 충족 여부.  diff = 난이도 점수(보상 등급을 정함), xp = 경험치
const Q = (id, ko, icon, desc, diff, xp, test, turn = null) => ({ id, ko, icon, desc, diff, xp, test, turn });
// turn(s): 주사위 말고 이번 턴의 진행(굴린 횟수·도구 사용)도 보는 의뢰
export const QUESTS = [
  Q('pairs',   '쌍둥이 사냥',  '👯', '두 쌍 이상',               3, 10, x => x.counts.filter(c => c >= 2).length >= 2),
  Q('triple',  '삼연격',       '⚔️', '같은 눈 3개 이상',         3, 10, x => x.maxCount >= 3),
  Q('high',    '고지 점령',    '⛰️', '합계 25 이상',             3, 10, x => x.sum >= 25),
  Q('high2',   '용의 둥지',    '🐉', '합계 28 이상',             6, 18, x => x.sum >= 28),
  Q('low',     '낮은 포복',    '🐍', '합계 12 이하',             4, 12, x => x.sum <= 12),
  Q('low2',    '지하 감옥',    '🕳️', '합계 9 이하',              7, 20, x => x.sum <= 9),
  Q('even',    '짝수 기사단',  '🛡️', '모두 짝수',                5, 15, x => x.counts[1] + x.counts[3] + x.counts[5] === 0),
  Q('odd',     '홀수 도적단',  '🗡️', '모두 홀수',                5, 15, x => x.counts[2] + x.counts[4] + x.counts[6] === 0),
  Q('rainbow', '무지개 다리',  '🌈', '5개 모두 다른 눈',         3, 10, x => x.distinct === 5),
  Q('house',   '여관 습격',    '🏠', '풀하우스',                 4, 12, x => x.shape === '32'),
  Q('sstr',    '추격전',       '🏇', '연속 4개',                 3, 10, x => x.small),
  Q('lstr',    '대행진',       '🎺', '연속 5개',                 6, 18, x => x.large),
  Q('quad',    '포위 섬멸',    '🏰', '같은 눈 4개 이상',         7, 20, x => x.maxCount >= 4),
  Q('six3',    '럭키 식스',    '🎰', '6이 3개 이상',             6, 18, x => x.counts[6] >= 3),
  Q('one3',    '뱀눈의 저주',  '💀', '1이 3개 이상',             6, 18, x => x.counts[1] >= 3),
  Q('middle',  '중용의 길',    '☯️', '모두 3 또는 4',            7, 20, x => x.counts[3] + x.counts[4] === 5),
  Q('sum20',   '정확한 저울',  '⚖️', '합계가 정확히 20',         4, 12, x => x.sum === 20),
  Q('sum17',   '행운의 17',    '🍀', '합계가 정확히 17',         4, 12, x => x.sum === 17),
  Q('noSix',   '겸손한 영웅',  '🙇', '6 없이 합계 18 이상',      5, 15, x => x.counts[6] === 0 && x.sum >= 18),
  Q('twoSix',  '쌍검술',       '🤺', '6이 정확히 2개',           2,  8, x => x.counts[6] === 2),
  Q('big3',    '거인 셋',      '🗿', '5 이상이 3개 이상',        3, 10, x => x.counts[5] + x.counts[6] >= 3),
  Q('small4',  '꼬마 원정대',  '🐭', '3 이하가 4개 이상',        3, 10, x => x.counts[1] + x.counts[2] + x.counts[3] >= 4),
  Q('yacht',   '전설의 항해',  '⛵', '요트 (5개 모두 같음)',     12, 30, x => x.maxCount === 5),
  // 은퇴한 의뢰: 새 판에는 나오지 않는다 (예전 저장·온라인 방에 남아 있어도 깨지지 않게 정의는 둔다)
  { ...Q('ends', '양날의 검', '🪓', '1과 6이 둘 다 있음', 2, 8, x => x.counts[1] > 0 && x.counts[6] > 0), retired: true },
  Q('oneShot', '일격필살',     '⚡', '재굴림 없이 풀하우스·스트레이트·포카인드', 7, 20, x => x.shape === '32' || x.small || x.maxCount >= 4, s => (s.rollNo || 0) <= 1),
  Q('bare',    '맨손 승부',    '👊', '뒤집기·조정 없이 합계 25 이상', 4, 12, x => x.sum >= 25, s => !s.toolUsed),
  Q('last',    '막판 역전',    '⏳', '마지막 굴림에서 연속 4개',   5, 15, x => x.small, s => s.rollsLeft === 0),
  Q('twin',    '쌍둥이 별',    '✨', '5와 6이 각각 2개 이상',      4, 12, x => x.counts[5] >= 2 && x.counts[6] >= 2),
  Q('sum15',   '절반의 미학',  '🎖️', '합계가 정확히 15',          4, 12, x => x.sum === 15),
];
export const questInfo = id => QUESTS.find(q => q.id === id);

export function questMet(qid, d, st = null) {
  const q = questInfo(qid);
  if (q.turn && (!st || !q.turn(st))) return false;
  return fiveSets(d).some(s => q.test(diceInfo(s), s));
}

// ── 라운드 이벤트 (매 라운드 1장, 모두에게 적용) ─────────────────────────────
export const EVENTS = [
  { id: 'calm',     ko: '평온한 하루', icon: '🌤️', desc: '특별한 일은 없다' },
  { id: 'festival', ko: '수확 축제',   icon: '🎉', desc: '이번 라운드 경험치 2배' },
  { id: 'fog',      ko: '짙은 안개',   icon: '🌫️', desc: '굴림 기회 -1' },
  { id: 'wind',     ko: '순풍',        icon: '🍃', desc: '굴림 기회 +1' },
  { id: 'bounty',   ko: '현상금',      icon: '💰', desc: '이번 라운드 의뢰 보상 두 배' },
  { id: 'zen',      ko: '명상의 날',   icon: '🧘', desc: '0점을 기록해도 경험치 +20' },
  { id: 'jackpot',  ko: '요트 잭팟',   icon: '🎰', desc: '요트 +50' },
  { id: 'harvest',  ko: '풍년',        icon: '🌾', desc: '상단(에이스~식스) 점수 +5' },
  { id: 'duel',     ko: '결투 대회',   icon: '🏆', desc: '이번 라운드 최고 득점자 뒤집기 +1 · 조정 +1' },
  { id: 'refresh',  ko: '게시판 갱신', icon: '📋', desc: '퀘스트 보드가 전부 새로 바뀐다' },
  { id: 'blessing', ko: '여신의 축복', icon: '✨', desc: '모두 뒤집기 1회 충전' },
  // 마왕전 짝수 라운드 전용 (덱에는 없다)
  { id: 'haki', ko: '패기 발동', icon: '👁️', desc: '마왕의 패기! 이번 라운드 뒤집기·조정 금지' },
];
export const eventInfo = id => EVENTS.find(e => e.id === id);
// 12라운드에 쓸 덱. 평온은 둘, 나머지는 한 장씩 (첫 라운드는 항상 평온)
const EVENT_DECK = ['calm', 'festival', 'fog', 'wind', 'bounty', 'zen', 'jackpot', 'harvest', 'duel', 'refresh', 'blessing'];

// ── 협동모드 보스 ────────────────────────────────────────────────────────────
// 파티 전원이 한 보스를 상대한다. 기록한 점수(상단 보너스 포함)가 곧 피해이고,
// 의뢰 보상(뒤집기·조정)으로 더 좋은 족보를 만들어 피해를 키운다. 12라운드 안에 쓰러뜨리면 승리.
// 난이도 d: 0 쉬움 / 1 보통 / 2 어려움.  능력 수치는 [쉬움, 보통, 어려움] 순서.
export const DIFFS = [
  { id: 0, ko: '쉬움',        hp: 176, color: '#3EE6B4' },
  { id: 1, ko: '보통',        hp: 213, color: '#FFC83D' },
  { id: 2, ko: '어려움',      hp: 244, color: '#E8435A' },
];

// 체력 추가 배율 [보스][난이도][인원-1] — v0.8에서 모든 난이도 승률을 절반으로 낮추며 봇 시뮬레이션으로 맞춘 값.
// v0.17: 보유 한도(뒤집기·조정 3개) 도입과 함께 쉬움·보통 체력 ×1.035 (봇 승률 쉬움 약 28%, 보통 약 15%, 어려움 약 10%)
// (sim/coop.mjs 가 바꿔 가며 잰다)
export const HP_TUNE = {
  dragon: [[1.272, 1.155, 1.129, 1.103], [1.223, 1.164, 1.151, 1.143], [1.1905, 1.159, 1.144, 1.143]],
  orc:    [[1.345, 1.146, 1.131, 1.115], [1.247, 1.121, 1.123, 1.124], [1.172, 1.082, 1.09, 1.1]],
  demon:  [[1.431, 1.322, 1.314, 1.306], [1.213, 1.195, 1.209, 1.222], [1.0937, 1.087, 1.106, 1.1157]],
  lich:   [[1.289, 1.217, 1.171, 1.125], [1.293, 1.324, 1.301, 1.271], [1.3815, 1.415, 1.416, 1.417]],
};
// 강화 보스(보통 · 어려움만)는 원래 보스의 인원별 배율을 그대로 쓰고 hpMul 로 맞춘다
HP_TUNE.hydra = HP_TUNE.dragon; HP_TUNE.cyclops = HP_TUNE.orc; HP_TUNE.overlord = HP_TUNE.lich;

export const BOSSES = [
  {
    id: 'dragon', ko: '화염룡 이그니스', title: '붉은 산의 재앙', color: '#E8435A', hpMul: [1.22, 1.1, 1.01],
    skills: [
      { id: 'breath', icon: '🔥', ko: '화염 숨결',
        desc: d => `4라운드마다 모두의 첫 굴림에서 가장 높은 주사위 1개가 1로 타 버린다` },
      { id: 'scale', icon: '🛡️', ko: '용린 갑옷',
        desc: d => `에이스~식스로 주는 피해가 25% 줄어든다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 화염 숨결을 2라운드마다 쓴다' : '어려움에서만 쓴다' },
    ],
  },
  {
    id: 'orc', ko: '오크 대장 그로크', title: '약탈자 군단의 우두머리', color: '#6BBE45', hpMul: [1.26, 1.17, 1.1],
    skills: [
      { id: 'drums', icon: '🥁', ko: '전쟁의 북',
        desc: d => '3라운드마다 모두의 굴림 기회가 1 줄어든다' },
      { id: 'plunder', icon: '💰', ko: '약탈',
        desc: d => `누군가 0점을 기록하면 체력을 10 회복한다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 약탈 회복량이 두 배' : '어려움에서만 쓴다' },
    ],
  },
  {
    id: 'lich', ko: '리치 왕 모르가스', title: '잊힌 무덤의 주인', color: '#9486FF', hpMul: [1.22, 1.03, 0.87],
    // 운명 비틀기가 두 번째 굴림으로 바뀐 뒤 여럿이 할수록 어려워져서, 인원별로 체력을 따로 깎는다 [1인, 2인, 3인, 4인]
    partyAdj: [[1, 0.95, 0.96, 0.97], [1.01, 0.94, 0.945, 0.95], [1, 0.95, 0.94, 0.93]],
    skills: [
      { id: 'twist', icon: '🌀', ko: '운명 비틀기',
        desc: d => `3라운드마다 두 번째 굴림 직후 주사위 1개를 뒤집어 버린다 (7-눈)` },
      { id: 'bone', icon: '💀', ko: '뼈 방패',
        desc: d => `4라운드마다 인원 1명당 12의 보호막을 두른다 (체력보다 먼저 깎임)` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 운명 비틀기가 주사위 2개를 뒤집는다' : '어려움에서만 쓴다' },
    ],
  },
  // ── 강화 보스: 원래 보스를 어려움으로 깨면 열린다. 보통 · 어려움만 (diffs). 승률은 원래 보스보다 3~5%p 낮게 (sim/coop.mjs) ──
  {
    id: 'hydra', ko: '세머리 용 트리글라브', title: '불 · 얼음 · 독, 세 숨결의 재앙', color: '#7A5CFF', base: 'dragon', diffs: [1, 2], hpMul: [1, 1.2, 1.13],
    partyAdj: [[1, 1, 1, 1], [0.97, 1.025, 1.02, 1.017], [0.99, 1.01, 1.01, 1.01]],
    skills: [
      { id: 'heads', icon: '🐉', ko: '세 머리의 숨결',
        desc: d => '라운드마다 불 → 얼음 → 독 머리가 차례로 숨결을 뿜는다. 불: 첫 굴림의 가장 높은 주사위 1개가 1로 · 얼음: 첫 굴림 뒤 주사위 2개가 얼어 다시 굴릴 수 없다(뒤집기 · 조정은 가능) · 독: 15점 이하 기록은 피해 절반' },
      { id: 'behead', icon: '⚔️', ko: '머리 베기',
        desc: d => `한 번에 ${HYDRA_CUT}점 이상 피해를 주면 그 라운드의 머리가 잘려 다시는 숨결을 뿜지 못한다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 잘린 머리 하나가 다시 자란다 (한 번)' : '어려움에서만 쓴다' },
    ],
  },
  {
    id: 'cyclops', ko: '키클롭스 폴리페모스', title: '외눈으로 전장을 지배하는 거인', color: '#4FA3C8', base: 'orc', diffs: [1, 2], hpMul: [1, 1.1, 1],
    partyAdj: [[1, 1, 1, 1], [1.02, 0.99, 1.01, 1.035], [0.96, 0.98, 1, 1.05]],
    skills: [
      { id: 'gaze', icon: '👁️', ko: '외눈 응시',
        desc: d => '라운드마다 점수표 칸 하나를 노려본다. 그 칸에 적으면 점수는 남지만 피해는 0' },
      { id: 'rock', icon: '🪨', ko: '바위 투척',
        desc: d => '3라운드마다 각자 빈칸 하나에 바위가 떨어져 그 차례엔 그 칸을 쓸 수 없다' },
      { id: 'plunder', icon: '💰', ko: '약탈', desc: d => `누군가 0점을 기록하면 체력을 ${CYCLOPS_PLUNDER} 회복한다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 노려보는 칸이 2개' : '어려움에서만 쓴다' },
    ],
  },
  {
    id: 'overlord', ko: '오버로드 네크라스', title: '죽은 칸을 군대로 일으키는 자', color: '#B8304A', base: 'lich', diffs: [1, 2], hpMul: [1, 0.91, 0.75],
    partyAdj: [[1, 1, 1, 1], [1.055, 0.975, 0.99, 1], [1.09, 0.95, 0.92, 0.9]],
    skills: [
      { id: 'necro', icon: '⚰️', ko: '사령술',
        desc: d => `0점으로 버린 칸 하나마다 해골병이 일어나 라운드가 끝날 때마다 체력을 ${NECRO_HEAL}씩 회복시킨다` },
      { id: 'reverse', icon: '🌀', ko: '운명 역전',
        desc: d => '3라운드마다 두 번째 굴림 직후, 가장 많이 나온 눈이 전부 뒤집힌다 (7-눈)' },
      { id: 'throne', icon: '💀', ko: '뼈의 왕좌',
        desc: d => `4라운드마다 인원 1명당 ${THRONE_SHIELD}의 보호막. 보호막이 남아 있으면 운명 역전이 주사위 1개를 더 뒤집는다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 한 번, 그 라운드에 받은 피해의 절반을 되돌린다 (시간 역행)' : '어려움에서만 쓴다' },
    ],
  },
  {
    // 세 보스의 어려움을 모두 깨면 나타난다. 승률은 다른 보스의 약 70% (봇 시뮬레이션), 보석 보상 1.2배
    id: 'demon', ko: '마왕 릴리스', title: '봉인에서 깨어난 밤의 여왕', color: '#C21E56', hpMul: [1, 1, 1], final: true,
    skills: [
      { id: 'seal', icon: '⛓️', ko: '봉인',
        desc: d => `홀수 라운드: 첫 굴림 뒤 주사위 1개가 봉인되어 재굴림·뒤집기·조정을 할 수 없다 (다시 굴리면 풀림)` },
      { id: 'haki', icon: '👁️', ko: '패기',
        desc: d => '짝수 라운드: 라운드 이벤트 대신 패기 발동 — 뒤집기·조정 금지 (굴림은 그대로)' },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 변신 — 봉인이 주사위 2개로' : '어려움에서만 쓴다' },
    ],
  },
];
export const bossInfo = id => BOSSES.find(b => b.id === id);
export const HYDRA_CUT = 30, CYCLOPS_PLUNDER = 15, NECRO_HEAL = 3, THRONE_SHIELD = 15;
export const HEADS = ['fire', 'ice', 'poison'];
export const HEAD_KO = { fire: '불', ice: '얼음', poison: '독' };
// 세머리 용: 이번 라운드에 숨결을 뿜는 머리 (잘렸으면 null)
export const hydraHead = s => {
  const h = HEADS[(s.round - 1) % 3];
  return s.boss?.id === 'hydra' && !s.boss.cut?.[h] ? h : null;
};
export const isFrozen = (s, i) => !!s.frozen?.includes(i);
// 보스가 고를 수 있는 난이도 (강화 보스는 보통 · 어려움만)
export const bossDiffs = id => bossInfo(id)?.diffs || [0, 1, 2];
// 키클롭스: 이 칸에 적으면 피해 0 / 이번 차례 쓸 수 없는 칸
export const gazed = (s, cat) => s.boss?.id === 'cyclops' && !!s.boss.gaze?.includes(cat);
export const rocked = (s, cat) => s.rock === cat;
// 오버로드: 해골병 수 (파티가 0점으로 버린 칸)
export const skeletons = s => s.players.reduce((a, p) => a + CAT_IDS.filter(id => p.scores[id] === 0).length, 0);
// 봉인·패기 (마왕)
const haki = s => event(s) === 'haki';
export const isSealed = (s, i) => !!s.sealed?.includes(i);
const enraged = s => s.boss.diff === 2 && s.boss.hp * 2 < s.boss.maxHp;
const every = (s, k) => s.round % k === 0;

function bossRollMod(s) {
  const b = s.boss;
  if (!b || b.id !== 'orc') return 0;
  return every(s, 3) ? -1 : 0;
}

// 굴림 직후 보스 능력 — 화염 숨결은 첫 굴림, 운명 비틀기는 두 번째 굴림.
// fx 의 from 은 능력이 바꾸기 전 눈 (화면은 이 눈으로 굴러 멈춘 뒤 불타거나 뒤집히는 연출을 한다)
function bossAfterRoll(s) {
  const b = s.boss;
  if (!b) return;
  const from = s.dice.slice();
  const n = 1;
  if (b.id === 'dragon' && s.rollNo === 1 && (every(s, enraged(s) ? 2 : 4))) {
    const idx = s.dice.map((v, i) => i).sort((x, y) => s.dice[y] - s.dice[x]).slice(0, n);
    idx.forEach(i => (s.dice[i] = 1));
    log(s, `이그니스의 화염 숨결! 주사위 ${n}개가 1로 탔다`);
    fx(s, { type: 'boss', skill: 'breath', dice: idx, from });
  }
  if (b.id === 'demon' && s.rollNo === 1 && s.round % 2 === 1 && s.rollsLeft > 0) {
    const idx = shuffle(s, s.dice.map((v, i) => i)).slice(0, enraged(s) ? 2 : 1);
    s.sealed = idx;
    log(s, `마왕의 봉인! 주사위 ${idx.length}개가 봉인됐다`);
    fx(s, { type: 'boss', skill: 'seal', dice: idx });
  }
  if (b.id === 'hydra' && s.rollNo === 1) {
    const h = hydraHead(s);
    if (h === 'fire') {
      const i = s.dice.map((v, k) => k).sort((x, y) => s.dice[y] - s.dice[x])[0];
      s.dice[i] = 1;
      log(s, '불 머리의 숨결! 주사위 1개가 1로 탔다');
      fx(s, { type: 'boss', skill: 'hfire', dice: [i], from });
    }
    if (h === 'ice' && s.rollsLeft > 0) {
      s.frozen = shuffle(s, s.dice.map((v, k) => k)).slice(0, 2);
      log(s, '얼음 머리의 숨결! 주사위 2개가 얼어붙었다');
      fx(s, { type: 'boss', skill: 'hice', dice: s.frozen.slice() });
    }
  }
  if (b.id === 'overlord' && s.rollNo === 2 && every(s, 3)) {
    // 가장 많이 나온 눈(같으면 큰 눈)을 전부 뒤집는다. 뼈 보호막이 있으면 1개 더
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    s.dice.forEach(v => cnt[v]++);
    const face = [6, 5, 4, 3, 2, 1].sort((x, y) => cnt[y] - cnt[x])[0];
    const idx = s.dice.map((v, k) => k).filter(k => s.dice[k] === face);
    const rest = shuffle(s, s.dice.map((v, k) => k).filter(k => s.dice[k] !== face));
    if (b.shield > 0 && rest.length) idx.push(rest[0]);
    idx.forEach(k => (s.dice[k] = 7 - s.dice[k]));
    log(s, `네크라스의 운명 역전! 주사위 ${idx.length}개가 뒤집혔다`);
    fx(s, { type: 'boss', skill: 'reverse', dice: idx, from });
  }
  if (b.id === 'lich' && s.rollNo === 2 && every(s, 3)) {
    const idx = shuffle(s, s.dice.map((v, i) => i)).slice(0, enraged(s) ? 2 : 1);
    idx.forEach(i => (s.dice[i] = 7 - s.dice[i]));
    log(s, `모르가스가 운명을 비틀었다! 주사위 ${idx.length}개가 뒤집혔다`);
    fx(s, { type: 'boss', skill: 'twist', dice: idx, from });
  }
}

function dealDamage(s, pIdx, amount, source) {
  const b = s.boss;
  if (!b || amount <= 0 || b.hp <= 0) return;
  let left = Math.round(amount);
  const blocked = Math.min(b.shield, left);
  b.shield -= blocked;
  left -= blocked;
  b.hp = Math.max(0, b.hp - left);
  if (b.roundDmg != null) b.roundDmg += left;
  b.dmg[pIdx] = (b.dmg[pIdx] || 0) + amount;
  fx(s, { type: 'damage', player: pIdx, amount: Math.round(amount), blocked, source });
  if (b.hp <= 0 && !s.ended) {
    s.ended = true;
    s.phase = 'over';
    b.won = true;
    log(s, `${bossInfo(b.id).ko} 토벌 성공!`);
    fx(s, { type: 'over', won: true });
  }
}

// 뒤집기·조정 충전 보상. 둘 다 최대 CHARGE_CAP 개까지만 들고 있을 수 있다.
// 넘친 충전은 1개당 경험치 SPILL_XP 로 바꿔 두었다가, 다음에 점수를 기록할 때 함께 받는다 (그 턴에 넘친 건 그 자리에서).
export const CHARGE_CAP = 3, SPILL_XP = 10;
export const SAVE_XP = 5;        // 남은 굴림 1개당 경험치 (수도승 제외)
function addCharges(s, p, r, why) {
  const f = r.flip || 0, n = r.nudge || 0;
  const addF = Math.max(0, Math.min(f, CHARGE_CAP - p.flip)), addN = Math.max(0, Math.min(n, CHARGE_CAP - p.nudge));
  p.flip += addF;
  p.nudge += addN;
  const over = f - addF + (n - addN);
  if (over > 0) p.spill = (p.spill || 0) + over;
  if (f + n > 0) fx(s, { type: 'charge', player: s.players.indexOf(p), flip: addF, nudge: addN, over, why });
}
export const chargeText = r => [r.flip ? `뒤집기 +${r.flip}` : '', r.nudge ? `조정 +${r.nudge}` : ''].filter(Boolean).join(' · ');

// 협동 결과 등급: 남은 라운드가 많을수록 높다
export function coopGrade(s) {
  const b = s.boss;
  if (!b?.won) return 'F';
  const left = ROUNDS - s.round;
  return left >= 3 ? 'S' : left >= 1 ? 'A' : 'B';
}

// ── 난수 (상태에 저장되는 mulberry32) ───────────────────────────────────────
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = s => 1 + Math.floor(rand(s) * 6);
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── 게임 생성 ────────────────────────────────────────────────────────────────
// players: [{ name, cls, bot }]
// opts: { mode: 'versus' | 'coop', boss: 'dragon'|'orc'|'lich', diff: 0~2 }
export function createGame(players, seed = (Math.random() * 2 ** 32) >>> 0, opts = {}) {
  if (players.length < 1 || players.length > 4) throw new Error('1~4명까지 할 수 있습니다.');
  const s = {
    v: 1, rng: seed >>> 0, seed: seed >>> 0,
    round: 1, turn: 0, phase: 'roll',
    players: players.map(p => {
      const cls = classInfo(p.cls) ? p.cls : 'warrior';
      return {
        name: p.name, cls, bot: !!p.bot,
        scores: Object.fromEntries(CAT_IDS.map(id => [id, null])),
        xp: 0, level: 1, perks: {},
        plain: opts.rule === 'classic' || undefined,
        flip: cls === 'rogue' && opts.rule !== 'classic' ? 1 : 0, nudge: 0, dance: 0, danceRound: 0, bet: null,
        offers: [], questsDone: [], roundScore: 0,
        stats: { xpEarned: 0, zeros: 0 },
      };
    }),
    dice: [], held: [], rollsLeft: 0, rolled: false,
    board: [], deck: [], discard: [],
    events: [], log: [], fx: [], ended: false,
    mode: opts.mode === 'coop' ? 'coop' : 'versus', boss: null,
  };
  // 클래식 야추 (대전 전용): 굴림 3번 · 점수표 12칸 · 상단 보너스만. 뒤집기·조정 · 직업 능력 · 의뢰 · 레벨업 · 이벤트 없음
  if (opts.rule === 'classic' && s.mode === 'versus') s.classic = true;
  if (s.mode === 'coop') {
    const id = bossInfo(opts.boss) ? opts.boss : 'dragon';
    const diff = Math.min(2, Math.max(bossDiffs(id)[0], opts.diff | 0));
    // 인원 보정 (난이도별, 봇 시뮬레이션으로 맞춘 값): 인원이 많을수록 레벨업·소급 보너스가 쌓여
    // 파티가 강해지므로 1인당 체력을 조금씩 늘린다
    const party = [[1, 1.045, 1.055, 1.065], [1, 0.99, 0.985, 0.98], [1, 0.96, 0.95, 0.94]][diff][players.length - 1]
      * (bossInfo(id).partyAdj?.[diff][players.length - 1] ?? 1);
    const hp = Math.round(DIFFS[diff].hp * HP_TUNE[id][diff][players.length - 1] * bossInfo(id).hpMul[diff] * party * players.length / 5) * 5;
    s.boss = { id, diff, hp, maxHp: hp, shield: 0, dmg: players.map(() => 0), won: false };
    if (id === 'hydra') s.boss.cut = {};
    if (id === 'overlord') s.boss.roundDmg = 0;
  }
  if (s.classic) {
    s.events = new Array(ROUNDS).fill('calm');
  } else {
    s.deck = shuffle(s, QUESTS.filter(q => !q.retired).map(q => q.id));
    s.board = s.deck.splice(0, QUEST_SLOTS);
    const rest = shuffle(s, [...EVENT_DECK.filter(e => e !== 'calm'), 'calm']);
    s.events = ['calm', ...rest].slice(0, ROUNDS);
  }
  if (s.boss?.id === 'demon') s.events = s.events.map((e, i) => (i % 2 === 1 ? 'haki' : e));
  startTurn(s);
  return s;
}

export const current = s => s.players[s.turn];
export const perkCount = (p, id) => p.perks[id] || 0;
export const event = s => s.events[s.round - 1];
export const diceCount = p => (perkCount(p, 'sixth') ? 6 : 5);

export function maxRolls(s, p = current(s)) {
  let n = BASE_ROLLS + perkCount(p, 'reroll') - perkCount(p, 'sixth');
  if (event(s) === 'wind') n++;
  if (event(s) === 'fog') n--;
  n += bossRollMod(s);
  return Math.max(1, n);
}

function log(s, text) {
  s.log.push({ r: s.round, text });
  if (s.log.length > 80) s.log.shift();
}
const fx = (s, e) => s.fx.push(e);

// 라운드 시작: 세머리 용 머리 재생 · 독 머리 알림, 키클롭스 응시
function bossRoundStart(s) {
  const b = s.boss;
  if (!b || s.ended) return;
  if (b.id === 'hydra') {
    if (enraged(s) && !b.regrew && HEADS.some(h => b.cut[h])) {
      const h = HEADS.find(x => b.cut[x]);
      b.cut[h] = false; b.regrew = true;
      log(s, `트리글라브의 ${HEAD_KO[h]} 머리가 다시 자라났다!`);
      fx(s, { type: 'boss', skill: 'regrow', head: h });
    }
    if (hydraHead(s) === 'poison') {
      log(s, '독 머리의 숨결! 이번 라운드 15점 이하 기록은 피해 절반');
      fx(s, { type: 'boss', skill: 'hpoison' });
    }
  }
  if (b.id === 'cyclops') {
    const open = CAT_IDS.filter(id => s.players.some(p => p.scores[id] === null));
    b.gaze = shuffle(s, open).slice(0, enraged(s) ? 2 : 1);
    if (b.gaze.length) {
      log(s, `폴리페모스가 「${b.gaze.map(c => catInfo(c).ko).join('」「')}」 칸을 노려본다`);
      fx(s, { type: 'boss', skill: 'gaze', cats: b.gaze.slice() });
    }
  }
}

function startTurn(s) {
  const p = current(s);
  s.dice = new Array(diceCount(p)).fill(0);
  s.held = new Array(diceCount(p)).fill(false);
  s.rollsLeft = maxRolls(s, p);
  s.rollNo = 0;
  s.toolUsed = false;
  s.sealed = [];
  s.frozen = [];
  s.rock = null;
  s.rolled = false;
  s.phase = 'roll';
  p.bet = null;                 // 도박사: 라운드마다 새로 배팅
  s.dealt = false;              // 타짜: 이번 차례에 밑장빼기를 했나
  if (s.turn === 0) {
    // 라운드 시작 처리
    const ev = event(s);
    if (ev === 'refresh') {
      s.discard.push(...s.board);
      s.board = [];
      refillBoard(s);
    }
    if (ev === 'blessing') s.players.forEach(pl => addCharges(s, pl, { flip: 1 }, 'blessing'));
    s.players.forEach(pl => (pl.roundScore = 0));
    fx(s, { type: 'round', round: s.round, event: ev });
    bossRoundStart(s);
    if (bossRollMod(s)) {
      log(s, '그로크의 전쟁의 북! 이번 라운드 굴림 기회 -1');
      fx(s, { type: 'boss', skill: 'drums' });
    }
  }
  // 키클롭스 바위 투척: 3라운드마다 내 빈칸 하나 (빈칸이 하나뿐이면 봐준다)
  if (s.boss?.id === 'cyclops' && every(s, 3) && !s.ended) {
    const empty = CAT_IDS.filter(id => p.scores[id] === null);
    if (empty.length >= 2) {
      s.rock = shuffle(s, empty)[0];
      log(s, `폴리페모스의 바위! ${p.name}의 「${catInfo(s.rock).ko}」 칸이 막혔다`);
      fx(s, { type: 'boss', skill: 'rock', cat: s.rock, player: s.turn });
    }
  }
  if (perkCount(p, 'midas')) {
    addCharges(s, p, { nudge: 1 }, 'midas');
    fx(s, { type: 'midas', player: s.turn });
  }
}

function refillBoard(s) {
  while (s.board.length < QUEST_SLOTS) {
    if (!s.deck.length) {
      if (!s.discard.length) break;
      s.deck = shuffle(s, s.discard);
      s.discard = [];
    }
    s.board.push(s.deck.shift());
  }
}

// ── 행동 ─────────────────────────────────────────────────────────────────────
const fail = msg => { throw new Error(msg); };

export function roll(s) {
  if (s.ended || s.phase !== 'roll') fail('지금은 굴릴 수 없습니다.');
  if (s.rollsLeft <= 0) fail('굴림 기회를 다 썼습니다.');
  if (s.rolled && s.held.every((h, i) => h || isFrozen(s, i))) fail('모든 주사위를 잡고 있습니다.');
  const p = current(s);
  if (ab(p) === 'gambler' && !p.bet && !s.rolled) fail('먼저 이번 라운드에 배팅할 족보를 고르세요.');
  // 튜토리얼처럼 결과를 미리 정해 둔 굴림 (s.script = [[눈...], ...])
  const forced = s.script?.length ? s.script.shift() : null;
  s.dice = s.dice.map((v, i) => {
    if (s.rolled && (s.held[i] || isSealed(s, i) || isFrozen(s, i))) return v;
    if (forced) return forced[i];
    let r = die(s);
    if (r === 1 && perkCount(p, 'lucky')) r = die(s);
    return r;
  });
  if (!s.rolled) s.held = s.held.map(() => false);
  s.rolled = true;
  s.rollsLeft--;
  s.rollNo = (s.rollNo || 0) + 1;
  if (s.sealed?.length && s.rollNo >= 2) {                  // 한 번 다시 굴리면 봉인이 풀린다
    fx(s, { type: 'boss', skill: 'unseal', dice: s.sealed.slice() });
    s.sealed = [];
  }
  if (!forced) bossAfterRoll(s);
}

export function toggleHold(s, i) {
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (i < 0 || i >= s.dice.length) fail('없는 주사위입니다.');
  if (isSealed(s, i)) fail('봉인된 주사위는 움직일 수 없어요. 다시 굴리면 풀려요.');
  if (isFrozen(s, i)) fail('얼어붙은 주사위는 이번 차례에 다시 굴릴 수 없어요. 뒤집기 · 조정은 할 수 있어요.');
  s.held[i] = !s.held[i];
}

export function useFlip(s, i) {
  const p = current(s);
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (p.flip <= 0) fail('뒤집기 충전이 없습니다.');
  if (haki(s)) fail('마왕의 패기! 이번 라운드는 뒤집기를 쓸 수 없어요.');
  if (isSealed(s, i)) fail('봉인된 주사위는 뒤집을 수 없어요. 다시 굴리면 풀려요.');
  s.dice[i] = 7 - s.dice[i];
  p.flip--;
  s.toolUsed = true;
}

// 무희 춤사위 버프: 모아 둔 버프 1개로 모든 주사위 눈 +1 (6은 그대로, 봉인된 주사위 제외). 라운드당 1번
export const canDance = s => {
  const p = current(s);
  return ab(p) === 'dancer' && p.dance > 0 && p.danceRound !== s.round && s.phase === 'roll' && s.rolled && !haki(s);
};
export function useDance(s) {
  const p = current(s);
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (ab(p) !== 'dancer' || !(p.dance > 0)) fail('춤사위 버프가 없습니다.');
  if (p.danceRound === s.round) fail('춤사위는 라운드당 한 번만 쓸 수 있어요.');
  if (haki(s)) fail('마왕의 패기! 이번 라운드는 주사위 눈을 바꿀 수 없어요.');
  s.dice = s.dice.map((v, i) => (isSealed(s, i) ? v : Math.min(6, v + 1)));
  p.dance--;
  p.danceRound = s.round;
  s.toolUsed = true;
  log(s, `${p.name} · 춤사위! 모든 주사위 +1`);
  fx(s, { type: 'dance', player: s.turn });
}

// 도박사 배팅: 굴리기 전에 이번 라운드에 노릴 족보를 고른다
export function placeBet(s, cat) {
  const p = current(s);
  if (ab(p) !== 'gambler') fail('도박사만 배팅할 수 있어요.');
  if (s.phase !== 'roll' || s.rolled) fail('배팅은 굴리기 전에만 할 수 있어요.');
  if (!(cat in p.scores) || p.scores[cat] !== null) fail('이미 기록한 족보예요.');
  p.bet = cat;
  log(s, `${p.name} · ${catInfo(cat).ko}에 배팅!`);
  fx(s, { type: 'bet', player: s.turn, cat });
}

// 타짜 밑장빼기: 주사위 1개를 원하는 눈으로 (라운드당 1번). 이번에 적는 족보로는 경험치 없음
export const canDeal = s => {
  const p = current(s);
  return ab(p) === 'sharper' && !s.dealt && s.phase === 'roll' && s.rolled && !haki(s);
};
export function useDeal(s, i, v) {
  const p = current(s);
  if (ab(p) !== 'sharper') fail('타짜만 밑장빼기를 할 수 있어요.');
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (s.dealt) fail('밑장빼기는 라운드당 한 번만 할 수 있어요.');
  if (haki(s)) fail('마왕의 패기! 이번 라운드는 주사위 눈을 바꿀 수 없어요.');
  if (i < 0 || i >= s.dice.length) fail('없는 주사위입니다.');
  if (isSealed(s, i)) fail('봉인된 주사위는 바꿀 수 없어요. 다시 굴리면 풀려요.');
  v = Math.floor(Number(v));
  if (!(v >= 1 && v <= 6)) fail('주사위는 1~6 사이여야 합니다.');
  const from = s.dice[i];
  s.dice[i] = v;
  s.dealt = true;
  s.toolUsed = true;
  log(s, `${p.name} · 밑장빼기! ${from} → ${v}`);
  fx(s, { type: 'deal', player: s.turn, i, from, v });
}

export function useNudge(s, i, delta) {
  const p = current(s);
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (p.nudge <= 0) fail('조정 충전이 없습니다.');
  if (haki(s)) fail('마왕의 패기! 이번 라운드는 조정을 쓸 수 없어요.');
  if (isSealed(s, i)) fail('봉인된 주사위는 조정할 수 없어요. 다시 굴리면 풀려요.');
  const v = s.dice[i] + (delta > 0 ? 1 : -1);
  if (v < 1 || v > 6) fail('주사위는 1~6 사이여야 합니다.');
  s.dice[i] = v;
  p.nudge--;
  s.toolUsed = true;
}

// 특성·직업·이벤트까지 반영한 항목 점수. 주사위 6개면 가장 좋은 5개 조합.
// 칸 점수를 '기본 점수 + 보너스 목록'으로 나눠 돌려준다 (화면에 어디서 몇 점 붙었는지 보여 주려고).
// 보너스는 기본 점수가 0보다 클 때만 붙는다. 주사위 6개면 기본 점수가 가장 큰 5개 조합.
export function scoreParts(s, p, cat, d = s.dice, rollNo = s.rollNo) {
  const base = Math.max(0, ...fiveSets(d).map(set => baseScore(cat, set)));
  const bonus = [];
  if (base > 0) {
    const ev = event(s);
    const add = (ko, amt) => { if (amt) bonus.push({ ko, amt }); };
    // 칸 강화 특성: 기본 점수 × 배율 (카드 수만큼 더한 배율)
    const pk = perkMulOf(cat), n = pk ? perkCount(p, pk) : 0;
    if (n) add(`${perkInfo(pk).ko} ×${+(1 + PERK_MUL[pk] * n).toFixed(2)}`, Math.round(base * PERK_MUL[pk] * n));
    if (UPPER_IDS.includes(cat)) add('풍년', ev === 'harvest' ? 5 : 0);
    if (cat === 'yacht') add('요트 잭팟', ev === 'jackpot' ? 50 : 0);
  }
  let total = base + bonus.reduce((a, b) => a + b.amt, 0);
  // 도박사 배팅: 고른 족보면 ×배율, 다른 칸이면 점수 없음
  if (ab(p) === 'gambler' && p.bet) {
    if (cat !== p.bet) return { base: 0, bonus: [], total: 0, betMiss: true };
    if (total > 0) {
      const extra = Math.round(total * (CLASS_TUNE.betMul - 1));
      bonus.push({ ko: `배팅 ×${CLASS_TUNE.betMul}`, amt: extra });
      total += extra;
    }
  }
  // 무법자 속전속결: 첫 굴림 그대로 족보를 완성해 적으면 ×배율
  if (ab(p) === 'outlaw' && rollNo === 1 && total > 0 && isCombo(cat, d)) {
    const extra = Math.round(total * (CLASS_TUNE.rushMul - 1));
    bonus.push({ ko: `속전속결 ×${CLASS_TUNE.rushMul}`, amt: extra });
    total += extra;
  }
  return { base, bonus, total };
}

// 특성·직업·이벤트까지 반영한 항목 점수
export function catScore(s, p, cat, d = s.dice, rollNo = s.rollNo) {
  return scoreParts(s, p, cat, d, rollNo).total;
}

// 의뢰 보상 — 난이도가 높을수록 뒤집기·조정을 더 준다
export function questReward(s, p, qid) {
  const d = questInfo(qid).diff;
  const r = d >= 8 ? { flip: 2, nudge: 2 } : d >= 6 ? { flip: 1, nudge: 1 } : d >= 4 ? { flip: 1, nudge: 0 } : { flip: 0, nudge: 1 };
  r.flip += perkCount(p, 'fame');
  if (ab(p) === 'bard') r.nudge += 1;
  const mul = event(s) === 'bounty' ? 2 : 1;
  r.flip *= mul; r.nudge *= mul;
  return r;
}
const rewardValue = r => r.flip * 8 + r.nudge * 6;

// 지금 주사위로 깰 수 있는 퀘스트 (보상 큰 순, 연쇄 의뢰면 2개)
export function claimableQuests(s, p = current(s), d = s.dice) {
  if (!d.length || d.includes(0)) return [];
  const ok = s.board.filter(q => questMet(q, d, s))
    .sort((a, b) => rewardValue(questReward(s, p, b)) - rewardValue(questReward(s, p, a)) || questInfo(b).xp - questInfo(a).xp);
  return ok.slice(0, perkCount(p, 'chain') ? 2 : 1);
}

export function xpMultiplier(s, p) {
  let m = 1 + 0.25 * perkCount(p, 'fast') + (ab(p) === 'mage' ? 0.3 : 0);
  if (event(s) === 'festival') m *= 2;
  return m;
}

// 점수 칸마다 미리보기 (UI와 봇이 함께 쓴다)
export const BARD_BONUS = 1;
const bardBonus = (p, pts, quests) => (ab(p) === 'bard' && quests.length && pts > 0 ? BARD_BONUS : 0);

// 점수표 미리보기·기록 알림용: 음유시인 보너스까지 합친 보너스 목록
export function bonusList(s, p, cat, quests = claimableQuests(s, p)) {
  const parts = scoreParts(s, p, cat);
  const bard = bardBonus(p, parts.total, quests);
  return bard ? [...parts.bonus, { ko: '음유시인', amt: bard }] : parts.bonus;
}

export function preview(s) {
  const p = current(s);
  const quests = claimableQuests(s, p);
  const qXp = quests.reduce((a, q) => a + questInfo(q).xp, 0);
  return CATS.map(c => {
    if (p.scores[c.id] !== null) return { id: c.id, taken: true };
    if (rocked(s, c.id)) return { id: c.id, taken: true, rock: true };     // 키클롭스 바위: 이번 차례 쓸 수 없다
    let pts = catScore(s, p, c.id);
    pts += bardBonus(p, pts, quests);
    const bonus = bonusList(s, p, c.id, quests);
    let xp = pts > 0 ? pts : ZERO_XP + (perkCount(p, 'insure') ? 20 : 0) + (event(s) === 'zen' ? 20 : 0);
    xp = s.dealt || s.classic ? 0 : Math.round((xp + qXp) * xpMultiplier(s, p));   // 타짜 밑장빼기: 경험치 없음
    return { id: c.id, pts, xp, bonus, taken: false };
  });
}

export function upperSum(p) {
  return UPPER_IDS.reduce((a, id) => a + (p.scores[id] || 0), 0);
}
export const upperNeed = p => (ab(p) === 'warrior' ? 50 : UPPER_NEED);
export function cardTotal(p) {
  const all = CAT_IDS.reduce((a, id) => a + (p.scores[id] || 0), 0);
  return all + (upperSum(p) >= upperNeed(p) ? UPPER_BONUS : 0);
}
export function finalScore(p) {
  return cardTotal(p) + (p.level - 1) * LEVEL_POINTS;
}
export function breakdown(p) {
  const bonus = upperSum(p) >= upperNeed(p) ? UPPER_BONUS : 0;
  return {
    card: cardTotal(p) - bonus, bonus,
    level: (p.level - 1) * LEVEL_POINTS, total: finalScore(p),
  };
}

export function commitScore(s, cat) {
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  const p = current(s);
  if (!(cat in p.scores)) fail('없는 항목입니다.');
  if (p.scores[cat] !== null) fail('이미 기록한 항목입니다.');
  if (rocked(s, cat)) fail('바위에 막힌 칸이에요. 이번 차례에는 다른 칸에 적어 주세요.');

  const quests = claimableQuests(s, p);
  const bonus = bonusList(s, p, cat, quests);
  let pts = catScore(s, p, cat);
  pts += bardBonus(p, pts, quests);
  const before = cardTotal(p);
  p.scores[cat] = pts;
  (p.order ||= []).push(cat);                 // 기록한 순서 (대전 탑 쌓기: 아래부터 이 순서로 블록)
  (p.base ||= {})[cat] = scoreParts(s, p, cat).base;
  p.roundScore = pts;
  if (cat === 'yacht' && pts > 0) {           // 도전과제: 어떤 눈으로 요트를 했나
    const face = [1, 2, 3, 4, 5, 6].find(v => s.dice.filter(x => x === v).length >= 5);
    if (face) (p.stats.yacht ||= []).push(face);
  }
  if (ab(p) === 'dancer' && pts >= CLASS_TUNE.danceNeed) {   // 무희: 큰 점수를 적으면 춤사위 버프
    p.dance++;
    log(s, `${p.name} · 춤사위 버프 획득 (${p.dance}개)`);
    fx(s, { type: 'danceGain', player: s.turn, n: p.dance });
  }
  const ev = event(s);

  let xp = pts;
  if (pts === 0) {
    p.stats.zeros++;
    xp = ZERO_XP;
    if (perkCount(p, 'insure')) { xp += 20; addCharges(s, p, { flip: 1 }); }
    if (ev === 'zen') xp += 20;
  }
  const catName = catInfo(cat).ko;
  log(s, `${p.name} · ${catName} ${pts}점`);
  fx(s, { type: 'score', player: s.turn, cat, pts, bonus, dice: s.dice.slice() });
  // 상단 보너스: 에이스~식스 합이 기준(63, 전사 50)을 넘는 순간 따로 한 방 더 (보스전 · 대전 모두 별도 공격 연출)
  const upperHit = UPPER_IDS.includes(cat) && upperSum(p) >= upperNeed(p) && upperSum(p) - pts < upperNeed(p);
  if (upperHit) p.order.push('upper');
  if (s.boss) {
    // 점수가 곧 피해. 드래곤 갑옷은 상단(보너스 포함) 피해를 깎는다.
    let armor = s.boss.id === 'dragon' && UPPER_IDS.includes(cat) ? 0.75 : 1;
    const head = hydraHead(s);
    if (head === 'poison' && pts > 0 && pts <= 15) armor *= 0.5;          // 독 머리: 작은 점수는 피해 절반
    const dmg = cardTotal(p) - before - (upperHit ? UPPER_BONUS : 0);
    const gz = gazed(s, cat) && dmg > 0;
    if (gz) {                                                             // 외눈 응시: 피해 0
      log(s, `외눈 응시! 「${catInfo(cat).ko}」 칸의 피해가 막혔다`);
      fx(s, { type: 'boss', skill: 'gazed', cat, player: s.turn });
    }
    const hit = gz ? 0 : Math.round(dmg * armor);
    dealDamage(s, s.turn, hit, cat);
    if (upperHit && !s.ended) {
      log(s, `${p.name} · 상단 보너스 달성! +${UPPER_BONUS}`);
      fx(s, { type: 'upper', player: s.turn, amount: UPPER_BONUS });
      dealDamage(s, s.turn, Math.round(UPPER_BONUS * armor), 'upper');
    }
    // 머리 베기: 한 번에 30 이상 피해면 이번 라운드 머리가 잘린다
    const total = hit + (upperHit ? Math.round(UPPER_BONUS * armor) : 0);
    if (head && total >= HYDRA_CUT && !s.ended) {
      s.boss.cut[head] = true;
      log(s, `${p.name}이(가) 트리글라브의 ${HEAD_KO[head]} 머리를 베었다!`);
      fx(s, { type: 'boss', skill: 'behead', head, player: s.turn });
    }
    if (pts === 0 && (s.boss.id === 'orc' || s.boss.id === 'cyclops') && !s.ended) {
      const heal = s.boss.id === 'cyclops' ? CYCLOPS_PLUNDER : 10 * (enraged(s) ? 2 : 1);
      s.boss.hp = Math.min(s.boss.maxHp, s.boss.hp + heal);
      log(s, `${s.boss.id === 'cyclops' ? '폴리페모스' : '그로크'}의 약탈! 체력 ${heal} 회복`);
      fx(s, { type: 'boss', skill: 'plunder', amount: heal });
    }
  } else if (upperHit) {
    log(s, `${p.name} · 상단 보너스 달성! +${UPPER_BONUS}`);
    fx(s, { type: 'upper', player: s.turn, amount: UPPER_BONUS });
  }

  if (s.classic) { endTurn(s); return; }   // 클래식: 경험치 · 의뢰 · 충전 없음

  // 수도승: 굴림을 아낀 만큼 조정 충전
  if (ab(p) === 'monk' && s.rollsLeft > 0) {
    log(s, `${p.name} · 수도승의 절제! 조정 +${s.rollsLeft}`);
    addCharges(s, p, { nudge: s.rollsLeft }, 'monk');
  }

  // 굴림 아끼기: 남은 굴림 1개당 경험치 (수도승은 위에서 조정으로 받으니 제외)
  if (ab(p) !== 'monk' && s.rollsLeft > 0) {
    const bonus = s.rollsLeft * SAVE_XP;
    log(s, `${p.name} · 굴림 ${s.rollsLeft}번 아낌 → 경험치 +${bonus}`);
    fx(s, { type: 'save', player: s.turn, n: s.rollsLeft, xp: bonus });
    xp += bonus;
  }

  for (const qid of quests) {
    const q = questInfo(qid);
    const reward = questReward(s, p, qid);
    addCharges(s, p, reward, 'quest');
    xp += q.xp;
    p.questsDone.push(qid);
    s.board.splice(s.board.indexOf(qid), 1);
    s.discard.push(qid);
    log(s, `${p.name} · 의뢰 「${q.ko}」 완료! ${chargeText(reward)}`);
    fx(s, { type: 'quest', player: s.turn, quest: qid, reward, xp: q.xp });
  }
  refillBoard(s);

  // 보유 한도를 넘친 충전 → 경험치
  if (p.spill) {
    log(s, `${p.name} · 넘친 충전 ${p.spill}개 → 경험치 +${p.spill * SPILL_XP}`);
    fx(s, { type: 'spill', player: s.turn, n: p.spill, xp: p.spill * SPILL_XP });
    xp += p.spill * SPILL_XP;
    p.spill = 0;
  }
  let gained = Math.round(xp * xpMultiplier(s, p));
  if (s.dealt && gained > 0) {                 // 타짜 밑장빼기의 대가
    log(s, `${p.name} · 밑장빼기의 대가 — 경험치 없음`);
    fx(s, { type: 'dealCost', player: s.turn, xp: gained });
    gained = 0;
  }
  gainXp(s, p, gained);

  if (s.ended) return;          // 보스를 쓰러뜨리면 그 자리에서 끝
  if (p.offers.length) s.phase = 'levelup';
  else endTurn(s);
}

function gainXp(s, p, amount) {
  p.xp += amount;
  p.stats.xpEarned += amount;
  fx(s, { type: 'xp', player: s.players.indexOf(p), amount });
  const before = p.offers.length;
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    (p.order ||= []).push('lv');
    p.offers.push(makeOffer(s, p));
    log(s, `${p.name} · 레벨 ${p.level} 달성!`);
    fx(s, { type: 'levelup', player: s.players.indexOf(p), level: p.level });
  }
  if (p.offers.length > before) p.lvBatch = p.offers.length;   // 이번에 한꺼번에 받은 레벨업 수 (화면 표시용)
  if (p.level >= MAX_LEVEL) p.xp = 0;
}

function makeOffer(s, p) {
  const n = perkCount(p, 'scholar') ? 4 : 3;
  const pool = PERKS.filter(k => !k.filler && perkCount(p, k.id) < k.max && (k.rarity < 3 || p.level >= 4) && !perkUseless(p, k.id));
  // 고를 만한 특성이 모자라면 즉시 보상 카드로 채운다
  if (pool.length < n) pool.push(...PERKS.filter(k => k.filler).slice(0, n - pool.length));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, k) => a + RARITY[k.rarity].w, 0);
    let r = rand(s) * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= RARITY[pool[idx].rarity].w; if (r < 0) break; }
    out.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return out;
}

export function pickPerk(s, perkId) {
  const p = current(s);
  if (s.phase !== 'levelup' || !p.offers.length) fail('고를 특성이 없습니다.');
  if (!p.offers[0].includes(perkId)) fail('제시된 카드가 아닙니다.');
  p.offers.shift();
  const k = perkInfo(perkId);
  if (k.instant) {
    if (perkId === 'toolkit') addCharges(s, p, { flip: 1, nudge: 1 }, 'perk');
    if (perkId === 'nudgeBag') addCharges(s, p, { nudge: 3 }, 'perk');
    if (perkId === 'bigKit') addCharges(s, p, { flip: 2, nudge: 2 }, 'perk');
    log(s, `${p.name} · 「${k.ko}」 획득`);
    if (!p.offers.length && !s.ended) endTurn(s);
    return;
  }
  p.perks[perkId] = perkCount(p, perkId) + 1;
  // 칸 강화 특성은 이미 점수를 낸 칸에도 소급 적용 (0점으로 버린 칸은 제외)
  if (PERK_CATS[perkId]) {
    const before = cardTotal(p);
    const cats = PERK_CATS[perkId].filter(c => p.scores[c] > 0);
    cats.forEach(c => (p.scores[c] += Math.round(baseOf(p, c) * PERK_MUL[perkId])));
    const gained = cardTotal(p) - before;   // 상단 보너스를 새로 달성하면 그것도 포함
    if (gained > 0) {
      log(s, `${p.name} · 「${k.ko}」 소급 적용 +${gained}`);
      fx(s, { type: 'retro', player: s.turn, perk: perkId, amount: gained, cats });
      if (s.boss) dealDamage(s, s.turn, gained, 'retro');
      if (s.ended) return;
    }
  }
  if (perkId === 'flip') addCharges(s, p, { flip: 2 }, 'perk');
  if (perkId === 'nudge') addCharges(s, p, { nudge: 2 }, 'perk');
  if (perkId === 'yacht') addCharges(s, p, { flip: 1 }, 'perk');
  log(s, `${p.name} · 특성 「${perkInfo(perkId).ko}」 획득`);
  if (!p.offers.length) endTurn(s);
}

function endTurn(s) {
  s.turn++;
  if (s.turn >= s.players.length) {
    // 라운드 종료 처리
    if (event(s) === 'duel') {
      const top = Math.max(...s.players.map(p => p.roundScore));
      if (top > 0) {
        s.players.forEach((p, i) => {
          if (p.roundScore === top) {
            addCharges(s, p, { flip: 1, nudge: 1 });
            log(s, `${p.name} · 결투 대회 우승! 뒤집기 +1 · 조정 +1`);
            fx(s, { type: 'duel', player: i });
          }
        });
      }
    }
    if (s.ended) return;
    const b = s.boss;
    if (b?.id === 'overlord') {
      const n = skeletons(s);
      if (n > 0 && b.hp > 0) {
        const heal = Math.min(b.maxHp - b.hp, n * NECRO_HEAL);
        b.hp += heal;
        log(s, `해골병 ${n}기가 네크라스를 회복시켰다 (+${heal})`);
        fx(s, { type: 'boss', skill: 'necro', amount: heal, n });
      }
      if (enraged(s) && !b.rewound && b.roundDmg > 0) {
        const back = Math.min(b.maxHp - b.hp, Math.floor(b.roundDmg / 2));
        b.hp += back; b.rewound = true;
        log(s, `네크라스의 시간 역행! 이번 라운드 피해의 절반 +${back}`);
        fx(s, { type: 'boss', skill: 'rewind', amount: back });
      }
      b.roundDmg = 0;
      if (every(s, 4)) {
        const add = THRONE_SHIELD * s.players.length;
        b.shield += add;
        log(s, `네크라스가 뼈의 왕좌에 앉았다! 보호막 +${add}`);
        fx(s, { type: 'boss', skill: 'throne', amount: add });
      }
    }
    if (b?.id === 'lich' && every(s, 4)) {
      const add = 12 * s.players.length;
      b.shield += add;
      log(s, `모르가스가 뼈 방패를 둘렀다! 보호막 +${add}`);
      fx(s, { type: 'boss', skill: 'bone', amount: add });
    }
    s.turn = 0;
    s.round++;
    if (s.round > ROUNDS) {
      s.ended = true;
      s.phase = 'over';
      s.round = ROUNDS;
      if (s.boss) log(s, `${bossInfo(s.boss.id).ko}를 쓰러뜨리지 못했다…`);
      fx(s, { type: 'over', won: false });
      return;
    }
  }
  startTurn(s);
}

// ── 온라인: 연결이 끊긴 사람 ─────────────────────────────────────────────────
// 1분 넘게 돌아오지 않으면 봇이 그 자리를 이어받는다 (협동, 3~4인 대전)
export function dropToBot(s, i) {
  const p = s.players[i];
  if (!p || p.bot || s.ended) return;
  p.bot = true;
  p.dropped = true;
  log(s, `${p.name} 연결 끊김 — 봇이 대신 진행한다`);
  fx(s, { type: 'dropped', player: i });
}
// 봇이 대신하던 사람이 다시 들어오면 주도권을 돌려준다
export function rejoin(s, i) {
  const p = s.players[i];
  if (!p?.dropped || s.ended) return false;
  p.bot = false;
  p.dropped = false;
  log(s, `${p.name} 다시 접속 — 직접 진행한다`);
  fx(s, { type: 'rejoined', player: i });
  return true;
}
// 1대1 대전에서 상대가 1분 안에 돌아오지 않으면 기권패
export function forfeit(s, loser) {
  if (s.ended) return;
  s.ended = true;
  s.phase = 'over';
  s.forfeit = loser;
  log(s, `${s.players[loser].name} 연결 끊김 — 기권패`);
  fx(s, { type: 'over', won: false, forfeit: loser });
}

// 도전과제용 한 판 기록 (achievements.js 의 키). 끝난 판, idx 번째 선수 기준
export function statsOf(s, idx, { online = false } = {}) {
  const p = s.players[idx];
  const sc = id => p.scores[id];
  const st = { games: 1, quests: p.questsDone?.length || 0, level: s.classic ? 0 : p.level };
  for (const c of ['four', 'full', 'sstr', 'lstr', 'yacht']) st[`c_${c}`] = sc(c) > 0 ? 1 : 0;
  st.upper = upperSum(p) >= upperNeed(p) ? 1 : 0;
  st.clean = CAT_IDS.every(id => sc(id) > 0) ? 1 : 0;
  st.collect = ['yacht', 'lstr', 'full', 'four'].every(id => sc(id) > 0) ? 1 : 0;
  st.y6 = (p.stats.yacht || []).includes(6) ? 1 : 0;
  st.y1 = (p.stats.yacht || []).includes(1) ? 1 : 0;
  if (s.mode === 'coop') {
    const g = coopGrade(s);
    if (s.boss?.won) { st.coopWin = 1; st[`b:${s.boss.id}:${s.boss.diff}`] = { B: 1, A: 2, S: 3 }[g] || 0; }
  } else {
    const top = ranking(s)[0];
    const win = s.players.length > 1 && (top.i === idx || (top.total === finalScore(p) && s.forfeit !== idx));
    st[s.classic ? 'clScore' : 'score'] = finalScore(p);
    if (win) { st.vsWin = 1; if (s.classic) st.clWin = 1; if (online && s.players.filter(q => !q.bot).length > 1) st.onWin = 1; }
  }
  return st;
}

export function ranking(s) {
  // 기권한 사람은 점수와 상관없이 꼴찌
  return s.players.map((p, i) => ({ i, p, total: finalScore(p), out: s.forfeit === i }))
    .sort((a, b) => a.out - b.out || b.total - a.total);
}

// UI가 효과를 한 번씩만 보여주도록 꺼내 간다
export function drainFx(s) {
  const out = s.fx;
  s.fx = [];
  return out;
}

// ── 봇 ───────────────────────────────────────────────────────────────────────
// 한 수 앞을 몬테카를로로 보는 탐욕 봇. 밸런스 시뮬레이션과 혼자 하기 모드에서 함께 쓴다.
// 점수 칸을 쓰는 가치 = 얻는 점수 - 그 칸의 평균 기대 점수(기회비용) + 퀘스트 가치
const EXPECT = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17,
                 choice: 21, four: 10, full: 12, sstr: 10, lstr: 11, yacht: 9 };

function valueOf(s, p, d, rollNo = s.rollNo) {
  let best = -Infinity;
  const left = CAT_IDS.filter(id => p.scores[id] === null);
  const late = left.length <= 3;   // 막판엔 기회비용이 의미가 없다
  for (const id of left) {
    if (rocked(s, id)) continue;
    const pts = catScore(s, p, id, d, rollNo);
    let v = pts - (late ? 0 : EXPECT[id]) - (gazed(s, id) ? pts * 0.8 : 0);
    const up = catInfo(id).up;
    if (up && pts > 0) v += (pts - 3 * up) * 0.6;  // 상단 보너스 진척
    if (pts === 0) v -= 2;
    best = Math.max(best, v);
  }
  const qs = claimableQuests(s, p, d);
  for (const q of qs) best += rewardValue(questReward(s, p, q)) * 0.8 + questInfo(q).xp * 0.25;
  return best;
}

function holdValue(s, p, mask, samples, rng) {
  const d = s.dice;
  let total = 0;
  for (let k = 0; k < samples; k++) {
    const nd = d.map((v, i) => (mask & (1 << i) ? v : 1 + Math.floor(rng() * 6)));
    total += valueOf(s, p, nd, (s.rollNo || 0) + 1);
  }
  return total / samples;
}

// 봇이 할 다음 행동 하나를 돌려준다. rng: () => [0,1)
export function botAction(s, rng = Math.random, samples = 24) {
  const p = current(s);
  if (s.phase === 'levelup') {
    return { type: 'perk', id: botPickPerk(p, p.offers[0], rng) };
  }
  if (ab(p) === 'gambler' && !p.bet && !s.rolled) return { type: 'bet', cat: botBet(s, p, rng) };
  if (!s.rolled) return { type: 'roll' };

  const n = s.dice.length;
  // 기술(뒤집기/조정)로 확 좋아지면 쓴다
  if (!haki(s) && (p.flip > 0 || p.nudge > 0)) {        // 마왕의 패기: 뒤집기·조정 금지
    const now = valueOf(s, p, s.dice);
    let bestGain = 5, bestAct = null;
    for (let i = 0; i < n; i++) {
      if (isSealed(s, i)) continue;
      if (p.flip > 0) {
        const nd = s.dice.slice(); nd[i] = 7 - nd[i];
        const g = valueOf(s, p, nd) - now;
        if (g > bestGain) { bestGain = g; bestAct = { type: 'flip', i }; }
      }
      if (p.nudge > 0) for (const dlt of [-1, 1]) {
        const v = s.dice[i] + dlt;
        if (v < 1 || v > 6) continue;
        const nd = s.dice.slice(); nd[i] = v;
        const g = valueOf(s, p, nd) - now;
        if (g > bestGain) { bestGain = g; bestAct = { type: 'nudge', i, d: dlt }; }
      }
    }
    // 굴림이 남아 있으면 더 크게 좋아질 때만 쓴다
    if (bestAct && (s.rollsLeft === 0 || bestGain > 12)) return bestAct;
  }

  // 타짜: 밑장빼기로 크게 좋아지면 쓴다 (경험치를 잃으니 굴림이 남았으면 아주 클 때만)
  if (canDeal(s)) {
    const now = valueOf(s, p, s.dice);
    let bg = -Infinity, ba = null;
    for (let i = 0; i < n; i++) {
      if (isSealed(s, i)) continue;
      for (let v = 1; v <= 6; v++) {
        if (v === s.dice[i]) continue;
        const nd = s.dice.slice(); nd[i] = v;
        const g = valueOf(s, p, nd) - now;
        if (g > bg) { bg = g; ba = { type: 'deal', i, v }; }
      }
    }
    if (ba && bg > (s.rollsLeft === 0 ? CLASS_TUNE.dealMin : CLASS_TUNE.dealMinEarly)) return ba;
  }
  // 무희: 모든 주사위 +1 이 이득이면 쓴다 (마지막 굴림이면 조금만 좋아져도)
  if (canDance(s)) {
    const now = valueOf(s, p, s.dice);
    const up = valueOf(s, p, s.dice.map((v, i) => (isSealed(s, i) ? v : Math.min(6, v + 1))));
    if (up - now > 4 || (s.rollsLeft === 0 && up > now)) return { type: 'dance' };
  }
  if (s.rollsLeft > 0) {
    const all = (1 << n) - 1;
    let bestMask = all, bestV = valueOf(s, p, s.dice);
    const sealedBits = [...(s.sealed || []), ...(s.frozen || [])].reduce((m, i) => m | (1 << i), 0);
    for (let mask = 0; mask < all; mask++) {
      if ((mask & sealedBits) !== sealedBits) continue;     // 봉인된 주사위는 굴릴 수 없다
      const v = holdValue(s, p, mask, samples, rng);
      if (v > bestV + 0.5) { bestV = v; bestMask = mask; }
    }
    if (bestMask !== all) return { type: 'reroll', hold: [...Array(n)].map((_, i) => !!(bestMask & (1 << i))) };
  }

  let bestCat = null, bestV = -Infinity;
  const left = CAT_IDS.filter(id => p.scores[id] === null);
  const late = left.length <= 3;
  for (const id of left) {
    if (rocked(s, id)) continue;
    const pts = catScore(s, p, id);
    let v = pts - (late ? 0 : EXPECT[id]) - (gazed(s, id) ? pts * 0.8 : 0);
    const up = catInfo(id).up;
    if (up && pts > 0) v += (pts - 3 * up) * 0.6;
    if (v > bestV) { bestV = v; bestCat = id; }
  }
  return { type: 'score', cat: bestCat };
}

// 도박사 봇의 배팅: 굴림 3번으로 노렸을 때의 기대 점수 × 배율 - 그 칸의 평소 기대 점수 가 큰 족보
const AIM = { ones: 2.1, twos: 4.2, threes: 6.3, fours: 8.4, fives: 10.5, sixes: 12.6,
              choice: 23, four: 6, full: 7, sstr: 9, lstr: 8, yacht: 2.5 };
function botBet(s, p, rng) {
  const left = CAT_IDS.filter(id => p.scores[id] === null);
  const late = left.length <= 3;
  let best = left[0], bv = -Infinity;
  for (const id of left) {
    const v = AIM[id] * CLASS_TUNE.betMul - (late ? 0 : EXPECT[id]) + rng() * 2;
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}

// 기본은 희귀도 높은 카드 선호. 시뮬레이션에서는 random=true 로 편향 없이 고른다.
export function botPickPerk(p, offer, rng = Math.random, random = false) {
  if (random) return offer[Math.floor(rng() * offer.length)];
  return offer.slice().sort((a, b) => perkInfo(b).rarity - perkInfo(a).rarity || rng() - 0.5)[0];
}

// 봇 행동 적용 (UI·시뮬레이션 공용)
export function applyBot(s, act) {
  switch (act.type) {
    case 'roll': return roll(s);
    case 'reroll': s.held = act.hold.slice(); return roll(s);
    case 'flip': return useFlip(s, act.i);
    case 'nudge': return useNudge(s, act.i, act.d);
    case 'dance': return useDance(s);
    case 'deal': return useDeal(s, act.i, act.v);
    case 'bet': return placeBet(s, act.cat);
    case 'score': return commitScore(s, act.cat);
    case 'perk': return pickPerk(s, act.id);
  }
}
