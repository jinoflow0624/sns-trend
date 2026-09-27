// 다이스 히어로즈 — 화면과 입력. 룰은 전부 engine.js 에 있고 여기서는 그리기·연출만 한다.
import * as E from './engine.js';

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const SAVE_KEY = 'diceheroes.game';
const SETUP_KEY = 'diceheroes.setup';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

const BOT_NAMES = ['고블린 봇', '슬라임 봇', '해골 봇', '미믹 봇'];
let setup = store.get(SETUP_KEY) || [
  { name: '나', cls: 'warrior', bot: false },
  { name: '고블린 봇', cls: 'mage', bot: true },
  { name: '슬라임 봇', cls: 'bard', bot: true },
];
let S = null;
const ui = { view: null, tool: null, nudgeIdx: null, rolling: [], busy: false, fast: false, focusCls: 0 };

// ── 소리 (WebAudio 합성, 파일 없음) ──────────────────────────────────────────
let ctx = null, muted = !!store.get('diceheroes.muted');
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq, start = 0, dur = 0.18, type = 'triangle', gain = 0.14, sweep = null) {
  if (muted || !audio()) return;
  const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (sweep) o.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  roll() { for (let i = 0; i < 6; i++) tone(180 + Math.random() * 260, i * 0.045, 0.05, 'square', 0.05); },
  hold() { tone(660, 0, 0.07, 'sine', 0.1); },
  score() { tone(523, 0, 0.12); tone(784, 0.08, 0.2); },
  zero() { tone(300, 0, 0.25, 'sawtooth', 0.06, 180); },
  quest() { [988, 1319, 1568].forEach((f, i) => tone(f, i * 0.07, 0.18, 'sine', 0.12)); },
  level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.14)); },
  pick() { tone(880, 0, 0.1, 'sine', 0.12); tone(1320, 0.06, 0.25, 'sine', 0.1); },
  round() { tone(392, 0, 0.2, 'square', 0.06); tone(523, 0.12, 0.3, 'square', 0.06); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.14)); },
};

// ── 도우미 ───────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieFace = v => [...Array(9)].map((_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('');
const avatar = (p, big = false) => {
  const c = E.classInfo(p.cls);
  return `<div class="avatar${big ? ' big' : ''}" style="--c:${c.color}">${c.icon}<span class="lv">Lv${p.level}</span></div>`;
};
const rarityCls = id => `r${E.perkInfo(id).rarity}`;
const rarityColor = r => ({ 1: 'var(--common)', 2: 'var(--rare)', 3: 'var(--legend)' }[r]);

