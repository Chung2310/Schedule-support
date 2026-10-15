import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Meeting } from '../types/meeting';
import { AppSettings } from '../types/settings';
import { SpeechService } from './speechService';
import { StorageService } from './storage';
import { isSameDay } from '../utils/dateUtils';

// Hiển thị thông báo dạng Banner + Âm thanh nổi bật
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const NOTIFICATION_CATEGORY_ID = 'MEETING_ALARM_ACTIONS';
const NOTIFICATION_CHANNEL_ID = 'ceo_meeting_alarms';
const DAILY_BRIEFING_ID = 'ceo_daily_schedule_briefing';

type AlarmTriggerCallback = (meeting: Meeting) => void;

/**
 * Xây dựng nội dung thông báo tổng hợp lịch hôm nay theo tổ chức chuyên nghiệp,
 * phân chia rõ ràng theo buổi Sáng / Chiều / Tối giúp người xem nắm bắt ngay lập tức.
 */
export function buildTodayScheduleBriefing(todayMeetings: Meeting[]): {
  title: string;
  subtitle: string;
  body: string;
  todayCount: number;
} {
  const count = todayMeetings.length;
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (count === 0) {
    return {
      title: `📅 Lịch Trình Hôm Nay (${dateFormatted})`,
      subtitle: 'Lịch trống',
      body: 'Hôm nay không có lịch hẹn nào. Lịch trình của bạn đang hoàn toàn trống.',
      todayCount: 0,
    };
  }

  // Sắp xếp theo thứ tự thời gian tăng dần
  const sorted = [...todayMeetings].sort(
    (a, b) => new Date(a.meetingTime).getTime() - new Date(b.meetingTime).getTime()
  );

  const morning: Meeting[] = [];
  const afternoon: Meeting[] = [];
  const evening: Meeting[] = [];

  for (const m of sorted) {
    const hours = new Date(m.meetingTime).getHours();
    if (hours < 12) {
      morning.push(m);
    } else if (hours < 18) {
      afternoon.push(m);
    } else {
      evening.push(m);
    }
  }

  const sections: string[] = [];

  const formatMeetingLine = (m: Meeting) => {
    const d = new Date(m.meetingTime);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const statusNote = m.status === 'ACKNOWLEDGED' ? ' [✓ Đã nhớ]' : '';
    return `• ${hh}:${mm} - ${m.title}${statusNote}`;
  };

  if (morning.length > 0) {
    sections.push(`☀️ SÁNG (${morning.length}):\n` + morning.map(formatMeetingLine).join('\n'));
  }

  if (afternoon.length > 0) {
    sections.push(`🌤️ CHIỀU (${afternoon.length}):\n` + afternoon.map(formatMeetingLine).join('\n'));
  }

  if (evening.length > 0) {
    sections.push(`🌙 TỐI (${evening.length}):\n` + evening.map(formatMeetingLine).join('\n'));
  }

  return {
    title: `📅 Lịch Hôm Nay (${dateFormatted}) • ${count} cuộc hẹn`,
    subtitle: `Tổng hợp ${count} cuộc hẹn trong ngày`,
    body: sections.join('\n\n'),
    todayCount: count,
  };
}

class AlarmManagerService {
  private activeReminders: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private scheduledNotificationIds: Map<string, string[]> = new Map();
  private onAlarmTriggerCallback: AlarmTriggerCallback | null = null;
  private isInitialized = false;

