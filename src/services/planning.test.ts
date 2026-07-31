import { describe, expect, it } from 'vitest';
import { initialActivities } from '../domain/initialData';
import { findItineraryGaps } from './planning';

describe('itinerary gaps', () => {
  it('ignora alternativas y detecta huecos sin mover actividades', () => {
    const day = initialActivities.filter((item) => item.day === '2026-08-03');
    const before = day.map((item) => item.id);
    const gaps = findItineraryGaps(day, '09:00', '20:00', 60);
    expect(gaps.length).toBeGreaterThan(0);
    expect(day.map((item) => item.id)).toEqual(before);
    expect(day.some((item) => item.planType === 'Alternativa')).toBe(true);
  });
});
