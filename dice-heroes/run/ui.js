// 원정 화면 — 테스트판 전용 (배포판 빌드에는 run/ 폴더가 들어가지 않는다).
// app.js 가 init(도구) 로 트레이 · 알림 · 저장소 같은 공용 도구를 넘겨 주고,
// 'run-' 으로 시작하는 행동과 원정 중의 주사위 터치를 onAct 로 보낸다. 규칙은 rules.js (순수 로직).
import * as Run from './rules.js';
import { catInfo, bossInfo, classInfo } from '../engine.js';
import { ico } from '../icons.js';
import { spriteURL, isImgSprite } from '../pixel.js';
import { sfx, playBgm, preloadBgm, bossSong, buzz, rumble } from '../audio.js';
import { FX, PALETTES, shake } from '../fx.js';
import { foeURL, isPixelFoe, runIco, starIco, sceneURL, actBgURL } from './art.js';
import { relicIco } from './relic-art.js';
import { Hand } from './hand.js';

const SAVE = 'diceheroes.run';
const BEST = 'diceheroes.runBest';
let X = null;            // app.js 도구
let R = null;            // 원정 상태
let hand = null;         // 손패 (스프링 카드)
const ui = { busy: false, tool: null, dealDie: null, sel: null, split: null, rolling: false, show: null, dice: null, view: null, sealRoll: null, pickU: null, cardPick: null, relicPick: null, last: 0 };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const miniDie = v => `<span class="md${v === 1 ? ' one' : ''}">${[...Array(9)].map((_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
const wait = ms => X.wait(ms);
const $ = id => document.getElementById(id);
const center = el => { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 }; };
const hero = cls => `<img class="spr${isImgSprite(cls) ? ' spr-hi' : ''}" src="${spriteURL(cls, 4)}" alt="">`;
const FOE_COLOR = { slime: '#3EE6B4', goblin: '#7CC24A', bat: '#8A5CC8', wolf: '#9AA4B8', shaman: '#B36BFF', mimic: '#FFC83D',
  skeleton: '#EEE6D0', ghost: '#7CA8D8', wisp: '#7CE0FF', knight: '#6A6A9A', golem: '#A8A090', imp: '#E8435A', hound: '#FF8A1A',
  gargoyle: '#8A8FA8', shade: '#9A6AFF', champion: '#C21E56' };
const foeColor = id => bossInfo(id)?.color || FOE_COLOR[id] || '#9486FF';
const KIND_KO = { normal: '', elite: '엘리트', boss: '보스' };

// ── 시작 · 저장 ──────────────────────────────────────────────────────────────
// 원정 스타일(run.css)을 다 받은 뒤에 화면을 그린다 — 먼저 그리면 꾸밈 없는 화면이 잠깐 보인다 (최대 3초 기다림)
let cssReady = null;
export function init(ctx) {
  X = ctx;
  return (cssReady ||= new Promise(resolve => {
    let l = document.getElementById('run-css');
    if (l?.sheet) return resolve();
    if (!l) {
      l = document.createElement('link');
      l.id = 'run-css'; l.rel = 'stylesheet'; l.href = `run/run.css?v=${X.version}`;
      document.head.appendChild(l);
    }
    l.addEventListener('load', resolve, { once: true });
    l.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 3000);
  }));
}
export const savedRun = store => { const s = store.get(SAVE); return s && s.v === 1 && !s.ended ? s : null; };
function save() {
  if (!R) return;
  syncFeats();
  if (R.ended) X.store.del(SAVE); else X.store.set(SAVE, R);
}
function best() { const b = X.store.get(BEST) || { runs: 0, wins: 0, top: 0, cls: {} }; b.asc ||= {}; b.feats ||= []; b.meta ||= { stars: 0, lv: {}, dice: [], equip: [] }; return b; }
const mlv = (b, id) => b.meta.lv[id] || 0;
// 승천: 원정을 깬 단계 + 1 까지 고를 수 있다 (직업마다)
const ascOpen = (b, cls) => Math.min(Run.ASC_MAX, (b.asc[cls] ?? -1) + 1);
// 판 안에서 이룬 도전과제를 기록에 옮기고, 처음 이룬 것은 알린다
function syncFeats() {
  const b = best();
  const got = [...(R.feats || [])];
  if (Object.values(b.cls).filter(c => c.wins > 0).length >= 5) got.push('five');
  const fresh = got.filter(id => !b.feats.includes(id));
  if (!fresh.length) return;
  b.feats.push(...fresh);
  X.store.set(BEST, b);
  fresh.forEach((id, k) => {
    const f = Run.FEATS.find(x => x.id === id);
    if (f) setTimeout(() => { sfx.legend?.(); X.toast(ico(f.icon), `원정 도전과제 · ${f.ko}`, f.desc, 2200); }, k * 900);
  });
}

export function open() { ui.view = 'select'; X.setScreen('run'); paintSelect(); }
export function resume() {
  const s = savedRun(X.store);
  if (!s) return open();
  R = s; R.fx = [];
  X.setScreen('run');
  enterView(true);
}

// R.phase 에 맞는 화면을 연다
function enterView(fresh = false) {
  ui.tool = null; ui.sel = null; ui.dealDie = null;
  if (R.phase === 'combat') return showCombat(fresh);
  if (R.phase === 'won' || R.phase === 'lost') return showEnd();
  hand?.destroy(); hand = null;
  if (R.phase === 'map') return showMap();
  if (R.phase === 'reward') return showReward();
  if (R.phase === 'shop') return showShop();
  if (R.phase === 'rest') return showRest();
  if (R.phase === 'event') return showEvent();
}

// ── 직업 고르기 ──────────────────────────────────────────────────────────────
function paintSelect() {
  const sel = ui.cls || X.store.get('diceheroes.runCls') || 'gambler';
  ui.cls = sel;
  const bb = best();
  ui.asc = Math.min(ascOpen(bb, sel), (X.store.get('diceheroes.runAsc') || {})[sel] ?? ascOpen(bb, sel));
  const ci = Run.RUN_CLASSES[sel], info = classInfo(sel);
  const b = best();
  const sig = { u: 0, cat: ci.sig.cat, up: 0, kw: ci.sig.kw || null };
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-select">
    <header class="rs-head">
      <button class="icon-btn" data-act="run-home" aria-label="뒤로">◀</button>
      <div><b>원정</b><small>테스트판 · 로그라이크 · 혼자 하기</small></div>
    </header>
    <p class="rs-intro">족보 카드 덱으로 3막을 돌파하세요. 주사위를 굴린 뒤 카드의 점수를 <b>공격</b>과 <b>방어</b>로 나눠 냅니다. 쓰러지면 처음부터.</p>
    <div class="rs-grid">
      ${Object.keys(Run.RUN_CLASSES).map(id => {
        const c = classInfo(id), owned = X.owns(id);
        return `<button class="rs-cls${id === sel ? ' on' : ''}${owned ? '' : ' locked'}" data-act="run-cls" data-id="${id}" style="--c:${c.color}">
          ${hero(id)}<b>${c.ko}</b><small>${ico('heart', 'xs')}${Run.RUN_CLASSES[id].hp}</small>${b.cls[id]?.wins ? `<i class="rs-won">${ico('crown', 'xs')}${b.cls[id].wins}</i>` : ''}
        </button>`;
      }).join('')}
    </div>
    <section class="rs-info frame" style="--c:${info.color}">
      <div class="rs-top">${hero(sel)}<div><b>${info.ko}</b><small>체력 ${ci.hp} · 뒤집기 ${ci.flip} · 조정 ${ci.nudge}</small></div></div>
      <p class="rs-skill"><b>${ico('star', 'xs')} ${ci.skill}</b> ${esc(ci.desc)}</p>
      <div class="rs-deck"><small>시작 덱 9장 · 대표 카드</small><div class="rc rc-static">${cardFace(sig)}</div></div>
      ${X.owns(sel) ? '' : `<p class="hint">보석으로 해금하는 직업이에요. 테스트판에서는 바로 해 볼 수 있어요.</p>`}
    </section>
    ${ascPicker(b, sel)}
    <div class="rs-foot">
      ${b.runs ? `<p class="rs-best">지금까지 ${b.runs}번 원정 · 클리어 ${b.wins}번 · 최고 ${b.top >= 3 * 7 ? '클리어' : `${Math.floor(b.top / 7) + 1}막`}</p>` : '<p class="rs-best">첫 원정이에요</p>'}
      <button class="pbtn small" data-act="run-feats">${ico('trophy', 'xs')} 도전과제 ${b.feats.length}/${Run.FEATS.length}</button>
      <button class="pbtn small gold meta-btn" data-act="run-meta">${runIco('meta', 'slot', 'star', 'xs')} 원정 준비 <b>${starIco()}${b.meta.stars}</b></button>
    </div>
    <button class="pbtn gold big" data-act="run-start">원정 떠나기${ui.asc ? ` <small>승천 ${ui.asc}</small>` : ''}</button>
  </div>`;
}

// 승천 고르기: 이 직업으로 깬 단계 + 1 까지. 단계마다 어려움이 쌓인다
function ascPicker(b, cls) {
  const open = ascOpen(b, cls), a = ui.asc;
  if (!open) return `<p class="rs-asc locked">${ico('lock', 'xs')} 이 직업으로 원정을 끝내면 <b>승천</b>이 열려요 (더 어려운 원정 0~${Run.ASC_MAX})</p>`;
  const list = Run.ASCENSION.slice(1, a + 1).map((x, k) => `<li><b>${k + 1}</b> ${x.ko} · ${x.desc}</li>`).join('');
  return `<section class="rs-asc frame">
    <div class="asc-row"><button class="icon-btn" data-act="run-asc" data-d="-1" ${a <= 0 ? 'disabled' : ''} aria-label="승천 낮추기">◀</button>
      <div class="asc-lv"><span class="asc-badge${a ? '' : ' off'}">${runIco('ui', 'asc', 'skull')}<b>${a}</b></span><span><small>승천</small><small>열린 단계 ${open}</small></span></div>
      <button class="icon-btn" data-act="run-asc" data-d="1" ${a >= open ? 'disabled' : ''} aria-label="승천 높이기">▶</button></div>
    ${a ? `<ol class="asc-list">${list}</ol>` : '<p class="hint">승천 0: 기본 원정</p>'}
  </section>`;
}
// 원정 준비: 별조각(✦)으로 영구 강화 · 특수 주사위. 원정이 끝날 때마다 별조각을 얻는다
function showMeta() {
  const b = best(), m = b.meta, slots = mlv(b, 'slot');
  const ups = Run.META.map(u => {
    const n = mlv(b, u.id), full = n >= u.max, cost = full ? 0 : u.cost[n];
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
    return `<div class="meta-row${full ? ' full' : ''}">${runIco('meta', u.id, u.icon)}<span><b>${u.ko} <span class="mpips">${pips}</span></b><small>${n ? u.desc(n) : '없음'}${full ? '' : ` → <em>${u.desc(n + 1)}</em>`}</small></span>
      <button class="pbtn small${!full && m.stars >= cost ? ' gold' : ''}" data-act="run-metabuy" data-id="${u.id}" ${full || m.stars < cost ? 'disabled' : ''}>${full ? '완료' : `${starIco()}${cost}`}</button></div>`;
  }).join('');
  const dice = Run.DICE.map(d => {
    const own = m.dice.includes(d.id), on = m.equip.includes(d.id);
    return `<div class="meta-row die-row${on ? ' on' : ''}" style="--dc:${d.color}">${runIco('die', d.id, 'die6')}<span><b>${d.ko}</b><small>${d.desc}</small></span>
      ${own ? `<button class="pbtn small${on ? ' gold' : ''}" data-act="run-dieequip" data-id="${d.id}" ${!on && m.equip.length >= slots ? 'disabled' : ''}>${on ? '빼기' : slots ? '넣기' : '칸 없음'}</button>`
        : `<button class="pbtn small${m.stars >= d.cost ? ' gold' : ''}" data-act="run-diebuy" data-id="${d.id}" ${m.stars < d.cost ? 'disabled' : ''}>${starIco()}${d.cost}</button>`}</div>`;
  }).join('');
  X.layer.innerHTML = `<div class="overlay run-meta" data-act="close-bg"><div class="deck-box" data-act="noop">
    <div class="meta-head"><img class="run-scene" src="${sceneURL('rest')}" alt=""><h2>원정 준비 <b class="stars">${starIco('')}${m.stars}</b></h2></div>
    <p class="hint">원정이 끝날 때마다 별조각을 얻어요 (지난 층 · 엘리트 · 보스 · 클리어, 승천이 높을수록 더). 강화는 모든 직업에 적용돼요.</p>
    <div class="meta-list">${ups}</div>
    <h3>특수 주사위 <small>주사위 칸 ${m.equip.length}/${slots}</small></h3>
    <div class="meta-list">${dice}</div>
    <div class="pick-actions"><button class="pbtn small gold" data-act="close">닫기</button></div>
  </div></div>`;
}
function metaAct(act, id) {
  const b = best(), m = b.meta;
  if (act === 'run-metabuy') {
    const u = Run.META.find(x => x.id === id), n = mlv(b, id);
    if (!u || n >= u.max || m.stars < u.cost[n]) return;
    m.stars -= u.cost[n]; m.lv[id] = n + 1;
  }
  if (act === 'run-diebuy') { const d = Run.diceInfo(id); if (!d || m.dice.includes(id) || m.stars < d.cost) return; m.stars -= d.cost; m.dice.push(id); if (m.equip.length < mlv(b, 'slot')) m.equip.push(id); }
  if (act === 'run-dieequip') {
    if (m.equip.includes(id)) m.equip = m.equip.filter(x => x !== id);
    else if (m.dice.includes(id) && m.equip.length < mlv(b, 'slot')) m.equip.push(id);
  }
  X.store.set(BEST, b);
  if (act === 'run-dieequip') sfx.select(); else sfx.forge?.();
  paintSelect();                         // 직업 고르기 화면의 별조각 수를 바꾸고 (창을 지운다)
  showMeta();
}
function showFeats() {
  const b = best();
  X.layer.innerHTML = `<div class="overlay run-feats" data-act="close-bg"><div class="deck-box" data-act="noop">
    <h2>${runIco('feat', 'clear', 'trophy')} 원정 도전과제 ${b.feats.length}/${Run.FEATS.length}</h2>
    <div class="feat-list">${Run.FEATS.map(f => { const ok = b.feats.includes(f.id); return `<div class="feat${ok ? ' ok' : ''}">${runIco('feat', f.id, ok ? f.icon : 'lock')}<span><b>${f.ko}</b><small>${f.desc}</small></span></div>`; }).join('')}</div>
    <div class="pick-actions"><button class="pbtn small gold" data-act="close">닫기</button></div>
  </div></div>`;
}

