// server/systems/TeamSystem.js
//
// 팀 구성, 역할 전환, 공수전환 처리
// - 경찰도둑: 도둑이 잡히면 경찰로 전환 (canSwitchTo)
// - 감염 게임: 시민이 감염되면 좀비팀으로 전환 (changeTeam)
// - 라이어게임: 역할 교환 (swapRoles)

'use strict';

const EventBus = require('../engine/EventBus');

class TeamSystem {
  constructor() {
    // { roomId: TeamSession }
    this.sessions = new Map();
  }

  // ── 초기화 ──────────────────────────────────────────
  initRoom(roomId) {
    this.sessions.set(roomId, {
      teamScores: new Map(), // { teamId: score }
      switchLog:  [],        // 역할 전환 기록
    });
  }

  cleanupRoom(roomId) {
    this.sessions.delete(roomId);
  }

  // ── 팀 구성 (게임 시작 시 Plugin이 호출) ─────────────
  setupTeams(room, roleAssignments) {
    // roleAssignments: Map<userId, { roleId, team }>
    for (const [userId, assignment] of roleAssignments) {
      const player  = room.getPlayer(userId);
      if (!player) continue;
      player.roleId = assignment.roleId;
      player.team   = assignment.team;
    }
  }

  // ── 역할 전환 (canSwitchTo 트리거) ───────────────────
  // 예: 도둑이 잡혀서 경찰이 됨
  switchRole(room, player, newRoleId) {
    const plugin     = require('../games/GamePluginRegistry').get(room.gameType);
    const newRoleDef = plugin.getRoleDefinitions().find(r => r.id === newRoleId);

    if (!newRoleDef) throw new Error(`역할 정의 없음: ${newRoleId}`);

    const prevRoleId = player.roleId;
    const prevTeam   = player.team;

    player.roleId = newRoleDef.id;
    player.team   = newRoleDef.team;

    const session = this.sessions.get(room.roomId);
    if (session) {
      session.switchLog.push({
        userId:    player.userId,
        nickname:  player.nickname,
        prevRoleId,
        newRoleId,
        prevTeam,
        newTeam:   newRoleDef.team,
        timestamp: Date.now(),
      });
    }

    EventBus.emit('role_switched', { room, player, prevRoleId, newRoleId });
    console.log(`[TeamSystem] ${player.nickname}: ${prevRoleId} → ${newRoleId}`);

    return { prevRoleId, newRoleId, newTeam: newRoleDef.team };
  }

  // ── 팀 변경 (감염 등) ─────────────────────────────────
  changeTeam(room, player, newTeam) {
    const plugin     = require('../games/GamePluginRegistry').get(room.gameType);
    const prevTeam   = player.team;

    // 새 팀에서 기본 역할 찾기
    const newRoleDef = plugin.getRoleDefinitions()
      .find(r => r.team === newTeam && r.isDefault);

    const prevRoleId = player.roleId;
    player.team   = newTeam;
    if (newRoleDef) player.roleId = newRoleDef.id;

    EventBus.emit('team_changed', { room, player, prevTeam, newTeam });
    return { prevTeam, newTeam };
  }

  // ── 역할 교환 (swap) ──────────────────────────────────
  swapRoles(room, playerA, playerB) {
    const roleA = playerA.roleId;
    const teamA = playerA.team;

    playerA.roleId = playerB.roleId;
    playerA.team   = playerB.team;
    playerB.roleId = roleA;
    playerB.team   = teamA;

    EventBus.emit('roles_swapped', { room, playerA, playerB });
    return { playerANewRole: playerA.roleId, playerBNewRole: playerB.roleId };
  }

  // ── 팀 점수 ──────────────────────────────────────────
  addScore(roomId, teamId, points) {
    const session = this.sessions.get(roomId);
    if (!session) return;
    const current = session.teamScores.get(teamId) || 0;
    session.teamScores.set(teamId, current + points);
    return current + points;
  }

  getTeamScore(roomId, teamId) {
    return this.sessions.get(roomId)?.teamScores.get(teamId) || 0;
  }

  getAllScores(roomId) {
    return Object.fromEntries(this.sessions.get(roomId)?.teamScores || []);
  }

  // ── 팀별 생존 플레이어 ────────────────────────────────
  getAlivePlayers(room, teamId) {
    return [...room.players.values()].filter(p => p.isAlive && p.team === teamId);
  }

  getSwitchLog(roomId) {
    return this.sessions.get(roomId)?.switchLog || [];
  }
}

module.exports = new TeamSystem();