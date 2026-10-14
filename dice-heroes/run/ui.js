// 원정 화면 — 테스트판 전용 (배포판 빌드에는 run/ 폴더가 들어가지 않는다).
// app.js 가 init(도구) 로 트레이 · 알림 · 저장소 같은 공용 도구를 넘겨 주고,
// 'run-' 으로 시작하는 행동과 원정 중의 주사위 터치를 onAct 로 보낸다. 규칙은 rules.js (순수 로직).
import * as Run from './rules.js';
import { catInfo, bossInfo, classInfo } from '../engine.js';
import { ico } from '../icons.js';
import { spriteURL, isImgSprite } from '../pixel.js';
import { sfx, playBgm, preloadBgm, bossSong, buzz, rumble, BGM_FILES } from '../audio.js';
import { FX, PALETTES, shake } from '../fx.js';
import { foeURL, isPixelFoe, runIco, starIco, sceneURL, actBgURL, runAssetURLs, RUN_FONT } from './art.js';
import { relicIco, relicURLs, dotIco } from './relic-art.js';
import { Hand } from './hand.js';
import * as Prog from './progress.js';

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
const FOE_COLOR = { slime: '#3EE6B4', goblin: '#7CC24A', bat: '#8A5CC8', wolf: '#9AA4B8', shaman: '#B36BFF', mimic: '#FFC83D',
  skeleton: '#EEE6D0', ghost: '#7CA8D8', wisp: '#7CE0FF', knight: '#6A6A9A', golem: '#A8A090', imp: '#E8435A', hound: '#FF8A1A',
  gargoyle: '#8A8FA8', shade: '#9A6AFF', champion: '#C21E56' };
const foeColor = id => bossInfo(id)?.color || FOE_COLOR[id] || '#9486FF';
const KIND_KO = { normal: '', elite: '엘리트', boss: '보스' };