// ── 공용 HUD ─────────────────────────────────────────────────────────────────
const shownHp = () => (ui.show ? ui.show.hp : R.hp);
const shownBlk = () => (ui.show ? ui.show.blk : R.C?.block || 0);
function hud() {
  const C = R.C;
  const fl = Run.floorOf(R);
  return `<header class="rhud">
    <button class="icon-btn" data-act="run-menu" aria-label="메뉴">☰</button>
    <div class="rh-act"><small>${R.act}막${R.asc ? ` · 승천${R.asc}` : ''}</small><b>${fl > Run.ROWS ? '보스' : fl ? `${fl}층` : '출발'}</b></div>
    <div class="rh-res">
      <span class="res gold" id="r-gold">${ico('coins', 'xs')}<b>${R.gold}</b></span>
      <span class="res">${ico('flip', 'xs')}<b>${R.flip}</b></span>
      <span class="res">${ico('nudge', 'xs')}<b>${R.nudge}</b></span>
      ${R.cls === 'dancer' ? `<span class="res">${ico('sparkle', 'xs')}<b>${R.dance}</b></span>` : ''}
    </div>
    <div class="potions">${[0, 1, 2].map(k => { const id = R.potions[k]; const p = id && Run.potionInfo(id); return `<button class="pot${p ? '' : ' empty'}" data-act="run-pot" data-k="${k}" ${p ? `style="--pc:${p.color}"` : 'disabled'} aria-label="${p ? p.ko : '빈 칸'}">${p ? runIco('potion', p.id, p.icon, 'xs') : ''}</button>`; }).join('')}</div>
    <button class="pile" data-act="run-deck" aria-label="덱 보기">${ico('card', 'xs')}<b>${C && R.phase === 'combat' ? `${C.draw.length}·${C.discard.length}` : R.deck.length}</b></button>
  </header>`;
}
function heroStrip() {
  const info = classInfo(R.cls), ci = Run.RUN_CLASSES[R.cls];
  const hp = shownHp(), blk = R.phase === 'combat' ? shownBlk() : 0;
  const weak = R.C?.weak > 0 && R.phase === 'combat';
  return `<section class="rhero" id="rhero" style="--c:${info.color}">
    <div class="rh-por" id="rh-por">${hero(R.cls)}</div>
    <div class="rh-main">
      <div class="rh-name"><b>${esc(R.name)}</b><button class="rh-skill" data-act="run-skill">${ico('star', 'xs')}${ci.skill}</button>${weak ? `<span class="st weak">${ico('snow', 'xs')}약화 ${R.C.weak}</span>` : ''}</div>
      <div class="hp rh-hp${hp / R.maxHp < 0.3 ? ' low' : ''}"><i style="width:${(hp / R.maxHp) * 100}%"></i><em>${hp} / ${R.maxHp}</em></div>
    </div>
    <div class="rh-blk${blk ? ' on' : ''}" id="rh-blk">${ico('shield', 'xs')}<b>${blk}</b></div>
    <div class="rh-relics">${R.relics.map(id => { const r = Run.relicInfo(id); return `<button class="relic r${r.r}" data-act="run-relic" data-id="${id}" aria-label="${r.ko}">${relicIco(r, 'xs')}</button>`; }).join('') || '<span class="dim">유물 없음</span>'}</div>
  </section>`;
}

// ── 카드 그림 ────────────────────────────────────────────────────────────────
const PATTERN = { ones: [1, 1, 1], twos: [2, 2, 2], threes: [3, 3, 3], fours: [4, 4, 4], fives: [5, 5, 5], sixes: [6, 6, 6], four: [5, 5, 5, 5], full: [3, 3, 3, 5, 5], sstr: [1, 2, 3, 4], lstr: [1, 2, 3, 4, 5], yacht: [6, 6, 6, 6, 6] };
export function cardFace(c, { score = null, cls = '' } = {}) {
  const r = Run.cardRarity(c);
  const ks = Run.kwsOf(c), kw = ks.length ? Run.KEYWORDS[ks[0]] : null;
  const pat = c.cat === 'choice' ? '<span class="rc-sum">∑</span>' : `<span class="mds">${PATTERN[c.cat].map(miniDie).join('')}</span>`;
  return `<div class="rc-in r${r}${c.up ? ' up' : ''}${ks.length >= 3 ? ' k3' : ''}${cls}"${kw ? ` style="--kc:${kw.color}"` : ''}>
    <b class="rc-name">${c.up ? Run.cardTitle(c.cat).replace(/\S+$/, w => `<span class="nw">${w}<i class="rc-plus">+</i></span>`) : Run.cardTitle(c.cat)}</b>
    <div class="rc-pat">${pat}</div>
    <small class="rc-rule">${Run.CAT_RULE[c.cat]}</small>
    ${ks.length > 1 ? `<span class="rc-gems n${ks.length}">${Array.from({ length: Run.KW_MAX }, (_, i) => ks[i] ? `<i class="gem" style="--kc:${Run.KEYWORDS[ks[i]].color}" title="${Run.KEYWORDS[ks[i]].ko}">${runIco('kw', ks[i], Run.KEYWORDS[ks[i]].icon, 'xs')}</i>` : '<i class="gem empty"></i>').join('')}</span>`
      : kw ? `<span class="rc-kw">${runIco('kw', ks[0], kw.icon, 'xs')}${kw.ko}</span>` : '<span class="rc-kw none"></span>'}
    ${score === '?' ? '<em class="rc-pts wait">?</em>' : score != null ? `<em class="rc-pts">${score > 0 ? score : '·'}</em>` : ''}
    <i class="rc-sheen"></i>
  </div>`;
}
const cardTip = c => `<b>${esc(Run.cardName(c))}</b><p>${Run.CAT_RULE[c.cat]}${c.up ? ' · 강화: 점수 +30%' : ''}</p>${Run.kwsOf(c).map(k => `<p>${runIco('kw', k, Run.KEYWORDS[k].icon, 'xs')} <b>${Run.KEYWORDS[k].ko}</b> ${Run.KEYWORDS[k].desc}</p>`).join('')}`;

// ── 지도 ─────────────────────────────────────────────────────────────────────
const MAP_ROW = 74, MAP_PAD = 46;
// 지도 · 이벤트 · 상점 · 휴식 · 전투 보상은 모두 지도 곡(run_map) — 같은 곡이면 playBgm 이 다시 틀지 않아 화면을 오가도 끊기지 않는다
function showMap() {
  playBgm('run_map');
  preloadBgm(bossSong(R.boss));          // 이번 막 보스 곡 · 전투 곡을 미리 받아 둔다 (전투에 들어가자마자 나오게)
  preloadBgm('run_battle');
  const nodes = R.map.nodes;
  const next = new Set(Run.nextNodes(R));
  const H = MAP_PAD * 2 + Run.ROWS * MAP_ROW + 40;
  const pos = n => ({ x: 12 + n.col * 25.3, y: n.row > Run.ROWS ? MAP_PAD - 6 : H - MAP_PAD - (n.row - 1) * MAP_ROW });
  const visited = new Set(R.path);
  const lines = nodes.flatMap(n => n.next.map(j => {
    const a = pos(n), b = pos(nodes[j]);
    const walked = visited.has(n.id) && visited.has(j);
    const open = R.pos === n.id && next.has(j);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? 'walked' : open ? 'open' : ''}"/>`;
  })).join('');
  const bossId = R.boss;
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-map">
    ${hud()}
    <div class="map-head"><b>${R.act}막 · ${Run.ACT_INFO[R.act].ko}</b><small>보스 ${esc(Run.ENEMIES[bossId].ko)}</small></div>
    <div class="map-scroll" id="map-scroll" style="background-image:linear-gradient(rgba(8,5,24,.25), rgba(8,5,24,.25)), url(${actBgURL(R.act)})"><div class="map" style="height:${H}px">
      <svg class="map-lines" viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>
      ${nodes.map(n => {
        const p = pos(n);
        const st = n.id === R.pos ? 'here' : next.has(n.id) ? 'can' : visited.has(n.id) ? 'done' : 'far';
        const boss = n.type === 'boss';
        return `<button class="mnode t-${n.type} ${st}" data-act="run-node" data-id="${n.id}" style="left:${p.x}%;top:${p.y}px" ${st === 'can' ? '' : 'tabindex="-1"'} aria-label="${Run.NODE[n.type].ko}">
          ${boss ? `<img class="mboss" src="${foeURL(bossId)}" alt="">` : runIco('node', n.type, Run.NODE[n.type].icon)}
          ${n.id === R.pos ? `<span class="mhere">${hero(R.cls)}</span>` : ''}
          ${st === 'can' ? `<i class="mlabel">${Run.NODE[n.type].ko}</i>` : ''}
        </button>`;
      }).join('')}
    </div></div>
    <p class="tip">${next.size ? '빛나는 칸을 눌러 나아가세요' : ''}</p>
    ${heroStrip()}
  </div>`;
  // 지금 갈 수 있는 층이 보이게
  const sc = $('map-scroll');
  const tgt = X.app.querySelector('.mnode.can') || X.app.querySelector('.mnode.here');
  if (sc && tgt) sc.scrollTop = Math.max(0, tgt.offsetTop - sc.clientHeight * 0.6);
}

// ── 전투 화면 ────────────────────────────────────────────────────────────────
function showCombat(fresh) {
  const C = R.C;
  const kind = Run.ENEMIES[C.e.id].kind;
  playBgm(kind === 'boss' ? bossSong(C.e.id) : kind === 'elite' ? 'run_elite' : 'run_battle');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-combat" id="rc">
    <div id="r-hud">${hud()}</div>
    <section class="foe k-${kind}" id="foe"></section>
    <section class="table rtable">
      <div id="tray" class="tray"><div class="dice-ovl" id="dice-ovl"></div><div id="tray-btns"></div><p class="tray-loading">주사위 준비 중…</p></div>
      <div class="rolls-left" id="rolls-left"></div>
    </section>
    <section class="rctl" id="rctl"></section>
    <p class="tip rtip" id="rtip"></p>
    <section class="hand" id="hand"></section>
    <div id="r-hero">${heroStrip()}</div>
  </div>`;
  hand?.destroy();
  hand = new Hand($('hand'), {
    face: (c, sc) => cardFace(c, { score: sc }),
    score: c => cardScore(c),
    onTap: u => tapCard(u),
    onDrop: (u, target) => dropCard(u, target),
    onLong: u => { const c = R.C.hand.find(x => x.u === u); if (c) X.popover(hand.el(u), cardTip(c) + playTip(c)); },
    targets: () => ({ enemy: $('foe'), self: $('r-hero') }),
    canPlay: () => canAct() && R.C.rolled,
    bet: u => R.C.bet === u, gazed: u => R.C.gazed.includes(u) && !R.C.pure,
    sound: (k, n) => ({ draw: () => sfx.card(), touch: () => sfx.tap(), lift: () => sfx.select(), aim: () => sfx.hold(), nope: () => sfx.back(), slam: () => sfx.whoosh?.(),
      live: () => sfx.tick?.(Math.min(1, 0.35 + n / 50)), dead: () => {} }[k]?.()),
  });
  hand.set(C.hand, fresh ? 'deal' : 'instant');
  paint();
  X.ensureTray().then(t => {
    if (X.screen() !== 'run' || R?.phase !== 'combat') return;
    document.querySelector('.tray-loading')?.remove();
    t.attach($('tray'));
    X.turnSkin(t);
    t.show(ui.dice || C.dice, C.rolled ? C.held : []);
    paintTray();
  });
  if (fresh && C.turn === 1 && !C.rolled) introFoe();
}
const canAct = () => R?.phase === 'combat' && R.C?.phase === 'roll' && !ui.busy;
// 굴리는 동안(주사위가 다 멈추기 전)은 '?' — 점수는 주사위가 멈춘 뒤에 드러난다
const cardScore = c => (ui.rolling ? '?' : R.C.rolled ? Run.scoreCard(R, c).total : null);

