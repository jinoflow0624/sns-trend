// Firebase 설정 — 아콰이어 온라인과 같은 Firebase 프로젝트(같은 서버)를 쓴다.
// 저장 위치는 분리되어 있다: 아콰이어는 /rooms, 하하호호는 /hahahoho 아래만 쓴다.
// 값을 비우면 서버 없이 이 기기에만 저장하는 혼자 하기 모드로 동작한다.
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
