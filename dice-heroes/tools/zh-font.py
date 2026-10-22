# 중국어 픽셀 서체 줄이기: Fusion Pixel 12px (SC · TC, SIL OFL 1.1) 에서 번역표 · CSS 에 쓰인 한자 · 전각 기호만 남긴다.
#   pip install fonttools brotli
#   python3 tools/zh-font.py <fusion-pixel-12px-proportional-sc.woff2> <…-tc.woff2>
#   (npm 의 @fontsource/fusion-pixel-12px-proportional-sc · -tc 패키지 files/ 안 woff2)
# 줄 높이가 갈무리와 같도록 세로 치수를 갈무리 값으로 맞춘다. 번역을 바꾸면 다시 돌린다.
# OFL 의 예약 이름(Fusion Pixel)은 고친 판에 못 쓰므로 이름을 'Kyboria Hanzi SC/TC' 로 바꾼다 (fonts/LICENSE-FusionPixel.txt).
import sys
from fontTools.ttLib import TTFont
from fontTools import subset
g = TTFont('fonts/Galmuri11.woff2')
css = open('style.css', encoding='utf8').read() + open('run/run.css', encoding='utf8').read()
EXTRA = '，。、：；！？（）“”‘’《》【】—…·「」『』～％＋－' + '简体中文繁體'   # 언어 고르기의 언어 이름
for src_path, lang, out in [(sys.argv[1], 'zh-Hans', 'SC'), (sys.argv[2], 'zh-Hant', 'TC')]:
    text = open(f'lang/{lang}.js', encoding='utf8').read() + css + EXTRA
    cs = sorted({c for c in text if ord(c) >= 0x2E80 and not (0xAC00 <= ord(c) <= 0xD7A3) and not (0x3130 <= ord(c) <= 0x318F)})
    f = TTFont(src_path)
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['*']; o.name_IDs = ['*']; o.notdef_outline = True
    s = subset.Subsetter(o); s.populate(unicodes=[ord(c) for c in cs]); s.subset(f)
    f['hhea'].ascent, f['hhea'].descent, f['hhea'].lineGap = g['hhea'].ascent, g['hhea'].descent, g['hhea'].lineGap
    a, b = f['OS/2'], g['OS/2']
    a.sTypoAscender, a.sTypoDescender, a.sTypoLineGap, a.usWinAscent, a.usWinDescent = b.sTypoAscender, b.sTypoDescender, b.sTypoLineGap, b.usWinAscent, b.usWinDescent
    fam = f'Kyboria Hanzi {out}'
    for rec in f['name'].names:
        if rec.nameID in (1, 3, 4, 16, 18, 21): rec.string = fam
        elif rec.nameID == 6: rec.string = fam.replace(' ', '') + '-Regular'
    f.flavor = 'woff2'; f.save(f'fonts/KyboriaHanzi-{out}.woff2')
    print(lang, len(cs), '글자')
