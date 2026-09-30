// 보석 지갑 — 대전·보스전에서 벌어서 직업·주사위 스킨·트레이 스킨을 산다.
//
// 배포판: 서버(Firebase DB wallets/<로그인 번호>)에 둔다. 보안 규칙(dice-heroes-prod/database.rules.json)이
//         서버 시간으로 '오늘' 을 확인하고, 대전 승리 보상은 하루 3회까지만 받게 막는다 (폰 시계를 돌려도 소용없음).
// 테스트판: 이 기기에만 둔다 (localStorage). 날짜는 역시 서버 시간으로 센다.
//
// 보석은 인터넷이 연결돼 있을 때만 받는다 (오프라인 판은 보석 없음).
// 출시 전에는 Firebase Blaze 요금제로 올려 서버(Cloud Functions)가 보상을 계산하게 바꾼다 — 그 전까지는
// 앱을 뜯어고치는 수준의 조작까지는 막지 못한다 (시계 조작·하루 제한은 막는다).
import { PROD, fireApp, signIn, myUid } from './fire.js';

// ── 가격 · 보상 ───────────────────────────────────────────────────────────────
export const STARTER_GEMS = 30000;           // 지금은 모든 사용자에게 기본 지급 (테스트 기간)
// 직업: 봇 1대1 승률이 높을수록 비싸게 (마법사 58% · 음유시인 51% · 전사 50% · 도적 45%). 도박사·수도승은 무료
export const CLASS_PRICE = { rogue: 600, warrior: 900, bard: 1000, mage: 1500, dancer: 1500 };
export const DICE_PRICE = { openheart: 1500, cosmic: 1500, gold: 1200, clear: 1000, heart: 1000, keycap: 1000, black: 900, minimal: 800 };
export const TRAY_PRICE = { demon: 1000, lava: 1000, starry: 1000, royal: 800, deepsea: 800, sakura: 700 };
export const PRICE = { cls: CLASS_PRICE, dice: DICE_PRICE, tray: TRAY_PRICE };
export const priceOf = (kind, id) => PRICE[kind]?.[id] || 0;

export const VS_WIN = 100, VS_WIN_BOT = 30, VS_DAILY = 3;
export const BOSS_WIN = [30, 50, 80];                 // 쉬움 · 보통 · 어려움
export const BOSS_MUL = { demon: 1.2 };               // 마왕은 1.2배
export const FIRST_CLEAR_MUL = 3;                     // 보스 · 난이도별 첫 클리어는 3배
export const SCORE_PER_100 = 5;                       // 최종 점수 백의 자리 × 5 (져도)
export const LEFTOVER_PER_3 = 10;                     // 대전: 남은 뒤집기+조정 3개마다 10

// 한 판 끝났을 때 받을 보석 (내용별로). info: { mode, win, online, humans, score, flip, nudge, boss, diff, firstClear, vsLeft }
export function rewardFor(info) {
  const parts = [];
  if (info.mode === 'versus') {
    if (info.win) {
      const vsHuman = info.online && info.humans > 1;
      if (info.vsLeft > 0) parts.push({ id: 'win', ko: vsHuman ? '대전 승리' : '대전 승리 (봇 상대)', gems: vsHuman ? VS_WIN : VS_WIN_BOT, vs: true });
      else parts.push({ id: 'win', ko: `대전 승리 (오늘 ${VS_DAILY}회 다 받음)`, gems: 0, vs: false });
    }
    const left = Math.floor(((info.flip || 0) + (info.nudge || 0)) / 3) * LEFTOVER_PER_3;
    if (left) parts.push({ id: 'left', ko: `남은 기술 ${(info.flip || 0) + (info.nudge || 0)}개`, gems: left });
  } else if (info.win) {
    const base = Math.round(BOSS_WIN[info.diff] * (BOSS_MUL[info.boss] || 1));
    parts.push({ id: 'boss', ko: info.firstClear ? '보스 토벌 (첫 클리어 ×3)' : '보스 토벌', gems: base * (info.firstClear ? FIRST_CLEAR_MUL : 1) });
  }
  const sc = Math.floor(Math.max(0, info.score) / 100) * SCORE_PER_100;
  if (sc) parts.push({ id: 'score', ko: `점수 ${info.score}`, gems: sc });
  return { parts, total: parts.reduce((a, p) => a + p.gems, 0) };
}

// ── 서버 시간 ─────────────────────────────────────────────────────────────────
// 오늘 = 한국 시간 자정 기준 날짜 번호. 서버 시간과의 차이(.info/serverTimeOffset)로 계산한다.
const KST = 9 * 3600 * 1000, DAY = 86400000;
let offset = null;
export const serverNow = () => Date.now() + (offset || 0);
export const today = () => Math.floor((serverNow() + KST) / DAY);

// ── 저장소 ───────────────────────────────────────────────────────────────────
const LOCAL = 'diceheroes.wallet';
const blank = () => ({ gems: STARTER_GEMS, vs: { day: 0, n: 0 }, owned: {}, granted: true });
let W = null;          // 지금 지갑 (화면 표시용 사본)
let db = null, fb = null, ready = null;
const listeners = new Set();
export const onWallet = cb => { listeners.add(cb); return () => listeners.delete(cb); };
const emit = () => listeners.forEach(cb => { try { cb(W); } catch { /* 무시 */ } });

