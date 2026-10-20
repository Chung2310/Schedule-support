import React, { useEffect, useRef, useState } from 'react';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { SpeechService } from '../services/speechService';
import { MeetingVoice, type NotificationVoice } from '../services/meetingVoice';
import { PrivacyPolicyContent } from './PrivacyPolicyContent';
import { legalDocuments, type LegalDocumentId } from '../content/legal-documents';
import { normalizeClockTime } from '../utils/clockTime';
import { formatAdvanceNotice } from '../utils/formatAdvanceNotice';
import { useAppDialog } from './AppDialog';

interface SettingsScreenProps {
  settings: AppSettings;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onTestNotification?: (settings: AppSettings) => Promise<void>;
}

function voiceDisplayName(voice: NotificationVoice, index: number): string {
  return /^vi[-_]vn[-_]/i.test(voice.name) ? `Giọng tiếng Việt ${index + 1}` : voice.name;
}

function voiceLocation(voice: NotificationVoice): string | null {
  if (/(?:^|[-_])local$/i.test(voice.name)) return 'Trên thiết bị';
  if (/(?:^|[-_])network$/i.test(voice.name)) return 'Qua mạng';
  return null;
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
        accessibilityLabel={label + ' ' + formatAdvanceNotice(minutes)}
        accessibilityState={{ checked: value === minutes }}
      >
        <Text style={[styles.optionText, value === minutes && styles.optionTextSelected]}>{formatAdvanceNotice(minutes)}</Text>
      </TouchableOpacity>)}
    </View>
  </View>;
}

function TimeSetting({ label, value, onChange, onPick, invalid = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPick: () => void;
  invalid?: boolean;
}) {
  const [hour = '', minute = ''] = value.split(':');
  return <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    {Platform.OS === 'web' ? <View style={styles.timeFields}>
      <TextInput style={[styles.timeInput, invalid && styles.invalidInput]} value={hour}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 2) + ':' + minute)}
        keyboardType="number-pad" maxLength={2} selectTextOnFocus placeholder="HH" accessibilityLabel={'Giờ ' + label.toLowerCase()} />
      <Text style={styles.timeSeparator}>:</Text>
      <TextInput style={[styles.timeInput, invalid && styles.invalidInput]} value={minute}
        onChangeText={(text) => onChange(hour + ':' + text.replace(/\D/g, '').slice(0, 2))}
        keyboardType="number-pad" maxLength={2} selectTextOnFocus placeholder="mm" accessibilityLabel={'Phút ' + label.toLowerCase()} />
    </View> : <TouchableOpacity style={[styles.timePickerButton, invalid && styles.invalidInput]} onPress={onPick}
      accessibilityRole="button" accessibilityLabel={'Chọn giờ ' + label.toLowerCase()}>
      <Text style={styles.timePickerText}>{value}</Text>
      <Ionicons name="time-outline" size={18} color="#00ADFC" />
    </TouchableOpacity>}
  </View>;
}

type TimeTarget = 'briefing' | 'morning' | 'afternoon';

