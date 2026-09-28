// NPC 인사말. 말을 걸 때마다 무작위로 고르고, 몇몇은 가끔 이스터에그 인사를 한다.
import { NPCS, NPC_SECRET_LINES, SECRET_CHANCE, COUPLE_START } from '../data.js';

// 지노·하영 기념일: 2019-05-28 을 1일차로 센 오늘의 날수 (기기의 현지 날짜 기준)
export function coupleDay(now = Date.now()) {
  const [y, m, d] = COUPLE_START;
  const start = new Date(y, m - 1, d);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today - start) / 86400000) + 1;
}

// → 대사 문자열 ({heart} 는 화면에서 하트 아이콘으로 바꾼다)
export function greeting(npcId, rnd = Math.random, now = Date.now(), name = '') {
  const secret = NPC_SECRET_LINES[npcId];
  const pool = secret?.length && rnd() < SECRET_CHANCE ? secret : NPCS[npcId]?.lines || ['…'];
  const line = pool[Math.floor(rnd() * pool.length) % pool.length];
  return line.replace('{N}', coupleDay(now).toLocaleString('ko-KR')).replaceAll('{name}', name || '친구');
}
