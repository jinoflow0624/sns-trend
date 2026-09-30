// 화면 흐름: 스플래시 → 타이틀(터치) → [첫 실행: 스토리 → 튜토리얼] → 메뉴
//   메뉴 → 파티 편성(대전/협동) → 게임 → 결과
//   메뉴 → 온라인 방(만들기/참가) → 로비 → 게임 → 결과
// 룰은 engine.js, 온라인은 net.js, 3D 주사위는 dice3d.js, 소리는 audio.js, 도트 그림은 pixel.js · scenes.js.
import * as E from './engine.js';
import { GAME } from './config.js';
import { spriteURL } from './pixel.js';
import { titleScene, storyScene, STORY } from './scenes.js';
import { sfx, playBgm, preloadBgm, stopBgm, unlock, audioSettings, setAudio, buzz, rumble, canVibrate, bossSong } from './audio.js';
import { STEPS, createTutorialGame } from './tutorial.js';
import * as Net from './net.js';
import { FX, attackStyle, RAGE, shake } from './fx.js';
import { ico, PERK_ICON, QUEST_ICON, EVENT_ICON, SKILL_ICON } from './icons.js';
import { PROD, deleteAccount, linkGoogle, accountInfo } from './fire.js';
import { liveConfig, older, setAnalytics, track } from './live.js';
import { webglOK, DiceTray2D } from './dice2d.js';
import * as Wal from './wallet.js';
import { DICE_SKINS, TRAY_SKINS, diceSkin, traySkin, diceThumb, trayThumb, preloadDice } from './skins.js';

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const coachEl = document.getElementById('coach');
document.title = GAME.name;

const KEYS = { save: 'diceheroes.game', setup: 'diceheroes.setup', opts: 'diceheroes.opts', seen: 'diceheroes.seen', name: 'diceheroes.name', lastRoom: 'diceheroes.lastRoom', profile: 'diceheroes.profile', prefs: 'diceheroes.prefs' };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};
const seen = store.get(KEYS.seen) || {};
// 화면·조작 설정: 연출 속도(normal·fast·min), 그래픽 절약, 글자 크게, 색약 보조
const prefs = { fx: 'normal', lowGfx: false, bigText: false, colorAssist: false, analytics: false, shake: false, diceSkin: 'classic', traySkin: 'classic', ...(store.get(KEYS.prefs) || {}) };
preloadDice(diceSkin(prefs.diceSkin).id).catch(() => {});   // 게임 트레이가 처음부터 그림을 입고 나오게
if (prefs.analytics) setAnalytics(true);
// 배포판: 서버 공지 · 점검 · 최소 버전 (Remote Config). 타이틀을 열 때 받아 둔다
let live = { notice: '', maintenance: false, min_version: '' };
liveConfig().then(v => { live = v; if (screen === 'title') showLiveBar(); });
const FX_RATE = { normal: 1, fast: 1.8, min: 3 };
const fxRate = () => FX_RATE[prefs.fx] || 1;
function applyPrefs() {
  document.documentElement.classList.toggle('big-text', !!prefs.bigText);
  document.documentElement.classList.toggle('color-assist', !!prefs.colorAssist);
}
applyPrefs();
const markSeen = k => { seen[k] = true; store.set(KEYS.seen, seen); };

const BOT_NAMES = ['고블린 봇', '슬라임 봇', '해골 봇', '미믹 봇'];
let setup = store.get(KEYS.setup) || [
  { name: '나', cls: 'warrior', bot: false },
  { name: '고블린 봇', cls: 'mage', bot: true },
  { name: '슬라임 봇', cls: 'bard', bot: true },
];
let opts = { mode: 'versus', boss: 'dragon', diff: 1, ...(store.get(KEYS.opts) || {}) };
let myName = store.get(KEYS.name) || setup.find(p => !p.bot)?.name || '모험가';

let screen = null;          // 'splash' | 'title' | 'story' | 'setup' | 'online' | 'lobby' | 'game'
let stage = null;           // 도트 배경 애니메이션
let S = null;               // 게임 상태
let tray = null;            // 3D 주사위
let tut = null;             // { step, shown } 튜토리얼 진행
let unlocked = false;       // 첫 터치(소리 허용) 여부
let online = null;          // { code, token, backend, room, unwatch, fxSeen, queue, beat }
// sheet: 점수표 창을 띄웠는가 · dice: 연출 중 잠깐 대신 보여 줄 주사위 눈 (보스 스킬 전 / 점수 공격 전)
const ui = { view: null, tool: null, busy: false, fast: false, sheet: false, sheetSeen: new Set(), sheetTurn: '', sheetLast: false, dice: null };
const urlRoom = Net.normalizeCode(new URLSearchParams(location.search).get('room'));

