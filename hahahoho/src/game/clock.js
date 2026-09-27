// 공용 시계. 세계가 만들어진 시각(epoch)을 기준으로 모두가 같은 시간을 본다.
// 새 세계는 아침 6시에 시작한다. 게임 하루 = 현실 24분.
import { DAY_MS, HOUR_MS } from '../data.js';

const START_H = 6;

export function clockOf(now, epoch) {
  const el = now - epoch + START_H * HOUR_MS;
  const day = Math.floor(el / DAY_MS) + 1;
  const hour = (el % DAY_MS) / HOUR_MS;
  return { day, hour, h: Math.floor(hour), m: Math.floor((hour % 1) * 60) };
}

// 밤 어둡기 0 ~ 1
export function darkness(hour) {
  if (hour >= 6.5 && hour < 18) return 0;
  if (hour >= 18 && hour < 20.5) return (hour - 18) / 2.5 * 0.62;
  if (hour >= 20.5 || hour < 4.5) return 0.62;
  return (6.5 - hour) / 2 * 0.62; // 4.5 ~ 6.5 새벽
}

export const fmtClock = c => {
  const ap = c.h < 12 ? '오전' : '오후';
  const h12 = c.h % 12 === 0 ? 12 : c.h % 12;
  return `${ap} ${h12}:${String(Math.floor(c.m / 10) * 10).padStart(2, '0')}`;
};

// 다음 날이 시작되는 시각
export const nextDayAt = (now, epoch) => {
  const el = now - epoch + START_H * HOUR_MS;
  return now + (DAY_MS - (el % DAY_MS));
};
