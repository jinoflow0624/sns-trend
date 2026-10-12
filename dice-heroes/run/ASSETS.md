# 원정(로그라이크) 디자인 · 작곡 요청서

원정 모드는 지금 **테스트판에만** 있습니다 (`dice-heroes/run/`, 배포판 빌드에서는 빠짐).
그림 · 음악은 아래처럼 **임시본**으로 돌아가고 있어서, 디자인 · 작곡 세션에서 정식본을 만들면 바로 바꿔 끼울 수 있게 정리했습니다.

> **반영 현황 (v0.38.7)**: 적 16종(`assets/run/<id>.webp`), 지도 칸 · 키워드 · 물약 아이콘과 카드 틀(`assets/run/ui/`),
> 상점 · 휴식 · 보물 · 이벤트 9종 장면(`assets/run/scene/`), 막 배경 3장(`assets/run/bg_act*.webp`), 유물 37종(`run/relic-art.js`),
> 음악 5곡(`assets/bgm/run_*.ogg`)이 모두 정식본으로 들어갔습니다. 납품 zip 은 `python3 tools/make_run_art.py <적 폴더> <UI 폴더>` 로 변환합니다.
> 아직 임시: 키워드 `보존`(그림 없음, 공용 아이콘).

| 무엇 | 지금(임시) | 바꿀 곳 |
|---|---|---|
| 일반 적 · 엘리트 16종 | 16×16 도트 (`run/art.js` 의 `MON`) | `assets/run/<id>.webp` 512px → `run/art.js` 의 `FILES` 배열에 id 추가 |
| 막 보스 7종 | 협동 보스 그림 그대로 (`assets/boss/*.webp`) | 그대로 써도 됨 |
| 지도 · 전투 음악 | 대전 곡 `adventure` | `assets/bgm/run_*.ogg` → `audio.js` `BGM_FILES` + `run/ui.js` 의 `playBgm` 이름 |
| 휴식 · 이벤트 음악 | 타이틀 곡 `title` | 같음 |
| 보스전 | 협동 보스 곡 `boss_<id>` | 그대로 |
| 보상(보스 처치) | 칩튠 `victory` | 같음 |

---

## 1. 적 그림 16종 (최우선)

보스 그림과 **같은 규칙**으로 만듭니다. 아래 **[공통 스타일]** 문단을 앞에 붙이고, 적 문단을 이어 붙이면 됩니다.
톤 기준 그림으로 `assets/boss/demon.webp`(마왕 릴리스)를 함께 첨부하면 도트 밀도 · 외곽선이 맞춰집니다. **적마다 새 대화**에서 한 장씩 만드는 게 품질이 좋습니다.

**[공통 스타일]**
```
High-quality pixel art ENEMY sprite for a retro fantasy dice RPG.
Canvas 512x512. Draw on a strict 64x64 pixel grid: every art pixel is an exact 8x8 block,
perfectly aligned, hard edges only — no anti-aliasing, no blur, no soft brushes, no smooth gradients
(use dithering or 2–3 flat shade steps instead).
Limited palette of about 16–24 colors. 1-pixel dark outline in #1A1030 around the whole figure,
slightly lighter inner outlines to separate parts. Light from the upper left: highlight, base, shadow.
The monster faces the viewer in a 3/4 front view, centered, readable at small size
(big clear silhouette, glowing eyes 2–3 pixels).
Solid pure black #000000 background, nothing else on the canvas: no text, no frame, no ground line, no floor shadow,
no extra characters.
Same art style, detail level and outline weight as the attached demon queen reference image.
Style of a polished 16-bit SNES / GBA JRPG monster sprite.
```
**피해야 할 것 (Negative)**
```
blurry, anti-aliased, smooth shading, painterly, 3D render, photo, realistic, high-res illustration,
jpeg artifacts, mixed pixel sizes, half pixels, noise, text, watermark, frame, background scenery,
cropped body, extra heads, extra limbs
```

- 512×512 PNG, 검정 배경 (넣을 때 투명으로 바꿈). 64×64 격자 · 8×8 블록 · 외곽선 `#1A1030`.
- 게임에서는 **72~96px**로 작게 보입니다 → 실루엣과 대표 색이 한눈에.
- **일반 적은 귀엽고 단순하게, 엘리트는 한 단계 크고 위협적으로.** 막 보스(화염룡 · 오크 · 리치 · 세머리 용 · 키클롭스 · 오버로드 · 마왕)보다 작고 덜 화려해야 합니다.
- 분노 그림은 필요 없습니다 (적은 분노 모습이 없음).
- 파일 이름: `<id>.png` (아래 표의 id).

