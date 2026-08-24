// flow.js — 런 흐름 컨트롤러: 노드/웨이브 진행, 타이머, 보상, S3 스왑, 궁극기, 아이템, 사망/이어하기.

import { RAIL, SCORE, ITEMS, ULT, PLAYER, WEAPONS } from './config.js';
import { state, now } from './state.js';
import { LEVEL } from './leveldata.js';
import { startTransit, applyCoverOffset } from './rail.js';
import { swapCover, forceCover } from './cover.js';
import { spawnWave, aliveCount, clearAll, getActors, resetReliefFlag } from './enemies.js';
import { clearDangerShots, damagePlayer } from './combat.js';
import { refillAmmo } from './weapons.js';
import { initBossFight, updateBoss, bossActive, bossTakeUltDamage } from './boss.js';

let waveActive = false, waveStartAt = 0, nodeClearAt = 0, pendingTransit = false;
let timerAccum = 0;
let deadAt = 0;

export function initFlow() {
  state.on('nodeArrived', onNodeArrived);
  state.on('ultPressed', tryUlt);
  state.on('useItem', useItem);
  state.on('playerDead', () => { deadAt = now(); });
  state.on('forceCoverRequest', forceCover);
  state.on('runComplete', () => state.emit('showEnding'));
}

function onNodeArrived(node) {
  state.nodeStartScore = state.score;
  state.nodeDamaged = false;
  state.waveIndex = 0; waveActive = false; pendingTransit = false;
  state.nodeTimer = node.timerSec ?? null;
  timerAccum = 0;
  state.emit('objectiveChanged', node.objective);
  state.emit('fieldTypeChanged', node.fieldType);
  state.emit('bannerShow', node.name);
  if (node.boss) { initBossFight(node); return; }
  setTimeout(() => startWave(node, 0), 1400);
}

function waveEntries(node, i) {
  const w = node.waves[i];
  return Array.isArray(w) ? { enemies: w, cover: null, preEvent: null } : w;
}

function startWave(node, i) {
  if (state.node !== node || state.player.state === 'DEAD') return;
  const w = waveEntries(node, i);
  const begin = () => {
    if (w.cover != null && w.cover !== state.coverIdx) { swapCover(w.cover); applyCoverOffset(); }
    state.waveIndex = i; waveActive = true; waveStartAt = now();
    if (node.ultShowcase === i) { state.ult = ULT.max; state.emit('ultChanged'); state.emit('bannerShow', '궁극기 준비 완료 — Q'); }
    spawnWave(node, w.enemies);
  };
  if (w.preEvent) { // S3 스왑: 보일러 폭발 → 배너 → 커버 교체 (이동 중 무적)
    state.player.invulnUntil = now() + (w.preEvent.slideMs || 800) + 400;
    state.emit('coverSwapFx', w.preEvent);
    state.emit('bannerShow', w.preEvent.banner || '반대편으로!');
    setTimeout(begin, w.preEvent.slideMs || 800);
  } else begin();
}

function onNodeCleared(node) {
  waveActive = false;
  state.nodeTimer = null;
  // 구역 보너스
  const acc = state.shotsFired ? (state.shotsHit / state.shotsFired) * 100 : 0;
  const secLeft = node.timerSec ? Math.max(0, state._timerLeft ?? 0) : 0;
  state.score += SCORE.zone(acc, secLeft, !state.nodeDamaged);
  state.emit('scoreChanged');
  // 보상
  const r = node.clearReward;
  if (r) {
    if (r.ammoRefill) refillAmmo();
    if (r.item) { state.items[r.item] = Math.min(ITEMS[r.item].max, state.items[r.item] + (r.count || 1)); state.emit('itemsChanged'); }
    if (r.unlockWeapon && !state.unlockedWeapons.includes(r.unlockWeapon)) {
      state.unlockedWeapons.push(r.unlockWeapon); state.emit('weaponUnlocked', r.unlockWeapon);
    }
    if (r.vignette) state.emit('bannerShow', r.vignette);
  }
  nodeClearAt = now(); pendingTransit = true;
}

