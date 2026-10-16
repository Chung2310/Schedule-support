import { DatabaseService } from './database';
import { Meeting } from '../types/meeting';
import { AppSettings } from '../types/settings';

// Serialize reads followed by writes so a late alarm cannot undo acknowledgement
// or recreate a meeting that the user has just deleted.
let meetingMutationQueue: Promise<unknown> = Promise.resolve();
function mutateMeetings<T>(work: () => Promise<T>): Promise<T> {
  const task = meetingMutationQueue.then(work);
  meetingMutationQueue = task.catch(() => undefined);
  return task;
}

/**
 * StorageService hoạt động hoàn toàn bằng SQLite local trên máy khách
 * Không cần server ngoài, bảo mật và lưu trữ độc lập
 */
export const StorageService = {
  getSettings(): Promise<AppSettings> {
    return DatabaseService.getSettings();
  },

  saveSettings(settings: AppSettings): Promise<void> {
    return DatabaseService.saveSettings(settings);
  },

  getMeetings(): Promise<Meeting[]> {
    return DatabaseService.getMeetings();
  },

  saveMeetings(meetings: Meeting[]): Promise<void> {
    // Với SQLite, lưu thông qua add/update
    return Promise.resolve();
  },

  addMeeting(meeting: Meeting): Promise<Meeting[]> {
    return mutateMeetings(() => DatabaseService.addMeeting(meeting));
  },

  updateMeeting(updatedMeeting: Meeting): Promise<Meeting[]> {
    return mutateMeetings(async () => {
      const meetings = await DatabaseService.getMeetings();
      const current = meetings.find((meeting) => meeting.id === updatedMeeting.id);
      if (!current || (current.status === 'ACKNOWLEDGED' && updatedMeeting.status === 'REMINDING')) {
        return meetings;
      }
      return DatabaseService.updateMeeting(updatedMeeting);
    });
  },

  deleteMeeting(id: string): Promise<Meeting[]> {
    return mutateMeetings(() => DatabaseService.deleteMeeting(id));
  },
};
