# blender_photo_cutout.py — 실사 사진 → 빌보드 컷아웃
# 파란 하늘 제거(알파 0) + 야간 그레이드 + (옵션) 중앙 하단 아치 투명 펀치
# usage: blender -b --python blender_photo_cutout.py -- <in.jpg> <out.png> [arch]
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
arch = len(argv) > 2 and argv[2] == 'arch'

img = bpy.data.images.load(src)
w, h = img.size
px = np.empty(w * h * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(h, w, 4)   # blender 는 하단부터 — row 0 = 사진의 맨 아래
r, g, b = px[:, :, 0], px[:, :, 1], px[:, :, 2]

# 1) 하늘 제거: 파랑 우세 + 밝음 (또는 매우 밝은 흰 구름)
lum = (r + g + b) / 3
sky = ((b > r * 1.12) & (b > g * 1.04) & (lum > 0.34)) | (lum > 0.93)
# 하늘은 사진 상단에 있다 — 하단 40% 는 보호 (박석/그림자 오탐 방지)
protect = np.zeros((h, w), dtype=bool)
protect[: int(h * 0.40), :] = True
sky &= ~protect
px[:, :, 3] = np.where(sky, 0.0, px[:, :, 3])

# 2) 야간 그레이드: 감광 + 한랭 틴트 + 살짝 채도 감소
mixg = lum * 0.25
for i, k in enumerate((0.52, 0.56, 0.72)):   # 파랑 우세 야간 톤
    px[:, :, i] = np.clip(px[:, :, i] * 0.72 * (1 + 0.0) * k / 0.6 + mixg * 0.08, 0, 1)

# 3) 중앙 아치 펀치 (광화문 통로)
if arch:
    cx = w * 0.5
    aw, ah = w * 0.085, h * 0.30          # 반폭/높이 — 중앙 홍예문
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    inside = (np.abs(xs - cx) < aw) & (ys < ah)          # 하단(0)에서 ah 까지
    top = (np.abs(xs - cx) / aw) ** 2 + ((ys - ah * 0.62) / (ah * 0.38)) ** 2 < 1  # 상부 반원
    arch_mask = (inside & (ys < ah * 0.62)) | (inside & top)
    px[:, :, 3] = np.where(arch_mask, 0.0, px[:, :, 3])

img2 = bpy.data.images.new('out', width=w, height=h, alpha=True)
img2.pixels.foreach_set(px.reshape(-1))
img2.filepath_raw = dst
img2.file_format = 'PNG'
img2.save()
print("CUTOUT", dst)
