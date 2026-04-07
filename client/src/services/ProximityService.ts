// client/src/services/ProximityService.ts

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { socket } from './SocketService';

const { UWBManager } = NativeModules;
const emitter = new NativeEventEmitter(UWBManager);

interface ProximityRecord {
  peerId:    string;
  distance:  number;
  method:    'uwb' | 'ble';
  direction?: { x: number; y: number; z: number };
  updatedAt: number;
}

// GameScreen에서 주입하는 콜백 타입
export interface NearbyPlayerInfo {
  playerId: string;
  nickname: string;
  distance: number;
  method:   'uwb' | 'ble';
}

class ProximityService {
  private roomId:   string = '';
  private myUserId: string = '';
  private peerMap:  Map<string, string> = new Map(); // deviceId → userId
  private records:  Map<string, ProximityRecord> = new Map();
  private listeners: (() => void)[] = [];

  // 오류 4 수정: GameScreen에서 ProximityService.onNearbyUpdate = ... 할당 가능하도록 공개
  public onNearbyUpdate: ((players: NearbyPlayerInfo[]) => void) | null = null;

  // ── 초기화 ─────────────────────────────────────────────
  async init(roomId: string, myUserId: string) {
  this.roomId   = roomId;
  this.myUserId = myUserId;

  // 추가: 웹 환경일 경우 근접 감지 기능을 실행하지 않고 종료합니다.
  if (Platform.OS === 'web') {
    console.log('[Proximity] 웹 환경에서는 근접 감지 기능이 지원되지 않습니다.');
    return;
  }

  // UWB 초기화 시도
  try {
    if (Platform.OS === 'ios') {
      await this.initUWBiOS();
    } else {
      await this.initUWBAndroid();
    }
  } catch (e) {
    console.log('[Proximity] UWB 불가 → BLE 전환');
    // 웹 환경에서는 UWBManager가 없어 여기서 에러가 났던 것입니다.
    if (UWBManager) {
      UWBManager.startBLEScan();
    }
  }

    // 근접 업데이트 수신
    this.listeners.push(
      emitter.addListener('onProximityUpdate', this.handleUpdate.bind(this)).remove
    );

    // 다른 플레이어 토큰 수신 (UWB용)
    socket.on('uwb_token_received', ({ fromId, token }) => {
      this.startUWBSession(fromId, token);
    });
  }

  // ── iOS UWB 초기화 ────────────────────────────────────
  private async initUWBiOS() {
    // 내 토큰 생성 기다리기
    await new Promise<void>((resolve) => {
      const sub = emitter.addListener('onMyTokenReady', ({ token }) => {
        // 서버에 내 토큰 등록 → 다른 플레이어들이 수신
        socket.emit('uwb_token_register', {
          roomId:  this.roomId,
          userId:  this.myUserId,
          token,
        });
        sub.remove();
        resolve();
      });

      UWBManager.initUWB();
    });
  }

  // ── Android UWB 초기화 ────────────────────────────────
  private async initUWBAndroid() {
    const address = await UWBManager.initUWB();
    // Android는 UWB 주소 기반 교환
    socket.emit('uwb_token_register', {
      roomId:  this.roomId,
      userId:  this.myUserId,
      token:   address,  // Android는 주소를 토큰으로 사용
    });
  }

  // ── UWB 세션 시작 ─────────────────────────────────────
  private startUWBSession(peerId: string, token: string) {
    if (Platform.OS === 'ios') {
      UWBManager.startSession(peerId, token);
    } else {
      UWBManager.startSession(peerId, token, () => {});
    }
  }

  // ── 근접 업데이트 처리 ────────────────────────────────
  private handleUpdate(data: any) {
    const record: ProximityRecord = {
      peerId:    data.peerId,
      distance:  data.distance,
      method:    data.method,
      direction: data.direction,
      updatedAt: Date.now(),
    };

    this.records.set(data.peerId, record);

    // 서버로 전송
    socket.emit('proximity_update', {
      roomId:    this.roomId,
      fromId:    this.myUserId,
      toId:      data.peerId,  // BLE는 deviceId, UWB는 peerId
      distanceM: data.distance,
      method:    data.method,
      direction: data.direction || null,
    });
  }

  // ── 킬 가능 여부 조회 ─────────────────────────────────
  getKillableTargets(targetPlayerIds: string[]): string[] {
    const KILL_RANGE = { uwb: 1.5, ble: 3.0 };

    return targetPlayerIds.filter(playerId => {
      const record = this.records.get(playerId);
      if (!record) return false;

      const staleMs   = record.method === 'uwb' ? 3000 : 8000;
      const isStale   = Date.now() - record.updatedAt > staleMs;
      if (isStale) return false;

      return record.distance <= KILL_RANGE[record.method];
    });
  }

  // ── 정리 ──────────────────────────────────────────────
  destroy() {
    UWBManager.stopAll();
    this.listeners.forEach(remove => remove());
    this.records.clear();
  }
}

export default new ProximityService();