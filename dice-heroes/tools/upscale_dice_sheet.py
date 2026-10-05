"""주사위 시트의 칸을 AI 업스케일(Real-ESRGAN x4)로 4배 키워 둔다.

  python3 tools/upscale_dice_sheet.py <RealESRGAN_x4plus.pth>   →  tools/dice-src/dice-hires/<스킨>_<1~6>.webp
  필요: pip install spandrel (torch 가 함께 깔린다) · 모델 https://github.com/xinntao/Real-ESRGAN/releases (RealESRGAN_x4plus.pth)

시트 한 칸이 약 110px 라 그대로 키우면 뭉개진다. 칸 둘레(CELL)를 키워 두면 make_dice_from_sheet.py 가 이 그림에서 오린다.
"""
import os, sys
import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_dice_from_sheet as D

PAD = 8


def main():
    torch.set_num_threads(os.cpu_count() or 4)
    model = ModelLoader().load_from_file(sys.argv[1]).eval()
    sheet = Image.open(D.SHEET).convert('RGB')
    os.makedirs(D.HIRES, exist_ok=True)
    for name in D.SKINS:
        for c in range(6):
            x0, y0, x1, y1 = D.cell_box(name, c)
            im = sheet.crop((x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD))
            x = torch.from_numpy(np.asarray(im).astype(np.float32) / 255).permute(2, 0, 1)[None]
            with torch.no_grad():
                y = model(x)[0].permute(1, 2, 0).clamp(0, 1).numpy()
            out = Image.fromarray((y * 255 + 0.5).astype(np.uint8))
            k = D.SCALE
            out.crop((PAD * k, PAD * k, out.width - PAD * k, out.height - PAD * k)).save(os.path.join(D.HIRES, f'{name}_{c + 1}.webp'), quality=92, method=6)
        print(name, 'ok')


if __name__ == '__main__':
    main()
