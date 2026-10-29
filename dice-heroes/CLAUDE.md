# 키보리아 작업 규칙

## 반영(배포) 규칙
- **모든 수정(원정 포함)은 테스트판과 배포판 모두에 반영한다.**
  `main` 에 합치면 GitHub Pages(테스트판)에 바로 반영된다. 그 뒤 Actions 의 `dice-heroes-prod.yml` 을 `targets=hosting,database` 로 실행한다
  (`engine.js` · `wallet-rules.js` · `achievements.js` · `run/rules.js` · `i18n.js` · `dice-heroes-prod/functions` 가 바뀌면 `,functions` 추가 — 서버가 같은 파일로 결과를 계산한다).
- 배포판 빌드(`dice-heroes-prod/build.mjs`)는 `run/` 과 원정 그림 · 곡을 함께 넣는다 (`run/*.md` 문서만 뺀다).
- **테스트판 전용 기능은 배포판에 코드째로 넣지 않는다**: 시험 원정(샌드박스) · 다이아 무제한 · 잠금 되돌리기 · 시험용 승천(무희) · `?demon` · `?debug`.
  줄 구간은 `// @test-only{` ~ `// }@test-only`, 한 줄 안은 `/*TEST{*/ … /*}TEST*/` 로 감싼다 (템플릿 글자 안이면 `${''/*TEST{*/ + (…)/*}TEST*/}`).
  배포판 빌드(`build.mjs` `stripTest`)가 잘라내고, 잘라낸 뒤 문법 검사 · 남은 테스트 코드(`TEST_LEFT`)가 있으면 빌드가 실패한다.
  새 테스트 전용 기능을 넣으면 같은 표시로 감싸고 `TEST_LEFT` 에 이름을 더한다. 잘라낸 뒤에도 배포판이 돌아가게 (남은 코드가 지운 것을 부르지 않게).

## 반영 순서
1. 작업 브랜치에 커밋 → `git fetch origin main && git merge origin/main`
2. `config.js` 의 `version` 을 올린다 (설치된 앱이 새 파일을 받는다)
3. `npm test` (엔진 · 원정 · 광고) 통과 확인 → 푸시 → PR 만들고 합치기
4. 위 규칙에 따라 배포판 배포 여부를 정한다

## 미리 받기 규칙 (그림 · 음악)
- **모든 그림 · 음악은 사람이 버튼을 누르기 전에 이미 받아져 있어야 한다.** 누른 뒤에 받기 시작해서 빈칸 · 깜빡임 · 늦은 음악이 보이면 버그다.
- 새 화면 · 새 그림 · 새 곡을 넣을 때는 그 화면으로 가는 버튼이 보이는 시점(또는 그 전)에 미리 받는 코드를 함께 넣는다.
  - 원정: `run/ui.js` 의 `warm()` (시작 화면에서 원정 버튼이 보이면 app.js 가 부른다) · `preloadRun()` (원정 시작 로딩 화면).
    원정 그림을 새로 넣으면 `run/art.js` 의 `runAssetURLs()` · `run/relic-art.js` 의 `relicURLs()` 목록에 들어가는지 확인한다.
  - 그 밖: 곡은 `preloadBgm()`, 주사위 · 트레이 스킨은 `preloadDice()` · `preloadTray()`, 3D 는 `preload3d()`.
- 확인 방법: 브라우저 시험에서 버튼을 누른 뒤에 새 그림 · 곡 요청이 생기지 않는지 본다.
- **곡 주소의 버전은 게임 버전이 아니라 `audio.js` 의 `BGM_VER`** 다 (업데이트마다 곡을 다시 받지 않게).
  곡 파일(`assets/bgm/*.ogg`)을 바꾸거나 더하면 `audio.js` 와 `sw.js` 의 `BGM_VER` 를 함께 올린다 (안 올리면 캐시의 예전 곡이 나온다).
