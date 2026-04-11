// client/src/components/ProximityMapModal.tsx
// 플레이스홀더 — 추후 네이버지도 SDK로 교체 예정

import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';

interface ProximityMapModalProps {
  visible: boolean;
  onClose: () => void;
  nearbyPlayers: {
    playerId: string;
    nickname: string;
    distance: number;
    method: 'uwb' | 'ble';
  }[];
  myNickname: string;
}

export default function ProximityMapModal({
  visible, onClose, nearbyPlayers,
}: ProximityMapModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>
        {/* 상단바 */}
        <View style={styles.topBar}>
          <Text style={styles.title}>주변 플레이어</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 지도 플레이스홀더 */}
        <View style={styles.mapArea}>
          <Text style={styles.placeholderText}>{'🗺 지도 준비 중\n네이버지도 SDK 연동 예정'}</Text>
        </View>

        {/* 하단 플레이어 수 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>근처 플레이어: {nearbyPlayers.length}명</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#0a0a0a',
  },
  topBar: {
    height:          56,
    backgroundColor: '#111',
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    flex:       1,
    color:      '#fff',
    fontSize:   16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color:    '#aaa',
    fontSize: 18,
  },
  mapArea: {
    flex:            1,
    backgroundColor: '#1a1a1a',
    alignItems:      'center',
    justifyContent:  'center',
  },
  placeholderText: {
    color:     '#444',
    fontSize:  16,
    textAlign: 'center',
    lineHeight: 26,
  },
  footer: {
    backgroundColor: '#111',
    padding:         16,
  },
  footerText: {
    color:    '#888',
    fontSize: 14,
  },
});
