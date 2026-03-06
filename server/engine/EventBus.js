// src/engine/EventBus.js
// 이벤트를 발생시키면 Socket, AI, 조건 체커가 각자 반응하는 구조

const EventEmitter = require('events');

class EventBus extends EventEmitter {}

const bus = new EventBus();

// 디버그용 로그
bus.on('newListener', (event) => {
  console.log(`[EventBus] 리스너 등록: ${event}`);
});

module.exports = bus;