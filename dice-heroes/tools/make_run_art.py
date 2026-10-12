"""원정 그림(디자인 세션 납품 zip을 푼 폴더)을 게임용 webp 로 바꾼다 → assets/run/

    python3 tools/make_run_art.py <적 폴더> <UI 폴더>

- 적 16장   <적>/<id>.png (512, 투명)      → assets/run/<id>.webp        무손실, 구도 그대로 (일반 · 엘리트 크기 차이 유지)
- 아이콘    <UI>/node_* kw_* potion_* (128) → assets/run/ui/<이름>.webp   무손실
- 장면 12장 <UI>/scene_*.png (512)          → assets/run/scene/<id>.webp  무손실
- 카드 틀   <UI>/card_*.png (320×448)       → assets/run/ui/card_*.webp   무손실 (9분할 테두리)
- 막 배경   <UI>/bg_act1~3.png (1024×2048)  → assets/run/bg_act*.webp     720×1440, 손실 q80
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'run'
SCENES = {'shop', 'rest', 'treasure', 'chest', 'spring', 'altar', 'smith', 'gamble', 'shrine', 'library', 'trap', 'fairy'}


def save(im, path, **kw):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, method=6, **kw)
    print(path.relative_to(ROOT), im.size, path.stat().st_size // 1024, 'KB')


def main(enemy, ui):
    for f in sorted(Path(enemy).glob('*.png')):
        if 'compare' in f.stem:
            continue
        save(Image.open(f).convert('RGBA'), OUT / f'{f.stem}.webp', lossless=True)
    for f in sorted(Path(ui).glob('*.png')):
        kind, _, name = f.stem.partition('_')
        im = Image.open(f)
        if kind in ('node', 'kw', 'potion', 'card'):
            save(im.convert('RGBA'), OUT / 'ui' / f'{f.stem}.webp', lossless=True)
        elif kind == 'scene' and name in SCENES:
            save(im.convert('RGBA'), OUT / 'scene' / f'{name}.webp', lossless=True)
        elif kind == 'bg':
            save(im.convert('RGB').resize((720, 1440), Image.LANCZOS), OUT / f'{f.stem}.webp', quality=80)


if __name__ == '__main__':
    main(*sys.argv[1:3])
