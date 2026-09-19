// ┌──────────────────────────────────────────────────────────────────────────┐
// │  Firebase 설정 — 비워 두면 P2P 모드(방장 브라우저가 서버)로 동작합니다.   │
// │  값을 채우면 "상시 서버 모드"가 켜져, 누가 나가도 게임이 유지됩니다.      │
// │  설정 방법은 README.md의 "상시 서버 모드 켜기"를 보세요.                 │
// └──────────────────────────────────────────────────────────────────────────┘
//
// ⚠ 여기 들어가는 값은 비밀이 아닙니다. Firebase 웹 설정값은 공개용 식별자라
//   저장소에 커밋해야 정상 동작합니다(GitHub Pages가 이 파일을 서빙해야 하므로).
//   실제 접근 제어는 database.rules.json 이 담당합니다.

export const firebaseConfig = {
  // apiKey: 'AIza...',
  // authDomain: '<프로젝트>.firebaseapp.com',
  // databaseURL: 'https://<프로젝트>-default-rtdb.asia-southeast1.firebasedatabase.app',
  // projectId: '<프로젝트>',
  // appId: '1:000000000000:web:0000000000000000000000',
};
