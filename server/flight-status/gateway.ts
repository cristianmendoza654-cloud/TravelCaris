import type { FlightLookupInput, FlightStatusProvider, FlightStatusResult } from '../../src/domain/types';

interface CacheEntry {
  expiresAt: number;
  value: FlightStatusResult;
}

export class FlightStatusGateway {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<FlightStatusResult>>();

  constructor(
    private readonly provider: FlightStatusProvider,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {}

  async get(input: FlightLookupInput) {
    const key = `${input.flightNumber}|${input.date}|${input.origin}|${input.destination}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.provider
      .getFlightStatus(input)
      .then((value) => {
        this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  clear() {
    this.cache.clear();
  }
}