// ── 시작 화면 ────────────────────────────────────────────────────────────────
function renderSetup() {
  layer.innerHTML = '';
  const saved = store.get(SAVE_KEY);
  const canResume = saved && !saved.ended && saved.v === 1;
  app.innerHTML = `
  <div class="wrap">
    <header class="title">
      <div class="dice-row" aria-hidden="true">🎲⚔️🎲</div>
      <h1 class="logo">다이스 히어로즈</h1>
      <div class="en">DICE · HEROES</div>
    </header>
    <p class="pitch">요트 주사위 12라운드. 굴린 눈으로 점수를 적을 때마다 경험치가 쌓이고,
      레벨이 오르면 특성 카드를 뽑아 내 영웅만의 빌드를 만든다. 공용 의뢰 게시판은 매 턴 바뀐다.</p>

    <section class="panel slots" aria-label="참가자">
      <div class="board-head"><h2>파티 편성</h2><span class="label">${setup.length} / 4</span></div>
      ${setup.map((pl, i) => `
        <div class="slot">
          <div class="slot-top">
            <input id="name-${i}" data-name="${i}" value="${esc(pl.name)}" maxlength="10" aria-label="${i + 1}번 이름">
            <div class="seg" role="group" aria-label="조작">
              <button data-act="human" data-i="${i}" class="${pl.bot ? '' : 'on'}">사람</button>
              <button data-act="bot" data-i="${i}" class="${pl.bot ? 'on' : ''}">봇</button>
            </div>
            ${setup.length > 1 ? `<button class="x" data-act="remove" data-i="${i}" aria-label="빼기">✕</button>` : ''}
          </div>
          <div class="classes">
            ${E.CLASSES.map(c => `
              <button class="cls${pl.cls === c.id ? ' on' : ''}" style="--c:${c.color}" data-act="cls" data-i="${i}" data-cls="${c.id}">
                <span class="ic">${c.icon}</span>${c.ko}
              </button>`).join('')}
          </div>
          <div class="cls-desc"><b>${E.classInfo(pl.cls).ko}</b> · ${E.classInfo(pl.cls).desc}</div>
        </div>`).join('<hr style="border:0;border-top:1px dashed var(--line-soft);margin:2px 0">')}
      <div class="setup-actions">
        <button class="btn alt small" data-act="add" ${setup.length >= 4 ? 'disabled' : ''}>＋ 동료 추가</button>
        <span class="label">사람끼리는 한 화면을 돌려 가며</span>
      </div>
    </section>

    <button class="btn start" data-act="start">모험 시작</button>
    ${canResume ? `<button class="btn alt" data-act="resume">진행 중이던 모험 이어하기 · ${saved.round}라운드</button>` : ''}

    <section class="panel howto">
      <h3>한 턴은 이렇게</h3>
      <ol>
        <li><b>굴리기</b> 주사위 5개를 최대 3번. 누른 주사위는 잡아 두고 나머지만 다시 굴린다.</li>
        <li><b>기록</b> 요트 점수표 12칸 중 하나에 적는다. 적은 점수만큼 <b>경험치</b>.</li>
        <li><b>의뢰</b> 그 주사위로 게시판 의뢰 조건을 맞추면 <b>명성</b>과 추가 경험치를 가져간다. 먼저 깬 사람 몫.</li>
        <li><b>레벨업</b> 카드 3장 중 하나를 골라 영구 특성을 얻는다. 일반 · 희귀 · 전설.</li>
        <li><b>최종 점수</b> 점수표 합계(상단 63↑ 보너스 35) + 명성 + (레벨-1)×3.</li>
      </ol>
      <span class="label">매 라운드 이벤트 카드가 판을 흔든다 · 12라운드 후 종료</span>
    </section>
  </div>`;
}

function onSetupClick(t) {
  const act = t.dataset.act, i = Number(t.dataset.i);
  if (act === 'human') setup[i].bot = false;
  if (act === 'bot') { setup[i].bot = true; if (setup[i].name === '나') setup[i].name = BOT_NAMES[i % 4]; }
  if (act === 'cls') setup[i].cls = t.dataset.cls;
  if (act === 'remove') setup.splice(i, 1);
  if (act === 'add' && setup.length < 4) {
    const used = new Set(setup.map(p => p.cls));
    setup.push({ name: BOT_NAMES.find(n => !setup.some(p => p.name === n)) || '동료', cls: E.CLASSES.find(c => !used.has(c.id))?.id || 'mage', bot: true });
  }
  if (act === 'start') {
    audio();
    setup.forEach((p, k) => { p.name = (p.name || '').trim() || (p.bot ? BOT_NAMES[k] : `영웅${k + 1}`); });
    store.set(SETUP_KEY, setup);
    S = E.createGame(setup);
    Object.assign(ui, { view: null, tool: null, nudgeIdx: null });
    return step();
  }
  if (act === 'resume') {
    audio();
    S = store.get(SAVE_KEY);
    S.fx = [{ type: 'round', round: S.round, event: E.event(S) }];
    return step();
  }
  store.set(SETUP_KEY, setup);
  renderSetup();
}