- **주사위 · 트레이 그림 주소의 버전은 `skins.js` 의 `ART_VER`** 다 (게임 버전 아님). 그림 파일을 바꾸거나 더하면 `skins.js` 와 `sw.js` 의 `ART_VER` 를 함께 올린다.
- **원정 그림 주소의 버전은 `run/art.js` 의 `RUN_ART_VER`** 다 (게임 버전 아님 — 게임 버전으로 하면 업데이트마다 원정 그림 전부를 다시 받는다). `assets/run/` 그림을 바꾸거나 더하면 이것을 올린다.
- 서비스워커(`sw.js`): 버전(`?v=`)이 붙은 그림 · 곡은 캐시에 있으면 다시 받지 않고, 새 버전을 받으면 예전 버전을 캐시에서 지운다. 버전 없는 그림은 실행마다 한 번만 뒤에서 새로 받는다.
- 3D 주사위 · 트레이 그림은 받기 전엔 캔버스로 그린 대신 그림을 입혀 둔다 (`dice3d.js` `imageTex` — 검은 면이 보이면 버그).
- 배경음악: 다음 곡이 준비될 때까지 앞 곡을 이어 틀다가 겹쳐 바꾼다. 받은 곡 파일(압축)은 메모리에 두고, 풀어 둔 곡은 최근 3개만 (곡 하나 풀면 약 26MB).
- **다음 화면은 지금 화면에 머무는 동안 준비한다.** 메뉴 · 고르기 화면은 `warmStage()` 로 3D 트레이 · 내 스킨 그림을 한가할 때 만들어 둔다.
  원정 지도는 지금 갈 수 있는 칸의 곡만 풀어 두고(`preloadBgm`) 나머지 전투 곡은 파일만 받아 둔다(`prefetchBgm` — 풀어 둔 곡은 3개까지라 다 풀면 서로 밀어낸다).
- **싸움 화면(대전 · 협동 · 원정 전투)은 `stageReady()` 가 끝난 뒤에 연다**: 3D 트레이를 만들고, 쓰일 주사위 · 트레이 그림을 다 받아 둔다 (최대 8초).
  싸움 화면으로 가는 새 길을 만들면 그 앞에서 `stageReady()` (원정은 `X.stageReady()`) 를 기다린다.
- 첫 화면은 메뉴 곡(`title`)을 다 받을 때까지 불러오기 막대(글자 없음)를 보여 주고, 다 받으면 「화면을 터치하세요」 (`app.js` `bootGate()`, 8초가 넘으면 그냥 연다).

## 다국어 (11개: 한국어 · English · 日本語 · 简体中文 · 繁體中文 · Español · Português(BR) · Русский · Deutsch · Français · Bahasa Indonesia)
- 화면에 보이는 글자는 모두 `TR('한국어 원문', 값…)` 로 쓴다 (`import { t as TR } from './i18n.js'`). 값은 원문 안 `{0}` `{1}` 자리에 들어간다 — 문장을 쪼개 이어 붙이지 말고 문장째로.
- 번역표는 `lang/<코드>.js` (열쇠 = 한국어 원문, 코드는 `i18n.js` 의 `LANGS`). **새 한국어 문장을 넣으면 모든 번역표에 같은 열쇠로 번역을 더한다.** 없으면 그 언어 화면에 한국어가 보인다.
  번체(zh-Hant)는 간체에서 OpenCC `s2twp`(대만 표현)로 만든 뒤 고친다.
- 기기 언어 → 게임 언어는 `i18n.js` `fromDevice` (zh-TW · HK · MO · Hant → 번체, 그 밖 zh → 간체, 없는 언어 → English).
- `npm test` 의 `test/i18n.test.mjs` 가 번역 없는 문장 · 감싸지 않은 한국어를 알려 주고, 자리표시 `{n}` 이 원문과 다르면 실패한다.
  많이 바꿨으면 `npm i --no-save acorn@8 acorn-walk@8 && node tools/i18n-wrap.mjs <파일> <i18n.js 상대경로>` 로 한꺼번에 감싼다.
