# 다이스 히어로즈 배포판 (Firebase + 구글 플레이)

게임 소스는 하나(`../dice-heroes`)이고, 빌드할 때 **테스트판**과 **배포판**으로 나뉩니다.

| | 테스트판 | 배포판 |
|---|---|---|
| 주소 | GitHub Pages `…/sns-trend/dice-heroes/` | Firebase Hosting `https://diceheroes-4fbbb.web.app` |
| Firebase | 아콰이어와 같이 쓰는 프로젝트 (`acquire-950a0`) | **다이스 히어로즈 전용 프로젝트** |
| 로그인 | 없음 (기기 토큰) | 익명 로그인 (가입 없이 기기마다 고유 번호) |
| DB 보안 규칙 | 열려 있음 (시험용) | `database.rules.json` — 방 구성원만 게임 상태를 바꾼다 |
| App Check | 없음 | reCAPTCHA v3 (사이트 키를 넣으면 켜짐) |
| 공지·점검·최소 버전 | 없음 | Remote Config (`notice` · `maintenance` · `min_version`) |
| 사용 통계 | 없음 | Analytics — 설정에서 **동의한 사람만** (기본 꺼짐) |
| 오래된 방 청소 | 없음 | 6시간 지난 방을 방 만들 때마다 5개씩 지움 |
| 반영 | `main` 에 합치면 바로 | Actions 에서 “Dice Heroes 배포판 배포” 실행 |

모두 **무료 요금제(Spark)** 로 동작합니다. 정식 출시 뒤 동접 100명을 넘길 즈음 Blaze(종량제)로 바꾸면 됩니다.

## 폴더

```
dice-heroes-prod/
  build.mjs                  ../dice-heroes → dist/public (env=prod, 배포판 설정으로 교체)
  fireconfig.prod.js         ← 전용 Firebase 웹 설정을 넣는 곳
  firebase.json              Hosting 헤더 · DB 규칙 · Remote Config · 에뮬레이터
  .firebaserc                ← 프로젝트 ID
  database.rules.json        배포판 보안 규칙
  remoteconfig.template.json Remote Config 매개변수 3개
  twa/twa-manifest.json      구글 플레이(TWA, Bubblewrap) 설정
  twa/assetlinks.template.json  앱 ↔ 사이트 연결 파일 틀
```

## 1. Firebase 프로젝트 만들기 (한 번)

1. https://console.firebase.google.com → **프로젝트 추가** → 이름 `dice-heroes` (Google Analytics 사용 **켜기**, 계정은 기본)
2. **빌드 → Realtime Database → 데이터베이스 만들기** → 위치 **싱가포르(asia-southeast1)** → “잠금 모드”로 시작
3. **빌드 → Authentication → 시작하기 → 로그인 방법 → 익명** 사용 설정
4. **프로젝트 설정 → 일반 → 내 앱 → 웹(</>)** 앱 추가 (이름 `dice-heroes-web`, Hosting 체크)
   → 나오는 `firebaseConfig` 값을 `fireconfig.prod.js` 에 붙여 넣기 (`measurementId` 포함)
5. `.firebaserc` 의 `YOUR-FIREBASE-PROJECT-ID` 를 프로젝트 ID 로 바꾸기
6. (선택, 권장) **App Check** → 웹 앱 → reCAPTCHA v3 등록
   - https://www.google.com/recaptcha/admin 에서 v3 사이트 만들기 (도메인: `diceheroes-4fbbb.web.app`, `diceheroes-4fbbb.firebaseapp.com`)
   - 사이트 키 → `fireconfig.prod.js` 의 `APP_CHECK_KEY`, 비밀 키 → Firebase App Check 화면에 입력
   - 며칠 지표를 본 뒤 Realtime Database 에 대해 **적용(Enforce)** 을 누른다

## 2. 배포

### 방법 A — GitHub Actions (권장)
1. Firebase **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → JSON 다운로드
2. GitHub 저장소 **Settings → Secrets and variables → Actions → New secret**
   이름 `FIREBASE_SERVICE_ACCOUNT_DICEHEROES`, 값은 JSON 파일 내용 전체
3. **Actions → Dice Heroes 배포판 배포 → Run workflow**
   - 처음 한 번은 대상에 `hosting,database,remoteconfig` 입력 (Remote Config 매개변수 생성)
   - 그다음부터는 기본값 `hosting,database` (콘솔에서 바꾼 공지를 덮어쓰지 않게)

### 방법 B — 내 컴퓨터에서
```bash
npm i -g firebase-tools
firebase login
cd dice-heroes-prod
node build.mjs
firebase deploy --only hosting,database          # 처음엔 ,remoteconfig 추가
```

### 에뮬레이터로 점검 (인터넷·계정 없이)
```bash
cd dice-heroes-prod
node build.mjs --emu
firebase emulators:start --only auth,database --project demo-diceheroes
# 다른 창에서: cd dist/public && python3 -m http.server 8793
# 브라우저: http://localhost:8793/?fbemu=127.0.0.1:9100&fbauth=127.0.0.1:9099
```

## 3. 운영 (Remote Config)

콘솔 → **Remote Config** 에서 값을 바꾸고 “변경사항 게시” → 1시간 안에 모든 기기에 반영됩니다.
- `notice` — 타이틀 화면 공지 한 줄
- `maintenance` — `true` 면 온라인 방 버튼이 “서버 점검 중” 안내로 바뀜 (혼자 하기는 그대로)
- `min_version` — 예: `1.0.0`. 이보다 낮은 버전 앱에 “업데이트해 주세요” 표시

