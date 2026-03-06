// src/systems/MissionSystem.js

const { MISSION_POOL, FAKE_MISSIONS } = require('./missions/missionDefinitions');
const { PlayerMission, MISSION_STATUS } = require('./missions/PlayerMission');

class MissionSystem {

  // ── 미션 배정 ──────────────────────────────────────────

  assignMissions(room) {
    const pool        = [...MISSION_POOL];
    let   totalCount  = 0;

    for (const [, player] of room.players) {

      if (player.role === 'impostor') {
        // 임포스터는 가짜 미션 2개 (위장용)
        player.tasks = this._pickFakeMissions(2);
        continue;
      }

      // 크루원: 실제 미션 배정
      const count    = room.settings.missionPerCrew;
      const missions = this._pickMissions(pool, count, player);
      player.tasks   = missions;
      totalCount    += missions.length;
    }

    // 전체 미션 수 설정
    room.totalMissions = totalCount;
    return totalCount;
  }

  _pickMissions(pool, count, player) {
    // 이미 같은 플레이어에게 배정된 구역 제외 (중복 구역 방지)
    const usedZones = new Set();
    const picked    = [];

    // 난이도 순 섞기
    const shuffled = pool.sort(() => Math.random() - 0.5);

    for (const def of shuffled) {
      if (picked.length >= count) break;
      if (usedZones.has(def.zone)) continue;

      picked.push(new PlayerMission(def));
      usedZones.add(def.zone);

      // 풀에서 제거 (다른 플레이어와 겹쳐도 됨, 여기선 허용)
    }

    // 부족하면 구역 중복 허용하고 채움
    if (picked.length < count) {
      for (const def of shuffled) {
        if (picked.length >= count) break;
        if (picked.some(m => m.missionId === def.missionId)) continue;
        picked.push(new PlayerMission(def));
      }
    }

    return picked;
  }

  _pickFakeMissions(count) {
    return FAKE_MISSIONS
      .sort(() => Math.random() - 0.5)
      .slice(0, count)
      .map(def => new PlayerMission(def));
  }

  // ── 미션 시작 (구역 진입 시) ───────────────────────────

  handleZoneEnter(room, player, zone) {
    const results = [];

    for (const task of player.tasks) {
      if (task.status !== MISSION_STATUS.PENDING) continue;
      if (task.zone !== zone) continue;

      // STAY 미션은 구역 진입 시 자동 시작
      if (task.type === 'stay') {
        task.enterZone();
        results.push({ missionId: task.missionId, event: 'stay_started' });
      }
      // QR/MINI_GAME은 시작 가능 상태만 표시
      else {
        task.start();
        results.push({ missionId: task.missionId, event: 'available' });
      }
    }

    return results;
  }

  // ── 구역 이탈 시 ───────────────────────────────────────

  handleZoneLeave(room, player, zone) {
    for (const task of player.tasks) {
      if (task.zone !== zone) continue;

      // STAY 미션 타이머 일시정지
      if (task.type === 'stay' && task.status === MISSION_STATUS.IN_PROGRESS) {
        task.leaveZone();

        // 완료 조건 충족 시
        if (task.isStayComplete()) {
          this._completeMission(room, player, task);
        }
      }
    }
  }

  // ── QR 스캔 완료 ───────────────────────────────────────

  handleQRScan(room, player, scannedMissionId) {
    const task = player.tasks.find(
      t => t.missionId === scannedMissionId && t.type === 'qr_scan'
    );

    if (!task) {
      return { ok: false, error: '해당 미션을 찾을 수 없습니다.' };
    }
    if (task.zone !== player.zone) {
      return { ok: false, error: '올바른 구역에 있지 않습니다.' };
    }
    if (task.status === MISSION_STATUS.COMPLETED) {
      return { ok: false, error: '이미 완료된 미션입니다.' };
    }

    task.start();
    return this._completeMission(room, player, task);
  }

  // ── 미니게임 완료 ──────────────────────────────────────

  handleMiniGameComplete(room, player, missionId, gameResult) {
    const task = player.tasks.find(
      t => t.missionId === missionId && t.type === 'mini_game'
    );

    if (!task) {
      return { ok: false, error: '미션을 찾을 수 없습니다.' };
    }
    if (task.isFake) {
      // 임포스터의 가짜 미션 - 완료 처리 안 함, 하지만 UI는 완료처럼 보임
      return { ok: true, fake: true };
    }
    if (task.status === MISSION_STATUS.COMPLETED) {
      return { ok: false, error: '이미 완료된 미션입니다.' };
    }

    // 미니게임 성공 여부 검증
    if (!gameResult.success) {
      task.fail();
      return { ok: false, failed: true, error: '미니게임 실패' };
    }

    return this._completeMission(room, player, task);
  }

  // ── 미션 완료 공통 처리 ────────────────────────────────

  _completeMission(room, player, task) {
    task.complete();
    room.completedMissions++;

    // 재화 지급
    if (task.reward?.currency) {
      player.currency += task.reward.currency;
    }

    // 연속 완료 카운트 (아이템 조건용)
    room.consecutiveTasks = room.consecutiveTasks || {};
    room.consecutiveTasks[player.userId] =
      (room.consecutiveTasks[player.userId] || 0) + 1;

    const allDone = player.tasks
      .filter(t => !t.isFake)
      .every(t => t.status === MISSION_STATUS.COMPLETED);

    return {
      ok:              true,
      missionId:       task.missionId,
      reward:          task.reward,
      allTasksDone:    allDone,
      totalCompleted:  room.completedMissions,
      totalMissions:   room.totalMissions,
    };
  }

  // ── STAY 미션 실시간 진행도 체크 (폴링용) ─────────────

  checkStayProgress(player) {
    const results = [];

    for (const task of player.tasks) {
      if (task.type !== 'stay') continue;
      if (task.status !== MISSION_STATUS.IN_PROGRESS) continue;

      const progress = task.getStayProgress();
      results.push({ missionId: task.missionId, ...progress });

      // 완료 조건 충족
      if (task.isStayComplete() && task.stayStartedAt) {
        task.leaveZone();
        // 완료는 leaveZone에서 처리됨
      }
    }

    return results;
  }

  // ── 전체 미션 진행도 반환 ──────────────────────────────

  getProgressBar(room) {
    const percent = room.totalMissions === 0
      ? 0
      : Math.floor((room.completedMissions / room.totalMissions) * 100);

    return {
      completed: room.completedMissions,
      total:     room.totalMissions,
      percent,
    };
  }
}

module.exports = new MissionSystem();