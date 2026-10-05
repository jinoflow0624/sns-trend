// 보석 지갑 — 대전·보스전에서 벌어서 직업·주사위 스킨·트레이 스킨을 산다.
//
// 배포판: 지갑은 서버(Firebase DB wallets/<로그인 번호>)에 있고, 보석을 늘리거나 줄이는 일은 모두 서버 함수
//         (dice-heroes-prod/functions — 정산 · 구매)가 한다. 앱은 읽기만 한다 (보안 규칙이 쓰기를 막는다).
//         · 온라인 방 판은 서버가 방의 게임 기록을 직접 읽어 승패·점수를 확인한다
//         · 오프라인 봇전은 판 시작을 서버에 기록해 두고(startRun), 1분 안에 끝난 판 · 하루 15판 넘는 판은 보상이 없다
//         · 대전 승리 보상 하루 3회, 날짜는 서버 시간 (폰 시계를 돌려도 소용없음)
// 테스트판: 이 기기에만 둔다 (localStorage). 날짜는 역시 서버 시간으로 센다.
//
// 보석은 인터넷이 연결돼 있을 때만 받는다 (오프라인 판은 보석 없음).
// 가격 · 보상 규칙은 wallet-rules.js (서버와 같은 파일)
import { PROD, fireApp, myUid, callServer } from './fire.js';
import * as R from './wallet-rules.js';
import * as AC from './achievements.js';

export * from './wallet-rules.js';

// ── 서버 시간 ─────────────────────────────────────────────────────────────────
let offset = null;
export const serverNow = () => Date.now() + (offset || 0);
export const today = () => R.dayOf(serverNow());

// ── 저장소 ───────────────────────────────────────────────────────────────────
const LOCAL = 'diceheroes.wallet';
const blank = () => ({ gems: R.STARTER_GEMS, vs: { day: 0, n: 0 }, owned: {}, clears: {}, granted: true });
let W = null;          // 지금 지갑 (화면 표시용 사본)
let db = null, fb = null, ready = null;
const listeners = new Set();
export const onWallet = cb => { listeners.add(cb); return () => listeners.delete(cb); };
const emit = () => listeners.forEach(cb => { try { cb(W); } catch { /* 무시 */ } });

function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL)); } catch { return null; } }
function writeLocal(w) { try { localStorage.setItem(LOCAL, JSON.stringify(w)); } catch { /* 무시 */ } }
function set(w) { W = fix(w); writeLocal(W); emit(); return W; }

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
      const r = await callServer('wallet');
      offset = r.now - Date.now();
      return set(r.wallet);
    }
    return set(W || blank());
  })().catch(err => { ready = null; console.warn('[wallet]', err); W ||= readLocal(); throw err; });
  return ready;
}
function fix(w) {
  w.owned ||= {};
  w.clears ||= {};
  w.vs ||= { day: 0, n: 0 };
  if (w.vs.day !== today()) w.vs = { day: today(), n: 0 };
  return w;
}

// 계정이 바뀌면(구글 계정으로 바꿔 들어감) 지갑을 새로 불러온다
export function reloadWallet() { ready = null; return loadWallet(); }

export const wallet = () => W;
export const gems = () => W?.gems ?? 0;
export const vsLeftToday = () => (W ? Math.max(0, R.VS_DAILY - (W.vs.day === today() ? W.vs.n : 0)) : R.VS_DAILY);
// 기본으로 열린 것: 도박사 · 수도승 · 기본 주사위 · 기본 트레이 (가격표에 없는 것)
export function owns(kind, id) {
  if (!R.priceOf(kind, id)) return true;
  return !!W?.owned?.[kind]?.[id];
}

// 서버 함수 오류를 한 줄 안내로
const why = err => (!navigator.onLine ? '인터넷 연결이 필요해요.' : err?.message?.replace(/^.*?:\s*/, '') || '서버 오류');

// 테스트판: 이 기기 사본을 바꾼다 (mutate 가 문자열을 돌려주면 그 이유로 취소)
function changeLocal(mutate) {
  const next = fix(structuredClone(W || blank()));
  const r = mutate(next);
  if (typeof r === 'string') return { ok: false, why: r };
  set(next);
  return { ok: true, out: r };
}

