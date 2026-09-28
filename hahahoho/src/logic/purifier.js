// 정수기로 커피 내리기. 정수기 한 대의 상태는 가구 칸에 함께 저장된다.
//   w: 남은 물(잔 수) · b: 내리는 중인 커피콩 수 · t: 지금 내리는 잔을 시작한 시각 · r: 다 내려서 기다리는 잔 수
// 한 잔에 BREW_MS 씩, 넣은 순서대로 내린다. 모든 함수는 트랜잭션 안에서 쓰는 순수 함수(새 상태 또는 null).
import { BREW_MS, CUPS_PER_BUCKET } from '../data.js';

// 지난 시간만큼 내린 잔을 r 로 옮긴 상태
export function brewState(f, now) {
  const s = { w: f?.w || 0, b: f?.b || 0, t: f?.t || 0, r: f?.r || 0 };
  if (s.b > 0 && s.t) {
    const done = Math.min(s.b, Math.floor((now - s.t) / BREW_MS));
    if (done > 0) {
      s.b -= done;
      s.r += done;
      s.t = s.b > 0 ? s.t + done * BREW_MS : 0;
    }
  }
  if (!s.b) s.t = 0;
  return s;
}

// 지금 내리는 잔의 진행도 0~1 (내리는 게 없으면 0)
export function brewProgress(f, now) {
  const s = brewState(f, now);
  return s.b > 0 ? Math.min(1, (now - s.t) / BREW_MS) : 0;
}

// 물 양동이 끼우기 (물이 다 떨어졌을 때만)
export function loadWater(f, now) {
  const s = brewState(f, now);
  if (s.w > 0) return null;
  return { ...f, ...s, w: CUPS_PER_BUCKET };
}

// 커피콩 n개 넣기 → { next, used } (물이 모자라면 있는 만큼만)
export function addBeans(f, n, now) {
  const s = brewState(f, now);
  const used = Math.min(n, s.w);
  if (used <= 0) return { next: null, used: 0 };
  return { next: { ...f, ...s, w: s.w - used, b: s.b + used, t: s.b > 0 ? s.t : now }, used };
}

// 다 내린 커피 꺼내기 → { next, cups }
export function takeCups(f, now) {
  const s = brewState(f, now);
  if (!s.r) return { next: null, cups: 0 };
  return { next: { ...f, ...s, r: 0 }, cups: s.r };
}
