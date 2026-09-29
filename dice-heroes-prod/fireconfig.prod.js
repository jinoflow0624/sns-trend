// 배포판 Firebase 설정 — 다이스 히어로즈 전용 프로젝트.
// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → SDK 설정 및 구성 → '구성' 값을 그대로 붙여 넣는다.
// ⚠ 비밀이 아니다(공개 식별자). 접근 제어는 database.rules.json 과 App Check 가 맡는다.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  databaseURL: 'https://REPLACE_ME-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
  measurementId: '',          // Analytics 를 켜면 G-XXXXXXX
};

export const APP_CHECK_KEY = '';   // App Check → reCAPTCHA v3 사이트 키 (비우면 App Check 없이 동작)
export const MEASUREMENT_ID = firebaseConfig.measurementId;
