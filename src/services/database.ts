import * as SQLite from 'expo-sqlite';
import { Meeting } from '../types/meeting';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';

const DB_NAME = 'ceo_calendar.db';

class DatabaseServiceImpl {
  private dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  private async getDB(): Promise<SQLite.SQLiteDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = SQLite.openDatabaseAsync(DB_NAME)
        .then(async (db) => {
          await this.initTables(db);
          return db;
        })
        .catch((error) => {
          this.dbPromise = null;
          throw error;
        });
    }
    return this.dbPromise;
  }

  private async initTables(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        meetingTime TEXT NOT NULL,
        advanceNoticeMinutes INTEGER NOT NULL,
        repeatIntervalMinutes INTEGER NOT NULL,
        firstReminderTime TEXT NOT NULL,
        status TEXT NOT NULL,
        acknowledgedAt TEXT,
        nagCount INTEGER NOT NULL DEFAULT 0,
        voiceText TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

  }

  private async insertMeetingInternal(db: SQLite.SQLiteDatabase, m: Meeting): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO meetings (
        id, title, meetingTime, advanceNoticeMinutes, repeatIntervalMinutes,
        firstReminderTime, status, acknowledgedAt, nagCount, voiceText, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        m.id,
        m.title,
        m.meetingTime,
        m.advanceNoticeMinutes,
        m.repeatIntervalMinutes,
        m.firstReminderTime,
        m.status,
        m.acknowledgedAt || null,
        m.nagCount || 0,
        m.voiceText,
        m.createdAt,
      ]
    );
  }

  async getMeetings(): Promise<Meeting[]> {
    try {
      const db = await this.getDB();
      const rows = await db.getAllAsync<any>(
        'SELECT * FROM meetings ORDER BY datetime(meetingTime) ASC;'
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        meetingTime: r.meetingTime,
        advanceNoticeMinutes: Number(r.advanceNoticeMinutes),
        repeatIntervalMinutes: Number(r.repeatIntervalMinutes),
        firstReminderTime: r.firstReminderTime,
        status: r.status,
        acknowledgedAt: r.acknowledgedAt || undefined,
        nagCount: Number(r.nagCount || 0),
        voiceText: r.voiceText,
        createdAt: r.createdAt,
      }));
    } catch (e) {
      console.warn('SQLite getMeetings error:', e);
      throw e;
    }
  }

  async addMeeting(meeting: Meeting): Promise<Meeting[]> {
    try {
      const db = await this.getDB();
      await this.insertMeetingInternal(db, meeting);
    } catch (e) {
      console.error('SQLite addMeeting error:', e);
      throw e;
    }
    return this.getMeetings();
  }

  async updateMeeting(meeting: Meeting): Promise<Meeting[]> {
    try {
      const db = await this.getDB();
      await this.insertMeetingInternal(db, meeting);
    } catch (e) {
      console.error('SQLite updateMeeting error:', e);
      throw e;
    }
    return this.getMeetings();
  }

  async deleteMeeting(id: string): Promise<Meeting[]> {
    try {
      const db = await this.getDB();
      await db.runAsync('DELETE FROM meetings WHERE id = ?;', [id]);
    } catch (e) {
      console.error('SQLite deleteMeeting error:', e);
      throw e;
    }
    return this.getMeetings();
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const db = await this.getDB();
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?;',
        ['settings']
      );
      if (row && row.value) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
      }
    } catch (e) {
      console.warn('SQLite getSettings error:', e);
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      const db = await this.getDB();
      await db.runAsync(
        'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);',
        ['settings', JSON.stringify(settings)]
      );
    } catch (e) {
      console.error('SQLite saveSettings error:', e);
      throw e;
    }
  }
}

export const DatabaseService = new DatabaseServiceImpl();
