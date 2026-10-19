import React, { useRef, useState } from 'react';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Meeting } from '../types/meeting';
import { applyMeetingEdit, meetingEditFields, MeetingEditFields } from '../utils/meetingEdit';

interface Props {
  meeting: Meeting;
  onClose: () => void;
  onSave: (fields: MeetingEditFields) => Promise<void>;
}

type PickerTarget = 'date' | 'time';

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function EditMeetingModal({ meeting, onClose, onSave }: Props) {
  const [fields, setFields] = useState(() => meetingEditFields(meeting));
  const [selectedDate, setSelectedDate] = useState(() => new Date(meeting.meetingTime));
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const change = (key: keyof MeetingEditFields, value: string) => {
    setFields(previous => ({ ...previous, [key]: value }));
    setError('');
  };
  const updatePickerValue = (date: Date) => {
    const nextDate = new Date(selectedDate);
    if (pickerTarget === 'date') {
      nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      change('date', formatDate(nextDate));
    }
    if (pickerTarget === 'time') {
      nextDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
      change('time', formatTime(nextDate));
    }
    setSelectedDate(nextDate);
  };
  const save = async () => {
    if (savingRef.current) return;
    try {
      applyMeetingEdit(meeting, fields);
      savingRef.current = true;
      setSaving(true);
      await onSave(fields);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Chưa lưu được thay đổi. Vui lòng thử lại.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return <>
    <Modal visible transparent animationType="slide" onRequestClose={() => { if (!savingRef.current) onClose(); }}>
      <SafeAreaProvider style={styles.modalRoot}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.heading}>Sửa cuộc họp</Text>
            <TouchableOpacity disabled={saving} onPress={onClose} accessibilityLabel="Đóng" style={styles.close}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Nội dung</Text>
            <TextInput accessibilityLabel="Nội dung cuộc họp" style={[styles.input, styles.title]} multiline
              value={fields.title} onChangeText={value => change('title', value)} editable={!saving} />
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.label}>Ngày</Text>
                {Platform.OS === 'web' ? <TextInput accessibilityLabel="Ngày cuộc họp" style={styles.input} value={fields.date} placeholder="dd/mm/yyyy"
                  onChangeText={value => change('date', value)} editable={!saving} autoCorrect={false} maxLength={10} /> : <TouchableOpacity
                    accessibilityRole="button" accessibilityLabel="Chọn ngày cuộc họp" style={styles.pickerField} onPress={() => setPickerTarget('date')} disabled={saving}>
                    <Text style={styles.pickerValue}>{fields.date}</Text>
                    <Ionicons name="calendar-outline" size={19} color="#00ADFC" />
                  </TouchableOpacity>}
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>Giờ</Text>
                {Platform.OS === 'web' ? <TextInput accessibilityLabel="Giờ cuộc họp" style={styles.input} value={fields.time} placeholder="hh:mm"
                  onChangeText={value => change('time', value)} editable={!saving} autoCorrect={false} maxLength={5} /> : <TouchableOpacity
                    accessibilityRole="button" accessibilityLabel="Chọn giờ cuộc họp" style={styles.pickerField} onPress={() => setPickerTarget('time')} disabled={saving}>
                    <Text style={styles.pickerValue}>{fields.time}</Text>
                    <Ionicons name="time-outline" size={19} color="#00ADFC" />
                  </TouchableOpacity>}
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.label}>Báo trước · phút</Text>
                <TextInput accessibilityLabel="Báo trước bao nhiêu phút" style={styles.input} keyboardType="number-pad"
                  value={fields.advance} onChangeText={value => change('advance', value)} editable={!saving} maxLength={5} />
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>Nhắc lại · phút</Text>
                <TextInput accessibilityLabel="Nhắc lại mỗi bao nhiêu phút" style={styles.input} keyboardType="number-pad"
                  value={fields.repeat} onChangeText={value => change('repeat', value)} editable={!saving} maxLength={4} />
              </View>
            </View>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <TouchableOpacity accessibilityRole="button" style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={save}>
              <Text style={styles.saveText}>{saving ? 'Đang chuẩn bị giọng đọc…' : 'Lưu thay đổi'}</Text>
            </TouchableOpacity>
            {saving ? <Text style={styles.savingHint}>Giữ app mở đến khi hoàn tất để cập nhật giọng đọc nhắc lịch khi khóa màn hình.</Text> : null}
          </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>

    {Platform.OS === 'android' && pickerTarget ? <DateTimePicker
      key={pickerTarget}
      value={selectedDate}
      mode={pickerTarget}
      display={pickerTarget === 'date' ? 'calendar' : 'clock'}
      presentation="dialog"
      is24Hour
      accentColor="#00ADFC"
      positiveButton={{ label: 'Chọn' }}
      negativeButton={{ label: 'Hủy' }}
      onValueChange={(_event, date) => {
        updatePickerValue(date);
        setPickerTarget(null);
      }}
      onDismiss={() => setPickerTarget(null)}
    /> : null}

    {Platform.OS === 'ios' && pickerTarget ? <Modal transparent visible animationType="fade" onRequestClose={() => setPickerTarget(null)}>
      <View style={styles.pickerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerTarget(null)} accessibilityRole="button" accessibilityLabel="Đóng bộ chọn ngày giờ" />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerHeading}>{pickerTarget === 'date' ? 'Chọn ngày' : 'Chọn giờ'}</Text>
            <TouchableOpacity onPress={() => setPickerTarget(null)} accessibilityRole="button" accessibilityLabel="Xong">
              <Text style={styles.pickerDone}>Xong</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={selectedDate}
            mode={pickerTarget}
            display={pickerTarget === 'date' ? 'inline' : 'spinner'}
            locale="vi_VN"
            themeVariant="light"
            is24Hour
            accentColor="#00ADFC"
            onValueChange={(_event, date) => updatePickerValue(date)}
          />
        </View>
      </View>
    </Modal> : null}
  </>;
}

const styles = StyleSheet.create({
  savingHint: { color: '#64748B', fontSize: 12, fontFamily: 'Roboto', lineHeight: 18, marginTop: 10, textAlign: 'center' },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 25, 47, 0.48)' },
  sheet: { maxHeight: '90%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heading: { fontSize: 22, fontFamily: 'Roboto', color: '#0A2540' },
  close: { padding: 10 },
  label: { color: '#66788B', fontSize: 14, fontFamily: 'Roboto', marginBottom: 7, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#D7E5EC', borderRadius: 14, padding: 14, minHeight: 54, color: '#0A2540', backgroundColor: '#F8FBFD', fontSize: 16, fontFamily: 'Roboto' },
  title: { minHeight: 70, textAlignVertical: 'top' },
  pickerField: { borderWidth: 1, borderColor: '#D7E5EC', borderRadius: 14, paddingHorizontal: 14, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FBFD' },
  pickerValue: { color: '#0A2540', fontSize: 16, fontFamily: 'Roboto' },
  row: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  error: { color: '#DC2626', marginTop: 12 },
  save: { backgroundColor: '#00ADFC', borderRadius: 15, alignItems: 'center', padding: 15, marginTop: 20 },
  disabled: { opacity: 0.5 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Roboto',  },
  pickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 25, 47, 0.48)' },
  pickerSheet: { maxHeight: '90%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pickerHeading: { color: '#0A2540', fontSize: 20, fontFamily: 'Roboto' },
  pickerDone: { color: '#00ADFC', fontSize: 16, fontFamily: 'Roboto' },
});