// ── 시작 · 저장 ──────────────────────────────────────────────────────────────
// 원정 스타일(run.css)을 다 받은 뒤에 화면을 그린다 — 먼저 그리면 꾸밈 없는 화면이 잠깐 보인다 (최대 3초 기다림)
let cssReady = null;
export function init(ctx) {
  // 원정 파일끼리 버전이 섞였는지 (예전 rules.js + 새 ui.js) — 섞였으면 app.js 가 새로 받아 다시 연다
  if (typeof Run.replay !== 'function' || typeof Run.fixProgress !== 'function' || typeof Prog.progress !== 'function') throw new TypeError('원정 파일 버전이 섞였어요');
  X = ctx;
  Prog.initProgress(X.store);
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
export const syncAch = () => Prog.syncAch();   // 원정 기록 → 도전과제 (테스트판)
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
// 시험용: 이 직업은 승천을 처음부터 끝까지 열어 둔다 (원정은 테스트판에만 있다. 정식 출시 전에 비울 것)
const ASC_ALL_OPEN = new Set(['dancer']);
const ascOpen = (b, cls) => (ASC_ALL_OPEN.has(cls) ? Run.ASC_MAX : Math.min(Run.ASC_MAX, (b.asc[cls] ?? -1) + 1));
// 판 안에서 이룬 도전과제를 기록에 옮기고, 처음 이룬 것은 알린다
// (기록에 옮기는 것은 원정이 끝날 때 progress.js 가 한다. 여기서는 알리기만)
function syncFeats(extra = []) {
  const b = best();
  const fresh = [...new Set([...(R?.feats || []), ...extra])].filter(id => !b.feats.includes(id) && !ui.featShown.has(id));
  fresh.forEach((id, k) => {
    ui.featShown.add(id);
    const f = Run.FEATS.find(x => x.id === id);
    if (f) setTimeout(() => { sfx.legend?.(); X.toast(ico(f.icon), `원정 도전과제 · ${f.ko}`, f.desc, 2200); }, k * 900);
  });
}

// 길게 누른 원정 직업의 스킬 (app.js 가 data-rcls 를 길게 누르면 부른다)
export function classTip(id) {
  const ci = Run.RUN_CLASSES[id], c = classInfo(id);
  if (!ci) return '';
  return `<b style="color:${c.color}">${c.ko}</b> <small>${ico('heart', 'xs')}${ci.hp} · ${ico('flip', 'xs')}${ci.flip} · ${ico('nudge', 'xs')}${ci.nudge}</small><p><b>${ico('star', 'xs')} ${ci.skill}</b> ${esc(ci.desc)}</p>`;
}
export function open() {
  warm();
  ui.view = 'select'; X.setScreen('run'); paintSelect();
  Prog.refresh().then(() => ui.view === 'select' && !R && !X.layer.innerHTML && paintSelect());   // 배포판: 서버 기록 새로 받기
}
export async function resume() {
  const s = savedRun(X.store);
  if (!s) return open();
  R = s; R.fx = [];
  X.setScreen('run');
  await preloadRun();
  if (R === s) enterView(true);
}

// ── 로딩 화면 ────────────────────────────────────────────────────────────────
// 원정에 들어가기 전에 그림(적 · 배경 · 장면 · 아이콘 · 카드 틀 · 유물 · 보스) · 글꼴 · 원정 곡 · 이번 막 보스 곡을 다 받는다.
// 한 번 받으면 같은 화면에서는 다시 받지 않는다. 나머지 보스 곡은 지도에 들어간 뒤 뒤에서 받는다.
let loaded = false;
const keepImgs = [];                      // 받은 그림을 붙잡아 둔다 (메모리 캐시에서 바로 그려진다)
// 그림 한 장 받기 (같은 주소는 한 번만). 받고 풀어 둔 뒤에 끝난다
const imgJobs = new Map();
const loadImg = url => imgJobs.get(url) || (imgJobs.set(url, new Promise(res => { const i = new Image(); keepImgs.push(i); i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(res); i.onerror = res; i.src = url; })), imgJobs.get(url));
const ascURLs = () => [...Array(Run.ASC_MAX)].map((_, k) => `assets/run/ui/asc_${k + 1}.webp?v=${X.version}`);
// 미리 받기 (규칙: 그림 · 음악은 사람이 누르기 전에 이미 받아져 있어야 한다 — CLAUDE.md)
// 시작 화면에 원정 버튼이 보이면 app.js 가 부른다. 화면에 바로 쓰일 것(승천 문장 등)부터, 나머지는 천천히 뒤에서
let warming = null;
export function warm() {
  return (warming ||= (async () => {
    await Promise.all(ascURLs().map(loadImg));
    const bosses = [...new Set(Object.values(Run.ACT_INFO).flatMap(a => a.boss))];
    const jobs = [...runAssetURLs(bosses), ...relicURLs()].map(u => () => loadImg(u));
    const go = async () => { while (jobs.length) await jobs.shift()(); };
    await Promise.all([...Array(3)].map(go));
    [...RUN_SONGS].map(n => BGM_FILES[n]).filter(Boolean).forEach(u => fetch(u).catch(() => {}));
    document.fonts?.load('12px Galmuri9').catch(() => {});   // 글꼴은 CSS 의 글꼴로 받아야 다시 받지 않는다
  })());
}
const RUN_SONGS = ['run_map', 'run_battle', 'run_elite', 'run_win', 'run_lose'];
async function preloadRun() {
  const bosses = [...new Set(Object.values(Run.ACT_INFO).flatMap(a => a.boss))];
  const songs = [...RUN_SONGS, bossSong(R.boss)].map(n => BGM_FILES[n]).filter(Boolean);
  if (loaded) { preloadBgm(bossSong(R.boss)); await X.stageReady(); return; }
  const imgs = [...runAssetURLs(bosses), ...relicURLs()];
  const total = imgs.length + songs.length + 1;
  let done = 0;
  X.layer.innerHTML = '';
  X.app.innerHTML = `<div class="screen run-loading">
    <div class="rl-box"><div class="rl-walk"><i class="rl-mon goblin"></i><i class="rl-mon slime"></i><s class="rl-ground"></s></div><b>원정 준비 중…</b>
      <div class="rl-bar"><i id="rl-fill"></i></div><small id="rl-n">0%</small>
</div></div>`;
  const tick = () => { done++; const k = Math.round((done / total) * 100); const f = $('rl-fill'); if (f) f.style.width = `${k}%`; const n = $('rl-n'); if (n) n.textContent = `${k}%`; };
  const img = url => loadImg(url).then(tick);
  const file = url => fetch(url).then(r => r.arrayBuffer()).catch(() => {}).then(tick);
  // 동시에 6개씩
  const jobs = [...imgs.map(u => () => img(u)), ...songs.map(u => () => file(u)), () => file(RUN_FONT)];
  const run = async () => { while (jobs.length) await jobs.shift()(); };
  const t0 = performance.now();
  await Promise.race([Promise.all([...Array(6)].map(run)), wait(25000)]);
  // 지도 곡과 이번 막 보스 곡은 바로 틀 수 있게 풀어 둔다
  await Promise.race([Promise.all([preloadBgm('run_map'), preloadBgm(bossSong(R.boss))]), wait(4000)]);
  await X.stageReady();                    // 3D 트레이 · 주사위 · 트레이 그림
  if (performance.now() - t0 < 500) await wait(500 - (performance.now() - t0));   // 너무 짧게 번쩍이지 않게
  loaded = true;
  // 나머지 보스 곡은 뒤에서 (HTTP 캐시에만)
  bosses.map(bossSong).map(n => BGM_FILES[n]).filter(u => u && !songs.includes(u)).forEach(u => fetch(u).catch(() => {}));
}

// R.phase 에 맞는 화면을 연다
function enterView(fresh = false) {
  ui.tool = null; ui.sel = null; ui.dealDie = null;
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
// 원정 대사: 직업 그림을 누르면 스킬에 맞는 한마디 (대전 직업 대사는 app.js CLASS_LINES)
const RUN_LINES = {
  gambler: ['숨 참고 골드 다이브!', '올인 각. 이번 판 떡상 간다', '배팅은 기세야, 기세!'],
  monk: ['굴림 아끼는 게 진짜 갓생이지', '멘탈 방어력 만렙 찍음', '조급함? 그거 먹는 건가요'],
  rogue: ['방패? 그거 패스할게요~', '뒤집기 한 번이면 킹받지?', '그림자에서 조용히 캐리 중'],
  warrior: ['숫자 카드는 내가 다 씹어먹음', '공격도 방어도 원툴 아님, 투툴임', '불굴? 그냥 내 MBTI'],
  bard: ['방패는 노래로 깔아 드림~', '이기면 앵콜에 체력까지, ㅇㅈ?', '분위기 메이커 등장했다구요'],
  mage: ['손패가 곧 내 마력 통장', '카드 한 장 더 보는 게 국룰', '아는 만큼 세진다, 완전 럭키비키잖아'],
  dancer: ['춤사위 쌓이는 중… 텐션 미쳤다', '박자 타고 전부 +1 가보자고', '오늘 무대 찢는다'],
  outlaw: ['첫 굴림에 끝냄. 고민은 배송만 늦출 뿐', '빠르게 쏘고 칼퇴한다', '두 번 굴리면 지는 거야'],
  sharper: ['원하는 눈? 손기술로 뚝딱', '밑장 빼기? 그거 실력임', '요트 각 잡혔다, 손이 기억함'],
};
let runLineK = 0;
// 시작 덱 9장 (기본 8장 + 대표 카드). 화면 보기용 (u 는 음수)
const startDeck = cls => { const ci = Run.RUN_CLASSES[cls]; return [...Run.BASE_DECK.map((cat, k) => ({ u: -1 - k, cat, up: 0, kw: null })), { u: -99, cat: ci.sig.cat, up: 0, kw: ci.sig.kw || null }]; };
// 상단 직업 설명 (모든 직업을 같은 칸에 겹쳐 두고 고른 직업만 보인다 → 칸 높이가 가장 긴 설명에 맞춰 고정)
function classInfoHTML(id, b) {
  const ci = Run.RUN_CLASSES[id], sig = startDeck(id).at(-1), kw = sig.kw ? Run.KEYWORDS[sig.kw] : null;
  const relic = mlv(b, 'relic') && Run.START_RELIC[id] ? Run.relicInfo(Run.START_RELIC[id]) : null;
  return `<div class="rs-stats"><span>${ico('heart', 'xs')}<b>${ci.hp}</b></span><span>${ico('flip', 'xs')}<b>${ci.flip}</b></span><span>${ico('nudge', 'xs')}<b>${ci.nudge}</b></span>${relic ? `<span>${relicIco(relic, 'xs')}${relic.ko}</span>` : ''}</div>
      <p class="rs-skill"><b>${ico('star', 'xs')} ${ci.skill}</b> ${esc(ci.desc)}</p>
      <p class="rs-sig"><b>${ico('card', 'xs')} ${Run.cardName(sig)}</b> ${Run.CAT_RULE[sig.cat]}${kw ? ` · ${runIco('kw', sig.kw, kw.icon, 'xs')}${kw.ko}: ${kw.desc}` : ''}</p>`;
}
function paintSelect() {
  const sel = ui.cls || X.store.get('diceheroes.runCls') || 'gambler';
  ui.cls = sel;
  const bb = best();
  ui.asc = Math.min(ascOpen(bb, sel), (X.store.get('diceheroes.runAsc') || {})[sel] ?? ascOpen(bb, sel));
  const info = classInfo(sel);
  const b = best();
  const ids = Object.keys(Run.RUN_CLASSES), k = ids.indexOf(sel);
  const at = d => ids[(k + d + ids.length * 2) % ids.length];
  const deck = startDeck(sel), sig = deck[deck.length - 1];
  const spin = ui.spin && Date.now() - ui.spin.t < 400 ? (ui.spin.d > 0 ? ' spin-r' : ' spin-l') : '';
  const slot = d => { const id = at(d), c = classInfo(id), owned = X.owns(id);
    return `<button class="dial-hero d${d}${owned ? '' : ' locked'}" style="--c:${c.color}" data-act="${d ? 'run-cls' : 'run-talk'}" data-id="${id}" data-d="${d}" ${d ? '' : `data-rcls="${id}"`} aria-label="${c.ko}">${hero(id)}</button>`; };
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-select">
    <header class="rs-head">
      <button class="icon-btn" data-act="run-home" aria-label="뒤로">◀</button>
      <div><b>원정</b></div>
      <button class="pbtn small rs-feats" data-act="run-feats">${ico('trophy', 'xs')} ${b.feats.length}/${Run.FEATS.length}</button>
    </header>
    <section class="rs-info frame">${ids.map(id => `<div class="rs-info-in${id === sel ? ' on' : ''}" style="--c:${classInfo(id).color}" ${id === sel ? '' : 'aria-hidden="true"'}>${classInfoHTML(id, b)}</div>`).join('')}</section>
    <div class="rs-dial${spin}">
      <button class="dial-arrow" data-act="run-cls" data-id="${at(-1)}" data-d="-1" aria-label="이전 직업">◀</button>
      <div class="dial-track">${[-2, -1, 0, 1, 2].map(slot).join('')}</div>
      <button class="dial-arrow" data-act="run-cls" data-id="${at(1)}" data-d="1" aria-label="다음 직업">▶</button>
    </div>
    <b class="rs-name" style="--c:${info.color}">${info.ko}${b.cls[sel]?.wins ? ` <i class="rs-won">${ico('crown', 'xs')}${b.cls[sel].wins}</i>` : ''}${X.owns(sel) ? '' : ` ${ico('lock', 'xs')}`}</b>
    <div class="rs-pile" id="rs-pile" aria-label="시작 덱 ${deck.length + 1}장">
      ${deck.slice(0, -1).map((c, n) => `<i class="rs-back" style="--n:${n}"></i>`).join('')}
      <div class="rc rc-static rs-front">${cardFace(sig)}</div>
      <span class="rs-count">${ico('card', 'xs')}${deck.length + 1}</span>
    </div>
    <div class="rs-go">
      <button class="meta-btn market" data-act="run-meta"><i class="mk-awning" aria-hidden="true"></i><span class="mk-board">${runIco('node', 'shop', 'coins', 'xs')} 출정 채비 <b>${starIco()}${b.meta.stars}</b></span></button>
      <button class="pbtn gold big" data-act="run-go">원정 떠나기</button>
      <button class="pbtn small trial-btn" data-act="run-trial">시험 원정 · 특별 카드</button>
    </div>
  </div>`;
  // 덱 더미를 길게 누르면 시작 덱 9장
  longPress($('rs-pile'), () => X.popover($('rs-pile'), `<b>${ico('card', 'xs')} 시작 덱 ${deck.length + 1}장</b><div class="deck-peek">${deck.map(c => `<div class="rc rc-static mini">${cardFace(c)}</div>`).join('')}</div><p>+ 특별 카드 1장 (에이스 · 듀스 · 트레이 중 무작위)</p>`, { afterRelease: true }));
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
      <button class="icon-btn" data-act="run-asc" data-d="-1" ${a <= 0 ? 'disabled' : ''} aria-label="하드모드 낮추기">◀</button>
      <div class="ah-mid"><span class="ah-emb${a ? '' : ' off'}">${ascEmblem(a)}</span>
        <b>${a ? `하드모드 ${a}` : '하드모드 0'}</b><small>${a ? `어려움 ×${a}` : ''}</small></div>
      <button class="icon-btn" data-act="run-asc" data-d="1" ${a >= open ? 'disabled' : ''} aria-label="하드모드 높이기">▶</button>
    </div>
    <div class="asc-ladder">${rows}</div>
    <p class="hint">${esc(classInfo(ui.cls).ko)}: 하드모드 ${open}까지 열렸어요${open < Run.ASC_MAX ? ` · 하드모드 ${open}을 깨면 다음 단계가 열려요` : ''}</p>
    <div class="pick-actions"><button class="pbtn small" data-act="run-ascset" data-v="0">하드모드 끄기</button><button class="pbtn gold" data-act="run-start">${a ? `${ascEmblem(a, 'xs')} 하드모드 ${a}로 ` : ''}출발</button></div>
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
      <em class="price${!full && m.stars < cost ? ' poor' : ''}">${full ? '완료' : `${starIco()}${cost}`}</em></button>`;
  };
  const shelf = list => `<div class="shelf"><div class="shelf-row">${list.map(item).join('')}</div><i class="shelf-plank" aria-hidden="true"></i></div>`;
  const rows = [];
  for (let k = 0; k < Run.META.length; k += 3) rows.push(Run.META.slice(k, k + 3));
  X.layer.innerHTML = `<div class="overlay run-meta" data-act="close-bg"><div class="deck-box meta-store" data-act="noop">
    <div class="meta-head market"><i class="mk-awning" aria-hidden="true"></i><img class="run-scene" src="${sceneURL('shop')}" alt=""><div class="mh-sign"><h2>출정 채비</h2><small>영구 강화 · 원정을 떠날 때마다 적용</small></div></div>
    <div class="meta-counter"><span class="star-wallet${ui.walletWas != null && ui.walletWas !== m.stars ? ' bump' : ''}">${starIco('')}<span><small>보유 별조각</small><b>${m.stars}</b></span></span></div>
    <div class="shop-stall meta-stall">${rows.map(shelf).join('')}</div>
    <div class="pick-actions"><button class="pbtn small gold" data-act="close">닫기</button></div>
  </div></div>`;
  ui.walletWas = m.stars;
}
// 출정 채비 물건을 누르면: 설명(지금 → 다음) + 구매 / 취소
function metaItemTip(el, id) {
  const b = best(), m = b.meta, u = Run.META.find(x => x.id === id);
  if (!u) return;
  const n = mlv(b, id), full = n >= u.max, cost = full ? 0 : u.cost[n];
  sfx.tap();
  X.popover(el, `<b>${runIco('meta', u.id, u.icon, 'xs')} ${u.ko}</b> <small>${n}/${u.max}단계</small>
    <p>${n ? u.desc(n) : '아직 없음'}${full ? '' : `<br>→ <em class="mint">${u.desc(n + 1)}</em>`}</p>
    ${full ? '<p class="dim">다 올렸어요</p>' : `<div class="buy-btns"><button class="hb" data-act="run-metaclose">취소</button><button class="hb gold" data-act="run-metabuy" data-id="${id}" ${m.stars < cost ? 'disabled' : ''}>${starIco()}${cost} 구매</button></div>`}`);
}
async function metaAct(act, id) {
  if (ui.metaBusy) return;
  ui.metaBusy = true;
  try {
    if (act === 'run-metabuy') await Prog.buy('meta', id);
  } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
  finally { ui.metaBusy = false; }
  sfx.forge?.();
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
  return `${R.trial ? '<button class="sb-open" data-act="run-sb" aria-label="샌드박스">시험</button>' : ''}<header class="rhud">
    <button class="icon-btn" data-act="run-menu" aria-label="메뉴">☰</button>
    <div class="rh-act" ${X.tipAttr(`${R.act}막${R.asc ? ` · 하드모드 ${R.asc}` : ''}`, `${Run.ROWS}층 + 보스 · 3막까지`)}><small>${R.act}막${R.asc ? ` · 하드모드${R.asc}` : ''}</small><b>${fl > Run.ROWS ? '보스' : fl ? `${fl}층` : '출발'}</b></div>
    <div class="rh-res">
      <span class="res gold" id="r-gold" ${X.tipAttr('골드', '상점에서 써요')}>${ico('coins', 'xs')}<b>${ui.show?.gold ?? R.gold}</b></span>
      <span class="res" ${X.tipAttr('뒤집기', '1↔6 · 2↔5 · 3↔4')}>${ico('flip', 'xs')}<b>${R.flip}</b></span>
      <span class="res" ${X.tipAttr('조정', '주사위 눈 ±1')}>${ico('nudge', 'xs')}<b>${R.nudge}</b></span>
      ${R.cls === 'dancer' ? `<span class="res" ${X.tipAttr('춤사위', Run.RUN_CLASSES.dancer.desc)}>${ico('sparkle', 'xs')}<b>${R.dance}</b></span>` : ''}
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
    <div class="rh-por" id="rh-por" data-rcls="${R.cls}">${hero(R.cls)}</div>
    <div class="rh-main">
      <div class="rh-name"><b>${esc(R.name)}</b><button class="rh-skill" data-act="run-skill">${ico('star', 'xs')}${ci.skill}</button>${weak ? `<span class="st weak" ${X.tipAttr(`약화 ${R.C.weak}턴`, '카드 점수 ×0.75')}>${ico('snow', 'xs')}약화 ${R.C.weak}</span>` : ''}</div>
      <div class="hp rh-hp${hp / R.maxHp < 0.3 ? ' low' : ''}"><i style="width:${(hp / R.maxHp) * 100}%"></i><em>${hp} / ${R.maxHp}</em></div>
    </div>
    <div class="rh-blk${blk ? ' on' : ''}" id="rh-blk" ${X.tipAttr(`방어도 ${blk}`, '적의 공격을 먼저 막아요 · 내 턴이 시작되면 사라져요')}>${ico('shield', 'xs')}<b>${blk}</b></div>
    <div class="rh-relics">${R.relics.map(id => { const r = Run.relicInfo(id); return `<button class="relic r${r.r}" data-act="run-relic" data-id="${id}" aria-label="${r.ko}">${relicIco(r, 'xs')}</button>`; }).join('') || '<span class="dim">유물 없음</span>'}</div>
  </section>`;
}

// ── 카드 그림 ────────────────────────────────────────────────────────────────
const PATTERN = { ones: [1, 1, 1], twos: [2, 2, 2], threes: [3, 3, 3], fours: [4, 4, 4], fives: [5, 5, 5], sixes: [6, 6, 6], four: [5, 5, 5, 5], full: [3, 3, 3, 5, 5], sstr: [1, 2, 3, 4], lstr: [1, 2, 3, 4, 5], yacht: [6, 6, 6, 6, 6] };
export function cardFace(c, { score = null, cls = '' } = {}) {
  const r = Run.cardRarity(c);
  const ks = Run.kwsOf(c), kw = ks.length ? Run.KEYWORDS[ks[0]] : null;
  const pat = c.cat === 'choice' ? '<span class="rc-sum">∑</span>' : `<span class="mds">${PATTERN[c.cat].map(miniDie).join('')}</span>`;
  const sl = c.seal && Run.sealInfo(c.seal);
  return `<div class="rc-in r${r}${c.up ? ' up' : ''}${ks.length >= 3 ? ' k3' : ''}${c.temp ? ' temp' : ''}${cls}"${kw ? ` style="--kc:${kw.color}"` : ''}>
    ${sl ? `<i class="rc-seal s-${c.seal}" style="--sc:${sl.color}${ui.stampHide.has(c.u) ? ';visibility:hidden' : ''}" title="${sl.ko}">${sealIco(c.seal)}</i>` : ''}${c.temp ? '<i class="rc-moon" title="달빛 복사본 · 한 번 쓰면 사라진다"></i>' : ''}
    <b class="rc-name">${c.up ? Run.cardTitle(c.cat).replace(/\S+$/, w => `<span class="nw">${w}<i class="rc-plus">+</i></span>`) : Run.cardTitle(c.cat)}${Run.isSpecial(c.cat) ? `<i class="rc-spec">${runIco('spec', c.cat, Run.SPECIAL[c.cat].icon, 'xs')}${Run.SPECIAL[c.cat].ko}</i>` : ''}</b>
    <div class="rc-pat">${pat}</div>
    <small class="rc-rule">${ruleOf(c)}</small>
    ${ks.length > 1 ? `<span class="rc-gems n${ks.length}">${Array.from({ length: Run.KW_MAX }, (_, i) => ks[i] ? `<i class="gem" style="--kc:${Run.KEYWORDS[ks[i]].color}" title="${Run.KEYWORDS[ks[i]].ko}">${runIco('kw', ks[i], Run.KEYWORDS[ks[i]].icon, 'xs')}</i>` : '<i class="gem empty"></i>').join('')}</span>`
      : kw ? `<span class="rc-kw">${runIco('kw', ks[0], kw.icon, 'xs')}${kw.ko}</span>` : '<span class="rc-kw none"></span>'}
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
const ruleOf = c => (c.cat === 'ones' && c.grow ? `1의 개수 + ${c.grow}` : Run.CAT_RULE[c.cat]);
const cardTip = c => `<b>${esc(Run.cardName(c))}</b><p>${ruleOf(c)}${c.up ? ' · 강화: 점수 +30%' : ''}</p>${Run.isSpecial(c.cat) ? `<p>${runIco('spec', c.cat, Run.SPECIAL[c.cat].icon, 'xs')} <b>${Run.SPECIAL[c.cat].ko}</b> ${Run.SPECIAL[c.cat].desc}${c.cat === 'ones' && c.grow ? ` (지금 +${c.grow})` : ''}</p>` : ''}${c.seal ? `<p>${sealIco(c.seal)} <b>${Run.sealInfo(c.seal).ko}</b> ${Run.sealInfo(c.seal).desc}</p>` : ''}${c.temp ? '<p><b>달빛 복사본</b> 한 번 쓰면 사라진다</p>' : ''}${Run.kwsOf(c).map(k => `<p>${runIco('kw', k, Run.KEYWORDS[k].icon, 'xs')} <b>${Run.KEYWORDS[k].ko}</b> ${Run.KEYWORDS[k].desc}</p>`).join('')}`;

// ── 지도 ─────────────────────────────────────────────────────────────────────
const MAP_ROW = 74, MAP_PAD = 46;
// 지도 · 이벤트 · 상점 · 휴식 · 전투 보상은 모두 지도 곡(run_map) — 같은 곡이면 playBgm 이 다시 틀지 않아 화면을 오가도 끊기지 않는다
function showMap(again = false) {
  playBgm('run_map');
  preloadBgm(bossSong(R.boss));          // 이번 막 보스 곡 · 전투 곡을 미리 받아 둔다 (전투에 들어가자마자 나오게)
  preloadBgm('run_battle');
  const nodes = R.map.nodes;
  const next = new Set(Run.nextNodes(R));
  // 층 간격: 지도 칸 높이에 맞춰 한 화면에 다 보이게 (너무 좁으면 스크롤)
  const ROW = ui.mapRow || MAP_ROW;
  const H = MAP_PAD * 2 + Run.ROWS * ROW + 40;
  const pos = n => ({ x: 12 + n.col * 25.3, y: n.row > Run.ROWS ? MAP_PAD - 6 : H - MAP_PAD - (n.row - 1) * ROW });
  const visited = new Set(R.path);
  const lines = nodes.flatMap(n => n.next.map(j => {
    const a = pos(n), b = pos(nodes[j]);
    const walked = visited.has(n.id) && visited.has(j);
    const open = R.pos === n.id && next.has(j);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? 'walked' : open ? 'open' : ''}"/>`;
  })).join('');
  // 보스는 들어가기 전까지 ? (막마다 후보 중 하나가 정해져 있지만 보여 주지 않는다). 마지막 막(마왕)은 실루엣만
  const lastAct = R.act >= Run.ACTS;
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-map">
    ${hud()}
    <div class="map-head"><b>${R.act}막 · ${Run.ACT_INFO[R.act].ko}</b>${R.omen ? omenChip() : ''}<small>보스 ???</small></div>
    <div class="map-scroll" id="map-scroll" style="background-image:linear-gradient(rgba(8,5,24,.25), rgba(8,5,24,.25)), url(${actBgURL(R.act)})"><div class="map" style="height:${H}px">
      <svg class="map-lines" viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>
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
  if (sc && !again) {
    const fit = Math.max(52, Math.min(96, Math.floor((sc.clientHeight - 6 - MAP_PAD * 2 - 40) / Run.ROWS)));
    if (fit !== ROW) { ui.mapRow = fit; return showMap(true); }
  }
  const tgt = X.app.querySelector('.mnode.can') || X.app.querySelector('.mnode.here');
  if (sc && tgt) sc.scrollTop = Math.max(0, tgt.offsetTop - sc.clientHeight * 0.6);
  if (R.omenOpts) showOmens();
}
// 막 징조: 이번 막 내내 깔리는 효과 (2장 중 1장)
const omenChip = () => { const o = Run.omenInfo(R.omen); return `<button class="omen-chip" data-act="run-omeninfo" aria-label="${o.ko}">${omenIco(o, 'xs')}<span>${o.ko}</span></button>`; };
function omenText(o) { return o.id === 'forbid' && R.omen === 'forbid' && R.omenCat ? `${o.desc} — 금지: ${Run.cardTitle(R.omenCat)}` : o.desc; }
function showOmens() {
  sfx.legend?.();
  X.layer.innerHTML = `<div class="overlay run-omens" data-act="noop"><div class="pick-box">
    <h2>${R.act}막의 징조</h2>
    <div class="omen-picks">${R.omenOpts.map((id, k) => { const o = Run.omenInfo(id); return `<button class="omen-card t${o.tier}" data-act="run-omen" data-k="${k}" style="--i:${k}">
      <span class="om-ico">${omenIco(o, 'lg')}</span><b>${o.ko}</b><small>${o.desc}</small></button>`; }).join('')}</div>
  </div></div>`;
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
  if (fresh && C.turn === 1 && !C.rolled) introFoe();
  if (ui.stamps.length) stampHand();
}
const canAct = () => R?.phase === 'combat' && R.C?.phase === 'roll' && !ui.busy;
// 굴리는 동안(주사위가 다 멈추기 전)은 '?' — 점수는 주사위가 멈춘 뒤에 드러난다
const cardScore = c => (ui.rolling ? '?' : R.C.rolled ? Run.scoreCard(R, c).total : null);

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
  const canRoll = my && C.rollsLeft > 0 && !needBet && !(rolled && C.held.every((h, i) => h || Run.isFrozen(R, i)));
  const locked = Run.toolsLocked(R);
  $('rolls-left').innerHTML = [...Array(Run.maxRolls(R))].map((_, i) => `<i class="${i < C.rollsLeft ? 'on' : ''}"></i>`).join('');
  $('rctl').innerHTML = `
    <button class="pbtn gold roll${canRoll && !rolled ? ' next' : ''}" data-act="run-roll" ${canRoll ? '' : 'disabled'}><span>${needBet ? '배팅 먼저' : rolled ? '다시 굴리기' : '굴리기'}</span><small class="left-n">남은 ${C.rollsLeft}회</small></button>
    <button class="pbtn tool${ui.tool === 'flip' ? ' on' : ''}" data-act="run-tool" data-tool="flip" ${my && rolled && R.flip > 0 && !locked ? '' : 'disabled'}>${ico('flip')}${ui.tool === 'flip' ? '사용 중' : '뒤집기'}<b>${R.flip}</b></button>
    <button class="pbtn tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="run-tool" data-tool="nudge" ${my && rolled && R.nudge > 0 && !locked ? '' : 'disabled'}>${ico('nudge')}${ui.tool === 'nudge' ? '사용 중' : '조정'}<b>${R.nudge}</b></button>
    <button class="pbtn tool swap${ui.tool === 'swap' ? ' on' : ''}" data-act="run-tool" data-tool="swap" ${my && C.swaps > 0 ? '' : 'disabled'}>${ico('swapcard')}${ui.tool === 'swap' ? '카드 고르기' : '교체'}<b>${C.swaps}</b></button>`;
  $('tray-btns').innerHTML = `${my && Run.canDance(R) ? `<button class="encore-btn dance-btn" data-act="run-dance">${ico('sparkle', 'xs')} 춤사위 ×${R.dance} <small>모든 주사위 +1</small></button>` : ''}${my && Run.canDeal(R) ? `<button class="encore-btn deal-btn${ui.tool === 'deal' ? ' on' : ''}" data-act="run-tool" data-tool="deal">${ico('card', 'xs')} ${ui.tool === 'deal' ? '취소' : `밑장빼기 ${R.C.deals}`}</button>` : ''}${C.hex && !C.pure && !Run.omen(R, 'fog') ? `<button class="hex-badge" data-act="run-hex">${runIco('hex', C.hex.t, Run.HEX[C.hex.t].icon, 'xs')} ${Run.HEX[C.hex.t].ko}</button>` : ''}`;
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
  if (needBet) return `${ico('coins', 'xs')} 배팅 ×${Run.CLASS_TUNE.betMul}`;
  return '';
}

