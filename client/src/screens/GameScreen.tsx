// src/screens/GameScreen.tsx
// 메인 게임 화면 — 역할(crew/impostor)에 따라 UI 분기 및 AI 채팅 로그

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socket }             from '../services/SocketService';
import ProximityService       from '../services/ProximityService';
import KillButton             from '../components/KillButton';
import MissionList            from '../components/MissionList';
import AIChatInput            from '../components/AIChatInput';
import ProximityMapModal      from '../components/ProximityMapModal';
import { gameStore }          from '../store/gameStore';
import { PlayerInfo, MissionTask, GameResult } from '../types/navigation';

// ── 채팅 로그 타입 ────────────────────────────────────────────
interface ChatLog {
  id:        string;
  type:      'ai_announce' | 'ai_guide' | 'ai_reply' | 'system';
  message:   string;
  timestamp: number;
}

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
  const [showMap,         setShowMap]         = useState(false);

  // ── 토스트 ────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const reportCooldown = useRef(false);

  // ── AI 채팅 로그 ──────────────────────────────────────────
  const [chatLogs,  setChatLogs]  = useState<ChatLog[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const appendLog = (log: ChatLog) => {
    setChatLogs(prev => [...prev, log]);
  };

  useEffect(() => {
    if (!playerInfo) router.replace('/(game)/lobby');
  }, []);

  const isImpostor = playerInfo?.role === 'impostor';
  const isAlive    = playerInfo?.isAlive ?? false;

  // ── 게임 소켓 이벤트 ──────────────────────────────────────
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
      showToast('✅ 미션 완료!');
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

    // ── AI 채팅 로그 이벤트 ────────────────────────────────
    socket.on('ai_message', (data: { type: string; message: string }) => {
      appendLog({
        id:        Date.now().toString(),
        type:      'ai_announce',
        message:   data.message,
        timestamp: Date.now(),
      });
    });

    socket.on('ai_guide', (data: { message: string }) => {
      appendLog({
        id:        Date.now().toString(),
        type:      'ai_guide',
        message:   data.message,
        timestamp: Date.now(),
      });
    });

    socket.on('ai_reply', (data: { question: string; answer: string }) => {
      appendLog({
        id:        Date.now().toString(),
        type:      'ai_reply',
        message:   data.answer,
        timestamp: Date.now(),
      });
      setAiLoading(false);
    });

    return () => {
      socket.off('mission_progress');
      socket.off('mission_completed');
      socket.off('killable_targets');
      socket.off('meeting_started');
      socket.off('game_ended');
      socket.off('currency_updated');
      socket.off('mission_available');
      socket.off('ai_message');
      socket.off('ai_guide');
      socket.off('ai_reply');
    };
  }, [roomId, playerInfo?.userId]);

  // ── 근접 감지 ─────────────────────────────────────────────
  useEffect(() => {
    if (!playerInfo) return;
    ProximityService.init(roomId, playerInfo.userId);
    ProximityService.onNearbyUpdate = (players) => setNearbyPlayers(players);
    return () => { ProximityService.destroy(); };
  }, [roomId, playerInfo?.userId]);

  // ── 신고 / 긴급 버튼 ──────────────────────────────────────
  const handleReport = useCallback((bodyId: string) => {
    if (reportCooldown.current) return;
    reportCooldown.current = true;

    socket.emit('report_body', { roomId, bodyId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        showToast('📢 시체를 신고했습니다!');
      } else {
        showToast(`❌ 신고 실패: ${res.error}`);
        reportCooldown.current = false;
      }
    });
  }, [roomId]);

  const handleEmergency = useCallback(() => {
    socket.emit('emergency_meeting', { roomId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        showToast('🚨 긴급 회의 소집 중...');
      } else {
        showToast(`❌ 버튼 작동 실패: ${res.error}`);
      }
    });
  }, [roomId]);

  // ── AI 질문 전송 ──────────────────────────────────────────
  const handleAskAI = useCallback((question: string) => {
    setAiLoading(true);

    // 내 질문 먼저 로그에 추가
    appendLog({
      id:        Date.now().toString(),
      type:      'system',
      message:   '나: ' + question,
      timestamp: Date.now(),
    });

    socket.emit('ai_ask', { roomId, question }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        // 응답은 ai_reply 이벤트로 수신
        setAiLoading(false);
      } else {
        appendLog({
          id:        Date.now().toString(),
          type:      'system',
          message:   '❌ 오류: ' + (res.error ?? '알 수 없는 오류'),
          timestamp: Date.now(),
        });
        setAiLoading(false);
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

      {/* 상단바: 역할 뱃지 / 미션 진행도 / 재화 */}
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

      {/* 구역 배너 */}
      {currentZone && (
        <View style={styles.zoneBanner}>
          <Text style={styles.zoneBannerText}>📍 {currentZone.replace(/_/g, ' ')}</Text>
        </View>
      )}

      {/* 미션 목록 / 킬 버튼 */}
      {!isImpostor && <MissionList tasks={playerInfo.tasks} currentZone={currentZone} />}
      {isImpostor  && <KillButton roomId={roomId} killableTargets={killableTargets} />}

      {/* 주변 플레이어 보기 버튼 */}
      <TouchableOpacity onPress={() => setShowMap(true)} style={styles.proximityToggle}>
        <Text style={styles.proximityToggleText}>▸ 주변 플레이어 보기</Text>
      </TouchableOpacity>

      {/* AI 채팅 로그 */}
      <ScrollView
        ref={chatScrollRef}
        style={styles.chatLog}
        contentContainerStyle={styles.chatLogContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
      >
        {chatLogs.map(log => (
          <View
            key={log.id}
            style={log.type === 'system' ? styles.logSystem : styles.logAI}
          >
            <Text style={log.type === 'system' ? styles.logSystemText : styles.logAIText}>
              {log.message}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* AI 채팅 입력창 */}
      <AIChatInput
        onSend={handleAskAI}
        loading={aiLoading}
        disabled={!isAlive}
      />

      {/* 하단 신고 / 긴급 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => handleReport('detected-body-id')}
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

      {/* 맵 모달 */}
      <ProximityMapModal
        visible={showMap}
        onClose={() => setShowMap(false)}
        nearbyPlayers={nearbyPlayers}
        myNickname={playerInfo?.nickname ?? '나'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:                { flex: 1, backgroundColor: '#e0f7f4' },
  toastContainer:      { position: 'absolute', top: 110, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.88)', padding: 12, borderRadius: 10, zIndex: 1000, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  toastText:           { color: '#fff', fontSize: 13, fontWeight: '600' },
  topBar:              { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingBottom: 10, paddingHorizontal: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  roleBadge:           { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  roleBadgeImpostor:   { backgroundColor: '#1a0a0a', borderColor: '#3a1a1a' },
  roleBadgeCrew:       { backgroundColor: '#0a1a0a', borderColor: '#1a3a1a' },
  roleBadgeText:       { fontSize: 12, fontWeight: '700', color: '#f0f0f0' },
  missionBarWrap:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  missionBarBg:        { flex: 1, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  missionBarFill:      { height: 4, backgroundColor: '#00e676', borderRadius: 2 },
  missionBarLabel:     { fontSize: 10, color: '#1a1a1a', width: 28 },
  currencyChip:        { backgroundColor: '#181818', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  currencyText:        { fontSize: 12, color: '#ffab40', fontWeight: '600' },
  zoneBanner:          { backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  zoneBannerText:      { fontSize: 12, color: '#555', textTransform: 'capitalize' },
  proximityToggle:     { paddingVertical: 8, paddingHorizontal: 14 },
  proximityToggleText: { fontSize: 12, color: '#1a1a1a' },
  // AI 채팅 로그
  chatLog:             { flex: 1, backgroundColor: '#111' },
  chatLogContent:      { padding: 12, gap: 8 },
  logAI: {
    alignSelf:       'flex-start',
    backgroundColor: '#1e2a1e',
    borderRadius:    8,
    padding:         10,
    maxWidth:        '85%',
  },
  logAIText:  { color: '#00e676', fontSize: 13, lineHeight: 18 },
  logSystem: {
    alignSelf:       'flex-end',
    backgroundColor: '#1a1a2a',
    borderRadius:    8,
    padding:         10,
    maxWidth:        '85%',
  },
  logSystemText: { color: '#888', fontSize: 13, lineHeight: 18 },
  // 하단 버튼
  bottomBar:           { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#0a0a0a' },
  reportBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a0a0a', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#3a1010' },
  reportBtnIcon:       { fontSize: 16 },
  reportBtnText:       { fontSize: 13, fontWeight: '600', color: '#ff5252' },
  emergencyBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a1200', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#2a2000' },
  emergencyBtnIcon:    { fontSize: 16 },
  emergencyBtnText:    { fontSize: 13, fontWeight: '600', color: '#ffab40' },
  // 사망 화면
  deadOverlay:         { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  deadIcon:            { fontSize: 64, opacity: 0.4 },
  deadTitle:           { fontSize: 28, fontWeight: '700', color: '#aaa' },
  deadSubTitle:        { fontSize: 14, color: '#555' },
});
