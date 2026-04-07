// src/app.js
// 서버 엔트리포인트
//
// 실행 순서:
//   1. Firebase Admin 초기화
//   2. Express + Socket.IO 설정
//   3. JWT 미들웨어 등록 (모든 소켓 연결에 적용)
//   4. EventSubscriber 초기화 (io 주입)
//   5. 소켓 연결 핸들러 등록

'use strict';

require('dotenv').config();

// Firebase Admin을 가장 먼저 초기화 (다른 모듈들이 db를 import하기 전에)
require('./auth/firebaseAdmin');

const express         = require('express');
const http            = require('http');
const { Server }      = require('socket.io');
const cors            = require('cors');

const SocketHandler             = require('./socket/SocketHandler');
const EventSubscriber           = require('./socket/EventSubscriber');
const authRouter                = require('./auth/authRouter');
const { socketAuthMiddleware }  = require('./auth/jwtMiddleware');

// ── 게임 플러그인 등록 ────────────────────────────────────
// startGame() 이전에 반드시 registry에 등록되어야 합니다.
const GamePluginRegistry = require('./games/GamePluginRegistry');
GamePluginRegistry.register(require('./games/plugins/AmongUsPlugin'));

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin:      process.env.CLIENT_ORIGIN
                   ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim())
                   : ['http://localhost:8081', 'http://localhost:3000'],
    methods:     ['GET', 'POST'],
    credentials: true,
  },
});

// ── Express 미들웨어 ─────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:8081')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // 서버 간 요청(origin 없음) 또는 허용 목록에 있으면 통과
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} 허용되지 않음`));
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

// ── REST API ─────────────────────────────────────────────
app.use('/auth', authRouter);

app.get('/rooms', (req, res) => {
  const GameEngine = require('./engine/GameEngine');
  const list = [...GameEngine.rooms.values()].map(r => r.toPublicState());
  res.json(list);
});

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ── Socket.IO 설정 ───────────────────────────────────────

// ① 모든 소켓 연결에 JWT 검증 적용
//    통과한 소켓에는 socket.userId, socket.nickname이 세팅됨
io.use(socketAuthMiddleware);

// ② EventBus 이벤트 → 소켓 브로드캐스트 연결
//    io가 생성된 직후 반드시 호출
EventSubscriber.init(io);

// ③ 개별 소켓 연결 처리
io.on('connection', (socket) => {
  console.log(`[Socket] 연결: ${socket.id} | ${socket.nickname} (${socket.userId})`);

  SocketHandler.register(socket, io);

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] 해제: ${socket.id} | ${socket.nickname} | 사유: ${reason}`);
  });
});

// ── 서버 시작 ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   환경: ${process.env.NODE_ENV || 'development'}\n`);
});