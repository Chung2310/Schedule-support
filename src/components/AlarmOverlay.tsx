import React, { useEffect, useRef } from 'react';
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

interface AlarmOverlayProps {
  visible: boolean;
  meeting: Meeting | null;
  onDismiss: () => void;
}

export const AlarmOverlay: React.FC<AlarmOverlayProps> = ({
  visible,
  meeting,
  onDismiss,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Hiệu ứng nhịp đập báo thức kiểu iPhone
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
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
          {/* Badge Báo thức iPhone */}
          <View style={styles.topBadge}>
            <Ionicons name="notifications" size={15} color="#D97706" />
            <Text style={styles.topBadgeText}>BÁO THỨC LỊCH HỌP</Text>
          </View>

          {/* Vòng tròn nhịp rung chuông Navy */}
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
            <Animated.View
              style={[
                styles.bellCircle,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Ionicons name="volume-high" size={44} color="#FFFFFF" />
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
              Đang phát âm: "{meeting.voiceText}"
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
              <Text style={styles.dismissTitle}>ĐÃ NHỚ</Text>
            </View>
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
    borderWidth: 2,
    borderColor: '#BFDBFE',
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
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  topBadgeText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bellWrapper: {
    width: 104,
    height: 104,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  rippleRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#93C5FD',
  },
  bellCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#0A2540',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#3B82F6',
  },
  bigTimeText: {
    fontSize: 46,
    fontWeight: '900',
    color: '#0A2540',
    letterSpacing: -1,
    marginBottom: 6,
  },
  meetingTitle: {
    fontSize: 21,
    fontWeight: '800',
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
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    fontStyle: 'italic',
  },
  repeatNotice: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  highlightText: {
    color: '#D97706',
    fontWeight: '800',
  },
  dismissButton: {
    width: '100%',
    backgroundColor: '#059669',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#34D399',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
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
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dismissSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
});
