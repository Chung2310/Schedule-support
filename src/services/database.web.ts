import AsyncStorage from '@react-native-async-storage/async-storage';
import { Meeting } from '../types/meeting';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';

const WEB_MEETINGS_KEY = 'ceo_calendar_meetings';
const WEB_SETTINGS_KEY = 'ceo_calendar_settings';

class DatabaseServiceWeb {
  async getMeetings(): Promise<Meeting[]> {
    try {
      const raw = await AsyncStorage.getItem(WEB_MEETINGS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
      return [];
    } catch (e) {
      console.warn('Local meeting storage could not be read:', e);
      throw e;
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

  async addMeetings(meetings: Meeting[]): Promise<Meeting[]> {
    const list = await this.getMeetings();
    const next = [...list, ...meetings].sort(
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
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('AsyncStorage saveSettings error:', e);
      throw e;
    }
  }
}

export const DatabaseService = new DatabaseServiceWeb();
