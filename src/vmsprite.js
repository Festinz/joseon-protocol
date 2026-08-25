// vmsprite.js — 1인칭 뷰모델 스프라이트 (Gemini 아트, Shadowglass 문법).
// 3D 뷰모델을 대체한다. 견착(hand)에 따라 좌우 미러 — 영구 선택이 화면에 상시 보인다.

import { state, now } from './state.js';
import { WEAPONS } from './config.js';

const SPRITES = {
  rifle: 'assets/vm/rifle.png',
  carbine: 'assets/vm/rifle.png',     // 전용 아트 없음 — 소총 공유
  ritual: 'assets/vm/rifle.png',
  dagger: 'assets/vm/dagger.png',
  grenade: 'assets/vm/grenade.png',
  mapae: 'assets/vm/mapae.png',
};

let img, wrap, scopeEl, scopeSvg, xhairEl;
let bobPhase = 0;
let kickY = 0, kickR = 0;
let override = null;         // { sprite, until, anim } — 단도/수류탄/마패 일시 연출
let adsT = 0;
let swayX = 0, swayY = 0, swayVX = 0, swayVY = 0; // 룩-스웨이: 시선 반대로 끌리다 스프링 복귀

export function initVmSprite() {
  wrap = document.getElementById('vmwrap');
  img = document.getElementById('vmimg');
  scopeEl = document.getElementById('scope');
  scopeSvg = scopeEl && scopeEl.firstElementChild;
  xhairEl = document.getElementById('xhair');

  state.on('handChosen', (h) => document.body.classList.toggle('hand-L', h === 'L'));
  state.on('weaponChanged', refresh);
  state.on('shotFired', () => { kickY = 26; kickR = 3.5; });
  state.on('reloadStart', (key) => {
    const ms = (WEAPONS[key || state.currentWeapon]?.reloadMs || 600) + 250;
    override = { sprite: cur(), until: now() + ms, anim: 'reload', dur: ms };
  });
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

  // 룩-스웨이 (총이 시선을 한 박자 늦게 따라오는 관성) — 스프링-댐퍼
  const ldx = state._lookDX || 0, ldy = state._lookDY || 0;
  state._lookDX = 0; state._lookDY = 0; // 소비 후 리셋 (일시정지 중 잔류 방지)
  swayVX += (-ldx * 2.2 - swayX * 90 - swayVX * 14) * dts;
  swayVY += (-ldy * 1.8 - swayY * 90 - swayVY * 14) * dts;
  swayX = Math.max(-46, Math.min(46, swayX + swayVX * dts * 60));
  swayY = Math.max(-34, Math.min(34, swayY + swayVY * dts * 60));
  const swayScale = 1 - adsT * 0.65; // ADS 시 스웨이 억제

  // 이동 바브
  if (state.playerMoving) bobPhase += dts * 7.5;
  const bobX = Math.sin(bobPhase) * 9 * (state.playerMoving ? 1 : 0.25) * (1 - adsT * 0.7);
  const bobY = Math.abs(Math.cos(bobPhase)) * 7 * (state.playerMoving ? 1 : 0.25) * (1 - adsT * 0.7);

  // 반동 감쇠
  kickY *= Math.pow(0.002, dts); kickR *= Math.pow(0.002, dts);

  // 연출 애니 오프셋
  let ax = 0, ay = 0, ar = 0, scale = 1;
  if (override) {
    const dur = override.dur || 700;
    const k = 1 - Math.max(0, (override.until - t)) / dur;
    if (override.anim === 'stab') { ax = -60 * Math.sin(k * Math.PI); ay = -40 * Math.sin(k * Math.PI); ar = -8 * Math.sin(k * Math.PI); }
    if (override.anim === 'throw') { ay = 30 - 90 * Math.sin(Math.min(1, k * 1.3) * Math.PI); ar = -6 * Math.sin(k * Math.PI); }
    if (override.anim === 'raise') { ay = 40 - 70 * Math.min(1, k * 2); scale = 1.06; }
    if (override.anim === 'reload') {
      // 총을 내리고(0~0.35) → 기울여 만지작(0.35~0.8, 흔들림) → 척 올림(0.8~1)
      if (k < 0.35) { const p = k / 0.35; ay = 90 * p; ar = 14 * p; }
      else if (k < 0.8) { const p = (k - 0.35) / 0.45; ay = 90 + Math.sin(p * Math.PI * 3) * 10; ar = 14 - p * 4; ax = Math.sin(p * Math.PI * 2) * 8; }
      else { const p = (k - 0.8) / 0.2; ay = 90 * (1 - p * p); ar = 10 * (1 - p); }
    }
  }

  // ADS: 총을 내리고 조준경(스코프 오버레이)으로 전환 — 2D 스프라이트의 견착 문법
  const sign = state.hand === 'L' ? 1 : -1;
  const adsX = sign * adsT * (innerWidth * 0.02);
  const adsY = adsT * (innerHeight * 0.62);
  const crouchY = state.playerCrouching ? 14 : 0;
  // 상하 조준 패럴랙스: 위를 보면 총이 내려가고 살짝 들리는 느낌 (2D 스프라이트의 3D 착시)
  const pitch = state._pitchVal || 0;
  const pitchY = pitch * 46;          // 위(+pitch) → 스프라이트 아래로
  const pitchR = -pitch * 3.2 * (state.hand === 'L' ? -1 : 1);

  // 조준감: 원근 단축 — 총구(이미지 좌단)가 화면 안쪽(크로스헤어 방향)으로 후퇴.
  // 미러(hand-L)는 CSS scale 이 렌더 전체를 뒤집으므로 rotateY 는 자동 보정, rotate 상수만 부호 반전.
  const mir = state.hand === 'L' ? -1 : 1;
  const aimYaw = 17 * (1 - adsT * 0.7);          // ADS 시 정렬 (덜 기울임)
  const aimTilt = -4.5 * (1 - adsT * 0.6);       // 총구 살짝 들어 크로스헤어 쪽으로
  img.style.transform =
    `perspective(1000px) translate(${bobX + ax + adsX + swayX * swayScale}px, ${bobY + ay + adsY + kickY + crouchY + pitchY + swayY * swayScale}px) ` +
    `rotateY(${aimYaw}deg) ` +
    `rotate(${(kickR + ar + aimTilt) * mir + pitchR + swayX * swayScale * 0.05}deg) scale(${scale + adsT * 0.16})`;

  // 스코프 오버레이 페이드 + 레티클 미세 스웨이, 기본 크로스헤어는 스코프에 양보
  if (scopeEl) {
    scopeEl.style.opacity = adsT < 0.02 ? 0 : adsT;
    if (scopeSvg) scopeSvg.style.transform = `translate(${swayX * 0.35}px, ${swayY * 0.35 + kickY * 0.4}px)`;
  }
  if (xhairEl) xhairEl.style.opacity = 1 - adsT * 0.9;
}
