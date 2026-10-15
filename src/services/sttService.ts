import { Platform } from 'react-native';

export interface STTCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

let NativeSpeechRecognition: any = null;

try {
  // Optional native module: Expo Go must still allow keyboard input when it is absent.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('expo-speech-recognition');
  NativeSpeechRecognition = module.ExpoSpeechRecognitionModule;
} catch {
  NativeSpeechRecognition = null;
}

let subscriptions: { remove: () => void }[] = [];
let webRecognitionInstance: any = null;
let recognitionSession = 0;
let activeNativeSession: number | null = null;

export const STTService = {
  isNativeAvailable(): boolean {
    return !!(
      NativeSpeechRecognition &&
      typeof NativeSpeechRecognition.start === 'function' &&
      typeof NativeSpeechRecognition.addListener === 'function'
    );
  },

  async requestPermissions(): Promise<boolean> {
    if (NativeSpeechRecognition && NativeSpeechRecognition.requestPermissionsAsync) {
      try {
        const res = await NativeSpeechRecognition.requestPermissionsAsync();
        return !!res.granted;
      } catch (e) {
        console.warn('requestPermissionsAsync error:', e);
      }
    }
    return false;
  },

  async startListening(callbacks: STTCallbacks): Promise<boolean> {
    this.stopListening();
    const session = recognitionSession;
    const isCurrent = () => recognitionSession === session;

    // 1. Nhận diện giọng nói Native (iOS SFSpeechRecognizer & Android SpeechRecognizer)
    if (NativeSpeechRecognition && NativeSpeechRecognition.start) {
      try {
        const hasPerm = await this.requestPermissions();
        if (!isCurrent()) return false;
        if (!hasPerm) {
          if (callbacks.onError) callbacks.onError('PERMISSION_DENIED');
          return false;
        }

        // Đăng ký nhận sự kiện kết quả nhận dạng theo thời gian thực từ Native
        const subResult = NativeSpeechRecognition.addListener('result', (event: any) => {
          if (!isCurrent()) return;
          if (event && event.results && event.results.length > 0) {
            const transcript = event.results[0].transcript || '';
            if (callbacks.onResult && transcript.trim()) {
              callbacks.onResult(transcript);
            }
          }
        });

        const subStart = NativeSpeechRecognition.addListener('start', () => {
          if (!isCurrent()) return;
          if (callbacks.onStart) callbacks.onStart();
        });

        const subEnd = NativeSpeechRecognition.addListener('end', () => {
          if (!isCurrent()) return;
          activeNativeSession = null;
          if (callbacks.onEnd) callbacks.onEnd();
        });

        const subError = NativeSpeechRecognition.addListener('error', (err: any) => {
          if (!isCurrent()) return;
          console.warn('[STT] Speech recognition error event:', err);
          if (callbacks.onError) callbacks.onError(err);
        });

        const subVolume = NativeSpeechRecognition.addListener('volumechange', (evt: any) => {
          if (!isCurrent()) return;
          if (callbacks.onVolumeChange && typeof evt?.value === 'number') {
            callbacks.onVolumeChange(evt.value);
          }
        });

        subscriptions = [subResult, subStart, subEnd, subError, subVolume];

        activeNativeSession = session;
        await NativeSpeechRecognition.start({
          lang: 'vi-VN', // Tiếng Việt
          interimResults: true,
          maxAlternatives: 1,
          continuous: false,
        });
        if (!isCurrent()) {
          if (activeNativeSession === null) await NativeSpeechRecognition.stop();
          return false;
        }
        return true;
      } catch (e) {
        if (isCurrent()) {
          this.stopListening();
          console.warn('[STT] Native speech recognition start failed:', e);
          callbacks.onError?.(e);
        }
        return false;
      }
    }

    // 2. Môi trường Web / Chrome hỗ trợ Web Speech API
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'vi-VN';
          recognition.continuous = false;
          recognition.interimResults = true;

          recognition.onstart = () => {
            if (!isCurrent()) return;
            if (callbacks.onStart) callbacks.onStart();
          };
          recognition.onresult = (event: any) => {
            if (!isCurrent()) return;
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
              text += event.results[i][0].transcript;
            }
            if (callbacks.onResult && text.trim()) {
              callbacks.onResult(text);
            }
          };
          recognition.onerror = (err: any) => {
            if (!isCurrent()) return;
            if (callbacks.onError) callbacks.onError(err);
          };
          recognition.onend = () => {
            if (!isCurrent()) return;
            if (callbacks.onEnd) callbacks.onEnd();
          };

          recognition.start();
          webRecognitionInstance = recognition;
          return true;
        } catch (e) {
          console.warn('Web SpeechRecognition failed:', e);
        }
      }
    }

    return false;
  },

  stopListening(): void {
    recognitionSession += 1;
    activeNativeSession = null;
    if (NativeSpeechRecognition && NativeSpeechRecognition.stop) {
      try {
        NativeSpeechRecognition.stop();
      } catch {}
    }
    if (webRecognitionInstance) {
      try {
        webRecognitionInstance.stop();
      } catch {}
      webRecognitionInstance = null;
    }
    subscriptions.forEach((sub) => {
      try {
        sub.remove();
      } catch {}
    });
    subscriptions = [];
  },
};
