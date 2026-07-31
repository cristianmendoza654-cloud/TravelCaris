import { describe, expect, it } from 'vitest';
import { initialTrips } from '../domain/initialData';
import { travelReadiness } from './readiness';

describe('preparación del viaje', () => {
  it('adapta los pasos a un viaje de varios días con vuelo', () => {
    const result = travelReadiness({
      trip: { ...initialTrips[0], destination: 'Roma', country: 'Italia', travellers: ['2 adultos'], startDate: '2027-09-03', endDate: '2027-09-05' },
      activities: [],
      accommodations: [],
      flights: [{ id: 'flight' } as never],
      documents: [],
      packingItems: [],
    });
    expect(result.steps.map((step) => step.id)).toEqual(['profile', 'itinerary', 'accommodation', 'packing', 'documents']);
    expect(result.completed).toBe(1);
    expect(result.percentage).toBe(20);
  });

  it('considera preparado el equipaje cuando todos sus elementos están marcados', () => {
    const result = travelReadiness({
      trip: { ...initialTrips[0], destination: 'Roma', country: 'Italia', travellers: ['Familia'], startDate: '2027-09-03', endDate: '2027-09-04' },
      activities: [{ planType: 'Principal', reservationRequired: false, reservationStatus: 'No necesaria' } as never],
      accommodations: [{ id: 'hotel' } as never],
      flights: [],
      documents: [],
      packingItems: [{ done: true } as never],
    });
    expect(result.steps.find((step) => step.id === 'packing')?.done).toBe(true);
    expect(result.percentage).toBe(100);
  });

  it('permite validar manualmente un paso aunque la aplicación no pueda detectarlo', () => {
    const result = travelReadiness({
      trip: { ...initialTrips[0], readinessOverrides: ['profile'] },
      activities: [],
      accommodations: [],
      flights: [],
      documents: [],
      packingItems: [],
    });
    expect(result.steps.find((step) => step.id === 'profile')).toMatchObject({ done: true, naturallyDone: false, manuallyReviewed: true });
  });
});
