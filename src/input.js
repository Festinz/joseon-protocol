// input.js — 자유이동판: Pointer Lock + WASD + Q/E 리닝 + 중앙 조준.

import { state } from './state.js';
import { WEAPONS } from './config.js';

export const keys = { w: false, a: false, s: false, d: false, shift: false, crouch: false, z: false, x: false };

// 우클릭(ADS)이 허용되는가 — 근접(환도)엔 조준경 자체가 없다
export function adsAllowed() { return !WEAPONS[state.currentWeapon]?.melee; }
let lmbHeld = false, rmbHeld = false;
let mdx = 0, mdy = 0;
let spaceTimer = 0;
let wvx = 0, wvy = 0;   // 휠 선택 벡터 — 휠이 열려 있는 동안의 마우스 이동
export function getWheelVec() { return { x: wvx, y: wvy }; }
export function resetWheelVec() { wvx = 0; wvy = 0; }
const canvas = () => document.getElementById('c');
const xhair = () => document.getElementById('xhair');

export function isFireHeld() { return lmbHeld; }
export function isPopHeld() { return false; }               // 구 엄폐 시스템 호환 (미사용)
export function isLeanHeld() { return (keys.x ? 1 : 0) - (keys.z ? 1 : 0); } // Z 좌 / X 우 리닝
export function getNDC() { return { ndcX: 0, ndcY: 0 }; }   // 포인터락 = 항상 화면 중앙 조준
export function consumeMouseDelta() { const r = { x: mdx, y: mdy }; mdx = mdy = 0; return r; }
export function isLocked() { return document.pointerLockElement === canvas(); }

export function initInput() {
  // 중앙 고정 크로스헤어
  const x = xhair(); if (x) { x.style.left = '50%'; x.style.top = '50%'; }

  document.addEventListener('mousemove', (e) => {
    if (!isLocked()) return;
    if (state.wheelOpen) { wvx += e.movementX; wvy += e.movementY; }   // 휠 선택으로 라우팅
    else { mdx += e.movementX; mdy += e.movementY; }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('mousedown', (e) => {
    if (state.phase !== 'play') return;
    if (!isLocked()) { canvas().requestPointerLock(); return; }
    if (state.paused) return;
    if (e.button === 0) { lmbHeld = true; state.emit('firePressed'); }
    if (e.button === 2) {                                         // 우클릭 — 든 무기에 따라 갈린다
      rmbHeld = true;
      if (WEAPONS[state.currentWeapon]?.melee) { state.emit('heavyPressed'); return; } // 환도: 강공
      state.ads = true;                                           // 총기: 견착(ADS)
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) lmbHeld = false;
    if (e.button === 2) { rmbHeld = false; state.ads = false; }
  });

  document.addEventListener('pointerlockchange', () => {
    if (!isLocked()) {
      lmbHeld = false;
      Object.keys(keys).forEach(k => keys[k] = false);
      if (state.phase === 'play' && !state.paused && !state._noAutoPause) state.emit('togglePause');
    } else {
      // 락 성공 → 일시정지 자동 해제 (클릭 한 번으로 복귀)
      if (state.phase === 'play' && state.paused && !state.wheelOpen) state.emit('togglePause');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyM') { state.emit('toggleMute'); return; }
    if (e.code === 'Escape') return; // 포인터락 해제가 곧 일시정지
    if (state.phase !== 'play') return;
    if (state.paused) {
      // 무기 휠 중에는 숫자 선택만 허용
      if (state.wheelOpen) {
        if (e.code === 'Digit1') state.emit('switchWeapon', 'rifle');
        if (e.code === 'Digit2') state.emit('switchWeapon', 'carbine');
        if (e.code === 'Digit3') state.emit('switchWeapon', 'ritual');
        if (e.code === 'Digit4') state.emit('switchWeapon', 'hwando');
        if (e.code === 'Space') return;
      }
      return;
    }
    switch (e.code) {
      case 'KeyW': keys.w = true; break;
      case 'KeyA': keys.a = true; break;
      case 'KeyS': keys.s = true; break;
      case 'KeyD': keys.d = true; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
      case 'ControlLeft': case 'ControlRight':                   // Ctrl = 회피 스텝 (무적)
        e.preventDefault(); state.emit('evadePressed'); break;
      case 'KeyC': keys.crouch = !keys.crouch; break;           // C = 웅크리기 토글 (은신)
      case 'KeyZ': keys.z = true; break;                        // 좌 리닝
      case 'KeyX': keys.x = true; break;                        // 우 리닝
      case 'KeyR': state.emit('reloadPressed'); break;
      case 'KeyT': state.emit('useItem', 'tonic'); break;       // T = 탕약
      case 'KeyF': state.emit('grenadePressed'); break;         // F = 수류탄 투척
      case 'KeyE': state.emit('assassinatePressed'); break;     // E = 암살/상호작용
      case 'KeyQ': state.emit('ultPressed'); break;             // Q = 궁극기
      case 'Space': // 탭 = 다음 무기 전환, 홀드(240ms+) = 무기 휠
        e.preventDefault();
        spaceTimer = setTimeout(() => { spaceTimer = 0; state.emit('wheelHold', true); }, 240);
        break;
      case 'Digit1': state.emit('switchWeapon', 'rifle'); break;
      case 'Digit2': state.emit('switchWeapon', 'carbine'); break;
      case 'Digit3': state.emit('switchWeapon', 'ritual'); break;
      case 'Digit4': state.emit('switchWeapon', 'hwando'); break;
    }
  });
  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': keys.w = false; break;
      case 'KeyA': keys.a = false; break;
      case 'KeyS': keys.s = false; break;
      case 'KeyD': keys.d = false; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
      case 'KeyZ': keys.z = false; break;
      case 'KeyX': keys.x = false; break;
      case 'Space':
        if (spaceTimer) { clearTimeout(spaceTimer); spaceTimer = 0; state.emit('cycleWeapon'); }
        else state.emit('wheelHold', false);
        break;
    }
  });

  addEventListener('blur', () => { lmbHeld = false; Object.keys(keys).forEach(k => keys[k] = false); });
}

export function setCrosshairBlocked(blocked) {
  const x = xhair(); if (x) x.classList.toggle('blocked', blocked);
}
