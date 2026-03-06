// src/engine/GameEngine.js

const { GameRoom, GAME_STATUS } = require('./GameRoom');
const MissionSystem  = require('../systems/MissionSystem');
const ItemSystem     = require('../systems/ItemSystem');
const VoteSystem     = require('../systems/VoteSystem');
const EventBus       = require('./EventBus');

class GameEngine {
  constructor() {
    // 활성 게임방 { roomId: GameRoom }
    this.rooms = new Map();
  }

  // ── 방 관리 ────────────────────────────────────────────

  createRoom(hostUserId, settings) {
    const room = new GameRoom({ hostUserId, settings });
    this.rooms.set(room.roomId, room);
    return room;
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('존재하지 않는 방입니다.');
    return room;
  }

  joinRoom(roomId, playerInfo) {
    const room   = this.getRoom(roomId);
    const player = room.addPlayer(playerInfo);
    EventBus.emit('player_joined', { room, player });
    return { room, player };
  }

  leaveRoom(roomId, userId) {
    const room   = this.getRoom(roomId);
    const player = room.getPlayer(userId);
    room.removePlayer(userId);
    EventBus.emit('player_left', { room, player });

    // 방이 비면 삭제
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  // ── 게임 시작 ──────────────────────────────────────────

  startGame(roomId, requesterId) {
    const room = this.getRoom(roomId);

    if (room.hostId !== requesterId) {
      throw new Error('방장만 게임을 시작할 수 있습니다.');
    }
    if (room.players.size < 4) {
      throw new Error('최소 4명이 필요합니다.');
    }

    // 역할 배정
    room.assignRoles();
    room.status = GAME_STATUS.PLAYING;

    // 미션 배정
    MissionSystem.assignMissions(room);

    EventBus.emit('game_started', { room });
    return room;
  }

  // ── 킬 처리 ────────────────────────────────────────────

  handleKill(roomId, impostorId, targetId) {
    const room      = this.getRoom(roomId);
    const impostor  = room.getPlayer(impostorId);
    const target    = room.getPlayer(targetId);

    if (!impostor || !target) throw new Error('플레이어를 찾을 수 없습니다.');
    if (!impostor.canKill(target)) throw new Error('킬 불가 상태입니다.');

    // ★ 방탄조끼 체크
    const ItemSystem = require('../systems/ItemSystem');
    const blocked    = ItemSystem.checkBulletproof(room, target);
    if (blocked) {
        EventBus.emit('kill_blocked', { room, impostor, target });
        return { blocked: true, target };
    }

    //정상 킬 처리
    target.die();
    room.killLog.push({
      impostorId,
      targetId,
      zone:      target.zone,
      timestamp: Date.now(),
    });

    // 킬 이후 임포스터 조건 보상 체크
    ItemSystem.checkConditions(room, impostor, 'kill');

    EventBus.emit('player_killed', { room, impostor, target });

    const result = room.checkWinCondition();
    if (result) this.endGame(roomId, result);

    return { blocked: false, target };
  }

  // ── 이동 처리 ──────────────────────────────────────────

  handleMove(roomId, userId, zone) {
    const room   = this.getRoom(roomId);
    const player = room.getPlayer(userId);

    if (!player || !player.isAlive) throw new Error('이동 불가 상태입니다.');

    const prevZone  = player.zone;
    player.zone     = zone;
    player.lastSeen = Date.now();

    EventBus.emit('player_moved', { room, player, prevZone, zone });
    return player;
  }

  // ── 근접 거리 업데이트 ─────────────────────────────────

  handleProximityUpdate(roomId, fromId, toId, distanceM) {
    const room   = this.getRoom(roomId);
    const player = room.getPlayer(fromId);
    if (player) player.updateDistance(toId, distanceM);
  }

  // ── 미션 완료 ──────────────────────────────────────────

  handleTaskComplete(roomId, userId, taskId) {
    const room   = this.getRoom(roomId);
    const player = room.getPlayer(userId);

    const result = MissionSystem.completeTask(room, player, taskId);

    EventBus.emit('task_completed', { room, player, taskId });

    // 아이템 조건 체크
    ItemSystem.checkConditions(room, player, 'task_completed');

    // 승리 조건 체크
    const winResult = room.checkWinCondition();
    if (winResult) this.endGame(roomId, winResult);

    return result;
  }

  // ── 긴급회의/신고 ──────────────────────────────────────

  handleMeeting(roomId, callerId, bodyId = null) {
    const room   = this.getRoom(roomId);
    const caller = room.getPlayer(callerId);

    if (room.status !== GAME_STATUS.PLAYING) {
      throw new Error('회의를 소집할 수 없는 상태입니다.');
    }

    room.status = GAME_STATUS.MEETING;
    room.meetingCount++;

    const reason = bodyId ? 'report' : 'emergency';
    EventBus.emit('meeting_called', { room, caller, bodyId, reason });

    // VoteSystem으로 위임
    return VoteSystem.startMeeting(room, {
      callerId,
      bodyId,
      reason,
      discussionTime: room.settings.discussionTime,
      voteTime:       room.settings.voteTime,
    });
  }

  // ── 게임 종료 ──────────────────────────────────────────

  endGame(roomId, result) {
    const room   = this.getRoom(roomId);
    room.status  = GAME_STATUS.ENDED;

    EventBus.emit('game_ended', { room, result });

    // 10분 후 방 정리
    setTimeout(() => this.rooms.delete(roomId), 10 * 60 * 1000);
  }
}

// 싱글톤
module.exports = new GameEngine();