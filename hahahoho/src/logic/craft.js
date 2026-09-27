// 요리 · 재봉 · 목공.
import { RECIPES, STATION_SKILL, ITEMS, JOBS } from '../data.js';
import { count, remove, give } from './inventory.js';
import { gainXp } from './player.js';

export const recipesFor = station => RECIPES.filter(r => r.station === station);

// 재료 목록을 실제로 쓸 아이템으로 풀기 (대체 재료 허용: 생선구이는 붕어·잉어·송어 중 아무거나)
export function resolveInputs(inv, recipe) {
  const out = [];
  for (const [id, n] of recipe.in) {
    const options = [id, ...(recipe.alt?.[id] || [])];
    const found = options.find(o => count(inv, o) >= n);
    out.push([found || id, n, !!found]);
  }
  return out;
}

export function canCraft(p, recipe) {
  const skill = STATION_SKILL[recipe.station];
  if (p.skills[skill].lv < recipe.lv) return { ok: false, msg: `${recipe.lv}레벨이 필요합니다.` };
  const inputs = resolveInputs(p.inv, recipe);
  const missing = inputs.filter(([, , ok]) => !ok);
  if (missing.length) return { ok: false, msg: `재료 부족: ${missing.map(([id, n]) => `${ITEMS[id].name} ${n}`).join(', ')}` };
  return { ok: true, inputs };
}

// 만들기. 재봉사는 재료를 가끔 아끼고, 요리사는 가끔 두 개 만든다.
export function craft(p, recipe, rnd = Math.random) {
  const chk = canCraft(p, recipe);
  if (!chk.ok) return chk;
  const perk = JOBS[p.job]?.perk || {};
  const skill = STATION_SKILL[recipe.station];
  let saved = null;
  for (const [id, n] of chk.inputs) {
    let use = n;
    if (recipe.station === 'sewing' && perk.saveMat && n > 1 && rnd() < perk.saveMat) { use = n - 1; saved = id; }
    remove(p.inv, id, use);
  }
  let [outId, outN] = recipe.out;
  if (recipe.station === 'stove' && perk.doubleCook && rnd() < perk.doubleCook) outN *= 2;
  const toStash = give(p, outId, outN);
  const ups = gainXp(p, skill, recipe.xp);
  if (skill === 'cook') p.stats.cooked += outN; else p.stats.sewn += outN;
  return {
    ok: true,
    item: outId,
    n: outN,
    ups,
    msg: `${ITEMS[outId].name} ${outN}개 완성!${saved ? ` (${ITEMS[saved].name} 한 개 절약)` : ''}${toStash ? ' · 가방이 가득 차 보관함으로' : ''}`,
  };
}
