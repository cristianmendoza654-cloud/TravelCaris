import type {
  FlightLookupInput,
  FlightStatus,
  FlightStatusProvider,
  FlightStatusResult,
} from '../../src/domain/types';
import { normalizeFlightNumber } from '../../src/services/flightStatus';

type JsonRecord = Record<string, unknown>;

export class ManualFlightStatusProvider implements FlightStatusProvider {
  async getFlightStatus(): Promise<FlightStatusResult> {
    throw new Error(
      'La actualización automática no está configurada. Consulta la fuente oficial y registra los cambios manualmente.',
    );
  }
}

export class AeroDataBoxFlightStatusProvider implements FlightStatusProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getFlightStatus(input: FlightLookupInput): Promise<FlightStatusResult> {
    if (!this.apiKey) throw new Error('Falta AERODATABOX_API_KEY.');
    const number = encodeURIComponent(normalizeFlightNumber(input.flightNumber));
    const date = encodeURIComponent(input.date);
    const response = await fetchWithTimeout(
      this.fetcher,
      `https://api.aerodatabox.com/flights/number/${number}/${date}?dateLocalRole=Departure&withLocation=false&withAircraftImage=false`,
      { headers: { Accept: 'application/json', 'X-Api-Key': this.apiKey } },
    );
    if (!response.ok) throw new Error(`AeroDataBox respondió con ${response.status}.`);
    const flights = (await response.json()) as JsonRecord[];
    const selected = chooseFlight(flights, input);
    if (!selected) throw new Error('AeroDataBox no encontró el vuelo solicitado.');
    return normalizeAeroDataBox(selected);
  }
}

export class FlightAwareFlightStatusProvider implements FlightStatusProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getFlightStatus(input: FlightLookupInput): Promise<FlightStatusResult> {
    if (!this.apiKey) throw new Error('Falta FLIGHTAWARE_API_KEY.');
    const ident = encodeURIComponent(normalizeFlightNumber(input.flightNumber));
    const response = await fetchWithTimeout(
      this.fetcher,
      `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`,
      { headers: { Accept: 'application/json', 'x-apikey': this.apiKey } },
    );
    if (!response.ok) throw new Error(`FlightAware respondió con ${response.status}.`);
    const body = (await response.json()) as JsonRecord;
    const flights = Array.isArray(body.flights) ? (body.flights as JsonRecord[]) : [];
    const selected = chooseFlightAware(flights, input);
    if (!selected) throw new Error('FlightAware no encontró el vuelo solicitado.');
    return normalizeFlightAware(selected);
  }
}

export function createFlightStatusProvider(env: Record<string, string | undefined> = process.env) {
  const provider = (env.FLIGHT_STATUS_PROVIDER || 'manual').toLowerCase();
  if (provider === 'aerodatabox') return new AeroDataBoxFlightStatusProvider(env.AERODATABOX_API_KEY || '');
  if (provider === 'flightaware') return new FlightAwareFlightStatusProvider(env.FLIGHTAWARE_API_KEY || '');
  return new ManualFlightStatusProvider();
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit) {
  return fetcher(url, { ...init, signal: AbortSignal.timeout(8_000) });
}

function chooseFlight(flights: JsonRecord[], input: FlightLookupInput) {
  return (
    flights.find((flight) => {
      const departure = asRecord(flight.departure);
      const arrival = asRecord(flight.arrival);
      return airportCode(departure) === input.origin && airportCode(arrival) === input.destination;
    }) ?? flights[0]
  );
}

function chooseFlightAware(flights: JsonRecord[], input: FlightLookupInput) {
  return (
    flights.find((flight) => {
      const scheduled = String(flight.scheduled_out || flight.scheduled_off || '');
      const origin = asRecord(flight.origin);
      const destination = asRecord(flight.destination);
      return (
        scheduled.slice(0, 10) === input.date &&
        String(origin.code_iata || origin.code || '') === input.origin &&
        String(destination.code_iata || destination.code || '') === input.destination
      );
    }) ?? flights.find((flight) => String(flight.scheduled_out || flight.scheduled_off || '').slice(0, 10) === input.date)
  );
}

