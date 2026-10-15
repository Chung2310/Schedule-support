import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  AppState,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { STTService } from '../services/sttService';
import { parseVietnameseVoiceMeeting } from '../services/nlpParser';
import { AppSettings } from '../types/settings';

interface VoiceInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSaveMeeting: (data: {
    title: string;
    meetingTime: Date;
    advanceNoticeMinutes: number;
    repeatIntervalMinutes: number;
    voiceText: string;
  }) => void;
  initialText?: string;
  selectedDate: Date;
  settings: AppSettings;
}

export const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  visible,
  onClose,
  onSaveMeeting,
  initialText = '',
  selectedDate,
  settings,
}) => {
  const [transcript, setTranscript] = useState(initialText);
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Điều chỉnh thời gian nếu muốn
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState(0);

  const inputRef = useRef<TextInput>(null);

  // Animation trượt sheet nhẹ nhàng chuẩn iOS
  const [sheetSlideAnim] = useState(() => new Animated.Value(300));

  const isNativeSTT = STTService.isNativeAvailable();
  const stopListening = useCallback(() => {
    STTService.stopListening();
    setIsListening(false);
    setIsStarting(false);
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.timing(sheetSlideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') stopListening();
    });
    // Opening a calendar slot does not start the microphone. The user taps mic explicitly.
    return () => {
      subscription.remove();
      stopListening();
    };
  }, [visible, initialText, sheetSlideAnim, stopListening]);

  // Bộ phân tích ngôn ngữ tự nhiên chạy trực tiếp từ lời nói người dùng
  const parsed = useMemo(() => {
    if (!transcript.trim()) return null;
    return parseVietnameseVoiceMeeting(transcript.trim(), selectedDate);
  }, [transcript, selectedDate]);

  // Thời gian cuộc họp thực tế
  const effectiveMeetingDate = useMemo(() => {
    let baseDate: Date;
    if (parsed && parsed.datetime) {
      baseDate = new Date(parsed.datetime);
    } else {
      baseDate = new Date(selectedDate);
      baseDate.setHours(9, 0, 0, 0);
    }
    if (timeOffsetMinutes !== 0) {
      return new Date(baseDate.getTime() + timeOffsetMinutes * 60 * 1000);
    }
    return baseDate;
  }, [parsed, selectedDate, timeOffsetMinutes]);

  const effectiveTitle = useMemo(() => {
    if (parsed && parsed.title) return parsed.title;
    if (transcript.trim()) return transcript.trim();
    return 'Cuộc họp';
  }, [parsed, transcript]);

  // Bắt đầu thu âm giọng nói từ micro
  const startListening = async () => {
    if (isStarting) return;
    setErrorMessage(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // Trường hợp chạy trong Expo Go (chưa build native dev client)
    if (!isNativeSTT) {
      setIsListening(false);
      inputRef.current?.focus();
      return;
    }

    setIsStarting(true);
    const success = await STTService.startListening({
      onStart: () => {
        setIsStarting(false);
        setIsListening(true);
      },
      onResult: (text) => {
        setTranscript(text);
        setTimeOffsetMinutes(0);
      },
      onError: (err) => {
        setIsStarting(false);
        setIsListening(false);
        if (err === 'PERMISSION_DENIED') {
          setErrorMessage('Bạn có thể cấp quyền Micro và Nhận diện giọng nói trong Cài đặt thiết bị, hoặc nhập lịch bằng bàn phím.');
        } else {
          setErrorMessage('Không nhận diện được giọng nói. Bạn hãy bấm mic trên bàn phím nhé.');
          inputRef.current?.focus();
        }
      },
      onEnd: () => {
        setIsStarting(false);
        setIsListening(false);
      },
    });

    if (!success) {
      setIsStarting(false);
      setIsListening(false);
      inputRef.current?.focus();
    }
  };

  const handleClose = () => {
    stopListening();
    onClose();
  };

  const handleAdjustMinutes = (delta: number) => {
    setTimeOffsetMinutes((prev) => prev + delta);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  // Xác nhận lưu lịch
  const handleConfirm = () => {
    if (!transcript.trim()) return;

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    stopListening();

    const voiceSummary = `${effectiveMeetingDate.getHours()} giờ${
      effectiveMeetingDate.getMinutes() > 0 ? ` ${effectiveMeetingDate.getMinutes()} phút` : ''
    }. Họp: ${effectiveTitle}`;

    onSaveMeeting({
      title: effectiveTitle,
      meetingTime: effectiveMeetingDate,
      advanceNoticeMinutes: settings.defaultAdvanceNoticeMinutes || 15,
      repeatIntervalMinutes: settings.defaultRepeatIntervalMinutes || 5,
      voiceText: voiceSummary,
    });
  };

  const timeStr = effectiveMeetingDate.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const dateStr = effectiveMeetingDate.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });

  const hasContent = transcript.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            <Animated.View
              style={[
                styles.sheet,
                {
                  transform: [{ translateY: sheetSlideAnim }],
                },
              ]}
            >
              {/* Thanh kéo iOS */}
              <View style={styles.dragHandle} />

              {/* Tiêu đề & Nút đóng */}
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Thêm Lịch Hẹn</Text>
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Đóng"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              {/* Khu vực Micro đơn giản, rõ ràng */}
              <View style={styles.micContainer}>
                <TouchableOpacity
                  style={[
                    styles.micButton,
                    isListening && styles.micButtonListening,
                  ]}
                  onPress={isListening ? stopListening : startListening}
                  disabled={isStarting}
                  accessibilityRole="button"
                  accessibilityLabel={isListening ? 'Dừng nhận diện giọng nói' : 'Bắt đầu nhận diện giọng nói'}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isListening ? 'stop' : 'mic'}
                    size={28}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>

                <Text accessibilityLiveRegion="polite" style={[styles.micStatusText, isListening && styles.micStatusTextListening]}>
                  {isStarting ? 'Đang chuẩn bị micro…' : isListening ? 'Đang nghe · Bấm để dừng' : 'Bấm mic để nói hoặc nhập bằng bàn phím'}
                </Text>
                <Text style={styles.voicePrivacyText}>Dịch vụ nhận diện của thiết bị có thể xử lý âm thanh qua mạng. Đội phát triển không nhận hay lưu bản ghi âm.</Text>

                {errorMessage ? (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                ) : null}
              </View>

              {/* Ô hiển thị nội dung người dùng đọc / gõ */}
              <View style={styles.inputContainer}>
                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  value={transcript}
                  onChangeText={(text) => {
                    setTranscript(text);
                    setTimeOffsetMinutes(0);
                  }}
                  placeholder="Nội dung lịch hẹn..."
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                {hasContent ? (
                  <TouchableOpacity
                    onPress={() => {
                      setTranscript('');
                      setTimeOffsetMinutes(0);
                    }}
                    style={styles.clearBtn}
                  >
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Thông tin bóc tách được (Hiện phẳng, tối giản) */}
              {hasContent ? (
                <View style={styles.parsedInfoCard}>
                  {/* Dòng 1: Thời gian */}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Thời gian:</Text>
                    <View style={styles.infoValueGroup}>
                      <Text style={styles.timeBoldText}>{timeStr}</Text>
                      <Text style={styles.dateSubText}>({dateStr})</Text>

                      {/* Nút chỉnh nhanh +/- 15p */}
                      <View style={styles.adjustBtns}>
                        <TouchableOpacity
                          style={styles.adjustBtn}
                          onPress={() => handleAdjustMinutes(-15)}
                        >
                          <Text style={styles.adjustBtnText}>-15p</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.adjustBtn}
                          onPress={() => handleAdjustMinutes(15)}
                        >
                          <Text style={styles.adjustBtnText}>+15p</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Dòng 2: Nội dung */}
                  <View style={[styles.infoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <Text style={styles.infoLabel}>Nội dung:</Text>
                    <Text style={styles.titleBoldText} numberOfLines={2}>
                      {effectiveTitle}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Nút Xác nhận duy nhất */}
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  !hasContent && styles.confirmBtnDisabled,
                ]}
                disabled={!hasContent}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>
                  {hasContent ? `Xác Nhận (${timeStr})` : 'Xác Nhận'}
                </Text>
              </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '95%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  formScroll: { flexShrink: 1 },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A2540',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  micButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0A2540',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonListening: {
    backgroundColor: '#DC2626',
  },
  micStatusText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  micStatusTextListening: {
    color: '#DC2626',
    fontWeight: '600',
  },
  voicePrivacyText: { fontSize: 12, lineHeight: 17, color: '#64748B', textAlign: 'center', marginTop: 6, maxWidth: 340 },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
    textAlign: 'center',
  },
  dictationGuideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  dictationGuideText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1E40AF',
    lineHeight: 18,
  },
  dictationGuideBold: {
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  textInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    minHeight: 38,
  },
  clearBtn: {
    padding: 4,
  },
  parsedInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  infoLabel: {
    width: 75,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValueGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeBoldText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A2540',
  },
  dateSubText: {
    fontSize: 13,
    color: '#475569',
  },
  adjustBtns: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  adjustBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  adjustBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0A2540',
  },
  titleBoldText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
  },
  confirmBtn: {
    backgroundColor: '#0A2540',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
