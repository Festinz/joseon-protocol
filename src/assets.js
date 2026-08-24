// assets.js — 절차적 빌더 레지스트리 + GLB 무중단 스왑.
// 원칙: 어떤 GLB 가 없어도/깨져도 게임은 절차적 버전으로 항상 완성 상태.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './config.js';
import { stoneFloorTex, roofTileTex, stoneWallTex, skyTex } from './textures.js';

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
// ══════════════════════════════════════════════════════════════════
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
  if (variant === 'marksman') { // 붉은 어깨띠 — 색 코딩이 곧 게임플레이
    parts.push({ geo: G.torus, mat: MAT.DANGER, y: 0.34, rx: Math.PI / 2, rz: 0.5, sx: 0.55, sy: 0.55, sz: 0.9 });
  }
  if (variant === 'thrower') { // 등의 화약통
    parts.push({ geo: G.cyl, mat: MAT.LEATHER, y: 0.2, z: 0.3, sx: 0.28, sy: 0.5, sz: 0.28 });
    parts.push({ geo: G.sphere, mat: MAT.DANGER, y: 0.48, z: 0.3, sx: 0.12, sy: 0.12, sz: 0.12 });
  }
  const body = mergeParts(parts); body.name = 'body'; torso.add(body);

  if (variant === 'shield') { // 철 방패 — 몸통 가림, 머리만 유효
    const sh = new THREE.Mesh(G.box, MAT.IRON); sh.scale.set(0.95, 1.25, 0.08);
    sh.position.set(0, 0.05, -0.42); sh.name = 'shieldPlate'; torso.add(sh);
  }

  const gun = new THREE.Group(); gun.name = 'gunPivot'; gun.position.set(-0.28, 0.15, -0.15); torso.add(gun);
  const barrel = new THREE.Mesh(G.cyl, variant === 'shield' ? MAT.PROXY : MAT.BLACK);
  barrel.scale.set(0.07, 0.7, 0.07); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.3; gun.add(barrel);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -0.65); gun.add(muzzle);

  // 히트 프록시 (렌더 안 됨, 레이캐스트만)
  const hitBody = new THREE.Mesh(G.box, MAT.PROXY); hitBody.name = 'hitBody';
  hitBody.scale.set(0.75, 1.35, 0.6); hitBody.position.y = 0.1; torso.add(hitBody);
  const hitHead = new THREE.Mesh(G.sphere, MAT.PROXY); hitHead.name = 'hitHead';
  hitHead.scale.set(0.42, 0.42, 0.42); hitHead.position.y = 0.62; torso.add(hitHead);
  return root;
}