// 상태가 바뀌면 화면 숫자 · 버튼 · 카드 점수를 새로 그린다 (손패 위치는 Hand 가 맡는다)
function paint() {
  if (R?.phase !== 'combat' || !$('rc')) return;
  const C = R.C;
  $('r-hud').innerHTML = hud();
  $('foe').innerHTML = foePanel();
  $('r-hero').innerHTML = heroStrip();
  const rolled = C.rolled, my = canAct();
  const needBet = R.cls === 'gambler' && !rolled && C.bet == null && C.hand.length;
  const canRoll = my && C.rollsLeft > 0 && !needBet && !(rolled && C.held.every((h, i) => h || Run.isSealed(R, i) || Run.isFrozen(R, i)));
  const locked = Run.toolsLocked(R);
  $('rolls-left').innerHTML = [...Array(Run.maxRolls(R))].map((_, i) => `<i class="${i < C.rollsLeft ? 'on' : ''}"></i>`).join('');
  $('rctl').innerHTML = `
    <button class="pbtn gold roll" data-act="run-roll" ${canRoll ? '' : 'disabled'}><span>${needBet ? '배팅 먼저' : rolled ? '다시 굴리기' : '굴리기'}</span><small class="left-n">남은 ${C.rollsLeft}회</small></button>
    <button class="pbtn tool${ui.tool === 'flip' ? ' on' : ''}" data-act="run-tool" data-tool="flip" ${my && rolled && R.flip > 0 && !locked ? '' : 'disabled'}>${ico('flip')}${ui.tool === 'flip' ? '사용 중' : '뒤집기'}<b>${R.flip}</b></button>
    <button class="pbtn tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="run-tool" data-tool="nudge" ${my && rolled && R.nudge > 0 && !locked ? '' : 'disabled'}>${ico('nudge')}${ui.tool === 'nudge' ? '사용 중' : '조정'}<b>${R.nudge}</b></button>
    <button class="pbtn tool swap${ui.tool === 'swap' ? ' on' : ''}" data-act="run-tool" data-tool="swap" ${my && C.swaps > 0 ? '' : 'disabled'}>${ico('recycle')}${ui.tool === 'swap' ? '카드 고르기' : '교체'}<b>${C.swaps}</b></button>`;
  $('tray-btns').innerHTML = `${my && Run.canDance(R) ? `<button class="encore-btn dance-btn" data-act="run-dance">${ico('sparkle', 'xs')} 춤사위 ×${R.dance} <small>모든 주사위 +1</small></button>` : ''}${my && Run.canDeal(R) ? `<button class="encore-btn deal-btn${ui.tool === 'deal' ? ' on' : ''}" data-act="run-tool" data-tool="deal">${ico('card', 'xs')} ${ui.tool === 'deal' ? '취소' : `밑장빼기 ${R.C.deals}`}</button>` : ''}${C.hex && !C.pure ? `<button class="hex-badge" data-act="run-hex">${ico(Run.HEX[C.hex.t].icon, 'xs')} ${Run.HEX[C.hex.t].ko}</button>` : ''}`;
  $('rtip').innerHTML = tipText(needBet);
  hand?.refresh();
  if (ui.split && ui.sel === ui.split.u) syncSplit();
  paintTray();
  $('rc')?.classList.toggle('my-turn', my);
}
function tipText(needBet) {
  const C = R.C;
  if (ui.busy) return '';
  if (ui.tool === 'swap') return '바꿀 카드를 누르세요 (버리고 새로 1장)';
  if (ui.tool === 'flip') return '뒤집을 주사위를 누르세요 (7 - 눈)';
  if (ui.tool === 'nudge') return '주사위 위의 +1 / −1 을 누르세요';
  if (ui.tool === 'deal') return ui.dealDie == null ? '바꿀 주사위를 누르세요' : '원하는 눈을 고르세요';
  if (R.cls === 'gambler' && !C.rolled && ui.sel != null) return '배팅할지 정해 주세요';
  if (needBet) return `${ico('coins', 'xs')} 배팅: 이번 턴에 노릴 카드를 누르세요 (그 카드 ×${Run.CLASS_TUNE.betMul})`;
  if (!C.rolled) return '주사위를 굴려 족보를 만드세요';
  const live = C.hand.filter(c => Run.scoreCard(R, c).total > 0).length;
  if (ui.sel != null) return '막대를 밀어 <b>공격 · 방어</b>를 나누고 <b>내기</b>';
  return live ? `카드를 눌러 <b>공격 · 방어 나누기</b> · 끌어서 바로 내기` : (C.rollsLeft ? '맞는 족보가 없어요 · 다시 굴리거나 카드를 바꿔 보세요' : '0점이라도 카드 1장을 내야 턴이 끝나요');
}

function foePanel() {
  const C = R.C, e = C.e, def = Run.ENEMIES[e.id];
  const hp = ui.show ? ui.show.ehp : e.hp, blk = ui.show ? ui.show.eblk : e.block;
  const parts = ui.show?.hideIntent ? [] : Run.intentParts(R);
  const st = [];
  if (e.str > 0) st.push(`<span class="st str">${ico('up', 'xs')}힘 ${e.str}</span>`);
  if (e.weak > 0) st.push(`<span class="st weak">${ico('snow', 'xs')}약화</span>`);
  if (e.burn > 0) st.push(`<span class="st burn">${ico('fire', 'xs')}화상 ${e.burn}·${e.burnT}</span>`);
  if (e.fury) st.push(`<span class="st fury">${ico('anger', 'xs')}격앙</span>`);
  if (e.raged) st.push('<span class="rage-tag">분노</span>');
  if (e.cut) st.push(`<span class="st heads">머리 ${['fire', 'ice', 'poison'].filter(h => !e.cut[h]).length}/3</span>`);
  const intent = parts.map(p => {
    if (p.k === 'atk') return `<span class="it atk">${ico('sword', 'xs')}<b>${p.n}${p.hits > 1 ? `×${p.hits}` : ''}</b></span>`;
    if (p.k === 'block') return `<span class="it blk">${ico('shield', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'str') return `<span class="it str">${ico('up', 'xs')}<b>+${p.n}</b></span>`;
    if (p.k === 'heal') return `<span class="it heal">${ico('heart', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'steal') return `<span class="it steal">${ico('coins', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'weak') return `<span class="it weak">${ico('snow', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'hex') return `<span class="it hex">${ico(Run.HEX[p.t].icon, 'xs')}<b>${Run.HEX[p.t].ko}</b></span>`;
    return '';
  }).join('');
  return `
    <div class="foe-art${isPixelFoe(e.id) ? ' px' : ''}" id="foe-art" style="--c:${foeColor(e.id)}"><i class="aura"></i><img class="foe-img" src="${foeURL(e.id)}" alt=""></div>
    <div class="foe-main">
      <div class="foe-name"><b>${esc(def.ko)}</b>${KIND_KO[def.kind] ? `<span class="kind-chip k-${def.kind}">${KIND_KO[def.kind]}</span>` : ''}</div>
      <div class="hp-row"><div class="hp foe-hp"><i style="width:${(hp / e.maxHp) * 100}%"></i>${blk ? `<s style="width:${Math.min(100, (blk / e.maxHp) * 100)}%"></s>` : ''}<em>${hp} / ${e.maxHp}</em></div><span class="foe-blk">${blk ? `<span class="shield-badge run-shield" title="보호막">${runIco('ui', 'shield', 'shield', 'xs')}<b>${blk}</b></span>` : ''}</span></div>
      <div class="foe-st">${st.join('')}</div>
    </div>
    ${intent ? `<button class="intent" id="intent" data-act="run-intent" aria-label="적의 다음 행동">${intent}</button>` : ''}`;
}

// 주사위 위 표시: 봉인 · 얼음 · 뒤집기 · 조정 · 밑장빼기
function paintTray() {
  const t = X.tray(), ovl = $('dice-ovl'), C = R?.C;
  if (!t || !ovl || !C || R.phase !== 'combat') return;
  t.setTarget?.(!!ui.tool && ui.tool !== 'swap' && canAct());
  const box = ovl.getBoundingClientRect();
  t.setFrozen?.(C.rolled && !ui.hideIce ? C.frozen : []);
  const sealList = ui.sealRoll || C.sealed || [];
  const seals = C.rolled ? sealList.map(i => { const p = t.topPos?.(i) || t.screenPos(i); return `<div class="seal-tag" style="left:${p.x - box.left}px;top:${p.y - box.top}px">${X.sealSigil || ico('chain')}</div>`; }).join('') : '';
  // 특수 주사위: 주사위 아래 색 보석 표시
  const sp = (R.dset || []).map((id, i) => { const d = Run.diceInfo(id); if (!d || !C.dice[i] && C.dice[i] !== 0) return ''; const p = t.screenPos(i); return `<i class="sdie-tag" style="left:${p.x - box.left}px;top:${p.y - box.top + 24}px;--dc:${d.color}" title="${d.ko}">${runIco('die', d.id, 'die6', 'xs')}</i>`; }).join('');
  if (!ui.tool || ui.tool === 'swap' || !canAct() || !C.rolled || t.anim) { ovl.innerHTML = seals + sp; return; }
  ovl.innerHTML = seals + sp + C.dice.map((v, i) => {
    const p = t.screenPos(i);
    const x = p.x - box.left, y = p.y - box.top;
    if (Run.isSealed(R, i)) return '';
    if (ui.tool === 'deal') {
      if (ui.dealDie === i) return `<div class="deal-pick" style="left:${x}px;top:${y}px">${[1, 2, 3, 4, 5, 6].map(n => `<button data-act="run-deal" data-i="${i}" data-v="${n}" ${n === v ? 'disabled' : ''}>${miniDie(n)}</button>`).join('')}</div>`;
      return `<button class="flip-tag deal-tag" style="left:${x}px;top:${y}px" data-act="run-die" data-i="${i}"><i>바꾸기</i>${miniDie(v)}</button>`;
    }
    if (ui.tool === 'flip') return `<button class="flip-tag" style="left:${x}px;top:${y}px" data-act="run-die" data-i="${i}"><i>뒤집으면</i>${miniDie(7 - v)}</button>`;
    return `<div class="nudge-tag" style="left:${x}px;top:${y}px"><button data-act="run-nudge" data-i="${i}" data-d="1" ${v >= 6 ? 'disabled' : ''}>+1</button><button data-act="run-nudge" data-i="${i}" data-d="-1" ${v <= 1 ? 'disabled' : ''}>−1</button></div>`;
  }).join('');
}

// 카드에 손가락을 올렸을 때 공격 · 방어 미리보기 (길게 누르기)
function playTip(c) {
  if (!R.C.rolled) return '<small>굴린 뒤에 낼 수 있어요</small>';
  const hi = R.C.hand.findIndex(x => x.u === c.u);
  const a = Run.preview(R, hi, 'enemy'), d = Run.preview(R, hi, 'self');
  return `<p>${ico('sword', 'xs')} 전부 공격 ${a.dmg}${a.block ? ` · 보호막 ${a.block}` : ''}${a.heal ? ` · 회복 ${a.heal}` : ''} &nbsp; ${ico('shield', 'xs')} 전부 방어 ${d.block}</p><small>누르면 공격 · 방어로 나눠 낼 수 있어요</small>`;
}

// ── 전투 조작 ────────────────────────────────────────────────────────────────
function tapCard(u) {
  if (!canAct()) return;
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0) return;
  if (ui.tool === 'swap') return doSwap(hi);
  // 도박사: 굴리기 전에 카드를 고르면 '이 카드에 배팅할까요?' (굴리기 전에는 바꿀 수 있다)
  if (R.cls === 'gambler' && !C.rolled) {
    if (C.bet === u) { sfx.tap(); return; }
    sfx.card();
    ui.sel = ui.sel === u ? null : u;
    hand.select(ui.sel, ui.sel != null ? betAsk(u) : '');
    $('rtip').innerHTML = tipText(false);
    return;
  }
  if (!C.rolled) { sfx.back(); X.toast(ico('dice'), '먼저 굴려 주세요', '주사위를 굴린 뒤에 카드를 낼 수 있어요.', 1300); return; }
  sfx.card();
  if (ui.sel === u && hand.sel === u) return closeSplit();
  openSplit(u);
}
function betAsk(u) {
  const re = R.C.bet != null;
  return `<div class="bet-ask">
    <p>${ico('coins', 'xs')}<b>${re ? '배팅을 이 카드로 바꿀까요?' : '이 카드에 배팅하시겠습니까?'}</b><small>이 카드를 내면 점수 ×${Run.CLASS_TUNE.betMul} · 굴리기 전에만 바꿀 수 있어요</small></p>
    <div class="bet-btns"><button class="hb" data-act="run-betno">아니요</button><button class="hb gold" data-act="run-bet" data-u="${u}">${ico('coins', 'xs')}배팅</button></div>
  </div>`;
}
function doBet(u) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0 || C.rolled) return;
  try { Run.placeBet(R, hi); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
  Run.drainFx(R);
  ui.sel = null;
  hand.select(null);
  sfx.coin();
  const p = center(hand.el(u));
  FX().burst(p.x, p.y - 20, { n: 18, pal: PALETTES.gold, speed: [60, 200], life: [0.3, 0.6] });
  save(); paint();
}

