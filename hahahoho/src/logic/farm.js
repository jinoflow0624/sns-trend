// 농사. 밭 한 칸 = { tilled, crop, progress(0~1), at(마지막 계산 시각), wetUntil }
// 성장은 현실 시간으로 계산한다. 아무도 접속하지 않아도 자라는 방치형 구조.

import { CROPS, WET_MS, MIN } from '../data.js';
import { randInt } from './rng.js';

export const DRY_RATE = 0.5; // 물이 마르면 이 비율로 자란다

// at 부터 now 까지 자란 양 (1을 넘을 수 있음 — 밭 일꾼이 여러 번 수확할 때 쓴다)
export function rawProgress(plot, now, bonus = 0) {
  if (!plot?.crop) return 0;
  const c = CROPS[plot.crop];
  if (!c) return 0;
  const from = plot.at ?? now;
  if (now <= from) return plot.progress || 0;
  const wetEnd = Math.min(now, Math.max(from, plot.wetUntil || 0));
  const wetMs = wetEnd - from;
  const dryMs = now - from - wetMs;
  const perMs = (1 + bonus) / (c.grow * MIN);
  return (plot.progress || 0) + perMs * (wetMs + dryMs * DRY_RATE);
}

// at 부터 now 까지 자란 양을 반영한 새 progress (0~1)
export const progressAt = (plot, now, bonus = 0) => Math.min(1, rawProgress(plot, now, bonus));

// 밭 일꾼 수확: 다 자란 횟수만큼 거두고 같은 작물을 다시 심는다 (최대 12번)
export function helperHarvest(plot, now, rnd, bonus = 0) {
  const raw = rawProgress(plot, now, bonus);
  if (raw < 1) return null;
  const c = CROPS[plot.crop];
  const cycles = Math.min(12, Math.floor(raw));
  let n = 0;
  for (let i = 0; i < cycles; i++) n += randInt(rnd, c.yield[0], c.yield[1]);
  return {
    plot: { ...plot, progress: cycles >= 12 ? 0 : raw - cycles, at: now },
    item: plot.crop,
    n,
    cycles,
    xp: c.xp * cycles,
  };
}

// 0: 씨앗, 1~3: 자라는 중, 4: 수확 가능
export function stageOf(plot, now, bonus = 0) {
  const p = progressAt(plot, now, bonus);
  if (p >= 1) return 4;
  return Math.min(3, Math.floor(p * 4));
}

export const isWet = (plot, now) => (plot?.wetUntil || 0) > now;
export const isRipe = (plot, now, bonus) => !!plot?.crop && progressAt(plot, now, bonus) >= 1;

// 남은 시간(ms, 물을 계속 준다고 가정)
export function timeLeft(plot, now, bonus = 0) {
  if (!plot?.crop) return 0;
  const p = progressAt(plot, now, bonus);
  return Math.max(0, (1 - p) * CROPS[plot.crop].grow * MIN / (1 + bonus));
}

// 아래 함수들은 새 밭 상태를 돌려준다 (원본은 건드리지 않음 → 트랜잭션에 쓰기 좋다)
export function till(plot) {
  if (plot?.tilled) return null;
  return { tilled: true, crop: null, progress: 0, at: 0, wetUntil: plot?.wetUntil || 0 };
}

export function plant(plot, crop, now) {
  if (!plot?.tilled || plot.crop || !CROPS[crop]) return null;
  return { ...plot, crop, progress: 0, at: now };
}

export function water(plot, now, bonus = 0) {
  if (!plot?.tilled) return null;
  if (isWet(plot, now)) return null;
  return { ...plot, progress: plot.crop ? progressAt(plot, now, bonus) : 0, at: now, wetUntil: now + WET_MS };
}

// 수확: 새 밭 상태와 얻은 개수. 수확 후 밭은 갈린 채로 남는다.
export function harvest(plot, now, rnd, { bonus = 0, extraChance = 0 } = {}) {
  if (!isRipe(plot, now, bonus)) return null;
  const c = CROPS[plot.crop];
  let n = randInt(rnd, c.yield[0], c.yield[1]);
  if (rnd() < extraChance) n++;
  return {
    plot: { tilled: true, crop: null, progress: 0, at: 0, wetUntil: plot.wetUntil || 0 },
    item: plot.crop,
    n,
    xp: c.xp,
  };
}
