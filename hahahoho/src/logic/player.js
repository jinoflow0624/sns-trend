// 캐릭터: 생성 · 능력치 계산 · 경험치 · 음식 · 장비.
import { JOBS, SKILLS, ITEMS, TOOLS, xpForLevel, MAX_SKILL } from '../data.js';
import { makeInv, give, removeAt } from './inventory.js';

export const LOOK_DEFAULT = { skin: '#f6d2b0', hair: '#5a3a2a', top: '#e0605a', bottom: '#4a5a8a', hairStyle: 'short' };

export function createPlayer({ id, name, job, look, gender }, now = Date.now()) {
  const J = JOBS[job] || JOBS.farmer;
  const skills = {};
  for (const k of Object.keys(SKILLS)) skills[k] = { lv: J.skills[k] || 1, xp: 0 };
  const tools = { hoe: 1, can: 1, pick: 1, axe: 1, rod: 1, sword: 1, ...J.tools };
  const p = {
    v: 1,
    id,
    name: String(name || '주민').slice(0, 10),
    job: JOBS[job] ? job : 'farmer',
    gender: gender === 'f' || gender === 'm' ? gender : null,
    look: { ...LOOK_DEFAULT, ...(look || {}) },
    base: { ...J.stats },
    hp: J.stats.hp,
    en: J.stats.en,
    gold: 300,
    skills,
    tools,
    inv: makeInv(),
    stash: {},
    equip: { hat: null, top: null },
    buffs: [],
    idle: { farmer: 'farm', miner: 'mine', fisher: 'fish', hunter: 'hunt', cook: 'forage', tailor: 'forage' }[job] || 'farm',
    friends: {},
    done: {},
    stats: { harvested: 0, mined: 0, fished: 0, hunted: 0, cooked: 0, sewn: 0 },
    createdAt: now,
    lastSeen: now,
    map: 'farm',
    x: 9.5, y: 10.5,
  };
  for (const [id2, n] of J.items) give(p, id2, n);
  return p;
}

// 버프 정리 (만료된 것 제거)
export function activeBuffs(p, now = Date.now()) {
  p.buffs = (p.buffs || []).filter(b => b.until > now);
  return p.buffs;
}

// 최종 능력치: 기본 + 기술 레벨 성장 + 장비 + 버프
export function statsOf(p, now = Date.now()) {
  const s = { ...p.base };
  const lvSum = Object.values(p.skills).reduce((a, k) => a + k.lv - 1, 0);
  s.hp += (p.skills.combat.lv - 1) * 8 + lvSum * 2;
  s.en += lvSum * 3;
  s.str += Math.floor((p.skills.combat.lv - 1 + p.skills.mine.lv - 1) / 3);
  s.dex += Math.floor((p.skills.fish.lv - 1) / 3);
  s.crf += Math.floor((p.skills.cook.lv - 1 + p.skills.sew.lv - 1) / 3);
  const skillBonus = {};
  const clothBonus = JOBS[p.job]?.perk?.clothBonus || 0;
  for (const slot of ['hat', 'top']) {
    const it = ITEMS[p.equip?.[slot]];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.bonus || {})) {
      if (k in s) s[k] += v + (['hp', 'en'].includes(k) ? clothBonus * 5 : clothBonus);
      else skillBonus[k] = (skillBonus[k] || 0) + v;
    }
  }
  for (const b of activeBuffs(p, now)) for (const [k, v] of Object.entries(b.stats)) s[k] = (s[k] || 0) + v;
  s.skill = k => Math.min(MAX_SKILL + 3, p.skills[k].lv + (skillBonus[k] || 0));
  return s;
}

export const maxHp = (p, now) => statsOf(p, now).hp;
export const maxEn = (p, now) => statsOf(p, now).en;

// 경험치. 레벨업하면 [{ skill, lv }] 를 돌려준다.
export function gainXp(p, skill, amount) {
  const sk = p.skills[skill];
  if (!sk || amount <= 0) return [];
  const ups = [];
  sk.xp += Math.round(amount);
  while (sk.lv < MAX_SKILL && sk.xp >= xpForLevel(sk.lv)) {
    sk.xp -= xpForLevel(sk.lv);
    sk.lv++;
    ups.push({ skill, lv: sk.lv });
  }
  if (sk.lv >= MAX_SKILL) sk.xp = Math.min(sk.xp, xpForLevel(sk.lv));
  return ups;
}

export const totalLevel = p => Object.values(p.skills).reduce((a, k) => a + k.lv, 0);

// 기력 사용. 모자라면 false.
export function spendEn(p, n) {
  if (p.en < n) return false;
  p.en -= n;
  return true;
}

// 도구 기력 소모: 도구 단계가 높을수록 덜 든다
export const toolCost = (p, tool) => Math.max(1, 5 - (p.tools[tool] || 1)); // 나무 4 · 구리 3 · 철 2 · 금 1

export function eat(p, invIdx, now = Date.now()) {
  const s = p.inv[invIdx];
  const it = s && ITEMS[s.id];
  if (!it || it.type !== 'food') return { ok: false, msg: '먹을 수 없는 물건입니다.' };
  const st = statsOf(p, now);
  const power = 1 + (JOBS[p.job]?.perk?.foodPower || 0);
  removeAt(p.inv, invIdx, 1);
  const en = Math.round((it.en || 0) * power);
  const hp = Math.round((it.hp || 0) * power);
  p.en = Math.min(st.en, p.en + en);
  p.hp = Math.min(st.hp, p.hp + hp);
  if (it.buff) {
    p.buffs = activeBuffs(p, now).filter(b => b.src !== it.id);
    p.buffs.push({ src: it.id, stats: it.buff, until: now + 30 * 60 * 1000 });
  }
  return { ok: true, msg: `${it.name} 냠냠! 기력 +${en}${hp ? ` 체력 +${hp}` : ''}${it.buff ? ' · 버프!' : ''}` };
}

// 옷 입기 / 벗기 (벗은 옷은 가방으로)
export function equip(p, invIdx) {
  const s = p.inv[invIdx];
  const it = s && ITEMS[s.id];
  if (!it || it.type !== 'cloth') return { ok: false, msg: '입을 수 없는 물건입니다.' };
  const old = p.equip[it.slot];
  removeAt(p.inv, invIdx, 1);
  p.equip[it.slot] = it.id;
  if (old) give(p, old, 1);
  return { ok: true, msg: `${it.name}을(를) 입었습니다.` };
}
export function unequip(p, slot) {
  const old = p.equip[slot];
  if (!old) return;
  p.equip[slot] = null;
  give(p, old, 1);
}

// 화면에 그릴 모습 (옷 색 반영)
export function lookOf(p) {
  const look = { ...LOOK_DEFAULT, ...p.look };
  const top = ITEMS[p.equip?.top];
  const hat = ITEMS[p.equip?.hat];
  if (top) look.top = top.look;
  if (hat) { look.hat = hat.look; look.hatKind = hat.id; }
  return look;
}

export { TOOLS };
