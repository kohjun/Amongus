// src/socket/EventSubscriber.js
// EventBus 이벤트 → Socket 브로드캐스트 연결

const EventBus   = require('../engine/EventBus');
const AIDirector = require('../ai/AIDirector');

// ── 게임 시작 ─────────────────────────────────────────────
EventBus.on('game_started', async ({ room }) => {

  // AI 인트로 멘트 (1초 딜레이로 자연스럽게)
  setTimeout(async () => {
    const msg = await AIDirector.onGameStart(room);
    io.to(room.roomId).emit('ai_message', {
      type:    'narration',
      message: msg,
    });
  }, 1000);

  // 개인 가이드 스케줄러 시작
  AIDirector.startGuideScheduler(room, io);
});

// ── 킬 발생 ───────────────────────────────────────────────
EventBus.on('player_killed', async ({ room, impostor, target }) => {
  const msg = await AIDirector.onKill(room, impostor, target);

  // 킬 해설은 전체 공개 (하지만 누가 죽었는지는 시체 발견 전까지 모름)
  io.to(room.roomId).emit('ai_message', {
    type:    'atmosphere',
    message: msg,
  });
});

// ── 회의 소집 ─────────────────────────────────────────────
EventBus.on('meeting_started', async ({ room, session }) => {
  const caller = room.getPlayer(session.callerId);
  const body   = session.bodyId ? room.getPlayer(session.bodyId) : null;

  const msg = await AIDirector.onMeeting(room, caller, session.reason, body);
  io.to(room.roomId).emit('ai_message', {
    type:    'announcement',
    message: msg,
  });

  // 토론 30초 경과 후 토론 유도 멘트
  setTimeout(async () => {
    if (room.status !== 'meeting') return;
    const guide = await AIDirector.onDiscussionGuide(room);
    io.to(room.roomId).emit('ai_message', {
      type:    'discussion_guide',
      message: guide,
    });
  }, 30 * 1000);
});

// ── 투표 결과 ─────────────────────────────────────────────
EventBus.on('vote_result', async ({ room, session, result, ejected }) => {
  const msg = await AIDirector.onVoteResult(room, result, ejected);
  io.to(room.roomId).emit('ai_message', {
    type:    'vote_result',
    message: msg,
  });
});

// ── 미션 마일스톤 ─────────────────────────────────────────
EventBus.on('task_completed', async ({ room }) => {
  const percent = Math.floor((room.completedMissions / room.totalMissions) * 100);

  if ([25, 50, 75].includes(percent)) {
    const progress = { percent };
    const msg      = await AIDirector.onMissionMilestone(room, progress);
    io.to(room.roomId).emit('ai_message', {
      type:    'milestone',
      message: msg,
    });
  }
});

// ── 게임 종료 ─────────────────────────────────────────────
EventBus.on('game_ended', async ({ room, result }) => {
  const msg = await AIDirector.onGameEnd(room, result);
  io.to(room.roomId).emit('ai_message', {
    type:    'game_end',
    message: msg,
  });
});
// ── 회의 시작 ─────────────────────────────────────────────
EventBus.on('meeting_started', async ({ room, session }) => {
  const caller = room.getPlayer(session.callerId);
  const body   = session.bodyId ? room.getPlayer(session.bodyId) : null;

  // 전체 공지
  io.to(room.roomId).emit('meeting_started', {
    phase:        session.phase,
    caller:       caller.toPublicInfo(),
    body:         body ? body.toPublicInfo() : null,
    reason:       session.reason,
    alivePlayers: room.alivePlayers.map(p => p.toPublicInfo()),
    discussionTime: session.discussionTime,
  });

  // AI 회의 소집 멘트
  const msg = await AIDirector.onMeeting(room, caller, session.reason, body);
  io.to(room.roomId).emit('ai_message', { message: msg });
});

// ── 매초 타이머 ───────────────────────────────────────────
EventBus.on('meeting_tick', ({ room, phase, remaining }) => {
  io.to(room.roomId).emit('meeting_tick', { phase, remaining });
});

// ── 투표 단계 시작 ────────────────────────────────────────
EventBus.on('voting_started', ({ room, session }) => {
  io.to(room.roomId).emit('voting_started', {
    voteTime:     session.voteTime,
    alivePlayers: room.alivePlayers.map(p => p.toPublicInfo()),
  });
});

