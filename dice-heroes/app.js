// 화면 흐름: 스플래시 → 타이틀(터치) → [첫 실행: 스토리 → 튜토리얼] → 메뉴 → 파티 편성 → 게임 → 결과
// 룰은 engine.js, 3D 주사위는 dice3d.js, 소리는 audio.js, 도트 그림은 pixel.js · scenes.js.
import * as E from './engine.js';
import { GAME } from './config.js';
import { spriteURL } from './pixel.js';
import { titleScene, storyScene, STORY } from './scenes.js';
import { sfx, playBgm, stopBgm, unlock, audioSettings, setAudio, buzz } from './audio.js';
import { STEPS, createTutorialGame } from './tutorial.js';

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const coachEl = document.getElementById('coach');
document.title = GAME.name;

const KEYS = { save: 'diceheroes.game', setup: 'diceheroes.setup', seen: 'diceheroes.seen' };
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

let screen = null;          // 'splash' | 'title' | 'story' | 'setup' | 'game'
let stage = null;           // 도트 배경 애니메이션
let S = null;               // 게임 상태
let tray = null;            // 3D 주사위
let tut = null;             // { step } 튜토리얼 진행
let unlocked = false;       // 첫 터치(소리 허용) 여부
const ui = { view: null, tool: null, nudgeIdx: null, busy: false, fast: false };

// ── 도우미 ───────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const br = s => esc(s).replace(/\n/g, '<br>');
const portrait = (cls, cl = '') => `<img class="spr ${cl}" src="${spriteURL(cls, 4)}" alt="">`;
const rarityColor = r => ({ 1: 'var(--common)', 2: 'var(--rare)', 3: 'var(--legend)' }[r]);

function setStage(next) {
  stage?.stop();
  stage = next;
}

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
        <button class="pbtn ${canResume ? '' : 'gold'}" data-act="new">새 모험</button>
        <button class="pbtn" data-act="tutorial">튜토리얼</button>
        <div class="menu-row">
          <button class="pbtn small" data-act="story">스토리</button>
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

