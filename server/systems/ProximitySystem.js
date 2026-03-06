// src/systems/ProximitySystem.js

const EventBus = require('../engine/EventBus');

// 킬 가능 거리 (UWB는 정확하니 좁게, BLE는 오차 있으니 넓게)
const KILL_RANGE = {
  uwb: 1.5,  // 미터
  ble: 3.0,
};

// 측정값 유효 시간
const STALE_THRESHOLD = {
  uwb: 3000,   // 3초
  ble: 8000,   // 8초 (BLE는 갱신이 느림)
};

class ProximitySystem {
  constructor() {
    // 거리 행렬
    // { roomId: { fromId: { toId: { distance, method, updatedAt, direction } } } }
    this.matrix = new Map();
  }

  // ── 초기화 ─────────────────────────────────────────────

  initRoom(roomId) {
    if (!this.matrix.has(roomId)) {
      this.matrix.set(roomId, new Map());
    }
  }

  cleanupRoom(roomId) {
    this.matrix.delete(roomId);
  }

  // ── 거리 업데이트 ──────────────────────────────────────

  updateDistance(roomId, fromId, toId, { distanceM, method, direction = null }) {
    if (!this.matrix.has(roomId)) this.initRoom(roomId);

    const roomMatrix = this.matrix.get(roomId);

    if (!roomMatrix.has(fromId)) roomMatrix.set(fromId, new Map());

    roomMatrix.get(fromId).set(toId, {
      distance:  distanceM,
      method,               // 'uwb' | 'ble'
      direction,            // UWB만 가능: { x, y, z } 방향 벡터
      updatedAt: Date.now(),
    });

    // 반대 방향도 대칭으로 저장 (A→B 측정되면 B→A도 동일값 저장)
    if (!roomMatrix.has(toId)) roomMatrix.set(toId, new Map());
    roomMatrix.get(toId).set(fromId, {
      distance:  distanceM,
      method,
      direction: null,  // 반대 방향은 방향 벡터 없음
      updatedAt: Date.now(),
    });
  }

  // ── 두 플레이어 간 거리 조회 ───────────────────────────

  getDistance(roomId, fromId, toId) {
    const record = this.matrix.get(roomId)
      ?.get(fromId)
      ?.get(toId);

    if (!record) return null;

    const threshold = STALE_THRESHOLD[record.method];
    const isStale   = Date.now() - record.updatedAt > threshold;
    if (isStale) return null;

    return record;
  }

  // ── 킬 가능 여부 판정 ──────────────────────────────────

  canKill(roomId, impostorId, targetId) {
    const record = this.getDistance(roomId, impostorId, targetId);

    if (!record) {
      return {
        possible: false,
        reason:   '거리 정보 없음 (가까이 접근하세요)',
      };
    }

    const killRange = KILL_RANGE[record.method];

    if (record.distance > killRange) {
      return {
        possible:  false,
        reason:    `범위 초과 (현재 ${record.distance.toFixed(1)}m, 필요 ${killRange}m 이내)`,
        distance:  record.distance,
        killRange,
        method:    record.method,
      };
    }

    return {
      possible:  true,
      distance:  record.distance,
      direction: record.direction,
      method:    record.method,
    };
  }

  // ── 특정 플레이어 주변 플레이어 목록 ──────────────────

  getNearbyPlayers(roomId, playerId, radiusM = 5.0) {
    const roomMatrix = this.matrix.get(roomId);
    if (!roomMatrix) return [];

    const playerDistances = roomMatrix.get(playerId);
    if (!playerDistances) return [];

    const nearby = [];

    for (const [targetId, record] of playerDistances) {
      const threshold = STALE_THRESHOLD[record.method];
      const isStale   = Date.now() - record.updatedAt > threshold;
      if (isStale) continue;

      if (record.distance <= radiusM) {
        nearby.push({
          playerId:  targetId,
          distance:  record.distance,
          direction: record.direction,
          method:    record.method,
        });
      }
    }

    // 가까운 순 정렬
    return nearby.sort((a, b) => a.distance - b.distance);
  }

  // ── 전체 거리 행렬 스냅샷 (AI용) ──────────────────────

  getFullMatrix(roomId) {
    const roomMatrix = this.matrix.get(roomId);
    if (!roomMatrix) return {};

    const result = {};

    for (const [fromId, targets] of roomMatrix) {
      result[fromId] = {};
      for (const [toId, record] of targets) {
        const threshold = STALE_THRESHOLD[record.method];
        const isStale   = Date.now() - record.updatedAt > threshold;
        if (!isStale) {
          result[fromId][toId] = {
            distance: record.distance,
            method:   record.method,
          };
        }
      }
    }

    return result;
  }
}

module.exports = new ProximitySystem();