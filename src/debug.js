// debug.js — URL 파라미터 + 디버그 오버레이 + 치트키.
// ?zone=Z3(또는 인덱스) ?hand=L ?god=1 ?ult=100 ?timescale=2 ?retro=0 ?retroh=360 ?debug=1 ?nopause=1

import { state, setHand } from './state.js';
import { ZONES } from './leveldata.js';

export const params = new URLSearchParams(location.search);
let overlay = null, renderer = null;

export function applyDebugParams() {
  if (params.get('debug') === '1') window.S = state;
  state._timescale = Number(params.get('timescale') || 1);
  state._god = params.get('god') === '1';
  state._noAutoPause = params.get('nopause') === '1' || params.get('debug') === '1';
}

export function autoStart(startRun) {
  const hand = params.get('hand');
  if (hand === 'L' || hand === 'R') {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('ceremony').classList.add('hidden');
    setHand(hand);
    startRun();
    const zp = params.get('zone') || params.get('stop');
    if (zp != null) {
      let idx = Number(zp);
      if (Number.isNaN(idx)) idx = ZONES.findIndex(z => z.id === zp || z.id.startsWith(zp));
      if (idx >= 0) setTimeout(() => state.emit('debugJump', idx), 300);
    }
    if (params.get('ult')) { state.ult = Number(params.get('ult')); state.emit('ultChanged'); }
    return true;
  }
  return false;
}

export function initDebugOverlay(r) {
  renderer = r;
  if (params.get('debug') !== '1') return;
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;left:8px;top:8px;z-index:300;font:11px Consolas,monospace;color:#8f4;background:#0009;padding:6px 9px;border-radius:6px;white-space:pre;pointer-events:none';
  document.body.appendChild(overlay);

  document.addEventListener('keydown', (e) => {
    if (state.phase !== 'play') return;
    if (e.code === 'KeyK') state.emit('debugKillWave');
    if (e.code === 'KeyN') state.emit('debugJump', Math.min(ZONES.length - 1, (state._dbgZone = (state._dbgZone ?? 0) + 1)));
    if (e.code === 'KeyH') { state.player.hp = 100; state.emit('playerHealed'); }
  });
}

let acc = 0, frames = 0, fps = 0;
export function updateDebug(dt) {
  if (!overlay) return;
  acc += dt; frames++;
  if (acc > 500) { fps = Math.round(frames / acc * 1000); acc = 0; frames = 0; }
  overlay.textContent =
    `fps ${fps} | calls ${renderer.info.render.calls} | tris ${renderer.info.render.triangles}\n` +
    `zone ${state.node?.id ?? '-'} | hand ${state.hand} | hp ${state.player.hp}\n` +
    `ult ${Math.round(state.ult)} | score ${state.score}`;
}
