// 빌드 종류: 'test' = GitHub Pages 테스트판 (아콰이어 Firebase 공유, 로그인 없음)
//            'prod' = 실제 배포판 (전용 Firebase: 익명 로그인 · 보안 규칙 · App Check · Remote Config · Analytics)
// 배포판 빌드(dice-heroes-prod/build.mjs)가 이 파일을 'prod' 로 바꿔 쓴다.
export const ENV = 'test';
