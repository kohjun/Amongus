// src/screens/ResultScreen.tsx
// 게임 종료 결과 화면

import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Easing,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { gameStore } from '../store/gameStore';

const REASON_TEXT: Record<string, string> = {
  impostor_ejected: '임포스터 전원 추방',
  all_tasks_done:   '미션 전부 완료',
  crew_outnumbered: '크루원 수 역전',
};

export default function ResultScreen() {
  const router = useRouter();
  useLocalSearchParams<{ roomId: string }>();

  const result = gameStore.getResult();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!result) { router.replace('/(game)/lobby'); return; }
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 600,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1, tension: 50, friction: 8, useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  if (!result) return null;

  const isCrewWin   = result.winner === 'crew';
  const impostors   = result.players.filter(p => p.role === 'impostor');

  return (
    <View style={styles.root}>
      <View style={[styles.bgGlow, isCrewWin ? styles.bgGlowCrew : styles.bgGlowImpostor]} />

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={[styles.winnerBlock, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.winnerEmoji}>{isCrewWin ? '🏆' : '😈'}</Text>
          <Text style={[styles.winnerTitle, isCrewWin ? styles.winnerTitleCrew : styles.winnerTitleImpostor]}>
            {isCrewWin ? '크루원 승리' : '임포스터 승리'}
          </Text>
          <Text style={styles.winnerReason}>{REASON_TEXT[result.reason] ?? result.reason}</Text>
        </Animated.View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>임포스터</Text>
          <View style={styles.impostorList}>
            {impostors.map(p => (
              <View key={p.userId} style={styles.impostorCard}>
                <View style={styles.impostorAvatar}>
                  <Text style={styles.impostorAvatarText}>{p.nickname[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.impostorName}>{p.nickname}</Text>
                {!p.isAlive && <Text style={styles.impostorStatus}>추방됨</Text>}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>플레이어 결과</Text>
          <View style={styles.playerList}>
            {result.players.map(player => (
              <View key={player.userId} style={styles.playerRow}>
                <View style={[styles.playerAvatar, player.role === 'impostor' ? styles.playerAvatarImpostor : styles.playerAvatarCrew]}>
                  <Text style={styles.playerAvatarText}>{player.nickname[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.nickname}</Text>
                  <Text style={styles.playerRole}>{player.role === 'impostor' ? '임포스터' : '크루원'}</Text>
                </View>
                <View style={styles.playerStatus}>
                  {player.isAlive
                    ? <View style={styles.aliveBadge}><Text style={styles.aliveBadgeText}>생존</Text></View>
                    : <View style={styles.deadBadge}><Text style={styles.deadBadgeText}>사망</Text></View>
                  }
                </View>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.lobbyBtn}
          onPress={() => { gameStore.clear(); router.replace('/(game)/lobby'); }}
          activeOpacity={0.85}
        >
          <Text style={styles.lobbyBtnText}>로비로 돌아가기</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:                 { flex: 1, backgroundColor: '#0a0a0a' },
  bgGlow:               { position: 'absolute', width: 400, height: 400, borderRadius: 200, top: -100, alignSelf: 'center', opacity: 0.08 },
  bgGlowCrew:           { backgroundColor: '#00e676' },
  bgGlowImpostor:       { backgroundColor: '#ff5252' },
  content:              { padding: 20, paddingTop: 80, gap: 24 },
  winnerBlock:          { alignItems: 'center', paddingVertical: 32, gap: 10 },
  winnerEmoji:          { fontSize: 72 },
  winnerTitle:          { fontSize: 36, fontWeight: '700', letterSpacing: 1 },
  winnerTitleCrew:      { color: '#00e676' },
  winnerTitleImpostor:  { color: '#ff5252' },
  winnerReason:         { fontSize: 14, color: '#444', marginTop: 4 },
  section:              { gap: 12 },
  sectionTitle:         { fontSize: 12, fontWeight: '600', color: '#444', letterSpacing: 1, textTransform: 'uppercase' },
  impostorList:         { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  impostorCard:         { alignItems: 'center', backgroundColor: '#1a0a0a', borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: '#3a1a1a', minWidth: 80 },
  impostorAvatar:       { width: 48, height: 48, borderRadius: 24, backgroundColor: '#3a1a1a', alignItems: 'center', justifyContent: 'center' },
  impostorAvatarText:   { fontSize: 20, fontWeight: '700', color: '#ff5252' },
  impostorName:         { fontSize: 13, fontWeight: '600', color: '#f0f0f0' },
  impostorStatus:       { fontSize: 11, color: '#666' },
  playerList:           { gap: 8 },
  playerRow:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 12, gap: 12, borderWidth: 1, borderColor: '#1e1e1e' },
  playerAvatar:         { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  playerAvatarCrew:     { backgroundColor: '#0a1a10' },
  playerAvatarImpostor: { backgroundColor: '#1a0a0a' },
  playerAvatarText:     { fontSize: 14, fontWeight: '700', color: '#f0f0f0' },
  playerInfo:           { flex: 1, gap: 3 },
  playerName:           { fontSize: 14, fontWeight: '500', color: '#f0f0f0' },
  playerRole:           { fontSize: 11, color: '#444' },
  playerStatus:         { alignItems: 'flex-end' },
  aliveBadge:           { backgroundColor: '#0a1a10', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  aliveBadgeText:       { fontSize: 11, color: '#00e676', fontWeight: '600' },
  deadBadge:            { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  deadBadgeText:        { fontSize: 11, color: '#444' },
  lobbyBtn:             { backgroundColor: '#111', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e1e', marginTop: 8 },
  lobbyBtnText:         { fontSize: 15, fontWeight: '600', color: '#888' },
});
