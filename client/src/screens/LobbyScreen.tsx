// src/screens/LobbyScreen.tsx
// GET /rooms → 방 목록 폴링
// create_room / join_room → /(game)/room 이동

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  Modal, TextInput, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { socket } from '../services/SocketService';

interface RoomSummary {
  roomId:      string;
  playerCount: number;
  status:      'waiting' | 'playing' | 'ended';
  players:     { nickname: string }[];
}

const SERVER_URL = (process.env['EXPO_PUBLIC_SERVER_URL'] as string | undefined) ?? 'http://localhost:3000';

export default function LobbyScreen() {
  const router = useRouter();

  const [rooms,         setRooms]         = useState<RoomSummary[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [showCreate,    setShowCreate]    = useState(false);
  const [maxPlayers,    setMaxPlayers]    = useState('8');
  const [impostorCount, setImpostorCount] = useState('');
  const [killCooldown,  setKillCooldown]  = useState('30');
  const [creating,      setCreating]      = useState(false);

  const fetchRooms = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res  = await fetch(`${SERVER_URL}/rooms`);
      const data = await res.json() as RoomSummary[];
      setRooms(data.filter(r => r.status === 'waiting'));
    } catch (e) {
      console.error('[Lobby] 방 목록 조회 실패:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(() => fetchRooms(), 10_000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  function handleCreate() {
    setCreating(true);
    const settings = {
      maxPlayers:     parseInt(maxPlayers,    10) || 8,
      impostorCount:  impostorCount ? parseInt(impostorCount, 10) : null,
      killCooldown:   parseInt(killCooldown,  10) || 30,
      discussionTime: 90,
      voteTime:       30,
      missionPerCrew: 3,
    };
    socket.emit('create_room', { settings }, (res: { ok: boolean; roomId?: string; error?: string }) => {
      setCreating(false);
      if (res.ok && res.roomId) {
        setShowCreate(false);
        router.push({ pathname: '/(game)/room', params: { roomId: res.roomId, isHost: 'true' } });
      } else {
        Alert.alert('방 생성 실패', res.error);
      }
    });
  }

  function handleJoin(roomId: string) {
    socket.emit('join_room', { roomId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        router.push({ pathname: '/(game)/room', params: { roomId, isHost: 'false' } });
      } else {
        Alert.alert('입장 실패', res.error);
      }
    });
  }

  function renderRoom({ item }: { item: RoomSummary }) {
    const isFull = item.playerCount >= 10;
    return (
      <TouchableOpacity
        style={[styles.roomCard, isFull && styles.roomCardFull]}
        onPress={() => !isFull && handleJoin(item.roomId)}
        activeOpacity={isFull ? 1 : 0.75}
      >
        <View style={styles.roomCardLeft}>
          <View style={styles.roomIdPill}>
            <Text style={styles.roomIdText}>{item.roomId.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={styles.roomAvatarRow}>
            {item.players.slice(0, 5).map((p, i) => (
              <View key={i} style={[styles.avatar, { marginLeft: i > 0 ? -6 : 0, zIndex: 5 - i }]}>
                <Text style={styles.avatarText}>{p.nickname[0]?.toUpperCase()}</Text>
              </View>
            ))}
            {item.playerCount > 5 && (
              <View style={[styles.avatar, styles.avatarMore, { marginLeft: -6 }]}>
                <Text style={styles.avatarMoreText}>+{item.playerCount - 5}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.roomCardRight}>
          <Text style={styles.roomCount}>
            {item.playerCount}<Text style={styles.roomCountMax}>/10</Text>
          </Text>
          {isFull
            ? <View style={styles.fullBadge}><Text style={styles.fullBadgeText}>FULL</Text></View>
            : <View style={styles.joinBadge}><Text style={styles.joinBadgeText}>입장</Text></View>
          }
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>게임 로비</Text>
        <Text style={styles.headerSub}>{rooms.length}개의 방이 열려 있습니다</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#00e676" />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={r => r.roomId}
          renderItem={renderRoom}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchRooms(true)} tintColor="#00e676" />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🎮</Text>
              <Text style={styles.emptyText}>열린 방이 없습니다</Text>
              <Text style={styles.emptySubText}>직접 방을 만들어 시작하세요</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
        <Text style={styles.createBtnText}>+ 방 만들기</Text>
      </TouchableOpacity>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>방 만들기</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>최대 인원</Text>
              <TextInput style={styles.settingInput} value={maxPlayers} onChangeText={setMaxPlayers} keyboardType="number-pad" maxLength={2} />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>임포스터 수 (비우면 자동)</Text>
              <TextInput style={styles.settingInput} value={impostorCount} onChangeText={setImpostorCount} placeholder="자동" placeholderTextColor="#444" keyboardType="number-pad" maxLength={1} />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>킬 쿨다운 (초)</Text>
              <TextInput style={styles.settingInput} value={killCooldown} onChangeText={setKillCooldown} keyboardType="number-pad" maxLength={3} />
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, creating && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator color="#0a0a0a" />
                  : <Text style={styles.modalConfirmText}>만들기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#0a0a0a' },
  header:           { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle:      { fontSize: 24, fontWeight: '700', color: '#f0f0f0' },
  headerSub:        { fontSize: 13, color: '#444', marginTop: 4 },
  loader:           { flex: 1 },
  list:             { padding: 16, gap: 10 },
  roomCard:         { backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#1e1e1e', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomCardFull:     { opacity: 0.5 },
  roomCardLeft:     { gap: 10 },
  roomIdPill:       { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  roomIdText:       { fontSize: 11, color: '#555', fontFamily: 'Courier New', letterSpacing: 1 },
  roomAvatarRow:    { flexDirection: 'row', alignItems: 'center' },
  avatar:           { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e3a2a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0a0a0a' },
  avatarText:       { fontSize: 11, fontWeight: '700', color: '#00e676' },
  avatarMore:       { backgroundColor: '#1a1a1a' },
  avatarMoreText:   { fontSize: 9, color: '#555' },
  roomCardRight:    { alignItems: 'flex-end', gap: 8 },
  roomCount:        { fontSize: 22, fontWeight: '700', color: '#f0f0f0' },
  roomCountMax:     { fontSize: 14, fontWeight: '400', color: '#444' },
  joinBadge:        { backgroundColor: '#00e676', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  joinBadgeText:    { fontSize: 12, fontWeight: '700', color: '#0a0a0a' },
  fullBadge:        { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  fullBadgeText:    { fontSize: 11, color: '#444', letterSpacing: 1 },
  empty:            { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon:        { fontSize: 48 },
  emptyText:        { fontSize: 16, color: '#444', fontWeight: '500' },
  emptySubText:     { fontSize: 13, color: '#2a2a2a' },
  createBtn:        { margin: 16, backgroundColor: '#00e676', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  createBtnText:    { fontSize: 16, fontWeight: '700', color: '#0a0a0a' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard:        { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, borderTopWidth: 1, borderTopColor: '#1e1e1e', gap: 16 },
  modalTitle:       { fontSize: 20, fontWeight: '700', color: '#f0f0f0', marginBottom: 4 },
  settingRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingLabel:     { fontSize: 14, color: '#888', flex: 1 },
  settingInput:     { backgroundColor: '#181818', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#f0f0f0', fontSize: 15, width: 80, textAlign: 'right' },
  modalBtns:        { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn:   { flex: 1, borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalCancelText:  { color: '#555', fontSize: 14 },
  modalConfirmBtn:  { flex: 2, backgroundColor: '#00e676', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalConfirmText: { color: '#0a0a0a', fontSize: 15, fontWeight: '700' },
});
