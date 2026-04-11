// src/components/MissionList.tsx
//
// 플레이어 미션 목록 표시
// - STAY 미션: 실시간 진행 바 (1초 폴링)
// - 미션 완료 시 체크 + 취소선
// - isFake 미션은 크루원용 UI로 위장 (임포스터 용)

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { MissionTask } from '../types/navigation';

interface MissionListProps {
  tasks:       MissionTask[];
  currentZone: string | null;
}

// ── 개별 미션 아이템 ─────────────────────────────────────
function MissionItem({ task, isCurrentZone }: { task: MissionTask; isCurrentZone: boolean }) {
  const [stayElapsed, setStayElapsed] = useState(0);
  const fadeAnim = useRef(new Animated.Value(task.status === 'completed' ? 1 : 0)).current;

  // STAY 미션 진행 타이머
  useEffect(() => {
    if (task.type !== 'stay' || task.status !== 'in_progress') return;
    const interval = setInterval(() => {
      setStayElapsed(prev => {
        const next = prev + 1;
        const req  = task.stayConfig?.requiredSeconds ?? 60;
        if (next >= req) clearInterval(interval);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [task.type, task.status, task.stayConfig]);

  // 완료 시 fade 애니메이션
  useEffect(() => {
    if (task.status === 'completed') {
      Animated.timing(fadeAnim, {
        toValue:         1,
        duration:        400,
        easing:          Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [task.status, fadeAnim]);

  const isCompleted   = task.status === 'completed';
  const isFailed      = task.status === 'failed';
  const isInProgress  = task.status === 'in_progress';
  const isPending     = task.status === 'pending';

  const stayReq       = task.stayConfig?.requiredSeconds ?? 60;
  const stayPercent   = Math.min(100, (stayElapsed / stayReq) * 100);

  const typeIcon = {
    qr_scan:   '📷',
    mini_game: '🎮',
    stay:      '⏱',
  }[task.type] ?? '📋';

  const zoneLabel = task.zone.replace(/_/g, ' ');

  return (
    <View style={[
      styles.item,
      isCurrentZone && !isCompleted && styles.itemActive,
      isCompleted && styles.itemDone,
      isFailed    && styles.itemFailed,
    ]}>
      {/* 왼쪽: 아이콘 + 텍스트 */}
      <View style={styles.itemLeft}>
        <Text style={styles.itemIcon}>{typeIcon}</Text>
        <View style={styles.itemTexts}>
          <Text style={[styles.itemTitle, isCompleted && styles.itemTitleDone]}>
            {task.title}
          </Text>
          <Text style={styles.itemZone}>{zoneLabel}</Text>

          {/* STAY 미션 진행바 */}
          {/* 오류 4 수정: stayPercent는 JS number이므로 Animated.View 불필요 → View 사용 */}
          {task.type === 'stay' && isInProgress && (
            <View style={styles.stayBarWrap}>
              <View style={styles.stayBarBg}>
                <View style={[styles.stayBarFill, { width: `${stayPercent}%` }]} />
              </View>
              <Text style={styles.stayTime}>
                {stayElapsed}s / {stayReq}s
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 오른쪽: 상태 */}
      <View style={styles.itemRight}>
        {isCompleted ? (
          <Animated.View style={[styles.checkMark, { opacity: fadeAnim }]}>
            <Text style={styles.checkIcon}>✓</Text>
          </Animated.View>
        ) : isFailed ? (
          <View style={styles.failMark}>
            <Text style={styles.failIcon}>✗</Text>
          </View>
        ) : isCurrentZone && !isCompleted ? (
          <View style={styles.activeDot} />
        ) : null}
      </View>
    </View>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────
export default function MissionList({ tasks, currentZone }: MissionListProps) {
  const realTasks     = tasks.filter(t => !t.isFake);
  const completedCount = realTasks.filter(t => t.status === 'completed').length;
  const totalCount    = realTasks.length;
  const progressPct   = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  // 현재 구역 미션을 먼저, 완료된 것은 마지막으로
  const sorted = [...realTasks].sort((a, b) => {
    const aInZone = a.zone === currentZone ? -1 : 0;
    const bInZone = b.zone === currentZone ? -1 : 0;
    const aDone   = a.status === 'completed' ? 1 : 0;
    const bDone   = b.status === 'completed' ? 1 : 0;
    return (aInZone + aDone) - (bInZone + bDone);
  });

  return (
    <View style={styles.container}>

      {/* 헤더 진행도 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 미션</Text>
        <Text style={styles.headerCount}>
          <Text style={styles.headerCountDone}>{completedCount}</Text>
          <Text style={styles.headerCountTotal}>/{totalCount}</Text>
        </Text>
      </View>

      {/* 전체 진행바 */}
      <View style={styles.overallBarBg}>
        <View style={[styles.overallBarFill, { width: `${progressPct}%` }]} />
      </View>

      {/* 미션 목록 */}
      <View style={styles.list}>
        {sorted.map(task => (
          <MissionItem
            key={task.missionId}
            task={task}
            isCurrentZone={task.zone === currentZone}
          />
        ))}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius:    16,
    padding:         14,
    borderWidth:     1,
    borderColor:     '#1e1e1e',
  },

  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  headerTitle: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#1a1a1a',
  },
  headerCount: {
    fontSize: 14,
  },
  headerCountDone: {
    fontWeight: '700',
    color:      '#00e676',
  },
  headerCountTotal: {
    color: '#1a1a1a',
  },

  // 전체 진행바
  overallBarBg: {
    height:          3,
    backgroundColor: '#b0e8e0',
    borderRadius:    2,
    marginBottom:    14,
    overflow:        'hidden',
  },
  overallBarFill: {
    height:          3,
    backgroundColor: '#00e676',
    borderRadius:    2,
  },

  list: {
    gap: 8,
  },

  // 개별 아이템
  item: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: '#c8f0e9',
    borderRadius:    10,
    padding:         10,
    borderWidth:     1,
    borderColor:     '#222',
  },
  itemActive: {
    borderColor:     '#00e676',
    backgroundColor: '#b0e8e0',
  },
  itemDone: {
    opacity: 0.5,
  },
  itemFailed: {
    borderColor: '#3a1a1a',
    opacity:     0.5,
  },

  itemLeft: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
    flex:          1,
  },
  itemIcon: {
    fontSize:  18,
    marginTop: 1,
  },
  itemTexts: {
    flex: 1,
    gap:  3,
  },
  itemTitle: {
    fontSize:   13,
    fontWeight: '500',
    color:      '#1a1a1a',
  },
  itemTitleDone: {
    textDecorationLine: 'line-through',
    color:              '#444',
  },
  itemZone: {
    fontSize:      11,
    color:         '#1a1a1a',
    textTransform: 'capitalize',
  },

  // STAY 진행바
  stayBarWrap: {
    gap:      4,
    marginTop: 6,
  },
  stayBarBg: {
    height:          4,
    backgroundColor: '#b0e8e0',
    borderRadius:    2,
    overflow:        'hidden',
  },
  stayBarFill: {
    height:          4,
    backgroundColor: '#40c4ff',
    borderRadius:    2,
  },
  stayTime: {
    fontSize: 10,
    color:    '#40c4ff',
  },

  itemRight: {
    marginLeft: 8,
  },
  checkMark: {
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: '#00e676',
    alignItems:      'center',
    justifyContent:  'center',
  },
  checkIcon: {
    fontSize:   11,
    fontWeight: '700',
    color:      '#0a0a0a',
  },
  failMark: {
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: '#3a1a1a',
    alignItems:      'center',
    justifyContent:  'center',
  },
  failIcon: {
    fontSize: 11,
    color:    '#ff5252',
  },
  activeDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#00e676',
  },
});