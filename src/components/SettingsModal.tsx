import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { SpeechService } from '../services/speechService';
import { PrivacyPolicyContent } from './PrivacyPolicyContent';

interface SettingsModalProps {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => void;
  onTestNotification?: () => void;
}

const PRESET_LEAD_TIMES = [5, 10, 15, 30];
const PRESET_REPEAT_INTERVALS = [2, 5, 10];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  settings,
  onClose,
  onSave,
}) => {
  const [leadTime, setLeadTime] = useState(settings.defaultAdvanceNoticeMinutes ?? 15);
  const [repeatInterval, setRepeatInterval] = useState(settings.defaultRepeatIntervalMinutes ?? 5);
  const [stopOnMeetingStart, setStopOnMeetingStart] = useState(settings.stopOnMeetingStart ?? true);
  const [hapticEnabled, setHapticEnabled] = useState(settings.hapticEnabled ?? true);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleTestTTS = async () => {
    if (isPlayingTest) {
      await SpeechService.stop();
      setIsPlayingTest(false);
      return;
    }
    setIsPlayingTest(true);
    await SpeechService.speakVoiceReminder('14 giờ, họp giao ban ban giám đốc', {
      rate: settings.speechRate || 0.95,
      pitch: 1.0,
      onDone: () => setIsPlayingTest(false),
    });
  };

  const handleDone = () => {
    onSave({
      ...settings,
      defaultAdvanceNoticeMinutes: leadTime,
      defaultRepeatIntervalMinutes: repeatInterval,
      stopOnMeetingStart,
      hapticEnabled,
    });
  };

  const handleReset = () => {
    setLeadTime(DEFAULT_SETTINGS.defaultAdvanceNoticeMinutes);
    setRepeatInterval(DEFAULT_SETTINGS.defaultRepeatIntervalMinutes);
    setStopOnMeetingStart(DEFAULT_SETTINGS.stopOnMeetingStart);
    setHapticEnabled(DEFAULT_SETTINGS.hapticEnabled);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={showPrivacy ? () => setShowPrivacy(false) : onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {showPrivacy ? <PrivacyPolicyContent onBack={() => setShowPrivacy(false)} /> : <>
          {/* Header tối giản kiểu iOS */}
          <View style={styles.header}>
            <Text style={styles.title}>Cài Đặt</Text>
            <TouchableOpacity
              onPress={handleDone}
              style={styles.doneBtn}
              activeOpacity={0.7}
              accessibilityLabel="Xong"
            >
              <Text style={styles.doneBtnText}>Xong</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsContent}>
          {/* Group 1: Nhắc lịch & Báo thức */}
          <View style={styles.groupCard}>
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
                <Text style={styles.rowLabel}>Giọng đọc nhắc lịch</Text>
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
          </View>

          <Text style={styles.note}>Giọng đọc hoạt động khi ứng dụng đang mở. Khi đóng ứng dụng hoặc khóa máy, bạn nhận nhắc lịch bằng thông báo của thiết bị.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => setShowPrivacy(true)} style={styles.privacyButton}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#0A2540" />
            <Text style={styles.privacyText}>Chính sách quyền riêng tư</Text>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </TouchableOpacity>

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