// ── 게임 화면 ────────────────────────────────────────────────────────────────
function render() {
  const cur = E.current(S);
  const viewIdx = ui.view ?? S.turn;
  const vp = S.players[viewIdx];
  const ev = E.eventInfo(E.event(S));
  const myTurn = !cur.bot && !S.ended && S.phase === 'roll' && !ui.busy;
  const prev = S.rolled ? E.preview(S) : null;
  const okQuests = S.rolled ? E.claimableQuests(S) : [];
  const best = prev ? prev.filter(r => !r.taken).sort((a, b) => b.pts - a.pts)[0]?.id : null;
  const need = E.xpToNext(cur.level);

  app.innerHTML = `
  <div class="wrap">
    <div class="hud">
      <div class="round"><span class="label">Round</span><b>${S.round}</b><small>/ ${E.ROUNDS}</small></div>
      <div class="panel event"><span class="ic">${ev.icon}</span><div><b>${ev.ko}</b><span>${ev.desc}</span></div></div>
      <div style="display:grid;gap:6px">
        <button class="icon-btn" data-act="mute" aria-label="소리">${muted ? '🔇' : '🔊'}</button>
        <button class="icon-btn" data-act="fast" aria-label="봇 빨리 감기" style="${ui.fast ? 'border-color:var(--mint)' : ''}">⏩</button>
      </div>
    </div>

    <div class="party" style="--n:${S.players.length}">
      ${S.players.map((p, i) => `
        <button class="member${i === S.turn ? ' turn' : ''}${i === viewIdx ? ' viewing' : ''}" data-act="view" data-i="${i}">
          ${p.bot ? '<span class="bot-tag">BOT</span>' : ''}
          ${avatar(p)}
          <span class="name">${esc(p.name)}</span>
          <span class="pts">${E.finalScore(p)}</span>
          <span class="sub">⭐${p.fame} · ${E.CAT_IDS.filter(id => p.scores[id] !== null).length}/12</span>
        </button>`).join('')}
    </div>

    <section class="panel hero">
      ${avatar(cur, true)}
      <div>
        <div class="hero-name"><b>${esc(cur.name)}</b><span>${E.classInfo(cur.cls).ko} · ${cur.bot ? '봇이 생각하는 중…' : '당신의 차례'}</span></div>
        <div class="xpbar" style="--w:${cur.level >= E.MAX_LEVEL ? 100 : Math.min(100, (cur.xp / need) * 100)}%"><i></i>
          <em>${cur.level >= E.MAX_LEVEL ? 'MAX LEVEL' : `EXP ${cur.xp} / ${need}`}</em></div>
        <div class="perks">
          ${Object.keys(cur.perks).length ? Object.entries(cur.perks).map(([id, n]) => {
            const k = E.perkInfo(id);
            return `<span class="perk-chip" style="--rc:${rarityColor(k.rarity)}" title="${esc(k.desc)}">${k.icon} ${k.ko}${n > 1 ? `<span class="n">×${n}</span>` : ''}</span>`;
          }).join('') : '<span class="perk-empty">아직 특성이 없다 · 레벨업하면 카드를 고른다</span>'}
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="board-head"><h2>📜 의뢰 게시판</h2><span class="label">남은 의뢰 ${S.deck.length}</span></div>
      <div class="quests">
        ${S.board.map(qid => {
          const q = E.questInfo(qid);
          return `<div class="quest${okQuests.includes(qid) ? ' ok' : ''}">
            <span class="ic">${q.icon}</span><b>${q.ko}</b><span class="cond">${q.desc}</span>
            <span class="rw"><span class="f">⭐${E.questFame(S, cur, qid)}</span><span class="x">+${q.xp}XP</span></span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="tray" aria-label="주사위">
      <div class="dice">
        ${S.dice.map((v, i) => `
          <div class="die-col">
            <span class="hold-tag">${S.held[i] && S.rolled ? 'HOLD' : ''}</span>
            <button class="die${v ? '' : ' blank'}${S.held[i] && S.rolled ? ' held' : ''}${ui.rolling.includes(i) ? ' rolling' : ''}${ui.tool && myTurn && S.rolled ? ' target' : ''}${v === 1 ? ' v1' : ''}"
              data-act="die" data-i="${i}" ${myTurn && S.rolled ? '' : 'disabled'} aria-label="주사위 ${v || '?'}">${dieFace(v)}</button>
            ${ui.nudgeIdx === i ? `<div class="nudge-pop"><button data-act="nudge" data-d="-1">−</button><button data-act="nudge" data-d="1">+</button></div>` : ''}
          </div>`).join('')}
      </div>
      <div class="tray-actions">
        <button class="btn roll-btn" data-act="roll" ${myTurn && S.rollsLeft > 0 && !(S.rolled && S.held.every(Boolean)) ? '' : 'disabled'}>
          ${S.rolled ? '다시 굴리기' : '굴리기'}<small>남은 굴림 ${S.rollsLeft}</small>
        </button>
        <div class="tools">
          <button class="btn alt small tool${ui.tool === 'flip' ? ' on' : ''}" data-act="tool" data-tool="flip" ${myTurn && S.rolled && cur.flip > 0 ? '' : 'disabled'}>🔄 뒤집기 ${cur.flip}</button>
          <button class="btn alt small tool${ui.tool === 'nudge' ? ' on' : ''}" data-act="tool" data-tool="nudge" ${myTurn && S.rolled && cur.nudge > 0 ? '' : 'disabled'}>🎯 조정 ${cur.nudge}</button>
        </div>
      </div>
      <div class="tray-tip">${tip(cur, myTurn, okQuests)}</div>
    </section>

    ${sheet(vp, viewIdx, prev, best, myTurn && viewIdx === S.turn)}

    <section class="panel">
      <div class="board-head"><h2>📖 모험 기록</h2></div>
      <div class="log">${S.log.slice(-5).map(l => `<div>R${l.r} · ${esc(l.text)}</div>`).join('') || '<div>모험이 시작됐다.</div>'}</div>
    </section>
  </div>`;
}

function tip(cur, myTurn, okQuests) {
  if (cur.bot) return '봇의 차례를 지켜보는 중';
  if (!myTurn) return '';
  if (ui.tool === 'flip') return '뒤집을 주사위를 누르세요 (1↔6, 2↔5, 3↔4)';
  if (ui.tool === 'nudge') return '조정할 주사위를 누르고 − / + 를 고르세요';
  if (!S.rolled) return '굴리기를 눌러 턴을 시작하세요';
  if (okQuests.length) return `어느 칸에 적어도 의뢰 「${okQuests.map(q => E.questInfo(q).ko).join('」「')}」 완료!`;
  return S.rollsLeft ? '남길 주사위를 눌러 잡고 다시 굴리거나, 아래 점수표에 적으세요' : '점수표에서 적을 칸을 고르세요';
}

function sheet(p, idx, prev, best, canPick) {
  const pv = id => prev?.find(r => r.id === id);
  const row = c => {
    const done = p.scores[c.id] !== null;
    const r = canPick && !done ? pv(c.id) : null;
    const cls = done ? 'done' : r ? `pick${r.pts === 0 ? ' zero' : ''}${c.id === best && r.pts > 0 ? ' best' : ''}` : '';
    const val = done ? p.scores[c.id] : r ? `${r.pts}<small>+${r.xp}XP</small>` : '·';
    return `<button class="row ${cls}" data-act="score" data-cat="${c.id}" ${r ? '' : 'disabled'}>
      <span class="nm">${c.ko}${c.hint ? `<small>${c.hint}</small>` : ''}</span><span class="v">${val}</span></button>`;
  };
  const up = E.upperSum(p), need = E.upperNeed(p), got = up >= need;
  const b = E.breakdown(p);
  return `
  <section class="panel">
    <div class="sheet-head"><h2>📋 점수표</h2><span class="who">${esc(p.name)}${idx !== S.turn ? ' (보는 중 · 내 차례로 돌아가려면 파티에서 선택)' : ''}</span></div>
    <div class="sheet">
      <div class="col">${E.CATS.slice(0, 6).map(row).join('')}
        <div class="bonus${got ? ' got' : ''}" style="--w:${Math.min(100, (up / need) * 100)}%">
          <span>상단 ${up} / ${need} → ${got ? '<b style="color:var(--gold)">보너스 +35!</b>' : '보너스 +35'}</span><div class="bar"><i></i></div>
        </div>
      </div>
      <div class="col">${E.CATS.slice(6).map(row).join('')}</div>
    </div>
    <div class="totals">
      <div>점수표<b>${b.card + b.bonus}</b></div>
      <div>명성<b>⭐${b.fame}</b></div>
      <div>레벨<b>+${b.level}</b></div>
      <div class="grand">최종<b>${b.total}</b></div>
    </div>
  </section>`;
}

// ── 연출 ─────────────────────────────────────────────────────────────────────
function floatText(text, color, offset = 0) {
  const el = document.createElement('div');
  el.className = 'float';
  el.style.color = color;
  const tray = document.querySelector('.tray')?.getBoundingClientRect();
  el.style.top = `${Math.max(80, (tray ? tray.top : innerHeight / 2) - 10 + offset)}px`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
async function toast(icon, title, text, ms = 1800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="ic">${icon}</span><div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', () => el.remove());
  await wait(ms / (ui.fast ? 2 : 1));
  el.remove();
}
async function banner(round, evId) {
  const ev = E.eventInfo(evId);
  layer.innerHTML = `<div class="overlay" data-act="skip"><div class="banner">
    <div class="rn">ROUND ${round}</div><div class="ev">${ev.icon}</div><b>${ev.ko}</b><span>${ev.desc}</span></div></div>`;
  sfx.round();
  await Promise.race([wait(ui.fast ? 700 : 1500), new Promise(r => (skipBanner = r))]);
  layer.innerHTML = '';
}
let skipBanner = () => {};

async function playFx(list) {
  for (const f of list) {
    const p = S.players[f.player];
    switch (f.type) {
      case 'round': await banner(f.round, f.event); break;
      case 'score':
        if (f.pts > 0) { sfx.score(); floatText(`${E.catInfo(f.cat).ko} +${f.pts}`, 'var(--gold)'); }
        else { sfx.zero(); floatText(`${E.catInfo(f.cat).ko} 0점`, 'var(--muted)'); }
        await wait(350);
        break;
      case 'quest':
        sfx.quest();
        await toast(E.questInfo(f.quest).icon, `의뢰 완료! 「${E.questInfo(f.quest).ko}」`, `${p.name} · 명성 +${f.fame} · 경험치 +${f.xp}`);
        break;
      case 'xp': floatText(`+${f.amount} EXP`, 'var(--mint)', 34); await wait(300); break;
      case 'levelup':
        sfx.level();
        if (p.bot) await toast('🆙', `${p.name} 레벨 ${f.level}!`, '특성 카드를 고르는 중…', 1300);
        break;
      case 'midas': floatText(`👑 황금손 ⭐+2`, 'var(--gold)', -30); break;
      case 'duel': sfx.quest(); await toast('🏆', '결투 대회 우승!', `${p.name} · 명성 +5`); break;
    }
  }
}

function showLevelUp() {
  const p = E.current(S);
  const offer = p.offers[0];
  layer.innerHTML = `<div class="overlay"><div class="lvup">
    <div class="rays"></div>
    <h1>LEVEL UP!</h1>
    <div class="sub">${esc(p.name)} · <b>Lv ${p.level - p.offers.length + 1}</b> 보상 카드를 고르세요</div>
    <div class="cards" style="--n:${offer.length}">
      ${offer.map(id => {
        const k = E.perkInfo(id), have = E.perkCount(p, id);
        return `<button class="card ${rarityCls(id)}" data-act="perk" data-id="${id}">
          <span class="rar">${E.RARITY[k.rarity].ko}</span><span class="ic">${k.icon}</span><b>${k.ko}</b><p>${k.desc}</p>
          ${have ? `<p style="color:var(--mint)">보유 ${have} → ${have + 1}</p>` : ''}</button>`;
      }).join('')}
    </div>
  </div></div>`;
}

function showResults() {
  const rank = E.ranking(S);
  sfx.win();
  store.del(SAVE_KEY);
  const medals = ['🥇', '🥈', '🥉', '🎖️'];
  layer.innerHTML = `<div class="overlay"><div class="over">
    <h1>모험 종료</h1>
    ${rank.map((r, k) => {
      const b = E.breakdown(r.p);
      return `<div class="panel rank${k === 0 ? ' first' : ''}">
        <span class="medal">${medals[k]}</span>${avatar(r.p)}
        <div class="who"><b>${esc(r.p.name)}</b>
          <span>점수표 ${b.card}${b.bonus ? ' +보너스 35' : ''} · 명성 ${b.fame} · 레벨 +${b.level} · 의뢰 ${r.p.questsDone.length}개</span></div>
        <span class="tot">${r.total}</span></div>`;
    }).join('')}
    <button class="btn" data-act="again">같은 파티로 다시</button>
    <button class="btn alt" data-act="home">처음으로</button>
  </div></div>`;
}

// ── 진행 루프 ────────────────────────────────────────────────────────────────
async function step() {
  ui.busy = true;
  const fx = E.drainFx(S);
  if (!S.ended) store.set(SAVE_KEY, S);
  if (E.current(S).bot || S.ended) { ui.view = null; }
  render();
  await playFx(fx);
  ui.busy = false;
  ui.rolling = [];
  if (S.ended) { render(); return showResults(); }
  const cur = E.current(S);
  if (S.phase === 'levelup' && !cur.bot) { render(); return showLevelUp(); }
  render();
  if (cur.bot) botStep();
}

async function botStep() {
  await wait(ui.fast ? 180 : 600);
  if (!S || S.ended || !E.current(S).bot) return;
  const act = E.botAction(S, Math.random, 18);
  if (act.type === 'reroll') {
    S.held = act.hold.slice();
    sfx.hold();
    render();
    await wait(ui.fast ? 150 : 450);
  }
  if (act.type === 'roll' || act.type === 'reroll') {
    ui.rolling = S.dice.map((_, i) => i).filter(i => !(S.rolled && S.held[i]));
    sfx.roll();
  }
  if (act.type === 'flip' || act.type === 'nudge') sfx.pick();
  if (act.type === 'perk') { sfx.pick(); toast(E.perkInfo(act.id).icon, `${E.current(S).name} · ${E.perkInfo(act.id).ko}`, E.perkInfo(act.id).desc, 1400); }
  E.applyBot(S, act);
  step();
}

function humanAct(fn) {
  try { fn(); }
  catch (err) { toast('⚠️', '할 수 없어요', err.message, 1500); return; }
  step();
}

function onGameClick(t) {
  const act = t.dataset.act;
  if (act === 'skip') return skipBanner();
  if (act === 'mute') { muted = !muted; store.set('diceheroes.muted', muted); return render(); }
  if (act === 'fast') { ui.fast = !ui.fast; return render(); }
  if (act === 'view') { const i = Number(t.dataset.i); ui.view = i === S.turn ? null : i; return render(); }
  if (act === 'again') { S = E.createGame(setup); layer.innerHTML = ''; return step(); }
  if (act === 'home') { S = null; layer.innerHTML = ''; return renderSetup(); }
  if (act === 'perk') {
    sfx.pick();
    layer.innerHTML = '';
    return humanAct(() => E.pickPerk(S, t.dataset.id));
  }
  if (ui.busy || E.current(S).bot) return;
  if (act === 'roll') {
    ui.tool = null; ui.nudgeIdx = null;
    ui.rolling = S.dice.map((_, i) => i).filter(i => !(S.rolled && S.held[i]));
    sfx.roll();
    return humanAct(() => E.roll(S));
  }
  if (act === 'tool') {
    ui.tool = ui.tool === t.dataset.tool ? null : t.dataset.tool;
    ui.nudgeIdx = null;
    return render();
  }
  if (act === 'die') {
    const i = Number(t.dataset.i);
    if (ui.tool === 'flip') { ui.tool = null; sfx.pick(); return humanAct(() => E.useFlip(S, i)); }
    if (ui.tool === 'nudge') { ui.nudgeIdx = i; return render(); }
    sfx.hold();
    E.toggleHold(S, i);
    return render();
  }
  if (act === 'nudge') {
    const i = ui.nudgeIdx;
    ui.tool = null; ui.nudgeIdx = null; sfx.pick();
    return humanAct(() => E.useNudge(S, i, Number(t.dataset.d)));
  }
  if (act === 'score') {
    ui.tool = null; ui.nudgeIdx = null;
    return humanAct(() => E.commitScore(S, t.dataset.cat));
  }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  audio();
  if (S) onGameClick(t); else onSetupClick(t);
});
document.addEventListener('input', e => {
  const i = e.target.dataset?.name;
  if (i === undefined) return;
  setup[Number(i)].name = e.target.value;
  store.set(SETUP_KEY, setup);
});

// ?demo 를 붙이면 봇 둘이 바로 대결한다(화면 점검용)
const q = new URLSearchParams(location.search);
if (q.get('demo') !== null) {
  S = E.createGame([{ name: '봇 A', cls: 'rogue', bot: true }, { name: '봇 B', cls: 'mage', bot: true }]);
  step();
} else {
  renderSetup();
}
