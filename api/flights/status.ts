import type { FlightLookupInput } from '../../src/domain/types';
import { FlightStatusGateway } from '../../server/flight-status/gateway';
import { createFlightStatusProvider } from '../../server/flight-status/providers';

interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(value: unknown): void;
  setHeader(name: string, value: string): void;
}

const gateway = new FlightStatusGateway(createFlightStatusProvider());
const requests = new Map<string, { count: number; resetAt: number }>();

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'private, max-age=0, s-maxage=300');
  if (request.method === 'GET') {
    const provider = (process.env.FLIGHT_STATUS_PROVIDER || 'manual').toLowerCase();
    const configured =
      (provider === 'aerodatabox' && Boolean(process.env.AERODATABOX_API_KEY)) ||
      (provider === 'flightaware' && Boolean(process.env.FLIGHTAWARE_API_KEY));
    return response.status(200).json({ provider, configured, automaticUpdatesAvailable: configured });
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método no permitido.' });
  const clientId = clientIdentifier(request);
  if (!allowRequest(clientId)) return response.status(429).json({ error: 'Demasiadas consultas. Inténtalo más tarde.' });
  const input = validateInput(request.body);
  if (!input) return response.status(400).json({ error: 'Los datos de consulta no son válidos.' });

  try {
    const result = await gateway.get(input);
    return response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar el proveedor.';
    console.warn('flight_status_error', { provider: process.env.FLIGHT_STATUS_PROVIDER || 'manual', message });
    return response.status(503).json({ error: message });
  }
}

function validateInput(value: unknown): FlightLookupInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const flightNumber = clean(input.flightNumber, 10);
  const date = clean(input.date, 10);
  const origin = clean(input.origin, 3);
  const destination = clean(input.destination, 3);
  if (!/^[A-Z0-9 ]{3,10}$/i.test(flightNumber)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return null;
  return { flightNumber, date, origin, destination };
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clientIdentifier(request: ApiRequest) {
  const forwarded = request.headers?.['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value || request.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
}

function allowRequest(clientId: string) {
  const now = Date.now();
  const current = requests.get(clientId);
  if (!current || current.resetAt <= now) {
    requests.set(clientId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}
