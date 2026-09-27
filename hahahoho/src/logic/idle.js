// 방치 창고. 캐릭터가 고른 활동(p.idle)을 idleAt 이후로 계속한 것으로 치고 수확물을 준다 (현실 시간 기준).
// 같은 입력이면 같은 결과가 나오도록 씨앗 난수를 쓴다.

import { IDLE_JOBS, IDLE_CAP_H, JOBS, REAL_HOUR } from '../data.js';
import { mulberry32 } from './rng.js';

const JOB_MATCH = { farmer: 'farm', miner: 'mine', fisher: 'fish', hunter: 'hunt' };

export function idleCapHours(houseLv = 1) {
  return houseLv >= 4 ? 16 : IDLE_CAP_H;
}

// → { hours, items: [[id, n]], xp, skill }  (1분 미만이면 null)
export function computeIdle(p, elapsedMs, { seed = 1, houseLv = 1 } = {}) {
  const job = IDLE_JOBS[p.idle] || IDLE_JOBS.farm;
  const cap = idleCapHours(houseLv) * REAL_HOUR;
  const ms = Math.max(0, Math.min(elapsedMs, cap));
  if (ms < 60 * 1000) return null;
  const hours = ms / REAL_HOUR;
  const lv = p.skills[job.skill]?.lv || 1;
  // 기술 레벨당 +12%, 자기 직업 활동이면 +30%, 집 5단계면 +25%
  let mult = 1 + (lv - 1) * 0.12;
  if (JOB_MATCH[p.job] === p.idle) mult *= 1.3;
  if (houseLv >= 5) mult *= 1.25;
  const rnd = mulberry32(seed);
  const items = [];
  for (const [id, perHour] of job.table) {
    const expected = perHour * hours * mult;
    // 기대값 근처로 흔들되 음수는 없게
    const n = Math.max(0, Math.floor(expected * (0.8 + rnd() * 0.4) + rnd()));
    if (n > 0) items.push([id, n]);
  }
  return { hours, items, xp: Math.round(hours * 25 * mult), skill: job.skill, name: job.name };
}

export { JOBS };
