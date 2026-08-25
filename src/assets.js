// assets.js — 절차적 빌더 레지스트리 + GLB 무중단 스왑.
// 원칙: 어떤 GLB 가 없어도/깨져도 게임은 절차적 버전으로 항상 완성 상태.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PALETTE } from './config.js';
import { WALLS, COVERS, GATES } from './leveldata.js';
import { stoneFloorTex, roofTileTex, stoneWallTex, skyTex, hanjiWindowTex } from './textures.js';

// ── 공유 머티리얼 (드로우콜 배칭의 상한 = 머티리얼 수) ─────────────
const flat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, metalness: 0.1, ...extra });
export const MAT = {
  INDIGO: flat(PALETTE.INDIGO), BLACK: flat(PALETTE.BLACK), LEATHER: flat(PALETTE.LEATHER),
  WOOD: flat(PALETTE.WOOD), BRASS: flat(PALETTE.BRASS, { metalness: 0.55, roughness: 0.5 }),
  IRON: flat(PALETTE.IRON, { metalness: 0.45, roughness: 0.6 }),
  STONE: flat(0x8a877e, { map: stoneWallTex() }),
  TILE: flat(0x565c6e, { map: roofTileTex() }), RED: flat(PALETTE.RED),
  DANCHEONG_G: flat(PALETTE.DANCHEONG_G), DANCHEONG_R: flat(PALETTE.DANCHEONG_R),
  STEAM: new THREE.MeshStandardMaterial({ color: PALETTE.STEAM, emissive: PALETTE.STEAM, emissiveIntensity: 1.3, flatShading: true }),
  PAPER: new THREE.MeshStandardMaterial({ color: PALETTE.PAPER, emissive: 0xe8c87a, emissiveIntensity: 1.15, flatShading: true }),
  DANGER: new THREE.MeshStandardMaterial({ color: PALETTE.DANGER, emissive: PALETTE.DANGER, emissiveIntensity: 1.2 }),
  PROXY: new THREE.MeshBasicMaterial({ visible: false }),
};

// ── 파츠 병합 헬퍼: [{geo, mat, x,y,z, rx,ry,rz, sx,sy,sz}] → 단일 Mesh(멀티 머티리얼) ──
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
export function mergeParts(parts) {
  const byMat = new Map();
  for (const p of parts) {
    const g = p.geo.clone();
    _e.set(p.rx || 0, p.ry || 0, p.rz || 0); _q.setFromEuler(_e);
    _s.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    _m4.compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), _q, _s);
    g.applyMatrix4(_m4);
    if (!byMat.has(p.mat)) byMat.set(p.mat, []);
    byMat.get(p.mat).push(g);
  }
  const geos = [], mats = [];
  for (const [mat, list] of byMat) { geos.push(BGU.mergeGeometries(list, false)); mats.push(mat); }
  const merged = BGU.mergeGeometries(geos, true);
  geos.forEach(g => g.dispose());
  return new THREE.Mesh(merged, mats);
}

// 재사용 지오메트리 (빌더들이 공유)
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  torus: new THREE.TorusGeometry(0.5, 0.08, 6, 14),
  capsule: new THREE.CapsuleGeometry(0.5, 0.6, 3, 8),
};

// ══════════════════════════════════════════════════════════════════
// 적 유닛 — 갓 + 두루마기 실루엣 (기계 보병). torsoPivot / gunPivot 계층.
// Meshy 병사 GLB 가 로드되면 몸체를 교체 (변형 마커·프록시·모션은 유지)
// ══════════════════════════════════════════════════════════════════
let soldierGLBScene = null;
let soldierGLBAnims = null;   // 애니메이티드 GLB (Meshy 리깅) 클립들
const soldierSwapQueue = [];
const VARIANT_TINT = { grunt: null, marksman: 0xffb0a0, thrower: 0xd8b890, shield: 0xb8c0cc };
import { state as _state } from './state.js';
new GLTFLoader().load('assets/models/soldier.glb?v=4', (g) => {
  soldierGLBScene = g.scene;
  soldierGLBAnims = (g.animations && g.animations.length) ? g.animations : null;
  for (const job of soldierSwapQueue) attachSoldierGLB(...job);
  soldierSwapQueue.length = 0;
  _state.emit('soldierGLBReady');   // 기존 액터·풀 일괄 소급 (enemies 구독)
}, undefined, () => {});

// 레이스 보정: 로드 전 생성된 액터에 애니 GLB 소급 장착 (enemies.ensureMixer 에서 호출)
export function retrofitSoldierAnim(torso, variant) {
  if (!soldierGLBAnims || torso.userData.glbAnim) return;
  const old = torso.getObjectByName('glbBody');
  if (old) torso.remove(old);
  const body = torso.getObjectByName('body');
  attachSoldierGLB(torso, body || { visible: true }, variant);
}

