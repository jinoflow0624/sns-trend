// 원정 화면. /*TEST{*/ … /*}TEST*/ · // @test-only{ … // }@test-only 구간은 배포판 빌드가 잘라낸다 (시험 원정 · 시험용 승천).
// app.js 가 init(도구) 로 트레이 · 알림 · 저장소 같은 공용 도구를 넘겨 주고,
// 'run-' 으로 시작하는 행동과 원정 중의 주사위 터치를 onAct 로 보낸다. 규칙은 rules.js (순수 로직).
import { t as TR, tL } from '../i18n.js';
import * as Run from './rules.js';
import { catInfo, bossInfo, classInfo } from '../engine.js';
import { ico } from '../icons.js';
import { spriteURL, isImgSprite, HERO_ART } from '../pixel.js';
import { hasMotion, bustURL, bossBustURL, bossFaceCls, bossFlips, loadMotion, loadBossMotion } from '../motion.js';
import { bg, bgImage, bgFile, fg } from '../bgload.js';
import { sfx, playBgm, preloadBgm, prefetchBgm, bossSong, buzz, rumble, BGM_FILES } from '../audio.js';
import { FX, PALETTES, shake } from '../fx.js';
import { foeURL, foePoseURL, isPixelFoe, facesLeft, runIco, starIco, sceneURL, actBgURL, runAssetURLs, RUN_FONT, RUN_ART_VER, omenWinURL, uiArtURL, cardBackURL, jesterURL, futureIconURL } from './art.js';
import { relicIco, relicURLs, dotIco } from './relic-art.js';
import { Hand } from './hand.js';
import * as Prog from './progress.js';
import { PROD } from '../fire.js';
import { track } from '../live.js';
import { initTour, tour, replayTours, tourForced, tourRunEnded } from './tour.js';

const SAVE = 'diceheroes.run';
let X = null;            // app.js 도구
let R = null;            // 원정 상태
let hand = null;         // 손패 (스프링 카드)
const ui = { busy: false, tool: null, dealDie: null, sel: null, split: null, rolling: false, show: null, dice: null, view: null, sealRoll: null, pickU: null, cardPick: null, relicPick: null, last: 0, featShown: new Set(), end: null, stamps: [], stampHide: new Set() };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const miniDie = v => `<span class="md${v === 1 ? ' one' : ''}">${[...Array(9)].map((_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
const wait = ms => X.wait(ms);
const $ = id => document.getElementById(id);
const center = el => { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 }; };
const hero = cls => `<img class="spr${isImgSprite(cls) ? ' spr-hi' : ''}" src="${spriteURL(cls, 4)}" alt="">`;
// 아래 영웅 칸 (44px): v8 영웅은 상반신 그림 (app.js bust 와 같다)
const heroBust = cls => (HERO_ART !== 'v1' && hasMotion(cls) ? `<img class="spr spr-hi bust" src="${bustURL(cls)}" alt="">` : hero(cls));
const FOE_COLOR = { jester: '#3EE6E0', slime: '#3EE6B4', goblin: '#7CC24A', bat: '#8A5CC8', wolf: '#9AA4B8', shaman: '#B36BFF', mimic: '#FFC83D',
  skeleton: '#EEE6D0', ghost: '#7CA8D8', wisp: '#7CE0FF', knight: '#6A6A9A', golem: '#A8A090', imp: '#E8435A', hound: '#FF8A1A',
  gargoyle: '#8A8FA8', shade: '#9A6AFF', champion: '#C21E56' };
const foeColor = id => bossInfo(id)?.color || FOE_COLOR[id] || '#9486FF';
const KIND_KO = { normal: '', elite: tL('엘리트'), boss: tL('보스'), special: '' };
// 시공 광대의 스킬은 한 번 이기기 전까지 ??? (이긴 기록은 이 사람의 원정 기록 best.jester)
const jKnown = () => (Prog.progress()?.best?.jester || 0) > 0 || (R?.stats?.jester || 0) > 0;
const jMask = () => R?.C?.e?.id === 'jester' && !jKnown();
const hexKo = t => (jMask() ? '???' : Run.HEX[t].ko);
const hexDesc = (t, n) => (jMask() ? '???' : Run.HEX[t].desc(n));   // 시공 광대는 정체를 알리지 않는다 (이름도 ???)

// ── 시작 · 저장 ──────────────────────────────────────────────────────────────
// 원정 스타일(run.css)을 다 받은 뒤에 화면을 그린다 — 먼저 그리면 꾸밈 없는 화면이 잠깐 보인다 (최대 3초 기다림)
let cssReady = null;
export function init(ctx) {
  // 원정 파일끼리 버전이 섞였는지 (예전 rules.js + 새 ui.js) — 섞였으면 app.js 가 새로 받아 다시 연다
  if (typeof Run.replay !== 'function' || typeof Run.fixProgress !== 'function' || typeof Prog.progress !== 'function') throw new TypeError(TR('원정 파일 버전이 섞였어요'));
  X = ctx;
  Prog.initProgress(X.store);
  // 원정 안내: 원정을 한 번도 끝내지 않았을 때(또는 「안내 다시 보기」) · 시험 원정은 빼고
  initTour(X.store, () => X.screen() === 'run' && !R?.trial && ((Prog.progress().best?.runs || 0) === 0 || tourForced()));
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
export const syncAch = () => Prog.syncAch();
export const reloadProgress = () => { Prog.reload(); if (ui.view === 'select' && !R) paintSelect(); };
// 메인 메뉴 원정 카드 그림 (app.js runMenu): 1막 숲 배경 · 지도 칸 아이콘 (warm() 이 받아 둔다)
export const menuArt = () => ({ bg: actBgURL(1), nodes: ['node_fight', 'node_rest', 'node_boss'].map(uiArtURL) });
export const refreshSelect = () => { if (ui.view === 'select' && !R) paintSelect(); };
// 언어를 바꾼 뒤 지금 화면을 새 언어로 다시 그린다 (판 상태는 그대로)
export const renameHero = ren => { if (R?.name) { R.name = ren(R.name); save(); } };
export const redraw = () => { if (R) enterView(false); else if (ui.view === 'select') paintSelect(); };
// 원정 직업이 열렸나: 기본(전사 · 도적 · 마법사) · 도전과제(음유시인 · 수도승) · 보석으로 산 직업
const rollPips = (max, left) => { const n = Math.max(max, left); return n > 5 ? `<i class="on"></i><b>×${left}</b>` : [...Array(n)].map((_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join(''); };   // 굴리기 칩의 남은 굴림 (6개부터는 ×숫자)
function runOpen(id, b = best()) { return Run.runClassOpen(id, b.feats, X.ownsRun); }   // 서버 xStart 와 같은 규칙
// 잠긴 직업을 여는 방법 (한 줄)
function unlockHow(id) {
  const u = Run.RUN_UNLOCK[id];
  if (u?.feat) { const f = Run.FEATS.find(x => x.id === u.feat); return TR('{0} 도전과제 「{1}」: {2}', ico('trophy', 'xs'), f.ko, f.desc.replace(/ · .*$/, '')); }
  return TR('{0} 보석 {1}으로 해금', ico('gem', 'xs'), X.runPrice(id).toLocaleString());
}   // 원정 기록 → 도전과제 (테스트판)
export const savedRun = store => { const s = store.get(SAVE); return s && s.v === 1 && !s.ended ? s : null; };
function save() {
  if (!R) return;
  syncFeats();
  if (R.ended) X.store.del(SAVE); else X.store.set(SAVE, R);
}
// 기록 · 별조각은 progress.js 가 맡는다 (배포판은 서버 지갑, 테스트판은 이 기기). 화면은 읽기만 한다
function best() { const p = Prog.progress(); return { ...p.best, meta: { stars: p.stars, lv: p.lv } }; }
const mlv = (b, id) => b.meta.lv[id] || 0;
// 승천: 원정을 깬 단계 + 1 까지 고를 수 있다 (직업마다)
// 시험용: 이 직업은 승천을 처음부터 끝까지 열어 둔다 (테스트판만 — 배포판 빌드는 비운다)
const ASC_ALL_OPEN = new Set(/*TEST{*/['dancer']/*}TEST*/);
const ascOpen = (b, cls) => (ASC_ALL_OPEN.has(cls) ? Run.ASC_MAX : Math.min(Run.ASC_MAX, (b.asc[cls] ?? -1) + 1));
// 판 안에서 이룬 도전과제를 기록에 옮기고, 처음 이룬 것은 알린다
// (기록에 옮기는 것은 원정이 끝날 때 progress.js 가 한다. 여기서는 알리기만)
function syncFeats(extra = []) {
  const b = best();
  const fresh = [...new Set([...(R?.feats || []), ...extra])].filter(id => !b.feats.includes(id) && !ui.featShown.has(id));
  fresh.forEach((id, k) => {
    ui.featShown.add(id);
    const f = Run.FEATS.find(x => x.id === id);
    if (f) setTimeout(() => { sfx.legend?.(); X.toast(ico(f.icon), TR('원정 도전과제 · {0}', f.ko), f.desc, 2200); }, k * 900);
  });
}

// 길게 누른 원정 직업의 스킬 (app.js 가 data-rcls 를 길게 누르면 부른다)
export function classTip(id) {
  const ci = Run.RUN_CLASSES[id], c = classInfo(id);
  if (!ci) return '';
  return `<b style="color:${c.color}">${c.ko}</b> <small>${ico('heart', 'xs')}${ci.hp} · ${ico('flip', 'xs')}${ci.flip} · ${ico('nudge', 'xs')}${ci.nudge}</small><p><b>${ico('star', 'xs')} ${ci.skill}</b> ${esc(ci.desc)}</p>`;
}
export async function open() {
  warm();
  // 덱 더미 · 카드 그림이 다 받아진 뒤에 연다 (보통은 시작 화면에서 이미 받아 둠 — 아직이면 줄 앞으로 빼서 받고, 오래 걸리면 「불러오는 중」)
  await X.readyOrWait(fg(Promise.all(selectList().map(u => bgImage(u, 1, true)))));
  ui.view = 'select'; X.setScreen('run'); paintSelect();
  Prog.refresh().then(() => ui.view === 'select' && !R && !X.layer.innerHTML && paintSelect());   // 배포판: 서버 기록 새로 받기
}
export async function resume() {
  const s = savedRun(X.store);
  if (!s) return open();
  R = s; R.fx = [];
  R.relics = R.relics.filter(id => Run.relicInfo(id));   // 없앤 유물(에이스의 긍지 등)은 저장된 원정에서도 뺀다
  X.setScreen('run');
  await preloadRun();
  if (R === s) enterView(true);
}

// ── 로딩 화면 ────────────────────────────────────────────────────────────────
// 원정에 들어가기 전에 그림(적 · 배경 · 장면 · 아이콘 · 카드 틀 · 유물 · 보스) · 글꼴 · 원정 곡 · 이번 막 보스 곡을 다 받는다.
// 한 번 받으면 같은 화면에서는 다시 받지 않는다. 나머지 보스 곡은 지도에 들어간 뒤 뒤에서 받는다.
let loaded = false;
const ascURLs = () => [...Array(Run.ASC_MAX)].map((_, k) => `assets/run/ui/asc_${k + 1}.webp?v=${RUN_ART_VER}`);
// 미리 받기 (규칙: 그림 · 음악은 사람이 누르기 전에 이미 받아져 있어야 한다 — CLAUDE.md)
// 시작 화면에 원정 버튼이 보이면 app.js 가 부른다. 화면에 바로 쓰일 것(승천 문장 등)부터, 나머지는 천천히 뒤에서
// 직업 고르기 화면에 바로 보이는 그림 (모든 직업의 카드 뒷면 · 대표 카드 앞면 · 설명 아이콘) — 화면 글을 만들어 그 안의 주소를 모은다.
// 새로 설치한 기기에서 이것들이 뒤에 받아지면 덱 더미가 바탕색(예전엔 빨강)으로 비어 보였다
const selectURLs = () => {
  const html = Run.RUN_ORDER.map(id => `${classInfoHTML(id, best())}${cardFace(startDeck(id).at(-1))}url(${cardBackURL(id)})${hero(id)}`).join('') + `url(${cardBackURL()})`
    + runIco('ui', 'deck', 'card', 'xs') + runIco('node', 'shop', 'coins', 'xs') + starIco() + ico('trophy', 'xs') + ico('crown', 'xs') + ico('lock', 'xs');   // 화면 틀의 아이콘 (paintSelect)
  return [...new Set([...html.matchAll(/(?:src="|url\()([^")]+\.(?:webp|png)[^")]*)/g)].map(m => m[1].replace(/&amp;/g, '&')))];
};
let warming = null;
const selectList = () => [...ascURLs(), ...selectURLs()];
export function warm() {
  return (warming ||= (async () => {
    // 직업 고르기 화면 그림 먼저 — 뒤에서 받기 줄로 (예전엔 30여 장을 한꺼번에 받아 그동안 대전 고르기 화면이 느린 망에서 20초 넘게 밀렸다).
    // 받은 그림은 줄(bgload.js)이 붙잡아 두어 메모리 캐시에서 바로 그려진다
    await Promise.all(selectList().map(u => bgImage(u, 3)));
    const bosses = [...new Set(Object.values(Run.ACT_INFO).flatMap(a => a.boss))];
    // 뒤에서 받기 줄로 (bgload.js — 한 번에 2개, 다른 화면이 무언가를 받는 동안은 비켜 준다).
    // 예전엔 60여 장 · 곡 5개를 한꺼번에 받아 그동안 대전 · 보스전 시작이 느린 망에서 9초 넘게 밀렸다
    bg('font:Galmuri9', () => document.fonts?.load('12px Galmuri9'), 4);   // 글꼴은 CSS 의 글꼴로 받아야 다시 받지 않는다
    bgFile(BGM_FILES.run_map, 6, true);                                    // 원정을 열면 처음 트는 곡만 미리 (나머지 곡은 원정 안에서)
    await Promise.all([...runAssetURLs(bosses), ...relicURLs()].map(u => bgImage(u, 4)));
  })());
}
async function preloadRun() {
  const bosses = [...new Set(Object.values(Run.ACT_INFO).flatMap(a => a.boss))];
  if (loaded) { preloadBgm(bossSong(R.boss)); await fg(Promise.all([X.stageReady(), loadMotion([R.cls])])); return; }
  // 원정 그림은 전부 기다린다 (덜 받은 그림이 보이지 않게 — 대개 시작 화면에서 warm() 이 이미 받아 두어 금방 끝난다).
  // 곡은 처음 트는 지도 곡만 기다리고, 전투 · 엘리트 · 승리 · 패배 · 보스 곡은 원정에 들어간 뒤 뒤에서 받는다.
  // (예전엔 곡 6개 약 5MB 까지 다 받고 열어서 느린 망에서 원정 시작에 30초 가까이 걸렸다. 곡이 아직이면 앞 곡을 이어 틀다가 바꾼다 — audio.js)
  const imgs = [...runAssetURLs(bosses), ...relicURLs()];
  const total = imgs.length + 4;
  let done = 0;
  X.layer.innerHTML = '';
  X.app.innerHTML = `<div class="screen run-loading">
    <div class="rl-box"><div class="rl-walk"><i class="rl-mon goblin"></i><i class="rl-mon slime"></i><s class="rl-ground"></s></div><b>${TR('원정 준비 중…')}</b>
      <div class="rl-bar"><i id="rl-fill"></i></div><small id="rl-n">0%</small>
</div></div>`;
  const tick = () => { done++; const k = Math.round((done / total) * 100); const f = $('rl-fill'); if (f) f.style.width = `${k}%`; const n = $('rl-n'); if (n) n.textContent = `${k}%`; };
  const t0 = performance.now();
  await fg((async () => {
    // 그림은 6장씩 (뒤에서 받던 것은 줄에서 앞으로 빼 바로 받는다 · 이미 받은 것은 곧바로 끝)
    const jobs = imgs.map(u => () => bgImage(u, 3, true).then(tick));
    const pool = async () => { while (jobs.length) await jobs.shift()(); };
    await Promise.race([Promise.all([
      ...[...Array(6)].map(pool),
      bgFile(RUN_FONT, 3, false, true).then(tick),
      loadMotion([R.cls]).then(tick),
      preloadBgm('run_map').then(tick),
      X.stageReady().then(tick),          // 3D 트레이 · 주사위 · 트레이 그림
    ]), wait(60000)]);
  })());
  if (performance.now() - t0 < 500) await wait(500 - (performance.now() - t0));   // 너무 짧게 번쩍이지 않게
  loaded = true;
  // 나머지 곡은 뒤에서: 첫 전투 곡 먼저, 이번 막 보스 곡, 그다음 엘리트 · 승패, 다른 막 보스 곡
  bgFile(BGM_FILES.run_battle, 2);
  bgFile(BGM_FILES[bossSong(R.boss)], 3, true);
  for (const n of ['run_elite', 'run_win', 'run_lose']) bgFile(BGM_FILES[n], 4, true);
  bosses.map(bossSong).map(n => BGM_FILES[n]).filter(Boolean).forEach(u => bgFile(u, 7, true));
}

// R.phase 에 맞는 화면을 연다
function enterView(fresh = false) {
  ui.tool = null; ui.sel = null; ui.dealDie = null; ui.peek = false;
  setTimeout(() => { dangerCheck(); rageFlames(); }, 0);   // 전투 화면이 그려진 뒤 위기 · 분노 연출을 맞춘다 (전투를 떠나면 꺼진다)
  if (R.phase === 'combat') return showCombat(fresh);
  X.tray()?.setMarks?.(null);
  if (R.phase === 'won' || R.phase === 'lost') return showEnd();
  hand?.destroy(); hand = null;
  if (R.phase === 'map') return showMap();
  if (R.phase === 'reward') return showReward();
  if (R.phase === 'shop') return showShop();
  if (R.phase === 'rest') return showRest();
  if (R.phase === 'event') return showEvent();
}

// ── 직업 고르기 ──────────────────────────────────────────────────────────────
// 시작 덱 9장 (기본 8장 + 대표 카드). 화면 보기용 (u 는 음수)
// 시작 덱 미리보기 (마지막 장 = 대표 카드). 직업 특별 카드(sp)는 대표 카드 바로 앞
const startDeck = cls => { const ci = Run.RUN_CLASSES[cls]; return [...Run.BASE_DECK.map((cat, k) => ({ u: -1 - k, cat, up: 0, kw: null })), { u: -98, cat: ci.sp, up: 0, kw: null }, { u: -99, cat: ci.sig.cat, up: 0, kw: ci.sig.kw || null }]; };
// 상단 직업 설명 (모든 직업을 같은 칸에 겹쳐 두고 고른 직업만 보인다 → 칸 높이가 가장 긴 설명에 맞춰 고정)
function classInfoHTML(id, b) {
  const ci = Run.RUN_CLASSES[id], sig = startDeck(id).at(-1), kw = sig.kw ? Run.KEYWORDS[sig.kw] : null;
  const relic = mlv(b, 'relic') && Run.START_RELIC[id] ? Run.relicInfo(Run.START_RELIC[id]) : null;
  return `<div class="rs-stats"><span>${ico('heart', 'xs')}<b>${ci.hp}</b></span><span>${ico('flip', 'xs')}<b>${ci.flip}</b></span><span>${ico('nudge', 'xs')}<b>${ci.nudge}</b></span>${relic ? `<span>${relicIco(relic, 'xs')}${relic.ko}</span>` : ''}</div>
      <p class="rs-skill"><b>${ico('star', 'xs')} ${ci.skill}</b> ${esc(ci.desc)}</p>
      <p class="rs-sig"><b>${ico('card', 'xs')} ${Run.cardName(sig)}</b> ${Run.CAT_RULE[sig.cat]}${kw ? ` · ${runIco('kw', sig.kw, kw.icon, 'xs')}${kw.ko}: ${kw.desc}` : ''}</p>
      <p class="rs-sig"><b>${ico(Run.SPECIAL[ci.sp].icon, 'xs')} ${Run.cardTitle(ci.sp)} &lt;${Run.SPECIAL[ci.sp].ko}&gt;</b> ${Run.SPECIAL[ci.sp].desc}</p>`;
}
function paintSelect() {
  tour('select');
  const sel = ui.cls || X.store.get('diceheroes.runCls') || 'warrior';
  ui.cls = sel;
  const bb = best();
  ui.asc = Math.min(ascOpen(bb, sel), (X.store.get('diceheroes.runAsc') || {})[sel] ?? ascOpen(bb, sel));
  const info = classInfo(sel);
  const b = best();
  const ids = Run.RUN_ORDER, k = Math.max(0, ids.indexOf(sel));
  const at = d => ids[(k + d + ids.length * 2) % ids.length];
  const deck = startDeck(sel), sig = deck[deck.length - 1];
  const spin = ui.spin && Date.now() - ui.spin.t < 400 ? (ui.spin.d > 0 ? ' spin-r' : ' spin-l') : '';
  const slot = d => { const id = at(d), c = classInfo(id), owned = runOpen(id, bb);
    return `<button class="dial-hero d${d}${owned ? '' : ' locked'}" style="--c:${c.color}" data-act="${d ? 'run-cls' : 'run-talk'}" data-id="${id}" data-d="${d}" ${d ? '' : `data-rcls="${id}"`} aria-label="${c.ko}">${hero(id)}</button>`; };
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-select">
    <header class="rs-head">
      <button class="icon-btn" data-act="run-home" aria-label="${TR('뒤로')}">◀</button>
      <div><b>${TR('원정')}</b></div>
      <button class="pbtn small rs-feats" data-act="run-feats">${ico('trophy', 'xs')} ${b.feats.length}/${Run.FEATS.length}</button>
    </header>
    <section class="rs-info frame">${ids.map(id => `<div class="rs-info-in${id === sel ? ' on' : ''}" style="--c:${classInfo(id).color}" ${id === sel ? '' : 'aria-hidden="true"'}>${classInfoHTML(id, b)}</div>`).join('')}</section>
    <div class="rs-dial${spin}">
      <button class="dial-arrow" data-act="run-cls" data-id="${at(-1)}" data-d="-1" aria-label="${TR('이전 직업')}">◀</button>
      <div class="dial-track">${[-2, -1, 0, 1, 2].map(slot).join('')}</div>
      <button class="dial-arrow" data-act="run-cls" data-id="${at(1)}" data-d="1" aria-label="${TR('다음 직업')}">▶</button>
    </div>
    <b class="rs-name" style="--c:${info.color}">${[...info.ko].map((ch, i) => `<i class="rs-ch" style="--i:${i}">${ch}</i>`).join('')}${b.cls[sel]?.wins ? ` <i class="rs-won">${ico('crown', 'xs')}${b.cls[sel].wins}</i>` : ''}${runOpen(sel, bb) ? '' : ` ${ico('lock', 'xs')}`}</b>
    <div class="rs-pile" id="rs-pile" aria-label="${TR('시작 덱 {0}장', deck.length)}">
      ${deck.slice(0, -1).map((c, n) => `<i class="rs-back" style="--n:${n};background-image:url(${cardBackURL(sel)})"></i>`).join('')}
      <div class="rc rc-static rs-front">${cardFace(sig)}</div>
      <span class="rs-count">${runIco('ui', 'deck', 'card', 'xs')}${deck.length}</span>
    </div>
    <div class="rs-go">
      <button class="meta-btn market" data-act="run-meta"><i class="mk-awning" aria-hidden="true"></i><span class="mk-board">${TR('{0} 출정 채비', runIco('node', 'shop', 'coins', 'xs'))} <b>${starIco()}${b.meta.stars}</b></span></button>
      ${runOpen(sel, bb) ? `<button class="pbtn gold big" data-act="run-go">${TR('원정 떠나기')}${X.tixCost?.() || ''}</button>`
        : Run.RUN_UNLOCK[sel]?.feat ? `<p class="rs-lockhow">${unlockHow(sel)}</p>`
        : `<button class="pbtn gold big" data-act="run-unlock" data-id="${sel}">${TR('{0} {1}에 해금', ico('gem', 'xs'), X.runPrice(sel).toLocaleString())}</button>`}
      ${''/*TEST{*/ + (PROD ? '' : `<button class="pbtn small trial-btn" data-act="run-trial">${TR('시험 원정 · 특별 카드')}</button>`)/*}TEST*/}
    </div>
  </div>`;
  // 덱 더미를 길게 누르면 시작 덱 9장
  longPress($('rs-pile'), () => X.popover($('rs-pile'), `<b>${TR('{0} 시작 덱 {1}장', ico('card', 'xs'), deck.length)}</b><div class="deck-peek">${deck.map(c => `<div class="rc rc-static mini">${cardFace(c)}</div>`).join('')}</div>`, { afterRelease: true }));
}

