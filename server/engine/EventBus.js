// server/engine/EventBus.js
//
// 시스템 간 결합도를 낮추기 위한 중앙 이벤트 버스입니다.
// 모든 시스템(GameEngine, VoteSystem, MissionSystem 등)이
// 직접 서로를 참조하지 않고 이벤트로 통신합니다.
//
// 사용법:
//   EventBus.emit('player_killed', { room, killer, target })
//   EventBus.on('player_killed', ({ room, killer, target }) => { ... })

'use strict';

const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    // 리스너 수 경고 임계값 상향 (시스템이 많아질수록 리스너 수 증가)
    this.setMaxListeners(50);
  }
}

module.exports = new EventBus();