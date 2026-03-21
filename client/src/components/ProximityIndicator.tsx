// src/components/ProximityIndicator.tsx
//
// 주변 플레이어의 실시간 거리를 표시합니다.
// - killable_targets 수신 → 임포스터에게 킬 가능 대상 강조
// - UWB(정확) / BLE(추정) 측정 방식 구분 표시
// - 거리에 따른 위험도 색상 (가까울수록 빨간색)

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';

interface NearbyPlayer {
  playerId:  string;
  nickname:  string;
  distance:  number;
  method:    'uwb' | 'ble';
  isKillable?: boolean;
}

interface ProximityIndicatorProps {
  nearbyPlayers:   NearbyPlayer[];
  isImpostor:      boolean;
}

// 거리에 따른 색상
function getDistanceColor(distance: number, isKillable: boolean): string {
  if (isKillable)    return '#ff5252';
  if (distance < 2)  return '#ffab40';
  if (distance < 5)  return '#ffeb3b';
  return '#444';
}

// 거리에 따른 신호 바 개수 (1~4)
function getSignalBars(distance: number): number {
  if (distance < 1.5) return 4;
  if (distance < 3)   return 3;
  if (distance < 5)   return 2;
  return 1;
}

function SignalBars({ count, color }: { count: number; color: string }) {
  return (
    <View style={signalStyles.row}>
      {[1, 2, 3, 4].map(i => (
        <View
          key={i}
          style={[
            signalStyles.bar,
            { height: i * 4 + 4 },
            i <= count
              ? { backgroundColor: color }
              : { backgroundColor: '#222' },
          ]}
        />
      ))}
    </View>
  );
}

const signalStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap:           2,
  },
  bar: {
    width:        4,
    borderRadius: 1,
  },
});

export default function ProximityIndicator({
  nearbyPlayers,
  isImpostor,
}: ProximityIndicatorProps) {

  // 가까운 순 정렬
  const sorted = [...nearbyPlayers].sort((a, b) => a.distance - b.distance);

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>주변에 아무도 없습니다</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>주변 플레이어</Text>
        <Text style={styles.headerCount}>{sorted.length}명</Text>
      </View>

      <View style={styles.list}>
        {sorted.map(player => {
          const color = getDistanceColor(player.distance, !!player.isKillable);
          const bars  = getSignalBars(player.distance);

          return (
            <View
              key={player.playerId}
              style={[
                styles.playerRow,
                player.isKillable && styles.playerRowKillable,
              ]}
            >
              {/* 아바타 */}
              <View style={[styles.avatar, { borderColor: color }]}>
                <Text style={[styles.avatarText, { color }]}>
                  {player.nickname[0]?.toUpperCase()}
                </Text>
              </View>

              {/* 이름 + 측정 방식 */}
              <View style={styles.nameWrap}>
                <Text style={styles.playerName} numberOfLines={1}>
                  {player.nickname}
                </Text>
                <View style={styles.methodPill}>
                  <Text style={styles.methodText}>
                    {player.method.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* 신호 세기 + 거리 */}
              <View style={styles.rightWrap}>
                <SignalBars count={bars} color={color} />
                <Text style={[styles.distanceText, { color }]}>
                  {player.distance.toFixed(1)}m
                </Text>
              </View>

              {/* 킬 가능 표시 (임포스터 전용) */}
              {isImpostor && player.isKillable && (
                <View style={styles.killableBadge}>
                  <Text style={styles.killableBadgeText}>KILL</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius:    14,
    padding:         12,
    borderWidth:     1,
    borderColor:     '#1e1e1e',
  },

  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  headerTitle: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#666',
  },
  headerCount: {
    fontSize:   12,
    color:      '#444',
  },

  list: {
    gap: 8,
  },

  playerRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: '#181818',
    borderRadius:    10,
    padding:         8,
    borderWidth:     1,
    borderColor:     '#222',
  },
  playerRowKillable: {
    borderColor:     '#ff5252',
    backgroundColor: '#1a0a0a',
  },

  avatar: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: '#0a0a0a',
    borderWidth:     1.5,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarText: {
    fontSize:   13,
    fontWeight: '700',
  },

  nameWrap: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  playerName: {
    fontSize:   13,
    color:      '#ccc',
    fontWeight: '500',
    flexShrink: 1,
  },
  methodPill: {
    backgroundColor:   '#1a1a1a',
    borderRadius:      4,
    paddingHorizontal: 5,
    paddingVertical:   2,
  },
  methodText: {
    fontSize:      9,
    color:         '#555',
    letterSpacing: 0.5,
  },

  rightWrap: {
    alignItems: 'flex-end',
    gap:        4,
  },
  distanceText: {
    fontSize:   12,
    fontWeight: '600',
  },

  killableBadge: {
    backgroundColor:   '#ff5252',
    borderRadius:      6,
    paddingHorizontal: 7,
    paddingVertical:   3,
  },
  killableBadgeText: {
    fontSize:      10,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.5,
  },

  emptyContainer: {
    paddingVertical: 16,
    alignItems:      'center',
  },
  emptyText: {
    fontSize: 12,
    color:    '#2a2a2a',
  },
});