function attachSoldierGLB(torso, body, variant) {
  if (!soldierGLBScene) { soldierSwapQueue.push([torso, body, variant]); return; }
  const clone = soldierGLBAnims ? SkeletonUtils.clone(soldierGLBScene) : soldierGLBScene.clone(true);
  const tint = VARIANT_TINT[variant];
  clone.traverse(o => {
    if (o.isMesh && o.material) {
      o.material = o.material.clone();
      if (tint) o.material.color.multiply(new THREE.Color(tint));
      // 야간 판독성: 텍스처를 은은히 자체 발광 (달빛만으로는 실루엣이 죽음)
      o.material.emissive = new THREE.Color(0xffffff);
      o.material.emissiveMap = o.material.map || null;
      o.material.emissiveIntensity = 0.38;
    }
  });
  clone.position.y = -0.95;          // torsoPivot(0.95) 기준 바닥 정렬
  clone.name = 'glbBody';
  body.visible = false;
  torso.add(clone);
  if (soldierGLBAnims) torso.userData.glbAnim = { root: clone, clips: soldierGLBAnims }; // enemies 가 믹서 생성
}
export function buildSoldier(variant = 'grunt') {
  const root = new THREE.Group(); root.name = 'soldier_' + variant;
  const torso = new THREE.Group(); torso.name = 'torsoPivot'; torso.position.y = 0.95; root.add(torso);

  // 위협도 색 코딩 = 게임플레이: 잡졸/방패병 회색, 사수 인디고+붉은 띠, 투척병 가죽색
  const coatMat = variant === 'marksman' ? MAT.INDIGO : variant === 'thrower' ? MAT.LEATHER : MAT.IRON;
  const parts = [
    { geo: G.cone, mat: coatMat, y: -0.25, sx: 0.62, sy: 1.15, sz: 0.62 },          // 두루마기 자락
    { geo: G.capsule, mat: coatMat, y: 0.18, sx: 0.42, sy: 0.42, sz: 0.42 },        // 몸통
    { geo: G.sphere, mat: MAT.LEATHER, y: 0.62, sx: 0.30, sy: 0.32, sz: 0.30 },     // 머리
    { geo: G.cyl, mat: MAT.BLACK, y: 0.82, sx: 0.24, sy: 0.20, sz: 0.24 },          // 갓 몸통
    { geo: G.torus, mat: MAT.BLACK, y: 0.74, rx: Math.PI / 2, sx: 0.62, sy: 0.62, sz: 0.62 }, // 갓 챙
    { geo: G.cyl, mat: MAT.BRASS, x: 0.30, y: 0.10, rz: 0.3, sx: 0.10, sy: 0.42, sz: 0.10 }, // 증기 브레이서(팔)
    { geo: G.cyl, mat: MAT.STEAM, y: -0.05, z: -0.24, sx: 0.09, sy: 0.18, sz: 0.09 },        // 가슴 증기 코어
    { geo: G.box, mat: MAT.BRASS, x: -0.34, y: 0.42, rz: 0.35, sx: 0.2, sy: 0.1, sz: 0.3 },  // 어깨 갑주(왼)
    { geo: G.box, mat: MAT.BRASS, x: 0.34, y: 0.42, rz: -0.35, sx: 0.2, sy: 0.1, sz: 0.3 },  // 어깨 갑주(오)
    { geo: G.torus, mat: MAT.LEATHER, y: -0.02, rx: Math.PI / 2, sx: 0.52, sy: 0.52, sz: 0.8 }, // 허리띠
    { geo: G.sphere, mat: MAT.STEAM, x: -0.09, y: 0.64, z: -0.24, sx: 0.05, sy: 0.05, sz: 0.05 }, // 발광 눈(왼)
    { geo: G.sphere, mat: MAT.STEAM, x: 0.09, y: 0.64, z: -0.24, sx: 0.05, sy: 0.05, sz: 0.05 },  // 발광 눈(오)
  ];
  const body = mergeParts(parts); body.name = 'body'; torso.add(body);
  // 변형 마커는 병합 밖 별도 메시 — GLB 몸체 스왑 후에도 위협도 색 코딩 유지
  if (variant === 'marksman') { // 붉은 어깨띠 — 색 코딩이 곧 게임플레이
    const sash = new THREE.Mesh(G.torus, MAT.DANGER); sash.name = 'variantMark';
    sash.position.y = 0.34; sash.rotation.set(Math.PI / 2, 0, 0.5); sash.scale.set(0.55, 0.55, 0.9); torso.add(sash);
  }
  if (variant === 'thrower') { // 등의 화약통
    const pack = new THREE.Group(); pack.name = 'variantMark';
    const tube = new THREE.Mesh(G.cyl, MAT.LEATHER); tube.position.set(0, 0.2, 0.3); tube.scale.set(0.28, 0.5, 0.28); pack.add(tube);
    const fuse = new THREE.Mesh(G.sphere, MAT.DANGER); fuse.position.set(0, 0.48, 0.3); fuse.scale.set(0.12, 0.12, 0.12); pack.add(fuse);
    torso.add(pack);
  }
  attachSoldierGLB(torso, body, variant); // 로드돼 있으면 몸체 교체 (없으면 무시)

  if (variant === 'shield') { // 철 방패 — 몸통 가림, 머리만 유효
    const sh = new THREE.Mesh(G.box, MAT.IRON); sh.scale.set(0.95, 1.25, 0.08);
    sh.position.set(0, 0.05, -0.42); sh.name = 'shieldPlate'; torso.add(sh);
  }

  const gun = new THREE.Group(); gun.name = 'gunPivot'; gun.position.set(-0.28, 0.15, -0.15); torso.add(gun);
  const barrel = new THREE.Mesh(G.cyl, variant === 'shield' ? MAT.PROXY : MAT.BLACK);
  barrel.scale.set(0.07, 0.7, 0.07); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.3; gun.add(barrel);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -0.65); gun.add(muzzle);

  // 히트 프록시 (렌더 안 됨, 레이캐스트만) — GLB 몸체 기준으로 관대하게
  const hitBody = new THREE.Mesh(G.box, MAT.PROXY); hitBody.name = 'hitBody';
  hitBody.scale.set(0.8, 1.4, 0.65); hitBody.position.y = 0.08; torso.add(hitBody);
  const hitHead = new THREE.Mesh(G.sphere, MAT.PROXY); hitHead.name = 'hitHead';
  hitHead.scale.set(0.62, 0.66, 0.62); hitHead.position.y = 0.72; torso.add(hitHead); // 갓 포함 넉넉히
  return root;
}

