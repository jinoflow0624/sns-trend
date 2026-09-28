// 다이스 히어로즈 룰 엔진.
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
    desc: '요트 +10점' },
  { id: 'monk',    ko: '수도승',   icon: '📿', color: '#FF9A1F',
    desc: '점수를 기록할 때 남은 굴림 1회당 조정 +1' },
];
export const classInfo = id => CLASSES.find(c => c.id === id);

// ── 특성 카드 (레벨업 보상) ──────────────────────────────────────────────────
// rarity: 1 일반 / 2 희귀 / 3 전설.  max: 중복 획득 한도
export const PERKS = [
  { id: 'flip',     ko: '뒤집기 두루마리', icon: '🔄', rarity: 1, max: 9, desc: '주사위 1개를 반대 면(7-눈)으로 뒤집는 기술 2회 충전' },
  { id: 'nudge',    ko: '미세 조정',       icon: '🎯', rarity: 1, max: 9, desc: '주사위 1개를 ±1 바꾸는 기술 2회 충전' },
  { id: 'basic',    ko: '기초 수련',       icon: '🥋', rarity: 1, max: 2, desc: '상단(에이스~식스) 점수 +2 (기록한 칸에도 소급)' },
  { id: 'choice',   ko: '선택의 달인',     icon: '🍀', rarity: 1, max: 2, desc: '초이스 +8 (기록한 칸에도 소급)' },
  { id: 'fame',     ko: '의뢰 전문가',     icon: '📜', rarity: 1, max: 2, desc: '의뢰 보상(뒤집기·조정)이 두 배' },
  { id: 'fast',     ko: '빠른 성장',       icon: '⚡', rarity: 1, max: 2, desc: '얻는 경험치 +25%' },
  { id: 'insure',   ko: '보험',            icon: '🛡️', rarity: 1, max: 1, desc: '0점을 기록하면 경험치 +20, 뒤집기 +1' },
  { id: 'full',     ko: '풀하우스 장인',   icon: '🏠', rarity: 2, max: 2, desc: '풀하우스 +10 (기록한 칸에도 소급)' },
  { id: 'straight', ko: '질주',            icon: '🏃', rarity: 2, max: 2, desc: '두 스트레이트 +6 (기록한 칸에도 소급)' },
  { id: 'fourk',    ko: '사냥 본능',       icon: '🐺', rarity: 2, max: 2, desc: '포카인드 +10 (기록한 칸에도 소급)' },
  { id: 'reroll',   ko: '재굴림 +1',       icon: '♻️', rarity: 2, max: 2, desc: '매 턴 굴림 기회 +1' },
  { id: 'lucky',    ko: '행운의 부적',     icon: '🧿', rarity: 2, max: 1, desc: '매 굴림에서 나온 1은 한 번 더 굴린다' },
  { id: 'chain',    ko: '연쇄 의뢰',       icon: '⛓️', rarity: 2, max: 1, desc: '한 턴에 퀘스트를 2개까지 깬다' },
  { id: 'scholar',  ko: '현자의 눈',       icon: '👁️', rarity: 2, max: 1, desc: '이후 레벨업 때 카드 4장 중에 고른다' },
  { id: 'sixth',    ko: '여섯 번째 주사위', icon: '🌟', rarity: 3, max: 1, desc: '주사위 6개를 굴려 가장 좋은 5개로 계산. 대신 굴림 기회 -1' },
  { id: 'midas',    ko: '황금손',          icon: '👑', rarity: 3, max: 1, desc: '내 턴이 시작될 때마다 조정 +1' },
  { id: 'yacht',    ko: '요트 신봉자',     icon: '⛵', rarity: 3, max: 1, desc: '요트 +20 (기록한 칸에도 소급), 뒤집기 1회 충전' },
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
// 한 장당 칸마다 더하는 점수
const PERK_AMT = { basic: 2, choice: 8, full: 10, straight: 6, fourk: 10, yacht: 20 };
// 소급 적용이 있어서, 칸이 다 찼어도 점수를 낸 칸이 하나라도 있으면 쓸모가 있다.
// 해당 칸을 모두 0점으로 버렸을 때만 효과가 없다.
export const perkUseless = (p, id) => !!PERK_CATS[id] && PERK_CATS[id].every(c => p.scores[c] === 0);
// 지금 고르면 이미 기록한 칸에 바로 더해질 점수 (카드에 표시)
export const perkRetro = (p, id) => (PERK_CATS[id] || []).filter(c => p.scores[c] > 0).length * (PERK_AMT[id] || 0);
export const perkInfo = id => PERKS.find(p => p.id === id);
export const RARITY = { 1: { ko: '일반', w: 60 }, 2: { ko: '희귀', w: 30 }, 3: { ko: '전설', w: 10 } };

// ── 퀘스트 (공용 보드, 먼저 깬 사람이 가져간다) ───────────────────────────────
// test(info, dice) → 조건 충족 여부.  diff = 난이도 점수(보상 등급을 정함), xp = 경험치
const Q = (id, ko, icon, desc, diff, xp, test) => ({ id, ko, icon, desc, diff, xp, test });
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
  Q('ends',    '양날의 검',    '🪓', '1과 6이 둘 다 있음',       2,  8, x => x.counts[1] > 0 && x.counts[6] > 0),
  Q('middle',  '중용의 길',    '☯️', '모두 3 또는 4',            7, 20, x => x.counts[3] + x.counts[4] === 5),
  Q('sum20',   '정확한 저울',  '⚖️', '합계가 정확히 20',         4, 12, x => x.sum === 20),
  Q('sum17',   '행운의 17',    '🍀', '합계가 정확히 17',         4, 12, x => x.sum === 17),
  Q('noSix',   '겸손한 영웅',  '🙇', '6 없이 합계 18 이상',      5, 15, x => x.counts[6] === 0 && x.sum >= 18),
  Q('twoSix',  '쌍검술',       '🤺', '6이 정확히 2개',           2,  8, x => x.counts[6] === 2),
  Q('big3',    '거인 셋',      '🗿', '5 이상이 3개 이상',        3, 10, x => x.counts[5] + x.counts[6] >= 3),
  Q('small4',  '꼬마 원정대',  '🐭', '3 이하가 4개 이상',        3, 10, x => x.counts[1] + x.counts[2] + x.counts[3] >= 4),
  Q('yacht',   '전설의 항해',  '⛵', '요트 (5개 모두 같음)',     12, 30, x => x.maxCount === 5),
];
export const questInfo = id => QUESTS.find(q => q.id === id);