// ── 파티 편성 ────────────────────────────────────────────────────────────────
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
      ${setup.map((pl, i) => {
        const c = E.classInfo(pl.cls);
        return `
        <section class="frame slot">
          <div class="slot-top">
            <div class="portrait" style="--c:${c.color}">${portrait(pl.cls)}</div>
            <div class="slot-main">
              <input id="name-${i}" data-name="${i}" value="${esc(pl.name)}" maxlength="10" aria-label="${i + 1}번 이름">
              <div class="seg" role="group" aria-label="조작">
                <button data-act="human" data-i="${i}" class="${pl.bot ? '' : 'on'}">사람</button>
                <button data-act="bot" data-i="${i}" class="${pl.bot ? 'on' : ''}">봇</button>
              </div>
            </div>
            ${setup.length > 1 ? `<button class="x" data-act="remove" data-i="${i}" aria-label="빼기">✕</button>` : ''}
          </div>
          <div class="classes">
            ${E.CLASSES.map(k => `
              <button class="cls${pl.cls === k.id ? ' on' : ''}" style="--c:${k.color}" data-act="cls" data-i="${i}" data-cls="${k.id}">
                ${portrait(k.id, 'mini')}<span>${k.ko}</span>
              </button>`).join('')}
          </div>
          <p class="cls-desc"><b style="color:${c.color}">${c.ko}</b> ${c.desc}</p>
        </section>`;
      }).join('')}
      <button class="pbtn small" data-act="add" ${setup.length >= 4 ? 'disabled' : ''}>＋ 동료 추가</button>
      <p class="hint">사람이 여럿이면 한 기기를 돌려 가며 합니다. 봇은 혼자 할 때 상대가 됩니다.</p>
      <button class="pbtn gold big" data-act="start">모험 출발</button>
    </div>
  </div>`;
}

function onSetupAct(act, t) {
  const i = Number(t.dataset.i);
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
    return startGame(E.createGame(setup));
  }
  sfx.select();
  store.set(KEYS.setup, setup);
  showSetup();
}

// ── 게임 화면 ────────────────────────────────────────────────────────────────
function startGame(state) {
  S = state;
  Object.assign(ui, { view: null, tool: null, nudgeIdx: null, busy: false });
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
    onPick: i => onAct('die', { dataset: { i } }),
    onHit: v => sfx.clack(v),
  });
  return tray;
}

function render() {
  if (screen !== 'game' || !S) return;
  const cur = E.current(S);
  const viewIdx = ui.view ?? S.turn;
  const vp = S.players[viewIdx];
  const ev = E.eventInfo(E.event(S));
  const myTurn = !cur.bot && !S.ended && S.phase === 'roll' && !ui.busy;
  const prev = S.rolled && !ui.busy ? E.preview(S) : null;
  const okQuests = S.rolled && !ui.busy ? E.claimableQuests(S) : [];
  const best = prev ? prev.filter(r => !r.taken).sort((a, b) => b.pts - a.pts)[0]?.id : null;
  const need = E.xpToNext(cur.level);
  const xpPct = cur.level >= E.MAX_LEVEL ? 100 : Math.min(100, (cur.xp / need) * 100);
  const canRoll = myTurn && S.rollsLeft > 0 && !(S.rolled && S.held.every(Boolean));

  app.innerHTML = `
  <div class="screen game${cur.bot ? ' bot-turn' : ' my-turn'}">
    <header class="hud">
      <button class="icon-btn" data-act="pause" aria-label="메뉴">☰</button>
      <div class="round-chip"><small>ROUND</small><b>${S.round}<i>/${E.ROUNDS}</i></b></div>
      <div class="event-chip"><span class="ev-ic">${ev.icon}</span><div><b>${ev.ko}</b><small>${ev.desc}</small></div></div>
      <button class="icon-btn${ui.fast ? ' on' : ''}" data-act="fast" aria-label="봇 빨리 감기">⏩</button>
    </header>

    <div class="party" style="--n:${S.players.length}">
      ${S.players.map((p, i) => `
        <button class="member${i === S.turn ? ' turn' : ''}${i === viewIdx ? ' viewing' : ''}" data-act="view" data-i="${i}" style="--c:${E.classInfo(p.cls).color}">
          <div class="m-por">${portrait(p.cls)}<span class="lv">${p.level}</span></div>
          <div class="m-info"><span class="name">${esc(p.name)}</span><b class="pts">${E.finalScore(p)}</b></div>
        </button>`).join('')}
    </div>

    <section class="quests" id="quests">
      ${S.board.map(qid => {
        const q = E.questInfo(qid);
        return `<div class="quest${okQuests.includes(qid) ? ' ok' : ''}">
          <span class="q-ic">${q.icon}</span>
          <div class="q-body"><b>${q.ko}</b><small>${q.desc}</small></div>
          <span class="q-rw"><em>★${E.questFame(S, cur, qid)}</em><i>${q.xp}XP</i></span>
        </div>`;
      }).join('')}
    </section>

    <section class="table">
      <div class="turn-tag" style="--c:${E.classInfo(cur.cls).color}">
        ${portrait(cur.cls, 'tiny')}<span>${esc(cur.name)}${cur.bot ? ' (봇)' : ''}</span>
      </div>
      <div class="rolls-left">${[...Array(E.maxRolls(S, cur))].map((_, i) => `<i class="${i < S.rollsLeft ? 'on' : ''}"></i>`).join('')}</div>
      <div id="tray" class="tray"></div>
    </section>

    <section class="controls">
      <button class="pbtn gold roll" data-act="roll" ${canRoll ? '' : 'disabled'}>
        ${S.rolled ? '다시 굴리기' : '굴리기'}
      </button>
      <button class="pbtn tool${ui.tool === 'flip' ? ' on' : ''}" data-act="tool" data-tool="flip" ${myTurn && S.rolled && cur.flip > 0 ? '' : 'disabled'}>
        <span>🔄</span>뒤집기<b>${cur.flip}</b></button>
      <button class="pbtn tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="tool" data-tool="nudge" ${myTurn && S.rolled && cur.nudge > 0 ? '' : 'disabled'}>
        <span>🎯</span>조정<b>${cur.nudge}</b></button>
    </section>
    <div class="tip">${ui.nudgeIdx !== null ? `
      <span>${ui.nudgeIdx + 1}번 주사위 (${S.dice[ui.nudgeIdx]})</span>
      <button class="pbtn small" data-act="nudge" data-d="-1">−1</button>
      <button class="pbtn small" data-act="nudge" data-d="1">+1</button>` : tip(cur, myTurn, okQuests)}</div>

    <section class="frame hero" style="--c:${E.classInfo(cur.cls).color}">
      <div class="h-por">${portrait(cur.cls)}</div>
      <div class="h-main">
        <div class="h-name"><b>${esc(cur.name)}</b><span>${E.classInfo(cur.cls).ko}</span><span class="lvl">Lv.${cur.level}</span></div>
        <div class="xpbar" style="--w:${xpPct}%"><i></i><em>${cur.level >= E.MAX_LEVEL ? 'MAX' : `EXP ${cur.xp} / ${need}`}</em></div>
        <div class="perks">
          ${Object.keys(cur.perks).length ? Object.entries(cur.perks).map(([id, n]) => {
            const k = E.perkInfo(id);
            return `<span class="perk-chip" style="--rc:${rarityColor(k.rarity)}" title="${esc(k.desc)}">${k.icon}${k.ko}${n > 1 ? `<b>×${n}</b>` : ''}</span>`;
          }).join('') : '<span class="dim">레벨업하면 특성 카드를 고른다</span>'}
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
  });
  updateCoach();
}

