import { describe, expect, it, vi } from 'vitest';
import type { FlightLookupInput, FlightStatusProvider } from '../../src/domain/types';
import { FlightStatusGateway } from './gateway';

const input: FlightLookupInput = {
  flightNumber: 'VY8475',
  date: '2026-08-01',
  origin: 'ALC',
  destination: 'LGW',
};

describe('FlightStatusGateway', () => {
  it('consulta un proveedor simulado y reutiliza la caché', async () => {
    const getFlightStatus = vi.fn().mockResolvedValue({
      status: 'Confirmado',
      provider: 'AeroDataBox',
      checkedAt: '2026-08-01T04:00:00.000Z',
    });
    const gateway = new FlightStatusGateway({ getFlightStatus } as FlightStatusProvider, 60_000);
    await gateway.get(input);
    await gateway.get(input);
    expect(getFlightStatus).toHaveBeenCalledTimes(1);
  });

  it('propaga el error del proveedor simulado sin almacenar una respuesta falsa', async () => {
    const getFlightStatus = vi.fn().mockRejectedValue(new Error('Proveedor no disponible'));
    const gateway = new FlightStatusGateway({ getFlightStatus } as FlightStatusProvider, 60_000);
    await expect(gateway.get(input)).rejects.toThrow('Proveedor no disponible');
    await expect(gateway.get(input)).rejects.toThrow('Proveedor no disponible');
    expect(getFlightStatus).toHaveBeenCalledTimes(2);
  });
});
