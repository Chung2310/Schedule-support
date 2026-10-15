import { DatabaseService } from './database';
import { Meeting } from '../types/meeting';
import { AppSettings } from '../types/settings';

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
    return DatabaseService.addMeeting(meeting);
  },

  updateMeeting(updatedMeeting: Meeting): Promise<Meeting[]> {
    return DatabaseService.updateMeeting(updatedMeeting);
  },

  deleteMeeting(id: string): Promise<Meeting[]> {
    return DatabaseService.deleteMeeting(id);
  },
};