- 같은 한국어가 뜻이 둘이면 원문 끝에 `⟪문맥⟫` 을 붙여 열쇠를 나눈다 (예: `TR('트레이⟪족보⟫')` = 3 족보). 화면엔 안 보인다.
- 한국어 글자로 판정하는 코드(정규식 · `includes('한국어')` · 비교)는 쓰지 않는다 — 다른 언어에서 깨진다. 판정은 플래그 · id 로.
- 판 결과를 정하는 규칙(engine.js · run/rules.js)은 언어와 상관없어야 한다. 서버 · 시험은 언제나 한국어.
- 다른 언어 HTML 안에 `<이름>` 처럼 꺾쇠를 쓰면 태그로 읽혀 사라진다 → `«이름»`. CSS `content:` 글자는 `html:lang(<코드>)` 로 언어마다 따로 (style.css · run/run.css).
- 서체: 갈무리(Galmuri11)는 한글 · 라틴 · 키릴 · 베트남 · 일본어 가나 · 한자를 그린다. **중국어 한자는 `fonts/KyboriaHanzi-SC/TC.woff2`**
  (Fusion Pixel 12px 를 줄인 것 — 번역표에 쓰인 글자만). 중국어 번역을 바꾸면 `python3 tools/zh-font.py <sc.woff2> <tc.woff2>` 로 다시 만든다 (방법은 파일 머리말).
  아랍어(오른쪽→왼쪽 · 픽셀 서체 없음) · 태국어 · 힌디어는 서체가 없어 아직 넣지 않았다.
- **언어는 다시 불러오지 않고 바로 바뀐다** (설정 → 언어, `app.js` `showLangPicker` · `pickLang`). `i18n.js` `setLang` 이 번역표를 받고 `langchange` 를 알리면 `redrawScreen()` 이 지금 화면을 다시 그린다.
  새 화면(screen)을 만들면 `redrawScreen` 에 다시 그리는 함수를 더한다 (원정은 `run/ui.js` `redraw`).
  - **파일을 불러올 때 만드는 표의 글자는 `tL('…')`** (살아 있는 글자 — 쓰일 때마다 지금 언어로). 화면을 그리는 함수 안은 그대로 `TR`.
    `TR` 을 맨 위 표에 새로 넣었으면 `node tools/i18n-live.mjs <파일>` 로 바꾼다. 이어 붙여 표에 넣는 글자는 `live(() => \`${a} ${b}\`)`.
  - `tL` 글자는 `typeof` 가 'object' 이고 `===` 로 비교되지 않는다 → 번역 글자끼리 비교하지 말고 id 로. 저장 · 온라인으로 보내는 '사람 데이터'(이름 등)는 그냥 `TR`.
  - 판 상태(S · R)에 복사된 글자는 저장(JSON)하면 그 언어로 굳는다 → 화면에는 id 로 표에서 찾아 그린다. 기본 이름(나 · 고블린 봇 …)은 `pickLang` 이 바꿔 준다.
- 다른 언어는 글이 길다: 새 화면을 만들면 영어 · 독일어 · 러시아어로 넘침을 본다 (390px 폭, 옆으로 밀려나거나 겹치면 버그). 화면 폭을 넓히는 `1fr` 격자 · `nowrap` 을 조심.

## 원정 밸런스
- 수치는 `run/rules.js` 의 `TUNE` (적 체력 · 공격, 막 · 종류별) · `RUN_CLASSES` (직업 체력) · `CLASS_TUNE` (직업 능력) · `RELIC_TUNE` (유물 수치).
- 봇은 원정에서 늘 최선을 고른다고 보고 잰다: 다시 굴리기는 요트 DP(`rollPlan` — 주사위 조합마다 '멈추기 · 남기고 다시 굴리기' 기댓값을 끝까지 계산), 도구 · 배팅 · 유물 고르기도 기댓값으로.
- **목표 (초회차 = 원정 성장 없음): 직업마다 1막 클리어 50% · 2막 25% · 3막 5%. 죽음은 대부분 보스전** (보스는 거의 모든 공격에 방해가 붙는다).
  `node sim/acts.mjs 300` 으로 잰다 (덮어쓰기 시험은 파일 머리말).
- **돌연사(한 턴에 최대 체력의 절반 이상 잃고 죽음)는 적게.** 적 한 턴 공격은 `TUNE.cap`(45%) × max(최대 체력, `TUNE.capRef`) 까지, 연타는 쌓인 힘을 한 대에 절반만 (`atkOf`).
  `sim/acts.mjs` 의 '한 방 50%+ 죽음' 줄로 본다. 긴장감은 한 방이 아니라 꾸준한 압박으로.
