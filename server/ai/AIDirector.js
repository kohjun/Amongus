// src/ai/AIDirector.js
//
// 역할: 게임 이벤트를 받아 LLM으로 실시간 해설/가이드 메시지를 생성
//
// 메시지 종류 두 가지:
//   - 공개 해설 (ai_message)  : 전체 방에 브로드캐스트, gpt-4o-mini 사용 (빠름)
//   - 개인 가이드 (ai_guide)  : 특정 플레이어에게만 전송, gpt-4o 사용 (정확)
//
// 원칙:
//   - 크루원에게 임포스터 정보 절대 누설 금지
//   - 모든 메시지는 3문장 이내, 한국어, 이모지 활용

'use strict';

const { chat }                 = require('./LLMClient');
const { SYSTEM_PROMPT, PROMPTS } = require('./prompt');
const ProximitySystem          = require('../systems/ProximitySystem'); //(미구현)

// ── 개인 가이드 발송 간격 (ms) ─────────────────────────────
const GUIDE_INTERVAL_MS = 60 * 1000; // 60초마다

// ── 쿨다운 관리 (같은 이벤트 중복 방지) ──────────────────────
// { roomId_eventKey: lastCalledAt }
const cooldowns = new Map();

function isOnCooldown(roomId, eventKey, cooldownMs = 5000) {
  const key  = `${roomId}_${eventKey}`;
  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < cooldownMs) return true;
  cooldowns.set(key, Date.now());
  return false;
}

// ── 내부 헬퍼: LLM 호출 래퍼 ─────────────────────────────────
async function generate(prompt, model = 'fast') {
  return chat({
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    model,
    maxTokens: 150,
  });
}

// ── 내부 헬퍼: 플레이어 주변 정보 조회 ───────────────────────
function getNearbyInfo(room, player) {
  const matrix  = ProximitySystem.getNearbyPlayers(room.roomId, player.userId, 8.0);
  return matrix
    .filter(({ playerId }) => {
      const p = room.getPlayer(playerId);
      return p && p.isAlive;
    })
    .map(({ playerId, distance }) => ({
      nickname: room.getPlayer(playerId).nickname,
      distance,
    }));
}

// ════════════════════════════════════════════════════════════
//  공개 해설 메서드 (전체 방 브로드캐스트용)
// ════════════════════════════════════════════════════════════

/**
 * 게임 시작 인트로 멘트
 */
async function onGameStart(room) {
  const impostorCount = room.aliveImpostors.length;
  const prompt = PROMPTS.gameStart(room.players.size, impostorCount);
  return generate(prompt, 'fast');
}

/**
 * 킬 발생 직후 분위기 멘트
 * (누가 죽었는지 공개 전 — 불길한 분위기만)
 */
async function onKill(room, impostor, target) {
  if (isOnCooldown(room.roomId, 'kill', 3000)) {
    return '🔴 어둠 속에서 무언가 일어났습니다...';
  }

  const prompt = PROMPTS.kill(
    target.nickname,
    target.zone,
    room.killLog.length,
    room.aliveCrew.length,
    room.aliveImpostors.length,
  );
  return generate(prompt, 'fast');
}

/**
 * 회의 소집 멘트 (시체 신고 or 긴급버튼)
 */
async function onMeeting(room, caller, reason, body = null) {
  let prompt;

  if (reason === 'report' && body) {
    prompt = PROMPTS.bodyReport(
      caller.nickname,
      body.nickname,
      body.zone,
      room.meetingCount,
    );
  } else {
    prompt = PROMPTS.emergencyMeeting(caller.nickname, room.meetingCount);
  }

  return generate(prompt, 'fast');
}

/**
 * 토론 중반 유도 멘트 (30초 경과 후)
 */
async function onDiscussionGuide(room) {
  const alivePlayers = room.alivePlayers.map(p => p.nickname);
  const progress     = {
    percent: room.totalMissions === 0
      ? 0
      : Math.floor((room.completedMissions / room.totalMissions) * 100),
  };

  const prompt = PROMPTS.discussionGuide(
    alivePlayers,
    room.killLog,
    progress,
  );
  return generate(prompt, 'fast');
}

/**
 * 투표 결과 멘트
 */
async function onVoteResult(room, result, ejected) {
  let prompt;

  if (!ejected) {
    // 추방 없음 (동률 or SKIP)
    prompt = PROMPTS.ejectNone(result.isTied);
  } else if (result.wasImpostor) {
    // 임포스터 추방 성공
    prompt = PROMPTS.ejectImpostor(
      ejected.nickname,
      result.voteCount,
      room.aliveImpostors.length,
    );
  } else {
    // 크루원 오추방
    prompt = PROMPTS.ejectCrew(ejected.nickname, result.voteCount);
  }

  return generate(prompt, 'fast');
}

