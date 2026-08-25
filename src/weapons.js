// weapons.js — 무기 3종, PPTX {0}/{1} 재장전 수식, 뷰모델(레이어 1) + 견착 미러.

import * as THREE from 'three';
import { WEAPONS, AUTO_RELOAD } from './config.js';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { instantiate } from './assets.js';
import { getNDC } from './input.js';

const vmRoot = new THREE.Group(); // shoulderRig 에 부착, layer 1
const vms = {};
let coveredSince = 0, switchingUntil = 0;

// 스프링-댐퍼 (Claude-of-Duty 반동/스웨이 값)
class Spring {
  constructor(freq, zeta) { this.f = freq; this.z = zeta; this.x = 0; this.v = 0; this.t = 0; }
  update(dt) {
    const w = 2 * Math.PI * this.f;
    this.v += (-w * w * (this.x - this.t) - 2 * this.z * w * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}
const recPitch = new Spring(8.5, 0.42);   // 반동 회전
const recKick = new Spring(8.5, 0.42);    // 후퇴
const swayX = new Spring(5.4, 0.46);      // 조준 이동 스웨이
const swayY = new Spring(5.4, 0.46);
let lastNdcX = 0, lastNdcY = 0;

export function initWeapons3D() {
  vmRoot.name = 'viewmodelRoot';
  vmRoot.visible = false; // 3D 뷰모델 → 스프라이트(vmsprite.js) 로 대체
  rig.shoulder.add(vmRoot);
  for (const key of ['rifle', 'carbine', 'ritual']) {
    const vm = instantiate('vm_' + key);
    vm.visible = false;
    vms[key] = vm; vmRoot.add(vm);
  }
  vmRoot.traverse(o => o.layers.set(1));
  applyHandToVM();
  showWeapon(state.currentWeapon);

  state.on('handChosen', applyHandToVM);
  state.on('switchWeapon', trySwitch);
  state.on('reloadPressed', manualReload);
  state.on('fullyCovered', () => { coveredSince = now(); });
  state.on('transitStart', fullReloadAll);
}

function applyHandToVM() {
  const sign = state.hand === 'L' ? -1 : 1;
  vmRoot.position.set(sign * 0.15, -0.18, -0.46);
  vmRoot.scale.set(sign * 0.62, 0.62, 0.62); // 절차 메시 미러 (GLB 교체 시엔 오프셋만 반전 규칙)
  vmRoot.rotation.y = sign * -0.055;         // 총구를 화면 중앙 쪽으로 살짝 모음
  if (sign === -1) vmRoot.traverse(o => {
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.side = THREE.DoubleSide; });
  });
}

function showWeapon(key) {
  for (const k of Object.keys(vms)) vms[k].visible = (k === key);
}

function trySwitch(key) {
  if (!state.unlockedWeapons.includes(key) || key === state.currentWeapon) return;
  state.currentWeapon = key; switchingUntil = now() + 250;
  showWeapon(key);
  state.emit('weaponChanged', key);
}

export function canFire() {
  const w = state.weapons[state.currentWeapon];
  const cfg = WEAPONS[state.currentWeapon];
  const t = now();
  return state.player.state !== 'DEAD' && !w.reloading && w.mag > 0 &&
         t - w.lastFire >= cfg.fireMs && t > switchingUntil && t > state.player.usingItemUntil && !state.ultCasting;
}

export function consumeShot() {
  const w = state.weapons[state.currentWeapon];
  const cfg = WEAPONS[state.currentWeapon];
  w.mag -= 1; w.lastFire = now();
  recPitch.v -= cfg.kick * 1.1;   // 회전 반동 임펄스 (스프링 복원)
  recKick.v += cfg.kick * 0.8;
  if (w.mag === 0) state.emit('magEmpty');
  state.emit('ammoChanged');
}

