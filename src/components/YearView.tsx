import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import { generateMonthDays, formatDateKey, isSameDay } from '../utils/dateUtils';

interface YearViewProps {
  today: Date;
  initialYear: number;
  meetings: Meeting[];
  onSelectMonth: (year: number, monthIndex: number) => void;
}

const MONTH_NAMES = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const MINI_WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const YearView: React.FC<YearViewProps> = ({
  today,
  initialYear,
  meetings,
  onSelectMonth,
}) => {
  const [currentYear, setCurrentYear] = useState<number>(initialYear);
  const previousInitialYearRef = useRef(initialYear);

  useEffect(() => {
    const previous = previousInitialYearRef.current;
    previousInitialYearRef.current = initialYear;
    // Follow a year rollover while keeping an explicitly browsed year in place.
    setCurrentYear((current) => current === previous ? initialYear : current);
  }, [initialYear]);

  // Map ngày -> số cuộc họp
  const meetingDateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meetings) {
      const dateKey = formatDateKey(new Date(m.meetingTime));
      map.set(dateKey, (map.get(dateKey) || 0) + 1);
    }
    return map;
    // Local Date fields change with the device timezone; today invalidates this cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, today]);

  // Đếm tổng số cuộc họp của từng tháng trong năm
  const monthMeetingCounts = useMemo(() => {
    const counts = Array(12).fill(0);
    for (const m of meetings) {
      const d = new Date(m.meetingTime);
      if (d.getFullYear() === currentYear) {
        counts[d.getMonth()] += 1;
      }
    }
    return counts;
    // Meetings near month/year boundaries can move when the device timezone changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, currentYear, today]);

  const handlePrevYear = () => {
    setCurrentYear((prev) => prev - 1);
  };

  const handleNextYear = () => {
    setCurrentYear((prev) => prev + 1);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Thanh tiêu đề Năm và nút chuyển năm */}
      <View style={styles.headerRow}>
        <Text style={styles.yearTitleText}>{currentYear}</Text>

        <View style={styles.arrowGroup}>
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handlePrevYear}
            accessibilityLabel="Năm trước"
          >
            <Ionicons name="chevron-back" size={17} color="#0A2540" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.arrowButton}
            onPress={handleNextYear}
            accessibilityLabel="Năm sau"
          >
            <Ionicons name="chevron-forward" size={17} color="#0A2540" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Lưới 12 tháng (2 cột chuẩn mobile, chạm vào tháng nào thì mở tháng đó) */}
      <View style={styles.monthsGrid}>
        {MONTH_NAMES.map((monthName, monthIndex) => {
          const monthDays = generateMonthDays(currentYear, monthIndex, today);
          const meetingsInMonth = monthMeetingCounts[monthIndex];
          const isCurrentMonth =
            today.getFullYear() === currentYear && today.getMonth() === monthIndex;

          return (
            <TouchableOpacity
              key={monthIndex}
              style={styles.monthCard}
              activeOpacity={0.75}
              onPress={() => onSelectMonth(currentYear, monthIndex)}
            >
              {/* Tiêu đề tháng + Huy hiệu số lịch hẹn */}
              <View style={styles.monthCardHeader}>
                <Text
                  style={[
                    styles.monthCardTitle,
                    isCurrentMonth && styles.monthCardTitleCurrent,
                  ]}
                >
                  {monthName}
                </Text>
                {meetingsInMonth > 0 && (
                  <View style={styles.monthBadge}>
                    <Text style={styles.monthBadgeText}>{meetingsInMonth} lịch</Text>
                  </View>
                )}
              </View>

              {/* Hàng thứ rút gọn */}
              <View style={styles.miniWeekRow}>
                {MINI_WEEK_DAYS.map((wd, i) => (
                  <Text key={i} style={styles.miniWeekText}>
                    {wd}
                  </Text>
                ))}
              </View>

              {/* Lưới ngày thu nhỏ của tháng */}
              <View style={styles.miniDaysGrid}>
                {monthDays.map((item, dIdx) => {
                  const hasMeetings = (meetingDateMap.get(item.dateKey) || 0) > 0;
                  const isTodayItem = isSameDay(item.date, today);

                  return (
                    <View key={dIdx} style={styles.miniDayCell}>
                      <Text
                        style={[
                          styles.miniDayNumber,
                          !item.isCurrentMonth && styles.miniDayNumberDimmed,
                          hasMeetings && styles.miniDayNumberHasMeeting,
                          isTodayItem && styles.miniDayNumberToday,
                        ]}
                      >
                        {item.date.getDate()}
                      </Text>
                      {hasMeetings && item.isCurrentMonth && (
                        <View style={styles.miniEventDot} />
                      )}
                    </View>
                  );
                })}
              </View>
            </TouchableOpacity>
          );
        })}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  yearTitleText: {
    fontSize: 26, fontFamily: 'Roboto',
    color: '#0A2540',
    letterSpacing: -0.5,
  },
  arrowGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  arrowButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 12,
  },
  monthCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  monthCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  monthCardTitle: {
    fontSize: 14, fontFamily: 'Roboto',
    color: '#0A2540',
  },
  monthCardTitleCurrent: {
    color: '#1D4ED8',
  },
  monthBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  monthBadgeText: {
    color: '#1D4ED8',
    fontSize: 9.5, fontFamily: 'Roboto',
  },
  miniWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 3,
  },
  miniWeekText: {
    width: 18,
    textAlign: 'center',
    fontSize: 8.5, fontFamily: 'Roboto',
    color: '#94A3B8',
  },
  miniDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  miniDayCell: {
    width: '14.28%',
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
  },
  miniDayNumber: {
    fontSize: 9.5, fontFamily: 'Roboto',
    color: '#1E293B',
  },
  miniDayNumberDimmed: {
    color: '#E2E8F0',
  },
  miniDayNumberHasMeeting: {
    color: '#1D4ED8',
  },
  miniDayNumberToday: {
    color: '#2563EB',
  },
  miniEventDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: '#2563EB',
    position: 'absolute',
    bottom: 0,
  },
});
