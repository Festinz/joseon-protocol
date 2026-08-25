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
  // 조선 산탄총: 펠릿 8발을 한 번에. 근거리 폭발력, 원거리는 급격히 무력해진다
  carbine: { key: 'carbine', name: '조선 산탄총', mag: 5, reserve: 30, dmg: 9, weakMult: 2, fireMs: 620, reloadMs: 1100, spread: 0, kick: 0.16,
             pellets: 8, spreadDeg: 7.5, falloffFrom: 8, falloffTo: 22, minMult: 0.15 },
  ritual:  { key: 'ritual',  name: '흑각궁',    mag: 1, reserve: 3,  dmg: 60, weakMult: 2, fireMs: 800, reloadMs: 1600, spread: 8,  kick: 0.10,
             silent: true, drawMs: 520 },   // 활 — 무소음(은신 시너지) + 시위 당김 선행
  hwando:  { key: 'hwando',  name: '환도',      mag: 1, reserve: 0,  dmg: 34, weakMult: 2, fireMs: 420, reloadMs: 0,    spread: 0,  kick: 0.06,
             melee: true, range: 2.6, arcDeg: 100 },   // 근접 — 탄약 없음, 숏앤슬래시
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
  marksman: { name: '별기군 사수', hp: 20, score: 150, color: 'RED',  danger: true, windupMs: 300, aimIntervalMs: 6000, firstDelayMs: 4000, keepAway: 6 },
  thrower:  { name: '진천뢰 투척병', hp: 15, score: 150, color: 'LEATHER', lob: true, lobIntervalMs: 8000, bombHp: 1, bombFlightMs: 2600, keepAway: 7 },
  shield:   { name: '팽배수',   hp: 30, score: 200, color: 'BRASS',   headOnly: true, advance: true },
};

// 잡졸 근접 공격 — 붙으면 원거리 무기를 접고 개머리판·창대로 때린다.
// 실데미지라 반드시 예고된다(붉은 오라 + windupMs). 거리에 따라 대응이 갈리게 만드는 축.
export const EMELEE = {
  range: 2.7,           // 이 안이면 근접으로 전환
  windupMs: 420,        // 예고 — 이 사이에 빠지거나 회피하면 안 맞는다
  arcDeg: 130,
  dmg: 16,
  cooldownMs: 2400,
};
export const DANGER = {
  flightMs: 1000,       // 트레이서 비행 = 반응창 (견착 무관 불변 — "정보는 평등")
  tutorialFlightMs: 1500, // 첫 사수/첫 역견착 완화
  telegraphMs: 300,     // 발사 전 붉은 아웃라인 선행
};

// ── 궁극기 (open 필드 전용 — PPTX 규칙) ──
// 충전은 "아껴둔 한 방" 이어야 한다. 이전 값(킬 4 / 명중 1)은 한 구역만 돌아도 게이지가
// 가득 차서 궁극기가 상시 기술이 됐다. 대략 두 구역에 한 번 쓰이도록 절반 아래로 내린다.
export const ULT = {
  max: 100,
  perHit: 0.5,          // (구 1)
  perKill: 2,           // (구 4)
  perWeakKill: 1.2,     // 약점 처치 추가분 (구 3)
  perShootdown: 3,      // (구 5)
  perEvade: 0.5,        // 회피 스텝 — 쓰는 것만으로도 조금 찬다
  perEvadeNegate: 2,    // 회피로 실제 피해를 흘려냈을 때 (읽고 반응한 보상)
  riskMult: 1.5,        // 역견착(!favorable) 노출 킬 배율
  // 보스에게는 고정 피해가 아니라 최대 체력 비율로 넣는다. 한 번에 최대 1/5.
  // 로켓이 여러 발 박혀도 합계가 이 비율을 넘지 않는다.
  bossFrac: 0.2,
  bossDmg: 150,         // (구 경로 호환 — 신기전은 bossFrac 을 쓴다)
  castMs: 4500,
};

// ── 아이템 ──
export const ITEMS = {
  tonic: { heal: 40, max: 2, start: 2, useMs: 800 },
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

// ── 환도 강공 (우클릭) — 소울류 문법: 느리고, 크고, 아프다 ──
// 경공(좌클릭)은 빠르고 단일 타겟. 강공은 선딜 후 넓은 부채꼴 전원 타격 + 긴 후딜.
export const HEAVY = {
  dmgMult: 2.4,        // 환도 34 → 강공 ≈82 (콤보 배율 별도)
  fireMs: 900,         // 후딜 — 헛치면 크게 손해 (경/강 공용 쿨다운)
  windupMs: 240,       // 치켜드는 선행 동작. 판정은 이 뒤에 난다
  range: 3.2, arcDeg: 150,
  staggerMs: 700,
};

// ── 회피 (Ctrl) — 입력 방향 사이드스텝. 스텝 전 구간 무적 ──
// 세키로식 스텝: 짧고 빠르고 이어붙는다. 무적은 스텝 앞부분에만 —
// 전 구간 무적 + 짧은 쿨다운이면 무적 가동률이 60%를 넘어 명중탄 시스템이 무의미해진다.
export const EVADE = {
  distance: 3.0,       // 스텝 총 이동거리(m) — 짧고 날카롭게
  durMs: 260,
  iframeMs: 182,       // durMs 의 70% — 앞구간만 무적 (연타 가능한 대신 타이밍이 붙는다)
  cooldownMs: 200,     // 총 주기 460ms — 슥슥 이어진다
  rollDeg: 12,
  dip: 0.11,
  fovPunch: 7,
};


// ── 성능 / 레트로 렌더 ──
export const PERF = {
  maxPixelRatio: 2, cameraFar: 200, fogDensity: 0.0055,
  retroHeight: 432,   // ?retro=1 일 때만 사용 — 기본은 네이티브 고해상도
};