/**
 * 미션 진행도 마일스톤 멘트 (25 / 50 / 75%)
 */
async function onMissionMilestone(room, progress) {
  if (isOnCooldown(room.roomId, `milestone_${progress.percent}`, 60000)) {
    return null; // 중복 방지
  }

  const prompt = PROMPTS.missionMilestone(
    progress.percent,
    room.aliveCrew.length,
    room.aliveImpostors.length,
  );
  return generate(prompt, 'fast');
}

/**
 * 게임 종료 멘트
 */
async function onGameEnd(room, result) {
  const impostors = room.aliveImpostors.map(p => p.nickname);

  // 사망한 임포스터도 포함
  const allImpostors = [...room.players.values()]
    .filter(p => p.role === 'impostor')
    .map(p => p.nickname);

  let prompt;
  if (result.winner === 'crew') {
    prompt = PROMPTS.crewWin(result.reason, allImpostors);
  } else {
    prompt = PROMPTS.impostorWin(allImpostors);
  }

  return generate(prompt, 'fast');
}

// ════════════════════════════════════════════════════════════
//  개인 가이드 메서드 (특정 플레이어에게만 전송)
// ════════════════════════════════════════════════════════════

/**
 * 크루원 개인 가이드 생성
 */
async function generateCrewGuide(room, player) {
  const nearby    = getNearbyInfo(room, player);
  const progress  = {
    percent: room.totalMissions === 0
      ? 0
      : Math.floor((room.completedMissions / room.totalMissions) * 100),
  };

  const pendingTasks = player.tasks.filter(t => t.status !== 'completed');

  const prompt = PROMPTS.crewGuide(
    player.nickname,
    pendingTasks,
    nearby,
    room.killLog,
    progress,
  );

  return generate(prompt, 'precise');
}

/**
 * 임포스터 개인 가이드 생성
 */
async function generateImpostorGuide(room, player) {
  const nearby   = getNearbyInfo(room, player);
  const progress = {
    percent: room.totalMissions === 0
      ? 0
      : Math.floor((room.completedMissions / room.totalMissions) * 100),
  };

  const aliveCrew = room.aliveCrew.map(p => p.nickname);

  const prompt = PROMPTS.impostorGuide(
    player.nickname,
    aliveCrew,
    nearby,
    progress,
    room.meetingCount,
  );

  return generate(prompt, 'precise');
}

// ════════════════════════════════════════════════════════════
//  개인 가이드 스케줄러
//  게임 시작 후 일정 간격으로 각 플레이어에게 개인 가이드 전송
// ════════════════════════════════════════════════════════════

/**
 * @param {GameRoom} room
 * @param {Server}   io    - Socket.IO 서버 인스턴스
 */
function startGuideScheduler(room, io) {
  const intervalHandle = setInterval(async () => {
    // 게임 종료 시 스케줄러 중단
    if (room.status === 'ended') {
      clearInterval(intervalHandle);
      return;
    }

    // 회의 중에는 가이드 발송 안 함
    if (room.status === 'meeting') return;

    for (const [, player] of room.players) {
      if (!player.isAlive) continue;

      try {
        let message;

        if (player.role === 'crew') {
          message = await generateCrewGuide(room, player);
        } else {
          message = await generateImpostorGuide(room, player);
        }

        // 개인 가이드: 해당 소켓에만 전송
        const socket = getSocket(io, player.userId);
        if (socket && message) {
          socket.emit('ai_guide', {
            type:    player.role === 'crew' ? 'crew_guide' : 'impostor_guide',
            message,
          });
        }
      } catch (err) {
        console.error(`[AIDirector] 개인 가이드 생성 실패 (${player.nickname}):`, err.message);
      }
    }
  }, GUIDE_INTERVAL_MS);

  // 방 객체에 핸들 저장 (외부에서 취소 가능)
  room._guideScheduler = intervalHandle;
}

/**
 * 스케줄러 수동 중단 (게임 종료 시 GameEngine에서 호출 가능)
 */
function stopGuideScheduler(room) {
  if (room._guideScheduler) {
    clearInterval(room._guideScheduler);
    room._guideScheduler = null;
  }
}

// ── 소켓 조회 헬퍼 ────────────────────────────────────────
function getSocket(io, userId) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.userId === userId) return socket;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  exports
// ════════════════════════════════════════════════════════════

module.exports = {
  // 공개 해설
  onGameStart,
  onKill,
  onMeeting,
  onDiscussionGuide,
  onVoteResult,
  onMissionMilestone,
  onGameEnd,

  // 개인 가이드
  generateCrewGuide,
  generateImpostorGuide,

  // 스케줄러
  startGuideScheduler,
  stopGuideScheduler,
};