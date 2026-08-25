# blender_palace.py — 경복궁 핵심 랜드마크 지오메트리 생성 (헤드리스)
#   blender --background --python scripts/blender_palace.py -- <out.glb>
#
# 게임 좌표(x 동서, z 남북·북=-z, y 높이)와 맞추기 위해 Blender 에서 북=+Y 로 짓고
# glTF 익스포트(+Y up)가 Blender +Y forward → glTF -Z 로 매핑하는 것을 이용한다.
#
# 생성물 (시각 전용 — 충돌은 게임 leveldata.WALLS 가 담당):
#   광화문(z-52 게이트 자리): 석축 + 홍예 3문 + 2층 문루(우진각 곡선 지붕)
#   근정문(z-112): 1층 3칸 문
#   근정전(z-134 북측): 2단 월대 + 몸체 + 2층 지붕
#   행각(회랑) 기둥열: Z3 구간(z-70~-110) 양측
#   품계석 2열: Z4 앞뜰
#
# 한옥 느낌의 8할은 지붕 처마 곡선이다:
#   앙곡(корner uplift) — 처마 네 귀가 하늘로 들리고
#   안허리곡(concave profile) — 처마→용마루 단면이 오목하게 판다

import bpy, bmesh, math, sys

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['assets/models/palace.glb']
OUT = argv[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
COL = bpy.context.scene.collection

# ── 머티리얼 (게임 팔레트와 동일 계열) ──────────────────────────────
def mat(name, color, rough=0.85, metal=0.0, emit=None, estr=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = estr
    return m

M_TILE   = mat('tile',   (0.012, 0.014, 0.020))          # 기와 — 짙은 청회
M_RIDGE  = mat('ridge',  (0.007, 0.008, 0.011))          # 용마루 — 더 짙게
M_WOOD   = mat('wood',   (0.055, 0.022, 0.015))           # 기둥 — 석간주(적갈)
M_DANC_G = mat('dancG',  (0.018, 0.055, 0.042))            # 단청 뇌록
M_DANC_R = mat('dancR',  (0.070, 0.026, 0.018))             # 단청 적
M_STONE  = mat('stone',  (0.058, 0.056, 0.050), rough=0.95) # 화강암 석축
M_STONE2 = mat('stone2', (0.044, 0.042, 0.038), rough=0.95) # 월대·기단
M_WALL   = mat('wall',   (0.080, 0.070, 0.052), rough=0.9)  # 회벽
M_DOOR   = mat('door',   (0.06, 0.05, 0.05))             # 판문·창호 그늘
M_BRASS  = mat('brass',  (0.185, 0.135, 0.055), rough=0.45, metal=0.35)

def obj_from_bm(bm, name, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(material)
    COL.objects.link(o)
    return o

def box(name, x, y, z, sx, sy, sz, material, rz=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    o = obj_from_bm(bm, name, material)
    o.location = (x, y, z); o.rotation_euler = (0, 0, rz)
    return o

def cyl(name, x, y, z, r, h, material, seg=10):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r*0.92, depth=h)
    o = obj_from_bm(bm, name, material)
    o.location = (x, y, z + h/2)
    return o

# ── 한옥 우진각 지붕 생성기 ─────────────────────────────────────────
# eave (w×d, 높이 z0, 귀 들림 lift) → ridge (길이 rl, 높이 z0+rise) 로프트.
# 단면은 t^1.55 오목 상승(안허리곡), 귀 들림은 처마에서 최대·위로 갈수록 소멸(앙곡).
def hip_roof(name, cx, cy, z0, w, d, rise, ridge_len, lift=0.0, overhang_drop=0.18,
             rows=7, per_side=8):
    bm = bmesh.new()
    rings = []
    for i in range(rows + 1):
        t = i / rows
        hw = (w/2) * (1-t) + (ridge_len/2) * t
        hd = (d/2) * (1-t) + 0.02 * t
        zz = z0 + rise * (t ** 1.55)
        cor = lift * ((1-t) ** 2)               # 앙곡
        ring = []
        def edge(p0, p1, n):                     # p→p1 을 n 등분 (끝점 제외)
            for k in range(n):
                s = k / n
                x = p0[0] + (p1[0]-p0[0]) * s
                y = p0[1] + (p1[1]-p0[1]) * s
                # 귀에 가까울수록 들린다 (양끝에서 최대)
                e = abs(2*s - 1) ** 2.2
                ring.append(bm.verts.new((cx+x, cy+y, zz + cor * e)))
        edge((-hw, -hd), ( hw, -hd), per_side)   # 남
        edge(( hw, -hd), ( hw,  hd), per_side)   # 동
        edge(( hw,  hd), (-hw,  hd), per_side)   # 북
        edge((-hw,  hd), (-hw, -hd), per_side)   # 서
        rings.append(ring)
    n = len(rings[0])
    for i in range(rows):
        a, b = rings[i], rings[i+1]
        for j in range(n):
            bm.faces.new((a[j], a[(j+1) % n], b[(j+1) % n], b[j]))
    # 처마 하부 마감(밑면 뚜껑 — 아래에서 올려다볼 때 하늘이 안 보이게)
    bottom = rings[0]
    try:
        bm.faces.new(tuple(reversed(bottom)))
    except ValueError:
        pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm(bm, name, M_TILE)
    # 용마루
    box(name+'_ridge', cx, cy, z0 + rise + 0.09, ridge_len + 0.35, 0.34, 0.24, M_RIDGE)
    # 취두(용마루 양끝 장식) — 위로 솟은 블록
    for sx in (-1, 1):
        box(name+f'_chwidu{sx}', cx + sx * (ridge_len/2 + 0.12), cy, z0 + rise + 0.32, 0.30, 0.40, 0.52, M_RIDGE)
    # 잡상 — 추녀마루(모서리 능선) 위 작은 수호상 3개씩 ×4귀
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(3):
                t = 0.22 + k * 0.16
                jx = cx + sx * ((w/2) * (1-t) + (ridge_len/2) * t)
                jy = cy + sy * ((d/2) * (1-t) + 0.02 * t)
                jz = z0 + rise * (t ** 1.55) + lift * ((1-t) ** 2) + 0.10
                bm2 = bmesh.new()
                bmesh.ops.create_cone(bm2, cap_ends=True, segments=6, radius1=0.075, radius2=0.03, depth=0.22)
                o2 = obj_from_bm(bm2, name+f'_js{sx}{sy}{k}', M_RIDGE)
                o2.location = (jx, jy, jz)
    # 처마 안쪽 단청 띠 (지붕 밑 그림자 면)
    box(name+'_eaveband', cx, cy, z0 - overhang_drop/2, w - 0.5, d - 0.5, overhang_drop, M_DANC_G)
    return o

# ── 전각 몸체 (기둥열 + 벽 + 창호) ──────────────────────────────────
def hall_body(name, cx, cy, z0, w, d, h, bays_x, mat_wall=M_WALL):
    box(name+'_wallN', cx, cy + d/2 - 0.06, z0 + h/2, w - 1.0, 0.12, h, mat_wall)
    box(name+'_wallS', cx, cy - d/2 + 0.06, z0 + h/2, w - 1.0, 0.12, h, M_DOOR)   # 정면은 창호(어둡게)
    box(name+'_wallE', cx + w/2 - 0.06, cy, z0 + h/2, 0.12, d - 0.6, h, mat_wall)
    box(name+'_wallW', cx - w/2 + 0.06, cy, z0 + h/2, 0.12, d - 0.6, h, mat_wall)
    for i in range(bays_x + 1):
        x = cx - w/2 + (w / bays_x) * i
        cyl(name+f'_colS{i}', x, cy - d/2, z0, 0.17, h, M_WOOD)
        cyl(name+f'_colN{i}', x, cy + d/2, z0, 0.17, h, M_WOOD)
    # 창방(기둥 상단 가로보) + 단청 띠
    box(name+'_beamS', cx, cy - d/2, z0 + h - 0.18, w + 0.3, 0.22, 0.36, M_DANC_R)
    box(name+'_beamN', cx, cy + d/2, z0 + h - 0.18, w + 0.3, 0.22, 0.36, M_DANC_R)

# ═══════════════════════════════════════════════════════════════════
# 1) 광화문 — 게임 z=-52 → Blender y=+52
# 석축(높이 5.2) + 홍예 3문 + 상부 2층 문루
# ═══════════════════════════════════════════════════════════════════
GY = 52.0
# 석축 (개구부 x -2.3..2.3 유지 — 게임 통행로)
def arch_portal(name, cx, cy, opening_w, opening_h, total_h, d, passthrough):
    """홍예문: 좌우 측주 + 반원 아치 링 + 아치 위 스팬드럴 채움.
    passthrough=True 면 실제로 뚫린 통로(게임 통행로), False 면 뒤를 어둡게 막은 벽감."""
    r = opening_w / 2
    jamb_h = opening_h - r                      # 측주는 아치 스프링 라인까지
    jw = 0.75                                    # 측주 두께
    box(name+'_jL', cx - r - jw/2, cy, jamb_h/2, jw, d, jamb_h, M_STONE)
    box(name+'_jR', cx + r + jw/2, cy, jamb_h/2, jw, d, jamb_h, M_STONE)
    # 아치 링 (부채꼴 박스 — 링 중심은 스프링 라인 높이)
    seg = 9
    for k in range(seg):
        am = math.pi * (k + 0.5) / seg
        ax = cx + math.cos(am) * (r + 0.18)
        az = jamb_h + math.sin(am) * (r + 0.18)
        L = (r + 0.18) * math.pi / seg * 1.18
        b = box(name+f'_a{k}', ax, cy, az, 0.46, 1.1, L, M_STONE2)   # 링은 얇게 — 회전해도 벽면 안
        b.rotation_euler = (0, am - math.pi/2, 0)
    # 스팬드럴(아치 어깨 채움) + 상부 인방까지 채움
    sh = total_h - jamb_h
    box(name+'_spL', cx - r - jw + 0.1 - 0.9, cy, jamb_h + sh/2, 1.8, d, sh, M_STONE)
    box(name+'_spR', cx + r + jw - 0.1 + 0.9, cy, jamb_h + sh/2, 1.8, d, sh, M_STONE)
    top_h = total_h - opening_h
    if top_h > 0.1:
        box(name+'_top', cx, cy, opening_h + top_h/2, opening_w + 0.6, d, top_h, M_STONE)
    if not passthrough:                          # 벽감 — 뒤를 어둡게 막는다
        box(name+'_niche', cx, cy + 0.3, opening_h/2, opening_w - 0.2, d - 0.5, opening_h - 0.2, M_DOOR)

# 좌우 석축 (게임 WALLS: x ±6.1 w7.6 → x 2.3..9.9 / -9.9..-2.3)
# 석축 몸체 — 중앙 개구부(x -2.3..2.3)를 실제로 비운다 (게임 통행로)
box('gw_baseL', -10.4, GY, 2.6, 14.6, 3.0, 5.2, M_STONE)
box('gw_baseR',  10.4, GY, 2.6, 14.6, 3.0, 5.2, M_STONE)
arch_portal('gw_archC', 0, GY, 4.6, 5.0, 5.2, 3.0, True)     # 중앙 홍예 — 뚫림
arch_portal('gw_archL', -6.2, GY, 2.9, 3.6, 5.2, 3.0, False) # 협문 — 벽감
arch_portal('gw_archR',  6.2, GY, 2.9, 3.6, 5.2, 3.0, False)
# 여장(석축 위 담)
box('gw_par', 0, GY + 1.2, 5.65, 33.6, 0.5, 0.9, M_STONE2)
# 석축 장대석 줄눈 — 수평 3줄 (거대한 벽이 '쌓은 돌' 로 읽히게)
for i, zz in enumerate((1.4, 2.8, 4.2)):
    box(f'gw_joint{i}', 0, GY - 1.56, zz, 35.0, 0.04, 0.06, M_RIDGE)
# 현판 — 문루 1층 처마 밑 중앙 (검은 바탕 + 황동 테)
box('gw_plaque_bg', 0, GY - 3.2, 8.35, 2.6, 0.12, 1.15, M_RIDGE)
box('gw_plaque_rim', 0, GY - 3.14, 8.35, 2.78, 0.06, 1.3, M_BRASS)
# 문루 1층
hall_body('gw_f1', 0, GY, 5.9, 16.5, 6.2, 3.0, 7)
hip_roof('gw_r1', 0, GY, 9.15, 19.5, 8.6, 1.15, 11.0, lift=0.5)
# 문루 2층 (축소)
hall_body('gw_f2', 0, GY, 9.9, 13.0, 4.8, 2.5, 5)
hip_roof('gw_r2', 0, GY, 12.6, 16.6, 7.0, 1.7, 8.0, lift=0.62)

# ═══════════════════════════════════════════════════════════════════
# 2) 근정문 — 게임 z=-112 → y=+112 (개구부 x -2.6..2.6)
# ═══════════════════════════════════════════════════════════════════
NY = 112.0
box('nj_baseL', -6.9, NY, 0.55, 8.6, 2.2, 1.1, M_STONE2)
box('nj_baseR',  6.9, NY, 0.55, 8.6, 2.2, 1.1, M_STONE2)
box('nj_baseTop', 0, NY, 4.3, 22.4, 1.6, 0.5, M_DANC_R)     # 창방
for i in range(8):
    x = -10.5 + i * 3.0
    if -2.6 < x < 2.6: continue                              # 통행로 비움
    cyl(f'nj_col{i}', x, NY, 0.0, 0.20, 4.3, M_WOOD)
cyl('nj_colL', -2.6, NY, 0.0, 0.22, 4.3, M_WOOD)
cyl('nj_colR',  2.6, NY, 0.0, 0.22, 4.3, M_WOOD)
box('nj_doorL', -6.9, NY, 2.7, 8.0, 0.18, 3.2, M_DOOR)
box('nj_doorR',  6.9, NY, 2.7, 8.0, 0.18, 3.2, M_DOOR)
hip_roof('nj_roof', 0, NY, 4.8, 24.5, 5.6, 1.5, 15.0, lift=0.55)

# ═══════════════════════════════════════════════════════════════════
# 3) 근정전 — 게임 z-134 북측 → y=+136 에 배치 (보스존 배경)
# 2단 월대 + 5칸 몸체 + 2층 지붕
# ═══════════════════════════════════════════════════════════════════
JY = 154.0   # 월대(깊이 26) 앞 가장자리 y141 → 게임 z-141, 아레나(-139) 바로 뒤
box('jj_woldae1', 0, JY, 0.75, 40.0, 26.0, 1.5, M_STONE2)   # 하월대
box('jj_woldae2', 0, JY + 1.5, 2.1, 32.0, 19.0, 1.2, M_STONE2) # 상월대
# 월대 난간 기둥
for i in range(11):
    x = -19 + i * 3.8
    cyl(f'jj_bal1_{i}', x, JY - 12.6, 1.5, 0.12, 1.0, M_STONE)
for i in range(9):
    x = -15 + i * 3.75
    cyl(f'jj_bal2_{i}', x, JY - 8.0 + 0.0, 2.7, 0.12, 1.0, M_STONE)
# 계단 (남측 중앙 3열)
for sx in (-7.5, 0, 7.5):
    for s in range(5):
        box(f'jj_st{sx}_{s}', sx, JY - 13.0 - 0.55*s, 1.35 - 0.3*s, 5.2, 0.6, 0.3, M_STONE)
# 몸체
hall_body('jj_body', 0, JY, 2.7, 27.0, 15.0, 4.6, 5)
hip_roof('jj_r1', 0, JY, 7.6, 32.5, 20.0, 1.6, 18.0, lift=0.7)
hall_body('jj_f2', 0, JY, 8.9, 21.0, 11.0, 2.6, 5)
hip_roof('jj_r2', 0, JY, 11.8, 26.5, 15.0, 2.4, 12.0, lift=0.85)

# ═══════════════════════════════════════════════════════════════════
# 4) 행각(회랑) — Z3 구간 y 70..110 양측 (게임 WALLS x -12/+10 안쪽에 시각만)
# ═══════════════════════════════════════════════════════════════════
for side, wx in (('L', -11.4), ('R', 9.4)):
    for i in range(10):
        y = 72 + i * 4.2
        cyl(f'hg_{side}_col{i}', wx, y, 0.0, 0.16, 3.1, M_WOOD)
    box(f'hg_{side}_beam', wx, 72 + 9*4.2/2, 3.0, 0.3, 9*4.2 + 1.6, 0.3, M_DANC_R)
    # 맞배 회랑 지붕 (경사판 2장)
    ln = 9*4.2 + 2.4
    r1 = box(f'hg_{side}_roofA', wx - 0.85, 72 + 9*4.2/2, 3.75, 2.1, ln, 0.1, M_TILE)
    r1.rotation_euler = (0, math.radians(-24 if side=='L' else 24), 0)
    r2 = box(f'hg_{side}_roofB', wx + 0.85, 72 + 9*4.2/2, 3.75, 2.1, ln, 0.1, M_TILE)
    r2.rotation_euler = (0, math.radians(24 if side=='L' else -24), 0)

# ═══════════════════════════════════════════════════════════════════
# 4.5) 통로(광화문~회랑, y 53..69): 금천교 난간 + 흥례문
# 실제 배치: 광화문 → 흥례문 → 영제교(금천) → 근정문. 게임 통로가 이 축선이다.
# 통행 폭(x -4.5..4.5)을 침범하지 않도록 난간은 x ±3.6 바깥 시각 전용.
# ═══════════════════════════════════════════════════════════════════
# 어도(御道) — 임금의 길: 축선 중앙 어두운 박석 띠 (광장 y8..46 + 통로~근정문 y53..111)
box('eodo_plaza', 0, 27.0, 0.025, 3.4, 38.0, 0.05, M_RIDGE)
box('eodo_axis',  0, 82.0, 0.025, 3.0, 58.0, 0.05, M_RIDGE)
# 금천교 난간 (y 58..63): 낮은 석난간 + 법수(끝 기둥)
for side in (-1, 1):
    x = side * 3.9
    box(f'gc_rail{side}', x, 60.5, 0.55, 0.28, 5.2, 0.22, M_STONE)     # 상판 난간대
    for i, yy in enumerate((58.2, 59.7, 61.2, 62.7)):
        cyl(f'gc_bal{side}_{i}', x, yy, 0.0, 0.10, 0.62, M_STONE2)
    for yy in (57.8, 63.2):                                             # 법수 — 조금 크게
        box(f'gc_post{side}_{yy}', x, yy, 0.45, 0.34, 0.34, 0.9, M_STONE)
# 금천 암시: 다리 좌우 바닥에 어두운 물띠 (통로 벽 바깥 x 4.5..10)
for side in (-1, 1):
    box(f'gc_water{side}', side * 7.4, 60.5, 0.03, 5.6, 4.2, 0.05, M_RIDGE)
# 흥례문 — 통로 북단(y 69) 전환부 위 1층 문루 (통행 개구는 게임 벽이 이미 확보)
box('hr_baseL', -6.6, 69.5, 0.5, 5.4, 1.6, 1.0, M_STONE2)
box('hr_baseR',  5.6, 69.5, 0.5, 5.4, 1.6, 1.0, M_STONE2)
for i, x in enumerate((-4.2, -2.6, 2.6, 4.2)):
    cyl(f'hr_col{i}', x, 69.5, 0.0, 0.18, 3.7, M_WOOD)
box('hr_beam', 0, 69.5, 3.6, 12.4, 1.2, 0.42, M_DANC_R)
hip_roof('hr_roof', 0, 69.5, 4.1, 14.5, 4.4, 1.15, 8.0, lift=0.45)

# ═══════════════════════════════════════════════════════════════════
# 5) 품계석 2열 — Z4 앞뜰 y 116..130
# ═══════════════════════════════════════════════════════════════════
for i in range(6):
    y = 117 + i * 2.4
    box(f'pum_L{i}', -3.4, y, 0.55, 0.5, 0.28, 1.1, M_STONE)
    box(f'pum_R{i}',  3.4, y, 0.55, 0.5, 0.28, 1.1, M_STONE)
# 정(鼎) 향로 — 월대 앞 좌우
cyl('jeong_L', -9, JY - 15.5, 0.0, 0.65, 1.4, M_BRASS, seg=12)
cyl('jeong_R',  9, JY - 15.5, 0.0, 0.65, 1.4, M_BRASS, seg=12)

# ── 통계 + 익스포트 ────────────────────────────────────────────────
tris = 0
for o in COL.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
print(f'PALACE objects={len(COL.objects)} tris={tris}')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print('EXPORTED', OUT)
