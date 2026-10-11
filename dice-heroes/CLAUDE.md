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

## 원정 밸런스
- 수치는 `run/rules.js` 의 `TUNE` · `RUN_CLASSES` · `CLASS_TUNE`. `node sim/run.mjs 300` 으로 직업별 클리어율을 잰다.
- 목표: 무료 직업(도박사 · 수도승) 약 25%, 보석 직업 30~35%, 평균 약 31%.
