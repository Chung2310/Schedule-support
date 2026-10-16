interface ForegroundState {
  readonly currentState: string | null;
  addEventListener(event: 'change', callback: (state: string) => void): { remove(): void };
}

// Android can temporarily leave the foreground while displaying system permissions.
// No microphone is started until permission has resolved AND the app is active.
export function createSpeechForegroundGuard(appState: ForegroundState, onBackground: () => void) {
  let disposed = false;
  let ready = false;
  let resolveWait: ((active: boolean) => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settle = (active: boolean) => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    const resolve = resolveWait;
    resolveWait = undefined;
    resolve?.(active);
  };
  const subscription = appState.addEventListener('change', (state) => {
    if (disposed) return;
    if (state === 'active' && resolveWait) {
      ready = true;
      settle(true);
    } else if (state === 'background' && ready) {
      onBackground();
    }
  });
  return {
    waitUntilActive(): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (appState.currentState === 'active') {
        ready = true;
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        resolveWait = resolve;
        timeout = setTimeout(() => settle(false), 10000);
      });
    },
    dispose() {
      disposed = true;
      subscription.remove();
      settle(false);
    },
  };
}
