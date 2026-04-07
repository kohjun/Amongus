// src/socket/EventSubscriber.js
//
// EventBus 이벤트 → Socket 브로드캐스트 연결
//
// 반드시 app.js에서 io 생성 직후 EventSubscriber.init(io)를 호출해야 합니다.
// init() 밖에서는 io 변수에 접근할 수 없으므로,
// 모든 EventBus 리스너는 init(io) 함수 안에서 등록합니다.

'use strict';

const EventBus    = require('../engine/EventBus');
const AIDirector  = require('../ai/AIDirector');
const MissionSystem = require('../systems/MissionSystem');

// ── 소켓 조회 헬퍼 ────────────────────────────────────────
function getSocket(io, userId) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.userId === userId) return socket;
  }
  return null;
}

// ════════════════════════════════════════════════════════
//  init(io)
//  app.js에서 io 생성 직후 1회 호출합니다.
//  모든 EventBus 구독은 이 함수 안에서만 등록합니다.
// ════════════════════════════════════════════════════════

function init(io) {

  // ── 플레이어 입장 ─────────────────────────────────────
  EventBus.on('player_joined', ({ room, player }) => {
    io.to(room.roomId).emit('notification', {
      type:    'player_joined',
      message: `${player.nickname}님이 입장했습니다.`,
    });
  });

  // ── 게임 시작 ─────────────────────────────────────────
  EventBus.on('game_started', async ({ room }) => {
    // 1초 딜레이 후 AI 인트로
    setTimeout(async () => {
      try {
        const msg = await AIDirector.onGameStart(room);
        io.to(room.roomId).emit('ai_message', { type: 'narration', message: msg });
      } catch (e) {
        console.error('[EventSubscriber] game_started AI error:', e.message);
      }
    }, 1000);

    // 개인 가이드 스케줄러 시작
    AIDirector.startGuideScheduler(room, io);
  });

  // ── 킬 발생 ───────────────────────────────────────────
  EventBus.on('player_killed', async ({ room, impostor, target }) => {
    // 임포스터들에게만 킬 확인 정보 전송
    for (const imp of room.aliveImpostors) {
      const s = getSocket(io, imp.userId);
      if (s) s.emit('kill_confirmed', {
        killer: impostor.nickname,
        victim: target.nickname,
        zone:   target.zone,
      });
    }

    // 전체에게 시체 존재 알림 (누가 죽었는지는 숨김)
    io.to(room.roomId).emit('notification', {
      type:    'body_exists',
      message: '어딘가에 시체가 있습니다...',
    });

    // AI 분위기 해설 (비동기)
    try {
      const commentary = await AIDirector.onKill(room, impostor, target);
      if (commentary) {
        io.to(room.roomId).emit('ai_message', { type: 'atmosphere', message: commentary });
      }
    } catch (e) {
      console.error('[EventSubscriber] player_killed AI error:', e.message);
    }
  });

  // ── 킬 차단 (방탄조끼) ────────────────────────────────
  EventBus.on('kill_blocked', ({ room, impostor, target }) => {
    const s = getSocket(io, impostor.userId);
    if (s) s.emit('kill_blocked', { message: '방탄조끼에 막혔습니다!' });

    const t = getSocket(io, target.userId);
    if (t) t.emit('bulletproof_triggered', { message: '방탄조끼가 킬을 막았습니다!' });
  });

  // ── 이동 ──────────────────────────────────────────────
  EventBus.on('player_moved', ({ room, player, zone }) => {
    // 같은 구역 플레이어에게만 입장 알림
    for (const [uid, p] of room.players) {
      if (p.zone === zone && uid !== player.userId) {
        const s = getSocket(io, uid);
        if (s) s.emit('player_entered_zone', { nickname: player.nickname, zone });
      }
    }
  });

  // ── 회의 소집 ─────────────────────────────────────────
  // meeting_called: GameEngine.handleMeeting()에서 emit
  EventBus.on('meeting_called', async ({ room, caller, bodyId, reason }) => {
    const body = bodyId ? room.getPlayer(bodyId) : null;

    io.to(room.roomId).emit('meeting_started', {
      caller:         caller.toPublicInfo(),
      body:           body ? body.toPublicInfo() : null,
      reason,
      alivePlayers:   room.alivePlayers.map(p => p.toPublicInfo()),
      discussionTime: room.settings.discussionTime,
    });

    try {
      const msg = await AIDirector.onMeeting(room, caller, reason, body);
      if (msg) io.to(room.roomId).emit('ai_message', { type: 'announcement', message: msg });
    } catch (e) {
      console.error('[EventSubscriber] meeting_called AI error:', e.message);
    }
  });

  // ── 회의 tick (매초) ──────────────────────────────────
  // VoteSystem 내부 타이머에서 emit
  EventBus.on('meeting_tick', ({ room, phase, remaining }) => {
    io.to(room.roomId).emit('meeting_tick', { phase, remaining });

    // 토론 30초 경과 시 AI 유도 멘트
    if (phase === 'discussion' && remaining === room.settings.discussionTime - 30) {
      AIDirector.onDiscussionGuide(room).then(guide => {
        if (guide) io.to(room.roomId).emit('ai_message', { type: 'discussion_guide', message: guide });
      }).catch(e => console.error('[EventSubscriber] discussion_guide AI error:', e.message));
    }
  });

  // ── 투표 단계 시작 ────────────────────────────────────
  EventBus.on('voting_started', ({ room, session }) => {
    io.to(room.roomId).emit('voting_started', {
      voteTime:     session.voteTime,
      alivePlayers: room.alivePlayers.map(p => p.toPublicInfo()),
    });
  });

  // ── 투표 제출 알림 (익명) ─────────────────────────────
  EventBus.on('vote_submitted', ({ roomId, voterId }) => {
    try {
      const VoteSystem = require('../systems/VoteSystem');
      const room  = require('../engine/GameEngine').getRoom(roomId);
      const voter = room.getPlayer(voterId);

      io.to(roomId).emit('vote_submitted', {
        voterNickname: voter?.nickname,
        totalVotes:    VoteSystem.sessions.get(roomId)?.votes.size || 0,
        totalPlayers:  room.alivePlayers.length,
      });
    } catch (e) {
      console.error('[EventSubscriber] vote_submitted error:', e.message);
    }
  });

  // ── 투표 결과 ─────────────────────────────────────────
  EventBus.on('vote_result', async ({ room, session, result, ejected }) => {
    // 상세 투표 내역 공개 (누가 누구에게 투표했는지)
    const voteDetails = [];
    for (const [voterId, targetId] of session.votes) {
      const voter  = room.getPlayer(voterId);
      const target = targetId === 'skip' ? null : room.getPlayer(targetId);
      voteDetails.push({
        voter:  voter?.nickname  || '?',
        target: target?.nickname || 'SKIP',
      });
    }

    io.to(room.roomId).emit('vote_result', {
      ...result,
      voteDetails,
      ejected: ejected ? {
        ...ejected.toPublicInfo(),
        role: ejected.role,  // 추방 시 역할 공개
      } : null,
    });

    // AI 결과 해설
    try {
      const msg = await AIDirector.onVoteResult(room, result, ejected);
      if (msg) io.to(room.roomId).emit('ai_message', { type: 'vote_result', message: msg });
    } catch (e) {
      console.error('[EventSubscriber] vote_result AI error:', e.message);
    }
  });

  // ── 회의 종료 → 게임 복귀 or 승리 체크 ──────────────
  EventBus.on('meeting_ended', ({ room }) => {
    const GameEngine = require('../engine/GameEngine');
    const winResult  = room.checkWinCondition();

    if (winResult) {
      GameEngine.endGame(room.roomId, winResult);
      return;
    }

    room.status = 'playing';
    io.to(room.roomId).emit('meeting_ended', {
      message: '게임으로 돌아갑니다.',
      state:   room.toPublicState(),
    });
  });

  // ── 미션 완료 (진행도 + AI 마일스톤) ─────────────────
  EventBus.on('task_completed', async ({ room, player, taskId }) => {
    const progress = MissionSystem.getProgressBar(room);

    // 전체 진행바 업데이트
    io.to(room.roomId).emit('mission_progress', progress);

    // 25 / 50 / 75% 마일스톤 AI 멘트
    if ([25, 50, 75].includes(progress.percent)) {
      try {
        const msg = await AIDirector.onMissionMilestone(room, progress);
        if (msg) io.to(room.roomId).emit('ai_message', { type: 'milestone', message: msg });
      } catch (e) {
        console.error('[EventSubscriber] task_completed AI error:', e.message);
      }
    }
  });

  // ── 게임 종료 ─────────────────────────────────────────
  EventBus.on('game_ended', async ({ room, result }) => {
    // 전체 역할 공개
    io.to(room.roomId).emit('game_ended', {
      winner:  result.winner,
      reason:  result.reason,
      players: [...room.players.values()].map(p => ({
        ...p.toPublicInfo(),
        role: p.role,
      })),
    });

    // AI 종료 멘트
    try {
      const msg = await AIDirector.onGameEnd(room, result);
      if (msg) io.to(room.roomId).emit('ai_message', { type: 'game_end', message: msg });
    } catch (e) {
      console.error('[EventSubscriber] game_ended AI error:', e.message);
    }
  });

  // ── 재화 지급 ─────────────────────────────────────────
  EventBus.on('currency_granted', ({ player, amount, reason }) => {
    const s = getSocket(io, player.userId);
    if (s) s.emit('currency_updated', { currency: player.currency, delta: amount, reason });
  });

  // ── 조건 보상 지급 ────────────────────────────────────
  EventBus.on('condition_reward_granted', ({ room, player, reward, condition }) => {
    const s = getSocket(io, player.userId);
    if (s) s.emit('reward_granted', {
      reward,
      description: condition.description,
      inventory:   player.items,
      currency:    player.currency,
    });
  });

  console.log('[EventSubscriber] 초기화 완료 — 모든 이벤트 리스너 등록됨');
}

module.exports = { init };