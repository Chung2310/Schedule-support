import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import { isSameDay, formatDateKey } from '../utils/dateUtils';

interface DayHourlyTimelineProps {
  date: Date;
  meetings: Meeting[];
  onSimulateAlarm: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
  onSlotPress: (hour: number) => void;
  onAddMeeting: () => void;
  style?: any;
}

// Dãy đầy đủ các giờ từ 06:00 sáng đến 23:00 đêm cho cả ngày làm việc của CEO
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

export const DayHourlyTimeline: React.FC<DayHourlyTimelineProps> = ({
  date,
  meetings,
  onSimulateAlarm,
  onDeleteMeeting,
  onSlotPress,
  style,
}) => {
  const [slideAnim] = useState(() => new Animated.Value(18));
  const [opacityAnim] = useState(() => new Animated.Value(0.2));
  const dateKey = formatDateKey(date);

  // Hiệu ứng animation trượt nhẹ lên mượt mà khi đổi ngày
  useEffect(() => {
    slideAnim.setValue(18);
    opacityAnim.setValue(0.2);

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 70,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dateKey, slideAnim, opacityAnim]);

  const now = new Date();
  const isToday = isSameDay(date, now);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  return (
    <Animated.View
      style={[
        styles.timelineContainer,
        style,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Dãy các giờ hiển thị trực tiếp bên ngoài, KHÔNG nhét vào box, chuẩn giao diện iPhone */}
      <ScrollView
        style={styles.hoursScrollView}
        contentContainerStyle={styles.hoursContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {HOURS.map((hour) => {
          const hourStr = `${String(hour).padStart(2, '0')}:00`;
          const hourMeetings = meetings.filter(
            (m) => new Date(m.meetingTime).getHours() === hour
          );
          const isCurrentHourSlot = isToday && currentHour === hour;

          return (
            <View key={hour} style={styles.hourRow}>
              {/* Cột hiển thị mốc giờ bên trái */}
              <View style={styles.timeLabelCol}>
                <Text
                  style={[
                    styles.timeLabelText,
                    isCurrentHourSlot && styles.timeLabelCurrent,
                  ]}
                >
                  {hourStr}
                </Text>
              </View>

              {/* Làn đường nội dung khung giờ */}
              <View style={styles.slotLane}>
                {/* Vạch kẻ chia giờ chuẩn Apple Calendar chạy hết bề ngang */}
                <View style={styles.slotDividerLine} />

                {/* Vạch kẻ đỏ chỉ thời gian thực nếu là ngày hôm nay */}
                {isCurrentHourSlot && (
                  <View
                    style={[
                      styles.currentIndicatorLine,
                      { top: `${Math.min(95, Math.max(5, (currentMinute / 60) * 100))}%` },
                    ]}
                  >
                    <View style={styles.currentIndicatorDot} />
                  </View>
                )}

                {/* NẾU KHUNG GIỜ NÀY CÓ LỊCH HẸN: Hiển thị các thẻ cuộc họp */}
                {hourMeetings.length > 0 ? (
                  <View style={styles.meetingsStack}>
                    {hourMeetings.map((m) => {
                      const mDate = new Date(m.meetingTime);
                      const exactTime = mDate.toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isAck = m.status === 'ACKNOWLEDGED';
                      const isReminding = m.status === 'REMINDING';

                      return (
                        <View
                          key={m.id}
                          style={[
                            styles.meetingCard,
                            isAck && styles.meetingCardAck,
                            isReminding && styles.meetingCardReminding,
                          ]}
                        >
                          {/* Dải màu báo trạng thái */}
                          <View
                            style={[
                              styles.statusStripe,
                              {
                                backgroundColor: isAck
                                  ? '#10B981'
                                  : isReminding
                                  ? '#EF4444'
                                  : '#0A2540',
                              },
                            ]}
                          />

                          <View style={styles.cardMain}>
                            <View style={styles.cardHeader}>
                              <Text style={styles.cardTitle} numberOfLines={1}>
                                {m.title}
                              </Text>
                              <View style={styles.timeBadge}>
                                <Text style={styles.timeBadgeText}>{exactTime}</Text>
                              </View>
                            </View>

                            <View style={styles.cardFooter}>
                              <Text style={styles.reminderInfo}>
                                {isAck
                                  ? '✓ Đã xác nhận'
                                  : `Báo trước ${m.advanceNoticeMinutes}p • Lặp ${m.repeatIntervalMinutes}p`}
                              </Text>

                              {/* Thao tác nhanh */}
                              <View style={styles.actionButtons}>
                                <TouchableOpacity
                                  style={styles.iconBtn}
                                  onPress={() => onSimulateAlarm(m)}
                                  accessibilityLabel="Thử chuông"
                                >
                                  <Ionicons name="flash" size={13} color="#D97706" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.iconBtn}
                                  onPress={() => onDeleteMeeting(m.id)}
                                  accessibilityLabel="Xóa lịch"
                                >
                                  <Ionicons name="trash-outline" size={14} color="#94A3B8" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  /* NẾU KHUNG GIỜ NÀY TRỐNG: Luôn hiển thị khung giờ trống kèm dấu + chạm để thêm */
                  <TouchableOpacity
                    style={styles.emptySlotTapArea}
                    activeOpacity={0.65}
                    onPress={() => onSlotPress(hour)}
                  >
                    <View style={styles.emptySlotInner}>
                      <Ionicons name="add-circle-outline" size={14} color="#CBD5E1" />
                      <Text style={styles.emptySlotHint}>Chạm để thêm lúc {hourStr}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  timelineContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  hoursScrollView: {
    flex: 1,
    width: '100%',
  },
  hoursContentContainer: {
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 100 : 85,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  timeLabelCol: {
    width: 54,
    paddingLeft: 16,
    paddingTop: 4,
    alignItems: 'flex-start',
  },
  timeLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: -0.2,
  },
  timeLabelCurrent: {
    color: '#EF4444',
    fontWeight: '900',
  },
  slotLane: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    paddingRight: 16,
    paddingBottom: 4,
  },
  slotDividerLine: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
  },
  currentIndicatorLine: {
    position: 'absolute',
    left: -54,
    right: 0,
    height: 2,
    backgroundColor: '#EF4444',
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    marginLeft: 50,
  },
  meetingsStack: {
    paddingTop: 2,
    paddingBottom: 2,
    gap: 4,
  },
  meetingCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    zIndex: 2,
  },
  meetingCardAck: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  meetingCardReminding: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusStripe: {
    width: 3.5,
    height: 32,
    borderRadius: 2,
    marginRight: 8,
  },
  cardMain: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A2540',
    flex: 1,
  },
  timeBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  timeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  reminderInfo: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    padding: 3,
  },
  emptySlotTapArea: {
    height: 36,
    justifyContent: 'center',
    paddingLeft: 4,
    zIndex: 1,
  },
  emptySlotInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  emptySlotHint: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
});
