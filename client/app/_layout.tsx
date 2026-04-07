// app/_layout.tsx
// 루트 레이아웃 — 인증 상태에 따른 리다이렉트 처리
// AuthProvider로 앱 전체를 감싸고, 인증 여부에 따라 (auth) / (game) 그룹으로 분기

import React, { useEffect } from 'react';
import { StatusBar }              from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuthContext } from '../src/context/AuthContext';

// ── 인증 가드 (AuthProvider 내부에서 실행) ───────────────────
function RootLayoutNav() {
  const { user, loading } = useAuthContext();
  const segments           = useSegments();
  const router             = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';

    if (!user && !inAuth) {
      // 비로그인 상태에서 게임 경로 접근 → 로그인으로
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      // 로그인 완료 후 인증 경로 → 로비로
      router.replace('/(game)/lobby');
    }
  }, [user, loading, segments]);

  if (loading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <Slot />
    </GestureHandlerRootView>
  );
}

// ── 루트 레이아웃 ────────────────────────────────────────────
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