// ── 공격 · 방어 나누기 ───────────────────────────────────────────────────────
// 카드를 누르면 손패 위에 막대가 열린다. 빨강(왼쪽부터) = 공격, 파랑 = 방어. 손잡이를 밀어 나누고 '내기'.
// 적에게 끌면 전부 공격, 나에게 끌면 전부 방어 (지름길).
function openSplit(u) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  const S = Run.scoreCard(R, C.hand[hi]).total;
  ui.sel = u;
  // 기본은 '딱 막기' (다음 공격을 다 막을 만큼만 방어 · 나머지 공격). 막을 공격이 없으면 전부 공격
  ui.split = { u, S, atk: Run.incomingAfter(R) > 0 ? Run.coverAtk(R, hi).atk : S };
  hand.select(u, splitHTML(u), { wide: true });
  hand.el(u)?.classList.add('splitting');
  bindSplit();
  paintSplit();
  $('rtip').innerHTML = tipText(false);
}
function closeSplit() {
  ui.sel = null; ui.split = null;
  hand.select(null);
  if ($('rtip')) $('rtip').innerHTML = tipText(false);
}
// 점수가 바뀌었으면(물약 등) 비율을 지키며 다시 맞춘다
function syncSplit() {
  const sp = ui.split, C = R.C, c = C.hand.find(x => x.u === sp.u);
  if (!c) return closeSplit();
  const S = Run.scoreCard(R, c).total;
  if (S !== sp.S) { sp.atk = sp.S ? Math.round(sp.atk / sp.S * S) : S; sp.S = S; }
  paintSplit();
}
function splitHTML(u) {
  return `<div class="split" id="split">
    <div class="sp-top">
      <button class="sp-end atk" data-act="run-split" data-v="all" aria-label="전부 공격">${ico('sword', 'xs')}<b id="sp-dmg"></b><small>피해</small></button>
      <div class="sp-bar" id="sp-bar" role="slider" aria-label="공격 · 방어 나누기"><i class="sp-a" id="sp-a"></i><span class="sp-knob" id="sp-knob">${runIco('ui', 'split_knob', 'sword')}<em id="sp-n"></em></span></div>
      <button class="sp-end def" data-act="run-split" data-v="none" aria-label="전부 방어">${ico('shield', 'xs')}<b id="sp-blk"></b><small>보호막</small></button>
    </div>
    <p class="sp-info" id="sp-info"></p>
    <div class="sp-row">
      <button class="sp-step" data-act="run-split" data-v="-1" aria-label="공격 1 줄이기">◀</button>
      <button class="sp-cover" id="sp-cover" data-act="run-split" data-v="cover"></button>
      <button class="sp-step" data-act="run-split" data-v="1" aria-label="공격 1 늘리기">▶</button>
      <button class="pbtn gold sp-go" data-act="run-play" data-u="${u}">내기</button>
    </div>
  </div>`;
}
function bindSplit() {
  const bar = $('sp-bar');
  if (!bar) return;
  const at = e => { const r = bar.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ui.split.S); };
  bar.addEventListener('pointerdown', e => {
    if (!ui.split) return;
    e.preventDefault(); e.stopPropagation();
    bar.setPointerCapture?.(e.pointerId);
    bar.classList.add('drag');
    setSplit(at(e));
  });
  bar.addEventListener('pointermove', e => { if (ui.split && bar.classList.contains('drag')) { e.preventDefault(); setSplit(at(e)); } });
  const end = () => bar.classList.remove('drag');
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}
function setSplit(a) {
  const sp = ui.split;
  if (!sp) return;
  a = Math.max(0, Math.min(sp.S, Math.round(a)));
  if (a === sp.atk) return;
  sp.atk = a;
  sfx.tick?.(sp.S ? a / sp.S : 1);
  buzz(4);
  paintSplit();
}
function paintSplit() {
  const sp = ui.split, C = R.C;
  const hi = sp ? C.hand.findIndex(c => c.u === sp.u) : -1;
  if (hi < 0 || !$('split')) return;
  const p = Run.preview(R, hi, sp.atk), card = C.hand[hi];
  const k = p.score ? p.atk / p.score : 1;
  $('sp-a').style.width = `${k * 100}%`;
  $('sp-knob').style.left = `${k * 100}%`;
  $('sp-bar').style.setProperty('--k', k.toFixed(3));
  $('sp-n').textContent = `${p.atk} : ${p.def}`;
  $('sp-dmg').textContent = p.dmg;
  $('sp-blk').textContent = p.block;
  $('split').classList.toggle('all-atk', p.def === 0 && p.score > 0);
  $('split').classList.toggle('all-def', p.atk === 0);
  const inc = Run.incomingAfter(R, p.weak), taken = Run.takenAfter(R, p);
  const info = [];
  if (p.atk > 0) {
    if (p.kill) info.push(`<b class="kill">${ico('skull', 'xs')}처치!</b>`);
    if (p.pierce) info.push(`${ico('dagger', 'xs')}관통`);
    if (p.whet) info.push(`숫돌 +${p.whet}`);
    if (p.arcane) info.push(`비전 +${p.arcane}`);
    if (p.horn) info.push('뿔피리 ×1.25');
    if (p.poison) info.push('독: 피해 ½');
    if (p.heal) info.push(`${ico('heart', 'xs')}+${p.heal}`);
    if (p.gold) info.push(`${ico('coins', 'xs')}+${p.gold}`);
    if (p.burn) info.push(`${ico('fire', 'xs')}화상 ${p.burn}`);
  }
  if (Run.hasKw(card, 'weak')) info.push(p.weak ? `${ico('snow', 'xs')}약화` : `<s>약화</s><small>절반 이상 공격</small>`);
  if (p.def > 0 && p.defMul > 1) info.push(`${ico('shield', 'xs')}방어 +${Math.round((p.defMul - 1) * 100)}%`);
  if (p.wblk) info.push(`불굴 +${p.wblk}`);
  if (p.always) info.push(`보호막 +${p.always}`);
  if (inc > 0 && !p.kill) info.push(taken ? `<em class="hurt">받을 피해 ${taken}</em>` : '<em class="safe">공격을 다 막아요</em>');
  $('sp-info').innerHTML = info.join('<i class="sep">·</i>') || '&nbsp;';
  const cov = Run.coverAtk(R, hi), cb = $('sp-cover');
  if (!inc) { cb.disabled = true; cb.innerHTML = '적이 공격하지 않아요'; }
  else { cb.disabled = false; cb.innerHTML = cov.full ? `딱 막기<small>방어 ${p.score - cov.atk}</small>` : '전부 방어<small>다 못 막아요</small>'; }
  hand.el(sp.u)?.style.setProperty('--mix', k.toFixed(3));
}
function dropCard(u, target) {
  if (!canAct() || !R.C.rolled) return false;
  doPlay(u, target);
  return true;
}

async function act(fn, { roll = false } = {}) {
  const before = snap();
  try { fn(); } catch (e) { X.toast(ico('warn'), '할 수 없어요', e.message, 1500); return null; }
  const list = Run.drainFx(R);
  return { list, before };
}
function snap() { const C = R.C; return { hp: R.hp, blk: C?.block || 0, ehp: C?.e.hp || 0, eblk: C?.e.block || 0, gold: R.gold }; }

async function doRoll() {
  const C = R.C;
  const t = await X.ensureTray();
  if (!canAct()) return;
  ui.tool = null; ui.sel = null; ui.split = null; ui.dealDie = null;
  hand.select(null);
  const mask = C.dice.map((_, i) => !(C.rolled && (C.held[i] || Run.isSealed(R, i) || Run.isFrozen(R, i))));
  ui.sealRoll = C.rolled ? C.sealed.slice() : [];
  t.restore?.();
  sfx.rollPress?.();
  const r = await act(() => Run.roll(R));
  if (!r) { ui.sealRoll = null; return; }
  const first = r.list.find(f => (f.type === 'hexDice' || f.type === 'lucky') && f.from);
  ui.dice = first ? first.from.slice() : null;
  ui.hideIce = r.list.some(f => f.type === 'hexDice' && f.t === 'freeze');   // 얼음 창이 박히기 전에는 얼려 보이지 않는다
  ui.busy = true;
  ui.rolling = true;                    // 주사위가 다 멈출 때까지 카드 점수는 '?'
  paint();
  t.setSealed?.(ui.sealRoll);
  try {
    await t.roll(ui.dice || C.dice, mask, X.prefs.fx === 'min' ? 1.6 : X.prefs.fx === 'fast' ? 1.3 : 1);
    ui.sealRoll = null;
    t.setSealed?.([]);
    await playFx(r.list, r.before);     // 굴린 직후의 방해(화염 숨결 · 운명 비틀기 …)까지 끝난 뒤
  } catch (err) {
    console.warn('[run roll]', err);
  } finally {
    ui.rolling = false;
    ui.hideIce = false;
    ui.sealRoll = null;
  }
  ui.dice = null;
  t.show(C.dice, C.held);
  if (R.phase === 'combat' && $('rc')) await hand.reveal();   // 점수가 왼쪽부터 한 장씩 드러난다
  ui.busy = false;
  save();
  paint();
}

async function doPlay(u, target) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0) return;
  ui.sel = null; ui.split = null; ui.tool = null;
  const r = await act(() => Run.playCard(R, hi, target));
  if (!r) { hand.select(null); hand.layout(); return; }
  ui.busy = true;
  await playFx(r.list, r.before);
  ui.busy = false;
  save();
  afterAction();
}
async function doSwap(hi) {
  ui.tool = null;
  const r = await act(() => Run.swapCard(R, hi));
  if (!r) return paint();
  ui.busy = true;
  await playFx(r.list, r.before);
  ui.busy = false;
  save(); paint();
}

// 행동이 끝난 뒤: 전투가 끝났으면 보상 · 결과로
function afterAction() {
  X.tray()?.restore?.();
  if (R.phase === 'combat') { paint(); X.tray()?.show(R.C.dice, R.C.held); return; }
  enterView();
}

