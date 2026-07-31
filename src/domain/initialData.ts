import type {
  Accommodation,
  Activity,
  AppSettings,
  Flight,
  PackingItem,
  Reminder,
  SearchProvider,
  Transport,
  Trip,
} from './types';

const now = new Date().toISOString();
const today = now.slice(0, 10);

export const legacyLondonTripId = 'trip-london-2026';
export const starterTripId = 'trip-starter';

export const initialTrips: Trip[] = [
  {
    id: starterTripId,
    name: 'Mi proximo viaje',
    destination: 'Destino',
    country: '',
    startDate: today,
    endDate: today,
    coverImage: '',
    description: '',
    currency: 'EUR',
    secondaryCurrency: 'EUR',
    exchangeRate: 1,
    travellers: [],
    status: 'Próximo',
    createdAt: now,
    updatedAt: now,
  },
];

export const initialActivities: Activity[] = [];
export const initialAccommodations: Accommodation[] = [];
export const initialTransports: Transport[] = [];
export const initialPackingItems: PackingItem[] = [];
export const initialReminders: Reminder[] = [];
export const initialFlights: Flight[] = [];

export const initialSettings: AppSettings = {
  id: 'settings',
  initialized: true,
  activeTripId: starterTripId,
  budgetGbp: 0,
  gbpToEur: 1,
  theme: 'system',
  flightProvider: 'manual',
  flightAutoUpdate: false,
  flightNotifications: false,
  flightDataSaver: true,
  flightWifiOnly: false,
  placeInfoStaleDays: 30,
};

export const initialSearchProviders: SearchProvider[] = [
  ['google-maps', 'Google Maps', 'google-maps', 'https://www.google.com/maps/search/?api=1&query={query}', true],
  ['apple-maps', 'Apple Maps', 'apple-maps', 'https://maps.apple.com/?q={query}', true],
  ['google', 'Google', 'google', 'https://www.google.com/search?q={query}', true],
  ['tripadvisor', 'Tripadvisor', 'tripadvisor', 'https://www.tripadvisor.es/Search?q={query}', true],
  ['civitatis', 'Civitatis', 'civitatis', 'https://www.google.com/search?q=site%3Acivitatis.com+{query}', false],
  ['guruwalk', 'GuruWalk', 'guruwalk', 'https://www.google.com/search?q=site%3Aguruwalk.com+{query}', false],
  ['getyourguide', 'GetYourGuide', 'getyourguide', 'https://www.google.com/search?q=site%3Agetyourguide.com+{query}', false],
  ['viator', 'Viator', 'viator', 'https://www.google.com/search?q=site%3Aviator.com+{query}', false],
  ['official', 'Web oficial', 'official', 'https://www.google.com/search?q={query}+sitio+oficial', false],
].map(([id, name, kind, urlTemplate, supportsStableSearchUrl], order) => ({
  id: String(id),
  name: String(name),
  kind: kind as SearchProvider['kind'],
  urlTemplate: String(urlTemplate),
  enabled: true,
  supportsStableSearchUrl: Boolean(supportsStableSearchUrl),
  order,
  createdAt: now,
  updatedAt: now,
}));
