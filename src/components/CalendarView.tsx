import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Meeting } from '../types/meeting';
import { formatDateKey, isSameDay, getDaysInMonth } from '../utils/dateUtils';
import { getCalendarAccentColor, getCalendarCardBackground } from '../utils/calendarColor';

interface CalendarViewProps {
  today: Date;
  meetings: Meeting[];
  calendarColor: string;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onBackToMonth?: () => void;
}

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const ITEM_WIDTH = 54;

export const CalendarView: React.FC<CalendarViewProps> = ({
  today,
  meetings,
  calendarColor,
  selectedDate,
  onSelectDate,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const initialScrolledRef = useRef(false);

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

  // Chỉ sinh các ngày trong tháng đó (1 .. 28/30/31)
  const daysInMonth = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const count = getDaysInMonth(y, m);
    const list: {
      date: Date;
      dateKey: string;
      dayOfWeekName: string;
      dayNumber: number;
      isWeekend: boolean;
    }[] = [];

    for (let day = 1; day <= count; day++) {
      const d = new Date(y, m, day);
      const dow = d.getDay(); // 0 = CN, 1 = T2 ... 6 = T7
      const dowIndex = dow === 0 ? 6 : dow - 1;

      list.push({
        date: d,
        dateKey: formatDateKey(d),
        dayNumber: day,
        dayOfWeekName: WEEK_DAYS[dowIndex],
        isWeekend: dow === 0 || dow === 6,
      });
    }
    return list;
    // Recreate local midnights after a timezone change, even with the same selectedDate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, today]);

  // Tự động cuộn đến ngày đang chọn trong tháng
  useEffect(() => {
    const index = daysInMonth.findIndex((item) => isSameDay(item.date, selectedDate));
    if (index >= 0 && scrollViewRef.current) {
      const screenWidth = Dimensions.get('window').width;
      const targetX = Math.max(0, index * ITEM_WIDTH - screenWidth / 2 + ITEM_WIDTH / 2);
      scrollViewRef.current.scrollTo({
        x: targetX,
        animated: initialScrolledRef.current,
      });
      initialScrolledRef.current = true;
    }
  }, [selectedDate, daysInMonth]);

  const monthTitle = selectedDate.toLocaleDateString('vi-VN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      {/* Tiêu đề tháng hiện tại */}
      <View style={styles.monthHeaderRow}>
        <Text style={styles.monthTitleText}>{monthTitle}</Text>
        <TouchableOpacity onPress={() => onSelectDate(new Date(today))} accessibilityRole="button" accessibilityLabel="Quay về hôm nay" style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Hôm nay</Text>
        </TouchableOpacity>
      </View>

      {/* Dải các ngày trượt ngang GIỚI HẠN CHỈ TRONG THÁNG ĐÓ */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {daysInMonth.map((item, idx) => {
          const isSelected = isSameDay(item.date, selectedDate);
          const isToday = isSameDay(item.date, today);
          const eventInfo = meetingDateMap.get(item.dateKey);
          const hasMeetings = !!eventInfo;

          return (
            <TouchableOpacity
              key={idx}
              style={styles.dayItem}
              onPress={() => onSelectDate(item.date)}
              activeOpacity={0.7}
              accessibilityLabel={`${item.date.getDate()}/${item.date.getMonth() + 1}/${item.date.getFullYear()}${isToday ? ', hôm nay' : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              {/* Thứ trong tuần */}
              <Text
                style={[
                  styles.dayOfWeekText,
                  item.isWeekend && styles.dayOfWeekWeekend,
                  isSelected && styles.dayOfWeekSelected,
                ]}
              >
                {item.dayOfWeekName}
              </Text>

              {/* Vòng tròn số ngày: Màu xanh Apple tươi sáng khi chọn, KHÔNG CÓ Ô ĐEN */}
              <View
                style={[
                  styles.dayCircle,
                  hasMeetings && styles.dayCircleHasMeetings,
                  hasMeetings && { backgroundColor: getCalendarCardBackground(calendarColor), borderColor: getCalendarAccentColor(calendarColor) },
                  isToday && styles.dayCircleToday,
                  isSelected && styles.dayCircleSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    hasMeetings && styles.dayNumberHasMeetings,
                    isSelected && styles.dayNumberSelected,
                  ]}
                >
                  {item.dayNumber}
                </Text>

                {/* Huy hiệu số cuộc hẹn */}
                {hasMeetings && eventInfo > 1 && !isSelected && (
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
  },
  monthTitleText: {
    fontSize: 17, fontFamily: 'Roboto',
    color: '#0A2540',
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  dayItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayOfWeekText: {
    fontSize: 11.5, fontFamily: 'Roboto',
    color: '#94A3B8',
    marginBottom: 3,
  },
  dayOfWeekWeekend: {
    color: '#73889B',
  },
  dayOfWeekSelected: {
    color: '#008FCC',
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
    backgroundColor: '#EAF8FF',
    borderWidth: 1.5,
    borderColor: '#A9E5FF',
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: '#00ADFC',
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#EAF8FF',
  },
  todayButtonText: {
    color: '#008FCC',
    fontSize: 13, fontFamily: 'Roboto',
  },
  // Ô khi chọn: Đổi từ màu đen sang màu xanh Apple hiện đại
  dayCircleSelected: {
    backgroundColor: '#00ADFC',
    borderColor: '#00ADFC',
  },
  dayNumber: {
    fontSize: 14.5, fontFamily: 'Roboto',
    color: '#1E293B',
  },
  dayNumberHasMeetings: {
    color: '#008FCC',
  },
  dayNumberSelected: {
    color: '#FFFFFF',
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
});
