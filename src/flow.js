// flow.js — (자유이동판) 존 진행 컨트롤러: 진입 감지 → 웨이브 → 킬게이트 개방 → 보상.
// 사망 시 현재 존 입구에서 이어하기 (구간 점수 ×0.5, 무제한).

import { SCORE, ITEMS, ULT, PLAYER } from './config.js';
import { state, now } from './state.js';
import { ZONES, GATES } from './leveldata.js';
import { rig, teleport, removeGateSolid } from './rail.js';
import { openGateVisual } from './assets.js';
import { spawnWave, aliveCount, clearAll, getActors, resetReliefFlag } from './enemies.js';
import { clearDangerShots, damagePlayer } from './combat.js';
import { refillAmmo } from './weapons.js';
import { resetWheelVec } from './input.js';
import { initBossFight, updateBoss, bossActive } from './boss.js';
import { spawnSatto, updateSatto, sattoActive, resetSatto } from './satto.js';
import { fireSingijeon, SGJ } from './singijeon.js';

const zoneState = ZONES.map(() => ({ started: false, cleared: false, waveIdx: 0, waveActive: false, waveStartAt: 0 }));
let deadAt = 0;

export function initFlow() {
  state.on('ultPressed', tryUlt);
  state.on('useItem', useItem);
  // ⚠ 아래 4개 핸들러는 투척류 제거 수술 때 실수로 함께 잘려나갔었다 (관통 테스트로 발견).
  //    runComplete 가 없으면 엔딩이 영영 안 뜨고, wheelHold 가 없으면 Space 무기 휠이 죽는다.
  state.on('playerDead', () => { deadAt = now(); });
  state.on('forceCoverRequest', () => {});
  state.on('runComplete', () => state.emit('showEnding'));
  // 무기 휠 (Space 홀드 = 일시정지 + 휠 UI, 마우스 방향으로 선택 → 놓으면 교체)
  state.on('wheelHold', (held) => {
    if (state.phase !== 'play' || state.player.state === 'DEAD') return;
    state.wheelOpen = held; state.paused = held;
    if (held) { resetWheelVec(); state._wheelPick = state.currentWeapon; }
    state.emit('wheelShow', held);
    if (!held && state._wheelPick && state._wheelPick !== state.currentWeapon) {
      state.emit('switchWeapon', state._wheelPick);
    }
  });
  // 사또 격파 → Z4 클리어 처리 (보스룸 문 개방)
  state.on('sattoDefeated', () => {
    const i = ZONES.findIndex(z => z.id === 'Z4');
    if (i >= 0 && !zoneState[i].cleared) zoneCleared(i);
  });
}

export function beginRun() {
  resetReliefFlag();
  state.startedAt = now();
  state.phase = 'play';
  state.emit('runStarted');
  state.emit('bannerShow', '경복궁을 수복하라');
}

function currentZoneIdx() {
  const z = rig.dolly.position.z;
  let idx = 0;
  for (let i = 0; i < ZONES.length; i++) if (z <= ZONES[i].enterZ) idx = i;
  return idx;
}

function startZone(i) {
  const zone = ZONES[i]; const zs = zoneState[i];
  zs.started = true;
  state.node = zone; state.nodeStartScore = state.score; state.nodeDamaged = false;
  state.emit('objectiveChanged', zone.objective);
  state.emit('fieldTypeChanged', zone.fieldType);
  state.emit('bannerShow', zone.name);
  state.emit('peekChanged', {});
  if (zone.boss) { initBossFight(zone); return; }
  if (zone.waves.length) setTimeout(() => startWave(i, 0), 1300);
  else zoneCleared(i);
}

function startWave(i, w) {
  const zone = ZONES[i]; const zs = zoneState[i];
  if (state.player.state === 'DEAD') return;
  zs.waveIdx = w; zs.waveActive = true; zs.waveStartAt = now();
  if (zone.ultShowcase === w) { state.ult = ULT.max; state.emit('ultChanged'); state.emit('bannerShow', '궁극기 준비 완료 — Q'); }
  spawnWave(zone, zone.waves[w]);
}

function zoneCleared(i) {
  const zone = ZONES[i]; const zs = zoneState[i];
  zs.cleared = true; zs.waveActive = false;
  const acc = state.shotsFired ? (state.shotsHit / state.shotsFired) * 100 : 0;
  state.score += SCORE.zone(acc, 0, !state.nodeDamaged);
  state.emit('scoreChanged');
  const r = zone.clearReward;
  if (r) {
    if (r.ammoRefill) refillAmmo();
    if (r.item) { state.items[r.item] = Math.min(ITEMS[r.item].max, state.items[r.item] + (r.count || 1)); state.emit('itemsChanged'); }
    if (r.grenade) { state.items.grenade = Math.min(ITEMS.grenade.max, state.items.grenade + r.grenade); state.emit('itemsChanged'); }
    if (r.unlockWeapon && !state.unlockedWeapons.includes(r.unlockWeapon)) {
      state.unlockedWeapons.push(r.unlockWeapon); state.emit('weaponUnlocked', r.unlockWeapon);
    }
    if (r.vignette) state.emit('bannerShow', r.vignette);
  }
  if (zone.clearGate) {
    removeGateSolid(zone.clearGate);
    openGateVisual(zone.clearGate);
    state.emit('bannerShow', '문이 열렸다 — 전진하라');
    state.emit('gateOpened', zone.clearGate);
  }
}

