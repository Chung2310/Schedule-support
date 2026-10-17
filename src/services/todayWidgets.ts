import { Platform } from 'react-native';
import type { Meeting } from '../types/meeting';
import { buildTodayWidgetTimeline } from '../utils/todayWidget';

let revision = 0;
let widgetModule: Promise<typeof import('../widgets/TodayScheduleWidget')> | undefined;
let warnedUnavailable = false;

export const TodayWidgets = {
  async sync(meetings: Meeting[]): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    const currentRevision = ++revision;
    try {
      // Native module is absent in Expo Go. Never prevent calendar use there.
      widgetModule ??= import('../widgets/TodayScheduleWidget');
      const { default: widget } = await widgetModule;
      if (currentRevision !== revision) return false;
      widget.updateTimeline(buildTodayWidgetTimeline(meetings));
      return true;
    } catch (error) {
      widgetModule = undefined;
      if (!warnedUnavailable) {
        console.warn('Today widget could not be updated; an iOS build with widget support is required.', error);
        warnedUnavailable = true;
      }
      return false;
    }
  },
};