function tip(cur, myTurn, okQuests) {
  if (S.ended) return '';
  if (cur.bot) return `${esc(cur.name)}의 차례…`;
  if (!myTurn) return '';
  if (ui.tool === 'flip') return '뒤집을 주사위를 누르세요 (1↔6 · 2↔5 · 3↔4)';
  if (ui.tool === 'nudge') return '조정할 주사위를 누르세요';
  if (!S.rolled) return '굴리기를 눌러 턴을 시작하세요';
  if (okQuests.length) return `<b class="ok-txt">의뢰 「${okQuests.map(q => esc(E.questInfo(q).ko)).join('」「')}」 달성 가능!</b>`;
  return S.rollsLeft ? '주사위를 눌러 잡고 다시 굴리거나, 점수표에 기록하세요' : '점수표에서 기록할 칸을 고르세요';
}

function sheet(p, idx, prev, best, canPick) {
  const pv = id => prev?.find(r => r.id === id);
  const row = c => {
    const done = p.scores[c.id] !== null;
    const r = canPick && !done ? pv(c.id) : null;
    const cls = done ? 'done' : r ? `pick${r.pts === 0 ? ' zero' : ''}${c.id === best && r.pts > 0 ? ' best' : ''}` : '';
    const val = done ? p.scores[c.id] : r ? `${r.pts}<small>+${r.xp}xp</small>` : '–';
    return `<button class="row ${cls}" data-act="score" data-cat="${c.id}" ${r ? '' : 'disabled'}>
      <span class="nm">${c.ko}</span><span class="v">${val}</span></button>`;
  };
  const up = E.upperSum(p), need = E.upperNeed(p), got = up >= need;
  const b = E.breakdown(p);
  return `
  <section class="frame sheet-wrap">
    <div class="sheet-head"><h3>점수표</h3><span>${esc(p.name)}${idx !== S.turn ? ' · 보는 중' : ''}</span></div>
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
      <div>명성<b>★${b.fame}</b></div>
      <div>레벨<b>+${b.level}</b></div>
      <div class="grand">총점<b>${b.total}</b></div>
    </div>
  </section>`;
}

