// server/engine/Player.js v2.0

'use strict';

const { v4: uuidv4 } = require('uuid');

class Player {
  constructor({ userId, nickname, socketId }) {
    this.userId   = userId;
    this.nickname = nickname;
    this.socketId = socketId;

    // ★ v2.0: roleId (GamePlugin이 정의한 역할 ID)
    this.roleId   = null;   // 'crew' | 'impostor' | 'mafia' | 'doctor' ...
    this.role     = null;   // 하위 호환용 (roleId와 동기화)

    // ★ v2.0: team (TeamSystem용)
    this.team     = null;   // 'crew' | 'impostor' | 'mafia' | 'citizen' ...

    this.isAlive  = true;
    this.isHost   = false;
    this.isStunned = false;  // ★ v2.0: STUN ability용

    this.zone     = null;
    this.lastSeen = null;
    this.distances = {};

    this.tasks          = [];
    this.completedTasks = [];

    this.currency = 0;
    this.items    = [];
  }

  // ★ v2.0: roleId와 role(하위호환) 동기화
  assignRole(roleId, team) {
    this.roleId = roleId;
    this.role   = roleId;   // 기존 코드 호환
    this.team   = team || roleId;
  }

  die() {
    this.isAlive = false;
  }

  updateDistance(targetPlayerId, distanceM) {
    this.distances[targetPlayerId] = { distance: distanceM, updatedAt: Date.now() };
  }

  toPublicInfo() {
    return {
      userId:   this.userId,
      nickname: this.nickname,
      isAlive:  this.isAlive,
      zone:     this.zone,
      // ★ v2.0: team은 공개 (역할은 숨김)
      team:     null, // 게임 종료 전까지 숨김
    };
  }

  toPrivateInfo() {
    return {
      ...this.toPublicInfo(),
      roleId:         this.roleId,
      role:           this.role,
      team:           this.team,
      tasks:          this.tasks,
      completedTasks: this.completedTasks,
      items:          this.items,
      currency:       this.currency,
    };
  }
}

module.exports = Player;