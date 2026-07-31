import { describe, expect, it } from 'vitest';
import { completeActivity, emptyWeeklyOpeningHours, isActivityStale } from './activity';
import { initialActivities } from './initialData';

describe('rich activity records', () => {
  it('mantiene siete días y varios intervalos en un horario semanal', () => {
    const hours = emptyWeeklyOpeningHours();
    hours.Lunes.intervals.push({ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' });
    expect(Object.keys(hours)).toHaveLength(7);
    expect(hours.Lunes.intervals).toHaveLength(2);
  });

  it('completa registros antiguos sin perder precio ni reserva', () => {
    const source = initialActivities[0];
    const legacy = { ...source, priceDetails: undefined, openingHours: undefined, reservationStatus: undefined } as unknown as typeof source;
    const completed = completeActivity(legacy);
    expect(completed.openingHours.Domingo.intervals).toEqual([]);
    expect(completed.reservationStatus).toBe('No necesaria');
    expect(completed.planType).toBe('Principal');
  });

  it('avisa cuando la verificación está pendiente o caducada', () => {
    expect(isActivityStale({ verificationStatus: 'Pendiente de verificar', lastVerifiedAt: '' }, 30)).toBe(true);
    expect(isActivityStale({ verificationStatus: 'Verificado', lastVerifiedAt: '2026-07-31' }, 30, new Date('2026-08-10'))).toBe(false);
    expect(isActivityStale({ verificationStatus: 'Verificado', lastVerifiedAt: '2026-01-01' }, 30, new Date('2026-08-10'))).toBe(true);
  });
});
