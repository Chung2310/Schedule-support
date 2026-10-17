import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  AppState,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Meeting } from './src/types/meeting';
import { AppSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { StorageService } from './src/services/storage';
import { TodayWidgets } from './src/services/todayWidgets';
import { AlarmManager } from './src/services/alarmManager';
import { isSameDay } from './src/utils/dateUtils';
import { useLocalDay } from './src/hooks/useLocalDay';

import { Header } from './src/components/Header';
import { YearView } from './src/components/YearView';
import { FullMonthCalendar } from './src/components/FullMonthCalendar';
import { CalendarView } from './src/components/CalendarView';
import { DayHourlyTimeline } from './src/components/DayHourlyTimeline';
import { AlarmOverlay } from './src/components/AlarmOverlay';
import { VoiceInputModal } from './src/components/VoiceInputModal';
import { SettingsModal } from './src/components/SettingsModal';
import { EditMeetingModal } from './src/components/EditMeetingModal';
import { applyMeetingEdit, MeetingEditFields } from './src/utils/meetingEdit';
import { MeetingConflictError } from './src/utils/meetingConflict';

export default function App() {
  const today = useLocalDay();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isCalendarLoaded, setIsCalendarLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Chế độ xem: 'YEAR' (Xem cả năm) | 'MONTH' (Mặc định: Lịch cả tháng) | 'DAY' (Chi tiết dãy giờ theo ngày)
  const [viewMode, setViewMode] = useState<'YEAR' | 'MONTH' | 'DAY'>('MONTH');

  // Ngày đang được chọn trên lịch
  const [selectedDate, setSelectedDate] = useState<Date>(() => today);
  const previousTodayRef = useRef(today);

  // Text gợi ý khởi tạo cho modal giọng nói khi bấm vào khung giờ trống
  const [initialVoiceText, setInitialVoiceText] = useState<string>('');

  // Modals state
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Active alarm for iPhone-style full overlay
  const [activeAlarmMeeting, setActiveAlarmMeeting] = useState<Meeting | null>(null);

  useEffect(() => {
    const previous = previousTodayRef.current;
    previousTodayRef.current = today;
    if (isSameDay(previous, today)) return;
    // Follow today when idle on today; preserve another day or an open voice/edit draft.
    if (!isVoiceModalOpen && !editingMeeting) {
      setSelectedDate((selected) => isSameDay(selected, previous) ? today : selected);
    }
  }, [today, isVoiceModalOpen, editingMeeting]);

  // Load initial data from SQLite & sync background alarms
  const loadData = useCallback(async () => {
    const loadedSettings = await StorageService.getSettings();
    setSettings(loadedSettings);

    const loadedMeetings = await StorageService.getMeetings();
    setMeetings(loadedMeetings);
    setIsCalendarLoaded(true);

    await AlarmManager.syncNotifications(loadedSettings);
    AlarmManager.resumeForegroundReminders(loadedMeetings, loadedSettings);
  }, []);

  useEffect(() => {
    if (isCalendarLoaded) void TodayWidgets.sync(meetings);
  }, [meetings, isCalendarLoaded, today]);

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await AlarmManager.init({
          onAlarm: setActiveAlarmMeeting,
          onAcknowledged: (meeting) => {
            setMeetings((previous) => previous.map((item) => item.id === meeting.id ? meeting : item));
            setActiveAlarmMeeting((previous) => previous?.id === meeting.id ? null : previous);
          },
          onNotificationOpen: (meeting) => {
            setSelectedDate(new Date(meeting.meetingTime));
            setViewMode('DAY');
          },
        });
        if (!disposed) await loadData();
      } finally {
        refreshing = false;
      }
    };
    const refreshSafely = () => {
      void refresh().catch((error) => console.warn('Could not refresh local calendar:', error));
    };
    refreshSafely();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSafely();
      else AlarmManager.pauseForegroundReminders();
    });
    return () => {
      disposed = true;
      subscription.remove();
      AlarmManager.pauseForegroundReminders();
    };
  }, [loadData]);

  // Bộ đếm thời gian kiểm tra nhắc lịch theo chu kỳ
  useEffect(() => {
    let checking = false;
    const interval = setInterval(async () => {
      if (checking || AppState.currentState !== 'active') return;
      checking = true;
      try {
        const now = Date.now();
        const currentMeetings = await StorageService.getMeetings();
        for (const m of currentMeetings) {
          if (m.status === 'UPCOMING') {
            if (settings.stopOnMeetingStart && new Date(m.meetingTime).getTime() <= now) continue;
            const firstReminder = new Date(m.firstReminderTime).getTime();
            if (now >= firstReminder) {
              await AlarmManager.triggerAlarm(m, settings);
              setMeetings(await StorageService.getMeetings());
              break;
            }
          }
        }
      } catch (error) {
        console.warn('Could not check reminders:', error);
      } finally {
        checking = false;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [settings]);

  // Mở modal thu âm với một khung giờ cụ thể khi chạm vào ô giờ trống trên timeline
  const handleSlotPress = (hour: number) => {
    const hourStr = String(hour).padStart(2, '0');
    setInitialVoiceText(`${hourStr}h họp `);
    setIsVoiceModalOpen(true);
  };

  const handleOpenVoiceForSelectedDate = () => {
    setInitialVoiceText('');
    setIsVoiceModalOpen(true);
  };

  // Lưu lịch trực tiếp từ modal giọng nói 1 BƯỚC DUY NHẤT (One-Tap Save)
  const handleSaveVoiceMeeting = async (data: {
    title: string;
    meetingTime: Date;
    advanceNoticeMinutes: number;
    repeatIntervalMinutes: number;
    voiceText: string;
  }) => {
    const firstReminder = AlarmManager.calculateFirstReminder(
      data.meetingTime,
      data.advanceNoticeMinutes
    );

    const newMeeting: Meeting = {
      id: `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      title: data.title,
      meetingTime: data.meetingTime.toISOString(),
      advanceNoticeMinutes: data.advanceNoticeMinutes,
      repeatIntervalMinutes: data.repeatIntervalMinutes,
      firstReminderTime: firstReminder.toISOString(),
      status: 'UPCOMING',
      nagCount: 0,
      voiceText: data.voiceText,
      createdAt: new Date().toISOString(),
    };

    let updated: Meeting[];
    try {
      updated = await StorageService.addMeeting(newMeeting);
    } catch (error) {
      if (error instanceof MeetingConflictError) throw error;
      throw new Error('Chưa lưu được lịch trên thiết bị. Hãy kiểm tra dung lượng trống và thử lại.');
    }
    setMeetings(updated);

    // Chuyển ngày được chọn sang ngày của cuộc hẹn vừa thêm & chuyển sang xem chi tiết ngày đó
    setSelectedDate(data.meetingTime);
    setViewMode('DAY');

    // Kích hoạt thông báo nền hệ điều hành
    const notificationsScheduled = await AlarmManager.syncNotifications(settings);
    setIsVoiceModalOpen(false);
    if (!notificationsScheduled && Platform.OS !== 'web') {
      Alert.alert('Đã lưu lịch hẹn', 'Chưa thể bật thông báo nhắc lịch. Hãy kiểm tra quyền thông báo của ứng dụng trong Cài đặt thiết bị.');
    } else if (AlarmManager.voiceFallbackMeetingIds.has(newMeeting.id)) {
      Alert.alert('Đã lưu lịch hẹn', 'Lịch này sẽ dùng chuông báo vì chưa tạo được giọng đọc. Hãy dùng bản cài mới và kiểm tra giọng tiếng Việt đã tải trên thiết bị.');
    }
  };

  // Tắt báo thức (Đã nhớ)
  const handleSaveEditedMeeting = async (fields: MeetingEditFields, voiceTarget?: Meeting) => {
    const target = voiceTarget ?? editingMeeting;
    if (!target) return;
    let edited: Meeting;
    let updated: Meeting[];
    try {
      const latest = (await StorageService.getMeetings()).find(item => item.id === target.id);
      if (!latest) throw new Error('Cuộc họp này không còn tồn tại.');
      if (voiceTarget && (latest.title !== target.title || latest.meetingTime !== target.meetingTime || latest.advanceNoticeMinutes !== target.advanceNoticeMinutes || latest.repeatIntervalMinutes !== target.repeatIntervalMinutes)) {
        throw new Error('Lịch đã thay đổi. Vui lòng mở lại để kiểm tra trước khi sửa.');
      }
      edited = applyMeetingEdit(latest, fields);
      updated = await StorageService.updateMeeting(edited);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Chưa lưu được thay đổi. Vui lòng thử lại.');
    }
    setMeetings(updated);
    setSelectedDate(new Date(edited.meetingTime));
    setViewMode('DAY');
    setActiveAlarmMeeting(previous => previous?.id === edited.id ? null : previous);
    await AlarmManager.cancelAlarm(edited.id).catch(error => console.warn('Could not cancel old meeting reminders:', error));
    const scheduled = await AlarmManager.syncNotifications(settings);
    setEditingMeeting(null);
    if (voiceTarget) setIsVoiceModalOpen(false);
    AlarmManager.resumeForegroundReminders(updated, settings);
    if (!scheduled && Platform.OS !== 'web') {
      Alert.alert('Đã lưu thay đổi', 'Chưa cập nhật được thông báo nhắc lịch. Hãy kiểm tra quyền thông báo và mở lại ứng dụng.');
    } else if (AlarmManager.voiceFallbackMeetingIds.has(edited.id)) {
      Alert.alert('Đã lưu thay đổi', 'Lịch này sẽ dùng chuông báo vì chưa tạo được giọng đọc tiếng Việt trên thiết bị.');
    }
  };

  const handleDismissAlarm = async () => {
    if (!activeAlarmMeeting) return;
    const meetingId = activeAlarmMeeting.id;
    try {
      await AlarmManager.acknowledgeAndDismiss(meetingId);
      setActiveAlarmMeeting(null);
      setMeetings(await StorageService.getMeetings());
    } catch {
      Alert.alert('Chưa hoàn tất xác nhận', 'Không thể cập nhật lịch hoặc hủy thông báo. Bạn hãy thử lại.');
    }
  };

  // Thử chuông ngay
  const handleSimulateAlarm = async (meeting: Meeting) => {
    await AlarmManager.triggerAlarm(meeting, settings);
    const refreshed = await StorageService.getMeetings();
    setMeetings(refreshed);
  };

  // Xóa cuộc họp
  const handleDeleteMeeting = async (id: string) => {
    let updated: Meeting[];
    try {
      updated = await StorageService.deleteMeeting(id);
    } catch {
      Alert.alert('Chưa xóa được lịch', 'Không thể cập nhật dữ liệu trên thiết bị. Bạn hãy thử lại.');
      return;
    }
    setMeetings(updated);
    await AlarmManager.cancelAlarm(id).catch((error) => console.warn('Could not cancel meeting notifications:', error));
    await AlarmManager.syncNotifications(settings);
  };

  // Lưu cài đặt
  const handleSaveSettings = async (newSettings: AppSettings) => {
    try {
      await StorageService.saveSettings(newSettings);
    } catch {
      Alert.alert('Chưa lưu được cài đặt', 'Không thể ghi dữ liệu trên thiết bị. Bạn hãy thử lại.');
      return;
    }
    setSettings(newSettings);
    const scheduled = await AlarmManager.syncNotifications(newSettings);
    AlarmManager.pauseForegroundReminders();
    AlarmManager.resumeForegroundReminders(await StorageService.getMeetings(), newSettings);
    setIsSettingsModalOpen(false);
    if (!scheduled) {
      Alert.alert('Đã lưu cài đặt', 'Chưa cập nhật được thông báo nhắc lịch. Hãy kiểm tra quyền thông báo và mở lại ứng dụng.');
    } else if (AlarmManager.voiceFallbackMeetingIds.size > 0) {
      Alert.alert('Đã lưu cài đặt', 'Một số lịch vẫn dùng chuông vì chưa tạo được giọng đọc. Mở Cài đặt → Tùy chọn thêm → Thử thông báo khi khóa máy để kiểm tra.');
    }
  };

  // Danh sách cuộc họp của ngày đang được chọn
  const selectedDayMeetings = useMemo(() => {
    return meetings.filter((m) => isSameDay(new Date(m.meetingTime), selectedDate));
  }, [meetings, selectedDate]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.mainContainer}>
        {/* Header trên cùng: Nút back đưa lên trên hẳn và Tiêu đề "Lịch Họp" ở chính giữa */}
        <Header
          backTitle={
            viewMode === 'DAY'
              ? 'Lịch Tháng'
              : viewMode === 'MONTH'
              ? `${selectedDate.getFullYear()}`
              : null
          }
          onBack={
            viewMode === 'DAY'
              ? () => setViewMode('MONTH')
              : viewMode === 'MONTH'
              ? () => setViewMode('YEAR')
              : null
          }
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenVoiceModal={handleOpenVoiceForSelectedDate}
        />

        {/* NỘI DUNG CHÍNH: LEVEL 0 (XEM CẢ NĂM), LEVEL 1 (LỊCH CẢ THÁNG - MẶC ĐỊNH), LEVEL 2 (CHI TIẾT NGÀY) */}
        {viewMode === 'YEAR' ? (
          /* LEVEL 0: MÀN HÌNH XEM CẢ NĂM (12 THÁNG) */
          <YearView
            today={today}
            initialYear={selectedDate.getFullYear()}
            meetings={meetings}
            onSelectMonth={(year, monthIndex) => {
              setSelectedDate(new Date(year, monthIndex, 1));
              setViewMode('MONTH');
            }}
          />
        ) : viewMode === 'MONTH' ? (
          /* LEVEL 1: MÀN HÌNH LỊCH CẢ THÁNG (MẶC ĐỊNH KHI VÀO LỊCH) */
          <FullMonthCalendar
            today={today}
            meetings={meetings}
            selectedDate={selectedDate}
            onMonthChange={(date) => setSelectedDate(date)}
            onSelectDate={(date) => {
              // BẤM VÀO NGÀY TRÊN LỊCH -> MỞ RA CHI TIẾT NGÀY ĐÓ
              setSelectedDate(date);
              setViewMode('DAY');
            }}
            onSimulateAlarm={handleSimulateAlarm}
            onDeleteMeeting={handleDeleteMeeting}
            onEditMeeting={setEditingMeeting}
            onSendTestNotification={() =>
              AlarmManager.sendInstantDailyBriefingNotification(meetings)
            }
          />
        ) : (
          /* LEVEL 2: MÀN HÌNH BÊN TRONG - DÃY GIỜ CHI TIẾT + THANH NGÀY TRƯỢT NGANG TRONG THÁNG ĐÓ */
          <View style={styles.contentBody}>
            {/* Thanh ngày trượt ngang giới hạn trong tháng */}
            <CalendarView
              today={today}
              meetings={meetings}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate(date)}
            />

            {/* Dãy các giờ 06:00 - 23:00 hiển thị phẳng không đóng box */}
            <DayHourlyTimeline
              date={selectedDate}
              meetings={selectedDayMeetings}
              onSimulateAlarm={handleSimulateAlarm}
              onDeleteMeeting={handleDeleteMeeting}
              onEditMeeting={setEditingMeeting}
              onSlotPress={handleSlotPress}
              onAddMeeting={handleOpenVoiceForSelectedDate}
              style={styles.centerTimeline}
            />
          </View>
        )}

        {/* Nút bấm nổi ghi âm đơn giản ở đáy màn hình */}
        <View style={styles.floatingButtonContainer}>
          <TouchableOpacity
            style={styles.floatingVoiceBtn}
            activeOpacity={0.85}
            onPress={handleOpenVoiceForSelectedDate}
            accessibilityLabel="Nói để thêm hoặc sửa lịch họp"
          >
            <Ionicons name="mic" size={20} color="#FFFFFF" />
            <Text style={styles.floatingVoiceBtnText}>Nói để thêm / sửa lịch</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal Báo thức toàn màn hình kiểu iPhone */}
      <AlarmOverlay
        visible={!!activeAlarmMeeting}
        meeting={activeAlarmMeeting}
        onDismiss={handleDismissAlarm}
      />

      {/* Modal thu âm & xác nhận thông minh 1 BƯỚC DUY NHẤT */}
      {isVoiceModalOpen ? <VoiceInputModal
        visible={isVoiceModalOpen}
        initialText={initialVoiceText}
        selectedDate={selectedDate}
        settings={settings}
        onClose={() => setIsVoiceModalOpen(false)}
        onSaveMeeting={handleSaveVoiceMeeting}
        meetings={meetings}
        onEditMeeting={handleSaveEditedMeeting}
      /> : null}

      {/* Modal cài đặt */}
      {editingMeeting ? <EditMeetingModal
        key={editingMeeting.id}
        meeting={editingMeeting}
        onClose={() => setEditingMeeting(null)}
        onSave={handleSaveEditedMeeting}
      /> : null}

      {isSettingsModalOpen ? <SettingsModal
        visible={isSettingsModalOpen}
        settings={settings}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        onTestNotification={(previewSettings) =>
          AlarmManager.scheduleVoicePreview(previewSettings)
        }
      /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentBody: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerTimeline: {
    flex: 1,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99,
  },
  floatingVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0A2540',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#0A2540',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  floatingVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