// ══════════════════════════════════════════════════════════════════
// 뷰모델 — 영천 장총 v2 (img2threejs 압축 파이프라인: 레퍼런스 계층 분석 기반 양식화 재구성)
// 레퍼런스: docs/refs/rifle_yeongcheon.png — 월넛 풀스톡 · 황동 리시버+기어 · 흑철 장총열+밴드 ·
// 상부 스코프 · 우측 구리 파이프 · 하부 튜브 탄창 · 볼트 핸들 · 태슬
// ══════════════════════════════════════════════════════════════════
const MAT_WALNUT = flat(0x5a3b22, { roughness: 0.7 });
const MAT_COPPER = flat(0xa8623a, { metalness: 0.6, roughness: 0.45 });

function stockGeometry() {
  // 측면 프로파일 (z-y 평면) → x축 두께 압출. +z = 개머리판, -z = 총구 방향.
  const s = new THREE.Shape();
  s.moveTo(0.46, -0.13);   // 개머리판 하단 뒤
  s.lineTo(0.47, 0.035);   // 개머리판 상단 뒤 (버트 곡선 근사)
  s.lineTo(0.30, 0.045);   // 콤(comb) 상단
  s.lineTo(0.18, 0.012);   // 손목(wrist) 파임
  s.lineTo(-0.10, 0.018);  // 리시버 하부 지지
  s.lineTo(-0.42, 0.010);  // 포어암 상단
  s.lineTo(-0.44, -0.030); // 포어암 앞끝
  s.lineTo(-0.12, -0.045); // 포어암 하단
  s.lineTo(0.10, -0.052);  // 방아쇠 앞 하단
  s.lineTo(0.20, -0.075);  // 그립 하강
  s.quadraticCurveTo(0.36, -0.10, 0.46, -0.13); // 개머리판으로 흐르는 곡선
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, steps: 1 });
  geo.translate(0, 0, -0.0275); // 압출축 중앙 정렬
  geo.rotateY(-Math.PI / 2);    // 프로파일 x→월드 z (+z=개머리판), 두께→x축
  return geo;
}

