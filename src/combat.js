// combat.js — 히트스캔(어깨 오리진 + 사선 차단) + 화면공간 스냅 + 명중탄 결정론 판정 + 데미지/사망.

import * as THREE from 'three';
import { WEAPONS, AIM, PLAYER, SCORE, ULT, DANGER, DODGE, HEAVY } from './config.js';
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

// ── 명중탄 (danger shot) — 발사 순간의 플레이어 위치로 날아간다 ──
// 회피법 ①이동(착탄 반경 밖으로) ②사선 차단(벽/엄폐물) ③앉기(반경 축소 보너스)
const dangerShots = [];    // { from, target, t0, flightMs, dmg, cause }
const _camPos = new THREE.Vector3();
export function spawnDangerShot(fromV3, { flightMs = DANGER.flightMs, dmg = PLAYER.dangerHit, cause = '명중탄' } = {}) {
  if (now() < state.smokeUntil) return null;               // 연막: 명중탄 발사 자체 중지
  rig.camera.getWorldPosition(_camPos);
  const shot = { from: fromV3.clone(), target: _camPos.clone(), t0: now(), flightMs, dmg, cause, dead: false };
  dangerShots.push(shot);
  state.emit('dangerLaunched', shot);
  return shot;
}
export function getDangerShots() { return dangerShots; }
export function clearDangerShots() { dangerShots.forEach(s => { s.dead = true; }); dangerShots.length = 0; state.emit('dangerCleared'); }

const _ray = new THREE.Raycaster();
function resolveDangerImpact(shot) {
  if (state.player.state === 'DEAD') return;
  rig.camera.getWorldPosition(_camPos);
  // ① 이동 회피: 착탄점(발사 순간 위치)에서 벗어났는가 — 앉으면 판정 반경 축소 보너스
  const effRadius = DODGE.hitRadius - (state.playerCrouching ? DODGE.crouchBonus : 0);
  if (_camPos.distanceTo(shot.target) > effRadius) {
    state.emit('dangerAvoided', shot); state.emit('recapLine', '이동으로 회피!'); return;
  }
  // ② 사선 차단: 발사점 → 현재 머리 위치가 벽/엄폐물에 막혔는가
  _ray.set(shot.from, _camPos.clone().sub(shot.from).normalize());
  _ray.far = shot.from.distanceTo(_camPos) - 0.2;
  if (_ray.intersectObjects(blockers, false).length > 0) {
    state.emit('dangerAvoided', shot); state.emit('recapLine', '엄폐로 차단!'); return;
  }
  damagePlayer(shot.dmg, '명중탄 피격');
}

export function damagePlayer(amount, cause) {
  const p = state.player;
  if (p.state === 'DEAD' || now() < p.invulnUntil) return;
  if (now() < state.evadeUntil) {          // 회피 무적 — 스텝 전 구간 피격 무효
    state.emit('evadeNegated', { amount, cause });
    state.emit('recapLine', '회피! — 무적 판정');
    return;
  }
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
  if (state.throwEquipped) { state.emit('throwPressed'); return; }  // 투척물 장착 중 = 좌클릭 투척
  if (!canFire()) return;

  const wcfg = WEAPONS[state.currentWeapon];
  if (wcfg.melee) return meleeStrike(wcfg);   // 환도: 탄약 미소모 근접 베기

  consumeShot();
  state.shotsFired += 1;
  const cfg = WEAPONS[state.currentWeapon];
  muzzleWorld(_v3);
  state.emit('shotFired', { muzzle: _v3.clone() });

  // 히트스캔: 화면 중앙 (포인터락)
  raycaster.setFromCamera({ x: 0, y: 0 }, rig.camera);
  raycaster.far = 200;

  const targets = hittables.filter(h => h.userData.actor?.alive);
  const hits = raycaster.intersectObjects(targets, false);

  let victim = null, part = null, point = null;
  if (hits.length) {
    victim = hits[0].object.userData.actor; part = hits[0].object.name; point = hits[0].point;
    // 머리 승격: 같은 액터의 hitHead 가 몸통 박스 바로 뒤에 겹쳐 있으면 헤드샷으로 처리
    // (머리 프록시가 몸통 프록시에 가려져 헤드샷이 몸샷으로 먹히던 버그)
    if (part === 'hitBody') {
      for (const h of hits) {
        if (h.object.userData.actor !== victim) break;
        if (h.object.name === 'hitHead' && h.distance - hits[0].distance < 0.55) {
          part = 'hitHead'; point = h.point; break;
        }
      }
    }
  } else {
    // 화면공간 관용 스냅 (몸통만 — 약점/머리 전용 적은 스냅 무효)
    const best = snapAssist(getNDC());
    if (best) { victim = best.actor; part = 'hitBody'; point = best.pos; }
  }

  if (victim) {
    state.shotsHit += 1;
    bumpCombo();
    const blocked = victim.headOnly && part === 'hitBody';   // 방패: 15% 관통 (enemies 에서 감쇠)
    const weak = part !== 'hitBody';
    const dmg = cfg.dmg * (weak ? cfg.weakMult : 1) * state.comboMult;
    victim.onHit(part, dmg, { weak, weapon: state.currentWeapon });
    state.emit('shotHit', { point, weak, part });
    if (blocked) state.emit('shotBlockedByShield', { point });
  } else {
    state.combo = 0; state.comboMult = 1; state.emit('comboChanged');
  }
}

