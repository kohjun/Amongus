// src/engine/GameRoom.js

const { v4: uuidv4 } = require('uuid');
const Player = require('./Player');

const GAME_STATUS = {
  WAITING:  'waiting',   // 대기 중
  STARTING: 'starting',  // 역할 배정 중
  PLAYING:  'playing',   // 게임 진행 중
  MEETING:  'meeting',   // 긴급회의 중
  ENDED:    'ended',     // 게임 종료
};

class GameRoom {
  constructor({ hostUserId, settings = {} }) {
    this.roomId    = uuidv4();
    this.hostId    = hostUserId;
    this.status    = GAME_STATUS.WAITING;
    this.createdAt = Date.now();

    // 플레이어 맵 { userId: Player }
    this.players = new Map();

    // 설정
    this.settings = {
      maxPlayers:      settings.maxPlayers      || 10,
      impostorCount:   settings.impostorCount   || null, // null이면 자동
      missionPerCrew:  settings.missionPerCrew  || 3,
      killCooldown:    settings.killCooldown    || 30,   // 초
      discussionTime:  settings.discussionTime  || 90,   // 초
      voteTime:        settings.voteTime        || 30,   // 초
    };

    // 게임 상태
    this.totalMissions    = 0;
    this.completedMissions = 0;
    this.killLog          = [];   // 킬 기록
    this.meetingCount     = 0;
  }

  // ── 플레이어 관리 ──────────────────────────────────────

  addPlayer(playerInfo) {
    if (this.players.size >= this.settings.maxPlayers) {
      throw new Error('방이 꽉 찼습니다.');
    }
    if (this.status !== GAME_STATUS.WAITING) {
      throw new Error('이미 게임이 시작됐습니다.');
    }

    const player = new Player(playerInfo);
    if (this.players.size === 0) player.isHost = true;

    this.players.set(player.userId, player);
    return player;
  }

  removePlayer(userId) {
    this.players.delete(userId);
  }

  getPlayer(userId) {
    return this.players.get(userId);
  }

  // ── 역할 배정 ──────────────────────────────────────────

  assignRoles() {
    const all = [...this.players.values()];

    // 임포스터 수 자동 계산
    const count = this.settings.impostorCount
      || (all.length <= 6 ? 1 : 2);

    // 셔플
    const shuffled = all.sort(() => Math.random() - 0.5);

    shuffled.forEach((player, index) => {
      player.assignRole(index < count ? 'impostor' : 'crew');
    });
  }

  // ── 상태 조회 ──────────────────────────────────────────

  get alivePlayers() {
    return [...this.players.values()].filter(p => p.isAlive);
  }

  get aliveImpostors() {
    return this.alivePlayers.filter(p => p.role === 'impostor');
  }

  get aliveCrew() {
    return this.alivePlayers.filter(p => p.role === 'crew');
  }

  // ── 승리 조건 체크 ─────────────────────────────────────

  checkWinCondition() {
    // 임포스터 전원 추방 → 크루원 승리
    if (this.aliveImpostors.length === 0) {
      return { winner: 'crew', reason: 'impostor_ejected' };
    }

    // 임포스터 수 >= 크루원 수 → 임포스터 승리
    if (this.aliveImpostors.length >= this.aliveCrew.length) {
      return { winner: 'impostor', reason: 'crew_outnumbered' };
    }

    // 미션 전부 완료 → 크루원 승리
    if (this.completedMissions >= this.totalMissions && this.totalMissions > 0) {
      return { winner: 'crew', reason: 'all_tasks_done' };
    }

    return null; // 게임 계속
  }

  // ── 직렬화 ─────────────────────────────────────────────

  toPublicState() {
    return {
      roomId:             this.roomId,
      status:             this.status,
      playerCount:        this.players.size,
      players:            [...this.players.values()].map(p => p.toPublicInfo()),
      totalMissions:      this.totalMissions,
      completedMissions:  this.completedMissions,
      meetingCount:       this.meetingCount,
    };
  }
}

module.exports = { GameRoom, GAME_STATUS };