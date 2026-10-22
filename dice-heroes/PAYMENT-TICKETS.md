# 결제 세션 전달: 입장권 유료 묶음 (10장 ₩2,000)

> 사용자 요청: "결제 시스템은 아직 구현은 하지 말고 결제 세션에 정보만 보내놓기만 해줘"
> → **지금은 구현하지 말 것.** 아래는 붙일 때 쓸 정보.

## 게임에 이미 들어간 것 (v0.39.71, PR #311)
- 공용 입장권(원정 · 협동 보스전). 대전 · 시험 원정은 무료.
- 규칙 · 수치: `wallet-rules.js` `TICKET = { start: 10, daily: 5, adMax: 10, max: 999 }`
  - `fixTix(w, now)`: 처음 10장, 매일 0시(한국, `dayOf`) 5장 미만이면 5장까지, 광고 횟수 초기화
  - `useTicket(w, now)`: 1장 쓰기, `adTicket(w, now)`: 광고 +1 (하루 10번)
- 지갑: `wallets/<uid>/tix = { n, day, ads }` — 서버 `view()` 가 `tix` 를 돌려준다.
- 서버 함수(`dice-heroes-prod/functions/index.js`): `xStart`(원정 1장) · `startRun` mode coop(1장) · `roomTix`(온라인 협동 방장 1장, `tixRooms/<코드>_<시드>`) · `adTix`(광고 +1). 입장권이 없으면 `resource-exhausted`.
- 앱: `app.js` `showTickets()` / `paintTickets()` 입장권 창 — 「입장권 10장 · ₩2,000 · 곧 열려요」 버튼이 `disabled` 로 있다.

## 붙일 때 제안 설계
1. **상품**: Google Play 인앱 소비성 상품, 예 `tix_10` = ₩2,000 → `tix.n += 10` (`TICKET.max` 상한).
2. **앱 (TWA)**: Digital Goods API (`getDigitalGoodsService('https://play.google.com/billing')`) + Payment Request API 로 구매 → `purchaseToken` 을 서버로.
3. **서버**: 새 callable `buyTix({ productId, purchaseToken })`
   - Google Play Developer API `purchases.products.get` 으로 확인 (purchaseState = 0, 아직 소비 안 됨)
   - `purchases/<purchaseToken>` 기록으로 중복 지급 막기
   - `change(uid, (w, now) => { R.fixTix(w, now); w.tix.n = Math.min(R.TICKET.max, w.tix.n + 10); })`
   - 그다음 consume (서버 `purchases.products.consume` 또는 앱에서)
4. **앱 연결**: `wallet.js` 에 `buyTicketPack()` 하나, `paintTickets()` 의 유료 버튼만 살린다. 테스트판(`PROD=false`)은 결제 없이 막아 둔다.
5. **준비물**: Play Console 판매자(merchant) 계정 · 인앱 상품 등록 · TWA 에 Play Billing 연결 · 서버용 서비스 계정(androidpublisher 권한, 비밀값으로).

## 지켜 줄 것
- 위 지점(`wallet.js` 지급 함수 · `paintTickets` 유료 버튼 · 새 서버 함수) 밖의 게임 코드는 건드리지 않는다.
- 수치는 `wallet-rules.js` `TICKET` 한 곳. 바꾸면 `,functions` 함께 배포.
- 새 화면 글자는 `TR()` + `lang/*.js` 10개 언어 (CLAUDE.md 다국어 규칙). 자세한 규칙은 CLAUDE.md 「입장권」 절.
