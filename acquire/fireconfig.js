// Firebase 설정 — 값이 채워져 있으면 "상시 서버 모드"(누가 나가도 게임 유지)로 동작합니다.
// 비워 두면 P2P 모드(방장 브라우저가 서버)로 떨어집니다. ?net=p2p 로 강제도 가능합니다.
//
// ⚠ 여기 값은 비밀이 아닙니다. Firebase 웹 설정값은 공개용 식별자이며,
//   GitHub Pages가 이 파일을 서빙해야 하므로 반드시 커밋해야 합니다.
//   실제 접근 제어는 database.rules.json 이 담당합니다.

export const firebaseConfig = {
  apiKey: 'AIzaSyAqzUMsSkkJ9twdryZH9Lvp4S5rXizUVy4',
  authDomain: 'acquire-950a0.firebaseapp.com',
  databaseURL: 'https://acquire-950a0-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'acquire-950a0',
  storageBucket: 'acquire-950a0.firebasestorage.app',
  messagingSenderId: '865925204000',
  appId: '1:865925204000:web:e71dc2f1cdab0ba5df1445',
};
