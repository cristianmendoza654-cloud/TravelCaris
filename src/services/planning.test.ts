import { describe, expect, it } from 'vitest';
import type { Activity } from '../domain/types';
import { findItineraryGaps } from './planning';

describe('itinerary gaps', () => {
  it('ignora alternativas y detecta huecos sin mover actividades', () => {
    const day = [
      { id: 'morning', startTime: '09:30', endTime: '10:30', estimatedDurationMinutes: 60, planType: 'Principal' },
      { id: 'afternoon', startTime: '15:00', endTime: '', estimatedDurationMinutes: 90, planType: 'Principal' },
      { id: 'alternative', startTime: '12:00', endTime: '', estimatedDurationMinutes: 60, planType: 'Alternativa' },
    ] as Activity[];
    const before = day.map((item) => item.id);
    const gaps = findItineraryGaps(day, '09:00', '20:00', 60);
    expect(gaps.length).toBeGreaterThan(0);
    expect(day.map((item) => item.id)).toEqual(before);
    expect(day.some((item) => item.planType === 'Alternativa')).toBe(true);
  });
});
