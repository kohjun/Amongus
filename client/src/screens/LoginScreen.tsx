// src/screens/LoginScreen.tsx
//
// Firebase Auth (이메일 + Google) → /auth/verify → JWT 저장 → 소켓 연결
// useAuth 훅이 전체 플로우를 담당합니다.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useAuthContext } from '../context/AuthContext';

const AnimatedView = Animated.createAnimatedComponent(View);

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle, loading, error } = useAuthContext();

  const [mode,     setMode]     = useState<Mode>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // 탭 전환 애니메이션
  const [underline] = useState(new Animated.Value(0));

  function switchMode(next: Mode) {
    setMode(next);
    Animated.timing(underline, {
      toValue:         next === 'login' ? 0 : 1,
      duration:        200,
      easing:          Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  async function handleSubmit() {
    if (!email || !password) return;
    if (mode === 'login') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
    }
  }

  const underlineLeft = underline.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '50%'],
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* 배경 장식 */}
      <View style={styles.bgDot1} />
      <View style={styles.bgDot2} />

      <View style={styles.card}>

        {/* 로고 영역 */}
        <View style={styles.logoArea}>
          <View style={styles.logoMark}>
            <Text style={styles.logoSymbol}>▶</Text>
          </View>
          <Text style={styles.logoText}>ConTnue</Text>
          <Text style={styles.tagline}>AI Game Director</Text>
        </View>

        {/* 탭 */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={styles.tab} onPress={() => switchMode('login')}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
              로그인
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => switchMode('signup')}>
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
              회원가입
            </Text>
          </TouchableOpacity>
          <AnimatedView style={[styles.tabUnderline, { left: underlineLeft }]} />
        </View>

        {/* 에러 메시지 */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* 입력 폼 */}
        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>이메일</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              placeholderTextColor="#555"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>비밀번호</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'login' ? '입장하기' : '계정 만들기'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 구분선 */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google 로그인 */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={signInWithGoogle}
          activeOpacity={0.85}
        >
          <Text style={styles.googleBtnText}>Google로 계속하기</Text>
        </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#0a0a0a',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         24,
  },

  // 배경 장식 원
  bgDot1: {
    position:        'absolute',
    width:           320,
    height:          320,
    borderRadius:    160,
    backgroundColor: '#1a3a2a',
    top:             -80,
    right:           -100,
    opacity:         0.6,
  },
  bgDot2: {
    position:        'absolute',
    width:           200,
    height:          200,
    borderRadius:    100,
    backgroundColor: '#0f2a1a',
    bottom:          40,
    left:            -60,
    opacity:         0.5,
  },

  // 카드
  card: {
    width:           '100%',
    maxWidth:        400,
    backgroundColor: '#111',
    borderRadius:    20,
    padding:         28,
    borderWidth:     1,
    borderColor:     '#1e1e1e',
  },

  // 로고
  logoArea: {
    alignItems:   'center',
    marginBottom: 28,
  },
  logoMark: {
    width:           48,
    height:          48,
    borderRadius:    14,
    backgroundColor: '#00e676',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    10,
  },
  logoSymbol: {
    fontSize:  20,
    color:     '#0a0a0a',
    fontWeight: '700',
  },
  logoText: {
    fontSize:   26,
    fontWeight: '700',
    color:      '#f0f0f0',
    letterSpacing: 1,
  },
  tagline: {
    fontSize:  12,
    color:     '#444',
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // 탭
  tabRow: {
    flexDirection:   'row',
    marginBottom:    24,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
    position:        'relative',
  },
  tab: {
    flex:           1,
    paddingBottom:  12,
    alignItems:     'center',
  },
  tabText: {
    fontSize:   14,
    color:      '#444',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#f0f0f0',
  },
  tabUnderline: {
    position:        'absolute',
    bottom:          -1,
    width:           '50%',
    height:          2,
    backgroundColor: '#00e676',
    borderRadius:    1,
  },

  // 에러
  errorBox: {
    backgroundColor: '#1a0a0a',
    borderWidth:     1,
    borderColor:     '#3a1a1a',
    borderRadius:    8,
    padding:         10,
    marginBottom:    16,
  },
  errorText: {
    color:    '#ff5252',
    fontSize: 13,
  },

  // 폼
  form: {
    gap: 16,
  },
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    color:    '#555',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#181818',
    borderWidth:     1,
    borderColor:     '#2a2a2a',
    borderRadius:    10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    color:           '#f0f0f0',
    fontSize:        15,
  },
  submitBtn: {
    backgroundColor: '#00e676',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       4,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color:      '#0a0a0a',
    fontSize:   15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // 구분선
  dividerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginVertical: 20,
    gap:            10,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: '#1e1e1e',
  },
  dividerText: {
    color:    '#333',
    fontSize: 12,
  },

  // Google 버튼
  googleBtn: {
    borderWidth:     1,
    borderColor:     '#2a2a2a',
    borderRadius:    10,
    paddingVertical: 13,
    alignItems:      'center',
  },
  googleBtnText: {
    color:    '#aaa',
    fontSize: 14,
    fontWeight: '500',
  },
});