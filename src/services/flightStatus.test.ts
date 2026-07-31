import { describe, expect, it } from 'vitest';
import { initialFlights } from '../domain/initialData';
import type { FlightStatusResult } from '../domain/types';
import {
  detectFlightChanges,
  flightNumberVariants,
  isFlightDataStale,
  normalizeFlightNumber,
} from './flightStatus';

describe('normalización de números de vuelo', () => {
  it('normaliza VY8475', () => {
    expect(normalizeFlightNumber('VY8475')).toBe('VY8475');
    expect(flightNumberVariants('VY 8475')).toContain('VY8475');
  });

  it('normaliza las variantes de easyJet sin duplicar el vuelo', () => {
    expect(normalizeFlightNumber('U22315')).toBe('U22315');
    expect(normalizeFlightNumber('U2 2315')).toBe('U22315');
    expect(normalizeFlightNumber('EZY2315')).toBe('U22315');
    expect(flightNumberVariants('U22315')).toEqual(expect.arrayContaining(['U22315', 'U2 2315', 'EZY2315']));
  });
});

describe('detección de cambios de estado', () => {
  const flight = initialFlights[0];
  const result = (value: Partial<FlightStatusResult>): FlightStatusResult => ({
    provider: 'AeroDataBox',
    checkedAt: '2026-08-01T04:00:00.000Z',
    ...value,
  });

  it('detecta retraso, cancelación, puerta y terminal', () => {
    const changes = detectFlightChanges(
      flight,
      result({ delayMinutes: 25, status: 'Cancelado', gate: 'B32', arrivalTerminal: 'Norte' }),
    );
    expect(changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(['delayMinutes', 'status', 'gate', 'arrivalTerminal']),
    );
    expect(changes.find((change) => change.field === 'status')?.alertType).toBe('Urgente');
  });

  it('admite una respuesta sin terminal sin borrar el dato anterior', () => {
    const changes = detectFlightChanges(flight, result({ status: 'Confirmado' }));
    expect(changes.some((change) => change.field === 'arrivalTerminal')).toBe(false);
  });

  it('marca como caducados los datos ausentes o antiguos', () => {
    expect(isFlightDataStale(flight, new Date('2026-07-31T12:00:00Z'))).toBe(true);
    expect(
      isFlightDataStale(
        { ...flight, lastCheckedAt: '2026-08-01T02:00:00Z' },
        new Date('2026-08-01T04:00:00Z'),
      ),
    ).toBe(true);
  });
});
