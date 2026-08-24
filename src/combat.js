// combat.js — 히트스캔(어깨 오리진 + 사선 차단) + 화면공간 스냅 + 명중탄 결정론 판정 + 데미지/사망.

import * as THREE from 'three';
import { WEAPONS, AIM, PLAYER, SCORE, ULT, DANGER } from './config.js';
import { state, now } from './state.js';
import { rig, shoulderWorldPos } from './rail.js';
import { canFire, consumeShot, muzzleWorld } from './weapons.js';
import { isFavorable, exposedFraction, forceCover } from './cover.js';
import { isFireHeld, getNDC, setCrosshairBlocked } from './input.js';

const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// 레이캐스트 대상 등록 (적 프록시 / 보스 파츠 / 격추 가능 투사체)
const hittables = [];      // mesh (userData.actor = {onHit(partName, weapon), alive})
const blockers = [];       // 엄폐물 판정 콜라이더 (사선 차단용)
export function registerHittable(mesh, actor) { mesh.userData.actor = actor; hittables.push(mesh); }
export function unregisterActor(actor) {
  for (let i = hittables.length - 1; i >= 0; i--) if (hittables[i].userData.actor === actor) hittables.splice(i, 1);
}
export function registerBlocker(mesh) { blockers.push(mesh); }

// ── 명중탄 (danger shot) — 발광 트레이서 엔티티 ──────────────────
const dangerShots = [];    // { from:V3, t0, flightMs, dmg, cause, mesh(vfx가 관리) }
export function spawnDangerShot(fromV3, { flightMs = DANGER.flightMs, dmg = PLAYER.dangerHit, cause = '명중탄' } = {}) {
  if (now() < state.smokeUntil) return null;               // 연막: 명중탄 발사 자체 중지
  const shot = { from: fromV3.clone(), t0: now(), flightMs, dmg, cause, dead: false };
  dangerShots.push(shot);
  state.emit('dangerLaunched', shot);
  return shot;
}
export function getDangerShots() { return dangerShots; }
export function clearDangerShots() { dangerShots.forEach(s => { s.dead = true; }); dangerShots.length = 0; state.emit('dangerCleared'); }

function resolveDangerImpact(shot) {
  // 결정론: 임팩트 순간 완전 엄폐(COVERED)만 무효. RISING/SNAPPING 도 피격.
  if (state.inTransit || state.player.state === 'DEAD') return;
  if (state.player.state === 'COVERED') { state.emit('dangerAvoided', shot); return; }
  const fav = isFavorable();
  const cause = fav === false ? `역견착 노출 중 피격` : fav === true ? `노출 중 피격` : `노출 중 피격`;
  damagePlayer(shot.dmg, cause);
}

export function damagePlayer(amount, cause) {
  const p = state.player;
  if (p.state === 'DEAD' || now() < p.invulnUntil) return;
  p.hp = Math.max(0, p.hp - amount);
  p.invulnUntil = now() + PLAYER.postHitInvulnMs;
  state.nodeDamaged = true;
  state.emit('playerHit', { amount, cause });
  forceCover();
  if (p.hp <= 0) {
    p.state = 'DEAD'; state.deaths += 1;
    state.emit('playerDead');
  }
}

// ── 플레이어 사격 ─────────────────────────────────────────────────
let lastAimBlocked = false;

export function tryFire() {
  if (state.phase !== 'play' || state.paused) return;
  if (!canFire()) return;
  if (state.player.aimBlocked) { state.emit('fireBlocked'); return; } // 발사 안 됨, 탄약 미소모

  consumeShot();
  state.shotsFired += 1;
  const cfg = WEAPONS[state.currentWeapon];
  muzzleWorld(_v3);
  state.emit('shotFired', { muzzle: _v3.clone() });

  // 히트스캔: 카메라 NDC 방향 + 어깨 오리진
  const ndc = getNDC();
  raycaster.setFromCamera({ x: ndc.ndcX, y: ndc.ndcY }, rig.camera);
  raycaster.ray.origin.copy(shoulderWorldPos(_v));
  raycaster.far = 200;

  const targets = hittables.filter(h => h.userData.actor?.alive);
  const hits = raycaster.intersectObjects(targets, false);

  let victim = null, part = null, point = null;
  if (hits.length) { victim = hits[0].object.userData.actor; part = hits[0].object.name; point = hits[0].point; }
  else {
    // 화면공간 관용 스냅 (몸통만 — 약점/머리 전용 적은 스냅 무효)
    const best = snapAssist(ndc);
    if (best) { victim = best.actor; part = 'hitBody'; point = best.pos; }
  }

  if (victim && !(victim.headOnly && part === 'hitBody')) {
    state.shotsHit += 1;
    bumpCombo();
    const weak = part !== 'hitBody';
    const dmg = cfg.dmg * (weak ? cfg.weakMult : 1) * state.comboMult;
    victim.onHit(part, dmg, { weak, weapon: state.currentWeapon });
    state.emit('shotHit', { point, weak, part });
  } else {
    if (victim && victim.headOnly) state.emit('shotBlockedByShield', { point });
    state.combo = 0; state.comboMult = 1; state.emit('comboChanged');
  }
}

