# blender_clean.py — Meshy/AI GLB 를 게임용으로 정리 (헤드리스)
# 사용: blender -b -P scripts/blender_clean.py -- <in.glb> <out.glb> [target_height_m] [max_tris]
# 단계: import → 트랜스폼 적용 → 높이 정규화 → 바닥 원점 → (필요시) Decimate → GLB export

import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
target_h = float(argv[2]) if len(argv) > 2 else 1.8
max_tris = int(argv[3]) if len(argv) > 3 else 15000

# 씬 비우기
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    print("NO MESHES"); sys.exit(1)

# 트랜스폼 적용
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 바운딩 박스
def bbox():
    import mathutils
    mins = [1e9]*3; maxs = [-1e9]*3
    for o in meshes:
        for v in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(v)
            for i in range(3):
                mins[i] = min(mins[i], w[i]); maxs[i] = max(maxs[i], w[i])
    return mins, maxs

mins, maxs = bbox()
h = maxs[2] - mins[2]
scale = target_h / h if h > 0 else 1.0
for o in meshes:
    o.scale = (o.scale[0]*scale, o.scale[1]*scale, o.scale[2]*scale)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# 바닥 중앙 원점 (Z-up 기준 → glTF 는 Y-up 으로 export 됨)
mins, maxs = bbox()
cx = (mins[0]+maxs[0])/2; cy = (mins[1]+maxs[1])/2; bz = mins[2]
for o in meshes:
    o.location.x -= cx; o.location.y -= cy; o.location.z -= bz
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# 트라이앵글 예산 초과 시 Decimate
total = sum(len(o.data.polygons) for o in meshes)
if total > max_tris:
    ratio = max_tris / total
    for o in meshes:
        m = o.modifiers.new("dec", 'DECIMATE'); m.ratio = ratio
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="dec")
    print(f"DECIMATED {total} -> {sum(len(o.data.polygons) for o in meshes)}")

# 텍스처 2048 상한 + JPEG 압축 export
for img in bpy.data.images:
    if img.size[0] > 2048 or img.size[1] > 2048:
        w, h2 = img.size
        s = 2048 / max(w, h2)
        img.scale(max(1, int(w * s)), max(1, int(h2 * s)))

os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=85)
print(f"OK {dst} tris={sum(len(o.data.polygons) for o in meshes)}")
