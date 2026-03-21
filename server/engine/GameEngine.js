// server/engine/GameRoom.js v2.0

'use strict';

const { v4: uuidv4 } = require('uuid');
const Player         = require('./Player');

const GAME_STATUS = {
  WAITING:  'waiting',
  STARTING: 'starting',
  PLAYING:  'playing',
  MEETING:  'meeting',
  ENDED:    'ended',
};

class GameRoom {
  constructor({ hostUserId, settings = {} }) {
    this.roomId    = uuidv4();
    this.hostId    = hostUserId;
    this.status    = GAME_STATUS.WAITING;
    this.createdAt = Date.now();

    // ★ v2.0: 게임 타입 (GamePlugin 식별자)
    this.gameType  = settings.gameType || 'among_us';

    // ★ v2.0: 모듈 인스턴스 (ModuleFactory가 주입)
    // { proximity, vote, mission, item, tag, round, team }
    this.modules   = {};

    this.players   = new Map();

    this.settings  = {
      maxPlayers:     settings.maxPlayers     || 10,
      impostorCount:  settings.impostorCount  || null,
      missionPerCrew: settings.missionPerCrew || 3,
      killCooldown:   settings.killCooldown   || 30,
      discussionTime: settings.discussionTime || 90,
      voteTime:       settings.voteTime       || 30,
    };

    // 미션 카운터 (MissionSystem용)
    this.totalMissions     = 0;
    this.completedMissions = 0;

    // 킬 로그
    this.killLog     = [];
    this.meetingCount = 0;

    // ★ v2.0: ability 쿨다운 맵 { `${userId}_${abilityType}`: timestamp }
    this._abilityCooldowns = new Map();

    // 조건 보상 추적
    this._grantedConditions = new Set();
  }

  // ── 플레이어 관리 ──────────────────────────────────

  addPlayer(playerInfo) {
    if (this.players.size >= this.settings.maxPlayers)
      throw new Error('방이 꽉 찼습니다.');
    if (this.status !== GAME_STATUS.WAITING)
      throw new Error('이미 게임이 시작됐습니다.');

    const player = new Player(playerInfo);
    if (this.players.size === 0) player.isHost = true;
    this.players.set(player.userId, player);
    return player;
  }

  removePlayer(userId) { this.players.delete(userId); }

  getPlayer(userId)    { return this.players.get(userId); }

  // ── 역할 배정 (GamePlugin 위임) ───────────────────
  // GameEngine.startGame()에서 Plugin.assignRoles()를 받아 처리

  // ── 상태 조회 ──────────────────────────────────────

  get alivePlayers() {
    return [...this.players.values()].filter(p => p.isAlive);
  }

  // ★ v2.0: team 기반으로 조회
  get aliveImpostors() {
    return this.alivePlayers.filter(p => p.team === 'impostor');
  }

  get aliveCrew() {
    return this.alivePlayers.filter(p => p.team === 'crew');
  }

  getAliveByTeam(teamId) {
    return this.alivePlayers.filter(p => p.team === teamId);
  }

  // ── 승리 조건 체크 (GamePlugin 위임) ─────────────

  checkWinCondition() {
    try {
      const registry = require('../games/GamePluginRegistry');
      const plugin   = registry.get(this.gameType);
      return plugin.checkWinCondition(this);
    } catch {
      // 플러그인 없으면 기존 어몽어스 로직 fallback
      if (this.aliveImpostors.length === 0)
        return { winner: 'crew', reason: 'impostor_ejected' };
      if (this.aliveImpostors.length >= this.aliveCrew.length)
        return { winner: 'impostor', reason: 'crew_outnumbered' };
      if (this.completedMissions >= this.totalMissions && this.totalMissions > 0)
        return { winner: 'crew', reason: 'all_tasks_done' };
      return null;
    }
  }

  // ── 직렬화 ─────────────────────────────────────────

  toPublicState() {
    return {
      roomId:            this.roomId,
      gameType:          this.gameType,   // ★ v2.0 추가
      status:            this.status,
      playerCount:       this.players.size,
      players:           [...this.players.values()].map(p => p.toPublicInfo()),
      totalMissions:     this.totalMissions,
      completedMissions: this.completedMissions,
      meetingCount:      this.meetingCount,
    };
  }
}

module.exports = { GameRoom, GAME_STATUS };