// 승천: 직업 고르기 화면에는 버튼 하나. 누르면 승천 창에서 단계를 고른다 (이 직업으로 깬 단계 + 1 까지)
const ascEmblem = (n, cls = '') => (n ? runIco('asc', String(n), 'skull', cls) : runIco('ui', 'asc', 'skull', cls));
function showAsc() {
  const b = best(), open = ascOpen(b, ui.cls), a = ui.asc;
  const rows = Run.ASCENSION.slice(1).map((x, k) => {
    const n = k + 1, st = n <= a ? 'on' : n <= open ? 'can' : 'lock';
    return `<button class="asc-step ${st}${n === a ? ' cur' : ''}" data-act="run-ascset" data-v="${n}" ${st === 'lock' ? 'disabled' : ''} style="--i:${k}">
      <span class="as-emb">${st === 'lock' ? ico('lock', 'xs') : ascEmblem(n)}</span>
      <span class="as-n">${n}</span>
      <span class="as-txt"><b>${x.ko}</b><small>${x.desc}</small></span></button>`;
  }).reverse().join('');
  X.layer.innerHTML = `<div class="overlay run-ascbox" data-act="close-bg"><div class="deck-box" data-act="noop" style="--t:${a / Run.ASC_MAX}">
    <div class="asc-hero">
      <button class="icon-btn" data-act="run-asc" data-d="-1" ${a <= 0 ? 'disabled' : ''} aria-label="${TR('하드모드 낮추기')}">◀</button>
      <div class="ah-mid"><span class="ah-emb${a ? '' : ' off'}">${ascEmblem(a)}</span>
        <b>${a ? TR('하드모드 {0}', a) : TR('하드모드 0')}</b><small>${a ? TR('어려움 ×{0}', a) : ''}</small></div>
      <button class="icon-btn" data-act="run-asc" data-d="1" ${a >= open ? 'disabled' : ''} aria-label="${TR('하드모드 높이기')}">▶</button>
    </div>
    <div class="asc-ladder">${rows}</div>
    <p class="hint">${TR('{0}: 하드모드 {1}까지 열렸어요{2}', esc(classInfo(ui.cls).ko), open, open < Run.ASC_MAX ? ` ${TR('· 하드모드 {0}을 깨면 다음 단계가 열려요', open)}` : '')}</p>
    <div class="pick-actions"><button class="pbtn small" data-act="run-ascset" data-v="0">${TR('하드모드 끄기')}</button><button class="pbtn gold" data-act="run-start">${TR('{0}출발', a ? `${TR('{0} 하드모드 {1}로', ascEmblem(a, 'xs'), a)} ` : '')}</button></div>
  </div></div>`;
  const cur = X.layer.querySelector('.asc-step.cur'), lad = X.layer.querySelector('.asc-ladder');
  if (cur && lad) lad.scrollTop = cur.offsetTop - lad.offsetTop - lad.clientHeight / 2 + cur.offsetHeight / 2;   // 고른 단계가 가운데 오게
}
// 원정 준비: 별조각(✦)으로 영구 강화. 원정이 끝날 때마다 별조각을 얻는다
function showMeta() {
  const b = best(), m = b.meta;
  // 진열대: 물건(그림) · 이름표 · 단계 구슬 · 가격표. 누르면 설명 + 구매 / 취소 (원정 상점과 같은 손맛)
  const item = u => {
    const n = mlv(b, u.id), full = n >= u.max, cost = full ? 0 : u.cost[n];
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
    return `<button class="shelf-item meta-ware${full ? ' sold' : ''}" data-act="run-metaitem" data-id="${u.id}">
      <span class="si-ico">${runIco('meta', u.id, u.icon, 'lg')}</span>
      <span class="mw-name">${u.ko}</span><span class="mpips">${pips}</span>
      <em class="price${!full && m.stars < cost ? ' poor' : ''}">${full ? TR('완료') : `${starIco()}${cost}`}</em></button>`;
  };
  const shelf = list => `<div class="shelf"><div class="shelf-row">${list.map(item).join('')}</div><i class="shelf-plank" aria-hidden="true"></i></div>`;
  const rows = [];
  for (let k = 0; k < Run.META.length; k += 3) rows.push(Run.META.slice(k, k + 3));
  const inner = `
    <div class="meta-head market"><i class="mk-awning" aria-hidden="true"></i><img class="run-scene" src="${sceneURL('shop')}" alt=""><div class="mh-sign"><h2>${TR('출정 채비')}</h2><small>${TR('영구 강화 · 원정을 떠날 때마다 적용')}</small></div></div>
    <div class="meta-counter"><span class="star-wallet${ui.walletWas != null && ui.walletWas !== m.stars ? ' bump' : ''}">${starIco('')}<span><small>${TR('보유 별조각')}</small><b>${m.stars}</b></span></span></div>
    <div class="shop-stall meta-stall">${rows.map(shelf).join('')}</div>
    <div class="pick-actions"><button class="pbtn small" data-act="close">${TR('닫기')}</button></div>`;
  // 이미 열려 있으면(물건을 산 뒤) 창은 그대로 두고 안만 바꾼다 — 창을 지우고 다시 열면 깜빡였다
  const box = X.layer.querySelector('.run-meta .meta-store');
  if (box) box.innerHTML = inner;
  else X.layer.innerHTML = `<div class="overlay run-meta" data-act="close-bg"><div class="deck-box meta-store" data-act="noop">${inner}</div></div>`;
  ui.walletWas = m.stars;
}
// 출정 채비를 샀을 때: 산 물건이 화면 가운데에 크게 떠오르며 빛줄기 · 후광 · 불꽃 (주사위 · 트레이를 샀을 때와 같은 연출)
function metaReveal(id) {
  const u = Run.META.find(x => x.id === id);
  if (!u) return;
  const n = mlv(best(), id);
  bigReveal({ cls: 'k-meta', art: runIco('meta', u.id, u.icon, 'lg'), small: TR('출정 채비 {0}', n >= u.max ? TR('완성!') : TR('{0}단계!', n)), name: u.ko, sub: u.desc(n) });
}
// 획득 연출 (공용): 화면 가운데에 크게 떠오르며 빛줄기 · 후광 · 불꽃. 누르거나 3.6초 뒤 닫힌다
function bigReveal({ cls = '', art, small, name, sub = '', color = '#FFD24A' }) {
  document.querySelector('.unlock-fx')?.remove();
  const sparks = Array.from({ length: 18 }, (_, i) => `<i class="uf-sp" style="--a:${(i * 20 + Math.random() * 10).toFixed(0)}deg;--d:${(90 + Math.random() * 70).toFixed(0)}px;--s:${(3 + Math.random() * 4).toFixed(1)}px"></i>`).join('');
  const el = document.createElement('div');
  el.className = `unlock-fx is-skin run-get ${cls}`;
  el.style.setProperty('--c', color);
  el.innerHTML = `<div class="uf-stage"><div class="uf-rays"></div><div class="uf-glow"></div>
      <div class="uf-art uf-meta">${art}</div><div class="uf-flash"></div>${sparks}</div>
    <div class="uf-txt"><small>${small}</small><b>${esc(name)}</b>${sub ? `<span>${sub}</span>` : ''}</div>
    <p class="uf-tap">${TR('화면을 눌러 계속')}</p>`;
  document.body.appendChild(el);
  sfx.quest?.();
  const t0 = performance.now();
  const close = () => { if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.addEventListener('click', () => { if (performance.now() - t0 > 500) close(); });
  setTimeout(close, 3600);
}
// 출정 채비 물건을 누르면: 설명(지금 → 다음) + 구매 / 취소
function metaItemTip(el, id) {
  const b = best(), m = b.meta, u = Run.META.find(x => x.id === id);
  if (!u) return;
  const n = mlv(b, id), full = n >= u.max, cost = full ? 0 : u.cost[n];
  sfx.tap();
  X.popover(el, `<b>${runIco('meta', u.id, u.icon, 'xs')} ${u.ko}</b> <small>${TR('{0}/{1}단계', n, u.max)}</small>
    <p>${n ? u.desc(n) : TR('아직 없음')}${full ? '' : `<br>→ <em class="mint">${u.desc(n + 1)}</em>`}</p>
    ${full ? `<p class="dim">${TR('다 올렸어요')}</p>` : `<div class="buy-btns"><button class="hb" data-act="run-metaclose">${TR('취소')}</button><button class="hb gold" data-act="run-metabuy" data-id="${id}" ${m.stars < cost ? 'disabled' : ''}>${TR('{0}{1} 구매', starIco(), cost)}</button></div>`}`);
}
async function metaAct(act, id) {
  if (ui.metaBusy) return;
  ui.metaBusy = true;
  try {
    if (act === 'run-metabuy') await Prog.buy('meta', id);
  } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); }
  finally { ui.metaBusy = false; }
  sfx.forge?.();
  showMeta();                            // 창은 그대로 두고 안만 바꾼다 (깜빡이지 않게)
  // 뒤의 직업 고르기 화면: 별조각 수 · 직업 정보(체력 · 도구) · 시작 카드(연마)만 그 자리에서 바꾼다
  const b = best(), sel = ui.cls, mb = X.app.querySelector('[data-act=run-meta] .mk-board b');
  if (mb) mb.innerHTML = `${starIco()}${b.meta.stars}`;
  X.app.querySelectorAll('.rs-info-in').forEach((el, i) => { const cid = Run.RUN_ORDER[i]; if (cid) el.innerHTML = classInfoHTML(cid, b); });
  const front = X.app.querySelector('.rs-front'), dk = sel && startDeck(sel);
  if (front && dk) front.innerHTML = cardFace(dk[dk.length - 1]);
  if (act === 'run-metabuy') metaReveal(id);
}
function showFeats() {
  const b = best();
  X.layer.innerHTML = `<div class="overlay run-feats" data-act="close-bg"><div class="deck-box" data-act="noop">
    <h2>${TR('{0} 원정 도전과제 {1}/{2}', runIco('feat', 'clear', 'trophy'), b.feats.length, Run.FEATS.length)}</h2>
    <div class="feat-list">${Run.FEATS.map(f => { const ok = b.feats.includes(f.id); return `<div class="feat${ok ? ' ok' : ''}">${runIco('feat', f.id, ok ? f.icon : 'lock')}<span><b>${f.ko}</b><small>${f.desc}</small></span></div>`; }).join('')}</div>
    <div class="pick-actions"><button class="pbtn small" data-act="close">${TR('닫기')}</button></div>
  </div></div>`;
}

// ── 공용 HUD ─────────────────────────────────────────────────────────────────
const shownHp = () => (ui.show ? ui.show.hp : R.hp);
const shownBlk = () => (ui.show ? ui.show.blk : R.C?.block || 0);
function hud() {
  const C = R.C;
  const fl = Run.floorOf(R);
  return `${''/*TEST{*/ + (R.trial ? `<button class="sb-open" data-act="run-sb" aria-label="${TR('샌드박스')}">${TR('시험')}</button>` : '')/*}TEST*/}<header class="rhud">
    <button class="icon-btn" data-act="run-menu" aria-label="${TR('메뉴')}">☰</button>
    <div class="rh-act" ${X.tipAttr(TR('{0}막{1}', R.act, R.asc ? ` ${TR('· 하드모드 {0}', R.asc)}` : ''), TR('{0}층 + 보스 · 3막까지', Run.ROWS))}><small>${TR('{0}막{1}', R.act, R.asc ? ` ${TR('· 하드모드{0}', R.asc)}` : '')}</small><b>${fl > Run.ROWS ? TR('보스') : fl ? TR('{0}층', fl) : TR('출발')}</b></div>
    <div class="rh-res">
      ${R.phase === 'combat' ? '' : `<span class="res" ${X.tipAttr(TR('뒤집기'), '1↔6 · 2↔5 · 3↔4')}>${ico('flip', 'xs')}<b>${R.flip}</b></span>
      <span class="res" ${X.tipAttr(TR('조정'), TR('주사위 눈 ±1'))}>${ico('nudge', 'xs')}<b>${R.nudge}</b></span>`}
      ${R.cls === 'dancer' ? `<span class="res" ${X.tipAttr(TR('춤사위'), Run.RUN_CLASSES.dancer.desc)}>${ico('sparkle', 'xs')}<b>${R.dance}</b></span>` : ''}
    </div>
    <div class="potions pouch" aria-label="${TR('물약 주머니')}" style="background-image:url(${uiArtURL('pouch')})">${[0, 1, 2].map(k => { const id = R.potions[k]; const p = id && Run.potionInfo(id); return `<button class="pot${p ? '' : ' empty'}" data-act="run-pot" data-k="${k}" ${p ? `style="--pc:${p.color}"` : 'disabled'} aria-label="${p ? p.ko : TR('빈 칸')}">${p ? runIco('potion', p.id, p.icon) : ''}</button>`; }).join('')}</div>
    <button class="pile" data-act="run-deck" aria-label="${TR('덱 보기')}">${runIco('ui', 'deck', 'card', 'xs')}<b>${C && R.phase === 'combat' ? `${C.draw.length}·${C.discard.length}` : R.deck.length}</b></button>
  </header>`;
}
// 유물 대여 카드로 빌린 유물 (전투 중 · 손패에 있는 동안). 유물 줄은 한 줄만 보이므로 맨 앞에 둔다 (예전엔 끝에 붙어 유물이 많으면 가려졌다)
const rentRelics = () => (R.phase === 'combat' && R.C?.rent ? R.C.rent.filter(id => Run.relicInfo(id) && !R.relics.includes(id)) : []);
function heroStrip() {
  const info = classInfo(R.cls), ci = Run.RUN_CLASSES[R.cls];
  const hp = shownHp(), blk = R.phase === 'combat' ? shownBlk() : 0;
  const weak = R.C?.weak > 0 && R.phase === 'combat';
  return `<section class="rhero" id="rhero" style="--c:${info.color}">
    <div class="rh-por" id="rh-por" data-rcls="${R.cls}">${heroBust(R.cls)}</div>
    <div class="rh-main">
      <div class="rh-name"><b>${esc(R.name)}</b><button class="rh-skill" data-act="run-skill">${ico('star', 'xs')}${ci.skill}</button>${weak ? `<span class="st weak" ${X.tipAttr(TR('약화 {0}턴', R.C.weak), TR('카드 점수 ×0.75'))}>${TR('{0}약화 {1}', ico('snow', 'xs'), R.C.weak)}</span>` : ''}</div>
      <div class="hp rh-hp${hp / R.maxHp < 0.3 ? ' low' : ''}"><i style="width:${(hp / R.maxHp) * 100}%"></i><em>${hp} / ${R.maxHp}</em></div>
    </div>
    <div class="rh-side">
      <div class="rh-gold" id="r-gold" ${X.tipAttr(TR('골드'), TR('상점에서 써요'))}>${ico('coins', 'xs')}<b>${R.gold}</b></div>
      <div class="rh-blk${blk ? ' on' : ''}" id="rh-blk" ${X.tipAttr(TR('방어도 {0}', blk), TR('적의 공격을 먼저 막아요 · 내 턴이 시작되면 사라져요'))}>${ico('shield', 'xs')}<b>${blk}</b></div>
    </div>
    <div class="rh-relics">${[...rentRelics(), ...R.relics].map((id, k) => { const r = Run.relicInfo(id), rent = k < rentRelics().length; const pl = id === 'palette' ? Run.paletteLeft(R) : 0; return `<button class="relic r${r.r}${rent ? ' rent' : ''}${pl ? ' sealed' : ''}${!rent && relicWait.has(id) ? ' await' : ''}" data-act="run-relic" data-id="${id}" ${rent ? 'data-rent="1" ' : ''}aria-label="${r.ko}${rent ? ` ${TR('(대여)')}` : ''}">${relicIco(r)}${pl ? `<b class="relic-cnt">${pl}</b>` : ''}</button>`; }).join('') || `<span class="dim">${TR('유물 없음')}</span>`}</div>
  </section>`;
}

