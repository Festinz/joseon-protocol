// vmsprite.js — 1인칭 뷰모델 스프라이트 (Gemini 아트, Shadowglass 문법).
// 3D 뷰모델을 대체한다. 견착(hand)에 따라 좌우 미러 — 영구 선택이 화면에 상시 보인다.

import { state, now } from './state.js';

const SPRITES = {
  rifle: 'assets/vm/rifle_s.png',
  carbine: 'assets/vm/rifle_s.png',   // 전용 아트 없음 — 소총 공유
  ritual: 'assets/vm/rifle_s.png',
  dagger: 'assets/vm/dagger_s.png',
  grenade: 'assets/vm/grenade_s.png',
  mapae: 'assets/vm/mapae_s.png',
};

let img, wrap;
let bobPhase = 0;
let kickY = 0, kickR = 0;
let override = null;         // { sprite, until, anim } — 단도/수류탄/마패 일시 연출
let adsT = 0;

export function initVmSprite() {
  wrap = document.getElementById('vmwrap');
  img = document.getElementById('vmimg');

  state.on('handChosen', (h) => document.body.classList.toggle('hand-L', h === 'L'));
  state.on('weaponChanged', refresh);
  state.on('shotFired', () => { kickY = 26; kickR = 3.5; });
  state.on('reloadStart', () => { override = { sprite: cur(), until: now() + 500, anim: 'reload' }; });
  state.on('assassinateDone', () => { override = { sprite: SPRITES.dagger, until: now() + 700, anim: 'stab' }; });
  state.on('grenadeThrown', () => { override = { sprite: SPRITES.grenade, until: now() + 650, anim: 'throw' }; });
  state.on('ultCastStart', () => { override = { sprite: SPRITES.mapae, until: now() + 1700, anim: 'raise' }; });
  refresh();
}

function cur() { return SPRITES[state.currentWeapon] || SPRITES.rifle; }
function refresh() { if (img) img.src = cur(); }

export function updateVmSprite(dt) {
  if (!img) return;
  const dts = Math.min(0.05, dt / 1000);
  const t = now();

  // 오버라이드 스프라이트 (연출)
  if (override) {
    if (img.src.indexOf(override.sprite) < 0) img.src = override.sprite;
    if (t > override.until) { override = null; refresh(); }
  }

  // ADS 보간
  adsT += ((state.ads ? 1 : 0) - adsT) * Math.min(1, dts * 9);

  // 이동 바브
  if (state.playerMoving) bobPhase += dts * 7.5;
  const bobX = Math.sin(bobPhase) * 9 * (state.playerMoving ? 1 : 0.25) * (1 - adsT * 0.7);
  const bobY = Math.abs(Math.cos(bobPhase)) * 7 * (state.playerMoving ? 1 : 0.25) * (1 - adsT * 0.7);

  // 반동 감쇠
  kickY *= Math.pow(0.002, dts); kickR *= Math.pow(0.002, dts);

  // 연출 애니 오프셋
  let ax = 0, ay = 0, ar = 0, scale = 1;
  if (override) {
    const k = 1 - Math.max(0, (override.until - t)) / 700;
    if (override.anim === 'stab') { ax = -60 * Math.sin(k * Math.PI); ay = -40 * Math.sin(k * Math.PI); ar = -8 * Math.sin(k * Math.PI); }
    if (override.anim === 'throw') { ay = 30 - 90 * Math.sin(Math.min(1, k * 1.3) * Math.PI); ar = -6 * Math.sin(k * Math.PI); }
    if (override.anim === 'raise') { ay = 40 - 70 * Math.min(1, k * 2); scale = 1.06; }
    if (override.anim === 'reload') { ay = 34 * Math.sin(k * Math.PI); ar = 5 * Math.sin(k * Math.PI); }
  }

  // ADS: 중앙으로 + 확대 (견착 줌)
  const sign = state.hand === 'L' ? 1 : -1;
  const adsX = sign * adsT * (innerWidth * 0.13);
  const adsY = adsT * 26;
  const crouchY = state.playerCrouching ? 14 : 0;

  img.style.transform =
    `translate(${bobX + ax + adsX}px, ${bobY + ay + adsY + kickY + crouchY}px) ` +
    `rotate(${(kickR + ar) * (state.hand === 'L' ? -1 : 1)}deg) scale(${scale + adsT * 0.16})`;
}
