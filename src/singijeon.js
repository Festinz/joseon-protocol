// singijeon.js — 궁극기 「신기전 일제사격」.
// 기존 궁극기는 화면 플래시 뒤 전장 전체를 즉사시키는 판정 하나였다. 표적 개념이 없어서
// "어디에 떨어지는지" 를 볼 수 없었다. 여기서는 실제 로켓을 살아있는 적 위치로 날린다.
//
// 배분 규칙 (사용자 지정):
//   적 1명 → 3발 모두 그 1명에게
//   적 2명 → 1대 · 2대
//   적 3명 → 각각 1대씩
//   적 N>3 → 라운드로빈이라 전원이 최소 1발 (아무도 빠지지 않는다)
// 구현: rockets = max(BASE_ROCKETS, N), i 번째 로켓 → targets[i % N].

import * as THREE from 'three';
import { ULT } from './config.js';
import { state, now } from './state.js';
import { rig } from './rail.js';
import { getActors } from './enemies.js';
import { bossActive, bossTakeUltDamage, bossBodyPos } from './boss.js';
import { sattoActive, sattoTakeDamage } from './satto.js';
import { burst, shockwave, kick, trailPuff, explosionFlash, scorch } from './vfx.js';

export const SGJ = {
  baseRockets: 3,       // 적이 적어도 최소 3발은 나간다
  volleyGapMs: 190,     // 발사 간격 — 다연장의 "촤르륵"
  flightMs: 1150,       // 비행 시간 (유도)
  // ⚠ 궤적은 "플레이어 시야 안" 이 절대 조건이다. 두 번 틀렸다:
  //   ① 플레이어 뒤에서 아치 16m — 정점이 눈높이 위 19m 라 화면 밖으로 지나갔다
  //   ② 뒤에서 낮게 — 이번엔 머리 위를 스쳐 화면을 꽉 채우고 순식간에 사라졌다
  // 플레이어 기준이 아니라 **표적 기준**으로 띄운다. 표적 위 하늘에서 내리꽂으면
  // 플레이어가 보고 있는 방향에 항상 들어오고, 멀어서 크기도 적당하다.
  spawnUp: 15,          // 표적 위 몇 m 에서 출발하는가
  spawnToward: 6,       // 표적에서 플레이어 쪽으로 얼마나 당겨 띄우는가 (비스듬한 낙하)
  spawnSpread: 3.2,     // 로켓별 좌우 산개
  arcHeight: 1.2,       // 낙하 중 살짝 부풀리는 정도
  dmg: 9999,            // 잡졸은 직격이면 즉사
  splash: 3.2,          // 착탄 광역
  splashDmg: 60,
  bossDmg: ULT.bossDmg, // 보스는 로켓당 고정 피해
};

let sc = null;
const live = [];
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// 공유 리소스 (프레임당 할당 금지)
const HEAD_GEO = new THREE.ConeGeometry(0.09, 0.34, 7);
const BODY_GEO = new THREE.CylinderGeometry(0.055, 0.055, 0.5, 6);
const FIN_GEO = new THREE.BoxGeometry(0.015, 0.14, 0.12);
const HEAD_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2b30, metalness: 0.7, roughness: 0.4 });
const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });
const FIN_MAT = new THREE.MeshStandardMaterial({ color: 0x8a2020, roughness: 0.7 });
const FLAME_MAT = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const FLAME_GEO = new THREE.ConeGeometry(0.17, 0.9, 7);   // 밤에 보이려면 화염이 커야 한다
const pool = [];

export function initSingijeon(scene) { sc = scene; }

function acquire() {
  const cached = pool.pop();
  if (cached) return cached;
  const g = new THREE.Group();
  const head = new THREE.Mesh(HEAD_GEO, HEAD_MAT); head.position.z = 0.36; head.rotation.x = Math.PI / 2;
  const body = new THREE.Mesh(BODY_GEO, BODY_MAT); body.rotation.x = Math.PI / 2;
  const f1 = new THREE.Mesh(FIN_GEO, FIN_MAT); f1.position.set(0.07, 0, -0.2);
  const f2 = new THREE.Mesh(FIN_GEO, FIN_MAT); f2.position.set(-0.07, 0, -0.2);
  const flame = new THREE.Mesh(FLAME_GEO, FLAME_MAT);
  flame.position.z = -0.42; flame.rotation.x = -Math.PI / 2; flame.name = 'flame';
  g.add(head, body, f1, f2, flame);
  g.userData.flame = flame;
  return g;
}

// ── 표적 수집 + 배분 ─────────────────────────────────────────────
// 살아있는 잡졸을 플레이어 기준 가까운 순으로. 보스/사또는 별도 표적으로 뒤에 붙인다.
function collectTargets() {
  const pp = rig.dolly.position;
  const list = getActors()
    .filter(a => a.alive && a.group)
    .map(a => ({ kind: 'actor', actor: a, pos: a.group.position, d: a.group.position.distanceTo(pp) }))
    .sort((x, y) => x.d - y.d);
  if (bossActive()) {
    const bp = bossBodyPos();
    if (bp) list.push({ kind: 'boss', pos: bp, d: bp.distanceTo(pp) });
  }
  if (sattoActive()) {
    // 사또는 위치를 직접 못 얻으니 광역 판정으로 처리 — 표적 좌표는 플레이어 전방 추정
    list.push({ kind: 'satto', pos: null, d: 0 });
  }
  return list;
}

