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
  meetingId?: string;
  type?: string;
  categoryIdentifier?: string;
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
    return this.prepareText(meetingVoiceText(meeting), settings);
  },

  async prepareText(text: string, settings: AppSettings): Promise<MeetingVoiceAsset | null> {
    if (!native || Platform.OS === 'web' || (Platform.OS === 'android' && Number(Platform.Version) < 26)) return null;
    try {
      return await this.prepareTextOrThrow(text, settings);
    } catch {
      // A missing offline voice must not prevent a saved meeting from ringing.
      console.warn('Meeting voice unavailable; using the notification chime.');
      return null;
    }
  },

  // Unlike meeting scheduling, a voice preview must report failure rather than
  // silently substituting a chime that would make the preview misleading.
  async prepareTextOrThrow(text: string, settings: AppSettings): Promise<MeetingVoiceAsset> {
    if (Platform.OS === 'web' || (Platform.OS === 'android' && Number(Platform.Version) < 26)) {
      throw new Error('Thiết bị này chưa hỗ trợ giọng đọc thông báo nền.');
    }
    if (!native || typeof native.prepare !== 'function' ||
        (Platform.OS === 'ios' && typeof native.scheduleIOS !== 'function')) {
      throw new Error(Platform.OS === 'ios'
        ? 'Bản cài hiện tại chưa có giọng đọc nền. Hãy cập nhật bản iGen Check mới trong TestFlight.'
        : 'Bản cài hiện tại chưa có giọng đọc nền. Hãy cập nhật bản iGen Check mới cho Android.');
    }
    try {
      const asset = await native.prepare(
        text,
        settings.speechRate,
        settings.speechPitch,
        settings.speechVoice ?? ''
      );
      if (!asset?.sound || (Platform.OS === 'android' && !asset.channelId)) {
        throw Object.assign(new Error('Invalid voice file'), { code: 'INVALID_VOICE_FILE' });
      }
      return asset;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? '';
      const message = (error as { message?: string } | null)?.message ?? '';
      if (code.includes('VOICE_NOT_FOUND') || message.includes('Selected Vietnamese voice is not installed')) {
        throw new Error('Giọng đã chọn không còn trên thiết bị. Hãy vào Cài đặt của iGen Check và chọn lại giọng đọc.');
      }
      if (code.includes('VOICE_UNAVAILABLE') || message.includes('No installed offline Vietnamese voice')) {
        throw new Error(Platform.OS === 'android'
          ? 'Chưa có giọng tiếng Việt ngoại tuyến. Hãy mở cài đặt chuyển văn bản thành giọng nói của Android, tải dữ liệu giọng tiếng Việt rồi thử lại.'
          : 'Chưa có giọng tiếng Việt trên thiết bị. Hãy tải giọng tiếng Việt trong phần Trợ năng của Cài đặt, rồi thử lại.');
      }
      if (code.includes('INVALID_REQUEST')) {
        throw new Error('Ứng dụng đang chuẩn bị giọng đọc khác. Hãy đợi lưu lịch xong rồi thử lại.');
      }
      if (message.includes('timed out')) {
        throw new Error('Tạo giọng đọc quá lâu. Hãy giữ ứng dụng mở và thử lại, hoặc chọn giọng tiếng Việt khác.');
      }
      if (message.includes('shorter than 30 seconds')) {
        throw new Error('Giọng đọc dài quá giới hạn thông báo. Hãy rút ngắn nội dung nhắc lịch.');
      }
      if (code.includes('INVALID_VOICE_FILE') || message.includes('produced no audio')) {
        throw new Error('Giọng đã chọn chưa tạo được tệp âm thanh. Hãy chọn hoặc tải một giọng tiếng Việt khác rồi thử lại.');
      }
      throw new Error('Không tạo được giọng đọc nền. Hãy giữ ứng dụng mở và thử lại; nếu vẫn lỗi, chọn một giọng tiếng Việt khác.');
    }
  },

  async scheduleIOS(notification: VoiceNotification): Promise<void> {
    if (!native) throw new Error('MeetingVoice native module is unavailable');
    try {
      await native.scheduleIOS(notification);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? '';
      if (code.includes('SOUND_UNAVAILABLE')) {
        throw new Error('iPhone chưa đọc được tệp giọng nói cho thông báo. Hãy chọn giọng khác và thử lại.');
      }
      if (code.includes('SCHEDULE_EXPIRED')) {
        throw new Error('Giờ nhắc đã qua trước khi đặt thông báo xong. Hãy thử lại hoặc chọn giờ nhắc xa hơn.');
      }
      throw new Error('iPhone chưa đặt được thông báo giọng đọc. Hãy kiểm tra quyền thông báo và thử lại.');
    }
  },

  async prune(keys: string[]): Promise<void> {
    try { await native?.prune(keys); } catch {
      console.warn('Could not clean up old meeting voice files.');
    }
  },
};