// PPTX 규칙: 장전량 = min(MaxMag - 현재, 예비), 예비에서 정확히 차감 (20/200 → 40/180)
function doReload(key) {
  const w = state.weapons[key]; const cfg = WEAPONS[key];
  if (w.reloading || w.mag >= cfg.mag || w.reserve <= 0) return false;
  w.reloading = true; w.reloadEnd = now() + cfg.reloadMs;
  state.emit('reloadStart', key);
  return true;
}

function manualReload() { // R = 강제 엄폐 경유 (TC 문법) — cover.forceCover 는 flow 에서 연결
  state.emit('forceCoverRequest');
  doReload(state.currentWeapon);
}

function fullReloadAll() { // 레일 이동 중 전 무기 완전 재장전 (TC WAIT 보상)
  for (const key of Object.keys(state.weapons)) {
    const w = state.weapons[key]; const cfg = WEAPONS[key];
    const loaded = Math.min(cfg.mag - w.mag, w.reserve);
    w.mag += loaded; w.reserve -= loaded; w.reloading = false;
  }
  state.emit('ammoChanged');
}

export function refillAmmo() {
  for (const key of Object.keys(state.weapons)) {
    const w = state.weapons[key]; const cfg = WEAPONS[key];
    w.reserve = cfg.reserve; const loaded = Math.min(cfg.mag - w.mag, w.reserve);
    w.mag += loaded; w.reserve -= loaded;
  }
  state.emit('ammoChanged');
}

export function updateWeapons(dt) {
  const w = state.weapons[state.currentWeapon];
  const t = now();

  // 재장전 완료
  for (const key of Object.keys(state.weapons)) {
    const ww = state.weapons[key]; const cfg = WEAPONS[key];
    if (ww.reloading && t >= ww.reloadEnd) {
      const loaded = Math.min(cfg.mag - ww.mag, ww.reserve);
      ww.mag += loaded; ww.reserve -= loaded; ww.reloading = false;
      state.emit('reloadDone', key); state.emit('ammoChanged');
    }
  }

  // 탄창 소진 시 자동 재장전 (PPTX 규칙)
  if (w.mag === 0 && w.reserve > 0 && !w.reloading) doReload(state.currentWeapon);

  // 뷰모델: 스프링 반동 + 조준 스웨이 + idle 바브
  const dts = Math.min(0.05, dt / 1000);
  const ndc = getNDC();
  swayX.t = Math.max(-0.05, Math.min(0.05, -(ndc.ndcX - lastNdcX) / Math.max(dts, 1e-4) * 0.019 * 0.15));
  swayY.t = Math.max(-0.04, Math.min(0.04, (ndc.ndcY - lastNdcY) / Math.max(dts, 1e-4) * 0.014 * 0.15));
  lastNdcX = ndc.ndcX; lastNdcY = ndc.ndcY;
  const rp = recPitch.update(dts), rk = recKick.update(dts);
  const sx = swayX.update(dts), sy = swayY.update(dts);
  const bob = Math.sin(t * 0.004) * 0.004;
  const cur = vms[state.currentWeapon];
  if (cur) {
    cur.position.z = rk;
    cur.position.x = sx;
    cur.position.y = bob + sy - (state.playerCrouching ? 0.04 : 0);
    cur.rotation.x = -rp * 2.2 + sy * 0.6;
    cur.rotation.y = sx * 0.8;
  }
}

const _mw = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
export function muzzleWorld(out) {
  // 스프라이트 뷰모델 기준: 카메라 전방 0.55m + 견착 어깨쪽 0.28m + 아래 0.18m
  rig.camera.getWorldPosition(out || _mw);
  const o = out || _mw;
  rig.camera.getWorldDirection(_fw);
  _rt.crossVectors(_fw, rig.camera.up).normalize();
  const sign = state.hand === 'L' ? -1 : 1;
  o.addScaledVector(_fw, 0.55).addScaledVector(_rt, 0.28 * sign);
  o.y -= 0.18;
  return o;
}
