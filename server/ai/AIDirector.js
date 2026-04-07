// server/ai/AIDirector.js v2
'use strict';

const { chat }               = require('./LLMClient');
const { SYSTEM_PROMPT, PROMPTS } = require('./prompt');
const ProximitySystem        = require('../systems/ProximitySystem');
const { retrieve }           = require('./rag/ragRetriever');
const GamePluginRegistry     = require('../games/GamePluginRegistry');

const GUIDE_INTERVAL_MS = 60 * 1000;
const cooldowns         = new Map();

function isOnCooldown(key, ms = 5000) {
  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < ms) return true;
  cooldowns.set(key, Date.now());
  return false;
}

// ── 대화 히스토리 ────────────────────────────────────
const conversationHistory = new Map();
const MAX_TURNS = 10;

function getHistory(roomId, userId) {
  const key = `${roomId}_${userId}`;
  if (!conversationHistory.has(key)) conversationHistory.set(key, []);
  return conversationHistory.get(key);
}

function addHistory(roomId, userId, role, content) {
  const h = getHistory(roomId, userId);
  h.push({ role, content });
  if (h.length > MAX_TURNS * 2) h.splice(0, 2);
}

function clearHistory(roomId, userId) {
  conversationHistory.delete(`${roomId}_${userId}`);
}

// ════════════════════════════════════════════════════
//  RAG 기반 질의응답 (v2 핵심)
// ════════════════════════════════════════════════════