function foePanel() {
  const C = R.C, e = C.e, def = Run.ENEMIES[e.id];
  const hp = ui.show ? ui.show.ehp : e.hp, blk = ui.show ? ui.show.eblk : e.block;
  const fog = Run.omen(R, 'fog');
  const parts = ui.show?.hideIntent || fog ? [] : Run.intentParts(R);
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
    if (p.k === 'hex') return `<span class="it hex">${runIco('hex', p.t, Run.HEX[p.t].icon, 'xs')}<b>${Run.HEX[p.t].ko}</b></span>`;
    return '';
  }).join('');
  return `
    <div class="foe-art${isPixelFoe(e.id) ? ' px' : ''}" id="foe-art" style="--c:${foeColor(e.id)}"><i class="aura"></i><img class="foe-img" src="${foeURL(e.id)}" alt=""></div>
    <div class="foe-main">
      <div class="foe-name"><b>${esc(def.ko)}</b>${KIND_KO[def.kind] ? `<span class="kind-chip k-${def.kind}">${KIND_KO[def.kind]}</span>` : ''}</div>
      <div class="hp-row"><div class="hp foe-hp"><i style="width:${(hp / e.maxHp) * 100}%"></i>${blk ? `<s style="width:${Math.min(100, (blk / e.maxHp) * 100)}%"></s>` : ''}<em>${hp} / ${e.maxHp}</em></div><span class="foe-blk">${blk ? `<span class="shield-badge run-shield" title="보호막">${runIco('ui', 'shield', 'shield', 'xs')}<b>${blk}</b></span>` : ''}</span></div>
      <div class="foe-st">${st.join('')}</div>
    </div>
    ${intent ? `<button class="intent" id="intent" data-act="run-intent" aria-label="적의 다음 행동">${intent}</button>` : fog && !ui.show?.hideIntent ? `<div class="intent fog" aria-label="짙은 안개" ${X.tipAttr('짙은 안개', '적의 다음 행동이 안 보여요')}>?</div>` : ''}`;
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
      return `<button class="flip-tag deal-tag" style="left:${x}px;top:${y}px" data-act="run-die" data-i="${i}"><i>바꾸기</i>${miniDie(v)}</button>`;
    }
    if (ui.tool === 'flip') return `<button class="flip-tag" style="left:${x}px;top:${y}px" data-act="run-die" data-i="${i}"><i>뒤집으면</i>${miniDie(7 - v)}</button>`;
    return `<div class="nudge-tag" style="left:${x}px;top:${y}px"><button data-act="run-nudge" data-i="${i}" data-d="1" ${v >= 6 ? 'disabled' : ''}>+1</button><button data-act="run-nudge" data-i="${i}" data-d="-1" ${v <= 1 ? 'disabled' : ''}>−1</button></div>`;
  }).join('');
}

