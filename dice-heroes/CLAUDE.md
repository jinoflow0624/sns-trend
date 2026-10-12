# 요트 히어로즈 작업 규칙

## 반영(배포) 규칙
- **원정(`run/` 폴더 · 로그라이크) 수정은 테스트판에만 반영한다.**
  `main` 에 합치면 GitHub Pages(테스트판)에 바로 반영된다. 배포판 배포(`dice-heroes-prod.yml`)는 돌리지 않는다.
  배포판 빌드(`dice-heroes-prod/build.mjs`)는 `run/` 을 빼고, 배포판 화면에는 원정 버튼이 없다. 원정을 배포판에 넣는 것은 사용자가 따로 말할 때만.
- **원정 이외의 수정은 테스트판과 배포판 모두에 반영한다.**
  `main` 에 합친 뒤 Actions 의 `dice-heroes-prod.yml` 을 `targets=hosting,database` 로 실행한다
  (`engine.js` · `wallet-rules.js` · `achievements.js` · `dice-heroes-prod/functions` 가 바뀌면 `,functions` 추가).
- 한 번에 원정과 원정 이외가 함께 바뀌면 배포판도 배포한다 (배포판 빌드가 `run/` 을 빼므로 원정은 들어가지 않는다).
  원정 때문에 공용 파일(`audio.js` · `app.js` 등)을 고쳤다면, 배포판 동작이 바뀌지 않는지 확인한다.

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
- 첫 화면은 메뉴 곡(`title`)을 다 받을 때까지 불러오기 막대(글자 없음)를 보여 주고, 다 받으면 「화면을 터치하세요」 (`app.js` `bootGate()`, 8초가 넘으면 그냥 연다).

## 원정 밸런스
- 수치는 `run/rules.js` 의 `TUNE` · `RUN_CLASSES` · `CLASS_TUNE`. `node sim/run.mjs 300` 으로 직업별 클리어율을 잰다.
- 목표: 무료 직업(도박사 · 수도승) 약 25%, 보석 직업 30~35%, 평균 약 31%.

## 원정 기록 · 별조각 (조작 방지)
- 저장은 `run/progress.js` 한 곳. 배포판은 서버 지갑 `wallets/<uid>/run` (앱은 읽기만), 테스트판은 이 기기(localStorage).
- 배포판 흐름: `xStart` 가 시드를 정하고 원정 준비를 적어 둔다 → 원정 중 행동은 `act()` 로 `R.acts` 에 쌓인다 →
  `xFinish` 가 같은 `run/rules.js` 로 `replay()` 해서 승패 · 층 · 도전과제 · 별조각을 서버에서 계산한다.
- 그래서 **판의 상태를 바꾸는 행동은 반드시 `act('이름', fn)` 으로 감싼 함수로만** 한다 (화면에서 `R` 을 직접 고치면 서버 다시 돌리기와 어긋난다).
  `node test/run.test.mjs` 의 다시 돌리기 테스트가 지켜 본다. 배포판 빌드는 `run/rules.js` 를 `functions/shared/run/` 에 복사한다.
- 서버 함수(xProgress · xStart · xFinish · xBuy · xEquip)는 원정을 배포판에 넣을 때 함께 배포한다.