function normalizeAeroDataBox(flight: JsonRecord): FlightStatusResult {
  const departure = asRecord(flight.departure);
  const arrival = asRecord(flight.arrival);
  const aircraft = asRecord(flight.aircraft);
  return {
    status: mapStatus(String(flight.status || '')),
    estimatedDepartureTime: localTime(asRecord(departure.revisedTime).local),
    actualDepartureTime: localTime(asRecord(departure.actualTime).local),
    estimatedArrivalTime: localTime(asRecord(arrival.revisedTime).local),
    actualArrivalTime: localTime(asRecord(arrival.actualTime).local),
    departureTerminal: stringValue(departure.terminal),
    arrivalTerminal: stringValue(arrival.terminal),
    gate: stringValue(departure.gate),
    checkInCounter: stringValue(departure.checkInDesk),
    baggageBelt: stringValue(arrival.baggageBelt),
    delayMinutes: numberValue(departure.delay),
    arrivalAirport: stringValue(asRecord(arrival.airport).name),
    arrivalIata: airportCode(arrival),
    aircraftType: stringValue(aircraft.model),
    aircraftRegistration: stringValue(aircraft.reg),
    provider: 'AeroDataBox',
    checkedAt: new Date().toISOString(),
  };
}

function normalizeFlightAware(flight: JsonRecord): FlightStatusResult {
  const destination = asRecord(flight.destination);
  const scheduledOut = stringValue(flight.scheduled_out || flight.scheduled_off);
  const estimatedOut = stringValue(flight.estimated_out || flight.estimated_off);
  const actualOut = stringValue(flight.actual_out || flight.actual_off);
  const estimatedIn = stringValue(flight.estimated_in || flight.estimated_on);
  const actualIn = stringValue(flight.actual_in || flight.actual_on);
  const cancelled = Boolean(flight.cancelled);
  const diverted = Boolean(flight.diverted);
  const status = cancelled
    ? 'Cancelado'
    : diverted
      ? 'Desviado'
      : actualIn
        ? 'Aterrizado'
        : actualOut
          ? 'En vuelo'
          : mapStatus(stringValue(flight.status));
  return {
    status,
    estimatedDepartureTime: localTime(estimatedOut),
    actualDepartureTime: localTime(actualOut),
    estimatedArrivalTime: localTime(estimatedIn),
    actualArrivalTime: localTime(actualIn),
    departureTerminal: stringValue(flight.terminal_origin),
    arrivalTerminal: stringValue(flight.terminal_destination),
    gate: stringValue(flight.gate_origin),
    baggageBelt: stringValue(flight.baggage_claim),
    delayMinutes: minutesBetween(scheduledOut, estimatedOut || actualOut),
    arrivalAirport: stringValue(destination.name),
    arrivalIata: stringValue(destination.code_iata || destination.code),
    aircraftType: stringValue(flight.aircraft_type),
    aircraftRegistration: stringValue(flight.registration),
    provider: 'FlightAware',
    checkedAt: new Date().toISOString(),
  };
}

function mapStatus(value: string): FlightStatus {
  const status = value.toLowerCase();
  if (status.includes('cancel')) return 'Cancelado';
  if (status.includes('divert')) return 'Desviado';
  if (status.includes('land') || status.includes('arriv')) return 'Aterrizado';
  if (status.includes('en route') || status.includes('airborne') || status.includes('depart')) return 'En vuelo';
  if (status.includes('board')) return 'Embarque';
  if (status.includes('delay')) return 'Retrasado';
  if (status.includes('confirm')) return 'Confirmado';
  return 'Programado';
}

function airportCode(leg: JsonRecord) {
  const airport = asRecord(leg.airport);
  return stringValue(airport.iata || airport.code || leg.iata);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function localTime(value: unknown) {
  const text = stringValue(value);
  if (!text) return '';
  const match = text.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? text.slice(0, 5);
}

function minutesBetween(first: string, second: string) {
  if (!first || !second) return 0;
  const difference = new Date(second).getTime() - new Date(first).getTime();
  return Number.isFinite(difference) ? Math.max(0, Math.round(difference / 60_000)) : 0;
}
