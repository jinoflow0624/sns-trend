// 다이스 히어로즈 서버 — 보석 정산 · 구매 (Firebase Cloud Functions, Blaze 요금제)
//
// 앱은 지갑(wallets/<uid>)을 읽기만 하고, 보석을 늘리거나 줄이는 일은 모두 여기서 한다 (database.rules.json 이 막는다).
//   wallet    지갑을 불러온다 (없으면 기본 보석으로 만든다)
//   startRun  한 판 시작을 서버 시간으로 기록한다 → 정산 때 너무 빨리 끝난 판을 걸러낸다
//   claimRun  한 판 보상 정산
//             · 온라인 방 판: 방에 남은 게임 기록(rooms/DH-<코드>/state)을 서버가 직접 읽어 승패·점수·남은 기술을 확인한다
//             · 오프라인(봇전·한 기기) 판: 서버가 볼 수 없으니 시작 기록 + 최소 1분 + 하루 15판 + 점수 상한으로 막는다
//   buy       직업 · 주사위 · 트레이 사기
//
// 가격 · 보상 규칙은 게임과 같은 파일(dice-heroes/wallet-rules.js)을 build.mjs 가 shared/ 로 복사해 쓴다.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import * as R from './shared/wallet-rules.js';
import * as E from './shared/engine.js';

// 데이터베이스는 싱가포르(asia-southeast1) — 함수도 같은 곳에 둔다 (한국에서도 가깝다)
const DB_URL = 'https://diceheroes-4fbbb-default-rtdb.asia-southeast1.firebasedatabase.app';
initializeApp({ databaseURL: DB_URL });
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10, memory: '256MiB' });
const db = () => getDatabase();

const fail = (why, code = 'failed-precondition') => { throw new HttpsError(code, why); };
function needUser(req) {
  if (!req.auth?.uid) fail('로그인이 필요해요.', 'unauthenticated');
  return req.auth.uid;
}
const blank = now => ({ gems: R.STARTER_GEMS, vs: { day: R.dayOf(now), n: 0 }, owned: {}, clears: {}, daily: { day: R.dayOf(now), n: 0 }, granted: true, t: now });
// 날짜가 바뀌었으면 하루 횟수를 비운다
function fix(w, now) {
  w.owned ||= {}; w.clears ||= {};
  const today = R.dayOf(now);
  if (w.vs?.day !== today) w.vs = { day: today, n: 0 };
  if (w.daily?.day !== today) w.daily = { day: today, n: 0 };
  return w;
}
const view = w => ({ gems: w.gems, vs: w.vs, owned: w.owned || {}, clears: w.clears || {}, daily: w.daily });

// 지갑을 바꾼다. mutate 가 문자열을 돌려주면 그 이유로 취소
async function change(uid, mutate) {
  const now = Date.now();
  let why = null, out = null;
  const res = await db().ref(`wallets/${uid}`).transaction(cur => {
    why = null;
    const w = fix(cur ? structuredClone(cur) : blank(now), now);
    const r = mutate(w, now);
    if (typeof r === 'string') { why = r; return; }
    out = r;
    w.t = now;
    return w;
  });
  if (why) fail(why);
  if (!res.committed) fail('서버가 바빠 저장하지 못했어요. 잠시 뒤 다시 해 주세요.', 'aborted');
  return { wallet: view(res.snapshot.val()), out };
}

export const wallet = onCall(async req => {
  const uid = needUser(req);
  const { wallet } = await change(uid, () => null);
  return { wallet, now: Date.now() };
});

const BOSS_IDS = new Set(E.BOSSES.map(b => b.id));
export const startRun = onCall(async req => {
  const uid = needUser(req);
  const { mode, boss, diff } = req.data || {};
  if (mode !== 'versus' && mode !== 'coop') fail('모드가 이상해요.', 'invalid-argument');
  if (mode === 'coop' && (!BOSS_IDS.has(boss) || ![0, 1, 2].includes(diff))) fail('보스·난이도가 이상해요.', 'invalid-argument');
  const now = Date.now();
  const runs = db().ref(`runs/${uid}`);
  // 하루 지난 기록은 정리한다
  const old = await runs.orderByChild('t').endAt(now - 86400000).limitToFirst(20).get();
  const drop = {};
  old.forEach(c => { drop[c.key] = null; });
  if (Object.keys(drop).length) await runs.update(drop);
  const ref = runs.push();
  await ref.set({ mode, boss: mode === 'coop' ? boss : null, diff: mode === 'coop' ? diff : null, t: now });
  return { rid: ref.key };
});

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

