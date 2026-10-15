import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Meeting } from './src/types/meeting';
import { AppSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { StorageService } from './src/services/storage';
import { AlarmManager } from './src/services/alarmManager';
import { isSameDay } from './src/utils/dateUtils';

import { Header } from './src/components/Header';
import { YearView } from './src/components/YearView';
import { FullMonthCalendar } from './src/components/FullMonthCalendar';
import { CalendarView } from './src/components/CalendarView';
import { DayHourlyTimeline } from './src/components/DayHourlyTimeline';
import { AlarmOverlay } from './src/components/AlarmOverlay';
import { VoiceInputModal } from './src/components/VoiceInputModal';
import { SettingsModal } from './src/components/SettingsModal';

export default function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Chế độ xem: 'YEAR' (Xem cả năm) | 'MONTH' (Mặc định: Lịch cả tháng) | 'DAY' (Chi tiết dãy giờ theo ngày)
  const [viewMode, setViewMode] = useState<'YEAR' | 'MONTH' | 'DAY'>('MONTH');

  // Ngày đang được chọn trên lịch
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Text gợi ý khởi tạo cho modal giọng nói khi bấm vào khung giờ trống
  const [initialVoiceText, setInitialVoiceText] = useState<string>('');

  // Modals state
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Active alarm for iPhone-style full overlay
  const [activeAlarmMeeting, setActiveAlarmMeeting] = useState<Meeting | null>(null);

  // Load initial data from SQLite & sync background alarms
  const loadData = useCallback(async () => {
    const loadedSettings = await StorageService.getSettings();
    setSettings(loadedSettings);

    const loadedMeetings = await StorageService.getMeetings();
    setMeetings(loadedMeetings);

    // Lên lịch thông báo nền cho các cuộc hẹn sắp tới
    for (const m of loadedMeetings) {
      if (m.status === 'UPCOMING') {
        await AlarmManager.scheduleBackgroundAlarms(m, loadedSettings, loadedMeetings);
      }
    }

    // Lên lịch thông báo tổng hợp lịch hôm nay
    await AlarmManager.scheduleDailyBriefing(loadedMeetings, loadedSettings);
  }, []);

  useEffect(() => {
    loadData();

    // Khởi tạo AlarmManager với callback khi có chuông reo
    AlarmManager.init((meeting) => {
      setActiveAlarmMeeting(meeting);
    });
  }, [loadData]);

  // Bộ đếm thời gian kiểm tra nhắc lịch theo chu kỳ
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const currentMeetings = await StorageService.getMeetings();

      for (const m of currentMeetings) {
        if (m.status === 'UPCOMING') {
          const firstReminder = new Date(m.firstReminderTime).getTime();
          if (now >= firstReminder) {
            await AlarmManager.triggerAlarm(m, settings);
            const refreshed = await StorageService.getMeetings();
            setMeetings(refreshed);
            break;
          }
        }
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
    setIsVoiceModalOpen(false);

    const firstReminder = AlarmManager.calculateFirstReminder(
      data.meetingTime,
      data.advanceNoticeMinutes
    );

    const newMeeting: Meeting = {
      id: `meeting-${Date.now()}`,
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

    const updated = await StorageService.addMeeting(newMeeting);
    setMeetings(updated);

    // Chuyển ngày được chọn sang ngày của cuộc hẹn vừa thêm & chuyển sang xem chi tiết ngày đó
    setSelectedDate(data.meetingTime);
    setViewMode('DAY');

    // Kích hoạt thông báo nền hệ điều hành
    await AlarmManager.scheduleBackgroundAlarms(newMeeting, settings, updated);
    await AlarmManager.scheduleDailyBriefing(updated, settings);
  };

  // Tắt báo thức (Đã nhớ)
  const handleDismissAlarm = async () => {
    if (!activeAlarmMeeting) return;
    const meetingId = activeAlarmMeeting.id;
    setActiveAlarmMeeting(null);

    await AlarmManager.acknowledgeAndDismiss(meetingId);
    const refreshed = await StorageService.getMeetings();
    setMeetings(refreshed);
  };

  // Thử chuông ngay
  const handleSimulateAlarm = async (meeting: Meeting) => {
    await AlarmManager.triggerAlarm(meeting, settings);
    const refreshed = await StorageService.getMeetings();
    setMeetings(refreshed);
  };

  // Xóa cuộc họp
  const handleDeleteMeeting = async (id: string) => {
    await AlarmManager.cancelAlarm(id);
    const updated = await StorageService.deleteMeeting(id);
    setMeetings(updated);
    await AlarmManager.scheduleDailyBriefing(updated, settings);
  };

  // Lưu cài đặt
  const handleSaveSettings = async (newSettings: AppSettings) => {
    setIsSettingsModalOpen(false);
    setSettings(newSettings);
    await StorageService.saveSettings(newSettings);
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
            onSendTestNotification={() =>
              AlarmManager.sendInstantDailyBriefingNotification(meetings)
            }
          />
        ) : (
          /* LEVEL 2: MÀN HÌNH BÊN TRONG - DÃY GIỜ CHI TIẾT + THANH NGÀY TRƯỢT NGANG TRONG THÁNG ĐÓ */
          <View style={styles.contentBody}>
            {/* Thanh ngày trượt ngang giới hạn trong tháng */}
            <CalendarView
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
            accessibilityLabel="Nói để thêm lịch họp"
          >
            <Ionicons name="mic" size={20} color="#FFFFFF" />
            <Text style={styles.floatingVoiceBtnText}>Nói để thêm lịch</Text>
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
      <VoiceInputModal
        visible={isVoiceModalOpen}
        initialText={initialVoiceText}
        selectedDate={selectedDate}
        settings={settings}
        onClose={() => setIsVoiceModalOpen(false)}
        onSaveMeeting={handleSaveVoiceMeeting}
      />

      {/* Modal cài đặt */}
      <SettingsModal
        visible={isSettingsModalOpen}
        settings={settings}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        onTestNotification={() =>
          AlarmManager.sendInstantDailyBriefingNotification(meetings)
        }
      />
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
