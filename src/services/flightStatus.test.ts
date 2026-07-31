import { describe, expect, it } from 'vitest';
import type { Flight, FlightStatusResult } from '../domain/types';
import {
  detectFlightChanges,
  flightNumberVariants,
  isFlightDataStale,
  normalizeFlightNumber,
} from './flightStatus';

describe('normalización de números de vuelo', () => {
  it('normaliza un número de vuelo genérico', () => {
    expect(normalizeFlightNumber('TC1234')).toBe('TC1234');
    expect(flightNumberVariants('TC 1234')).toContain('TC1234');
  });

  it('normaliza las variantes de easyJet sin duplicar el vuelo', () => {
    expect(normalizeFlightNumber('U21234')).toBe('U21234');
    expect(normalizeFlightNumber('U2 1234')).toBe('U21234');
    expect(normalizeFlightNumber('EZY1234')).toBe('U21234');
    expect(flightNumberVariants('U21234')).toEqual(expect.arrayContaining(['U21234', 'U2 1234', 'EZY1234']));
  });
});

describe('detección de cambios de estado', () => {
  const flight = {
    id: 'flight-test',
    flightNumber: 'TC1234',
    scheduledDate: '2027-09-03',
    scheduledDepartureTime: '08:00',
    status: 'Programado',
    delayMinutes: 0,
    departureTerminal: '',
    arrivalTerminal: '',
    gate: '',
    estimatedDepartureTime: '',
    estimatedArrivalTime: '',
    arrivalAirport: 'Destino',
    arrivalIata: 'DST',
    actualDepartureTime: '',
    actualArrivalTime: '',
    lastCheckedAt: '',
  } as Flight;
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
    expect(isFlightDataStale(flight, new Date('2027-09-03T07:00:00Z'))).toBe(true);
    expect(
      isFlightDataStale(
        { ...flight, lastCheckedAt: '2027-09-03T04:00:00Z' },
        new Date('2027-09-03T07:00:00Z'),
      ),
    ).toBe(true);
  });
});
