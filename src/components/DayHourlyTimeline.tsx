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
import { Meeting } from '../types/meeting';
import { isSameDay, formatDateKey } from '../utils/dateUtils';
import { getCalendarAccentColor, getCalendarCardBackground } from '../utils/calendarColor';
import { formatAdvanceNotice } from '../utils/formatAdvanceNotice';
import { useCurrentMinute } from '../hooks/useLocalDay';
import { useCancelMeetingDialog } from './AppDialog';
import { ScheduleIcon } from './ScheduleIcons';

interface DayHourlyTimelineProps {
  date: Date;
  meetings: Meeting[];
  calendarColor: string;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
  onEditMeeting: (meeting: Meeting) => void;
  onSlotPress: (hour: number) => void;
  onAddMeeting: () => void;
  style?: any;
}

// Include every valid edited hour, including meetings before 06:00.
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const DayHourlyTimeline: React.FC<DayHourlyTimelineProps> = ({
  date,
  meetings,
  calendarColor,
  onSimulateAlarm,
  onDeleteMeeting,
  onEditMeeting,
  onSlotPress,
  style,
}) => {
  const confirmCancelMeeting = useCancelMeetingDialog(onDeleteMeeting);
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

  const now = useCurrentMinute();
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
                      const statusText = isAck
                        ? 'Đã xác nhận nhớ'
                        : isReminding
                          ? 'Đang báo thức...'
                          : m.status === 'EXPIRED'
                            ? 'Đã qua'
                            : `Nhắc lại mỗi ${m.repeatIntervalMinutes}p`;

                      return (
                        <View
                          key={m.id}
                          style={[
                            styles.meetingCard,
                            { backgroundColor: getCalendarCardBackground(calendarColor) },
                            calendarColor === '#FFFFFF' && styles.whiteMeetingCard,
                          ]}
                        >
                          <View style={[styles.statusStripe, { backgroundColor: getCalendarAccentColor(calendarColor) }]} />
                          <View style={styles.timeColumn}>
                            <Text style={styles.timeText}>{exactTime}</Text>
                            <Text style={styles.leadText}>-{formatAdvanceNotice(m.advanceNoticeMinutes, true)}</Text>
                          </View>
                          <View style={styles.meetingContent}>
                            <Text style={styles.cardTitle} numberOfLines={2}>{m.title}</Text>
                            <Text style={styles.meetingStatus} numberOfLines={1}>{statusText}</Text>
                          </View>
                          <View style={styles.actionButtons}>
                            <TouchableOpacity style={styles.actionButton} onPress={() => onEditMeeting(m)} accessibilityRole="button" accessibilityLabel={`Sửa ${m.title}`}>
                              <ScheduleIcon name="edit" size={18} color="#31779C" />
                            </TouchableOpacity>
                            {!isAck ? <TouchableOpacity style={styles.reminderButton} onPress={() => onSimulateAlarm(m)} accessibilityRole="button" accessibilityLabel={`Thử nhắc lịch ${m.title}`}>
                              <ScheduleIcon name="mic" size={17} color="#E89A16" />
                            </TouchableOpacity> : null}
                            <TouchableOpacity style={styles.actionButton} onPress={() => confirmCancelMeeting(m)} accessibilityRole="button" accessibilityLabel={`Hủy lịch ${m.title}`}>
                              <ScheduleIcon name="close" size={16} color="#A0AEC0" />
                            </TouchableOpacity>
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
                    accessibilityRole="button"
                    accessibilityLabel={`Thêm lịch lúc ${hourStr}`}
                  >
                    <View style={styles.emptySlotInner}>
                      <Text style={styles.emptySlotPlus}>+</Text>
                      <Text style={styles.emptySlotHint}>Thêm lịch</Text>
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
    minHeight: 56,
  },
  timeLabelCol: {
    width: 62,
    paddingLeft: 20,
    paddingTop: 4,
    alignItems: 'flex-start',
  },
  timeLabelText: {
    fontSize: 13, fontFamily: 'Roboto',
    color: '#8295A5',
    letterSpacing: -0.2,
  },
  timeLabelCurrent: {
    color: '#EF4444',
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
    backgroundColor: '#E6EFF4',
  },
  currentIndicatorLine: {
    position: 'absolute',
    left: -62,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 70,
    zIndex: 2,
  },
  whiteMeetingCard: { borderWidth: 1, borderColor: '#E8EEF3' },
  statusStripe: {
    width: 3,
    height: 40,
    borderRadius: 2,
    marginRight: 8,
  },
  timeColumn: { minWidth: 51 },
  timeText: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 14 },
  leadText: { color: '#91A0AF', fontFamily: 'Roboto', fontSize: 11, marginTop: 3 },
  meetingContent: { flex: 1, minWidth: 0, paddingHorizontal: 5 },
  cardTitle: {
    fontSize: 14, fontFamily: 'Roboto',
    color: '#0A2540',
    lineHeight: 19,
  },
  meetingStatus: { color: '#718198', fontFamily: 'Roboto', fontSize: 11, marginTop: 3 },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  actionButton: { width: 29, height: 36, alignItems: 'center', justifyContent: 'center' },
  reminderButton: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF2CD' },
  emptySlotTapArea: {
    height: 36,
    justifyContent: 'center',
    paddingLeft: 4,
    zIndex: 1,
  },
  emptySlotInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  emptySlotPlus: {
    width: 17,
    height: 17,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#EAF8FF',
    color: '#00ADFC',
    fontSize: 16,
    fontFamily: 'Roboto',
    lineHeight: 17,
    textAlign: 'center',
  },
  emptySlotHint: {
    fontSize: 12, fontFamily: 'Roboto',
    color: '#8AA3B1',
  },
});