// 일일 보상: 오늘(서버 시간 · 한국 자정 기준) 아직 안 받았나
export const dailyGemsOf = dice => R.dailyGems(dice);
export const DAILY_YACHT_MUL = R.DAILY_YACHT_MUL;
export const dailyReady = () => !!W && W.bonus?.day !== today();
// 일일 보상 받기 — 배포판은 서버가 주사위를 굴린다
export async function claimDaily() {
  try { await loadWallet(); } catch { return { ok: false, why: '인터넷 연결이 필요해요.' }; }
  if (PROD) {
    try {
      const r = await callServer('dailyRoll');
      set(r.wallet);
      return { ok: true, dice: r.dice, ...R.dailyGems(r.dice) };
    } catch (err) { return { ok: false, why: why(err) }; }
  }
  const r = changeLocal(w => {
    if (w.bonus?.day === today()) return '오늘 보상은 이미 받았어요. 내일 다시 와 주세요!';
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
    const out = R.dailyGems(dice);
    w.gems += out.gems;
    w.bonus = { day: today(), dice };
    return { dice, ...out };
  });
  return r.ok ? { ok: true, ...r.out } : r;
}

// 내 데이터 지우기: 서버의 지갑도 지운다
export async function deleteWallet() {
  try { localStorage.removeItem(LOCAL); } catch { /* 무시 */ }
  if (!PROD) return;
  await loadWallet().catch(() => {});
  if (fb && db && myUid()) await fb.remove(fb.ref(db, `wallets/${myUid()}`));
}

// 사기
export async function buy(kind, id) {
  await loadWallet();
  if (PROD) {
    try { set((await callServer('buy', { kind, id })).wallet); return { ok: true }; }
    catch (err) { return { ok: false, why: why(err) }; }
  }
  const price = R.priceOf(kind, id);
  return changeLocal(w => {
    if (w.owned?.[kind]?.[id]) return '이미 가지고 있어요.';
    if (w.gems < price) return `보석이 ${price - w.gems}개 모자라요.`;
    w.gems -= price;
    (w.owned[kind] ||= {})[id] = true;
  });
}

// 한 판 시작: 배포판은 서버에 시작 시각을 남긴다 (오프라인 판 정산에 필요). 온라인 방 판은 방 기록으로 확인하니 필요 없다
let run = null;
export function beginRun({ mode, boss = null, diff = null }) {
  run = null;
  if (!PROD || !navigator.onLine) return;
  const me = run = { rid: null };
  callServer('startRun', { mode, boss, diff }).then(r => { me.rid = r.rid; }, err => console.warn('[startRun]', err));
}

// 한 판 보상 받기. info: { mode, win, online, room, humans, score, flip, nudge, boss, diff }
export async function earn(info) {
  if (!navigator.onLine) return { ok: false, offline: true, parts: [], total: 0 };
  try { await loadWallet(); } catch { return { ok: false, offline: true, parts: [], total: 0 }; }
  if (PROD) {
    const rid = run?.rid;
    run = null;
    if (!info.room && !rid) return { ok: false, why: '판 시작 기록이 없어요 (시작할 때 인터넷이 끊겼거나 이어하기한 판).', parts: [], total: 0 };
    try {
      const r = await callServer('claimRun', info.room ? { room: info.room } : { rid, win: info.win, score: info.score, flip: info.flip, nudge: info.nudge, st: info.st });
      set(r.wallet);
      if (r.capped) return { ok: false, why: `오프라인 판 보상은 하루 ${R.UNVERIFIED_DAILY}판까지예요.`, parts: [], total: 0 };
      return { ok: true, parts: r.parts, total: r.total };
    } catch (err) { return { ok: false, why: why(err), parts: [], total: 0 }; }
  }
  const r = changeLocal(w => {
    const key = info.mode === 'coop' ? `${info.boss}:${info.diff}` : null;
    const result = R.rewardFor({ ...info, firstClear: !!(key && info.win && !w.clears[key]), vsLeft: Math.max(0, R.VS_DAILY - w.vs.n) });
    w.gems += result.total;
    if (result.parts.some(p => p.vs)) w.vs.n++;
    if (key && info.win) w.clears[key] = true;
    if (info.st) AC.mergeAch(w, info.st);
    return result;
  });
  return { ok: true, ...r.out };
}

// ── 도전과제 ──
export const ach = () => W?.ach || null;
export const achClaimable = () => AC.achClaimable(W?.ach);
export async function claimAch(id) {
  try { await loadWallet(); } catch { return { ok: false, why: '인터넷 연결이 필요해요.' }; }
  if (PROD) {
    try { const r = await callServer('claimAch', { id }); set(r.wallet); return { ok: true, gems: r.gems }; }
    catch (err) { return { ok: false, why: why(err) }; }
  }
  const a = AC.achInfo(id);
  const r = changeLocal(w => {
    w.ach ||= {}; w.ach.got ||= {};
    if (!a) return '없는 도전과제예요.';
    if (w.ach.got[id]) return '이미 받은 보상이에요.';
    if (!AC.achDone(a, w.ach)) return '아직 달성하지 못했어요.';
    w.gems += AC.achGems(a);
    w.ach.got[id] = Date.now();
    return { gems: AC.achGems(a) };
  });
  return r.ok ? { ok: true, ...r.out } : r;
}