export function buildRifleVM() {
  const g = new THREE.Group(); g.name = 'vm_rifle';

  const parts = [
    // ① 총열 (흑철, 리시버 앞 -0.08 에서 총구 -0.86 까지)
    { geo: G.cyl, mat: MAT.BLACK, rx: Math.PI / 2, z: -0.47, sx: 0.021, sy: 0.78, sz: 0.021 },
    // 총구 플레어
    { geo: G.cyl, mat: MAT.BLACK, rx: Math.PI / 2, z: -0.845, sx: 0.028, sy: 0.05, sz: 0.028 },
    // 총열 황동 밴드 3개
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, z: -0.30, sx: 0.026, sy: 0.025, sz: 0.026 },
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, z: -0.52, sx: 0.025, sy: 0.025, sz: 0.025 },
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, z: -0.74, sx: 0.024, sy: 0.025, sz: 0.024 },
    // ② 리시버 (황동 박스 + 상판)
    { geo: G.box, mat: MAT.BRASS, y: 0.032, z: 0.02, sx: 0.055, sy: 0.075, sz: 0.20 },
    { geo: G.box, mat: MAT.BLACK, y: 0.072, z: 0.02, sx: 0.045, sy: 0.012, sz: 0.16 },
    // 리시버 대형 기어 디스크 (좌측면 장식 — 우견착 시 화면 안쪽)
    { geo: G.cyl, mat: MAT_COPPER, x: -0.032, y: 0.035, z: 0.06, rz: Math.PI / 2, sx: 0.042, sy: 0.012, sz: 0.042 },
    { geo: G.torus, mat: MAT.BRASS, x: -0.038, y: 0.035, z: 0.06, ry: Math.PI / 2, sx: 0.05, sy: 0.05, sz: 0.05 },
    // ③ 증기 압력 유리관 (리시버 위 — 발광 아이덴티티)
    { geo: G.cyl, mat: MAT.STEAM, y: 0.10, z: -0.04, sx: 0.016, sy: 0.055, sz: 0.016 },
    { geo: G.cyl, mat: MAT.BRASS, y: 0.128, z: -0.04, sx: 0.02, sy: 0.012, sz: 0.02 },
    // ④ 스코프 (황동 튜브 + 마운트 2 + 대물렌즈)
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, y: 0.105, z: -0.22, sx: 0.014, sy: 0.30, sz: 0.014 },
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, y: 0.105, z: -0.355, sx: 0.02, sy: 0.03, sz: 0.02 },
    { geo: G.box, mat: MAT.BLACK, y: 0.085, z: -0.15, sx: 0.012, sy: 0.045, sz: 0.02 },
    { geo: G.box, mat: MAT.BLACK, y: 0.085, z: -0.30, sx: 0.012, sy: 0.045, sz: 0.02 },
    { geo: G.cyl, mat: MAT.STEAM, rx: Math.PI / 2, y: 0.105, z: -0.372, sx: 0.016, sy: 0.006, sz: 0.016 },
    // ⑤ 우측 구리 파이프 (리시버 → 총열 중반)
    { geo: G.cyl, mat: MAT_COPPER, rx: Math.PI / 2, x: 0.028, y: -0.005, z: -0.20, sx: 0.009, sy: 0.34, sz: 0.009 },
    { geo: G.torus, mat: MAT_COPPER, x: 0.028, y: -0.005, z: -0.045, sx: 0.018, sy: 0.018, sz: 0.018 },
    // ⑥ 하부 튜브 탄창 (황동, 포어암 아래)
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, y: -0.032, z: -0.42, sx: 0.014, sy: 0.42, sz: 0.014 },
    // ⑦ 방아쇠울 (토러스) + 방아쇠
    { geo: G.torus, mat: MAT.BRASS, y: -0.075, z: 0.10, rx: 0, sx: 0.032, sy: 0.045, sz: 0.032 },
    { geo: G.box, mat: MAT.BLACK, y: -0.062, z: 0.095, sx: 0.008, sy: 0.03, sz: 0.01 },
    // ⑧ 버트 플레이트 (황동)
    { geo: G.box, mat: MAT.BRASS, y: -0.045, z: 0.475, sx: 0.06, sy: 0.175, sz: 0.015 },
  ];
  const stock = new THREE.Mesh(stockGeometry(), MAT_WALNUT); stock.name = 'stock';
  const mesh = mergeParts(parts); g.add(mesh); g.add(stock);

  // 볼트 피벗 (우측 — 재장전 애니 대상)
  const bolt = new THREE.Group(); bolt.name = 'boltPivot'; bolt.position.set(0.03, 0.045, 0.05);
  const handle = new THREE.Mesh(G.cyl, MAT.BRASS); handle.scale.set(0.008, 0.05, 0.008); handle.rotation.z = -1.1; handle.position.set(0.025, 0, 0); bolt.add(handle);
  const knob = new THREE.Mesh(G.sphere, MAT.BRASS); knob.scale.set(0.016, 0.016, 0.016); knob.position.set(0.05, -0.012, 0); bolt.add(knob);
  g.add(bolt);

  // ⑨ 태슬 (스톡 앞 — 레퍼런스 아이덴티티 소품)
  const tassel = new THREE.Group(); tassel.position.set(-0.02, -0.05, -0.40);
  const cord = new THREE.Mesh(G.cyl, MAT.RED); cord.scale.set(0.003, 0.03, 0.003); cord.position.y = -0.012; tassel.add(cord);
  const tuft = new THREE.Mesh(G.cone, MAT.RED); tuft.scale.set(0.014, 0.035, 0.014); tuft.rotation.x = Math.PI; tuft.position.y = -0.045; tassel.add(tuft);
  g.add(tassel);

  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -0.87); g.add(muzzle);
  return g;
}
export function buildCarbineVM() {
  const g = buildRifleVM(); g.name = 'vm_carbine'; g.scale.set(1, 1, 0.78);
  const cylinder = new THREE.Mesh(G.cyl6, MAT.IRON); cylinder.rotation.x = Math.PI / 2;
  cylinder.scale.set(0.06, 0.1, 0.06); cylinder.position.set(0, -0.01, -0.02); g.add(cylinder);
  return g;
}
export function buildRitualVM() {
  const g = buildRifleVM(); g.name = 'vm_ritual';
  const orb = new THREE.Mesh(G.sphere, MAT.STEAM); orb.scale.set(0.1, 0.1, 0.1); orb.position.set(0, 0.09, 0.05); g.add(orb);
  const ring = new THREE.Mesh(G.torus, MAT.STEAM); ring.scale.set(0.12, 0.12, 0.12); ring.position.set(0, 0.02, -0.3); ring.rotation.y = Math.PI / 2; g.add(ring);
  return g;
}

