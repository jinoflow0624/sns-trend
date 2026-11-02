// 공용 시계. 세계의 "오늘"은 { n(몇 일차), start(그날 오전 6시가 된 현실 시각) } 로 저장된다.
// 게임 1시간 = 현실 1분. 하루는 모두가 잠들거나 밤 12시(커피를 마신 사람이 깨어 있으면 새벽 2시)가 되면
// 누군가 다음 날로 넘기고, 그 순간이 다음 날 오전 6시가 된다.
import { DAY_MS, HOUR_MS, DAY_START_H } from '../data.js';

// hour 는 6 부터 늘어나기만 한다 (자정 = 24, 새벽 2시 = 26)
export function clockAt(now, day) {
  const n = day?.n || 1;
  const start = day?.start || now;
  const hour = DAY_START_H + Math.max(0, now - start) / HOUR_MS;
  const h = Math.floor(hour);
  return { day: n, hour, h, m: Math.floor((hour % 1) * 60) };
}

// 예전 세계(세계를 만든 시각 기준으로 24분마다 날이 바뀌던 방식)를 새 방식으로 옮길 때 쓰는 오늘
export function legacyDay(now, epoch) {
  const el = now - epoch + DAY_START_H * HOUR_MS;
  const n = Math.floor(el / DAY_MS) + 1;
  const hour = (el % DAY_MS) / HOUR_MS;
  // 새벽(0~6시)이었다면 그 날 아침 6시로 새로 시작한다
  const start = hour >= DAY_START_H ? now - (hour - DAY_START_H) * HOUR_MS : now;
  return { n, start: Math.round(start) };
}

// 밤 어둡기 0 ~ 1
export function darkness(hour) {
  if (hour >= 6.5 && hour < 18) return 0;
  if (hour >= 18 && hour < 20.5) return (hour - 18) / 2.5 * 0.62;
  if (hour >= 20.5 || hour < 4.5) return 0.62;
  return (6.5 - hour) / 2 * 0.62; // 4.5 ~ 6.5 새벽
}

export const fmtClock = c => {
  const h24 = c.h % 24;
  const ap = h24 < 12 ? '오전' : '오후';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${ap} ${h12}:${String(Math.floor(c.m / 10) * 10).padStart(2, '0')}`;
};
