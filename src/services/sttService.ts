import { AppState, Platform } from 'react-native';
import { createSpeechForegroundGuard } from './speechForeground';

export interface STTCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
  onFinishing?: () => void;
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
let foregroundGuard: ReturnType<typeof createSpeechForegroundGuard> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | undefined;
let silenceTimeout: ReturnType<typeof setTimeout> | undefined;
let finishing = false;

function clearSilenceTimeout() {
  if (silenceTimeout !== undefined) clearTimeout(silenceTimeout);
  silenceTimeout = undefined;
}

function clearStartupTimeout() {
  if (startupTimeout) clearTimeout(startupTimeout);
  startupTimeout = undefined;
}

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
        if (NativeSpeechRecognition.getPermissionsAsync) {
          const existing = await NativeSpeechRecognition.getPermissionsAsync();
          if (existing?.granted) return true;
        }
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
    finishing = false;
    const resetSilenceTimeout = () => {
      if (!isCurrent() || finishing) return;
      clearSilenceTimeout();
      silenceTimeout = setTimeout(() => {
        if (!isCurrent() || finishing) return;
        callbacks.onFinishing?.();
        void this.finishListening().catch((error) => {
          if (!isCurrent()) return;
          this.stopListening();
          callbacks.onError?.(error);
          callbacks.onEnd?.();
        });
      }, 3000);
    };
    let receivedTranscript = false;
    let receivedError = false;
    let finalizedAndroidText = '';
    let lastTranscript = '';
    const reportTranscript = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      receivedTranscript = true;
      // Repeated partial/final results and ambient volume must not keep an
      // already transcribed request open indefinitely.
      if (trimmed !== lastTranscript) {
        lastTranscript = trimmed;
        resetSilenceTimeout();
      }
      callbacks.onResult?.(trimmed);
    };
    let started = false;

    // 1. Nhận diện giọng nói Native (iOS SFSpeechRecognizer & Android SpeechRecognizer)
    if (Platform.OS !== 'web' && NativeSpeechRecognition && NativeSpeechRecognition.start) {
      try {
        if (NativeSpeechRecognition.isRecognitionAvailable?.() === false) {
          callbacks.onError?.('UNAVAILABLE');
          return false;
        }
        foregroundGuard = createSpeechForegroundGuard(AppState, () => {
          if (!isCurrent()) return;
          this.stopListening();
          callbacks.onError?.('APP_BACKGROUND');
          callbacks.onEnd?.();
        });
        const hasPerm = await this.requestPermissions();
        if (!isCurrent()) return false;
        if (!hasPerm) {
          this.stopListening();
          if (callbacks.onError) callbacks.onError('PERMISSION_DENIED');
          return false;
        }
        const active = await foregroundGuard!.waitUntilActive();
        if (!isCurrent()) return false;
        if (!active) {
          this.stopListening();
          callbacks.onError?.('APP_NOT_ACTIVE');
          return false;
        }

        // Đăng ký nhận sự kiện kết quả nhận dạng theo thời gian thực từ Native
        const subResult = NativeSpeechRecognition.addListener('result', (event: any) => {
          if (!isCurrent()) return;
          if (event && event.results && event.results.length > 0) {
            const transcript = event.results[0].transcript || '';
            if (transcript.trim()) {
              // Android sends separate finalized segments in continuous mode.
              // iOS sends the cumulative transcript for the current session.
              if (Platform.OS === 'android') {
                const combined = [finalizedAndroidText, transcript.trim()].filter(Boolean).join(' ');
                if (event.isFinal) finalizedAndroidText = combined;
                reportTranscript(combined);
              } else {
                reportTranscript(transcript);
              }
            }
          }
        });

        const subStart = NativeSpeechRecognition.addListener('start', () => {
          if (!isCurrent()) return;
          started = true;
          clearStartupTimeout();
          resetSilenceTimeout();
          if (callbacks.onStart) callbacks.onStart();
        });

        const subEnd = NativeSpeechRecognition.addListener('end', () => {
          if (!isCurrent()) return;
          activeNativeSession = null;
          finishing = true;
          clearSilenceTimeout();
          clearStartupTimeout();
          foregroundGuard?.dispose();
          foregroundGuard = null;
          if (!receivedTranscript && !receivedError) callbacks.onError?.(started ? 'NO_RESULT' : 'START_ENDED');
          if (callbacks.onEnd) callbacks.onEnd();
        });

        const subError = NativeSpeechRecognition.addListener('error', (err: any) => {
          if (!isCurrent()) return;
          console.warn('[STT] Speech recognition error event:', err);
          receivedError = true;
          finishing = true;
          clearSilenceTimeout();
          clearStartupTimeout();
          if (callbacks.onError) callbacks.onError(err);
        });

        const subVolume = NativeSpeechRecognition.addListener('volumechange', (evt: any) => {
          if (!isCurrent()) return;
          // Metering only extends the initial wait, before any words arrive.
          // Once text exists, wait for new words rather than background noise.
          if (started && !receivedTranscript && typeof evt?.value === 'number' && evt.value >= 3) resetSilenceTimeout();
          if (callbacks.onVolumeChange && typeof evt?.value === 'number') {
            callbacks.onVolumeChange(evt.value);
          }
        });

        subscriptions = [subResult, subStart, subEnd, subError, subVolume];

        activeNativeSession = session;
        startupTimeout = setTimeout(() => {
          if (!isCurrent() || started) return;
          this.stopListening();
          callbacks.onError?.('START_TIMEOUT');
          callbacks.onEnd?.();
        }, 10000);
        await NativeSpeechRecognition.start({
          lang: 'vi-VN', // Tiếng Việt
          interimResults: true,
          maxAlternatives: 1,
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
          androidIntentOptions: {
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
          },
          continuous: Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) >= 33),
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
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onstart = () => {
            if (!isCurrent()) return;
            resetSilenceTimeout();
            if (callbacks.onStart) callbacks.onStart();
          };
          recognition.onresult = (event: any) => {
            if (!isCurrent()) return;
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
              text += `${event.results[i][0].transcript} `;
            }
            reportTranscript(text);
          };
          recognition.onerror = (err: any) => {
            if (!isCurrent()) return;
            finishing = true;
            clearSilenceTimeout();
            receivedError = true;
            if (callbacks.onError) callbacks.onError(err);
          };
          recognition.onend = () => {
            if (!isCurrent()) return;
            webRecognitionInstance = null;
            finishing = true;
            clearSilenceTimeout();
            if (!receivedTranscript && !receivedError) callbacks.onError?.('NO_RESULT');
            if (callbacks.onEnd) callbacks.onEnd();
          };

          recognition.onspeechstart = () => {
            if (isCurrent() && !finishing && !receivedTranscript) clearSilenceTimeout();
          };
          recognition.onspeechend = () => {
            if (!receivedTranscript) resetSilenceTimeout();
          };
          recognition.start();
          webRecognitionInstance = recognition;
          return true;
        } catch (e) {
          console.warn('Web SpeechRecognition failed:', e);
        }
      }
    }

    callbacks.onError?.('UNAVAILABLE');
    return false;
  },

  // A user-requested stop must keep listeners alive for the final transcript.
  // Closing the modal instead calls stopListening() to discard late results.
  async finishListening(): Promise<void> {
    if (finishing) return;
    finishing = true;
    clearSilenceTimeout();
    if (Platform.OS === 'web') {
      webRecognitionInstance?.stop();
    } else {
      await NativeSpeechRecognition?.stop();
    }
  },

  stopListening(): void {
    recognitionSession += 1;
    finishing = true;
    clearSilenceTimeout();
    clearStartupTimeout();
    foregroundGuard?.dispose();
    foregroundGuard = null;
    const hadNativeSession = activeNativeSession !== null;
    activeNativeSession = null;
    subscriptions.forEach((sub) => {
      try {
        sub.remove();
      } catch {}
    });
    subscriptions = [];
    // Stopping an idle native recognizer can enqueue events that reach the
    // next session and make its microphone appear to stop immediately.
    if (hadNativeSession && NativeSpeechRecognition && NativeSpeechRecognition.stop) {
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
  },
};