- 히든 보스 「시공 광대」(지도에 없다 · `run/rules.js` JESTER_*): 막마다 이길 확률 30% 안팎. `node sim/jester.mjs` 로 재고 `TUNE.hp/atk.special` 로 맞춘다. 보스별 승률은 `node sim/bosses.mjs`.
- 유물 희귀도는 클리어율 기여로 나눈다: 보스 +16%p 이상 · 희귀 +8 ~ 16%p · 일반 그 아래. `node sim/relics.mjs` 로 재고 `RELIC_POWER` 도 같이 고친다.

## 원정 기록 · 별조각 (조작 방지)
- 저장은 `run/progress.js` 한 곳. 배포판은 서버 지갑 `wallets/<uid>/run` (앱은 읽기만), 테스트판은 이 기기(localStorage).
- 배포판 흐름: `xStart` 가 시드를 정하고 원정 준비를 적어 둔다 → 원정 중 행동은 `act()` 로 `R.acts` 에 쌓인다 →
  `xFinish` 가 같은 `run/rules.js` 로 `replay()` 해서 승패 · 층 · 도전과제 · 별조각을 서버에서 계산한다.
- 그래서 **판의 상태를 바꾸는 행동은 반드시 `act('이름', fn)` 으로 감싼 함수로만** 한다 (화면에서 `R` 을 직접 고치면 서버 다시 돌리기와 어긋난다).
  `node test/run.test.mjs` 의 다시 돌리기 테스트가 지켜 본다. 배포판 빌드는 `run/rules.js` 를 `functions/shared/run/` 에 복사한다.
- 서버 함수(xProgress · xStart · xFinish · xBuy)는 `run/rules.js` 를 바꾸면 함께 배포한다 (`,functions`).

## 입장권 (원정 · 협동 보스전 공용)
- 규칙 · 수치는 `wallet-rules.js` `TICKET` (처음 10장 · 매일 0시(한국) 5장 미만이면 5장까지 · 광고 +1 하루 10번). 바꾸면 `,functions` 함께 배포.
- 쓰는 곳: 원정 시작(서버 `xStart`) · 봇 협동 시작(서버 `startRun` mode coop) · 온라인 협동 방은 방장만(`roomTix`, 친구 무료). **대전 · 시험 원정은 무료.**
  온라인 협동 판의 보석 정산(`claimRun` room)은 `tixRooms/<방코드>_<시드>` 기록이 있어야 준다. 인터넷 없는 판은 입장권 없이 하지만 보석 · 기록도 없다.
- 앱: 시작 버튼은 `ticketGate(go)` 로 감싼다 (없으면 입장권 창 `showTickets` → 광고 보고 받으면 바로 이어서 시작). 원정은 `X.ticketGate` · `X.ticketUsed`.
- 보상형 광고는 `ads.js` `rewardAd()` (H5 `type: 'reward'`). 광고가 꺼져 있거나 없으면 광고 없이 준다 (하루 10번 한도는 그대로).
- 유료 묶음(10장 ₩2,000)은 창에 '곧 열려요'로만 보인다 — 결제는 결제 세션이 붙인다 (`wallet.js` 에 지급 함수를 더하고 서버가 영수증 확인 뒤 `tix.n` 을 늘린다).

## 유저 테스트 통계 (리텐션 · 접속 시간)
- 게임 이벤트는 `live.js` `track(이름, 값)` 한 곳으로 보낸다 → Google Analytics + `telemetry.js` (플레이 통계, 배포판만).
- `telemetry.js`: 기기마다 날짜(한국 자정)별 세션 · 플레이 시간(1분 안에 만진 시간) · 화면별 체류 · 모드별 판 수 · 처음 해 본 시각(이정표) · 앱을 내린 화면을 모아 1분마다 `tele/<uid>` 에 덮어쓴다.
  화면 이름은 `app.js` `screenName()` (원정은 `run/ui.js` `where()`). 새 화면을 만들면 이름이 잡히는지 본다. 새 기능을 넣으면 `track` 을 더하고, 첫 경험 단계로 볼 것이면 `telemetry.js` `MILESTONE` · `stats.js` `FUNNEL` 에도.
