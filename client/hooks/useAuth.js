// app/hooks/useAuth.js
// Firebase 인증 + JWT 발급 + 소켓 연결을 한 번에 처리하는 React Native 훅
//
// 사용법:
//   const { user, socket, signIn, signOut, loading, error } = useAuth();

import { useState, useEffect, useRef, useCallback } from 'react';
import auth from '@react-native-firebase/auth';
import { io }  from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL  = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const JWT_KEY     = '@contNue_jwt';

export function useAuth() {
  const [user,    setUser]    = useState(null);   // { userId, nickname, email, stats }
  const [socket,  setSocket]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const socketRef = useRef(null);

  // ── 소켓 연결 ─────────────────────────────────────────
  const connectSocket = useCallback((token) => {
    // 기존 소켓 정리
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const newSocket = io(SERVER_URL, {
      auth:              { token },          // JWT를 handshake에 포함
      transports:        ['websocket'],      // 폴링 없이 바로 웹소켓
      reconnection:      true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] 연결 완료:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket] 연결 오류:', err.message);
      // 토큰 만료면 재로그인 유도
      if (err.message.includes('AUTH_EXPIRED')) {
        handleSignOut();
      }
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  }, []);

  // ── Firebase ID Token → 게임 JWT 교환 ────────────────
  const exchangeToken = useCallback(async (firebaseUser) => {
    const idToken = await firebaseUser.getIdToken();

    const res = await fetch(`${SERVER_URL}/auth/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || '서버 인증 실패');
    }

    const { token, user: userInfo } = await res.json();

    // JWT 로컬 저장 (앱 재시작 시 재로그인 불필요)
    await AsyncStorage.setItem(JWT_KEY, token);

    return { token, userInfo };
  }, []);

  // ── 앱 시작 시 저장된 JWT로 자동 로그인 ──────────────
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      setLoading(true);
      setError(null);

      try {
        if (firebaseUser) {
          const { token, userInfo } = await exchangeToken(firebaseUser);
          setUser(userInfo);
          connectSocket(token);
        } else {
          // 로그아웃 상태
          setUser(null);
          if (socketRef.current) socketRef.current.disconnect();
          setSocket(null);
          await AsyncStorage.removeItem(JWT_KEY);
        }
      } catch (err) {
        console.error('[useAuth]', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [exchangeToken, connectSocket]);

  // ── 이메일/비밀번호 로그인 ────────────────────────────
  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await auth().signInWithEmailAndPassword(email, password);
      // onAuthStateChanged가 자동으로 나머지 처리
    } catch (err) {
      setError(_parseFirebaseError(err.code));
      setLoading(false);
    }
  }, []);

  // ── 회원가입 ──────────────────────────────────────────
  const signUp = useCallback(async (email, password, displayName) => {
    setLoading(true);
    setError(null);
    try {
      const { user: fbUser } = await auth().createUserWithEmailAndPassword(email, password);
      await fbUser.updateProfile({ displayName });
      // onAuthStateChanged가 자동으로 나머지 처리
    } catch (err) {
      setError(_parseFirebaseError(err.code));
      setLoading(false);
    }
  }, []);

  // ── 로그아웃 ──────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    if (socketRef.current) socketRef.current.disconnect();
    setSocket(null);
    setUser(null);
    await AsyncStorage.removeItem(JWT_KEY);
    await auth().signOut();
  }, []);

  // ── 컴포넌트 언마운트 시 소켓 정리 ───────────────────
  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  return {
    user,
    socket,
    loading,
    error,
    signIn,
    signUp,
    signOut: handleSignOut,
    isAuthenticated: !!user,
  };
}

// ── Firebase 에러 코드 → 한국어 메시지 ──────────────────
function _parseFirebaseError(code) {
  const messages = {
    'auth/user-not-found':       '존재하지 않는 계정입니다.',
    'auth/wrong-password':       '비밀번호가 올바르지 않습니다.',
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/weak-password':        '비밀번호는 6자 이상이어야 합니다.',
    'auth/invalid-email':        '올바르지 않은 이메일 형식입니다.',
    'auth/too-many-requests':    '잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
  };
  return messages[code] || '알 수 없는 오류가 발생했습니다.';
}