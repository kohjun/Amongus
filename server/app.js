// src/app.js

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const SocketHandler = require('./socket/SocketHandler');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());

// REST API (방 목록 조회 등 단순 요청)
app.get('/rooms', (req, res) => {
  const GameEngine = require('./engine/GameEngine');
  const list = [...GameEngine.rooms.values()].map(r => r.toPublicState());
  res.json(list);
});

// WebSocket 연결
io.on('connection', (socket) => {
  console.log(`소켓 연결: ${socket.id}`);
  SocketHandler.register(socket, io);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));