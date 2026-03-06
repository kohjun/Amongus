// src/systems/items/itemDefinitions.js

const ITEM_TARGET = {
  ALL:       'all',        // 공용
  CREW:      'crew',       // 크루원 전용
  IMPOSTOR:  'impostor',   // 임포스터 전용
};

const EFFECT_TYPE = {
  HIDE_LOCATION:    'hide_location',    // 위치 숨김
  REVEAL_MAP:       'reveal_map',       // 지도 공개
  BULLETPROOF:      'bulletproof',      // 킬 무효
  DETECT_IMPOSTOR:  'detect_impostor',  // 임포스터 감지
  DISGUISE:         'disguise',         // 크루원 위장
  JAMMING:          'jamming',          // 미션 방해
};

const ITEMS = {
  smoke_bomb: {
    itemId:      'smoke_bomb',
    name:        '연막탄',
    description: '5초간 내 위치 정보가 다른 플레이어에게 숨겨집니다.',
    icon:        '💨',
    price:       80,
    target:      ITEM_TARGET.ALL,
    effect: {
      type:       EFFECT_TYPE.HIDE_LOCATION,
      durationMs: 5000,
    },
  },

  map: {
    itemId:      'map',
    name:        '지도',
    description: '30초간 모든 생존자의 현재 구역이 표시됩니다.',
    icon:        '🗺️',
    price:       120,
    target:      ITEM_TARGET.CREW,
    effect: {
      type:       EFFECT_TYPE.REVEAL_MAP,
      durationMs: 30000,
    },
  },

  bulletproof_vest: {
    itemId:      'bulletproof_vest',
    name:        '방탄조끼',
    description: '다음 킬 시도를 1회 무효화합니다.',
    icon:        '🛡️',
    price:       150,
    target:      ITEM_TARGET.CREW,
    effect: {
      type:       EFFECT_TYPE.BULLETPROOF,
      durationMs: null,  // 조건 발동형 (킬 시도 시)
    },
  },

  detector: {
    itemId:      'detector',
    name:        '탐지기',
    description: '30초간 주변 5m 이내 임포스터를 감지합니다.',
    icon:        '📡',
    price:       200,
    target:      ITEM_TARGET.CREW,
    effect: {
      type:       EFFECT_TYPE.DETECT_IMPOSTOR,
      durationMs: 30000,
      radius:     5.0,
    },
  },

  disguise: {
    itemId:      'disguise',
    name:        '변장',
    description: '30초간 크루원으로 위장합니다. 탐지기에 잡히지 않습니다.',
    icon:        '🎭',
    price:       180,
    target:      ITEM_TARGET.IMPOSTOR,
    effect: {
      type:       EFFECT_TYPE.DISGUISE,
      durationMs: 30000,
    },
  },

  jammer: {
    itemId:      'jammer',
    name:        '방해전파',
    description: '현재 구역의 모든 미션을 30초간 진행 불가 상태로 만듭니다.',
    icon:        '📵',
    price:       160,
    target:      ITEM_TARGET.IMPOSTOR,
    effect: {
      type:       EFFECT_TYPE.JAMMING,
      durationMs: 30000,
    },
  },
};

// 조건부 아이템 지급 정의
const CONDITION_REWARDS = [
  {
    conditionId:  'first_kill',
    description:  '첫 번째 킬 발생 (임포스터)',
    check: (room, player, event) =>
      event === 'kill' &&
      player.role === 'impostor' &&
      room.killLog.length === 1,
    reward: { itemId: 'smoke_bomb', quantity: 1 },
  },
  {
    conditionId:  'task_streak_3',
    description:  '미션 3개 연속 완료',
    check: (room, player, event) =>
      event === 'task_completed' &&
      (room.consecutiveTasks?.[player.userId] || 0) % 3 === 0,
    reward: { itemId: 'map', quantity: 1 },
  },
  {
    conditionId:  'innocent_votes_3',
    description:  '회의에서 무고 투표 3회 이상',
    check: (room, player, event) =>
      event === 'vote_result' &&
      (room.innocentVotes?.[player.userId] || 0) >= 3,
    reward: { itemId: 'detector', quantity: 1 },
  },
  {
    conditionId:  'correct_accusation',
    description:  '임포스터를 첫 번째로 지목해서 추방 성공',
    check: (room, player, event) =>
      event === 'vote_result' &&
      room.firstCorrectAccuser === player.userId,
    reward: { currency: 50 },
  },
];

module.exports = { ITEMS, ITEM_TARGET, EFFECT_TYPE, CONDITION_REWARDS };