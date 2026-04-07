// client/src/components/KillButton.tsx

import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { socket } from '../services/SocketService';

// ── 오류 1·4 수정: Props를 GameScreen 호출 시그니처에 맞게 수정 ──
interface KillableTarget {
  playerId: string;
  nickname: string;
  distance: number;
  method:   string;
}

interface Props {
  roomId:          string;
  killableTargets: KillableTarget[];
}

export default function KillButton({ roomId, killableTargets }: Props) {
  const [cooldown, setCooldown] = useState<number>(0);

  // 오류 4 수정: new Animated.Value() → useRef로 안정적 참조 확보
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (killableTargets.length > 0) {
      // 킬 가능 대상 있으면 맥박 애니메이션
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [killableTargets, pulseAnim]);

  // 쿨다운 타이머
  useEffect(() => {
    if (cooldown <= 0) return;
    // 오류 2 예방: c는 useState<number>에서 number로 추론
    const timer = setInterval(() => setCooldown((c: number) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleKill = (targetId: string) => {
    socket.emit('kill', { roomId, targetId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        setCooldown(30);
      } else {
        alert(res.error);
      }
    });
  };

  const canKill = killableTargets.length > 0 && cooldown === 0;

  return (
    <>
      {canKill && killableTargets.map(target => (
        <TouchableOpacity
          key={target.playerId}
          style={styles.targetButton}
          onPress={() => handleKill(target.playerId)}
        >
          <Text style={styles.targetText}>
            🔪 {target.nickname} ({target.distance.toFixed(1)}m · {target.method.toUpperCase()})
          </Text>
        </TouchableOpacity>
      ))}

      {/* 오류 4 수정: pulseAnim은 useRef로 안정된 Animated.Value → Animated.View 타입 정상 */}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[styles.killButton, !canKill && styles.disabled]}
          disabled={!canKill}
        >
          <Text style={styles.killText}>
            {cooldown > 0 ? `쿨다운 ${cooldown}초` : canKill ? 'KILL' : '범위 밖'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  killButton: {
    backgroundColor: '#cc0000',
    borderRadius:    50,
    width:           100,
    height:          100,
    justifyContent:  'center',
    alignItems:      'center',
  },
  disabled: {
    backgroundColor: '#555',
  },
  killText: {
    color:      '#fff',
    fontWeight: 'bold',
    fontSize:   16,
  },
  targetButton: {
    backgroundColor: '#8b0000',
    padding:         12,
    borderRadius:    8,
    marginBottom:    8,
  },
  targetText: {
    color:    '#fff',
    fontSize: 14,
  },
});
function alert(message: string | undefined) {
  console.warn(message);
}