function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL)); } catch { return null; } }
function writeLocal(w) { try { localStorage.setItem(LOCAL, JSON.stringify(w)); } catch { /* 무시 */ } }

// 서버(또는 이 기기)에서 지갑을 불러온다. 처음이면 기본 보석을 넣어 만든다
export function loadWallet() {
  ready ||= (async () => {
    W = readLocal();                            // 먼저 기기 사본으로 화면을 그린다
    emit();
    const app = await fireApp();
    fb = app.fb;
    db = fb.getDatabase(app.app);
    if (app.emu) { const [h, p] = app.emu.split(':'); try { fb.connectDatabaseEmulator(db, h, Number(p)); } catch { /* 이미 연결 */ } }
    await new Promise(res => {
      const stop = fb.onValue(fb.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; res(); });
      setTimeout(res, 4000);
      setTimeout(() => stop?.(), 5000);
    });
    if (PROD) {
      await signIn();
      const ref = fb.ref(db, `wallets/${myUid()}`);
      const res = await fb.runTransaction(ref, cur => cur || { ...blank(), vs: { day: today(), n: 0 }, t: serverNow() });
      W = res.snapshot.val();
    } else {
      W = W || blank();
    }
    fix(W);
    writeLocal(W);
    emit();
    return W;
  })().catch(err => { ready = null; console.warn('[wallet]', err); W ||= readLocal(); throw err; });
  return ready;
}
function fix(w) {
  w.owned ||= {};
  w.vs ||= { day: 0, n: 0 };
  if (w.vs.day !== today()) w.vs = { day: today(), n: 0 };
  return w;
}

// 계정이 바뀌면(구글 계정으로 바꿔 들어감) 지갑을 새로 불러온다
export function reloadWallet() { ready = null; return loadWallet(); }

export const wallet = () => W;
export const gems = () => W?.gems ?? 0;
export const vsLeftToday = () => (W ? Math.max(0, VS_DAILY - (W.vs.day === today() ? W.vs.n : 0)) : VS_DAILY);
// 기본으로 열린 것: 도박사 · 수도승 · 기본 주사위 · 기본 트레이 (가격표에 없는 것)
export function owns(kind, id) {
  if (!priceOf(kind, id)) return true;
  return !!W?.owned?.[kind]?.[id];
}

// 서버와 기기 사본에 같은 변경을 적용한다 (서버가 거절하면 기기 사본도 되돌린다)
async function change(mutate) {
  await loadWallet();
  if (PROD) {
    const ref = fb.ref(db, `wallets/${myUid()}`);
    let why = null;
    const res = await fb.runTransaction(ref, cur => {
      if (!cur) return cur;
      const next = fix(structuredClone(cur));
      why = mutate(next);
      if (why) return;                          // 취소 (보석 부족 등)
      next.t = serverNow();
      return next;
    });
    if (why) return { ok: false, why };
    if (!res.committed) return { ok: false, why: '서버에 저장하지 못했어요. 잠시 뒤 다시 해 주세요.' };
    W = fix(res.snapshot.val());
  } else {
    const next = fix(structuredClone(W));
    const why = mutate(next);
    if (why) return { ok: false, why };
    W = next;
  }
  writeLocal(W);
  emit();
  return { ok: true };
}

// 내 데이터 지우기: 서버의 지갑도 지운다
export async function deleteWallet() {
  try { localStorage.removeItem(LOCAL); } catch { /* 무시 */ }
  if (!PROD) return;
  await loadWallet().catch(() => {});
  if (fb && db && myUid()) await fb.remove(fb.ref(db, `wallets/${myUid()}`));
}

// 사기
export function buy(kind, id) {
  const price = priceOf(kind, id);
  return change(w => {
    if (w.owned?.[kind]?.[id]) return '이미 가지고 있어요.';
    if (w.gems < price) return `보석이 ${price - w.gems}개 모자라요.`;
    w.gems -= price;
    (w.owned[kind] ||= {})[id] = true;
  });
}

// 한 판 보상 받기. 대전 승리 보상은 오늘 받은 횟수를 서버 시간으로 세서 3회까지만
export async function earn(info) {
  if (!navigator.onLine) return { ok: false, offline: true, parts: [], total: 0 };
  try { await loadWallet(); } catch { return { ok: false, offline: true, parts: [], total: 0 }; }
  let result = null;
  const r = await change(w => {
    result = rewardFor({ ...info, vsLeft: Math.max(0, VS_DAILY - w.vs.n) });
    if (!result.total) return 'none';
    w.gems += result.total;
    if (result.parts.some(p => p.vs)) w.vs.n++;
  });
  if (!r.ok && r.why === 'none') return { ok: true, ...result };
  return r.ok ? { ok: true, ...result } : { ok: false, why: r.why, parts: [], total: 0 };
}
