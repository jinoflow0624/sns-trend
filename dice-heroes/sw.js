// 오프라인 캐시 — 한 번 접속하면 그다음부터는 인터넷 없이도 혼자·한 기기 모드를 할 수 있다 (PWA / 구글 플레이 TWA).
//
// 네트워크 우선: 항상 서버에서 최신 파일을 받고(브라우저 HTTP 캐시도 건너뜀),
// 받은 파일은 캐시에 덮어써 둔다. 인터넷이 없거나 4초 안에 답이 없으면(약한 신호) 캐시에서 꺼낸다.
// 그래서 새 버전을 배포하면 다음 실행에 바로 반영되고, 신호가 약해도 멈춰 있지 않는다.
// 이름을 바꾸면 예전 캐시를 통째로 지운다 (v0.30.7: 버전이 안 붙은 예전 주사위·트레이 그림이 남아 있어서)
const BGM_VER = 'b2';   // audio.js 의 BGM_VER 와 같아야 한다 (곡을 바꾸면 둘 다 올린다)
const ART_VER = 'a4';  // skins.js 의 ART_VER 와 같아야 한다 (주사위 · 트레이 그림을 바꾸면 둘 다 올린다)
const CACHE = 'dh-cache-3';   // v0.37.5: 버전이 안 붙은 예전 보스 곡(도입부 없는 루프)을 지운다
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'engine.js', 'config.js', 'audio.js', 'dice3d.js', 'pixel.js',
  'scenes.js', 'tutorial.js', 'net.js', 'fx.js', 'ambient.js', 'icons.js', 'dice2d.js', 'skins.js', 'wallet.js', 'wallet-rules.js', 'achievements.js', 'fireconfig.js', 'fire.js', 'live.js', 'ads.js', 'env.js', 'privacy.html', 'manifest.webmanifest',
  'vendor/three.module.min.js', 'vendor/cannon-es.js', 'vendor/RoundedBoxGeometry.js', 'vendor/firebase.js',
  'fonts/Galmuri11.woff2', 'fonts/Galmuri11-Bold.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  // 곡은 앱이 부르는 주소 그대로(?v=곡 버전) 받아 둔다 → 처음 설치할 때부터 캐시에 있다 (audio.js 의 BGM_VER 와 같게)
  ...['title', 'versus', 'boss_dragon', 'boss_orc', 'boss_lich', 'boss_demon', 'boss_cyclops', 'boss_hydra', 'boss_overlord', 'boss_archdemon'].map(n => `assets/bgm/${n}.ogg?v=${BGM_VER}`),
  ...['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon'].map(id => `assets/boss/${id}.webp`),
  ...['warrior', 'rogue', 'mage', 'bard', 'gambler', 'monk', 'dancer', 'outlaw', 'sharper'].map(k => `assets/heroes/${k}.webp`),
  // 그림 주사위 · 트레이 스킨: 앱이 부르는 주소 그대로(?v=그림 버전) → 설치할 때부터 캐시에 있어 첫 판부터 바로 뜬다
  ...['marble', 'royal', 'deepsea', 'demon', 'sakura', 'lava', 'starry', 'pixel8', 'deck', 'casino', 'alchemy', 'ruins', 'glacier', 'dragonnest'].flatMap(k => ['floor', 'glow', 'box', 'thumb', 'rail_top', 'rail_side', 'corner_side', 'corner_top', ...(['demon', 'lava', 'starry', 'ruins', 'glacier', 'dragonnest'].includes(k) ? ['rail_glow'] : [])].map(f => `assets/trays/${k}/${f}.webp?v=${ART_VER}`)),
  ...['openheart', 'gold', 'cosmic', 'black', 'heart', 'keycap', 'clear', 'minimal', 'dragon', 'lava', 'pixel', 'bone', 'slime', 'chip', 'chest', 'porcelain', 'frost', 'rune', 'brass', 'wisp'].flatMap(k => [1, 2, 3, 4, 5, 6].map(v => `assets/dice/${k}/${v}.webp?v=${ART_VER}`)),
  ...['dragon', 'lava', 'frost', 'rune', 'brass', 'wisp'].flatMap(k => [1, 2, 3, 4, 5, 6].map(v => `assets/dice/${k}/${v}_glow.webp?v=${ART_VER}`)),
];
const NET_WAIT = 2500;   // 약한 신호: 이만큼 기다려도 답이 없으면 캐시로 (첫 화면이 오래 검게 남지 않게)
let slowUntil = 0;       // 방금 네트워크가 느렸으면 30초 동안은 캐시부터 (파일마다 4초씩 기다리지 않게)

