import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import type { AppSettings } from '../types/settings';
import type { Meeting } from '../types/meeting';
import { cleanReminderText } from '../utils/reminderText';

export interface MeetingVoiceAsset {
  key: string;
  sound: string;
  channelId?: string;
}

export interface NotificationVoice {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

interface VoiceNotification {
  identifier: string;
  title: string;
  subtitle: string;
  body: string;
  sound: string;
  meetingId: string;
  fireAt: number;
}

interface NativeMeetingVoice {
  getAvailableVoices?: () => Promise<NotificationVoice[]>;
  prepare(text: string, rate: number, pitch: number, voiceIdentifier: string): Promise<MeetingVoiceAsset>;
  prune(keys: string[]): Promise<void>;
  scheduleIOS(notification: VoiceNotification): Promise<void>;
}

const native = requireOptionalNativeModule<NativeMeetingVoice>('MeetingVoice');

// Long titles remain fully visible in the notification; the spoken preview is
// deliberately short enough for the OS notification sound duration limit.
export function meetingVoiceText(meeting: Meeting): string {
  const text = cleanReminderText(meeting.voiceText || meeting.title);
  if (text.length <= 180) return text;
  const prefix = text.slice(0, 160);
  return `${prefix.slice(0, prefix.lastIndexOf(' ') > 0 ? prefix.lastIndexOf(' ') : prefix.length)}. Xem thêm trong lịch.`;
}

export const MeetingVoice = {
  async getAvailableVoices(): Promise<NotificationVoice[]> {
    try {
      const voices = native?.getAvailableVoices
        ? await native.getAvailableVoices()
        : await Speech.getAvailableVoicesAsync();
      return voices
        .filter((voice) => voice.language.toLowerCase().startsWith('vi'))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        return voices
          .filter((voice) => voice.language.toLowerCase().startsWith('vi'))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return [];
      }
    }
  },

  async prepare(meeting: Meeting, settings: AppSettings): Promise<MeetingVoiceAsset | null> {
    if (!native || Platform.OS === 'web' || (Platform.OS === 'android' && Number(Platform.Version) < 26)) return null;
    try {
      return await native.prepare(
        meetingVoiceText(meeting),
        settings.speechRate,
        settings.speechPitch,
        settings.speechVoice ?? ''
      );
    } catch {
      // A missing offline voice must not prevent a saved meeting from ringing.
      console.warn('Meeting voice unavailable; using the notification chime.');
      return null;
    }
  },

  async scheduleIOS(notification: VoiceNotification): Promise<void> {
    if (!native) throw new Error('MeetingVoice native module is unavailable');
    await native.scheduleIOS(notification);
  },

  async prune(keys: string[]): Promise<void> {
    try { await native?.prune(keys); } catch {
      console.warn('Could not clean up old meeting voice files.');
    }
  },
};
