export const tripDays = [
  '2026-08-01',
  '2026-08-02',
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
] as const;

export type TripDay = string;

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
  description: string;
  currency: 'GBP' | 'EUR' | string;
  secondaryCurrency: 'GBP' | 'EUR' | string;
  exchangeRate: number;
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
}

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
  currency: 'GBP' | 'EUR';
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
  currency: 'GBP' | 'EUR';
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
  settings: AppSettings;
}
