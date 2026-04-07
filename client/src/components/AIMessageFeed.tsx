// client/src/components/AIMessageFeed.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Animated, StyleSheet
} from 'react-native';
import { socket } from '../services/SocketService';

type MessageType = 'narration' | 'atmosphere' | 'announcement'
                 | 'discussion_guide' | 'vote_result' | 'milestone' | 'game_end';

// ── 오류 3·5 수정: interface 명시 + Record 인덱스 타입 보장 ──
interface AIMessage {
  id:      string;
  type:    MessageType;
  message: string;
  time:    Date;
}

// 오류 5: Record<MessageType, ...> 인덱스를 any로 사용하면 오류 → 타입 보장된 키만 허용
const MESSAGE_STYLE: Record<MessageType, { bg: string; icon: string }> = {
  narration:        { bg: '#1a3a5c', icon: '🎙️' },
  atmosphere:       { bg: '#3a1a1a', icon: '👁️' },
  announcement:     { bg: '#5c1a1a', icon: '🚨' },
  discussion_guide: { bg: '#1a3a2a', icon: '💬' },
  vote_result:      { bg: '#3a2a1a', icon: '⚖️' },
  milestone:        { bg: '#2a1a3a', icon: '📊' },
  game_end:         { bg: '#3a3a1a', icon: '🏆' },
};

const VALID_MESSAGE_TYPES = new Set<MessageType>([
  'narration', 'atmosphere', 'announcement',
  'discussion_guide', 'vote_result', 'milestone', 'game_end',
]);

function toMessageType(raw: string): MessageType {
  return VALID_MESSAGE_TYPES.has(raw as MessageType)
    ? (raw as MessageType)
    : 'narration';
}

// ── 오류 1 수정: props 인터페이스 추가 ──────────────────────
interface AIMessageFeedProps {
  roomId?:  string;
  isGhost?: boolean;
}

export default function AIMessageFeed({ roomId, isGhost }: AIMessageFeedProps) {
  const [messages,     setMessages]     = useState<AIMessage[]>([]);
  const [privateGuide, setPrivateGuide] = useState<string>('');
  const scrollRef = useRef<ScrollView>(null);
  const guideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 오류 5: 소켓 data.type은 string(any)이므로 Record 인덱스 전 반드시 변환
    socket.on('ai_message', (data: { type: string; message: string }) => {
      const msgType = toMessageType(data.type);
      const newMsg: AIMessage = {
        id:      Date.now().toString(),
        type:    msgType,
        message: data.message,
        time:    new Date(),
      };

      // 오류 2 예방: prev 타입은 useState<AIMessage[]>에서 AIMessage[]로 추론됨
      setMessages((prev: AIMessage[]) => [...prev.slice(-19), newMsg]);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });

    socket.on('ai_guide', ({ message }: { message: string }) => {
      setPrivateGuide(message);

      Animated.sequence([
        Animated.timing(guideAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(8000),
        Animated.timing(guideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => setPrivateGuide(''));
    });

    return () => {
      socket.off('ai_message');
      socket.off('ai_guide');
    };
  }, [guideAnim]);

  return (
    <View style={styles.container}>

      {privateGuide ? (
        <Animated.View style={[styles.privateGuide, { opacity: guideAnim }]}>
          <Text style={styles.privateGuideTitle}>
            {isGhost ? '👻 유령 가이드 (나에게만)' : '🤖 AI 가이드 (나에게만)'}
          </Text>
          <Text style={styles.privateGuideText}>{privateGuide}</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.feed}
        showsVerticalScrollIndicator={false}
      >
        {messages.map(msg => {
          // 오류 5: msgType이 MessageType으로 보장되므로 Record 인덱싱 안전
          const style = MESSAGE_STYLE[msg.type];
          return (
            <View
              key={msg.id}
              style={[styles.messageBox, { backgroundColor: style.bg }]}
            >
              <Text style={styles.messageText}>
                {style.icon} {msg.message}
              </Text>
              <Text style={styles.timeText}>
                {msg.time.toLocaleTimeString('ko-KR', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </Text>
            </View>
          );
        })}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  privateGuide: {
    backgroundColor: '#0d2137',
    borderLeftWidth: 3,
    borderLeftColor: '#4a9eff',
    borderRadius:    8,
    padding:         12,
    marginBottom:    8,
  },
  privateGuideTitle: {
    color:        '#4a9eff',
    fontSize:     12,
    fontWeight:   'bold',
    marginBottom: 4,
  },
  privateGuideText: {
    color:      '#cce4ff',
    fontSize:   13,
    lineHeight: 18,
  },
  feed: {
    flex: 1,
  },
  messageBox: {
    borderRadius: 8,
    padding:      10,
    marginBottom: 6,
  },
  messageText: {
    color:      '#fff',
    fontSize:   13,
    lineHeight: 18,
  },
  timeText: {
    color:     '#666',
    fontSize:  10,
    marginTop: 4,
    textAlign: 'right',
  },
});