| 막 | id | 이름 | 종류 | 하는 일 (포즈 · 분위기 참고) |
|---|---|---|---|---|
| 1 어둠의 숲 | `slime` | 슬라임 | 일반 | 몸통 박치기, 끈적이는 점액(주사위 1개 얼림), 부풀기 |
| 1 | `goblin` | 고블린 약탈꾼 | 일반 | 단검 찌르기, 주머니 털기(골드 훔침), 방패 들기 |
| 1 | `bat` | 동굴 박쥐 | 일반 | 날개 할퀴기 2연타, 흡혈, 초음파(주사위 봉인) |
| 1 | `wolf` | 숲 늑대 | 일반 | 물어뜯기, 울부짖기(힘↑), 연속 물기 |
| 1 | `shaman` | 고블린 주술사 | 엘리트 | 저주 인형(주사위 뒤집기), 불꽃 화살, 봉인 주문, 마력 방패 |
| 1 | `mimic` | 미믹 | 엘리트 | 덥석 물기, 혀 휘감기(주사위 2개 봉인), 뚜껑 닫기, 금화 삼키기 |
| 2 얼어붙은 폐허 | `skeleton` | 해골 병사 | 일반 | 녹슨 칼, 뼈 방패, 뼈 던지기 |
| 2 | `ghost` | 원혼 | 일반 | 원망의 눈길(카드 1장 0점), 흐려지기, 비명 |
| 2 | `wisp` | 서리 정령 | 일반 | 서리 입김(주사위 2개 얼림), 냉기 폭발, 얼음 갑옷 |
| 2 | `knight` | 망령 기사 | 엘리트 | 공포의 기세(뒤집기 · 조정 금지), 대검 내려치기, 검은 방패, 삼연참 |
| 2 | `golem` | 고대 골렘 | 엘리트 | 바위 피부, 지진(굴림 -1), 분쇄, 가동 |
| 3 마왕성 | `imp` | 임프 | 일반 | 화염구(주사위 1개 태움), 장난질, 꼬리 찌르기 |
| 3 | `hound` | 지옥견 | 일반 | 물어뜯기, 연속 물기, 지옥의 울음 |
| 3 | `gargoyle` | 가고일 | 일반 | 석화(보호막), 내려찍기, 돌날개 |
| 3 | `shade` | 그림자 암살자 | 엘리트 | 그림자 난도질 4연타, 그림자 사슬(봉인), 독 바른 칼(약화), 어둠 속으로 |
| 3 | `champion` | 마족 근위대장 | 엘리트 | 도륙, 철벽, 위압(뒤집기 · 조정 금지), 회전 베기 |

### 적 문단 (영문 프롬프트 — [공통 스타일] 뒤에 붙입니다)