// 카드에 손가락을 올렸을 때 공격 · 방어 미리보기 (길게 누르기)
function playTip(c) {
  if (!R.C.rolled) return '';
  const hi = R.C.hand.findIndex(x => x.u === c.u);
  const a = Run.preview(R, hi, 'enemy'), d = Run.preview(R, hi, 'self');
  return `<p>${ico('sword', 'xs')} 전부 공격 ${a.dmg}${a.block ? ` · 보호막 ${a.block}` : ''}${a.heal ? ` · 회복 ${a.heal}` : ''} &nbsp; ${ico('shield', 'xs')} 전부 방어 ${d.block}</p>`;
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
  if (!C.rolled) { sfx.back(); nudgeRoll(); return; }   // 굴리기 전: 글자 대신 굴리기 버튼이 톡 튄다
  sfx.card();
  if (ui.sel === u && hand.sel === u) return closeSplit();
  openSplit(u);
}
function betAsk(u) {
  const re = R.C.bet != null;
  return `<div class="bet-ask">
    <p>${ico('coins', 'xs')}<b>${re ? '배팅 바꾸기' : '배팅'} ×${Run.CLASS_TUNE.betMul}</b></p>
    <div class="bet-btns"><button class="hb" data-act="run-betno">아니요</button><button class="hb gold" data-act="run-bet" data-u="${u}">${ico('coins', 'xs')}배팅</button></div>
  </div>`;
}
function doBet(u) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0 || C.rolled) return;
  try { Run.placeBet(R, hi); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
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
  const S = Run.splitPool(R, card, Run.scoreCard(R, card).total);
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
  hand.select(u, fixed ? trinityHTML(u) : splitHTML(u, prism), { wide: true });
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
  const S = Run.splitPool(R, c, Run.scoreCard(R, c).total);
  if (S !== sp.S) { sp.atk = sp.S ? Math.round(sp.atk / sp.S * S) : S; sp.gold = sp.S ? Math.min(S - sp.atk, Math.round(sp.gold / sp.S * S)) : 0; sp.S = S; }
  paintSplit();
}
function trinityHTML(u) {
  return `<div class="split tri" id="split">
    <div class="sp-tri" aria-label="삼위일체: 모두 얻는다">
      <span class="sp-stat atk"><small>${ico('sword', 'xs')}피해</small><b id="sp-dmg"></b></span><i class="sp-plus">+</i>
      <span class="sp-stat gold"><small>${ico('coins', 'xs')}골드</small><b id="sp-gold"></b></span><i class="sp-plus">+</i>
      <span class="sp-stat def"><small>${ico('shield', 'xs')}보호막</small><b id="sp-blk"></b></span>
    </div>
    <p class="sp-info" id="sp-info"></p>
    <div class="sp-row one"><span class="sp-note">${ico('star', 'xs')}삼위일체 · 모두 얻는다</span><button class="pbtn gold sp-go" data-act="run-play" data-u="${u}">내기</button></div>
  </div>`;
}
function splitHTML(u, prism = false) {
  return `<div class="split${prism ? ' prism' : ''}" id="split">
    <div class="sp-top">
      <button class="sp-end atk" data-act="run-split" data-v="all" aria-label="전부 공격">${ico('sword', 'xs')}<b id="sp-dmg"></b><small>피해</small></button>
      <div class="sp-bar" id="sp-bar" role="slider" aria-label="공격 · 방어 나누기"><i class="sp-a" id="sp-a"></i>${prism ? '<i class="sp-g" id="sp-g"></i>' : ''}<span class="sp-knob" id="sp-knob">${runIco('ui', 'split_knob', 'sword')}<em id="sp-n"></em></span></div>
      <button class="sp-end def" data-act="run-split" data-v="none" aria-label="전부 방어">${ico('shield', 'xs')}<b id="sp-blk"></b><small>보호막</small></button>
    </div>
    ${prism ? `<div class="sp-gtop"><span class="sp-glab">${ico('coins', 'xs')}<b id="sp-gold"></b></span><div class="sp-bar sp-gbar" id="sp-gbar" role="slider" aria-label="골드 나누기"><i class="sp-gf" id="sp-gf"></i></div></div>` : ''}
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
  if (!sp || sp.fixed) return;
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
    if (p.pierce) info.push(`${ico('dagger', 'xs')}관통`);
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
    if (p.pierce) info.push(`${ico('dagger', 'xs')}관통`);
    if (p.whet) info.push(`숫돌 +${p.whet}`);
    if (p.arcane) info.push(`비전 +${p.arcane}`);
    if (p.horn) info.push('뿔피리 ×1.25');
    if (p.poison) info.push('독: 피해 ½');
    if (p.heal) info.push(`${ico('heart', 'xs')}+${p.heal}`);
    if (p.gold - p.tri > 0) info.push(`${ico('coins', 'xs')}+${p.gold - p.tri}`);
    if (p.burn) info.push(`${ico('fire', 'xs')}화상 ${p.burn}`);
  }
  if (Run.hasRelic(R, 'madscale')) info.unshift(`${ico('scale', 'xs')}나눔은 무작위`);
  if (card.seal) info.unshift(`${sealIco(card.seal)}${Run.sealInfo(card.seal).ko}`);
  if (Run.hasKw(card, 'weak')) info.push(p.weak ? `${ico('snow', 'xs')}약화` : '<s>약화</s>');
  if (p.def > 0 && p.defMul > 1) info.push(`${ico('shield', 'xs')}방어 +${Math.round((p.defMul - 1) * 100)}%`);
  if (p.wblk) info.push(`불굴 +${p.wblk}`);
  if (p.always) info.push(`보호막 +${p.always}`);
  if (inc > 0 && !p.kill && taken) info.push(`<em class="hurt">${ico('sword', 'xs')}-${taken}</em>`);
  $('sp-info').innerHTML = info.join('<i class="sep">·</i>') || '&nbsp;';
  const cb = $('sp-cover');
  if (fog) { cb.disabled = true; cb.innerHTML = '?'; hand.el(sp.u)?.style.setProperty('--mix', k.toFixed(3)); return; }
  const cov = Run.coverAtk(R, hi);
  if (!inc) { cb.disabled = true; cb.innerHTML = '딱 막기'; }
  else { cb.disabled = false; cb.innerHTML = cov.full ? `딱 막기<small>방어 ${p.pool - cov.atk - cov.gold}</small>` : '전부 방어'; }
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
  const mask = C.dice.map((_, i) => !(C.rolled && (C.held[i] || Run.isSealed(R, i) || Run.isFrozen(R, i))));
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
}

async function doPlay(u, target, gold = 0) {
  const C = R.C, hi = C.hand.findIndex(c => c.u === u);
  if (hi < 0) return;
  ui.sel = null; ui.split = null; ui.tool = null;
  const r = await act(() => Run.playCard(R, hi, target, gold));
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
// 인장이 터진다: 그 인장 색의 고리와 이름
function sealBurst(id, p) {
  const sl = Run.sealInfo(id);
  if (!sl || !p) return;
  if (X.prefs.fx !== 'min') { FX().ring(p.x, p.y, { color: sl.color, r0: 8, r1: 80, dur: 420, width: 7 }); FX().burst(p.x, p.y, { n: 26, pal: [sl.color, '#FFFFFF', '#FFF4D2'], speed: [80, 260] }); }
  sfx.quest?.();
  floatAt(p.x, p.y - 60, `${sealIco(id)}${sl.ko}${id === 'sun' ? ' · 점수 ×1.5' : ''}`, id === 'cloud' ? 'sky' : 'gold');
}
// 동전 던지기 유물: 영웅 위로 동전이 빙글빙글 올라갔다 떨어져 앞면(금 · 왕관) / 뒷면(은 · 해골)이 보인다
async function coinToss(side, h) {
  if (!h) return;
  const head = side > 0;
  const el = document.createElement('div');
  el.className = `coin-toss ${head ? 'head' : 'tail'}`;
  el.style.left = `${Math.max(40, Math.min(innerWidth - 40, h.x))}px`; el.style.top = `${h.y - 40}px`;
  el.innerHTML = `<i class="ct-coin">${ico(head ? 'crown' : 'skull')}</i>`;
  document.body.appendChild(el);
  sfx.whoosh?.();
  await wait(X.prefs.fx === 'min' ? 150 : 820);
  sfx.coin();
  el.classList.add('landed');
  floatAt(Math.max(70, Math.min(innerWidth - 70, h.x)), h.y - 120, head ? `${ico('coins', 'xs')}앞면! 점수 +100%` : `${ico('coins', 'xs')}뒷면… 점수 −50%`, head ? 'gold big' : 'dim big');
  await wait(X.prefs.fx === 'min' ? 200 : 520);
  el.classList.add('out');
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
  return list;
}

// 뽑을 더미가 비면: 버린 카드들이 모여 두 더미로 갈라졌다가 엇갈려 섞인다 (리플 셔플)
export async function shuffleFx() {   // (디버그에서도 부른다)
  const pile = X.app.querySelector('.pile');
  const r = pile?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'shuffle-fx';
  el.style.left = `${innerWidth / 2}px`; el.style.top = `${innerHeight * 0.62}px`;
  el.innerHTML = Array.from({ length: 8 }, (_, k) => `<i class="sb" style="--k:${k};--s:${k % 2 ? 1 : -1}"></i>`).join('');
  if (r) { el.style.setProperty('--tx', `${r.left + r.width / 2 - innerWidth / 2}px`); el.style.setProperty('--ty', `${r.top + r.height / 2 - innerHeight * 0.62}px`); }
  document.body.appendChild(el);
  for (let k = 0; k < 6; k++) setTimeout(() => sfx.card?.(), 260 + k * 70);
  pile?.classList.add('bump');
  await wait(1050);
  el.remove();
  pile?.classList.remove('bump');
}
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
  const tmp = document.createElement('div'), html = foePanel();
  tmp.innerHTML = html;
  shownHTML.set(foe, html);                 // 아래에서 바뀐 곳만 고친다 — paint 가 같은 내용을 다시 그리지 않게
  const bar = foe.querySelector('.foe-hp'), nb = tmp.querySelector('.foe-hp');
  if (!bar || !nb || !foe.querySelector('#foe-art')) { foe.innerHTML = html; return; }
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
  if (!bar) { setHTML($('r-hero'), heroStrip()); return; }
  const hp = shownHp(), blk = shownBlk();
  trailBar(bar, `${(hp / R.maxHp) * 100}%`);
  bar.classList.toggle('low', hp / R.maxHp < 0.3);
  bar.querySelector('em').textContent = `${hp} / ${R.maxHp}`;
  const b = $('rh-blk');
  if (b) { b.classList.toggle('on', blk > 0); b.querySelector('b').textContent = blk; }
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
  floatAt(x, y - 22, '보호막 파괴!', 'sky');
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
      if (f.coin) await coinToss(f.coin, h);          // 동전 던지기: 앞면 +100% · 뒷면 −50% (공격 · 방어 모두)
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
          const sr = ui.show.eblk > 0 && ui.show.eblk - f.blocked <= 0 ? shieldRect() : null;
          setShow({ ehp: ui.show.ehp - f.dmg, eblk: Math.max(0, ui.show.eblk - f.blocked) });
          repaintBars();
          shieldBreak(sr);
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
      if (f.sealUsed) sealBurst(f.sealUsed, f.target === 'enemy' ? e : h);
      if (f.moon) floatAt(h.x, h.y - 100, `달빛 복사본 +${f.moon}`, 'sky');
      if (f.grow) floatAt(h.x - 30, h.y - 90, `${ico('crown', 'xs')}주인공 기본 점수 +${f.grow}`, 'gold');
      if (f.pilgrim) floatAt(h.x + 20, h.y - 110, `${ico('scroll', 'xs')}순례 · 골드 +15 · 최대 체력 +2`, 'gold');
      if (f.palette) { sfx.legend?.(); X.toast(relicIco(Run.relicInfo('palette')), '무지개 팔레트 완성!', '이제 모든 카드 +50%', 2200); }
      if (f.temp) moonset(f.target === 'enemy' ? e : h);   // 달빛 복사본은 달이 지듯 스르륵
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
      if (f.kept) { floatAt(h.x, h.y - 40, `${ico('coins', 'xs')}금화를 지켰다`, 'gold'); await wait(300); }
      if (f.steal) { if (fxOn) FX().coins(h, e, 10); floatAt(h.x, h.y - 40, `${ico('coins', 'xs')}-${f.steal}`, 'gold'); sfx.coin(); await wait(500); }
      if (f.weak) { floatAt(h.x, h.y - 40, `${ico('snow', 'xs')}약화 ${f.weak}턴`, 'sky'); await wait(300); }
      if (!f.hits.length && !f.block && !f.str && !f.heal) await wait(200);
      if (f.counter) { const e2 = foeAt(); floatAt(e2.x, e2.y - 10, `${ico('shield', 'xs')}반격 ${f.counter}`, 'sky'); setShow({ ehp: Math.max(0, ui.show.ehp - f.counter) }); repaintBars(); await wait(300); }
      return;
    }
    case 'hit': {
      const e = foeAt();
      if (f.why === 'burn') { if (fxOn) FX().fire?.([e], 500); floatAt(e.x, e.y - 10, `${ico('fire', 'xs')}${f.dmg}`, 'dmg'); sfx.fire?.(); }
      else if (f.why === 'potion') { if (fxOn) FX().impact(e.x, e.y, PALETTES.fire, 1.8); floatAt(e.x, e.y - 10, `${f.dmg}`, 'dmg big'); sfx.boom?.(1); }
      const sr = ui.show.eblk > 0 && f.blocked && ui.show.eblk - f.blocked <= 0 ? shieldRect() : null;
      setShow({ ehp: ui.show.ehp - f.dmg, eblk: Math.max(0, ui.show.eblk - f.blocked) });
      repaintBars();
      shieldBreak(sr);
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
      if (!Run.omen(R, 'fog')) floatAt(e.x, e.y + 40, `${runIco('hex', f.t, h.icon, 'xs')} ${h.ko}`, 'gold');   // 짙은 안개: 방해 이름은 미리 알리지 않는다
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
      <button class="pbtn gold" data-act="run-leave">${rw.kind === 'boss' ? '다음 막으로' : rw.kind === 'start' ? '출발' : '지도로'}</button>
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
const autoTakes = it => !it.done && (it.t === 'gold' || (it.t === 'potion' && R.potions.length < Run.POTION_SLOTS));
// 보상 칸: 가로세로가 비슷한 타일. 저절로 받는 것(골드 · 물약)은 「받음」, 직접 고르는 것은 「고르기」 · 「받기」 표시
function rewardRow(it, k) {
  const done = it.done ? ' done' : '';
  const full = it.t === 'potion' && !it.done && R.potions.length >= Run.POTION_SLOTS;
  const tag = it.done ? '<em class="rw-tag ok">받음</em>' : full ? '<em class="rw-tag warn">물약 칸 가득</em>'
    : ['card', 'relicPick'].includes(it.t) ? '<em class="rw-tag pick">고르기 ▸</em>' : it.t === 'gold' || it.t === 'potion' ? '' : '<em class="rw-tag pick">받기</em>';
  if (it.t === 'gold') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico('coins')}<b>골드 ${it.n}</b>${tag}</button>`;
  if (it.t === 'potion') { const p = Run.potionInfo(it.id); return `<button class="rw${done}${full ? ' full' : ''}" data-act="run-take" data-k="${k}" style="--pc:${p.color}">${runIco('potion', p.id, p.icon)}<b>${p.ko}</b><small>${p.desc}</small>${tag}</button>`; }
  if (it.t === 'relic') { const r = Run.relicInfo(it.id); return `<button class="rw relic-row r${r.r}${done}" data-act="run-take" data-k="${k}">${relicIco(r)}<b>${r.ko}</b><small>${r.desc}</small>${tag}</button>`; }
  if (it.t === 'relicPick') return `<button class="rw boss-relic${done}" data-act="run-relicpick" data-k="${k}">${ico('crown')}<b>${it.kind === 'boss' ? '보스 유물' : '유물'}</b><small>${it.opts.length}개 중 1개</small>${tag}</button>`;
  if (it.t === 'flip' || it.t === 'nudge') return `<button class="rw${done}" data-act="run-take" data-k="${k}">${ico(it.t)}<b>${it.t === 'flip' ? '뒤집기' : '조정'} +${it.n}</b>${tag}</button>`;
  if (it.t === 'card') return `<button class="rw card-row${done}" data-act="run-cardpick" data-k="${k}">${ico('card')}<b>카드</b><small>${it.opts.length}장 중 1장</small>${tag}</button>`;
  return '';
}
async function takeItem(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  try { Run.takeReward(R, k); } catch (e) { return X.toast(ico('warn'), '받을 수 없어요', e.message, 1700); }
  drain();
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
    <h2>보상</h2>
    <div class="pick-cards" style="--n:${it.opts.length}">${it.opts.map((c, i) => `<button class="rc rc-static pick" data-act="run-cardtake" data-i="${i}" style="--d:${i * 90}ms">${cardFace(c)}</button>`).join('')}</div>
    <div class="pick-actions">${rerollBtn('run-repick', Run.rrOf(R).pick, k)}<button class="pbtn small" data-act="run-deck">내 덱 보기</button><button class="pbtn small" data-act="run-cardskip">건너뛰기</button></div>
  </div></div>`;  // 카드를 길게 누르면 설명 (누르면 바로 가져간다)
  X.layer.querySelectorAll('.pick-cards .rc').forEach((el, i) => longPress(el, () => X.popover(el, cardTip(it.opts[i]), { afterRelease: true })));
}
function cardTake(i) {
  const k = ui.cardPick;
  const el = X.layer.querySelector(`[data-act=run-cardtake][data-i="${i}"]`);
  try { Run.takeReward(R, k, i); } catch (e) { return X.toast(ico('warn'), '받을 수 없어요', e.message, 1500); }
  drain();
  sfx.legend();
  if (el) { el.classList.add('taken'); const p = center(el); FX().burst(p.x, p.y, { n: 40, pal: PALETTES.gold }); }
  ui.cardPick = null;
  save();
  setTimeout(() => { X.layer.innerHTML = ''; if (R.phase === 'reward') showReward(); }, 520);
}
// 새로고침 버튼 (남은 횟수가 없으면 회색)
const rerollBtn = (act, n, k = '') => `<button class="pbtn small reroll-btn" data-act="${act}" ${k !== '' ? `data-k="${k}"` : ''} ${n > 0 ? '' : 'disabled'}>${ico('recycle', 'xs')} 새로고침 <b>${n}</b></button>`;
function relicPick(k) {
  const it = R.reward.items[k];
  if (!it || it.done) return;
  ui.relicPick = k;
  sfx.legend();
  X.layer.innerHTML = `<div class="overlay run-pick" data-act="noop"><div class="pick-box">
    <h2>${it.kind === 'boss' ? '보스 유물' : '유물'} 1개를 고르세요</h2>
    <div class="relic-picks n${it.opts.length}">${it.opts.map((id, i) => { const r = Run.relicInfo(id); return `<button class="relic-card r${r.r}" data-act="run-relictake" data-i="${i}">${relicIco(r, 'lg')}<b>${r.ko}</b><small>${r.desc}</small></button>`; }).join('')}</div>
    <div class="pick-actions">${rerollBtn('run-repick', Run.rrOf(R).pick, k)}<button class="pbtn small" data-act="run-relicskip">건너뛰기</button></div>
  </div></div>`;
}

// ── 상점 ─────────────────────────────────────────────────────────────────────
function showShop() {
  playBgm('run_map');
  const sh = R.shop;
  const price = (p, sold) => `<em class="price${!sold && R.gold < p ? ' poor' : ''}">${sold ? '판매됨' : `${ico('coins', 'xs')}${p}`}</em>`;
  // 진열대: 아이콘과 가격표만. 누르면 산다, 길게 누르면 설명
  const tips = [];
  const item = (attrs, icon, p, sold, tip, cls = '') => { tips.push(tip); return `<button class="shelf-item${cls}${sold ? ' sold' : ''}" ${attrs} data-ti="${tips.length - 1}" ${sold ? 'disabled' : ''}><span class="si-ico">${icon}</span>${price(p, sold)}</button>`; };
  const tipOf = (title, desc, sub = '') => `<b>${title}</b>${sub ? ` <small>${sub}</small>` : ''}<p>${desc}</p>`;
  const cards = sh.cards.map((it, i) => item(`data-act="run-buy" data-kind="card" data-i="${i}"`, `<div class="rc rc-static">${cardFace(it.c)}</div>`, it.price, it.sold, cardTip(it.c), ' card'));
  const seals = (sh.seals || []).map((it, i) => { const sl = Run.sealInfo(it.id); return item(`data-act="run-buy" data-kind="seal" data-i="${i}" style="--sc:${sl.color}"`, `<i class="seal-big s-${it.id}">${sealIco(it.id, '')}</i>`, it.price, it.sold, tipOf(`${sealIco(it.id)} ${sl.ko}`, sl.desc, '카드에 붙이는 일회용 효과'), ' seal-row'); });
  const relics = sh.relics.map((it, i) => { const r = Run.relicInfo(it.id); return item(`data-act="run-buy" data-kind="relic" data-i="${i}"`, relicIco(r, 'lg'), it.price, it.sold, tipOf(`${relicIco(r, 'xs')} ${r.ko}`, r.desc, ['', '일반', '희귀', '보스'][r.r]), ` si-relic r${r.r}`); });
  const potions = sh.potions.map((it, i) => { const p = Run.potionInfo(it.id); return item(`data-act="run-buy" data-kind="potion" data-i="${i}" style="--pc:${p.color}"`, runIco('potion', p.id, p.icon, 'lg'), it.price, it.sold, tipOf(p.ko, p.desc, '물약')); });
  const tools = sh.tools.map((it, i) => item(`data-act="run-buy" data-kind="tool" data-i="${i}"`, ico(it.kind, 'lg'), it.price, it.sold, tipOf(`${it.kind === 'flip' ? '뒤집기' : '조정'} +1`, `${it.kind === 'flip' ? '주사위 1개를 반대 면으로' : '주사위 1개를 ±1'} (최대 ${Run.TOOL_CAP})`)));
  const smith = item(`data-act="run-shopsmith"${!sh.smithed && !R.deck.some(Run.canUpgrade) ? ' disabled' : ''}`, runIco('ui', 'smith', 'axe', 'lg'), Run.smithPrice(R), sh.smithed, tipOf('대장장이', `카드 1장 강화 (점수 +30% 또는 효과 새기기, 최대 ${Run.KW_MAX}개)`));
  const remove = item('data-act="run-remove"', ico('skull', 'lg'), Run.removePrice(R), sh.removed, tipOf('카드 제거', '덱에서 카드 1장을 없앤다'));
  const shelf = (list, cls = '') => (list.length ? `<div class="shelf${cls}"><div class="shelf-row">${list.join('')}</div><i class="shelf-plank" aria-hidden="true"></i></div>` : '');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-shop">
    ${hud()}
    <div class="shop-head market"><i class="mk-awning" aria-hidden="true"></i><img class="run-scene sm" src="${sceneURL('shop')}" alt=""><div><b>떠돌이 상점</b></div>${rerollBtn('run-reshop', Run.rrOf(R).shop)}</div>
    <div class="shop-scroll shop-stall">
      ${shelf(cards, ' cards')}
      ${shelf([...seals, ...relics])}
      ${shelf([...potions, ...tools, smith, remove])}
    </div>
    <button class="pbtn gold" data-act="run-shopleave">상점 나가기</button>
    ${heroStrip()}
  </div>`;
  ui.shopTips = tips;
  X.app.querySelectorAll('.shelf-item[data-ti]').forEach(el => longPress(el, () => X.popover(el, tips[el.dataset.ti], { afterRelease: true })));
}

