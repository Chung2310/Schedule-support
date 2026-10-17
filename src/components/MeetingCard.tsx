import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import { useCancelMeetingDialog } from './AppDialog';

import { isSameDay } from '../utils/dateUtils';

interface MeetingCardProps {
  meeting: Meeting;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDelete: (id: string) => void;
  onEdit: (meeting: Meeting) => void;
  showDateBadge?: boolean;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({
  meeting,
  onSimulateAlarm,
  onDelete,
  onEdit,
  showDateBadge = false,
}) => {
  const confirmCancelMeeting = useCancelMeetingDialog(onDelete);
  const meetingDate = new Date(meeting.meetingTime);

  const timeStr = meetingDate.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  let dateLabel = '';
  if (isSameDay(meetingDate, today)) {
    dateLabel = 'Hôm nay';
  } else if (isSameDay(meetingDate, tomorrow)) {
    dateLabel = 'Ngày mai';
  } else {
    dateLabel = `${String(meetingDate.getDate()).padStart(2, '0')}/${String(meetingDate.getMonth() + 1).padStart(2, '0')}`;
  }

  const isAcknowledged = meeting.status === 'ACKNOWLEDGED';
  const isReminding = meeting.status === 'REMINDING';

  const accentColor = isAcknowledged
    ? '#10B981'
    : isReminding
    ? '#EF4444'
    : '#0A2540';

  return (
    <View style={[styles.card, isAcknowledged && styles.cardDimmed]}>
      {/* Vạch màu chỉ thị bên trái */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      {/* Cột Giờ */}
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{timeStr}</Text>
        {showDateBadge ? (
          <View style={styles.dateBadgePill}>
            <Text style={styles.dateBadgePillText}>{dateLabel}</Text>
          </View>
        ) : (
          <Text style={styles.leadTimeText}>-{meeting.advanceNoticeMinutes}p</Text>
        )}
      </View>

      {/* Thông tin cuộc họp */}
      <View style={styles.contentColumn}>
        <Text style={styles.titleText} numberOfLines={1}>
          {meeting.title}
        </Text>
        <Text style={styles.subText} numberOfLines={1}>
          {isAcknowledged
            ? '✓ Đã xác nhận nhớ'
            : isReminding
            ? 'Đang báo thức...'
            : `Nhắc lại mỗi ${meeting.repeatIntervalMinutes}p`}
        </Text>
      </View>

      {/* Nút thao tác nhanh */}
      <View style={styles.actionColumn}>
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(meeting)} accessibilityRole="button" accessibilityLabel="Sửa cuộc họp">
          <Ionicons name="create-outline" size={20} color="#0A2540" />
        </TouchableOpacity>
        {!isAcknowledged && (
          <TouchableOpacity
            style={styles.testBtn}
            onPress={() => onSimulateAlarm(meeting)}
            accessibilityLabel="Thử chuông"
          >
            <Ionicons name="flash" size={15} color="#D97706" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => confirmCancelMeeting(meeting)}
          accessibilityLabel="Xóa"
        >
          <Ionicons name="close" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardDimmed: {
    opacity: 0.7,
  },
  accentBar: {
    width: 3.5,
    height: 34,
    borderRadius: 2,
    marginRight: 8,
  },
  timeColumn: {
    minWidth: 46,
  },
  timeText: {
    color: '#0F172A',
    fontSize: 15, fontFamily: 'Roboto',
    letterSpacing: -0.3,
  },
  leadTimeText: {
    color: '#64748B',
    fontSize: 11, fontFamily: 'Roboto',
    marginTop: 1,
  },
  dateBadgePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  dateBadgePillText: {
    color: '#1D4ED8',
    fontSize: 10, fontFamily: 'Roboto',
  },
  contentColumn: {
    flex: 1,
    paddingHorizontal: 6,
  },
  titleText: {
    color: '#0F172A',
    fontSize: 15, fontFamily: 'Roboto',
  },
  subText: {
    color: '#64748B',
    fontSize: 12, fontFamily: 'Roboto',
    marginTop: 2,
  },
  actionColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  testBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
