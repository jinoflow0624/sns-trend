// Firebase 앱을 한 번만 만들어 온라인 방(net.js)과 운영 기능(live.js)이 같이 쓴다.
//
// 테스트판(ENV 'test'): 아콰이어와 같은 Firebase, 데이터베이스만 쓴다 (작은 vendor/firebase.js).
// 배포판(ENV 'prod') : 전용 Firebase. 익명 로그인 · App Check · Remote Config · Analytics 까지
//                      들어 있는 vendor/firebase-full.js 를 쓴다.
//
// 에뮬레이터로 점검할 때: ?fbemu=127.0.0.1:9100 (데이터베이스) &fbauth=127.0.0.1:9099 (로그인)
import { ENV } from './env.js';

export const PROD = ENV === 'prod';
let init = null;
let uid = null;

export const myUid = () => uid;

export function fireApp() {
  init ||= (async () => {
    const cfg = await import('./fireconfig.js');
    const fb = await import(PROD ? './vendor/firebase-full.js' : './vendor/firebase.js');
    const app = fb.initializeApp(cfg.firebaseConfig, 'diceheroes');
    const q = new URLSearchParams(location.search);
    const emu = q.get('fbemu'), authEmu = q.get('fbauth');
    // App Check: 이 앱(내 도메인)에서 온 요청만 받게 한다. 사이트 키가 있을 때만, 에뮬레이터에선 끈다
    if (PROD && cfg.APP_CHECK_KEY && !emu) {
      try { fb.initializeAppCheck(app, { provider: new fb.ReCaptchaV3Provider(cfg.APP_CHECK_KEY), isTokenAutoRefreshEnabled: true }); }
      catch (err) { console.warn('[appcheck]', err); }
    }
    return { fb, app, cfg, emu, authEmu };
  })().catch(err => { init = null; throw err; });
  return init;
}

// 배포판: 익명 로그인 (가입 없이 기기마다 고유 번호). 같은 기기면 다음에도 같은 번호가 이어진다
let signing = null;
export function signIn() {
  if (!PROD) return Promise.resolve(null);
  signing ||= (async () => {
    const { fb, app, authEmu } = await fireApp();
    const auth = fb.getAuth(app);
    if (authEmu && !auth.emulatorConfig) fb.connectAuthEmulator(auth, `http://${authEmu}`, { disableWarnings: true });
    await auth.authStateReady();
    const user = auth.currentUser || (await fb.signInAnonymously(auth)).user;
    uid = user.uid;
    return uid;
  })().catch(err => { signing = null; throw err; });
  return signing;
}

// 배포판: 서버에 있는 내 로그인 기록을 지운다 (설정 → 내 데이터 지우기)
export async function deleteAccount() {
  if (!PROD) return;
  const { fb, app, authEmu } = await fireApp();
  const auth = fb.getAuth(app);
  if (authEmu && !auth.emulatorConfig) fb.connectAuthEmulator(auth, `http://${authEmu}`, { disableWarnings: true });
  await auth.authStateReady();
  if (auth.currentUser) await fb.deleteUser(auth.currentUser);
  uid = null;
  signing = null;
}
