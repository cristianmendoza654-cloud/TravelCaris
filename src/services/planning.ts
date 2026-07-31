import type { Activity } from '../domain/types';

const minutes = (time: string) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export interface ItineraryGap {
  start: string;
  end: string;
  minutes: number;
}

export function findItineraryGaps(
  activities: Activity[],
  dayStart = '09:00',
  dayEnd = '20:00',
  minimumMinutes = 90,
): ItineraryGap[] {
  const principal = activities
    .filter((item) => item.planType !== 'Alternativa' && item.startTime)
    .map((item) => ({
      start: minutes(item.startTime),
      end: item.endTime ? minutes(item.endTime) : minutes(item.startTime) + item.estimatedDurationMinutes,
    }))
    .sort((a, b) => a.start - b.start);
  const gaps: ItineraryGap[] = [];
  let cursor = minutes(dayStart);
  for (const item of principal) {
    if (item.start - cursor >= minimumMinutes) gaps.push({ start: clock(cursor), end: clock(item.start), minutes: item.start - cursor });
    cursor = Math.max(cursor, item.end);
  }
  const end = minutes(dayEnd);
  if (end - cursor >= minimumMinutes) gaps.push({ start: clock(cursor), end: clock(end), minutes: end - cursor });
  return gaps;
}
