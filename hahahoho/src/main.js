// 시작점: 화면 전환 · 저장 슬롯 · 세계 열기 · 게임 루프.
import { Screens } from './ui/screens.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { Renderer } from './game/render.js';
import { Input } from './game/input.js';
import { openStore, firebaseAvailable, makeCode, makeId, normCode, explain, FireStore } from './net/store.js';
import * as Slots from './net/slots.js';
import { createPlayer } from './logic/player.js';
import { unlock, startMusic, setSoundSettings } from './game/sound.js';
import { clockOf } from './game/clock.js';
import { LocalStore } from './net/store.js';

const $screen = document.getElementById('screen');
const $gameRoot = document.getElementById('game-root');
const $canvas = document.getElementById('game');
const $hud = document.getElementById('hud-root');

const settings = Slots.loadSettings();
setSoundSettings(settings);
const saveSettings = s => { Slots.saveSettings(s); setSoundSettings(s); };
let session = null;

const MAX_PLAYERS = 4;
// 서버가 없으면(개발용 ?net=local) 같은 브라우저의 로컬 세계에 참가한다
const joinMode = () => (firebase ? 'online' : 'local');

function setUrlWorld(code) {
  const q = new URLSearchParams(location.search);
  if (code) q.set('w', code); else q.delete('w');
  const s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? `?${s}` : ''));
}
const inviteLink = code => {
  const q = new URLSearchParams();
  q.set('w', code);
  if (new URLSearchParams(location.search).get('net') === 'local') q.set('net', 'local');
  return `${location.origin}${location.pathname}?${q}`;
};

async function lookupWorld(code) {
  if (!firebase && !LocalStore.exists(code)) return { error: '온라인 서버 설정이 없어 친구 세계에 참가할 수 없어요.' };
  let store;
  try {
    store = joinMode() === 'online' ? new FireStore(code) : new LocalStore(code);
    await store.ready();
    const meta = await store.get('meta');
    if (!meta) return { error: '그런 세계를 찾을 수 없어요. 코드를 확인해 주세요.' };
    const pubs = (await store.get('pub')) || {};
    const members = Object.values(pubs).map(p => p?.n).filter(Boolean);
    return { code, name: meta.name, members, full: members.length >= MAX_PLAYERS, day: clockOf(Date.now(), meta.createdAt).day };
  } catch (err) {
    return { error: explain(err) };
  } finally { store?.close(); }
}

async function openWorld(code, mode) {
  try { return { store: await openStore(code, mode) }; } catch (err) { return { error: explain(err) }; }
}

const screens = new Screens($screen, {
  firebase: false,
  settings,
  saveSettings,
  lookupWorld,
  onUnlock: () => { unlock(); startMusic(); },
  onDeleteSlot: i => {
    const s = Slots.listSlots()[i];
    if (s?.mode === 'local') LocalStore.remove(s.code);
    Slots.clearSlot(i);
  },
  async onContinue(i) {
    const s = Slots.listSlots()[i];
    if (!s) return screens.menu();
    screens.loading(`${s.world || ''} 불러오는 중…`);
    const { store, error } = await openWorld(s.code, s.mode);
    if (error) return screens.menu(error);
    let me = null;
    try {
      const raw = await store.get(`players/${s.pid}`);
      me = raw ? JSON.parse(raw) : null;
    } catch { me = null; }
    if (!me && s.me) {
      // 서버에서 캐릭터가 사라졌다면 이 기기의 백업으로 되살린다
      try { me = JSON.parse(s.me); await store.set(`players/${s.pid}`, s.me); } catch { me = null; }
    }
    if (!me) { store.close(); return screens.menu('캐릭터를 찾을 수 없어요.'); }
    startGame(i, store, s.code, s.pid, me);
  },
  async onNew(slot, data) {
    const code = makeCode();
    const { store, error } = await openWorld(code, data.mode);
    if (error) return error;
    const pid = makeId();
    const now = Date.now();
    await store.set('meta', { name: data.world, createdAt: now, lastActive: now, owner: pid, v: 1 });
    const me = createPlayer({ id: pid, name: data.name, job: data.job, look: data.look }, now);
    await store.set(`players/${pid}`, JSON.stringify(me));
    Slots.saveSlot(slot, { code, pid, mode: data.mode, name: me.name, job: me.job, look: me.look, world: data.world, me: JSON.stringify(me) });
    startGame(slot, store, code, pid, me);
    return null;
  },
  async onJoin(code, slot, data) {
    const { store, error } = await openWorld(code, joinMode());
    if (error) return error;
    const pubs = (await store.get('pub')) || {};
    if (Object.keys(pubs).length >= MAX_PLAYERS) { store.close(); return '이 세계는 이미 4명이 가득 찼어요.'; }
    const meta = await store.get('meta');
    const pid = makeId();
    const me = createPlayer({ id: pid, name: data.name, job: data.job, look: data.look });
    await store.set(`players/${pid}`, JSON.stringify(me));
    Slots.saveSlot(slot, { code, pid, mode: joinMode(), name: me.name, job: me.job, look: me.look, world: meta?.name || code, me: JSON.stringify(me) });
    startGame(slot, store, code, pid, me);
    return null;
  },
});