// ── 연출 ─────────────────────────────────────────────────────────────────────
function floatAt(x, y, text, cls = '') {
  const el = document.createElement('div');
  el.className = `float rfloat ${cls}`;
  el.innerHTML = text;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
const foeAt = () => center($('foe-art'));
const heroAt = () => center($('rh-por'));
function setShow(patch) { if (ui.show) Object.assign(ui.show, patch); }
// 연출 중에는 적 · 영웅 칸을 통째로 다시 그리지 않고 숫자 · 막대만 바꾼다
// (맞는 애니메이션이 끊기지 않고, 깎인 체력만큼 흰 띠가 남았다가 따라 줄어든다)
function repaintBars() {
  if (!ui.show || !$('rc')) return;
  updFoe();
  updHero();
}
function trailBar(bar, pct) {
  const fill = bar.querySelector('i');
  let trail = bar.querySelector('u');
  if (!trail) { trail = document.createElement('u'); trail.style.width = fill.style.width; bar.prepend(trail); }
  const lost = parseFloat(pct) < parseFloat(fill.style.width);
  fill.style.width = pct;
  clearTimeout(trail._t);
  trail._t = setTimeout(() => (trail.style.width = pct), lost ? 380 : 0);
}
function updFoe() {
  const foe = $('foe');
  if (!foe) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = foePanel();
  const bar = foe.querySelector('.foe-hp'), nb = tmp.querySelector('.foe-hp');
  if (!bar || !nb || !foe.querySelector('#foe-art')) { foe.innerHTML = tmp.innerHTML; return; }
  trailBar(bar, nb.querySelector('i').style.width);
  bar.querySelector('s')?.remove();
  const ns = nb.querySelector('s');
  if (ns) bar.insertBefore(ns, bar.querySelector('em'));
  bar.querySelector('em').innerHTML = nb.querySelector('em').innerHTML;
  for (const sel of ['.foe-name', '.foe-st', '.foe-blk']) { const a = foe.querySelector(sel), b = tmp.querySelector(sel); if (a && b) a.innerHTML = b.innerHTML; }
  const oi = foe.querySelector('.intent'), ni = tmp.querySelector('.intent');
  if (oi && ni) oi.replaceWith(ni); else if (oi) oi.remove(); else if (ni) foe.appendChild(ni);
}
function updHero(hurt = false) {
  const bar = document.querySelector('#rhero .rh-hp');
  if (!bar) { if ($('r-hero')) $('r-hero').innerHTML = heroStrip(); return; }
  const hp = shownHp(), blk = shownBlk();
  trailBar(bar, `${(hp / R.maxHp) * 100}%`);
  bar.classList.toggle('low', hp / R.maxHp < 0.3);
  bar.querySelector('em').textContent = `${hp} / ${R.maxHp}`;
  const b = $('rh-blk');
  if (b) { b.classList.toggle('on', blk > 0); b.querySelector('b').textContent = blk; }
  if (hurt) { const st = $('rhero'); st?.classList.remove('hurt'); void st?.offsetWidth; st?.classList.add('hurt'); }
}
function popBlk() { const b = $('rh-blk'); b?.classList.remove('pop'); void b?.offsetWidth; b?.classList.add('pop'); }
// 영웅 피격 자국 (영웅 초상 위, 도트 스프라이트 assets/run/fx/<종류>.webp 6프레임). 적에 따라 할퀴기 · 물기 · 타격 별
const BITE = new Set(['wolf', 'hound', 'bat', 'mimic', 'dragon', 'hydra']);
const CLAW = new Set(['goblin', 'skeleton', 'knight', 'shade', 'champion', 'gargoyle', 'imp', 'orc', 'demon', 'archdemon']);
const hitKind = id => (BITE.has(id) ? 'bite' : CLAW.has(id) ? 'claw' : 'star');
function clawAt(p, big) {
  const el = document.createElement('div');
  el.className = `hitfx k-${hitKind(R?.C?.e?.id)}${big ? ' big' : ''}`;
  el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 520);
}
// 적의 입 (방해 광선이 나가는 곳)
function mouth() { const c = foeAt(); return { x: c.x, y: c.y + 6 }; }
// 패기: 협동 마왕의 패기와 같은 연출 — 붉은 기운 · 큰 글씨 (이번 턴 뒤집기 · 조정 금지)
async function hakiFx() {
  const fx = FX();
  sfx.haki?.(); buzz(160);
  fx.flash('#C21E56', 900, 0.45);
  fx.ring(innerWidth / 2, innerHeight / 2, { color: '#FF2A6A', r0: 20, r1: Math.max(innerWidth, innerHeight), dur: 1400, width: 14 });
  fx.ring(innerWidth / 2, innerHeight / 2, { color: '#FFFFFF', r0: 10, r1: innerWidth * 0.8, dur: 1100, width: 6 });
  shake($('rc'), 2);
  await wait(250);
  const el = document.createElement('div');
  el.className = 'haki-banner';
  el.innerHTML = `<b>패기 발동</b><small>${ico('eye')} 이번 턴 뒤집기 · 조정 금지</small>`;
  document.body.appendChild(el);
  setTimeout(() => fx.ring(innerWidth / 2, innerHeight * 0.42, { color: '#FF9AB8', r0: 30, r1: innerWidth * 0.6, dur: 900, width: 4 }), 800);
  await wait(1700);
  el.classList.add('out');
  setTimeout(() => el.remove(), 700);
}
// 화면 가장자리가 붉게 번쩍
function hurtFlash(big) {
  const el = document.createElement('div');
  el.className = `hurt-vig${big ? ' big' : ''}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 560);
}
async function playFx(list, before) {
  ui.show = { ...before };
  for (const f of list) {
    try { await playOne(f); } catch (err) { console.warn('[run fx]', f.type, err); X.tray()?.restore?.(); }
  }
  ui.show = null;
}
const HEX_FX = { burn: 'fire', freeze: 'snow', seal: 'chain', twist: 'vortex', reverse: 'vortex', drums: 'drum', gaze: 'eye', haki: 'anger', poison: 'toxic' };
async function playOne(f) {
  const t = X.tray();
  const fxOn = X.prefs.fx !== 'min';
  switch (f.type) {
    case 'play': {
      const e = foeAt(), h = heroAt();
      const tgt = f.target === 'enemy' ? e : h;
      await hand.launch(f.u, tgt, f.target);           // 카드가 날아가 꽂힌다
      if (f.target === 'enemy') {
        const pal = f.score >= 40 ? PALETTES.rainbow : f.score >= 28 ? PALETTES.arcane : f.score >= 18 ? PALETTES.gold : PALETTES.fire;
        const power = f.score >= 40 ? 3 : f.score >= 28 ? 2.2 : f.score >= 18 ? 1.6 : 1.1;
        if (f.dmg > 0 || f.blocked > 0) {
          if (fxOn) FX().impact(e.x, e.y, pal, power);
          sfx.strike?.(power);
          if (power >= 2) sfx.boom?.(power / 2); else sfx.slash?.();
          rumble(Math.min(10, 3 + power * 2));
          const art = $('foe-art');
          art?.classList.remove('hit'); void art?.offsetWidth; art?.classList.add('hit');
          shake($('rc'), power * 0.8);
          setShow({ ehp: ui.show.ehp - f.dmg, eblk: Math.max(0, ui.show.eblk - f.blocked) });
          repaintBars();
          if (f.blocked) floatAt(e.x + 30, e.y - 20, `${ico('shield', 'xs')}${f.blocked}`, 'dim');
          floatAt(e.x, e.y - 10, `${f.dmg}`, `dmg big${power >= 2 ? ' huge' : ''}`);
          if (f.behead) { await wait(250); floatAt(e.x, e.y + 30, '머리 베기!', 'gold'); sfx.slash?.(); if (fxOn) FX().slash?.(e, 140); }
        } else {
          floatAt(e.x, e.y - 10, '0', 'dim');
          sfx.zero();
        }
      }
      if (f.block) {
        if (f.target === 'enemy' && fxOn) FX().ring(h.x, h.y, { color: '#7CC8FF', r0: 10, r1: 60, dur: 360, width: 6 });   // 나눠 낸 방어 몫
        if (fxOn) FX().shield(h);
        sfx.hold();
        setShow({ blk: ui.show.blk + f.block });
        updHero();
        popBlk();
        floatAt(h.x, h.y - 30, `${ico('shield', 'xs')}+${f.block}`, 'sky');
      }
      if (f.heal) { setShow({ hp: ui.show.hp + f.heal }); repaintBars(); floatAt(h.x, h.y - 50, `+${f.heal}`, 'mint'); if (fxOn) FX().burst(h.x, h.y, { n: 16, pal: PALETTES.heal, grav: -60 }); }
      if (f.gold) { floatAt(h.x + 40, h.y - 40, `${ico('coins', 'xs')}+${f.gold}`, 'gold'); sfx.coin(); }
      if (f.burn) floatAt(e.x, e.y + 26, `${ico('fire', 'xs')}화상 ${f.burn}`, 'gold');
      if (f.weak) floatAt(e.x, e.y + 26, `${ico('snow', 'xs')}약화`, 'sky');
      if (f.flip) floatAt(h.x, h.y - 70, `${ico('flip', 'xs')}+1`, 'mint');
      if (f.dance) floatAt(h.x, h.y - 70, `${ico('sparkle', 'xs')}춤사위 +1`, 'gold');
      if (f.nudge) floatAt(h.x + 30, h.y - 70, `${ico('nudge', 'xs')}+${f.nudge}`, 'mint');
      await wait(f.target === 'enemy' ? 420 : 260);
      return;
    }
    case 'discard': {
      await hand.discardAll(f.us);
      t?.absorb?.(300);
      return;
    }
    case 'enemy': {
      setShow({ eblk: 0 });
      const e = foeAt(), h = heroAt();
      const art = $('foe-art');
      if (f.behead) { floatAt(e.x, e.y - 30, '숨결이 끊겼다!', 'mint'); await wait(500); return; }
      if (f.hits.length) {
        // 적이 달려든다 → 할퀸 자국 · 붉은 번쩍임 · 체력바가 깎이며 흰 띠가 따라 줄어든다. 막으면 방패가 '쨍'
        art?.classList.remove('lunge'); void art?.offsetWidth; art?.classList.add('lunge');
        sfx.whoosh?.();
        await wait(190);
        for (const hit of f.hits) {
          const big = hit.dmg >= 15;
          if (hit.blocked) {
            sfx.clang?.(hit.dmg ? 0.6 : 1);
            if (fxOn) { FX().ring(h.x, h.y, { color: '#7CC8FF', r1: 64, dur: 300, width: 6 }); FX().burst(h.x, h.y, { n: 14, pal: PALETTES.frost, speed: [100, 260], life: [0.2, 0.45] }); }
            floatAt(h.x + 34, h.y - 26, `${ico('shield', 'xs')}-${hit.blocked}`, 'sky');
            popBlk();
          }
          if (hit.dmg) {
            sfx.hurt?.(Math.min(2, hit.dmg / 12));
            buzz(big ? 140 : 70);
            if (fxOn) {
              clawAt(center($('rhero')), big);
              hurtFlash(big);
              FX().burst(h.x, h.y, { n: 18 + Math.min(30, hit.dmg), pal: PALETTES.fire, speed: [100, 300], life: [0.25, 0.6], grav: 260 });
            }
            floatAt(h.x, h.y - 12, `-${hit.dmg}`, `dmg${big ? ' big' : ''}`);
            shake($('rc'), big ? 1.6 : 0.9);
          }
          setShow({ blk: Math.max(0, ui.show.blk - hit.blocked), hp: Math.max(0, ui.show.hp - hit.dmg) });
          updHero(hit.dmg > 0);
          await wait(f.hits.length > 1 ? 260 : 340);
        }
        art?.classList.remove('lunge');
        if (f.thorn) { setShow({ ehp: ui.show.ehp - f.thorn }); repaintBars(); floatAt(e.x, e.y, `${f.thorn}`, 'dmg'); }
      }
      if (f.block) { if (fxOn) FX().shield(e); setShow({ eblk: f.block }); repaintBars(); floatAt(e.x, e.y - 30, `${ico('shield', 'xs')}+${f.block}`, 'sky'); sfx.hold(); await wait(380); }
      if (f.str) { floatAt(e.x, e.y - 40, `${ico('up', 'xs')}힘 +${f.str}`, 'dmg'); sfx.powerUp?.(1); if (fxOn) FX().burst(e.x, e.y, { n: 20, pal: PALETTES.fire, grav: -120 }); await wait(380); }
      if (f.heal) { setShow({ ehp: ui.show.ehp + f.heal }); repaintBars(); floatAt(e.x, e.y - 20, `+${f.heal}`, 'mint'); if (fxOn) FX().burst(e.x, e.y, { n: 18, pal: PALETTES.heal, grav: -60 }); await wait(360); }
      if (f.steal) { if (fxOn) FX().coins(h, e, 10); floatAt(h.x, h.y - 40, `${ico('coins', 'xs')}-${f.steal}`, 'gold'); sfx.coin(); await wait(500); }
      if (f.weak) { floatAt(h.x, h.y - 40, `${ico('snow', 'xs')}약화 ${f.weak}턴`, 'sky'); await wait(300); }
      if (!f.hits.length && !f.block && !f.str && !f.heal) await wait(200);
      return;
    }
    case 'hit': {
      const e = foeAt();
      if (f.why === 'burn') { if (fxOn) FX().fire?.([e], 500); floatAt(e.x, e.y - 10, `${ico('fire', 'xs')}${f.dmg}`, 'dmg'); sfx.fire?.(); }
      else if (f.why === 'potion') { if (fxOn) FX().impact(e.x, e.y, PALETTES.fire, 1.8); floatAt(e.x, e.y - 10, `${f.dmg}`, 'dmg big'); sfx.boom?.(1); }
      setShow({ ehp: ui.show.ehp - f.dmg, eblk: Math.max(0, ui.show.eblk - f.blocked) });
      repaintBars();
      await wait(380);
      return;
    }
    case 'rage': {
      const e = foeAt();
      sfx.haki?.();
      if (fxOn) { FX().flash('#E8435A', 400, 0.35); FX().burst(e.x, e.y, { n: 60, pal: PALETTES.hell, speed: [120, 380] }); }
      floatAt(e.x, e.y - 50, '분노!', 'dmg big');
      shake($('rc'), 2);
      await wait(700);
      return;
    }
    case 'regrow': { const e = foeAt(); floatAt(e.x, e.y - 40, '머리가 다시 자란다!', 'dmg'); if (fxOn) FX().regrow?.(e); await wait(600); return; }
    case 'fury': { const e = foeAt(); floatAt(e.x, e.y - 50, `${ico('anger', 'xs')}격앙 +${f.str}`, 'dmg'); await wait(320); return; }
    case 'turn': {
      setShow({ blk: 0, hideIntent: false });
      repaintBars();
      t?.restore?.();                   // 지난 턴 끝에 빨려 들어간 주사위가 다시 나타난다
      return;
    }
    case 'heroBlock': { const h = heroAt(); setShow({ blk: ui.show.blk + f.n }); repaintBars(); floatAt(h.x, h.y - 30, `${ico('shield', 'xs')}+${f.n}`, 'sky'); await wait(200); return; }
    case 'heal': { const h = heroAt(); setShow({ hp: ui.show.hp + f.n }); repaintBars(); floatAt(h.x, h.y - 40, `+${f.n}`, 'mint'); if (fxOn) FX().burst(h.x, h.y, { n: 16, pal: PALETTES.heal, grav: -60 }); sfx.quest?.(); await wait(300); return; }
    case 'tool': { const h = heroAt(); floatAt(h.x, h.y - 60, `${ico(f.kind, 'xs')}+${f.n}`, 'mint'); return; }
    case 'draw': {
      const cards = f.us.map(u => R.C?.hand.find(c => c.u === u)).filter(Boolean);
      $('r-hud').innerHTML = hud();
      await hand.draw(cards);
      return;
    }
    case 'reshuffle': { floatAt(innerWidth * 0.2, innerHeight * 0.75, '덱을 섞었다', 'dim'); return; }
    case 'swap': {
      const nc = f.in != null ? R.C.hand.find(c => c.u === f.in) : null;
      await hand.swap(f.out, nc, R.C.hand.findIndex(c => c.u === f.in));
      sfx.card();
      return;
    }
    // 방해 연출은 협동 보스전(app.js skillFx · hakiFx)과 똑같이 — 같은 방해는 같은 모습이라야 헷갈리지 않는다
    case 'hex': {
      if (f.when !== 'turn') return;
      const e = foeAt(), h = Run.HEX[f.t], fx = FX(), rc = $('rc');
      const trayC = center($('tray'));
      floatAt(e.x, e.y + 40, `${ico(h.icon, 'xs')} ${h.ko}`, 'gold');
      if (!fxOn) { await wait(380); return; }
      if (f.t === 'drums') {                     // 전쟁의 북: 쿵쿵쿵 — 주사위가 튀고 충격파
        for (let k = 0; k < 3; k++) {
          sfx.drum?.(); t?.quake?.();
          fx.quake(trayC.x, trayC.y, trayC.w);
          fx.flash('#B6F25A', 120, 0.18);
          shake(rc, 1.4 + k * 0.4);
          await wait(320);
        }
      } else if (f.t === 'haki') await hakiFx();
      else if (f.t === 'poison') {                // 독: 독 광선 → 트레이에 독안개 · 거품
        sfx.fire?.();
        await fx.acid(mouth(), trayC, 650);
        await fx.toxic(trayC, trayC.w, 1100);
      } else await wait(380);
      return;
    }
    case 'gaze': {                                // 응시: 거대한 눈이 떠지고 붉은 시선이 손패로
      if (fxOn) {
        sfx.haki?.(); buzz(80);
        await FX().eye({ x: innerWidth / 2, y: innerHeight * 0.4 }, center($('hand')), 1200);
      } else sfx.select();
      hand.refresh();
      return;
    }
    case 'hexDice': {
      if (!t) return;
      const fx = FX(), rc = $('rc'), m = mouth();
      const pts = f.dice.map(i => t.screenPos(i));
      const tops = f.dice.map(i => t.topPos?.(i) || t.screenPos(i));
      if (f.t === 'burn') {                       // 화염 숨결: 불꽃 광선 → 주사위가 활활 타며 1로
        sfx.fire?.();
        if (fxOn) { shake(rc, 1.6); await fx.flame(m, pts, 700); }
        await Promise.all([fxOn ? fx.fire(pts, 900) : null, ...f.dice.map(i => t.morph(i, 1, 'burn', 900))]);
        if (ui.dice) f.dice.forEach(i => (ui.dice[i] = 1));
      } else if (f.t === 'freeze') {              // 얼음: 얼음 창이 박히고 서리 결정이 돋는다
        sfx.seal?.();
        if (fxOn) await fx.iceShards(m, pts, 700);
        ui.hideIce = false;
        t.setFrozen?.(f.dice);
        if (fxOn) { shake(rc, 1.2); await fx.frost(pts, 850); }
      } else if (f.t === 'seal') {                // 봉인: 마왕의 봉인과 같은 마법진 · 쇠사슬 · 봉인 문양
        sfx.seal?.();
        if (fxOn) {
          shake(rc, 0.6);
          setTimeout(() => shake(rc, 1.3), 1000 / (fx.speed || 1));
          await fx.seal(tops, 1300);
        } else await wait(500);
      } else if (f.t === 'twist' || f.t === 'reverse') {   // 운명 비틀기 · 역전: 저주 광선 → 소용돌이 속에서 뒤집힌다
        sfx.twist?.();
        const rev = f.t === 'reverse';
        if (fxOn) { shake(rc, 1); await fx.hexBolt(m, pts, 700); if (rev) fx.flash('#7A4BFF', 300, 0.35); }
        await Promise.all([fxOn ? fx.vortex(pts, 900 * (rev ? 1.3 : 1)) : null, ...f.dice.map(i => t.morph(i, R.C.dice[i], 'twist', 900))]);
        if (ui.dice) f.dice.forEach(i => (ui.dice[i] = R.C.dice[i]));
      }
      paintTray();
      hand.refresh();
      return;
    }
    case 'lucky': {
      if (!t) return;
      const p = t.screenPos(f.dice[0]);
      if (fxOn) { FX().ring(p.x, p.y, { color: '#3EE6B4', r1: 60 }); FX().burst(p.x, p.y, { n: 20, pal: PALETTES.heal }); }
      sfx.quest?.();
      await t.morph(f.dice[0], f.to, 'lucky');
      if (ui.dice) ui.dice[f.dice[0]] = f.to;
      return;
    }
    case 'unseal': {                              // 봉인 해제: 사슬이 달아올라 산산조각, 빛기둥
      sfx.unseal?.();
      if (t && fxOn) {
        floatAt(center($('tray')).x, center($('tray')).y - 30, '봉인 해제!', 'gold');
        await FX().unseal(f.dice.map(i => t.topPos?.(i) || t.screenPos(i)), 900);
      }
      return;
    }
    case 'dance': {
      (sfx.danceRun || sfx.dance)?.();
      if (t) await Promise.all(f.to.map((v, i) => (v !== f.from[i] ? t.morph(i, v, 'lucky', 500) : null)));
      return;
    }
    case 'deal': {
      sfx.card();
      if (t) await t.morph(f.i, f.v, 'twist', 520);
      return;
    }
    case 'bet': return;
    case 'potion': { const p = Run.potionInfo(f.id); const h = heroAt(); floatAt(h.x, h.y - 60, `${runIco('potion', p.id, p.icon, 'xs')} ${p.ko}`, 'gold'); sfx.select(); await wait(250); return; }
    case 'foeDie': {
      const art = $('foe-art');
      art?.classList.add('dying');
      sfx.foeDie?.(f.kind === 'boss' ? 2 : f.kind === 'elite' ? 1.4 : 1);   // 팡파레는 '승리!' 화면에서 한 번만
      const e = foeAt();
      if (fxOn) { FX().burst(e.x, e.y, { n: 70, pal: PALETTES.gold, speed: [100, 400], life: [0.5, 1.1] }); FX().ring(e.x, e.y, { color: '#FFE27A', r1: 160, dur: 600 }); }
      await wait(1100);
      return;
    }
    case 'heroDie': {
      $('rh-por')?.classList.add('down');
      sfx.lose?.();
      if (fxOn) FX().flash('#06041A', 900, 0.6);
      await wait(1100);
      return;
    }
    case 'phoenix': { const h = heroAt(); if (fxOn) { FX().burst(h.x, h.y, { n: 60, pal: PALETTES.fire, grav: -160 }); FX().flash('#FFD24A', 400, 0.4); } floatAt(h.x, h.y - 40, '불사조의 부활!', 'gold big'); sfx.levelup?.(); setShow({ hp: f.hp }); repaintBars(); await wait(900); return; }
    case 'runWon': return;
    default: return;
  }
}

// 전투 시작 연출: 적이 커지며 등장, 보스는 이름 띠
async function introFoe() {
  const e = R.C.e, def = Run.ENEMIES[e.id];
  const art = $('foe-art');
  art?.classList.add('enter');
  if (def.kind === 'boss') {
    // 협동 보스 등장과 같은 연출: 화면을 가르는 대각선 띠 + 이름 + 거대한 모습
    ui.busy = true;
    const cut = def.ko.lastIndexOf(' ');
    X.layer.innerHTML = `<div class="overlay boss-intro run-intro" data-act="run-skip" style="--c:${foeColor(e.id)}">
      <div class="bi-band"><i></i></div><div class="bi-band thin"></div>
      <img class="spr bi-boss${isImgSprite(e.id) ? ' spr-hi' : ''}" src="${foeURL(e.id)}" alt="">
      <div class="bi-name"><small>${R.act}막 보스 · ${esc(def.ko.slice(0, cut))}</small><b>${esc(def.ko.slice(cut + 1))}</b></div>
      <div class="bi-flash"></div></div>`;
    sfx.slash?.();
    setTimeout(() => { sfx.boom?.(2); shake(X.layer.firstElementChild, 2.5); }, 430);
    await Promise.race([wait(2500), new Promise(r => (ui.skipIntro = r))]);
    ui.skipIntro = null;
    X.layer.innerHTML = '';
    ui.busy = false;
    paint();
  } else if (def.kind === 'elite') {
    const p = foeAt();
    floatAt(p.x, p.y - 60, '엘리트!', 'dmg big');
    sfx.haki?.();
  }
}

// ── 보상 ─────────────────────────────────────────────────────────────────────
function showReward() {
  const rw = R.reward;
  if (!rw) { R.phase = 'map'; return showMap(); }
  playBgm(R.C && Run.ENEMIES[R.C.e.id]?.kind === 'boss' ? 'victory' : 'run_map');
  const title = rw.kind === 'start' ? '출발 준비!' : rw.kind === 'treasure' ? '보물 상자!' : rw.kind === 'boss' ? '보스 토벌!' : rw.kind === 'elite' ? '엘리트 처치!' : '승리!';
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-reward">
    ${hud()}
    <div class="rw-box">
      <h1 class="rw-title">${title}</h1>
      ${rw.kind === 'treasure' || rw.kind === 'start' ? `<div class="chest"><img class="run-scene" src="${sceneURL(rw.kind)}" alt=""></div>` : ''}
      <div class="rw-items">
        ${rw.items.map((it, k) => rewardRow(it, k)).join('')}
      </div>
      <button class="pbtn gold" data-act="run-leave">${rw.kind === 'boss' ? '다음 막으로' : rw.kind === 'start' ? '출발' : '지도로'}</button>
    </div>
    ${heroStrip()}
  </div>`;
  // 팡파레는 '승리!'가 처음 뜰 때 한 번만 (보상을 받을 때마다 다시 그려도 울리지 않는다)
  if (!rw.cheered) { rw.cheered = true; save(); sfx.win?.(); }
}
function rewardRow(it, k) {
  const done = it.done ? ' done' : '';
  if (it.t === 'gold') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico('coins')}<b>골드 ${it.n}</b></button>`;
  if (it.t === 'potion') { const p = Run.potionInfo(it.id); return `<button class="rw${done}" data-act="run-take" data-k="${k}" style="--pc:${p.color}">${runIco('potion', p.id, p.icon)}<b>${p.ko}</b><small>${p.desc}</small></button>`; }
  if (it.t === 'relic') { const r = Run.relicInfo(it.id); return `<button class="rw relic-row r${r.r}${done}" data-act="run-take" data-k="${k}">${relicIco(r)}<b>${r.ko}</b><small>${r.desc}</small></button>`; }
  if (it.t === 'relicPick') return `<button class="rw boss-relic${done}" data-act="run-relicpick" data-k="${k}">${ico('crown')}<b>보스 유물 고르기</b><small>3개 중 1개</small></button>`;
  if (it.t === 'flip' || it.t === 'nudge') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico(it.t)}<b>${it.t === 'flip' ? '뒤집기' : '조정'} +${it.n}</b></button>`;
  if (it.t === 'card') return `<button class="rw card-row${done}" data-act="run-cardpick" data-k="${k}">${ico('card')}<b>카드 고르기</b><small>${it.opts.length}장 중 1장 · 건너뛸 수 있어요</small></button>`;
  return '';
}
async function takeItem(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  try { Run.takeReward(R, k); } catch (e) { return X.toast(ico('warn'), '받을 수 없어요', e.message, 1700); }
  Run.drainFx(R);
  const el = X.app.querySelector(`[data-act=run-take][data-k="${k}"]`);
  const p = center(el);
  if (it.t === 'gold') { sfx.coin(); FX().coins(p, center($('r-gold')), 12); }
  else if (it.t === 'relic') { sfx.legend(); FX().burst(p.x, p.y, { n: 40, pal: PALETTES.gold }); }
  else { sfx.card(); FX().burst(p.x, p.y, { n: 20, pal: PALETTES.heal }); }
  save();
  setTimeout(() => R.phase === 'reward' && showReward(), 260);
}
function cardPick(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  ui.cardPick = k;
  sfx.card();
  X.layer.innerHTML = `<div class="overlay run-pick" data-act="noop"><div class="pick-box">
    <h2>카드 1장을 덱에 넣으세요</h2>
    <div class="pick-cards" style="--n:${it.opts.length}">${it.opts.map((c, i) => `<button class="rc rc-static pick" data-act="run-cardtake" data-i="${i}" style="--d:${i * 90}ms">${cardFace(c)}<span class="rc-desc">${Run.kwsOf(c).length ? Run.kwsOf(c).map(k => `${Run.KEYWORDS[k].ko}: ${Run.KEYWORDS[k].desc}`).join(' · ') : c.up ? '강화: 점수 +30%' : '키워드 없음'}${Run.kwsOf(c).length && c.up ? ' · 강화 +30%' : ''}</span></button>`).join('')}</div>
    <div class="pick-actions"><button class="pbtn small" data-act="run-deck">내 덱 보기</button><button class="pbtn small" data-act="run-cardskip">건너뛰기</button></div>
  </div></div>`;
}
function cardTake(i) {
  const k = ui.cardPick;
  const el = X.layer.querySelector(`[data-act=run-cardtake][data-i="${i}"]`);
  try { Run.takeReward(R, k, i); } catch (e) { return X.toast(ico('warn'), '받을 수 없어요', e.message, 1500); }
  Run.drainFx(R);
  sfx.legend();
  if (el) { el.classList.add('taken'); const p = center(el); FX().burst(p.x, p.y, { n: 40, pal: PALETTES.gold }); }
  ui.cardPick = null;
  save();
  setTimeout(() => { X.layer.innerHTML = ''; if (R.phase === 'reward') showReward(); }, 520);
}
function relicPick(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  ui.relicPick = k;
  sfx.legend();
  X.layer.innerHTML = `<div class="overlay run-pick" data-act="noop"><div class="pick-box">
    <h2>보스 유물 1개를 고르세요</h2>
    <div class="relic-picks">${it.opts.map((id, i) => { const r = Run.relicInfo(id); return `<button class="relic-card r3" data-act="run-relictake" data-i="${i}">${relicIco(r, 'lg')}<b>${r.ko}</b><small>${r.desc}</small></button>`; }).join('')}</div>
    <div class="pick-actions"><button class="pbtn small" data-act="run-relicskip">건너뛰기</button></div>
  </div></div>`;
}

