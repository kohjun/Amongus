// src/screens/GameScreen.tsx
//
// 메인 게임 화면
// - 역할(crew/impostor)에 따라 UI 분기
// - KillButton (임포스터), MissionList (크루원)
// - AIMessageFeed (공통)
// - ProximityIndicator (공통)
// - 신고/긴급버튼 (공통)
// - ProximityService 연동 (UWB/BLE 거리 업데이트)
// - meeting_started → MeetingScreen 이동
// - game_ended → ResultScreen 이동

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { socket }           from '../services/SocketService';
import { ProximityService } from '../services/ProximityService';
import KillButton           from '../components/KillButton';
import AIMessageFeed        from '../components/AIMessageFeed';
import MissionList          from '../components/MissionList';
import ProximityIndicator   from '../components/ProximityIndicator';

// ── 타입 ────────────────────────────────────────────────
interface PlayerInfo {
  userId:   string;
  nickname: string;
  role:     'crew' | 'impostor';
  isAlive:  boolean;
  zone:     string | null;
  tasks:    any[];
  currency: number;
  items:    any[];
}

interface NearbyPlayer {
  playerId:  string;
  nickname:  string;
  distance:  number;
  method:    'uwb' | 'ble';
  isKillable?: boolean;
}

interface GameScreenProps {
  navigation: any;
  route: {
    params: {
      roomId:     string;
      playerInfo: PlayerInfo;
    };
  };
}

