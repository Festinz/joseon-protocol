// state.js — 전역 게임 상태 싱글턴 + 경량 이벤트 버스
// RUN.hand 는 견착 의식에서 단 1회 설정 후 Object.freeze — 어떤 코드 경로도 재설정 금지.

import { PLAYER, WEAPONS, ITEMS } from './config.js';

const listeners = new Map();

export const state = {
  // 씬 흐름: 'title' | 'ceremony' | 'play' | 'ending'
  phase: 'title',
  paused: false,
  muted: false,

  handLock: null,               // Object.freeze({ hand: 'L'|'R' })
  get hand() { return this.handLock ? this.handLock.hand : null; },

  player: {
    hp: PLAYER.hp,
    state: 'COVERED',           // COVERED | RISING | EXPOSED | SNAPPING | TRANSIT | DEAD
    peekT: 0,                   // 팝아웃 트윈 진행도 0..1
    invulnUntil: 0,
    aimBlocked: false,          // 어깨 오리진 사선이 엄폐물에 막힘 (회색 ✕)
    usingItemUntil: 0,
  },

  weapons: {},                  // key -> { mag, reserve, reloading, lastFire }
  currentWeapon: 'rifle',
  unlockedWeapons: ['rifle'],

  items: { tonic: ITEMS.tonic.start, smoke: ITEMS.smoke.start, grenade: ITEMS.grenade.start },
  smokeUntil: 0,
  selectedThrowable: 'grenade',   // F 로 던질 투척물 (G 전환)
  ads: false, wheelOpen: false,

  ult: 0,
  ultCasting: false,

  score: 0, combo: 0, comboMult: 1,
  shotsFired: 0, shotsHit: 0,
  riskKills: 0, deaths: 0,
  nodeStartScore: 0, nodeDamaged: false,

  nodeIndex: 0,
  node: null,                   // 현재 CoverNode 데이터
  coverIdx: 0,                  // 노드 내 커버 인덱스 (DUAL 대응)
  waveIndex: 0,
  nodeTimer: null,              // 남은 초 (null = 타이머 없음)
  inTransit: false,

  startedAt: 0,

  emit(ev, data) { const l = listeners.get(ev); if (l) for (const fn of l) fn(data); },
  on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); },
};

export function setHand(hand) {
  if (state.handLock) return false;                 // 영구성 강제 — 재설정 불가
  state.handLock = Object.freeze({ hand });
  state.emit('handChosen', hand);
  return true;
}

export function initWeapons() {
  for (const key of Object.keys(WEAPONS)) {
    const w = WEAPONS[key];
    state.weapons[key] = { mag: w.mag, reserve: w.reserve, reloading: false, reloadEnd: 0, lastFire: 0 };
  }
}

export function resetRun() {
  // 새 출정: handLock 은 유지하지 않는다 — 새 런 = 새 선택 (설계 명세)
  state.handLock = null;
  state.player.hp = PLAYER.hp;
  state.player.state = 'COVERED';
  state.player.peekT = 0;
  state.player.invulnUntil = 0;
  state.currentWeapon = 'rifle';
  state.unlockedWeapons = ['rifle'];
  state.items = { tonic: ITEMS.tonic.start, smoke: ITEMS.smoke.start, grenade: ITEMS.grenade.start };
  state.selectedThrowable = 'grenade';
  state.ads = false; state.wheelOpen = false;
  state.smokeUntil = 0;
  state.ult = 0; state.ultCasting = false;
  state.score = 0; state.combo = 0; state.comboMult = 1;
  state.shotsFired = 0; state.shotsHit = 0;
  state.riskKills = 0; state.deaths = 0;
  state.nodeIndex = 0; state.waveIndex = 0; state.coverIdx = 0;
  state.nodeTimer = null; state.inTransit = false;
  state.nodeStartScore = 0; state.nodeDamaged = false;
  initWeapons();
}

export const now = () => performance.now();
