// input.js — 자유이동판: Pointer Lock + WASD + Q/E 리닝 + 중앙 조준.

import { state } from './state.js';

export const keys = { w: false, a: false, s: false, d: false, shift: false, ctrl: false, q: false, e: false };
let lmbHeld = false;
let mdx = 0, mdy = 0;
const canvas = () => document.getElementById('c');
const xhair = () => document.getElementById('xhair');

export function isFireHeld() { return lmbHeld; }
export function isPopHeld() { return false; }               // 구 엄폐 시스템 호환 (미사용)
export function isLeanHeld() { return (keys.e ? 1 : 0) - (keys.q ? 1 : 0); }
export function getNDC() { return { ndcX: 0, ndcY: 0 }; }   // 포인터락 = 항상 화면 중앙 조준
export function consumeMouseDelta() { const r = { x: mdx, y: mdy }; mdx = mdy = 0; return r; }
export function isLocked() { return document.pointerLockElement === canvas(); }

export function initInput() {
  // 중앙 고정 크로스헤어
  const x = xhair(); if (x) { x.style.left = '50%'; x.style.top = '50%'; }

  document.addEventListener('mousemove', (e) => {
    if (isLocked()) { mdx += e.movementX; mdy += e.movementY; }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('mousedown', (e) => {
    if (state.phase !== 'play') return;
    if (!isLocked()) { canvas().requestPointerLock(); return; }
    if (state.paused) return;
    if (e.button === 0) { lmbHeld = true; state.emit('firePressed'); }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) lmbHeld = false; });

  document.addEventListener('pointerlockchange', () => {
    if (!isLocked()) {
      lmbHeld = false;
      Object.keys(keys).forEach(k => keys[k] = false);
      if (state.phase === 'play' && !state.paused && !state._noAutoPause) state.emit('togglePause');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyM') { state.emit('toggleMute'); return; }
    if (e.code === 'Escape') return; // 포인터락 해제가 곧 일시정지
    if (state.phase !== 'play' || state.paused) return;
    switch (e.code) {
      case 'KeyW': keys.w = true; break;
      case 'KeyA': keys.a = true; break;
      case 'KeyS': keys.s = true; break;
      case 'KeyD': keys.d = true; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
      case 'ControlLeft': case 'KeyX': keys.ctrl = true; e.preventDefault(); break;
      case 'KeyQ': keys.q = true; break;
      case 'KeyE': keys.e = true; break;
      case 'KeyR': state.emit('reloadPressed'); break;
      case 'KeyF': state.emit('useItem', 'tonic'); break;
      case 'KeyC': state.emit('useItem', 'smoke'); break;
      case 'KeyV': state.emit('ultPressed'); break;
      case 'Digit1': state.emit('switchWeapon', 'rifle'); break;
      case 'Digit2': state.emit('switchWeapon', 'carbine'); break;
      case 'Digit3': state.emit('switchWeapon', 'ritual'); break;
    }
  });
  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': keys.w = false; break;
      case 'KeyA': keys.a = false; break;
      case 'KeyS': keys.s = false; break;
      case 'KeyD': keys.d = false; break;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
      case 'ControlLeft': case 'KeyX': keys.ctrl = false; break;
      case 'KeyQ': keys.q = false; break;
      case 'KeyE': keys.e = false; break;
    }
  });

  addEventListener('blur', () => { lmbHeld = false; Object.keys(keys).forEach(k => keys[k] = false); });
}

export function setCrosshairBlocked(blocked) {
  const x = xhair(); if (x) x.classList.toggle('blocked', blocked);
}
