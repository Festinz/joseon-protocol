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
import { initBossFight, updateBoss, bossActive, bossTakeUltDamage } from './boss.js';
import { spawnMulgit, updateMulgit, mulgitActive, resetMulgit } from './mulgit.js';

const zoneState = ZONES.map(() => ({ started: false, cleared: false, waveIdx: 0, waveActive: false, waveStartAt: 0 }));
let deadAt = 0;

export function initFlow() {
  state.on('ultPressed', tryUlt);
  state.on('useItem', useItem);
  state.on('playerDead', () => { deadAt = now(); });
  state.on('forceCoverRequest', () => {});
  state.on('runComplete', () => state.emit('showEnding'));
  // 무기 휠 (Space 홀드 = 일시정지 + 휠 UI)
  state.on('wheelHold', (held) => {
    if (state.phase !== 'play' || state.player.state === 'DEAD') return;
    state.wheelOpen = held; state.paused = held;
    state.emit('wheelShow', held);
  });
  // 멀기트 격파 → Z4 클리어 처리 (보스룸 문 개방)
  state.on('mulgitDefeated', () => {
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
  if (zone.ultShowcase === w) { state.ult = ULT.max; state.emit('ultChanged'); state.emit('bannerShow', '궁극기 준비 완료 — V'); }
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
      clearAll(); clearDangerShots(); resetMulgit(); zs.mulgit = false;
      teleport(zone.anchor[0], zone.enterZ + 2.5);
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

  if (mulgitActive()) updateMulgit(dt);

  // 웨이브 전멸 → 다음 웨이브 or 존 클리어 (Z4 는 웨이브 후 멀기트 중간보스)
  if (zs.started && !zs.cleared && zs.waveActive && now() - zs.waveStartAt > 1500 && aliveCount() === 0) {
    zs.waveActive = false;
    const next = zs.waveIdx + 1;
    if (next < zone.waves.length) setTimeout(() => startWave(i, next), 900);
    else if (zone.id === 'Z4' && !zs.mulgit) { zs.mulgit = true; setTimeout(() => spawnMulgit([zone.anchor[0], 0, zone.anchor[2] - 6]), 1200); }
    else if (zone.id !== 'Z4') zoneCleared(i);
  }
}

// ── 궁극기: 증기 폭격 (open 존 전용 — PPTX 규칙 유지) ──
function tryUlt() {
  if (state.ult < ULT.max || state.ultCasting) return;
  if (state.node?.fieldType !== 'open') { state.emit('ultLockedTry'); return; }
  state.ultCasting = true; state.ult = 0; state.emit('ultChanged');
  state.player.invulnUntil = now() + ULT.castMs + 500;
  state.emit('ultCastStart');
  state.emit('bannerShow', '「어사 신창준, 좌표 송신. 증기 폭격 요청!」');
  for (let k = 0; k < 5; k++) setTimeout(() => state.emit('ultStrike', k), 1800 + k * 300);
  setTimeout(() => {
    for (const a of [...getActors()]) if (a.alive) a.onHit(a.headOnly ? 'hitHead' : 'hitBody', 9999, {});
    if (bossActive()) bossTakeUltDamage(ULT.bossDmg);
    clearDangerShots();
    state.ultCasting = false;
    state.emit('ultCastEnd');
  }, ULT.castMs);
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
  } else if (kind === 'smoke') {
    state.items.smoke -= 1;
    state.smokeUntil = now() + ITEMS.smoke.durMs;
    clearDangerShots();
    state.emit('smokeDeployed');
  }
  state.emit('itemsChanged');
}
