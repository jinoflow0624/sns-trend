// 오프라인 캐시 — 한 번 접속하면 그다음부터는 인터넷 없이도 혼자·한 기기 모드를 할 수 있다 (PWA / 구글 플레이 TWA).
//
// 네트워크 우선: 항상 서버에서 최신 파일을 받고(브라우저 HTTP 캐시도 건너뜀),
// 받은 파일은 캐시에 덮어써 둔다. 인터넷이 없거나 4초 안에 답이 없으면(약한 신호) 캐시에서 꺼낸다.
// 그래서 새 버전을 배포하면 다음 실행에 바로 반영되고, 신호가 약해도 멈춰 있지 않는다.
const CACHE = 'dh-cache';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'engine.js', 'config.js', 'audio.js', 'dice3d.js', 'pixel.js',
  'scenes.js', 'tutorial.js', 'net.js', 'fx.js', 'icons.js', 'dice2d.js', 'skins.js', 'wallet.js', 'wallet-rules.js', 'achievements.js', 'fireconfig.js', 'fire.js', 'live.js', 'ads.js', 'env.js', 'privacy.html', 'manifest.webmanifest',
  'vendor/three.module.min.js', 'vendor/cannon-es.js', 'vendor/RoundedBoxGeometry.js', 'vendor/firebase.js',
  'fonts/Galmuri11.woff2', 'fonts/Galmuri11-Bold.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'assets/bgm/title.ogg', 'assets/bgm/versus.ogg',
  'assets/bgm/boss_dragon.ogg', 'assets/bgm/boss_orc.ogg', 'assets/bgm/boss_lich.ogg', 'assets/bgm/boss_demon.ogg',
  'assets/boss/demon.png', 'assets/boss/demon_rage.png',
  ...['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper'].map(k => `assets/heroes/${k}.webp`),
  // 그림 주사위 스킨 (오프라인에서 꾸미기를 바꿔도 보이게)
  ...['openheart', 'gold', 'cosmic', 'black'].flatMap(k => [1, 2, 3, 4, 5, 6].map(v => `assets/dice/${k}/${v}.webp`)),
];
const NET_WAIT = 4000;   // 약한 신호: 이만큼 기다려도 답이 없으면 캐시로
let slowUntil = 0;       // 방금 네트워크가 느렸으면 30초 동안은 캐시부터 (파일마다 4초씩 기다리지 않게)

// 파일마다 따로 받아 둔다 (하나가 실패해도 나머지는 캐시에 남게 — addAll 은 하나만 실패해도 전부 버린다)
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => Promise.allSettled(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(res => { if (res.ok) return c.put(f, res); }))))
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
  // 그림·음악(assets/)은 캐시에 있으면 바로 쓰고, 뒤에서 조용히 새로 받아 둔다 (스킨을 고르면 바로 보이게)
  if (new URL(req.url).pathname.includes('/assets/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      const fresh = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      });
      if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh.catch(() => Response.error());
    })());
    return;
  }
  e.respondWith((async () => {
    // 페이지 이동 요청(navigate)에 옵션을 붙이면 오류가 나서 주소로 새 요청을 만든다.
    // no-cache: 매번 서버에 '바뀌었나' 묻고, 안 바뀌었으면 304(본문 없음)로 받아 전송량을 아낀다
    const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));                                    // 늦게 와도 캐시는 새로 채운다
    const hit = caches.match(req, { ignoreSearch: true });
    if (Date.now() < slowUntil) { const h = await hit; if (h) return h; }
    const slow = new Promise(r => setTimeout(r, NET_WAIT, 'slow'));
    const first = await Promise.race([net.catch(() => 'fail'), slow]);
    if (first !== 'slow' && first !== 'fail') return first;             // 제때 온 최신 파일
    slowUntil = Date.now() + 30000;
    return (await hit) || net.catch(() => Response.error());            // 끊겼거나 느리면 캐시 (없으면 끝까지 기다린다)
  })());
});