- 설정 → 사용 통계 보내기 (기본 켜짐 · 유럽 시간대는 기본 꺼짐). 내 데이터 지우기는 `tele/<uid>` 도 지운다. 개인정보처리방침(privacy.html)과 맞춘다.
- 보기: 배포판 `?stats` (관리자만 — `admins/<uid> = true`, Actions 'KYBORIA 관리자 등록'). Firebase 콘솔 → Analytics 에서도 리텐션 · 참여 시간.

## 저사양 폰 · 느린 망 (내려받기 순서 · 메모리)
- **화면은 그 화면에 필요한 그림 · 곡을 다 받은 뒤에 연다 (덜 받은 그림으로 열지 않는다).** 0.6초 넘게 걸리면 `app.js` `readyOrWait` 가 「불러오는 중」 막대를 띄운다 (최대 25초).
  싸움 화면: `startGame` (트레이 · 주사위 · 모션 · 초상화 · 보스 그림), 원정: `run/ui.js` `preloadRun` (원정 그림 전부 + 지도 곡), 혼자 플레이 창 · 고르기 화면: `spriteReady`.
- **미리 받기는 `bgload.js` 줄로**: `bgImage(url, 순위)` · `bgFile(url, 순위, 큰파일)`. 한 번에 2개(느린 망 1개), 첫 화면이 준비된 뒤 시작(`bgStart` · `afterBoot`),
  화면이 꼭 필요한 것을 받는 동안(`fg(약속)`)은 멈춘다. 화면이 기다리는 것은 `now=true` 로 줄에서 앞으로 뺀다. `new Image()` · `fetch` 로 따로 한꺼번에 받지 않는다 (서로 대역폭을 다퉈 시작이 늦어진다).
- 서비스워커 설치 때는 첫 화면에 필요한 것만 받는다 (`sw.js` FILES). 그림 · 곡은 앱이 받을 때 캐시에 들어간다.
- **영웅 · 보스 그림 주소의 버전은 파일 내용 해시** (`asset-ver.js`, `node tools/asset-ver.mjs`). `assets/heroes` · `assets/boss` 그림을 바꾸거나 더하면 다시 만든다 (npm test 가 알려 준다).
  게임 버전(`?v=0.x`)을 그림 주소에 붙이지 않는다 — 업데이트마다 바뀌지 않은 그림까지 다시 받는다.
- `index.html` 의 modulepreload 는 `node tools/preload.mjs` 로 만든다 (app.js 의 import 를 바꾸면 npm test 가 알려 준다).
- 갈무리11 보통 굵기는 `fonts/Galmuri11-core.woff2`(늘) + `-cjk.woff2`(가나 · 한자가 화면에 있을 때만). 원본 `Galmuri11.woff2` 를 바꾸면 `python3 tools/split-font.py`.
- 저사양 폰(메모리 3GB 이하 · 코어 4개 이하)은 3D 해상도 1.5배까지(`gfxMode` 'auto'), 메모리 4GB 이하는 모션 시트를 화면 크기에 맞춰 줄여 둔다 (`motion.js` `shrink`).
- **용량 한도 (`tools/asset-budget.mjs`, npm test)**: 영웅 모션 시트 1536×3072(칸 384) · 1MB, 전신 512 · 80KB, 상반신 192 · 24KB, 보스 150KB, 그 밖의 그림 200KB, 곡 1.1MB.
  칸 384 = 화면 속 영웅 약 113px × 기기 픽셀 3배(339px)에 맞춘 크기 — 더 키워도 보이는 차이 없이 받는 양 · 메모리만 는다. 넘으면 한도를 올리기 전에 줄일 방법부터.
- **곡은 Vorbis 품질 2.5 (약 110kbps · 48kHz)**: `ffmpeg -i 원본 -map_metadata -1 -c:a libvorbis -q:a 2.5 -ar 48000 곡.ogg`. 길이가 표본 단위로 같아 루프 지점(`BGM_LOOP`)이 그대로다.
  (예전 160kbps 17.8MB → 9.5MB. 높은음 18kHz 까지 남는다)
- 점검: 느린 망(1.6Mbps · 왕복 0.15초) + CPU 4배 느리게로 화면별 기다림 · 화면이 뜬 뒤 늦게 받는 그림을 잰다 (Playwright CDP `Network.emulateNetworkConditions` · `Emulation.setCPUThrottlingRate`).
