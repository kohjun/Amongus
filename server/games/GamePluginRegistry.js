// server/games/GamePluginRegistry.js
'use strict';

class GamePluginRegistry {
  constructor() {
    this._plugins = new Map();
  }

  register(plugin) {
    this._plugins.set(plugin.gameType, plugin);
    console.log(`[GamePluginRegistry] 등록: ${plugin.gameType} (${plugin.displayName})`);
  }

  get(gameType) {
    const plugin = this._plugins.get(gameType);
    if (!plugin) throw new Error(`GamePlugin 없음: ${gameType}`);
    return plugin;
  }

  has(gameType) { return this._plugins.has(gameType); }
  list()        { return [...this._plugins.values()]; }
}

module.exports = new GamePluginRegistry();