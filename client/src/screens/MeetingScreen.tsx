// client/src/screens/MeetingScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Animated
} from 'react-native';
import { socket } from '../services/SocketService';

type Phase = 'discussion' | 'voting' | 'result';

interface Player {
  userId:   string;
  nickname: string;
  isAlive:  boolean;
}

interface Props {
  roomId:      string;
  myUserId:    string;
  onGameResume: () => void;
}

export default function MeetingScreen({ roomId, myUserId, onGameResume }: Props) {
  const [phase, setPhase]               = useState<Phase>('discussion');
  const [remaining, setRemaining]       = useState(90);
  const [alivePlayers, setAlivePlayers] = useState<Player[]>([]);
  const [myVote, setMyVote]             = useState<string | null>(null);
  const [voteCount, setVoteCount]       = useState(0);
  const [result, setResult]             = useState<any>(null);
  const [caller, setCaller]             = useState<string>('');
  const [reason, setReason]             = useState<string>('');
  const [aiMessage, setAiMessage]       = useState<string>('');

  useEffect(() => {
    // 회의 시작 정보 수신
    socket.on('meeting_started', (data) => {
      setPhase('discussion');
      setRemaining(data.discussionTime);
      setAlivePlayers(data.alivePlayers);
      setCaller(data.caller.nickname);
      setReason(data.reason);
    });

    // 매초 타이머
    socket.on('meeting_tick', ({ phase: p, remaining: r }) => {
      setPhase(p);
      setRemaining(r);
    });

    // 투표 단계
    socket.on('voting_started', (data) => {
      setPhase('voting');
      setRemaining(data.voteTime);
      setAlivePlayers(data.alivePlayers);
    });

    // 투표 제출 알림
    socket.on('vote_submitted', (data) => {
      setVoteCount(data.totalVotes);
    });

    // 결과
    socket.on('vote_result', (data) => {
      setPhase('result');
      setResult(data);
    });

    // AI 메시지
    socket.on('ai_message', ({ message }) => {
      setAiMessage(message);
    });

    // 게임 복귀
    socket.on('meeting_ended', () => {
      onGameResume();
    });

    return () => {
      ['meeting_started','meeting_tick','voting_started',
       'vote_submitted','vote_result','ai_message','meeting_ended']
        .forEach(e => socket.off(e));
    };
  }, []);

  // ── 투표 제출 ────────────────────────────────────────────
  const handleVote = (targetId: string) => {
    if (myVote) return;  // 이미 투표함

    socket.emit('vote', { roomId, voterId: myUserId, targetId }, (res: any) => {
      if (res.ok) {
        setMyVote(targetId);
      } else {
        alert(res.error);
      }
    });
  };

  // ── 렌더링 ───────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {reason === 'report' ? '🚨 시체 신고!' : '⚠️ 긴급 회의!'}
        </Text>
        <Text style={styles.callerText}>{caller}님이 소집</Text>
      </View>

      {/* 타이머 */}
      <View style={styles.timerBox}>
        <Text style={styles.phaseText}>
          {phase === 'discussion' ? '토론 중' : phase === 'voting' ? '투표 중' : '결과'}
        </Text>
        <Text style={[styles.timerText, remaining <= 10 && styles.timerRed]}>
          {remaining}초
        </Text>
      </View>

      {/* AI 멘트 */}
      {aiMessage ? (
        <View style={styles.aiBox}>
          <Text style={styles.aiText}>🤖 {aiMessage}</Text>
        </View>
      ) : null}

      {/* 토론 단계 - 플레이어 목록만 표시 */}
      {phase === 'discussion' && (
        <FlatList
          data={alivePlayers}
          keyExtractor={p => p.userId}
          renderItem={({ item }) => (
            <View style={styles.playerRow}>
              <Text style={styles.playerName}>{item.nickname}</Text>
            </View>
          )}
        />
      )}

      {/* 투표 단계 - 투표 버튼 */}
      {phase === 'voting' && (
        <>
          <Text style={styles.voteGuide}>
            {myVote
              ? `투표 완료 (${voteCount}/${alivePlayers.length}명 투표)`
              : '추방할 플레이어를 선택하세요'}
          </Text>

          <FlatList
            data={alivePlayers}
            keyExtractor={p => p.userId}
            renderItem={({ item }) => {
              const isMe       = item.userId === myUserId;
              const isSelected = myVote === item.userId;

              return (
                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    isSelected && styles.voteButtonSelected,
                    (isMe || myVote) && styles.voteButtonDisabled,
                  ]}
                  onPress={() => !isMe && !myVote && handleVote(item.userId)}
                  disabled={isMe || !!myVote}
                >
                  <Text style={styles.voteButtonText}>
                    {item.nickname} {isMe ? '(나)' : ''} {isSelected ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          {/* SKIP 버튼 */}
          <TouchableOpacity
            style={[styles.skipButton, myVote && styles.voteButtonDisabled]}
            onPress={() => !myVote && handleVote('skip')}
            disabled={!!myVote}
          >
            <Text style={styles.skipText}>
              {myVote === 'skip' ? '✓ SKIP' : 'SKIP (추방 안 함)'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* 결과 단계 */}
      {phase === 'result' && result && (
        <View style={styles.resultBox}>
          {result.ejected ? (
            <>
              <Text style={styles.resultTitle}>
                {result.ejected.nickname} 추방됨
              </Text>
              <Text style={[
                styles.roleReveal,
                result.wasImpostor ? styles.impostorText : styles.crewText
              ]}>
                {result.wasImpostor ? '임포스터였습니다! 😈' : '크루원이었습니다... 😢'}
              </Text>
            </>
          ) : (
            <Text style={styles.resultTitle}>
              {result.isTied ? '동률! 아무도 추방되지 않았습니다.' : 'SKIP — 추방 없음'}
            </Text>
          )}

          {/* 상세 투표 현황 */}
          <View style={styles.voteDetail}>
            {result.voteDetails?.map((v: any, i: number) => (
              <Text key={i} style={styles.voteDetailText}>
                {v.voter} → {v.target}
              </Text>
            ))}
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#1a1a2e', padding: 16 },
  header:               { alignItems: 'center', marginBottom: 16 },
  headerTitle:          { fontSize: 24, fontWeight: 'bold', color: '#ff4444' },
  callerText:           { color: '#aaa', marginTop: 4 },
  timerBox:             { alignItems: 'center', marginBottom: 12 },
  phaseText:            { color: '#fff', fontSize: 14 },
  timerText:            { fontSize: 48, fontWeight: 'bold', color: '#fff' },
  timerRed:             { color: '#ff4444' },
  aiBox:                { backgroundColor: '#2a2a4e', borderRadius: 8, padding: 10, marginBottom: 12 },
  aiText:               { color: '#aac8ff', fontSize: 13 },
  playerRow:            { padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  playerName:           { color: '#fff', fontSize: 16 },
  voteGuide:            { color: '#aaa', textAlign: 'center', marginBottom: 8 },
  voteButton:           { backgroundColor: '#2a2a4e', padding: 14, borderRadius: 8, marginBottom: 8 },
  voteButtonSelected:   { backgroundColor: '#cc0000' },
  voteButtonDisabled:   { opacity: 0.5 },
  voteButtonText:       { color: '#fff', fontSize: 16, textAlign: 'center' },
  skipButton:           { backgroundColor: '#444', padding: 14, borderRadius: 8, marginTop: 8 },
  skipText:             { color: '#fff', textAlign: 'center', fontSize: 16 },
  resultBox:            { alignItems: 'center', marginTop: 16 },
  resultTitle:          { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  roleReveal:           { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  impostorText:         { color: '#ff4444' },
  crewText:             { color: '#44aaff' },
  voteDetail:           { marginTop: 8 },
  voteDetailText:       { color: '#aaa', fontSize: 13, marginBottom: 4 },
});
