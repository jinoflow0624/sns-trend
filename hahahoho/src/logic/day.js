// 하루의 끝: 잠 · 기절 · 가판대 정산. 시계·네트워크와 떨어진 순수 규칙이라 테스트에서 그대로 쓴다.
import { BEDTIME_H, COFFEE_H, ITEMS } from '../data.js';
import { sellPrice } from './market.js';

// 하루를 끝낼 때인가?
//   hour: 오늘 시각(6 → 24 → 26)
//   awake: 아직 깨어 있는 (접속 중) 사람들 [{ caff: 오늘 커피를 마셨는지 }]
export function shouldEndDay(hour, awake) {
  if (!awake.length) return true;                  // 모두 잠들었다 (먼저 잔 사람은 기다리고 있었다)
  if (hour >= COFFEE_H) return true;               // 새벽 2시: 커피를 마셔도 한계
  if (hour >= BEDTIME_H) return !awake.some(p => p.caff); // 자정: 커피 마신 사람이 없으면 끝
  return false;
}

// 나는 지금 쓰러져야 하나? (자정이 넘었는데 커피 없이 깨어 있거나, 새벽 2시가 넘었거나)
export const mustPassOut = (hour, caff) => hour >= (caff ? COFFEE_H : BEDTIME_H);

// 다음 날 아침의 체력·기력
//   slept: 침대에서 잤다 → 가득
//   faint: 밤늦게 쓰러졌다 → 체력 최대치의 절반, 기력 3분의 1
//   away: 접속하지 않은 동안 날이 바뀌었다 → 가득 (집에서 잘 쉰 것으로 친다)
export function wakeStats(outcome, st) {
  if (outcome === 'faint') return { hp: Math.ceil(st.hp / 2), en: Math.ceil(st.en / 3) };
  return { hp: st.hp, en: st.en };
}

// 가판대 정산. stall = { d: 올린 날, items: { id: 개수 } } → 올린 날의 시세로 판다.
// bonus: 봄이 친밀도 등 판매가 보너스 비율
export function settleStall(stall, { luk = 5, bonus = 0 } = {}) {
  const lines = [];
  let total = 0;
  for (const [id, n] of Object.entries(stall?.items || {})) {
    if (!ITEMS[id] || !(n > 0)) continue;
    const each = Math.round(sellPrice(id, stall.d || 1, luk) * (1 + bonus));
    lines.push({ id, n, each, gold: each * n });
    total += each * n;
  }
  lines.sort((a, b) => b.gold - a.gold);
  return { lines, total };
}
