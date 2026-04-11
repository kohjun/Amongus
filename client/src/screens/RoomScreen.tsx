// src/screens/RoomScreen.tsx
// 대기실 — room_updated 실시간 반영, 방장만 게임 시작 가능, 초기 상태 동기화 추가

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socket } from '../services/SocketService';
import { gameStore } from '../store/gameStore';
import { PlayerInfo } from '../types/navigation';

interface Player {
  userId:   string;
  nickname: string;
  isAlive:  boolean;
  zone:     string | null;
}

interface RoomState {
  roomId:      string;
  status:      string;
  playerCount: number;
  players:     Player[];
}

const COLORS = [
  '#00e676','#69f0ae','#40c4ff','#e040fb',
  '#ffab40','#ff5252','#ea80fc','#64ffda',
  '#ccff90','#ff6d00',
];

const SERVER_URL = (process.env['EXPO_PUBLIC_SERVER_URL'] as string | undefined) ?? 'http://localhost:3000';

export default function RoomScreen() {
  const router = useRouter();
  const { roomId, isHost: isHostParam } = useLocalSearchParams<{ roomId: string; isHost: string }>();

  const [room,     setRoom]     = useState<RoomState | null>(null);
  const [starting, setStarting] = useState(false);
  const [myInfo,   setMyInfo]   = useState<{ userId: string; nickname: string } | null>(null);

  // 수정 1: useState를 제거하고 파라미터에서 직접 값을 도출 (파라미터가 늦게 들어와도 즉시 렌더링에 반영됨)
  const isHost = isHostParam === 'true';

  useEffect(() => {
    // 수정 2: 로딩 중 소켓 방송을 놓치는 타이밍 문제를 방지하기 위해 초기 진입 시 방 상태를 한번 당겨옵니다.
    if (roomId) {
      fetch(`${SERVER_URL}/rooms`)
        .then(res => res.json())
        .then(rooms => {
          const currentRoom = rooms.find((r: RoomState) => r.roomId === roomId);
          if (currentRoom) setRoom(currentRoom);
        })
        .catch(err => console.error('[Room] 초기 상태 로드 실패:', err));
    }

    socket.on('joined', (info: { userId: string; nickname: string }) => {
      setMyInfo(info);
    });

    socket.on('room_updated', (roomState: RoomState) => {
      setRoom(roomState);
    });

    socket.on('game_started', (privateInfo: PlayerInfo) => {
      setStarting(false);
      gameStore.setPlayerInfo(privateInfo);
      router.replace({ pathname: '/(game)/game', params: { roomId } });
    });

    socket.on('notification', (data: { message: string }) => {
      console.log('[Room] notification:', data.message);
    });

    return () => {
      socket.off('joined');
      socket.off('room_updated');
      socket.off('game_started');
      socket.off('notification');
    };
  }, [roomId]);

  function handleStartGame() {
    if (!room || room.playerCount < 4) {
      Alert.alert('인원 부족', '최소 4명이 있어야 게임을 시작할 수 있습니다.');
      return;
    }
    setStarting(true);
    socket.emit('start_game', { roomId }, (res: { ok: boolean; error?: string }) => {
      if (!res.ok) {
        setStarting(false);
        Alert.alert('시작 실패', res.error);
      }
    });
  }

  // 이제 isHost 값이 정확하므로 4명이 차면 방장의 버튼이 정상적으로 활성화됩니다.
  const canStart = isHost && (room?.playerCount ?? 0) >= 4 && !starting;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>대기실</Text>
          <View style={styles.roomIdPill}>
            <Text style={styles.roomIdText}>{roomId?.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countNum}>{room?.playerCount ?? 0}</Text>
        <Text style={styles.countSlash}>/</Text>
        <Text style={styles.countMax}>10</Text>
        <Text style={styles.countLabel}>   명 대기 중</Text>
      </View>

      {(room?.playerCount ?? 0) < 4 && (
        <View style={styles.minHint}>
          <Text style={styles.minHintText}>
            최소 4명이 필요합니다 ({4 - (room?.playerCount ?? 0)}명 더 필요)
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        {room?.players.map((player, i) => (
          <View key={player.userId} style={styles.playerCard}>
            <View style={[styles.playerAvatar, { borderColor: COLORS[i % COLORS.length] }]}>
              <Text style={[styles.playerInitial, { color: COLORS[i % COLORS.length] }]}>
                {player.nickname[0]?.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerName} numberOfLines={1}>{player.nickname}</Text>
            {i === 0 && (
              <View style={styles.hostBadge}><Text style={styles.hostBadgeText}>방장</Text></View>
            )}
          </View>
        ))}
        {Array.from({ length: Math.max(0, 10 - (room?.playerCount ?? 0)) }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.playerCard, styles.playerCardEmpty]}>
            <View style={styles.playerAvatarEmpty}>
              <Text style={styles.playerAvatarEmptyIcon}>+</Text>
            </View>
            <Text style={styles.playerNameEmpty}>대기 중</Text>
          </View>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>게임 안내</Text>
        <Text style={styles.infoText}>
          {'• 크루원: 미션을 완료하거나 임포스터를 추방하세요\n• 임포스터: 크루원을 제거하고 방해하세요\n• UWB/BLE로 실제 위치가 감지됩니다'}
        </Text>
      </View>

      <View style={styles.footer}>
        {isHost ? (
          <TouchableOpacity
            style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
            onPress={handleStartGame}
            disabled={!canStart}
            activeOpacity={0.85}
          >
            {starting
              ? <ActivityIndicator color="#0a0a0a" />
              : <Text style={styles.startBtnText}>게임 시작</Text>}
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingBox}>
            <ActivityIndicator color="#444" size="small" />
            <Text style={styles.waitingText}>방장이 게임을 시작하길 기다리는 중...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:                { flex: 1, backgroundColor: '#e0f7f4' },
  header:              { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backBtn:             { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon:            { fontSize: 20, color: '#1a1a1a' },
  headerCenter:        { flex: 1, alignItems: 'center', gap: 6 },
  headerTitle:         { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  roomIdPill:          { backgroundColor: '#b0e8e0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  roomIdText:          { fontSize: 11, color: '#1a1a1a', letterSpacing: 1.5 },
  countRow:            { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingVertical: 20 },
  countNum:            { fontSize: 48, fontWeight: '700', color: '#00e676', lineHeight: 52 },
  countSlash:          { fontSize: 32, color: '#2a2a2a', lineHeight: 48, marginHorizontal: 4 },
  countMax:            { fontSize: 32, color: '#2a2a2a', lineHeight: 48 },
  countLabel:          { fontSize: 14, color: '#1a1a1a', lineHeight: 48, marginBottom: 2 },
  minHint:             { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#1a1200', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2200' },
  minHintText:         { fontSize: 12, color: '#886600' },
  grid:                { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, flex: 1 },
  playerCard:          { width: '18%', aspectRatio: 0.85, alignItems: 'center', justifyContent: 'center', gap: 6 },
  playerCardEmpty:     { opacity: 0.3 },
  playerAvatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c8f0e9', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  playerInitial:       { fontSize: 18, fontWeight: '700' },
  playerAvatarEmpty:   { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c8f0e9', borderWidth: 1, borderColor: '#1e1e1e', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  playerAvatarEmptyIcon:{ fontSize: 18, color: '#2a2a2a' },
  playerName:          { fontSize: 10, color: '#1a1a1a', textAlign: 'center' },
  playerNameEmpty:     { fontSize: 10, color: '#2a2a2a' },
  hostBadge:           { backgroundColor: '#1a2a1a', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  hostBadgeText:       { fontSize: 9, color: '#00e676' },
  infoBox:             { margin: 16, backgroundColor: '#c8f0e9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e1e1e', gap: 6 },
  infoTitle:           { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  infoText:            { fontSize: 12, color: '#1a1a1a', lineHeight: 20 },
  footer:              { padding: 16 },
  startBtn:            { backgroundColor: '#00e676', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  startBtnDisabled:    { backgroundColor: '#0a2a1a' },
  startBtnText:        { fontSize: 17, fontWeight: '700', color: '#0a0a0a' },
  waitingBox:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  waitingText:         { fontSize: 13, color: '#1a1a1a' },
});