// ══════════════════════════════════════════════════════════════════
// 뷰모델 — 영천 장총 (P0 절차판; img2threejs 산출물로 교체 예정)
// ══════════════════════════════════════════════════════════════════
export function buildRifleVM() {
  const g = new THREE.Group(); g.name = 'vm_rifle';
  const parts = [
    { geo: G.box, mat: MAT.WOOD, z: 0.18, sx: 0.055, sy: 0.10, sz: 0.52 },                    // 개머리판+몸체
    { geo: G.box, mat: MAT.WOOD, y: -0.065, z: 0.42, rx: 0.5, sx: 0.05, sy: 0.16, sz: 0.09 }, // 그립
    { geo: G.cyl, mat: MAT.BLACK, rx: Math.PI / 2, z: -0.38, sx: 0.026, sy: 0.85, sz: 0.026 },// 총열
    { geo: G.cyl, mat: MAT.BRASS, rx: Math.PI / 2, z: -0.05, sx: 0.045, sy: 0.22, sz: 0.045 },// 황동 리시버
    { geo: G.cyl, mat: MAT.BRASS, x: 0.05, y: 0.05, z: 0.02, rz: 1.2, sx: 0.02, sy: 0.1, sz: 0.02 }, // 볼트
    { geo: G.cyl, mat: MAT.STEAM, y: 0.075, z: -0.12, sx: 0.028, sy: 0.09, sz: 0.028 },       // 증기 유리관
    { geo: G.cyl, mat: MAT.BRASS, y: -0.07, z: -0.28, rx: Math.PI / 2, sx: 0.035, sy: 0.3, sz: 0.035 }, // 하부 증기관
    { geo: G.torus, mat: MAT.BRASS, z: -0.2, sx: 0.09, sy: 0.09, sz: 0.09 },                  // 압력계 링
  ];
  const mesh = mergeParts(parts); g.add(mesh);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -0.82); g.add(muzzle);
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
    const gate = new THREE.Group(); gate.position.set(0, 0, -52);
    const baseL = new THREE.Mesh(G.box, MAT.STONE); baseL.scale.set(7.6, 5, 3); baseL.position.set(-6.1, 2.5, 0); gate.add(baseL);
    const baseR = baseL.clone(); baseR.position.x = 6.1; gate.add(baseR);
    const lintel = new THREE.Mesh(G.box, MAT.STONE); lintel.scale.set(20, 1.4, 3); lintel.position.y = 4.4; gate.add(lintel);
    const roof1 = new THREE.Mesh(G.box, MAT.TILE); roof1.scale.set(22, 1.1, 5); roof1.position.y = 6.1; gate.add(roof1);
    const mid = new THREE.Mesh(G.box, MAT.DANCHEONG_R); mid.scale.set(17, 2.4, 2.6); mid.position.y = 8; gate.add(mid);
    const roof2 = new THREE.Mesh(G.box, MAT.TILE); roof2.scale.set(20, 1.1, 4.4); roof2.position.y = 9.7; gate.add(roof2);
    env.add(gate);
    // 관문 너머 통로 (S3 교전 공간): 좁은 벽 + 등롱
    const inL = new THREE.Mesh(G.box, MAT.STONE); inL.scale.set(0.8, 3.2, 16); inL.position.set(-4.5, 1.6, -61); env.add(inL);
    const inR = inL.clone(); inR.position.x = 4.5; env.add(inR);
    addLantern(-3, -57); addLantern(3, -63);
  }

  // 회랑 구간 (z -56 ~ -110): 좁아지는 벽 + 기둥 + 등롱
  addWallRun(-12, -56, -112); addWallRun(10, -56, -112);
  for (let z = -60; z >= -108; z -= 12) {
    const p1 = new THREE.Mesh(G.cyl, MAT.DANCHEONG_R); p1.scale.set(0.4, 3.6, 0.4); p1.position.set(-9.5, 1.8, z); env.add(p1);
    const p2 = new THREE.Mesh(G.cyl, MAT.DANCHEONG_R); p2.scale.set(0.4, 3.6, 0.4); p2.position.set(7.5, 1.8, z - 6); env.add(p2);
  }
  addLantern(-8, -68); addLantern(6, -90);

  // 보스룸 (z -112 ~ -140): 넓은 방 + 배경 대형 보일러 실루엣
  addWallRun(-20, -112, -142); addWallRun(20, -112, -142);
  { const back = new THREE.Mesh(G.box, MAT.TILE); back.scale.set(44, 14, 1.5); back.position.set(0, 7, -142); env.add(back);
    const gear = new THREE.Mesh(G.torus, MAT.IRON); gear.scale.set(6, 6, 6); gear.position.set(-12, 7, -140.8); env.add(gear);
    const boiler = new THREE.Mesh(G.cyl, MAT.IRON); boiler.scale.set(4, 10, 4); boiler.position.set(13, 5, -140); env.add(boiler); }
  addLantern(-6, -114); addLantern(6, -114);

  // 원경 산 실루엣
  const hills = new THREE.Mesh(new THREE.PlaneGeometry(300, 40), new THREE.MeshBasicMaterial({ color: 0x0d1020 }));
  hills.position.set(0, 12, -160); env.add(hills);
  return env;
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
