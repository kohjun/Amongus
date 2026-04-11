// src/screens/MeetingScreen.tsx
// 회의 및 투표 화면 — 토론, 투표, 기권, 결과 확인 기능 포함

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socket }    from '../services/SocketService';
import { gameStore } from '../store/gameStore';

interface PlayerInfo {
  userId:   string;
  nickname: string;
  isAlive:  boolean;
  color?:   string;
}

interface MeetingResult {
  ejected:    PlayerInfo | null;
  wasImpostor: boolean | null;
  isTied:     boolean;
  voteCount:  Record<string, number>;
  totalVotes: number;
}

const COLORS = [
  '#00e676','#69f0ae','#40c4ff','#e040fb',
  '#ffab40','#ff5252','#ea80fc','#64ffda',
];

export default function MeetingScreen() {
  const router  = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  const meetingData = gameStore.getMeetingData() as any;
  const myInfo      = gameStore.getPlayerInfo();

  // ── 상태 관리 ──────────────────────────────────────────
  const [phase, setPhase]                   = useState<'discussion' | 'voting' | 'result'>('discussion');
  const [remaining, setRemaining]           = useState<number>(meetingData?.discussionTime || 90);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [hasVoted, setHasVoted]             = useState<boolean>(false);
  const [hasPreVoted, setHasPreVoted]       = useState<boolean>(false);
  const [totalVoted, setTotalVoted]         = useState<number>(0);
  const [preVoteCount, setPreVoteCount]     = useState<number>(0);
  const [totalPlayers, setTotalPlayers]     = useState<number>(0);
  const [resultData, setResultData]         = useState<MeetingResult | null>(null);

  // ── isMeDead: alivePlayers 목록 기준으로 판단 ─────────
  // gameStore의 PlayerInfo에 isAlive가 없을 수 있으므로
  // 서버에서 받은 alivePlayers 목록을 기준으로 생존 여부를 판단합니다.
  const myUserId                    = myInfo?.userId ?? '';
  const alivePlayers: PlayerInfo[]  = meetingData?.alivePlayers ?? [];
  const isMeDead = alivePlayers.length > 0
    ? !alivePlayers.some(p => p.userId === myUserId)
    : false; // alivePlayers 없으면 살아있다고 가정 (안전한 기본값)

  // ── 초기 데이터 검증 ───────────────────────────────────
  useEffect(() => {
    if (!meetingData || !myInfo) {
      Alert.alert('오류', '회의 데이터를 불러올 수 없습니다.');
      router.back();
      return;
    }
    // 초기 totalPlayers 세팅
    setTotalPlayers(alivePlayers.length);
  }, []);

  // ── 소켓 이벤트 리스너 ────────────────────────────────
  useEffect(() => {
    socket.on('meeting_tick', (data: { phase: string; remaining: number }) => {
      setPhase(data.phase as 'discussion' | 'voting' | 'result');
      setRemaining(data.remaining);
    });

    socket.on('voting_started', (data: { alivePlayers: PlayerInfo[]; voteTime: number }) => {
      setPhase('voting');
      setTotalPlayers(data.alivePlayers?.length ?? 0);
    });

    socket.on('pre_vote_submitted', (data: {
      voterNickname: string;
      preVoteCount:  number;
      totalPlayers:  number;
    }) => {
      setPreVoteCount(data.preVoteCount);
      setTotalPlayers(data.totalPlayers);
    });

    socket.on('vote_submitted', (data: {
      voterNickname: string;
      totalVotes:    number;
      totalPlayers:  number;
    }) => {
      setTotalVoted(data.totalVotes);
      setTotalPlayers(data.totalPlayers);
    });

    // 서버가 flat하게 전송하므로 data 자체가 MeetingResult
    socket.on('vote_result', (data: MeetingResult) => {
      setPhase('result');
      setResultData(data);
    });

    socket.on('meeting_ended', () => {
      router.replace({ pathname: '/(game)/game', params: { roomId } });
    });

    return () => {
      socket.off('meeting_tick');
      socket.off('voting_started');
      socket.off('pre_vote_submitted');
      socket.off('vote_submitted');
      socket.off('vote_result');
      socket.off('meeting_ended');
    };
  }, [roomId]);

  // ── 투표 제출 핸들러 (토론 중 사전 투표 + 투표 단계 모두 처리) ──
  const handleConfirmVote = () => {
    if (!selectedTarget) {
      Alert.alert('안내', '플레이어 또는 기권을 선택해주세요.');
      return;
    }

    socket.emit('vote', { roomId, targetId: selectedTarget }, (res: {
      ok: boolean; preVote?: boolean; count?: number; error?: string;
    }) => {
      if (res.ok) {
        if (res.preVote) {
          setHasPreVoted(true);
        } else {
          setHasVoted(true);
        }
      } else {
        Alert.alert('투표 실패', res.error || '알 수 없는 오류');
      }
    });
  };

  if (!meetingData) return null;

  // ── 렌더링: 결과 화면 ─────────────────────────────────
  if (phase === 'result' && resultData) {
    return (
      <View style={styles.root}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>투표 결과</Text>

          {resultData.isTied ? (
            <Text style={styles.resultMainText}>
              동률입니다. 아무도 추방되지 않았습니다.
            </Text>
          ) : resultData.ejected ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.resultMainText}>
                {resultData.ejected.nickname} 님이 추방되었습니다.
              </Text>
              <Text style={[
                styles.resultSubText,
                { color: resultData.wasImpostor ? '#ff5252' : '#00e676' }
              ]}>
                {resultData.ejected.nickname} 님은{' '}
                {resultData.wasImpostor ? '임포스터였습니다.' : '크루원이었습니다.'}
              </Text>
            </View>
          ) : (
            <Text style={styles.resultMainText}>
              투표가 건너뛰어졌습니다. 아무도 추방되지 않았습니다.
            </Text>
          )}

          <ActivityIndicator style={{ marginTop: 40 }} color="#00e676" />
          <Text style={styles.resultWaitText}>게임으로 돌아가는 중...</Text>
        </View>
      </View>
    );
  }

  // ── 렌더링: 회의 및 투표 화면 ────────────────────────
  return (
    <View style={styles.root}>

      {/* 상단 정보 */}
      <View style={styles.header}>
        <Text style={styles.meetingReason}>
          {meetingData.reason === 'emergency' ? '긴급 회의' : '시체 발견'}
        </Text>
        <Text style={styles.meetingCaller}>
          소집자: {meetingData.caller?.nickname || '알 수 없음'}
        </Text>
      </View>

      {/* 타이머 */}
      <View style={styles.timerContainer}>
        <Text style={styles.phaseText}>
          {phase === 'discussion' ? '🗣 토론 시간' : '🗳 투표 시간'}
        </Text>
        <Text style={[styles.timerText, phase === 'voting' && { color: '#ff5252' }]}>
          {remaining}초
        </Text>
        {phase === 'discussion' && preVoteCount > 0 && (
          <Text style={styles.voteCountText}>
            {preVoteCount} / {totalPlayers} 명 사전 투표
          </Text>
        )}
        {phase === 'voting' && (
          <Text style={styles.voteCountText}>
            {totalVoted} / {totalPlayers} 명 투표 완료
          </Text>
        )}
      </View>

      {/* 플레이어 목록 */}
      <ScrollView style={styles.playerList} contentContainerStyle={styles.playerListContent}>
        {alivePlayers.map((player, index) => {
          const isSelected = selectedTarget === player.userId;
          const isMe       = player.userId === myUserId;

          return (
            <TouchableOpacity
              key={player.userId}
              style={[
                styles.playerCard,
                isSelected && styles.playerCardSelected,
                isMe       && styles.playerCardMe,
              ]}
              disabled={(phase === 'discussion' ? hasPreVoted : hasVoted) || isMeDead || isMe}
              onPress={() => setSelectedTarget(player.userId)}
              activeOpacity={0.7}
            >
              <View style={styles.playerInfoRow}>
                <View style={[styles.avatar, { borderColor: COLORS[index % COLORS.length] }]}>
                  <Text style={[styles.avatarInitial, { color: COLORS[index % COLORS.length] }]}>
                    {player.nickname.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.playerName}>
                  {player.nickname}{isMe ? ' (나)' : ''}
                </Text>
              </View>

              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>선택됨 ✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 하단 투표 액션 */}
      {!isMeDead && (
        <View style={styles.bottomActions}>
          {phase === 'discussion' ? (
            <>
              <TouchableOpacity
                style={[
                  styles.skipButton,
                  selectedTarget === 'skip' && styles.skipButtonSelected,
                  hasPreVoted && styles.skipButtonDisabled,
                ]}
                disabled={hasPreVoted}
                onPress={() => setSelectedTarget('skip')}
              >
                <Text style={styles.skipButtonText}>기권하기 (Skip)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  styles.preVoteButton,
                  (!selectedTarget || hasPreVoted) && styles.confirmButtonDisabled,
                ]}
                disabled={!selectedTarget || hasPreVoted}
                onPress={handleConfirmVote}
              >
                <Text style={styles.confirmButtonText}>
                  {hasPreVoted ? '사전 투표 완료 ✓' : '사전 투표하기'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.skipButton,
                  selectedTarget === 'skip' && styles.skipButtonSelected,
                  hasVoted && styles.skipButtonDisabled,
                ]}
                disabled={hasVoted}
                onPress={() => setSelectedTarget('skip')}
              >
                <Text style={styles.skipButtonText}>기권하기 (Skip)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (!selectedTarget || hasVoted) && styles.confirmButtonDisabled,
                ]}
                disabled={!selectedTarget || hasVoted}
                onPress={handleConfirmVote}
              >
                <Text style={styles.confirmButtonText}>
                  {hasVoted ? '투표 완료 ✓' : '투표 확정'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* 사망 플레이어 안내 */}
      {isMeDead && (
        <View style={styles.deadNotice}>
          <Text style={styles.deadNoticeText}>👻 사망한 플레이어는 투표에 참여할 수 없습니다.</Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root:                  { flex: 1, backgroundColor: '#e0f7f4' },

  // 헤더
  header:                { alignItems: 'center', paddingTop: 60, paddingBottom: 20, backgroundColor: '#c8f0e9', borderBottomWidth: 1, borderColor: '#1e1e1e' },
  meetingReason:         { fontSize: 24, fontWeight: 'bold', color: '#ff5252', marginBottom: 4 },
  meetingCaller:         { fontSize: 14, color: '#1a1a1a' },

  // 타이머
  timerContainer:        { alignItems: 'center', paddingVertical: 16 },
  phaseText:             { fontSize: 16, color: '#1a1a1a', marginBottom: 4 },
  timerText:             { fontSize: 36, fontWeight: 'bold', color: '#00e676' },
  voteCountText:         { fontSize: 13, color: '#1a1a1a', marginTop: 6 },

  // 플레이어 목록
  playerList:            { flex: 1 },
  playerListContent:     { padding: 16, gap: 12 },
  playerCard:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#c8f0e9', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  playerCardSelected:    { borderColor: '#00e676', backgroundColor: '#a8e4da' },
  playerCardMe:          { borderColor: '#444' },
  playerCardDisabled:    { opacity: 0.5 },
  playerInfoRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:                { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#c8f0e9' },
  avatarInitial:         { fontSize: 18, fontWeight: 'bold' },
  playerName:            { fontSize: 16, color: '#1a1a1a', fontWeight: '500' },
  selectedBadge:         { backgroundColor: '#00e676', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  selectedBadgeText:     { fontSize: 12, color: '#000', fontWeight: 'bold' },

  // 하단 액션
  bottomActions:         { padding: 20, borderTopWidth: 1, borderColor: '#1a1a1a', gap: 12, backgroundColor: '#e0f7f4' },
  waitingNotice:         { alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 10, backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: '#2a3a2a' },
  waitingNoticeText:     { fontSize: 14, color: '#6abf6a', textAlign: 'center', lineHeight: 22 },
  skipButton:            { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#444', backgroundColor: '#c8f0e9' },
  skipButtonSelected:    { borderColor: '#ffab40', backgroundColor: '#fff3e0' },
  skipButtonDisabled:    { opacity: 0.4 },
  skipButtonText:        { fontSize: 15, color: '#555', fontWeight: '600' },
  confirmButton:         { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 10, backgroundColor: '#00e676' },
  preVoteButton:         { backgroundColor: '#ffab40' },
  confirmButtonDisabled: { backgroundColor: '#0a2a1a' },
  confirmButtonText:     { fontSize: 16, color: '#000', fontWeight: 'bold' },

  // 사망 안내
  deadNotice:            { padding: 20, borderTopWidth: 1, borderColor: '#1a1a1a', alignItems: 'center', backgroundColor: '#1a1a1a' },
  deadNoticeText:        { fontSize: 14, color: '#666', textAlign: 'center' },

  // 결과 화면
  resultContainer:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  resultTitle:           { fontSize: 32, fontWeight: 'bold', color: '#f0f0f0', marginBottom: 20 },
  resultMainText:        { fontSize: 20, color: '#fff', textAlign: 'center', lineHeight: 30, marginBottom: 12 },
  resultSubText:         { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  resultWaitText:        { fontSize: 14, color: '#888', marginTop: 12 },
});