export function questMet(qid, d) {
  const q = questInfo(qid);
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
];
export const eventInfo = id => EVENTS.find(e => e.id === id);
// 12라운드에 쓸 덱. 평온은 둘, 나머지는 한 장씩 (첫 라운드는 항상 평온)
const EVENT_DECK = ['calm', 'festival', 'fog', 'wind', 'bounty', 'zen', 'jackpot', 'harvest', 'duel', 'refresh', 'blessing'];

// ── 협동모드 보스 ────────────────────────────────────────────────────────────
// 파티 전원이 한 보스를 상대한다. 기록한 점수(상단 보너스 포함)가 곧 피해이고,
// 의뢰 보상(뒤집기·조정)으로 더 좋은 족보를 만들어 피해를 키운다. 12라운드 안에 쓰러뜨리면 승리.
// 난이도 d: 0 쉬움 / 1 보통 / 2 매우 어려움.  능력 수치는 [쉬움, 보통, 매우 어려움] 순서.
export const DIFFS = [
  { id: 0, ko: '쉬움',        hp: 176, color: '#3EE6B4' },
  { id: 1, ko: '보통',        hp: 213, color: '#FFC83D' },
  { id: 2, ko: '매우 어려움', hp: 244, color: '#E8435A' },
];

export const BOSSES = [
  {
    id: 'dragon', ko: '화염룡 이그니스', title: '붉은 산의 재앙', color: '#E8435A', hpMul: [1.22, 1.1, 1.01],
    skills: [
      { id: 'breath', icon: '🔥', ko: '화염 숨결',
        desc: d => `${[4, 3, 2][d]}라운드마다 모두의 첫 굴림에서 가장 높은 주사위 ${d === 2 ? 2 : 1}개가 1로 타 버린다` },
      { id: 'scale', icon: '🛡️', ko: '용린 갑옷',
        desc: d => `에이스~식스로 주는 피해가 ${[25, 50, 50][d]}% 줄어든다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 화염 숨결을 매 라운드 쓴다' : '매우 어려움에서만 쓴다' },
    ],
  },
  {
    id: 'orc', ko: '오크 대장 그로크', title: '약탈자 군단의 우두머리', color: '#6BBE45', hpMul: [1.26, 1.17, 1.1],
    skills: [
      { id: 'drums', icon: '🥁', ko: '전쟁의 북',
        desc: d => `${[3, 2, 2][d]}라운드마다 모두의 굴림 기회가 1 줄어든다` },
      { id: 'plunder', icon: '💰', ko: '약탈',
        desc: d => `누군가 0점을 기록하면 체력을 ${[10, 20, 30][d]} 회복한다` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 약탈 회복량이 두 배' : '매우 어려움에서만 쓴다' },
    ],
  },
  {
    id: 'lich', ko: '리치 왕 모르가스', title: '잊힌 무덤의 주인', color: '#9486FF', hpMul: [1.22, 1.03, 0.87],
    // 운명 비틀기가 두 번째 굴림으로 바뀐 뒤 여럿이 할수록 어려워져서, 인원별로 체력을 따로 깎는다 [1인, 2인, 3인, 4인]
    partyAdj: [[1, 0.95, 0.96, 0.97], [1.01, 0.94, 0.945, 0.95], [1, 0.95, 0.94, 0.93]],
    skills: [
      { id: 'twist', icon: '🌀', ko: '운명 비틀기',
        desc: d => `${[3, 2, 1][d] === 1 ? '매' : [3, 2, 1][d]} 라운드마다 두 번째 굴림 직후 주사위 1개를 뒤집어 버린다 (7-눈)` },
      { id: 'bone', icon: '💀', ko: '뼈 방패',
        desc: d => `${[4, 3, 3][d]}라운드마다 인원 1명당 ${[12, 20, 28][d]}의 보호막을 두른다 (체력보다 먼저 깎임)` },
      { id: 'rage', icon: '💢', ko: '분노', desc: d => d === 2 ? '체력이 절반 아래면 운명 비틀기가 주사위 2개를 뒤집는다' : '매우 어려움에서만 쓴다' },
    ],
  },
];
export const bossInfo = id => BOSSES.find(b => b.id === id);
const enraged = s => s.boss.diff === 2 && s.boss.hp * 2 < s.boss.maxHp;
const every = (s, k) => s.round % k === 0;

function bossRollMod(s) {
  const b = s.boss;
  if (!b || b.id !== 'orc') return 0;
  return every(s, [3, 2, 2][b.diff]) ? -1 : 0;
}

// 굴림 직후 보스 능력 — 화염 숨결은 첫 굴림, 운명 비틀기는 두 번째 굴림.
// fx 의 from 은 능력이 바꾸기 전 눈 (화면은 이 눈으로 굴러 멈춘 뒤 불타거나 뒤집히는 연출을 한다)
function bossAfterRoll(s) {
  const b = s.boss;
  if (!b) return;
  const from = s.dice.slice();
  const n = b.diff === 2 ? 2 : 1;
  if (b.id === 'dragon' && s.rollNo === 1 && (every(s, [4, 3, 2][b.diff]) || enraged(s))) {
    const idx = s.dice.map((v, i) => i).sort((x, y) => s.dice[y] - s.dice[x]).slice(0, n);
    idx.forEach(i => (s.dice[i] = 1));
    log(s, `이그니스의 화염 숨결! 주사위 ${n}개가 1로 탔다`);
    fx(s, { type: 'boss', skill: 'breath', dice: idx, from });
  }
  if (b.id === 'lich' && s.rollNo === 2 && every(s, [3, 2, 1][b.diff])) {
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

// 뒤집기·조정 충전 보상
function addCharges(s, p, r, why) {
  p.flip += r.flip || 0;
  p.nudge += r.nudge || 0;
  if ((r.flip || 0) + (r.nudge || 0) > 0) fx(s, { type: 'charge', player: s.players.indexOf(p), flip: r.flip || 0, nudge: r.nudge || 0, why });
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
        flip: cls === 'rogue' ? 1 : 0, nudge: 0,
        offers: [], questsDone: [], roundScore: 0,
        stats: { xpEarned: 0, zeros: 0 },
      };
    }),
    dice: [], held: [], rollsLeft: 0, rolled: false,
    board: [], deck: [], discard: [],
    events: [], log: [], fx: [], ended: false,
    mode: opts.mode === 'coop' ? 'coop' : 'versus', boss: null,
  };
  if (s.mode === 'coop') {
    const id = bossInfo(opts.boss) ? opts.boss : 'dragon';
    const diff = Math.min(2, Math.max(0, opts.diff | 0));
    // 인원 보정 (난이도별, 봇 시뮬레이션으로 맞춘 값): 인원이 많을수록 레벨업·소급 보너스가 쌓여
    // 파티가 강해지므로 1인당 체력을 조금씩 늘린다
    const party = [[1, 1.045, 1.055, 1.065], [1, 0.99, 0.985, 0.98], [1, 0.96, 0.95, 0.94]][diff][players.length - 1]
      * (bossInfo(id).partyAdj?.[diff][players.length - 1] ?? 1);
    const hp = Math.round(DIFFS[diff].hp * bossInfo(id).hpMul[diff] * party * players.length / 5) * 5;
    s.boss = { id, diff, hp, maxHp: hp, shield: 0, dmg: players.map(() => 0), won: false };
  }
  s.deck = shuffle(s, QUESTS.map(q => q.id));
  s.board = s.deck.splice(0, QUEST_SLOTS);
  const rest = shuffle(s, [...EVENT_DECK.filter(e => e !== 'calm'), 'calm']);
  s.events = ['calm', ...rest].slice(0, ROUNDS);
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

function startTurn(s) {
  const p = current(s);
  s.dice = new Array(diceCount(p)).fill(0);
  s.held = new Array(diceCount(p)).fill(false);
  s.rollsLeft = maxRolls(s, p);
  s.rollNo = 0;
  s.rolled = false;
  s.phase = 'roll';
  if (s.turn === 0) {
    // 라운드 시작 처리
    const ev = event(s);
    if (ev === 'refresh') {
      s.discard.push(...s.board);
      s.board = [];
      refillBoard(s);
    }
    if (ev === 'blessing') s.players.forEach(pl => pl.flip++);
    s.players.forEach(pl => (pl.roundScore = 0));
    fx(s, { type: 'round', round: s.round, event: ev });
    if (bossRollMod(s)) {
      log(s, '그로크의 전쟁의 북! 이번 라운드 굴림 기회 -1');
      fx(s, { type: 'boss', skill: 'drums' });
    }
  }
  if (perkCount(p, 'midas')) {
    p.nudge += 1;
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
  if (s.rolled && s.held.every(Boolean)) fail('모든 주사위를 잡고 있습니다.');
  const p = current(s);
  // 튜토리얼처럼 결과를 미리 정해 둔 굴림 (s.script = [[눈...], ...])
  const forced = s.script?.length ? s.script.shift() : null;
  s.dice = s.dice.map((v, i) => {
    if (s.rolled && s.held[i]) return v;
    if (forced) return forced[i];
    let r = die(s);
    if (r === 1 && perkCount(p, 'lucky')) r = die(s);
    return r;
  });
  if (!s.rolled) s.held = s.held.map(() => false);
  s.rolled = true;
  s.rollsLeft--;
  s.rollNo = (s.rollNo || 0) + 1;
  if (!forced) bossAfterRoll(s);
}

export function toggleHold(s, i) {
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (i < 0 || i >= s.dice.length) fail('없는 주사위입니다.');
  s.held[i] = !s.held[i];
}

export function useFlip(s, i) {
  const p = current(s);
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (p.flip <= 0) fail('뒤집기 충전이 없습니다.');
  s.dice[i] = 7 - s.dice[i];
  p.flip--;
}

export function useNudge(s, i, delta) {
  const p = current(s);
  if (s.phase !== 'roll' || !s.rolled) fail('먼저 주사위를 굴려 주세요.');
  if (p.nudge <= 0) fail('조정 충전이 없습니다.');
  const v = s.dice[i] + (delta > 0 ? 1 : -1);
  if (v < 1 || v > 6) fail('주사위는 1~6 사이여야 합니다.');
  s.dice[i] = v;
  p.nudge--;
}

// 특성·직업·이벤트까지 반영한 항목 점수. 주사위 6개면 가장 좋은 5개 조합.
// 칸 점수를 '기본 점수 + 보너스 목록'으로 나눠 돌려준다 (화면에 어디서 몇 점 붙었는지 보여 주려고).
// 보너스는 기본 점수가 0보다 클 때만 붙는다. 주사위 6개면 기본 점수가 가장 큰 5개 조합.
export function scoreParts(s, p, cat, d = s.dice) {
  const base = Math.max(0, ...fiveSets(d).map(set => baseScore(cat, set)));
  const bonus = [];
  if (base > 0) {
    const ev = event(s);
    const add = (ko, amt) => { if (amt) bonus.push({ ko, amt }); };
    if (UPPER_IDS.includes(cat)) {
      add('기초 수련', 2 * perkCount(p, 'basic'));
      add('풍년', ev === 'harvest' ? 5 : 0);
    }
    if (cat === 'choice') add('선택의 달인', 8 * perkCount(p, 'choice'));
    if (cat === 'full') add('풀하우스 장인', 10 * perkCount(p, 'full'));
    if (cat === 'sstr' || cat === 'lstr') add('질주', PERK_AMT.straight * perkCount(p, 'straight'));
    if (cat === 'four') add('사냥 본능', 10 * perkCount(p, 'fourk'));
    if (cat === 'yacht') {
      add('요트 신봉자', PERK_AMT.yacht * perkCount(p, 'yacht'));
      add('도박사', p.cls === 'gambler' ? 10 : 0);
      add('요트 잭팟', ev === 'jackpot' ? 50 : 0);
    }
  }
  return { base, bonus, total: base + bonus.reduce((a, b) => a + b.amt, 0) };
}

// 특성·직업·이벤트까지 반영한 항목 점수
export function catScore(s, p, cat, d = s.dice) {
  return scoreParts(s, p, cat, d).total;
}

// 의뢰 보상 — 난이도가 높을수록 뒤집기·조정을 더 준다
export function questReward(s, p, qid) {
  const d = questInfo(qid).diff;
  const r = d >= 8 ? { flip: 2, nudge: 2 } : d >= 6 ? { flip: 1, nudge: 1 } : d >= 4 ? { flip: 1, nudge: 0 } : { flip: 0, nudge: 1 };
  r.flip += perkCount(p, 'fame');
  if (p.cls === 'bard') r.nudge += 1;
  const mul = event(s) === 'bounty' ? 2 : 1;
  r.flip *= mul; r.nudge *= mul;
  return r;
}
const rewardValue = r => r.flip * 8 + r.nudge * 6;

// 지금 주사위로 깰 수 있는 퀘스트 (보상 큰 순, 연쇄 의뢰면 2개)
export function claimableQuests(s, p = current(s), d = s.dice) {
  if (!d.length || d.includes(0)) return [];
  const ok = s.board.filter(q => questMet(q, d))
    .sort((a, b) => rewardValue(questReward(s, p, b)) - rewardValue(questReward(s, p, a)) || questInfo(b).xp - questInfo(a).xp);
  return ok.slice(0, perkCount(p, 'chain') ? 2 : 1);
}

export function xpMultiplier(s, p) {
  let m = 1 + 0.25 * perkCount(p, 'fast') + (p.cls === 'mage' ? 0.3 : 0);
  if (event(s) === 'festival') m *= 2;
  return m;
}

// 점수 칸마다 미리보기 (UI와 봇이 함께 쓴다)
export const BARD_BONUS = 1;
const bardBonus = (p, pts, quests) => (p.cls === 'bard' && quests.length && pts > 0 ? BARD_BONUS : 0);

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
    let pts = catScore(s, p, c.id);
    pts += bardBonus(p, pts, quests);
    const bonus = bonusList(s, p, c.id, quests);
    let xp = pts > 0 ? pts : ZERO_XP + (perkCount(p, 'insure') ? 20 : 0) + (event(s) === 'zen' ? 20 : 0);
    xp = Math.round((xp + qXp) * xpMultiplier(s, p));
    return { id: c.id, pts, xp, bonus, taken: false };
  });
}

export function upperSum(p) {
  return UPPER_IDS.reduce((a, id) => a + (p.scores[id] || 0), 0);
}
export const upperNeed = p => (p.cls === 'warrior' ? 50 : UPPER_NEED);
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

  const quests = claimableQuests(s, p);
  const bonus = bonusList(s, p, cat, quests);
  let pts = catScore(s, p, cat);
  pts += bardBonus(p, pts, quests);
  const before = cardTotal(p);
  p.scores[cat] = pts;
  p.roundScore = pts;
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
  if (s.boss) {
    // 점수(상단 보너스 달성분 포함)가 곧 피해. 드래곤 갑옷은 상단 피해를 깎는다.
    let dmg = cardTotal(p) - before;
    if (s.boss.id === 'dragon' && UPPER_IDS.includes(cat)) dmg *= 1 - [0.25, 0.5, 0.5][s.boss.diff];
    dealDamage(s, s.turn, Math.round(dmg), cat);
    if (pts === 0 && s.boss.id === 'orc' && !s.ended) {
      const heal = [10, 20, 30][s.boss.diff] * (enraged(s) ? 2 : 1);
      s.boss.hp = Math.min(s.boss.maxHp, s.boss.hp + heal);
      log(s, `그로크의 약탈! 체력 ${heal} 회복`);
      fx(s, { type: 'boss', skill: 'plunder', amount: heal });
    }
  }

  // 수도승: 굴림을 아낀 만큼 조정 충전
  if (p.cls === 'monk' && s.rollsLeft > 0) {
    log(s, `${p.name} · 수도승의 절제! 조정 +${s.rollsLeft}`);
    addCharges(s, p, { nudge: s.rollsLeft }, 'monk');
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

  const gained = Math.round(xp * xpMultiplier(s, p));
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
    if (perkId === 'toolkit') { p.flip += 1; p.nudge += 1; }
    if (perkId === 'nudgeBag') p.nudge += 3;
    if (perkId === 'bigKit') { p.flip += 2; p.nudge += 2; }
    log(s, `${p.name} · 「${k.ko}」 획득`);
    if (!p.offers.length && !s.ended) endTurn(s);
    return;
  }
  p.perks[perkId] = perkCount(p, perkId) + 1;
  // 칸 강화 특성은 이미 점수를 낸 칸에도 소급 적용 (0점으로 버린 칸은 제외)
  if (PERK_CATS[perkId]) {
    const before = cardTotal(p);
    const cats = PERK_CATS[perkId].filter(c => p.scores[c] > 0);
    cats.forEach(c => (p.scores[c] += PERK_AMT[perkId]));
    const gained = cardTotal(p) - before;   // 상단 보너스를 새로 달성하면 그것도 포함
    if (gained > 0) {
      log(s, `${p.name} · 「${k.ko}」 소급 적용 +${gained}`);
      fx(s, { type: 'retro', player: s.turn, perk: perkId, amount: gained, cats });
      if (s.boss) dealDamage(s, s.turn, gained, 'retro');
      if (s.ended) return;
    }
  }
  if (perkId === 'flip') p.flip += 2;
  if (perkId === 'nudge') p.nudge += 2;
  if (perkId === 'yacht') p.flip += 1;
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
    if (b?.id === 'lich' && every(s, [4, 3, 3][b.diff])) {
      const add = [12, 20, 28][b.diff] * s.players.length;
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
// 1대1 대전에서 상대가 1분 안에 돌아오지 않으면 기권패
export function forfeit(s, loser) {
  if (s.ended) return;
  s.ended = true;
  s.phase = 'over';
  s.forfeit = loser;
  log(s, `${s.players[loser].name} 연결 끊김 — 기권패`);
  fx(s, { type: 'over', won: false, forfeit: loser });
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

function valueOf(s, p, d) {
  let best = -Infinity;
  const left = CAT_IDS.filter(id => p.scores[id] === null);
  const late = left.length <= 3;   // 막판엔 기회비용이 의미가 없다
  for (const id of left) {
    const pts = catScore(s, p, id, d);
    let v = pts - (late ? 0 : EXPECT[id]);
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
    total += valueOf(s, p, nd);
  }
  return total / samples;
}

// 봇이 할 다음 행동 하나를 돌려준다. rng: () => [0,1)
export function botAction(s, rng = Math.random, samples = 24) {
  const p = current(s);
  if (s.phase === 'levelup') {
    return { type: 'perk', id: botPickPerk(p, p.offers[0], rng) };
  }
  if (!s.rolled) return { type: 'roll' };

  const n = s.dice.length;
  // 기술(뒤집기/조정)로 확 좋아지면 쓴다
  if (p.flip > 0 || p.nudge > 0) {
    const now = valueOf(s, p, s.dice);
    let bestGain = 5, bestAct = null;
    for (let i = 0; i < n; i++) {
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

  if (s.rollsLeft > 0) {
    const all = (1 << n) - 1;
    let bestMask = all, bestV = valueOf(s, p, s.dice);
    for (let mask = 0; mask < all; mask++) {
      const v = holdValue(s, p, mask, samples, rng);
      if (v > bestV + 0.5) { bestV = v; bestMask = mask; }
    }
    if (bestMask !== all) return { type: 'reroll', hold: [...Array(n)].map((_, i) => !!(bestMask & (1 << i))) };
  }

  let bestCat = null, bestV = -Infinity;
  const left = CAT_IDS.filter(id => p.scores[id] === null);
  const late = left.length <= 3;
  for (const id of left) {
    const pts = catScore(s, p, id);
    let v = pts - (late ? 0 : EXPECT[id]);
    const up = catInfo(id).up;
    if (up && pts > 0) v += (pts - 3 * up) * 0.6;
    if (v > bestV) { bestV = v; bestCat = id; }
  }
  return { type: 'score', cat: bestCat };
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
    case 'score': return commitScore(s, act.cat);
    case 'perk': return pickPerk(s, act.id);
  }
}
