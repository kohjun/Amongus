// src/systems/VoteSystem.js

const { VoteSession, VOTE_PHASE } = require('./vote/VoteSession');
const EventBus = require('../engine/EventBus');

class VoteSystem {
  constructor() {
    this.sessions = new Map();
    // 1. Map이 확실히 초기화되도록 보장
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

    // [시체 신고 로직]
    if (bodyId) {
      const body = room.getPlayer(bodyId);
      if (!body || body.isAlive) {
        throw new Error('신고할 시체가 없습니다.');
      }

      // 2. proximitySystem이 undefined인지 체크 (방어 코드)
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

    // [긴급 버튼 로직 - 제한 해제]
    // 3. 기존의 emergencyUsed 관련 체크 로직을 아예 삭제하거나 주석 처리합니다.
    console.log(`[VoteSystem] ${caller.nickname}님이 긴급 회의를 소집합니다.`);
    
    /* // 아래 1회 제한 로직은 무시됩니다.
    if (!this.emergencyUsed.has(room.roomId)) {
      this.emergencyUsed.set(room.roomId, new Set());
    }
    const usedSet = this.emergencyUsed.get(room.roomId);
    if (usedSet.has(callerId)) {
      throw new Error('긴급 버튼은 게임당 1회만 사용할 수 있습니다.');
    }
    usedSet.add(callerId);
    */
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

    // 토론 타이머 시작
    this._startDiscussionTimer(room, session);

    EventBus.emit('meeting_started', { room, session });
    return session;
  }

  // ── 토론 타이머 ───────────────────────────────────────

  _startDiscussionTimer(room, session) {
    // 매초 남은 시간 브로드캐스트
    let remaining = session.discussionTime;

    const tick = setInterval(() => {
      remaining--;
      EventBus.emit('meeting_tick', {
        room,
        phase:     VOTE_PHASE.DISCUSSION,
        remaining,
      });

      if (remaining <= 0) {
        clearInterval(tick);
        this._startVotingPhase(room, session);
      }
    }, 1000);

    session.addTimer(tick);
  }

  // ── 투표 단계 시작 ─────────────────────────────────────

  _startVotingPhase(room, session) {
    session.moveToVoting();
    EventBus.emit('voting_started', { room, session });

    let remaining = session.voteTime;

    const tick = setInterval(() => {
      remaining--;
      EventBus.emit('meeting_tick', {
        room,
        phase:     VOTE_PHASE.VOTING,
        remaining,
      });

      // 모두 투표 완료 시 즉시 결과 처리
      if (session.isAllVoted(room.alivePlayers)) {
        clearInterval(tick);
        this._processResult(room, session);
        return;
      }

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

    session.submitVote(voterId, targetId);
    EventBus.emit('vote_submitted', { roomId, voterId, targetId });
    return session.votes.size;
  }

  // ── 결과 처리 ──────────────────────────────────────────

  _processResult(room, session) {
    const tally  = session.tally(room.alivePlayers);
    let ejected  = null;
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
      ejected:     ejected ? ejected.toPublicInfo() : null,
      wasImpostor,
      isTied:      tally.isTied,
      voteCount:   tally.count,
      totalVotes:  session.votes.size,
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

    // GameEngine에서 승리 조건 체크
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