import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Meeting } from '../types/meeting';
import { isSameDay } from '../utils/dateUtils';
import { CALENDAR_COLORS, getCalendarAccentColor, getCalendarCardBackground } from '../utils/calendarColor';
import { formatAdvanceNotice } from '../utils/formatAdvanceNotice';
import { Daypart, DaypartIcon, ScheduleIcon } from './ScheduleIcons';
import { useAppDialog, useCancelMeetingDialog } from './AppDialog';

interface NotesScreenProps {
  today: Date;
  meetings: Meeting[];
  calendarColor: string;
  onCalendarColorChange: (color: string) => void;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDelete: (id: string) => void;
  onEdit: (meeting: Meeting) => void;
  onSendTestNotification?: () => Promise<boolean>;
}

type ScheduleGroup = { period: Daypart; label: string; items: Meeting[] };
type SortMode = 'reminder' | 'title' | 'created-desc' | 'created-asc';

const SORT_STORAGE_KEY = 'notes.sortMode';
const SORT_OPTIONS: { id: SortMode; title: string; subtitle: string }[] = [
  { id: 'reminder', title: 'Thời gian nhắc nhở', subtitle: 'Lịch sắp tới gần nhất lên đầu' },
  { id: 'title', title: 'Tên lịch hẹn (A–Z)', subtitle: 'Sắp xếp theo tên lịch hẹn' },
  { id: 'created-desc', title: 'Thời gian tạo (Mới đến cũ)', subtitle: 'Lịch vừa tạo lên đầu' },
  { id: 'created-asc', title: 'Thời gian tạo (Cũ đến mới)', subtitle: 'Lịch tạo lâu nhất lên đầu' },
];

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareMeetings(a: Meeting, b: Meeting, mode: SortMode): number {
  if (mode === 'title') return a.title.localeCompare(b.title, 'vi', { sensitivity: 'base' });
  if (mode === 'created-desc') return timestamp(b.createdAt) - timestamp(a.createdAt);
  if (mode === 'created-asc') return timestamp(a.createdAt) - timestamp(b.createdAt);

  const aUpcoming = a.status === 'UPCOMING' || a.status === 'REMINDING';
  const bUpcoming = b.status === 'UPCOMING' || b.status === 'REMINDING';
  if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
  const aReminder = timestamp(a.firstReminderTime);
  const bReminder = timestamp(b.firstReminderTime);
  return aUpcoming ? aReminder - bReminder : timestamp(b.meetingTime) - timestamp(a.meetingTime);
}

