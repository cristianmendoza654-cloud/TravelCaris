export type TripDay = string;

export const currencyCodes = [
  'EUR', 'GBP', 'USD', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
  'HUF', 'TRY', 'AED', 'CNY', 'HKD', 'SGD', 'THB', 'MAD', 'MXN', 'BRL', 'INR', 'KRW', 'ZAR', 'ISK',
] as const;
export type CurrencyCode = (typeof currencyCodes)[number];

export const tripStatuses = ['Próximo', 'En curso', 'Finalizado', 'Archivado'] as const;
export type TripStatus = (typeof tripStatuses)[number];

export interface Trip {
  id: string;
  name: string;
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  coverImage: string;
  coverImageAttribution?: string;
  coverImageSourceUrl?: string;
  description: string;
  currency: 'GBP' | 'EUR' | string;
  secondaryCurrency: 'GBP' | 'EUR' | string;
  exchangeRate: number;
  exchangeRateDate?: string;
  exchangeRateUpdatedAt?: string;
  exchangeRateSource?: string;
  budget: number;
  travellers: string[];
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
}

export const categories = [
  'Monumento',
  'Museo',
  'Restaurante',
  'Cafetería',
  'Parque',
  'Tienda',
  'Transporte',
  'Alojamiento',
  'Aeropuerto',
  'Actividad infantil',
  'Reserva',
  'Mercado',
  'Paseo',
  'Tour',
  'Free tour',
  'Ocio',
  'Espectáculo',
  'Experiencia',
  'Emergencia',
  'Otros',
] as const;

export type Category = (typeof categories)[number];

export const statuses = [
  'Pendiente',
  'Confirmado',
  'Reservado',
  'En curso',
  'Realizado',
  'Cancelado',
  'Alternativa',
] as const;

export type ActivityStatus = (typeof statuses)[number];

export interface StoredImage {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
  sourceUrl?: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  automatic?: boolean;
}

export const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export type Weekday = (typeof weekdays)[number];

export interface OpeningInterval {
  open: string;
  close: string;
}

export interface DayOpeningHours {
  closed: boolean;
  allDay: boolean;
  intervals: OpeningInterval[];
  note: string;
}

export type WeeklyOpeningHours = Record<Weekday, DayOpeningHours>;

export type PriceKind = 'Gratis' | 'Precio fijo' | 'Desde' | 'Aproximado' | 'Donativo' | 'Desconocido';

export interface PriceDetails {
  kind: PriceKind;
  adult: number;
  child: number;
  baby: number;
  family: number;
  totalEstimate: number;
  currency: string;
  unit: 'persona' | 'familia' | 'actividad';
  note: string;
}

export type ReservationStatus = 'No necesaria' | 'Recomendada' | 'Necesaria' | 'Pendiente' | 'Reservada' | 'No disponible';
export type VerificationStatus = 'Verificado' | 'Pendiente de verificar' | 'Fuente no oficial';
export type PlanType = 'Principal' | 'Alternativa';
export type PlaceEnvironment = 'Interior' | 'Exterior' | 'Mixto' | 'Sin indicar';

export interface Activity {
  id: string;
  tripId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  estimatedDurationMinutes: number;
  category: Category;
  address: string;
  lat?: number;
  lng?: number;
  mainImage?: string;
  gallery: StoredImage[];
  adultPrice: number;
  childPrice: number;
  estimatedTotalPrice: number;
  currency: string;
  reservationRequired: boolean;
  reservationDone: boolean;
  reservationReference: string;
  reservationLink: string;
  officialLink: string;
  phone: string;
  notes: string;
  status: ActivityStatus;
  priority: 'Baja' | 'Media' | 'Alta' | 'Premium';
  tags: string[];
  day: TripDay;
  order: number;
  visited: boolean;
  favorite: boolean;
  planType: PlanType;
  openingHours: WeeklyOpeningHours;
  specialHours: string;
  openingHoursNote: string;
  priceDetails: PriceDetails;
  reservationStatus: ReservationStatus;
  bookingDeadline: string;
  cancellationPolicy: string;
  meetingPoint: string;
  accessibility: string;
  strollerFriendly: boolean;
  familyFriendly: boolean;
  minimumAge: string;
  rainPlan: string;
  environment: PlaceEnvironment;
  documents: string[];
  sourceName: string;
  sourceUrl: string;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string;
  verificationNote: string;
  tourProvider: string;
  tourLanguage: string;
  tourType: string;
  tipGuidance: string;
  restaurantCuisine: string;
  mealType: string;
  dietaryOptions: string;
  bookingPlatform: string;
  leisureType: string;
  showTime: string;
  venue: string;
  createdAt: string;
  updatedAt: string;
}

