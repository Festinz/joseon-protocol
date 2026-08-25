// rail.js — (자유이동판) 1인칭 플레이어 컨트롤러.
// 파일명은 호환을 위해 유지: rig{dolly,shoulder,camera}, shoulderWorldPos, applyShoulder 를 그대로 내보낸다.
// dolly = 플레이어 루트(위치+요), shoulder = 리닝/견착 노드(롤+측면 오프셋), camera = 피치.

import * as THREE from 'three';
import { PLAYER, MOVE, PERF } from './config.js';
import { WALLS, COVERS, PLAYER_START, ZONES } from './leveldata.js';
import { state, now } from './state.js';
import { keys, consumeMouseDelta, isLeanHeld } from './input.js';

export const rig = {
  dolly: new THREE.Group(),     // 위치 + yaw
  shoulder: new THREE.Group(),  // 리닝 오프셋/롤 + 견착 어깨
  camera: null,
};

let yaw = 0, pitch = 0;
let velX = 0, velZ = 0;
let bobPhase = 0;
let leanT = 0;            // -1(좌) .. 0 .. +1(우) 목표를 향한 보간값
let leanTarget = 0;
let crouchT = 0;          // 0 서있음 .. 1 앉음
const solids = [];        // {minX,maxX,minZ,maxZ,h} — 이동 충돌 (벽 + 커버 + 닫힌 게이트)

export function initRail(camera) {
  rig.camera = camera;
  rig.dolly.add(rig.shoulder); rig.shoulder.add(camera);
  camera.fov = PLAYER.fov; camera.far = PERF.cameraFar; camera.near = 0.05; camera.updateProjectionMatrix();
  rig.dolly.position.set(...PLAYER_START);
  rig.shoulder.position.y = MOVE.eyeStand;
  applyShoulder();
  for (const w of WALLS) addSolid(w);
  for (const c of COVERS) addSolid(c);
  return rig.dolly;
}

function addSolid(b) {
  solids.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, h: b.h, ref: b });
}
// 게이트 충돌체 (열리면 제거)
const gateSolids = new Map();
export function addGateSolid(id, g) {
  const s = { minX: g.x - g.w / 2, maxX: g.x + g.w / 2, minZ: g.z - 0.4, maxZ: g.z + 0.4, h: g.h, ref: g };
  solids.push(s); gateSolids.set(id, s);
}
export function removeGateSolid(id) {
  const s = gateSolids.get(id); if (!s) return;
  const i = solids.indexOf(s); if (i >= 0) solids.splice(i, 1);
  gateSolids.delete(id);
}

export function applyShoulder() {
  const sign = state.hand === 'L' ? -1 : 1;
  rig.shoulder.position.x = sign * PLAYER.shoulderX;
}

export function teleport(x, z, newYaw = 0) {
  rig.dolly.position.x = x; rig.dolly.position.z = z;
  yaw = newYaw; velX = velZ = 0;
}

// 리닝 판정: 현재 리닝 방향이 견착과 같은 쪽인가 (핵심 훅 잔존)
export function isFavorable() {
  if (Math.abs(leanT) < 0.15) return null;
  const side = leanT > 0 ? 'R' : 'L';
  return side === state.hand;
}
export function leanAmount() { return Math.abs(leanT); }

