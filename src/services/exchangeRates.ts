const API_ROOT = 'https://api.frankfurter.dev/v2/rate';
const REQUEST_TIMEOUT_MS = 8_000;

export interface ExchangeRateResult {
  base: string;
  quote: string;
  rate: number;
  date: string;
  source: string;
  fetchedAt: string;
}

export async function fetchLatestExchangeRate(base: string, quote: string): Promise<ExchangeRateResult> {
  const normalizedBase = normalizeCurrency(base);
  const normalizedQuote = normalizeCurrency(quote);
  if (normalizedBase === normalizedQuote) {
    const now = new Date().toISOString();
    return { base: normalizedBase, quote: normalizedQuote, rate: 1, date: now.slice(0, 10), source: 'Identidad', fetchedAt: now };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_ROOT}/${normalizedBase}/${normalizedQuote}`, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('El servicio de cambio no está disponible.');
    const payload = await response.json() as { base?: string; quote?: string; rate?: number; date?: string };
    if (!Number.isFinite(payload.rate) || Number(payload.rate) <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date ?? '')) {
      throw new Error('El servicio devolvió un cambio no válido.');
    }
    return {
      base: normalizedBase,
      quote: normalizedQuote,
      rate: Number(payload.rate),
      date: payload.date!,
      source: 'Frankfurter',
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function exchangeRateIsFresh(updatedAt?: string, maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!updatedAt) return false;
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < maxAgeMs;
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Selecciona una moneda válida.');
  return currency;
}
