// server/systems/TagSystem.js
//
// 포획/태그 처리 시스템
// ProximitySystem이 거리를 측정하고,
// TagSystem이 그 데이터로 게임 규칙(포획/탈출/태그)을 처리합니다.
//
// 지원 게임: 경찰과 도둑, 꼬리잡기, 좀비 감염, 술래잡기 등

'use strict';

const EventBus        = require('../engine/EventBus');
const ProximitySystem = require('./ProximitySystem');

// 태그 방식
const TAG_MODE = {
  PROXIMITY: 'proximity',   // 거리 기반 자동 감지 (꼬리잡기)
  MANUAL:    'manual',      // 버튼 클릭 (경찰도둑의 포획 버튼)
  ZONE:      'zone',        // 특정 구역 도달 시 (감옥 구역 입장)
};

class TagSystem {
  constructor() {
    // { roomId: TagSession }
    this.sessions = new Map();
  }

  // ── 초기화 ──────────────────────────────────────────
  initRoom(roomId, config = {}) {
    this.sessions.set(roomId, {
      config: {
        mode:         config.mode         || TAG_MODE.MANUAL,
        tagRange:     config.tagRange     || 1.5,    // 미터
        tagCooldown:  config.tagCooldown  || 3000,   // ms
        jailZone:     config.jailZone     || null,   // 감옥 구역 id
      },
      tagLog:    [],           // 태그 기록
      lastTag:   new Map(),    // { taggerId: lastTagTimestamp }
      taggedPlayers: new Set(), // 현재 태그된 플레이어들
    });
  }

  cleanupRoom(roomId) {
    this.sessions.delete(roomId);
  }

  getSession(roomId) {
    const session = this.sessions.get(roomId);
    if (!session) throw new Error(`TagSystem: 방 ${roomId}이 초기화되지 않았습니다.`);
    return session;
  }

  // ── 태그 가능 여부 체크 ─────────────────────────────
  canTag(roomId, taggerId, targetId) {
    const session = this.getSession(roomId);
    const { mode, tagRange, tagCooldown } = session.config;

    // 쿨다운 체크
    const lastTagTime = session.lastTag.get(taggerId) || 0;
    if (Date.now() - lastTagTime < tagCooldown) {
      const remaining = Math.ceil((tagCooldown - (Date.now() - lastTagTime)) / 1000);
      return { possible: false, reason: `태그 쿨다운 중 (${remaining}초)` };
    }

    // 거리 체크 (MANUAL 모드도 거리 검증)
    if (mode === TAG_MODE.MANUAL || mode === TAG_MODE.PROXIMITY) {
      const record = ProximitySystem.getDistance(roomId, taggerId, targetId);
      if (!record) {
        return { possible: false, reason: '거리 정보 없음' };
      }
      if (record.distance > tagRange) {
        return {
          possible: false,
          reason:   `범위 초과 (${record.distance.toFixed(1)}m / 필요: ${tagRange}m)`,
        };
      }
    }

    return { possible: true };
  }

  // ── 태그 실행 ────────────────────────────────────────
  tag(room, tagger, target) {
    const session = this.getSession(room.roomId);
    const check   = this.canTag(room.roomId, tagger.userId, target.userId);

    if (!check.possible) throw new Error(check.reason);

    // 태그 기록
    const record = {
      taggerId:  tagger.userId,
      targetId:  target.userId,
      timestamp: Date.now(),
      zone:      target.zone,
    };

    session.tagLog.push(record);
    session.lastTag.set(tagger.userId, Date.now());
    session.taggedPlayers.add(target.userId);

    EventBus.emit('player_tagged', { room, tagger, target });
    return record;
  }

  // ── 탈출 처리 ────────────────────────────────────────
  // 감옥 구역이 있는 게임에서 탈출 구역 도달 시 호출
  escape(room, player, escapeZone) {
    const session = this.getSession(room.roomId);
    if (!session.taggedPlayers.has(player.userId)) {
      return { ok: false, reason: '태그되지 않은 플레이어' };
    }

    session.taggedPlayers.delete(player.userId);
    EventBus.emit('player_escaped', { room, player, escapeZone });
    return { ok: true };
  }

  // ── 태그 가능 대상 목록 (실시간) ─────────────────────
  getTaggableTargets(room, taggerId, targetTeam) {
    const session  = this.getSession(room.roomId);
    const { tagRange } = session.config;
    const nearby   = ProximitySystem.getNearbyPlayers(room.roomId, taggerId, tagRange);
    const taggable = [];

    for (const { playerId, distance } of nearby) {
      const target = room.getPlayer(playerId);
      if (!target || !target.isAlive) continue;
      if (targetTeam && target.team !== targetTeam) continue;
      if (session.taggedPlayers.has(playerId)) continue; // 이미 태그됨

      taggable.push({ playerId, nickname: target.nickname, distance });
    }

    return taggable;
  }

  // ── 태그 로그 조회 ────────────────────────────────────
  getTagLog(roomId) {
    return this.getSession(roomId).tagLog;
  }

  isTagged(roomId, playerId) {
    return this.getSession(roomId).taggedPlayers.has(playerId);
  }
}

module.exports = new TagSystem();
module.exports.TAG_MODE = TAG_MODE;