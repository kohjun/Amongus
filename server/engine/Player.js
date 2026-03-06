// src/engine/Player.js

const { v4: uuidv4 } = require('uuid');

class Player {
  constructor({ userId, nickname, socketId }) {
    this.userId   = userId;
    this.nickname = nickname;
    this.socketId = socketId;

    // 역할 (게임 시작 전엔 null)
    this.role     = null;   // 'crew' | 'impostor'
    this.isAlive  = true;
    this.isHost   = false;

    // 위치
    this.zone     = null;   // 현재 구역
    this.lastSeen = null;   // 마지막 위치 업데이트 시간

    // 근접 데이터 (UWB/BLE)
    this.distances = {};    // { playerId: 거리(m) }

    // 미션
    this.tasks        = [];
    this.completedTasks = [];

    // 아이템/재화
    this.currency = 0;
    this.items    = [];     // [{ itemId, quantity }]
  }

  assignRole(role) {
    this.role = role;
  }

  die() {
    this.isAlive = false;
  }

  updateDistance(targetPlayerId, distanceM) {
    this.distances[targetPlayerId] = {
      distance: distanceM,
      updatedAt: Date.now(),
    };
  }

  canKill(targetPlayer) {
    if (this.role !== 'impostor') return false;
    if (!targetPlayer.isAlive)   return false;

    const record = this.distances[targetPlayer.userId];
    if (!record) return false;

    // 측정값이 5초 이상 지난 경우 무효
    const isStale = Date.now() - record.updatedAt > 5000;
    if (isStale) return false;

    const KILL_RANGE = 2.0; // 미터
    return record.distance <= KILL_RANGE;
  }

  toPublicInfo() {
    // 다른 플레이어에게 공개되는 정보 (역할 숨김)
    return {
      userId:   this.userId,
      nickname: this.nickname,
      isAlive:  this.isAlive,
      zone:     this.zone,
    };
  }

  toPrivateInfo() {
    // 본인에게만 보이는 정보
    return {
      ...this.toPublicInfo(),
      role:           this.role,
      tasks:          this.tasks,
      completedTasks: this.completedTasks,
      items:          this.items,
      currency:       this.currency,
    };
  }
}

module.exports = Player;