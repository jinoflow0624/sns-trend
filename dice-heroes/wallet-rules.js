// 보석 가격 · 보상 규칙 — 게임(wallet.js)과 서버(dice-heroes-prod/functions)가 같은 파일을 쓴다.
// 서버 쪽 사본은 dice-heroes-prod/build.mjs 가 functions/shared/ 로 복사한다 (여기만 고치면 된다).

export const STARTER_GEMS = 30000;           // 지금은 모든 사용자에게 기본 지급 (테스트 기간)
// 직업: 봇 1대1 승률이 높을수록 비싸게 (마법사 58% · 음유시인 51% · 전사 50% · 도적 45%). 도박사·수도승은 무료
export const CLASS_PRICE = { rogue: 600, warrior: 900, bard: 1000, mage: 1500, dancer: 1500, outlaw: 1800, sharper: 1800 };
export const DICE_PRICE = { openheart: 1500, cosmic: 1500, gold: 1200, clear: 1000, heart: 1000, keycap: 1000, black: 900, minimal: 800 };
export const TRAY_PRICE = { demon: 1000, lava: 1000, starry: 1000, royal: 800, deepsea: 800, sakura: 700 };
export const PRICE = { cls: CLASS_PRICE, dice: DICE_PRICE, tray: TRAY_PRICE };
export const priceOf = (kind, id) => PRICE[kind]?.[id] || 0;

export const VS_WIN = 100, VS_WIN_BOT = 30, VS_DAILY = 3;
export const BOSS_WIN = [30, 50, 80];                 // 쉬움 · 보통 · 어려움
export const BOSS_MUL = { demon: 1.2 };               // 마왕은 1.2배
export const FIRST_CLEAR_MUL = 3;                     // 보스 · 난이도별 첫 클리어는 3배
export const SCORE_PER_100 = 5;                       // 최종 점수 백의 자리 × 5 (져도)
export const LEFTOVER_PER_3 = 10;                     // 대전: 남은 뒤집기+조정 3개마다 10

// 서버가 확인할 수 없는 판(오프라인 봇전·한 기기 여럿)에 거는 제한
export const MIN_RUN_MS = 60 * 1000;                  // 시작하고 1분은 지나야 정산
export const UNVERIFIED_DAILY = 15;                   // 하루 15판까지만 보상
export const MAX_SCORE = 1500;                        // 점수는 이 이상 인정하지 않는다
export const CHARGE_CAP = 3;                          // 뒤집기 · 조정 보유 한도

// 한 판 끝났을 때 받을 보석 (내용별로). info: { mode, win, online, humans, score, flip, nudge, boss, diff, firstClear, vsLeft }
export function rewardFor(info) {
  const parts = [];
  if (info.mode === 'versus') {
    if (info.win) {
      const vsHuman = info.online && info.humans > 1;
      if (info.vsLeft > 0) parts.push({ id: 'win', ko: vsHuman ? '대전 승리' : '대전 승리 (봇 상대)', gems: vsHuman ? VS_WIN : VS_WIN_BOT, vs: true });
      else parts.push({ id: 'win', ko: `대전 승리 (오늘 ${VS_DAILY}회 다 받음)`, gems: 0, vs: false });
    }
    const left = Math.floor(((info.flip || 0) + (info.nudge || 0)) / 3) * LEFTOVER_PER_3;
    if (left) parts.push({ id: 'left', ko: `남은 기술 ${(info.flip || 0) + (info.nudge || 0)}개`, gems: left });
  } else if (info.win) {
    const base = Math.round(BOSS_WIN[info.diff] * (BOSS_MUL[info.boss] || 1));
    parts.push({ id: 'boss', ko: info.firstClear ? '보스 토벌 (첫 클리어 ×3)' : '보스 토벌', gems: base * (info.firstClear ? FIRST_CLEAR_MUL : 1) });
  }
  const sc = Math.floor(Math.max(0, info.score) / 100) * SCORE_PER_100;
  if (sc) parts.push({ id: 'score', ko: `점수 ${info.score}`, gems: sc });
  return { parts, total: parts.reduce((a, p) => a + p.gems, 0) };
}

// 일일 보상: 하루 한 번 주사위 5개를 굴려 눈의 합만큼 보석 (5개가 모두 같으면 = 요트, 합의 10배)
export const DAILY_YACHT_MUL = 10;
export function dailyGems(dice) {
  const sum = dice.reduce((a, d) => a + d, 0);
  const yacht = dice.length === 5 && dice.every(d => d === dice[0]);
  return { sum, yacht, gems: yacht ? sum * DAILY_YACHT_MUL : sum };
}

// 오늘 = 한국 시간 자정 기준 날짜 번호
export const dayOf = now => Math.floor((now + 9 * 3600 * 1000) / 86400000);
