// "대화하기": 오늘 볼 장면 고르기 · 선택지 결과. friend = me.friends[npcId] { pts, day, gift, dated, ev }
import { DATES, CLOSE, MARRIED } from '../dates.js';
import { NPCS, MARRY_PTS } from '../data.js';
import { hashStr } from './rng.js';

export const heartsOf = f => Math.min(10, Math.floor((f?.pts || 0) / 50));
export const CLOSE_HEARTS = 5;

// 아직 안 본 특별 이야기 중 하트가 찬 가장 앞의 것, 없으면 오늘의 이야기.
// 하트 5개(50%)부터는 가까운 사이의 이야기가, 결혼하면 부부의 이야기가 섞여 나온다.
export function pickScene(npcId, f, day, n = 0, { married = false } = {}) {
  const D = DATES[npcId];
  if (!D) return null;
  const h = heartsOf(f);
  for (const k of Object.keys(D.events || {}).map(Number).sort((a, b) => a - b)) {
    if (h >= k && !f?.ev?.[k]) return { npcId, key: `e${k}`, event: k, ...D.events[k] };
  }
  let pool = D.topics.map((sc, i) => [`t${i}`, sc]);
  if (h >= CLOSE_HEARTS) pool = pool.concat((CLOSE[npcId] || []).map((sc, i) => [`c${i}`, sc]));
  if (married) pool = (MARRIED[npcId]?.topics || []).map((sc, i) => [`m${i}`, sc]).concat((CLOSE[npcId] || []).map((sc, i) => [`c${i}`, sc]));
  // 같은 날 여러 번 말 걸면 다음 이야기로 (친밀도는 하루 한 번만)
  const [key, sc] = pool[(day + hashStr(npcId) + n) % pool.length];
  return { npcId, key, close: key[0] === 'c', married: key[0] === 'm', ...sc };
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
  f.pts = Math.max(0, Math.min(1000, (f.pts || 0) + gain));
  if (scene.event) (f.ev ||= {})[scene.event] = day;
  else if (counted) f.dated = day;
  return { reply, emote, gain, counted, hearts: heartsOf(f), up: heartsOf(f) > before };
}

// ── 결혼 ─────────────────────────────────────────────────────────────────────
// 청혼할 수 있나 → { ok, why }
export function canPropose(me, npcId, hasRing) {
  const N = NPCS[npcId];
  if (!N?.spouse) return { ok: false, why: '결혼할 수 없는 상대예요' };
  if (!me.gender) return { ok: false, why: '캐릭터 창에서 성별을 먼저 골라 주세요' };
  if (N.gender === me.gender) return { ok: false, why: '다른 성별의 주민에게만 청혼할 수 있어요' };
  if (me.spouse) return { ok: false, why: '이미 결혼했어요' };
  if ((me.friends?.[npcId]?.pts || 0) < MARRY_PTS) return { ok: false, why: '하트 10개가 되어야 청혼할 수 있어요' };
  if (!hasRing) return { ok: false, why: '청혼 반지가 필요해요 (시장에서 사거나 용광로에서 금광석 3 · 자수정 1로 제작)' };
  return { ok: true };
}
// 결혼 상대 후보인가 (버튼을 보여 줄지)
export const isCandidate = (me, npcId) => !!NPCS[npcId]?.spouse && (!me.gender || NPCS[npcId].gender !== me.gender);
