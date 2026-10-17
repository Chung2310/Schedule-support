import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { SpeechService } from '../services/speechService';
import { MeetingVoice, type NotificationVoice } from '../services/meetingVoice';
import { PrivacyPolicyContent } from './PrivacyPolicyContent';
import { legalDocuments, type LegalDocumentId } from '../content/legal-documents';

interface SettingsModalProps {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onTestNotification?: (settings: AppSettings) => Promise<void>;
}

function MinuteOptions({ label, value, options, onChange }: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
}) {
  const choices = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return <View style={styles.optionField}>
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.options}>
      {choices.map((minutes) => <TouchableOpacity
        key={minutes}
        style={[styles.option, value === minutes && styles.optionSelected]}
        onPress={() => onChange(minutes)}
        accessibilityRole="radio"
        accessibilityLabel={label + ' ' + minutes + ' phút'}
        accessibilityState={{ checked: value === minutes }}
      >
        <Text style={[styles.optionText, value === minutes && styles.optionTextSelected]}>{minutes} phút</Text>
      </TouchableOpacity>)}
    </View>
  </View>;
}

const documentLabels: Record<LegalDocumentId, string> = {
  privacy: 'Chính sách riêng tư',
  terms: 'Điều khoản sử dụng',
  deletion: 'Quản lý và xóa dữ liệu',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible, settings, onClose, onSave, onTestNotification,
}) => {
  const [leadTime, setLeadTime] = useState(settings.defaultAdvanceNoticeMinutes);
  const [repeatInterval, setRepeatInterval] = useState(settings.defaultRepeatIntervalMinutes);
  const [hour, setHour] = useState((settings.dailyBriefingTime ?? DEFAULT_SETTINGS.dailyBriefingTime).split(':')[0] ?? '07');
  const [minute, setMinute] = useState((settings.dailyBriefingTime ?? DEFAULT_SETTINGS.dailyBriefingTime).split(':')[1] ?? '00');
  const [timeError, setTimeError] = useState('');
  const [stopOnMeetingStart, setStopOnMeetingStart] = useState(settings.stopOnMeetingStart);
  const [speechVoice, setSpeechVoice] = useState(settings.speechVoice);
  const [voices, setVoices] = useState<NotificationVoice[]>([]);
  const [voiceListOpen, setVoiceListOpen] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [preparingTest, setPreparingTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const previewRef = useRef(0);
  const busy = saving || preparingTest;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let current = true;
    void MeetingVoice.getAvailableVoices()
      .then((available) => { if (current) setVoices(available); })
      .catch(() => { if (current) setVoices([]); })
      .finally(() => { if (current) setLoadingVoices(false); });
    return () => {
      current = false;
      previewRef.current += 1;
      void SpeechService.stop();
    };
  }, [visible]);

  const stopPreview = async () => {
    previewRef.current += 1;
    setPlaying(false);
    await SpeechService.stop();
  };

  const handlePreview = async () => {
    if (busyRef.current) return;
    if (playing) { await stopPreview(); return; }
    const preview = ++previewRef.current;
    const finish = () => {
      if (mountedRef.current && preview === previewRef.current) setPlaying(false);
    };
    setPlaying(true);
    try {
      await SpeechService.speakVoiceReminder('14 giờ, họp với khách hàng.', {
        rate: settings.speechRate,
        pitch: settings.speechPitch,
        voice: speechVoice,
        onDone: finish,
        onStopped: finish,
        onError: () => {
          finish();
          if (mountedRef.current && preview === previewRef.current) {
            Alert.alert('Chưa phát được giọng đọc', 'Hãy chọn lại giọng tiếng Việt trên thiết bị.');
          }
        },
      });
    } catch {
      finish();
    }
  };

  const handleBackgroundTest = async () => {
    if (!onTestNotification || busyRef.current) return;
    busyRef.current = true;
    setPreparingTest(true);
    try {
      await stopPreview();
      await onTestNotification({ ...settings, speechVoice });
      if (mountedRef.current) {
        Alert.alert('Đã đặt thông báo thử', 'Khóa màn hình để nghe sau 15 giây. Bật chuông và tắt chế độ Tập trung.');
      }
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert('Chưa đặt được thông báo thử', error instanceof Error ? error.message : 'Hãy thử lại.');
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPreparingTest(false);
    }
  };

  const handleDone = async () => {
    if (busyRef.current) return;
    if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute) || Number(hour) > 23 || Number(minute) > 59) {
      setTimeError('Nhập giờ từ 00–23, phút từ 00–59.');
      return;
    }
    const next: AppSettings = {
      ...settings,
      dailyBriefingTime: hour.padStart(2, '0') + ':' + minute.padStart(2, '0'),
      defaultAdvanceNoticeMinutes: leadTime,
      defaultRepeatIntervalMinutes: repeatInterval,
      stopOnMeetingStart,
      speechVoice,
    };
    busyRef.current = true;
    try {
      await stopPreview();
      if (next.dailyBriefingTime === settings.dailyBriefingTime &&
          leadTime === settings.defaultAdvanceNoticeMinutes && repeatInterval === settings.defaultRepeatIntervalMinutes &&
          stopOnMeetingStart === settings.stopOnMeetingStart && speechVoice === settings.speechVoice) {
        onClose();
        return;
      }
      setSaving(true);
      await onSave(next);
    } catch {
      if (mountedRef.current) Alert.alert('Chưa lưu được cài đặt', 'Hãy giữ ứng dụng mở và thử lại.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  const chooseVoice = (identifier?: string) => {
    if (busyRef.current) return;
    void stopPreview();
    setSpeechVoice(identifier);
    setVoiceListOpen(false);
  };

  const selectedVoice = voices.find((voice) => voice.identifier === speechVoice);
  const missingVoice = !loadingVoices && !!speechVoice && !selectedVoice;
  const voiceName = !speechVoice ? 'Tự động' : selectedVoice?.name ?? (loadingVoices ? 'Đang tải…' : 'Chọn lại giọng');

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {
    if (busyRef.current) return;
    if (legalDocument) setLegalDocument(null);
    else void handleDone();
  }}>
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        {legalDocument ? <PrivacyPolicyContent document={legalDocument} onBack={() => setLegalDocument(null)} /> : <>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Cài đặt</Text>
            <TouchableOpacity style={[styles.doneButton, busy && styles.disabled]} onPress={() => void handleDone()}
              disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}>
              <Text style={styles.doneText}>{saving ? 'Đang lưu…' : 'Xong'}</Text>
            </TouchableOpacity>
          </View>
          {saving ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Đang cập nhật nhắc lịch. Giữ ứng dụng mở đến khi xong.</Text> : null}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} pointerEvents={busy ? 'none' : 'auto'}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>NHẮC LỊCH</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Tổng hợp mỗi ngày</Text>
                <View style={styles.timeFields}>
                  <TextInput style={[styles.timeInput, !!timeError && styles.invalidInput]} value={hour}
                    onChangeText={(value) => { setHour(value.replace(/\D/g, '').slice(0, 2)); setTimeError(''); }}
                    keyboardType="number-pad" maxLength={2} selectTextOnFocus placeholder="07" accessibilityLabel="Giờ tổng hợp lịch" />
                  <Text style={styles.timeSeparator}>:</Text>
                  <TextInput style={[styles.timeInput, !!timeError && styles.invalidInput]} value={minute}
                    onChangeText={(value) => { setMinute(value.replace(/\D/g, '').slice(0, 2)); setTimeError(''); }}
                    keyboardType="number-pad" maxLength={2} selectTextOnFocus placeholder="00" accessibilityLabel="Phút tổng hợp lịch" />
                </View>
              </View>
              {timeError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{timeError}</Text> : null}
              <View style={styles.divider} />
              <MinuteOptions label="Báo trước" value={leadTime} options={[5, 10, 15, 30]} onChange={setLeadTime} />
              <View style={styles.divider} />
              <MinuteOptions label="Nhắc lại mỗi" value={repeatInterval} options={[2, 5, 10]} onChange={setRepeatInterval} />
            </View>

            <Text accessibilityRole="header" style={styles.sectionTitle}>GIỌNG ĐỌC</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.row} onPress={() => setVoiceListOpen((open) => !open)}
                accessibilityRole="button" accessibilityLabel={'Giọng đọc: ' + voiceName} accessibilityState={{ expanded: voiceListOpen }}>
                <Text style={styles.rowLabel}>Giọng tiếng Việt</Text>
                <View style={styles.rowValue}>
                  <Text numberOfLines={1} style={styles.valueText}>{voiceName}</Text>
                  <Ionicons name={voiceListOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
                </View>
              </TouchableOpacity>
              {voiceListOpen ? <View style={styles.voiceList}>
                <TouchableOpacity style={styles.voiceOption} onPress={() => chooseVoice()}
                  accessibilityRole="radio" accessibilityState={{ checked: !speechVoice }}>
                  <Text style={styles.voiceName}>Tự động theo thiết bị</Text>
                  <Ionicons name={!speechVoice ? 'radio-button-on' : 'radio-button-off'} size={20} color="#0A2540" />
                </TouchableOpacity>
                {loadingVoices ? <Text style={styles.hint}>Đang tải giọng đọc…</Text> : voices.map((voice) => <TouchableOpacity
                  key={voice.identifier} style={styles.voiceOption} onPress={() => chooseVoice(voice.identifier)}
                  accessibilityRole="radio" accessibilityState={{ checked: speechVoice === voice.identifier }}>
                  <View style={styles.voiceInfo}>
                    <Text style={styles.voiceName}>{voice.name}</Text>
                    {voice.quality === 'Enhanced' ? <Text style={styles.voiceDetail}>Chất lượng cao</Text> : null}
                  </View>
                  <Ionicons name={speechVoice === voice.identifier ? 'radio-button-on' : 'radio-button-off'} size={20} color="#0A2540" />
                </TouchableOpacity>)}
                {!loadingVoices && !voices.length ? <Text style={styles.hint}>{Platform.OS === 'android'
                  ? 'Tải giọng tiếng Việt trong cài đặt chuyển văn bản thành giọng nói của Android.'
                  : 'Chưa tìm thấy giọng tiếng Việt đã cài trên thiết bị.'}</Text> : null}
              </View> : null}
              {missingVoice ? <Text style={styles.error}>Giọng đã lưu không còn trên thiết bị. Hãy chọn lại.</Text> : null}
              <View style={styles.divider} />
              <TouchableOpacity style={styles.row} onPress={() => void handlePreview()} accessibilityRole="button"
                accessibilityLabel={playing ? 'Dừng nghe thử' : 'Nghe thử giọng đã chọn'}>
                <Text style={styles.actionText}>{playing ? 'Dừng nghe thử' : 'Nghe thử'}</Text>
                <Ionicons name={playing ? 'stop-circle-outline' : 'play-circle-outline'} size={23} color="#0A2540" />
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <TouchableOpacity style={styles.row} onPress={() => setAdvancedOpen((open) => !open)}
                accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }}>
                <Text style={styles.rowLabel}>Tùy chọn thêm</Text>
                <Ionicons name={advancedOpen ? 'chevron-up' : 'chevron-down'} size={17} color="#64748B" />
              </TouchableOpacity>
              {advancedOpen ? <>
                <View style={styles.divider} />
                <View style={styles.row}>
                  <Text style={styles.flexLabel}>Dừng nhắc khi đến giờ hẹn</Text>
                  <Switch value={stopOnMeetingStart} onValueChange={setStopOnMeetingStart} accessibilityLabel="Dừng nhắc khi đến giờ hẹn"
                    trackColor={{ false: '#CBD5E1', true: '#0A2540' }} thumbColor="#FFFFFF" />
                </View>
                {onTestNotification && Platform.OS !== 'web' ? <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.row} onPress={() => void handleBackgroundTest()} accessibilityRole="button">
                    <Text style={styles.flexLabel}>Thử thông báo khi khóa máy</Text>
                    <Ionicons name="notifications-outline" size={20} color="#0A2540" />
                  </TouchableOpacity>
                </> : null}
                {Platform.OS === 'ios' ? <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.row} accessibilityRole="button" onPress={() => Alert.alert('Thêm widget Lịch hôm nay',
                    'Màn hình chính: nhấn giữ chỗ trống → Sửa → Thêm tiện ích → iGen Check.\n\nMàn hình khóa: nhấn giữ → Tùy chỉnh → Thêm tiện ích → iGen Check.\n\nWidget hiển thị lịch trong ngày và tự cập nhật. Nội dung lịch có thể được nhìn thấy trên màn hình khóa.')}>
                    <Text style={styles.flexLabel}>Cách thêm widget</Text>
                    <Ionicons name="help-circle-outline" size={20} color="#0A2540" />
                  </TouchableOpacity>
                </> : null}
              </> : null}
            </View>
            {preparingTest ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Đang chuẩn bị thông báo thử…</Text> : null}

            <Text accessibilityRole="header" style={styles.sectionTitle}>THÔNG TIN</Text>
            <View style={styles.card}>
              {(Object.keys(legalDocuments) as LegalDocumentId[]).map((id, index) => <React.Fragment key={id}>
                {index ? <View style={styles.divider} /> : null}
                <TouchableOpacity style={styles.row} onPress={() => { void stopPreview(); setLegalDocument(id); }} accessibilityRole="button">
                  <Text style={styles.flexLabel}>{documentLabels[id]}</Text>
                  <Ionicons name="chevron-forward" size={17} color="#64748B" />
                </TouchableOpacity>
              </React.Fragment>)}
            </View>
          </ScrollView>
        </>}
      </View>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,25,47,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: '#0A2540', fontSize: 21, fontWeight: '800' },
  doneButton: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#0A2540',
    alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  scroll: { flexShrink: 1 },
  content: { paddingBottom: 8 },
  sectionTitle: { color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, paddingVertical: 10 },
  rowLabel: { color: '#1E293B', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  flexLabel: { color: '#1E293B', fontSize: 14, fontWeight: '500', flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0' },
  timeFields: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeInput: { minHeight: 44, width: 42, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC', color: '#0A2540', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 3 },
  timeSeparator: { color: '#0A2540', fontSize: 16, fontWeight: '700' },
  invalidInput: { borderColor: '#B91C1C' },
  optionField: { paddingVertical: 12, gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { flexGrow: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  optionSelected: { backgroundColor: '#0A2540' },
  optionText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  optionTextSelected: { color: '#FFFFFF' },
  rowValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
  valueText: { color: '#64748B', fontSize: 13, flexShrink: 1 },
  voiceList: { paddingBottom: 8 },
  voiceOption: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0' },
  voiceInfo: { flex: 1, gap: 2 },
  voiceName: { color: '#1E293B', fontSize: 14, flexShrink: 1 },
  voiceDetail: { color: '#64748B', fontSize: 12 },
  actionText: { color: '#0A2540', fontSize: 14, fontWeight: '600' },
  hint: { color: '#64748B', fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  error: { color: '#B91C1C', fontSize: 12, lineHeight: 18, paddingBottom: 10 },
});
