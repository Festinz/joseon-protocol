// cover.js — 엄폐/팝아웃 상태기계 + 견착 노출 모델 (핵심 훅).
// 판정 원칙: 명중탄 임팩트 순간 state==='COVERED' 만 무효. RISING/SNAPPING 도 피격.

import { PEEK, PLAYER } from './config.js';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { isPopHeld } from './input.js';

let peekParams = PEEK.neutral;
let favorable = null;      // true | false | null(중립)
let peekDir = 0;           // -1(좌로 내밀기) | +1(우로) | 0(TOP)
let tweenStart = 0, tweenFrom = 0, tweenTo = 0, tweenDur = 1;

export function currentPeek() { return peekParams; }
export function isFavorable() { return favorable; }
export function exposedFraction() {
  const t = state.player.peekT;
  return peekParams.exposure * (t * (2 - t)); // easeOutQuad
}

export function refreshPeekParams() {
  const node = state.node; if (!node) return;
  const cover = node.covers[state.coverIdx];
  if (cover.peekSide === 'TOP') { peekParams = PEEK.neutral; favorable = null; peekDir = 0; }
  else {
    favorable = (cover.peekSide === state.hand);
    peekParams = favorable ? PEEK.favorable : PEEK.unfavorable;
    peekDir = cover.peekSide === 'R' ? 1 : -1;
  }
  state.emit('peekChanged', { side: cover.peekSide, favorable });
}

state.on('nodeArrived', refreshPeekParams);
state.on('coverSwapped', refreshPeekParams);
state.on('handChosen', refreshPeekParams);

function beginTween(to, dur) {
  tweenStart = now(); tweenFrom = state.player.peekT; tweenTo = to;
  tweenDur = Math.max(1, dur * Math.abs(to - tweenFrom)); // 중간에서 반전 시 남은 거리만큼만
}

export function updateCover() {
  const p = state.player;
  if (p.state === 'TRANSIT' || p.state === 'DEAD') { p.peekT = 0; applyRig(); return; }

  const held = isPopHeld() && now() > p.usingItemUntil && !state.ultCasting;

  // 상태 전이
  if (held && (p.state === 'COVERED' || p.state === 'SNAPPING')) {
    p.state = 'RISING'; beginTween(1, peekParams.popOutMs);
  } else if (!held && (p.state === 'EXPOSED' || p.state === 'RISING')) {
    p.state = 'SNAPPING'; beginTween(0, peekParams.snapInMs);
  }

  // 트윈 진행
  if (p.state === 'RISING' || p.state === 'SNAPPING') {
    const k = Math.min(1, (now() - tweenStart) / tweenDur);
    p.peekT = tweenFrom + (tweenTo - tweenFrom) * k;
    if (k >= 1) {
      if (p.state === 'RISING') { p.state = 'EXPOSED'; p.peekT = 1; }
      else { p.state = 'COVERED'; p.peekT = 0; state.emit('fullyCovered'); }
    }
  }
  applyRig();
}

// 카메라 리그 오프셋 — 팝아웃 시 모서리 밖으로. RISING ease-out / SNAPPING ease-in 은
// beginTween 잔여거리 방식 + peekT 자체 보간으로 근사.
function applyRig() {
  const t = state.player.peekT;
  const e = t * (2 - t); // easeOutQuad — 나갈 때 감속, peekT 역방향이면 체감상 가속 복귀
  const y = PLAYER.coveredEyeY + (PLAYER.exposedEyeY - PLAYER.coveredEyeY + peekParams.popUp) * e;
  rig.cover.position.y = y;
  rig.cover.position.x = peekDir * peekParams.popOffset * e;
  rig.cover.rotation.z = -peekDir * (peekParams.vmRollDeg * Math.PI / 180) * e * 0.5;
}

export function forceCover() {
  const p = state.player;
  if (p.state === 'EXPOSED' || p.state === 'RISING') { p.state = 'SNAPPING'; beginTween(0, peekParams.snapInMs); }
}

// 노드 내 커버 전환 (S3 스왑, 보스)
export function swapCover(idx) {
  state.coverIdx = idx;
  state.emit('coverSwapped', idx);
}
