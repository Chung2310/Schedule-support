import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParsedMeetingResult } from '../services/nlpParser';
import { AppSettings } from '../types/settings';

interface MeetingConfirmModalProps {
  visible: boolean;
  parsedData: ParsedMeetingResult | null;
  settings: AppSettings;
  onClose: () => void;
  onConfirm: (data: {
    title: string;
    meetingTime: Date;
    advanceNoticeMinutes: number;
    repeatIntervalMinutes: number;
    voiceText: string;
  }) => void;
}

export const MeetingConfirmModal: React.FC<MeetingConfirmModalProps> = (props) => {
  if (!props.visible || !props.parsedData) return null;
  return <MeetingConfirmForm key={`${props.parsedData.title}-${props.parsedData.datetime}`} {...props} />;
};

const MeetingConfirmForm: React.FC<MeetingConfirmModalProps> = ({
  visible,
  parsedData,
  settings,
  onClose,
  onConfirm,
}) => {
  const [title, setTitle] = useState(parsedData?.title ?? '');
  const [date, setDate] = useState<Date>(() => parsedData ? new Date(parsedData.datetime) : new Date());
  const [advanceNotice] = useState(settings.defaultAdvanceNoticeMinutes || 15);
  const [repeatInterval] = useState(settings.defaultRepeatIntervalMinutes || 5);

  if (!parsedData) return null;

  const dateStr = date.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });

  const timeStr = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const computedVoiceText = `${date.getHours()} giờ${
    date.getMinutes() > 0 ? ` ${date.getMinutes()} phút` : ''
  }. Họp: ${title}`;

  // Nút nhanh +/- 15 phút
  const adjustMinutes = (delta: number) => {
    setDate((prev) => new Date(prev.getTime() + delta * 60 * 1000));
  };

  const handleSave = () => {
    onConfirm({
      title: title.trim() || 'Họp',
      meetingTime: date,
      advanceNoticeMinutes: advanceNotice,
      repeatIntervalMinutes: repeatInterval,
      voiceText: computedVoiceText,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header gọn */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Xác Nhận Lịch</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Khối Giờ & Ngày to bản */}
          <View style={styles.timeCard}>
            <View>
              <Text style={styles.timeBig}>{timeStr}</Text>
              <Text style={styles.dateLabel}>{dateStr}</Text>
            </View>

            <View style={styles.adjustRow}>
              <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustMinutes(-15)}>
                <Text style={styles.adjustBtnText}>-15p</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustMinutes(+15)}>
                <Text style={styles.adjustBtnText}>+15p</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Ô nhập tên cuộc họp */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Nội dung cuộc họp..."
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Tóm tắt báo trước */}
          <View style={styles.metaRow}>
            <Ionicons name="notifications-outline" size={14} color="#64748B" />
            <Text style={styles.metaText}>
              Báo trước {advanceNotice}p • Nhắc lại mỗi {repeatInterval}p
            </Text>
          </View>

          {/* Nút lưu 1 chạm */}
          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.85}
            onPress={handleSave}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>LƯU LỊCH</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 25, 47, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0A2540',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeBig: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0A2540',
    letterSpacing: -0.5,
  },
  dateLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  adjustBtnText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  inputCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  textInput: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: '#0A2540',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 15,
    borderRadius: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
