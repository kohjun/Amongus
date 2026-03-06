// src/systems/ItemSystem.js

const { ITEMS, EFFECT_TYPE, CONDITION_REWARDS } = require('./items/itemDefinitions');
const ActiveEffect = require('./items/ActiveEffect');
const EventBus     = require('../engine/EventBus');

class ItemSystem {
  constructor() {
    // 활성 효과 { roomId: { playerId: ActiveEffect[] } }
    this.activeEffects = new Map();
  }

  // ── 방 초기화 ──────────────────────────────────────────

  initRoom(roomId) {
    this.activeEffects.set(roomId, new Map());
  }

  cleanupRoom(roomId) {
    // 활성 효과 전부 취소
    const roomEffects = this.activeEffects.get(roomId);
    if (roomEffects) {
      for (const effects of roomEffects.values()) {
        effects.forEach(e => e.cancel());
      }
    }
    this.activeEffects.delete(roomId);
  }

  // ── 재화 지급 ──────────────────────────────────────────

  grantCurrency(player, amount, reason) {
    player.currency += amount;
    EventBus.emit('currency_granted', { player, amount, reason });
    return player.currency;
  }

  // ── 아이템 구매 ────────────────────────────────────────

  purchaseItem(room, player, itemId) {
    const item = ITEMS[itemId];
    if (!item) throw new Error('존재하지 않는 아이템입니다.');

    // 역할 제한 체크
    if (item.target === 'crew' && player.role !== 'crew') {
      throw new Error('크루원 전용 아이템입니다.');
    }
    if (item.target === 'impostor' && player.role !== 'impostor') {
      throw new Error('임포스터 전용 아이템입니다.');
    }

    // 잔액 체크
    if (player.currency < item.price) {
      throw new Error(`코인이 부족합니다. (보유: ${player.currency}, 필요: ${item.price})`);
    }

    // 구매 처리
    player.currency -= item.price;

    const existing = player.items.find(i => i.itemId === itemId);
    if (existing) {
      existing.quantity++;
    } else {
      player.items.push({ itemId, quantity: 1 });
    }

    EventBus.emit('item_purchased', { room, player, item });
    return { item, remainingCurrency: player.currency };
  }

  // ── 아이템 사용 ────────────────────────────────────────

  useItem(room, player, itemId) {
    const item = ITEMS[itemId];
    if (!item) throw new Error('존재하지 않는 아이템입니다.');

    // 보유 여부 체크
    const owned = player.items.find(i => i.itemId === itemId);
    if (!owned || owned.quantity <= 0) {
      throw new Error('보유하고 있지 않은 아이템입니다.');
    }

    // 게임 중인지 체크
    if (room.status !== 'playing') {
      throw new Error('게임 중에만 아이템을 사용할 수 있습니다.');
    }

    // 아이템 차감
    owned.quantity--;
    if (owned.quantity === 0) {
      player.items = player.items.filter(i => i.itemId !== itemId);
    }

    // 효과 적용
    const effect = this._applyEffect(room, player, item);
    EventBus.emit('item_used', { room, player, item, effect });

    return effect;
  }

  // ── 효과 적용 ──────────────────────────────────────────

  _applyEffect(room, player, item) {
    const effect = new ActiveEffect({
      playerId: player.userId,
      itemId:   item.itemId,
      effect:   item.effect,
      roomId:   room.roomId,
    });

    // roomEffects 초기화
    if (!this.activeEffects.has(room.roomId)) this.initRoom(room.roomId);
    const roomEffects = this.activeEffects.get(room.roomId);
    if (!roomEffects.has(player.userId)) roomEffects.set(player.userId, []);

    roomEffects.get(player.userId).push(effect);

    // 지속 시간이 있는 효과는 타이머로 자동 만료
    if (item.effect.durationMs) {
      const timer = setTimeout(() => {
        this._expireEffect(room, player, effect);
      }, item.effect.durationMs);
      effect.setTimer(timer);
    }

    return effect;
  }

  // ── 효과 만료 ──────────────────────────────────────────

  _expireEffect(room, player, effect) {
    const roomEffects = this.activeEffects.get(room.roomId);
    if (!roomEffects) return;

    const playerEffects = roomEffects.get(player.userId);
    if (!playerEffects) return;

    const idx = playerEffects.findIndex(e => e.effectId === effect.effectId);
    if (idx !== -1) playerEffects.splice(idx, 1);

    EventBus.emit('effect_expired', { room, player, effect });
  }

  // ── 효과 조회 ──────────────────────────────────────────

  getActiveEffects(roomId, playerId) {
    return this.activeEffects.get(roomId)?.get(playerId) || [];
  }

  hasEffect(roomId, playerId, effectType) {
    return this.getActiveEffects(roomId, playerId)
      .some(e => e.type === effectType && !e.isExpired);
  }

  // ── 아이템 효과별 판정 헬퍼 ───────────────────────────

  // 위치가 숨겨져 있는가?
  isLocationHidden(roomId, playerId) {
    return this.hasEffect(roomId, playerId, EFFECT_TYPE.HIDE_LOCATION);
  }

