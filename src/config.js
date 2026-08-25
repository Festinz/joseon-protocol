// config.js — 모든 튜닝 수치의 단일 진실 (Single Source of Truth)
// 밸런싱은 이 파일 + URL 파라미터(debug.js)만 만진다. 다른 파일에 숫자 하드코딩 금지.

export const PALETTE = {
  INDIGO: 0x1a1f3a, BLACK: 0x101014, LEATHER: 0x4a3222, WOOD: 0x6b4a2e,
  BRASS: 0xb08d3e, IRON: 0x5c6068, STEAM: 0x9fd8d4, RED: 0x8a2020,
  DANGER: 0xff3b30, PAPER: 0xe8dcc0, STONE: 0x6e6a60, TILE: 0x2e3138,
  DANCHEONG_G: 0x2e6e5e, DANCHEONG_R: 0x8a3a2a, GOLD: 0xd8b46a,
};

// ── 견착 × 엄폐 노출 모델 (핵심 훅) ──────────────────────────────
// favorable = (coverEdge === hand). 판정은 결정론 — 숨은 확률 보정 금지.
export const PEEK = {
  favorable:   { exposure: 0.30, popOffset: 0.25, popUp: 0.10, popOutMs: 120, snapInMs: 100, settleMs: 150, hitboxW: 0.35, vmRollDeg: 4 },
  unfavorable: { exposure: 0.65, popOffset: 0.55, popUp: 0.10, popOutMs: 240, snapInMs: 220, settleMs: 320, hitboxW: 0.70, vmRollDeg: 10 },
  neutral:     { exposure: 0.50, popOffset: 0.00, popUp: 0.45, popOutMs: 180, snapInMs: 160, settleMs: 220, hitboxW: 0.55, vmRollDeg: 0 },
};

export const PLAYER = {
  hp: 100,
  dangerHit: 25,        // 명중탄 피격
  mortarHit: 25,        // 진천뢰/박격 착탄
  beamHit: 34,          // 보스 스윕/돌진
  timerFail: 25,        // 노드 타이머 초과
  postHitInvulnMs: 800,
  coveredEyeY: 1.18,    // 엄폐 시 카메라 높이 — 커버 상단 살짝 위 (적 실루엣 관찰 가능, TC 문법)
  exposedEyeY: 1.55,
  shoulderX: 0.22,      // 견착 어깨 오프셋 (RUN.hand 부호 적용)
  fov: 68,
};

// ── 무기 — PPTX {0}/{1} 규칙: 재장전량 = min(MaxMag-현재, 예비), 예비에서 정확히 차감 ──
export const WEAPONS = {
  rifle:   { key: 'rifle',   name: '영천 장총', mag: 6, reserve: 60, dmg: 10, weakMult: 2, fireMs: 330, reloadMs: 600,  spread: 12, kick: 0.045 },
  carbine: { key: 'carbine', name: '집경 카빈', mag: 8, reserve: 48, dmg: 6,  weakMult: 2, fireMs: 180, reloadMs: 800,  spread: 24, kick: 0.028 },
  ritual:  { key: 'ritual',  name: '천마도',    mag: 1, reserve: 3,  dmg: 60, weakMult: 2, fireMs: 800, reloadMs: 1600, spread: 8,  kick: 0.10 },
};
export const AUTO_RELOAD = { coveredDelayMs: 400 }; // 엄폐 400ms 후 자동 재장전 시작

// ── 사격 판정 ──
export const AIM = {
  snapRadiusPx: 20,     // 화면공간 관용 스냅 (몸통만, 약점은 정밀 판정)
  settleStartPx: 48,    // 팝아웃 직후 스프레드 링 시작 반경 (시각 연출 전용)
};

