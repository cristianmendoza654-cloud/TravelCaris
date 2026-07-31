import { describe, expect, it } from 'vitest';
import type { Reminder } from '../domain/types';
import { dueReminders, nextReminderDelay, reminderCalendarFile } from './reminders';

const reminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'recordatorio-1', tripId: 'viaje-1', title: 'Reservar museo', date: '2026-08-01', time: '10:30', notes: 'Llevar entradas', done: false, ...patch,
});

describe('scheduled reminders', () => {
  it('returns only due, unfinished and unnotified reminders', () => {
    const now = new Date('2026-08-01T10:31:00').getTime();
    expect(dueReminders([reminder(), reminder({ id: 'done', done: true }), reminder({ id: 'future', time: '11:00' })], now).map((item) => item.id)).toEqual(['recordatorio-1']);
    expect(nextReminderDelay([reminder({ time: '11:00' })], now)).toBe(29 * 60 * 1000);
  });

  it('creates an iCalendar event with an alarm at the selected time', () => {
    const calendar = reminderCalendarFile(reminder());
    expect(calendar).toContain('DTSTART:20260801T103000');
    expect(calendar).toContain('TRIGGER:PT0M');
    expect(calendar).toContain('SUMMARY:Reservar museo');
  });
});
