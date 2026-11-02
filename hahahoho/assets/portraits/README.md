# NPC 프로필 사진

NPC를 누르면 나오는 프로필과 "대화하기" 화면에 쓰는 사진입니다. 사진이 없으면 게임 속 도트 초상화가 대신 나옵니다.

지금 들어 있는 사진 9장(봄이·실비·레아·철수·순자·강태공·촌장님·민수·두리)은 AI(pollinations.ai · flux)로 만든 가상 인물이고("폰으로 찍은 스냅 · 보정 없는 피부 · 자연광" 식으로 사실적으로 뽑음). 이 서비스는 세로로 요청하면 정사각형 그림을 가로로 눌러 찌그러뜨리므로, 정사각형(1024×1024)으로 받아 크기 조정 없이 세로 4:5로 잘라냈습니다, 아래쪽 워터마크를 잘라 2:3 WebP 로 줄였습니다. 남주혁(`juhyuk`)·카리나(`karina`)는 직접 올린 사진입니다.

## 넣는 방법

1. 이 폴더에 사진을 넣습니다. 파일 이름은 NPC 아이디 (예: `karina.jpg`, `juhyuk.webp`).
2. `portraits.json` 에 한 줄씩 적습니다.

```json
{ "karina": "karina.jpg", "juhyuk": "juhyuk.webp" }
```

- 세로 2:3 비율 (예: 800×1200), 얼굴이 위쪽 1/3쯤 오게, 상반신
- jpg 또는 webp, 한 장에 300KB 이하 권장 (휴대폰 데이터 절약)
- 올린 뒤에는 `version.json` 과 `src/version.js` 의 버전을 올려야 휴대폰에 새로고침 알림이 뜹니다

## NPC 아이디 · AI 이미지 프롬프트 예시

공통으로 붙이면 좋은 말: `portrait, upper body, soft natural light, shallow depth of field, high detail, photorealistic, 2:3 vertical, looking at camera, gentle smile, fictional person`

| 아이디 | 이름 · 직업 | 프롬프트 예시 |
|---|---|---|
| `juhyuk` | 남주혁 · 배우 | (받은 사진 사용) |
| `karina` | 카리나 · 가수 · 댄서 | (받은 사진 사용) |
| `bomi` | 봄이 · 시장 상인 | cheerful young Korean woman, market vendor, auburn hair in a bun, pink apron, holding a basket of strawberries, cozy village market stall |
| `silvi` | 실비 · 재봉사 | elegant young woman, tailor, long blonde hair, lavender blouse, measuring tape around neck, sewing studio with fabric rolls |
| `rea` | 레아 · 모험가 | confident young woman, adventurer, red ponytail, green leather jacket, map and sword, ancient forest ruins background |
| `chulsu` | 철수 · 대장장이 | strong middle-aged Korean man, blacksmith, short black hair and beard, gray work apron, forge sparks in background |
| `sunja` | 순자 할머니 · 식당 주인 | kind elderly Korean woman, restaurant owner, gray hair in a bun, red apron, steaming stew pot, warm kitchen |
| `kang` | 강태공 · 낚시꾼 | weathered older Korean man, fisherman, cap, teal vest, fishing rod, calm lake at dawn |
| `mayor` | 촌장님 · 마을 촌장 | dignified elderly man, village chief, white hair and beard, navy vest, town square with notice board |
| `minsu` | 꼬마 민수 · 마을 아이 | cute young boy about 8 years old, yellow t-shirt, playing with a cat in a village square (아이는 귀엽고 건전하게) |
| `duri` | 숲지기 두리 · 숲지기 | gentle middle-aged forest keeper, green cap and beard, green work clothes, planting a sapling in a sunlit forest |