async function ask(room, player, question) {
  try {
    // 1. 플러그인 조회
    const plugin = GamePluginRegistry.get(room.gameType);

    // 2. 현재 페이즈 파악 (RAG 필터용)
    const phase = plugin.getCurrentPhase(room);

    // 3. RAG 검색 (game_type 격리 + 역할 필터 + 페이즈 필터 + 부모 fetch)
    const { context, sources, found } = await retrieve(
      question,
      room.gameType,
      player.team === 'impostor' ? 'impostor' : 'crew',
      phase
    );

    // 4. 동적 프롬프트 조립 (Plugin 위임)
    const systemPrompt = [
      plugin.getSystemPrompt(player.roleId, player.nickname),
      found ? `\n[관련 게임 규칙]\n${context}` : '',
      `\n[현재 게임 상황]\n${plugin.buildStateContext(room, player)}`,
    ].join('\n');

    // 5. 대화 히스토리 포함 Gemini 호출
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const genModel = genAI.getGenerativeModel({
      model:             'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    });

    // OpenAI 형식(user/assistant) → Gemini 형식(user/model) 변환
    const geminiHistory = getHistory(room.roomId, player.userId).map(msg => ({
      role:  msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const chatSession = genModel.startChat({
      history:          geminiHistory,
      generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
    });

    const res    = await chatSession.sendMessage(question);
    const answer = res.response.text().trim();

    // 6. 히스토리 저장 (내부 포맷은 OpenAI 호환 유지)
    addHistory(room.roomId, player.userId, 'user',      question);
    addHistory(room.roomId, player.userId, 'assistant', answer);

    return { answer, sources };

  } catch (e) {
    console.error('[AIDirector.ask] 오류:', e.message);
    return { answer: '죄송해요, 잠시 후 다시 물어봐주세요! 🙏', sources: [] };
  }
}

// ── 공개 해설 ─────────────────────────────────────────

async function onGameStart(room) {
  return chat({ prompt: PROMPTS.gameStart(room.players.size), systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

async function onKill(room, killer, target) {
  if (isOnCooldown(`${room.roomId}_kill`, 3000)) return null;
  return chat({ prompt: PROMPTS.kill(target.nickname, target.zone, room.killLog.length, room.aliveCrew?.length ?? 0), systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

async function onMeeting(room, caller, reason, body = null) {
  const prompt = reason === 'report' && body
    ? PROMPTS.bodyReport(caller.nickname, body.nickname, body.zone, room.meetingCount)
    : PROMPTS.emergencyMeeting(caller.nickname, room.meetingCount);
  return chat({ prompt, systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

async function onDiscussionGuide(room) {
  const alivePlayers = room.alivePlayers.map(p => p.nickname);
  const progress     = { percent: room.totalMissions === 0 ? 0 : Math.floor((room.completedMissions / room.totalMissions) * 100) };
  return chat({ prompt: PROMPTS.discussionGuide(alivePlayers, room.killLog, progress), systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

async function onVoteResult(room, result, ejected) {
  let prompt;
  if (!ejected)                prompt = PROMPTS.ejectNone(result.isTied);
  else if (result.wasImpostor) prompt = PROMPTS.ejectImpostor(ejected.nickname, result.voteCount, room.aliveImpostors?.length ?? 0);
  else                         prompt = PROMPTS.ejectCrew(ejected.nickname, result.voteCount);
  return chat({ prompt, systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

async function onMissionMilestone(room, progress) {
  if (isOnCooldown(`${room.roomId}_milestone_${progress.percent}`, 60000)) return null;
  return chat({ prompt: PROMPTS.missionMilestone(progress.percent, room.aliveCrew?.length ?? 0), systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

async function onGameEnd(room, result) {
  const allImpostors = [...room.players.values()].filter(p => p.team === 'impostor').map(p => p.nickname);
  const prompt = result.winner === 'crew'
    ? PROMPTS.crewWin(result.reason, allImpostors)
    : PROMPTS.impostorWin(allImpostors);
  return chat({ prompt, systemPrompt: SYSTEM_PROMPT, model: 'fast' });
}

// ── 소켓 조회 헬퍼 ───────────────────────────────────

function getSocket(io, userId) {
  for (const [, s] of io.sockets.sockets) {
    if (s.userId === userId) return s;
  }
  return null;
}

// ── 개인 가이드 ───────────────────────────────────────

async function generateGuide(room, player) {
  const plugin  = GamePluginRegistry.get(room.gameType);
  const context = plugin.buildStateContext(room, player);
  const role    = player.team === 'impostor' ? 'impostor' : 'crew';
  const prompt  = role === 'crew'
    ? PROMPTS.crewGuide(player.nickname, player.tasks?.filter(t => t.status !== 'completed'), [], room.killLog, { percent: 0 })
    : PROMPTS.impostorGuide(player.nickname, room.aliveCrew?.map(p => p.nickname) ?? [], [], { percent: 0 }, room.meetingCount);
  return chat({ prompt, systemPrompt: SYSTEM_PROMPT, model: 'precise' });
}

function startGuideScheduler(room, io) {
  // io를 명시적으로 클로저에 캡처 — setInterval 콜백 내부에서 안전하게 참조
  const _io = io;

  const handle = setInterval(async () => {
    if (room.status === 'ended')   { clearInterval(handle); return; }
    if (room.status === 'meeting') return;

    for (const [, player] of room.players) {
      if (!player.isAlive) continue;
      try {
        const message = await generateGuide(room, player);
        const s = getSocket(_io, player.userId);
        const type = player.team === 'impostor' ? 'impostor_guide' : 'crew_guide';
        if (s && message) s.emit('ai_guide', { type, message });
      } catch (e) {
        console.error(`[AIDirector] 가이드 실패 (${player.nickname}):`, e.message);
      }
    }
  }, GUIDE_INTERVAL_MS);

  room._guideScheduler = handle;
}

function stopGuideScheduler(room) {
  if (room._guideScheduler) { clearInterval(room._guideScheduler); room._guideScheduler = null; }
  for (const [, player] of room.players) clearHistory(room.roomId, player.userId);
}

module.exports = {
  ask,
  onGameStart, onKill, onMeeting, onDiscussionGuide, onVoteResult,
  onMissionMilestone, onGameEnd,
  startGuideScheduler, stopGuideScheduler,
};