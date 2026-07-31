import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  initialAccommodations,
  initialActivities,
  initialFlights,
  initialReminders,
  initialTransports,
  initialTrips,
} from '../domain/initialData';

describe('protección de claves', () => {
  it('no incluye nombres de claves privadas ni variables VITE_ en el cliente', () => {
    const clientFiles = [
      'src/services/flightStatus.ts',
      'src/ui/Flights.tsx',
      'public/sw.js',
      'public/manifest.webmanifest',
    ];
    const clientSource = clientFiles.map((file) => readFileSync(resolve(file), 'utf8')).join('\n');
    expect(clientSource).not.toContain('AERODATABOX_API_KEY');
    expect(clientSource).not.toContain('FLIGHTAWARE_API_KEY');
    expect(clientSource).not.toMatch(/VITE_.*API.*KEY/i);
  });

  it('publica un estado inicial vacío y sin un destino familiar', () => {
    expect(initialActivities).toEqual([]);
    expect(initialAccommodations).toEqual([]);
    expect(initialFlights).toEqual([]);
    expect(initialTransports).toEqual([]);
    expect(initialReminders).toEqual([]);
    expect(initialTrips[0].destination).toBe('Destino');
  });
});
