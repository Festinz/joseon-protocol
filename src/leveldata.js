// leveldata.js — 자유이동판: 존(전투 구역) + 충돌벽(시각·충돌·사선차단 단일 진실) + 커버 프롭.
// 남→북: 광화문 광장 → 폭풍의 관문 → 회랑(ㄱ자 굽이) → 후원 → 근정전 보스룸

// ── 충돌벽: {x, z, w, d, h} — 기존 시각 환경(assets.buildEnvironment)과 1:1 정합 ──
export const WALLS = [
  // 광장 담장 (addWallRun ±16, z 4..-40)
  { x: -16, z: -18, w: 0.9, d: 44, h: 3.2 },
  { x: 16,  z: -18, w: 0.9, d: 44, h: 3.2 },
  { x: 0,   z: 6,   w: 33,  d: 1.0, h: 3.2 },              // 남쪽 등뒤 (비가시 경계)
  // 광장 담장 끝 ~ 관문 사이 측면 막음 (z -40..-52)
  { x: -11, z: -46, w: 11, d: 1.0, h: 3.2 },
  { x: 11,  z: -46, w: 11, d: 1.0, h: 3.2 },
  // 관문 석축 (gateProc baseL/R: x ±6.1, w 7.6, d 3 — 개구부 x -2.3..2.3)
  { x: -6.1, z: -52, w: 7.6, d: 3, h: 5 },
  { x: 6.1,  z: -52, w: 7.6, d: 3, h: 5 },
  // 관문 안 통로 (inL/inR: x ±4.5, z -53..-69)
  { x: -4.5, z: -61, w: 0.8, d: 16, h: 3.2 },
  { x: 4.5,  z: -61, w: 0.8, d: 16, h: 3.2 },
  // 통로 → 회랑 홀 전환부 측면 막음 (z -69..-56 홀 시작 어긋남 보정)
  { x: -8.2, z: -69.5, w: 8.2, d: 1.0, h: 3.2 },
  { x: 7.2,  z: -69.5, w: 6.2, d: 1.0, h: 3.2 },
  // 회랑 홀 (addWallRun -12/10, z -56..-112) — 통로 이후 구간만 유효
  { x: -12, z: -84, w: 0.9, d: 56, h: 3.2 },
  { x: 10,  z: -84, w: 0.9, d: 56, h: 3.2 },
  // 보스룸 문 벽 (z -112, 개구부 x -2.6..2.6) — 시각은 env 에서 생성
  { x: -7.3, z: -112, w: 9.4, d: 1.4, h: 5 },
  { x: 6.3,  z: -112, w: 7.4, d: 1.4, h: 5 },
  // 보스룸 (addWallRun ±20, z -112..-142 + back -142)
  { x: -20, z: -127, w: 0.9, d: 30, h: 6 },
  { x: 20,  z: -127, w: 0.9, d: 30, h: 6 },
  { x: 0,   z: -141.5, w: 42, d: 1.4, h: 6 },
  // 보스룸 문 좌우 연결 (회랑 홀 폭 → 보스룸 폭 확장부)
  { x: -16, z: -112, w: 8.4, d: 1.4, h: 5 },
  { x: 15,  z: -112, w: 10.4, d: 1.4, h: 5 },
];

// ── 낮은 엄폐 프롭 (명중탄 사선 차단 + 시각) {x,z,w,d,h,kind} ──
export const COVERS = [
  { x: -5, z: -14, w: 2.4, d: 0.8, h: 1.15, kind: 'lowWall' },
  { x: 5,  z: -22, w: 2.4, d: 0.8, h: 1.15, kind: 'lowWall' },
  { x: 0,  z: -30, w: 2.2, d: 0.9, h: 1.1,  kind: 'crateWall' },
  { x: -8, z: -34, w: 1.8, d: 0.9, h: 1.1,  kind: 'crateWall' },
  { x: 8,  z: -37, w: 1.8, d: 0.9, h: 1.1,  kind: 'crateWall' },
  { x: -1.5, z: -60, w: 1.6, d: 0.8, h: 1.1, kind: 'crateWall' },  // 관문 통로
  { x: 1.5,  z: -66, w: 1.4, d: 0.8, h: 1.05, kind: 'crateWall' },
  { x: -4, z: -80, w: 1.8, d: 0.9, h: 1.1,  kind: 'crateWall' },   // 회랑 홀
  { x: 3,  z: -88, w: 1.8, d: 0.9, h: 1.1,  kind: 'crateWall' },
  { x: -6, z: -96, w: 2.0, d: 0.9, h: 1.15, kind: 'lowWall' },
  { x: 4,  z: -103, w: 2.0, d: 0.9, h: 1.15, kind: 'lowWall' },
  { x: -3, z: -108, w: 2.0, d: 0.9, h: 1.15, kind: 'lowWall' },
  { x: -6, z: -120, w: 2.4, d: 1.0, h: 1.2,  kind: 'rubbleL' },    // 보스룸
  { x: 6,  z: -120, w: 2.4, d: 1.0, h: 1.2,  kind: 'rubbleR' },
  { x: 0,  z: -116, w: 2.6, d: 1.1, h: 1.1,  kind: 'brokenAltar' },
];

