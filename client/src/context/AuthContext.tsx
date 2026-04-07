// src/context/AuthContext.tsx
//
// useAuth를 앱 전체에서 단일 인스턴스로 공유하기 위한 Context.
// app/_layout.tsx의 <AuthProvider>로 앱을 감싸고,
// 각 화면에서는 useAuthContext()로 접근.

import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth';

type AuthState = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext는 AuthProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
