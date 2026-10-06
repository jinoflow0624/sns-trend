// 광고 — 판이 끝난 결과 화면에서 "다시 하기"·"메인 메뉴"를 누른 뒤에만 전면 광고 한 번.
// 게임 도중에는 절대 띄우지 않는다. Google H5 Games Ads (Ad Placement API: adConfig / adBreak).
//
// 규칙
//   · 끝까지 한 판이 RULES.every(기본 2)판 쌓이고, 직전 광고 뒤 RULES.gapMs(3분)가 지났을 때만
//   · 광고 제거 권리(adFree)가 있으면 스크립트조차 불러오지 않는다
//   · 스크립트가 막혔거나 광고가 없거나 늦으면 아무것도 표시하지 않고 그대로 넘어간다
//   · 맞춤형 광고는 기본 꺼짐 (설정에서 켤 수 있다). 유럽·영국·스위스는 애드센스 동의 창(CMP)이 따로 뜬다
//   · 테스트판은 항상 테스트 광고(data-adbreak-test), 배포판은 Remote Config ads_enabled 가 true 일 때만
export const ADS_CLIENT = 'ca-pub-1731682355545536';
export const RULES = { every: 2, gapMs: 180 * 1000 };
const KEY = 'diceheroes.ads';
const WAIT_MS = 2000;     // 이 안에 광고가 시작되지 않으면 없는 것으로 보고 넘어간다
const MAX_MS = 90 * 1000; // 광고가 끝났다는 신호가 안 와도 이만큼 지나면 게임으로 돌아온다

let opt = { enabled: false, test: true, personalized: false, adFree: () => false, onPause: () => {} };
let loaded = false, failed = false, busy = false;

const load = () => { try { return { games: 0, last: 0, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { games: 0, last: 0 }; } };
const save = st => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 저장 불가 */ } };

// 이번에 광고를 띄울 차례인가 (순수 함수 — 테스트용)
export function due(st, now, rules = RULES) {
  return st.games >= rules.every && now - (st.last || 0) >= rules.gapMs;
}

const q = () => (window.adsbygoogle = window.adsbygoogle || []);
// 스크립트가 실제로 준비됐는가 (준비 전엔 adsbygoogle 이 그냥 배열이라, 넣어 둔 요청이 나중에 엉뚱한 때 실행될 수 있다)
const live = () => loaded && !failed && window.adsbygoogle && !Array.isArray(window.adsbygoogle);

export function initAds(o) {
  Object.assign(opt, o);
  if (o.every > 0) RULES.every = o.every;
  if (!opt.enabled || opt.adFree() || loaded || typeof document === 'undefined') return;
  loaded = true;
  q().requestNonPersonalizedAds = opt.personalized ? 0 : 1;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CLIENT}`;
  s.dataset.adClient = ADS_CLIENT;
  s.dataset.adFrequencyHint = `${RULES.gapMs / 1000}s`;
  if (opt.test) s.dataset.adbreakTest = 'on';
  s.onerror = () => { failed = true; };
  document.head.appendChild(s);
  q().push({ preloadAdBreaks: 'on', sound: 'on' });   // adConfig
}

export function setPersonalized(on) {
  opt.personalized = !!on;
  if (loaded) q().requestNonPersonalizedAds = on ? 0 : 1;
}

// 끝까지 한 판을 마쳤다 (튜토리얼 제외). 같은 판의 결과 화면이 다시 그려져도 한 번만 센다
export function gameOver(key) {
  const st = load();
  if (key && st.key === key) return;
  st.games++; st.key = key;
  save(st);
}

// 결과 화면에서 다음으로 넘어갈 때: 차례면 광고를 한 번 보여 준 뒤 next(), 아니면 바로 next()
export function breakThen(next) {
  if (busy) return;
  if (!opt.enabled || opt.adFree() || !live() || !due(load(), Date.now())) return next();
  busy = true;
  let started = false, done = false, timer = 0;
  const finish = () => {
    if (done) return;
    done = true; busy = false;
    clearTimeout(timer);
    opt.onPause(false);
    next();
  };
  timer = setTimeout(() => { if (!started) finish(); }, WAIT_MS);
  try {
    q().requestNonPersonalizedAds = opt.personalized ? 0 : 1;
    q().push({   // adBreak
      type: 'next',
      name: 'game_over',
      beforeAd() {
        if (done) return;
        started = true;
        clearTimeout(timer);
        timer = setTimeout(finish, MAX_MS);
        opt.onPause(true);
      },
      afterAd() { opt.onPause(false); },
      adBreakDone(info) {
        if (info?.breakStatus === 'viewed') save({ ...load(), games: 0, last: Date.now() });
        finish();
      },
    });
  } catch { finish(); }
}
