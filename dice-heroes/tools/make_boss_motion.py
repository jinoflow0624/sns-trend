# 보스 40프레임 모션 V2 → 게임용 (assets/boss/<id>_motion.webp)
#   python3 tools/make_boss_motion.py <boss_motion_complete 폴더>
# 받은 것: frames/<id>/00.png ~ 39.png — 원화와 같은 512×512 투명 PNG, 발밑 기준점 (256, 500).
#   효과(불기둥 · 사슬 · 바위 …)까지 프레임 안에 다 들어 있다 (모든 프레임이 가장자리에서 12px 이상 떨어짐 — 잘린 효과 없음).
# 게임용: 384px 칸 4열 × 8행 = 1536×3072 (영웅 모션 시트와 같은 크기) · 기준점 (192, 375) · webp 품질 74 (투명도 60).
#   쓰러짐(32~39)은 아직 게임에서 쓰지 않아 넣지 않는다 (넣으면 20% 무거워진다 — 쓰게 되면 ROWS = 10).
#   프레임을 통째로(투명 여백 포함) 줄이기만 한다 — 조각 지우기 · 자르기를 하지 않아 효과가 잘리지 않는다.
# 0~3 대기 · 4~15 공격 (칸 9 타격) · 16~27 필살기 (칸 21 타격) · 28~31 피격
import sys, os
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'boss')
IDS = ['dragon', 'orc', 'lich', 'hydra', 'cyclops', 'overlord', 'demon', 'archdemon']
C, COLS, ROWS = 384, 4, 8

for id in IDS:
    out = Image.new('RGBA', (C * COLS, C * ROWS), (0, 0, 0, 0))
    for f in range(COLS * ROWS):
        fr = Image.open(os.path.join(SRC, 'frames', id, f'{f:02d}.png')).convert('RGBA')
        assert fr.size == (512, 512), (id, f, fr.size)
        # 미리 곱한 알파로 줄여야 반투명 가장자리가 검게 번지지 않는다
        fr = fr.convert('RGBa').resize((C, C), Image.LANCZOS).convert('RGBA')
        out.paste(fr, ((f % COLS) * C, (f // COLS) * C))
    p = os.path.join(OUT, f'{id}_motion.webp')
    out.save(p, 'WEBP', quality=74, method=6, alpha_quality=60)
    print(id, os.path.getsize(p) // 1024, 'KB')
