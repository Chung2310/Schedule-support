import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import { MeetingCard } from './MeetingCard';

interface DayDetailViewProps {
  date: Date;
  meetings: Meeting[];
  onBack: () => void;
  onAddMeeting: () => void;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
}

export const DayDetailView: React.FC<DayDetailViewProps> = ({
  date,
  meetings,
  onBack,
  onAddMeeting,
  onSimulateAlarm,
  onDeleteMeeting,
}) => {
  const dayOfWeek = date.toLocaleDateString('vi-VN', { weekday: 'long' });
  const dayNumber = date.getDate();
  const monthName = date.toLocaleDateString('vi-VN', { month: 'long' });

  return (
    <View style={styles.container}>
      {/* Thanh điều hướng quay lại Lịch Tháng */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#0A2540" />
          <Text style={styles.backButtonText}>Lịch Tháng</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addIconBtn} onPress={onAddMeeting} activeOpacity={0.7}>
          <Ionicons name="add" size={22} color="#0A2540" />
        </TouchableOpacity>
      </View>

      {/* Header Ngày to rõ, phong cách Apple Calendar */}
      <View style={styles.dateHeader}>
        <View style={styles.bigDayBox}>
          <Text style={styles.bigDayNumber}>{dayNumber}</Text>
          <View style={styles.dayDetails}>
            <Text style={styles.bigDayOfWeek}>{dayOfWeek}</Text>
            <Text style={styles.monthYearText}>{monthName}, {date.getFullYear()}</Text>
          </View>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{meetings.length} cuộc hẹn</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollList}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {meetings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>Ngày này chưa có lịch hẹn</Text>
            <Text style={styles.emptySubtitle}>
              Chạm vào nút bên dưới hoặc nói một câu để thêm cuộc hẹn mới
            </Text>

            <TouchableOpacity
              style={styles.emptyAddButton}
              onPress={onAddMeeting}
              activeOpacity={0.85}
            >
              <Ionicons name="mic" size={18} color="#FFFFFF" />
              <Text style={styles.emptyAddButtonText}>Nói để thêm lịch ngày này</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.meetingsList}>
            {meetings.map((item) => (
              <MeetingCard
                key={item.id}
                meeting={item}
                onSimulateAlarm={onSimulateAlarm}
                onDelete={onDeleteMeeting}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Nút hành động nổi ở đáy màn hình chi tiết */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.floatingVoiceBtn}
          activeOpacity={0.88}
          onPress={onAddMeeting}
        >
          <Ionicons name="mic" size={20} color="#FFFFFF" />
          <Text style={styles.floatingVoiceBtnText}>Thêm lịch bằng giọng nói</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingRight: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#0A2540',
    fontWeight: '700',
  },
  addIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  bigDayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bigDayNumber: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0A2540',
    letterSpacing: -1,
  },
  dayDetails: {
    justifyContent: 'center',
  },
  bigDayOfWeek: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'capitalize',
  },
  monthYearText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  meetingsList: {
    gap: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A2540',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginTop: 20,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0A2540',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#0A2540',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  floatingVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
