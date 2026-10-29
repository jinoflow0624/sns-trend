// 뒤에서 받기 (낮은 순위 내려받기 줄)
//
// 다음 화면에 쓸 그림 · 곡을 미리 받아 두되, 지금 화면이 꼭 필요한 것을 받는 동안에는 길을 비켜 준다.
//   · 한 번에 2개만 (느린 망 · 데이터 절약 모드면 1개) — 예전엔 원정 그림 60여 장 · 곡 5개를 한꺼번에 받아
//     대전 시작 · 원정 시작이 그 뒤에 줄을 서느라 느린 망에서 9 ~ 30초씩 기다렸다
//   · fg(약속) 으로 감싼 '지금 필요한 것'(싸움 화면 준비 · 원정 준비 · 첫 화면)을 받는 동안은 새로 시작하지 않는다
//   · 순위(prio)가 낮은 숫자부터. 같은 주소는 한 번만
// 화면에 보이기 전에 반드시 있어야 하는 것은 여기가 아니라 그 화면을 여는 쪽(stageReady · preloadRun …)이 기다린다.
const conn = () => (typeof navigator !== 'undefined' && navigator.connection) || {};
const slowNet = () => conn().saveData || /(^|-)2g$/.test(conn().effectiveType || '');
const queue = [];          // { key, prio, job, resolve }
const seen = new Map();    // key → Promise
let active = 0, hold = 0, paused = true;   // 첫 화면이 준비될 때까지는 멈춰 있다 (bgStart)

function start(it) {
  active++;
  Promise.resolve().then(it.job).catch(() => {}).then(v => { active--; it.resolve(v); pump(); });
}
function pump() {
  if (paused || hold > 0) return;
  const max = slowNet() ? 1 : 2;
  while (active < max && queue.length) {
    queue.sort((a, b) => a.prio - b.prio);
    start(queue.shift());
  }
}

// 뒤에서 받을 일 하나 (같은 key 는 한 번만). 끝나면 풀리는 Promise.
// now: 지금 화면이 바로 기다리는 것 — 줄에 있으면 앞으로 빼서 곧바로 시작한다 (멈춤 · 순서와 상관없이)
export function bg(key, job, prio = 5, now = false) {
  if (seen.has(key)) {
    if (now) { const i = queue.findIndex(q => q.key === key); if (i >= 0) start(queue.splice(i, 1)[0]); }
    return seen.get(key);
  }
  let it;
  const p = new Promise(resolve => { it = { key, prio, job, resolve }; });
  seen.set(key, p);
  if (now) start(it); else { queue.push(it); pump(); }
  return p;
}
// 그림 하나를 뒤에서 받아 풀어 둔다
export function bgImage(url, prio = 5, now = false) {
  return bg(url, () => new Promise(res => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
    im.onerror = () => res(null);
    im.src = url;
  }), prio, now);
}
// 파일 하나를 뒤에서 받아 둔다 (곡 · 글꼴 — 브라우저 · 오프라인 캐시에 남는다). 데이터 절약 모드면 큰 파일(곡)은 건너뛴다
export function bgFile(url, prio = 6, big = false, now = false) {
  if (big && !now && conn().saveData) return Promise.resolve();
  return bg(url, () => fetch(url).then(r => r.arrayBuffer()).catch(() => {}), prio, now);
}
// 지금 화면에 꼭 필요한 것을 받는 동안 뒤에서 받기를 멈춘다
export async function fg(promise) {
  hold++;
  try { return await promise; } finally { hold--; pump(); }
}
// 첫 화면(「화면을 터치하세요」)이 준비되면 뒤에서 받기를 시작한다
const started = [];
export function bgStart() { if (paused) { paused = false; pump(); started.splice(0).forEach(f => { try { f(); } catch { /* 무시 */ } }); } }
// 첫 화면이 준비된 뒤에 할 일 (이미 지났으면 바로) — 3D 엔진 · 원정 코드처럼 큰 것을 첫 화면과 다투지 않게
export function afterBoot(fn) { if (paused) started.push(fn); else fn(); }
export const bgIdle = () => !queue.length && !active;
