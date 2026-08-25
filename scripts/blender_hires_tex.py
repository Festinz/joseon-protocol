# blender_hires_tex.py — GLB 텍스처 2048 재추출 (애니메이션 보존)
# usage: blender -b --python blender_hires_tex.py -- <in.glb> <out.glb> [maxtex]
import bpy, sys

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
maxtex = int(argv[2]) if len(argv) > 2 else 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# Meshy가 넣는 잔여 오브젝트 제거
for o in list(bpy.data.objects):
    if 'Icosphere' in o.name or 'icosphere' in o.name.lower():
        bpy.data.objects.remove(o, do_unlink=True)

for img in bpy.data.images:
    if img.size[0] > maxtex or img.size[1] > maxtex:
        w, h = img.size
        s = maxtex / max(w, h)
        img.scale(max(1, int(w * s)), max(1, int(h * s)))

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB',
    export_image_format='JPEG', export_jpeg_quality=85,
    export_animations=True, export_skins=True,
)
print("EXPORTED", dst)