  // 방탄조끼 발동 (킬 시도 시 체크)
  // 반환값: true면 킬 무효
  checkBulletproof(room, targetPlayer) {
    if (!this.hasEffect(room.roomId, targetPlayer.userId, EFFECT_TYPE.BULLETPROOF)) {
      return false;
    }

    // 방탄조끼 소모 (1회용)
    const effects  = this.activeEffects.get(room.roomId)?.get(targetPlayer.userId) || [];
    const vestIdx  = effects.findIndex(e => e.type === EFFECT_TYPE.BULLETPROOF);
    if (vestIdx !== -1) {
      effects[vestIdx].cancel();
      effects.splice(vestIdx, 1);
    }

    EventBus.emit('bulletproof_triggered', { room, player: targetPlayer });
    return true;
  }

  // 변장 중인가? (탐지기에 안 잡힘)
  isDisguised(roomId, playerId) {
    return this.hasEffect(roomId, playerId, EFFECT_TYPE.DISGUISE);
  }

  // 구역이 방해전파 중인가?
  isZoneJammed(roomId, zone) {
    const roomEffects = this.activeEffects.get(roomId);
    if (!roomEffects) return false;

    for (const effects of roomEffects.values()) {
      for (const effect of effects) {
        if (effect.type === EFFECT_TYPE.JAMMING &&
            !effect.isExpired &&
            effect.extra.zone === zone) {
          return true;
        }
      }
    }
    return false;
  }

  // 탐지기 발동: 주변 임포스터 목록 반환
  detectNearbyImpostors(room, player, proximitySystem) {
    if (!this.hasEffect(room.roomId, player.userId, EFFECT_TYPE.DETECT_IMPOSTOR)) {
      return [];
    }

    const effect = this.getActiveEffects(room.roomId, player.userId)
      .find(e => e.type === EFFECT_TYPE.DETECT_IMPOSTOR);
    const radius = effect?.extra?.radius || 5.0;

    const nearby   = proximitySystem.getNearbyPlayers(room.roomId, player.userId, radius);
    const detected = [];

    for (const { playerId, distance } of nearby) {
      const target = room.getPlayer(playerId);
      if (!target || !target.isAlive) continue;
      if (target.role !== 'impostor') continue;
      if (this.isDisguised(room.roomId, playerId)) continue;  // 변장 중이면 탐지 안 됨

      detected.push({ playerId, nickname: target.nickname, distance });
    }

    return detected;
  }

  // ── 지도 효과: 플레이어 위치 공개 ─────────────────────

  getRevealedLocations(room, requesterId) {
    if (!this.hasEffect(room.roomId, requesterId, EFFECT_TYPE.REVEAL_MAP)) {
      return null;  // 지도 없으면 null
    }

    const locations = [];
    for (const [, player] of room.players) {
      if (!player.isAlive) continue;

      // 연막탄 사용 중인 플레이어는 위치 숨김
      if (this.isLocationHidden(room.roomId, player.userId)) continue;

      locations.push({
        userId:   player.userId,
        nickname: player.nickname,
        zone:     player.zone,
      });
    }
    return locations;
  }

  // ── 조건부 아이템 지급 체크 ────────────────────────────

  checkConditions(room, player, eventType) {
    const granted = [];

    for (const cond of CONDITION_REWARDS) {
      try {
        if (!cond.check(room, player, eventType)) continue;

        // 이미 이 게임에서 받았는지 체크
        room._grantedConditions = room._grantedConditions || new Set();
        const key = `${cond.conditionId}_${player.userId}`;
        if (room._grantedConditions.has(key)) continue;
        room._grantedConditions.add(key);

        // 지급
        if (cond.reward.itemId) {
          const item     = ITEMS[cond.reward.itemId];
          const existing = player.items.find(i => i.itemId === cond.reward.itemId);
          if (existing) {
            existing.quantity += cond.reward.quantity || 1;
          } else {
            player.items.push({
              itemId:   cond.reward.itemId,
              quantity: cond.reward.quantity || 1,
            });
          }
          granted.push({ type: 'item', ...cond.reward, item, condition: cond.description });
        }

        if (cond.reward.currency) {
          this.grantCurrency(player, cond.reward.currency, cond.description);
          granted.push({ type: 'currency', amount: cond.reward.currency, condition: cond.description });
        }

        EventBus.emit('condition_reward_granted', { room, player, reward: cond.reward, condition: cond });

      } catch (e) {
        console.error(`[ItemSystem] 조건 체크 오류: ${cond.conditionId}`, e.message);
      }
    }

    return granted;
  }

  // ── 게임 종료 보상 ─────────────────────────────────────

  grantEndGameRewards(room) {
    const winner = room.checkWinCondition();
    if (!winner) return;

    for (const [, player] of room.players) {
      // 승리 보상
      const isWinner =
        (winner.winner === 'crew'     && player.role === 'crew') ||
        (winner.winner === 'impostor' && player.role === 'impostor');

      if (isWinner) {
        this.grantCurrency(player, 50, '게임 승리');
      } else {
        this.grantCurrency(player, 10, '게임 참여');
      }

      // 무고 투표 보상 (회의마다 누적)
      const innocentVotes = room.innocentVotes?.[player.userId] || 0;
      if (innocentVotes > 0) {
        this.grantCurrency(player, innocentVotes * 15, '무고 투표 보상');
      }
    }
  }
}

module.exports = new ItemSystem();