import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Meeting } from '../types/meeting';
import { ListeningFace } from './ListeningFace';

interface AlarmOverlayProps {
  visible: boolean;
  meeting: Meeting | null;
  onDismiss: () => void;
  onReschedule: (meeting: Meeting) => void;
}

export const AlarmOverlay: React.FC<AlarmOverlayProps> = ({
  visible,
  meeting,
  onDismiss,
  onReschedule,
}) => {
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [rippleAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      // Hiệu ứng nhịp đập báo thức kiểu iPhone
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );

      const rippleLoop = Animated.loop(
        Animated.timing(rippleAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      );

      pulseLoop.start();
      rippleLoop.start();

      return () => {
        pulseLoop.stop();
        rippleLoop.stop();
      };
    }
  }, [visible, pulseAnim, rippleAnim]);

  if (!meeting || !visible) return null;

  const meetingDate = new Date(meeting.meetingTime);
  const timeStr = meetingDate.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const rippleScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });

  const rippleOpacity = rippleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 0.25, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.contentContainer}>
          {/* Nhân vật đang phát âm theo cùng phong cách màn hình thu âm */}
          <View style={styles.bellWrapper}>
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  transform: [{ scale: rippleScale }],
                  opacity: rippleOpacity,
                },
              ]}
            />
            <Animated.View style={[styles.characterPulse, { transform: [{ scale: pulseAnim }] }]}>
              <ListeningFace active size={190} />
            </Animated.View>
          </View>

          {/* Giờ cuộc họp to bản phong cách màn hình khóa iPhone */}
          <Text style={styles.bigTimeText}>{timeStr}</Text>

          {/* Tiêu đề cuộc họp */}
          <Text style={styles.meetingTitle}>{meeting.title}</Text>

          {/* Hộp phát âm thanh đọc nội dung */}
          <View style={styles.voiceBubble}>
            <Ionicons name="mic-circle" size={22} color="#0A2540" />
            <Text style={styles.voiceText}>
              Đang phát âm: “{meeting.voiceText}”
            </Text>
          </View>

          {/* Thông tin chu kỳ lặp gọn */}
          <Text style={styles.repeatNotice}>
            Tự động lặp lại sau {meeting.repeatIntervalMinutes || 5} phút
          </Text>

          {/* NÚT BẤM DỪNG NHẮC / ĐÃ NHỚ - CHÍNH THEO YÊU CẦU */}
          <TouchableOpacity
            style={styles.dismissButton}
            activeOpacity={0.85}
            onPress={onDismiss}
          >
            <View style={styles.dismissInner}>
              <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
              <Text style={styles.dismissTitle}>Đã nhớ</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rescheduleButton}
            activeOpacity={0.85}
            onPress={() => onReschedule(meeting)}
            accessibilityRole="button"
            accessibilityLabel="Đặt lại lịch hẹn"
          >
            <Ionicons name="calendar-outline" size={20} color="#0A2540" />
            <Text style={styles.rescheduleText}>Đặt lại lịch</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 25, 47, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  contentContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 26,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.35,
        shadowRadius: 32,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  bellWrapper: {
    width: 220,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  rippleRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#DCEFFF',
  },
  characterPulse: { alignItems: 'center', justifyContent: 'center' },
  bigTimeText: {
    fontSize: 46, fontFamily: 'Roboto',
    color: '#0A2540',
    letterSpacing: -1,
    marginBottom: 6,
  },
  meetingTitle: {
    fontSize: 21, fontFamily: 'Roboto',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 28,
  },
  voiceBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 14,
    width: '100%',
  },
  voiceText: {
    color: '#0A2540',
    fontSize: 13, fontFamily: 'Roboto',
    flex: 1,
    fontStyle: 'italic',
  },
  repeatNotice: {
    color: '#64748B',
    fontSize: 13, fontFamily: 'Roboto',
    textAlign: 'center',
    marginBottom: 24,
  },
  highlightText: {
    color: '#D97706',
  },
  dismissButton: {
    width: '100%',
    backgroundColor: '#00ADFC',
    borderRadius: 999,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#008FCC',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  dismissInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  buttonTextWrapper: {
    flex: 1,
  },
  dismissTitle: {
    color: '#FFFFFF',
    fontSize: 15, fontFamily: 'Roboto',
    letterSpacing: 0.2,
  },
  rescheduleButton: {
    width: '100%',
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
  },
  rescheduleText: {
    color: '#0A2540',
    fontSize: 15,
    fontFamily: 'Roboto',
  },
  dismissSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11, fontFamily: 'Roboto',
    marginTop: 2,
  },
});