// ── 카드 그림 ────────────────────────────────────────────────────────────────
const PATTERN = { ones: [1, 1, 1], twos: [2, 2, 2], threes: [3, 3, 3], fours: [4, 4, 4], fives: [5, 5, 5], sixes: [6, 6, 6], four: [5, 5, 5, 5], full: [3, 3, 3, 5, 5], sstr: [1, 2, 3, 4], lstr: [1, 2, 3, 4, 5], yacht: [6, 6, 6, 6, 6] };
export function cardFace(c, { score = null, cls = '' } = {}) {
  // 시공 광대 「뒷면 카드」: 무슨 족보인지 · 점수 · 공격 · 수비 모두 ??? (정화 물약이면 보인다)
  if (R?.phase === 'combat' && (R.C?.hidden?.includes(c.u) || ui.hidTmp?.has(c.u)) && !R.C.pure) return `<div class="rc-in rc-hidden${cls}"><b class="rc-name">???</b><div class="rc-pat"><span class="rc-q">?</span></div><small class="rc-rule"></small><span class="rc-kw none"></span>${score != null ? '<em class="rc-pts wait">?</em>' : ''}<i class="rc-sheen"></i></div>`;
  if (Run.isFuture(c.cat)) return futureFace(c, score, cls);
  const r = Run.cardRarity(c);
  const ks = Run.kwsOf(c), kw = ks.length ? Run.KEYWORDS[ks[0]] : null;
  const pat = c.cat === 'choice' ? '<span class="rc-sum">∑</span>' : `<span class="mds">${PATTERN[c.cat].map(miniDie).join('')}</span>`;
  const sl = c.seal && Run.sealInfo(c.seal);
  return `<div class="rc-in r${r}${c.up ? ' up' : ''}${ks.length >= 3 ? ' k3' : ''}${c.temp ? ' temp' : ''}${c.jest ? ` jest j-${c.jest}` : ''}${cls}"${kw ? ` style="--kc:${kw.color}"` : ''}>${c.jest ? `<i class="rc-jest">${jMask() ? '???' : c.jest === 'bomb' ? TR('시한폭탄') : TR('광대 카드')}</i>` : ''}
    ${sl ? `<i class="rc-seal s-${c.seal}" style="--sc:${sl.color}${ui.stampHide.has(c.u) ? ';visibility:hidden' : ''}" title="${sl.ko}">${sealIco(c.seal)}</i>` : ''}${c.temp ? `<i class="rc-moon" title="${TR('달빛 복사본 · 한 번 쓰면 사라진다')}"></i>` : ''}
    <b class="rc-name">${c.up ? Run.cardTitle(c.cat).replace(/\S+$/, w => `<span class="nw">${w}<i class="rc-plus">+</i></span>`) : Run.cardTitle(c.cat)}${Run.isSpecial(c.cat) ? `<i class="rc-spec">${runIco('spec', c.cat, Run.SPECIAL[c.cat].icon, 'xs')}${Run.SPECIAL[c.cat].ko}</i>` : ''}</b>
    <div class="rc-pat">${pat}</div>
    <small class="rc-rule">${ruleOf(c)}</small>
    ${ks.length > 1 ? `<span class="rc-gems n${ks.length}">${Array.from({ length: Run.KW_MAX }, (_, i) => ks[i] ? `<i class="gem" style="--kc:${Run.KEYWORDS[ks[i]].color}" title="${Run.KEYWORDS[ks[i]].ko}">${runIco('kw', ks[i], Run.KEYWORDS[ks[i]].icon, 'xs')}</i>` : '<i class="gem empty"></i>').join('')}</span>`
      : kw ? `<span class="rc-kw">${runIco('kw', ks[0], kw.icon, 'xs')}${kw.ko}</span>` : '<span class="rc-kw none"></span>'}
    ${score === '?' ? '<em class="rc-pts wait">?</em>' : score != null ? `<em class="rc-pts">${score > 0 ? score : '·'}</em>` : ''}
    <i class="rc-sheen"></i>
  </div>`;
}
// 미래 카드: 홀로그램 테두리 · 무지개 결이 흐른다 (전설 카드와 다른 '미래' 느낌). 가운데 그림이 없으면 아이콘
function futureFace(c, score, cls) {
  const f = Run.FUTURE[c.cat], url = futureIconURL(c.cat), sl = c.seal && Run.sealInfo(c.seal);
  return `<div class="rc-in r4 future f-${c.cat}${cls}">
    ${sl ? `<i class="rc-seal s-${c.seal}" style="--sc:${sl.color}${ui.stampHide.has(c.u) ? ';visibility:hidden' : ''}" title="${sl.ko}">${sealIco(c.seal)}</i>` : ''}
    <i class="rc-holo" aria-hidden="true"></i><i class="rc-scan" aria-hidden="true"></i>
    <b class="rc-name">${f.ko}</b>
    <div class="rc-pat">${url ? `<img class="rc-fimg" src="${url}" alt="">` : `<span class="rc-fico">${ico(f.icon)}</span>`}</div>
    <small class="rc-rule">${Run.CAT_RULE[c.cat]}</small>
    <span class="rc-kw none"></span>
    ${score === '?' ? '<em class="rc-pts wait">?</em>' : score != null ? `<em class="rc-pts">${score > 0 ? score : '·'}</em>` : ''}
    <i class="rc-sheen"></i>
  </div>`;
}
// 인장 아이콘 (그림이 생기면 assets/run/ui/seal_<id>.webp — art.js UI.seal 에 id 를 적는다)
export const sealIco = (id, cls = 'xs') => dotIco('seal', id, runIco('seal', id, Run.sealInfo(id)?.icon || 'star', cls), cls);
const omenIco = (o, cls = '') => dotIco('omen', o.id, runIco('omen', o.id, o.icon, cls), cls);
// 길게 누르기: fn 을 부르고, 손을 뗄 때 생기는 click 은 버린다 (짧게 누르면 원래 동작)
function longPress(el, fn, ms = 450) {
  let t = null, fired = false, x0 = 0, y0 = 0;
  const stop = () => clearTimeout(t);
  el.addEventListener('pointerdown', e => { fired = false; x0 = e.clientX; y0 = e.clientY; stop(); t = setTimeout(() => { fired = true; buzz(15); sfx.tap(); fn(); }, ms); });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 12) stop(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(k => el.addEventListener(k, stop));
  el.addEventListener('click', e => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
// 카드 규칙 글 (주인공은 자란 만큼, 두배는 2 · 4 · 8 · 16 · 32)
const ruleOf = c => (c.cat === 'ones' && c.grow ? TR('1의 개수 + {0}', c.grow) : Run.CAT_RULE[c.cat]);
const cardTip = c => (R?.C?.hidden?.includes(c.u) && !R.C.pure ? '<b>???</b>' : Run.isFuture(c.cat) ? `<b class="fut-tip">${esc(Run.FUTURE[c.cat].ko)}</b><p>${Run.FUTURE[c.cat].desc}</p><p class="dim">${TR('강화할 수 없다 (인장은 붙는다)')}</p>${c.seal ? `<p>${sealIco(c.seal)} <b>${Run.sealInfo(c.seal).ko}</b> ${Run.sealInfo(c.seal).desc}</p>` : ''}${c.cat === 'xrent' && R?.C?.rentMap?.[c.u] ? `<p>${TR('빌린 유물: {0}', R.C.rentMap[c.u].map(id => esc(Run.relicInfo(id).ko)).join(' · '))}</p>` : ''}` : `<b>${esc(Run.cardName(c))}</b><p>${ruleOf(c)}${c.up ? ` ${TR('· 강화: 점수 +30%')}` : ''}</p>${c.jest ? `<p>${jMask() ? '???' : c.jest === 'bomb' ? TR('시한폭탄: 턴이 끝날 때 손패에 있으면 터진다. 내서 공격하면 피해 ×1.5') : TR('광대의 도전장: 이 카드를 내지 않으면 피해 절반. 내서 공격하면 피해 ×1.5')}</p>` : ''}${Run.isSpecial(c.cat) ? `<p>${runIco('spec', c.cat, Run.SPECIAL[c.cat].icon, 'xs')} <b>${Run.SPECIAL[c.cat].ko}</b> ${Run.SPECIAL[c.cat].desc}${c.cat === 'ones' && c.grow ? ` ${TR('(지금 +{0})', c.grow)}` : ''}</p>` : ''}${c.seal ? `<p>${sealIco(c.seal)} <b>${Run.sealInfo(c.seal).ko}</b> ${Run.sealInfo(c.seal).desc}</p>` : ''}${c.temp ? `<p><b>${TR('달빛 복사본')}</b> ${TR('한 번 쓰면 사라진다')}</p>` : ''}${Run.kwsOf(c).map(k => `<p>${runIco('kw', k, Run.KEYWORDS[k].icon, 'xs')} <b>${Run.KEYWORDS[k].ko}</b> ${Run.KEYWORDS[k].desc}</p>`).join('')}`);

// ── 지도 ─────────────────────────────────────────────────────────────────────
const MAP_ROW = 74, MAP_PAD = 46;
// 지도 · 이벤트 · 상점 · 휴식 · 전투 보상은 모두 지도 곡(run_map) — 같은 곡이면 playBgm 이 다시 틀지 않아 화면을 오가도 끊기지 않는다
function showMap(again = false) {
  playBgm('run_map');
  loadBossMotion(R.boss);   // 이번 막 보스의 모션 시트 (뒤에서 받기 줄) (막이 바뀌면 새 보스) — 보스 칸에 가기 전에 받아 둔다
  tour('map', 600);
  // 다음 화면 미리 준비: 지금 갈 수 있는 칸의 곡은 풀어 두고(전투 · 엘리트 · 보스), 나머지 곡은 파일만 받아 둔다
  // (풀어 둔 곡은 최근 3개만 메모리에 두므로 다 풀면 서로 밀어낸다). 트레이 · 주사위 그림도 함께
  const SONG = { fight: 'run_battle', elite: 'run_elite', boss: bossSong(R.boss) };
  const want = new Set(Run.nextNodes(R).map(id => SONG[Run.mapNode(R, id).type]).filter(Boolean));
  Object.values(SONG).forEach(s => (want.has(s) ? preloadBgm(s) : prefetchBgm(s)));
  if (want.size) X.stageReady();
  // 히든 보스가 끼어들 수 있는 원정이면 광대 곡 파일도 받아 둔다 (칸에 들어갈 때 홀로그램 연출 동안 풀린다)
  if (R.runNo >= Run.JESTER_FROM && R.act <= 2 && !R.jester?.met && !R.trial) prefetchBgm('boss_jester');
  const nodes = R.map.nodes;
  const next = new Set(Run.nextNodes(R));
  // 층 간격: 지도 칸 높이에 맞춰 한 화면에 다 보이게 (너무 좁으면 스크롤)
  const ROW = ui.mapRow || MAP_ROW;
  const H = MAP_PAD * 2 + Run.ROWS * ROW + 40;
  // 칸마다 아주 살짝 상하좌우로 흩뜨린다 (반듯한 바둑판이면 지루해서). 원정 · 막 · 칸이 같으면 늘 같은 자리. 보스는 가운데 그대로
  const jit = n => { if (n.row > Run.ROWS) return [0, 0]; const h = mapHash(R.seed, R.act, n.id); return [((h & 1023) / 1023 - 0.5) * 5.4, (((h >>> 10) & 1023) / 1023 - 0.5) * ROW * 0.26]; };
  const pos = n => { const [jx, jy] = jit(n); return { x: 12 + n.col * 25.3 + jx, y: (n.row > Run.ROWS ? MAP_PAD - 6 : H - MAP_PAD - (n.row - 1) * ROW) + jy }; };
  // 이번 막에 지나온 칸: R.path 는 막이 바뀌어도 이어 쌓이므로(1막 칸 번호가 2막 지도의 같은 번호 칸에 찍혔다)
  // 지금 칸에서 거꾸로, 지도의 길로 이어지는 데까지만 센다 (막 첫 칸 = 1층에서 끝)
  const visited = new Set();
  if (R.pos != null) {
    let cur = R.pos;
    for (let k = R.path.length - 1; k >= 0 && R.path[k] === cur; k--) {
      visited.add(cur);
      const prev = R.path[k - 1], pn = Run.mapNode(R, prev);
      if (k === 0 || Run.mapNode(R, cur)?.row <= 1 || !pn || !pn.next.includes(cur)) break;
      cur = prev;
    }
  }
  const edges = nodes.flatMap(n => n.next.map(j => {
    const walked = visited.has(n.id) && visited.has(j);
    const open = R.pos === n.id && next.has(j);
    return { a: pos(n), b: pos(nodes[j]), cls: walked ? 'walked' : open ? 'open' : '' };
  }));
  // 보스는 들어가기 전까지 ? (막마다 후보 중 하나가 정해져 있지만 보여 주지 않는다). 마지막 막(마왕)은 실루엣만
  const lastAct = R.act >= Run.ACTS;
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-map${ui.peek ? ' peek' : ''}">
    ${hud()}
    ${ui.peek ? `<button class="pbtn gold peek-back" data-act="run-peekback">${TR('{0} 이벤트로 돌아가기', ico('scroll', 'xs'))}</button>` : ''}
    <div class="map-head"><b>${TR('{0}막 · {1}', R.act, Run.ACT_INFO[R.act].ko)}</b>${R.omen ? omenChip() : ''}</div>
    <div class="map-scroll" id="map-scroll" style="background-image:linear-gradient(rgba(8,5,24,.25), rgba(8,5,24,.25)), url(${actBgURL(R.act)})"><div class="map" style="height:${H}px">
      <svg class="map-lines" aria-hidden="true"></svg>
      ${nodes.map(n => {
        const p = pos(n);
        const st = n.id === R.pos ? 'here' : next.has(n.id) ? 'can' : visited.has(n.id) ? 'done' : 'far';
        const boss = n.type === 'boss';
        return `<button class="mnode t-${n.type} ${st}" data-act="run-node" data-id="${n.id}" style="left:${p.x}%;top:${p.y}px" ${st === 'can' ? '' : 'tabindex="-1"'} aria-label="${Run.NODE[n.type].ko}">
          ${boss ? (lastAct ? `<img class="mboss shadow" src="${foeURL(R.boss)}" alt="">` : '<b class="mboss-q" aria-hidden="true">?</b>') : runIco('node', n.type, Run.NODE[n.type].icon)}
          ${n.id === R.pos ? `<span class="mhere">${hero(R.cls)}</span>` : ''}
          ${st === 'can' ? `<i class="mlabel">${Run.NODE[n.type].ko}</i>` : ''}
        </button>`;
      }).join('')}
    </div></div>
    ${heroStrip()}
  </div>`;
  // 지금 갈 수 있는 층이 보이게
  const sc = $('map-scroll');
  mapSteps = () => drawSteps(X.app.querySelector('.map-lines'), edges, H);
  mapSteps();
  if (sc && !again) {
    const fit = Math.max(52, Math.min(96, Math.floor((sc.clientHeight - 6 - MAP_PAD * 2 - 40) / Run.ROWS)));
    if (fit !== ROW) { ui.mapRow = fit; return showMap(true); }
  }
  const tgt = X.app.querySelector('.mnode.can') || X.app.querySelector('.mnode.here');
  if (sc && tgt) sc.scrollTop = Math.max(0, tgt.offsetTop - sc.clientHeight * 0.6);
  if (R.omenOpts) showOmens();
}
// 칸 흩뜨리기용 고정 난수 (같은 원정 · 막 · 칸이면 같은 값)
function mapHash(seed, act, id) {
  let h = (seed ^ Math.imul(act + 1, 0x9E3779B1) ^ Math.imul(id + 1, 0x85EBCA77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
  return (h ^ (h >>> 16)) >>> 0;
}
// 지도 길: 칸과 칸 사이를 발자국으로 잇는다. 가로는 % 라 지도 폭을 재서 px 로 바꿔 그린다 (늘이면 발자국이 찌그러짐)
const STEP = 12, NODE_GAP = 24;
const FOOT = '<symbol id="foot" viewBox="-4 -7 8 14" overflow="visible"><path d="M0-6.6C2.4-6.6 3.2-4.4 3-2.2 2.8.2 1.6 1.4 0 1.4S-2.6.4-2.8-1.8C-3-4.4-2.2-6.6 0-6.6Z"/><ellipse cx="0" cy="4.6" rx="2.1" ry="2"/></symbol>';
let mapSteps = null;
function drawSteps(svg, edges, H) {
  if (!svg?.isConnected) return;
  const W = svg.clientWidth || 300;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<defs>${FOOT}</defs>` + edges.map(({ a, b, cls }) => {
    const ax = a.x / 100 * W, bx = b.x / 100 * W, dx = bx - ax, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    const n = Math.max(1, Math.floor((len - NODE_GAP * 2) / STEP)), pad = (len - (n - 1) * STEP) / 2;
    let feet = '';
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1, d = pad + k * STEP;   // 왼발 · 오른발을 번갈아, 길 양옆으로 조금씩
      const x = ax + ux * d - uy * side * 3.5, y = a.y + uy * d + ux * side * 3.5;
      feet += `<use href="#foot" width="8" height="14" x="-4" y="-7" style="--k:${k}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(deg + side * 8).toFixed(1)})"/>`;
    }
    return `<g class="steps ${cls}">${feet}</g>`;
  }).join('');
}
addEventListener('resize', () => mapSteps?.());

// 막 징조: 이번 막 내내 깔리는 효과 (2장 중 1장)
const omenChip = () => { const o = Run.omenInfo(R.omen); return `<button class="omen-chip" data-act="run-omeninfo" aria-label="${o.ko}">${omenIco(o, 'xs')}<span>${o.ko}</span></button>`; };
function omenText(o) { return o.id === 'forbid' && R.omen === 'forbid' && R.omenCat ? TR('{0} — 금지: {1}', o.desc, Run.cardTitle(R.omenCat)) : o.desc; }
// 징조 창문 밖 하늘 (오늘의 날씨처럼) — [위, 아래]
const OMEN_SKY = {
  feast: ['#5A0A1E', '#E8435A'], bounty: ['#FFD27A', '#7ED957'], fog: ['#8A90A8', '#C8CCD8'], forbid: ['#1A0E3A', '#6A3A8A'], rush: ['#3A8AFF', '#BDEBFF'],
  merchant: ['#FFB35A', '#FFE9A8'], war: ['#3A1E1E', '#C2402E'], rift: ['#2A1E5A', '#B98CFF'], sealrain: ['#1E2A5A', '#7CB8FF'], drought: ['#C86A1E', '#FFD27A'],
  glass: ['#8FE3F0', '#E8FBFF'], regular: ['#4FB3FF', '#FFE9A8'], wish: ['#0E0A2C', '#4A3A9A'],
};
function showOmens() {
  sfx.legend?.();
  tour('omens');
  X.layer.innerHTML = `<div class="overlay run-omens" data-act="noop"><div class="pick-box">
    <h2>${TR('{0}막의 징조', R.act)}</h2>
    <div class="omen-picks">${R.omenOpts.map((id, k) => { const o = Run.omenInfo(id), art = omenWinURL(id), sky = OMEN_SKY[id] || OMEN_SKY.regular; return `<button class="omen-card window t${o.tier}" data-act="run-omen" data-k="${k}" style="--i:${k};--s1:${sky[0]};--s2:${sky[1]}">
      <span class="ow-win"><span class="ow-sky${art ? ' art' : ''}"${art ? ` style="background-image:url(${art})"` : ''}>${art ? '' : `<span class="om-ico">${omenIco(o, 'lg')}</span>`}</span><i class="ow-bars" aria-hidden="true"></i></span>
      <i class="ow-sill" aria-hidden="true"></i><b>${o.ko}</b><small>${o.desc}</small></button>`; }).join('')}</div>
  </div></div>`;
}

// ── 전투 화면 ────────────────────────────────────────────────────────────────
function showCombat(fresh) {
  const C = R.C;
  const kind = Run.ENEMIES[C.e.id].kind;
  playBgm(kind === 'boss' ? bossSong(C.e.id) : kind === 'special' ? 'boss_jester' : kind === 'elite' ? 'run_elite' : 'run_battle');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-combat" id="rc">
    <div id="r-hud">${hud()}</div>
    <section class="foe k-${kind}" id="foe"></section>
    <section class="table rtable">
      <div id="tray" class="tray"><div class="dice-ovl" id="dice-ovl"></div><div id="tray-btns"></div><p class="tray-loading">${TR('주사위 준비 중…')}</p></div>
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
    bet: u => R.C.bet === u, gazed: u => R.C.gazed.includes(u) && !R.C.pure && !ui.hideGaze,
    swappable: u => ui.tool === 'swap' && R.C.swaps > 0 && R.C.bet !== u && canAct(),
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
  if (fresh && C.turn === 1 && !C.rolled) introFoe().then(openingHex).then(() => tour('combat', 200));
  else if (ui.openFx) { ui.openFx = null; ui.hideGaze = false; }
  if (ui.stamps.length) stampHand();
}
const canAct = () => R?.phase === 'combat' && R.C?.phase === 'roll' && !ui.busy;
// 굴리는 동안(주사위가 다 멈추기 전)은 '?' — 점수는 주사위가 멈춘 뒤에 드러난다
const cardScore = c => (c.cat === 'xrent' && !Run.canPlayCard(R, c) ? null : ui.rolling || (R.C.hidden?.includes(c.u) && !R.C.pure) ? (R.C.rolled || ui.rolling ? '?' : null) : R.C.rolled ? (c.cat === 'xpar' ? Run.parallelSet(R, c.u).reduce((a, o) => a + o.s, 0) : Run.scoreCard(R, c).total) : null);

const shownHTML = new WeakMap();
const setHTML = (el, html) => { if (el && shownHTML.get(el) !== html) { el.innerHTML = html; shownHTML.set(el, html); } };
// 상태가 바뀌면 화면 숫자 · 버튼 · 카드 점수를 새로 그린다 (손패 위치는 Hand 가 맡는다)
function paint() {
  if (R?.phase !== 'combat' || !$('rc')) return;
  const C = R.C;
  // 바뀐 곳만 다시 그린다 (주사위를 잡을 때마다 적 · 영웅 그림을 새로 그리면 숨쉬기 · 움직임 연출이 처음부터 다시 돌았다)
  setHTML($('r-hud'), hud());
  setHTML($('foe'), foePanel());
  setHTML($('r-hero'), heroStrip());
  const rolled = C.rolled, my = canAct();
  const needBet = R.cls === 'gambler' && !rolled && C.bet == null && C.hand.length;
  const canRoll = my && C.rollsLeft > 0 && !needBet && !(rolled && C.held.every(h => h));
  const locked = Run.toolsLocked(R);
  $('rolls-left').innerHTML = [...Array(Run.maxRolls(R))].map((_, i) => `<i class="${i < C.rollsLeft ? 'on' : ''}"></i>`).join('');
  $('rctl').innerHTML = `
    <button class="pbtn gold roll chip${canRoll && !rolled ? ' next' : ''}" data-act="run-roll" style="--ph:-${(performance.now() / 1000).toFixed(3)}s" ${canRoll ? '' : 'disabled'}><span>${needBet ? TR('배팅 먼저') : rolled ? TR('다시 굴리기') : TR('굴리기')}</span><small class="left-n roll-pips${Math.max(Run.maxRolls(R), C.rollsLeft) >= 4 ? ' many' : ''}" role="img" aria-label="${TR('남은 {0}회', C.rollsLeft)}">${rollPips(Run.maxRolls(R), C.rollsLeft)}</small></button>
    <button class="pbtn tool${ui.tool === 'flip' ? ' on' : ''}" data-act="run-tool" data-tool="flip" ${my && rolled && R.flip > 0 && !locked ? '' : 'disabled'}>${ico('flip')}${ui.tool === 'flip' ? TR('사용 중') : TR('뒤집기')}<b>${R.flip}</b></button>
    <button class="pbtn tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="run-tool" data-tool="nudge" ${my && rolled && R.nudge > 0 && !locked ? '' : 'disabled'}>${ico('nudge')}${ui.tool === 'nudge' ? TR('사용 중') : TR('조정')}<b>${R.nudge}</b></button>
    <button class="pbtn tool swap${ui.tool === 'swap' ? ' on' : ''}" data-act="run-tool" data-tool="swap" ${my && C.swaps > 0 ? '' : 'disabled'}>${ico('swapcard')}${ui.tool === 'swap' ? TR('카드 고르기') : TR('교체')}<b>${C.swaps}</b></button>`;
  $('tray-btns').innerHTML = `${my && Run.canDance(R) ? `<button class="encore-btn dance-btn" data-act="run-dance">${TR('{0} 춤사위 ×{1}', ico('sparkle', 'xs'), R.dance)} <small>${TR('모든 주사위 +1')}</small></button>` : ''}${my && Run.canDeal(R) ? `<button class="encore-btn deal-btn${ui.tool === 'deal' ? ' on' : ''}" data-act="run-tool" data-tool="deal">${ico('card', 'xs')} ${ui.tool === 'deal' ? TR('취소') : TR('밑장빼기 {0}', R.C.deals)}</button>` : ''}${C.hex && !C.pure && !Run.omen(R, 'fog') ? `<button class="hex-badge" data-act="run-hex">${jMask() ? '' : runIco('hex', C.hex.t, Run.HEX[C.hex.t].icon, 'xs')} ${hexKo(C.hex.t)}</button>` : ''}`;
  $('rtip').innerHTML = tipText(needBet);
  hand?.refresh();
  // 도박사: 배팅할 때 손패가 반짝인다, 배팅한 카드는 금빛
  $('hand')?.classList.toggle('bet-pick', !!needBet && my);
  $('hand')?.querySelectorAll('.bet-on').forEach(e => e.classList.remove('bet-on'));
  if (C.bet != null) hand?.el(C.bet)?.classList.add('bet-on');
  if (ui.split && ui.sel === ui.split.u) syncSplit();
  paintTray();
  $('rc')?.classList.toggle('my-turn', my);
}
function tipText(needBet) {
  const C = R.C;
  if (ui.busy) return '';
  // 안내 문구는 두지 않는다 (화면만 봐도 알 수 있게). 도박사 배팅만 남긴다 (배팅해야 굴릴 수 있다)
  if (needBet) return TR('{0} 배팅 ×{1}', ico('coins', 'xs'), Run.CLASS_TUNE.betMul);
  // 광기의 저울: 이번 턴 저울이 기운 쪽을 늘 보여 준다 (카드를 고르기 전에 계획할 수 있게)
  if (Run.hasRelic(R, 'madscale') && C) { const t = Math.round(Run.madTilt(R) * 100); return `<b class="mad-tip">${TR('{0} 저울 {1}{2}% · {3}{4}%', ico('scale', 'xs'), ico('sword', 'xs'), t, ico('shield', 'xs'), 100 - t)}</b>`; }
  return '';
}

function foePanel() {
  const C = R.C, e = C.e, def = Run.ENEMIES[e.id];
  const hp = ui.show ? ui.show.ehp : e.hp, blk = ui.show ? ui.show.eblk : e.block;
  const fog = Run.omen(R, 'fog');
  const parts = ui.show?.hideIntent || fog ? [] : Run.intentParts(R);
  const st = [];
  if (e.str > 0) st.push(`<span class="st str">${TR('{0}힘 {1}', ico('up', 'xs'), e.str)}</span>`);
  if (e.weak > 0) st.push(`<span class="st weak">${TR('{0}약화', ico('snow', 'xs'))}</span>`);
  if (e.burn > 0) st.push(`<span class="st burn">${TR('{0}화상 {1}·{2}', ico('fire', 'xs'), e.burn, e.burnT)}</span>`);
  if (e.fury) st.push(`<span class="st fury">${TR('{0}격앙', ico('anger', 'xs'))}</span>`);
  if (e.raged) st.push(`<span class="rage-tag">${TR('분노')}</span>`);
  if (e.cut) st.push(`<span class="st heads">${TR('머리 {0}/3', ['fire', 'ice', 'poison'].filter(h => !e.cut[h]).length)}</span>`);
  const intent = parts.map(p => {
    if (p.k === 'atk') return `<span class="it atk${Run.hurtMul(R) > 1 ? ' boosted' : ''}">${ico('sword', 'xs')}<b>${p.n}${p.hits > 1 ? `×${p.hits}` : ''}</b>${Run.hurtMul(R) > 1 ? `<i class="it-mul">×${Run.hurtMul(R)}</i>` : ''}</span>`;
    if (p.k === 'block') return `<span class="it blk">${ico('shield', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'str') return `<span class="it str">${ico('up', 'xs')}<b>+${p.n}</b></span>`;
    if (p.k === 'heal') return `<span class="it heal">${ico('heart', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'steal') return `<span class="it steal">${ico('coins', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'weak') return `<span class="it weak">${ico('snow', 'xs')}<b>${p.n}</b></span>`;
    if (p.k === 'hex') return `<span class="it hex">${jMask() ? '' : runIco('hex', p.t, Run.HEX[p.t].icon, 'xs')}<b>${hexKo(p.t)}</b></span>`;
    return '';
  }).join('');
  return `
    <div class="foe-art${isPixelFoe(e.id) ? ' px' : ''}${facesLeft(e.id) ? ' face-l' : ''}${def.talk ? ' jester' : ''}${e.raged && e.hp > 0 ? ' raged' : ''}" id="foe-art" style="--c:${foeColor(e.id)}"><i class="aura"></i><img class="foe-img${bossBustURL(e.id) ? ' bust-b' : ''}${bossFlips(e.id) ? ' flip-x' : ''}" src="${def.talk ? jesterURL(ui.jmode || (e.raged ? 'rage' : '')) : bossBustURL(e.id) || foeURL(e.id)}" alt=""></div>
    <div class="foe-main">
      <div class="foe-name"><b>${def.talk ? '???' : esc(def.ko)}</b>${KIND_KO[def.kind] ? `<span class="kind-chip k-${def.kind}">${KIND_KO[def.kind]}</span>` : ''}</div>
      <div class="hp-row"><div class="hp foe-hp${e.raged ? ' rage' : ''}"><i style="width:${(hp / e.maxHp) * 100}%"></i>${blk ? `<s style="width:${Math.min(100, (blk / e.maxHp) * 100)}%"></s>` : ''}<em>${hp} / ${e.maxHp}</em></div><span class="foe-blk">${blk ? `<span class="shield-badge run-shield" title="${TR('보호막')}">${runIco('ui', 'shield', 'shield', 'xs')}<b>${blk}</b></span>` : ''}</span></div>
      <div class="foe-st">${st.join('')}</div>
    </div>
    ${intent ? `<button class="intent" id="intent" data-act="run-intent" aria-label="${TR('적의 다음 행동')}">${intent}</button>` : fog && !ui.show?.hideIntent ? `<div class="intent fog" aria-label="${TR('짙은 안개')}" ${X.tipAttr(TR('짙은 안개'), TR('적의 다음 행동이 안 보여요'))}>?</div>` : ''}`;
}

// (예전 특수 주사위 껍질 표시는 없앴다)
const diceMarks = () => null;
// 주사위 위 표시: 봉인 · 얼음 · 뒤집기 · 조정 · 밑장빼기
function paintTray() {
  const t = X.tray(), ovl = $('dice-ovl'), C = R?.C;
  if (!t || !ovl || !C || R.phase !== 'combat') return;
  t.setTarget?.(!!ui.tool && ui.tool !== 'swap' && canAct());
  const box = ovl.getBoundingClientRect();
  t.setFrozen?.(C.rolled && !ui.hideIce ? C.frozen : []);
  t.setMarks?.(diceMarks());
  t.setCustom?.([0, 1, 2, 3, 4, 5].map(i => R.dfaces?.[i] || null));   // 깎은 주사위는 3D 에도 새긴 눈이 보인다
  const sealList = ui.sealRoll || C.sealed || [];
  const seals = C.rolled ? sealList.map(i => { const p = t.topPos?.(i) || t.screenPos(i); return `<div class="seal-tag" style="left:${p.x - box.left}px;top:${p.y - box.top}px">${X.sealSigil || ico('chain')}</div>`; }).join('') : '';
  const sp = '';
  if (!ui.tool || ui.tool === 'swap' || !canAct() || !C.rolled || t.anim) { ovl.innerHTML = seals + sp; return; }
  ovl.innerHTML = seals + sp + C.dice.map((v, i) => {
    const p = t.screenPos(i);
    const x = p.x - box.left, y = p.y - box.top;
    if (Run.isSealed(R, i)) return '';
    if (ui.tool === 'deal') {
      if (ui.dealDie === i) return `<div class="deal-pick" style="left:${x}px;top:${y}px">${[1, 2, 3, 4, 5, 6].map(n => `<button data-act="run-deal" data-i="${i}" data-v="${n}" ${n === v ? 'disabled' : ''}>${miniDie(n)}</button>`).join('')}</div>`;
      return `<button class="flip-tag deal-tag" style="left:${x}px;top:${y}px" data-act="run-die" data-i="${i}"><i>${TR('바꾸기')}</i>${miniDie(v)}</button>`;
    }
    if (ui.tool === 'flip') return `<button class="flip-tag" style="left:${x}px;top:${y}px" data-act="run-die" data-i="${i}"><i>${TR('뒤집으면')}</i>${miniDie(7 - v)}</button>`;
    return `<div class="nudge-tag" style="left:${x}px;top:${y}px"><button data-act="run-nudge" data-i="${i}" data-d="1" ${v >= 6 ? 'disabled' : ''}>+1</button><button data-act="run-nudge" data-i="${i}" data-d="-1" ${v <= 1 ? 'disabled' : ''}>−1</button></div>`;
  }).join('');
}

// 카드에 손가락을 올렸을 때 공격 · 방어 미리보기 (길게 누르기)
function playTip(c) {
  if (!R.C.rolled) return '';
  if (R.C.hidden?.includes(c.u) && !R.C.pure) return `<p>${TR('{0} 공격 ??? &nbsp; {1} 수비 ???', ico('sword', 'xs'), ico('shield', 'xs'))}</p>`;
  if (c.cat === 'xpar') { const set = Run.parallelSet(R, c.u); return `<p>${TR('{0} 함께 낼 카드 {1}장 · 점수 합 {2}', ico('card', 'xs'), set.length, set.reduce((a, o) => a + o.s, 0))}</p>`; }
  const hi = R.C.hand.findIndex(x => x.u === c.u);
  const a = Run.preview(R, hi, 'enemy'), d = Run.preview(R, hi, 'self');
  if (Run.hasRelic(R, 'madscale') && !(Run.isTrinity(c) && !Run.prismOn(R, c))) {
    const t = Run.madTilt(R), m = Run.preview(R, hi, Math.round(Run.splitPool(R, c, Run.scoreCard(R, c).total) * t));
    return `<p>${TR('{0} 광기의 저울 · 공격 {1}% → 피해 {2} · 보호막 {3}', ico('scale', 'xs'), Math.round(t * 100), m.dmg, m.block)}</p>${scoreWhy(m)}`;
  }
  return `<p>${TR('{0} 전부 공격 {1}{2}{3} &nbsp; {4} 전부 방어 {5}', ico('sword', 'xs'), a.dmg, a.block ? ` ${TR('· 보호막 {0}', a.block)}` : '', a.heal ? ` ${TR('· 회복 {0}', a.heal)}` : '', ico('shield', 'xs'), d.block)}</p>${scoreWhy(a)}`;
}
// 점수 · 피해가 왜 그렇게 나오는지 (작은 글씨). 기본 점수에서 달라진 게 있을 때만
function scoreWhy(a) {
  const sc = a.sc, bits = sc.parts.map(p => `${esc(p.ko)} ${p.amt > 0 ? '+' : ''}${p.amt}${p.mul ? TR('(곱)') : ''}`);
  sc.notes.forEach(n => bits.push(esc(n)));
  const dmg = [];
  if (a.whet) dmg.push(TR('숫돌 +{0}', a.whet));
  if (a.arcane) dmg.push(TR('비전 지식 +{0}', a.arcane));
  if (a.kal) dmg.push(TR('만화경 +{0}', a.kal));
  if (a.bsword) dmg.push(TR('피에 굶주린 검 +{0}', a.bsword));
  if (a.combo) dmg.push(TR('연환 ×1.3'));
  if (a.horn) dmg.push(TR('사냥꾼의 뿔피리 ×1.25'));
  if (a.poison) dmg.push(TR('독 안개 ½'));
  if (!bits.length && !dmg.length) return '';
  return `<small class="sc-why">${TR('기본 {0}{1} → 점수 {2}{3}', sc.base, bits.length ? ` · ${bits.join(' · ')}` : '', sc.total, dmg.length ? `<br>${TR('피해: {0}', dmg.join(' · '))}` : '')}</small>`;
}

// ── 전투 조작 ────────────────────────────────────────────────────────────────
// 굴리기 전에 카드를 누르면: 안내 글 대신 굴리기 버튼이 톡 튀어 "여기부터" 를 알려 준다
function nudgeRoll() { const b = X.app.querySelector('[data-act=run-roll]'); b?.classList.remove('poke'); void b?.offsetWidth; b?.classList.add('poke'); }
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
  if (!Run.canPlayCard(R, C.hand[hi])) { sfx.tap(); return X.popover(hand.el(u), cardTip(C.hand[hi]) + `<p class="dim">${TR('손패에 들고 있는 카드예요 (낼 수 없어요)')}</p>`); }   // 유물 대여
  if (!C.rolled) { sfx.back(); nudgeRoll(); return; }   // 굴리기 전: 글자 대신 굴리기 버튼이 톡 튄다
  sfx.card();
  if (ui.sel === u && hand.sel === u) return closeSplit();
  openSplit(u);
}
// 배팅 묻기: 트럼프 카드 모양 (카드마다 무늬가 정해진다 — ♠ ♥ ♦ ♣)
const SUITS = [['♠', 'blk'], ['♥', 'red'], ['♦', 'red'], ['♣', 'blk']];
function betAsk(u) {
  const re = R.C.bet != null, [suit, tone] = SUITS[Math.abs(u) % 4];
  const corner = `<b>A</b><i>${suit}</i>`;
  return `<div class="bet-ask playing ${tone}">
    <span class="bc-corner tl">${corner}</span><span class="bc-corner br">${corner}</span>
    <div class="bc-mid"><i class="bc-suit">${suit}</i><b>${re ? TR('배팅 바꾸기') : TR('배팅')}</b><em>×${Run.CLASS_TUNE.betMul}</em></div>
    <div class="bet-btns"><button class="hb bc-no" data-act="run-betno">${TR('접기')}</button><button class="hb gold bc-go" data-act="run-bet" data-u="${u}">${TR('{0} 콜!', suit)}</button></div>
  </div>`;
}
function doBet(u) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0 || C.rolled) return;
  try { Run.placeBet(R, hi); } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); }
  drain();
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
// 트레이 <삼위일체>: 나눌 수 없어 막대 없이 공격 · 골드 · 방어를 보여 준다 (fixed).
// 프리즘이 있으면 점수 3배(S)를 공격(빨강) · 골드(노랑) · 방어(파랑)로 나눈다 (prism) — 골드 막대가 하나 더 생긴다.
function openSplit(u) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u), card = C.hand[hi];
  // 뒷면 카드 · 미래 카드: 나누기 막대 없이 버튼만 (뒷면은 숫자를 보여 주지 않는다)
  const hidden = C.hidden?.includes(u) && !C.pure;
  if (hidden || (Run.isFuture(card.cat) && card.cat !== 'xpar')) {      // 병렬 연산은 보통 카드처럼 막대로 나눈다
    ui.sel = u; ui.split = null;
    const go = (t, label, cls = '') => `<button class="pbtn sp-go${cls}" data-act="run-play" data-u="${u}" data-t="${t}">${label}</button>`;
    let body;
    if (hidden) body = `<div class="sp-row">${go('enemy', TR('{0} 공격 ???', ico('sword', 'xs')), ' gold')}${go('self', TR('{0} 수비 ???', ico('shield', 'xs')))}</div>`;
    else body = `<p class="sp-info">${esc(Run.FUTURE[card.cat].desc)}</p><div class="sp-row">${go('self', card.cat === 'xpause' ? TR('일시정지!') : TR('내기 (0점)'), ' gold')}</div>`;
    hand.select(u, `<div class="split simple fut" id="split">${body}</div>`, { wide: true });
    hand.el(u)?.classList.add('splitting');
    return;
  }
  const S = card.cat === 'xpar' ? Run.parallelScore(R, u) : Run.splitPool(R, card, Run.scoreCard(R, card).total);
  ui.sel = u;
  // 기본은 '딱 막기' (다음 공격을 다 막을 만큼만 방어 · 나머지 공격). 막을 공격이 없으면 전부 공격.
  // 짙은 안개: 적의 다음 행동을 모르므로 막대 위치로 새지 않게 처음엔 전부 방어
  const fog = Run.omen(R, 'fog');
  const fixed = Run.isTrinity(card) && !Run.prismOn(R, card), prism = Run.prismOn(R, card);
  ui.split = { u, S, atk: fog ? 0 : Run.incomingAfter(R) > 0 ? Run.coverAtk(R, hi).atk : S, gold: 0, fixed, prism };
  if (prism) {
    const sp = ui.split;
    if (fog) sp.atk = 0;
    else if (Run.incomingAfter(R) > 0) { const c = Run.coverAtk(R, hi); sp.atk = c.atk; sp.gold = c.gold; }
    else { sp.atk = Math.ceil(S / 3); sp.gold = Math.round(S / 3); }      // 막을 공격이 없으면 셋으로 나눈다
  }
  // 광기의 저울: 이번 턴 저울이 기운 비율로 막대가 고정된다 (턴이 시작될 때 정해져 미리 보인다 · 삼위일체는 원래 나누지 않으니 그대로)
  ui.split.lock = Run.hasRelic(R, 'madscale') && !fixed;
  if (ui.split.lock) { ui.split.atk = Math.round(S * Run.madTilt(R)); ui.split.gold = 0; }
  hand.select(u, fixed ? trinityHTML(u) : splitHTML(u, prism && !ui.split.lock), { wide: true });
  if (ui.split.lock) $('split')?.classList.add('locked');
  hand.el(u)?.classList.add('splitting');
  bindSplit();
  paintSplit();
  $('rtip').innerHTML = tipText(false);
  if (!fixed && !ui.split.lock) tour('split', 250);
}
// 카드를 고른 채(공격 · 방어 나누기 · 배팅 묻기) 카드와 그 위 창 바깥 아무 데나 누르면 고르기를 취소한다
document.addEventListener('pointerdown', e => {
  if (!X || X.screen() !== 'run' || R?.phase !== 'combat' || ui.sel == null || ui.busy) return;
  if (e.target.closest?.('.hand-btns, .rc, #layer .overlay, .popover, .run-tour')) return;
  sfx.back?.();
  closeSplit();
}, true);
function closeSplit() {
  ui.sel = null; ui.split = null;
  hand.select(null);
  if ($('rtip')) $('rtip').innerHTML = tipText(false);
}
// 점수가 바뀌었으면(물약 등) 비율을 지키며 다시 맞춘다
function syncSplit() {
  const sp = ui.split, C = R.C, c = C.hand.find(x => x.u === sp.u);
  if (!c) return closeSplit();
  const S = Run.splitPool(R, c, Run.scoreCard(R, c).total);
  if (S !== sp.S) { sp.atk = sp.S ? Math.round(sp.atk / sp.S * S) : S; sp.gold = sp.S ? Math.min(S - sp.atk, Math.round(sp.gold / sp.S * S)) : 0; sp.S = S; }
  paintSplit();
}
function trinityHTML(u) {
  return `<div class="split tri" id="split">
    <div class="sp-tri" aria-label="${TR('삼위일체: 모두 얻는다')}">
      <span class="sp-stat atk"><small>${TR('{0}피해', ico('sword', 'xs'))}</small><b id="sp-dmg"></b></span><i class="sp-plus">+</i>
      <span class="sp-stat gold"><small>${TR('{0}골드', ico('coins', 'xs'))}</small><b id="sp-gold"></b></span><i class="sp-plus">+</i>
      <span class="sp-stat def"><small>${TR('{0}보호막', ico('shield', 'xs'))}</small><b id="sp-blk"></b></span>
    </div>
    <p class="sp-info" id="sp-info"></p>
    <div class="sp-row one"><span class="sp-note">${TR('{0}삼위일체 · 모두 얻는다', ico('star', 'xs'))}</span><button class="pbtn gold sp-go" data-act="run-play" data-u="${u}">${TR('내기')}</button></div>
  </div>`;
}
function splitHTML(u, prism = false) {
  return `<div class="split${prism ? ' prism' : ''}" id="split">
    <div class="sp-top">
      <button class="sp-end atk" data-act="run-split" data-v="all" aria-label="${TR('전부 공격')}">${ico('sword', 'xs')}<b id="sp-dmg"></b><small>${TR('피해')}</small></button>
      <div class="sp-bar" id="sp-bar" role="slider" aria-label="${TR('공격 · 방어 나누기')}"><i class="sp-a" id="sp-a"></i>${prism ? '<i class="sp-g" id="sp-g"></i>' : ''}<span class="sp-knob" id="sp-knob">${runIco('ui', 'split_knob', 'sword')}<em id="sp-n"></em></span></div>
      <button class="sp-end def" data-act="run-split" data-v="none" aria-label="${TR('전부 방어')}">${ico('shield', 'xs')}<b id="sp-blk"></b><small>${TR('보호막')}</small></button>
    </div>
    ${prism ? `<div class="sp-gtop"><span class="sp-glab">${ico('coins', 'xs')}<b id="sp-gold"></b></span><div class="sp-bar sp-gbar" id="sp-gbar" role="slider" aria-label="${TR('골드 나누기')}"><i class="sp-gf" id="sp-gf"></i></div></div>` : ''}
    <p class="sp-info" id="sp-info"></p>
    <div class="sp-row">
      <button class="sp-step" data-act="run-split" data-v="-1" aria-label="${TR('공격 1 줄이기')}">◀</button>
      <button class="sp-cover" id="sp-cover" data-act="run-split" data-v="cover"></button>
      <button class="sp-step" data-act="run-split" data-v="1" aria-label="${TR('공격 1 늘리기')}">▶</button>
      <button class="pbtn gold sp-go" data-act="run-play" data-u="${u}">${TR('내기')}</button>
    </div>
  </div>`;
}
function bindSplit() {
  const drag = (bar, set) => {
    if (!bar) return;
    const at = e => { const r = bar.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ui.split.S); };
    bar.addEventListener('pointerdown', e => {
      if (!ui.split) return;
      e.preventDefault(); e.stopPropagation();
      bar.setPointerCapture?.(e.pointerId);
      bar.classList.add('drag');
      set(at(e));
    });
    bar.addEventListener('pointermove', e => { if (ui.split && bar.classList.contains('drag')) { e.preventDefault(); set(at(e)); } });
    const end = () => bar.classList.remove('drag');
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  };
  drag($('sp-bar'), setSplit);
  drag($('sp-gbar'), setGold);
}
// 프리즘: 골드 막대. 골드를 늘려 자리가 모자라면 공격이 줄어든다
function setGold(g) {
  const sp = ui.split;
  if (!sp?.prism) return;
  g = Math.max(0, Math.min(sp.S, Math.round(g)));
  if (g === sp.gold) return;
  sp.gold = g;
  sp.atk = Math.min(sp.atk, sp.S - g);
  sfx.tick?.(sp.S ? g / sp.S : 1);
  buzz(4);
  paintSplit();
}
function setSplit(a, gold = null) {
  const sp = ui.split;
  if (!sp || sp.fixed || sp.lock) return;
  a = Math.max(0, Math.min(sp.S, Math.round(a)));
  const g = sp.prism ? Math.max(0, Math.min(sp.S - a, gold ?? sp.gold)) : 0;
  if (a === sp.atk && g === sp.gold) return;
  sp.atk = a; sp.gold = g;
  sfx.tick?.(sp.S ? a / sp.S : 1);
  buzz(4);
  paintSplit();
}
function paintSplit() {
  const sp = ui.split, C = R.C;
  const hi = sp ? C.hand.findIndex(c => c.u === sp.u) : -1;
  if (hi < 0 || !$('split')) return;
  const p = Run.preview(R, hi, sp.atk, null, sp.gold), card = C.hand[hi];
  const k = p.pool ? p.atk / p.pool : 1;
  $('sp-dmg').textContent = p.dmg;
  $('sp-blk').textContent = p.block;
  if ($('sp-gold')) $('sp-gold').textContent = p.tri;
  if (sp.fixed) {
    const fog = Run.omen(R, 'fog'), taken = fog ? 0 : Run.takenAfter(R, p);
    const info = [];
    if (p.pierce) info.push(TR('{0}관통', ico('dagger', 'xs')));
    if (card.seal) info.unshift(`${sealIco(card.seal)}${Run.sealInfo(card.seal).ko}`);
    if (!fog && Run.incomingAfter(R, p.weak) > 0 && !p.kill && taken) info.push(`<em class="hurt">${ico('sword', 'xs')}-${taken}</em>`);
    $('sp-info').innerHTML = info.join('<i class="sep">·</i>') || '&nbsp;';
    return;
  }
  $('sp-a').style.width = `${k * 100}%`;
  $('sp-knob').style.left = `${k * 100}%`;
  $('sp-bar').style.setProperty('--k', k.toFixed(3));
  if (sp.prism) {
    const g = p.pool ? p.tri / p.pool : 0;
    $('sp-g').style.left = `${k * 100}%`; $('sp-g').style.width = `${g * 100}%`;
    $('sp-gf').style.width = `${g * 100}%`;
  }
  $('sp-n').textContent = sp.prism ? `${p.atk} : ${p.tri} : ${p.def}` : `${p.atk} : ${p.def}`;
  $('split').classList.toggle('all-atk', p.def === 0 && p.score > 0);
  $('split').classList.toggle('all-def', p.atk === 0);
  const fog = Run.omen(R, 'fog');   // 짙은 안개: 적의 공격으로 계산한 값(받을 피해 · 딱 막기)은 보여 주지 않는다
  const inc = fog ? 0 : Run.incomingAfter(R, p.weak), taken = fog ? 0 : Run.takenAfter(R, p);
  const info = [];
  if (p.atk > 0) {
    if (p.pierce) info.push(TR('{0}관통', ico('dagger', 'xs')));
    if (p.whet) info.push(TR('숫돌 +{0}', p.whet));
    if (p.arcane) info.push(TR('비전 +{0}', p.arcane));
    if (p.horn) info.push(TR('뿔피리 ×1.25'));
    if (p.poison) info.push(TR('독: 피해 ½'));
    if (p.heal) info.push(`${ico('heart', 'xs')}+${p.heal}`);
    if (p.gold - p.tri > 0) info.push(`${ico('coins', 'xs')}+${p.gold - p.tri}`);
    if (p.burn) info.push(TR('{0}화상 {1}', ico('fire', 'xs'), p.burn));
  }
  if (sp.lock) info.unshift(TR('{0}저울 고정 · 공격 {1}%', ico('scale', 'xs'), Math.round(Run.madTilt(R) * 100)));
  if (card.seal) info.unshift(`${sealIco(card.seal)}${Run.sealInfo(card.seal).ko}`);
  if (Run.hasKw(card, 'weak')) info.push(p.weak ? TR('{0}약화', ico('snow', 'xs')) : `<s>${TR('약화')}</s>`);
  if (p.def > 0 && p.defMul > 1) info.push(TR('{0}방어 +{1}%', ico('shield', 'xs'), Math.round((p.defMul - 1) * 100)));
  if (p.wblk) info.push(TR('불굴 +{0}', p.wblk));
  if (p.always) info.push(TR('보호막 +{0}', p.always));
  if (inc > 0 && !p.kill && taken) info.push(`<em class="hurt">${ico('sword', 'xs')}-${taken}</em>`);
  $('sp-info').innerHTML = info.join('<i class="sep">·</i>') || '&nbsp;';
  const cb = $('sp-cover');
  if (fog) { cb.disabled = true; cb.innerHTML = '?'; hand.el(sp.u)?.style.setProperty('--mix', k.toFixed(3)); return; }
  const cov = Run.coverAtk(R, hi);
  if (!inc) { cb.disabled = true; cb.innerHTML = TR('딱 막기'); }
  else { cb.disabled = false; cb.innerHTML = cov.full ? `${TR('딱 막기')}<small>${TR('방어 {0}', p.pool - cov.atk - cov.gold)}</small>` : TR('전부 방어'); }
  hand.el(sp.u)?.style.setProperty('--mix', k.toFixed(3));
}
function dropCard(u, target) {
  if (!canAct() || !R.C.rolled) return false;
  if (!Run.canPlayCard(R, R.C.hand.find(c => c.u === u))) return false;   // 유물 대여는 던져도 돌아온다
  doPlay(u, target);
  return true;
}

async function act(fn, { roll = false } = {}) {
  const before = snap();
  try { fn(); } catch (e) { X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1500); return null; }
  const list = drain();
  return { list, before };
}
function snap() { const C = R.C; return { hp: R.hp, blk: C?.block || 0, ehp: C?.e.hp || 0, eblk: C?.e.block || 0, gold: R.gold }; }

async function doRoll() {
  const C = R.C;
  const t = await X.ensureTray();
  if (!canAct()) return;
  ui.tool = null; ui.sel = null; ui.split = null; ui.dealDie = null;
  hand.select(null);
  const mask = Run.rollMask(R);
  ui.sealRoll = C.rolled ? C.sealed.slice() : [];
  t.restore?.();
  sfx.rollPress?.();
  const r = await act(() => Run.roll(R));
  if (!r) { ui.sealRoll = null; return; }
  const first = r.list.find(f => (f.type === 'hexDice' || f.type === 'lucky' || f.type === 'sdie') && f.from);
  ui.dice = first ? first.from.slice() : null;
  ui.hideIce = r.list.some(f => f.type === 'hexDice' && f.t === 'freeze');   // 얼음 창이 박히기 전에는 얼려 보이지 않는다
  ui.busy = true;
  ui.rolling = true;                    // 주사위가 다 멈출 때까지 카드 점수는 '?'
  paint();
  t.setSealed?.(ui.sealRoll);
  t.setMarks?.(diceMarks());
  // 식스 주사위(추가 달린 heavy): 처음 세게 떨어질 때 '쿵' + 먼지 (주사위마다 한 번)
  const thud = new Set();
  t.onMarkHit = (v, i) => {
    if (v < 5 || thud.has(i)) return;
    thud.add(i);
    sfx.drum?.();
    const p = t.screenPos(i);
    if (X.prefs.fx !== 'min') FX().burst(p.x, p.y + 14, { n: 14, pal: PALETTES.smoke, speed: [40, 120], life: [0.3, 0.6], grav: -40, dir: -Math.PI / 2, spread: Math.PI });
  };
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
  if (R.phase === 'combat' && C.rolled) tour('play', 250);
}

async function doPlay(u, target, gold = 0) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0) return;
  ui.sel = null; ui.split = null; ui.tool = null;
  const r = await act(() => Run.playCard(R, hi, target, gold));
  if (!r) { hand.select(null); hand.layout(); return; }
  ui.busy = true;
  // 시공 광대가 떠나면(진 경우) 곧바로 원래 칸으로 간다 — 그 뒤의 연출은 새 화면에서
  const k = r.list.findIndex(f => f.type === 'jesterOut');
  await playFx(k >= 0 ? r.list.slice(0, k + 1) : r.list, r.before);
  ui.busy = false;
  save();
  if (k >= 0 && R.phase !== 'reward') return enterAfterJester(r.list.slice(k + 1));
  afterAction();
}
// 광대전 뒤 원래 가려던 칸으로: 전투 칸이면 곡 · 트레이를 준비하고 등장 연출부터
function enterAfterJester(list = []) {
  const opening = list.filter(f => f.type === 'hex' || f.type === 'gaze');
  if (R.phase === 'combat') {
    if (opening.length) { ui.openFx = opening; ui.hideGaze = true; }
    const kind = Run.ENEMIES[R.C.e.id].kind;
    const song = kind === 'boss' ? bossSong(R.boss) : kind === 'elite' ? 'run_elite' : 'run_battle';
    return Promise.all([Promise.race([preloadBgm(song), wait(3000)]), X.stageReady()]).then(() => enterView(true));
  }
  return enterView();
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
// 인장이 터진다: 그 인장 색의 고리와 이름
function sealBurst(id, p) {
  const sl = Run.sealInfo(id);
  if (!sl || !p) return;
  if (X.prefs.fx !== 'min') { FX().ring(p.x, p.y, { color: sl.color, r0: 8, r1: 80, dur: 420, width: 7 }); FX().burst(p.x, p.y, { n: 26, pal: [sl.color, '#FFFFFF', '#FFF4D2'], speed: [80, 260] }); }
  sfx.quest?.();
  floatAt(p.x, p.y - 60, `${sealIco(id)}${sl.ko}${id === 'sun' ? ` ${TR('· 점수 ×1.5')}` : ''}`, id === 'cloud' ? 'sky' : 'gold');
}
// 동전 던지기 유물: 화면을 어둡게 하고 가운데에 큰 동전을 높이 튕겨 올려 빙글빙글 — 떨어져 앞면(금 · 왕관) / 뒷면(은 · 해골)
async function coinToss(side, h) {
  const head = side > 0, min = X.prefs.fx === 'min';
  const low = Math.round(Math.abs(Run.RELIC_TUNE.coinLow) * 100);
  const el = document.createElement('div');
  el.className = `coin-toss ${head ? 'head' : 'tail'}${min ? ' min' : ''}`;
  // 동전은 앞면(금 · 왕관) · 뒷면(은 · 해골) 두 면. 빙글빙글 돌며 두 면이 번갈아 보이다가 떨어진 면에서 멈춘다 (미리 알 수 없게)
  el.style.setProperty('--end', head ? '1800deg' : '1980deg');
  el.innerHTML = `<i class="ct-dim"></i><i class="ct-shadow"></i><div class="ct-coin"><div class="ct-spin">
      <i class="ct-side front"><b>${ico('crown')}</b></i><i class="ct-side back"><b>${ico('skull')}</b></i></div></div><p class="ct-text"></p>`;
  document.body.appendChild(el);
  sfx.whoosh?.();
  await wait(min ? 150 : 1150);
  if (head) sfx.coin(); else sfx.coinBad?.();   // 뒷면은 김빠지는 소리
  el.classList.add('landed');
  el.querySelector('.ct-text').innerHTML = head ? TR('앞면! 점수 +100%') : TR('뒷면… 점수 −{0}%', low);
  if (!min) {
    const r = el.querySelector('.ct-coin').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    FX().ring(x, y, { color: head ? '#FFC83D' : '#C9D3E8', r0: 20, r1: 120, dur: 420, width: 6 });
    if (head) FX().burst(x, y, { n: 30, pal: ['#FFC83D', '#FFF4C2', '#FFFFFF'], speed: [90, 280] });
  }
  await wait(min ? 300 : 750);
  el.classList.add('out');
  await wait(min ? 0 : 220);
  setTimeout(() => el.remove(), 300);
}
// 달빛 복사본이 사라진다: 초승달이 천천히 가라앉으며 빛이 꺼진다
function moonset(p) {
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'moonset';
  el.style.left = `${p.x}px`; el.style.top = `${p.y - 40}px`;
  el.innerHTML = '<i class="ms-moon"></i><i class="ms-glow"></i>';
  document.body.appendChild(el);
  sfx.unseal?.();
  setTimeout(() => el.remove(), 1500);
}
// 인장이 카드에 찍힌다: 큰 인장이 기울어진 채 위에서 내려와 카드 오른쪽 위 휘장 자리에 쾅 (고리 · 불꽃 · 카드가 움찔)
// 찍히기 전에는 카드의 휘장을 숨겨 둔다. 연출이 '최소'면 바로 붙인다
function stampSeal(cardEl, id, u) {
  const sl = Run.sealInfo(id), badge = cardEl?.querySelector('.rc-seal');
  if (!sl || !badge || X.prefs.fx === 'min') { ui.stampHide.delete(u); if (badge) badge.style.visibility = ''; return wait(0); }
  badge.style.visibility = 'hidden';
  // 인장은 카드 안에 붙여서 내려온다 (카드가 아직 날아오는 중이어도 같이 움직이게). 자리는 휘장의 카드 안 좌표
  // 카드 속이 키워져 있으면(zoom · 손패 1.25배) 인장도 같은 배율로 — 좌표는 그 배율 안의 값이라 그대로 쓴다
  const inEl = badge.offsetParent || cardEl;
  const z = inEl === cardEl ? 1 : parseFloat(getComputedStyle(inEl).zoom) || 1;
  const el = document.createElement('div');
  el.className = 'seal-stamp';
  el.style.cssText = `zoom:${z};left:${(inEl === cardEl ? 0 : inEl.offsetLeft / z + inEl.clientLeft) + badge.offsetLeft}px;top:${(inEl === cardEl ? 0 : inEl.offsetTop / z + inEl.clientTop) + badge.offsetTop}px;--sc:${sl.color}`;
  el.innerHTML = `<i class="ss-shadow"></i><i class="ss-disc">${sealIco(id, '')}</i>`;
  cardEl.appendChild(el);
  sfx.whoosh?.();
  return new Promise(res => {
    setTimeout(() => {                       // 쾅
      ui.stampHide.delete(u);
      badge.style.visibility = '';
      badge.classList.add('just');
      cardEl.classList.add('stamped');
      const b = badge.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
      FX().ring(x, y, { color: sl.color, r0: 6, r1: 46, dur: 360, width: 5 });
      FX().burst(x, y, { n: 14, pal: [sl.color, '#FFFFFF'], speed: [60, 170] });
      sfx.box?.(); sfx.quest?.();
      floatAt(Math.max(64, Math.min(innerWidth - 64, x)), y - 34, `${sealIco(id)}${sl.ko}`, id === 'cloud' || id === 'moon' ? 'sky' : 'gold');
      setTimeout(() => { el.remove(); badge.classList.remove('just'); cardEl.classList.remove('stamped'); }, 520);
      res();
    }, 380);
  });
}
// 손패에 새로 붙은 인장 (전투 시작: 인장 주머니 · 인장의 비): 손패를 다 나눠 준 뒤 한 장씩
async function stampHand() {
  const list = ui.stamps.splice(0).filter(f => R.C?.hand.some(c => c.u === f.u && c.seal === f.seal));
  if (!list.length || !hand) return;
  list.forEach(f => { ui.stampHide.add(f.u); const b = hand.el(f.u)?.querySelector('.rc-seal'); if (b) b.style.visibility = 'hidden'; });
  // 카드를 다 나눠 줄 때까지 (전투 시작 연출 뒤에 나눠 주기도 한다 — 최대 4초), 자리를 잡으면 찍는다
  for (let k = 0; k < 40 && !list.every(f => hand?.el(f.u)); k++) await wait(100);
  await wait(650);
  for (const f of list) {
    if (R?.phase !== 'combat') { ui.stampHide.clear(); return; }
    await stampSeal(hand.el(f.u), f.seal, f.u);
    await wait(240);
  }
}
// 지도 · 상점에서 인장이 붙을 때 (출발할 때 인장 상자 · 상점에서 붙이기): 가운데에 그 카드들을 띄우고 하나씩 찍는다
async function stampShow(cards, title) {
  if (!cards.length) return;
  const box = document.createElement('div');
  box.className = 'overlay stamp-show';
  box.dataset.act = 'noop';
  box.innerHTML = `<div class="stamp-box">${title ? `<b class="stamp-title">${title}</b>` : ''}<div class="stamp-cards">${cards.map(c => `<div class="stamp-card rc rc-static" data-u="${c.u}">${cardFace(c)}</div>`).join('')}</div></div>`;
  document.body.appendChild(box);
  cards.forEach(c => { const b = box.querySelector(`[data-u="${c.u}"] .rc-seal`); if (b) b.style.visibility = 'hidden'; });
  await wait(450);
  for (const c of cards) { await stampSeal(box.querySelector(`[data-u="${c.u}"]`), c.seal, null); await wait(260); }
  await wait(700);
  box.classList.add('out');
  await wait(260);
  box.remove();
}
// 규칙이 낸 연출 목록을 비운다. 인장이 붙은 것(sealOn)은 따로 모아 두었다가 그 카드가 보일 때 찍는다
function drain() {
  const list = Run.drainFx(R);
  ui.stamps.push(...list.filter(f => f.type === 'sealOn'));
  // 유물을 얻으면(보물상자 · 보상 · 상점 · 이벤트 …) 기운이 모여 터지는 연출로 받는다. 한꺼번에 여럿(시험 원정 시작 · 샌드박스)은 조용히
  const got = list.filter(f => f.type === 'relic' && Run.relicInfo(f.id));
  if (got.length && got.length < 3 && !X.layer.querySelector('.run-sb')) got.forEach(f => relicReveal(f.id));
  return list;
}
// 유물 받기: 화면이 어두워지고 기운이 가운데로 모였다가 '번쩍' — 희귀도 색 빛줄기 속에 유물이 떠오른다. 누르면 위 유물 칸으로 날아가 들어간다
//   일반 하늘색 · 희귀 보라 · 보스 금빛. 여러 개면 차례로. 연출 '최소' 는 짧게
const RELIC_GLOW = { 1: '#8FD3FF', 2: '#C08BFF', 3: '#FFD24A' };
let relicQ = Promise.resolve();
// 받는 중인 유물: 날아가서 칸에 닿기 전까지 위 유물 칸에서 감춰 둔다 (닿는 순간 뿅 나타난다)
const relicWait = new Set();
const relicLand = id => {
  relicWait.delete(id);
  const s = X.app.querySelector(`.rh-relics .relic.await[data-id="${id}"]`);
  if (s) { s.classList.remove('await'); s.classList.add('pop'); setTimeout(() => s.classList.remove('pop'), 500); }
};
export function relicReveal(id) {   // (디버그에서도 부른다)
  relicWait.add(id);
  X.app.querySelector(`.rh-relics .relic[data-id="${id}"]:not(.rent)`)?.classList.add('await');
  relicQ = relicQ.then(() => relicShow(id)).catch(e => console.warn('[relic]', e)).finally(() => relicWait.has(id) && relicLand(id));
  return relicQ;
}
function relicShow(id) {
  return new Promise(done => {
    const r = Run.relicInfo(id), c = RELIC_GLOW[r.r] || RELIC_GLOW[1], fxOn = X.prefs.fx !== 'min';
    const el = document.createElement('div');
    el.className = `relic-reveal r${r.r}${fxOn ? '' : ' quick'}`;
    el.style.setProperty('--rc', c);
    el.innerHTML = `<div class="rv-core"><i class="rv-rays" aria-hidden="true"></i><i class="rv-orb" aria-hidden="true"></i><span class="rv-art">${relicIco(r)}</span></div>
      <div class="rv-txt"><small>${[TR('유물 획득!'), TR('일반 유물'), TR('희귀 유물'), TR('보스 유물')][r.r] || TR('유물 획득!')}</small><b>${esc(r.ko)}</b><p>${esc(r.desc)}</p></div>
      <p class="rv-tap">${TR('눌러서 받기')}</p>`;
    document.body.appendChild(el);
    const cx = innerWidth / 2, cy = innerHeight * 0.42;
    if (fxOn) {
      // 1) 기운이 모인다: 큰 고리가 줄어들며 반짝이가 빨려 든다
      sfx.charge?.(1.6);
      for (let k = 0; k < 3; k++) setTimeout(() => FX().ring(cx, cy, { color: c, r0: 170 - k * 30, r1: 12, dur: 520, width: 5 }), k * 150);
      const pull = setInterval(() => { const a = Math.random() * 6.28, d = 140 + Math.random() * 60; FX().burst(cx + Math.cos(a) * d, cy + Math.sin(a) * d, { n: 3, pal: [c, '#FFFFFF'], speed: [10, 40], size: [2, 3], life: [0.25, 0.4], grav: 0 }); }, 60);
      // 2) 번쩍: 흰 빛 · 불꽃 · 화면 흔들림 · 팡파레
      setTimeout(() => {
        clearInterval(pull);
        el.classList.add('burst');
        FX().flash('#FFFFFF', 320, 0.55);
        FX().burst(cx, cy, { n: 90, pal: [c, '#FFFFFF', '#FFE27A'], speed: [160, 520], size: [3, 6], life: [0.5, 1.2], grav: 160 });
        FX().ring(cx, cy, { color: '#FFFFFF', r0: 20, r1: 220, dur: 600, width: 8 });
        shake($('rc') || X.app, r.r >= 3 ? 2 : 1.3);
        rumble(r.r >= 3 ? 12 : 8);
        sfx.legend?.(); if (r.r >= 2) setTimeout(() => sfx.powerUp?.(r.r >= 3 ? 2.6 : 1.8), 120);
      }, 760);
    } else { el.classList.add('burst'); sfx.legend?.(); }
    // 3) 누르면 받는다 (조금 뒤부터 — 실수로 바로 넘기지 않게). 4초 뒤엔 저절로
    const t0 = performance.now(), wait0 = fxOn ? 1300 : 300;
    const take = () => {
      if (el.classList.contains('out')) return;
      el.classList.add('out');
      const art = el.querySelector('.rv-art'), slot = X.app.querySelector(`.rh-relics .relic[data-id="${id}"]:not(.rent)`) || X.app.querySelector('.rh-relics .relic:last-child') || $('rhero');
      if (art && slot && fxOn) {
        const a = art.getBoundingClientRect(), b = slot.getBoundingClientRect();
        art.style.setProperty('--fx', `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
        art.style.setProperty('--fy', `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
        art.classList.add('fly');
        setTimeout(() => { FX().burst(b.left + b.width / 2, b.top + b.height / 2, { n: 24, pal: [c, '#FFFFFF'], speed: [60, 200], life: [0.25, 0.5] }); sfx.select?.(); relicLand(id); }, 450);
      } else relicLand(id);
      setTimeout(() => { el.remove(); done(); }, fxOn ? 520 : 200);
    };
    el.addEventListener('click', () => { if (performance.now() - t0 > wait0) take(); });
    setTimeout(take, wait0 + 4000);
  });
}

// 뽑을 더미가 비면: 버린 카드들이 모여 두 더미로 갈라졌다가 엇갈려 섞인다 (리플 셔플)
export async function shuffleFx() {   // (디버그에서도 부른다)
  const pile = X.app.querySelector('.pile');
  const r = pile?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'shuffle-fx';
  const back = `url(${cardBackURL(R?.cls)})`;   // 직업 색 뒷면
  el.style.left = `${innerWidth / 2}px`; el.style.top = `${innerHeight * 0.62}px`;
  el.innerHTML = Array.from({ length: 8 }, (_, k) => `<i class="sb" style="--k:${k};--s:${k % 2 ? 1 : -1};background-image:${back}"></i>`).join('');
  if (r) { el.style.setProperty('--tx', `${r.left + r.width / 2 - innerWidth / 2}px`); el.style.setProperty('--ty', `${r.top + r.height / 2 - innerHeight * 0.62}px`); }
  document.body.appendChild(el);
  for (let k = 0; k < 6; k++) setTimeout(() => sfx.card?.(), 260 + k * 70);
  pile?.classList.add('bump');
  await wait(1050);
  el.remove();
  pile?.classList.remove('bump');
}
// 떠오르는 글자. 숫자(피해 · 보호막 · 회복 +N)는 그 자리에서, 효과 이름 같은 글(약화 · 순례 · 보호막 파괴! …)은
// 화면 정가운데에 작게 차례로 쌓아 띄운다 (영웅 · 적 옆에 띄우면 화면 밖으로 잘렸다)
let noteN = 0, noteT = 0;
// 보스 · 적 방해(전쟁의 북 등) 이름: 트레이 위쪽 가운데에 크게 강조
function skillCall(html) {
  const r = $('tray')?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'skill-call';
  el.innerHTML = html;
  el.style.left = `${r ? r.left + r.width / 2 : innerWidth / 2}px`;
  el.style.top = `${r ? r.top + 22 : innerHeight * 0.35}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}
function floatAt(x, y, text, cls = '') {
  const words = /[^\d\s+\-−%×·.,/:()]/u.test(String(text).replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, '')) && !/\bdmg\b/.test(cls);   // 숫자만이 아닌 글자(어느 언어든)
  if (words) {
    const now = performance.now();
    if (now - noteT > 900) noteN = 0;
    noteT = now;
    x = innerWidth / 2; y = innerHeight * 0.42 + (noteN++ % 4) * 30;
    cls = `${cls.replace(/\b(big|huge)\b/g, '')} note`;
  }
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
// 무지개 팔레트: 아이콘 가운데 숫자를 하나 줄인다 (톡 튀며)
function paletteTick(left) {
  const btn = X.app.querySelector('.rh-relics .relic[data-id="palette"]');
  if (!btn) return;
  let n = btn.querySelector('.relic-cnt');
  if (!left) { n?.remove(); return; }
  if (!n) { n = document.createElement('b'); n.className = 'relic-cnt'; btn.appendChild(n); }
  n.textContent = left;
  n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick');
  sfx.tap?.();
}
// 무지개 팔레트 봉인 해제: 화면 가운데에 크게 「무지개 해금!」 (탭하거나 2.4초 뒤 닫힘)
function paletteUnlock() {
  const btn = X.app.querySelector('.rh-relics .relic[data-id="palette"]');
  btn?.classList.remove('sealed'); btn?.querySelector('.relic-cnt')?.remove();
  btn?.classList.add('unsealed');
  sfx.legend?.();
  X.bigHit?.(2);
  const el = document.createElement('div');
  el.className = 'pal-unlock';
  const sparks = Array.from({ length: 16 }, (_, i) => `<i class="pu-sp" style="--a:${i * 22.5}deg;--h:${i * 22.5}"></i>`).join('');
  el.innerHTML = `<div class="pu-stage"><i class="pu-rays"></i><i class="pu-ring"></i>${sparks}<span class="pu-art">${relicIco(Run.relicInfo('palette'), 'lg')}</span></div>
    <b class="pu-title">${TR('무지개 해금!')}</b><small class="pu-sub">${TR('이제 모든 카드 +50%')}</small>`;
  document.body.appendChild(el);
  if (X.prefs.fx !== 'min') { const r = el.querySelector('.pu-art').getBoundingClientRect(); FX().burst(r.x + r.width / 2, r.y + r.height / 2, { n: 60, pal: PALETTES.rainbow, speed: [120, 380], life: [0.4, 1], grav: 120 }); }
  return new Promise(res => {
    let t = 0;
    const close = () => { if (!el.isConnected) return; clearTimeout(t); el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 260); };
    t = setTimeout(close, 2400);
    el.addEventListener('click', close);
  });
}

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
  const tmp = document.createElement('div'), html = foePanel();
  tmp.innerHTML = html;
  shownHTML.set(foe, html);                 // 아래에서 바뀐 곳만 고친다 — paint 가 같은 내용을 다시 그리지 않게
  const bar = foe.querySelector('.foe-hp'), nb = tmp.querySelector('.foe-hp');
  if (!bar || !nb || !foe.querySelector('#foe-art')) { foe.innerHTML = html; return; }
  trailBar(bar, nb.querySelector('i').style.width);
  bar.classList.toggle('rage', nb.classList.contains('rage'));
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
  if (!bar) { setHTML($('r-hero'), heroStrip()); return; }
  const hp = shownHp(), blk = shownBlk();
  trailBar(bar, `${(hp / R.maxHp) * 100}%`);
  bar.classList.toggle('low', hp / R.maxHp < 0.3);
  bar.querySelector('em').textContent = `${hp} / ${R.maxHp}`;
  const b = $('rh-blk');
  if (b) { b.classList.toggle('on', blk > 0); b.querySelector('b').textContent = blk; }
  dangerCheck();
  const g = $('r-gold');
  if (g) g.querySelector('b').textContent = ui.show?.gold ?? R.gold;
  if ($('r-hero')) shownHTML.set($('r-hero'), heroStrip());
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
// 적 보호막이 다 깎였다: 보호막 칸의 방패가 두 쪽으로 쪼개져 튀고, 얼음 같은 파편 · 쨍 (보호막 칸이 지워지기 전에 자리를 잰다)
const shieldRect = () => document.querySelector('.foe-blk .shield-badge')?.getBoundingClientRect() || null;
function shieldBreak(r) {
  if (!r) return;
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  sfx.clang?.(1.3);
  floatAt(x, y - 22, TR('보호막 파괴!'), 'sky');
  if (X.prefs.fx === 'min') return;
  const el = document.createElement('div');
  el.className = 'shbreak';
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.innerHTML = '<i class="l"></i><i class="r"></i>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
  FX().ring(x, y, { color: '#8FD0FF', r1: 46, dur: 320, width: 4 });
  FX().burst(x, y, { n: 22, pal: PALETTES.frost, speed: [120, 300], size: [2, 4], life: [0.3, 0.6], grav: 420 });
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
  el.innerHTML = `<b>${TR('패기 발동')}</b><small>${TR('{0} 이번 턴 뒤집기 · 조정 금지', ico('eye'))}</small>`;
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
// 시공 광대의 표정: 비아냥 · 분노 그림으로 잠깐 바뀐다 (말은 하지 않는다)
// 홀로그램 일렁임: 화면 전체가 지지직 출렁였다가 돌아온다 (히든 보스에 들어갈 때 · 쓰러져 원래 세계로 돌아올 때)
// ── 위기: 체력 25% 미만이면 화면 가장자리가 붉게 맥박친다 (전투 중에만) ──
const inDanger = () => {
  if (!R || R.phase !== 'combat' || X.screen?.() !== 'run' || !$('rhero')) return false;
  const hp = ui.show ? shownHp() : R.hp;
  return hp > 0 && hp < R.maxHp * 0.25;
};
// 위기: 화면 가장자리가 붉게 맥박친다 (소리는 없다 — 심장 소리 · 배경음악 줄이기는 뺐다)
function dangerCheck() {
  document.body.classList.toggle('run-danger', inDanger());
}
// ── 보스 분노: 가운데서 붉은 파동이 퍼지며 화면이 일렁 → 그 뒤로 보스가 활활 타오른다 ──
function rageWave() {
  const app = $('app'), x = innerWidth / 2, y = innerHeight * 0.45, R1 = Math.hypot(innerWidth, innerHeight) * 0.62;
  // 빛나는 얇은 파동 두 겹 (효과 캔버스에 선 몇 개 — 화면 전체를 다시 그리지 않아 느려지지 않는다)
  if (X.prefs.fx !== 'min') { FX().wave(x, y, { r1: R1, dur: 820 }); setTimeout(() => FX().wave(x, y, { r1: R1, dur: 820, color: '#FF8A6A' }), 170); }
  app?.classList.add('rage-wobble');   // 가벼운 일렁임 (늘였다 줄였다만 · 색 필터 없음)
  setTimeout(() => app?.classList.remove('rage-wobble'), 720);
}
let flameT = null;
function rageFlames() {
  const on = () => R?.phase === 'combat' && R.C?.e?.raged && R.C.e.hp > 0 && $('foe-art') && X.prefs.fx !== 'min' && !X.prefs.lowGfx;
  $('foe-art')?.classList.toggle('raged', !!(R?.phase === 'combat' && R.C?.e?.raged && R.C.e.hp > 0));
  if (flameT || !on()) return;
  flameT = setInterval(() => {
    if (!on()) { clearInterval(flameT); flameT = null; $('foe-art')?.classList.remove('raged'); return; }
    const b = $('foe-art').getBoundingClientRect();
    FX().flames(b.left + b.width * (0.2 + Math.random() * 0.6), b.top + b.height * (0.55 + Math.random() * 0.4), { n: 2, size: [8, 15], life: [0.4, 0.75], vy: [-30, -70], alpha: 0.85 });
  }, 90);
}
function holoWarp(ms = 1300) {
  const el = document.createElement('div');
  el.className = 'holo-warp';
  el.style.setProperty('--d', `${ms}ms`);
  el.innerHTML = '<i class="hw-scan"></i><i class="hw-band"></i>';
  document.body.appendChild(el);
  const app = $('app');
  app?.style.setProperty('--d', `${ms}ms`);
  app?.classList.add('holo-wobble');
  sfx.whoosh?.();
  return wait(ms).then(() => { el.remove(); app?.classList.remove('holo-wobble'); });
}
// 광대 연출 글씨: 트레이 한가운데 크게 (회피 · 손패 섞기)
function jBanner(html, kind = '') {
  const r = $('tray')?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `jest-banner ${kind}`;
  el.innerHTML = html;
  el.style.left = `${r ? r.left + r.width / 2 : innerWidth / 2}px`;
  el.style.top = `${r ? r.top + r.height / 2 : innerHeight * 0.4}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
// 공격 · 방어 수치를 트레이 가운데에 크게 (원정 전투)
//   보통: 「⚔ 공격 23」 · 「🛡 방어 +12」 글자만 / 큰 것(적 최대 체력의 1/4 이상 피해 · 들어올 공격을 다 막음): 제목 + 큰 숫자 + 빛줄기 · 불꽃 · 번쩍임
function centerCall(kind, n, big = false, dy = 0, plus = kind === 'def') {
  const r = $('tray')?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2, y = (r ? r.top + r.height / 2 : innerHeight * 0.4) + dy;
  const atk = kind === 'atk', icon = ico(atk ? 'sword' : 'shield');
  const el = document.createElement('div');
  el.className = `center-call ${kind}${big ? ' big' : ''}`;
  el.innerHTML = big
    ? `<i class="cc-rays" aria-hidden="true"></i><b class="cc-label">${atk ? TR('거대 일격!') : TR('완벽 방어!')}</b><span class="cc-v">${icon}${plus ? `+${n}` : n}</span>`
    : `<span class="cc-v">${icon}${atk ? TR('공격 {0}', n) : TR('방어 {0}', `+${n}`)}</span>`;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  document.body.appendChild(el);
  if (big && X.prefs.fx !== 'min') {
    const pal = atk ? PALETTES.rainbow : PALETTES.frost;
    FX().flash(atk ? '#FFB13A' : '#7CC8FF', 360, 0.32);
    FX().burst(x, y, { n: 70, pal, speed: [160, 460], size: [3, 6], life: [0.45, 1.0], grav: 220 });
    FX().ring(x, y, { color: atk ? '#FFD24A' : '#BFE6FF', r0: 20, r1: 150, dur: 520, width: 8 });
    shake($('rc'), 1.6);
    if (atk) sfx.legend?.(); else sfx.clang?.(1);
  }
  setTimeout(() => el.remove(), big ? 1700 : 1000);
}
async function jSay(_text, mode = 'taunt', ms = 1600) {
  ui.jmode = mode;
  const img = $('foe-art')?.querySelector('.foe-img');
  if (img) img.src = jesterURL(mode || (R.C?.e?.raged ? 'rage' : ''));
  const mine = ui.jsayN = (ui.jsayN || 0) + 1;
  setTimeout(() => {
    if (ui.jsayN !== mine) return;
    ui.jmode = null;
    const im = $('foe-art')?.querySelector('.foe-img');
    if (im && R?.C?.e) im.src = jesterURL(R.C.e.raged ? 'rage' : '');
  }, ms);
  await wait(Math.min(500, ms));
}
async function playFx(list, before) {
  ui.show = { ...before };
  // 응시가 있으면 눈이 떠서 시선이 닿기 전까지 카드에 응시를 보이지 않는다 (새 손패를 그릴 때도)
  if (list.some(f => f.type === 'gaze')) ui.hideGaze = true;
  for (const f of list) {
    try { await playOne(f); } catch (err) { console.warn('[run fx]', f.type, err); X.tray()?.restore?.(); }
  }
  ui.show = null;
  ui.hideGaze = false;
}
// 엘리트: 덤빌 때 · 맞을 때 잠깐 공격 · 피격 자세 그림으로 바꿨다가 되돌린다
function foePose(pose, ms) {
  const id = R?.C?.e?.id, url = id && foePoseURL(id, pose), img = $('foe-art')?.querySelector('.foe-img');
  if (!url || !img) return;
  const base = foeURL(id);
  img.src = url;
  clearTimeout(img.__pose); img.__pose = setTimeout(() => { if (img.isConnected && R?.C?.e?.id === id) img.src = base; }, ms / (FX().speed || 1));
}
const HEX_FX = { burn: 'fire', freeze: 'snow', seal: 'chain', twist: 'vortex', reverse: 'vortex', drums: 'drum', gaze: 'eye', haki: 'anger', poison: 'toxic' };
async function playOne(f) {
  const t = X.tray();
  const fxOn = X.prefs.fx !== 'min';
  switch (f.type) {
    case 'play': {
      let e = foeAt();
      const h = heroAt();
      // 보스를 칠 때는 왼쪽에 보스 전신이 크게 나와 맞는다 (영웅은 오른쪽)
      const ba = f.target === 'enemy' && !f.dodge && bossBustURL(R.C?.e?.id) && X.actor?.ok() ? X.actor.boss(R.C.e.id, foeColor(R.C.e.id)) : null;
      if (ba) e = X.actor.center(ba);
      const tgt = f.target === 'enemy' ? e : h;
      if (f.coin) await coinToss(f.coin, h);          // 동전 던지기: 앞면 +100% · 뒷면 −25% (공격 · 방어 모두)
      // 시공 광대가 피하는 카드: 카드가 닿기 직전에 몸을 빼고, 닿는 순간 '회피!' (맞는 연출 없이)
      if (f.dodge) setTimeout(() => { const a = $('foe-art'); a?.classList.remove('dodge'); void a?.offsetWidth; a?.classList.add('dodge'); sfx.whoosh?.(); }, 150);
      // 공격 카드: 주사위판 오른쪽 아래에 영웅이 크게 나와 직업 동작으로 친다 (칼 · 주문 · 총 …). 동작이 닿는 순간 카드가 날아간다
      const act = f.target === 'enemy' && X.actor?.ok() ? X.actor.in(R.cls, e) : null;
      let swing = null;
      if (act) { await wait(200); swing = X.actor.pose(act, 'attack', 640); await wait(140 / (FX().speed || 1)); }
      await hand.launch(f.u, tgt, f.target);           // 카드가 날아가 꽂힌다
      if (f.target === 'enemy' && f.dodge) {
        jBanner(TR('회피!'), 'dodge');
        if (fxOn) FX().burst(e.x + 20, e.y, { n: 18, pal: ['#3EE6E0', '#FF4FD8', '#FFFFFF'], speed: [80, 240], life: [0.2, 0.5] });
        sfx.zero?.();
      } else if (f.target === 'enemy') {
        const pal = f.score >= 40 ? PALETTES.rainbow : f.score >= 28 ? PALETTES.arcane : f.score >= 18 ? PALETTES.gold : PALETTES.fire;
        const power = f.score >= 40 ? 3 : f.score >= 28 ? 2.2 : f.score >= 18 ? 1.6 : 1.1;
        if ((f.hit ?? f.dmg) > 0 || f.blocked > 0) {
          if (fxOn) FX().impact(e.x, e.y, pal, power);
          if (power >= 3 || f.cat === 'yacht') X.bigHit?.(3);        // 큰 한 방: 히트스톱 · 화면 당김 · 가장자리 어둡게
          sfx.strike?.(power);
          if (power >= 2) sfx.boom?.(power / 2); else sfx.slash?.();
          rumble(Math.min(10, 3 + power * 2));
          const art = $('foe-art');
          art?.classList.remove('hit'); void art?.offsetWidth; art?.classList.add('hit');
          foePose('hurt', 450);
          if (ba) X.actor.hurt(ba, 460);
          shake($('rc'), power * 0.8);
          const sr = ui.show.eblk > 0 && ui.show.eblk - f.blocked <= 0 ? shieldRect() : null;
          setShow({ ehp: Math.max(0, ui.show.ehp - f.dmg), eblk: Math.max(0, ui.show.eblk - f.blocked) });
          repaintBars();
          shieldBreak(sr);
          if (f.blocked) floatAt(e.x + 30, e.y - 20, `${ico('shield', 'xs')}${f.blocked}`, 'dim');
          const shown = f.hit ?? f.dmg;   // 넘친 피해도 그대로 보여 준다 (체력은 0까지만)
          floatAt(e.x, e.y - 10, `${shown}`, `dmg big${power >= 2 ? ' huge' : ''}`);
          if (shown > 0) centerCall('atk', shown, shown * 4 >= (R.C?.e?.maxHp || Infinity));
          if (f.behead) { await wait(250); floatAt(e.x, e.y + 30, TR('머리 베기!'), 'gold'); sfx.slash?.(); if (fxOn) FX().slash?.(e, 140); }
        } else {
          floatAt(e.x, e.y - 10, '0', 'dim');
          sfx.zero();
        }
      }
      if (f.block) {
        if (f.target === 'enemy' && fxOn) FX().ring(h.x, h.y, { color: '#7CC8FF', r0: 10, r1: 60, dur: 360, width: 6 });   // 나눠 낸 방어 몫
        if (fxOn) FX().shield(h);
        sfx.hold();
        // 방어: 카드를 낼 때는 늘 보통 크기 ('완벽 방어' 는 적이 공격했는데 실제로 다 막았을 때만 — 아래 'enemy')
        //   같은 카드로 공격도 했으면 공격 글자와 겹치지 않게 조금 뒤 · 아래에
        const call = () => centerCall('def', f.block, false, f.target === 'enemy' && f.dmg > 0 ? 70 : 0);
        if (f.target === 'enemy' && f.dmg > 0) setTimeout(call, 250); else call();
        setShow({ blk: ui.show.blk + f.block });
        updHero();
        popBlk();
        floatAt(h.x, h.y - 30, `${ico('shield', 'xs')}+${f.block}`, 'sky');
      }
      if (f.heal) { setShow({ hp: ui.show.hp + f.heal }); repaintBars(); floatAt(h.x, h.y - 50, `+${f.heal}`, 'mint'); if (fxOn) FX().burst(h.x, h.y, { n: 16, pal: PALETTES.heal, grav: -60 }); }
      if (f.gold) { floatAt(h.x + 40, h.y - 40, `${ico('coins', 'xs')}+${f.gold}`, 'gold'); sfx.coin(); }
      if (f.burn) floatAt(e.x, e.y + 26, TR('{0}화상 {1}', ico('fire', 'xs'), f.burn), 'gold');
      if (f.weak) floatAt(e.x, e.y + 26, TR('{0}약화', ico('snow', 'xs')), 'sky');
      if (f.flip) floatAt(h.x, h.y - 70, `${ico('flip', 'xs')}+1`, 'mint');
      if (f.dance) floatAt(h.x, h.y - 70, TR('{0}춤사위 +1', ico('sparkle', 'xs')), 'gold');
      if (f.nudge) floatAt(h.x + 30, h.y - 70, `${ico('nudge', 'xs')}+${f.nudge}`, 'mint');
      if (f.flip) floatAt(h.x - 30, h.y - 70, `${ico('flip', 'xs')}+${f.flip}`, 'mint');
      if (f.sealUsed) sealBurst(f.sealUsed, f.target === 'enemy' ? e : h);
      if (f.moon) floatAt(h.x, h.y - 100, TR('달빛 복사본 +{0}', f.moon), 'sky');
      if (f.grow) floatAt(h.x - 30, h.y - 90, TR('{0}주인공 기본 점수 +{1}', ico('crown', 'xs'), f.grow), 'gold');
      if (f.pilgrim) floatAt(h.x + 20, h.y - 110, TR('{0}순례 · 골드 +15 · 최대 체력 +2', ico('scroll', 'xs')), 'gold');
      if (f.paletteLeft != null) paletteTick(f.paletteLeft);
      if (f.palette) await paletteUnlock();
      if (f.temp) moonset(f.target === 'enemy' ? e : h);   // 달빛 복사본은 달이 지듯 스르륵
      if (act) { await swing; X.actor.out(act, 40); }
      if (ba) X.actor.out(ba, 160);
      await wait(f.target === 'enemy' ? 420 : 260);
      return;
    }
    case 'sealOn': return;
    case 'discard': {
      await hand.discardAll(f.us);
      t?.absorb?.(300);
      return;
    }
    case 'enemy': {
      setShow({ eblk: 0 });
      const e = foeAt(), h = heroAt();
      const art = $('foe-art');
      if (f.behead) { floatAt(e.x, e.y - 30, TR('숨결이 끊겼다!'), 'mint'); await wait(500); return; }
      if (f.paused) { skillCall(TR('{0} 일시정지 — 적의 행동 무효', ico('hourglass'))); if (fxOn) FX().flash('#3EE6E0', 400, 0.3); floatAt(e.x, e.y - 30, TR('⏸ 정지!'), 'sky big'); sfx.seal?.(); await wait(900); return; }
      if (f.hits.length) {
        // 적이 달려든다 → 할퀸 자국 · 붉은 번쩍임 · 체력바가 깎이며 흰 띠가 따라 줄어든다. 막으면 방패가 '쨍'
        art?.classList.remove('lunge'); void art?.offsetWidth; art?.classList.add('lunge');
        foePose('attack', 520);
        sfx.whoosh?.();
        // 보스: 체력바 옆은 상반신 → 공격할 때 주사위판 왼쪽에 전신이 크게 나와 덤벼든다
        const ba = bossBustURL(R.C.e.id) && X.actor?.ok() ? X.actor.boss(R.C.e.id, foeColor(R.C.e.id)) : null;
        // 실제로 맞는 공격이 있으면 영웅이 크게 나와 맞고 휘청인다 (다 막으면 나오지 않는다)
        const ha = f.hits.some(x => x.dmg > 0) && X.actor?.ok() ? X.actor.in(R.cls, ba ? X.actor.center(ba) : e) : null;
        // 보스 모션: 가장 센 한 방(f.ult)은 필살기, 나머지는 일반 공격 — 동작의 타격 칸에 맞춰 영웅이 맞는다
        const kind = f.ult ? 'ult' : 'attack';
        let touch = null;
        const touched = ba ? new Promise(r => { touch = r; }) : null;
        const lunge = ba ? X.actor.lunge(ba, 620, () => touch(), kind) : null;
        await (ba ? Promise.race([touched, wait(1500)]) : wait(190));
        if (ba && f.ult) shake($('rc'), 1.8);
        for (const hit of f.hits) {
          const big = hit.dmg >= 15;
          if (hit.blocked) {
            sfx.clang?.(hit.dmg ? 0.6 : 1);
            if (fxOn) { FX().ring(h.x, h.y, { color: '#7CC8FF', r1: 64, dur: 300, width: 6 }); FX().burst(h.x, h.y, { n: 14, pal: PALETTES.frost, speed: [100, 260], life: [0.2, 0.45] }); }
            floatAt(h.x + 34, h.y - 26, `${ico('shield', 'xs')}-${hit.blocked}`, 'sky');
            popBlk();
          }
          if (hit.dmg) {
            if (ha) X.actor.pose(ha, 'hurt', 460);
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
        if (lunge) await lunge;
        if (ha) X.actor.out(ha, 160);
        if (ba) X.actor.out(ba, 100);
        // 적의 공격을 하나도 안 맞고 다 막았다 → 크게
        { const got = f.hits.reduce((a, h) => a + (h.dmg || 0), 0), blk = f.hits.reduce((a, h) => a + (h.blocked || 0), 0);
          if (!got && blk > 0) { centerCall('def', blk, true, 0, false); await wait(500); } }
        if (f.thorn) { setShow({ ehp: Math.max(0, ui.show.ehp - f.thorn) }); repaintBars(); floatAt(e.x, e.y, `${f.thorn}`, 'dmg'); }
      }
      if (f.block) { if (fxOn) FX().shield(e); setShow({ eblk: f.block }); repaintBars(); floatAt(e.x, e.y - 30, `${ico('shield', 'xs')}+${f.block}`, 'sky'); sfx.hold(); await wait(380); }
      if (f.str) { floatAt(e.x, e.y - 40, TR('{0}힘 +{1}', ico('up', 'xs'), f.str), 'dmg'); sfx.powerUp?.(1); if (fxOn) FX().burst(e.x, e.y, { n: 20, pal: PALETTES.fire, grav: -120 }); await wait(380); }
      if (f.heal) { setShow({ ehp: ui.show.ehp + f.heal }); repaintBars(); floatAt(e.x, e.y - 20, `+${f.heal}`, 'mint'); if (fxOn) FX().burst(e.x, e.y, { n: 18, pal: PALETTES.heal, grav: -60 }); await wait(360); }
      if (f.kept) { floatAt(h.x, h.y - 40, TR('{0}금화를 지켰다', ico('coins', 'xs')), 'gold'); await wait(300); }
      if (f.steal) { if (fxOn) FX().coins(h, e, 10); floatAt(h.x, h.y - 40, `${ico('coins', 'xs')}-${f.steal}`, 'gold'); sfx.coin(); await wait(500); }
      if (f.weak) { floatAt(h.x, h.y - 40, TR('{0}약화 {1}턴', ico('snow', 'xs'), f.weak), 'sky'); await wait(300); }
      if (!f.hits.length && !f.block && !f.str && !f.heal) await wait(200);
      if (f.counter) { const e2 = foeAt(); floatAt(e2.x, e2.y - 10, TR('{0}반격 {1}', ico('shield', 'xs'), f.counter), 'sky'); setShow({ ehp: Math.max(0, ui.show.ehp - f.counter) }); repaintBars(); await wait(300); }
      return;
    }
    case 'hit': {
      const e = foeAt();
      if (f.why === 'burn') { if (fxOn) FX().fire?.([e], 500); floatAt(e.x, e.y - 10, `${ico('fire', 'xs')}${f.hit ?? f.dmg}${f.blocked ? ` <small>${TR('{0}{1} 막힘', ico('shield', 'xs'), f.blocked)}</small>` : ''}`, 'dmg'); sfx.fire?.(); }
      else if (f.why === 'potion') { if (fxOn) FX().impact(e.x, e.y, PALETTES.fire, 1.8); floatAt(e.x, e.y - 10, `${f.hit ?? f.dmg}`, 'dmg big'); sfx.boom?.(1); }
      const sr = ui.show.eblk > 0 && f.blocked && ui.show.eblk - f.blocked <= 0 ? shieldRect() : null;
      setShow({ ehp: Math.max(0, ui.show.ehp - f.dmg), eblk: Math.max(0, ui.show.eblk - f.blocked) });
      repaintBars();
      shieldBreak(sr);
      await wait(380);
      return;
    }
    case 'rage': {
      const e = foeAt();
      sfx.haki?.();
      if (fxOn) { FX().flash('#E8435A', 400, 0.35); FX().burst(e.x, e.y, { n: 60, pal: PALETTES.hell, speed: [120, 380] }); }
      floatAt(e.x, e.y - 50, TR('분노!'), 'dmg big');
      shake($('rc'), 2);
      rageWave();
      await wait(700);
      rageFlames();
      if (Run.ENEMIES[f.foe]?.talk) await jSay('', 'rage');
      return;
    }
    case 'regrow': { const e = foeAt(); floatAt(e.x, e.y - 40, TR('머리가 다시 자란다!'), 'dmg'); if (fxOn) FX().regrow?.(e); await wait(600); return; }
    case 'fury': { const e = foeAt(); floatAt(e.x, e.y - 50, TR('{0}격앙 +{1}', ico('anger', 'xs'), f.str), 'dmg'); await wait(320); return; }
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
      setHTML($('r-hud'), hud());
      await hand.draw(cards);
      return;
    }
    case 'reshuffle': return shuffleFx();
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
      if (!Run.omen(R, 'fog')) skillCall(jMask() ? '???' : `${runIco('hex', f.t, h.icon)} ${h.ko}`);   // 보스 · 적 방해 이름: 트레이 위쪽에 크게 (짙은 안개면 알리지 않는다)
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
        // 시선은 응시가 걸린 카드마다 (카드가 움직이면 따라간다). 카드를 못 찾으면 손패 가운데
        const aim = () => { const ps = (f.us || []).map(u => hand.el(u)).filter(Boolean).map(el => center(el)); return ps.length ? ps : center($('hand')); };
        ui.hideGaze = true; hand.refresh();
        // 시선이 카드에 닿는 순간 응시가 걸린다 (조준 표시가 맺히며 카드가 잿빛으로)
        await FX().eye({ x: innerWidth / 2, y: innerHeight * 0.4 }, aim, 1200, () => { ui.hideGaze = false; hand.refresh(); buzz(40); });
      } else sfx.select();
      ui.hideGaze = false;
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
        floatAt(center($('tray')).x, center($('tray')).y - 30, TR('봉인 해제!'), 'gold');
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
    case 'phoenix': { const h = heroAt(); if (fxOn) { FX().burst(h.x, h.y, { n: 60, pal: PALETTES.fire, grav: -160 }); FX().flash('#FFD24A', 400, 0.4); } floatAt(h.x, h.y - 40, TR('불사조의 부활!'), 'gold big'); sfx.levelup?.(); setShow({ hp: f.hp }); repaintBars(); await wait(900); return; }
    case 'runWon': return;
    // ── 시공 광대 ──
    case 'jesterIn': await jSay(f.say, 'taunt', 2600); return;
    case 'dodge': await jSay('', 'taunt'); return;      // 몸 빼기 · '회피!' 는 카드가 닿을 때 (play) 함께
    case 'facedown': {
      skillCall(jMask() ? '???' : TR('{0} 뒷면 카드', ico('card')));
      f.us.forEach(u => { const el = hand.el(u); el?.classList.remove('flipback'); void el?.offsetWidth; el?.classList.add('flipback'); });
      sfx.card();
      hand.refresh();
      await jSay(f.say, 'taunt');
      return;
    }
    case 'jestCard': {
      skillCall(jMask() ? '???' : `${ico(f.kind === 'bomb' ? 'fire' : 'anger')} ${f.kind === 'bomb' ? TR('시한폭탄') : TR('광대의 도전장')}`);
      const c = R.C?.hand.find(x => x.u === f.u);
      if (c) await hand.draw([c]);
      await jSay(f.say, 'taunt');
      return;
    }
    case 'jestShuffle': {
      jBanner(TR('{0} 손패 섞기!', ico('card')), 'shuffle');
      await jSay(f.say, 'taunt', 2000);
      if (fxOn) FX().flash('#FF4FD8', 260, 0.25);
      ui.hidTmp = new Set(f.hidOld || []);            // 섞여 나가는 뒷면 카드는 끝까지 뒷면으로
      await hand.discardAll(f.out);
      ui.hidTmp = null;
      const cards = f.in.map(u => R.C?.hand.find(c => c.u === u)).filter(Boolean);
      await hand.draw(cards);
      hand.refresh();
      return;
    }
    case 'boom': {
      // 시한폭탄: 폭탄 카드가 영웅에게 날아가 닿는 순간 터지며 피해가 함께 들어간다
      const h = heroAt();
      if (hand.find(f.u)) await hand.launch(f.u, h, 'self');
      sfx.boom?.(1.6); buzz(160);
      if (fxOn) { FX().burst(h.x, h.y, { n: 70, pal: PALETTES.fire, speed: [120, 400] }); FX().ring(h.x, h.y, { color: '#FF7A1A', r1: 120, dur: 420, width: 8 }); FX().flash('#FF7A1A', 300, 0.35); hurtFlash(true); clawAt(center($('rhero')), true); }
      shake($('rc'), 2);
      if (f.blocked) { floatAt(h.x + 34, h.y - 26, `${ico('shield', 'xs')}-${f.blocked}`, 'sky'); popBlk(); }
      if (f.dmg) { floatAt(h.x, h.y - 12, `-${f.dmg}`, 'dmg big huge'); sfx.hurt?.(2); }
      setShow({ blk: Math.max(0, ui.show.blk - f.blocked), hp: Math.max(0, ui.show.hp - f.dmg) });
      updHero(f.dmg > 0);
      jSay('', 'taunt');
      await wait(650);
      return;
    }
    case 'parallel': {
      skillCall(TR('{0} 병렬 연산 · 합 {1}', ico('card'), f.score));
      f.us.forEach(u => hand.el(u)?.classList.add('par-glow'));
      sfx.card?.();                                  // 팡파레는 울리지 않는다
      await wait(700);
      return;
    }
    case 'rent': {
      const h = heroAt(), add = f.ids.filter(id => !f.from.includes(id));
      setHTML($('r-hud'), hud());
      if ($('r-hero')) setHTML($('r-hero'), heroStrip());
      if (add.length) { floatAt(h.x, h.y - 60, TR('{0} 대여: {1}', ico('gem', 'xs'), add.map(id => Run.relicInfo(id).ko).join(' · ')), 'gold'); sfx.select(); await wait(300); }
      return;
    }
    case 'jesterOut': {
      const art = $('foe-art');
      await jSay(f.say, f.won ? '' : 'taunt', 2400);
      art?.classList.add('warp');
      sfx.whoosh?.();
      if (fxOn) { const e = foeAt(); FX().burst(e.x, e.y, { n: 50, pal: ['#3EE6E0', '#FF4FD8', '#FFFFFF'], speed: [100, 360] }); }
      await wait(900);
      if (!f.won) {
        // 쓰러진 뒤: 광대가 사라지고 1초 뒤, 회복 소리와 함께 화면 전체가 홀로그램으로 일렁이며 원래 세계로 — 체력이 절반까지 찬다
        await wait(1000);
        sfx.quest?.();
        const warp = holoWarp(1700);
        await wait(750);
        const h = heroAt();
        if (fxOn) FX().burst(h.x, h.y, { n: 30, pal: PALETTES.heal, grav: -80 });
        floatAt(h.x, h.y - 30, `+${Math.max(0, f.hp - (ui.show?.hp || 0))}`, 'mint big');
        setShow({ hp: f.hp }); updHero(false);
        await warp;
      }
      return;
    }
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
      <div class="bi-name"><small>${TR('{0}막 보스 · {1}', R.act, esc(def.ko.slice(0, cut)))}</small><b>${esc(def.ko.slice(cut + 1))}</b></div>
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
    floatAt(p.x, p.y - 60, TR('엘리트!'), 'dmg big');
    sfx.haki?.();
  } else if (def.kind === 'special') {
    // 시공 광대: 화면이 지지직 깨지며 홀로그램 띠 — 정체는 알리지 않는다 (??? · 지도에 없던 적)
    ui.busy = true;
    X.layer.innerHTML = `<div class="overlay boss-intro run-intro jest-intro" data-act="run-skip" style="--c:#3EE6E0">
      <div class="bi-band"><i></i></div><div class="bi-band thin"></div>
      <img class="spr bi-boss spr-hi" src="${jesterURL('taunt')}" alt="">
      <div class="bi-name"><small>? ? ?</small><b>???</b></div>
      <div class="bi-flash"></div><div class="glitch" aria-hidden="true"></div></div>`;
    sfx.slash?.();
    setTimeout(() => { sfx.boom?.(1.4); shake(X.layer.firstElementChild, 2); }, 430);
    await Promise.race([wait(2400), new Promise(r => (ui.skipIntro = r))]);
    ui.skipIntro = null;
    X.layer.innerHTML = '';
    ui.busy = false;
    paint();
  }
}

// 전투 첫 턴의 방해 연출: 적 등장 · 카드 돌리기가 끝난 뒤 (응시면 눈이 먼저 뜨고, 그다음 카드에 응시가 걸린다)
async function openingHex() {
  const list = ui.openFx;
  ui.openFx = null;
  if (!list || X.screen() !== 'run' || R?.phase !== 'combat') { ui.hideGaze = false; return; }
  ui.busy = true;
  await wait(650);
  if (X.screen() === 'run' && R?.phase === 'combat') await playFx(list, snap());
  ui.busy = false;
  ui.hideGaze = false;
  hand?.refresh();
  paint();
}

// ── 보상 ─────────────────────────────────────────────────────────────────────
function showReward() {
  const rw = R.reward;
  if (rw) tour('reward', 900);
  if (!rw) { R.phase = 'map'; return showMap(); }
  playBgm(R.C && Run.ENEMIES[R.C.e.id]?.kind === 'boss' ? 'victory' : 'run_map');
  const title = rw.kind === 'start' ? TR('출발 준비!') : rw.kind === 'treasure' ? TR('보물 상자!') : rw.kind === 'boss' ? TR('보스 토벌!') : rw.kind === 'elite' ? TR('엘리트 처치!') : rw.kind === 'special' ? TR('승리!') : TR('승리!');
  X.layer.innerHTML = '';
  const again = !!rw.cheered;
  X.app.innerHTML = `
  <div class="screen run-reward${again ? ' again' : ''}">
    ${hud()}
    <div class="rw-box">
      <h1 class="rw-title">${title}</h1>
      ${rw.kind === 'treasure' || rw.kind === 'start' ? `<div class="chest"><img class="run-scene" src="${sceneURL(rw.kind)}" alt=""></div>` : ''}
      <div class="rw-items">
        ${rw.items.map((it, k) => rewardRow(it, k)).join('')}
      </div>
      <button class="pbtn gold" data-act="run-leave">${rw.kind === 'boss' ? TR('다음 막으로') : rw.kind === 'start' ? TR('출발') : rw.kind === 'special' ? TR('가던 길로') : TR('지도로')}</button>
    </div>
    ${heroStrip()}
  </div>`;
  // 팡파레는 '승리!'가 처음 뜰 때 한 번만 (보상을 받을 때마다 다시 그려도 울리지 않는다)
  if (!rw.cheered) { rw.cheered = true; save(); sfx.win?.(); }
  // 골드 · 물약(칸이 남으면)은 저절로 받는다 — 하나씩 날아가고 다시 그린 뒤 다음 것
  const auto = rw.items.findIndex(autoTakes);
  if (auto >= 0) setTimeout(() => R?.reward === rw && takeItem(auto), rw.cheered === 'auto' ? 220 : 520);
  rw.cheered = rw.cheered && 'auto';
}
const autoTakes = it => !it.done && ((it.t === 'card' && it.fixed) || it.t === 'gold' || it.t === 'stars' || it.t === 'gems' || (it.t === 'potion' && R.potions.length < Run.POTION_SLOTS));
// 보상 칸: 가로세로가 비슷한 타일. 저절로 받는 것(골드 · 물약)은 「받음」, 직접 고르는 것은 「고르기」 · 「받기」 표시
function rewardRow(it, k) {
  const done = it.done ? ' done' : '';
  const full = it.t === 'potion' && !it.done && R.potions.length >= Run.POTION_SLOTS;
  const tag = it.done ? `<em class="rw-tag ok">${TR('받음')}</em>` : full ? `<em class="rw-tag warn">${TR('물약 칸 가득')}</em>`
    : ['card', 'relicPick'].includes(it.t) ? `<em class="rw-tag pick">${TR('고르기 ▸')}</em>` : ['gold', 'potion', 'stars', 'gems'].includes(it.t) ? '' : `<em class="rw-tag pick">${TR('받기')}</em>`;
  if (it.t === 'gold') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico('coins')}<b>${TR('골드 {0}', it.n)}</b>${tag}</button>`;
  if (it.t === 'potion') { const p = Run.potionInfo(it.id); return `<button class="rw${done}${full ? ' full' : ''}" data-act="run-take" data-k="${k}" style="--pc:${p.color}">${runIco('potion', p.id, p.icon)}<b>${p.ko}</b><small>${p.desc}</small>${tag}</button>`; }
  if (it.t === 'relic') { const r = Run.relicInfo(it.id); return `<button class="rw relic-row r${r.r}${done}" data-act="run-take" data-k="${k}">${relicIco(r)}<b>${r.ko}</b><small>${r.desc}</small>${tag}</button>`; }
  if (it.t === 'relicPick') return `<button class="rw boss-relic${done}" data-act="run-relicpick" data-k="${k}">${ico('crown')}<b>${it.kind === 'boss' ? TR('보스 유물') : TR('유물')}</b><small>${TR('{0}개 중 1개', it.opts.length)}</small>${tag}</button>`;
  if (it.t === 'flip' || it.t === 'nudge') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico(it.t)}<b>${it.t === 'flip' ? TR('뒤집기') : TR('조정')} +${it.n}</b>${tag}</button>`;
  if (it.t === 'stars') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${starIco('')}<b>${TR('별조각 {0}', it.n)}</b><small>${TR('원정이 끝나면 받는다')}</small>${tag}</button>`;
  if (it.t === 'gems') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico('gem')}<b>${TR('보석 {0}', it.n)}</b><small>${TR('원정이 끝나면 받는다')}</small>${tag}</button>`;
  if (it.t === 'card' && it.fixed) { const c = it.opts[0]; return `<button class="rw card-row future-row${done}" data-act="run-take" data-k="${k}">${ico('card')}<b>${TR('히든 족보 · {0}', esc(Run.FUTURE[c.cat]?.ko || Run.cardName(c)))}</b><small>${esc(Run.FUTURE[c.cat]?.desc || '')}</small>${tag}</button>`; }
  if (it.t === 'card' && it.future) return `<button class="rw card-row future-row${done}" data-act="run-cardpick" data-k="${k}">${ico('card')}<b>${TR('카드')}</b><small>${TR('{0}장 중 1장', it.opts.length)}</small>${tag}</button>`;
  if (it.t === 'card') return `<button class="rw card-row${done}" data-act="run-cardpick" data-k="${k}">${ico('card')}<b>${TR('카드')}</b><small>${TR('{0}장 중 1장', it.opts.length)}</small>${tag}</button>`;
  return '';
}
async function takeItem(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  try { Run.takeReward(R, k); } catch (e) { return X.toast(ico('warn'), TR('받을 수 없어요'), e.message, 1700); }
  drain();
  const el = X.app.querySelector(`[data-act=run-take][data-k="${k}"]`);
  const p = center(el);
  if (it.t === 'gold') { sfx.coin(); FX().coins(p, center($('r-gold')), 12); }
  else if (it.t === 'relic') { /* 유물은 drain() 의 받기 연출(relicReveal)이 맡는다 */ }
  else if (it.t === 'stars' || it.t === 'gems') { sfx.stars?.(Math.min(10, it.n / 10)) || sfx.coin(); FX().burst(p.x, p.y, { n: 36, pal: it.t === 'gems' ? PALETTES.arcane : PALETTES.gold }); }
  else { sfx.card(); FX().burst(p.x, p.y, { n: 20, pal: PALETTES.heal }); }
  save();
  setTimeout(() => R.phase === 'reward' && showReward(), 260);
}
function cardPick(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  ui.cardPick = k;
  sfx.card();
  X.layer.innerHTML = `<div class="overlay run-pick${it.future ? ' future-pick' : ''}" data-act="noop"><div class="pick-box">
    ${it.future ? '' : `<h2>${TR('보상')}</h2>`}
    <div class="pick-cards" style="--n:${it.opts.length}">${it.opts.map((c, i) => `<button class="rc rc-static pick" data-act="run-cardtake" data-i="${i}" style="--d:${i * 90}ms">${cardFace(c)}</button>`).join('')}</div>
    ${it.future ? `<div class="fut-descs">${it.opts.map(c => `<p><b>${esc(Run.FUTURE[c.cat].ko)}</b> ${esc(Run.FUTURE[c.cat].desc)}</p>`).join('')}</div>` : ''}
    <div class="pick-actions">${it.future ? '' : rerollBtn('run-repick', Run.rrOf(R).pick, k)}<button class="pbtn small" data-act="run-deck">${TR('내 덱 보기')}</button><button class="pbtn small" data-act="run-cardskip">${TR('건너뛰기')}</button></div>
  </div></div>`;  // 카드를 길게 누르면 설명 (누르면 바로 가져간다)
  X.layer.querySelectorAll('.pick-cards .rc').forEach((el, i) => longPress(el, () => X.popover(el, cardTip(it.opts[i]), { afterRelease: true })));
}
function cardTake(i) {
  const k = ui.cardPick;
  const el = X.layer.querySelector(`[data-act=run-cardtake][data-i="${i}"]`);
  try { Run.takeReward(R, k, i); } catch (e) { return X.toast(ico('warn'), TR('받을 수 없어요'), e.message, 1500); }
  drain();
  sfx.legend();
  if (el) { el.classList.add('taken'); const p = center(el); FX().burst(p.x, p.y, { n: 40, pal: PALETTES.gold }); }
  ui.cardPick = null;
  save();
  setTimeout(() => { X.layer.innerHTML = ''; if (R.phase === 'reward') showReward(); }, 520);
}
// 새로고침 버튼 (남은 횟수가 없으면 회색)
const rerollBtn = (act, n, k = '') => `<button class="pbtn small reroll-btn" data-act="${act}" ${k !== '' ? `data-k="${k}"` : ''} ${n > 0 ? '' : 'disabled'}>${TR('{0} 새로고침', ico('recycle', 'xs'))} <b>${n}</b></button>`;
function relicPick(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  ui.relicPick = k;
  sfx.legend();
  X.layer.innerHTML = `<div class="overlay run-pick" data-act="noop"><div class="pick-box">
    <h2>${TR('{0} 1개를 고르세요', it.kind === 'boss' ? TR('보스 유물') : TR('유물'))}</h2>
    <div class="relic-picks n${it.opts.length}">${it.opts.map((id, i) => { const r = Run.relicInfo(id); return `<button class="relic-card r${r.r}" data-act="run-relictake" data-i="${i}">${relicIco(r, 'lg')}<b>${r.ko}</b><small>${r.desc}</small></button>`; }).join('')}</div>
    <div class="pick-actions">${rerollBtn('run-repick', Run.rrOf(R).pick, k)}<button class="pbtn small" data-act="run-relicskip">${TR('건너뛰기')}</button></div>
  </div></div>`;
}

// ── 상점 ─────────────────────────────────────────────────────────────────────
function showShop() {
  playBgm('run_map');
  tour('shop');
  const sh = R.shop;
  const price = (p, sold) => `<em class="price${!sold && R.gold < p ? ' poor' : ''}">${sold ? TR('판매됨') : `${ico('coins', 'xs')}${p}`}</em>`;
  // 진열대: 아이콘과 가격표만. 누르면 산다, 길게 누르면 설명
  const tips = [];
  const item = (attrs, icon, p, sold, tip, cls = '') => { tips.push(tip); return `<button class="shelf-item${cls}${sold ? ' sold' : ''}" ${attrs} data-ti="${tips.length - 1}" ${sold ? 'disabled' : ''}><span class="si-ico">${icon}</span>${price(p, sold)}</button>`; };
  const tipOf = (title, desc, sub = '') => `<b>${title}</b>${sub ? ` <small>${sub}</small>` : ''}<p>${desc}</p>`;
  const cards = sh.cards.map((it, i) => item(`data-act="run-buy" data-kind="card" data-i="${i}"`, `<div class="rc rc-static">${cardFace(it.c)}</div>`, it.price, it.sold, cardTip(it.c), ' card'));
  const seals = (sh.seals || []).map((it, i) => { const sl = Run.sealInfo(it.id); return item(`data-act="run-buy" data-kind="seal" data-i="${i}" style="--sc:${sl.color}"`, `<i class="seal-big s-${it.id}">${sealIco(it.id, '')}</i>`, it.price, it.sold, tipOf(`${sealIco(it.id)} ${sl.ko}`, sl.desc, TR('카드에 붙이는 일회용 효과')), ' seal-row'); });
  const relics = sh.relics.map((it, i) => { const r = Run.relicInfo(it.id); return item(`data-act="run-buy" data-kind="relic" data-i="${i}"`, relicIco(r, 'lg'), it.price, it.sold, tipOf(`${relicIco(r, 'xs')} ${r.ko}`, r.desc, ['', TR('일반'), TR('희귀'), TR('보스')][r.r]), ` si-relic r${r.r}`); });
  const potions = sh.potions.map((it, i) => { const p = Run.potionInfo(it.id); return item(`data-act="run-buy" data-kind="potion" data-i="${i}" style="--pc:${p.color}"`, runIco('potion', p.id, p.icon, 'lg'), it.price, it.sold, tipOf(p.ko, p.desc, TR('물약'))); });
  const tools = sh.tools.map((it, i) => item(`data-act="run-buy" data-kind="tool" data-i="${i}"`, ico(it.kind, 'lg'), it.price, it.sold, tipOf(`${it.kind === 'flip' ? TR('뒤집기') : TR('조정')} +1`, TR('{0} (최대 {1})', it.kind === 'flip' ? TR('주사위 1개를 반대 면으로') : TR('주사위 1개를 ±1'), Run.TOOL_CAP))));
  const smith = item(`data-act="run-shopsmith"${!sh.smithed && !R.deck.some(Run.canUpgrade) ? ' disabled' : ''}`, runIco('ui', 'smith', 'axe', 'lg'), Run.smithPrice(R), sh.smithed, tipOf(TR('대장장이'), TR('카드 1장 강화 (점수 +30% 또는 효과 새기기, 최대 {0}개)', Run.KW_MAX)));
  const remove = item('data-act="run-remove"', ico('skull', 'lg'), Run.removePrice(R), sh.removed, tipOf(TR('카드 제거'), TR('덱에서 카드 1장을 없앤다')));
  const shelf = (list, cls = '') => (list.length ? `<div class="shelf${cls}"><div class="shelf-row">${list.join('')}</div><i class="shelf-plank" aria-hidden="true"></i></div>` : '');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-shop${R.cls === 'monk' ? ' ascetic' : ''}">
    ${hud()}
    <div class="shop-head market"><i class="mk-awning" aria-hidden="true"></i><img class="run-scene sm" src="${sceneURL('shop')}" alt=""><div><b>${TR('떠돌이 상점')}</b></div>${rerollBtn('run-reshop', Run.rrOf(R).shop)}</div>
    ${R.cls === 'monk' ? `<p class="ascetic-note">${TR('{0} 금욕: 수도승은 상점을 쓸 수 없어요. 구경만 하고 지나가요', ico('lotus', 'xs'))}</p>` : ''}
    <div class="shop-scroll shop-stall">
      ${shelf(cards, ' cards')}
      ${shelf([...seals, ...relics])}
      ${shelf([...potions, ...tools, smith, remove])}
    </div>
    <button class="pbtn gold" data-act="run-shopleave">${TR('상점 나가기')}</button>
    ${heroStrip()}
  </div>`;
  ui.shopTips = tips;
  X.app.querySelectorAll('.shelf-item[data-ti]').forEach(el => longPress(el, () => X.popover(el, tips[el.dataset.ti], { afterRelease: true })));
}

// ── 휴식 ─────────────────────────────────────────────────────────────────────
function showRest() {
  playBgm('run_map');
  tour('rest');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-rest">
    ${hud()}
    <div class="camp"><div class="campfire" id="campfire"><img class="run-scene" src="${sceneURL('rest')}" alt=""></div><b>${TR('모닥불')}</b></div>
    <div class="rest-opts">
      <button class="pbtn big rest-btn" data-act="run-rest">${ico('heart')}<span>${TR('휴식')}<small>${TR('체력 {0} 회복', Run.restAmount(R))}</small></span></button>
      <button class="pbtn big rest-btn" data-act="run-smith" ${R.deck.some(Run.canUpgrade) ? '' : 'disabled'}>${runIco('ui', 'smith', 'axe')}<span>${TR('단련')}<small>${TR('카드 1장 강화 (+30% 또는 효과)')}</small></span></button>
    </div>
    ${heroStrip()}
  </div>`;
  const p = center($('campfire'));
  if (X.prefs.fx !== 'min') FX().burst(p.x, p.y, { n: 24, pal: PALETTES.fire, grav: -140, speed: [20, 90], life: [0.6, 1.2] });
}

// ── 이벤트 ───────────────────────────────────────────────────────────────────
function showEvent(rolled = false) {
  playBgm('run_map');
  tour('event');
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
      ${R.event.dice ? `<div class="ev-dice${ui.evRoll ? ' rolling' : rolled ? ' settled' : ''}">${R.event.dice.map(v => `<i class="dd-die" data-v="${v}">${miniDie(ui.evRoll ? 1 + Math.floor(Math.random() * 6) : v)}</i>`).join('')}</div>` : ''}
      ${R.event.yacht && res == null ? yachtView(R.event.yacht)
        : ui.evRoll ? `<p class="ev-result wait">${TR('주사위를 굴린다…')}</p>`
        : res != null ? `<p class="ev-result">${esc(res)}</p><button class="pbtn gold" data-act="run-evleave">${TR('계속')}</button>`
        : `<div class="ev-opts">${ev.opts.map((o, k) => { const ok = o.can(R); const d = typeof o.desc === 'function' ? o.desc(R) : o.desc; return `<button class="pbtn ev-opt" data-act="run-evopt" data-k="${k}" ${ok ? '' : 'disabled'}><span>${esc(o.ko)}</span><small>${esc(d)}</small></button>`; }).join('')}</div>`}
    </div>
    ${ui.evRoll ? '' : `<button class="peek-btn" data-act="run-peekmap">${TR('{0} 지도 잠깐 보기', ico('scroll', 'xs'))}</button>`}
    ${heroStrip()}
  </div>`;
  if (R.pick?.why === 'face') { if (ui.carveIntro) showCarveResult(); else showCarve(); }
}
// 굴림이 끝나면: 몇 점이었는지 · 깎기 몇 면을 채웠는지 (사다리) → 「면 깎으러 가기」
function showCarveResult() {
  const y = R.event.yacht, done = y?.done;
  if (!done) { ui.carveIntro = false; return showCarve(); }
  const steps = [...Run.CARVE_STEPS.map(([max, n]) => ({ n, ko: TR('{0}점 이하', max) })), { n: 4, ko: TR('요트') }];
  const yacht = done.cat === 'yacht';
  X.layer.innerHTML = `<div class="overlay run-carveres" data-act="noop"><div class="carve-res${yacht ? ' yacht' : ''}">
    <p class="cr-tag">${TR('{0} 굴림 끝!', ico('axe', 'xs'))}</p>
    <div class="cr-dice">${y.dice.map((v, i) => `<i style="--i:${i}">${miniDie(v)}</i>`).join('')}</div>
    <p class="cr-cat">${esc(Run.cardTitle(done.cat))}</p>
    <p class="cr-score"><b id="cr-n">0</b><small>${TR('점')}</small></p>
    <div class="cr-ladder">${steps.map(st => `<div class="cr-step${st.n === done.n ? ' hit' : st.n < done.n ? ' past' : ''}"><span class="cr-pips">${'◆'.repeat(st.n)}</span><b>${TR('{0}면', st.n)}</b><small>${st.ko}</small></div>`).join('')}</div>
    <p class="cr-sum">${TR('깎기')} <b>${done.n}</b> ${TR('/ 4 면{0}', done.n === 4 ? ` ${TR('— 최대!')}` : '')}</p>
    <button class="pbtn gold" data-act="run-carvego">${TR('{0} 면 깎으러 가기', ico('axe', 'xs'))}</button>
  </div></div>`;
  sfx.select();
  // 점수가 0 에서 올라가며 세어진다
  const el = $('cr-n'), t0 = performance.now(), dur = Math.min(900, 300 + done.score * 12);
  const tick = now => { const k = Math.min(1, (now - t0) / dur); if (el?.isConnected) { el.textContent = Math.round(done.score * k); if (k < 1) requestAnimationFrame(tick); else { sfx.coin?.(); if (yacht && X.prefs.fx !== 'min') { const r = el.getBoundingClientRect(); FX().burst(r.left + r.width / 2, r.top + r.height / 2, { n: 40, pal: PALETTES.rainbow, speed: [80, 260], life: [0.5, 1] }); } } } };
  requestAnimationFrame(tick);
}
// 주사위 깎는 노인: 야추 한 턴 (주사위를 눌러 잡고, 3번까지 굴린다)
function yachtView(y) {
  const done = y.done;
  return `<div class="ev-yacht">
    ${y.dice.some(Boolean) ? `<div class="ev-sum${ui.yRoll ? ' wait' : ui.ySumPop ? ' pop' : ''}"><small>${TR('주사위 합')}</small><b>${ui.yRoll ? '?' : y.dice.reduce((a, v) => a + v, 0)}</b></div>` : ''}
    <div class="ev-dice yacht${ui.yRoll ? ' rolling' : ''}">${y.dice.map((v, i) => `<button class="dd-die${y.held[i] ? ' held' : ''}" data-act="run-yhold" data-i="${i}" ${y.rolls === 3 || done ? 'disabled' : ''}>${v ? miniDie(ui.yRoll && !y.held[i] ? 1 + Math.floor(Math.random() * 6) : v) : '<span class="md q">?</span>'}</button>`).join('')}</div>
    ${done ? `<p class="ev-result">${TR('{0} {1}점 → 주사위 면', esc(Run.cardTitle(done.cat)), done.score)} <b>${done.n}</b>${TR('개 깎기')}</p>`
      : `<p class="ev-carve-rule">${TR('10점 이하 1면 · 20점 이하 2면 · 30점 이하 3면 · 요트 4면')}</p>
      <div class="ev-opts"><button class="pbtn gold" data-act="run-yroll" ${ui.yRoll ? 'disabled' : ''}>${TR('굴리기')} <small>${TR('남은 {0}번', y.rolls)}</small></button>${y.rolls < 3 ? `<button class="pbtn" data-act="run-ystop">${TR('여기서 멈추기')}</button>` : ''}</div>`}
  </div>`;
}
// 주사위 면 깎기: 주사위를 고르고 → 바꿀 면 → 새 눈
function showCarve() {
  const pk = R.pick, sel = ui.carve;
  X.layer.innerHTML = `<div class="overlay run-carve" data-act="noop"><div class="deck-box">
    <h2>${TR('{0} 주사위 면 깎기', ico('axe'))} <small>${TR('남은 {0}면', pk.left)}</small></h2>
    <div class="carve-dice">${[0, 1, 2, 3, 4].map(i => `<div class="carve-row"><b>${i + 1}</b>${Run.facesOf(R, i).map((v, f) => `<button class="cface${sel?.i === i && sel?.f === f ? ' on' : ''}${Run.facesOf(R, i) !== Run.DIE_FACES && v !== f + 1 ? ' carved' : ''}" data-act="run-cface" data-i="${i}" data-f="${f}">${miniDie(v)}</button>`).join('')}</div>`).join('')}</div>
    ${sel ? `<p class="hint">${TR('{0}번 주사위의 「{1}」 면을 →', sel.i + 1, Run.facesOf(R, sel.i)[sel.f])} </p><div class="carve-vals">${[1, 2, 3, 4, 5, 6].map(v => `<button class="cface val" data-act="run-cval" data-v="${v}" ${v === Run.facesOf(R, sel.i)[sel.f] ? 'disabled' : ''}>${miniDie(v)}</button>`).join('')}</div>` : ''}
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">${TR('그만두기')}</button></div>
  </div></div>`;
}
// 이벤트 주사위: 일일 보상처럼 다 같이 흔들리다가 앞에서부터 하나씩 멈춘다. 결과(체력 · 골드)는 다 멈춘 뒤에 보인다
async function rollEventDice(before) {
  const d = R.event.dice, r0 = R;
  ui.show = before; ui.evRoll = true; ui.busy = true;
  showEvent();
  const dice = [...X.app.querySelectorAll('.ev-dice .dd-die')];
  sfx.shake?.();
  const spin = setInterval(() => dice.forEach(e => { if (!e.classList.contains('set')) e.innerHTML = miniDie(1 + Math.floor(Math.random() * 6)); }), 90);
  await wait(650);
  for (let i = 0; i < d.length; i++) {
    const tense = d.length === 5 && i === 4 && d.slice(0, 4).every(v => v === d[0]);   // 요트가 될 수 있으면 마지막 하나는 뜸 들인다
    await wait(tense ? 700 : 260);
    dice[i].classList.add('set'); dice[i].innerHTML = miniDie(d[i]); dice[i].dataset.v = d[i];
    sfx.clack?.();
  }
  clearInterval(spin);
  await wait(380);
  ui.show = null; ui.evRoll = false; ui.busy = false;
  if (R !== r0) return;
  if (R.phase === 'lost') return showEnd();
  showEvent(true);
  // 주사위로 골드를 땄으면(고블린 도박사 · 신전): 주사위 · 출정 채비를 샀을 때처럼 가운데에 크게 「골드 획득!」
  const net = R.gold - before.gold, got = R.event?.won || net;   // 받은 골드 (건 돈을 빼기 전, 결과 문구와 같게)
  const won = net > 0 ? got : 0;
  if (won > 0) {
    sfx.coin(); FX().coins(center(X.app.querySelector('.ev-dice')), center($('r-gold')), 14);
    bigReveal({ cls: 'k-gold', art: `<span class="uf-gold">${ico('coins')}</span>`, small: TR('골드 획득!'), name: TR('+{0} 골드', won), sub: TR('가진 골드 {0}', R.gold) });
  }
}

// ── 덱 고르기 (강화 · 제거 · 복제) / 덱 보기 ─────────────────────────────────
function showPick() {
  const pk = R.pick;
  if (pk.why === 'face') return showCarve();
  if (pk.opts) return showUpgrade();
  const title = { upgrade: TR('강화'), remove: TR('제거'), dup: TR('복제'), seal: `${Run.sealInfo(pk.seal)?.ko}` }[pk.why];
  const list = Run.deckCards(R).filter(c => (pk.why === 'upgrade' ? Run.canUpgrade(c) : pk.why === 'seal' ? !c.seal : true));
  const sel = ui.pickU != null ? R.deck.find(c => c.u === ui.pickU) : null;
  X.layer.innerHTML = `<div class="overlay run-deckpick" data-act="noop"><div class="deck-box">
    <h2>${title}</h2>
    ${pk.why === 'seal' ? sealNotice(pk) : pk.cost ? `<p class="hint">${TR('{0} {1} 골드', ico('coins', 'xs'), pk.cost)}</p>` : pk.hp ? `<p class="hint">${TR('체력 {0}을 잃어요', pk.hp)}</p>` : ''}
    <div class="deck-grid">${list.map(c => `<button class="rc rc-static mini${ui.pickU === c.u ? ' on' : ''}" data-act="run-pickcard" data-u="${c.u}">${cardFace(c)}</button>`).join('')}</div>
    ${sel ? `<div class="pick-prev"><div class="rc rc-static">${cardFace(sel)}</div></div>` : ''}
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">${TR('취소')}</button><button class="pbtn small gold" data-act="run-pickok" ${sel ? '' : 'disabled'}>${{ upgrade: TR('다음'), remove: TR('제거'), dup: TR('복제'), seal: TR('붙이기') }[pk.why]}</button></div>
  </div></div>`;
}
// 인장을 붙일 카드 고르기 안내: 어떤 인장을 · 어떤 카드에 붙이는지
function sealNotice(pk) {
  const sl = Run.sealInfo(pk.seal);
  const sel = ui.pickU != null ? R.deck.find(c => c.u === ui.pickU) : null;
  return `<div class="seal-notice" style="--sc:${sl.color}"><i class="sn-ico">${sealIco(pk.seal, '')}</i>
    <span><i class="sn-line"><b>${sl.ko}</b>${TR('을 붙일 카드를 고르세요')}</i><small>${sl.desc}${pk.cost ? ` · ${ico('coins', 'xs')}${pk.cost}` : ''}</small>
    ${sel ? `<em>→ <b>${esc(Run.cardName(sel))}</b> ${TR('에 붙여요')}</em>` : `<em>${TR('인장이 없는 카드만 고를 수 있어요')}</em>`}</span></div>`;
}
// 강화 고르기: 점수 +30% 또는 새 효과 (3개 중 1개). 고르면 바뀐 카드를 미리 보여 준다
function showUpgrade() {
  const pk = R.pick, c = R.deck.find(x => x.u === pk.u);
  const after = o => (o === 'up' ? { ...c, up: 1 } : { ...c, kws: [...Run.kwsOf(c), o] });
  X.layer.innerHTML = `<div class="overlay run-deckpick" data-act="noop"><div class="deck-box">
    <div class="up-head"><img class="run-scene" src="${sceneURL('smith')}" alt=""><h2>${TR('강화')}</h2></div>
    ${pk.cost ? `<p class="hint">${TR('{0} {1} 골드', ico('coins', 'xs'), pk.cost)}</p>` : ''}
    <div class="up-opts">${pk.opts.map((o, k) => {
      const kw = o !== 'up' && Run.KEYWORDS[o];
      return `<button class="up-opt" data-act="run-upopt" data-k="${k}"><div class="rc rc-static mini">${cardFace(after(o))}</div>
        <span><b>${o === 'up' ? TR('{0} 점수 +30%', ico('up', 'xs')) : `${runIco('kw', o, kw.icon, 'xs')} ${kw.ko}`}</b><small>${o === 'up' ? TR('이 카드의 점수가 늘 30% 더 나온다') : kw.desc}</small></span></button>`;
    }).join('')}</div>
    <p class="hint">${TR('효과 {0}/{1}{2}', Run.kwsOf(c).length, Run.KW_MAX, c.up ? ` ${TR('· 점수 강화 완료')}` : '')}</p>
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">${TR('취소')}</button></div>
  </div></div>`;
}
function showDeck() {
  const C = R.phase === 'combat' ? R.C : null;
  const sec = (title, cards) => `<h3>${title} <small>${TR('{0}장', cards.length)}</small></h3><div class="deck-grid">${cards.map(c => `<div class="rc rc-static mini">${cardFace(c)}</div>`).join('') || `<p class="dim">${TR('없음')}</p>`}</div>`;
  X.layer.innerHTML = `<div class="overlay run-deckview" data-act="close-bg"><div class="deck-box" data-act="noop">
    <h2>${TR('{0} 내 덱 {1}장', runIco('ui', 'deck', 'card'), R.deck.length)}</h2>
    ${C ? sec(TR('뽑을 카드'), C.draw.slice().sort((a, b) => a.cat.localeCompare(b.cat))) + sec(TR('버린 카드'), C.discard) : sec(TR('전체'), Run.deckCards(R))}
    ${Object.keys(R.dfaces || {}).length ? `<h3>${TR('깎은 주사위')}</h3><div class="carve-dice">${Object.keys(R.dfaces).map(i => `<div class="carve-row"><b>${Number(i) + 1}</b>${Run.facesOf(R, Number(i)).map(v => `<span class="cface">${miniDie(v)}</span>`).join('')}</div>`).join('')}</div>` : ''}
    <div class="pick-actions"><button class="pbtn small" data-act="close">${TR('닫기')}</button></div>
  </div></div>`;
}

// @test-only{
// ── 시험 원정 샌드박스 (테스트판 전용 · 배포판 빌드는 잘라낸다) ──
// 유물 · 카드 · 소모품 · 적 · 징조 · 주사위를 마음대로 바꾸고, 손패 카드의 점수 계산을 줄줄이 본다.
const SB_TABS = [['score', tL('점수')], ['relic', tL('유물')], ['card', tL('카드')], ['item', tL('소모품')], ['foe', tL('적')], ['event', tL('이벤트')], ['omen', tL('징조')]];
const sbState = () => (ui.sb ||= { tab: R.phase === 'combat' ? 'score' : 'relic', cat: 'ones', up: 0, kws: [], seal: '' });
function showSandbox() {
  const sb = sbState(), C = R.phase === 'combat' && R.C?.phase === 'roll' ? R.C : null;
  const chip = (act, v, on, label, extra = '') => `<button class="sb-chip${on ? ' on' : ''}" data-act="${act}" data-v="${v}"${extra}>${label}</button>`;
  let body = '';
  if (sb.tab === 'score') {
    if (!C) body = `<p class="dim">${TR('전투 중에만 볼 수 있어요. 「적」 탭에서 싸울 적을 고르세요.')}</p>`;
    else {
      const dice = C.rolled ? C.dice : [];
      body = `<h3>${TR('주사위')} <small>${C.rolled ? TR('눈을 눌러 바꾸기') : TR('먼저 굴려 주세요')}</small></h3>
        <div class="sb-dice">${dice.map((v, i) => `<button class="sb-die" data-act="run-sbdie" data-i="${i}">${miniDie(v)}<b>${v}</b></button>`).join('')}</div>
        <div class="sb-row">${chip('run-sbx', 'rolls', false, TR('굴림 +1'))}${chip('run-sbx', 'hex', false, TR('방해 · 약화 풀기'))}${chip('run-sbx', 'foe999', false, TR('적 체력 999'))}${chip('run-sbx', 'foe1', false, TR('적 체력 1'))}</div>
        <h3>${TR('손패 점수 계산')}</h3>
        ${C.hand.map((c, hi) => {
          if (!C.rolled) return `<div class="sb-score"><b>${esc(Run.cardName(c))}</b><span class="dim">${TR('굴린 뒤에 계산')}</span></div>`;
          const sc = Run.scoreCard(R, c), a = Run.preview(R, hi, 'enemy', sc), d = Run.preview(R, hi, 'self', sc);
          return `<div class="sb-score"><b>${esc(Run.cardName(c))}${c.seal ? ` ${sealIco(c.seal)}` : ''}</b>
            <ol><li>${TR('기본 점수')} <em>${sc.base}</em></li>${sc.parts.map(p => `<li class="${p.mul ? 'mul' : ''}">${esc(p.ko)} <em>${p.amt > 0 ? '+' : ''}${p.amt}</em>${p.mul ? ` <small>${TR('곱')}</small>` : ''}</li>`).join('')}${sc.notes.map(n => `<li class="note">${esc(n)}</li>`).join('')}</ol>
            <p class="sb-tot">= <b>${sc.total}</b> ${TR('· {0}피해 {1}{2} · {3}전부 방어 {4}', ico('sword', 'xs'), a.dmg, a.gold ? ` · ${ico('coins', 'xs')}${a.gold}` : '', ico('shield', 'xs'), d.block)}</p></div>`;
        }).join('')}`;
    }
  } else if (sb.tab === 'relic') {
    const grp = [[1, TR('일반')], [2, TR('희귀')], [3, TR('보스')]];
    body = `<p class="dim">${TR('눌러서 넣고 빼기 · 가진 유물 {0}개', R.relics.length)}</p>${grp.map(([r, ko]) => `<h3>${ko}</h3><div class="sb-grid">${Run.RELICS.filter(x => x.r === r).map(x => `<button class="sb-relic${Run.hasRelic(R, x.id) ? ' on' : ''}" data-act="run-sbrelic" data-v="${x.id}" title="${esc(x.desc)}">${relicIco(x, 'xs')}<span>${esc(x.ko)}</span></button>`).join('')}</div>`).join('')}`;
  } else if (sb.tab === 'card') {
    const preview = { u: -7, cat: sb.cat, up: sb.up, kws: sb.kws, seal: sb.seal || null };
    body = `<h3>${TR('족보')}</h3><div class="sb-row">${[...Run.SAME_CATS_ALL, ...Run.FUTURE_CATS].map(c => chip('run-sbcat', c, sb.cat === c, esc(Run.cardTitle(c)))).join('')}</div>
      <h3>${TR('효과')} <small>${TR('3개까지')}</small></h3><div class="sb-row">${Run.KW_IDS.map(k => chip('run-sbkw', k, sb.kws.includes(k), `${runIco('kw', k, Run.KEYWORDS[k].icon, 'xs')}${Run.KEYWORDS[k].ko}`)).join('')}</div>
      <h3>${TR('강화 · 인장')}</h3><div class="sb-row">${chip('run-sbup', 1, sb.up, TR('강화 +'))}${chip('run-sbseal', '', !sb.seal, TR('인장 없음'))}${Run.SEAL_IDS.map(id => chip('run-sbseal', id, sb.seal === id, `${sealIco(id)}${Run.sealInfo(id).ko}`)).join('')}</div>
      <div class="sb-make"><div class="rc rc-static">${cardFace(preview)}</div><div class="sb-col">
        <button class="pbtn small gold" data-act="run-sbadd" data-v="deck">${TR('덱에 넣기')}</button>
        ${C ? `<button class="pbtn small" data-act="run-sbadd" data-v="hand">${TR('손패에 바로 넣기')}</button>` : ''}</div></div>
      <h3>${TR('내 덱')} <small>${TR('{0}장 · 눌러서 빼기', R.deck.length)}</small></h3>
      <div class="deck-grid">${Run.deckCards(R).map(c => `<button class="rc rc-static mini sb-del" data-act="run-sbdel" data-v="${c.u}">${cardFace(c)}</button>`).join('')}</div>`;
  } else if (sb.tab === 'item') {
    body = `<h3>${TR('물약')} <small>${R.potions.length}/${Run.POTION_SLOTS}</small></h3><div class="sb-row">${Run.POTIONS.map(p => chip('run-sbpot', p.id, false, `${runIco('potion', p.id, p.icon, 'xs')}${p.ko}`)).join('')}${chip('run-sbx', 'nopot', false, TR('물약 비우기'))}</div>
      <h3>${TR('자원')}</h3><div class="sb-row">${chip('run-sbx', 'gold', false, TR('{0}골드 +100', ico('coins', 'xs')))}${chip('run-sbx', 'flip', false, TR('{0}뒤집기 +1', ico('flip', 'xs')))}${chip('run-sbx', 'nudge', false, TR('{0}조정 +1', ico('nudge', 'xs')))}${R.cls === 'dancer' ? chip('run-sbx', 'dance', false, TR('춤사위 +1')) : ''}${chip('run-sbx', 'hp', false, TR('{0}체력 가득', ico('heart', 'xs')))}${chip('run-sbx', 'maxhp', false, TR('최대 체력 +10'))}${chip('run-sbx', 'rrshop', false, TR('{0}상점 새로고침 +1 ({1})', ico('recycle', 'xs'), Run.rrOf(R).shop))}${chip('run-sbx', 'rrpick', false, TR('{0}카드 · 유물 새로고침 +1 ({1})', ico('recycle', 'xs'), Run.rrOf(R).pick))}</div>
      <h3>${TR('무적')}</h3><div class="sb-row">${chip('run-sbx', 'god', R.sbGod, R.sbGod ? TR('무적 켜짐 (체력 1 아래로 안 내려감)') : TR('무적 끄기 상태 · 눌러서 켜기'))}</div>`;
  } else if (sb.tab === 'foe') {
    prefetchBgm('boss_jester');   // 히든 보스 곡 (고르기 전에 받아 둔다)
    const kinds = [['normal', TR('일반')], ['elite', TR('엘리트')], ['boss', TR('보스')], ['special', TR('히든 보스')]];
    body = `<p class="dim">${TR('고르면 바로 싸워요. 이기면 보상을 받고 지도로 돌아와요 (막 · 층 그대로). 적 체력은 지금 막({0}막) 기준.', R.act)}</p>
      <div class="sb-row">${[1, 2, 3].map(n => chip('run-sbact', n, R.act === n, TR('{0}막', n))).join('')}</div>
      ${kinds.map(([k, ko]) => `<h3>${ko}</h3><div class="sb-grid foes">${Object.entries(Run.ENEMIES).filter(([, e]) => e.kind === k).map(([id, e]) => `<button class="sb-foe" data-act="run-sbfoe" data-v="${id}"><img src="${foeURL(id)}" alt=""><span>${esc(e.ko)}</span><small>${e.act ? TR('{0}막', e.act) : TR('1 · 2막')}</small></button>`).join('')}</div>`).join('')}`;
  } else if (sb.tab === 'event') {
    body = `<p class="dim">${TR('눌러서 그 이벤트로 바로 가기')}</p><div class="sb-grid events">${Run.EVENTS.map(e => `<button class="sb-ev" data-act="run-sbevent" data-v="${e.id}">${sceneURL(e.id) ? `<img src="${sceneURL(e.id)}" alt="">` : ico(e.art, 'lg')}<span>${esc(e.ko)}</span></button>`).join('')}</div>`;
  } else if (sb.tab === 'omen') {
    body = `<div class="sb-col">${chip('run-sbomen', '', !R.omen, TR('징조 없음'))}${Run.OMENS.map(o => chip('run-sbomen', o.id, R.omen === o.id, `${omenIco(o, 'xs')}<b>${o.ko}</b> <small>${esc(o.desc)}</small>`)).join('')}</div>`;
  }
  X.layer.innerHTML = `<div class="overlay run-sb" data-act="close-bg"><div class="deck-box sb-box" data-act="noop">
    <h2>${TR('시험 원정 · 샌드박스')}</h2>
    <div class="sb-tabs">${SB_TABS.map(([id, ko]) => `<button class="sb-tab${sb.tab === id ? ' on' : ''}" data-act="run-sbtab" data-v="${id}">${ko}</button>`).join('')}</div>
    <div class="sb-body">${body}</div>
    <div class="pick-actions"><button class="pbtn small" data-act="run-sbclose">${TR('닫기')}</button></div>
  </div></div>`;  // 유물을 길게 누르면 설명 (짧게 누르면 넣고 빼기)
  X.layer.querySelectorAll('.sb-relic').forEach(el => longPress(el, () => { const x = Run.relicInfo(el.dataset.v); X.popover(el, `<b>${relicIco(x, 'xs')} ${esc(x.ko)}</b> <small>${['', TR('일반'), TR('희귀'), TR('보스')][x.r] || ''}</small><p>${esc(x.desc)}</p>`, { afterRelease: true }); }));
}
// 샌드박스에서 판을 바꾼 뒤 화면을 다시 그린다 (전투면 손패 · 주사위까지)
function sbRefresh(panel = true) {
  save();
  if (R.phase === 'combat' && hand && R.C) { hand.set(R.C.hand, 'instant'); paint(); if (R.C.rolled) X.tray()?.show(R.C.dice, R.C.held); }
  else if (R.phase !== 'combat') enterView();
  if (panel) showSandbox();
}
function sbAct(act, t) {
  const sb = sbState(), v = t.dataset.v, S = Run.sandbox;
  const run = fn => { try { fn(); } catch (e) { X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); return false; } drain(); return true; };
  sfx.tap();
  if (act === 'run-sb') { sfx.select(); return showSandbox(); }
  if (act === 'run-sbclose') { X.layer.innerHTML = ''; return sbRefresh(false); }
  if (act === 'run-sbtab') { sb.tab = v; return showSandbox(); }
  if (act === 'run-sbcat') { sb.cat = v; return showSandbox(); }
  if (act === 'run-sbkw') { sb.kws = sb.kws.includes(v) ? sb.kws.filter(k => k !== v) : sb.kws.length < Run.KW_MAX ? [...sb.kws, v] : sb.kws; return showSandbox(); }
  if (act === 'run-sbup') { sb.up = sb.up ? 0 : 1; return showSandbox(); }
  if (act === 'run-sbseal') { sb.seal = v; return showSandbox(); }
  if (act === 'run-sbadd') { if (run(() => S.card(R, sb, v === 'hand'))) X.toast(ico('card'), TR('카드를 넣었어요'), v === 'hand' ? TR('손패 · 덱') : TR('덱'), 900); return sbRefresh(); }
  if (act === 'run-sbdel') { run(() => S.removeCard(R, Number(v))); return sbRefresh(); }
  if (act === 'run-sbrelic') { run(() => S.relic(R, v)); return sbRefresh(); }
  if (act === 'run-sbpot') { run(() => S.potion(R, v)); return sbRefresh(); }
  if (act === 'run-sbomen') { run(() => S.omen(R, v)); return sbRefresh(); }
  if (act === 'run-sbact') { run(() => S.act(R, Number(v))); return sbRefresh(); }
  if (act === 'run-sbdie') { const i = Number(t.dataset.i); run(() => S.dice(R, i, R.C.dice[i] % 6 + 1)); return sbRefresh(); }
  if (act === 'run-sbx') {
    const f = { rolls: () => S.rolls(R, 1), hex: () => S.clearHex(R), foe999: () => S.foeHp(R, 999), foe1: () => S.foeHp(R, 1), nopot: () => S.clearPotions(R),
      gold: () => S.res(R, 'gold', 100), flip: () => S.res(R, 'flip', 1), nudge: () => S.res(R, 'nudge', 1), dance: () => S.res(R, 'dance', 1),
      hp: () => S.res(R, 'hp'), maxhp: () => S.res(R, 'maxHp', 10), rrshop: () => S.res(R, 'rrshop', 1), rrpick: () => S.res(R, 'rrpick', 1), god: () => S.god(R, !R.sbGod) }[v];
    if (f) run(f);
    return sbRefresh();
  }
  if (act === 'run-sbevent') {
    if (!run(() => S.event(R, v))) return;
    save();
    X.layer.innerHTML = '';
    hand?.destroy(); hand = null;
    return enterView(true);
  }
  if (act === 'run-sbfoe') {
    if (!run(() => S.fight(R, v))) return;
    save();
    X.layer.innerHTML = '';
    ui.sb.tab = 'score';
    const kind = Run.ENEMIES[v].kind;
    const song = kind === 'boss' ? bossSong(v) : kind === 'special' ? 'boss_jester' : kind === 'elite' ? 'run_elite' : 'run_battle';
    const opening = drain().filter(f => ['hex', 'gaze', 'facedown', 'jestCard', 'rent'].includes(f.type));
    if (kind === 'special') opening.unshift({ type: 'jesterIn' });
    if (opening.length) { ui.openFx = opening; ui.hideGaze = true; }
    return Promise.all([Promise.race([preloadBgm(song), wait(3000)]), X.stageReady(), kind === 'boss' && Promise.race([loadBossMotion(R.C.e.id, true), wait(6000)]), kind === 'special' && holoWarp(1400)]).then(() => enterView(true));
  }
}

// }@test-only
// ── 결과 ─────────────────────────────────────────────────────────────────────
function showEnd() {
  hand?.destroy(); hand = null;
  if (!R.trial) tourRunEnded();
  const won = R.won;
  const fresh = !ui.recorded;
  if (!ui.recorded) {
    // 기록 · 별조각 (배포판: 서버가 행동 기록을 다시 돌려 계산 — 받을 때까지 기다린다)
    const r0 = R;
    ui.recorded = Prog.finishRun(R).then(out => { if (R !== r0) return; ui.end = out; syncFeats(out.fresh); paintEnd(true); });
    ui.end = null;
  }
  X.store.del(SAVE);
  paintEnd(false);
  if (fresh && !R.trial) track('run_end', { won: won ? 1 : 0, cls: R.cls, asc: R.asc || 0, act: R.act, floor: Run.floorOf(R), turns: R.stats.turns });
  if (fresh) {
    playBgm(won ? 'run_win' : 'run_lose');
    if (won && X.prefs.fx !== 'min') { FX().burst(innerWidth / 2, innerHeight * 0.3, { n: 90, pal: PALETTES.rainbow, speed: [100, 420] }); sfx.levelup?.(); winFireworks(); }
  }
}
// 원정 성공: 몇 초 동안 화면 여기저기서 폭죽이 터진다 (결과 화면을 떠나면 멈춘다)
function winFireworks() {
  const pals = [PALETTES.gold, PALETTES.rainbow, PALETTES.arcane, PALETTES.fire];
  for (let i = 0; i < 9; i++) setTimeout(() => {
    if (!X.app.querySelector('.run-end.won')) return;
    const x = innerWidth * (0.15 + Math.random() * 0.7), y = innerHeight * (0.12 + Math.random() * 0.3);
    FX().burst(x, y, { n: 50, pal: pals[i % pals.length], speed: [80, 300], life: [0.5, 1.1], grav: 160 });
    if (i % 3 === 0) sfx.boom?.(0.5);
  }, 500 + i * 650);
}
// 숫자를 0에서 차르륵 올린다 (처음 그릴 때만)
function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el, k) => {
    const to = Number(el.dataset.count) || 0, t0 = performance.now() + 250 + k * 120, dur = 900;
    el.textContent = '0';
    const step = now => {
      if (!el.isConnected) return;
      const p = Math.max(0, Math.min(1, (now - t0) / dur));
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function paintEnd(arrived) {
  const won = R.won, out = ui.end;
  const opened = !!out?.opened;
  const stars = !out ? `<p class="end-stars wait">${TR('{0} 별조각 계산 중…', starIco())}</p>`
    : out.error ? `<p class="end-stars off">${TR('{0} 기록을 저장하지 못했어요', ico('warn', 'xs'))}</p>`
    : out.offline ? `<p class="end-stars off">${TR('{0} 오프라인 원정 · 별조각 없음', starIco())}</p>`
    : `<p class="end-stars">${TR('{0} 별조각', starIco())} <b>+${out.stars || 0}</b>${out.gems ? ` ${TR('&nbsp; {0} 보석', ico('gem', 'xs'))} <b>+${out.gems}</b>` : ''}</p>`;
  const st = R.stats;
  // 별조각 결과가 늦게 와서 다시 그릴 때는 등장 연출을 되풀이하지 않는다 (곧바로 오면 그대로)
  const again = !!X.app.querySelector('.run-end') && performance.now() - (ui.endAt || 0) > 1200;
  if (!X.app.querySelector('.run-end')) ui.endAt = performance.now();
  const confetti = won ? `<div class="end-confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 0.29) % 3.2}s;--s:${3.2 + (i % 5) * 0.5}s;--c:${['#FFC83D', '#FF5A6A', '#3EE6B4', '#4FB3FF', '#B98CFF', '#FFFFFF'][i % 6]};--r:${(i * 53) % 360}deg"></i>`).join('')}</div>` : '';
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-end ${won ? 'won' : 'lost'}${again ? ' again' : ''}">
    ${won ? `<div class="end-glow" aria-hidden="true"><i class="end-rays"></i></div>${confetti}` : ''}
    <div class="end-box">
      ${won ? `<div class="end-ribbon"><span>${TR('승리⟪배너⟫')}</span></div>` : ''}
      <h1>${won ? TR('원정 성공!') : TR('원정 실패')}</h1>
      <div class="end-hero">${won ? `<i class="end-crown">${ico('crown')}</i>` : ''}${hero(R.cls)}${won ? '<i class="end-podium"></i>' : ''}<b>${esc(classInfo(R.cls).ko)}</b><small>${won ? TR('마왕을 쓰러뜨리고 돌아왔다!') : TR('{0}막 {1}층에서 쓰러졌다', R.act, Math.min(Run.ROWS + 1, Run.floorOf(R)))}</small></div>
      <div class="end-stats">
        <span><b data-count="${st.fights}">${st.fights}</b>${TR('일반')}</span><span><b data-count="${st.elites}">${st.elites}</b>${TR('엘리트')}</span><span><b data-count="${st.bosses}">${st.bosses}</b>${TR('보스')}</span>
        <span><b data-count="${st.dmg}">${st.dmg}</b>${TR('준 피해')}</span><span><b data-count="${st.maxHit}">${st.maxHit}</b>${TR('최고 한 방')}</span><span><b data-count="${st.turns}">${st.turns}</b>${TR('턴')}</span>
      </div>
      <div class="end-relics">${R.relics.map((id, k) => `<span style="--k:${k}">${relicIco(Run.relicInfo(id))}</span>`).join('')}</div>
      <p class="hint">${TR('{0}덱 {1}장 · 골드 {2} 획득', R.asc ? `${TR('하드모드 {0} ·', R.asc)} ` : '', R.deck.length, st.gold)}</p>
      ${stars}
      ${opened ? `<p class="asc-open">${TR('{0} {1} 하드모드 {2} 열림!', ico('up', 'xs'), esc(classInfo(R.cls).ko), (R.asc || 0) + 1)}</p>` : ''}
      <div class="res-actions"><button class="pbtn" data-act="run-home">${TR('메인으로')}</button><button class="pbtn gold" data-act="run-again">${TR('다시 원정')}</button></div>
    </div>
  </div>`;
  if (!again && won && X.prefs.fx !== 'min') countUp(X.app.querySelector('.end-stats'));
  if (arrived && out?.stars) setTimeout(() => sfx.stars?.(out.stars), won ? 1100 : 600);
  if (arrived && opened) setTimeout(() => sfx.ascend?.(), 2000);
}

// ── 메뉴 ─────────────────────────────────────────────────────────────────────
function showMenu() {
  X.layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>${TR('원정 일시정지')}</h2>
    <p class="hint">${TR('{0}막 · {1} · 체력 {2}/{3}', R.act, esc(Run.ACT_INFO[R.act].ko), R.hp, R.maxHp)}</p>
    <div class="modal-actions">
      <button class="pbtn gold" data-act="close">${TR('계속하기')}</button>
      <button class="pbtn" data-act="run-deck">${TR('덱 보기')}</button>${''/*TEST{*/ + (R.trial ? `
      <button class="pbtn" data-act="run-sb">${TR('샌드박스')}</button>` : '')/*}TEST*/}
      <button class="pbtn" data-act="settings">${TR('설정')}</button>
      <button class="pbtn" data-act="run-tourre">${TR('안내 다시 보기')}</button>
      <button class="pbtn" data-act="run-home">${TR('메인 메뉴로')}</button>
      <button class="pbtn danger" data-act="run-giveup">${TR('원정 포기')}</button>
    </div>
  </div></div>`;
}

// ── 행동 받기 ────────────────────────────────────────────────────────────────
export function onAct(act, t) {
  const now = performance.now();
  if (act === 'run-open') { sfx.select(); return open(); }
  if (act === 'run-resume') { sfx.start(); return resume(); }
  if (act === 'run-home') { sfx.back(); X.tray()?.setMarks?.(null); X.tray()?.setCustom?.(null); hand?.destroy(); hand = null; R = null; ui.recorded = false; X.layer.innerHTML = ''; return X.showTitle(); }
  if (act === 'run-cls') {
    sfx.tap(); ui.cls = t.dataset.id; ui.spin = { d: Number(t.dataset.d) || 0, t: Date.now() }; X.store.set('diceheroes.runCls', ui.cls);
    paintSelect();
    return;
  }
  if (act === 'run-talk') { sfx.tap(); t.classList.remove('talk'); void t.offsetWidth; t.classList.add('talk'); return; }   // 직업 대사는 뺐다 (살짝 들썩이기만)
  // 원정 떠나기: 하드모드가 열렸으면 단계를 고르는 창, 아니면 바로 출발
  if (act === 'run-unlock') {          // 보석으로 원정 직업 사기 (app.js 의 buy 가 받는다)
    const id = t.dataset.id, price = X.runPrice(id), c = classInfo(id);
    sfx.select();
    X.layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame buy-cls" data-act="noop" style="--c:${c.color}">
      <h2>${TR('원정 {0} 해금', c.ko)}</h2>
      <p>${esc(Run.RUN_CLASSES[id].desc)}</p>
      <p class="hint">${TR('보유 {0}{1} · 원정에서만 쓰는 직업이에요 (대전 직업과 따로)', ico('gem', 'xs'), X.gems().toLocaleString())}</p>
      <div class="modal-actions"><button class="pbtn" data-act="close">${TR('취소')}</button>
        <button class="pbtn gold" data-act="buy" data-kind="run" data-id="${id}" ${X.gems() < price ? 'disabled' : ''}>${TR('{0} {1}에 해금', ico('gem', 'xs'), price.toLocaleString())}</button></div>
    </div></div>`;
    return;
  }
  if (act === 'run-go') {
    if (!runOpen(ui.cls)) return; if (!ascOpen(best(), ui.cls)) return onAct('run-start', t); sfx.select(); return showAsc(); }
  if (act === 'run-ascopen') { sfx.select(); return showAsc(); }
  if (act === 'run-asc' || act === 'run-ascset') {
    const b = best(), want = act === 'run-asc' ? (ui.asc || 0) + Number(t.dataset.d) : Number(t.dataset.v);
    const v = Math.max(0, Math.min(ascOpen(b, ui.cls), want));
    if (v === ui.asc && act === 'run-ascset') return;
    X.store.set('diceheroes.runAsc', { ...(X.store.get('diceheroes.runAsc') || {}), [ui.cls]: v });
    sfx.select();
    paintSelect();                       // 버튼 · 떠나기 문구를 바꾸고 (창을 지운다)
    return showAsc();
  }
  if (act === 'run-feats') { sfx.select(); return showFeats(); }
  if (act === 'run-meta') { sfx.select(); return showMeta(); }
  if (act === 'run-metaitem') return metaItemTip(t, t.dataset.id);
  if (act === 'run-metaclose') { sfx.back(); return X.closePopover(); }
  if (act === 'run-metabuy') { X.closePopover?.(); return metaAct(act, t.dataset.id); }
  if (act === 'run-trial' && PROD) return;   // 시험 원정(샌드박스)은 테스트판만 (배포판 빌드는 시험 원정 코드를 잘라낸다)
  if (act === 'run-start' || act === 'run-again' || act === 'run-trial') {
    sfx.start();
    const trial = act === 'run-trial' || (act === 'run-again' && R?.trial);
    const cls = act === 'run-again' ? R?.cls || ui.cls : ui.cls;
    const lv = act === 'run-again' && R ? R.asc || 0 : ui.asc || 0;
    if (ui.starting) return;
    // 입장권 1장 (시험 원정은 무료). 없으면 입장권 창 → 받으면 이어서 출발
    if (!trial && !t?.dataset?.tixOk) return X.ticketGate(() => onAct(act, { dataset: { ...(t?.dataset || {}), tixOk: '1' } }));
    ui.starting = true;
    // 배포판은 서버가 시드를 정하고 그때의 원정 준비를 적어 둔다 (끝날 때 행동 기록을 다시 돌려 맞춰 본다)
    return Prog.startRun(cls, lv).then(s => {
      if (s.noTicket) return X.ticketShop(() => onAct(act, t));   // 서버에서 입장권이 모자랐다
      if (!trial && !s.offline) X.ticketUsed(s.tix);
      if (!trial) track('run_start', { cls, asc: lv, again: act === 'run-again' ? 1 : 0 });
      R = Run.createRun({ cls, name: X.name(), asc: lv, seed: s.seed, meta: s.meta });
      R.xid = s.id;
// @test-only{
      if (trial) Run.trialKit(R);          // 시험 원정: 에이스 · 듀스 · 트레이 + 회귀자의 망토 · 세포배양관 · 프리즘
// }@test-only
      ui.recorded = false; ui.end = null; ui.featShown.clear();
      save();
      const r0 = R;
      return preloadRun().then(() => {
        if (R !== r0) return;
        enterView(true);
        const sealed = R.deck.filter(c => c.seal);           // 영구 강화 「인장 상자」: 출발할 때 붙은 인장
        if (sealed.length) stampShow(sealed, TR('{0} 인장 상자', ico('sparkle', 'xs')));
      });   // 다 받은 뒤 지도로 (보물 지도가 있으면 출발 유물부터)
    }).finally(() => { ui.starting = false; });   // 다 받은 뒤 지도로 (보물 지도가 있으면 출발 유물부터)
  }
  if (!R) return;
  if (act === 'run-menu') { sfx.select(); return showMenu(); }
// @test-only{
  if (act.startsWith('run-sb')) return R.trial ? sbAct(act, t) : undefined;
// }@test-only
  if (act === 'run-tourre') { sfx.select(); replayTours(); X.layer.innerHTML = ''; X.toast?.(ico('scroll'), TR('안내를 다시 보여 줄게요'), TR('화면마다 처음 볼 때 한 번씩'), 1800); return enterView(); }
  if (act === 'run-giveup') {
    if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = TR('한 번 더 누르면 포기해요'); sfx.select(); return; }
    if (!R.trial) track('run_giveup', { act: R.act, floor: Run.floorOf(R) });
    try { Run.giveUp(R); } catch { /* 이미 끝남 */ }
    X.layer.innerHTML = '';
    return showEnd();
  }
  if (act === 'run-deck') { sfx.select(); return showDeck(); }
  if (act === 'run-skill') { const ci = Run.RUN_CLASSES[R.cls]; sfx.tap(); return X.popover(t, `<b>${ico('star', 'xs')} ${ci.skill}</b><p>${esc(ci.desc)}</p>`); }
  if (act === 'run-relic') { const r = Run.relicInfo(t.dataset.id); sfx.tap(); return X.popover(t, `<b>${relicIco(r, 'xs')} ${r.ko}</b> <small>${['', TR('일반'), TR('희귀'), TR('보스')][r.r]}</small><p>${r.desc}</p>${t.dataset.rent ? `<p class="rent-note">${TR('유물 대여 중 · 대여 카드가 손패를 떠나면 돌려준다')}</p>` : ''}`); }
  if (act === 'run-pot') return potionMenu(Number(t.dataset.k), t);
  if (act === 'run-potuse') return usePotion(Number(t.dataset.k));
  if (act === 'run-potdrop') { X.closePopover(); Run.dropPotion(R, Number(t.dataset.k)); save(); sfx.back(); return R.phase === 'combat' ? paint() : enterView(); }
  // 지도
  // 이벤트 중 지도 잠깐 보기 (보기만 — 칸은 누를 수 없다)
  if (act === 'run-peekmap') { if (R.phase !== 'event') return; sfx.select(); ui.peek = true; return showMap(); }
  if (act === 'run-peekback') { sfx.back(); ui.peek = false; return R.phase === 'event' ? showEvent() : enterView(); }
  if (act === 'run-node') {
    if (ui.peek) return;
    if (R.phase !== 'map') return;
    const id = Number(t.dataset.id);
    if (!Run.nextNodes(R).includes(id)) {         // 못 가는 칸: 무슨 칸인지만 알려 준다
      const ty = Run.mapNode(R, id).type, nd = Run.NODE[ty];
      sfx.tap();
      return X.popover(t, `<b>${ty === 'boss' ? '' : `${runIco('node', ty, nd.icon, 'xs')} `}${nd.ko}${ty === 'boss' && R.act < Run.ACTS ? ' ???' : ''}</b>`);
    }
    sfx.start();
    try { Run.enterNode(R, id); } catch (e) { return X.toast(ico('warn'), TR('갈 수 없어요'), e.message, 1400); }
    // 첫 턴 방해(응시 등)는 전투 화면이 뜨고 적이 등장한 뒤에 연출한다 (예전엔 여기서 버려져 손패에 응시만 덩그러니 걸려 있었다)
    const opening = drain().filter(f => ['hex', 'gaze', 'jesterIn', 'facedown', 'jestCard', 'rent'].includes(f.type));
    if (R.phase === 'combat' && opening.length) { ui.openFx = opening; ui.hideGaze = true; }
    save();
    t.classList.add('go');
    // 전투 칸: 그 곡이 준비될 때까지 (최대 3초) 기다렸다가 들어간다 (시공 광대가 끼어들면 광대 곡)
    const ty = R.phase === 'combat' && R.C?.e.id === 'jester' ? 'jester' : Run.mapNode(R, id).type;
    const song = ty === 'boss' ? bossSong(R.boss) : ty === 'jester' ? 'boss_jester' : ty === 'elite' ? 'run_elite' : ty === 'fight' ? 'run_battle' : null;
    const ready = song ? Promise.race([preloadBgm(song), wait(3000)]) : null;
    const jest = R.phase === 'combat' && R.C?.e.id === 'jester';   // 히든 보스: 화면이 홀로그램으로 일렁인 뒤 보스전으로
    const bossMo = ty === 'boss' ? Promise.race([loadBossMotion(R.boss, true), wait(6000)]) : null;   // 보스 모션 시트 (대개 지도에서 이미 받아 둠)
    return Promise.all([ready, bossMo, wait(260), song && X.stageReady(), jest && holoWarp(1400)]).then(() => enterView(true));
  }
  // 보상
  if (act === 'run-take') return takeItem(Number(t.dataset.k));
  if (act === 'run-cardpick') return cardPick(Number(t.dataset.k));
  if (act === 'run-cardtake') return cardTake(Number(t.dataset.i));
  if (act === 'run-cardskip') { Run.takeReward(R, ui.cardPick, -1); drain(); ui.cardPick = null; sfx.back(); X.layer.innerHTML = ''; save(); return showReward(); }
  if (act === 'run-relicpick') return relicPick(Number(t.dataset.k));
  // 새로고침: 카드 · 유물 고르기 후보 / 상점 물건을 새로 (남은 횟수 1 소모)
  if (act === 'run-repick') {
    const k = Number(t.dataset.k), it = R.reward?.items[k];
    try { Run.rerollPick(R, k); } catch (e) { return X.toast(ico('warn'), TR('새로고침할 수 없어요'), e.message, 1400); }
    drain(); save(); sfx.card(); sfx.whoosh?.();
    X.layer.querySelectorAll('.pick-cards .rc, .relic-card').forEach(el => el.classList.add('reroll-out'));
    return wait(220).then(() => (it.t === 'card' ? cardPick(k) : relicPick(k)));
  }
  if (act === 'run-reshop') {
    try { Run.rerollShop(R); } catch (e) { return X.toast(ico('warn'), TR('새로고침할 수 없어요'), e.message, 1400); }
    drain(); save(); sfx.whoosh?.(); sfx.coin();
    X.app.querySelectorAll('.shelf-item').forEach(el => el.classList.add('reroll-out'));
    return wait(220).then(() => { showShop(); X.app.querySelectorAll('.shelf-item').forEach((el, i) => { el.classList.add('reroll-in'); el.style.animationDelay = `${i * 30}ms`; }); });
  }
  if (act === 'run-relictake' || act === 'run-relicskip') {
    Run.takeReward(R, ui.relicPick, act === 'run-relicskip' ? -1 : Number(t.dataset.i));
    drain();
    ui.relicPick = null;
    act === 'run-relictake' ? sfx.legend() : sfx.back();
    X.layer.innerHTML = ''; save();
    return showReward();
  }
  if (act === 'run-leave') {
    if (now - ui.last < 400) return;
    ui.last = now;
    const left = R.reward?.items.filter(it => !it.done && (it.t === 'card' || it.t === 'relicPick' || it.t === 'relic')).length;
    if (left && !t.dataset.sure) { t.dataset.sure = '1'; t.textContent = TR('받지 않은 보상이 있어요 · 한 번 더 누르면 떠나요'); sfx.select(); return; }
    sfx.start();
    const boss = R.reward?.kind === 'boss', jest = R.reward?.kind === 'special';
    Run.leaveReward(R);
    const fx = drain();
    save();
    if (jest) return enterAfterJester(fx);
    if (boss && R.phase === 'map') return actBanner(fx.find(f => f.type === 'act'));
    return enterView();
  }
  // 상점
  // 주사위 깎는 노인
  if (act === 'run-yroll') {
    if (ui.yRoll) return;
    ui.yRoll = true; sfx.shake?.(); showEvent();
    const spin = setInterval(() => X.app.querySelectorAll('.ev-dice.yacht .dd-die:not(.held)').forEach(e => { e.innerHTML = miniDie(1 + Math.floor(Math.random() * 6)); }), 90);
    return wait(600).then(() => {
      clearInterval(spin); ui.yRoll = false;
      try { Run.eventRoll(R); } catch (e) { return X.toast(ico('warn'), TR('굴릴 수 없어요'), e.message, 1400); }
      Run.drainFx(R); sfx.clack?.(); save();
      if (R.pick?.why === 'face') ui.carveIntro = true;        // 마지막 굴림이었다 → 결과 창부터
      ui.ySumPop = true;                                       // 굴릴 때마다 주사위 합이 크게 톡
      showEvent(true);
      ui.ySumPop = false;
    });
  }
  if (act === 'run-yhold') { try { Run.eventHold(R, Number(t.dataset.i)); } catch { return; } sfx.tap(); save(); return showEvent(true); }
  if (act === 'run-ystop') { try { Run.eventStop(R); } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); } Run.drainFx(R); sfx.select(); save(); ui.carveIntro = true; return showEvent(true); }
  if (act === 'run-carvego') { sfx.tap(); ui.carveIntro = false; return showCarve(); }
  if (act === 'run-cface') { sfx.tap(); ui.carve = { i: Number(t.dataset.i), f: Number(t.dataset.f) }; return showCarve(); }
  if (act === 'run-cval') {
    const c = ui.carve;
    if (!c) return;
    try { Run.carveFace(R, c.i, c.f, Number(t.dataset.v)); } catch (e) { return X.toast(ico('warn'), TR('깎을 수 없어요'), e.message, 1400); }
    Run.drainFx(R); sfx.forge?.(); ui.carve = null; save();
    if (R.pick?.why === 'face') return showCarve();
    X.layer.innerHTML = '';
    return showEvent(true);
  }
  if (act === 'run-omen') {
    try { Run.chooseOmen(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), TR('고를 수 없어요'), e.message, 1400); }
    drain(); sfx.ascend?.(); save();
    const o = Run.omenInfo(R.omen);
    X.layer.innerHTML = '';
    showMap();
    return X.toast(omenIco(o), TR('{0}막 징조 · {1}', R.act, o.ko), omenText(o), 2200);
  }
  if (act === 'run-closepop') { sfx.back(); return X.closePopover(); }
  if (act === 'run-omeninfo') { const o = Run.omenInfo(R.omen); sfx.tap(); return X.popover(t, `<b>${omenIco(o, 'xs')} ${o.ko}</b><p>${omenText(o)}</p>`); }
  if (act === 'run-buy') {
    // 짧게 누르면: 설명 + 구매 / 취소. 구매를 누르면 산다
    if (!t.dataset.ok) {
      const list = { card: R.shop.cards, relic: R.shop.relics, potion: R.shop.potions, tool: R.shop.tools, seal: R.shop.seals || [] }[t.dataset.kind];
      const it = list?.[Number(t.dataset.i)];
      if (!it || it.sold) return;
      sfx.tap();
      const poor = R.gold < it.price;
      return X.popover(t, `${ui.shopTips?.[t.dataset.ti] || ''}<div class="buy-btns"><button class="hb" data-act="run-closepop">${TR('취소')}</button><button class="hb gold" data-act="run-buy" data-kind="${t.dataset.kind}" data-i="${t.dataset.i}" data-ok="1" ${poor ? 'disabled' : ''}>${TR('{0}{1} 구매', ico('coins', 'xs'), it.price)}</button></div>`);
    }
    X.closePopover();
    if (t.dataset.kind === 'seal') {
      try { Run.buy(R, 'seal', Number(t.dataset.i)); } catch (e) { sfx.back(); return X.toast(ico('warn'), TR('살 수 없어요'), e.message, 1400); }
      sfx.select(); ui.pickU = null;
      const sl = Run.sealInfo(R.pick.seal);
      X.toast(sealIco(R.pick.seal, ''), TR('{0} · 붙일 카드를 고르세요', sl.ko), sl.desc, 1800);
      return showPick();
    }
    try { Run.buy(R, t.dataset.kind, Number(t.dataset.i)); } catch (e) { sfx.back(); return X.toast(ico('warn'), TR('살 수 없어요'), e.message, 1400); }
    drain(); sfx.coin(); save();
    const p = center(t); FX().burst(p.x, p.y, { n: 24, pal: PALETTES.gold });
    return showShop();
  }
  if (act === 'run-remove') { try { Run.startRemove(R); } catch (e) { sfx.back(); return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1500); } sfx.select(); ui.pickU = null; return showPick(); }
  if (act === 'run-shopleave') { sfx.back(); Run.leaveShop(R); save(); return showMap(); }
  // 휴식
  if (act === 'run-rest') {
    const p = center($('campfire'));
    Run.restHeal(R); drain(); save();
    sfx.quest?.(); FX().burst(p.x, p.y, { n: 40, pal: PALETTES.heal, grav: -80 });
    return setTimeout(showMap, 700);
  }
  if (act === 'run-upopt') {
    const pk = R.pick, from = pk?.from;
    try { Run.chooseUpgrade(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); }
    drain();
    sfx.legend?.();
    const p = center(t); FX().burst(p.x, p.y, { n: 36, pal: PALETTES.gold });
    X.layer.innerHTML = ''; save();
    return from === 'shop' ? showShop() : enterView();
  }
  if (act === 'run-shopsmith') { try { Run.startSmith(R); } catch (e) { sfx.back(); return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1500); } sfx.select(); ui.pickU = null; return showPick(); }
  if (act === 'run-smith') { try { Run.startUpgrade(R); } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); } sfx.select(); ui.pickU = null; return showPick(); }
  // 덱 고르기
  if (act === 'run-pickcard') { sfx.tap(); ui.pickU = Number(t.dataset.u); return showPick(); }
  if (act === 'run-pickcancel') {   // 한 걸음 뒤로: 강화 효과 → 카드 고르기 · 카드 고르기 → 이벤트 선택지 (상점 · 휴식은 그 화면으로)
    sfx.back(); const back = R.pick?.why === 'upgrade' && R.pick.opts ? R.pick.u : null; Run.cancelPick(R); ui.carve = null; save();
    if (R.pick) { ui.pickU = back; return showPick(); }
    ui.pickU = null; X.layer.innerHTML = ''; return enterView();
  }
  if (act === 'run-pickok') {
    if (ui.pickU == null) return;
    const why = R.pick?.why;
    try { Run.pickDeck(R, ui.pickU); } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); }
    drain();
    if (R.pick?.opts) { sfx.select(); ui.pickU = null; return showUpgrade(); }
    why === 'upgrade' ? sfx.levelup?.() : sfx.select();
    ui.pickU = null; X.layer.innerHTML = ''; save();
    if (R.ended) return showEnd();
    enterView();
    const st = ui.stamps.splice(0).map(f => R.deck.find(c => c.u === f.u)).filter(c => c?.seal);   // 상점에서 붙인 인장
    if (st.length) stampShow(st);
    return;
  }
  // 이벤트
  if (act === 'run-evopt') {
    if (ui.evRoll) return;
    const had = R.event.dice, before = { hp: R.hp, blk: 0, gold: R.gold };
    try { Run.eventChoose(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), TR('고를 수 없어요'), e.message, 1400); }
    drain(); sfx.select(); save();
    if (R.event?.dice && R.event.dice !== had) return rollEventDice(before);
    if (R.phase === 'lost') return showEnd();
    if (R.pick) { ui.pickU = null; showEvent(); return showPick(); }
    return showEvent();
  }
  if (act === 'run-evleave') { sfx.start(); Run.eventLeave(R); drain(); save(); return enterView(true); }
  // 전투
  if (R.phase !== 'combat') return;
  if (act === 'run-skip') return ui.skipIntro?.();
  if (act === 'run-intent') return intentInfo(t);
  if (act === 'run-hex') { const h = R.C.hex; sfx.tap(); return X.popover(t, `<b>${jMask() ? '' : runIco('hex', h.t, Run.HEX[h.t].icon, 'xs')} ${hexKo(h.t)}</b><p>${hexDesc(h.t, h.n)}</p>`); }
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
    try { Run.useNudge(R, i, d); } catch (e) { X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); return paint(); }
    sfx.select(); save(); paint();
    X.tray()?.show(R.C.dice, R.C.held);
    return;
  }
  if (act === 'run-deal') {
    const i = Number(t.dataset.i), v = Number(t.dataset.v);
    ui.tool = null; ui.dealDie = null;
    const r0 = snap();
    try { Run.useDeal(R, i, v); } catch (e) { X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); return paint(); }
    ui.busy = true;
    return playFx(drain(), r0).then(() => { ui.busy = false; save(); paint(); X.tray()?.show(R.C.dice, R.C.held); });
  }
  if (act === 'run-dance') {
    const r0 = snap();
    try { Run.useDance(R); } catch (e) { return X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); }
    ui.busy = true;
    return playFx(drain(), r0).then(() => { ui.busy = false; save(); paint(); X.tray()?.show(R.C.dice, R.C.held); });
  }
  if (act === 'run-play') {
    X.closePopover?.();
    const u = Number(t.dataset.u), tt = t.dataset.t;
    const mine = ui.split?.u === u;
    const target = tt == null || tt === '' ? (mine ? ui.split.atk : 'enemy') : tt === 'enemy' || tt === 'self' ? tt : Number(tt);
    return doPlay(u, target, mine && (tt == null || tt === '') ? ui.split.gold || 0 : 0);
  }
  if (act === 'run-split') {
    const sp = ui.split;
    if (!sp) return;
    const v = t.dataset.v, hi = R.C.hand.findIndex(c => c.u === sp.u);
    if (v === 'all') return setSplit(sp.S, 0);
    if (v === 'none') return setSplit(0, 0);
    if (v === 'cover') { if (Run.omen(R, 'fog')) return; const c = hi >= 0 ? Run.coverAtk(R, hi) : sp; return setSplit(c.atk, c.gold); }   // 프리즘: 남은 몫은 공격 · 골드 반반
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
    try { Run.useFlip(R, i); } catch (e) { X.toast(ico('warn'), TR('할 수 없어요'), e.message, 1400); return paint(); }
    sfx.select(); save(); paint();
    X.tray()?.show(C.dice, C.held);
    return;
  }
  if (ui.tool === 'nudge') return;
  if (ui.tool === 'deal') { if (Run.isSealed(R, i)) return; sfx.select(); ui.dealDie = i; return paintTray(); }
  if (Run.isSealed(R, i) || Run.isFrozen(R, i)) return X.nopeDie(i, Run.isSealed(R, i) ? 'seal' : 'ice');
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
  X.popover(a, `<b>${TR('주사위 {0} {1}', miniDie(v), v)}</b><p>${TR('뒤집으면 {0} · 조정하면 {1}', 7 - v, [v - 1, v + 1].filter(x => x >= 1 && x <= 6).join(` ${TR('또는')} `))}</p>`, { afterRelease: true });
  a.remove();
}
// 배경 분위기 (ambient.js): 막마다 — 1막 반딧불 · 2막 눈송이 · 3막 보라 불꽃 (지도 · 전투에서)
export function ambient() {
  if (!R || !['combat', 'map'].includes(R.phase)) return null;
  return { mode: ['forest', 'frost', 'castle'][R.act - 1] || 'forest', hot: R.phase === 'combat' && !!R.C?.e?.raged };
}
export function render() { if (R?.phase === 'combat') paint(); }

