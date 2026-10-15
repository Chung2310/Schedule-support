import AsyncStorage from '@react-native-async-storage/async-storage';
import { Meeting } from '../types/meeting';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';

const WEB_MEETINGS_KEY = 'ceo_calendar_meetings';
const WEB_SETTINGS_KEY = 'ceo_calendar_settings';

class DatabaseServiceWeb {
  private getWebSeedMeetings(): Meeting[] {
    const today = new Date();
    const morningTime = new Date(today);
    morningTime.setHours(9, 30, 0, 0);

    const afternoonTime = new Date(today);
    afternoonTime.setHours(14, 30, 0, 0);

    return [
      {
        id: 'seed-morning-1',
        title: 'Họp giao ban ban giám đốc',
        meetingTime: morningTime.toISOString(),
        advanceNoticeMinutes: 15,
        repeatIntervalMinutes: 5,
        firstReminderTime: new Date(morningTime.getTime() - 15 * 60000).toISOString(),
        status: 'UPCOMING',
        nagCount: 0,
        voiceText: '9 giờ 30 phút, họp giao ban ban giám đốc',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'seed-afternoon-1',
        title: 'Gặp đối tác ký kết hợp đồng',
        meetingTime: afternoonTime.toISOString(),
        advanceNoticeMinutes: 15,
        repeatIntervalMinutes: 5,
        firstReminderTime: new Date(afternoonTime.getTime() - 15 * 60000).toISOString(),
        status: 'UPCOMING',
        nagCount: 0,
        voiceText: '14 giờ 30 phút, gặp đối tác ký kết hợp đồng',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  async getMeetings(): Promise<Meeting[]> {
    try {
      const raw = await AsyncStorage.getItem(WEB_MEETINGS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
      const seeds = this.getWebSeedMeetings();
      await AsyncStorage.setItem(WEB_MEETINGS_KEY, JSON.stringify(seeds));
      return seeds;
    } catch (e) {
      return this.getWebSeedMeetings();
    }
  }

  async addMeeting(meeting: Meeting): Promise<Meeting[]> {
    const list = await this.getMeetings();
    const next = [...list, meeting].sort(
      (a, b) => new Date(a.meetingTime).getTime() - new Date(b.meetingTime).getTime()
    );
    await AsyncStorage.setItem(WEB_MEETINGS_KEY, JSON.stringify(next));
    return next;
  }

  async updateMeeting(meeting: Meeting): Promise<Meeting[]> {
    const list = await this.getMeetings();
    const next = list.map((m) => (m.id === meeting.id ? meeting : m));
    await AsyncStorage.setItem(WEB_MEETINGS_KEY, JSON.stringify(next));
    return next;
  }

  async deleteMeeting(id: string): Promise<Meeting[]> {
    const list = await this.getMeetings();
    const next = list.filter((m) => m.id !== id);
    await AsyncStorage.setItem(WEB_MEETINGS_KEY, JSON.stringify(next));
    return next;
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(WEB_SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      // fallback
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('AsyncStorage saveSettings error:', e);
    }
  }
}

export const DatabaseService = new DatabaseServiceWeb();
