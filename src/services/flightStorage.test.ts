import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  applyFlightStatusResult,
  getSnapshot,
  restoreInitialData,
  saveManualFlightChanges,
} from './storage';

describe('persistencia de estados de vuelo', () => {
  beforeEach(async () => {
    await restoreInitialData();
  });

  it('crea historial y alerta al detectar un retraso', async () => {
    await applyFlightStatusResult('flight-vy8475-2026-08-01', {
      provider: 'AeroDataBox',
      checkedAt: '2026-08-01T04:00:00.000Z',
      status: 'Retrasado',
      delayMinutes: 25,
    });
    const snapshot = await getSnapshot();
    expect(snapshot.flightStatusHistory.some((entry) => entry.field === 'delayMinutes')).toBe(true);
    expect(snapshot.flightAlerts.some((alert) => alert.message.includes('25 minutos'))).toBe(true);
  });

  it('crea una alerta urgente al cancelar', async () => {
    await applyFlightStatusResult('flight-u22315-2026-08-05', {
      provider: 'FlightAware',
      checkedAt: '2026-08-05T12:00:00.000Z',
      status: 'Cancelado',
    });
    const alert = (await getSnapshot()).flightAlerts.find((item) => item.flightId === 'flight-u22315-2026-08-05');
    expect(alert?.type).toBe('Urgente');
  });

  it('protege una modificación manual y conserva el valor automático como conflicto', async () => {
    const id = 'flight-vy8475-2026-08-01';
    await saveManualFlightChanges(id, { gate: 'A12' });
    await applyFlightStatusResult(id, {
      provider: 'AeroDataBox',
      checkedAt: '2026-08-01T04:00:00.000Z',
      gate: 'B32',
    });
    const flight = await db.flights.get(id);
    expect(flight?.gate).toBe('A12');
    expect(flight?.automaticConflicts.gate.value).toBe('B32');
    expect((await db.flightStatusHistory.where('flightId').equals(id).toArray()).length).toBeGreaterThanOrEqual(2);
  });

  it('funciona en modo gratuito con vuelos editables y sin proveedor externo', async () => {
    const snapshot = await getSnapshot();
    expect(snapshot.settings.flightProvider).toBe('manual');
    expect(snapshot.flights.map((flight) => flight.flightNumber)).toEqual(['VY8475', 'U22315']);
    await saveManualFlightChanges(snapshot.flights[0].id, { status: 'Confirmado' });
    expect((await db.flights.get(snapshot.flights[0].id))?.status).toBe('Confirmado');
  });
});
