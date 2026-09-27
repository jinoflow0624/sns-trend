// 화면 흐름: 스플래시 → 타이틀(터치) → [첫 실행: 스토리 → 튜토리얼] → 메뉴
//   메뉴 → 파티 편성(대전/협동) → 게임 → 결과
//   메뉴 → 온라인 방(만들기/참가) → 로비 → 게임 → 결과
// 룰은 engine.js, 온라인은 net.js, 3D 주사위는 dice3d.js, 소리는 audio.js, 도트 그림은 pixel.js · scenes.js.
import * as E from './engine.js';
import { GAME } from './config.js';
import { spriteURL } from './pixel.js';
import { titleScene, storyScene, STORY } from './scenes.js';
import { sfx, playBgm, stopBgm, unlock, audioSettings, setAudio, buzz } from './audio.js';
import { STEPS, createTutorialGame } from './tutorial.js';
import * as Net from './net.js';

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const coachEl = document.getElementById('coach');
document.title = GAME.name;

const KEYS = { save: 'diceheroes.game', setup: 'diceheroes.setup', opts: 'diceheroes.opts', seen: 'diceheroes.seen', name: 'diceheroes.name' };
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};
const seen = store.get(KEYS.seen) || {};
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
const ui = { view: null, tool: null, busy: false, fast: false };
const urlRoom = Net.normalizeCode(new URLSearchParams(location.search).get('room'));

// ── 도우미 ───────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const br = s => esc(s).replace(/\n/g, '<br>');
const portrait = (id, cl = '') => `<img class="spr ${cl}" src="${spriteURL(id, 4)}" alt="">`;
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
  stage?.stop();
  stage = next;
}
function saveOpts() { store.set(KEYS.opts, opts); }

