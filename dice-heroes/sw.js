// 오프라인 캐시 — 설치형 앱(PWA / 구글 플레이 TWA)으로 쓸 때 인터넷 없이도 실행되게 한다.
//
// 네트워크 우선: 항상 서버에서 최신 파일을 받고(브라우저 HTTP 캐시도 건너뜀),
// 받은 파일은 캐시에 덮어써 둔다. 인터넷이 없을 때만 캐시에서 꺼낸다.
// 그래서 새 버전을 배포하면 다음 실행에 바로 반영된다.
const CACHE = 'dh-cache';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'engine.js', 'config.js', 'audio.js', 'dice3d.js', 'pixel.js',
  'scenes.js', 'tutorial.js', 'net.js', 'fireconfig.js', 'manifest.webmanifest',
  'vendor/three.module.min.js', 'vendor/cannon-es.js', 'vendor/RoundedBoxGeometry.js', 'vendor/firebase.js',
  'fonts/Galmuri11.woff2', 'fonts/Galmuri11-Bold.woff2', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .catch(() => {})
    .then(() => self.skipWaiting()),
));

// 예전 버전이 만든 캐시(dh-0.x.x)는 지운다
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // Firebase 등 외부 요청은 건드리지 않는다
  e.respondWith((async () => {
    try {
      // 페이지 이동 요청(navigate)에 옵션을 붙이면 오류가 나서 주소로 새 요청을 만든다
      const res = await fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }));
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
