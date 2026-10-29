"""원정 그림 리스타일 v1 (보스 그림체 · 디자인 세션 run_art_restyle_v1) → 게임용 webp.

  python3 tools/make_run_art_v2.py <run_art_restyle_v1 폴더>

- enemies/<id>.png (512)             → assets/run/<id>.webp          384px, 손실 q86 (화면에서 110px 안팎 · 연출 때 조금 크게)
  enemies/<id>_attack|_hurt.png      → assets/run/<id>_attack|_hurt.webp   엘리트 6종 공격 · 피격 자세 (run/art.js FOE_POSES)
- omen/<id>.png (256)                → assets/run/ui/omen_<id>.webp  128px (징조 카드 아이콘)
- node/<id>.png (256)                → assets/run/ui/node_<id>.webp  128px (지도 칸 · 화면 43px)
"""
import sys
from pathlib import Path
from PIL import Image

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'run'
tot = {}
def save(src, dst, size, q, kind):
    im = Image.open(src).convert('RGBA').resize((size, size), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, 'WEBP', quality=q, method=6, alpha_quality=92)
    tot[kind] = tot.get(kind, 0) + dst.stat().st_size
for f in sorted((SRC / 'enemies').glob('*.png')): save(f, OUT / f'{f.stem}.webp', 384, 86, 'enemies')
for f in sorted((SRC / 'omen').glob('*.png')): save(f, OUT / 'ui' / f'omen_{f.stem}.webp', 128, 90, 'omen')
for f in sorted((SRC / 'node').glob('*.png')): save(f, OUT / 'ui' / f'node_{f.stem}.webp', 128, 90, 'node')
print({k: f'{v // 1024}KB' for k, v in tot.items()})