function ScheduleCard({
  meeting,
  showDate = false,
  calendarColor,
  onSimulateAlarm,
  onDelete,
  onEdit,
}: {
  meeting: Meeting;
  showDate?: boolean;
  calendarColor: string;
  onSimulateAlarm: (meeting: Meeting) => void;
  onDelete: (id: string) => void;
  onEdit: (meeting: Meeting) => void;
}) {
  const confirmCancelMeeting = useCancelMeetingDialog(onDelete);
  const date = new Date(meeting.meetingTime);
  const acknowledged = meeting.status === 'ACKNOWLEDGED';
  const reminding = meeting.status === 'REMINDING';
  const statusText = acknowledged
    ? 'Đã xác nhận nhớ'
    : reminding
      ? 'Đang báo thức...'
      : meeting.status === 'EXPIRED'
        ? 'Đã qua'
        : 'Nhắc lại mỗi ' + meeting.repeatIntervalMinutes + 'p';
  const confirmCancel = () => confirmCancelMeeting(meeting);

  return <View style={[styles.meetingCard, { backgroundColor: getCalendarCardBackground(calendarColor) }, calendarColor === '#FFFFFF' && styles.whiteMeetingCard]}>
    <View style={[styles.accent, { backgroundColor: getCalendarAccentColor(calendarColor) }]} />
    <View style={styles.timeColumn}>
      <Text style={styles.timeText}>{date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
      <Text style={styles.leadText}>-{formatAdvanceNotice(meeting.advanceNoticeMinutes, true)}</Text>
    </View>
    <View style={styles.meetingContent}>
      <Text style={styles.meetingTitle} numberOfLines={2}>{meeting.title}</Text>
      <Text style={styles.meetingStatus} numberOfLines={1}>{statusText}</Text>
      {showDate ? <Text style={styles.meetingDate}>{date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text> : null}
    </View>
    <View style={styles.actions}>
      <TouchableOpacity style={styles.actionButton} onPress={() => onEdit(meeting)} accessibilityRole="button" accessibilityLabel={'Sửa ' + meeting.title}>
        <ScheduleIcon name="edit" size={18} color="#31779C" />
      </TouchableOpacity>
      {!acknowledged ? <TouchableOpacity style={styles.reminderButton} onPress={() => onSimulateAlarm(meeting)} accessibilityRole="button" accessibilityLabel={'Thử nhắc lịch ' + meeting.title}>
        <ScheduleIcon name="mic" size={17} color="#E89A16" />
      </TouchableOpacity> : null}
      <TouchableOpacity style={styles.actionButton} onPress={confirmCancel} accessibilityRole="button" accessibilityLabel={'Hủy lịch ' + meeting.title}>
        <ScheduleIcon name="close" size={16} color="#A0AEC0" />
      </TouchableOpacity>
    </View>
  </View>;
}

export function NotesScreen({ today, meetings, calendarColor, onCalendarColorChange, onSimulateAlarm, onDelete, onEdit, onSendTestNotification }: NotesScreenProps) {
  const showDialog = useAppDialog();
  const [notificationSent, setNotificationSent] = useState(false);
  const [notificationSending, setNotificationSending] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('reminder');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [colorModalVisible, setColorModalVisible] = useState(false);
  const [visibleOtherCount, setVisibleOtherCount] = useState(30);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(SORT_STORAGE_KEY).then(savedSort => {
      if (!mounted) return;
      if (SORT_OPTIONS.some(option => option.id === savedSort)) setSortMode(savedSort as SortMode);
    }).catch(error => console.warn('Không thể tải tùy chọn lịch:', error));
    return () => { mounted = false; };
  }, []);

  const selectSortMode = (mode: SortMode) => {
    setSortMode(mode);
    setSortModalVisible(false);
    AsyncStorage.setItem(SORT_STORAGE_KEY, mode).catch(error => console.warn('Không thể lưu cách sắp xếp:', error));
  };

  const selectCalendarColor = (color: string) => {
    onCalendarColorChange(color);
    setColorModalVisible(false);
  };

  const { todayMeetings, groups, otherMeetings } = useMemo(() => {
    const sorted = [...meetings].sort((a, b) => compareMeetings(a, b, sortMode));
    const todayItems = sorted.filter(meeting => isSameDay(new Date(meeting.meetingTime), today));
    const otherItems = sorted.filter(meeting => {
      const meetingDate = new Date(meeting.meetingTime);
      return meetingDate.getTime() > today.getTime() && !isSameDay(meetingDate, today);
    });
    const dayparts: ScheduleGroup[] = [
      { period: 'morning', label: 'Buổi sáng', items: todayItems.filter(meeting => new Date(meeting.meetingTime).getHours() < 12) },
      { period: 'afternoon', label: 'Buổi chiều', items: todayItems.filter(meeting => {
        const hour = new Date(meeting.meetingTime).getHours();
        return hour >= 12 && hour < 18;
      }) },
      { period: 'evening', label: 'Buổi tối', items: todayItems.filter(meeting => new Date(meeting.meetingTime).getHours() >= 18) },
    ];
    return { todayMeetings: todayItems, groups: dayparts.filter(group => group.items.length > 0), otherMeetings: otherItems };
  }, [meetings, today, sortMode]);

  const handleTestNotification = async () => {
    if (!onSendTestNotification || notificationSending) return;
    setNotificationSending(true);
    try {
      const sent = await onSendTestNotification();
      if (sent) {
        setNotificationSent(true);
      } else {
        showDialog('Chưa gửi được thông báo', 'Hãy kiểm tra quyền thông báo trong Cài đặt thiết bị.');
      }
    } catch {
      showDialog('Chưa gửi được thông báo', 'Hãy kiểm tra quyền thông báo trong Cài đặt thiết bị.');
    } finally {
      setNotificationSending(false);
    }
  };

  return <View style={styles.root}>
    <View style={styles.header}>
      <Image source={require('../../assets/logo-brand.png')} style={styles.logo} resizeMode="contain" accessible accessibilityLabel="iGen Check" />
      <View style={styles.headerSpacer} />
      <TouchableOpacity style={styles.headerIconButton} onPress={() => setColorModalVisible(true)} accessibilityRole="button" accessibilityLabel="Cài màu lịch">
        <Ionicons name="ellipsis-horizontal" size={25} color="#0A2540" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerIconButton} onPress={() => setSortModalVisible(true)} accessibilityRole="button" accessibilityLabel="Sắp xếp lịch">
        <Ionicons name="swap-vertical" size={23} color="#0A2540" />
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>Lịch trình hôm nay</Text>
        <View style={styles.countBadge}><Text style={styles.countText}>{todayMeetings.length} cuộc hẹn</Text></View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.todayDate}>{today.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        {onSendTestNotification ? <TouchableOpacity
          style={[styles.notificationButton, notificationSent && styles.notificationSent]}
          onPress={handleTestNotification}
          disabled={notificationSending}
          accessibilityRole="button"
          accessibilityLabel="Thử thông báo"
        >
          <ScheduleIcon name={notificationSent ? 'check' : 'bell'} size={16} color="#31779C" />
          <Text style={styles.notificationText}>{notificationSending ? 'Đang gửi...' : notificationSent ? 'Đã gửi' : 'Thử thông báo'}</Text>
        </TouchableOpacity> : null}
      </View>

      {groups.length > 0 ? groups.map(group => <View key={group.period} style={styles.group}>
        <View style={styles.groupHeader}>
          <View style={styles.groupTitleRow}>
            <DaypartIcon period={group.period} />
            <Text style={styles.groupTitle}>{group.label}</Text>
          </View>
          <View style={styles.groupCount}><Text style={styles.groupCountText}>{group.items.length}</Text></View>
        </View>
        {group.items.map(meeting => <ScheduleCard key={meeting.id} meeting={meeting} calendarColor={calendarColor} onSimulateAlarm={onSimulateAlarm} onDelete={onDelete} onEdit={onEdit} />)}
      </View>) : <View style={styles.emptyToday}>
        <Image
          source={require('../../assets/empty-schedule-checklist.png')}
          style={styles.emptyIllustration}
          resizeMode="contain"
          accessibilityLabel="Hình minh họa tờ ghi chú và cây bút"
        />
        <Text style={styles.emptyTitle}>Hôm nay chưa có lịch hẹn</Text>
      </View>}

      {otherMeetings.length > 0 ? <View style={styles.otherSection}>
        <View style={styles.titleRow}>
          <Text style={styles.otherTitle}>Lịch ngày khác</Text>
          <Text style={styles.otherCount}>{otherMeetings.length} cuộc hẹn</Text>
        </View>
        {otherMeetings.slice(0, visibleOtherCount).map(meeting => <ScheduleCard key={meeting.id} meeting={meeting} calendarColor={calendarColor} showDate onSimulateAlarm={onSimulateAlarm} onDelete={onDelete} onEdit={onEdit} />)}
        {otherMeetings.length > visibleOtherCount ? <TouchableOpacity onPress={() => setVisibleOtherCount(count => count + 30)} accessibilityRole="button" style={styles.moreButton}>
          <Text style={styles.moreText}>Xem thêm lịch</Text>
        </TouchableOpacity> : null}
      </View> : null}
    </ScrollView>

    <Modal transparent visible={sortModalVisible} animationType="slide" onRequestClose={() => setSortModalVisible(false)}>
      <SafeAreaProvider style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortModalVisible(false)} accessibilityRole="button" accessibilityLabel="Đóng bảng sắp xếp" />
        <SafeAreaView style={styles.bottomSheet} edges={['bottom']}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Sắp xếp lịch</Text>
            <TouchableOpacity onPress={() => setSortModalVisible(false)} accessibilityRole="button" accessibilityLabel="Đóng">
              <Text style={styles.doneText}>Xong</Text>
            </TouchableOpacity>
          </View>
          {SORT_OPTIONS.map(option => {
            const selected = sortMode === option.id;
            return <TouchableOpacity key={option.id} style={styles.sortOption} onPress={() => selectSortMode(option.id)} accessibilityRole="radio" accessibilityState={{ checked: selected }}>
              <View style={styles.sortOptionText}>
                <Text style={styles.sortOptionTitle}>{option.title}</Text>
                <Text style={styles.sortOptionSubtitle}>{option.subtitle}</Text>
              </View>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={selected ? '#00ADFC' : '#A7B2BE'} />
            </TouchableOpacity>;
          })}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>

    <Modal transparent visible={colorModalVisible} animationType="slide" onRequestClose={() => setColorModalVisible(false)}>
      <SafeAreaProvider style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setColorModalVisible(false)} accessibilityRole="button" accessibilityLabel="Đóng bảng màu" />
        <SafeAreaView style={styles.bottomSheet} edges={['bottom']}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Màu lịch</Text>
            <TouchableOpacity onPress={() => setColorModalVisible(false)} accessibilityRole="button" accessibilityLabel="Đóng">
              <Text style={styles.doneText}>Xong</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.colorDescription}>Chọn màu hiển thị trên lịch hẹn</Text>
          <View style={styles.colorGrid}>
            {CALENDAR_COLORS.map(color => {
              const selected = calendarColor === color;
              return <TouchableOpacity key={color} style={styles.colorOption} onPress={() => selectCalendarColor(color)} accessibilityRole="radio" accessibilityLabel={`Màu ${color}`} accessibilityState={{ checked: selected }}>
                <View style={[styles.colorSwatch, color === '#FFFFFF' && styles.whiteColorSwatch, { backgroundColor: color }, selected && styles.selectedColorSwatch, selected && color === '#FFFFFF' && styles.selectedWhiteColorSwatch]}>
                  {selected ? <Ionicons name="checkmark" size={20} color={color === '#FFFFFF' ? '#0A2540' : '#FFFFFF'} /> : null}
                </View>
              </TouchableOpacity>;
            })}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 72, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 152, height: 51 },
  headerSpacer: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 125 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 21, flexShrink: 1 },
  countBadge: { backgroundColor: '#EAF7FE', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  countText: { color: '#078FD5', fontFamily: 'Roboto', fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, marginBottom: 18 },
  todayDate: { color: '#66788B', fontFamily: 'Roboto', fontSize: 13, flex: 1, textTransform: 'capitalize' },
  notificationButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: '#F0F7FA' },
  notificationSent: { backgroundColor: '#E8FAF0' },
  notificationText: { color: '#31566D', fontFamily: 'Roboto', fontSize: 11 },
  group: { backgroundColor: '#F8FBFD', borderRadius: 17, padding: 10, marginBottom: 13, borderWidth: 1, borderColor: '#E8F1F5' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5, marginBottom: 9 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupTitle: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 13, letterSpacing: 0.4 },
  groupCount: { minWidth: 25, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  groupCountText: { color: '#64748B', fontFamily: 'Roboto', fontSize: 12 },
  meetingCard: { backgroundColor: '#FFFFFF', borderRadius: 13, paddingVertical: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 7, minHeight: 70 },
  whiteMeetingCard: { borderWidth: 1, borderColor: '#E8EEF3' },
  accent: { width: 3, height: 40, borderRadius: 2, marginRight: 8 },
  timeColumn: { minWidth: 51 },
  timeText: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 14 },
  leadText: { color: '#91A0AF', fontFamily: 'Roboto', fontSize: 11, marginTop: 3 },
  meetingContent: { flex: 1, minWidth: 0, paddingHorizontal: 5 },
  meetingTitle: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 14, lineHeight: 19 },
  meetingStatus: { color: '#718198', fontFamily: 'Roboto', fontSize: 11, marginTop: 3 },
  meetingDate: { color: '#078FD5', fontFamily: 'Roboto', fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  actionButton: { width: 29, height: 36, alignItems: 'center', justifyContent: 'center' },
  reminderButton: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF2CD' },
  emptyToday: { minHeight: 270, borderRadius: 17, backgroundColor: '#F8FBFD', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18 },
  emptyIllustration: { width: 180, height: 180 },
  emptyTitle: { color: '#75899B', fontFamily: 'Roboto', fontSize: 14, textAlign: 'center' },
  otherSection: { marginTop: 8, gap: 4 },
  otherTitle: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 16, flex: 1, marginBottom: 7 },
  otherCount: { color: '#8494A5', fontFamily: 'Roboto', fontSize: 12 },
  moreButton: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  moreText: { color: '#078FD5', fontFamily: 'Roboto', fontSize: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.46)' },
  bottomSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 22, fontWeight: '400' },
  doneText: { color: '#078FD5', fontFamily: 'Roboto', fontSize: 16, fontWeight: '600' },
  sortOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EEF3' },
  sortOptionText: { flex: 1, gap: 4 },
  sortOptionTitle: { color: '#0A2540', fontFamily: 'Roboto', fontSize: 15 },
  sortOptionSubtitle: { color: '#8090A0', fontFamily: 'Roboto', fontSize: 12 },
  colorDescription: { color: '#718198', fontFamily: 'Roboto', fontSize: 14, marginBottom: 20 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 16 },
  colorOption: { width: '25%', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  colorSwatch: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  whiteColorSwatch: { borderWidth: 1, borderColor: '#CBD5DF' },
  selectedColorSwatch: { borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#0A2540', shadowOpacity: 0.24, shadowRadius: 5, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  selectedWhiteColorSwatch: { borderColor: '#00ADFC' },
});
