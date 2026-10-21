// 원정 기록 · 별조각 · 원정 준비 저장소
//
// 배포판: 보석 지갑과 같은 서버 지갑(wallets/<로그인 번호>/run)에 둔다. 앱은 읽기만 하고(보안 규칙이 쓰기를 막는다),
//         바꾸는 일은 모두 서버 함수가 한다 (dice-heroes-prod/functions — xStart · xFinish · xBuy · xEquip).
//         · 원정 시작: 서버가 시드를 정하고 그때의 원정 준비를 적어 둔다
//         · 원정 끝: 앱은 행동 기록만 보낸다. 서버가 같은 규칙(run/rules.js)으로 판을 처음부터 다시 돌려
//           승패 · 층 · 도전과제 · 별조각을 직접 계산한다 → 기기 저장값이나 메모리를 고쳐도(치트 엔진 등) 소용없다
//         · 인터넷이 없을 때 시작한 원정은 별조각 · 기록 없이 즐기기만 한다
// 테스트판: 서버 함수가 없으니 이 기기(localStorage)에 둔다. 규칙은 같은 함수(recordRun · buyProgress).
import { PROD, callServer } from '../fire.js';
import * as Run from './rules.js';
import { syncRunAch, reloadWallet } from '../wallet.js';

const LOCAL = 'diceheroes.runBest';
let store = null;
let P = null;                      // 지금 기록 (서버 사본 또는 기기 저장)
export const syncAch = () => syncRunAch(progress());
// 기기 저장을 다시 읽는다 (테스트판 잠금 되돌리기 뒤)
export function reload() { if (!PROD) P = null; }
export function initProgress(s) { store = s; syncRunAch(progress()); }   // 예전 원정 기록도 도전과제에 옮긴다

// 예전 기기 저장 모양 { runs, wins, top, cls, asc, feats, meta: { stars, lv, dice, equip } } → 지금 모양
function migrate(o) {
  if (!o) return Run.blankProgress();
  if (o.best) return Run.fixProgress(o);
  const m = o.meta || {};
  return Run.fixProgress({ stars: m.stars, lv: m.lv, dice: m.dice, equip: m.equip,
    best: { runs: o.runs, wins: o.wins, top: o.top, cls: o.cls, asc: o.asc, feats: o.feats } });
}
const saveLocal = () => { if (!PROD) store.set(LOCAL, P); };

// 화면용 사본 (동기). 배포판은 마지막으로 받은 서버 사본
export function progress() {
  if (!P) P = PROD ? Run.blankProgress() : migrate(store.get(LOCAL));
  return P;
}
// 배포판: 서버에서 새로 받는다
export async function refresh() {
  if (!PROD) return progress();
  try { P = Run.fixProgress((await callServer('xProgress')).run); } catch (e) { console.warn('[run progress]', e); }
  return progress();
}

// 원정 시작: { seed, meta, id } — 배포판은 서버가 시드를 정한다 (실패하면 기록 없는 원정)
export async function startRun(cls, asc) {
  if (!PROD) return { seed: (Math.random() * 2 ** 32) >>> 0, meta: Run.progressMeta(progress()), id: null };
  try {
    const r = await callServer('xStart', { cls, asc });
    return { seed: r.seed, meta: r.meta, id: r.id };
  } catch (e) {
    console.warn('[run start]', e);
    return { seed: (Math.random() * 2 ** 32) >>> 0, meta: Run.progressMeta(progress()), id: null, offline: true };
  }
}

// 원정 끝: { stars, won, opened, fresh } — 배포판은 서버가 행동 기록을 다시 돌려 계산한다
export async function finishRun(R) {
  if (R.trial) return { stars: 0, won: !!R.won, opened: false, fresh: [], trial: true };   // 시험 원정은 기록 · 별조각에 넣지 않는다
  if (!PROD) { const out = Run.recordRun(progress(), R); saveLocal(); syncRunAch(progress()); return out; }
  if (!R.xid) return { stars: 0, won: !!R.won, opened: false, fresh: [], offline: true };
  try {
    const r = await callServer('xFinish', { id: R.xid, acts: R.acts || [] });
    P = Run.fixProgress(r.run);
    if (r.gems > 0) reloadWallet().catch(() => {});   // 광대 보상 보석이 들어간 지갑을 다시 받는다
    return { stars: r.stars, won: r.won, opened: r.opened, fresh: r.fresh || [], gems: r.gems || 0 };
  } catch (e) {
    console.warn('[run finish]', e);
    return { stars: 0, won: !!R.won, opened: false, fresh: [], error: String(e?.message || e) };
  }
}

// 원정 준비: 강화 사기. 실패하면 이유 문자열을 던진다
export async function buy(kind, id) {
  if (!PROD) { const why = Run.buyProgress(progress(), kind, id); if (why) throw new Error(why); saveLocal(); return progress(); }
  P = Run.fixProgress((await callServer('xBuy', { kind, id })).run);
  return P;
}
