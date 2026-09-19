// PeerJS(WebRTC) 전송 계층.
// 방장 브라우저가 호스트 역할을 하고, 참가자는 방 코드로 호스트에 직접 연결한다.
// 정적 호스팅(GitHub Pages)에는 서버 프로세스를 올릴 수 없어 이 구조를 쓴다.

const PEER_ID_PREFIX = 'acq-v1-';
// 동봉한 사본을 먼저 쓰고, 실패하면 CDN으로 폴백한다.
const PEER_SOURCES = [
  'vendor/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
];

// 혼동하기 쉬운 문자(0/O, 1/I/L)를 뺀 코드 문자집합
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomCode(len = 5) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

export const normalizeCode = raw => (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const peerIdFor = code => PEER_ID_PREFIX + normalizeCode(code);

let peerLoading = null;
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLoading) return peerLoading;
  peerLoading = new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= PEER_SOURCES.length) return reject(new Error('PeerJS 라이브러리를 불러오지 못했습니다. 네트워크를 확인해 주세요.'));
      const el = document.createElement('script');
      el.src = PEER_SOURCES[i++];
      el.onload = () => (window.Peer ? resolve(window.Peer) : tryNext());
      el.onerror = () => { el.remove(); tryNext(); };
      document.head.appendChild(el);
    };
    tryNext();
  });
  return peerLoading;
}

// 기본은 PeerJS 공개 브로커. ?peerhost=... 로 자체 브로커를 지정할 수 있다
// (브로커는 최초 연결을 중개만 하고, 실제 게임 데이터는 P2P로 직접 오간다).
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const host = q.get('peerhost');
  if (!host) return { debug: 0 };
  return {
    debug: 0,
    host,
    port: Number(q.get('peerport')) || 443,
    path: q.get('peerpath') || '/',
    secure: q.get('peersecure') !== '0',
  };
}

// ── 호스트 ───────────────────────────────────────────────────────────────────
// handlers: { onOpen(code), onConnect(conn), onData(conn, msg), onClose(conn), onError(err) }
export async function startHost(code, handlers) {
  const Peer = await loadPeerJS();
  const peer = new Peer(peerIdFor(code), peerOptions());
  const conns = new Set();

  await new Promise((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', err => {
      // 'unavailable-id'는 같은 코드의 방이 이미 살아 있다는 뜻
      if (err.type === 'unavailable-id') reject(new Error('이미 사용 중인 방 코드입니다. 다시 시도해 주세요.'));
      else reject(err);
    });
  });

  peer.on('connection', conn => {
    conn.on('open', () => { conns.add(conn); handlers.onConnect?.(conn); });
    conn.on('data', msg => handlers.onData?.(conn, msg));
    conn.on('close', () => { conns.delete(conn); handlers.onClose?.(conn); });
    conn.on('error', () => { conns.delete(conn); handlers.onClose?.(conn); });
  });
  peer.on('error', err => {
    // 연결이 열린 뒤의 오류는 개별 피어 문제인 경우가 많아 치명적으로 다루지 않는다
    if (err.type === 'peer-unavailable') return;
    handlers.onError?.(err);
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* 무시 */ } });

  handlers.onOpen?.(code);
  return {
    peer,
    conns,
    alive() { return !peer.destroyed; },
    // 모바일에서 탭이 얼었다 깨어나면 시그널링 소켓이 끊겨 있을 수 있다
    revive() { if (!peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* 무시 */ } } },
    send(conn, msg) { try { conn.send(msg); } catch { /* 끊긴 연결 무시 */ } },
    broadcast(msg) { for (const c of conns) this.send(c, msg); },
    destroy() { try { peer.destroy(); } catch { /* 무시 */ } },
  };
}

// ── 참가자 ───────────────────────────────────────────────────────────────────
// handlers: { onOpen(), onData(msg), onClose(), onError(err) }
export async function joinHost(code, handlers) {
  const Peer = await loadPeerJS();
  const peer = new Peer(peerOptions());

  await new Promise((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', reject);
  });

  const conn = peer.connect(peerIdFor(code), { reliable: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('방에 연결하지 못했습니다. 방 코드를 확인하거나, 방장이 페이지를 열어 두었는지 확인해 주세요.')), 20000);
    conn.on('open', () => { clearTimeout(timer); resolve(); });
    peer.on('error', err => {
      clearTimeout(timer);
      reject(err.type === 'peer-unavailable'
        ? new Error('그런 방이 없습니다. 방 코드를 확인하거나, 방장에게 페이지를 열어 달라고 하세요.')
        : err);
    });
  });

  conn.on('data', msg => handlers.onData?.(msg));
  conn.on('close', () => handlers.onClose?.());
  peer.on('error', err => handlers.onError?.(err));

  handlers.onOpen?.();
  return {
    peer,
    conn,
    alive() { return !peer.destroyed && conn.open; },
    send(msg) { try { conn.send(msg); } catch { /* 무시 */ } },
    destroy() { try { peer.destroy(); } catch { /* 무시 */ } },
  };
}

// ── 화면 꺼짐 방지 ───────────────────────────────────────────────────────────
// 모바일 브라우저는 화면이 꺼지거나 탭이 백그라운드로 가면 페이지를 얼린다.
// Wake Lock은 화면이 보이는 동안만 유지되므로, 돌아올 때마다 다시 요청한다.
export function keepScreenAwake() {
  if (!('wakeLock' in navigator)) return () => {};
  let lock = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { /* 사용자가 거부했거나 미지원 — 무시 */ }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };

  acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    try { lock?.release(); } catch { /* 무시 */ }
    lock = null;
  };
}

// 재접속용 영구 토큰 (같은 브라우저면 자리를 되찾는다)
export function myToken() {
  const KEY = 'acquire.token';
  try {
    let t = localStorage.getItem(KEY);
    if (!t) { t = crypto.randomUUID(); localStorage.setItem(KEY, t); }
    return t;
  } catch {
    return crypto.randomUUID(); // 프라이빗 모드 등 — 재접속은 포기
  }
}

export function rememberName(name) {
  try { if (name) localStorage.setItem('acquire.name', name); } catch { /* 무시 */ }
}
export function recallName() {
  try { return localStorage.getItem('acquire.name') || ''; } catch { return ''; }
}