  async init(callback?: AlarmTriggerCallback) {
    if (callback) {
      this.onAlarmTriggerCallback = callback;
    }
    if (this.isInitialized) return;

    if (Platform.OS !== 'web') {
      try {
        // Xin quyền thông báo hệ thống
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        // Cấu hình Kênh thông báo Android (Chạy nền, ưu tiên cao nhất, rung và reo khi khóa máy)
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
            name: 'Báo thức lịch họp',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 250, 500],
            lightColor: '#0A2540',
            sound: 'default',
            enableVibrate: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
          });
        }

        // Cấu hình Nút hành động nhanh "ĐÃ NHỚ" ngay trên màn hình khóa / banner thông báo
        await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_ID, [
          {
            identifier: 'DISMISS_ACTION',
            buttonTitle: 'Đã nhớ (Tắt báo thức)',
            options: {
              isDestructive: false,
              isAuthenticationRequired: false,
            },
          },
        ]);

        // Lắng nghe khi người dùng bấm vào thông báo nền hoặc bấm nút "Đã nhớ"
        Notifications.addNotificationResponseReceivedListener(async (response) => {
          const meetingId = response.notification.request.content.data?.meetingId as string | undefined;
          if (meetingId && typeof meetingId === 'string') {
            console.log(`Notification tapped for meeting: ${meetingId}`);
            await this.acknowledgeAndDismiss(meetingId);
          }
        });
      } catch (e) {
        console.warn('Could not initialize background notifications', e);
      }
    }

    this.isInitialized = true;
  }

  setAlarmCallback(callback: AlarmTriggerCallback) {
    this.onAlarmTriggerCallback = callback;
  }

  calculateFirstReminder(meetingTime: Date, advanceNoticeMinutes: number): Date {
    return new Date(meetingTime.getTime() - advanceNoticeMinutes * 60 * 1000);
  }

  /**
   * Lên lịch THÔNG BÁO NỀN (Background Notifications) cho toàn bộ chu kỳ nhắc nhở
   * Hoạt động ngay cả khi ứng dụng bị đóng hoàn toàn hoặc điện thoại đang khóa màn hình.
   * Thông báo chứa đầy đủ thông tin: Giờ họp, báo trước, nội dung và các lịch tiếp theo hôm nay.
   */
  async scheduleBackgroundAlarms(meeting: Meeting, settings: AppSettings, allMeetings?: Meeting[]) {
    if (Platform.OS === 'web') return;

    try {
      // Hủy các thông báo nền cũ của cuộc họp này nếu có
      await this.cancelBackgroundNotifications(meeting.id);

      const reminderDate = new Date(meeting.firstReminderTime);
      const meetingStart = new Date(meeting.meetingTime).getTime();
      const now = Date.now();
      const notificationIds: string[] = [];

      const meetingDate = new Date(meeting.meetingTime);
      const isMeetingToday = isSameDay(meetingDate, new Date());
      const hh = String(meetingDate.getHours()).padStart(2, '0');
      const mm = String(meetingDate.getMinutes()).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      // Lấy danh sách cuộc họp để hiển thị ngữ cảnh các lịch tiếp theo trong ngày
      const meetingsList = allMeetings || (await StorageService.getMeetings());
      const subsequentToday = meetingsList
        .filter(
          (m) =>
            m.id !== meeting.id &&
            isSameDay(new Date(m.meetingTime), meetingDate) &&
            new Date(m.meetingTime).getTime() > meetingStart
        )
        .sort((a, b) => new Date(a.meetingTime).getTime() - new Date(b.meetingTime).getTime());

      let nextAgendaText = '';
      if (subsequentToday.length > 0) {
        const nextList = subsequentToday
          .slice(0, 2)
          .map((m) => {
            const d = new Date(m.meetingTime);
            return `• ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${m.title}`;
          })
          .join('\n');
        nextAgendaText = `\n\n📌 Tiếp theo hôm nay:\n${nextList}`;
      }

      // 1. Lên lịch thông báo lần đầu tiên (Báo trước X phút)
      if (reminderDate.getTime() > now) {
        const title = `⏰ [${timeStr}] ${meeting.title}`;
        const subtitle = `Nhắc lịch trước ${meeting.advanceNoticeMinutes} phút`;
        const body = `🕒 Giờ họp: ${timeStr}${isMeetingToday ? ' Hôm nay' : ''} (Báo trước ${meeting.advanceNoticeMinutes}p)\n📋 ${meeting.voiceText}${nextAgendaText}\n👉 Chạm để xem hoặc bấm 'Đã nhớ' để tắt`;

        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title,
            subtitle,
            body,
            categoryIdentifier: NOTIFICATION_CATEGORY_ID,
            data: { meetingId: meeting.id },
            sound: true,
          },
          trigger: (Platform.OS === 'android'
            ? { date: reminderDate, channelId: NOTIFICATION_CHANNEL_ID }
            : reminderDate) as any,
        });
        notificationIds.push(id);
      }

      // 2. Lên lịch trước các lần NHẮC LẶP trong nền (tối đa 4 lần lặp trong nền)
      const repeatInterval = meeting.repeatIntervalMinutes || settings.defaultRepeatIntervalMinutes || 5;
      const repeatIntervalMs = repeatInterval * 60 * 1000;
      let nextNagTime = Math.max(now, reminderDate.getTime()) + repeatIntervalMs;
      let count = 1;

      while (count <= 4 && nextNagTime < meetingStart) {
        const nagDate = new Date(nextNagTime);
        const nagTitle = `⏰ [Nhắc lại - ${timeStr}] ${meeting.title}`;
        const nagSubtitle = `Lần nhắc thứ ${count}`;
        const nagBody = `⚠️ Chưa xác nhận: ${meeting.title} (${timeStr})\n🔔 Đang nhắc lại mỗi ${repeatInterval}p\n👉 Bấm 'Đã nhớ' để dừng báo thức`;

        const nagId = await Notifications.scheduleNotificationAsync({
          content: {
            title: nagTitle,
            subtitle: nagSubtitle,
            body: nagBody,
            categoryIdentifier: NOTIFICATION_CATEGORY_ID,
            data: { meetingId: meeting.id },
            sound: true,
          },
          trigger: (Platform.OS === 'android'
            ? { date: nagDate, channelId: NOTIFICATION_CHANNEL_ID }
            : nagDate) as any,
        });
        notificationIds.push(nagId);
        nextNagTime += repeatIntervalMs;
        count++;
      }

      this.scheduledNotificationIds.set(meeting.id, notificationIds);
    } catch (e) {
      console.warn('scheduleBackgroundAlarms error:', e);
    }
  }

  /**
   * Lên lịch THÔNG BÁO TỔNG HỢP LỊCH HÔM NAY (Daily Morning Briefing)
   * Tự động tổng hợp danh sách cuộc hẹn trong ngày theo buổi Sáng / Chiều / Tối
   */
  async scheduleDailyBriefing(meetings: Meeting[], _settings?: AppSettings) {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.cancelScheduledNotificationAsync(DAILY_BRIEFING_ID);

      const today = new Date();
      const todayMeetings = meetings.filter((m) =>
        isSameDay(new Date(m.meetingTime), today)
      );

      const briefing = buildTodayScheduleBriefing(todayMeetings);

      // Đặt lịch vào 07:00 sáng
      const targetTime = new Date();
      targetTime.setHours(7, 0, 0, 0);

      // Nếu hiện tại đã quá 07:00 hôm nay, lên lịch cho 07:00 sáng mai
      if (targetTime.getTime() <= Date.now()) {
        targetTime.setDate(targetTime.getDate() + 1);
      }

      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_BRIEFING_ID,
        content: {
          title: briefing.title,
          subtitle: briefing.subtitle,
          body: briefing.body,
          data: { type: 'DAILY_BRIEFING' },
          sound: true,
        },
        trigger: (Platform.OS === 'android'
          ? { date: targetTime, channelId: NOTIFICATION_CHANNEL_ID }
          : targetTime) as any,
      });
    } catch (e) {
      console.warn('scheduleDailyBriefing error:', e);
    }
  }

  /**
   * Gửi ngay lập tức THÔNG BÁO TỔNG HỢP LỊCH HÔM NAY ra màn hình để người dùng kiểm tra ngay
   */
  async sendInstantDailyBriefingNotification(meetings: Meeting[]) {
    if (Platform.OS === 'web') return;

    try {
      const today = new Date();
      const todayMeetings = meetings.filter((m) =>
        isSameDay(new Date(m.meetingTime), today)
      );

      const briefing = buildTodayScheduleBriefing(todayMeetings);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: briefing.title,
          subtitle: briefing.subtitle,
          body: briefing.body,
          data: { type: 'DAILY_BRIEFING' },
          sound: true,
        },
        trigger: (Platform.OS === 'android'
          ? { channelId: NOTIFICATION_CHANNEL_ID }
          : null) as any,
      });
    } catch (e) {
      console.warn('sendInstantDailyBriefingNotification error:', e);
    }
  }

  /**
   * Hủy các thông báo nền của cuộc họp khi người dùng bấm "Đã nhớ" hoặc xóa lịch
   */
  async cancelBackgroundNotifications(meetingId: string) {
    const ids = this.scheduledNotificationIds.get(meetingId);
    if (ids && ids.length > 0) {
      for (const id of ids) {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
        } catch (e) {
          // ignore
        }
      }
      this.scheduledNotificationIds.delete(meetingId);
    }
  }

  /**
   * Kích hoạt chuông báo thức toàn màn hình và đọc to giọng nói khi app đang mở
   */
  async triggerAlarm(meeting: Meeting, settings: AppSettings) {
    // 1. Đọc giọng nói tiếng Việt
    SpeechService.speakVoiceReminder(meeting.voiceText, {
      pitch: settings.speechPitch,
      rate: settings.speechRate,
    });

    // 2. Rung haptics
    if (settings.hapticEnabled) {
      SpeechService.triggerAlarmHaptics();
    }

    // 3. Kích hoạt overlay giao diện
    if (this.onAlarmTriggerCallback) {
      this.onAlarmTriggerCallback(meeting);
    }

    // 4. Cập nhật trạng thái
    const updatedMeeting: Meeting = {
      ...meeting,
      status: 'REMINDING',
      nagCount: (meeting.nagCount || 0) + 1,
    };
    await StorageService.updateMeeting(updatedMeeting);

    // 5. Quản lý timer lặp trong RAM
    this.scheduleNextNagInMemory(updatedMeeting, settings);
  }

  private scheduleNextNagInMemory(meeting: Meeting, settings: AppSettings) {
    if (this.activeReminders.has(meeting.id)) {
      clearTimeout(this.activeReminders.get(meeting.id)!);
      this.activeReminders.delete(meeting.id);
    }

    const meetingStart = new Date(meeting.meetingTime).getTime();
    const intervalMs = (meeting.repeatIntervalMinutes || settings.defaultRepeatIntervalMinutes || 5) * 60 * 1000;
    const nextNagTime = Date.now() + intervalMs;

    if (settings.stopOnMeetingStart && nextNagTime >= meetingStart) {
      return;
    }

    const timer = setTimeout(async () => {
      const allMeetings = await StorageService.getMeetings();
      const current = allMeetings.find(m => m.id === meeting.id);
      if (current && current.status === 'REMINDING') {
        this.triggerAlarm(current, settings);
      }
    }, intervalMs);

    this.activeReminders.set(meeting.id, timer);
  }

  /**
   * DỪNG BÁO THỨC NGAY LẬP TỨC: Tắt giọng đọc, tắt rung, hủy tất cả thông báo nền
   */
  async acknowledgeAndDismiss(meetingId: string): Promise<Meeting | null> {
    await SpeechService.stop();
    await SpeechService.triggerSuccessHaptics();

    // Hủy timer trong RAM
    if (this.activeReminders.has(meetingId)) {
      clearTimeout(this.activeReminders.get(meetingId)!);
      this.activeReminders.delete(meetingId);
    }

    // HỦY TOÀN BỘ CÁC THÔNG BÁO NỀN TIẾP THEO
    await this.cancelBackgroundNotifications(meetingId);

    const all = await StorageService.getMeetings();
    const meeting = all.find(m => m.id === meetingId);
    if (!meeting) return null;

    const updated: Meeting = {
      ...meeting,
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date().toISOString(),
    };
    await StorageService.updateMeeting(updated);

    return updated;
  }

  async cancelAlarm(meetingId: string) {
    if (this.activeReminders.has(meetingId)) {
      clearTimeout(this.activeReminders.get(meetingId)!);
      this.activeReminders.delete(meetingId);
    }
    await this.cancelBackgroundNotifications(meetingId);
  }
}

export const AlarmManager = new AlarmManagerService();
