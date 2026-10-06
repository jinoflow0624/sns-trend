// 운영 기능 (배포판만) — Remote Config 공지·점검·최소 버전, 동의한 사람만 Analytics.
// 테스트판에서는 모두 아무 일도 하지 않는다.
//
// Remote Config 매개변수 (Firebase 콘솔 → Remote Config 에서 값을 바꾸면 앱 업데이트 없이 반영):
//   notice       공지 한 줄 (비우면 안 보임)
//   maintenance  true 면 온라인 방을 잠시 닫는다
//   min_version  이보다 낮은 버전이면 업데이트 안내 (예: 1.0.0)
//   ads_enabled  true 면 결과 화면 뒤 전면 광고를 켠다 (기본 false — 켜기 전엔 광고 스크립트도 안 불러옴)
//   ads_every    몇 판마다 광고 한 번 (기본 2)
import { PROD, fireApp } from './fire.js';

const DEFAULTS = { notice: '', maintenance: false, min_version: '', ads_enabled: false, ads_every: 2 };
let rc = null;
let analytics = null;
let logFn = null;

// 서버 설정을 받는다 (느리면 기본값으로 넘어간다). 한 시간에 한 번만 새로 받는다
export async function liveConfig() {
  if (!PROD) return { ...DEFAULTS };
  try {
    const { fb, app } = await fireApp();
    if (!rc) {
      rc = fb.getRemoteConfig(app);
      rc.settings.minimumFetchIntervalMillis = 3600 * 1000;
      rc.settings.fetchTimeoutMillis = 6000;
      rc.defaultConfig = DEFAULTS;
    }
    await fb.fetchAndActivate(rc).catch(() => {});
    return {
      notice: fb.getValue(rc, 'notice').asString(),
      maintenance: fb.getValue(rc, 'maintenance').asBoolean(),
      min_version: fb.getValue(rc, 'min_version').asString(),
      ads_enabled: fb.getValue(rc, 'ads_enabled').asBoolean(),
      ads_every: fb.getValue(rc, 'ads_every').asNumber() || DEFAULTS.ads_every,
    };
  } catch (err) {
    console.warn('[live]', err);
    return { ...DEFAULTS };
  }
}

// a < b 이면 true (1.2.3 형식)
export function older(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0); }
  return false;
}

// 사용 통계 — 설정에서 동의했을 때만 켠다 (기본은 꺼짐). 개인 식별 정보는 보내지 않는다
export async function setAnalytics(on) {
  if (!PROD) return;
  try {
    const { fb, app, cfg } = await fireApp();
    if (!on) { if (analytics) fb.setAnalyticsCollectionEnabled(analytics, false); logFn = null; return; }
    if (!cfg.firebaseConfig.measurementId || !(await fb.analyticsSupported())) return;
    analytics ||= fb.getAnalytics(app);
    fb.setAnalyticsCollectionEnabled(analytics, true);
    logFn = (name, params) => fb.logEvent(analytics, name, params);
  } catch (err) { console.warn('[analytics]', err); }
}

export function track(name, params = {}) {
  try { logFn?.(name, params); } catch {}
}
