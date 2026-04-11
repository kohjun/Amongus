// src/systems/VoteSystem.js

const { VoteSession, VOTE_PHASE } = require('./vote/VoteSession');
const EventBus = require('../engine/EventBus');

class VoteSystem {
  constructor() {
    this.sessions      = new Map();
    this.emergencyUsed = new Map();
  }

  // ── 회의 소집 가능 여부 검증 ───────────────────────────

  validateMeeting(room, callerId, bodyId, proximitySystem) {
    if (this.sessions.has(room.roomId)) {
      throw new Error('이미 회의가 진행 중입니다.');
    }

    const caller = room.getPlayer(callerId);
    if (!caller?.isAlive) {
      throw new Error('죽은 플레이어는 회의를 소집할 수 없습니다.');
    }

    if (bodyId) {
      const body = room.getPlayer(bodyId);
      if (!body || body.isAlive) {
        throw new Error('신고할 시체가 없습니다.');
      }

      if (!proximitySystem) {
        console.error('[VoteSystem] proximitySystem이 주입되지 않았습니다.');
        throw new Error('시스템 오류: 거리 감지 모듈을 찾을 수 없습니다.');
      }

      const record = proximitySystem.getDistance(room.roomId, callerId, bodyId);
      if (!record || record.distance > 5.0) {
        throw new Error('시체에 너무 멉니다. 가까이 가서 신고하세요.');
      }
      return;
    }

    console.log(`[VoteSystem] ${caller.nickname}님이 긴급 회의를 소집합니다.`);
  }

  // ── 회의 시작 ──────────────────────────────────────────

  startMeeting(room, { callerId, bodyId, reason }) {
    const session = new VoteSession({
      roomId:   room.roomId,
      callerId,
      bodyId,
      reason,
      settings: room.settings,
    });

    this.lastMeetingTime = this.lastMeetingTime || new Map();
    this.lastMeetingTime.set(room.roomId, Date.now());
    this.sessions.set(room.roomId, session);

    // 토론 타이머 시작 전에 이벤트 emit
    EventBus.emit('meeting_started', { room, session });
    this._startDiscussionTimer(room, session);

    return session;
  }

  // ── 토론 타이머 ───────────────────────────────────────

  _startDiscussionTimer(room, session) {
    let remaining = session.discussionTime;
    let earlyEnd  = false;

    // 전원 사전 투표 완료 시 토론 단축
    const onEarlyEnd = ({ room: r }) => {
      if (r.roomId !== room.roomId) return;
      if (remaining > 10) {
        remaining = 10;
        earlyEnd  = true;
        EventBus.emit('meeting_tick', {
          room, phase: VOTE_PHASE.DISCUSSION, remaining, earlyEnd: true,
        });
      }
    };
    EventBus.on('discussion_early_end', onEarlyEnd);

    const tick = setInterval(() => {
      if (session.phase === VOTE_PHASE.ENDED) {
        clearInterval(tick);
        EventBus.off('discussion_early_end', onEarlyEnd);
        return;
      }

      remaining--;
      EventBus.emit('meeting_tick', {
        room, phase: VOTE_PHASE.DISCUSSION, remaining, earlyEnd,
      });

      if (remaining <= 0) {
        clearInterval(tick);
        EventBus.off('discussion_early_end', onEarlyEnd);
        this._startVotingPhase(room, session);
      }
    }, 1000);

    session.addTimer(tick);
  }

  // ── 투표 단계 시작 ─────────────────────────────────────

  _startVotingPhase(room, session) {
    // ✅ phase 전환을 emit보다 반드시 먼저 수행 (Race Condition 방지)
    session.moveToVoting();
    session.applyPreVotes();
    EventBus.emit('voting_started', { room, session });

    let remaining = session.voteTime;

    const tick = setInterval(() => {
      if (session.phase === VOTE_PHASE.ENDED) {
        clearInterval(tick);
        return;
      }

      // 모두 투표 완료 시 즉시 결과 처리
      if (session.isAllVoted(room.alivePlayers)) {
        clearInterval(tick);
        this._processResult(room, session);
        return;
      }

      remaining--;
      EventBus.emit('meeting_tick', {
        room,
        phase: VOTE_PHASE.VOTING,
        remaining,
      });

      if (remaining <= 0) {
        clearInterval(tick);
        this._processResult(room, session);
      }
    }, 1000);

    session.addTimer(tick);
  }

  // ── 투표 제출 ──────────────────────────────────────────

  submitVote(roomId, voterId, targetId) {
    const session = this.sessions.get(roomId);
    if (!session) throw new Error('진행 중인 투표가 없습니다.');

    // 토론 단계: 사전 투표로 처리
    if (session.phase === VOTE_PHASE.DISCUSSION) {
      session.submitPreVote(voterId, targetId);
      EventBus.emit('pre_vote_submitted', { roomId, voterId, targetId });
      const room = require('../engine/GameEngine').getRoom(roomId);
      if (room && session.isAllPreVoted(room.alivePlayers)) {
        EventBus.emit('discussion_early_end', { room });
      }
      return { preVote: true, count: session.preVotes.size };
    }

    if (session.phase !== VOTE_PHASE.VOTING) {
      throw new Error(`아직 투표 단계가 아닙니다. (현재: ${session.phase})`);
    }

    session.submitVote(voterId, targetId);
    EventBus.emit('vote_submitted', { roomId, voterId, targetId });
    return { preVote: false, count: session.votes.size };
  }

  // ── 결과 처리 ──────────────────────────────────────────

  _processResult(room, session) {
    // 이미 결과 처리된 경우 중복 실행 방지
    if (session.phase === VOTE_PHASE.RESULT || session.phase === VOTE_PHASE.ENDED) return;

    const tally     = session.tally(room.alivePlayers);
    let ejected     = null;
    let wasImpostor = null;

    if (tally.ejected) {
      const target = room.getPlayer(tally.ejected);
      if (target) {
        wasImpostor = target.role === 'impostor';
        target.die();
        ejected = target;
      }
    }

    const result = {
      ejected:    ejected ? ejected.toPublicInfo() : null,
      wasImpostor,
      isTied:     tally.isTied,
      voteCount:  tally.count,
      totalVotes: session.votes.size,
    };

    session.moveToResult(result);
    EventBus.emit('vote_result', { room, session, result, ejected });

    // 결과 화면 5초 후 게임 복귀 or 종료
    const endTimer = setTimeout(() => {
      this._endMeeting(room, session);
    }, 5000);

    session.addTimer(endTimer);
  }

  // ── 회의 종료 ──────────────────────────────────────────

  _endMeeting(room, session) {
    session.end();
    this.sessions.delete(room.roomId);
    EventBus.emit('meeting_ended', { room, session });
  }

  // ── 세션 정리 ──────────────────────────────────────────

  cleanupRoom(roomId) {
    const session = this.sessions.get(roomId);
    if (session) session.end();
    this.sessions.delete(roomId);
    this.emergencyUsed.delete(roomId);
  }
}

module.exports = new VoteSystem();