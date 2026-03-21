// server/systems/abilities/AbilityDefinitions.js
//
// 모든 게임에서 공통으로 쓸 수 있는 핵심 Ability 목록입니다.
// 각 GamePlugin은 RoleDefinition에서 이 중 필요한 것을 골라 선언합니다.
//
// 구조:
//   effect      → AbilityExecutor가 처리하는 실행 유형
//   blockableBy → ItemSystem이 차단 여부를 확인하는 아이템 목록

'use strict';

// ── effect 타입 상수 ──────────────────────────────────
const EFFECT = {
  ELIMINATE:      'eliminate',      // 게임에서 완전 제거 (킬)
  CAPTURE:        'capture',        // 포획 → canSwitchTo 트리거
  TEAM_CHANGE:    'team_change',    // 팀 변경 (감염)
  ROLE_EXCHANGE:  'role_exchange',  // 역할 교환 (swap)
  DISABLE:        'disable',        // 행동 불가 (기절)
  EXPOSE:         'expose',         // 역할 전체 공개
  PRIVATE_EXPOSE: 'private_expose', // 역할 개인 공개 (조사)
  SHIELD_OTHER:   'shield_other',   // 타인 보호
};

// ── 공통 Ability 정의 ────────────────────────────────
const ABILITY_TYPE = {

  // ── 제거 계열 ───────────────────────────────────────
  KILL: {
    id:          'kill',
    name:        '킬',
    description: '대상을 즉시 게임에서 제거합니다.',
    effect:      EFFECT.ELIMINATE,
    blockableBy: ['bulletproof_vest', 'shield'],
  },

  // ── 포획 계열 ───────────────────────────────────────
  CATCH: {
    id:          'catch',
    name:        '포획',
    description: '대상을 포획합니다. 역할 전환이 트리거될 수 있습니다.',
    effect:      EFFECT.CAPTURE,
    blockableBy: ['smoke_bomb'],
  },

  // ── 감염 계열 ───────────────────────────────────────
  INFECT: {
    id:          'infect',
    name:        '감염',
    description: '대상의 팀을 변경합니다.',
    effect:      EFFECT.TEAM_CHANGE,
    blockableBy: ['antidote'],
  },

  // ── 교환 계열 ───────────────────────────────────────
  SWAP: {
    id:          'swap',
    name:        '역할 교환',
    description: '자신과 대상의 역할을 교환합니다.',
    effect:      EFFECT.ROLE_EXCHANGE,
    blockableBy: [],
  },

  // ── 행동 제한 계열 ──────────────────────────────────
  STUN: {
    id:          'stun',
    name:        '기절',
    description: '대상을 일정 시간 행동 불가 상태로 만듭니다.',
    effect:      EFFECT.DISABLE,
    blockableBy: ['antistun'],
  },

  // ── 정보 계열 ───────────────────────────────────────
  REVEAL: {
    id:          'reveal',
    name:        '역할 공개',
    description: '대상의 역할을 모든 플레이어에게 공개합니다.',
    effect:      EFFECT.EXPOSE,
    blockableBy: ['disguise'],
  },

  INVESTIGATE: {
    id:          'investigate',
    name:        '조사',
    description: '대상의 팀 또는 역할을 자신에게만 공개합니다.',
    effect:      EFFECT.PRIVATE_EXPOSE,
    blockableBy: ['disguise'],
  },

  // ── 보호 계열 ───────────────────────────────────────
  PROTECT: {
    id:          'protect',
    name:        '보호',
    description: '대상의 다음 피격을 1회 무효화합니다.',
    effect:      EFFECT.SHIELD_OTHER,
    blockableBy: [],
  },
};

// ── RoleDefinition 내 ability 선언 구조 ──────────────
//
// {
//   abilityType:   'kill',          ABILITY_TYPE의 id
//   allowedPhases: ['playing'],     허용 페이즈 목록 ([] = 전체)
//   range:         1.5,             거리 조건 (null = 거리 무관)
//   cooldown:      30,              쿨다운(초), 0 = 없음
//   stunDuration:  null,            STUN effect 지속 시간(ms)
//   targetSelf:    false,           자신에게 사용 가능 여부
// }

module.exports = { ABILITY_TYPE, EFFECT };