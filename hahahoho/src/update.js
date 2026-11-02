// 새 버전 알림 · 새로고침. 휴대폰(특히 홈 화면에 추가한 앱)은 예전 파일을 오래 붙잡고 있어서
// 서버의 version.json 을 캐시 없이 확인하고, 다르면 캐시를 비우고 다시 불러온다.
import { APP_VERSION } from './version.js';

export { APP_VERSION };
const CHECK_MS = 5 * 60 * 1000;

export async function latestVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).v || null;
  } catch { return null; }
}

// 서비스 워커를 새로 받고, 저장해 둔 파일 캐시를 지운 뒤, 주소를 바꿔 다시 연다
export async function hardRefresh() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      const w = reg.installing || reg.waiting;
      if (w) {
        w.postMessage?.('skip');
        await new Promise(res => {
          const done = () => w.state === 'activated' && res();
          w.addEventListener('statechange', done);
          setTimeout(res, 3000);
        });
      }
    }
  } catch { /* 무시 */ }
  try { for (const k of await caches.keys()) if (k.startsWith('hahahoho')) await caches.delete(k); } catch { /* 무시 */ }
  const u = new URL(location.href);
  u.searchParams.set('v', Date.now().toString(36));
  location.replace(u.toString());
}

// 켤 때 · 앱으로 돌아올 때 · 5분마다 확인해서 새 버전이면 onNew(버전)
export function watchUpdates(onNew) {
  let told = null;
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 20000) return;
    last = Date.now();
    const v = await latestVersion();
    if (v && v !== APP_VERSION && v !== told) { told = v; onNew(v); }
  };
  check();
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  addEventListener('pageshow', check);
}

// 화면 위에 뜨는 "새 버전" 띠. beforeGo: 새로고침 전에 할 일(게임 저장)
export function showUpdateBar(v, beforeGo) {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.innerHTML = '<span>새 버전이 나왔어요</span><button class="btn small gold">지금 업데이트</button><button class="x" aria-label="닫기">×</button>';
  bar.querySelector('.btn').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = '받는 중…';
    try { await beforeGo?.(); } catch { /* 무시 */ }
    hardRefresh();
  });
  bar.querySelector('.x').addEventListener('click', () => bar.remove());
  document.getElementById('app').appendChild(bar);
  bar.dataset.v = v;
}
