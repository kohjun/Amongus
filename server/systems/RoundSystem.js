// server/systems/RoundSystem.js
//
// 페이즈/라운드 사이클 관리
// 마피아의 낮/밤, 경찰도둑의 chase/rest, 어몽어스의 playing/meeting
// 모두 이 시스템이 관리합니다.
//
// GamePlugin.getPhaseConfig()가 반환하는 설정을 주입받아 동작합니다.

'use strict';

const EventBus = require('../engine/EventBus');

class RoundSystem {
  constructor() {
    // { roomId: RoundSession }
    this.sessions = new Map();
  }

  // ── 초기화 ──────────────────────────────────────────
  // config 예시 (마피아):
  // {
  //   initialPhase: 'day',
  //   phases: [
  //     { id: 'day',   duration: 180, label: '낮',
  //       transitions: [{ to: 'night', trigger: 'timer' }] },
  //     { id: 'night', duration: 60,  label: '밤',
  //       transitions: [{ to: 'day',  trigger: 'timer' }] },
  //   ]
  // }
  init(roomId, config) {
    const session = {
      config,
      currentPhase:  config.initialPhase,
      roundNumber:   1,
      phaseStartAt:  Date.now(),
      phaseTimer:    null,
    };

    this.sessions.set(roomId, session);
    this._schedulePhaseTimer(roomId, session);

    console.log(`[RoundSystem] 방 ${roomId} 초기화: phase=${config.initialPhase}`);
  }

  cleanupRoom(roomId) {
    const session = this.sessions.get(roomId);
    if (session?.phaseTimer) clearTimeout(session.phaseTimer);
    this.sessions.delete(roomId);
  }

  // ── 현재 페이즈 조회 ─────────────────────────────────
  getCurrentPhase(roomId) {
    return this.sessions.get(roomId)?.currentPhase ?? 'playing';
  }

  getRoundNumber(roomId) {
    return this.sessions.get(roomId)?.roundNumber ?? 1;
  }

  getPhaseRemaining(roomId) {
    const session = this.sessions.get(roomId);
    if (!session) return 0;

    const phaseDef = session.config.phases.find(p => p.id === session.currentPhase);
    if (!phaseDef?.duration) return null;

    const elapsed = (Date.now() - session.phaseStartAt) / 1000;
    return Math.max(0, phaseDef.duration - elapsed);
  }

  // ── 수동 페이즈 전환 (trigger: 'manual') ─────────────
  nextPhase(roomId, toPhaseId = null) {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // 타이머 취소
    if (session.phaseTimer) clearTimeout(session.phaseTimer);

    const phaseDef    = session.config.phases.find(p => p.id === session.currentPhase);
    const transition  = phaseDef?.transitions?.[0];
    const nextPhaseId = toPhaseId || transition?.to;

    if (!nextPhaseId) {
      console.warn(`[RoundSystem] 전환할 페이즈 없음: ${session.currentPhase}`);
      return;
    }

    const prevPhase    = session.currentPhase;
    session.currentPhase = nextPhaseId;
    session.phaseStartAt = Date.now();

    // 낮 → 밤 전환 시 라운드 번호 증가
    if (nextPhaseId === session.config.initialPhase) {
      session.roundNumber++;
    }

    const room = this._getRoom(roomId);
    EventBus.emit('phase_changed', {
      room,
      prevPhase,
      nextPhase:   nextPhaseId,
      roundNumber: session.roundNumber,
    });

    console.log(`[RoundSystem] ${roomId}: ${prevPhase} → ${nextPhaseId} (라운드 ${session.roundNumber})`);

    // 다음 페이즈 타이머 등록
    this._schedulePhaseTimer(roomId, session);
  }

  // ── 페이즈 강제 설정 (meeting 같은 특수 상황) ─────────
  setPhase(roomId, phaseId) {
    const session = this.sessions.get(roomId);
    if (!session) return;
    if (session.phaseTimer) clearTimeout(session.phaseTimer);

    const prevPhase      = session.currentPhase;
    session.currentPhase = phaseId;
    session.phaseStartAt = Date.now();

    const room = this._getRoom(roomId);
    EventBus.emit('phase_changed', { room, prevPhase, nextPhase: phaseId, roundNumber: session.roundNumber });
  }

  // ── 내부: 타이머 기반 자동 전환 ───────────────────────
  _schedulePhaseTimer(roomId, session) {
    const phaseDef   = session.config.phases.find(p => p.id === session.currentPhase);
    const transition = phaseDef?.transitions?.find(t => t.trigger === 'timer');

    if (!transition || !phaseDef.duration) return;

    session.phaseTimer = setTimeout(() => {
      this.nextPhase(roomId, transition.to);
    }, phaseDef.duration * 1000);
  }

  _getRoom(roomId) {
    try {
      return require('../engine/GameEngine').getRoom(roomId);
    } catch {
      return { roomId };
    }
  }
}

module.exports = new RoundSystem();