`slime`
```
Enemy: a SLIME — small, cute but slightly menacing green jelly blob (#6BE06B, shadow #2E9E4A), glossy white highlight,
two round dark eyes, a tiny frown, a few drips of sticky slime around the base. Size: small, low and round, fills ~55% of the canvas.
Feeling: the first, weakest monster of a dark forest.
```
`goblin`
```
Enemy: a GOBLIN RAIDER — small green-skinned goblin (#7CC24A) with big pointy ears, red eyes, a sly toothy grin,
ragged brown leather vest with a gold buckle, holding a short curved dagger, a coin pouch at the belt. Crouched, sneaky pose.
Size ~60% of the canvas. Feeling: a thief who steals your gold.
```
`bat`
```
Enemy: a CAVE BAT — purple bat (#8A5CC8, shadow #4A2A7A) with wings spread wide, red glowing eyes, tiny white fangs,
small furry body. Hovering, symmetric front view. Size ~60% wide. Feeling: screeching, fast, annoying.
```
`wolf`
```
Enemy: a FOREST WOLF — gray-blue wolf (#9AA4B8, shadow #5A6478) in 3/4 view, yellow eyes, bared white fangs,
raised hackles, one paw forward ready to pounce. Size ~65%. Feeling: a hungry predator of the dark forest.
```
`shaman` (엘리트)
```
Enemy: a GOBLIN SHAMAN (elite) — goblin in a tall purple hooded robe (#7A3AA8) covered with crude runes,
bone necklace, holding a crooked wooden staff topped with a floating cyan crystal (#7CF2FF) and a small voodoo doll.
Glowing red eyes under the hood, faint purple magic sparks. Taller than the normal goblin, ~70% of the canvas.
Feeling: a cunning caster who twists fate (flips your dice).
```
`mimic` (엘리트)
```
Enemy: a MIMIC (elite) — a wooden treasure chest (#9A5A2A) with gold trim (#FFC83D) that is actually a monster:
the lid wide open showing rows of sharp white teeth, a long red tongue lashing out, two small glowing eyes on the lid,
a few gold coins spilling out. Size ~70%. Feeling: greedy trap — "it was not treasure".
```
`skeleton`
```
Enemy: a SKELETON SOLDIER — bone-white skeleton (#EEE6D0) in a broken iron helmet, red-orange eye lights,
a rusty notched sword in one hand and a cracked round wooden shield in the other, tattered blue cloth on the hips.
Size ~65%. Feeling: a cold undead guard of frozen ruins.
```
`ghost`
```
Enemy: a VENGEFUL GHOST — pale blue translucent spirit (#C8E8FF, shadow #7CA8D8) with a wavy tail instead of legs,
hollow black eyes and a wailing open mouth, wispy hair floating up, faint chains on the wrists.
Size ~65%. Feeling: a resentful spirit whose stare makes one of your cards useless.
```
`wisp`
```
Enemy: a FROST WISP — a floating spirit made of blue flame and ice crystals (#7CE0FF, #3AA8FF, white core),
small dark eyes inside the flame, sharp ice shards orbiting it, snowflake sparkles. Size ~55%.
Feeling: freezing your dice in place.
```
`knight` (엘리트)
```
Enemy: a WRAITH KNIGHT (elite) — tall black-iron armored knight (#4A4A6A, #2A2A40) with a horned helm and glowing red eye slit,
a torn dark cape, a huge greatsword planted in front, cold mist rolling from the armor joints.
Size ~78%. Feeling: an overwhelming presence that forbids tricks (no flips or nudges).
```
`golem` (엘리트)
```
Enemy: an ANCIENT GOLEM (elite) — massive blocky stone golem (#A8A090, #6A6458) covered in moss and frost,
a glowing cyan rune core in the chest (#7CF2FF) and cyan eyes, huge fists, cracks across the body.
Very wide and heavy, ~80%. Feeling: a slow fortress that shakes the ground.
```
`imp`
```
Enemy: an IMP — small red demon (#E8435A) with cream horns, yellow eyes, a mischievous grin, little bat wings (#7A1E3A),
a pointed tail, a fireball dancing above one palm. Size ~55%. Feeling: a prankster of the demon castle.
```
`hound`
```
Enemy: a HELLHOUND — black-and-charcoal dog (#2A2030) with a mane of orange flames (#FF8A1A), red glowing eyes,
white fangs, embers falling from its jaws, crouched to lunge. Size ~70%. Feeling: a fast, burning hunter.
```
`gargoyle`
```
Enemy: a GARGOYLE — gray stone winged statue creature (#8A8FA8, #5A5F78) with curled horns, orange glowing eyes,
crouched on a small pedestal, stone wings half-open, cracks showing it just woke up.
Size ~70%. Feeling: a patient guard that hardens into stone (big shield).
```
`shade` (엘리트)
```
Enemy: a SHADOW ASSASSIN (elite) — slim hooded figure made of dark purple shadow (#2A1E3A, #4A3A6A),
only two violet glowing eyes visible (#C99BFF), twin silver daggers, shadow chains trailing from the arms,
smoky edges dissolving into the dark. Size ~70%. Feeling: fast, many hits, seals your dice.
```
`champion` (엘리트)
```
Enemy: a DEMON CHAMPION (elite) — huge horned demon guard captain in heavy black armor (#3A3A5A, #6A6A8A)
with a crimson cape (#A8203E), cream curved horns, red eyes, a giant double-bladed axe, gold trims.
Size ~80%. Feeling: the last guardian before the demon queen's throne.
```

---

## 2. 지도 · 카드 · 아이콘 (그다음)

지금은 `icons.js` 의 12×12 도트 아이콘을 빌려 쓰고 있습니다. 같은 도트 톤으로 만들면 바로 바꿉니다.

| 무엇 | 개수 | 크기 | 지금 |
|---|---|---|---|
| 지도 칸 아이콘 (전투 · 엘리트 · 이벤트 · 상점 · 휴식 · 보물 · 보스) | 7 | 12×12 도트 또는 48px | 칼 · 해골 · 두루마리 · 동전 · 불 · 보석 · 왕관 |
| 막 지도 배경 (어둠의 숲 · 얼어붙은 폐허 · 마왕성) | 3 | 세로 720×1600 정도, 어둡고 단순하게 (칸이 잘 보이게) | 단색 줄무늬 |
| 족보 카드 앞면 틀 (일반 · 희귀 · 전설) | 3 | 80×112 기준 9분할 테두리 | 기존 도트 프레임 |
| 키워드 아이콘 (수호 · 흡혈 · 화염 · 관통 · 속공 · 행운 · 약화 · 황금 · 메아리) | 9 | 12×12 | 기존 아이콘 빌림 |
| 물약 병 (회복 · 방패 · 화염 · 시간 · 힘 · 정화) | 6 | 12×12 (병 모양, 색만 다르게) | 하트 · 방패 · 불 등 |
| 유물 아이콘 | 31 | 12×12 | 특성 아이콘 빌림 (목록은 `run/rules.js` `RELICS`) |
| 상인 · 모닥불 · 보물상자 · 이벤트 9종 그림 | 12 | 128~256px 도트 | 아이콘 크게 |