export function updateRail(dt) {
  const dts = Math.min(0.05, dt / 1000);
  const p = state.player;
  if (p.state === 'DEAD') return;

  // ── ADS (우클릭 견착): FOV 줌 + 감도 저하 ──
  state._adsT = (state._adsT || 0) + ((state.ads ? 1 : 0) - (state._adsT || 0)) * Math.min(1, dts * 9);
  const targetFov = PLAYER.fov - state._adsT * 26;
  if (Math.abs(rig.camera.fov - targetFov) > 0.1) { rig.camera.fov = targetFov; rig.camera.updateProjectionMatrix(); }
  const sens = 1 - state._adsT * 0.45;

  // ── 마우스 룩 ──
  const md = consumeMouseDelta();
  yaw -= md.x * 0.0023 * sens;
  pitch -= md.y * 0.0021 * sens;
  state._lookDX = md.x; state._lookDY = md.y;   // 뷰모델 룩-스웨이용 (vmsprite)
  state._pitchVal = pitch;                       // 상하 조준 패럴랙스용
  pitch = Math.max(-1.35, Math.min(1.35, pitch));
  rig.dolly.rotation.y = yaw;
  rig.camera.rotation.x = pitch;

  // ── 이동 ──
  const sprint = keys.shift && !keys.ctrl;
  const speed = MOVE.walkSpeed * (sprint ? MOVE.sprintMult : 1) * (keys.ctrl ? MOVE.crouchMult : 1);
  let ix = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  let iz = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
  const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
  // 로컬 → 월드
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const wx = ix * cos + iz * sin;
  const wz = -ix * sin + iz * cos;
  velX += (wx * speed - velX) * Math.min(1, MOVE.accel * dts / Math.max(speed, 0.01)) * (ix || iz ? 1 : 0);
  velZ += (wz * speed - velZ) * Math.min(1, MOVE.accel * dts / Math.max(speed, 0.01)) * (ix || iz ? 1 : 0);
  if (!ix && !iz) { velX -= velX * Math.min(1, MOVE.friction * dts); velZ -= velZ * Math.min(1, MOVE.friction * dts); }

  // 충돌 (축 분리 슬라이드)
  const r = MOVE.radius;
  let nx = rig.dolly.position.x + velX * dts;
  if (!hitsSolid(nx, rig.dolly.position.z, r)) rig.dolly.position.x = nx; else velX = 0;
  let nz = rig.dolly.position.z + velZ * dts;
  if (!hitsSolid(rig.dolly.position.x, nz, r)) rig.dolly.position.z = nz; else velZ = 0;

  state.playerMoving = Math.hypot(velX, velZ) > 0.5;

  // ── 앉기 ──
  const crouchGoal = keys.ctrl ? 1 : 0;
  crouchT += (crouchGoal - crouchT) * Math.min(1, dts * 10);
  const eyeY = MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * crouchT;

  // ── 리닝 (견착 훅): 유리한 쪽이 빠르고 깊다 ──
  const lh = isLeanHeld(); // -1 | 0 | +1
  leanTarget = lh;
  const goalSide = lh !== 0 ? (lh > 0 ? 'R' : 'L') : null;
  const fav = goalSide ? goalSide === state.hand : true;
  const cfg = fav ? MOVE.lean.fav : MOVE.lean.unfav;
  const rate = 1000 / cfg.ms;
  leanT += (leanTarget - leanT) * Math.min(1, dts * rate);
  const activeCfg = (leanT > 0 ? 'R' : 'L') === state.hand ? MOVE.lean.fav : MOVE.lean.unfav;
  rig.shoulder.position.x = (state.hand === 'L' ? -1 : 1) * PLAYER.shoulderX + leanT * activeCfg.offset;
  rig.shoulder.rotation.z = -leanT * activeCfg.rollDeg * Math.PI / 180;

  // ── 헤드밥 ──
  if (state.playerMoving) bobPhase += dts * MOVE.bobFreq * (sprint ? 1.25 : 1);
  const bob = Math.sin(bobPhase) * MOVE.bobAmp * (state.playerMoving ? 1 : 0);
  rig.shoulder.position.y = eyeY + bob;

  state.playerCrouching = crouchT > 0.6;
}

function hitsSolid(x, z, r) {
  for (const s of solids) {
    if (x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ) return true;
  }
  return false;
}

export function shoulderWorldPos(out) {
  return rig.shoulder.getWorldPosition(out || new THREE.Vector3());
}

export function playerPos() { return rig.dolly.position; }

// 존 진입 감지용
export function currentZoneIndex() {
  const z = rig.dolly.position.z;
  let idx = 0;
  for (let i = 0; i < ZONES.length; i++) if (z <= ZONES[i].enterZ) idx = i;
  return idx;
}
