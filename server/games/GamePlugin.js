// server/games/GamePlugin.js
//
// 모든 게임 플러그인이 구현해야 하는 추상 인터페이스입니다.
// 새 게임을 추가할 때 이 클래스를 상속하고 모든 메서드를 구현합니다.
//
// 사용 예:
//   class MafiaPlugin extends GamePlugin { ... }
//   GamePluginRegistry.register(new MafiaPlugin())

'use strict';

class GamePlugin {
  constructor() {
    if (new.target === GamePlugin) {
      throw new Error('GamePlugin은 직접 인스턴스화할 수 없습니다. 상속하여 사용하세요.');
    }
  }

  // ══════════════════════════════════════════════════
  //  1. 게임 정체성
  // ══════════════════════════════════════════════════

  /** 게임 고유 식별자 (벡터 DB game_type 필터 키) */
  get gameType()    { this._abstract('gameType'); }

  /** 사용자에게 표시되는 게임 이름 */
  get displayName() { this._abstract('displayName'); }

  /** 게임 유형: 'hybrid' | 'verbal' | 'chase' */
  get category()    { this._abstract('category'); }

  get minPlayers()  { return 4; }
  get maxPlayers()  { return 10; }

  // ══════════════════════════════════════════════════
  //  2. 모듈 선택 (핵심)
  //     GameEngine이 이 목록을 보고 필요한 모듈만 초기화합니다.
  // ══════════════════════════════════════════════════

  /**
   * 이 게임에서 사용할 시스템 모듈 목록
   * @returns {string[]} 모듈 ID 배열
   *
   * 사용 가능한 모듈:
   *   'proximity' - UWB/BLE 거리 측정
   *   'vote'      - 투표 세션
   *   'mission'   - 미션 수행
   *   'item'      - 아이템/재화
   *   'tag'       - 포획/태그
   *   'round'     - 페이즈/라운드 사이클
   *   'team'      - 팀 구성/역할 전환
   */
  get requiredModules() { this._abstract('requiredModules'); }

  // ══════════════════════════════════════════════════
  //  3. 역할 정의
  // ══════════════════════════════════════════════════

  /**
   * 게임에서 사용하는 역할 목록
   * @returns {RoleDefinition[]}
   *
   * RoleDefinition 구조:
   * {
   *   id:              string,       고유 역할 ID
   *   name:            string,       표시 이름
   *   team:            string,       소속 팀 ID
   *   isDefault:       boolean,      팀 기본 역할 (팀 변경 시 배정)
   *   isPublic:        boolean,      역할 공개 여부
   *   abilities: [{                  보유 능력 목록
   *     abilityType:   string,       ABILITY_TYPE의 id
   *     allowedPhases: string[],     허용 페이즈 (빈 배열 = 항상)
   *     range:         number|null,  거리 조건 (null = 무관)
   *     cooldown:      number,       쿨다운(초)
   *     stunDuration:  number|null,  기절 지속(ms, STUN만)
   *   }],
   *   canSwitchTo:     string[],     포획/조건 시 전환 가능 역할
   *   knowledgeFilter: string,       RAG 검색 시 role 필터 값
   * }
   */
  getRoleDefinitions() { this._abstract('getRoleDefinitions'); }

  /**
   * 플레이어 목록을 받아 역할을 배정하고 Map을 반환합니다.
   * @param {Player[]} players
   * @returns {Map<userId, { roleId, team }>}
   */
  assignRoles(players) { this._abstract('assignRoles'); }

  // ══════════════════════════════════════════════════
  //  4. 페이즈/라운드 설정 (round 모듈 사용 시)
  // ══════════════════════════════════════════════════

  /**
   * RoundSystem에 주입할 페이즈 설정
   * @returns {PhaseConfig | null}  round 모듈 미사용 시 null
   *
   * PhaseConfig 구조:
   * {
   *   initialPhase: string,
   *   phases: [{
   *     id:          string,
   *     label:       string,
   *     duration:    number|null,  초 (null = 수동 전환)
   *     transitions: [{
   *       to:      string,
   *       trigger: 'timer' | 'manual' | 'condition',
   *     }],
   *   }],
   * }
   */
  getPhaseConfig() { return null; }

  // ══════════════════════════════════════════════════
  //  5. 승리 조건
  // ══════════════════════════════════════════════════

  /**
   * 승리 조건 체크
   * @param {GameRoom} room
   * @returns {{ winner: string, reason: string } | null}
   */
  checkWinCondition(room) { this._abstract('checkWinCondition'); }

  // ══════════════════════════════════════════════════
  //  6. AI 인터페이스
  // ══════════════════════════════════════════════════

  /**
   * 역할별 AI 시스템 프롬프트 (게임 성격, AI 페르소나 정의)
   * @param {string} roleId
   * @param {string} nickname
   * @returns {string}
   */
  getSystemPrompt(roleId, nickname) { this._abstract('getSystemPrompt'); }

  /**
   * 현재 게임 상태를 텍스트로 요약 (프롬프트 직접 주입용)
   * 역할에 따라 보여주는 정보가 달라야 합니다 (정보 비대칭).
   * @param {GameRoom} room
   * @param {Player}   player
   * @returns {string}
   */
  buildStateContext(room, player) { this._abstract('buildStateContext'); }

  /**
   * 현재 게임 페이즈 반환 (RAG phase 필터에 사용)
   * @param {GameRoom} room
   * @returns {string}
   */
  getCurrentPhase(room) {
    // round 모듈이 있으면 위임, 없으면 room.status 반환
    if (room.modules?.round) {
      return room.modules.round.getCurrentPhase(room.roomId);
    }
    return room.status;
  }

  /** 지식 베이스 폴더 이름 (server/ai/rag/knowledgeBase/ 하위) */
  get knowledgeDir() { return this.gameType; }

  // ══════════════════════════════════════════════════
  //  내부 유틸
  // ══════════════════════════════════════════════════

  _abstract(name) {
    throw new Error(`[${this.constructor.name}] ${name}()을 구현해야 합니다.`);
  }
}

module.exports = GamePlugin;