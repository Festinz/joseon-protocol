// debug.js — URL 파라미터 + 디버그 오버레이 + 치트키 + 공정성 원장 assert.
// ?stop=S3_gate ?hand=L ?god=1 ?ult=100 ?timescale=2 ?snap=220 ?exp=0.65 ?perf=low ?debug=1

import { PEEK } from './config.js';
import { state, setHand } from './state.js';
import { LEVEL, EDGE_CENSUS, computeEdgeCensus } from './leveldata.js';

export const params = new URLSearchParams(location.search);
let overlay = null, renderer = null;

export function applyDebugParams() {
  if (params.get('debug') === '1') { window.S = state; state._noAutoPause = true; } // 콘솔 검사용
  if (params.get('snap')) { PEEK.unfavorable.snapInMs = Number(params.get('snap')); }
  if (params.get('exp')) { PEEK.unfavorable.exposure = Number(params.get('exp')); }
  if (params.get('snapf')) { PEEK.favorable.snapInMs = Number(params.get('snapf')); }
  state._timescale = Number(params.get('timescale') || 1);
  state._god = params.get('god') === '1';

  // 공정성 원장 assert — 이 숫자가 거짓이면 시스템 신뢰가 무너진다
  const census = computeEdgeCensus();
  for (const k of Object.keys(EDGE_CENSUS)) {
    if (census[k] !== EDGE_CENSUS[k]) {
      console.error(`[원장 불일치] ${k}: 고지 ${EDGE_CENSUS[k]} vs 실데이터 ${census[k]} — leveldata 를 고치거나 고지 문구를 갱신하라`);
    }
  }
}

// 타이틀/의식 스킵 (?hand=)
export function autoStart(startRun) {
  const hand = params.get('hand');
  if (hand === 'L' || hand === 'R') {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('ceremony').classList.add('hidden');
    setHand(hand);
    startRun();
    const stop = params.get('stop');
    if (stop) {
      const idx = LEVEL.findIndex(n => n.id === stop || n.id.startsWith(stop));
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
    if (e.code === 'KeyN') state.emit('debugJump', Math.min(LEVEL.length - 1, state.nodeIndex + 1));
    if (e.code === 'KeyH') { state.player.hp = 100; state.emit('playerHealed'); }
  });
}

let acc = 0, frames = 0, fps = 0;
export function updateDebug(dt) {
  if (!overlay) return;
  acc += dt; frames++;
  if (acc > 500) { fps = Math.round(frames / acc * 1000); acc = 0; frames = 0; }
  const side = state.node?.covers[state.coverIdx]?.peekSide;
  const fav = side === 'TOP' ? '중립' : (side === state.hand ? 'FAV' : 'UNFAV');
  overlay.textContent =
    `fps ${fps} | calls ${renderer.info.render.calls} | tris ${renderer.info.render.triangles}\n` +
    `node ${state.node?.id} wave ${state.waveIndex} | peek ${side} ${fav}\n` +
    `player ${state.player.state} peekT ${state.player.peekT.toFixed(2)} hp ${state.player.hp}\n` +
    `hand ${state.hand} | ult ${Math.round(state.ult)} | score ${state.score}`;
}
