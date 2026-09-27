// 시장 시세 · 오늘의 부탁. 날짜로 정해지므로 모든 사람이 같은 시세를 본다.
import { ITEMS, REQUEST_POOL, DAY_MS } from '../data.js';
import { hashStr, mulberry32, rngFor } from './rng.js';

export const dayOf = (now, epoch) => Math.floor((now - epoch) / DAY_MS) + 1;

// 오늘의 시세 배율 0.75 ~ 1.35
export function priceMult(day, id) {
  const r = mulberry32(hashStr(`${day}:${id}`))();
  return 0.75 + r * 0.6;
}

export function sellPrice(id, day, luk = 5) {
  const it = ITEMS[id];
  if (!it) return 0;
  const base = it.price * priceMult(day, id);
  return Math.max(1, Math.round(base * (1 + Math.max(0, luk - 5) * 0.01)));
}

export const buyPrice = id => Math.round((ITEMS[id]?.price || 0) * 1.4 + 5);

// 오늘 시세가 특히 좋은 물건 (게시판·시장 표시용)
export function hotItems(day, n = 3) {
  const ids = Object.keys(ITEMS).filter(id => ['crop', 'fish', 'ore', 'forage'].includes(ITEMS[id].type));
  return ids.map(id => [id, priceMult(day, id)]).sort((a, b) => b[1] - a[1]).slice(0, n);
}

// 오늘의 부탁 3개 (세계마다, 날마다 다름). 보상 = 시세의 2배 + 친밀도
export function dailyRequests(worldCode, day) {
  const rnd = rngFor(worldCode, 'req', day);
  const pool = [...REQUEST_POOL];
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const [id, n] = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    out.push({ key: `${day}-${i}`, id, n, reward: Math.round(ITEMS[id].price * n * 2 + 50) });
  }
  return out;
}
