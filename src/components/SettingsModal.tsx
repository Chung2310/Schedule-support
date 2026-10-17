import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { SpeechService } from '../services/speechService';
import { MeetingVoice, type NotificationVoice } from '../services/meetingVoice';
import { PrivacyPolicyContent } from './PrivacyPolicyContent';
import { legalDocuments, LegalDocumentId } from '../content/legal-documents';

interface SettingsModalProps {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onTestNotification?: (settings: AppSettings) => Promise<void>;
  onRefreshWidget?: () => Promise<boolean>;
}

const PRESET_LEAD_TIMES = [5, 10, 15, 30];
const PRESET_REPEAT_INTERVALS = [2, 5, 10];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  settings,
  onClose,
  onSave,
  onTestNotification,
  onRefreshWidget,
}) => {
  const [leadTime, setLeadTime] = useState(settings.defaultAdvanceNoticeMinutes ?? 15);
  const [repeatInterval, setRepeatInterval] = useState(settings.defaultRepeatIntervalMinutes ?? 5);
  const [dailyBriefingHour, setDailyBriefingHour] = useState((settings.dailyBriefingTime ?? DEFAULT_SETTINGS.dailyBriefingTime).split(':')[0] ?? '07');
  const [dailyBriefingMinute, setDailyBriefingMinute] = useState((settings.dailyBriefingTime ?? DEFAULT_SETTINGS.dailyBriefingTime).split(':')[1] ?? '00');
  const [dailyBriefingTimeError, setDailyBriefingTimeError] = useState('');
  const [stopOnMeetingStart, setStopOnMeetingStart] = useState(settings.stopOnMeetingStart ?? true);
  const [hapticEnabled, setHapticEnabled] = useState(settings.hapticEnabled ?? true);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [isPreparingBackgroundTest, setIsPreparingBackgroundTest] = useState(false);
  const preparingBackgroundTestRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [speechVoice, setSpeechVoice] = useState(settings.speechVoice);
  const [availableVoices, setAvailableVoices] = useState<NotificationVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const [isRefreshingWidget, setIsRefreshingWidget] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let isCurrent = true;
    void MeetingVoice.getAvailableVoices()
      .then((voices) => {
        if (isCurrent) setAvailableVoices(voices);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingVoices(false);
      });
    return () => {
      isCurrent = false;
      void SpeechService.stop();
    };
  }, [visible]);

  const handleTestTTS = async () => {
    if (isPlayingTest) {
      await SpeechService.stop();
      setIsPlayingTest(false);
      return;
    }
    setIsPlayingTest(true);
    await SpeechService.speakVoiceReminder('14 giờ, họp giao ban ban giám đốc', {
      rate: settings.speechRate || 0.95,
      pitch: settings.speechPitch || 1.0,
      voice: speechVoice,
      onStart: () => setIsPlayingTest(true),
      onDone: () => setIsPlayingTest(false),
      onStopped: () => setIsPlayingTest(false),
      onError: () => setIsPlayingTest(false),
    });
  };

  const handleBackgroundVoiceTest = async () => {
    if (!onTestNotification || preparingBackgroundTestRef.current || savingRef.current) return;
    preparingBackgroundTestRef.current = true;
    setIsPreparingBackgroundTest(true);
    try {
      await SpeechService.stop();
      setIsPlayingTest(false);
      await onTestNotification({ ...settings, speechVoice });
      Alert.alert('Đã đặt thông báo thử sau 15 giây',
        'Bây giờ hãy về màn hình chính hoặc khóa máy. Bật chuông, tăng âm lượng chuông và tắt chế độ Tập trung để nghe thử.');
    } catch (error) {
      Alert.alert('Chưa bật được giọng đọc nền', error instanceof Error ? error.message : 'Không đặt được thông báo thử. Hãy thử lại.');
    } finally {
      preparingBackgroundTestRef.current = false;
      setIsPreparingBackgroundTest(false);
    }
  };

  const handleDone = async () => {
    if (savingRef.current || preparingBackgroundTestRef.current) return;
    const hour = Number(dailyBriefingHour);
    const minute = Number(dailyBriefingMinute);
    if (!/^\d{1,2}$/.test(dailyBriefingHour) || !/^\d{1,2}$/.test(dailyBriefingMinute) ||
        hour > 23 || minute > 59) {
      setDailyBriefingTimeError('Giờ từ 0 đến 23 và phút từ 0 đến 59.');
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({
        ...settings,
        dailyBriefingTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        defaultAdvanceNoticeMinutes: leadTime,
        defaultRepeatIntervalMinutes: repeatInterval,
        speechVoice,
        stopOnMeetingStart,
        hapticEnabled,
      });
    } catch {
      Alert.alert('Chưa cập nhật xong nhắc lịch', 'Hãy giữ ứng dụng mở và thử lưu lại cài đặt.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDailyBriefingHour(DEFAULT_SETTINGS.dailyBriefingTime.split(':')[0] ?? '07');
    setDailyBriefingMinute(DEFAULT_SETTINGS.dailyBriefingTime.split(':')[1] ?? '00');
    setDailyBriefingTimeError('');
    setLeadTime(DEFAULT_SETTINGS.defaultAdvanceNoticeMinutes);
    setRepeatInterval(DEFAULT_SETTINGS.defaultRepeatIntervalMinutes);
    setSpeechVoice(DEFAULT_SETTINGS.speechVoice);
    setStopOnMeetingStart(DEFAULT_SETTINGS.stopOnMeetingStart);
    setHapticEnabled(DEFAULT_SETTINGS.hapticEnabled);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {
      if (savingRef.current || preparingBackgroundTestRef.current) return;
      if (legalDocument) setLegalDocument(null);
      else onClose();
    }}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {legalDocument ? <PrivacyPolicyContent key={legalDocument} document={legalDocument} onBack={() => setLegalDocument(null)} /> : <>
          {/* Header tối giản kiểu iOS */}
          <View style={styles.header}>
            <Text style={styles.title}>Cài Đặt</Text>
            <TouchableOpacity
              onPress={handleDone}
              disabled={isSaving || isPreparingBackgroundTest}
              style={styles.doneBtn}
              activeOpacity={0.7}
              accessibilityLabel="Xong"
            >
              <Text style={styles.doneBtnText}>{isSaving ? 'Đang lưu…' : 'Xong'}</Text>
            </TouchableOpacity>
          </View>

          {isSaving ? <Text style={styles.voiceStatus}>Đang chuẩn bị giọng đọc. Giữ ứng dụng mở đến khi hoàn tất.</Text> : null}
          <ScrollView pointerEvents={isSaving ? 'none' : 'auto'} style={styles.settingsScroll} contentContainerStyle={styles.settingsContent}>
          {/* Group 1: Nhắc lịch & Báo thức */}
          <View style={styles.groupCard}>
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="sunny-outline" size={17} color="#0A2540" />
                <View style={styles.briefingLabelGroup}>
                  <Text style={styles.rowLabel}>Nhắc lịch tổng thể</Text>
                  <Text style={styles.briefingHint}>Đọc lịch hôm nay (24 giờ)</Text>
                </View>
              </View>
              <View style={styles.briefingTimeFields}>
                <TextInput
                  value={dailyBriefingHour}
                  onChangeText={(value) => {
                    setDailyBriefingHour(value.replace(/\D/g, '').slice(0, 2));
                    setDailyBriefingTimeError('');
                  }}
                  style={styles.briefingTimeInput}
                  placeholder="07"
                  keyboardType="numeric"
                  maxLength={2}
                  selectTextOnFocus
                  accessibilityLabel="Giờ nhắc lịch tổng thể"
                  returnKeyType="next"
                />
                <Text style={styles.briefingTimeSeparator}>:</Text>
                <TextInput
                  value={dailyBriefingMinute}
                  onChangeText={(value) => {
                    setDailyBriefingMinute(value.replace(/\D/g, '').slice(0, 2));
                    setDailyBriefingTimeError('');
                  }}
                  style={styles.briefingTimeInput}
                  placeholder="00"
                  keyboardType="numeric"
                  maxLength={2}
                  selectTextOnFocus
                  accessibilityLabel="Phút nhắc lịch tổng thể"
                  returnKeyType="done"
                />
              </View>
            </View>
            {dailyBriefingTimeError ? <Text style={styles.briefingTimeError}>{dailyBriefingTimeError}</Text> : null}

            <View style={styles.divider} />

            {/* Hàng 1: Báo trước */}
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="time-outline" size={17} color="#0A2540" />
                <Text style={styles.rowLabel}>Báo trước</Text>
              </View>
              <View style={styles.segmentedControl}>
                {PRESET_LEAD_TIMES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.segmentChip,
                      leadTime === m && styles.segmentChipActive,
                    ]}
                    onPress={() => setLeadTime(m)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        leadTime === m && styles.segmentTextActive,
                      ]}
                    >
                      {m}p
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Hàng 2: Nhắc lại */}
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="repeat-outline" size={17} color="#0A2540" />
                <Text style={styles.rowLabel}>Nhắc lại mỗi</Text>
              </View>
              <View style={styles.segmentedControl}>
                {PRESET_REPEAT_INTERVALS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.segmentChip,
                      repeatInterval === m && styles.segmentChipActive,
                    ]}
                    onPress={() => setRepeatInterval(m)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        repeatInterval === m && styles.segmentTextActive,
                      ]}
                    >
                      {m}p
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Hàng 3: Dừng khi tới giờ họp */}
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="flag-outline" size={17} color="#0A2540" />
                <Text style={styles.rowLabel}>Dừng khi tới giờ họp</Text>
              </View>
              <Switch
                value={stopOnMeetingStart}
                onValueChange={setStopOnMeetingStart}
                trackColor={{ false: '#E2E8F0', true: '#0A2540' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Hàng 4: Rung báo thức */}
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="phone-portrait-outline" size={17} color="#0A2540" />
                <Text style={styles.rowLabel}>Rung báo thức</Text>
              </View>
              <Switch
                value={hapticEnabled}
                onValueChange={setHapticEnabled}
                trackColor={{ false: '#E2E8F0', true: '#0A2540' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Group 2: Giọng đọc */}
          <View style={styles.groupCard}>
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="volume-high-outline" size={17} color="#0A2540" />
                <Text style={styles.rowLabel}>Giọng đọc thông báo</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.audioTestPill,
                  isPlayingTest && styles.audioTestPillActive,
                ]}
                onPress={handleTestTTS}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isPlayingTest ? 'stop-circle' : 'play'}
                  size={13}
                  color={isPlayingTest ? '#EF4444' : '#0A2540'}
                />
                <Text
                  style={[
                    styles.audioTestText,
                    isPlayingTest && styles.audioTestTextActive,
                  ]}
                >
                  {isPlayingTest ? 'Đang phát' : 'Nghe thử'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.voiceHint}>Chọn giọng tiếng Việt. Bạn có thể nghe thử trước khi lưu.</Text>
            {onTestNotification && Platform.OS !== 'web' ? <>
              <TouchableOpacity
                style={styles.backgroundTestButton}
                onPress={() => { void handleBackgroundVoiceTest(); }}
                disabled={isPreparingBackgroundTest}
                accessibilityRole="button"
                accessibilityState={{ disabled: isPreparingBackgroundTest, busy: isPreparingBackgroundTest }}
              >
                <Ionicons name="notifications-outline" size={17} color="#0A2540" />
                <Text style={styles.backgroundTestText}>
                  {isPreparingBackgroundTest ? 'Đang chuẩn bị giọng đọc…' : 'Thử giọng đọc khi khóa màn hình'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.voiceHint}>Đợi báo đã đặt lịch, rồi ra ngoài app hoặc khóa máy. Thông báo sẽ phát sau 15 giây.</Text>
            </> : null}
            {isLoadingVoices ? (
              <Text style={styles.voiceStatus}>Đang tải danh sách giọng...</Text>
            ) : (
              <View style={styles.voiceList}>
                <TouchableOpacity
                  style={styles.voiceOption}
                  onPress={() => {
                    if (isPlayingTest) void SpeechService.stop();
                    setIsPlayingTest(false);
                    setSpeechVoice(undefined);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: !speechVoice }}
                >
                  <View style={styles.voiceOptionText}>
                    <Text style={styles.voiceName}>Tự động chọn</Text>
                    <Text style={styles.voiceDetails}>Giọng mặc định của thiết bị</Text>
                  </View>
                  <Ionicons
                    name={!speechVoice ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={!speechVoice ? '#0A2540' : '#94A3B8'}
                  />
                </TouchableOpacity>
                {availableVoices.map((voice) => {
                  const isSelected = speechVoice === voice.identifier;
                  return (
                    <TouchableOpacity
                      key={voice.identifier}
                      style={styles.voiceOption}
                      onPress={() => {
                        if (isPlayingTest) void SpeechService.stop();
                        setIsPlayingTest(false);
                        setSpeechVoice(voice.identifier);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <View style={styles.voiceOptionText}>
                        <Text style={styles.voiceName}>{voice.name}</Text>
                        <Text style={styles.voiceDetails}>
                          {voice.language}{voice.quality === 'Enhanced' ? ' · Chất lượng cao' : ''}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={isSelected ? '#0A2540' : '#94A3B8'}
                      />
                    </TouchableOpacity>
                  );
                })}
                {availableVoices.length === 0 && (
                  <Text style={styles.voiceStatus}>
                    {Platform.OS === 'android'
                      ? 'Chưa tìm thấy giọng tiếng Việt ngoại tuyến. Hãy tải giọng trong cài đặt chuyển văn bản thành giọng nói của Android.'
                      : 'Chưa tìm thấy giọng tiếng Việt đã cài trên thiết bị.'}
                  </Text>
                )}
                {speechVoice && !availableVoices.some((voice) => voice.identifier === speechVoice) ? (
                  <Text style={styles.voiceStatus}>Giọng đã lưu không còn trong danh sách. Hãy chọn lại giọng hoặc chọn Mặc định.</Text>
                ) : null}
              </View>
            )}
          </View>

          <Text style={styles.note}>Giọng đã chọn được dùng khi ứng dụng mở và trong thông báo nếu thiết bị hỗ trợ. Nếu không, thiết bị sẽ phát âm báo mặc định.</Text>
          {Platform.OS === 'ios' ? <View style={styles.groupCard}>
            <View style={styles.settingRow}>
              <View style={styles.rowLabelGroup}>
                <Ionicons name="calendar-outline" size={20} color="#0A2540" />
                <Text style={styles.rowLabel}>Widget Lịch hôm nay</Text>
              </View>
            </View>
            <Text style={styles.voiceHint}>Màn hình chính: nhấn giữ chỗ trống → Sửa → Thêm tiện ích → iGen Check → chọn kích thước.</Text>
            <Text style={styles.voiceHint}>Màn hình khóa: nhấn giữ → Tùy chỉnh → Màn hình khóa → Thêm tiện ích → iGen Check. Bạn cũng có thể thêm lịch vào dòng phía trên đồng hồ.</Text>
            <Text style={styles.voiceHint}>Widget chỉ hiện lịch trong ngày. Lịch sửa trong app sẽ được gửi sang widget; iOS quyết định thời điểm hiển thị cập nhật. Nội dung lịch có thể xuất hiện trên màn hình khóa khi bạn thêm widget.</Text>
            {onRefreshWidget ? <TouchableOpacity
              style={styles.settingRow}
              accessibilityRole="button"
              disabled={isRefreshingWidget}
              onPress={async () => {
                if (isRefreshingWidget) return;
                setIsRefreshingWidget(true);
                try {
                  const updated = await onRefreshWidget();
                  Alert.alert(updated ? 'Đã gửi lịch sang widget' : 'Chưa cập nhật được widget', updated
                    ? 'iOS sẽ làm mới tiện ích. Nếu chưa thêm, hãy chọn iGen Check trong danh sách tiện ích.'
                    : 'Hãy dùng bản cài iOS mới có hỗ trợ widget rồi thử lại.');
                } catch {
                  Alert.alert('Chưa cập nhật được widget', 'Hãy mở lại ứng dụng và thử lại.');
                } finally {
                  setIsRefreshingWidget(false);
                }
              }}
            >
              <Text style={styles.rowLabel}>{isRefreshingWidget ? 'Đang cập nhật…' : 'Cập nhật widget'}</Text>
              <Ionicons name="refresh-outline" size={18} color="#0A2540" />
            </TouchableOpacity> : null}
          </View> : null}
          {(Object.keys(legalDocuments) as LegalDocumentId[]).map((id) => (
          <TouchableOpacity key={id} accessibilityRole="button" onPress={() => setLegalDocument(id)} style={styles.privacyButton}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#0A2540" />
            <Text style={styles.privacyText}>{legalDocuments[id].content.title}{'\n'}{legalDocuments[id].label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </TouchableOpacity>
          ))}

          {/* Text link: Đặt lại mặc định */}
          <TouchableOpacity
            style={styles.resetLinkBox}
            onPress={handleReset}
            activeOpacity={0.6}
          >
            <Text style={styles.resetLinkText}>Đặt lại mặc định</Text>
          </TouchableOpacity>
          </ScrollView>
          </>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 25, 47, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0A2540',
    letterSpacing: -0.3,
  },
  doneBtn: {
    backgroundColor: '#0A2540',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  rowLabel: {
    color: '#1E293B',
    fontSize: 14.5,
    fontWeight: '600',
  },
  briefingLabelGroup: { gap: 2 },
  briefingHint: { color: '#64748B', fontSize: 11.5 },
  briefingTimeFields: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  briefingTimeInput: {
    width: 42,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    color: '#0A2540',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  briefingTimeSeparator: { color: '#0A2540', fontSize: 16, fontWeight: '700' },
  briefingTimeError: { color: '#B91C1C', fontSize: 12, paddingHorizontal: 27, paddingBottom: 8 },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  segmentChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  segmentChipActive: {
    backgroundColor: '#0A2540',
  },
  segmentText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 27,
  },
  audioTestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  audioTestPillActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  audioTestText: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '700',
  },
  audioTestTextActive: {
    color: '#EF4444',
  },
  voiceHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginHorizontal: 2,
    marginTop: -2,
    marginBottom: 6,
  },
  backgroundTestButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  backgroundTestText: { flex: 1, color: '#0A2540', fontSize: 13, fontWeight: '600' },
  voiceList: {
    paddingBottom: 4,
  },
  voiceOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  voiceOptionText: {
    flex: 1,
    gap: 2,
  },
  voiceName: {
    color: '#1E293B',
    fontSize: 13.5,
    fontWeight: '600',
  },
  voiceDetails: {
    color: '#64748B',
    fontSize: 11.5,
  },
  voiceStatus: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 10,
  },
  resetLinkBox: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  resetLinkText: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '600',
  },
  settingsScroll: { flexShrink: 1 },
  settingsContent: { paddingBottom: 8 },
  note: { fontSize: 13, lineHeight: 20, color: '#64748B', marginBottom: 12 },
  privacyButton: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10, paddingVertical: 12 },
  privacyText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0A2540' },
});