// ══════════════════════════════════════════════════════════════════
// 커버 프롭 — 좌/우 피킹 판독성 최우선. 판정용 콜라이더 Box 는 별도(cover.js).
// ══════════════════════════════════════════════════════════════════
export function buildCoverProp(kind) {
  const g = new THREE.Group(); g.name = 'cover_' + kind;
  const add = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); return m;
  };
  switch (kind) {
    case 'crateWall': // 낮은 궤짝벽 (TOP)
      add(G.box, MAT.WOOD, -0.55, 0.5, 0, 1.0, 1.0, 0.8);
      add(G.box, MAT.WOOD, 0.55, 0.45, 0.1, 1.0, 0.9, 0.8, 0.08);
      add(G.box, MAT.BRASS, -0.55, 1.02, 0, 1.04, 0.06, 0.84);
      break;
    case 'lowWall': // 낮은 담장 (TOP) — 기와 캡
      add(G.box, MAT.STONE, 0, 0.48, 0, 2.6, 0.96, 0.5);
      add(G.box, MAT.TILE, 0, 1.01, 0, 2.8, 0.12, 0.7);
      break;
    case 'gateJambL': case 'gateJambR': { // 관문 문설주 (세로 석축 + 증기 배관)
      add(G.box, MAT.STONE, 0, 1.5, 0, 1.1, 3.0, 0.9);
      add(G.box, MAT.TILE, 0, 3.1, 0, 1.4, 0.25, 1.2);
      add(G.cyl, MAT.BRASS, kind === 'gateJambL' ? 0.5 : -0.5, 1.6, 0.4, 0.12, 3.0, 0.12);
      break;
    }
    case 'pillarCorner': // 단청 모서리 기둥 (L피크)
      add(G.cyl, MAT.DANCHEONG_R, 0, 1.7, 0, 0.85, 3.4, 0.85);
      add(G.box, MAT.DANCHEONG_G, 0, 3.5, 0, 1.5, 0.3, 1.5);
      add(G.box, MAT.STONE, 0, 0.15, 0, 1.2, 0.3, 1.2);
      break;
    case 'wallCorner': // 담 모서리 (R피크)
      add(G.box, MAT.STONE, -0.6, 1.3, 0, 1.6, 2.6, 0.6);
      add(G.box, MAT.TILE, -0.6, 2.7, 0, 1.9, 0.18, 0.85);
      break;
    case 'brokenAltar': // 무너진 제단 (TOP, 보스룸 중앙)
      add(G.box, MAT.STONE, 0, 0.45, 0, 2.2, 0.9, 1.0);
      add(G.box, MAT.STONE, -0.5, 1.05, 0.1, 1.0, 0.3, 0.8, 0.2);
      break;
    case 'rubbleL': case 'rubbleR': // 낙석/기둥 잔해 (L/R)
      add(G.box, MAT.STONE, 0, 0.8, 0, 1.3, 1.6, 0.9, 0.15);
      add(G.cyl, MAT.DANCHEONG_R, kind === 'rubbleL' ? -0.7 : 0.7, 0.5, 0.3, 0.5, 2.4, 0.5).rotation.z = Math.PI / 2.4;
      break;
  }
  return g;
}

// ══════════════════════════════════════════════════════════════════
// 보스 고붕이 — 쇠 먹는 불가사리형 증기 자동인형. 포탑4/가슴코어/머리코어 별도 메시.
// ══════════════════════════════════════════════════════════════════
export function buildGobungi() {
  const g = new THREE.Group(); g.name = 'gobungi';
  const body = mergeParts([
    { geo: G.cyl, mat: MAT.IRON, y: 2.6, sx: 2.6, sy: 3.4, sz: 2.2 },                 // 거대 보일러 몸통
    { geo: G.box, mat: MAT.BRASS, y: 4.5, sx: 3.4, sy: 0.5, sz: 2.4 },                // 어깨 플레이트
    { geo: G.sphere, mat: MAT.IRON, y: 5.3, sx: 1.1, sy: 1.0, sz: 1.1 },              // 머리
    { geo: G.cone, mat: MAT.BLACK, y: 6.1, sx: 1.3, sy: 0.7, sz: 1.3 },               // 철 갓
    { geo: G.sphere, mat: MAT.DANGER, x: -0.32, y: 5.35, z: -0.85, sx: 0.14, sy: 0.14, sz: 0.14 }, // 발광 눈(왼)
    { geo: G.sphere, mat: MAT.DANGER, x: 0.32, y: 5.35, z: -0.85, sx: 0.14, sy: 0.14, sz: 0.14 },  // 발광 눈(오)
    { geo: G.box, mat: MAT.IRON, x: -1.9, y: 1.0, sx: 0.9, sy: 2.0, sz: 1.1 },        // 다리(왼)
    { geo: G.box, mat: MAT.IRON, x: 1.9, y: 1.0, sx: 0.9, sy: 2.0, sz: 1.1 },         // 다리(오)
    { geo: G.cyl, mat: MAT.BRASS, x: -2.4, y: 3.4, rz: 0.5, sx: 0.3, sy: 2.2, sz: 0.3 }, // 팔 배관(왼)
    { geo: G.cyl, mat: MAT.BRASS, x: 2.4, y: 3.4, rz: -0.5, sx: 0.3, sy: 2.2, sz: 0.3 },
  ]);
  body.name = 'body'; g.add(body);

  // 어깨 포탑 4문 (개별 파괴 대상)
  const turretPos = [[-2.1, 4.9, -0.4], [-0.8, 5.1, -0.7], [0.8, 5.1, -0.7], [2.1, 4.9, -0.4]];
  turretPos.forEach((p, i) => {
    const t = new THREE.Group(); t.name = 'turret' + i; t.position.set(...p);
    const base = new THREE.Mesh(G.cyl, MAT.BRASS); base.scale.set(0.42, 0.5, 0.42); t.add(base);
    const bar = new THREE.Mesh(G.cyl, MAT.BLACK); bar.scale.set(0.12, 0.9, 0.12);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.15, -0.45); t.add(bar);
    const hit = new THREE.Mesh(G.sphere, MAT.PROXY); hit.name = 'hitTurret' + i; hit.scale.set(0.9, 0.9, 0.9); t.add(hit);
    g.add(t);
  });

  // 가슴 코어 (P2 딜존, 개폐)
  const chest = new THREE.Group(); chest.name = 'chestCore'; chest.position.set(0, 3.0, -1.15);
  const lid = new THREE.Mesh(G.box, MAT.BRASS); lid.name = 'coreLid'; lid.scale.set(1.5, 1.5, 0.25); chest.add(lid);
  const core = new THREE.Mesh(G.sphere, MAT.STEAM); core.name = 'coreOrb'; core.scale.set(1.0, 1.0, 0.7); core.position.z = -0.1; chest.add(core);
  const hitCore = new THREE.Mesh(G.sphere, MAT.PROXY); hitCore.name = 'hitCore'; hitCore.scale.set(1.15, 1.15, 0.9); chest.add(hitCore);
  g.add(chest);

  // 머리 코어 (P2 후반 약점)
  const headCore = new THREE.Mesh(G.sphere, MAT.STEAM); headCore.name = 'headCore';
  headCore.scale.set(0.45, 0.45, 0.45); headCore.position.set(0, 5.35, -0.95); g.add(headCore);
  const hitHeadCore = new THREE.Mesh(G.sphere, MAT.PROXY); hitHeadCore.name = 'hitHeadCore';
  hitHeadCore.scale.set(0.6, 0.6, 0.6); hitHeadCore.position.copy(headCore.position); g.add(hitHeadCore);
  return g;
}

