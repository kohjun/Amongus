// src/types/navigation.ts
// 내비게이션 공통 타입 정의

export interface MissionTask {
  missionId:   string;
  type:        'qr_scan' | 'mini_game' | 'stay';
  title:       string;
  description: string;
  zone:        string;
  status:      'pending' | 'in_progress' | 'completed' | 'failed';
  isFake:      boolean;
  stayConfig?: { requiredSeconds: number } | null;
}

export interface PlayerInfo {
  userId:   string;
  nickname: string;
  role:     'crew' | 'impostor';
  isAlive:  boolean;
  zone:     string | null;
  tasks:    MissionTask[];
  currency: number;
  items:    unknown[];
}

export interface PlayerResultInfo {
  userId:   string;
  nickname: string;
  isAlive:  boolean;
  zone:     string | null;
  role:     'crew' | 'impostor';
}

export interface GameResult {
  winner:  'crew' | 'impostor';
  reason:  string;
  players: PlayerResultInfo[];
}

// Expo Router 파일 기반 라우팅으로 전환 후 RootStackParamList 불필요
// 라우트 파라미터는 각 화면에서 useLocalSearchParams()로 직접 읽음
