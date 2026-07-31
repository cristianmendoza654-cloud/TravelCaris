import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  applyFlightStatusResult,
  createFlight,
  getSnapshot,
  restoreInitialData,
  saveManualFlightChanges,
} from './storage';

describe('persistencia de estados de vuelo', () => {
  let outboundId = '';
  let returnId = '';

  beforeEach(async () => {
    await restoreInitialData();
    const outbound = await createFlight({
      airline: 'Aerolinea de prueba',
      flightNumber: 'TC1234',
      scheduledDate: '2027-09-03',
      scheduledDepartureTime: '08:00',
      departureAirport: 'Origen',
      arrivalAirport: 'Destino',
      officialTrackingUrl: 'https://example.com/flight',
      departureAirportUrl: 'https://example.com/origin',
      arrivalAirportUrl: 'https://example.com/destination',
    });
    const inbound = await createFlight({
      airline: 'Aerolinea de prueba',
      flightNumber: 'TC4321',
      scheduledDate: '2027-09-05',
      scheduledDepartureTime: '19:00',
    });
    outboundId = outbound.id;
    returnId = inbound.id;
  });

  it('crea historial y alerta al detectar un retraso', async () => {
    await applyFlightStatusResult(outboundId, {
      provider: 'AeroDataBox',
      checkedAt: '2027-09-03T06:00:00.000Z',
      status: 'Retrasado',
      delayMinutes: 25,
    });
    const snapshot = await getSnapshot();
    expect(snapshot.flightStatusHistory.some((entry) => entry.field === 'delayMinutes')).toBe(true);
    expect(snapshot.flightAlerts.some((alert) => alert.message.includes('25 minutos'))).toBe(true);
  });

  it('crea una alerta urgente al cancelar', async () => {
    await applyFlightStatusResult(returnId, {
      provider: 'FlightAware',
      checkedAt: '2027-09-05T12:00:00.000Z',
      status: 'Cancelado',
    });
    const alert = (await getSnapshot()).flightAlerts.find((item) => item.flightId === returnId);
    expect(alert?.type).toBe('Urgente');
  });

  it('protege una modificación manual y conserva el valor automático como conflicto', async () => {
    await saveManualFlightChanges(outboundId, { gate: 'A12' });
    await applyFlightStatusResult(outboundId, {
      provider: 'AeroDataBox',
      checkedAt: '2027-09-03T06:00:00.000Z',
      gate: 'B32',
    });
    const flight = await db.flights.get(outboundId);
    expect(flight?.gate).toBe('A12');
    expect(flight?.automaticConflicts.gate.value).toBe('B32');
    expect((await db.flightStatusHistory.where('flightId').equals(outboundId).toArray()).length).toBeGreaterThanOrEqual(2);
  });

  it('funciona en modo gratuito con vuelos editables y sin proveedor externo', async () => {
    const snapshot = await getSnapshot();
    expect(snapshot.settings.flightProvider).toBe('manual');
    expect(snapshot.flights.map((flight) => flight.flightNumber)).toEqual(['TC1234', 'TC4321']);
    await saveManualFlightChanges(outboundId, { status: 'Confirmado' });
    expect((await db.flights.get(outboundId))?.status).toBe('Confirmado');
    expect(snapshot.flights[0].officialTrackingUrl).toMatch(/^https:\/\//);
    expect(snapshot.flights[0].departureAirportUrl).toMatch(/^https:\/\//);
    expect(snapshot.flights[0].arrivalAirportUrl).toMatch(/^https:\/\//);
  });
});