// ══════════════════════════════════════════════════════════════════
// 환경 — 섹션 드레싱 (야간 팔레트 + 등롱 + 실루엣 백드롭)
// ══════════════════════════════════════════════════════════════════
export function buildEnvironment() {
  const env = new THREE.Group(); env.name = 'environment';

  const floorTex = stoneFloorTex(); floorTex.repeat.set(26, 48);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 260),
    new THREE.MeshStandardMaterial({ color: 0x555a6e, map: floorTex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.z = -90; env.add(ground);

  // 밤하늘 돔 (안개 미적용)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(98, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false }));
  sky.position.set(0, 0, -70); env.add(sky);

  const addWallRun = (x, z0, z1, mat = MAT.STONE, h = 3.2) => {
    const len = Math.abs(z1 - z0);
    const w = new THREE.Mesh(G.box, mat); w.scale.set(0.8, h, len);
    w.position.set(x, h / 2, (z0 + z1) / 2); env.add(w);
    const cap = new THREE.Mesh(G.box, MAT.TILE); cap.scale.set(1.1, 0.2, len + 0.4);
    cap.position.set(x, h + 0.1, (z0 + z1) / 2); env.add(cap);
  };
  const addLantern = (x, z) => {
    const l = new THREE.Group(); l.position.set(x, 0, z);
    const pole = new THREE.Mesh(G.cyl, MAT.BLACK); pole.scale.set(0.07, 2.4, 0.07); pole.position.y = 1.2; l.add(pole);
    const paper = new THREE.Mesh(G.sphere, MAT.PAPER); paper.scale.set(0.3, 0.36, 0.3); paper.position.y = 2.35; l.add(paper);
    const cap = new THREE.Mesh(G.cone, MAT.TILE); cap.scale.set(0.4, 0.25, 0.4); cap.position.y = 2.62; l.add(cap);
    l.userData.lightAnchor = new THREE.Vector3(x, 2.35, z);
    env.add(l); return l;
  };

  // 광화문 광장 (z 0 ~ -40): 개활 + 측면 담장 + 광화문 실루엣
  addWallRun(-16, 4, -40); addWallRun(16, 4, -40);
  addLantern(-7, -6); addLantern(7, -14); addLantern(-7, -30); addLantern(7, -34);
  { // 폭풍의 관문 = 광화문 — 아치는 진짜 개구부 (S3 에서 이 안을 향해 사격)
    const gate = new THREE.Group(); gate.position.set(0, 0, -52); gate.name = 'gateProc';
    const baseL = new THREE.Mesh(G.box, MAT.STONE); baseL.scale.set(7.6, 5, 3); baseL.position.set(-6.1, 2.5, 0); gate.add(baseL);
    const baseR = baseL.clone(); baseR.position.x = 6.1; gate.add(baseR);
    const lintel = new THREE.Mesh(G.box, MAT.STONE); lintel.scale.set(20, 1.4, 3); lintel.position.y = 4.4; gate.add(lintel);
    const roof1 = new THREE.Mesh(G.box, MAT.TILE); roof1.scale.set(22, 1.1, 5); roof1.position.y = 6.1; gate.add(roof1);
    const mid = new THREE.Mesh(G.box, MAT.DANCHEONG_R); mid.scale.set(17, 2.4, 2.6); mid.position.y = 8; gate.add(mid);
    const roof2 = new THREE.Mesh(G.box, MAT.TILE); roof2.scale.set(20, 1.1, 4.4); roof2.position.y = 9.7; gate.add(roof2);
    env.add(gate);
    // 관문 빌보드 — 실사 광화문(컷아웃) 우선, 실패 시 Gemini 컨셉 아트 폴백
    const applyGateBillboard = (tex, width) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const h = width / (tex.image.width / tex.image.height);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.06, color: 0x9aa2c4, depthWrite: true }));
      plane.position.set(0, h / 2 - 0.6, -52.2); // 바닥 밀착
      env.add(plane);
      gate.children.forEach(c => { if (c !== baseL && c !== baseR) c.visible = false; }); // 석축만 남기고 대체
      baseL.position.z = baseR.position.z = -1.4; // 빌보드 뒤(더 먼 쪽)로 — 측면 깊이감 담당
    };
    // 실사 광화문은 현대 빌딩·인파가 프레임에 껴서 부적합 — Gemini 컨셉 아트 유지
    new THREE.TextureLoader().load('assets/gate_billboard.png', (tex) => applyGateBillboard(tex, 18.5), undefined, () => {});
    // 관문 너머 통로 (S3 교전 공간): 좁은 벽 + 등롱
    const inL = new THREE.Mesh(G.box, MAT.STONE); inL.scale.set(0.8, 3.2, 16); inL.position.set(-4.5, 1.6, -61); env.add(inL);
    const inR = inL.clone(); inR.position.x = 4.5; env.add(inR);
    addLantern(-3, -57); addLantern(3, -63);
  }

  // 회랑 구간 (z -56 ~ -110): 좁아지는 벽 + 단청 기둥 + 처마 + 한지 창 + 증기 배관
  addWallRun(-12, -56, -112); addWallRun(10, -56, -112);
  const hanjiMat = new THREE.MeshStandardMaterial({ map: hanjiWindowTex(), emissive: 0xe8c87a, emissiveIntensity: 0.65, emissiveMap: hanjiWindowTex() });
  for (let z = -60; z >= -108; z -= 12) {
    const p1 = new THREE.Mesh(G.cyl, MAT.DANCHEONG_R); p1.scale.set(0.4, 3.6, 0.4); p1.position.set(-9.5, 1.8, z); env.add(p1);
    const p2 = new THREE.Mesh(G.cyl, MAT.DANCHEONG_R); p2.scale.set(0.4, 3.6, 0.4); p2.position.set(7.5, 1.8, z - 6); env.add(p2);
    // 기둥 위 처마 (기와 스트립)
    const eave1 = new THREE.Mesh(G.box, MAT.TILE); eave1.scale.set(2.6, 0.28, 11.6); eave1.position.set(-10.4, 3.75, z - 5.5); env.add(eave1);
    const eave2 = new THREE.Mesh(G.box, MAT.TILE); eave2.scale.set(2.6, 0.28, 11.6); eave2.position.set(8.4, 3.75, z - 11.5); env.add(eave2);
    // 한지 창 (발광 — 블룸 픽업)
    const w1 = new THREE.Mesh(G.box, hanjiMat); w1.scale.set(0.06, 1.1, 0.8); w1.position.set(-11.5, 1.7, z - 4); env.add(w1);
    const w2 = new THREE.Mesh(G.box, hanjiMat); w2.scale.set(0.06, 1.1, 0.8); w2.position.set(9.5, 1.7, z - 9); env.add(w2);
  }
  // 벽면 증기 배관 (황동)
  const pipe1 = new THREE.Mesh(G.cyl, MAT.BRASS); pipe1.scale.set(0.12, 54, 0.12); pipe1.rotation.x = Math.PI / 2; pipe1.position.set(-11.3, 2.9, -84); env.add(pipe1);
  const pipe2 = new THREE.Mesh(G.cyl, MAT.BRASS); pipe2.scale.set(0.12, 54, 0.12); pipe2.rotation.x = Math.PI / 2; pipe2.position.set(9.3, 0.5, -84); env.add(pipe2);
  addLantern(-8, -68); addLantern(6, -90);

  // 보스룸 (z -112 ~ -140): 넓은 방 + 배경 대형 보일러 실루엣
  addWallRun(-20, -112, -142); addWallRun(20, -112, -142);
  { const back = new THREE.Mesh(G.box, MAT.TILE); back.scale.set(44, 14, 1.5); back.position.set(0, 7, -142); env.add(back);
    const gear = new THREE.Mesh(G.torus, MAT.IRON); gear.scale.set(6, 6, 6); gear.position.set(-12, 7, -140.8); env.add(gear);
    const boiler = new THREE.Mesh(G.cyl, MAT.IRON); boiler.scale.set(4, 10, 4); boiler.position.set(13, 5, -140); env.add(boiler);
    // 근정전 빌보드 — 실사(컷아웃) 우선, 실패 시 Gemini 아트 폴백
    const applyHallBillboard = (tex, width, square, tint) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const h = square ? width : width / (tex.image.width / tex.image.height);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, h),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.06, color: tint, depthWrite: true }));
      plane.position.set(0, square ? 15 : h / 2 - 0.4, -141.5);
      env.add(plane);
      back.visible = gear.visible = boiler.visible = false;
    };
    // 실사 근정전 (위키미디어 CC — 야간 그레이드 컷아웃) 우선, 실패 시 Gemini 아트
    new THREE.TextureLoader().load('assets/real_geunjeongjeon_cut.png?v=1',
      (tex) => applyHallBillboard(tex, 46, false, 0xcdd4ea),  // 이미 야간 그레이드 — 옅은 틴트만
      undefined,
      () => new THREE.TextureLoader().load('assets/hall_billboard.png', (tex) => applyHallBillboard(tex, 34, true, 0x7a86ac), undefined, () => {})); }
  addLantern(-6, -114); addLantern(6, -114);

  // 원경 산 실루엣
  const hills = new THREE.Mesh(new THREE.PlaneGeometry(300, 40), new THREE.MeshBasicMaterial({ color: 0x0d1020 }));
  hills.position.set(0, 12, -160); env.add(hills);

  // ── (자유이동판) 낮은 엄폐 프롭 — leveldata.COVERS 가 시각·사선의 단일 진실 ──
  for (const c of COVERS) {
    const prop = buildCoverProp(c.kind);
    prop.position.set(c.x, 0, c.z);
    prop.rotation.y = (Math.random() - 0.5) * 0.35; // ±10° 지터 (배치감)
    env.add(prop);
  }

  // ── 사선 차단(LOS) 콜라이더: WALLS + COVERS 그대로 — 비가시 박스 ──
  for (const b of [...WALLS, ...COVERS]) {
    const m = new THREE.Mesh(G.box, MAT.PROXY);
    m.scale.set(b.w, b.h, b.d);
    m.position.set(b.x, b.h / 2, b.z);
    env.add(m); losMeshes.push(m);
  }

  // ── 킬게이트 철문 (닫힘 시작, 존 클리어 시 침강 개방) ──
  for (const gdef of GATES) {
    const door = new THREE.Group(); door.name = gdef.id;
    const ironTex = MAT.IRON;
    const dL = new THREE.Mesh(G.box, ironTex); dL.scale.set(gdef.w / 2 - 0.05, gdef.h, 0.25); dL.position.set(-gdef.w / 4, gdef.h / 2, 0); door.add(dL);
    const dR = dL.clone(); dR.position.x = gdef.w / 4; door.add(dR);
    // 황동 기어 장식 + 경첩 밴드
    for (const side of [-1, 1]) {
      const gear = new THREE.Mesh(G.torus, MAT.BRASS); gear.scale.set(0.5, 0.5, 0.5);
      gear.position.set(side * gdef.w / 4, gdef.h * 0.45, 0.16); door.add(gear);
      const band = new THREE.Mesh(G.box, MAT.BRASS); band.scale.set(gdef.w / 2 - 0.1, 0.12, 0.28);
      band.position.set(side * gdef.w / 4, gdef.h * 0.75, 0); door.add(band);
    }
    door.position.set(gdef.x, 0, gdef.z);
    env.add(door);
    const los = new THREE.Mesh(G.box, MAT.PROXY);
    los.scale.set(gdef.w, gdef.h, 0.3); los.position.set(gdef.x, gdef.h / 2, gdef.z);
    env.add(los); losMeshes.push(los);
    gateVisuals.set(gdef.id, { door, los, h: gdef.h });
  }
  return env;
}

