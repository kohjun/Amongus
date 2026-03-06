// client/src/components/AIMessageFeed.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Animated, StyleSheet
} from 'react-native';
import { socket } from '../services/SocketService';

type MessageType = 'narration' | 'atmosphere' | 'announcement'
                 | 'discussion_guide' | 'vote_result' | 'milestone' | 'game_end';

interface AIMessage {
  id:      string;
  type:    MessageType;
  message: string;
  time:    Date;
}

// 메시지 타입별 스타일
const MESSAGE_STYLE: Record<MessageType, { bg: string; icon: string }> = {
  narration:        { bg: '#1a3a5c', icon: '🎙️' },
  atmosphere:       { bg: '#3a1a1a', icon: '👁️' },
  announcement:     { bg: '#5c1a1a', icon: '🚨' },
  discussion_guide: { bg: '#1a3a2a', icon: '💬' },
  vote_result:      { bg: '#3a2a1a', icon: '⚖️' },
  milestone:        { bg: '#2a1a3a', icon: '📊' },
  game_end:         { bg: '#3a3a1a', icon: '🏆' },
};

export default function AIMessageFeed() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [privateGuide, setPrivateGuide] = useState<string>('');
  const scrollRef  = useRef<ScrollView>(null);
  const guideAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 공개 AI 메시지
    socket.on('ai_message', (data: { type: MessageType; message: string }) => {
      const newMsg: AIMessage = {
        id:      Date.now().toString(),
        type:    data.type,
        message: data.message,
        time:    new Date(),
      };

      setMessages(prev => [...prev.slice(-19), newMsg]);  // 최근 20개만 유지

      // 자동 스크롤
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });

    // 개인 가이드 (본인에게만 오는 메시지)
    socket.on('ai_guide', ({ message }: { message: string }) => {
      setPrivateGuide(message);

      // 가이드 등장 애니메이션
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
  }, []);

  return (
    <View style={styles.container}>

      {/* 개인 AI 가이드 (상단 고정) */}
      {privateGuide ? (
        <Animated.View style={[styles.privateGuide, { opacity: guideAnim }]}>
          <Text style={styles.privateGuideTitle}>🤖 AI 가이드 (나에게만)</Text>
          <Text style={styles.privateGuideText}>{privateGuide}</Text>
        </Animated.View>
      ) : null}

      {/* 공개 AI 메시지 피드 */}
      <ScrollView
        ref={scrollRef}
        style={styles.feed}
        showsVerticalScrollIndicator={false}
      >
        {messages.map(msg => {
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
                  hour: '2-digit', minute: '2-digit', second: '2-digit'
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
    borderRadius:  8,
    padding:       10,
    marginBottom:  6,
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
