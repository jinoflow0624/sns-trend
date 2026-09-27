// 인벤토리. 칸 배열(각 칸은 { id, n } 또는 null). 가득 차면 넘친 만큼 돌려준다.
// 넘친 물건은 호출하는 쪽이 보관함(stash)에 넣는다 — 물건이 사라지는 일은 없게.

import { ITEMS } from '../data.js';

export const INV_SIZE = 24;
export const HOTBAR = 8;

export const makeInv = (size = INV_SIZE) => Array(size).fill(null);
const stackOf = id => ITEMS[id]?.stack ?? 99;

export function count(inv, id) {
  let n = 0;
  for (const s of inv) if (s && s.id === id) n += s.n;
  return n;
}

// 넣고 남은 개수를 돌려준다
export function add(inv, id, n = 1) {
  if (!ITEMS[id] || n <= 0) return n;
  const max = stackOf(id);
  for (const s of inv) {
    if (n <= 0) break;
    if (s && s.id === id && s.n < max) {
      const put = Math.min(max - s.n, n);
      s.n += put;
      n -= put;
    }
  }
  for (let i = 0; i < inv.length && n > 0; i++) {
    if (!inv[i]) {
      const put = Math.min(max, n);
      inv[i] = { id, n: put };
      n -= put;
    }
  }
  return n;
}

export function canAdd(inv, id, n = 1) {
  const max = stackOf(id);
  let room = 0;
  for (const s of inv) {
    if (!s) room += max;
    else if (s.id === id) room += max - s.n;
    if (room >= n) return true;
  }
  return room >= n;
}

// 모자라면 아무것도 빼지 않고 false
export function remove(inv, id, n = 1) {
  if (count(inv, id) < n) return false;
  for (let i = inv.length - 1; i >= 0 && n > 0; i--) {
    const s = inv[i];
    if (s && s.id === id) {
      const take = Math.min(s.n, n);
      s.n -= take;
      n -= take;
      if (s.n === 0) inv[i] = null;
    }
  }
  return true;
}

export const hasAll = (inv, list) => list.every(([id, n]) => count(inv, id) >= n);

export function removeAll(inv, list) {
  if (!hasAll(inv, list)) return false;
  for (const [id, n] of list) remove(inv, id, n);
  return true;
}

// 칸 옮기기: 같은 물건이면 합치고, 아니면 자리 바꾸기
export function move(inv, from, to) {
  if (from === to || !inv[from]) return;
  const a = inv[from];
  const b = inv[to];
  if (b && b.id === a.id) {
    const max = stackOf(a.id);
    const put = Math.min(max - b.n, a.n);
    b.n += put;
    a.n -= put;
    if (a.n === 0) inv[from] = null;
    return;
  }
  inv[from] = b;
  inv[to] = a;
}

export function removeAt(inv, idx, n = 1) {
  const s = inv[idx];
  if (!s || s.n < n) return null;
  s.n -= n;
  if (s.n === 0) inv[idx] = null;
  return s.id;
}

// 보관함(무제한, id → 개수)
export function stashAdd(stash, id, n) {
  if (n > 0) stash[id] = (stash[id] || 0) + n;
}

// 가방에 넣되 넘치면 보관함으로. 보관함으로 간 개수를 돌려준다.
export function give(p, id, n = 1) {
  const left = add(p.inv, id, n);
  if (left > 0) stashAdd(p.stash, id, left);
  return left;
}

export function sortInv(inv) {
  const order = ['seed', 'food', 'crop', 'forage', 'fish', 'ore', 'drop', 'mat', 'cloth', 'furniture'];
  // 핫바(앞 8칸)는 그대로 두고 나머지만 정리
  const rest = inv.slice(HOTBAR).filter(Boolean);
  const merged = makeInv(0);
  for (const s of rest) {
    const same = merged.find(m => m.id === s.id && m.n < stackOf(s.id));
    if (same) {
      const put = Math.min(stackOf(s.id) - same.n, s.n);
      same.n += put;
      if (s.n - put > 0) merged.push({ id: s.id, n: s.n - put });
    } else merged.push({ ...s });
  }
  merged.sort((a, b) => order.indexOf(ITEMS[a.id].type) - order.indexOf(ITEMS[b.id].type) || a.id.localeCompare(b.id));
  for (let i = HOTBAR; i < inv.length; i++) inv[i] = merged[i - HOTBAR] || null;
}
