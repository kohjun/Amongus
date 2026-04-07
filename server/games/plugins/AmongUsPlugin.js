// server/games/plugins/AmongUsPlugin.js
'use strict';

const GamePlugin = require('../GamePlugin');

class AmongUsPlugin extends GamePlugin {

  get gameType()    { return 'among_us'; }
  get displayName() { return '어몽어스 오프라인'; }
  get category()    { return 'hybrid'; }
  get minPlayers()  { return 4; }
  get maxPlayers()  { return 10; }

  // ── 모듈 선택 ─────────────────────────────────────
  get requiredModules() {
    return ['proximity', 'vote', 'mission', 'item'];
    // round, tag, team 은 불필요
  }

  // ── 역할 정의 ─────────────────────────────────────
  getRoleDefinitions() {
    return [
      {
        id:        'crew',
        name:      '크루원',
        team:      'crew',
        isDefault: true,
        isPublic:  false,
        abilities: [
          {
            abilityType:   'investigate', // 탐지기 아이템 사용 시
            allowedPhases: ['playing'],
            range:         5.0,
            cooldown:      0,
          },
        ],
        canSwitchTo:     [],
        knowledgeFilter: 'crew',
      },
      {
        id:        'impostor',
        name:      '임포스터',
        team:      'impostor',
        isDefault: true,
        isPublic:  false,
        abilities: [
          {
            abilityType:   'kill',
            allowedPhases: ['playing'],
            range:         1.5,   // UWB 기준 (BLE는 3.0)
            cooldown:      30,
          },
        ],
        canSwitchTo:     [],
        knowledgeFilter: 'impostor',
      },
    ];
  }

  // ── 역할 배정 ─────────────────────────────────────
  assignRoles(players) {
    const count    = players.length <= 6 ? 1 : 2;
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const result   = new Map();

    shuffled.forEach((player, i) => {
      const roleId = i < count ? 'impostor' : 'crew';
      result.set(player.userId, {
        roleId,
        team: roleId === 'impostor' ? 'impostor' : 'crew',
      });
    });

    return result;
  }

  // ── 페이즈 설정 (round 모듈 미사용) ────────────────
  getPhaseConfig() { return null; }

  // ── 승리 조건 ─────────────────────────────────────
  checkWinCondition(room) {
    const aliveImpostors = [...room.players.values()]
      .filter(p => p.isAlive && p.team === 'impostor');
    const aliveCrew = [...room.players.values()]
      .filter(p => p.isAlive && p.team === 'crew');

    if (aliveImpostors.length === 0) {
      return { winner: 'crew', reason: 'impostor_ejected' };
    }
    if (aliveImpostors.length >= aliveCrew.length) {
      return { winner: 'impostor', reason: 'crew_outnumbered' };
    }
    if (room.completedMissions >= room.totalMissions && room.totalMissions > 0) {
      return { winner: 'crew', reason: 'all_tasks_done' };
    }
    return null;
  }

  // ── AI 시스템 프롬프트 ────────────────────────────
  getSystemPrompt(roleId, nickname) {
    const base = `너는 "${nickname}"의 전담 AI 게임 마스터야.
게임: 어몽어스 오프라인 버전 (실제 공간에서 플레이)
이 플레이어 역할: ${roleId === 'crew' ? '크루원' : '임포스터'}`;

    const guide = roleId === 'crew'
      ? `\n원칙: 임포스터 신원 절대 누설 금지. 미션 완료와 임포스터 탐지를 도와라.`
      : `\n원칙: 크루원 전용 정보 누설 금지. 은밀한 전략과 알리바이를 도와라.`;

    return base + guide + `\n답변: 3문장 이내, 한국어, 이모지 활용, 구체적 행동 지침 포함`;
  }

  // ── 게임 상태 컨텍스트 ────────────────────────────
  buildStateContext(room, player) {
    const isImpostor = player.team === 'impostor';
    const pct = room.totalMissions === 0
      ? 0 : Math.floor((room.completedMissions / room.totalMissions) * 100);

    const alivePlayers  = [...room.players.values()].filter(p => p.isAlive);
    const aliveImpost   = alivePlayers.filter(p => p.team === 'impostor');
    const aliveCrew     = alivePlayers.filter(p => p.team === 'crew');

    const lines = [
      `페이즈: ${room.status}`,
      `생존: ${alivePlayers.length}명 (전체)`,
      `미션 진행도: ${pct}%`,
      `현재 구역: ${player.zone || '이동 중'}`,
      `킬 발생: ${room.killLog?.length || 0}건`,
      `회의 횟수: ${room.meetingCount || 0}회`,
      `내 코인: ${player.currency || 0}`,
    ];

    if (isImpostor) {
      lines.push(`남은 크루원: ${aliveCrew.length}명`);
      const pendingTasks = player.tasks
        ?.filter(t => t.status !== 'completed' && t.isFake)
        .map(t => `${t.title}(${t.zone})`).join(', ');
      if (pendingTasks) lines.push(`위장 미션: ${pendingTasks}`);
    } else {
      const pendingTasks = player.tasks
        ?.filter(t => t.status !== 'completed' && !t.isFake)
        .map(t => `${t.title}(${t.zone})`).join(', ') || '없음';
      lines.push(`남은 미션: ${pendingTasks}`);
    }

    return lines.join('\n');
  }

  getCurrentPhase(room) {
    return room.status; // 'playing' | 'meeting' | 'ended'
  }
}

module.exports = new AmongUsPlugin();