// ── 도우미 ───────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 온라인에서 뒤에 새 상태가 밀려 있으면 연출을 빨리 넘긴다 (다른 사람 행동을 따라잡느라 내 차례가 늦어지지 않게)
const rushing = () => !!online && online.latest !== undefined;
const wait = ms => new Promise(r => setTimeout(r, (rushing() ? ms * 0.25 : ms) / fxRate()));
const br = s => esc(s).replace(/\n/g, '<br>');
const portrait = (id, cl = '') => `<img class="spr ${cl}" src="${spriteURL(id, 4)}" alt="">`;
const perkIco = (id, cls) => ico(PERK_ICON[id], cls);
const questIco = (id, cls) => ico(QUEST_ICON[id], cls);
const eventIco = (id, cls) => ico(EVENT_ICON[id], cls);
const skillIco = (id, cls) => ico(SKILL_ICON[id], cls);
const rarityColor = r => ({ 1: 'var(--common)', 2: 'var(--rare)', 3: 'var(--legend)' }[r]);
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const miniDie = v => `<span class="md${v === 1 ? ' one' : ''}">${[...Array(9)].map((_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
const miniDice = arr => `<span class="mds">${arr.map(miniDie).join('')}</span>`;

// 점수표 칸마다 한 줄 규칙과 예시 주사위
const CAT_HELP = {
  ones:   { rule: '1만 더함',         ex: [1, 1, 1, 4, 5], pts: 3 },
  twos:   { rule: '2만 더함',         ex: [2, 2, 3, 5, 6], pts: 4 },
  threes: { rule: '3만 더함',         ex: [3, 3, 3, 1, 6], pts: 9 },
  fours:  { rule: '4만 더함',         ex: [4, 4, 2, 4, 1], pts: 12 },
  fives:  { rule: '5만 더함',         ex: [5, 5, 5, 5, 2], pts: 20 },
  sixes:  { rule: '6만 더함',         ex: [6, 6, 6, 3, 1], pts: 18 },
  choice: { rule: '아무거나 · 5개 합', ex: [6, 5, 4, 3, 6], pts: 24 },
  four:   { rule: '같은 눈 4개 · 5개 합', ex: [4, 4, 4, 4, 2], pts: 18 },
  full:   { rule: '3개+2개 · 5개 합',  ex: [3, 3, 3, 5, 5], pts: 19 },
  sstr:   { rule: '연속 4개 · 15점',   ex: [1, 2, 3, 4, 6], pts: 15 },
  lstr:   { rule: '연속 5개 · 30점',   ex: [2, 3, 4, 5, 6], pts: 30 },
  yacht:  { rule: '5개 모두 같음 · 50점', ex: [5, 5, 5, 5, 5], pts: 50 },
};

function setStage(next) {
  if (screen !== 'game') FX().rage(false);
  stage?.stop();
  stage = next;
}
function saveOpts() { store.set(KEYS.opts, opts); }

// ── 스플래시 ─────────────────────────────────────────────────────────────────
function showSplash() {
  screen = 'splash';
  preloadBgm('title');
  app.innerHTML = `
  <div class="screen splash" data-act="skip-splash">
    <div class="studio">
      <img class="spr studio-die" src="${spriteURL('fairy', 5)}" alt="">
      <b>${GAME.studio}</b>
      <span>PRESENTS</span>
    </div>
  </div>`;
  setTimeout(() => { if (screen === 'splash') showTitle(); }, 2300);
}

// ── 타이틀 · 메뉴 ────────────────────────────────────────────────────────────
function showTitle() {
  screen = 'title';
  Wal.loadWallet().then(syncOwned, () => {});
  if (unlocked) setTimeout(showDemonUnlock, 600);     // 이미 조건을 채운 사람(업데이트 전 클리어)에게도 한 번
  preload3d().catch(() => {});   // 3D 주사위 엔진을 미리 받아 둔다
  layer.innerHTML = '';
  const saved = store.get(KEYS.save);
  const canResume = saved && !saved.ended && !saved.tutorial && saved.v === 1;
  const last = store.get(KEYS.lastRoom);
  const rejoinLeft = last ? Math.ceil((Net.DROP_MS - (Date.now() - last.t)) / 1000) : 0;
  app.innerHTML = `
  <div class="screen title-screen">
    <canvas class="scene" aria-hidden="true"></canvas>
    <div class="title-ui">
      ${unlocked ? `<button class="gem-chip title-gems" data-act="skins">${ico('gem', 'xs')}<b id="gem-count">${Wal.gems().toLocaleString()}</b></button>` : ''}
      <div class="logo">
        <span class="logo-sub">운명의 주사위 RPG</span>
        <h1 class="logo-main">${esc(GAME.name)}</h1>
        <span class="logo-en">${esc(GAME.en)}</span>
      </div>
      ${unlocked ? `
      <nav class="menu">
        ${rejoinLeft > 0 ? `<button class="pbtn gold" data-act="rejoin" data-code="${esc(last.code)}">방으로 돌아가기 <small>${esc(last.code)} · ${rejoinLeft}초 안에</small></button>` : ''}
        ${canResume ? `<button class="pbtn ${rejoinLeft > 0 ? '' : 'gold'}" data-act="resume">이어하기 <small>${saved.round}라운드</small></button>` : ''}
        <button class="pbtn ${canResume || rejoinLeft > 0 ? '' : 'gold'}" data-act="new">혼자 · 한 기기로</button>
        <button class="pbtn${navigator.onLine ? '' : ' off'}" data-act="online">온라인 방 <small>${navigator.onLine ? '친구 초대' : '인터넷 연결 필요'}</small></button>
        <button class="pbtn" data-act="skins">꾸미기 <small>주사위 · 트레이</small></button>
        <div class="menu-row">
          <button class="pbtn small" data-act="dashboard">대시보드</button>
          <button class="pbtn small" data-act="tutorial">튜토리얼</button>
          <button class="pbtn small" data-act="settings">설정</button>
          <button class="pbtn small" data-act="credits">크레딧</button>
        </div>
      </nav>` : `<button class="touch" data-act="touch">화면을 터치하세요</button>`}
      ${unlocked && !navigator.onLine ? '<p class="offline-note">오프라인이에요 · 혼자 · 한 기기로는 그대로 할 수 있어요</p>' : ''}
      <div id="live-bar"></div>
      <footer class="ver">v${GAME.version} · © ${GAME.year} ${esc(GAME.studio)}</footer>
    </div>
  </div>`;
  showLiveBar();
  setStage(titleScene(app.querySelector('.scene')));
  playBgm('title');   // 터치 전이라도 걸어 둔다 — 허락되면 바로, 아니면 첫 터치 순간 흘러나온다
}

// 지갑이 바뀌면: 시작 화면 보석 숫자 갱신, 안 산 스킨을 쓰고 있었으면 기본으로
Wal.onWallet(w => { const el = document.getElementById('gem-count'); if (el) el.textContent = Wal.gems().toLocaleString(); if (w) syncOwned(); });
function syncOwned() {
  if (!Wal.wallet()) return;
  let changed = false;
  setup.forEach(p => { if (!p.bot && !Wal.owns('cls', p.cls)) { p.cls = firstOwnedClass(); changed = true; } });
  if (changed) store.set(KEYS.setup, setup);
  changed = false;
  if (!Wal.owns('dice', prefs.diceSkin)) { prefs.diceSkin = 'classic'; changed = true; }
  if (!Wal.owns('tray', prefs.traySkin)) { prefs.traySkin = 'classic'; changed = true; }
  if (changed) { store.set(KEYS.prefs, prefs); tray?.setSkin?.(prefs.diceSkin, prefs.traySkin); }
}

function offlineToast() {
  sfx.back();
  return toast(ico('warn'), '인터넷 연결이 없어요', '온라인 방은 인터넷이 필요해요. 혼자 · 한 기기로는 지금 바로 할 수 있어요.', 2400);
}
// 연결이 끊기거나 돌아오면 시작 화면 안내를 고친다
addEventListener('online', () => { if (screen === 'title' && !layer.firstElementChild) showTitle(); });
addEventListener('offline', () => { if (screen === 'title' && !layer.firstElementChild) showTitle(); });

function showLiveBar() {
  const el = document.getElementById('live-bar');
  if (!el) return;
  const lines = [];
  if (live.min_version && older(GAME.version, live.min_version)) lines.push(`${ico('warn', 'xs')} 새 버전이 나왔어요. 스토어에서 업데이트해 주세요.`);
  if (live.maintenance) lines.push(`${ico('warn', 'xs')} 서버 점검 중이라 온라인 방을 잠시 쉬어요.`);
  if (live.notice) lines.push(esc(live.notice));
  el.innerHTML = lines.map(l => `<p class="live-note">${l}</p>`).join('');
}

// ── 흔들어 굴리기 (선택) ─────────────────────────────────────────────────────
// 폰의 가속도 센서로 '흔드는 동작'을 알아채서 굴리기 버튼을 누른 것처럼 처리한다.
// 짧은 시간 안에 세게 두 번 흔들면 굴림 (걷거나 폰을 내려놓는 정도로는 안 굴러가게).
const SHAKE_OK = typeof window.DeviceMotionEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const motion = { on: false, peaks: [], last: 0, grav: null, rolling: false, timer: null };
function onMotion(e) {
  const a = e.acceleration;
  let x = a?.x, y = a?.y, z = a?.z;
  if (x == null) {                       // 중력 제외 값이 없는 기기: 느린 평균(중력)을 빼서 쓴다
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    motion.grav ||= { x: g.x, y: g.y, z: g.z };
    for (const k of ['x', 'y', 'z']) motion.grav[k] += (g[k] - motion.grav[k]) * 0.1;
    x = g.x - motion.grav.x; y = g.y - motion.grav.y; z = g.z - motion.grav.z;
  }
  const mag = Math.hypot(x, y, z);
  const now = performance.now();
  // 흔드는 중: 트레이가 주사위 통처럼 폰 움직임을 그대로 따라간다 (주사위는 관성으로 벽에 부딪힌다)
  if (motion.rolling) {
    tray?.kick?.(x, y, z);
    if (mag > 7) motion.lastStrong = now;
    return;
  }
  if (mag < 13 || now - motion.last < 1200) return;
  motion.peaks = motion.peaks.filter(t => now - t < 600);
  if (motion.peaks.length && now - motion.peaks[motion.peaks.length - 1] < 90) return;   // 같은 흔들림의 연속 값은 한 번으로
  motion.peaks.push(now);
  if (motion.peaks.length < 2) return;
  motion.peaks = [];
  startShakeRoll(x, y, z);
}
const rollReady = () => screen === 'game' && !layer.querySelector('.overlay') && document.querySelector('[data-act=roll]:not([disabled])');
// 흔들기 시작: 주사위를 트레이 안에 풀어 놓고, 흔들기를 멈추면(0.45초 동안 약한 움직임뿐) 그 자리에서 굴림을 확정한다
function startShakeRoll(x, y, z) {
  const btn = rollReady();
  if (!btn) return;
  const now = performance.now();
  motion.last = now;
  if (!tray?.startShake) return onAct('roll', btn);        // 2D 화면: 바로 굴린다
  if (tray.live && !motion.rolling) tray.cancelShake();     // 지난 흔들기가 어중간하게 남아 있으면 정리하고 다시
  const mask = rollMask();
  tray.setSealed?.(ui.sealRoll);
  ui.sealRoll = null;
  if (!tray.startShake(mask)) return;
  if (tut) motion.tutShook = true;
  sfx.rollPress();
  tray.kick(x, y, z);
  Object.assign(motion, { rolling: true, lastStrong: now, t0: now });
  motion.timer = setInterval(() => {
    const n = performance.now();
    if (n - motion.lastStrong > 450 || n - motion.t0 > 6000) endShake();
  }, 60);
}
function stopShakeWatch() {
  clearInterval(motion.timer);
  motion.timer = null;
}
function endShake() {
  stopShakeWatch();
  motion.rolling = false;
  const btn = rollReady();
  if (btn && myControl() && !ui.busy && !ui.sending) onAct('roll', btn);
  else { tray?.cancelShake?.(); render(); }
  motion.last = performance.now();
}
function listenShake(on) {
  if (on === motion.on) return;
  motion.on = on;
  if (on) addEventListener('devicemotion', onMotion);
  else removeEventListener('devicemotion', onMotion);
}
async function setShake(on, input) {
  if (on && typeof DeviceMotionEvent.requestPermission === 'function') {
    // 아이폰: 동작 센서 권한을 물어본다 (터치한 순간에만 물어볼 수 있다)
    let ok = false;
    try { ok = (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch { /* 거부 */ }
    if (!ok) {
      if (input) input.checked = false;
      return toast(ico('warn'), '동작 센서를 쓸 수 없어요', '설정 → Safari → 동작 및 방향 접근을 켜 주세요.', 2400);
    }
  }
  prefs.shake = on;
  store.set(KEYS.prefs, prefs);
  listenShake(on);
  if (on) toast(ico('die5'), '흔들어 굴리기 켜짐', '내 차례에 폰을 흔들면 주사위가 굴러다니고, 멈추면 결과가 나와요.', 2400);
}
if (SHAKE_OK && prefs.shake) {
  listenShake(true);
  // 아이폰은 앱을 다시 열 때마다 동작 센서 권한을 다시 받아야 센서 값이 온다 (터치한 순간에만 요청 가능).
  // 첫 터치 때 조용히 다시 요청한다 (한 번 허락했으면 창이 다시 뜨지 않는다)
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const ask = () => { removeEventListener('pointerup', ask, true); DeviceMotionEvent.requestPermission().catch(() => {}); };
    addEventListener('pointerup', ask, true);
  }
}

// ── 스토리 ───────────────────────────────────────────────────────────────────
let story = { i: 0, shown: 0, timer: null, then: null };
function showStory(then) {
  screen = 'story';
  story = { i: 0, shown: 0, timer: null, then };
  app.innerHTML = `
  <div class="screen story" data-act="story-next">
    <canvas class="scene" aria-hidden="true"></canvas>
    <button class="skip" data-act="story-skip">건너뛰기 ▶▶</button>
    <div class="dialog">
      <span class="speaker"></span>
      <p class="line"></p>
      <span class="more">▼</span>
    </div>
  </div>`;
  setStage(storyScene(app.querySelector('.scene'), () => story.i));
  typeLine();
}
function typeLine() {
  const line = STORY[story.i].text;
  const el = app.querySelector('.line');
  app.querySelector('.speaker').textContent = story.i === STORY.length - 1 ? '루루' : '나레이션';
  story.shown = 0;
  clearInterval(story.timer);
  story.timer = setInterval(() => {
    story.shown++;
    el.innerHTML = br(line.slice(0, story.shown));
    if (story.shown % 2) sfx.tap();
    if (story.shown >= line.length) clearInterval(story.timer);
  }, 42);
}
function storyNext() {
  const line = STORY[story.i].text;
  if (story.shown < line.length) {
    story.shown = line.length;
    clearInterval(story.timer);
    app.querySelector('.line').innerHTML = br(line);
    return;
  }
  sfx.select();
  if (story.i < STORY.length - 1) { story.i++; typeLine(); return; }
  endStory();
}
function endStory() {
  clearInterval(story.timer);
  markSeen('story');
  const then = story.then;
  setStage(null);
  then ? then() : showTitle();
}

// ── 게임 준비: 모드 → 보스(협동만) → 캐릭터, 단계별 화면 ─────────────────────
// pick.for: 'local' 한 기기 · 'create' 온라인 방 만들기 전 · 'room' 대기실에서 방장이 바꾸기
let pick = { for: 'local', step: 'mode', o: null };
const pickSteps = () => {
  const coop = pick.o.mode === 'coop';
  if (pick.for === 'local') return coop ? ['mode', 'boss', 'party'] : ['mode', 'party'];
  return coop ? ['mode', 'boss'] : ['mode'];
};
const STEP_TITLE = { mode: '모드 선택', boss: '보스 선택', party: '캐릭터 선택' };

function beginPick(kind, o) {
  pick = { for: kind, step: 'mode', o };
  showSetup();
}

function modeCards(o) {
  return `
  <div class="mode-cards">
    <button class="mode-card${o.mode === 'versus' ? ' on' : ''}" data-act="mode" data-v="versus">
      ${ico('swords')}<b>대전</b><small>12라운드 동안 점수표를 채우고 의뢰·레벨업으로 성장해 최종 점수가 가장 높은 영웅이 승리</small>
    </button>
    <button class="mode-card${o.mode === 'coop' ? ' on' : ''}" data-act="mode" data-v="coop">
      ${ico('shield')}<b>협동</b><small>다 함께 보스 토벌. 점수를 적으면 그만큼 보스에게 피해, 12라운드 안에 쓰러뜨리면 승리</small>
    </button>
  </div>`;
}

// 마왕: 화염룡·오크·리치의 어려움을 모두 한 번씩 깨면 봉인이 풀린다
// 테스트판 ?demon: 마왕과 마왕 난이도 전부를 바로 열어 둔다 (배포판에서는 무시)
const DEMON_TEST = !PROD && new URLSearchParams(location.search).has('demon');
// 테스트판 ?demon=all: 마왕의 쉬움·보통·어려움까지 전부 열어 둔다 (분노·봉인 2개 확인용)
const DEMON_ALL = DEMON_TEST && new URLSearchParams(location.search).get('demon') === 'all';
if (DEMON_TEST) Object.assign(opts, { mode: 'coop', boss: 'demon' });   // '새 게임'을 누르면 바로 협동 · 마왕이 골라져 있다
const demonOpen = () => DEMON_TEST || ['dragon', 'orc', 'lich'].every(b => (loadProfile().bosses?.[`${b}:2`]?.wins || 0) > 0);
function showDemonUnlock() {
  if (!demonOpen() || store.get('diceheroes.demonSeen')) return;
  store.set('diceheroes.demonSeen', 1);
  stopBgm();
  sfx.boom(3); buzz(200);
  const el = document.createElement('div');
  el.className = 'demon-reveal';
  el.innerHTML = `<div class="dr-cracks"></div>
    <div class="dr-boss">${portrait('demon', 'dr-img')}</div>
    <p class="dr-l1">세 마물이 쓰러지자 봉인이 흔들린다…</p>
    <h1 class="dr-title">마왕 릴리스 부활</h1>
    <p class="dr-l2">보스 선택에서 마왕에게 도전할 수 있어요</p>
    <button class="pbtn gold dr-ok" data-act="demon-ok">도전을 받아들인다</button>`;
  document.body.appendChild(el);
  setTimeout(() => { FX().flash('#C21E56', 600, 0.6); sfx.boom(3); if (el.isConnected) playBgm('boss_demon'); }, 1400);   // 마왕 테마가 깔린다
  setTimeout(() => sfx.legend(), 2600);
}

// 난이도 해금: 쉬움은 처음부터, 보통은 그 보스 쉬움을, 어려움은 그 보스 보통을 한 번 이상 깨야 열린다
function diffOpen(boss, d) {
  if (d <= 0 || (DEMON_ALL && boss === 'demon')) return true;
  return (loadProfile().bosses?.[`${boss}:${d - 1}`]?.wins || 0) > 0;
}
const clearedAt = (boss, d) => (loadProfile().bosses?.[`${boss}:${d}`]?.wins || 0) > 0;
// 첫 토벌 보너스를 아직 받을 수 있나 (지갑의 토벌 기록 — 배포판은 서버가 정한다)
const firstPending = (boss, d) => (Wal.wallet() ? !Wal.wallet().clears?.[`${boss}:${d}`] : !clearedAt(boss, d));
// 보스 선택: 이 난이도를 아직 못 깼으면 첫 토벌 보너스(보석 ×3)를 알려 준다
function firstClearNote(o) {
  const base = Math.round(Wal.BOSS_WIN[o.diff] * (Wal.BOSS_MUL[o.boss] || 1));
  return !firstPending(o.boss, o.diff)
    ? `<p class="first-bonus done">${ico('gem', 'xs')} 토벌 보상 보석 ${base}개 <small>(첫 토벌 완료)</small></p>`
    : `<p class="first-bonus">${ico('gem', 'xs')} <b>첫 토벌 보너스!</b> 보석 ${base * Wal.FIRST_CLEAR_MUL}개 <small>(평소 ${base}개의 ${Wal.FIRST_CLEAR_MUL}배)</small></p>`;
}
const topOpenDiff = boss => [2, 1, 0].find(d => diffOpen(boss, d));
function clampDiff(o) {
  if (E.bossInfo(o.boss)?.final && !demonOpen()) o.boss = 'dragon';   // 테스트 링크로 골라 둔 마왕이 남아 있어도 봉인 중엔 못 고른다
  if (!diffOpen(o.boss, o.diff)) o.diff = topOpenDiff(o.boss);
}

function bossPicker(o) {
  clampDiff(o);
  return `
  <section class="frame mode-box">
    <div class="bosses">
      ${E.BOSSES.map(b => b.final && !demonOpen()
        ? `<button class="boss-pick sealed-boss" style="--c:${b.color}" data-act="boss-locked">
          ${portrait(b.id, 'bp')}<b>???</b><small>${ico('lock', 'xs')} 봉인됨</small></button>`
        : `<button class="boss-pick${o.boss === b.id ? ' on' : ''}" style="--c:${b.color}" data-act="boss" data-v="${b.id}">
          ${portrait(b.id, 'bp')}<b>${b.ko}</b><small>${b.title}</small>
        </button>`).join('')}
    </div>
    <div class="diffs">
      ${E.DIFFS.map(d => diffOpen(o.boss, d.id)
        ? `<button class="diff${o.diff === d.id ? ' on' : ''}" style="--c:${d.color}" data-act="diff" data-v="${d.id}">${d.ko}${!firstPending(o.boss, d.id) ? '' : `<i class="fc" title="첫 토벌 보석 ×${Wal.FIRST_CLEAR_MUL}">${ico('gem', 'xs')}×${Wal.FIRST_CLEAR_MUL}</i>`}</button>`
        : `<button class="diff locked" style="--c:${d.color}" data-act="diff-locked" data-v="${d.id}">${ico('lock')} ${d.ko}</button>`).join('')}
    </div>
    ${firstClearNote(o)}
    <ul class="skills">
      ${E.bossInfo(o.boss).skills.map(k => `<li><span>${skillIco(k.id)}</span><div><b>${k.ko}</b><small>${esc(k.desc(o.diff))}</small></div></li>`).join('')}
    </ul>
    <p class="hint">${!diffOpen(o.boss, 2) ? `${E.DIFFS[diffOpen(o.boss, 1) ? 1 : 0].ko}을 깨면 ${E.DIFFS[diffOpen(o.boss, 1) ? 2 : 1].ko}이 열려요. ` : ''}의뢰로 모은 뒤집기·조정으로 큰 족보를 노리세요.</p>
  </section>`;
}

// 고른 모드·보스 한 줄 요약 (캐릭터 선택 화면 · 대기실)
function optsSummary(o, change = '') {
  const b = E.bossInfo(o.boss), d = E.DIFFS.find(x => x.id === o.diff) || E.DIFFS[0];
  return `
  <section class="frame opts-sum">
    ${o.mode === 'coop'
      ? `${portrait(b.id, 'sum-bp')}<div><b>${ico('shield', 'xs')} 협동 · ${b.ko}</b><small><span class="diff-chip" style="--c:${d.color}">${d.ko}</span> ${b.title}</small></div>`
      : `<span class="sum-ico">${ico('swords')}</span><div><b>대전</b><small>최고 점수 경쟁</small></div>`}
    ${change ? `<button class="pbtn small" data-act="${change}">변경</button>` : ''}
  </section>`;
}

function onModeAct(act, t, o) {
  if (act === 'mode') o.mode = t.dataset.v;
  if (act === 'boss') { o.boss = t.dataset.v; clampDiff(o); }
  if (act === 'diff') o.diff = Number(t.dataset.v);
  sfx.select();
}

function showSetup() {
  screen = 'setup';
  if (pick.for !== 'room') setStage(null);
  layer.innerHTML = '';
  playBgm('title');
  pick.o ||= opts;
  const steps = pickSteps();
  if (!steps.includes(pick.step)) pick.step = steps[steps.length - 1];
  const n = steps.indexOf(pick.step);
  const last = n === steps.length - 1;
  // 모드를 고르기 전엔 협동 기준으로 단계를 보여 준다 (대전을 고르면 보스 단계가 빠진다)
  const shown = pick.step === 'mode' && pick.for === 'local' ? ['mode', 'boss', 'party'] : pick.step === 'mode' ? ['mode', 'boss'] : steps;
  const o = pick.o;
  let body = '';
  if (pick.step === 'mode') body = `${modeCards(o)}<p class="hint">모드를 누르면 다음 단계로 넘어가요.</p>`;
  if (pick.step === 'boss') body = `${bossPicker(o)}
      <button class="pbtn gold big" data-act="pick-next">${last ? (pick.for === 'create' ? '방 만들기' : '완료') : '다음 ▶'}</button>`;
  if (pick.step === 'party') body = `
      ${optsSummary(o)}
      ${setup.map((pl, i) => seatCard(pl, i, { editable: true, removable: setup.length > 1, humanToggle: true })).join('')}
      <button class="pbtn small" data-act="add" ${setup.length >= 4 ? 'disabled' : ''}>＋ ${o.mode === 'coop' ? '동료' : '상대'} 추가</button>
      <p class="hint">사람이 여럿이면 한 기기를 돌려 가며 합니다. 각자 기기로 하려면 메뉴의 <b>온라인 방</b>을 쓰세요.</p>
      <button class="pbtn gold big" data-act="start">${o.mode === 'coop' ? '토벌 출발' : '모험 출발'}</button>`;
  app.innerHTML = `
  <div class="screen page">
    <header class="page-head">
      <button class="icon-btn" data-act="pick-back" aria-label="뒤로">◀</button>
      <h2>${STEP_TITLE[pick.step]}</h2>
      <span class="count">${pick.step === 'party' ? `${setup.length} / 4` : ''}</span>
    </header>
    <div class="steps" aria-hidden="true">${shown.map((k, j) => `<span class="${j < n ? 'done' : j === n ? 'now' : ''}">${STEP_TITLE[k].replace(' 선택', '')}</span>`).join('')}</div>
    <div class="wrap">${body}</div>
  </div>`;
}

// 다음 단계 / 이전 단계. 끝까지 가면: 한 기기 → 출발 버튼(캐릭터 화면), 방 만들기 → 방 생성, 대기실 → 반영하고 돌아감
function pickNext() {
  const steps = pickSteps(), n = steps.indexOf(pick.step);
  if (n < steps.length - 1) { pick.step = steps[n + 1]; return showSetup(); }
  if (pick.o.mode === 'coop') clampDiff(pick.o);
  if (pick.for === 'create') { saveOpts(); return createRoom(); }
  if (pick.for === 'room' && online) {
    const o = { ...pick.o };
    opts = { ...o }; saveOpts();
    showLobby();
    return lobbyTxn(r => { r.opts = o; r.seats.forEach(s => { s.ready = false; }); });   // 조건이 바뀌면 다시 준비
  }
}
function pickBack() {
  sfx.back();
  const steps = pickSteps(), n = steps.indexOf(pick.step);
  if (n > 0) { pick.step = steps[n - 1]; return showSetup(); }
  if (pick.for === 'create') return showOnlineMenu();
  if (pick.for === 'room' && online) return showLobby();
  return showTitle();
}

function seatCard(pl, i, { editable, removable, humanToggle, tag = '' }) {
  const c = E.classInfo(pl.cls);
  return `
  <section class="frame slot">
    <div class="slot-top">
      <div class="portrait" style="--c:${c.color}">${portrait(pl.cls)}</div>
      <div class="slot-main">
        ${editable ? `<input id="name-${i}" data-name="${i}" value="${esc(pl.name)}" maxlength="10" aria-label="${i + 1}번 이름">`
                   : `<b class="seat-name">${esc(pl.name)}</b>`}
        ${humanToggle ? `<div class="seg" role="group" aria-label="조작">
          <button data-act="human" data-i="${i}" class="${pl.bot ? '' : 'on'}">사람</button>
          <button data-act="bot" data-i="${i}" class="${pl.bot ? 'on' : ''}">봇</button>
        </div>` : `<span class="seat-tag">${tag}</span>`}
      </div>
      ${removable ? `<button class="x" data-act="remove" data-i="${i}" aria-label="빼기">✕</button>` : ''}
    </div>
    ${editable ? `<div class="classes">
      ${E.CLASSES.map(k => {
        const lock = !pl.bot && !Wal.owns('cls', k.id);
        return `<button class="cls${pl.cls === k.id ? ' on' : ''}${lock ? ' locked' : ''}" style="--c:${k.color}" data-act="${lock ? 'cls-buy' : 'cls'}" data-i="${i}" data-cls="${k.id}">
          ${portrait(k.id, 'mini')}<span>${lock ? `${ico('gem', 'xs')}${Wal.priceOf('cls', k.id).toLocaleString()}` : k.ko}</span>
        </button>`;
      }).join('')}
    </div>` : ''}
    <p class="cls-desc"><b style="color:${c.color}">${c.ko}</b> ${c.desc}</p>
  </section>`;
}

function onSetupAct(act, t) {
  const i = Number(t.dataset.i);
  if (act === 'pick-back') return pickBack();
  if (act === 'boss-locked') { sfx.back(); return toast(ico('lock'), '봉인된 보스', '화염룡 · 오크 대장 · 리치 왕의 어려움을 모두 깨면 봉인이 풀려요.', 2400); }
  if (act === 'diff-locked') {
    sfx.back();
    const d = Number(t.dataset.v);
    return toast(ico('lock'), `${E.DIFFS[d].ko}은 잠겨 있어요`, `${E.bossInfo(pick.o.boss).ko}의 ${E.DIFFS[d - 1].ko} 난이도를 한 번 깨면 열려요.`, 2200);
  }
  if (act === 'pick-next') { sfx.select(); return pickNext(); }
  if (['mode', 'boss', 'diff'].includes(act)) {
    onModeAct(act, t, pick.o);
    if (pick.for === 'local') saveOpts();
    return act === 'mode' ? pickNext() : showSetup();
  }
  if (pick.for !== 'local') return;
  if (act === 'cls-buy') return classBuyDialog(t.dataset.cls, id => { setup[i].cls = id; store.set(KEYS.setup, setup); showSetup(); });
  if (act === 'human') { setup[i].bot = false; if (!Wal.owns('cls', setup[i].cls)) setup[i].cls = firstOwnedClass(); }
  if (act === 'bot') { setup[i].bot = true; if (setup[i].name === '나') setup[i].name = BOT_NAMES[i % 4]; }
  if (act === 'cls') setup[i].cls = t.dataset.cls;
  if (act === 'remove') setup.splice(i, 1);
  if (act === 'add' && setup.length < 4) {
    const used = new Set(setup.map(p => p.cls));
    setup.push({ name: BOT_NAMES.find(n => !setup.some(p => p.name === n)) || '동료', cls: E.CLASSES.find(c => !used.has(c.id))?.id || 'mage', bot: true });
  }
  if (act === 'start') {
    if (opts.mode === 'coop') clampDiff(opts);
    syncOwned();
    setup.forEach((p, k) => { p.name = (p.name || '').trim() || (p.bot ? BOT_NAMES[k] : `영웅${k + 1}`); });
    store.set(KEYS.setup, setup);
    sfx.start();
    return startGame(E.createGame(setup, undefined, opts));
  }
  sfx.select();
  store.set(KEYS.setup, setup);
  showSetup();
}

// ── 온라인: 방 만들기 · 참가 ─────────────────────────────────────────────────
function showOnlineMenu(error = '', detail = '') {
  screen = 'online';
  setStage(null);
  layer.innerHTML = '';
  playBgm('title');
  app.innerHTML = `
  <div class="screen page">
    <header class="page-head">
      <button class="icon-btn" data-act="home" aria-label="뒤로">◀</button>
      <h2>온라인 방</h2>
    </header>
    <div class="wrap">
      <section class="frame online-box">
        <label class="field">내 이름<input id="my-name" value="${esc(myName)}" maxlength="10"></label>
        <button class="pbtn gold big" data-act="room-create">방 만들기</button>
        <p class="hint">방을 만들면 초대 링크가 생깁니다. 링크를 보내면 친구가 바로 같은 방에 들어옵니다 (2~4인).</p>
      </section>
      <section class="frame online-box">
        <label class="field">방 코드<input id="join-code" placeholder="예) K7MQ2" maxlength="8" autocapitalize="characters"></label>
        <button class="pbtn" data-act="room-join">코드로 참가</button>
      </section>
      ${error ? `<p class="error">${esc(error)}${detail ? `<small>오류 코드: ${esc(detail)}</small>` : ''}</p>` : ''}
    </div>
  </div>`;
}

async function connect() {
  app.querySelector('.error')?.remove();
  if (screen === 'online') app.querySelector('.wrap')?.insertAdjacentHTML('beforeend', '<p class="waiting" id="connecting">서버에 연결하는 중…</p>');
  try { return await Net.getBackend(); }
  catch (err) { showOnlineMenu(err.message, err.detail); return null; }
  finally { document.getElementById('connecting')?.remove(); }
}

async function createRoom() {
  myName = (document.getElementById('my-name')?.value || myName).trim().slice(0, 10) || '모험가';
  store.set(KEYS.name, myName);
  const backend = await connect();
  if (!backend) return;
  let code = Net.makeCode();
  try { for (let i = 0; i < 3 && await backend.exists(code); i++) code = Net.makeCode(); }
  catch (err) { const w = Net.explain(err); return showOnlineMenu(w.text, String(err?.code || err?.message || '').slice(0, 120)); }
  const token = Net.myToken();
  const room = {
    v: 1, host: token, started: false,
    opts: { ...opts },
    seats: [{ token, name: myName, cls: Wal.owns('cls', setup[0]?.cls) ? setup[0].cls : firstOwnedClass(), bot: false }],
    game: null, fxLog: [], fxId: 0,
    seen: { [token]: Date.now() },
  };
  try { await backend.create(code, room); }
  catch (err) { const w = Net.explain(err); return showOnlineMenu(w.text, String(err?.code || err?.message || '').slice(0, 120)); }
  enterRoom(backend, code);
}

async function joinRoom(code) {
  code = Net.normalizeCode(code);
  if (!code) return showOnlineMenu('방 코드를 입력해 주세요.');
  const input = document.getElementById('my-name');
  if (input) { myName = input.value.trim().slice(0, 10) || myName; store.set(KEYS.name, myName); }
  const backend = await connect();
  if (!backend) return;
  let found;
  try { found = await backend.exists(code); }
  catch (err) { const w = Net.explain(err); return showOnlineMenu(w.text, String(err?.code || err?.message || '').slice(0, 120)); }
  if (!found) return showOnlineMenu(`방 ${code}을(를) 찾지 못했습니다. 코드를 확인해 주세요.`);
  const token = Net.myToken();
  if (backend.join) {                                                     // 구성원 명단에 먼저 올린다 (배포판 보안 규칙)
    const j = await backend.join(code, token);
    if (!j.ok) return showOnlineMenu(j.failure);
  }
  const res = await backend.txn(code, (room, fail) => {
    if (room.seats.some(s => s.token === token)) {                       // 재접속
      if (room.game?.players.find(p => p.token === token)?.dropped) return fail('연결이 끊긴 지 1분이 지나 봇이 대신 진행하고 있어요.');
      return room;
    }
    if (room.started) return fail('이미 시작한 방입니다.');
    if (room.seats.length >= 4) return fail('방이 가득 찼습니다 (최대 4명).');
    const used = new Set(room.seats.map(s => s.cls));
    room.seats.push({ token, name: myName, cls: E.CLASSES.find(c => !used.has(c.id) && Wal.owns('cls', c.id))?.id || firstOwnedClass(), bot: false });
    return room;
  });
  if (!res.ok) return showOnlineMenu(res.failure);
  enterRoom(backend, code);
}

function enterRoom(backend, code) {
  leaveRoom(false);
  const token = Net.myToken();
  online = { code, token, backend, room: null, fxSeen: -1, latest: undefined, pumping: false, beat: null, unwatch: null, sig: '' };
  // 방 상태가 여러 번 바뀌어도 밀린 중간 상태는 건너뛰고 가장 최신 상태만 처리한다
  online.unwatch = backend.watch(code, room => { if (online?.code === code) { online.latest = room; pump(); } });
  store.del(KEYS.lastRoom);
  online.emoteSeen = {};
  online.unconn = backend.watchConnection?.(ok => connBanner(!ok));
  // 접속 신호를 보내고, 다른 사람 접속 상태(끊김 표시·봇 전환)를 확인한다. 상대가 아예 떠나면 방 상태가 더 오지 않으니 여기서 챙긴다
  const beat = () => {
    backend.touch(code, token);
    if (screen !== 'game' || !S || ui.busy) return;
    if (!online.settled && !online.pumping && online.latest === undefined) return settle();
    checkDrops();
    const pres = presenceSig();
    if (pres !== online.pres) { online.pres = pres; render(); }
  };
  beat();
  online.beat = setInterval(beat, 5000);
  history.replaceState(null, '', Net.inviteLink(code));
}

async function pump() {
  if (!online || online.pumping) return;
  online.pumping = true;
  try {
    while (online && online.latest !== undefined) {
      const room = online.latest;
      online.latest = undefined;
      await onRoom(room).catch(err => console.error(err));
    }
  } finally {
    if (online) online.pumping = false;
  }
}

function leaveRoom(goHome = true) {
  if (online) {
    online.unwatch?.();
    online.unconn?.();
    connBanner(false);
    clearInterval(online.beat);
    const { backend, code, token, room } = online;
    // 진행 중인 게임에서 나가면 1분 안에 돌아올 수 있게 방 코드를 기억한다
    if (room?.started && room.game && !room.game.ended) store.set(KEYS.lastRoom, { code, t: Date.now() });
    // 시작 전이면 자리에서 빠진다
    if (room && !room.started) {
      backend.txn(code, r => {
        r.seats = r.seats.filter(s => s.token !== token);
        if (r.host === token) r.host = r.seats.find(s => !s.bot)?.token || r.host;
        return r;
      });
    }
  }
  online = null;
  if (goHome) {
    const u = new URL(location.href);
    u.searchParams.delete('room');
    history.replaceState(null, '', u.toString());
  }
}

const isHost = () => online && online.room?.host === online.token;
// 나는 늘 접속 중 (내 접속 신호는 내 화면으로 되돌아오지 않을 수 있다)
const alive = token => token === online?.token || (!!online?.room?.seen?.[token] && Date.now() - online.room.seen[token] < Net.ABSENT_MS);

// 준비(레디): 방장을 뺀 사람 참가자가 모두 준비해야 시작할 수 있다
const needReady = room => room.seats.filter(s => !s.bot && s.token !== room.host);
function showLobby() {
  screen = 'lobby';
  const room = online.room;
  const host = isHost();
  const link = Net.inviteLink(online.code);
  const humans = room.seats.filter(s => !s.bot).length;
  const need = needReady(room), readyN = need.filter(s => s.ready).length;
  const allReady = readyN === need.length;
  const mine = room.seats.find(s => s.token === online.token);
  const tooFew = room.seats.length < 2 && humans < 2 && room.opts.mode === 'versus';
  app.innerHTML = `
  <div class="screen page">
    <header class="page-head">
      <button class="icon-btn" data-act="room-leave" aria-label="나가기">◀</button>
      <h2>대기실</h2>
      <span class="count">${room.seats.length} / 4</span>
    </header>
    <div class="wrap">
      <section class="frame invite">
        <span class="label-s">방 코드</span>
        <b class="room-code">${online.code}</b>
        <input id="invite-link" class="link" value="${esc(link)}" readonly>
        <button class="pbtn gold" data-act="copy-link">초대 링크 복사</button>
        <p class="hint">링크를 받은 친구가 열면 이 방으로 바로 들어옵니다.</p>
      </section>
      ${optsSummary(room.opts, host ? 'lobby-opts' : '')}
      ${!host ? '<p class="hint">모드와 보스는 방장이 정합니다.</p>' : ''}
      ${need.length ? `<div class="ready-bar"><b>준비 ${readyN} / ${need.length}</b>${need.map(s => `<span class="rb${s.ready ? ' on' : ''}">${s.ready ? '✔' : '…'} ${esc(s.name)}</span>`).join('')}</div>` : ''}
      ${room.seats.map((s, i) => {
        const me = s.token === online.token;
        const who = s.token === room.host ? `${ico('crown', 'xs')} 방장` : s.bot ? '봇' : s.ready ? '<span class="rdy on">준비 완료</span>' : '<span class="rdy">준비 중</span>';
        const tag = s.bot ? '봇' : `${who} · ${me ? '나' : alive(s.token) ? '접속 중' : '연결 끊김'}`;
        return seatCard(s, i, { editable: me && !s.ready, removable: host && !me, humanToggle: false, tag });
      }).join('')}
      ${host ? `<button class="pbtn small" data-act="lobby-bot" ${room.seats.length >= 4 ? 'disabled' : ''}>＋ 봇 추가</button>` : ''}
      ${host ? `<button class="pbtn gold big" data-act="lobby-start" ${tooFew || !allReady ? 'disabled' : ''}>게임 시작</button>
                ${!allReady ? `<p class="waiting">모두 준비하면 시작할 수 있어요 (${readyN} / ${need.length})</p>` : ''}`
             : `<button class="pbtn big ${mine?.ready ? '' : 'gold'}" data-act="lobby-ready">${mine?.ready ? '준비 취소' : '준비 완료!'}</button>
                <p class="waiting">${mine?.ready ? (allReady ? '방장이 시작하기를 기다리는 중…' : '다른 사람이 준비하기를 기다리는 중…') : '캐릭터를 고르고 준비 버튼을 눌러 주세요'}</p>`}
    </div>
  </div>`;
}

function lobbyTxn(fn) {
  return online.backend.txn(online.code, (room, fail) => { fn(room, fail); return room; })
    .then(res => { if (!res.ok) toast(ico('warn'), '할 수 없어요', res.failure); });
}

function onLobbyAct(act, t) {
  const room = online.room;
  if (act === 'lobby-opts' && isHost()) { sfx.select(); return beginPick('room', { ...room.opts }); }
  if (act === 'lobby-ready') {
    const me = room.seats.find(s => s.token === online.token);
    me?.ready ? sfx.back() : sfx.start();
    return lobbyTxn(r => { const s = r.seats.find(x => x.token === online.token); if (s) s.ready = !s.ready; });
  }
  if (act === 'cls-buy') {
    const i = Number(t.dataset.i);
    return classBuyDialog(t.dataset.cls, id => lobbyTxn(r => { if (r.seats[i]?.token === online.token && !r.seats[i].ready) r.seats[i].cls = id; }));
  }
  if (act === 'cls') {
    sfx.select();
    const i = Number(t.dataset.i);
    return lobbyTxn(r => { if (r.seats[i]?.token === online.token && !r.seats[i].ready) r.seats[i].cls = t.dataset.cls; });
  }
  if (act === 'lobby-bot' && isHost()) {
    sfx.select();
    return lobbyTxn(r => {
      if (r.seats.length >= 4) return;
      const used = new Set(r.seats.map(s => s.cls));
      r.seats.push({ token: `bot-${Net.makeCode(6)}`, name: BOT_NAMES.find(n => !r.seats.some(s => s.name === n)) || '봇', cls: E.CLASSES.find(c => !used.has(c.id))?.id || 'mage', bot: true });
    });
  }
  if (act === 'remove' && isHost()) {
    const i = Number(t.dataset.i);
    sfx.back();
    return lobbyTxn(r => { if (r.seats[i] && r.seats[i].token !== r.host) r.seats.splice(i, 1); });
  }
  if (act === 'copy-link') {
    const el = document.getElementById('invite-link');
    const text = el.value;
    const done = () => toast(ico('link'), '초대 링크를 복사했어요', '메신저로 친구에게 보내 주세요.', 1600);
    navigator.clipboard?.writeText(text).then(done, () => { el.select(); toast(ico('link'), '링크를 선택했어요', '길게 눌러 복사해 주세요.', 1800); })
      ?? (el.select(), done());
    return;
  }
  if (act === 'lobby-start' && isHost()) {
    sfx.start();
    return lobbyTxn((r, fail) => {
      if (r.started) return;
      if (r.seats.length < 1) return fail('참가자가 없습니다.');
      if (needReady(r).some(s => !s.ready)) return fail('아직 준비하지 않은 사람이 있어요.');
      const g = E.createGame(r.seats.map(s => ({ name: s.name, cls: s.cls, bot: s.bot })), undefined, r.opts);
      g.players.forEach((p, i) => (p.token = r.seats[i].token));
      r.fxLog = [{ id: 1, list: E.drainFx(g) }];
      r.fxId = 1;
      r.game = g;
      r.started = true;
    });
  }
  if (act === 'room-leave') { sfx.back(); leaveRoom(); return showTitle(); }
}

function onNameInput(i, value) {
  if (screen === 'lobby' && online) {
    clearTimeout(onNameInput.t);
    onNameInput.t = setTimeout(() => {
      myName = value.trim().slice(0, 10) || myName;
      store.set(KEYS.name, myName);
      lobbyTxn(r => { const s = r.seats[i]; if (s?.token === online.token) s.name = myName; });
    }, 500);
    return;
  }
  setup[i].name = value;
  store.set(KEYS.setup, setup);
}

// 방 상태가 바뀔 때마다 (순서대로 한 번에 하나씩)
async function onRoom(room) {
  if (!online) return;
  if (!room) {
    toast(ico('door'), '방이 닫혔습니다', '처음 화면으로 돌아갑니다.');
    leaveRoom(); S = null;
    return showTitle();
  }
  online.room = room;
  showEmotes(room);
  if (!room.started) {
    if (screen === 'game') { S = null; layer.innerHTML = ''; playBgm('title'); }
    if (!room.seats.some(s => s.token === online.token)) {
      toast(ico('door'), '방에서 나왔습니다', '');
      leaveRoom(); return showTitle();
    }
    if (screen === 'setup' && pick.for === 'room') return;          // 방장이 모드·보스를 바꾸는 중
    if (screen !== 'lobby' || !document.activeElement?.matches?.('input')) showLobby();
    return;
  }
  // 접속 신호(seen)만 바뀐 경우: 게임 상태는 그대로이니 화면 전체를 다시 그리지 않는다
  // (예전엔 8초마다 모든 화면을 다시 그려서 창이 다시 열리는 것처럼 깜박이고 버벅였다)
  const sig = `${room.fxId}|${JSON.stringify(room.game)}`;
  if (screen === 'game' && S && online.sig === sig) {
    // 연출 도중 접속 신호만 먼저 와서 마무리(화면 갱신·차례 알림)를 건너뛰었으면 지금 한다
    if (!online.settled && !ui.busy) return settle();
    checkDrops();
    const pres = presenceSig();
    if (pres !== online.pres && !ui.busy) { online.pres = pres; render(); }
    return;
  }
  online.sig = sig;
  online.settled = false;
  const prev = S && screen === 'game' ? S : null;
  const g = room.game;
  if (!prev) {
    S = g;
    Object.assign(ui, { view: null, tool: null, busy: false, sheet: false, dice: null, sheetTurn: '', lagHp: null, bossGone: false });
    screen = 'game';
    setStage(null);
    layer.innerHTML = '';
    playBgm(S.mode === 'coop' ? bossSong(S.boss.id) : 'adventure');
    online.fxSeen = room.fxId - 1;
  } else {
    S = g;
  }
  // 누군가 굴렸으면 3D 주사위를 굴린다
  const rolledNow = prev && g.rolled && (prev.turn !== g.turn || prev.round !== g.round || g.rollsLeft < prev.rollsLeft);
  const newFx = room.fxLog.filter(f => f.id > online.fxSeen);
  online.fxSeen = room.fxId;
  const fxList = newFx.flatMap(f => f.list);
  if (rolledNow) {
    const sameTurn = prev.turn === g.turn && prev.round === g.round && prev.rolled;
    await rollAnimated(rollMask(prev, sameTurn, g.dice.length), fxList);
  }
  ui.busy = true;
  ui.dice = pendingDice(fxList);
  holdHp(fxList);
  render();
  for (const f of newFx) await playFx(f.list);
  ui.busy = false;
  online.pres = presenceSig();
  if (online.latest !== undefined) return;       // 더 새 상태가 기다리고 있으면 바로 그걸 처리
  settle();
}

// 연출이 끝난 뒤 한 번: 화면을 다시 그리고 결과 · 레벨업 · 차례 알림 · 봇 진행을 챙긴다
function settle() {
  online.settled = true;
  render();
  if (S.ended) return showResults();
  const cur = E.current(S);
  const me = S.players.find(p => p.token === online.token);
  if (me?.dropped && !online.warnedDrop) {
    online.warnedDrop = true;
    toast(ico('warn'), '연결이 끊겨 봇으로 바뀌었어요', '이번 판은 봇이 대신 진행합니다.', 2600);
  }
  if (S.phase === 'levelup' && cur.token === online.token && !cur.dropped) showLevelUp();
  else if (layer.querySelector('.lv-overlay')) layer.innerHTML = '';
  turnAlert();
  checkDrops();
  maybeRunBot();
}

// 접속 표시가 바뀌었는지 (10초 단위로 남은 시간 표시를 갱신)
function presenceSig() {
  if (!S || !online?.room) return '';
  return S.players.map(p => (p.bot ? 'b' : alive(p.token) ? 'a' : Math.ceil(dropLeft(p.token) / 10000))).join(',');
}
// 봇으로 바뀌기까지 남은 시간(ms)
const dropLeft = token => Math.max(0, Net.DROP_MS - (Date.now() - (online?.room?.seen?.[token] || 0)));

// 1분 넘게 돌아오지 않은 사람: 협동·3~4인 대전은 봇으로, 1대1 대전은 기권패 (진행 담당 기기가 처리)
function checkDrops() {
  if (!online?.room?.started || !S || S.ended || online.dropping || runner() !== online.token) return;
  const late = S.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.bot && p.token !== online.token && dropLeft(p.token) <= 0);
  if (!late.length) return;
  online.dropping = true;
  onlineAct(g => {
    for (const { i } of late) {
      if (g.players[i].bot || g.ended) continue;
      if (g.mode === 'versus' && g.players.length === 2) E.forfeit(g, i);
      else E.dropToBot(g, i);
    }
  }, { any: true, quiet: true }).finally(() => { if (online) online.dropping = false; });
}

// 서버 연결이 끊기면 화면 위에 작게 '다시 연결하는 중' (다시 붙으면 사라진다)
function connBanner(show) {
  let el = document.getElementById('conn');
  if (!show) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.id = 'conn';
  el.className = 'conn';
  el.innerHTML = `${ico('warn', 'xs')} 연결이 끊겼어요 · 다시 연결하는 중…`;
  document.body.appendChild(el);
}

// 이모티콘 반응 (정해진 문구만 — 채팅이 아니라 욕설 걱정이 없다)
const EMOTES = ['나이스!', '좋아요', '아깝다…', 'ㅋㅋㅋ', '빨리요~', 'GG'];
function showEmotes(room) {
  if (!online || !room.emote) return;
  for (const [token, v] of Object.entries(room.emote)) {
    const last = online.emoteSeen[token];
    online.emoteSeen[token] = v.t;
    if (last === undefined && Date.now() - v.t > 4000) continue;    // 들어오기 전의 오래된 반응
    if (last !== undefined && v.t <= last) continue;
    const who = room.seats?.findIndex(s => s.token === token);
    const el = document.querySelector(`.member[data-i="${who}"]`);
    if (!el || !EMOTES[v.e]) continue;
    const r = el.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'emote-bubble';
    b.textContent = EMOTES[v.e];
    b.style.left = `${r.left + r.width / 2}px`;
    b.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(b);
    if (token !== online.token) sfx.tap();
    setTimeout(() => b.remove(), 2600);
  }
}

// 봇 차례와 자리를 비운 사람 차례는 방장(방장이 없으면 남은 사람 중 첫 번째)이 진행한다
function runner() {
  const room = online.room;
  if (alive(room.host)) return room.host;
  return room.seats.find(s => !s.bot && alive(s.token))?.token;
}
function maybeRunBot() {
  if (!online || !S || S.ended) return;
  const cur = E.current(S);
  if (!cur.bot || runner() !== online.token) return;
  clearTimeout(maybeRunBot.t);
  maybeRunBot.t = setTimeout(() => onlineAct(g => E.applyBot(g, E.botAction(g, Math.random, 14)), { any: true }), ui.fast ? 250 : 700);
}

// 내 행동을 방에 적용 (트랜잭션: 그 순간의 최신 상태에 적용된다)
// 서버 응답을 기다리는 동안(ui.sending)은 같은 버튼을 또 눌러도 두 번 적용되지 않게 막는다
function onlineAct(fn, { any = false, quiet = false } = {}) {
  if (!any) ui.sending = true;
  return online.backend.txn(online.code, (room, fail) => {
    const g = room.game;
    if (!g || g.ended) return fail('게임이 끝났습니다.');
    if (!any && (E.current(g).token !== online.token || E.current(g).dropped)) return fail('내 차례가 아닙니다.');
    try { fn(g); } catch (err) { return fail(err.message); }
    const list = E.drainFx(g);
    if (list.length) {
      room.fxId = (room.fxId || 0) + 1;
      room.fxLog = [...(room.fxLog || []), { id: room.fxId, list }].slice(-8);
    }
    return room;
  }).then(res => {
    if (!any) ui.sending = false;
    if (!res.ok) {
      if (!quiet) toast(ico('warn'), '할 수 없어요', res.failure, 1500);
      // 미리 반영해 둔 화면(잡기 등)을 서버 상태로 되돌린다
      if (online?.room?.game && screen === 'game' && !ui.busy) { S = online.room.game; render(); }
    }
    return res.ok;
  });
}

// ── 게임 화면 ────────────────────────────────────────────────────────────────
function startGame(state) {
  S = state;
  gemResult = null;
  if (tray?.constructor === DiceTray2D && !store.get('diceheroes.slow3d') && load3d && !gfxNote.includes('오류')) { tray.destroy(); tray = null; }   // 지난 판에 늦게 받은 3D 로 다시
  Object.assign(ui, { view: null, tool: null, busy: false, sheet: false, dice: null, sheetTurn: '', lagHp: null, bossGone: false });
  screen = 'game';
  setStage(null);
  layer.innerHTML = '';
  playBgm(S.mode === 'coop' ? bossSong(S.boss.id) : 'adventure');
  if (!S.tutorial && (S.round || 1) <= 1) track('game_start', { mode: S.mode, online: online ? 1 : 0, players: S.players.length });
  if (!S.tutorial && !online) Wal.beginRun({ mode: S.mode, boss: S.boss?.id ?? null, diff: S.boss?.diff ?? null });   // 배포판: 판 시작을 서버에 기록 (온라인 방 판은 방 기록으로 확인)
  step();
}

// 트레이는 한 번에 하나만 만든다 (import 를 기다리는 사이 다시 불리면 캔버스가 두 개 겹쳤다)
let trayMaking = null;
function ensureTray() {
  if (tray) return Promise.resolve(tray);
  return (trayMaking ||= makeTray().finally(() => { trayMaking = null; }));
}
// 그래픽 상태 (설정 화면에 표시 — 문제를 알려 줄 때 도움이 된다)
let gfxNote = '';
// 최근 오류 한 줄 (설정 화면 맨 아래에 보여 준다 — 폰에서 생긴 문제를 알려 줄 때 캡처하면 원인 찾기가 쉽다)
let lastErr = store.get('diceheroes.lastErr') || '';
const noteErr = e => { lastErr = `${new Date().toLocaleTimeString()} ${String(e?.message || e?.reason?.message || e?.reason || e).slice(0, 120)}`; store.set('diceheroes.lastErr', lastErr); };
addEventListener('error', noteErr);
addEventListener('unhandledrejection', noteErr);
// 3D 엔진(three.js·cannon, 약 1MB)은 시작 화면에서 미리 받아 둔다. 인터넷이 느려 제때 못 받으면 2D 주사위로 한다
let load3d = null;
const preload3d = () => (load3d ||= webglOK() ? import('./dice3d.js').catch(err => { load3d = null; throw err; }) : Promise.reject(new Error('WebGL 없음')));
const timeout = (ms, why) => new Promise((_, no) => setTimeout(() => no(new Error(why)), ms));
function trayOpts() {
  return {
    onPick: i => onAct('die', { dataset: { i: String(i) } }),
    onHit: (v, i) => diceHit(v, i, tray),
    onThrow: () => sfx.shake(),
    onBox: () => sfx.box(),
    onLong: i => dieInfo(i),
    onFail: err => to2d(`그리기 오류: ${err?.message || err}`),
    lowGfx: !!prefs.lowGfx,
    diceSkin: diceSkin(prefs.diceSkin).id,
    traySkin: traySkin(prefs.traySkin).id,
  };
}
async function makeTray() {
  const host = document.getElementById('tray');
  try {
    const { DiceTray } = await Promise.race([preload3d(), timeout(tray3dWait(), '3D 불러오기 시간 초과')]);
    tray = new DiceTray(document.getElementById('tray') || host, trayOpts());
    gfxNote = '3D';
    return tray;
  } catch (err) {
    console.warn('[3d]', err);
    gfxNote = `2D (${err?.message || err})`;
    if (/시간 초과/.test(err?.message)) {
      store.set('diceheroes.slow3d', 1);
      preload3d().then(() => store.del('diceheroes.slow3d'), () => {});   // 늦게라도 받으면 다음 판부터 3D
    }
  }
  // 3D를 쓸 수 없거나 제때 못 받은 기기: 2D 주사위로 대신한다 (3D는 뒤에서 계속 받아 두었다가 다음 판부터)
  tray = new DiceTray2D(document.getElementById('tray') || host, trayOpts());
  return tray;
}
// 3D 를 기다리는 시간: 처음엔 8초, 이미 한 번 늦었던 기기는 3초
const tray3dWait = () => (store.get('diceheroes.slow3d') ? 3000 : 8000);
// 3D 가 게임 도중 그리기에 실패하면 그 자리에서 2D 로 바꿔 계속한다
function to2d(why) {
  gfxNote = `2D (${why})`;
  const host = document.getElementById('tray');
  try { tray?.destroy?.(); } catch { /* 무시 */ }
  tray = host ? new DiceTray2D(host, trayOpts()) : null;
  toast(ico('warn'), '그래픽을 간단하게 바꿨어요', '이 기기에서 3D 주사위를 그리지 못해 2D 주사위로 계속해요.', 2400);
  render();
}

// 지금 이 기기가 조작할 차례인가
function myControl() {
  if (!S || S.ended) return false;
  const cur = E.current(S);
  if (online) return cur.token === online.token && !cur.dropped;
  return !cur.bot;
}

function render() {
  if (screen !== 'game' || !S) return;
  const cur = E.current(S);
  const ev = E.eventInfo(E.event(S));
  const mine = myControl();
  const myTurn = mine && S.phase === 'roll' && !ui.busy;
  const combos = myTurn && S.rolled ? readyCombos(cur) : [];
  autoSheet(myTurn, combos);
  const viewIdx = ui.view ?? S.turn;
  const vp = S.players[viewIdx];
  const prev = S.rolled && !ui.busy ? E.preview(S) : null;
  const okQuests = S.rolled && !ui.busy ? E.claimableQuests(S) : [];
  const best = prev ? prev.filter(r => !r.taken).sort((a, b) => b.pts - a.pts)[0]?.id : null;
  const need = E.xpToNext(cur.level);
  const xpPct = cur.level >= E.MAX_LEVEL ? 100 : Math.min(100, (cur.xp / need) * 100);
  const canRoll = myTurn && S.rollsLeft > 0 && !(S.rolled && S.held.every(Boolean));
  const coop = S.mode === 'coop';
  const absent = online && !cur.bot && !mine && !alive(cur.token);
  const last = S.log[S.log.length - 1];

  app.innerHTML = `
  <div class="screen game${mine ? ' my-turn' : ' other-turn'}${ui.sheet ? ' sheet-open' : ''}">
    <header class="hud">
      <button class="icon-btn" data-act="pause" aria-label="메뉴">☰</button>
      <div class="round-chip"><small>ROUND</small><b>${S.round}<i>/${E.ROUNDS}</i></b></div>
      <button class="event-chip" data-act="info-event"><span class="ev-ic">${eventIco(ev.id)}</span><div><b>${ev.ko}</b><small>${ev.desc}</small></div></button>
      <button class="icon-btn${ui.fast ? ' on' : ''}" data-act="fast" aria-label="봇 빨리 감기">▶▶</button>
    </header>

    ${coop ? bossPanel() : ''}

    <div class="party" style="--n:${S.players.length}">
      ${(() => { if (!ui.crownFreeze) crownShown = leaders(); lastPts = S.players.map((_, i) => shownPts(i)); return ''; })()}
      ${S.players.map((p, i) => `
        <button class="member${i === S.turn ? ' turn' : ''}${ui.sheet && i === viewIdx ? ' viewing' : ''}" data-act="view" data-i="${i}" style="--c:${E.classInfo(p.cls).color}">
          <div class="m-por">${portrait(p.cls)}<span class="lv">${p.level}</span>${crownShown.includes(i) ? `<span class="crown">${ico('crown', 'xs')}</span>` : ''}</div>
          <div class="m-info"><span class="name">${esc(p.name)}${online && p.token === online.token ? ' (나)' : ''}</span>
            <b class="pts">${ptsHTML(i)}</b></div>
          ${online && !p.bot && !alive(p.token) ? `<span class="off">끊김 ${Math.ceil(dropLeft(p.token) / 1000)}초</span>` : ''}
        </button>`).join('')}
    </div>

    <section class="board" id="quests">
      <div class="board-head">
        <b>${ico('scroll')} 의뢰 게시판</b>
        <button class="help-link" data-act="help-quest">의뢰 보상이란?</button>
      </div>
      <div class="quests">
        ${S.board.map(qid => {
          const q = E.questInfo(qid);
          return `<div class="quest${okQuests.includes(qid) ? ' ok' : ''}">
            <span class="pin"></span>
            <span class="q-ic">${questIco(qid)}</span>
            <div class="q-body"><b>${q.ko}</b><small>${q.desc}</small></div>
            <span class="q-rw"><em>${rewardIcons(E.questReward(S, cur, qid))}</em><i>+${q.xp}XP</i></span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="table">
      <div class="turn-tag" style="--c:${E.classInfo(cur.cls).color}">
        ${portrait(cur.cls, 'tiny')}<span>${esc(cur.name)}${cur.bot ? ' (봇)' : ''}</span>
      </div>
      <div class="rolls-left" title="남은 굴림">${[...Array(E.maxRolls(S, cur))].map((_, i) => `<i class="${i < S.rollsLeft ? 'on' : ''}"></i>`).join('')}</div>
      <div id="tray" class="tray${ui.tool ? ' tooling' : ''}"><div class="dice-ovl" id="dice-ovl"></div>${myTurn && S.rolled && !ui.busy && cur.cls === 'dancer' && cur.encore > 0 ? `<button class="encore-btn" data-act="encore">${ico('sparkle', 'xs')} 앙코르 <small>굴림 +1 · 1회</small></button>` : ''}${tray ? '' : '<p class="tray-loading">주사위 준비 중…</p>'}</div>
      ${online ? `<button class="emote-btn" data-act="emote-menu" aria-label="반응 보내기">${ico('party', 'xs')}반응</button>` : ''}
    </section>

    <section class="controls">
      <button class="pbtn gold roll" data-act="roll" ${canRoll ? '' : 'disabled'}>
        <span>${S.rolled ? '다시 굴리기' : '굴리기'}</span><small class="left-n">남은 ${S.rollsLeft}회</small>
      </button>
      <button class="pbtn tool${ui.tool === 'flip' ? ' on' : ''}" data-act="tool" data-tool="flip" ${myTurn && S.rolled && cur.flip > 0 && E.event(S) !== 'haki' ? '' : 'disabled'}>
        ${ico('flip')}${ui.tool === 'flip' ? '사용 중' : '뒤집기'}<b class="${cur.flip >= E.CHARGE_CAP ? 'full' : ''}">${cur.flip}/${E.CHARGE_CAP}</b></button>
      <button class="pbtn tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="tool" data-tool="nudge" ${myTurn && S.rolled && cur.nudge > 0 && E.event(S) !== 'haki' ? '' : 'disabled'}>
        ${ico('nudge')}${ui.tool === 'nudge' ? '사용 중' : '조정'}<b class="${cur.nudge >= E.CHARGE_CAP ? 'full' : ''}">${cur.nudge}/${E.CHARGE_CAP}</b></button>
      <button class="pbtn sheet-btn${combos.length || (myTurn && S.rolled && S.rollsLeft === 0) ? ' ready' : ''}" data-act="sheet" aria-label="족보 완성 · 점수표 열기">
        ${ico('sheet')}족보 완성${combos.length ? `<b>${combos.length}</b>` : ''}</button>
    </section>
    <div class="tip">${absent ? `<span>${esc(cur.name)} 님 연결 끊김 · 1분 안에 돌아오지 않으면 ${S.mode === 'versus' && S.players.length === 2 ? '기권패' : '봇이 대신 진행'}</span>` : tip(cur, myTurn, okQuests, combos)}</div>

    <section class="hero-strip" style="--c:${E.classInfo(cur.cls).color}">
      <div class="hs-por">${portrait(cur.cls)}<span class="lv">${cur.level}</span></div>
      <div class="hs-main">
        <div class="hs-name"><b>${esc(cur.name)}</b><span>${E.classInfo(cur.cls).ko}</span></div>
        <div class="xpbar" style="--w:${xpPct}%"><i></i><em>${cur.level >= E.MAX_LEVEL ? 'MAX' : `EXP ${cur.xp} / ${need}`}</em></div>
      </div>
      <div class="hs-perks">
        ${Object.keys(cur.perks).length ? Object.entries(cur.perks).map(([id, n]) => {
          const k = E.perkInfo(id);
          return `<button class="perk-ic" style="--rc:${rarityColor(k.rarity)}" data-r="${E.RARITY[k.rarity].ko[0]}" data-act="info-perk" data-id="${id}" aria-label="${k.ko}">${perkIco(id)}${n > 1 ? `<b>${n}</b>` : ''}</button>`;
        }).join('') : '<span class="dim">특성 없음</span>'}
      </div>
    </section>

    <footer class="log-line" data-act="log">${last ? `R${last.r} · ${esc(last.text)}` : '모험이 시작됐다.'}</footer>
  </div>
  ${ui.sheet ? `<div class="sheet-dim${ui.sheetShown ? '' : ' fresh'}" data-act="sheet-close"></div>${sheet(vp, viewIdx, prev, best, myTurn && viewIdx === S.turn, combos, !ui.sheetShown)}` : ''}`;
  ui.sheetShown = ui.sheet;

  placeSheet();
  trailHp();
  if (myTurn) setTimeout(termTips, 600);
  const rage = coop && S.boss.diff === 2 && S.boss.hp * 2 < S.boss.maxHp && S.boss.hp > 0;
  // 마왕 분노: 처음 분노하는 순간 한 번 '변신' 연출
  if (rage && S.boss.id === 'demon' && ui.demonRageSeed !== S.seed) {
    ui.demonRageSeed = S.seed;
    setTimeout(() => {
      FX().flash('#C21E56', 700, 0.6); sfx.boom(3); buzz(150);
      shake(app.querySelector('.boss-panel'), 3);
      toast(portrait('demon', 't-boss'), '마왕이 진정한 모습을 드러냈다!', '분노 — 이제 봉인이 주사위 2개를 묶는다', 2600);
    }, 300);
  }
  FX().rage(rage, () => document.getElementById('boss-art')?.getBoundingClientRect(), RAGE[S.boss?.id]);
  ensureTray().then(t => {
    if (t !== tray) return;              // 그사이 트레이를 새로 만들었으면 옛 것은 붙이지 않는다
    document.querySelector('.tray-loading')?.remove();
    t.attach(document.getElementById('tray'));
    t.show(ui.dice || S.dice, S.rolled ? S.held : []);
    t.setTarget(!!ui.tool && myTurn);
    requestAnimationFrame(() => diceOverlay(myTurn));
  });
  updateCoach();
}

// 체력바 잔상: 깎인 만큼 하얀 띠가 남았다가 조금 늦게 따라 줄어든다
function trailHp() {
  const b = S?.boss;
  if (!b) return;
  const hp = ui.hpHold ?? b.hp;
  if (ui.lagHp == null || hp > ui.lagHp) { ui.lagHp = hp; return; }
  if (ui.lagHp === hp) return;
  clearTimeout(trailHp.t);
  trailHp.t = setTimeout(() => {
    if (!S?.boss) return;
    const now = ui.hpHold ?? S.boss.hp;
    ui.lagHp = now;
    const u = document.querySelector('.hp u');
    if (u) u.style.width = `${(now / S.boss.maxHp) * 100}%`;
  }, ui.fast ? 200 : 520);
}

// 지금 주사위로 완성된 족보 (아직 안 채운 칸만).
// 에이스~식스는 그 눈이 3개 이상, 포카인드~요트는 조건을 만족하면. 초이스는 늘 가능하니 뺀다.
function readyCombos(p) {
  if (!S.rolled || S.dice.includes(0)) return [];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  S.dice.forEach(v => counts[v]++);
  return E.CATS.filter(c => {
    if (p.scores[c.id] !== null || c.id === 'choice') return false;
    if (c.up) return counts[c.up] >= 3;
    return E.fiveSets(S.dice).some(d => E.baseScore(c.id, d) > 0);
  }).map(c => c.id);
}

// 새 족보가 완성되거나 굴림을 다 쓰면 점수표를 저절로 띄운다 (한 번 닫으면 같은 족보로는 다시 안 뜬다)
function autoSheet(myTurn, combos) {
  const key = `${S.seed}:${S.round}:${S.turn}`;
  if (ui.sheetTurn !== key) {
    Object.assign(ui, { sheetTurn: key, sheetSeen: new Set(), sheetLast: false });
    if (ui.sheet && ui.view === null) ui.sheet = false;
  }
  if (!myTurn || !S.rolled || ui.tool) return;
  if (tut && !STEPS[tut.step]?.allow?.includes('score')) return;
  const fresh = combos.filter(c => !ui.sheetSeen.has(c));
  const out = S.rollsLeft === 0 && !ui.sheetLast;
  combos.forEach(c => ui.sheetSeen.add(c));
  if (out) ui.sheetLast = true;
  // 점수표는 사용자가 '족보 완성' 버튼으로 직접 연다. 새 족보가 완성되거나 굴림을 다 쓰면
  // 가운데에 작게 알리기만 한다 (족보 완성 버튼이 깜박인다). 튜토리얼의 기록 안내 단계에서만 바로 띄운다.
  if (!tut && fresh.length) { sfx.combo(); notice(`완성 가능한 족보 ${combos.length}개`); }
  else if (!tut && out) notice('굴림을 다 썼어요 · 족보 완성에서 기록');
  if (fresh.length && tut && !ui.sheet) {
    ui.sheet = true;
    ui.view = null;
    if (fresh.length) sfx.combo();
  }
}

// 화면 가운데(주사위 위)에 잠깐 뜨는 작은 알림
function notice(text) {
  document.querySelectorAll('.notice').forEach(n => n.remove());
  const r = document.getElementById('tray')?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'notice';
  el.innerHTML = `${ico('sheet', 'xs')} ${esc(text)}`;
  el.style.top = `${r ? r.top + r.height * 0.22 : innerHeight / 2}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

// 점수표 창은 의뢰 게시판 바로 아래에 붙인다
function placeSheet() {
  const pop = document.getElementById('sheet-pop');
  const board = document.getElementById('quests');
  if (!pop || !board) return;
  pop.style.setProperty('--top', `${Math.round(board.getBoundingClientRect().bottom + 6)}px`);
}

// 주사위를 꾹 누르면: 지금 눈, 뒤집으면·조정하면 나올 눈, 이 눈이 쓰이는 칸
function dieInfo(i) {
  if (!S?.rolled || !S.dice[i]) return;
  const v = S.dice[i], p = E.current(S);
  const cats = E.CATS.filter(c => p.scores[c.id] === null && (c.up === v || (!c.up && c.id !== 'choice' && E.fiveSets(S.dice).some(d => E.baseScore(c.id, d) > 0)))).map(c => c.ko);
  const pos = tray.screenPos(i);
  const a = document.createElement('span');
  a.style.cssText = `position:fixed;left:${pos.x - 20}px;top:${pos.y - 20}px;width:40px;height:40px;pointer-events:none`;
  document.body.appendChild(a);
  sfx.tap(); buzz(15);
  popover(a, `<b>주사위 ${miniDie(v)} ${v}</b>${S.held[i] ? ' <small>(잡음)</small>' : ''}
    <p>뒤집으면 ${7 - v} · 조정하면 ${[v - 1, v + 1].filter(x => x >= 1 && x <= 6).join(' 또는 ')}</p>
    <p>${cats.length ? `지금 쓸 수 있는 칸: ${cats.join(', ')}` : '이 눈만으로 채울 칸이 없어요'}</p>`, { afterRelease: true });
  a.remove();
}

// 뒤집기: 각 주사위 위에 뒤집으면 나올 눈 / 조정: 각 주사위 위에 −1 · +1
function diceOverlay(myTurn) {
  const ovl = document.getElementById('dice-ovl');
  if (!ovl || !tray || !S) return;
  // 마왕의 봉인: 봉인된 주사위 위에 쇠사슬 문양 (다시 굴리면 풀린다)
  const box0 = document.getElementById('tray').getBoundingClientRect();
  const sealList = ui.sealRoll || S.sealed || [];   // 굴리는 동안에도 봉인 표시는 제자리에 남는다
  const seals = S.rolled && sealList.length ? sealList.map(i => {
    const p = tray.screenPos(i);
    return `<div class="seal-tag" style="left:${p.x - box0.left}px;top:${p.y - box0.top}px"><span class="seal-ring"></span>${ico('chain')}</div>`;
  }).join('') : '';
  if (!ui.tool || !myTurn || !S.rolled || tray.anim) { ovl.innerHTML = seals; return; }
  const box = box0;
  ovl.innerHTML = seals + S.dice.map((v, i) => {
    if (S.sealed?.includes(i)) return '';
    const p = tray.screenPos(i);
    const x = p.x - box.left, y = p.y - box.top;
    if (ui.tool === 'flip') {
      return `<button class="flip-tag" style="left:${x}px;top:${y}px" data-act="die" data-i="${i}" aria-label="${v}을 ${7 - v}로 뒤집기">
        <i>뒤집으면</i>${miniDie(7 - v)}</button>`;
    }
    return `<div class="nudge-tag" style="left:${x}px;top:${y}px">
      <button data-act="nudge" data-i="${i}" data-d="1" ${v >= 6 ? 'disabled' : ''}>+1</button>
      <button data-act="nudge" data-i="${i}" data-d="-1" ${v <= 1 ? 'disabled' : ''}>−1</button></div>`;
  }).join('');
  if (tut) updateCoach();
}

function bossPanel() {
  const b = S.boss, info = E.bossInfo(b.id), d = E.DIFFS[b.diff];
  const hp = ui.hpHold ?? b.hp;
  const hpPct = (hp / b.maxHp) * 100;
  const shPct = Math.min(100 - hpPct, (b.shield / b.maxHp) * 100);
  const shown = ui.hpHold ?? b.hp;
  // 분노는 살아 있을 때만 (체력 0에서 분노 흔들림이 계속돼 발작처럼 보였다)
  const rage = b.diff === 2 && shown * 2 < b.maxHp && shown > 0;
  return `
  <section class="boss-panel${rage ? ' rage' : ''}${b.hp <= 0 && ui.bossGone ? ' gone' : ''}" style="--c:${info.color}">
    <div class="boss-art" id="boss-art">${portrait(b.id, 'boss')}<div class="aura"></div></div>
    <div class="boss-main">
      <div class="boss-name"><b>${info.ko}</b><span class="diff-chip" style="--c:${d.color}">${d.ko}</span></div>
      <div class="hp"><u style="width:${Math.max(hpPct, ((ui.lagHp ?? b.hp) / b.maxHp) * 100)}%"></u><i style="width:${hpPct}%"></i><s style="left:${hpPct}%;width:${shPct}%"></s>
        <em>HP ${hp} / ${b.maxHp}${b.shield ? ` · ${ico('bone', 'xs')}${b.shield}` : ''}</em></div>
      <div class="boss-skills">
        ${info.skills.filter(k => k.id !== 'rage' || b.diff === 2).map(k => `<button class="skill-chip" data-act="info-skill" data-id="${k.id}">${skillIco(k.id, 'xs')}${k.ko}</button>`).join('')}
        ${rage ? '<span class="rage-tag">분노!</span>' : ''}
      </div>
    </div>
  </section>`;
}

function tip(cur, myTurn, okQuests, combos = []) {
  if (S.ended) return '';
  if (!myControl()) return `${esc(cur.name)}의 차례…${online && cur.bot ? ' (봇)' : ''}`;
  if (!myTurn) return '';
  if (ui.tool === 'flip') return `<b class="tool-txt">${ico('flip', 'xs')} 뒤집을 주사위를 누르세요</b> · 주사위 위에 뒤집힌 눈이 보여요`;
  if (ui.tool === 'nudge') return `<b class="tool-txt">${ico('nudge', 'xs')} 주사위 위의 −1 / +1 을 누르세요</b>`;
  if (!S.rolled) return '굴리기를 눌러 턴을 시작하세요';
  if (okQuests.length) return `<b class="ok-txt">의뢰 「${okQuests.map(q => esc(E.questInfo(q).ko)).join('」「')}」 달성 가능!</b>`;
  if (combos.length) return `<b class="ok-txt">족보 완성! ${ico('sheet', 'xs')} 버튼으로 점수를 기록하세요</b>`;
  return S.rollsLeft ? `주사위를 눌러 잡고 다시 굴리거나, ${ico('sheet', 'xs')} 족보 완성에서 기록하세요` : `${ico('sheet', 'xs')} 족보 완성에서 기록할 칸을 고르세요`;
}

function sheet(p, idx, prev, best, canPick, combos = [], fresh = false) {
  const pv = id => prev?.find(r => r.id === id);
  const row = c => {
    const done = p.scores[c.id] !== null;
    const r = canPick && !done ? pv(c.id) : null;
    const combo = canPick && combos.includes(c.id);
    const cls = done ? 'done' : r ? `pick${r.pts === 0 ? ' zero' : ' can'}${c.id === best && r.pts > 0 ? ' best' : ''}${combo ? ' combo' : ''}` : '';
    const val = done ? p.scores[c.id] : r ? `${r.pts}<small>+${r.xp}xp</small>` : '–';
    // 보너스가 붙으면 규칙 설명 대신 어디서 몇 점 붙었는지 보여 준다
    const armed = r && ui.zeroArm === c.id;
    const sub = armed ? '<small class="zero-warn">한 번 더 누르면 0점 기록</small>' : r?.bonus?.length && r.pts > 0
      ? `<small class="bonus-src">${r.bonus.map(b => `${esc(b.ko)} +${b.amt}`).join(' · ')}</small>`
      : `<small>${CAT_HELP[c.id].rule}</small>`;
    const tag = combo ? '<em class="tag combo">완성</em>' : c.id === best && r?.pts > 0 ? '<em class="tag best">최고</em>' : '';
    return `<button class="row ${cls}${armed ? ' armed' : ''}" data-act="score" data-cat="${c.id}" ${r ? '' : 'disabled'}>
      <span class="nm"><b>${c.ko}${tag}</b>${sub}</span><span class="v">${val}</span></button>`;
  };
  const up = E.upperSum(p), need = E.upperNeed(p), got = up >= need;
  const b = E.breakdown(p);
  const title = canPick && combos.length ? `${ico('sparkle')} 족보 완성!` : '점수표';
  const close = canPick && S.rollsLeft > 0 ? `계속 굴리기 · ${S.rollsLeft}회` : '닫기';
  return `
  <section class="frame sheet-wrap sheet-pop${fresh ? ' fresh' : ''}" id="sheet-pop">
    <div class="sheet-head"><h3>${title}</h3><span>${esc(p.name)}${idx !== S.turn ? ' · 보는 중' : ''}</span>
      <button class="help-link" data-act="help-cats">족보 보기</button>
      <button class="sp-close" data-act="sheet-close">${close} ✕</button></div>
    <div class="sheet">
      <div class="col">${E.CATS.slice(0, 6).map(row).join('')}
        <div class="bonus${got ? ' got' : ''}" style="--w:${Math.min(100, (up / need) * 100)}%">
          <span>보너스 ${up}/${need}</span><div class="bar"><i></i></div><b>${got ? '+35' : ''}</b>
        </div>
      </div>
      <div class="col">${E.CATS.slice(6).map(row).join('')}</div>
    </div>
    <div class="totals">
      <div>점수표<b>${b.card + b.bonus}</b></div>
      <div>레벨<b>+${b.level}</b></div>
      <div class="grand">총점<b>${b.total}</b></div>
    </div>
  </section>`;
}

// ── 작은 팝업 (특성·보스 능력·이벤트·의뢰 보상·족보 설명) ─────────────────────────
// afterRelease: 꾹 누르기로 연 경우, 손을 뗄 때의 클릭으로 바로 닫히지 않게
function popover(anchor, html, { afterRelease = false } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover';
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(280, innerWidth - 24);
  el.style.width = `${w}px`;
  el.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  const below = r.bottom + 8 + el.offsetHeight < innerHeight;
  el.style.top = `${below ? r.bottom + 8 : r.top - el.offsetHeight - 8}px`;
  el.classList.add(below ? 'below' : 'above');
  const arm = () => setTimeout(() => document.addEventListener('click', closePopover, { once: true }), 0);
  if (afterRelease) document.addEventListener('pointerup', arm, { once: true });
  else arm();
}
function closePopover() { document.querySelectorAll('.popover').forEach(p => p.remove()); }

// 의뢰 보상 아이콘: 뒤집기 · 조정
const rewardIcons = r => [r.flip ? `${ico('flip', 'xs')}${r.flip}` : '', r.nudge ? `${ico('nudge', 'xs')}${r.nudge}` : ''].filter(Boolean).join(' ');

function showQuestHelp() {
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>${ico('scroll')} 의뢰 보상</h2>
    <p class="big-note">의뢰를 깨면 <b>${ico('flip', 'xs')} 뒤집기</b>와 <b>${ico('nudge', 'xs')} 조정</b> 충전을 받아요.<br>다음 턴부터 주사위를 원하는 눈으로 바꿔 큰 족보를 노릴 수 있어요.</p>
    <ul class="list">
      <li><b>쉬운 의뢰</b> ${ico('nudge', 'xs')} 조정 1 (예: 두 쌍, 합계 25↑)</li>
      <li><b>보통 의뢰</b> ${ico('flip', 'xs')} 뒤집기 1 (예: 모두 짝수, 풀하우스)</li>
      <li><b>어려운 의뢰</b> ${ico('flip', 'xs')} 1 + ${ico('nudge', 'xs')} 1 (예: 연속 5개, 같은 눈 4개)</li>
      <li><b>전설 의뢰</b> ${ico('flip', 'xs')} 2 + ${ico('nudge', 'xs')} 2 (요트)</li>
      <li><b>${ico('flip', 'xs')} 뒤집기</b> 주사위를 반대 면으로 (1↔6, 2↔5, 3↔4)</li>
      <li><b>${ico('nudge', 'xs')} 조정</b> 주사위 눈을 ±1</li>
    </ul>
    <p class="hint">의뢰는 먼저 깬 사람 몫. 음유시인·의뢰 전문가·현상금 이벤트는 보상을 늘려 줘요.</p>
    <button class="pbtn gold" data-act="close">알겠어요</button>
  </div></div>`;
}
function showCatHelp() {
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame wide" data-act="noop">
    <h2>족보</h2>
    <div class="cat-help">
      ${E.CATS.map(c => `<div class="ch-row"><b>${c.ko}</b><span>${CAT_HELP[c.id].rule}</span>${miniDice(CAT_HELP[c.id].ex)}<em>${CAT_HELP[c.id].pts}점</em></div>`).join('')}
    </div>
    <p class="hint">에이스~식스 합이 63점 이상이면 보너스 +35 (전사는 50점). 조건이 안 맞는 칸에 적으면 0점.</p>
    <button class="pbtn gold" data-act="close">닫기</button>
  </div></div>`;
}

// ── 연출 ─────────────────────────────────────────────────────────────────────
function floatText(text, cls, offset = 0, anchor = 'tray', icon = '') {
  const el = document.createElement('div');
  el.className = `float ${cls}`;
  const r = document.getElementById(anchor)?.getBoundingClientRect();
  el.style.top = `${Math.max(90, (r ? r.top + r.height * 0.35 : innerHeight / 2) + offset)}px`;
  el.innerHTML = (icon ? ico(icon) : '') + esc(text);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
async function toast(icon, title, text, ms = 1900, img = '') {
  // 같은 알림이 이미 떠 있으면 또 띄우지 않고, 다른 알림은 아래로 쌓는다
  const same = [...document.querySelectorAll('.toast')].find(t => t.dataset.title === title && t.dataset.text === text);
  if (same) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.title = title;
  el.dataset.text = text;
  const n = document.querySelectorAll('.toast:not(.out)').length;
  if (n) el.style.marginTop = `${Math.min(n, 3) * 64}px`;
  el.innerHTML = `${img || `<span class="t-ic">${icon}</span>`}<div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', () => el.remove());
  await wait(ms / (ui.fast ? 2 : 1));
  el.classList.add('out');
  await wait(200);
  el.remove();
}
let skipBanner = () => {};
async function banner(round, evId) {
  const ev = E.eventInfo(evId);
  layer.innerHTML = `<div class="overlay" data-act="skip-banner"><div class="banner">
    <div class="rn">ROUND ${round}</div><div class="ev">${eventIco(evId, 'lg')}</div><b>${ev.ko}</b><span>${ev.desc}</span></div></div>`;
  sfx.round();
  await Promise.race([wait(ui.fast ? 700 : 1500), new Promise(r => (skipBanner = r))]);
  layer.innerHTML = '';
}
// 보스 등장: 화면을 대각선으로 가르는 띠 위에 이름과 거대한 모습만
async function bossBanner() {
  const b = E.bossInfo(S.boss.id);
  const cut = b.ko.lastIndexOf(' ');
  layer.innerHTML = `<div class="overlay boss-intro" data-act="skip-banner" style="--c:${b.color}">
    <div class="bi-band"><i></i></div>
    <div class="bi-band thin"></div>
    <img class="spr bi-boss" src="${spriteURL(b.id, 12)}" alt="">
    <div class="bi-name"><small>${esc(b.ko.slice(0, cut))}</small><b>${esc(b.ko.slice(cut + 1))}</b></div>
    <div class="bi-flash"></div>
  </div>`;
  sfx.slash();
  setTimeout(() => { sfx.boom(2); shake(layer.firstElementChild, 2.5); }, 430);
  await Promise.race([wait(2700), new Promise(r => (skipBanner = r))]);
  layer.innerHTML = '';
}
// 명중: 잠깐 멈췄다가(히트스톱) 흔들리고, 피해 숫자가 0부터 올라가며 커진다
function hitBoss(amount, blocked) {
  const art = document.getElementById('boss-art');
  if (!art) return;
  art.classList.remove('hit', 'hitstop'); void art.offsetWidth; art.classList.add('hitstop');
  setTimeout(() => { art.classList.remove('hitstop'); art.classList.add('hit'); }, ui.fast ? 40 : 110);
  bigNumber(amount - (blocked || 0), blocked, art);
}

function bigNumber(dealt, blocked, anchor) {
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'dmgnum';
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top + r.height * 0.45}px`;
  el.style.fontSize = `${Math.round(26 + Math.min(34, dealt * 0.55))}px`;
  el.innerHTML = `<b>-0</b>${blocked ? `<small>${ico('bone', 'xs')} ${blocked} 막힘</small>` : ''}`;
  document.body.appendChild(el);
  const num = el.querySelector('b');
  const t0 = performance.now(), dur = ui.fast ? 160 : 340;
  const tick = t => {
    const k = Math.min(1, (t - t0) / dur);
    num.textContent = `-${Math.round(dealt * (1 - Math.pow(1 - k, 3)))}`;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => el.remove(), 1400);
}

// 보스 소멸: 마지막 공격을 맞은 뒤 하얗게 깜박이다 도트 조각으로 부서져 흩어진다
async function bossDeath() {
  const art = document.getElementById('boss-art');
  if (!art) { ui.bossGone = true; return; }
  const info = E.bossInfo(S.boss.id);
  const r = art.getBoundingClientRect();
  const fx = FX();
  fx.speed = (ui.fast ? 1.8 : 1) * FX_SLOW * fxRate();
  art.classList.remove('hit', 'hitstop');
  art.classList.add('dying');
  sfx.slash();
  const pal = ['#FFFFFF', info.color, '#FFE27A', '#06041A'];
  // 몸이 위에서부터 조각나 떠오른다
  for (let k = 0; k < 10; k++) {
    setTimeout(() => {
      for (let i = 0; i < 14; i++) {
        fx.spawn({
          x: r.left + Math.random() * r.width, y: r.top + r.height * (0.2 + k * 0.07) + Math.random() * 10,
          vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 120, life: 0.7 + Math.random() * 0.6,
          size: 3 + Math.random() * 4, color: pal[i % pal.length], drag: 1, grav: -30,
        });
      }
    }, (k * 70) / fx.speed);
  }
  await wait(750 / fx.speed);
  sfx.boom(3);
  fx.impact(r.left + r.width / 2, r.top + r.height / 2, [pal[0], pal[1], pal[2], pal[1]], 3);
  shake(app.querySelector('.game'), 3);
  await wait(500 / fx.speed);
  ui.bossGone = true;
  render();
  await wait(400);
}

// 큰 점수 도장: 20점 이상 GREAT · 30점 이상 AMAZING · 요트 YACHT
function stamp(pts, cat) {
  const [text, lv] = cat === 'yacht' ? ['YACHT!!!', 3] : pts >= 30 ? ['AMAZING!', 2] : pts >= 20 ? ['GREAT!', 1] : [];
  if (!text) return;
  const r = document.getElementById('tray')?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `stamp s${lv}`;
  el.textContent = text;
  el.style.top = `${r ? r.top + r.height * 0.42 : innerHeight / 2}px`;
  document.body.appendChild(el);
  if (lv >= 2) sfx.legend();
  setTimeout(() => el.remove(), 1300);
}

// 결과 화면 숫자가 0부터 올라간다
function countUp(root) {
  root.querySelectorAll('[data-n]').forEach((el, i) => {
    const n = Number(el.dataset.n), pre = el.dataset.pre || '';
    const t0 = performance.now() + 250 + i * 120, dur = 800;
    const tick = t => {
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      el.textContent = pre + Math.round(n * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    el.textContent = pre + '0';
    requestAnimationFrame(tick);
  });
}

const BOSS_LINES = {
  breath: '화염 숨결! 가장 높은 주사위가 1로 타 버렸다',
  twist: '운명 비틀기! 주사위가 뒤집혔다',
  drums: '전쟁의 북! 이번 라운드 굴림 기회 -1',
  plunder: '약탈! 0점을 틈타 체력을 회복했다',
  bone: '뼈 방패! 보호막을 둘렀다',
  seal: '봉인! 주사위가 쇠사슬에 묶였다 — 다시 굴리면 풀린다',
  unseal: '봉인이 풀렸다',
};

// ?slowfx 로 열면 연출을 4배 느리게 (화면 점검용)
const FX_SLOW = new URLSearchParams(location.search).has('slowfx') ? 0.25 : 1;

// 연출이 끝날 때까지 화면에 대신 보여 줄 주사위 눈
//   보스 스킬 → 스킬이 바꾸기 전 눈으로 굴러 멈춘 뒤 불타거나 뒤집힌다
//   점수 기록 → 다음 턴으로 넘어가도 기록한 주사위가 에너지로 모일 때까지 남아 있다
// 공격이 날아가는 동안은 보스 체력을 맞기 전 값으로 보여 준다 (명중하는 순간 깎인다)
// ── 점수 표시: 주사위 에너지가 캐릭터(협동은 보스)에 닿는 순간 오르고, 오를 때 크게 튀어 강조 ──
// 연출이 시작되면 참가자 점수를 직전 값으로 잡아 두고(ui.pts), 에너지가 닿을 때마다 올린다. 연출이 끝나면 실제 값으로.
const truePts = i => (S.boss ? Math.round(S.boss.dmg[i] || 0) : E.finalScore(S.players[i]));
const shownPts = i => (ui.pts?.[i] ?? truePts(i));
const ptsHTML = i => `${S.boss ? ico('sword', 'xs') : ''}${shownPts(i)}`;
let lastPts = [];                              // 마지막으로 화면에 그린 점수 (다음 연출의 '직전 값')
function holdPts(list) {
  const who = new Set(list.filter(f => ['score', 'damage', 'levelup', 'retro'].includes(f.type) && f.player != null).map(f => f.player));
  if (!who.size) { ui.pts = null; return; }
  ui.pts = {};
  for (const i of who) if (lastPts[i] != null && lastPts[i] <= truePts(i)) ui.pts[i] = lastPts[i];
}
// 점수를 add 만큼 올려 보여 주고 톡 튀게 한다 (실제 값을 넘지 않게)
function bumpPts(i, add) {
  if (ui.pts?.[i] != null) ui.pts[i] = Math.min(truePts(i), ui.pts[i] + add);
  const el = document.querySelector(`.member[data-i="${i}"] .pts`);
  if (!el) return;
  el.innerHTML = ptsHTML(i);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  lastPts[i] = shownPts(i);
}
function releasePts() {
  if (!ui.pts) return;
  const held = ui.pts;
  ui.pts = null;
  for (const k of Object.keys(held)) if (held[k] !== truePts(+k)) bumpPts(+k, 0);   // 남은 차이(보너스 등)는 끝에서 한 번에
}

function holdHp(list) {
  holdPts(list);
  if (S && !S.boss && list.some(f => f.type === 'score')) ui.crownFreeze = true;   // 점수 연출이 끝날 때 왕관을 옮긴다
  if (!S?.boss) { ui.hpHold = null; return; }
  const dealt = list.filter(f => f.type === 'damage').reduce((a, f) => a + f.amount - (f.blocked || 0), 0);
  const healed = list.filter(f => f.type === 'boss' && f.skill === 'plunder').reduce((a, f) => a + (f.amount || 0), 0);
  ui.hpHold = dealt || healed ? Math.min(S.boss.maxHp, S.boss.hp + dealt - healed) : null;
}

function pendingDice(list) {
  const b = list.find(f => f.type === 'boss' && f.from);
  if (b) return b.from.slice();
  const sc = list.find(f => f.type === 'score' && f.dice);
  return sc ? sc.dice.slice() : null;
}

// 점수 공격: 주사위가 에너지로 뭉쳐 보스(대전은 내 점수)에 꽂힌다
// 화면을 새로 그린 직후엔 3D 캔버스가 아직 옛 자리에 있어 좌표가 틀린다 — 먼저 새 자리에 붙인다
async function trayReady() {
  const host = document.getElementById('tray');
  if (!host) return null;
  const t = await ensureTray();
  t.attach(host);
  return t;
}

async function attackFx(f) {
  if (!(await trayReady())) { ui.dice = null; return; }
  if (!S.boss && duelTarget(f.player) >= 0) return duelFx(f);
  if (prefs.fx === 'min') {                 // 연출 최소: 구체는 건너뛰고 명중만
    const el = S.boss ? document.getElementById('boss-art') : document.querySelector(`.member[data-i="${f.player}"] .pts`);
    const r = el?.getBoundingClientRect();
    if (r) FX().impact(r.left + r.width / 2, r.top + r.height / 2, attackStyle(f.pts, f.cat).pal, 1);
    sfx.boom(1);
    if (!S.boss) bumpPts(f.player, scoreGain(f));
    ui.dice = null;
    render();
    return;
  }
  const fx = FX();
  fx.speed = (ui.fast ? 1.8 : 1) * FX_SLOW * (rushing() ? 3 : 1) * fxRate();
  const style = attackStyle(f.pts, f.cat);
  const from = (f.dice || S.dice).map((_, i) => tray.screenPos(i));
  const target = () => {
    const el = S.boss ? document.getElementById('boss-art') : document.querySelector(`.member[data-i="${f.player}"] .pts`);
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: 80 };
  };
  await fx.energy(from, target, {
    pal: style.pal, power: style.power,
    onCharge: () => { sfx.charge(style.power); tray.absorb(380 / fx.speed); },
    onLaunch: () => sfx.whoosh(),
    onImpact: () => { sfx.boom(style.power); shake(app.querySelector('.game'), style.power); if (!S.boss) bumpPts(f.player, scoreGain(f)); },
  });
  ui.dice = null;
  render();
  tray.restore();
}

// ── 대전: 점수 = 공격 ────────────────────────────────────────────────────────
// 점수를 적으면 주사위 에너지를 받은 내 영웅이 직업 기술로 나를 뺀 모두를 친다 (점수는 그대로 내 것 — 연출만).
// 역전해서 1등이 되면 왕관이 옛 1등에게서 튕겨 나와 나에게 온다.
// 이번 점수로 오르는 양 (칸 점수 + 함께 붙은 보너스)
const scoreGain = f => f.pts + (f.bonus || []).reduce((a, b) => a + (b.amt || 0), 0);
function duelTarget(me) {
  let best = -1, bs = -Infinity;
  S.players.forEach((p, i) => { if (i !== me && E.finalScore(p) > bs) { bs = E.finalScore(p); best = i; } });
  return best;
}
// 왕관: 점수가 가장 높은 사람(동점이면 모두). 0점뿐이면 없음
function leaders() {
  if (S.boss || S.players.length < 2) return [];
  const sc = S.players.map(p => E.finalScore(p)), max = Math.max(...sc);
  return max > 0 ? sc.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0) : [];
}
let crownShown = [];
const porPos = i => {
  const r = document.querySelector(`.member[data-i="${i}"] .m-por`)?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: 80 };
};
const memberFx = (i, cls, ms) => {
  const el = document.querySelector(`.member[data-i="${i}"]`);
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
};
// 무희가 춤출 때: 초상화 둘레로 꽃잎·리본이 돈다
function danceFx(i) {
  memberFx(i, 'dance', 900);
  const c = porPos(i), fx = FX();
  fx.burst(c.x, c.y, { n: 26, pal: ['#FFFFFF', '#FF9AD0', '#E84FA0', '#FFC83D'], speed: [60, 200], life: [0.4, 0.8], size: [2, 5], grav: -40 });
  fx.ring(c.x, c.y, { color: '#FF9AD0', r0: 8, r1: 60, dur: 520, width: 4 });
}

async function duelFx(f) {
  // 나를 뺀 모두를 한꺼번에 공격한다 (3~4인이면 기술이 상대마다 한 갈래씩 동시에 날아간다)
  const me = f.player, fx = FX();
  const foes = S.players.map((_, i) => i).filter(i => i !== me);
  const style = attackStyle(f.pts, f.cat);
  const cls = S.players[me].cls;
  let boomT = 0;
  const hitFoe = (foe, big) => {
    memberFx(foe, 'hurt', 520);
    const now = performance.now();
    if (now - boomT > 70) { boomT = now; sfx.boom(big ? style.power : 0.6); }   // 동시에 맞아도 소리는 한 번만 크게
    if (big) shake(app.querySelector('.party'), Math.min(2, style.power));
  };
  if (prefs.fx === 'min') {                 // 연출 최소: 기술은 건너뛰고 명중만
    bumpPts(me, scoreGain(f));
    foes.forEach(foe => { fx.impact(porPos(foe).x, porPos(foe).y, style.pal, 1); hitFoe(foe, true); });
  } else {
    fx.speed = (ui.fast ? 1.8 : 1) * FX_SLOW * (rushing() ? 3 : 1) * fxRate();
    const from = (f.dice || S.dice).map((_, i) => tray.screenPos(i));
    // 1) 주사위가 에너지로 뭉친다 → 2) 내 영웅에게 스며든다 → 3) 영웅이 뛰어올라 기술 발사 → 4) 상대 모두 명중
    const o = await fx.gather(from, { pal: style.pal, power: style.power, onCharge: () => { sfx.charge(style.power); tray.absorb(380 / fx.speed); } });
    tray.restore();
    await fx.flyOrb(o, porPos(me), { pal: style.pal, power: style.power, ms: 240, shrink: 0.7 });
    bumpPts(me, scoreGain(f));                // 에너지가 내 영웅에게 닿는 순간 점수가 오른다
    fx.burst(porPos(me).x, porPos(me).y, { n: 18, pal: style.pal, speed: [60, 200], life: [0.3, 0.6] });
    memberFx(me, 'atk', 620);
    sfx.whoosh();
    await wait(140);
    await Promise.all(foes.map((foe, k) => wait(k * 70 / fx.speed)
      .then(() => fx.strike(cls, porPos(me), porPos(foe), { pal: style.pal, power: style.power, onHit: big => hitFoe(foe, big) }))
      .then(() => fx.impact(porPos(foe).x, porPos(foe).y, style.pal, style.power * (foes.length > 1 ? 0.6 : 0.8)))));
    if (f.cat === 'yacht') { fx.flash('#FFFFFF', 320, 0.5); shake(app.querySelector('.game'), 2.5); }
  }
  ui.dice = null;
  await crownCheck(me);
  render();
  tray.restore();
}
// 1등이 바뀌었으면 왕관을 옮긴다 (점수 연출이 끝날 때까지 왕관은 옛 자리에 둔다)
async function crownCheck(me) {
  const now = leaders();
  const was = crownShown;
  const same = now.length === was.length && now.every(i => was.includes(i));
  ui.crownFreeze = false;
  if (same) return;
  if (now.includes(me) && !was.includes(me) && prefs.fx !== 'min') {
    const from = was.length ? porPos(was[0]) : { x: porPos(me).x, y: porPos(me).y - 80 };
    // 떠나는 왕관은 지운다
    document.querySelectorAll('.member .crown').forEach(el => { el.style.visibility = 'hidden'; });
    sfx.coin();
    await FX().crown(from, { x: porPos(me).x, y: porPos(me).y - 22 }, crownDraw);
    floatText(was.length ? '역전! 1등 탈환' : '1등!', 'gold', -40, 'tray', 'crown');
  }
  crownShown = now;
}
// 캔버스에 그리는 도트 왕관
function crownDraw(g, x, y, s = 1, rot = 0) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(Math.sin(rot) * 0.3); g.scale(s * 2, s * 2);
  const px = (c, a, b, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
  px('#06041A', -7, -6, 14, 10);
  px('#FFD24A', -6, -1, 12, 4); px('#FFD24A', -6, -5, 2, 4); px('#FFD24A', -1, -6, 2, 5); px('#FFD24A', 4, -5, 2, 4);
  px('#FFF0A8', -6, -1, 12, 1); px('#E8435A', -1, 0, 2, 2); px('#C86A0E', -6, 2, 12, 1);
  g.restore();
}

// 보스 스킬마다 주사위(또는 보스)에 맞는 연출
async function skillFx(f) {
  const fx = FX();
  fx.speed = (ui.fast ? 1.8 : 1) * FX_SLOW * (rushing() ? 3 : 1) * fxRate();
  const t = await trayReady();
  const center = el => { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null; };
  const trayC = center(document.getElementById('tray'));
  const bossC = center(document.getElementById('boss-art'));
  const pts = t && f.dice ? f.dice.map(i => t.screenPos(i)) : [];
  const ms = ui.fast ? 500 : 900;
  if ((f.skill === 'breath' || f.skill === 'twist') && t && f.from) {
    const burn = f.skill === 'breath';
    burn ? sfx.fire() : sfx.twist();
    await Promise.all([
      burn ? fx.fire(pts, ms) : fx.vortex(pts, ms),
      ...f.dice.map(i => t.morph(i, burn ? 1 : 7 - f.from[i], burn ? 'burn' : 'twist', ms)),
    ]);
    ui.dice = null;
    render();
    await wait(200);
    return;
  }
  if (f.skill === 'drums' && trayC) {
    for (let k = 0; k < 3; k++) {
      sfx.drum();
      t?.quake();
      fx.quake(trayC.x, trayC.y, trayC.w);
      shake(app.querySelector('.game'), 1.4);
      await wait(ui.fast ? 180 : 320);
    }
    return;
  }
  if (f.skill === 'plunder' && trayC && bossC) { sfx.coin(); await fx.coins(trayC, bossC); ui.hpHold = null; render(); floatText(`+${f.amount}`, 'heal', 0, 'boss-art'); return; }
  if (f.skill === 'bone' && bossC) { sfx.twist(); await fx.shield(bossC); return; }
  if (f.skill === 'seal' && t) {                 // 마법진 · 빛기둥 → 사방에서 쇠사슬이 감기고 봉인 문양이 쾅
    sfx.seal();
    shake(app.querySelector('.game'), 0.6);
    setTimeout(() => shake(app.querySelector('.game'), 1.3), (ui.fast ? 600 : 1000) / fx.speed);
    await fx.seal(pts, ui.fast ? 800 : 1300);
    render();
    return;
  }
  if (f.skill === 'unseal') {                    // 사슬이 달아올라 산산조각, 빛기둥이 솟구친다
    if (!t) return;
    sfx.unseal();
    floatText('봉인 해제!', 'gold', -30, 'tray');
    await fx.unseal(pts, ui.fast ? 600 : 900);
    return;
  }
  sfx.zero();
}

// 마왕의 패기: 화면 전체가 붉게 떨리고 큰 글씨가 내리꽂힌다
async function hakiFx() {
  const fx = FX();
  sfx.boom(3); buzz(120);
  fx.flash('#C21E56', 420, 0.55);
  fx.ring(innerWidth / 2, innerHeight / 2, { color: '#FF2A6A', r0: 20, r1: Math.max(innerWidth, innerHeight), dur: 700, width: 14 });
  fx.ring(innerWidth / 2, innerHeight / 2, { color: '#FFFFFF', r0: 10, r1: innerWidth * 0.8, dur: 520, width: 6 });
  shake(app.querySelector('.game'), 3);
  const el = document.createElement('div');
  el.className = 'haki-banner';
  el.innerHTML = `<b>패기 발동</b><small>${ico('eye')} 이번 라운드 뒤집기 · 조정 금지</small>`;
  document.body.appendChild(el);
  await wait(ui.fast ? 900 : 1600);
  el.classList.add('out');
  setTimeout(() => el.remove(), 400);
}

// 연출 중 오류가 나도 게임이 멈추지 않게 (연출은 건너뛰고 진행)
async function playFx(list) {
  for (const f of list) {
    try { await playOne(f); } catch (err) { console.error('[fx]', f.type, err); ui.dice = null; tray?.restore(); }
  }
  ui.hpHold = null;
  ui.crownFreeze = false;
  releasePts();
}

async function playOne(f) {
  {
    const p = S.players[f.player];
    switch (f.type) {
      case 'round':
        if (S.boss && f.round === 1 && prefs.fx !== 'min') await bossBanner();
        if (!S.tutorial || f.round > 1) await banner(f.round, f.event);
        if (f.event === 'haki' && prefs.fx !== 'min') await hakiFx();
        break;
      case 'score':
        if (f.pts > 0) {
          floatText(`${E.catInfo(f.cat).ko} +${f.pts}`, 'gold');
          stamp(f.pts, f.cat);
          if (f.bonus?.length) floatText(f.bonus.map(b => `${b.ko} +${b.amt}`).join(' · '), 'mint', 30);
          if (f.bonus?.some(b => b.ko === '춤사위') && !S.boss) danceFx(f.player);
          await attackFx(f);
          sfx.score();
        } else {
          sfx.zero();
          floatText(`${E.catInfo(f.cat).ko} 0`, 'dim');
          if (tray) FX().fizzle(S.dice.map((_, i) => tray.screenPos(i)));
          if (!S.boss && prefs.fx !== 'min' && duelTarget(f.player) >= 0) {   // 0점: 모두에게 힘없이 날아가고 다들 피한다
            S.players.forEach((_, foe) => { if (foe !== f.player) { memberFx(foe, 'dodge', 600); FX().miss(porPos(f.player), porPos(foe)); } });
            ui.crownFreeze = false;
          }
          ui.dice = null;
          await wait(380);
        }
        break;
      case 'damage':
        sfx.clack(12); buzz(30);
        bumpPts(f.player, f.amount);
        if (ui.hpHold != null) ui.hpHold = ui.hpHold - (f.amount - (f.blocked || 0)) <= S.boss.hp ? null : ui.hpHold - (f.amount - (f.blocked || 0));
        render(); hitBoss(f.amount, f.blocked);
        if (S.boss.hp <= 0 && ui.hpHold == null && !ui.bossGone) { await wait(260); await bossDeath(); }
        await wait(420);
        break;
      case 'boss': {
        if (f.skill === 'unseal') { await skillFx(f); break; }
        const b = E.bossInfo(S.boss.id);
        const note = toast('', `${b.ko}`, BOSS_LINES[f.skill] + (f.amount ? ` (${f.amount})` : ''), 1900, portrait(b.id, 't-boss'));
        await skillFx(f);
        await note;
        break;
      }
      case 'quest':
        sfx.quest();
        await toast(questIco(f.quest), `의뢰 완료! 「${E.questInfo(f.quest).ko}」`, `${p.name} · ${E.chargeText(f.reward)} · 경험치 +${f.xp}`);
        break;
      case 'xp': sfx.coin(); floatText(`+${f.amount} EXP`, 'mint', 38); await wait(320); break;
      case 'levelup':
        sfx.levelup();
        if (!S.boss) bumpPts(f.player, E.LEVEL_POINTS);
        if (!(online ? p.token === online.token : !p.bot)) await toast(ico('up'), `${p.name} 레벨 ${f.level}!`, '특성 카드를 고르는 중…', 1300);
        break;
      case 'retro':
        sfx.quest();
        if (!S.boss) bumpPts(f.player, f.amount);
        floatText(`${E.perkInfo(f.perk).ko} 소급 +${f.amount}`, 'gold', 0);
        await wait(500);
        break;
      case 'dropped':
        await toast(ico('door'), `${p.name} 연결 끊김`, '1분 안에 돌아오지 않아 봇이 대신 진행합니다.', 2200);
        break;
      case 'midas': floatText('황금손 조정 +1', 'gold', -30, 'tray', 'crown'); break;
      case 'duel': sfx.quest(); await toast(ico('trophy'), '결투 대회 우승!', `${p.name} · 뒤집기 +1 · 조정 +1`); break;
      case 'charge':
        if (f.why === 'monk') { sfx.coin(); if (f.nudge) floatText(`절제 · 조정 +${f.nudge}`, 'mint', -20, 'tray', 'beads'); await wait(300); }
        else if (f.why !== 'quest' && (f.flip || f.nudge)) floatText(E.chargeText(f), 'mint', -20);
        if (f.over) { floatText(`보유 한도 ${E.CHARGE_CAP}개 · ${f.over}개 넘침 → 경험치로`, 'dim', 12); await wait(260); }
        break;
      case 'encore': sfx.card(); danceFx(f.player); floatText(`${p.name} 앙코르! 굴림 +1`, 'gold', -20, 'tray', 'up'); await wait(400); break;
      case 'spill': floatText(`넘친 충전 → 경험치 +${f.xp}`, 'mint', 44, 'tray', 'up'); await wait(300); break;
    }
  }
  ui.hpHold = null;
}

// 처음 나오는 용어는 한 번씩 짧게 설명한다 (튜토리얼을 건너뛴 사람을 위해)
const TERM_TIPS = [
  ['flip', p => p.flip > 0, 'flip', '뒤집기를 얻었어요', '주사위 하나를 반대 면으로 바꿔요 (1↔6, 2↔5, 3↔4). 굴린 뒤 뒤집기 버튼 → 주사위.'],
  ['nudge', p => p.nudge > 0, 'nudge', '조정을 얻었어요', '주사위 하나를 1만큼 올리거나 내려요. 굴린 뒤 조정 버튼 → 주사위 위 +1/−1.'],
  ['perk', p => Object.keys(p.perks).length > 0, 'star', '특성 카드', '고른 특성은 게임 끝까지 적용돼요. 아래 영웅 줄의 아이콘을 누르면 효과를 볼 수 있어요.'],
  ['hold', p => S.rolled && S.rollsLeft > 0, 'sheet', '주사위 잡기', '주사위를 눌러 잡고 다시 굴려요. 꾹 누르면 그 주사위 정보를 볼 수 있어요.'],
];
function termTips() {
  if (tut || !S || S.ended || !myControl() || ui.busy) return;
  const p = E.current(S);
  for (const [key, cond, icon, title, text] of TERM_TIPS) {
    if (seen[`tip-${key}`] || !cond(p)) continue;
    markSeen(`tip-${key}`);
    toast(ico(icon), title, text, 3600);
    return;
  }
}

// 내 차례 알림: 차례가 넘어오면 가운데 배너 + 소리 + 진동 (다른 앱을 보고 있으면 탭 제목도 바꾼다)
function turnAlert() {
  if (!S || S.ended || tut || S.phase !== 'roll' || S.rolled) return;
  const key = `${S.seed}:${S.round}:${S.turn}`;
  if (ui.turnAlert === key) return;
  ui.turnAlert = key;
  if (!myControl()) return;
  const cur = E.current(S);
  const hotseat = !online && S.players.filter(p => !p.bot).length > 1;
  const el = document.createElement('div');
  el.className = 'turn-alert';
  el.style.setProperty('--c', E.classInfo(cur.cls).color);
  el.innerHTML = `${portrait(cur.cls, 'ta')}<b>${hotseat ? `${esc(cur.name)}의 차례!` : '내 차례!'}</b>`;
  const r = document.getElementById('tray')?.getBoundingClientRect();
  el.style.top = `${r ? r.top + r.height / 2 : innerHeight / 2}px`;
  document.querySelectorAll('.turn-alert').forEach(x => x.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
  sfx.turn();
  setTimeout(() => sfx.turn(), 180);
  buzz(60);
  if (document.hidden) {
    const base = document.title;
    document.title = '▶ 내 차례! · ' + GAME.name;
    const back = () => { if (!document.hidden) { document.title = base; document.removeEventListener('visibilitychange', back); } };
    document.addEventListener('visibilitychange', back);
  }
}

// 같은 팝업이 이미 떠 있으면 다시 그리지 않는다
// (온라인에서는 8초마다 오는 접속 신호에도 화면을 갱신해서, 그때마다 팝업이 새로 튀어나왔다)
const popupShown = key => ui.popupKey === key && layer.firstElementChild;

function showLevelUp() {
  const p = E.current(S);
  const offer = p.offers[0];
  const key = `lv:${S.seed}:${S.round}:${S.turn}:${p.level}:${p.offers.length}:${offer.join()}`;
  if (popupShown(key) && layer.querySelector('.lv-overlay')) return;
  ui.popupKey = key;
  const hasLegend = offer.some(id => E.perkInfo(id).rarity === 3);
  const total = Math.max(p.lvBatch || 1, p.offers.length), nth = total - p.offers.length + 1;
  layer.innerHTML = `<div class="overlay lv-overlay"><div class="lvup">
    <div class="rays"></div>
    <div class="lv-hero">${portrait(p.cls, 'big')}</div>
    <h1>LEVEL UP!</h1>
    <div class="lv-sub">${esc(p.name)} · <b>Lv.${p.level - p.offers.length + 1}</b></div>
    <p class="lv-hint">${total > 1 ? `<b class="lv-count">레벨업 보상 ${nth} / ${total}</b> · ` : ''}카드 한 장을 골라 영구 특성을 얻으세요</p>
    <div class="cards" style="--n:${offer.length}">
      ${offer.map(id => {
        const k = E.perkInfo(id), have = E.perkCount(p, id);
        return `<button class="card r${k.rarity}" data-act="perk" data-id="${id}">
          <span class="rar">${E.RARITY[k.rarity].ko}</span><span class="c-ic">${perkIco(id, 'lg')}</span><b>${k.ko}</b><p>${k.desc}</p>
          ${have && !k.instant ? `<em>보유 ${have} → ${have + 1}</em>` : ''}${k.instant ? '<em>즉시 받음</em>' : ''}
          ${E.perkRetro(p, id) ? `<em class="retro">지금 고르면 즉시 +${E.perkRetro(p, id)}점</em>` : ''}</button>`;
      }).join('')}
    </div>
  </div></div>`;
  setTimeout(() => (hasLegend ? sfx.legend() : sfx.card()), 350);
  updateCoach();
}

function showResults() {
  const key = `res:${S.seed}:${S.round}:${online ? online.room?.fxId : ''}`;
  if (popupShown(key) && layer.querySelector('.results')) return;
  ui.popupKey = key;
  stopBgm();
  FX().rage(false);
  recordProfile();
  // 내가 졌으면 패배 곡, 이겼으면(또는 한 기기에서 여럿이 한 판) 승리 팡파레 뒤 승리 곡
  if (lostGame()) { sfx.lose(); setTimeout(() => playBgm('title'), 2300); }
  else { sfx.win(); setTimeout(() => playBgm('victory'), 1500); }
  if (!online) store.del(KEYS.save);
  if (S.mode === 'coop') return showCoopResults();
  const rank = E.ranking(S);
  const medals = ['1ST', '2ND', '3RD', '4TH'];
  const fo = S.forfeit != null ? S.players[S.forfeit] : null;
  layer.innerHTML = `<div class="overlay solid"><div class="results">
    <h1>${fo ? '기권승' : '모험 종료'}</h1>
    <div class="winner">${portrait(rank[0].p.cls, 'big')}<b>${esc(rank[0].p.name)} 승리!</b>${fo ? `<small class="hint">${esc(fo.name)} 님이 1분 넘게 돌아오지 않아 기권패</small>` : ''}</div>
    ${gemsBox()}
    ${rank.map((r, k) => {
      const b = E.breakdown(r.p);
      return `<div class="frame rank${k === 0 ? ' first' : ''}">
        <span class="medal m${k}">${r.out ? '기권' : medals[k]}</span>${portrait(r.p.cls)}
        <div class="who"><b>${esc(r.p.name)} <small>Lv.${r.p.level}</small></b>
          <span>점수표 ${b.card}${b.bonus ? '+35' : ''} · 레벨 +${b.level} · 의뢰 ${r.p.questsDone.length}</span></div>
        <span class="tot" data-n="${r.total}">${r.total}</span></div>`;
    }).join('')}
    ${resultActions()}
  </div></div>`;
  countUp(layer);
}
function lostGame() {
  if (S.mode === 'coop') return !S.boss.won;
  const humans = S.players.filter(p => !p.bot).length;
  if (!online && humans > 1) return false;
  const idx = online ? S.players.findIndex(p => p.token === online.token) : S.players.findIndex(p => !p.bot);
  if (idx < 0) return false;
  const top = E.ranking(S)[0];
  return !(top.i === idx || top.total === E.finalScore(S.players[idx]) && S.forfeit !== idx);
}
function showCoopResults() {
  const b = S.boss, info = E.bossInfo(b.id), grade = E.coopGrade(S);
  if (b.won && b.diff === 2 && demonOpen() && !store.get('diceheroes.demonSeen')) setTimeout(showDemonUnlock, 3200);
  const order = S.players.map((p, i) => ({ p, i, dmg: Math.round(b.dmg[i] || 0) })).sort((x, y) => y.dmg - x.dmg);
  layer.innerHTML = `<div class="overlay solid"><div class="results coop-res">
    <h1>${b.won ? '토벌 성공!' : '토벌 실패…'}</h1>
    <div class="boss-result${b.won ? ' down' : ''}" style="--c:${info.color}">${portrait(b.id, 'boss-big')}</div>
    <div class="grade g${grade}">${grade}</div>
    <p class="hint">${info.ko} · ${E.DIFFS[b.diff].ko} · ${b.won ? `${S.round}라운드에 쓰러뜨림` : `남은 체력 ${b.hp}`}</p>
    ${gemsBox()}
    ${order.map((r, k) => `<div class="frame rank${k === 0 ? ' first' : ''}">
        <span class="medal m${k}">${k === 0 ? 'MVP' : k + 1}</span>${portrait(r.p.cls)}
        <div class="who"><b>${esc(r.p.name)} <small>Lv.${r.p.level}</small></b><span>점수표 ${E.cardTotal(r.p)} · 의뢰 ${r.p.questsDone.length}</span></div>
        <span class="tot">${ico('sword')}<i data-n="${r.dmg}">${r.dmg}</i></span></div>`).join('')}
    ${resultActions()}
  </div></div>`;
  countUp(layer);
}
function resultActions() {
  if (online) return `<div class="res-actions">
    ${isHost() ? '<button class="pbtn gold" data-act="room-again">같은 방에서 다시</button>' : '<span class="waiting">방장이 다시 시작할 수 있어요</span>'}
    <button class="pbtn" data-act="home">메인 메뉴</button></div>`;
  return `<div class="res-actions">
    <button class="pbtn gold" data-act="again">다시 하기</button>
    <button class="pbtn" data-act="home">메인 메뉴</button></div>`;
}

// ── 대시보드 (내 기록) ───────────────────────────────────────────────────────
// 이 기기에 쌓이는 기록: 닉네임, 판 수·승리, 최고 점수, 직업별 플레이, 모은 특성(아티팩트), 보스 토벌 등급, 최근 기록
const GRADE_RANK = { S: 4, A: 3, B: 2, F: 1 };
function loadProfile() {
  const p = store.get(KEYS.profile) || {};
  return { games: 0, wins: 0, best: null, classes: {}, perks: {}, bosses: {}, recent: [], recorded: [], ...p };
}
// 한 판 보석 정산 → 결과 화면의 보석 칸을 채운다
let gemResult = null;
async function claimGems(info) {
  gemResult = { pending: true };
  paintGems();
  const r = await Wal.earn(info).catch(err => ({ ok: false, why: err?.message || '서버 오류' }));
  gemResult = r;
  paintGems();
  if (r.ok && r.total) { sfx.coin(); }
}
function gemsBox() {
  if (!gemResult) return '';
  return `<div class="frame gem-res" id="gem-res">${gemInner()}</div>`;
}
function gemInner() {
  const r = gemResult;
  if (!r || r.pending) return `<span class="hint">${ico('gem')} 보석 정산 중…</span>`;
  if (r.offline) return `<span class="hint">${ico('gem')} 오프라인이라 이번 판은 보석을 받지 못했어요</span>`;
  if (!r.ok) return `<span class="hint">${ico('gem')} 보석을 받지 못했어요 · ${esc(r.why || '')}</span>`;
  if (!r.total) return `<span class="hint">${ico('gem')} 이번 판 보석 없음 (점수 100점마다 5개)</span>`;
  return `<b class="gem-total">${ico('gem')} +${r.total}</b>
    <span class="gem-parts">${r.parts.filter(p => p.gems || p.id === 'win').map(p => `${esc(p.ko)} ${p.gems ? '+' + p.gems : ''}`).join(' · ')}</span>
    <small class="hint">보유 ${Wal.gems().toLocaleString()} · 오늘 대전 승리 보상 ${Wal.VS_DAILY - Wal.vsLeftToday()}/${Wal.VS_DAILY}</small>`;
}
function paintGems() { const el = document.getElementById('gem-res'); if (el) el.innerHTML = gemInner(); }

function recordProfile() {
  if (!S || S.tutorial) return;
  const idx = online ? S.players.findIndex(p => p.token === online.token) : S.players.findIndex(p => !p.bot);
  if (idx < 0) return;
  const key = `${S.seed}:${online?.code || 'local'}`;
  const prof = loadProfile();
  if (prof.recorded.includes(key)) return;            // 같은 판을 두 번 기록하지 않는다
  const me = S.players[idx];
  const score = E.finalScore(me);
  const coop = S.mode === 'coop';
  const grade = coop ? E.coopGrade(S) : null;
  const win = coop ? !!S.boss.won : E.ranking(S)[0].i === idx || E.ranking(S)[0].total === score && S.forfeit !== idx;
  prof.recorded = [...prof.recorded, key].slice(-30);
  track('game_end', { mode: S.mode, online: online ? 1 : 0, win: win ? 1 : 0, cls: me.cls, ...(coop ? { boss: S.boss.id, diff: S.boss.diff } : {}) });
  prof.games++;
  if (win) prof.wins++;
  if (!prof.best || score > prof.best.score) prof.best = { score, cls: me.cls, mode: S.mode, date: Date.now() };
  prof.classes[me.cls] = (prof.classes[me.cls] || 0) + 1;
  for (const [id, n] of Object.entries(me.perks)) prof.perks[id] = (prof.perks[id] || 0) + n;
  claimGems({ mode: S.mode, win, online: !!online, room: online?.code || null, humans: S.players.filter(p => !p.bot).length, score, flip: me.flip, nudge: me.nudge,
    boss: coop ? S.boss.id : null, diff: coop ? S.boss.diff : null });
  if (coop) {
    const bk = `${S.boss.id}:${S.boss.diff}`;
    const b = prof.bosses[bk] || { tries: 0, wins: 0, grade: null };
    b.tries++;
    if (S.boss.won) b.wins++;
    if (!b.grade || GRADE_RANK[grade] > GRADE_RANK[b.grade]) b.grade = grade;
    prof.bosses[bk] = b;
  }
  prof.recent = [{ date: Date.now(), mode: S.mode, cls: me.cls, score, win, boss: coop ? S.boss.id : null, diff: coop ? S.boss.diff : null, grade, online: !!online },
    ...prof.recent].slice(0, 10);
  store.set(KEYS.profile, prof);
}

function showDashboard() {
  screen = 'dashboard';
  setStage(null);
  layer.innerHTML = '';
  const prof = loadProfile();
  const mainCls = Object.entries(prof.classes).sort((a, b) => b[1] - a[1])[0]?.[0] || setup.find(p => !p.bot)?.cls || 'warrior';
  const maxCls = Math.max(1, ...Object.values(prof.classes));
  const perks = E.PERKS.filter(k => !k.filler);
  const got = perks.filter(k => prof.perks[k.id]).length;
  const date = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  app.innerHTML = `
  <div class="screen page dash">
    <header class="page-head">
      <button class="icon-btn" data-act="home" aria-label="뒤로">◀</button>
      <h2>대시보드</h2>
    </header>
    <div class="wrap">
      <section class="frame dash-hero" style="--c:${E.classInfo(mainCls).color}">
        <div class="portrait">${portrait(mainCls)}</div>
        <div class="dash-id">
          <label class="field">닉네임<input id="dash-name" value="${esc(myName)}" maxlength="10"></label>
          <small>주 직업 <b style="color:${E.classInfo(mainCls).color}">${E.classInfo(mainCls).ko}</b></small>
        </div>
      </section>
      <section class="dash-stats">
        <div class="frame"><small>플레이</small><b>${prof.games}</b></div>
        <div class="frame"><small>승리</small><b>${prof.wins}</b></div>
        <div class="frame"><small>승률</small><b>${prof.games ? Math.round((prof.wins / prof.games) * 100) : 0}%</b></div>
        <div class="frame gold"><small>최고 점수</small><b>${prof.best?.score ?? '-'}</b></div>
      </section>
      ${prof.best ? `<p class="hint">최고 점수 ${prof.best.score}점 · ${E.classInfo(prof.best.cls).ko} · ${prof.best.mode === 'coop' ? '협동' : '대전'} · ${date(prof.best.date)}</p>` : '<p class="hint">한 판을 끝내면 기록이 쌓여요.</p>'}

      <section class="frame">
        <h3 class="dash-h">직업</h3>
        <div class="dash-cls">
          ${E.CLASSES.map(c => `<div class="dc-row" style="--c:${c.color}">${portrait(c.id, 'mini')}<span>${c.ko}</span>
            <div class="bar"><i style="width:${((prof.classes[c.id] || 0) / maxCls) * 100}%"></i></div><b>${prof.classes[c.id] || 0}</b></div>`).join('')}
        </div>
      </section>

      <section class="frame">
        <h3 class="dash-h">아티팩트 도감 <small>${got} / ${perks.length}</small></h3>
        <div class="dash-perks">
          ${perks.map(k => `<button class="dp${prof.perks[k.id] ? '' : ' none'}" style="--rc:${rarityColor(k.rarity)}" data-r="${E.RARITY[k.rarity].ko[0]}" data-act="dash-perk" data-id="${k.id}">
            ${perkIco(k.id)}${prof.perks[k.id] ? `<b>${prof.perks[k.id]}</b>` : ''}</button>`).join('')}
        </div>
      </section>

      <section class="frame">
        <h3 class="dash-h">보스 토벌 <small>최고 등급</small></h3>
        <div class="dash-boss">
          <span></span>${E.DIFFS.map(d => `<small style="color:${d.color}">${d.ko}</small>`).join('')}
          ${E.BOSSES.map(b => `${portrait(b.id, 'mini')}${E.DIFFS.map(d => {
            const r = prof.bosses[`${b.id}:${d.id}`];
            return `<span class="db-cell${r?.grade ? ` g${r.grade}` : ''}">${r ? `<b>${r.grade}</b><small>${r.wins}/${r.tries}</small>` : '-'}</span>`;
          }).join('')}`).join('')}
        </div>
      </section>

      <section class="frame">
        <h3 class="dash-h">최근 기록</h3>
        ${prof.recent.length ? `<div class="dash-recent">${prof.recent.map(r => `<div class="dr-row">
          <small>${date(r.date)}</small>${portrait(r.cls, 'mini')}
          <span>${r.mode === 'coop' ? `협동 · ${E.bossInfo(r.boss)?.ko.split(' ').pop() || ''} ${E.DIFFS[r.diff]?.ko || ''}` : '대전'}${r.online ? ' · 온라인' : ''}</span>
          <b>${r.score}점</b><em class="${r.win ? 'win' : 'lose'}">${r.mode === 'coop' ? r.grade : r.win ? '승리' : '패배'}</em></div>`).join('')}</div>`
        : '<p class="hint">아직 기록이 없어요.</p>'}
      </section>
      <div class="dash-backup">
        <button class="pbtn small" data-act="dash-export">백업 코드 복사</button>
        <button class="pbtn small" data-act="dash-import">백업 코드로 복원</button>
      </div>
      <p class="hint">기록은 이 기기에만 저장돼요. 기기를 바꾸거나 앱을 지우기 전에 백업 코드를 보관하세요.</p>
      <button class="pbtn small" data-act="dash-reset">기록 초기화</button>
    </div>
  </div>`;
}

// 주사위가 부딪힐 때: 스킨마다 다른 소리, 하트 주사위는 하트가 뿅뿅 튄다
let heartT = 0;
function diceHit(v, i, t) {
  const skin = diceSkin(prefs.diceSkin);
  sfx.hit(skin.sound, v);
  if (v > 3.5) rumble(v);   // 던지는 동안·흔드는 동안 부딪힐 때마다 진동
  if (skin.sound !== 'pop' || v < 3.5 || !t || i == null || prefs.fx === 'min') return;
  const now = performance.now();
  if (now - heartT < 90) return;
  heartT = now;
  const p = t.screenPos(i);
  for (let k = 0; k < 2 + (v > 8 ? 1 : 0); k++) {
    const h = document.createElement('span');
    h.className = 'heart-pop';
    h.textContent = '♥';
    h.style.left = `${p.x + (Math.random() - 0.5) * 30}px`;
    h.style.top = `${p.y - 10}px`;
    h.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
    h.style.fontSize = `${14 + Math.random() * 12}px`;
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 900);
  }
}

// ── 꾸미기 (주사위 · 트레이 스킨) ─────────────────────────────────────────────
// 위쪽에 실제 3D 트레이 미리보기, 아래에 스킨 목록. 고르면 바로 미리보기와 게임 트레이에 입혀진다.
let skinPreview = null;
function closeSkinPreview() {
  skinTry = null;
  skinPreview?.destroy?.();
  skinPreview = null;
}
async function showSkins(tab = 'dice') {
  const list = tab === 'dice' ? DICE_SKINS : TRAY_SKINS;
  const cur = tab === 'dice' ? diceSkin(prefs.diceSkin).id : traySkin(prefs.traySkin).id;
  const thumb = tab === 'dice' ? diceThumb : trayThumb;
  const reuse = skinPreview && layer.querySelector('.skin-preview');
  const cards = list.map(k => {
    const open = Wal.owns(tab, k.id);
    const trying = skinTry?.kind === tab && skinTry.id === k.id;
    return `<button class="skin-card${k.id === cur ? ' on' : ''}${open ? '' : ' locked'}${trying ? ' trying' : ''}" data-act="skin-pick" data-kind="${tab}" data-id="${k.id}">
      <img src="${thumb(k.id)}" alt="">
      <b>${esc(k.name)}</b><small>${esc(k.desc)}</small>
      ${open ? (k.tier === 'special' ? '<span class="skin-tag">보유</span>' : '') : `<span class="skin-tag price">${ico('gem', 'xs')}${Wal.priceOf(tab, k.id).toLocaleString()}</span>`}
      ${k.id === cur ? '<span class="skin-on">사용 중</span>' : ''}
    </button>`;
  }).join('');
  const buyBar = () => skinTry ? `<div class="buy-bar"><span>${esc((skinTry.kind === 'dice' ? diceSkin : traySkin)(skinTry.id).name)} 미리 보는 중</span>
      <button class="pbtn gold small" data-act="buy" data-kind="${skinTry.kind}" data-id="${skinTry.id}">${ico('gem', 'xs')} ${Wal.priceOf(skinTry.kind, skinTry.id).toLocaleString()}에 사기</button></div>` : '';
  if (reuse) {
    layer.querySelector('.skin-grid').innerHTML = cards;
    layer.querySelectorAll('.skin-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    layer.querySelector('.buy-slot').innerHTML = buyBar();
    layer.querySelector('.gem-chip b').textContent = Wal.gems().toLocaleString();
    return;
  }
  closeSkinPreview();
  DICE_SKINS.forEach(k => preloadDice(k.id).catch(() => {}));   // 고르면 바로 바뀌게 그림 스킨을 미리 받아 둔다
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame skins" data-act="noop">
    <h2>꾸미기 <span class="gem-chip">${ico('gem', 'xs')}<b>${Wal.gems().toLocaleString()}</b></span></h2>
    <div class="skin-preview"><button class="pbtn small skin-roll" data-act="skin-roll">굴려 보기</button></div>
    <div class="seg skin-tabs" role="tablist">
      <button data-act="skin-tab" data-tab="dice" class="${tab === 'dice' ? 'on' : ''}">주사위</button>
      <button data-act="skin-tab" data-tab="tray" class="${tab === 'tray' ? 'on' : ''}">트레이</button>
    </div>
    <div class="buy-slot">${buyBar()}</div>
    <div class="skin-grid">${cards}</div>
    <p class="hint">보석은 대전 승리 · 보스 토벌 · 높은 점수로 모아요. 잠긴 스킨은 눌러서 미리 볼 수 있어요.</p>
    <button class="pbtn gold" data-act="close">닫기</button>
  </div></div>`;
  const host = layer.querySelector('.skin-preview');
  try {
    const { webglOK } = await import('./dice2d.js');
    if (!webglOK()) { host.classList.add('flat'); return; }
    const { DiceTray } = await import('./dice3d.js');
    if (!host.isConnected) return;
    skinPreview = new DiceTray(host, { lowGfx: !!prefs.lowGfx, diceSkin: diceSkin(prefs.diceSkin).id, traySkin: traySkin(prefs.traySkin).id, onHit: (v, i) => diceHit(v, i, skinPreview) });
    skinPreview.show([6, 5, 1, 3, 4], [false, false, false, false, true]);
  } catch (err) { console.warn('[skins]', err); host.classList.add('flat'); }
}
// 안 산 스킨: 미리 보기만 (사기 버튼이 뜬다). 산 스킨: 바로 쓴다
let skinTry = null;
function pickSkin(kind, id) {
  if (!Wal.owns(kind, id)) {
    sfx.select();
    skinTry = { kind, id };
    const d = kind === 'dice' ? id : diceSkin(prefs.diceSkin).id, t = kind === 'tray' ? id : traySkin(prefs.traySkin).id;
    skinPreview?.setSkin(d, t);
    return showSkins(kind);
  }
  skinTry = null;
  sfx.select();
  if (kind === 'dice') prefs.diceSkin = id; else prefs.traySkin = id;
  store.set(KEYS.prefs, prefs);
  const d = diceSkin(prefs.diceSkin).id, t = traySkin(prefs.traySkin).id;
  skinPreview?.setSkin(d, t);
  tray?.setSkin?.(d, t);
  showSkins(kind);
}
// 잠긴 직업을 누르면: 설명과 가격을 보여 주고 살지 묻는다
let afterClassBuy = null;
const firstOwnedClass = () => E.CLASSES.find(c => Wal.owns('cls', c.id))?.id || 'gambler';
function classBuyDialog(id, then) {
  const k = E.classInfo(id), price = Wal.priceOf('cls', id);
  afterClassBuy = then;
  sfx.select();
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame buy-cls" data-act="noop" style="--c:${k.color}">
    <h2>${portrait(id, 'mini')} ${k.ko} 해금</h2>
    <p><b style="color:${k.color}">${k.ko}</b> ${k.desc}</p>
    <p class="hint">보유 ${ico('gem', 'xs')}${Wal.gems().toLocaleString()} · 해금하면 계속 쓸 수 있어요 (봇 동료는 해금 없이도 모든 직업)</p>
    <div class="modal-actions"><button class="pbtn" data-act="close">취소</button>
      <button class="pbtn gold" data-act="buy" data-kind="cls" data-id="${id}" ${Wal.gems() < price ? 'disabled' : ''}>${ico('gem', 'xs')} ${price.toLocaleString()}에 해금</button></div>
  </div></div>`;
}

// 보석으로 사기 (스킨 · 직업 공용)
async function buyItem(kind, id, btn) {
  if (btn) btn.disabled = true;
  const r = await Wal.buy(kind, id).catch(err => ({ ok: false, why: navigator.onLine ? (err?.message || '서버 오류') : '인터넷 연결이 필요해요.' }));
  if (btn) btn.disabled = false;
  if (!r.ok) { sfx.back(); return toast(ico('warn'), '살 수 없어요', r.why, 2000); }
  sfx.coin();
  const name = kind === 'cls' ? E.classInfo(id).ko : (kind === 'dice' ? diceSkin : traySkin)(id).name;
  toast(ico('gem'), `${name} 획득!`, `남은 보석 ${Wal.gems().toLocaleString()}`, 1600);
  if (kind === 'cls') { layer.innerHTML = ''; return afterClassBuy?.(id); }
  return pickSkin(kind, id);
}

async function rollPreview() {
  if (!skinPreview || skinPreview.anim) return;
  sfx.rollPress();
  const vals = [1, 2, 3, 4, 5].map(() => 1 + Math.floor(Math.random() * 6));
  vals[4] = 4;
  await skinPreview.roll(vals, [true, true, true, true, false]);
}

// ── 설정 · 크레딧 ────────────────────────────────────────────────────────────
function showSettings(inGame = false) {
  const a = audioSettings();
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>${inGame ? '일시정지' : '설정'}</h2>
    <label class="set-row">배경음악<input id="set-bgm" type="range" min="0" max="1" step="0.05" value="${a.bgm}"></label>
    <label class="set-row">효과음<input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${a.sfx}"></label>
    <label class="set-row">진동${canVibrate() ? '' : ' <small>이 기기는 버튼을 누를 때만</small>'}<input id="set-vib" type="checkbox" ${a.vibrate ? 'checked' : ''}></label>
    <div class="set-row">연출 속도<div class="seg" role="group" aria-label="연출 속도">
      ${[['normal', '보통'], ['fast', '빠르게'], ['min', '최소']].map(([v, k]) => `<button data-act="pref-fx" data-v="${v}" class="${prefs.fx === v ? 'on' : ''}">${k}</button>`).join('')}
    </div></div>
    <label class="set-row">글자 크게<input id="set-big" type="checkbox" ${prefs.bigText ? 'checked' : ''}></label>
    <label class="set-row">색약 보조 표시<input id="set-ca" type="checkbox" ${prefs.colorAssist ? 'checked' : ''}></label>
    <label class="set-row">그래픽 절약 <small>배터리·발열↓</small><input id="set-low" type="checkbox" ${prefs.lowGfx ? 'checked' : ''}></label>
    ${SHAKE_OK ? `<label class="set-row">흔들어 굴리기 <small>폰을 흔들면 굴림</small><input id="set-shake" type="checkbox" ${prefs.shake ? 'checked' : ''}></label>` : ''}
    ${PROD ? `<label class="set-row">사용 통계 보내기 <small>익명 · 게임 개선용</small><input id="set-stats" type="checkbox" ${prefs.analytics ? 'checked' : ''}></label>` : ''}
    ${PROD && !inGame ? '<div class="set-row account" id="account-row">계정 <small>확인 중…</small></div>' : ''}
    <p class="hint diag">v${GAME.version} · 그래픽 ${esc(gfxNote || '아직 안 씀')}${lastErr ? `<br>최근 오류: ${esc(lastErr)}` : ''}</p>
    ${inGame ? '' : `<div class="set-links"><a href="privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a><button class="linkish" data-act="wipe">내 데이터 지우기</button></div>`}
    ${online ? `<p class="hint">온라인 방 ${online.code}${inGame && S && !S.ended ? '<br>나가도 1분 안에 돌아오면 이어서 할 수 있어요 (메인 화면의 방으로 돌아가기). 1분이 지나면 ' + (S.mode === 'versus' && S.players.length === 2 ? '기권패' : '봇이 대신 진행') + '.' : ''}</p>` : ''}
    <div class="modal-actions">
      ${inGame ? `<button class="pbtn gold" data-act="close">계속하기</button><button class="pbtn" data-act="quit">${online ? '방 나가기' : '메인 메뉴로'}</button>` :
        '<button class="pbtn" data-act="story">스토리 다시 보기</button><button class="pbtn" data-act="tutorial">튜토리얼 다시 보기</button><button class="pbtn gold" data-act="close">닫기</button>'}
    </div>
  </div></div>`;
}
// 설정의 계정 줄: 게스트면 '구글 계정 연결' 버튼
async function paintAccount() {
  const el = document.getElementById('account-row');
  if (!el) return;
  try {
    const a = await accountInfo();
    el.innerHTML = a.guest
      ? `계정 <small>게스트 · 이 기기에만 저장</small><button class="pbtn small gold" data-act="link-google">구글 계정 연결</button>`
      : `계정 <small>구글 ${esc(a.email)} · 다른 기기에서도 이어서</small>`;
  } catch { el.innerHTML = '계정 <small>인터넷 연결이 필요해요</small>'; }
}

function showCredits() {
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame credits" data-act="noop">
    <h2>크레딧</h2>
    <p><b>${esc(GAME.name)}</b> v${GAME.version}<br>기획 · 개발 ${esc(GAME.studio)}</p>
    <p>음악 · 효과음 · 도트 그림<br>이 게임을 위해 새로 만든 것 (WebAudio 칩튠 합성)</p>
    <p>픽셀 서체 <b>Galmuri</b> © Lee Minseo · SIL Open Font License 1.1<br>
       3D <b>three.js</b> · MIT License<br>
       물리 <b>cannon-es</b> · MIT License<br>
       온라인 <b>Firebase</b></p>
    <p>기반 규칙 <b>요트(Yacht)</b> 주사위 게임</p>
    <p class="thanks">SPECIAL THANKS TO<br><b>HAYEONG</b></p>
    <button class="pbtn gold" data-act="close">닫기</button>
  </div></div>`;
}

// ── 튜토리얼 코치 ────────────────────────────────────────────────────────────
function startTutorial() {
  tut = { step: 0, shown: -1 };
  const name = setup.find(p => !p.bot)?.name || '나';
  startGame(createTutorialGame(name));
}

// 지금 단계에서 강조할 요소 (도구를 켠 뒤에는 주사위 쪽으로 옮겨 간다)
function coachTarget(st) {
  const sel = ui.tool && st.toolTarget ? st.toolTarget : st.target;
  return sel ? document.querySelector(sel) : null;
}

function updateCoach() {
  if (!tut || screen !== 'game') { coachEl.innerHTML = ''; return; }
  const st = STEPS[tut.step];
  if (!st || ui.busy) { coachEl.innerHTML = ''; tut.shown = -1; return; }
  const target = coachTarget(st);
  if (st.target && !target) { coachEl.innerHTML = ''; tut.shown = -1; return; }
  const r = target?.getBoundingClientRect();
  // 안내 상자는 단계가 바뀔 때만 새로 그린다 (같은 안내가 두 번 튀어나오지 않게)
  if (tut.shown !== tut.step) {
    tut.shown = tut.step;
    coachEl.innerHTML = `
      <div class="blk" data-act="blocked"></div><div class="blk" data-act="blocked"></div>
      <div class="blk" data-act="blocked"></div><div class="blk" data-act="blocked"></div>
      <div class="spot"></div>
      <div class="scroll-hint" hidden></div>
      <div class="coach-box">
        <img class="spr coach-fairy" src="${spriteURL('fairy', 4)}" alt="">
        <div class="coach-text"><b>루루</b><p>${br(st.shakeText && SHAKE_OK ? st.shakeText : st.text)}</p>
          ${st.next ? `<button class="pbtn gold small" data-act="coach-next">${st.next}</button>` : ''}
          <span class="coach-step">${tut.step + 1} / ${STEPS.length}</span>
          <button class="coach-skip" data-act="coach-skip">튜토리얼 건너뛰기 ▶▶</button></div>
      </div>`;
  }
  const [b1, b2, b3, b4] = coachEl.querySelectorAll('.blk');
  const spot = coachEl.querySelector('.spot');
  const box = coachEl.querySelector('.coach-box');
  const hint = coachEl.querySelector('.scroll-hint');
  const W = innerWidth, H = innerHeight;
  if (!r) {
    // 안내만 하는 단계: 화면 전체를 막는다
    Object.assign(b1.style, { left: 0, top: 0, width: `${W}px`, height: `${H}px` });
    [b2, b3, b4].forEach(b => (b.style.width = '0'));
    spot.hidden = true;
    box.className = 'coach-box center';
    hint.hidden = true;
    return;
  }
  const pad = 6;
  const L = r.left - pad, T = r.top - pad, R = r.right + pad, B = r.bottom + pad;
  Object.assign(b1.style, { left: 0, top: 0, width: `${W}px`, height: `${Math.max(0, T)}px` });
  Object.assign(b2.style, { left: 0, top: `${B}px`, width: `${W}px`, height: `${Math.max(0, H - B)}px` });
  Object.assign(b3.style, { left: 0, top: `${T}px`, width: `${Math.max(0, L)}px`, height: `${B - T}px` });
  Object.assign(b4.style, { left: `${R}px`, top: `${T}px`, width: `${Math.max(0, W - R)}px`, height: `${B - T}px` });
  spot.hidden = false;
  Object.assign(spot.style, { left: `${L}px`, top: `${T}px`, width: `${R - L}px`, height: `${B - T}px` });
  const low = r.top + r.height / 2 > H * 0.5;
  box.className = `coach-box ${low ? 'top' : 'bottom'}`;
  // 버튼이 화면 밖이면 스크롤 방향을 알려 준다
  const off = r.top > H - 40 ? 'down' : r.bottom < 40 ? 'up' : null;
  hint.hidden = !off;
  if (off) {
    hint.className = `scroll-hint ${off}`;
    hint.innerHTML = off === 'down' ? '▼ 아래로 스크롤해서 반짝이는 곳을 눌러 줘 ▼' : '▲ 위로 스크롤해 줘 ▲';
    box.className = `coach-box ${off === 'down' ? 'top' : 'bottom'}`;
  }
}
function scrollToTarget() {
  const st = STEPS[tut?.step];
  const el = st && coachTarget(st);
  if (el && !el.closest('.overlay')) {
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 170) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  setTimeout(updateCoach, 450);
}
function advanceTutorial() {
  if (!tut) return;
  let moved = false;
  for (;;) {
    const st = STEPS[tut.step];
    if (!st || st.next || !st.done || !st.done(S)) break;
    st.after?.(S);
    if (st.shake) tutShakeDone();
    tut.step++;
    moved = true;
  }
  if (moved) { sfx.select(); render(); scrollToTarget(); }
}
// 튜토리얼 중에는 안내한 동작만 받는다
function tutorialAllows(act, t) {
  if (!tut) return true;
  if (act === 'coach-next' || act === 'coach-skip' || act === 'skip-banner') return true;
  const st = STEPS[tut.step];
  if (!st || st.next) return false;
  if (!st.allow?.includes(act)) return false;
  const only = st.only || {};
  if (act === 'score' && only.cat && t.dataset.cat !== only.cat) return false;
  if (act === 'tool' && only.tool && t.dataset.tool !== only.tool) return false;
  if (act === 'tool' && only.tool && ui.tool === only.tool) return false;      // 도구를 끄지 못하게
  if ((act === 'die' || act === 'nudge') && only.die !== undefined && Number(t.dataset.i) !== only.die) return false;
  if (act === 'die' && only.tool && ui.tool !== only.tool) return false;
  if (act === 'nudge' && only.d !== undefined && Number(t.dataset.d) !== only.d) return false;
  return true;
}
// 튜토리얼 끝내기 (다 봤거나 건너뛰었거나). 다음 실행부터는 자동으로 뜨지 않는다.
function endTutorial(skipped) {
  sfx.select();
  tut = null;
  if (SHAKE_OK) listenShake(!!prefs.shake);
  layer.innerHTML = '';
  markSeen('tutorial');
  track('tutorial_complete');
  coachEl.innerHTML = '';
  S = null;
  store.del(KEYS.save);
  toast(ico('cap'), skipped ? '튜토리얼을 건너뛰었어요' : '튜토리얼 완료!',
    skipped ? '메뉴 → 설정에서 언제든 다시 볼 수 있어요.' : '이제 파티를 꾸려 진짜 모험을 떠나 보자.', 2200);
  return beginPick('local', opts);
}

// 튜토리얼의 '흔들어 굴리기' 단계: 설정과 상관없이 잠깐 센서를 켠다.
// 흔들어서 굴렸으면 마음에 든 것으로 보고 설정을 켜 둔다 (설정에서 끌 수 있다)
function tutShakeOn() {
  if (!SHAKE_OK) return;
  motion.tutShook = false;
  if (typeof DeviceMotionEvent.requestPermission === 'function') DeviceMotionEvent.requestPermission().catch(() => {});   // 아이폰: 이 터치로 권한을 묻는다
  listenShake(true);
}
function tutShakeDone() {
  if (!SHAKE_OK) return;
  if (motion.tutShook && !prefs.shake) {
    prefs.shake = true;
    store.set(KEYS.prefs, prefs);
    toast(ico('die5'), '흔들어 굴리기를 켜 뒀어요', '설정에서 언제든 끌 수 있어요.', 2200);
  }
  listenShake(!!prefs.shake);
}

function coachNext() {
  const st = STEPS[tut.step];
  sfx.select();
  if (st.end) return endTutorial(false);
  tut.step++;
  if (STEPS[tut.step]?.shake) tutShakeOn();
  advanceTutorial();
  render();
  scrollToTarget();
}

// ── 진행 루프 (한 기기) ──────────────────────────────────────────────────────
async function step() {
  ui.busy = true;
  const fx = E.drainFx(S);
  if (!S.ended && !S.tutorial) store.set(KEYS.save, S);
  if (E.current(S).bot || S.ended) ui.view = null;
  ui.dice = pendingDice(fx);
  holdHp(fx);
  render();
  await playFx(fx);
  ui.busy = false;
  if (!S) return;
  if (S.ended) { render(); return showResults(); }
  const cur = E.current(S);
  render();
  if (S.phase === 'levelup' && !cur.bot) showLevelUp();
  advanceTutorial();
  if (cur.bot) botStep();
  else turnAlert();
}

// 이번 굴림에서 굴리지 않는 주사위: 고정한 것 + 마왕에게 봉인된 것.
// 봉인된 주사위는 굴리는 동안 트레이 제자리에서 반투명해지고 쇠사슬 표시는 그대로 남는다 (ui.sealRoll)
function rollMask(g = S, same = g.rolled, n = g.dice.length) {
  ui.sealRoll = same ? (g.sealed || []).slice() : [];
  return Array.from({ length: n }, (_, i) => !(same && (g.held[i] || ui.sealRoll.includes(i))));
}

async function rollAnimated(mask, list = S.fx) {
  const t = await ensureTray();
  ui.busy = true;
  ui.sheet = false;
  ui.dice = pendingDice(list);
  t.setSealed?.(ui.sealRoll || []);
  render();
  await t.roll(ui.dice || S.dice, mask, (ui.fast && E.current(S).bot ? 2.2 : 1) * (prefs.fx === 'min' ? 1.6 : prefs.fx === 'fast' ? 1.3 : 1));
  ui.sealRoll = null;
  t.setSealed?.([]);
  ui.busy = false;
}

async function botStep() {
  await wait(ui.fast ? 200 : 650);
  if (!S || S.ended || !E.current(S).bot || screen !== 'game' || online) return;
  const act = E.botAction(S, Math.random, 18);
  if (act.type === 'reroll') {
    S.held = act.hold.slice();
    tray?.setHeld(S.held);
    sfx.hold();
    await wait(ui.fast ? 150 : 500);
  }
  if (act.type === 'roll' || act.type === 'reroll') {
    const mask = rollMask();
    E.applyBot(S, act);
    await rollAnimated(mask);
    return step();
  }
  if (act.type === 'flip' || act.type === 'nudge') sfx.select();
  if (act.type === 'perk') {
    const k = E.perkInfo(act.id);
    sfx.card();
    toast(perkIco(k.id), `${E.current(S).name} · ${k.ko}`, k.desc, 1400);
  }
  E.applyBot(S, act);
  step();
}

function tryAct(fn) {
  try { fn(); return true; }
  catch (err) { toast(ico('warn'), '할 수 없어요', err.message, 1500); return false; }
}

// 한 기기에서는 바로 적용, 온라인에서는 방에 적용
async function doAct(fn) {
  if (online) return onlineAct(fn);
  if (!tryAct(() => fn(S))) return false;
  return true;
}

async function onGameAct(act, t) {
  if (act === 'skip-banner') return skipBanner();
  if (act === 'blocked') { sfx.back(); return; }
  if (act === 'coach-next') return coachNext();
  if (act === 'coach-skip') return endTutorial(true);
  if (!tutorialAllows(act, t)) { if (tut) sfx.back(); return; }
  if (act === 'fast') { ui.fast = !ui.fast; sfx.select(); return render(); }
  if (act === 'pause') { sfx.select(); return showSettings(true); }
  if (act === 'view') {
    const i = Number(t.dataset.i);
    sfx.tap();
    if (ui.sheet && (ui.view ?? S.turn) === i) { ui.sheet = false; ui.view = null; return render(); }
    ui.view = i === S.turn ? null : i;
    ui.sheet = true;
    return render();
  }
  if (act === 'emote-menu') {
    sfx.tap();
    return popover(t, `<b>반응 보내기</b><div class="emote-list">${EMOTES.map((e, i) => `<button class="pbtn small" data-act="emote" data-e="${i}">${e}</button>`).join('')}</div>`);
  }
  if (act === 'emote' && online) {
    closePopover();
    const now = Date.now();
    if (now - (ui.lastEmote || 0) < 1500) return;      // 도배 방지
    ui.lastEmote = now;
    return online.backend.emote?.(online.code, online.token, Number(t.dataset.e));
  }
  if (act === 'sheet') { sfx.select(); ui.sheet = !ui.sheet; ui.view = null; ui.tool = null; return render(); }
  if (act === 'sheet-close') { sfx.back(); ui.sheet = false; ui.view = null; ui.zeroArm = null; return render(); }
  if (act === 'log') {
    sfx.tap();
    return popover(t, `<b>${ico('scroll', 'xs')} 최근 기록</b>${S.log.slice(-8).reverse().map(l => `<p>R${l.r} · ${esc(l.text)}</p>`).join('')}`);
  }
  if (act === 'help-quest') { sfx.select(); return showQuestHelp(); }
  if (act === 'help-cats') { sfx.select(); return showCatHelp(); }
  if (act === 'info-perk') {
    const k = E.perkInfo(t.dataset.id);
    sfx.tap();
    return popover(t, `<b style="color:${rarityColor(k.rarity)}">${perkIco(k.id)} ${k.ko}</b> <small>${E.RARITY[k.rarity].ko}</small><p>${k.desc}</p>`);
  }
  if (act === 'info-skill') {
    const k = E.bossInfo(S.boss.id).skills.find(x => x.id === t.dataset.id);
    sfx.tap();
    return popover(t, `<b>${skillIco(k.id)} ${k.ko}</b><p>${esc(k.desc(S.boss.diff))}</p>`);
  }
  if (act === 'info-event') {
    const ev = E.eventInfo(E.event(S));
    sfx.tap();
    return popover(t, `<b>${eventIco(ev.id)} 이번 라운드 · ${ev.ko}</b><p>${ev.desc}</p><small>라운드마다 모두에게 적용되는 이벤트가 바뀝니다.</small>`);
  }
  if (act === 'perk') {
    if (ui.sending) return;
    const k = E.perkInfo(t.dataset.id);
    k.rarity === 3 ? sfx.legend() : sfx.start();
    layer.innerHTML = '';
    if (online) return onlineAct(g => E.pickPerk(g, t.dataset.id));
    if (tryAct(() => E.pickPerk(S, t.dataset.id))) step();
    return;
  }
  if (ui.busy || ui.sending || !myControl() || S.phase !== 'roll') {
    if (act === 'roll' && tray?.live) { stopShakeWatch(); motion.rolling = false; tray.cancelShake(); render(); }   // 흔들던 주사위가 트레이에 멈춰 남지 않게
    return;
  }
  if (act === 'roll') {
    if (!tray) {                             // 주사위가 아직 준비 안 됐으면 기다린다 (그사이 굴림 기회가 날아가지 않게)
      ui.busy = true; render();
      await ensureTray();
      ui.busy = false;
    }
    if (!tray?.live) sfx.rollPress();  // 짧은 진동 + 흔드는 소리 (흔들어 굴리기는 시작할 때 이미 냈다)
    // 흔드는 도중 버튼을 눌러도 흔들기 상태를 끝낸다 (예전엔 여기서 멈춘 채로 남아 다음 흔들기가 안 먹었다)
    stopShakeWatch();
    motion.rolling = false;
    ui.tool = null;
    ui.zeroArm = null;
    const mask = rollMask();
    if (online) return onlineAct(g => E.roll(g));
    if (!tryAct(() => E.roll(S))) { tray?.cancelShake?.(); return; }
    await rollAnimated(mask);
    step();
    return;
  }
  if (act === 'encore') {                     // 무희: 게임 중 한 번, 이번 턴 굴림 +1
    if (!(await doAct(g => E.useEncore(g)))) return;
    sfx.card(); buzz(40);
    danceFx(S.turn);
    if (!online) { E.drainFx(S); floatText('앙코르! 굴림 +1', 'gold', -20, 'tray', 'up'); render(); }
    return;
  }
  if (act === 'tool') {
    ui.tool = ui.tool === t.dataset.tool ? null : t.dataset.tool;
    ui.sheet = false;
    sfx.select();
    render();
    if (tut) scrollToTarget();
    return;
  }
  if (act === 'die') {
    if (!S.rolled) return;
    const i = Number(t.dataset.i);
    if (ui.tool === 'flip') {
      ui.tool = null;
      sfx.select();
      if (online) return onlineAct(g => E.useFlip(g, i));
      if (tryAct(() => E.useFlip(S, i))) { render(); advanceTutorial(); }
      return;
    }
    if (ui.tool === 'nudge') return;          // 조정은 주사위 위의 −1 / +1 로
    if (E.isSealed(S, i)) { sfx.back(); buzz(40); return toast(ico('chain'), '봉인된 주사위', '마왕의 봉인! 다시 굴리면 풀려요.', 1500); }
    const held = !S.held[i];
    held ? sfx.hold() : sfx.unhold();
    if (online) return onlineAct(g => E.toggleHold(g, i));
    E.toggleHold(S, i);
    tray?.setHeld(S.held);
    render();
    return advanceTutorial();
  }
  if (act === 'nudge') {
    const i = Number(t.dataset.i), d = Number(t.dataset.d);
    ui.tool = null;
    sfx.select();
    if (online) return onlineAct(g => E.useNudge(g, i, d));
    if (tryAct(() => E.useNudge(S, i, d))) { render(); advanceTutorial(); }
    else render();
    return;
  }
  if (act === 'score') {
    // 0점 칸은 한 번 더 눌러야 기록 (실수로 요트 칸을 버리지 않게)
    const row = E.preview(S).find(r => r.id === t.dataset.cat);
    if (row && row.pts === 0 && ui.zeroArm !== t.dataset.cat) { ui.zeroArm = t.dataset.cat; sfx.back(); buzz(25); return render(); }
    ui.zeroArm = null;
    ui.tool = null;
    ui.sheet = false;
    ui.view = null;
    if (online) return onlineAct(g => E.commitScore(g, t.dataset.cat));
    if (tryAct(() => E.commitScore(S, t.dataset.cat))) step();
  }
}

// 모든 버튼은 data-act 로 한곳에서 받는다
function onAct(act, t) {
  if (act === 'touch') {
    unlock(); unlocked = true; sfx.start();
    if (urlRoom) return joinRoom(urlRoom);
    if (!seen.story) return showStory(() => (seen.tutorial ? showTitle() : startTutorial()));
    return showTitle();
  }
  if (act === 'skip-splash') return showTitle();
  if (act === 'story-skip') return endStory();
  if (act === 'story-next') return storyNext();
  if (act === 'noop') return;
  if (act === 'close' || act === 'close-bg') { sfx.back(); closeSkinPreview(); layer.innerHTML = ''; return; }
  if (act === 'skins') { sfx.select(); return showSkins('dice'); }
  if (act === 'skin-tab') { sfx.tap(); return showSkins(t.dataset.tab); }
  if (act === 'skin-pick') return pickSkin(t.dataset.kind, t.dataset.id);
  if (act === 'skin-roll') return rollPreview();
  if (act === 'demon-ok') { sfx.start(); t.closest('.demon-reveal')?.remove(); if (screen === 'title') playBgm('title'); return; }
  if (act === 'buy') return buyItem(t.dataset.kind, t.dataset.id, t);
  if (act === 'settings') { sfx.select(); showSettings(false); return paintAccount(); }
  if (act === 'link-google') {
    sfx.select();
    t.disabled = true;
    return linkGoogle().then(async r => {
      if (r.switched) await Wal.reloadWallet();
      toast(ico('up'), '구글 계정을 연결했어요', r.switched ? '이 구글 계정에 있던 보석과 구매 기록으로 이어서 해요.' : '보석과 구매 기록이 이 계정에 저장돼요. 다른 기기에서도 이어서 할 수 있어요.', 2600);
      paintAccount();
    }, err => { t.disabled = false; if (err?.code !== 'auth/popup-closed-by-user') toast(ico('warn'), '연결하지 못했어요', String(err?.message || err).slice(0, 80), 2400); });
  }
  if (act === 'wipe') {
    sfx.select();
    layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
      <h2>내 데이터 지우기</h2>
      <p class="hint">이 기기에 저장된 진행 상황 · 대시보드 기록 · 설정${PROD ? '과 서버의 익명 로그인 기록' : ''}을 모두 지웁니다. 되돌릴 수 없어요.</p>
      <div class="modal-actions"><button class="pbtn" data-act="settings">취소</button><button class="pbtn danger" data-act="wipe-yes">모두 지우기</button></div>
    </div></div>`;
    return;
  }
  if (act === 'wipe-yes') {
    leaveRoom(false);
    setAnalytics(false);
    Wal.deleteWallet().catch(err => console.warn('[wipe wallet]', err)).then(() => deleteAccount()).catch(err => console.warn('[wipe]', err)).finally(() => {
      try { Object.keys(localStorage).filter(k => k.startsWith('diceheroes') || k.startsWith('dh.')).forEach(k => localStorage.removeItem(k)); } catch {}
      location.reload();
    });
    return;
  }
  if (act === 'credits') { sfx.select(); return showCredits(); }
  if (act === 'dashboard') { sfx.select(); return showDashboard(); }
  if (act === 'pref-fx') {
    prefs.fx = t.dataset.v; store.set(KEYS.prefs, prefs); sfx.select();
    t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t));
    return;
  }
  if (act === 'dash-export') {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, name: myName, profile: loadProfile() }))));
    const done = () => toast(ico('scroll'), '백업 코드를 복사했어요', '메모장 등에 붙여 넣어 보관하세요.', 1800);
    navigator.clipboard?.writeText(code).then(done, () => prompt('아래 백업 코드를 복사해 보관하세요', code)) ?? prompt('아래 백업 코드를 복사해 보관하세요', code);
    return;
  }
  if (act === 'dash-import') {
    const code = prompt('백업 코드를 붙여 넣으세요 (지금 기록은 백업 기록으로 바뀝니다)');
    if (!code) return;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (data.v !== 1 || !data.profile) throw new Error('bad');
      store.set(KEYS.profile, data.profile);
      if (data.name) { myName = data.name; store.set(KEYS.name, myName); }
      sfx.quest();
      toast(ico('up'), '기록을 복원했어요', '', 1500);
      return showDashboard();
    } catch { return toast(ico('warn'), '백업 코드가 올바르지 않아요', '처음부터 끝까지 빠짐없이 붙여 넣었는지 확인해 주세요.', 2200); }
  }
  if (act === 'rejoin') { sfx.select(); if (!navigator.onLine) return offlineToast(); store.del(KEYS.lastRoom); return joinRoom(t.dataset.code); }
  if (act === 'story') { sfx.select(); layer.innerHTML = ''; return showStory(() => showTitle()); }
  if (act === 'tutorial') { sfx.select(); layer.innerHTML = ''; return startTutorial(); }
  if (act === 'new') { sfx.select(); return beginPick('local', opts); }
  if (act === 'online') {
    sfx.select();
    if (live.maintenance) return toast(ico('warn'), '서버 점검 중이에요', '잠시 뒤에 다시 시도해 주세요. 혼자 하기는 그대로 할 수 있어요.', 2200);
    if (!navigator.onLine) return offlineToast();
    return showOnlineMenu();
  }
  if (act === 'room-create') {
    sfx.select();
    myName = (document.getElementById('my-name')?.value || myName).trim().slice(0, 10) || '모험가';
    store.set(KEYS.name, myName);
    return beginPick('create', opts);
  }
  if (act === 'room-join') { sfx.select(); return joinRoom(document.getElementById('join-code')?.value); }
  if (act === 'resume') {
    sfx.start();
    const saved = store.get(KEYS.save);
    saved.fx = [{ type: 'round', round: saved.round, event: E.event(saved) }];
    return startGame(saved);
  }
  if (act === 'home' || act === 'quit') {
    sfx.back();
    tut = null; coachEl.innerHTML = '';
    if (online) leaveRoom();
    S = null; layer.innerHTML = '';
    return showTitle();
  }
  if (act === 'again') { sfx.start(); return startGame(E.createGame(setup, undefined, opts)); }
  if (act === 'room-again' && isHost()) {
    sfx.start();
    layer.innerHTML = '';
    S = null;
    return lobbyTxn(r => { r.started = false; r.game = null; r.fxLog = []; r.seats.forEach(s => { s.ready = false; }); });
  }
  if (act === 'dash-perk') {
    const k = E.perkInfo(t.dataset.id), n = loadProfile().perks[k.id] || 0;
    sfx.tap();
    return popover(t, `<b style="color:${rarityColor(k.rarity)}">${perkIco(k.id)} ${k.ko}</b> <small>${E.RARITY[k.rarity].ko}</small><p>${k.desc}</p><small>${n ? `지금까지 ${n}번 얻음` : '아직 못 얻음'}</small>`);
  }
  if (act === 'dash-reset') {
    if (t.dataset.sure) { store.del(KEYS.profile); sfx.back(); return showDashboard(); }
    t.dataset.sure = '1'; t.textContent = '한 번 더 누르면 모든 기록을 지워요'; sfx.select(); return;
  }
  if (screen === 'setup') return onSetupAct(act, t);
  if (screen === 'lobby' && online) return onLobbyAct(act, t);
  if (screen === 'game' && S) return onGameAct(act, t);
}

// ── 뒤로가기 (Android 뒤로 버튼 · 브라우저 뒤로) ─────────────────────────────
// 앱 안에서 처리할 수 있는 동안은 방문 기록에 한 칸을 걸어 두고, 뒤로가기를 가로채 알맞게 처리한다.
// 타이틀에서 아무것도 열려 있지 않을 때만 그대로 둬서 앱이 닫히게 한다.
function armBack() { if (!history.state?.dhBack) history.pushState({ ...(history.state || {}), dhBack: 1 }, ''); }
function handleBack() {
  if (document.querySelector('.popover')) { closePopover(); return true; }
  if (layer.querySelector('[data-act=skip-banner]')) { skipBanner(); return true; }
  if (layer.querySelector('.results')) { onAct('home', {}); return true; }
  if (layer.querySelector('.lv-overlay')) return true;                 // 카드를 골라야 넘어간다
  if (layer.firstElementChild) { sfx.back(); layer.innerHTML = ''; return true; }
  if (tut) return true;
  if (screen === 'game') {
    if (ui.sheet) { ui.sheet = false; ui.view = null; render(); return true; }
    if (ui.tool) { ui.tool = null; render(); return true; }
    sfx.select(); showSettings(true); return true;                     // 게임 중엔 일시정지 메뉴
  }
  if (screen === 'lobby') { onAct('room-leave', {}); return true; }
  if (screen === 'story') { endStory(); return true; }
  if (screen === 'setup') { pickBack(); return true; }
  if (['online', 'dashboard'].includes(screen)) { sfx.back(); showTitle(); return true; }
  return false;
}
addEventListener('popstate', () => {
  if (handleBack()) armBack();
  else if (screen === 'title' && history.state?.dhBack) history.back();
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (unlocked) unlock();
  onAct(t.dataset.act, t);
  if (screen !== 'title' || layer.firstElementChild) armBack();
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'set-bgm') setAudio({ bgm: Number(e.target.value) });
  if (id === 'set-sfx') { setAudio({ sfx: Number(e.target.value) }); sfx.tap(); }
  if (id === 'set-vib') { setAudio({ vibrate: e.target.checked }); buzz(80); }   // 켜면 바로 한 번 떨어서 확인
  if (id === 'set-shake') setShake(e.target.checked, e.target);
  if (id === 'set-stats') { prefs.analytics = e.target.checked; store.set(KEYS.prefs, prefs); setAnalytics(prefs.analytics); }
  if (id === 'set-big' || id === 'set-ca' || id === 'set-low') {
    if (id === 'set-big') prefs.bigText = e.target.checked;
    if (id === 'set-ca') prefs.colorAssist = e.target.checked;
    if (id === 'set-low') {
      prefs.lowGfx = e.target.checked;
      // 3D 트레이를 새 설정으로 다시 만든다
      if (tray) { tray.running = false; tray.renderer?.domElement.remove(); tray.renderer?.dispose?.(); tray.el?.remove(); tray = null; }
      document.querySelectorAll('#tray canvas, #tray .tray2d').forEach(el => el.remove());
      if (screen === 'game') render();
    }
    store.set(KEYS.prefs, prefs);
    applyPrefs();
    if (screen === 'game' && id !== 'set-low') render();
  }
  if (id === 'dash-name') {
    myName = e.target.value.trim().slice(0, 10) || '모험가';
    store.set(KEYS.name, myName);
    const h = setup.find(p => !p.bot);
    if (h) { h.name = myName; store.set(KEYS.setup, setup); }
  }
  const i = e.target.dataset?.name;
  if (i !== undefined) onNameInput(Number(i), e.target.value);
});
addEventListener('resize', () => { updateCoach(); closePopover(); });
addEventListener('scroll', () => { updateCoach(); closePopover(); }, { passive: true });

// 설치형 앱(PWA)으로 쓸 때 오프라인 캐시
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !location.hostname.endsWith('claude.ai')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  // 예전(캐시 우선) 서비스 워커가 새 것으로 바뀌면 한 번 새로고침해서 최신 파일로 연다
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || screen === 'game' || screen === 'lobby') return;
    reloaded = true;
    location.reload();
  });
}

// ?demo 봇 대결, ?skip 타이틀로 바로, ?demon 마왕 바로 열기 (화면 점검용)
const q = new URLSearchParams(location.search);
if (q.has('demo')) {
  unlocked = true;
  const mode = q.get('demo') === 'coop' ? { mode: 'coop', boss: q.get('boss') || 'dragon', diff: 1 } : {};
  startGame(E.createGame([{ name: '고블린 봇', cls: 'rogue', bot: true }, { name: '슬라임 봇', cls: 'mage', bot: true }], undefined, mode));
} else if (q.has('skip') || urlRoom || DEMON_TEST) {
  showTitle();
  if (DEMON_TEST) { store.set('diceheroes.demonSeen', 0); setTimeout(showDemonUnlock, 600); }
} else {
  showSplash();
}

// ?debug 로 열면 자동 점검 스크립트가 상태와 주사위 위치를 읽을 수 있다
if (q.has('debug')) window.__dh = { get S() { return S; }, get tray() { return tray; }, get tut() { return tut; }, get online() { return online; }, get ui() { return ui; }, get skinPreview() { return skinPreview; }, claimGems: i => claimGems(i), gemsBox: () => gemsBox() };
