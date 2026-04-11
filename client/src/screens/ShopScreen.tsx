// src/screens/ShopScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socket } from '../services/SocketService';

interface ShopItem {
  itemId:      string;
  name:        string;
  description: string;
  icon:        string;
  price:       number;
}

interface InventorySlot {
  itemId:   string;
  quantity: number;
}

export default function ShopScreen() {
  const router = useRouter();
  const { roomId, myUserId } = useLocalSearchParams<{ roomId: string; myUserId: string }>();

  const [items,     setItems]     = useState<ShopItem[]>([]);
  const [currency,  setCurrency]  = useState(0);
  const [inventory, setInventory] = useState<InventorySlot[]>([]);
  const [activeTab, setActiveTab] = useState<'shop' | 'inventory'>('shop');

  useEffect(() => {
    socket.emit('get_shop', { roomId, userId: myUserId }, (res: { ok: boolean; items: ShopItem[]; currency: number }) => {
      if (res.ok) { setItems(res.items); setCurrency(res.currency); }
    });

    socket.on('currency_updated', ({ total }: { total: number }) => setCurrency(total));
    socket.on('reward_granted',   ({ message }: { message: string }) => Alert.alert('보상', message));

    return () => {
      socket.off('currency_updated');
      socket.off('reward_granted');
    };
  }, [roomId, myUserId]);

  const handlePurchase = (itemId: string) => {
    socket.emit('purchase_item', { roomId, userId: myUserId, itemId }, (res: {
      ok: boolean; remainingCurrency?: number;
      inventory?: InventorySlot[]; item?: ShopItem; error?: string;
    }) => {
      if (res.ok && res.item) {
        setCurrency(res.remainingCurrency ?? currency);
        setInventory(res.inventory ?? inventory);
        Alert.alert('구매 완료', `${res.item.icon} ${res.item.name} 구매 완료!`);
      } else {
        Alert.alert('구매 실패', res.error);
      }
    });
  };

  const handleUseItem = (itemId: string) => {
    socket.emit('use_item', { roomId, userId: myUserId, itemId }, (res: {
      ok: boolean; inventory?: InventorySlot[]; error?: string;
    }) => {
      if (res.ok) setInventory(res.inventory ?? inventory);
      else Alert.alert('사용 실패', res.error);
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 상점</Text>
        <Text style={styles.currency}>💰 {currency} 코인</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(['shop', 'inventory'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={styles.tabText}>{tab === 'shop' ? '상점' : '인벤토리'}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
                style={[styles.buyBtn, currency < item.price && styles.buyBtnDisabled]}
                onPress={() => handlePurchase(item.itemId)}
                disabled={currency < item.price}
              >
                <Text style={styles.buyBtnText}>{item.price}💰</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {activeTab === 'inventory' && (
        <FlatList
          data={inventory}
          keyExtractor={i => i.itemId}
          ListEmptyComponent={<Text style={styles.emptyText}>보유한 아이템이 없습니다.</Text>}
          renderItem={({ item }) => {
            const def = items.find(i => i.itemId === item.itemId);
            return (
              <View style={styles.itemCard}>
                <Text style={styles.itemIcon}>{def?.icon}</Text>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>
                    {def?.name}<Text style={styles.quantity}> ×{item.quantity}</Text>
                  </Text>
                  <Text style={styles.itemDesc}>{def?.description}</Text>
                </View>
                <TouchableOpacity style={styles.useBtn} onPress={() => handleUseItem(item.itemId)}>
                  <Text style={styles.useBtnText}>사용</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#e0f7f4', padding: 16 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:          { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  currency:       { fontSize: 16, color: '#b07800', fontWeight: 'bold' },
  closeBtn:       { color: '#1a1a1a', fontSize: 20, padding: 4 },
  tabs:           { flexDirection: 'row', marginBottom: 12 },
  tab:            { flex: 1, padding: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:      { borderBottomColor: '#1a8a4a' },
  tabText:        { color: '#1a1a1a', fontWeight: 'bold' },
  itemCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2a2a4e', borderRadius: 8, padding: 12, marginBottom: 8 },
  itemIcon:       { fontSize: 28, marginRight: 12 },
  itemInfo:       { flex: 1 },
  itemName:       { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  itemDesc:       { color: '#aaa', fontSize: 12, marginTop: 2 },
  quantity:       { color: '#ffd700' },
  buyBtn:         { backgroundColor: '#4a9eff', borderRadius: 8, padding: 8, minWidth: 60, alignItems: 'center' },
  buyBtnDisabled: { backgroundColor: '#444' },
  buyBtnText:     { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  useBtn:         { backgroundColor: '#00aa44', borderRadius: 8, padding: 8, minWidth: 50, alignItems: 'center' },
  useBtnText:     { color: '#fff', fontWeight: 'bold' },
  emptyText:      { color: '#1a1a1a', textAlign: 'center', padding: 20 },
});
