import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { Meeting } from '../types/meeting';
import { AppSettings } from '../types/settings';
import { SpeechService } from './speechService';
import { StorageService } from './storage';
import { isSameDay } from '../utils/dateUtils';
import { buildReminderPlan } from '../utils/reminderPlan';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const NOTIFICATION_CATEGORY_ID = 'MEETING_ALARM_ACTIONS';
const NOTIFICATION_CHANNEL_ID = 'ceo_meeting_alarms';
const DAILY_BRIEFING_ID = 'ceo_daily_schedule_briefing';
const DISMISS_ACTION = 'DISMISS_ACTION';

interface AlarmCallbacks {
  onAlarm: (meeting: Meeting) => void;
  onAcknowledged: (meeting: Meeting) => void;
  onNotificationOpen: (meeting: Meeting) => void;
}

export function buildTodayScheduleBriefing(todayMeetings: Meeting[], date = new Date()) {
  const count = todayMeetings.length;
  const dateFormatted = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  const sorted = [...todayMeetings].sort(
    (a, b) => new Date(a.meetingTime).getTime() - new Date(b.meetingTime).getTime()
  );
  const sections = [
    { label: '☀️ SÁNG', matches: (hour: number) => hour < 12 },
    { label: '🌤️ CHIỀU', matches: (hour: number) => hour >= 12 && hour < 18 },
    { label: '🌙 TỐI', matches: (hour: number) => hour >= 18 },
  ].flatMap(({ label, matches }) => {
    const meetings = sorted.filter((meeting) => matches(new Date(meeting.meetingTime).getHours()));
    if (meetings.length === 0) return [];
    const lines = meetings.map((meeting) => {
      const time = new Date(meeting.meetingTime);
      const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
      return `• ${timeStr} - ${meeting.title}${meeting.status === 'ACKNOWLEDGED' ? ' [✓ Đã nhớ]' : ''}`;
    });
    return [`${label} (${meetings.length}):\n${lines.join('\n')}`];
  });

  return {
    title: `📅 Lịch Hôm Nay (${dateFormatted}) • ${count} cuộc hẹn`,
    subtitle: count === 0 ? 'Lịch trống' : `Tổng hợp ${count} cuộc hẹn trong ngày`,
    body: count === 0 ? 'Hôm nay không có lịch hẹn nào.' : sections.join('\n\n'),
    todayCount: count,
  };
}

class AlarmManagerService {
  private activeReminders = new Map<string, ReturnType<typeof setTimeout>>();
  private alarmSessions = new Map<string, symbol>();
  private acknowledging = new Set<string>();
  private callbacks: AlarmCallbacks | null = null;
  private initialization: Promise<void> | null = null;
  private notificationQueue: Promise<unknown> = Promise.resolve();
  private handledResponses = new Set<string>();
  private responseSubscription: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | null = null;

  async init(callbacks: AlarmCallbacks): Promise<void> {
    this.callbacks = callbacks;
    if (Platform.OS === 'web') return;
    if (!this.initialization) {
      this.initialization = this.initializeNotifications().catch((error) => {
        this.initialization = null;
        console.warn('Could not initialize notifications:', error);
      });
    }
    await this.initialization;
  }

