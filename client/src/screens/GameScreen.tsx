// src/screens/GameScreen.tsx
// 메인 게임 화면 — 역할(crew/impostor)에 따라 UI 분기 및 토스트 알림 추가

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socket }           from '../services/SocketService';
import ProximityService     from '../services/ProximityService';
import KillButton           from '../components/KillButton';
import AIMessageFeed        from '../components/AIMessageFeed';
import MissionList          from '../components/MissionList';
import ProximityIndicator   from '../components/ProximityIndicator';
import { gameStore }        from '../store/gameStore';
import { PlayerInfo, MissionTask, GameResult } from '../types/navigation';

interface NearbyPlayer {
  playerId:    string;
  nickname:    string;
  distance:    number;
  method:      'uwb' | 'ble';
  isKillable?: boolean;
}

export default function GameScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  const initialInfo = gameStore.getPlayerInfo();

  const [playerInfo,      setPlayerInfo]      = useState<PlayerInfo | null>(initialInfo);
  const [nearbyPlayers,   setNearbyPlayers]   = useState<NearbyPlayer[]>([]);
  const [killableTargets, setKillableTargets] = useState<NearbyPlayer[]>([]);
  const [missionProgress, setMissionProgress] = useState({ completed: 0, total: 0, percent: 0 });
  const [currentZone,     setCurrentZone]     = useState<string | null>(initialInfo?.zone ?? null);
  const [showProximity,   setShowProximity]   = useState(false);
  
  // 추가: 토스트 메시지 상태
  const [toastMessage,    setToastMessage]    = useState<string | null>(null);
  const reportCooldown = useRef(false);

  // ── 토스트 알림 헬퍼 ─────────────────────────────────────
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (!playerInfo) router.replace('/(game)/lobby');
  }, []);

  const isImpostor = playerInfo?.role === 'impostor';
  const isAlive    = playerInfo?.isAlive ?? false;

  useEffect(() => {
    socket.on('mission_progress', (data: { completed: number; total: number; percent: number }) => {
      setMissionProgress(data);
    });

    socket.on('mission_completed', (data: { missionId: string; currency: number }) => {
      setPlayerInfo(prev => prev ? ({
        ...prev,
        currency: data.currency,
        tasks: prev.tasks.map(t =>
          t.missionId === data.missionId ? { ...t, status: 'completed' as const } : t
        ),
      }) : prev);
      showToast("✅ 미션 완료!");
    });

    socket.on('killable_targets', (data: { targets: NearbyPlayer[] }) => {
      setKillableTargets(data.targets);
      setNearbyPlayers(prev =>
        prev.map(p => ({ ...p, isKillable: data.targets.some(k => k.playerId === p.playerId) }))
      );
    });

    socket.on('meeting_started', (data: Record<string, unknown>) => {
      gameStore.setMeetingData(data);
      router.push({
        pathname: '/(game)/meeting',
        params: { roomId, myUserId: playerInfo?.userId ?? '' },
      });
    });

    socket.on('game_ended', (data: GameResult) => {
      gameStore.setResult(data);
      router.replace({ pathname: '/(game)/result', params: { roomId } });
    });

    socket.on('currency_updated', (data: { currency: number }) => {
      setPlayerInfo(prev => prev ? ({ ...prev, currency: data.currency }) : prev);
    });

    socket.on('mission_available', (data: { zone: string; taskList: Partial<MissionTask>[] }) => {
      setCurrentZone(data.zone);
      setPlayerInfo(prev => prev ? ({
        ...prev,
        tasks: prev.tasks.map(t => {
          const updated = data.taskList.find(u => u.missionId === t.missionId);
          return updated ? ({ ...t, ...updated } as MissionTask) : t;
        }),
      }) : prev);
    });

    return () => {
      socket.off('mission_progress');
      socket.off('mission_completed');
      socket.off('killable_targets');
      socket.off('meeting_started');
      socket.off('game_ended');
      socket.off('currency_updated');
      socket.off('mission_available');
    };
  }, [roomId, playerInfo?.userId]);

  useEffect(() => {
    if (!playerInfo) return;
    ProximityService.init(roomId, playerInfo.userId);
    ProximityService.onNearbyUpdate = (players) => setNearbyPlayers(players);
    return () => { ProximityService.destroy(); };
  }, [roomId, playerInfo?.userId]);

  const handleReport = useCallback((bodyId: string) => {
    if (reportCooldown.current) return;
    reportCooldown.current = true;

    socket.emit('report_body', { roomId, bodyId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        showToast("📢 시체를 신고했습니다!");
      } else {
        showToast(`❌ 신고 실패: ${res.error}`);
        reportCooldown.current = false; // 실패 시 쿨다운 해제
      }
    });
  }, [roomId]);

  const handleEmergency = useCallback(() => {
    socket.emit('emergency_meeting', { roomId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        showToast("🚨 긴급 회의 소집 중...");
      } else {
        showToast(`❌ 버튼 작동 실패: ${res.error}`);
      }
    });
  }, [roomId]);

  if (!playerInfo) return null;

  if (!isAlive) {
    return (
      <View style={styles.deadOverlay}>
        <Text style={styles.deadIcon}>💀</Text>
        <Text style={styles.deadTitle}>사망</Text>
        <Text style={styles.deadSubTitle}>유령으로 게임을 지켜봅니다</Text>
        <AIMessageFeed roomId={roomId} isGhost={true} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* 상단 알림 토스트 */}
      {toastMessage && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <View style={styles.topBar}>
        <View style={[styles.roleBadge, isImpostor ? styles.roleBadgeImpostor : styles.roleBadgeCrew]}>
          <Text style={styles.roleBadgeText}>{isImpostor ? '임포스터' : '크루원'}</Text>
        </View>
        <View style={styles.missionBarWrap}>
          <View style={styles.missionBarBg}>
            <View style={[styles.missionBarFill, { width: `${missionProgress.percent}%` }]} />
          </View>
          <Text style={styles.missionBarLabel}>{missionProgress.percent}%</Text>
        </View>
        <TouchableOpacity
          style={styles.currencyChip}
          onPress={() => router.push({ pathname: '/(game)/shop', params: { roomId, myUserId: playerInfo.userId } })}
        >
          <Text style={styles.currencyText}>🪙 {playerInfo.currency}</Text>
        </TouchableOpacity>
      </View>

      {currentZone && (
        <View style={styles.zoneBanner}>
          <Text style={styles.zoneBannerText}>📍 {currentZone.replace(/_/g, ' ')}</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <AIMessageFeed roomId={roomId} />
        {!isImpostor && <MissionList tasks={playerInfo.tasks} currentZone={currentZone} />}
        {isImpostor && <KillButton roomId={roomId} killableTargets={killableTargets} />}
        <TouchableOpacity onPress={() => setShowProximity(prev => !prev)} style={styles.proximityToggle}>
          <Text style={styles.proximityToggleText}>
            {showProximity ? '▾ 주변 플레이어 숨기기' : '▸ 주변 플레이어 보기'}
          </Text>
        </TouchableOpacity>
        {showProximity && <ProximityIndicator nearbyPlayers={nearbyPlayers} isImpostor={isImpostor} />}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => handleReport('detected-body-id')} // 실제 감지된 bodyId 주입 필요
          activeOpacity={0.8}
        >
          <Text style={styles.reportBtnIcon}>🔴</Text>
          <Text style={styles.reportBtnText}>시체 신고</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.emergencyBtn} onPress={handleEmergency} activeOpacity={0.8}>
          <Text style={styles.emergencyBtnIcon}>⚠️</Text>
          <Text style={styles.emergencyBtnText}>긴급 버튼</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:                { flex: 1, backgroundColor: '#e0f7f4' },
  toastContainer:      { position: 'absolute', top: 110, left: 20, right: 20, backgroundColor: 'rgba(175, 230, 220, 0.95)', padding: 12, borderRadius: 10, zIndex: 1000, borderWidth: 1, borderColor: '#333', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  toastText:           { color: '#fff', fontSize: 13, fontWeight: '600' },
  topBar:              { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingBottom: 10, paddingHorizontal: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  roleBadge:           { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  roleBadgeImpostor:   { backgroundColor: '#1a0a0a', borderColor: '#3a1a1a' },
  roleBadgeCrew:       { backgroundColor: '#b0e8e0', borderColor: '#80ccc4' },
  roleBadgeText:       { fontSize: 12, fontWeight: '700', color: '#f0f0f0' },
  missionBarWrap:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  missionBarBg:        { flex: 1, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  missionBarFill:      { height: 4, backgroundColor: '#00e676', borderRadius: 2 },
  missionBarLabel:     { fontSize: 10, color: '#444', width: 28 },
  currencyChip:        { backgroundColor: '#181818', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  currencyText:        { fontSize: 12, color: '#ffab40', fontWeight: '600' },
  zoneBanner:          { backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  zoneBannerText:      { fontSize: 12, color: '#555', textTransform: 'capitalize' },
  scroll:              { flex: 1 },
  scrollContent:       { padding: 12, gap: 12, paddingBottom: 100 },
  proximityToggle:     { paddingVertical: 8 },
  proximityToggleText: { fontSize: 12, color: '#444' },
  bottomBar:           { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#e0f7f4' },
  reportBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a0a0a', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#3a1010' },
  reportBtnIcon:       { fontSize: 16 },
  reportBtnText:       { fontSize: 13, fontWeight: '600', color: '#ff5252' },
  emergencyBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a1200', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#2a2000' },
  emergencyBtnIcon:    { fontSize: 16 },
  emergencyBtnText:    { fontSize: 13, fontWeight: '600', color: '#ffab40' },
  deadOverlay:         { flex: 1, backgroundColor: '#e0f7f4', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  deadIcon:            { fontSize: 64, opacity: 0.4 },
  deadTitle:           { fontSize: 28, fontWeight: '700', color: '#2a2a2a' },
  deadSubTitle:        { fontSize: 14, color: '#1a1a1a' },
});