// 받는 피해 배율이 붙었으면 무엇 때문인지 (의도 설명)
function hurtWhy() {
  const w = [Run.omen(R, 'feast') && TR('피의 축제 ×1.5'), Run.hasRelic(R, 'glasscannon') && TR('유리 대포 ×1.4')].filter(Boolean);
  return w.length ? ` <em class="hurt">${TR('({0} 반영)', w.join(' · '))}</em>` : '';
}
function intentInfo(t) {
  const C = R.C, m = C.e.intent;
  if (!m) return;
  const parts0 = Run.intentParts(R);
  const parts = parts0.map(p => {
    if (p.k === 'atk') return TR('{0} 공격 {1}{2}{3}', ico('sword', 'xs'), p.n, p.hits > 1 ? ` ${TR('× {0}번', p.hits)}` : '', hurtWhy());
    if (p.k === 'block') return TR('{0} 보호막 {1}', ico('shield', 'xs'), p.n);
    if (p.k === 'str') return TR('{0} 힘 +{1} (이후 공격이 세진다)', ico('up', 'xs'), p.n);
    if (p.k === 'heal') return TR('{0} 체력 {1} 회복', ico('heart', 'xs'), p.n);
    if (p.k === 'steal') return TR('{0} 골드 {1} 훔치기{2}', ico('coins', 'xs'), p.n, parts0.some(q => q.k === 'atk') ? ` ${TR('(공격을 다 막으면 못 훔친다)')}` : '');
    if (p.k === 'weak') return TR('{0} 약화 {1}턴 (내 카드 점수 ×0.75)', ico('snow', 'xs'), p.n);
    if (p.k === 'hex') return jMask() ? '<b>???</b>' : `${runIco('hex', p.t, Run.HEX[p.t].icon, 'xs')} <b>${Run.HEX[p.t].ko}</b>${TR(': {0} (이번 턴)', Run.HEX[p.t].desc(p.n))}`;
    return '';
  });
  const fury = Run.furyOf(R);
  sfx.tap();
  X.popover(t, `<b>${jMask() ? '???' : esc(m.ko)}</b>${parts.map(x => `<p>${x}</p>`).join('')}<small>${TR('{0}턴부터 격앙: 적의 턴마다 힘 +{1}', fury.from, fury.str)}</small>`);
}
function potionMenu(k, t) {
  const id = R.potions[k];
  if (!id) return;
  const p = Run.potionInfo(id);
  const can = canAct() || (id === 'heal' && Run.canDrinkOut(R) && !ui.busy);
  sfx.tap();
  X.popover(t, `<b style="color:${p.color}">${ico(p.icon, 'xs')} ${p.ko}</b><p>${p.desc}</p><div class="pot-acts">${can ? `<button class="pbtn small gold" data-act="run-potuse" data-k="${k}">${TR('마시기')}</button>` : ''}<button class="pbtn small pot-drop" data-act="run-potdrop" data-k="${k}">${TR('버리기')}</button></div>`);
}
async function usePotion(k) {
  X.closePopover();
  const out = R?.potions[k] === 'heal' && Run.canDrinkOut(R);
  if (!out && !canAct()) return;
  if (out && ui.busy) return;
  const r = await act(() => Run.usePotion(R, k));
  if (!r) return;
  ui.busy = true;
  await playFx(r.list, r.before);
  ui.busy = false;
  save();
  if (!out) return afterAction();
  // 전투 밖: 화면은 그대로 두고 물약 주머니 · 체력 막대만 고친다
  const bar = document.querySelector('.rh-hp');
  if (bar) { bar.classList.toggle('low', R.hp / R.maxHp < 0.3); bar.querySelector('i').style.width = `${(R.hp / R.maxHp) * 100}%`; bar.querySelector('em').textContent = `${R.hp} / ${R.maxHp}`; }
  const pouch = document.querySelector('.rhud .potions');
  if (pouch) pouch.outerHTML = hud().match(/<div class="potions[\s\S]*?<\/div>/)[0];
}
async function actBanner(f) {
  X.layer.innerHTML = `<div class="overlay solid act-banner" data-act="run-skip"><div class="banner"><span>${TR('막 돌파!')}</span><b class="rn">${TR('{0}막', R.act)}</b><b>${esc(Run.ACT_INFO[R.act].ko)}</b>${f?.heal ? `<span>${TR('{0} 체력 {1} 회복', ico('heart', 'xs'), f.heal)}</span>` : ''}</div></div>`;
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
// 흔들어 굴리기 (app.js startShakeRoll): 지금 굴릴 수 있으면 굴릴 주사위 표시(mask) · 봉인된 주사위, 아니면 null
export const canRoll = () => canAct() && !!document.querySelector('[data-act=run-roll]:not([disabled])');
export function shakeMask() {
  if (!canRoll()) return null;
  const C = R.C;
  return { mask: Run.rollMask(R), sealed: C.rolled ? C.sealed.slice() : [] };
}
// 지금 원정 화면 이름 (플레이 통계: 화면별 체류 · 이탈 지점)
export const where = () => (R ? R.phase : ui.view || 'select');
