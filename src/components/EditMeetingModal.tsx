import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Meeting } from '../types/meeting';
import { applyMeetingEdit, meetingEditFields, MeetingEditFields } from '../utils/meetingEdit';

interface Props {
  meeting: Meeting;
  onClose: () => void;
  onSave: (fields: MeetingEditFields) => Promise<void>;
}

export function EditMeetingModal({ meeting, onClose, onSave }: Props) {
  const [fields, setFields] = useState(() => meetingEditFields(meeting));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const change = (key: keyof MeetingEditFields, value: string) => {
    setFields(previous => ({ ...previous, [key]: value }));
    setError('');
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
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => { if (!savingRef.current) onClose(); }}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
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
                <Text style={styles.label}>Ngày (DD/MM/YYYY)</Text>
                <TextInput accessibilityLabel="Ngày cuộc họp" style={styles.input} value={fields.date} placeholder="DD/MM/YYYY"
                  onChangeText={value => change('date', value)} editable={!saving} autoCorrect={false} maxLength={10} />
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>Giờ (HH:mm)</Text>
                <TextInput accessibilityLabel="Giờ cuộc họp" style={styles.input} value={fields.time} placeholder="HH:mm"
                  onChangeText={value => change('time', value)} editable={!saving} autoCorrect={false} maxLength={5} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.label}>Báo trước (phút)</Text>
                <TextInput accessibilityLabel="Báo trước bao nhiêu phút" style={styles.input} keyboardType="number-pad"
                  value={fields.advance} onChangeText={value => change('advance', value)} editable={!saving} maxLength={5} />
              </View>
              <View style={styles.column}>
                <Text style={styles.label}>Nhắc lại (phút)</Text>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  savingHint: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '90%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0A2540' },
  close: { padding: 10 },
  label: { color: '#475569', fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, minHeight: 46, color: '#0F172A', backgroundColor: '#F8FAFC', fontSize: 16 },
  title: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  error: { color: '#DC2626', marginTop: 12 },
  save: { backgroundColor: '#0A2540', borderRadius: 12, alignItems: 'center', padding: 14, marginTop: 20 },
  disabled: { opacity: 0.5 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