export function updateFlow(dt) {
  const node = state.node; if (!node || state.phase !== 'play' || state.paused) return;

  // 사망 → 이어하기 (무제한, 해당 노드 점수 ×0.5)
  if (state.player.state === 'DEAD') {
    if (now() - deadAt > 1600) {
      const gained = state.score - state.nodeStartScore;
      state.score = state.nodeStartScore + Math.round(Math.max(0, gained) * SCORE.continuePenalty);
      state.player.hp = PLAYER.hp; state.player.state = 'COVERED'; state.player.peekT = 0;
      state.player.invulnUntil = now() + 1200;
      clearAll(); clearDangerShots();
      state.emit('scoreChanged'); state.emit('playerRevived');
      state.emit('bannerShow', '이어하기 — 구간 점수 절반');
      if (node.boss) initBossFight(node, true);
      else { state.waveIndex = 0; waveActive = false; setTimeout(() => startWave(node, 0), 1200); }
    }
    return;
  }

  if (node.boss) { updateBoss(dt); return; }

  // 노드 타이머 (전투 중에만)
  if (waveActive && state.nodeTimer != null && !state.inTransit) {
    timerAccum += dt;
    if (timerAccum >= 1000) {
      timerAccum -= 1000; state.nodeTimer -= 1;
      state.emit('timerTick', state.nodeTimer);
      if (state.nodeTimer <= 0) {
        damagePlayer(PLAYER.timerFail, '시간 초과');
        state.nodeTimer = node.timerSec; state.emit('timerTick', state.nodeTimer);
      }
    }
    state._timerLeft = state.nodeTimer;
  }

  // 웨이브 전멸 체크
  if (waveActive && now() - waveStartAt > 1500 && aliveCount() === 0) {
    waveActive = false;
    const next = state.waveIndex + 1;
    if (next < node.waves.length) setTimeout(() => startWave(node, next), 900);
    else onNodeCleared(node);
  }

  // 클리어 여운 → 레일 이동
  if (pendingTransit && now() - nodeClearAt > RAIL.clearLingerMs) {
    pendingTransit = false;
    state.emit('bannerShow', '이동!');
    clearDangerShots();
    startTransit(state.nodeIndex + 1);
  }
}

// ── 궁극기: 증기 폭격 지원 (open 전용, PPTX 규칙) ──────────────────
function tryUlt() {
  if (state.ult < ULT.max || state.ultCasting) return;
  if (state.node?.fieldType !== 'open') { state.emit('ultLockedTry'); return; }
  state.ultCasting = true; state.ult = 0; state.emit('ultChanged');
  state.player.invulnUntil = now() + ULT.castMs + 500;
  forceCover();
  state.emit('ultCastStart');
  state.emit('bannerShow', '「어사 신창준, 좌표 송신. 증기 폭격 요청!」');
  // 낙하 5발 순차 (0.3s 간격, 1.8s 시점부터)
  for (let i = 0; i < 5; i++) setTimeout(() => state.emit('ultStrike', i), 1800 + i * 300);
  setTimeout(() => {
    for (const a of [...getActors()]) if (a.alive) a.onHit('hitBody', 9999, { weak: false });
    if (bossActive()) bossTakeUltDamage(ULT.bossDmg);
    clearDangerShots();
    state.ultCasting = false;
    state.emit('ultCastEnd');
  }, ULT.castMs);
}

// ── 아이템 (직결 키 2종) ───────────────────────────────────────────
function useItem(kind) {
  if (state.player.state === 'DEAD' || state.ultCasting) return;
  if ((state.items[kind] || 0) <= 0) return;
  if (kind === 'tonic') {
    if (state.player.hp >= PLAYER.hp) return;
    state.items.tonic -= 1;
    state.player.usingItemUntil = now() + ITEMS.tonic.useMs;
    forceCover();
    setTimeout(() => { state.player.hp = Math.min(PLAYER.hp, state.player.hp + ITEMS.tonic.heal); state.emit('playerHealed'); }, ITEMS.tonic.useMs);
  } else if (kind === 'smoke') {
    state.items.smoke -= 1;
    state.smokeUntil = now() + ITEMS.smoke.durMs;
    clearDangerShots();
    state.emit('smokeDeployed');
  }
  state.emit('itemsChanged');
}

export function beginRun() {
  resetReliefFlag();
  state.startedAt = now();
  state.phase = 'play';
  state.emit('runStarted');
}
