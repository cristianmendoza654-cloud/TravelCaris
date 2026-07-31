import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeRateIsFresh, fetchLatestExchangeRate } from './exchangeRates';

afterEach(() => vi.unstubAllGlobals());

describe('exchange rates', () => {
  it('loads and validates the latest published rate without an API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: '2026-07-31', base: 'GBP', quote: 'EUR', rate: 1.1574 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLatestExchangeRate('gbp', 'eur');

    expect(result).toMatchObject({ base: 'GBP', quote: 'EUR', rate: 1.1574, date: '2026-07-31', source: 'Frankfurter' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.frankfurter.dev/v2/rate/GBP/EUR');
  });

  it('does not call the network when both currencies match', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchLatestExchangeRate('EUR', 'EUR')).rate).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(exchangeRateIsFresh(new Date().toISOString())).toBe(true);
  });
});
