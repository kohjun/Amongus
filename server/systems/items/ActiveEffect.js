// src/systems/items/ActiveEffect.js

class ActiveEffect {
  constructor({ playerId, itemId, effect, roomId }) {
    this.effectId  = `${playerId}_${itemId}_${Date.now()}`;
    this.playerId  = playerId;
    this.itemId    = itemId;
    this.type      = effect.type;
    this.roomId    = roomId;
    this.startedAt = Date.now();
    this.expiresAt = effect.durationMs
      ? this.startedAt + effect.durationMs
      : null;
    this.extra     = effect;   // radius 등 추가 설정
    this._timer    = null;
  }

  get isExpired() {
    if (!this.expiresAt) return false;
    return Date.now() >= this.expiresAt;
  }

  get remainingMs() {
    if (!this.expiresAt) return null;
    return Math.max(0, this.expiresAt - Date.now());
  }

  setTimer(handle) {
    this._timer = handle;
  }

  cancel() {
    if (this._timer) clearTimeout(this._timer);
  }
}

module.exports = ActiveEffect;