// ── 환도 근접 베기: 전방 부채꼴 내 최근접 적 1체 ──
const _fw = new THREE.Vector3(), _to = new THREE.Vector3();
let meleeReadyAt = 0;   // 경공/강공 공용 스윙 쿨다운 (강공 후딜이 경공에도 걸린다)
function meleeStrike(cfg) {
  const t = now();
  if (t < meleeReadyAt) return;
  meleeReadyAt = t + cfg.fireMs;
  const w = state.weapons.hwando; if (w) w.lastFire = t;   // canFire 쿨다운 공유
  state.emit('meleeSwing');
  rig.camera.getWorldDirection(_fw); _fw.y = 0; _fw.normalize();
  const pp = rig.dolly.position;
  let best = null, bestD = cfg.range;
  const seen = new Set();
  for (const h of hittables) {
    const a = h.userData.actor;
    if (!a?.alive || seen.has(a) || a.isTurret || a.isCore || a.isBossBody) continue;
    seen.add(a);
    if (!a.group) continue;
    _to.set(a.group.position.x - pp.x, 0, a.group.position.z - pp.z);
    const d = _to.length();
    if (d > cfg.range) continue;
    if (_to.normalize().dot(_fw) < Math.cos(cfg.arcDeg * Math.PI / 360)) continue;
    if (d < bestD) { bestD = d; best = a; }
  }
  if (best) {
    state.shotsFired += 1; state.shotsHit += 1; bumpCombo();
    const dmg = cfg.dmg * state.comboMult;
    best.onHit('hitBody', dmg, { weapon: 'hwando', melee: true });
    _to.copy(best.group.position); _to.y = 1.1;
    state.emit('shotHit', { point: _to.clone(), weak: false, part: 'hitBody' });
  }
}

// ── 환도 강공 (우클릭) — 소울류: 선딜 → 넓은 부채꼴 전원 타격 → 긴 후딜 ──
let pendingHeavy = null;
function tryHeavy() {
  if (state.phase !== 'play' || state.paused) return;
  if (state.throwEquipped || pendingHeavy) return;
  if (state.player.state === 'DEAD' || state.ultCasting) return;
  const cfg = WEAPONS[state.currentWeapon];
  if (!cfg?.melee) return;                       // 총기는 우클릭 = ADS (input 에서 이미 분기)
  const t = now();
  if (t < meleeReadyAt) return;
  meleeReadyAt = t + HEAVY.fireMs;
  const w = state.weapons[state.currentWeapon]; if (w) w.lastFire = t;
  pendingHeavy = { at: t + HEAVY.windupMs, cfg };
  state.emit('meleeHeavy');                      // 뷰모델/오디오: 치켜드는 순간부터
}
function resolveHeavy(cfg) {
  rig.camera.getWorldDirection(_fw); _fw.y = 0; _fw.normalize();
  const pp = rig.dolly.position;
  const seen = new Set();
  let hits = 0;
  for (const h of hittables) {
    const a = h.userData.actor;
    if (!a?.alive || seen.has(a) || a.isTurret || a.isCore || a.isBossBody) continue;
    seen.add(a);
    if (!a.group) continue;
    _to.set(a.group.position.x - pp.x, 0, a.group.position.z - pp.z);
    const d = _to.length();
    if (d > HEAVY.range) continue;
    if (_to.normalize().dot(_fw) < Math.cos(HEAVY.arcDeg * Math.PI / 360)) continue;
    hits += 1;
    state.shotsFired += 1; state.shotsHit += 1; bumpCombo();
    a.onHit('hitBody', cfg.dmg * HEAVY.dmgMult * state.comboMult, { weapon: cfg.key, melee: true, heavy: true });
    _v3.copy(a.group.position); _v3.y = 1.1;
    state.emit('shotHit', { point: _v3.clone(), weak: false, part: 'hitBody' });
  }
  if (!hits) {   // 헛스윙 — 콤보 리셋까지 감수하는 고위험 공격
    state.shotsFired += 1;
    state.combo = 0; state.comboMult = 1; state.emit('comboChanged');
  }
  state.emit('meleeHeavyImpact', hits);
}
state.on('heavyPressed', tryHeavy);

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
  const risky = isFavorable() === false && exposedFraction() > 0.4; // 역견착 리닝 킬 보너스 (훅 잔존)
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
  // 홀드 연사 (fireMs 간격) — 투척물은 연사 대상이 아니다 (클릭당 1회)
  if (!state.throwEquipped && isFireHeld() && now() - lastHoldFire > WEAPONS[state.currentWeapon].fireMs) {
    lastHoldFire = now(); tryFire();
  }

  // 강공 선딜 완료 → 판정 (setTimeout 대신 루프 기반 — 일시정지에 안전)
  if (pendingHeavy && now() >= pendingHeavy.at) {
    const ph = pendingHeavy; pendingHeavy = null; resolveHeavy(ph.cfg);
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

}

state.on('firePressed', () => { lastHoldFire = now(); tryFire(); });
