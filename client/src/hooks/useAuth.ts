// src/hooks/useAuth.ts
// Firebase JS SDK v9+ (모듈형) + 게임 JWT 발급 + 소켓 연결을 처리하는 훅
//
// AsyncStorage 의존성 제거 — 웹 호환 경량 스토리지로 대체:
//   - 웹: localStorage
//   - 네이티브: 모듈 레벨 인메모리 (Firebase Auth 세션은 인메모리 퍼시스턴스로 유지)

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  User,
} from 'firebase/auth';
import { io, Socket } from 'socket.io-client';
import { firebaseAuth } from '../services/firebaseConfig';

const SERVER_URL = (process.env['EXPO_PUBLIC_SERVER_URL'] as string | undefined) ?? 'http://localhost:3000';
const JWT_KEY    = '@contNue_jwt';

// ── 경량 JWT 스토리지 (웹: localStorage / 네이티브: 인메모리) ──────
let _memJwt = '';

const jwtStore = {
  set: (v: string): void => {
    _memJwt = v;
    try { localStorage.setItem(JWT_KEY, v); } catch { /* 네이티브에서는 무시 */ }
  },
  remove: (): void => {
    _memJwt = '';
    try { localStorage.removeItem(JWT_KEY); } catch { /* 네이티브에서는 무시 */ }
  },
};

// ── 타입 ──────────────────────────────────────────────────────────
interface UserInfo {
  userId:   string;
  nickname: string;
  email:    string;
  stats?:   Record<string, number>;
}

type AppSocket = ReturnType<typeof io>;

// ── 훅 ───────────────────────────────────────────────────────────
export function useAuth() {
  const [user,    setUser]    = useState<UserInfo | null>(null);
  const [socket,  setSocket]  = useState<AppSocket | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  const socketRef = useRef<AppSocket | null>(null);

  // ── 소켓 연결 ────────────────────────────────────────────────
  const connectSocket = useCallback((token: string): AppSocket => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const newSocket = io(SERVER_URL, {
      auth:                 { token },
      transports:           ['websocket'],
      reconnection:         true,
      reconnectionDelay:    1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] 연결 완료:', newSocket.id);
    });

    newSocket.on('connect_error', (err: Error) => {
      console.error('[Socket] 연결 오류:', err.message);
      if (err.message.includes('AUTH_EXPIRED')) {
        handleSignOut();
      }
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firebase ID Token → 게임 JWT 교환 ─────────────────────
  const exchangeToken = useCallback(async (firebaseUser: User) => {
    const idToken = await firebaseUser.getIdToken();

    const res = await fetch(`${SERVER_URL}/auth/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? '서버 인증 실패');
    }

    const { token, user: userInfo } = await res.json() as { token: string; user: UserInfo };

    jwtStore.set(token);
    return { token, userInfo };
  }, []);

  // ── Firebase Auth 상태 감지 (앱 시작 + 세션 복원) ──────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setLoading(true);
      setError(null);

      try {
        if (firebaseUser) {
          const { token, userInfo } = await exchangeToken(firebaseUser);
          setUser(userInfo);
          connectSocket(token);
        } else {
          setUser(null);
          if (socketRef.current) socketRef.current.disconnect();
          setSocket(null);
          jwtStore.remove();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        console.error('[useAuth]', msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [exchangeToken, connectSocket]);

  // ── 이메일/비밀번호 로그인 ───────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      // onAuthStateChanged가 JWT 교환 + 소켓 연결까지 처리
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(_parseFirebaseError(code));
      setLoading(false);
    }
  }, []);

  // ── 회원가입 ─────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(fbUser, { displayName });
      // onAuthStateChanged가 이후 처리
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(_parseFirebaseError(code));
      setLoading(false);
    }
  }, []);

  // ── Google 로그인 (stub — 필요 시 GoogleAuthProvider로 확장) ──
  const signInWithGoogle = useCallback(async () => {
    setError('Google 로그인은 현재 지원되지 않습니다.');
  }, []);

  // ── 로그아웃 ─────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    if (socketRef.current) socketRef.current.disconnect();
    setSocket(null);
    setUser(null);
    jwtStore.remove();
    await signOut(firebaseAuth);
  }, []);

  // ── 언마운트 시 소켓 정리 ────────────────────────────────
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
    signInWithGoogle,
    signOut:         handleSignOut,
    isAuthenticated: !!user,
  };
}

// ── Firebase 에러 코드 → 한국어 메시지 ──────────────────────────
function _parseFirebaseError(code: string): string {
  const messages: Record<string, string> = {
    'auth/user-not-found':         '존재하지 않는 계정입니다.',
    'auth/wrong-password':         '비밀번호가 올바르지 않습니다.',
    'auth/invalid-credential':     '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/email-already-in-use':   '이미 사용 중인 이메일입니다.',
    'auth/weak-password':          '비밀번호는 6자 이상이어야 합니다.',
    'auth/invalid-email':          '올바르지 않은 이메일 형식입니다.',
    'auth/too-many-requests':      '잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
  };
  return messages[code] ?? '알 수 없는 오류가 발생했습니다.';
}
