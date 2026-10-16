import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let speechSession = 0;

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
      voice?: string;
      onDone?: () => void;
      onStart?: () => void;
      onStopped?: () => void;
      onError?: (error: Error) => void;
    }
  ): Promise<void> {
    const session = ++speechSession;
    try {
      // Dừng âm thanh đang đọc trước đó nếu có
      this.isSpeaking = false;
      await Speech.stop();
      if (session !== speechSession) return;

      this.isSpeaking = true;
      if (options?.onStart) options.onStart();

      // Định dạng câu đọc rõ ràng, thêm dấu ngắt nhịp tự nhiên cho trợ lý giọng nói
      let cleanText = text.trim();
      if (!cleanText.includes('.') && cleanText.includes(',')) {
        cleanText = cleanText.replace(',', '.');
      }

      Speech.speak(cleanText, {
        language: 'vi-VN',
        voice: options?.voice,
        pitch: options?.pitch ?? 1.0,
        rate: options?.rate ?? 0.90, // Tốc độ 0.90 giúp giọng đọc tiếng Việt rõ từng từ, không bị dính chữ
        onDone: () => {
          if (session !== speechSession) return;
          this.isSpeaking = false;
          if (options?.onDone) options.onDone();
        },
        onStopped: () => {
          if (session !== speechSession) return;
          this.isSpeaking = false;
          options?.onStopped?.();
        },
        onError: (err) => {
          if (session !== speechSession) return;
          console.warn('Speech error:', err);
          this.isSpeaking = false;
          options?.onError?.(err);
        },
      });
    } catch (e) {
      console.warn('Speech.speak failed', e);
      if (session === speechSession) {
        this.isSpeaking = false;
        options?.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
  },

  /**
   * Dừng đọc giọng nói ngay lập tức (khi người dùng bấm 'Đã nhớ' hoặc tắt báo thức)
   */
  async stop(): Promise<void> {
    speechSession++;
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
