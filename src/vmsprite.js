// vmsprite.js — 1인칭 뷰모델 스프라이트 (Gemini 아트, Shadowglass 문법).
// 3D 뷰모델을 대체한다. 견착(hand)에 따라 좌우 미러 — 영구 선택이 화면에 상시 보인다.

import { state, now } from './state.js';
import { WEAPONS, HEAVY } from './config.js';

const SPRITES = {
  rifle: 'assets/vm/rifle.png',
  carbine: 'assets/vm/rifle.png',     // 전용 아트 없음 — 소총 공유
  ritual: 'assets/vm/rifle.png',
  hwando: 'assets/vm/dagger.png',     // 근접 — 단도/환도 아트
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
  state.on('meleeSwing', () => {
    override = { sprite: SPRITES.dagger, until: now() + 340, anim: 'slash', dur: 340 };
    const fx = document.getElementById('slashfx');           // 참격 궤적 플래시
    if (fx) { fx.classList.remove('go', 'heavy'); void fx.offsetWidth; fx.classList.add('go'); }
  });
  state.on('meleeHeavy', () => {                             // 강공: 크게 치켜들었다 내리친다
    const dur = HEAVY.fireMs;   // 후딜 전체를 애니로 덮는다 — 회수 동작이 곧 "아직 못 친다" 의 신호
    override = { sprite: SPRITES.dagger, until: now() + dur, anim: 'heavy', dur };
    const fx = document.getElementById('slashfx');
    if (fx) { fx.classList.remove('go', 'heavy'); void fx.offsetWidth; fx.classList.add('go', 'heavy'); }
  });
  state.on('grenadeThrown', () => { override = { sprite: SPRITES.grenade, until: now() + 650, anim: 'throw' }; });
  state.on('meleeHeavyCancel', () => { if (override?.anim === 'heavy') { override = null; refresh(); } });
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

  // ADS 보간 — 근접/투척물은 조준경 자체가 없다
  const adsGoal = (state.ads && !WEAPONS[state.currentWeapon]?.melee) ? 1 : 0;
  adsT += (adsGoal - adsT) * Math.min(1, dts * 9);

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
    if (override.anim === 'slash') {                          // 대각 베기: 오른위→왼아래 호를 그리며 슥삭
      const s = Math.min(1, k * 1.12);
      ax = 110 - 300 * s;                                     // 오른쪽에서 왼쪽으로 휩쓸기
      ay = -30 - 90 * Math.sin(s * Math.PI);                  // 호 (중간에 치켜들림)
      ar = 26 - 78 * s;                                       // 칼날 각도 회전
      scale = 1 + 0.12 * Math.sin(s * Math.PI);
    }
    if (override.anim === 'throw') { ay = 30 - 90 * Math.sin(Math.min(1, k * 1.3) * Math.PI); ar = -6 * Math.sin(k * Math.PI); }
    if (override.anim === 'heavy') {
      // 3구간: 치켜듦(~윈드업) → 내리찍기(180ms) → 회수(남은 후딜 전부, 천천히 idle 로)
      const kUp = HEAVY.windupMs / HEAVY.fireMs;
      const kDown = kUp + 180 / HEAVY.fireMs;
      if (k < kUp) { const p = k / kUp; ax = 70 * p; ay = -130 * p; ar = 58 * p; scale = 1 + 0.12 * p; }
      else if (k < kDown) {
        const p = (k - kUp) / (kDown - kUp), s = 1 - Math.pow(1 - p, 3);
        ax = 70 - 330 * s; ay = -130 + 250 * s; ar = 58 - 145 * s;
        scale = 1.12 + 0.26 * Math.sin(p * Math.PI);
      } else {                                              // 회수 — 무거운 칼을 도로 세운다
        const p = (k - kDown) / (1 - kDown), e = p * p * (3 - 2 * p);
        ax = -260 * (1 - e); ay = 120 * (1 - e); ar = -87 * (1 - e);
        scale = 1 + 0.10 * (1 - e);
      }
    }
    if (override.anim === 'raise') { ay = 40 - 70 * Math.min(1, k * 2); scale = 1.06; }
    if (override.anim === 'reload') {
      // 택티컬 리로드: 캔트(0~0.25) → 탄창 탈착 홱(0.25~0.5) → 삽탄(0.5~0.75) → 노리쇠 스냅(0.75~1)
      if (k < 0.25) { const p = k / 0.25; ay = 55 * p; ar = 22 * p; ax = -12 * p; }
      else if (k < 0.5) { const p = (k - 0.25) / 0.25; ay = 55 + 55 * Math.sin(p * Math.PI * 0.5); ar = 22 + 6 * p; ax = -12 - 26 * p; }
      else if (k < 0.75) { const p = (k - 0.5) / 0.25; ay = 110 - 40 * p; ar = 28 - 8 * p; ax = -38 + 30 * p; }
      else { const p = (k - 0.75) / 0.25; const s = 1 - (1 - p) * (1 - p); ay = 70 * (1 - s) - 8 * Math.sin(p * Math.PI); ar = 20 * (1 - s); ax = -8 * (1 - s); }
    }
  }

  // ADS "견착": 총을 들어 올려 눈에 가져다 댄다 (배그 문법) — 중앙+위로 이동·확대·수평 정렬,
  // 눈에 닿는 마지막 구간에 총이 페이드아웃되며 스코프 렌즈가 커지며 선명해진다.
  // 미러는 #vmwrap scaleX(-1) 이 전담 — 여기선 손 부호 보정 없음. 화면공간인 스웨이만 wsign.
  const wsign = state.hand === 'L' ? -1 : 1;
  const eA = adsT * adsT * (3 - 2 * adsT);            // smoothstep — 들어올리는 가속감
  const adsX = -(innerWidth * 0.17) * eA;             // 화면 중앙으로
  const adsY = -(innerHeight * 0.09) * eA;            // 눈높이로 들어올림
  const crouchY = state.playerCrouching ? 14 : 0;
  // 상하 조준 패럴랙스: 위를 보면 총이 내려가고 살짝 들리는 느낌 (2D 스프라이트의 3D 착시)
  const pitch = state._pitchVal || 0;
  const pitchY = pitch * 46;          // 위(+pitch) → 스프라이트 아래로
  const pitchR = -pitch * 3.2;

  // 조준감: 원근 단축 — 총구(이미지 좌단)가 화면 안쪽(크로스헤어 방향)으로 후퇴.
  // 래퍼 미러가 전체를 뒤집으므로 아트 공간 항은 부호 보정 불필요, 화면공간(스웨이)만 wsign 적용.
  const aimYaw = 17 * (1 - eA * 0.85);           // 들어올리며 수평 정렬
  const aimTilt = -4.5 - 7 * eA;                 // 총구를 눈높이로 세움
  const swx = swayX * swayScale * wsign;
  img.style.transform =
    `perspective(1000px) translate(${bobX + ax + adsX + swx}px, ${bobY + ay + adsY + kickY + crouchY + pitchY + swayY * swayScale}px) ` +
    `rotateY(${aimYaw}deg) ` +
    `rotate(${kickR + ar + aimTilt + pitchR + swx * 0.05}deg) scale(${scale + eA * 0.5})`;
  // 눈에 닿는 순간(60%~92%) 총이 시야에서 사라진다
  img.style.opacity = eA < 0.6 ? 1 : Math.max(0, 1 - (eA - 0.6) / 0.32);

  // 스코프 렌즈: 늦게 시작해 커지며(눈에 다가옴) 흐림 → 선명
  if (scopeEl) {
    const so = Math.max(0, (eA - 0.45) / 0.55);
    scopeEl.style.opacity = so;
    scopeEl.style.filter = so < 1 ? `blur(${(1 - so) * 3.5}px)` : '';
    if (scopeSvg) scopeSvg.style.transform =
      `translate(${swayX * 0.35}px, ${swayY * 0.35 + kickY * 0.4}px) scale(${1.28 - 0.28 * so})`;
  }
  if (xhairEl) xhairEl.style.opacity = 1 - adsT * 0.9;
}
