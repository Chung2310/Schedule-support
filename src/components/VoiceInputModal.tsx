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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { STTService } from '../services/sttService';
import { parseVietnameseVoiceMeeting } from '../services/nlpParser';
import { AppSettings } from '../types/settings';
import type { Meeting } from '../types/meeting';
import { voiceEditCommand, voiceEditFields } from '../services/voiceMeetingCommand';
import { applyMeetingEdit, type MeetingEditFields } from '../utils/meetingEdit';
import { findMeetingTimeConflict, meetingConflictMessage, meetingMinute } from '../utils/meetingConflict';

interface VoiceInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSaveMeeting: (data: {
    title: string;
    meetingTime: Date;
    advanceNoticeMinutes: number;
    repeatIntervalMinutes: number;
    voiceText: string;
  }) => Promise<void>;
  initialText?: string;
  selectedDate: Date;
  settings: AppSettings;
  meetings: Meeting[];
  onEditMeeting: (fields: MeetingEditFields, meeting: Meeting) => Promise<void>;
}

export const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  visible,
  onClose,
  onSaveMeeting,
  initialText = '',
  selectedDate,
  settings,
  meetings,
  onEditMeeting,
}) => {
  const [transcript, setTranscript] = useState(initialText);
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chosenMeeting, setChosenMeeting] = useState<{ transcript: string; id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const commandNow = useMemo(() => { void transcript; return new Date(); }, [transcript]);
  const editCommand = useMemo(() => voiceEditCommand(transcript, meetings, commandNow), [transcript, meetings, commandNow]);
  const editTarget = editCommand?.candidates.length === 1 ? editCommand.candidates[0]
    : chosenMeeting?.transcript === transcript ? editCommand?.candidates.find(m => m.id === chosenMeeting.id) : undefined;
  const editPreview = useMemo(() => {
    if (!editCommand || !editTarget) return null;
    try {
      const fields = voiceEditFields(editCommand, editTarget, commandNow);
      return { fields, meeting: applyMeetingEdit(editTarget, fields, commandNow), error: null };
    } catch (error) {
      return { fields: null, meeting: null, error: error instanceof Error ? error.message : 'Chưa hiểu yêu cầu sửa lịch.' };
    }
  }, [editCommand, editTarget, commandNow]);

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
    setIsFinishing(false);
  }, []);

  useEffect(() => {
    if (!isFinishing) return;
    const timeout = setTimeout(() => {
      stopListening();
      setErrorMessage('Chưa nhận được kết quả cuối. Bạn có thể sửa văn bản bên dưới hoặc bấm mic để thử lại.');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [isFinishing, stopListening]);

  const finishListening = async () => {
    setIsFinishing(true);
    try {
      await STTService.finishListening();
    } catch {
      stopListening();
      setErrorMessage('Không thể hoàn tất nhận diện. Bạn hãy thử lại hoặc nhập bằng bàn phím.');
    }
  };

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
    // Opening a calendar slot does not start the microphone. The user taps mic explicitly.
    return () => {
      stopListening();
    };
  }, [visible, sheetSlideAnim, stopListening]);

  // Bộ phân tích ngôn ngữ tự nhiên chạy trực tiếp từ lời nói người dùng
  const parsed = useMemo(() => {
    if (!transcript.trim()) return null;
    return parseVietnameseVoiceMeeting(transcript.trim(), new Date(), selectedDate);
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

  const timeConflict = useMemo(() => {
    if (!transcript.trim()) return undefined;
    if (editCommand) {
      if (!editPreview?.meeting || !editTarget ||
          meetingMinute(editPreview.meeting.meetingTime) === meetingMinute(editTarget.meetingTime)) return undefined;
      return findMeetingTimeConflict(meetings, editPreview.meeting.meetingTime, editTarget.id);
    }
    if (!Number.isFinite(effectiveMeetingDate.getTime())) return undefined;
    return findMeetingTimeConflict(meetings, effectiveMeetingDate.toISOString());
  }, [transcript, editCommand, editPreview, editTarget, meetings, effectiveMeetingDate]);

  const effectiveTitle = useMemo(() => {
    if (parsed && parsed.title) return parsed.title;
    if (transcript.trim()) return transcript.trim();
    return 'Cuộc họp';
  }, [parsed, transcript]);

  // Bắt đầu thu âm giọng nói từ micro
  const startListening = async () => {
    if (isStarting || isFinishing || isListening) return;
    setErrorMessage(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // Trường hợp chạy trong Expo Go (chưa build native dev client)
    if (Platform.OS !== 'web' && !isNativeSTT) {
      setIsListening(false);
      setErrorMessage('Bản ứng dụng này chưa hỗ trợ nhận diện giọng nói. Hãy dùng bản cài đầy đủ để thử mic, hoặc nhập bằng bàn phím.');
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
      onFinishing: () => {
        setIsFinishing(true);
      },
      onError: (err) => {
        stopListening();
        const code = typeof err === 'string' ? err : err?.error;
        if (code === 'PERMISSION_DENIED' || code === 'not-allowed') {
          setErrorMessage('Bạn có thể cấp quyền Micro và Nhận diện giọng nói trong Cài đặt thiết bị, hoặc nhập lịch bằng bàn phím.');
        } else if (code === 'UNAVAILABLE' || code === 'service-not-allowed' || code === 'language-not-supported') {
          setErrorMessage('Thiết bị chưa có dịch vụ nhận diện tiếng Việt khả dụng. Hãy kiểm tra dịch vụ giọng nói trong cài đặt thiết bị.');
        } else if (code === 'no-speech') {
          setErrorMessage('Chưa nghe rõ lời nói. Bấm mic và nói lại gần điện thoại hơn.');
        } else if (code === 'NO_RESULT') {
          setErrorMessage('Chưa nhận được lời nói. Bấm mic để nói lại hoặc nhập lịch bằng bàn phím.');
        } else if (code === 'START_ENDED' || code === 'START_TIMEOUT') {
          setErrorMessage(`Dịch vụ giọng nói chưa bật được micro (${code}). Hãy kiểm tra dịch vụ nhận diện giọng nói và thử lại.`);
        } else if (code === 'APP_BACKGROUND' || code === 'APP_NOT_ACTIVE') {
          setErrorMessage(`Phiên micro bị gián đoạn khi ứng dụng chuyển màn hình (${code}). Bấm mic để thử lại khi đang ở màn hình này.`);
        } else if (code === 'audio-capture') {
          setErrorMessage('Không mở được micro. Hãy kiểm tra quyền micro và đóng ứng dụng khác đang dùng micro rồi thử lại.');
        } else if (code === 'network') {
          setErrorMessage('Không kết nối được dịch vụ nhận diện. Kiểm tra Internet rồi thử lại.');
        } else {
          setErrorMessage(`Không nhận diện được giọng nói${code ? ` (${code})` : ''}. Bạn có thể bấm mic để thử lại hoặc nhập bằng bàn phím.`);
        }
      },
      onEnd: () => {
        setIsStarting(false);
        setIsListening(false);
        setIsFinishing(false);
      },
    });

    if (!success) {
      setIsStarting(false);
      setIsListening(false);
      setErrorMessage((previous) => previous ?? 'Không khởi động được micro. Bấm mic để thử lại.');
    }
  };

  const handleClose = () => {
    if (savingRef.current) return;
    stopListening();
    onClose();
  };

  const handleAdjustMinutes = (delta: number) => {
    setTimeOffsetMinutes((prev) => prev + delta);
    setErrorMessage(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  // Xác nhận lưu lịch
  const handleConfirm = async () => {
    if (!transcript.trim() || isStarting || isListening || isFinishing || savingRef.current || timeConflict) return;
    if (editCommand) {
      if (!editPreview?.fields || !editTarget) return;
      savingRef.current = true;
      setSaving(true);
      setErrorMessage(null);
      try { await onEditMeeting(editPreview.fields, editTarget); }
      catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Chưa lưu được thay đổi.'); }
      finally { savingRef.current = false; setSaving(false); }
      return;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    stopListening();

    const voiceSummary = `${effectiveMeetingDate.getHours()} giờ${
      effectiveMeetingDate.getMinutes() > 0 ? ` ${effectiveMeetingDate.getMinutes()} phút` : ''
    }. ${effectiveTitle}`;

    savingRef.current = true;
    setSaving(true);
    setErrorMessage(null);
    try {
      await onSaveMeeting({
        title: effectiveTitle,
        meetingTime: effectiveMeetingDate,
        advanceNoticeMinutes: settings.defaultAdvanceNoticeMinutes || 15,
        repeatIntervalMinutes: settings.defaultRepeatIntervalMinutes || 5,
        voiceText: voiceSummary,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Chưa lưu được lịch hẹn.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
  const speechBusy = isStarting || isListening || isFinishing;
  const canConfirm = hasContent && !speechBusy && !saving && !timeConflict && (!editCommand || !!editPreview?.meeting);

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
                <Text style={styles.headerTitle}>{editCommand ? 'Sửa Lịch Hẹn' : 'Thêm Lịch Hẹn'}</Text>
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
                  onPress={isListening ? finishListening : startListening}
                  disabled={isStarting || isFinishing || saving}
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

                {speechBusy ? (
                  <Text accessibilityLiveRegion="polite" style={[styles.micStatusText, isListening && styles.micStatusTextListening]}>
                    {isStarting ? 'Đang chuẩn bị micro…' : isFinishing ? 'Đang hoàn tất nhận diện…' : 'Đang nghe…'}
                  </Text>
                ) : null}

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
                  editable={!speechBusy && !saving}
                  onChangeText={(text) => {
                    setTranscript(text);
                    setTimeOffsetMinutes(0);
                    setErrorMessage(null);
                  }}
                  placeholder="Nội dung cuộc họp"
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                {hasContent && !speechBusy && !saving ? (
                  <TouchableOpacity
                    onPress={() => {
                      setTranscript('');
                      setTimeOffsetMinutes(0);
                      setErrorMessage(null);
                    }}
                    style={styles.clearBtn}
                  >
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Thông tin bóc tách được (Hiện phẳng, tối giản) */}
              {editCommand && hasContent ? (
                <View style={styles.parsedInfoCard}>
                  {editCommand.error ? <Text style={styles.errorText}>{editCommand.error}</Text> : !editCommand.candidates.length ? <Text style={styles.errorText}>Không tìm thấy cuộc họp phù hợp. Hãy nói rõ tên hoặc giờ họp cần sửa.</Text> : null}
                  {editCommand.candidates.length > 1 ? <Text style={styles.infoLabel}>Chọn lịch:</Text> : null}
                  {editCommand.candidates.map(meeting => (
                    <TouchableOpacity key={meeting.id} disabled={speechBusy || saving}
                      accessibilityRole="button" accessibilityState={{ selected: editTarget?.id === meeting.id }}
                      style={{ paddingVertical: 12 }} onPress={() => setChosenMeeting({ transcript, id: meeting.id })}>
                      <Text style={styles.titleBoldText}>{editTarget?.id === meeting.id ? '✓ ' : ''}{meeting.title}</Text>
                      <Text style={styles.dateSubText}>{new Date(meeting.meetingTime).toLocaleString('vi-VN')}</Text>
                    </TouchableOpacity>
                  ))}
                  {editPreview?.error ? <Text style={styles.errorText}>{editPreview.error}</Text> : null}
                  {editPreview?.meeting ? <View>
                    <Text style={styles.timeBoldText}>Sau khi sửa</Text>
                    <Text style={styles.titleBoldText}>{editPreview.meeting.title}</Text>
                    <Text style={styles.dateSubText}>{new Date(editPreview.meeting.meetingTime).toLocaleString('vi-VN')}</Text>
                    <Text style={styles.dateSubText}>Báo trước {editPreview.meeting.advanceNoticeMinutes} phút · Nhắc lại {editPreview.meeting.repeatIntervalMinutes} phút</Text>
                  </View> : null}
                </View>
              ) : hasContent ? (
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
              {timeConflict && !speechBusy ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                {meetingConflictMessage(timeConflict)}
              </Text> : null}
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  !canConfirm && styles.confirmBtnDisabled,
                ]}
                disabled={!canConfirm}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>
                  {saving ? 'Đang chuẩn bị giọng đọc…' : editCommand ? 'Lưu thay đổi' : hasContent ? `Xác Nhận (${timeStr})` : 'Xác Nhận'}
                </Text>
              </TouchableOpacity>
              {saving ? <Text style={styles.savingHint}>Giữ app mở đến khi hoàn tất để bật giọng đọc nhắc lịch khi khóa màn hình.</Text> : null}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  savingHint: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center' },
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
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
    textAlign: 'center',
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
