# 삼신할매 (samsinhalmae · nub-miniapp)

12~14주 초음파에서 사용자가 직접 척추선·생식결절선을 그으면 그 사잇각(NUB 각도법)으로
아기 성별을 **재미로** 점지해 주는 앱인토스(Apps in Toss) 미니앱이에요.
SNS 트렌드 앱(`../miniapp`)과는 **완전히 별개의 새 앱**입니다.

- 앱 이름(한국어): **삼신할매**
- 고유 appName: **samsinhalmae**
- 앱 로고: `public/icon.png` (600×600, 콘솔 앱 등록 시 업로드)

## 흐름

1. 사진 올리기 (또는 예시로 연습)
2. 척추선 → 생식결절선 두 개 긋기 (각도 실시간 계산)
3. **보상형 광고 시청** (토스 앱: 전면/보상형 광고 · 토스 밖: 30초 카운트다운 폴백)
4. 예측 결과 확인 · 공유

## 광고 연동

`@apps-in-toss/web-framework`의 통합 광고 API(`loadFullScreenAd` / `showFullScreenAd`,
보상형)를 사용해요. 결과는 `userEarnedReward` 이벤트(광고 끝까지 시청)로만 잠금 해제돼요.

- 현재 광고 그룹 ID는 **테스트용**(`ait-ad-test-rewarded-id`)입니다.
- 출시 전 `index.html`의 `AD_GROUP_ID`를 **콘솔에서 발급한 실제 보상형 광고 그룹 ID**로 교체하세요.
  (실 ID로 테스트하면 정책 위반이 될 수 있어요.)

## 출시 전 체크

- [ ] 콘솔에 새 앱 등록 → `granite.config.ts`의 `appName` / `displayName` 일치
- [ ] 앱 아이콘 URL 교체(`brand.icon`)
- [ ] 보상형 광고 그룹 생성 → `AD_GROUP_ID` 교체
- [ ] 토스 샌드박스 앱에서 광고 로드·시청·뒤로가기 동작 확인

## 개발

```bash
npm install
npm run dev
```

## 배포

```bash
npm run build
npm run deploy
```

- 배포 API 키: [앱인토스 콘솔](https://apps-in-toss.toss.im/) > 워크스페이스 > API 키
