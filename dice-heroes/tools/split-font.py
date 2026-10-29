# 갈무리11 보통 굵기(fonts/Galmuri11.woff2 — 원본, 앱은 직접 쓰지 않는다)를 둘로 나눈다:
#   fonts/Galmuri11-core.woff2 : 한글 · 라틴 · 키릴 · 기호 (늘 받는다)
#   fonts/Galmuri11-cjk.woff2  : 일본어 가나 · 한자 (화면에 그 글자가 있을 때만 — style.css unicode-range)
# 글자 모양은 원본 그대로다. 원본을 새 버전으로 바꾸면 다시 돌린다:  python3 tools/split-font.py
# (pip install fonttools brotli)
from fontTools import subset
from fontTools.ttLib import TTFont
import os
SRC = 'fonts/Galmuri11.woff2'
CJK = [(0x3040, 0x30FF), (0x31F0, 0x31FF), (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF)]   # style.css 의 unicode-range 와 같게
cmap = TTFont(SRC).getBestCmap()
is_cjk = lambda c: any(a <= c <= b for a, b in CJK)
def make(codes, out):
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['*']; o.name_IDs = ['*']; o.name_languages = ['*']; o.notdef_outline = True; o.glyph_names = True; o.hinting = True
    f = TTFont(SRC); s = subset.Subsetter(o); s.populate(unicodes=codes); s.subset(f); f.flavor = 'woff2'; f.save(out)
    print(out, len(codes), '글자', os.path.getsize(out) // 1024, 'KB')
make([c for c in cmap if not is_cjk(c)], 'fonts/Galmuri11-core.woff2')
make([c for c in cmap if is_cjk(c)], 'fonts/Galmuri11-cjk.woff2')
