// 요트 히어로즈 서버 — 보석 정산 · 구매 (Firebase Cloud Functions, Blaze 요금제)
//
// 앱은 지갑(wallets/<uid>)을 읽기만 하고, 보석을 늘리거나 줄이는 일은 모두 여기서 한다 (database.rules.json 이 막는다).
//   wallet    지갑을 불러온다 (없으면 기본 보석으로 만든다)
//   startRun  한 판 시작을 서버 시간으로 기록한다 → 정산 때 너무 빨리 끝난 판을 걸러낸다
//   claimRun  한 판 보상 정산
//             · 온라인 방 판: 방에 남은 게임 기록(rooms/DH-<코드>/state)을 서버가 직접 읽어 승패·점수·남은 기술을 확인한다
//             · 오프라인(봇전·한 기기) 판: 서버가 볼 수 없으니 시작 기록 + 최소 1분 + 하루 15판 + 점수 상한으로 막는다
//   buy       직업 · 주사위 · 트레이 사기
//   claimAch  도전과제 보상 받기 — 진행도(지갑 ach)는 claimRun 이 판마다 쌓는다
//   dailyRoll 일일 보상 — 하루(한국 자정 기준) 한 번, 서버가 주사위 5개를 굴려 합만큼 (요트면 10배)
//
// 가격 · 보상 규칙은 게임과 같은 파일(dice-heroes/wallet-rules.js)을 build.mjs 가 shared/ 로 복사해 쓴다.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { randomInt } from 'node:crypto';
import * as R from './shared/wallet-rules.js';
import * as E from './shared/engine.js';
import * as AC from './shared/achievements.js';

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
const view = w => ({ gems: w.gems, vs: w.vs, owned: w.owned || {}, clears: w.clears || {}, daily: w.daily, bonus: w.bonus || null, ach: w.ach || null });

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
    st: E.statsOf(g, idx, { online: true }),
    info: { mode: coop ? 'coop' : 'versus', win, online: true, humans: g.players.filter(p => !p.bot).length, score, flip: me.flip, nudge: me.nudge,
      boss: coop ? g.boss.id : null, diff: coop ? g.boss.diff : null },
  };
}

export const claimRun = onCall(async req => {
  const uid = needUser(req);
  const d = req.data || {};
  const now = Date.now();
  let info, verified, st = {};
  if (d.room) {
    const r = await fromRoom(uid, d.room);
    const claimed = await db().ref(`claims/${uid}/${r.key}`).transaction(cur => (cur ? undefined : now));
    if (!claimed.committed) fail('이미 정산한 판이에요.', 'already-exists');
    info = r.info; verified = true; st = r.st;
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
    st = AC.cleanStats(d.st, info);
  }
  const { wallet, out } = await change(uid, w => {
    if (!verified && w.daily.n >= R.UNVERIFIED_DAILY) return { parts: [], total: 0, capped: true };
    const clearKey = info.mode === 'coop' ? `${info.boss}:${info.diff}` : null;
    const result = R.rewardFor({ ...info, firstClear: !!(clearKey && info.win && !w.clears[clearKey]), vsLeft: Math.max(0, R.VS_DAILY - w.vs.n) });
    w.gems += result.total;
    if (result.parts.some(p => p.vs)) w.vs.n++;
    if (clearKey && info.win) w.clears[clearKey] = true;
    if (!verified) w.daily.n++;
    AC.mergeAch(w, st);                       // 도전과제 진행도
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

// 일일 보상: 주사위는 서버가 굴린다 (트랜잭션이 다시 불려도 같은 눈이 나오게 한 번만 굴려 둔다)
export const dailyRoll = onCall(async req => {
  const uid = needUser(req);
  const dice = Array.from({ length: 5 }, () => randomInt(1, 7));
  const { wallet, out } = await change(uid, (w, now) => {
    if (w.bonus?.day === R.dayOf(now)) return '오늘 보상은 이미 받았어요. 내일 다시 와 주세요!';
    const g = R.dailyGems(dice);
    w.gems += g.gems;
    w.bonus = { day: R.dayOf(now), dice };
    return g;
  });
  return { wallet, dice, ...out };
});

// 도전과제 보상: 진행도가 목표에 닿았고 아직 안 받았으면 난이도별 보석
export const claimAch = onCall(async req => {
  const uid = needUser(req);
  const a = AC.achInfo(req.data?.id);
  if (!a) fail('없는 도전과제예요.', 'invalid-argument');
  const { wallet, out } = await change(uid, (w, now) => {
    w.ach ||= {}; w.ach.got ||= {};
    if (w.ach.got[a.id]) return '이미 받은 보상이에요.';
    if (!AC.achDone(a, w.ach)) return '아직 달성하지 못했어요.';
    const gems = AC.achGems(a);
    w.gems += gems;
    w.ach.got[a.id] = now;
    return { gems };
  });
  return { wallet, ...out };
});
