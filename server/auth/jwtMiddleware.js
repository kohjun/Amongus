// src/auth/jwtMiddleware.js
// Socket.IO 연결 시 JWT 검증 미들웨어
//
// 클라이언트 연결 방법:
//   const socket = io(SERVER_URL, {
//     auth: { token: "발급받은 JWT" }
//   });
//
// 검증 통과 후 socket 객체에 자동 세팅:
//   socket.userId   - Firebase UID
//   socket.nickname - 닉네임
//   socket.email    - 이메일

'use strict';

const jwt = require('jsonwebtoken');

function socketAuthMiddleware(socket, next) {
  // auth.token 또는 query.token 둘 다 지원
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token;

  if (!token) {
    return next(new Error('AUTH_REQUIRED: 인증 토큰이 없습니다.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 소켓에 사용자 정보 저장
    // → SocketHandler 전체에서 socket.userId 로 바로 사용 가능
    // → 클라이언트가 userId를 직접 보내는 방식 완전 제거 (위변조 차단)
    socket.userId   = decoded.userId;
    socket.nickname = decoded.nickname;
    socket.email    = decoded.email;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('AUTH_EXPIRED: 토큰이 만료됐습니다. 다시 로그인해주세요.'));
    }
    return next(new Error('AUTH_INVALID: 유효하지 않은 토큰입니다.'));
  }
}

module.exports = { socketAuthMiddleware };