export const exploreContextKinds = [
  'Ciudad completa',
  'Ubicación actual',
  'Alojamiento activo',
  'Actividad del itinerario',
  'Dirección escrita',
  'Marcador del mapa',
  'Zona del destino',
] as const;
export type ExploreContextKind = (typeof exploreContextKinds)[number];

export interface ExploreContext {
  kind: ExploreContextKind;
  label: string;
  query: string;
  lat?: number;
  lng?: number;
  activityId?: string;
}

export type SearchProviderKind =
  | 'google-maps'
  | 'apple-maps'
  | 'google'
  | 'tripadvisor'
  | 'civitatis'
  | 'guruwalk'
  | 'getyourguide'
  | 'viator'
  | 'official'
  | 'custom';

export interface SearchProvider {
  id: string;
  name: string;
  kind: SearchProviderKind;
  urlTemplate: string;
  enabled: boolean;
  supportsStableSearchUrl: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHistoryEntry {
  id: string;
  tripId: string;
  query: string;
  context: ExploreContext;
  providerId: string;
  createdAt: string;
}

export interface SavedPlace {
  id: string;
  tripId: string;
  name: string;
  address: string;
  category: Category;
  sourceLink: string;
  image?: string;
  notes: string;
  favorite: boolean;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Accommodation {
  id: string;
  tripId: string;
  name: string;
  address: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  startDate: string;
  endDate: string;
  entryInstructions: string;
  luggageNotes: string;
  notes: string;
  lat?: number;
  lng?: number;
  images: StoredImage[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transport {
  id: string;
  tripId: string;
  type: 'Vuelo' | 'Tren' | 'Autobús' | 'Taxi' | 'Barco' | 'Traslado aeropuerto';
  origin: string;
  destination: string;
  date: string;
  time: string;
  company: string;
  serviceNumber: string;
  terminal: string;
  bookingCode: string;
  luggage: string;
  notes: string;
  documentId?: string;
  status: ActivityStatus;
  reminder: string;
}

export interface TravelDocument {
  id: string;
  tripId: string;
  title: string;
  type: 'Billete' | 'Confirmación' | 'Seguro' | 'ETA' | 'Museo' | 'Free tour' | 'Alojamiento' | 'Otro';
  date: string;
  notes: string;
  important: boolean;
  activityId?: string;
  fileName?: string;
  fileType?: string;
  dataUrl?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  tripId: string;
  concept: string;
  category: 'Transporte' | 'Comida' | 'Entradas' | 'Compras' | 'Alojamiento' | 'Otros';
  date: string;
  amount: number;
  currency: string;
  paidBy: string;
  paymentMethod: string;
  activityId?: string;
  notes: string;
}

export interface PackingItem {
  id: string;
  tripId: string;
  list: 'Equipaje' | 'Documentación' | 'Medicamentos' | 'Bebé' | 'Niños' | 'Tecnología' | 'Antes de salir' | 'Durante el viaje';
  title: string;
  done: boolean;
  person: string;
  quantity: number;
  notes: string;
  order: number;
}

export interface Reminder {
  id: string;
  tripId: string;
  title: string;
  date: string;
  time: string;
  notes: string;
  done: boolean;
  notifiedAt?: string;
}

export interface AppSettings {
  id: 'settings';
  initialized: boolean;
  activeTripId: string;
  budgetGbp: number;
  gbpToEur: number;
  theme: 'system' | 'light' | 'dark';
  flightProvider: 'manual' | 'aerodatabox' | 'flightaware';
  flightAutoUpdate: boolean;
  flightNotifications: boolean;
  flightDataSaver: boolean;
  flightWifiOnly: boolean;
  placeInfoStaleDays: number;
  lastFlightQueryAt?: string;
}

export const flightStatuses = [
  'Programado',
  'Confirmado',
  'Facturación abierta',
  'Embarque',
  'Puerta cerrada',
  'Retrasado',
  'Cancelado',
  'Desviado',
  'En vuelo',
  'Aterrizado',
  'Finalizado',
  'Estado desconocido',
] as const;

export type FlightStatus = (typeof flightStatuses)[number];
export type FlightDataSource = 'Usuario' | 'Manual' | 'AeroDataBox' | 'FlightAware' | 'Desconocido';

export interface Flight {
  id: string;
  tripId: string;
  airline: string;
  airlineIata: string;
  flightNumber: string;
  normalizedFlightNumber: string;
  lookupVariants: string[];
  scheduledDate: string;
  departureAirport: string;
  departureIata: string;
  arrivalAirport: string;
  arrivalIata: string;
  scheduledDepartureTime: string;
  estimatedDepartureTime: string;
  actualDepartureTime: string;
  scheduledArrivalTime: string;
  estimatedArrivalTime: string;
  actualArrivalTime: string;
  departureTerminal: string;
  arrivalTerminal: string;
  gate: string;
  checkInCounter: string;
  baggageBelt: string;
  status: FlightStatus;
  delayMinutes: number;
  aircraftType: string;
  aircraftRegistration: string;
  bookingReference: string;
  ticketNumber: string;
  includedBaggage: string;
  notes: string;
  officialTrackingUrl: string;
  departureAirportUrl: string;
  arrivalAirportUrl: string;
  lastStatusProvider: FlightDataSource;
  lastUpdatedAt: string;
  lastCheckedAt: string;
  lastUpdateError: string;
  autoUpdateEnabled: boolean;
  alertsEnabled: boolean;
  manualFields: Record<string, string>;
  automaticConflicts: Record<string, { value: string; source: FlightDataSource; detectedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface FlightStatusHistory {
  id: string;
  flightId: string;
  detectedAt: string;
  field: string;
  previousValue: string;
  newValue: string;
  source: FlightDataSource;
  important: boolean;
}

export const alertTypes = ['Información', 'Atención', 'Importante', 'Urgente'] as const;
export type AlertType = (typeof alertTypes)[number];

export interface FlightAlert {
  id: string;
  tripId: string;
  flightId: string;
  createdAt: string;
  type: AlertType;
  message: string;
  read: boolean;
  source: FlightDataSource;
  recommendedAction: string;
}

export interface FlightLookupInput {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
}

export interface FlightStatusResult {
  status?: FlightStatus;
  estimatedDepartureTime?: string;
  actualDepartureTime?: string;
  estimatedArrivalTime?: string;
  actualArrivalTime?: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  gate?: string;
  checkInCounter?: string;
  baggageBelt?: string;
  delayMinutes?: number;
  arrivalAirport?: string;
  arrivalIata?: string;
  aircraftType?: string;
  aircraftRegistration?: string;
  provider: FlightDataSource;
  checkedAt: string;
}

export interface FlightStatusProvider {
  getFlightStatus(input: FlightLookupInput): Promise<FlightStatusResult>;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  trips: Trip[];
  activities: Activity[];
  accommodations: Accommodation[];
  transports: Transport[];
  documents: TravelDocument[];
  expenses: Expense[];
  packingItems: PackingItem[];
  reminders: Reminder[];
  flights: Flight[];
  flightStatusHistory: FlightStatusHistory[];
  flightAlerts: FlightAlert[];
  searchProviders: SearchProvider[];
  searchHistory: SearchHistoryEntry[];
  savedPlaces: SavedPlace[];
  settings: AppSettings;
}
