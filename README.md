# 요즘 뭐가 유행이야? 👀 — SNS 트렌드 앱 (토스 인앱용)

트렌드를 잘 못 따라가는 사람을 위한 오늘의 인스타/SNS 유행 키워드 모아보기 앱.

## 파일 구성

- `index.html` — 앱 본체 (단일 파일, 외부 라이브러리 없음)
- `trends.json` — 트렌드 데이터 (이 파일만 갱신하면 앱에 자동 반영)

## 데이터 갱신 방법

`trends.json`의 `trends` 배열에 항목을 추가/수정하면 끝.

```json
{
  "keyword": "키워드명",
  "emoji": "🔥",
  "category": "밈·챌린지 | 푸드 | 유행어",
  "status": "rising | peak | steady | falling",
  "since": "2026.07",
  "summary": "카드에 보이는 한 줄 요약",
  "description": "상세 설명",
  "usage": "이렇게 써요 팁",
  "links": [
    { "type": "instagram", "label": "인스타 해시태그", "q": "검색어" },
    { "type": "youtube",   "label": "유튜브 검색",     "q": "검색어" },
    { "type": "naver",     "label": "네이버 검색",     "q": "검색어" }
  ]
}
```

- `updatedAt`은 `YYYY-MM-DD HH:MM` 형식 권장 (헤더에 "YYYY.MM.DD HH:MM 업데이트"로 표시됨. 날짜만 쓰면 시간 생략)
- `summary`(상단 배너 문구)도 함께 갱신 권장
- 링크 URL은 앱이 `q`값으로 자동 생성 (인스타는 공백 제거 후 해시태그 URL)
- `type`은 `instagram` / `youtube` / `naver` / `x` 지원, 직접 URL은 `{"type":"url","url":"..."}` 대신 `url` 필드 사용

매일 갱신 자동화: Claude에게 "trends.json 오늘 트렌드로 갱신해줘"라고 요청하거나 예약 작업으로 등록 가능.

## 자동 갱신 동작 (2026-07-13 추가)

- 앱이 열려 있는 동안 **6시간마다** `trends.json`을 다시 불러와 자동 반영
- 웹뷰가 백그라운드에서 돌아올 때(`visibilitychange`)도 마지막 로드 후 6시간이 지났으면 즉시 갱신
- 데이터가 실제로 바뀐 경우(updatedAt 변경)에만 다시 그리고 토스트로 알림
- 헤더에 업데이트 시각을 `YYYY.MM.DD HH:MM` 형식으로 작게 표시

## UI (2026-07-13 리디자인)

- 실시간 검색어 차트 스타일: 순위 숫자(1~3위 블루 강조) + 등락 배지
- 다크모드 자동 대응 (`prefers-color-scheme`)
- 스켈레톤 로딩, 카드 순차 등장 모션 (reduced-motion 존중)
- 상세 시트에 "친구에게 공유하기" (Web Share API → 클립보드 폴백)

## 토스 인앱(웹뷰) 호환 처리 내역

- `viewport-fit=cover` + `env(safe-area-inset-*)` — 아이폰 노치/홈바 대응
- `user-scalable=no`, 터치 하이라이트 제거, `overscroll-behavior` — 앱 같은 터치감
- 외부 링크: `window.open` 시도 → 차단 시 `location.href` 폴백 (웹뷰 팝업 차단 대응)
- `trends.json` fetch 실패 시(로컬 file:// 미리보기 등) HTML에 내장된 동일 데이터로 폴백
- localStorage/쿠키 미사용 — 웹뷰 스토리지 정책과 무관하게 동작
- 시스템 폰트 스택(Pretendard/Apple SD Gothic) — iOS·갤럭시 모두 네이티브 렌더링

## 인스타그램 트렌드 수집기 (collector/)

비밀번호 저장 없이 **세션 유지 프로필** 방식으로 동작 (Playwright).

```
# 최초 1회: 창이 뜨면 직접 로그인 → 터미널에서 Enter
python collector/insta_collect.py --login

# 이후: 헤드리스 수집 (hashtags.txt 순회 → out/collect_*.json)
python collector/insta_collect.py
```

- 수집 대상 해시태그는 `collector/hashtags.txt` 에서 관리
- 세션 쿠키는 `collector/.profile/` 에만 저장됨 (비밀번호 미저장)
- ⚠️ 인스타그램 자동화는 약관 제한 대상: 하루 1회만 실행, 수집 전용 서브계정 권장
- 요청 간 4~9초 무작위 대기로 봇 패턴 회피
- **자동 실행**: Windows 작업 스케줄러 `SNSTrend_InstaCollect` — 매일 09:00 (2026-07-14 등록)
  - 변경: `taskschd.msc` 또는 `schtasks /Change /TN SNSTrend_InstaCollect /ST HH:MM`
  - 세션 만료 시 수집이 실패하므로 가끔 `--login` 재실행 필요

## 배포

정적 파일 2개뿐이라 아무 정적 호스팅(GitHub Pages, Vercel, S3 등)에 올린 뒤
토스 앱스인토스 콘솔에 해당 URL을 등록하면 됩니다.