function pickerDate(value: string): Date {
  const normalized = normalizeClockTime(value) ?? '07:00';
  const [hours, minutes] = normalized.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

const documentLabels: Record<LegalDocumentId, string> = {
  privacy: 'Chính sách riêng tư',
  terms: 'Điều khoản sử dụng',
  deletion: 'Quản lý và xóa dữ liệu',
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings, onClose, onSave, onTestNotification,
}) => {
  const showDialog = useAppDialog();
  const [leadTime, setLeadTime] = useState(settings.defaultAdvanceNoticeMinutes);
  const [repeatInterval, setRepeatInterval] = useState(settings.defaultRepeatIntervalMinutes);
  const [hour, setHour] = useState((settings.dailyBriefingTime ?? DEFAULT_SETTINGS.dailyBriefingTime).split(':')[0] ?? '07');
  const [minute, setMinute] = useState((settings.dailyBriefingTime ?? DEFAULT_SETTINGS.dailyBriefingTime).split(':')[1] ?? '00');
  const [timeError, setTimeError] = useState('');
  const [morningTime, setMorningTime] = useState(settings.defaultMorningTime ?? DEFAULT_SETTINGS.defaultMorningTime);
  const [afternoonTime, setAfternoonTime] = useState(settings.defaultAfternoonTime ?? DEFAULT_SETTINGS.defaultAfternoonTime);
  const [daypartTimeError, setDaypartTimeError] = useState<'morning' | 'afternoon' | null>(null);
  const [pickerTarget, setPickerTarget] = useState<TimeTarget | null>(null);
  const [pickerValue, setPickerValue] = useState(() => pickerDate(settings.dailyBriefingTime));
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

  const openTimePicker = (target: TimeTarget) => {
    const value = target === 'briefing' ? hour + ':' + minute : target === 'morning' ? morningTime : afternoonTime;
    setPickerValue(pickerDate(value));
    setPickerTarget(target);
  };

  const applyPickerValue = (date: Date) => {
    const nextHour = String(date.getHours()).padStart(2, '0');
    const nextMinute = String(date.getMinutes()).padStart(2, '0');
    if (pickerTarget === 'briefing') {
      setHour(nextHour);
      setMinute(nextMinute);
      setTimeError('');
    } else if (pickerTarget === 'morning') {
      setMorningTime(nextHour + ':' + nextMinute);
      setDaypartTimeError(null);
    } else if (pickerTarget === 'afternoon') {
      setAfternoonTime(nextHour + ':' + nextMinute);
      setDaypartTimeError(null);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewRef.current += 1;
    };
  }, []);

  useEffect(() => {
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
  }, []);

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
            showDialog('Chưa phát được giọng đọc', 'Hãy chọn lại giọng tiếng Việt trên thiết bị.');
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
        showDialog('Đã đặt thông báo thử', 'Khóa màn hình để nghe sau 15 giây. Bật chuông và tắt chế độ Tập trung.');
      }
    } catch (error) {
      if (mountedRef.current) {
        showDialog('Chưa đặt được thông báo thử', error instanceof Error ? error.message : 'Hãy thử lại.');
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
    const morning = normalizeClockTime(morningTime);
    const afternoon = normalizeClockTime(afternoonTime);
    if (!morning || !afternoon) {
      setDaypartTimeError(!morning ? 'morning' : 'afternoon');
      return;
    }
    const next: AppSettings = {
      ...settings,
      dailyBriefingTime: hour.padStart(2, '0') + ':' + minute.padStart(2, '0'),
      defaultMorningTime: morning,
      defaultAfternoonTime: afternoon,
      defaultAdvanceNoticeMinutes: leadTime,
      defaultRepeatIntervalMinutes: repeatInterval,
      stopOnMeetingStart,
      speechVoice,
    };
    busyRef.current = true;
    try {
      await stopPreview();
      if (next.dailyBriefingTime === settings.dailyBriefingTime &&
          morning === (settings.defaultMorningTime ?? DEFAULT_SETTINGS.defaultMorningTime) &&
          afternoon === (settings.defaultAfternoonTime ?? DEFAULT_SETTINGS.defaultAfternoonTime) &&
          leadTime === settings.defaultAdvanceNoticeMinutes && repeatInterval === settings.defaultRepeatIntervalMinutes &&
          stopOnMeetingStart === settings.stopOnMeetingStart && speechVoice === settings.speechVoice) {
        onClose();
        return;
      }
      setSaving(true);
      await onSave(next);
    } catch {
      if (mountedRef.current) showDialog('Chưa lưu được cài đặt', 'Hãy giữ ứng dụng mở và thử lại.');
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
  const voiceName = !speechVoice ? 'Tự động' : selectedVoice
    ? voiceDisplayName(selectedVoice, voices.indexOf(selectedVoice))
    : loadingVoices ? 'Đang tải…' : 'Chọn lại giọng';

  return <>
      <View style={styles.screen}>
        {legalDocument ? <PrivacyPolicyContent document={legalDocument} onBack={() => setLegalDocument(null)} /> : <>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Cài đặt</Text>
            <TouchableOpacity style={[styles.doneButton, busy && styles.disabled]} onPress={() => void handleDone()}
              disabled={busy} hitSlop={6} accessibilityRole="button" accessibilityLabel={saving ? 'Đang lưu cài đặt' : 'Lưu và đóng cài đặt'} accessibilityState={{ disabled: busy, busy }}>
              {saving ? <ActivityIndicator color="#64748B" size="small" /> : <Ionicons name="close" size={22} color="#64748B" />}
            </TouchableOpacity>
          </View>
          {saving ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Đang cập nhật nhắc lịch. Giữ ứng dụng mở đến khi xong.</Text> : null}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} pointerEvents={busy ? 'none' : 'auto'}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Nhắc lịch</Text>
            <View style={styles.card}>
              <TimeSetting label="Tổng hợp mỗi ngày" value={hour + ':' + minute} invalid={!!timeError}
                onPick={() => openTimePicker('briefing')}
                onChange={(value) => { const [nextHour = '', nextMinute = ''] = value.split(':'); setHour(nextHour); setMinute(nextMinute); setTimeError(''); }} />
              {timeError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{timeError}</Text> : null}
              <View style={styles.divider} />
              <MinuteOptions label="Báo trước" value={leadTime} options={[5, 10, 15, 30, 60, 1440, 4320]} onChange={setLeadTime} />
              <View style={styles.divider} />
              <MinuteOptions label="Nhắc lại mỗi" value={repeatInterval} options={[2, 5, 10]} onChange={setRepeatInterval} />
            </View>

            <Text accessibilityRole="header" style={styles.sectionTitle}>Giờ mặc định theo buổi</Text>
            <View style={styles.card}>
              <TimeSetting label="Buổi sáng" value={morningTime} invalid={daypartTimeError === 'morning'}
                onPick={() => openTimePicker('morning')}
                onChange={(value) => { setMorningTime(value); setDaypartTimeError(null); }} />
              <View style={styles.divider} />
              <TimeSetting label="Buổi chiều" value={afternoonTime} invalid={daypartTimeError === 'afternoon'}
                onPick={() => openTimePicker('afternoon')}
                onChange={(value) => { setAfternoonTime(value); setDaypartTimeError(null); }} />
              {daypartTimeError ? <Text accessibilityLiveRegion="polite" style={styles.error}>
                Giờ buổi {daypartTimeError === 'morning' ? 'sáng' : 'chiều'} chưa hợp lệ. Chọn giờ từ 00:00 đến 23:59.
              </Text> : null}
              <Text style={styles.hint}>Dùng khi bạn chỉ nói “sáng” hoặc “chiều” mà chưa nêu giờ cụ thể.</Text>
            </View>

            <Text accessibilityRole="header" style={styles.sectionTitle}>Giọng đọc</Text>
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
                  <Ionicons name={!speechVoice ? 'radio-button-on' : 'radio-button-off'} size={20} color={!speechVoice ? '#00ADFC' : '#8EA3B0'} />
                </TouchableOpacity>
                {loadingVoices ? <Text style={styles.hint}>Đang tải giọng đọc…</Text> : voices.map((voice, index) => <TouchableOpacity
                  key={voice.identifier} style={styles.voiceOption} onPress={() => chooseVoice(voice.identifier)}
                  accessibilityRole="radio" accessibilityLabel={voiceDisplayName(voice, index)} accessibilityState={{ checked: speechVoice === voice.identifier }}>
                  <View style={styles.voiceInfo}>
                    <Text style={styles.voiceName}>{voiceDisplayName(voice, index)}</Text>
                    {voiceLocation(voice) || voice.quality === 'Enhanced' ? <Text style={styles.voiceDetail}>
                      {[voiceLocation(voice), voice.quality === 'Enhanced' ? 'Chất lượng cao' : null].filter(Boolean).join(' · ')}
                    </Text> : null}
                  </View>
                  <Ionicons name={speechVoice === voice.identifier ? 'radio-button-on' : 'radio-button-off'} size={20} color={speechVoice === voice.identifier ? '#00ADFC' : '#8EA3B0'} />
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
                    trackColor={{ false: '#CBD5E1', true: '#00ADFC' }} thumbColor="#FFFFFF" />
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
                  <TouchableOpacity style={styles.row} accessibilityRole="button" onPress={() => showDialog('Thêm widget Lịch hôm nay',
                    'Màn hình chính: nhấn giữ chỗ trống → Sửa → Thêm tiện ích → iGen Check.\n\nMàn hình khóa: nhấn giữ → Tùy chỉnh → Thêm tiện ích → iGen Check.\n\nWidget hiển thị lịch trong ngày và tự cập nhật. Nội dung lịch có thể được nhìn thấy trên màn hình khóa.')}>
                    <Text style={styles.flexLabel}>Cách thêm widget</Text>
                    <Ionicons name="help-circle-outline" size={20} color="#0A2540" />
                  </TouchableOpacity>
                </> : null}
              </> : null}
            </View>
            {preparingTest ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Đang chuẩn bị thông báo thử…</Text> : null}

            <Text accessibilityRole="header" style={styles.sectionTitle}>Thông tin</Text>
            <View style={styles.card}>
              {(Object.keys(legalDocuments) as LegalDocumentId[]).map((id, index) => <React.Fragment key={id}>
                {index ? <View style={styles.divider} /> : null}
                <TouchableOpacity style={styles.row} onPress={() => { void stopPreview(); setLegalDocument(id); }} accessibilityRole="button">
                  <Text style={styles.flexLabel}>{documentLabels[id]}</Text>
                  <Ionicons name="chevron-forward" size={17} color="#64748B" />
                </TouchableOpacity>
              </React.Fragment>)}
              <View style={styles.divider} />
            </View>
          </ScrollView>
        </>}
      </View>
    {Platform.OS === 'android' && pickerTarget ? <DateTimePicker key={pickerTarget} value={pickerValue}
      mode="time" display="clock" presentation="dialog" is24Hour accentColor="#00ADFC"
      positiveButton={{ label: 'Chọn' }} negativeButton={{ label: 'Hủy' }}
      onValueChange={(_event, date) => { applyPickerValue(date); setPickerTarget(null); }}
      onDismiss={() => setPickerTarget(null)} /> : null}
    {Platform.OS === 'ios' && pickerTarget ? <Modal transparent visible animationType="fade" onRequestClose={() => setPickerTarget(null)}>
      <View style={styles.pickerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerTarget(null)} accessibilityRole="button" accessibilityLabel="Hủy chọn giờ" />
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerHeading}>Chọn giờ</Text>
          <DateTimePicker value={pickerValue} mode="time" display="spinner" locale="vi_VN" is24Hour
            themeVariant="light" accentColor="#00ADFC" onValueChange={(_event, date) => setPickerValue(date)} />
          <View style={styles.pickerActions}>
            <TouchableOpacity style={styles.cancelPicker} onPress={() => setPickerTarget(null)} accessibilityRole="button">
              <Text style={styles.cancelPickerText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmPicker} onPress={() => { applyPickerValue(pickerValue); setPickerTarget(null); }} accessibilityRole="button">
              <Text style={styles.confirmPickerText}>Chọn</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal> : null}
  </>;
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: '#0A2540', fontSize: 22, fontFamily: 'Roboto' },
  doneButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#DCE6EC', backgroundColor: '#F8FBFD',
    alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  scroll: { flex: 1 },
  content: { paddingBottom: 16 },
  sectionTitle: { color: '#41748F', fontSize: 13, fontFamily: 'Roboto', letterSpacing: 0.2, marginTop: 18, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: '#F8FBFD', borderRadius: 18, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5F0F5' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, paddingVertical: 10 },
  rowLabel: { color: '#1E293B', fontSize: 14, fontFamily: 'Roboto', flexShrink: 1 },
  flexLabel: { color: '#1E293B', fontSize: 14, fontFamily: 'Roboto', flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DCECF4' },
  timeFields: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeInput: { minHeight: 44, width: 42, borderRadius: 12, borderWidth: 1, borderColor: '#CCE3EF',
    backgroundColor: '#FFFFFF', color: '#0A2540', fontSize: 16, fontFamily: 'Roboto', textAlign: 'center', paddingHorizontal: 3 },
  timeSeparator: { color: '#0A2540', fontSize: 16, fontFamily: 'Roboto',  },
  timePickerButton: { minWidth: 106, minHeight: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1,
    borderColor: '#CCE3EF', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timePickerText: { color: '#0A2540', fontSize: 16, fontFamily: 'Roboto' },
  invalidInput: { borderColor: '#B91C1C' },
  optionField: { paddingVertical: 12, gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { flexGrow: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: 13, backgroundColor: '#EAF4F9', alignItems: 'center', justifyContent: 'center' },
  optionSelected: { backgroundColor: '#00ADFC' },
  optionText: { color: '#64748B', fontSize: 13, fontFamily: 'Roboto',  },
  optionTextSelected: { color: '#FFFFFF' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(10,25,47,0.46)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  pickerHeading: { color: '#0A2540', fontSize: 20, fontFamily: 'Roboto', marginBottom: 12 },
  pickerActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelPicker: { flex: 1, minHeight: 48, backgroundColor: '#EF4444', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelPickerText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Roboto' },
  confirmPicker: { flex: 1, minHeight: 48, backgroundColor: '#00ADFC', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmPickerText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Roboto' },
  rowValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
  valueText: { color: '#64748B', fontSize: 13, fontFamily: 'Roboto', flexShrink: 1 },
  voiceList: { paddingBottom: 8 },
  voiceOption: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0' },
  voiceInfo: { flex: 1, gap: 2 },
  voiceName: { color: '#1E293B', fontSize: 14, fontFamily: 'Roboto', flexShrink: 1 },
  voiceDetail: { color: '#64748B', fontSize: 12, fontFamily: 'Roboto' },
  actionText: { color: '#008FCC', fontSize: 14, fontFamily: 'Roboto' },
  hint: { color: '#64748B', fontSize: 12, fontFamily: 'Roboto', lineHeight: 18, paddingVertical: 8 },
  error: { color: '#B91C1C', fontSize: 12, fontFamily: 'Roboto', lineHeight: 18, paddingBottom: 10 },
});
