// 결정적 난수. 같은 씨앗이면 모든 기기에서 같은 결과가 나온다
// (NPC 위치, 광산 지형, 시장 시세, 오늘의 부탁을 동기화 없이 맞추는 데 쓴다).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const rngFor = (...parts) => mulberry32(hashStr(parts.join('|')));

// 좌표용 빠른 해시 (0~1)
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const randInt = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// [[값, 가중치], ...] 에서 하나 고르기
export function weighted(rnd, table) {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [v, w] of table) { r -= w; if (r <= 0) return v; }
  return table[table.length - 1][0];
}
