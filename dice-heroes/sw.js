// 오프라인 캐시 — 설치형 앱(PWA / 구글 플레이 TWA)으로 쓸 때 인터넷 없이도 실행되게 한다.
// 파일을 바꿔 배포하면 VERSION 을 올려야 새 파일을 받는다.
const VERSION = 'dh-0.3.2';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'engine.js', 'config.js', 'audio.js', 'dice3d.js', 'pixel.js',
  'scenes.js', 'tutorial.js', 'net.js', 'fireconfig.js', 'manifest.webmanifest',
  'vendor/three.module.min.js', 'vendor/cannon-es.js', 'vendor/RoundedBoxGeometry.js', 'vendor/firebase.js',
  'fonts/Galmuri11.woff2', 'fonts/Galmuri11-Bold.woff2', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
