// rail.js — CatmullRom 스플라인 + 노드 정지, 카메라 리그 계층, 노드 간 트윈(무적).
// 리그: railDolly > coverRig > shoulderRig > camera(+viewmodel layer 1)

import * as THREE from 'three';
import { LEVEL, RAIL_POINTS } from './leveldata.js';
import { PLAYER, RAIL, PERF } from './config.js';
import { state, now } from './state.js';

export const rig = {
  dolly: new THREE.Group(),
  cover: new THREE.Group(),
  shoulder: new THREE.Group(),
  camera: null,
};

const curve = new THREE.CatmullRomCurve3(RAIL_POINTS.map(p => new THREE.Vector3(...p)), false, 'centripetal');
const SAMPLES = 600;
const samplePts = curve.getPoints(SAMPLES);

// 각 노드의 스플라인 파라미터 t (최근접 샘플)
const nodeT = LEVEL.map(node => {
  const p = new THREE.Vector3(...node.pos);
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const d = samplePts[i].distanceToSquared(p);
    if (d < bestD) { bestD = d; best = i / SAMPLES; }
  }
  return best;
});

let transit = null; // { t0, t1, q0, q1, start, dur, targetIndex }
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function initRail(camera) {
  rig.camera = camera;
  rig.dolly.add(rig.cover); rig.cover.add(rig.shoulder); rig.shoulder.add(camera);
  rig.cover.position.y = PLAYER.coveredEyeY;
  camera.fov = PLAYER.fov; camera.far = PERF.cameraFar; camera.near = 0.05; camera.updateProjectionMatrix();
  applyShoulder();
  snapToNode(0);
  return rig.dolly;
}

export function applyShoulder() {
  const sign = state.hand === 'L' ? -1 : 1;
  rig.shoulder.position.x = sign * PLAYER.shoulderX;
}

function lookQuatAt(nodeIdx) {
  const node = LEVEL[nodeIdx];
  const pos = new THREE.Vector3(...node.pos);
  const look = new THREE.Vector3(...node.look);
  _m.lookAt(pos, look, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}

export function snapToNode(idx) {
  const node = LEVEL[idx];
  state.nodeIndex = idx; state.node = node; state.coverIdx = 0; state.waveIndex = 0;
  rig.dolly.position.set(...node.pos);
  applyCoverOffset();
  rig.dolly.quaternion.copy(lookQuatAt(idx));
  state.emit('nodeArrived', node);
}

// DUAL/보스: 노드 내 커버 전환 (오프셋만 이동)
export function applyCoverOffset() {
  const node = state.node; if (!node) return;
  const cover = node.covers[state.coverIdx];
  const off = cover.offset || [0, 0, 0];
  const base = new THREE.Vector3(...node.pos);
  const local = new THREE.Vector3(...off).applyQuaternion(lookQuatAt(state.nodeIndex));
  rig.dolly.position.copy(base).add(local);
}

export function startTransit(targetIndex) {
  if (targetIndex >= LEVEL.length) { state.emit('runComplete'); return; }
  const t0 = nodeT[state.nodeIndex], t1 = nodeT[targetIndex];
  transit = {
    t0, t1, start: now(), dur: RAIL.transitMs, targetIndex,
    q0: rig.dolly.quaternion.clone(), q1: lookQuatAt(targetIndex),
  };
  state.inTransit = true;
  state.player.state = 'TRANSIT';
  state.emit('transitStart', targetIndex);
}

const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function updateRail() {
  if (!transit) return;
  const k = Math.min(1, (now() - transit.start) / transit.dur);
  const e = easeInOut(k);
  const t = transit.t0 + (transit.t1 - transit.t0) * e;
  curve.getPointAt(Math.max(0, Math.min(1, t)), _v);
  rig.dolly.position.copy(_v);
  // 시선: 이동 후반 55% 구간에서 slerp
  const lk = Math.max(0, (k - 0.45) / 0.55);
  rig.dolly.quaternion.slerpQuaternions(transit.q0, transit.q1, easeInOut(lk));
  if (k >= 1) {
    const idx = transit.targetIndex; transit = null;
    state.inTransit = false;
    state.player.state = 'COVERED'; state.player.peekT = 0;
    snapToNode(idx);
  }
}

export function shoulderWorldPos(out) {
  return rig.shoulder.getWorldPosition(out || _v);
}