// ── 상점 ─────────────────────────────────────────────────────────────────────
function showShop() {
  playBgm('run_map');
  const sh = R.shop;
  const price = (p, sold) => `<em class="price${!sold && R.gold < p ? ' poor' : ''}">${sold ? '판매됨' : `${ico('coins', 'xs')}${p}`}</em>`;
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-shop">
    ${hud()}
    <div class="shop-head"><img class="run-scene sm" src="${sceneURL('shop')}" alt=""><div><b>떠돌이 상점</b><small>"좋은 물건 있어요, 모험가님!"</small></div></div>
    <div class="shop-scroll">
      <h3>족보 카드</h3>
      <div class="shop-cards">${sh.cards.map((it, i) => `<button class="shop-item${it.sold ? ' sold' : ''}" data-act="run-buy" data-kind="card" data-i="${i}" ${it.sold ? 'disabled' : ''}><div class="rc rc-static">${cardFace(it.c)}</div>${price(it.price, it.sold)}</button>`).join('')}</div>
      <h3>유물 · 물약 · 도구</h3>
      <div class="shop-goods">
        ${sh.relics.map((it, i) => { const r = Run.relicInfo(it.id); return `<button class="shop-good relic-row r${r.r}${it.sold ? ' sold' : ''}" data-act="run-buy" data-kind="relic" data-i="${i}" ${it.sold ? 'disabled' : ''}>${relicIco(r)}<span><b>${r.ko}</b><small>${r.desc}</small></span>${price(it.price, it.sold)}</button>`; }).join('')}
        ${sh.potions.map((it, i) => { const p = Run.potionInfo(it.id); return `<button class="shop-good${it.sold ? ' sold' : ''}" data-act="run-buy" data-kind="potion" data-i="${i}" ${it.sold ? 'disabled' : ''} style="--pc:${p.color}">${runIco('potion', p.id, p.icon)}<span><b>${p.ko}</b><small>${p.desc}</small></span>${price(it.price, it.sold)}</button>`; }).join('')}
        ${sh.tools.map((it, i) => `<button class="shop-good${it.sold ? ' sold' : ''}" data-act="run-buy" data-kind="tool" data-i="${i}" ${it.sold ? 'disabled' : ''}>${ico(it.kind)}<span><b>${it.kind === 'flip' ? '뒤집기' : '조정'} +1</b><small>${it.kind === 'flip' ? '주사위 1개를 반대 면으로' : '주사위 1개를 ±1'} (최대 ${Run.TOOL_CAP})</small></span>${price(it.price, it.sold)}</button>`).join('')}
        <button class="shop-good smith${sh.smithed ? ' sold' : ''}" data-act="run-shopsmith" ${sh.smithed || !R.deck.some(Run.canUpgrade) ? 'disabled' : ''}>${runIco('ui', 'smith', 'axe')}<span><b>대장장이</b><small>카드 1장 강화 (점수 +30% 또는 효과 새기기, 최대 ${Run.KW_MAX}개)</small></span>${price(Run.smithPrice(R), sh.smithed)}</button>
        <button class="shop-good remove${sh.removed ? ' sold' : ''}" data-act="run-remove" ${sh.removed ? 'disabled' : ''}>${ico('skull')}<span><b>카드 제거</b><small>덱에서 카드 1장을 없앤다</small></span>${price(Run.removePrice(R), sh.removed)}</button>
      </div>
    </div>
    <button class="pbtn gold" data-act="run-shopleave">상점 나가기</button>
    ${heroStrip()}
  </div>`;
}

// ── 휴식 ─────────────────────────────────────────────────────────────────────
function showRest() {
  playBgm('run_map');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-rest">
    ${hud()}
    <div class="camp"><div class="campfire" id="campfire"><img class="run-scene" src="${sceneURL('rest')}" alt=""></div><b>모닥불</b><small>잠시 쉬어 갈 수 있다</small></div>
    <div class="rest-opts">
      <button class="pbtn big rest-btn" data-act="run-rest">${ico('heart')}<span>휴식<small>체력 ${Run.restAmount(R)} 회복</small></span></button>
      <button class="pbtn big rest-btn" data-act="run-smith" ${R.deck.some(Run.canUpgrade) ? '' : 'disabled'}>${runIco('ui', 'smith', 'axe')}<span>단련<small>카드 1장 강화 (+30% 또는 효과)</small></span></button>
    </div>
    ${heroStrip()}
  </div>`;
  const p = center($('campfire'));
  if (X.prefs.fx !== 'min') FX().burst(p.x, p.y, { n: 24, pal: PALETTES.fire, grav: -140, speed: [20, 90], life: [0.6, 1.2] });
}

