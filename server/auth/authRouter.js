// src/auth/authRouter.js

'use strict';

const express        = require('express');
const jwt            = require('jsonwebtoken');
const { admin }      = require('./firebaseAdmin');
const { upsertUser, getUser, getUserHistory } = require('./Userservice');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ── JWT 검증 미들웨어 (REST용) ─────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '토큰이 없습니다.' });
  }

  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

// ════════════════════════════════════════════════════════
//  POST /auth/verify
//  Firebase ID Token → 게임용 JWT 발급
// ════════════════════════════════════════════════════════
router.post('/verify', async (req, res) => {
  // 수정 1: Body뿐만 아니라 Authorization 헤더에서도 idToken을 찾도록 유연하게 처리
  let idToken = req.body.idToken;

  if (!idToken && req.headers.authorization?.startsWith('Bearer ')) {
    idToken = req.headers.authorization.split('Bearer ')[1];
  }

  if (!idToken) {
    return res.status(400).json({ error: 'idToken이 필요합니다. (Body 또는 헤더에 포함해주세요)' });
  }

  try {
    // ① Firebase Admin으로 ID Token 검증
    const decoded = await admin.auth().verifyIdToken(idToken);

    // ② 닉네임 결정
    const nickname = decoded.name
      || decoded.email?.split('@')[0]
      || `Player_${decoded.uid.slice(0, 6)}`;

    const userPayload = {
      userId:   decoded.uid,
      nickname,
      email:    decoded.email || '',
    };

    // ③ Firestore에 유저 upsert
    const userProfile = await upsertUser(userPayload);

    // ④ 게임용 JWT 발급 (24시간)
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });

    return res.json({
      token,
      user: {
        ...userPayload,
        stats: userProfile.stats,
      },
    });

  } catch (err) {
    // 수정 2: 파이어베이스 에러 객체 전체를 출력하여 정확한 원인 파악 (만약 401이 뜬다면 이 로그를 꼭 확인하세요)
    console.error('[Auth] 인증 실패 상세 에러:', err);

    // Firebase 토큰 만료 vs 기타 오류 구분
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: '만료된 토큰입니다. 다시 로그인해주세요.' });
    }
    return res.status(401).json({ error: '파이어베이스 토큰 인증에 실패했습니다.' });
  }
});

// ════════════════════════════════════════════════════════
//  GET /auth/me
// ════════════════════════════════════════════════════════
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.user.userId);
    if (!user) return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  GET /auth/history
// ════════════════════════════════════════════════════════
router.get('/history', requireAuth, async (req, res) => {
  try {
    const history = await getUserHistory(req.user.userId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;