function snapAssist(ndc) {
  const px = (ndc.ndcX * 0.5 + 0.5) * innerWidth;
  const py = (-ndc.ndcY * 0.5 + 0.5) * innerHeight;
  let best = null, bestD = AIM.snapRadiusPx;
  for (const h of hittables) {
    const a = h.userData.actor;
    if (!a?.alive || a.headOnly || h.name !== 'hitBody') continue;
    h.getWorldPosition(_v2);
    _v.copy(_v2).project(rig.camera);
    if (_v.z > 1) continue;
    const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
    const d = Math.hypot(sx - px, sy - py);
    if (d < bestD) { bestD = d; best = { actor: a, pos: _v2.clone() }; }
  }
  return best;
}

function bumpCombo() {
  state.combo += 1;
  state.comboMult = 1;
  for (const [n, mult] of SCORE.combo) if (state.combo >= n) state.comboMult = mult;
  state.emit('comboChanged');
}

// 처치 보상 집계 (enemies/boss 에서 호출)
export function creditKill({ score = SCORE.kill, weak = false } = {}) {
  const risky = isFavorable() === false && state.player.peekT > 0.4;
  let pts = weak ? SCORE.weakKill : score;
  if (risky) { pts = Math.round(pts * SCORE.riskTag); state.riskKills += 1; }
  state.score += pts * state.comboMult;
  const gain = (ULT.perKill + (weak ? ULT.perWeakKill : 0)) * (risky ? ULT.riskMult : 1);
  addUlt(gain);
  state.emit('scoreChanged');
  if (risky) state.emit('riskKill', pts);
}
export function creditHit() { addUlt(ULT.perHit); }
export function creditShootdown() {
  state.score += SCORE.shootdown; addUlt(ULT.perShootdown);
  state.emit('scoreChanged');
}
function addUlt(n) {
  if (state.ult >= ULT.max) return;
  state.ult = Math.min(ULT.max, state.ult + n);
  state.emit('ultChanged');
}

// ── 프레임 업데이트 ───────────────────────────────────────────────
let lastHoldFire = 0;

export function updateCombat(dt) {
  // 홀드 연사 (fireMs 간격)
  if (isFireHeld() && now() - lastHoldFire > WEAPONS[state.currentWeapon].fireMs) {
    lastHoldFire = now(); tryFire();
  }

  // 명중탄 비행/임팩트
  for (let i = dangerShots.length - 1; i >= 0; i--) {
    const s = dangerShots[i];
    if (s.dead) { dangerShots.splice(i, 1); continue; }
    if (now() - s.t0 >= s.flightMs) {
      s.dead = true; dangerShots.splice(i, 1);
      resolveDangerImpact(s);
      state.emit('dangerImpact', s);
    }
  }

  // 어깨 오리진 사선 차단 (역견착의 물리적 진실) — EXPOSED 에서만 의미
  if (state.player.state === 'EXPOSED' || state.player.state === 'RISING') {
    const ndc = getNDC();
    raycaster.setFromCamera({ x: ndc.ndcX, y: ndc.ndcY }, rig.camera);
    // 조준점 방향 30m 지점을 목표로, 어깨 오리진에서 재캐스트
    _v2.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 30);
    shoulderWorldPos(_v);
    raycaster.ray.origin.copy(_v);
    raycaster.ray.direction.copy(_v2.sub(_v).normalize());
    raycaster.far = 30;
    const block = raycaster.intersectObjects(blockers, false);
    const blocked = block.length > 0 && block[0].distance < 2.5;
    if (blocked !== lastAimBlocked) { lastAimBlocked = blocked; state.player.aimBlocked = blocked; setCrosshairBlocked(blocked); }
  } else if (lastAimBlocked) { lastAimBlocked = false; state.player.aimBlocked = false; setCrosshairBlocked(false); }
}

state.on('firePressed', () => { lastHoldFire = now(); tryFire(); });
