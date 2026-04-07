// src/store/gameStore.ts
//
// Expo Router에서는 URL 파라미터로 복잡한 객체를 전달하기 어렵기 때문에
// 화면 간 전환 시 playerInfo / meetingData / result 를 모듈 레벨 스토어로 전달.
// 앱이 살아있는 동안만 유효한 임시 데이터 (내비게이션 컨텍스트 대체).

import { PlayerInfo, GameResult } from '../types/navigation';

let _playerInfo:  PlayerInfo | null                 = null;
let _meetingData: Record<string, unknown> | null    = null;
let _result:      GameResult | null                 = null;

export const gameStore = {
  // PlayerInfo — RoomScreen이 game_started 수신 시 저장, GameScreen이 읽음
  setPlayerInfo: (info: PlayerInfo)                       => { _playerInfo  = info; },
  getPlayerInfo: (): PlayerInfo | null                    => _playerInfo,

  // MeetingData — GameScreen이 meeting_started 수신 시 저장, MeetingScreen이 읽음
  setMeetingData: (data: Record<string, unknown>)         => { _meetingData = data; },
  getMeetingData: (): Record<string, unknown> | null      => _meetingData,

  // GameResult — GameScreen이 game_ended 수신 시 저장, ResultScreen이 읽음
  setResult: (result: GameResult)                         => { _result      = result; },
  getResult: (): GameResult | null                        => _result,

  clear: () => {
    _playerInfo  = null;
    _meetingData = null;
    _result      = null;
  },
};