// ── 이벤트 ───────────────────────────────────────────────────────────────────
function showEvent() {
  playBgm('run_map');
  const ev = Run.eventDef(R.event.id);
  const res = R.event.result;
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-event">
    ${hud()}
    <div class="ev-box frame">
      <div class="ev-art">${sceneURL(ev.id) ? `<img class="run-scene" src="${sceneURL(ev.id)}" alt="">` : ico(ev.art, 'lg')}</div>
      <h2>${esc(ev.ko)}</h2>
      <p class="ev-text">${esc(ev.text)}</p>
      ${R.event.dice ? `<div class="ev-dice">${R.event.dice.map(v => `<i class="dd-die" data-v="${v}">${miniDie(v)}</i>`).join('')}</div>` : ''}
      ${res != null ? `<p class="ev-result">${esc(res)}</p><button class="pbtn gold" data-act="run-evleave">계속</button>`
        : `<div class="ev-opts">${ev.opts.map((o, k) => { const ok = o.can(R); const d = typeof o.desc === 'function' ? o.desc(R) : o.desc; return `<button class="pbtn ev-opt" data-act="run-evopt" data-k="${k}" ${ok ? '' : 'disabled'}><span>${esc(o.ko)}</span><small>${esc(d)}</small></button>`; }).join('')}</div>`}
    </div>
    ${heroStrip()}
  </div>`;
}

// ── 덱 고르기 (강화 · 제거 · 복제) / 덱 보기 ─────────────────────────────────
function showPick() {
  const pk = R.pick;
  if (pk.opts) return showUpgrade();
  const title = { upgrade: '강화할 카드를 고르세요', remove: '없앨 카드를 고르세요', dup: '복제할 카드를 고르세요' }[pk.why];
  const list = Run.deckCards(R).filter(c => pk.why !== 'upgrade' || Run.canUpgrade(c));
  const sel = ui.pickU != null ? R.deck.find(c => c.u === ui.pickU) : null;
  X.layer.innerHTML = `<div class="overlay run-deckpick" data-act="noop"><div class="deck-box">
    <h2>${title}</h2>
    ${pk.cost ? `<p class="hint">${ico('coins', 'xs')} ${pk.cost} 골드</p>` : pk.hp ? `<p class="hint">체력 ${pk.hp}을 잃어요</p>` : ''}
    <div class="deck-grid">${list.map(c => `<button class="rc rc-static mini${ui.pickU === c.u ? ' on' : ''}" data-act="run-pickcard" data-u="${c.u}">${cardFace(c)}</button>`).join('')}</div>
    ${pk.why === 'upgrade' ? `<p class="hint">강화는 점수 +30% 한 번, 그리고 효과를 ${Run.KW_MAX}개까지 새길 수 있어요</p>` : ''}
    ${sel ? `<div class="pick-prev"><div class="rc rc-static">${cardFace(sel)}</div></div>` : ''}
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">취소</button><button class="pbtn small gold" data-act="run-pickok" ${sel ? '' : 'disabled'}>${{ upgrade: '다음', remove: '제거', dup: '복제' }[pk.why]}</button></div>
  </div></div>`;
}
// 강화 고르기: 점수 +30% 또는 새 효과 (3개 중 1개). 고르면 바뀐 카드를 미리 보여 준다
function showUpgrade() {
  const pk = R.pick, c = R.deck.find(x => x.u === pk.u);
  const after = o => (o === 'up' ? { ...c, up: 1 } : { ...c, kws: [...Run.kwsOf(c), o] });
  X.layer.innerHTML = `<div class="overlay run-deckpick" data-act="noop"><div class="deck-box">
    <div class="up-head"><img class="run-scene" src="${sceneURL('smith')}" alt=""><h2>어떻게 강화할까요?</h2></div>
    ${pk.cost ? `<p class="hint">${ico('coins', 'xs')} ${pk.cost} 골드</p>` : ''}
    <div class="up-opts">${pk.opts.map((o, k) => {
      const kw = o !== 'up' && Run.KEYWORDS[o];
      return `<button class="up-opt" data-act="run-upopt" data-k="${k}"><div class="rc rc-static mini">${cardFace(after(o))}</div>
        <span><b>${o === 'up' ? `${ico('up', 'xs')} 점수 +30%` : `${runIco('kw', o, kw.icon, 'xs')} ${kw.ko}`}</b><small>${o === 'up' ? '이 카드의 점수가 늘 30% 더 나온다' : kw.desc}</small></span></button>`;
    }).join('')}</div>
    <p class="hint">효과 ${Run.kwsOf(c).length}/${Run.KW_MAX}${c.up ? ' · 점수 강화 완료' : ''}</p>
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">취소</button></div>
  </div></div>`;
}
function showDeck() {
  const C = R.phase === 'combat' ? R.C : null;
  const sec = (title, cards) => `<h3>${title} <small>${cards.length}장</small></h3><div class="deck-grid">${cards.map(c => `<div class="rc rc-static mini">${cardFace(c)}</div>`).join('') || '<p class="dim">없음</p>'}</div>`;
  X.layer.innerHTML = `<div class="overlay run-deckview" data-act="close-bg"><div class="deck-box" data-act="noop">
    <h2>${ico('card')} 내 덱 ${R.deck.length}장</h2>
    ${C ? sec('뽑을 카드', C.draw.slice().sort((a, b) => a.cat.localeCompare(b.cat))) + sec('버린 카드', C.discard) : sec('전체', Run.deckCards(R))}
    <div class="pick-actions"><button class="pbtn small gold" data-act="close">닫기</button></div>
  </div></div>`;
}

// ── 결과 ─────────────────────────────────────────────────────────────────────
function showEnd() {
  hand?.destroy(); hand = null;
  const won = R.won;
  const b = best();
  const opened = won && (b.asc[R.cls] ?? -1) < (R.asc || 0) && (R.asc || 0) < Run.ASC_MAX;
  const fresh = !ui.recorded;
  if (!ui.recorded) {
    ui.recorded = true;
    b.runs++;
    if (won) b.wins++;
    const reach = (R.act - 1) * 7 + Math.min(7, Run.floorOf(R));
    b.top = Math.max(b.top, won ? 21 : reach);
    (b.cls[R.cls] ||= { runs: 0, wins: 0 }).runs++;
    if (won) { b.cls[R.cls].wins++; b.asc[R.cls] = Math.max(b.asc[R.cls] ?? -1, R.asc || 0); }
    ui.gotStars = Run.starsOf(R);
    b.meta.stars += ui.gotStars;
    X.store.set(BEST, b);
    syncFeats();
  }
  X.store.del(SAVE);
  playBgm(won ? 'run_win' : 'run_lose');
  const st = R.stats;
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-end ${won ? 'won' : 'lost'}">
    <div class="end-box">
      <h1>${won ? '원정 성공!' : '원정 실패'}</h1>
      <div class="end-hero">${hero(R.cls)}<b>${esc(classInfo(R.cls).ko)}</b><small>${won ? '마왕을 쓰러뜨리고 돌아왔다!' : `${R.act}막 ${Math.min(Run.ROWS + 1, Run.floorOf(R))}층에서 쓰러졌다`}</small></div>
      <div class="end-stats">
        <span><b>${st.fights}</b>일반</span><span><b>${st.elites}</b>엘리트</span><span><b>${st.bosses}</b>보스</span>
        <span><b>${st.dmg}</b>준 피해</span><span><b>${st.maxHit}</b>최고 한 방</span><span><b>${st.turns}</b>턴</span>
      </div>
      <div class="end-relics">${R.relics.map(id => relicIco(Run.relicInfo(id))).join('')}</div>
      <p class="hint">${R.asc ? `승천 ${R.asc} · ` : ''}덱 ${R.deck.length}장 · 골드 ${st.gold} 획득</p>
      <p class="end-stars">${starIco()} 별조각 <b>+${ui.gotStars || 0}</b> <small>원정 준비에서 영구 강화에 써요</small></p>
      ${opened ? `<p class="asc-open">${ico('up', 'xs')} ${esc(classInfo(R.cls).ko)} 승천 ${(R.asc || 0) + 1} 열림!</p>` : ''}
      <div class="res-actions"><button class="pbtn" data-act="run-home">메인으로</button><button class="pbtn gold" data-act="run-again">다시 원정</button></div>
    </div>
  </div>`;
  if (won && X.prefs.fx !== 'min') { FX().burst(innerWidth / 2, innerHeight * 0.3, { n: 90, pal: PALETTES.rainbow, speed: [100, 420] }); sfx.levelup?.(); }
  if (fresh && ui.gotStars) setTimeout(() => sfx.stars?.(ui.gotStars), won ? 1100 : 600);
  if (fresh && opened) setTimeout(() => sfx.ascend?.(), 2000);
}

