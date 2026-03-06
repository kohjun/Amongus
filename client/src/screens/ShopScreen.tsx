// client/src/screens/ShopScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  Modal, StyleSheet
} from 'react-native';
import { socket } from '../services/SocketService';

interface Item {
  itemId:      string;
  name:        string;
  description: string;
  icon:        string;
  price:       number;
}

interface Props {
  roomId:   string;
  myUserId: string;
  visible:  boolean;
  onClose:  () => void;
}

export default function ShopScreen({ roomId, myUserId, visible, onClose }: Props) {
  const [items, setItems]       = useState<Item[]>([]);
  const [currency, setCurrency] = useState(0);
  const [inventory, setInventory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'shop' | 'inventory'>('shop');

  useEffect(() => {
    if (!visible) return;

    // 상점 목록 요청
    socket.emit('get_shop', { roomId, userId: myUserId }, (res: any) => {
      if (res.ok) {
        setItems(res.items);
        setCurrency(res.currency);
      }
    });

    // 재화/인벤토리 업데이트 수신
    socket.on('currency_updated', ({ total }) => setCurrency(total));
    socket.on('reward_granted',   ({ message }) => alert(message));

    return () => {
      socket.off('currency_updated');
      socket.off('reward_granted');
    };
  }, [visible]);

  const handlePurchase = (itemId: string) => {
    socket.emit('purchase_item', { roomId, userId: myUserId, itemId }, (res: any) => {
      if (res.ok) {
        setCurrency(res.remainingCurrency);
        setInventory(res.inventory);
        alert(`${res.item.icon} ${res.item.name} 구매 완료!`);
      } else {
        alert(res.error);
      }
    });
  };

  const handleUseItem = (itemId: string) => {
    socket.emit('use_item', { roomId, userId: myUserId, itemId }, (res: any) => {
      if (res.ok) {
        setInventory(res.inventory);
      } else {
        alert(res.error);
      }
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>

          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>🛒 상점</Text>
            <Text style={styles.currency}>💰 {currency} 코인</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 탭 */}
          <View style={styles.tabs}>
            {(['shop', 'inventory'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={styles.tabText}>
                  {tab === 'shop' ? '상점' : '인벤토리'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 상점 탭 */}
          {activeTab === 'shop' && (
            <FlatList
              data={items}
              keyExtractor={i => i.itemId}
              renderItem={({ item }) => (
                <View style={styles.itemCard}>
                  <Text style={styles.itemIcon}>{item.icon}</Text>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDesc}>{item.description}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.buyBtn,
                      currency < item.price && styles.buyBtnDisabled,
                    ]}
                    onPress={() => handlePurchase(item.itemId)}
                    disabled={currency < item.price}
                  >
                    <Text style={styles.buyBtnText}>{item.price}💰</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          {/* 인벤토리 탭 */}
          {activeTab === 'inventory' && (
            <FlatList
              data={inventory}
              keyExtractor={i => i.itemId}
              ListEmptyComponent={
                <Text style={styles.emptyText}>보유한 아이템이 없습니다.</Text>
              }
              renderItem={({ item }) => {
                const def = items.find(i => i.itemId === item.itemId);
                return (
                  <View style={styles.itemCard}>
                    <Text style={styles.itemIcon}>{def?.icon}</Text>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>
                        {def?.name}
                        <Text style={styles.quantity}> ×{item.quantity}</Text>
                      </Text>
                      <Text style={styles.itemDesc}>{def?.description}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.useBtn}
                      onPress={() => handleUseItem(item.itemId)}
                    >
                      <Text style={styles.useBtnText}>사용</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container:       { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:           { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  currency:        { fontSize: 16, color: '#ffd700', fontWeight: 'bold' },
  closeBtn:        { color: '#aaa', fontSize: 20, padding: 4 },
  tabs:            { flexDirection: 'row', marginBottom: 12 },
  tab:             { flex: 1, padding: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:       { borderBottomColor: '#4a9eff' },
  tabText:         { color: '#fff', fontWeight: 'bold' },
  itemCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2a2a4e', borderRadius: 8, padding: 12, marginBottom: 8 },
  itemIcon:        { fontSize: 28, marginRight: 12 },
  itemInfo:        { flex: 1 },
  itemName:        { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  itemDesc:        { color: '#aaa', fontSize: 12, marginTop: 2 },
  quantity:        { color: '#ffd700' },
  buyBtn:          { backgroundColor: '#4a9eff', borderRadius: 8, padding: 8, minWidth: 60, alignItems: 'center' },
  buyBtnDisabled:  { backgroundColor: '#444' },
  buyBtnText:      { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  useBtn:          { backgroundColor: '#00aa44', borderRadius: 8, padding: 8, minWidth: 50, alignItems: 'center' },
  useBtnText:      { color: '#fff', fontWeight: 'bold' },
  emptyText:       { color: '#aaa', textAlign: 'center', padding: 20 },
});
