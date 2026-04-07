// server/engine/GameEngine.js
//
// 게임 엔진 싱글톤 (v2.0)
// 방 생성·입장·시작, 킬·이동·회의·종료 등 모든 게임 흐름을 총괄합니다.
// SocketHandler.js와 EventSubscriber.js에서 require 후 바로 메서드를 호출합니다.

'use strict';

const { v4: uuidv4 } = require('uuid');
const Player         = require('./Player');
const EventBus       = require('./EventBus');
const ModuleFactory  = require('./ModuleFactory');

// ════════════════════════════════════════════════════════
//  GameRoom — 방 단위 상태 컨테이너 (내부 클래스)
// ════════════════════════════════════════════════════════

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

    // v2.0: 게임 타입 (GamePlugin 식별자)
    this.gameType  = settings.gameType || 'among_us';

    // v2.0: 모듈 인스턴스 (ModuleFactory가 주입)
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

    this.totalMissions     = 0;
    this.completedMissions = 0;
    this.killLog           = [];
    this.meetingCount      = 0;

    // v2.0: ability 쿨다운 맵 { `${userId}_${abilityType}`: timestamp }
    this._abilityCooldowns  = new Map();

    // 조건 보상 추적
    this._grantedConditions = new Set();
  }

  // ── 플레이어 관리 ────────────────────────────────────

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

  // ── 상태 조회 ────────────────────────────────────────

  get alivePlayers() {
    return [...this.players.values()].filter(p => p.isAlive);
  }

  get aliveImpostors() {
    return this.alivePlayers.filter(p => p.team === 'impostor');
  }

  get aliveCrew() {
    return this.alivePlayers.filter(p => p.team === 'crew');
  }

  getAliveByTeam(teamId) {
    return this.alivePlayers.filter(p => p.team === teamId);
  }

  // ── 승리 조건 체크 (GamePlugin 위임) ─────────────────

  checkWinCondition() {
    try {
      const registry = require('../games/GamePluginRegistry');
      const plugin   = registry.get(this.gameType);
      return plugin.checkWinCondition(this);
    } catch {
      // 플러그인 없으면 기본 어몽어스 로직 fallback
      if (this.aliveImpostors.length === 0)
        return { winner: 'crew', reason: 'impostor_ejected' };
      if (this.aliveImpostors.length >= this.aliveCrew.length)
        return { winner: 'impostor', reason: 'crew_outnumbered' };
      if (this.completedMissions >= this.totalMissions && this.totalMissions > 0)
        return { winner: 'crew', reason: 'all_tasks_done' };
      return null;
    }
  }

  // ── 직렬화 ───────────────────────────────────────────

  toPublicState() {
    return {
      roomId:            this.roomId,
      gameType:          this.gameType,
      status:            this.status,
      playerCount:       this.players.size,
      players:           [...this.players.values()].map(p => p.toPublicInfo()),
      totalMissions:     this.totalMissions,
      completedMissions: this.completedMissions,
      meetingCount:      this.meetingCount,
    };
  }
}

// ════════════════════════════════════════════════════════
//  GameEngine — 싱글톤 (방 전체를 관리)
// ════════════════════════════════════════════════════════

class GameEngine {
  constructor() {
    /** @type {Map<string, GameRoom>} */
    this.rooms = new Map();
  }

  // ── 방 생성 ──────────────────────────────────────────

  createRoom(hostUserId, settings = {}) {
    const room = new GameRoom({ hostUserId, settings });
    this.rooms.set(room.roomId, room);
    console.log(`[GameEngine] 방 생성: ${room.roomId} | 호스트: ${hostUserId}`);
    return room;
  }

  // ── 방 입장 ──────────────────────────────────────────
  // 반환: { room, player }

  joinRoom(roomId, { userId, nickname, socketId }) {
    const room   = this.getRoom(roomId);
    const player = room.addPlayer({ userId, nickname, socketId });

    EventBus.emit('player_joined', { room, player });
    return { room, player };
  }

  // ── 게임 시작 ─────────────────────────────────────────
  // 역할 배정 → 모듈 초기화 → 미션 배정 → game_started 이벤트

  startGame(roomId, hostUserId) {
    const room = this.getRoom(roomId);

    if (room.hostId !== hostUserId)
      throw new Error('호스트만 게임을 시작할 수 있습니다.');
    if (room.status !== GAME_STATUS.WAITING)
      throw new Error('이미 시작된 게임입니다.');
    if (room.players.size < 2)
      throw new Error('최소 2명이 필요합니다.');

    room.status = GAME_STATUS.STARTING;

    // 플러그인 → 역할 배정
    const registry = require('../games/GamePluginRegistry');
    const plugin   = registry.get(room.gameType);

    const roleMap = plugin.assignRoles([...room.players.values()]);
    for (const [uid, { roleId, team }] of roleMap) {
      const player = room.getPlayer(uid);
      if (player) player.assignRole(roleId, team);
    }

    // 모듈 초기화 (ProximitySystem, VoteSystem, MissionSystem, ItemSystem 등)
    room.modules = ModuleFactory.initModules(room, plugin);

    // 미션 배정
    const MissionSystem   = require('../systems/MissionSystem');
    room.totalMissions    = MissionSystem.assignMissions(room);

    room.status = GAME_STATUS.PLAYING;

    EventBus.emit('game_started', { room });
    console.log(`[GameEngine] 게임 시작: ${roomId} | 플레이어: ${room.players.size}명`);
    return room;
  }

