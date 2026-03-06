// src/systems/missions/PlayerMission.js

const MISSION_STATUS = {
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
  FAILED:      'failed',
};

class PlayerMission {
  constructor(definition) {
    this.missionId   = definition.missionId;
    this.type        = definition.type;
    this.title       = definition.title;
    this.description = definition.description;
    this.zone        = definition.zone;
    this.reward      = definition.reward || { currency: 0 };
    this.gameConfig  = definition.gameConfig || null;
    this.stayConfig  = definition.stayConfig || null;
    this.isFake      = definition.isFake    || false;

    this.status      = MISSION_STATUS.PENDING;
    this.startedAt   = null;
    this.completedAt = null;

    // STAY 미션용
    this.stayStartedAt  = null;
    this.stayElapsed    = 0;
  }

  start() {
    if (this.status !== MISSION_STATUS.PENDING) return false;
    this.status    = MISSION_STATUS.IN_PROGRESS;
    this.startedAt = Date.now();
    return true;
  }

  complete() {
    if (this.isFake) return false;
    this.status      = MISSION_STATUS.COMPLETED;
    this.completedAt = Date.now();
    return true;
  }

  fail() {
    this.status = MISSION_STATUS.FAILED;
  }

  // STAY 미션: 구역 진입 시 타이머 시작
  enterZone() {
    if (this.type !== 'stay') return;
    this.stayStartedAt = Date.now();
    this.start();
  }

  // STAY 미션: 구역 이탈 시 누적 시간 저장
  leaveZone() {
    if (!this.stayStartedAt) return;
    this.stayElapsed  += (Date.now() - this.stayStartedAt) / 1000;
    this.stayStartedAt = null;
  }

  // STAY 미션: 현재까지 누적 시간 반환
  getStayProgress() {
    let elapsed = this.stayElapsed;
    if (this.stayStartedAt) {
      elapsed += (Date.now() - this.stayStartedAt) / 1000;
    }
    const required = this.stayConfig?.requiredSeconds || 0;
    return { elapsed, required, percent: Math.min(100, (elapsed / required) * 100) };
  }

  isStayComplete() {
    const { elapsed, required } = this.getStayProgress();
    return elapsed >= required;
  }

  toClientInfo() {
    return {
      missionId:   this.missionId,
      type:        this.type,
      title:       this.title,
      description: this.description,
      zone:        this.zone,
      status:      this.status,
      gameConfig:  this.isFake ? null : this.gameConfig,
      stayConfig:  this.isFake ? null : this.stayConfig,
      isFake:      this.isFake,
    };
  }
}

module.exports = { PlayerMission, MISSION_STATUS };