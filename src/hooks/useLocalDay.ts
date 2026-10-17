import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { formatDateKey } from '../utils/dateUtils';

function readLocalTime() {
  const now = new Date();
  return {
    key: formatDateKey(now),
    offset: now.getTimezoneOffset(),
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    now,
  };
}

/** Refresh the local calendar day without depending on database/network activity. */
function useLocalClock(updateEveryMinute: boolean) {
  const [day, setDay] = useState(readLocalTime);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const refresh = () => {
      stop();
      if (disposed) return;
      const next = readLocalTime();
      setDay((previous) => previous.key === next.key && previous.offset === next.offset &&
        (!updateEveryMinute || Math.floor(previous.now.getTime() / 60_000) === Math.floor(next.now.getTime() / 60_000))
        ? previous : next);

      if (AppState.currentState === 'active' || AppState.currentState == null) {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        // Midnight promptly; recheck at most once a minute for manual clock/timezone changes.
        const nextMinute = 60_000 - now.getTime() % 60_000 + 50;
        const delay = Math.max(100, Math.min(nextMinute, midnight.getTime() - now.getTime() + 50));
        timer = setTimeout(refresh, delay);
      }
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
      else stop();
    });
    refresh();
    return () => {
      disposed = true;
      stop();
      subscription.remove();
    };
  }, [updateEveryMinute]);

  return day;
}

export function useLocalDay(): Date {
  return useLocalClock(false).today;
}

export function useCurrentMinute(): Date {
  return useLocalClock(true).now;
}
