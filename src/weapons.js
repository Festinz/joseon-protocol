// weapons.js — 무기 3종, PPTX {0}/{1} 재장전 수식, 뷰모델(레이어 1) + 견착 미러.

import * as THREE from 'three';
import { WEAPONS, AUTO_RELOAD } from './config.js';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { instantiate } from './assets.js';

const vmRoot = new THREE.Group(); // shoulderRig 에 부착, layer 1
const vms = {};
let kick = 0, coveredSince = 0, switchingUntil = 0;

export function initWeapons3D() {
  vmRoot.name = 'viewmodelRoot';
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
  return state.player.state === 'EXPOSED' && !w.reloading && w.mag > 0 &&
         t - w.lastFire >= cfg.fireMs && t > switchingUntil && t > state.player.usingItemUntil && !state.ultCasting;
}

export function consumeShot() {
  const w = state.weapons[state.currentWeapon];
  const cfg = WEAPONS[state.currentWeapon];
  w.mag -= 1; w.lastFire = now();
  kick = cfg.kick;
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

  // 엄폐 자동 재장전 (400ms 경과)
  if (state.player.state === 'COVERED' && coveredSince && t - coveredSince > AUTO_RELOAD.coveredDelayMs) {
    if (w.mag < WEAPONS[state.currentWeapon].mag && w.reserve > 0 && !w.reloading) doReload(state.currentWeapon);
  }

  // 뷰모델 반동/바브
  kick = Math.max(0, kick - dt * 0.35);
  const bob = Math.sin(t * 0.004) * 0.004;
  const cur = vms[state.currentWeapon];
  if (cur) { cur.position.z = kick * 1.6; cur.position.y = bob - (state.player.state === 'COVERED' ? 0.10 : 0); cur.rotation.x = kick * 1.2; }
}

export function muzzleWorld(out) {
  const cur = vms[state.currentWeapon];
  const m = cur && cur.getObjectByName('muzzle');
  return m ? m.getWorldPosition(out) : rig.shoulder.getWorldPosition(out);
}
