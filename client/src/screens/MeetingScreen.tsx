// src/screens/MeetingScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socket } from '../services/SocketService';

type Phase = 'discussion' | 'voting' | 'result';

interface Player {
  userId:   string;
  nickname: string;
  isAlive:  boolean;
}

interface VoteResult {
  ejected?:     { nickname: string } | null;
  wasImpostor?: boolean;
  isTied?:      boolean;
  voteDetails?: { voter: string; target: string }[];
}

export default function MeetingScreen() {
  const router = useRouter();
  const { roomId, myUserId } = useLocalSearchParams<{ roomId: string; myUserId: string }>();

  const [phase,        setPhase]        = useState<Phase>('discussion');
  const [remaining,    setRemaining]    = useState(90);
  const [alivePlayers, setAlivePlayers] = useState<Player[]>([]);
  const [myVote,       setMyVote]       = useState<string | null>(null);
  const [voteCount,    setVoteCount]    = useState(0);
  const [result,       setResult]       = useState<VoteResult | null>(null);
  const [caller,       setCaller]       = useState('');
  const [reason,       setReason]       = useState('');
  const [aiMessage,    setAiMessage]    = useState('');

  useEffect(() => {
    socket.on('meeting_started', (data: {
      discussionTime: number; alivePlayers: Player[];
      caller: { nickname: string }; reason: string;
    }) => {
      setPhase('discussion');
      setRemaining(data.discussionTime);
      setAlivePlayers(data.alivePlayers);
      setCaller(data.caller.nickname);
      setReason(data.reason);
    });

    socket.on('meeting_tick', ({ phase: p, remaining: r }: { phase: Phase; remaining: number }) => {
      setPhase(p);
      setRemaining(r);
    });

    socket.on('voting_started', (data: { voteTime: number; alivePlayers: Player[] }) => {
      setPhase('voting');
      setRemaining(data.voteTime);
      setAlivePlayers(data.alivePlayers);
    });

    socket.on('vote_submitted', (data: { totalVotes: number }) => setVoteCount(data.totalVotes));

    socket.on('vote_result', (data: VoteResult) => {
      setPhase('result');
      setResult(data);
    });

    socket.on('ai_message', ({ message }: { message: string }) => setAiMessage(message));

    socket.on('meeting_ended', () => router.back());

    return () => {
      ['meeting_started','meeting_tick','voting_started',
       'vote_submitted','vote_result','ai_message','meeting_ended']
        .forEach(e => socket.off(e));
    };
  }, []);

  const handleVote = (targetId: string) => {
    if (myVote) return;
    socket.emit('vote', { roomId, voterId: myUserId, targetId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) setMyVote(targetId);
      else Alert.alert('투표 실패', res.error);
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {reason === 'report' ? '🚨 시체 신고!' : '⚠️ 긴급 회의!'}
        </Text>
        <Text style={styles.callerText}>{caller}님이 소집</Text>
      </View>

      <View style={styles.timerBox}>
        <Text style={styles.phaseText}>
          {phase === 'discussion' ? '토론 중' : phase === 'voting' ? '투표 중' : '결과'}
        </Text>
        <Text style={[styles.timerText, remaining <= 10 && styles.timerRed]}>{remaining}초</Text>
      </View>

      {aiMessage ? (
        <View style={styles.aiBox}><Text style={styles.aiText}>🤖 {aiMessage}</Text></View>
      ) : null}

      {phase === 'discussion' && (
        <FlatList
          data={alivePlayers}
          keyExtractor={p => p.userId}
          renderItem={({ item }) => (
            <View style={styles.playerRow}><Text style={styles.playerName}>{item.nickname}</Text></View>
          )}
        />
      )}

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
              const isMe = item.userId === myUserId;
              const isSelected = myVote === item.userId;
              return (
                <TouchableOpacity
                  style={[styles.voteButton, isSelected && styles.voteButtonSelected, (isMe || !!myVote) && styles.voteButtonDisabled]}
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
          <TouchableOpacity
            style={[styles.skipButton, !!myVote && styles.voteButtonDisabled]}
            onPress={() => !myVote && handleVote('skip')}
            disabled={!!myVote}
          >
            <Text style={styles.skipText}>{myVote === 'skip' ? '✓ SKIP' : 'SKIP (추방 안 함)'}</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'result' && result && (
        <View style={styles.resultBox}>
          {result.ejected ? (
            <>
              <Text style={styles.resultTitle}>{result.ejected.nickname} 추방됨</Text>
              <Text style={[styles.roleReveal, result.wasImpostor ? styles.impostorText : styles.crewText]}>
                {result.wasImpostor ? '임포스터였습니다! 😈' : '크루원이었습니다... 😢'}
              </Text>
            </>
          ) : (
            <Text style={styles.resultTitle}>
              {result.isTied ? '동률! 아무도 추방되지 않았습니다.' : 'SKIP — 추방 없음'}
            </Text>
          )}
          <View style={styles.voteDetail}>
            {result.voteDetails?.map((v, i) => (
              <Text key={i} style={styles.voteDetailText}>{v.voter} → {v.target}</Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#1a1a2e', padding: 16 },
  header:             { alignItems: 'center', marginBottom: 16 },
  headerTitle:        { fontSize: 24, fontWeight: 'bold', color: '#ff4444' },
  callerText:         { color: '#aaa', marginTop: 4 },
  timerBox:           { alignItems: 'center', marginBottom: 12 },
  phaseText:          { color: '#fff', fontSize: 14 },
  timerText:          { fontSize: 48, fontWeight: 'bold', color: '#fff' },
  timerRed:           { color: '#ff4444' },
  aiBox:              { backgroundColor: '#2a2a4e', borderRadius: 8, padding: 10, marginBottom: 12 },
  aiText:             { color: '#aac8ff', fontSize: 13 },
  playerRow:          { padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  playerName:         { color: '#fff', fontSize: 16 },
  voteGuide:          { color: '#aaa', textAlign: 'center', marginBottom: 8 },
  voteButton:         { backgroundColor: '#2a2a4e', padding: 14, borderRadius: 8, marginBottom: 8 },
  voteButtonSelected: { backgroundColor: '#cc0000' },
  voteButtonDisabled: { opacity: 0.5 },
  voteButtonText:     { color: '#fff', fontSize: 16, textAlign: 'center' },
  skipButton:         { backgroundColor: '#444', padding: 14, borderRadius: 8, marginTop: 8 },
  skipText:           { color: '#fff', textAlign: 'center', fontSize: 16 },
  resultBox:          { alignItems: 'center', marginTop: 16 },
  resultTitle:        { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  roleReveal:         { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  impostorText:       { color: '#ff4444' },
  crewText:           { color: '#44aaff' },
  voteDetail:         { marginTop: 8 },
  voteDetailText:     { color: '#aaa', fontSize: 13, marginBottom: 4 },
});