// rockets 발을 targets 에 라운드로빈 배분 → [{target, n}] 이 아니라 발사 순서 배열을 만든다
export function allocate(targetCount, base = SGJ.baseRockets) {
  const n = Math.max(base, targetCount);
  const seq = [];
  for (let i = 0; i < n; i++) seq.push(targetCount ? i % targetCount : -1);
  return seq;
}

export function fireSingijeon() {
  const targets = collectTargets();
  const seq = allocate(targets.length);
  state.emit('singijeonVolley', { rockets: seq.length, targets: targets.length });

  const pp = rig.dolly.position.clone();
  const fwd = new THREE.Vector3(); rig.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();

  seq.forEach((ti, i) => {
    setTimeout(() => {
      if (state.phase !== 'play') return;
      const t = targets[ti];
      // 표적이 없거나 이미 죽었으면 전방 허공으로 (빈 발사도 보이게 — 궁극기가 먹통처럼 안 보이도록)
      let dest;
      if (!t) dest = pp.clone().addScaledVector(fwd, 14 + i * 3);
      else if (t.kind === 'satto') dest = pp.clone().addScaledVector(fwd, 12);
      else if (!t.actor || t.actor.alive) dest = (t.pos ? t.pos.clone() : pp.clone().addScaledVector(fwd, 14));
      else dest = t.pos.clone();
      dest.y += 0.9;
      launch(dest, t, i);
    }, i * SGJ.volleyGapMs);
  });
  return seq.length;
}

const _toPlayer = new THREE.Vector3(), _side = new THREE.Vector3();
function launch(dest, target, idx) {
  const mesh = acquire();
  const pp = rig.dolly.position;
  // 표적 위 하늘 → 표적. 플레이어 쪽으로 조금 당겨 띄워 비스듬히 내리꽂는다.
  _toPlayer.set(pp.x - dest.x, 0, pp.z - dest.z);
  if (_toPlayer.lengthSq() < 1e-4) _toPlayer.set(0, 0, 1);
  _toPlayer.normalize();
  _side.set(-_toPlayer.z, 0, _toPlayer.x);            // 시선축에 수직 = 화면 좌우
  const lane = (idx % 2 ? 1 : -1) * (0.4 + (idx % 3) * 0.5) * SGJ.spawnSpread;
  const from = new THREE.Vector3(dest.x, dest.y + SGJ.spawnUp, dest.z)
    .addScaledVector(_toPlayer, SGJ.spawnToward)
    .addScaledVector(_side, lane);
  mesh.position.copy(from);
  sc.add(mesh);
  live.push({ mesh, from, dest, target, t0: now(), tick: 0, done: false });
  state.emit('singijeonLaunch', idx);
}

export function updateSingijeon(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const r = live[i];
    const k = Math.min(1, (now() - r.t0) / SGJ.flightMs);
    // 포물선: 수평은 선형, 수직은 sin 아치
    _a.lerpVectors(r.from, r.dest, k);
    _a.y += Math.sin(k * Math.PI) * SGJ.arcHeight;
    // 진행 방향으로 기수 정렬
    _b.copy(_a);
    r.mesh.position.copy(_a);
    const k2 = Math.min(1, k + 0.02);
    _v.lerpVectors(r.from, r.dest, k2); _v.y += Math.sin(k2 * Math.PI) * SGJ.arcHeight;
    r.mesh.lookAt(_v);
    r.tick++;
    if (r.tick % 2 === 0) trailPuff(r.mesh.position);
    if (r.tick % 3 === 0) burst(r.mesh.position, 1, 0xffb040, 0.6, 420, 0.12);   // 불꽃 꼬리
    const fl = r.mesh.userData.flame;
    if (fl) fl.scale.set(0.8 + Math.random()*0.5, 0.9 + Math.random()*0.7, 0.8 + Math.random()*0.5);

    if (k >= 1) {
      impact(r);
      sc.remove(r.mesh);
      pool.push(r.mesh);
      live.splice(i, 1);
    }
  }
}

function impact(r) {
  const pos = r.mesh.position.clone();
  state.emit('singijeonImpact', pos);
  // 레이어드 폭발 (수류탄 문법 재사용, 조금 더 크게)
  burst(pos, 14, 0xff7a30, 5.0, 520, 0.6);
  burst(pos, 12, 0xffd24a, 4.0, 430, 0.5);
  burst(pos, 18, 0xfff2c8, 9.0, 260, 0.16);
  burst(pos, 12, 0x8a9098, 0.9, 2200, 0.95);
  shockwave(pos, SGJ.splash);
  explosionFlash(pos);
  kick(2.2);
  if (pos.y < 1.6) scorch(pos, SGJ.splash * 0.6);

  const t = r.target;
  if (t?.kind === 'actor' && t.actor?.alive) {
    t.actor.onHit(t.actor.headOnly ? 'hitHead' : 'hitBody', SGJ.dmg, { weak: true, ult: true });
  } else if (t?.kind === 'boss') {
    bossTakeUltDamage(SGJ.bossDmg);
  } else if (t?.kind === 'satto') {
    sattoTakeDamage(pos, 1e9, SGJ.bossDmg);
  }
  // 착탄 광역 — 표적이 아니어도 근처면 휩쓸린다
  for (const a of [...getActors()]) {
    if (!a.alive || a === t?.actor) continue;
    if (a.group.position.distanceTo(pos) < SGJ.splash) {
      a.onHit(a.headOnly ? 'hitHead' : 'hitBody', SGJ.splashDmg, {});
    }
  }
}

export function resetSingijeon() {
  for (const r of live) { if (r.mesh.parent) r.mesh.parent.remove(r.mesh); pool.push(r.mesh); }
  live.length = 0;
}
export function singijeonBusy() { return live.length > 0; }
