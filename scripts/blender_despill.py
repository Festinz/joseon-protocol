# blender_despill.py — 크로마키 잔여 초록 제거: 초록 우세 픽셀 알파 0 + 가장자리 디스필
# usage: blender -b --python blender_despill.py -- <file1.png> [file2.png ...]
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
for path in argv:
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    r, g, b, a = px[:, 0], px[:, 1], px[:, 2], px[:, 3]

    # 1) 초록 우세 스펙 → 완전 투명
    greenish = (g > r * 1.16 + 0.02) & (g > b * 1.16 + 0.02)
    a[greenish] = 0.0
    # 2) 남은 픽셀 디스필: G 를 max(R,B) 근처로 클램프
    lim = np.maximum(r, b) * 1.06 + 0.004
    px[:, 1] = np.minimum(g, lim)
    # 3) 반투명 가장자리(알파 0.5 미만) 정리 — 헤일로 감소
    a[a < 0.42] = 0.0
    px[:, 3] = a

    img.pixels.foreach_set(px.reshape(-1))
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    print("CLEANED", path)
