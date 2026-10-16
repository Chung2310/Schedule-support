import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import {
  CalendarDay,
  formatDateKey,
  generateMonthDays,
  isSameDay,
} from '../utils/dateUtils';
import { MeetingCard } from './MeetingCard';

interface FullMonthCalendarProps {
  meetings: Meeting[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onBackToYear?: () => void;
  onMonthChange: (date: Date) => void;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
  onEditMeeting: (meeting: Meeting) => void;
  onSendTestNotification?: () => Promise<boolean>;
}

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const FullMonthCalendar: React.FC<FullMonthCalendarProps> = ({
  meetings,
  selectedDate,
  onSelectDate,
  onMonthChange,
  onSimulateAlarm,
  onDeleteMeeting,
  onEditMeeting,
  onSendTestNotification,
}) => {
  const currentMonthDate = selectedDate;

  // Map ngày -> số cuộc họp & trạng thái để tô màu nổi bật
  const meetingDateMap = useMemo(() => {
    const map = new Map<string, { count: number; hasUnacknowledged: boolean }>();
    for (const m of meetings) {
      const dateKey = formatDateKey(new Date(m.meetingTime));
      const existing = map.get(dateKey) || { count: 0, hasUnacknowledged: false };
      existing.count += 1;
      if (m.status !== 'ACKNOWLEDGED') {
        existing.hasUnacknowledged = true;
      }
      map.set(dateKey, existing);
    }
    return map;
  }, [meetings]);

  // Sinh toàn bộ các ngày trong tháng (Full Month Grid)
  const days: CalendarDay[] = useMemo(() => {
    return generateMonthDays(
      currentMonthDate.getFullYear(),
      currentMonthDate.getMonth()
    );
  }, [currentMonthDate]);

  // Điều hướng tháng
  const handlePrevMonth = () => {
    const d = new Date(currentMonthDate);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    onMonthChange(d);
  };

  const handleNextMonth = () => {
    const d = new Date(currentMonthDate);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    onMonthChange(d);
  };

  const rawMonthOnly = currentMonthDate.toLocaleDateString('vi-VN', {
    month: 'long',
  });
  const monthTitleOnly = rawMonthOnly.charAt(0).toUpperCase() + rawMonthOnly.slice(1);

  const [notificationSent, setNotificationSent] = useState(false);

  // Phân chia lịch trình: Hôm nay (tách theo Buổi Sáng / Chiều / Tối) và Lịch các ngày tới
  const { todayMeetings, morningMeetings, afternoonMeetings, eveningMeetings, futureMeetings } = useMemo(() => {
    const today = new Date();
    const sorted = [...meetings].sort(
      (a, b) => new Date(a.meetingTime).getTime() - new Date(b.meetingTime).getTime()
    );

    const todayItems: Meeting[] = [];
    const morning: Meeting[] = [];
    const afternoon: Meeting[] = [];
    const evening: Meeting[] = [];
    const future: Meeting[] = [];

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    for (const m of sorted) {
      const mDate = new Date(m.meetingTime);
      if (isSameDay(mDate, today)) {
        todayItems.push(m);
        const hours = mDate.getHours();
        if (hours < 12) {
          morning.push(m);
        } else if (hours < 18) {
          afternoon.push(m);
        } else {
          evening.push(m);
        }
      } else if (mDate.getTime() > endOfToday.getTime()) {
        future.push(m);
      }
    }

    return {
      todayMeetings: todayItems,
      morningMeetings: morning,
      afternoonMeetings: afternoon,
      eveningMeetings: evening,
      futureMeetings: future.slice(0, 5),
    };
  }, [meetings]);

  const today = new Date();
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const todayDayName = dayNames[today.getDay()];
  const todayFormattedDate = `${todayDayName}, ${today.getDate()} tháng ${today.getMonth() + 1}`;

  const handleTestNotification = async () => {
    const sent = await onSendTestNotification?.();
    if (!sent) {
      Alert.alert('Chưa gửi được thông báo', 'Hãy kiểm tra quyền thông báo trong Cài đặt thiết bị. Bản web không hỗ trợ thông báo nhắc lịch.');
      return;
    }
    setNotificationSent(true);
    setTimeout(() => setNotificationSent(false), 2500);
  };

  const touchStartX = React.useRef<number>(0);

  const handleTouchStart = (e: any) => {
    touchStartX.current = e.nativeEvent.pageX;
  };

  const handleTouchEnd = (e: any) => {
    const diffX = e.nativeEvent.pageX - touchStartX.current;
    if (diffX > 60) {
      handlePrevMonth(); // Vuốt sang phải -> Tháng trước
    } else if (diffX < -60) {
      handleNextMonth(); // Vuốt sang trái -> Tháng sau
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Tiêu đề Tháng hiện tại: Hiển thị thanh lịch, vuốt ngang để chuyển giữa các tháng */}
      <View style={styles.monthHeaderRow}>
        <Text style={styles.monthTitleText}>
          {monthTitleOnly} {currentMonthDate.getFullYear()}
        </Text>
      </View>

      {/* Hàng Tiêu đề Thứ (T2 -> CN) */}
      <View style={styles.weekHeaderRow}>
        {WEEK_DAYS.map((dayName, idx) => (
          <Text
            key={idx}
            style={[
              styles.weekDayText,
              (idx === 5 || idx === 6) && styles.weekDayWeekendText,
            ]}
          >
            {dayName}
          </Text>
        ))}
      </View>

      {/* Lưới toàn bộ các ngày trong tháng: Hỗ trợ vuốt ngang chuyển tháng, KHÔNG CẦN NÚT <> */}
      <View
        style={styles.daysGrid}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {days.map((item, idx) => {
          const eventInfo = meetingDateMap.get(item.dateKey);
          const hasMeetings = !!eventInfo && eventInfo.count > 0;

          return (
            <TouchableOpacity
              key={idx}
              style={styles.dayCell}
              onPress={() => onSelectDate(item.date)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dayCircle,
                  hasMeetings && styles.dayCircleHasMeetings,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !item.isCurrentMonth && styles.dayNumberDimmed,
                    hasMeetings && styles.dayNumberHasMeetings,
                  ]}
                >
                  {item.date.getDate()}
                </Text>

                {/* Badge đếm số lượng cuộc hẹn */}
                {hasMeetings && eventInfo.count > 1 && (
                  <View style={styles.countBadgeMini}>
                    <Text style={styles.countBadgeMiniText}>{eventInfo.count}</Text>
                  </View>
                )}
              </View>

              {/* Chấm tròn chỉ thị bên dưới ngày có lịch */}
              <View style={styles.dotsSlot}>
                {hasMeetings ? (
                  <View
                    style={[
                      styles.activeDot,
                      eventInfo.hasUnacknowledged
                        ? styles.dotUnacknowledged
                        : styles.dotAcknowledged,
                    ]}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Lịch trình các cuộc hẹn hôm nay được tổ chức chuyên nghiệp */}
      <View style={styles.todaySection}>
        <View style={styles.todaySectionHeader}>
          <View style={styles.todayHeaderTopRow}>
            <View style={styles.todayTitleRow}>
              <Text style={styles.todayTitleText}>Lịch Trình Hôm Nay</Text>
              <View style={styles.todayCountBadge}>
                <Text style={styles.todayCountBadgeText}>
                  {todayMeetings.length} cuộc hẹn
                </Text>
              </View>
            </View>

            {/* Nút gửi thử thông báo nền ra màn hình khóa/thanh thông báo */}
            <TouchableOpacity
              style={[
                styles.testNotificationBtn,
                notificationSent && styles.testNotificationBtnSent,
              ]}
              onPress={handleTestNotification}
              activeOpacity={0.8}
              accessibilityLabel="Thử thông báo nền"
            >
              <Ionicons
                name={notificationSent ? 'checkmark-circle' : 'notifications-outline'}
                size={14}
                color={notificationSent ? '#059669' : '#0A2540'}
              />
              <Text
                style={[
                  styles.testNotificationBtnText,
                  notificationSent && styles.testNotificationBtnTextSent,
                ]}
              >
                {notificationSent ? 'Đã gửi' : 'Thử thông báo'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.todayDateText}>{todayFormattedDate}</Text>
        </View>

        {todayMeetings.length === 0 ? (
          <View style={styles.emptyTodayBox}>
            <Ionicons name="calendar-outline" size={24} color="#94A3B8" />
            <Text style={styles.emptyTodayText}>Hôm nay không có lịch hẹn nào</Text>
          </View>
        ) : (
          <View style={styles.sessionsContainer}>
            {/* Buổi Sáng */}
            {morningMeetings.length > 0 && (
              <View style={styles.sessionGroup}>
                <View style={styles.sessionHeaderRow}>
                  <View style={styles.sessionTitleGroup}>
                    <Ionicons name="sunny" size={14} color="#D97706" />
                    <Text style={styles.sessionTitleText}>BUỔI SÁNG</Text>
                  </View>
                  <View style={styles.sessionCountTag}>
                    <Text style={styles.sessionCountText}>{morningMeetings.length}</Text>
                  </View>
                </View>
                {morningMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    onSimulateAlarm={onSimulateAlarm}
                    onDelete={onDeleteMeeting}
                    onEdit={onEditMeeting}
                  />
                ))}
              </View>
            )}

            {/* Buổi Chiều */}
            {afternoonMeetings.length > 0 && (
              <View style={styles.sessionGroup}>
                <View style={styles.sessionHeaderRow}>
                  <View style={styles.sessionTitleGroup}>
                    <Ionicons name="partly-sunny" size={14} color="#2563EB" />
                    <Text style={styles.sessionTitleText}>BUỔI CHIỀU</Text>
                  </View>
                  <View style={styles.sessionCountTag}>
                    <Text style={styles.sessionCountText}>{afternoonMeetings.length}</Text>
                  </View>
                </View>
                {afternoonMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    onSimulateAlarm={onSimulateAlarm}
                    onDelete={onDeleteMeeting}
                    onEdit={onEditMeeting}
                  />
                ))}
              </View>
            )}

            {/* Buổi Tối */}
            {eveningMeetings.length > 0 && (
              <View style={styles.sessionGroup}>
                <View style={styles.sessionHeaderRow}>
                  <View style={styles.sessionTitleGroup}>
                    <Ionicons name="moon" size={14} color="#475569" />
                    <Text style={styles.sessionTitleText}>BUỔI TỐI</Text>
                  </View>
                  <View style={styles.sessionCountTag}>
                    <Text style={styles.sessionCountText}>{eveningMeetings.length}</Text>
                  </View>
                </View>
                {eveningMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    onSimulateAlarm={onSimulateAlarm}
                    onDelete={onDeleteMeeting}
                    onEdit={onEditMeeting}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Lịch các ngày tiếp theo nếu có */}
        {futureMeetings.length > 0 && (
          <View style={styles.futureSection}>
            <View style={styles.futureHeaderRow}>
              <Text style={styles.futureTitleText}>Lịch Các Ngày Tới</Text>
              <Text style={styles.futureCountText}>{futureMeetings.length} cuộc hẹn</Text>
            </View>
            {futureMeetings.map((item) => (
              <MeetingCard
                key={item.id}
                meeting={item}
                onSimulateAlarm={onSimulateAlarm}
                onDelete={onDeleteMeeting}
                onEdit={onEditMeeting}
                showDateBadge={true}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 90,
  },
  monthHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  monthTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0A2540',
    letterSpacing: -0.4,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    paddingBottom: 6,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  weekDayText: {
    width: 40,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  weekDayWeekendText: {
    color: '#D97706',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 3,
    minHeight: 48,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dayCircleHasMeetings: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
  },
  dayNumber: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  dayNumberDimmed: {
    color: '#CBD5E1',
    fontWeight: '500',
  },
  dayNumberHasMeetings: {
    color: '#1E40AF',
    fontWeight: '900',
  },
  countBadgeMini: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeMiniText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  dotsSlot: {
    height: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotUnacknowledged: {
    backgroundColor: '#D97706',
  },
  dotAcknowledged: {
    backgroundColor: '#059669',
  },
  todaySection: {
    marginTop: 14,
    paddingHorizontal: 16,
  },
  todaySectionHeader: {
    marginBottom: 10,
  },
  todayHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  todayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  todayTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0A2540',
    letterSpacing: -0.3,
  },
  todayCountBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  todayCountBadgeText: {
    color: '#1D4ED8',
    fontSize: 10.5,
    fontWeight: '800',
  },
  todayDateText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  testNotificationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  testNotificationBtnSent: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  testNotificationBtnText: {
    color: '#0A2540',
    fontSize: 11,
    fontWeight: '700',
  },
  testNotificationBtnTextSent: {
    color: '#059669',
  },
  emptyTodayBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  emptyTodayText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  sessionsContainer: {
    gap: 12,
  },
  sessionGroup: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sessionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
  },
  sessionCountTag: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sessionCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  futureSection: {
    marginTop: 16,
  },
  futureHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  futureTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: -0.2,
  },
  futureCountText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