  // ── 킬 ───────────────────────────────────────────────
  // 반환: { blocked: boolean, target: Player }

  handleKill(roomId, killerId, targetId) {
    const room = this.getRoom(roomId);

    if (room.status !== GAME_STATUS.PLAYING)
      throw new Error('게임 진행 중이 아닙니다.');

    const killer = room.getPlayer(killerId);
    if (!killer?.isAlive)
      throw new Error('살아있지 않습니다.');
    if (killer.team !== 'impostor')
      throw new Error('임포스터만 킬할 수 있습니다.');

    const target = room.getPlayer(targetId);
    if (!target?.isAlive)
      throw new Error('대상이 이미 죽어있습니다.');

    // 쿨다운 체크
    const cooldownKey = `${killerId}_kill`;
    const lastKill    = room._abilityCooldowns.get(cooldownKey);
    if (lastKill) {
      const elapsed = Date.now() - lastKill;
      if (elapsed < room.settings.killCooldown * 1000) {
        const remaining = Math.ceil((room.settings.killCooldown * 1000 - elapsed) / 1000);
        throw new Error(`킬 쿨다운 중입니다. (${remaining}초 남음)`);
      }
    }

    // 근접 거리 체크
    const ProximitySystem = require('../systems/ProximitySystem');
    const proximity       = ProximitySystem.canKill(roomId, killerId, targetId);
    if (!proximity.possible)
      throw new Error('대상이 킬 범위 밖에 있습니다.');

    // 방탄조끼 체크
    const ItemSystem = require('../systems/ItemSystem');
    const isBlocked  = ItemSystem.checkBulletproof(room, target);

    if (isBlocked) {
      EventBus.emit('kill_blocked', { room, impostor: killer, target });
      return { blocked: true, target };
    }

    // 킬 처리
    target.die();
    room._abilityCooldowns.set(cooldownKey, Date.now());
    room.killLog.push({
      killerId,
      targetId,
      zone:      target.zone,
      timestamp: Date.now(),
    });

    EventBus.emit('player_killed', { room, impostor: killer, target });
    return { blocked: false, target };
  }

  // ── 이동 ─────────────────────────────────────────────

  handleMove(roomId, userId, zone) {
    const room   = this.getRoom(roomId);
    const player = room.getPlayer(userId);
    if (!player) throw new Error('플레이어를 찾을 수 없습니다.');

    player.zone     = zone;
    player.lastSeen = Date.now();

    EventBus.emit('player_moved', { room, player, zone });
  }

  // ── 근접 거리 업데이트 ────────────────────────────────

  handleProximityUpdate(roomId, fromId, toId, distanceM) {
    const room = this.getRoom(roomId);

    const from = room.getPlayer(fromId);
    if (from) from.updateDistance(toId, distanceM);

    const to = room.getPlayer(toId);
    if (to) to.updateDistance(fromId, distanceM);
  }

  // ── 회의 소집 ─────────────────────────────────────────
  // SocketHandler에서 VoteSystem.validateMeeting() 먼저 검증 후 이 메서드 호출

  handleMeeting(roomId, callerId, bodyId) {
    const room = this.getRoom(roomId);

    if (room.status !== GAME_STATUS.PLAYING)
      throw new Error('게임 진행 중이 아닐 때는 회의를 소집할 수 없습니다.');

    const caller = room.getPlayer(callerId);
    if (!caller) throw new Error('플레이어를 찾을 수 없습니다.');

    const reason = bodyId ? 'report' : 'emergency';

    room.status = GAME_STATUS.MEETING;
    room.meetingCount++;

    // VoteSystem 세션 시작 (토론 타이머 자동 실행)
    const VoteSystem = require('../systems/VoteSystem');
    VoteSystem.startMeeting(room, { callerId, bodyId, reason });

    // EventSubscriber가 meeting_called를 받아 클라이언트에 meeting_started 브로드캐스트
    EventBus.emit('meeting_called', { room, caller, bodyId, reason });
  }

  // ── 게임 종료 ─────────────────────────────────────────

  endGame(roomId, result) {
    const room = this.getRoom(roomId);

    room.status = GAME_STATUS.ENDED;

    // 모듈 정리 (타이머, 세션 등)
    ModuleFactory.cleanupModules(room);

    EventBus.emit('game_ended', { room, result });
    console.log(`[GameEngine] 게임 종료: ${roomId} | 승자: ${result.winner} (${result.reason})`);
  }

  // ── 방 조회 ───────────────────────────────────────────

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`방을 찾을 수 없습니다: ${roomId}`);
    return room;
  }

  // ── 방 삭제 ───────────────────────────────────────────

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }
}

module.exports = new GameEngine();
