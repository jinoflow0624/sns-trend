// 배포판 Firebase 설정 — 요트 히어로즈 전용 프로젝트.
// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → SDK 설정 및 구성 → '구성' 값을 그대로 붙여 넣는다.
// ⚠ 비밀이 아니다(공개 식별자). 접근 제어는 database.rules.json 과 App Check 가 맡는다.
export const firebaseConfig = {
  apiKey: 'AIzaSyAl9ve5WjMWWqbbWcg0jg18UqsA0Nx9BuM',
  authDomain: 'diceheroes-4fbbb.firebaseapp.com',
  databaseURL: 'https://diceheroes-4fbbb-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'diceheroes-4fbbb',
  storageBucket: 'diceheroes-4fbbb.firebasestorage.app',
  messagingSenderId: '485186805908',
  appId: '1:485186805908:web:521de2e01341eaa7885481',
  measurementId: 'G-J9P843KY1T',
};

export const APP_CHECK_KEY = '';   // App Check → reCAPTCHA v3 사이트 키 (비우면 App Check 없이 동작)
export const MEASUREMENT_ID = firebaseConfig.measurementId;