export default function GameScreen({ navigation, route }: GameScreenProps) {
  const { roomId, playerInfo: initialInfo } = route.params;

  const [playerInfo,     setPlayerInfo]     = useState<PlayerInfo>(initialInfo);
  const [nearbyPlayers,  setNearbyPlayers]  = useState<NearbyPlayer[]>([]);
  const [killableTargets, setKillableTargets] = useState<NearbyPlayer[]>([]);
  const [missionProgress, setMissionProgress] = useState({ completed: 0, total: 0, percent: 0 });
  const [currentZone,    setCurrentZone]    = useState<string | null>(initialInfo.zone);
  const [showProximity,  setShowProximity]  = useState(false);

  // 신고 버튼 쿨다운 (방탄조끼 등 연계)
  const reportCooldown = useRef(false);

  const isImpostor = playerInfo.role === 'impostor';
  const isAlive    = playerInfo.isAlive;

  // ── 소켓 이벤트 등록 ─────────────────────────────────
  useEffect(() => {
    // 미션 진행도 업데이트
    socket.on('mission_progress', (data: any) => {
      setMissionProgress(data);
    });

    // 미션 완료 — 내 task 상태 갱신
    socket.on('mission_completed', (data: any) => {
      setPlayerInfo(prev => ({
        ...prev,
        currency: data.currency,
        tasks: prev.tasks.map(t =>
          t.missionId === data.missionId
            ? { ...t, status: 'completed' }
            : t
        ),
      }));
    });

    // 킬 가능 대상 목록 (임포스터 전용)
    socket.on('killable_targets', (data: { targets: NearbyPlayer[] }) => {
      setKillableTargets(data.targets);
      // nearbyPlayers에도 isKillable 반영
      setNearbyPlayers(prev =>
        prev.map(p => ({
          ...p,
          isKillable: data.targets.some(k => k.playerId === p.playerId),
        }))
      );
    });

    // 회의 시작 → MeetingScreen
    socket.on('meeting_started', (data: any) => {
      navigation.navigate('Meeting', { roomId, meetingData: data });
    });

    // 게임 종료 → ResultScreen
    socket.on('game_ended', (data: any) => {
      navigation.replace('Result', { roomId, result: data });
    });

    // 재화 업데이트
    socket.on('currency_updated', ({ currency }: { currency: number }) => {
      setPlayerInfo(prev => ({ ...prev, currency }));
    });

    // 미션 가용 알림 (구역 진입 시)
    socket.on('mission_available', (data: any) => {
      setCurrentZone(data.zone);
      // tasks 상태 업데이트
      setPlayerInfo(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => {
          const updated = data.taskList.find((u: any) => u.missionId === t.missionId);
          return updated ? { ...t, ...updated } : t;
        }),
      }));
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
  }, [navigation, roomId]);

  // ── ProximityService 초기화 ───────────────────────────
  useEffect(() => {
    ProximityService.init(roomId, playerInfo.userId);

    // 거리 업데이트 콜백 → nearbyPlayers 상태 갱신
    ProximityService.onNearbyUpdate = (players: NearbyPlayer[]) => {
      setNearbyPlayers(players);
    };

    return () => {
      ProximityService.destroy();
    };
  }, [roomId, playerInfo.userId]);

  // ── 시체 신고 ─────────────────────────────────────────
  const handleReport = useCallback((bodyId: string) => {
    if (reportCooldown.current) return;
    reportCooldown.current = true;
    setTimeout(() => { reportCooldown.current = false; }, 3000);

    socket.emit('report_body', { roomId, bodyId }, (res: any) => {
      if (!res.ok) Alert.alert('신고 실패', res.error);
    });
  }, [roomId]);

  // ── 긴급 버튼 ─────────────────────────────────────────
  const handleEmergency = useCallback(() => {
    Alert.alert(
      '긴급 회의 소집',
      '긴급 버튼은 게임당 1회만 사용할 수 있습니다. 소집하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '소집',
          style: 'destructive',
          onPress: () => {
            socket.emit('emergency_meeting', { roomId }, (res: any) => {
              if (!res.ok) Alert.alert('실패', res.error);
            });
          },
        },
      ]
    );
  }, [roomId]);

  // ── 구역 이동 (테스트용 수동 이동 — 실제는 QR/GPS 트리거) ──
  const handleZoneChange = useCallback((zone: string) => {
    socket.emit('move', { roomId, zone }, (res: any) => {
      if (res.ok) setCurrentZone(zone);
    });
  }, [roomId]);

  // ── 사망 상태 오버레이 ────────────────────────────────
  if (!isAlive) {
    return (
      <View style={styles.deadOverlay}>
        <Text style={styles.deadIcon}>💀</Text>
        <Text style={styles.deadTitle}>사망</Text>
        <Text style={styles.deadSubTitle}>유령으로 게임을 지켜봅니다</Text>
        <AIMessageFeed roomId={roomId} isGhost />
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* 상단 상태바 */}
      <View style={styles.topBar}>
        <View style={styles.roleBadge(isImpostor)}>
          <Text style={styles.roleBadgeText}>
            {isImpostor ? '임포스터' : '크루원'}
          </Text>
        </View>

        <View style={styles.missionBarWrap}>
          <View style={styles.missionBarBg}>
            <View style={[styles.missionBarFill, { width: `${missionProgress.percent}%` }]} />
          </View>
          <Text style={styles.missionBarLabel}>{missionProgress.percent}%</Text>
        </View>

        <TouchableOpacity
          style={styles.currencyChip}
          onPress={() => navigation.navigate('Shop', { roomId })}
        >
          <Text style={styles.currencyText}>🪙 {playerInfo.currency}</Text>
        </TouchableOpacity>
      </View>

      {/* 현재 구역 */}
      {currentZone && (
        <View style={styles.zoneBanner}>
          <Text style={styles.zoneBannerText}>
            📍 {currentZone.replace(/_/g, ' ')}
          </Text>
        </View>
      )}

      {/* 메인 스크롤 영역 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* AI 메시지 피드 */}
        <AIMessageFeed roomId={roomId} />

        {/* 크루원: 미션 목록 */}
        {!isImpostor && (
          <MissionList
            tasks={playerInfo.tasks}
            currentZone={currentZone}
          />
        )}

        {/* 임포스터: 킬 버튼 */}
        {isImpostor && (
          <KillButton
            roomId={roomId}
            killableTargets={killableTargets}
          />
        )}

        {/* 근접 표시기 */}
        <TouchableOpacity
          onPress={() => setShowProximity(prev => !prev)}
          style={styles.proximityToggle}
        >
          <Text style={styles.proximityToggleText}>
            {showProximity ? '▾ 주변 플레이어 숨기기' : '▸ 주변 플레이어 보기'}
          </Text>
        </TouchableOpacity>

        {showProximity && (
          <ProximityIndicator
            nearbyPlayers={nearbyPlayers}
            isImpostor={isImpostor}
          />
        )}
      </ScrollView>

      {/* 하단 액션 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => {
            // 실제로는 근처 시체 목록에서 선택 — 여기선 테스트용 Alert
            Alert.alert('시체 신고', '근처의 시체를 신고하시겠습니까?', [
              { text: '취소', style: 'cancel' },
              { text: '신고', onPress: () => {
                // 실제 구현 시 bodyId를 proximity 기반으로 감지
                handleReport('detected-body-id');
              }},
            ]);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.reportBtnIcon}>🔴</Text>
          <Text style={styles.reportBtnText}>시체 신고</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.emergencyBtn}
          onPress={handleEmergency}
          activeOpacity={0.8}
        >
          <Text style={styles.emergencyBtnIcon}>⚠️</Text>
          <Text style={styles.emergencyBtnText}>긴급 버튼</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#0a0a0a',
  },

  // 상단 상태바
  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingTop:      52,
    paddingBottom:   10,
    paddingHorizontal: 14,
    gap:             10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  roleBadge: (isImpostor: boolean) => ({
    backgroundColor: isImpostor ? '#1a0a0a' : '#0a1a10',
    borderRadius:    8,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderWidth:     1,
    borderColor:     isImpostor ? '#3a1a1a' : '#0a3a1a',
  }),
  roleBadgeText: {
    fontSize:   12,
    fontWeight: '700',
    color:      '#f0f0f0',
  },
  missionBarWrap: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  missionBarBg: {
    flex:            1,
    height:          4,
    backgroundColor: '#1a1a1a',
    borderRadius:    2,
    overflow:        'hidden',
  },
  missionBarFill: {
    height:          4,
    backgroundColor: '#00e676',
    borderRadius:    2,
  },
  missionBarLabel: {
    fontSize: 10,
    color:    '#444',
    width:    28,
  },
  currencyChip: {
    backgroundColor: '#181818',
    borderRadius:    8,
    paddingHorizontal: 8,
    paddingVertical:   5,
  },
  currencyText: {
    fontSize:   12,
    color:      '#ffab40',
    fontWeight: '600',
  },

  // 구역 배너
  zoneBanner: {
    backgroundColor:   '#111',
    paddingHorizontal: 14,
    paddingVertical:   6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  zoneBannerText: {
    fontSize:      12,
    color:         '#555',
    textTransform: 'capitalize',
  },

  // 스크롤
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap:     12,
    paddingBottom: 100,
  },

  // 근접 토글
  proximityToggle: {
    paddingVertical: 8,
  },
  proximityToggleText: {
    fontSize: 12,
    color:    '#444',
  },

  // 하단 버튼
  bottomBar: {
    flexDirection:     'row',
    padding:           12,
    gap:               10,
    borderTopWidth:    1,
    borderTopColor:    '#1a1a1a',
    backgroundColor:   '#0a0a0a',
  },
  reportBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    backgroundColor: '#1a0a0a',
    borderRadius:    12,
    paddingVertical: 12,
    borderWidth:     1,
    borderColor:     '#3a1010',
  },
  reportBtnIcon: {
    fontSize: 16,
  },
  reportBtnText: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#ff5252',
  },
  emergencyBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    backgroundColor: '#1a1200',
    borderRadius:    12,
    paddingVertical: 12,
    borderWidth:     1,
    borderColor:     '#2a2000',
  },
  emergencyBtnIcon: {
    fontSize: 16,
  },
  emergencyBtnText: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#ffab40',
  },

  // 사망 화면
  deadOverlay: {
    flex:            1,
    backgroundColor: '#050505',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         24,
    gap:             12,
  },
  deadIcon: {
    fontSize: 64,
    opacity:  0.4,
  },
  deadTitle: {
    fontSize:   28,
    fontWeight: '700',
    color:      '#2a2a2a',
  },
  deadSubTitle: {
    fontSize: 14,
    color:    '#1a1a1a',
  },
});