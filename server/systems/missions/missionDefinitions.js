// src/systems/missions/missionDefinitions.js

const MISSION_TYPE = {
  QR_SCAN:   'qr_scan',
  MINI_GAME: 'mini_game',
  STAY:      'stay',
};

// 전체 미션 풀
const MISSION_POOL = [
  // ── QR 스캔 미션 ──────────────────────────────────────
  {
    missionId:   'qr_cafeteria',
    type:         MISSION_TYPE.QR_SCAN,
    title:        '카페테리아 배식 확인',
    description:  '카페테리아로 이동해 배식구 QR을 스캔하세요.',
    zone:         'cafeteria',
    reward:       { currency: 10 },
    difficulty:   'easy',
  },
  {
    missionId:   'qr_engine',
    type:         MISSION_TYPE.QR_SCAN,
    title:        '엔진실 점검',
    description:  '엔진실로 이동해 제어판 QR을 스캔하세요.',
    zone:         'engine_room',
    reward:       { currency: 15 },
    difficulty:   'medium',
  },
  {
    missionId:   'qr_storage',
    type:         MISSION_TYPE.QR_SCAN,
    title:        '창고 재고 확인',
    description:  '창고로 이동해 재고 목록 QR을 스캔하세요.',
    zone:         'storage',
    reward:       { currency: 10 },
    difficulty:   'easy',
  },
  {
    missionId:   'qr_lab',
    type:         MISSION_TYPE.QR_SCAN,
    title:        '연구실 샘플 제출',
    description:  '연구실로 이동해 샘플 보관함 QR을 스캔하세요.',
    zone:         'lab',
    reward:       { currency: 20 },
    difficulty:   'hard',
  },

  // ── 미니게임 미션 ──────────────────────────────────────
  {
    missionId:    'mini_wiring',
    type:          MISSION_TYPE.MINI_GAME,
    title:         '배선 연결',
    description:   '색깔에 맞게 배선을 연결하세요. (30초 제한)',
    zone:          'electrical',
    gameConfig: {
      gameType:    'wiring',
      timeLimit:   30,
      colors:      ['red', 'blue', 'yellow', 'green'],
    },
    reward:        { currency: 15 },
    difficulty:    'medium',
  },
  {
    missionId:    'mini_slider',
    type:          MISSION_TYPE.MINI_GAME,
    title:         '엔진 출력 조정',
    description:   '슬라이더를 목표 구간에 맞추세요. (20초 제한)',
    zone:          'engine_room',
    gameConfig: {
      gameType:    'slider',
      timeLimit:   20,
      targetMin:   40,
      targetMax:   60,
    },
    reward:        { currency: 10 },
    difficulty:    'easy',
  },
  {
    missionId:    'mini_sequence',
    type:          MISSION_TYPE.MINI_GAME,
    title:         '보안 코드 입력',
    description:   '화면에 표시된 순서대로 버튼을 누르세요.',
    zone:          'security',
    gameConfig: {
      gameType:    'sequence',
      timeLimit:   25,
      length:      5,
    },
    reward:        { currency: 20 },
    difficulty:    'hard',
  },

  // ── 머물기 미션 ───────────────────────────────────────
  {
    missionId:    'stay_medbay',
    type:          MISSION_TYPE.STAY,
    title:         '의료실 검진',
    description:   '의료실에서 60초 동안 대기하세요.',
    zone:          'medbay',
    stayConfig: {
      requiredSeconds: 60,
    },
    reward:        { currency: 15 },
    difficulty:    'medium',
  },
  {
    missionId:    'stay_comms',
    type:          MISSION_TYPE.STAY,
    title:         '통신 복구',
    description:   '통신실에서 45초 동안 복구 작업을 수행하세요.',
    zone:          'comms',
    stayConfig: {
      requiredSeconds: 45,
    },
    reward:        { currency: 10 },
    difficulty:    'easy',
  },
];

// 임포스터용 가짜 미션 (실제로 완료 불가, UI만 보여줌)
const FAKE_MISSIONS = [
  {
    missionId:   'fake_wiring',
    type:         MISSION_TYPE.MINI_GAME,
    title:        '배선 연결',
    description:  '(위장용) 배선 연결하는 척 하세요.',
    zone:         'electrical',
    isFake:       true,
  },
  {
    missionId:   'fake_slider',
    type:         MISSION_TYPE.MINI_GAME,
    title:        '엔진 출력 조정',
    description:  '(위장용) 슬라이더를 조작하는 척 하세요.',
    zone:         'engine_room',
    isFake:       true,
  },
];

module.exports = { MISSION_POOL, FAKE_MISSIONS, MISSION_TYPE };