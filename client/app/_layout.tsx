// app/_layout.tsx (수정본)

import React from 'react';
import { StatusBar } from 'react-native';
import { Slot, useSegments, Redirect } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuthContext } from '../src/context/AuthContext';

// ── 인증 가드 (AuthProvider 내부에서 실행) ───────────────────
function RootLayoutNav() {
  const { user, loading } = useAuthContext();
  const segments = useSegments();

  if (loading) return null;

  const inAuthGroup = segments[0] === '(auth)';

  // 1. 로그인 상태가 아닌데, auth 그룹이 아닌 곳(앱 첫 진입 등)에 있다면 로그인으로 보냄
  if (!user && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }

  // 2. 로그인 상태인데, game 그룹이 아닌 곳(앱 첫 진입 등)에 있다면 로비로 보냄
  if (user && segments[0] !== '(game)') {
    return <Redirect href="/(game)/lobby" />;
  }

  // 위 두 조건에 걸리지 않는다면 정상적인 라우팅 상태이므로 화면을 그림
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