// 플레이 통계 (배포판만) — 유저 테스트용: 리텐션 · 접속 시간 · 세션 · 화면별 체류 · 이탈 화면 · 모드별 판 수 · 첫 경험 단계.
//
// 이 기기에 하루 단위로 모아 두었다가(localStorage) 1분마다 · 앱을 내릴 때 서버 tele/<로그인 번호> 에 덮어쓴다 (같은 기기 = 같은 번호).
// 개인 식별 정보는 없다 (익명 로그인 번호 · 앱 버전 · 언어 · 기기 종류 · 플레이 수치만). 설정 → 사용 통계 보내기 로 끌 수 있다.
// 같은 이벤트는 Google Analytics(live.js track)에도 간다 — Firebase 콘솔 → Analytics 에서 리텐션 · 참여 시간을 바로 볼 수 있다.
// 모아 본 결과는 배포판 ?stats (관리자만 · stats.js).
//
// 서버에 쓰는 모양 (database.rules.json tele):
//   p  { first, ver, lang, plat, dev, tz }                 처음 연 시각 · 마지막 버전 등
//   d/<날짜(한국 자정 기준 일 번호)>  { s 세션 수, ms 플레이 시간(실제로 만지고 있던 시간), sl [세션별 플레이 시간], st {화면: 머문 ms},
//                                     gs {모드: 시작 판}, ge {모드: 끝낸 판}, w {모드: 이긴 판}, ev {이벤트: 횟수} }
//   m  { 이정표: 처음 이룬 시각 }  (tutorial_begin · tutorial_complete · game_start_versus · run_start · run_win …)
//   x  { 화면: 앱을 내린 횟수 }   마지막으로 보던 화면 = 이탈 지점
import { PROD, fireApp, myUid, signIn } from './fire.js';
import { dayOf } from './wallet-rules.js';

const KEY = 'diceheroes.tele';
const IDLE_MS = 60 * 1000;          // 1분 넘게 아무것도 안 만지면 플레이 시간에 넣지 않는다
const NEW_SESSION_MS = 30 * 60 * 1000;   // 30분 넘게 내려 두었다 돌아오면 새 세션
const TICK = 5000, FLUSH_MS = 60 * 1000;
// 처음 한 번 이룬 시각을 남길 이벤트 (첫 경험 깔때기)
const MILESTONE = new Set(['tutorial_begin', 'tutorial_complete', 'game_start', 'game_end', 'run_start', 'run_end', 'run_win', 'coop_win', 'versus_win',
  'room_create', 'room_join', 'daily_claim', 'shop_buy', 'ticket_popup', 'ticket_ad', 'ach_claim', 'lang_change']);

let T = null, on = false, screenOf = () => 'unknown', ver = '', lang = '';
let lastInput = Date.now(), hiddenAt = 0, sess = null, dirty = new Set(), lastFlush = 0, timer = 0;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch { /* 저장 불가 */ } };
const today = () => dayOf(Date.now());
function dayRec(d = today()) {
  const r = (T.d[d] ||= { s: 0, ms: 0, sl: [], st: {}, gs: {}, ge: {}, w: {}, ev: {} });
  dirty.add(d);
  return r;
}
const plat = () => (matchMedia?.('(display-mode: standalone)').matches ? (document.referrer.startsWith('android-app://') ? 'twa' : 'pwa') : 'web');
const dev = () => { const u = navigator.userAgent || ''; return /android/i.test(u) ? 'android' : /iphone|ipad|ipod/i.test(u) ? 'ios' : /mobile/i.test(u) ? 'mobile' : 'desktop'; };
// 유럽(동의가 필요한 곳)은 기본 꺼짐 — 시간대로 어림한다
export const defaultOn = () => { try { return !/^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch { return true; } };

function newSession() {
  const d = today(), r = dayRec(d);
  r.s++;
  r.sl.push(0);
  if (r.sl.length > 40) r.sl.shift();
  sess = { d, i: r.sl.length - 1 };
}

// 앱이 켜질 때 한 번. screen: 지금 화면 이름을 돌려주는 함수
export function initTelemetry({ enabled, version, language, screen }) {
  ver = version; lang = language; screenOf = screen || screenOf;
  T = load() || { p: { first: Date.now() }, d: {}, m: {}, x: {} };
  T.p.ver = ver; T.p.lang = lang; T.p.plat = plat(); T.p.dev = dev();
  try { T.p.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* 없음 */ }
  // 오래된 날짜는 이 기기에서 지운다 (서버엔 남아 있다)
  const keep = today() - 60;
  for (const k of Object.keys(T.d)) if (Number(k) < keep) delete T.d[k];
  setTelemetry(enabled);
  newSession();
  save();
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      const sc = screenOf();
      T.x[sc] = (T.x[sc] || 0) + 1;      // 이 화면에서 앱을 내렸다
      dirty.add('x');
      save(); flush(true);
    } else {
      if (hiddenAt && Date.now() - hiddenAt > NEW_SESSION_MS) newSession();
      hiddenAt = 0; lastInput = Date.now();
    }
  });
  addEventListener('pagehide', () => { save(); flush(true); });
  clearInterval(timer);
  timer = setInterval(tick, TICK);
}

// 5초마다: 화면이 보이고 최근 1분 안에 만졌으면 플레이 시간 · 그 화면 체류 시간에 더한다
function tick() {
  if (!T || document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE_MS) return;
  if (sess?.d !== today()) newSession();     // 자정을 넘기면 새 날짜의 세션으로
  const r = dayRec();
  r.ms += TICK;
  r.sl[sess.i] = (r.sl[sess.i] || 0) + TICK;
  const sc = screenOf();
  r.st[sc] = (r.st[sc] || 0) + TICK;
  if (Date.now() - lastFlush > FLUSH_MS) { save(); flush(); }
}

// 게임 안 이벤트 (live.js track 이 부른다)
export function noteEvent(name, params = {}) {
  if (!T) return;
  const r = dayRec();
  r.ev[name] = (r.ev[name] || 0) + 1;
  const mode = params.mode || (name.startsWith('run_') ? 'run' : null);
  if (name === 'game_start' || name === 'run_start') { const k = params.tutorial ? 'tutorial' : params.classic ? 'classic' : mode; r.gs[k] = (r.gs[k] || 0) + 1; mile(`${name}_${k}`); }
  if (name === 'game_end' || name === 'run_end') {
    const k = params.classic ? 'classic' : mode;
    r.ge[k] = (r.ge[k] || 0) + 1;
    if (params.win || params.won) { r.w[k] = (r.w[k] || 0) + 1; mile(`${k}_win`); }
  }
  if (MILESTONE.has(name)) mile(name);
  save();
}
function mile(k) { if (!T.m[k]) { T.m[k] = Date.now(); dirty.add('m'); } }

// 끄면 더 보내지 않는다 (이미 보낸 것은 그대로)
export function setTelemetry(v) { on = !!v && PROD; }

async function flush(force = false) {
  if (!on || !T || (!dirty.size && !force)) return;
  lastFlush = Date.now();
  try {
    await signIn();
    const uid = myUid();
    if (!uid) return;
    const { fb, app } = await fireApp();
    const db = fb.getDatabase(app);
    const up = { p: T.p, m: T.m, x: T.x };
    for (const k of dirty) if (T.d[k]) up[`d/${k}`] = T.d[k];
    if (sess && T.d[sess.d]) up[`d/${sess.d}`] = T.d[sess.d];
    dirty = new Set();
    await fb.update(fb.ref(db, `tele/${uid}`), up);
  } catch (err) { console.warn('[tele]', err?.message || err); }
}
