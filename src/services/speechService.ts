import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const SpeechService = {
  isSpeaking: false,

  /**
   * Đọc câu thông báo bằng giọng đọc tiếng Việt (vi-VN)
   * Ví dụ: "14 giờ, họp với team IT"
   */
  async speakVoiceReminder(
    text: string,
    options?: {
      pitch?: number;
      rate?: number;
      onDone?: () => void;
      onStart?: () => void;
    }
  ): Promise<void> {
    try {
      // Dừng âm thanh đang đọc trước đó nếu có
      await this.stop();

      this.isSpeaking = true;
      if (options?.onStart) options.onStart();

      // Định dạng câu đọc rõ ràng, thêm dấu ngắt nhịp tự nhiên cho trợ lý giọng nói
      let cleanText = text.trim();
      if (!cleanText.includes('.') && cleanText.includes(',')) {
        cleanText = cleanText.replace(',', '.');
      }

      Speech.speak(cleanText, {
        language: 'vi-VN',
        pitch: options?.pitch ?? 1.0,
        rate: options?.rate ?? 0.90, // Tốc độ 0.90 giúp giọng đọc tiếng Việt rõ từng từ, không bị dính chữ
        onDone: () => {
          this.isSpeaking = false;
          if (options?.onDone) options.onDone();
        },
        onStopped: () => {
          this.isSpeaking = false;
        },
        onError: (err) => {
          console.warn('Speech error:', err);
          this.isSpeaking = false;
        },
      });
    } catch (e) {
      console.warn('Speech.speak failed', e);
      this.isSpeaking = false;
    }
  },

  /**
   * Dừng đọc giọng nói ngay lập tức (khi người dùng bấm 'Đã nhớ' hoặc tắt báo thức)
   */
  async stop(): Promise<void> {
    try {
      this.isSpeaking = false;
      await Speech.stop();
    } catch (e) {
      console.warn('Speech.stop error', e);
    }
  },

  /**
   * Kích hoạt rung báo thức iPhone style
   */
  async triggerAlarmHaptics(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Haptics not available or permitted
    }
  },

  /**
   * Kích hoạt rung xác nhận 'Đã nhớ'
   */
  async triggerSuccessHaptics(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // ignore
    }
  },
};