---

## 3. 음악 (Suno · 기존 곡과 같은 결)

기존 곡 분석 결과와 같은 규칙: **NES 2A03 4채널 칩튠**(펄스 2 · 삼각파 · 노이즈), 거의 모노, 잔향 없음, 오케스트라 · 합창 · 기타 · 피아노 없음.
모든 곡에 같은 **Exclude Styles** 를 씁니다 (Suno: Custom 모드 · Instrumental 켜기. 기존 곡이 계정에 있으면 그 곡에서 Cover 로 만들면 음색이 가장 잘 맞습니다):
```
orchestral, symphonic, strings, violin, cello, brass, horns, choir, vocals, singing, organ, piano, guitar, synthwave, reverb, cinematic, epic trailer, modern drums, EDM, dubstep, lo-fi
```

| 파일 | 쓰는 곳 | 키 · 템포 | Style of Music |
|---|---|---|---|
| `run_map` | 원정 지도 | A단조 108 | `NES 8-bit chiptune, Famicom 2A03 sound chip, 4 channels only: two pulse leads, triangle bass, noise drums, mono, dry, no reverb, 108 BPM, A minor, adventurous exploration theme, walking triangle bassline, curious pulse melody with call and response, light noise hi-hats, loopable, instrumental` |
| `run_battle` | 일반 전투 | E단조 144 | `NES 8-bit chiptune battle theme, Famicom 2A03, two pulse leads, triangle bass, noise drums, mono, dry, 144 BPM, E minor, energetic driving bass, fast pulse arpeggios, short catchy 8-bar hook, loopable, instrumental` |
| `run_elite` | 엘리트 전투 | G단조 152 | `NES 8-bit chiptune mini-boss battle, Famicom 2A03, two pulse leads, triangle bass, noise drums, mono, dry, 152 BPM, G minor, tense chromatic pulse riff, pounding noise snare, dramatic stops, loopable, instrumental` |
| `run_shop` | 상점 | F장조 100 | `NES 8-bit chiptune shop theme, Famicom 2A03, two pulse leads, triangle bass, light noise percussion, mono, dry, 100 BPM, F major, cheerful bouncy merchant melody, swing feel, loopable, instrumental` |
| `run_rest` | 모닥불 휴식 | C장조 80 | `NES 8-bit chiptune campfire rest theme, Famicom 2A03, soft 12.5% pulse lead, gentle triangle bass, no drums, mono, dry, 80 BPM, C major, calm warm lullaby, slow arpeggios, loopable, instrumental` |
| `run_event` | 이벤트(?) | D도리안 96 | `NES 8-bit chiptune mystery event theme, Famicom 2A03, two pulse leads, triangle bass, sparse noise, mono, dry, 96 BPM, D dorian, curious and slightly eerie, echo-like pulse delays written as notes, loopable, instrumental` |
| `run_win` | 원정 성공 (8~16마디 징글) | C장조 132 | `NES 8-bit chiptune victory fanfare, Famicom 2A03, triumphant pulse fanfare, triangle bass, noise snare roll, 132 BPM, C major, short ending jingle, instrumental` |
| `run_lose` | 원정 실패 (8마디 징글) | A단조 90 | `NES 8-bit chiptune game over jingle, Famicom 2A03, slow descending pulse melody, soft triangle, 90 BPM, A minor, sad but warm, short, instrumental` |

- 루프 곡은 1분 30초~3분이면 충분합니다. 반복하기 좋은 구간을 잘라 루프로 만들고 음량을 **-10.8 LUFS** 로 맞춥니다 (기존 곡과 같게).
- 징글(`run_win` · `run_lose`)은 루프 없이 한 번만 재생합니다.

---

## 4. 넣는 방법 (작업이 끝나면 시스템 세션에서 연결)

1. 적 그림 → `dice-heroes/assets/run/<id>.webp` (`tools/make_boss_sprites.py` 와 같은 방식으로 512px · 투명 배경) → `run/art.js` 의 `FILES` 에 id 추가.
2. 곡 → `dice-heroes/assets/bgm/run_*.ogg` → `audio.js` 의 `BGM_FILES` 에 추가 → `run/ui.js` 에서 `playBgm('adventure')` 등을 `run_map` · `run_battle` … 으로 바꿈.
3. 원정은 아직 테스트판 전용이라 `sw.js` 오프라인 목록에는 넣지 않습니다 (정식 출시 때 함께).
