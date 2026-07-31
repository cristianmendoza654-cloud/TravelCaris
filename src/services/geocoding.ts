import type { PdfImportDraft } from './pdfImport';

interface GeocodingOptions {
  fetcher?: typeof fetch;
  delayMs?: number;
  maxRequests?: number;
  onProgress?: (current: number, total: number, label: string) => void;
}

interface GeocodingResult {
  draft: PdfImportDraft;
  located: number;
  unresolved: number;
  attempted: number;
}

interface SearchResult {
  lat?: string;
  lon?: string;
}

export async function geocodePdfDraft(draft: PdfImportDraft, options: GeocodingOptions = {}): Promise<GeocodingResult> {
  const fetcher = options.fetcher ?? fetch;
  const delayMs = options.delayMs ?? 1_100;
  const maxRequests = options.maxRequests ?? 25;
  const activities = draft.activities.map((item) => ({ ...item }));
  const accommodations = draft.accommodations.map((item) => ({ ...item }));
  const targets = [
    ...accommodations.map((item) => ({ item, label: item.name, query: placeQuery(item.address, item.name, draft) })),
    ...activities
      .filter(isGeocodableActivity)
      .map((item) => ({ item, label: item.title, query: placeQuery(item.address, item.title, draft) })),
  ].filter(({ item, query }) => !hasCoordinates(item.lat, item.lng) && Boolean(query));

  const cache = new Map<string, { lat: number; lng: number } | null>();
  let located = 0;
  let attempted = 0;
  let lastRequestAt = 0;

  for (const [index, target] of targets.entries()) {
    if (attempted >= maxRequests) break;
    options.onProgress?.(index + 1, targets.length, target.label);
    const key = target.query.toLocaleLowerCase('es');
    let coordinates = cache.get(key);
    if (coordinates === undefined) {
      const elapsed = Date.now() - lastRequestAt;
      if (lastRequestAt && elapsed < delayMs) await wait(delayMs - elapsed);
      attempted += 1;
      coordinates = await searchCoordinates(target.query, fetcher);
      lastRequestAt = Date.now();
      cache.set(key, coordinates);
    }
    if (coordinates) {
      target.item.lat = coordinates.lat;
      target.item.lng = coordinates.lng;
      located += 1;
    }
  }

  return {
    draft: { ...draft, activities, accommodations },
    located,
    unresolved: targets.length - located,
    attempted,
  };
}

function isGeocodableActivity(activity: PdfImportDraft['activities'][number]) {
  if (['Transporte', 'Aeropuerto'].includes(activity.category ?? '')) return false;
  if (/^(?:desayuno|comida|cena|equipaje|preparar|recoger|salida|llegada|traslado|vuelo|decisi[oó]n|seg[uú]n horario|revisar|llamar|reservar)\b/i.test(activity.title.trim())) return false;
  return Boolean(activity.address?.trim() || activity.title.trim());
}

function placeQuery(address: string | undefined, name: string, draft: PdfImportDraft) {
  return [address?.trim() || name.trim(), draft.trip.destination.trim(), draft.trip.country.trim()]
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((candidate) => candidate.toLocaleLowerCase('es') === value.toLocaleLowerCase('es')) === index)
    .join(', ');
}

async function searchCoordinates(query: string, fetcher: typeof fetch) {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
  try {
    const response = await fetcher(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'es' },
    });
    if (!response.ok) return null;
    const [result] = await response.json() as SearchResult[];
    const lat = Number(result?.lat);
    const lng = Number(result?.lon);
    return hasCoordinates(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function hasCoordinates(lat?: number, lng?: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat!) <= 90 && Math.abs(lng!) <= 180;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
