"""트레이 시트의 칸(바닥 · 발광 지도 · 함 바닥)을 AI 업스케일(Real-ESRGAN x4)로 4배 키워 둔다.

  python3 tools/upscale_tray_sheet.py <RealESRGAN_x4plus.pth>   →  tools/dice-src/tray-hires/<스킨>_<floor|glow|box>.webp
  필요: pip install spandrel (torch 가 함께 깔린다) · 모델 https://github.com/xinntao/Real-ESRGAN/releases (RealESRGAN_x4plus.pth)

시트 한 칸이 약 200px 라 그대로 키우면 뭉개진다. 한 번 키워 두면 make_trays_from_sheet.py 가 이 그림을 쓴다
(없으면 시트에서 바로 오린다). CPU 로 칸마다 몇 초.
"""
import os, sys
import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_trays_from_sheet as T   # 칸 위치 · 스킨 이름

OUT = os.path.join(HERE, 'dice-src', 'tray-hires')
PAD = 8   # 가장자리에서 업스케일이 흐트러지지 않게 둘레를 조금 더 오려 키운 뒤 잘라 낸다


def main():
    torch.set_num_threads(os.cpu_count() or 4)
    model = ModelLoader().load_from_file(sys.argv[1]).eval()
    sheet = Image.open(T.SHEET).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    def up(box):
        x0, y0, x1, y1 = box
        im = sheet.crop((x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD))
        x = torch.from_numpy(np.asarray(im).astype(np.float32) / 255).permute(2, 0, 1)[None]
        with torch.no_grad():
            y = model(x)[0].permute(1, 2, 0).clamp(0, 1).numpy()
        out = Image.fromarray((y * 255 + 0.5).astype(np.uint8))
        k = out.width // im.width
        return out.crop((PAD * k, PAD * k, out.width - PAD * k, out.height - PAD * k))
    for i, id_ in enumerate(T.IDS):
        for kind, (x, y, s) in (('floor', T.FLOOR[i]), ('glow', T.GLOW[i])):
            up((x, y, x + s, y + s)).save(os.path.join(OUT, f'{id_}_{kind}.webp'), quality=92, method=6)
        up(T.BOX[i]).save(os.path.join(OUT, f'{id_}_box.webp'), quality=92, method=6)
        print(id_, 'ok')


if __name__ == '__main__':
    main()
