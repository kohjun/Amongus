// src/services/firebaseConfig.ts
//
// Firebase JS SDK v9+ (모듈형) 초기화
// - 웹/React Native 공통 동작
// - 웹: browserLocalPersistence (localStorage 기반 세션 유지)
// - 네이티브: inMemoryPersistence (앱 재시작 시 Firebase onAuthStateChanged로 재인증)
//
// 값은 client/.env의 EXPO_PUBLIC_ 변수에서 읽음 (Expo Metro가 빌드 시 치환)

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey:            process.env['EXPO_PUBLIC_FIREBASE_API_KEY']            as string,
  authDomain:        process.env['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN']        as string,
  projectId:         process.env['EXPO_PUBLIC_FIREBASE_PROJECT_ID']         as string,
  storageBucket:     process.env['EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET']     as string,
  messagingSenderId: process.env['EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'] as string,
  appId:             process.env['EXPO_PUBLIC_FIREBASE_APP_ID']             as string,
};

// 앱 중복 초기화 방지 (Expo Fast Refresh 환경 대비)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth 초기화 — 이미 초기화된 경우 기존 인스턴스 반환
let firebaseAuth: ReturnType<typeof getAuth>;
try {
  firebaseAuth = initializeAuth(app, {
    persistence: Platform.OS === 'web' ? browserLocalPersistence : inMemoryPersistence,
  });
} catch {
  // initializeAuth는 동일 앱에서 두 번 호출하면 throw
  firebaseAuth = getAuth(app);
}

export { firebaseAuth };
