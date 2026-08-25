# blender_merge_anims.py — Meshy 리깅 산출물 병합
#   blender --background --python scripts/blender_merge_anims.py -- <base.glb> <out.glb> <name1:anim1.glb> [name2:anim2.glb ...]
# base(리깅 캐릭터)의 아마추어에 각 애니 GLB 의 액션을 NLA 스트립으로 얹어
# 클립 이름이 보존된 단일 GLB 를 만든다. (같은 리그 전제 — 본 이름 일치)

import bpy, sys

argv = sys.argv[sys.argv.index('--')+1:]
BASE, OUT = argv[0], argv[1]
ANIMS = [a.split(':', 1) for a in argv[2:]]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=BASE)
base_arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
base_objs = set(bpy.data.objects)
if base_arm.animation_data is None:
    base_arm.animation_data_create()
# 베이스에 이미 액션이 있으면(T포즈 등) 제거 — 클립 오염 방지
base_arm.animation_data.action = None

for name, path in ANIMS:
    before = set(bpy.data.objects)
    before_act = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new_objs = set(bpy.data.objects) - before
    new_acts = list(set(bpy.data.actions) - before_act)
    assert new_acts, f'no action in {path}'
    act = new_acts[0]
    act.name = name
    tr = base_arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    # 애니 GLB 의 오브젝트(중복 메시+아마추어)는 제거 — 액션만 남긴다
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    print('MERGED', name)

# 내보내기: NLA 트랙 → 개별 애니메이션 클립
bpy.ops.object.select_all(action='DESELECT')
for o in base_objs:
    if o.name in bpy.data.objects:
        bpy.data.objects[o.name].select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_yup=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=True)
print('EXPORTED', OUT)
