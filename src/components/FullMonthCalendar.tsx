import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import {
  CalendarDay,
  formatDateKey,
  isSameDay,
} from '../utils/dateUtils';
import { MeetingCard } from './MeetingCard';
import { getCalendarAccentColor, getCalendarCardBackground } from '../utils/calendarColor';
import { useAppDialog } from './AppDialog';

interface FullMonthCalendarProps {
  today: Date;
  meetings: Meeting[];
  calendarColor: string;
  selectedDate: Date;
  displayMode: 'month' | 'week';
  onDisplayModeChange: (mode: 'month' | 'week') => void;
  onSelectDate: (date: Date) => void;
  onBackToYear?: () => void;
  onMonthChange: (date: Date) => void;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
  onEditMeeting: (meeting: Meeting) => void;
  onSendTestNotification?: () => Promise<boolean>;
}

const WEEK_DAYS = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];

export const FullMonthCalendar: React.FC<FullMonthCalendarProps> = ({
  today,
  meetings,
  calendarColor,
  selectedDate,
  displayMode,
  onDisplayModeChange,
  onSelectDate,
  onBackToYear,
  onMonthChange,
  onSimulateAlarm,
  onDeleteMeeting,
  onEditMeeting,
  onSendTestNotification,
}) => {
  const showDialog = useAppDialog();
  const { height } = useWindowDimensions();
  const currentMonthDate = selectedDate;
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const scheduleDate = displayMode === 'week' ? selectedDate : today;
  const isScheduleToday = isSameDay(scheduleDate, today);

  // Map ngày -> số cuộc hẹn để đánh dấu trên lịch.
  const meetingDateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meetings) {
      const dateKey = formatDateKey(new Date(m.meetingTime));
      map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
    }
    return map;
    // Local Date fields change with the device timezone; today invalidates this cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, today]);

  // Sinh toàn bộ các ngày trong tháng (Full Month Grid)
  const days: CalendarDay[] = useMemo(() => {
    const first = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      return { date, dateKey: formatDateKey(date), isCurrentMonth: date.getMonth() === first.getMonth(), isToday: isSameDay(date, today) };
    });
  }, [currentMonthDate, today]);
  const weekDays: CalendarDay[] = useMemo(() => {
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - selectedDate.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      return { date, dateKey: formatDateKey(date), isCurrentMonth: date.getMonth() === selectedDate.getMonth(), isToday: isSameDay(date, today) };
    });
  }, [selectedDate, today]);
  const visibleDays = displayMode === 'week' ? weekDays : days;
  const rowHeight = Math.max(65, (height - 240) / 6);

  // Điều hướng tháng
  const handlePrevMonth = () => {
    const d = new Date(currentMonthDate);
    if (displayMode === 'week') d.setDate(d.getDate() - 7);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
    }
    onMonthChange(d);
  };

  const handleNextMonth = () => {
    const d = new Date(currentMonthDate);
    if (displayMode === 'week') d.setDate(d.getDate() + 7);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
    }
    onMonthChange(d);
  };

  const rawMonthOnly = currentMonthDate.toLocaleDateString('vi-VN', {
    month: 'long',
  });
  const monthTitleOnly = rawMonthOnly.charAt(0).toUpperCase() + rawMonthOnly.slice(1);

  const [notificationSent, setNotificationSent] = useState(false);

  // Phân chia lịch trình: Hôm nay (tách theo Buổi Sáng / Chiều / Tối) và Lịch các ngày tới
  const { dayMeetings, morningMeetings, afternoonMeetings, eveningMeetings, futureMeetings } = useMemo(() => {
    const sorted = [...meetings].sort(
      (a, b) => new Date(a.meetingTime).getTime() - new Date(b.meetingTime).getTime()
    );

    const dayItems: Meeting[] = [];
    const morning: Meeting[] = [];
    const afternoon: Meeting[] = [];
    const evening: Meeting[] = [];
    const future: Meeting[] = [];

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    for (const m of sorted) {
      const mDate = new Date(m.meetingTime);
      if (isSameDay(mDate, scheduleDate)) {
        dayItems.push(m);
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
      dayMeetings: dayItems,
      morningMeetings: morning,
      afternoonMeetings: afternoon,
      eveningMeetings: evening,
      futureMeetings: future.slice(0, 5),
    };
  }, [meetings, today, scheduleDate]);
  const dayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const scheduleDayName = dayNames[scheduleDate.getDay()];
  const scheduleFormattedDate = `${scheduleDayName}, ${scheduleDate.getDate()} tháng ${scheduleDate.getMonth() + 1}`;

  const handleTestNotification = async () => {
    const sent = await onSendTestNotification?.();
    if (!sent) {
      showDialog('Chưa gửi được thông báo', 'Hãy kiểm tra quyền thông báo trong Cài đặt thiết bị. Bản web không hỗ trợ thông báo nhắc lịch.');
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
        <TouchableOpacity onPress={handlePrevMonth} style={styles.monthArrow} accessibilityLabel={displayMode === 'week' ? 'Tuần trước' : 'Tháng trước'}><Ionicons name="chevron-back" size={23} color="#00ADFC" /></TouchableOpacity>
        <TouchableOpacity onPress={onBackToYear} accessibilityLabel="Xem lịch năm">
          <Text style={styles.monthTitleText}>{monthTitleOnly.toLocaleLowerCase('vi-VN')} {currentMonthDate.getFullYear()}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNextMonth} style={styles.monthArrow} accessibilityLabel={displayMode === 'week' ? 'Tuần sau' : 'Tháng sau'}><Ionicons name="chevron-forward" size={23} color="#00ADFC" /></TouchableOpacity>
        <View style={styles.headerSpacer} />
        <View style={styles.modeSelector}>
          <TouchableOpacity onPress={() => setModeMenuOpen(open => !open)} accessibilityRole="button" accessibilityLabel="Chọn kiểu xem lịch" accessibilityState={{ expanded: modeMenuOpen }} style={styles.todayButton}>
            <Ionicons name="calendar-outline" size={22} color="#00ADFC" />
            <Text style={styles.todayButtonText}>{displayMode === 'month' ? 'Tháng' : 'Tuần'}</Text>
            <Ionicons name={modeMenuOpen ? 'caret-up' : 'caret-down'} size={14} color="#00ADFC" />
          </TouchableOpacity>
          {modeMenuOpen ? <View style={styles.modeMenu}>
            {(['month', 'week'] as const).map(mode => <TouchableOpacity
              key={mode}
              style={[styles.modeOption, displayMode === mode && styles.modeOptionSelected]}
              onPress={() => { onDisplayModeChange(mode); setModeMenuOpen(false); }}
              accessibilityRole="button"
              accessibilityState={{ selected: displayMode === mode }}
            >
              <Text style={[styles.modeOptionText, displayMode === mode && styles.modeOptionTextSelected]}>{mode === 'month' ? 'Tháng' : 'Tuần'}</Text>
            </TouchableOpacity>)}
          </View> : null}
        </View>
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
        style={[styles.daysGrid, displayMode === 'week' && styles.weekGrid]}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {visibleDays.map((item, idx) => {
          const eventInfo = meetingDateMap.get(item.dateKey);
          const hasMeetings = !!eventInfo;
          const isSelected = isSameDay(item.date, selectedDate);

          return (
            <TouchableOpacity
              key={idx}
              style={[styles.dayCell, displayMode === 'week' ? styles.weekCell : { height: rowHeight }]}
              onPress={() => onSelectDate(item.date)}
              activeOpacity={0.7}
              accessibilityLabel={`${item.date.getDate()}/${item.date.getMonth() + 1}/${item.date.getFullYear()}${item.isToday ? ', hôm nay' : ''}${hasMeetings ? `, ${eventInfo} cuộc hẹn` : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              <View
                style={[
                  styles.dayCircle,
                  hasMeetings && styles.dayCircleHasMeetings,
                  hasMeetings && { backgroundColor: getCalendarCardBackground(calendarColor) },
                  isSelected && !item.isToday && styles.dayCircleSelected,
                  item.isToday && styles.dayCircleToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !item.isCurrentMonth && styles.dayNumberDimmed,
                    hasMeetings && styles.dayNumberHasMeetings,
                    isSelected && !item.isToday && styles.dayNumberSelected,
                    item.isToday && styles.dayNumberToday,
                  ]}
                >
                  {item.date.getDate()}
                </Text>

                {/* Badge đếm số lượng cuộc hẹn */}
                {hasMeetings && eventInfo > 1 && (
                  <View style={styles.countBadgeMini}>
                    <Text style={styles.countBadgeMiniText}>{eventInfo}</Text>
                  </View>
                )}
              </View>

              {/* Chấm tròn chỉ thị bên dưới ngày có lịch */}
              <View style={styles.dotsSlot}>
                {hasMeetings ? (
                  <View
                    style={[
                      styles.activeDot,
                      { backgroundColor: getCalendarAccentColor(calendarColor) },
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
            <Text style={styles.todayTitleText}>{isScheduleToday ? 'Lịch trình hôm nay' : 'Lịch ngày đã chọn'}</Text>

            {/* Nút gửi thử thông báo nền ra màn hình khóa/thanh thông báo */}
            {isScheduleToday ? <TouchableOpacity
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
            </TouchableOpacity> : null}
          </View>
          <View style={styles.todayMetaRow}>
            <Text style={styles.todayDateText}>{scheduleFormattedDate}</Text>
            <View style={styles.todayCountBadge}>
              <Text style={styles.todayCountBadgeText}>{dayMeetings.length} cuộc hẹn</Text>
            </View>
          </View>
        </View>

        {dayMeetings.length === 0 ? (
          <View style={styles.emptyTodayBox}>
            <Image
              source={require('../../assets/empty-schedule-checklist.png')}
              style={styles.emptyIllustration}
              resizeMode="contain"
              accessibilityLabel="Hình minh họa tờ ghi chú và cây bút"
            />
            <Text style={styles.emptyTodayText}>{isScheduleToday ? 'Hôm nay chưa có lịch hẹn' : 'Ngày này chưa có lịch hẹn'}</Text>
          </View>
        ) : (
          <View style={styles.sessionsContainer}>
            {/* Buổi Sáng */}
            {morningMeetings.length > 0 && (
              <View style={styles.sessionGroup}>
                <View style={styles.sessionHeaderRow}>
                  <View style={styles.sessionTitleGroup}>
                    <Ionicons name="sunny" size={14} color="#D97706" />
                    <Text style={styles.sessionTitleText}>Buổi sáng</Text>
                  </View>
                  <View style={styles.sessionCountTag}>
                    <Text style={styles.sessionCountText}>{morningMeetings.length}</Text>
                  </View>
                </View>
                {morningMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    calendarColor={calendarColor}
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
                    <Text style={styles.sessionTitleText}>Buổi chiều</Text>
                  </View>
                  <View style={styles.sessionCountTag}>
                    <Text style={styles.sessionCountText}>{afternoonMeetings.length}</Text>
                  </View>
                </View>
                {afternoonMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    calendarColor={calendarColor}
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
                    <Text style={styles.sessionTitleText}>Buổi tối</Text>
                  </View>
                  <View style={styles.sessionCountTag}>
                    <Text style={styles.sessionCountText}>{eveningMeetings.length}</Text>
                  </View>
                </View>
                {eveningMeetings.map((item) => (
                  <MeetingCard
                    key={item.id}
                    meeting={item}
                    calendarColor={calendarColor}
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
        {displayMode === 'month' && futureMeetings.length > 0 && (
          <View style={styles.futureSection}>
            <View style={styles.futureHeaderRow}>
              <Text style={styles.futureTitleText}>Lịch các ngày tới</Text>
              <Text style={styles.futureCountText}>{futureMeetings.length} cuộc hẹn</Text>
            </View>
            {futureMeetings.map((item) => (
              <MeetingCard
                key={item.id}
                meeting={item}
                calendarColor={calendarColor}
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
    paddingTop: 10,
    paddingBottom: 90,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 17,
    gap: 7,
    zIndex: 2,
  },
  monthArrow: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { flex: 1 },
  monthTitleText: {
    fontSize: 19, fontFamily: 'Roboto',
    color: '#101C2B',
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E8EB',
    paddingBottom: 5,
    paddingHorizontal: 8,
  },
  weekDayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 13, fontFamily: 'Roboto',
    color: '#9AA1A8',
  },
  weekDayWeekendText: {
    color: '#9AA1A8',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  weekGrid: { borderBottomWidth: 1, borderBottomColor: '#E5E8EB' },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#E5E8EB',
  },
  weekCell: { height: 72, paddingTop: 10, borderTopWidth: 0 },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dayCircleHasMeetings: {
    backgroundColor: '#E8F8FF',
  },
  dayCircleSelected: { backgroundColor: '#EAF8FF', borderColor: '#00ADFC', borderWidth: 1.5 },
  dayCircleToday: {
    backgroundColor: '#00ADFC',
    borderRadius: 20,
  },
  dayNumberSelected: { color: '#008FCC' },
  dayNumberToday: {
    color: '#FFFFFF',
  },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
  },
  modeSelector: { position: 'relative' },
  modeMenu: {
    position: 'absolute',
    top: 40,
    right: 0,
    width: 138,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A2540',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    overflow: 'hidden',
    zIndex: 3,
  },
  modeOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18 },
  modeOptionSelected: { backgroundColor: '#EAF8FF' },
  modeOptionText: { color: '#101C2B', fontSize: 16, fontFamily: 'Roboto' },
  modeOptionTextSelected: { color: '#008FCC' },
  todayButtonText: {
    color: '#101C2B',
    fontSize: 16, fontFamily: 'Roboto',
  },
  dayNumber: {
    fontSize: 14, fontFamily: 'Roboto',
    color: '#101C2B',
  },
  dayNumberDimmed: {
    color: '#D1D5D9',
  },
  dayNumberHasMeetings: {
    color: '#088CC8',
  },
  countBadgeMini: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00ADFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeMiniText: {
    color: '#FFFFFF',
    fontSize: 9, fontFamily: 'Roboto',
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
  todayTitleText: { flex: 1, color: '#0A2540', fontSize: 16, fontFamily: 'Roboto' },
  todayMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  todayCountBadge: {
    backgroundColor: '#EAF8FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B9E8FB',
  },
  todayCountBadgeText: {
    color: '#008FCC',
    fontSize: 10.5, fontFamily: 'Roboto',
  },
  todayDateText: {
    color: '#64748B',
    fontSize: 12, fontFamily: 'Roboto',
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
    fontSize: 11, fontFamily: 'Roboto',
  },
  testNotificationBtnTextSent: {
    color: '#059669',
  },
  emptyTodayBox: {
    backgroundColor: '#F8FBFD',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  emptyIllustration: { width: 112, height: 112 },
  emptyTodayText: {
    color: '#94A3B8',
    fontSize: 13, fontFamily: 'Roboto',
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
    fontSize: 12, fontFamily: 'Roboto',
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
    fontSize: 11, fontFamily: 'Roboto',
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
    fontSize: 14, fontFamily: 'Roboto',
    color: '#475569',
    letterSpacing: -0.2,
  },
  futureCountText: {
    fontSize: 12, fontFamily: 'Roboto',
    color: '#94A3B8',
  },
});
