// client/App.tsx
//
// React Navigation 스택
// Login → Lobby → Room → Game → Meeting / Shop → Result
//
// 의존성:
//   @react-navigation/native
//   @react-navigation/native-stack
//   react-native-safe-area-context
//   react-native-screens

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import LobbyScreen   from './src/screens/LobbyScreen';
import RoomScreen    from './src/screens/RoomScreen';
import GameScreen    from './src/screens/GameScreen';
import MeetingScreen from './src/screens/MeetingScreen';
import ShopScreen    from './src/screens/ShopScreen';
import ResultScreen  from './src/screens/ResultScreen';

import { useAuth } from './src/hooks/useAuth';

const Stack = createNativeStackNavigator();

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return null; // 스플래시 스크린으로 대체 가능

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <Stack.Navigator
        screenOptions={{
          headerShown:         false,
          contentStyle:        { backgroundColor: '#0a0a0a' },
          animation:           'slide_from_right',
        }}
      >
        {!user ? (
          // ── 인증 전 ──────────────────────────────────
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // ── 인증 후 ──────────────────────────────────
          <>
            <Stack.Screen name="Lobby"   component={LobbyScreen} />
            <Stack.Screen name="Room"    component={RoomScreen} />
            <Stack.Screen name="Game"    component={GameScreen} />
            <Stack.Screen
              name="Meeting"
              component={MeetingScreen}
              options={{ animation: 'fade' }}
            />
            <Stack.Screen
              name="Shop"
              component={ShopScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Result"
              component={ResultScreen}
              options={{ animation: 'fade', gestureEnabled: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}