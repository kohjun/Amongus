// src/engine/GameEngine.js
// (기존 코드에서 endGame() 메서드만 수정 — Firestore 전적 저장 추가)
//
// 변경사항:
//   endGame() → saveGameResult() 호출 추가
//   그 외 모든 로직은 기존과 동일

'use strict';

const { GameRoom, GAME_STATUS } = require('./GameRoom');
const MissionSystem  = require('../systems/MissionSystem');
const ItemSystem     = require('../systems/ItemSystem');
const VoteSystem     = require('../systems/VoteSystem');
const ProximitySystem = require('../systems/ProximitySystem');
const EventBus       = require('./EventBus');

class GameEngine {
  constructor() {
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
    if (room.players.size === 0) this.rooms.delete(roomId);
  }

  // ── 게임 시작 ──────────────────────────────────────────

  startGame(roomId, requesterId) {
    const room = this.getRoom(roomId);
    if (room.hostId !== requesterId) throw new Error('방장만 게임을 시작할 수 있습니다.');
    if (room.players.size < 4)       throw new Error('최소 4명이 필요합니다.');

    room.assignRoles();
    room.status = GAME_STATUS.PLAYING;
    MissionSystem.assignMissions(room);

    EventBus.emit('game_started', { room });
    return room;
  }

  // ── 킬 처리 ────────────────────────────────────────────

  handleKill(roomId, impostorId, targetId) {
    const room     = this.getRoom(roomId);
    const impostor = room.getPlayer(impostorId);
    const target   = room.getPlayer(targetId);

    if (!impostor || !target)       throw new Error('플레이어를 찾을 수 없습니다.');
    if (impostor.role !== 'impostor') throw new Error('임포스터만 킬할 수 있습니다.');
    if (!target.isAlive)            throw new Error('이미 사망한 플레이어입니다.');

    // ProximitySystem 기준 거리 검증
    const killCheck = ProximitySystem.canKill(roomId, impostorId, targetId);
    if (!killCheck.possible) throw new Error(killCheck.reason);

    // 방탄조끼 체크
    const blocked = ItemSystem.checkBulletproof(room, target);
    if (blocked) {
      EventBus.emit('kill_blocked', { room, impostor, target });
      return { blocked: true, target };
    }

    target.die();
    room.killLog.push({ impostorId, targetId, zone: target.zone, timestamp: Date.now() });
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
    ItemSystem.checkConditions(room, player, 'task_completed');

    const winResult = room.checkWinCondition();
    if (winResult) this.endGame(roomId, winResult);

    return result;
  }

  // ── 긴급회의/신고 ──────────────────────────────────────

  handleMeeting(roomId, callerId, bodyId = null) {
    const room   = this.getRoom(roomId);
    const caller = room.getPlayer(callerId);

    if (room.status !== GAME_STATUS.PLAYING) throw new Error('회의를 소집할 수 없는 상태입니다.');

    room.status = GAME_STATUS.MEETING;
    room.meetingCount++;

    const reason = bodyId ? 'report' : 'emergency';
    EventBus.emit('meeting_called', { room, caller, bodyId, reason });

    return VoteSystem.startMeeting(room, {
      callerId,
      bodyId,
      reason,
      discussionTime: room.settings.discussionTime,
      voteTime:       room.settings.voteTime,
    });
  }

  // ── 게임 종료 ──────────────────────────────────────────
  // ★ 수정: Firestore 전적 저장 추가

  endGame(roomId, result) {
    const room  = this.getRoom(roomId);
    room.status = GAME_STATUS.ENDED;

    // AIDirector 스케줄러 중단
    const AIDirector = require('../ai/AIDirector');
    AIDirector.stopGuideScheduler(room);

    EventBus.emit('game_ended', { room, result });

    // ★ Firestore에 전적 비동기 저장 (게임 흐름을 블로킹하지 않음)
    const { saveGameResult } = require('../auth/Userservice');
    saveGameResult(room, result).catch(err => {
      console.error('[GameEngine] 전적 저장 실패:', err.message);
    });

    // 10분 후 방 메모리에서 정리
    setTimeout(() => this.rooms.delete(roomId), 10 * 60 * 1000);
  }
}

module.exports = new GameEngine();