// 파일마다 따로 받아 둔다 (하나가 실패해도 나머지는 캐시에 남게 — addAll 은 하나만 실패해도 전부 버린다)
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => Promise.allSettled(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(res => { if (res.ok) return c.put(f, res); }))))
    .catch(() => {})
    .then(() => self.skipWaiting()),
));

// 예전 버전이 만든 캐시(dh-0.x.x)는 지운다. 원정 그림을 게임 버전(?v=0.38.x)으로 받아 쌓아 둔 것도 지운다 (이제 그림 버전 r1 …)
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => caches.open(CACHE)).then(c => c.keys().then(reqs => Promise.all(reqs
      .filter(r => { const u = new URL(r.url); return u.pathname.includes('/assets/run/') && /^\d+\.\d+/.test(u.searchParams.get('v') || ''); })
      .map(r => c.delete(r)))))
    .catch(() => {})
    .then(() => self.clients.claim()),
));
// 버전이 붙은 그림 · 곡을 새로 받으면, 같은 파일의 예전 버전은 캐시에서 지운다 (캐시가 끝없이 커지지 않게)
async function putVersioned(req, res) {
  const c = await caches.open(CACHE), u = new URL(req.url);
  await c.put(req, res);
  const old = (await c.keys()).filter(r => { const o = new URL(r.url); return o.pathname === u.pathname && o.search !== u.search; });
  await Promise.all(old.map(r => c.delete(r)));
}
const refreshed = new Set();   // 버전 없는 그림은 이 서비스워커가 살아 있는 동안 한 번만 뒤에서 새로 받는다

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // Firebase 등 외부 요청은 건드리지 않는다
  if (new URL(req.url).searchParams.has('fresh')) return;   // 앱이 새 파일을 직접 받아 캐시를 고칠 때 (app.js healCode) — 캐시를 거치지 않는다
  // 그림·음악(assets/)은 캐시에 있으면 바로 쓰고, 뒤에서 조용히 새로 받아 둔다 (스킨을 고르면 바로 보이게).
  // 주사위·트레이 그림은 주소에 그림 버전(?v=)이 붙는다 → 주소가 정확히 같을 때만 캐시를 쓴다 (그림 버전을 올리면 바로 새 그림).
  // 인터넷이 없으면 버전이 다른 예전 그림이라도 꺼내 쓴다
  // 버전(?v=)이 붙은 그림 · 곡은 주소가 같으면 내용도 같다 → 캐시에 있으면 그대로 쓰고 다시 받지 않는다 (예전엔 볼 때마다 뒤에서 또 받아 데이터 · 배터리를 썼다)
  if (new URL(req.url).pathname.includes('/assets/')) {
    const versioned = new URL(req.url).searchParams.has('v');
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit && versioned) return hit;
      const fresh = () => fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
        if (res.ok) { const copy = res.clone(); (versioned ? putVersioned(req, copy) : caches.open(CACHE).then(c => c.put(req, copy))).catch(() => {}); }
        return res;
      });
      if (hit) { if (!refreshed.has(req.url)) { refreshed.add(req.url); e.waitUntil(fresh().catch(() => {})); } return hit; }
      return fresh().catch(async () => (await caches.match(req, { ignoreSearch: true })) || Response.error());
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
