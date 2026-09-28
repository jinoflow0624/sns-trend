// "대화하기": 오늘 볼 장면 고르기 · 선택지 결과. friend = me.friends[npcId] { pts, day, gift, dated, ev }
import { DATES } from '../dates.js';
import { hashStr } from './rng.js';

export const heartsOf = f => Math.min(10, Math.floor((f?.pts || 0) / 50));

// 아직 안 본 특별 이야기 중 하트가 찬 가장 앞의 것, 없으면 오늘의 이야기
export function pickScene(npcId, f, day, n = 0) {
  const D = DATES[npcId];
  if (!D) return null;
  const h = heartsOf(f);
  for (const k of Object.keys(D.events || {}).map(Number).sort((a, b) => a - b)) {
    if (h >= k && !f?.ev?.[k]) return { npcId, key: `e${k}`, event: k, ...D.events[k] };
  }
  // 같은 날 여러 번 말 걸면 다음 이야기로 (친밀도는 하루 한 번만)
  const i = (day + hashStr(npcId) + n) % D.topics.length;
  return { npcId, key: `t${i}`, ...D.topics[i] };
}

// 오늘 친밀도가 오르는 대화인가 (특별 이야기는 처음 볼 때 늘 오른다)
export const countsToday = (f, scene, day) => !!scene.event || f?.dated !== day;

// 선택 → f 를 고치고 결과를 돌려준다
export function choose(f, scene, idx, day) {
  const c = scene.choices[idx];
  if (!c) return null;
  const [, pts, reply, emote] = c;
  const before = heartsOf(f);
  const counted = countsToday(f, scene, day);
  const gain = counted ? pts : 0;
  f.pts = Math.max(0, (f.pts || 0) + gain);
  if (scene.event) (f.ev ||= {})[scene.event] = day;
  else if (counted) f.dated = day;
  return { reply, emote, gain, counted, hearts: heartsOf(f), up: heartsOf(f) > before };
}