// ── 킬게이트 문: 존 클리어 시 열림 ──
export const GATES = [
  { id: 'gate_plaza', x: 0, z: -52,  w: 4.7, h: 4.4 },   // 폭풍의 관문 철문
  { id: 'gate_boss',  x: 0, z: -112, w: 5.2, h: 4.6 },   // 근정전 보스룸 문
];

// ── 스폰 프리셋 (존 앵커 기준, -Z 전방) ──
export const SPAWN_PRESETS = {
  FC: [0, 0, -12], FL: [-5, 0, -10], FR: [5, 0, -10],
  FC2: [0, 0, -16], FL2: [-7, 0, -14], FR2: [7, 0, -14],
  HIGH_L: [-3.5, 3.2, -11], HIGH_R: [3.5, 3.2, -11],
};

// ── 존 (전투 구역) ──
// bounds: 플레이어 z 진입 판정. anchor: 스폰 기준점. clearGate: 클리어 시 열리는 문.
export const ZONES = [
  {
    id: 'Z1', name: '광화문 광장', objective: '광장의 요괴 군세를 소탕하고 관문을 열어라',
    fieldType: 'open', enterZ: 6, anchor: [0, 0, -22],
    clearGate: 'gate_plaza',
    waves: [
      [ { type: 'grunt', dir: 'FL', delay: 0.5 }, { type: 'grunt', dir: 'FC', delay: 1.5 }, { type: 'grunt', dir: 'FR', delay: 2.5 } ],
      [ { type: 'grunt', dir: 'FC' , delay: 0 }, { type: 'marksman', dir: 'FL', delay: 1.5, flightMs: 1500 }, { type: 'grunt', dir: 'FR2', delay: 2.5 } ],
      [ { type: 'grunt', dir: 'FL', delay: 0 }, { type: 'grunt', dir: 'FR', delay: 0.7 }, { type: 'grunt', dir: 'FC2', delay: 1.4 },
        { type: 'marksman', dir: 'FL2', delay: 2.5 }, { type: 'marksman', dir: 'FR2', delay: 4.5 }, { type: 'grunt', dir: 'FC', delay: 5 } ],
    ],
    ultShowcase: 2, clearReward: { ammoRefill: true, grenade: 1 },
  },
  {
    id: 'Z2', name: '관문 통로', objective: '통로를 소탕하며 전진하라',
    fieldType: 'close', enterZ: -54, anchor: [0, 0, -58],
    waves: [
      [ { type: 'grunt', dir: 'FC', delay: 0.4 }, { type: 'grunt', dir: 'FL', delay: 1.4 }, { type: 'marksman', dir: 'FC2', delay: 2.6, aimIntervalMs: 4000 } ],
      [ { type: 'grunt', dir: 'FC', delay: 0 }, { type: 'marksman', dir: 'FL2', delay: 1.5, aimIntervalMs: 3500 }, { type: 'thrower', dir: 'FC2', delay: 3 } ],
    ],
    clearReward: { item: 'smoke', count: 1, grenade: 1 },
  },
  {
    id: 'Z3', name: '경복궁 회랑', objective: '회랑을 돌파해 근정전으로 향하라',
    fieldType: 'close', enterZ: -72, anchor: [-1, 0, -80],
    waves: [
      [ { type: 'grunt', dir: 'FC', delay: 0.4 }, { type: 'grunt', dir: 'FR', delay: 1.2 }, { type: 'marksman', dir: 'FC2', delay: 2.4, aimIntervalMs: 3500 } ],
      [ { type: 'shield', dir: 'FC2', delay: 0 }, { type: 'grunt', dir: 'FR', delay: 1 }, { type: 'marksman', dir: 'FR2', delay: 2.2, aimIntervalMs: 3200 } ],
      [ { type: 'marksman', dir: 'FC', delay: 0, aimIntervalMs: 3200 }, { type: 'thrower', dir: 'FR2', delay: 1.6 }, { type: 'grunt', dir: 'FL', delay: 2.6 }, { type: 'grunt', dir: 'FC2', delay: 3.4 } ],
    ],
    clearReward: { item: 'tonic', count: 1, ammoRefill: true, 
                   vignette: '제단의 힘이 깃든 천마도를 얻었다 — 의식탄은 결정적 순간에만' },
  },
  {
    id: 'Z4', name: '근정전 앞뜰', objective: '앞뜰을 소탕해 보스룸 문을 열어라',
    fieldType: 'close', enterZ: -94, anchor: [0, 0, -101],
    clearGate: 'gate_boss',
    waves: [
      [ { type: 'grunt', dir: 'FL', delay: 0.5 }, { type: 'grunt', dir: 'FR', delay: 1.2 }, { type: 'marksman', dir: 'FC', delay: 2.2, aimIntervalMs: 3200 } ],
    ],
    clearReward: { item: 'tonic', count: 1 },
  },
  {
    id: 'Z5', name: '근정전 보스룸', objective: '해태를 격파하라',
    fieldType: 'close', enterZ: -113, anchor: [0, 0, -120],
    boss: 'gobungi', waves: [],
  },
];

export const PLAYER_START = [0, 0, 4];
