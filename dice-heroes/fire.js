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

// 배포판: 구글 계정 연결. 지금 익명 계정에 구글을 붙이므로 보석·구매 기록이 그대로 이어진다.
// 이미 다른 기기에서 연결한 구글 계정이면 그 계정으로 바꿔 들어간다 (그 계정의 보석을 쓴다).
export async function linkGoogle() {
  if (!PROD) throw new Error('테스트판에서는 구글 계정을 연결할 수 없어요.');
  const { fb, app } = await fireApp();
  await signIn();
  const auth = fb.getAuth(app);
  const provider = new fb.GoogleAuthProvider();
  try {
    const res = await fb.linkWithPopup(auth.currentUser, provider);
    return { switched: false, email: res.user.email || res.user.providerData.find(p => p.providerId === 'google.com')?.email };
  } catch (err) {
    if (err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/email-already-in-use') {
      const cred = fb.GoogleAuthProvider.credentialFromError(err);
      const res = await fb.signInWithCredential(auth, cred);
      uid = res.user.uid;
      signing = Promise.resolve(uid);
      return { switched: true, email: res.user.email };
    }
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.linkWithRedirect(auth.currentUser, provider);    // 팝업이 막히는 앱 화면: 페이지를 넘겨서 연결
    }
    throw err;
  }
}
// 지금 계정 상태: 구글 연결 여부 · 이메일
export async function accountInfo() {
  if (!PROD) return { guest: true, test: true };
  const { fb, app } = await fireApp();
  await signIn();
  const u = fb.getAuth(app).currentUser;
  const g = u?.providerData.find(p => p.providerId === 'google.com');
  return { guest: !g, email: g?.email || '' };
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