// ── 휴식 ─────────────────────────────────────────────────────────────────────
function showRest() {
  playBgm('run_map');
  X.layer.innerHTML = '';
  X.app.innerHTML = `
  <div class="screen run-rest">
    ${hud()}
    <div class="camp"><div class="campfire" id="campfire"><img class="run-scene" src="${sceneURL('rest')}" alt=""></div><b>모닥불</b></div>
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
function showEvent(rolled = false) {
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
      ${R.event.dice ? `<div class="ev-dice${ui.evRoll ? ' rolling' : rolled ? ' settled' : ''}">${R.event.dice.map(v => `<i class="dd-die" data-v="${v}">${miniDie(ui.evRoll ? 1 + Math.floor(Math.random() * 6) : v)}</i>`).join('')}</div>` : ''}
      ${R.event.yacht && res == null ? yachtView(R.event.yacht)
        : ui.evRoll ? '<p class="ev-result wait">주사위를 굴린다…</p>'
        : res != null ? `<p class="ev-result">${esc(res)}</p><button class="pbtn gold" data-act="run-evleave">계속</button>`
        : `<div class="ev-opts">${ev.opts.map((o, k) => { const ok = o.can(R); const d = typeof o.desc === 'function' ? o.desc(R) : o.desc; return `<button class="pbtn ev-opt" data-act="run-evopt" data-k="${k}" ${ok ? '' : 'disabled'}><span>${esc(o.ko)}</span><small>${esc(d)}</small></button>`; }).join('')}</div>`}
    </div>
    ${heroStrip()}
  </div>`;
  if (R.pick?.why === 'face') showCarve();
}
// 주사위 깎는 노인: 야추 한 턴 (주사위를 눌러 잡고, 3번까지 굴린다)
function yachtView(y) {
  const done = y.done;
  return `<div class="ev-yacht">
    <div class="ev-dice yacht${ui.yRoll ? ' rolling' : ''}">${y.dice.map((v, i) => `<button class="dd-die${y.held[i] ? ' held' : ''}" data-act="run-yhold" data-i="${i}" ${y.rolls === 3 || done ? 'disabled' : ''}>${v ? miniDie(ui.yRoll && !y.held[i] ? 1 + Math.floor(Math.random() * 6) : v) : '<span class="md q">?</span>'}</button>`).join('')}</div>
    ${done ? `<p class="ev-result">${esc(Run.cardTitle(done.cat))} ${done.score}점 → 주사위 면 <b>${done.n}</b>개 깎기</p>`
      : `<p class="ev-carve-rule">10점 이하 1면 · 20점 이하 2면 · 30점 이하 3면 · 요트 4면</p>
      <div class="ev-opts"><button class="pbtn gold" data-act="run-yroll" ${ui.yRoll ? 'disabled' : ''}>굴리기 <small>남은 ${y.rolls}번</small></button>${y.rolls < 3 ? '<button class="pbtn" data-act="run-ystop">여기서 멈추기</button>' : ''}</div>`}
  </div>`;
}
// 주사위 면 깎기: 주사위를 고르고 → 바꿀 면 → 새 눈
function showCarve() {
  const pk = R.pick, sel = ui.carve;
  X.layer.innerHTML = `<div class="overlay run-carve" data-act="noop"><div class="deck-box">
    <h2>${ico('axe')} 주사위 면 깎기 <small>남은 ${pk.left}면</small></h2>
    <div class="carve-dice">${[0, 1, 2, 3, 4].map(i => `<div class="carve-row"><b>${i + 1}</b>${Run.facesOf(R, i).map((v, f) => `<button class="cface${sel?.i === i && sel?.f === f ? ' on' : ''}${Run.facesOf(R, i) !== Run.DIE_FACES && v !== f + 1 ? ' carved' : ''}" data-act="run-cface" data-i="${i}" data-f="${f}">${miniDie(v)}</button>`).join('')}</div>`).join('')}</div>
    ${sel ? `<p class="hint">${sel.i + 1}번 주사위의 「${Run.facesOf(R, sel.i)[sel.f]}」 면을 → </p><div class="carve-vals">${[1, 2, 3, 4, 5, 6].map(v => `<button class="cface val" data-act="run-cval" data-v="${v}" ${v === Run.facesOf(R, sel.i)[sel.f] ? 'disabled' : ''}>${miniDie(v)}</button>`).join('')}</div>` : ''}
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">그만두기</button></div>
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
}

// ── 덱 고르기 (강화 · 제거 · 복제) / 덱 보기 ─────────────────────────────────
function showPick() {
  const pk = R.pick;
  if (pk.why === 'face') return showCarve();
  if (pk.opts) return showUpgrade();
  const title = { upgrade: '강화', remove: '제거', dup: '복제', seal: `${Run.sealInfo(pk.seal)?.ko}` }[pk.why];
  const list = Run.deckCards(R).filter(c => (pk.why === 'upgrade' ? Run.canUpgrade(c) : pk.why === 'seal' ? !c.seal : true));
  const sel = ui.pickU != null ? R.deck.find(c => c.u === ui.pickU) : null;
  X.layer.innerHTML = `<div class="overlay run-deckpick" data-act="noop"><div class="deck-box">
    <h2>${title}</h2>
    ${pk.why === 'seal' ? sealNotice(pk) : pk.cost ? `<p class="hint">${ico('coins', 'xs')} ${pk.cost} 골드</p>` : pk.hp ? `<p class="hint">체력 ${pk.hp}을 잃어요</p>` : ''}
    <div class="deck-grid">${list.map(c => `<button class="rc rc-static mini${ui.pickU === c.u ? ' on' : ''}" data-act="run-pickcard" data-u="${c.u}">${cardFace(c)}</button>`).join('')}</div>
    ${sel ? `<div class="pick-prev"><div class="rc rc-static">${cardFace(sel)}</div></div>` : ''}
    <div class="pick-actions"><button class="pbtn small" data-act="run-pickcancel">취소</button><button class="pbtn small gold" data-act="run-pickok" ${sel ? '' : 'disabled'}>${{ upgrade: '다음', remove: '제거', dup: '복제', seal: '붙이기' }[pk.why]}</button></div>
  </div></div>`;
}
// 인장을 붙일 카드 고르기 안내: 어떤 인장을 · 어떤 카드에 붙이는지
function sealNotice(pk) {
  const sl = Run.sealInfo(pk.seal);
  const sel = ui.pickU != null ? R.deck.find(c => c.u === ui.pickU) : null;
  return `<div class="seal-notice" style="--sc:${sl.color}"><i class="sn-ico">${sealIco(pk.seal, '')}</i>
    <span><i class="sn-line"><b>${sl.ko}</b>을 붙일 카드를 고르세요</i><small>${sl.desc}${pk.cost ? ` · ${ico('coins', 'xs')}${pk.cost}` : ''}</small>
    ${sel ? `<em>→ <b>${esc(Run.cardName(sel))}</b> 에 붙여요</em>` : '<em>인장이 없는 카드만 고를 수 있어요</em>'}</span></div>`;
}
// 강화 고르기: 점수 +30% 또는 새 효과 (3개 중 1개). 고르면 바뀐 카드를 미리 보여 준다
function showUpgrade() {
  const pk = R.pick, c = R.deck.find(x => x.u === pk.u);
  const after = o => (o === 'up' ? { ...c, up: 1 } : { ...c, kws: [...Run.kwsOf(c), o] });
  X.layer.innerHTML = `<div class="overlay run-deckpick" data-act="noop"><div class="deck-box">
    <div class="up-head"><img class="run-scene" src="${sceneURL('smith')}" alt=""><h2>강화</h2></div>
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
    ${Object.keys(R.dfaces || {}).length ? `<h3>깎은 주사위</h3><div class="carve-dice">${Object.keys(R.dfaces).map(i => `<div class="carve-row"><b>${Number(i) + 1}</b>${Run.facesOf(R, Number(i)).map(v => `<span class="cface">${miniDie(v)}</span>`).join('')}</div>`).join('')}</div>` : ''}
    <div class="pick-actions"><button class="pbtn small gold" data-act="close">닫기</button></div>
  </div></div>`;
}

// ── 시험 원정 샌드박스 (테스트판 전용 · 정식 출시 전에 시험 원정 버튼과 함께 지울 것) ──
// 유물 · 카드 · 소모품 · 적 · 징조 · 주사위를 마음대로 바꾸고, 손패 카드의 점수 계산을 줄줄이 본다.
const SB_TABS = [['score', '점수'], ['relic', '유물'], ['card', '카드'], ['item', '소모품'], ['foe', '적'], ['event', '이벤트'], ['omen', '징조']];
const sbState = () => (ui.sb ||= { tab: R.phase === 'combat' ? 'score' : 'relic', cat: 'ones', up: 0, kws: [], seal: '' });
function showSandbox() {
  const sb = sbState(), C = R.phase === 'combat' && R.C?.phase === 'roll' ? R.C : null;
  const chip = (act, v, on, label, extra = '') => `<button class="sb-chip${on ? ' on' : ''}" data-act="${act}" data-v="${v}"${extra}>${label}</button>`;
  let body = '';
  if (sb.tab === 'score') {
    if (!C) body = '<p class="dim">전투 중에만 볼 수 있어요. 「적」 탭에서 싸울 적을 고르세요.</p>';
    else {
      const dice = C.rolled ? C.dice : [];
      body = `<h3>주사위 <small>${C.rolled ? '눈을 눌러 바꾸기' : '먼저 굴려 주세요'}</small></h3>
        <div class="sb-dice">${dice.map((v, i) => `<button class="sb-die" data-act="run-sbdie" data-i="${i}">${miniDie(v)}<b>${v}</b></button>`).join('')}</div>
        <div class="sb-row">${chip('run-sbx', 'rolls', false, '굴림 +1')}${chip('run-sbx', 'hex', false, '방해 · 약화 풀기')}${chip('run-sbx', 'foe999', false, '적 체력 999')}${chip('run-sbx', 'foe1', false, '적 체력 1')}</div>
        <h3>손패 점수 계산</h3>
        ${C.hand.map((c, hi) => {
          if (!C.rolled) return `<div class="sb-score"><b>${esc(Run.cardName(c))}</b><span class="dim">굴린 뒤에 계산</span></div>`;
          const sc = Run.scoreCard(R, c), a = Run.preview(R, hi, 'enemy', sc), d = Run.preview(R, hi, 'self', sc);
          return `<div class="sb-score"><b>${esc(Run.cardName(c))}${c.seal ? ` ${sealIco(c.seal)}` : ''}</b>
            <ol><li>기본 점수 <em>${sc.base}</em></li>${sc.parts.map(p => `<li class="${p.mul ? 'mul' : ''}">${esc(p.ko)} <em>${p.amt > 0 ? '+' : ''}${p.amt}</em>${p.mul ? ' <small>곱</small>' : ''}</li>`).join('')}${sc.notes.map(n => `<li class="note">${esc(n)}</li>`).join('')}</ol>
            <p class="sb-tot">= <b>${sc.total}</b> · ${ico('sword', 'xs')}피해 ${a.dmg}${a.gold ? ` · ${ico('coins', 'xs')}${a.gold}` : ''} · ${ico('shield', 'xs')}전부 방어 ${d.block}</p></div>`;
        }).join('')}`;
    }
  } else if (sb.tab === 'relic') {
    const grp = [[1, '일반'], [2, '희귀'], [3, '보스']];
    body = `<p class="dim">눌러서 넣고 빼기 · 가진 유물 ${R.relics.length}개</p>${grp.map(([r, ko]) => `<h3>${ko}</h3><div class="sb-grid">${Run.RELICS.filter(x => x.r === r).map(x => `<button class="sb-relic${Run.hasRelic(R, x.id) ? ' on' : ''}" data-act="run-sbrelic" data-v="${x.id}" title="${esc(x.desc)}">${relicIco(x, 'xs')}<span>${esc(x.ko)}</span></button>`).join('')}</div>`).join('')}`;
  } else if (sb.tab === 'card') {
    const preview = { u: -7, cat: sb.cat, up: sb.up, kws: sb.kws, seal: sb.seal || null };
    body = `<h3>족보</h3><div class="sb-row">${Run.SAME_CATS_ALL.map(c => chip('run-sbcat', c, sb.cat === c, esc(Run.cardTitle(c)))).join('')}</div>
      <h3>효과 <small>3개까지</small></h3><div class="sb-row">${Run.KW_IDS.map(k => chip('run-sbkw', k, sb.kws.includes(k), `${runIco('kw', k, Run.KEYWORDS[k].icon, 'xs')}${Run.KEYWORDS[k].ko}`)).join('')}</div>
      <h3>강화 · 인장</h3><div class="sb-row">${chip('run-sbup', 1, sb.up, '강화 +')}${chip('run-sbseal', '', !sb.seal, '인장 없음')}${Run.SEAL_IDS.map(id => chip('run-sbseal', id, sb.seal === id, `${sealIco(id)}${Run.sealInfo(id).ko}`)).join('')}</div>
      <div class="sb-make"><div class="rc rc-static">${cardFace(preview)}</div><div class="sb-col">
        <button class="pbtn small gold" data-act="run-sbadd" data-v="deck">덱에 넣기</button>
        ${C ? '<button class="pbtn small" data-act="run-sbadd" data-v="hand">손패에 바로 넣기</button>' : ''}</div></div>
      <h3>내 덱 <small>${R.deck.length}장 · 눌러서 빼기</small></h3>
      <div class="deck-grid">${Run.deckCards(R).map(c => `<button class="rc rc-static mini sb-del" data-act="run-sbdel" data-v="${c.u}">${cardFace(c)}</button>`).join('')}</div>`;
  } else if (sb.tab === 'item') {
    body = `<h3>물약 <small>${R.potions.length}/${Run.POTION_SLOTS}</small></h3><div class="sb-row">${Run.POTIONS.map(p => chip('run-sbpot', p.id, false, `${runIco('potion', p.id, p.icon, 'xs')}${p.ko}`)).join('')}${chip('run-sbx', 'nopot', false, '물약 비우기')}</div>
      <h3>자원</h3><div class="sb-row">${chip('run-sbx', 'gold', false, `${ico('coins', 'xs')}골드 +100`)}${chip('run-sbx', 'flip', false, `${ico('flip', 'xs')}뒤집기 +1`)}${chip('run-sbx', 'nudge', false, `${ico('nudge', 'xs')}조정 +1`)}${R.cls === 'dancer' ? chip('run-sbx', 'dance', false, '춤사위 +1') : ''}${chip('run-sbx', 'hp', false, `${ico('heart', 'xs')}체력 가득`)}${chip('run-sbx', 'maxhp', false, '최대 체력 +10')}${chip('run-sbx', 'rrshop', false, `${ico('recycle', 'xs')}상점 새로고침 +1 (${Run.rrOf(R).shop})`)}${chip('run-sbx', 'rrpick', false, `${ico('recycle', 'xs')}카드 · 유물 새로고침 +1 (${Run.rrOf(R).pick})`)}</div>
      <h3>무적</h3><div class="sb-row">${chip('run-sbx', 'god', R.sbGod, R.sbGod ? '무적 켜짐 (체력 1 아래로 안 내려감)' : '무적 끄기 상태 · 눌러서 켜기')}</div>`;
  } else if (sb.tab === 'foe') {
    const kinds = [['normal', '일반'], ['elite', '엘리트'], ['boss', '보스']];
    body = `<p class="dim">고르면 바로 싸워요. 이기면 보상을 받고 지도로 돌아와요 (막 · 층 그대로). 적 체력은 지금 막(${R.act}막) 기준.</p>
      <div class="sb-row">${[1, 2, 3].map(n => chip('run-sbact', n, R.act === n, `${n}막`)).join('')}</div>
      ${kinds.map(([k, ko]) => `<h3>${ko}</h3><div class="sb-grid foes">${Object.entries(Run.ENEMIES).filter(([, e]) => e.kind === k).map(([id, e]) => `<button class="sb-foe" data-act="run-sbfoe" data-v="${id}"><img src="${foeURL(id)}" alt=""><span>${esc(e.ko)}</span><small>${e.act}막</small></button>`).join('')}</div>`).join('')}`;
  } else if (sb.tab === 'event') {
    body = `<p class="dim">눌러서 그 이벤트로 바로 가기</p><div class="sb-grid events">${Run.EVENTS.map(e => `<button class="sb-ev" data-act="run-sbevent" data-v="${e.id}">${sceneURL(e.id) ? `<img src="${sceneURL(e.id)}" alt="">` : ico(e.art, 'lg')}<span>${esc(e.ko)}</span></button>`).join('')}</div>`;
  } else if (sb.tab === 'omen') {
    body = `<div class="sb-col">${chip('run-sbomen', '', !R.omen, '징조 없음')}${Run.OMENS.map(o => chip('run-sbomen', o.id, R.omen === o.id, `${omenIco(o, 'xs')}<b>${o.ko}</b> <small>${esc(o.desc)}</small>`)).join('')}</div>`;
  }
  X.layer.innerHTML = `<div class="overlay run-sb" data-act="close-bg"><div class="deck-box sb-box" data-act="noop">
    <h2>시험 원정 · 샌드박스</h2>
    <div class="sb-tabs">${SB_TABS.map(([id, ko]) => `<button class="sb-tab${sb.tab === id ? ' on' : ''}" data-act="run-sbtab" data-v="${id}">${ko}</button>`).join('')}</div>
    <div class="sb-body">${body}</div>
    <div class="pick-actions"><button class="pbtn small gold" data-act="run-sbclose">닫기</button></div>
  </div></div>`;  // 유물을 길게 누르면 설명 (짧게 누르면 넣고 빼기)
  X.layer.querySelectorAll('.sb-relic').forEach(el => longPress(el, () => { const x = Run.relicInfo(el.dataset.v); X.popover(el, `<b>${relicIco(x, 'xs')} ${esc(x.ko)}</b> <small>${['', '일반', '희귀', '보스'][x.r] || ''}</small><p>${esc(x.desc)}</p>`, { afterRelease: true }); }));
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
  const run = fn => { try { fn(); } catch (e) { X.toast(ico('warn'), '할 수 없어요', e.message, 1400); return false; } drain(); return true; };
  sfx.tap();
  if (act === 'run-sb') { sfx.select(); return showSandbox(); }
  if (act === 'run-sbclose') { X.layer.innerHTML = ''; return sbRefresh(false); }
  if (act === 'run-sbtab') { sb.tab = v; return showSandbox(); }
  if (act === 'run-sbcat') { sb.cat = v; return showSandbox(); }
  if (act === 'run-sbkw') { sb.kws = sb.kws.includes(v) ? sb.kws.filter(k => k !== v) : sb.kws.length < Run.KW_MAX ? [...sb.kws, v] : sb.kws; return showSandbox(); }
  if (act === 'run-sbup') { sb.up = sb.up ? 0 : 1; return showSandbox(); }
  if (act === 'run-sbseal') { sb.seal = v; return showSandbox(); }
  if (act === 'run-sbadd') { if (run(() => S.card(R, sb, v === 'hand'))) X.toast(ico('card'), '카드를 넣었어요', v === 'hand' ? '손패 · 덱' : '덱', 900); return sbRefresh(); }
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
    const song = kind === 'boss' ? bossSong(v) : kind === 'elite' ? 'run_elite' : 'run_battle';
    return Promise.all([Promise.race([preloadBgm(song), wait(3000)]), X.stageReady()]).then(() => enterView(true));
  }
}

// ── 결과 ─────────────────────────────────────────────────────────────────────
function showEnd() {
  hand?.destroy(); hand = null;
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
  if (fresh) {
    playBgm(won ? 'run_win' : 'run_lose');
    if (won && X.prefs.fx !== 'min') { FX().burst(innerWidth / 2, innerHeight * 0.3, { n: 90, pal: PALETTES.rainbow, speed: [100, 420] }); sfx.levelup?.(); }
  }
}
function paintEnd(arrived) {
  const won = R.won, out = ui.end;
  const opened = !!out?.opened;
  const stars = !out ? `<p class="end-stars wait">${starIco()} 별조각 계산 중…</p>`
    : out.error ? `<p class="end-stars off">${ico('warn', 'xs')} 기록을 저장하지 못했어요</p>`
    : out.offline ? `<p class="end-stars off">${starIco()} 오프라인 원정 · 별조각 없음</p>`
    : `<p class="end-stars">${starIco()} 별조각 <b>+${out.stars || 0}</b></p>`;
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
      <p class="hint">${R.asc ? `하드모드 ${R.asc} · ` : ''}덱 ${R.deck.length}장 · 골드 ${st.gold} 획득</p>
      ${stars}
      ${opened ? `<p class="asc-open">${ico('up', 'xs')} ${esc(classInfo(R.cls).ko)} 하드모드 ${(R.asc || 0) + 1} 열림!</p>` : ''}
      <div class="res-actions"><button class="pbtn" data-act="run-home">메인으로</button><button class="pbtn gold" data-act="run-again">다시 원정</button></div>
    </div>
  </div>`;
  if (arrived && out?.stars) setTimeout(() => sfx.stars?.(out.stars), won ? 1100 : 600);
  if (arrived && opened) setTimeout(() => sfx.ascend?.(), 2000);
}

