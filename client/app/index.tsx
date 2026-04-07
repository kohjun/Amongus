// app/index.tsx
// 루트 인덱스 — _layout.tsx의 리다이렉트 로직이 처리하므로 빈 화면
import { View } from 'react-native';
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />;
}