// ── 메뉴 ─────────────────────────────────────────────────────────────────────
function showMenu() {
  X.layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>원정 일시정지</h2>
    <p class="hint">${R.act}막 · ${esc(Run.ACT_INFO[R.act].ko)} · 체력 ${R.hp}/${R.maxHp}</p>
    <div class="modal-actions">
      <button class="pbtn gold" data-act="close">계속하기</button>
      <button class="pbtn" data-act="run-deck">덱 보기</button>
      <button class="pbtn" data-act="settings">설정</button>
      <button class="pbtn" data-act="run-home">메인 메뉴로 <small>원정은 저장돼요</small></button>
      <button class="pbtn danger" data-act="run-giveup">원정 포기</button>
    </div>
  </div></div>`;
}

// ── 행동 받기 ────────────────────────────────────────────────────────────────
export function onAct(act, t) {
  const now = performance.now();
  if (act === 'run-open') { sfx.select(); return open(); }
  if (act === 'run-resume') { sfx.start(); return resume(); }
  if (act === 'run-home') { sfx.back(); hand?.destroy(); hand = null; R = null; ui.recorded = false; X.layer.innerHTML = ''; return X.showTitle(); }
  if (act === 'run-cls') { sfx.tap(); ui.cls = t.dataset.id; X.store.set('diceheroes.runCls', ui.cls); return paintSelect(); }
  if (act === 'run-asc') {
    const b = best(), v = Math.max(0, Math.min(ascOpen(b, ui.cls), (ui.asc || 0) + Number(t.dataset.d)));
    X.store.set('diceheroes.runAsc', { ...(X.store.get('diceheroes.runAsc') || {}), [ui.cls]: v });
    sfx.select();
    return paintSelect();
  }
  if (act === 'run-feats') { sfx.select(); return showFeats(); }
  if (act === 'run-meta') { sfx.select(); return showMeta(); }
  if (act === 'run-metabuy' || act === 'run-diebuy' || act === 'run-dieequip') return metaAct(act, t.dataset.id);
  if (act === 'run-start' || act === 'run-again') {
    sfx.start();
    const cls = act === 'run-again' ? R?.cls || ui.cls : ui.cls;
    const lv = act === 'run-again' && R ? R.asc || 0 : ui.asc || 0;
    R = Run.createRun({ cls, name: X.name(), asc: lv, meta: best().meta });
    ui.recorded = false;
    save();
    return enterView(true);              // 원정 준비 '보물 지도'가 있으면 출발 유물부터
  }
  if (!R) return;
  if (act === 'run-menu') { sfx.select(); return showMenu(); }
  if (act === 'run-giveup') {
    if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = '한 번 더 누르면 포기해요'; sfx.select(); return; }
    R.ended = true; R.won = false; R.phase = 'lost';
    X.layer.innerHTML = '';
    return showEnd();
  }
  if (act === 'run-deck') { sfx.select(); return showDeck(); }
  if (act === 'run-skill') { const ci = Run.RUN_CLASSES[R.cls]; sfx.tap(); return X.popover(t, `<b>${ico('star', 'xs')} ${ci.skill}</b><p>${esc(ci.desc)}</p>`); }
  if (act === 'run-relic') { const r = Run.relicInfo(t.dataset.id); sfx.tap(); return X.popover(t, `<b>${relicIco(r, 'xs')} ${r.ko}</b> <small>${['', '일반', '희귀', '보스'][r.r]}</small><p>${r.desc}</p>`); }
  if (act === 'run-pot') return potionMenu(Number(t.dataset.k), t);
  if (act === 'run-potuse') return usePotion(Number(t.dataset.k));
  if (act === 'run-potdrop') { X.closePopover(); Run.dropPotion(R, Number(t.dataset.k)); save(); sfx.back(); return R.phase === 'combat' ? paint() : enterView(); }
  // 지도
  if (act === 'run-node') {
    if (R.phase !== 'map') return;
    const id = Number(t.dataset.id);
    if (!Run.nextNodes(R).includes(id)) { sfx.back(); return; }
    sfx.start();
    try { Run.enterNode(R, id); } catch (e) { return X.toast(ico('warn'), '갈 수 없어요', e.message, 1400); }
    Run.drainFx(R);
    save();
    t.classList.add('go');
    // 전투 칸: 그 곡이 준비될 때까지 (최대 3초) 기다렸다가 들어간다
    const ty = Run.mapNode(R, id).type;
    const song = ty === 'boss' ? bossSong(R.boss) : ty === 'elite' ? 'run_elite' : ty === 'fight' ? 'run_battle' : null;
    const ready = song ? Promise.race([preloadBgm(song), wait(3000)]) : null;
    return Promise.all([ready, wait(260)]).then(() => enterView(true));
  }
  // 보상
  if (act === 'run-take') return takeItem(Number(t.dataset.k));
  if (act === 'run-cardpick') return cardPick(Number(t.dataset.k));
  if (act === 'run-cardtake') return cardTake(Number(t.dataset.i));
  if (act === 'run-cardskip') { Run.takeReward(R, ui.cardPick, -1); Run.drainFx(R); ui.cardPick = null; sfx.back(); X.layer.innerHTML = ''; save(); return showReward(); }
  if (act === 'run-relicpick') return relicPick(Number(t.dataset.k));
  if (act === 'run-relictake' || act === 'run-relicskip') {
    Run.takeReward(R, ui.relicPick, act === 'run-relicskip' ? -1 : Number(t.dataset.i));
    Run.drainFx(R);
    ui.relicPick = null;
    act === 'run-relictake' ? sfx.legend() : sfx.back();
    X.layer.innerHTML = ''; save();
    return showReward();
  }
  if (act === 'run-leave') {
    if (now - ui.last < 400) return;
    ui.last = now;
    const left = R.reward?.items.filter(it => !it.done && (it.t === 'card' || it.t === 'relicPick' || it.t === 'relic')).length;
    if (left && !t.dataset.sure) { t.dataset.sure = '1'; t.textContent = '받지 않은 보상이 있어요 · 한 번 더 누르면 떠나요'; sfx.select(); return; }
    sfx.start();
    const boss = R.reward?.kind === 'boss';
    Run.leaveReward(R);
    const fx = Run.drainFx(R);
    save();
    if (boss && R.phase === 'map') return actBanner(fx.find(f => f.type === 'act'));
    return enterView();
  }
  // 상점
  if (act === 'run-buy') {
    try { Run.buy(R, t.dataset.kind, Number(t.dataset.i)); } catch (e) { sfx.back(); return X.toast(ico('warn'), '살 수 없어요', e.message, 1400); }
    Run.drainFx(R); sfx.coin(); save();
    const p = center(t); FX().burst(p.x, p.y, { n: 24, pal: PALETTES.gold });
    return showShop();
  }
  if (act === 'run-remove') { try { Run.startRemove(R); } catch (e) { sfx.back(); return X.toast(ico('warn'), '할 수 없어요', e.message, 1500); } sfx.select(); ui.pickU = null; return showPick(); }
  if (act === 'run-shopleave') { sfx.back(); Run.leaveShop(R); save(); return showMap(); }
  // 휴식
  if (act === 'run-rest') {
    const p = center($('campfire'));
    Run.restHeal(R); Run.drainFx(R); save();
    sfx.quest?.(); FX().burst(p.x, p.y, { n: 40, pal: PALETTES.heal, grav: -80 });
    return setTimeout(showMap, 700);
  }
  if (act === 'run-upopt') {
    const pk = R.pick, from = pk?.from;
    try { Run.chooseUpgrade(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
    Run.drainFx(R);
    sfx.legend?.();
    const p = center(t); FX().burst(p.x, p.y, { n: 36, pal: PALETTES.gold });
    X.layer.innerHTML = ''; save();
    return from === 'shop' ? showShop() : enterView();
  }
  if (act === 'run-shopsmith') { try { Run.startSmith(R); } catch (e) { sfx.back(); return X.toast(ico('warn'), '할 수 없어요', e.message, 1500); } sfx.select(); ui.pickU = null; return showPick(); }
  if (act === 'run-smith') { try { Run.startUpgrade(R); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); } sfx.select(); ui.pickU = null; return showPick(); }
  // 덱 고르기
  if (act === 'run-pickcard') { sfx.tap(); ui.pickU = Number(t.dataset.u); return showPick(); }
  if (act === 'run-pickcancel') { sfx.back(); Run.cancelPick(R); ui.pickU = null; X.layer.innerHTML = ''; save(); return enterView(); }
  if (act === 'run-pickok') {
    if (ui.pickU == null) return;
    const why = R.pick?.why;
    try { Run.pickDeck(R, ui.pickU); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
    Run.drainFx(R);
    if (R.pick?.opts) { sfx.select(); ui.pickU = null; return showUpgrade(); }
    why === 'upgrade' ? sfx.levelup?.() : sfx.select();
    ui.pickU = null; X.layer.innerHTML = ''; save();
    if (R.hp <= 0) { R.ended = true; R.phase = 'lost'; return showEnd(); }
    return enterView();
  }
  // 이벤트
  if (act === 'run-evopt') {
    try { Run.eventChoose(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), '고를 수 없어요', e.message, 1400); }
    Run.drainFx(R); sfx.select(); save();
    if (R.phase === 'lost') return showEnd();
    if (R.pick) { ui.pickU = null; showEvent(); return showPick(); }
    return showEvent();
  }
  if (act === 'run-evleave') { sfx.start(); Run.eventLeave(R); Run.drainFx(R); save(); return enterView(true); }
  // 전투
  if (R.phase !== 'combat') return;
  if (act === 'run-skip') return ui.skipIntro?.();
  if (act === 'run-intent') return intentInfo(t);
  if (act === 'run-hex') { const h = R.C.hex; sfx.tap(); return X.popover(t, `<b>${ico(Run.HEX[h.t].icon, 'xs')} ${Run.HEX[h.t].ko}</b><p>${Run.HEX[h.t].desc(h.n)}</p>`); }
  if (!canAct()) return;
  if (act === 'run-roll') return doRoll();
  if (act === 'run-tool') {
    ui.dealDie = null;
    ui.tool = ui.tool === t.dataset.tool ? null : t.dataset.tool;
    ui.sel = null; hand.select(null);
    sfx.select();
    return paint();
  }
  if (act === 'run-die') return onDie(Number(t.dataset.i));
  if (act === 'run-nudge') {
    const i = Number(t.dataset.i), d = Number(t.dataset.d);
    ui.tool = null;
    try { Run.useNudge(R, i, d); } catch (e) { X.toast(ico('warn'), '할 수 없어요', e.message, 1400); return paint(); }
    sfx.select(); save(); paint();
    X.tray()?.show(R.C.dice, R.C.held);
    return;
  }
  if (act === 'run-deal') {
    const i = Number(t.dataset.i), v = Number(t.dataset.v);
    ui.tool = null; ui.dealDie = null;
    const r0 = snap();
    try { Run.useDeal(R, i, v); } catch (e) { X.toast(ico('warn'), '할 수 없어요', e.message, 1400); return paint(); }
    ui.busy = true;
    return playFx(Run.drainFx(R), r0).then(() => { ui.busy = false; save(); paint(); X.tray()?.show(R.C.dice, R.C.held); });
  }
  if (act === 'run-dance') {
    const r0 = snap();
    try { Run.useDance(R); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
    ui.busy = true;
    return playFx(Run.drainFx(R), r0).then(() => { ui.busy = false; save(); paint(); X.tray()?.show(R.C.dice, R.C.held); });
  }
  if (act === 'run-play') {
    X.closePopover?.();
    const u = Number(t.dataset.u), tt = t.dataset.t;
    const target = tt == null || tt === '' ? (ui.split?.u === u ? ui.split.atk : 'enemy') : tt === 'enemy' || tt === 'self' ? tt : Number(tt);
    return doPlay(u, target);
  }
  if (act === 'run-split') {
    const sp = ui.split;
    if (!sp) return;
    const v = t.dataset.v, hi = R.C.hand.findIndex(c => c.u === sp.u);
    if (v === 'all') return setSplit(sp.S);
    if (v === 'none') return setSplit(0);
    if (v === 'cover') return setSplit(hi >= 0 ? Run.coverAtk(R, hi).atk : sp.atk);
    return setSplit(sp.atk + Number(v));
  }
  if (act === 'run-bet') return doBet(Number(t.dataset.u));
  if (act === 'run-betno') { sfx.back(); ui.sel = null; hand.select(null); $('rtip').innerHTML = tipText(false); return; }
}

// 트레이의 주사위를 눌렀을 때 (app.js 가 원정 중에 보낸다)
export function onDie(i) {
  if (!canAct() || !R.C.rolled) return;
  const C = R.C;
  if (ui.tool === 'flip') {
    ui.tool = null;
    try { Run.useFlip(R, i); } catch (e) { X.toast(ico('warn'), '할 수 없어요', e.message, 1400); return paint(); }
    sfx.select(); save(); paint();
    X.tray()?.show(C.dice, C.held);
    return;
  }
  if (ui.tool === 'nudge') return;
  if (ui.tool === 'deal') { if (Run.isSealed(R, i)) return; sfx.select(); ui.dealDie = i; return paintTray(); }
  if (Run.isSealed(R, i)) { sfx.back(); buzz(40); return X.toast(ico('chain'), '봉인된 주사위', '다시 굴리면 풀려요.', 1300); }
  if (Run.isFrozen(R, i)) { sfx.back(); buzz(40); return X.toast(ico('snow'), '얼어붙은 주사위', '이번 턴엔 다시 굴릴 수 없어요. 뒤집기 · 조정은 돼요.', 1400); }
  const held = !C.held[i];
  held ? sfx.hold() : sfx.unhold();
  Run.toggleHold(R, i);
  X.tray()?.setHeld(C.held);
  save();
  paint();
}
export function dieInfo(i) {
  const C = R?.C;
  if (!C?.rolled) return;
  const v = C.dice[i];
  const t = X.tray();
  const pos = t.screenPos(i);
  const a = document.createElement('span');
  a.style.cssText = `position:fixed;left:${pos.x - 20}px;top:${pos.y - 20}px;width:40px;height:40px;pointer-events:none`;
  document.body.appendChild(a);
  X.popover(a, `<b>주사위 ${miniDie(v)} ${v}</b><p>뒤집으면 ${7 - v} · 조정하면 ${[v - 1, v + 1].filter(x => x >= 1 && x <= 6).join(' 또는 ')}</p>`, { afterRelease: true });
  a.remove();
}
export function render() { if (R?.phase === 'combat') paint(); }

function intentInfo(t) {
  const C = R.C, m = C.e.intent;
  if (!m) return;
  const parts = Run.intentParts(R).map(p => {
    if (p.k === 'atk') return `${ico('sword', 'xs')} 공격 ${p.n}${p.hits > 1 ? ` × ${p.hits}번` : ''}`;
    if (p.k === 'block') return `${ico('shield', 'xs')} 보호막 ${p.n}`;
    if (p.k === 'str') return `${ico('up', 'xs')} 힘 +${p.n} (이후 공격이 세진다)`;
    if (p.k === 'heal') return `${ico('heart', 'xs')} 체력 ${p.n} 회복`;
    if (p.k === 'steal') return `${ico('coins', 'xs')} 골드 ${p.n} 훔치기`;
    if (p.k === 'weak') return `${ico('snow', 'xs')} 약화 ${p.n}턴 (내 카드 점수 ×0.75)`;
    if (p.k === 'hex') return `${ico(Run.HEX[p.t].icon, 'xs')} <b>${Run.HEX[p.t].ko}</b>: ${Run.HEX[p.t].desc(p.n)} (이번 턴)`;
    return '';
  });
  const fury = Run.furyOf(R);
  sfx.tap();
  X.popover(t, `<b>${esc(m.ko)}</b>${parts.map(x => `<p>${x}</p>`).join('')}<small>공격은 내가 카드를 낸 뒤에 들어와요. 보호막이 먼저 막아요.<br>${fury.from}턴부터 격앙: 적의 턴마다 힘 +${fury.str}</small>`);
}
function potionMenu(k, t) {
  const id = R.potions[k];
  if (!id) return;
  const p = Run.potionInfo(id);
  const can = canAct();
  sfx.tap();
  X.popover(t, `<b style="color:${p.color}">${ico(p.icon, 'xs')} ${p.ko}</b><p>${p.desc}</p><div class="pot-acts">${can ? `<button class="pbtn small gold" data-act="run-potuse" data-k="${k}">마시기</button>` : '<small>전투 중 내 턴에 쓸 수 있어요</small>'}<button class="pbtn small" data-act="run-potdrop" data-k="${k}">버리기</button></div>`);
}
async function usePotion(k) {
  X.closePopover();
  if (!canAct()) return;
  const r = await act(() => Run.usePotion(R, k));
  if (!r) return;
  ui.busy = true;
  await playFx(r.list, r.before);
  ui.busy = false;
  save();
  afterAction();
}
async function actBanner(f) {
  X.layer.innerHTML = `<div class="overlay solid act-banner" data-act="run-skip"><div class="banner"><span>막 돌파!</span><b class="rn">${R.act}막</b><b>${esc(Run.ACT_INFO[R.act].ko)}</b>${f?.heal ? `<span>${ico('heart', 'xs')} 체력 ${f.heal} 회복</span>` : ''}</div></div>`;
  sfx.levelup?.();
  await wait(1800);
  X.layer.innerHTML = '';
  showMap();
}

// 뒤로가기: 열린 창부터 닫고, 전투 중엔 메뉴
export function back() {
  if (!R && ui.view === 'select') { onAct('run-home', {}); return true; }
  if (!R) return false;
  if (X.layer.querySelector('.run-pick')) return true;              // 보상은 고르거나 건너뛰기로
  if (R.pick) { onAct('run-pickcancel', {}); return true; }
  if (X.layer.firstElementChild) { sfx.back(); X.layer.innerHTML = ''; return true; }
  if (ui.tool) { ui.tool = null; paint(); return true; }
  if (ui.sel != null) { closeSplit(); return true; }
  showMenu();
  return true;
}
export const active = () => !!R || ui.view === 'select';
export const state = () => R;
