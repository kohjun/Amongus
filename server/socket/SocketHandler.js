// src/socket/SocketHandler.js

const GameEngine = require('../engine/GameEngine');
const EventBus   = require('../engine/EventBus');
const AIDirector = require('../ai/AIDirector');
const MissionSystem = require('../systems/MissionSystem');
const ProximitySystem = require('../systems/ProximitySystem');
const VoteSystem      = require('../systems/VoteSystem');
const ItemSystem      = require('../systems/ItemSystem');

// ── 아이템 구매 ───────────────────────────────────────────
socket.on('purchase_item', ({ roomId, userId, itemId }, cb) => {
  try {
    const room   = GameEngine.getRoom(roomId);
    const player = room.getPlayer(userId);
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

// ── 아이템 사용 ───────────────────────────────────────────
socket.on('use_item', ({ roomId, userId, itemId }, cb) => {
  try {
    const room   = GameEngine.getRoom(roomId);
    const player = room.getPlayer(userId);
    const effect = ItemSystem.useItem(room, player, itemId);

    // 아이템별 즉시 처리
    switch (effect.type) {

      case 'reveal_map': {
        // 지도: 사용자에게 현재 위치 정보 전송
        const locations = ItemSystem.getRevealedLocations(room, userId);
        socket.emit('map_revealed', { locations });
        break;
      }

      case 'detect_impostor': {
        // 탐지기: 즉시 주변 임포스터 스캔
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
        // 방해전파: 현재 구역 저장
        effect.extra.zone = player.zone;
        socket.emit('item_effect_started', {
          itemId,
          remainingMs: effect.remainingMs,
        });
        break;
      }

      default:
        socket.emit('item_effect_started', {
          itemId,
          remainingMs: effect.remainingMs,
        });
    }

    cb({ ok: true, inventory: player.items, currency: player.currency });
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});

// ── 상점 목록 조회 ────────────────────────────────────────
socket.on('get_shop', ({ roomId, userId }, cb) => {
  try {
    const room   = GameEngine.getRoom(roomId);
    const player = room.getPlayer(userId);
    const { ITEMS } = require('./items/itemDefinitions');

    // 역할에 맞는 아이템만 필터링
    const availableItems = Object.values(ITEMS).filter(item =>
      item.target === 'all' || item.target === player.role
    );

    cb({
      ok:       true,
      items:    availableItems,
      currency: player.currency,
    });
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});
// ── 시체 신고 ─────────────────────────────────────────────
socket.on('report_body', ({ roomId, callerId, bodyId }, cb) => {
  try {
    const room = GameEngine.getRoom(roomId);

    VoteSystem.validateMeeting(room, callerId, bodyId, ProximitySystem);
    GameEngine.handleMeeting(roomId, callerId, bodyId);

    cb({ ok: true });
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});

// ── 긴급 버튼 ─────────────────────────────────────────────
socket.on('emergency_meeting', ({ roomId, callerId }, cb) => {
  try {
    const room = GameEngine.getRoom(roomId);

    VoteSystem.validateMeeting(room, callerId, null, ProximitySystem);
    GameEngine.handleMeeting(roomId, callerId, null);

    cb({ ok: true });
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});

// ── 투표 ──────────────────────────────────────────────────
socket.on('vote', ({ roomId, voterId, targetId }, cb) => {
  try {
    const voteCount = VoteSystem.submitVote(roomId, voterId, targetId);
    cb({ ok: true, voteCount });
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});
// ── UWB/BLE 거리 업데이트 ─────────────────────────────────
socket.on('proximity_update', ({ roomId, fromId, toId, distanceM, method, direction }) => {
  try {
    // 거리 행렬 업데이트
    ProximitySystem.updateDistance(roomId, fromId, toId, {
      distanceM,
      method: method || 'ble',
      direction: direction || null,
    });

    // GameEngine에도 반영 (canKill 체크용)
    GameEngine.handleProximityUpdate(roomId, fromId, toId, distanceM);

    // 킬 가능 여부 실시간으로 임포스터에게 전송
    const room     = GameEngine.getRoom(roomId);
    const impostor = room.getPlayer(fromId);

    if (impostor?.role === 'impostor' && impostor.isAlive) {
      const killable = [];

      for (const [uid, target] of room.players) {
        if (uid === fromId || !target.isAlive || target.role === 'impostor') continue;

        const result = ProximitySystem.canKill(roomId, fromId, uid);
        if (result.possible) {
          killable.push({
            playerId: uid,
            nickname: target.nickname,
            distance: result.distance,
            method:   result.method,
          });
        }
      }

      // 임포스터 화면에 킬 가능한 플레이어 목록 실시간 업데이트
      socket.emit('killable_targets', { targets: killable });
    }

  } catch (e) {
    console.error('proximity_update error:', e.message);
  }
});

// ── UWB 토큰 교환 중개 ────────────────────────────────────
// UWB 세션을 맺으려면 Discovery Token을 서로 교환해야 함
// 서버가 중개자 역할

socket.on('uwb_token_register', ({ roomId, userId, token }) => {
  // 내 토큰을 방 전체에 브로드캐스트
  socket.to(roomId).emit('uwb_token_received', {
    fromId: userId,
    token,
  });
  console.log(`[UWB] 토큰 등록: ${userId}`);
});
// ── QR 스캔 ──────────────────────────────────────────────
socket.on('qr_scan', ({ roomId, userId, missionId }, cb) => {
  try {
    const room   = GameEngine.getRoom(roomId);
    const player = room.getPlayer(userId);
    const result = MissionSystem.handleQRScan(room, player, missionId);

    if (result.ok) {
      // 본인에게 완료 알림 + 재화 업데이트
      socket.emit('mission_completed', {
        missionId,
        reward:         result.reward,
        currency:       player.currency,
        allTasksDone:   result.allTasksDone,
      });

      // 전체에게 미션 진행도 업데이트
      io.to(roomId).emit('mission_progress', MissionSystem.getProgressBar(room));
    }

    cb(result);
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});

// ── 미니게임 완료 ─────────────────────────────────────────
socket.on('minigame_complete', ({ roomId, userId, missionId, gameResult }, cb) => {
  try {
    const room   = GameEngine.getRoom(roomId);
    const player = room.getPlayer(userId);
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

// ── 구역 이동 시 미션 트리거 (기존 move 이벤트에 추가) ────
socket.on('move', ({ roomId, userId, zone }, cb) => {
  try {
    const room    = GameEngine.getRoom(roomId);
    const player  = room.getPlayer(userId);
    const prevZone = player.zone;

    // 이전 구역 이탈 처리
    if (prevZone) MissionSystem.handleZoneLeave(room, player, prevZone);

    // 이동 처리
    GameEngine.handleMove(roomId, userId, zone);

    // 새 구역 진입 처리
    const missionEvents = MissionSystem.handleZoneEnter(room, player, zone);

    // 이 구역에서 할 수 있는 미션 알림
    if (missionEvents.length > 0) {
      socket.emit('mission_available', {
        zone,
        missions: missionEvents,
        taskList: player.tasks
          .filter(t => t.zone === zone)
          .map(t => t.toClientInfo()),
      });
    }

    cb({ ok: true });
  } catch (e) {
    cb({ ok: false, error: e.message });
  }
});
function register(socket, io) {

  // ── 방 생성 ──────────────────────────────────────────
  socket.on('create_room', ({ userId, nickname, settings }, cb) => {
    try {
      const room = GameEngine.createRoom(userId, settings);
      GameEngine.joinRoom(room.roomId, { userId, nickname, socketId: socket.id });

      socket.join(room.roomId);
      cb({ ok: true, roomId: room.roomId });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 방 입장 ──────────────────────────────────────────
  socket.on('join_room', ({ roomId, userId, nickname }, cb) => {
    try {
      const { room, player } = GameEngine.joinRoom(roomId, {
        userId, nickname, socketId: socket.id
      });

      socket.join(roomId);

      // 본인에게 개인 정보
      socket.emit('joined', player.toPrivateInfo());

      // 방 전체에 입장 알림
      io.to(roomId).emit('room_updated', room.toPublicState());
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 게임 시작 ─────────────────────────────────────────
  socket.on('start_game', ({ roomId, userId }, cb) => {
    try {
      const room = GameEngine.startGame(roomId, userId);

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

  // ── 킬 ───────────────────────────────────────────────
  socket.on('kill', ({ roomId, impostorId, targetId }, cb) => {
    try {
      const target = GameEngine.handleKill(roomId, impostorId, targetId);
      cb({ ok: true, target: target.toPublicInfo() });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 이동 ─────────────────────────────────────────────
  socket.on('move', ({ roomId, userId, zone }, cb) => {
    try {
      GameEngine.handleMove(roomId, userId, zone);
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 근접 거리 업데이트 (UWB/BLE) ─────────────────────
  socket.on('proximity_update', ({ roomId, fromId, toId, distanceM }) => {
    GameEngine.handleProximityUpdate(roomId, fromId, toId, distanceM);
  });

  // ── 회의 소집 ─────────────────────────────────────────
  socket.on('call_meeting', ({ roomId, callerId, bodyId }, cb) => {
    try {
      GameEngine.handleMeeting(roomId, callerId, bodyId);
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 투표 ─────────────────────────────────────────────
  socket.on('vote', ({ roomId, voterId, targetId }, cb) => {
    try {
      const VoteSystem = require('../systems/VoteSystem');
      VoteSystem.submitVote(roomId, voterId, targetId);
      cb({ ok: true });
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  // ── 연결 해제 ─────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`소켓 해제: ${socket.id}`);
    // 소켓 ID로 플레이어 찾아서 퇴장 처리
    // (userId를 소켓에 저장하는 방식으로 확장 가능)
  });
}

// 유저 ID로 소켓 찾기
function getSocketByUserId(io, userId) {
  for (const [id, socket] of io.sockets.sockets) {
    if (socket.userId === userId) return socket;
  }
  return null;
}

module.exports = { register };