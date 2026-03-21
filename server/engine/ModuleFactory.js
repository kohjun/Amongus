// server/engine/ModuleFactory.js
//
// GamePlugin.requiredModules 배열을 보고
// 필요한 시스템 모듈만 초기화하여 room.modules에 주입합니다.

'use strict';

// 모듈 ID → 시스템 싱글톤 매핑
const MODULE_MAP = {
  proximity: () => require('../systems/ProximitySystem'),
  vote:      () => require('../systems/VoteSystem'),
  mission:   () => require('../systems/MissionSystem'),
  item:      () => require('../systems/ItemSystem'),
  tag:       () => require('../systems/TagSystem'),
  round:     () => require('../systems/RoundSystem'),
  team:      () => require('../systems/TeamSystem'),
};

function initModules(room, plugin) {
  const modules = {};

  for (const moduleId of plugin.requiredModules) {
    const factory = MODULE_MAP[moduleId];
    if (!factory) {
      console.warn(`[ModuleFactory] 알 수 없는 모듈: ${moduleId}`);
      continue;
    }

    const system = factory();

    // 모듈별 초기화
    if (typeof system.initRoom === 'function') {
      if (moduleId === 'round') {
        const phaseConfig = plugin.getPhaseConfig();
        if (phaseConfig) system.init(room.roomId, phaseConfig);
      } else {
        system.initRoom(room.roomId);
      }
    }

    modules[moduleId] = system;
    console.log(`[ModuleFactory] ${room.roomId}: ${moduleId} 초기화`);
  }

  return modules;
}

function cleanupModules(room) {
  if (!room.modules) return;
  for (const [moduleId, system] of Object.entries(room.modules)) {
    if (typeof system.cleanupRoom === 'function') {
      system.cleanupRoom(room.roomId);
      console.log(`[ModuleFactory] ${room.roomId}: ${moduleId} 정리`);
    }
  }
}

module.exports = { initModules, cleanupModules };