// 온라인 방의 게임 기록으로 내 결과를 확인한다
async function fromRoom(uid, code) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(code)) fail('방 코드가 이상해요.', 'invalid-argument');
  const snap = await db().ref(`rooms/DH-${code}/state`).get();
  if (!snap.exists()) fail('방 기록을 찾지 못했어요.', 'not-found');
  let room;
  try { room = JSON.parse(snap.val()); } catch { fail('방 기록을 읽지 못했어요.'); }
  const g = room?.game;
  if (!g?.ended) fail('아직 끝나지 않은 판이에요.');
  const idx = g.players.findIndex(p => p.token === uid);
  if (idx < 0) fail('이 판의 참가자가 아니에요.', 'permission-denied');
  const me = g.players[idx];
  const score = E.finalScore(me);
  const coop = g.mode === 'coop';
  const top = E.ranking(g)[0];
  const win = coop ? !!g.boss?.won : top.i === idx || (top.total === score && g.forfeit !== idx);
  return {
    key: `${code}:${g.seed}`,
    info: { mode: coop ? 'coop' : 'versus', win, online: true, humans: g.players.filter(p => !p.bot).length, score, flip: me.flip, nudge: me.nudge,
      boss: coop ? g.boss.id : null, diff: coop ? g.boss.diff : null },
  };
}

export const claimRun = onCall(async req => {
  const uid = needUser(req);
  const d = req.data || {};
  const now = Date.now();
  let info, verified;
  if (d.room) {
    const r = await fromRoom(uid, d.room);
    const claimed = await db().ref(`claims/${uid}/${r.key}`).transaction(cur => (cur ? undefined : now));
    if (!claimed.committed) fail('이미 정산한 판이에요.', 'already-exists');
    info = r.info; verified = true;
  } else {
    if (typeof d.rid !== 'string' || !/^[-\w]{10,40}$/.test(d.rid)) fail('시작 기록이 없어 보석을 받을 수 없어요.', 'invalid-argument');
    const runRef = db().ref(`runs/${uid}/${d.rid}`);
    const run = (await runRef.get()).val();
    if (!run) fail('시작 기록이 없어 보석을 받을 수 없어요.', 'not-found');
    if (now - run.t < R.MIN_RUN_MS) fail('너무 빨리 끝난 판이라 보석을 받을 수 없어요.');
    if (now - run.t > 6 * 3600 * 1000) fail('너무 오래된 판이에요.');
    const claimed = await runRef.child('claimed').transaction(cur => (cur ? undefined : now));
    if (!claimed.committed) fail('이미 정산한 판이에요.', 'already-exists');
    info = {
      mode: run.mode, win: !!d.win, online: false, humans: 1,
      score: clampInt(d.score, 0, R.MAX_SCORE), flip: clampInt(d.flip, 0, R.CHARGE_CAP), nudge: clampInt(d.nudge, 0, R.CHARGE_CAP),
      boss: run.boss ?? null, diff: run.diff ?? null,
    };
    verified = false;
  }
  const { wallet, out } = await change(uid, w => {
    if (!verified && w.daily.n >= R.UNVERIFIED_DAILY) return { parts: [], total: 0, capped: true };
    const clearKey = info.mode === 'coop' ? `${info.boss}:${info.diff}` : null;
    const result = R.rewardFor({ ...info, firstClear: !!(clearKey && info.win && !w.clears[clearKey]), vsLeft: Math.max(0, R.VS_DAILY - w.vs.n) });
    w.gems += result.total;
    if (result.parts.some(p => p.vs)) w.vs.n++;
    if (clearKey && info.win) w.clears[clearKey] = true;
    if (!verified) w.daily.n++;
    return result;
  });
  return { ...out, wallet };
});

export const buy = onCall(async req => {
  const uid = needUser(req);
  const { kind, id } = req.data || {};
  const price = R.priceOf(kind, id);
  if (!price) fail('팔지 않는 물건이에요.', 'invalid-argument');
  const { wallet } = await change(uid, w => {
    if (w.owned[kind]?.[id]) return '이미 가지고 있어요.';
    if (w.gems < price) return `보석이 ${price - w.gems}개 모자라요.`;
    w.gems -= price;
    (w.owned[kind] ||= {})[id] = true;
    return null;
  });
  return { wallet };
});
