// server/systems/abilities/AbilityExecutor.js
//
// ability 사용 시도 → 조건 체크 → 실행 → 이벤트 발행
//
// 체크 순서:
//   1. allowedPhases  (RoundSystem)
//   2. range          (ProximitySystem)
//   3. cooldown       (room 내 쿨다운 맵)
//   4. blockableBy    (ItemSystem)
//   → 전부 통과 시 effect 실행

'use strict';

const { ABILITY_TYPE, EFFECT } = require('./AbilityDefinitions');
const EventBus                 = require('../../engine/EventBus');

class AbilityExecutor {

  // ── 능력 사용 가능 여부 체크 ─────────────────────────
  canUse(room, player, abilityDecl, targetId) {
    const { abilityType, allowedPhases, range, cooldown } = abilityDecl;

    // 1. 페이즈 체크
    const currentPhase = room.modules?.round
      ? room.modules.round.getCurrentPhase()
      : 'playing';

    if (allowedPhases && allowedPhases.length > 0) {
      if (!allowedPhases.includes(currentPhase)) {
        return {
          ok:     false,
          reason: `현재 페이즈(${currentPhase})에서는 사용할 수 없습니다.`,
        };
      }
    }

    // 2. 거리 체크
    if (range && targetId) {
      const ProximitySystem = require('../ProximitySystem');
      const distRecord = ProximitySystem.getDistance(room.roomId, player.userId, targetId);
      if (!distRecord || distRecord.distance > range) {
        return {
          ok:     false,
          reason: `대상이 너무 멀리 있습니다. (필요: ${range}m 이내)`,
        };
      }
    }

    // 3. 쿨다운 체크
    if (cooldown > 0) {
      const coolKey  = `${player.userId}_${abilityType}`;
      const lastUsed = room._abilityCooldowns?.get(coolKey) || 0;
      const elapsed  = (Date.now() - lastUsed) / 1000;

      if (elapsed < cooldown) {
        const remaining = Math.ceil(cooldown - elapsed);
        return {
          ok:     false,
          reason: `쿨다운 중입니다. (${remaining}초 남음)`,
        };
      }
    }

    return { ok: true };
  }

  // ── 능력 실행 ────────────────────────────────────────
  async execute(room, user, targetId, abilityDecl, io) {
    const { abilityType, cooldown, stunDuration } = abilityDecl;
    const abilityDef = Object.values(ABILITY_TYPE).find(a => a.id === abilityType);
    if (!abilityDef) throw new Error(`알 수 없는 ability: ${abilityType}`);

    const target = targetId ? room.getPlayer(targetId) : null;

    // 아이템 차단 체크 (ItemSystem)
    if (abilityDef.blockableBy.length > 0 && target) {
      const ItemSystem = require('../ItemSystem');
      for (const blockItemId of abilityDef.blockableBy) {
        const blocked = ItemSystem.checkBlock(room, target, blockItemId);
        if (blocked) {
          EventBus.emit('ability_blocked', { room, user, target, abilityType, blockItemId });
          return { ok: true, blocked: true, blockItemId };
        }
      }
    }

    // 쿨다운 등록
    if (cooldown > 0) {
      room._abilityCooldowns = room._abilityCooldowns || new Map();
      room._abilityCooldowns.set(`${user.userId}_${abilityType}`, Date.now());
    }

    // effect 실행
    let result;
    switch (abilityDef.effect) {
      case EFFECT.ELIMINATE:
        result = this._executeEliminate(room, user, target, io);
        break;
      case EFFECT.CAPTURE:
        result = this._executeCapture(room, user, target, io);
        break;
      case EFFECT.TEAM_CHANGE:
        result = this._executeTeamChange(room, user, target, io);
        break;
      case EFFECT.ROLE_EXCHANGE:
        result = this._executeRoleExchange(room, user, target, io);
        break;
      case EFFECT.DISABLE:
        result = this._executeDisable(room, user, target, stunDuration || 5000, io);
        break;
      case EFFECT.EXPOSE:
        result = this._executeExpose(room, user, target, io, false);
        break;
      case EFFECT.PRIVATE_EXPOSE:
        result = this._executeExpose(room, user, target, io, true);
        break;
      case EFFECT.SHIELD_OTHER:
        result = this._executeShield(room, user, target, io);
        break;
      default:
        throw new Error(`처리되지 않은 effect: ${abilityDef.effect}`);
    }

    EventBus.emit('ability_used', { room, user, target, abilityType, result });
    return { ok: true, blocked: false, result };
  }

  // ── effect 구현 ──────────────────────────────────────

  _executeEliminate(room, user, target) {
    if (!target?.isAlive) throw new Error('대상이 이미 사망했습니다.');
    target.die();
    room.killLog.push({
      killerId:  user.userId,
      targetId:  target.userId,
      zone:      target.zone,
      timestamp: Date.now(),
    });
    EventBus.emit('player_eliminated', { room, killer: user, target });
    return { targetId: target.userId };
  }

  _executeCapture(room, user, target) {
    if (!target?.isAlive) throw new Error('대상이 이미 사망했습니다.');

    const TagSystem  = require('../TagSystem');
    const tagResult  = TagSystem.tag(room, user, target);

    // canSwitchTo 확인 → 역할 전환
    const plugin     = require('../../games/GamePluginRegistry').get(room.gameType);
    const roleDef    = plugin.getRoleDefinitions().find(r => r.id === target.roleId);

    if (roleDef?.canSwitchTo?.length > 0) {
      const TeamSystem = require('../TeamSystem');
      TeamSystem.switchRole(room, target, roleDef.canSwitchTo[0]);
    }

    EventBus.emit('player_captured', { room, catcher: user, target });
    return { targetId: target.userId, tagResult };
  }

  _executeTeamChange(room, user, target) {
    const TeamSystem = require('../TeamSystem');
    const plugin     = require('../../games/GamePluginRegistry').get(room.gameType);
    const userRole   = plugin.getRoleDefinitions().find(r => r.id === user.roleId);

    // 감염은 사용자의 팀으로 대상을 변경
    TeamSystem.changeTeam(room, target, userRole.team);
    EventBus.emit('player_infected', { room, infector: user, target });
    return { targetId: target.userId, newTeam: userRole.team };
  }

  _executeRoleExchange(room, user, target) {
    const TeamSystem = require('../TeamSystem');
    TeamSystem.swapRoles(room, user, target);
    EventBus.emit('roles_swapped', { room, playerA: user, playerB: target });
    return { playerAId: user.userId, playerBId: target.userId };
  }

  _executeDisable(room, user, target, durationMs) {
    target.isStunned = true;
    setTimeout(() => {
      if (target) {
        target.isStunned = false;
        EventBus.emit('stun_expired', { room, target });
      }
    }, durationMs);
    EventBus.emit('player_stunned', { room, stunner: user, target, durationMs });
    return { targetId: target.userId, durationMs };
  }

  _executeExpose(room, user, target, io, isPrivate) {
    const info = {
      targetId: target.userId,
      nickname: target.nickname,
      roleId:   target.roleId,
      team:     target.team,
    };

    if (isPrivate) {
      // 조사자에게만 전송
      EventBus.emit('role_investigated', { room, investigator: user, target, info });
    } else {
      // 전체 공개
      EventBus.emit('role_revealed', { room, revealer: user, target, info });
    }
    return info;
  }

  _executeShield(room, user, target) {
    target.shieldedBy = user.userId;
    EventBus.emit('player_shielded', { room, protector: user, target });
    return { targetId: target.userId };
  }
}

module.exports = new AbilityExecutor();