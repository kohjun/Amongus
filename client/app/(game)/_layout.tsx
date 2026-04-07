// app/(game)/_layout.tsx
import { Stack } from 'expo-router';

export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a0a' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="lobby" />
      <Stack.Screen name="room" />
      <Stack.Screen name="game" />
      <Stack.Screen name="meeting" options={{ animation: 'fade' }} />
      <Stack.Screen
        name="shop"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="result"
        options={{ animation: 'fade', gestureEnabled: false }}
      />
    </Stack>
  );
}
