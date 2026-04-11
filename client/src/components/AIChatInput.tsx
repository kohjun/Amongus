// client/src/components/AIChatInput.tsx

import React, { useState } from 'react';
import {
  View, TextInput, TouchableOpacity, Text,
  ActivityIndicator, StyleSheet,
} from 'react-native';

interface AIChatInputProps {
  onSend: (question: string) => void;
  loading: boolean;
  disabled?: boolean;
}

export default function AIChatInput({ onSend, loading, disabled }: AIChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const isDisabled = disabled || loading;

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, isDisabled && styles.inputDisabled]}
        value={text}
        onChangeText={setText}
        placeholder="AI 진행자에게 질문하기..."
        placeholderTextColor="#555"
        editable={!isDisabled}
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />
      <TouchableOpacity
        style={[styles.sendBtn, isDisabled && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={isDisabled}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator size="small" color="#0a0a0a" />
          : <Text style={styles.sendBtnText}>전송</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical:   10,
    gap:             8,
    borderTopWidth:  1,
    borderTopColor:  '#2a2a2a',
  },
  input: {
    flex:            1,
    backgroundColor: '#2a2a2a',
    color:           '#fff',
    borderRadius:    8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:        14,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  sendBtn: {
    backgroundColor: '#00e676',
    borderRadius:    8,
    paddingHorizontal: 16,
    paddingVertical:   10,
    minWidth:        56,
    alignItems:      'center',
    justifyContent:  'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color:      '#0a0a0a',
    fontWeight: '700',
    fontSize:   14,
  },
});
