// src/socket/SocketHandler.js
//
// 모든 소켓 이벤트 핸들러는 반드시 register(socket, io) 안에 있어야 합니다.
// socket, io 변수는 register()의 매개변수로 주입되며,
// 이 함수 밖에서 socket.on(...)을 호출하면 ReferenceError가 발생합니다.

'use strict';

const GameEngine      = require('../engine/GameEngine');
const EventBus        = require('../engine/EventBus');
const AIDirector      = require('../ai/AIDirector');
const MissionSystem   = require('../systems/MissionSystem');
const ProximitySystem = require('../systems/ProximitySystem');
const VoteSystem      = require('../systems/VoteSystem');
const ItemSystem      = require('../systems/ItemSystem');

// ── 유저 ID로 소켓 찾기 ──────────────────────────────────
function getSocketByUserId(io, userId) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.userId === userId) return socket;
  }
  return null;
}

// 재연결 대기 타이머 맵 { userId → TimeoutHandle }
const reconnectTimers = new Map();

// ════════════════════════════════════════════════════════
//  register(socket, io)
//  app.js의 io.on('connection', ...) 안에서 호출됩니다.
//  이 함수 안에서만 socket 변수에 접근할 수 있습니다.
// ════════════════════════════════════════════════════════

function register(socket, io) {

  // 재연결 감지: 이전 disconnect 타이머가 있으면 취소
  if (reconnectTimers.has(socket.userId)) {
    clearTimeout(reconnectTimers.get(socket.userId));
    reconnectTimers.delete(socket.userId);
    console.log(`[SocketHandler] 재연결 감지: ${socket.nickname}`);
  }

  // ── 방 생성 ────────────────────────────────────────────
  socket.on('create_room', ({ settings }, cb) => {
    try {
      // userId는 JWT 미들웨어가 socket에 세팅한 값 사용 (클라이언트 전달값 무시)
      const room = GameEngine.createRoom(socket.userId, settings);
      GameEngine.joinRoom(room.roomId, {
        userId:   socket.userId,
        nickname: socket.nickname,
        socketId: socket.id,
      });

      socket.join(room.roomId);
      cb({ ok: true, roomId: room.roomId });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 방 입장 ────────────────────────────────────────────
  socket.on('join_room', ({ roomId }, cb) => {
    try {
      // 재연결: 게임 중인 방에 이미 플레이어가 존재하는 경우 소켓만 교체
      const existingRoom = GameEngine.rooms.get(roomId);
      if (existingRoom && existingRoom.status !== 'waiting') {
        const player = existingRoom.getPlayer(socket.userId);
        if (player) {
          player.socketId = socket.id;
          socket.join(roomId);
          socket.emit('reconnected', player.toPrivateInfo());
          io.to(roomId).emit('notification', {
            type:    'player_reconnected',
            message: `${player.nickname}님이 재연결됐습니다.`,
          });
          cb({ ok: true, reconnected: true });
          return;
        }
      }

      const { room, player } = GameEngine.joinRoom(roomId, {
        userId:   socket.userId,
        nickname: socket.nickname,
        socketId: socket.id,
      });

      socket.join(roomId);
      socket.emit('joined', player.toPrivateInfo());
      io.to(roomId).emit('room_updated', room.toPublicState());
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 게임 시작 ──────────────────────────────────────────
  socket.on('start_game', ({ roomId }, cb) => {
    try {
      const room = GameEngine.startGame(roomId, socket.userId);

      // 각 플레이어에게 개인화된 역할 정보 전송
      for (const [uid, player] of room.players) {
        const targetSocket = getSocketByUserId(io, uid);
        if (targetSocket) {
          targetSocket.emit('game_started', player.toPrivateInfo());
        }
      }

      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 킬 ────────────────────────────────────────────────
  socket.on('kill', ({ roomId, targetId }, cb) => {
    try {
      const result = GameEngine.handleKill(roomId, socket.userId, targetId);
      cb({ ok: true, blocked: result.blocked, target: result.target.toPublicInfo() });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 구역 이동 ──────────────────────────────────────────
  // MissionSystem 트리거 포함
  socket.on('move', ({ roomId, zone }, cb) => {
    try {
      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);
      if (!player) throw new Error('플레이어를 찾을 수 없습니다.');

      const prevZone = player.zone;

      // 이전 구역 이탈 처리
      if (prevZone) MissionSystem.handleZoneLeave(room, player, prevZone);

      // 이동 처리
      GameEngine.handleMove(roomId, socket.userId, zone);

      // 새 구역 진입 처리 — 미션 트리거
      const missionEvents = MissionSystem.handleZoneEnter(room, player, zone);

      if (missionEvents.length > 0) {
        socket.emit('mission_available', {
          zone,
          missions:  missionEvents,
          taskList:  player.tasks
            .filter(t => t.zone === zone)
            .map(t => t.toClientInfo()),
        });
      }

      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── UWB/BLE 거리 업데이트 ─────────────────────────────
  socket.on('proximity_update', ({ roomId, toId, distanceM, method, direction }) => {
    try {
      ProximitySystem.updateDistance(roomId, socket.userId, toId, {
        distanceM,
        method:    method    || 'ble',
        direction: direction || null,
      });

      GameEngine.handleProximityUpdate(roomId, socket.userId, toId, distanceM);

      // 임포스터에게 킬 가능 대상 실시간 전송
      const room     = GameEngine.getRoom(roomId);
      const impostor = room.getPlayer(socket.userId);

      if (impostor?.role === 'impostor' && impostor.isAlive) {
        const killable = [];

        for (const [uid, target] of room.players) {
          if (uid === socket.userId || !target.isAlive || target.role === 'impostor') continue;

          const result = ProximitySystem.canKill(roomId, socket.userId, uid);
          if (result.possible) {
            killable.push({
              playerId: uid,
              nickname: target.nickname,
              distance: result.distance,
              method:   result.method,
            });
          }
        }

        socket.emit('killable_targets', { targets: killable });
      }
    } catch (e) {
      console.error('[SocketHandler] proximity_update error:', e.message);
    }
  });

  // ── UWB 토큰 교환 중개 ────────────────────────────────
  socket.on('uwb_token_register', ({ roomId, token }) => {
    socket.to(roomId).emit('uwb_token_received', {
      fromId: socket.userId,
      token,
    });
    console.log(`[UWB] 토큰 등록: ${socket.userId}`);
  });

  // ── QR 스캔 ───────────────────────────────────────────
  socket.on('qr_scan', ({ roomId, missionId }, cb) => {
    try {
      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);
      const result = MissionSystem.handleQRScan(room, player, missionId);

      if (result.ok) {
        socket.emit('mission_completed', {
          missionId,
          reward:       result.reward,
          currency:     player.currency,
          allTasksDone: result.allTasksDone,
        });
        io.to(roomId).emit('mission_progress', MissionSystem.getProgressBar(room));
      }

      cb(result);
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 미니게임 완료 ─────────────────────────────────────
  socket.on('minigame_complete', ({ roomId, missionId, gameResult }, cb) => {
    try {
      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);
      const result = MissionSystem.handleMiniGameComplete(room, player, missionId, gameResult);

      if (result.ok && !result.fake) {
        socket.emit('mission_completed', {
          missionId,
          reward:       result.reward,
          currency:     player.currency,
          allTasksDone: result.allTasksDone,
        });
        io.to(roomId).emit('mission_progress', MissionSystem.getProgressBar(room));
      }

      cb(result);
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 시체 신고 ─────────────────────────────────────────
  socket.on('report_body', ({ roomId, bodyId }, cb) => {
    try {
      const room = GameEngine.getRoom(roomId);
      VoteSystem.validateMeeting(room, socket.userId, bodyId, ProximitySystem);
      GameEngine.handleMeeting(roomId, socket.userId, bodyId);
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });
  // ── AI Director 질문 (채팅형) ──────────────────────────
  socket.on('ai_ask', async ({ roomId, question }, cb) => {
    try {
      if (!question || question.trim().length === 0) {
        return cb({ ok: false, error: '질문을 입력해주세요.' });
      }
      if (question.length > 200) {
        return cb({ ok: false, error: '질문이 너무 깁니다. (최대 200자)' });
      }

      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);

      if (!player?.isAlive) {
        return cb({ ok: false, error: '사망한 플레이어는 AI에게 질문할 수 없습니다.' });
      }

      // 비동기 응답: 먼저 ok 반환 후 응답 스트리밍
      cb({ ok: true });

      const { answer, sources } = await AIDirector.ask(room, player, question);

      // 질문한 본인에게만 전송 (역할 정보 보호)
      socket.emit('ai_reply', {
        question,
        answer,
        sources,   // RAG 출처 (선택적 표시)
      });

    } catch (e) {
      console.error('[ai_ask] 오류:', e.message);
      socket.emit('ai_reply', {
        question,
        answer: '죄송해요, 잠시 후 다시 물어봐주세요! 🙏',
        sources: [],
      });
    }
  });
  // ── 긴급 버튼 ─────────────────────────────────────────
  socket.on('emergency_meeting', ({ roomId }, cb) => {
    try {
      const room = GameEngine.getRoom(roomId);
      VoteSystem.validateMeeting(room, socket.userId, null, ProximitySystem);
      GameEngine.handleMeeting(roomId, socket.userId, null);
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 투표 (토론 중 사전 투표 포함) ────────────────────────
  socket.on('vote', ({ roomId, targetId }, cb) => {
    const respond = typeof cb === 'function' ? cb : () => {};

    try {
      if (!targetId) {
        return respond({ ok: false, error: '투표 대상이 없습니다.' });
      }

      const session = VoteSystem.sessions.get(roomId);
      if (!session) {
        return respond({ ok: false, error: '진행 중인 회의가 없습니다.' });
      }

      const result = VoteSystem.submitVote(roomId, socket.userId, targetId);
      respond({ ok: true, ...result });

    } catch (e) {
      console.error('[vote] 오류:', e.message);
      respond({ ok: false, error: e.message });
    }
  });

  // ── 아이템 구매 ───────────────────────────────────────
  socket.on('purchase_item', ({ roomId, itemId }, cb) => {
    try {
      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);
      const result = ItemSystem.purchaseItem(room, player, itemId);

      cb({
        ok:                true,
        item:              result.item,
        remainingCurrency: result.remainingCurrency,
        inventory:         player.items,
      });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 아이템 사용 ───────────────────────────────────────
  socket.on('use_item', ({ roomId, itemId }, cb) => {
    try {
      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);
      const effect = ItemSystem.useItem(room, player, itemId);

      switch (effect.type) {
        case 'reveal_map': {
          const locations = ItemSystem.getRevealedLocations(room, socket.userId);
          socket.emit('map_revealed', { locations });
          break;
        }
        case 'detect_impostor': {
          const detected = ItemSystem.detectNearbyImpostors(room, player, ProximitySystem);
          socket.emit('detector_result', {
            detected,
            message: detected.length > 0
              ? `⚠️ 주변 ${detected.length}명의 임포스터가 감지됐습니다!`
              : '✅ 주변에 임포스터가 없습니다.',
          });
          break;
        }
        case 'jamming': {
          effect.extra.zone = player.zone;
          socket.emit('item_effect_started', { itemId, remainingMs: effect.remainingMs });
          break;
        }
        default:
          socket.emit('item_effect_started', { itemId, remainingMs: effect.remainingMs });
      }

      cb({ ok: true, inventory: player.items, currency: player.currency });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 상점 목록 조회 ────────────────────────────────────
  socket.on('get_shop', ({ roomId }, cb) => {
    try {
      const room   = GameEngine.getRoom(roomId);
      const player = room.getPlayer(socket.userId);
      const { ITEMS } = require('../systems/items/itemDefinitions');

      const availableItems = Object.values(ITEMS).filter(item =>
        item.target === 'all' || item.target === player.role
      );

      cb({ ok: true, items: availableItems, currency: player.currency });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 연결 해제 ─────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] 해제: ${socket.id} | ${socket.nickname} | ${reason}`);

    const { userId, nickname } = socket;

    // 게임 진행 중인 방 탐색
    const room = [...GameEngine.rooms.values()].find(r => r.players.has(userId));
    if (!room || room.status === 'waiting' || room.status === 'ended') return;

    const player = room.getPlayer(userId);
    if (!player) return;

    // 재연결 대기 알림
    io.to(room.roomId).emit('notification', {
      type:    'player_reconnecting',
      message: `${nickname}님 연결이 끊겼습니다. 30초 내 재연결을 기다립니다.`,
    });

    // 30초 reconnect grace period
    const timer = setTimeout(() => {
      reconnectTimers.delete(userId);

      // 재연결 여부 확인
      if (getSocketByUserId(io, userId)) return;

      // ── 사망 처리 ───────────────────────────────────────
      if (player.isAlive) {
        player.die();
        room.killLog.push({
          killerId:  'disconnect',
          targetId:  userId,
          zone:      player.zone,
          timestamp: Date.now(),
        });
        io.to(room.roomId).emit('notification', {
          type:    'player_disconnected',
          message: `${nickname}님이 게임 도중 퇴장했습니다.`,
        });

        // 승리 조건 체크
        const winResult = room.checkWinCondition();
        if (winResult) {
          GameEngine.endGame(room.roomId, winResult);
          return;
        }
      }

      // ── 방장 이전 ───────────────────────────────────────
      if (room.hostId === userId) {
        const nextPlayer = [...room.players.values()].find(
          p => p.userId !== userId && getSocketByUserId(io, p.userId)
        );
        if (nextPlayer) {
          room.hostId       = nextPlayer.userId;
          nextPlayer.isHost = true;
          const newHostSocket = getSocketByUserId(io, nextPlayer.userId);
          if (newHostSocket) {
            newHostSocket.emit('host_transferred', {
              message: '방장이 되었습니다.',
            });
          }
          io.to(room.roomId).emit('notification', {
            type:    'host_changed',
            message: `${nextPlayer.nickname}님이 새 방장이 됩니다.`,
          });
        }
      }
    }, 30_000);

    reconnectTimers.set(userId, timer);
  });
}

module.exports = { register };