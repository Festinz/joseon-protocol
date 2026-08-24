# blender_resize_tex.py — GLB 내장 텍스처를 max_size 로 리사이즈 후 재내보내기
# 사용: blender -b -P scripts/blender_resize_tex.py -- <in.glb> <out.glb> [max_size]
import bpy, sys

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
max_size = int(argv[2]) if len(argv) > 2 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > max_size:
        s = max_size / max(w, h)
        img.scale(int(w * s), int(h * s))
        print(f"resized {img.name}: {w}x{h} -> {img.size[0]}x{img.size[1]}")

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82)
print("OK", dst)
