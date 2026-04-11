// src/systems/vote/VoteSession.js

const VOTE_PHASE = {
  DISCUSSION: 'discussion',
  VOTING:     'voting',
  RESULT:     'result',
  ENDED:      'ended',
};

class VoteSession {
  constructor({ roomId, callerId, bodyId, reason, settings }) {
    this.roomId    = roomId;
    this.callerId  = callerId;   // 회의 소집자
    this.bodyId    = bodyId;     // 신고된 시체 (긴급버튼이면 null)
    this.reason    = reason;     // 'report' | 'emergency'
    this.createdAt = Date.now();

    // 타이머 설정
    this.discussionTime = settings.discussionTime || 90;  // 초
    this.voteTime       = settings.voteTime       || 30;

    // 단계
    this.phase = VOTE_PHASE.DISCUSSION;

    // 사전 투표 데이터 (토론 중 사전 확정)
    this.preVotes = new Map(); // { voterId: targetId }

    // 투표 데이터
    // { voterId: targetId }  targetId는 플레이어ID 또는 'skip'
    this.votes = new Map();

    // 결과
    this.result = null;  // { ejected, wasImpostor, voteCount }

    // 타이머 핸들 (취소용)
    this._timers = [];
  }

  // ── 사전 투표 (토론 단계) ────────────────────────────────

  submitPreVote(voterId, targetId) {
    if (this.phase !== VOTE_PHASE.DISCUSSION) {
      throw new Error('토론 단계에서만 사전 투표할 수 있습니다.');
    }
    if (voterId === targetId) {
      throw new Error('자기 자신에게 투표할 수 없습니다.');
    }
    // 사전 투표는 변경 가능 (덮어쓰기 허용)
    this.preVotes.set(voterId, targetId);
  }

  isAllPreVoted(alivePlayers) {
    return alivePlayers.every(p => this.preVotes.has(p.userId));
  }

  // 투표 단계 시작 시 사전 투표를 실제 votes에 이월
  applyPreVotes() {
    for (const [voterId, targetId] of this.preVotes) {
      if (!this.votes.has(voterId)) {
        this.votes.set(voterId, targetId);
      }
    }
  }

  // ── 투표 제출 ──────────────────────────────────────────

  submitVote(voterId, targetId) {
    if (this.phase !== VOTE_PHASE.VOTING) {
      throw new Error('투표 단계가 아닙니다.');
    }
    if (voterId === targetId) {
      throw new Error('자기 자신에게 투표할 수 없습니다.');
    }
    if (this.votes.has(voterId)) {
      throw new Error('이미 투표했습니다.');
    }

    this.votes.set(voterId, targetId);
  }

  // ── 투표 집계 ──────────────────────────────────────────

  tally(alivePlayers) {
    const count = {};  // { targetId: 득표수 }

    for (const [, target] of this.votes) {
      count[target] = (count[target] || 0) + 1;
    }

    // 투표 안 한 플레이어는 자동 SKIP 처리
    const voterIds = new Set(this.votes.keys());
    for (const p of alivePlayers) {
      if (!voterIds.has(p.userId)) {
        count['skip'] = (count['skip'] || 0) + 1;
      }
    }

    // 최다 득표자 찾기
    const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
    const [topTarget, topCount] = sorted[0] || ['skip', 0];

    // 동률 체크
    const isTied = sorted.length > 1 && sorted[1][1] === topCount;

    return {
      count,
      topTarget,
      topCount,
      isTied,
      ejected: (!isTied && topTarget !== 'skip') ? topTarget : null,
    };
  }

  // ── 단계 전환 ──────────────────────────────────────────

  moveToVoting() {
    this.phase = VOTE_PHASE.VOTING;
  }

  moveToResult(result) {
    this.phase  = VOTE_PHASE.RESULT;
    this.result = result;
  }

  end() {
    this.phase = VOTE_PHASE.ENDED;
    this._clearTimers();
  }

  // ── 모든 투표 완료 여부 ────────────────────────────────

  isAllVoted(alivePlayers) {
    return alivePlayers.every(p => this.votes.has(p.userId));
  }

  // ── 타이머 관리 ───────────────────────────────────────

  addTimer(handle) {
    this._timers.push(handle);
  }

  _clearTimers() {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
  }

  // ── 직렬화 ────────────────────────────────────────────

  toPublicState() {
    return {
      phase:     this.phase,
      callerId:  this.callerId,
      bodyId:    this.bodyId,
      reason:    this.reason,
      voteCount: this.votes.size,
      result:    this.result,
    };
  }
}

module.exports = { VoteSession, VOTE_PHASE };