// ── 메뉴 ─────────────────────────────────────────────────────────────────────
function showMenu() {
  X.layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>원정 일시정지</h2>
    <p class="hint">${R.act}막 · ${esc(Run.ACT_INFO[R.act].ko)} · 체력 ${R.hp}/${R.maxHp}</p>
    <div class="modal-actions">
      <button class="pbtn gold" data-act="close">계속하기</button>
      <button class="pbtn" data-act="run-deck">덱 보기</button>${R.trial ? '\n      <button class="pbtn" data-act="run-sb">샌드박스</button>' : ''}
      <button class="pbtn" data-act="settings">설정</button>
      <button class="pbtn" data-act="run-home">메인 메뉴로</button>
      <button class="pbtn danger" data-act="run-giveup">원정 포기</button>
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
    // 가운데 온 캐릭터가 한마디 (다이얼이 다 돈 뒤)
    const id = ui.cls;
    clearTimeout(ui.lineT);
    ui.lineT = setTimeout(() => { const el = X.app.querySelector('.rs-dial .dial-hero.d0'); if (el && ui.cls === id) onAct('run-talk', el); }, 280);
    return;
  }
  if (act === 'run-talk') { const l = RUN_LINES[t.dataset.id] || ['…']; return X.speak(t, l[runLineK++ % l.length]); }
  // 원정 떠나기: 하드모드가 열렸으면 단계를 고르는 창, 아니면 바로 출발
  if (act === 'run-go') { if (!ascOpen(best(), ui.cls)) return onAct('run-start', t); sfx.select(); return showAsc(); }
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
  if (act === 'run-start' || act === 'run-again' || act === 'run-trial') {
    sfx.start();
    const trial = act === 'run-trial' || (act === 'run-again' && R?.trial);
    const cls = act === 'run-again' ? R?.cls || ui.cls : ui.cls;
    const lv = act === 'run-again' && R ? R.asc || 0 : ui.asc || 0;
    if (ui.starting) return;
    ui.starting = true;
    // 배포판은 서버가 시드를 정하고 그때의 원정 준비를 적어 둔다 (끝날 때 행동 기록을 다시 돌려 맞춰 본다)
    return Prog.startRun(cls, lv).then(s => {
      R = Run.createRun({ cls, name: X.name(), asc: lv, seed: s.seed, meta: s.meta });
      R.xid = s.id;
      if (trial) Run.trialKit(R);          // 시험 원정: 에이스 · 듀스 · 트레이 + 회귀자의 망토 · 세포배양관 · 프리즘
      ui.recorded = false; ui.end = null; ui.featShown.clear();
      save();
      const r0 = R;
      return preloadRun().then(() => {
        if (R !== r0) return;
        enterView(true);
        const sealed = R.deck.filter(c => c.seal);           // 영구 강화 「인장 상자」: 출발할 때 붙은 인장
        if (sealed.length) stampShow(sealed, `${ico('sparkle', 'xs')} 인장 상자`);
      });   // 다 받은 뒤 지도로 (보물 지도가 있으면 출발 유물부터)
    }).finally(() => { ui.starting = false; });   // 다 받은 뒤 지도로 (보물 지도가 있으면 출발 유물부터)
  }
  if (!R) return;
  if (act === 'run-menu') { sfx.select(); return showMenu(); }
  if (act.startsWith('run-sb')) return R.trial ? sbAct(act, t) : undefined;
  if (act === 'run-giveup') {
    if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = '한 번 더 누르면 포기해요'; sfx.select(); return; }
    try { Run.giveUp(R); } catch { /* 이미 끝남 */ }
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
    if (!Run.nextNodes(R).includes(id)) {         // 못 가는 칸: 무슨 칸인지만 알려 준다
      const ty = Run.mapNode(R, id).type, nd = Run.NODE[ty];
      sfx.tap();
      return X.popover(t, `<b>${ty === 'boss' ? '' : `${runIco('node', ty, nd.icon, 'xs')} `}${nd.ko}${ty === 'boss' && R.act < Run.ACTS ? ' ???' : ''}</b>`);
    }
    sfx.start();
    try { Run.enterNode(R, id); } catch (e) { return X.toast(ico('warn'), '갈 수 없어요', e.message, 1400); }
    drain();
    save();
    t.classList.add('go');
    // 전투 칸: 그 곡이 준비될 때까지 (최대 3초) 기다렸다가 들어간다
    const ty = Run.mapNode(R, id).type;
    const song = ty === 'boss' ? bossSong(R.boss) : ty === 'elite' ? 'run_elite' : ty === 'fight' ? 'run_battle' : null;
    const ready = song ? Promise.race([preloadBgm(song), wait(3000)]) : null;
    return Promise.all([ready, wait(260), song && X.stageReady()]).then(() => enterView(true));
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
    try { Run.rerollPick(R, k); } catch (e) { return X.toast(ico('warn'), '새로고침할 수 없어요', e.message, 1400); }
    drain(); save(); sfx.card(); sfx.whoosh?.();
    X.layer.querySelectorAll('.pick-cards .rc, .relic-card').forEach(el => el.classList.add('reroll-out'));
    return wait(220).then(() => (it.t === 'card' ? cardPick(k) : relicPick(k)));
  }
  if (act === 'run-reshop') {
    try { Run.rerollShop(R); } catch (e) { return X.toast(ico('warn'), '새로고침할 수 없어요', e.message, 1400); }
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
    if (left && !t.dataset.sure) { t.dataset.sure = '1'; t.textContent = '받지 않은 보상이 있어요 · 한 번 더 누르면 떠나요'; sfx.select(); return; }
    sfx.start();
    const boss = R.reward?.kind === 'boss';
    Run.leaveReward(R);
    const fx = drain();
    save();
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
      try { Run.eventRoll(R); } catch (e) { return X.toast(ico('warn'), '굴릴 수 없어요', e.message, 1400); }
      Run.drainFx(R); sfx.clack?.(); save(); showEvent(true);
    });
  }
  if (act === 'run-yhold') { try { Run.eventHold(R, Number(t.dataset.i)); } catch { return; } sfx.tap(); save(); return showEvent(true); }
  if (act === 'run-ystop') { try { Run.eventStop(R); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); } Run.drainFx(R); sfx.select(); save(); return showEvent(true); }
  if (act === 'run-cface') { sfx.tap(); ui.carve = { i: Number(t.dataset.i), f: Number(t.dataset.f) }; return showCarve(); }
  if (act === 'run-cval') {
    const c = ui.carve;
    if (!c) return;
    try { Run.carveFace(R, c.i, c.f, Number(t.dataset.v)); } catch (e) { return X.toast(ico('warn'), '깎을 수 없어요', e.message, 1400); }
    Run.drainFx(R); sfx.forge?.(); ui.carve = null; save();
    if (R.pick?.why === 'face') return showCarve();
    X.layer.innerHTML = '';
    return showEvent(true);
  }
  if (act === 'run-omen') {
    try { Run.chooseOmen(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), '고를 수 없어요', e.message, 1400); }
    drain(); sfx.ascend?.(); save();
    const o = Run.omenInfo(R.omen);
    X.layer.innerHTML = '';
    showMap();
    return X.toast(omenIco(o), `${R.act}막 징조 · ${o.ko}`, omenText(o), 2200);
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
      return X.popover(t, `${ui.shopTips?.[t.dataset.ti] || ''}<div class="buy-btns"><button class="hb" data-act="run-closepop">취소</button><button class="hb gold" data-act="run-buy" data-kind="${t.dataset.kind}" data-i="${t.dataset.i}" data-ok="1" ${poor ? 'disabled' : ''}>${ico('coins', 'xs')}${it.price} 구매</button></div>`);
    }
    X.closePopover();
    if (t.dataset.kind === 'seal') {
      try { Run.buy(R, 'seal', Number(t.dataset.i)); } catch (e) { sfx.back(); return X.toast(ico('warn'), '살 수 없어요', e.message, 1400); }
      sfx.select(); ui.pickU = null;
      const sl = Run.sealInfo(R.pick.seal);
      X.toast(sealIco(R.pick.seal, ''), `${sl.ko} · 붙일 카드를 고르세요`, sl.desc, 1800);
      return showPick();
    }
    try { Run.buy(R, t.dataset.kind, Number(t.dataset.i)); } catch (e) { sfx.back(); return X.toast(ico('warn'), '살 수 없어요', e.message, 1400); }
    drain(); sfx.coin(); save();
    const p = center(t); FX().burst(p.x, p.y, { n: 24, pal: PALETTES.gold });
    return showShop();
  }
  if (act === 'run-remove') { try { Run.startRemove(R); } catch (e) { sfx.back(); return X.toast(ico('warn'), '할 수 없어요', e.message, 1500); } sfx.select(); ui.pickU = null; return showPick(); }
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
    try { Run.chooseUpgrade(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
    drain();
    sfx.legend?.();
    const p = center(t); FX().burst(p.x, p.y, { n: 36, pal: PALETTES.gold });
    X.layer.innerHTML = ''; save();
    return from === 'shop' ? showShop() : enterView();
  }
  if (act === 'run-shopsmith') { try { Run.startSmith(R); } catch (e) { sfx.back(); return X.toast(ico('warn'), '할 수 없어요', e.message, 1500); } sfx.select(); ui.pickU = null; return showPick(); }
  if (act === 'run-smith') { try { Run.startUpgrade(R); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); } sfx.select(); ui.pickU = null; return showPick(); }
  // 덱 고르기
  if (act === 'run-pickcard') { sfx.tap(); ui.pickU = Number(t.dataset.u); return showPick(); }
  if (act === 'run-pickcancel') { sfx.back(); Run.cancelPick(R); ui.pickU = null; ui.carve = null; X.layer.innerHTML = ''; save(); return enterView(); }
  if (act === 'run-pickok') {
    if (ui.pickU == null) return;
    const why = R.pick?.why;
    try { Run.pickDeck(R, ui.pickU); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
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
    try { Run.eventChoose(R, Number(t.dataset.k)); } catch (e) { return X.toast(ico('warn'), '고를 수 없어요', e.message, 1400); }
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
  if (act === 'run-hex') { const h = R.C.hex; sfx.tap(); return X.popover(t, `<b>${runIco('hex', h.t, Run.HEX[h.t].icon, 'xs')} ${Run.HEX[h.t].ko}</b><p>${Run.HEX[h.t].desc(h.n)}</p>`); }
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
    return playFx(drain(), r0).then(() => { ui.busy = false; save(); paint(); X.tray()?.show(R.C.dice, R.C.held); });
  }
  if (act === 'run-dance') {
    const r0 = snap();
    try { Run.useDance(R); } catch (e) { return X.toast(ico('warn'), '할 수 없어요', e.message, 1400); }
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
    try { Run.useFlip(R, i); } catch (e) { X.toast(ico('warn'), '할 수 없어요', e.message, 1400); return paint(); }
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
  X.popover(a, `<b>주사위 ${miniDie(v)} ${v}</b><p>뒤집으면 ${7 - v} · 조정하면 ${[v - 1, v + 1].filter(x => x >= 1 && x <= 6).join(' 또는 ')}</p>`, { afterRelease: true });
  a.remove();
}
export function render() { if (R?.phase === 'combat') paint(); }

function intentInfo(t) {
  const C = R.C, m = C.e.intent;
  if (!m) return;
  const parts0 = Run.intentParts(R);
  const parts = parts0.map(p => {
    if (p.k === 'atk') return `${ico('sword', 'xs')} 공격 ${p.n}${p.hits > 1 ? ` × ${p.hits}번` : ''}`;
    if (p.k === 'block') return `${ico('shield', 'xs')} 보호막 ${p.n}`;
    if (p.k === 'str') return `${ico('up', 'xs')} 힘 +${p.n} (이후 공격이 세진다)`;
    if (p.k === 'heal') return `${ico('heart', 'xs')} 체력 ${p.n} 회복`;
    if (p.k === 'steal') return `${ico('coins', 'xs')} 골드 ${p.n} 훔치기${parts0.some(q => q.k === 'atk') ? ' (공격을 다 막으면 못 훔친다)' : ''}`;
    if (p.k === 'weak') return `${ico('snow', 'xs')} 약화 ${p.n}턴 (내 카드 점수 ×0.75)`;
    if (p.k === 'hex') return `${runIco('hex', p.t, Run.HEX[p.t].icon, 'xs')} <b>${Run.HEX[p.t].ko}</b>: ${Run.HEX[p.t].desc(p.n)} (이번 턴)`;
    return '';
  });
  const fury = Run.furyOf(R);
  sfx.tap();
  X.popover(t, `<b>${esc(m.ko)}</b>${parts.map(x => `<p>${x}</p>`).join('')}<small>${fury.from}턴부터 격앙: 적의 턴마다 힘 +${fury.str}</small>`);
}
function potionMenu(k, t) {
  const id = R.potions[k];
  if (!id) return;
  const p = Run.potionInfo(id);
  const can = canAct();
  sfx.tap();
  X.popover(t, `<b style="color:${p.color}">${ico(p.icon, 'xs')} ${p.ko}</b><p>${p.desc}</p><div class="pot-acts">${can ? `<button class="pbtn small gold" data-act="run-potuse" data-k="${k}">마시기</button>` : ''}<button class="pbtn small" data-act="run-potdrop" data-k="${k}">버리기</button></div>`);
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
