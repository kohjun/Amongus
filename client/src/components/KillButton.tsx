// client/src/components/KillButton.tsx

import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { socket } from '../services/SocketService';

interface Props {
  roomId:    string;
  myUserId:  string;
  aliveCrew: { userId: string; nickname: string }[];
}

export default function KillButton({ roomId, myUserId, aliveCrew }: Props) {
  const [killableTargets, setKillableTargets] = useState<any[]>([]);
  const [cooldown, setCooldown]               = useState(0);
  const pulse = new Animated.Value(1);

  useEffect(() => {
    // 서버에서 실시간으로 킬 가능 대상 업데이트
    socket.on('killable_targets', ({ targets }) => {
      setKillableTargets(targets);

      // 킬 가능 대상 있으면 버튼 맥박 애니메이션
      if (targets.length > 0) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.1, duration: 400, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1.0, duration: 400, useNativeDriver: true }),
          ])
        ).start();
      }
    });

    return () => { socket.off('killable_targets'); };
  }, []);

  // 쿨다운 타이머
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleKill = (targetId: string) => {
    socket.emit('kill', { roomId, impostorId: myUserId, targetId }, (res: any) => {
      if (res.ok) {
        setCooldown(30);  // 30초 쿨다운
        setKillableTargets([]);
      } else {
        alert(res.error);
      }
    });
  };

  const canKill = killableTargets.length > 0 && cooldown === 0;

  return (
    <>
      {/* 킬 가능 대상 목록 */}
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

      {/* 메인 킬 버튼 */}
      <Animated.View style={{ transform: [{ scale: canKill ? pulse : 1 }] }}>
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