// ── 스플래시 ─────────────────────────────────────────────────────────────────
function showSplash() {
  screen = 'splash';
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
  layer.innerHTML = '';
  const saved = store.get(KEYS.save);
  const canResume = saved && !saved.ended && !saved.tutorial && saved.v === 1;
  app.innerHTML = `
  <div class="screen title-screen">
    <canvas class="scene" aria-hidden="true"></canvas>
    <div class="title-ui">
      <div class="logo">
        <span class="logo-sub">운명의 주사위 RPG</span>
        <h1 class="logo-main">${esc(GAME.name)}</h1>
        <span class="logo-en">${esc(GAME.en)}</span>
      </div>
      ${unlocked ? `
      <nav class="menu">
        ${canResume ? `<button class="pbtn gold" data-act="resume">이어하기 <small>${saved.round}라운드</small></button>` : ''}
        <button class="pbtn ${canResume ? '' : 'gold'}" data-act="new">혼자 · 한 기기로</button>
        <button class="pbtn" data-act="online">온라인 방 <small>친구 초대</small></button>
        <div class="menu-row">
          <button class="pbtn small" data-act="tutorial">튜토리얼</button>
          <button class="pbtn small" data-act="settings">설정</button>
          <button class="pbtn small" data-act="credits">크레딧</button>
        </div>
      </nav>` : `<button class="touch" data-act="touch">화면을 터치하세요</button>`}
      <footer class="ver">v${GAME.version} · © ${GAME.year} ${esc(GAME.studio)}</footer>
    </div>
  </div>`;
  setStage(titleScene(app.querySelector('.scene')));
  if (unlocked) playBgm('title');
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

// ── 모드 · 보스 선택 (편성 화면과 온라인 로비가 함께 쓴다) ────────────────────
function modePicker(o, editable) {
  const dis = editable ? '' : 'disabled';
  return `
  <section class="frame mode-box">
    <div class="tabs">
      <button class="tab${o.mode === 'versus' ? ' on' : ''}" data-act="mode" data-v="versus" ${dis}>⚔️ 대전<small>최고 점수 경쟁</small></button>
      <button class="tab${o.mode === 'coop' ? ' on' : ''}" data-act="mode" data-v="coop" ${dis}>🛡️ 협동<small>다 함께 보스 토벌</small></button>
    </div>
    ${o.mode === 'coop' ? `
    <div class="bosses">
      ${E.BOSSES.map(b => `
        <button class="boss-pick${o.boss === b.id ? ' on' : ''}" style="--c:${b.color}" data-act="boss" data-v="${b.id}" ${dis}>
          ${portrait(b.id, 'bp')}<b>${b.ko}</b><small>${b.title}</small>
        </button>`).join('')}
    </div>
    <div class="diffs">
      ${E.DIFFS.map(d => `<button class="diff${o.diff === d.id ? ' on' : ''}" style="--c:${d.color}" data-act="diff" data-v="${d.id}" ${dis}>${d.ko}</button>`).join('')}
    </div>
    <ul class="skills">
      ${E.bossInfo(o.boss).skills.map(k => `<li><span>${k.icon}</span><div><b>${k.ko}</b><small>${esc(k.desc(o.diff))}</small></div></li>`).join('')}
    </ul>
    <p class="hint">점수를 적으면 그만큼 보스에게 피해. 의뢰로 모은 뒤집기·조정으로 큰 족보를 노리세요. 12라운드 안에 쓰러뜨리면 승리.</p>` :
    '<p class="hint">12라운드 동안 점수표를 채우고 의뢰·레벨업으로 성장해 최종 점수가 가장 높은 영웅이 승리.</p>'}
  </section>`;
}
function onModeAct(act, t, o) {
  if (act === 'mode') o.mode = t.dataset.v;
  if (act === 'boss') o.boss = t.dataset.v;
  if (act === 'diff') o.diff = Number(t.dataset.v);
  sfx.select();
}

// ── 파티 편성 (한 기기) ──────────────────────────────────────────────────────
function showSetup() {
  screen = 'setup';
  setStage(null);
  layer.innerHTML = '';
  playBgm('title');
  app.innerHTML = `
  <div class="screen page">
    <header class="page-head">
      <button class="icon-btn" data-act="home" aria-label="뒤로">◀</button>
      <h2>파티 편성</h2>
      <span class="count">${setup.length} / 4</span>
    </header>
    <div class="wrap">
      ${modePicker(opts, true)}
      ${setup.map((pl, i) => seatCard(pl, i, { editable: true, removable: setup.length > 1, humanToggle: true })).join('')}
      <button class="pbtn small" data-act="add" ${setup.length >= 4 ? 'disabled' : ''}>＋ ${opts.mode === 'coop' ? '동료' : '상대'} 추가</button>
      <p class="hint">사람이 여럿이면 한 기기를 돌려 가며 합니다. 각자 기기로 하려면 메뉴의 <b>온라인 방</b>을 쓰세요.</p>
      <button class="pbtn gold big" data-act="start">${opts.mode === 'coop' ? '토벌 출발' : '모험 출발'}</button>
    </div>
  </div>`;
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
      ${E.CLASSES.map(k => `
        <button class="cls${pl.cls === k.id ? ' on' : ''}" style="--c:${k.color}" data-act="cls" data-i="${i}" data-cls="${k.id}">
          ${portrait(k.id, 'mini')}<span>${k.ko}</span>
        </button>`).join('')}
    </div>` : ''}
    <p class="cls-desc"><b style="color:${c.color}">${c.ko}</b> ${c.desc}</p>
  </section>`;
}

function onSetupAct(act, t) {
  const i = Number(t.dataset.i);
  if (['mode', 'boss', 'diff'].includes(act)) { onModeAct(act, t, opts); saveOpts(); return showSetup(); }
  if (act === 'human') setup[i].bot = false;
  if (act === 'bot') { setup[i].bot = true; if (setup[i].name === '나') setup[i].name = BOT_NAMES[i % 4]; }
  if (act === 'cls') setup[i].cls = t.dataset.cls;
  if (act === 'remove') setup.splice(i, 1);
  if (act === 'add' && setup.length < 4) {
    const used = new Set(setup.map(p => p.cls));
    setup.push({ name: BOT_NAMES.find(n => !setup.some(p => p.name === n)) || '동료', cls: E.CLASSES.find(c => !used.has(c.id))?.id || 'mage', bot: true });
  }
  if (act === 'start') {
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
    seats: [{ token, name: myName, cls: setup[0]?.cls || 'warrior', bot: false }],
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
  const res = await backend.txn(code, (room, fail) => {
    if (room.seats.some(s => s.token === token)) return room;          // 재접속
    if (room.started) return fail('이미 시작한 방입니다.');
    if (room.seats.length >= 4) return fail('방이 가득 찼습니다 (최대 4명).');
    const used = new Set(room.seats.map(s => s.cls));
    room.seats.push({ token, name: myName, cls: E.CLASSES.find(c => !used.has(c.id))?.id || 'mage', bot: false });
    return room;
  });
  if (!res.ok) return showOnlineMenu(res.failure);
  enterRoom(backend, code);
}

function enterRoom(backend, code) {
  leaveRoom(false);
  const token = Net.myToken();
  online = { code, token, backend, room: null, fxSeen: -1, queue: Promise.resolve(), beat: null, unwatch: null, prev: null };
  online.unwatch = backend.watch(code, room => {
    online.queue = online.queue.then(() => onRoom(room)).catch(err => console.error(err));
  });
  const beat = () => backend.touch(code, token);
  beat();
  online.beat = setInterval(beat, Net.SEEN_MS);
  history.replaceState(null, '', Net.inviteLink(code));
}

function leaveRoom(goHome = true) {
  if (online) {
    online.unwatch?.();
    clearInterval(online.beat);
    const { backend, code, token, room } = online;
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
const alive = token => !!online?.room?.seen?.[token] && Date.now() - online.room.seen[token] < Net.ABSENT_MS;

function showLobby() {
  screen = 'lobby';
  const room = online.room;
  const host = isHost();
  const link = Net.inviteLink(online.code);
  const humans = room.seats.filter(s => !s.bot).length;
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
      ${modePicker(room.opts, host)}
      ${!host ? '<p class="hint">모드와 보스는 방장이 정합니다.</p>' : ''}
      ${room.seats.map((s, i) => {
        const me = s.token === online.token;
        const tag = s.bot ? '봇' : `${s.token === room.host ? '👑 방장 · ' : ''}${me ? '나' : alive(s.token) ? '접속 중' : '연결 끊김'}`;
        return seatCard(s, i, { editable: me, removable: host && !me, humanToggle: false, tag });
      }).join('')}
      ${host ? `<button class="pbtn small" data-act="lobby-bot" ${room.seats.length >= 4 ? 'disabled' : ''}>＋ 봇 추가</button>` : ''}
      ${host ? `<button class="pbtn gold big" data-act="lobby-start" ${room.seats.length < 2 && humans < 2 && room.opts.mode === 'versus' ? 'disabled' : ''}>게임 시작</button>`
             : '<p class="waiting">방장이 시작하기를 기다리는 중…</p>'}
    </div>
  </div>`;
}

function lobbyTxn(fn) {
  return online.backend.txn(online.code, (room, fail) => { fn(room, fail); return room; })
    .then(res => { if (!res.ok) toast('⚠️', '할 수 없어요', res.failure); });
}

function onLobbyAct(act, t) {
  const room = online.room;
  if (['mode', 'boss', 'diff'].includes(act)) {
    if (!isHost()) return;
    const o = { ...room.opts };
    onModeAct(act, t, o);
    opts = { ...o }; saveOpts();
    return lobbyTxn(r => { r.opts = o; });
  }
  if (act === 'cls') {
    sfx.select();
    const i = Number(t.dataset.i);
    return lobbyTxn(r => { if (r.seats[i]?.token === online.token) r.seats[i].cls = t.dataset.cls; });
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
    const done = () => toast('🔗', '초대 링크를 복사했어요', '메신저로 친구에게 보내 주세요.', 1600);
    navigator.clipboard?.writeText(text).then(done, () => { el.select(); toast('🔗', '링크를 선택했어요', '길게 눌러 복사해 주세요.', 1800); })
      ?? (el.select(), done());
    return;
  }
  if (act === 'lobby-start' && isHost()) {
    sfx.start();
    return lobbyTxn((r, fail) => {
      if (r.started) return;
      if (r.seats.length < 1) return fail('참가자가 없습니다.');
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
    toast('🚪', '방이 닫혔습니다', '처음 화면으로 돌아갑니다.');
    leaveRoom(); S = null;
    return showTitle();
  }
  online.room = room;
  if (!room.started) {
    if (screen === 'game') { S = null; layer.innerHTML = ''; playBgm('title'); }
    if (!room.seats.some(s => s.token === online.token)) {
      toast('🚪', '방에서 나왔습니다', '');
      leaveRoom(); return showTitle();
    }
    if (screen !== 'lobby' || !document.activeElement?.matches?.('input')) showLobby();
    return;
  }
  const prev = S && screen === 'game' ? S : null;
  const g = room.game;
  if (!prev) {
    S = g;
    Object.assign(ui, { view: null, tool: null, busy: false });
    screen = 'game';
    setStage(null);
    layer.innerHTML = '';
    playBgm('adventure');
    online.fxSeen = room.fxId - 1;
  } else {
    S = g;
  }
  // 누군가 굴렸으면 3D 주사위를 굴린다
  const rolledNow = prev && g.rolled && (prev.turn !== g.turn || prev.round !== g.round || g.rollsLeft < prev.rollsLeft);
  const newFx = room.fxLog.filter(f => f.id > online.fxSeen);
  online.fxSeen = room.fxId;
  if (rolledNow) {
    const sameTurn = prev.turn === g.turn && prev.round === g.round && prev.rolled;
    const mask = g.dice.map((_, i) => !(sameTurn && prev.held[i]));
    await rollAnimated(mask);
  }
  ui.busy = true;
  render();
  for (const f of newFx) await playFx(f.list);
  ui.busy = false;
  render();
  if (S.ended) return showResults();
  const cur = E.current(S);
  if (S.phase === 'levelup' && cur.token === online.token) showLevelUp();
  else if (layer.querySelector('.lv-overlay')) layer.innerHTML = '';
  maybeRunBot();
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
function onlineAct(fn, { any = false } = {}) {
  return online.backend.txn(online.code, (room, fail) => {
    const g = room.game;
    if (!g || g.ended) return fail('게임이 끝났습니다.');
    if (!any && E.current(g).token !== online.token) return fail('내 차례가 아닙니다.');
    try { fn(g); } catch (err) { return fail(err.message); }
    const list = E.drainFx(g);
    if (list.length) {
      room.fxId = (room.fxId || 0) + 1;
      room.fxLog = [...(room.fxLog || []), { id: room.fxId, list }].slice(-8);
    }
    return room;
  }).then(res => { if (!res.ok) toast('⚠️', '할 수 없어요', res.failure, 1500); return res.ok; });
}

// ── 게임 화면 ────────────────────────────────────────────────────────────────
function startGame(state) {
  S = state;
  Object.assign(ui, { view: null, tool: null, busy: false });
  screen = 'game';
  setStage(null);
  layer.innerHTML = '';
  playBgm('adventure');
  step();
}

async function ensureTray() {
  if (tray) return tray;
  const { DiceTray } = await import('./dice3d.js');
  tray = new DiceTray(document.getElementById('tray'), {
    onPick: i => onAct('die', { dataset: { i: String(i) } }),
    onHit: v => sfx.clack(v),
  });
  return tray;
}

// 지금 이 기기가 조작할 차례인가
function myControl() {
  if (!S || S.ended) return false;
  const cur = E.current(S);
  if (online) return cur.token === online.token;
  return !cur.bot;
}

function render() {
  if (screen !== 'game' || !S) return;
  const cur = E.current(S);
  const viewIdx = ui.view ?? S.turn;
  const vp = S.players[viewIdx];
  const ev = E.eventInfo(E.event(S));
  const mine = myControl();
  const myTurn = mine && S.phase === 'roll' && !ui.busy;
  const prev = S.rolled && !ui.busy ? E.preview(S) : null;
  const okQuests = S.rolled && !ui.busy ? E.claimableQuests(S) : [];
  const best = prev ? prev.filter(r => !r.taken).sort((a, b) => b.pts - a.pts)[0]?.id : null;
  const need = E.xpToNext(cur.level);
  const xpPct = cur.level >= E.MAX_LEVEL ? 100 : Math.min(100, (cur.xp / need) * 100);
  const canRoll = myTurn && S.rollsLeft > 0 && !(S.rolled && S.held.every(Boolean));
  const coop = S.mode === 'coop';
  const absent = online && !cur.bot && !mine && !alive(cur.token);

  app.innerHTML = `
  <div class="screen game${mine ? ' my-turn' : ' other-turn'}">
    <header class="hud">
      <button class="icon-btn" data-act="pause" aria-label="메뉴">☰</button>
      <div class="round-chip"><small>ROUND</small><b>${S.round}<i>/${E.ROUNDS}</i></b></div>
      <button class="event-chip" data-act="info-event"><span class="ev-ic">${ev.icon}</span><div><b>${ev.ko}</b><small>${ev.desc}</small></div></button>
      <button class="icon-btn${ui.fast ? ' on' : ''}" data-act="fast" aria-label="봇 빨리 감기">⏩</button>
    </header>

    ${coop ? bossPanel() : ''}

    <div class="party" style="--n:${S.players.length}">
      ${S.players.map((p, i) => `
        <button class="member${i === S.turn ? ' turn' : ''}${i === viewIdx ? ' viewing' : ''}" data-act="view" data-i="${i}" style="--c:${E.classInfo(p.cls).color}">
          <div class="m-por">${portrait(p.cls)}<span class="lv">${p.level}</span></div>
          <div class="m-info"><span class="name">${esc(p.name)}${online && p.token === online.token ? ' (나)' : ''}</span>
            <b class="pts">${coop ? `⚔${Math.round(S.boss.dmg[i] || 0)}` : E.finalScore(p)}</b></div>
          ${online && !p.bot && !alive(p.token) ? '<span class="off">끊김</span>' : ''}
        </button>`).join('')}
    </div>

    <section class="board" id="quests">
      <div class="board-head">
        <b>📜 의뢰 게시판</b>
        <button class="help-link" data-act="help-quest">의뢰 보상이란?</button>
      </div>
      <div class="quests">
        ${S.board.map(qid => {
          const q = E.questInfo(qid);
          return `<div class="quest${okQuests.includes(qid) ? ' ok' : ''}">
            <span class="pin"></span>
            <span class="q-ic">${q.icon}</span>
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
      <div id="tray" class="tray${ui.tool ? ' tooling' : ''}"><div class="dice-ovl" id="dice-ovl"></div></div>
    </section>

    <section class="controls">
      <button class="pbtn gold roll" data-act="roll" ${canRoll ? '' : 'disabled'}>
        <span>${S.rolled ? '다시 굴리기' : '굴리기'}</span><small class="left-n">남은 횟수 ${S.rollsLeft}</small>
      </button>
      <button class="pbtn tool${ui.tool === 'flip' ? ' on' : ''}" data-act="tool" data-tool="flip" ${myTurn && S.rolled && cur.flip > 0 ? '' : 'disabled'}>
        <span>🔄</span>${ui.tool === 'flip' ? '사용 중' : '뒤집기'}<b>${cur.flip}</b></button>
      <button class="pbtn tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="tool" data-tool="nudge" ${myTurn && S.rolled && cur.nudge > 0 ? '' : 'disabled'}>
        <span>🎯</span>${ui.tool === 'nudge' ? '사용 중' : '조정'}<b>${cur.nudge}</b></button>
    </section>
    <div class="tip">${absent ? `<span>${esc(cur.name)} 님이 접속 중이 아닙니다</span><button class="pbtn small" data-act="takeover">대신 진행</button>` : tip(cur, myTurn, okQuests)}</div>

    <section class="frame hero" style="--c:${E.classInfo(cur.cls).color}">
      <div class="h-por">${portrait(cur.cls)}</div>
      <div class="h-main">
        <div class="h-name"><b>${esc(cur.name)}</b><span>${E.classInfo(cur.cls).ko}</span><span class="lvl">Lv.${cur.level}</span></div>
        <div class="xpbar" style="--w:${xpPct}%"><i></i><em>${cur.level >= E.MAX_LEVEL ? 'MAX' : `EXP ${cur.xp} / ${need}`}</em></div>
        <div class="perks">
          ${Object.keys(cur.perks).length ? Object.entries(cur.perks).map(([id, n]) => {
            const k = E.perkInfo(id);
            return `<button class="perk-chip" style="--rc:${rarityColor(k.rarity)}" data-act="info-perk" data-id="${id}">${k.icon}${k.ko}${n > 1 ? `<b>×${n}</b>` : ''}</button>`;
          }).join('') : '<span class="dim">레벨업하면 특성 카드를 고른다 · 칩을 누르면 효과 보기</span>'}
        </div>
      </div>
    </section>

    ${sheet(vp, viewIdx, prev, best, myTurn && viewIdx === S.turn)}

    <section class="frame log">
      ${S.log.slice(-4).map(l => `<div>R${l.r} · ${esc(l.text)}</div>`).join('') || '<div>모험이 시작됐다.</div>'}
    </section>
  </div>`;

  ensureTray().then(t => {
    t.attach(document.getElementById('tray'));
    t.show(S.dice, S.rolled ? S.held : []);
    t.setTarget(!!ui.tool && myTurn);
    requestAnimationFrame(() => diceOverlay(myTurn));
  });
  updateCoach();
}

// 뒤집기: 각 주사위 위에 뒤집으면 나올 눈 / 조정: 각 주사위 위에 −1 · +1
function diceOverlay(myTurn) {
  const ovl = document.getElementById('dice-ovl');
  if (!ovl || !tray || !S) return;
  if (!ui.tool || !myTurn || !S.rolled || tray.anim) { ovl.innerHTML = ''; return; }
  const box = document.getElementById('tray').getBoundingClientRect();
  ovl.innerHTML = S.dice.map((v, i) => {
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
  const hpPct = (b.hp / b.maxHp) * 100;
  const shPct = Math.min(100 - hpPct, (b.shield / b.maxHp) * 100);
  const rage = b.diff === 2 && b.hp * 2 < b.maxHp;
  return `
  <section class="boss-panel${rage ? ' rage' : ''}${b.hp <= 0 ? ' dead' : ''}" style="--c:${info.color}">
    <div class="boss-art" id="boss-art">${portrait(b.id, 'boss')}<div class="aura"></div></div>
    <div class="boss-main">
      <div class="boss-name"><b>${info.ko}</b><span class="diff-chip" style="--c:${d.color}">${d.ko}</span></div>
      <div class="hp"><i style="width:${hpPct}%"></i><s style="left:${hpPct}%;width:${shPct}%"></s>
        <em>HP ${b.hp} / ${b.maxHp}${b.shield ? ` · 🛡${b.shield}` : ''}</em></div>
      <div class="boss-skills">
        ${info.skills.filter(k => k.id !== 'rage' || b.diff === 2).map(k => `<button class="skill-chip" data-act="info-skill" data-id="${k.id}">${k.icon}${k.ko}</button>`).join('')}
        ${rage ? '<span class="rage-tag">분노!</span>' : ''}
      </div>
    </div>
  </section>`;
}

function tip(cur, myTurn, okQuests) {
  if (S.ended) return '';
  if (!myControl()) return `${esc(cur.name)}의 차례…${online && cur.bot ? ' (봇)' : ''}`;
  if (!myTurn) return '';
  if (ui.tool === 'flip') return '<b class="tool-txt">🔄 뒤집을 주사위를 누르세요</b> · 주사위 위에 뒤집힌 눈이 보여요';
  if (ui.tool === 'nudge') return '<b class="tool-txt">🎯 주사위 위의 −1 / +1 을 누르세요</b>';
  if (!S.rolled) return '굴리기를 눌러 턴을 시작하세요';
  if (okQuests.length) return `<b class="ok-txt">의뢰 「${okQuests.map(q => esc(E.questInfo(q).ko)).join('」「')}」 달성 가능!</b>`;
  return S.rollsLeft ? '주사위를 눌러 잡고 다시 굴리거나, 점수표에 기록하세요' : '점수표에서 기록할 칸을 고르세요';
}

function sheet(p, idx, prev, best, canPick) {
  const pv = id => prev?.find(r => r.id === id);
  const row = c => {
    const done = p.scores[c.id] !== null;
    const r = canPick && !done ? pv(c.id) : null;
    const cls = done ? 'done' : r ? `pick${r.pts === 0 ? ' zero' : ' can'}${c.id === best && r.pts > 0 ? ' best' : ''}` : '';
    const val = done ? p.scores[c.id] : r ? `${r.pts}<small>+${r.xp}xp</small>` : '–';
    // 보너스가 붙으면 규칙 설명 대신 어디서 몇 점 붙었는지 보여 준다
    const sub = r?.bonus?.length && r.pts > 0
      ? `<small class="bonus-src">${r.bonus.map(b => `${esc(b.ko)} +${b.amt}`).join(' · ')}</small>`
      : `<small>${CAT_HELP[c.id].rule}</small>`;
    return `<button class="row ${cls}" data-act="score" data-cat="${c.id}" ${r ? '' : 'disabled'}>
      <span class="nm">${c.ko}${sub}</span><span class="v">${val}</span>
      ${c.id === best && r?.pts > 0 ? '<span class="best-tag">최고</span>' : ''}</button>`;
  };
  const up = E.upperSum(p), need = E.upperNeed(p), got = up >= need;
  const b = E.breakdown(p);
  return `
  <section class="frame sheet-wrap">
    <div class="sheet-head"><h3>점수표</h3><span>${esc(p.name)}${idx !== S.turn ? ' · 보는 중' : ''}</span>
      <button class="help-link" data-act="help-cats">족보 보기</button></div>
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
function popover(anchor, html) {
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
  setTimeout(() => document.addEventListener('click', closePopover, { once: true }), 0);
}
function closePopover() { document.querySelectorAll('.popover').forEach(p => p.remove()); }

// 의뢰 보상 아이콘: 🔄 뒤집기 · 🎯 조정
const rewardIcons = r => [r.flip ? `🔄${r.flip}` : '', r.nudge ? `🎯${r.nudge}` : ''].filter(Boolean).join(' ');

function showQuestHelp() {
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>📜 의뢰 보상</h2>
    <p class="big-note">의뢰를 깨면 <b>🔄 뒤집기</b>와 <b>🎯 조정</b> 충전을 받아요.<br>다음 턴부터 주사위를 원하는 눈으로 바꿔 큰 족보를 노릴 수 있어요.</p>
    <ul class="list">
      <li><b>쉬운 의뢰</b> 🎯 조정 1 (예: 두 쌍, 합계 25↑)</li>
      <li><b>보통 의뢰</b> 🔄 뒤집기 1 (예: 모두 짝수, 풀하우스)</li>
      <li><b>어려운 의뢰</b> 🔄 1 + 🎯 1 (예: 연속 5개, 같은 눈 4개)</li>
      <li><b>전설 의뢰</b> 🔄 2 + 🎯 2 (요트)</li>
      <li><b>🔄 뒤집기</b> 주사위를 반대 면으로 (1↔6, 2↔5, 3↔4)</li>
      <li><b>🎯 조정</b> 주사위 눈을 ±1</li>
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
function floatText(text, cls, offset = 0, anchor = 'tray') {
  const el = document.createElement('div');
  el.className = `float ${cls}`;
  const r = document.getElementById(anchor)?.getBoundingClientRect();
  el.style.top = `${Math.max(90, (r ? r.top + r.height * 0.35 : innerHeight / 2) + offset)}px`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
async function toast(icon, title, text, ms = 1900, img = '') {
  const el = document.createElement('div');
  el.className = 'toast';
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
    <div class="rn">ROUND ${round}</div><div class="ev">${ev.icon}</div><b>${ev.ko}</b><span>${ev.desc}</span></div></div>`;
  sfx.round();
  await Promise.race([wait(ui.fast ? 700 : 1500), new Promise(r => (skipBanner = r))]);
  layer.innerHTML = '';
}
async function bossBanner() {
  const b = E.bossInfo(S.boss.id), d = E.DIFFS[S.boss.diff];
  layer.innerHTML = `<div class="overlay boss-intro" data-act="skip-banner" style="--c:${b.color}"><div class="banner">
    ${portrait(b.id, 'boss-big')}<div class="warn">WARNING</div><b>${b.ko}</b><span>${b.title} · ${d.ko}</span></div></div>`;
  sfx.levelup();
  await Promise.race([wait(2200), new Promise(r => (skipBanner = r))]);
  layer.innerHTML = '';
}
function hitBoss(amount, blocked) {
  const art = document.getElementById('boss-art');
  if (!art) return;
  art.classList.remove('hit'); void art.offsetWidth; art.classList.add('hit');
  floatText(blocked && !amount ? `🛡${blocked}` : `-${amount - (blocked || 0)}${blocked ? ` 🛡${blocked}` : ''}`, 'dmg', 10, 'boss-art');
}

const BOSS_LINES = {
  breath: '화염 숨결! 가장 높은 주사위가 1로 타 버렸다',
  twist: '운명 비틀기! 주사위가 뒤집혔다',
  drums: '전쟁의 북! 이번 라운드 굴림 기회 -1',
  plunder: '약탈! 0점을 틈타 체력을 회복했다',
  bone: '뼈 방패! 보호막을 둘렀다',
};

async function playFx(list) {
  for (const f of list) {
    const p = S.players[f.player];
    switch (f.type) {
      case 'round':
        if (S.boss && f.round === 1) await bossBanner();
        if (!S.tutorial || f.round > 1) await banner(f.round, f.event);
        break;
      case 'score':
        if (f.pts > 0) {
          sfx.score();
          floatText(`${E.catInfo(f.cat).ko} +${f.pts}`, 'gold');
          if (f.bonus?.length) floatText(f.bonus.map(b => `${b.ko} +${b.amt}`).join(' · '), 'mint', 30);
        }
        else { sfx.zero(); floatText(`${E.catInfo(f.cat).ko} 0`, 'dim'); }
        await wait(380);
        break;
      case 'damage':
        sfx.clack(12); buzz(30);
        render(); hitBoss(f.amount, f.blocked);
        await wait(420);
        break;
      case 'boss': {
        const b = E.bossInfo(S.boss.id);
        sfx.zero();
        await toast('', `${b.ko}`, BOSS_LINES[f.skill] + (f.amount ? ` (${f.amount})` : ''), 1900, portrait(b.id, 't-boss'));
        break;
      }
      case 'quest':
        sfx.quest();
        await toast(E.questInfo(f.quest).icon, `의뢰 완료! 「${E.questInfo(f.quest).ko}」`, `${p.name} · ${E.chargeText(f.reward)} · 경험치 +${f.xp}`);
        break;
      case 'xp': sfx.coin(); floatText(`+${f.amount} EXP`, 'mint', 38); await wait(320); break;
      case 'levelup':
        sfx.levelup();
        if (!(online ? p.token === online.token : !p.bot)) await toast('🆙', `${p.name} 레벨 ${f.level}!`, '특성 카드를 고르는 중…', 1300);
        break;
      case 'midas': floatText('👑 황금손 조정 +1', 'gold', -30); break;
      case 'duel': sfx.quest(); await toast('🏆', '결투 대회 우승!', `${p.name} · 뒤집기 +1 · 조정 +1`); break;
      case 'charge': if (f.why !== 'quest') floatText(E.chargeText(f), 'mint', -20); break;
    }
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
          <span class="rar">${E.RARITY[k.rarity].ko}</span><span class="c-ic">${k.icon}</span><b>${k.ko}</b><p>${k.desc}</p>
          ${have && !k.instant ? `<em>보유 ${have} → ${have + 1}</em>` : ''}${k.instant ? '<em>즉시 받음</em>' : ''}</button>`;
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
  sfx.win();
  setTimeout(() => playBgm('victory'), 1500);
  if (!online) store.del(KEYS.save);
  if (S.mode === 'coop') return showCoopResults();
  const rank = E.ranking(S);
  const medals = ['1ST', '2ND', '3RD', '4TH'];
  layer.innerHTML = `<div class="overlay solid"><div class="results">
    <h1>모험 종료</h1>
    <div class="winner">${portrait(rank[0].p.cls, 'big')}<b>${esc(rank[0].p.name)} 승리!</b></div>
    ${rank.map((r, k) => {
      const b = E.breakdown(r.p);
      return `<div class="frame rank${k === 0 ? ' first' : ''}">
        <span class="medal m${k}">${medals[k]}</span>${portrait(r.p.cls)}
        <div class="who"><b>${esc(r.p.name)} <small>Lv.${r.p.level}</small></b>
          <span>점수표 ${b.card}${b.bonus ? '+35' : ''} · 레벨 +${b.level} · 의뢰 ${r.p.questsDone.length}</span></div>
        <span class="tot">${r.total}</span></div>`;
    }).join('')}
    ${resultActions()}
  </div></div>`;
}
function showCoopResults() {
  const b = S.boss, info = E.bossInfo(b.id), grade = E.coopGrade(S);
  const order = S.players.map((p, i) => ({ p, i, dmg: Math.round(b.dmg[i] || 0) })).sort((x, y) => y.dmg - x.dmg);
  layer.innerHTML = `<div class="overlay solid"><div class="results coop-res">
    <h1>${b.won ? '토벌 성공!' : '토벌 실패…'}</h1>
    <div class="boss-result${b.won ? ' down' : ''}" style="--c:${info.color}">${portrait(b.id, 'boss-big')}</div>
    <div class="grade g${grade}">${grade}</div>
    <p class="hint">${info.ko} · ${E.DIFFS[b.diff].ko} · ${b.won ? `${S.round}라운드에 쓰러뜨림` : `남은 체력 ${b.hp}`}</p>
    ${order.map((r, k) => `<div class="frame rank${k === 0 ? ' first' : ''}">
        <span class="medal m${k}">${k === 0 ? 'MVP' : k + 1}</span>${portrait(r.p.cls)}
        <div class="who"><b>${esc(r.p.name)} <small>Lv.${r.p.level}</small></b><span>점수표 ${E.cardTotal(r.p)} · 의뢰 ${r.p.questsDone.length}</span></div>
        <span class="tot">⚔${r.dmg}</span></div>`).join('')}
    ${resultActions()}
  </div></div>`;
}
function resultActions() {
  if (online) return `<div class="res-actions">
    ${isHost() ? '<button class="pbtn gold" data-act="room-again">같은 방에서 다시</button>' : '<span class="waiting">방장이 다시 시작할 수 있어요</span>'}
    <button class="pbtn" data-act="home">메인 메뉴</button></div>`;
  return `<div class="res-actions">
    <button class="pbtn gold" data-act="again">다시 하기</button>
    <button class="pbtn" data-act="home">메인 메뉴</button></div>`;
}

// ── 설정 · 크레딧 ────────────────────────────────────────────────────────────
function showSettings(inGame = false) {
  const a = audioSettings();
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>${inGame ? '일시정지' : '설정'}</h2>
    <label class="set-row">배경음악<input id="set-bgm" type="range" min="0" max="1" step="0.05" value="${a.bgm}"></label>
    <label class="set-row">효과음<input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${a.sfx}"></label>
    <label class="set-row">진동<input id="set-vib" type="checkbox" ${a.vibrate ? 'checked' : ''}></label>
    ${online ? `<p class="hint">온라인 방 ${online.code}</p>` : ''}
    <div class="modal-actions">
      ${inGame ? `<button class="pbtn gold" data-act="close">계속하기</button><button class="pbtn" data-act="quit">${online ? '방 나가기' : '메인 메뉴로'}</button>` :
        '<button class="pbtn" data-act="story">스토리 다시 보기</button><button class="pbtn" data-act="tutorial">튜토리얼 다시 보기</button><button class="pbtn gold" data-act="close">닫기</button>'}
    </div>
  </div></div>`;
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
        <div class="coach-text"><b>루루</b><p>${br(st.text)}</p>
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
  layer.innerHTML = '';
  markSeen('tutorial');
  coachEl.innerHTML = '';
  S = null;
  store.del(KEYS.save);
  toast('🎓', skipped ? '튜토리얼을 건너뛰었어요' : '튜토리얼 완료!',
    skipped ? '메뉴 → 설정에서 언제든 다시 볼 수 있어요.' : '이제 파티를 꾸려 진짜 모험을 떠나 보자.', 2200);
  return showSetup();
}

function coachNext() {
  const st = STEPS[tut.step];
  sfx.select();
  if (st.end) return endTutorial(false);
  tut.step++;
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
  else if (!S.rolled && S.players.length > 1 && S.phase === 'roll') sfx.turn();
}

async function rollAnimated(mask) {
  const t = await ensureTray();
  sfx.shake();
  buzz(15);
  ui.busy = true;
  render();
  await t.roll(S.dice, mask, ui.fast && E.current(S).bot ? 2.2 : 1);
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
    const mask = S.dice.map((_, i) => !(S.rolled && S.held[i]));
    E.applyBot(S, act);
    await rollAnimated(mask);
    return step();
  }
  if (act.type === 'flip' || act.type === 'nudge') sfx.select();
  if (act.type === 'perk') {
    const k = E.perkInfo(act.id);
    sfx.card();
    toast(k.icon, `${E.current(S).name} · ${k.ko}`, k.desc, 1400);
  }
  E.applyBot(S, act);
  step();
}

function tryAct(fn) {
  try { fn(); return true; }
  catch (err) { toast('⚠️', '할 수 없어요', err.message, 1500); return false; }
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
  if (act === 'view') { const i = Number(t.dataset.i); ui.view = i === S.turn ? null : i; sfx.tap(); return render(); }
  if (act === 'help-quest') { sfx.select(); return showQuestHelp(); }
  if (act === 'help-cats') { sfx.select(); return showCatHelp(); }
  if (act === 'info-perk') {
    const k = E.perkInfo(t.dataset.id);
    sfx.tap();
    return popover(t, `<b style="color:${rarityColor(k.rarity)}">${k.icon} ${k.ko}</b> <small>${E.RARITY[k.rarity].ko}</small><p>${k.desc}</p>`);
  }
  if (act === 'info-skill') {
    const k = E.bossInfo(S.boss.id).skills.find(x => x.id === t.dataset.id);
    sfx.tap();
    return popover(t, `<b>${k.icon} ${k.ko}</b><p>${esc(k.desc(S.boss.diff))}</p>`);
  }
  if (act === 'info-event') {
    const ev = E.eventInfo(E.event(S));
    sfx.tap();
    return popover(t, `<b>${ev.icon} 이번 라운드 · ${ev.ko}</b><p>${ev.desc}</p><small>라운드마다 모두에게 적용되는 이벤트가 바뀝니다.</small>`);
  }
  if (act === 'takeover' && online) {
    sfx.select();
    return onlineAct(g => E.applyBot(g, E.botAction(g, Math.random, 14)), { any: true });
  }
  if (act === 'perk') {
    const k = E.perkInfo(t.dataset.id);
    k.rarity === 3 ? sfx.legend() : sfx.start();
    layer.innerHTML = '';
    if (online) return onlineAct(g => E.pickPerk(g, t.dataset.id));
    if (tryAct(() => E.pickPerk(S, t.dataset.id))) step();
    return;
  }
  if (ui.busy || !myControl() || S.phase !== 'roll') return;
  if (act === 'roll') {
    ui.tool = null;
    const mask = S.dice.map((_, i) => !(S.rolled && S.held[i]));
    if (online) return onlineAct(g => E.roll(g));
    if (!tryAct(() => E.roll(S))) return;
    await rollAnimated(mask);
    step();
    return;
  }
  if (act === 'tool') {
    ui.tool = ui.tool === t.dataset.tool ? null : t.dataset.tool;
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
    ui.tool = null;
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
  if (act === 'close' || act === 'close-bg') { sfx.back(); layer.innerHTML = ''; return; }
  if (act === 'settings') { sfx.select(); return showSettings(false); }
  if (act === 'credits') { sfx.select(); return showCredits(); }
  if (act === 'story') { sfx.select(); layer.innerHTML = ''; return showStory(() => showTitle()); }
  if (act === 'tutorial') { sfx.select(); layer.innerHTML = ''; return startTutorial(); }
  if (act === 'new') { sfx.select(); return showSetup(); }
  if (act === 'online') { sfx.select(); return showOnlineMenu(); }
  if (act === 'room-create') { sfx.select(); return createRoom(); }
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
    return lobbyTxn(r => { r.started = false; r.game = null; r.fxLog = []; });
  }
  if (screen === 'setup') return onSetupAct(act, t);
  if (screen === 'lobby' && online) return onLobbyAct(act, t);
  if (screen === 'game' && S) return onGameAct(act, t);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (unlocked) unlock();
  onAct(t.dataset.act, t);
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'set-bgm') setAudio({ bgm: Number(e.target.value) });
  if (id === 'set-sfx') { setAudio({ sfx: Number(e.target.value) }); sfx.tap(); }
  if (id === 'set-vib') setAudio({ vibrate: e.target.checked });
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

// ?demo 봇 대결, ?skip 타이틀로 바로 (화면 점검용)
const q = new URLSearchParams(location.search);
if (q.has('demo')) {
  unlocked = true;
  const mode = q.get('demo') === 'coop' ? { mode: 'coop', boss: q.get('boss') || 'dragon', diff: 1 } : {};
  startGame(E.createGame([{ name: '고블린 봇', cls: 'rogue', bot: true }, { name: '슬라임 봇', cls: 'mage', bot: true }], undefined, mode));
} else if (q.has('skip') || urlRoom) {
  showTitle();
} else {
  showSplash();
}

// ?debug 로 열면 자동 점검 스크립트가 상태와 주사위 위치를 읽을 수 있다
if (q.has('debug')) window.__dh = { get S() { return S; }, get tray() { return tray; }, get tut() { return tut; }, get online() { return online; } };