export function updateFlow(dt) {
  if (state.phase !== 'play' || state.paused) return;

  // 사망 → 이어하기
  if (state.player.state === 'DEAD') {
    if (now() - deadAt > 1600) {
      const i = currentZoneIdx(); const zone = ZONES[i]; const zs = zoneState[i];
      const gained = state.score - state.nodeStartScore;
      state.score = state.nodeStartScore + Math.round(Math.max(0, gained) * SCORE.continuePenalty);
      state.player.hp = PLAYER.hp; state.player.state = 'COVERED';
      state.player.invulnUntil = now() + 1500;
      clearAll(); clearDangerShots(); resetSatto(); zs.satto = false;
      // ⚠ 부활 위치는 존 '안'(enterZ - 2.5)이어야 한다. 이전엔 +2.5(경계 밖)라
      // currentZoneIdx 가 이전 존을 가리켜 보스존 updateBoss/웨이브 로직이 통째로 멈췄다 —
      // "이어하기 후 보스가 소환 안 됨/멈춤" 의 원인.
      teleport(zone.anchor[0], zone.enterZ - 2.5);
      state.emit('scoreChanged'); state.emit('playerRevived');
      state.emit('bannerShow', '이어하기 — 구간 점수 절반');
      if (zone.boss) initBossFight(zone, true);
      else { zs.waveIdx = 0; zs.waveActive = false; setTimeout(() => startWave(i, 0), 1200); }
    }
    return;
  }

  const i = currentZoneIdx();
  const zone = ZONES[i]; const zs = zoneState[i];

  if (!zs.started) startZone(i);
  if (zone.boss) { updateBoss(dt); return; }

  if (sattoActive()) updateSatto(dt);

  // 웨이브 전멸 → 다음 웨이브 or 존 클리어 (Z4 는 웨이브 후 사또 중간보스)
  if (zs.started && !zs.cleared && zs.waveActive && now() - zs.waveStartAt > 1500 && aliveCount() === 0) {
    zs.waveActive = false;
    const next = zs.waveIdx + 1;
    if (next < zone.waves.length) setTimeout(() => startWave(i, next), 900);
    else if (zone.id === 'Z4' && !zs.satto) {
      zs.satto = true;
      // 예약~발화 사이에 죽으면 이어하기가 zs.satto 를 되돌린다 — 그 경우 유령 소환 금지
      setTimeout(() => { if (zs.satto && state.player.state !== 'DEAD') spawnSatto([zone.anchor[0], 0, zone.anchor[2] - 6]); }, 1200);
    }
    else if (zone.id !== 'Z4') zoneCleared(i);
  }
}

// ── 궁극기: 증기 폭격 (open 존 전용 — PPTX 규칙 유지) ──
function tryUlt() {
  if (state.ult < ULT.max || state.ultCasting) return;
  state.ultCasting = true; state.ult = 0; state.emit('ultChanged');
  state.player.invulnUntil = now() + ULT.castMs + 500;
  state.emit('ultCastStart');
  state.emit('bannerShow', '「어사 신창준, 좌표 송신. 신기전 일제사격!」');
  clearDangerShots();                      // 시전 시작과 함께 날아오던 명중탄은 무효
  // 컷씬(2.6s) 뒤에 실제 로켓이 나간다 — 화면이 돌아오는 순간 하늘에서 떨어지도록
  const delay = Math.max(0, ULT.castMs - SGJ.flightMs);
  setTimeout(() => { if (state.phase === 'play') fireSingijeon(); }, delay);
  setTimeout(() => {
    state.ultCasting = false;
    state.emit('ultCastEnd');
  }, ULT.castMs + SGJ.flightMs);
}

// ── 아이템 ──
function useItem(kind) {
  if (state.player.state === 'DEAD' || state.ultCasting) return;
  if ((state.items[kind] || 0) <= 0) return;
  if (kind === 'tonic') {
    if (state.player.hp >= PLAYER.hp) return;
    state.items.tonic -= 1;
    state.player.usingItemUntil = now() + ITEMS.tonic.useMs;
    setTimeout(() => { state.player.hp = Math.min(PLAYER.hp, state.player.hp + ITEMS.tonic.heal); state.emit('playerHealed'); }, ITEMS.tonic.useMs);
  }
  state.emit('itemsChanged');
}