  private async initializeNotifications() {
    // Register before reading the saved response, so a cold-start action is not lost.
    if (!this.responseSubscription) {
      this.responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        void this.handleResponse(response).catch((error) => console.warn('Notification action failed:', error));
      });
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Nhắc lịch hẹn',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
        sound: 'default',
      });
    }
    await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_ID, [{
      identifier: DISMISS_ACTION,
      buttonTitle: 'Đã nhớ',
      options: { opensAppToForeground: true, isDestructive: false },
    }]);

    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }

    const response = Notifications.getLastNotificationResponse();
    if (response) await this.handleResponse(response);
  }

  private async handleResponse(response: Notifications.NotificationResponse) {
    const request = response.notification.request;
    const meetingId = request.content.data?.meetingId;
    if (typeof meetingId !== 'string') return;
    const responseKey = `${request.identifier}:${response.actionIdentifier}`;
    if (this.handledResponses.has(responseKey)) return;
    this.handledResponses.add(responseKey);
    try {
      if (response.actionIdentifier === DISMISS_ACTION) {
        await this.acknowledgeAndDismiss(meetingId);
      } else if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        const meeting = (await StorageService.getMeetings()).find((item) => item.id === meetingId);
        if (meeting) this.callbacks?.onNotificationOpen(meeting);
      }
      // Do not clear a newer response that arrived while this one was being handled.
      const last = Notifications.getLastNotificationResponse();
      if (last?.notification.request.identifier === request.identifier &&
          last.actionIdentifier === response.actionIdentifier) {
        Notifications.clearLastNotificationResponse();
      }
    } catch (error) {
      this.handledResponses.delete(responseKey);
      throw error;
    }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = this.notificationQueue.then(work);
    this.notificationQueue = task.catch(() => undefined);
    return task;
  }

  calculateFirstReminder(meetingTime: Date, advanceNoticeMinutes: number): Date {
    return new Date(meetingTime.getTime() - advanceNoticeMinutes * 60_000);
  }

  /** Reconcile the OS queue from local data, including requests created by older app launches. */
  async syncNotifications(settings: AppSettings): Promise<boolean> {
    if (Platform.OS === 'web') return true;
    return this.enqueue(async () => {
      const meetings = await StorageService.getMeetings();
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      const owned = pending.filter((request) =>
        typeof request.content.data?.meetingId === 'string' || request.identifier === DAILY_BRIEFING_ID
      );
      await Promise.all(owned.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));

      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
        return false;
      }

      const now = new Date();
      // Keep the nearest requests on iOS and reserve one slot for the morning briefing.
      const capacity = Platform.OS === 'ios' ? Math.max(0, 63 - (pending.length - owned.length)) : Infinity;
      const plan = buildReminderPlan(meetings, settings, now.getTime()).slice(0, capacity);
      for (const reminder of plan) {
        const { meeting, repeatIndex } = reminder;
        const date = new Date(meeting.meetingTime);
        const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.identifier,
          content: {
            title: `⏰ ${repeatIndex > 0 ? '[Nhắc lại] ' : ''}[${timeStr}] ${meeting.title}`,
            subtitle: repeatIndex > 0 ? `Lần nhắc lại thứ ${repeatIndex}` : `Báo trước ${meeting.advanceNoticeMinutes} phút`,
            body: `${meeting.voiceText}\nChạm để xem lịch hoặc bấm “Đã nhớ” để dừng nhắc.`,
            categoryIdentifier: NOTIFICATION_CATEGORY_ID,
            data: { meetingId: meeting.id },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder.date,
            ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : {}),
          },
        });
      }

      const targetTime = new Date(now);
      targetTime.setHours(7, 0, 0, 0);
      if (targetTime.getTime() <= now.getTime()) targetTime.setDate(targetTime.getDate() + 1);
      const targetMeetings = meetings.filter((meeting) => isSameDay(new Date(meeting.meetingTime), targetTime));
      const briefing = buildTodayScheduleBriefing(targetMeetings, targetTime);
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_BRIEFING_ID,
        content: {
          title: briefing.title,
          subtitle: briefing.subtitle,
          body: briefing.body,
          data: { type: 'DAILY_BRIEFING' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: targetTime,
          ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : {}),
        },
      });
      return true;
    }).catch((error) => {
      console.warn('Could not schedule reminders:', error);
      return false;
    });
  }

  async sendInstantDailyBriefingNotification(meetings: Meeting[]) {
    if (Platform.OS === 'web') return false;
    const now = new Date();
    const briefing = buildTodayScheduleBriefing(
      meetings.filter((meeting) => isSameDay(new Date(meeting.meetingTime), now)), now
    );
    try {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return false;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: briefing.title,
          subtitle: briefing.subtitle,
          body: briefing.body,
          data: { type: 'DAILY_BRIEFING' },
          sound: true,
        },
        trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
      });
      return true;
    } catch (error) {
      console.warn('Could not send test notification:', error);
      return false;
    }
  }

  private async removeMeetingNotifications(meetingId: string) {
    if (Platform.OS === 'web') return;
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(pending
      .filter((request) => request.content.data?.meetingId === meetingId)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(presented
      .filter((notification) => notification.request.content.data?.meetingId === meetingId)
      .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)));
  }

  async triggerAlarm(meeting: Meeting, settings: AppSettings) {
    if (AppState.currentState !== 'active' || this.alarmSessions.has(meeting.id) || this.acknowledging.has(meeting.id)) return;
    const session = Symbol();
    this.alarmSessions.set(meeting.id, session);
    const isCurrent = () => this.alarmSessions.get(meeting.id) === session && AppState.currentState === 'active';
    try {
      const current = (await StorageService.getMeetings()).find((item) => item.id === meeting.id);
      if (!isCurrent() || !current || (current.status !== 'UPCOMING' && current.status !== 'REMINDING')) return;
      await SpeechService.speakVoiceReminder(current.voiceText, { pitch: settings.speechPitch, rate: settings.speechRate });
      if (!isCurrent()) return;
      if (settings.hapticEnabled) await SpeechService.triggerAlarmHaptics();
      if (!isCurrent()) return;
      const updated: Meeting = { ...current, status: 'REMINDING', nagCount: current.nagCount + 1 };
      const meetings = await StorageService.updateMeeting(updated);
      const saved = meetings.find((item) => item.id === meeting.id);
      if (!isCurrent() || !saved || saved.status !== 'REMINDING') return;
      this.callbacks?.onAlarm(saved);
      this.scheduleNextNagInMemory(saved, settings);
    } finally {
      if (this.alarmSessions.get(meeting.id) === session) this.alarmSessions.delete(meeting.id);
    }
  }

  private scheduleNextNagInMemory(meeting: Meeting, settings: AppSettings) {
    const timer = this.activeReminders.get(meeting.id);
    if (timer) clearTimeout(timer);
    this.activeReminders.delete(meeting.id);
    const nextTime = Date.now() + Math.max(1, meeting.repeatIntervalMinutes || settings.defaultRepeatIntervalMinutes || 5) * 60_000;
    if (settings.stopOnMeetingStart && nextTime >= new Date(meeting.meetingTime).getTime()) return;
    if (settings.nagMaxCount > 0 && meeting.nagCount >= settings.nagMaxCount) return;
    this.activeReminders.set(meeting.id, setTimeout(() => {
      void this.triggerAlarm(meeting, settings).catch((error) => console.warn('Voice reminder failed:', error));
    }, nextTime - Date.now()));
  }

  resumeForegroundReminders(meetings: Meeting[], settings: AppSettings) {
    for (const meeting of meetings) {
      if (meeting.status === 'REMINDING') this.scheduleNextNagInMemory(meeting, settings);
    }
  }

  pauseForegroundReminders() {
    this.alarmSessions.clear();
    for (const timer of this.activeReminders.values()) clearTimeout(timer);
    this.activeReminders.clear();
    void SpeechService.stop();
  }

  async acknowledgeAndDismiss(meetingId: string): Promise<Meeting | null> {
    this.acknowledging.add(meetingId);
    try {
      return await this.persistAcknowledgement(meetingId);
    } finally {
      this.acknowledging.delete(meetingId);
    }
  }

  private async persistAcknowledgement(meetingId: string): Promise<Meeting | null> {
    this.alarmSessions.delete(meetingId);
    const timer = this.activeReminders.get(meetingId);
    if (timer) clearTimeout(timer);
    this.activeReminders.delete(meetingId);
    await SpeechService.stop();
    const meeting = (await StorageService.getMeetings()).find((item) => item.id === meetingId);
    let updated: Meeting | null = null;
    if (meeting) {
      updated = { ...meeting, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() };
      await StorageService.updateMeeting(updated);
      this.callbacks?.onAcknowledged(updated);
    }
    await this.enqueue(() => this.removeMeetingNotifications(meetingId));
    const settings = await StorageService.getSettings();
    await this.syncNotifications(settings);
    return updated;
  }

  async cancelAlarm(meetingId: string) {
    this.alarmSessions.delete(meetingId);
    const timer = this.activeReminders.get(meetingId);
    if (timer) clearTimeout(timer);
    this.activeReminders.delete(meetingId);
    await this.enqueue(() => this.removeMeetingNotifications(meetingId));
  }
}

export const AlarmManager = new AlarmManagerService();
