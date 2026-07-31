import type { Reminder } from '../domain/types';

export function reminderTimestamp(reminder: Pick<Reminder, 'date' | 'time'>) {
  const timestamp = Date.parse(`${reminder.date}T${reminder.time || '09:00'}:00`);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function dueReminders(reminders: Reminder[], now = Date.now()) {
  return reminders
    .filter((reminder) => !reminder.done && !reminder.notifiedAt && reminderTimestamp(reminder) <= now)
    .sort((left, right) => reminderTimestamp(left) - reminderTimestamp(right));
}

export function nextReminderDelay(reminders: Reminder[], now = Date.now()) {
  const next = reminders
    .filter((reminder) => !reminder.done && !reminder.notifiedAt)
    .map(reminderTimestamp)
    .filter((timestamp) => timestamp > now)
    .sort((left, right) => left - right)[0];
  return next ? Math.min(next - now, 60 * 60 * 1000) : 60 * 60 * 1000;
}

export function reminderCalendarFile(reminder: Reminder) {
  const start = `${reminder.date.replace(/-/g, '')}T${reminder.time.replace(':', '') || '0900'}00`;
  const uid = `${reminder.id}@travelcaris.local`;
  const created = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TravelCaris//Recordatorios//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${created}`,
    `DTSTART:${start}`,
    `SUMMARY:${escapeIcs(reminder.title)}`,
    `DESCRIPTION:${escapeIcs(reminder.notes)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:${escapeIcs(reminder.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
