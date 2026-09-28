// 서비스 워커: 네트워크 우선(늘 서버에 새 파일이 있는지 확인), 실패하면 캐시 — 홈 화면 앱으로 열 때 오프라인 대비.
// 브라우저 캐시를 거치지 않고 서버에 확인하므로 배포하면 다음 실행에 바로 새 버전이 뜬다.
const CACHE = 'hahahoho-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('hahahoho') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