## 4. 구글 플레이 (TWA)

웹 게임을 그대로 감싸는 안드로이드 앱입니다. 게임을 고치면 **웹만 배포해도 앱에 바로 반영**됩니다(스토어 심사 불필요).

1. **Google Play Console** 개발자 계정 등록 (1회 $25, 신원 인증 며칠 걸림)
2. 내 컴퓨터에 **Node.js 18+** 설치 → `npm i -g @bubblewrap/cli`
   (처음 실행 때 JDK 17 과 Android SDK 를 자동으로 받을지 물어봄 → Yes)
3. `twa/twa-manifest.json` 의 `YOUR-FIREBASE-PROJECT-ID` 를 실제 주소로 바꾼 뒤
   ```bash
   cd dice-heroes-prod/twa
   bubblewrap init --manifest https://diceheroes-4fbbb.web.app/manifest.webmanifest   # 기존 twa-manifest.json 값 확인
   bubblewrap build        # 서명 키(android.keystore)를 새로 만든다 — 비밀번호 꼭 보관! 저장소에 올리지 말 것
   ```
   → `app-release-bundle.aab` 생성
4. Play Console → 앱 만들기 → **내부 테스트**에 `.aab` 업로드 (Play 앱 서명 사용)
5. **앱 무결성 → 앱 서명** 의 SHA-256 지문과, `bubblewrap fingerprint list` 의 업로드 키 지문을
   `twa/assetlinks.template.json` 을 복사한 `twa/assetlinks.json` 에 넣고 → 다시 배포
   (그래야 앱 위쪽에 주소창이 안 보이고 전체 화면으로 열림)
6. 스토어 등록 정보: 앱 이름 · 짧은/긴 설명 · 아이콘 512 · 그래픽 이미지 1024×500 · 스크린샷 4장 이상
7. **앱 콘텐츠** 설문
   - 개인정보처리방침 URL: `https://diceheroes-4fbbb.web.app/privacy.html` (문의 이메일 채워 넣기)
   - 데이터 보안: “기기 또는 기타 ID(익명 ID) — 앱 기능용, 암호화 전송, 삭제 요청 가능(앱 안 ‘내 데이터 지우기’)”,
     Analytics 동의 시 “앱 활동 — 분석용”
   - 콘텐츠 등급(IARC) 설문 · 타겟 연령(13세 이상 권장) · 광고 없음
8. 새 개인 개발자 계정은 **비공개 테스트 12명 × 14일** 을 거쳐야 프로덕션 출시 신청이 가능

## 5. 무료 → 유료 전환 시점

Spark(무료) 한도: 동시 접속 100 · DB 다운로드 월 10GB · Hosting 전송 하루 360MB.
Firebase 콘솔 **사용량 및 결제** 에서 70%를 넘기 시작하면 Blaze 로 전환하고 예산 알림(예: 월 1만 원)을 걸어 두세요.
(Blaze 전환 완료 — 보석 정산은 Cloud Functions 가 한다. 6번 참고)

## 6. 보석 (게임 재화) · 구글 계정

- 보석은 `wallets/<로그인 번호>` 에 저장된다. **앱은 읽기만 하고, 늘리고 줄이는 건 모두 서버 함수**(`functions/`, Blaze 요금제)가 한다.
  - `wallet` 지갑 불러오기(처음이면 기본 보석) · `buy` 사기 · `startRun` 판 시작 기록 · `claimRun` 한 판 정산
  - 온라인 방 판: 서버가 방의 게임 기록(`rooms/DH-<코드>/state`)을 직접 읽어 승패·점수·남은 기술을 확인한다 (앱이 보낸 값은 안 쓴다)
  - 오프라인 판(봇전): 서버가 볼 수 없으니 판 시작 기록 필수 · 시작 1분 안 정산 불가 · 하루 15판 · 점수 1,500 상한 · 같은 판 두 번 정산 불가
  - 대전 승리 보상 하루 3회 · 보스·난이도별 첫 토벌(×3) 기록도 서버가 센다. 날짜는 서버 시간 (한국 자정 기준)
  - 가격·보상 규칙은 게임과 같은 `dice-heroes/wallet-rules.js` 를 `build.mjs` 가 `functions/shared/` 로 복사해 쓴다
  - 함수 위치: `asia-southeast1` (데이터베이스와 같은 싱가포르)
- **처음 함수를 배포할 때 필요한 권한** (Google Cloud 콘솔 → IAM): 배포용 서비스 계정(`firebase-adminsdk-…@diceheroes-4fbbb.iam.gserviceaccount.com`)에
  `편집자`, `Cloud Functions 관리자`, `Cloud Run 관리자`, `서비스 계정 사용자` 역할 (https://console.cloud.google.com/iam-admin/iam?project=diceheroes-4fbbb).
  함수만 먼저 배포(`functions`)해 성공을 확인한 뒤 `hosting,database` 를 배포한다 — 새 앱은 함수가 없으면 보석을 못 불러온다.
- 에뮬레이터 점검: `firebase emulators:start --only auth,database,functions` 후 `?fbemu=127.0.0.1:9100&fbauth=127.0.0.1:9099&fnemu=127.0.0.1:5001`
- **구글 계정 연결을 켜려면** Firebase 콘솔 → Authentication → 로그인 방법 → **Google 사용 설정** (지원 이메일 선택 후 저장).
  승인된 도메인에 `diceheroes-4fbbb.web.app` 이 있는지 확인. 켜기 전에는 설정의 '구글 계정 연결'이 오류를 낸다.