// ── 연출 ─────────────────────────────────────────────────────────────────────
function floatText(text, cls, offset = 0) {
  const el = document.createElement('div');
  el.className = `float ${cls}`;
  const r = document.getElementById('tray')?.getBoundingClientRect();
  el.style.top = `${Math.max(90, (r ? r.top + r.height * 0.35 : innerHeight / 2) + offset)}px`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
async function toast(icon, title, text, ms = 1900) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-ic">${icon}</span><div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
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

async function playFx(list) {
  for (const f of list) {
    const p = S.players[f.player];
    switch (f.type) {
      case 'round':
        if (!S.tutorial || f.round > 1) await banner(f.round, f.event);
        break;
      case 'score':
        if (f.pts > 0) { sfx.score(); floatText(`${E.catInfo(f.cat).ko} +${f.pts}`, 'gold'); }
        else { sfx.zero(); floatText(`${E.catInfo(f.cat).ko} 0`, 'dim'); }
        await wait(380);
        break;
      case 'quest':
        sfx.quest();
        await toast(E.questInfo(f.quest).icon, `의뢰 완료! 「${E.questInfo(f.quest).ko}」`, `${p.name} · 명성 +${f.fame} · 경험치 +${f.xp}`);
        break;
      case 'xp': sfx.coin(); floatText(`+${f.amount} EXP`, 'mint', 38); await wait(320); break;
      case 'levelup':
        sfx.levelup();
        if (p.bot) await toast('🆙', `${p.name} 레벨 ${f.level}!`, '특성 카드를 고르는 중…', 1300);
        break;
      case 'midas': floatText('👑 황금손 ★+2', 'gold', -30); break;
      case 'duel': sfx.quest(); await toast('🏆', '결투 대회 우승!', `${p.name} · 명성 +5`); break;
    }
  }
}

function showLevelUp() {
  const p = E.current(S);
  const offer = p.offers[0];
  const hasLegend = offer.some(id => E.perkInfo(id).rarity === 3);
  layer.innerHTML = `<div class="overlay lv-overlay"><div class="lvup">
    <div class="rays"></div>
    <div class="lv-hero">${portrait(p.cls, 'big')}</div>
    <h1>LEVEL UP!</h1>
    <div class="lv-sub">${esc(p.name)} · <b>Lv.${p.level - p.offers.length + 1}</b></div>
    <p class="lv-hint">카드 한 장을 골라 영구 특성을 얻으세요</p>
    <div class="cards" style="--n:${offer.length}">
      ${offer.map(id => {
        const k = E.perkInfo(id), have = E.perkCount(p, id);
        return `<button class="card r${k.rarity}" data-act="perk" data-id="${id}">
          <span class="rar">${E.RARITY[k.rarity].ko}</span><span class="c-ic">${k.icon}</span><b>${k.ko}</b><p>${k.desc}</p>
          ${have ? `<em>보유 ${have} → ${have + 1}</em>` : ''}</button>`;
      }).join('')}
    </div>
  </div></div>`;
  setTimeout(() => (hasLegend ? sfx.legend() : sfx.card()), 350);
  updateCoach();
}

function showResults() {
  const rank = E.ranking(S);
  stopBgm();
  sfx.win();
  setTimeout(() => playBgm('victory'), 1500);
  store.del(KEYS.save);
  const medals = ['1ST', '2ND', '3RD', '4TH'];
  layer.innerHTML = `<div class="overlay solid"><div class="results">
    <h1>모험 종료</h1>
    <div class="winner">${portrait(rank[0].p.cls, 'big')}<b>${esc(rank[0].p.name)} 승리!</b></div>
    ${rank.map((r, k) => {
      const b = E.breakdown(r.p);
      return `<div class="frame rank${k === 0 ? ' first' : ''}">
        <span class="medal m${k}">${medals[k]}</span>${portrait(r.p.cls)}
        <div class="who"><b>${esc(r.p.name)} <small>Lv.${r.p.level}</small></b>
          <span>점수표 ${b.card}${b.bonus ? '+35' : ''} · 명성 ${b.fame} · 레벨 +${b.level} · 의뢰 ${r.p.questsDone.length}</span></div>
        <span class="tot">${r.total}</span></div>`;
    }).join('')}
    <div class="res-actions">
      <button class="pbtn gold" data-act="again">다시 하기</button>
      <button class="pbtn" data-act="home">메인 메뉴</button>
    </div>
  </div></div>`;
}

// ── 설정 · 크레딧 · 일시정지 ─────────────────────────────────────────────────
function showSettings(inGame = false) {
  const a = audioSettings();
  layer.innerHTML = `<div class="overlay" data-act="close-bg"><div class="modal frame" data-act="noop">
    <h2>${inGame ? '일시정지' : '설정'}</h2>
    <label class="set-row">배경음악<input id="set-bgm" type="range" min="0" max="1" step="0.05" value="${a.bgm}"></label>
    <label class="set-row">효과음<input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${a.sfx}"></label>
    <label class="set-row">진동<input id="set-vib" type="checkbox" ${a.vibrate ? 'checked' : ''}></label>
    <div class="modal-actions">
      ${inGame ? '<button class="pbtn gold" data-act="close">계속하기</button><button class="pbtn" data-act="quit">메인 메뉴로</button>' :
        '<button class="pbtn" data-act="tutorial">튜토리얼 다시 보기</button><button class="pbtn gold" data-act="close">닫기</button>'}
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
       물리 <b>cannon-es</b> · MIT License</p>
    <p>기반 규칙 <b>요트(Yacht)</b> 주사위 게임</p>
    <button class="pbtn gold" data-act="close">닫기</button>
  </div></div>`;
}

// ── 튜토리얼 코치 ────────────────────────────────────────────────────────────
function startTutorial() {
  tut = { step: 0 };
  const name = setup.find(p => !p.bot)?.name || '나';
  startGame(createTutorialGame(name));
}

function updateCoach() {
  if (!tut || screen !== 'game') { coachEl.innerHTML = ''; return; }
  const st = STEPS[tut.step];
  if (!st || ui.busy) { coachEl.innerHTML = ''; return; }
  const target = st.target ? document.querySelector(st.target) : null;
  if (st.target && !target) { coachEl.innerHTML = ''; return; }
  const r = target?.getBoundingClientRect();
  const low = r && r.top + r.height / 2 > innerHeight * 0.5;
  coachEl.innerHTML = `
    ${r ? `<div class="spot${target.closest('.overlay') ? ' soft' : ''}" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>` : '<div class="dim"></div>'}
    <div class="coach-box ${low || !r ? 'top' : 'bottom'}">
      <img class="spr coach-fairy" src="${spriteURL('fairy', 4)}" alt="">
      <div class="coach-text"><b>루루</b><p>${br(st.text)}</p>
        ${st.next ? `<button class="pbtn gold small" data-act="coach-next">${st.next}</button>` : ''}
        <span class="coach-step">${tut.step + 1} / ${STEPS.length}</span></div>
    </div>`;
}
function scrollToTarget() {
  const st = STEPS[tut?.step];
  const el = st?.target && document.querySelector(st.target);
  if (el && !el.closest('.overlay')) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(updateCoach, 420);
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
function tutorialAllows(act, t) {
  if (!tut) return true;
  const st = STEPS[tut.step];
  if (!st || st.next) return false;
  if (!st.allow?.includes(act)) return false;
  const only = st.only || {};
  if (act === 'score' && only.cat && t.dataset.cat !== only.cat) return false;
  if (act === 'tool' && only.tool && t.dataset.tool !== only.tool) return false;
  if (act === 'die' && only.die !== undefined && ui.tool && Number(t.dataset.i) !== only.die) return false;
  return true;
}
function coachNext() {
  const st = STEPS[tut.step];
  sfx.select();
  if (st.end) {
    tut = null;
    layer.innerHTML = '';
    markSeen('tutorial');
    coachEl.innerHTML = '';
    S = null;
    store.del(KEYS.save);
    toast('🎓', '튜토리얼 완료!', '이제 파티를 꾸려 진짜 모험을 떠나 보자.', 2200);
    return showSetup();
  }
  tut.step++;
  advanceTutorial();
  render();
  scrollToTarget();
}

// ── 진행 루프 ────────────────────────────────────────────────────────────────
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
  if (!S || S.ended || !E.current(S).bot || screen !== 'game') return;
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

async function onGameAct(act, t) {
  if (act === 'skip-banner') return skipBanner();
  if (act === 'fast') { ui.fast = !ui.fast; sfx.select(); return render(); }
  if (act === 'pause') { sfx.select(); return showSettings(true); }
  if (act === 'view') { const i = Number(t.dataset.i); ui.view = i === S.turn ? null : i; sfx.tap(); return render(); }
  if (act === 'coach-next') return coachNext();
  if (!tutorialAllows(act, t)) return;
  if (act === 'perk') {
    const k = E.perkInfo(t.dataset.id);
    k.rarity === 3 ? sfx.legend() : sfx.start();
    layer.innerHTML = '';
    if (tryAct(() => E.pickPerk(S, t.dataset.id))) step();
    return;
  }
  if (ui.busy || E.current(S).bot || S.phase !== 'roll') return;
  if (act === 'roll') {
    ui.tool = null; ui.nudgeIdx = null;
    const mask = S.dice.map((_, i) => !(S.rolled && S.held[i]));
    if (!tryAct(() => E.roll(S))) return;
    await rollAnimated(mask);
    render();
    advanceTutorial();
    return;
  }
  if (act === 'tool') {
    ui.tool = ui.tool === t.dataset.tool ? null : t.dataset.tool;
    ui.nudgeIdx = null;
    sfx.select();
    return render();
  }
  if (act === 'die') {
    if (!S.rolled) return;
    const i = Number(t.dataset.i);
    if (ui.tool === 'flip') {
      ui.tool = null;
      sfx.select();
      if (tryAct(() => E.useFlip(S, i))) { render(); advanceTutorial(); }
      return;
    }
    if (ui.tool === 'nudge') { ui.nudgeIdx = i; sfx.select(); return render(); }
    E.toggleHold(S, i);
    S.held[i] ? sfx.hold() : sfx.unhold();
    tray?.setHeld(S.held);
    render();
    return advanceTutorial();
  }
  if (act === 'nudge') {
    const i = ui.nudgeIdx;
    ui.tool = null; ui.nudgeIdx = null;
    sfx.select();
    if (tryAct(() => E.useNudge(S, i, Number(t.dataset.d)))) { render(); advanceTutorial(); }
    else render();
    return;
  }
  if (act === 'score') {
    ui.tool = null; ui.nudgeIdx = null;
    if (tryAct(() => E.commitScore(S, t.dataset.cat))) step();
  }
}

// 모든 버튼은 data-act 로 한곳에서 받는다
function onAct(act, t) {
  if (act === 'touch') {
    unlock(); unlocked = true; sfx.start();
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
  if (act === 'story') { sfx.select(); return showStory(() => showTitle()); }
  if (act === 'tutorial') { sfx.select(); layer.innerHTML = ''; return startTutorial(); }
  if (act === 'new') { sfx.select(); return showSetup(); }
  if (act === 'resume') {
    sfx.start();
    const saved = store.get(KEYS.save);
    saved.fx = [{ type: 'round', round: saved.round, event: E.event(saved) }];
    return startGame(saved);
  }
  if (act === 'home' || act === 'quit') {
    sfx.back();
    tut = null; coachEl.innerHTML = '';
    S = null; layer.innerHTML = '';
    return showTitle();
  }
  if (act === 'again') { sfx.start(); return startGame(E.createGame(setup)); }
  if (screen === 'setup') return onSetupAct(act, t);
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
  if (i !== undefined) { setup[Number(i)].name = e.target.value; store.set(KEYS.setup, setup); }
});
addEventListener('resize', () => updateCoach());
addEventListener('scroll', () => updateCoach(), { passive: true });

// 설치형 앱(PWA)으로 쓸 때 오프라인 캐시
if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ?demo 봇 대결, ?skip 타이틀로 바로 (화면 점검용)
const q = new URLSearchParams(location.search);
if (q.has('demo')) {
  unlocked = true;
  startGame(E.createGame([{ name: '고블린 봇', cls: 'rogue', bot: true }, { name: '슬라임 봇', cls: 'mage', bot: true }]));
} else if (q.has('skip')) {
  showTitle();
} else {
  showSplash();
}

// ?debug 로 열면 자동 점검 스크립트가 상태와 주사위 위치를 읽을 수 있다
if (q.has('debug')) window.__dh = { get S() { return S; }, get tray() { return tray; }, get tut() { return tut; } };
