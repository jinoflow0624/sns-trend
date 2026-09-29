// Firebase 설정 — 온라인 방(2~4인 링크 초대)에 쓴다. 아콰이어 온라인과 같은 프로젝트를 쓰고,
// 방 코드 앞에 'DH-'를 붙여 아콰이어 방과 섞이지 않게 한다.
// ⚠ 여기 값은 비밀이 아니다(Firebase 웹 설정은 공개 식별자). 접근 제어는 DB 규칙이 맡는다.
export const firebaseConfig = {
  apiKey: 'AIzaSyAqzUMsSkkJ9twdryZH9Lvp4S5rXizUVy4',
  authDomain: 'acquire-950a0.firebaseapp.com',
  databaseURL: 'https://acquire-950a0-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'acquire-950a0',
  storageBucket: 'acquire-950a0.firebasestorage.app',
  messagingSenderId: '865925204000',
  appId: '1:865925204000:web:e71dc2f1cdab0ba5df1445',
};

// 배포판에서만 쓰는 값 (테스트판은 비워 둔다)
export const APP_CHECK_KEY = '';      // reCAPTCHA v3 사이트 키
export const MEASUREMENT_ID = '';     // Google Analytics 측정 ID