// ── 투표 제출 알림 (익명) ─────────────────────────────────
EventBus.on('vote_submitted', ({ roomId, voterId }) => {
  // 누가 투표했는지는 공개, 누구에게 했는지는 비공개
  const room    = GameEngine.getRoom(roomId);
  const voter   = room.getPlayer(voterId);

  io.to(roomId).emit('vote_submitted', {
    voterNickname: voter.nickname,
    totalVotes:    VoteSystem.sessions.get(roomId)?.votes.size || 0,
    totalPlayers:  room.alivePlayers.length,
  });
});

// ── 투표 결과 ─────────────────────────────────────────────
EventBus.on('vote_result', async ({ room, session, result, ejected }) => {

  // 상세 투표 결과 공개 (누가 누구에게 투표했는지)
  const voteDetails = [];
  for (const [voterId, targetId] of session.votes) {
    const voter  = room.getPlayer(voterId);
    const target = targetId === 'skip' ? null : room.getPlayer(targetId);
    voteDetails.push({
      voter:  voter?.nickname,
      target: target?.nickname || 'SKIP',
    });
  }

  io.to(room.roomId).emit('vote_result', {
    ...result,
    voteDetails,
  });

  // AI 결과 해설
  const msg = await AIDirector.onVoteResult(room, result, ejected);
  io.to(room.roomId).emit('ai_message', { message: msg });
});

// ── 회의 종료 → 게임 복귀 ────────────────────────────────
EventBus.on('meeting_ended', ({ room }) => {
  const { GameEngine } = require('../engine/GameEngine');

  // 승리 조건 체크
  const winResult = room.checkWinCondition();
  if (winResult) {
    GameEngine.endGame(room.roomId, winResult);
    return;
  }

  // 게임 복귀
  room.status = 'playing';
  io.to(room.roomId).emit('meeting_ended', {
    message: '게임으로 돌아갑니다.',
    state:   room.toPublicState(),
  });
});
EventBus.on('task_completed', async ({ room, player, taskId }) => {
  const progress = MissionSystem.getProgressBar(room);

  // 전체에게 진행바 업데이트
  io.to(room.roomId).emit('mission_progress', progress);

  // 75%, 50%, 25% 남았을 때 AI 긴장감 멘트
  const remaining = 100 - progress.percent;
  if ([75, 50, 25].includes(remaining)) {
    const msg = await AIDirector.onMissionMilestone(room, progress);
    io.to(room.roomId).emit('ai_message', { message: msg });
  }
});

function init(io) {

  // 플레이어 입장
  EventBus.on('player_joined', ({ room, player }) => {
    io.to(room.roomId).emit('notification', {
      type:    'player_joined',
      message: `${player.nickname}님이 입장했습니다.`,
    });
  });

  // 킬 발생
  EventBus.on('player_killed', async ({ room, impostor, target }) => {
    // 임포스터들에게만 킬 정보 전송
    for (const imp of room.aliveImpostors) {
      const s = getSocket(io, imp.userId);
      if (s) s.emit('kill_confirmed', {
        killer: impostor.nickname,
        victim: target.nickname,
        zone:   target.zone,
      });
    }

    // 전체에게는 시체 발견 가능 알림
    io.to(room.roomId).emit('notification', {
      type:    'body_exists',
      message: `어딘가에 시체가 있습니다...`,
    });

    // AI 해설 (비동기)
    const commentary = await AIDirector.onKill(room, impostor, target);
    io.to(room.roomId).emit('ai_message', { message: commentary });
  });

  // 이동
  EventBus.on('player_moved', ({ room, player, zone }) => {
    // 같은 구역 플레이어들에게만 이동 알림
    for (const [uid, p] of room.players) {
      if (p.zone === zone && uid !== player.userId) {
        const s = getSocket(io, uid);
        if (s) s.emit('player_entered_zone', {
          nickname: player.nickname,
          zone,
        });
      }
    }
  });

  // 회의 소집
  EventBus.on('meeting_called', async ({ room, caller, reason }) => {
    io.to(room.roomId).emit('meeting_started', {
      caller:      caller.nickname,
      reason,
      alivePlayers: room.alivePlayers.map(p => p.toPublicInfo()),
    });

    const commentary = await AIDirector.onMeeting(room, caller, reason);
    io.to(room.roomId).emit('ai_message', { message: commentary });
  });

  // 게임 종료
  EventBus.on('game_ended', ({ room, result }) => {
    io.to(room.roomId).emit('game_ended', {
      winner:  result.winner,
      reason:  result.reason,
      // 역할 공개
      players: [...room.players.values()].map(p => ({
        ...p.toPublicInfo(),
        role: p.role,  // 종료 후 역할 공개
      })),
    });
  });
}

function getSocket(io, userId) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.userId === userId) return socket;
  }
  return null;
}

module.exports = { init };