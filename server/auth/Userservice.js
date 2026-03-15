// src/auth/userService.js
// Firestore 유저 데이터 관리
//
// 컬렉션 구조:
//   users/{userId}
//     ├── nickname
//     ├── email
//     ├── createdAt
//     ├── lastLoginAt
//     └── stats/
//           ├── gamesPlayed
//           ├── gamesWon
//           ├── totalKills      (임포스터로서)
//           ├── totalMissions   (크루원으로서)
//           └── winRate
//
//   gameHistory/{gameId}
//     ├── players[]
//     ├── winner
//     ├── reason
//     ├── duration
//     └── playedAt

'use strict';

const { db } = require('./firebaseAdmin');

// ── 컬렉션 참조 ────────────────────────────────────────
const usersCol       = () => db.collection('users');
const gameHistoryCol = () => db.collection('gameHistory');

// ════════════════════════════════════════════════════════
//  유저 프로필
// ════════════════════════════════════════════════════════

/**
 * 로그인 시 유저 프로필 생성 또는 업데이트 (upsert)
 * 처음 로그인이면 stats 초기화, 재로그인이면 lastLoginAt만 갱신
 */
async function upsertUser({ userId, nickname, email }) {
  const ref = usersCol().doc(userId);
  const doc = await ref.get();

  if (!doc.exists) {
    // 최초 가입
    await ref.set({
      userId,
      nickname,
      email,
      createdAt:   new Date(),
      lastLoginAt: new Date(),
      stats: {
        gamesPlayed:  0,
        gamesWon:     0,
        totalKills:   0,
        totalMissions: 0,
        winRate:      0,
      },
    });
    console.log(`[UserService] 신규 유저 생성: ${nickname}`);
  } else {
    // 재로그인 — lastLoginAt, nickname만 갱신 (닉네임 변경 반영)
    await ref.update({
      nickname,
      lastLoginAt: new Date(),
    });
  }

  return (await ref.get()).data();
}

/**
 * 유저 프로필 조회
 */
async function getUser(userId) {
  const doc = await usersCol().doc(userId).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * 닉네임 중복 체크
 */
async function isNicknameTaken(nickname) {
  const snap = await usersCol()
    .where('nickname', '==', nickname)
    .limit(1)
    .get();
  return !snap.empty;
}

// ════════════════════════════════════════════════════════
//  게임 전적 저장 (게임 종료 시 GameEngine에서 호출)
// ════════════════════════════════════════════════════════

/**
 * 게임 종료 후 전적 저장
 * @param {GameRoom} room  - 종료된 게임방
 * @param {object}   result - { winner: 'crew'|'impostor', reason }
 */
async function saveGameResult(room, result) {
  const batch = db.batch();

  // ── 게임 히스토리 문서 저장 ───────────────────────────
  const gameRef = gameHistoryCol().doc(room.roomId);

  const playerSummaries = [...room.players.values()].map(p => ({
    userId:          p.userId,
    nickname:        p.nickname,
    role:            p.role,
    isAlive:         p.isAlive,
    tasksCompleted:  p.tasks.filter(t => t.status === 'completed').length,
  }));

  batch.set(gameRef, {
    gameId:      room.roomId,
    winner:      result.winner,
    reason:      result.reason,
    playerCount: room.players.size,
    players:     playerSummaries,
    duration:    Math.floor((Date.now() - room.createdAt) / 1000), // 초 단위
    meetingCount: room.meetingCount,
    killCount:   room.killLog.length,
    playedAt:    new Date(),
  });

  // ── 각 플레이어 stats 업데이트 ───────────────────────
  for (const player of room.players.values()) {
    const userRef  = usersCol().doc(player.userId);
    const isWinner =
      (result.winner === 'crew'     && player.role === 'crew') ||
      (result.winner === 'impostor' && player.role === 'impostor');

    const tasksCompleted = player.tasks
      .filter(t => t.status === 'completed' && !t.isFake).length;

    const killsThisGame = room.killLog
      .filter(k => k.impostorId === player.userId).length;

    // Firestore FieldValue.increment로 원자적 업데이트
    const { FieldValue } = require('firebase-admin/firestore');

    batch.update(userRef, {
      'stats.gamesPlayed':   FieldValue.increment(1),
      'stats.gamesWon':      FieldValue.increment(isWinner ? 1 : 0),
      'stats.totalKills':    FieldValue.increment(killsThisGame),
      'stats.totalMissions': FieldValue.increment(tasksCompleted),
    });
  }

  await batch.commit();

  // winRate는 배치 후 별도 계산 (읽기 후 쓰기라 배치에 못 넣음)
  await _updateWinRates(room);

  console.log(`[UserService] 게임 전적 저장 완료: ${room.roomId}`);
}

/**
 * winRate 재계산 (saveGameResult 내부 호출용)
 */
async function _updateWinRates(room) {
  const updates = [];

  for (const player of room.players.values()) {
    updates.push(
      usersCol().doc(player.userId).get().then(async doc => {
        if (!doc.exists) return;
        const { gamesPlayed, gamesWon } = doc.data().stats;
        const winRate = gamesPlayed > 0
          ? Math.round((gamesWon / gamesPlayed) * 100)
          : 0;
        await doc.ref.update({ 'stats.winRate': winRate });
      })
    );
  }

  await Promise.all(updates);
}

/**
 * 유저 게임 히스토리 조회 (최근 20게임)
 */
async function getUserHistory(userId) {
  const snap = await gameHistoryCol()
    .where('players', 'array-contains', { userId })
    .orderBy('playedAt', 'desc')
    .limit(20)
    .get();

  return snap.docs.map(d => d.data());
}

module.exports = {
  upsertUser,
  getUser,
  isNicknameTaken,
  saveGameResult,
  getUserHistory,
};