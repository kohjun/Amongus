// src/services/SocketService.ts
//
// Socket.IO 클라이언트 싱글톤
// 앱 전체에서 import { socket } from '../services/SocketService' 로 사용합니다.
//
// 연결 시점:
//   useAuth 훅에서 JWT 발급 후 socket.auth.token을 세팅하고 socket.connect() 호출
//   로그아웃 시 socket.disconnect() 호출

import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000';

// connect: false — JWT 토큰을 받기 전에 자동 연결하지 않습니다.
// useAuth에서 토큰 세팅 후 수동으로 socket.connect()를 호출합니다.
export const socket: Socket = io(SERVER_URL, {
  autoConnect:    false,
  transports:     ['websocket'],
  auth:           { token: '' },
  reconnection:   true,
  reconnectionAttempts: 5,
  reconnectionDelay:    1000,
});

// 디버그 로그 (개발 환경에서만)
if (__DEV__) {
  socket.on('connect',       ()  => console.log('[Socket] 연결됨:', socket.id));
  socket.on('disconnect',    (r) => console.log('[Socket] 해제됨:', r));
  socket.on('connect_error', (e) => console.log('[Socket] 연결 오류:', e.message));
}