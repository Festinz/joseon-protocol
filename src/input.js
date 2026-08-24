// input.js — 절대좌표 조준(라이트건 문법) + 홀드 엄폐 + 단축키.
// Pointer Lock 금지 — 레일 슈터에서 상대 이동은 드리프트만 유발.

import { state, now } from './state.js';

const mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0 };
let spaceHeld = false, rmbHeld = false, lmbHeld = false;
const xhair = () => document.getElementById('xhair');

export function isPopHeld() { return spaceHeld || rmbHeld; }
export function isFireHeld() { return lmbHeld; }
export function getNDC() { return mouse; }

export function initInput() {
  document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.ndcX = (e.clientX / innerWidth) * 2 - 1;
    mouse.ndcY = -(e.clientY / innerHeight) * 2 + 1;
    const x = xhair(); if (x) { x.style.left = e.clientX + 'px'; x.style.top = e.clientY + 'px'; }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('mousedown', (e) => {
    if (state.phase !== 'play' || state.paused) return;
    if (e.button === 0) { lmbHeld = true; state.emit('firePressed'); }
    if (e.button === 2) rmbHeld = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) lmbHeld = false;
    if (e.button === 2) rmbHeld = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Escape') { state.emit('togglePause'); return; }
    if (e.code === 'KeyM') { state.emit('toggleMute'); return; }
    if (state.phase !== 'play' || state.paused) return;
    switch (e.code) {
      case 'Space': spaceHeld = true; e.preventDefault(); break;
      case 'KeyR': state.emit('reloadPressed'); break;
      case 'KeyF': state.emit('useItem', 'tonic'); break;
      case 'KeyC': state.emit('useItem', 'smoke'); break;
      case 'KeyQ': state.emit('ultPressed'); break;
      case 'Digit1': state.emit('switchWeapon', 'rifle'); break;
      case 'Digit2': state.emit('switchWeapon', 'carbine'); break;
      case 'Digit3': state.emit('switchWeapon', 'ritual'); break;
    }
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceHeld = false; });

  // 포커스 상실 → 유령 홀드 방지 + 자동 일시정지 (디버그 모드는 정지 없음)
  addEventListener('blur', () => { spaceHeld = rmbHeld = lmbHeld = false; if (!state._noAutoPause && state.phase === 'play' && !state.paused) state.emit('togglePause'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { spaceHeld = rmbHeld = lmbHeld = false; if (!state._noAutoPause && state.phase === 'play' && !state.paused) state.emit('togglePause'); }
  });
}

export function setCrosshairBlocked(blocked) {
  const x = xhair(); if (x) x.classList.toggle('blocked', blocked);
}
