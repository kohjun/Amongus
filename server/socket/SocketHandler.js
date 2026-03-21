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

// ════════════════════════════════════════════════════════
//  register(socket, io)
//  app.js의 io.on('connection', ...) 안에서 호출됩니다.
//  이 함수 안에서만 socket 변수에 접근할 수 있습니다.
// ════════════════════════════════════════════════════════

function register(socket, io) {

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

  // ── 투표 ──────────────────────────────────────────────
  socket.on('vote', ({ roomId, targetId }, cb) => {
    try {
      const voteCount = VoteSystem.submitVote(roomId, socket.userId, targetId);
      cb({ ok: true, voteCount });
    } catch (e) {
      cb({ ok: false, error: e.message });
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
    // TODO: 게임 중 이탈 처리 (reconnect grace period)
  });
}

module.exports = { register };