// ── 게임 시작 · 종료 ─────────────────────────────────────────────────────────
async function startGame(slotIndex, store, code, pid, me) {
  screens.stop();
  $screen.hidden = true;
  $gameRoot.hidden = false;
  setUrlWorld(code);
  const renderer = new Renderer($canvas);
  const ui = new UI($hud, { settings, saveSettings, onExit: () => exitGame(), inviteLink: () => inviteLink(code), onSettings: s => setSoundSettings(s) });
  const game = new Game({ store, code, pid, me, ui, settings, slotIndex });
  ui.attach(game);
  ui.renderer = renderer; // 알림 위치를 캐릭터 반대쪽에 두려고
  let backupAt = 0;
  ui.onBackup = m => {
    if (Date.now() - backupAt < 5000) return;
    backupAt = Date.now();
    Slots.saveSlot(slotIndex, { name: m.name, job: m.job, look: m.look, world: game.meta?.name, me: JSON.stringify(m) });
  };
  const input = new Input({
    canvas: $canvas, game, renderer, settings, joyEl: $hud.querySelector('#joy'),
    onKey: (k, e) => {
      if (ui.panel) { if (k === 'Escape') { ui.close(); return true; } return false; }
      if (k === ' ' || k === 'e' || k === 'Enter') { game.action_(); return true; }
      if (k === 'i' || k === 'b') { ui.open('bag'); return true; }
      if (k === 'c') { ui.open('char'); return true; }
      if (k === 't') { ui.open('teleport'); return true; }
      if (k === 'h') { ui.open('house'); return true; }
      if (k === 'Escape' || k === 'm') { if (game.decor) game.stopDecor(); else ui.open('menu'); return true; }
      if (/^[1-8]$/.test(k)) { game.select(Number(k) - 1); return true; }
      void e;
      return false;
    },
  });
  session = { game, renderer, input, ui, raf: 0 };
  if (new URLSearchParams(location.search).has('debug')) window.__hh = session; // 자동 테스트용
  renderer.resize();
  try {
    await game.start();
  } catch (err) {
    console.error(err);
    exitGame(explain(err));
    return;
  }
  let last = performance.now();
  const frame = t => {
    if (!session || session.game !== game) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    try {
      game.update(dt);
      renderer.draw(game, dt);
      ui.frame();
    } catch (err) { console.error(err); }
    session.raf = requestAnimationFrame(frame);
  };
  session.raf = requestAnimationFrame(frame);
  addEventListener('beforeunload', () => game.saveNow(), { once: true });
}

function exitGame(msg = '') {
  const s = session;
  session = null;
  if (s) {
    cancelAnimationFrame(s.raf);
    s.game.stop();
    s.input.destroy();
    s.ui.close();
    $hud.innerHTML = '';
  }
  setUrlWorld(null);
  $gameRoot.hidden = true;
  $screen.hidden = false;
  screens.menu(msg);
}

// ── 부팅 ─────────────────────────────────────────────────────────────────────
let firebase = false;
(async () => {
  firebase = await firebaseAvailable();
  screens.h.firebase = firebase;
  const code = normCode(new URLSearchParams(location.search).get('w'));
  if (code) {
    const i = Slots.findSlotByWorld(code);
    screens.intro();
    // 초대 링크: 이미 이 세계에 캐릭터가 있으면 바로 이어하고, 없으면 참가 화면으로
    const go = async () => {
      if (i >= 0) return screens.h.onContinue(i);
      screens.loading('세계를 찾는 중…');
      const r = await lookupWorld(code);
      if (r.error) screens.joinCode(code, r.error);
      else screens.joinInfo(r);
    };
    $screen.querySelector('#ts')?.addEventListener('pointerdown', () => setTimeout(go, 0), { once: true });
  } else screens.intro();
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // 홈 화면에 추가했을 때 오프라인에서도 열리도록 (실패해도 게임에는 영향 없음)
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