// LOS 콜라이더 목록 (main 이 combat.registerBlocker 로 등록)
export const losMeshes = [];

// 게이트 개방: 철문이 증기와 함께 지면으로 침강
const gateVisuals = new Map();
export function openGateVisual(id) {
  const g = gateVisuals.get(id); if (!g) return;
  const i = losMeshes.indexOf(g.los); if (i >= 0) losMeshes.splice(i, 1);
  if (g.los.parent) g.los.parent.remove(g.los);
  const t0 = performance.now();
  const iv = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / 1400);
    g.door.position.y = -g.h * (k * k);
    if (k >= 1) { clearInterval(iv); g.door.visible = false; }
  }, 33);
}

// ══════════════════════════════════════════════════════════════════
// 레지스트리 + GLB 무중단 스왑
// ══════════════════════════════════════════════════════════════════
const gltfLoader = new GLTFLoader();
export const REGISTRY = {
  vm_rifle:   { build: buildRifleVM,   glb: 'assets/models/vm_rifle.glb' },
  vm_carbine: { build: buildCarbineVM, glb: 'assets/models/vm_carbine.glb' },
  vm_ritual:  { build: buildRitualVM,  glb: 'assets/models/vm_ritual.glb' },
  gobungi:    { build: buildGobungi,   glb: null },  // 포탑/코어 판정 계층 유지 위해 절차 고정 (외형 파츠만 GLB 덧붙임 가능)
};

export function instantiate(id) {
  const entry = REGISTRY[id];
  const anchor = new THREE.Group(); anchor.name = 'anchor_' + id;
  anchor.add(entry.build());
  if (entry.glb) {
    gltfLoader.load(entry.glb, (g) => {
      const s = g.scene; normalize(s, entry.targetSize || 1);
      anchor.clear(); anchor.add(s);
    }, undefined, () => { /* 404/파손 → 절차적 유지 */ });
  }
  return anchor;
}

function normalize(obj, targetSize) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(scale);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y; // 바닥 원점
}