// ── 적 — TC 이분법: 잡졸탄 = 연출(0dmg), 명중탄만 위협 ──
export const ENEMIES = {
  grunt:    { name: '화승병',   hp: 10, score: 100, color: 'IRON',    danger: false },
  marksman: { name: '별기군 사수', hp: 20, score: 150, color: 'RED',  danger: true, windupMs: 300, aimIntervalMs: 6000, firstDelayMs: 4000 },
  thrower:  { name: '진천뢰 투척병', hp: 15, score: 150, color: 'LEATHER', lob: true, lobIntervalMs: 8000, bombHp: 1, bombFlightMs: 2600 },
  shield:   { name: '팽배수',   hp: 30, score: 200, color: 'BRASS',   headOnly: true, advance: true },
};
export const DANGER = {
  flightMs: 1000,       // 트레이서 비행 = 반응창 (견착 무관 불변 — "정보는 평등")
  tutorialFlightMs: 1500, // 첫 사수/첫 역견착 완화
  telegraphMs: 300,     // 발사 전 붉은 아웃라인 선행
};

// ── 궁극기 (open 필드 전용 — PPTX 규칙) ──
export const ULT = {
  max: 100, perHit: 1, perKill: 4, perWeakKill: 3, perShootdown: 5,
  riskMult: 1.5,        // 역견착(!favorable) 노출 킬 배율
  bossDmg: 150, castMs: 4500,
};

// ── 아이템 ──
export const ITEMS = {
  tonic: { heal: 40, max: 2, start: 2, useMs: 800 },
  smoke: { durMs: 4000, max: 2, start: 0 },
  grenade: { max: 3, start: 2 },
};

// ── 점수 ──
export const SCORE = {
  kill: 100, weakKill: 200, shootdown: 150, riskTag: 1.5,
  combo: [[8, 2], [16, 4]],           // 연속 명중 [히트수, 배율] — 빗나가면 리셋
  goodPick: 200,                       // 유리한 커버 선택
  zone: (accPct, secLeft, noDmg) => Math.round(accPct * 10) + Math.max(0, Math.round(secLeft)) * 50 + (noDmg ? 2000 : 0),
  continuePenalty: 0.5,
  grades: [ // [최소점수, 한자, 한글, 문구] — 첫 실측 후 재조정 대상
    [42000, '秀', '수', '어명을 완벽히 수행하였도다'],
    [34000, '優', '우', '가히 어사라 할 만하다'],
    [26000, '美', '미', '공을 세웠으나 아직 미흡하다'],
    [18000, '良', '양', '간신히 소임을 다하였다'],
    [0,     '可', '가', '목숨은 건졌으니 다행이다'],
  ],
};

// ── 레일/노드 ──
export const RAIL = {
  transitMs: 2500,      // 노드 간 이동 (무적 + 완전 재장전)
  clearLingerMs: 1000,  // 웨이브 전멸 → 이동 배너까지 여운
  nodeTimerSec: 60,     // 기본 타이머 (보스 노드는 null)
  timerLowSec: 10,
};

// ── 이동 (자유이동 1인칭 — Shadowglass 스타일) ──
export const MOVE = {
  walkSpeed: 4.2, sprintMult: 1.65, crouchMult: 0.55,
  accel: 28, friction: 12,          // m/s² 가속 / 감쇠
  eyeStand: 1.62, eyeCrouch: 1.08,
  radius: 0.42,                     // 충돌 캡슐 반경
  bobFreq: 8.6, bobAmp: 0.028,
  // 리닝 (견착 훅의 재해석): 선택한 어깨 쪽이 빠르고 깊다
  lean: {
    fav:   { offset: 0.55, rollDeg: 11, ms: 130 },
    unfav: { offset: 0.28, rollDeg: 6,  ms: 260 },
  },
};

// ── 명중탄 회피 규칙 (자유이동판) ──
// 발사 순간의 플레이어 위치로 날아간다 → 이동으로 벗어나거나(반경 밖) 벽/엄폐물로 사선을 끊으면 회피.
export const DODGE = { hitRadius: 0.85, crouchBonus: 0.25 };

// ── 성능 / 레트로 렌더 ──
export const PERF = {
  maxPixelRatio: 1.5, cameraFar: 200, fogDensity: 0.011,
  retroHeight: 270,   // 픽셀화: 내부 렌더 세로 해상도 (가로는 화면비 따라) — ?retro=0 으로 끔
};
