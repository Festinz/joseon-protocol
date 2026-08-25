// main.js — (자유이동판) 부트스트랩 + 게임 루프.
// 레트로 룩: 저해상도 내부 렌더 + CSS nearest 업스케일 (Shadowglass 픽셀화)

import * as THREE from 'three';
import { PERF } from './config.js';
import { state, resetRun } from './state.js';
import { ZONES, GATES } from './leveldata.js';
import { initRail, updateRail, rig, teleport, addGateSolid } from './rail.js';
import { initInput } from './input.js';
import { initWeapons3D, updateWeapons } from './weapons.js';
import { updateCombat, registerBlocker, clearDangerShots } from './combat.js';
import { initEnemies, updateEnemies, clearAll, getActors, spawnMortars } from './enemies.js';
import { initBossScene, resetBoss } from './boss.js';
import { initMulgitScene, resetMulgit } from './mulgit.js';
import { initThrowables, updateThrowables } from './throwables.js';
import { initVmSprite, updateVmSprite } from './vmsprite.js';
import { initFlow, updateFlow, beginRun } from './flow.js';
import { initVfx, updateVfx } from './vfx.js';
import { initAudio } from './audio.js';
import { initUI, updateUI, showMobileWarn, showLoadError } from './ui.js';
import { applyDebugParams, autoStart, initDebugOverlay, updateDebug, params } from './debug.js';
import { buildEnvironment, losMeshes } from './assets.js';

window.addEventListener('error', (e) => showLoadError(e.message));

// ── 렌더러: 레트로 저해상도 + CSS 픽셀 업스케일 ─────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.autoClear = false;
renderer.autoClearColor = false;               // r180: 2-패스에서 배경이 1패스를 덮는 것 방지
renderer.setClearColor(0x0a1220, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
const RETRO = params.get('retro') === '1';   // 기본 고해상도 — ?retro=1 로 픽셀 룩
document.body.classList.toggle('retro', RETRO);
function sizeRenderer() {
  if (RETRO) {
    const h = Number(params.get('retroh')) || PERF.retroHeight;
    const w = Math.round(h * innerWidth / innerHeight);
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);           // 캔버스 CSS 는 100% — nearest 업스케일
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio, PERF.maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  canvas.style.width = '100vw'; canvas.style.height = '100vh';
}
sizeRenderer();

const scene = new THREE.Scene();
scene.background = null;                       // 배경은 clearColor + 하늘 돔이 담당
scene.fog = new THREE.FogExp2(0x0a1220, PERF.fogDensity);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, PERF.cameraFar);

// 조명 — 밤의 경복궁 (달빛 + 등롱)
const hemi = new THREE.HemisphereLight(0x46577f, 0x1c1710, 2.7);
const moon = new THREE.DirectionalLight(0xa8c4ff, 2.2); moon.position.set(-30, 60, 10);
const bossGlow = new THREE.PointLight(0x9fd8d4, 2.6, 40); bossGlow.position.set(0, 6, -132);
for (const l of [hemi, moon, bossGlow]) { l.layers.enable(1); scene.add(l); }

// 환경 + LOS 블로커
scene.add(buildEnvironment());
for (const m of losMeshes) registerBlocker(m);

// ── 모듈 초기화 ─────────────────────────────────────────────────────
resetRun();
applyDebugParams();
scene.add(initRail(camera));
for (const g of GATES) addGateSolid(g.id, g);
initInput();
initWeapons3D();
initVmSprite();
initEnemies(scene);
initBossScene(scene);
initMulgitScene(scene);
initThrowables(scene);
initVfx(scene);
initAudio();
initFlow();
initDebugOverlay(renderer);

state.on('bossMortar', (n) => spawnMortars(n));
state.on('debugKillWave', () => { for (const a of [...getActors()]) if (a.alive) a.onHit(a.headOnly ? 'hitHead' : 'hitBody', 9999, {}); });
state.on('debugJump', (idx) => {
  clearAll(); clearDangerShots(); resetBoss(); resetMulgit();
  const z = ZONES[Math.min(idx, ZONES.length - 1)];
  teleport(z.anchor[0], z.enterZ - 2); // 존 경계 안쪽으로
});

const startRun = () => { beginRun(); };
initUI({ onRunStart: startRun });

if (matchMedia('(pointer: coarse)').matches && innerWidth < 900) showMobileWarn();
autoStart(startRun);

// ── 루프 ───────────────────────────────────────────────────────────
let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  let dt = Math.min(50, t - last); last = t;
  dt *= (state._timescale || 1);

  if (state.phase === 'play' && !state.paused) {
    if (state._god) state.player.hp = Math.max(state.player.hp, 100);
    updateRail(dt);       // 플레이어 이동/리닝
    updateEnemies(dt);
    updateFlow(dt);
    updateCombat(dt);
    updateWeapons(dt);
    updateThrowables(dt);
  }
  updateVfx(dt);
  updateVmSprite(dt);
  updateUI();
  updateDebug(dt);

  renderer.clear();
  camera.layers.set(0); renderer.render(scene, camera);
  renderer.clearDepth();
  camera.layers.set(1); renderer.render(scene, camera);
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  sizeRenderer();
});

// 디버그: 헤드리스 캔버스 캡처 + 수동 스텝 (숨은 탭에서 RAF 정지 대응)
if (params.get('debug') === '1') {
  window.SNAP = (q = 0.55) => {
    renderer.clear();
    camera.layers.set(0); renderer.render(scene, camera);
    renderer.clearDepth();
    camera.layers.set(1); renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', q);
  };
  window.CAM = camera;
  window.STEP = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const dt = 16.7 * (state._timescale || 1);
      if (state.phase === 'play' && !state.paused) {
        if (state._god) state.player.hp = Math.max(state.player.hp, 100);
        updateRail(dt); updateEnemies(dt); updateFlow(dt); updateCombat(dt); updateWeapons(dt); updateThrowables(dt);
      }
      updateVfx(dt); updateVmSprite(dt); updateUI();
    }
  };
  import('./enemies.js').then(m => { window.ACTORS = m.getActors; window.EN = () => ({ alive: m.aliveCount() }); });
}
